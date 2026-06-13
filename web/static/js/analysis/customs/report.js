export function renderReportPanel(deps){
  if(!deps.getActiveCanvasCompanyId?.()) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  return deps.canvasReportPanel();
}

export const reportSubtab = {
  id: "report",
  label: "분석 보고서 및 검증",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["report_generate", "report_validate", "mail_share"],
  render: renderReportPanel,
};
