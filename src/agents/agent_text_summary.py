"""Agent: 요약 — 입력 문서·텍스트를 지정한 결과 형식으로 요약한다."""
from src.agents.state import CustomsState
from src.llm import llm

_FORMAT_GUIDE = {
    "bullet": "핵심 사항을 5~8개의 불릿(•)으로 간결하게 정리하세요.",
    "table": "주요 항목을 | 항목 | 내용 | 형태의 마크다운 표로 정리하세요.",
    "narrative": "3~5개 문단의 서술형 요약문으로 정리하세요.",
    "custom": "아래 [사용자 템플릿]의 형식과 항목 구성에 정확히 맞춰 요약하세요.",
}

_PROMPT = """당신은 관세·무역 문서 요약 전문가입니다.
아래 [원문]을 요청한 결과 형식으로 요약하세요.

결과 형식 지침:
{format_guide}
{template_block}

[원문]
{content}
"""

_FALLBACK = """[요약 결과]
LLM 미사용 — 아래는 입력 원문의 일부입니다.

{content}
"""


def _collect_input_text(state: CustomsState) -> str:
    scenario = state.get("scenario") or {}

    direct = str(scenario.get("summary_input") or "").strip()
    if direct:
        return direct

    parts: list[str] = []
    for f in scenario.get("uploaded_files") or []:
        if f.get("encoding") == "text" and f.get("content"):
            parts.append(str(f.get("content") or "")[:3000])
    if parts:
        return "\n\n".join(parts)

    ocr = state.get("ocr_result")
    if ocr:
        return str(ocr)[:3000]

    return ""


def agent_text_summary(state: CustomsState) -> CustomsState:
    """입력 문서·텍스트를 지정 형식으로 요약한다."""
    print("[Agent] 요약 시작")

    scenario = state.get("scenario") or {}
    fmt = str(scenario.get("summary_format") or "bullet")
    template = str(scenario.get("summary_template") or "").strip()
    content = _collect_input_text(state)

    if not content:
        result = "요약할 문서·텍스트가 없습니다. 원문을 입력하거나 파일을 첨부하세요."
        print("[Agent] 요약 - 입력 없음")
        return {**state, "text_summary_result": result}

    format_guide = _FORMAT_GUIDE.get(fmt, _FORMAT_GUIDE["bullet"])
    template_block = f"\n[사용자 템플릿]\n{template}" if (fmt == "custom" and template) else ""

    if llm:
        try:
            result = llm.invoke(
                _PROMPT.format(
                    format_guide=format_guide,
                    template_block=template_block,
                    content=content[:6000],
                )
            ).content
        except Exception as exc:
            print(f"[Agent] 요약 LLM 실패: {exc}")
            result = _FALLBACK.format(content=content[:3000])
    else:
        result = _FALLBACK.format(content=content[:3000])

    print("[Agent] 요약 완료")
    return {**state, "text_summary_result": result}
