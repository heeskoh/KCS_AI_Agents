import { profileNetworkLayout } from "../shared/network-graph.js";

export function renderProfilePanel(deps){
  const companyId = deps.getActiveCanvasCompanyId?.();
  if(!companyId) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  // 좌측 기업 프로파일 대시보드 + 우측 Neo4j 관계망 분석 (일반/마약/외환 프로파일과 동일 레이아웃)
  return profileNetworkLayout(deps.canvasProfilePanel(), "company", companyId);
}

export const profileSubtab = {
  id: "profile",
  label: "기업프로파일",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
