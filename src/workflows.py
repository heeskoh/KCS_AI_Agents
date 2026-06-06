import warnings
from collections.abc import Callable
from typing import Any

from dotenv import load_dotenv

try:
    from langgraph.graph import END, StateGraph
except ModuleNotFoundError:
    END = None
    StateGraph = None

from src.agents.module_registry import step_from_item
from src.agents.service_registry import (
    AI_SERVICE_TARGET_CONFIG,
    default_prompt,
    normalize_target_type,
    service_supports_target,
)
from src.agents.state import CustomsState

warnings.filterwarnings("ignore")
load_dotenv()

AgentRunner = Callable[[CustomsState], CustomsState]
Step = tuple[str, str, AgentRunner, str]

RAG_TYPES = {
    "rag_customs": ("rag_customs_agent", "관세e음 RAG"),
    "rag_trade": ("rag_trade_agent", "통관정보 RAG"),
    "rag_audit": ("rag_audit_agent", "심사정보 RAG"),
    "rag_investigation": ("rag_investigation_agent", "조사정보 RAG"),
    "rag_global": ("rag_global_agent", "국제정보 RAG"),
}


def create_initial_state(company_id: str, scenario: dict[str, Any] | None = None) -> CustomsState:
    scenario = scenario or {}
    target_type = normalize_target_type(
        scenario.get("target_type") or scenario.get("targetType")
    )
    target_id = str(
        scenario.get("target_id")
        or scenario.get("targetId")
        or scenario.get("person_id")
        or scenario.get("personId")
        or (company_id if target_type == "company" else "")
        or ""
    ).strip()
    person_id = target_id if target_type == "person" else ""
    scoped_company_id = company_id if target_type == "company" else "__NO_COMPANY_SELECTED__"
    target_name = str(
        scenario.get("target_name")
        or scenario.get("targetName")
        or scenario.get("gi_target_name")
        or ""
    ).strip()
    return {
        "company_id": scoped_company_id,
        "person_id": person_id,
        "target_id": target_id,
        "target_name": target_name,
        "target_type": target_type,
        "scenario": {
            **scenario,
            "target_type": target_type,
            "target_id": target_id,
            "person_id": person_id,
            "target_name": target_name,
        },
        "company_result": None,
        "db_result": None,
        "rag_result": None,
        "audit_search_result": None,
        "bigdata_result": None,
        "web_result": None,
        "final_report": None,
        "validation_result": None,
        "mail_share_result": None,
        "ontology_result": None,
        "origin_analysis_result": None,
        "abnormal_trade_result": None,
        "proceeds_tracking_result": None,
        "route_analysis_result": None,
    }


def _step_from_item(item: dict[str, Any], index: int) -> Step | None:
    return step_from_item(item, index)


def _normalize_scenario_item(item: dict[str, Any], target_type: str) -> dict[str, Any] | None:
    normalized = {**item}
    source_type = normalized.get("type")
    source_key = normalized.get("sourceKey") or normalized.get("source_key") or normalized.get("key") or source_type
    registry_key = source_key if source_key in AI_SERVICE_TARGET_CONFIG else source_type
    if not service_supports_target(str(registry_key or ""), target_type):
        return None
    normalized["target_type"] = target_type
    normalized["targetType"] = target_type
    normalized["target_support"] = AI_SERVICE_TARGET_CONFIG.get(str(registry_key or ""), {}).get("supports", {})
    if not normalized.get("instruction"):
        normalized["instruction"] = default_prompt(str(registry_key or ""), target_type)
    return normalized


def build_workflow_steps(scenario: dict[str, Any] | None = None) -> list[Step]:
    scenario = scenario or {}
    target_type = normalize_target_type(scenario.get("target_type") or scenario.get("targetType"))
    scenario_items = scenario.get("scenario_items") or []

    if scenario_items:
        mapped_steps: list[Step] = []
        ordered_items = sorted(scenario_items, key=lambda value: value.get("order", 999))
        for index, item in enumerate(ordered_items, 1):
            normalized_item = _normalize_scenario_item(item, target_type)
            if not normalized_item:
                continue
            step = _step_from_item(normalized_item, index)
            if step:
                mapped_steps.append(step)
        return mapped_steps

    default_steps: list[Step] = []

    def add_default_step(source_type: str, label: str) -> None:
        step = _step_from_item(
            {"type": source_type, "key": source_type, "label": label},
            len(default_steps) + 1,
        )
        if step:
            default_steps.append(step)

    if scenario.get("company_lookup", True):
        add_default_step("company", "기업 프로파일 조회")

    if scenario.get("db_query", True):
        add_default_step("db", "CDW 조회")

    rag_flags = {
        "rag_customs_public": ("rag_customs", "관세e음 RAG"),
        "rag_trade": ("rag_trade", "통관정보 RAG"),
        "rag_audit": ("rag_audit", "심사정보 RAG"),
        "rag_investigation": ("rag_investigation", "조사정보 RAG"),
        "rag_global": ("rag_global", "국제정보 RAG"),
    }
    for flag, (source_type, label) in rag_flags.items():
        if scenario.get(flag, scenario.get("rag_enabled", True)):
            add_default_step(source_type, label)

    if scenario.get("audit_search_enabled", False):
        add_default_step("audit_search", "조사보고서 검색")

    if scenario.get("bigdata_enabled", True):
        add_default_step("bigdata", "빅데이터 통계 분석")

    if scenario.get("web_enabled", True):
        add_default_step("web", "웹 정보 검색")

    if scenario.get("report_enabled", True):
        add_default_step("report", "보고서 생성")

    if scenario.get("validation_enabled", True):
        add_default_step("validation", "보고서 검증")

    return default_steps

def run_scenario(company_id: str, scenario: dict[str, Any] | None = None) -> CustomsState:
    state = create_initial_state(company_id, scenario)
    for key, label, runner, _ in build_workflow_steps(scenario):
        legacy_label = "보고서 " + "승인"
        label = str(label or "").replace(legacy_label, "보고서 검증")
        step_state = {
            **state,
            "scenario": {
                **(state.get("scenario") or {}),
                "current_agent_key": key,
                "current_agent_label": label,
            },
        }
        print(f"\n[AI 서비스] {label} 실행 시작")
        state = runner(step_state)
        print(f"[AI 서비스] {label} 실행 완료")
    return state


def compile_scenario_workflow(scenario: dict[str, Any] | None = None):
    if StateGraph is None or END is None:
        return None

    steps = build_workflow_steps(scenario)
    workflow = StateGraph(CustomsState)

    for key, _, runner, _ in steps:
        workflow.add_node(key, runner)

    if not steps:
        return None

    workflow.set_entry_point(steps[0][0])
    for current, following in zip(steps, steps[1:]):
        workflow.add_edge(current[0], following[0])
    workflow.add_edge(steps[-1][0], END)
    return workflow.compile()


app = compile_scenario_workflow()


if __name__ == "__main__":
    result = run_scenario("C-1002")
    print(result.get("final_report") or result)
