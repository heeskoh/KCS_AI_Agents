"""Agent: 표준 보고서 생성 — 표준 보고서(출력 템플릿)의 형식·구성에 맞춰 신규 보고서를 작성한다."""
from src.agents.state import CustomsState
from src.llm import llm

_PROMPT = """당신은 관세청 표준 보고서 작성 전문가입니다.
[표준 보고서 템플릿]의 형식·구성·문체·항목 순서를 그대로 따르되,
[신규 보고서 내용]을 반영하여 새로운 보고서를 작성하세요.

작성 지침:
- 템플릿의 제목·섹션·표·항목 구조를 동일하게 유지하세요.
- 각 섹션에는 [신규 보고서 내용]에서 해당하는 정보를 채우세요.
- 템플릿에는 있으나 신규 내용에 정보가 없는 항목은 "(해당 없음)" 또는 "(확인 필요)"로 표기하세요.
- 내용을 임의로 지어내지 말고 제공된 내용에 근거하여 작성하세요.

[표준 보고서 템플릿]
{template}

[신규 보고서 내용]
{content}
"""

_FALLBACK = """[표준 보고서 생성 결과]
LLM 미사용 — 아래는 입력한 신규 내용과 템플릿 원문입니다.

## 표준 템플릿
{template}

## 신규 내용
{content}
"""


def agent_report_standard(state: CustomsState) -> CustomsState:
    """표준 보고서 템플릿 형식에 맞춰 신규 보고서를 생성한다."""
    print("[Agent] 표준 보고서 생성 시작")

    scenario = state.get("scenario") or {}
    content = str(scenario.get("report_content") or "").strip()
    template = str(scenario.get("report_template") or "").strip()

    # 신규 내용이 패널에 없으면 선행 단계 결과/업로드 원문을 보조 입력으로 사용
    if not content:
        for key in ("final_report", "summary_result", "text_summary_result"):
            if state.get(key):
                content = str(state.get(key))
                break
    if not content:
        for f in scenario.get("uploaded_files") or []:
            if f.get("encoding") == "text" and f.get("content"):
                content = str(f.get("content") or "")[:4000]
                break

    if not template:
        result = "표준 보고서(출력 템플릿)가 없습니다. 표준이 되는 보고서 형식을 입력하세요."
        print("[Agent] 표준 보고서 생성 - 템플릿 없음")
        return {**state, "report_standard_result": result}
    if not content:
        result = "신규 보고서 내용이 없습니다. 보고서에 담을 내용을 입력하세요."
        print("[Agent] 표준 보고서 생성 - 신규 내용 없음")
        return {**state, "report_standard_result": result}

    if llm:
        try:
            result = llm.invoke(
                _PROMPT.format(template=template[:4000], content=content[:4000])
            ).content
        except Exception as exc:
            print(f"[Agent] 표준 보고서 생성 LLM 실패: {exc}")
            result = _FALLBACK.format(template=template[:2500], content=content[:2500])
    else:
        result = _FALLBACK.format(template=template[:2500], content=content[:2500])

    print("[Agent] 표준 보고서 생성 완료")
    return {**state, "report_standard_result": result}
