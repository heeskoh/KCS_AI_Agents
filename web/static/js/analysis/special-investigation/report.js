export function renderReportPanel(deps){
  return deps.panels.drugReportPanel();
}

export const reportSubtab = {
  id: "report",
  label: "분석보고서 및 검증",
  showWhen: context => !!context.case,
  aiServices: ["report_generate", "report_validate", "mail_share"],
  render: renderReportPanel,
};
