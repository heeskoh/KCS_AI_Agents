"""Shared helpers for OpenAI-backed simulation agents."""

from __future__ import annotations

from src.agents.state import CustomsState
from src.llm import llm


CONTEXT_KEYS = [
    "company_result",
    "db_result",
    "rag_result",
    "ocr_result",
    "ml_result",
    "network_result",
    "web_result",
    "declaration_verify_result",
    "hs_verify_result",
    "customs_value_result",
    "patent_result",
    "law_result",
]


def collect_context(state: CustomsState, limit: int = 900) -> str:
    parts: list[str] = []
    for key in CONTEXT_KEYS:
        value = state.get(key)
        if value:
            parts.append(f"[{key}]\n{str(value)[:limit]}")
    return "\n\n".join(parts) if parts else "선행 분석 결과 없음"


def scenario_prompt(state: CustomsState) -> str:
    scenario = state.get("scenario") or {}
    return scenario.get("user_prompt") or state.get("company_id") or "사용자 프롬프트 없음"


def run_llm_simulation(
    *,
    state: CustomsState,
    agent_name: str,
    mission: str,
    focus_items: list[str],
    output_format: list[str],
    fallback: str,
) -> str:
    focus = "\n".join(f"- {item}" for item in focus_items)
    output = "\n".join(f"{index}. {item}" for index, item in enumerate(output_format, 1))
    prompt = f"""당신은 한국 관세청 업무를 지원하는 '{agent_name}' 시뮬레이션 Agent입니다.
아래 사용자 요청과 선행 분석 결과를 바탕으로 실제 시스템 연계가 이루어진 것처럼 분석 예시를 작성하세요.
단, 실제 처분·수사 지휘가 아니라 OpenAI 기반 업무 시뮬레이션 결과임을 전제로 표현하세요.

[Agent 임무]
{mission}

[중점 확인 항목]
{focus}

[출력 형식]
{output}

[사용자 요청]
{scenario_prompt(state)}

[선행 분석 결과]
{collect_context(state)[:6000]}
"""
    if not llm:
        return fallback
    try:
        return llm.invoke(prompt).content
    except Exception as exc:
        return f"{fallback}\n\n[LLM 시뮬레이션 오류]\n{exc}"
