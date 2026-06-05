import { escapeHtml, markdownToHtml } from "../../core/dom.js";

export function renderReportPanel(deps){
  const aCase = deps.activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const steps   = deps.activeGiCaseSteps();
  const states  = aCase.stepStates  || {};
  const results = aCase.stepResults || {};
  const type    = deps.genInvTypeById(aCase.invTypeId);

  /* 보고서 작성(gi_rep)·보고서 검증(gi_appr) 단계 찾기 */
  const repStep  = steps.find(s => s.key === "gi_rep");
  const apprStep = steps.find(s => s.key === "gi_appr");
  const repDone  = !!(repStep  && states[repStep.id]  === "done");
  const apprDone = !!(apprStep && states[apprStep.id] === "done");
  const repText  = repStep  ? (results[repStep.id]  || "") : "";
  const apprText = apprStep ? (results[apprStep.id] || "") : "";

  const placeholder = (label, tab) => `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:#94a3b8;text-align:center;padding:24px">
      <span style="font-size:36px;opacity:.25">📄</span>
      <p style="margin:0;font-size:13px;font-weight:600">${escapeHtml(label)} 미실행</p>
      <p style="margin:0;font-size:12px">'분석 시나리오 설정 및 수행' 탭에서<br>해당 단계를 실행하면 결과가 표시됩니다.</p>
      <button class="btn secondary" style="height:30px;padding:0 14px;font-size:12px" data-gi-tab="workbench">워크벤치로 이동</button>
    </div>`;

  /* 상태 배지 */
  const badge = apprDone
    ? `<span class="gi-chip-state done" style="margin-left:auto">보고서 완료</span>`
    : repDone
      ? `<span class="gi-chip-state run" style="margin-left:auto">검증 대기중</span>`
      : `<span class="gi-chip-state wait" style="margin-left:auto">보고서 미작성</span>`;

  /* 보고서 재실행 버튼 */
  const repActions = repStep ? `
    <div style="display:flex;gap:6px;align-items:center">
      <span style="font-size:12px;color:#64748b">${repDone ? "보고서 생성 완료" : "미실행"}</span>
      ${repDone
        ? `<button class="btn secondary" style="height:26px;padding:0 10px;font-size:11px" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(repStep.id)}">↺ 재작성</button>`
        : `<button class="btn" style="height:26px;padding:0 10px;font-size:11px" data-gi-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(repStep.id)}">▶ 실행</button>`}
    </div>` : "";

  const apprActions = apprStep ? `
    <div style="display:flex;gap:6px;align-items:center">
      <span style="font-size:12px;color:#64748b">${apprDone ? "검증 완료" : "미실행"}</span>
      ${apprDone
        ? `<button class="btn secondary" style="height:26px;padding:0 10px;font-size:11px" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(apprStep.id)}">↺ 재검증</button>`
        : `<button class="btn" style="height:26px;padding:0 10px;font-size:11px" data-gi-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(apprStep.id)}" ${!repDone ? "disabled title='보고서 작성 후 실행 가능'" : ""}>▶ 실행</button>`}
    </div>` : "";

  const reportHtml = repDone
    ? markdownToHtml(deps.ensureReportRequiredSections(repText, "general", { targetName: aCase.targetName }))
    : `${placeholder("보고서 작성(gi_rep)", "workbench")}
       <div class="report-required-preview">
         ${markdownToHtml(deps.ensureReportRequiredSections("", "general", { targetName: aCase.targetName }))}
       </div>`;
  const validationHtml = apprDone ? markdownToHtml(apprText) : placeholder("보고서 검증 AI 서비스(gi_appr)", "workbench");
  return deps.commonAnalysisReportPanel({
    selectedLabel: aCase.targetType === "company" ? "수사 대상 기업" : "수사 대상 개인",
    targetText: `${escapeHtml(aCase.targetName)} <span class="muted" style="font-size:12px">${escapeHtml(aCase.caseId)}</span>`,
    badgeHtml: `<span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>`,
    statusHtml: badge,
    reportTitle: "수사 보고서",
    validationTitle: "보고서 검증",
    reportHtml,
    validationHtml,
    reportActions: repActions,
    validationActions: apprActions,
  });
}

export const reportSubtab = {
  id: "report",
  label: "분석 보고서 및 검증",
  showWhen: context => !!context.case,
  aiServices: ["report_generate", "report_validate", "mail_share"],
  render: renderReportPanel,
};
