"""Shared execution-scope helpers for agents."""

from src.agents.state import CustomsState

NO_COMPANY_SENTINELS = {"", "__NO_COMPANY_SELECTED__"}


def prompt_text(state: CustomsState) -> str:
    scenario = state.get("scenario") or {}
    return str(scenario.get("user_prompt") or "")


def company_id(state: CustomsState) -> str:
    return str(state.get("company_id") or "").strip()


def target_type(state: CustomsState) -> str:
    return "person" if str(state.get("target_type") or "").strip().lower() == "person" else "company"


def has_company_scope(state: CustomsState) -> bool:
    return company_id(state) not in NO_COMPANY_SENTINELS


def no_company_result(agent_name: str, detail: str | None = None) -> str:
    lines = [
        f"[{agent_name} 결과]",
        "- 분석 대상 기업명, 회사ID 또는 신고번호가 프롬프트에서 확인되지 않았습니다.",
        "- 연관정보 없음: 임의 기업이나 샘플 데이터를 대신 사용하지 않습니다.",
    ]
    if detail:
        lines.append(f"- {detail}")
    return "\n".join(lines)


def is_no_company_id(value: str | None) -> bool:
    return str(value or "").strip() in NO_COMPANY_SENTINELS
