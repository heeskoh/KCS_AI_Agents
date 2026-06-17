"""Agent: 문서 번역 — 입력 문서·텍스트를 지정한 대상 언어로 번역한다."""
from src.agents.state import CustomsState
from src.llm import llm

_LANG_LABEL = {
    "auto": "자동 감지",
    "ko": "한국어",
    "en": "영어(English)",
    "zh": "중국어(中文)",
    "ja": "일본어(日本語)",
}

_PROMPT = """당신은 관세·무역 문서 전문 번역가입니다.
아래 [원문]을 {target} 으로 번역하세요.

번역 지침:
- 원문 언어: {source}
- 결과 언어: {target}
- 관세·무역·법률 전문 용어는 정확하게 옮기고, 고유명사·금액·단위·날짜는 원형을 유지하세요.
- 표·목록 등 원문의 구조를 최대한 보존하세요.
- 번역 결과만 출력하고 부연 설명은 덧붙이지 마세요.

[원문]
{content}
"""

_FALLBACK = """[문서 번역 결과]
LLM 미사용 — 번역을 수행할 수 없어 원문을 그대로 표시합니다.

- 원본 언어: {source}
- 대상 언어: {target}

{content}
"""


def _collect_input_text(state: CustomsState) -> str:
    """번역 대상 텍스트를 수집한다. 패널 직접입력 → 업로드 파일 원문 순."""
    scenario = state.get("scenario") or {}

    direct = str(scenario.get("translate_input") or "").strip()
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


def agent_translate(state: CustomsState) -> CustomsState:
    """입력 문서·텍스트를 대상 언어로 번역한다."""
    print("[Agent] 문서 번역 시작")

    scenario = state.get("scenario") or {}
    source = _LANG_LABEL.get(str(scenario.get("translate_source_lang") or "auto"), "자동 감지")
    target = _LANG_LABEL.get(str(scenario.get("translate_target_lang") or "ko"), "한국어")
    content = _collect_input_text(state)

    if not content:
        result = "번역할 문서·텍스트가 없습니다. 원문을 입력하거나 파일을 첨부하세요."
        print("[Agent] 문서 번역 - 입력 없음")
        return {**state, "translate_result": result}

    if llm:
        try:
            result = llm.invoke(
                _PROMPT.format(source=source, target=target, content=content[:6000])
            ).content
        except Exception as exc:
            print(f"[Agent] 문서 번역 LLM 실패: {exc}")
            result = _FALLBACK.format(source=source, target=target, content=content[:3000])
    else:
        result = _FALLBACK.format(source=source, target=target, content=content[:3000])

    print("[Agent] 문서 번역 완료")
    return {**state, "translate_result": result}
