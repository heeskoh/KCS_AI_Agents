from src.agents.state import CustomsState
from src.llm import llm

# Maps scenario item type → state result key
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

REPORT_PROMPT = """당신은 관세청 조사 전문 AI입니다.
아래 에이전트 분석 결과를 통합하여 공식 조사보고서 초안을 작성하세요.

[기업 기본정보]
{company_result}

[에이전트 분석 결과 전체]
{agent_results}

보고서 형식 (반드시 아래 순서와 번호를 사용하세요):

1. 업체 개요
   업체명, 업종, 위험등급, 주요 수입 품목, 연간 수입액, 신고 세액 등을 간략히 요약

2. 에이전트 분석 결과 통합 요약
   실행된 모든 에이전트의 핵심 발견사항을 3~5줄로 종합

3. 에이전트별 분석 결과
{agent_section_outline}

4. 조사 착안사항
   3~5개 항목. 각 항목에 관세법 또는 관련 법령·고시 근거를 명시
   예) "관세법 제30조(과세가격 결정원칙)에 따라 로열티 포함 여부 확인 필요"

5. 종합 의견 및 조사 우선순위
   종합 위험도 평가 및 즉시·단기·중기 조치 방향
"""


def _collect_preceding(state: CustomsState) -> list[dict]:
    """Return ordered list of {{label, type, result}} for agents before the report step."""
    scenario = state.get("scenario") or {}
    items = sorted(
        scenario.get("scenario_items") or [],
        key=lambda x: x.get("order", 999),
    )
    seen_keys: set[str] = set()
    results: list[dict] = []
    for item in items:
        itype = item.get("type") or ""
        if itype in ("report", "validation"):
            break
        state_key = _TYPE_TO_KEY.get(itype)
        if not state_key or state_key in seen_keys:
            continue
        value = state.get(state_key)
        if value:
            seen_keys.add(state_key)
            results.append({
                "label": item.get("label") or itype,
                "type":  itype,
                "result": value,
            })
    return results


def _fallback_report(state: CustomsState, company_result: str, preceding: list[dict]) -> str:
    company_id = state.get("company_id", "")
    lines: list[str] = ["# 조사보고서 초안\n"]

    # 1. 업체 개요
    lines += ["## 1. 업체 개요\n", company_result, ""]

    # 2. 통합 요약
    lines.append("## 2. 에이전트 분석 결과 통합 요약\n")
    if preceding:
        lines.append(f"총 {len(preceding)}개 에이전트 분석을 수행하였습니다. 각 단계의 핵심 발견사항을 종합하면 다음과 같습니다.\n")
        for r in preceding:
            first_line = r["result"].split("\n")[0].strip()
            if first_line:
                lines.append(f"- **{r['label']}**: {first_line}")
    else:
        lines.append("실행된 에이전트 결과가 없습니다.")
    lines.append("")

    # 3. 에이전트별 결과
    lines.append("## 3. 에이전트별 분석 결과\n")
    if preceding:
        for i, r in enumerate(preceding, 1):
            lines += [f"### 3-{i}. {r['label']}\n", r["result"], ""]
    else:
        lines.append("실행된 에이전트 결과가 없습니다.\n")

    # 4. 조사 착안사항 (법령 근거 포함)
    lines.append("## 4. 조사 착안사항\n")
    types = {r["type"] for r in preceding}
    hints: list[str] = []
    if "db" in types or "declaration_verify" in types:
        hints.append(
            "- **과세가격 적정성 검토**: 관세법 제30조(과세가격 결정원칙)에 따라 "
            "신고가격과 동종 품목 시장가격 간 차이를 확인하고 특수관계자 거래 여부 및 이전가격 자료를 검토하세요."
        )
    if any(t.startswith("rag") for t in types) or "law" in types:
        hints.append(
            "- **원산지 검증**: 관세법 제232조(원산지 조사) 및 FTA 특례법에 따라 "
            "원산지증명서 발급기관의 적정성과 원재료 구성 내역 일치 여부를 확인하세요."
        )
    if "hs_verify" in types:
        hints.append(
            "- **품목분류 적정성**: 관세법 제86조(품목분류 적용기준)에 따라 "
            "신고 HS 코드와 실제 물품 특성의 일치 여부 및 세율 차이로 인한 탈루 가능성을 검토하세요."
        )
    if "customs_value" in types:
        hints.append(
            "- **로열티·권리사용료 포함 여부**: 관세법 제30조 제1항 제3호에 따라 "
            "수입물품과 관련된 로열티·권리사용료가 과세가격에 적정하게 포함되었는지 확인하세요."
        )
    if "network" in types or "ml" in types:
        hints.append(
            "- **관계망 이상 거래**: 관세법 제38조의3(부과고지) 관련, "
            "수입자·공급자·중개인 간 관계망을 분석하여 거래 구조 적정성 및 자금 흐름 이상 여부를 확인하세요."
        )
    if not hints:
        hints = [
            "- **신고가격 근거 확인**: 관세법 제30조에 따라 송장가격과 실제 거래가격의 일치 여부를 확인하세요.",
            "- **특수관계자 거래 검토**: 관세법 제30조 제3항에 따른 특수관계 영향 여부를 검토하세요.",
            "- **FTA 원산지 증빙 검토**: FTA 특례법에 따라 원산지증명서 유효성 및 환급 적정성을 확인하세요.",
        ]
    lines.extend(hints[:5])
    lines.append("")

    # 5. 종합 의견
    lines.append("## 5. 종합 의견 및 조사 우선순위\n")
    lines.append(
        f"본 기업({company_id})에 대한 다각도 AI 분석 결과, 위험 징후가 복수 에이전트에 걸쳐 확인되었습니다. "
        "특히 과세가격·품목분류·원산지 측면에서 추가 서류 확인이 필요하며, "
        "수입신고 서류 일체와 계약서·송금내역·로열티 계약서를 우선 확보한 후 심층 조사를 진행할 것을 권고합니다.\n"
    )
    lines += [
        "- **즉시 조치**: 관련 수입신고 건에 대한 보정신고 또는 수정신고 안내",
        "- **단기 조치**: 원산지증명서·계약서·가격결정 근거 자료 제출 요구",
        "- **중기 조치**: 동종 업종 비교 분석 및 과거 3개년 신고 전수 검토",
    ]

    return "\n".join(lines)


def agent_report(state: CustomsState) -> CustomsState:
    """Aggregate all preceding agent results into a structured investigation report."""
    print("\n[Agent] 보고서 작성 시작")

    company_result = (
        state.get("company_result")
        or state.get("db_result")
        or "기업 기본정보 없음"
    )
    preceding = _collect_preceding(state)

    if llm:
        agent_results = "\n\n".join(
            f"[{r['label']}]\n{r['result']}" for r in preceding
        ) or "분석 결과 없음"
        agent_section_outline = "\n".join(
            f"   3-{i}. {r['label']}: 해당 에이전트 결과를 분석하여 핵심 내용 요약"
            for i, r in enumerate(preceding, 1)
        ) or "   (실행된 에이전트 없음)"
        prompt = REPORT_PROMPT.format(
            company_result=company_result,
            agent_results=agent_results,
            agent_section_outline=agent_section_outline,
        )
        report = llm.invoke(prompt).content
    else:
        report = _fallback_report(state, company_result, preceding)

    print("[Agent] 보고서 작성 완료")
    return {**state, "final_report": report}
