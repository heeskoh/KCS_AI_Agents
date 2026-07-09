/* 관세수사 AI서비스 분석 작업 — 관세조사 탭4와 동일한 구조(완전 리뷰모드):
   좌측 분석범위별 상세설정(탭)·입력/설정값 인라인 + "분석 재수행 요청",
   우측 [분석 결과|통합 프롬프트] 탭. 실행 버튼 없이 재수행 접수만 노출한다.
   AI 분석서비스 구성은 혐의 확정 시 관점 매트릭스로 자동 세팅된다. */
export function renderWorkbenchPanel(deps) {
  const aCase = deps.activeGenInvCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const templateOptionsHtml = deps.giScenarioTemplateOptionsHtml
    ? deps.giScenarioTemplateOptionsHtml(aCase.invTypeId)
    : "";

  const states = aCase.stepStates || {};
  const doneCount = Object.values(states).filter(s => s === "done").length;
  const reviewNoteHtml = doneCount
    ? `<span class="muted" style="font-size:12px">AI 분석 수행 결과 · 완료 ${doneCount}단계</span>`
    : `<span class="muted" style="font-size:12px">수행된 분석 결과가 없습니다</span>`;

  return deps.sharedScenarioWorkbenchHtml({
    archived: false,
    reviewMode: true,
    reviewNoteHtml,
    titleHtml: "조사 및 수사 분석 단계",
    subtitleHtml: `혐의 확정 시 분석 관점 매트릭스에 따라 AI 분석서비스가 자동 구성됩니다. <em style="color:#0369a1;font-style:normal;font-weight:700">단계 구성·분석범위·프롬프트를 조정한 뒤 "분석 재수행 요청"으로 재분석을 접수하세요.</em>`,
    templateOptionsHtml,
  });
}

export const workbenchSubtab = {
  id:       "workbench",
  label:    "AI서비스 분석 작업",
  enabledWhen: context => !!context.case,
  aiServices: [
    "db_cdw", "declaration_verify", "customs_value", "hs_verify",
    "route_analysis", "network", "proceeds_tracking", "origin_analysis",
    "abnormal_trade", "patent", "law", "report_generate", "report_validate",
  ],
  render: renderWorkbenchPanel,
};
