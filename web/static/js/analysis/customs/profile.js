import { escapeHtml } from "../../core/dom.js";
import { profileNetworkLayout } from "../shared/network-graph.js";
import { CRIME_TAXONOMY, CRIME_PROFILE_EMPHASIS } from "../general-investigation/crime-taxonomy.js";

/* 기업 프로파일의 혐의 유형(crime_types: "관세포탈,가격조작" 등)을 관세수사와 동일한
   혐의 체계(CRIME_TAXONOMY)로 해석한다 — 관세조사·관세수사의 관세포탈죄는 동일 내용이므로
   같은 대분류·죄명·중점 확인 지표를 공유한다. */
function crimesFromCompany(company){
  const tokens = String((company && company.crime_types) || "")
    .split(/[,·/\s]+/).map(t => t.trim()).filter(Boolean);
  if(!tokens.length) return null;
  const offenses = [];
  let category = null;
  CRIME_TAXONOMY.forEach(cat => cat.offenses.forEach(off => {
    if(tokens.some(t => off.label.includes(t)) && !offenses.some(o => o.id === off.id)){
      offenses.push(off);
      if(!category) category = cat;
    }
  }));
  return offenses.length ? { category, offenses } : null;
}

/* 혐의 뱃지 스트립 — 관세수사 기업 프로파일과 동일한 구성(대분류·죄명 칩 + 중점 확인 지표) */
function crimeStripHtml(company){
  const crimes = crimesFromCompany(company);
  if(!crimes) return "";
  const emphasis = CRIME_PROFILE_EMPHASIS[crimes.category.id] || [];
  return `
    <div class="gi-profile-crime-strip">
      <span class="gi-crime-chip">${escapeHtml(crimes.category.label)}</span>
      ${crimes.offenses.map(o => `<span class="gi-crime-offense-chip">${escapeHtml(o.label)}</span>`).join("")}
      ${emphasis.length ? `<span class="gi-profile-emphasis">중점 확인: ${emphasis.map(tag => `<b>${escapeHtml(tag)}</b>`).join(" · ")}</span>` : ""}
    </div>
  `;
}

export function renderProfilePanel(deps){
  const companyId = deps.getActiveCanvasCompanyId?.();
  if(!companyId) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  // 혐의 배너(관세수사와 동일) + 좌측 기업 프로파일 대시보드 + 우측 Neo4j 관계망 분석
  // (관계망의 위험구성 원인분석·요인별 검증 차트는 공용 컴포넌트라 그대로 적용된다)
  const detail = deps.getCompanyDetail?.(companyId);
  const strip = crimeStripHtml(detail && detail.company);
  return strip + profileNetworkLayout(deps.canvasProfilePanel(), "company", companyId);
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
