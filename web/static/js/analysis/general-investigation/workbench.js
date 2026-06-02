export function renderWorkbenchPanel(deps){
  return deps.panels.generalInvWorkbenchPanel();
}

export const workbenchSubtab = {
  id: "workbench",
  label: "분석 시나리오 설정 및 수행",
  showWhen: context => !!context.case,
  aiServices: ["db_cdw", "declaration_verify", "customs_value", "hs_verify", "route_analysis", "network", "proceeds_tracking", "origin_analysis", "abnormal_trade", "patent", "law", "report_generate", "report_validate"],
  render: renderWorkbenchPanel,
};
