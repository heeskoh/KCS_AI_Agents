from typing import Optional, TypedDict


class CustomsState(TypedDict, total=False):
    """Shared state passed between workflow agents.

    total=False keeps existing agents compatible as new state keys are added.
    """

    company_id: str
    person_id: str
    target_id: str
    target_name: str
    target_type: str
    scenario: Optional[dict]
    agent_error: Optional[str]
    agent_error_result: Optional[str]

    # Core agent results
    company_result: Optional[str]           # 기업 기본정보             (agent_company)
    db_result: Optional[str]                # CDW 수입신고 종합          (agent_db)
    rag_result: Optional[str]               # RAG 결과 누적              (agent_rag_source)
    audit_search_result: Optional[str]      # 감사/조사 RAG 검색         (agent_audit_search)
    bigdata_result: Optional[str]           # 빅데이터 통계 (legacy)     (agent_bigdata)
    web_result: Optional[str]               # 웹 기사                    (agent_web)
    final_report: Optional[str]             # 보고서                     (agent_report)
    validation_result: Optional[str]        # 검증                       (agent_validate)
    mail_share_result: Optional[str]        # 분석결과 이메일 공유        (agent_mail_share)

    # Additional AI service results
    ocr_result: Optional[str]               # OCR/문서인식               (agent_ocr)
    document_intelligence_result: Optional[list]
    ocr_recommended_agents: Optional[list[str]]
    ml_result: Optional[str]                # ML 모델 실행               (agent_ml)
    network_result: Optional[str]           # 관계망 분석                (agent_network)
    declaration_verify_result: Optional[str]# 수입신고검증               (agent_declaration_verify)
    hs_verify_result: Optional[str]         # 품목분류검증               (agent_hs_verify)
    customs_value_result: Optional[str]     # 과세가격평가               (agent_customs_value)
    summary_result: Optional[str]           # 문서 요약                  (agent_summary)
    patent_result: Optional[str]            # 특허정보조회               (agent_patent)
    rag_create_result: Optional[str]        # RAG 생성                   (agent_rag_create)
    law_result: Optional[str]               # 법령정보                   (agent_law)
    ontology_result: Optional[str]          # 관세온톨로지               (agent_ontology)
    origin_analysis_result: Optional[str]   # 원산지 분석                (agent_origin_analysis)
    abnormal_trade_result: Optional[str]    # 이상거래 검증              (agent_abnormal_trade)
    proceeds_tracking_result: Optional[str] # 범죄수익 추적              (agent_proceeds_tracking)
    route_analysis_result: Optional[str]    # 운송경로 분석              (agent_route_analysis)
