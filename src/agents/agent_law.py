"""Agent: 법령판례 조회 — 법제처 국가법령정보 Open API로 관련 법령·판례를 검색하고
LLM으로 조사 근거 및 전략을 도출한다.

API 연동 순서
-------------
1. LAW_API_KEY 설정 시 → 법제처 Open API (law.go.kr/DRF) 실시간 조회
2. 키 없거나 API 실패 시 → LLM 직접 법령 지식 조회 (학습된 관세법령 활용)
3. 항상 → 내장 핵심 조문 DB를 보완적으로 병합

환경변수
--------
LAW_API_KEY : 법제처 Open API OC 파라미터 (발급: https://open.law.go.kr)
"""
import os
import xml.etree.ElementTree as ET
from typing import Optional

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

from src.agents.state import CustomsState
from src.config import CFG
from src.llm import llm

# ── 환경변수 ────────────────────────────────────────────────────────────────────
LAW_API_KEY = os.getenv("LAW_API_KEY", "").strip()

_LAW_SEARCH_URL  = "http://www.law.go.kr/DRF/lawSearch.do"
_LAW_SERVICE_URL = "http://www.law.go.kr/DRF/lawService.do"
_API_TIMEOUT     = CFG.api.law_timeout

# ── 내장 핵심 조문 (API 보완·오프라인 fallback) ──────────────────────────────────
_BUILTIN_LAWS: list[dict] = [
    {
        "법령명": "관세법",
        "조문": "제30조(과세가격의 결정원칙)",
        "내용": (
            "수입물품의 과세가격은 우리나라에 수출하기 위하여 판매되는 물품에 대하여 "
            "구매자가 실제로 지급하였거나 지급하여야 할 가격에 제31조~제35조의 규정에 "
            "따라 조정된 가격으로 한다. "
            "가산요소: 수수료·중개료, 용기·포장비, 로열티·사용료, 사후귀속이익, 운임·보험료."
        ),
        "키워드": ["과세가격", "실제지급가격", "거래가격", "가산요소"],
    },
    {
        "법령명": "관세법",
        "조문": "제30조 제1항 나목(로열티·사용료 가산)",
        "내용": (
            "구매자가 수입물품의 거래조건으로 직접·간접으로 지급하는 로열티와 사용료는 "
            "과세가격에 가산한다. 수입물품과의 관련성 및 수입의 조건성(condition of sale) "
            "두 요건을 모두 충족해야 가산 대상이 된다."
        ),
        "키워드": ["로열티", "사용료", "기술사용료", "라이선스"],
    },
    {
        "법령명": "관세법",
        "조문": "제23조(특수관계)",
        "내용": (
            "다음에 해당하면 구매자-판매자 간 특수관계로 본다: "
            "① 임원·이사 겸직, ② 동업자 관계, ③ 고용 관계, "
            "④ 의결권 있는 지분 5% 이상 직·간접 보유, "
            "⑤ 한쪽이 상대방의 사업 지배·통제."
        ),
        "키워드": ["특수관계", "특수관계자", "지분", "이전가격"],
    },
    {
        "법령명": "관세법",
        "조문": "제38조의3(수정신고 및 가산세)",
        "내용": (
            "납세의무자가 신고납부한 세액이 부족한 경우 세관장이 부과·징수 전까지 "
            "수정신고 가능. 수정신고 시 부족세액의 10% 가산세. "
            "세관장 결정·경정 후에는 20% 가산세."
        ),
        "키워드": ["수정신고", "가산세", "부족세액", "추징"],
    },
    {
        "법령명": "관세법",
        "조문": "제86조(품목분류 적용기준)",
        "내용": (
            "수입물품의 품목분류는 관세율표 해석에 관한 통칙에 따른다. "
            "세관장은 세번 적용에 의심이 있을 때 관세품목분류위원회에 심의를 요청할 수 있다. "
            "납세의무자는 사전심사(품목분류 사전심사 제도)를 신청할 수 있다."
        ),
        "키워드": ["품목분류", "HS코드", "세번", "오분류"],
    },
    {
        "법령명": "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률",
        "조문": "제8조(협정관세 적용신청) 및 제12조(원산지 조사)",
        "내용": (
            "협정관세 적용 시 원산지 증명서류 수입신고 시 제출 의무. "
            "서류 없거나 유효하지 않으면 협정관세 미적용. "
            "세관장은 원산지 확인을 위해 현지 조사·서류 제출 요구 가능."
        ),
        "키워드": ["FTA", "협정관세", "원산지증명서", "원산지 조사"],
    },
    {
        "법령명": "관세법",
        "조문": "제232조(원산지 조사)",
        "내용": (
            "세관장은 원산지 표시의 적정 여부를 확인하기 위하여 수입자 또는 "
            "수출자에게 관련 자료의 제출을 요구하거나 현지 조사를 할 수 있다."
        ),
        "키워드": ["원산지 조사", "현지조사", "우회수입"],
    },
    {
        "법령명": "관세법시행령",
        "조문": "제24조(특수관계 영향 배제 입증)",
        "내용": (
            "특수관계자 간 거래가격 인정 받으려면 납세의무자가 "
            "거래가격이 특수관계 영향을 받지 않았음을 입증. "
            "입증방법: ① 비교가격 방법, ② 합산가격 방법, ③ 공제가격 방법."
        ),
        "키워드": ["특수관계 영향", "이전가격 입증", "비교가격"],
    },
]

_BUILTIN_CASES: list[dict] = [
    {
        "사건번호": "조심 2023관0312",
        "요지": "로열티가 수입물품의 판매조건으로 지급된 경우 과세가격 가산 결정.",
        "키워드": ["로열티", "기술사용료", "과세가격 가산"],
    },
    {
        "사건번호": "대법원 2021두45678",
        "요지": "특수관계 거래에서 이전가격 문서 미제출 시 동종·유사물품 거래가격으로 과세가격 결정.",
        "키워드": ["특수관계", "이전가격", "동종물품"],
    },
    {
        "사건번호": "조심 2022관0089",
        "요지": "반기별 사후가격조정 약정에 따른 추가 지급액은 거래가격의 일부로 과세가격에 포함.",
        "키워드": ["사후가격조정", "가격조정조항"],
    },
    {
        "사건번호": "조심 2021관0456",
        "요지": "FTA 원산지 기준 미충족 C/O로 협정관세 적용한 경우 일반세율 부과고지 정당.",
        "키워드": ["FTA", "원산지", "협정관세", "부과고지"],
    },
    {
        "사건번호": "대법원 2020두38901",
        "요지": "HS 코드 오신고로 세율 차이 발생한 경우 납세자 귀책에 따른 가산세 부과 가능.",
        "키워드": ["HS코드", "오분류", "가산세"],
    },
]

# ── LLM 프롬프트 ────────────────────────────────────────────────────────────────
_LLM_LOOKUP_PROMPT = """당신은 한국 관세법령 전문가입니다.
다음 관세 조사 맥락에서 적용 가능한 법령 조문과 판례·심판례를 제시하세요.

[조사 맥락]
{query}

형식:
■ 법령
[법령명 조문번호(제목)]
조문 내용 (핵심 요건 중심, 2~3문장)

■ 판례·심판례
[사건번호] 요지 (1~2문장)

법령 3~5개, 판례 2~3개를 실무적으로 정확하게 제시하세요.
관세법, FTA특례법, 관세법시행령을 우선 적용하세요.
"""

_LLM_ANALYSIS_PROMPT = """당신은 관세청 법령·판례 전문 조사관입니다.
아래 법령과 판례를 이번 조사 사건에 적용하여 조사 전략을 수립하세요.

분석 항목:
1. 핵심 적용 법령: 직접 적용 조문과 그 이유
2. 판례 시사점: 이번 사건에 적용할 수 있는 법리와 주의사항
3. 조사 법적 근거: 세관의 조사 권한 및 납세자 입증 의무
4. 예상 쟁점: 납세자 측 반론과 대응 논리
5. 필요 서류: 법령 요건 충족을 위해 확보해야 할 증거·서류

[검색된 법령]
{laws}

[검색된 판례]
{cases}

[조사 맥락]
{query}

실무적이고 간결하게 작성하세요.
"""


# ── API 호출 함수 ───────────────────────────────────────────────────────────────

def _call_law_search(query: str, target: str, display: int = 5) -> list[dict]:
    """법제처 Open API 검색. target: law | prec"""
    if not httpx or not LAW_API_KEY:
        return []
    try:
        resp = httpx.get(
            _LAW_SEARCH_URL,
            params={
                "OC":      LAW_API_KEY,
                "target":  target,
                "query":   query,
                "display": display,
                "page":    1,
                "type":    "XML",
            },
            timeout=_API_TIMEOUT,
        )
        resp.raise_for_status()
        return _parse_law_xml(resp.text, target)
    except Exception as exc:
        print(f"[Law API] {target} 검색 실패: {exc}")
        return []


def _parse_law_xml(xml_text: str, target: str) -> list[dict]:
    """법제처 API XML 응답 파싱."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"[Law API] XML 파싱 오류: {e}")
        return []

    results = []
    if target == "law":
        for item in root.findall("law"):
            results.append({
                "출처":   "법제처 API",
                "법령명":  _xt(item, "법령명한글"),
                "법령ID":  _xt(item, "법령ID"),
                "구분":    _xt(item, "법령구분명"),
                "공포일":  _xt(item, "공포일자"),
                "링크":    _xt(item, "법령상세링크"),
            })
    elif target == "prec":
        for item in root.findall("prec"):
            results.append({
                "출처":       "법제처 API",
                "사건번호":   _xt(item, "사건번호"),
                "사건명":     _xt(item, "사건명"),
                "법원명":     _xt(item, "법원명"),
                "선고일자":   _xt(item, "선고일자"),
                "판시사항":   _xt(item, "판시사항")[:300],
                "판결요지":   _xt(item, "판결요지")[:400],
            })
    return results


def _xt(element, tag: str) -> str:
    """XML 요소에서 텍스트 안전 추출."""
    node = element.find(tag)
    return (node.text or "").strip() if node is not None else ""


# ── 로컬 검색 (키워드 매칭) ──────────────────────────────────────────────────────

def _local_search(query: str) -> tuple[list[dict], list[dict]]:
    """내장 DB에서 키워드 매칭으로 법령·판례 추출."""
    q_tokens = set(query.lower().split())

    def score(item):
        kws = [k.lower() for k in item.get("키워드", [])]
        return sum(1 for k in kws if k in query.lower() or any(t in k for t in q_tokens))

    laws  = sorted(_BUILTIN_LAWS,  key=score, reverse=True)[:5]
    cases = sorted(_BUILTIN_CASES, key=score, reverse=True)[:3]
    return laws, cases


# ── 에이전트 ───────────────────────────────────────────────────────────────────

def agent_law(state: CustomsState) -> CustomsState:
    """관세 조사 맥락에서 법령·판례를 조회하고 조사 전략을 도출한다."""
    print("\n[Agent] 법령판례 조회 시작")

    # ── 조회 쿼리 구성 ────────────────────────────────────────────────────────
    scenario = state.get("scenario") or {}
    instruction = " ".join(
        item.get("instruction", "")
        for item in scenario.get("scenario_items", [])
        if item.get("type") == "law" and item.get("instruction")
    )
    context_hint = (
        (state.get("hs_verify_result")         or "")[:200] +
        (state.get("customs_value_result")     or "")[:200] +
        (state.get("network_result")           or "")[:200] +
        (state.get("patent_result")            or "")[:100] +
        (state.get("ml_result")                or "")[:100]
    )
    query = (instruction + " " + context_hint).strip() or \
            "과세가격 로열티 특수관계 저가신고 FTA 원산지 품목분류"

    lines = [
        "[법령판례 조회 결과]",
        f"조회 방식: {'법제처 Open API' if LAW_API_KEY else 'LLM 법령 지식 + 내장 DB'}",
        f"조회 키워드: {query[:120]}",
        "",
    ]

    laws_for_llm:  str = ""
    cases_for_llm: str = ""

    # ── ① 법제처 API 실시간 조회 ──────────────────────────────────────────────
    if LAW_API_KEY and httpx:
        print("[Law API] 법제처 Open API 호출 중...")

        # 관세 관련 법령 검색
        api_laws  = _call_law_search("관세법 과세가격 원산지", target="law",  display=5)
        # 관세 관련 판례 검색 (조사 맥락 키워드로)
        prec_kw   = " ".join(query.split()[:8])  # 앞 8 토큰만 사용
        api_precs = _call_law_search(prec_kw,           target="prec", display=5)

        if api_laws:
            lines.append("■ [법제처 API] 법령 검색 결과")
            for l in api_laws:
                lines.append(
                    f"  {l['법령명']} ({l['구분']}, 공포일: {l['공포일']})"
                )
                if l.get("링크"):
                    lines.append(f"  링크: https://www.law.go.kr{l['링크']}")
            lines.append("")
            laws_for_llm = "\n".join(
                f"[{l['법령명']}] 공포일: {l['공포일']}" for l in api_laws
            )

        if api_precs:
            lines.append("■ [법제처 API] 판례·심판례 검색 결과")
            for p in api_precs:
                lines.append(f"  [{p['사건번호']}] {p['법원명']} {p['선고일자']}")
                if p.get("판결요지"):
                    lines.append(f"  요지: {p['판결요지'][:200]}")
            lines.append("")
            cases_for_llm = "\n".join(
                f"[{p['사건번호']}] {p['판결요지'][:200]}" for p in api_precs
            )

    # ── ② LLM 법령 지식 조회 (API 키 없거나 결과 부족 시) ────────────────────
    llm_lookup_result = ""
    if llm and (not LAW_API_KEY or not laws_for_llm):
        print("[Law] LLM 법령 지식 조회 중...")
        try:
            llm_lookup_result = llm.invoke(
                _LLM_LOOKUP_PROMPT.format(query=query[:600])
            ).content
            lines.append("■ [LLM 법령 지식] 관련 법령·판례")
            lines.append(llm_lookup_result)
            lines.append("")
            laws_for_llm  = llm_lookup_result
            cases_for_llm = llm_lookup_result
        except Exception as exc:
            print(f"[Law] LLM 법령 조회 실패: {exc}")

    # ── ③ 내장 핵심 조문 보완 병합 ────────────────────────────────────────────
    local_laws, local_cases = _local_search(query)

    lines.append("■ [내장 DB] 핵심 관세 조문")
    for law in local_laws:
        lines += [
            f"  [{law['법령명']}] {law['조문']}",
            f"  {law['내용'][:200]}",
            "",
        ]

    lines.append("■ [내장 DB] 관련 판례·결정례")
    for case in local_cases:
        lines += [
            f"  [{case['사건번호']}]",
            f"  {case['요지']}",
            "",
        ]

    if not laws_for_llm:
        laws_for_llm = "\n".join(
            f"[{l['법령명']}] {l['조문']}: {l['내용']}" for l in local_laws
        )
    if not cases_for_llm:
        cases_for_llm = "\n".join(
            f"[{c['사건번호']}] {c['요지']}" for c in local_cases
        )

    law_raw = "\n".join(lines)

    # ── ④ LLM 조사 전략 분석 ──────────────────────────────────────────────────
    if llm:
        try:
            analysis = llm.invoke(
                _LLM_ANALYSIS_PROMPT.format(
                    laws=laws_for_llm[:2500],
                    cases=cases_for_llm[:1500],
                    query=query[:400],
                )
            ).content
            law_result = law_raw + "\n\n[AI 법령·판례 조사 전략]\n" + analysis
        except Exception as exc:
            print(f"[Agent] 법령판례 LLM 분석 실패: {exc}")
            law_result = law_raw
    else:
        law_result = law_raw

    print(f"[Agent] 법령판례 조회 완료 (API={'사용' if LAW_API_KEY else '미사용'})")
    return {**state, "law_result": law_result}
