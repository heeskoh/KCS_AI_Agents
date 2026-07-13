/* 관세조사 "수사정보 분석" 탭 — 3단 구조.
   좌: 실시간 AI 챗봇(조사 대상·분석결과·선택 자료 컨텍스트 주입)
   중: AI정보분석 시각화 — 분석 관점 탭(신고·물품 정합성/물류·경로/자금흐름/관계·네트워크/행위·패턴)
       선택 시 대응하는 관계 그래프 뷰로 전환
   우: 수집된 정보 — 앞의 탭에서 구성한 기초자료·RAG·AI 분석결과·프로파일 목록.
       카드를 선택하면 시각화·대화 컨텍스트에 활용된다.
   대화는 canvasJobOverrides[companyId].insightChat에 영속(50개 캡, deps 경유). */
import { escapeHtml } from "../../core/dom.js";
import { chatThreadHtml, bindChatThread } from "../shared/chat-thread.js";
import { insightVizHtml } from "./insight-viz.js";

const CHAT_MOUNT_ID = "ciInsightChat";

/* 분석 관점 탭 — 선택 시 대응하는 분석 결과 시각화(insight-viz.js)를 표시.
   관세수사 수사정보 분석 탭도 동일 워크벤치를 공유한다(general-investigation/insight.js). */
export const PERSPECTIVES = [
  { id: "A", label: "신고·물품 정합성 분석", desc: "신고내용 대사·검증 · 가격·분류 적정성 · 증빙 불일치 탐지" },
  { id: "B", label: "물류·경로 분석",        desc: "경로 역추적 · 공급망 구조 · 우회·환적 탐지" },
  { id: "C", label: "자금흐름 분석",         desc: "자금 흐름 추적 · 시계열·소유주 분석 · 자금세탁 구조 해체" },
  { id: "D", label: "관계·네트워크 분석",    desc: "관계망 구성 · 중심성 분석 · 특수관계·페이퍼컴퍼니·공범 식별" },
  { id: "E", label: "행위·패턴 이상탐지",    desc: "이상거래 탐지 · 위험선별(스코어링) · ML 패턴 비교" },
];

/* 세션 한정 UI 상태(영속 불필요): 그룹 접힘 / 선택 자료 / 활성 관점 */
const groupsOpen = {};
const selectedItems = new Map();   // itemKey → { title, text }
let activePerspective = "A";

function activeCompanyOf(deps, uctx){
  const ctx = uctx?.target;
  if(!ctx || !ctx.targetId) return null;
  const company = (deps.getScenarioCompanies?.() || []).find(c => c.company_id === ctx.targetId);
  return company || { company_id: ctx.targetId, company_name: ctx.targetName };
}

/* 완료된 분석 결과 목록: 저장된 아카이브(사전 준비 결과 포함) 기준 */
function archiveResults(deps, companyId){
  const archive = deps.currentRunArchive?.(companyId);
  if(!archive) return [];
  const outputs = archive.stepOutputs || {};
  return (archive.scenarioItems || [])
    .filter(item => outputs[item.id])
    .map(item => ({ id: item.id, label: item.label, text: String(outputs[item.id]) }));
}

/* ── 조사 컨텍스트(시스템 프롬프트) — 선택 자료 우선 반영 ───────────── */
export function buildCiCaseContext(deps, company){
  const results = archiveResults(deps, company.company_id)
    .slice(-4)
    .map(r => `- [${r.label}] ${r.text.slice(0, 500)}`)
    .join("\n");
  const selected = [...selectedItems.values()]
    .slice(0, 6)
    .map(item => `- [${item.title}] ${String(item.text || "").slice(0, 400)}`)
    .join("\n");
  const profileLine = `기업 · 위험등급 ${company.risk_level || "-"} · 위험점수 ${company.risk_score ?? "-"} · 연간수입액 ${company.annual_import_amount ?? "-"} · 신고관세 ${company.declared_duty_amount ?? "-"}`;
  return `당신은 대한민국 관세청 조사국의 조사정보 분석 지원 AI입니다.
아래 조사 컨텍스트를 근거로 조사관의 질문에 한국어로 간결하게(개조식 허용) 답하십시오.
근거에 없는 사실은 지어내지 말고 "확인 필요"로 표시하십시오.

[조사 대상] ${company.company_name || company.company_id} (${company.company_id}) · 관세조사
[프로파일 요약] ${profileLine}
${selected ? `[조사관이 선택한 활용 자료]\n${selected}` : ""}
${results ? `[AI 분석결과]\n${results}` : "[AI 분석결과] 아직 없음"}`;
}

/* ── 우측: 수집된 정보 그룹(기초자료·RAG·AI 분석결과·프로파일) ─────── */
function ciInsightGroups(deps, company){
  const files = (deps.getUploadedFilesByCompany?.(company.company_id) || []).map(file => ({
    key: `file:${file.id}`,
    title: `📄 ${file.name}`,
    meta: file.type || "등록 파일",
    text: Array.isArray(file.extracted) ? file.extracted.join(", ").slice(0, 300) : "",
  }));
  const rags = (deps.getActiveRagsForCompany?.(company.company_id) || []).map(rag => ({
    key: `rag:${rag.id}`,
    title: `📚 ${rag.name || rag.id}`,
    meta: `업무특화 RAG${rag.docCount ? ` · 문서 ${rag.docCount}건` : ""}`,
    text: rag.description || "",
  }));
  const results = archiveResults(deps, company.company_id).map(r => ({
    key: `result:${r.id}`,
    title: `🤖 ${r.label}`,
    meta: "분석 결과",
    text: r.text.slice(0, 400),
  }));
  const profileItems = [{
    key: "profile:pf1",
    title: `🏢 ${company.company_name || company.company_id}`,
    meta: `위험등급 ${company.risk_level || "-"} · 위험점수 ${company.risk_score ?? "-"}`,
    text: `연간수입액 ${company.annual_import_amount ?? "-"} · 신고관세 ${company.declared_duty_amount ?? "-"}`,
  }];
  return [
    { id: "data",    title: "기초자료", items: files },
    { id: "rag",     title: "업무특화 RAG", items: rags },
    { id: "results", title: "AI 분석결과", items: results },
    { id: "profile", title: "프로파일 요약", items: profileItems },
  ];
}

function ciInsightGroupsHtml(deps, company){
  return ciInsightGroups(deps, company).map(group => {
    const isOpen = groupsOpen[group.id] !== false;   // 기본 펼침
    return `
      <section class="gi-insight-group${isOpen ? " open" : ""}">
        <button type="button" class="gi-insight-group-head" data-ci-insight-group="${escapeHtml(group.id)}">
          <strong>${escapeHtml(group.title)}</strong>
          <span>${group.items.length}건</span>
          <i>${isOpen ? "▾" : "▸"}</i>
        </button>
        <div class="gi-insight-group-body" ${isOpen ? "" : `style="display:none"`}>
          ${group.items.length ? group.items.map(item => `
            <button type="button" class="gi-insight-card${selectedItems.has(item.key) ? " selected" : ""}"
              data-ci-insight-select="${escapeHtml(item.key)}"
              data-title="${escapeHtml(item.title.replace(/^[^ ]+ /, ""))}"
              data-text="${escapeHtml(String(item.text || item.meta || "").slice(0, 400))}"
              title="클릭하면 시각화·대화 컨텍스트에 활용됩니다">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.meta || "")}</span>
              ${item.text ? `<p>${escapeHtml(item.text.slice(0, 120))}${item.text.length > 120 ? "…" : ""}</p>` : ""}
            </button>
          `).join("") : `<div class="gi-insight-empty">항목 없음</div>`}
        </div>
      </section>
    `;
  }).join("");
}

/* ── 렌더: 3단 레이아웃 (gi-insight 공용 스타일 재사용) ────────────── */
export function renderCiInsightPanel(deps, uctx){
  const company = activeCompanyOf(deps, uctx);
  if(!company) return `<div class="profile-loading">진행중인 관세조사에서 조사 대상을 먼저 선택하세요.</div>`;
  const messages = deps.getCustomsInsightChat?.(company.company_id) || [];
  const persp = PERSPECTIVES.find(p => p.id === activePerspective) || PERSPECTIVES[0];
  return `
    <div class="gi-insight-page">
      <div class="gi-insight-layout">
        <aside class="gi-insight-chat-col">
          <div class="gi-insight-col-head"><strong>조사 대화</strong></div>
          ${chatThreadHtml({
            mountId: CHAT_MOUNT_ID,
            messages,
            placeholder: "조사 대상·분석 결과에 대해 질문하세요 (Enter 전송)",
            emptyText: "예: \"관세환급 이상률의 근거와 우선 확인할 사항은?\"",
          })}
        </aside>
        <section class="gi-insight-center-col">
          <div class="gi-insight-col-head">
            <strong>AI정보분석 시각화</strong>
            ${selectedItems.size ? `<span class="muted" style="font-size:11px">활용 자료 ${selectedItems.size}건</span>` : ""}
            <button type="button" class="btn secondary ci-viz-download" data-ci-viz-download
              title="현재 시각화를 PNG 이미지로 저장">⬇ 이미지 저장</button>
          </div>
          <div class="gi-insight-view-tabs ci-insight-persp-tabs">
            ${PERSPECTIVES.map(p => `
              <button type="button" class="gi-insight-view-tab${p.id === persp.id ? " active" : ""}"
                data-ci-insight-persp="${p.id}" title="${escapeHtml(p.desc)}">${escapeHtml(p.label)}</button>
            `).join("")}
          </div>
          <div class="gi-insight-center-body">
            ${insightVizHtml(persp.id, company)}
          </div>
        </section>
        <aside class="gi-insight-cards-col">
          <div class="gi-insight-col-head"><strong>수집된 정보</strong></div>
          <div class="gi-insight-groups">${ciInsightGroupsHtml(deps, company)}</div>
        </aside>
      </div>
    </div>
  `;
}

/* 현재 시각화 SVG → PNG 다운로드.
   스타일이 외부 CSS(.ci-insight-viz 스코프)에 있으므로 복제본에 계산된 스타일을
   인라인한 뒤 직렬화한다(미인라인 시 저장 이미지가 무채색으로 깨짐). */
const VIZ_STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
  "font-size", "font-weight", "font-family", "letter-spacing", "opacity"];
export function downloadCurrentViz(perspId, companyId){
  const svg = document.querySelector(".ci-insight-viz svg");
  if(!svg){ alert("저장할 시각화가 없습니다."); return; }
  const clone = svg.cloneNode(true);
  const srcEls = [svg, ...svg.querySelectorAll("*")];
  const dstEls = [clone, ...clone.querySelectorAll("*")];
  srcEls.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = VIZ_STYLE_PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(";");
    dstEls[i].setAttribute("style", style);
  });
  const vb = (svg.getAttribute("viewBox") || "0 0 960 430").split(/\s+/).map(Number);
  const w = vb[2] || 960, h = vb[3] || 430;
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const svgText = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    const scale = 2;   // 고해상도 저장
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob(blob => {
      if(!blob){ alert("이미지 생성에 실패했습니다."); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `수사정보분석_${perspId}_${companyId}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  };
  img.onerror = () => alert("이미지 변환에 실패했습니다.");
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

/* 렌더 후 훅 — Chat·관점 탭·그룹 토글·자료 선택 바인딩 (app-runtime postRender에서 호출) */
export function bindCiInsightChat(deps){
  const companyId = deps.getActiveCanvasCompanyId?.();
  if(!companyId) return;
  const company = (deps.getScenarioCompanies?.() || []).find(c => c.company_id === companyId)
    || { company_id: companyId };
  bindChatThread({
    mountId: CHAT_MOUNT_ID,
    getMessages: () => deps.getCustomsInsightChat?.(companyId) || [],
    mode: "int",
    buildPrompt: (messages, userText) => {
      const history = messages
        .slice(-9, -1)   // 마지막(방금 질문) 제외 최근 대화 4왕복
        .map(m => `${m.role === "user" ? "조사관" : "AI"}: ${String(m.text).slice(0, 400)}`)
        .join("\n");
      return `${buildCiCaseContext(deps, company)}
${history ? `\n[최근 대화]\n${history}\n` : ""}
[조사관 질문]
${userText}`;
    },
    onDone: () => deps.saveCanvasState?.(),
  });
  // 이미지 저장 — 현재 관점의 시각화를 PNG로 다운로드
  document.querySelector("[data-ci-viz-download]")?.addEventListener("click", () => {
    downloadCurrentViz(activePerspective, companyId);
  });
  // 분석 관점 탭 — 대응하는 분석 결과 시각화로 교체(중앙 영역만 갱신)
  document.querySelectorAll("[data-ci-insight-persp]").forEach(tab => {
    tab.addEventListener("click", () => {
      activePerspective = tab.dataset.ciInsightPersp;
      document.querySelectorAll("[data-ci-insight-persp]").forEach(b =>
        b.classList.toggle("active", b.dataset.ciInsightPersp === activePerspective));
      const body = document.querySelector(".gi-insight-center-body");
      if(body) body.innerHTML = insightVizHtml(activePerspective, company);
    });
  });
  // 그룹 접기/펼치기 — 전체 재렌더 없이 해당 그룹만 토글
  document.querySelectorAll("[data-ci-insight-group]").forEach(head => {
    head.addEventListener("click", () => {
      const id = head.dataset.ciInsightGroup;
      const section = head.closest(".gi-insight-group");
      const body = section?.querySelector(".gi-insight-group-body");
      const nowOpen = groupsOpen[id] === false;
      groupsOpen[id] = nowOpen;
      if(section) section.classList.toggle("open", nowOpen);
      if(body) body.style.display = nowOpen ? "" : "none";
      const icon = head.querySelector("i");
      if(icon) icon.textContent = nowOpen ? "▾" : "▸";
    });
  });
  // 자료 카드 선택/해제 — 선택 자료는 대화 컨텍스트([조사관이 선택한 활용 자료])에 포함
  document.querySelectorAll("[data-ci-insight-select]").forEach(card => {
    card.addEventListener("click", () => {
      const key = card.dataset.ciInsightSelect;
      if(selectedItems.has(key)) selectedItems.delete(key);
      else selectedItems.set(key, { title: card.dataset.title || "", text: card.dataset.text || "" });
      card.classList.toggle("selected", selectedItems.has(key));
      const head = document.querySelector(".gi-insight-center-col .gi-insight-col-head");
      if(head){
        let chip = head.querySelector(".muted");
        if(!chip){
          chip = document.createElement("span");
          chip.className = "muted";
          chip.style.fontSize = "11px";
          head.appendChild(chip);
        }
        chip.textContent = selectedItems.size ? `활용 자료 ${selectedItems.size}건` : "";
      }
    });
  });
}

export const insightSubtab = {
  id:    "insight",
  label: "수사정보 분석",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["network", "db_cdw"],
  render: renderCiInsightPanel,
};
