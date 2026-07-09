/* 관세수사 혐의 범죄 체계 — 대분류 7종 + 죄명(복수 선택).
   혐의 확정 시 대분류/죄명 → 수사유형(GEN_INV_TYPES invTypeId) 매핑으로
   분석 시나리오(정보분석 워크스페이스) 템플릿이 자동 선택된다. */

export const CRIME_TAXONOMY = [
  { id: "c1", num: "①", label: "관세수입 침해", cls: "gi-t1",
    offenses: [
      { id: "c1_evasion",        label: "관세포탈죄" },
      { id: "c1_illegal_import", label: "부정수입죄" },
      { id: "c1_illegal_export", label: "부정수출죄" },
      { id: "c1_exemption",      label: "부정감면죄" },
      { id: "c1_refund",         label: "부정환급죄" },
      { id: "c1_price",          label: "가격조작죄" },
    ] },
  { id: "c2", num: "②", label: "밀수출입", cls: "gi-t2",
    offenses: [
      { id: "c2_import",     label: "밀수입죄" },
      { id: "c2_export",     label: "밀수출·밀반송죄" },
      { id: "c2_possession", label: "밀수품 취득죄" },
      { id: "c2_prohibited", label: "금지품 밀수" },
    ] },
  { id: "c3", num: "③", label: "부정 통관·신고", cls: "gi-t3",
    offenses: [
      { id: "c3_false_decl", label: "허위신고죄/부정신고" },
      { id: "c3_origin",     label: "원산지 표시 위반" },
    ] },
  { id: "c4", num: "④", label: "금지·제한 위반", cls: "gi-t5",
    offenses: [
      { id: "c4_prohibited_goods", label: "수출입 금지품 위반" },
      { id: "c4_ip",               label: "지식재산권 침해물품" },
      { id: "c4_customs_confirm",  label: "세관장 확인·제한 위반" },
    ] },
  { id: "c5", num: "⑤", label: "통관·절차 질서", cls: "gi-t7",
    offenses: [
      { id: "c5_order",  label: "미신고·거짓신고 질서위반" },
      { id: "c5_books",  label: "장부·서류 위반" },
      { id: "c5_duty",   label: "직무 관련 죄" },
    ] },
  { id: "c6", num: "⑥", label: "외환수사", cls: "gi-t4",
    offenses: [
      { id: "c6_illegal_fx",  label: "불법 외환거래" },
      { id: "c6_laundering",  label: "자금세탁·불법송금" },
      { id: "c6_flight",      label: "재산국외도피" },
      { id: "c6_trade_front", label: "무역가장·연계 사범" },
    ] },
  { id: "c7", num: "⑦", label: "마약수사", cls: "gi-t8",
    offenses: [
      { id: "c7_smuggle", label: "마약밀수" },
      { id: "c7_offense", label: "마약사범(소지·매매 등)" },
      { id: "c7_new",     label: "신종·유통 사범" },
      { id: "c7_fund",    label: "마약류 자금·조직" },
    ] },
];

/* 대분류 → 수사유형(분석 시나리오 템플릿) 기본 매핑 */
export const CRIME_CATEGORY_TO_INV_TYPE = {
  c1: "t1",   // 관세수입 침해 → 관세포탈 수사
  c2: "t2",   // 밀수출입 → 밀수입·밀수출 수사
  c3: "t3",   // 부정 통관·신고 → 원산지 위반 수사(신고검증·원산지 흐름)
  c4: "t5",   // 금지·제한 위반 → 지식재산권 침해 수사(기본)
  c5: "t7",   // 통관·절차 질서 → 기타 수사
  c6: "t4",   // 외환수사 → 외환·자금세탁 범죄 수사
  c7: "t8",   // 마약수사 → 마약 밀수·유통 수사(신규 템플릿)
};

/* 죄명 단위 예외 매핑 — 대분류 기본값보다 우선 */
export const OFFENSE_INV_TYPE_OVERRIDES = {
  c2_prohibited:       "t2",
  c4_prohibited_goods: "t2",   // 수출입 금지품 위반 → 밀수 흐름
  c4_customs_confirm:  "t6",   // 세관장 확인·제한 위반 → 전략물자·수출통제
  c3_false_decl:       "t1",   // 허위신고 → 신고검증·포탈 흐름
};

/* 혐의별 프로파일 강조 영역(Phase 3) — 프로파일에서 우선 표시할 지표 태그 */
export const CRIME_PROFILE_EMPHASIS = {
  c1: ["신고·과세", "저가신고", "환급"],
  c2: ["운송경로", "화물", "관계망"],
  c3: ["원산지", "신고검증"],
  c4: ["품목분류", "지재권"],
  c5: ["신고이력", "서류"],
  c6: ["외환", "자금흐름", "역외"],
  c7: ["관계망", "조직", "자금"],
};

/* ── 죄명별 분석 관점 매트릭스 — 혐의 확정 시 분석서비스 자동 세팅의 근거 ──
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
  // c1 관세수입 침해
  c1_evasion:        { A: 2, B: 1, C: 1, D: 1, E: 1 },
  c1_illegal_import: { A: 2, B: 1, C: 0, D: 1, E: 1 },
  c1_illegal_export: { A: 2, B: 1, C: 0, D: 1, E: 1 },
  c1_exemption:      { A: 2, B: 0, C: 1, D: 1, E: 2 },
  c1_refund:         { A: 2, B: 0, C: 2, D: 1, E: 2 },
  c1_price:          { A: 2, B: 0, C: 2, D: 1, E: 2 },
  // c2 밀수출입
  c2_import:         { A: 2, B: 2, C: 1, D: 1, E: 1 },
  c2_export:         { A: 2, B: 2, C: 1, D: 1, E: 1 },
  c2_possession:     { A: 1, B: 1, C: 1, D: 2, E: 1 },
  c2_prohibited:     { A: 2, B: 2, C: 0, D: 1, E: 1 },
  // c3 부정 통관·신고
  c3_false_decl:     { A: 2, B: 1, C: 0, D: 1, E: 2 },
  c3_origin:         { A: 2, B: 2, C: 0, D: 1, E: 1 },
  // c4 금지·제한 위반
  c4_prohibited_goods:{ A: 2, B: 2, C: 0, D: 1, E: 1 },
  c4_ip:             { A: 2, B: 1, C: 0, D: 1, E: 1 },
  c4_customs_confirm:{ A: 2, B: 1, C: 0, D: 0, E: 1 },
  // c5 통관·절차 질서
  c5_order:          { A: 2, B: 0, C: 0, D: 0, E: 2 },
  c5_books:          { A: 2, B: 0, C: 1, D: 1, E: 1 },
  c5_duty:           { A: 1, B: 0, C: 1, D: 2, E: 1 },
  // c6 외환수사
  c6_illegal_fx:     { A: 1, B: 0, C: 2, D: 2, E: 2 },
  c6_laundering:     { A: 0, B: 1, C: 2, D: 2, E: 2 },
  c6_flight:         { A: 1, B: 0, C: 2, D: 2, E: 1 },
  c6_trade_front:    { A: 2, B: 1, C: 2, D: 2, E: 1 },
  // c7 마약수사
  c7_smuggle:        { A: 2, B: 2, C: 1, D: 2, E: 1 },
  c7_offense:        { A: 1, B: 2, C: 1, D: 2, E: 1 },
  c7_new:            { A: 1, B: 2, C: 1, D: 2, E: 2 },
  c7_fund:           { A: 0, B: 1, C: 2, D: 2, E: 2 },
};

/* 죄명별 특화 서비스(관점 매트릭스 외 추가) */
export const OFFENSE_EXTRA_SERVICES = {
  c3_origin: ["gi_origin"],
  c4_ip: ["gi_patent"],
  c4_prohibited_goods: ["gi_origin"],
  c1_evasion: ["gi_val"],
};

/* 대분류별 RAG 구성 */
const CATEGORY_RAG = {
  c1: ["gi_rag_rev"], c2: ["gi_rag_inv", "gi_rag_int"], c3: ["gi_rag_inv", "gi_rag_int"],
  c4: ["gi_rag_rev"], c5: ["gi_rag_inv"], c6: ["gi_rag_inv", "gi_rag_int"], c7: ["gi_rag_inv", "gi_rag_int"],
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

/* 혐의(crimes) → 분석서비스 자동 구성 계획.
   선택 죄명들의 관점 점수를 관점별 최댓값으로 합산해:
   2(●)면 해당 관점 서비스 전체, 1(○)이면 대표 서비스만 포함.
   공통 시작(gi_cdw)·죄명 특화·대분류 RAG·마무리(법령→보고서→검증)를 결합한다. */
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
  const keys = ["gi_cdw"];
  const push = key => { if(key && !keys.includes(key)) keys.push(key); };
  ANALYSIS_DIMENSIONS.forEach(dim => {
    if(dims[dim.id] >= 2) dim.strong.forEach(push);
    else if(dims[dim.id] === 1) push(dim.primary);
  });
  crimes.offenseIds.forEach(offenseId => (OFFENSE_EXTRA_SERVICES[offenseId] || []).forEach(push));
  (CATEGORY_RAG[crimes.categoryId] || []).forEach(push);
  ["gi_law", "gi_rep", "gi_appr"].forEach(push);
  return {
    dims,
    keys,
    labels: keys.map(key => GI_KEY_LABELS[key] || key),
    dimSummary: ANALYSIS_DIMENSIONS
      .filter(dim => dims[dim.id] > 0)
      .map(dim => `${dim.label}${dims[dim.id] >= 2 ? "●" : "○"}`)
      .join(" "),
  };
}

export function crimeCategoryById(id){
  return CRIME_TAXONOMY.find(category => category.id === id) || null;
}

export function crimeOffenseById(id){
  for(const category of CRIME_TAXONOMY){
    const offense = category.offenses.find(item => item.id === id);
    if(offense) return { ...offense, categoryId: category.id };
  }
  return null;
}

/* 혐의(crimes = {categoryId, offenseIds[]}) → 수사유형 id.
   죄명 예외 매핑의 최빈값 우선, 없으면 대분류 기본값, 폴백 t7. */
export function giInvTypeForCrimes(crimes){
  if(!crimes || !crimes.categoryId) return "t7";
  const counts = {};
  (crimes.offenseIds || []).forEach(offenseId => {
    const mapped = OFFENSE_INV_TYPE_OVERRIDES[offenseId];
    if(mapped) counts[mapped] = (counts[mapped] || 0) + 1;
  });
  const override = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (override && override[0]) || CRIME_CATEGORY_TO_INV_TYPE[crimes.categoryId] || "t7";
}

/* 혐의 요약 문자열 — 카드 칩/프로파일 뱃지용. 예: "관세수입 침해 · 관세포탈죄 외 2" */
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
