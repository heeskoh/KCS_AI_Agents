export function renderProfilePanel(deps){
  return deps.panels.canvasProfilePanel();
}

export const profileSubtab = {
  id: "profile",
  label: "기업프로파일",
  group: "work",
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
