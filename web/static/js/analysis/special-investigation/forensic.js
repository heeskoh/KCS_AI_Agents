export function renderForensicPanel(deps){
  return deps.panels.drugForensicPanel();
}

export const forensicSubtab = {
  id: "forensic",
  label: "자금·디지털 포렌식 분석",
  showWhen: context => !!context.case,
  aiServices: ["proceeds_tracking", "network", "web_search"],
  render: renderForensicPanel,
};
