import { profileNetworkLayout } from "../shared/network-graph.js";

export function renderProfilePanel(deps){
  const companyId = deps.getActiveCanvasCompanyId?.();
  if(!companyId) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  // 좌측 기업 프로파일 대시보드 + 우측 Neo4j 관계망 분석 (일반/마약/외환 프로파일과 동일 레이아웃)
  return profileNetworkLayout(deps.canvasProfilePanel(), "company", companyId);
}

export const profileSubtab = {
  id: "profile",
  // 관세조사는 기업 단위(개인 대상 없음) — 관리자/런타임 공통 "기업조사 프로파일"
  label: "기업조사 프로파일",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
