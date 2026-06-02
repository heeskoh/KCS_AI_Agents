export function renderNetworkPanel(deps){
  return deps.panels.drugNetworkPanel();
}

export const networkSubtab = {
  id: "network",
  label: "관계망 분석",
  showWhen: context => !!context.case,
  aiServices: ["network", "route_analysis"],
  render: renderNetworkPanel,
};
