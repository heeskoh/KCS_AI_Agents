import { escapeHtml, markdownToHtml } from "../../core/dom.js";

export function renderReportPanel(deps){
  const aCase = deps.activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const ctx = deps.drugCaseContext(aCase);
  const targetSummary = ctx.targetType === "company"
    ? `${ctx.targetName}의 전구물질 수입, 특송 분산, 해외 공급망, 실화주 불일치 위험을 중심으로 분석합니다.`
    : `${ctx.targetName}의 고위험국 이동, 소량 반복 수령, 은어/SNS, 분산송금 단서를 중심으로 분석합니다.`;
  const reportDraft = deps.getLatestReport() || `
### ${ctx.targetName} 마약수사 분석 요약

- 대상 유형: ${ctx.label}
- 사건 번호: ${ctx.case.caseId}
- 수사 유형: ${ctx.type.label}
- 핵심 판단: ${targetSummary}
- 권고 조치: CDW 조회 결과와 관계망·압수증거 단서를 병합하여 검사/추적 우선순위를 지정합니다.
`;
  const validation = deps.getLatestValidation() || `
- 대상 식별자와 프로파일 유형이 일치합니다.
- 마약수사 중심 위험지표가 보고서에 반영되어 있습니다.
- 추가 확인 필요: 물리 감정 결과, 국제공조 회신, 자금거래 원천자료.
`;
  return deps.commonAnalysisReportPanel({
    selectedLabel: ctx.label,
    targetText: `${escapeHtml(ctx.targetName)} <span class="muted" style="font-size:12px">${escapeHtml(ctx.case.caseId)}</span>`,
    badgeHtml: `<span class="gi-type-chip ${ctx.type.cls}">${ctx.type.num} ${escapeHtml(ctx.type.label)}</span>`,
    reportTitle: "분석 보고서",
    validationTitle: "보고서 검증",
    reportHtml: markdownToHtml(deps.ensureReportRequiredSections(reportDraft, "drug", { targetName: ctx.targetName })),
    validationHtml: markdownToHtml(validation),
  });
}

export const reportSubtab = {
  id: "report",
  label: "분석보고서 및 검증",
  enabledWhen: context => !!context.case,
  aiServices: ["report_generate", "report_validate", "mail_share"],
  render: renderReportPanel,
};
