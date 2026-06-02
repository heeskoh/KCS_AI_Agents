export function renderDataPanel(deps){
  return deps.panels.drugDataPanel();
}

export const dataSubtab = {
  id: "data",
  label: "기초자료 수집/등록",
  showWhen: context => !!context.case,
  aiServices: ["ocr", "rag_create", "db_cdw"],
  render: renderDataPanel,
};
