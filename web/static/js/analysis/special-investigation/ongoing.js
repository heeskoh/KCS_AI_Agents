export function renderOngoingPanel(deps){
  return deps.panels.drugOngoingPanel();
}

export const ongoingSubtab = {
  id: "ongoing",
  label: "진행중인 수사",
  aiServices: [],
  render: renderOngoingPanel,
};
