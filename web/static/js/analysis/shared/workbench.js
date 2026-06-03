/**
 * analysis/shared/workbench.js
 *
 * 공통 "분석 시나리오 설정 및 수행" 워크벤치 컴포넌트
 *
 * 관세조사(scenarioWorkbenchV2) 수준의 기능을
 * 일반수사 / 마약수사 / 외환수사에서 동일하게 사용할 수 있도록 추출.
 *
 * 호출 측은 renderSharedWorkbench(deps, ctx) 를 import해 사용한다.
 *
 * ctx 인터페이스:
 * {
 *   ns            : string   — 네임스페이스 ("gi" | "drug")
 *                             → data-{ns}-step-select / data-{ns}-run-step 등에 사용
 *   aCase         : object   — 활성 케이스 (null이면 가이드 메시지)
 *   typeChip      : string   — 케이스 타입 배지 HTML (e.g. gi-type-chip span)
 *   subtitle      : string   — 워크벤치 부제목 문자열
 *   steps         : object[] — 현재 시나리오 단계 배열
 *   states        : object   — { [stepId]: "wait"|"run"|"done"|"error" }
 *   activeStepId  : string   — 현재 선택된 단계 id
 *   stepResults   : object   — { [stepId]: string }
 *   stepExpanded  : object   — { [stepId]: boolean }
 *   isRunning     : boolean  — SSE 실행 중 여부
 *   templateOptionsHtml : string — <option> 목록 HTML (없으면 null)
 *   sourceOptionsHtml   : string — AI 서비스 단계 <option> 목록 HTML
 *   getBehaviorHtml     : (sourceKey, behaviors) => string
 *   getSourceHint       : (sourceKey, targetType) => { label, typeLabel, description }
 *   getPermissionStatus : (sourceKey) => "granted"|"requested"|"locked"
 *   getPermissionLabel  : (status) => string
 * }
 */
import { escapeHtml, markdownToHtml } from "../../core/dom.js";

const TYPE_LABEL = {
  db: "DB 조회", agent: "AI 서비스",
  rag: "RAG", report: "보고서", approve: "승인",
};
const CHIP_CLS = {
  db: "bigdata", agent: "agent",
  rag: "rag_customs", report: "report", approve: "validation",
};

export function renderSharedWorkbench(deps, ctx) {
  /* ── 케이스 없을 때 ─────────────────────────── */
  if (!ctx.aCase) {
    return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  }

  const { ns, aCase, typeChip, subtitle, steps, states,
          activeStepId, stepResults, stepExpanded,
          isRunning, templateOptionsHtml,
          sourceOptionsHtml, getBehaviorHtml,
          getSourceHint, getPermissionStatus, getPermissionLabel } = ctx;

  const done  = steps.filter(s => (states[s.id] || "wait") === "done").length;
  const total = steps.length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  const selStep = steps.find(s => s.id === activeStepId) || null;

  /* ── 왼쪽: 단계 칩 목록 ──────────────────────── */
  const boardChips = steps.map((step, i) => {
    const state    = states[step.id] || "wait";
    const isActive = step.id === activeStepId;
    const isDone   = state === "done";
    const stateTag = isDone
      ? `<span class="gi-chip-state done">완료</span>`
      : state === "run"
        ? `<span class="gi-chip-state run">실행중</span>`
        : "";

    // 소스 키 → 권한 상태
    const srcKey = step.sourceKey || step.key || "";
    const perm   = getPermissionStatus ? getPermissionStatus(srcKey) : "granted";
    const isGranted = perm === "granted";
    const permBadge = !isGranted
      ? `<span style="font-size:10px;color:#dc2626;margin-left:4px">${escapeHtml(getPermissionLabel?.(perm) || "권한없음")}</span>`
      : "";

    return `
      <div class="scenario-chip ${CHIP_CLS[step.type] || "agent"}${isActive ? " active" : ""}${isDone ? " gi-chip-done" : ""}${!isGranted ? " chip-no-perm" : ""}"
        data-${ns}-step-select="${escapeHtml(step.id)}"
        data-${ns}-step-drag-id="${escapeHtml(step.id)}"
        draggable="true"
        tabindex="0" role="button" style="position:relative">
        <div class="chip-num"${isDone ? ' style="background:#22c55e"' : ""}>${isDone ? "✓" : i + 1}</div>
        <div class="chip-body">
          <div class="chip-title-row">
            <strong>${escapeHtml(step.label)}</strong>${stateTag}${permBadge}
          </div>
          <p style="margin:0;font-size:12px;color:#64748b">
            ${escapeHtml(TYPE_LABEL[step.type] || step.type)}
          </p>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          ${i > 0
            ? `<button class="gi-move-btn" data-${ns}-step-up="${escapeHtml(step.id)}" title="위로">↑</button>`
            : `<span style="width:22px"></span>`}
          ${i < steps.length - 1
            ? `<button class="gi-move-btn" data-${ns}-step-down="${escapeHtml(step.id)}" title="아래로">↓</button>`
            : `<span style="width:22px"></span>`}
        </div>
      </div>`;
  }).join("");

  /* ── 가운데: 단계 설정 패널 ─────────────────── */
  let configPanel;
  if (selStep) {
    const srcKey    = selStep.sourceKey || selStep.key || "";
    const perm      = getPermissionStatus ? getPermissionStatus(srcKey) : "granted";
    const isGranted = perm === "granted";
    const hint      = getSourceHint ? getSourceHint(srcKey, aCase.targetType || "company") : null;
    const stepState = states[selStep.id] || "wait";
    const stateLabel = { done: "완료", run: "실행중", error: "오류", wait: "대기" }[stepState] || "대기";
    const stateClass = { done: " done", run: " run", error: " error" }[stepState] || " wait";

    configPanel = `
      <div class="scenario-config-title" style="margin-bottom:14px">
        <strong>${escapeHtml(selStep.label)}</strong>
        <span class="gi-chip-state${stateClass}" style="margin-left:8px">${stateLabel}</span>
      </div>
      <div class="scenario-agent-zone" style="overflow-y:auto;flex:1;min-height:0">

        <!-- AI 서비스 단계 선택 -->
        <label class="scenario-field">
          <span>AI 서비스 단계</span>
          <select id="${ns}WbStepSource" class="gi-reg-select" data-${ns}-step-id="${escapeHtml(selStep.id)}">
            ${sourceOptionsHtml || ""}
          </select>
        </label>

        <!-- 권한 없음 경고 -->
        ${!isGranted ? `
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:7px;
                      padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:#dc2626">⚠ ${escapeHtml(getPermissionLabel?.(perm) || "권한 없음")}</span>
            <button class="btn secondary" type="button"
              style="height:26px;padding:0 10px;font-size:11px;margin-left:auto"
              data-${ns}-step-request-perm="${escapeHtml(srcKey)}">권한 요청</button>
          </div>` : ""}

        <!-- 동작 선택 -->
        <div class="scenario-field">
          <span>동작 선택</span>
          <div id="${ns}WbBehaviorOptions" class="scenario-behavior-options"
               data-${ns}-step-id="${escapeHtml(selStep.id)}">
            ${getBehaviorHtml ? getBehaviorHtml(srcKey, selStep.behaviors) : ""}
          </div>
        </div>

        <!-- 서비스 설명 힌트 -->
        ${hint ? `
          <div class="scenario-source-hint">
            <div class="hint-header">
              <strong>${escapeHtml(hint.label)}</strong>
              <span>${escapeHtml(hint.typeLabel)}</span>
            </div>
            <p>${escapeHtml(hint.description)}</p>
          </div>` : ""}

        <!-- 추가 지시 -->
        <label class="scenario-field">
          <span>추가 지시</span>
          <textarea id="${ns}WbStepNote" class="gi-wb2-textarea" rows="4"
            style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;
                   font:inherit;font-size:13px;width:100%;box-sizing:border-box;resize:vertical"
            placeholder="이 단계에서 중점적으로 확인할 내용을 입력하세요."
            data-${ns}-step-id="${escapeHtml(selStep.id)}">${escapeHtml(selStep.instruction || selStep.note || "")}</textarea>
        </label>
      </div>

      <!-- 단계 추가/삭제 -->
      <div class="scenario-actions" style="margin-top:12px">
        <select id="${ns}WbAddSource" class="gi-reg-select" style="flex:1">
          <option value="">+ 단계 추가 선택...</option>
          ${sourceOptionsHtml || ""}
        </select>
        <button class="btn" type="button" data-${ns}-step-add>단계 추가</button>
        <button class="btn secondary" type="button" data-${ns}-step-delete="${escapeHtml(selStep.id)}">선택 삭제</button>
      </div>`;
  } else {
    configPanel = `
      <div class="scenario-config-title" style="margin-bottom:14px">
        <strong>분석 시나리오 설정</strong>
      </div>
      <div class="scenario-agent-zone" style="display:flex;flex-direction:column;
           align-items:center;justify-content:center;flex:1;color:#94a3b8;text-align:center;gap:8px">
        <span style="font-size:32px;opacity:.25">⚙</span>
        <p style="margin:0;font-size:13px">왼쪽에서 단계를 선택하면<br>설정을 확인하고 편집할 수 있습니다.</p>
      </div>
      <div class="scenario-actions" style="margin-top:12px">
        <select id="${ns}WbAddSource" class="gi-reg-select" style="flex:1">
          <option value="">+ 단계 추가 선택...</option>
          ${sourceOptionsHtml || ""}
        </select>
        <button class="btn" type="button" data-${ns}-step-add>단계 추가</button>
        <button class="btn secondary" type="button" disabled>선택 삭제</button>
      </div>`;
  }

  /* ── 오른쪽: 실행 로그 ───────────────────────── */
  const logRows = steps.map((step, i) => {
    const state      = states[step.id] || "wait";
    const isDone     = state === "done";
    const isRun      = state === "run";
    const isError    = state === "error";
    const hasResult  = !!(stepResults[step.id]);
    const isExpanded = !!(stepExpanded[step.id]);

    const stateCell = isDone
      ? `<span class="gi-chip-state done">완료</span>
         ${hasResult ? `<button class="gi-log-act-btn"
           data-${ns}-toggle-result="${escapeHtml(step.id)}"
           title="${isExpanded ? "접기" : "결과 보기"}">${isExpanded ? "▲" : "▼"}</button>` : ""}
         <button class="gi-log-act-btn"
           data-${ns}-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}"
           title="재실행">↺</button>`
      : isError
        ? `<span class="gi-chip-state" style="background:#fee2e2;color:#dc2626">오류</span>
           ${hasResult ? `<button class="gi-log-act-btn"
             data-${ns}-toggle-result="${escapeHtml(step.id)}">${isExpanded ? "▲" : "▼"}</button>` : ""}
           <button class="gi-log-act-btn"
             data-${ns}-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">↺</button>`
        : isRun
          ? `<span class="gi-chip-state run" style="animation:gi-blink 1.2s infinite">실행중...</span>`
          : `<button class="gi-log-act-btn primary"
               data-${ns}-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}"
               ${isRunning ? "disabled" : ""}>▶</button>`;

    const resultSection = (isDone || isError) && hasResult && isExpanded
      ? `<div class="gi-log-result-frame">
           <div class="gi-log-result-scroll">${markdownToHtml(stepResults[step.id])}</div>
         </div>` : "";

    return `
      <div class="gi-log-item${isExpanded ? " open" : ""}${isDone ? " gi-log-done" : isRun ? " gi-log-run" : isError ? " gi-log-error" : ""}">
        <div class="gi-log-row">
          <div class="gi-log-num">${isDone ? "✓" : isError ? "!" : i + 1}</div>
          <div class="gi-log-name">${escapeHtml(step.label)}</div>
          <div class="gi-log-state">${stateCell}</div>
        </div>
        ${resultSection}
      </div>`;
  }).join("");

  /* ── 전체 레이아웃 ───────────────────────────── */
  return `
    <section class="card scenario-workbench scenario-workbench-v2" style="padding:0;overflow:hidden">

      <!-- 헤더: 케이스 정보 + 진행 상태 -->
      <div class="scenario-title-row" style="padding:14px 18px 0">
        <div>
          <h3 style="display:flex;align-items:center;gap:10px;margin:0 0 2px">
            ${typeChip || ""}
            ${escapeHtml(aCase.targetName || aCase.company_name || "")}
            <span class="muted" style="font-weight:400;font-size:13px">
              ${escapeHtml(aCase.caseId || "")}
            </span>
          </h3>
          <p class="muted" style="margin:0;font-size:12px">${escapeHtml(subtitle)}</p>
        </div>
        <div class="scenario-status">
          <span>${done === total && total > 0 ? "완료" : done > 0 ? "진행중" : "대기"}</span>
          <strong>${done}/${total}</strong>
        </div>
      </div>

      <!-- 진행 바 -->
      <div class="scenario-progress" style="margin:10px 18px 0;height:6px">
        <i style="width:${pct}%"></i>
      </div>

      <!-- 3열 레이아웃 -->
      <div class="scenario-layout scenario-execution-layout"
           style="padding:14px 18px 14px;margin-top:10px">

        <!-- 왼쪽: 시나리오 단계 목록 -->
        <section class="scenario-board">
          <div class="scenario-board-head">
            <h3>시나리오 단계</h3>
            <span class="muted" style="font-size:12px">${total}단계</span>
          </div>
          <div class="scenario-list-vertical" style="margin-top:10px">
            ${boardChips || `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">단계가 없습니다.</div>`}
          </div>
        </section>

        <!-- 가운데: 단계 설정 + 템플릿 -->
        <aside class="scenario-config" style="display:flex;flex-direction:column">

          <!-- 템플릿 선택 (있을 때만) -->
          ${templateOptionsHtml ? `
            <div class="scenario-template-zone" style="margin-bottom:12px">
              <div class="scenario-template-zone-head">
                <span>시나리오 템플릿</span>
                <button type="button" class="btn scenario-template-apply-btn"
                  data-${ns}-template-apply>적용</button>
              </div>
              <select id="${ns}WbTemplateSelect" class="scenario-template-select">
                ${templateOptionsHtml}
              </select>
            </div>` : ""}

          ${configPanel}
        </aside>

        <!-- 오른쪽: 실행 로그 -->
        <section class="scenario-log" style="display:flex;flex-direction:column">
          <div class="scenario-log-head">
            <h3>분석 실행${isRunning
              ? ` <span class="gi-chip-state run" style="font-size:11px;animation:gi-blink 1.2s infinite">실행중</span>`
              : ""}</h3>
            <div class="scenario-log-actions">
              <button class="btn" type="button"
                data-${ns}-run-step="${escapeHtml(aCase.caseId)}:all"
                ${isRunning ? "disabled" : ""}>
                ${isRunning ? "⏳ 실행중..." : "전체 실행"}
              </button>
              <button class="btn secondary" type="button"
                data-${ns}-rerun-step="${escapeHtml(aCase.caseId)}:clear">결과 지우기</button>
            </div>
          </div>
          <div class="gi-log-list scenario-step-accordion scenario-ai-results"
               style="margin-top:10px;flex:1;overflow-y:auto">
            ${logRows || `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">
              실행 버튼을 눌러 시나리오를 시작하세요.</div>`}
          </div>
        </section>

      </div>
    </section>`;
}
