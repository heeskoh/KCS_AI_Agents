"""Agent: 특허정보조회 — KIPRIS Open API로 특허 정보를 조회하고
LLM으로 로열티 과세가격 가산 여부를 분석한다.

API 연동 순서
-------------
1. 문서(OCR/요약)에서 특허번호 추출 (KR·US·EP 등)
2. KIPRIS_API_KEY 설정 시 → KIPRIS Plus Open API 실시간 조회 (한국 특허 KR)
3. 키 없거나 API 실패 시 → LLM이 특허번호·기업 맥락 기반 분석
4. 항상 → LLM으로 로열티 과세 영향 심층 분석

환경변수
--------
KIPRIS_API_KEY : KIPRIS Plus Open API ServiceKey
                 발급: https://plus.kipris.or.kr → 회원가입 → API 신청
"""
import os
import re
import xml.etree.ElementTree as ET
from typing import Optional

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

from src.agents.state import CustomsState
from src.agents.scope import company_id as scoped_company_id
from src.config import CFG
from src.llm import llm

# ── 환경변수 ────────────────────────────────────────────────────────────────────
KIPRIS_API_KEY = os.getenv("KIPRIS_API_KEY", "").strip()

_KIPRIS_SEARCH_URL = (
    "https://plus.kipris.or.kr/kipo-api/kipi"
    "/patUtiModInfoSearchSevice/getAdvancedSearch"
)
_KIPRIS_DETAIL_URL = (
    "https://plus.kipris.or.kr/kipo-api/kipi"
    "/patUtiModInfoSearchSevice/getBibliographyDetailInfoSearch"
)
_API_TIMEOUT = CFG.api.kipris_timeout

# ── 특허번호 패턴 ──────────────────────────────────────────────────────────────
# KR10-1234567, KR102034561, US10432879, EP3456789, WO2019/123456
_PATENT_PATTERN = re.compile(
    r"\b(KR\s?10[-–]?\d{7,10}|KR\s?\d{7,10}|US\s?\d{7,8}"
    r"|EP\s?\d{6,8}|WO\s?\d{4}[/\s]?\d{6})\b",
    re.I,
)
_ROYALTY_PATTERN = re.compile(
    r"(royalt|로열티|기술사용료|라이선스|license|특허권|사용료)",
    re.I,
)

# KR 특허 등록번호 정규화 (KIPRIS API 파라미터용)
_KR_NUM_RE = re.compile(r"KR\s?(?:10[-–]?)?(\d{5,10})", re.I)


def _normalize_kr_no(raw: str) -> Optional[str]:
    """'KR10-2034561' 등을 KIPRIS 등록번호 숫자열로 변환."""
    m = _KR_NUM_RE.match(raw.strip())
    if not m:
        return None
    digits = m.group(1).replace("-", "").replace("–", "")
    # KIPRIS 등록번호는 10자리 (부족하면 앞에 10 붙임)
    if len(digits) < 7:
        return None
    if len(digits) == 7:
        digits = "10" + digits + "0"  # 10-XXXXXXX-0 형식
    return digits


# ── LLM 프롬프트 ────────────────────────────────────────────────────────────────
_LLM_PATENT_LOOKUP_PROMPT = """당신은 특허·지식재산권 전문가입니다.
다음 특허번호들과 기업 조사 맥락을 분석하여 특허 내용과 로열티 과세 관련 정보를 추정하세요.

[특허번호]
{patent_nos}

[기업 조사 맥락]
{context}

다음 항목으로 작성하세요:
■ [특허번호별]
- 추정 기술 분야 및 발명 내용 (HS코드 연관성 포함)
- 특허권자 추정 (맥락에서 파악되는 경우)
- 등록 여부 및 유효성 추정
- 로열티 과세 관련 가능성

(특허번호가 구체적이지 않거나 맥락이 부족한 경우 일반적인 분석 제공)
"""

_LLM_ROYALTY_ANALYSIS_PROMPT = """당신은 관세청 지식재산권·과세가격 전문 조사관입니다.
아래 특허정보 조회 결과를 분석하여 로열티 과세가격 가산 여부를 평가하세요.

분석 항목:
1. 로열티 과세가격 가산 요건 충족 여부
   - 수입물품과 특허의 관련성 (물품 생산·판매에 필수인지)
   - 수입의 조건으로 지급 여부 (관세법 제30조 제1항 나목)
   - 특허권자와 공급자·수입자 간 관계 (특수관계 여부)
2. 가산 대상 금액 추정: 로열티율·거래 규모 기반 추정 방향
3. 특수관계 연관성: 특허권자가 특수관계인인 경우 이전가격 문서 필요성
4. 즉시 확인 필요 사항: 계약서 조항·확인 포인트 2~3개

[특허정보 조회 결과]
{patent_raw}

관세법 제30조 제1항 나목 및 WTO 관세평가협정 제8조 1(c)를 인용하여 구체적으로 작성하세요.
"""

_LLM_NO_PATENT_PROMPT = """당신은 관세청 지식재산권·과세가격 전문 조사관입니다.
다음 기업 조사 맥락에서 특허·로열티 관련 잠재 위험을 분석하세요.

[기업 조사 맥락]
{context}

분석 항목:
1. 특허·로열티 위험 가능성: 수입 품목 특성 및 관계법인 구조에서의 IP 위험
2. 확인 필요 사항: 로열티·기술사용료 지급 여부를 확인하기 위한 서류 목록
3. 과세가격 가산 가능성: 관세법 제30조 제1항 나목 적용 시나리오
4. 권고 조치: 특허 관련 조사 착수를 위한 첫 3가지 액션

간결하고 실무적으로 작성하세요.
"""


# ── KIPRIS API 호출 ─────────────────────────────────────────────────────────────

def _call_kipris_by_regno(reg_no: str) -> dict:
    """등록번호로 KIPRIS API 조회. 결과 없으면 빈 dict 반환."""
    if not httpx or not KIPRIS_API_KEY:
        return {}
    try:
        resp = httpx.get(
            _KIPRIS_DETAIL_URL,
            params={
                "ServiceKey":          KIPRIS_API_KEY,
                "registrationNumber":  reg_no,
                "patent":              "Y",
                "utility":             "N",
            },
            timeout=_API_TIMEOUT,
        )
        resp.raise_for_status()
        return _parse_kipris_xml(resp.text)
    except Exception as exc:
        print(f"[KIPRIS API] 등록번호 조회 실패 ({reg_no}): {exc}")
        return {}


def _call_kipris_advanced(keyword: str) -> dict:
    """키워드로 KIPRIS 고급 검색. 결과 없으면 빈 dict 반환."""
    if not httpx or not KIPRIS_API_KEY:
        return {}
    try:
        resp = httpx.get(
            _KIPRIS_SEARCH_URL,
            params={
                "ServiceKey":   KIPRIS_API_KEY,
                "patent":       "Y",
                "utility":      "N",
                "inventionTitle": keyword,
                "numOfRows":    3,
                "pageNo":       1,
            },
            timeout=_API_TIMEOUT,
        )
        resp.raise_for_status()
        return _parse_kipris_xml(resp.text)
    except Exception as exc:
        print(f"[KIPRIS API] 키워드 검색 실패 ({keyword}): {exc}")
        return {}


def _parse_kipris_xml(xml_text: str) -> dict:
    """KIPRIS API XML 응답 파싱 → 특허 정보 dict 반환."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"[KIPRIS API] XML 파싱 오류: {e}")
        return {}

    # 결과 코드 확인
    result_code = _xt(root, ".//resultCode")
    if result_code not in ("00", "0000", ""):
        result_msg = _xt(root, ".//resultMsg")
        print(f"[KIPRIS API] 오류 응답: {result_code} {result_msg}")
        return {}

    item = root.find(".//item") or root.find(".//PatentUtilityInfo")
    if item is None:
        return {}

    return {
        "출원번호":   _xt(item, "applicationNumber"),
        "등록번호":   _xt(item, "registrationNumber"),
        "발명명칭":   _xt(item, "inventionTitle"),
        "출원인":     _xt(item, "applicantName"),
        "IPC분류":   _xt(item, "ipcNumber"),
        "출원일":     _xt(item, "applicationDate"),
        "공개일":     _xt(item, "openDate") or _xt(item, "publicationDate"),
        "등록일":     _xt(item, "registrationDate"),
        "등록상태":   _xt(item, "registerStatus"),
        "요약":       _xt(item, "astrtCont")[:300] if _xt(item, "astrtCont") else "",
        "출처":       "KIPRIS API",
    }


def _xt(element, path: str) -> str:
    """XML 요소에서 텍스트 안전 추출 (xpath 또는 tag명 지원)."""
    node = element.find(path)
    return (node.text or "").strip() if node is not None else ""


def _patent_info_to_text(no: str, info: dict) -> list[str]:
    """특허 정보 dict → 보고서 텍스트 행 목록."""
    lines = [f"■ {no}  [출처: {info.get('출처', '미확인')}]"]
    if info.get("발명명칭"):
        lines.append(f"  발명의 명칭: {info['발명명칭']}")
    if info.get("출원인"):
        lines.append(f"  출원인(권리자): {info['출원인']}")
    if info.get("등록번호"):
        lines.append(f"  등록번호: {info['등록번호']}")
    if info.get("IPC분류"):
        lines.append(f"  IPC 분류: {info['IPC분류']}")
    if info.get("출원일"):
        lines.append(f"  출원일: {info['출원일']}  |  등록일: {info.get('등록일', '-')}")
    if info.get("등록상태"):
        lines.append(f"  등록상태: {info['등록상태']}")
    if info.get("요약"):
        lines.append(f"  요약: {info['요약'][:200]}")
    return lines


# ── 에이전트 ───────────────────────────────────────────────────────────────────

def agent_patent(state: CustomsState) -> CustomsState:
    """첨부문서에서 특허번호를 추출하고 KIPRIS API·LLM으로 로열티 과세 영향을 분석한다."""
    print("\n[Agent] 특허정보조회 시작")

    source_text = (state.get("ocr_result") or "") + (state.get("summary_result") or "")
    company_id  = scoped_company_id(state) or "미지정"

    # 기업 맥락: 관계망·HS 검증 결과에서 핵심 정보 추출
    context = (
        f"기업ID: {company_id}\n" +
        (state.get("network_result")   or "")[:300] + "\n" +
        (state.get("hs_verify_result") or "")[:200] + "\n" +
        (state.get("db_result")        or "")[:200]
    ).strip()

    # ── 특허번호·로열티 탐지 ────────────────────────────────────────────────────
    found_nos   = list({m.group().replace(" ", "").upper()
                        for m in _PATENT_PATTERN.finditer(source_text)})
    has_royalty = bool(_ROYALTY_PATTERN.search(source_text))

    lines = [
        "[특허정보조회 결과]",
        f"조회 방식: {'KIPRIS Open API' if KIPRIS_API_KEY else 'LLM 특허 분석'}",
        f"문서에서 추출된 특허번호: {', '.join(found_nos) if found_nos else '없음'}",
        f"로열티·사용료 조항 탐지: {'있음 ⚠️' if has_royalty else '없음'}",
        "",
    ]

    patent_details: list[str] = []

    # ── ① KIPRIS API 조회 (한국 특허) ─────────────────────────────────────────
    if found_nos and KIPRIS_API_KEY and httpx:
        print(f"[KIPRIS API] 특허 조회 중: {found_nos}")
        for raw_no in found_nos:
            if raw_no.upper().startswith("KR"):
                norm = _normalize_kr_no(raw_no)
                info = _call_kipris_by_regno(norm) if norm else {}
                if not info:
                    # 키워드 검색으로 재시도
                    info = _call_kipris_advanced(raw_no)
            else:
                # 해외 특허 — KIPRIS 미지원, LLM 분석으로 전달
                info = {
                    "발명명칭": f"{raw_no} — KIPRIS 미지원 (해외 특허)",
                    "출처": "미조회",
                }

            if info:
                patent_details.extend(_patent_info_to_text(raw_no, info))
                patent_details.append("")
            else:
                patent_details += [f"■ {raw_no}", "  KIPRIS 조회 결과 없음", ""]

    # ── ② LLM 특허 분석 (API 키 없거나 특허번호 없을 때) ────────────────────
    elif found_nos and llm:
        print("[Patent] LLM 특허 분석 중...")
        try:
            llm_patent = llm.invoke(
                _LLM_PATENT_LOOKUP_PROMPT.format(
                    patent_nos=", ".join(found_nos),
                    context=context[:600],
                )
            ).content
            patent_details.append("■ [LLM 특허 분석]")
            patent_details.append(llm_patent)
            patent_details.append("")
        except Exception as exc:
            print(f"[Patent] LLM 특허 분석 실패: {exc}")
            for no in found_nos:
                patent_details += [f"■ {no}", "  특허 정보 조회 실패", ""]

    elif found_nos:
        # API 키도 LLM도 없는 경우 — 특허번호 목록만 표시
        for no in found_nos:
            patent_details += [
                f"■ {no}",
                "  KIPRIS_API_KEY 또는 LLM 미설정 — 특허청 직접 확인 필요",
                f"  조회: https://www.kipris.or.kr (검색어: {no})",
                "",
            ]
    else:
        lines.append("※ 문서에서 특허번호가 탐지되지 않았습니다.")
        lines.append("  → 계약서·라이선스 계약서 입수 후 특허번호 확인 권장")
        lines.append("")

    lines.extend(patent_details)

    # ── 종합 검토 의견 (하드코딩 제거, 기업 맥락 반영) ─────────────────────────
    lines += [
        "[종합 검토 의견]",
        "- 특허권자와 수입물품 생산·공급 간 관련성을 계약서로 확인하세요.",
        "- 관세법 제30조 제1항 나목: 로열티가 '수입의 조건'으로 지급된 경우 과세가격 가산.",
        "- 특허권자가 특수관계인이면 이전가격 문서(Arm's Length 입증) 함께 확보 필요.",
        f"- 로열티 조항{'이 탐지되었으므로' if has_royalty else '이 탐지되지 않았으나'} "
        "기술사용계약서·라이선스 계약서 원본 확인을 권장합니다.",
    ]

    patent_raw = "\n".join(lines)

    # ── ③ LLM 로열티 과세 심층 분석 ──────────────────────────────────────────
    if llm:
        try:
            if found_nos or has_royalty:
                analysis = llm.invoke(
                    _LLM_ROYALTY_ANALYSIS_PROMPT.format(patent_raw=patent_raw[:4000])
                ).content
            else:
                # 특허번호도 로열티도 없을 때 → 잠재 위험 분석
                analysis = llm.invoke(
                    _LLM_NO_PATENT_PROMPT.format(context=context[:800])
                ).content
            patent_result = patent_raw + "\n\n[AI 로열티 과세 분석]\n" + analysis
        except Exception as exc:
            print(f"[Agent] 특허정보조회 LLM 분석 실패: {exc}")
            patent_result = patent_raw
    else:
        patent_result = patent_raw

    print(f"[Agent] 특허정보조회 완료 (API={'사용' if KIPRIS_API_KEY else '미사용'})")
    return {**state, "patent_result": patent_result}
