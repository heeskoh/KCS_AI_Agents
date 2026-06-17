"""Agent: 최종 결과 종합 — 선행 단계 결과를 사용자가 지정한 최종 결과 형식으로 통합한다.

홈 컴포저에서 여러 AI 서비스를 순서대로 실행한 뒤, 각 단계 결과(step_results)와
사용자가 입력한 '최종 결과' 지시문을 LLM에 전달하여 하나의 결과물로 종합한다.
보고서 생성(agent_report)과 달리 고정 5섹션 형식이 아니라, 사용자가 요청한
형식·구성에 맞춰 자유롭게 결과를 구성한다.
"""
from src.agents.state import CustomsState
from src.llm import llm

_PROMPT = """당신은 관세·수사 분석 결과를 종합하는 AI입니다.
아래는 사용자가 선택한 여러 AI 서비스가 순서대로 수행한 분석 결과입니다.
사용자가 요청한 '최종 결과' 형식·구성에 맞춰 이 결과들을 하나의 결과물로 종합하세요.

규칙:
- 근거 없는 추론은 피하고, 각 단계 결과에 실제로 포함된 내용만 사용하세요.
- 단계 간 상충되는 내용이 있으면 그 사실을 함께 명시하세요.
- 사용자 요청 형식이 비어 있으면 핵심 발견사항·결론·후속조치 순으로 정리하세요.

[사용자 최종 결과 요청]
{instruction}

[단계별 분석 결과]
{results}
"""


def _collect_step_results(state: CustomsState) -> list[dict]:
    """선행 단계에서 축적된 결과(step_results)를 순서대로 수집한다."""
    step_results = state.get("step_results") or []
    return [
        {
            "label": r.get("label") or r.get("key") or "AI서비스",
            "result": (r.get("result") or "").strip(),
        }
        for r in step_results
        if (r.get("result") or "").strip()
    ]


def _synthesis_instruction(state: CustomsState) -> str:
    """현재 종합 단계의 사용자 지시문(최종 결과 요청)을 추출한다."""
    scenario = state.get("scenario") or {}
    parts = [
        item.get("instruction", "")
        for item in scenario.get("scenario_items", [])
        if item.get("type") == "result_synthesis" and item.get("instruction")
    ]
    return "\n".join(p for p in parts if p).strip()


def _fallback(instruction: str, results: list[dict]) -> str:
    lines = ["# 최종 결과 종합", ""]
    if instruction:
        lines += [f"> 요청 형식: {instruction}", ""]
    lines.append(f"총 {len(results)}개 AI 서비스 결과를 단계 순서대로 통합했습니다. (LLM 미사용)")
    lines.append("")
    for r in results:
        lines += [f"## {r['label']}", r["result"], ""]
    return "\n".join(lines)


def agent_result_synthesis(state: CustomsState) -> CustomsState:
    """선행 단계 결과를 사용자 지정 형식으로 종합한다."""
    print("[Agent] 최종 결과 종합 시작")

    results = _collect_step_results(state)
    instruction = _synthesis_instruction(state)

    if not results:
        out = "종합할 선행 단계 결과가 없습니다. 종합 단계 앞에 1개 이상의 AI 서비스를 배치하세요."
        print("[Agent] 최종 결과 종합 — 선행 결과 없음")
        return {**state, "result_synthesis_result": out}

    joined = "\n\n".join(f"### {r['label']}\n{r['result'][:3000]}" for r in results)

    if llm:
        try:
            out = llm.invoke(
                _PROMPT.format(instruction=instruction or "(지정 없음)", results=joined[:12000])
            ).content
        except Exception as exc:
            print(f"[Agent] 최종 결과 종합 LLM 실패: {exc}")
            out = _fallback(instruction, results)
    else:
        out = _fallback(instruction, results)

    print("[Agent] 최종 결과 종합 완료")
    return {**state, "result_synthesis_result": out}
