/* ── AI 서비스 실행 결과 자동검증 (신규 기능) ─────────────────────────────────
   분석 실행 로그(#scenarioStepAccordion)의 완료된 단계 결과를 서비스 스펙
   (service-specs.js의 결과 형식·검증 규칙)과 대조해 검증 배지를 표시한다.

   [기존 소스 무변경 원칙]
   - 핵심 실행 경로(renderScenarioSteps 등)는 일절 수정하지 않는다.
   - MutationObserver로 실행 로그 DOM 변화를 관찰해 배지를 '추가'만 한다.
     (재렌더로 배지가 사라지면 다음 관찰 주기에 다시 계산해 부착)
   - 이 모듈이 실패해도 기존 화면·실행에는 영향이 없다. */
import { escapeHtml } from "../core/dom.js";
import { findServiceSpec } from "./service-specs.js";

const BADGE_ATTR = "data-srv-badge";
const PLACEHOLDER = "아직 실행 결과가 없습니다.";
let _scheduled = false;

/* 결과 텍스트를 스펙과 대조해 검증 요약을 계산 */
function validate(label, status, text){
  if(status === "오류") return { tone: "error", title: "검증 불가", detail: "실행 오류로 결과를 검증할 수 없습니다." };
  const { spec } = findServiceSpec(label);
  const lengthOk = text.length >= 80;
  if(!spec){
    return { tone: lengthOk ? "ok" : "warn", title: lengthOk ? "형식 통과" : "확인 필요",
      detail: `분량 ${text.length}자${lengthOk ? "" : " — 결과가 짧습니다"}`, checks: [] };
  }
  const fields = (spec.output && spec.output.fields) || [];
  // 필드명 느슨 매칭: 필드명 또는 괄호 앞 첫 토큰이 결과 텍스트에 등장하는지
  const matched = fields.filter(([name]) => {
    const token = String(name).split(/[\s/(]/)[0];
    return token && text.includes(token);
  }).length;
  const fieldOk = !fields.length || matched >= Math.ceil(fields.length / 3);
  const ok = lengthOk && fieldOk;
  const parts = [];
  if(spec.output && spec.output.format) parts.push(`형식 ${spec.output.format}`);
  if(fields.length) parts.push(`필드 ${matched}/${fields.length} 확인`);
  parts.push(`분량 ${lengthOk ? "충족" : "부족(" + text.length + "자)"}`);
  return {
    tone: ok ? "ok" : "warn",
    title: ok ? "형식 통과" : "확인 필요",
    detail: parts.join(" · "),
    checks: spec.checks || [],
  };
}

const TONES = {
  ok:    { bg: "#e7f5ec", bd: "#bfe5cd", fg: "#1f9254", icon: "✓" },
  warn:  { bg: "#fdf1e2", bd: "#f3ddba", fg: "#c07b1b", icon: "!" },
  error: { bg: "#fdeaea", bd: "#f5c6c6", fg: "#c0392b", icon: "✕" },
};

function badgeHtml(v){
  const t = TONES[v.tone] || TONES.warn;
  const checksTip = (v.checks || []).length ? ` title="검증 규칙: ${escapeHtml(v.checks.join(" / "))}"` : "";
  return `
    <div ${BADGE_ATTR}${checksTip}
      style="display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:7px 11px;border:1px solid ${t.bd};background:${t.bg};border-radius:8px;">
      <span style="flex:0 0 auto;width:16px;height:16px;border-radius:50%;background:${t.fg};color:#fff;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;">${t.icon}</span>
      <b style="flex:0 0 auto;font-size:11.5px;color:${t.fg};">결과 자동검증 · ${escapeHtml(v.title)}</b>
      <span style="flex:1;min-width:0;font-size:11.5px;color:#5a6577;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(v.detail)}</span>
    </div>`;
}

function processSteps(){
  const sections = document.querySelectorAll("#scenarioStepAccordion .scenario-step");
  sections.forEach(section => {
    if(section.querySelector(`[${BADGE_ATTR}]`)) return;   // 이미 배지 부착됨
    const status = section.querySelector(".scenario-step-toggle em")?.textContent.trim() || "";
    if(status !== "완료" && status !== "오류") return;      // 대기/실행중/건너뜀은 검증하지 않음
    const label = section.querySelector(".scenario-step-toggle span")?.textContent.trim() || "";
    const body = section.querySelector(".scenario-step-body");
    if(!label || !body) return;
    const text = (body.textContent || "").trim();
    if(!text || text === PLACEHOLDER) return;
    const v = validate(label, status, text);
    body.insertAdjacentHTML("afterbegin", badgeHtml(v));
  });
}

function schedule(){
  if(_scheduled) return;
  _scheduled = true;
  setTimeout(() => { _scheduled = false; try{ processSteps(); }catch(e){ /* 검증 실패는 무시 — 기존 화면 영향 없음 */ } }, 120);
}

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
schedule();
