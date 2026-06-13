export function renderDataPanel(deps){
  if(!deps.getActiveCanvasCompanyId?.()) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  return deps.canvasDataPanel(deps.getActiveCanvasCompanyId(), {
    selectedLabel: "조사 대상 기업",
    heading: "기초자료 수집/등록",
    description: "관세조사 대상 기업의 서류, 계약서, 수입신고 자료 등을 업로드합니다.",
  });
}

export const dataSubtab = {
  id: "data",
  label: "기초자료 수집/등록",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["ocr", "rag_create", "db_cdw"],
  render: renderDataPanel,
};
