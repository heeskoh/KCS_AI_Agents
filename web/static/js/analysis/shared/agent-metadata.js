export const DB_SEARCH_GROUP = "db";
export const RAG_GROUP = "rag";
export const ANALYSIS_AI_GROUP = "analysis";
export const LLM_SERVICE_GROUP = "llm";
export const EXTERNAL_AI_GROUP = "external";
export const REPORT_AI_GROUP = "report";

export const DATA_SOURCE_GROUP = DB_SEARCH_GROUP;
export const AI_SERVICE_GROUP = ANALYSIS_AI_GROUP;

const cfg = (label, agentId, category, companyPrompt, personPrompt = companyPrompt, behaviorOptions = [], supports = { company:true, person:true }, adminVisible = true) => ({
  label,
  agentId,
  category,
  defaultInstruction: companyPrompt,
  defaultPrompts: { company: companyPrompt, person: personPrompt },
  behaviorOptions: behaviorOptions.length ? behaviorOptions : [{ value: "default", label: "기본 동작" }],
  supports,
  adminVisible,
});

export const AI_SERVICE_CATALOG = {
  db_cdw: cfg("CDW 자연어조회", "db", DB_SEARCH_GROUP,
    "기업 프로파일, 통합 위험정보, 조사·소송 이력, 수출입신고 내역을 종합 조회",
    "우범자 프로파일, 여행·반입 이력, 위험지표를 종합 요약",
    [
      { value:"profile_summary", label:"기업프로파일조회" },
      { value:"risk_focus", label:"통합위험정보조회" },
      { value:"audit_history", label:"조사및소송 이력조회" },
      { value:"declaration_focus", label:"수출입신고내역조회" },
    ]),
  db_external: cfg("전자통관외부정보조회", "db_external", DB_SEARCH_GROUP,
    "전자통관 연계 외부기관 자료(국세청 세적자료, 한국은행 수신자료)를 조회",
    "수사 대상 개인의 세적·외환 수신자료를 조회",
    [
      { value:"nts_tax_data", label:"국세청세적자료" },
      { value:"bok_receipt_data", label:"한국은행수신자료" },
    ]),
  external_agency: cfg("외부기관정보수집", "external_agency", EXTERNAL_AI_GROUP,
    "DART·NICE·CRETOP 등 외부기관 사이트에서 공시·신용·시세·특허·해외기업정보를 수집",
    "외부기관 사이트에서 개인 연관 기업·지식재산 정보를 수집",
    [
      { value:"dart", label:"금융감독원 전자공시(DART)" },
      { value:"nice_bizline", label:"NICE평가정보(BizLINE)" },
      { value:"cretop", label:"한국기업데이터(CRETOP)" },
      { value:"korea_pds", label:"코리아PDS(KOREA PDS)" },
      { value:"kpi", label:"한국물가정보(KPI)" },
      { value:"kipris", label:"특허정보넷(KIPRIS)" },
      { value:"orbis", label:"뷰로반다익(ORBIS)" },
      { value:"dnb", label:"Dun&Bradstreet(D&B)" },
    ],
    { company:true, person:false }),
  company_profile: cfg("기업 프로파일 조회", "company", DB_SEARCH_GROUP,
    "기업 기본정보, 위험등급, 수입실적, 최근 신고·검사 이력을 조회",
    "기업 프로파일 조회는 개인 대상에서 사용하지 않습니다.",
    [
      { value:"profile_lookup", label:"기업 프로파일 조회" },
      { value:"risk_summary", label:"위험정보 요약" },
    ],
    { company:true, person:false }),

  rag_customs: cfg("관세정보 RAG", "rag_customs", RAG_GROUP,
    "관세 업무 정보에서 과세가격, 원산지, 품목분류 관련 근거 확인",
    "휴대품, 여행자 통관, 조사 절차 관련 규정 근거 확인",
    [
      { value:"regulation_basis", label:"관세정보 근거 확인" },
      { value:"case_comparison", label:"유사사례 비교" },
    ]),
  rag_audit: cfg("심사정보 RAG", "rag_audit", RAG_GROUP,
    "심사정보와 추징 가능성 관점의 조사 포인트 정리",
    "개인 사건 검토 이력과 추징 가능성 관점의 조사 포인트 정리",
    [
      { value:"audit_case", label:"심사사례 비교" },
      { value:"recovery_point", label:"추징 포인트" },
    ]),
  rag_investigation: cfg("조사정보 RAG", "rag_investigation", RAG_GROUP,
    "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    "개인 수사 정보 기반으로 수사 순서와 확인 자료 정리",
    [
      { value:"investigation_plan", label:"조사계획 수립" },
      { value:"evidence_check", label:"증빙 체크" },
    ]),
  rag_global: cfg("국제협력 RAG", "rag_global", RAG_GROUP,
    "국제협력 정보 기반으로 해외 거래구조와 위험 신호 확인",
    "국제 여행·체류·공조 정보 기반으로 개인 위험 신호 확인",
    [
      { value:"global_signal", label:"국제협력 위험신호" },
      { value:"counterparty", label:"해외거래처 확인" },
    ]),
  rag_trade: cfg("무역정보 RAG", "rag_trade", RAG_GROUP,
    "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    "개인 반입·운송·거래 정보에서 이상 징후와 참고 근거 확인",
    [
      { value:"trade_signal", label:"무역 징후 확인" },
      { value:"market_context", label:"시장 맥락 확인" },
    ],
    { company:true, person:true },
    false),

  customs_value: cfg("과세가격평가 AI 서비스", "customs_value", ANALYSIS_AI_GROUP,
    "과세가격 결정 요소와 저가신고 가능성 검토",
    "개인 반입 물품의 과세가격 산정 근거와 축소 신고 가능성 검토",
    [
      { value:"valuation_basis", label:"과세가격 근거" },
      { value:"undervaluation", label:"저가신고 탐지" },
    ]),
  network: cfg("관계망 분석 AI 서비스", "network", LLM_SERVICE_GROUP,
    "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    "인물·동행자·연락처·주소 관계망을 분석해 공범, 전달책, 반복 연계 가능성을 식별",
    [
      { value:"relationship", label:"관계망 분석" },
      { value:"paper_company", label:"페이퍼컴퍼니" },
    ]),
  proceeds_tracking: cfg("범죄수익 추적 AI 서비스", "proceeds_tracking", ANALYSIS_AI_GROUP,
    "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    "개인 계좌·송금·현금 반입 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    [
      { value:"fund_flow", label:"자금흐름" },
      { value:"account_trace", label:"계좌추적 단서" },
      { value:"concealment", label:"은닉 가능성" },
    ]),
  declaration_verify: cfg("수입신고검증 AI 서비스", "declaration_verify", ANALYSIS_AI_GROUP,
    "첨부문서 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    "개인 휴대품 신고, 반입 물품, 첨부 증빙을 비교해 불일치와 은닉 가능성 확인",
    [
      { value:"declaration_consistency", label:"신고 정합성" },
      { value:"missing_evidence", label:"누락 증빙" },
    ]),
  route_analysis: cfg("운송경로 분석 AI 서비스", "route_analysis", ANALYSIS_AI_GROUP,
    "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    "여행경로, 경유지, 동행 이력을 분석해 우회 반입 가능성을 탐지",
    [
      { value:"route_check", label:"운송경로" },
      { value:"supply_chain", label:"공급망 역추적" },
      { value:"transshipment", label:"우회경유" },
    ]),
  origin_analysis: cfg("원산지 검증 AI 서비스", "origin_analysis", ANALYSIS_AI_GROUP,
    "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    "개인 반입 물품의 원산지 증빙과 우회 반입 가능성을 분석",
    [
      { value:"origin_certificate", label:"원산지증명 검토" },
      { value:"fta_risk", label:"FTA 리스크" },
      { value:"circumvention", label:"우회수입 확인" },
    ]),
  abnormal_trade: cfg("이상거래 검증 AI 서비스", "abnormal_trade", ANALYSIS_AI_GROUP,
    "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    "반입·송금·연락·이동 패턴의 이상 징후를 검증",
    [
      { value:"price_pattern", label:"가격 패턴" },
      { value:"counterparty_pattern", label:"거래상대방" },
      { value:"declaration_pattern", label:"신고패턴" },
    ]),
  hs_verify: cfg("품목분류검증 AI 서비스", "hs_verify", ANALYSIS_AI_GROUP,
    "수입신고 품목과 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    "개인 반입 물품의 품목분류와 규제 대상 여부를 검증",
    [
      { value:"classification_check", label:"분류 적정성" },
      { value:"alternative_hs", label:"대체 HS 후보" },
    ]),
  ml: cfg("ML 모델 실행 AI 서비스", "ml", LLM_SERVICE_GROUP,
    "전체 모델을 실행해 기업 위험 패턴을 비교",
    "전체 모델을 실행해 개인 위험 패턴을 비교",
    [
      { value:"all_models", label:"전체 모델 실행" },
      { value:"industry_stats", label:"동종업종 통계" },
      { value:"hs_risk", label:"HS 위험점수" },
      { value:"hs_recommend", label:"품목분류 추천" },
      { value:"anomaly", label:"이상치 탐색" },
    ]),

  rag_create: cfg("업무특화RAG 분석서비스", "rag_create", LLM_SERVICE_GROUP,
    "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    "개인 사건 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    [
      { value:"knowledge_build", label:"지식 생성" },
      { value:"source_cleanup", label:"자료 정제" },
    ]),
  ocr: cfg("OCR/문서인식 AI 서비스", "ocr", LLM_SERVICE_GROUP,
    "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    "개인 신분·여행·반입 관련 첨부 문서에서 주요 항목을 추출하고 구조화",
    [
      { value:"document_extract", label:"문서 항목 추출" },
      { value:"evidence_parse", label:"증빙 구조화" },
    ]),

  translate: cfg("문서 번역 AI 서비스", "translate", LLM_SERVICE_GROUP,
    "입력한 문서·텍스트를 지정한 대상 언어로 번역",
    "입력한 문서·텍스트를 지정한 대상 언어로 번역",
    [
      { value:"faithful", label:"원문 충실 번역" },
      { value:"natural", label:"자연스러운 의역" },
    ]),
  text_summary: cfg("요약 AI 서비스", "text_summary", LLM_SERVICE_GROUP,
    "입력한 문서·텍스트를 지정한 결과 형식으로 요약",
    "입력한 문서·텍스트를 지정한 결과 형식으로 요약",
    [
      { value:"bullet", label:"핵심 불릿" },
      { value:"table", label:"표 형식" },
      { value:"narrative", label:"서술 요약" },
      { value:"custom", label:"사용자 템플릿" },
    ]),
  report_standard: cfg("표준 보고서 생성 AI 서비스", "report_standard", LLM_SERVICE_GROUP,
    "표준 보고서 템플릿의 형식·구성에 맞춰 신규 보고서 내용을 재구성",
    "표준 보고서 템플릿의 형식·구성에 맞춰 신규 보고서 내용을 재구성",
    [
      { value:"match_template", label:"템플릿 형식 적용" },
      { value:"fill_sections", label:"섹션별 채움" },
    ]),

  law: cfg("법령 검토 AI 서비스", "law", EXTERNAL_AI_GROUP,
    "관련 법령, 고시, 판례, 유권해석 근거 검색",
    "개인 수사·통관·처분 관련 법령, 고시, 판례, 유권해석 근거 검색",
    [
      { value:"law_basis", label:"법령 근거" },
      { value:"precedent", label:"판례/유권해석" },
    ]),
  mail_share: cfg("분석결과 공유 AI 서비스", "mail_share", EXTERNAL_AI_GROUP,
    "분석결과 보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유",
    "개인 수사 결과보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유",
    [
      { value:"email_share", label:"이메일 공유" },
      { value:"team_brief", label:"팀 공유 요약" },
    ]),
  web_search: cfg("웹검색 AI 서비스", "web", EXTERNAL_AI_GROUP,
    "업체, 공급망, 가격 변동 관련 기사 또는 직접 등록한 URL에서 지정 정보를 확인",
    "인물, 조직, 사건, 여행 경로 관련 공개 정보 또는 직접 등록한 URL에서 지정 정보를 확인",
    [
      { value:"company_news", label:"업체 기사" },
      { value:"supply_chain", label:"공급망/가격" },
      { value:"industry_news", label:"동종업종 기사" },
      { value:"direct_url", label:"URL 직접 등록" },
    ]),
  patent: cfg("특허정보 조회 AI 서비스", "patent", EXTERNAL_AI_GROUP,
    "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    "개인 반입 물품의 상표권·지식재산권 침해 가능성 확인",
    [
      { value:"royalty_check", label:"로열티 확인" },
      { value:"patent_lookup", label:"특허 정보 조회" },
    ]),

  report_validate: cfg("보고서 검증 AI 서비스", "validation", REPORT_AI_GROUP,
    "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    [
      { value:"evidence_validation", label:"근거 검증" },
      { value:"risk_review", label:"리스크 리뷰" },
    ]),
  report_generate: cfg("보고서 생성 AI 서비스", "report", REPORT_AI_GROUP,
    "보고서 대상 자료를 공식 조사보고서 초안으로 통합",
    "보고서 대상 자료를 개인 수사보고서 초안으로 통합",
    [
      { value:"full_report", label:"전체 보고서" },
      { value:"issue_report", label:"쟁점 중심 보고서" },
    ]),

  company: { label:"기업 프로파일 조회", agentId:"company", category:DB_SEARCH_GROUP, adminVisible:false },
  company_lookup: { label:"기업 프로파일 조회", agentId:"company", category:DB_SEARCH_GROUP, adminVisible:false },
  cdw: { label:"CDW 자연어조회", agentId:"db", category:DB_SEARCH_GROUP, adminVisible:false },
  db: { label:"CDW 자연어조회", agentId:"db", category:DB_SEARCH_GROUP, adminVisible:false },
  report: { label:"보고서 생성 AI 서비스", agentId:"report", category:REPORT_AI_GROUP, adminVisible:false },
  validate: { label:"보고서 검증 AI 서비스", agentId:"validation", category:REPORT_AI_GROUP, adminVisible:false },
  validation: { label:"보고서 검증 AI 서비스", agentId:"validation", category:REPORT_AI_GROUP, adminVisible:false },
  web: { label:"웹검색 AI 서비스", agentId:"web", category:EXTERNAL_AI_GROUP, adminVisible:false },
};

export const AGENT_SERVICE_DEFINITIONS = Object.fromEntries(
  Object.entries(AI_SERVICE_CATALOG)
    .filter(([, def]) => def.adminVisible !== false)
    .map(([id, def]) => [
      id,
      { agentId: def.agentId, label: def.label, category: def.category },
    ])
);

export function getServiceDef(serviceId){
  return AI_SERVICE_CATALOG[serviceId] || null;
}

export function getServiceBehaviorOptions(serviceId){
  return AI_SERVICE_CATALOG[serviceId]?.behaviorOptions
    || [{ value: "default", label: "기본 동작" }];
}

export function getServiceDefaultInstruction(serviceId, targetType = "company"){
  const def = AI_SERVICE_CATALOG[serviceId];
  if(!def) return "";
  return (targetType === "person" ? def.defaultPrompts?.person : def.defaultPrompts?.company)
    || def.defaultInstruction
    || "";
}

export function agentRequirement(serviceId){
  const definition = AGENT_SERVICE_DEFINITIONS[serviceId] || {};
  return {
    serviceId,
    agentId: definition.agentId || serviceId,
    label: definition.label || serviceId,
    category: definition.category || ANALYSIS_AI_GROUP,
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
