export function renderScenarioPanel(deps){
  if(!deps.getActiveCanvasCompanyId?.()) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  return deps.scenarioWorkbenchV2();
}

export const scenarioSubtab = {
  id: "scenario",
  label: "AI서비스 분석 작업",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["db_cdw", "company_profile", "rag_customs", "rag_audit", "ml", "declaration_verify", "hs_verify", "customs_value", "law", "report_generate", "report_validate"],
  render: renderScenarioPanel,
};
