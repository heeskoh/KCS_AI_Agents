/* ── AI 서비스 3세트 UI 워크스페이스 연동 (신규 기능) ─────────────────────────
   같은 AI 서비스는 세 워크스페이스에서 동일한 정의·프롬프트 템플릿으로 동작하고,
   입력값 결정 방식만 워크스페이스별로 다르다:
   1) 분석시나리오: 대상(기업/개인)은 워크스페이스가 자동 결정 — 편집 패널에 입력값 스트립 표시
   2) 기초자료 수집/등록: 대상은 워크스페이스, 상세 내역은 등록 파일에서 — 상세 팝업이 resolveWorkspaceInputs 사용
   3) My AI 분석: 입력값을 직접 등록 — 카드 입력값 칩에 입력 상태(입력됨/미입력) 표시 + 클릭 시 값 등록

   SERVICE_RUNTIME(service-specs.js)에 등록된 서비스만 적용 — 서비스 하나씩 구축·검증하며 확장.
   [기존 소스 무변경 원칙] 홈(3)은 관찰자+캡처 위임으로 동작해 기존 코드를 수정하지 않는다.
   시나리오(1) 접점은 app-runtime 힌트 패널의 스트립 호출 1곳. */
import { escapeHtml } from "../core/dom.js";
import { findServiceSpec, SERVICE_RUNTIME, serviceRuntimeOf, SERVICE_EDIT_META } from "./service-specs.js";
import { getServiceSettings, settingValueLabel, openServiceConfigPopup } from "./service-config-popup.js";
import { PROMPT_PATTERNS, homeAgentPatternPrompt } from "./service-prompt-patterns.js";
import { composePrompt } from "../analysis/shared/prompt-composer.js";   // 상세 동작(템플릿) 로드용 — 읽기 전용

/* 입력값 성격 분류: 대상(워크스페이스 자동) / 자료(등록 파일) / 설정(서비스 설정) / 기타 */
function inputKind(inp, serviceKey){
  if(SERVICE_EDIT_META[serviceKey] && SERVICE_EDIT_META[serviceKey][inp.name]) return "setting";
  const n = inp.name || "";
  if(/대상/.test(n)) return "target";
  if(/문서|추출값|파일|증빙|자료/.test(n)) return "doc";
  return "other";
}

/* 워크스페이스 컨텍스트로 서비스 입력값을 해석한다.
   ctx: { targetLabel, docLabel, docCount } — 호출한 워크스페이스가 아는 값만 전달 */
export function resolveWorkspaceInputs(displayName, ctx = {}){
  const { key, spec } = findServiceSpec(displayName);
  if(!key || !SERVICE_RUNTIME[key] || !spec) return null;
  const settings = getServiceSettings(key);
  const out = {};
  (spec.inputs || []).forEach(inp => {
    const kind = inputKind(inp, key);
    if(kind === "target" && ctx.targetLabel){
      out[inp.name] = { value: ctx.targetLabel, source: "워크스페이스 자동" };
    } else if(kind === "doc" && (ctx.docLabel || ctx.docCount)){
      out[inp.name] = { value: ctx.docLabel || `기초자료 ${ctx.docCount}건 자동 연결`, source: "등록 파일" };
    } else if(kind === "setting"){
      out[inp.name] = { value: settingValueLabel(key, inp.name, settings[inp.name]), source: "서비스 설정" };
    }
  });
  return out;
}

/* ── 세트1: 분석시나리오 편집 패널 입력값 스트립 ──
   대상·자료는 워크스페이스 자동값을, 설정 입력은 현재 설정값을 표시(클릭 시 설정 변경) */
export function serviceInputStripHtml(displayName, ctx = {}){
  const rt = serviceRuntimeOf(displayName);
  if(!rt) return "";
  const { key, spec } = findServiceSpec(displayName);
  const resolved = resolveWorkspaceInputs(displayName, ctx) || {};
  const chips = (spec.inputs || []).map(inp => {
    const r = resolved[inp.name];
    const kind = inputKind(inp, key);
    const isSetting = kind === "setting";
    const tone = r
      ? (isSetting ? "background:#eef4ff;border-color:#cfe0fb;color:#2456c9;" : "background:#e7f5ec;border-color:#bfe5cd;color:#1f9254;")
      : "background:#fdf1e2;border-color:#f3ddba;color:#c07b1b;";
    const src = r ? r.source : (inp.req ? "미결정 · 필수" : "미결정");
    return `<span ${isSetting ? `data-svc-open-config="${escapeHtml(key)}" style="cursor:pointer;" title="클릭하면 설정을 변경합니다"` : ""}
      style="display:inline-flex;align-items:center;gap:6px;border:1px solid;${tone}border-radius:7px;padding:4px 10px;font-size:11.5px;font-weight:700;${isSetting ? "cursor:pointer;" : ""}">
      ${escapeHtml(inp.name)}${inp.req ? `<i style="font-style:normal;font-size:9.5px;font-weight:800;opacity:.75;">필수</i>` : ""}
      <b style="font-weight:800;">${escapeHtml(r ? String(r.value || "—") : "—")}</b>
      <em style="font-style:normal;font-size:10px;opacity:.7;">${escapeHtml(src)}</em>
    </span>`;
  }).join("");
  return `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;">
      <span style="font-size:11px;font-weight:800;color:#8590a6;">입력값</span>
      ${chips}
    </div>`;
}

/* ── 세트3: My AI 분석 — 입력값 칩 상태 표시 + 클릭 시 값 등록 ── */
const ENABLED_HOME_KEYS = new Set(Object.values(SERVICE_RUNTIME).map(r => r.runtimeKey));
const POPOVER_ID = "svcInputPopover";
let _decorScheduled = false;

function promptTextOf(el){
  if(!el) return "";
  return (el.isContentEditable ? el.innerText : el.value) || "";
}
function setPromptText(el, text){
  if(el.isContentEditable) el.innerText = text; else el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));   // 기존 상태 동기화 경로 재사용
}

/* 카드 입력값 칩에 입력 상태 배지 부착/갱신 — 프롬프트에 [입력값] 토큰이 남아 있으면 미입력 */
function decorateHomeChips(){
  document.querySelectorAll("[data-home-card-prompt]").forEach(promptEl => {
    const key = promptEl.dataset.homeCardPrompt;
    if(!ENABLED_HOME_KEYS.has(key)) return;
    const text = promptTextOf(promptEl);
    document.querySelectorAll(`[data-home-insert-token="${key}"]`).forEach(chip => {
      const label = chip.dataset.label || "";
      const filled = !text.includes(`[${label}]`);
      let state = chip.querySelector("[data-svc-chip-state]");
      if(!state){
        state = document.createElement("i");
        state.setAttribute("data-svc-chip-state", "");
        state.style.cssText = "font-style:normal;font-size:9.5px;font-weight:800;margin-left:5px;padding:1px 6px;border-radius:5px;";
        chip.appendChild(state);
        chip.title = "클릭하면 이 입력값을 직접 등록합니다";
      }
      const required = chip.classList.contains("req");
      if(!filled){                       // 프롬프트에 [토큰]이 남아 있음 — 값 필요
        state.textContent = "미입력";
        state.style.background = "#fdeaea";
        state.style.color = "#c0392b";
      } else if(required){               // 필수인데 토큰 없음 — 값이 채워진 상태
        state.textContent = "입력됨";
        state.style.background = "#e7f5ec";
        state.style.color = "#1f9254";
      } else if(chip.dataset.svcFilled){ // 선택 입력에 값을 직접 등록한 경우
        state.textContent = "입력됨";
        state.style.background = "#e7f5ec";
        state.style.color = "#1f9254";
      } else {                           // 선택 입력 미사용 — 클릭해 등록 가능
        state.textContent = "선택";
        state.style.background = "#f3f5f9";
        state.style.color = "#8590a6";
      }
    });
  });
}
/* My AI 분석 — 패턴 등록 AI분석서비스 카드의 자동 프롬프트를 패턴 형식으로 구성.
   "입력값 [토큰]들을 활용하여 … 동작방식은 '{선택 동작}'와 같습니다."
   사용자가 직접 수정한 프롬프트는 건드리지 않고, 자동 생성 상태일 때만 동작 선택에 맞춰 갱신한다. */
const _homeAutoText = {};    // { [key]: 마지막으로 자동 구성한 패턴 텍스트 }
const _detailCache = {};     // { [key|behaviors]: 상세설정 템플릿 원문 } — 동작 조합별 상세 동작 캐시
function selectedHomeBehaviorLabels(key){
  return [...document.querySelectorAll(`[data-home-tpl-behavior="${key}"].on`)].map(c => c.textContent.trim());
}
function selectedHomeBehaviorValues(key){
  return [...document.querySelectorAll(`[data-home-tpl-behavior="${key}"].on`)].map(c => c.dataset.behavior).filter(Boolean);
}
/* 동작 조합별 상세 동작(템플릿) 확보 — 미로드 시 비동기 로드 후 재갱신 예약 */
function homeDetailFor(key){
  const values = selectedHomeBehaviorValues(key);
  const cacheKey = `${key}|${[...values].sort().join(",")}`;
  if(!(cacheKey in _detailCache)){
    _detailCache[cacheKey] = "";   // 중복 로드 방지 placeholder
    composePrompt(key, values, "company")
      .then(text => { _detailCache[cacheKey] = text || ""; scheduleDecorate(); })
      .catch(() => {});
  }
  return _detailCache[cacheKey];
}
function syncHomePatternPrompts(){
  Object.entries(PROMPT_PATTERNS).forEach(([key, p]) => {
    if(p.kind !== "agent") return;   // 지식베이스는 My AI 기존 UI(조건 직접 입력) 유지
    const el = document.querySelector(`[data-home-card-prompt="${key}"]`);
    if(!el) return;
    const expected = homeAgentPatternPrompt(key, selectedHomeBehaviorLabels(key), homeDetailFor(key));
    // contenteditable 왕복 시 개행·공백이 변형될 수 있어 정규화 후 비교한다
    const norm = s => String(s || "").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
    const current = promptTextOf(el).trim();
    // 자동 생성 상태 판정: 비어 있거나, 직전 자동 구성값이거나, 구형 기본 프롬프트("…수행해줘." 단문)인 경우
    const isLegacyDefault = current.includes("수행해줘") && !current.startsWith("입력값")
      && p.homeInputs.some(l => current.includes(`[${l}]`));
    const isAuto = !current || norm(current) === norm(_homeAutoText[key]) || isLegacyDefault;
    if(isAuto && norm(current) !== norm(expected)){
      setPromptText(el, expected);
      _homeAutoText[key] = expected;
    } else if(norm(current) === norm(expected)){
      _homeAutoText[key] = expected;   // 이미 최신 패턴이면 기준값만 동기화
    }
  });
}

function scheduleDecorate(){
  if(_decorScheduled) return;
  _decorScheduled = true;
  setTimeout(() => {
    _decorScheduled = false;
    try{ syncHomePatternPrompts(); decorateHomeChips(); }catch(e){ /* 장식 실패 무시 */ }
  }, 120);
}

function closePopover(){
  const p = document.getElementById(POPOVER_ID);
  if(p) p.remove();
}

/* 칩 클릭 → 값 등록 팝오버: 적용 시 프롬프트의 [입력값] 토큰을 값으로 치환(없으면 덧붙임) */
function openInputPopover(chip, key, label){
  closePopover();
  const rect = chip.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.id = POPOVER_ID;
  pop.style.cssText = `position:fixed;left:${Math.min(rect.left, window.innerWidth - 320)}px;top:${rect.bottom + 6}px;z-index:10700;width:300px;background:#fff;border:1px solid #d8e0ec;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.22);padding:12px;`;
  pop.innerHTML = `
    <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:7px;">${escapeHtml(label)} 입력</div>
    <input type="text" data-svc-pop-input style="width:100%;border:1.5px solid #d8e0ec;border-radius:8px;padding:8px 11px;font-size:13px;font-family:inherit;color:#23314e;outline:none;" placeholder="예: C-1036 또는 조건식">
    <div style="display:flex;justify-content:flex-end;gap:7px;margin-top:9px;">
      <button type="button" data-svc-pop-cancel style="border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:7px;padding:5px 12px;font-size:12px;cursor:pointer;">취소</button>
      <button type="button" data-svc-pop-apply style="border:none;background:#2f6fed;color:#fff;border-radius:7px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;">적용</button>
    </div>`;
  document.body.appendChild(pop);
  const input = pop.querySelector("[data-svc-pop-input]");
  const apply = () => {
    const val = (input.value || "").trim();
    if(!val){ input.focus(); return; }
    const el = document.querySelector(`[data-home-card-prompt="${key}"]`);
    if(el){
      const token = `[${label}]`;
      const text = promptTextOf(el);
      setPromptText(el, text.includes(token) ? text.replace(token, val) : `${text.trim()} · ${label}: ${val}`);
    }
    chip.dataset.svcFilled = "1";   // 선택 입력에 값을 덧붙인 경우 상태 표시용
    closePopover();
    scheduleDecorate();
    setTimeout(scheduleDecorate, 450);   // 적용 직후 카드 재렌더와의 경합 대비 지연 갱신 1회
  };
  pop.addEventListener("click", e => {
    e.stopPropagation();
    if(e.target.closest("[data-svc-pop-apply]")) apply();
    if(e.target.closest("[data-svc-pop-cancel]")) closePopover();
  });
  input.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); apply(); } });
  input.focus();
}

let _inited = false;
export function initServiceWorkspaceUi(){
  if(_inited) return;
  _inited = true;
  // 홈 칩 클릭 가로채기(캡처): 대상 서비스는 토큰 삽입 대신 값 등록 팝오버를 연다
  document.addEventListener("click", e => {
    const chip = e.target.closest("[data-home-insert-token]");
    if(chip && ENABLED_HOME_KEYS.has(chip.dataset.homeInsertToken)){
      e.preventDefault();
      e.stopPropagation();
      openInputPopover(chip, chip.dataset.homeInsertToken, chip.dataset.label || "");
      return;
    }
    if(!e.target.closest(`#${POPOVER_ID}`)) closePopover();
  }, true);
  // 시나리오 입력값 스트립의 설정 칩 → 설정 팝업
  document.addEventListener("click", e => {
    const cfg = e.target.closest("[data-svc-open-config]");
    if(cfg) openServiceConfigPopup(cfg.dataset.svcOpenConfig);
    // 홈 동작 칩 토글 → 기존 핸들러가 상태 반영한 뒤 패턴 프롬프트의 동작방식 문구 갱신
    if(e.target.closest("[data-home-tpl-behavior]")) scheduleDecorate();
  });
  // 프롬프트 편집·재렌더 시 칩 상태 갱신
  document.addEventListener("input", e => {
    if(e.target.closest && e.target.closest("[data-home-card-prompt]")) scheduleDecorate();
  });
  new MutationObserver(scheduleDecorate).observe(document.body, { childList: true, subtree: true });
  scheduleDecorate();
}
initServiceWorkspaceUi();
