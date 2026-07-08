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
