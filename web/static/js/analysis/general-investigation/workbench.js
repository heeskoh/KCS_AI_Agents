import { escapeHtml } from "../../core/dom.js";
import { generalInvestigationState } from "./state.js";
import { renderSharedWorkbench } from "../shared/workbench.js";

export function renderWorkbenchPanel(deps) {
  const aCase = deps.activeGenInvCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const type  = deps.genInvTypeById(aCase.invTypeId);
  const steps = deps.activeGiCaseSteps();
  if (!generalInvestigationState.activeGiStepId && steps[0]) {
    generalInvestigationState.activeGiStepId = steps[0].id;
  }

  const typeChip = `<span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>`;

  // 수사유형별 템플릿 옵션
  const templateOptionsHtml = deps.giScenarioTemplateOptionsHtml
    ? deps.giScenarioTemplateOptionsHtml(aCase.invTypeId)
    : null;

  return renderSharedWorkbench(deps, {
    ns:           "gi",
    aCase,
    typeChip,
    subtitle:     "수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다. 단계를 추가·삭제·순서 변경하여 맞춤형 시나리오를 구성할 수 있습니다.",
    steps,
    states:       aCase.stepStates  || {},
    activeStepId: generalInvestigationState.activeGiStepId,
    stepResults:  aCase.stepResults  || {},
    stepExpanded: aCase.stepExpanded || {},
    isRunning:    !!deps.getGiRunEventSource(),
    templateOptionsHtml,
    sourceOptionsHtml:  deps.giStepSourceOptionsHtml ? deps.giStepSourceOptionsHtml() : "",
    getBehaviorHtml:    deps.behaviorOptionsHtml
      ? (key, bvs) => deps.behaviorOptionsHtml(key, bvs)
      : null,
    getSourceHint: deps.scenarioSourceByKey && deps.sourceDefaultInstruction
      ? (key, targetType) => {
          const src = deps.scenarioSourceByKey(
            deps.giCommonSourceKey ? deps.giCommonSourceKey(key) : key
          );
          return src ? {
            label:       src.label || key,
            typeLabel:   ({ db:"DB 조회", agent:"AI 서비스", rag:"RAG", report:"보고서", approve:"승인" })[src.type] || src.type,
            description: deps.sourceDefaultInstruction(src.key, targetType) || "이 단계의 추가 지시를 입력하세요.",
          } : null;
        }
      : null,
    getPermissionStatus: deps.permissionStatus   || null,
    getPermissionLabel:  deps.permissionLabel    || null,
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
