"""Shared execution-scope helpers for agents."""

from src.agents.state import CustomsState

NO_COMPANY_SENTINELS = {"", "__NO_COMPANY_SELECTED__"}
NO_PERSON_SENTINELS = {"", "__NO_PERSON_SELECTED__"}


def prompt_text(state: CustomsState) -> str:
    scenario = state.get("scenario") or {}
    return str(scenario.get("user_prompt") or "")


def company_id(state: CustomsState) -> str:
    return str(state.get("company_id") or "").strip()


def target_type(state: CustomsState) -> str:
    return "person" if str(state.get("target_type") or "").strip().lower() == "person" else "company"


def target_id(state: CustomsState) -> str:
    if target_type(state) == "person":
        return str(state.get("person_id") or state.get("target_id") or "").strip()
    return company_id(state)


def target_name(state: CustomsState) -> str:
    scenario = state.get("scenario") or {}
    return str(
        state.get("target_name")
        or scenario.get("target_name")
        or scenario.get("gi_target_name")
        or ""
    ).strip()


def has_company_scope(state: CustomsState) -> bool:
    return target_type(state) == "company" and company_id(state) not in NO_COMPANY_SENTINELS


def has_person_scope(state: CustomsState) -> bool:
    return target_type(state) == "person" and target_id(state) not in NO_PERSON_SENTINELS


def has_target_scope(state: CustomsState) -> bool:
    return has_person_scope(state) if target_type(state) == "person" else has_company_scope(state)


def target_label(state: CustomsState) -> str:
    kind = "개인" if target_type(state) == "person" else "기업"
    tid = target_id(state)
    name = target_name(state)
    if name and tid and name != tid:
        return f"{kind} {name} ({tid})"
    if name or tid:
        return f"{kind} {name or tid}"
    return f"{kind} 대상 미지정"


def target_query_terms(state: CustomsState) -> list[str]:
    terms = [prompt_text(state), target_label(state)]
    tid = target_id(state)
    name = target_name(state)
    if tid:
        terms.append(tid)
    if name:
        terms.append(name)
    return [term for term in terms if term]


def no_target_result(state: CustomsState, agent_name: str, detail: str | None = None) -> str:
    kind = "개인" if target_type(state) == "person" else "기업"
    lines = [
        f"[{agent_name} 결과]",
        f"- 분석 대상 {kind} ID가 현재 실행 컨텍스트에서 확인되지 않았습니다.",
        "- 이전에 선택된 다른 대상 정보는 사용하지 않았습니다.",
    ]
    if detail:
        lines.append(f"- {detail}")
    return "\n".join(lines)


def person_not_supported_result(agent_name: str) -> str:
    return "\n".join([
        f"[{agent_name} 결과]",
        "- 현재 대상은 개인입니다.",
        "- 이 단계는 기업 수입신고/기업 프로파일 전용이므로 기업 ID를 대신 조회하지 않았습니다.",
        "- 개인 대상 분석은 CDW 우범자 프로파일, 개인 RAG 컨텍스트, 관계/사건 기반 에이전트 결과를 사용하세요.",
    ])


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
