/* ── AI 서비스 상세 팝업 (신규 기능) ──────────────────────────────────────────
   기초자료 수집/등록 표의 '활용 AI 서비스' 이름을 클릭하면 해당 AI 서비스의
   설정과 수행 결과를 팝업으로 보여준다.

   [기존 소스 무변경 원칙]
   - 기존 렌더 함수(uploadRow 등)와 데이터 흐름은 일절 수정하지 않는다.
   - 클릭은 document 레벨 이벤트 위임(.upload-table .agent-line)으로 감지하고,
     행(파일) 정보는 클릭된 행의 DOM에서 읽는다.
   - 스타일도 이 모듈이 자체 <style> 태그로 주입한다. (styles.css 무변경)
   - 접점: app-runtime.js 의 side-effect import 1줄. */
import { escapeHtml } from "../core/dom.js";
import { findServiceSpec, serviceRuntimeOf } from "./service-specs.js";
import "./service-result-validator.js";   // 결과 자동검증(신규) — 실행 로그 관찰자 방식, 기존 코드 무변경
import { openServiceConfigPopup, hasServiceConfig, getServiceSettings, settingValueLabel } from "./service-config-popup.js";
import { resolveWorkspaceInputs } from "./service-workspace-ui.js";   // 3세트 UI 워크스페이스 연동(신규)
import { composePrompt } from "../analysis/shared/prompt-composer.js";   // 분석시나리오 상세설정 프롬프트 템플릿(공용 엔진, 읽기 전용 사용)
import { isPatternService, scenarioPatternPreviewAsync } from "./service-prompt-patterns.js";   // 설명형 프롬프트 패턴(신규)

/* 스펙 미등록 서비스 폴백 */
const DEFAULT_SPEC = {
  tag: "AI 서비스", desc: "선택한 파일에 대해 예약된 AI 서비스입니다.",
  inputs: [
    { name: "대상 파일", type: "파일", req: true, source: "파일 등록 팝업", rule: "-" },
    { name: "실행 방식", type: "자동", req: false, source: "파일 등록 시 자동 예약", rule: "-" },
  ],
  output: { format: "분석 결과 요약", fields: [["결과 요약", "완료 후 AI검증결과에 반영"]] },
  checks: [],
  sample: ["예약된 분석이 진행 중입니다. 완료 후 AI검증결과에 반영됩니다."],
};

const OVERLAY_ID = "serviceDetailOverlay";
let _inited = false;

/* 클릭된 행(tr)에서 파일·추출데이터·검증결과·진행상태를 읽는다 (기존 데이터 저장소 접근 없음) */
function rowContext(tr){
  if(!tr) return {};
  const cells = tr.querySelectorAll("td");
  return {
    file: tr.querySelector(".upload-file")?.textContent.trim() || "",
    type: cells[2]?.textContent.trim() || "",
    extracted: [...tr.querySelectorAll(".extract-pill")].map(el => el.textContent.trim()),
    verify: cells[5]?.textContent.trim() || "",
    status: tr.querySelector(".upload-status")?.textContent.trim() || "",
  };
}

function statusTone(status){
  if(status.includes("완료")) return { bg: "#e3f5ea", fg: "#2e9e5b" };
  if(status.includes("검토")) return { bg: "#fdf1e2", fg: "#c07b1b" };
  return { bg: "#e8f0ff", fg: "#2f6fed" };
}

const TH = "text-align:left;padding:8px 10px;font-size:11px;font-weight:800;color:#8590a6;background:#f7faff;border-bottom:1px solid #e6ebf3;white-space:nowrap;";
const TD = "padding:8px 10px;font-size:12px;color:#2a3550;border-bottom:1px dashed #eef1f6;vertical-align:top;line-height:1.5;";

function sectionTitle(text, extra){
  return `<div style="font-size:12px;font-weight:800;color:#5a6577;margin-bottom:8px;">${text}${extra || ""}</div>`;
}

/* 입력 정의 + 벨리데이션 표 — 현재값: 워크스페이스 해석값(대상·자료) > 서비스 설정값 > 자동 */
function inputsSection(spec, serviceName, resolved){
  const current = getServiceSettings(serviceName);
  const hasCurrent = Object.keys(current).length > 0 || (resolved && Object.keys(resolved).length > 0);
  const rows = (spec.inputs || []).map(inp => {
    let currentCell = `<span style="font-weight:600;color:#9aa3b3;">자동</span>`;
    if(resolved && resolved[inp.name]){
      currentCell = `${escapeHtml(String(resolved[inp.name].value || "—"))}
        <div style="font-weight:600;font-size:10.5px;color:#8590a6;">${escapeHtml(resolved[inp.name].source)}</div>`;
    } else if(current[inp.name] !== undefined){
      currentCell = escapeHtml(settingValueLabel(serviceName, inp.name, current[inp.name]) || "—");
    }
    return `
    <tr>
      <td style="${TD}font-weight:700;">${escapeHtml(inp.name)}</td>
      <td style="${TD}white-space:nowrap;">${escapeHtml(inp.type)}</td>
      <td style="${TD}text-align:center;">${inp.req
        ? `<span style="font-size:10.5px;font-weight:800;color:#c0392b;background:#fdeaea;padding:2px 7px;border-radius:5px;">필수</span>`
        : `<span style="font-size:10.5px;font-weight:700;color:#8590a6;background:#f3f5f9;padding:2px 7px;border-radius:5px;">선택</span>`}</td>
      <td style="${TD}">${escapeHtml(inp.source || "-")}</td>
      <td style="${TD}color:#2456c9;">${escapeHtml(inp.rule || "-")}</td>
      ${hasCurrent ? `<td style="${TD}font-weight:700;color:#1f9254;">${currentCell}</td>` : ""}
    </tr>`;
  }).join("");
  return `
    <section>
      ${sectionTitle("입력 정의 · 벨리데이션")}
      <div style="border:1px solid #e6ebf3;border-radius:10px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${TH}">입력값</th><th style="${TH}">유형</th><th style="${TH}text-align:center;">필수</th><th style="${TH}">출처 · 기본값</th><th style="${TH}">검증 규칙</th>${hasCurrent ? `<th style="${TH}">현재값</th>` : ""}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

/* 결과 형식(출력 스키마) */
function outputSection(spec){
  const out = spec.output || {};
  const rows = (out.fields || []).map(([field, desc]) => `
    <tr>
      <td style="${TD}font-weight:700;white-space:nowrap;">${escapeHtml(field)}</td>
      <td style="${TD}">${escapeHtml(desc)}</td>
    </tr>`).join("");
  return `
    <section>
      ${sectionTitle("결과 형식", out.format ? ` <span style="font-weight:800;color:#2f6fed;background:#e8f0ff;padding:2px 9px;border-radius:6px;font-size:11px;">${escapeHtml(out.format)}</span>` : "")}
      <div style="border:1px solid #e6ebf3;border-radius:10px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th style="${TH}">필드</th><th style="${TH}">설명</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

/* 결과 벨리데이션(실행 후 검증 규칙) */
function checksSection(spec){
  if(!spec.checks || !spec.checks.length) return "";
  const rows = spec.checks.map(c => `
    <li style="font-size:12px;color:#2a3550;line-height:1.6;">${escapeHtml(c)}</li>`).join("");
  return `
    <section>
      ${sectionTitle("결과 검증 규칙")}
      <div style="border:1px solid #e0ecdf;border-radius:10px;padding:11px 14px;background:#f7fcf7;">
        <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">${rows}</ul>
      </div>
    </section>`;
}

function popupHtml(name, ctx){
  const { spec: found } = findServiceSpec(name);
  const spec = found || DEFAULT_SPEC;
  const tone = statusTone(ctx.status || "");
  const running = !(ctx.status || "").includes("완료");
  const resultRows = (spec.sample || []).map(line => `
    <li style="font-size:12.5px;color:#2a3550;line-height:1.6;">${escapeHtml(line)}</li>`).join("");
  const extractedPills = (ctx.extracted || []).map(t =>
    `<span style="display:inline-flex;padding:4px 10px;border-radius:7px;background:#e3edff;color:#2456c9;font-size:11.5px;font-weight:700;">${escapeHtml(t)}</span>`).join("");
  return `
    <div class="sdp-modal" style="width:760px;max-width:94vw;max-height:86vh;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.32);display:flex;flex-direction:column;overflow:hidden;">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:16px 20px;border-bottom:1px solid #eef1f6;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:10.5px;font-weight:800;color:#2f6fed;background:#e3edff;padding:3px 9px;border-radius:6px;">${escapeHtml(spec.tag)}</span>
            <strong style="font-size:16px;font-weight:800;color:#16213d;">${escapeHtml(name)}</strong>
            <span style="padding:3px 10px;border-radius:7px;font-size:11.5px;font-weight:800;background:${tone.bg};color:${tone.fg};">${escapeHtml(ctx.status || "대기")}</span>
            ${hasServiceConfig(name) ? `<button type="button" data-sdp-config="${escapeHtml(name)}" title="현재 설정 확인·변경"
              style="border:1.5px solid #2f6fed;background:#eef4ff;color:#2f6fed;border-radius:7px;padding:3px 11px;font-size:11.5px;font-weight:700;cursor:pointer;">설정 변경</button>` : ""}
          </div>
          <div style="font-size:12px;color:#8590a6;margin-top:5px;line-height:1.5;">${escapeHtml(spec.desc)}</div>
          ${ctx.file ? `<div style="font-size:12px;color:#5a6577;margin-top:7px;">대상 파일 <b style="color:#2f5fd6;">${escapeHtml(ctx.file)}</b>${ctx.type ? ` · ${escapeHtml(ctx.type)}` : ""}</div>` : ""}
        </div>
        <button data-sdp-close style="flex:0 0 auto;width:30px;height:30px;border:none;background:#f3f5f9;border-radius:8px;color:#5a6577;font-size:16px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div style="padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;">
        ${inputsSection(spec, findServiceSpec(name).key || "", resolveWorkspaceInputs(name, {
          targetLabel: document.querySelector(".canvas-selected-company strong")?.textContent?.trim() || "",
          docLabel: ctx.file || "",
        }))}
        ${outputSection(spec)}
        ${checksSection(spec)}
        ${serviceRuntimeOf(name) ? `
        <section>
          ${sectionTitle("프롬프트 템플릿", ` <span style="font-weight:700;color:#8590a6;font-size:11px;">· 분석시나리오 상세설정 기준 — 세 워크스페이스가 동일 템플릿 참조</span>`)}
          <pre data-sdp-template style="margin:0;border:1px solid #e6ebf3;border-radius:10px;padding:12px 14px;background:#f8fafd;font-size:11.5px;line-height:1.6;color:#2a3550;white-space:pre-wrap;max-height:180px;overflow-y:auto;font-family:inherit;">템플릿을 불러오는 중…</pre>
        </section>` : ""}
        <section>
          ${sectionTitle("수행 결과", running ? ` <span style="font-weight:700;color:#2f6fed;">· 진행 중 (중간 결과)</span>` : "")}
          <div style="border:1px solid #e6ebf3;border-radius:10px;padding:12px 14px;background:#fbfdff;">
            <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">${resultRows}</ul>
            ${ctx.verify && ctx.verify !== "처리중" && ctx.verify !== "-" ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e6ebf3;font-size:12.5px;color:#2a3550;">AI검증결과: <b>${escapeHtml(ctx.verify)}</b></div>` : ""}
          </div>
        </section>
        ${extractedPills ? `
        <section>
          ${sectionTitle("추출 데이터")}
          <div style="display:flex;flex-wrap:wrap;gap:7px;">${extractedPills}</div>
        </section>` : ""}
      </div>
      <div style="display:flex;justify-content:flex-end;padding:12px 20px;border-top:1px solid #eef1f6;background:#fcfdff;">
        <button data-sdp-close style="border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:9px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">닫기</button>
      </div>
    </div>`;
}

function overlayEl(){
  let ov = document.getElementById(OVERLAY_ID);
  if(!ov){
    ov = document.createElement("div");
    ov.id = OVERLAY_ID;
    // z-index: 파일등록 팝업(.file-register-overlay, 10000) 위에서도 열리도록 상회 값 사용
    ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;z-index:10500;padding:20px;";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => {
      const cfg = e.target.closest("[data-sdp-config]");
      if(cfg){ openServiceConfigPopup(cfg.dataset.sdpConfig); return; }
      if(e.target === ov || e.target.closest("[data-sdp-close]")) closePopup();
    });
  }
  return ov;
}

let _currentName = "";
function openPopup(name, ctx){
  const ov = overlayEl();
  _currentName = name;
  ov.innerHTML = popupHtml(name, ctx);
  ov.style.display = "flex";
  // 프롬프트 템플릿(상세설정 기준) 로드 — 세 워크스페이스가 동일 템플릿을 참조함을 표시.
  // 패턴 등록 서비스는 설명형 패턴(워크스페이스 조건 자동 등록 형태)을, 그 외는 composePrompt 원본을 보여준다.
  const rt = serviceRuntimeOf(name);
  const slot = ov.querySelector("[data-sdp-template]");
  if(rt && slot && isPatternService(rt.runtimeKey)){
    scenarioPatternPreviewAsync(rt.runtimeKey, rt.defaultBehaviors || [], rt.defaultBehaviorLabels || []).then(text => {
      if(_currentName !== name) return;
      const el = document.getElementById(OVERLAY_ID)?.querySelector("[data-sdp-template]");
      if(el) el.textContent = text || "등록된 프롬프트 템플릿이 없습니다.";
    });
  } else if(rt && slot){
    composePrompt(rt.runtimeKey, rt.defaultBehaviors || [], "company").then(text => {
      if(_currentName !== name) return;   // 다른 서비스로 전환된 경우 무시
      const el = document.getElementById(OVERLAY_ID)?.querySelector("[data-sdp-template]");
      if(el) el.textContent = (text || "").trim() || "등록된 프롬프트 템플릿이 없습니다.";
    }).catch(() => {
      const el = document.getElementById(OVERLAY_ID)?.querySelector("[data-sdp-template]");
      if(el) el.textContent = "템플릿을 불러오지 못했습니다.";
    });
  }
}

function closePopup(){
  const ov = document.getElementById(OVERLAY_ID);
  if(ov) ov.style.display = "none";
}

/* 외부 모듈(파일등록 팝업 등)에서 서비스 상세를 직접 열 때 사용.
   ctx 없이 호출하면 서비스 스펙(입력정의·결과형식)만 표시된다. */
export function openServiceDetailPopup(name, ctx = {}){
  if(!name) return;
  openPopup(String(name).trim(), ctx || {});
}

function injectStyle(){
  const style = document.createElement("style");
  style.textContent = `
    .upload-table .agent-line{cursor:pointer;transition:box-shadow .12s, background .12s;}
    .upload-table .agent-line:hover{background:#dcE9ff;box-shadow:0 1px 4px rgba(47,111,237,.25);text-decoration:underline;}
  `;
  document.head.appendChild(style);
}

/* import 시 1회 자동 초기화 — 기존 코드는 side-effect import 1줄만 필요 */
export function initServiceDetailPopup(){
  if(_inited) return;
  _inited = true;
  injectStyle();
  document.addEventListener("click", e => {
    // 범용 트리거: data-service-detail="서비스명" 속성이 있는 요소는 어디서든 상세 팝업을 연다
    const trigger = e.target.closest("[data-service-detail]");
    if(trigger){
      openServiceDetailPopup(trigger.dataset.serviceDetail);
      return;
    }
    const line = e.target.closest(".upload-table .agent-line");
    if(!line) return;
    const name = line.textContent.trim();
    if(!name || name === "—") return;
    openPopup(name, rowContext(line.closest("tr")));
  });
  document.addEventListener("keydown", e => {
    // 설정 팝업이 위에 열려 있으면 ESC는 설정 팝업만 닫는다(설정 모듈이 처리)
    const cfgOv = document.getElementById("serviceConfigOverlay");
    if(cfgOv && cfgOv.style.display === "flex") return;
    if(e.key === "Escape") closePopup();
  });
}
initServiceDetailPopup();
