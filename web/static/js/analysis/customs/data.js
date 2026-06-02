export function renderDataPanel(deps){
  return deps.panels.canvasDataPanel(deps.getActiveCanvasCompanyId(), {
    selectedLabel: "조사 대상 기업",
    heading: "기초자료 수집/등록",
    description: "관세조사 대상 기업의 서류, 계약서, 수입신고 자료 등을 업로드합니다.",
  });
}
