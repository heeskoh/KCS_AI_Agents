export function renderCasesPanel(deps){
  return deps.panels.generalInvCasesPanel();
}

export const casesSubtab = {
  id: "cases",
  label: "진행중인 수사",
  aiServices: [],
  render: renderCasesPanel,
};
