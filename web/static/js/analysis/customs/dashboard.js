export function renderDashboardPanel(deps){
  return deps.panels.investigationDashboardPanel();
}

export const dashboardSubtab = {
  id: "dashboard",
  label: "기업 위험 대시보드",
  group: "tools",
  aiServices: ["ml", "abnormal_trade", "network"],
  render: renderDashboardPanel,
};
