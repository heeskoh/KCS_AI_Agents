"""Agent: 주소확인 — 카카오지도(카카오 로컬) Open API로 주소를 확인하고
해당 주소가 개인주소(주거용)인지 사업장(상업용)인지 판별한다.

API 연동 순서
-------------
1. 시나리오 지시문/프롬프트에서 확인 주소 추출
2. KAKAO_REST_API_KEY 설정 시 → 카카오 로컬 API 실시간 조회
   ① 주소 검색(/v2/local/search/address.json) — 좌표·도로명·건물명 확인
   ② 키워드 검색(/v2/local/search/keyword.json, 좌표 반경 30m) — 해당 위치 등록 사업장(상호) 확인
3. 키 없거나 API 실패 시 → 주소 문자열 휴리스틱 기반 모의 판정(오프라인 데모)
4. 판정 규칙: 등록 상호·상업시설 신호 → 사업장 / 아파트·빌라 등 주거 표기 → 개인주소 /
   양쪽 신호 혼재 → 복합(주상복합) / 신호 없음 → 확인 필요

환경변수
--------
KAKAO_REST_API_KEY : 카카오 REST API 키 (developers.kakao.com → 내 애플리케이션 → REST API 키)
"""
import os
import re
from typing import Optional

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

from src.agents.state import CustomsState

KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "").strip()

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


def _judge(building: str, places: list[dict], address: str, fulltext: str = "") -> tuple[str, list[str]]:
    """(판정, 근거 목록) — 사업장 / 개인주소(주거) / 복합 / 확인 필요"""
    reasons: list[str] = []
    text = f"{building} {address} {fulltext}"
    residential = any(h in text for h in _RESIDENTIAL_HINTS) or bool(_UNIT_PATTERN.search(text))
    business_bldg = any(h in text for h in _BUSINESS_HINTS)
    if residential:
        reasons.append(f"건물명/주소 표기에 주거 신호(아파트·빌라·동/호수 등) 확인 ({building or address})")
    if business_bldg:
        reasons.append(f"건물명에 상업시설 신호 확인 ({building})")
    if places:
        names = ", ".join(p.get("place_name", "") for p in places[:5])
        reasons.append(f"해당 위치 등록 사업장 {len(places)}건 — {names}")
    if places or business_bldg:
        return ("복합(주상복합 추정)" if residential else "사업장(상업용)"), reasons
    if residential:
        return "개인주소(주거용)", reasons
    reasons.append("주거·사업장 신호가 모두 확인되지 않음")
    return "확인 필요", reasons


def agent_address_check(state: CustomsState) -> CustomsState:
    """주소를 카카오지도 API로 확인해 개인주소/사업장 여부를 판별한다."""
    print("[Agent] 주소확인 시작")
    address = _extract_address(state)
    scenario = state.get("scenario") or {}
    fulltext = " ".join(
        item.get("instruction", "") for item in scenario.get("scenario_items", [])
        if item.get("type") == "address_check"
    )
    lines = [
        "[주소확인 결과]",
        f"조회 방식: {'카카오지도(카카오 로컬) Open API' if KAKAO_REST_API_KEY and httpx else '모의 판정 (KAKAO_REST_API_KEY 미설정 — 주소 표기 휴리스틱)'}",
        f"입력 주소: {address or '(주소 미확인 — 지시문에서 주소를 찾지 못함)'}",
        "",
    ]
    if not address:
        lines.append("확인 주소가 입력되지 않았습니다. '확인 주소' 입력값에 도로명 또는 지번 주소를 등록하세요.")
        return {**state, "address_check_result": "\n".join(lines)}

    building = ""
    places: list[dict] = []
    road, jibun, coords = "", "", ""

    addr_data = _kakao_get(_ADDR_SEARCH_URL, {"query": address, "size": 1})
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
        lines += [
            "■ 카카오지도 주소 확인",
            f"  도로명: {road or '-'}",
            f"  지번: {jibun or '-'}",
            f"  건물명: {building or '-'}",
            f"  좌표(위도, 경도): {coords or '-'}",
            "",
        ]
        if places:
            lines.append("■ 해당 위치 등록 사업장(카카오 플레이스)")
            for p in places[:5]:
                lines.append(f"  - {p.get('place_name', '')} · {p.get('category_name', '')}")
            lines.append("")

    verdict, reasons = _judge(building, places, address, fulltext)
    lines += [f"■ 판정: {verdict}", ""]
    lines += [f"  - {r}" for r in reasons]
    lines += [
        "",
        "■ 조사 시사점",
        ("  - 사업장 주소로 신고되었으나 주거용으로 판정되면 위장 사업장·유령 주소 가능성 검토"
         if "주거" in verdict or verdict == "확인 필요"
         else "  - 등록 상호와 신고 업체명 일치 여부, 실제 영업 여부(현장 확인) 대사 권고"),
    ]
    print(f"[Agent] 주소확인 완료 — 판정: {verdict}")
    return {**state, "address_check_result": "\n".join(lines)}
