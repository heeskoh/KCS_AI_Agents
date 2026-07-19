"""Agent: 주소확인 — 주소를 번지 단위로 분해해 건축물대장 주용도로 개인주소/사업장을 판별한다.

판정 우선순위 (설정된 키에 따라 자동 선택)
------------------------------------------------
방식 A. 건축물대장 조회 (JUSO_KEY + DATA_KEY)  ★가장 정확
   ① 행안부 도로명주소 API → admCd(법정동코드 10자리)·번지(lnbrMnnm/lnbrSlno)·mtYn·bdKdcd
      - bdKdcd == "1"(공동주택)이면 그 자체로 주거(아파트·연립·다세대) 조기 판정
   ② 국토부 건축HUB 건축물대장 표제부 API → mainPurpsCdNm(주용도코드명)
   ③ 주용도코드명 룰 매핑 → 가정집 / 사업장 / 확인
방식 B. 카카오지도 로컬 API (KAKAO_REST_API_KEY)  — 주소·건물명·등록 사업장 확인
방식 C. 주소 표기 휴리스틱 (오프라인 데모)          — 아파트/동·호수=주거, 타워/지식산업=사업장

환경변수
--------
JUSO_KEY           : 행안부 도로명주소 API 승인키 (파라미터명 confmKey, business.juso.go.kr)
DATA_KEY           : 공공데이터포털 건축HUB 건축물대장 serviceKey (apis.data.go.kr/1613000)
KAKAO_REST_API_KEY : 카카오 REST API 키 (developers.kakao.com)
"""
import json
import os
import re
from typing import Optional

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

from src.agents.state import CustomsState
from src.llm import llm   # LLM 시뮬레이션(실제 정부 API 미연동 시 도로명주소·건축물대장 응답을 모의)

JUSO_KEY = os.getenv("JUSO_KEY", "").strip()
DATA_KEY = os.getenv("DATA_KEY", "").strip()
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "").strip()

_JUSO_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do"
_BLD_TITLE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
_ADDR_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json"
_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
_API_TIMEOUT = 6.0

# 도로명(…로/길 12, 12-3) 또는 지번(…동 123-4) 형태의 한국 주소 추출.
# 앞의 광역단위(…특별시/광역시/도)는 선택이되 해당 접미사로 끝나야 하므로,
# "확인해줘 서울…"처럼 주소 앞 일반 단어가 함께 잡히지 않는다.
_ADDR_PATTERN = re.compile(
    r"(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)\s+)?[가-힣]+(?:시|군|구)\s+"
    r"[가-힣0-9·\s]*?(?:로|길|대로)\s*\d+(?:-\d+)?(?:[,\s]*(?:\d+동)?\s*\d+호?|\s*\d+층)?"
    r"|(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)\s+)?[가-힣]+(?:시|군|구)\s+[가-힣]+(?:동|읍|면)\s*\d+(?:-\d+)?"
)

_RESIDENTIAL_HINTS = ("아파트", "빌라", "주택", "연립", "오피스텔", "다세대", "도시형생활")
_BUSINESS_HINTS = ("타워", "센터", "지식산업", "테크노", "프라자", "상가", "빌딩", "공장", "물류", "사옥", "밸리", "디지털", "공단", "팩토리")
_UNIT_PATTERN = re.compile(r"\d+\s*동\s*\d+\s*호")   # "101동 202호" — 공동주택 세대 표기

# 건축물대장 주용도코드명(mainPurpsCdNm) → 가정집/사업장/확인 룰
_PURPOSE_RESIDENTIAL = ("단독주택", "공동주택", "아파트", "연립주택", "다세대주택", "다가구", "기숙사")
_PURPOSE_BUSINESS = ("근린생활시설", "업무시설", "판매시설", "공장", "창고", "숙박시설", "위험물", "자동차관련")
# 그 외(교육연구·문화집회·의료·종교·운동 등)는 비주거이나 개인/사업장 단정 곤란 → 확인

# juso API는 %, =, <, >, OR/SELECT/DELETE 등 특수문자·SQL 키워드를 해킹으로 간주해 거부
_JUSO_FORBIDDEN = re.compile(r"[%=<>]|\b(?:or|select|delete|update|insert|drop)\b", re.I)


_MAX_ADDRESSES = 20   # 다건 처리 상한(초과분은 잘라내고 안내)


def _address_texts(state: CustomsState) -> list[str]:
    scenario = state.get("scenario") or {}
    texts = [
        item.get("instruction", "")
        for item in scenario.get("scenario_items", [])
        if item.get("type") in ("address_check",) and item.get("instruction")
    ]
    texts.append(str(state.get("prompt") or ""))
    return texts


def _extract_address(state: CustomsState) -> str:
    for text in _address_texts(state):
        m = _ADDR_PATTERN.search(text)
        if m:
            return m.group(0).strip()
    return ""


def _extract_addresses(state: CustomsState) -> tuple[list[str], bool]:
    """입력에서 모든 주소를 추출(중복 제거, 등장 순서 유지). (주소목록, 상한초과여부).
    줄 단위로 매칭해 줄바꿈 너머 병합을 막는다(다건은 보통 한 줄에 한 주소)."""
    seen: set[str] = set()
    out: list[str] = []
    for text in _address_texts(state):
        for line in str(text).splitlines():
            for m in _ADDR_PATTERN.finditer(line):
                a = " ".join(m.group(0).split()).strip()   # 내부 개행·연속공백 정규화
                if a and a not in seen:
                    seen.add(a)
                    out.append(a)
    truncated = len(out) > _MAX_ADDRESSES
    return out[:_MAX_ADDRESSES], truncated


# ── 방식 A: 도로명주소 → 번지 분해 → 건축물대장 주용도 ─────────────────────────
def _juso_lookup(address: str) -> Optional[dict]:
    """행안부 도로명주소 API → admCd·번지·mtYn·bdKdcd. 실패 시 None."""
    if not (JUSO_KEY and httpx):
        return None
    keyword = _JUSO_FORBIDDEN.sub(" ", address).strip()   # 금지문자 정제 후 질의
    if not keyword:
        return None
    try:
        r = httpx.get(_JUSO_URL, params={
            "confmKey": JUSO_KEY, "keyword": keyword,
            "resultType": "json", "countPerPage": 1, "currentPage": 1,
        }, timeout=_API_TIMEOUT)
        if r.status_code != 200:
            print(f"[JUSO API] HTTP {r.status_code}: {r.text[:120]}")
            return None
        data = r.json().get("results") or {}
        common = data.get("common") or {}
        if common.get("errorCode") not in (None, "0"):
            print(f"[JUSO API] error {common.get('errorCode')}: {common.get('errorMessage')}")
            return None
        juso = data.get("juso") or []
        return juso[0] if juso else None
    except Exception as exc:  # noqa: BLE001
        print(f"[JUSO API] 호출 실패: {exc}")
        return None


def _building_purpose(juso: dict) -> Optional[dict]:
    """건축HUB 표제부 API → 주용도코드명 등. 실패/대장없음 시 None."""
    if not (DATA_KEY and httpx):
        return None
    adm = str(juso.get("admCd") or "")
    if len(adm) < 10:
        return None
    try:
        r = httpx.get(_BLD_TITLE_URL, params={
            "serviceKey": DATA_KEY,
            "sigunguCd": adm[:5], "bjdongCd": adm[5:],
            "bun": str(juso.get("lnbrMnnm") or "0").zfill(4),
            "ji": str(juso.get("lnbrSlno") or "0").zfill(4),
            "platGbCd": "1" if str(juso.get("mtYn")) == "1" else "0",
            "_type": "json", "numOfRows": 10,
        }, timeout=_API_TIMEOUT)
        if r.status_code != 200:
            print(f"[건축HUB API] HTTP {r.status_code}: {r.text[:120]}")
            return None
        body = (r.json().get("response") or {}).get("body") or {}
        items = body.get("items") or {}
        item = items.get("item") if isinstance(items, dict) else None
        if not item:
            return {"대장없음": True}
        it = item[0] if isinstance(item, list) else item
        return {
            "주용도": str(it.get("mainPurpsCdNm") or ""),
            "기타용도": str(it.get("etcPurps") or ""),
            "건물명": str(it.get("bldNm") or ""),
            "세대수": it.get("hhldCnt"),
        }
    except Exception as exc:  # noqa: BLE001
        print(f"[건축HUB API] 호출 실패: {exc}")
        return None


def _judge_by_purpose(main_purps: str, etc: str = "") -> tuple[str, str]:
    """주용도코드명 → (판정, 사유). 가정집/사업장/확인"""
    text = f"{main_purps} {etc}"
    if any(k in text for k in _PURPOSE_RESIDENTIAL) and not any(k in text for k in _PURPOSE_BUSINESS):
        return "가정집", f"건축물대장 주용도 '{main_purps}' — 주거시설"
    if any(k in text for k in _PURPOSE_BUSINESS) and not any(k in text for k in _PURPOSE_RESIDENTIAL):
        return "사업장", f"건축물대장 주용도 '{main_purps}' — 비주거(상업·업무·산업)시설"
    if any(k in text for k in _PURPOSE_RESIDENTIAL) and any(k in text for k in _PURPOSE_BUSINESS):
        return "확인", f"건축물대장 주용도 '{main_purps}' — 주거·비주거 혼합(상가주택 등) 현장 확인 필요"
    return "확인", f"건축물대장 주용도 '{main_purps or '미상'}' — 개인/사업장 단정 곤란"


# ── 룰 매핑(주용도코드명 → 주거/사업장/혼합/판단불가) — 서비스 표준 결과 라벨 ──
def _judge_purpose_kind(main_purps: str, etc: str = "") -> tuple[str, str]:
    """건축물대장 주용도코드명 → (주거/사업장/혼합/판단불가, 사유)."""
    text = f"{main_purps} {etc}"
    res = any(k in text for k in _PURPOSE_RESIDENTIAL)
    biz = any(k in text for k in _PURPOSE_BUSINESS)
    if res and biz:
        return "혼합", f"건축물대장 주용도 '{main_purps}' — 주거·비주거가 한 건물에 혼재(상가주택 등)"
    if res:
        return "주거", f"건축물대장 주용도 '{main_purps}' — 주거시설"
    if biz:
        return "사업장", f"건축물대장 주용도 '{main_purps}' — 비주거(상업·업무·산업)시설"
    return "판단불가", f"건축물대장 주용도 '{main_purps or '미상'}' — 주거/사업장 단정 곤란(교육·의료·종교 등 또는 미상)"


# ── LLM 시뮬레이션: (1) 도로명주소 API → (2) 건축물대장 주용도 → (3) 룰 매핑 ──
_LLM_SIM_PROMPT = """당신은 대한민국 행정안전부 '도로명주소 API'와 국토교통부 '건축HUB 건축물대장 API'를 시뮬레이션하는 엔진입니다.
아래 [입력 주소]에 대해 두 API가 반환할 법한 값을 현실적으로 생성하세요(실제 조회가 아닌 합리적 추정·시뮬레이션).

[생성 규칙]
- admCd: 법정동코드 10자리(앞 5자리=시군구코드, 뒤 5자리=법정동코드). 입력 주소의 시/구/동에 부합하는 실제 코드에 가깝게.
- lnbrMnnm(번)·lnbrSlno(지): 주소의 번지 숫자. 지가 없으면 0.
- mtYn: 산 여부("1"=산, "0"=일반).
- bdKdcd: 공동주택 구분("1"=아파트·연립·다세대 등 공동주택, "0"=그 외).
- mainPurpsCdNm(주용도코드명): 건축물대장 표제부의 주용도. 주소·건물명에 가장 부합하게 아래 표준 용도 중 선택.
  · 주거계열: 단독주택, 공동주택, 아파트, 연립주택, 다세대주택, 다가구주택, 기숙사
  · 비주거계열: 제1종근린생활시설, 제2종근린생활시설, 업무시설, 판매시설, 공장, 창고시설, 숙박시설, 자동차관련시설, 교육연구시설, 의료시설, 문화및집회시설
  · 혼합: 한 건물에 주거+비주거가 함께면 "제1종근린생활시설, 다세대주택"처럼 병기(상가주택).
- 입력 주소에 상가주택·주상복합·복합용도·"1층 상가"·"하부 상가 상부 주택/오피스텔" 등 혼합 사용이 명시되면
  mainPurpsCdNm에 반드시 주거계열+비주거계열을 병기하세요(예: "제1종근린생활시설, 다세대주택").
- bldNm(건물명)·hhldCnt(세대수)도 추정해 채우되 모르면 빈 문자열/0.

[출력 형식] 아래 JSON 객체 '하나만' 출력하세요(설명·코드블록·주석 없이):
{{"roadAddr":"","jibunAddr":"","admCd":"","lnbrMnnm":0,"lnbrSlno":0,"mtYn":"0","bdKdcd":"0","bldNm":"","mainPurpsCdNm":"","etcPurps":"","hhldCnt":0}}

[입력 주소]
{address}
[건물 참고설명] (있으면 주용도 판단에 반영, 없으면 무시)
{context}
"""


def _parse_sim_json(raw: str) -> Optional[dict]:
    """LLM 응답에서 JSON 객체를 추출·파싱(코드펜스/설명 혼입 방어)."""
    text = str(raw or "").strip()
    if "```" in text:   # ```json ... ``` 제거
        text = re.sub(r"```(?:json)?", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


def _resolve_by_llm_simulation(address: str, context: str = "") -> Optional[tuple[str, list[str], list[str]]]:
    """(판정, 근거, 상세) 또는 None. LLM으로 도로명주소·건축물대장 응답을 모의한 뒤 룰 매핑.
    context: 입력 전문(건물 유형·상가주택 등 설명이 있으면 주용도 판단에 반영)."""
    if not llm:
        return None
    # 정규식으로 떨어져 나간 건물 설명(상가주택·주상복합 등)을 맥락으로 함께 전달.
    ctx = (context or "").strip()
    ctx = ctx if ctx and ctx != address else "(추가 설명 없음)"
    try:
        raw = llm.invoke(_LLM_SIM_PROMPT.format(address=address, context=ctx[:500])).content
    except Exception as exc:  # noqa: BLE001
        print(f"[주소확인 LLM] 시뮬레이션 호출 실패: {exc}")
        return None
    data = _parse_sim_json(raw)
    if not data:
        print("[주소확인 LLM] 시뮬레이션 응답 파싱 실패")
        return None
    adm = str(data.get("admCd") or "")
    mt = str(data.get("mtYn") or "0")
    detail = [
        "■ (1) 도로명주소 API(행안부) — LLM 시뮬레이션",
        f"  도로명주소: {data.get('roadAddr') or '-'}",
        f"  지번주소: {data.get('jibunAddr') or '-'}",
        f"  법정동코드(admCd): {adm or '-'} · 번지(lnbrMnnm-lnbrSlno): "
        f"{data.get('lnbrMnnm') or 0}-{data.get('lnbrSlno') or 0} · 산여부(mtYn): {mt}{' (산)' if mt == '1' else ''}",
        "",
    ]
    main = str(data.get("mainPurpsCdNm") or "")
    # 공동주택(bdKdcd=1) 조기 판정 — 단, 주용도에 비주거(근생·판매 등)가 병기되면
    # 상가주택/주상복합이므로 조기 판정하지 않고 아래 룰 매핑(→ 혼합 등)으로 넘긴다.
    if str(data.get("bdKdcd")) == "1" and not any(k in main for k in _PURPOSE_BUSINESS):
        detail += [
            "■ (2) 건축물대장 API(건축HUB) — LLM 시뮬레이션",
            f"  건물명: {data.get('bldNm') or '-'} · 구분: 공동주택(bdKdcd=1)"
            f"{(' · 주용도: ' + main) if main else ''}",
            "",
        ]
        return "주거", ["도로명주소 API 공동주택 구분(bdKdcd=1) — 아파트·연립·다세대 → 주거"], detail
    verdict, reason = _judge_purpose_kind(main, str(data.get("etcPurps") or ""))
    detail += [
        "■ (2) 건축물대장 API(건축HUB) 표제부 — LLM 시뮬레이션",
        f"  건물명: {data.get('bldNm') or '-'}",
        f"  주용도코드명(mainPurpsCdNm): {main or '-'}"
        f"{(' · 기타용도: ' + str(data.get('etcPurps'))) if data.get('etcPurps') else ''}  ★판정 근거",
        f"  세대수(hhldCnt): {data.get('hhldCnt') or '-'}",
        "",
        "■ (3) 룰 매핑(주용도코드명 → 주거/사업장/혼합/판단불가)",
        f"  {reason}",
        "",
    ]
    return verdict, [reason], detail


def _resolve_by_building_register(address: str) -> Optional[tuple[str, list[str], list[str]]]:
    """(판정, 근거, 상세) 또는 None(방식 A 불가). 방식 A: JUSO + 건축물대장."""
    juso = _juso_lookup(address)
    if not juso:
        return None
    road = str(juso.get("roadAddr") or "")
    jibun = str(juso.get("jibunAddr") or "")
    adm = str(juso.get("admCd") or "")
    detail = [
        "■ 도로명주소 API(행안부) 번지 분해",
        f"  도로명: {road or '-'}",
        f"  지번: {jibun or '-'}",
        f"  법정동코드: {adm or '-'} · 번지: {juso.get('lnbrMnnm') or '-'}-{juso.get('lnbrSlno') or '-'}"
        f"{' (산)' if str(juso.get('mtYn')) == '1' else ''}",
        "",
    ]
    purpose = _building_purpose(juso)
    # 공동주택(bdKdcd=1) 조기 판정 — 단, 건축물대장 주용도에 비주거가 병기되면
    # 상가주택/주상복합이므로 조기 판정하지 않고 룰 매핑으로 넘긴다.
    _main_pre = str((purpose or {}).get("주용도") or "")
    if str(juso.get("bdKdcd")) == "1" and not any(k in _main_pre for k in _PURPOSE_BUSINESS):
        return "주거", ["도로명주소 API 공동주택 구분(bdKdcd=1) — 아파트·연립·다세대 주거"], detail
    if purpose is None:
        # 건축HUB 미연동 — juso 결과만으로는 용도 확정 불가
        detail.append("(건축HUB DATA_KEY 미설정 — 건축물대장 주용도 미조회)")
        return "판단불가", ["도로명주소는 확인되나 건축물대장 주용도를 조회하지 못함"], detail
    if purpose.get("대장없음"):
        return "판단불가", ["건축물대장 미등재 — 무허가·미등록 건물 가능성(위험 신호)"], detail
    main = purpose.get("주용도", "")
    verdict, reason = _judge_purpose_kind(main, purpose.get("기타용도", ""))
    detail += [
        "■ 건축물대장(건축HUB) 표제부",
        f"  건물명: {purpose.get('건물명') or '-'}",
        f"  주용도: {main or '-'}{(' · 기타: ' + purpose['기타용도']) if purpose.get('기타용도') else ''}",
        f"  세대수: {purpose.get('세대수') or '-'}",
        "",
    ]
    return verdict, [reason], detail


# ── 방식 B: 카카오지도 로컬 API ────────────────────────────────────────────────
def _kakao_get(url: str, params: dict) -> Optional[dict]:
    if not (KAKAO_REST_API_KEY and httpx):
        return None
    try:
        resp = httpx.get(url, params=params,
                         headers={"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"},
                         timeout=_API_TIMEOUT)
        if resp.status_code != 200:
            print(f"[Kakao API] HTTP {resp.status_code}: {resp.text[:120]}")
            return None
        return resp.json()
    except Exception as exc:  # noqa: BLE001 — 외부 API 실패는 모의 판정 폴백
        print(f"[Kakao API] 호출 실패: {exc}")
        return None


# ── 방식 C: 주소 표기 휴리스틱 ─────────────────────────────────────────────────
def _judge(building: str, places: list[dict], address: str, fulltext: str = "") -> tuple[str, list[str]]:
    """(판정, 근거 목록) — 명확하면 '가정집'/'사업장', 불명확(혼재·무신호)하면 '확인'"""
    reasons: list[str] = []
    text = f"{building} {address} {fulltext}"
    residential = any(h in text for h in _RESIDENTIAL_HINTS) or bool(_UNIT_PATTERN.search(text))
    business = any(h in text for h in _BUSINESS_HINTS) or bool(places)
    if residential:
        reasons.append(f"주거 신호(아파트·빌라·동/호수 등) 확인 ({building or address})")
    if any(h in text for h in _BUSINESS_HINTS):
        reasons.append(f"건물명/주소에 상업시설 신호 확인 ({building or address})")
    if places:
        names = ", ".join(p.get("place_name", "") for p in places[:5])
        reasons.append(f"해당 위치 등록 사업장 {len(places)}건 — {names}")
    if residential and business:
        reasons.append("주거·사업장 신호가 함께 확인됨(주상복합 등) — 현장 확인 필요")
        return "혼합", reasons
    if residential:
        return "주거", reasons
    if business:
        return "사업장", reasons
    reasons.append("주거·사업장 신호가 모두 확인되지 않음 — 추가 확인 필요")
    return "판단불가", reasons


def _implication(verdict: str) -> str:
    """판정(주거/사업장/혼합/판단불가)별 조사 시사점 한 줄."""
    if verdict == "사업장":
        return "  - 등록 상호와 신고 업체명 일치 여부, 실제 영업 여부(현장 확인) 대사 권고"
    if verdict == "주거":
        return "  - 사업장 주소로 신고되었는데 주거로 판정되면 위장 사업장·유령 주소 가능성 검토"
    if verdict == "혼합":
        return "  - 주거·비주거 혼재(상가주택 등) — 실제 사용 층·호 및 영업 여부 현장 확인 권고"
    return "  - 주용도로 단정이 어려움 — 추가 자료(임대차·사업자등록·현장) 확보 후 재판정 권고"


def _format_result(method: str, address: str, verdict: str,
                   reasons: list[str], detail: list[str]) -> str:
    lines = [
        "[주소확인 결과]",
        f"조회 방식: {method}",
        f"입력 주소: {address}",
        "",
        f"■ 결과: {verdict}   (주거 / 사업장 / 혼합 / 판단불가)",
        "",
    ] + [f"  - {r}" for r in reasons] + [""] + detail + [
        "■ 조사 시사점",
        _implication(verdict),
    ]
    return "\n".join(lines)


def _resolve_one(address: str, context: str = "") -> tuple[str, str, list[str], list[str]]:
    """단일 주소 판정 — (조회방식, 판정, 근거, 상세). 방식 A(실제 API) → A′(LLM 시뮬) → B/C(카카오·휴리스틱)."""
    # ── 방식 A: 실제 도로명주소 API + 건축HUB 건축물대장(가장 정확, 키 설정 시) ──
    br = _resolve_by_building_register(address)
    if br is not None:
        verdict, reasons, detail = br
        method = ("건축물대장 조회 (도로명주소 API + 건축HUB)" if DATA_KEY
                  else "도로명주소 API (건축HUB 미연동 — 주용도 미조회)")
        return method, verdict, reasons, detail

    # ── 방식 A′: LLM 시뮬레이션 (실제 API 키 미설정 시 도로명주소·건축물대장 응답 모의) ──
    sim = _resolve_by_llm_simulation(address, context)
    if sim is not None:
        verdict, reasons, detail = sim
        return "LLM 시뮬레이션 (도로명주소 API → 건축물대장 주용도 → 룰 매핑)", verdict, reasons, detail

    # ── 방식 B/C: 카카오지도 + 휴리스틱 ──
    building = ""
    places: list[dict] = []
    road, jibun, coords = "", "", ""

    addr_data = _kakao_get(_ADDR_SEARCH_URL, {"query": address, "size": 1})
    api_ok = bool(addr_data and addr_data.get("documents"))
    method = ("카카오지도(카카오 로컬) Open API" if api_ok
              else "모의 판정 (카카오 API 호출 실패/무응답 — 주소 표기 휴리스틱)" if KAKAO_REST_API_KEY and httpx
              else "모의 판정 (API 키 미설정 — 주소 표기 휴리스틱)")
    if addr_data and addr_data.get("documents"):
        doc = addr_data["documents"][0]
        road_doc = doc.get("road_address") or {}
        jibun_doc = doc.get("address") or {}
        building = str(road_doc.get("building_name") or "")
        road = str(road_doc.get("address_name") or "")
        jibun = str(jibun_doc.get("address_name") or "")
        x, y = doc.get("x"), doc.get("y")
        coords = f"{y}, {x}" if x and y else ""
        # 같은 좌표 반경 30m의 등록 사업장(상호) 조회 — 사업장 실재 신호
        if x and y:
            kw = _kakao_get(_KEYWORD_SEARCH_URL,
                            {"query": building or address, "x": x, "y": y, "radius": 30, "size": 10})
            places = list((kw or {}).get("documents") or [])

    detail: list[str] = []
    if road or jibun or coords:
        detail += [
            "■ 카카오지도 주소 확인",
            f"  도로명: {road or '-'}",
            f"  지번: {jibun or '-'}",
            f"  건물명: {building or '-'}",
            f"  좌표(위도, 경도): {coords or '-'}",
            "",
        ]
    if places:
        detail.append("■ 해당 위치 등록 사업장(카카오 플레이스)")
        for p in places[:5]:
            detail.append(f"  - {p.get('place_name', '')} · {p.get('category_name', '')}")
        detail.append("")

    verdict, reasons = _judge(building, places, address, context)
    return method, verdict, reasons, detail


def _format_multi(rows: list[tuple[str, str, str, list[str], list[str]]], truncated: bool) -> str:
    """다건(주소, 방식, 판정, 근거, 상세) → 요약표 + 판정 분포 + 주소별 상세."""
    from collections import Counter
    n = len(rows)
    dist = Counter(v for _a, _m, v, _r, _d in rows)
    order = ["주거", "사업장", "혼합", "판단불가"]
    dist_str = " · ".join(f"{k} {dist[k]}건" for k in order if dist.get(k)) or "-"
    lines = [
        "[주소확인 결과 — 다건]",
        f"입력 주소: {n}건" + (f" (상한 {_MAX_ADDRESSES}건 초과분은 생략)" if truncated else ""),
        f"■ 판정 분포: {dist_str}",
        "",
        "■ 요약 (주소 → 판정)",
    ]
    for i, (addr, _m, verdict, _r, _d) in enumerate(rows, 1):
        lines.append(f"  {i}. {addr} — {verdict}")
    lines.append("")
    for i, (addr, method, verdict, reasons, detail) in enumerate(rows, 1):
        lines.append("─" * 30)
        lines += [
            f"[{i}] {addr}",
            f"조회 방식: {method}",
            f"■ 결과: {verdict}   (주거 / 사업장 / 혼합 / 판단불가)",
            "",
        ] + [f"  - {r}" for r in reasons] + [""] + detail + [
            "■ 조사 시사점",
            _implication(verdict),
            "",
        ]
    return "\n".join(lines)


def agent_address_check(state: CustomsState) -> CustomsState:
    """주소를 입력받아 도로명주소 API → 건축물대장 주용도 → 룰 매핑으로
    주거/사업장/혼합/판단불가를 판별한다(실제 API 미연동 시 LLM 시뮬레이션).
    입력에 주소가 여러 건이면 각각 판정하고 요약표·분포와 함께 반환한다."""
    print("[Agent] 주소확인 시작")
    addresses, truncated = _extract_addresses(state)
    scenario = state.get("scenario") or {}
    context = " ".join(
        item.get("instruction", "") for item in scenario.get("scenario_items", [])
        if item.get("type") == "address_check"
    ) or str(state.get("prompt") or "")

    if not addresses:
        return {**state, "address_check_result": "\n".join([
            "[주소확인 결과]",
            "입력 주소: (주소 미확인 — 지시문에서 주소를 찾지 못함)",
            "",
            "확인 주소가 입력되지 않았습니다. '확인 주소' 입력값에 도로명 또는 지번 주소를 등록하세요.",
        ])}

    # ── 단건: 기존 상세 포맷 그대로 ──
    if len(addresses) == 1:
        method, verdict, reasons, detail = _resolve_one(addresses[0], context)
        print(f"[Agent] 주소확인 완료 — 결과: {verdict}")
        return {**state, "address_check_result": _format_result(method, addresses[0], verdict, reasons, detail)}

    # ── 다건: 주소별 판정 + 요약표 ──
    rows = []
    for addr in addresses:
        method, verdict, reasons, detail = _resolve_one(addr, context)
        rows.append((addr, method, verdict, reasons, detail))
    print(f"[Agent] 주소확인 완료(다건 {len(rows)}건) — " + ", ".join(f"{a[:12]}:{v}" for a, _m, v, _r, _d in rows))
    return {**state, "address_check_result": _format_multi(rows, truncated)}
