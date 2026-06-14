// 마약·외환수사 분석 시나리오 템플릿 편집 서브탭.
// 관세조사와 동일한 편집기(scenarioTemplatePanel)를 특수수사 도메인으로 재사용한다.
// 빌트인(d1~d5) 편집은 조직 관리자만 가능(편집기 내부에서 게이팅).
export function renderTemplatesPanel(deps){
  // 외환수사(fxsearch)는 전용 fx 템플릿, 마약수사(lawsearch)는 drug 템플릿을 편집한다.
  const domain = deps.getCurrentPage?.() === "fxsearch" ? "fx" : "drug";
  return deps.scenarioTemplatePanel(domain);
}

export const templatesSubtab = {
  id: "templates",
  label: "분석 시나리오 템플릿",
  group: "tools",
  aiServices: [],
  render: renderTemplatesPanel,
};
