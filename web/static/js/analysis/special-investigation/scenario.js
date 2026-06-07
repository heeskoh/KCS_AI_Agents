import { specialInvestigationState } from "./state.js";

export function renderScenarioPanel(deps) {
  const aCase = deps.activeDrugCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const templateOptionsHtml = deps.drugScenarioTemplateOptionsHtml
    ? deps.drugScenarioTemplateOptionsHtml(aCase.invTypeId)
    : "";

  return deps.sharedScenarioWorkbenchHtml({
    archived: false,
    titleHtml: "조사 및 수사 분석 단계",
    subtitleHtml: "수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다.",
    templateOptionsHtml,
  });
}

export const scenarioSubtab = {
  id:       "scenario",
  label:    "AI서비스 분석 작업",
  showWhen: context => !!context.case,
  aiServices: [
    "db_cdw", "declaration_verify", "route_analysis", "network",
    "proceeds_tracking", "rag_investigation", "rag_global",
    "law", "report_generate", "report_validate",
  ],
  render: renderScenarioPanel,
};
