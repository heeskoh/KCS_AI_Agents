export function renderTemplatesPanel(deps){
  return deps.scenarioTemplatePanel();
}

export const templatesSubtab = {
  id: "templates",
  label: "분석 시나리오 템플릿",
  group: "tools",
  className: "ci-tab-template",
  aiServices: ["db_cdw", "rag_customs", "rag_trade", "ml", "report_generate", "report_validate"],
  render: renderTemplatesPanel,
};
