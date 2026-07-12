import { escapeHtml } from "../../core/dom.js";
import { profileNetworkLayout } from "../shared/network-graph.js";
import { CRIME_TAXONOMY, CRIME_PROFILE_EMPHASIS, profileGraphTypeForCrimes } from "../general-investigation/crime-taxonomy.js";

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
function crimeStripHtml(crimes){
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
  // 혐의 배너(관세수사와 동일) + 좌측 기업 프로파일 대시보드 + 우측 Neo4j 관계망 분석.
  // 프로파일 그래프는 죄명 기준으로 공유/분리한다: 관세포탈(c1 관세수입 침해)은 관세수사와
  // 같은 프로파일(공용 스코프)을 공유하고, 그 외 죄명은 crime-{categoryId} 스코프로 분리되어
  // 죄명이 달라졌을 때 변경분이 서로 잘못 적용되지 않는다(profileGraphTypeForCrimes 참조).
  const detail = deps.getCompanyDetail?.(companyId);
  const crimes = crimesFromCompany(detail && detail.company);
  const strip = crimeStripHtml(crimes);
  return strip + profileNetworkLayout(
    deps.canvasProfilePanel(), profileGraphTypeForCrimes(crimes && crimes.category.id), companyId);
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
