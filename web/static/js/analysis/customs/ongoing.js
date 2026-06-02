export function renderOngoingPanel(deps){
  return deps.panels.investigationOngoingPanel();
}

export const ongoingSubtab = {
  id: "ongoing",
  label: "진행중인 관세조사",
  group: "work",
  aiServices: [],
  render: renderOngoingPanel,
};
