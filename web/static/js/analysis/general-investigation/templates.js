// 일반수사 분석 시나리오 템플릿 편집 서브탭.
// 관세조사와 동일한 편집기(scenarioTemplatePanel)를 일반수사 도메인으로 재사용한다.
// 빌트인(t1~t7) 편집은 조직 관리자만 가능(편집기 내부에서 게이팅).
export function renderTemplatesPanel(deps){
  return deps.scenarioTemplatePanel("general");
}

export const templatesSubtab = {
  id: "templates",
  label: "분석 시나리오 템플릿",
  group: "tools",
  aiServices: [],
  render: renderTemplatesPanel,
};
