export function renderProfilePanel(deps){
  return deps.panels.drugProfilePanel();
}

export const profileSubtab = {
  id: "profile",
  label: context => context.config.profileTab,
  showWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
