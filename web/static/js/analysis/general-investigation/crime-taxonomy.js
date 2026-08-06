/* 관세수사 관세범죄 유형 체계 — 유형 9종 + 수법(복수 선택, 각 유형에 '기타' 포함).
   유형·수법 선택 시 설명이 함께 표시되고, 혐의 확정 시 유형/수법 → 수사유형
   (GEN_INV_TYPES invTypeId) 매핑으로 분석 시나리오 템플릿이 자동 선택된다.
   (구 체계 c1~c7 대분류·죄명 id는 LEGACY_CATEGORY_ALIAS로 신 유형에 매핑해
    저장된 기존 사건의 혐의 표시·매핑 호환을 유지한다) */

export const CRIME_TAXONOMY = [
  { id: "k1", num: "①", label: "관세포탈", cls: "gi-t1", aliases: ["관세포탈죄", "포탈"],
    desc: "가격·품명·수량·원산지 등 신고 내용을 조작해 관세를 탈루하는 유형",
    offenses: [
      { id: "k1_low_price",   label: "저가신고",           aliases: ["언더밸류"], desc: "실제 물품 가격보다 낮게 신고하여 관세를 탈루. 가장 빈번한 수법" },
      { id: "k1_fake_invoice",label: "허위 인보이스 제출", aliases: ["허위 인보이스"], desc: "실제 거래가격과 다른 금액의 송장(Invoice)을 세관에 제출" },
      { id: "k1_name_disguise",label: "품명 위장",         aliases: ["허위신고"], desc: "고세율 품목을 저세율 품목으로 둔갑시키거나, 규제 대상 품목을 일반 품목으로 허위 신고" },
      { id: "k1_qty",         label: "수량 조작",           desc: "실제 수입·수출 수량보다 적게 신고" },
      { id: "k1_origin_false",label: "원산지 허위 표시",    aliases: ["원산지"], desc: "FTA 협정세율 등 낮은 관세율을 적용받기 위해 원산지를 거짓 신고" },
      { id: "k1_valuation",   label: "과세가격 산정 조작",  aliases: ["가격조작", "가격조작죄"], desc: "운임·보험료·로열티 등 과세가격 가산 요소를 누락하거나 왜곡" },
      { id: "k1_etc",         label: "기타",               desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k2", num: "②", label: "밀수 (무신고 수출입)", cls: "gi-t2", aliases: ["밀수", "밀수입", "밀수출", "밀반송"],
    desc: "정상 통관 절차를 거치지 않고 물품을 은닉·우회 반출입하는 유형",
    offenses: [
      { id: "k2_route_bypass", label: "반출·입 경로 우회", desc: "정상 통관 구역(보세구역)을 거치지 않고 우편·화물 반입, 여행자 휴대품 위장, 국제우편 이용, 선박·차량 은닉 등" },
      { id: "k2_conceal",      label: "물품 은닉",         desc: "밀반입 물품을 의류·가방·일상용품 속에 숨기거나 컨테이너·선박 구조물(씨체스트 등) 내부에 위장" },
      { id: "k2_route_launder",label: "출발지·경로 세탁",  desc: "여러 국가를 경유하는 방식으로 원산지·출발지를 속여 추적을 회피" },
      { id: "k2_false_name",   label: "허위 품명 기재",    desc: "밀수품을 다른 품목으로 속이거나 아예 품목을 신고하지 않음" },
      { id: "k2_mule",         label: "운반책 이용",       desc: "'공짜 여행' 등 대가를 미끼로 일반인을 운반책으로 모집('손바꿈' 수법)" },
      { id: "k2_organized",    label: "조직적·상습적 밀수",desc: "단체·조직을 구성해 상습적으로 반복" },
      { id: "k2_etc",          label: "기타",              desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k3", num: "③", label: "부정 관세감면·면탈", cls: "gi-t3", aliases: ["부정감면", "감면"],
    desc: "감면·면세 요건을 위장하거나 사후관리를 회피해 관세를 면탈하는 유형",
    offenses: [
      { id: "k3_self_use",  label: "자가사용 위장",             desc: "상업용 물품을 개인 자가사용 물품으로 위장하여 면세 혜택을 받음" },
      { id: "k3_purpose",   label: "면세 목적 위반",            desc: "학술연구용·종교용 등 면세 용도 물품을 시중에 유통·판매" },
      { id: "k3_post_mgmt", label: "감면 물품 사후 관리 회피",  desc: "감면 요건을 충족하지 못하게 된 후에도 추징을 회피하거나 신고하지 않음" },
      { id: "k3_etc",       label: "기타",                      desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k4", num: "④", label: "부정 관세환급", cls: "gi-t4", aliases: ["부정환급", "환급"],
    desc: "허위 증빙으로 수출용 원재료 관세 환급을 부정하게 받는 유형",
    offenses: [
      { id: "k4_fake_material", label: "가공의 수출용 원재료 신고", desc: "실제로 사용하지 않은 원재료를 수출용 원재료로 허위 신고하여 관세 환급을 신청" },
      { id: "k4_fake_evidence", label: "환급 요건 위장",            desc: "수출 이행 여부, 소요량 등을 허위 증빙으로 조작" },
      { id: "k4_over_claim",    label: "과다 환급 청구",            desc: "실제 사용량보다 많은 원재료에 대한 환급을 청구" },
      { id: "k4_etc",           label: "기타",                      desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k5", num: "⑤", label: "부정 수입·부정 수출", cls: "gi-t5", aliases: ["부정수입", "부정수출"],
    desc: "인·허가 등 수출입 요건을 위조·회피하여 부정하게 통관하는 유형",
    offenses: [
      { id: "k5_diff_goods",   label: "계약과 다른 물품 수입",       desc: "신고된 품명과 실제 물품 구성이 다르거나, 금지된 하위 품목이 혼재된 상태로 수입" },
      { id: "k5_forged_permit",label: "수출입 요건 위조",            desc: "필요한 인·허가, 추천서, 승인서를 위조하거나 부정하게 발급받아 통관" },
      { id: "k5_disguised",    label: "요건 미비 물품의 위장 반입",  desc: "규제 대상 물품을 규제가 없는 물품으로 포장하거나 분할 반입" },
      { id: "k5_etc",          label: "기타",                        desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k6", num: "⑥", label: "지식재산권 침해물품 수입", cls: "gi-t6", aliases: ["지식재산권", "지재권", "위조상품", "상표"],
    desc: "위조 상품 등 지식재산권 침해물품을 위장·분할 반입하는 유형",
    offenses: [
      { id: "k6_disguise",   label: "변장 은닉",        desc: "짝퉁 제품을 정품처럼 포장하거나, 외관상 구분이 어려운 일반 물품 안에 혼합·은닉" },
      { id: "k6_fake_brand", label: "원산지·상표 위장", desc: "위조 상표를 부착하거나 원산지를 허위로 표시해 정품으로 위장" },
      { id: "k6_split",      label: "분할 반입",        desc: "대량 위조품을 소량씩 여러 건으로 나누어 반입하여 적발을 회피" },
      { id: "k6_ecommerce",  label: "전자상거래 악용",  desc: "해외 직구 형태로 소량을 반복 반입(위장 재판매)하는 방식" },
      { id: "k6_etc",        label: "기타",             desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k7", num: "⑦", label: "불법 외환거래", cls: "gi-t7", aliases: ["외환", "자금세탁", "불법송금", "재산국외도피"],
    desc: "무역대금 위장·환치기 등 공식 절차를 거치지 않는 불법 자금 이동 유형",
    offenses: [
      { id: "k7_trade_disguise", label: "무역대금 위장 송금", desc: "실제 거래 없는 물품 대금을 가장하거나 과대·과소 송금하여 외화 반출" },
      { id: "k7_hawala",         label: "환치기",             desc: "국가 간 자금 이동 시 공식 외환 절차를 거치지 않고 사설 네트워크를 통해 자금을 교환·이전" },
      { id: "k7_flight",         label: "재산국외도피",       desc: "국내 재산을 적법한 신고 없이 해외에 은닉·이전" },
      { id: "k7_unlicensed",     label: "무등록 외국환 업무", desc: "등록 없이 환전·송금 서비스를 영업" },
      { id: "k7_etc",            label: "기타",               desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k8", num: "⑧", label: "마약·총기·위해물품 밀반입", cls: "gi-t8", aliases: ["마약", "총기", "위해물품"],
    desc: "마약·총기 등 위해물품을 은닉하거나 우회 경로로 반입하는 유형",
    offenses: [
      { id: "k8_body",      label: "신체·소지품 은닉",   desc: "여행자 신체, 의류, 신발, 개인 소지품에 은닉하여 반입" },
      { id: "k8_mail",      label: "국제우편·특송 이용", desc: "소량을 국제 우편이나 특송 화물로 반입" },
      { id: "k8_container", label: "선박·컨테이너 은닉", desc: "대형 화물에 은닉하거나 선박 구조물에 몰래 적재" },
      { id: "k8_transship", label: "환적·우회 경로 이용",desc: "제3국을 경유하거나 환적 화물을 가장" },
      { id: "k8_etc",       label: "기타",               desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
  { id: "k9", num: "⑨", label: "밀수품 취득·운반·보관", cls: "gi-t1", aliases: ["밀수품", "장물"],
    desc: "밀수품임을 알면서 취득·운반·보관하거나 매각을 알선하는 유형",
    offenses: [
      { id: "k9_acquire",   label: "장물성 인식 하 취득", desc: "밀수품임을 알면서 저렴하게 구매하거나 양수" },
      { id: "k9_transport", label: "운반·보관 대행",      desc: "밀수업자의 부탁을 받고 물품을 옮기거나 보관" },
      { id: "k9_broker",    label: "중개·알선",           desc: "밀수품의 매각을 주선하거나 구매자를 연결" },
      { id: "k9_etc",       label: "기타",                desc: "목록에 없는 수법 — 상세 내용은 수사단서에 기록하세요" },
    ] },
];

/* 구 체계(c1~c7) → 신 유형 매핑 — 저장된 기존 사건의 혐의 호환용 */
export const LEGACY_CATEGORY_ALIAS = {
  c1: "k1",   // 관세수입 침해 → 관세포탈
  c2: "k2",   // 밀수출입 → 밀수
  c3: "k1",   // 부정 통관·신고 → 관세포탈(신고검증·원산지 흐름)
  c4: "k6",   // 금지·제한 위반 → 지식재산권 침해물품 수입
  c5: "k1",   // 통관·절차 질서 → 관세포탈(신고 질서)
  c6: "k7",   // 외환수사 → 불법 외환거래
  c7: "k8",   // 마약수사 → 마약·총기·위해물품 밀반입
};

export function normalizeCrimeCategoryId(id){
  return LEGACY_CATEGORY_ALIAS[id] || id;
}

/* 유형 → 수사유형(분석 시나리오 템플릿) 기본 매핑 */
export const CRIME_CATEGORY_TO_INV_TYPE = {
  k1: "t1",   // 관세포탈 → 관세포탈 수사
  k2: "t2",   // 밀수 → 밀수입·밀수출 수사
  k3: "t1",   // 부정 감면·면탈 → 포탈 흐름
  k4: "t1",   // 부정 환급 → 포탈·환급 흐름
  k5: "t6",   // 부정 수입·수출 → 전략물자·수출통제(요건 위반) 흐름
  k6: "t5",   // 지식재산권 침해물품 → 지식재산권 침해 수사
  k7: "t4",   // 불법 외환거래 → 외환·자금세탁 범죄 수사
  k8: "t8",   // 마약·총기·위해물품 → 마약 밀수·유통 수사
  k9: "t2",   // 밀수품 취득·운반·보관 → 밀수 흐름
};

/* 수법 단위 예외 매핑 — 유형 기본값보다 우선 */
export const OFFENSE_INV_TYPE_OVERRIDES = {
  k1_origin_false: "t3",   // 원산지 허위 표시 → 원산지 위반 수사
};

/* 혐의별 프로파일 강조 영역 — 프로파일에서 우선 표시할 지표 태그 */
export const CRIME_PROFILE_EMPHASIS = {
  k1: ["신고·과세", "저가신고", "원산지"],
  k2: ["운송경로", "화물", "관계망"],
  k3: ["감면", "신고이력"],
  k4: ["환급", "자금흐름"],
  k5: ["요건", "신고검증"],
  k6: ["품목분류", "지재권"],
  k7: ["외환", "자금흐름", "역외"],
  k8: ["관계망", "운송경로", "조직"],
  k9: ["관계망", "장물", "자금"],
  // 구 체계 호환
  c1: ["신고·과세", "저가신고", "환급"],
  c2: ["운송경로", "화물", "관계망"],
  c3: ["원산지", "신고검증"],
  c4: ["품목분류", "지재권"],
  c5: ["신고이력", "서류"],
  c6: ["외환", "자금흐름", "역외"],
  c7: ["관계망", "조직", "자금"],
};

/* ── 수법별 분석 관점 매트릭스 — 혐의 확정 시 분석서비스 자동 세팅의 근거 ──
   관점 5종: A 정합성(신고 검증) / B 경로(운송) / C 자금(추적) / D 관계(관계망·통신) / E 패턴(이상거래)
   값: 2=●(중점), 1=○(보조), 0/생략=해당 없음 */
export const ANALYSIS_DIMENSIONS = [
  { id: "A", label: "정합성", primary: "gi_imp",    strong: ["gi_imp", "gi_val", "gi_hs"] },
  { id: "B", label: "경로",   primary: "gi_route",  strong: ["gi_route"] },
  { id: "C", label: "자금",   primary: "gi_profit", strong: ["gi_profit", "gi_fundtrace"] },
  { id: "D", label: "관계",   primary: "gi_net",    strong: ["gi_net", "gi_comms"] },
  { id: "E", label: "패턴",   primary: "gi_anomaly",strong: ["gi_anomaly"] },
];

export const OFFENSE_ANALYSIS_MATRIX = {
  // k1 관세포탈
  k1_low_price:    { A: 2, B: 1, C: 1, D: 1, E: 2 },
  k1_fake_invoice: { A: 2, B: 0, C: 2, D: 1, E: 2 },
  k1_name_disguise:{ A: 2, B: 1, C: 0, D: 1, E: 2 },
  k1_qty:          { A: 2, B: 1, C: 0, D: 0, E: 2 },
  k1_origin_false: { A: 2, B: 2, C: 0, D: 1, E: 1 },
  k1_valuation:    { A: 2, B: 0, C: 2, D: 1, E: 2 },
  k1_etc:          { A: 1, B: 0, C: 0, D: 0, E: 1 },
  // k2 밀수
  k2_route_bypass: { A: 2, B: 2, C: 1, D: 1, E: 1 },
  k2_conceal:      { A: 1, B: 2, C: 0, D: 1, E: 1 },
  k2_route_launder:{ A: 1, B: 2, C: 0, D: 1, E: 2 },
  k2_false_name:   { A: 2, B: 1, C: 0, D: 1, E: 2 },
  k2_mule:         { A: 0, B: 2, C: 1, D: 2, E: 1 },
  k2_organized:    { A: 1, B: 2, C: 1, D: 2, E: 2 },
  k2_etc:          { A: 1, B: 1, C: 0, D: 0, E: 1 },
  // k3 부정 감면·면탈
  k3_self_use:     { A: 2, B: 0, C: 0, D: 0, E: 2 },
  k3_purpose:      { A: 2, B: 0, C: 1, D: 1, E: 2 },
  k3_post_mgmt:    { A: 2, B: 0, C: 1, D: 0, E: 1 },
  k3_etc:          { A: 1, B: 0, C: 0, D: 0, E: 1 },
  // k4 부정 환급
  k4_fake_material:{ A: 2, B: 0, C: 2, D: 1, E: 2 },
  k4_fake_evidence:{ A: 2, B: 0, C: 1, D: 1, E: 2 },
  k4_over_claim:   { A: 2, B: 0, C: 2, D: 0, E: 2 },
  k4_etc:          { A: 1, B: 0, C: 1, D: 0, E: 1 },
  // k5 부정 수입·수출
  k5_diff_goods:   { A: 2, B: 1, C: 0, D: 1, E: 1 },
  k5_forged_permit:{ A: 2, B: 0, C: 0, D: 1, E: 1 },
  k5_disguised:    { A: 2, B: 1, C: 0, D: 0, E: 1 },
  k5_etc:          { A: 1, B: 0, C: 0, D: 0, E: 1 },
  // k6 지식재산권 침해물품
  k6_disguise:     { A: 2, B: 1, C: 0, D: 1, E: 1 },
  k6_fake_brand:   { A: 2, B: 1, C: 0, D: 1, E: 1 },
  k6_split:        { A: 1, B: 1, C: 0, D: 1, E: 2 },
  k6_ecommerce:    { A: 1, B: 1, C: 1, D: 1, E: 2 },
  k6_etc:          { A: 1, B: 0, C: 0, D: 0, E: 1 },
  // k7 불법 외환거래
  k7_trade_disguise:{ A: 2, B: 1, C: 2, D: 2, E: 1 },
  k7_hawala:       { A: 0, B: 1, C: 2, D: 2, E: 2 },
  k7_flight:       { A: 1, B: 0, C: 2, D: 2, E: 1 },
  k7_unlicensed:   { A: 0, B: 0, C: 2, D: 2, E: 1 },
  k7_etc:          { A: 0, B: 0, C: 1, D: 1, E: 1 },
  // k8 마약·총기·위해물품
  k8_body:         { A: 0, B: 2, C: 0, D: 2, E: 1 },
  k8_mail:         { A: 1, B: 2, C: 0, D: 1, E: 2 },
  k8_container:    { A: 1, B: 2, C: 0, D: 2, E: 1 },
  k8_transship:    { A: 1, B: 2, C: 0, D: 1, E: 1 },
  k8_etc:          { A: 0, B: 1, C: 0, D: 1, E: 1 },
  // k9 밀수품 취득·운반·보관
  k9_acquire:      { A: 0, B: 0, C: 1, D: 2, E: 1 },
  k9_transport:    { A: 0, B: 1, C: 0, D: 2, E: 1 },
  k9_broker:       { A: 0, B: 0, C: 1, D: 2, E: 1 },
  k9_etc:          { A: 0, B: 0, C: 0, D: 1, E: 1 },
};

/* 수법별 특화 서비스(관점 매트릭스 외 추가) */
export const OFFENSE_EXTRA_SERVICES = {
  k1_origin_false: ["gi_origin"],
  k1_low_price:    ["gi_val"],
  k1_valuation:    ["gi_val"],
  k6_disguise:     ["gi_patent"],
  k6_fake_brand:   ["gi_patent", "gi_origin"],
};

/* 유형별 RAG 구성 */
const CATEGORY_RAG = {
  k1: ["gi_rag_rev"], k2: ["gi_rag_inv", "gi_rag_int"], k3: ["gi_rag_rev"],
  k4: ["gi_rag_rev"], k5: ["gi_rag_inv"], k6: ["gi_rag_rev"],
  k7: ["gi_rag_inv", "gi_rag_int"], k8: ["gi_rag_inv", "gi_rag_int"], k9: ["gi_rag_inv"],
};

/* 미리보기용 라벨(gi 별칭 → 짧은 서비스명) */
const GI_KEY_LABELS = {
  gi_cdw: "CDW 자연어조회", gi_imp: "수입신고검증", gi_val: "과세가격평가", gi_hs: "품목분류검증",
  gi_route: "운송경로 분석", gi_profit: "범죄수익 추적", gi_fundtrace: "범죄자금추적",
  gi_net: "관계망 분석", gi_comms: "통신내역 분석", gi_anomaly: "이상거래 검증",
  gi_patent: "특허정보 조회", gi_origin: "원산지 검증", gi_law: "법령 검토",
  gi_rag_rev: "심사정보 RAG", gi_rag_inv: "조사정보 RAG", gi_rag_int: "국제협력 RAG",
  gi_rep: "보고서 생성", gi_appr: "보고서 검증",
};

/* 혐의(crimes) → 수사 단계 자동 구성 계획.
   관점 매트릭스(dims 요약 표시)와 함께, 수사 절차 4단계로 구성한다:
   [기초데이터 분석] 내외부데이터 활용 → [증거수집] → [접견/신문] → [범죄일람표작성].
   실행 가능한 AI 서비스 단계(keys)는 기초데이터 분석 4종 + 보고서 생성/검증으로 세팅한다. */
export const CRIME_PLAN_PHASES = [
  { title: "기초데이터 분석", text: "내외부데이터 활용: 수입신고검증 → 과세가격평가 → 품목분류검증 → 과세내역 → 환급내역 → 외환거래 내역" },
  { title: "증거수집", lines: [
    "(1) 금융거래정보, 통신자료, 해외 세관 공조 자료 요청/입수",
    "(2) 임의조사: 장부·계약·회계자료 제출요구, 현품검사·감정, 관계기관 조회",
    "(3) 압수조사: 사업장 수색·압수, 디지털 포렌식",
  ] },
  { title: "접견/신문",       text: "참고인접견/피의자 신문" },
  { title: "범죄일람표작성",  text: "" },
];

export function crimeAnalysisPlan(crimes){
  if(!crimes?.categoryId || !crimes.offenseIds?.length) return null;
  const dims = {};
  ANALYSIS_DIMENSIONS.forEach(dim => { dims[dim.id] = 0; });
  crimes.offenseIds.forEach(offenseId => {
    const row = OFFENSE_ANALYSIS_MATRIX[offenseId] || {};
    ANALYSIS_DIMENSIONS.forEach(dim => {
      dims[dim.id] = Math.max(dims[dim.id], row[dim.id] || 0);
    });
  });
  // 실행 가능한 AI 서비스 단계 — 기초데이터 분석(내외부데이터: 신고검증 3종 +
  // 과세·환급 내역 조회(CDW) + 외환거래 내역) + 보고서 생성/검증
  const keys = ["gi_imp", "gi_val", "gi_hs", "gi_cdw", "gi_anomaly", "gi_rep", "gi_appr"];
  return {
    dims,
    keys,
    labels: keys.map(key => GI_KEY_LABELS[key] || key),
    phases: CRIME_PLAN_PHASES,
    dimSummary: ANALYSIS_DIMENSIONS
      .filter(dim => dims[dim.id] > 0)
      .map(dim => `${dim.label}${dims[dim.id] >= 2 ? "●" : "○"}`)
      .join(" "),
  };
}

/* ── 혐의 기반 프로파일 그래프 스코프 — 프로파일 공유 기준은 '화면'이 아니라 '유형'이다 ──
   - 관세포탈(k1, 구 c1): 관세조사·관세수사의 기본 대상 유형으로 두 업무의
     기업 프로파일이 동일 내용을 공유한다 → 공용 스코프("company:{id}") 사용.
   - 그 외 유형: 유형이 다르면 프로파일에서 봐야 할 내용이 다르므로
     유형별 스코프("company.crime-{categoryId}:{id}")로 그래프 상태를 분리한다.
   - 혐의 미지정은 공용 스코프(기존 동작 유지). */
export function profileGraphTypeForCrimes(categoryId, base = "company"){
  const normalized = normalizeCrimeCategoryId(categoryId);
  if(!normalized || normalized === "k1") return base;
  return `${base}.crime-${normalized}`;
}

export function crimeCategoryById(id){
  const normalized = normalizeCrimeCategoryId(id);
  return CRIME_TAXONOMY.find(category => category.id === normalized) || null;
}

export function crimeOffenseById(id){
  for(const category of CRIME_TAXONOMY){
    const offense = category.offenses.find(item => item.id === id);
    if(offense) return { ...offense, categoryId: category.id };
  }
  return null;
}

/* 혐의(crimes = {categoryId, offenseIds[]}) → 수사유형 id.
   수법 예외 매핑의 최빈값 우선, 없으면 유형 기본값, 폴백 t7. */
export function giInvTypeForCrimes(crimes){
  if(!crimes || !crimes.categoryId) return "t7";
  const categoryId = normalizeCrimeCategoryId(crimes.categoryId);
  const counts = {};
  (crimes.offenseIds || []).forEach(offenseId => {
    const mapped = OFFENSE_INV_TYPE_OVERRIDES[offenseId];
    if(mapped) counts[mapped] = (counts[mapped] || 0) + 1;
  });
  const override = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (override && override[0]) || CRIME_CATEGORY_TO_INV_TYPE[categoryId] || "t7";
}

/* 혐의 요약 문자열 — 카드 칩/프로파일 뱃지용. 예: "관세포탈 · 저가신고 외 2" */
export function crimeSummary(crimes){
  if(!crimes || !crimes.categoryId) return "";
  const category = crimeCategoryById(crimes.categoryId);
  if(!category) return "";
  const offenses = (crimes.offenseIds || [])
    .map(id => crimeOffenseById(id))
    .filter(Boolean);
  if(!offenses.length) return category.label;
  const first = offenses[0].label;
  return offenses.length > 1
    ? `${category.label} · ${first} 외 ${offenses.length - 1}`
    : `${category.label} · ${first}`;
}
