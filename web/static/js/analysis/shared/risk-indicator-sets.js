/* ── 위험지표 세트 정의 (혐의/역할별 전환) ───────────────────────────────────
   기업 프로파일의 'AI 위험 지표 분석'은 대상의 성격에 따라 다른 6종을 보여준다.

   - audit(심사·관세조사) : 저가신고·특수관계·FTA·환급·HS·역외  — 기존 세트
   - smuggling(밀수 수사) : 품명위장·검사회피·위해물품·경로·공범·수익  — 신규 세트

   백엔드 단일 소유: src/risk_indicators.py 의 INDICATOR_SETS / INDICATOR_TO_RATE_FIELD 와
   코드·컬럼명이 1:1로 일치해야 한다(값은 import_risk_scores 의 rate 컬럼에서 읽음).
   근거 bullet·권고는 company_risk_indicator(indicator_code) 에서 온다. */

export const RISK_INDICATOR_SETS = {
  audit: {
    label: "관세조사(심사) 지표",
    items: [
      { code: "undervaluation",    label: "저가신고 의심률",        field: "undervaluation_suspicion_rate" },
      { code: "related_party",     label: "특수관계 이상률",        field: "related_party_anomaly_rate" },
      { code: "fta_origin_misuse", label: "FTA 원산지 오용 의심률", field: "fta_origin_misuse_suspicion_rate" },
      { code: "customs_refund",    label: "관세환급 이상률",        field: "customs_refund_anomaly_rate" },
      { code: "hs_classification", label: "HS 분류 오류율",         field: "hs_classification_error_rate" },
      { code: "offshore_fund",     label: "역외자금 은닉 의심률",   field: "offshore_fund_concealment_suspicion_rate" },
    ],
  },
  smuggling: {
    label: "밀수 수사 지표",
    items: [
      { code: "disguise_declaration", label: "품명 위장 신고율",      field: "disguise_declaration_rate" },
      { code: "inspection_evasion",   label: "통관검사 회피 지수",    field: "inspection_evasion_rate" },
      { code: "contraband_detection", label: "금지·위해물품 적발률",  field: "contraband_detection_rate" },
      { code: "route_supplier_risk",  label: "우범 경로·공급망 위험", field: "route_supplier_risk_rate" },
      { code: "accomplice_network",   label: "공범·차명 관계망",      field: "accomplice_network_rate" },
      { code: "proceeds_concealment", label: "범죄수익·자금 은닉",    field: "proceeds_concealment_rate" },
    ],
  },
};

export const DEFAULT_INDICATOR_SET = "audit";

/* 관세범죄 유형(crime-taxonomy CRIME_TAXONOMY id) → 지표 세트 */
export const CRIME_CATEGORY_TO_INDICATOR_SET = {
  k1: "audit",       // 관세포탈(저가신고·허위 인보이스·과세가격 조작)
  k2: "smuggling",   // 밀수(무신고 수출입)
  k3: "audit",       // 부정 관세감면·면탈
  k4: "audit",       // 부정 관세환급
  k5: "audit",       // 부정 수입·수출(요건 위반) — 신고검증 관점
  k6: "smuggling",   // 지식재산권 침해물품 수입
  k7: "audit",       // 불법 외환거래 — 기업 프로파일에서는 역외자금 지표로 관찰(전용 세트는 우범자 도메인)
  k8: "smuggling",   // 마약·총기·위해물품 밀반입 — 반입 경로·은닉 관점
  k9: "smuggling",   // 밀수품 취득·운반·보관
  // 구 체계(c1~c7) 호환
  c1: "audit", c2: "smuggling", c3: "audit", c4: "smuggling",
  c5: "audit", c6: "audit", c7: "smuggling",
};

/* 수법 단위 예외 — 유형 기본값보다 우선 */
export const OFFENSE_INDICATOR_SET_OVERRIDES = {
  k1_origin_false: "audit",    // 원산지 허위 표시 → FTA·원산지 지표
  k6_fake_brand: "smuggling",  // 지식재산권 침해물품(상표 위장)
  k9_acquire: "smuggling",     // 밀수품 취득
};

/* 사건(aCase.crimes) → 지표 세트 결정.
   혐의가 지정된 경우에만 세트를 확정하고, 미지정이면 null을 반환한다
   (호출측 canvasProfilePanel이 기업 crime_types로 추정 — indicatorSetForCompany). */
export function indicatorSetForCase(crimes, company){
  const offenseIds = crimes?.offenseIds || [];
  for(const id of offenseIds){
    if(OFFENSE_INDICATOR_SET_OVERRIDES[id]) return OFFENSE_INDICATOR_SET_OVERRIDES[id];
  }
  const byCategory = CRIME_CATEGORY_TO_INDICATOR_SET[crimes?.categoryId];
  if(byCategory) return byCategory;
  return company ? indicatorSetForCompany(company) : null;
}

/* 기업 프로파일 단독(혐의 미지정) → crime_types 키워드로 추정 */
export function indicatorSetForCompany(company){
  const types = String(company?.crime_types || "");
  if(/밀수|위해물품|금지품|지재권|전략물자|마약/.test(types)) return "smuggling";
  return DEFAULT_INDICATOR_SET;
}

/* 세트 키 → 표시 항목 배열(없는 키는 기본 세트) */
export function indicatorItems(setKey){
  return (RISK_INDICATOR_SETS[setKey] || RISK_INDICATOR_SETS[DEFAULT_INDICATOR_SET]).items;
}
export function indicatorSetLabel(setKey){
  return (RISK_INDICATOR_SETS[setKey] || RISK_INDICATOR_SETS[DEFAULT_INDICATOR_SET]).label;
}
