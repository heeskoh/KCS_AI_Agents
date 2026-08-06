import { escapeHtml } from "../core/dom.js";

const COACH_PROMPT_PLACEHOLDER = "자연어로 질문을 입력하면 선택된 데이터 소스에 따라 AI가 답변을 제공합니다.\n기본은 LLM 자체 답변이며, 내부정보를 활용하실 때에는 하단의 데이터 소스나 AI 서비스를 선택해 주세요.";

// 2026-08 개편: 하단 업무 바로가기·대시보드 슬라이드·AI 작업 캔버스 제거.
// 우측 컬럼은 전문 업무영역 진입 카드(AI 기업조사관·AI 수사관·표준보고서 지원)로 구성,
// 관리자 진입은 상단 메뉴 오른쪽 끝(tbAdminBtn)으로 이동.
// 카드 아이콘 — 파스텔 단색 스트로크 SVG (색상은 CSS .work-card-icon 카드 클래스별 지정)
const WORK_CARDS = [
  { className: "sky",    page: "investigation", href: "/static/investigator.html", label: "AI 기업조사관",
    desc: "관세조사 대상 기업의 위험분석부터 조사보고서까지 AI가 지원합니다.",
    icon: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M8 7h1M8 11h1M8 15h1M12 7h0.5M12 11h0.5"/><circle cx="16.5" cy="16.5" r="3.2"/><line x1="18.9" y1="18.9" x2="21.5" y2="21.5"/></svg>` },
  { className: "rose",   page: "generalinv",    href: "/static/detective.html", label: "AI 수사관",
    desc: "사건·우범자 정보를 기반으로 관세수사 업무를 AI가 지원합니다.",
    icon: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="8.5 11.5 11 14 15.5 9.5"/></svg>` },
  { className: "purple", page: "report",        href: "/static/report-support.html", label: "표준보고서 지원",
    desc: "표준 서식에 맞춘 보고서 작성과 검증을 AI가 지원합니다.",
    icon: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>` },
];

function workCard(item, state){
  const locked = state !== "granted";
  // href가 있으면 별도 사이트로 이동(예: AI 기업조사관 → investigator.html), 없으면 SPA 페이지 전환
  const navAttr = item.href ? `data-nav-href="${escapeHtml(item.href)}"` : `data-page="${escapeHtml(item.page)}"`;
  return `
    <button class="home-work-card special-analysis-btn ${escapeHtml(item.className)}${locked ? " locked" : ""}"
            ${locked ? "disabled" : navAttr} type="button"
            title="${escapeHtml(item.label)}${locked ? " · 권한이 없습니다" : ""}">
      <span class="work-card-icon" aria-hidden="true">${item.icon}</span>
      <span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.desc)}</small>
      </span>
    </button>`;
}

// 좌측 채팅 패널 — 일반적인 AI Chat UI 구성: 새 채팅·바로가기(AI 어시스턴트/AI 분석서비스)·채팅 이력.
// 이력 목록은 렌더 후 런타임(homeRenderChatHistory)이 localStorage에서 채운다.
function chatSidePanel(){
  return `
    <aside class="card home-chat-side home-col-card" aria-label="채팅 패널">
      <button class="chat-side-new" id="homeNewChatBtn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        새 채팅
      </button>
      <div class="chat-side-label">바로가기</div>
      <button class="chat-side-item" data-chat-shortcut="assistant" type="button" title="AI 어시스턴트">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        AI 어시스턴트
      </button>
      <button class="chat-side-item" data-chat-shortcut="services" type="button" title="AI 분석서비스">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        AI 분석서비스
      </button>
      <div class="chat-side-label">채팅 이력</div>
      <div class="chat-side-history" id="homeChatHistoryList">
        <div class="chat-side-empty">아직 채팅 이력이 없습니다.</div>
      </div>
    </aside>
  `;
}

export function homePage({ shortcutState = () => "granted" } = {}){
  return `
    <div class="home-layout">
    <div class="home-focus-grid">
      ${chatSidePanel()}
      <div class="home-col-resizer" data-col-resize="left" title="드래그하여 크기 조절" role="separator" aria-orientation="vertical"></div>
      <section class="home-analysis-card home-col-card">

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

        <!-- 동적 영역(스크롤): 수행 흐름(각 서비스 카드에 전용 입력 폼 인라인 포함). 하단 컴포저는 항상 고정 -->
        <div class="home-dynamic-area">
          <!-- 선택 서비스별 프롬프트 템플릿 구성 패널 (동적 렌더) -->
          <div id="homePromptTemplatePanels"></div>

          <!-- AI 통합분석 결과 (하단 AI실행 결과) — 수행 흐름 아래, 평소엔 숨김 -->
          <div class="home-result-area" id="homeResultArea">
            <div class="summary-box markdown-output" id="homeResultBox" style="display:none"></div>
            <div class="home-analysis-detail" id="homeAnalysisDetail" style="display:none"></div>
          </div>
        </div>

        <!-- 컴포저 (프롬프트 입력 + 버튼) -->
        <div class="home-composer">
          <textarea id="coachPrompt" class="home-composer-ta is-initial" rows="3"
            data-initial-text="${escapeHtml(COACH_PROMPT_PLACEHOLDER)}">${escapeHtml(COACH_PROMPT_PLACEHOLDER)}</textarea>
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
            <button class="btn-soft home-tool-btn home-llm-mode-btn" type="button"
                    data-home-llm-mode data-llm-mode="ext_int" title="LLM 사용 모드 전환 (외부 / 내부 / 외부+내부)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
              <span class="home-llm-mode-label">외부LLM+내부LLM</span>
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

      <div class="home-col-resizer" data-col-resize="right" title="드래그하여 크기 조절" role="separator" aria-orientation="vertical"></div>
      <section class="card home-worknav-card home-col-card">
        <button class="worknav-toggle" data-worknav-toggle type="button" title="전문 업무 접기" aria-label="전문 업무 접기">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <h3>전문 업무</h3>
        <p class="worknav-copy">전문 업무영역으로 이동하여 AI 분석을 수행합니다.</p>
        <div class="home-work-list">
          ${WORK_CARDS.map(item => workCard(item, shortcutState(item.page))).join("")}
        </div>
        <button class="worknav-rail" data-worknav-toggle type="button" title="전문 업무 펼치기" aria-label="전문 업무 펼치기">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          전문 업무
        </button>
      </section>
    </div>
    </div>
  `;
}
