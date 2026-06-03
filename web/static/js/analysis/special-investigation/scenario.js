import { escapeHtml } from "../../core/dom.js";
import { specialInvestigationState } from "./state.js";
import { renderSharedWorkbench } from "../shared/workbench.js";

export function renderScenarioPanel(deps) {
  const aCase = deps.activeDrugCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const type  = deps.drugInvTypeById(aCase.invTypeId);
  const steps = deps.activeDrugCaseSteps();
  if (!specialInvestigationState.activeDrugStepId && steps[0]) {
    specialInvestigationState.activeDrugStepId = steps[0].id;
  }

  const typeChip = `<span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>`;

  // 마약수사유형별 템플릿 옵션
  const templateOptionsHtml = deps.drugScenarioTemplateOptionsHtml
    ? deps.drugScenarioTemplateOptionsHtml(aCase.invTypeId)
    : null;

  return renderSharedWorkbench(deps, {
    ns:           "drug",
    aCase,
    typeChip,
    subtitle:     "수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다.",
    steps,
    states:       aCase.stepStates  || {},
    activeStepId: specialInvestigationState.activeDrugStepId,
    stepResults:  aCase.stepResults  || {},
    stepExpanded: aCase.stepExpanded || {},
    isRunning:    !!deps.getDrugRunEventSource?.(),
    templateOptionsHtml,
    sourceOptionsHtml:  deps.giStepSourceOptionsHtml ? deps.giStepSourceOptionsHtml() : "",
    getBehaviorHtml:    deps.behaviorOptionsHtml
      ? (key, bvs) => deps.behaviorOptionsHtml(key, bvs)
      : null,
    getSourceHint: deps.scenarioSourceByKey && deps.sourceDefaultInstruction
      ? (key, targetType) => {
          const resolvedKey = deps.giCommonSourceKey ? deps.giCommonSourceKey(key) : key;
          const src = deps.scenarioSourceByKey(resolvedKey);
          return src ? {
            label:       src.label || key,
            typeLabel:   ({ db:"DB 조회", agent:"AI 서비스", rag:"RAG", report:"보고서", approve:"승인" })[src.type] || src.type,
            description: deps.sourceDefaultInstruction(src.key, aCase.targetType || "person") || "이 단계의 추가 지시를 입력하세요.",
          } : null;
        }
      : null,
    getPermissionStatus: deps.permissionStatus   || null,
    getPermissionLabel:  deps.permissionLabel    || null,
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
