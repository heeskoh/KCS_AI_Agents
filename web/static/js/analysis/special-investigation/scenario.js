import { escapeHtml, markdownToHtml } from "../../core/dom.js";
import { specialInvestigationState } from "./state.js";

export function renderScenarioPanel(deps){
  const aCase = deps.activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const type  = deps.drugInvTypeById(aCase.invTypeId);
  const steps = deps.activeDrugCaseSteps();
  if(!specialInvestigationState.activeDrugStepId && steps[0]) specialInvestigationState.activeDrugStepId = steps[0].id;
  const states = aCase.stepStates  || {};
  const done   = steps.filter(s => states[s.id] === "done").length;
  const total  = steps.length;
  const pct    = total ? Math.round(done / total * 100) : 0;
  const selStep = deps.activeDrugStep();

  const typeLabel = {db:"DB 조회",agent:"AI 서비스",rag:"RAG",report:"보고서",approve:"승인"};
  const chipCls   = {db:"bigdata",agent:"agent",rag:"rag_customs",report:"report",approve:"validation"};

  /* 왼쪽: 단계 칩 목록 */
  const boardChips = steps.map((step, i) => {
    const state    = states[step.id] || "wait";
    const isActive = step.id === specialInvestigationState.activeDrugStepId;
    const isDone   = state === "done";
    const stateTag = isDone
      ? `<span class="gi-chip-state done">완료</span>`
      : state === "run" ? `<span class="gi-chip-state run">실행중</span>` : "";
    return `
      <div class="scenario-chip ${chipCls[step.type]||"agent"}${isActive?" active":""}${isDone?" gi-chip-done":""}"
        data-drug-step-select="${escapeHtml(step.id)}" tabindex="0" role="button" style="position:relative">
        <div class="chip-num"${isDone?' style="background:#22c55e"':""}}>${isDone?"✓":i+1}</div>
        <div class="chip-body">
          <div class="chip-title-row">
            <strong>${escapeHtml(step.label)}</strong>${stateTag}
          </div>
          <p style="margin:0;font-size:12px;color:#64748b">${escapeHtml(typeLabel[step.type]||step.type)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          ${i > 0 ? `<button class="gi-move-btn" data-drug-step-up="${escapeHtml(step.id)}">↑</button>` : `<span style="width:22px"></span>`}
          ${i < steps.length-1 ? `<button class="gi-move-btn" data-drug-step-down="${escapeHtml(step.id)}">↓</button>` : `<span style="width:22px"></span>`}
        </div>
      </div>`;
  }).join("");

  /* 가운데: 단계 설정 */
  const configPanel = selStep ? `
    <div class="scenario-config-title" style="margin-bottom:14px">
      <strong>${escapeHtml(selStep.label)}</strong>
      <span class="gi-chip-state${states[selStep.id]==="done"?" done":states[selStep.id]==="run"?" run":" wait"}" style="margin-left:8px">
        ${states[selStep.id]==="done"?"완료":states[selStep.id]==="run"?"실행중":"대기"}
      </span>
    </div>
    <div class="scenario-agent-zone" style="overflow-y:auto;flex:1;min-height:0">
      <div class="scenario-source-hint">
        <div class="hint-header">
          <strong>${escapeHtml(selStep.label)}</strong>
          <span>${escapeHtml(typeLabel[selStep.type]||selStep.type)}</span>
        </div>
      </div>
      <label class="scenario-field">
        <span>추가 지시</span>
        <textarea class="gi-wb2-textarea" rows="4"
          style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;font:inherit;font-size:13px;width:100%;box-sizing:border-box;resize:vertical"
          placeholder="이 단계에서 중점적으로 확인할 내용을 입력하세요."
          data-drug-step-note="${escapeHtml(selStep.id)}">${escapeHtml(selStep.instruction||selStep.note||"")}</textarea>
      </label>
    </div>
    <div class="scenario-actions" style="margin-top:12px">
      <select id="drugWbAddSource" class="gi-reg-select" style="flex:1">
        <option value="">+ 단계 추가 선택...</option>
        ${deps.giStepSourceOptionsHtml()}
      </select>
      <button class="btn" type="button" data-drug-step-add>단계 추가</button>
      <button class="btn secondary" type="button" data-drug-step-delete="${escapeHtml(selStep.id)}">선택 삭제</button>
    </div>
  ` : `
    <div class="scenario-config-title" style="margin-bottom:14px"><strong>분석 시나리오 설정</strong></div>
    <div class="scenario-agent-zone" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#94a3b8;text-align:center;gap:8px">
      <span style="font-size:32px;opacity:.25">⚙</span>
      <p style="margin:0;font-size:13px">왼쪽에서 단계를 선택하면<br>설정을 확인하고 편집할 수 있습니다.</p>
    </div>
    <div class="scenario-actions" style="margin-top:12px">
      <select id="drugWbAddSource" class="gi-reg-select" style="flex:1">
        <option value="">+ 단계 추가 선택...</option>
        ${deps.giStepSourceOptionsHtml()}
      </select>
      <button class="btn" type="button" data-drug-step-add>단계 추가</button>
      <button class="btn secondary" type="button" disabled>선택 삭제</button>
    </div>
  `;

  /* 오른쪽: 실행 로그 */
  const stepResults  = aCase.stepResults  || {};
  const stepExpanded = aCase.stepExpanded || {};
  const logRows = steps.map((step, i) => {
    const state     = states[step.id] || "wait";
    const isDone    = state === "done";
    const isRun     = state === "run";
    const isError   = state === "error";
    const hasResult = !!(stepResults[step.id]);
    const isExpanded= !!stepExpanded[step.id];
    const stateCell = isDone
      ? `<span class="gi-chip-state done">완료</span>
         ${hasResult ? `<button class="gi-log-act-btn" data-drug-toggle-result="${escapeHtml(step.id)}">${isExpanded?"▲":"▼"}</button>` : ""}
         <button class="gi-log-act-btn" data-drug-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">↺</button>`
      : isError
        ? `<span class="gi-chip-state" style="background:#fee2e2;color:#dc2626">오류</span>
           <button class="gi-log-act-btn" data-drug-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">↺</button>`
        : isRun
          ? `<span class="gi-chip-state run" style="animation:gi-blink 1.2s infinite">실행중...</span>`
          : `<button class="gi-log-act-btn primary" data-drug-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">▶</button>`;
    const resultSection = (isDone||isError) && hasResult && isExpanded
      ? `<div class="gi-log-result-frame">
          <div class="gi-log-result-scroll">${markdownToHtml(stepResults[step.id])}</div>
        </div>` : "";
    return `
      <div class="gi-log-item${isExpanded ? " open" : ""}${isDone?" gi-log-done":isRun?" gi-log-run":isError?" gi-log-error":""}">
        <div class="gi-log-row">
          <div class="gi-log-num">${isDone?"✓":isError?"!":i+1}</div>
          <div class="gi-log-name">${escapeHtml(step.label)}</div>
          <div class="gi-log-state">${stateCell}</div>
        </div>
        ${resultSection}
      </div>`;
  }).join("");

  return `
    <section class="card scenario-workbench scenario-workbench-v2" style="padding:0;overflow:hidden">
      <div class="scenario-title-row" style="padding:14px 18px 0">
        <div>
          <h3 style="display:flex;align-items:center;gap:10px;margin:0 0 2px">
            <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
            ${escapeHtml(aCase.targetName)}
            <span class="muted" style="font-weight:400;font-size:13px">${escapeHtml(aCase.caseId)}</span>
          </h3>
          <p class="muted" style="margin:0;font-size:12px">수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다.</p>
        </div>
        <div class="scenario-status">
          <span>${done===total&&total>0?"완료":done>0?"진행중":"대기"}</span>
          <strong>${done}/${total}</strong>
        </div>
      </div>
      <div class="scenario-progress" style="margin:10px 18px 0;height:6px">
        <i style="width:${pct}%"></i>
      </div>
      <div class="scenario-layout scenario-execution-layout" style="padding:14px 18px 14px;margin-top:10px">
        <section class="scenario-board">
          <div class="scenario-board-head">
            <h3>수사 시나리오</h3>
            <span class="muted" style="font-size:12px">${total}단계</span>
          </div>
          <div class="scenario-list-vertical" style="margin-top:10px">${boardChips}</div>
        </section>
        <aside class="scenario-config" style="display:flex;flex-direction:column">${configPanel}</aside>
        <section class="scenario-log" style="display:flex;flex-direction:column">
          <div class="scenario-log-head">
            <h3>분석 실행</h3>
            <div class="scenario-log-actions">
              <button class="btn" type="button" data-drug-run-step="${escapeHtml(aCase.caseId)}:all">분석 실행</button>
              <button class="btn secondary" type="button" data-drug-run-step="${escapeHtml(aCase.caseId)}:clear">결과 지우기</button>
            </div>
          </div>
          <div class="gi-log-list scenario-step-accordion scenario-ai-results" style="margin-top:10px;flex:1;overflow-y:auto">
            ${logRows || `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">분석 실행 버튼을 눌러 시나리오를 시작하세요.</div>`}
          </div>
        </section>
      </div>
    </section>
  `;
}

export const scenarioSubtab = {
  id: "scenario",
  label: "분석 시나리오 설정 및 실행",
  showWhen: context => !!context.case,
  aiServices: ["db_cdw", "declaration_verify", "route_analysis", "network", "proceeds_tracking", "rag_investigation", "rag_global", "law", "report_generate", "report_validate"],
  render: renderScenarioPanel,
};
