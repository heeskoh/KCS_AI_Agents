/**
 * analysis/shared/workbench.js
 *
 * 怨듯넻 "AI?쒕퉬??遺꾩꽍 ?묒뾽" ?뚰겕踰ㅼ튂 而댄룷?뚰듃
 *
 * 愿?몄“??scenarioWorkbenchV2) ?섏???湲곕뒫?? * ?쇰컲?섏궗 / 留덉빟?섏궗 / ?명솚?섏궗?먯꽌 ?숈씪?섍쾶 ?ъ슜?????덈룄濡?異붿텧.
 *
 * ?몄텧 痢≪? renderSharedWorkbench(deps, ctx) 瑜?import???ъ슜?쒕떎.
 *
 * ctx ?명꽣?섏씠??
 * {
 *   ns            : string   ???ㅼ엫?ㅽ럹?댁뒪 ("gi" | "drug")
 *                             ??data-{ns}-step-select / data-{ns}-run-step ?깆뿉 ?ъ슜
 *   aCase         : object   ???쒖꽦 耳?댁뒪 (null?대㈃ 媛?대뱶 硫붿떆吏)
 *   typeChip      : string   ??耳?댁뒪 ???諛곗? HTML (e.g. gi-type-chip span)
 *   subtitle      : string   ???뚰겕踰ㅼ튂 遺?쒕ぉ 臾몄옄?? *   steps         : object[] ???꾩옱 ?쒕굹由ъ삤 ?④퀎 諛곗뿴
 *   states        : object   ??{ [stepId]: "wait"|"run"|"done"|"error" }
 *   activeStepId  : string   ???꾩옱 ?좏깮???④퀎 id
 *   stepResults   : object   ??{ [stepId]: string }
 *   stepExpanded  : object   ??{ [stepId]: boolean }
 *   isRunning     : boolean  ??SSE ?ㅽ뻾 以??щ?
 *   templateOptionsHtml : string ??<option> 紐⑸줉 HTML (?놁쑝硫?null)
 *   sourceOptionsHtml   : string ??AI ?쒕퉬???④퀎 <option> 紐⑸줉 HTML
 *   getBehaviorHtml     : (sourceKey, behaviors) => string
 *   getSourceHint       : (sourceKey, targetType) => { label, typeLabel, description }
 *   getPermissionStatus : (sourceKey) => "granted"|"requested"|"locked"
 *   getPermissionLabel  : (status) => string
 * }
 */
import { escapeHtml, markdownToHtml } from "../../core/dom.js";

const TYPE_LABEL = {
  db: "DB 議고쉶", agent: "AI ?쒕퉬??,
  rag: "RAG", report: "蹂닿퀬??, approve: "寃利?,
};
const CHIP_CLS = {
  db: "bigdata", agent: "agent",
  rag: "rag_customs", report: "report", approve: "validation",
};

function normalizeReportValidationLabel(label) {
  const legacy = "蹂닿퀬??" + "?뱀씤";
  return String(label || "").replaceAll(legacy, "蹂닿퀬??寃利?);
}

export function renderSharedWorkbench(deps, ctx) {
  /* ?? 耳?댁뒪 ?놁쓣 ????????????????????????????? */
  if (!ctx.aCase) {
    return `<div class="profile-loading">?섏궗 ??곸쓣 癒쇱? ?좏깮?섏꽭??</div>`;
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

  /* ?? ?쇱そ: ?④퀎 移?紐⑸줉 ???????????????????????? */
  const boardChips = steps.map((step, i) => {
    const state    = states[step.id] || "wait";
    const isActive = step.id === activeStepId;
    const isDone   = state === "done";
    const stateTag = isDone
      ? `<span class="gi-chip-state done">?꾨즺</span>`
      : state === "run"
        ? `<span class="gi-chip-state run">?ㅽ뻾以?/span>`
        : "";

    // ?뚯뒪 ????沅뚰븳 ?곹깭
    const srcKey = step.sourceKey || step.key || "";
    const perm   = getPermissionStatus ? getPermissionStatus(srcKey) : "granted";
    const isGranted = perm === "granted";
    const permBadge = !isGranted
      ? `<span style="font-size:10px;color:#dc2626;margin-left:4px">${escapeHtml(getPermissionLabel?.(perm) || "沅뚰븳?놁쓬")}</span>`
      : "";

    return `
      <div class="scenario-chip ${CHIP_CLS[step.type] || "agent"}${isActive ? " active" : ""}${isDone ? " gi-chip-done" : ""}${!isGranted ? " chip-no-perm" : ""}"
        data-${ns}-step-select="${escapeHtml(step.id)}"
        data-${ns}-step-drag-id="${escapeHtml(step.id)}"
        draggable="true"
        tabindex="0" role="button" style="position:relative">
        <div class="chip-num"${isDone ? ' style="background:#22c55e"' : ""}>${isDone ? "?? : i + 1}</div>
        <div class="chip-body">
          <div class="chip-title-row">
            <strong>${escapeHtml(normalizeReportValidationLabel(step.label))}</strong>${stateTag}${permBadge}
          </div>
          <p style="margin:0;font-size:12px;color:#64748b">
            ${escapeHtml(TYPE_LABEL[step.type] || step.type)}
          </p>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          ${i > 0
            ? `<button class="gi-move-btn" data-${ns}-step-up="${escapeHtml(step.id)}" title="?꾨줈">??/button>`
            : `<span style="width:22px"></span>`}
          ${i < steps.length - 1
            ? `<button class="gi-move-btn" data-${ns}-step-down="${escapeHtml(step.id)}" title="?꾨옒濡?>??/button>`
            : `<span style="width:22px"></span>`}
        </div>
      </div>`;
  }).join("");

  /* ?? 媛?대뜲: ?④퀎 ?ㅼ젙 ?⑤꼸 ??????????????????? */
  let configPanel;
  if (selStep) {
    const srcKey    = selStep.sourceKey || selStep.key || "";
    const perm      = getPermissionStatus ? getPermissionStatus(srcKey) : "granted";
    const isGranted = perm === "granted";
    const hint      = getSourceHint ? getSourceHint(srcKey, aCase.targetType || "company") : null;
    const stepState = states[selStep.id] || "wait";
    const stateLabel = { done: "?꾨즺", run: "?ㅽ뻾以?, error: "?ㅻ쪟", wait: "?湲? }[stepState] || "?湲?;
    const stateClass = { done: " done", run: " run", error: " error" }[stepState] || " wait";

    configPanel = `
      <div class="scenario-config-title" style="margin-bottom:14px">
        <strong>${escapeHtml(selStep.label)}</strong>
        <span class="gi-chip-state${stateClass}" style="margin-left:8px">${stateLabel}</span>
      </div>
      <div class="scenario-agent-zone">

        <!-- AI ?쒕퉬???④퀎 ?좏깮 -->
        <label class="scenario-field">
          <span>AI ?쒕퉬???④퀎</span>
          <select id="${ns}WbStepSource" class="gi-reg-select" data-${ns}-step-id="${escapeHtml(selStep.id)}">
            ${sourceOptionsHtml || ""}
          </select>
        </label>

        <!-- 沅뚰븳 ?놁쓬 寃쎄퀬 -->
        ${!isGranted ? `
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:7px;
                      padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:#dc2626">??${escapeHtml(getPermissionLabel?.(perm) || "沅뚰븳 ?놁쓬")}</span>
            <button class="btn secondary" type="button"
              style="height:26px;padding:0 10px;font-size:11px;margin-left:auto"
              data-${ns}-step-request-perm="${escapeHtml(srcKey)}">沅뚰븳 ?붿껌</button>
          </div>` : ""}

        <!-- ?숈옉 ?좏깮 -->
        <div class="scenario-field">
          <span>?숈옉 ?좏깮</span>
          <div id="${ns}WbBehaviorOptions" class="scenario-behavior-options"
               data-${ns}-step-id="${escapeHtml(selStep.id)}">
            ${getBehaviorHtml ? getBehaviorHtml(srcKey, selStep.behaviors) : ""}
          </div>
        </div>

        <!-- ?쒕퉬???ㅻ챸 ?뚰듃 -->
        ${hint ? `
          <div class="scenario-source-hint">
            <div class="hint-header">
              <strong>${escapeHtml(hint.label)}</strong>
              <span>${escapeHtml(hint.typeLabel)}</span>
            </div>
            <p>${escapeHtml(hint.description)}</p>
          </div>` : ""}

        <!-- 異붽? 吏??-->
        <label class="scenario-field">
          <span>異붽? 吏??/span>
          <textarea id="${ns}WbStepNote" class="gi-wb2-textarea" rows="4"
            style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;
                   font:inherit;font-size:13px;width:100%;box-sizing:border-box;"
            placeholder="???④퀎?먯꽌 以묒젏?곸쑝濡??뺤씤???댁슜???낅젰?섏꽭??"
            data-${ns}-step-id="${escapeHtml(selStep.id)}">${escapeHtml(selStep.instruction || selStep.note || "")}</textarea>
        </label>
      </div>

      <!-- ?④퀎 異붽?/??젣 -->
      <div class="scenario-actions" style="margin-top:12px">
        <select id="${ns}WbAddSource" class="gi-reg-select" style="flex:1">
          <option value="">+ ?④퀎 異붽? ?좏깮...</option>
          ${sourceOptionsHtml || ""}
        </select>
        <button class="btn" type="button" data-${ns}-step-add>?④퀎 異붽?</button>
        <button class="btn secondary" type="button" data-${ns}-step-delete="${escapeHtml(selStep.id)}">?좏깮 ??젣</button>
      </div>`;
  } else {
    configPanel = `
      <div class="scenario-config-title" style="margin-bottom:14px">
        <strong>遺꾩꽍 ?쒕굹由ъ삤 ?ㅼ젙</strong>
      </div>
      <div class="scenario-agent-zone" style="display:flex;flex-direction:column;
           align-items:center;justify-content:center;flex:1;color:#94a3b8;text-align:center;gap:8px">
        <span style="font-size:32px;opacity:.25">??/span>
        <p style="margin:0;font-size:13px">?쇱そ?먯꽌 ?④퀎瑜??좏깮?섎㈃<br>?ㅼ젙???뺤씤?섍퀬 ?몄쭛?????덉뒿?덈떎.</p>
      </div>
      <div class="scenario-actions" style="margin-top:12px">
        <select id="${ns}WbAddSource" class="gi-reg-select" style="flex:1">
          <option value="">+ ?④퀎 異붽? ?좏깮...</option>
          ${sourceOptionsHtml || ""}
        </select>
        <button class="btn" type="button" data-${ns}-step-add>?④퀎 異붽?</button>
        <button class="btn secondary" type="button" disabled>?좏깮 ??젣</button>
      </div>`;
  }

  /* ?? ?ㅻⅨ履? ?ㅽ뻾 濡쒓렇 ????????????????????????? */
  const logRows = steps.map((step, i) => {
    const state      = states[step.id] || "wait";
    const isDone     = state === "done";
    const isRun      = state === "run";
    const isError    = state === "error";
    const hasResult  = !!(stepResults[step.id]);
    const isExpanded = !!(stepExpanded[step.id]);

    const stateCell = isDone
      ? `<span class="gi-chip-state done">?꾨즺</span>
         ${hasResult ? `<button class="gi-log-act-btn"
           data-${ns}-toggle-result="${escapeHtml(step.id)}"
           title="${isExpanded ? "?묎린" : "寃곌낵 蹂닿린"}">${isExpanded ? "?? : "??}</button>` : ""}
         <button class="gi-log-act-btn"
           data-${ns}-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}"
           title="?ъ떎??>??/button>`
      : isError
        ? `<span class="gi-chip-state" style="background:#fee2e2;color:#dc2626">?ㅻ쪟</span>
           ${hasResult ? `<button class="gi-log-act-btn"
             data-${ns}-toggle-result="${escapeHtml(step.id)}">${isExpanded ? "?? : "??}</button>` : ""}
           <button class="gi-log-act-btn"
             data-${ns}-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">??/button>`
        : isRun
          ? `<span class="gi-chip-state run" style="animation:gi-blink 1.2s infinite">?ㅽ뻾以?..</span>`
          : `<button class="gi-log-act-btn primary"
               data-${ns}-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}"
               ${isRunning ? "disabled" : ""}>??/button>`;

    const resultSection = (isDone || isError) && hasResult && isExpanded
      ? `<div class="gi-log-result-frame">
           <div class="gi-log-result-scroll">${markdownToHtml(stepResults[step.id])}</div>
         </div>` : "";

    return `
      <div class="gi-log-item${isExpanded ? " open" : ""}${isDone ? " gi-log-done" : isRun ? " gi-log-run" : isError ? " gi-log-error" : ""}">
        <div class="gi-log-row">
          <div class="gi-log-num">${isDone ? "?? : isError ? "!" : i + 1}</div>
          <div class="gi-log-name">${escapeHtml(normalizeReportValidationLabel(step.label))}</div>
          <div class="gi-log-state">${stateCell}</div>
        </div>
        ${resultSection}
      </div>`;
  }).join("");

  /* ?? ?꾩껜 ?덉씠?꾩썐 ????????????????????????????? */
  return `
    <section class="card scenario-workbench scenario-workbench-v2" style="padding:0;overflow:hidden">

      <!-- ?ㅻ뜑: 耳?댁뒪 ?뺣낫 + 吏꾪뻾 ?곹깭 -->
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
          <span>${done === total && total > 0 ? "?꾨즺" : done > 0 ? "吏꾪뻾以? : "?湲?}</span>
          <strong>${done}/${total}</strong>
        </div>
      </div>

      <!-- 吏꾪뻾 諛?-->
      <div class="scenario-progress" style="margin:10px 18px 0;height:6px">
        <i style="width:${pct}%"></i>
      </div>

      <!-- 3???덉씠?꾩썐 -->
      <div class="scenario-layout scenario-execution-layout"
           style="padding:14px 18px 14px;margin-top:10px">

        <!-- ?쇱そ: ?쒕굹由ъ삤 ?④퀎 紐⑸줉 -->
        <section class="scenario-board">
          <div class="scenario-board-head">
            <h3>?쒕굹由ъ삤 ?④퀎</h3>
            <span class="muted" style="font-size:12px">${total}?④퀎</span>
          </div>
          <div class="scenario-list-vertical" style="margin-top:10px">
            ${boardChips || `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">?④퀎媛 ?놁뒿?덈떎.</div>`}
          </div>
        </section>

        <!-- 媛?대뜲: ?④퀎 ?ㅼ젙 + ?쒗뵆由?-->
        <aside class="scenario-config" style="display:flex;flex-direction:column">

          <!-- ?쒗뵆由??좏깮 (?덉쓣 ?뚮쭔) -->
          ${templateOptionsHtml ? `
            <div class="scenario-template-zone" style="margin-bottom:12px">
              <div class="scenario-template-zone-head">
                <span>?쒕굹由ъ삤 ?쒗뵆由?/span>
                <button type="button" class="btn scenario-template-apply-btn"
                  data-${ns}-template-apply>?곸슜</button>
              </div>
              <select id="${ns}WbTemplateSelect" class="scenario-template-select">
                ${templateOptionsHtml}
              </select>
            </div>` : ""}

          ${configPanel}
        </aside>

        <!-- ?ㅻⅨ履? ?ㅽ뻾 濡쒓렇 -->
        <section class="scenario-log" style="display:flex;flex-direction:column">
          <div class="scenario-log-head">
            <h3>遺꾩꽍 ?ㅽ뻾${isRunning
              ? ` <span class="gi-chip-state run" style="font-size:11px;animation:gi-blink 1.2s infinite">?ㅽ뻾以?/span>`
              : ""}</h3>
            <div class="scenario-log-actions">
              <button class="btn" type="button"
                data-${ns}-run-step="${escapeHtml(aCase.caseId)}:all"
                ${isRunning ? "disabled" : ""}>
                ${isRunning ? "???ㅽ뻾以?.." : "?꾩껜 ?ㅽ뻾"}
              </button>
              <button class="btn secondary" type="button"
                data-${ns}-rerun-step="${escapeHtml(aCase.caseId)}:clear">寃곌낵 吏?곌린</button>
            </div>
          </div>
          <div class="gi-log-list scenario-step-accordion scenario-ai-results"
               style="margin-top:10px;flex:1;overflow-y:auto">
            ${logRows || `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">
              ?ㅽ뻾 踰꾪듉???뚮윭 ?쒕굹由ъ삤瑜??쒖옉?섏꽭??</div>`}
          </div>
        </section>

      </div>
    </section>`;
}


