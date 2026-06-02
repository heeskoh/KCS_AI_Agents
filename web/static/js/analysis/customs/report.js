export function renderReportPanel(deps){
  return deps.panels.canvasReportPanel();
}

export const reportSubtab = {
  id: "report",
  label: "분석 보고서 및 검증",
  group: "work",
  aiServices: ["report_generate", "report_validate", "mail_share"],
  render: renderReportPanel,
};
