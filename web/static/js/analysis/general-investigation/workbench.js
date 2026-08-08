/* 관세수사 AI서비스 분석 작업 — 관세조사 "분석 시나리오 확인 및 설정"과 동일한
   4단계 스테이지 UI. 공유 코드가 아닌 복사본(app-runtime의 gis* 클러스터,
   giStageWorkbenchHtml)이므로 수사 쪽을 독립적으로 변경할 수 있다. */
export function renderWorkbenchPanel(deps) {
  const aCase = deps.activeGenInvCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  return deps.giStageWorkbenchHtml();
}

export const workbenchSubtab = {
  id:       "workbench",
  label:    "AI 수사 가이드",
  enabledWhen: context => !!context.case,
  aiServices: [
    "db_cdw", "declaration_verify", "customs_value", "hs_verify",
    "route_analysis", "network", "proceeds_tracking", "origin_analysis",
    "abnormal_trade", "patent", "law", "report_generate", "report_validate",
  ],
  render: renderWorkbenchPanel,
};
