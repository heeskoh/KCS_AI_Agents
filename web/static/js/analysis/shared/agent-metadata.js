/* ═══════════════════════════════════════════════════════════════
   AI 서비스 메타데이터
   - AGENT_SERVICE_DEFINITIONS : 기존 호환용 (agentId, label, category)
   - AI_SERVICE_CATALOG        : 완전 정의 (behaviorOptions, defaultInstruction,
                                  defaultPrompts, 카테고리 그룹)
   ═══════════════════════════════════════════════════════════════ */

/* ── 카테고리 그룹 상수 ──────────────────────────────────────── */
export const DATA_SOURCE_GROUP = "db";
export const AI_SERVICE_GROUP  = "agent";
export const RAG_GROUP         = "rag";

/* ══════════════════════════════════════════════════════════════
   AI_SERVICE_CATALOG
   app-runtime.js의 AI_SERVICE_REGISTRY + AI_SERVICE_TARGET_CONFIG
   를 통합하여 scenario-builder.js 에서 직접 사용 가능하도록 export
   ══════════════════════════════════════════════════════════════ */
export const AI_SERVICE_CATALOG = {
  /* ── DB 조회 ─────────────────────────────────────── */
  db_cdw: {
    label: "CDW 조회", agentId: "db", category: DATA_SOURCE_GROUP,
    defaultInstruction: "기업 프로파일, 최근 수입신고, 위험지표를 종합 요약",
    defaultPrompts: {
      company: "기업 프로파일, 최근 수입신고, 위험지표를 종합 요약",
      person:  "우범자 프로파일, 여행·반입 이력, 위험지표를 종합 요약",
    },
    behaviorOptions: [
      { value: "profile_summary",    label: "기업/신고 요약" },
      { value: "risk_focus",         label: "위험지표 중심" },
      { value: "declaration_focus",  label: "신고내역 중심" },
    ],
  },

  /* ── RAG 검색 ────────────────────────────────────── */
  rag_customs: {
    label: "관세법령 RAG", agentId: "rag_customs", category: RAG_GROUP,
    defaultInstruction: "과세가격, 원산지, 품목분류 관련 규정 근거 확인",
    defaultPrompts: {
      company: "과세가격, 원산지, 품목분류 관련 규정 근거 확인",
      person:  "휴대품, 여행자 통관, 조사 절차 관련 규정 근거 확인",
    },
    behaviorOptions: [
      { value: "regulation_basis", label: "규정 근거 확인" },
      { value: "case_comparison",  label: "유사사례 비교" },
    ],
  },
  rag_trade: {
    label: "무역정보 RAG", agentId: "rag_trade", category: RAG_GROUP,
    defaultInstruction: "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    defaultPrompts: {
      company: "통관/무역 정보에서 이상 징후와 참고 근거 확인",
      person:  "개인 반입·운송·거래 정보에서 이상 징후와 참고 근거 확인",
    },
    behaviorOptions: [
      { value: "trade_signal",    label: "무역 징후 확인" },
      { value: "market_context",  label: "시장 맥락 확인" },
    ],
  },
  rag_audit: {
    label: "심사정보 RAG", agentId: "rag_audit", category: RAG_GROUP,
    defaultInstruction: "감사 정보와 추징 가능성 관점의 조사 포인트 정리",
    defaultPrompts: {
      company: "감사 정보와 추징 가능성 관점의 조사 포인트 정리",
      person:  "개인 사건 검토 이력과 추징 가능성 관점의 조사 포인트 정리",
    },
    behaviorOptions: [
      { value: "audit_case",      label: "감사사례 비교" },
      { value: "recovery_point",  label: "추징 포인트" },
    ],
  },
  rag_investigation: {
    label: "조사정보 RAG", agentId: "rag_investigation", category: RAG_GROUP,
    defaultInstruction: "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    defaultPrompts: {
      company: "조사 정보 기반으로 조사 순서와 확인 자료 정리",
      person:  "개인 수사 정보 기반으로 수사 순서와 확인 자료 정리",
    },
    behaviorOptions: [
      { value: "investigation_plan", label: "조사계획 수립" },
      { value: "evidence_check",     label: "증빙 체크" },
    ],
  },
  rag_global: {
    label: "국제정보 RAG", agentId: "rag_global", category: RAG_GROUP,
    defaultInstruction: "국제 정보 기반으로 해외 거래구조와 위험 신호 확인",
    defaultPrompts: {
      company: "국제 정보 기반으로 해외 거래구조와 위험 신호 확인",
      person:  "국제 여행·체류·공조 정보 기반으로 개인 위험 신호 확인",
    },
    behaviorOptions: [
      { value: "global_signal",  label: "국제 위험신호" },
      { value: "counterparty",   label: "해외거래처 확인" },
    ],
  },
  rag_create: {
    label: "RAG 생성", agentId: "rag_create", category: RAG_GROUP,
    defaultInstruction: "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    defaultPrompts: {
      company: "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
      person:  "개인 사건 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    },
    behaviorOptions: [
      { value: "knowledge_build", label: "지식 생성" },
      { value: "source_cleanup",  label: "자료 정제" },
    ],
  },

  /* ── AI 서비스 ───────────────────────────────────── */
  ml: {
    label: "ML 모델 실행 AI 서비스", agentId: "ml", category: AI_SERVICE_GROUP,
    defaultInstruction: "전체 모델을 실행해 위험 패턴을 비교",
    defaultPrompts: {
      company: "전체 모델을 실행해 기업 위험 패턴을 비교",
      person:  "전체 모델을 실행해 개인 위험 패턴을 비교",
    },
    behaviorOptions: [
      { value: "all_models",      label: "전체 모델 실행" },
      { value: "industry_stats",  label: "동종업종 통계" },
      { value: "hs_risk",         label: "HS 위험점수" },
      { value: "hs_recommend",    label: "품목분류 추천" },
      { value: "anomaly",         label: "이상치 탐색" },
    ],
  },
  network: {
    label: "관계망 분석 AI 서비스", agentId: "network", category: AI_SERVICE_GROUP,
    defaultInstruction: "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    defaultPrompts: {
      company: "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
      person:  "인물·동행자·연락처·주소 관계망을 분석해 공범, 전달책, 반복 연계 가능성을 식별",
    },
    behaviorOptions: [
      { value: "relationship",   label: "관계망 분석" },
      { value: "paper_company",  label: "페이퍼컴퍼니" },
    ],
  },
  ontology: {
    label: "관세온톨로지 AI 서비스", agentId: "ontology", category: AI_SERVICE_GROUP,
    defaultInstruction: "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성",
    defaultPrompts: {
      company: "기업·거래·품목 중심 관세 온톨로지와 지식그래프 관계를 구성",
      person:  "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성",
    },
    behaviorOptions: [
      { value: "traveler_ontology", label: "우범여행자 온톨로지" },
      { value: "cargo_relation",    label: "화물 관계 분석" },
      { value: "semantic_rules",    label: "추론 규칙 생성" },
    ],
  },
  origin_analysis: {
    label: "원산지 검증 AI 서비스", agentId: "origin_analysis", category: AI_SERVICE_GROUP,
    defaultInstruction: "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    defaultPrompts: {
      company: "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
      person:  "개인 반입 물품의 원산지 증빙과 우회 반입 가능성을 분석",
    },
    behaviorOptions: [
      { value: "origin_certificate", label: "원산지증명 검토" },
      { value: "fta_risk",           label: "FTA 리스크" },
      { value: "circumvention",      label: "우회수입 확인" },
    ],
  },
  abnormal_trade: {
    label: "이상거래 검증 AI 서비스", agentId: "abnormal_trade", category: AI_SERVICE_GROUP,
    defaultInstruction: "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    defaultPrompts: {
      company: "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
      person:  "반입·송금·연락·이동 패턴의 이상 징후를 검증",
    },
    behaviorOptions: [
      { value: "price_pattern",       label: "가격 패턴" },
      { value: "counterparty_pattern",label: "거래상대방" },
      { value: "declaration_pattern", label: "신고패턴" },
    ],
  },
  proceeds_tracking: {
    label: "범죄수익 추적 AI 서비스", agentId: "proceeds_tracking", category: AI_SERVICE_GROUP,
    defaultInstruction: "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    defaultPrompts: {
      company: "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
      person:  "개인 계좌·송금·현금 반입 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    },
    behaviorOptions: [
      { value: "fund_flow",       label: "자금흐름" },
      { value: "account_trace",   label: "계좌추적 단서" },
      { value: "concealment",     label: "은닉 가능성" },
    ],
  },
  route_analysis: {
    label: "운송경로 분석 AI 서비스", agentId: "route_analysis", category: AI_SERVICE_GROUP,
    defaultInstruction: "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    defaultPrompts: {
      company: "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
      person:  "여행경로, 경유지, 동행 이력을 분석해 우회 반입 가능성을 탐지",
    },
    behaviorOptions: [
      { value: "route_check",    label: "운송경로" },
      { value: "supply_chain",   label: "공급망 역추적" },
      { value: "transshipment",  label: "우회경유" },
    ],
  },
  web_search: {
    label: "웹검색 AI 서비스", agentId: "web", category: AI_SERVICE_GROUP,
    defaultInstruction: "업체, 공급망, 가격 변동 관련 기사 확인",
    defaultPrompts: {
      company: "업체, 공급망, 가격 변동 관련 기사 확인",
      person:  "인물, 조직, 사건, 여행 경로 관련 공개 정보를 확인",
    },
    behaviorOptions: [
      { value: "company_news",   label: "업체 기사" },
      { value: "supply_chain",   label: "공급망/가격" },
      { value: "industry_news",  label: "동종업종 기사" },
    ],
  },
  declaration_verify: {
    label: "수입신고검증 AI 서비스", agentId: "declaration_verify", category: AI_SERVICE_GROUP,
    defaultInstruction: "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    defaultPrompts: {
      company: "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
      person:  "개인 휴대품 신고, 반입 물품, 첨부 증빙을 비교해 불일치와 은닉 가능성 확인",
    },
    behaviorOptions: [
      { value: "declaration_consistency", label: "신고 정합성" },
      { value: "missing_evidence",        label: "누락 증빙" },
    ],
  },
  hs_verify: {
    label: "품목분류검증 AI 서비스", agentId: "hs_verify", category: AI_SERVICE_GROUP,
    defaultInstruction: "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    defaultPrompts: {
      company: "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
      person:  "개인 반입 물품의 품목분류와 규제 대상 여부를 검증",
    },
    behaviorOptions: [
      { value: "classification_check", label: "분류 적정성" },
      { value: "alternative_hs",       label: "대체 HS 후보" },
    ],
  },
  customs_value: {
    label: "과세가격평가 AI 서비스", agentId: "customs_value", category: AI_SERVICE_GROUP,
    defaultInstruction: "과세가격 결정 요소와 저가신고 가능성 검토",
    defaultPrompts: {
      company: "과세가격 결정 요소와 저가신고 가능성 검토",
      person:  "개인 반입 물품의 과세가격 산정 근거와 축소 신고 가능성 검토",
    },
    behaviorOptions: [
      { value: "valuation_basis", label: "과세가격 근거" },
      { value: "undervaluation",  label: "저가신고 탐지" },
    ],
  },
  patent: {
    label: "특허정보 조회 AI 서비스", agentId: "patent", category: AI_SERVICE_GROUP,
    defaultInstruction: "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    defaultPrompts: {
      company: "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
      person:  "개인 반입 물품의 상표권·지식재산권 침해 가능성 확인",
    },
    behaviorOptions: [
      { value: "royalty_check",  label: "로열티 확인" },
      { value: "patent_lookup",  label: "특허 정보 조회" },
    ],
  },
  law: {
    label: "법령 검토 AI 서비스", agentId: "law", category: AI_SERVICE_GROUP,
    defaultInstruction: "관련 법령, 고시, 판례, 유권해석 근거 검색",
    defaultPrompts: {
      company: "관련 법령, 고시, 판례, 유권해석 근거 검색",
      person:  "개인 수사·통관·처분 관련 법령, 고시, 판례, 유권해석 근거 검색",
    },
    behaviorOptions: [
      { value: "law_basis",  label: "법령 근거" },
      { value: "precedent",  label: "판례/유권해석" },
    ],
  },
  ocr: {
    label: "OCR/문서인식 AI 서비스", agentId: "ocr", category: AI_SERVICE_GROUP,
    defaultInstruction: "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    defaultPrompts: {
      company: "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
      person:  "개인 신분·여행·반입 관련 첨부 문서에서 주요 항목을 추출하고 구조화",
    },
    behaviorOptions: [
      { value: "document_extract", label: "문서 항목 추출" },
      { value: "evidence_parse",   label: "증빙 구조화" },
    ],
  },
  summary: {
    label: "보고서 요약 AI 서비스", agentId: "summary", category: AI_SERVICE_GROUP,
    defaultInstruction: "선행 단계 결과를 조사관용 핵심 요약으로 정리",
    defaultPrompts: {
      company: "선행 단계 결과를 조사관용 핵심 요약으로 정리",
      person:  "선행 단계 결과를 개인 수사 담당자용 핵심 요약으로 정리",
    },
    behaviorOptions: [
      { value: "brief",           label: "핵심 요약" },
      { value: "evidence_table",  label: "근거 표 정리" },
    ],
  },
  report_generate: {
    label: "보고서 생성 AI 서비스", agentId: "report", category: AI_SERVICE_GROUP,
    defaultInstruction: "이전 단계 결과를 공식 조사보고서 초안으로 통합",
    defaultPrompts: {
      company: "이전 단계 결과를 공식 조사보고서 초안으로 통합",
      person:  "이전 단계 결과를 개인 수사보고서 초안으로 통합",
    },
    behaviorOptions: [
      { value: "full_report",   label: "전체 보고서" },
      { value: "issue_report",  label: "쟁점 중심 보고서" },
    ],
  },
  report_validate: {
    label: "보고서 검증 AI 서비스", agentId: "validation", category: AI_SERVICE_GROUP,
    defaultInstruction: "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    defaultPrompts: {
      company: "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
      person:  "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    },
    behaviorOptions: [
      { value: "evidence_validation", label: "근거 검증" },
      { value: "risk_review",         label: "리스크 리뷰" },
    ],
  },
  mail_share: {
    label: "내부메일 공유 AI 서비스", agentId: "mail_share", category: AI_SERVICE_GROUP,
    defaultInstruction: "분석 결과보고서를 내부메일 본문과 첨부 요약으로 구성하여 관련 부서에 공유",
    defaultPrompts: {
      company: "분석 결과보고서를 내부메일 본문과 첨부 요약으로 구성하여 관련 부서에 공유",
      person:  "개인 수사 결과보고서를 내부메일 본문과 첨부 요약으로 구성하여 관련 부서에 공유",
    },
    behaviorOptions: [
      { value: "internal_mail", label: "내부메일 공유" },
      { value: "team_brief",    label: "팀 공유 요약" },
    ],
  },

  /* ── 별칭 (agentRequirement 호환) ───────────────── */
  cdw:          { label: "CDW 조회",           agentId: "db",         category: DATA_SOURCE_GROUP },
  db:           { label: "CDW 조회",           agentId: "db",         category: DATA_SOURCE_GROUP },
  company:      { label: "기업 프로파일 조회", agentId: "company",    category: AI_SERVICE_GROUP  },
  company_lookup:{ label: "기업 프로파일 조회",agentId: "company",    category: AI_SERVICE_GROUP  },
  audit_search: { label: "조사보고서 검색",    agentId: "audit_search",category: AI_SERVICE_GROUP  },
  bigdata:      { label: "빅데이터 통계 분석", agentId: "bigdata",    category: AI_SERVICE_GROUP  },
  report:       { label: "보고서 생성",        agentId: "report",     category: AI_SERVICE_GROUP  },
  validate:     { label: "보고서 검증",        agentId: "validation", category: AI_SERVICE_GROUP  },
  validation:   { label: "보고서 검증",        agentId: "validation", category: AI_SERVICE_GROUP  },
  web:          { label: "웹정보 검색",        agentId: "web",        category: AI_SERVICE_GROUP  },
};

/* ── 기존 호환: AGENT_SERVICE_DEFINITIONS ────────────────────── */
export const AGENT_SERVICE_DEFINITIONS = Object.fromEntries(
  Object.entries(AI_SERVICE_CATALOG).map(([id, def]) => [
    id,
    { agentId: def.agentId, label: def.label, category: def.category },
  ])
);

/* ── 헬퍼: serviceId로 카탈로그 항목 조회 ────────────────────── */
export function getServiceDef(serviceId){
  return AI_SERVICE_CATALOG[serviceId] || null;
}

/* ── 헬퍼: behaviorOptions 기본값 조회 ──────────────────────── */
export function getServiceBehaviorOptions(serviceId){
  return AI_SERVICE_CATALOG[serviceId]?.behaviorOptions
    || [{ value: "default", label: "기본 동작" }];
}

/* ── 헬퍼: 기본 지시문 조회 ─────────────────────────────────── */
export function getServiceDefaultInstruction(serviceId, targetType = "company"){
  const def = AI_SERVICE_CATALOG[serviceId];
  if(!def) return "";
  return (targetType === "person" ? def.defaultPrompts?.person : def.defaultPrompts?.company)
      || def.defaultInstruction
      || "";
}

/* ── 기존 함수들 (subtab 메타데이터 생성용) ──────────────────── */
export function agentRequirement(serviceId){
  const definition = AGENT_SERVICE_DEFINITIONS[serviceId] || {};
  return {
    serviceId,
    agentId:  definition.agentId  || serviceId,
    label:    definition.label    || serviceId,
    category: definition.category || "agent",
    required: true,
  };
}

export function agentAction(requirement){
  return {
    serviceId: requirement.serviceId,
    agentId:   requirement.agentId,
    action:    "use",
    label:     requirement.label,
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
