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
import os
import re
from typing import Optional

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

from src.agents.state import CustomsState

JUSO_KEY = os.getenv("JUSO_KEY", "").strip()
DATA_KEY = os.getenv("DATA_KEY", "").strip()
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "").strip()

_JUSO_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do"
_BLD_TITLE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
_ADDR_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json"
_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
_API_TIMEOUT = 6.0

# 도로명(…로/길 12, 12-3) 또는 지번(…동 123-4) 형태의 한국 주소 추출
_ADDR_PATTERN = re.compile(
    r"[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시)?\s*[가-힣]+(?:시|군|구)\s*"
    r"[가-힣0-9·\s]*?(?:로|길|대로)\s*\d+(?:-\d+)?(?:[,\s]*(?:\d+동)?\s*\d+호?|\s*\d+층)?"
    r"|[가-힣]+(?:시|군|구)\s*[가-힣]+(?:동|읍|면)\s*\d+(?:-\d+)?"
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


def _extract_address(state: CustomsState) -> str:
    scenario = state.get("scenario") or {}
    texts = [
        item.get("instruction", "")
        for item in scenario.get("scenario_items", [])
        if item.get("type") in ("address_check",) and item.get("instruction")
    ]
    texts.append(str(state.get("prompt") or ""))
    for text in texts:
        m = _ADDR_PATTERN.search(text)
        if m:
            return m.group(0).strip()
    return ""


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
    # 공동주택(bdKdcd=1) 조기 판정
    if str(juso.get("bdKdcd")) == "1":
        return "가정집", ["도로명주소 API 공동주택 구분(bdKdcd=1) — 아파트·연립·다세대 주거"], detail
    purpose = _building_purpose(juso)
    if purpose is None:
        # 건축HUB 미연동 — juso 결과만으로는 용도 확정 불가
        detail.append("(건축HUB DATA_KEY 미설정 — 건축물대장 주용도 미조회)")
        return "확인", ["도로명주소는 확인되나 건축물대장 주용도를 조회하지 못함"], detail
    if purpose.get("대장없음"):
        return "확인", ["건축물대장 미등재 — 무허가·미등록 건물 가능성(위험 신호)"], detail
    main = purpose.get("주용도", "")
    verdict, reason = _judge_by_purpose(main, purpose.get("기타용도", ""))
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
        return "확인", reasons
    if residential:
        return "가정집", reasons
    if business:
        return "사업장", reasons
    reasons.append("주거·사업장 신호가 모두 확인되지 않음 — 추가 확인 필요")
    return "확인", reasons


def agent_address_check(state: CustomsState) -> CustomsState:
    """주소를 건축물대장(우선)·카카오지도·휴리스틱으로 개인주소/사업장 여부를 판별한다."""
    print("[Agent] 주소확인 시작")
    address = _extract_address(state)
    scenario = state.get("scenario") or {}
    fulltext = " ".join(
        item.get("instruction", "") for item in scenario.get("scenario_items", [])
        if item.get("type") == "address_check"
    )
    if not address:
        return {**state, "address_check_result": "\n".join([
            "[주소확인 결과]",
            "입력 주소: (주소 미확인 — 지시문에서 주소를 찾지 못함)",
            "",
            "확인 주소가 입력되지 않았습니다. '확인 주소' 입력값에 도로명 또는 지번 주소를 등록하세요.",
        ])}

    # ── 방식 A: 건축물대장 주용도(가장 정확) ──
    br = _resolve_by_building_register(address)
    if br is not None:
        verdict, reasons, detail = br
        method = ("건축물대장 조회 (도로명주소 API + 건축HUB)" if DATA_KEY
                  else "도로명주소 API (건축HUB 미연동 — 주용도 미조회)")
        lines = [
            "[주소확인 결과]", f"조회 방식: {method}", f"입력 주소: {address}", "",
            f"■ 1차 판정: {verdict}", "",
        ] + [f"  - {r}" for r in reasons] + [""] + detail + [
            "■ 조사 시사점",
            ("  - 사업장 주소로 신고되었으나 가정집으로 판정되면 위장 사업장·유령 주소 가능성 검토"
             if verdict in ("가정집", "확인")
             else "  - 등록 상호와 신고 업체명 일치 여부, 실제 영업 여부(현장 확인) 대사 권고"),
        ]
        print(f"[Agent] 주소확인 완료(건축물대장) — 판정: {verdict}")
        return {**state, "address_check_result": "\n".join(lines)}

    # ── 방식 B/C: 카카오지도 + 휴리스틱 ──
    building = ""
    places: list[dict] = []
    road, jibun, coords = "", "", ""

    addr_data = _kakao_get(_ADDR_SEARCH_URL, {"query": address, "size": 1})
    api_ok = bool(addr_data and addr_data.get("documents"))
    method = ("카카오지도(카카오 로컬) Open API" if api_ok
              else "모의 판정 (카카오 API 호출 실패/무응답 — 주소 표기 휴리스틱)" if KAKAO_REST_API_KEY and httpx
              else "모의 판정 (API 키 미설정 — 주소 표기 휴리스틱)")
    lines = [
        "[주소확인 결과]",
        f"조회 방식: {method}",
        f"입력 주소: {address}",
        "",
    ]
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

    # 카카오 상세는 판정 아래에 배치 — 1차 판정을 결과 최상단에 먼저 제공한다.
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

    verdict, reasons = _judge(building, places, address, fulltext)
    lines += [f"■ 1차 판정: {verdict}", ""]
    lines += [f"  - {r}" for r in reasons]
    lines.append("")
    lines += detail
    lines += [
        "■ 조사 시사점",
        ("  - 사업장 주소로 신고되었으나 가정집으로 판정되면 위장 사업장·유령 주소 가능성 검토"
         if verdict in ("가정집", "확인")
         else "  - 등록 상호와 신고 업체명 일치 여부, 실제 영업 여부(현장 확인) 대사 권고"),
    ]
    print(f"[Agent] 주소확인 완료 — 판정: {verdict}")
    return {**state, "address_check_result": "\n".join(lines)}
