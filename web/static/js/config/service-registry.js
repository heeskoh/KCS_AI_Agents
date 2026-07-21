/* AI 서비스 레지스트리 · 사용자/권한 정의 · 시나리오 소스 헬퍼.
   app-runtime.js에서 분리한 선언 전용 모듈 — 실행 로직이나 가변 상태는 두지 않는다.
   (외부 의존이 없어 그대로 옮겨졌다. 값을 바꿀 때는 data/scenario_builder_config.json과
    data/workspace_state/*.json의 저장 상태가 코드 기본값을 덮어쓸 수 있으니 함께 확인할 것) */
export const DB_SEARCH_GROUP = "DB 검색";
export const RAG_SEARCH_GROUP = "RAG 검색";
export const ANALYSIS_AI_GROUP = "업무분석 AI서비스";
export const LLM_SERVICE_GROUP = "분석지원 AI 서비스";
export const EXTERNAL_AI_GROUP = "외부연계 AI서비스";
export const REPORT_AI_GROUP = "보고서 생성 및 검증";
const AI_SERVICE_GROUP = ANALYSIS_AI_GROUP;
const DATA_SOURCE_GROUP = DB_SEARCH_GROUP;

// 권한: 업무지식베이스(permissionGroup=dataSources)만 그룹별 rag 목록으로 제한하고,
// AI 서비스(permissionGroup=agents)는 전체 사용자 허용 — buildGroupPermissions() 참조.

export const AI_SERVICE_REGISTRY = {
  // ── [업무지식베이스] 정형DB(Text-to-SQL) + 업무 영역별 RAG ──
  db_cdw: {
    label: "CDW 자연어조회", type: "db", group: DB_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "전자통관 통합정보(CDW)에서 기업프로파일·통합위험정보·조사/소송 이력·수출입신고 내역을 조회하고, 자연어 질의는 SQL로 해석·실행해 분석 결과를 제공",
    behaviorOptions: [
      { value: "profile_summary", label: "기업프로파일조회" },
      { value: "risk_focus", label: "통합위험정보조회" },
      { value: "audit_history", label: "조사및소송 이력조회" },
      { value: "declaration_focus", label: "수출입신고내역조회" },
    ],
    defaultBehaviors: ["profile_summary", "risk_focus", "audit_history", "declaration_focus"],
  },
  db_external: {
    label: "전자통관외부정보조회", type: "db_external", group: DB_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "전자통관 연계 외부기관 자료(국세청 세적자료, 한국은행 수신자료)를 조회해 대상의 세정·외환 기초정보를 확인",
    behaviorOptions: [
      { value: "nts_tax_data", label: "국세청세적자료" },
      { value: "bok_receipt_data", label: "한국은행수신자료" },
    ],
    defaultBehaviors: ["nts_tax_data", "bok_receipt_data"],
  },
  company_profile: {
    label: "기업 프로파일 조회", type: "company", group: DB_SEARCH_GROUP, permissionGroup: "dataSources", selectable: false, adminVisible: false,
    defaultInstruction: "기업 기본정보, 위험등급, 수입실적, 최근 신고·검사 이력을 조회",
    supports: { company:true, person:false },
    behaviorOptions: [
      { value: "profile_lookup", label: "기업 프로파일 조회" },
      { value: "risk_summary", label: "위험정보 요약" },
    ],
  },
  rag_customs: {
    label: "관세정보RAG", type: "rag_customs", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "업무규정, 관세법령, 사례집 기반 유사사례 검색",
    behaviorOptions: [
      { value: "regulation_basis", label: "관세정보 근거 확인" },
      { value: "case_comparison", label: "유사사례 비교" },
    ],
  },
  rag_audit: {
    label: "심사정보RAG", type: "rag_audit", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "심사결과보고서 기반 유사사례 검색 (심사국 한정)",
    behaviorOptions: [
      { value: "audit_case", label: "심사사례 비교" },
      { value: "recovery_point", label: "추징 포인트" },
    ],
  },
  rag_investigation: {
    label: "조사정보RAG", type: "rag_investigation", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "조사/수사결과보고서 기반 유사사례 검색 (조사국 한정)",
    behaviorOptions: [
      { value: "investigation_plan", label: "조사계획 수립" },
      { value: "evidence_check", label: "증빙 체크" },
    ],
  },
  rag_global: {
    label: "국제협력RAG", type: "rag_global", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "WCO 회의록 및 국제협력 내용 (국제협력국 수정권한, 타부서 조회 권한 제공)",
    behaviorOptions: [
      { value: "global_signal", label: "국제협력 위험신호" },
      { value: "counterparty", label: "해외거래처 확인" },
    ],
  },
  rag_item: {
    label: "품목정보RAG", type: "rag_item", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "HSK 품목별 신고 가이드(품명·규격·성분·수입요건·유의사항) 기반 물품 신고요령 검색",
    behaviorOptions: [
      { value: "item_guide", label: "품목 신고요령 확인" },
      { value: "requirement_check", label: "수입요건·유의사항 확인" },
    ],
  },
  rag_consultation: {
    label: "상담내역 RAG", type: "rag_consultation", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources", selectable: false, adminVisible: false,
    defaultInstruction: "상담내역과 민원 질의 응답에서 유사 사례와 처리 흐름 확인",
    behaviorOptions: [
      { value: "consultation_case", label: "상담사례 확인" },
      { value: "response_pattern", label: "답변흐름 정리" },
    ],
  },
  // 업무특화 RAG 검색: 기초자료 등록 팝업에서 신규 RAG 생성 시 분석 프로세스 맨 앞에 자동 추가되는 단계.
  // 팔레트에는 노출하지 않고(selectable·adminVisible=false) 프로그램으로만 추가한다. 라벨은 단계별로 RAG 이름을 덧붙인다.
  rag_custom_search: {
    label: "업무특화 RAG 검색", type: "rag_custom_search", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources", selectable: false, adminVisible: false,
    defaultInstruction: "신규 생성한 업무특화 RAG에서 이번 조사와 관련된 근거·유사사례를 우선 검색",
    behaviorOptions: [
      { value: "knowledge_search", label: "업무특화 지식 검색" },
      { value: "case_comparison", label: "유사사례 비교" },
    ],
  },
  ml: {
    label: "ML 모델 실행 AI 서비스", type: "ml", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "전체 모델을 실행해 기업 위험 패턴을 비교",
    personInstruction: "전체 모델을 실행해 개인 위험 패턴을 비교",
    behaviorOptions: [
      { value: "all_models", label: "전체 모델 실행" },
      { value: "industry_stats", label: "동종업종 통계" },
      { value: "hs_risk", label: "HS 위험점수" },
      { value: "hs_recommend", label: "품목분류 추천" },
      { value: "anomaly", label: "이상치 탐색" },
    ],
  },
  network: {
    label: "관계망 분석 AI 서비스", type: "network", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    personInstruction: "인물·동행자·연락처·주소 관계망을 분석해 공범, 전달책, 반복 연계 가능성을 식별",
    behaviorOptions: [
      { value: "relationship", label: "관계망 분석" },
      { value: "paper_company", label: "페이퍼컴퍼니" },
    ],
  },
  ontology: {
    label: "관세온톨로지 AI 서비스", type: "ontology", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "기업·거래·품목 중심 관세 온톨로지와 지식그래프 관계를 구성",
    personInstruction: "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성",
    behaviorOptions: [
      { value: "traveler_ontology", label: "우범여행자 온톨로지" },
      { value: "cargo_relation", label: "화물 관계 분석" },
      { value: "semantic_rules", label: "추론 규칙 생성" },
    ],
  },
  // ── [업무분석 AI 서비스] ──
  rag_risk_select: {
    label: "위험Case검색 서비스", type: "rag_risk_select", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인",
    personInstruction: "개인 위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인",
    behaviorOptions: [
      { value: "selection_rule", label: "선별기준 확인" },
      { value: "risk_signal", label: "위험신호 정리" },
    ],
  },
  origin_analysis: {
    label: "원산지 검증 AI 서비스", type: "origin_analysis", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    personInstruction: "개인 반입 물품의 원산지 증빙과 우회 반입 가능성을 분석",
    behaviorOptions: [
      { value: "origin_certificate", label: "원산지증명 검토" },
      { value: "fta_risk", label: "FTA 리스크" },
      { value: "circumvention", label: "우회수입 확인" },
    ],
  },
  abnormal_trade: {
    label: "이상거래 검증 AI 서비스", type: "abnormal_trade", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    personInstruction: "반입·송금·연락·이동 패턴의 이상 징후를 검증",
    behaviorOptions: [
      { value: "price_pattern", label: "가격 패턴" },
      { value: "counterparty_pattern", label: "거래상대방" },
      { value: "declaration_pattern", label: "신고패턴" },
    ],
  },
  proceeds_tracking: {
    label: "범죄수익 추적 AI 서비스", type: "proceeds_tracking", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    personInstruction: "개인 계좌·송금·현금 반입 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    behaviorOptions: [
      { value: "fund_flow", label: "자금흐름" },
      { value: "account_trace", label: "계좌추적 단서" },
      { value: "concealment", label: "은닉 가능성" },
    ],
  },
  // 신규: 범죄자금추적 — 실제 등록된 소스(이체·가상자산·현금 등)에 따라 분석.
  // 동작 선택 = 분석에 사용할 데이터 소스 선택. (범죄수익 추적과는 별개 서비스)
  fund_trace: {
    label: "범죄자금내역 추적 AI 서비스", type: "fund_trace", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "자금이체·현금입출금·가상계좌 이체 등 자금내역 파일을 입력받아 시계열·소유주 중심으로 추적관리(관계망 그래프 활용)",
    behaviorOptions: [
      { value: "fund_flow", label: "자금흐름내역" },
      { value: "transfer", label: "계좌·송금 이체내역" },
      { value: "virtual_asset", label: "가상자산 거래내역" },
      { value: "cash", label: "현금 입출금내역" },
    ],
  },
  // 신규: 통신내역 AI 분석 — 동작 선택 = 분석에 사용할 통신 소스 선택.
  comms_analysis: {
    label: "통신내역 AI 분석 서비스", type: "comms", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "등록된 통신 소스(통화·SMS·SNS·메신저 등) 중 선택한 항목을 분석해 연락 빈도·공범·전달책 관계 단서를 도출",
    behaviorOptions: [
      { value: "call", label: "통화내역" },
      { value: "sms", label: "SMS" },
      { value: "sns", label: "SNS" },
      { value: "messenger", label: "메신저" },
    ],
  },
  route_analysis: {
    label: "운송경로 분석 AI 서비스", type: "route_analysis", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    personInstruction: "여행경로, 경유지, 동행 이력을 분석해 우회 반입 가능성을 탐지",
    behaviorOptions: [
      { value: "route_check", label: "운송경로" },
      { value: "supply_chain", label: "공급망 역추적" },
      { value: "transshipment", label: "우회경유" },
    ],
  },
  web_search: {
    label: "웹 정보수집 요청 AI 서비스", type: "web", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "참고 URL을 등록하고 업체, 공급망, 가격 변동 관련 외부정보 수집을 요청",
    personInstruction: "참고 URL을 등록하고 인물, 조직, 사건, 여행 경로 관련 외부정보 수집을 요청",
    behaviorOptions: [
      { value: "company_news", label: "업체 기사" },
      { value: "supply_chain", label: "공급망/가격" },
      { value: "industry_news", label: "동종업종 기사" },
      { value: "direct_url", label: "URL 직접 등록" },
    ],
  },
  declaration_verify: {
    label: "수입신고검증 AI 서비스", type: "declaration_verify", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    personInstruction: "개인 휴대품 신고, 반입 물품, 첨부 증빙을 비교해 불일치와 은닉 가능성 확인",
    behaviorOptions: [
      { value: "declaration_consistency", label: "신고 정합성" },
      { value: "missing_evidence", label: "누락 증빙" },
    ],
  },
  hs_verify: {
    label: "품목분류검증 AI 서비스", type: "hs_verify", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    personInstruction: "개인 반입 물품의 품목분류와 규제 대상 여부를 검증",
    behaviorOptions: [
      { value: "classification_check", label: "분류 적정성" },
      { value: "alternative_hs", label: "대체 HS 후보" },
    ],
  },
  customs_value: {
    label: "과세가격평가 AI 서비스", type: "customs_value", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "과세가격 결정 요소와 저가신고 가능성 검토",
    personInstruction: "개인 반입 물품의 과세가격 산정 근거와 축소 신고 가능성 검토",
    behaviorOptions: [
      { value: "valuation_basis", label: "과세가격 근거" },
      { value: "undervaluation", label: "저가신고 탐지" },
    ],
  },
  rag_trade: {
    label: "통관보고서 생성", type: "rag_trade", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    personInstruction: "개인 반입·운송·거래 정보에서 이상 징후와 참고 근거 확인",
    behaviorOptions: [
      { value: "trade_signal", label: "무역 징후 확인" },
      { value: "market_context", label: "시장 맥락 확인" },
    ],
  },
  external_agency: {
    label: "외부기관정보수집 AI 서비스", type: "external_agency", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "금융감독원 DART, NICE BizLINE, CRETOP, KOREA PDS, KPI, KIPRIS, ORBIS, D&B 등 외부기관 사이트에서 공시·신용·시세·특허·해외기업정보를 수집",
    behaviorOptions: [
      { value: "dart", label: "금융감독원 전자공시(DART)" },
      { value: "nice_bizline", label: "NICE평가정보(BizLINE)" },
      { value: "cretop", label: "한국기업데이터(CRETOP)" },
      { value: "korea_pds", label: "코리아PDS(KOREA PDS)" },
      { value: "kpi", label: "한국물가정보(KPI)" },
      { value: "kipris", label: "특허정보넷(KIPRIS)" },
      { value: "orbis", label: "뷰로반다익(ORBIS)" },
      { value: "dnb", label: "Dun&Bradstreet(D&B)" },
    ],
    defaultBehaviors: ["dart", "nice_bizline", "cretop", "korea_pds", "kpi", "kipris", "orbis", "dnb"],
  },
  patent: {
    label: "특허정보 조회 AI 서비스", type: "patent", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    personInstruction: "개인 반입 물품의 상표권·지식재산권 침해 가능성 확인",
    behaviorOptions: [
      { value: "royalty_check", label: "로열티 확인" },
      { value: "patent_lookup", label: "특허 정보 조회" },
    ],
  },
  law: {
    label: "법령 검토 AI 서비스", type: "law", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "관련 법령, 고시, 판례, 유권해석 근거 검색",
    personInstruction: "개인 수사·통관·처분 관련 법령, 고시, 판례, 유권해석 근거 검색",
    behaviorOptions: [
      { value: "law_basis", label: "법령 근거" },
      { value: "precedent", label: "판례/유권해석" },
    ],
  },
  address_check: {
    label: "주소확인 AI 서비스", type: "address_check", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "카카오지도(로컬) API로 입력 주소를 확인해 개인주소(주거용)인지 사업장(상업용)인지 판별하고 근거를 제시",
    personInstruction: "대상자 주소지를 카카오지도(로컬) API로 확인해 주거지 실재 여부와 사업장 여부를 판별하고 근거를 제시",
    behaviorOptions: [
      { value: "building_use", label: "건물용도 판별(가정집/상가)" },
      { value: "biz_presence", label: "사업장 실재성 확인" },
    ],
  },
  ocr: {
    label: "OCR/문서인식 AI 서비스", type: "ocr", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    personInstruction: "개인 신분·여행·반입 관련 첨부 문서에서 주요 항목을 추출하고 구조화",
    behaviorOptions: [
      { value: "document_extract", label: "문서 항목 추출" },
      { value: "evidence_parse", label: "증빙 구조화" },
    ],
  },
  rag_create: {
    label: "업무특화RAG 분석서비스", type: "rag_create", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    personInstruction: "개인 사건 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    behaviorOptions: [
      { value: "knowledge_build", label: "지식 생성" },
      { value: "source_cleanup", label: "자료 정제" },
    ],
  },
  translate: {
    label: "문서 번역 AI 서비스", type: "translate", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "입력한 문서·텍스트를 지정한 대상 언어로 번역",
    behaviorOptions: [
      { value: "faithful", label: "원문 충실 번역" },
      { value: "natural", label: "자연스러운 의역" },
    ],
  },
  text_summary: {
    label: "요약 AI 서비스", type: "text_summary", group: LLM_SERVICE_GROUP, permissionGroup: "agents", selectable: false, adminVisible: false,
    defaultInstruction: "입력한 문서·텍스트를 지정한 결과 형식으로 요약",
    behaviorOptions: [
      { value: "bullet", label: "핵심 불릿" },
      { value: "table", label: "표 형식" },
      { value: "narrative", label: "서술 요약" },
      { value: "custom", label: "사용자 템플릿" },
    ],
  },
  report_standard: {
    label: "표준보고서 생성 AI 서비스", type: "report_standard", group: REPORT_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "입력자료를 유사사례 표준보고서 형식으로 재구성",
    behaviorOptions: [
      { value: "match_template", label: "템플릿 형식 적용" },
      { value: "fill_sections", label: "섹션별 채움" },
    ],
  },
  summary: {
    label: "보고서 요약 AI 서비스", type: "summary", group: REPORT_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "요약 대상을 조사관용 핵심 요약으로 정리",
    personInstruction: "요약 대상을 개인 수사 담당자용 핵심 요약으로 정리",
    behaviorOptions: [
      { value: "brief", label: "핵심 요약" },
      { value: "evidence_table", label: "근거 표 정리" },
    ],
  },
  report_generate: {
    label: "보고서 생성 AI 서비스", type: "report", group: REPORT_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "보고서 대상 자료를 공식 조사보고서 초안으로 통합",
    personInstruction: "보고서 대상 자료를 개인 수사보고서 초안으로 통합",
    behaviorOptions: [
      { value: "full_report", label: "전체 보고서" },
      { value: "issue_report", label: "쟁점 중심 보고서" },
    ],
  },
  report_validate: {
    label: "보고서 검증 AI 서비스", type: "validation", group: REPORT_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    personInstruction: "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    behaviorOptions: [
      { value: "evidence_validation", label: "근거 검증" },
      { value: "risk_review", label: "리스크 리뷰" },
    ],
  },
  result_synthesis: {
    label: "결과통합 AI서비스", type: "result_synthesis", group: REPORT_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "선행 단계 결과를 사용자가 지정한 최종 결과 형식으로 종합",
    personInstruction: "선행 단계 결과를 사용자가 지정한 최종 결과 형식으로 종합",
    behaviorOptions: [
      { value: "synthesize", label: "결과 종합" },
      { value: "final_format", label: "최종 형식 적용" },
    ],
  },
  mail_share: {
    label: "내부메일 공유 AI 서비스", type: "mail_share", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "분석결과 보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유",
    personInstruction: "개인 수사 결과보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유",
    behaviorOptions: [
      { value: "email_share", label: "이메일 공유" },
      { value: "team_brief", label: "팀 공유 요약" },
    ],
  },
};

const targetConfig = (companyPrompt, personPrompt = companyPrompt, supports = { company:true, person:true }) => ({
  supports,
  defaultPrompts: {
    company: companyPrompt,
    person: personPrompt,
  },
});

const AI_SERVICE_TARGET_CONFIG = {
  db_cdw: targetConfig(
    "기업 프로파일, 통합 위험정보, 조사·소송 이력, 수출입신고 내역을 종합 조회",
    "우범자 프로파일, 여행·반입 이력, 위험지표를 종합 요약"
  ),
  db_external: targetConfig(
    "전자통관 연계 외부기관 자료(국세청 세적자료, 한국은행 수신자료)를 조회",
    "수사 대상 개인의 세적·외환 수신자료를 조회"
  ),
  external_agency: targetConfig(
    "DART·NICE·CRETOP 등 외부기관 사이트에서 공시·신용·시세·특허·해외기업정보를 수집",
    "외부기관 사이트에서 개인 연관 기업·지식재산 정보를 수집",
    { company:true, person:false }
  ),
  company_profile: targetConfig(
    "기업 기본정보, 위험등급, 수입실적, 최근 신고·검사 이력을 조회",
    "기업 프로파일 조회는 개인 대상에서 사용하지 않습니다.",
    { company:true, person:false }
  ),
  rag_customs: targetConfig(
    "관세 업무 정보에서 과세가격, 원산지, 품목분류 관련 근거 확인",
    "휴대품, 여행자 통관, 조사 절차 관련 규정 근거 확인"
  ),
  rag_trade: targetConfig(
    "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    "개인 반입·운송·거래 정보에서 이상 징후와 참고 근거 확인"
  ),
  rag_audit: targetConfig(
    "심사정보와 추징 가능성 관점의 조사 포인트 정리",
    "개인 사건 검토 이력과 추징 가능성 관점의 조사 포인트 정리"
  ),
  rag_investigation: targetConfig(
    "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    "개인 수사 정보 기반으로 수사 순서와 확인 자료 정리"
  ),
  rag_global: targetConfig(
    "국제협력 정보 기반으로 해외 거래구조와 위험 신호 확인",
    "국제 여행·체류·공조 정보 기반으로 개인 위험 신호 확인"
  ),
  rag_item: targetConfig(
    "HSK 품목별 신고 가이드에서 해당 물품의 품명·규격·성분·수입요건·유의사항을 확인",
    "개인 반입 물품의 HSK 품목별 신고 가이드(품명·규격·수입요건)를 확인"
  ),
  rag_consultation: targetConfig(
    "상담내역과 민원 질의 응답에서 유사 사례와 처리 흐름 확인",
    "개인 민원·상담내역에서 유사 사례와 처리 흐름 확인"
  ),
  rag_risk_select: targetConfig(
    "위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인",
    "개인 위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인"
  ),
  ml: targetConfig(
    "전체 모델을 실행해 기업 위험 패턴을 비교",
    "전체 모델을 실행해 개인 위험 패턴을 비교"
  ),
  network: targetConfig(
    "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    "인물·동행자·연락처·주소 관계망을 분석해 공범, 전달책, 반복 연계 가능성을 식별"
  ),
  ontology: targetConfig(
    "기업·거래·품목 중심 관세 온톨로지와 지식그래프 관계를 구성",
    "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성"
  ),
  origin_analysis: targetConfig(
    "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    "개인 반입 물품의 원산지 증빙과 우회 반입 가능성을 분석"
  ),
  abnormal_trade: targetConfig(
    "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    "반입·송금·연락·이동 패턴의 이상 징후를 검증"
  ),
  proceeds_tracking: targetConfig(
    "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    "개인 계좌·송금·현금 반입 단서를 기반으로 범죄수익 은닉 가능성을 분석"
  ),
  fund_trace: targetConfig(
    "등록된 계좌이체·가상자산·현금 입출금 등 선택한 자금 소스를 기반으로 범죄자금 흐름을 추적",
    "개인 계좌·송금·가상자산·현금 입출금 등 선택한 자금 소스를 기반으로 범죄자금 흐름을 추적"
  ),
  comms_analysis: targetConfig(
    "임직원·거래처 간 통화·SMS·SNS·메신저 등 선택한 통신 소스를 분석해 연락 패턴·관계 단서를 도출",
    "통화·SMS·SNS·메신저 등 선택한 통신 소스를 분석해 공범·전달책 연락 패턴·관계 단서를 도출"
  ),
  route_analysis: targetConfig(
    "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    "여행경로, 경유지, 동행 이력을 분석해 우회 반입 가능성을 탐지"
  ),
  web_search: targetConfig(
    "업체, 공급망, 가격 변동 관련 기사 또는 직접 등록한 URL에서 지정 정보를 확인",
    "인물, 조직, 사건, 여행 경로 관련 공개 정보 또는 직접 등록한 URL에서 지정 정보를 확인"
  ),
  declaration_verify: targetConfig(
    "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    "개인 휴대품 신고, 반입 물품, 첨부 증빙을 비교해 불일치와 은닉 가능성 확인"
  ),
  hs_verify: targetConfig(
    "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    "개인 반입 물품의 품목분류와 규제 대상 여부를 검증"
  ),
  customs_value: targetConfig(
    "과세가격 결정 요소와 저가신고 가능성 검토",
    "개인 반입 물품의 과세가격 산정 근거와 축소 신고 가능성 검토"
  ),
  patent: targetConfig(
    "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    "개인 반입 물품의 상표권·지식재산권 침해 가능성 확인"
  ),
  law: targetConfig(
    "관련 법령, 고시, 판례, 유권해석 근거 검색",
    "개인 수사·통관·처분 관련 법령, 고시, 판례, 유권해석 근거 검색"
  ),
  ocr: targetConfig(
    "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    "개인 신분·여행·반입 관련 첨부 문서에서 주요 항목을 추출하고 구조화"
  ),
  rag_create: targetConfig(
    "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    "개인 사건 자료를 RAG 지식으로 구성하기 위한 항목 정리"
  ),
  translate: targetConfig(
    "입력한 문서·텍스트를 지정한 대상 언어로 번역",
    "입력한 문서·텍스트를 지정한 대상 언어로 번역"
  ),
  text_summary: targetConfig(
    "입력한 문서·텍스트를 지정한 결과 형식으로 요약",
    "입력한 문서·텍스트를 지정한 결과 형식으로 요약"
  ),
  report_standard: targetConfig(
    "표준 보고서 템플릿의 형식·구성에 맞춰 신규 보고서 내용을 재구성",
    "표준 보고서 템플릿의 형식·구성에 맞춰 신규 보고서 내용을 재구성"
  ),
  summary: targetConfig(
    "요약 대상을 조사관용 핵심 요약으로 정리",
    "요약 대상을 개인 수사 담당자용 핵심 요약으로 정리"
  ),
  report_generate: targetConfig(
    "보고서 대상 자료를 공식 조사보고서 초안으로 통합",
    "보고서 대상 자료를 개인 수사보고서 초안으로 통합"
  ),
  report_validate: targetConfig(
    "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증"
  ),
  mail_share: targetConfig(
    "분석결과 보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유",
    "개인 수사 결과보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유"
  ),
};

const registryKeysByPermissionGroup = (groupName) =>
  Object.entries(AI_SERVICE_REGISTRY)
    .filter(([, source]) => source.permissionGroup === groupName && source.adminVisible !== false)
    .map(([key]) => key);

export const sidebarPermissionGroups = {
  dataSources: registryKeysByPermissionGroup("dataSources"),
  agents: registryKeysByPermissionGroup("agents"),
};

const ALL_RAG = sidebarPermissionGroups.dataSources;
const ALL_AGENTS = sidebarPermissionGroups.agents;

// 페이지 접근권한 키(권한관리.pdf 매트릭스): 관세조사·일반수사·마약수사·외환수사·국제정보·감시보고서등록·관계망분석
export const ALL_INV_PAGES = ["investigation", "generalinv", "lawsearch", "fxsearch", "case", "model"];

export const userGroups = [
  // ── 정보국 ──────────────────────────────────────────────────────────────
  {id:"g01",org:"정보국",team:"정보기획담당관", isAdmin:true,  rag:ALL_RAG,                              agents:ALL_AGENTS, pages:[...ALL_INV_PAGES]},
  {id:"g02",org:"정보국",team:"인공지능혁신팀", isAdmin:false, rag:["db_cdw","db_external","rag_customs"],              agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","law","report_generate","report_validate"], pages:["generalinv","lawsearch","fxsearch"]},
  {id:"g03",org:"정보국",team:"시스템운영팀",   isAdmin:false, rag:["db_cdw","db_external","rag_customs"],              agents:["ocr","patent","web_search","rag_create","law","report_generate","report_validate"], pages:["model"]},
  {id:"g04",org:"정보국",team:"연구개발장비팀", isAdmin:false, rag:["db_cdw","db_external","rag_customs","rag_audit"],  agents:["ocr","patent","web_search","rag_create","law","report_generate","report_validate"], pages:["model"]},
  {id:"g05",org:"정보국",team:"데이터담당관",   isAdmin:true,  rag:ALL_RAG,                              agents:ALL_AGENTS, pages:["model"]},
  // ── 본청 업무분야 ────────────────────────────────────────────────────────
  {id:"g06",org:"본청",team:"통관 분야", isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","rag_create","law","report_generate","report_validate"], pages:["case","report"]},
  {id:"g07",org:"본청",team:"감시분야",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_audit"],
    agents:["ocr","ml","network","web_search","declaration_verify","law","report_generate","report_validate"], pages:["case","report"]},
  {id:"g08",org:"본청",team:"조사분야",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"], pages:["investigation","case","model"]},
  {id:"g09",org:"본청",team:"수사분야",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_investigation"],
    agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"], pages:["generalinv","lawsearch","fxsearch","case","model"]},
  {id:"g10",org:"본청",team:"국제협력",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_global"],
    agents:["ocr","web_search","rag_create","law","report_generate","report_validate"], pages:["case"]},
  {id:"g11",org:"본청",team:"정보분석",  isAdmin:false,
    rag:ALL_RAG,
    agents:["ocr","ml","network","web_search","rag_create","law","report_generate","report_validate"], pages:[...ALL_INV_PAGES]},
  {id:"g12",org:"본청",team:"운영·지원", isAdmin:true,  rag:ALL_RAG, agents:ALL_AGENTS, pages:[...ALL_INV_PAGES]},
  // ── 세관 업무분야 ────────────────────────────────────────────────────────
  {id:"g13",org:"세관",team:"통관 분야", isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","rag_create","law","report_generate","report_validate"], pages:["case","report"]},
  {id:"g14",org:"세관",team:"감시분야",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_audit"],
    agents:["ocr","ml","network","web_search","declaration_verify","law","report_generate","report_validate"], pages:["case","report"]},
  {id:"g15",org:"세관",team:"조사분야",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"], pages:["investigation","case","model"]},
  {id:"g16",org:"세관",team:"수사분야",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_investigation"],
    agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"], pages:["generalinv","lawsearch","fxsearch","case","model"]},
  {id:"g17",org:"세관",team:"국제협력",  isAdmin:false,
    rag:["db_cdw","db_external","rag_customs","rag_global"],
    agents:["ocr","web_search","rag_create","law","report_generate","report_validate"], pages:["case"]},
  {id:"g18",org:"세관",team:"정보분석",  isAdmin:false,
    rag:ALL_RAG,
    agents:["ocr","ml","network","web_search","rag_create","law","report_generate","report_validate"], pages:[...ALL_INV_PAGES]},
  {id:"g19",org:"세관",team:"운영·지원", isAdmin:true,  rag:ALL_RAG, agents:ALL_AGENTS, pages:[...ALL_INV_PAGES]},
];

export const sampleUsers = [
  {id:"u01",groupId:"g01",name:"김기획",  avatar:"김"},
  {id:"u02",groupId:"g02",name:"이혁신",  avatar:"이"},
  {id:"u03",groupId:"g03",name:"박운영",  avatar:"박"},
  {id:"u04",groupId:"g04",name:"최연구",  avatar:"최"},
  {id:"u05",groupId:"g05",name:"정데이터",avatar:"정"},
  {id:"u06",groupId:"g06",name:"강통관",  avatar:"강"},
  {id:"u07",groupId:"g07",name:"조감시",  avatar:"조"},
  {id:"u08",groupId:"g08",name:"윤조사",  avatar:"윤"},
  {id:"u09",groupId:"g09",name:"임수사",  avatar:"임"},
  {id:"u10",groupId:"g10",name:"한협력",  avatar:"한"},
  {id:"u11",groupId:"g11",name:"노분석",  avatar:"노"},
  {id:"u12",groupId:"g12",name:"류지원",  avatar:"류"},
  {id:"u13",groupId:"g13",name:"오통관",  avatar:"오"},
  {id:"u14",groupId:"g14",name:"서감시",  avatar:"서"},
  {id:"u15",groupId:"g15",name:"신조사",  avatar:"신"},
  {id:"u16",groupId:"g16",name:"권수사",  avatar:"권"},
  {id:"u17",groupId:"g17",name:"황협력",  avatar:"황"},
  {id:"u18",groupId:"g18",name:"전분석",  avatar:"전"},
  {id:"u19",groupId:"g19",name:"고지원",  avatar:"고"},
];

export const defaultUserPermissions = Object.fromEntries(
  Object.keys(AI_SERVICE_REGISTRY).map(key => [key, "granted"])
);

/* 업무지식베이스(dataSources) 중 그룹 권한과 무관하게 전체 사용자에게 허용하는 소스.
   국제협력RAG는 국제공조·해외거래 실무정보로 업무 영역을 가리지 않아 공통 허용한다. */
export const DEFAULT_GRANTED_DATASOURCES = new Set(["rag_global"]);

export function scenarioSourceEntries(){
  return Object.entries(AI_SERVICE_REGISTRY)
    .filter(([, source]) => source.selectable !== false)
    .map(([key, source]) => ({
      key,
      ...source,
      ...(AI_SERVICE_TARGET_CONFIG[key] || {}),
    }));
}

export function scenarioSourceByKey(key){
  const source = AI_SERVICE_REGISTRY[key];
  return source ? { key, ...source, ...(AI_SERVICE_TARGET_CONFIG[key] || {}) } : null;
}

export function sourceBehaviorOptions(key){
  const source = scenarioSourceByKey(key);
  return source?.behaviorOptions || [{ value: "default", label: "기본 동작" }];
}

export function sourceDefaultBehavior(key){
  return sourceBehaviorOptions(key)[0]?.value || "default";
}

export function sourceDefaultBehaviors(key){
  const source = scenarioSourceByKey(key);
  if(Array.isArray(source?.defaultBehaviors) && source.defaultBehaviors.length) return [...source.defaultBehaviors];
  return [sourceDefaultBehavior(key)];
}

export function normalizeTargetType(value){
  return String(value || "").toLowerCase() === "person" ? "person" : "company";
}

export function sourceDefaultInstruction(key, targetType = "company"){
  const source = scenarioSourceByKey(key);
  const normalized = normalizeTargetType(targetType);
  return source?.defaultPrompts?.[normalized]
    || source?.defaultPrompts?.company
    || source?.defaultInstruction
    || "";
}

export function sourceBehaviorLabel(key, behavior){
  return sourceBehaviorOptions(key).find(option => option.value === behavior)?.label || "기본 동작";
}

export function sourceBehaviorLabels(key, behaviors){
  const values = Array.isArray(behaviors) && behaviors.length ? behaviors : sourceDefaultBehaviors(key);
  return values.map(value => sourceBehaviorLabel(key, value));
}

export function scenarioSuggestedInstruction(key, targetType = "company", behaviors = null){
  const base = sourceDefaultInstruction(key, targetType);
  const labels = sourceBehaviorLabels(key, behaviors);
  const focus = labels.length ? `\n\n중점 확인: ${labels.join(", ")}` : "";
  return `${base || "선택한 AI 서비스 기준으로 분석을 수행합니다."}${focus}`;
}

export function isAutoScenarioInstruction(value, key, targetType = "company", behaviors = null){
  const text = String(value || "").trim();
  if(!text) return true;
  const base = sourceDefaultInstruction(key, targetType);
  if(text === base) return true;
  if(text === scenarioSuggestedInstruction(key, targetType, behaviors)) return true;
  return sourceBehaviorOptions(key).some(option =>
    text === scenarioSuggestedInstruction(key, targetType, [option.value])
  );
}
