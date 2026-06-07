import { generalInvestigationState } from "./state.js";

export function renderWorkbenchPanel(deps) {
  const aCase = deps.activeGenInvCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  // 수사유형별 기본 템플릿 옵션 (giScenarioTemplates t1~t7)
  const templateOptionsHtml = deps.giScenarioTemplateOptionsHtml
    ? deps.giScenarioTemplateOptionsHtml(aCase.invTypeId)
    : "";

  // 관세조사 workbench 와 동일한 공통 HTML 사용
  return deps.sharedScenarioWorkbenchHtml({
    archived: false,
    titleHtml: "분석 시나리오 설정 및 실행",
    subtitleHtml: "수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다. 단계를 추가·삭제·순서 변경하여 맞춤형 시나리오를 구성할 수 있습니다.",
    templateOptionsHtml,
  });
}

export const workbenchSubtab = {
  id:       "workbench",
  label:    "분석 시나리오 설정 및 수행",
  showWhen: context => !!context.case,
  aiServices: [
    "db_cdw", "declaration_verify", "customs_value", "hs_verify",
    "route_analysis", "network", "proceeds_tracking", "origin_analysis",
    "abnormal_trade", "patent", "law", "report_generate", "report_validate",
  ],
  render: renderWorkbenchPanel,
};
