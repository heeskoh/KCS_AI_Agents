export function renderProfilePanel(deps){
  return deps.panels.generalInvProfilePanel();
}

export const profileSubtab = {
  id: "profile",
  label: context => context.profileLabel,
  showWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
