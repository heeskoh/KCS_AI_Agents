/* ── 포털 전용 홈 셸 런타임 ─────────────────────────────────────────────
   app.js(포털 진입점)만 로드한다 — 업무영역 별도 사이트(investigator/detective/
   report-support)는 이 모듈을 로드하지 않는다(진입점별 로딩 분리).

   담당: 홈 좌측 채팅 패널(이력·새 채팅·바로가기), 홈 컬럼 레이아웃(폭 조절·전문
   업무 접기), 홈 전문 업무 카드의 별도 사이트 이동. 엔진(app-runtime)과는
   runtime-hooks("home-render"·"home-run-started") 구독과 소수의 export
   (render·openHomePicker·resetHomeRunState)로만 연결된다. */
import { escapeHtml, markdownToHtml } from "../core/dom.js";
import {
  AI_SERVICE_REGISTRY, ANALYSIS_AI_GROUP, DB_SEARCH_GROUP, EXTERNAL_AI_GROUP,
  LLM_SERVICE_GROUP, RAG_SEARCH_GROUP, REPORT_AI_GROUP,
  sidebarPermissionGroups, sourceDefaultBehaviors,
} from "../config/service-registry.js";
import { currentUserId, hasPermission, permissionLabel, permissionStatus } from "../core-engine/user-context.js";
import { openRunEventStream } from "../core-engine/sse-runner.js";
import { onHook } from "../core-engine/runtime-hooks.js";
import { composePrompt } from "../analysis/shared/prompt-composer.js";
import {
  render, cssString, uniqueByKey, requestPermissions, isCopilotMode,
  normalizeEmailIds, isValidEmailId, homeMountClarify,
} from "../app-runtime.js";

/* ── 홈 좌측 채팅 패널 — 채팅 이력(사용자별 localStorage)·새 채팅 ── */
const HOME_CHAT_HISTORY_KEY = "kcs_home_chat_history_v1";
const HOME_CHAT_HISTORY_MAX = 30;

function homeChatHistoryAll(){
  try{ return JSON.parse(localStorage.getItem(HOME_CHAT_HISTORY_KEY) || "{}") || {}; }catch(e){ return {}; }
}
function homeChatHistoryItems(){
  const list = homeChatHistoryAll()[currentUserId];
  return Array.isArray(list) ? list : [];
}
function homeChatHistorySave(list){
  const all = homeChatHistoryAll();
  all[currentUserId] = list.slice(0, HOME_CHAT_HISTORY_MAX);
  try{ localStorage.setItem(HOME_CHAT_HISTORY_KEY, JSON.stringify(all)); }catch(e){}
}
function homeChatHistoryRecord(prompt){
  const text = (prompt || "").trim();
  if(!text) return;
  // 같은 프롬프트 재실행은 최신 항목으로 끌어올린다
  const list = homeChatHistoryItems().filter(item => item.prompt !== text);
  list.unshift({ id: "ch" + Date.now().toString(36), prompt: text, ts: Date.now() });
  homeChatHistorySave(list);
  homeRenderChatHistory();
}
function homeChatHistoryTimeLabel(ts){
  const d = new Date(ts);
  if(Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if(ts >= startOfToday) return "오늘";
  if(ts >= startOfToday - dayMs) return "어제";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function homeRenderChatHistory(){
  const box = document.getElementById("homeChatHistoryList");
  if(!box) return;
  const list = homeChatHistoryItems();
  if(!list.length){
    box.innerHTML = `<div class="chat-side-empty">아직 채팅 이력이 없습니다.</div>`;
    return;
  }
  box.innerHTML = list.map(item => `
    <button class="chat-side-item chat-history-item" data-chat-history="${escapeHtml(item.id)}" type="button" title="${escapeHtml(item.prompt)}">
      <span class="chat-history-text">${escapeHtml(item.prompt)}</span>
      <span class="chat-history-time">${escapeHtml(homeChatHistoryTimeLabel(item.ts))}</span>
      <i class="chat-history-del" data-chat-history-del="${escapeHtml(item.id)}" title="이력 삭제" role="button">×</i>
    </button>`).join("");
}

function homeNewChat(){
  resetHomeRunState();   // 진행 중 스트림 종료·홈 실행 상태 초기화(엔진 담당)
  render("home");
  document.getElementById("coachPrompt")?.focus();
}

/* ── 홈 컬럼 레이아웃 — 좌/우 폭 드래그 조절·우측 전문 업무 접기 (localStorage 영속) ── */
const HOME_COL_LAYOUT_KEY = "kcs_home_col_layout_v1";
let homeColLayout = (() => {
  try{ return JSON.parse(localStorage.getItem(HOME_COL_LAYOUT_KEY) || "{}") || {}; }catch(e){ return {}; }
})();

function saveHomeColLayout(){
  try{ localStorage.setItem(HOME_COL_LAYOUT_KEY, JSON.stringify(homeColLayout)); }catch(e){}
}

function applyHomeColLayout(){
  // Copilot 단일 컬럼 UI(?copilot=1) — 컬럼 폭·접힘 미적용
  if(document.body.classList.contains("copilot-mode")) return;
  const grid = document.querySelector(".home-focus-grid");
  if(!grid) return;
  if(homeColLayout.left)  grid.style.setProperty("--home-col-left",  homeColLayout.left + "px");
  if(homeColLayout.right) grid.style.setProperty("--home-col-right", homeColLayout.right + "px");
  grid.classList.toggle("worknav-collapsed", homeColLayout.rightCollapsed === true);
}

document.addEventListener("mousedown", (event) => {
  const resizer = event.target.closest(".home-col-resizer");
  if(!resizer) return;
  const grid = resizer.closest(".home-focus-grid");
  if(!grid) return;
  const side = resizer.dataset.colResize;
  if(side === "right" && homeColLayout.rightCollapsed) return;
  event.preventDefault();
  const startX = event.clientX;
  const startLeft  = grid.querySelector(".home-chat-side")?.getBoundingClientRect().width || 225;
  const startRight = grid.querySelector(".home-worknav-card")?.getBoundingClientRect().width || 300;
  document.body.classList.add("col-resizing");
  const onMove = (e) => {
    const dx = e.clientX - startX;
    if(side === "left") homeColLayout.left  = Math.min(420, Math.max(150, Math.round(startLeft + dx)));
    else                homeColLayout.right = Math.min(560, Math.max(200, Math.round(startRight - dx)));
    applyHomeColLayout();
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.body.classList.remove("col-resizing");
    saveHomeColLayout();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

/* ── 홈 전용 클릭 핸들러 — 엔진의 공용 리스너와 독립(선택자 기준 서로 겹치지 않음) ── */
document.addEventListener("click", (event) => {
  /* 별도 사이트 이동 (예: AI 기업조사관 → investigator.html) */
  const navHrefBtn = event.target.closest("[data-nav-href]");
  if(navHrefBtn){
    location.href = navHrefBtn.dataset.navHref;
    return;
  }

  /* 우측 전문 업무 컬럼 접기/펼치기 */
  if(event.target.closest("[data-worknav-toggle]")){
    homeColLayout.rightCollapsed = !homeColLayout.rightCollapsed;
    saveHomeColLayout();
    applyHomeColLayout();
    return;
  }

  /* 좌측 채팅 패널: 새 채팅·바로가기·채팅 이력 */
  if(event.target.closest("#homeNewChatBtn")){ homeNewChat(); return; }

  const chatShortcut = event.target.closest("[data-chat-shortcut]");
  if(chatShortcut){
    if(chatShortcut.dataset.chatShortcut === "services"){ openHomePicker("agent"); return; }
    // AI 어시스턴트 — 프롬프트 입력창으로 포커스 이동(바로 대화 시작)
    document.getElementById("coachPrompt")?.focus();
    return;
  }

  const chatHistoryDel = event.target.closest("[data-chat-history-del]");
  if(chatHistoryDel){
    homeChatHistorySave(homeChatHistoryItems().filter(item => item.id !== chatHistoryDel.dataset.chatHistoryDel));
    homeRenderChatHistory();
    return;
  }

  const chatHistoryItem = event.target.closest("[data-chat-history]");
  if(chatHistoryItem){
    const item = homeChatHistoryItems().find(entry => entry.id === chatHistoryItem.dataset.chatHistory);
    const ta = document.getElementById("coachPrompt");
    if(item && ta){
      ta.value = item.prompt;
      ta.classList.remove("is-initial");
      ta.focus();
    }
  }
});

/* ── 엔진 훅 구독 ──
   home-render     — 홈/국제정보(case) 렌더 직후: 코치·컴포저 초기화 + 셸 갱신
   home-stop-runs  — 사용자 전환 등으로 실행 중단: 홈 SSE 스트림 종료 */
onHook("home-render", () => {
  coachInitHome();
  homeRenderShareEmailPanel();
  homeRenderChatHistory();
  applyHomeColLayout();
  copilotAdjustComposer();
});
onHook("home-stop-runs", () => {
  if(homeEventSource){ try{ homeEventSource.close(); }catch(e){ /* noop */ } homeEventSource = null; }
});

/* ══════════ 이하: app-runtime에서 이동한 코치 상태·컴포저 렌더·실행 파이프라인 ══════════ */

/* Copilot 모드: 홈 렌더 후 안내 문구를 자동 선택 방식에 맞게 교체 —
   업무지식베이스/AI 서비스 픽커는 숨겨지고 의도분석이 자동 선택한다. */
function copilotAdjustComposer(){
  if(!isCopilotMode) return;
  const greet = document.querySelector("#homeGreeting p");
  if(greet) greet.textContent = "원하는 분석 업무를 자연어로 설명해보세요. AI가 의도를 파악해 필요한 업무지식베이스와 AI 서비스를 자동 선택하여 분석합니다.";
  const ta = document.getElementById("coachPrompt");
  if(ta){
    const txt = "질문을 입력하세요. AI가 의도를 파악해 업무지식베이스와 AI 서비스를 자동 선택하여 분석합니다.";
    ta.dataset.initialText = txt;
    if(ta.classList.contains("is-initial")) ta.value = txt;
  }
}

/* ── 실시간 프롬프트 코치 상태 ── */
let coachSuggestions = [];
let coachBaseScore = 35;
let coachImprovedPrompt = "";
let coachOriginalPrompt = "";
let coachIsRunning = false;
let coachUploadSessionId = "";        // 백엔드 업로드 세션 ID
let coachAttachedFiles = [];          // [{ name, type, size, mime, encoding, content }] (content 로컬 캐시)
let coachFileLinks = [];              // [{ name, url, type, mime, encoding, size }]
let coachSuggestionsCollapsed = false;

const COACH_TEXT_EXT = /\.(txt|md|csv|json|html|htm|xml|log|tsv|sql|yaml|yml)$/i;
const COACH_MAX_TEXT_SIZE = 512 * 1024;  // 512KB 까지 텍스트로 읽음
const COACH_MAX_BINARY_SIZE = 12 * 1024 * 1024; // 서버 텍스트 추출용 base64 전송 한도

const COACH_TYPE_COLORS = {
  "추가":   { bg:"#e0ecff", tx:"#1e40af" },
  "누락":   { bg:"#fde7e7", tx:"#b91c1c" },
  "모호":   { bg:"#fef3c7", tx:"#92400e" },
  "미지정": { bg:"#fef3c7", tx:"#92400e" },
};

function coachEl(id){ return document.getElementById(id); }

/* 프롬프트 입력창은 초기 안내문(value + .is-initial)을 보여주다가 사용자가 포커스하면 비워진다.
   .is-initial 상태(아직 입력 전)는 실제 입력으로 보지 않는다. */
function coachPromptText(){
  const ta = document.getElementById("coachPrompt");
  if(!ta || ta.classList.contains("is-initial")) return "";
  return (ta.value || "").trim();
}

/* LLM 사용 모드 토글: 외부LLM only / 내부LLM only / 외부+내부 */
const HOME_LLM_MODES = [
  { mode: "ext",     label: "외부LLM only" },
  { mode: "int",     label: "내부LLM only" },
  { mode: "ext_int", label: "외부LLM+내부LLM" },
];
function homeLlmMode(){
  // 관세행정 Copilot은 항상 내부LLM only 모드로 동작(내부 서비스 자동 선택)
  if(isCopilotMode) return "int";
  return document.querySelector("[data-home-llm-mode]")?.dataset.llmMode || "ext_int";
}
function homeLlmModeReasoning(d){
  const map = { ext: "외부LLM", int: "내부LLM only(시뮬레이션)", ext_int: "외부LLM+내부LLM" };
  let label = map[(d && d.llm_mode) || homeLlmMode()] || "LLM 자체 답변";
  if(d && d.llm_model) label += `(${d.llm_model})`;
  const web = d && d.web_search_used ? "웹검색 반영" : (d && d.web_search_note ? d.web_search_note : "웹검색 미사용");
  return `${label} · ${web}`;
}

function coachSetScoreMini(n){
  const el = coachEl("coachScoreMini");
  if(!el) return;
  if(n === null || n === undefined){ el.textContent = ""; return; }
  const c = n >= 80 ? "var(--green)" : n >= 55 ? "var(--orange)" : "var(--red)";
  el.innerHTML = `점수 <b style="color:${c}">${Math.round(n)}/100</b>`;
}

const COACH_SOURCE_LABELS = {
  db_cdw:"CDW", company_profile:"기업 프로파일", rag_customs:"관세정보 RAG", rag_trade:"무역정보 RAG",
  rag_audit:"심사정보 RAG", rag_investigation:"조사정보 RAG", rag_global:"국제협력 RAG",
  rag_consultation:"상담내역 RAG", rag_risk_select:"위험선별 RAG",
};
const COACH_AGENT_LABELS = {
  ocr:"OCR", ml:"ML 위험모델", network:"관계망", ontology:"관세온톨로지",
  origin_analysis:"원산지분석", abnormal_trade:"이상거래검증",
  proceeds_tracking:"범죄수익추적", route_analysis:"운송경로분석", web:"웹수집요청",
  declaration_verify:"수입신고검증", hs_verify:"품목분류검증", customs_value:"과세가격평가",
  summary:"보고서요약", patent:"특허정보", rag_create:"업무특화RAG", law:"법령정보",
  report:"보고서생성", validate:"보고서검증", report_generate:"보고서생성", report_validate:"보고서검증",
};

function coachUsesHtml(uses){
  if(!uses || !uses.length) return "";
  const chips = uses.map(u => {
    const label = COACH_SOURCE_LABELS[u] || COACH_AGENT_LABELS[u] || u;
    const isAgent = !!COACH_AGENT_LABELS[u];
    return `<span class="coach-use-chip ${isAgent ? 'agent' : 'source'}">${escapeHtml(label)}</span>`;
  }).join("");
  return `<div class="coach-uses-row">활용: ${chips}</div>`;
}

function coachMakeCard(s){
  const colors = COACH_TYPE_COLORS[s.type] || COACH_TYPE_COLORS["미지정"];
  const d = document.createElement("div");
  d.id = "coach_card_" + s.id;
  d.className = "coach-sugg-card new-in";
  d.innerHTML = `
    <div class="coach-card-top">
      <span class="coach-type-badge" style="background:${colors.bg};color:${colors.tx}">${escapeHtml(s.type)}</span>
      <span class="coach-card-title">${escapeHtml(s.title || "")}</span>
      <span class="coach-score-tag">+${s.scoreGain || 0}</span>
    </div>
    <div class="coach-card-desc">${escapeHtml(s.desc || "")}</div>
    <div class="coach-ba-wrap">
      <div class="coach-ba-box"><div class="coach-ba-lbl">이전</div><div class="coach-ba-txt">${escapeHtml(s.before || "")}</div></div>
      <div class="coach-ba-arrow">→</div>
      <div class="coach-ba-box coach-ba-after"><div class="coach-ba-lbl">이후</div><div class="coach-ba-txt">${escapeHtml(s.after || "")}</div></div>
    </div>
    ${coachUsesHtml(s.uses)}
    ${s.trigPhrase ? `<div class="coach-trigger-hint">감지: "${escapeHtml(s.trigPhrase)}"</div>` : ""}
  `;
  return d;
}

function coachRefreshCards(){
  const body = coachEl("coachSuggBody");
  const panel = coachEl("coachSuggPanel");
  const badge = coachEl("coachSuggBadge");
  const toggle = coachEl("coachSuggToggle");
  const improveBtn = coachEl("coachImproveBtn");
  const resetBtn = coachEl("coachResetBtn");
  if(!body) return;

  body.innerHTML = "";
  if(coachSuggestions.length === 0){
    if(panel) panel.style.display = "none";
  } else {
    if(panel) panel.style.display = "block";
    coachSuggestions.forEach(s => body.appendChild(coachMakeCard(s)));
  }
  if(badge) badge.textContent = coachSuggestions.length;
  body.style.display = coachSuggestionsCollapsed ? "none" : "block";
  if(panel) panel.classList.toggle("collapsed", coachSuggestionsCollapsed);
  if(toggle){
    toggle.textContent = coachSuggestionsCollapsed ? "열기" : "접기";
    toggle.setAttribute("aria-expanded", coachSuggestionsCollapsed ? "false" : "true");
    toggle.style.display = coachSuggestions.length > 0 ? "inline-flex" : "none";
  }
  if(improveBtn) improveBtn.style.display = coachImprovedPrompt ? "inline-flex" : "none";
  if(resetBtn) resetBtn.style.display = (coachSuggestions.length > 0 || coachImprovedPrompt) ? "inline-flex" : "none";
}

function setHomeActionLabel(button, label){
  if(!button) return;
  const labelEl = button.querySelector("b");
  if(labelEl) labelEl.textContent = label;
  else button.textContent = label;
}

function coachImprove(){
  const ta = coachEl("coachPrompt");
  if(!ta || !coachImprovedPrompt) return;
  ta.value = coachImprovedPrompt;
  ta.classList.remove("is-initial");
  const cc = coachEl("coachCharCount");
  if(cc) cc.textContent = ta.value.length + "자";
  coachSetScoreMini(95);
  const improveBtn = coachEl("coachImproveBtn");
  if(improveBtn){
    setHomeActionLabel(improveBtn, "개선 적용됨");
    improveBtn.disabled = true;
  }
}

function coachReset(){
  const ta = coachEl("coachPrompt");
  if(ta){
    if(coachOriginalPrompt){
      ta.value = coachOriginalPrompt;
      ta.classList.remove("is-initial");
    } else {
      ta.value = ta.dataset.initialText || "";
      ta.classList.add("is-initial");
    }
  }
  coachSuggestions = [];
  coachSuggestionsCollapsed = false;
  coachBaseScore = 35;
  coachImprovedPrompt = "";
  coachAttachedFiles = [];
  coachFileLinks = [];
  if(coachUploadSessionId){
    fetch("/api/upload/clear", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ session_id: coachUploadSessionId }),
    }).catch(() => {});
    coachUploadSessionId = "";
  }
  coachRenderFileChips();
  coachRenderFileLinkChips();
  const cc = coachEl("coachCharCount");
  if(cc && ta) cc.textContent = (ta.classList.contains("is-initial") ? 0 : ta.value.length) + "자";
  const improveBtn = coachEl("coachImproveBtn");
  if(improveBtn){
    setHomeActionLabel(improveBtn, "개선 적용");
    improveBtn.disabled = false;
  }
  const engineTag = coachEl("coachEngineTag");
  if(engineTag) engineTag.textContent = "";
  coachSetScoreMini(null);
  coachRefreshCards();
}

async function coachRunAnalyze(){
  if(coachIsRunning) return;
  const ta = coachEl("coachPrompt");
  const analyzeBtn = coachEl("coachAnalyzeBtn");
  if(!ta) return;

  const prompt = coachPromptText();
  if(!prompt){
    alert("프롬프트를 먼저 입력하세요.");
    return;
  }

  coachIsRunning = true;
  coachOriginalPrompt = prompt;
  if(analyzeBtn){
    analyzeBtn.disabled = true;
    setHomeActionLabel(analyzeBtn, "분석 중...");
  }

  const improveBtn = coachEl("coachImproveBtn");
  if(improveBtn){
    improveBtn.style.display = "none";
    setHomeActionLabel(improveBtn, "개선 적용");
    improveBtn.disabled = false;
  }

  try{
    const selectedOptions = homeSelectedAnalysisOptions();
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        selected_sources: selectedOptions.sources,
        selected_agents: selectedOptions.agents,
        attached_files: coachAttachedFileSummaries(),
        file_links: coachFileLinkSummaries(),
      }),
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    coachBaseScore = data.score || 35;
    coachImprovedPrompt = data.improved_prompt || "";
    coachSuggestions = (data.suggestions || []).map((s, i) => ({
      ...s,
      id: s.id || "s" + (i + 1),
    }));
    coachSuggestionsCollapsed = false;

    coachSetScoreMini(coachBaseScore);
    coachRefreshCards();

    const engineTag = coachEl("coachEngineTag");
    if(engineTag) engineTag.textContent = data.engine === "llm" ? "외부 LLM 분석" : "규칙 기반 (LLM 미설정)";
  } catch(err){
    alert("코칭 요청 실패: " + (err.message || err));
    console.error("[coach] error", err);
  } finally {
    coachIsRunning = false;
    if(analyzeBtn){
      analyzeBtn.disabled = false;
      setHomeActionLabel(analyzeBtn, "AI 코칭 재실행");
    }
  }
}

/* ── 파일 첨부 처리 ────────────────────────────────────────────── */
function coachInferDocType(name){
  const n = (name || "").toLowerCase();
  if(/invoice|inv|세금|계산서|송장/.test(n)) return "invoice";
  if(/bl|선하|b_l|billoflading/.test(n))     return "bl";
  if(/contract|계약|sales/.test(n))           return "contract";
  if(/packing|포장/.test(n))                  return "packing_list";
  if(/origin|원산지|certificate/.test(n))     return "origin_certificate";
  return "document";
}

function coachRenderFileChips(){
  const wrap = coachEl("coachFileChips");
  if(!wrap) return;
  if(coachAttachedFiles.length === 0){ wrap.innerHTML = ""; return; }
  wrap.innerHTML = coachAttachedFiles.map((f, i) => {
    const sizeKB = (f.size / 1024).toFixed(1);
    const textBadge = f.encoding === "text"
      ? `<span class="coach-file-textbadge">텍스트 추출</span>`
      : (f.encoding === "base64" ? `<span class="coach-file-textbadge">서버 추출</span>` : `<span class="coach-file-binbadge">바이너리</span>`);
    return `<span class="coach-file-chip" title="${escapeHtml(f.name)}">
      <span class="coach-file-type">${escapeHtml(f.type)}</span>
      <span class="coach-file-name">${escapeHtml(f.name)}</span>
      <span class="coach-file-size">${sizeKB}KB</span>
      ${textBadge}
      <button type="button" class="coach-file-remove" data-coach-remove-file="${i}">×</button>
    </span>`;
  }).join("");
}

function coachRenderFileLinkChips(){
  const wrap = coachEl("coachFileLinkChips");
  if(!wrap) return;
  if(coachFileLinks.length === 0){
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = coachFileLinks.map((link, i) => `
    <span class="coach-file-chip coach-link-chip" title="${escapeHtml(link.url)}">
      <span class="coach-file-type">LINK</span>
      <span class="coach-file-name">${escapeHtml(link.name || link.url)}</span>
      <span class="coach-file-size">전자서고</span>
      <button type="button" class="coach-file-remove" data-coach-remove-file-link="${i}">×</button>
    </span>
  `).join("");
}

function coachAddFileLink(){
  const nameInput = coachEl("coachFileLinkName");
  const urlInput = coachEl("coachFileLinkUrl");
  const rawUrl = (urlInput?.value || "").trim();
  const rawName = (nameInput?.value || "").trim();
  if(!rawUrl){
    alert("전자서고 파일 링크를 입력하세요.");
    return false;
  }
  const normalizedUrl = rawUrl;
  const duplicate = coachFileLinks.some(link => link.url === normalizedUrl);
  if(duplicate){
    alert("이미 추가된 파일 링크입니다.");
    return false;
  }
  coachFileLinks.push({
    name: rawName || normalizedUrl,
    url: normalizedUrl,
    type: "file_link",
    mime: "",
    encoding: "link",
    size: 0,
  });
  if(nameInput) nameInput.value = "";
  if(urlInput) urlInput.value = "";
  coachRenderFileLinkChips();
  return true;
}

function coachRemoveFileLink(idx){
  coachFileLinks.splice(idx, 1);
  coachRenderFileLinkChips();
}

function coachReadFile(file){
  return new Promise((resolve) => {
    const isText = COACH_TEXT_EXT.test(file.name) || (file.type && file.type.startsWith("text/")) || file.type === "application/json";
    if(isText && file.size <= COACH_MAX_TEXT_SIZE){
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        type: coachInferDocType(file.name),
        mime: file.type || "text/plain",
        size: file.size,
        encoding: "text",
        content: String(reader.result || ""),
      });
      reader.onerror = () => resolve({
        name: file.name, type: coachInferDocType(file.name), mime: file.type || "",
        size: file.size, encoding: "binary", content: "",
      });
      reader.readAsText(file, "UTF-8");
    } else if(file.size <= COACH_MAX_BINARY_SIZE) {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        const base64 = raw.includes(",") ? raw.split(",", 2)[1] : raw;
        resolve({
          name: file.name,
          type: coachInferDocType(file.name),
          mime: file.type || "application/octet-stream",
          size: file.size,
          encoding: "base64",
          content: base64,
        });
      };
      reader.onerror = () => resolve({
        name: file.name, type: coachInferDocType(file.name), mime: file.type || "",
        size: file.size, encoding: "binary", content: "",
      });
      reader.readAsDataURL(file);
    } else {
      resolve({
        name: file.name,
        type: coachInferDocType(file.name),
        mime: file.type || "application/octet-stream",
        size: file.size,
        encoding: "binary",
        content: "",
      });
    }
  });
}

async function coachHandleFileSelect(fileList){
  const files = Array.from(fileList || []);
  if(!files.length) return;
  const newOnes = [];
  for(const f of files){
    const entry = await coachReadFile(f);
    newOnes.push(entry);
    coachAttachedFiles.push(entry);
  }
  coachRenderFileChips();

  // 백엔드 업로드
  try{
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: coachUploadSessionId || undefined,
        files: newOnes,
      }),
    });
    if(res.ok){
      const data = await res.json();
      coachUploadSessionId = data.session_id;
      console.log("[coach] 업로드 완료", data);
    }
  } catch(err){
    console.error("[coach] 업로드 실패", err);
    alert("파일 업로드에 실패했습니다: " + (err.message || err));
  }
}

async function coachRemoveFile(idx){
  coachAttachedFiles.splice(idx, 1);
  coachRenderFileChips();
  // 세션 전체 재업로드 (간단 처리)
  if(coachUploadSessionId){
    try{
      await fetch("/api/upload/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: coachUploadSessionId }),
      });
      coachUploadSessionId = "";
    } catch(e){ console.error(e); }
    if(coachAttachedFiles.length){
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: coachAttachedFiles }),
      });
      if(res.ok){
        const data = await res.json();
        coachUploadSessionId = data.session_id;
      }
    }
  }
}

function coachInitHome(){
  const ta = coachEl("coachPrompt");
  if(!ta) return;
  const cc = coachEl("coachCharCount");
  if(cc) cc.textContent = ta.value.length + "자";
  coachSuggestions = [];
  coachSuggestionsCollapsed = false;
  coachBaseScore = 35;
  coachImprovedPrompt = "";
  coachOriginalPrompt = "";
  coachSetScoreMini(null);
  coachRefreshCards();
  coachRenderFileChips();
  coachRenderFileLinkChips();
  homeSyncPickerStatuses();
  // 인사말 이름 설정
  const nameEl = document.getElementById("homeGreetingText");
  if(nameEl){
    const name = document.getElementById("profileName")?.textContent?.trim() || "";
    nameEl.textContent = name ? `안녕하세요, ${name}님` : "안녕하세요";
  }
}

/* 홈 채팅 이력·새 채팅·컬럼 레이아웃 — pages/home-runtime.js(포털 전용)로 이동.
   엔진과는 runtime-hooks("home-render"·"home-run-started")와
   export(render·openHomePicker·resetHomeRunState)로만 연결된다. */

/* 홈 실행 상태 초기화 — 새 채팅(home-runtime) 등 외부에서 호출 */
export function resetHomeRunState(){
  if(homeEventSource){ try{ homeEventSource.close(); }catch(e){} homeEventSource = null; }
  homeRunResults = {};
  homeStepStatus = {};
}

function coachAttachedFileSummaries(){
  return coachAttachedFiles.map(f => ({
    name: f.name, type: f.type, size: f.size, encoding: f.encoding,
  }));
}

/* 업로드 세션이 없을 때만 쓰는 폴백 — GET 요청라인 한도(약 64KB)를 넘지 않도록
   합계 24KB 이내의 첨부 본문만 싣는다. 초과분은 메타데이터만 전달된다. */
const HOME_INLINE_ATTACHMENT_LIMIT = 24 * 1024;
function homeSmallAttachments(){
  const out = [];
  let used = 0;
  for(const f of coachAttachedFiles){
    const len = String(f.content || "").length;
    if(used + len > HOME_INLINE_ATTACHMENT_LIMIT) continue;
    used += len;
    out.push(f);
  }
  return out.length ? out : undefined;
}

function coachFileLinkSummaries(){
  return coachFileLinks.map(link => ({
    name: link.name,
    url: link.url,
    type: link.type || "file_link",
    mime: link.mime || "",
    encoding: "link",
    size: Number(link.size || 0),
  }));
}

/* ── 홈 분석 실행 (실제 워크플로 스트리밍) ── */
const HOME_DEFAULT_AGENTS = [
  { type:"db",                 label:"CDW 자연어조회",              key:"db_cdw" },
  { type:"db_external",        label:"전자통관외부정보조회",        key:"db_external" },
  { type:"company",            label:"기업 프로파일 조회",      key:"company_profile" },
  { type:"rag_customs",        label:"관세정보 RAG",           key:"rag_customs" },
  { type:"rag_audit",          label:"심사정보 RAG",          key:"rag_audit" },
  { type:"rag_investigation",  label:"조사정보 RAG",          key:"rag_investigation" },
  { type:"rag_global",         label:"국제협력 RAG",          key:"rag_global" },
  { type:"web",                label:"웹 정보수집 요청 AI 서비스",  key:"web_search" },
  { type:"declaration_verify", label:"수입신고검증 AI 서비스",    key:"declaration_verify" },
  { type:"hs_verify",          label:"품목분류검증 AI 서비스",    key:"hs_verify" },
  { type:"customs_value",      label:"과세가격평가 AI 서비스",    key:"customs_value" },
  { type:"ml",                 label:"ML 모델 실행 AI 서비스",    key:"ml" },
  { type:"network",            label:"관계망분석 AI 서비스",      key:"network" },
  { type:"ontology",           label:"관세온톨로지 AI 서비스",    key:"ontology" },
  { type:"origin_analysis",    label:"원산지 검증 AI 서비스",     key:"origin_analysis" },
  { type:"abnormal_trade",     label:"이상거래 검증 AI 서비스",   key:"abnormal_trade" },
  { type:"proceeds_tracking",  label:"범죄수익 추적 AI 서비스",   key:"proceeds_tracking" },
  { type:"route_analysis",     label:"운송경로 분석 AI 서비스",   key:"route_analysis" },
  { type:"external_agency",    label:"외부기관정보수집 AI 서비스", key:"external_agency" },
  { type:"patent",             label:"특허정보 조회 AI 서비스",   key:"patent" },
  { type:"law",                label:"법령 검토 AI 서비스",       key:"law" },
  { type:"ocr",                label:"OCR/문서인식 AI 서비스",    key:"ocr" },
  { type:"rag_create",         label:"업무특화RAG 분석서비스",     key:"rag_create" },
  { type:"translate",          label:"문서 번역 AI 서비스",       key:"translate" },
  { type:"text_summary",       label:"요약 AI 서비스",            key:"text_summary" },
  { type:"report_standard",    label:"표준 보고서 생성 AI 서비스", key:"report_standard" },
  { type:"report",             label:"보고서 생성 AI 서비스",     key:"report_generate" },
  { type:"validation",         label:"보고서 검증 AI 서비스",     key:"report_validate" },
  { type:"mail_share",         label:"분석결과 공유 AI 서비스",   key:"mail_share" },
];

let homeEventSource = null;
let homeRunResults = {};   // { result_key: text }
let homeStepStatus = {};   // { label: "running"|"done"|"error" }
// AI통합분석결과(요약·KPI) 접기 상태 — 접으면 그만큼 서비스 결과 영역이 넓어진다.
let homeSummaryCollapsed = false;
// 카드별 수행 결과 표시 상태 { [serviceKey]: { status, output } } — 재렌더(서비스 추가 등) 시 결과 보존용
let homeCardResultState = {};
let homeSelectedRagKeys = [];
let homeSelectedAgentKeys = [];
let homeShareEmailIds = [];
// 선택 서비스별 프롬프트 템플릿 구성 상태: { [serviceKey]: { behaviors:[], text:"", edited:bool } }
let homePromptTemplateState = {};
// 선택된 모든 서비스의 수행 순서(위→아래 = 실행 순서). 선택 변경 시 동기화된다.
let homePipelineOrder = [];
// 구조화 전용 입력 패널을 갖는 서비스 — 인라인 프롬프트 편집기 대신 카드 안에 전용 입력 폼을 렌더한다.
const HOME_DEDICATED_PANEL_SERVICES = new Set([
  "translate", "text_summary", "report_standard", "mail_share",
]);
// 전용 입력 패널(번역·요약·표준보고서)의 카드 인라인 입력 상태 — 카드 재렌더 시 값 보존용.
const homeDedicatedInputState = {
  translate: { source_lang: "auto", target_lang: "ko", input: "" },
  text_summary: { format: "bullet", template: "", input: "" },
  report_standard: { content: "", template: "" },
};
// 카드별 표시 프롬프트(편집 가능) 상태: { [serviceKey]: { text:"", edited:bool } }
// KB·AI서비스 카드 우측 '프롬프트 및 수행 결과'의 자동등록·수정 프롬프트.
let homeCardPromptState = {};
// 카드별 접힘 상태(서비스가 많을 때 개별 카드 접기/펴기): { [serviceKey]: true=접힘 }
let homeCardCollapsed = {};

// 카드 접기/펴기 토글 버튼 HTML (단일 수행 버튼 옆 액션 영역에 배치).
/* 좌측 서비스 설명 프레임 접기 — 카드 전체 접기(homeCardCollapsed)와 별개로,
   설명·동작칩·입력값만 접어 우측 '프롬프트 및 수행 결과'가 폭을 넓게 쓰게 한다. */
let homeCardInfoCollapsed = {};

function homeCardInfoToggleHtml(key){
  const collapsed = !!homeCardInfoCollapsed[key];
  return `<button type="button" class="home-info-collapse" data-home-card-info-collapse="${escapeHtml(key)}"
      aria-expanded="${collapsed ? "false" : "true"}"
      aria-label="${collapsed ? "서비스 설명 펼치기" : "서비스 설명 접기"}"
      title="${collapsed ? "서비스 설명 펼치기" : "서비스 설명 접기 — 결과 영역을 넓게 사용"}">${collapsed ? "▶" : "◀"}</button>`;
}

function homeCardCollapseToggleHtml(key){
  const collapsed = !!homeCardCollapsed[key];
  return `<button type="button" class="home-mini-btn home-card-collapse" data-home-card-collapse="${escapeHtml(key)}"
      aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "카드 펼치기" : "카드 접기"}"
      title="${collapsed ? "펼치기" : "접기"}">${collapsed ? "▸ 펴기" : "▾ 접기"}</button>`;
}

// 업무지식베이스(검색) 카드의 기본 프롬프트 — 실제 조건은 카드 프롬프트에서 직접 작성한다.
// 업무지식베이스 카드의 현재 분석범위(behavior) 라벨 목록 — 미선택이면 시나리오와 동일한 기본값 사용.
function homeSourceBehaviorLabels(key){
  const opts = AI_SERVICE_REGISTRY[key]?.behaviorOptions || [];
  const st = homePromptTemplateState[key];
  const values = (st?.behaviors && st.behaviors.length) ? st.behaviors : sourceDefaultBehaviors(key);
  return values.map(v => opts.find(o => o.value === v)?.label || v).filter(Boolean);
}

// 업무지식베이스 카드 기본 프롬프트 — 분석 시나리오와 동일하게 [분석범위] + 검색 조건([입력값] 토큰)으로 구성.
function homeSourceCardPromptDefault(key){
  const svc = AI_SERVICE_REGISTRY[key];
  const label = svc?.label || key;
  if(!(svc?.behaviorOptions?.length)) return `${label}에서 원하는 조건의 자료를 조회해줘.`;
  const labels = homeSourceBehaviorLabels(key);
  if(!labels.length) return `${label}에서 원하는 조건의 자료를 조회해줘.`;
  const defs = homeServiceInputDefs(key);
  const tokens = defs.map(d => `${d.label} [${d.label}]`).join(" · ");
  return `[분석범위]\n- ${labels.join("\n- ")}\n\n${label} 지식베이스입니다. 선택한 분석범위에 따라 조회하고 핵심 결과를 정리합니다.\n검색 조건: ${tokens} (값을 채우거나 문장으로 작성하세요)`;
}

// 업무지식베이스 카드 프롬프트의 [입력값] 토큰을 하이라이트 span으로 렌더 (필수 입력값 표시용).
function homeSourcePromptInnerHtml(key, text){
  let html = escapeHtml(text);
  homeServiceInputDefs(key).forEach(d => {
    const tok = escapeHtml(`[${d.label}]`);
    html = html.split(tok).join(
      `<span class="home-prompt-token empty${d.required ? " req" : ""}" data-field="${escapeHtml(d.key)}" data-label="${escapeHtml(d.label)}">${tok}</span>`
    );
  });
  return html;
}

// AI 분석서비스 카드 프롬프트에 노출할 입력 필드(필수). 값은 프롬프트의 [입력값 이름] 토큰으로 채운다.
function homeAgentPromptFields(key){
  return homeServiceInputDefs(key).filter(d => d.required);
}

// AI 서비스 카드 프롬프트 — "{필드라벨} [입력값 이름], … 을(를) 활용하여 '{서비스}'을(를) 수행해줘".
// 입력값은 프롬프트의 [입력값 이름] 토큰으로 직접 채우거나 선행 결과를 자연어로 연계한다.
function homeAgentPromptPlainText(key){
  const label = AI_SERVICE_REGISTRY[key]?.label || key;
  const fields = homeAgentPromptFields(key);
  if(!fields.length) return `'${label}'을(를) 수행해줘.`;
  const segs = fields.map(d => `${d.label} [${d.label}]`);
  return `${segs.join(", ")}을(를) 활용하여 '${label}'을(를) 수행해줘.`;
}

// 입력값을 하이라이트 토큰(span)으로 렌더한 contenteditable 내부 HTML.
function homeAgentPromptInnerHtml(key){
  const label = AI_SERVICE_REGISTRY[key]?.label || key;
  const fields = homeAgentPromptFields(key);
  if(!fields.length) return `'${escapeHtml(label)}'을(를) 수행해줘.`;
  const segs = fields.map(d =>
    `${escapeHtml(d.label)} <span class="home-prompt-token empty" data-field="${escapeHtml(d.key)}" data-label="${escapeHtml(d.label)}">${escapeHtml(`[${d.label}]`)}</span>`
  );
  return `${segs.join(", ")}을(를) 활용하여 '${escapeHtml(label)}'을(를) 수행해줘.`;
}

function homeAgentCardPromptDefault(key){
  return homeAgentPromptPlainText(key, 0);
}

// AI 서비스 입력값 칩 — 누르면 프롬프트의 커서 위치에 [입력값 이름] 변수가 삽입된다.
// (직접 입력값은 프롬프트의 하이라이트 토큰에서 수정하거나, 선행 결과를 자연어로 연계)
function homeInputChipsHtml(key){
  const defs = homeServiceInputDefs(key);
  const chips = defs.map(d =>
    `<button type="button" class="home-input-chip${d.required ? " req" : ""}"
       data-home-insert-token="${escapeHtml(key)}" data-label="${escapeHtml(d.label)}"
       title="누르면 프롬프트 커서 위치에 [${escapeHtml(d.label)}] 변수를 삽입합니다">${escapeHtml(d.label)}${d.required ? `<i class="home-chip-req">필수</i>` : ""}</button>`
  ).join("");
  return `<div class="home-input-chips"><span class="home-input-chips-hd">입력값</span>${chips}</div>`;
}

// 입력값 칩 클릭 → 해당 카드 프롬프트의 커서 위치(없으면 끝)에 [입력값 이름] 토큰 삽입.
function homeInsertTokenIntoPrompt(key, label){
  const token = `[${label}]`;
  const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
  if(!el) return;
  if(el.isContentEditable){
    el.focus();
    const sel = window.getSelection();
    let range;
    if(sel && sel.rangeCount && el.contains(sel.anchorNode)){
      range = sel.getRangeAt(0);
      range.deleteContents();
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.insertNode(document.createTextNode(token));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    homeCardPromptState[key] = { text: el.innerText, edited: true };
  } else {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + token + el.value.slice(end);
    const pos = start + token.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    homeCardPromptState[key] = { text: el.value, edited: true };
  }
  homeSyncCombinedPrompt();
}

function homeCardPromptDefault(key, kind){
  return kind === "source" ? homeSourceCardPromptDefault(key) : homeAgentCardPromptDefault(key);
}

// 카드 프롬프트 현재 값(편집본 우선, 없으면 기본 생성문). 미편집 상태면 기본문으로 동기화.
function homeCardPromptText(key, kind){
  const st = homeCardPromptState[key];
  if(st && st.edited) return st.text;
  const def = homeCardPromptDefault(key, kind);
  homeCardPromptState[key] = { text: def, edited: false };
  return def;
}

// 단일 수행 결과를 해당 카드의 결과 영역에 반영.
function homeUpdateCardResult(key, status, output){
  // 재렌더에도 결과가 유지되도록 상태에 보존(서비스 추가 시 결과 초기화 방지)
  homeCardResultState[key] = { status, output };
  const box = document.querySelector(`[data-home-card-result="${cssString(key)}"]`);
  if(!box) return;
  if(status === "running"){ box.innerHTML = `<div class="home-card-result-status muted">실행 중...</div>`; return; }
  const badge = status === "error" ? `<span class="home-detail-badge error">오류</span>` : `<span class="home-detail-badge done">완료</span>`;
  box.innerHTML = `<div class="home-card-result-head">${badge}</div><div class="home-card-result-body markdown-output">${markdownToHtml(output || "결과 없음")}</div>`;
}

// 재렌더 후 보존된 카드 결과를 다시 그린다.
function homeRestoreCardResults(){
  Object.entries(homeCardResultState).forEach(([key, r]) => {
    if(r && r.status && r.status !== "running") homeUpdateCardResult(key, r.status, r.output);
  });
}

// ── 카드별 AI코칭 — 해당 서비스의 필수 입력값·프롬프트를 점검하고 재구성안을 제시 ──
const homeCardCoachState = {};   // { [key]: { improved } }

async function homeCardCoach(key, btn){
  const svc = AI_SERVICE_REGISTRY[key];
  if(!svc) return;
  const kind = isHomeSourceKey(key) ? "source" : "agent";
  const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
  const cardPrompt = ((el ? (el.isContentEditable ? el.innerText : el.value) : "") || "").trim();
  const box = document.querySelector(`[data-home-card-result="${cssString(key)}"]`);
  if(!cardPrompt){
    if(box) box.innerHTML = `<div class="home-card-result-status">먼저 프롬프트를 입력하세요.</div>`;
    return;
  }
  // 1) 필수 입력값 점검 — 미입력 토큰이 있으면 대화형으로 먼저 되묻는다.
  if(kind === "agent"){
    for(const def of homeServiceInputDefs(key)){
      if(def.required && cardPrompt.includes(`[${def.label}]`)){
        homeMountClarify(box, svc.label, def, (val) => {
          const cur = el.isContentEditable ? el.innerText : el.value;
          const next = cur.replace(`[${def.label}]`, val);
          if(el.isContentEditable) el.innerText = next; else el.value = next;
          homeCardPromptState[key] = { text: next, edited: true };
          homeCardCoach(key, btn);   // 보완 후 코칭 재개
        });
        return;
      }
    }
  }
  // 2) 프롬프트 점검·재구성 — /api/coach 활용
  if(box) box.innerHTML = `<div class="home-card-result-status muted">AI코칭 분석 중...</div>`;
  if(btn) btn.disabled = true;
  try{
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: cardPrompt,
        selected_sources: kind === "source" ? [key] : [],
        selected_agents: kind === "agent" ? [key] : [],
      }),
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    homeRenderCardCoach(key, await res.json());
  } catch(err){
    if(box) box.innerHTML = `<div class="home-card-result-status">코칭 실패: ${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    if(btn) btn.disabled = false;
  }
}

function homeRenderCardCoach(key, data){
  const box = document.querySelector(`[data-home-card-result="${cssString(key)}"]`);
  if(!box) return;
  const score = data.score ?? "-";
  const items = (data.suggestions || []).map(s => {
    const title = s.title || s.desc || "";
    const detail = s.desc && s.title ? `<div class="home-card-coach-desc">${escapeHtml(s.desc)}</div>` : "";
    return `<li><b>${escapeHtml(title)}</b>${detail}</li>`;
  }).join("");
  const improved = data.improved_prompt || "";
  homeCardCoachState[key] = { improved };
  box.innerHTML = `
    <div class="home-card-coach">
      <div class="home-card-coach-head">AI코칭 <span class="home-card-coach-score">점수 ${escapeHtml(String(score))}</span></div>
      ${items ? `<ul class="home-card-coach-list">${items}</ul>`
              : `<p class="muted" style="font-size:12px">개선 제안이 없습니다 — 프롬프트가 충분히 구체적입니다.</p>`}
      ${improved ? `
        <div class="home-card-coach-improved">
          <div class="home-card-coach-improved-label">재구성 제안</div>
          <div class="home-card-coach-improved-text">${escapeHtml(improved)}</div>
          <button type="button" class="btn secondary home-card-coach-apply" data-home-coach-apply="${escapeHtml(key)}">이 프롬프트로 교체</button>
        </div>` : ""}
    </div>`;
}

// 코칭 재구성안 적용 — 카드 프롬프트를 제안 프롬프트로 교체.
function homeApplyCardCoach(key){
  const improved = homeCardCoachState[key]?.improved;
  if(!improved) return;
  const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
  if(el){
    if(el.isContentEditable) el.innerText = improved; else el.value = improved;
    homeCardPromptState[key] = { text: improved, edited: true };
  }
  const box = document.querySelector(`[data-home-card-result="${cssString(key)}"]`);
  if(box) box.innerHTML = `<div class="home-card-result-status">재구성 프롬프트를 적용했습니다.</div>`;
  homeSyncCombinedPrompt();
}

// 업무지식베이스(DB/RAG) 소스 키 여부.
function isHomeSourceKey(key){
  const g = AI_SERVICE_REGISTRY[key]?.group;
  return g === DB_SEARCH_GROUP || g === RAG_SEARCH_GROUP;
}

// 단일 카드만 실행 — 해당 서비스의 (편집된) 카드 프롬프트로 1건 수행, 결과를 카드에 표시.
function homeRunSingleService(key, btn){
  const svc = AI_SERVICE_REGISTRY[key];
  if(!svc) return;
  const kind = isHomeSourceKey(key) ? "source" : "agent";
  const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
  const cardPrompt = ((el ? (el.isContentEditable ? el.innerText : el.value) : "") || homeCardPromptText(key, kind)).trim();
  // AI 서비스 필수 입력값 검증 — 프롬프트에 미입력 토큰 [입력값 이름]이 남아 있으면 입력을 요청.
  // 이전 단계 결과에서 도출할 값이면 조건 형태로 적을 수 있다.
  // (예: "이전 기업프로파일 중 품목분류 오류율이 가장 높은 기업 ID")
  if(kind === "agent"){
    for(const def of homeServiceInputDefs(key)){
      if(def.required && cardPrompt.includes(`[${def.label}]`)){
        // alert 대신 카드 결과영역에서 대화형으로 값을 되묻고, 받은 값으로 토큰을 치환해 재실행
        const target = document.querySelector(`[data-home-card-result="${cssString(key)}"]`);
        homeMountClarify(target, svc.label, def, (val) => {
          const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
          if(el){
            const cur = el.isContentEditable ? el.innerText : el.value;
            const next = cur.replace(`[${def.label}]`, val);
            if(el.isContentEditable) el.innerText = next; else el.value = next;
            homeCardPromptState[key] = { text: next, edited: true };
          }
          homeRunSingleService(key, btn);
        });
        return;
      }
    }
  }
  // MyAI는 프롬프트에 충실 — 프롬프트에서 명시된 기업만 사용하고, 화면의 활성 기업을
  // 임의로 주입하지 않는다. 특정 기업이 없으면 빈값이 아니라 메인 실행과 동일한 센티넬을 보내
  // (빈 company_id는 서버가 400으로 반려 → SSE 끊김 → '실행 중' 멈춤), agent_db가 NL→SQL로 조회한다.
  const companyId = detectCompanyId(cardPrompt) || "__NO_COMPANY_SELECTED__";
  homeUpdateCardResult(key, "running");
  homeStreamAgents(cardPrompt, companyId, [{ type: svc.type, key, label: svc.label }], btn);
}
// 자동 생성한 통합 프롬프트(사용자 수동 편집 감지용)
let homeLastGeneratedPrompt = "";

// 업무지식베이스(자연어 조회 대상) 소개문 — 데이터소스 선택 시 안내 카드로 표시
const DATA_SOURCE_INTRO = {
  db_cdw: "관세·무역 전 분야 데이터가 적재된 관세데이터웨어하우스(CDW)입니다. 자연어로 기업·수입신고·위험지표 등 통관 데이터를 조회합니다.",
  company_profile: "CDW의 기업 기본정보·위험등급·수입실적·신고/검사 이력을 자연어로 조회합니다.",
  rag_customs: "관세정보 영역의 결과보고서를 보유하여, 유사사례 검색과 실무 중심 관세 업무정보를 자연어로 조회합니다.",
  rag_audit: "심사정보 영역의 결과보고서를 보유하여, 유사 심사사례 검색과 추징 관점의 실무정보를 자연어로 조회합니다.",
  rag_investigation: "조사정보 영역의 결과보고서를 보유하여, 유사 조사사례 검색과 조사 실무정보를 자연어로 조회합니다.",
  rag_global: "국제협력 영역의 결과보고서를 보유하여, 유사 국제공조 사례와 해외거래 실무정보를 자연어로 조회합니다.",
};
function homeDataSourceIntro(key){
  return DATA_SOURCE_INTRO[key]
    || `${AI_SERVICE_REGISTRY[key]?.label || "데이터소스"} — 해당 영역의 결과보고서를 보유하여 유사사례와 실무 정보를 자연어로 조회합니다.`;
}

// AI 서비스별 필수 입력 필드 정의 (key: 서비스키, value: [{key,label,placeholder,required}])
const AI_SERVICE_INPUTS = {
  // ── 업무지식베이스(정형DB·업무RAG) — 홈 카드 필수 입력값 하일라이트용 ──
  db_cdw: [
    { key:"target", label:"대상 기업/개인", placeholder:"예: C-1002 또는 P-2003", required:true },
    { key:"cond", label:"검색 조건", placeholder:"예: 최근 3년 수입신고 중 원산지 변경 건" },
  ],
  db_external: [
    { key:"target", label:"대상 기업/개인", placeholder:"예: C-1002", required:true },
  ],
  rag_customs: [
    { key:"q", label:"질의/쟁점", placeholder:"예: 저가신고 과세가격 결정 근거", required:true },
  ],
  rag_audit: [
    { key:"q", label:"질의/쟁점", placeholder:"예: 유사 업종 추징 사례", required:true },
  ],
  rag_investigation: [
    { key:"q", label:"질의/쟁점", placeholder:"예: 우회수입 조사 절차", required:true },
  ],
  rag_global: [
    { key:"q", label:"질의/쟁점", placeholder:"예: 해외 세관 공조 사례", required:true },
  ],
  customs_value: [
    { key:"target", label:"대상 기업/신고", placeholder:"예: C-1002 또는 신고번호", required:true },
    { key:"period", label:"조사기간", placeholder:"예: 2023.01~2025.03" },
    { key:"hs", label:"대상 HS", placeholder:"예: 8471.30" },
  ],
  hs_verify: [
    { key:"target", label:"대상 기업/개인", placeholder:"예: C-1036 또는 P-2003", required:true },
    { key:"declared_hs", label:"신고 HS", placeholder:"예: 8471.30", required:true },
    { key:"item", label:"품명/규격", placeholder:"예: 노트북 컴퓨터" },
  ],
  declaration_verify: [
    { key:"target", label:"대상 기업/신고", placeholder:"예: C-1002 또는 신고번호", required:true },
    { key:"doc", label:"대조 문서", placeholder:"첨부파일/참조 문서" },
  ],
  origin_analysis: [
    { key:"target", label:"대상 기업/품목", placeholder:"예: C-1002 / 품목", required:true },
    { key:"origin", label:"신고 원산지", placeholder:"예: CN" },
    { key:"fta", label:"FTA 협정", placeholder:"예: 한-중 FTA" },
  ],
  abnormal_trade: [
    { key:"target", label:"대상 기업", placeholder:"예: C-1002", required:true },
    { key:"focus", label:"점검 관점", placeholder:"가격/거래상대방/신고패턴" },
  ],
  network: [
    { key:"target", label:"분석 대상(기업/인물)", placeholder:"예: C-1002 / P-2003", required:true },
    { key:"hops", label:"탐색 단계(hop)", placeholder:"예: 2" },
  ],
  ml: [
    { key:"target", label:"대상 기업", placeholder:"예: C-1002", required:true },
    { key:"models", label:"실행 모델", placeholder:"전체 또는 특정 모델" },
  ],
  ontology: [
    { key:"target", label:"분석 대상", placeholder:"예: 우범여행자/화물", required:true },
  ],
  rag_risk_select: [
    { key:"target", label:"대상 기업/개인", placeholder:"예: C-1036 또는 P-2003", required:true },
    { key:"risk", label:"위험 유형", placeholder:"예: 저가신고/원산지/우회수입" },
  ],
  fund_trace: [
    { key:"target", label:"대상(기업/인물)", placeholder:"예: C-1002 / P-2003", required:true },
    { key:"files", label:"자금내역 파일", placeholder:"이체·현금입출금·가상계좌 내역" },
  ],
  comms_analysis: [
    { key:"target", label:"대상(인물/번호)", placeholder:"예: P-2003 / 010-****", required:true },
    { key:"src", label:"통신 소스", placeholder:"통화/SMS/SNS/메신저" },
  ],
  proceeds_tracking: [
    { key:"target", label:"대상(기업/인물)", placeholder:"예: C-1002 / P-2003", required:true },
    { key:"period", label:"추적 기간", placeholder:"예: 2023~2025" },
  ],
  route_analysis: [
    { key:"target", label:"대상(화물/인물)", placeholder:"예: 화물번호/대상자", required:true },
    { key:"route", label:"경로 단서", placeholder:"경유지/운송수단" },
  ],
  patent: [
    { key:"keyword", label:"검색 품목/키워드", placeholder:"예: 무선이어폰 상표", required:true },
  ],
  law: [
    { key:"issue", label:"검토 쟁점/법령", placeholder:"예: 과세가격 로열티 포함 여부", required:true },
  ],
  address_check: [
    { key:"address", label:"확인 주소", placeholder:"예: 서울 금천구 가산디지털1로 951", required:true },
  ],
  ocr: [
    { key:"doc", label:"대상 문서", placeholder:"첨부 파일을 지정하세요", required:true },
  ],
  rag_create: [
    { key:"source", label:"대상 자료", placeholder:"지식화할 자료/문서", required:true },
  ],
  clearance_report: [
    { key:"declaration_no", label:"신고번호", placeholder:"예: DV2-C-1001-01", required:true },
    { key:"photos", label:"현장 사진", placeholder:"파일첨부로 사진 1장 이상 등록", required:true },
  ],
  summary: [
    { key:"scope", label:"요약 대상", placeholder:"예: 이전 분석 결과 전체 / 특정 단계 결과" },
  ],
  report_generate: [
    { key:"title", label:"보고서 제목", placeholder:"예: C-1002 과세가격 조사 보고" },
    { key:"scope", label:"보고서 대상 자료", placeholder:"예: 이전 단계 결과 중 위반 혐의 항목" },
  ],
  report_validate: [
    { key:"target_report", label:"검증 대상 보고서", placeholder:"예: 직전 단계에서 생성한 보고서" },
  ],
  result_synthesis: [
    { key:"format", label:"최종 결과 형식", placeholder:"예: 통합 보고서 / 요약 / 표" },
  ],
  rag_trade: [
    { key:"target", label:"대상 기업/개인", placeholder:"예: C-1036 또는 P-2003", required:true },
    { key:"scope", label:"확인 범위", placeholder:"예: 무역 징후 / 시장 맥락" },
  ],
  web_search: [
    { key:"query", label:"수집 요청 내용", placeholder:"예: 업체명 + 제재 동향 수집" , required:true },
  ],
};
function homeServiceInputDefs(key){
  // 전용 입력 폼(번역·요약·표준보고서·공유)은 일반 입력값을 두지 않는다(폼이 입력 담당).
  if(HOME_DEDICATED_PANEL_SERVICES.has(key)) return [];
  return AI_SERVICE_INPUTS[key]
    || [{ key:"target", label:"분석 대상/지시", placeholder:"이 서비스의 분석 대상이나 지시를 입력하세요", required:true }];
}

const HOME_PICKER_RAG_KEYS = ["rag_customs", "rag_audit", "rag_investigation", "rag_global"];
const HOME_PICKER_AGENT_KEYS = sidebarPermissionGroups.agents;

function homeSelectedAnalysisOptions(){
  const sources = Array.from(document.querySelectorAll("[data-home-source].selected:not(.home-picker-trigger)"))
    .map(btn => btn.dataset.homeSource)
    .filter(Boolean);
  const agents = Array.from(document.querySelectorAll("[data-home-agent].selected:not(.home-picker-trigger)"))
    .map(btn => btn.dataset.homeAgent)
    .filter(Boolean);
  const pickerSources = homeSelectedRagKeys.filter(hasPermission);
  const pickerAgents = homeSelectedAgentKeys.filter(hasPermission);
  return {
    sources:[...new Set([...sources, ...pickerSources])],
    agents:[...new Set([...agents, ...pickerAgents])],
  };
}

function homeMailShareSelected(){
  return homeSelectedAnalysisOptions().agents.includes("mail_share");
}

function homeRenderShareEmailPanel(){
  const panel = document.getElementById("homeMailSharePanel");
  if(panel) panel.style.display = homeMailShareSelected() ? "grid" : "none";
  const chips = document.getElementById("homeShareEmailChips");
  if(chips) chips.innerHTML = homeShareEmailChipsHtml();
}

// 전용 입력 폼은 이제 각 서비스 카드 안에 인라인 렌더되므로 별도 패널 토글은 불필요(no-op 유지).
function homeRenderServiceInputPanels(){ /* 전용 입력은 homeDedicatedPanelInnerHtml 로 카드 내부에 렌더 */ }

// <select> 옵션 선택 상태 헬퍼
function homeDedSelected(key, field, optValue){
  return String(homeDedicatedInputState[key]?.[field] ?? "") === String(optValue) ? " selected" : "";
}

// 전용 입력 패널(번역·요약·표준보고서·공유)을 서비스 카드 본문에 인라인 렌더. 값은 상태에서 프리필.
function homeDedicatedPanelInnerHtml(key){
  if(key === "translate"){
    const langOpts = (field, opts) => opts.map(([v, l]) => `<option value="${v}"${homeDedSelected("translate", field, v)}>${l}</option>`).join("");
    return `
      <div class="home-svc-panel-row">
        <label>원본 언어
          <select data-home-ded="translate" data-field="source_lang">
            ${langOpts("source_lang", [["auto","자동 감지"],["ko","한국어"],["en","영어"],["zh","중국어"],["ja","일본어"]])}
          </select>
        </label>
        <label>대상 언어
          <select data-home-ded="translate" data-field="target_lang">
            ${langOpts("target_lang", [["ko","한국어"],["en","영어"],["zh","중국어"],["ja","일본어"]])}
          </select>
        </label>
      </div>
      <textarea data-home-ded="translate" data-field="input" rows="4" placeholder="번역할 원문을 입력하세요. (파일 첨부 시 비워둘 수 있습니다)">${escapeHtml(homeDedicatedInputState.translate.input)}</textarea>`;
  }
  if(key === "text_summary"){
    const fmtOpts = [["bullet","핵심 불릿"],["table","표 형식"],["narrative","서술 요약"],["custom","사용자 템플릿"]]
      .map(([v, l]) => `<option value="${v}"${homeDedSelected("text_summary", "format", v)}>${l}</option>`).join("");
    return `
      <div class="home-svc-panel-row">
        <label>결과 형식
          <select data-home-ded="text_summary" data-field="format">${fmtOpts}</select>
        </label>
      </div>
      <textarea data-home-ded="text_summary" data-field="input" rows="4" placeholder="요약할 원문을 입력하세요. (파일 첨부 시 비워둘 수 있습니다)">${escapeHtml(homeDedicatedInputState.text_summary.input)}</textarea>
      <textarea data-home-ded="text_summary" data-field="template" rows="3" placeholder="[사용자 템플릿] 원하는 출력 형식/항목을 적으세요. (결과 형식이 '사용자 템플릿'일 때 사용)">${escapeHtml(homeDedicatedInputState.text_summary.template)}</textarea>`;
  }
  if(key === "report_standard"){
    return `
      <textarea data-home-ded="report_standard" data-field="content" rows="4" placeholder="신규 보고서에 담을 내용을 입력하세요.">${escapeHtml(homeDedicatedInputState.report_standard.content)}</textarea>
      <textarea data-home-ded="report_standard" data-field="template" rows="5" placeholder="표준이 되는 보고서(출력 템플릿)의 전체 형식·구성을 붙여넣으세요.">${escapeHtml(homeDedicatedInputState.report_standard.template)}</textarea>`;
  }
  if(key === "mail_share"){
    return `
      <div class="home-mail-share-panel">
        <div class="home-mail-share-copy">
          <span>분석결과 보고서를 이메일로 공유합니다. 수신 이메일 ID를 1개 이상 등록하세요.</span>
        </div>
        <div class="home-mail-share-form">
          <input id="homeShareEmailInput" type="email" placeholder="예: officer@customs.go.kr">
          <button class="btn secondary" type="button" data-home-share-email-add>등록</button>
        </div>
        <div class="home-mail-share-chips" id="homeShareEmailChips">${homeShareEmailChipsHtml()}</div>
      </div>`;
  }
  return "";
}

// 공유 이메일 칩 HTML (카드 인라인 렌더 + 갱신 공용)
function homeShareEmailChipsHtml(){
  return homeShareEmailIds.length
    ? homeShareEmailIds.map(email => `
        <span class="home-share-email-chip">
          ${escapeHtml(email)}
          <button type="button" data-home-share-email-remove="${escapeHtml(email)}" aria-label="${escapeHtml(email)} 삭제">×</button>
        </span>
      `).join("")
    : `<span class="home-share-email-empty">등록된 이메일 ID가 없습니다.</span>`;
}

// 선택된 분석지원 서비스의 형식화 입력값을 실행 payload에 첨부할 형태로 수집 (상태 기반)
function homeServiceInputPayload(){
  const agents = homeSelectedAnalysisOptions().agents;
  const payload = {};
  if(agents.includes("translate")){
    const st = homeDedicatedInputState.translate;
    payload.translate_source_lang = st.source_lang || "auto";
    payload.translate_target_lang = st.target_lang || "ko";
    payload.translate_input = (st.input || "").trim();
  }
  if(agents.includes("text_summary")){
    const st = homeDedicatedInputState.text_summary;
    payload.summary_format = st.format || "bullet";
    payload.summary_template = (st.template || "").trim();
    payload.summary_input = (st.input || "").trim();
  }
  if(agents.includes("report_standard")){
    const st = homeDedicatedInputState.report_standard;
    payload.report_content = (st.content || "").trim();
    payload.report_template = (st.template || "").trim();
  }
  return payload;
}

// ── 선택 서비스별 프롬프트 템플릿 구성 패널 ──────────────────────────────────
// 선택된 RAG 소스 + AI 서비스 중 구조화 전용 패널이 없는 서비스마다 카드를 렌더한다.
// 각 카드: 동작(behavior) 칩 + 미리 정의된 템플릿(composePrompt) 프리필 textarea(개인화 편집).
// 데이터소스(업무지식베이스) 키 판정
function homeIsDataSourceKey(key){
  const g = AI_SERVICE_REGISTRY[key]?.group;
  return g === DB_SEARCH_GROUP || g === RAG_SEARCH_GROUP;
}

// AI 분석서비스(데이터소스 제외)의 수행 순서. 기존 순서 유지 + 신규는 끝에 추가.
function homeSyncPipelineOrder(){
  const { agents } = homeSelectedAnalysisOptions();
  const aiKeys = agents.filter(key => !homeIsDataSourceKey(key));
  homePipelineOrder = homePipelineOrder.filter(key => aiKeys.includes(key));
  aiKeys.forEach(key => { if(!homePipelineOrder.includes(key)) homePipelineOrder.push(key); });
  return homePipelineOrder;
}

// 인라인 프롬프트 편집기(동작칩+textarea)를 제공할 서비스인지 판정.
function homeServiceHasInlineTemplate(key){
  const svc = AI_SERVICE_REGISTRY[key];
  return !!svc && !HOME_DEDICATED_PANEL_SERVICES.has(key) && (svc.behaviorOptions?.length || 0) > 0;
}

function homeTemplateDefaultBehaviors(key){
  const opts = AI_SERVICE_REGISTRY[key]?.behaviorOptions || [];
  return opts.length ? [opts[0].value] : [];
}

// 통합 프롬프트 = 각 카드 프롬프트(단일 출처)를 흐름 순서(업무지식베이스 → AI 서비스)로 이어붙인다.
// (카드 프롬프트가 입력값의 단일 출처이므로 하단 통합 프롬프트가 카드 내용과 항상 일치한다)
function homeBuildCombinedPrompt(){
  const { sources } = homeSelectedAnalysisOptions();
  const aiOrder = homeSyncPipelineOrder();
  const part = (key, kind) => {
    const st = homeCardPromptState[key];   // 읽기 전용(상태 변경 없음)
    return ((st ? st.text : homeCardPromptDefault(key, kind)) || "").trim();
  };
  // 통합 지식 검색(업무지식베이스 2개+): 단일 의도 프롬프트를 1회만 사용(소스별 중복 제거).
  // 켜진 KB들에 대해 의도분석 후 처리되는 하나의 질의이므로 반복 표기하지 않는다.
  const sourceParts = sources.length >= 2
    ? (homeIntegratedPromptText.trim() ? [homeIntegratedPromptText.trim()] : [])
    : sources.map(k => part(k, "source"));
  const parts = [
    ...sourceParts,
    ...aiOrder.map(k => part(k, "agent")),
  ];
  return parts.filter(Boolean).join("\n\n");
}

// 통합 프롬프트를 입력창에 자동 반영 (사용자가 직접 편집한 경우 덮어쓰지 않음)
function homeSyncCombinedPrompt(){
  const ta = document.getElementById("coachPrompt");
  if(!ta) return;
  const generated = homeBuildCombinedPrompt();
  const isInitial = ta.classList.contains("is-initial");
  const userEdited = !isInitial && ta.value.trim() !== "" && ta.value !== homeLastGeneratedPrompt;
  if(userEdited) return;
  if(generated){
    ta.classList.remove("is-initial");
    ta.value = generated;
    homeLastGeneratedPrompt = generated;
    const cc = document.getElementById("coachCharCount");
    if(cc) cc.textContent = generated.length + "자";
  } else if(ta.value === homeLastGeneratedPrompt){
    // 선택 해제로 통합 프롬프트가 비면 입력창도 초기화
    ta.value = "";
    homeLastGeneratedPrompt = "";
  }
}

// ── 선제적 되묻기(clarify) 게이트 — 실행 전 결정적 입력검증, 부족하면 대화형으로 되묻기(LLM 미사용) ──
// 입력값은 카드 프롬프트의 [입력값 이름] 토큰으로 관리된다. 미치환 토큰이 남은 첫 필수 항목 {key, def} 반환.
function homeFirstMissingRequired(){
  const aiOrder = homeSyncPipelineOrder();
  for(const key of aiOrder){
    const promptText = (homeCardPromptState[key]?.text ?? homeAgentPromptPlainText(key)) || "";
    for(const def of homeServiceInputDefs(key)){
      if(def.required && promptText.includes(`[${def.label}]`)) return { key, def };
    }
  }
  return null;
}

// 되묻기 UI를 targetEl에 렌더하고, 값 제출 시 onSubmit(value)를 호출한다.
function homeCardWorkPanel(key, kind, gi = 0){
  let promptEl;
  if(kind === "agent"){
    const st = homeCardPromptState[key];
    // 미편집이면 입력값 토큰을 하이라이트한 contenteditable, 편집본이면 텍스트 그대로.
    const edited = st && st.edited;
    if(!edited) homeCardPromptState[key] = { text: homeAgentPromptPlainText(key, gi), edited: false };
    const inner = edited ? escapeHtml(st.text) : homeAgentPromptInnerHtml(key, gi);
    promptEl = `<div class="home-card-prompt home-card-prompt-rich" contenteditable="true"
        data-home-card-prompt="${escapeHtml(key)}" data-kind="agent"
        title="입력값(하이라이트)과 프롬프트를 직접 수정할 수 있습니다.">${inner}</div>`;
  } else {
    const promptText = homeCardPromptText(key, kind);
    // 분석범위가 있는 업무지식베이스: 시나리오와 동일하게 [입력값] 토큰을 하이라이트한 contenteditable.
    if(AI_SERVICE_REGISTRY[key]?.behaviorOptions?.length){
      const st = homeCardPromptState[key];
      const inner = st && st.edited ? escapeHtml(st.text) : homeSourcePromptInnerHtml(key, promptText);
      promptEl = `<div class="home-card-prompt home-card-prompt-rich" contenteditable="true"
          data-home-card-prompt="${escapeHtml(key)}" data-kind="source"
          title="입력값(하이라이트)과 프롬프트를 직접 수정할 수 있습니다.">${inner}</div>`;
    } else {
      promptEl = `<textarea class="home-card-prompt" data-home-card-prompt="${escapeHtml(key)}" data-kind="source" rows="3"
          placeholder="자동 등록된 프롬프트입니다. 필요 시 수정하세요.">${escapeHtml(promptText)}</textarea>`;
    }
  }
  // 업무지식베이스 카드: 프롬프트 지우기 · 기본값 채우기 버튼 제공.
  const kbPromptBtns = kind === "source" ? `
          <button type="button" class="home-mini-btn" data-home-prompt-clear="${escapeHtml(key)}" title="프롬프트를 비웁니다">지우기</button>
          <button type="button" class="home-mini-btn" data-home-prompt-default="${escapeHtml(key)}" title="선택한 분석범위 기준 기본 프롬프트로 채웁니다">기본값 채우기</button>` : "";
  return `
    <div class="home-card-work">
      <div class="home-card-work-head">
        <div class="home-card-work-tab">프롬프트 및 수행 결과</div>
        <div class="home-card-actions">${kbPromptBtns}
          <button type="button" class="home-mini-btn home-card-coach-btn" data-home-card-coach="${escapeHtml(key)}" title="필수 입력값·프롬프트를 점검하고 재구성안을 제시합니다">AI코칭</button>
          <button type="button" class="home-mini-btn home-run-single" data-home-run-single="${escapeHtml(key)}">단일 수행</button>
          ${homeCardCollapseToggleHtml(key)}
        </div>
      </div>
      ${promptEl}
      <div class="home-card-result" data-home-card-result="${escapeHtml(key)}"></div>
    </div>
  `;
}

// 데이터소스 소개 카드 (자연어 조회 대상) — 좌: 안내+분석범위+입력값 / 우: 프롬프트+수행결과
function homeDataSourceCardHtml(key, order){
  const svc = AI_SERVICE_REGISTRY[key];
  const collapsed = !!homeCardCollapsed[key];
  // 분석 시나리오와 동일한 분석범위 칩 — 토글 시 (미편집 상태의) 기본 프롬프트가 재구성된다.
  const opts = svc?.behaviorOptions || [];
  const st = homePromptTemplateState[key];
  const scopeChips = opts.length ? opts.map(opt => {
    const on = (st?.behaviors || sourceDefaultBehaviors(key)).includes(opt.value);
    return `<button type="button" class="home-tpl-chip${on ? " on" : ""}"
      data-home-tpl-behavior="${escapeHtml(key)}" data-behavior="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>`;
  }).join("") : "";
  return `
    <div class="home-svc-panel home-source-card home-card-row${collapsed ? " is-collapsed" : ""}" data-home-source-card="${escapeHtml(key)}">
      <div class="home-card-info">
        <div class="home-frame-head">
          <span class="home-frame-order src" title="실행 순서">${order}</span>
          <strong class="home-frame-title">${escapeHtml(svc?.label || key)}</strong>
          <span class="home-source-badge">업무지식베이스</span>
        </div>
        <p class="home-source-desc">${escapeHtml(homeDataSourceIntro(key))} 원하시는 정보의 조건을 오른쪽 프롬프트에 입력하세요.</p>
        ${scopeChips ? `<div class="home-tpl-chips home-kb-scope"><span class="home-kb-scope-hd">분석범위</span>${scopeChips}</div>` : ""}
        ${homeInputChipsHtml(key)}
        <p class="home-source-example">검색 조건 예) 품목이 ~인 기업목록, 특정인이 작성한 보고서 중 최신 10건</p>
      </div>
      ${homeCardWorkPanel(key, "source")}
    </div>
  `;
}

// 통합 지식 검색: 업무지식베이스 2개 이상 선택 시 개별 카드를 대체하는 단일 프레임.
// 하나의 자연어 질의를 정형DB(자연어→SQL)·업무RAG(문서검색)에 동시 실행, 출처별 결과 프레임 표시.
let homeIntegratedPromptText = "";
const homeIschResultCollapsed = {};   // 통합검색 출처별 결과 프레임 접힘 상태(key→bool)
const homeIschDisabled = new Set();   // 통합검색에서 토글로 비활성화한 업무지식베이스 key(통합수행 대상 제외)
function homeIschEnabledSources(sources){ return sources.filter(k => !homeIschDisabled.has(k)); }

// 통합검색 단일 소스 실행 완료 대기(폴링) — homeCardResultState[key]가 running이 아니게 되면 output 반환
function homeAwaitCardResult(key, timeoutMs = 120000){
  return new Promise(resolve => {
    const t0 = Date.now();
    const tick = () => {
      const r = homeCardResultState[key];
      if(r && r.status && r.status !== "running"){ resolve(r.output || ""); return; }
      if(Date.now() - t0 > timeoutMs){ resolve(""); return; }
      setTimeout(tick, 400);
    };
    setTimeout(tick, 500);   // running 전이 후부터 폴링
  });
}

// 통합 지식 검색: 백엔드 의도분석으로 실행계획을 받아 KB를 '순차' 실행.
// 의존 단계는 선행 KB 결과를 질의에 주입(CDW 자연어조회 → 그 결과로 RAG 검색 등).
async function homeRunIntegratedSearch(enabled, btn){
  const planEl = document.querySelector("[data-home-isch-plan]");
  const promptText = homeIntegratedPromptText.trim();
  const sourcesMeta = enabled.map(k => ({ key:k, label:AI_SERVICE_REGISTRY[k]?.label || k, kind:homeSourceKind(k) }));
  if(planEl){ planEl.hidden = false; planEl.innerHTML = `<span class="home-isch-plan-spin"><span class="home-running-dot"></span> 프롬프트 의도분석 중…</span>`; }
  let plan = null;
  try {
    const res = await fetch("/api/analyze_kb_plan", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ prompt: promptText, sources: sourcesMeta }),
    });
    if(res.ok) plan = await res.json();
  } catch(e){ plan = null; }
  const steps = (plan && Array.isArray(plan.steps) && plan.steps.length)
    ? plan.steps.filter(s => enabled.includes(s.source))
    : enabled.map((k,i) => ({ source:k, order:i+1, depends_on:null, query:promptText, role:"" }));
  if(planEl){
    const reason = (plan && plan.reasoning) ? `<div class="home-isch-plan-reason">🧭 의도분석 — ${escapeHtml(plan.reasoning)}</div>` : "";
    const list = steps.map((s,i) => {
      const dep = s.depends_on ? `<span class="dep">← ${escapeHtml(AI_SERVICE_REGISTRY[s.depends_on]?.label || s.depends_on)} 결과 활용</span>` : "";
      return `<li><b>${i+1}.</b> ${escapeHtml(AI_SERVICE_REGISTRY[s.source]?.label || s.source)}${s.role ? ` · ${escapeHtml(s.role)}` : ""} ${dep}</li>`;
    }).join("");
    planEl.innerHTML = `${reason}<ol class="home-isch-plan-steps">${list}</ol>`;
  }
  // 순차 실행 + 의존성 주입
  const results = {};
  for(const step of steps){
    let q = (step.query || promptText).trim();
    if(step.depends_on && results[step.depends_on]){
      const priorLabel = AI_SERVICE_REGISTRY[step.depends_on]?.label || step.depends_on;
      q = `[선행 ${priorLabel} 결과 요약]\n${(results[step.depends_on] || "").slice(0, 1500)}\n\n[요청]\n${q}`;
    }
    homeCardPromptState[step.source] = { text: q, edited: true };
    const hid = document.querySelector(`[data-home-card-prompt="${cssString(step.source)}"]`);
    if(hid) hid.value = q;
    homeRunSingleService(step.source, btn);
    results[step.source] = await homeAwaitCardResult(step.source);
  }
}
function homeSourceKind(key){
  return AI_SERVICE_REGISTRY[key]?.group === DB_SEARCH_GROUP ? "db" : "rag";
}
function homeIntegratedSourceFrameHtml(sources){
  const collapsed = !!homeCardCollapsed["__integrated__"];
  // 선택된 업무지식베이스마다 토글 버튼 — 켜진 소스만 통합수행/의도분석 대상
  const chips = sources.map(key => {
    const svc = AI_SERVICE_REGISTRY[key];
    const kind = homeSourceKind(key);
    const sub = kind === "db" ? "정형DB · 자연어→SQL" : "업무 RAG · 문서검색";
    const on = !homeIschDisabled.has(key);
    return `<button type="button" class="home-isch-chip ${kind}${on ? " on" : " off"}" data-home-isch-toggle="${escapeHtml(key)}"
      title="${on ? "통합수행 대상 — 클릭하여 제외" : "제외됨 — 클릭하여 포함"}" aria-pressed="${on}">
      <span class="dot"></span><b>${escapeHtml(svc?.label || key)}</b><span class="sub">${sub}</span><span class="chk">${on ? "✓" : "＋"}</span></button>`;
  }).join("");
  const resultFrames = homeIschEnabledSources(sources).map(key => {
    const svc = AI_SERVICE_REGISTRY[key];
    const kind = homeSourceKind(key);
    const icon = kind === "db" ? "▦" : "❏";
    const badge = kind === "db" ? "정형DB" : "업무 RAG";
    const sub = kind === "db" ? "정형 데이터웨어하우스 · 자연어 → SQL" : "업무 영역별 지식베이스 · 의미 기반 문서검색";
    const rCollapsed = !!homeIschResultCollapsed[key];
    return `
      <div class="home-isch-result ${kind}${rCollapsed ? " is-collapsed" : ""}" data-home-isch-result="${escapeHtml(key)}">
        <div class="home-isch-result-head">
          <span class="ic">${icon}</span>
          <div class="meta"><div class="t">${escapeHtml(svc?.label || key)} 결과</div><div class="s">${escapeHtml(sub)}</div></div>
          <span class="bdg">${badge}</span>
          <button type="button" class="home-isch-result-collapse" data-home-isch-result-collapse="${escapeHtml(key)}" title="결과 접기/펴기">${rCollapsed ? "▾ 펴기" : "▴ 접기"}</button>
        </div>
        <div class="home-card-result" data-home-card-result="${escapeHtml(key)}"></div>
        <textarea class="home-isch-hidden" data-home-card-prompt="${escapeHtml(key)}" data-kind="source" aria-hidden="true">${escapeHtml(homeIntegratedPromptText)}</textarea>
      </div>`;
  }).join("");
  const ph = "예) HS 8517 품목 수입신고 중 위험지표가 높은 기업 최신 10건과 유사 심사사례 보고서를 함께 찾아줘.";
  // 프롬프트 조합 가이드 — 켜진 업무지식베이스가 2개 이상이면 소스별 실행방식·작성 팁을 안내.
  const enabledForGuide = homeIschEnabledSources(sources);
  const guide = enabledForGuide.length >= 2 ? `
        <div class="home-isch-guide">
          <div class="home-isch-guide-hd">🧩 프롬프트 조합 가이드 <span>— 켜진 지식베이스 ${enabledForGuide.length}개가 하나의 질의로 함께 실행됩니다</span></div>
          <ul class="home-isch-guide-list">
            ${enabledForGuide.map(k => {
              const svc = AI_SERVICE_REGISTRY[k];
              const kindLabel = homeSourceKind(k) === "db" ? "자연어→SQL" : "문서검색";
              return `<li><b>${escapeHtml(svc?.label || k)}</b> <em class="${homeSourceKind(k)}">${kindLabel}</em> — ${escapeHtml(svc?.defaultInstruction || homeDataSourceIntro(k))}</li>`;
            }).join("")}
          </ul>
          <p class="home-isch-guide-tip">작성 팁: ① 분석대상(기업·품목·기간)을 먼저 쓰고 ② 각 지식베이스에서 확인할 내용을 한 문장씩 이어 쓰면, 의도분석이 소스별 실행계획(순서·연계)으로 자동 분해합니다. '기본값 채우기'를 누르면 켜진 소스 기준의 질의 골격이 채워집니다.</p>
        </div>` : "";
  return `
    <div class="home-svc-panel home-isch-frame${collapsed ? " is-collapsed" : ""}" data-home-source-card="__integrated__">
      <div class="home-isch-head">
        <span class="home-frame-order src" title="실행 순서">1</span>
        <strong class="home-frame-title">통합 지식 검색</strong>
        <span class="home-source-badge">업무지식베이스</span>
        <div class="home-card-actions home-isch-actions">
          <button type="button" class="home-mini-btn" data-home-isch-clear title="통합 질의를 비웁니다">지우기</button>
          <button type="button" class="home-mini-btn" data-home-isch-default title="켜진 지식베이스 기준 질의 골격을 채웁니다">기본값 채우기</button>
          <button type="button" class="home-mini-btn home-card-coach-btn" data-home-isch-coach title="질의를 점검하고 재구성안을 제시합니다">AI코칭</button>
          <button type="button" class="home-mini-btn home-run-single" data-home-isch-run title="켜진 업무지식베이스에 통합 질의를 동시 실행">AI분석실행</button>
          ${homeCardCollapseToggleHtml("__integrated__")}
        </div>
      </div>
      <div class="home-isch-body">
        <p class="home-isch-desc">검색할 지식 소스를 선택하세요. 자연어 질의는 정형DB에서는 <b class="db">자연어→SQL</b>로, 업무 RAG에서는 <b class="rag">의미 기반 문서검색</b>으로 실행됩니다.</p>
        <div class="home-isch-chips">${chips}</div>
        ${guide}
        <textarea class="home-isch-prompt" data-home-integrated-prompt placeholder="${escapeHtml(ph)}">${escapeHtml(homeIntegratedPromptText)}</textarea>
        <p class="home-source-example">검색 조건 예) 품목이 ~인 기업목록 · 특정인이 작성한 보고서 중 최신 10건 · 위험지표 상위 기업의 사후심사 사례</p>
        <div class="home-isch-plan" data-home-isch-plan hidden></div>
        <div class="home-isch-results">${resultFrames}</div>
      </div>
    </div>
  `;
}

// 통합 지식 검색 기본 질의 골격 — 켜진 지식베이스별 확인 내용을 한 문장씩 이어 쓴다.
function homeIschDefaultPrompt(enabled){
  if(!enabled.length) return "";
  const parts = enabled.map(k => {
    const svc = AI_SERVICE_REGISTRY[k];
    const label = svc?.label || k;
    return homeSourceKind(k) === "db"
      ? `${label}에서 관련 데이터를 조회하고`
      : `${label}에서 관련 규정·사례를 검색하고`;
  });
  return `분석대상 [대상 기업/품목/기간]에 대해 ${parts.join(", ")} 핵심 결과를 종합해줘.`;
}

// 단일 AI 서비스 수행 프레임 (순서 배지 + ▲▼ + 기능 설명 + 동작칩 + 필수 입력값)
function homePipelineFrameHtml(key, idx, total, srcCount, runtimeSteps){
  const svc = AI_SERVICE_REGISTRY[key];
  if(!svc) return "";
  const inline = homeServiceHasInlineTemplate(key);
  const st = homePromptTemplateState[key];
  const opts = svc.behaviorOptions || [];
  const globalOrder = srcCount + idx + 1;
  const gi = srcCount + idx;
  const chips = (inline && opts.length) ? opts.map(opt => {
    const on = (st?.behaviors || []).includes(opt.value);
    return `<button type="button" class="home-tpl-chip${on ? " on" : ""}"
      data-home-tpl-behavior="${escapeHtml(key)}" data-behavior="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>`;
  }).join("") : "";
  const desc = svc.defaultInstruction || "";
  const collapsed = !!homeCardCollapsed[key];
  const head = `
        <div class="home-frame-head">
          <span class="home-frame-order" title="실행 순서">${globalOrder}</span>
          <strong class="home-frame-title">${escapeHtml(svc.label)}</strong>
          <span class="home-frame-move">
            <button type="button" class="home-frame-move-btn" data-home-frame-move="up" data-key="${escapeHtml(key)}" ${idx === 0 ? "disabled" : ""} aria-label="순서 앞으로" title="앞으로">◀</button>
            <button type="button" class="home-frame-move-btn" data-home-frame-move="down" data-key="${escapeHtml(key)}" ${idx === total - 1 ? "disabled" : ""} aria-label="순서 뒤로" title="뒤로">▶</button>
          </span>
        </div>`;

  // 전용 입력 서비스(번역·요약·표준보고서·공유): 폼을 카드 본문에 전폭으로 인라인 렌더(2단 분할 없음).
  // 작업 패널이 없으므로 접기 버튼은 카드 헤더 오른쪽 끝에 둔다.
  if(HOME_DEDICATED_PANEL_SERVICES.has(key)){
    const dedHead = head.replace("</div>", `  ${homeCardCollapseToggleHtml(key)}\n        </div>`);
    return `
    <div class="home-svc-panel home-pipeline-frame home-ded-frame${collapsed ? " is-collapsed" : ""}" data-home-pipeline-frame="${escapeHtml(key)}">
      ${dedHead}
      ${desc ? `<p class="home-frame-desc">${escapeHtml(desc)}</p>` : ""}
      <div class="home-ded-body">${homeDedicatedPanelInnerHtml(key)}</div>
    </div>
  `;
  }

  const body = inline
    ? `${desc ? `<p class="home-frame-desc">${escapeHtml(desc)}</p>` : ""}
       ${chips ? `<div class="home-tpl-chips">${chips}</div>` : ""}
       ${homeInputChipsHtml(key)}`
    : "";
  const infoCollapsed = !!homeCardInfoCollapsed[key];
  // 설명 프레임 접기 버튼은 카드 헤더(제목 줄) 오른쪽 끝에 둔다.
  const rowHead = head.replace("</div>", `  ${homeCardInfoToggleHtml(key)}\n        </div>`);
  return `
    <div class="home-svc-panel home-pipeline-frame home-card-row${collapsed ? " is-collapsed" : ""}${infoCollapsed ? " info-collapsed" : ""}" data-home-pipeline-frame="${escapeHtml(key)}">
      <div class="home-card-info">
        ${rowHead}
        ${body}
      </div>
      ${homeCardWorkPanel(key, "agent", gi)}
    </div>
  `;
}

function homeRenderPromptTemplatePanels(){
  const container = document.getElementById("homePromptTemplatePanels");
  if(!container) return;
  const { sources } = homeSelectedAnalysisOptions();
  const aiOrder = homeSyncPipelineOrder();
  // 선택 해제된 AI 서비스·업무지식베이스는 상태에서 제거
  Object.keys(homePromptTemplateState).forEach(key => { if(!aiOrder.includes(key) && !sources.includes(key)) delete homePromptTemplateState[key]; });
  Object.keys(homeCardCollapsed).forEach(key => { if(key !== "__integrated__" && !sources.includes(key) && !aiOrder.includes(key)) delete homeCardCollapsed[key]; });
  Object.keys(homeCardInfoCollapsed).forEach(key => { if(!sources.includes(key) && !aiOrder.includes(key)) delete homeCardInfoCollapsed[key]; });
  Object.keys(homeCardResultState).forEach(key => { if(!sources.includes(key) && !aiOrder.includes(key)) delete homeCardResultState[key]; });
  // 신규 AI 서비스 동작칩 상태 초기화
  aiOrder.forEach(key => {
    if(homeServiceHasInlineTemplate(key) && !homePromptTemplateState[key]){
      homePromptTemplateState[key] = { behaviors: homeTemplateDefaultBehaviors(key), text: "", edited: false };
    }
  });
  // 신규 업무지식베이스 분석범위 상태 초기화 — 시나리오와 동일한 기본 선택(defaultBehaviors)
  sources.forEach(key => {
    if((AI_SERVICE_REGISTRY[key]?.behaviorOptions?.length || 0) > 0 && !homePromptTemplateState[key]){
      homePromptTemplateState[key] = { behaviors: sourceDefaultBehaviors(key), text: "", edited: false };
    }
  });

  if(!sources.length && !aiOrder.length){
    container.innerHTML = "";
    homeToggleComposerTa(true);
    homeSyncCombinedPrompt();
    return;
  }

  const runtimeSteps = [...sources, ...aiOrder];
  // 좌→우 가로 흐름: 업무지식베이스(검색) 카드 → AI 분석서비스 프레임, 사이에 화살표
  // 업무지식베이스 2개 이상 선택 시 개별 카드 대신 단일 '통합 지식 검색' 프레임으로 묶는다.
  const sourceCards = sources.length >= 2
    ? [homeIntegratedSourceFrameHtml(sources)]
    : sources.map((key, i) => homeDataSourceCardHtml(key, i + 1));
  const cards = [
    ...sourceCards,
    ...aiOrder.map((key, p) => homePipelineFrameHtml(key, p, aiOrder.length, sources.length, runtimeSteps)),
  ];
  const flow = cards.join("");

  const collapseKeys = homeCollapseKeys(sources, aiOrder);
  const allCollapsed = collapseKeys.length > 0 && collapseKeys.every(key => homeCardCollapsed[key]);
  const bulkBtn = runtimeSteps.length > 1
    ? `<button type="button" class="home-pipeline-collapse-all" data-home-collapse-all="${allCollapsed ? "expand" : "collapse"}">${allCollapsed ? "모두 펴기" : "모두 접기"}</button>
       <button type="button" class="home-pipeline-reset-all" data-home-reset-all title="모든 카드를 접고 수행 결과를 비웁니다">모두 닫고 초기화</button>`
    : "";
  container.innerHTML = `
    <div class="home-pipeline-wrap">
      <div class="home-pipeline-head">
        <div class="home-pipeline-head-row">
          <strong>수행 흐름</strong>
          ${bulkBtn}
        </div>
        <span>각 AI 서비스는 독립적으로 동작하며, [입력값 이름] 자리에 값을 채워 호출합니다. ◀▶ 로 순서를 조정하고, 입력값은 직접 입력하거나 선행 서비스 결과를 선택해 연계하세요.</span>
      </div>
      <div class="home-pipeline-flow">${flow}</div>
    </div>
  `;
  // 수행 흐름 카드가 있으면 각 카드에 전용 프롬프트 창이 있으므로 하단 통합 입력창은 숨긴다
  homeToggleComposerTa(false);
  // 보존된 수행 결과를 복원(서비스 추가 등 재렌더 시 결과 유지)
  homeRestoreCardResults();
  // 선택/입력에 맞춰 통합 프롬프트를 입력창에 자동 생성
  homeSyncCombinedPrompt();
}

/* 접기/펴기 대상 카드 키 목록 — 업무지식베이스 2개 이상은 단일 '통합 지식 검색' 프레임("__integrated__")으로
   렌더되므로 개별 소스 키 대신 그 키를 사용해야 전체 접기·초기화가 통합 프레임에도 적용된다. */
function homeCollapseKeys(sources, aiOrder){
  const src = sources || homeSelectedAnalysisOptions().sources;
  const ai = aiOrder || homeSyncPipelineOrder();
  return [...(src.length >= 2 ? ["__integrated__"] : src), ...ai];
}

/* 하단 통합 프롬프트 입력창 표시 토글 — 수행 흐름이 비어 있을 때만 보인다.
   숨겨진 동안에도 값은 homeSyncCombinedPrompt()로 계속 동기화되어 실행에 사용된다. */
function homeToggleComposerTa(show){
  const ta = document.getElementById("coachPrompt");
  if(ta) ta.style.display = show ? "" : "none";
}

// 프레임 순서 이동 (▲▼)
function homeMovePipelineFrame(key, dir){
  const idx = homePipelineOrder.indexOf(key);
  if(idx < 0) return;
  const swap = dir === "up" ? idx - 1 : idx + 1;
  if(swap < 0 || swap >= homePipelineOrder.length) return;
  [homePipelineOrder[idx], homePipelineOrder[swap]] = [homePipelineOrder[swap], homePipelineOrder[idx]];
  homeRenderPromptTemplatePanels();
}

function homeAddShareEmailIds(rawValue){
  const emails = normalizeEmailIds(rawValue);
  if(!emails.length) return false;
  const invalid = emails.find(email => !isValidEmailId(email));
  if(invalid){
    alert(`올바른 이메일 ID를 입력하세요: ${invalid}`);
    return false;
  }
  homeShareEmailIds = [...new Set([...homeShareEmailIds, ...emails])];
  const input = document.getElementById("homeShareEmailInput");
  if(input) input.value = "";
  homeRenderShareEmailPanel();
  return true;
}

function homeAgentDefForKey(key){
  return HOME_DEFAULT_AGENTS.find(agent => agent.key === key || agent.type === key) || null;
}

function homeRunAgentsFromSelection(selection){
  // 실행 순서: 업무지식베이스(데이터소스, 선택 순서) 먼저 → AI 분석서비스(사용자 정의 순서)
  const sources = (selection.sources || []);
  const aiOrder = homeSyncPipelineOrder();
  const keys = [...sources, ...aiOrder];
  return uniqueByKey(keys.map(homeAgentDefForKey).filter(Boolean));
}

function homeResultByLabel(...needles){
  const entry = Object.entries(homeRunResults)
    .find(([label]) => needles.some(needle => label.includes(needle)));
  return entry ? entry[1] : "";
}

function homeToggleAnalysisOption(button){
  if(!button) return;
  if(button.classList.contains("home-picker-trigger")) return;
  const selected = !button.classList.contains("selected");
  button.classList.toggle("selected", selected);
  const check = button.querySelector(".home-check");
  if(check){
    check.classList.toggle("on", selected);
    check.classList.toggle("off", !selected);
    check.textContent = selected ? "✓" : "";
  }
  const status = button.querySelector(".home-select-status");
  if(status){
    status.classList.toggle("selected", selected);
    status.textContent = selected ? "✓" : "×";
  }
  if(button.dataset.homeAgent === "mail_share") homeRenderShareEmailPanel();
  homeRenderServiceInputPanels();
  homeRenderPromptTemplatePanels();
}

function homeSyncPickerStatuses(){
  const ragTrigger = document.querySelector(".home-picker-trigger[data-home-source]");
  const agentTrigger = document.querySelector(".home-picker-trigger[data-home-agent]");
  [
    [ragTrigger, homeSelectedRagKeys.length],
    [agentTrigger, homeSelectedAgentKeys.length],
  ].forEach(([button, count]) => {
    if(!button) return;
    button.classList.toggle("active", count > 0);
    const status = button.querySelector(".home-select-status");
    if(status){
      status.classList.toggle("selected", count > 0);
      status.textContent = count > 0 ? "" : "×";
      status.title = count > 0 ? `${count}개 선택됨` : "선택 없음";
    }
  });
}

// ── 홈 피커: 레지스트리 기반 그룹 정의 ──────────────────────────────────────
const HOME_PICKER_GROUPS = {
  rag: [
    { groupKey: DB_SEARCH_GROUP,  label: "DB 조회",   icon: "🗄" },
    { groupKey: RAG_SEARCH_GROUP, label: "RAG 검색",  icon: "📚" },
  ],
  agent: [
    { groupKey: ANALYSIS_AI_GROUP,  label: "업무분석 AI서비스",   icon: "🔍" },
    { groupKey: LLM_SERVICE_GROUP,  label: "분석지원 AI 서비스",  icon: "🧰" },
    { groupKey: EXTERNAL_AI_GROUP,  label: "외부연계 AI서비스",           icon: "🌐" },
    { groupKey: REPORT_AI_GROUP,    label: "보고서 생성 및 검증",         icon: "📋" },
  ],
};

function homePickerSelectedKeys(kind){
  return kind === "rag" ? homeSelectedRagKeys : homeSelectedAgentKeys;
}

function homeSetPickerSelectedKeys(kind, keys){
  const unique = [...new Set(keys)];
  if(kind === "rag") homeSelectedRagKeys = unique;
  else homeSelectedAgentKeys = unique;
  homeSyncPickerStatuses();
}

function homePickerTitle(kind){
  return kind === "rag" ? "업무지식베이스" : "AI 분석 서비스";
}

function homePickerDescription(kind){
  return kind === "rag"
    ? "질의 시 검색할 데이터 원천(DB 조회 / RAG 검색)을 선택하세요."
    : "질의 시 활용할 AI 서비스를 선택하세요. 복수 선택 가능합니다.";
}

function homePickerCardHtml(kind, key){
  const svc = AI_SERVICE_REGISTRY[key];
  if(!svc) return "";
  const selected = homePickerSelectedKeys(kind).includes(key);
  const status = permissionStatus(key);
  const isGranted = status === "granted";
  const desc = isGranted ? (svc.defaultInstruction || "") : permissionLabel(status);
  const lockedClass = isGranted ? "" : " locked";
  const selectedClass = selected ? " selected" : "";
  return `
    <button class="hpk-card${selectedClass}${lockedClass}" type="button"
      data-home-picker-toggle="${escapeHtml(key)}" data-granted="${isGranted}"
      ${isGranted ? "" : "disabled"} title="${escapeHtml(svc.label)}">
      <span class="hpk-card-label">${escapeHtml(svc.label)}</span>
      <span class="hpk-card-desc">${escapeHtml(desc)}</span>
      ${selected ? `<span class="hpk-check">✓</span>` : ""}
      ${!isGranted ? `<span class="hpk-lock">🔒</span>` : ""}
    </button>
  `;
}

function homePickerGroupSection(kind, groupMeta){
  const allKeys = Object.entries(AI_SERVICE_REGISTRY)
    .filter(([, v]) => v.group === groupMeta.groupKey && v.selectable !== false && v.adminVisible !== false)
    .map(([k]) => k);
  if(!allKeys.length) return "";
  return `
    <div class="hpk-section">
      <div class="hpk-section-hdr">
        <span class="hpk-section-icon">${groupMeta.icon}</span>
        <span class="hpk-section-title">${escapeHtml(groupMeta.label)}</span>
        <span class="hpk-section-count">${allKeys.length}개</span>
      </div>
      <div class="hpk-cards">
        ${allKeys.map(key => homePickerCardHtml(kind, key)).join("")}
      </div>
    </div>
  `;
}

export function openHomePicker(kind){
  document.getElementById("homePickerOverlay")?.remove();
  const groups = HOME_PICKER_GROUPS[kind] || [];
  const sectionsHtml = groups.map(g => homePickerGroupSection(kind, g)).join("");
  const selectedCount = homePickerSelectedKeys(kind).length;
  const html = `
    <div class="home-permission-overlay" id="homePickerOverlay" data-home-picker-kind="${escapeHtml(kind)}">
      <div class="hpk-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(homePickerTitle(kind))}">
        <div class="hpk-head">
          <div>
            <h2>${escapeHtml(homePickerTitle(kind))}</h2>
            <p>${escapeHtml(homePickerDescription(kind))}</p>
          </div>
          <div class="hpk-head-right">
            ${selectedCount > 0 ? `<span class="hpk-sel-count">${selectedCount}개 선택됨</span>` : ""}
            <button class="home-permission-close" type="button" data-home-picker-close aria-label="닫기">×</button>
          </div>
        </div>
        <div class="hpk-body">
          ${sectionsHtml}
        </div>
        <div class="hpk-footer">
          <span>※ 권한이 없는 서비스는 비활성화됩니다. 필요 시 권한을 요청하세요.</span>
          <button class="btn-primary hpk-confirm" type="button" data-home-picker-close>확인</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
}

function detectCompanyId(prompt){
  const m = prompt.match(/C-\d{4}/);
  if(m) return m[0];
  if(/한국소재무역/.test(prompt)) return "C-1001";
  if(/서울인터내셔널/.test(prompt)) return "C-1002";
  if(/제주리테일/.test(prompt)) return "C-1008";
  if(/대한전자/.test(prompt)) return "C-1004";
  if(/대전바이오/.test(prompt)) return "C-1007";
  return "";
}

function homeDetailMarkup(){
  const agentLabels = Object.keys(homeStepStatus);
  const html = agentLabels.map(label => {
    const status = homeStepStatus[label] || "wait";
    const output = homeRunResults[label];
    const statusBadge =
      status === "done"    ? `<span class="home-detail-badge done">완료</span>` :
      status === "running" ? `<span class="home-detail-badge running">실행 중</span>` :
      status === "error"   ? `<span class="home-detail-badge error">오류</span>` :
                              `<span class="home-detail-badge wait">대기</span>`;
    const bodyHtml = output
      ? `<div class="home-detail-body markdown-output">${markdownToHtml(output)}</div>`
      : (status === "running" ? `<div class="home-detail-body muted">실행 중...</div>` : "");
    return `
      <details class="home-detail-item" ${status === "running" || status === "error" ? "open" : ""}>
        <summary><b>${escapeHtml(label)}</b> ${statusBadge}</summary>
        ${bodyHtml}
      </details>`;
  }).join("");
  return `
    <section class="home-result-detail" id="homeResultDetail">
      <h3>분석 상세 결과</h3>
      ${html || `<div class="home-detail-body muted">실행할 RAG 또는 AI 서비스 결과가 아직 없습니다.</div>`}
    </section>
  `;
}

/* 결과 영역 재렌더 중 스크롤 위치를 유지한다.
   실행 중에는 단계마다 상세 영역을 다시 그리는데, 그때마다 맨 위로 튀면 결과를 읽을 수 없다. */
function homeKeepScroll(render){
  const pane = document.querySelector(".home-result-area") || document.scrollingElement;
  const top = pane ? pane.scrollTop : 0;
  render();
  if(pane && top) pane.scrollTop = top;
}

function homeRenderDetail(){
  const detailInResult = document.getElementById("homeResultDetail");
  if(detailInResult){
    homeKeepScroll(() => {
      detailInResult.outerHTML = homeDetailMarkup();
      applyHomeSummaryCollapsed();   // 재렌더 후에도 접힘 상태 유지
    });
    return;
  }
  const legacyDetail = document.getElementById("homeAnalysisDetail");
  if(legacyDetail){
    legacyDetail.style.display = "none";
    legacyDetail.innerHTML = "";
  }
}

// ── 홈 분석: 에이전트 스트리밍 실행 ───────────────────────────────────────────
function homeStreamAgents(prompt, companyId, runAgents, btn, displayCompanyId = ""){
  if(homeEventSource){ try{ homeEventSource.close(); }catch(e){} homeEventSource = null; }

  const resultBox = document.getElementById("homeResultBox");

  const effectiveAgents = runAgents;

  homeStepStatus = {};
  effectiveAgents.forEach(a => { homeStepStatus[a.label] = "wait"; });
  const labelToKey = {};
  effectiveAgents.forEach(a => { labelToKey[a.label] = a.key; });
  homeRenderDetail();

  const scenarioItems = effectiveAgents.map((a, i) => {
    // 프롬프트 템플릿 카드에서 서비스별 동작·개인화 프롬프트를 구성했으면 우선 적용
    const tpl = homePromptTemplateState[a.key];
    const behaviors = tpl && tpl.behaviors.length ? tpl.behaviors : ["기본"];
    const behaviorLabel = (tpl && tpl.behaviors.length)
      ? tpl.behaviors.map(v => (AI_SERVICE_REGISTRY[a.key]?.behaviorOptions || []).find(o => o.value === v)?.label || v).join(", ")
      : "기본";
    // 카드 프롬프트가 입력값의 단일 출처 — 그대로 지시문으로 사용
    const cardText = (homeCardPromptState[a.key]?.text || "").trim();
    const instruction = cardText || ((tpl && tpl.text.trim()) ? tpl.text.trim() : prompt);
    return {
      id: `home_${i}`,
      type: a.type,
      key: a.key,
      label: a.label,
      order: i + 1,
      behaviors,
      behavior: behaviors[0] || "기본",
      behaviorLabel,
      instruction,
    };
  });

  const payload = {
    scenario_items: scenarioItems,
    target_type: "company",
    targetType: "company",
    db_query: true,
    rag_enabled: true,
    rag_customs_public: true,
    rag_audit: true,
    bigdata_enabled: false,
    llm_mode: homeLlmMode(),
    myai_mode: true,   // MyAI 분석: CDW 자연어조회를 자연어→SQL로 직접 수행(정형 위험요약 대체 안 함)
    user_prompt: prompt,
    upload_session_id: coachUploadSessionId || undefined,
    // 파일 본문은 URL에 싣지 않는다 — 이 payload는 GET 쿼리로 나가는데
    // 요청라인 한도(약 64KB)를 넘으면 414가 나서 OCR 등 파일 서비스가 실패한다.
    // 첨부는 이미 /api/upload 세션으로 서버에 있고(upload_session_id), 서버가
    // scenario.uploaded_files 로 주입하므로 여기서 다시 보낼 필요가 없다.
    // 세션이 없을 때(업로드 실패)만 소용량 본문을 폴백으로 함께 보낸다.
    uploaded_files: coachUploadSessionId ? undefined : homeSmallAttachments(),
    file_links: coachFileLinkSummaries(),
    attached_files_summary: coachAttachedFileSummaries(),
    share_recipients: homeShareEmailIds,
    ...homeServiceInputPayload(),
  };

  const url = `/api/run?company_id=${encodeURIComponent(companyId)}&scenario=${encodeURIComponent(JSON.stringify(payload))}`;
  let completed = 0;
  const total = effectiveAgents.length;

  console.info(`[MyAI분석] AI서비스 호출: ${effectiveAgents.map(a => a.label).join(", ")}`);

  homeEventSource = openRunEventStream(url, {
  onStep(data){
    const label = data.label;
    if(data.status === "running"){
      homeStepStatus[label] = "running";
      homeUpdateCardResult(labelToKey[label], "running");
      console.info(`[MyAI분석] ${label} 실행 시작`);
    } else if(data.status === "done"){
      completed += 1;
      homeStepStatus[label] = "done";
      homeRunResults[label] = data.output || "결과 없음";
      homeUpdateCardResult(labelToKey[label], "done", homeRunResults[label]);
      console.info(`[MyAI분석] ${label} 완료 — 결과 ${(data.output || "").length}자 수신`);
      if(resultBox){
        const progressBar = resultBox.querySelector(".home-progress-fill");
        if(progressBar) progressBar.style.width = `${Math.round((completed / total) * 100)}%`;
      }
    } else if(data.status === "error"){
      homeStepStatus[label] = "error";
      homeRunResults[label] = data.error || "오류 발생";
      homeUpdateCardResult(labelToKey[label], "error",
        `${homeRunResults[label]}\n\n조건을 더 구체적으로 보완해 다시 시도하세요. ` +
        `특정 기업이 대상이면 기업명 또는 ID(예: C-1002)를 함께 적고, ` +
        `전체 기업 집계라면 원하는 지표·정렬·개수를 명시하세요.`);
      console.error(`[MyAI분석] ${label} 오류: ${data.error || "실행 오류"}`);
    }
    homeRenderDetail();
  },

  onWorkflow(data){
    if(data.status === "completed"){
      homeRenderSummary(prompt, companyId, "agents", displayCompanyId);
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      homeEventSource = null;
    } else if(data.status === "failed"){
      if(resultBox){
        resultBox.innerHTML = `<h3>AI통합분석결과</h3><p class="high">분석 중 오류가 발생했습니다.</p>`;
      }
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      homeEventSource = null;
    }
  },

  onDisconnect(){
    // 스트림이 끊겼는데(예: 서버가 4xx로 반려) 아직 완료되지 않은 카드는 '오류'로 표시해
    // 무한 '실행 중...' 멈춤을 방지하고, 보완 방향을 대화형 안내로 제시한다.
    effectiveAgents.forEach(a => {
      const stt = homeStepStatus[a.label];
      if(stt === "wait" || stt === "running"){
        homeStepStatus[a.label] = "error";
        homeUpdateCardResult(a.key, "error",
          "수행을 완료하지 못했습니다. 아래를 확인해 조건을 보완한 뒤 다시 시도하세요.\n\n" +
          "- 조회 조건이 구체적인가요? (대상 기업·품목·기간 등)\n" +
          "- 특정 기업이 대상이면 기업명 또는 ID(예: C-1002)를 함께 적었나요?\n" +
          "- 전체 기업 대상 집계(예: 오류율 상위 10개)라면 그대로 다시 시도하면 됩니다.");
      }
    });
    homeRenderDetail();
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    homeEventSource = null;
  },
  });
}

// ── 홈 분석: LLM 직접 답변 표시 ───────────────────────────────────────────────
function homeShowLlmAnswer(prompt, answer, reasoning, btn){
  const resultBox = document.getElementById("homeResultBox");
  const detail = document.getElementById("homeAnalysisDetail");
  if(detail) detail.style.display = "none";
  if(resultBox){
    resultBox.innerHTML = `
      <h3>AI통합분석결과</h3>
      <p class="muted" style="font-size:12px;margin-bottom:8px">
        ${escapeHtml(reasoning || "내부 AI 서비스 없이 LLM이 직접 답변합니다.")}
      </p>
      ${homePromptEchoHtml(prompt)}
      <div class="markdown-output">${markdownToHtml(answer || "결과 없음")}</div>
    `;
    resultBox.style.display = "block";
    homeToggleGreeting(false);
  }
  setHomeActionLabel(btn, "AI실행");
  btn.disabled = false;
}

function homeToggleGreeting(show){
  const g = document.getElementById("homeGreeting");
  if(g) g.style.display = show ? "" : "none";
}

// 실행한 프롬프트 입력창을 초기 안내문 상태로 되돌려 다음 입력을 준비한다.
function homeResetPromptInput(){
  const ta = document.getElementById("coachPrompt");
  if(!ta) return;
  ta.value = ta.dataset.initialText || "";
  ta.classList.add("is-initial");
  const cc = document.getElementById("coachCharCount");
  if(cc) cc.textContent = "0자";
}

// 결과 영역 상단에 실행한 프롬프트 본문을 표시하는 블록.
function homePromptEchoHtml(prompt){
  return `<div class="home-running-prompt">${escapeHtml(prompt || "")}</div>`;
}

/* resultBox.innerHTML 재작성 시 이미 렌더된 DB 조회 결과(.home-db-results)를 보존한다.
   CDW 자연어조회 + 다른 AI서비스 동시 선택 시 agents 모드 렌더가 DB 결과를 지우는 문제 방지 */
function homePreserveDbResults(resultBox, render){
  const dbResults = resultBox?.querySelector(".home-db-results");
  homeKeepScroll(() => { render(); applyHomeSummaryCollapsed(); });
  if(dbResults && resultBox){
    const detailEl = resultBox.querySelector(".home-result-detail");
    if(detailEl) resultBox.insertBefore(dbResults, detailEl);
    else resultBox.appendChild(dbResults);
  }
}

// ── 홈 분석 진입점 — 프롬프트 의도 분석 후 분기 ──────────────────────────────
/* 미선택 실행에서 의도분석이 내부 서비스를 찾지 못한 경우의 폴백 —
   내부LLM only: 내부 LLM 자체 답변 / 외부+내부: 외부 LLM 검색으로 전환 */
async function homeNoInternalFallback(prompt, btn, llmMode, presetAnswer = ""){
  const useMode = llmMode === "int" ? "int" : "ext";
  let answer = (presetAnswer || "").trim();
  let d = null;
  if(!answer){
    try {
      const r = await fetch("/api/llm_query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt, llm_mode: useMode,
          upload_session_id: coachUploadSessionId || undefined,
          attached_files: coachAttachedFileSummaries(),
          file_links: coachFileLinkSummaries(),
        }),
      });
      d = await r.json();
      answer = d.answer || "결과를 가져올 수 없습니다.";
    } catch(e) { answer = "LLM 호출에 실패했습니다."; }
  }
  const reasoning = llmMode === "int"
    ? "의도분석 결과 해당 내부 서비스(CDW·RAG·AI서비스) 없음 → 내부 LLM 자체 답변"
    : `내부 서비스에서 답변 항목 없음 → 외부 LLM 검색 · ${homeLlmModeReasoning({ ...(d || {}), llm_mode: "ext" })}`;
  homeShowLlmAnswer(prompt, answer, reasoning, btn);
}

async function homeRunAnalysis(prompt, btn){
  if(homeEventSource){ try{ homeEventSource.close(); }catch(e){} homeEventSource = null; }
  homeRunResults = {};
  homeStepStatus = {};

  const resultBox = document.getElementById("homeResultBox");
  const detail = document.getElementById("homeAnalysisDetail");
  const selectedOptions = homeSelectedAnalysisOptions();
  const selectedRunAgents = homeRunAgentsFromSelection(selectedOptions);
  const hasSelectedInternalTool = selectedRunAgents.length > 0;
  const llmMode = homeLlmMode();   // ext(외부only) | int(내부only) | ext_int(외부+내부)
  // AI 분석서비스 필수 입력값 검증 — 부족하면 실행 전에 대화형으로 되묻는다(선제적 clarify)
  if(hasSelectedInternalTool){
    const missing = homeFirstMissingRequired();
    if(missing){
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      const svcLabel = AI_SERVICE_REGISTRY[missing.key]?.label || missing.key;
      if(resultBox){ resultBox.style.display = "block"; homeToggleGreeting(false); }
      document.querySelector(`[data-home-pipeline-frame="${cssString(missing.key)}"]`)?.scrollIntoView({ behavior:"smooth", block:"nearest" });
      homeMountClarify(resultBox, svcLabel, missing.def, (val) => {
        // 카드 프롬프트의 [입력값 이름] 토큰을 입력값으로 치환(입력값은 프롬프트가 단일 출처)
        const token = `[${missing.def.label}]`;
        const cur = (homeCardPromptState[missing.key]?.text ?? homeAgentPromptPlainText(missing.key)) || "";
        homeCardPromptState[missing.key] = { text: cur.replace(token, val), edited: true };
        homeRenderPromptTemplatePanels();          // 토큰·통합 프롬프트 갱신
        homeRunAnalysis(coachPromptText(), btn);   // 보완 후 재실행(나머지 미입력은 다시 되묻기)
      });
      return;
    }
  }
  if(selectedOptions.agents.includes("mail_share")){
    const pendingEmail = document.getElementById("homeShareEmailInput")?.value || "";
    if(pendingEmail.trim() && !homeAddShareEmailIds(pendingEmail)){
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      return;
    }
  }
  if(selectedOptions.agents.includes("mail_share") && homeShareEmailIds.length === 0){
    if(resultBox){
      resultBox.style.display = "block";
      homeToggleGreeting(false);
      resultBox.innerHTML = `
        <h3>AI통합분석결과</h3>
        <p class="high">분석결과 공유 AI 서비스를 사용하려면 수신 이메일 ID를 1개 이상 등록하세요.</p>
      `;
    }
    (document.getElementById("homeMailSharePanel")
      || document.querySelector('[data-home-pipeline-frame="mail_share"]'))
      ?.scrollIntoView({ behavior:"smooth", block:"nearest" });
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    return;
  }

  // 실행과 동시에 입력창을 초기화하여 다음 입력을 준비한다.
  homeResetPromptInput();

  // 로딩 상태 표시
  if(resultBox){
    resultBox.style.display = "block";
    homeToggleGreeting(false);
    resultBox.innerHTML = `
      <h3>AI통합분석결과</h3>
      <div class="home-running-line">
        <span class="home-running-dot"></span>
        <span>${hasSelectedInternalTool ? "선택된 데이터소스와 AI 서비스를 준비합니다."
          : (isCopilotMode || llmMode !== "ext") ? "의도를 분석해 권한 있는 내부 서비스(CDW·RAG·AI서비스)를 자동 선택합니다."
          : "외부 LLM 단독 답변으로 처리합니다."}</span>
      </div>
      <div class="home-running-prompt">${escapeHtml(prompt)}</div>
    `;
  }
  if(detail){ detail.style.display = "none"; }

  setHomeActionLabel(btn, "분석 중…");
  btn.disabled = true;

  // AI 코칭 결과에서 추천 에이전트 키 추출
  const coachUses = [...new Set(
    (coachSuggestions || []).flatMap(s => s.uses || [])
  )];

  // 미선택 실행의 모드별 동작:
  //  (1) 외부LLM only(ext)      → 외부 LLM 단독 답변(아래 조기 분기)
  //  (2) 내부LLM only(int)      → 의도분석으로 권한 있는 내부 서비스(CDW·RAG·AI서비스) 자동 선택
  //  (3) 외부+내부(ext_int)     → 내부 우선 수행, 해당 내부 서비스가 없으면 외부 LLM 검색
  //  Copilot 모드는 항상 의도분석 자동 라우팅.
  if(!hasSelectedInternalTool && !isCopilotMode && llmMode === "ext"){
    let answer = "";
    let reasoning = "외부LLM only — 내부 서비스 미사용, 외부 LLM 단독 답변";
    try {
      const r = await fetch("/api/llm_query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          llm_mode: homeLlmMode(),
          upload_session_id: coachUploadSessionId || undefined,
          attached_files: coachAttachedFileSummaries(),
          file_links: coachFileLinkSummaries(),
        }),
      });
      const d = await r.json();
      answer = d.answer || "결과를 가져올 수 없습니다.";
      reasoning = homeLlmModeReasoning(d);
    } catch(e) {
      answer = "LLM 호출에 실패했습니다.";
    }
    homeShowLlmAnswer(prompt, answer, reasoning, btn);
    return;
  }

  // DB조회 서비스(db_cdw 등)도 별도 분기 없이 'AI서비스 분석작업'과 동일한
  // /api/run 워크플로 파이프라인으로 실행한다. (agent_db가 기업 미지정 시 NL→SQL 폴백)

  // 1단계: LLM으로 프롬프트 의도 분석
  let intent;
  try {
    const res = await fetch("/api/analyze_intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        llm_mode: homeLlmMode(),
        coach_uses: coachUses,
        selected_sources: selectedOptions.sources,
        selected_agents: selectedOptions.agents,
        upload_session_id: coachUploadSessionId || undefined,
        attached_files: coachAttachedFileSummaries(),
        file_links: coachFileLinkSummaries(),
      }),
    });
    intent = await res.json();
  } catch(e) {
    if(resultBox) homePreserveDbResults(resultBox, () => {
      resultBox.innerHTML = `<h3>AI통합분석결과</h3><p class="high">서버 연결에 실패했습니다.</p>`;
    });
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    return;
  }

  // LLM 사용 불가 에러
  if(intent.mode === "error"){
    if(resultBox) homePreserveDbResults(resultBox, () => {
      resultBox.innerHTML = `<h3>AI통합분석결과</h3><p class="high">${escapeHtml(intent.error || "LLM을 사용할 수 없습니다.")}</p>`;
    });
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    return;
  }

  const mode       = intent.mode || "agents";
  const reasoning  = intent.reasoning || "";
  const agentDefs  = intent.agent_defs || [];
  const detectedCompanyId = intent.company_id || detectCompanyId(prompt);
  const runCompanyId = detectedCompanyId || "__NO_COMPANY_SELECTED__";

  // 2단계: 모드별 분기 — 의도분석이 내부 서비스 해당 없음(llm_direct)으로 판단한 경우:
  // 내부LLM only → 내부 LLM 자체 답변 / 외부+내부 → 외부 LLM 검색(의도분석 답변 재사용)
  if(mode === "llm_direct" && !hasSelectedInternalTool){
    await homeNoInternalFallback(prompt, btn, llmMode,
      llmMode === "int" ? "" : (intent.llm_answer || ""));
    return;
  }

  // agents 모드 — LLM이 선택한 에이전트만 실행 (DB 조회 포함, 워크벤치와 동일 파이프라인)
  const runAgents = selectedRunAgents.length ? selectedRunAgents : agentDefs;

  if(!runAgents.length){
    if(!hasSelectedInternalTool){
      // 의도분석이 실행할 내부 서비스를 찾지 못함 — 모드별 LLM 폴백
      await homeNoInternalFallback(prompt, btn, llmMode);
      return;
    }
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    return;
  }

  // 기업 ID 표시 업데이트 (이미 렌더된 DB 조회 결과는 보존)
  if(resultBox){
    const agentNames = runAgents.map(a => a.label).join(", ");
    const targetText = detectedCompanyId ? ` (대상 기업: <b>${escapeHtml(detectedCompanyId)}</b>)` : "";
    homePreserveDbResults(resultBox, () => {
      resultBox.innerHTML = `
        <h3>AI통합분석결과</h3>
        <div class="home-running-line">
          <span class="home-running-dot"></span>
          <span>분석 중입니다…${targetText}</span>
        </div>
        <div class="home-running-prompt">${escapeHtml(prompt)}</div>
        <div class="home-progress-bar"><div class="home-progress-fill" style="width:0%"></div></div>
        <p class="muted" style="font-size:12px;margin-top:6px">
          실행 AI 서비스: ${escapeHtml(agentNames)}
          ${reasoning ? `<br>판단 근거: ${escapeHtml(reasoning)}` : ""}
        </p>
        ${homeDetailMarkup()}
      `;
    });
  }
  if(detail){ detail.style.display = "none"; }

  homeStreamAgents(prompt, runCompanyId, runAgents, btn, detectedCompanyId);
}

function homeRenderSummary(prompt, companyId, mode, displayCompanyId = ""){
  const resultBox = document.getElementById("homeResultBox");
  if(!resultBox) return;

  // llm_direct 모드는 homeShowLlmAnswer에서 이미 처리됨
  if(mode === "llm_direct") return;

  // Copilot 모드: 상단 요약·위험 KPI 없이 각 서비스 수행 결과만 표시
  if(isCopilotMode){
    const agentCount = Object.keys(homeStepStatus).length;
    const targetSummary = displayCompanyId ? `대상 기업 <b>${escapeHtml(displayCompanyId)}</b> · ` : "";
    homePreserveDbResults(resultBox, () => {
      resultBox.innerHTML = `
        ${homeSummaryHeadHtml()}
        <div class="home-summary-block"${homeSummaryCollapsed ? ` hidden` : ""}>
          ${homePromptEchoHtml(prompt)}
          <p class="muted" style="font-size:12px">${targetSummary}${agentCount}개 AI 서비스 실행 결과</p>
        </div>
        ${homeDetailMarkup()}
      `;
    });
    return;
  }

  // agents 모드: 실행된 에이전트 결과에서 요약 도출
  const reportText = homeResultByLabel("보고서 생성");
  const mlText     = Object.values(homeRunResults).find((_v, _i) =>
    Object.keys(homeRunResults)[_i].includes("ML 위험모델") || Object.keys(homeRunResults)[_i].includes("ML 모델")) || homeResultByLabel("ML 위험모델", "ML 모델") || "";
  const dvText     = homeResultByLabel("수입신고검증");

  // 위험평가 KPI는 위험평가 성격의 AI 서비스(보고서·ML·수입신고검증)가 실제 실행된 경우에만 표시.
  // 단순 목록/조회 요청에서 결과 텍스트의 '위험'·'주의' 단어만으로 대시보드를 만들지 않는다.
  const riskAssessmentText = reportText + mlText + dvText;
  const hasRiskAssessment  = !!riskAssessmentText.trim();
  const riskHigh   = hasRiskAssessment && /고위험|🔴|저가신고|위반/.test(riskAssessmentText);
  const riskMed    = hasRiskAssessment && /주의|🟡/.test(riskAssessmentText);
  const riskWord   = riskHigh ? "높음" : (riskMed ? "보통" : "낮음");
  const riskClass  = riskHigh ? "high" : (riskMed ? "" : "good");

  const scoreMatch = riskAssessmentText.match(/(\d{2,3})\s*\/\s*100|위험점수[^\d]*(\d{2,3})/);
  const score    = scoreMatch ? (scoreMatch[1] || scoreMatch[2]) : (riskHigh ? "82" : riskMed ? "56" : "35");
  const priority = riskHigh ? "1순위" : "2순위";
  const recommend = riskHigh ? "추가자료 요청" : "정기 모니터링";

  // 최종 결과 종합 > 보고서 > 가장 긴 결과 텍스트 순으로 요약 추출
  const synthesisText = homeResultByLabel("최종 결과 종합");
  const summarySource = synthesisText || reportText ||
    Object.values(homeRunResults).sort((a, b) => b.length - a.length)[0] || "";
  const summaryLines = summarySource
    .split("\n")
    .filter(l => l.trim() && !/^[#\-=]+$/.test(l.trim()))
    .slice(0, 4)
    .join(" ")
    .slice(0, 300);
  const summary = summaryLines || "분석이 완료되었습니다. 각 AI 서비스의 분석 결과는 아래 상세 결과에서 확인하실 수 있습니다.";

  const agentCount = Object.keys(homeStepStatus).length;
  const hasReport  = Object.keys(homeRunResults).some(label => label.includes("보고서 생성"));
  const hasShare   = Object.keys(homeRunResults).some(label => label.includes("분석결과 공유"));
  const targetSummary = displayCompanyId
    ? `대상 기업 <b>${escapeHtml(displayCompanyId)}</b> · `
    : "";

  homePreserveDbResults(resultBox, () => {
    resultBox.innerHTML = `
      ${homeSummaryHeadHtml()}
      <div class="home-summary-block"${homeSummaryCollapsed ? ` hidden` : ""}>
        ${homePromptEchoHtml(prompt)}
        <p>${targetSummary}${agentCount}개 AI 서비스 분석 완료${coachAttachedFiles.length ? ` · 첨부 파일 ${coachAttachedFiles.length}건 활용` : ""}</p>
        ${hasShare ? `<p class="good" style="margin-top:4px">분석결과 보고서가 등록된 이메일 수신자에게 공유 준비되었습니다.</p>` : ""}
        <div class="markdown-output" style="margin-top:8px">${markdownToHtml(summary)}</div>
        ${hasReport || hasRiskAssessment ? `
        <div class="kpi">
          <div>위험 가능성 <b class="${riskClass}">${riskWord}</b></div>
          <div>위험도 점수 <b class="${riskClass}">${score}/100</b></div>
          <div>조사 우선순위 <b>${priority}</b></div>
          <div>권고 조치 <b style="font-size:14px">${recommend}</b></div>
        </div>` : ""}
      </div>
      ${homeDetailMarkup()}
    `;
  });
}

/* AI통합분석결과 머리글 — 접기 토글 포함. 접으면 아래 서비스 결과가 그만큼 넓어진다. */
function homeSummaryHeadHtml(){
  return `
    <div class="home-summary-head">
      <h3>AI통합분석결과</h3>
      <button type="button" class="home-summary-toggle" data-home-summary-toggle
        title="${homeSummaryCollapsed ? "AI통합분석결과 펼치기" : "AI통합분석결과 전체 접기 — 서비스 수행 결과를 넓게 사용"}">
        ${homeSummaryCollapsed ? "▼ 결과 펼치기" : "▲ 결과 접기"}
      </button>
    </div>`;
}

/* ══════════ 이하: app-runtime에서 이동한 컴포저 입력/카드/코치 리스너 ══════════ */

document.addEventListener("input", (event) => {
  if(event.target && event.target.id === "coachPrompt"){
    const cc = document.getElementById("coachCharCount");
    if(cc) cc.textContent = event.target.value.length + "자";
  }
});

// 프롬프트 템플릿 카드 textarea 편집: 개인화 본문 저장 + '수정됨' 표시
document.addEventListener("input", (event) => {
  const tplText = event.target?.closest?.("[data-home-tpl-text]") || (event.target?.dataset?.homeTplText ? event.target : null);
  if(tplText && tplText.dataset.homeTplText){
    const key = tplText.dataset.homeTplText;
    const st = homePromptTemplateState[key];
    if(st){
      st.text = tplText.value;
      st.edited = true;
      const badge = document.querySelector(`[data-home-tpl-edited="${cssString(key)}"]`);
      if(badge) badge.style.display = "inline";
    }
  }
});

// 카드별 프롬프트 직접 편집 (자동등록 후 수정) — contenteditable(AI)·textarea(KB) 모두 지원
document.addEventListener("input", (event) => {
  // 통합 지식 검색: 단일 질의를 선택된 모든 업무지식베이스에 브로드캐스트
  const isch = event.target?.closest?.("[data-home-integrated-prompt]");
  if(isch){
    homeIntegratedPromptText = isch.value;
    const { sources } = homeSelectedAnalysisOptions();
    homeIschEnabledSources(sources).forEach(key => {
      homeCardPromptState[key] = { text: homeIntegratedPromptText, edited: true };
      const hid = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
      if(hid && hid !== isch) hid.value = homeIntegratedPromptText;
    });
    homeSyncCombinedPrompt();
    return;
  }
  const el = event.target?.closest?.("[data-home-card-prompt]");
  if(el){
    const text = el.isContentEditable ? el.innerText : el.value;
    homeCardPromptState[el.dataset.homeCardPrompt] = { text, edited: true };
    homeSyncCombinedPrompt();   // 카드 편집 → 하단 통합 프롬프트 즉시 일치
  }
  // 전용 입력 폼(번역·요약·표준보고서) — 값을 상태에 보존(카드 재렌더 대비)
  const ded = event.target?.closest?.("[data-home-ded]");
  if(ded){
    const st = homeDedicatedInputState[ded.dataset.homeDed];
    if(st) st[ded.dataset.field] = ded.value;
  }
});

// ── 프레임 동적 크기 조절(리사이즈 거터) — 어느 화면이든 .resize-gutter 를 두 패널 사이에 넣으면
//    경계를 끌어 실시간으로 크기를 바꿀 수 있다. 가로=.x(col-resize), 세로=.y(row-resize).
//    기본은 거터의 '이전' 패널을 조절하고, data-resize-target="next" 면 '다음' 패널을 조절한다.
(function initResizeGutters(){
  let drag = null;
  const onMove = (e) => {
    if(!drag) return;
    const cur = drag.dir === "x" ? e.clientX : e.clientY;
    const delta = (cur - drag.startPos) * (drag.target === "next" ? -1 : 1);
    const size = Math.max(drag.min, drag.startSize + delta);
    drag.el.style.flex = "0 0 auto";
    drag.el.style[drag.dir === "x" ? "width" : "height"] = size + "px";
  };
  const stop = () => {
    if(!drag) return;
    drag = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stop);
  };
  document.addEventListener("mousedown", (e) => {
    const gutter = e.target?.closest?.(".resize-gutter");
    if(!gutter) return;
    const dir = gutter.classList.contains("y") ? "y" : "x";
    const target = gutter.dataset.resizeTarget === "next" ? "next" : "prev";
    const el = target === "next" ? gutter.nextElementSibling : gutter.previousElementSibling;
    if(!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    drag = {
      dir, target, el,
      startPos: dir === "x" ? e.clientX : e.clientY,
      startSize: dir === "x" ? rect.width : rect.height,
      min: Number(gutter.dataset.resizeMin) || 120,
    };
    document.body.style.cursor = dir === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", stop);
  });
})();

// 카드별 단일 수행
document.addEventListener("click", (event) => {
  // 통합 지식 검색: 의도분석 실행계획대로 켜진 업무지식베이스를 순차 수행(의존성 주입)
  const ischRun = event.target?.closest?.("[data-home-isch-run]");
  if(ischRun){
    const { sources } = homeSelectedAnalysisOptions();
    const enabled = homeIschEnabledSources(sources);
    if(!enabled.length){ alert("통합수행할 업무지식베이스를 1개 이상 켜주세요."); return; }
    homeRunIntegratedSearch(enabled, ischRun);
    return;
  }
  // 통합 지식 검색: 질의 지우기 / 기본값(질의 골격) 채우기
  const ischClear = event.target?.closest?.("[data-home-isch-clear]");
  const ischDefault = event.target?.closest?.("[data-home-isch-default]");
  if(ischClear || ischDefault){
    const { sources } = homeSelectedAnalysisOptions();
    const enabled = homeIschEnabledSources(sources);
    homeIntegratedPromptText = ischClear ? "" : homeIschDefaultPrompt(enabled);
    const ta = document.querySelector("[data-home-integrated-prompt]");
    if(ta){ ta.value = homeIntegratedPromptText; ta.focus(); }
    enabled.forEach(key => {
      homeCardPromptState[key] = { text: homeIntegratedPromptText, edited: true };
      const hid = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
      if(hid && hid !== ta) hid.value = homeIntegratedPromptText;
    });
    homeSyncCombinedPrompt();
    return;
  }
  // 통합 지식 검색: 업무지식베이스 토글(통합수행 대상 포함/제외)
  const ischToggle = event.target?.closest?.("[data-home-isch-toggle]");
  if(ischToggle){
    const key = ischToggle.dataset.homeIschToggle;
    if(homeIschDisabled.has(key)) homeIschDisabled.delete(key);
    else homeIschDisabled.add(key);
    homeRenderPromptTemplatePanels();
    return;
  }
  // 통합 지식 검색: 출처별 결과 프레임 접기/펴기
  const ischResCol = event.target?.closest?.("[data-home-isch-result-collapse]");
  if(ischResCol){
    const key = ischResCol.dataset.homeIschResultCollapse;
    const collapsed = !homeIschResultCollapsed[key];
    homeIschResultCollapsed[key] = collapsed;
    ischResCol.closest(".home-isch-result")?.classList.toggle("is-collapsed", collapsed);
    ischResCol.textContent = collapsed ? "▾ 펴기" : "▴ 접기";
    return;
  }
  const btn = event.target?.closest?.("[data-home-run-single]");
  if(btn && !btn.hasAttribute("data-home-isch-run")){ homeRunSingleService(btn.dataset.homeRunSingle, btn); }
});

// 입력값 칩 클릭 → 프롬프트 커서 위치에 [입력값 이름] 변수 삽입
document.addEventListener("click", (event) => {
  const chip = event.target?.closest?.("[data-home-insert-token]");
  if(chip){ homeInsertTokenIntoPrompt(chip.dataset.homeInsertToken, chip.dataset.label); }
});

/* AI통합분석결과 요약 접기/펼치기 — DOM만 토글해 스크롤 위치를 그대로 둔다
   (전체 재렌더하면 결과 영역이 맨 위로 튄다). */
document.addEventListener("click", (event) => {
  const toggle = event.target?.closest?.("[data-home-summary-toggle]");
  if(!toggle) return;
  homeSummaryCollapsed = !homeSummaryCollapsed;
  applyHomeSummaryCollapsed();
  toggle.textContent = homeSummaryCollapsed ? "▼ 결과 펼치기" : "▲ 결과 접기";
  toggle.title = homeSummaryCollapsed
    ? "AI통합분석결과 펼치기" : "AI통합분석결과 전체 접기 — 서비스 수행 결과를 넓게 사용";
});

/* 접힘 상태를 DOM에 반영 — 요약·KPI뿐 아니라 상세 결과 목록까지 함께 접어
   AI통합분석결과 영역을 머리글만 남기고, 그 공간을 상단 서비스 결과가 쓰게 한다. */
function applyHomeSummaryCollapsed(){
  const box = document.getElementById("homeResultBox");
  if(!box) return;
  box.querySelectorAll(".home-summary-block").forEach(el => { el.hidden = homeSummaryCollapsed; });
  const detail = box.querySelector("#homeResultDetail");
  if(detail) detail.hidden = homeSummaryCollapsed;
  box.classList.toggle("summary-collapsed", homeSummaryCollapsed);
  document.querySelector(".home-result-area")?.classList.toggle("is-collapsed", homeSummaryCollapsed);
  document.querySelector(".home-analysis-card")?.classList.toggle("result-collapsed", homeSummaryCollapsed);
}

// 카드별 AI코칭 실행 / 재구성안 적용
document.addEventListener("click", (event) => {
  const coachBtn = event.target?.closest?.("[data-home-card-coach]");
  if(coachBtn){ homeCardCoach(coachBtn.dataset.homeCardCoach, coachBtn); return; }
  const applyBtn = event.target?.closest?.("[data-home-coach-apply]");
  if(applyBtn){ homeApplyCardCoach(applyBtn.dataset.homeCoachApply); }
});

/* 프롬프트 입력창: 초기 안내문을 보여주다가 사용자가 포커스하면 비우고,
   비운 채로 벗어나면 다시 안내문을 복원한다. */
document.addEventListener("focusin", (event) => {
  const ta = event.target;
  if(ta?.id === "coachPrompt" && ta.classList.contains("is-initial")){
    ta.value = "";
    ta.classList.remove("is-initial");
    const cc = document.getElementById("coachCharCount");
    if(cc) cc.textContent = "0자";
  }
});
document.addEventListener("focusout", (event) => {
  const ta = event.target;
  if(ta?.id === "coachPrompt" && !(ta.value || "").trim()){
    ta.value = ta.dataset.initialText || "";
    ta.classList.add("is-initial");
    const cc = document.getElementById("coachCharCount");
    if(cc) cc.textContent = "0자";
  }
});

/* 코치 파일첨부 input */
document.addEventListener("change", (event) => {
  if(event.target && event.target.id === "coachFileInput"){
    coachHandleFileSelect(event.target.files);
    event.target.value = "";  // 같은 파일 재선택 가능하게
  }
});

/* 홈 컴포저/픽커/카드/코치 클릭 핸들러 (브랜치 순서는 엔진 시절 그대로) */
document.addEventListener("click", (event) => {
  const homePickerClose = event.target.closest("[data-home-picker-close]");
  if(homePickerClose || (event.target.id === "homePickerOverlay")){
    document.getElementById("homePickerOverlay")?.remove();
    return;
  }

  const homePickerToggle = event.target.closest("[data-home-picker-toggle]");
  if(homePickerToggle){
    const overlay = document.getElementById("homePickerOverlay");
    const kind = overlay?.dataset.homePickerKind || "rag";
    const key = homePickerToggle.dataset.homePickerToggle;
    const current = homePickerSelectedKeys(kind);
    const next = current.includes(key)
      ? current.filter(item => item !== key)
      : [...current, key];
    homeSetPickerSelectedKeys(kind, next);
    if(kind === "agent" && key === "mail_share") homeRenderShareEmailPanel();
    if(kind === "agent") homeRenderServiceInputPanels();
    homeRenderPromptTemplatePanels();
    openHomePicker(kind);
    const prompt = coachPromptText();
    if(prompt && (coachSuggestions.length > 0 || coachImprovedPrompt)){
      coachRunAnalyze();
    }
    return;
  }

  // 카드 전체 접기/펴기 (수행 흐름 헤더)
  const collapseAll = event.target.closest("[data-home-collapse-all]");
  if(collapseAll){
    const collapse = collapseAll.dataset.homeCollapseAll === "collapse";
    homeCollapseKeys().forEach(key => { homeCardCollapsed[key] = collapse; });
    homeRenderPromptTemplatePanels();
    return;
  }

  // 모두 닫고 초기화: 모든 카드를 접고 수행 결과를 비운다(입력값은 유지)
  const resetAll = event.target.closest("[data-home-reset-all]");
  if(resetAll){
    homeCollapseKeys().forEach(key => { homeCardCollapsed[key] = true; });
    homeCardResultState = {};
    homeRunResults = {};
    homeStepStatus = {};
    homeRenderPromptTemplatePanels();
    return;
  }

  // 카드 접기/펴기 토글 (서비스가 많을 때 개별 카드 접기)
  const cardCollapse = event.target.closest("[data-home-card-collapse]");
  if(cardCollapse){
    const key = cardCollapse.dataset.homeCardCollapse;
    const collapsed = !homeCardCollapsed[key];
    homeCardCollapsed[key] = collapsed;
    const panel = cardCollapse.closest(".home-svc-panel");
    if(panel) panel.classList.toggle("is-collapsed", collapsed);
    cardCollapse.textContent = collapsed ? "▸ 펴기" : "▾ 접기";
    cardCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
    cardCollapse.setAttribute("aria-label", collapsed ? "카드 펼치기" : "카드 접기");
    cardCollapse.title = collapsed ? "펼치기" : "접기";
    return;
  }

  /* 좌측 서비스 설명 프레임 접기/펴기 — DOM 클래스만 토글해 재렌더 없이 즉시 반영.
     접으면 우측 '프롬프트 및 수행 결과'가 그만큼 넓어진다. */
  const infoCollapse = event.target.closest("[data-home-card-info-collapse]");
  if(infoCollapse){
    const key = infoCollapse.dataset.homeCardInfoCollapse;
    const collapsed = !homeCardInfoCollapsed[key];
    homeCardInfoCollapsed[key] = collapsed;
    infoCollapse.closest(".home-svc-panel")?.classList.toggle("info-collapsed", collapsed);
    infoCollapse.textContent = collapsed ? "▶" : "◀";
    infoCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
    infoCollapse.setAttribute("aria-label", collapsed ? "서비스 설명 펼치기" : "서비스 설명 접기");
    infoCollapse.title = collapsed
      ? "서비스 설명 펼치기" : "서비스 설명 접기 — 결과 영역을 넓게 사용";
    return;
  }

  // 수행 순서 프레임: ▲▼ 이동
  const frameMove = event.target.closest("[data-home-frame-move]");
  if(frameMove){
    homeMovePipelineFrame(frameMove.dataset.key, frameMove.dataset.homeFrameMove);
    return;
  }

  // AI 서비스·업무지식베이스 카드: 동작(분석범위) 칩 토글
  const tplChip = event.target.closest("[data-home-tpl-behavior]");
  if(tplChip){
    const key = tplChip.dataset.homeTplBehavior;
    const value = tplChip.dataset.behavior;
    const st = homePromptTemplateState[key];
    if(st){
      const has = st.behaviors.includes(value);
      st.behaviors = has ? st.behaviors.filter(v => v !== value) : [...st.behaviors, value];
      tplChip.classList.toggle("on", !has);
      // 업무지식베이스: 분석범위 변경 시 (직접 편집 전이면) 기본 프롬프트를 재구성해 반영
      if(homeIsDataSourceKey(key)){
        const cst = homeCardPromptState[key];
        if(!cst || !cst.edited){
          const def = homeSourceCardPromptDefault(key);
          homeCardPromptState[key] = { text: def, edited: false };
          const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
          if(el){
            if(el.isContentEditable) el.innerHTML = homeSourcePromptInnerHtml(key, def);
            else el.value = def;
          }
        }
      }
      homeSyncCombinedPrompt();
    }
    return;
  }

  // 업무지식베이스 카드: 프롬프트 지우기
  const promptClear = event.target.closest("[data-home-prompt-clear]");
  if(promptClear){
    const key = promptClear.dataset.homePromptClear;
    homeCardPromptState[key] = { text: "", edited: true };
    const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
    if(el){
      if(el.isContentEditable) el.innerHTML = "";
      else el.value = "";
      el.focus();
    }
    homeSyncCombinedPrompt();
    return;
  }

  // 업무지식베이스 카드: 프롬프트 기본값 채우기 (선택한 분석범위 기준)
  const promptDefault = event.target.closest("[data-home-prompt-default]");
  if(promptDefault){
    const key = promptDefault.dataset.homePromptDefault;
    const def = homeCardPromptDefault(key, homeIsDataSourceKey(key) ? "source" : "agent");
    homeCardPromptState[key] = { text: def, edited: false };
    const el = document.querySelector(`[data-home-card-prompt="${cssString(key)}"]`);
    if(el){
      if(el.isContentEditable) el.innerHTML = homeSourcePromptInnerHtml(key, def);
      else el.value = def;
    }
    homeSyncCombinedPrompt();
    return;
  }

  // LLM 사용 모드 토글 (외부LLM only → 내부LLM only → 외부LLM+내부LLM 순환)
  const llmModeBtn = event.target.closest("[data-home-llm-mode]");
  if(llmModeBtn){
    const cur = llmModeBtn.dataset.llmMode || "ext_int";
    const i = HOME_LLM_MODES.findIndex(m => m.mode === cur);
    const next = HOME_LLM_MODES[(i + 1) % HOME_LLM_MODES.length];
    llmModeBtn.dataset.llmMode = next.mode;
    const lbl = llmModeBtn.querySelector(".home-llm-mode-label");
    if(lbl) lbl.textContent = next.label;
    return;
  }

  const homePickerRequest = event.target.closest("[data-home-picker-request]");
  if(homePickerRequest){
    const overlay = document.getElementById("homePickerOverlay");
    const kind = overlay?.dataset.homePickerKind || "rag";
    requestPermissions([homePickerRequest.dataset.homePickerRequest]);
    openHomePicker(kind);
    return;
  }

  const homePickerTrigger = event.target.closest(".home-picker-trigger");
  if(homePickerTrigger){
    openHomePicker(homePickerTrigger.dataset.homeAgent ? "agent" : "rag");
    return;
  }

  const homeOptionBtn = event.target.closest("[data-home-source], [data-home-agent]");
  if(homeOptionBtn){
    homeToggleAnalysisOption(homeOptionBtn);
    const prompt = coachPromptText();
    if(prompt && (coachSuggestions.length > 0 || coachImprovedPrompt)){
      coachRunAnalyze();
    }
    return;
  }

  const addShareEmailBtn = event.target.closest("[data-home-share-email-add]");
  if(addShareEmailBtn){
    homeAddShareEmailIds(document.getElementById("homeShareEmailInput")?.value || "");
    return;
  }

  const addFileLinkBtn = event.target.closest("[data-coach-add-file-link]");
  if(addFileLinkBtn){
    coachAddFileLink();
    return;
  }

  const removeFileLinkBtn = event.target.closest("[data-coach-remove-file-link]");
  if(removeFileLinkBtn){
    coachRemoveFileLink(Number(removeFileLinkBtn.dataset.coachRemoveFileLink || 0));
    return;
  }

  const removeShareEmailBtn = event.target.closest("[data-home-share-email-remove]");
  if(removeShareEmailBtn){
    homeShareEmailIds = homeShareEmailIds.filter(email => email !== removeShareEmailBtn.dataset.homeShareEmailRemove);
    homeRenderShareEmailPanel();
    return;
  }

  /* 홈 셸 전용 핸들러(별도 사이트 이동·전문 업무 접기·채팅 패널)는
     pages/home-runtime.js의 독립 리스너로 이동 — 포털 진입점(app.js)만 로드한다. */

  const homeRunBtn = event.target.closest(".home-run-btn");
  if(homeRunBtn){
    const prompt = coachPromptText();
    if(!prompt){ alert("프롬프트를 먼저 입력하세요."); return; }
    homeChatHistoryRecord(prompt);   // 좌측 채팅 패널 이력 기록
    // AI통합분석(하단 실행) 시 상단 통합 지식 검색(개별 서비스) 영역은 강제로 접어 결과에 집중
    const { sources } = homeSelectedAnalysisOptions();
    if(sources.length >= 2){
      homeCardCollapsed["__integrated__"] = true;
      homeRenderPromptTemplatePanels();
    }
    homeRunAnalysis(prompt, homeRunBtn);
    return;
  }

  /* 프롬프트 코치 컨트롤 */
  if(event.target.closest("#coachAnalyzeBtn")){ coachRunAnalyze(); return; }
  if(event.target.closest("#coachImproveBtn")){ coachImprove(); return; }
  if(event.target.closest("#coachResetBtn")){ coachReset(); return; }
  if(event.target.closest("#coachSuggToggle")){
    coachSuggestionsCollapsed = !coachSuggestionsCollapsed;
    coachRefreshCards();
    return;
  }
  const removeFileBtn = event.target.closest("[data-coach-remove-file]");
  if(removeFileBtn){
    coachRemoveFile(parseInt(removeFileBtn.dataset.coachRemoveFile, 10));
    return;
  }
});

/* 홈 컴포저 Enter 처리 */
document.addEventListener("keydown", (event) => {
  if(event.key !== "Enter") return;
  if(event.target?.id === "coachPrompt"){
    if(event.shiftKey || event.isComposing || event.keyCode === 229) return;
    const runBtn = document.querySelector(".home-run-btn");
    if(!runBtn) return;
    event.preventDefault();
    runBtn.click();
    return;
  }
  if(event.target?.id === "homeShareEmailInput"){
    event.preventDefault();
    homeAddShareEmailIds(event.target.value || "");
    return;
  }
  if(event.target?.id === "coachFileLinkName" || event.target?.id === "coachFileLinkUrl"){
    event.preventDefault();
    coachAddFileLink();
    return;
  }
});
