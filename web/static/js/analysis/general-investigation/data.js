export function renderDataPanel(deps){
  const aCase = deps.activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const type = deps.genInvTypeById(aCase.invTypeId);
  const caseBadge = `${type.num} ${type.label} · ${aCase.caseId}`;
  /* 기업/개인 구분 없이 동일한 패널 — subjectName으로 수사 대상명 직접 표시 */
  return deps.canvasDataPanel(deps.getActiveCanvasCompanyId(), {
    selectedLabel: aCase.targetType === "company" ? "수사 대상 기업" : "수사 대상 개인",
    subjectName:   aCase.targetName,
    heading:       "기초자료 수집/등록",
    description:   "수사 대상 관련 서류, 계약서, 수입신고 자료, 금융거래 내역 등을 업로드합니다.",
    caseBadge,
  });
}

export const dataSubtab = {
  id: "data",
  label: "기초자료 수집/등록",
  enabledWhen: context => !!context.case,
  aiServices: ["ocr", "rag_create", "db_cdw"],
  render: renderDataPanel,
};
