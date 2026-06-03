import { escapeHtml } from "../../core/dom.js";
import { renderSharedWorkbench } from "../shared/workbench.js";

export function renderScenarioPanel(deps) {
  const company  = deps.activeCanvasCompany();
  const archived = deps.isCompanyArchived(company.company_id);

  // 관세조사는 scenarioItems 배열 기반 (수사 케이스 없음)
  const items   = deps.getScenarioItems();
  const statuses = deps.getStepStatuses();
  const outputs  = deps.getStepOutputs();

  // steps를 공통 포맷으로 변환
  const steps = items.map(item => ({
    id:         item.id,
    key:        item.key,
    type:       item.type,
    label:      item.label,
    behaviors:  item.behaviors,
    instruction:item.instruction,
    sourceKey:  item.key,
    note:       item.instruction,
  }));

  // states: stepStatuses → "done"|"run"|"error"|"wait"
  const states = Object.fromEntries(
    Object.entries(statuses).map(([id, s]) => [id, s === "완료" ? "done" : s === "실행중" ? "run" : s === "오류" ? "error" : "wait"])
  );

  // stepResults: stepOutputs 그대로
  const stepResults  = outputs || {};
  const stepExpanded = Object.fromEntries(
    (deps.getOpenedSteps?.() || new Set())
      .values
      ? [...(deps.getOpenedSteps?.() || [])].map(id => [id, true])
      : []
  );

  // activeStepId = selectedScenarioId
  const activeStepId = deps.getSelectedScenarioId?.() || steps[0]?.id || null;

  // 관세조사 템플릿 옵션 HTML
  const templateOptionsHtml = deps.scenarioTemplateOptionsHtml
    ? deps.scenarioTemplateOptionsHtml()
    : null;

  // 가짜 aCase 객체 (공통 컴포넌트 호환)
  const aCase = {
    caseId:     company.company_id,
    targetName: company.company_name,
    targetType: "company",
    giSteps:    items,
    stepStates: states,
    stepResults,
    stepExpanded,
  };

  return renderSharedWorkbench(deps, {
    ns:           "canvas",
    aCase,
    typeChip:     "",   // 관세조사는 유형 배지 없음
    subtitle:     `템플릿을 불러온 뒤 기업별 조사 목적에 맞게 단계, 동작, 추가 지시를 조정합니다.${archived ? " 아카이브된 작업은 복원 후 다시 분석할 수 있습니다." : " 아카이브 전에는 언제든지 시나리오를 수정하고 재실행할 수 있습니다."}`,
    steps,
    states,
    activeStepId,
    stepResults,
    stepExpanded,
    isRunning:    !!deps.getScenarioEventSource?.(),
    templateOptionsHtml,
    sourceOptionsHtml:  deps.scenarioSourceOptionsHtml ? deps.scenarioSourceOptionsHtml() : "",
    getBehaviorHtml:    deps.behaviorOptionsHtml
      ? (key, bvs) => deps.behaviorOptionsHtml(key, bvs)
      : null,
    getSourceHint: deps.scenarioSourceByKey && deps.sourceDefaultInstruction
      ? (key, _targetType) => {
          const src = deps.scenarioSourceByKey(key);
          return src ? {
            label:       src.label || key,
            typeLabel:   ({ db:"DB 조회", agent:"AI 서비스", rag:"RAG", report:"보고서", approve:"승인" })[src.type] || src.type,
            description: deps.sourceDefaultInstruction(key) || "이 단계의 추가 지시를 입력하세요.",
          } : null;
        }
      : null,
    getPermissionStatus: deps.permissionStatus || null,
    getPermissionLabel:  deps.permissionLabel  || null,
  });
}

export const scenarioSubtab = {
  id:       "scenario",
  label:    "분석 시나리오 설정 및 수행",
  group:    "work",
  aiServices: [
    "db_cdw", "rag_customs", "rag_trade", "ml",
    "declaration_verify", "hs_verify", "customs_value",
    "law", "report_generate", "report_validate",
  ],
  render: renderScenarioPanel,
};
