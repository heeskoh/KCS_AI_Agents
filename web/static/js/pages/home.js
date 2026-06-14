import { escapeHtml } from "../core/dom.js";

const COACH_PROMPT_PLACEHOLDER = "자연어로 질문을 입력하면 선택된 데이터 소스에 따라 AI가 답변을 제공합니다.\n기본은 LLM 자체 답변이며, 내부정보를 활용하실 때에는 하단의 데이터 소스나 AI 서비스를 선택해 주세요.";

const WORK_SHORTCUTS = [
  { className: "sky", page: "investigation", label: "관세조사", image: "Customs_Aduit.png" },
  { className: "rose", page: "generalinv", label: "일반수사", image: "General_Inv.png" },
  { className: "purple", page: "lawsearch", label: "마약수사", image: "Drug_Inv.png" },
  { className: "teal", page: "fxsearch", label: "외환수사", image: "Foreigncash.png" },
  { className: "olive", page: "case", label: "국제정보", image: "Global.png" },
  { className: "lime", page: "model", label: "온톨로지", image: "Ontology.png" },
];

const DASHBOARD_SHORTCUTS = [
  { className: "red", page: "profile", label: "기업 대시보드", image: "CompanyDashborad.png", desc: "기업 위험도, 신고 추이, 이상 징후를 확인합니다." },
  { className: "rose", page: "generalinv", label: "우범자 대시보드", image: "CriminalP.png", desc: "우범자 프로파일과 일반수사 대상을 확인합니다." },
  { className: "purple", page: "lawsearch", label: "마약 대시보드", image: "Drug_dashboard.png", desc: "마약 위험 모니터링과 수사 대상을 확인합니다." },
  { className: "orange", page: "investigation", label: "덤핑 대시보드", image: "DumpingDashborad.png", desc: "저가신고, 덤핑 의심 신호를 중심으로 검토합니다." },
];

function imageTag(fileName, label){
  return `<img src="/static/img/${escapeHtml(fileName)}" alt="" onerror="this.style.display='none';this.closest('button')?.classList.add('image-missing')">`;
}

function shortcutButton(button){
  return `
    <button class="special-analysis-btn home-image-shortcut ${escapeHtml(button.className)}"
            data-page="${escapeHtml(button.page)}" type="button" title="${escapeHtml(button.label)}">
      ${imageTag(button.image, button.label)}
      <span>${escapeHtml(button.label)}</span>
    </button>
  `;
}

const NAV_ICONS = {
  investigation: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  generalinv:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  lawsearch:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 0 0 6.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 0 0 6.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>`,
  fxsearch:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  case:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  model:         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  system:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
};

function bnItem({ page, label, image, state = "granted", dataAttr = null }){
  const locked = state !== "granted";
  const attr = dataAttr || `data-page="${escapeHtml(page)}"`;
  return `
    <button class="bn-item${locked ? " locked" : ""}" ${locked ? "disabled" : attr} type="button"
            title="${escapeHtml(label)}${locked ? " · 권한이 없습니다" : ""}">
      ${imageTag(image, label)}
      <span>${escapeHtml(label)}</span>
      <i class="bn-state ${locked ? "off" : "on"}" aria-label="${locked ? "비활성" : "활성"}"></i>
    </button>`;
}

function bottomShortcutBar({ isSuperAdmin = () => false, shortcutState = () => "granted" } = {}){
  const adminButton = bnItem({
    page: "system", label: "관리자", image: "Admin.png",
    state: shortcutState("system"),
    dataAttr: isSuperAdmin() ? "data-super-scenario-builder" : `data-page="system"`,
  });
  return `
    <nav class="home-bottom-nav" aria-label="업무 분석 바로가기">
      <span class="bn-label">업무 바로가기</span>
      <div class="bn-items">
        ${WORK_SHORTCUTS.map(s => bnItem({ ...s, state: shortcutState(s.page) })).join("")}
        ${adminButton}
      </div>
      <button class="bn-exit" id="shutdownAllBtn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        종료
      </button>
    </nav>
  `;
}

function dashboardRail(){
  return `
    <button class="home-dashboard-rail-toggle" data-dashboard-open type="button" aria-expanded="false">
      대시보드
    </button>
  `;
}

function dashboardDrawer(){
  return `
    <div class="home-dashboard-backdrop" data-dashboard-close hidden></div>
    <aside class="home-dashboard-drawer" aria-label="대시보드 슬라이딩 윈도우" aria-hidden="true">
      <div class="home-dashboard-drawer-head">
        <div>
          <h3>대시보드</h3>
        </div>
        <button class="home-dashboard-close" data-dashboard-close type="button" aria-label="대시보드 닫기">×</button>
      </div>
      <div class="home-dashboard-drawer-body">
        ${DASHBOARD_SHORTCUTS.map(item => `
          <button class="home-dashboard-card special-analysis-btn ${escapeHtml(item.className)}"
                  data-page="${escapeHtml(item.page)}"
                  type="button">
            ${imageTag(item.image, item.label)}
            <span>
              <strong>${escapeHtml(item.label)}</strong>
              <small>${escapeHtml(item.desc)}</small>
            </span>
          </button>
        `).join("")}
      </div>
    </aside>
  `;
}

export function homePage({ activeAnalysisJobs, mainCanvasJob, isSuperAdmin = () => false, shortcutState = () => "granted" }){
  return `
    <div class="home-layout">
    <div class="home-focus-grid">
      <section class="home-analysis-card home-col-card">

        <!-- 결과 영역 (평소엔 숨김, 분석 후 표시) -->
        <div class="home-result-area" id="homeResultArea">
          <div class="summary-box markdown-output" id="homeResultBox" style="display:none"></div>
          <div class="home-analysis-detail" id="homeAnalysisDetail" style="display:none"></div>
        </div>

        <!-- 인사말 (결과 없을 때 표시) -->
        <div class="home-greeting" id="homeGreeting">
          <div class="home-greeting-row">
            <div class="home-greeting-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <h1 id="homeGreetingText">안녕하세요</h1>
          </div>
          <p>원하는 분석 업무를 자연어로 설명해보세요. 내부자료를 검색하거나 AI 분석서비스를 활용하려면 아래 버튼에서 선택하세요.</p>
        </div>

        <!-- 코칭 제안 패널 -->
        <div class="coach-sugg-panel" id="coachSuggPanel" style="display:none">
          <div class="coach-sugg-hdr">
            <span>실시간 제안</span>
            <span class="coach-sugg-badge" id="coachSuggBadge">0</span>
            <span class="coach-score-mini" id="coachScoreMini"></span>
            <span class="coach-engine-tag" id="coachEngineTag"></span>
            <button class="coach-sugg-toggle" id="coachSuggToggle" type="button" aria-expanded="true">접기</button>
          </div>
          <div class="coach-sugg-body" id="coachSuggBody"></div>
        </div>

        <!-- 첨부 파일 칩 -->
        <div class="home-file-chips coach-file-chips" id="coachFileChips"></div>

        <!-- 이메일 공유 패널 (숨김) -->
        <div class="home-mail-share-panel" id="homeMailSharePanel" style="display:none">
          <div class="home-mail-share-copy">
            <strong>분석결과 공유 AI 서비스</strong>
            <span>분석결과 보고서를 이메일로 공유합니다. 수신 이메일 ID를 1개 이상 등록하세요.</span>
          </div>
          <div class="home-mail-share-form">
            <input id="homeShareEmailInput" type="email" placeholder="예: officer@customs.go.kr">
            <button class="btn secondary" type="button" data-home-share-email-add>등록</button>
          </div>
          <div class="home-mail-share-chips" id="homeShareEmailChips"></div>
        </div>

        <!-- 컴포저 (프롬프트 입력 + 버튼) -->
        <div class="home-composer">
          <textarea id="coachPrompt" class="home-composer-ta" rows="3"
            placeholder="${escapeHtml(COACH_PROMPT_PLACEHOLDER)}"></textarea>
          <div class="home-composer-bar">
            <label class="btn-ghost home-tool-btn file-tool" title="파일 첨부">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <span>파일첨부</span>
              <input type="file" id="coachFileInput" multiple accept=".txt,.md,.csv,.json,.html,.xml,.pdf,.docx,.xlsx,.png,.jpg,.jpeg" style="display:none">
            </label>
            <button class="btn-soft home-tool-btn home-picker-trigger" type="button" data-home-source="rag_audit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              업무지식베이스
              <span class="home-select-badge" id="homeRagBadge" style="display:none"></span>
              <svg class="btn-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="btn-soft home-tool-btn home-picker-trigger" type="button" data-home-agent="hs_verify">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
              AI 분석 서비스
              <span class="home-select-badge" id="homeAgentBadge" style="display:none"></span>
              <svg class="btn-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="home-composer-actions">
              <button class="btn-ghost home-action-btn coach" id="coachAnalyzeBtn" type="button">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                AI코칭
              </button>
              <button class="btn-ghost home-action-btn improve coach-btn-improve" id="coachImproveBtn" type="button" style="display:none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                개선 적용됨
              </button>
              <button class="btn-ghost home-action-btn reset coach-btn-reset" id="coachResetBtn" type="button" style="display:none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.71"/></svg>
                초기화
              </button>
              <button class="btn-primary home-action-btn run home-run-btn" type="button">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                실행
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="card home-canvas-card home-col-card">
        <h3>AI 작업 캔버스</h3>
        <button class="btn secondary canvas-open-main" data-page="canvas" data-canvas-tab="overview">캔버스 열기</button>
        <p class="canvas-main-copy">다양한 데이터소스와 AI 서비스를 활용하여 나만의 분석을 수행합니다.</p>
        <div class="main-job-list">
          ${activeAnalysisJobs().map(mainCanvasJob).join("") || `<div class="empty-state">진행 중인 분석 작업이 없습니다. 아카이브에서 완료된 결과를 확인할 수 있습니다.</div>`}
        </div>
      </section>
    </div>
    ${bottomShortcutBar({ isSuperAdmin, shortcutState })}
    ${dashboardRail()}
    ${dashboardDrawer()}
    </div>
  `;
}
