"""Registry of independently callable AI service modules.

Workflow scenarios should resolve executable agents through this registry
instead of hard-coding agent imports and if/else mappings in orchestration code.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from src.agents.agent_abnormal_trade import agent_abnormal_trade
from src.agents.agent_audit_search import agent_audit_search
from src.agents.agent_bigdata import agent_bigdata
from src.agents.agent_company import agent_company
from src.agents.agent_customs_value import agent_customs_value
from src.agents.agent_db import agent_db
from src.agents.agent_declaration_verify import agent_declaration_verify
from src.agents.agent_external_info import agent_external_agency, agent_uni_external
from src.agents.agent_hs_verify import agent_hs_verify
from src.agents.agent_law import agent_law
from src.agents.agent_mail_share import agent_mail_share
from src.agents.agent_ml import agent_ml
from src.agents.agent_network import agent_network
from src.agents.agent_ocr import agent_ocr
from src.agents.agent_ontology import agent_ontology
from src.agents.agent_origin_analysis import agent_origin_analysis
from src.agents.agent_patent import agent_patent
from src.agents.agent_proceeds_tracking import agent_proceeds_tracking
from src.agents.agent_rag import agent_rag_source
from src.agents.agent_rag_create import agent_rag_create
from src.agents.agent_report import agent_report
from src.agents.agent_report_standard import agent_report_standard
from src.agents.agent_result_synthesis import agent_result_synthesis
from src.agents.agent_risk_profile import agent_risk_profile
from src.agents.agent_route_analysis import agent_route_analysis
from src.agents.agent_summary import agent_summary
from src.agents.agent_text_summary import agent_text_summary
from src.agents.agent_translate import agent_translate
from src.agents.agent_validate import agent_validate
from src.agents.agent_web import agent_web
from src.agents.state import CustomsState

AgentRunner = Callable[[CustomsState], CustomsState]
Step = tuple[str, str, AgentRunner, str]
RunnerFactory = Callable[[str, str], AgentRunner]


@dataclass(frozen=True)
class AgentModule:
    """A small executable AI service unit available to scenarios."""

    type: str
    label: str
    runner: AgentRunner | None = None
    result_key: str = ""
    node_prefix: str | None = None
    aliases: tuple[str, ...] = field(default_factory=tuple)
    runner_factory: RunnerFactory | None = None

    def build_step(self, item: dict[str, Any], index: int) -> Step:
        label = str(item.get("label") or self.label or self.type)
        source_key = str(
            item.get("sourceKey")
            or item.get("source_key")
            or item.get("key")
            or self.type
        )
        runner = self.runner_factory(label, source_key) if self.runner_factory else self.runner
        if runner is None:
            raise ValueError(f"Agent module has no runner: {self.type}")
        node_key = f"{self.node_prefix or self.type + '_agent'}_{index}"
        return (node_key, label, runner, self.result_key)


def _rag_runner(label: str, source_key: str) -> AgentRunner:
    return agent_rag_source(label, source_key)


AGENT_MODULES: tuple[AgentModule, ...] = (
    AgentModule("company", "기업 프로파일 조회", agent_company, "company_result", "company_agent", ("company_lookup", "company_profile")),
    AgentModule("db", "CDW 자연어조회", agent_db, "db_result", "db_agent", ("db_cdw", "cdw")),
    AgentModule("db_external", "전자통관외부정보조회", agent_uni_external, "db_external_result", "db_external_agent", ("uni_external",)),
    AgentModule("external_agency", "외부기관정보수집", agent_external_agency, "external_agency_result", "external_agency_agent", ("agency_collect",)),
    AgentModule("rag_customs", "관세정보 RAG", result_key="rag_result", node_prefix="rag_customs_agent", runner_factory=_rag_runner),
    AgentModule("rag_trade", "무역정보 RAG", result_key="rag_result", node_prefix="rag_trade_agent", runner_factory=_rag_runner),
    AgentModule("rag_audit", "심사정보 RAG", result_key="rag_result", node_prefix="rag_audit_agent", runner_factory=_rag_runner),
    AgentModule("rag_investigation", "조사정보 RAG", result_key="rag_result", node_prefix="rag_investigation_agent", runner_factory=_rag_runner),
    AgentModule("rag_global", "국제협력 RAG", result_key="rag_result", node_prefix="rag_global_agent", runner_factory=_rag_runner),
    AgentModule("audit_search", "조사보고서 검색", agent_audit_search, "audit_search_result", "audit_search_agent"),
    AgentModule("bigdata", "빅데이터 통계 분석", agent_bigdata, "bigdata_result", "bigdata_agent"),
    AgentModule("ml", "ML 모델 실행", agent_ml, "ml_result", "ml_agent"),
    AgentModule("web", "웹 정보수집 요청", agent_web, "web_result", "web_agent", ("web_search",)),
    AgentModule("ocr", "OCR/문서인식", agent_ocr, "ocr_result", "ocr_agent"),
    AgentModule("network", "관계망 분석", agent_network, "network_result", "network_agent"),
    AgentModule("ontology", "관세 온톨로지", agent_ontology, "ontology_result", "ontology_agent"),
    AgentModule("origin_analysis", "원산지 검증", agent_origin_analysis, "origin_analysis_result", "origin_analysis_agent"),
    AgentModule("abnormal_trade", "이상거래 검증", agent_abnormal_trade, "abnormal_trade_result", "abnormal_trade_agent"),
    AgentModule("proceeds_tracking", "범죄수익 추적", agent_proceeds_tracking, "proceeds_tracking_result", "proceeds_tracking_agent"),
    AgentModule("route_analysis", "이동경로 분석", agent_route_analysis, "route_analysis_result", "route_analysis_agent"),
    AgentModule("declaration_verify", "수입신고 검증", agent_declaration_verify, "declaration_verify_result", "declaration_verify_agent"),
    AgentModule("hs_verify", "품목분류 검증", agent_hs_verify, "hs_verify_result", "hs_verify_agent"),
    AgentModule("customs_value", "과세가격 평가", agent_customs_value, "customs_value_result", "customs_value_agent"),
    AgentModule("risk_profile", "위험지표 프로파일", agent_risk_profile, "risk_profile_result", "risk_profile_agent", ("company_risk_profile", "risk_indicator_profile")),
    AgentModule("summary", "요약", agent_summary, "summary_result", "summary_agent"),
    AgentModule("translate", "문서 번역", agent_translate, "translate_result", "translate_agent"),
    AgentModule("text_summary", "요약", agent_text_summary, "text_summary_result", "text_summary_agent"),
    AgentModule("report_standard", "표준 보고서 생성", agent_report_standard, "report_standard_result", "report_standard_agent"),
    AgentModule("patent", "특허정보 조회", agent_patent, "patent_result", "patent_agent"),
    AgentModule("rag_create", "RAG 생성", agent_rag_create, "rag_create_result", "rag_create_agent"),
    AgentModule("law", "법령 검토", agent_law, "law_result", "law_agent"),
    AgentModule("result_synthesis", "최종 결과 종합", agent_result_synthesis, "result_synthesis_result", "result_synthesis_agent", ("final_synthesis",)),
    AgentModule("report", "보고서 생성", agent_report, "final_report", "report_agent", ("report_generate",)),
    AgentModule("validation", "보고서 검증", agent_validate, "validation_result", "validate_agent", ("report_validate", "validate")),
    AgentModule("mail_share", "분석결과 공유", agent_mail_share, "mail_share_result", "mail_share_agent"),
)


def _build_module_index() -> dict[str, AgentModule]:
    index: dict[str, AgentModule] = {}
    for module in AGENT_MODULES:
        index[module.type] = module
        for alias in module.aliases:
            index[alias] = module
    return index


AGENT_MODULE_INDEX = _build_module_index()


def agent_module_by_key(key: object) -> AgentModule | None:
    return AGENT_MODULE_INDEX.get(str(key or "").strip())


def resolve_agent_module(item: dict[str, Any]) -> AgentModule | None:
    """Resolve a scenario item to the registered executable module."""

    candidates = (
        item.get("type"),
        item.get("sourceKey"),
        item.get("source_key"),
        item.get("key"),
    )
    for key in candidates:
        module = agent_module_by_key(key)
        if module:
            return module
    return None


def step_from_item(item: dict[str, Any], index: int) -> Step | None:
    module = resolve_agent_module(item)
    return module.build_step(item, index) if module else None
