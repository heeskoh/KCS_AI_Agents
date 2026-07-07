export function renderScenarioPanel(deps){
  if(!deps.getActiveCanvasCompanyId?.()) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  // 리뷰 모드: 사전 준비된 분석 결과 확인 + 시나리오 설정 편집 (실시간 실행 없음)
  return deps.scenarioReviewWorkbench();
}

export const scenarioSubtab = {
  id: "scenario",
  label: "분석 시나리오 확인 및 설정",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["db_cdw", "company_profile", "rag_customs", "rag_audit", "ml", "declaration_verify", "hs_verify", "customs_value", "law", "report_generate", "report_validate"],
  render: renderScenarioPanel,
};
