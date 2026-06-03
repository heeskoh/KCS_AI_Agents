import { escapeHtml } from "../../core/dom.js";
import { specialInvestigationState } from "./state.js";

export function renderScenarioPanel(deps) {
  const aCase = deps.activeDrugCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const type = deps.drugInvTypeById(aCase.invTypeId);

  // 마약수사유형별 기본 템플릿 옵션 (DRUG_SCENARIO_STEPS d1~d5)
  const templateOptionsHtml = deps.drugScenarioTemplateOptionsHtml
    ? deps.drugScenarioTemplateOptionsHtml(aCase.invTypeId)
    : "";

  // 관세조사 workbench 와 동일한 공통 HTML 사용
  return deps.sharedScenarioWorkbenchHtml({
    archived: false,
    titleHtml: `
      <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
      ${escapeHtml(aCase.targetName)}
      <span class="muted" style="font-weight:400;font-size:13px">${escapeHtml(aCase.caseId)}</span>
    `,
    subtitleHtml: "수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다.",
    templateOptionsHtml,
  });
}

export const scenarioSubtab = {
  id:       "scenario",
  label:    "분석 시나리오 설정 및 실행",
  showWhen: context => !!context.case,
  aiServices: [
    "db_cdw", "declaration_verify", "route_analysis", "network",
    "proceeds_tracking", "rag_investigation", "rag_global",
    "law", "report_generate", "report_validate",
  ],
  render: renderScenarioPanel,
};
