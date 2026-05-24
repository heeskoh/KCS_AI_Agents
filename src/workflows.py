import warnings
from collections.abc import Callable
from typing import Any

from dotenv import load_dotenv

try:
    from langgraph.graph import END, StateGraph
except ModuleNotFoundError:
    END = None
    StateGraph = None

from src.agents.agent_audit_search import agent_audit_search
from src.agents.agent_bigdata import agent_bigdata
from src.agents.agent_company import agent_company
from src.agents.agent_customs_value import agent_customs_value
from src.agents.agent_db import agent_db
from src.agents.agent_declaration_verify import agent_declaration_verify
from src.agents.agent_hs_verify import agent_hs_verify
from src.agents.agent_law import agent_law
from src.agents.agent_ml import agent_ml
from src.agents.agent_network import agent_network
from src.agents.agent_ocr import agent_ocr
from src.agents.agent_ontology import agent_ontology
from src.agents.agent_patent import agent_patent
from src.agents.agent_rag import agent_rag_source
from src.agents.agent_rag_create import agent_rag_create
from src.agents.agent_report import agent_report
from src.agents.agent_summary import agent_summary
from src.agents.agent_validate import agent_validate
from src.agents.agent_web import agent_web
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
    return {
        "company_id": company_id,
        "scenario": scenario or {},
        "company_result": None,
        "db_result": None,
        "rag_result": None,
        "audit_search_result": None,
        "bigdata_result": None,
        "web_result": None,
        "final_report": None,
        "validation_result": None,
        "ontology_result": None,
    }


def _step_from_item(item: dict[str, Any], index: int) -> Step | None:
    source_type = item.get("type")
    source_key = item.get("key") or source_type
    label = item.get("label") or source_key or f"Step {index}"

    if source_type == "company":
        return (f"company_agent_{index}", label, agent_company, "company_result")
    if source_type == "db":
        return (f"db_agent_{index}", label, agent_db, "db_result")
    if source_type in RAG_TYPES:
        agent_key, default_label = RAG_TYPES[source_type]
        source_label = label or default_label
        return (
            f"{agent_key}_{index}",
            source_label,
            agent_rag_source(source_label, source_type),
            "rag_result",
        )
    if source_type == "audit_search":
        return (f"audit_search_agent_{index}", label, agent_audit_search, "audit_search_result")
    if source_type == "bigdata":
        return (f"bigdata_agent_{index}", label, agent_bigdata, "bigdata_result")
    if source_type == "ml":
        return (f"ml_agent_{index}", label, agent_ml, "ml_result")
    if source_type == "web":
        return (f"web_agent_{index}", label, agent_web, "web_result")
    if source_type == "ocr":
        return (f"ocr_agent_{index}", label, agent_ocr, "ocr_result")
    if source_type == "network":
        return (f"network_agent_{index}", label, agent_network, "network_result")
    if source_type == "ontology":
        return (f"ontology_agent_{index}", label, agent_ontology, "ontology_result")
    if source_type == "declaration_verify":
        return (f"declaration_verify_agent_{index}", label, agent_declaration_verify, "declaration_verify_result")
    if source_type == "hs_verify":
        return (f"hs_verify_agent_{index}", label, agent_hs_verify, "hs_verify_result")
    if source_type == "customs_value":
        return (f"customs_value_agent_{index}", label, agent_customs_value, "customs_value_result")
    if source_type == "summary":
        return (f"summary_agent_{index}", label, agent_summary, "summary_result")
    if source_type == "patent":
        return (f"patent_agent_{index}", label, agent_patent, "patent_result")
    if source_type == "rag_create":
        return (f"rag_create_agent_{index}", label, agent_rag_create, "rag_create_result")
    if source_type == "law":
        return (f"law_agent_{index}", label, agent_law, "law_result")
    if source_type == "report":
        return (f"report_agent_{index}", label, agent_report, "final_report")
    if source_type == "validation":
        return (f"validate_agent_{index}", label, agent_validate, "validation_result")

    return None


def build_workflow_steps(scenario: dict[str, Any] | None = None) -> list[Step]:
    scenario = scenario or {}
    scenario_items = scenario.get("scenario_items") or []

    if scenario_items:
        mapped_steps: list[Step] = []
        ordered_items = sorted(scenario_items, key=lambda value: value.get("order", 999))
        for index, item in enumerate(ordered_items, 1):
            step = _step_from_item(item, index)
            if step:
                mapped_steps.append(step)
        return mapped_steps

    steps: list[Step] = []

    if scenario.get("company_lookup", True):
        steps.append(("company_agent", "기업 프로파일 조회", agent_company, "company_result"))

    if scenario.get("db_query", True):
        steps.append(("db_agent", "CDW 조회", agent_db, "db_result"))

    rag_flags = {
        "rag_customs_public": "rag_customs",
        "rag_trade": "rag_trade",
        "rag_audit": "rag_audit",
        "rag_investigation": "rag_investigation",
        "rag_global": "rag_global",
    }
    for flag, source_type in rag_flags.items():
        if scenario.get(flag, scenario.get("rag_enabled", True)):
            agent_key, label = RAG_TYPES[source_type]
            steps.append((agent_key, label, agent_rag_source(label, source_type), "rag_result"))

    if scenario.get("audit_search_enabled", False):
        steps.append((
            "audit_search_agent",
            "조사보고서 검색",
            agent_audit_search,
            "audit_search_result",
        ))

    if scenario.get("bigdata_enabled", True):
        steps.append(("bigdata_agent", "빅데이터 통계 분석", agent_bigdata, "bigdata_result"))

    if scenario.get("web_enabled", True):
        steps.append(("web_agent", "웹 정보 검색", agent_web, "web_result"))

    if scenario.get("report_enabled", True):
        steps.append(("report_agent", "보고서 생성", agent_report, "final_report"))

    if scenario.get("validation_enabled", True):
        steps.append(("validate_agent", "보고서 검증", agent_validate, "validation_result"))

    return steps


def run_scenario(company_id: str, scenario: dict[str, Any] | None = None) -> CustomsState:
    state = create_initial_state(company_id, scenario)
    for _, _, runner, _ in build_workflow_steps(scenario):
        state = runner(state)
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
