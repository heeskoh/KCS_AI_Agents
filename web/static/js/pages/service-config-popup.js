/* ── AI 서비스 설정 팝업 (신규 기능) ─────────────────────────────────────────
   서비스별 현재 설정을 보여주고 변경한다. service-specs.js의 SERVICE_EDIT_META를
   읽어 패턴별 폼을 자동 생성한다:
   - P1 단순 설정형: choice(단일)·multi(다중) 칩, number(범위 검증)
   - P2 검증 입력형: text(필수·형식 검증, 인라인 오류 메시지)
   편집 메타가 없는 입력값은 '자동 연결 입력'(읽기 전용)으로 표시한다.

   저장: /api/service_settings (data/service_settings.json) — 재로그인 후에도 유지.
   [기존 소스 무변경 원칙] 독립 모듈 — 진입점은 서비스 상세 팝업(신규 모듈)의 버튼. */
import { escapeHtml } from "../core/dom.js";
import { findServiceSpec, SERVICE_EDIT_META } from "./service-specs.js";

const OVERLAY_ID = "serviceConfigOverlay";
const CHIP_ON = "border:1.5px solid #2f6fed;background:#2f6fed;color:#fff;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;";
const CHIP_OFF = "border:1.5px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;";

let _settings = {};          // { [서비스명]: { [입력값]: value } } — 서버 저장본 캐시
let _loaded = false;
let S = null;                // { name, meta, spec, values }

async function loadSettings(){
  if(_loaded) return;
  try{
    const res = await fetch("/api/service_settings");
    if(res.ok){
      const data = await res.json();
      if(data && typeof data.state === "object" && data.state) _settings = data.state;
    }
  }catch(e){ /* 미로드 시 기본값으로 동작 */ }
  _loaded = true;
}

function saveSettings(){
  return fetch("/api/service_settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(_settings),
  });
}

/* 서비스의 현재 설정(저장값 ?? 기본값) — 상세 팝업 '현재값' 표시에도 사용 */
export function getServiceSettings(name){
  const meta = SERVICE_EDIT_META[name] || null;
  if(!meta) return {};
  const saved = _settings[name] || {};
  const out = {};
  Object.entries(meta).forEach(([inputName, m]) => {
    out[inputName] = saved[inputName] !== undefined ? saved[inputName] : (m.def !== undefined ? m.def : (m.control === "multi" ? [] : ""));
  });
  return out;
}

/* 설정 팝업을 열 수 있는 서비스인지(편집 메타 존재 여부) — 별칭은 정식 키로 정규화 */
export function hasServiceConfig(displayName){
  const { key } = findServiceSpec(displayName);
  return !!(key && SERVICE_EDIT_META[key]);
}

/* 인라인 설정 UI(시나리오 리뷰모드 등)용: 설정값 하나를 저장한다.
   팝업과 동일한 저장소(_settings → /api/service_settings)를 사용한다. */
export function setServiceSetting(serviceKey, inputName, value){
  const meta = SERVICE_EDIT_META[serviceKey]?.[inputName];
  if(!meta) return false;
  _settings[serviceKey] = { ...getServiceSettings(serviceKey), [inputName]: value };
  saveSettings().catch(() => {});
  return true;
}

/* 표시용 값 라벨: choice/multi는 옵션 라벨로 변환 */
export function settingValueLabel(name, inputName, value){
  const m = SERVICE_EDIT_META[name]?.[inputName];
  if(!m) return String(value ?? "");
  if(m.control === "multi"){
    const arr = Array.isArray(value) ? value : [];
    return arr.map(v => (m.options.find(([ov]) => ov === v) || [v, v])[1]).join(", ");
  }
  if(m.control === "choice") return (m.options.find(([ov]) => ov === value) || [value, value])[1];
  if(m.control === "number") return `${value}${m.unit || ""}`;
  return String(value ?? "");
}

/* ── 검증 ── */
function validateField(m, value){
  if(m.control === "text"){
    const v = String(value || "").trim();
    if(m.required && !v) return "필수 입력입니다.";
    if(v && m.minLen && v.length < m.minLen) return m.patternMsg || `${m.minLen}자 이상 입력하세요.`;
    if(v && m.pattern && !(new RegExp(m.pattern).test(v))) return m.patternMsg || "형식이 올바르지 않습니다.";
    return "";
  }
  if(m.control === "number"){
    const n = Number(value);
    if(value === "" || Number.isNaN(n)) return "숫자를 입력하세요.";
    if(m.min !== undefined && n < m.min) return `${m.min}~${m.max}${m.unit || ""} 범위로 입력하세요.`;
    if(m.max !== undefined && n > m.max) return `${m.min}~${m.max}${m.unit || ""} 범위로 입력하세요.`;
    return "";
  }
  if(m.control === "multi"){
    const arr = Array.isArray(value) ? value : [];
    if(!arr.length) return "1개 이상 선택하세요.";
    return "";
  }
  return "";
}

function allErrors(){
  const errs = {};
  Object.entries(S.meta).forEach(([inputName, m]) => {
    const msg = validateField(m, S.values[inputName]);
    if(msg) errs[inputName] = msg;
  });
  return errs;
}

/* ── 렌더 ── */
function fieldHtml(inputName, m){
  const value = S.values[inputName];
  const err = validateField(m, value);
  const errHtml = err ? `<div style="margin-top:6px;font-size:11.5px;font-weight:700;color:#c0392b;">${escapeHtml(err)}</div>` : "";
  let control = "";
  if(m.control === "choice"){
    control = `<div style="display:flex;flex-wrap:wrap;gap:7px;">` + m.options.map(([v, label]) =>
      `<div data-scp-choice="${escapeHtml(inputName)}::${escapeHtml(v)}" style="${value === v ? CHIP_ON : CHIP_OFF}">${escapeHtml(label)}</div>`).join("") + `</div>`;
  } else if(m.control === "multi"){
    const arr = Array.isArray(value) ? value : [];
    control = `<div style="display:flex;flex-wrap:wrap;gap:7px;">` + m.options.map(([v, label]) =>
      `<div data-scp-multi="${escapeHtml(inputName)}::${escapeHtml(v)}" style="${arr.includes(v) ? CHIP_ON : CHIP_OFF}">${escapeHtml(label)}</div>`).join("") + `</div>`;
  } else if(m.control === "number"){
    control = `
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" data-scp-input="${escapeHtml(inputName)}" value="${escapeHtml(String(value ?? ""))}"
          min="${m.min ?? ""}" max="${m.max ?? ""}"
          style="width:110px;border:1.5px solid ${err ? "#e3a1a1" : "#d8e0ec"};border-radius:8px;padding:8px 11px;font-size:13px;font-family:inherit;color:#23314e;outline:none;">
        ${m.unit ? `<span style="font-size:12px;color:#8590a6;">${escapeHtml(m.unit)}</span>` : ""}
        ${m.min !== undefined ? `<span style="font-size:11px;color:#9aa3b3;">(${m.min}~${m.max}${escapeHtml(m.unit || "")})</span>` : ""}
      </div>`;
  } else {   // text
    control = `<input type="text" data-scp-input="${escapeHtml(inputName)}" value="${escapeHtml(String(value ?? ""))}"
      placeholder="${escapeHtml(m.placeholder || "")}"
      style="width:100%;border:1.5px solid ${err ? "#e3a1a1" : "#d8e0ec"};border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;color:#23314e;outline:none;">`;
  }
  return `
    <div>
      <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:7px;">
        ${escapeHtml(inputName)}${(m.required || m.control === "choice" || m.control === "multi" || m.control === "number") ? ` <span style="color:#dc4646;">*</span>` : ""}
      </div>
      ${control}
      ${errHtml}
    </div>`;
}

function popupHtml(){
  const errs = allErrors();
  const invalid = Object.keys(errs).length > 0;
  const autoInputs = (S.spec?.inputs || []).filter(inp => !S.meta[inp.name]);
  const autoHtml = autoInputs.length ? `
    <div>
      <div style="font-size:11.5px;font-weight:800;color:#9aa3b3;margin-bottom:7px;">자동 연결 입력 <span style="font-weight:600;">· 실행 시 자동 결정</span></div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${autoInputs.map(inp => `
          <div style="display:flex;gap:10px;font-size:12px;color:#8590a6;padding:6px 10px;background:#f7f9fc;border-radius:7px;">
            <b style="color:#5a6577;flex:0 0 auto;">${escapeHtml(inp.name)}</b>
            <span style="flex:1;">${escapeHtml(inp.source || "-")}</span>
          </div>`).join("")}
      </div>
    </div>` : "";
  return `
    <div style="width:560px;max-width:94vw;max-height:84vh;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.36);display:flex;flex-direction:column;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid #eef1f6;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:800;color:#16213d;">${escapeHtml(S.name)} · 설정</div>
          <div style="font-size:11.5px;color:#8590a6;margin-top:3px;">현재 설정을 확인하고 변경합니다. 저장하면 이후 실행에 적용됩니다.</div>
        </div>
        <button data-scp-close style="flex:0 0 auto;width:28px;height:28px;border:none;background:#f3f5f9;border-radius:8px;color:#5a6577;font-size:15px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div style="padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;">
        ${Object.entries(S.meta).map(([inputName, m]) => fieldHtml(inputName, m)).join("")}
        ${autoHtml}
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid #eef1f6;background:#fcfdff;">
        <button data-scp-reset style="border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">기본값 복원</button>
        <span data-scp-hint style="flex:1;font-size:11.5px;color:${invalid ? "#c0392b" : "#9aa3b3"};">${invalid ? "입력값을 확인하세요 — 검증을 통과해야 저장할 수 있습니다." : "저장하면 서버에 보관되어 재로그인 후에도 유지됩니다."}</span>
        <button data-scp-close style="border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">취소</button>
        <button data-scp-save ${invalid ? "disabled" : ""}
          style="border:none;border-radius:9px;padding:8px 18px;font-size:13px;font-weight:700;color:#fff;cursor:${invalid ? "not-allowed" : "pointer"};background:${invalid ? "#c8d2e2" : "#2f6fed"};">저장</button>
      </div>
    </div>`;
}

function overlayEl(){
  let ov = document.getElementById(OVERLAY_ID);
  if(!ov){
    ov = document.createElement("div");
    ov.id = OVERLAY_ID;
    // 서비스 상세 팝업(10500) 위에 표시
    ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.4);display:none;align-items:center;justify-content:center;z-index:10600;padding:20px;";
    document.body.appendChild(ov);
    bindOverlay(ov);
  }
  return ov;
}

function rerender(){
  const ov = overlayEl();
  if(S) ov.innerHTML = popupHtml();
}

function close(){
  const ov = document.getElementById(OVERLAY_ID);
  if(ov) ov.style.display = "none";
  S = null;
}

function bindOverlay(ov){
  ov.addEventListener("click", e => {
    if(!S) return;
    e.stopPropagation();   // 아래에 열린 상세 팝업 등으로 클릭이 전파되지 않도록
    if(e.target === ov || e.target.closest("[data-scp-close]")){ close(); return; }
    const choice = e.target.closest("[data-scp-choice]");
    if(choice){
      const [inputName, v] = choice.dataset.scpChoice.split("::");
      S.values[inputName] = v;
      rerender();
      return;
    }
    const multi = e.target.closest("[data-scp-multi]");
    if(multi){
      const [inputName, v] = multi.dataset.scpMulti.split("::");
      const arr = Array.isArray(S.values[inputName]) ? [...S.values[inputName]] : [];
      S.values[inputName] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
      rerender();
      return;
    }
    if(e.target.closest("[data-scp-reset]")){
      Object.entries(S.meta).forEach(([inputName, m]) => {
        S.values[inputName] = m.def !== undefined ? (Array.isArray(m.def) ? [...m.def] : m.def) : (m.control === "multi" ? [] : "");
      });
      rerender();
      return;
    }
    if(e.target.closest("[data-scp-save]")){
      if(Object.keys(allErrors()).length) return;
      _settings[S.name] = { ...S.values };
      saveSettings().catch(() => {});
      close();
      return;
    }
  });
  // 텍스트/숫자 입력: 상태 갱신 + 해당 필드만 검증 표시 갱신(포커스 유지 위해 전체 재렌더 없이 푸터만)
  ov.addEventListener("input", e => {
    if(!S) return;
    const input = e.target.closest("[data-scp-input]");
    if(!input) return;
    S.values[input.dataset.scpInput] = input.value;
    const errs = allErrors();
    const invalid = Object.keys(errs).length > 0;
    const save = ov.querySelector("[data-scp-save]");
    if(save){
      save.disabled = invalid;
      save.style.background = invalid ? "#c8d2e2" : "#2f6fed";
      save.style.cursor = invalid ? "not-allowed" : "pointer";
    }
    const hint = ov.querySelector("[data-scp-hint]");
    if(hint){
      hint.textContent = invalid ? "입력값을 확인하세요 — 검증을 통과해야 저장할 수 있습니다." : "저장하면 서버에 보관되어 재로그인 후에도 유지됩니다.";
      hint.style.color = invalid ? "#c0392b" : "#9aa3b3";
    }
  });
  // 포커스를 벗어날 때 인라인 오류 메시지까지 갱신
  ov.addEventListener("focusout", e => {
    if(S && e.target.closest("[data-scp-input]")) rerender();
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && S) close();
  });
}

/* 서비스 설정 팝업 열기 — 편집 메타가 없는 서비스면 열지 않는다 */
export async function openServiceConfigPopup(displayName){
  const { key, spec } = findServiceSpec(displayName);
  const meta = key ? SERVICE_EDIT_META[key] : null;
  if(!meta) return false;
  await loadSettings();
  S = { name: key, spec, meta, values: getServiceSettings(key) };
  const ov = overlayEl();
  ov.innerHTML = popupHtml();
  ov.style.display = "flex";
  return true;
}

loadSettings();
