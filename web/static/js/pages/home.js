import { escapeHtml } from "../core/dom.js";
import { DEFAULT_ANALYSIS_BUTTONS } from "../analysis/shared/scenario-builder-config.js";

const COACH_PROMPT_PLACEHOLDER = "자연어로 질문을 입력하면 선택된 데이터 소스에 따라 AI가 답변을 제공합니다.\n기본은 LLM 자체 답변이며, 내부정보를 활용하실 때에는 하단의 데이터 소스나 AI 서비스를 선택해 주세요.";

const SPECIAL_ANALYSIS_BUTTONS = [
  { className: "red", page: "profile", label: "기업 위험도 대시보드" },
  { className: "sky", page: "investigation", label: "관세 조사 분석" },
  { className: "rose", page: "generalinv", label: "일반 수사 분석" },
  { className: "purple", page: "lawsearch", label: "마약 수사 분석" },
  { className: "teal", page: "fxsearch", label: "외환 수사 분석" },
  { className: "olive", page: "case", label: "국제 정보분석" },
  { className: "lime", page: "model", label: "관세 온톨로지" },
  { className: "brown", page: "report", label: "Case별 RAG" },
];

function specialAnalysisButtons(buttons = SPECIAL_ANALYSIS_BUTTONS){
  return buttons
    .map(button => `<button class="special-analysis-btn ${escapeHtml(button.className)}" data-page="${escapeHtml(button.page)}">${escapeHtml(button.label)}</button>`)
    .join("");
}

export function homePage({ activeAnalysisJobs, mainCanvasJob, isSuperAdmin = () => false, analysisButtons = DEFAULT_ANALYSIS_BUTTONS }){
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
        <div class="home-file-chips coach-file-chips" id="coachFileChips"></div>

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

      <aside class="card home-special-card">
        <h3>전문 업무 분석</h3>
        <div class="special-analysis-list">
          ${specialAnalysisButtons(analysisButtons)}
        </div>
        ${isSuperAdmin() ? `<button class="home-shutdown-btn" data-super-scenario-builder type="button">업무시나리오 구성</button>` : ""}
        <button class="home-shutdown-btn" id="shutdownAllBtn" type="button">모든 서버 종료 하기</button>
      </aside>
    </div>
    </div>
  `;
}
