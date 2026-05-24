from src.agents.state import CustomsState
from src.llm import llm

# Maps scenario item type → state result key (same as agent_report.py)
_TYPE_TO_KEY: dict[str, str] = {
    "company":              "company_result",
    "db":                   "db_result",
    "rag_customs":          "rag_result",
    "rag_trade":            "rag_result",
    "rag_audit":            "rag_result",
    "rag_investigation":    "rag_result",
    "rag_global":           "rag_result",
    "audit_search":         "audit_search_result",
    "bigdata":              "bigdata_result",
    "ml":                   "ml_result",
    "web":                  "web_result",
    "ocr":                  "ocr_result",
    "network":              "network_result",
    "declaration_verify":   "declaration_verify_result",
    "hs_verify":            "hs_verify_result",
    "customs_value":        "customs_value_result",
    "summary":              "summary_result",
    "patent":               "patent_result",
    "rag_create":           "rag_create_result",
    "law":                  "law_result",
    "ontology":             "ontology_result",
}

VALIDATION_PROMPT = """당신은 관세 조사보고서 검증 전문 Agent입니다.
아래 최종 보고서와 각 에이전트 분석 결과를 대조 검토하세요.

검증 기준:
1. **근거 포함 여부**: 각 에이전트 분석 결과의 핵심 발견사항이 보고서에 반영되었는지
2. **법령 참조 검증**: 보고서에 인용된 법령 조문이 실제 법령 DB 조회 결과와 일치하는지
3. **특허·로열티 반영**: 특허 에이전트 결과의 로열티 가산 여부 판단이 보고서에 포함되었는지
4. **과도한 추론 여부**: 근거 없는 단정·추측성 표현 여부
5. **DB/RAG/빅데이터/웹 근거 간 모순**: 각 소스 간 상충하는 내용이 있는지
6. **외부 정보 URL 존재**: 웹 검색 결과 인용 시 URL이 포함되었는지
7. **조사 우선순위 적정성**: 보고서의 즉시·단기·중기 조치 방향이 분석 결과와 일치하는지

출력 형식:
1. 검증 결과: 통과 / 보완 필요
2. 에이전트 결과 반영률: X/Y 에이전트 핵심 발견사항 반영
3. 근거 충실도: (상/중/하) — 이유
4. 리스크 판단 일관성: 각 에이전트 결과와 보고서 위험 판단의 일치 여부
5. 외부 정보 참고 검증: URL 포함 여부 및 관련성
6. 법령·판례 검증: 인용 법령 정확성
7. 보완 권고: 구체적인 수정 방향 (항목별)

[최종 보고서]
{final_report}

[에이전트 분석 결과]
{agent_results}
"""

_FALLBACK_VALIDATION = """1. 검증 결과: 보완 필요
2. 에이전트 결과 반영률: LLM 미설정으로 자동 검증 생략 — 수동 확인 필요
3. 근거 충실도: 중 — LLM 패키지가 없어 심층 검증은 생략되었습니다.
4. 리스크 판단 일관성: DB, RAG, 빅데이터 결과가 보고서에 포함되어 있는지 수동 확인이 필요합니다.
5. 외부 정보 참고 검증: 검색 API 또는 LLM 미설정 시 URL 근거가 없을 수 있습니다.
6. 법령·판례 검증: 실제 조사보고서 제출 전 원문 증빙과 법령 근거를 대조하세요.
7. 보완 권고: 각 에이전트 결과를 보고서와 수동으로 대조하고 법령 인용 정확성을 확인하세요."""


def _collect_agent_results(state: CustomsState) -> str:
    """실행된 모든 에이전트 결과를 수집하여 검증용 텍스트로 반환한다."""
    scenario = state.get("scenario") or {}
    items = sorted(
        scenario.get("scenario_items") or [],
        key=lambda x: x.get("order", 999),
    )

    seen_keys: set[str] = set()
    parts: list[str] = []

    for item in items:
        itype = item.get("type") or ""
        if itype in ("report", "validation"):
            continue
        state_key = _TYPE_TO_KEY.get(itype)
        if not state_key or state_key in seen_keys:
            continue
        value = state.get(state_key)
        if value:
            seen_keys.add(state_key)
            label = item.get("label") or itype
            parts.append(f"[{label}]\n{str(value)[:600]}")

    # 시나리오에 없어도 state에 있는 주요 결과 추가
    extra_keys = [
        ("web_result", "웹검색"),
        ("patent_result", "특허정보조회"),
        ("law_result", "법령판례"),
        ("ontology_result", "관세온톨로지"),
    ]
    for key, label in extra_keys:
        if key not in seen_keys and state.get(key):
            parts.append(f"[{label}]\n{str(state[key])[:400]}")

    return "\n\n".join(parts) if parts else "실행된 에이전트 결과 없음"


def agent_validate(state: CustomsState) -> CustomsState:
    """생성된 보고서를 모든 에이전트 결과와 대조하여 검증한다."""
    print("\n[Agent] 보고서 검증 시작")

    final_report = state.get("final_report") or "보고서 없음"
    agent_results = _collect_agent_results(state)

    # 에이전트 수 파악
    scenario = state.get("scenario") or {}
    items = scenario.get("scenario_items") or []
    agent_count = sum(
        1 for item in items
        if item.get("type") not in ("report", "validation")
        and _TYPE_TO_KEY.get(item.get("type") or "")
        and state.get(_TYPE_TO_KEY[item.get("type")])
    )

    if llm:
        prompt = VALIDATION_PROMPT.format(
            final_report=final_report[:3000],
            agent_results=agent_results[:3000],
        )
        result = llm.invoke(prompt).content
    else:
        result = _FALLBACK_VALIDATION

    # 에이전트 실행 현황 헤더 추가
    header = f"[보고서 검증 결과]\n검증 대상 보고서: {'있음' if final_report != '보고서 없음' else '없음'}\n참조 에이전트 결과: {agent_count}개\n\n"
    validation_result = header + result

    print("[Agent] 보고서 검증 완료")
    return {**state, "validation_result": validation_result}
