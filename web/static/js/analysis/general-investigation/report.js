/* 관세수사 "분석 보고서 및 검증" — 3단 구조.
   좌: 단계별 수사보고서 목록(수사단서 문서 이력 + 최종 수사보고서)
   중: 선택된 수사보고서 — 표준 문서 형식(문서 헤더 표 + 본문)
   우: 보고서 검증(최종 수사보고서 AI 검증 / 단서 문서는 확정 상태)
   탭 자체 헤더 행은 페이지 헤더와 중복이므로 두지 않는다. */
import { escapeHtml, markdownToHtml, renderValidationDashboard } from "../../core/dom.js";
import { generalInvestigationState } from "./state.js";
import { leadTypeById, leadDocLabel, leadDraftEditorHtml } from "./leads.js";

/* 날짜 표기 — epoch(ms)·ISO 문자열 모두 "YYYY. M. D." 형태로 */
function fmtDate(value){
  if(value == null || value === "") return "";
  const n = Number(value);
  const d = Number.isFinite(n) && String(value).trim().match(/^\d+$/) ? new Date(n) : new Date(value);
  if(Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("ko-KR");
}

/* 좌측 목록: 작성된 수사단서 문서(등록순) + 최종 수사보고서 */
function reportDocs(aCase){
  // 초안 생성 중(autoDrafting)인 단서도 목록에 표시 — 백그라운드 생성 진행을 이 탭에서 확인
  const docs = (aCase.leads || [])
    .filter(lead => lead.draft || lead.content || lead.autoDrafting)
    .map(lead => ({
      id: `lead:${lead.id}`,
      kind: "lead",
      lead,
      icon: leadTypeById(lead.type).icon || "📄",
      title: lead.title || leadDocLabel(lead),
      docLabel: leadDocLabel(lead),
      status: lead.confirmed ? "확정" : lead.autoDrafting ? "초안 생성 중" : "작성중",
      date: lead.confirmedAt || lead.createdAt || "",
    }));
  docs.push({ id: "final", kind: "final", icon: "📑", title: "수사 보고서 (AI 종합)", docLabel: "최종 수사보고서" });
  return docs;
}

function selectedDoc(aCase){
  const docs = reportDocs(aCase);
  const savedId = generalInvestigationState.giReportDocId;
  return docs.find(d => d.id === savedId) || docs[docs.length - 1];   // 기본: 최종 수사보고서
}

/* 표준 문서 형식 — 문서 헤더 표(사건·대상·작성·상태) + 본문 */
function standardDocHtml(aCase, rows, bodyHtml){
  const rowHtml = rows
    .filter(([, value]) => value !== "" && value != null)
    .map(([label, value]) => `
      <div class="gi-doc-row"><span>${escapeHtml(label)}</span><b>${value}</b></div>
    `).join("");
  return `
    <div class="gi-doc-frame">
      <div class="gi-doc-head">
        ${rowHtml}
      </div>
      <div class="gi-doc-body markdown-output">${bodyHtml}</div>
      <div class="gi-doc-foot">관세청 조사국 · ${escapeHtml(aCase.caseId)}</div>
    </div>
  `;
}

export function renderReportPanel(deps){
  const aCase = deps.activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const steps   = deps.activeGiCaseSteps();
  const states  = aCase.stepStates  || {};
  const results = aCase.stepResults || {};

  // 템플릿 기반(gi_rep/gi_appr)과 혐의 매트릭스 자동세팅(canonical key) 모두 지원
  const repStep  = steps.find(s => s.key === "gi_rep"  || s.key === "report_generate" || s.sourceKey === "report_generate");
  const apprStep = steps.find(s => s.key === "gi_appr" || s.key === "report_validate" || s.sourceKey === "report_validate");
  const repDone  = !!(repStep  && states[repStep.id]  === "done");
  const apprDone = !!(apprStep && states[apprStep.id] === "done");
  const repText  = repStep  ? (results[repStep.id]  || "") : "";
  const apprText = apprStep ? (results[apprStep.id] || "") : "";

  const docs = reportDocs(aCase);
  const doc = selectedDoc(aCase);

  /* ── 좌: 단계별 수사보고서 목록 ── */
  const finalStatus = apprDone ? "검증 완료" : repDone ? "작성 완료" : "미작성";
  const listHtml = docs.map(item => {
    const status = item.kind === "final" ? finalStatus : item.status;
    const stateCls = status === "확정" || status === "검증 완료" ? "done" : status === "미작성" ? "wait" : "run";
    return `
      <button type="button" class="gi-report3-item${item.id === doc.id ? " active" : ""}" data-gi-report-doc="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.icon)} ${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.docLabel)}${item.date ? ` · ${escapeHtml(fmtDate(item.date))}` : ""}</span>
        <em class="gi-chip-state ${stateCls}">${escapeHtml(status)}</em>
      </button>
    `;
  }).join("");

  /* ── 중: 선택된 문서 (표준 형식) ── */
  let docTitle, docActions = "", docBody;
  if(doc.kind === "final"){
    docTitle = "수사 보고서";
    docActions = repStep ? (repDone
      ? `<button class="btn secondary" style="height:26px;padding:0 10px;font-size:11px" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(repStep.id)}">↺ 재작성</button>`
      : `<button class="btn" style="height:26px;padding:0 10px;font-size:11px" data-gi-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(repStep.id)}">▶ 보고서 작성 실행</button>`) : "";
    const bodyHtml = markdownToHtml(deps.ensureReportRequiredSections(repDone ? repText : "", "general", { targetName: aCase.targetName }));
    docBody = standardDocHtml(aCase, [
      ["문서", "최종 수사보고서"],
      ["수사 대상", `${escapeHtml(aCase.targetName)} (${escapeHtml(aCase.companyId || aCase.personId || "-")})`],
      ["작성", repDone ? "AI 초안 생성 완료" : "미작성 — 서식만 표시"],
      ["검증", apprDone ? "AI 검증 완료" : "미검증"],
    ], bodyHtml);
  } else {
    // 단서 문서: 확정 전에는 이 탭에서 본문 편집·AI 초안 재생성·확정까지 수행한다
    // ('진행중인 수사' 탭은 단서 등록·이력만 담당).
    const lead = doc.lead;
    docTitle = doc.docLabel;
    const text = lead.draft || lead.content || "";
    const headRows = [
      ["문서", escapeHtml(doc.docLabel)],
      ["제목", escapeHtml(lead.title || "-")],
      ["수사 대상", `${escapeHtml(aCase.targetName)} (${escapeHtml(aCase.companyId || aCase.personId || "-")})`],
      ["작성자", escapeHtml(lead.author || "-")],
      ["작성일", escapeHtml(fmtDate(lead.createdAt))],
      ["등급", lead.grade ? `${escapeHtml(lead.grade)}급` : ""],
      ["상태", lead.confirmed ? `확정 (${escapeHtml(fmtDate(lead.confirmedAt))})`
              : lead.autoDrafting ? "AI 초안 생성 중" : "작성중"],
    ];
    docBody = lead.confirmed
      ? standardDocHtml(aCase, headRows, markdownToHtml(text))
      : standardDocHtml(aCase, headRows,
          (lead.autoDrafting && !text
            ? `<div class="gi-report3-empty"><span class="home-running-dot"></span>
                 <p><b>AI가 ${escapeHtml(doc.docLabel)} 초안을 생성하고 있습니다.</b></p>
                 <p>등록한 단서 내용을 근거로 초안을 작성 중입니다 — 완료되면 이 화면에 자동 표시됩니다.</p></div>`
            : "")
          + leadDraftEditorHtml(lead, generalInvestigationState.leadDraftStreaming, { compact: true }));
  }

  /* ── 우: 보고서 검증 ── */
  let validActions = "", validBody;
  if(doc.kind === "final"){
    validActions = apprStep ? (apprDone
      ? `<button class="btn secondary" style="height:26px;padding:0 10px;font-size:11px" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(apprStep.id)}">↺ 재검증</button>`
      : `<button class="btn" style="height:26px;padding:0 10px;font-size:11px" data-gi-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(apprStep.id)}" ${!repDone ? "disabled title='보고서 작성 후 실행 가능'" : ""}>▶ 검증 실행</button>`) : "";
    validBody = apprDone ? renderValidationDashboard(apprText) : `
      <div class="gi-report3-empty">
        <span style="font-size:30px;opacity:.25">🧪</span>
        <p><b>보고서 검증 미실행</b></p>
        <p>보고서 작성 후 검증을 실행하면<br>근거·일관성 검증 결과가 표시됩니다.</p>
      </div>`;
  } else {
    const lead = doc.lead;
    validBody = `
      <div class="gi-report3-empty">
        <span style="font-size:30px;opacity:.25">${lead.confirmed ? "✅" : "📝"}</span>
        <p><b>${lead.confirmed ? "확정된 단서 문서" : "작성중인 단서 문서"}</b></p>
        <p>${lead.confirmed
          ? `${escapeHtml(fmtDate(lead.confirmedAt))} 확정 — 수사기록에 편철되었습니다.`
          : "'진행중인 수사' 탭에서 편집·확정할 수 있습니다."}</p>
        <p class="muted" style="font-size:11px">AI 보고서 검증은 최종 수사보고서에 대해 수행됩니다.</p>
      </div>`;
  }

  return `
    <div class="gi-report3">
      <aside class="gi-report3-col">
        <div class="gi-insight-col-head"><strong>단계별 수사보고서</strong><span class="muted" style="font-size:11px">${docs.length}건</span></div>
        <div class="gi-report3-list">${listHtml}</div>
      </aside>
      <div class="resize-gutter x" data-resize-min="200" title="드래그하여 보고서 목록 폭 조절"></div>
      <section class="gi-report3-col">
        <div class="gi-insight-col-head"><strong>${escapeHtml(docTitle)}</strong><span style="margin-left:auto;display:flex;gap:6px">${docActions}</span></div>
        <div class="gi-report3-doc">${docBody}</div>
      </section>
      <div class="resize-gutter x" data-resize-target="next" data-resize-min="260" title="드래그하여 보고서·검증 영역 폭 조절"></div>
      <aside class="gi-report3-col">
        <div class="gi-insight-col-head"><strong>보고서 검증</strong><span style="margin-left:auto;display:flex;gap:6px">${validActions}</span></div>
        <div class="gi-report3-valid">${validBody}</div>
      </aside>
    </div>
  `;
}

export const reportSubtab = {
  id: "report",
  label: "분석 보고서 및 검증",
  enabledWhen: context => !!context.case,
  aiServices: ["report_generate", "report_validate", "mail_share"],
  render: renderReportPanel,
};
