export const AGENT_SERVICE_DEFINITIONS = {
  abnormal_trade: { agentId: "abnormal_trade", label: "이상거래 검증", category: "agent" },
  audit_search: { agentId: "audit_search", label: "조사보고서 검색", category: "agent" },
  bigdata: { agentId: "bigdata", label: "빅데이터 통계 분석", category: "agent" },
  cdw: { agentId: "db", label: "CDW 조회", category: "db" },
  company: { agentId: "company", label: "기업 프로파일 조회", category: "agent" },
  company_lookup: { agentId: "company", label: "기업 프로파일 조회", category: "agent" },
  customs_value: { agentId: "customs_value", label: "과세가격 평가", category: "agent" },
  db: { agentId: "db", label: "CDW 조회", category: "db" },
  db_cdw: { agentId: "db", label: "CDW 조회", category: "db" },
  declaration_verify: { agentId: "declaration_verify", label: "수입신고 검증", category: "agent" },
  hs_verify: { agentId: "hs_verify", label: "품목분류 검증", category: "agent" },
  law: { agentId: "law", label: "법령정보 조회", category: "agent" },
  mail_share: { agentId: "mail_share", label: "대민메일 공유", category: "agent" },
  ml: { agentId: "ml", label: "ML 모델 실행", category: "agent" },
  network: { agentId: "network", label: "관계망 분석", category: "agent" },
  ocr: { agentId: "ocr", label: "OCR/문서인식", category: "agent" },
  ontology: { agentId: "ontology", label: "관계 온톨로지", category: "agent" },
  origin_analysis: { agentId: "origin_analysis", label: "원산지 분석", category: "agent" },
  patent: { agentId: "patent", label: "특허정보 조회", category: "agent" },
  proceeds_tracking: { agentId: "proceeds_tracking", label: "범죄수익 추적", category: "agent" },
  rag_audit: { agentId: "rag_audit", label: "감사정보 RAG", category: "rag" },
  rag_create: { agentId: "rag_create", label: "RAG 생성", category: "rag" },
  rag_customs: { agentId: "rag_customs", label: "관세법령 RAG", category: "rag" },
  rag_global: { agentId: "rag_global", label: "국제정보 RAG", category: "rag" },
  rag_investigation: { agentId: "rag_investigation", label: "조사정보 RAG", category: "rag" },
  rag_trade: { agentId: "rag_trade", label: "무역정보 RAG", category: "rag" },
  report: { agentId: "report", label: "보고서 생성", category: "agent" },
  report_generate: { agentId: "report", label: "보고서 생성", category: "agent" },
  report_validate: { agentId: "validation", label: "보고서 검증", category: "agent" },
  route_analysis: { agentId: "route_analysis", label: "이동경로 분석", category: "agent" },
  summary: { agentId: "summary", label: "요약", category: "agent" },
  validate: { agentId: "validation", label: "보고서 검증", category: "agent" },
  validation: { agentId: "validation", label: "보고서 검증", category: "agent" },
  web: { agentId: "web", label: "웹정보 검색", category: "agent" },
  web_search: { agentId: "web", label: "웹정보 검색", category: "agent" },
};

export function agentRequirement(serviceId){
  const definition = AGENT_SERVICE_DEFINITIONS[serviceId] || {};
  return {
    serviceId,
    agentId: definition.agentId || serviceId,
    label: definition.label || serviceId,
    category: definition.category || "agent",
    required: true,
  };
}

export function agentAction(requirement){
  return {
    serviceId: requirement.serviceId,
    agentId: requirement.agentId,
    action: "use",
    label: requirement.label,
  };
}

export function withAgentMetadata(subtab){
  const aiServices = Array.isArray(subtab.aiServices) ? subtab.aiServices : [];
  const agentRequirements = aiServices.map(agentRequirement);
  return {
    ...subtab,
    aiServices,
    agentRequirements,
    agentActions: agentRequirements.map(agentAction),
  };
}

export function collectSubtabAgentRequirements(subtabs){
  const byService = new Map();
  for(const subtab of subtabs){
    for(const requirement of subtab.agentRequirements || []){
      if(!byService.has(requirement.serviceId)){
        byService.set(requirement.serviceId, requirement);
      }
    }
  }
  return [...byService.values()];
}
