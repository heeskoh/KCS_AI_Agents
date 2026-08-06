/* "수사분석 워크벤치" 탭 — 2단 구조. 중앙은 관세조사 정보분석 워크벤치와 동일한
   AI정보분석 워크벤치(분석 관점 A~E 시각화)를 공유한다.
   (AI 대화는 사이트 좌측 공통 AI Chat 패널이 담당하므로 워크벤치 내 대화창은 두지 않는다)
   좌(확대): 상위 탭 2종 — [AI정보분석 시각화](관점 A~E + 단서 타임라인, customs/insight-viz.js 공용)
       / [관계망 분석](메인 '관계망 분석'과 동일한 KCS_Investigation.html 임베드)
   우: 수집된 정보 그룹핑 카드(수사단서 문서·기초자료·AI 분석결과·프로파일 요약)
   카드 클릭 시 좌측 공통 AI Chat 입력에 인용 삽입. */
import { escapeHtml } from "../../core/dom.js";
import { generalInvestigationState } from "./state.js";
import { crimeSummary } from "./crime-taxonomy.js";
import { leadTypeById, leadDocLabel, leadTimelineHtml } from "./leads.js";
import { insightVizHtml } from "../customs/insight-viz.js";
import { PERSPECTIVES, downloadCurrentViz } from "../customs/insight.js";

/* ── 우측: 수집 정보 그룹 ────────────────────────────────────────── */
export function giInsightGroups(deps, aCase){
  const leads = (aCase.leads || []).map(lead => ({
    id: lead.id,
    title: `${leadTypeById(lead.type).icon} ${lead.title || leadDocLabel(lead)}`,
    meta: `${leadDocLabel(lead)}${lead.grade ? ` · ${lead.grade}급` : ""} · ${lead.confirmed ? "확정" : "작성중"}`,
    text: String(lead.draft || lead.content || "").slice(0, 400),
  }));
  const files = (deps.getUploadedFilesByCompany?.(aCase.companyId) || []).map(file => ({
    id: file.id,
    title: `📄 ${file.name}`,
    meta: file.type || "등록 파일",
    text: Array.isArray(file.extracted) ? file.extracted.join(", ").slice(0, 300) : "",
  }));
  const externals = (aCase.externalRequests || []).map(request => ({
    id: request.id,
    title: `📮 ${request.kind} 자료요청`,
    meta: `${request.target || ""} · ${request.status || "접수됨"}`,
    text: "",
  }));
  const steps = aCase.giSteps || [];
  const results = steps
    .filter(step => (aCase.stepResults || {})[step.id])
    .map(step => ({
      id: step.id,
      title: `🤖 ${step.label}`,
      meta: (aCase.stepStates || {})[step.id] === "done" ? "완료" : "결과 있음",
      text: String(aCase.stepResults[step.id]).slice(0, 400),
    }));
  const profileItems = [];
  if(aCase.targetType === "person"){
    profileItems.push({ id: "pf1", title: `👤 ${aCase.targetName}`, meta: `위험등급 ${aCase.personRiskLevel || "-"} · ${aCase.personNationality || "-"}`,
      text: `위험점수 ${aCase.personRiskScore ?? "-"} · 유형 ${aCase.personProfileType || "-"}` });
  } else {
    const company = (deps.getScenarioCompanies?.() || []).find(c => c.company_id === aCase.companyId);
    if(company) profileItems.push({ id: "pf1", title: `🏢 ${company.company_name || aCase.companyId}`,
      meta: `위험등급 ${company.risk_level || "-"} · 위험점수 ${company.risk_score ?? "-"}`,
      text: `연간수입액 ${company.annual_import_amount ?? "-"} · 신고관세 ${company.declared_duty_amount ?? "-"}` });
  }
  return [
    { id: "leads",   title: "수사단서 문서", items: leads },
    { id: "data",    title: "기초자료·외부요청", items: [...files, ...externals] },
    { id: "results", title: "AI 분석결과", items: results },
    { id: "profile", title: "프로파일 요약", items: profileItems },
  ];
}

export function giInsightGroupsHtml(deps, aCase){
  const open = generalInvestigationState.insightGroupsOpen;
  return giInsightGroups(deps, aCase).map(group => {
    const isOpen = open[group.id] !== false;   // 기본 펼침
    return `
      <section class="gi-insight-group${isOpen ? " open" : ""}">
        <button type="button" class="gi-insight-group-head" data-gi-insight-group="${escapeHtml(group.id)}">
          <strong>${escapeHtml(group.title)}</strong>
          <span>${group.items.length}건</span>
          <i>${isOpen ? "▾" : "▸"}</i>
        </button>
        ${isOpen ? `
          <div class="gi-insight-group-body">
            ${group.items.length ? group.items.map(item => `
              <button type="button" class="gi-insight-card" data-gi-insight-cite="${escapeHtml(`[${item.title.replace(/^[^ ]+ /, "")}] ${item.text || item.meta || ""}`.slice(0, 240))}"
                title="클릭하면 좌측 AI Chat 입력에 인용됩니다">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.meta || "")}</span>
                ${item.text ? `<p>${escapeHtml(item.text.slice(0, 120))}${item.text.length > 120 ? "…" : ""}</p>` : ""}
              </button>
            `).join("") : `<div class="gi-insight-empty">항목 없음</div>`}
          </div>
        ` : ""}
      </section>
    `;
  }).join("");
}

/* ── 렌더: 3단 레이아웃 ─────────────────────────────────────────── */
/* 시각화에 반영할 대상(기업 프로파일 또는 인물 폴백) */
function vizTargetOf(deps, aCase){
  if(aCase.targetType === "person"){
    return { company_id: aCase.personId || aCase.caseId, company_name: aCase.targetName };
  }
  return (deps.getScenarioCompanies?.() || []).find(c => c.company_id === aCase.companyId)
    || { company_id: aCase.companyId, company_name: aCase.targetName };
}

export function renderInsightPanel(deps){
  const aCase = deps.activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">진행중인 수사에서 사건을 먼저 선택하세요.</div>`;
  // 중앙 상위 탭: AI정보분석 시각화 / 관계망 분석(메인 '관계망 분석' 화면과 동일)
  const centerTab = generalInvestigationState.insightCenterTab === "network" ? "network" : "viz";
  const cardsCollapsed = !!generalInvestigationState.insightCardsCollapsed;
  // 시각화 뷰: 분석 관점 A~E(관세조사와 공용 워크벤치) + 단서 타임라인
  const stored = generalInvestigationState.insightView;
  const view = (stored === "leads" || PERSPECTIVES.some(p => p.id === stored)) ? stored : "A";
  const persp = PERSPECTIVES.find(p => p.id === view);
  const vizHtml = view === "leads"
    ? `<div class="gi-insight-leads-view">${leadTimelineHtml(aCase, generalInvestigationState.activeLeadId)}</div>`
    : insightVizHtml(view, vizTargetOf(deps, aCase));
  return `
    <div class="gi-insight-page">
      <div class="gi-insight-head">
        <div>
          <strong>수사분석 워크벤치</strong>
          <p class="muted">사건 정보·수집 자료를 근거로 분석 시각화를 확인합니다. 우측 카드를 클릭하면 좌측 AI Chat에 인용됩니다.</p>
        </div>
        <div class="gi-insight-target">
          <span class="muted">사건</span>
          <b>${escapeHtml(aCase.caseId)} · ${escapeHtml(aCase.targetName)}</b>
          <small>${escapeHtml(crimeSummary(aCase.crimes) || "혐의 미지정")}</small>
        </div>
      </div>
      <div class="gi-insight-layout">
        <section class="gi-insight-center-col">
          <div class="gi-insight-col-head gi-insight-center-tabs">
            <button type="button" class="gi-insight-center-tab${centerTab === "viz" ? " active" : ""}"
              data-gi-insight-center="viz">AI정보분석 시각화</button>
            <button type="button" class="gi-insight-center-tab${centerTab === "network" ? " active" : ""}"
              data-gi-insight-center="network" title="메인 '관계망 분석' 화면 — 폐쇄망 관계망 분석 플랫폼">관계망 분석</button>
            ${centerTab === "viz" && persp ? `<button type="button" class="btn secondary ci-viz-download" data-gi-viz-download
              style="margin-left:auto" title="현재 시각화를 PNG 이미지로 저장">⬇ 이미지 저장</button>` : ""}
            ${centerTab === "network" ? `<button type="button" class="gi-insight-maximize-btn" data-gi-net-maximize
              title="관계망 분석을 전체화면으로 보기">⛶</button>` : ""}
          </div>
          ${centerTab === "viz" ? `
            <div class="gi-insight-view-tabs ci-insight-persp-tabs">
              ${PERSPECTIVES.map(p => `
                <button type="button" class="gi-insight-view-tab${p.id === view ? " active" : ""}"
                  data-gi-insight-view="${p.id}" title="${escapeHtml(p.desc)}">${escapeHtml(p.label)}</button>
              `).join("")}
              <button type="button" class="gi-insight-view-tab${view === "leads" ? " active" : ""}" data-gi-insight-view="leads">단서 타임라인</button>
            </div>
            <div class="gi-insight-center-body">${vizHtml}</div>
          ` : `
            <div class="gi-insight-center-body gi-insight-net-body">
              <iframe src="/KCS_Investigation.html" title="관계망 분석" class="gi-insight-net-frame"></iframe>
            </div>
          `}
        </section>
        <div class="resize-gutter x" data-resize-target="next" data-resize-min="260" title="드래그하여 좌·우 영역 크기 조절"
          ${cardsCollapsed ? `style="display:none"` : ""}></div>
        <aside class="gi-insight-cards-col${cardsCollapsed ? " collapsed" : ""}">
          <button type="button" class="gi-insight-collapsed-bar" data-gi-insight-expand="cards" title="펼치기">
            <span class="cbar-arrow">◀</span><span class="cbar-label">수집된 정보</span>
          </button>
          <div class="gi-insight-col-head">
            <strong>수집된 정보</strong>
            <button type="button" class="gi-insight-collapse-btn" data-gi-insight-collapse="cards" title="접기">▶</button>
          </div>
          <div class="gi-insight-groups">${giInsightGroupsHtml(deps, aCase)}</div>
        </aside>
      </div>
    </div>
  `;
}

/* 렌더 후 훅 — 시각화 저장·관계망 전체화면 바인딩 (app-runtime postRender에서 호출) */
export function bindGiInsightChat(deps){
  const aCase = deps.activeGenInvCase?.();
  if(!aCase) return;
  // 이미지 저장 — 현재 관점의 시각화를 PNG로 다운로드 (관세조사 워크벤치 공용 로직)
  document.querySelector("[data-gi-viz-download]")?.addEventListener("click", () => {
    const view = generalInvestigationState.insightView || "A";
    downloadCurrentViz(view, aCase.companyId || aCase.personId || aCase.caseId);
  });

  // 관계망 분석 전체화면 — 브라우저 전체화면 API로 iframe을 확대(미지원 시 CSS 전체화면 폴백)
  document.querySelector("[data-gi-net-maximize]")?.addEventListener("click", () => {
    const body = document.querySelector(".gi-insight-net-body");
    if(!body) return;
    if(document.fullscreenElement){ document.exitFullscreen?.(); return; }
    if(body.requestFullscreen){
      body.requestFullscreen().catch(() => body.classList.toggle("is-maximized"));
    } else {
      body.classList.toggle("is-maximized");   // Fullscreen API 미지원 브라우저
    }
  });
}

export const insightSubtab = {
  id: "insight",
  label: "수사분석 워크벤치",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["network", "db_cdw"],
  render: renderInsightPanel,
};
