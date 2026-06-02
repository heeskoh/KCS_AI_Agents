export function renderScenarioPanel(deps){
  return deps.panels.drugScenarioPanel();
}

export const scenarioSubtab = {
  id: "scenario",
  label: "분석 시나리오 설정 및 수행",
  showWhen: context => !!context.case,
  aiServices: ["db_cdw", "declaration_verify", "route_analysis", "network", "proceeds_tracking", "rag_investigation", "rag_global", "law", "report_generate", "report_validate"],
  render: renderScenarioPanel,
};
