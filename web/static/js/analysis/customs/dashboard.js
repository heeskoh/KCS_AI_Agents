export function renderDashboardPanel(deps){
  return deps.riskDashboardContent();
}

export const dashboardSubtab = {
  id: "dashboard",
  label: "관세포탈 대시보드",
  group: "tools",
  aiServices: ["ml", "abnormal_trade", "network"],
  render: renderDashboardPanel,
};
