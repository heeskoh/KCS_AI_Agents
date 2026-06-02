export function renderScenarioPanel(deps){
  return deps.panels.scenarioWorkbenchV2();
}

export const scenarioSubtab = {
  id: "scenario",
  label: "분석 시나리오 설정 및 수행",
  group: "work",
  aiServices: ["db_cdw", "rag_customs", "rag_trade", "ml", "declaration_verify", "hs_verify", "customs_value", "law", "report_generate", "report_validate"],
  render: renderScenarioPanel,
};
