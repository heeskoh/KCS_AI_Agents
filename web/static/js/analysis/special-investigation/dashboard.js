export function renderDashboardPanel(deps){
  return deps.panels.drugRiskDashboard();
}

export const dashboardSubtab = {
  id: "dashboard",
  label: context => context.config.dashboardTab,
  group: "tools",
  aiServices: ["ml", "abnormal_trade", "network"],
  render: renderDashboardPanel,
};
