/* 업무영역 별도 사이트 공통 플랫폼 셸 + 좌측 Copilot형 채팅 패널.
   AI 조사관(investigator.html)·AI 수사관(detective.html)·표준보고서 지원(report-support.html)이
   공유하는 셸로, 관세행정 Copilot과 동일 기능(의도분석 자동 라우팅 → 내부 AI 서비스 실행 →
   LLM 폴백)을 홈/Copilot 코드와 분리된 독립 사본으로 구현한다.
   공용 유틸(runChatIntent·streamLlmText)만 공유하고 상태·DOM·바인딩은 이 모듈 전용이다. */
import { escapeHtml, markdownToHtml } from "../core/dom.js";
import { runChatIntent } from "../analysis/shared/chat-agent-run.js";
import { streamLlmText } from "../analysis/shared/llm-stream.js";
import { siteConfig } from "../core-engine/platform-sites.js";

const GREET_COPY = "원하는 분석 업무를 자연어로 설명해보세요. AI가 의도를 파악해 필요한 업무지식베이스와 AI 서비스를 자동 선택하여 분석합니다.";
const INPUT_PLACEHOLDER = "질문을 입력하세요. AI가 의도를 파악해 업무지식베이스와 AI 서비스를 자동 선택하여 분석합니다.";
const HISTORY_CAP = 50;
const ATTACH_TOTAL_LIMIT = 24 * 1024;   // GET 한도와 무관(POST)이나 프롬프트 비대화 방지

const threadsByUser = {};   // { userId: message[] } — 세션 내 유지(재렌더에도 보존)
let attachedFiles = [];     // { name, content }
let draftText = "";         // 서브탭 이동 재렌더 시 입력 중 텍스트 보존
let panelMode = "chat";     // "chat" | "case" — Case 패턴분석 지원 사이트(수사관)의 좌측 패널 모드
let evidenceSearchOn = false;          // 증거내 검색 모드(수사관) — 등록 증거·기초정보 대상 지능형 검색
let evidenceContextProvider = null;    // app-runtime이 주입 — 등록된 증거·기초정보 컨텍스트 문자열 반환

/* app-runtime(관세수사 스테이지)이 증거·기초정보 컨텍스트 공급자를 등록한다 */
export function setEvidenceContextProvider(fn){
  evidenceContextProvider = fn;
}

const EVIDENCE_INPUT_PLACEHOLDER = "등록된 증거·기초정보에서 검색할 내용을 입력하세요. (예: 홍콩 송금 관련 진술)";

function buildEvidenceSearchPrompt(userText){
  const context = (evidenceContextProvider && evidenceContextProvider()) || "";
  return `당신은 관세청 수사 지원 AI입니다. 아래 [수사 자료]는 이 사건에 등록된 증거·접견/신문 기록·기초데이터 분석 결과입니다.
질문과 관련된 내용을 자료에서 지능형 검색하여, 출처(자료명)를 밝히며 한국어 개조식으로 답하십시오.
자료에 없는 내용은 "자료 없음"으로 표시하고 지어내지 마십시오.

[수사 자료]
${context || "(등록된 자료 없음)"}

[검색 질문]
${userText}`;
}

/* Case 패턴분석 가이드 항목 — 칩 클릭 시 "라벨: " 형태로 입력창에 삽입 */
const CASE_GUIDE_FIELDS = ["사건유형", "대상국가", "대상품목", "수사관"];
const CASE_INPUT_PLACEHOLDER = "예: 사건유형 밀수입, 대상국가 중국, 대상품목 의류 — 유사 사건 패턴을 분석합니다.";

function casePatternPrompt(text){
  return `[Case 패턴분석 요청] 아래 조건과 유사한 과거 수사 사건들의 패턴을 분석해줘.
수법·대상품목·대상국가·경로·처리결과의 공통 패턴과 시사점을 중심으로 정리할 것.
[조건]
${text}`;
}

function thread(userId){
  return threadsByUser[userId] || (threadsByUser[userId] = []);
}

function bubbleHtml(message){
  const role = message.role === "user" ? "user" : "assistant";
  const body = role === "user"
    ? escapeHtml(message.text).replace(/\n/g, "<br>")
    : markdownToHtml(message.text || "");
  return `
    <div class="chat-bubble ${role}">
      <div class="chat-bubble-body markdown-output">${body}</div>
    </div>
  `;
}

function chipsHtml(){
  return attachedFiles.map((f, i) => `
    <span class="inv-copilot-chip">
      ${escapeHtml(f.name)}
      <i data-inv-chip-remove="${i}" title="첨부 제거">×</i>
    </span>`).join("");
}

export function invCopilotPanelHtml({ userId = "", userName = "" } = {}){
  const messages = thread(userId);
  const withCaseSearch = siteConfig().caseSearch === true;
  const caseMode = withCaseSearch && panelMode === "case";
  return `
    <aside class="inv-copilot-panel" id="invCopilotPanel">
      <div class="inv-copilot-greet">
        <h2>
          <span class="inv-copilot-greet-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </span>
          안녕하세요${userName ? `, ${escapeHtml(userName)}님` : ""}
        </h2>
        <p>${escapeHtml(GREET_COPY)}</p>
      </div>
      ${withCaseSearch ? `
      <div class="inv-copilot-modes" role="tablist">
        <button class="inv-copilot-mode${caseMode ? "" : " active"}" data-inv-mode="chat" type="button" role="tab" aria-selected="${!caseMode}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          AI Chat
        </button>
        <button class="inv-copilot-mode${caseMode ? " active" : ""}" data-inv-mode="case" type="button" role="tab" aria-selected="${caseMode}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Case 패턴분석
        </button>
      </div>` : ""}
      <div class="inv-copilot-list" data-inv-chat-list>
        ${messages.map(bubbleHtml).join("")}
      </div>
      ${withCaseSearch ? `
      <div class="inv-case-guide" data-inv-case-guide ${caseMode ? "" : "hidden"}>
        <strong>Case 패턴분석 가이드</strong>
        <p>아래 항목을 조합해 조건을 입력하면 과거 유사 사건의 수법·품목·국가 패턴을 분석합니다.</p>
        <div class="inv-case-guide-chips">
          ${CASE_GUIDE_FIELDS.map(field => `<button type="button" data-inv-guide-chip="${escapeHtml(field)}">${escapeHtml(field)}</button>`).join("")}
          <span class="inv-case-guide-etc">등</span>
        </div>
      </div>` : ""}
      <div class="inv-copilot-composer">
        <textarea data-inv-chat-input rows="3" placeholder="${escapeHtml(caseMode ? CASE_INPUT_PLACEHOLDER : INPUT_PLACEHOLDER)}">${escapeHtml(draftText)}</textarea>
        <div class="inv-copilot-bar">
          <label class="inv-copilot-attach" title="파일 첨부">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            파일첨부
            <input type="file" data-inv-chat-file multiple accept=".txt,.md,.csv,.json,.html,.xml" style="display:none">
          </label>
          <div class="inv-copilot-chips" data-inv-chat-chips>${chipsHtml()}</div>
          ${withCaseSearch ? `
          <button type="button" class="inv-copilot-evsearch${evidenceSearchOn ? " active" : ""}" data-inv-ev-search
            title="등록된 증거·기초정보 내 지능형 검색">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            증거내 검색
          </button>` : ""}
          <button type="button" class="inv-copilot-send" data-inv-chat-send>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            실행
          </button>
        </div>
      </div>
    </aside>
  `;
}

/* 플랫폼 셸 — 좌측 AI 조사관 채팅 + 우측 업무 콘텐츠 */
export function invPlatformShell(contentHtml, user = {}){
  return `
    <div class="inv-platform-layout">
      ${invCopilotPanelHtml(user)}
      <div class="inv-platform-main">${contentHtml}</div>
    </div>
  `;
}

/* 플랫폼 메뉴용 데모 페이지 — 덤핑관리 / 납세도움정보 */
export function dumpingPageHtml(){
  return `
    <div class="inv-platform-page">
      <section class="card">
        <h2>덤핑관리</h2>
        <p class="muted">저가신고·덤핑 의심 신호를 모니터링하고 조사 대상을 관리합니다.</p>
        <div class="empty-state">덤핑 의심 수입신고 모니터링 대시보드가 여기에 구성됩니다. (데모 준비 중)</div>
      </section>
    </div>
  `;
}

export function taxHelpPageHtml(){
  return `
    <div class="inv-platform-page">
      <section class="card">
        <h2>납세도움정보</h2>
        <p class="muted">납세자 안내·성실신고 지원 정보를 제공합니다.</p>
        <div class="empty-state">납세도움정보 콘텐츠가 여기에 구성됩니다. (데모 준비 중)</div>
      </section>
    </div>
  `;
}

function attachmentBlock(){
  if(!attachedFiles.length) return "";
  return "\n\n" + attachedFiles
    .map(f => `[첨부파일: ${f.name}]\n${f.content}`)
    .join("\n\n");
}

function buildFallbackPrompt(messages, userText){
  const site = siteConfig();
  const history = messages
    .slice(-9, -1)   // 방금 질문 제외 최근 4왕복
    .map(m => `${m.role === "user" ? "사용자" : "AI"}: ${String(m.text).slice(0, 400)}`)
    .join("\n");
  return `당신은 ${site.role}입니다. ${site.scope} 관점에서 한국어로 간결하고 정확하게 답하세요.
${history ? `\n[최근 대화]\n${history}\n` : ""}
[사용자 질문]
${userText}${attachmentBlock()}`;
}

/* 렌더 후 바인딩 — app-runtime render()에서 플랫폼 페이지일 때 호출 */
export function initInvCopilot({ userId = "", companyId = "" } = {}){
  const root = document.getElementById("invCopilotPanel");
  if(!root) return;

  /* ── Case 패턴분석 모드 (AI 수사관): 탭 전환 + 가이드 칩 ── */
  const guide = root.querySelector("[data-inv-case-guide]");
  if(guide){
    const promptInput = root.querySelector("[data-inv-chat-input]");
    root.querySelectorAll("[data-inv-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        panelMode = btn.dataset.invMode;
        const caseMode = panelMode === "case";
        root.querySelectorAll("[data-inv-mode]").forEach(b => {
          b.classList.toggle("active", b.dataset.invMode === panelMode);
          b.setAttribute("aria-selected", b.dataset.invMode === panelMode);
        });
        guide.hidden = !caseMode;
        if(promptInput){
          promptInput.placeholder = caseMode ? CASE_INPUT_PLACEHOLDER : INPUT_PLACEHOLDER;
          promptInput.focus();
        }
      });
    });
    // 가이드 칩 클릭 → "항목: " 을 입력창에 삽입
    guide.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-inv-guide-chip]");
      if(!chip || !promptInput) return;
      const token = `${chip.dataset.invGuideChip}: `;
      promptInput.value = promptInput.value
        ? `${promptInput.value.replace(/\s+$/, "")}\n${token}`
        : token;
      draftText = promptInput.value;
      promptInput.focus();
    });
  }
  const list = root.querySelector("[data-inv-chat-list]");
  const input = root.querySelector("[data-inv-chat-input]");
  const send = root.querySelector("[data-inv-chat-send]");
  const fileInput = root.querySelector("[data-inv-chat-file]");
  const chips = root.querySelector("[data-inv-chat-chips]");
  if(!list || !input || !send) return;
  const messages = thread(userId);
  let streaming = false;

  const scrollBottom = () => { list.scrollTop = list.scrollHeight; };
  scrollBottom();

  const renderChips = () => { if(chips) chips.innerHTML = chipsHtml(); };

  input.addEventListener("input", () => { draftText = input.value; });

  fileInput?.addEventListener("change", async () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = "";
    let used = attachedFiles.reduce((sum, f) => sum + f.content.length, 0);
    for(const file of files){
      let content = "";
      try{ content = await file.text(); }catch(e){ continue; }
      content = content.slice(0, Math.max(0, ATTACH_TOTAL_LIMIT - used));
      if(!content){ alert(`첨부 용량 한도(24KB)를 초과하여 "${file.name}"을(를) 제외했습니다.`); continue; }
      used += content.length;
      attachedFiles.push({ name: file.name, content });
    }
    renderChips();
  });

  chips?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-inv-chip-remove]");
    if(!remove) return;
    attachedFiles.splice(Number(remove.dataset.invChipRemove), 1);
    renderChips();
  });

  // 증거내 검색 토글 — 켜면 등록 증거·기초정보 대상 지능형 검색으로 실행된다
  const evSearchBtn = root.querySelector("[data-inv-ev-search]");
  evSearchBtn?.addEventListener("click", () => {
    evidenceSearchOn = !evidenceSearchOn;
    evSearchBtn.classList.toggle("active", evidenceSearchOn);
    input.placeholder = evidenceSearchOn ? EVIDENCE_INPUT_PLACEHOLDER
      : (panelMode === "case" && siteConfig().caseSearch ? CASE_INPUT_PLACEHOLDER : INPUT_PLACEHOLDER);
    input.focus();
  });

  const appendBubble = (message) => {
    list.insertAdjacentHTML("beforeend", bubbleHtml(message));
    scrollBottom();
    return list.lastElementChild;
  };

  const submit = async () => {
    const text = String(input.value || "").trim();
    if(!text || streaming) return;
    streaming = true;
    send.disabled = true;
    input.value = "";
    draftText = "";
    const userMessage = { role: "user", text, at: Date.now() };
    messages.push(userMessage);
    appendBubble(userMessage);
    const assistantEl = appendBubble({ role: "assistant", text: "..." });
    const bodyEl = assistantEl.querySelector(".chat-bubble-body");
    const paint = acc => { if(bodyEl){ bodyEl.innerHTML = markdownToHtml(acc); scrollBottom(); } };

    // Case 패턴분석 모드: 조건 입력을 유사 사건 패턴분석 요청으로 프레이밍(버블에는 원문 표시)
    const effective = (panelMode === "case" && siteConfig().caseSearch) ? casePatternPrompt(text) : text;

    let answer = "";
    if(evidenceSearchOn && siteConfig().caseSearch){
      // 증거내 검색 모드 — 등록된 증거·접견 기록·기초정보 컨텍스트에서 지능형 검색
      answer = await streamLlmText(buildEvidenceSearchPrompt(text), { mode: "int", onToken: paint });
    }else{
      // Copilot과 동일 흐름 — ① 의도분석으로 내부 AI 서비스 자동 실행
      try{
        const res = await runChatIntent(effective + attachmentBlock(), {
          companyId, targetType: "company", llmMode: "ext_int", onToken: paint,
        });
        if(res?.handled) answer = res.text || "";
      }catch(e){ /* 폴백 진행 */ }
      // ② 내부 서비스 해당 없음 → 일반 LLM 답변 폴백
      if(!answer){
        answer = await streamLlmText(buildFallbackPrompt(messages, effective), { mode: "ext_int", onToken: paint });
      }
    }
    const finalText = answer || "응답을 받지 못했습니다. 잠시 후 다시 시도하세요.";
    if(bodyEl) bodyEl.innerHTML = markdownToHtml(finalText);
    messages.push({ role: "assistant", text: finalText, at: Date.now() });
    while(messages.length > HISTORY_CAP) messages.shift();
    attachedFiles = [];
    renderChips();
    streaming = false;
    send.disabled = false;
    scrollBottom();
  };

  send.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if(event.key === "Enter" && !event.shiftKey && !event.isComposing){
      event.preventDefault();
      submit();
    }
  });
}
