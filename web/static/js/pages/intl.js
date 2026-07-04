import { escapeHtml } from "../core/dom.js";

/**
 * pages/intl.js — 국제정보 분석 페이지
 *
 * My AI 분석(home)과 동일한 구성으로 시작하는 독립 사본.
 * (pages/home.js 를 import 하지 않고 별도 소스로 유지 — 향후 국제정보
 *  전용 기능으로 점진 변경하기 위함)
 *
 * 좌측: My AI 분석과 동일한 chat 카드 (결과 영역 + 인사말 + 코칭 패널 +
 *       파일첨부/업무지식베이스/AI 분석 서비스/AI코칭/실행 컴포저)
 *       — 요소 ID를 home 과 동일하게 유지해 기존 코칭·실행 로직이 그대로 동작한다.
 * 우측: 프롬프트 템플릿 카드 목록. 카드를 선택하면 좌측 입력창에 등록된다.
 */

const INTL_PROMPT_PLACEHOLDER = "WCO 관련 질문을 자연어로 입력하세요. 오른쪽 프롬프트 템플릿을 선택해도 됩니다.\n내부정보를 활용하실 때에는 하단의 데이터 소스나 AI 서비스를 선택해 주세요.";

export const INTL_PROMPT_TEMPLATES = [
  { title:"HS 개정 영향 분석",   desc:"최신 HS 개정사항의 국내 영향 품목", prompt:"WCO 최신 HS 개정사항 중 국내 수출입 영향이 큰 품목을 분석해줘" },
  { title:"마약 관련 결의문",     desc:"최신 결의문 요약과 국내 조치사항", prompt:"WCO 마약 관련 최신 결의문 내용을 요약하고 국내 조치사항을 알려줘" },
  { title:"원산지 규정 결정사항", desc:"분과위원회 결정 중 한-미 무역 영향", prompt:"WCO 원산지 규정 분과위원회 결정사항 중 한-미 무역에 영향을 주는 것은?" },
  { title:"SAFE Framework 개정",  desc:"최신 개정 내용 정리", prompt:"WCO SAFE Framework 최신 개정 내용을 정리해줘" },
  { title:"AEO 상호인정협정",     desc:"MRA 현황과 국내 활용 방안", prompt:"WCO AEO 상호인정협정 현황과 국내 활용 방안을 알려줘" },
];

function templateCard(t){
  return `
    <button type="button" class="intl-template-card" data-intl-template="${escapeHtml(t.prompt)}">
      <strong>${escapeHtml(t.title)}</strong>
      <small>${escapeHtml(t.desc)}</small>
      <span>${escapeHtml(t.prompt)}</span>
    </button>
  `;
}

export function intlInfoPageHtml(){
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <h1 id="homeGreetingText">국제정보 분석</h1>
          </div>
          <p>WCO 회의 결과와 분과위원회 결정사항을 기반으로 국내 수출입 품목과 연관된 분석을 제공합니다. 내부자료를 검색하거나 AI 분석서비스를 활용하려면 아래 버튼에서 선택하세요.</p>
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
          <textarea id="coachPrompt" class="home-composer-ta is-initial" rows="3"
            data-initial-text="${escapeHtml(INTL_PROMPT_PLACEHOLDER)}">${escapeHtml(INTL_PROMPT_PLACEHOLDER)}</textarea>
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

      <section class="card home-canvas-card home-col-card">
        <h3>프롬프트 템플릿</h3>
        <p class="canvas-main-copy">자주 사용하는 WCO 분석 질문입니다. 카드를 선택하면 왼쪽 입력창에 등록됩니다.</p>
        <div class="main-job-list intl-template-list">
          ${INTL_PROMPT_TEMPLATES.map(templateCard).join("")}
        </div>
      </section>
    </div>
    </div>
  `;
}
