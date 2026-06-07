export function renderScenarioPanel(deps){
  return deps.scenarioWorkbenchV2();
}

export const scenarioSubtab = {
  id: "scenario",
  label: "AI서비스 분석 작업",
  group: "work",
  aiServices: ["db_cdw", "company_profile", "rag_customs", "rag_audit", "ml", "declaration_verify", "hs_verify", "customs_value", "law", "report_generate", "report_validate"],
  render: renderScenarioPanel,
};
