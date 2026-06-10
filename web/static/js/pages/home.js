import { escapeHtml } from "../core/dom.js";

const COACH_PROMPT_PLACEHOLDER = "자연어로 질문을 입력하면 선택된 데이터 소스에 따라 AI가 답변을 제공합니다.\n기본은 LLM 자체 답변이며, 내부정보를 활용하실 때에는 하단의 데이터 소스나 AI 서비스를 선택해 주세요.";

const WORK_SHORTCUTS = [
  { className: "sky", page: "investigation", label: "관세조사", image: "Customs_Aduit.png" },
  { className: "rose", page: "generalinv", label: "일반조사", image: "General_Inv.png" },
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

function bottomShortcutBar({ isSuperAdmin = () => false } = {}){
  const adminButton = isSuperAdmin()
    ? `<button class="home-image-shortcut home-admin-shortcut" data-super-scenario-builder type="button" title="관리자">${imageTag("Admin.png", "관리자")}<span>관리자</span></button>`
    : `<button class="home-image-shortcut home-admin-shortcut" data-page="system" type="button" title="관리자">${imageTag("Admin.png", "관리자")}<span>관리자</span></button>`;
  return `
    <nav class="home-bottom-shortcuts" aria-label="업무 분석 바로가기">
      <strong>업무 분석 바로가기</strong>
      <div class="home-bottom-shortcut-list">
        ${WORK_SHORTCUTS.map(shortcutButton).join("")}
        ${adminButton}
        <button class="home-image-shortcut home-exit-shortcut" id="shutdownAllBtn" type="button" title="종료">
          ${imageTag("Shutdown.png", "종료")}
          <span>종료</span>
        </button>
      </div>
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

export function homePage({ activeAnalysisJobs, mainCanvasJob, isSuperAdmin = () => false }){
  return `
    <div class="home-layout">
    <div class="home-focus-grid">
      <section class="card home-analysis-card home-col-card">
        <h3>My AI 분석</h3>

        <div class="coach-editor-wrap">
          <div class="coach-editor-hdr">
            <span>프롬프트 편집기</span>
            <span class="coach-char-count" id="coachCharCount">0자</span>
          </div>
          <textarea id="coachPrompt" class="coach-textarea" rows="4" placeholder="${escapeHtml(COACH_PROMPT_PLACEHOLDER)}"></textarea>
        </div>

        <div class="home-command-bar">
          <label class="home-tool-btn file-tool">
            <img class="home-tool-icon" src="/static/img/fileupload.png" alt="">
            <span>파일첨부</span>
            <input type="file" id="coachFileInput" multiple accept=".txt,.md,.csv,.json,.html,.xml,.pdf,.docx,.xlsx,.png,.jpg,.jpeg" style="display:none">
          </label>
          <button class="home-tool-btn" type="button" data-home-source="db_cdw"><span class="home-check off"></span>CDW조회</button>
          <button class="home-tool-btn" type="button" data-home-source="rag_customs"><span class="home-check off"></span>관세e음 RAG</button>
          <button class="home-tool-btn" type="button" data-home-agent="mail_share"><span class="home-check off"></span>분석결과공유</button>
          <button class="home-tool-btn home-picker-trigger" type="button" data-home-source="rag_audit">업무별 RAG 선택 <span class="home-select-status">×</span></button>
          <button class="home-tool-btn home-picker-trigger" type="button" data-home-agent="hs_verify">AI 서비스 선택 <span class="home-select-status">×</span></button>
          <div class="home-command-actions">
            <button class="home-action-btn coach" id="coachAnalyzeBtn" type="button"><img class="home-action-icon" src="/static/img/AICoaching.png" alt=""><b>AI코칭</b></button>
            <button class="home-action-btn improve coach-btn-improve" id="coachImproveBtn" type="button" style="display:none"><img class="home-action-icon" src="/static/img/implement.png" alt=""><b>개선 적용됨</b></button>
            <button class="home-action-btn reset coach-btn-reset" id="coachResetBtn" type="button" style="display:none"><img class="home-action-icon" src="/static/img/reset.png" alt=""><b>초기화</b></button>
            <button class="home-action-btn run home-run-btn" type="button"><img class="home-action-icon" src="/static/img/enter.png" alt=""><b>AI실행</b></button>
          </div>
        </div>
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
        <div class="home-file-chips coach-file-chips" id="coachFileChips"></div>
        <div class="home-file-link-panel">
          <div class="home-file-link-fields">
            <input id="coachFileLinkName" type="text" placeholder="문서명 또는 전자서고 제목">
            <input id="coachFileLinkUrl" type="url" placeholder="전자서고 파일 링크 또는 URL">
            <button class="btn secondary" type="button" data-coach-add-file-link>링크 추가</button>
          </div>
          <div class="home-file-link-chips" id="coachFileLinkChips"></div>
        </div>

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

        <div class="summary-box markdown-output" id="homeResultBox" style="display:none"></div>
        <div class="home-analysis-detail" id="homeAnalysisDetail" style="display:none"></div>
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
    ${bottomShortcutBar({ isSuperAdmin })}
    ${dashboardRail()}
    ${dashboardDrawer()}
    </div>
  `;
}
