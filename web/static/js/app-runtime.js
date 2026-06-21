import { dataTable, escapeHtml, markdownToHtml, renderValidationDashboard } from "./core/dom.js";
import { composePrompt, setPromptOverride, savePromptOverrides } from "./analysis/shared/prompt-composer.js";
import { createPageRegistry, pageNames } from "./core/page-registry.js";
import { createCustomsInvestigation } from "./analysis/customs/index.js";
import { registerCustomsEvents } from "./analysis/customs/events.js";
import { customsState } from "./analysis/customs/state.js";
import { createGeneralInvestigation } from "./analysis/general-investigation/index.js";
import { registerGeneralInvestigationEvents } from "./analysis/general-investigation/events.js";
import { generalInvestigationState } from "./analysis/general-investigation/state.js";
import { createSpecialInvestigation } from "./analysis/special-investigation/index.js";
import { registerSpecialInvestigationEvents } from "./analysis/special-investigation/events.js";
import { specialInvestigationState } from "./analysis/special-investigation/state.js";
import {
  analysisButtonsForConfig,
  defaultScenarioBuilderConfig,
  isCustomAnalysisPage,
  loadScenarioBuilderConfig,
  saveScenarioBuilderConfig,
  scenarioConfigForPage,
  scenarioDefaultTabForPage,
} from "./analysis/shared/scenario-builder-config.js";
import { createUnifiedSubtabRegistry } from "./analysis/shared/subtab-registry.js";
import { isSuperAdminUser } from "./core/super-admin.js";
import { scenarioBuilderPage as renderScenarioBuilderPage } from "./pages/scenario-builder.js";
import { intlInfoPageHtml } from "./pages/intl.js";
import { agenticServicePage as renderAgenticServicePage, agenticInspectorHtml, agenticRunPanelHtml, agenticHistoryHtml, agenticNodeTypeDef } from "./pages/agentic-service.js";
import { createAgenticFlow, loadDrawflow } from "./pages/agentic-flow.js";

const pages = createPageRegistry({
  activeAnalysisJobs,
  agenticServicePage,
  analysisButtons: () => analysisButtonsForConfig(scenarioBuilderConfig),
  canvasPage,
  customsInfoPage,
  customsOntologyPage,
  drugInvestigationPage,
  generalInvPage,
  intlInfoPage,
  investigationPage,
  isSuperAdmin: isCurrentUserSuperAdmin,
  mainCanvasJob,
  permissionApprovePage,
  riskDashboard,
  riskScreeningPage,
  scenarioBuilderPage,
  shortcutState: homeShortcutState,
  simplePage,
});

/* 홈 하단 바로가기 — 페이지별 대표 권한 키 매핑 (하나라도 granted면 활성) */
const HOME_SHORTCUT_PERMISSION_KEYS = {
  investigation: ["rag_audit", "declaration_verify", "customs_value"],
  generalinv: ["rag_investigation"],
  lawsearch: ["rag_investigation", "network"],
  fxsearch: ["rag_investigation", "ml"],
  case: ["rag_global"],
  model: ["rag_customs"],
};

function homeShortcutState(page){
  if(page === "system") return isCurrentUserAdmin() ? "granted" : "locked";
  const keys = HOME_SHORTCUT_PERMISSION_KEYS[page];
  if(!keys || !keys.length) return "granted";
  return keys.some(key => hasPermission(key)) ? "granted" : "locked";
}

const canvasWorkCategories = [
  "관세조사 분석",
  "기업 수사 분석",
  "개인수사 분석",
  "마약 수사 분석",
  "외환 수사 분석",
  "위험선별 분석",
  "통관 정보분석",
  "국제정보분석",
  "관세온톨로지",
  "Case 별 RAG",
];

function canvasJobCategory(job){
  return canvasWorkCategories.includes(job?.category) ? job.category : canvasWorkCategories[0];
}

const DRUG_INV_TYPES = [
  { id:"d1", num:"①", label:"마약 밀수입 수사",       cls:"gi-t1" },
  { id:"d2", num:"②", label:"마약 우범여행자 수사",   cls:"gi-t2" },
  { id:"d3", num:"③", label:"마약 자금세탁 수사",     cls:"gi-t3" },
  { id:"d4", num:"④", label:"신종마약 유통 수사",     cls:"gi-t4" },
  { id:"d5", num:"⑤", label:"국제공조 수사",          cls:"gi-t5" },
];
const FX_INV_TYPES = [
  { id:"f1", num:"①", label:"불법 외환거래 수사",      cls:"gi-t1" },
  { id:"f2", num:"②", label:"자금세탁 수사",           cls:"gi-t3" },
  { id:"f3", num:"③", label:"환치기·불법송금 수사",    cls:"gi-t2" },
  { id:"f4", num:"④", label:"재산국외도피 수사",       cls:"gi-t4" },
  { id:"f5", num:"⑤", label:"국제공조 수사",           cls:"gi-t5" },
];
// 마약(d*)·외환(f*) 수사유형을 함께 조회한다.
function drugInvTypeById(id){ return DRUG_INV_TYPES.find(t=>t.id===id) || FX_INV_TYPES.find(t=>t.id===id) || DRUG_INV_TYPES[0]; }
// 특수수사 페이지(lawsearch=마약 / fxsearch=외환)별 수사유형 목록
function invTypesForDomain(domain){ return domain === "fxsearch" ? FX_INV_TYPES : DRUG_INV_TYPES; }

/* ── 마약수사 유형별 default 시나리오 템플릿 ─────────────────
   giScenarioTemplates와 동일한 {id,name,description,items} 형식으로 표준화.
   GI_SERVICE_ALIASES 키 재사용 (gi_cdw, gi_imp, gi_route, gi_net,
   gi_profit, gi_law, gi_rep, gi_appr) + 마약전용 키 추가          */
// 참고: 이 배열은 파일 상단에서 평가되므로 giTemplateStep()(GI_STEP_SOURCES 의존)을
// 쓰면 TDZ 오류가 난다. 단계는 평범한 {key, instruction} 객체로 정의하고, 라벨·동작·
// sourceKey 등은 케이스 스텝 구성 시 normalizeGiScenarioStep에서 해석된다.
// 일반수사 t1~t5와 동일한 수사유형별 시퀀스를 사용한다.
const drugScenarioTemplates = [
  {
    id: "d1",
    name: "마약 밀수입 수사 템플릿",
    description: "과세가격, 심사 RAG, 신고검증, 품목분류, 이상거래, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      { key:"gi_cdw" },
      { key:"gi_val" },
      { key:"gi_rag_rev" },
      { key:"gi_imp" },
      { key:"gi_val" },
      { key:"gi_hs" },
      { key:"gi_anomaly", instruction:"이상거래 검증 AI 서비스 신규 구성" },
      { key:"gi_law" },
      { key:"gi_rep", instruction:"증거 정리" },
      { key:"gi_appr" },
    ]),
  },
  {
    id: "d2",
    name: "마약 우범여행자 수사 템플릿",
    description: "신고검증, 운송경로, 관계망, 범죄수익, 조사·국제협력 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      { key:"gi_cdw" },
      { key:"gi_imp",    instruction:"품명·중량·가격 불일치, 화물 이상 패턴" },
      { key:"gi_route" },
      { key:"gi_net",    instruction:"관계망 분석 AI 서비스 실행" },
      { key:"gi_profit", instruction:"자금흐름, 계좌 추적 연계" },
      { key:"gi_rag_inv" },
      { key:"gi_rag_int" },
      { key:"gi_law" },
      { key:"gi_rep",    instruction:"증거 정리" },
      { key:"gi_appr" },
    ]),
  },
  {
    id: "d3",
    name: "마약 자금세탁 수사 템플릿",
    description: "신고검증, 운송경로, 원산지, 조사·국제협력 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      { key:"gi_cdw" },
      { key:"gi_imp",    instruction:"품명·중량·가격 불일치, 화물 이상 패턴" },
      { key:"gi_route",  instruction:"우회수입 탐지" },
      { key:"gi_origin" },
      { key:"gi_rag_inv" },
      { key:"gi_rag_int" },
      { key:"gi_law" },
      { key:"gi_rep",    instruction:"증거 정리" },
      { key:"gi_appr" },
    ]),
  },
  {
    id: "d4",
    name: "신종마약 유통 수사 템플릿",
    description: "신고검증, 범죄수익 추적, 조사·국제협력 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      { key:"gi_cdw" },
      { key:"gi_imp",    instruction:"품명·중량·가격 불일치, 화물 이상 패턴" },
      { key:"gi_profit", instruction:"자금흐름, 계좌 추적 연계" },
      { key:"gi_rag_inv" },
      { key:"gi_rag_int" },
      { key:"gi_law" },
      { key:"gi_rep",    instruction:"증거 정리" },
      { key:"gi_appr" },
    ]),
  },
  {
    id: "d5",
    name: "국제공조 수사 템플릿",
    description: "신고검증, 특허정보, 품목분류, 운송경로, 심사 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      { key:"gi_cdw" },
      { key:"gi_imp",    instruction:"품명·중량·가격 불일치, 화물 이상 패턴" },
      { key:"gi_patent", instruction:"권리자 정보 확인" },
      { key:"gi_hs",     instruction:"위조품 식별" },
      { key:"gi_route",  instruction:"우회수입 탐지, 공급망 역추적" },
      { key:"gi_rag_rev" },
      { key:"gi_law" },
      { key:"gi_rep",    instruction:"증거 정리" },
      { key:"gi_appr" },
    ]),
  },
];

const DRUG_SCENARIO_STEPS = Object.fromEntries(
  drugScenarioTemplates.map(template => [template.id, template.items])
);

/* ── 외환수사 유형별 default 시나리오 템플릿 (f1~f5) ─────────────
   공통 흐름: CDW → 조사정보 RAG → 자금흐름내역(범죄수익 추적·자금흐름 동작)
   → 범죄자금추적(신규 서비스·소스 선택) → 통신내역(신규 서비스) → 범죄수익 추적
   → 웹검색 → 법령 검토 → 보고서 작성 → 보고서 검증.
   (국제공조 f5는 조사정보 RAG 다음에 국제협력 RAG 단계 추가)
   drugScenarioTemplates와 동일하게 평범한 {key, ...} 객체로 정의(TDZ 회피). */
function fxBaseItems({ withGlobalRag = false } = {}){
  return [
    { key:"gi_cdw" },
    { key:"gi_rag_inv", label:"조사정보 RAG" },
    ...(withGlobalRag ? [{ key:"gi_rag_int", label:"국제협력 RAG" }] : []),
    { key:"gi_profit", label:"자금흐름내역 AI 분석 서비스", behaviors:["fund_flow"], instruction:"계좌·송금 등 자금흐름 내역 분석" },
    { key:"gi_fundtrace", behaviors:["transfer","virtual_asset","cash"], instruction:"등록된 이체·가상자산·현금 입출금 소스를 기반으로 범죄자금 추적" },
    { key:"gi_comms", behaviors:["call","sms","sns","messenger"], instruction:"등록된 통화·SMS·SNS·메신저 통신 소스 분석" },
    { key:"gi_profit", instruction:"범죄수익 흐름·은닉 가능성 분석" },
    { key:"gi_web" },
    { key:"gi_law" },
    { key:"gi_rep", instruction:"증거 정리" },
    { key:"gi_appr" },
  ];
}
const fxScenarioTemplates = [
  { id:"f1", name:"불법 외환거래 수사 템플릿",
    description:"자금흐름·범죄자금추적·통신내역·범죄수익을 연결하는 불법 외환거래 수사 흐름",
    items: giTemplateItems(fxBaseItems()) },
  { id:"f2", name:"자금세탁 수사 템플릿",
    description:"자금흐름·범죄자금추적·통신내역·범죄수익을 연결하는 자금세탁 수사 흐름",
    items: giTemplateItems(fxBaseItems()) },
  { id:"f3", name:"환치기·불법송금 수사 템플릿",
    description:"자금흐름·범죄자금추적·통신내역·범죄수익을 연결하는 환치기·불법송금 수사 흐름",
    items: giTemplateItems(fxBaseItems()) },
  { id:"f4", name:"재산국외도피 수사 템플릿",
    description:"자금흐름·범죄자금추적·통신내역·범죄수익을 연결하는 재산국외도피 수사 흐름",
    items: giTemplateItems(fxBaseItems()) },
  { id:"f5", name:"국제공조 수사 템플릿",
    description:"국제협력 RAG·자금흐름·범죄자금추적·통신내역·범죄수익을 연결하는 국제공조 수사 흐름",
    items: giTemplateItems(fxBaseItems({ withGlobalRag:true })) },
];

const FX_SCENARIO_STEPS = Object.fromEntries(
  fxScenarioTemplates.map(template => [template.id, template.items])
);

/* ── 마약수사 케이스 스텝 초기화/조회 헬퍼 ─────────────────── */
function activeDrugCaseSteps(){
  const aCase = activeDrugCase();
  if(!aCase) return [];
  if(!aCase.giSteps){
    const isFxCase = String(aCase.caseId || "").startsWith("FX-") || aCase.domain === "fxsearch";
    const defaults = isFxCase
      ? FX_SCENARIO_STEPS[fxDefaultTemplateId(aCase.invTypeId)]
      : DRUG_SCENARIO_STEPS[drugDefaultTemplateId(aCase.invTypeId)];
    aCase.giSteps    = defaults.map((s, i) => normalizeGiScenarioStep({
      ...s, id:`drs_${i}_${uid()}`, targetType:aCase.targetType || "person", target_type:aCase.targetType || "person",
      label: s.label || GI_STEP_SOURCES_MAP[s.key]?.label || s.key,
    }, i));
    aCase.stepStates  = {};
    aCase.stepResults = {};
    aCase.stepExpanded= {};
  }
  aCase.giSteps = aCase.giSteps.map((step, index) => normalizeGiScenarioStep({
    ...step,
    targetType: step.targetType || step.target_type || aCase.targetType || "person",
    target_type: step.target_type || step.targetType || aCase.targetType || "person",
  }, index));
  if(!aCase.stepResults)  aCase.stepResults  = {};
  if(!aCase.stepExpanded) aCase.stepExpanded = {};
  return aCase.giSteps;
}

function activeDrugStep(){
  return activeDrugCaseSteps().find(s => s.id === specialInvestigationState.activeDrugStepId) || null;
}

// GI_SERVICE_ALIASES를 key → label 역방향 맵 (정의 후 사용)
let GI_STEP_SOURCES_MAP = {};

const defaultDrugInvCases = [
  {
    caseId:"DRUG-2026-001", invTypeId:"d2", domain:"lawsearch",
    targetName:"김우범", targetType:"person", personId:"RP-0001", nationality:"한국",
    team:"마약수사 전담팀", investigator:"임조사",
    ownerUserId:"u09", assignees:["u09"],
    updated:"방금",
    status:{ label:"진행중", tone:"running", done:2, total:6, pct:33 },
  },
  {
    caseId:"DRUG-2026-002", invTypeId:"d1", domain:"lawsearch",
    targetName:"(주)위장무역", targetType:"company", companyId:"__NO_COMPANY_SELECTED__", drugOrgId:"RO-002", nationality:"한국",
    team:"마약수사 전담팀", investigator:"임조사",
    ownerUserId:"u09", assignees:["u09"],
    updated:"오늘 09:10",
    status:{ label:"자료수집", tone:"running", done:1, total:6, pct:17 },
  },
  {
    caseId:"DRUG-2026-003", invTypeId:"d5", domain:"lawsearch",
    targetName:"Park James", targetType:"person", personId:"RP-0003", nationality:"미국",
    team:"국제협력팀", investigator:"임조사",
    ownerUserId:"u09", assignees:["u09"],
    updated:"어제",
    status:{ label:"보고서 검증", tone:"review", done:5, total:6, pct:83 },
  },
  {
    caseId:"FX-2026-001", invTypeId:"f3", domain:"fxsearch",
    targetName:"(주)글로벌송금", targetType:"company", companyId:"FX-CO-101", drugOrgId:"FX-101", nationality:"한국",
    team:"외환수사 전담팀", investigator:"임조사",
    ownerUserId:"u09", assignees:["u09"],
    updated:"오늘 11:20",
    status:{ label:"진행중", tone:"running", done:2, total:6, pct:33 },
  },
  {
    caseId:"FX-2026-002", invTypeId:"f2", domain:"fxsearch",
    targetName:"이자금", targetType:"person", personId:"RP-0005", nationality:"한국",
    team:"외환수사 전담팀", investigator:"임조사",
    ownerUserId:"u09", assignees:["u09"],
    updated:"어제",
    status:{ label:"자료수집", tone:"running", done:1, total:6, pct:17 },
  },
];

function mainCanvasJob(job){
  const { title, company, owner, updated, companyId, isNew } = job;
  const status = job.status || {};
  const meta = `${company} · ${owner} · ${updated}`;
  return `
    <article class="main-job-card ${isNew ? "new" : ""}" data-analysis-job="${escapeHtml(job.jobId || companyId)}" data-analysis-page="${escapeHtml(job.page || "investigation")}" data-analysis-tab="${escapeHtml(job.openTab || "ongoing")}" data-canvas-company="${escapeHtml(companyId || "")}">
      <div class="main-job-head">
        <div>
          <h3>${title}</h3>
          <p>${meta}</p>
        </div>
        <span class="job-status ${status.tone}">${status.label}</span>
      </div>
      <span class="canvas-category-chip">${escapeHtml(canvasJobCategory(job))}</span>
      <div class="job-progress"><i style="width:${status.pct}%"></i></div>
      <div class="job-meta">
        <span>${status.done ?? 0}/${status.total ?? "?"} 단계</span>
        <strong>${status.pct}%</strong>
      </div>
    </article>
  `;
}
function simplePage(title,desc,body){return `<section class="card"><h2>${title}</h2><p class="muted">${desc}</p>${body}</section>`}

function scenarioBuilderPage(){
  return renderScenarioBuilderPage({
    config: scenarioBuilderConfig,
    isSuperAdmin: isCurrentUserSuperAdmin,
    activeView: scenarioBuilderViewTab,
    selectedPage: scenarioBuilderSelectedPage,
    showNewForm: sbShowNewForm,
    newDraft: sbNewDraft,
    editingServiceId: sbEditingServiceId,
  });
}

/* ── AI Agentic 서비스 — 부서 관리자 전용 노드 빌더 ──
   에이전트 서비스 목록/노드 그래프는 부서(그룹) 단위로 공유 저장한다. */
let agenticServicesByGroup = {};   // { [groupId]: { services:[], activeServiceId } }
let agenticListOpen = false;       // 좌측 '서비스 목록' 펼침 여부 (세션 UI 상태)

function agenticGroupStore(){
  const gid = currentUserGroup().id;
  if(!agenticServicesByGroup[gid] || typeof agenticServicesByGroup[gid] !== "object"){
    agenticServicesByGroup[gid] = { services: [], activeServiceId: null };
  }
  const store = agenticServicesByGroup[gid];
  if(!Array.isArray(store.services)) store.services = [];
  return store;
}

function activeAgenticService(){
  const store = agenticGroupStore();
  return store.services.find(s => s.id === store.activeServiceId) || store.services[0] || null;
}

function agenticUid(prefix){
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* 서비스의 노드 그래프는 Drawflow export JSON(service.drawflow)을 단일 진실원으로 한다.
   새 서비스는 drawflow:null로 만들고, 캔버스 첫 마운트 시 기본 흐름을 시드한다. */
function createAgenticService(){
  const store = agenticGroupStore();
  const seq = store.services.length + 1;
  return {
    id: agenticUid("svc"),
    name: `새 Agent 서비스 ${seq}`,
    drawflow: null,
  };
}

/* Drawflow 컨트롤러 인스턴스 & 현재 선택 노드 (세션 상태) */
let agenticFlow = null;
let agenticSelectedNodeId = null;
let agenticLocked = false;  // 기본 이동 가능(드래그로 위치 변경). 필요 시 이동잠금 토글

function agenticPersistFlow(json){
  const svc = activeAgenticService();
  if(svc){ svc.drawflow = json; saveCanvasState(); }
}

/* 캔버스에 Drawflow를 마운트 (render 후 init 훅에서 1회 호출) */
function initAgenticBuilder(){
  agenticFlow = null;
  agenticSelectedNodeId = null;
  const mount = document.getElementById("agenticDrawflow");
  if(!mount || !isCurrentUserAdmin()) return;
  const service = activeAgenticService();
  if(!service) return;
  loadDrawflow().then(() => {
    // 비동기 로드 사이 다른 페이지로 이동했으면 중단
    if(currentPage !== "agentic" || !document.body.contains(mount)) return;
    agenticFlow = createAgenticFlow({
      container: mount,
      service,
      persist: agenticPersistFlow,
      onSelect: (id) => {
        agenticSelectedNodeId = id;
        renderAgenticInspector();
      },
      onConnectionsChange: () => renderAgenticInspector(),
      onNodeRemoved: () => { agenticSelectedNodeId = null; renderAgenticInspector(); },
      locked: agenticLocked,
    });
  }).catch(() => {
    mount.innerHTML = `<div class="empty-state">노드 편집기를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.</div>`;
  });
}

/* 우측 인스펙터만 부분 렌더 (전체 재렌더 없이 선택 노드 상세 갱신) */
function renderAgenticInspector(){
  const panel = document.getElementById("agenticInspector");
  if(!panel) return;
  const node = (agenticFlow && agenticSelectedNodeId != null)
    ? agenticFlow.getNodeData(agenticSelectedNodeId)
    : null;
  // 노드 선택 시에만 팝업 표시
  panel.hidden = !node;
  panel.innerHTML = node ? agenticInspectorHtml(node) : "";
}

function agenticServicePage(){
  if(!isCurrentUserAdmin()){
    return `<section class="card" style="text-align:center;padding:60px 20px">
      <div style="font-size:48px;margin-bottom:16px">🔒</div>
      <h2 style="color:#991b1b">접근 권한 없음</h2>
      <p class="muted">AI Agentic 서비스는 부서 관리자만 사용할 수 있습니다.</p>
    </section>`;
  }
  const store = agenticGroupStore();
  return renderAgenticServicePage({ store, service: activeAgenticService(), listOpen: agenticListOpen, locked: agenticLocked });
}

/* ── AI Agentic 서비스 실행 (노드 그래프 → 제어 흐름 탐색 실행) ── */
let agenticRunning = false;
let agenticRunSteps = [];
let agenticPanelMode = "run";   // "run" | "history"
let agenticRunStartedLabel = "";
let agenticRunAbort = null;     // 실행 중지 시 in-flight 요청 취소

const AGENTIC_LLM_MODE = { "KCS_LLM": "int", "외부 LLM": "ext", "외부+내부 LLM": "ext_int" };

function renderAgenticRunPanel(){
  const panel = document.getElementById("agenticRunPanel");
  if(!panel) return;
  panel.hidden = false;
  if(agenticPanelMode === "history"){
    panel.innerHTML = agenticHistoryHtml(activeAgenticService()?.runs || []);
  }else{
    panel.innerHTML = agenticRunPanelHtml(agenticRunSteps, { running: agenticRunning });
  }
}

function agAddStep(node, status){
  const step = { id: node.id, type: node.type, label: node.data?.label, status, output: "" };
  agenticRunSteps.push(step);
  renderAgenticRunPanel();
  return step;
}
function agSetStep(step, status, output){
  step.status = status;
  if(output != null) step.output = output;
  renderAgenticRunPanel();
}

async function agenticLlmAnswer(prompt, mode){
  const res = await fetch("/api/llm_query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, llm_mode: mode }),
    signal: agenticRunAbort?.signal,
  }).then(r => r.json());
  return res.answer || "";
}

/* 에이전트 노드용 토큰 스트리밍 — /api/llm_stream(SSE) 응답을 읽어 실시간 누적.
   스트리밍 불가 시 단발 호출로 폴백. */
async function agenticLlmStream(prompt, mode, onToken){
  let resp;
  try{
    resp = await fetch("/api/llm_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, llm_mode: mode }),
      signal: agenticRunAbort?.signal,
    });
  }catch(e){ if(e?.name === "AbortError") return ""; return agenticLlmAnswer(prompt, mode); }
  if(!resp.ok || !resp.body) return agenticLlmAnswer(prompt, mode);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", acc = "";
  while(true){
    let chunk;
    try{ chunk = await reader.read(); }
    catch(e){ break; }   // AbortError 등 → 부분 결과 반환
    const { done, value } = chunk;
    if(done) break;
    if(!agenticRunning){ try{ reader.cancel(); }catch(e){ /* noop */ } break; }
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while((idx = buffer.indexOf("\n\n")) >= 0){
      const frame = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
      const ev = /event:\s*(\w+)/.exec(frame)?.[1];
      const dm = /data:\s*([\s\S]*)/.exec(frame);
      if(!dm) continue;
      let data = {}; try{ data = JSON.parse(dm[1]); }catch(e){ continue; }
      if(ev === "token" && data.text){ acc += data.text; if(onToken) onToken(acc); }
      else if(ev === "done"){ if(data.text) acc = data.text; }
      else if(ev === "error"){ throw new Error(data.detail || "스트리밍 오류"); }
    }
  }
  return acc;
}

/* 분기/반복 조건을 LLM으로 평가 → true/false. 조건 미정의면 null. */
async function agenticEvalCondition(node, context){
  const cond = (node.data?.condition || "").trim();
  if(!cond) return null;
  const q = `다음 조건이 현재 맥락에서 성립하면 정확히 "TRUE", 성립하지 않으면 "FALSE" 한 단어만 출력하세요. 다른 설명 금지.\n\n[조건]\n${cond}\n\n[맥락]\n${context || "(없음)"}`;
  const ans = (await agenticLlmAnswer(q, "int")).trim();
  return /\b(true)\b|참|만족|성립|yes/i.test(ans) && !/\b(false)\b|거짓|불만족|미성립|no/i.test(ans);
}

/* foreach 반복 대상 목록 추출 — 명시 목록(줄바꿈/콤마) 우선, 없으면 LLM이 맥락에서 JSON 배열로 추출 */
async function agenticDeriveListItems(node, context){
  const desc = (node.data?.condition || "").trim();
  if(desc){
    const parts = desc.split(/\n|,/).map(s => s.trim()).filter(Boolean);
    if(parts.length > 1) return parts;
  }
  const q = `다음 설명에 해당하는 항목들을 JSON 문자열 배열로만 출력하세요. 다른 텍스트 금지. 항목이 없으면 [].\n\n[설명]\n${desc || "맥락에서 반복 대상 목록"}\n\n[맥락]\n${context || "(없음)"}`;
  try{
    const ans = await agenticLlmAnswer(q, "int");
    const m = ans.match(/\[[\s\S]*\]/);
    if(m){ const arr = JSON.parse(m[0]); if(Array.isArray(arr)) return arr.map(String).filter(Boolean); }
  }catch(e){ /* noop */ }
  return desc ? [desc] : [];
}

/* 단일 노드(에이전트/DB/메일/메신저/기타) 실행 → 출력 문자열 (실패 시 throw) */
async function executeAgenticNode(node, context, onStream){
  const d = node.data || {};
  switch(node.type){
    case "agent": {
      const prompt = `${d.query || ""}${context ? `\n\n[이전 단계 결과]\n${context}` : ""}`.trim();
      if(!prompt) return "(질의가 비어 있어 건너뜀)";
      return (await agenticLlmStream(prompt, AGENTIC_LLM_MODE[d.model] || "ext", onStream)) || "(응답 없음)";
    }
    case "db": {
      const q = (d.query || d.note || "").trim();
      if(!q) return "(조회 질의 없음)";
      const res = await fetch("/api/db_query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, use_neo4j: !!d.useNeo4j }),
      }).then(r => r.json());
      if(res.error) throw new Error(`DB 조회 실패: ${res.error}`);
      const rowCount = Array.isArray(res.rows) ? res.rows.length : 0;
      return `${res.summary || "(요약 없음)"}\n\n조회 ${rowCount}건 · ${res.query || ""}`;
    }
    case "email":
    case "messenger": {
      const ch = node.type === "email" ? "메일" : "메신저";
      const to = (d.recipients || "").trim();
      const bodyText = (d.note || "").trim() || (context || "").trim() || "(본문 없음)";
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: node.type, recipients: to, subject: `[AI Agentic] ${d.label || ch}`, body: bodyText }),
      }).then(r => r.json());
      const statusKo = { sent: "발송 완료", simulated: "발송 시뮬레이션", error: "발송 실패" }[res.status] || res.status;
      if(res.status === "error") throw new Error(`${ch} ${statusKo}: ${res.detail || ""}`);
      return `[${ch}] ${statusKo}\n수신: ${to || "(미지정)"}\n${res.detail || ""}\n\n${bodyText.slice(0, 300)}`;
    }
    case "start": return "워크플로 시작";
    case "end": return "워크플로 종료";
    case "note": return d.note || "(메모 없음)";
    default: return `(시뮬레이션) ${agenticNodeTypeDef(node.type).label} 실행`;
  }
}

function saveAgenticRun(stopped){
  const svc = activeAgenticService();
  if(!svc) return;
  svc.runs = Array.isArray(svc.runs) ? svc.runs : [];
  const status = stopped ? "중지" : (agenticRunSteps.some(s => s.status === "error") ? "오류" : "완료");
  svc.runs.unshift({
    startedAtLabel: agenticRunStartedLabel,
    status,
    steps: agenticRunSteps.map(s => ({ label: s.label, type: s.type, status: s.status, output: s.output })),
  });
  svc.runs = svc.runs.slice(0, 20);
  saveCanvasState();
}

async function runActiveAgenticService(){
  if(agenticRunning || !agenticFlow) return;
  const graph = agenticFlow.getGraph();
  if(!graph.nodes.length) return;
  const startNode = graph.nodes.find(n => n.type === "start");
  if(!startNode){
    agenticPanelMode = "run"; agenticRunSteps = [];
    renderAgenticRunPanel();
    alert("시작(▶) 노드가 필요합니다.");
    return;
  }

  agenticRunning = true;
  agenticRunAbort = new AbortController();
  agenticPanelMode = "run";
  agenticRunSteps = [];
  agenticRunStartedLabel = new Date().toLocaleString("ko-KR");
  agenticFlow.clearStatuses();
  renderAgenticRunPanel();

  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const out = (id, port) => graph.edges.filter(e => e.from === id && (!port || e.fromPort === port)).map(e => e.to);
  const ctx = { text: "" };
  let stepCount = 0;
  let lastStreamRender = 0;
  const MAX_STEPS = 80;   // 폭주 방지 (사이클·과도한 분기)

  async function visit(id, stopSet){
    if(!agenticRunning || stepCount++ > MAX_STEPS) return;
    if(stopSet.has(id)) return;          // 반복 본문이 루프 노드로 되돌아오면 정지
    const node = byId.get(id);
    if(!node) return;
    const step = agAddStep(node, "running");
    agenticFlow.setNodeStatus(id, "running");
    try{
      // 분기: 조건 평가 후 한 경로만 진행
      if(node.type === "branch"){
        const truth = await agenticEvalCondition(node, ctx.text);
        const port = (truth !== false) ? "output_1" : "output_2";
        const label = port === "output_1" ? "참" : "거짓";
        agSetStep(step, "done", `조건 평가 → ${label}${truth === null ? " (조건 미정의 → 기본 참)" : ""}\n조건: ${node.data?.condition || "(없음)"}`);
        agenticFlow.setNodeStatus(id, "done");
        for(const t of out(id, port)){ if(!agenticRunning) break; await visit(t, stopSet); }
        return;
      }
      // 반복: while(조건 참) 또는 foreach(목록 항목) — 본문 반복 후 종료 경로
      if(node.type === "loop"){
        const max = Math.max(1, parseInt(node.data?.maxIterations, 10) || 10);
        const bodyStop = new Set(stopSet); bodyStop.add(id);
        let iter = 0;
        if(node.data?.loopMode === "foreach"){
          let items = await agenticDeriveListItems(node, ctx.text);
          items = items.slice(0, max);
          for(const item of items){
            if(!agenticRunning) break;
            iter++;
            ctx.text += `\n[현재 항목 ${iter}/${items.length}] ${item}\n`;
            for(const b of out(id, "output_1")){ if(!agenticRunning) break; await visit(b, bodyStop); }
          }
          agSetStep(step, "done", `목록 반복 ${iter}개 항목 실행 (최대 ${max})\n항목: ${items.join(", ").slice(0, 200) || "(없음)"}`);
        }else{
          while(agenticRunning && iter < max){
            const cond = await agenticEvalCondition(node, ctx.text);
            if(cond === false) break;
            iter++;
            for(const b of out(id, "output_1")){ if(!agenticRunning) break; await visit(b, bodyStop); }
            if(cond === null) break;     // 조건 미정의 → 본문 1회만
          }
          agSetStep(step, "done", `반복 ${iter}회 실행 (최대 ${max})\n${node.data?.condition || "조건 미정의"}`);
        }
        agenticFlow.setNodeStatus(id, "done");
        for(const t of out(id, "output_2")){ if(!agenticRunning) break; await visit(t, stopSet); }
        return;
      }
      // 일반 노드 — 에이전트는 토큰 스트리밍으로 실시간 표시
      const onStream = node.type === "agent"
        ? (txt) => { step.output = txt; const now = Date.now(); if(now - lastStreamRender > 150){ lastStreamRender = now; renderAgenticRunPanel(); } }
        : null;
      const result = await executeAgenticNode(node, ctx.text, onStream);
      agSetStep(step, "done", result);
      if((node.type === "agent" || node.type === "db") && result){
        ctx.text += `\n[${node.data?.label || node.type} 결과]\n${result}\n`;
      }
      agenticFlow.setNodeStatus(id, "done");
      for(const t of out(id, "output_1")){ if(!agenticRunning) break; await visit(t, stopSet); }
    }catch(error){
      agSetStep(step, "error", String((error && error.message) || error));
      agenticFlow.setNodeStatus(id, "error");
    }
  }

  await visit(startNode.id, new Set());
  const stopped = !agenticRunning;
  agenticRunning = false;
  saveAgenticRun(stopped);
  renderAgenticRunPanel();
}

function permissionApprovePage(){
  if(!isCurrentUserAdmin()){
    return `<section class="card" style="text-align:center;padding:60px 20px">
      <div style="font-size:48px;margin-bottom:16px">🔒</div>
      <h2 style="color:#991b1b">접근 권한 없음</h2>
      <p class="muted">권한 승인 관리는 정보기획담당관, 데이터담당관, 운영·지원 담당자만 사용할 수 있습니다.</p>
    </section>`;
  }
  const allKeys = Object.keys(defaultUserPermissions)
    .filter(key => AI_SERVICE_REGISTRY[key]?.adminVisible !== false);
  const requested = allKeys.filter(key => permissionStatus(key) === "requested");
  const granted   = allKeys.filter(key => permissionStatus(key) === "granted");
  const locked    = allKeys.filter(key => permissionStatus(key) === "locked");

  const requestedRows = requested.map(key => {
    const source = scenarioSourceByKey(key);
    const label  = source?.label || key;
    const group  = source?.group || "-";
    return `
      <tr class="perm-row requested">
        <td><span class="perm-group-badge">${escapeHtml(group)}</span></td>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td><span class="perm-status-badge requested">요청중</span></td>
        <td>${escapeHtml(currentUser().name)} · ${escapeHtml(currentUserGroup().org + " " + currentUserGroup().team)}</td>
        <td>${new Date().toLocaleDateString("ko-KR")}</td>
        <td class="perm-actions">
          <button class="btn perm-approve-btn" data-approve-key="${escapeHtml(key)}">승인</button>
          <button class="btn secondary perm-reject-btn" data-reject-key="${escapeHtml(key)}">거부</button>
        </td>
      </tr>
    `;
  }).join("");

  const grantedRows = granted.map(key => {
    const source = scenarioSourceByKey(key);
    const label  = source?.label || key;
    const group  = source?.group || "-";
    return `
      <tr class="perm-row granted">
        <td><span class="perm-group-badge">${escapeHtml(group)}</span></td>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td><span class="perm-status-badge granted">승인됨</span></td>
        <td>김관세 · 조사국 조사1과</td>
        <td>-</td>
        <td class="perm-actions">
          <button class="btn secondary perm-revoke-btn" data-revoke-key="${escapeHtml(key)}">권한 회수</button>
        </td>
      </tr>
    `;
  }).join("");

  const lockedRows = locked.map(key => {
    const source = scenarioSourceByKey(key);
    const label  = source?.label || key;
    const group  = source?.group || "-";
    return `
      <tr class="perm-row locked">
        <td><span class="perm-group-badge">${escapeHtml(group)}</span></td>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td><span class="perm-status-badge locked">미요청</span></td>
        <td>-</td>
        <td>-</td>
        <td class="perm-actions">
          <button class="btn perm-approve-btn" data-approve-key="${escapeHtml(key)}">직접 승인</button>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <section class="card perm-page">
      <div class="perm-page-head">
        <div>
          <h2>권한 승인 관리</h2>
          <p class="muted">사용자가 요청한 데이터소스·AI 서비스 사용 권한을 검토하고 승인 또는 거부합니다.</p>
        </div>
        <div class="perm-summary">
          <span class="perm-summary-item requested">요청중 <strong>${requested.length}</strong></span>
          <span class="perm-summary-item granted">승인됨 <strong>${granted.length}</strong></span>
          <span class="perm-summary-item locked">미요청 <strong>${locked.length}</strong></span>
        </div>
      </div>

      ${requested.length ? `
        <div class="perm-section">
          <h3 class="perm-section-title requested-title">⏳ 승인 대기 (${requested.length}건)</h3>
          <table class="perm-table">
            <thead><tr><th>구분</th><th>기능명</th><th>상태</th><th>요청자</th><th>요청일</th><th>처리</th></tr></thead>
            <tbody>${requestedRows}</tbody>
          </table>
        </div>
      ` : `
        <div class="perm-empty">현재 승인 대기 중인 권한 요청이 없습니다.</div>
      `}

      <div class="perm-section" style="margin-top:24px">
        <h3 class="perm-section-title granted-title">✓ 승인된 권한 (${granted.length}건)</h3>
        <table class="perm-table">
          <thead><tr><th>구분</th><th>기능명</th><th>상태</th><th>사용자</th><th>승인일</th><th>처리</th></tr></thead>
          <tbody>${grantedRows || '<tr><td colspan="6" class="perm-empty-cell">승인된 권한이 없습니다.</td></tr>'}</tbody>
        </table>
      </div>

      <div class="perm-section" style="margin-top:24px">
        <h3 class="perm-section-title locked-title">🔒 미요청 권한 (${locked.length}건)</h3>
        <table class="perm-table">
          <thead><tr><th>구분</th><th>기능명</th><th>상태</th><th>사용자</th><th>요청일</th><th>처리</th></tr></thead>
          <tbody>${lockedRows || '<tr><td colspan="6" class="perm-empty-cell">해당 없음</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

const DB_SEARCH_GROUP = "DB 검색";
const RAG_SEARCH_GROUP = "RAG 검색";
const ANALYSIS_AI_GROUP = "업무분석 AI서비스";
const LLM_SERVICE_GROUP = "분석지원 AI 서비스";
const EXTERNAL_AI_GROUP = "외부연계 AI서비스";
const REPORT_AI_GROUP = "보고서 생성 및 검증";
const AI_SERVICE_GROUP = ANALYSIS_AI_GROUP;
const DATA_SOURCE_GROUP = DB_SEARCH_GROUP;

// 모든 사용자 그룹에 기본 granted 처리할 분석지원/공유 서비스 (사건·권한과 무관한 범용 도구)
const DEFAULT_GRANTED_AGENTS = ["mail_share", "translate", "text_summary", "report_standard"];

const AI_SERVICE_REGISTRY = {
  db_cdw: {
    label: "CDW 조회", type: "db", group: DB_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "기업 프로파일, 최근 수입신고, 위험지표를 종합 요약",
    behaviorOptions: [
      { value: "profile_summary", label: "기업/신고 요약" },
      { value: "risk_focus", label: "위험지표 중심" },
      { value: "declaration_focus", label: "신고내역 중심" },
    ],
  },
  company_profile: {
    label: "기업 프로파일 조회", type: "company", group: DB_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "기업 기본정보, 위험등급, 수입실적, 최근 신고·검사 이력을 조회",
    supports: { company:true, person:false },
    behaviorOptions: [
      { value: "profile_lookup", label: "기업 프로파일 조회" },
      { value: "risk_summary", label: "위험정보 요약" },
    ],
  },
  rag_customs: {
    label: "관세정보 RAG", type: "rag_customs", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "관세 업무 정보에서 과세가격, 원산지, 품목분류 관련 근거 확인",
    behaviorOptions: [
      { value: "regulation_basis", label: "관세정보 근거 확인" },
      { value: "case_comparison", label: "유사사례 비교" },
    ],
  },
  rag_trade: {
    label: "무역정보 RAG", type: "rag_trade", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources", selectable: false, adminVisible: false,
    defaultInstruction: "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    behaviorOptions: [
      { value: "trade_signal", label: "무역 징후 확인" },
      { value: "market_context", label: "시장 맥락 확인" },
    ],
  },
  rag_audit: {
    label: "심사정보 RAG", type: "rag_audit", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "심사정보와 추징 가능성 관점의 조사 포인트 정리",
    behaviorOptions: [
      { value: "audit_case", label: "심사사례 비교" },
      { value: "recovery_point", label: "추징 포인트" },
    ],
  },
  rag_investigation: {
    label: "조사정보 RAG", type: "rag_investigation", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    behaviorOptions: [
      { value: "investigation_plan", label: "조사계획 수립" },
      { value: "evidence_check", label: "증빙 체크" },
    ],
  },
  rag_global: {
    label: "국제협력 RAG", type: "rag_global", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "국제협력 정보 기반으로 해외 거래구조와 위험 신호 확인",
    behaviorOptions: [
      { value: "global_signal", label: "국제협력 위험신호" },
      { value: "counterparty", label: "해외거래처 확인" },
    ],
  },
  rag_consultation: {
    label: "상담내역 RAG", type: "rag_consultation", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources", selectable: false, adminVisible: false,
    defaultInstruction: "상담내역과 민원 질의 응답에서 유사 사례와 처리 흐름 확인",
    behaviorOptions: [
      { value: "consultation_case", label: "상담사례 확인" },
      { value: "response_pattern", label: "답변흐름 정리" },
    ],
  },
  rag_risk_select: {
    label: "위험선별 RAG", type: "rag_risk_select", group: RAG_SEARCH_GROUP, permissionGroup: "dataSources", selectable: false, adminVisible: false,
    defaultInstruction: "위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인",
    behaviorOptions: [
      { value: "selection_rule", label: "선별기준 확인" },
      { value: "risk_signal", label: "위험신호 정리" },
    ],
  },
  ml: {
    label: "ML 모델 실행 AI 서비스", type: "ml", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "전체 모델을 실행해 위험 패턴을 비교",
    behaviorOptions: [
      { value: "all_models", label: "전체 모델 실행" },
      { value: "industry_stats", label: "동종업종 통계" },
      { value: "hs_risk", label: "HS 위험점수" },
      { value: "hs_recommend", label: "품목분류 추천" },
      { value: "anomaly", label: "이상치 탐색" },
    ],
  },
  network: {
    label: "관계망 분석 AI 서비스", type: "network", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    behaviorOptions: [
      { value: "relationship", label: "관계망 분석" },
      { value: "paper_company", label: "페이퍼컴퍼니" },
    ],
  },
  ontology: {
    label: "관세온톨로지 AI 서비스", type: "ontology", group: ANALYSIS_AI_GROUP, permissionGroup: "agents", selectable: false, adminVisible: false,
    defaultInstruction: "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성",
    behaviorOptions: [
      { value: "traveler_ontology", label: "우범여행자 온톨로지" },
      { value: "cargo_relation", label: "화물 관계 분석" },
      { value: "semantic_rules", label: "추론 규칙 생성" },
    ],
  },
  origin_analysis: {
    label: "원산지 검증 AI 서비스", type: "origin_analysis", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    behaviorOptions: [
      { value: "origin_certificate", label: "원산지증명 검토" },
      { value: "fta_risk", label: "FTA 리스크" },
      { value: "circumvention", label: "우회수입 확인" },
    ],
  },
  abnormal_trade: {
    label: "이상거래 검증 AI 서비스", type: "abnormal_trade", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    behaviorOptions: [
      { value: "price_pattern", label: "가격 패턴" },
      { value: "counterparty_pattern", label: "거래상대방" },
      { value: "declaration_pattern", label: "신고패턴" },
    ],
  },
  proceeds_tracking: {
    label: "범죄수익 추적 AI 서비스", type: "proceeds_tracking", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    behaviorOptions: [
      { value: "fund_flow", label: "자금흐름" },
      { value: "account_trace", label: "계좌추적 단서" },
      { value: "concealment", label: "은닉 가능성" },
    ],
  },
  // 신규: 범죄자금추적 — 실제 등록된 소스(이체·가상자산·현금 등)에 따라 분석.
  // 동작 선택 = 분석에 사용할 데이터 소스 선택. (범죄수익 추적과는 별개 서비스)
  fund_trace: {
    label: "범죄자금추적 AI 서비스", type: "fund_trace", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "등록된 자금 소스(계좌이체·가상자산·현금 입출금 등) 중 선택한 항목을 기반으로 범죄자금 흐름을 추적",
    behaviorOptions: [
      { value: "fund_flow", label: "자금흐름내역" },
      { value: "transfer", label: "계좌·송금 이체내역" },
      { value: "virtual_asset", label: "가상자산 거래내역" },
      { value: "cash", label: "현금 입출금내역" },
    ],
  },
  // 신규: 통신내역 AI 분석 — 동작 선택 = 분석에 사용할 통신 소스 선택.
  comms_analysis: {
    label: "통신내역 AI 분석 서비스", type: "comms", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "등록된 통신 소스(통화·SMS·SNS·메신저 등) 중 선택한 항목을 분석해 연락 빈도·공범·전달책 관계 단서를 도출",
    behaviorOptions: [
      { value: "call", label: "통화내역" },
      { value: "sms", label: "SMS" },
      { value: "sns", label: "SNS" },
      { value: "messenger", label: "메신저" },
    ],
  },
  route_analysis: {
    label: "운송경로 분석 AI 서비스", type: "route_analysis", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    behaviorOptions: [
      { value: "route_check", label: "운송경로" },
      { value: "supply_chain", label: "공급망 역추적" },
      { value: "transshipment", label: "우회경유" },
    ],
  },
  web_search: {
    label: "웹검색 AI 서비스", type: "web", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "업체, 공급망, 가격 변동 관련 기사 또는 직접 등록한 URL에서 지정 정보를 확인",
    behaviorOptions: [
      { value: "company_news", label: "업체 기사" },
      { value: "supply_chain", label: "공급망/가격" },
      { value: "industry_news", label: "동종업종 기사" },
      { value: "direct_url", label: "URL 직접 등록" },
    ],
  },
  declaration_verify: {
    label: "수입신고검증 AI 서비스", type: "declaration_verify", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    behaviorOptions: [
      { value: "declaration_consistency", label: "신고 정합성" },
      { value: "missing_evidence", label: "누락 증빙" },
    ],
  },
  hs_verify: {
    label: "품목분류검증 AI 서비스", type: "hs_verify", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    behaviorOptions: [
      { value: "classification_check", label: "분류 적정성" },
      { value: "alternative_hs", label: "대체 HS 후보" },
    ],
  },
  customs_value: {
    label: "과세가격평가 AI 서비스", type: "customs_value", group: ANALYSIS_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "과세가격 결정 요소와 저가신고 가능성 검토",
    behaviorOptions: [
      { value: "valuation_basis", label: "과세가격 근거" },
      { value: "undervaluation", label: "저가신고 탐지" },
    ],
  },
  patent: {
    label: "특허정보 조회 AI 서비스", type: "patent", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    behaviorOptions: [
      { value: "royalty_check", label: "로열티 확인" },
      { value: "patent_lookup", label: "특허 정보 조회" },
    ],
  },
  law: {
    label: "법령 검토 AI 서비스", type: "law", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "관련 법령, 고시, 판례, 유권해석 근거 검색",
    behaviorOptions: [
      { value: "law_basis", label: "법령 근거" },
      { value: "precedent", label: "판례/유권해석" },
    ],
  },
  ocr: {
    label: "OCR/문서인식 AI 서비스", type: "ocr", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    behaviorOptions: [
      { value: "document_extract", label: "문서 항목 추출" },
      { value: "evidence_parse", label: "증빙 구조화" },
    ],
  },
  rag_create: {
    label: "RAG 생성", type: "rag_create", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    behaviorOptions: [
      { value: "knowledge_build", label: "지식 생성" },
      { value: "source_cleanup", label: "자료 정제" },
    ],
  },
  translate: {
    label: "문서 번역 AI 서비스", type: "translate", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "입력한 문서·텍스트를 지정한 대상 언어로 번역",
    behaviorOptions: [
      { value: "faithful", label: "원문 충실 번역" },
      { value: "natural", label: "자연스러운 의역" },
    ],
  },
  text_summary: {
    label: "요약 AI 서비스", type: "text_summary", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "입력한 문서·텍스트를 지정한 결과 형식으로 요약",
    behaviorOptions: [
      { value: "bullet", label: "핵심 불릿" },
      { value: "table", label: "표 형식" },
      { value: "narrative", label: "서술 요약" },
      { value: "custom", label: "사용자 템플릿" },
    ],
  },
  report_standard: {
    label: "표준 보고서 생성 AI 서비스", type: "report_standard", group: LLM_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "표준 보고서 템플릿의 형식·구성에 맞춰 신규 보고서 내용을 재구성",
    behaviorOptions: [
      { value: "match_template", label: "템플릿 형식 적용" },
      { value: "fill_sections", label: "섹션별 채움" },
    ],
  },
  summary: {
    label: "보고서 요약 AI 서비스", type: "summary", group: LLM_SERVICE_GROUP, permissionGroup: "agents", selectable: false, adminVisible: false,
    defaultInstruction: "요약 대상을 조사관용 핵심 요약으로 정리",
    behaviorOptions: [
      { value: "brief", label: "핵심 요약" },
      { value: "evidence_table", label: "근거 표 정리" },
    ],
  },
  report_generate: {
    label: "보고서 생성 AI 서비스", type: "report", group: REPORT_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "보고서 대상 자료를 공식 조사보고서 초안으로 통합",
    behaviorOptions: [
      { value: "full_report", label: "전체 보고서" },
      { value: "issue_report", label: "쟁점 중심 보고서" },
    ],
  },
  report_validate: {
    label: "보고서 검증 AI 서비스", type: "validation", group: REPORT_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    behaviorOptions: [
      { value: "evidence_validation", label: "근거 검증" },
      { value: "risk_review", label: "리스크 리뷰" },
    ],
  },
  mail_share: {
    label: "분석결과 공유 AI 서비스", type: "mail_share", group: EXTERNAL_AI_GROUP, permissionGroup: "agents",
    defaultInstruction: "분석결과 보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유",
    behaviorOptions: [
      { value: "email_share", label: "이메일 공유" },
      { value: "team_brief", label: "팀 공유 요약" },
    ],
  },
};

const targetConfig = (companyPrompt, personPrompt = companyPrompt, supports = { company:true, person:true }) => ({
  supports,
  defaultPrompts: {
    company: companyPrompt,
    person: personPrompt,
  },
});

const AI_SERVICE_TARGET_CONFIG = {
  db_cdw: targetConfig(
    "기업 프로파일, 최근 수입신고, 위험지표를 종합 요약",
    "우범자 프로파일, 여행·반입 이력, 위험지표를 종합 요약"
  ),
  company_profile: targetConfig(
    "기업 기본정보, 위험등급, 수입실적, 최근 신고·검사 이력을 조회",
    "기업 프로파일 조회는 개인 대상에서 사용하지 않습니다.",
    { company:true, person:false }
  ),
  rag_customs: targetConfig(
    "관세 업무 정보에서 과세가격, 원산지, 품목분류 관련 근거 확인",
    "휴대품, 여행자 통관, 조사 절차 관련 규정 근거 확인"
  ),
  rag_trade: targetConfig(
    "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    "개인 반입·운송·거래 정보에서 이상 징후와 참고 근거 확인"
  ),
  rag_audit: targetConfig(
    "심사정보와 추징 가능성 관점의 조사 포인트 정리",
    "개인 사건 검토 이력과 추징 가능성 관점의 조사 포인트 정리"
  ),
  rag_investigation: targetConfig(
    "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    "개인 수사 정보 기반으로 수사 순서와 확인 자료 정리"
  ),
  rag_global: targetConfig(
    "국제협력 정보 기반으로 해외 거래구조와 위험 신호 확인",
    "국제 여행·체류·공조 정보 기반으로 개인 위험 신호 확인"
  ),
  rag_consultation: targetConfig(
    "상담내역과 민원 질의 응답에서 유사 사례와 처리 흐름 확인",
    "개인 민원·상담내역에서 유사 사례와 처리 흐름 확인"
  ),
  rag_risk_select: targetConfig(
    "위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인",
    "개인 위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인"
  ),
  ml: targetConfig(
    "전체 모델을 실행해 기업 위험 패턴을 비교",
    "전체 모델을 실행해 개인 위험 패턴을 비교"
  ),
  network: targetConfig(
    "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    "인물·동행자·연락처·주소 관계망을 분석해 공범, 전달책, 반복 연계 가능성을 식별"
  ),
  ontology: targetConfig(
    "기업·거래·품목 중심 관세 온톨로지와 지식그래프 관계를 구성",
    "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성"
  ),
  origin_analysis: targetConfig(
    "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    "개인 반입 물품의 원산지 증빙과 우회 반입 가능성을 분석"
  ),
  abnormal_trade: targetConfig(
    "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    "반입·송금·연락·이동 패턴의 이상 징후를 검증"
  ),
  proceeds_tracking: targetConfig(
    "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    "개인 계좌·송금·현금 반입 단서를 기반으로 범죄수익 은닉 가능성을 분석"
  ),
  fund_trace: targetConfig(
    "등록된 계좌이체·가상자산·현금 입출금 등 선택한 자금 소스를 기반으로 범죄자금 흐름을 추적",
    "개인 계좌·송금·가상자산·현금 입출금 등 선택한 자금 소스를 기반으로 범죄자금 흐름을 추적"
  ),
  comms_analysis: targetConfig(
    "임직원·거래처 간 통화·SMS·SNS·메신저 등 선택한 통신 소스를 분석해 연락 패턴·관계 단서를 도출",
    "통화·SMS·SNS·메신저 등 선택한 통신 소스를 분석해 공범·전달책 연락 패턴·관계 단서를 도출"
  ),
  route_analysis: targetConfig(
    "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    "여행경로, 경유지, 동행 이력을 분석해 우회 반입 가능성을 탐지"
  ),
  web_search: targetConfig(
    "업체, 공급망, 가격 변동 관련 기사 또는 직접 등록한 URL에서 지정 정보를 확인",
    "인물, 조직, 사건, 여행 경로 관련 공개 정보 또는 직접 등록한 URL에서 지정 정보를 확인"
  ),
  declaration_verify: targetConfig(
    "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    "개인 휴대품 신고, 반입 물품, 첨부 증빙을 비교해 불일치와 은닉 가능성 확인"
  ),
  hs_verify: targetConfig(
    "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    "개인 반입 물품의 품목분류와 규제 대상 여부를 검증"
  ),
  customs_value: targetConfig(
    "과세가격 결정 요소와 저가신고 가능성 검토",
    "개인 반입 물품의 과세가격 산정 근거와 축소 신고 가능성 검토"
  ),
  patent: targetConfig(
    "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    "개인 반입 물품의 상표권·지식재산권 침해 가능성 확인"
  ),
  law: targetConfig(
    "관련 법령, 고시, 판례, 유권해석 근거 검색",
    "개인 수사·통관·처분 관련 법령, 고시, 판례, 유권해석 근거 검색"
  ),
  ocr: targetConfig(
    "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    "개인 신분·여행·반입 관련 첨부 문서에서 주요 항목을 추출하고 구조화"
  ),
  rag_create: targetConfig(
    "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    "개인 사건 자료를 RAG 지식으로 구성하기 위한 항목 정리"
  ),
  translate: targetConfig(
    "입력한 문서·텍스트를 지정한 대상 언어로 번역",
    "입력한 문서·텍스트를 지정한 대상 언어로 번역"
  ),
  text_summary: targetConfig(
    "입력한 문서·텍스트를 지정한 결과 형식으로 요약",
    "입력한 문서·텍스트를 지정한 결과 형식으로 요약"
  ),
  report_standard: targetConfig(
    "표준 보고서 템플릿의 형식·구성에 맞춰 신규 보고서 내용을 재구성",
    "표준 보고서 템플릿의 형식·구성에 맞춰 신규 보고서 내용을 재구성"
  ),
  summary: targetConfig(
    "요약 대상을 조사관용 핵심 요약으로 정리",
    "요약 대상을 개인 수사 담당자용 핵심 요약으로 정리"
  ),
  report_generate: targetConfig(
    "보고서 대상 자료를 공식 조사보고서 초안으로 통합",
    "보고서 대상 자료를 개인 수사보고서 초안으로 통합"
  ),
  report_validate: targetConfig(
    "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증"
  ),
  mail_share: targetConfig(
    "분석결과 보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유",
    "개인 수사 결과보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유"
  ),
};

const registryKeysByPermissionGroup = (groupName) =>
  Object.entries(AI_SERVICE_REGISTRY)
    .filter(([, source]) => source.permissionGroup === groupName && source.adminVisible !== false)
    .map(([key]) => key);

const sidebarPermissionGroups = {
  dataSources: registryKeysByPermissionGroup("dataSources"),
  agents: registryKeysByPermissionGroup("agents"),
};

const ALL_RAG = sidebarPermissionGroups.dataSources;
const ALL_AGENTS = sidebarPermissionGroups.agents;

const userGroups = [
  // ── 정보국 ──────────────────────────────────────────────────────────────
  {id:"g01",org:"정보국",team:"정보기획담당관", isAdmin:true,  rag:ALL_RAG,                              agents:ALL_AGENTS},
  {id:"g02",org:"정보국",team:"인공지능혁신팀", isAdmin:false, rag:["db_cdw","rag_customs"],              agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","law","report_generate","report_validate"]},
  {id:"g03",org:"정보국",team:"시스템운영팀",   isAdmin:false, rag:["db_cdw","rag_customs"],              agents:["ocr","patent","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g04",org:"정보국",team:"연구개발장비팀", isAdmin:false, rag:["db_cdw","rag_customs","rag_audit"],  agents:["ocr","patent","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g05",org:"정보국",team:"데이터담당관",   isAdmin:true,  rag:ALL_RAG,                              agents:ALL_AGENTS},
  // ── 본청 업무분야 ────────────────────────────────────────────────────────
  {id:"g06",org:"본청",team:"통관 분야", isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","rag_create","law","report_generate","report_validate"]},
  {id:"g07",org:"본청",team:"감시분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","ml","network","web_search","declaration_verify","law","report_generate","report_validate"]},
  {id:"g08",org:"본청",team:"심사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g09",org:"본청",team:"조사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_investigation"],
    agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g10",org:"본청",team:"국제협력",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_global"],
    agents:["ocr","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g11",org:"본청",team:"정보분석",  isAdmin:false,
    rag:ALL_RAG,
    agents:["ocr","ml","network","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g12",org:"본청",team:"운영·지원", isAdmin:true,  rag:ALL_RAG, agents:ALL_AGENTS},
  // ── 세관 업무분야 ────────────────────────────────────────────────────────
  {id:"g13",org:"세관",team:"통관 분야", isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","rag_create","law","report_generate","report_validate"]},
  {id:"g14",org:"세관",team:"감시분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","ml","network","web_search","declaration_verify","law","report_generate","report_validate"]},
  {id:"g15",org:"세관",team:"심사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g16",org:"세관",team:"조사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_investigation"],
    agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g17",org:"세관",team:"국제협력",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_global"],
    agents:["ocr","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g18",org:"세관",team:"정보분석",  isAdmin:false,
    rag:ALL_RAG,
    agents:["ocr","ml","network","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g19",org:"세관",team:"운영·지원", isAdmin:true,  rag:ALL_RAG, agents:ALL_AGENTS},
];

const sampleUsers = [
  {id:"u01",groupId:"g01",name:"김기획",  avatar:"김"},
  {id:"u02",groupId:"g02",name:"이혁신",  avatar:"이"},
  {id:"u03",groupId:"g03",name:"박운영",  avatar:"박"},
  {id:"u04",groupId:"g04",name:"최연구",  avatar:"최"},
  {id:"u05",groupId:"g05",name:"정데이터",avatar:"정"},
  {id:"u06",groupId:"g06",name:"강통관",  avatar:"강"},
  {id:"u07",groupId:"g07",name:"조감시",  avatar:"조"},
  {id:"u08",groupId:"g08",name:"윤심사",  avatar:"윤"},
  {id:"u09",groupId:"g09",name:"임조사",  avatar:"임"},
  {id:"u10",groupId:"g10",name:"한협력",  avatar:"한"},
  {id:"u11",groupId:"g11",name:"노분석",  avatar:"노"},
  {id:"u12",groupId:"g12",name:"류지원",  avatar:"류"},
  {id:"u13",groupId:"g13",name:"오통관",  avatar:"오"},
  {id:"u14",groupId:"g14",name:"서감시",  avatar:"서"},
  {id:"u15",groupId:"g15",name:"신심사",  avatar:"신"},
  {id:"u16",groupId:"g16",name:"권조사",  avatar:"권"},
  {id:"u17",groupId:"g17",name:"황협력",  avatar:"황"},
  {id:"u18",groupId:"g18",name:"전분석",  avatar:"전"},
  {id:"u19",groupId:"g19",name:"고지원",  avatar:"고"},
];

const defaultUserPermissions = Object.fromEntries(
  Object.keys(AI_SERVICE_REGISTRY).map(key => [key, "granted"])
);

function scenarioSourceEntries(){
  return Object.entries(AI_SERVICE_REGISTRY)
    .filter(([, source]) => source.selectable !== false)
    .map(([key, source]) => ({
      key,
      ...source,
      ...(AI_SERVICE_TARGET_CONFIG[key] || {}),
    }));
}

function scenarioSourceByKey(key){
  const source = AI_SERVICE_REGISTRY[key];
  return source ? { key, ...source, ...(AI_SERVICE_TARGET_CONFIG[key] || {}) } : null;
}

function sourceBehaviorOptions(key){
  const source = scenarioSourceByKey(key);
  return source?.behaviorOptions || [{ value: "default", label: "기본 동작" }];
}

function sourceDefaultBehavior(key){
  return sourceBehaviorOptions(key)[0]?.value || "default";
}

function sourceDefaultBehaviors(key){
  return [sourceDefaultBehavior(key)];
}

function normalizeTargetType(value){
  return String(value || "").toLowerCase() === "person" ? "person" : "company";
}

function sourceSupportsTarget(key, targetType = "company"){
  const source = scenarioSourceByKey(key);
  const normalized = normalizeTargetType(targetType);
  return source?.supports?.[normalized] !== false;
}

function sourceDefaultInstruction(key, targetType = "company"){
  const source = scenarioSourceByKey(key);
  const normalized = normalizeTargetType(targetType);
  return source?.defaultPrompts?.[normalized]
    || source?.defaultPrompts?.company
    || source?.defaultInstruction
    || "";
}

function sourceBehaviorLabel(key, behavior){
  return sourceBehaviorOptions(key).find(option => option.value === behavior)?.label || "기본 동작";
}

function sourceBehaviorLabels(key, behaviors){
  const values = Array.isArray(behaviors) && behaviors.length ? behaviors : sourceDefaultBehaviors(key);
  return values.map(value => sourceBehaviorLabel(key, value));
}

function scenarioSuggestedInstruction(key, targetType = "company", behaviors = null){
  const base = sourceDefaultInstruction(key, targetType);
  const labels = sourceBehaviorLabels(key, behaviors);
  const focus = labels.length ? `\n\n중점 확인: ${labels.join(", ")}` : "";
  return `${base || "선택한 AI 서비스 기준으로 분석을 수행합니다."}${focus}`;
}

function isAutoScenarioInstruction(value, key, targetType = "company", behaviors = null){
  const text = String(value || "").trim();
  if(!text) return true;
  const base = sourceDefaultInstruction(key, targetType);
  if(text === base) return true;
  if(text === scenarioSuggestedInstruction(key, targetType, behaviors)) return true;
  return sourceBehaviorOptions(key).some(option =>
    text === scenarioSuggestedInstruction(key, targetType, [option.value])
  );
}

/* 구버전 라벨 → 현재 서비스 키 (저장된 시나리오 호환용) */
const SCENARIO_LABEL_SYNONYMS = {
  "심사결과RAG": "rag_audit",
  "수입신고검증": "declaration_verify",
  "품목분류검증": "hs_verify",
  "품목분류": "hs_verify",
  "과세가격평가": "customs_value",
  "웹검색": "web_search",
  "보고서생성": "report_generate",
  "보고서검증": "report_validate",
  "보고서승인": "report_validate",
  "법령검토": "law",
  "이상거래검증": "abnormal_trade",
  "원산지검증": "origin_analysis",
  "관계망분석": "network",
  "운송경로분석": "route_analysis",
  "범죄수익추적": "proceeds_tracking",
};

/* 시나리오 항목의 소스 해석: key → sourceKey → type → 라벨 매칭 순.
   구버전 키로 저장된 단계가 db_cdw로 잘못 폴백되어 모든 단계가
   CDW 동작·프롬프트로 표시되는 문제를 방지한다. */
function resolveScenarioSourceForItem(item){
  for(const candidate of [item.key, item.sourceKey, item.source_key, item.type]){
    const source = candidate && scenarioSourceByKey(candidate);
    if(source) return source;
  }
  const norm = value => String(value || "")
    .replace(/\s+/g, "")
    .replace(/AI서비스$/, "")
    .replace(/에이전트$/, "");
  const label = norm(item.label);
  if(label){
    if(SCENARIO_LABEL_SYNONYMS[label]) return scenarioSourceByKey(SCENARIO_LABEL_SYNONYMS[label]);
    const exact = Object.keys(AI_SERVICE_REGISTRY).find(k => norm(AI_SERVICE_REGISTRY[k].label) === label);
    if(exact) return scenarioSourceByKey(exact);
    const partial = Object.keys(AI_SERVICE_REGISTRY).find(k =>
      AI_SERVICE_REGISTRY[k].selectable !== false && label.includes(norm(AI_SERVICE_REGISTRY[k].label)));
    if(partial) return scenarioSourceByKey(partial);
  }
  return null;
}

function normalizeScenarioItem(item, index = 0){
  const resolved = resolveScenarioSourceForItem(item);
  if(!resolved && (item.key || item.label)){
    console.warn(`[시나리오] 알 수 없는 AI 서비스 키 → CDW로 폴백: key=${item.key} label=${item.label}`);
  }
  const source = resolved || scenarioSourceByKey("db_cdw");
  const key = source?.key || item.key || "db_cdw";
  const targetType = normalizeTargetType(item.target_type || item.targetType || "company");
  const shareRecipients = key === "mail_share"
    ? normalizeEmailIds([...(item.shareRecipients || []), ...(item.share_recipients || [])].join(","))
    : [];
  const webTargets = key === "web_search"
    ? normalizeWebTargets([...(item.webTargets || []), ...(item.web_targets || [])])
    : [];

  // scenarioBuilderConfig.agentOptionDefaults 우선 참조
  const savedDefaults = scenarioBuilderConfig?.agentOptionDefaults?.[key] || {};
  const configBehaviors = savedDefaults.behaviors?.length ? savedDefaults.behaviors
    : savedDefaults.behavior ? [savedDefaults.behavior] : null;
  const configInstruction = savedDefaults.instruction || null;

  // 동작 값 검증: 해당 서비스에 정의된 동작(빌트인 + 관리자 추가 동작)만 허용.
  // 과거 race로 다른 서비스(CDW 등)의 동작 값이 저장된 경우 걸러내고 기본값으로 복구한다.
  const validBehaviorValues = new Set([
    ...sourceBehaviorOptions(key).map(option => option.value),
    ...(Array.isArray(savedDefaults.customBehaviors) ? savedDefaults.customBehaviors : []),
  ]);
  const behaviorCandidates = [
    Array.isArray(item.behaviors) && item.behaviors.length ? item.behaviors : null,
    item.behavior ? [item.behavior] : null,
    configBehaviors,
  ];
  let behaviors = null;
  for(const candidate of behaviorCandidates){
    if(!candidate) continue;
    const valid = candidate.filter(value => validBehaviorValues.has(value));
    if(valid.length){ behaviors = valid; break; }
  }
  if(!behaviors) behaviors = sourceDefaultBehaviors(key);

  // 오염 복구: 과거 비동기 race로 다른 서비스(CDW)의 자동 생성 프롬프트가
  // 저장된 경우 폐기하고 해당 서비스 기본 프롬프트로 재생성한다.
  const DB_PROMPT_MARK = "통관데이터웨어하우스(CDW)";
  const DB_LIKE_KEYS = ["db_cdw", "db", "cdw", "company_profile", "company", "company_lookup"];
  const savedInstruction = item.instruction
    && String(item.instruction).includes(DB_PROMPT_MARK)
    && !DB_LIKE_KEYS.includes(key)
      ? null
      : item.instruction;

  const instruction = savedInstruction
    || configInstruction
    || sourceDefaultInstruction(key, targetType);

  return {
    id: item.id || uid(),
    key,
    type: item.type || source?.type || "db",
    label: item.label || source?.label || key,
    behaviors,
    behavior: behaviors[0],
    behaviorLabel: sourceBehaviorLabels(key, behaviors).join(", "),
    order: item.order || index + 1,
    targetType,
    target_type: targetType,
    instruction,
    extraPrompts: normalizeExtraPrompts(item.extraPrompts),
    shareRecipients,
    share_recipients: shareRecipients,
    webTargets,
    web_targets: webTargets,
  };
}

/* AI 서비스 기본 지시 외 추가로 등록한 프롬프트 목록 (체크 시 함께 실행됨) */
function normalizeExtraPrompts(list){
  if(!Array.isArray(list)) return [];
  return list
    .map(entry => ({
      id: entry?.id || uid(),
      text: String(entry?.text ?? "").trim(),
      enabled: entry?.enabled !== false,
    }))
    .filter(entry => entry.text);
}

function extraPromptsRunText(extraPrompts){
  const enabled = (extraPrompts || []).filter(p => p.enabled && p.text);
  return enabled.length
    ? `\n\n[추가 등록 프롬프트]\n${enabled.map(p => `- ${p.text}`).join("\n")}`
    : "";
}

const scenarioTemplates = [
  {
    id: "customs-basic",
    name: "관세조사 기본 템플릿",
    description: "신고내역, 관세·심사정보, 신고검증, 품목분류, 과세가격, 보고서 생성·검증을 순차 실행하는 기본 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["profile_summary"], order:1, instruction:"신고내역 중심 · 기업 프로파일과 최근 수입신고를 요약" },
      { key:"rag_customs", type:"rag_customs", label:"관세정보 RAG", behaviors:["regulation_basis"], order:2, instruction:"관세정보 근거 확인 · 과세가격, 원산지, 품목분류 관련 근거 확인" },
      { key:"rag_audit", type:"rag_audit", label:"심사정보 RAG", behaviors:["audit_case"], order:3, instruction:"심사정보와 추징 가능성 관점의 조사 포인트 정리" },
      { key:"declaration_verify", type:"declaration_verify", label:"수입신고검증 AI 서비스", behaviors:["declaration_consistency","missing_evidence"], order:4, instruction:"첨부문서 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 누락 증빙 확인" },
      { key:"hs_verify", type:"hs_verify", label:"품목분류검증 AI 서비스", behaviors:["classification_check"], order:5, instruction:"HS 코드 분류 적정성과 대체 후보 검토" },
      { key:"customs_value", type:"customs_value", label:"과세가격평가 AI 서비스", behaviors:["valuation_basis","undervaluation"], order:6, instruction:"과세가격 결정 요소와 저가신고 가능성 검토" },
      { key:"report_generate", type:"report", label:"보고서 생성 AI 서비스", behaviors:["full_report"], order:7, instruction:"보고서 대상 자료를 공식 조사보고서 초안으로 통합" },
      { key:"report_validate", type:"validation", label:"보고서 검증 AI 서비스", behaviors:["evidence_validation"], order:8, instruction:"보고서의 근거 충실성과 누락 증빙 검증" },
    ],
  },
  {
    id: "valuation-focused",
    name: "저가신고 집중 템플릿",
    description: "과세가격, 신고검증, 이상거래 검토에 집중해 보고서 생성·검증까지 수행하는 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["risk_focus","declaration_focus"], order:1, instruction:"위험지표와 신고내역을 함께 상세 확인" },
      { key:"rag_customs", type:"rag_customs", label:"관세정보 RAG", behaviors:["regulation_basis","case_comparison"], order:2, instruction:"관련 관세정보와 유사사례를 함께 확인" },
      { key:"rag_audit", type:"rag_audit", label:"심사정보 RAG", behaviors:["audit_case"], order:3, instruction:"심사정보와 추징 가능성 관점의 조사 포인트 정리" },
      { key:"declaration_verify", type:"declaration_verify", label:"수입신고검증 AI 서비스", behaviors:["declaration_consistency","missing_evidence"], order:4, instruction:"첨부문서 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 누락 증빙 확인" },
      { key:"hs_verify", type:"hs_verify", label:"품목분류검증 AI 서비스", behaviors:["classification_check"], order:5, instruction:"HS 코드 분류 적정성과 대체 후보 검토" },
      { key:"customs_value", type:"customs_value", label:"과세가격평가 AI 서비스", behaviors:["valuation_basis","undervaluation"], order:6, instruction:"과세가격 결정 요소와 저가신고 가능성 검토" },
      { key:"abnormal_trade", type:"abnormal_trade", label:"이상거래 검증 AI 서비스", behaviors:["price_pattern","declaration_pattern"], order:7, instruction:"가격 패턴과 신고패턴 중심으로 이상거래 징후 검증" },
      { key:"report_generate", type:"report", label:"보고서 생성 AI 서비스", behaviors:["issue_report"], order:8, instruction:"저가신고 쟁점 중심 보고서 초안 작성" },
      { key:"report_validate", type:"validation", label:"보고서 검증 AI 서비스", behaviors:["evidence_validation"], order:9, instruction:"보고서의 근거 충실성과 누락 증빙 검증" },
    ],
  },
  {
    id: "classification-origin",
    name: "품목분류·원산지 템플릿",
    description: "HS 분류, 원산지, 운송경로 검토에 맞춰 보고서 생성·검증까지 수행하는 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["declaration_focus"], order:1, instruction:"품목, 원산지, 신고가격 중심으로 최근 신고내역 확인" },
      { key:"rag_customs", type:"rag_customs", label:"관세정보 RAG", behaviors:["regulation_basis"], order:2, instruction:"품목분류와 원산지 관련 관세정보 확인" },
      { key:"rag_audit", type:"rag_audit", label:"심사정보 RAG", behaviors:["audit_case"], order:3, instruction:"품목분류·원산지 관련 심사사례와 조사 포인트 정리" },
      { key:"declaration_verify", type:"declaration_verify", label:"수입신고검증 AI 서비스", behaviors:["declaration_consistency"], order:4, instruction:"첨부문서 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치 확인" },
      { key:"hs_verify", type:"hs_verify", label:"품목분류검증 AI 서비스", behaviors:["classification_check","alternative_hs"], order:5, instruction:"HS 코드 분류 적정성과 대체 후보 검토" },
      { key:"origin_analysis", type:"origin_analysis", label:"원산지 검증 AI 서비스", behaviors:["origin_certificate","fta_risk"], order:6, instruction:"원산지 증빙과 FTA 적용 적정성 검토" },
      { key:"route_analysis", type:"route_analysis", label:"운송경로 분석 AI 서비스", behaviors:["route_check","transshipment"], order:7, instruction:"운송경로를 역추적해 우회수입 가능성 탐지" },
      { key:"report_generate", type:"report", label:"보고서 생성 AI 서비스", behaviors:["full_report"], order:8, instruction:"보고서 대상 자료를 공식 조사보고서 초안으로 통합" },
      { key:"report_validate", type:"validation", label:"보고서 검증 AI 서비스", behaviors:["evidence_validation"], order:9, instruction:"근거 충실성과 누락 증빙 검증" },
    ],
  },
];

// 템플릿의 소유 조직(정보국/본청/세관)을 해석한다.
// ownerOrgId가 없으면(레거시) 등록자의 그룹에서 조직을 유추한다.
function templateOrgId(template){
  if(template.ownerOrgId) return template.ownerOrgId;
  const owner = sampleUsers.find(user => user.id === template.ownerUserId);
  const group = owner ? userGroups.find(g => g.id === owner.groupId) : null;
  return group?.org || null;
}

// 일반/마약 빌트인 템플릿을 편집기 카드 형태로 변환.
// 단계 key를 AI 서비스 키(sourceKey)로 정규화해 관세 편집기(AI서비스 키 기반)와 호환시킨다.
function builtinTemplateCards(templates){
  return templates.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    items: (t.items || []).map((item, index) => ({
      ...item,
      key: scenarioSourceByKey(item.key) ? item.key : (item.sourceKey || giCommonSourceKey(item.key)),
      order: item.order ?? index + 1,
    })),
    ownerUserId: "system",
    ownerName: "공통",
    isBuiltin: true,
  }));
}

function allScenarioTemplates(domain = "customs"){
  if(domain === "general") return builtinTemplateCards(giScenarioTemplates);
  if(domain === "drug") return builtinTemplateCards(drugScenarioTemplates);
  if(domain === "fx") return builtinTemplateCards(fxScenarioTemplates);
  const builtins = scenarioTemplates
    .filter(t => !hiddenBuiltinIds.has(t.id))
    .map(t => ({
      ...t,
      ...(builtinOverrides[t.id] || {}),
      ownerUserId: "system",
      ownerName: "공통",
      isBuiltin: true,
    }));
  // 커스텀 템플릿은 등록자의 조직 단위로 공유한다.
  // (내가 등록했거나 같은 조직 소속이면 노출. 조직을 알 수 없는 레거시 항목은 공통 노출.)
  const myOrg = currentUserGroup().org;
  const sharedCustoms = customTemplates
    .filter(t => {
      const orgId = templateOrgId(t);
      return t.ownerUserId === currentUserId || !orgId || orgId === myOrg;
    })
    .map(t => ({
      ...t,
      ownerUserId: t.ownerUserId || currentUserId,
      ownerName: t.ownerName || currentUser().name,
      ownerOrgId: t.ownerOrgId || templateOrgId(t),
      isCustom: true,
    }));
  return [...builtins, ...sharedCustoms];
}

function scenarioTemplateOptionsHtml(){
  const templates = allScenarioTemplates();
  const builtIn = templates
    .filter(t => t.isBuiltin)
    .map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
    .join("");
  const shared = templates.filter(t => !t.isBuiltin);
  const sharedHtml = shared.length
    ? `<optgroup label="조직 공유 템플릿">${shared.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} · ${escapeHtml(t.ownerOrgId || templateOrgId(t) || "")} ${escapeHtml(templateOwnerLabel(t))}</option>`).join("")}</optgroup>`
    : "";
  return `<optgroup label="공통 템플릿">${builtIn}</optgroup>` + sharedHtml;
  const custom  = customTemplates.length
    ? `<optgroup label="내 저장 템플릿">${customTemplates.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("")}</optgroup>`
    : "";
  return builtIn + custom;
}

function scenarioTemplateById(id, domain = "customs"){
  return allScenarioTemplates(domain).find(template => template.id === id) || allScenarioTemplates(domain)[0] || scenarioTemplates[0];
}

function cloneTemplateItems(templateId, domain = "customs"){
  const template = scenarioTemplateById(templateId, domain);
  return template.items.map((item, index) => normalizeScenarioItem({...item, id: uid()}, index));
}

function templateOwnerLabel(template){
  if(template.ownerUserId === "system" || template.isBuiltin) return "공통";
  const owner = sampleUsers.find(user => user.id === template.ownerUserId);
  return owner?.name || template.ownerName || "사용자";
}

function canEditTemplate(template){
  return isCurrentUserAdmin() || template.ownerUserId === currentUserId;
}

function canDeleteTemplate(template){
  return canEditTemplate(template);
}

function scenarioSourceOptionsHtml(){
  const groups = scenarioSourceEntries().reduce((acc, source) => {
    if(!acc[source.group]) acc[source.group] = [];
    acc[source.group].push(source);
    return acc;
  }, {});
  return Object.entries(groups).map(([group, sources]) => `
    <optgroup label="${escapeHtml(group)}">
      ${sources.map(source => {
        const status = permissionStatus(source.key);
        const suffix = status === "granted" ? "" : ` · ${permissionLabel(status)}`;
        return `<option value="${escapeHtml(source.key)}">${escapeHtml(source.label + suffix)}</option>`;
      }).join("")}
    </optgroup>
  `).join("");
}

let scenarioCompanies = [];
let scenarioItems = [];
let selectedScenarioId = null;
let scenarioEventSource = null;
let scenarioSingleEventSource = null; // "이 AI서비스만 실행" 전용 SSE 연결 (단계별 자동실행과 분리)
let stepOutputs = {};
let stepStatuses = {};
let openedSteps = new Set();
let expandedResultStepId = null;
let scenarioInitialized = false;
let scenarioLoadedForCompany = null;
let editingTemplateId = null;
let templateEditorItems = [];
let templateEditorSelectedId = null;
let templateEditorInitialized = false;
let templateDraftName = "";
// 템플릿 편집기 대상 도메인: "customs" | "general" | "drug"
// (관세 편집기를 일반/마약수사 빌트인 편집에도 재사용)
let templateEditorDomain = "customs";
let canvasTab = "overview";

const specialDeps = {
  getCurrentPage: () => currentPage,
  getAnalysisScenarioConfig: page => scenarioConfigForPage(scenarioBuilderConfig, page),
  getDrugInvTab: () => specialInvestigationState.drugInvTab,
  setDrugInvTab: value => { specialInvestigationState.drugInvTab = value; },
  getScenarioBuilderConfig: () => scenarioBuilderConfig,
  activeDrugCase,
  activeDrugStep,
  activeDrugCaseSteps,
  drugCaseContext,
  drugInvTypeById,
  render,
  scenarioTemplatePanel,
  commonAnalysisReportPanel,
  ensureReportRequiredSections,
  findCompanyById,
  getDefaultDrugInvCases: () => defaultDrugInvCases,
  getLatestReport: () => latestReport,
  getLatestValidation: () => latestValidation,
  getRiskPersons: () => riskPersons,
  getRiskPersonProfile: personId => riskPersonProfiles[personId] || null,
  getScenarioCompanies: () => scenarioCompanies,
  isRiskPersonsLoading: () => riskPersonsLoading,
  isRiskPersonProfileLoading: personId => Boolean(riskPersonProfileLoading[personId]),
  loadRiskPersons,
  loadRiskPersonProfile,
  loadScenarioCompanies,
  riskPersonById,
  giStepSourceOptionsHtml,
  DRUG_INV_TYPES,
  invTypesForDomain,
  getCurrentUserId: () => currentUserId,
  getDrugRunEventSource: () => drugRunEventSource,
  sharedScenarioWorkbenchHtml,
  drugScenarioTemplateOptionsHtml: (currentInvTypeId) =>
    DRUG_INV_TYPES.map(t =>
      `<option value="${escapeHtml(t.id)}"${t.id === drugDefaultTemplateId(currentInvTypeId) ? " selected" : ""}>${t.num} ${escapeHtml(t.label)}</option>`
    ).join(""),
};
const specialInvestigation = createSpecialInvestigation(specialDeps);

const customsDeps = {
  getInvestigationTab: () => customsState.investigationTab,
  getAnalysisScenarioConfig: page => scenarioConfigForPage(scenarioBuilderConfig, page),
  getScenarioBuilderConfig: () => scenarioBuilderConfig,
  getActiveCanvasCompanyId: () => activeCanvasCompanyId,
  activeCanvasJobs,
  archivedCanvasJobs,
  canvasDataPanel,
  canvasJobCategory,
  canvasProfilePanel,
  canvasReportPanel,
  currentRunArchive,
  isCompletedActiveJob,
  loadScenarioCompanies,
  riskDashboardContent,
  scenarioTemplateOptionsHtml,
  scenarioTemplatePanel,
  scenarioWorkbenchV2,
  getScenarioCompanies: () => scenarioCompanies,
};
const customsInvestigation = createCustomsInvestigation(customsDeps);

function isSpecialInvestigationPage(page = currentPage){
  return specialInvestigation.isSpecialInvestigationPage(page);
}

function activeSpecialInvestigationPage(){
  return specialInvestigation.activeSpecialInvestigationPage();
}

function renderSpecialInvestigation(){
  specialInvestigation.renderSpecialInvestigation();
}

/* ── 위험선별 분석 상태 ─────────────────────────────────────── */
let riskScreeningTab     = "today";    // "today"|"tracking"

/* ── 통관정보분석 상태 ─────────────────────────────────────── */
let customsInfoTab       = "today";    // "today"|"stats"
let customsInfoDateFrom  = "";
let customsInfoDateTo    = "";

/* ── 국제정보분석 상태 ─────────────────────────────────────── */


/* ── 일반수사분석 상태 ─────────────────────────────────────── */
let riskPersons          = [];
let riskPersonsLoading   = false;
let riskPersonProfiles   = {};
let riskPersonProfileLoading = {};

const GEN_INV_TYPES = [
  { id:"t1", num:"①", label:"관세포탈 수사",              cls:"gi-t1" },
  { id:"t2", num:"②", label:"밀수입·밀수출 수사",         cls:"gi-t2" },
  { id:"t3", num:"③", label:"원산지 위반 수사",            cls:"gi-t3" },
  { id:"t4", num:"④", label:"외환·자금세탁 범죄 수사",    cls:"gi-t4" },
  { id:"t5", num:"⑤", label:"지식재산권 침해 수사",        cls:"gi-t5" },
  { id:"t6", num:"⑥", label:"전략물자·수출통제 위반 수사", cls:"gi-t6" },
  { id:"t7", num:"⑦", label:"기타 수사",                  cls:"gi-t7" },
];

function genInvTypeById(id){ return GEN_INV_TYPES.find(t => t.id === id) || GEN_INV_TYPES[6]; }
let giRunEventSource   = null; // 일반수사 분석 실행 SSE 연결
let drugRunEventSource = null; // 마약수사 분석 실행 SSE 연결 (별도 분리)

const genDeps = {
  getGeneralInvTab: () => generalInvestigationState.generalInvTab,
  getAnalysisScenarioConfig: page => scenarioConfigForPage(scenarioBuilderConfig, page),
  getScenarioBuilderConfig: () => scenarioBuilderConfig,
  activeGenInvCase,
  genInvTypeById,
  allGenInvCases,
  getCurrentUserId: () => currentUserId,
  activeGiCaseSteps,
  activeGiStep,
  canvasDataPanel,
  canvasProfilePanel,
  scenarioTemplatePanel,
  commonAnalysisReportPanel,
  ensureReportRequiredSections,
  generalInvCompanyId,
  getActiveCanvasCompanyId: () => activeCanvasCompanyId,
  getGiRunEventSource: () => giRunEventSource,
  getRiskPersons: () => riskPersons,
  getRiskPersonProfile: personId => riskPersonProfiles[personId] || null,
  getScenarioCompanies: () => scenarioCompanies,
  isRiskPersonsLoading: () => riskPersonsLoading,
  isRiskPersonProfileLoading: personId => Boolean(riskPersonProfileLoading[personId]),
  loadRiskPersons,
  loadRiskPersonProfile,
  riskPersonById,
  GEN_INV_TYPES,
  behaviorOptionsHtml,
  canonicalGiStepKey,
  giCommonSourceKey,
  giScenarioInstructionPreview,
  giStepSourceOptionsHtml,
  scenarioSourceByKey,
  sourceDefaultInstruction,
  // shared workbench 추가 deps
  permissionStatus,
  permissionLabel,
  giScenarioTemplateOptionsHtml: (currentInvTypeId) =>
    giScenarioTemplates.map(tpl =>
      `<option value="${escapeHtml(tpl.id)}"${tpl.id === giDefaultTemplateId(currentInvTypeId) ? " selected" : ""}>${escapeHtml(tpl.name)}</option>`
    ).join(""),
  sharedScenarioWorkbenchHtml,
};
const generalInvestigation = createGeneralInvestigation(genDeps);

/* 통합 서브탭 레지스트리 배선 ──────────────────────────────────────
   3개 업무 deps를 도메인 키로 묶어 통합 레지스트리를 만들고, 각 deps에
   buildSubtabsForPage(page)를 주입한다. 각 페이지는 자기 도메인 구현으로
   서브탭을 렌더하되, 타 업무 서브탭을 추가해도 가용 구현으로 폴백 렌더된다. */
const unifiedSubtabRegistry = createUnifiedSubtabRegistry({
  customs: customsDeps,
  general: genDeps,
  special: specialDeps,
});
// 분석 시나리오 템플릿(templates) 서브탭은 시나리오 설정(enabledSubtabs)과 무관하게 동작한다.
// - 설정에 들어있어도 무시(removeIds)하고, 조직 관리자에게만 해당 업무 영역 서브탭의
//   '오른쪽 끝'에 자동으로 추가(appendIds)한다. 비관리자에게는 노출하지 않는다.
// - 일반 사용자는 'AI서비스 분석 작업' 탭에서 등록된 템플릿을 불러와 개인별로 조정한다.
function adminSubtabOptions(){
  return { removeIds: ["templates"], appendIds: isCurrentUserAdmin() ? ["templates"] : [] };
}
customsDeps.buildSubtabsForPage = page => unifiedSubtabRegistry.subtabsForPage(page, "customs", scenarioBuilderConfig, adminSubtabOptions());
genDeps.buildSubtabsForPage = page => {
  const options = adminSubtabOptions();
  const aCase = genDeps.activeGenInvCase?.();
  if(aCase?.giSteps?.some(s => s.sourceKey === "network")){
    if(!options.appendIds.includes("network")) options.appendIds.push("network");
  }
  return unifiedSubtabRegistry.subtabsForPage(page, "general", scenarioBuilderConfig, options);
};
specialDeps.buildSubtabsForPage = page => unifiedSubtabRegistry.subtabsForPage(page, "special", scenarioBuilderConfig, adminSubtabOptions());

const GI_SERVICE_ALIASES = {
  gi_cdw:      { sourceKey:"db_cdw", type:"db" },
  gi_imp:      { sourceKey:"declaration_verify", type:"agent" },
  gi_val:      { sourceKey:"customs_value", type:"agent" },
  gi_hs:       { sourceKey:"hs_verify", type:"agent" },
  gi_route:    { sourceKey:"route_analysis", type:"agent" },
  gi_net:      { sourceKey:"network", type:"agent" },
  gi_profit:   { sourceKey:"proceeds_tracking", type:"agent" },
  gi_fundtrace:{ sourceKey:"fund_trace", type:"agent", label:"범죄자금추적 AI 서비스" },
  gi_comms:    { sourceKey:"comms_analysis", type:"agent", label:"통신내역 AI 분석 서비스" },
  gi_web:      { sourceKey:"web_search", type:"agent", label:"웹검색 AI 서비스" },
  gi_origin:   { sourceKey:"origin_analysis", type:"agent", label:"원산지 검증 AI 서비스" },
  gi_anomaly:  { sourceKey:"abnormal_trade", type:"agent" },
  gi_patent:   { sourceKey:"patent", type:"agent" },
  gi_rag_rev:  { sourceKey:"rag_audit", type:"rag", label:"심사정보 RAG" },
  gi_rag_inv:  { sourceKey:"rag_investigation", type:"rag", label:"조사정보 RAG" },
  gi_rag_int:  { sourceKey:"rag_global", type:"rag", label:"국제협력 RAG" },
  gi_law:      { sourceKey:"law", type:"agent", label:"법령 검토 AI 서비스" },
  gi_rep:      { sourceKey:"report_generate", type:"report", label:"보고서 작성" },
  gi_appr:     { sourceKey:"report_validate", type:"approve", label:"보고서 검증 AI 서비스" },
};

/* GI_STEP_SOURCES_MAP 초기화 (DRUG_SCENARIO_STEPS에서 사용) */
Object.entries(GI_SERVICE_ALIASES).forEach(([key, alias]) => {
  const source = scenarioSourceByKey(alias.sourceKey);
  GI_STEP_SOURCES_MAP[key] = { label: alias.label || source?.label || key, ...alias };
});

const GI_STEP_SOURCES = Object.entries(GI_SERVICE_ALIASES).map(([key, alias]) => {
  const source = scenarioSourceByKey(alias.sourceKey);
  return {
    key,
    sourceKey: alias.sourceKey,
    label: alias.label || source?.label || key,
    type: alias.type || "agent",
  };
});

function canonicalGiStepKey(key){
  const value = String(key || "");
  const exact = GI_STEP_SOURCES.find(source => source.key === value);
  if(exact) return exact.key;
  const withoutSuffix = value.replace(/\d+$/,"");
  return GI_STEP_SOURCES.find(source => source.key === withoutSuffix)?.key || value;
}

function giSourceByKey(key){
  const canonical = canonicalGiStepKey(key);
  const commonSource = scenarioSourceByKey(canonical);
  return GI_STEP_SOURCES.find(source => source.key === canonical)
    || (commonSource ? { key: canonical, sourceKey: canonical, label: commonSource.label, type: commonSource.type } : null)
    || { key: canonical || key, sourceKey:"summary", label: key || "분석 단계", type:"agent" };
}

function giCommonSourceKey(key){
  const canonical = canonicalGiStepKey(key);
  return GI_SERVICE_ALIASES[canonical]?.sourceKey || (scenarioSourceByKey(canonical) ? canonical : "summary");
}

function normalizeReportValidationLabel(label){
  const legacy = "보고서 " + "승인";
  return String(label || "").replaceAll(legacy, "보고서 검증");
}

function normalizeScenarioLabelsInPlace(items){
  if(!Array.isArray(items)) return items;
  items.forEach(item => {
    if(item && typeof item === "object" && "label" in item){
      item.label = normalizeReportValidationLabel(item.label);
    }
  });
  return items;
}

function normalizeCaseStepLabelsInPlace(cases){
  if(!Array.isArray(cases)) return cases;
  cases.forEach(aCase => normalizeScenarioLabelsInPlace(aCase?.giSteps));
  return cases;
}

function normalizeGiScenarioStep(step, index = 0){
  const source = giSourceByKey(step.key);
  const sourceKey = step.sourceKey || giCommonSourceKey(step.key);
  const targetType = normalizeTargetType(step.target_type || step.targetType || "company");

  // scenarioBuilderConfig.agentOptionDefaults 우선 참조
  const savedDefaults = scenarioBuilderConfig?.agentOptionDefaults?.[sourceKey] || {};
  const configBehaviors = savedDefaults.behaviors?.length ? savedDefaults.behaviors
    : savedDefaults.behavior ? [savedDefaults.behavior] : null;
  const configInstruction = savedDefaults.instruction || null;

  const behaviors = Array.isArray(step.behaviors) && step.behaviors.length
    ? step.behaviors
    : configBehaviors || sourceDefaultBehaviors(sourceKey);
  const instruction = step.instruction ?? step.note
    ?? configInstruction
    ?? sourceDefaultInstruction(sourceKey, targetType);
  const shareRecipients = sourceKey === "mail_share"
    ? normalizeEmailIds([...(step.shareRecipients || []), ...(step.share_recipients || [])].join(","))
    : [];
  const webTargets = sourceKey === "web_search"
    ? normalizeWebTargets([...(step.webTargets || []), ...(step.web_targets || [])])
    : [];
  return {
    ...step,
    id: step.id || `gis_${index}_${uid()}`,
    key: step.key || source.key,
    type: step.type || source.type,
    label: normalizeReportValidationLabel(step.label || source.label),
    sourceKey,
    targetType,
    target_type: targetType,
    behaviors,
    behavior: behaviors[0],
    behaviorLabel: sourceBehaviorLabels(sourceKey, behaviors).join(", "),
    instruction,
    note: instruction,
    extraPrompts: normalizeExtraPrompts(step.extraPrompts),
    shareRecipients,
    share_recipients: shareRecipients,
    webTargets,
    web_targets: webTargets,
  };
}

function giScenarioInstructionPreview(step, targetType = "company"){
  const sourceKey = step.sourceKey || giCommonSourceKey(step.key);
  const behaviors = sourceBehaviorLabels(sourceKey, step.behaviors);
  const normalizedTarget = normalizeTargetType(targetType || step.target_type || step.targetType);
  const instruction = step.instruction || step.note || sourceDefaultInstruction(sourceKey, normalizedTarget) || "기본 분석";
  const webTargets = scenarioItemWebTargets({ ...step, key: sourceKey });
  const suffix = webTargets.length ? ` · URL ${webTargets.length}건` : "";
  return `${behaviors.join(", ")} · ${instruction}${suffix}`;
}

function giScenarioRunInstruction(step, targetType = "company"){
  const sourceKey = step.sourceKey || giCommonSourceKey(step.key);
  const behaviors = sourceBehaviorLabels(sourceKey, step.behaviors);
  const normalizedTarget = normalizeTargetType(targetType || step.target_type || step.targetType);
  const instruction = step.instruction || step.note || sourceDefaultInstruction(sourceKey, normalizedTarget) || "기본 분석";
  const webTargets = scenarioItemWebTargets({ ...step, key: sourceKey });
  const webTargetText = webTargets.length
    ? `\n\n[직접 등록 URL]\n${webTargets.map(target => `- ${target.url}${target.query ? `\n  검색 내용: ${target.query}` : ""}`).join("\n")}`
    : "";
  return `[동작 선택]\n- ${behaviors.join("\n- ")}\n\n${instruction}${extraPromptsRunText(step.extraPrompts)}${webTargetText}`;
}

function giStepSourceOptionsHtml(selectedKey = ""){
  const typeLabel = {db:"DB 조회",agent:"AI 서비스",rag:"RAG",report:"보고서",approve:"검증"};
  return GI_STEP_SOURCES.map(source =>
    `<option value="${escapeHtml(source.key)}"${source.key === selectedKey ? " selected" : ""}>${escapeHtml(typeLabel[source.type] || source.type)} · ${escapeHtml(source.label)}</option>`
  ).join("");
}

function activeGiCaseSteps(){
  const aCase = activeGenInvCase();
  if(!aCase) return [];
  if(!aCase.giSteps){
    const defaults = GI_SCENARIO_STEPS[giDefaultTemplateId(aCase.invTypeId)];
    aCase.giSteps    = defaults.map((s, i) => normalizeGiScenarioStep({
      ...s,
      id:`gis_${i}_${uid()}`,
      targetType: aCase.targetType || "company",
      target_type: aCase.targetType || "company",
    }, i));
    aCase.stepStates  = {};
    aCase.stepResults = {};   // 단계별 실행 결과 텍스트
    aCase.stepExpanded= {};   // 결과 펼침 상태
    aCase.stepsDone   = 0;
  }
  aCase.giSteps = aCase.giSteps.map((step, index) => normalizeGiScenarioStep({
    ...step,
    targetType: step.targetType || step.target_type || aCase.targetType || "company",
    target_type: step.target_type || step.targetType || aCase.targetType || "company",
  }, index));
  if(!aCase.stepResults)  aCase.stepResults  = {};
  if(!aCase.stepExpanded) aCase.stepExpanded = {};
  return aCase.giSteps;
}

function activeGiStep(){
  return activeGiCaseSteps().find(s => s.id === generalInvestigationState.activeGiStepId) || null;
}

function refreshScenarioWorkbenchFromCase(aCase, fallbackRender){
  if(!aCase) return;
  const isDrugCase = String(aCase.caseId || "").startsWith("DRUG-");
  // AI서비스 분석 작업 탭의 대표(canonical) id는 "scenario"(workbench는 별칭). 과거 저장 상태 호환을 위해 둘 다 허용.
  const isActiveGeneralWorkbench =
    !isDrugCase &&
    currentPage === "generalinv" &&
    (generalInvestigationState.generalInvTab === "scenario" || generalInvestigationState.generalInvTab === "workbench") &&
    activeGenInvCase()?.caseId === aCase.caseId;
  const isActiveDrugWorkbench =
    isDrugCase &&
    isSpecialInvestigationPage(currentPage) &&
    (specialInvestigationState.drugInvTab === "scenario" || specialInvestigationState.drugInvTab === "workbench") &&
    activeDrugCase()?.caseId === aCase.caseId;

  if((isActiveGeneralWorkbench || isActiveDrugWorkbench) && document.getElementById("scenarioList")){
    const stateToLabel = { done:"완료", run:"실행중", error:"오류", wait:"대기" };
    stepStatuses = {};
    stepOutputs = {};
    Object.entries(aCase.stepStates || {}).forEach(([id, state]) => {
      stepStatuses[id] = stateToLabel[state] || "대기";
    });
    Object.entries(aCase.stepResults || {}).forEach(([id, result]) => {
      stepOutputs[id] = result;
    });
    const states = Object.values(aCase.stepStates || {});
    const doneCnt = states.filter(state => state === "done").length;
    updateScenarioProgress(doneCnt);
    if(states.includes("run")) setScenarioStatus("실행 중");
    else if(states.includes("error")) setScenarioStatus("오류");
    else if(scenarioItems.length && doneCnt === scenarioItems.length) setScenarioStatus("완료");
    else setScenarioStatus("대기");
    renderScenarioList();
    renderScenarioSteps();
    return;
  }

  if(typeof fallbackRender === "function") fallbackRender();
}

/* ── 일반수사 분석 SSE 실행 ──────────────────────────────── */
function giStreamSteps(aCase, stepsToRun){
  if(!aCase || !stepsToRun.length) return;

  /* 기존 연결 종료 */
  if(giRunEventSource){ try{ giRunEventSource.close(); }catch(e){} giRunEventSource = null; }

  /* 실행 상태는 서버가 해당 단계를 호출했다는 running 이벤트를 보낼 때만 반영한다. */
  if(!aCase.stepStates)  aCase.stepStates  = {};
  if(!aCase.stepResults) aCase.stepResults = {};
  stepsToRun.forEach(s => {
    if(aCase.stepStates[s.id] === "run") delete aCase.stepStates[s.id];
  });
  saveCanvasState();
  refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));

  /* URL 파라미터 구성 */
  const stepsPayload = stepsToRun.map(s => ({
    id: s.id,
    key: s.key,
    label: s.label,
    type: s.type,
    sourceKey: s.sourceKey || giCommonSourceKey(s.key),
    target_type: aCase.targetType || "company",
    targetType: aCase.targetType || "company",
    behaviors: s.behaviors || sourceDefaultBehaviors(s.sourceKey || giCommonSourceKey(s.key)),
    note: giScenarioRunInstruction(s, aCase.targetType),
    share_recipients: scenarioItemShareRecipients({ ...s, key: s.sourceKey || giCommonSourceKey(s.key) }),
    web_targets: scenarioItemWebTargets({ ...s, key: s.sourceKey || giCommonSourceKey(s.key) }),
  }));
  const shareRecipients = normalizeEmailIds(stepsPayload
    .filter(step => step.sourceKey === "mail_share")
    .flatMap(step => step.share_recipients || [])
    .join(","));
  const params = new URLSearchParams({
    execution_mode: "sequential",
    case_id:     aCase.caseId,
    target_name: aCase.targetName,
    target_type: aCase.targetType || "company",
    targetType:  aCase.targetType || "company",
    target_id:   aCase.targetType === "person" ? (aCase.personId || "") : (aCase.companyId || generalInvCompanyId(aCase) || ""),
    steps:       JSON.stringify(stepsPayload),
    share_recipients: JSON.stringify(shareRecipients),
    web_targets: JSON.stringify(normalizeWebTargets(stepsPayload.flatMap(step => step.web_targets || []))),
  });
  const url = `/api/gi_run?${params.toString()}`;
  giRunEventSource = new EventSource(url);

  /* SSE 이벤트 처리 */
  giRunEventSource.addEventListener("step", e => {
    const data = JSON.parse(e.data);
    const giStepId = data.gi_step_id;
    const step = stepsToRun.find(s => s.id === giStepId);
    if(!step) return;

    if(data.status === "running"){
      aCase.stepStates[step.id] = "run";
    } else if(data.status === "done"){
      aCase.stepStates[step.id]  = "done";
      aCase.stepResults[step.id] = data.output || "";
      /* 케이스 진행률 업데이트 */
      const allSteps = aCase.giSteps || [];
      const doneCnt  = allSteps.filter(s => (aCase.stepStates||{})[s.id] === "done").length;
      aCase.stepsDone = doneCnt;
      aCase.status = {
        ...aCase.status,
        done: doneCnt, total: allSteps.length,
        pct:  allSteps.length ? Math.round(doneCnt / allSteps.length * 100) : 0,
        label: doneCnt === allSteps.length ? "완료" : "진행중",
        tone:  doneCnt === allSteps.length ? "done"  : "run",
      };
    } else if(data.status === "error"){
      aCase.stepStates[step.id]  = "error";
      aCase.stepResults[step.id] = `[오류] ${data.error || "실행 중 오류가 발생했습니다."}`;
    }
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
  });

  giRunEventSource.addEventListener("workflow", e => {
    const data = JSON.parse(e.data);
    if(data.status === "completed" || data.status === "failed"){
      if(giRunEventSource){ giRunEventSource.close(); giRunEventSource = null; }
      saveCanvasState();
      refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
    }
  });

  giRunEventSource.onerror = () => {
    if(giRunEventSource){ giRunEventSource.close(); giRunEventSource = null; }
    stepsToRun.forEach(s => {
      if(aCase.stepStates[s.id] === "run") aCase.stepStates[s.id] = "error";
    });
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
  };
}

function drugStreamSteps(aCase, stepsToRun){
  if(!aCase || !stepsToRun.length) return;
  if(drugRunEventSource){ try{ drugRunEventSource.close(); }catch(e){} drugRunEventSource = null; }

  if(!aCase.stepStates)  aCase.stepStates  = {};
  if(!aCase.stepResults) aCase.stepResults = {};
  stepsToRun.forEach(s => {
    if(aCase.stepStates[s.id] === "run") delete aCase.stepStates[s.id];
  });
  saveCanvasState();
  refreshScenarioWorkbenchFromCase(aCase, renderSpecialInvestigation);

  const targetType = aCase.targetType || "person";
  const stepsPayload = stepsToRun.map(s => ({
    id: s.id,
    key: s.key,
    label: s.label,
    type: s.type,
    sourceKey: s.sourceKey || giCommonSourceKey(s.key),
    target_type: targetType,
    targetType,
    behaviors: s.behaviors || sourceDefaultBehaviors(s.sourceKey || giCommonSourceKey(s.key)),
    note: giScenarioRunInstruction(s, targetType),
    share_recipients: scenarioItemShareRecipients({ ...s, key: s.sourceKey || giCommonSourceKey(s.key) }),
    web_targets: scenarioItemWebTargets({ ...s, key: s.sourceKey || giCommonSourceKey(s.key) }),
  }));
  const shareRecipients = normalizeEmailIds(stepsPayload
    .filter(step => step.sourceKey === "mail_share")
    .flatMap(step => step.share_recipients || [])
    .join(","));
  const params = new URLSearchParams({
    execution_mode: "sequential",
    case_id: aCase.caseId,
    target_name: aCase.targetName,
    target_type: targetType,
    targetType,
    target_id: targetType === "person" ? (aCase.personId || "") : (aCase.companyId || ""),
    steps: JSON.stringify(stepsPayload),
    share_recipients: JSON.stringify(shareRecipients),
    web_targets: JSON.stringify(normalizeWebTargets(stepsPayload.flatMap(step => step.web_targets || []))),
  });
  drugRunEventSource = new EventSource(`/api/gi_run?${params.toString()}`);

  drugRunEventSource.addEventListener("step", e => {
    const data = JSON.parse(e.data);
    const step = stepsToRun.find(s => s.id === data.gi_step_id);
    if(!step) return;
    if(data.status === "running"){
      aCase.stepStates[step.id] = "run";
    } else if(data.status === "done"){
      aCase.stepStates[step.id] = "done";
      aCase.stepResults[step.id] = data.output || "";
      const allSteps = aCase.giSteps || [];
      const doneCnt = allSteps.filter(s => (aCase.stepStates || {})[s.id] === "done").length;
      aCase.status = {
        ...aCase.status,
        done: doneCnt,
        total: allSteps.length,
        pct: allSteps.length ? Math.round(doneCnt / allSteps.length * 100) : 0,
        label: doneCnt === allSteps.length ? "완료" : "진행중",
        tone: doneCnt === allSteps.length ? "done" : "run",
      };
    } else if(data.status === "error"){
      aCase.stepStates[step.id] = "error";
      aCase.stepResults[step.id] = `[오류] ${data.error || "실행 중 오류가 발생했습니다."}`;
    }
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, renderSpecialInvestigation);
  });

  drugRunEventSource.addEventListener("workflow", e => {
    const data = JSON.parse(e.data);
    if(data.status === "completed" || data.status === "failed"){
      if(drugRunEventSource){ drugRunEventSource.close(); drugRunEventSource = null; }
      saveCanvasState();
      refreshScenarioWorkbenchFromCase(aCase, renderSpecialInvestigation);
    }
  });

  drugRunEventSource.onerror = () => {
    if(drugRunEventSource){ drugRunEventSource.close(); drugRunEventSource = null; }
    stepsToRun.forEach(s => {
      if(aCase.stepStates[s.id] === "run") aCase.stepStates[s.id] = "error";
    });
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, renderSpecialInvestigation);
  };
}

function giTemplateStep(key, instruction = "", behaviors = null){
  const source = giSourceByKey(key);
  const sourceKey = source.sourceKey || giCommonSourceKey(key);
  const selectedBehaviors = Array.isArray(behaviors) && behaviors.length
    ? behaviors
    : sourceDefaultBehaviors(sourceKey);
  return {
    key: canonicalGiStepKey(key),
    sourceKey,
    type: source.type,
    label: source.label,
    behaviors: selectedBehaviors,
    instruction: instruction || sourceDefaultInstruction(sourceKey),
  };
}

function giTemplateItems(items){
  return items.map((item, index) => ({ ...item, order:index + 1 }));
}

function giDefaultTemplateId(invTypeId){
  return giScenarioTemplates.some(template => template.id === invTypeId) ? invTypeId : "t7";
}

function drugDefaultTemplateId(invTypeId){
  return drugScenarioTemplates.some(template => template.id === invTypeId) ? invTypeId : "d1";
}

function fxDefaultTemplateId(invTypeId){
  return fxScenarioTemplates.some(template => template.id === invTypeId) ? invTypeId : "f1";
}

/* ── 일반수사 분석 시나리오 템플릿 ──────────────────────── */
const giScenarioTemplates = [
  {
    id:"t1",
    name:"관세포탈 수사 템플릿",
    description:"과세가격, 신고검증, 품목분류, 이상거래, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_val"),
      giTemplateStep("gi_rag_rev"),
      giTemplateStep("gi_imp"),
      giTemplateStep("gi_val"),
      giTemplateStep("gi_hs"),
      giTemplateStep("gi_anomaly", "이상거래 검증 AI 서비스 신규 구성"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t2",
    name:"밀수입·밀수출 수사 템플릿",
    description:"신고검증, 운송경로, 관계망, 범죄수익, 조사·국제 RAG를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_route"),
      giTemplateStep("gi_net", "관계망 분석 AI 서비스 실행"),
      giTemplateStep("gi_profit", "자금흐름, 계좌 추적 연계"),
      giTemplateStep("gi_rag_inv"),
      giTemplateStep("gi_rag_int"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t3",
    name:"원산지 위반 수사 템플릿",
    description:"신고검증, 운송경로, 원산지, 조사·국제 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_route", "우회수입 탐지"),
      giTemplateStep("gi_origin"),
      giTemplateStep("gi_rag_inv"),
      giTemplateStep("gi_rag_int"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t4",
    name:"외환·자금세탁 범죄 수사 템플릿",
    description:"신고검증, 범죄수익 추적, 조사·국제 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_profit", "자금흐름, 계좌 추적 연계"),
      giTemplateStep("gi_rag_inv"),
      giTemplateStep("gi_rag_int"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t5",
    name:"지식재산권 침해 수사 템플릿",
    description:"신고검증, 특허정보, 품목분류, 운송경로, 심사 RAG를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_patent", "권리자 정보 확인"),
      giTemplateStep("gi_hs", "위조품 식별"),
      giTemplateStep("gi_route", "우회수입 탐지, 공급망 역추적"),
      giTemplateStep("gi_rag_rev"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t6",
    name:"전략물자·수출통제 위반 수사 템플릿",
    description:"신고검증, 품목분류, 특허정보, 국제 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴, 수출허가 검증"),
      giTemplateStep("gi_hs", "전략물자 해당 여부, HS코드 기반 해당 품목 자동 식별, 수출허가 검증"),
      giTemplateStep("gi_patent", "권리자 정보 확인"),
      giTemplateStep("gi_rag_int", "대북제재 스크리닝"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t7",
    name:"기타 수사 템플릿",
    description:"공통 CDW 조회를 시작점으로 구성하는 기본 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
    ]),
  },
];

const GI_SCENARIO_STEPS = Object.fromEntries(
  giScenarioTemplates.map(template => [template.id, template.items])
);


const defaultGenInvCases = [
  { caseId:"GI-2026-001", targetName:"한국소재무역(주)", invTypeId:"t1", targetType:"company", companyId:"C-1001",
    status:{ label:"진행중", tone:"running", pct:65, done:4, total:7 },
    ownerUserId:"u09", assignees:["u09"],
    investigator:"임조사", team:"조사국 조사1과", created:"2026-05-10", updated:"방금" },
  { caseId:"GI-2026-002", targetName:"샘플우범자001 (개인)", invTypeId:"t2", targetType:"person", personId:"RP-0001",
    status:{ label:"대기", tone:"wait", pct:10, done:1, total:7 },
    ownerUserId:"u09", assignees:["u09"],
    investigator:"임조사", team:"세관 조사분야", created:"2026-05-15", updated:"오늘 09:30" },
  { caseId:"GI-2026-003", targetName:"글로벌패션코리아", invTypeId:"t5", targetType:"company", companyId:"C-1003",
    status:{ label:"검토중", tone:"review", pct:85, done:6, total:7 },
    ownerUserId:"u09", assignees:["u09"],
    investigator:"임조사", team:"조사국 조사1과", created:"2026-04-28", updated:"어제" },
];
const defaultGenInvCasesBaseline = JSON.parse(JSON.stringify(defaultGenInvCases));

function allGenInvCases(){ return [...defaultGenInvCases, ...generalInvestigationState.customGenInvCases]; }
function activeGenInvCase(){ return allGenInvCases().find(c => c.caseId === generalInvestigationState.activeGenInvCaseId) || null; }
function riskPersonById(personId){ return riskPersons.find(person => person.person_id === personId) || null; }
/* ─────────────────────────────────────────────────────────── */
let activeCanvasCompanyId = null;
let activeScenarioTemplateId = "customs-basic";
let showScenarioCompanyPicker = false;
let customCanvasJobs = [];
let userPermissions = {...defaultUserPermissions};
let canvasJobOverrides = {};
let canvasRunArchives = {};
let hiddenCanvasJobsByUser = {};
let userWorkspaces = {};
let overviewArchiveOpen = false;
let customTemplates = [];
let hiddenBuiltinIds = new Set();
let builtinOverrides = {};
let currentUserId = "u01";
let scenarioBuilderConfig = loadScenarioBuilderConfig();
let scenarioBuilderViewTab = "subtabs";
let scenarioBuilderSelectedPage = ""; // Pool UI에서 현재 선택된 업무분석 페이지
let sbShowNewForm = false;            // 신규 업무분석 폼 열림 여부
let sbEditingServiceId = null;        // AI 서비스 설정: 현재 편집 중인 serviceId
let sbNewDraft = {                    // 신규 업무분석 초안
  page: "", title: "", description: "",
  template: "special-investigation",
  enabledSubtabs: [], defaultTab: "",
};
let latestReport = "보고서가 아직 생성되지 않았습니다.";
let latestValidation = "검증 결과가 아직 없습니다.";
const canvasStateKey = "kcs_ai_canvas_state_v1";
let scenarioCompaniesLoading = false;
let companyDetailCache = {};
let companyScenarios = {};   // { [companyId]: scenarioItem[] }
let currentPage = "home";
let riskDashboardFilter = { query: "", minScore: 0 };

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
  return document.querySelector("[data-home-llm-mode]")?.dataset.llmMode || "ext";
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
  proceeds_tracking:"범죄수익추적", route_analysis:"운송경로분석", web:"웹검색",
  declaration_verify:"수입신고검증", hs_verify:"품목분류검증", customs_value:"과세가격평가",
  summary:"보고서요약", patent:"특허정보", rag_create:"RAG생성", law:"법령정보",
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

function coachAttachedFileSummaries(){
  return coachAttachedFiles.map(f => ({
    name: f.name, type: f.type, size: f.size, encoding: f.encoding,
  }));
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
  { type:"db",                 label:"CDW 조회",              key:"db_cdw" },
  { type:"company",            label:"기업 프로파일 조회",      key:"company_profile" },
  { type:"rag_customs",        label:"관세정보 RAG",           key:"rag_customs" },
  { type:"rag_audit",          label:"심사정보 RAG",          key:"rag_audit" },
  { type:"rag_investigation",  label:"조사정보 RAG",          key:"rag_investigation" },
  { type:"rag_global",         label:"국제협력 RAG",          key:"rag_global" },
  { type:"web",                label:"웹검색 AI 서비스",          key:"web_search" },
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
  { type:"patent",             label:"특허정보 조회 AI 서비스",   key:"patent" },
  { type:"law",                label:"법령 검토 AI 서비스",       key:"law" },
  { type:"ocr",                label:"OCR/문서인식 AI 서비스",    key:"ocr" },
  { type:"rag_create",         label:"RAG 생성",                 key:"rag_create" },
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
function homeCardCollapseToggleHtml(key){
  const collapsed = !!homeCardCollapsed[key];
  return `<button type="button" class="home-mini-btn home-card-collapse" data-home-card-collapse="${escapeHtml(key)}"
      aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "카드 펼치기" : "카드 접기"}"
      title="${collapsed ? "펼치기" : "접기"}">${collapsed ? "▸ 펴기" : "▾ 접기"}</button>`;
}

// 업무지식베이스(검색) 카드의 기본 프롬프트 — 실제 조건은 카드 프롬프트에서 직접 작성한다.
function homeSourceCardPromptDefault(key){
  const label = AI_SERVICE_REGISTRY[key]?.label || key;
  return `${label}에서 원하는 조건의 자료를 조회해줘.`;
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
  customs_value: [
    { key:"target", label:"대상 기업/신고", placeholder:"예: C-1002 또는 신고번호", required:true },
    { key:"period", label:"조사기간", placeholder:"예: 2023.01~2025.03" },
    { key:"hs", label:"대상 HS", placeholder:"예: 8471.30" },
  ],
  hs_verify: [
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
  ocr: [
    { key:"doc", label:"대상 문서", placeholder:"첨부 파일을 지정하세요", required:true },
  ],
  rag_create: [
    { key:"source", label:"대상 자료", placeholder:"지식화할 자료/문서", required:true },
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
  web_search: [
    { key:"query", label:"검색어", placeholder:"예: 업체명 + 제재" , required:true },
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

function normalizeEmailIds(value){
  return [...new Set(String(value || "")
    .split(/[,\s;]+/)
    .map(item => item.trim())
    .filter(Boolean)
  )];
}

function isValidEmailId(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// 공유 이메일 패널/칩 갱신.
// - MyAI(홈): 이메일 폼·칩은 mail_share 카드 안에 인라인 렌더됨(#homeShareEmailChips 갱신).
// - intl 등 정적 패널 페이지: #homeMailSharePanel 표시/숨김 토글(존재할 때만).
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
  const parts = [
    ...sources.map(k => part(k, "source")),
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
function homeMountClarify(targetEl, svcLabel, def, onSubmit){
  if(!targetEl) return;
  targetEl.innerHTML = `
    <div class="home-clarify" data-home-clarify>
      <div class="home-clarify-q">
        <strong>추가 정보가 필요합니다</strong>
        <span>'${escapeHtml(svcLabel)}' 수행에 <b>${escapeHtml(def.label)}</b> 값이 필요합니다. 어떤 값으로 진행할까요?</span>
        <span class="home-clarify-hint">예: 기업명 또는 ID(C-1002) · "이전 단계 중 품목분류 오류율이 가장 높은 기업"</span>
      </div>
      <div class="home-clarify-row">
        <input type="text" class="home-clarify-input" placeholder="${escapeHtml(def.placeholder || def.label)}">
        <button type="button" class="btn home-clarify-submit">이 값으로 계속</button>
      </div>
    </div>`;
  const input = targetEl.querySelector(".home-clarify-input");
  const go = () => {
    const val = (input?.value || "").trim();
    if(!val){ input?.focus(); return; }
    onSubmit(val);
  };
  targetEl.querySelector(".home-clarify-submit")?.addEventListener("click", go);
  input?.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); go(); } });
  input?.focus();
}

// 프레임 textarea를 현재 동작 조합 템플릿으로 (편집 전이면) 프리필한다.
async function homeFillTemplatePrompt(key){
  const st = homePromptTemplateState[key];
  if(!st) return;
  const composed = await composePrompt(key, st.behaviors, "company");
  const current = homePromptTemplateState[key];
  if(current && !current.edited){
    current.text = composed || "";
    const ta = document.querySelector(`[data-home-tpl-text="${cssString(key)}"]`);
    if(ta) ta.value = current.text;
  }
}


// 카드 우측 '프롬프트 및 수행 결과' 패널 — 자동등록·수정 가능 프롬프트 + 결과 + 단일 수행.
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
    promptEl = `<textarea class="home-card-prompt" data-home-card-prompt="${escapeHtml(key)}" data-kind="source" rows="3"
        placeholder="자동 등록된 프롬프트입니다. 필요 시 수정하세요.">${escapeHtml(promptText)}</textarea>`;
  }
  return `
    <div class="home-card-work">
      <div class="home-card-work-head">
        <div class="home-card-work-tab">프롬프트 및 수행 결과</div>
        <div class="home-card-actions">
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

// 데이터소스 소개 카드 (자연어 조회 대상) — 좌: 안내+검색조건 / 우: 프롬프트+수행결과
function homeDataSourceCardHtml(key, order){
  const svc = AI_SERVICE_REGISTRY[key];
  const collapsed = !!homeCardCollapsed[key];
  return `
    <div class="home-svc-panel home-source-card home-card-row${collapsed ? " is-collapsed" : ""}" data-home-source-card="${escapeHtml(key)}">
      <div class="home-card-info">
        <div class="home-frame-head">
          <span class="home-frame-order src" title="실행 순서">${order}</span>
          <strong class="home-frame-title">${escapeHtml(svc?.label || key)}</strong>
          <span class="home-source-badge">업무지식베이스</span>
        </div>
        <p class="home-source-desc">${escapeHtml(homeDataSourceIntro(key))} 원하시는 정보의 조건을 오른쪽 프롬프트에 입력하세요.</p>
        <p class="home-source-example">검색 조건 예) 품목이 ~인 기업목록, 특정인이 작성한 보고서 중 최신 10건</p>
      </div>
      ${homeCardWorkPanel(key, "source")}
    </div>
  `;
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
  return `
    <div class="home-svc-panel home-pipeline-frame home-card-row${collapsed ? " is-collapsed" : ""}" data-home-pipeline-frame="${escapeHtml(key)}">
      <div class="home-card-info">
        ${head}
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
  // 선택 해제된 AI 서비스는 상태에서 제거
  Object.keys(homePromptTemplateState).forEach(key => { if(!aiOrder.includes(key)) delete homePromptTemplateState[key]; });
  Object.keys(homeCardCollapsed).forEach(key => { if(!sources.includes(key) && !aiOrder.includes(key)) delete homeCardCollapsed[key]; });
  Object.keys(homeCardResultState).forEach(key => { if(!sources.includes(key) && !aiOrder.includes(key)) delete homeCardResultState[key]; });
  // 신규 AI 서비스 동작칩 상태 초기화
  aiOrder.forEach(key => {
    if(homeServiceHasInlineTemplate(key) && !homePromptTemplateState[key]){
      homePromptTemplateState[key] = { behaviors: homeTemplateDefaultBehaviors(key), text: "", edited: false };
    }
  });

  if(!sources.length && !aiOrder.length){ container.innerHTML = ""; homeSyncCombinedPrompt(); return; }

  const runtimeSteps = [...sources, ...aiOrder];
  // 좌→우 가로 흐름: 업무지식베이스(검색) 카드 → AI 분석서비스 프레임, 사이에 화살표
  const cards = [
    ...sources.map((key, i) => homeDataSourceCardHtml(key, i + 1)),
    ...aiOrder.map((key, p) => homePipelineFrameHtml(key, p, aiOrder.length, sources.length, runtimeSteps)),
  ];
  const flow = cards.join("");

  const allCollapsed = runtimeSteps.length > 0 && runtimeSteps.every(key => homeCardCollapsed[key]);
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
        <span>각 AI 서비스는 독립적으로 동작하며, [입력값 이름] 자리에 값을 채워 호출합니다. ◀▶ 로 순서를 조정하고, 입력값은 직접 입력하거나 선행 서비스 결과를 선택해 연계하세요. 아래 통합 프롬프트는 자동 생성됩니다.</span>
      </div>
      <div class="home-pipeline-flow">${flow}</div>
    </div>
  `;
  // 보존된 수행 결과를 복원(서비스 추가 등 재렌더 시 결과 유지)
  homeRestoreCardResults();
  // 선택/입력에 맞춰 통합 프롬프트를 입력창에 자동 생성
  homeSyncCombinedPrompt();
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

function scenarioItemShareRecipients(item){
  if(!item || item.key !== "mail_share") return [];
  return normalizeEmailIds([...(item.shareRecipients || []), ...(item.share_recipients || [])].join(","));
}

function setScenarioItemShareRecipients(item, emails){
  if(!item) return;
  const recipients = item.key === "mail_share" ? normalizeEmailIds(emails.join(",")) : [];
  item.shareRecipients = recipients;
  item.share_recipients = recipients;
}

function scenarioShareEmailPanelHtml(item, scope){
  if(!item || item.key !== "mail_share") return "";
  const recipients = scenarioItemShareRecipients(item);
  const inputId = scope === "template" ? "templateShareEmailInput" : "scenarioShareEmailInput";
  const chips = recipients.length
    ? recipients.map(email => `
        <span class="scenario-share-email-chip">
          ${escapeHtml(email)}
          <button type="button" data-share-email-remove="${scope}" data-email="${escapeHtml(email)}" aria-label="${escapeHtml(email)} 삭제">×</button>
        </span>
      `).join("")
    : `<span class="scenario-share-email-empty">등록된 이메일 ID가 없습니다.</span>`;
  return `
    <div class="scenario-share-email-panel">
      <div class="scenario-share-email-head">
        <strong>이메일 공유</strong>
        <span>분석결과 보고서를 공유할 수신 이메일 ID를 1개 이상 등록하세요.</span>
      </div>
      <div class="scenario-share-email-form">
        <input id="${inputId}" type="email" placeholder="example@customs.go.kr" autocomplete="email">
        <button type="button" class="btn secondary" data-share-email-add="${scope}">등록</button>
      </div>
      <div class="scenario-share-email-chips">${chips}</div>
    </div>
  `;
}

function shareEmailScopeItem(scope){
  return scope === "template"
    ? templateEditorItems.find(i => i.id === templateEditorSelectedId)
    : selectedScenarioItem();
}

function saveScenarioShareEmailState(){
  if(currentPage === "generalinv"){
    const aCase = activeGenInvCase();
    if(aCase){ saveWorkbenchToCaseSteps(aCase); saveCanvasState(); }
    return;
  }
  if(isSpecialInvestigationPage(currentPage)){
    const aCase = activeDrugCase();
    if(aCase){ saveWorkbenchToCaseSteps(aCase); saveCanvasState(); }
    return;
  }
  saveCompanyScenario();
}

function renderShareEmailPanel(scope){
  const panelId = scope === "template" ? "templateShareEmailPanel" : "scenarioShareEmailPanel";
  const panel = document.getElementById(panelId);
  if(!panel) return;
  panel.innerHTML = scenarioShareEmailPanelHtml(shareEmailScopeItem(scope), scope);
}

function addShareEmailsToScope(scope, rawValue = null){
  const item = shareEmailScopeItem(scope);
  if(!item || item.key !== "mail_share") return false;
  const inputId = scope === "template" ? "templateShareEmailInput" : "scenarioShareEmailInput";
  const input = document.getElementById(inputId);
  const emails = normalizeEmailIds(rawValue ?? input?.value);
  if(!emails.length) return false;
  const invalid = emails.find(email => !isValidEmailId(email));
  if(invalid){
    alert(`올바른 이메일 ID를 입력하세요: ${invalid}`);
    input?.focus();
    return false;
  }
  setScenarioItemShareRecipients(item, [...scenarioItemShareRecipients(item), ...emails]);
  if(input) input.value = "";
  if(scope === "scenario"){
    saveScenarioShareEmailState();
  }
  renderShareEmailPanel(scope);
  return true;
}

function removeShareEmailFromScope(scope, email){
  const item = shareEmailScopeItem(scope);
  if(!item || item.key !== "mail_share") return;
  setScenarioItemShareRecipients(item, scenarioItemShareRecipients(item).filter(value => value !== email));
  if(scope === "scenario"){
    saveScenarioShareEmailState();
  }
  renderShareEmailPanel(scope);
}

function ensureMailShareRecipients(items, rerun){
  const missing = items.find(item => item.key === "mail_share" && !scenarioItemShareRecipients(item).length);
  if(!missing) return true;
  selectedScenarioId = missing.id;
  renderScenarioList();
  syncScenarioEditor();
  // alert 대신 실행 로그 영역에서 대화형으로 수신자를 되묻고, 등록 후 재실행한다.
  const slot = document.getElementById("scenarioClarify");
  if(slot){
    homeMountClarify(slot, "분석결과 공유 AI 서비스",
      { label: "수신 이메일 ID", placeholder: "예: officer@customs.go.kr" },
      (val) => {
        if(addShareEmailsToScope("scenario", val)){
          slot.innerHTML = "";
          if(rerun) rerun();
          else setScenarioStatus("수신자 등록됨 — 다시 실행하세요");
        }
      });
  } else {
    // clarify 컨테이너가 없는 화면: 전용 입력창 포커스 + 안내
    document.getElementById("scenarioShareEmailInput")?.focus();
    setScenarioStatus("수신 이메일 ID를 1개 이상 등록 후 다시 실행하세요");
  }
  return false;
}

function normalizeWebTargets(value){
  const rawItems = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];
  rawItems.forEach(item => {
    if(!item) return;
    const url = String(item.url || item.href || "").trim();
    const query = String(item.query || item.keyword || item.searchText || item.search_text || "").trim();
    if(!url) return;
    const key = `${url}\n${query}`;
    if(seen.has(key)) return;
    seen.add(key);
    normalized.push({ url, query });
  });
  return normalized;
}

function isValidHttpUrl(value){
  try{
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  }catch(_){
    return false;
  }
}

function scenarioItemWebTargets(item){
  if(!item || item.key !== "web_search") return [];
  return normalizeWebTargets([...(item.webTargets || []), ...(item.web_targets || [])]);
}

function setScenarioItemWebTargets(item, targets){
  if(!item) return;
  const nextTargets = item.key === "web_search" ? normalizeWebTargets(targets) : [];
  item.webTargets = nextTargets;
  item.web_targets = nextTargets;
}

function webTargetPanelHtml(item, scope){
  if(!item || item.key !== "web_search") return "";
  const targets = scenarioItemWebTargets(item);
  const urlId = scope === "template" ? "templateWebTargetUrl" : "scenarioWebTargetUrl";
  const queryId = scope === "template" ? "templateWebTargetQuery" : "scenarioWebTargetQuery";
  const cards = targets.length
    ? targets.map((target, index) => `
        <div class="scenario-web-target-chip">
          <span>
            <strong>${escapeHtml(target.url)}</strong>
            <small>${escapeHtml(target.query || "검색 내용 미지정")}</small>
          </span>
          <button type="button" data-web-target-remove="${scope}" data-index="${index}" aria-label="URL 삭제">×</button>
        </div>
      `).join("")
    : `<span class="scenario-web-target-empty">등록된 URL이 없습니다.</span>`;
  return `
    <div class="scenario-web-target-panel">
      <div class="scenario-web-target-head">
        <strong>URL 직접 등록</strong>
        <span>확인할 URL과 해당 페이지에서 찾을 주요 검색 내용을 등록하세요.</span>
      </div>
      <div class="scenario-web-target-form">
        <input id="${urlId}" class="scenario-web-target-url" type="url" placeholder="https://">
        <input id="${queryId}" class="scenario-web-target-query" type="text" placeholder="주요 검색내용">
        <button type="button" class="btn secondary" data-web-target-add="${scope}">등록</button>
      </div>
      <div class="scenario-web-target-list">${cards}</div>
    </div>
  `;
}

function renderWebTargetPanel(scope){
  const panelId = scope === "template" ? "templateWebTargetPanel" : "scenarioWebTargetPanel";
  const panel = document.getElementById(panelId);
  if(!panel) return;
  panel.innerHTML = webTargetPanelHtml(shareEmailScopeItem(scope), scope);
}

function addWebTargetToScope(scope){
  const item = shareEmailScopeItem(scope);
  if(!item || item.key !== "web_search") return false;
  const urlId = scope === "template" ? "templateWebTargetUrl" : "scenarioWebTargetUrl";
  const queryId = scope === "template" ? "templateWebTargetQuery" : "scenarioWebTargetQuery";
  const urlInput = document.getElementById(urlId);
  const queryInput = document.getElementById(queryId);
  const url = String(urlInput?.value || "").trim();
  const query = String(queryInput?.value || "").trim();
  if(!url) return false;
  if(!isValidHttpUrl(url)){
    alert("http 또는 https URL을 입력하세요.");
    urlInput?.focus();
    return false;
  }
  setScenarioItemWebTargets(item, [...scenarioItemWebTargets(item), { url, query }]);
  if(urlInput) urlInput.value = "";
  if(queryInput) queryInput.value = "";
  if(scope === "scenario") saveScenarioShareEmailState();
  renderWebTargetPanel(scope);
  return true;
}

function removeWebTargetFromScope(scope, index){
  const item = shareEmailScopeItem(scope);
  if(!item || item.key !== "web_search") return;
  setScenarioItemWebTargets(item, scenarioItemWebTargets(item).filter((_, i) => i !== index));
  if(scope === "scenario") saveScenarioShareEmailState();
  renderWebTargetPanel(scope);
}

function addPendingScenarioWebTarget(){
  const url = document.getElementById("scenarioWebTargetUrl")?.value || "";
  const query = document.getElementById("scenarioWebTargetQuery")?.value || "";
  if(!url.trim() && !query.trim()) return true;
  return addWebTargetToScope("scenario");
}

function ensureDirectUrlTargets(items, rerun){
  const missing = items.find(item =>
    item.key === "web_search"
    && Array.isArray(item.behaviors)
    && item.behaviors.includes("direct_url")
    && !scenarioItemWebTargets(item).length
  );
  if(!missing) return true;
  selectedScenarioId = missing.id;
  renderScenarioList();
  syncScenarioEditor();
  // alert 대신 대화형으로 확인할 URL을 되묻고, 등록 후 재실행한다.
  const slot = document.getElementById("scenarioClarify");
  if(slot){
    homeMountClarify(slot, "웹검색 AI 서비스(URL 직접 등록)",
      { label: "확인할 URL", placeholder: "예: https://example.com/notice" },
      (val) => {
        const urlInput = document.getElementById("scenarioWebTargetUrl");
        if(urlInput) urlInput.value = val;
        if(addWebTargetToScope("scenario")){
          slot.innerHTML = "";
          if(rerun) rerun();
          else setScenarioStatus("URL 등록됨 — 다시 실행하세요");
        }
      });
  } else {
    document.getElementById("scenarioWebTargetUrl")?.focus();
    setScenarioStatus("확인할 URL을 1개 이상 등록 후 다시 실행하세요");
  }
  return false;
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

function homePickerRegistryKeys(kind){
  const groups = HOME_PICKER_GROUPS[kind] || [];
  const targetGroups = new Set(groups.map(g => g.groupKey));
  return Object.entries(AI_SERVICE_REGISTRY)
    .filter(([, v]) => targetGroups.has(v.group) && v.selectable !== false && v.adminVisible !== false)
    .map(([k]) => k);
}

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

function openHomePicker(kind){
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

function homeRenderDetail(){
  const detailInResult = document.getElementById("homeResultDetail");
  if(detailInResult){
    detailInResult.outerHTML = homeDetailMarkup();
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
    myai_mode: true,   // MyAI 분석: CDW 조회를 자연어→SQL로 직접 수행(정형 위험요약 대체 안 함)
    user_prompt: prompt,
    upload_session_id: coachUploadSessionId || undefined,
    uploaded_files: coachAttachedFiles,
    file_links: coachFileLinkSummaries(),
    attached_files_summary: coachAttachedFileSummaries(),
    share_recipients: homeShareEmailIds,
    ...homeServiceInputPayload(),
  };

  const url = `/api/run?company_id=${encodeURIComponent(companyId)}&scenario=${encodeURIComponent(JSON.stringify(payload))}`;
  homeEventSource = new EventSource(url);
  let completed = 0;
  const total = effectiveAgents.length;

  console.info(`[MyAI분석] AI서비스 호출: ${effectiveAgents.map(a => a.label).join(", ")}`);

  homeEventSource.addEventListener("step", event => {
    const data = JSON.parse(event.data);
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
  });

  homeEventSource.addEventListener("workflow", event => {
    const data = JSON.parse(event.data);
    if(data.status === "completed"){
      homeRenderSummary(prompt, companyId, "agents", displayCompanyId);
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      if(homeEventSource){ homeEventSource.close(); homeEventSource = null; }
    } else if(data.status === "failed"){
      if(resultBox){
        resultBox.innerHTML = `<h3>AI 분석 결과</h3><p class="high">분석 중 오류가 발생했습니다.</p>`;
      }
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      if(homeEventSource){ homeEventSource.close(); homeEventSource = null; }
    }
  });

  homeEventSource.onerror = () => {
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
    if(homeEventSource){ homeEventSource.close(); homeEventSource = null; }
  };
}

// ── 홈 분석: LLM 직접 답변 표시 ───────────────────────────────────────────────
function homeShowLlmAnswer(prompt, answer, reasoning, btn){
  const resultBox = document.getElementById("homeResultBox");
  const detail = document.getElementById("homeAnalysisDetail");
  if(detail) detail.style.display = "none";
  if(resultBox){
    resultBox.innerHTML = `
      <h3>AI 분석 결과</h3>
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

// ── DB조회: NL→SQL 실행 후 결과 표시 ─────────────────────────────────────────
async function homeRunDbQuery(prompt, services, btn, resultBox, isOnly){
  const SERVICE_META = {
    db_cdw:          { label: "CDW 조회",        useNeo4j: false },
    company_profile: { label: "기업 프로파일 조회", useNeo4j: false },
  };

  for(const svc of services){
    const meta = SERVICE_META[svc] || { label: svc, useNeo4j: false };

    // 로딩 표시 업데이트
    if(resultBox){
      const existing = resultBox.querySelector(".home-db-results") || (() => {
        const el = document.createElement("div");
        el.className = "home-db-results";
        resultBox.appendChild(el);
        return el;
      })();
      existing.insertAdjacentHTML("beforeend", `
        <div class="home-db-section" id="dbSection_${svc}">
          <div class="home-db-section-hdr">
            <span class="home-db-icon">🗄</span>
            <strong>${escapeHtml(meta.label)}</strong>
            <span class="home-db-status running">조회 중…</span>
          </div>
          <div class="home-db-body" id="dbBody_${svc}">
            <span class="home-running-dot"></span> SQL 생성 후 실행 중...
          </div>
        </div>
      `);
    }

    try {
      const r = await fetch("/api/db_query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, service: svc, use_neo4j: meta.useNeo4j }),
      });
      const d = await r.json();
      const bodyEl = document.getElementById(`dbBody_${svc}`);
      const statusEl = document.querySelector(`#dbSection_${svc} .home-db-status`);

      if(d.error){
        if(bodyEl) bodyEl.innerHTML = `<p class="high">오류: ${escapeHtml(d.error)}</p>`;
        if(statusEl){ statusEl.textContent = "오류"; statusEl.className = "home-db-status error"; }
      } else {
        const queryInfo = d.query
          ? `<details class="home-db-query-detail">
               <summary>생성된 SQL 보기</summary>
               <pre><code>${escapeHtml(d.query)}</code></pre>
               ${d.explanation ? `<p class="muted">${escapeHtml(d.explanation)}</p>` : ""}
             </details>`
          : "";
        const summaryHtml = d.summary
          ? `<div class="home-db-summary markdown-output">${markdownToHtml(d.summary)}</div>`
          : "";
        const tableHtml = d.table_md
          ? `<div class="home-db-table markdown-output">${markdownToHtml(d.table_md)}</div>`
          : `<p class="muted">조회 결과가 없습니다.</p>`;

        if(bodyEl) bodyEl.innerHTML = summaryHtml + tableHtml + queryInfo;
        if(statusEl){
          const cnt = (d.rows || []).length;
          statusEl.textContent = `${cnt}건`;
          statusEl.className = "home-db-status done";
        }
      }
    } catch(e) {
      const bodyEl = document.getElementById(`dbBody_${svc}`);
      if(bodyEl) bodyEl.innerHTML = `<p class="high">서버 연결 실패</p>`;
    }
  }

  if(isOnly){
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
  }
}

/* resultBox.innerHTML 재작성 시 이미 렌더된 DB 조회 결과(.home-db-results)를 보존한다.
   CDW 조회 + 다른 AI서비스 동시 선택 시 agents 모드 렌더가 DB 결과를 지우는 문제 방지 */
function homePreserveDbResults(resultBox, render){
  const dbResults = resultBox?.querySelector(".home-db-results");
  render();
  if(dbResults && resultBox){
    const detailEl = resultBox.querySelector(".home-result-detail");
    if(detailEl) resultBox.insertBefore(dbResults, detailEl);
    else resultBox.appendChild(dbResults);
  }
}

// ── 홈 분석 진입점 — 프롬프트 의도 분석 후 분기 ──────────────────────────────
async function homeRunAnalysis(prompt, btn){
  if(homeEventSource){ try{ homeEventSource.close(); }catch(e){} homeEventSource = null; }
  homeRunResults = {};
  homeStepStatus = {};

  const resultBox = document.getElementById("homeResultBox");
  const detail = document.getElementById("homeAnalysisDetail");
  const selectedOptions = homeSelectedAnalysisOptions();
  const selectedRunAgents = homeRunAgentsFromSelection(selectedOptions);
  const hasSelectedInternalTool = selectedRunAgents.length > 0;
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
        <h3>AI 분석 결과</h3>
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
      <h3>AI 분석 결과</h3>
      <div class="home-running-line">
        <span class="home-running-dot"></span>
        <span>${hasSelectedInternalTool ? "선택된 데이터소스와 AI 서비스를 준비합니다." : "선택된 데이터소스/AI 서비스가 없어 LLM 자체 답변으로 처리합니다."}</span>
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

  if(!hasSelectedInternalTool){
    let answer = "";
    let reasoning = "선택된 데이터소스/AI 서비스 없음 · LLM 자체 답변";
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
      resultBox.innerHTML = `<h3>AI 분석 결과</h3><p class="high">서버 연결에 실패했습니다.</p>`;
    });
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    return;
  }

  // LLM 사용 불가 에러
  if(intent.mode === "error"){
    if(resultBox) homePreserveDbResults(resultBox, () => {
      resultBox.innerHTML = `<h3>AI 분석 결과</h3><p class="high">${escapeHtml(intent.error || "LLM을 사용할 수 없습니다.")}</p>`;
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

  // 2단계: 모드별 분기
  if(mode === "llm_direct" && !hasSelectedInternalTool){
    // LLM 직접 답변 — 이미 intent.llm_answer에 포함됐거나 별도 쿼리
    let answer = (intent.llm_answer || "").trim();
    if(!answer){
      // intent 분석에서 LLM이 답변을 주지 못한 경우 별도 호출
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
      } catch(e) {
        answer = "LLM 호출에 실패했습니다.";
      }
    }
    homeShowLlmAnswer(prompt, answer, reasoning, btn);
    return;
  }

  // agents 모드 — LLM이 선택한 에이전트만 실행 (DB 조회 포함, 워크벤치와 동일 파이프라인)
  const runAgents = selectedRunAgents.length ? selectedRunAgents : agentDefs;

  if(!runAgents.length){
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
        <h3>AI 분석 결과</h3>
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
      <h3>AI 분석 결과</h3>
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
      ${homeDetailMarkup()}
    `;
  });
}

/* 진행작업 상태 저장소: 서버 파일(data/workspace_state.json).
   - 로드: GET /api/workspace_state (없으면 기존 localStorage 상태를 1회 이행 후 제거)
   - 저장: 디바운스 POST, 페이지 종료 시 sendBeacon 플러시 (localStorage 미사용) */
async function fetchJsonStore(url){
  try{
    const res = await fetch(url);
    if(!res.ok) return null;
    const data = await res.json();
    return data && typeof data.state === "object" && data.state ? data.state : null;
  }catch(error){
    return null;
  }
}

async function loadCanvasState(){
  try{
    let saved = await fetchJsonStore("/api/workspace_state");
    if(!saved || !Object.keys(saved).length){
      // 서버 파일이 없으면 기존 localStorage 상태를 1회 이행
      saved = JSON.parse(localStorage.getItem(canvasStateKey) || "{}");
      if(Object.keys(saved).length){
        fetch("/api/workspace_state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saved),
        }).catch(() => {});
      }
    }
    // 서버 파일이 단일 저장소 — 과거 백업으로 남아 있던 localStorage 항목은 정리
    try{ localStorage.removeItem(canvasStateKey); }catch(e){ /* noop */ }
    const hasState = Object.keys(saved).length > 0;
    if(Array.isArray(saved.customCanvasJobs)) customCanvasJobs = saved.customCanvasJobs;
    if(Array.isArray(saved.customGenInvCases)) generalInvestigationState.customGenInvCases = normalizeCaseStepLabelsInPlace(saved.customGenInvCases);
    if(saved.activeCanvasCompanyId) activeCanvasCompanyId = saved.activeCanvasCompanyId;
    if(saved.activeScenarioTemplateId) activeScenarioTemplateId = saved.activeScenarioTemplateId;
    if(saved.latestReport) latestReport = saved.latestReport;
    if(saved.latestValidation) latestValidation = saved.latestValidation;
    if(saved.companyScenarios && typeof saved.companyScenarios === "object"){
      companyScenarios = saved.companyScenarios;
      Object.values(companyScenarios).forEach(normalizeScenarioLabelsInPlace);
    }
    if(saved.userPermissions && typeof saved.userPermissions === "object"){
      userPermissions = {...defaultUserPermissions, ...saved.userPermissions};
      // 그룹 정의가 부여한 권한은 과거 저장 스냅샷의 locked보다 우선 —
      // 코드에서 그룹 권한을 확대해도 저장 상태가 이를 되돌리지 않도록 한다.
      const savedUser = sampleUsers.find(user => user.id === (saved.currentUserId || currentUserId));
      const savedGroup = userGroups.find(group => group.id === savedUser?.groupId);
      if(savedGroup){
        const groupPerms = buildGroupPermissions(savedGroup);
        Object.keys(groupPerms).forEach(key => {
          if(groupPerms[key] === "granted") userPermissions[key] = "granted";
        });
      }
    }
    if(saved.canvasJobOverrides && typeof saved.canvasJobOverrides === "object") canvasJobOverrides = saved.canvasJobOverrides;
    if(saved.canvasRunArchives && typeof saved.canvasRunArchives === "object") canvasRunArchives = saved.canvasRunArchives;
    if(saved.hiddenCanvasJobsByUser && typeof saved.hiddenCanvasJobsByUser === "object") hiddenCanvasJobsByUser = saved.hiddenCanvasJobsByUser;
    if(saved.userWorkspaces && typeof saved.userWorkspaces === "object") userWorkspaces = saved.userWorkspaces;
    if(saved.agenticServicesByGroup && typeof saved.agenticServicesByGroup === "object") agenticServicesByGroup = saved.agenticServicesByGroup;
    // 분석 템플릿은 별도 파일(data/analysis_templates.json)에서 로드.
    // 없으면 기존 workspace 상태의 템플릿 키를 1회 이행.
    let templates = await fetchJsonStore("/api/analysis_templates");
    if(!templates || !Object.keys(templates).length){
      templates = {
        customTemplates: saved.customTemplates,
        hiddenBuiltinIds: saved.hiddenBuiltinIds,
        builtinOverrides: saved.builtinOverrides,
      };
      if(Array.isArray(saved.customTemplates) || Array.isArray(saved.hiddenBuiltinIds) || saved.builtinOverrides){
        fetch("/api/analysis_templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templates),
        }).catch(() => {});
      }
    }
    if(Array.isArray(templates.customTemplates)){
      customTemplates = templates.customTemplates;
      customTemplates.forEach(template => normalizeScenarioLabelsInPlace(template.items));
    }
    if(Array.isArray(templates.hiddenBuiltinIds)) hiddenBuiltinIds = new Set(templates.hiddenBuiltinIds);
    if(templates.builtinOverrides && typeof templates.builtinOverrides === "object") builtinOverrides = templates.builtinOverrides;
    if(saved.currentUserId) currentUserId = saved.currentUserId;
    normalizeCaseStepLabelsInPlace(defaultGenInvCases);
    migrateLegacyWorkspaceState(saved);
    restoreUserWorkspace(currentUserId);
    return hasState;
  }catch(error){
    console.warn("진행작업 상태를 불러오지 못했습니다.", error);
    return false;
  }
}

function buildWorkspaceStatePayload(){
  return {
    customCanvasJobs,
    customGenInvCases: generalInvestigationState.customGenInvCases,
    activeCanvasCompanyId,
    activeScenarioTemplateId,
    latestReport,
    latestValidation,
    companyScenarios,
    userPermissions,
    canvasJobOverrides,
    canvasRunArchives,
    hiddenCanvasJobsByUser,
    userWorkspaces,
    agenticServicesByGroup,
    currentUserId,
    generalInvTab: generalInvestigationState.generalInvTab,
    activeGenInvCaseId: generalInvestigationState.activeGenInvCaseId,
    drugInvTab: specialInvestigationState.drugInvTab,
    activeDrugCaseId: specialInvestigationState.activeDrugCaseId,
    drugDataSubTab: specialInvestigationState.drugDataSubTab,
    drugNetworkSubTab: specialInvestigationState.drugNetworkSubTab,
    drugForensicSubTab: specialInvestigationState.drugForensicSubTab,
    drugReportSubTab: specialInvestigationState.drugReportSubTab,
    investigationTab: customsState.investigationTab,
  };
}

/* 분석 템플릿(내 저장 템플릿 + 기본 템플릿 수정/숨김)은 별도 파일에 저장 —
   분석 템플릿 탭에서의 변경 저장이 진행작업 상태와 분리되어 관리된다. */
function buildTemplatesPayload(){
  return {
    customTemplates,
    hiddenBuiltinIds: [...hiddenBuiltinIds],
    builtinOverrides,
  };
}

let _templatesSaveTimer = null;
let _templatesPendingPayload = null;

function flushTemplatesState(){
  if(_templatesSaveTimer){ clearTimeout(_templatesSaveTimer); _templatesSaveTimer = null; }
  if(!_templatesPendingPayload) return;
  const body = JSON.stringify(_templatesPendingPayload);
  _templatesPendingPayload = null;
  fetch("/api/analysis_templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(error => console.warn("분석 템플릿을 서버에 저장하지 못했습니다.", error));
}

function saveTemplatesState(){
  _templatesPendingPayload = buildTemplatesPayload();
  if(_templatesSaveTimer) clearTimeout(_templatesSaveTimer);
  _templatesSaveTimer = setTimeout(flushTemplatesState, 400);
}

let _workspaceSaveTimer = null;
let _workspacePendingPayload = null;

function flushWorkspaceState(){
  if(_workspaceSaveTimer){ clearTimeout(_workspaceSaveTimer); _workspaceSaveTimer = null; }
  if(!_workspacePendingPayload) return;
  const body = JSON.stringify(_workspacePendingPayload);
  _workspacePendingPayload = null;
  fetch("/api/workspace_state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(error => console.warn("진행작업 상태를 서버에 저장하지 못했습니다.", error));
}

function saveCanvasState(){
  try{
    saveCurrentUserWorkspace();
    _workspacePendingPayload = buildWorkspaceStatePayload();
    if(_workspaceSaveTimer) clearTimeout(_workspaceSaveTimer);
    _workspaceSaveTimer = setTimeout(flushWorkspaceState, 400);
  }catch(error){
    console.warn("진행작업 상태를 저장하지 못했습니다.", error);
  }
}

window.addEventListener("beforeunload", () => {
  // 디바운스 대기 중인 저장분은 종료 직전 sendBeacon으로 플러시
  const beacons = [
    ["/api/workspace_state", _workspacePendingPayload],
    ["/api/analysis_templates", _templatesPendingPayload],
  ];
  if(_workspaceSaveTimer){ clearTimeout(_workspaceSaveTimer); _workspaceSaveTimer = null; }
  if(_templatesSaveTimer){ clearTimeout(_templatesSaveTimer); _templatesSaveTimer = null; }
  beacons.forEach(([url, payload]) => {
    if(!payload) return;
    try{
      navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: "application/json" }));
    }catch(e){ /* noop */ }
  });
  _workspacePendingPayload = null;
  _templatesPendingPayload = null;
});

function cloneSavedValue(value, fallback){
  if(value === undefined || value === null) return fallback;
  try{
    return JSON.parse(JSON.stringify(value));
  }catch(error){
    return fallback;
  }
}

function migrateLegacyWorkspaceState(saved){
  if(!currentUserId) return;
  const existing = userWorkspaces[currentUserId];
  const hasWorkspaceWork = existing && (
    Array.isArray(existing.customCanvasJobs) ||
    Array.isArray(existing.customGenInvCases) ||
    Array.isArray(existing.defaultGenInvCasesState) ||
    existing.companyScenarios ||
    existing.canvasRunArchives ||
    existing.canvasJobOverrides
  );
  const hasLegacyWork = (
    Array.isArray(saved.customCanvasJobs) ||
    Array.isArray(saved.customGenInvCases) ||
    saved.companyScenarios ||
    saved.canvasRunArchives ||
    saved.canvasJobOverrides
  );
  if(hasWorkspaceWork || !hasLegacyWork) return;
  userWorkspaces[currentUserId] = {
    ...(existing || {}),
    customCanvasJobs: cloneSavedValue(customCanvasJobs, []),
    customGenInvCases: cloneSavedValue(generalInvestigationState.customGenInvCases, []),
    defaultGenInvCasesState: cloneSavedValue(defaultGenInvCases, []),
    companyScenarios: cloneSavedValue(companyScenarios, {}),
    canvasJobOverrides: cloneSavedValue(canvasJobOverrides, {}),
    canvasRunArchives: cloneSavedValue(canvasRunArchives, {}),
    hiddenCanvasJobIds: cloneSavedValue(hiddenCanvasJobsByUser[currentUserId] || [], []),
  };
}

function saveCurrentUserWorkspace(){
  if(!currentUserId) return;
  userWorkspaces[currentUserId] = {
    ...(userWorkspaces[currentUserId] || {}),
    activeCanvasCompanyId,
    activeScenarioTemplateId,
    investigationTab: customsState.investigationTab,
    canvasTab,
    generalInvTab: generalInvestigationState.generalInvTab,
    activeGenInvCaseId: generalInvestigationState.activeGenInvCaseId,
    drugInvTab: specialInvestigationState.drugInvTab,
    activeDrugCaseId: specialInvestigationState.activeDrugCaseId,
    drugDataSubTab: specialInvestigationState.drugDataSubTab,
    drugNetworkSubTab: specialInvestigationState.drugNetworkSubTab,
    drugForensicSubTab: specialInvestigationState.drugForensicSubTab,
    drugReportSubTab: specialInvestigationState.drugReportSubTab,
    latestReport,
    latestValidation,
    customCanvasJobs: cloneSavedValue(customCanvasJobs, []),
    customGenInvCases: cloneSavedValue(generalInvestigationState.customGenInvCases, []),
    defaultGenInvCasesState: cloneSavedValue(defaultGenInvCases, []),
    companyScenarios: cloneSavedValue(companyScenarios, {}),
    canvasJobOverrides: cloneSavedValue(canvasJobOverrides, {}),
    canvasRunArchives: cloneSavedValue(canvasRunArchives, {}),
    hiddenCanvasJobIds: cloneSavedValue(hiddenCanvasJobsByUser[currentUserId] || [], []),
    updatedAt: new Date().toISOString(),
  };
}

function restoreWorkspaceWorkState(userId){
  const workspace = userWorkspaces[userId] || {};
  customCanvasJobs = Array.isArray(workspace.customCanvasJobs)
    ? cloneSavedValue(workspace.customCanvasJobs, [])
    : [];
  generalInvestigationState.customGenInvCases = Array.isArray(workspace.customGenInvCases)
    ? normalizeCaseStepLabelsInPlace(cloneSavedValue(workspace.customGenInvCases, []))
    : [];
  defaultGenInvCases.splice(
    0,
    defaultGenInvCases.length,
    ...cloneSavedValue(defaultGenInvCasesBaseline, [])
  );
  if(Array.isArray(workspace.defaultGenInvCasesState)){
    workspace.defaultGenInvCasesState.forEach(savedCase => {
      const idx = defaultGenInvCases.findIndex(item => item.caseId === savedCase.caseId);
      if(idx >= 0){
        Object.assign(defaultGenInvCases[idx], cloneSavedValue(savedCase, defaultGenInvCases[idx]));
        // 샘플 사건의 소유/담당(사용자별 표시 기준)은 코드 기준값을 권위로 유지한다.
        const baseline = defaultGenInvCasesBaseline.find(item => item.caseId === savedCase.caseId);
        if(baseline){
          defaultGenInvCases[idx].ownerUserId = baseline.ownerUserId;
          defaultGenInvCases[idx].assignees = cloneSavedValue(baseline.assignees, []);
        }
      }
    });
    normalizeCaseStepLabelsInPlace(defaultGenInvCases);
  }
  companyScenarios = workspace.companyScenarios && typeof workspace.companyScenarios === "object"
    ? cloneSavedValue(workspace.companyScenarios, {})
    : {};
  Object.values(companyScenarios).forEach(normalizeScenarioLabelsInPlace);
  canvasJobOverrides = workspace.canvasJobOverrides && typeof workspace.canvasJobOverrides === "object"
    ? cloneSavedValue(workspace.canvasJobOverrides, {})
    : {};
  canvasRunArchives = workspace.canvasRunArchives && typeof workspace.canvasRunArchives === "object"
    ? cloneSavedValue(workspace.canvasRunArchives, {})
    : {};
  hiddenCanvasJobsByUser[userId] = Array.isArray(workspace.hiddenCanvasJobIds)
    ? cloneSavedValue(workspace.hiddenCanvasJobIds, [])
    : (hiddenCanvasJobsByUser[userId] || []);
}

function restoreUserWorkspace(userId){
  restoreWorkspaceWorkState(userId);
  const firstVisibleJob = () => activeCanvasJobs()[0] || null;
  const workspace = userWorkspaces[userId] || {};
  const candidate = workspace.activeCanvasCompanyId;
  const visibleIds = new Set(activeCanvasJobs().map(job => job.companyId));
  const fallbackJob = firstVisibleJob();

  if(candidate && visibleIds.has(candidate)){
    activeCanvasCompanyId = candidate;
  }else if(fallbackJob){
    activeCanvasCompanyId = fallbackJob.companyId;
  }

  activeScenarioTemplateId = workspace.activeScenarioTemplateId || activeScenarioTemplateId || "customs-basic";
  customsState.investigationTab = workspace.investigationTab || "ongoing";
  canvasTab = workspace.canvasTab || "overview";
  generalInvestigationState.generalInvTab = workspace.generalInvTab || "cases";
  generalInvestigationState.activeGenInvCaseId = workspace.activeGenInvCaseId && allGenInvCases().some(item => item.caseId === workspace.activeGenInvCaseId)
    ? workspace.activeGenInvCaseId
    : null;
  specialInvestigationState.drugInvTab = workspace.drugInvTab || "ongoing";
  if(specialInvestigationState.drugInvTab === "company_profile" || specialInvestigationState.drugInvTab === "person_profile") specialInvestigationState.drugInvTab = "profile";
  specialInvestigationState.activeDrugCaseId = workspace.activeDrugCaseId && defaultDrugInvCases.some(c => c.caseId === workspace.activeDrugCaseId)
    ? workspace.activeDrugCaseId
    : null;
  specialInvestigationState.drugDataSubTab = workspace.drugDataSubTab || "profile";
  specialInvestigationState.drugNetworkSubTab = workspace.drugNetworkSubTab || "graph";
  specialInvestigationState.drugForensicSubTab = workspace.drugForensicSubTab || "dashboard";
  specialInvestigationState.drugReportSubTab = workspace.drugReportSubTab || "draft";
  if(specialInvestigationState.activeDrugCaseId && !specialInvestigationState.drugInvSelectedTarget) resetDrugCaseSubTabs(activeDrugCase(), false);
  scenarioLoadedForCompany = null;
  scenarioInitialized = false;
  loadCompanyRunArchive(activeCanvasCompanyId);
  scenarioItems = getCompanyScenario(activeCanvasCompanyId);
  selectedScenarioId = scenarioItems[0]?.id || null;
}

function getCompanyScenario(companyId){
  const saved = companyScenarios[companyId];
  if(saved && saved.length) return saved.map((item, index) => normalizeScenarioItem({...item}, index));
  return cloneTemplateItems("customs-basic");
}

function saveCompanyScenario(){
  if(!activeCanvasCompanyId) return;
  companyScenarios[activeCanvasCompanyId] = scenarioItems.map(item => ({...item}));
  const archive = canvasRunArchives[activeCanvasCompanyId];
  if(archive && archive.scenarioSignature && archive.scenarioSignature !== scenarioSignature()){
    patchCanvasJob(activeCanvasCompanyId, {
      scenarioChanged: true,
      status: { label:"재실행 필요", tone:"review" },
      archived: false,
    });
  }
  saveCanvasState();
}

function permissionStatus(key){
  return userPermissions[key] || "locked";
}

function hasPermission(key){
  return permissionStatus(key) === "granted";
}

function permissionLabel(status){
  if(status === "granted") return "사용 가능";
  if(status === "requested") return "요청중";
  return "권한 없음";
}

function uniqueByKey(items){
  const seen = new Set();
  return items.filter(item => {
    if(!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function requestPermissions(keys){
  keys.forEach(key => {
    if(permissionStatus(key) !== "granted") userPermissions[key] = "requested";
  });
  saveCanvasState();
  renderSidebarPermissions();
  const sourceSelect = document.getElementById("scenarioQuickSourceSelect");
  if(sourceSelect){
    const selected = sourceSelect.value;
    sourceSelect.innerHTML = scenarioSourceOptionsHtml();
    sourceSelect.value = selected;
  }
}


function currentUser(){ return sampleUsers.find(u => u.id === currentUserId) || sampleUsers[0]; }
function currentUserGroup(){ const u = currentUser(); return userGroups.find(g => g.id === u.groupId) || userGroups[0]; }
function isCurrentUserAdmin(){ return currentUserGroup().isAdmin === true; }
function isCurrentUserSuperAdmin(){ return isSuperAdminUser(currentUser()); }

/* 업무시나리오 구성 저장소: 서버 파일(data/scenario_builder_config.json).
   - localStorage는 빠른 초기 렌더용 캐시로 유지하되, 서버 파일이 단일 진실원.
   - 저장: 저장 버튼/동작 변경 시 즉시 POST (관리자 작업은 빈번하지 않음). */
const SCENARIO_BUILDER_CONFIG_URL = "/api/scenario_builder_config";

function persistScenarioBuilderConfigToServer(config){
  try{
    fetch(SCENARIO_BUILDER_CONFIG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).catch(error => console.warn("업무시나리오 구성을 서버에 저장하지 못했습니다.", error));
  }catch(error){
    console.warn("업무시나리오 구성을 서버에 저장하지 못했습니다.", error);
  }
}

async function loadScenarioBuilderConfigFromServer(){
  try{
    const saved = await fetchJsonStore(SCENARIO_BUILDER_CONFIG_URL);
    if(saved && Object.keys(saved).length){
      // 서버 파일이 단일 저장소 — 정규화 후 localStorage 캐시에도 반영
      scenarioBuilderConfig = saveScenarioBuilderConfig(saved);
    }else{
      // 서버 파일이 없으면 기존 localStorage 구성을 1회 이행
      persistScenarioBuilderConfigToServer(scenarioBuilderConfig);
    }
  }catch(error){
    console.warn("업무시나리오 구성을 서버에서 불러오지 못했습니다.", error);
  }
}

function saveScenarioBuilderState(config = scenarioBuilderConfig){
  scenarioBuilderConfig = saveScenarioBuilderConfig(config);
  persistScenarioBuilderConfigToServer(scenarioBuilderConfig);
  return scenarioBuilderConfig;
}

/* 수사유형별 빌트인 시나리오 템플릿 저장소: 서버 파일(data/scenario_templates.json).
   - 코드 정의(scenarioTemplates/giScenarioTemplates/drugScenarioTemplates)는 동기 시드로 유지.
   - 부팅 시 서버 파일이 있으면 in-place로 오버라이드(라벨/단계 갱신), 없으면 시드를 1회 저장.
   파생 맵(GI_SCENARIO_STEPS/DRUG_SCENARIO_STEPS)은 const라 키를 갱신(재바인딩 X). */
const SCENARIO_TEMPLATES_URL = "/api/scenario_templates";

function buildScenarioTemplatesSeed(){
  return cloneSavedValue({
    customs: scenarioTemplates,
    general: giScenarioTemplates,
    drug: drugScenarioTemplates,
    fx: fxScenarioTemplates,
  }, {});
}

function rebuildScenarioStepMaps(){
  Object.keys(GI_SCENARIO_STEPS).forEach(key => delete GI_SCENARIO_STEPS[key]);
  giScenarioTemplates.forEach(template => { GI_SCENARIO_STEPS[template.id] = template.items; });
  Object.keys(DRUG_SCENARIO_STEPS).forEach(key => delete DRUG_SCENARIO_STEPS[key]);
  drugScenarioTemplates.forEach(template => { DRUG_SCENARIO_STEPS[template.id] = template.items; });
  Object.keys(FX_SCENARIO_STEPS).forEach(key => delete FX_SCENARIO_STEPS[key]);
  fxScenarioTemplates.forEach(template => { FX_SCENARIO_STEPS[template.id] = template.items; });
}

function overrideTemplateArrayInPlace(targetArray, defs){
  if(!Array.isArray(defs)) return;
  defs.forEach(def => {
    if(!def || !def.id) return;
    const target = targetArray.find(t => t.id === def.id);
    if(!target) return; // 코드에 없는 id는 빌트인 범위 밖 — 무시
    if(def.name) target.name = def.name;
    if(def.description != null) target.description = def.description;
    if(Array.isArray(def.items)){
      target.items = def.items.map((item, index) => ({ ...item, order: item.order ?? index + 1 }));
    }
  });
}

function applyScenarioTemplatesOverride(data){
  if(!data || typeof data !== "object") return;
  overrideTemplateArrayInPlace(scenarioTemplates, data.customs);
  overrideTemplateArrayInPlace(giScenarioTemplates, data.general);
  overrideTemplateArrayInPlace(drugScenarioTemplates, data.drug);
  overrideTemplateArrayInPlace(fxScenarioTemplates, data.fx);
  giScenarioTemplates.forEach(template => normalizeScenarioLabelsInPlace(template.items));
  drugScenarioTemplates.forEach(template => normalizeScenarioLabelsInPlace(template.items));
  fxScenarioTemplates.forEach(template => normalizeScenarioLabelsInPlace(template.items));
  rebuildScenarioStepMaps();
}

function persistScenarioTemplatesToServer(){
  try{
    fetch(SCENARIO_TEMPLATES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildScenarioTemplatesSeed()),
    }).catch(error => console.warn("시나리오 템플릿을 서버에 저장하지 못했습니다.", error));
  }catch(error){
    console.warn("시나리오 템플릿을 서버에 저장하지 못했습니다.", error);
  }
}

async function loadScenarioTemplatesFromServer(){
  try{
    const saved = await fetchJsonStore(SCENARIO_TEMPLATES_URL);
    if(saved && Object.keys(saved).length){
      applyScenarioTemplatesOverride(saved);
    }else{
      // 서버 파일이 없으면 현재 코드 정의를 시드로 1회 저장
      persistScenarioTemplatesToServer();
    }
  }catch(error){
    console.warn("시나리오 템플릿을 서버에서 불러오지 못했습니다.", error);
  }
}

function scenarioBuilderDefaultTab(page, fallbackId){
  return scenarioDefaultTabForPage(scenarioBuilderConfig, page, fallbackId);
}

function analysisScenarioForPage(page){
  return scenarioConfigForPage(scenarioBuilderConfig, page);
}

function customAnalysisPage(page){
  const scenario = analysisScenarioForPage(page);
  if(!scenario || !isCustomAnalysisPage(scenarioBuilderConfig, page)) return "";
  if(scenario.template === "customs") return investigationPage(page);
  if(scenario.template === "general-investigation") return generalInvPage(page);
  if(scenario.template === "special-investigation") return drugInvestigationPage(page);
  return "";
}

function analysisTemplateForPage(page){
  return analysisScenarioForPage(page)?.template || "";
}

function currentAnalysisSubtabAgentDefaults(page = currentPage){
  const template = analysisTemplateForPage(page);
  if(page === "investigation" || template === "customs"){
    return customsInvestigation.currentTabAgentDefaultOptions(page);
  }
  if(page === "generalinv" || template === "general-investigation"){
    return generalInvestigation.currentTabAgentDefaultOptions(page);
  }
  if(isSpecialInvestigationPage(page)){
    return specialInvestigation.currentTabAgentDefaultOptions(page);
  }
  return [];
}

function scenarioBuilderDraftFromDom(){
  const next = {
    ...scenarioBuilderConfig,
    analysisScenarios: {...(scenarioBuilderConfig.analysisScenarios || {})},
    agentOptionDefaults: {...(scenarioBuilderConfig.agentOptionDefaults || {})},
  };

  document.querySelectorAll("[data-scenario-builder-analysis]").forEach(card => {
    const page = card.dataset.scenarioBuilderAnalysis;
    const current = next.analysisScenarios[page] || { page };
    const defaultTab = card.querySelector(`[data-scenario-default-tab="${cssString(page)}"]`)?.value || current.defaultTab;
    const enabledSubtabs = [...card.querySelectorAll("[data-scenario-subtab]")]
      .filter(input => input.checked)
      .map(input => input.dataset.scenarioSubtab.split(":")[1])
      .filter(Boolean);
    next.analysisScenarios[page] = {
      ...current,
      defaultTab,
      enabledSubtabs,
    };
  });

  next.customAnalysisScenarios = (next.customAnalysisScenarios || []).map(scenario => ({
    ...scenario,
    ...(next.analysisScenarios?.[scenario.page] || {}),
  }));

  document.querySelectorAll("[data-agent-default]").forEach(card => {
    const serviceId = card.dataset.agentDefault;
    const current = next.agentOptionDefaults[serviceId] || { serviceId };
    next.agentOptionDefaults[serviceId] = {
      ...current,
      enabled: card.querySelector(`[data-agent-enabled="${cssString(serviceId)}"]`)?.checked !== false,
      behavior: card.querySelector(`[data-agent-behavior="${cssString(serviceId)}"]`)?.value.trim() || "",
      instruction: card.querySelector(`[data-agent-instruction="${cssString(serviceId)}"]`)?.value.trim() || "",
    };
  });

  return next;
}

function customAnalysisScenarioDraftFromDom(){
  const page = document.querySelector("[data-custom-analysis-key]")?.value.trim();
  const title = document.querySelector("[data-custom-analysis-title]")?.value.trim();
  const description = document.querySelector("[data-custom-analysis-description]")?.value.trim() || "";
  const template = document.querySelector("[data-custom-analysis-template]")?.value || "special-investigation";
  if(!page || !/^[a-z][a-z0-9_-]*$/i.test(page)){
    alert("업무분석 key는 영문자로 시작하고 영문/숫자/_/-만 사용할 수 있습니다.");
    return null;
  }
  if(pageNames[page] || scenarioBuilderConfig.analysisScenarios?.[page]){
    alert("이미 사용 중인 업무분석 key입니다.");
    return null;
  }
  if(!title){
    alert("업무분석 제목을 입력하세요.");
    return null;
  }
  const enabledSubtabs = [...document.querySelectorAll(`[data-custom-analysis-subtab^="${cssString(template)}:"]`)]
    .filter(input => input.checked)
    .map(input => input.dataset.customAnalysisSubtab.split(":")[1])
    .filter(Boolean);
  if(!enabledSubtabs.length){
    alert("사용할 서브탭을 하나 이상 선택하세요.");
    return null;
  }
  const defaultTab = document.querySelector(`[data-custom-analysis-default-tab="${cssString(template)}"]`)?.value || enabledSubtabs[0];
  return {
    page,
    title,
    description,
    template,
    className: customAnalysisButtonClass(template),
    defaultTab: enabledSubtabs.includes(defaultTab) ? defaultTab : enabledSubtabs[0],
    enabledSubtabs,
  };
}

function customAnalysisButtonClass(template){
  if(template === "customs") return "sky";
  if(template === "general-investigation") return "rose";
  return "purple";
}

function cssString(value){
  if(window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function buildGroupPermissions(group){
  const perms = {};
  Object.keys(defaultUserPermissions).forEach(key => {
    perms[key] = (group.rag.includes(key) || group.agents.includes(key) || DEFAULT_GRANTED_AGENTS.includes(key)) ? "granted" : "locked";
  });
  return perms;
}

/* 사용자 전환 시: 진행 중이던 모든 SSE 분석 실행을 중단한다 */
function stopAllRunningWork(){
  [
    ["scenarioEventSource", () => scenarioEventSource, () => { scenarioEventSource = null; }],
    ["scenarioSingleEventSource", () => scenarioSingleEventSource, () => { scenarioSingleEventSource = null; }],
    ["giRunEventSource", () => giRunEventSource, () => { giRunEventSource = null; }],
    ["drugRunEventSource", () => drugRunEventSource, () => { drugRunEventSource = null; }],
    ["homeEventSource", () => homeEventSource, () => { homeEventSource = null; }],
  ].forEach(([, get, clear]) => {
    const source = get();
    if(source){ try { source.close(); } catch (e) { /* noop */ } clear(); }
  });
}

/* 사용자 전환 시: 열려 있는 업무분석 탭을 현재 상태 그대로 모두 닫는다 (My AI 분석·AI Agentic 탭은 유지) */
function closeAllWorkTabs(){
  document.querySelectorAll("#workTabs .work-tab").forEach(tab => {
    if(tab.dataset.page !== "home" && tab.dataset.page !== "agentic") tab.remove();
  });
}

function applyUserSwitch(userId){
  stopAllRunningWork();           // 이전 사용자의 실행 중 작업 STOP
  saveCurrentUserWorkspace();     // 탭 상태는 워크스페이스에 그대로 저장된 채 닫힌다
  closeAllWorkTabs();
  currentUserId = userId;
  const user  = sampleUsers.find(u => u.id === userId) || sampleUsers[0];
  const group = userGroups.find(g => g.id === user.groupId) || userGroups[0];
  userPermissions = buildGroupPermissions(group);
  restoreUserWorkspace(currentUserId);
  currentPage = "home";
  saveCanvasState();
  renderSidebarPermissions();
  updateProfileDisplay();
  updateAdminMenuVisibility();
}

function updateProfileDisplay(){
  const user  = currentUser();
  const group = currentUserGroup();
  const avatarEl = document.getElementById("profileAvatar");
  const nameEl   = document.getElementById("profileName");
  const teamEl   = document.getElementById("profileTeam");
  if(avatarEl) avatarEl.textContent = user.avatar;
  if(nameEl)   nameEl.textContent   = user.name;
  if(teamEl)   teamEl.textContent   = `${group.org} ${group.team}`;
}

function updateAdminMenuVisibility(){
  // AI Agentic 서비스 탭 — 부서 관리자에게만 노출
  const agenticTab = document.querySelector('#workTabs .work-tab[data-page="agentic"]');
  if(agenticTab) agenticTab.style.display = isCurrentUserAdmin() ? "" : "none";
  const permBtn = document.querySelector(".permission-approve-nav");
  if(!permBtn) return;
  permBtn.style.display = isCurrentUserAdmin() ? "" : "none";
}

function renderUserList(){
  const orgs = [...new Set(userGroups.map(g => g.org))];
  return orgs.map(org => {
    const groups = userGroups.filter(g => g.org === org);
    return `
      <div class="user-org-section">
        <h3 class="user-org-title">${escapeHtml(org)}</h3>
        <div class="user-grid">
          ${groups.map(group => {
            const user = sampleUsers.find(u => u.groupId === group.id);
            if(!user) return "";
            const isActive = user.id === currentUserId;
            return `
              <button class="user-card ${isActive ? "active" : ""} ${group.isAdmin ? "is-admin" : ""}" data-switch-user="${user.id}">
                <div class="user-card-avatar">${escapeHtml(user.avatar)}</div>
                <div class="user-card-info">
                  <strong>${escapeHtml(user.name)}</strong>
                  <span>${escapeHtml(group.team)}</span>
                  ${group.isAdmin ? `<em class="user-admin-badge">관리자</em>` : ""}
                </div>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function openUserSelectModal(){
  let overlay = document.getElementById("userSelectOverlay");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "userSelectOverlay";
    overlay.className = "user-select-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="user-select-modal">
      <div class="user-select-head">
        <div>
          <h2>사용자 선택</h2>
          <p class="muted">프로토타입 — 로그인 대체용 담당자 전환</p>
        </div>
        <button class="user-select-close" id="userSelectClose">✕</button>
      </div>
      <div class="user-select-body">${renderUserList()}</div>
    </div>
  `;
  overlay.style.display = "flex";
  document.getElementById("userSelectClose").addEventListener("click", () => overlay.style.display = "none");
  overlay.addEventListener("click", e => { if(e.target === overlay) overlay.style.display = "none"; });
  overlay.querySelectorAll("[data-switch-user]").forEach(btn => {
    btn.addEventListener("click", () => {
      applyUserSwitch(btn.dataset.switchUser);
      overlay.style.display = "none";
      render("home");
    });
  });
}

function updatePermissionBadge(){
  const btn = document.querySelector(".permission-approve-nav");
  if(!btn) return;
  const pendingCount = Object.values(userPermissions).filter(s => s === "requested").length;
  btn.dataset.pending = pendingCount > 0 ? "true" : "false";
  btn.title = pendingCount > 0 ? `승인 대기 ${pendingCount}건` : "권한 승인";
}

function renderSidebarPermissions(){
  Object.entries(sidebarPermissionGroups).forEach(([panelId, keys]) => {
    const rows = document.querySelectorAll(`#${panelId} .toggle-row`);
    rows.forEach((row, index) => {
      const key = keys[index];
      const input = row.querySelector("input");
      if(!key || !input) return;
      const status = permissionStatus(key);
      row.dataset.permissionKey = key;
      row.classList.toggle("granted", status === "granted");
      row.classList.toggle("requested", status === "requested");
      row.classList.toggle("locked", status === "locked");
      input.checked = status === "granted";
      input.disabled = true;
      row.querySelector(".permission-meta")?.remove();
      if(status === "requested"){
        row.insertAdjacentHTML("beforeend", `
          <span class="permission-meta">
            <b>요청중</b>
          </span>
        `);
      }
    });
  });
  updatePermissionBadge();
}

function syncSidebarCollapseIcons(){
  document.querySelectorAll(".collapsible-label").forEach(button => {
    const target = document.getElementById(button.dataset.collapseTarget);
    const icon = button.querySelector("span");
    if(target && icon) icon.textContent = target.classList.contains("collapsed") ? "▶" : "▼";
  });
}

/* ═══════════════════════════════════════════════════════════════
   일반수사 분석 페이지
═══════════════════════════════════════════════════════════════ */

function generalInvPage(pageKey = "generalinv"){
  return generalInvestigation.generalInvPage(pageKey);
}

function generalInvTabContent(context = {}, pageKey = "generalinv"){
  return generalInvestigation.generalInvTabContent(context, pageKey);
}

/* ── [진행중인 수사] 패널 ──────────────────────────────────── */






/* ── 서브탭 스텁 패널들 ────────────────────────────────────── */


function generalInvCompanyId(aCase){
  if(!aCase || aCase.targetType !== "company") return "";
  if(aCase.companyId) return aCase.companyId;
  const normalizedTarget = normalizeCompanyName(aCase.targetName);
  const matched = scenarioCompanies.find(company =>
    normalizeCompanyName(company.company_name || company.company_id) === normalizedTarget ||
    normalizedTarget.includes(normalizeCompanyName(company.company_name || "")) ||
    normalizeCompanyName(company.company_name || "").includes(normalizedTarget)
  );
  return matched?.company_id || "";
}

function normalizeCompanyName(name){
  return String(name || "")
    .replace(/\(주\)|주식회사|\s|\(|\)|㈜/g, "")
    .toLowerCase();
}



function reportRequiredSections(kind, context = {}){
  const targetName = context.targetName || context.companyName || "수사 대상";
  const commonAction = [
    `- 즉시 조치: ${targetName} 관련 위험 신고·화물·거래 내역을 우선 보전하고 담당 조사관에게 배정합니다.`,
    "- 단기 조치: 관련 신고번호, 계좌, 운송장, 통화·디지털 단서를 교차 확인합니다.",
    "- 중기 조치: 유사 패턴 사건과 관계망을 확장 분석하고 추가 조사 여부를 결정합니다.",
  ].join("\n");
  const map = {
    customs: [
      {
        title: "조치계획",
        body: [
          `- 즉시 조치: ${targetName} 관련 수입신고와 과세가격·품목분류·원산지 증빙을 보전합니다.`,
          "- 단기 조치: 계약서, 송품장, 원산지증명서, 대금지급 자료 제출을 요구합니다.",
          "- 중기 조치: 동종 업종 비교, 과거 신고 정정 이력, 특수관계 거래 여부를 추가 검토합니다.",
        ].join("\n"),
      },
      {
        title: "조사 착안사항",
        body: [
          "- 과세가격 적정성: 신고가격과 동종·동질 물품 거래가격 차이를 확인합니다.",
          "- 품목분류 적정성: HS 코드와 실제 물품 특성, 세율 차이에 따른 탈루 가능성을 검토합니다.",
          "- 원산지 검증: 원산지증명서 발급기관, 원재료 구성, 직접운송 요건 충족 여부를 확인합니다.",
        ].join("\n"),
      },
    ],
    general: [
      { title: "조치계획", body: commonAction },
      {
        title: "증거관련 항목",
        body: [
          "- 문서 증거: 신고서, 계약서, 송품장, 계좌거래 내역, 내부 결재자료를 확보합니다.",
          "- 진술 증거: 수입자, 운송 관계자, 자금 관련자 진술의 일관성을 확인합니다.",
          "- 디지털 증거: 메신저, 이메일, 파일 메타데이터와 로그의 원본성을 검증합니다.",
          "- 증거 보전: 원본 제출, 해시값 산출, 압수·임의제출 절차 적정성을 기록합니다.",
        ].join("\n"),
      },
    ],
    drug: [
      { title: "조치계획", body: commonAction },
      {
        title: "증거관련 항목",
        body: [
          "- 물리 증거: 압수물, 성분 감정서, 중량·순도, 봉인 상태와 인수인계 기록을 확인합니다.",
          "- 디지털 증거: 은어, 메신저 주문, SNS·다크웹 계정, 위치정보와 삭제 파일 복원 결과를 정리합니다.",
          "- 자금 증거: 분산송금, 현금화, 해외송금, 암호화폐 주소 등 대금 흐름을 연결합니다.",
          "- 관계망 증거: 운반책, 수취인, 연락책, 공급자 간 연결성과 역할을 명시합니다.",
        ].join("\n"),
      },
      {
        title: "국제공조 항목",
        body: [
          "- 공조 대상국: 출발·경유·공급 국가와 관련 기관을 특정합니다.",
          "- 요청 범위: 출입국, 배송, 통신, 계좌, 해외 공급자 정보를 구분해 요청합니다.",
          "- 국제기구 공유: WCO CEN, INCB 등 통보·정보공유 필요 여부를 검토합니다.",
          "- 회신 관리: 공조 요청일, 회신 기한, 후속 조치 담당자를 보고서에 기록합니다.",
        ].join("\n"),
      },
    ],
  };
  return map[kind] || [];
}

function ensureReportRequiredSections(raw, kind, context = {}){
  const base = String(raw || "").trim() || "보고서가 아직 생성되지 않았습니다.";
  const sections = reportRequiredSections(kind, context);
  const missing = sections.filter(section => !base.includes(section.title));
  if(!missing.length) return base;
  return `${base}\n\n## 필수 포함 항목\n\n${missing.map(section => `### ${section.title}\n${section.body}`).join("\n\n")}`;
}

function commonAnalysisReportPanel({
  selectedLabel = "수사 대상",
  targetText = "",
  badgeHtml = "",
  statusHtml = "",
  reportTitle = "분석 보고서",
  validationTitle = "보고서 검증",
  reportHtml = "",
  validationHtml = "",
  reportActions = "",
  validationActions = "",
  reportId = "",
  validationId = "",
} = {}){
  const reportAttr = reportId ? ` id="${escapeHtml(reportId)}"` : "";
  const validationAttr = validationId ? ` id="${escapeHtml(validationId)}"` : "";
  return `
    <div class="canvas-report-wrap">
      <div class="canvas-selected-company">
        ${badgeHtml}
        <span>${escapeHtml(selectedLabel)}</span>
        <strong>${targetText}</strong>
        ${statusHtml}
      </div>
      <div class="scenario-results canvas-report-results">
        <section class="scenario-result-panel">
          <div class="scenario-result-panel-head">
            <h3>${escapeHtml(reportTitle)}</h3>
            ${reportActions}
          </div>
          <div${reportAttr} class="markdown-output">${reportHtml}</div>
        </section>
        <section class="scenario-result-panel">
          <div class="scenario-result-panel-head">
            <h3>${escapeHtml(validationTitle)}</h3>
            ${validationActions}
          </div>
          <div${validationAttr} class="markdown-output">${validationHtml}</div>
        </section>
      </div>
    </div>
  `;
}



/* ── [AI서비스 분석 작업] 패널 ────────────────────── */

function investigationPage(pageKey = "investigation"){
  return customsInvestigation.investigationPage(pageKey);
}

function investigationTabContent(pageKey = "investigation"){
  return customsInvestigation.investigationTabContent(pageKey);
}









function ciRunDwQuery(){
  const input = document.getElementById("ciDwQuery");
  const result = document.getElementById("ciDwResult");
  if(!input || !result) return;
  const q = input.value.trim();
  if(!q){ alert("DW 조회 조건을 입력하세요."); return; }
  result.style.display = "block";
  result.innerHTML = `<div class="profile-loading">DW 조회 중...</div>`;
  setTimeout(() => {
    result.innerHTML = `
      <div class="ci-dw-result-content">
        <div class="ci-dw-result-head">
          <strong>DW 조회 결과</strong>
          <span class="muted">"${escapeHtml(q)}" 조건 기준 · ${scenarioCompanies.length}개사 중 ${Math.ceil(scenarioCompanies.length*0.3)}개사 해당</span>
        </div>
        ${dataTable(
          ["업체명","사업자번호","업종","수입금액","위험점수","주요위험요인"],
          scenarioCompanies.slice(0,5).map(c => [
            escapeHtml(c.company_name||c.company_id),
            escapeHtml(c.business_registration_no||"-"),
            escapeHtml(industryLabel(c.industry_code)),
            fmtAmount(c.annual_import_amount),
            `<strong class="${(c.risk_score||0)>=70?"high":(c.risk_score||0)>=40?"mid-risk":""}">${(c.risk_score||0).toFixed(1)}</strong>`,
            companyRiskTags(c).slice(0,2).join(", ")||"-"
          ])
        )}
      </div>
    `;
  }, 800);
}

window.ciRunDwQuery = ciRunDwQuery;

/* ═══════════════════════════════════════════════════════════════ */

function canvasPage(){
  return `
    <section class="card canvas-hub">
      <div class="canvas-main-head">
        <div>
          <h2>AI 작업 캔버스</h2>
          <p class="muted">내가 분석한 작업만 표시됩니다 — 진행 중인 분석 작업을 카드 형태로 확인하고, 작업별 진행 상태와 다음 단계를 한눈에 봅니다.</p>
        </div>
      </div>
      <div class="canvas-tab-body canvas-overview-only">
        ${canvasOverviewPanel()}
      </div>
    </section>
  `;
}

function activeDrugCase(){
  const aCase = defaultDrugInvCases.find(c => c.caseId === specialInvestigationState.activeDrugCaseId) || null;
  if(!aCase) return null;
  // 마약(lawsearch)·외환(fxsearch)은 사건 풀을 공유하므로 현재 페이지 도메인과 일치할 때만 활성 사건으로 본다.
  const page = activeSpecialInvestigationPage();
  if((aCase.domain || "lawsearch") !== page) return null;
  return aCase;
}

function drugCaseTargetType(aCase = activeDrugCase()){
  return aCase?.targetType === "company" ? "company" : "person";
}

function drugCaseContext(aCase = activeDrugCase()){
  if(!aCase) return null;
  const targetType = drugCaseTargetType(aCase);
  const person = targetType === "person" ? (riskPersonById(aCase.personId) || null) : null;
  const company = targetType === "company"
    ? (findCompanyById(aCase.companyId) || scenarioCompanies.find(c => c.company_id === aCase.companyId) || null)
    : null;
  const targetName = aCase.targetName || (targetType === "company" ? company?.company_name : person?.name) || "";
  const targetId = targetType === "company"
    ? (aCase.companyId || aCase.drugOrgId || "")
    : (aCase.personId || "");
  return {
    case: aCase,
    type: drugInvTypeById(aCase.invTypeId),
    targetType,
    targetName,
    targetId,
    person,
    company,
    label: targetType === "company" ? "기업" : "우범자",
    profileTab: "profile",
  };
}





function resetDrugCaseSubTabs(aCase = activeDrugCase(), resetTabs = true){
  const targetType = drugCaseTargetType(aCase);
  if(resetTabs){
    specialInvestigationState.drugDataSubTab = "profile";
    specialInvestigationState.drugNetworkSubTab = "graph";
    specialInvestigationState.drugForensicSubTab = "dashboard";
    specialInvestigationState.drugReportSubTab = "draft";
  }
  specialInvestigationState.drugInvSelectedTarget = aCase ? {
    name: aCase.targetName,
    id: targetType === "person" ? (aCase.personId || aCase.caseId) : (aCase.companyId || aCase.drugOrgId || aCase.caseId),
    type: targetType,
  } : null;
}

function drugInvestigationPage(pageKey = activeSpecialInvestigationPage()){
  return specialInvestigation.drugInvestigationPage(pageKey);
}

























/* ═══════════════════════════════════════════════════════════════
   위험선별 분석 페이지
   ═══════════════════════════════════════════════════════════════ */
function riskScreeningPage(){
  const tab = riskScreeningTab;
  const today = new Date().toISOString().slice(0,10);
  const highRiskItems = [
    { declNo:"202605300001", hsCd:"2933.39", goods:"N-페닐피페라진 유도체", importer:"(주)케미칼인터", origin:"CN", weight:"500kg", riskScore:95, reason:"마약 전구물질", status:"검사지시" },
    { declNo:"202605300002", hsCd:"8471.30", goods:"노트북 (저가신고의심)", importer:"개인통관 박XX", origin:"HK", weight:"1.2kg", riskScore:88, reason:"저가신고 의심", status:"검사지시" },
    { declNo:"202605300003", hsCd:"6109.10", goods:"면 티셔츠 (원산지위반)", importer:"패션유통(주)", origin:"VN", weight:"2,400kg", riskScore:82, reason:"원산지 위반 의심", status:"심사중" },
    { declNo:"202605300004", hsCd:"2208.40", goods:"럼주 (브랜드 위조)", importer:"주류무역(주)", origin:"DO", weight:"480L", riskScore:79, reason:"브랜드 위조 의심", status:"심사중" },
    { declNo:"202605300005", hsCd:"9013.80", goods:"레이저 장비", importer:"(주)광학기술", origin:"IL", weight:"18kg", riskScore:76, reason:"이중용도 품목", status:"대기" },
    { declNo:"202605300006", hsCd:"7108.12", goods:"금 정제품", importer:"귀금속(주)", origin:"AE", weight:"8.5kg", riskScore:74, reason:"고가 귀금속 신고가 불일치", status:"대기" },
  ];
  const trackingItems = [
    { declNo:"202605280012", goods:"화학원료 혼합물", importer:"(주)켐트레이딩", riskScore:91, trackStatus:"세관 검사 중", updated:"오늘 09:12" },
    { declNo:"202605270008", goods:"의류 (원산지 불명)", importer:"패스트패션(주)", riskScore:83, trackStatus:"샘플 분석 중", updated:"어제 16:30" },
    { declNo:"202605250003", goods:"전자부품 세트", importer:"전자부품(주)", riskScore:78, trackStatus:"서류 보완 요청", updated:"2026-05-25" },
  ];
  return `
    <section class="card gi-hub">
      <div class="gi-page-head">
        <div>
          <h2>위험선별 분석</h2>
          <p class="muted">수입신고 건 중 위험도가 높은 적하목록을 선별하고 추적관리합니다.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="muted" style="font-size:12px">기준일: ${today}</span>
          <span style="background:#fee2e2;color:#dc2626;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:700">고위험 ${highRiskItems.length}건</span>
        </div>
      </div>
      <div class="gi-tab-nav">
        <button class="gi-tab${tab==="today"?" active":""}" data-rs-tab="today">당일 고위험 적하목록</button>
        <button class="gi-tab${tab==="tracking"?" active":""}" data-rs-tab="tracking">추적관리</button>
      </div>
      <div class="gi-tab-body">
        ${tab === "tracking" ? `
          <h4 style="margin-bottom:12px;color:#41506a;font-size:14px">추적관리 대상 (${trackingItems.length}건)</h4>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>신고번호</th><th>품명</th><th>수입자</th><th>위험점수</th><th>추적상태</th><th>갱신시각</th></tr></thead>
              <tbody>
                ${trackingItems.map(t=>`
                  <tr>
                    <td style="font-family:monospace;font-size:12px">${escapeHtml(t.declNo)}</td>
                    <td>${escapeHtml(t.goods)}</td>
                    <td>${escapeHtml(t.importer)}</td>
                    <td><strong style="color:${t.riskScore>=90?"#dc2626":t.riskScore>=80?"#d97706":"#16a34a"}">${t.riskScore}</strong></td>
                    <td><span style="background:#eef4ff;color:#1e40af;border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(t.trackStatus)}</span></td>
                    <td class="muted">${escapeHtml(t.updated)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : `
          <h4 style="margin-bottom:12px;color:#41506a;font-size:14px">당일(${today}) 고위험 수입신고 (${highRiskItems.length}건)</h4>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>신고번호</th><th>HS Code</th><th>품명</th><th>수입자</th><th>원산지</th><th>중량</th><th>위험점수</th><th>위험사유</th><th>상태</th><th>추적등록</th></tr></thead>
              <tbody>
                ${highRiskItems.map(item=>`
                  <tr>
                    <td style="font-family:monospace;font-size:12px">${escapeHtml(item.declNo)}</td>
                    <td style="font-family:monospace">${escapeHtml(item.hsCd)}</td>
                    <td>${escapeHtml(item.goods)}</td>
                    <td>${escapeHtml(item.importer)}</td>
                    <td><span style="background:#f0fdf4;color:#166534;border-radius:4px;padding:1px 6px;font-size:11px">${escapeHtml(item.origin)}</span></td>
                    <td style="font-size:12px">${escapeHtml(item.weight)}</td>
                    <td><strong style="color:${item.riskScore>=90?"#dc2626":item.riskScore>=80?"#d97706":"#16a34a"}">${item.riskScore}</strong></td>
                    <td style="font-size:12px;color:#7c3aed">${escapeHtml(item.reason)}</td>
                    <td><span style="background:${item.status==="검사지시"?"#fee2e2":item.status==="심사중"?"#fef3c7":"#f1f5f9"};color:${item.status==="검사지시"?"#dc2626":item.status==="심사중"?"#d97706":"#64748b"};border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(item.status)}</span></td>
                    <td><button class="btn small" data-rs-tab="tracking" style="font-size:11px">추적등록</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   통관정보 분석 페이지
   ═══════════════════════════════════════════════════════════════ */
function customsInfoPage(){
  const tab = customsInfoTab;
  const today = new Date().toISOString().slice(0,10);
  const declarations = [
    { declNo:"IMP-20260530-0001", type:"수입", goods:"반도체 장비", hs:"8486.20", importer:"삼성전자(주)", origin:"US", value:"USD 2,400,000", riskScore:12, status:"수리완료" },
    { declNo:"IMP-20260530-0002", type:"수입", goods:"유기화합물", hs:"2901.10", importer:"(주)석유화학", origin:"SA", value:"USD 890,000", riskScore:45, status:"심사중" },
    { declNo:"EXP-20260530-0001", type:"수출", goods:"자동차 부품", hs:"8708.29", importer:"현대모비스(주)", origin:"KR", value:"USD 1,200,000", riskScore:8, status:"수리완료" },
    { declNo:"IMP-20260530-0003", type:"수입", goods:"의류 완제품", hs:"6203.42", importer:"(주)패션코리아", origin:"BD", value:"USD 320,000", riskScore:78, status:"검사지시" },
    { declNo:"EXP-20260530-0002", type:"수출", goods:"화장품", hs:"3304.99", importer:"(주)뷰티코리아", origin:"KR", value:"USD 560,000", riskScore:15, status:"수리완료" },
  ];
  const countryStats = [
    {country:"미국(US)",import:142,export:89,risk:18},
    {country:"중국(CN)",import:328,export:215,risk:35},
    {country:"일본(JP)",import:98,export:134,risk:12},
    {country:"베트남(VN)",import:187,export:67,risk:28},
    {country:"독일(DE)",import:76,export:45,risk:9},
  ];
  const hsStats = [
    {group:"84 기계·기기",count:412,risk:22},
    {group:"85 전기기기",count:389,risk:19},
    {group:"61-62 의류",count:287,risk:65},
    {group:"29 유기화합물",count:156,risk:48},
    {group:"87 자동차",count:234,risk:11},
  ];
  return `
    <section class="card gi-hub">
      <div class="gi-page-head">
        <div>
          <h2>통관정보 분석</h2>
          <p class="muted">전체 통관 내역 기준의 분석 정보를 제공합니다. 국가별·HS그룹별·위험도 통계를 확인합니다.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="date" class="form-input" style="height:32px;font-size:12px" value="${today}" id="ciDateFrom">
          <span class="muted">~</span>
          <input type="date" class="form-input" style="height:32px;font-size:12px" value="${today}" id="ciDateTo">
          <button class="btn" style="height:32px;padding:0 12px;font-size:12px" data-ci-tab="${tab}">조회</button>
        </div>
      </div>
      <div class="gi-tab-nav">
        <button class="gi-tab${tab==="today"?" active":""}" data-ci-tab="today">당일 수출입 신고내역</button>
        <button class="gi-tab${tab==="stats"?" active":""}" data-ci-tab="stats">통계 분석</button>
      </div>
      <div class="gi-tab-body">
        ${tab === "stats" ? `
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:260px">
              <h4 style="margin-bottom:10px;font-size:14px;color:#41506a">국가별 신고 현황</h4>
              <table class="data-table">
                <thead><tr><th>국가</th><th>수입</th><th>수출</th><th>평균위험도</th></tr></thead>
                <tbody>
                  ${countryStats.map(c=>`
                    <tr>
                      <td>${escapeHtml(c.country)}</td>
                      <td>${c.import}</td>
                      <td>${c.export}</td>
                      <td><span style="color:${c.risk>=50?"#dc2626":c.risk>=30?"#d97706":"#16a34a"};font-weight:700">${c.risk}</span></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
            <div style="flex:1;min-width:260px">
              <h4 style="margin-bottom:10px;font-size:14px;color:#41506a">HS 그룹별 위험도</h4>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${hsStats.map(h=>`
                  <div style="background:#f8fbff;border:1px solid #dde8ff;border-radius:8px;padding:10px 12px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                      <span style="font-size:13px;color:#123c85;font-weight:600">${escapeHtml(h.group)}</span>
                      <span class="risk-chip ${h.risk>=50?"high":h.risk>=30?"mid":"low"}" style="margin-left:auto">${h.risk}점</span>
                    </div>
                    <div style="background:#e5edff;border-radius:4px;height:8px;overflow:hidden">
                      <div style="width:${h.risk}%;background:${h.risk>=50?"#dc2626":h.risk>=30?"#d97706":"#22c55e"};height:100%;border-radius:4px"></div>
                    </div>
                    <div style="font-size:11px;color:#6b7f9e;margin-top:4px">신고건수: ${h.count}건</div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        ` : `
          <h4 style="margin-bottom:12px;color:#41506a;font-size:14px">당일(${today}) 수출입 신고내역 (${declarations.length}건)</h4>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>신고번호</th><th>구분</th><th>품명</th><th>HS Code</th><th>신고인</th><th>원산지</th><th>신고가액</th><th>위험도</th><th>처리상태</th></tr></thead>
              <tbody>
                ${declarations.map(d=>`
                  <tr>
                    <td style="font-family:monospace;font-size:12px">${escapeHtml(d.declNo)}</td>
                    <td><span style="background:${d.type==="수입"?"#eff6ff":"#f0fdf4"};color:${d.type==="수입"?"#1d4ed8":"#166534"};border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(d.type)}</span></td>
                    <td>${escapeHtml(d.goods)}</td>
                    <td style="font-family:monospace">${escapeHtml(d.hs)}</td>
                    <td>${escapeHtml(d.importer)}</td>
                    <td><span style="background:#f0fdf4;color:#166534;border-radius:4px;padding:1px 6px;font-size:11px">${escapeHtml(d.origin)}</span></td>
                    <td style="font-size:12px">${escapeHtml(d.value)}</td>
                    <td><strong style="color:${d.riskScore>=70?"#dc2626":d.riskScore>=40?"#d97706":"#16a34a"}">${d.riskScore}</strong></td>
                    <td><span style="background:${d.status==="검사지시"?"#fee2e2":d.status==="심사중"?"#fef3c7":"#f0fdf4"};color:${d.status==="검사지시"?"#dc2626":d.status==="심사중"?"#d97706":"#166534"};border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(d.status)}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   국제정보 분석 페이지 (WCO 챗봇 UI)
   ═══════════════════════════════════════════════════════════════ */
/* 국제정보 분석 — My AI 분석과 동일 구성의 독립 사본(pages/intl.js).
   요소 ID가 home 과 동일해 코칭·실행·픽커 로직이 그대로 동작하며,
   우측 캔버스 영역에는 프롬프트 템플릿 카드가 나열된다. */
function intlInfoPage(){
  return intlInfoPageHtml();
}

/* ═══════════════════════════════════════════════════════════════
   관계망 분석 페이지 (구 관세 온톨로지) — 관계망분석을 메인으로 단일 구성
   ═══════════════════════════════════════════════════════════════ */
function customsOntologyPage(){
  const ontologyNodes = [
    {id:"traveler",label:"우범여행자",type:"person",x:50,y:20,desc:"마약·밀수 관련 위험 여행자"},
    {id:"associate",label:"관계자",type:"person",x:20,y:45,desc:"우범여행자와 연관된 인물"},
    {id:"company",label:"기업",type:"org",x:80,y:45,desc:"우범자/관계자가 대표자인 기업"},
    {id:"cargo_a",label:"화물(관계자화주)",type:"cargo",x:15,y:75,desc:"우범여행자 관계자가 화주인 화물"},
    {id:"cargo_b",label:"화물(기업화주)",type:"cargo",x:85,y:75,desc:"우범여행자/관계자 기업의 화물"},
    {id:"declaration",label:"수입신고",type:"event",x:50,y:90,desc:"화물 관련 수입신고"},
  ];
  const ontologyEdges = [
    {from:"traveler",to:"associate",label:"알고있음",type:"relation"},
    {from:"traveler",to:"company",label:"대표자",type:"role"},
    {from:"associate",to:"company",label:"관계자",type:"role"},
    {from:"associate",to:"cargo_a",label:"화주",type:"role"},
    {from:"company",to:"cargo_b",label:"화주기업",type:"role"},
    {from:"cargo_a",to:"declaration",label:"신고대상",type:"event"},
    {from:"cargo_b",to:"declaration",label:"신고대상",type:"event"},
  ];
  const nodeColors = {person:"#7c3aed",org:"#0284c7",cargo:"#d97706",event:"#16a34a"};
  const nodeLabels = {person:"인물",org:"기관/기업",cargo:"화물",event:"사건/신고"};
  return `
    <section class="card gi-hub">
      <div class="gi-page-head">
        <div>
          <h2>관계망 분석</h2>
          <p class="muted">관계망(그래프) 기반 분석 — 우범여행자·기업·화물 관계망을 제공합니다.</p>
        </div>
      </div>
      <div class="gi-tab-body">
        <div style="display:flex;gap:16px">
          <div style="flex:1;min-width:0">
            <div class="panel-section-hdr" style="margin-bottom:8px"><span>우범여행자 감시 관계망 그래프</span></div>
            <div style="position:relative;height:480px;background:#f8fbff;border:1px solid #dde8ff;border-radius:10px;overflow:hidden">
              <svg width="100%" height="100%" style="position:absolute;top:0;left:0">
                ${ontologyEdges.map(e=>{
                  const from = ontologyNodes.find(n=>n.id===e.from);
                  const to   = ontologyNodes.find(n=>n.id===e.to);
                  if(!from||!to) return "";
                  const x1=from.x+"%", y1=from.y+"%", x2=to.x+"%", y2=to.y+"%";
                  const mx=((from.x+to.x)/2)+"%", my=((from.y+to.y)/2)+"%";
                  const color = e.type==="relation"?"#7c3aed":e.type==="role"?"#0284c7":"#16a34a";
                  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${e.type==="event"?"4,3":""}"/>
                          <text x="${mx}" y="${my}" font-size="10" fill="${color}" text-anchor="middle" dy="-3">${escapeHtml(e.label)}</text>`;
                }).join("")}
              </svg>
              ${ontologyNodes.map(n=>`
                <div style="position:absolute;left:calc(${n.x}% - 40px);top:calc(${n.y}% - 28px);text-align:center;width:80px">
                  <div style="background:${nodeColors[n.type]};color:#fff;border-radius:8px;padding:6px 4px;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.15);border:2px solid #fff;cursor:default" title="${escapeHtml(n.desc)}">${escapeHtml(n.label)}</div>
                  <div style="font-size:10px;color:#6b7f9e;margin-top:2px">${escapeHtml(nodeLabels[n.type])}</div>
                </div>
              `).join("")}
            </div>
            <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">
              ${Object.entries(nodeColors).map(([type,color])=>`
                <span style="display:flex;align-items:center;gap:4px;font-size:12px">
                  <span style="width:12px;height:12px;border-radius:3px;background:${color};display:inline-block"></span>${nodeLabels[type]}
                </span>
              `).join("")}
            </div>
          </div>
          <div style="width:280px;flex:none">
            <div class="panel-section-hdr" style="margin-bottom:8px"><span>관계망 클래스 정의</span></div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${ontologyNodes.map(n=>`
                <div style="background:#fff;border:1px solid #dde8ff;border-radius:8px;padding:10px 12px;border-left:3px solid ${nodeColors[n.type]}">
                  <div style="display:flex;align-items:center;gap:6px">
                    <strong style="font-size:13px;color:${nodeColors[n.type]}">${escapeHtml(n.label)}</strong>
                    <span style="font-size:10px;color:#6b7f9e;border:1px solid #dde8ff;border-radius:3px;padding:1px 5px">${escapeHtml(nodeLabels[n.type])}</span>
                  </div>
                  <div style="font-size:12px;color:#6b7f9e;margin-top:3px">${escapeHtml(n.desc)}</div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function canvasTabContent(){
  if(canvasTab === "profile") return canvasProfilePanel();
  if(canvasTab === "data") return canvasDataPanel();
  if(canvasTab === "scenario") return scenarioWorkbenchV2();
  if(canvasTab === "templates") return scenarioTemplatePanel();
  if(canvasTab === "report") return canvasReportPanel();
  return canvasOverviewPanel();
}

function scenarioSignature(items = scenarioItems){
  return JSON.stringify(items.map(item => ({
    key: item.key,
    behaviors: item.behaviors || [],
    instruction: item.instruction || "",
    order: item.order,
  })));
}

function applyJobOverride(job){
  const override = canvasJobOverrides[job.companyId] || {};
  return {
    ...job,
    ...override,
    status: {...(job.status || {}), ...(override.status || {})},
  };
}

function canvasJobs(){
  // 기본 샘플 작업 없음 — AI 캔버스는 사용자가 직접 등록·분석한 작업만 관리한다.
  return customCanvasJobs.map(applyJobOverride);
}

/* AI 캔버스는 "현재 사용자가 분석한 작업"만 관리한다.
   - 사용자가 등록한 작업(ownerUserId 존재): 본인 소유 작업만 표시
   - 샘플 기본 작업(ownerUserId 없음): 담당자(assignees)에 포함된 경우만 표시 */
function isJobAssignedToCurrentUser(job){
  const hidden = hiddenCanvasJobsByUser[currentUserId] || [];
  if(hidden.includes(job.companyId)) return false;
  if(job.ownerUserId) return job.ownerUserId === currentUserId;
  const assignees = Array.isArray(job.assignees) && job.assignees.length ? job.assignees : ["u01"];
  return assignees.includes(currentUserId);
}

function visibleCanvasJobs(){
  return canvasJobs().filter(isJobAssignedToCurrentUser);
}

function removeCanvasJobForCurrentUser(companyId){
  const job = canvasJobs().find(item => item.companyId === companyId);
  if(!job) return;
  const assignees = Array.isArray(job.assignees) ? job.assignees : [];
  const sharedWithOthers = assignees.some(userId => userId !== currentUserId);
  if(sharedWithOthers || !customCanvasJobs.some(item => item.companyId === companyId)){
    const hidden = new Set(hiddenCanvasJobsByUser[currentUserId] || []);
    hidden.add(companyId);
    hiddenCanvasJobsByUser[currentUserId] = [...hidden];
  } else {
    customCanvasJobs = customCanvasJobs.filter(item => item.companyId !== companyId);
    delete canvasJobOverrides[companyId];
    delete canvasRunArchives[companyId];
    delete companyScenarios[companyId];
  }
  const nextJob = activeCanvasJobs()[0] || null;
  if(activeCanvasCompanyId === companyId && nextJob){
    activeCanvasCompanyId = nextJob.companyId;
  }
  saveCanvasState();
}

function isArchivedJob(job){
  return job.archived === true;
}

function isCompletedActiveJob(job){
  return !isArchivedJob(job) && (job.status?.tone === "done" || job.status?.label === "완료" || job.status?.pct >= 100);
}

function activeCanvasJobs(){
  return visibleCanvasJobs().filter(job => !isArchivedJob(job));
}

function activeGeneralInvestigationJobs(){
  return allGenInvCases()
    .filter(item => !item.archived)
    .filter(item => {
      // 캔버스에는 로그인 사용자가 소유/담당한 수사만 표시 (소유자 없는 샘플 사건 제외)
      if(item.ownerUserId === currentUserId) return true;
      return Array.isArray(item.assignees) && item.assignees.includes(currentUserId);
    })
    .map(item => {
      const status = item.status || { label:"대기", done:0, total:activeGiCaseStepsForCard(item).length || 1, pct:0, tone:"wait" };
      const total = status.total || activeGiCaseStepsForCard(item).length || 1;
      const done = status.done ?? 0;
      const targetLabel = item.targetType === "person" ? "개인수사 분석" : "기업 수사 분석";
      return {
        jobId: item.caseId,
        companyId: item.companyId || item.personId || item.caseId,
        companyName: item.targetName,
        title: `${item.targetName} ${genInvTypeById(item.invTypeId).label}`,
        category: targetLabel,
        company: `${item.targetName} (${item.caseId})`,
        owner: item.investigator || currentUser().name,
        updated: item.updated || "방금",
        status: { ...status, done, total, pct: status.pct ?? Math.round((done / total) * 100) },
        next: "진행중인 수사",
        page: "generalinv",
        openTab: "cases",
      };
    });
}

function activeGiCaseStepsForCard(aCase){
  if(!aCase) return [];
  return aCase.giSteps || (GI_SCENARIO_STEPS[aCase.invTypeId] || GI_SCENARIO_STEPS.t7 || []);
}

function activeDrugInvestigationJobs(){
  // 캔버스에는 로그인 사용자가 소유/담당한 사건만 표시 (소유자 없는 샘플 사건 제외)
  return defaultDrugInvCases
    .filter(item => item.ownerUserId === currentUserId ||
      (Array.isArray(item.assignees) && item.assignees.includes(currentUserId)))
    .map(item => {
      const domain = item.domain || "lawsearch";
      const isFx = domain === "fxsearch";
      const type = drugInvTypeById(item.invTypeId);
      return {
        jobId: item.caseId,
        companyId: item.caseId,
        companyName: item.targetName,
        title: `${item.targetName} ${type.label}`,
        category: isFx ? "외환 수사 분석" : "마약 수사 분석",
        company: `${item.targetName} (${item.caseId})`,
        owner: item.investigator || item.owner || currentUser().name,
        updated: item.updated,
        status: item.status,
        next: "진행중인 수사",
        page: domain,
        openTab: "profile",
      };
    });
}

function activeAnalysisJobs(){
  const customsJobs = activeCanvasJobs().map(job => ({
    ...job,
    jobId: job.companyId,
    page: "investigation",
    openTab: "ongoing",
  }));
  return [...customsJobs, ...activeGeneralInvestigationJobs(), ...activeDrugInvestigationJobs()]
    .sort((a, b) => (b.updated === "방금") - (a.updated === "방금"));
}

function archivedCanvasJobs(){
  return visibleCanvasJobs().filter(isArchivedJob);
}

function isCompanyArchived(companyId = activeCanvasCompanyId){
  return Boolean(canvasJobs().find(job => job.companyId === companyId && isArchivedJob(job)));
}

function findCompanyById(companyId){
  const listedCompany = scenarioCompanies.find(company => company.company_id === companyId);
  if(listedCompany) return listedCompany;
  const job = canvasJobs().find(item => item.companyId === companyId);
  return job ? { company_id:job.companyId, company_name:job.companyName } : null;
}

function createCanvasJob(company){
  const companyId = company.company_id;
  const companyName = company.company_name || companyId;
  const existing = canvasJobs().find(job => job.companyId === companyId);
  if(existing){
    const assignees = new Set(existing.assignees || []);
    assignees.add(currentUserId);
    patchCanvasJob(companyId, { assignees:[...assignees], archived:false });
    hiddenCanvasJobsByUser[currentUserId] = (hiddenCanvasJobsByUser[currentUserId] || []).filter(id => id !== companyId);
    saveCanvasState();
    return;
  }
  customCanvasJobs.unshift({
    companyId,
    companyName,
    title:`${companyName} 신규 분석 시나리오`,
    category:"관세조사 분석",
    company:`${companyName} (${companyId})`,
    owner:"신규 분석 작업",
    updated:"방금",
    status:{ label:"대기", done:0, total:7, pct:0, tone:"wait" },
    next:"기업프로파일",
    tab:"profile",
    isNew:true,
    ownerUserId:currentUserId,
    assignees:[currentUserId],
  });
  saveCanvasState();
}

function patchCanvasJob(companyId, patch){
  const customJob = customCanvasJobs.find(job => job.companyId === companyId);
  if(customJob){
    Object.assign(customJob, patch);
    if(patch.status) customJob.status = { ...customJob.status, ...patch.status };
  }else{
    const current = canvasJobOverrides[companyId] || {};
    canvasJobOverrides[companyId] = {
      ...current,
      ...patch,
      status: { ...(current.status || {}), ...(patch.status || {}) },
    };
  }
  saveCanvasState();
}

function updateCanvasJobStatus(companyId, statusPatch){
  const patch = { status: statusPatch, updated: "방금" };
  if(statusPatch.label === "완료"){
    patch.tab = "report";
  }else if(statusPatch.tone === "running" || statusPatch.label === "대기" || statusPatch.label === "오류"){
    patch.archived = false;
  }
  patchCanvasJob(companyId, patch);
}

function activeCanvasJob(){
  const jobs = visibleCanvasJobs();
  return jobs.find(job => job.companyId === activeCanvasCompanyId) || jobs[0];
}

function activeCanvasCompany(companyIdOverride = activeCanvasCompanyId){
  const companyId = companyIdOverride || activeCanvasCompanyId;
  const listedCompany = findCompanyById(companyId);
  const job = companyId === activeCanvasCompanyId
    ? activeCanvasJob()
    : canvasJobs.find(item => item.companyId === companyId);
  return {
    company_id: companyId,
    company_name: listedCompany?.company_name || job?.companyName || companyId,
    risk_level: listedCompany?.risk_level || (companyId === "C-1002" ? "HIGH" : companyId === "C-1008" ? "LOW" : "MEDIUM"),
    risk_score: listedCompany?.risk_score ?? (companyId === "C-1002" ? 82.7 : companyId === "C-1008" ? 44.6 : 58.4),
    annual_import_amount: listedCompany?.annual_import_amount,
    declared_duty_amount: listedCompany?.declared_duty_amount,
  };
}

function currentRunArchive(companyId = activeCanvasCompanyId){
  return canvasRunArchives[companyId] || null;
}

function hasMeaningfulArchiveResults(archive){
  if(!archive) return false;
  const report = archive.latestReport || "";
  const validation = archive.latestValidation || "";
  return Boolean(
    Object.keys(archive.stepOutputs || {}).length ||
    (report && report !== "보고서가 아직 생성되지 않았습니다." && report !== "보고서 생성 대기 중입니다.") ||
    (validation && validation !== "검증 결과가 아직 없습니다." && validation !== "검증 대기 중입니다.")
  );
}

function archiveStatusSummary(archive){
  const total = archive?.scenarioItems?.length || Object.keys(archive?.stepStatuses || {}).length || 7;
  const statuses = Object.values(archive?.stepStatuses || {});
  const done = statuses.filter(status => status === "완료").length;
  const hasError = statuses.some(status => status === "오류");
  const hasRunning = statuses.some(status => status === "실행 중");
  const pct = total ? Math.round((done / total) * 100) : 0;
  if(hasError) return { label:"오류", done, total, pct, tone:"review" };
  if(done >= total && total > 0 && !archive?.partial) return { label:"완료", done, total, pct:100, tone:"done" };
  if(done > 0 || archive?.partial) return { label:hasRunning ? "실행 중" : "일부 완료", done, total, pct, tone:"running" };
  if(archive?.jobStatus) return { ...archive.jobStatus };
  return { label:"대기", done:0, total, pct:0, tone:"wait" };
}

function restoreRunArchiveToWorkspace(companyId, options = {}){
  const archive = currentRunArchive(companyId);
  const existingJobStatus = canvasJobs().find(job => job.companyId === companyId)?.status;
  const archivedStatus = archiveStatusSummary(archive);
  const status = archivedStatus.pct || !existingJobStatus ? archivedStatus : existingJobStatus;
  const hasReport = archive && archive.latestReport && archive.latestReport !== "보고서가 아직 생성되지 않았습니다.";
  const nextTab = options.tab || (hasReport ? "report" : "scenario");
  patchCanvasJob(companyId, {
    archived:false,
    scenarioChanged:false,
    status,
    tab:nextTab,
    updated:"방금",
  });
  activeCanvasCompanyId = companyId;
  if(archive?.scenarioItems?.length){
    companyScenarios[companyId] = archive.scenarioItems.map(item => ({...item}));
    scenarioItems = archive.scenarioItems.map((item, index) => normalizeScenarioItem({...item}, index));
    selectedScenarioId = scenarioItems[0]?.id || null;
  }else{
    scenarioItems = getCompanyScenario(companyId);
    selectedScenarioId = scenarioItems[0]?.id || null;
  }
  scenarioLoadedForCompany = companyId;
  scenarioInitialized = false;
  loadCompanyRunArchive(companyId);
  saveCanvasState();
}

function finalArchiveSnapshot(companyId){
  const existing = currentRunArchive(companyId) || {};
  const currentHasResults = hasMeaningfulArchiveResults({ stepOutputs, latestReport, latestValidation });
  const useCurrent = companyId === activeCanvasCompanyId && currentHasResults;
  const jobStatus = canvasJobs().find(job => job.companyId === companyId)?.status || archiveStatusSummary(existing);
  const snapshot = {
    ...existing,
    companyId,
    savedAt: new Date().toLocaleString("ko-KR"),
    scenarioSignature: useCurrent ? scenarioSignature() : (existing.scenarioSignature || scenarioSignature(getCompanyScenario(companyId))),
    scenarioItems: useCurrent
      ? scenarioItems.map(item => ({...item}))
      : ((existing.scenarioItems && existing.scenarioItems.length)
          ? existing.scenarioItems.map(item => ({...item}))
          : getCompanyScenario(companyId).map(item => ({...item}))),
    stepOutputs: useCurrent ? {...stepOutputs} : {...(existing.stepOutputs || {})},
    stepStatuses: useCurrent ? {...stepStatuses} : {...(existing.stepStatuses || {})},
    latestReport: useCurrent ? latestReport : (existing.latestReport || latestReport),
    latestValidation: useCurrent ? latestValidation : (existing.latestValidation || latestValidation),
    jobStatus,
    partial: false,
  };
  if(!hasMeaningfulArchiveResults(snapshot) && hasMeaningfulArchiveResults(existing)){
    return { ...existing, savedAt: snapshot.savedAt, partial:false };
  }
  return snapshot;
}

function archiveCanvasJob(companyId){
  const archive = finalArchiveSnapshot(companyId);
  canvasRunArchives[companyId] = archive;
  if(archive.scenarioItems?.length){
    companyScenarios[companyId] = archive.scenarioItems.map(item => ({...item}));
  }
  patchCanvasJob(companyId, {
    archived:true,
    archivedAt: archive.savedAt,
    scenarioChanged:false,
    status: archiveStatusSummary(archive),
    tab:"report",
    updated:"방금",
  });
}

function loadCompanyRunArchive(companyId){
  const archive = currentRunArchive(companyId);
  if(!archive){
    latestReport = "보고서가 아직 생성되지 않았습니다.";
    latestValidation = "검증 결과가 아직 없습니다.";
    stepOutputs = {};
    stepStatuses = {};
    openedSteps = new Set();
    expandedResultStepId = null;
    return;
  }
  latestReport = archive.latestReport || "보고서가 아직 생성되지 않았습니다.";
  latestValidation = archive.latestValidation || "검증 결과가 아직 없습니다.";
  stepOutputs = archive.stepOutputs ? {...archive.stepOutputs} : {};
  stepStatuses = archive.stepStatuses ? {...archive.stepStatuses} : {};
  openedSteps = new Set(Object.keys(stepOutputs));
  expandedResultStepId = null;
}

function saveRunArchive(companyId){
  canvasRunArchives[companyId] = {
    companyId,
    savedAt: new Date().toLocaleString("ko-KR"),
    scenarioSignature: scenarioSignature(),
    scenarioItems: scenarioItems.map(item => ({...item})),
    stepOutputs: {...stepOutputs},
    stepStatuses: {...stepStatuses},
    latestReport,
    latestValidation,
    partial: false,
  };
  patchCanvasJob(companyId, { scenarioChanged:false, tab:"report" });
}

function saveIntermediateResults(companyId){
  canvasRunArchives[companyId] = {
    ...(canvasRunArchives[companyId] || {}),
    companyId,
    savedAt: new Date().toLocaleString("ko-KR"),
    scenarioSignature: scenarioSignature(),
    scenarioItems: scenarioItems.map(item => ({...item})),
    stepOutputs: {...stepOutputs},
    stepStatuses: {...stepStatuses},
    latestReport,
    latestValidation,
    partial: true,
  };
  saveCanvasState();
}

function riskTone(riskLevel){
  if(riskLevel === "HIGH") return "high";
  if(riskLevel === "LOW") return "good";
  return "";
}

function companyOptions(){
  return scenarioCompanies;
}

function companyOptionsHtml(){
  const companies = companyOptions();
  if(!companies.length) return `<option value="">기업 프로파일 로드 중...</option>`;
  return companies
    .map(company => `<option value="${company.company_id}" ${company.company_id === activeCanvasCompanyId ? "selected" : ""}>${escapeHtml(company.company_name)} (${escapeHtml(company.company_id)})</option>`)
    .join("");
}

function refreshCompanyPicker(){
  const picker = document.getElementById("newScenarioCompanySelect");
  if(picker) picker.innerHTML = companyOptionsHtml();
}

function loadScenarioCompanies(){
  if(scenarioCompanies.length) return;
  if(scenarioCompaniesLoading) return;
  scenarioCompaniesLoading = true;
  fetch("/api/companies")
    .then(response => {
      if(!response.ok) throw new Error(`기업 프로파일 API 오류: ${response.status}`);
      return response.json();
    })
    .then(data => {
      scenarioCompanies = data.companies || [];
      scenarioCompaniesLoading = false;
      refreshCompanyPicker();
      if(canvasTab === "overview" && showScenarioCompanyPicker) render("canvas");
      if(currentPage === "profile") render("profile");
      if(currentPage === "investigation" && customsState.investigationTab === "dashboard") render("investigation");
    })
    .catch(error => {
      scenarioCompaniesLoading = false;
      const picker = document.getElementById("newScenarioCompanySelect");
      if(picker) picker.innerHTML = `<option value="">기업 프로파일 로드 실패</option>`;
      console.error(error);
    });
}

function loadRiskPersons(){
  if(riskPersons.length) return;
  if(riskPersonsLoading) return;
  riskPersonsLoading = true;
  fetch("/api/risk-persons")
    .then(response => {
      if(!response.ok) throw new Error(`우범자 프로파일 API 오류: ${response.status}`);
      return response.json();
    })
    .then(data => {
      riskPersons = data.persons || [];
      riskPersonsLoading = false;
      if(currentPage === "generalinv" && generalInvestigationState.showGenInvRegForm && generalInvestigationState.giRegTargetType === "person"){
        render("generalinv");
      }
      if(isSpecialInvestigationPage(currentPage) && specialInvestigationState.drugInvTab === "profile" && drugCaseTargetType() === "person"){
        renderSpecialInvestigation();
      }
    })
    .catch(error => {
      riskPersonsLoading = false;
      console.error(error);
    });
}

function loadRiskPersonProfile(personId){
  if(!personId) return;
  if(riskPersonProfiles[personId]) return;
  if(riskPersonProfileLoading[personId]) return;
  riskPersonProfileLoading[personId] = true;
  fetch(`/api/risk-person-profile?person_id=${encodeURIComponent(personId)}`)
    .then(response => {
      if(!response.ok) throw new Error(`우범자 통합 프로파일 API 오류: ${response.status}`);
      return response.json();
    })
    .then(data => {
      riskPersonProfileLoading[personId] = false;
      if(!data.error) riskPersonProfiles[personId] = data;
      if(currentPage === "generalinv" && generalInvestigationState.generalInvTab === "profile"){
        render("generalinv");
      }
      if(isSpecialInvestigationPage(currentPage) && specialInvestigationState.drugInvTab === "profile"){
        renderSpecialInvestigation();
      }
    })
    .catch(error => {
      riskPersonProfileLoading[personId] = false;
      console.error(error);
    });
}

function loadCompanyDetail(companyId){
  if(companyDetailCache[companyId]) return;
  companyDetailCache[companyId] = { loading: true };
  fetch(`/api/company?company_id=${encodeURIComponent(companyId)}`)
    .then(r => { if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      companyDetailCache[companyId] = { ...data, loading: false };
      if(canvasTab === "profile") render("canvas");
      if(currentPage === "generalinv" && generalInvestigationState.generalInvTab === "profile" && generalInvCompanyId(activeGenInvCase()) === companyId) render("generalinv");
      if(currentPage === "investigation" && customsState.investigationTab === "profile") render("investigation");
    })
    .catch(err => {
      companyDetailCache[companyId] = { error: String(err), loading: false };
      if(canvasTab === "profile") render("canvas");
      if(currentPage === "generalinv" && generalInvestigationState.generalInvTab === "profile" && generalInvCompanyId(activeGenInvCase()) === companyId) render("generalinv");
      if(currentPage === "investigation" && customsState.investigationTab === "profile") render("investigation");
    });
}

function canvasOverviewPanel(){
  const jobs = activeAnalysisJobs();
  const archived = archivedCanvasJobs();
  return `
    <div class="job-board">
      ${jobs.map(job => {
        const page = job.page || "investigation";
        const isCustoms = page === "investigation";
        const isSpecial = page === "lawsearch" || page === "fxsearch";
        const isDone = isCustoms && isCompletedActiveJob(job);
        const total = job.status.total ?? "?";
        const done  = job.status.done  ?? 0;
        const isActive = isCustoms
          ? job.companyId === activeCanvasCompanyId
          : isSpecial
            ? job.jobId === specialInvestigationState.activeDrugCaseId
            : job.jobId === generalInvestigationState.activeGenInvCaseId;
        return `
        <article class="job-card ${isActive ? "active" : ""} ${job.isNew ? "new" : ""} ${job.scenarioChanged ? "changed" : ""}" data-analysis-job="${escapeHtml(job.jobId || job.companyId)}" data-analysis-page="${escapeHtml(job.page || "investigation")}" data-analysis-tab="${escapeHtml(job.openTab || "ongoing")}" data-canvas-company="${escapeHtml(job.companyId || "")}" tabindex="0" role="button">
          <div class="job-card-head">
            <div>
              <span class="canvas-category-chip">${escapeHtml(canvasJobCategory(job))}</span>
              <h3>${job.title}</h3>
              <p class="muted">${job.company} · ${job.owner} · ${job.updated}</p>
            </div>
            <div class="job-status-row">
              <span class="job-status ${job.status.tone}">${job.status.label}</span>
              ${isDone ? `<button class="btn-inline-action" data-archive-job="${escapeHtml(job.companyId)}" title="아카이브로 저장">아카이브</button>` : ""}
              ${isCustoms ? `<button class="btn-inline-action job-remove-action" data-remove-job="${escapeHtml(job.companyId)}" title="내 진행작업에서 삭제">삭제</button>` : ""}
            </div>
          </div>
          ${job.scenarioChanged ? `<div class="job-change-note">시나리오가 변경되어 재실행이 필요합니다.</div>` : ""}
          <div class="job-progress">
            <i style="width:${job.status.pct}%"></i>
          </div>
          <div class="job-meta">
            <span>${done}/${total} 단계</span>
            <strong>${job.status.pct}%</strong>
          </div>
        </article>
      `}).join("") || `<div class="empty-state">진행 중인 분석 작업이 없습니다.</div>`}
    </div>
    <div class="overview-archive-section">
      <button class="overview-archive-toggle" data-toggle-archive>
        완료건 확인 <strong>(${archived.length}건)</strong>
        <span>${overviewArchiveOpen ? "▲" : "▼"}</span>
      </button>
      ${overviewArchiveOpen ? `
        <div class="job-board archive-board" style="margin-top:12px">
          ${archived.map(job => {
            const archive = currentRunArchive(job.companyId);
            return `
              <article class="job-card archive-card ${job.companyId === activeCanvasCompanyId ? "active" : ""}" data-canvas-company="${job.companyId}" data-canvas-tab="report" tabindex="0" role="button">
                <div class="job-card-head">
                  <div>
                    <h3>${job.title}</h3>
                    <p class="muted">${job.company} · ${archive?.savedAt || job.archivedAt || job.updated}</p>
                  </div>
                  <div class="job-status-row">
                    <span class="job-status done">아카이브</span>
                    <button class="btn-inline-action" data-restore-job="${job.companyId}" title="진행 작업으로 복원">복원</button>
                  </div>
                </div>
                <div class="archive-summary">
                  <span>저장 로그 ${archive ? Object.keys(archive.stepOutputs || {}).length : 0}건</span>
                  <strong>${job.status?.pct || 100}%</strong>
                </div>
              </article>
            `;
          }).join("") || `<div class="empty-state">아카이브된 분석 결과가 없습니다.</div>`}
        </div>
      ` : ""}
    </div>
  `;
}

function canvasArchivePanel(){
  const jobs = archivedCanvasJobs();
  return `
    <div class="canvas-overview-toolbar">
      <div>
        <strong>분석 결과 아카이브</strong>
        <p class="muted">완료된 분석 작업과 저장된 실행 로그를 다시 열람하거나 진행 작업으로 복원합니다.</p>
      </div>
      <button class="btn secondary" data-canvas-tab="overview">진행 작업 보기</button>
    </div>
    <div class="job-board archive-board">
      ${jobs.map(job => {
        const archive = currentRunArchive(job.companyId);
        return `
          <article class="job-card archive-card ${job.companyId === activeCanvasCompanyId ? "active" : ""}" data-canvas-company="${job.companyId}" data-open-company-profile="true" tabindex="0" role="button">
            <div class="job-card-head">
              <div>
                <h3>${job.title}</h3>
                <p class="muted">${job.company} · ${archive?.savedAt || job.archivedAt || job.updated}</p>
              </div>
              <span class="job-status done">아카이브</span>
            </div>
            <div class="archive-summary">
              <span>저장 로그 ${archive ? Object.keys(archive.stepOutputs || {}).length : 0}건</span>
              <strong>${job.status?.pct || 100}%</strong>
            </div>
            <div class="archive-actions">
              <button class="btn secondary" data-canvas-company="${job.companyId}" data-canvas-tab="report">결과 열기</button>
              <button class="btn secondary" data-restore-job="${job.companyId}">진행 작업으로 복원</button>
            </div>
          </article>
        `;
      }).join("") || `<div class="empty-state">아카이브된 분석 결과가 없습니다.</div>`}
    </div>
  `;
}

function fmtAmount(v){
  if(v == null || v === "") return "-";
  const n = Number(v);
  if(isNaN(n)) return "-";
  if(n >= 1e8) return `${(n/1e8).toFixed(1)}억원`;
  if(n >= 1e4) return `${(n/1e4).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

function canvasProfilePanel(companyIdOverride = activeCanvasCompanyId, options = {}){
  const companyId = companyIdOverride || activeCanvasCompanyId;
  const cache = companyDetailCache[companyId];
  const selectedLabel = options.selectedLabel || "선택 기업";

  if(!cache || cache.loading){
    return `
      <div class="canvas-selected-company">
        <span>${escapeHtml(selectedLabel)}</span>
        <strong>${escapeHtml(companyId)}</strong>
      </div>
      <div class="profile-loading">기업 프로파일 로딩 중...</div>
    `;
  }

  if(cache.error){
    return `<div class="profile-loading" style="color:var(--red)">프로파일 로드 실패: ${escapeHtml(cache.error)}</div>`;
  }

  const c = cache.company || {};
  const risk = cache.risk || {};
  const indicators = cache.risk_indicators || {};
  const declarations = cache.declarations || [];
  const riskLevel = c.risk_level || risk.risk_level || "-";
  const riskScore = c.risk_score ?? risk.risk_score;
  const riskLabel = riskLevel === "HIGH" ? "높음" : riskLevel === "LOW" ? "낮음" : riskLevel === "MEDIUM" ? "중간" : riskLevel;

  const declarationRows = declarations.slice(0,10).map(d => `
    <tr>
      <td>${escapeHtml(d.declaration_no || "-")}</td>
      <td>${escapeHtml(d.hs_code || "-")}</td>
      <td>${escapeHtml(d.item_name || "-")}</td>
      <td>${fmtAmount(d.declared_value)}</td>
      <td>${escapeHtml(d.origin_country || "-")}</td>
      <td>${escapeHtml(String(d.import_date || "-").slice(0,10))}</td>
      <td><span class="upload-status ${d.status === "NORMAL" ? "done" : d.status === "REVIEW" ? "review" : "running"}">${escapeHtml(d.status || "-")}</span></td>
    </tr>
  `).join("");

  return `
    <div class="canvas-selected-company">
      <span>${escapeHtml(selectedLabel)}</span>
      <strong>${escapeHtml(c.company_name || companyId)} (${escapeHtml(companyId)})</strong>
    </div>

    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="card"><span class="muted">위험등급</span><h2 class="${riskTone(riskLevel)}">${riskLabel}</h2></div>
      <div class="card"><span class="muted">AI 위험점수</span><h2 class="${riskTone(riskLevel)}">${riskScore != null ? Number(riskScore).toFixed(1) : "-"}</h2></div>
      <div class="card"><span class="muted">연간 수입금액</span><h2>${fmtAmount(c.annual_import_amount)}</h2></div>
      <div class="card"><span class="muted">신고 관세액</span><h2>${fmtAmount(c.declared_duty_amount)}</h2></div>
    </div>

    <div class="profile-grid" style="margin-bottom:14px">
      <div class="card">
        <h3>기업 기본정보</h3>
      <div class="profile-info-grid">
        <div><span class="muted">사업자번호</span><strong>${escapeHtml(c.business_registration_no || "-")}</strong></div>
        <div><span class="muted">업종코드</span><strong>${escapeHtml(c.industry_code || "-")}</strong></div>
        <div><span class="muted">설립연도</span><strong>${escapeHtml(String(c.founded_year || "-"))}</strong></div>
        <div><span class="muted">직원수</span><strong>${c.employee_count != null ? `${Number(c.employee_count).toLocaleString()}명` : "-"}</strong></div>
        <div><span class="muted">연매출</span><strong>${fmtAmount(c.annual_revenue)}</strong></div>
        <div><span class="muted">최근환급</span><strong>${fmtAmount(c.recent_customs_refund)}</strong></div>
        <div><span class="muted">FTA 감면율</span><strong>${c.fta_reduction_rate != null ? `${c.fta_reduction_rate}%` : "-"}</strong></div>
        <div><span class="muted">최근 감사일</span><strong>${escapeHtml(String(c.last_audit_date || "-").slice(0,10))}</strong></div>
        <div style="grid-column:1/-1"><span class="muted">주소</span><strong>${escapeHtml([c.address_postal_code ? `(${c.address_postal_code})` : "", c.address, c.address_detail].filter(Boolean).join(" ") || "-")}</strong></div>
        <div><span class="muted">관세사</span><strong>${escapeHtml(c.customs_broker_firm || "-")}</strong></div>
        <div><span class="muted">관계회사</span><strong>${escapeHtml(c.related_companies || "-")}</strong></div>
        <div style="grid-column:3/-1"><span class="muted">주요 수출입국</span><strong>${escapeHtml(c.major_export_countries || "-")}</strong></div>
      </div>
      </div>

      <div class="card risk-panel">
        <div class="risk-panel-head">
          <h3>AI 위험 지표 분석</h3>
          <div class="risk-circle ${riskTone(riskLevel)}">
            <strong>${riskScore != null ? Number(riskScore).toFixed(1) : "-"}</strong>
            <span>${riskLabel}</span>
          </div>
        </div>
        <div class="risk-bars">
          ${[
            ["저가신고 의심률",        "undervaluation",    risk.undervaluation_suspicion_rate],
            ["특수관계 이상률",        "related_party",     risk.related_party_anomaly_rate],
            ["FTA 원산지 오용 의심률", "fta_origin_misuse", risk.fta_origin_misuse_suspicion_rate],
            ["관세환급 이상률",        "customs_refund",    risk.customs_refund_anomaly_rate],
            ["HS 분류 오류율",         "hs_classification", risk.hs_classification_error_rate],
            ["역외자금 은닉 의심률",   "offshore_fund",     risk.offshore_fund_concealment_suspicion_rate],
          ].map(([label, code, val]) => {
            const pct = val != null ? Math.min(100, Number(val)) : 0;
            const tone = pct >= 60 ? "high" : pct >= 30 ? "mid" : "low";
            const meta = indicators[code] || {};
            const bullets = String(meta.reason || "")
              .split("\n").map(s => s.replace(/^[-\s]+/, "").trim()).filter(Boolean);
            const reasonHtml = bullets.length
              ? `<ul class="risk-reason">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
              : "";
            const recoHtml = (pct >= 60 && meta.recommendation)
              ? `<p class="risk-reco">📌 ${escapeHtml(meta.recommendation)}</p>` : "";
            return `
              <div class="risk-bar-row">
                <span>${label}</span>
                <div class="risk-bar-track">
                  <i class="${tone}" style="width:${pct}%"></i>
                </div>
                <strong class="${tone === "high" ? "high" : tone === "mid" ? "mid-risk" : "good"}">${val != null ? Number(val).toFixed(1) : "-"}%</strong>
              </div>
              ${reasonHtml}${recoHtml}`;
          }).join("")}
        </div>
      </div>
    </div>

    <div class="card">
      <h3>최근 수입신고 내역 (최대 10건)</h3>
      ${declarations.length ? `
        <table class="table">
          <thead><tr><th>신고번호</th><th>HS코드</th><th>품명</th><th>신고금액</th><th>원산지</th><th>수입일</th><th>상태</th></tr></thead>
          <tbody>${declarationRows}</tbody>
        </table>
      ` : `<p class="muted">수입신고 내역이 없습니다.</p>`}
    </div>
  `;
}

function canvasDataPanel(companyIdOverride, options = {}){
  // null/undefined 모두 안전하게 처리
  const resolvedCompanyId = companyIdOverride || activeCanvasCompanyId;
  const selectedLabel  = options.selectedLabel  || "선택 기업";
  const heading        = options.heading        || "기초자료 수집/등록";
  const description    = options.description    || "";
  const caseBadge      = options.caseBadge      || "";
  // options.subjectName 이 있으면 회사 조회 없이 그 값을 표시 (수사 대상 등)
  let subjectName;
  if(options.subjectName){
    subjectName = escapeHtml(options.subjectName);
  } else {
    const company = activeCanvasCompany(resolvedCompanyId);
    subjectName = `${escapeHtml(company.company_name)} (${escapeHtml(company.company_id)})`;
  }
  return `
    <section class="data-upload-board">
      <div class="canvas-selected-company">
        <span>${escapeHtml(selectedLabel)}</span>
        <strong>${subjectName}</strong>
        ${caseBadge ? `<em class="canvas-context-badge">${escapeHtml(caseBadge)}</em>` : ""}
      </div>
      <h3>${escapeHtml(heading)}</h3>
      ${description ? `<p class="muted" style="margin:-8px 0 14px">${escapeHtml(description)}</p>` : ""}
      <div class="upload-summary-grid">
        <button type="button" class="upload-drop-card">
          <strong>파일 업로드</strong>
          <span>PDF, XLS, DOCX, 이미지 문서</span>
        </button>
        <div class="upload-stat-card"><span>총 업로드 문서</span><strong>124</strong></div>
        <div class="upload-stat-card"><span>정상추출 자동승인</span><strong>80</strong></div>
        <div class="upload-stat-card warn"><span>검토필요 이상감지</span><strong>44</strong></div>
        <div class="upload-stat-card active"><span>AI 분석 진행중</span><strong>20</strong></div>
      </div>

      <div class="upload-table-wrap">
        <table class="upload-table">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="전체 선택"></th>
              <th>파일명</th>
              <th>파일유형</th>
              <th>추출데이터</th>
              <th>활용 AI 서비스</th>
              <th>AI검증결과</th>
              <th>진행상태</th>
            </tr>
          </thead>
          <tbody>
            ${uploadRow({
              file:"INV_HG_20260422.pdf",
              type:"세금계산서",
              extracted:["총액: USD ₩1,820,000","품명: ELECTRONIS XXX"],
              agents:["수입신고검증 agent","품목분류검증 agent"],
              result:"품명 불일치 확인",
              status:"처리완료",
              tone:"done"
            })}
            ${uploadRow({
              file:"계약서_HG_20260422.pdf",
              type:"계약서",
              extracted:["주계약: 에이비씨 테크","피계약: 지에프 글로벌","계약금: ₩2,000 만원"],
              agents:["수입신고검증 agent","과세가격평가 agent"],
              result:"가산요소(권리사용료) 신고이력 없음",
              status:"처리완료",
              tone:"done"
            })}
            ${uploadRow({
              file:"기업설명서.pdf",
              type:"분석중",
              extracted:["문서 요약 agent"],
              agents:["문서 요약 agent"],
              result:"-",
              status:"검토필요",
              tone:"review"
            })}
            ${uploadRow({
              file:"특허 권리 계약서.pdf",
              type:"분석중",
              extracted:["처리중"],
              agents:["수입신고검증 agent","특허정보조회 agent"],
              result:"처리중",
              status:"분석중",
              tone:"running"
            })}
            ${uploadRow({
              file:"개인조사자료.xls",
              type:"매출 관련 정보",
              extracted:["업체정보: 에이비씨 테크","우범자: 김관세","연관자: 김우범"],
              agents:["RAG생성 AI 서비스"],
              result:"처리중",
              status:"분석중",
              tone:"running"
            })}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function uploadRow({file,type,extracted,agents,result,status,tone}){
  return `
    <tr>
      <td><input type="checkbox" aria-label="${file} 선택"></td>
      <td class="upload-file">${file}</td>
      <td>${type}</td>
      <td>${extracted.map(item => `<span class="extract-pill">${item}</span>`).join("")}</td>
      <td>${agents.map(agent => `<strong class="agent-line">${agent}</strong>`).join("")}</td>
      <td>${result}</td>
      <td><span class="upload-status ${tone}">${status}</span></td>
    </tr>
  `;
}

function canvasReportPanel(){
  const company = activeCanvasCompany();
  const companyName = `${company.company_name} (${company.company_id})`;
  return commonAnalysisReportPanel({
    selectedLabel: "선택 기업",
    targetText: escapeHtml(companyName),
    reportTitle: "분석 보고서",
    validationTitle: "보고서 검증",
    reportHtml: markdownToHtml(ensureReportRequiredSections(latestReport, "customs", { targetName: companyName })),
    validationHtml: renderValidationDashboard(latestValidation),
    reportId: "scenarioReportOutput",
    validationId: "scenarioValidationOutput",
  });
}

function editingCardStepsHtml(){
  if(!templateEditorItems.length) return `<li class="template-empty-step">왼쪽에서 AI 서비스 단계를 선택 후 추가하세요.</li>`;
  const last = templateEditorItems.length - 1;
  return templateEditorItems.map((item, i) => `
    <li class="template-editable-step ${item.id === templateEditorSelectedId ? "selected" : ""}" data-teditor-id="${item.id}">
      <b>${i + 1}</b>
      <div class="template-editable-step-body">
        <strong>${escapeHtml(normalizeReportValidationLabel(item.label))}</strong>
        <small>${escapeHtml(sourceBehaviorLabels(item.key, item.behaviors).join(", "))}</small>
      </div>
      <div class="step-reorder-btns">
        <button type="button" class="step-move-btn" data-move-step="${item.id}" data-move-dir="up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="step-move-btn" data-move-step="${item.id}" data-move-dir="down" ${i === last ? "disabled" : ""}>↓</button>
      </div>
    </li>
  `).join("");
}

function templateCardHtml(template){
  const isCustom = !!template.isCustom;
  const isEditing = editingTemplateId === template.id;
  const editable = canEditTemplate(template);
  const deletable = canDeleteTemplate(template);
  const ownerLabel = templateOwnerLabel(template);
  const stepListHtml = isEditing
    ? `<ol class="template-step-list template-step-list-editable" id="templateEditorStepList">${editingCardStepsHtml()}</ol>`
    : `<ol class="template-step-list">${template.items.map((item, i) => `
        <li>
          <b>${i + 1}</b>
          <div>
            <strong>${escapeHtml(normalizeReportValidationLabel(item.label))}</strong>
            <small>${escapeHtml(sourceBehaviorLabels(item.key, item.behaviors).join(", "))}</small>
          </div>
        </li>`).join("")}
      </ol>`;
  const stepCount = isEditing ? templateEditorItems.length : template.items.length;

  // Button states:
  // - 편집 중: 변경·삭제 모두 비활성
  // - 편집 중 아님: 변경·삭제 모두 활성 (빌트인 포함)
  const isCustomsDomain = templateEditorDomain === "customs";
  const changeBtn = isEditing
    ? `<button class="btn secondary" type="button" disabled style="opacity:.4">템플릿 변경</button>`
    : (editable
        ? `<button class="btn secondary" type="button" data-template-edit-btn="${escapeHtml(template.id)}">템플릿 변경</button>`
        : (isCustomsDomain
            ? `<button class="btn secondary" type="button" data-template-edit-btn="${escapeHtml(template.id)}">복사 후 변경</button>`
            : `<button class="btn secondary" type="button" disabled title="조직 관리자만 빌트인 템플릿을 편집할 수 있습니다.">템플릿 변경</button>`));
  // 일반/마약 빌트인 템플릿은 수사유형 표준이므로 삭제 불가(관세조사만 삭제 제공)
  const deleteBtn = !isCustomsDomain
    ? ""
    : (isEditing
        ? `<button class="btn secondary" type="button" disabled style="opacity:.4">템플릿 삭제</button>`
        : `<button class="btn secondary template-delete-action" type="button" data-delete-template="${escapeHtml(template.id)}" ${deletable ? "" : "disabled title=\"소유자 또는 관리자만 삭제할 수 있습니다.\""}>템플릿 삭제</button>`);

  return `
    <article class="template-card ${isEditing ? "template-card-editing" : ""}" data-template-card="${escapeHtml(template.id)}">
      <div class="template-card-head">
        <div>
          <h3>${escapeHtml(template.name)}</h3>
          <p>${escapeHtml(template.description || "")}</p>
          <em class="template-owner-badge">${escapeHtml(ownerLabel)}${editable ? " · 편집 가능" : " · 공유 읽기"}</em>
        </div>
        <span class="template-step-count">${stepCount}단계</span>
      </div>
      ${stepListHtml}
      <div class="template-card-actions">
        ${changeBtn}
        ${deleteBtn}
      </div>
    </article>
  `;
}

function editingTemplateName(){
  if(!editingTemplateId) return "";
  if(editingTemplateId === "__new__") return templateDraftName || "";
  const t = allScenarioTemplates(templateEditorDomain).find(t => t.id === editingTemplateId);
  return t?.name || "";
}

function scenarioTemplatePanel(domain = "customs"){
  templateEditorDomain = domain;
  const allTemplates = allScenarioTemplates(domain);
  const editorName = editingTemplateName();
  const hasEditing = !!editingTemplateId;
  const allowNew = domain === "customs"; // 신규 커스텀 등록은 관세조사에서만(일반/마약은 빌트인 편집)
  return `
    <div class="template-management-layout">
      <aside class="template-editor-panel">
        <div class="template-editor-header">분석 시나리오 템플릿 설정하기</div>
        <div class="template-editor-body">
          <label class="template-name-field">
            <span>템플릿 이름</span>
            <input id="templateNameInput" type="text" placeholder="템플릿 이름을 입력하세요" value="${escapeHtml(editorName)}" ${!hasEditing ? "disabled" : ""}>
          </label>
          <label class="scenario-field">
            <span>AI 서비스 단계</span>
            <select id="templateSourceSelect" ${!hasEditing ? "disabled" : ""}>${scenarioSourceOptionsHtml()}</select>
          </label>
          <div class="scenario-field">
            <span>동작 선택</span>
            <div id="templateBehaviorOptions" class="scenario-behavior-options"></div>
          </div>
          <div id="templateSourceHint" class="scenario-source-hint"></div>
          <div id="templateShareEmailPanel"></div>
          <div id="templateWebTargetPanel"></div>
          <label class="scenario-field">
            <span>추가 지시</span>
            <textarea id="templateInstruction" placeholder="${hasEditing ? "이 단계에서 중점적으로 확인할 내용을 입력하세요." : "템플릿을 선택하거나 새 템플릿을 만드세요."}" ${!hasEditing ? "disabled" : ""}></textarea>
          </label>
          <label class="scenario-field">
            <span>상세 프롬프트 템플릿 <small class="muted">(선택한 AI 서비스·동작 기준 · 조직 관리자만 등록)</small></span>
            <textarea id="templatePromptComposed" rows="8" placeholder="단계를 선택하면 등록된 상세 프롬프트가 표시됩니다." ${!hasEditing ? "disabled" : ""}></textarea>
          </label>
          <div class="scenario-actions">
            <button id="templatePromptRegister" type="button" class="btn secondary" ${!hasEditing ? "disabled" : ""}>상세 프롬프트 등록</button>
          </div>
          <div class="scenario-actions">
            <button id="templateAddButton" type="button" class="btn" ${!hasEditing ? "disabled" : ""}>단계 추가</button>
            <button id="templateDeleteStepButton" type="button" class="btn secondary" ${!templateEditorSelectedId ? "disabled" : ""}>선택 삭제</button>
          </div>
          <button id="templateSaveButton" type="button" class="btn template-save-btn" ${!hasEditing ? "disabled" : ""}>분석 시나리오 템플릿 저장</button>
        </div>
      </aside>

      <div class="template-grid-area">
        <div class="template-grid-header">
          <div>
            <h2>분석 시나리오 템플릿</h2>
            <p class="muted">공통 조사 흐름을 관리하는 화면입니다. 기업별 실행 화면에서는 여기의 템플릿을 불러와 필요한 부분만 조정합니다.</p>
          </div>
          ${allowNew ? `<button id="templateNewButton" type="button" class="btn secondary">새 템플릿</button>` : ""}
        </div>
        <div class="template-card-grid">
          ${editingTemplateId === "__new__" ? `
            <article class="template-card template-card-editing" data-template-card="__new__">
              <div class="template-card-head">
                <div><h3>새 템플릿</h3><p>AI 서비스 단계를 추가하여 새 템플릿을 만드세요.</p></div>
                <span class="template-step-count">${templateEditorItems.length}단계</span>
              </div>
              <ol class="template-step-list template-step-list-editable" id="templateEditorStepList">
                ${editingCardStepsHtml()}
              </ol>
              <div class="template-card-actions">
                <button class="btn secondary" type="button" disabled style="opacity:.4">템플릿 변경</button>
                <button class="btn secondary template-delete-action" type="button" data-discard-new-template="true">템플릿 삭제</button>
              </div>
            </article>
          ` : ""}
          ${allTemplates.map(t => templateCardHtml(t)).join("")}
        </div>
      </div>
    </div>
  `;
}

function attachEditingStepListeners(){
  document.querySelectorAll(".template-editable-step[data-teditor-id]").forEach(step => {
    step.addEventListener("click", (e) => {
      if(e.target.closest(".step-move-btn")) return;
      templateEditorSelectedId = step.dataset.teditorId;
      document.querySelectorAll(".template-editable-step").forEach(s => s.classList.remove("selected"));
      step.classList.add("selected");
      syncTemplateEditorFields();
      const delBtn = document.getElementById("templateDeleteStepButton");
      if(delBtn) delBtn.disabled = false;
    });
  });
  document.querySelectorAll(".step-move-btn[data-move-step]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.moveStep;
      const dir = btn.dataset.moveDir;
      const idx = templateEditorItems.findIndex(i => i.id === id);
      if(idx < 0) return;
      if(dir === "up" && idx > 0){
        [templateEditorItems[idx - 1], templateEditorItems[idx]] = [templateEditorItems[idx], templateEditorItems[idx - 1]];
      } else if(dir === "down" && idx < templateEditorItems.length - 1){
        [templateEditorItems[idx], templateEditorItems[idx + 1]] = [templateEditorItems[idx + 1], templateEditorItems[idx]];
      }
      templateEditorItems.forEach((item, i) => { item.order = i + 1; });
      templateEditorSelectedId = id;
      refreshEditingCard();
    });
  });
}

function refreshEditingCard(){
  const list = document.getElementById("templateEditorStepList");
  if(!list) return;
  list.innerHTML = editingCardStepsHtml();
  attachEditingStepListeners();
  const badge = document.querySelector(".template-card-editing .template-step-count");
  if(badge) badge.textContent = `${templateEditorItems.length}단계`;
  const delBtn = document.getElementById("templateDeleteStepButton");
  if(delBtn) delBtn.disabled = !templateEditorSelectedId;
}

function syncTemplateEditorFields(){
  const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
  const src = document.getElementById("templateSourceSelect");
  const instr = document.getElementById("templateInstruction");
  const hint = document.getElementById("templateSourceHint");
  if(src && item) src.value = item.key;
  if(item) syncBehaviorOptions(item.key, item.behaviors || sourceDefaultBehaviors(item.key), "templateBehaviorOptions");
  if(!item) syncBehaviorOptions(src?.value || "db_cdw", null, "templateBehaviorOptions");
  if(instr) instr.value = item?.instruction || sourceDefaultInstruction(item?.key) || "";
  if(hint && item){
    const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
    const status = permissionStatus(item.key);
    hint.innerHTML = `
      <div class="hint-header">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="source-permission ${status}">${permissionLabel(status)}</span>
      </div>
      <span class="hint-behaviors">${escapeHtml(behaviors.join(", "))}</span>
      <p>${escapeHtml(sourceDefaultInstruction(item.key) || "이 단계의 추가 지시를 입력하세요.")}</p>
    `;
  }
  if(hint && !item) hint.innerHTML = "";
  renderShareEmailPanel("template");
  renderWebTargetPanel("template");
  loadComposedPromptForSelected();
}

// 선택한 단계의 AI 서비스·동작 조합에 해당하는 상세 프롬프트(등록 오버라이드 우선)를 로드한다.
function templateStepServiceId(item){
  if(!item) return "";
  return scenarioSourceByKey(item.key) ? item.key : giCommonSourceKey(item.key);
}
async function loadComposedPromptForSelected(){
  const ta = document.getElementById("templatePromptComposed");
  if(!ta) return;
  const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
  if(!item){ ta.value = ""; ta.dataset.serviceId = ""; return; }
  const serviceId = templateStepServiceId(item);
  const targetType = normalizeTargetType(item.targetType || item.target_type || "company");
  ta.dataset.serviceId = serviceId;
  ta.dataset.targetType = targetType;
  const text = await composePrompt(serviceId, item.behaviors || [], targetType);
  // 비동기 사이 선택이 바뀌지 않았을 때만 반영
  if(templateEditorItems.find(i => i.id === templateEditorSelectedId) === item){
    ta.value = text || "";
  }
}

function initTemplateEditor(){
  const srcSel = document.getElementById("templateSourceSelect");
  if(!srcSel || templateEditorInitialized) return;
  templateEditorInitialized = true;

  syncBehaviorOptions(srcSel.value || "db_cdw", null, "templateBehaviorOptions");
  attachEditingStepListeners();
  syncTemplateEditorFields();

  document.getElementById("templateAddButton")?.addEventListener("click", () => {
    if(!editingTemplateId) return;
    const key = document.getElementById("templateSourceSelect").value;
    const source = scenarioSourceByKey(key);
    if(!source) return;
    const behaviors = selectedBehaviorValues("templateBehaviorOptions");
    const instruction = document.getElementById("templateInstruction").value.trim();
    const newItem = normalizeScenarioItem({
      id: uid(), key, type: source.type, label: source.label,
      behaviors: behaviors.length ? behaviors : sourceDefaultBehaviors(key),
      instruction: instruction || sourceDefaultInstruction(key) || "",
      shareRecipients: key === "mail_share" ? scenarioItemShareRecipients(shareEmailScopeItem("template")) : [],
      webTargets: key === "web_search" ? scenarioItemWebTargets(shareEmailScopeItem("template")) : [],
    }, templateEditorItems.length);
    templateEditorItems.push(newItem);
    templateEditorSelectedId = newItem.id;
    templateEditorItems.forEach((item, i) => { item.order = i + 1; });
    refreshEditingCard();
    syncTemplateEditorFields();
  });

  document.getElementById("templateDeleteStepButton")?.addEventListener("click", () => {
    if(!templateEditorSelectedId) return;
    templateEditorItems = templateEditorItems.filter(i => i.id !== templateEditorSelectedId);
    templateEditorItems.forEach((item, i) => { item.order = i + 1; });
    templateEditorSelectedId = templateEditorItems[0]?.id || null;
    refreshEditingCard();
    syncTemplateEditorFields();
  });

  document.getElementById("templateSourceSelect")?.addEventListener("change", event => {
    const key = event.target.value;
    syncBehaviorOptions(key, null, "templateBehaviorOptions");
    const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
    if(item){
      item.key = key;
      item.label = scenarioSourceByKey(key)?.label || key;
      item.type = scenarioSourceByKey(key)?.type || "db";
      setScenarioItemShareRecipients(item, key === "mail_share" ? scenarioItemShareRecipients(item) : []);
      setScenarioItemWebTargets(item, key === "web_search" ? scenarioItemWebTargets(item) : []);
      refreshEditingCard();
      syncTemplateEditorFields();
    }
  });

  document.getElementById("templateInstruction")?.addEventListener("input", event => {
    const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
    if(item) item.instruction = event.target.value;
  });

  document.getElementById("templateSaveButton")?.addEventListener("click", () => {
    const nameInput = document.getElementById("templateNameInput");
    const name = nameInput?.value?.trim();
    if(!name){ nameInput?.focus(); alert("템플릿 이름을 입력해 주세요."); return; }
    if(!templateEditorItems.length){ alert("최소 한 단계 이상 추가해 주세요."); return; }
    const savedItems = templateEditorItems.map(i => ({...i, id: uid()}));
    // 일반/마약 빌트인 편집: scenario_templates.json에 저장(조직 관리자만)
    if(templateEditorDomain === "general" || templateEditorDomain === "drug" || templateEditorDomain === "fx"){
      if(!isCurrentUserAdmin()){ alert("조직 관리자만 빌트인 템플릿을 편집할 수 있습니다."); return; }
      const arr = templateEditorDomain === "general" ? giScenarioTemplates
        : templateEditorDomain === "fx" ? fxScenarioTemplates
        : drugScenarioTemplates;
      const target = arr.find(t => t.id === editingTemplateId);
      if(target){
        target.name = name;
        target.description = `${templateEditorItems.length}단계 · 수정됨`;
        target.items = savedItems.map((it, i) => ({ ...it, order: i + 1 }));
        rebuildScenarioStepMaps();
        persistScenarioTemplatesToServer();
      }
      templateDraftName = "";
      templateEditorInitialized = false;
      render(currentPage);
      alert(`"${name}" 템플릿이 저장되었습니다.`);
      return;
    }
    const isExistingCustom = editingTemplateId && editingTemplateId !== "__new__"
      && customTemplates.some(t => t.id === editingTemplateId);
    const isBuiltin = editingTemplateId && editingTemplateId !== "__new__"
      && scenarioTemplates.some(t => t.id === editingTemplateId);
    if(isExistingCustom){
      const idx = customTemplates.findIndex(t => t.id === editingTemplateId);
      customTemplates[idx] = { ...customTemplates[idx], name, description:`${templateEditorItems.length}단계 · 수정됨`, items: savedItems, isCustom: true };
    } else if(isBuiltin){
      // Update the built-in card in-place via override (no new card created)
      builtinOverrides[editingTemplateId] = { name, description:`${templateEditorItems.length}단계 · 수정됨`, items: savedItems };
    } else {
      // __new__ → create new custom card
      const newId = `custom-${uid()}`;
      // 등록자의 조직(정보국/본청/세관) 단위로 공유한다.
      customTemplates.unshift({ id: newId, name, description:`${templateEditorItems.length}단계`, items: savedItems, isCustom: true, ownerUserId: currentUserId, ownerName: currentUser().name, ownerOrgId: currentUserGroup().org, shared: true });
      editingTemplateId = newId;
    }
    templateDraftName = "";
    saveTemplatesState();
    saveCanvasState();
    templateEditorInitialized = false;
    render("canvas");
    alert(`"${name}" 템플릿이 저장되었습니다.`);
  });

  document.getElementById("templateNewButton")?.addEventListener("click", () => {
    editingTemplateId = "__new__";
    templateDraftName = "";
    templateEditorItems = [];
    templateEditorSelectedId = null;
    templateEditorInitialized = false;
    render("canvas");
  });

  // 상세 프롬프트 등록(오버라이드 저장) — 조직 관리자만. AI 서비스·동작 조합 단위로 전역 반영.
  document.getElementById("templatePromptRegister")?.addEventListener("click", () => {
    if(!isCurrentUserAdmin()){ alert("조직 관리자만 상세 프롬프트를 등록할 수 있습니다."); return; }
    const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
    if(!item){ alert("프롬프트를 등록할 단계를 먼저 선택하세요."); return; }
    const ta = document.getElementById("templatePromptComposed");
    if(!ta) return;
    const serviceId = templateStepServiceId(item);
    const targetType = normalizeTargetType(item.targetType || item.target_type || "company");
    setPromptOverride(serviceId, targetType, item.behaviors || [], ta.value);
    savePromptOverrides();
    alert("상세 프롬프트가 등록되었습니다. 이후 분석 실행에 반영됩니다.");
  });
}

/* ═══════════════════════════════════════════════════════════════
   공통 분석 시나리오 워크벤치 HTML 생성 함수
   - 관세조사 scenarioWorkbenchV2 를 표준으로 추출
   - ctx 파라미터로 제목/부제목/템플릿 옵션만 다르게 주입
   - 모든 DOM ID 는 동일 (한 번에 하나만 표시)
   - 홈화면·캔버스와 무관
   ═══════════════════════════════════════════════════════════════ */
function sharedScenarioWorkbenchHtml(ctx = {}){
  const archived          = ctx.archived          || false;
  const titleHtml         = ctx.titleHtml         || "조사 및 수사 분석 단계";
  const subtitleHtml      = ctx.subtitleHtml       || "";
  const templateOptionsHtml = ctx.templateOptionsHtml || scenarioTemplateOptionsHtml();

  return `
    <section class="card scenario-workbench scenario-workbench-v2">
      <div class="scenario-work-header">
        <div class="scenario-title-row">
          <div>
            <h3>${titleHtml}</h3>
            <p class="muted">${subtitleHtml}</p>
          </div>
        </div>

        <div class="scenario-service-zone">
          <strong>AI 서비스</strong>
          <select id="scenarioQuickSourceSelect" class="scenario-template-select"></select>
          <button type="button" class="btn scenario-template-apply-btn" data-scenario-quick-add
            ${archived ? "disabled" : ""}>단계 추가</button>
          <button type="button" class="btn secondary scenario-template-apply-btn" data-scenario-quick-delete
            ${archived ? "disabled" : ""}>선택 삭제</button>
        </div>

        <div class="scenario-template-zone">
          <strong>분석 템플릿</strong>
          <select id="scenarioTemplateSelect" class="scenario-template-select">
            ${templateOptionsHtml}
          </select>
          <button id="scenarioTemplateApplyButton" type="button"
            class="btn scenario-template-apply-btn" ${archived ? "disabled" : ""}>
            템플릿적용하기
          </button>
          <button id="scenarioSaveButton" type="button"
            class="btn secondary scenario-save-bottom">신규 템플릿으로 등록</button>
        </div>
      </div>

      <section class="scenario-board">
        <ol id="scenarioList" class="scenario-list scenario-list-horizontal"></ol>
      </section>

      <div class="scenario-layout scenario-execution-layout">
        <aside class="scenario-config">
          <div class="scenario-agent-zone">
            <div id="scenarioSourceHint" class="scenario-source-hint"></div>
            <div class="scenario-field">
              <span>동작 선택</span>
              <div id="scenarioBehaviorOptions" class="scenario-behavior-options"></div>
            </div>
            <div id="scenarioShareEmailPanel"></div>
            <div id="scenarioWebTargetPanel"></div>
            <label class="scenario-field">
              <span>자동 생성 프롬프트</span>
              <textarea id="scenarioInstruction"
                class="scenario-prompt-editor"
                placeholder="선택한 AI 서비스와 동작 조건에 맞춰 최적 프롬프트가 자동 생성됩니다. 필요하면 직접 수정하세요."></textarea>
            </label>
          </div>
          <div id="scenarioPromptValidation" class="scenario-prompt-validation"></div>
          <div class="scenario-prompt-actions">
            <button id="scenarioApplyPromptButton" type="button" class="btn secondary"
              ${archived ? "disabled" : ""}>프롬프트 변경 적용</button>
            <button id="scenarioValidatePromptButton" type="button" class="btn secondary"
              ${archived ? "disabled" : ""}>프롬프트 검증</button>
            <button id="scenarioRunSelectedButton" type="button" class="btn primary"
              ${archived ? "disabled" : ""}>▶ 이 AI서비스만 실행</button>
          </div>
        </aside>

        <section class="scenario-log">
          <div class="scenario-log-head">
            <h3>분석 실행 로그</h3>
            <div class="scenario-log-actions">
              <button id="scenarioRunButton" type="button" class="btn"
                ${archived ? "disabled" : ""}>단계별 자동실행</button>
              <button id="scenarioClearButton" type="button" class="btn secondary"
                ${archived ? "disabled" : ""}>결과 지우기</button>
            </div>
          </div>
          <div id="scenarioClarify" class="scenario-clarify-slot"></div>
          <div id="scenarioStepAccordion" class="scenario-step-accordion"></div>
        </section>
      </div>
    </section>
  `;
}

/* 관세조사 — 기존 동작 유지 (공통 함수 호출) */
function scenarioWorkbenchV2(){
  const company = activeCanvasCompany();
  const archived = isCompanyArchived(company.company_id);
  return sharedScenarioWorkbenchHtml({
    archived,
    titleHtml:    "조사 및 수사 분석 단계",
    subtitleHtml: `수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다. <em style="color:#0369a1;font-style:normal;font-weight:700">${archived ? "아카이브된 작업은 복원 후 다시 분석할 수 있습니다." : "단계를 추가·삭제·순서 변경하여 맞춤형 시나리오를 구성할 수 있습니다."}</em>`,
    templateOptionsHtml: scenarioTemplateOptionsHtml(),
  });
}


function uid(){
  if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setMarkdown(target, value){
  if(target) target.innerHTML = markdownToHtml(value);
}

// ── 기업 위험도 대시보드 (공통 콘텐츠 함수) ─────────────────────────

/* riskDashboardContent() — 순수 내용만 반환. 어디서든 재사용 가능.
   - 메인 '기업 위험도 대시보드' 전용 페이지: riskDashboard() 가 section.card 래퍼로 감쌈
   - 관세조사분석 탭 내 embedded: riskDashboardContent() 이 직접 호출                 */
function riskDashboardContent(){
  if(!scenarioCompanies.length){
    return `
      <div class="risk-dashboard">
        <div class="risk-dash-header">
          <div>
            <h2>분석대상 업체 위험도 모니터링</h2>
            <p class="muted">담당자가 관리하는 전체 기업의 위험도 현황을 실시간으로 모니터링합니다.</p>
          </div>
        </div>
        <div class="profile-loading">위험도 데이터 로딩 중...</div>
      </div>`;
  }

  const companies = scenarioCompanies;
  const total = companies.length;
  const needReview = companies.filter(c => c.risk_level === "HIGH").length;
  const nearAudit  = companies.filter(c => (c.risk_score||0) >= 75).length;

  const cnt = (field, thr) => companies.filter(c => (c[field]||0) > thr).length;
  const alertCounts = {
    underval : cnt("undervaluation_suspicion_rate", 50) * 3 + cnt("undervaluation_suspicion_rate", 30),
    hs       : cnt("hs_classification_error_rate", 40) * 5 + cnt("hs_classification_error_rate", 20) * 2,
    royalty  : cnt("related_party_anomaly_rate", 50) * 3 + cnt("related_party_anomaly_rate", 30),
    forex    : cnt("offshore_fund_concealment_suspicion_rate", 50) * 2,
    refund   : cnt("customs_refund_anomaly_rate", 40) * 3 + cnt("customs_refund_anomaly_rate", 20),
  };

  const q = riskDashboardFilter.query.toLowerCase();
  const minS = riskDashboardFilter.minScore;
  const filtered = companies.filter(c => {
    if(q && !((c.company_name||"").toLowerCase().includes(q) || (c.company_id||"").includes(q))) return false;
    if(minS && (c.risk_score||0) < minS) return false;
    return true;
  });

  return `
    <div class="risk-dashboard">
      <div class="risk-dash-header">
        <div>
          <h2>분석대상 업체 위험도 모니터링</h2>
          <p class="muted">담당자가 관리하는 전체 기업의 위험도 현황을 실시간으로 모니터링합니다.</p>
        </div>
        <div class="risk-kpi-strip">
          <div class="risk-kpi-item">
            <span>총 관리대상 업체</span>
            <strong>${total.toLocaleString()} 개사</strong>
          </div>
          <div class="risk-kpi-item">
            <span>심사필요</span>
            <strong>${needReview} 개사</strong>
          </div>
          <div class="risk-kpi-item">
            <span>조사 임박</span>
            <strong>${nearAudit} 개사</strong>
          </div>
        </div>
      </div>

      <div class="ci-dw-bar">
        <strong>DW 조회</strong>
        <input id="ciDwQuery" class="ci-dw-input" placeholder="자연어로 DW 조건을 입력하세요 (예: 최근 1년 수입금액 10억 이상 · HS 8471 · 저가신고 의심업체)">
        <button class="btn ci-dw-run" type="button" onclick="ciRunDwQuery()">조회 실행</button>
      </div>
      <div class="ci-dw-result" id="ciDwResult" style="display:none"></div>

      <div class="risk-alert-strip">
        ${riskAlertCard("신고가격오류 의심", alertCounts.underval)}
        ${riskAlertCard("품목분류 위장 의심", alertCounts.hs)}
        ${riskAlertCard("권리사용료 미신고", alertCounts.royalty)}
        ${riskAlertCard("외환 송금액 불일치", alertCounts.forex)}
        ${riskAlertCard("환급금액 오신청 의심", alertCounts.refund)}
      </div>

      <div class="risk-dash-filter">
        <h3>검색조건</h3>
        <input id="riskFilterQuery" class="risk-filter-input"
          placeholder="업체명, 사업자번호, 대표자... 검색"
          value="${escapeHtml(riskDashboardFilter.query)}">
        <select id="riskFilterScore" class="risk-filter-select">
          <option value="0"  ${minS===0  ? "selected":""}>스코어: 전체</option>
          <option value="80" ${minS===80 ? "selected":""}>스코어: 80점 이상만</option>
          <option value="60" ${minS===60 ? "selected":""}>스코어: 60점 이상만</option>
          <option value="40" ${minS===40 ? "selected":""}>스코어: 40점 이상만</option>
        </select>
      </div>

      <div class="risk-company-grid" id="riskCompanyGrid">
        ${filtered.map(riskCompanyCard).join("") || '<div class="empty-state">검색 조건에 맞는 기업이 없습니다.</div>'}
      </div>
    </div>`;
}

/* 메인 '기업 위험도 대시보드' 전용 페이지 — section.card 래퍼만 추가 */
function riskDashboard(){
  return `<section class="card" style="padding:0;overflow:visible">${riskDashboardContent()}</section>`;
}

function riskAlertCard(label, count){
  return `
    <div class="risk-alert-item">
      <span>${label}</span>
      <strong>${count} <small>건</small></strong>
    </div>`;
}

/* 공통 위험도 카드 — investigation 대시보드 / profile 페이지 동일 사용 */
function riskCompanyCard(c){ return sharedRiskCard(c); }

function sharedRiskCard(c){
  const score = c.risk_score || 0;
  const level = c.risk_level || "LOW";
  const cls   = level === "HIGH" ? "danger" : level === "MEDIUM" ? "warn" : "safe";
  const tags  = companyRiskTags(c);
  const visibleTags = tags.slice(0,2).map(t => `<span class="risk-tag">${escapeHtml(t)}</span>`).join("");
  const moreTags = tags.length > 2 ? `<span class="risk-tag more">+${tags.length-2}개</span>` : "";
  const scoreClass = level === "HIGH" ? "high" : level === "LOW" ? "good" : "";
  const cardId = `#TRG-26-${escapeHtml(c.company_id.replace("C-",""))}`;
  return `
    <div class="risk-company-card ${cls}">
      <div class="ci-card-top-row">
        <div class="ci-card-name-head">
          <strong class="ci-card-name">${escapeHtml(c.company_name || c.company_id)}</strong>
          <span class="muted ci-card-id">${cardId}</span>
        </div>
        <button class="btn ci-card-select-btn ${cls}" data-investigation-select="${escapeHtml(c.company_id)}">조사대상 선정</button>
      </div>
      <span class="muted ci-card-industry">${escapeHtml(industryLabel(c.industry_code))}</span>
      <div class="risk-card-scores">
        <div><span class="muted">위험도점수</span><strong class="${scoreClass}">${score.toFixed(1)}</strong></div>
        <div><span class="muted">주요 위험</span><div class="risk-card-tags">${visibleTags}${moreTags}</div></div>
      </div>
      <div class="risk-card-review">
        <p>${companyReviewText(c)}</p>
      </div>
    </div>`;
}

function companyRiskTags(c){
  const tags = [];
  if((c.undervaluation_suspicion_rate||0) >= 50)              tags.push("#단기저가신고");
  if((c.offshore_fund_concealment_suspicion_rate||0) >= 50)   tags.push("#외환거래불일치");
  if((c.related_party_anomaly_rate||0) >= 50)                 tags.push("#특수관계거래");
  if((c.hs_classification_error_rate||0) >= 40)               tags.push("#품목분류오류");
  if((c.customs_refund_anomaly_rate||0) >= 50)                tags.push("#환급오신청");
  if((c.fta_origin_misuse_suspicion_rate||0) >= 50)           tags.push("#FTA원산지");
  return tags;
}

function companyReviewText(c){
  const u = c.undervaluation_suspicion_rate || 0;
  const r = c.related_party_anomaly_rate   || 0;
  const h = c.hs_classification_error_rate  || 0;
  const f = c.fta_origin_misuse_suspicion_rate || 0;
  if(u >= 60) return `전일 수입신고 ${Math.ceil(u/30)}건이 업계평균 대비 ${Math.round(u/3)}% 낮게 신고됨(이전가격 조작의심)`;
  if(r >= 60) return `특수관계자 거래 비중이 높아 로열티 미신고 가능성이 확인됩니다.`;
  if(f >= 60) return `FTA 원산지 서류 오류가 다수 발견되어 추가 검토가 필요합니다.`;
  if(h >= 50) return `가격신고 오류가 확인되나, 오타일 가능성이 높아 보입니다.`;
  if(u >= 35) return `수입신고 ${Math.ceil(u/25)}건이 업계평균 대비 ${Math.round(u/3)}% 낮게 신고됨`;
  return `수입신고 데이터 검토 결과 경미한 이상 징후가 있어 모니터링이 권장됩니다.`;
}

function industryLabel(code){
  const map = { G46:"도매 및 상품중개업", G47:"소매업", C20:"화학물질", C13:"섬유 제조", C21:"의약품", C26:"전자부품", C30:"자동차" };
  return map[code] || code || "기타";
}

function initGenInvSearch(){
  const input = document.getElementById("giSearchInput");
  if(!input) return;
  input.addEventListener("input", () => {
    generalInvestigationState.genInvFilter = input.value;
    const board = document.querySelector(".gi-case-board");
    if(!board) return;
    const q = generalInvestigationState.genInvFilter.toLowerCase();
    const all = allGenInvCases();
    const filtered = q ? all.filter(c =>
      c.targetName.toLowerCase().includes(q) ||
      c.caseId.toLowerCase().includes(q) ||
      genInvTypeById(c.invTypeId).label.includes(q)
    ) : all;
    board.innerHTML = filtered.map(genInvCaseCard).join("") ||
      `<div class="empty-state">검색 결과가 없습니다.</div>`;
  });
}

function genInvCaseCard(c){
  const type     = genInvTypeById(c.invTypeId);
  const isActive = c.caseId === generalInvestigationState.activeGenInvCaseId;
  const isDone   = c.status.pct >= 100 || c.status.tone === "done";
  return `
    <article class="gi-case-card${isActive ? " active" : ""}" data-gi-case="${escapeHtml(c.caseId)}" tabindex="0" role="button">
      <div class="gi-case-head">
        <div>
          <span class="gi-case-no">${escapeHtml(c.caseId)}</span>
          <h3 class="gi-case-name">${escapeHtml(c.targetName)}</h3>
        </div>
        <div class="job-status-row">
          <span class="job-status ${c.status.tone}">${c.status.label}</span>
          ${isDone ? `<button class="btn-inline-action" data-gi-archive-case="${escapeHtml(c.caseId)}" title="아카이브">아카이브</button>` : ""}
          <button class="btn-inline-action job-remove-action" data-gi-remove-case="${escapeHtml(c.caseId)}" title="삭제">삭제</button>
        </div>
      </div>
      <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
      <div class="job-progress"><i style="width:${c.status.pct}%"></i></div>
      <div class="job-meta">
        <span>${c.status.done}/${c.status.total} 단계</span>
        <strong>${c.status.pct}%</strong>
      </div>
      <div class="gi-case-foot">
        <span class="muted">${escapeHtml(c.investigator)} · ${escapeHtml(c.team)}</span>
        <span class="muted">${escapeHtml(c.updated)}</span>
      </div>
    </article>
  `;
}

function initRiskDashboard(){
  const queryInput = document.getElementById("riskFilterQuery");
  const scoreSelect = document.getElementById("riskFilterScore");
  if(!queryInput) return;

  queryInput.addEventListener("input", () => {
    riskDashboardFilter.query = queryInput.value;
    const q = riskDashboardFilter.query.toLowerCase();
    const minS = riskDashboardFilter.minScore;
    const filtered = scenarioCompanies.filter(c => {
      if(q && !((c.company_name||"").toLowerCase().includes(q) || (c.company_id||"").includes(q))) return false;
      if(minS && (c.risk_score||0) < minS) return false;
      return true;
    });
    const grid = document.getElementById("riskCompanyGrid");
    if(grid){
      const cardFn = currentPage === "investigation" ? ciCompanyCard : riskCompanyCard;
      grid.innerHTML = filtered.map(cardFn).join("") || '<div class="empty-state">검색 조건에 맞는 기업이 없습니다.</div>';
    }
  });

  scoreSelect.addEventListener("change", () => {
    riskDashboardFilter.minScore = parseInt(scoreSelect.value, 10);
    if(currentPage === "investigation") render("investigation");
    else render("profile");
  });
}

// ── 시나리오 워크벤치 ─────────────────────────────────────────────────


function normalizeScenarioOrder(){
  scenarioItems = scenarioItems.map((item,index)=>({...item, order:index+1}));
}

function selectedScenarioItem(){
  return scenarioItems.find(item=>item.id === selectedScenarioId) || null;
}

function behaviorOptionsHtml(key, selectedValues = null){
  // scenarioBuilderConfig.agentOptionDefaults 우선 참조
  const savedDefaults = scenarioBuilderConfig?.agentOptionDefaults?.[key] || {};
  const configBehaviors = savedDefaults.behaviors?.length ? savedDefaults.behaviors
    : savedDefaults.behavior ? [savedDefaults.behavior] : null;

  const selected = Array.isArray(selectedValues) && selectedValues.length
    ? selectedValues
    : configBehaviors || sourceDefaultBehaviors(key);

  // built-in + 사용자 추가 동작 통합
  const customBehaviors = Array.isArray(savedDefaults.customBehaviors) ? savedDefaults.customBehaviors : [];
  const builtinOptions = sourceBehaviorOptions(key);
  const customOptions = customBehaviors
    .filter(v => !builtinOptions.some(o => o.value === v))
    .map(v => ({ value: v, label: v }));
  const allOptions = [...builtinOptions, ...customOptions];

  return allOptions
    .map(option => `
      <label class="scenario-behavior-check">
        <input type="checkbox" value="${escapeHtml(option.value)}" ${selected.includes(option.value) ? "checked" : ""}>
        <span>${escapeHtml(option.label)}</span>
      </label>
    `)
    .join("");
}

function syncBehaviorOptions(key, selectedValues = null, boxId = "scenarioBehaviorOptions"){
  const behaviorBox = document.getElementById(boxId);
  if(!behaviorBox) return;
  behaviorBox.innerHTML = behaviorOptionsHtml(key, selectedValues);
  if(boxId === "scenarioBehaviorOptions"){
    behaviorBox.querySelectorAll("input").forEach(input => {
      input.addEventListener("change", () => updateSelectedScenarioBehaviors());
    });
  }
}

function selectedBehaviorValues(boxId = "scenarioBehaviorOptions"){
  return Array.from(document.querySelectorAll(`#${boxId} input:checked`))
    .map(input => input.value);
}

function scenarioRunInstruction(item){
  const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
  const instruction = item.instruction || sourceDefaultInstruction(item.key, item.target_type || item.targetType || "company") || "기본 분석";
  const webTargets = scenarioItemWebTargets(item);
  const webTargetText = webTargets.length
    ? `\n\n[직접 등록 URL]\n${webTargets.map(target => `- ${target.url}${target.query ? `\n  검색 내용: ${target.query}` : ""}`).join("\n")}`
    : "";
  return `[동작 선택]\n- ${behaviors.join("\n- ")}\n\n${instruction}${extraPromptsRunText(item.extraPrompts)}${webTargetText}`;
}

function scenarioInstructionPreview(item){
  const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
  const instruction = item.instruction || sourceDefaultInstruction(item.key, item.target_type || item.targetType || "company") || "기본 분석";
  const webTargets = scenarioItemWebTargets(item);
  const suffix = webTargets.length ? ` · URL ${webTargets.length}건` : "";
  return `${behaviors.join(", ")} · ${instruction}${suffix}`;
}

function initScenarioWorkbench(){
  const quickSourceSelect = document.getElementById("scenarioQuickSourceSelect");
  const instruction = document.getElementById("scenarioInstruction");
  const templateSelect = document.getElementById("scenarioTemplateSelect");
  if(!quickSourceSelect) return;

  quickSourceSelect.innerHTML = scenarioSourceOptionsHtml();

  // Only reload scenario data when company changes; preserve stepOutputs/stepStatuses otherwise
  if(scenarioLoadedForCompany !== activeCanvasCompanyId){
    scenarioLoadedForCompany = activeCanvasCompanyId;
    const archive = canvasRunArchives[activeCanvasCompanyId];
    scenarioItems = getCompanyScenario(activeCanvasCompanyId);
    if(archive){
      stepOutputs = {...(archive.stepOutputs || {})};
      stepStatuses = {...(archive.stepStatuses || {})};
      latestReport = archive.latestReport || "보고서가 아직 생성되지 않았습니다.";
      latestValidation = archive.latestValidation || "검증 결과가 아직 없습니다.";
    }else{
      stepOutputs = {};
      stepStatuses = {};
      latestReport = "보고서가 아직 생성되지 않았습니다.";
      latestValidation = "검증 결과가 아직 없습니다.";
    }
    selectedScenarioId = scenarioItems[0]?.id || null;
  }

  if(scenarioInitialized) return;
  scenarioInitialized = true;

  document.getElementById("scenarioRunButton").addEventListener("click", runScenarioWorkflow);
  document.getElementById("scenarioClearButton").addEventListener("click", clearScenarioResults);
  document.getElementById("scenarioTemplateApplyButton")?.addEventListener("click", applySelectedScenarioTemplate);
  document.getElementById("scenarioSaveButton")?.addEventListener("click", () => {
    const defaultName = `${activeCanvasCompany()?.company_name || "기업"} 분석 템플릿`;
    const name = prompt("저장할 템플릿 이름을 입력하세요:", defaultName);
    if(!name?.trim()) return;
    const newTemplate = {
      id: `custom-${uid()}`,
      name: name.trim(),
      description: `${new Date().toLocaleDateString("ko-KR")} 저장 · ${scenarioItems.length}단계`,
      items: scenarioItems.map(item => ({...item, id: uid()})),
      isCustom: true,
      ownerUserId: currentUserId,
      ownerName: currentUser().name,
      shared: true,
    };
    customTemplates.unshift(newTemplate);
    saveTemplatesState();
    saveCanvasState();
    const templateSelect = document.getElementById("scenarioTemplateSelect");
    if(templateSelect){
      const selected = templateSelect.value;
      templateSelect.innerHTML = scenarioTemplateOptionsHtml();
      templateSelect.value = selected;
    }
    setScenarioStatus("템플릿 저장됨");
  });
  document.querySelector("[data-scenario-quick-add]")?.addEventListener("click", addScenarioItem);
  document.querySelector("[data-scenario-quick-delete]")?.addEventListener("click", deleteSelectedScenario);
  quickSourceSelect.addEventListener("change", event => applyScenarioSourceSelection(event.target.value));
  document.getElementById("scenarioApplyPromptButton")?.addEventListener("click", applySelectedScenarioPrompt);
  document.getElementById("scenarioValidatePromptButton")?.addEventListener("click", validateSelectedScenarioPrompt);
  if(templateSelect) templateSelect.value = activeScenarioTemplateId;

  syncScenarioEditor();
  renderScenarioList();
  renderScenarioSteps();
}

function syncScenarioEditor(){
  const item = selectedScenarioItem();
  const quickSourceSelect = document.getElementById("scenarioQuickSourceSelect");
  const instruction = document.getElementById("scenarioInstruction");
  const hint = document.getElementById("scenarioSourceHint");
  const validation = document.getElementById("scenarioPromptValidation");
  const targetType = item?.target_type || item?.targetType || "company";
  if(quickSourceSelect && item) quickSourceSelect.value = item.key;
  if(item) syncBehaviorOptions(item.key, item.behaviors || sourceDefaultBehaviors(item.key));
  if(!item) syncBehaviorOptions("db_cdw", []);
  // 즉시 폴백값 설정 후 JSON 기반 최적 프롬프트로 교체
  const _fallback = item?.instruction || scenarioSuggestedInstruction(item?.key, targetType, item?.behaviors) || "";
  if(instruction) instruction.value = _fallback;
  if(item?.key){
    // race 가드: promise 발행 시점의 단계가 resolve 시점에도 선택돼 있어야 적용.
    // (이 가드 없이는 단계 A의 늦은 응답이 단계 B 화면/데이터에 A의 프롬프트를 덮어쓴다)
    const issuedItemId = item.id;
    composePrompt(item.key, item.behaviors || sourceDefaultBehaviors(item.key), targetType).then(composed => {
      const liveItem = selectedScenarioItem();
      if(!composed || !liveItem || liveItem.id !== issuedItemId) return;
      const el = document.getElementById("scenarioInstruction");
      if(!el) return;
      // 사용자가 직접 수정하지 않은 경우(=자동 생성값과 동일할 때)에만 교체
      const current = el.value;
      if(!current || current === _fallback){
        el.value = composed;
        liveItem.instruction = composed;
      }
    });
  }
  if(hint && item){
    const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
    const status = permissionStatus(item.key);
    const needsPermission = status === "locked" || status === "requested";
    hint.innerHTML = `
      <div class="hint-header">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="source-permission ${status}">${permissionLabel(status)}</span>
      </div>
      <span class="hint-behaviors">${escapeHtml(behaviors.join(", "))}</span>
      ${needsPermission ? `
        <div class="hint-permission-callout">
          <span>${status === "requested" ? "권한 요청이 접수되었습니다. 승인 대기 중입니다." : "이 단계를 실행하려면 추가 권한이 필요합니다."}</span>
          ${status === "locked" ? `<button type="button" class="btn-perm-request" data-permission-request="${escapeHtml(item.key)}">권한 요청</button>` : ""}
        </div>
      ` : `<p>${escapeHtml(scenarioSuggestedInstruction(item.key, targetType, item.behaviors) || "선택 조건에 맞는 프롬프트를 입력하세요.")}</p>`}
    `;
  }
  if(hint && !item) hint.innerHTML = "";
  if(validation) validation.innerHTML = "";
  renderShareEmailPanel("scenario");
  renderWebTargetPanel("scenario");
  const quickDeleteButton = document.querySelector("[data-scenario-quick-delete]");
  if(quickDeleteButton) quickDeleteButton.disabled = !item || isCompanyArchived();
  const applyPromptButton = document.getElementById("scenarioApplyPromptButton");
  if(applyPromptButton) applyPromptButton.disabled = !item || isCompanyArchived();
  const validatePromptButton = document.getElementById("scenarioValidatePromptButton");
  if(validatePromptButton) validatePromptButton.disabled = !item || isCompanyArchived();
  const runSelectedButton = document.getElementById("scenarioRunSelectedButton");
  if(runSelectedButton) runSelectedButton.disabled = !item;
}

function applyScenarioSourceSelection(key){
  const item = selectedScenarioItem();
  if(item){
    updateSelectedScenarioSource(key);
    return;
  }
  const quickSourceSelect = document.getElementById("scenarioQuickSourceSelect");
  const instruction = document.getElementById("scenarioInstruction");
  const targetType = "company";
  const behaviors = sourceDefaultBehaviors(key);
  if(quickSourceSelect) quickSourceSelect.value = key;
  syncBehaviorOptions(key, behaviors);
  const _initPrompt = scenarioSuggestedInstruction(key, targetType, behaviors);
  if(instruction) instruction.value = _initPrompt;
  composePrompt(key, behaviors, targetType).then(composed => {
    if(composed && instruction) instruction.value = composed;
  });
  const validation = document.getElementById("scenarioPromptValidation");
  if(validation) validation.innerHTML = "";
}

function addScenarioItem(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  const sourceSelect = document.getElementById("scenarioQuickSourceSelect");
  const instruction = document.getElementById("scenarioInstruction");
  const key = sourceSelect?.value;
  const source = scenarioSourceByKey(key);
  if(!source) return;
  const behaviors = selectedBehaviorValues();
  const targetType = "company";
  const suggestedInstruction = scenarioSuggestedInstruction(key, targetType, behaviors.length ? behaviors : sourceDefaultBehaviors(key));
  const item = {
    id: uid(),
    key,
    type: source.type,
    label: source.label,
    behaviors: behaviors.length ? behaviors : sourceDefaultBehaviors(key),
    order: scenarioItems.length + 1,
    targetType,
    target_type: targetType,
    instruction: instruction.value.trim() || suggestedInstruction,
    shareRecipients: key === "mail_share" ? scenarioItemShareRecipients(shareEmailScopeItem("scenario")) : [],
    webTargets: key === "web_search" ? scenarioItemWebTargets(shareEmailScopeItem("scenario")) : [],
  };
  item.share_recipients = item.shareRecipients;
  item.web_targets = item.webTargets;
  item.behavior = item.behaviors[0];
  item.behaviorLabel = sourceBehaviorLabels(key, item.behaviors).join(", ");
  scenarioItems.push(item);
  selectedScenarioId = item.id;
  openedSteps.add(item.id);
  instruction.value = scenarioSuggestedInstruction(key, targetType, item.behaviors);
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
  syncScenarioEditor();
}

function deleteSelectedScenario(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  if(!selectedScenarioId) return;
  if(expandedResultStepId === selectedScenarioId) expandedResultStepId = null;
  scenarioItems = scenarioItems.filter(item => item.id !== selectedScenarioId);
  delete stepOutputs[selectedScenarioId];
  delete stepStatuses[selectedScenarioId];
  openedSteps.delete(selectedScenarioId);
  selectedScenarioId = scenarioItems[0]?.id || null;
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
  syncScenarioEditor();
}

function applySelectedScenarioTemplate(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  const templateSelect = document.getElementById("scenarioTemplateSelect");
  const templateId = templateSelect?.value || "customs-basic";
  activeScenarioTemplateId = templateId;
  scenarioItems = cloneTemplateItems(templateId);
  selectedScenarioId = scenarioItems[0]?.id || null;
  stepOutputs = {};
  stepStatuses = {};
  openedSteps = new Set();
  expandedResultStepId = null;
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
  syncScenarioEditor();
  updateScenarioProgress(0);
  setScenarioStatus("템플릿 적용됨");
}

function updateSelectedScenarioInstruction(value){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  if(!item) return;
  item.instruction = value;
  saveCompanyScenario();
  renderScenarioList();
}

function applySelectedScenarioPrompt(){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  const instruction = document.getElementById("scenarioInstruction");
  const validation = document.getElementById("scenarioPromptValidation");
  if(!item || !instruction) return;
  const value = instruction.value.trim();
  if(!value){
    if(validation) validation.innerHTML = `<div class="prompt-validation-msg warn">프롬프트를 입력한 뒤 적용하세요.</div>`;
    instruction.focus();
    return;
  }
  item.instruction = value;
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
  if(validation) validation.innerHTML = `<div class="prompt-validation-msg good">변경된 프롬프트가 단계별 자동실행에 적용되었습니다.</div>`;
}

function validateSelectedScenarioPrompt(){
  const item = selectedScenarioItem();
  const instruction = document.getElementById("scenarioInstruction");
  const validation = document.getElementById("scenarioPromptValidation");
  if(!item || !instruction || !validation) return;
  const value = instruction.value.trim();
  const behaviorLabels = sourceBehaviorLabels(item.key, selectedBehaviorValues().length ? selectedBehaviorValues() : item.behaviors);
  const missing = behaviorLabels.filter(label => label && !value.includes(label));
  const messages = [];
  if(!value) messages.push("프롬프트가 비어 있습니다.");
  if(value.length < 20) messages.push("프롬프트가 너무 짧아 분석 범위가 불명확할 수 있습니다.");
  if(missing.length) messages.push(`선택 동작 키워드 보강 권장: ${missing.join(", ")}`);
  validation.innerHTML = messages.length
    ? `<div class="prompt-validation-msg warn">${escapeHtml(messages.join(" "))}</div>`
    : `<div class="prompt-validation-msg good">선택된 AI 서비스와 동작 조건에 맞는 프롬프트입니다.</div>`;
}

function updateSelectedScenarioBehaviors(){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  if(!item) return;
  const previousBehaviors = item.behaviors || sourceDefaultBehaviors(item.key);
  const previousInstruction = item.instruction;
  const values = selectedBehaviorValues();
  if(!values.length){
    syncBehaviorOptions(item.key, item.behaviors || sourceDefaultBehaviors(item.key));
    alert("동작은 최소 하나 이상 선택해야 합니다.");
    return;
  }
  item.behaviors = values;
  item.behavior = values[0];
  item.behaviorLabel = sourceBehaviorLabels(item.key, values).join(", ");
  const targetType = item.target_type || item.targetType || "company";
  // 이전 프롬프트가 자동 생성(레거시 또는 JSON composePrompt)인지 확인 후 재생성
  composePrompt(item.key, previousBehaviors, targetType).then(prevComposed => {
    const isAuto = isAutoScenarioInstruction(previousInstruction, item.key, targetType, previousBehaviors)
      || String(previousInstruction || "").trim() === String(prevComposed || "").trim();
    if(isAuto){
      // JSON 기반 최적 프롬프트 우선 적용
      return composePrompt(item.key, values, targetType).then(composed => {
        const prompt = composed || scenarioSuggestedInstruction(item.key, targetType, values);
        item.instruction = prompt;
        // race 가드: 해당 단계가 여전히 선택돼 있을 때만 에디터 갱신
        const el = document.getElementById("scenarioInstruction");
        if(el && selectedScenarioItem()?.id === item.id) el.value = prompt;
        saveCompanyScenario();
        renderScenarioList();
      });
    }
    saveCompanyScenario();
    renderScenarioList();
  });
  syncScenarioEditor();
}

function updateSelectedScenarioSource(key){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  const source = scenarioSourceByKey(key);
  if(!item || !source) return;
  const targetType = item.target_type || item.targetType || "company";
  const nextBehaviors = sourceDefaultBehaviors(key);
  item.key = key;
  item.type = source.type;
  item.label = source.label;
  item.behaviors = nextBehaviors;
  item.behavior = item.behaviors[0];
  item.behaviorLabel = sourceBehaviorLabels(key, item.behaviors).join(", ");
  // JSON 기반 최적 프롬프트 우선 적용 (비동기), 즉시 폴백값 설정
  item.instruction = scenarioSuggestedInstruction(key, targetType, nextBehaviors);
  composePrompt(key, nextBehaviors, targetType).then(composed => {
    if(composed){
      item.instruction = composed;
      const el = document.getElementById("scenarioInstruction");
      if(el) el.value = composed;
    }
  });
  setScenarioItemShareRecipients(item, key === "mail_share" ? scenarioItemShareRecipients(item) : []);
  setScenarioItemWebTargets(item, key === "web_search" ? scenarioItemWebTargets(item) : []);
  saveCompanyScenario();
  renderScenarioList();
  syncScenarioEditor();
}

function scenarioServiceKindClass(item){
  const key = item?.key || item?.sourceKey || "";
  const sourceKey = item?.sourceKey || giCommonSourceKey(key);
  const type = item?.type || "";
  if(key === "db_cdw" || sourceKey === "db_cdw" || key === "gi_cdw" || key === "company_profile" || sourceKey === "company_profile") return "scenario-kind-db";
  if(type === "rag" || key.startsWith("rag_") || sourceKey.startsWith("rag_") || key.startsWith("gi_rag")) return "scenario-kind-rag";
  if(type === "report" || type === "validation" || key === "report_generate" || key === "report_validate" || key === "gi_rep" || key === "gi_appr") return "scenario-kind-report";
  if(key === "web_search" || key === "law" || key === "gi_law" || sourceKey === "law") return "scenario-kind-external";
  if(key === "ocr" || key === "file_summary" || key === "translate" || key === "summary" || sourceKey === "ocr") return "scenario-kind-llm";
  return "scenario-kind-analysis";
}

function renderScenarioList(){
  const target = document.getElementById("scenarioList");
  if(!target) return;
  normalizeScenarioOrder();
  target.innerHTML = scenarioItems.map(item => {
    const status = permissionStatus(item.key);
    const locked = status !== "granted";
    const runStatus = stepStatuses[item.id] || "대기";
    const stateClass = {
      "대기": "scenario-state-wait",
      "실행 중": "scenario-state-running",
      "실행중": "scenario-state-running",
      "완료": "scenario-state-done",
      "오류": "scenario-state-error",
      "건너뜀": "scenario-state-skipped",
    }[runStatus] || "scenario-state-wait";
    const kindClass = scenarioServiceKindClass(item);
    const hasResultClass = stepOutputs[item.id] ? "scenario-state-has-result" : "";
    return `
    <li class="scenario-chip ${item.type} ${kindClass} ${stateClass} ${hasResultClass} ${item.id === selectedScenarioId ? "active" : ""} ${locked ? `needs-permission ${status}` : ""}" data-scenario-id="${item.id}" draggable="true">
      <div class="chip-num">${item.order}</div>
      <div class="chip-body">
        <div class="chip-title-row">
          <strong>${escapeHtml(normalizeReportValidationLabel(item.label))}</strong>
          ${locked ? `<em>${permissionLabel(status)}</em>` : ""}
        </div>
        <p>${escapeHtml(scenarioInstructionPreview(item))}</p>
      </div>
    </li>
  `;
  }).join("");

  target.querySelectorAll(".scenario-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      selectedScenarioId = chip.dataset.scenarioId;
      renderScenarioList();
      syncScenarioEditor();
    });
    chip.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", chip.dataset.scenarioId));
    chip.addEventListener("dragover", event => event.preventDefault());
    chip.addEventListener("drop", event => {
      event.preventDefault();
      moveScenarioItem(event.dataTransfer.getData("text/plain"), chip.dataset.scenarioId);
    });
  });

  updateScenarioProgress();
}

function moveScenarioItem(dragId, targetId){
  if(!dragId || !targetId || dragId === targetId) return;
  const from = scenarioItems.findIndex(item => item.id === dragId);
  const to = scenarioItems.findIndex(item => item.id === targetId);
  if(from < 0 || to < 0) return;
  const [moved] = scenarioItems.splice(from,1);
  scenarioItems.splice(to,0,moved);
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
}

function renderScenarioSteps(){
  const target = document.getElementById("scenarioStepAccordion");
  if(!target) return;
  const fullMode = Boolean(expandedResultStepId);
  target.classList.toggle("result-full-active", fullMode);
  target.closest(".scenario-log")?.classList.toggle("result-full-active", fullMode);
  target.closest(".scenario-workbench-v2")?.classList.toggle("result-full-active", fullMode);
  target.closest(".canvas-hub")?.classList.toggle("result-full-active", fullMode);
  if(!scenarioItems.length){
    target.innerHTML = `<div class="empty-state">아직 등록된 분석 단계가 없습니다.</div>`;
    return;
  }
  normalizeScenarioOrder();
  target.innerHTML = scenarioItems.map(item => {
    const open = openedSteps.has(item.id);
    const full = expandedResultStepId === item.id;
    const hasOutput = Boolean(stepOutputs[item.id]);
    const status = stepStatuses[item.id] || "대기";
    const output = stepOutputs[item.id] || "아직 실행 결과가 없습니다.";
    const canRerunFromStep = status === "오류";
    return `
      <section class="scenario-step ${item.type} ${open ? "open" : ""} ${full ? "result-full" : ""}">
        <div class="scenario-step-head">
          <button type="button" class="scenario-step-toggle" data-step-id="${item.id}">
            <span>${escapeHtml(normalizeReportValidationLabel(item.label))}</span>
            <em>${escapeHtml(status)}</em>
            <i>›</i>
          </button>
          ${canRerunFromStep ? `<button type="button" class="scenario-step-rerun" data-rerun-from-step-id="${item.id}">이 단계부터 재실행</button>` : ""}
          <button type="button" class="scenario-step-full" data-full-step-id="${item.id}" ${hasOutput ? "" : "disabled"}>
            ${full ? "전체결과 닫기" : "전체결과보기"}
          </button>
        </div>
        <div class="scenario-step-body markdown-output">${markdownToHtml(output)}</div>
      </section>
    `;
  }).join("");

  target.querySelectorAll(".scenario-step-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.stepId;
      if(openedSteps.has(id)) openedSteps.delete(id);
      else openedSteps.add(id);
      renderScenarioSteps();
    });
  });
  target.querySelectorAll(".scenario-step-rerun").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const index = scenarioItems.findIndex(item => item.id === button.dataset.rerunFromStepId);
      if(index >= 0) runScenarioWorkflow(index);
    });
  });
  target.querySelectorAll(".scenario-step-full").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const id = button.dataset.fullStepId;
      if(button.disabled) return;
      if(expandedResultStepId === id){
        expandedResultStepId = null;
      }else{
        expandedResultStepId = id;
        openedSteps.add(id);
      }
      renderScenarioSteps();
    });
  });
}

function scenarioPayload(items = scenarioItems){
  const hasKey = key => items.some(item => item.key === key);
  const hasSourceType = type => items.some(item => item.type === type);
  const hasRag = items.some(item => item.type.startsWith("rag_"));
  const runItems = items.map(item => ({
    ...item,
    share_recipients: scenarioItemShareRecipients(item),
    shareRecipients: scenarioItemShareRecipients(item),
    web_targets: scenarioItemWebTargets(item),
    webTargets: scenarioItemWebTargets(item),
    target_type: "company",
    targetType: "company",
    targetSupport: scenarioSourceByKey(item.key)?.supports || { company:true, person:true },
    behaviors: Array.isArray(item.behaviors) && item.behaviors.length ? item.behaviors : sourceDefaultBehaviors(item.key),
    behavior: (Array.isArray(item.behaviors) && item.behaviors.length ? item.behaviors : sourceDefaultBehaviors(item.key))[0],
    behaviorLabel: sourceBehaviorLabels(item.key, item.behaviors).join(", "),
    instruction: scenarioRunInstruction(item),
  }));
  const shareRecipients = normalizeEmailIds(runItems
    .filter(item => item.key === "mail_share")
    .flatMap(item => item.share_recipients || [])
    .join(","));
  const webTargets = normalizeWebTargets(runItems
    .filter(item => item.key === "web_search")
    .flatMap(item => item.web_targets || []));
  return {
    execution_mode: "sequential",
    scenario_items: runItems,
    previous_step_outputs: scenarioItems
      .map((item, index) => ({
        ...item,
        order: index + 1,
        output: stepOutputs[item.id],
      }))
      .filter(item => item.output),
    share_recipients: shareRecipients,
    web_targets: webTargets,
    target_type: "company",
    targetType: "company",
    db_query: hasSourceType("db"),
    rag_enabled: hasRag,
    rag_customs_public: hasKey("rag_customs"),
    rag_trade: hasKey("rag_trade"),
    rag_audit: hasKey("rag_audit"),
    rag_investigation: hasKey("rag_investigation"),
    rag_global: hasKey("rag_global"),
    rag_consultation: hasKey("rag_consultation"),
    rag_risk_select: hasKey("rag_risk_select"),
    bigdata_enabled: hasSourceType("bigdata"),
    bigdata_trade_stats: hasKey("bigdata_trade"),
    bigdata_hs_stats: hasKey("bigdata_hs"),
    web_enabled: hasSourceType("web"),
    report_enabled: hasSourceType("report"),
    validation_enabled: hasSourceType("validation"),
  };
}

function updateScenarioProgress(done = null){
  const total = scenarioItems.length;
  const completed = done ?? Object.values(stepStatuses).filter(status => status === "완료").length;
  const count = document.getElementById("scenarioDoneCount");
  const fill = document.getElementById("scenarioProgressFill");
  if(count) count.textContent = `${completed}/${total}`;
  if(fill) fill.style.width = total ? `${(completed / total) * 100}%` : "0";
}

function setScenarioStatus(text){
  const target = document.getElementById("scenarioRunStatus");
  if(target) target.textContent = text;
}

function clearScenarioResults(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  stepOutputs = {};
  stepStatuses = {};
  openedSteps = new Set();
  expandedResultStepId = null;
  latestReport = "보고서가 아직 생성되지 않았습니다.";
  latestValidation = "검증 결과가 아직 없습니다.";
  updateCanvasJobStatus(activeCanvasCompanyId, { label:"대기", done:0, total:scenarioItems.length || 5, pct:0, tone:"wait" });
  setMarkdown(document.getElementById("scenarioReportOutput"), "보고서가 아직 생성되지 않았습니다.");
  setMarkdown(document.getElementById("scenarioValidationOutput"), "검증 결과가 아직 없습니다.");
  setScenarioStatus("대기");
  updateScenarioProgress(0);
  renderScenarioList();
  renderScenarioSteps();
  saveIntermediateResults(activeCanvasCompanyId);
}

/* ═══════════════════════════════════════════════════════════════
   일반수사 / 마약수사 시나리오 워크벤치 초기화
   - sharedScenarioWorkbenchHtml 이 렌더한 동일한 DOM ID 재사용
   - scenarioItems ← aCase.giSteps 변환 후 기존 init 로직 공유
   ═══════════════════════════════════════════════════════════════ */

/* 케이스 단계를 전역 scenarioItems 형식으로 로드 */
function loadCaseStepsToWorkbench(aCase){
  if(!aCase) return;
  // 특수수사: 마약(DRUG-/lawsearch)은 DRUG 템플릿, 외환(FX-/fxsearch)은 전용 FX 템플릿 사용.
  const isFxCase = String(aCase.caseId || "").startsWith("FX-") || aCase.domain === "fxsearch";
  const isDrugCase = isFxCase
    || String(aCase.caseId || "").startsWith("DRUG-")
    || aCase.domain === "lawsearch";   // 특수수사 공통(drs 접두사·person 기본)
  const defaultSteps = isFxCase
    ? (FX_SCENARIO_STEPS[fxDefaultTemplateId(aCase.invTypeId)] || [])
    : isDrugCase
      ? (DRUG_SCENARIO_STEPS[drugDefaultTemplateId(aCase.invTypeId)] || [])
      : (GI_SCENARIO_STEPS[giDefaultTemplateId(aCase.invTypeId)] || []);
  if(!Array.isArray(aCase.giSteps) || !aCase.giSteps.length){
    const prefix = isDrugCase ? "drs" : "gis";
    aCase.giSteps = defaultSteps.map((step, index) => normalizeGiScenarioStep({
      ...step,
      id: `${prefix}_${index}_${uid()}`,
      targetType: aCase.targetType || (isDrugCase ? "person" : "company"),
      target_type: aCase.targetType || (isDrugCase ? "person" : "company"),
    }, index));
    aCase.stepStates = {};
    aCase.stepResults = {};
    aCase.stepExpanded = {};
  }
  const typeLabel = {db:"DB 조회",agent:"AI 서비스",rag:"RAG",report:"보고서",approve:"검증"};
  scenarioItems = (aCase.giSteps || []).map((step, i) => {
    const sk = step.sourceKey || giCommonSourceKey(step.key);
    const caseTargetType = aCase.targetType || (isDrugCase ? "person" : "company");
    return {
      id:           step.id,
      key:          sk,
      type:         step.type,
      label:        normalizeReportValidationLabel(step.label),
      behaviors:    step.behaviors || sourceDefaultBehaviors(sk),
      behavior:     step.behavior  || step.behaviors?.[0] || sourceDefaultBehavior(sk),
      behaviorLabel:sourceBehaviorLabels(sk, step.behaviors).join(", "),
      order:        i + 1,
      targetType:    caseTargetType,
      target_type:   caseTargetType,
      instruction:  step.instruction || step.note || sourceDefaultInstruction(sk, caseTargetType),
    };
  });
  selectedScenarioId = scenarioItems[0]?.id || null;

  // stepStates(wait/run/done/error) → stepStatuses(대기/실행중/완료/오류)
  const stateToLabel = { done:"완료", run:"실행중", error:"오류", wait:"대기" };
  stepStatuses = {};
  stepOutputs  = {};
  Object.entries(aCase.stepStates  || {}).forEach(([id, s]) => { stepStatuses[id] = stateToLabel[s] || "대기"; });
  Object.entries(aCase.stepResults || {}).forEach(([id, r]) => { stepOutputs[id]  = r; });
  openedSteps = new Set();
}

/* 전역 scenarioItems 를 케이스 단계로 저장 */
function saveWorkbenchToCaseSteps(aCase){
  if(!aCase) return;
  const labelToState = { 완료:"done", 실행중:"run", 오류:"error", 대기:"wait" };
  const isDrugCase = String(aCase.caseId || "").startsWith("DRUG-");
  const caseTargetType = aCase.targetType || (isDrugCase ? "person" : "company");
  aCase.giSteps = scenarioItems.map((item, i) => normalizeGiScenarioStep({
    ...item,
    id:         item.id,
    key:        canonicalGiStepKey(item.key) || item.key,
    sourceKey:  item.key,
    note:       item.instruction,
    targetType: caseTargetType,
    target_type: caseTargetType,
  }, i));
  aCase.stepStates  = {};
  aCase.stepResults = {};
  Object.entries(stepStatuses).forEach(([id, s]) => { aCase.stepStates[id]  = labelToState[s] || "wait"; });
  Object.entries(stepOutputs ).forEach(([id, r]) => { aCase.stepResults[id] = r; });
}

/* 일반수사 워크벤치 초기화 */
function initGiScenarioWorkbench(){
  const aCase = activeGenInvCase();
  if(!aCase) return;
  loadCaseStepsToWorkbench(aCase);

  const sourceSelect = document.getElementById("scenarioQuickSourceSelect");
  if(!sourceSelect) return;
  sourceSelect.innerHTML = scenarioSourceOptionsHtml();

  if(scenarioInitialized) return;
  scenarioInitialized = true;

  document.querySelector("[data-scenario-quick-add]")?.addEventListener("click", () => {
    const key = sourceSelect.value;
    const src = scenarioSourceByKey(key);
    if(!src) return;
    const behaviors = selectedBehaviorValues();
    const targetType = aCase.targetType || "company";
    const item = normalizeScenarioItem({
      id: uid(), key, type: src.type, label: src.label,
      behaviors: behaviors.length ? behaviors : sourceDefaultBehaviors(key),
      targetType,
      target_type: targetType,
      instruction: document.getElementById("scenarioInstruction")?.value.trim() || scenarioSuggestedInstruction(key, targetType, behaviors.length ? behaviors : sourceDefaultBehaviors(key)),
      shareRecipients: key === "mail_share" ? scenarioItemShareRecipients(shareEmailScopeItem("scenario")) : [],
      webTargets: key === "web_search" ? scenarioItemWebTargets(shareEmailScopeItem("scenario")) : [],
    }, scenarioItems.length);
    scenarioItems.push(item);
    selectedScenarioId = item.id;
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
    renderScenarioList();
    renderScenarioSteps();
    syncScenarioEditor();
  });

  document.querySelector("[data-scenario-quick-delete]")?.addEventListener("click", () => {
    if(!selectedScenarioId) return;
    scenarioItems = scenarioItems.filter(i => i.id !== selectedScenarioId);
    delete stepStatuses[selectedScenarioId];
    delete stepOutputs[selectedScenarioId];
    selectedScenarioId = scenarioItems[0]?.id || null;
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
    renderScenarioList();
    renderScenarioSteps();
    syncScenarioEditor();
  });

  document.getElementById("scenarioTemplateApplyButton")?.addEventListener("click", () => {
    const tplId = document.getElementById("scenarioTemplateSelect")?.value;
    if(!tplId) return;
    const tpl = giScenarioTemplates.find(t => t.id === tplId);
    if(!tpl) return;
    scenarioItems = tpl.items.map((item, i) => normalizeScenarioItem({
      ...item,
      id:uid(),
      targetType: aCase.targetType || "company",
      target_type: aCase.targetType || "company",
    }, i));
    selectedScenarioId = scenarioItems[0]?.id || null;
    stepStatuses = {};
    stepOutputs  = {};
    openedSteps  = new Set();
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
    renderScenarioList();
    renderScenarioSteps();
    syncScenarioEditor();
    setScenarioStatus("템플릿 적용됨");
  });

  document.getElementById("scenarioSaveButton")?.addEventListener("click", () => {
    const name = prompt("저장할 템플릿 이름을 입력하세요:", `${aCase.targetName} 수사 템플릿`);
    if(!name?.trim()) return;
    const newTemplate = {
      id:`gi-custom-${uid()}`, name:name.trim(),
      description:`${new Date().toLocaleDateString("ko-KR")} 저장 · ${scenarioItems.length}단계`,
      items: scenarioItems.map(item=>({...item, id:uid()})),
      isCustom:true, ownerUserId:currentUserId, ownerName:currentUser().name, shared:true,
    };
    giScenarioTemplates.unshift(newTemplate);
    saveCanvasState();
    setScenarioStatus("템플릿 저장됨");
  });

  document.getElementById("scenarioRunButton")?.addEventListener("click", () => {
    if(!addPendingScenarioWebTarget()) return;
    const pendingShareEmail = document.getElementById("scenarioShareEmailInput")?.value || "";
    if(pendingShareEmail.trim() && !addShareEmailsToScope("scenario", pendingShareEmail)) return;
    saveWorkbenchToCaseSteps(aCase);
    const toRun = scenarioItems.filter(s => (aCase.stepStates||{})[s.id] !== "done");
    if(!ensureMailShareRecipients(toRun)) return;
    if(!ensureDirectUrlTargets(toRun)) return;
    giStreamSteps(aCase, aCase.giSteps.filter(s => toRun.some(r => r.id === s.id)));
  });

  document.getElementById("scenarioClearButton")?.addEventListener("click", () => {
    aCase.stepStates  = {};
    aCase.stepResults = {};
    stepStatuses = {};
    stepOutputs  = {};
    openedSteps  = new Set();
    saveCanvasState();
    updateScenarioProgress(0);
    renderScenarioList();
    renderScenarioSteps();
    setScenarioStatus("대기");
  });

  sourceSelect.addEventListener("change", event => {
    updateSelectedScenarioSource(event.target.value);
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
  });
  document.getElementById("scenarioApplyPromptButton")?.addEventListener("click", () => {
    applySelectedScenarioPrompt();
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
  });
  document.getElementById("scenarioValidatePromptButton")?.addEventListener("click", () => {
    validateSelectedScenarioPrompt();
  });

  syncScenarioEditor();
  renderScenarioList();
  renderScenarioSteps();
}

/* 마약수사 워크벤치 초기화 */
function initDrugScenarioWorkbench(){
  const aCase = activeDrugCase();
  if(!aCase) return;
  loadCaseStepsToWorkbench(aCase);

  const sourceSelect = document.getElementById("scenarioQuickSourceSelect");
  if(!sourceSelect) return;
  sourceSelect.innerHTML = scenarioSourceOptionsHtml();

  if(scenarioInitialized) return;
  scenarioInitialized = true;

  document.querySelector("[data-scenario-quick-add]")?.addEventListener("click", () => {
    const key = sourceSelect.value;
    const src = scenarioSourceByKey(key);
    if(!src) return;
    const behaviors = selectedBehaviorValues();
    const targetType = aCase.targetType || "person";
    const item = normalizeScenarioItem({
      id:uid(), key, type:src.type, label:src.label,
      behaviors: behaviors.length ? behaviors : sourceDefaultBehaviors(key),
      targetType,
      target_type: targetType,
      instruction: document.getElementById("scenarioInstruction")?.value.trim() || scenarioSuggestedInstruction(key, targetType, behaviors.length ? behaviors : sourceDefaultBehaviors(key)),
      shareRecipients: key === "mail_share" ? scenarioItemShareRecipients(shareEmailScopeItem("scenario")) : [],
      webTargets: key === "web_search" ? scenarioItemWebTargets(shareEmailScopeItem("scenario")) : [],
    }, scenarioItems.length);
    scenarioItems.push(item);
    selectedScenarioId = item.id;
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
    renderScenarioList();
    renderScenarioSteps();
    syncScenarioEditor();
  });

  document.querySelector("[data-scenario-quick-delete]")?.addEventListener("click", () => {
    if(!selectedScenarioId) return;
    scenarioItems = scenarioItems.filter(i => i.id !== selectedScenarioId);
    delete stepStatuses[selectedScenarioId];
    delete stepOutputs[selectedScenarioId];
    selectedScenarioId = scenarioItems[0]?.id || null;
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
    renderScenarioList();
    renderScenarioSteps();
    syncScenarioEditor();
  });

  document.getElementById("scenarioTemplateApplyButton")?.addEventListener("click", () => {
    const tplId = document.getElementById("scenarioTemplateSelect")?.value;
    if(!tplId || !DRUG_SCENARIO_STEPS[tplId]) return;
    const defaults = DRUG_SCENARIO_STEPS[tplId];
    scenarioItems = defaults.map((s, i) => normalizeScenarioItem({
      ...s,
      id:uid(),
      targetType: aCase.targetType || "person",
      target_type: aCase.targetType || "person",
    }, i));
    selectedScenarioId = scenarioItems[0]?.id || null;
    stepStatuses = {};
    stepOutputs  = {};
    openedSteps  = new Set();
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
    renderScenarioList();
    renderScenarioSteps();
    syncScenarioEditor();
    setScenarioStatus("템플릿 적용됨");
  });

  document.getElementById("scenarioSaveButton")?.addEventListener("click", () => {
    const name = prompt("저장할 템플릿 이름을 입력하세요:", `${aCase.targetName} 마약수사 템플릿`);
    if(!name?.trim()) return;
    setScenarioStatus("템플릿 저장됨");
  });

  document.getElementById("scenarioRunButton")?.addEventListener("click", () => {
    if(!addPendingScenarioWebTarget()) return;
    const pendingShareEmail = document.getElementById("scenarioShareEmailInput")?.value || "";
    if(pendingShareEmail.trim() && !addShareEmailsToScope("scenario", pendingShareEmail)) return;
    saveWorkbenchToCaseSteps(aCase);
    const toRun = aCase.giSteps?.filter(s => (aCase.stepStates||{})[s.id] !== "done") || [];
    const scenarioRunItems = scenarioItems.filter(s => toRun.some(r => r.id === s.id));
    if(!ensureMailShareRecipients(scenarioRunItems)) return;
    if(!ensureDirectUrlTargets(scenarioRunItems)) return;
    if(toRun.length) drugStreamSteps(aCase, toRun);
  });

  document.getElementById("scenarioClearButton")?.addEventListener("click", () => {
    aCase.stepStates  = {};
    aCase.stepResults = {};
    stepStatuses = {};
    stepOutputs  = {};
    openedSteps  = new Set();
    saveCanvasState();
    updateScenarioProgress(0);
    renderScenarioList();
    renderScenarioSteps();
    setScenarioStatus("대기");
  });

  sourceSelect.addEventListener("change", event => {
    updateSelectedScenarioSource(event.target.value);
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
  });
  document.getElementById("scenarioApplyPromptButton")?.addEventListener("click", () => {
    applySelectedScenarioPrompt();
    saveWorkbenchToCaseSteps(aCase);
    saveCanvasState();
  });
  document.getElementById("scenarioValidatePromptButton")?.addEventListener("click", () => {
    validateSelectedScenarioPrompt();
  });

  syncScenarioEditor();
  renderScenarioList();
  renderScenarioSteps();
}

function runScenarioWorkflow(startIndex = 0){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 분석할 수 있습니다.");
    return;
  }
  if(!scenarioItems.length){
    alert("분석 시나리오 단계를 먼저 추가하세요.");
    return;
  }
  const companyId = activeCanvasCompanyId;
  if(!companyId){
    alert("분석 대상 기업을 선택하세요.");
    return;
  }
  const runStartIndex = Math.max(0, Math.min(Number(startIndex) || 0, scenarioItems.length - 1));
  const candidateItems = scenarioItems.slice(runStartIndex);
  // 첫 번째 권한 없는 단계 찾기 → 그 이전 단계까지만 실행
  const firstLockedIndex = candidateItems.findIndex(item => !hasPermission(item.key));
  const runnableItems = firstLockedIndex >= 0 ? candidateItems.slice(0, firstLockedIndex) : candidateItems;
  const skippedItems  = firstLockedIndex >= 0 ? candidateItems.slice(firstLockedIndex) : [];

  if(!runnableItems.length){
    alert("실행 가능한 단계가 없습니다.\n첫 번째 단계에 권한이 없어 실행할 수 없습니다.\n권한 요청 후 승인되면 실행할 수 있습니다.");
    return;
  }
  const pendingShareEmail = document.getElementById("scenarioShareEmailInput")?.value || "";
  if(!addPendingScenarioWebTarget()) return;
  if(pendingShareEmail.trim() && !addShareEmailsToScope("scenario", pendingShareEmail)) return;
  const resumeRun = () => runScenarioWorkflow(runStartIndex);
  if(!ensureMailShareRecipients(runnableItems, resumeRun)) return;
  if(!ensureDirectUrlTargets(runnableItems, resumeRun)) return;
  const clarifySlot = document.getElementById("scenarioClarify");
  if(clarifySlot) clarifySlot.innerHTML = "";

  if(scenarioEventSource) scenarioEventSource.close();
  if(runStartIndex === 0){
    stepOutputs = {};
    stepStatuses = {};
    openedSteps = new Set();
  }else{
    scenarioItems.slice(runStartIndex).forEach(item => {
      delete stepOutputs[item.id];
      delete stepStatuses[item.id];
      openedSteps.delete(item.id);
    });
  }
  expandedResultStepId = null;

  // 권한 없는 단계는 미리 "건너뜀"으로 표시
  skippedItems.forEach(item => {
    stepStatuses[item.id] = "건너뜀";
    stepOutputs[item.id] = `권한이 없어 실행되지 않았습니다. (${permissionLabel(permissionStatus(item.key))})`;
  });

  const priorCompleted = scenarioItems.slice(0, runStartIndex).filter(item => stepStatuses[item.id] === "완료").length;
  let completed = priorCompleted;
  const runButton = document.getElementById("scenarioRunButton");
  runButton.disabled = true;
  setScenarioStatus("실행 중");
  updateCanvasJobStatus(companyId, { label:"실행 중", done:completed, total:scenarioItems.length, pct:scenarioItems.length ? Math.round((completed / scenarioItems.length) * 100) : 0, tone:"running" });
  updateScenarioProgress(completed);
  if(runStartIndex === 0){
    setMarkdown(document.getElementById("scenarioReportOutput"), "보고서 생성 대기 중입니다.");
    setMarkdown(document.getElementById("scenarioValidationOutput"), "검증 대기 중입니다.");
    latestReport = "보고서 생성 대기 중입니다.";
    latestValidation = "검증 대기 중입니다.";
  }
  renderScenarioList();
  renderScenarioSteps();

  const url = `/api/run?company_id=${encodeURIComponent(companyId)}&scenario=${encodeURIComponent(JSON.stringify(scenarioPayload(runnableItems)))}`;
  scenarioEventSource = new EventSource(url);

  scenarioEventSource.addEventListener("workflow", event => {
    const data = JSON.parse(event.data);
    if(data.status === "completed"){
      setScenarioStatus("완료");
      saveRunArchive(companyId);
      updateCanvasJobStatus(companyId, { label:"완료", done:scenarioItems.length - skippedItems.length, total:scenarioItems.length, pct:skippedItems.length ? Math.round(((scenarioItems.length - skippedItems.length) / scenarioItems.length) * 100) : 100, tone:"done" });
      runButton.disabled = false;
      scenarioEventSource.close();
    }
    if(data.status === "failed"){
      setScenarioStatus("실패");
      updateCanvasJobStatus(companyId, { label:"오류", done:completed, total:scenarioItems.length, pct:scenarioItems.length ? Math.round((completed / scenarioItems.length) * 100) : 0, tone:"review" });
      runButton.disabled = false;
      scenarioEventSource.close();
    }
  });

  scenarioEventSource.addEventListener("step", event => {
    const data = JSON.parse(event.data);
    const runIndex = runnableItems.findIndex((item, itemIndex) => data.key === `${item.type}_agent_${itemIndex + 1}` || data.label === item.label);
    const index = runIndex >= 0 ? scenarioItems.findIndex(item => item.id === runnableItems[runIndex].id) : scenarioItems.findIndex(item => data.label === item.label);
    const item = index >= 0 ? scenarioItems[index] : null;
    if(!item) return;
    if(data.status === "running"){
      stepStatuses[item.id] = "실행 중";
      openedSteps.add(item.id);
      renderScenarioList();
    }
    if(data.status === "done"){
      completed += 1;
      stepStatuses[item.id] = "완료";
      stepOutputs[item.id] = data.output || "결과 없음";
      openedSteps.add(item.id);
      updateScenarioProgress(completed);
      updateCanvasJobStatus(companyId, { label:"실행 중", done:completed, total:scenarioItems.length, pct:scenarioItems.length ? Math.round((completed / scenarioItems.length) * 100) : 0, tone:"running" });
      renderScenarioList();
      if(data.result_key === "final_report"){
        latestReport = data.output || "보고서 없음";
        const company = activeCanvasCompany();
        const companyName = company ? `${company.company_name} (${company.company_id})` : activeCanvasCompanyId;
        setMarkdown(document.getElementById("scenarioReportOutput"), ensureReportRequiredSections(latestReport, "customs", { targetName: companyName }));
      }
      if(data.result_key === "validation_result"){
        latestValidation = data.output || "검증 결과 없음";
        setMarkdown(document.getElementById("scenarioValidationOutput"), latestValidation);
      }
      // 단계 완료마다 중간 결과 저장
      saveIntermediateResults(companyId);
    }
    if(data.status === "error"){
      stepStatuses[item.id] = "오류";
      stepOutputs[item.id] = data.error || "오류가 발생했습니다.";
      openedSteps.add(item.id);
      setScenarioStatus("오류");
      updateCanvasJobStatus(companyId, { label:"오류", done:completed, total:scenarioItems.length, pct:scenarioItems.length ? Math.round((completed / scenarioItems.length) * 100) : 0, tone:"review" });
      runButton.disabled = false;
      scenarioEventSource.close();
      saveIntermediateResults(companyId);
      renderScenarioList();
    }
    renderScenarioSteps();
  });

  scenarioEventSource.onerror = () => {
    setScenarioStatus("연결 종료");
    Object.entries(stepStatuses).forEach(([id, status]) => {
      if(status === "실행 중" || status === "실행중"){
        stepStatuses[id] = "오류";
        if(!stepOutputs[id]) stepOutputs[id] = "연결이 종료되어 실행 결과를 확인하지 못했습니다.";
      }
    });
    runButton.disabled = false;
    if(scenarioEventSource) scenarioEventSource.close();
    renderScenarioList();
    renderScenarioSteps();
  };
}

/* 선택한 AI 서비스 한 단계만 별도로 실행 (단계별 자동실행과는 별도의 SSE 연결 사용) */
function runSingleScenarioItem(item){
  if(!item) return;
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 분석할 수 있습니다.");
    return;
  }
  const companyId = activeCanvasCompanyId;
  if(!companyId){
    alert("분석 대상 기업을 선택하세요.");
    return;
  }
  if(!hasPermission(item.key)){
    alert(`이 AI 서비스를 실행할 권한이 없습니다. (${permissionLabel(permissionStatus(item.key))})`);
    return;
  }
  const resumeSingle = () => runSingleScenarioItem(item);
  if(!ensureMailShareRecipients([item], resumeSingle)) return;
  if(!ensureDirectUrlTargets([item], resumeSingle)) return;

  if(scenarioSingleEventSource){ try{ scenarioSingleEventSource.close(); }catch(e){} scenarioSingleEventSource = null; }

  const runButton = document.getElementById("scenarioRunSelectedButton");
  if(runButton) runButton.disabled = true;
  stepStatuses[item.id] = "실행 중";
  openedSteps.add(item.id);
  renderScenarioList();
  renderScenarioSteps();

  const url = `/api/run?company_id=${encodeURIComponent(companyId)}&scenario=${encodeURIComponent(JSON.stringify(scenarioPayload([item])))}`;
  scenarioSingleEventSource = new EventSource(url);

  const finish = () => {
    if(scenarioSingleEventSource){ scenarioSingleEventSource.close(); scenarioSingleEventSource = null; }
    if(runButton) runButton.disabled = !selectedScenarioItem();
  };

  scenarioSingleEventSource.addEventListener("step", event => {
    const data = JSON.parse(event.data);
    if(data.status === "running"){
      stepStatuses[item.id] = "실행 중";
      renderScenarioList();
    }
    if(data.status === "done"){
      stepStatuses[item.id] = "완료";
      stepOutputs[item.id] = data.output || "결과 없음";
      openedSteps.add(item.id);
      saveIntermediateResults(companyId);
      renderScenarioList();
      renderScenarioSteps();
    }
    if(data.status === "error"){
      stepStatuses[item.id] = "오류";
      stepOutputs[item.id] = data.error || "오류가 발생했습니다.";
      openedSteps.add(item.id);
      saveIntermediateResults(companyId);
      renderScenarioList();
      renderScenarioSteps();
    }
  });

  scenarioSingleEventSource.addEventListener("workflow", event => {
    const data = JSON.parse(event.data);
    if(data.status === "completed" || data.status === "failed") finish();
  });

  scenarioSingleEventSource.onerror = () => {
    if(stepStatuses[item.id] === "실행 중"){
      stepStatuses[item.id] = "오류";
      if(!stepOutputs[item.id]) stepOutputs[item.id] = "연결이 종료되어 실행 결과를 확인하지 못했습니다.";
    }
    finish();
    renderScenarioList();
    renderScenarioSteps();
  };
}

function addWorkTab(page){
  const tabs = document.getElementById("workTabs");
  let tab = tabs.querySelector(`[data-page="${page}"]`);
  if(!tab){
    tab = document.createElement("button");
    tab.className = "work-tab";
    tab.dataset.page = page;
    const label = document.createElement("span");
    label.textContent = pageNames[page] || analysisScenarioForPage(page)?.title || page;
    tab.appendChild(label);
    if(page !== "home"){
      const close = document.createElement("span");
      close.className = "work-tab-close";
      close.dataset.closeTab = page;
      close.textContent = "×";
      tab.appendChild(close);
    }
    // AI Agentic 서비스 탭은 항상 우측 끝에 고정 — 새 업무분석 탭은 그 앞에 삽입한다.
    const agenticTab = tabs.querySelector('.work-tab[data-page="agentic"]');
    if(agenticTab && page !== "agentic"){
      tabs.insertBefore(tab, agenticTab);
    }else{
      tabs.appendChild(tab);
    }
  }
}

function render(page="home"){
  // AI Agentic 서비스는 부서 관리자 전용 — 비관리자는 My AI 분석으로 폴백
  if(page === "agentic" && !isCurrentUserAdmin()) page = "home";
  currentPage = page;
  const pageTemplate = analysisTemplateForPage(page);
  addWorkTab(page);
  document.querySelectorAll(".nav-item,.my-analysis,.work-tab,.quick-card").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(`[data-page="${page}"]`).forEach(b=>b.classList.add("active"));
  const contentEl = document.getElementById("content");
  const fillPage = page === "agentic" ||
                   (page === "canvas" && canvasTab === "report") ||
                   ((page === "investigation" || pageTemplate === "customs") && customsState.investigationTab === "scenario") ||
                   ((page === "generalinv" || pageTemplate === "general-investigation") && (generalInvestigationState.generalInvTab === "scenario" || generalInvestigationState.generalInvTab === "workbench")) ||
                   (isSpecialInvestigationPage(page) && (specialInvestigationState.drugInvTab === "scenario" || specialInvestigationState.drugInvTab === "network" || specialInvestigationState.drugInvTab === "forensic" || specialInvestigationState.drugInvTab === "report"));
  contentEl.classList.toggle("content-fill", fillPage);
  contentEl.innerHTML = pages[page] ? pages[page]() : (customAnalysisPage(page) || pages.home());
  if(page === "home" || page === "case"){
    // 국제정보 분석(case)은 My AI 분석과 동일 구성 — 같은 코칭/실행 초기화 사용
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    coachInitHome();
    homeRenderShareEmailPanel();
  }
  if(page === "profile"){
    loadScenarioCompanies();
    initRiskDashboard();
  }
  if(page === "agentic"){
    initAgenticBuilder();
  }
  if(page === "generalinv" || pageTemplate === "general-investigation"){
    initGenInvSearch();
    if(!scenarioCompanies.length) loadScenarioCompanies();
    if(generalInvestigationState.showGenInvRegForm && generalInvestigationState.giRegTargetType === "person") loadRiskPersons();
    if(generalInvestigationState.generalInvTab === "profile"){
      const companyId = generalInvCompanyId(activeGenInvCase());
      if(companyId) loadCompanyDetail(companyId);
    }
    if(generalInvestigationState.generalInvTab === "data"){
      const companyId = generalInvCompanyId(activeGenInvCase());
      if(companyId && !scenarioCompanies.length) loadScenarioCompanies();
    }
    // 분석 시나리오 워크벤치 탭(AI서비스 분석 작업) — 대표 id "scenario"(workbench 별칭) 모두 처리
    if(generalInvestigationState.generalInvTab === "scenario" || generalInvestigationState.generalInvTab === "workbench"){
      scenarioInitialized = false;
      initGiScenarioWorkbench();
    }
    // 템플릿 편집 탭 — 관세 편집기를 일반수사 도메인으로 재사용 (조직 관리자 전용)
    if(generalInvestigationState.generalInvTab === "templates" && isCurrentUserAdmin()){
      templateEditorDomain = "general";
      templateEditorInitialized = false;
      initTemplateEditor();
    }
  }
  if(isSpecialInvestigationPage(page)){
    const drugCtx = drugCaseContext();
    if(drugCtx?.targetType === "company" || specialInvestigationState.drugInvTab === "data" || specialInvestigationState.drugInvTab === "profile"){
      if(!scenarioCompanies.length) loadScenarioCompanies();
    }
    if((drugCtx?.targetType === "person" || specialInvestigationState.drugInvTab === "profile") && !riskPersons.length && !riskPersonsLoading){
      loadRiskPersons();
    }
    // 분석 시나리오 워크벤치 탭 — 공통 init
    if(specialInvestigationState.drugInvTab === "scenario"){
      scenarioInitialized = false;
      initDrugScenarioWorkbench();
    }
    // 템플릿 편집 탭 — 관세 편집기를 특수수사 도메인으로 재사용 (조직 관리자 전용)
    if(specialInvestigationState.drugInvTab === "templates" && isCurrentUserAdmin()){
      templateEditorDomain = page === "fxsearch" ? "fx" : "drug";
      templateEditorInitialized = false;
      initTemplateEditor();
    }
  }
  if(page === "investigation" || pageTemplate === "customs"){
    if(!scenarioCompanies.length) loadScenarioCompanies();
    if(customsState.investigationTab === "ongoing" && showScenarioCompanyPicker) loadScenarioCompanies();
    if(customsState.investigationTab === "dashboard") initRiskDashboard();
    if(customsState.investigationTab === "profile")   loadCompanyDetail(activeCanvasCompanyId);
    if(customsState.investigationTab === "scenario"){
      scenarioInitialized = false;
      initScenarioWorkbench();
    }
    if(customsState.investigationTab === "templates"){
      templateEditorInitialized = false;
      initTemplateEditor();
    }
  }
  if(page === "canvas" && canvasTab === "scenario"){
    scenarioInitialized = false;
    initScenarioWorkbench();
  }
  if(page === "canvas" && canvasTab === "templates"){
    templateEditorInitialized = false;
    initTemplateEditor();
  }
  if(page === "canvas" && canvasTab === "overview" && showScenarioCompanyPicker){
    loadScenarioCompanies();
  }
  if(page === "canvas" && canvasTab === "profile"){
    loadCompanyDetail(activeCanvasCompanyId);
  }
}

document.addEventListener("input", (event) => {
  if(event.target && event.target.id === "drugSearchInput"){
    specialInvestigationState.drugCaseFilter = event.target.value;
    renderSpecialInvestigation();
    return;
  }
});

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
  const btn = event.target?.closest?.("[data-home-run-single]");
  if(btn){ homeRunSingleService(btn.dataset.homeRunSingle, btn); }
});

// 입력값 칩 클릭 → 프롬프트 커서 위치에 [입력값 이름] 변수 삽입
document.addEventListener("click", (event) => {
  const chip = event.target?.closest?.("[data-home-insert-token]");
  if(chip){ homeInsertTokenIntoPrompt(chip.dataset.homeInsertToken, chip.dataset.label); }
});

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

document.addEventListener("change", (event) => {
  if(event.target && event.target.id === "coachFileInput"){
    coachHandleFileSelect(event.target.files);
    event.target.value = "";  // 같은 파일 재선택 가능하게
  }

  // 신규 업무분석 템플릿 select 제거됨 — 고정값 "special-investigation" 사용

  /* ── 신규: 기본 진입 탭 변경 ── */
  if(event.target.dataset?.sbNewDefaultTab && isCurrentUserSuperAdmin()){
    sbNewDraft.defaultTab = event.target.value;
    return; // 재렌더 불필요
  }

  /* ── Pool UI: 기본 진입 탭 select 변경 즉시 반영 ── */
  const sbDefaultTab = event.target.dataset?.sbDefaultTab;
  if(sbDefaultTab && isCurrentUserSuperAdmin()){
    const page = sbDefaultTab;
    const scenario = scenarioBuilderConfig.analysisScenarios?.[page];
    if(scenario){
      scenarioBuilderConfig = {
        ...scenarioBuilderConfig,
        analysisScenarios: {
          ...scenarioBuilderConfig.analysisScenarios,
          [page]: { ...scenario, defaultTab: event.target.value },
        },
      };
    }
  }
});

registerCustomsEvents({
  get showInvNewJobForm(){ return customsState.showInvNewJobForm; },
  set showInvNewJobForm(value){ customsState.showInvNewJobForm = value; },
  get scenarioCompanies(){ return scenarioCompanies; },
  get activeCanvasCompanyId(){ return activeCanvasCompanyId; },
  set activeCanvasCompanyId(value){ activeCanvasCompanyId = value; },
  get activeScenarioTemplateId(){ return activeScenarioTemplateId; },
  set activeScenarioTemplateId(value){ activeScenarioTemplateId = value; },
  get scenarioItems(){ return scenarioItems; },
  set scenarioItems(value){ scenarioItems = value; },
  get selectedScenarioId(){ return selectedScenarioId; },
  set selectedScenarioId(value){ selectedScenarioId = value; },
  get companyScenarios(){ return companyScenarios; },
  get stepOutputs(){ return stepOutputs; },
  set stepOutputs(value){ stepOutputs = value; },
  get stepStatuses(){ return stepStatuses; },
  set stepStatuses(value){ stepStatuses = value; },
  get openedSteps(){ return openedSteps; },
  set openedSteps(value){ openedSteps = value; },
  get expandedResultStepId(){ return expandedResultStepId; },
  set expandedResultStepId(value){ expandedResultStepId = value; },
  get scenarioInitialized(){ return scenarioInitialized; },
  set scenarioInitialized(value){ scenarioInitialized = value; },
  get scenarioLoadedForCompany(){ return scenarioLoadedForCompany; },
  set scenarioLoadedForCompany(value){ scenarioLoadedForCompany = value; },
  get invArchiveOpen(){ return customsState.invArchiveOpen; },
  set invArchiveOpen(value){ customsState.invArchiveOpen = value; },
  get investigationTab(){ return customsState.investigationTab; },
  set investigationTab(value){ customsState.investigationTab = value; },
  get showScenarioCompanyPicker(){ return showScenarioCompanyPicker; },
  set showScenarioCompanyPicker(value){ showScenarioCompanyPicker = value; },
  archiveCanvasJob,
  canvasJobs,
  createCanvasJob,
  findCompanyById,
  loadCompanyRunArchive,
  loadScenarioCompanies,
  normalizeScenarioItem,
  patchCanvasJob,
  removeCanvasJobForCurrentUser,
  render,
  restoreRunArchiveToWorkspace,
  saveCanvasState,
  scenarioTemplateById,
  uid,
});

registerGeneralInvestigationEvents({
  get giRegTargetType(){ return generalInvestigationState.giRegTargetType; },
  set giRegTargetType(value){ generalInvestigationState.giRegTargetType = value; },
  get showGenInvRegForm(){ return generalInvestigationState.showGenInvRegForm; },
  set showGenInvRegForm(value){ generalInvestigationState.showGenInvRegForm = value; },
  get scenarioCompanies(){ return scenarioCompanies; },
  get customGenInvCases(){ return generalInvestigationState.customGenInvCases; },
  get defaultGenInvCases(){ return defaultGenInvCases; },
  get archivedGenInvCases(){ return generalInvestigationState.archivedGenInvCases; },
  get GEN_INV_TYPES(){ return GEN_INV_TYPES; },
  get activeGenInvCaseId(){ return generalInvestigationState.activeGenInvCaseId; },
  set activeGenInvCaseId(value){ generalInvestigationState.activeGenInvCaseId = value; },
  get generalInvTab(){ return generalInvestigationState.generalInvTab; },
  set generalInvTab(value){ generalInvestigationState.generalInvTab = value; },
  get activeGiStepId(){ return generalInvestigationState.activeGiStepId; },
  set activeGiStepId(value){ generalInvestigationState.activeGiStepId = value; },
  get genInvArchiveOpen(){ return generalInvestigationState.genInvArchiveOpen; },
  set genInvArchiveOpen(value){ generalInvestigationState.genInvArchiveOpen = value; },
  get giRunEventSource(){ return giRunEventSource; },
  set giRunEventSource(value){ giRunEventSource = value; },
  get currentUserId(){ return currentUserId; },
  activeGenInvCase,
  activeGiCaseSteps,
  allGenInvCases,
  currentUser,
  currentUserGroup,
  findCompanyById,
  giCommonSourceKey,
  giSourceByKey,
  giStreamSteps,
  loadRiskPersons,
  loadScenarioCompanies,
  normalizeGiScenarioStep,
  render,
  requestPermissions,
  riskPersonById,
  saveCanvasState,
  sourceDefaultBehaviors,
  sourceDefaultInstruction,
  uid,
  giScenarioTemplates,
});

registerSpecialInvestigationEvents({
  get drugInvTab(){ return specialInvestigationState.drugInvTab; },
  set drugInvTab(value){ specialInvestigationState.drugInvTab = value; },
  get drugDataSubTab(){ return specialInvestigationState.drugDataSubTab; },
  set drugDataSubTab(value){ specialInvestigationState.drugDataSubTab = value; },
  get drugNetworkSubTab(){ return specialInvestigationState.drugNetworkSubTab; },
  set drugNetworkSubTab(value){ specialInvestigationState.drugNetworkSubTab = value; },
  get drugForensicSubTab(){ return specialInvestigationState.drugForensicSubTab; },
  set drugForensicSubTab(value){ specialInvestigationState.drugForensicSubTab = value; },
  get drugReportSubTab(){ return specialInvestigationState.drugReportSubTab; },
  set drugReportSubTab(value){ specialInvestigationState.drugReportSubTab = value; },
  get activeDrugStepId(){ return specialInvestigationState.activeDrugStepId; },
  set activeDrugStepId(value){ specialInvestigationState.activeDrugStepId = value; },
  get drugAccordionOpen(){ return specialInvestigationState.drugAccordionOpen; },
  get activeDrugCaseId(){ return specialInvestigationState.activeDrugCaseId; },
  set activeDrugCaseId(value){ specialInvestigationState.activeDrugCaseId = value; },
  get defaultDrugInvCases(){ return defaultDrugInvCases; },
  get archivedDrugCases(){ return specialInvestigationState.archivedDrugCases; },
  get drugArchiveOpen(){ return specialInvestigationState.drugArchiveOpen; },
  set drugArchiveOpen(value){ specialInvestigationState.drugArchiveOpen = value; },
  get drugRegTargetType(){ return specialInvestigationState.drugRegTargetType; },
  set drugRegTargetType(value){ specialInvestigationState.drugRegTargetType = value; },
  get showDrugNewCaseForm(){ return specialInvestigationState.showDrugNewCaseForm; },
  set showDrugNewCaseForm(value){ specialInvestigationState.showDrugNewCaseForm = value; },
  get scenarioCompanies(){ return scenarioCompanies; },
  get drugInvSelectedTarget(){ return specialInvestigationState.drugInvSelectedTarget; },
  set drugInvSelectedTarget(value){ specialInvestigationState.drugInvSelectedTarget = value; },
  get GI_STEP_SOURCES(){ return GI_STEP_SOURCES; },
  get currentUserId(){ return currentUserId; },
  getCurrentPage: () => currentPage,
  invTypesForDomain,
  activeDrugCase,
  activeDrugCaseSteps,
  currentUser,
  drugStreamSteps,
  escapeHtml,
  findCompanyById,
  loadRiskPersons,
  loadScenarioCompanies,
  normalizeGiScenarioStep,
  renderSpecialInvestigation,
  requestPermissions,
  resetDrugCaseSubTabs,
  riskPersonById,
  saveCanvasState,
  sourceDefaultBehaviors,
  sourceDefaultInstruction,
  uid,
  DRUG_SCENARIO_STEPS,
  giCommonSourceKey,
  getDrugRunEventSource: () => drugRunEventSource,
  drugScenarioTemplateOptionsHtml: (currentInvTypeId) =>
    DRUG_INV_TYPES.map(t =>
      `<option value="${escapeHtml(t.id)}"${t.id === drugDefaultTemplateId(currentInvTypeId) ? " selected" : ""}>${t.num} ${escapeHtml(t.label)}</option>`
    ).join(""),
});

document.addEventListener("click", (event)=>{
  const closeDashboardDrawer = () => {
    document.querySelector(".home-dashboard-drawer")?.classList.remove("open");
    document.querySelector(".home-dashboard-drawer")?.setAttribute("aria-hidden", "true");
    const backdrop = document.querySelector(".home-dashboard-backdrop");
    if(backdrop) backdrop.hidden = true;
    document.querySelector("[data-dashboard-open]")?.classList.remove("open");
    document.querySelector("[data-dashboard-open]")?.setAttribute("aria-expanded", "false");
  };

  if(event.target.closest("[data-dashboard-close]")){
    closeDashboardDrawer();
    return;
  }

  const dashboardTrigger = event.target.closest("[data-dashboard-open]");
  if(dashboardTrigger){
    const drawer = document.querySelector(".home-dashboard-drawer");
    const backdrop = document.querySelector(".home-dashboard-backdrop");
    drawer?.classList.add("open");
    drawer?.setAttribute("aria-hidden", "false");
    if(backdrop) backdrop.hidden = false;
    dashboardTrigger.classList.add("open");
    dashboardTrigger.setAttribute("aria-expanded", "true");
    return;
  }

  /* ── AI 서비스 설정: 카드 수정 모드 진입 ── */
  const agentEdit = event.target.closest("[data-agent-edit]");
  if(agentEdit && isCurrentUserSuperAdmin()){
    sbEditingServiceId = agentEdit.dataset.agentEdit;
    render("scenarioBuilder"); return;
  }

  /* ── AI 서비스 설정: 카드 저장 ── */
  const agentSave = event.target.closest("[data-agent-save]");
  if(agentSave && isCurrentUserSuperAdmin()){
    const serviceId = agentSave.dataset.agentSave;
    const card = document.querySelector(`[data-agent-default="${cssString(serviceId)}"]`);
    if(card){
      const current = scenarioBuilderConfig.agentOptionDefaults?.[serviceId] || { serviceId };
      const checkedBehaviors = [...card.querySelectorAll(`[data-agent-behavior-opt^="${cssString(serviceId)}:"]`)]
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.agentBehaviorOpt.split(":")[1])
        .filter(Boolean);
      const behaviorInput = card.querySelector(`[data-agent-behavior="${cssString(serviceId)}"]`);
      const instructionEl = card.querySelector(`[data-agent-instruction="${cssString(serviceId)}"]`);
      const enabledEl = card.querySelector(`[data-agent-enabled="${cssString(serviceId)}"]`);
      scenarioBuilderConfig = {
        ...scenarioBuilderConfig,
        agentOptionDefaults: {
          ...scenarioBuilderConfig.agentOptionDefaults,
          [serviceId]: {
            ...current,
            enabled: enabledEl?.checked !== false,
            behavior: checkedBehaviors[0] || behaviorInput?.value.trim() || "",
            behaviors: checkedBehaviors.length ? checkedBehaviors : undefined,
            instruction: instructionEl?.value.trim() || "",
            customBehaviors: current.customBehaviors || [],
          },
        },
      };
    }
    saveScenarioBuilderState(scenarioBuilderConfig);
    sbEditingServiceId = null;
    render("scenarioBuilder"); return;
  }

  /* ── AI 서비스 설정: 카드 편집 취소 ── */
  const agentCancel = event.target.closest("[data-agent-cancel]");
  if(agentCancel && isCurrentUserSuperAdmin()){
    sbEditingServiceId = null;
    render("scenarioBuilder"); return;
  }

  /* ── AI 서비스 설정: 동작 추가 ── */
  const agentAddBehavior = event.target.closest("[data-agent-add-behavior]");
  if(agentAddBehavior && isCurrentUserSuperAdmin()){
    const serviceId = agentAddBehavior.dataset.agentAddBehavior;
    const input = document.getElementById(`behaviorInput_${serviceId}`);
    const val = input?.value.trim();
    if(!val) return;
    const current = scenarioBuilderConfig.agentOptionDefaults?.[serviceId] || {};
    const customs = [...(current.customBehaviors || [])];
    if(!customs.includes(val)) customs.push(val);
    scenarioBuilderConfig = {
      ...scenarioBuilderConfig,
      agentOptionDefaults: {
        ...scenarioBuilderConfig.agentOptionDefaults,
        [serviceId]: { ...current, customBehaviors: customs },
      },
    };
    saveScenarioBuilderState(scenarioBuilderConfig);
    render("scenarioBuilder"); return;
  }

  /* ── AI 서비스 설정: 동작 삭제 ── */
  const agentRemoveBehavior = event.target.closest("[data-agent-remove-behavior]");
  if(agentRemoveBehavior && isCurrentUserSuperAdmin()){
    const [serviceId, idxStr] = agentRemoveBehavior.dataset.agentRemoveBehavior.split(":");
    const idx = parseInt(idxStr, 10);
    const current = scenarioBuilderConfig.agentOptionDefaults?.[serviceId] || {};
    const customs = [...(current.customBehaviors || [])];
    if(!isNaN(idx)) customs.splice(idx, 1);
    scenarioBuilderConfig = {
      ...scenarioBuilderConfig,
      agentOptionDefaults: {
        ...scenarioBuilderConfig.agentOptionDefaults,
        [serviceId]: { ...current, customBehaviors: customs },
      },
    };
    saveScenarioBuilderState(scenarioBuilderConfig);
    render("scenarioBuilder"); return;
  }

  const scenarioBuilderViewButton = event.target.closest("[data-scenario-builder-view]");
  if(scenarioBuilderViewButton){
    if(!isCurrentUserSuperAdmin()) return;
    scenarioBuilderViewTab = scenarioBuilderViewButton.dataset.scenarioBuilderView === "services" ? "services" : "subtabs";
    render("scenarioBuilder");
    return;
  }

  /* ── 신규 업무분석 폼 열기/닫기 ── */
  if(event.target.closest("[data-sb-new-toggle]")){
    if(!isCurrentUserSuperAdmin()) return;
    sbShowNewForm = !sbShowNewForm;
    if(sbShowNewForm){
      // 기본값: 템플릿 없음, '진행중인 수사'(ongoing) 1개만 필수 포함
      sbNewDraft = { page:"", title:"", description:"", template:"special-investigation", enabledSubtabs:["ongoing"], defaultTab:"ongoing" };
    }
    render("scenarioBuilder"); return;
  }

  /* ── 신규: 템플릿 변경 시 서브탭 초기화 ── */
  /* ── 신규: 서브탭 포함/제외 ── */
  const sbNewToggle = event.target.closest("[data-sb-new-subtab-toggle]");
  if(sbNewToggle){
    if(!isCurrentUserSuperAdmin()) return;
    const tabId = sbNewToggle.dataset.sbNewSubtabToggle;
    if(tabId === "ongoing") return; // 필수 서브탭 — 제외 불가
    const idx = sbNewDraft.enabledSubtabs.indexOf(tabId);
    if(idx === -1) sbNewDraft.enabledSubtabs.push(tabId);
    else           sbNewDraft.enabledSubtabs.splice(idx, 1);
    // defaultTab 보정
    if(!sbNewDraft.enabledSubtabs.includes(sbNewDraft.defaultTab)){
      sbNewDraft.defaultTab = sbNewDraft.enabledSubtabs[0] || "";
    }
    render("scenarioBuilder"); return;
  }

  /* ── 신규: 서브탭 순서 이동 ── */
  const sbNewMove = event.target.closest("[data-sb-new-subtab-move]");
  if(sbNewMove){
    if(!isCurrentUserSuperAdmin()) return;
    const [tabId, dir] = sbNewMove.dataset.sbNewSubtabMove.split(":");
    const arr = sbNewDraft.enabledSubtabs;
    const idx = arr.indexOf(tabId);
    if(idx === -1) return;
    if(dir === "up"   && idx > 0)          { [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; }
    if(dir === "down" && idx < arr.length-1){ [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]]; }
    render("scenarioBuilder"); return;
  }

  /* ── 신규: 저장 ── */
  if(event.target.closest("[data-sb-new-save]")){
    if(!isCurrentUserSuperAdmin()) return;
    // 폼 필드 값 수집 (DOM에서 읽음)
    const pageVal = document.querySelector("[data-sb-new-key]")?.value.trim() || "";
    const titleVal = document.querySelector("[data-sb-new-title]")?.value.trim() || "";
    const descVal  = document.querySelector("[data-sb-new-desc]")?.value.trim() || "";
    if(!pageVal || !/^[a-z][a-z0-9_-]*$/i.test(pageVal)){
      alert("업무분석 key는 영문자로 시작하고 영문/숫자/_/-만 사용할 수 있습니다."); return;
    }
    if(pageNames[pageVal] || scenarioBuilderConfig.analysisScenarios?.[pageVal]){
      alert("이미 사용 중인 업무분석 key입니다."); return;
    }
    if(!titleVal){ alert("업무분석 제목을 입력하세요."); return; }
    if(!sbNewDraft.enabledSubtabs.length){ alert("사용할 서브탭을 하나 이상 선택하세요."); return; }

    const newScenario = {
      page: pageVal,
      title: titleVal,
      description: descVal,
      template: sbNewDraft.template,
      className: customAnalysisButtonClass(sbNewDraft.template),
      defaultTab: sbNewDraft.enabledSubtabs.includes(sbNewDraft.defaultTab)
        ? sbNewDraft.defaultTab : sbNewDraft.enabledSubtabs[0],
      enabledSubtabs: [...sbNewDraft.enabledSubtabs],
    };

    const existing = (scenarioBuilderConfig.customAnalysisScenarios || [])
      .filter(sc => sc.page !== newScenario.page);
    const next = {
      ...scenarioBuilderConfig,
      customAnalysisScenarios: [...existing, newScenario],
      analysisScenarios: {
        ...scenarioBuilderConfig.analysisScenarios,
        [newScenario.page]: newScenario,
      },
    };
    saveScenarioBuilderState(next);
    sbShowNewForm = false;
    sbNewDraft = { page:"", title:"", description:"", template:"special-investigation", enabledSubtabs:["ongoing"], defaultTab:"ongoing" };
    scenarioBuilderSelectedPage = newScenario.page;
    alert(`"${newScenario.title}" 업무분석이 추가되었습니다.`);
    render("scenarioBuilder"); return;
  }

  /* ── 신규: 취소 ── */
  if(event.target.closest("[data-sb-new-cancel]")){
    if(!isCurrentUserSuperAdmin()) return;
    sbShowNewForm = false;
    render("scenarioBuilder"); return;
  }

  /* ── 기존 커스텀 업무분석 삭제 ── */
  const sbDeletePage = event.target.closest("[data-sb-delete-page]");
  if(sbDeletePage){
    if(!isCurrentUserSuperAdmin()) return;
    const page = sbDeletePage.dataset.sbDeletePage;
    if(!confirm(`"${page}" 업무분석을 삭제하시겠습니까?`)) return;
    const next = {
      ...scenarioBuilderConfig,
      customAnalysisScenarios: (scenarioBuilderConfig.customAnalysisScenarios||[]).filter(sc => sc.page !== page),
      analysisScenarios: Object.fromEntries(
        Object.entries(scenarioBuilderConfig.analysisScenarios||{}).filter(([k]) => k !== page)
      ),
    };
    if(scenarioBuilderSelectedPage === page) scenarioBuilderSelectedPage = "";
    saveScenarioBuilderState(next);
    render("scenarioBuilder"); return;
  }

  // data-sb-extra-add 제거됨 — 오른쪽 Pool은 data-sb-subtab-toggle / data-sb-new-subtab-toggle 사용

  /* ── Pool UI: 업무분석 선택 ── */
  const sbSelectPage = event.target.closest("[data-sb-select-page]");
  if(sbSelectPage){
    if(!isCurrentUserSuperAdmin()) return;
    scenarioBuilderSelectedPage = sbSelectPage.dataset.sbSelectPage;
    render("scenarioBuilder");
    return;
  }

  /* ── Pool UI: 서브탭 포함/제외 토글 ── */
  const sbToggle = event.target.closest("[data-sb-subtab-toggle]");
  if(sbToggle){
    if(!isCurrentUserSuperAdmin()) return;
    const [page, tabId] = sbToggle.dataset.sbSubtabToggle.split(":");
    const scenario = scenarioBuilderConfig.analysisScenarios?.[page];
    if(!scenario) return;
    const enabled = [...(scenario.enabledSubtabs || [])];
    const idx = enabled.indexOf(tabId);
    if(idx === -1){ enabled.push(tabId); }
    else { enabled.splice(idx, 1); }
    scenarioBuilderConfig = {
      ...scenarioBuilderConfig,
      analysisScenarios: {
        ...scenarioBuilderConfig.analysisScenarios,
        [page]: { ...scenario, enabledSubtabs: enabled },
      },
    };
    render("scenarioBuilder");
    return;
  }

  /* ── Pool UI: 서브탭 순서 이동 ── */
  const sbMove = event.target.closest("[data-sb-subtab-move]");
  if(sbMove){
    if(!isCurrentUserSuperAdmin()) return;
    const [page, tabId, dir] = sbMove.dataset.sbSubtabMove.split(":");
    const scenario = scenarioBuilderConfig.analysisScenarios?.[page];
    if(!scenario) return;
    const enabled = [...(scenario.enabledSubtabs || [])];
    const idx = enabled.indexOf(tabId);
    if(idx === -1) return;
    if(dir === "up"   && idx > 0)               { [enabled[idx-1], enabled[idx]] = [enabled[idx], enabled[idx-1]]; }
    if(dir === "down" && idx < enabled.length-1){ [enabled[idx], enabled[idx+1]] = [enabled[idx+1], enabled[idx]]; }
    scenarioBuilderConfig = {
      ...scenarioBuilderConfig,
      analysisScenarios: {
        ...scenarioBuilderConfig.analysisScenarios,
        [page]: { ...scenario, enabledSubtabs: enabled },
      },
    };
    render("scenarioBuilder");
    return;
  }

  /* ── Pool UI: 기본 진입 탭 변경 (select change는 별도 이벤트 — click fallthrough) ── */

  if(event.target.closest("[data-scenario-builder-save]")){
    if(!isCurrentUserSuperAdmin()) return;
    // Pool UI는 config를 직접 수정하므로 agentDefaults DOM 변경만 반영
    const draft = { ...scenarioBuilderConfig };
    document.querySelectorAll("[data-agent-default]").forEach(card => {
      const serviceId = card.dataset.agentDefault;
      const current = draft.agentOptionDefaults?.[serviceId] || { serviceId };
      draft.agentOptionDefaults = draft.agentOptionDefaults || {};
      // 체크된 behavior 옵션 값 수집
      const checkedBehaviors = [...card.querySelectorAll(`[data-agent-behavior-opt^="${cssString(serviceId)}:"]`)]
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.agentBehaviorOpt.split(":")[1])
        .filter(Boolean);
      draft.agentOptionDefaults[serviceId] = {
        ...current,
        enabled: card.querySelector(`[data-agent-enabled="${cssString(serviceId)}"]`)?.checked !== false,
        // behavior: 체크된 첫 번째 값, 없으면 직접 입력값
        behavior: checkedBehaviors[0]
          || card.querySelector(`[data-agent-behavior="${cssString(serviceId)}"]`)?.value.trim()
          || "",
        behaviors: checkedBehaviors.length ? checkedBehaviors : undefined,
        instruction: card.querySelector(`[data-agent-instruction="${cssString(serviceId)}"]`)?.value.trim() || "",
        // customBehaviors는 동작 추가/삭제 시 즉시 저장되므로 기존 값 유지
        customBehaviors: current.customBehaviors || [],
      };
    });
    saveScenarioBuilderState(draft);
    alert("업무시나리오 구성이 저장되었습니다.");
    render("scenarioBuilder");
    return;
  }

  if(event.target.closest("[data-custom-analysis-add]")){
    if(!isCurrentUserSuperAdmin()) return;
    const customScenario = customAnalysisScenarioDraftFromDom();
    if(!customScenario) return;
    const next = scenarioBuilderDraftFromDom();
    const customAnalysisScenarios = (next.customAnalysisScenarios || [])
      .filter(scenario => scenario.page !== customScenario.page);
    customAnalysisScenarios.push(customScenario);
    next.customAnalysisScenarios = customAnalysisScenarios;
    saveScenarioBuilderState(next);
    alert("신규 업무분석이 추가되었습니다.");
    render("scenarioBuilder");
    return;
  }

  if(event.target.closest("[data-scenario-builder-reset]")){
    if(!isCurrentUserSuperAdmin()) return;
    if(!confirm("업무시나리오 구성을 기본값으로 복원하시겠습니까?")) return;
    saveScenarioBuilderState(defaultScenarioBuilderConfig());
    render("scenarioBuilder");
    return;
  }

  if(event.target.closest("[data-super-scenario-builder]")){
    if(!isCurrentUserSuperAdmin()) return;
    render("scenarioBuilder");
    return;
  }

  if(event.target.closest("#shutdownAllBtn")){
    shutdownAllServers();
    return;
  }

  /* ── AI Agentic 서비스 빌더 ── */
  if(event.target.closest("[data-agentic-new]")){
    if(!isCurrentUserAdmin()) return;
    const store = agenticGroupStore();
    const svc = createAgenticService();
    store.services.push(svc);
    store.activeServiceId = svc.id;
    agenticListOpen = false;
    saveCanvasState();
    render("agentic");   // 캔버스 재마운트 → 기본 흐름 시드
    return;
  }
  if(event.target.closest("[data-agentic-toggle-list]")){
    if(!isCurrentUserAdmin()) return;
    agenticListOpen = !agenticListOpen;
    render("agentic");
    return;
  }
  const agSelectSvc = event.target.closest("[data-agentic-select-service]");
  if(agSelectSvc){
    if(!isCurrentUserAdmin()) return;
    agenticGroupStore().activeServiceId = agSelectSvc.dataset.agenticSelectService;
    saveCanvasState();
    render("agentic");   // 선택 서비스의 그래프로 재마운트
    return;
  }
  const agAddNode = event.target.closest("[data-agentic-add-node]");
  if(agAddNode){
    if(!isCurrentUserAdmin()) return;
    if(!activeAgenticService()){
      // 서비스가 없으면 먼저 새 서비스를 만든다(기본 흐름 시드 후 마운트)
      const store = agenticGroupStore();
      const svc = createAgenticService();
      store.services.push(svc);
      store.activeServiceId = svc.id;
      saveCanvasState();
      render("agentic");
      return;
    }
    // 캔버스에 노드 추가 (전체 재렌더 없이 Drawflow API로)
    if(agenticFlow){
      const id = agenticFlow.addNode(agAddNode.dataset.agenticAddNode);
      agenticFlow.selectNode(id);
    }
    return;
  }
  const agZoom = event.target.closest("[data-agentic-zoom]");
  if(agZoom){
    if(!agenticFlow) return;
    const mode = agZoom.dataset.agenticZoom;
    if(mode === "in") agenticFlow.zoomIn();
    else if(mode === "out") agenticFlow.zoomOut();
    else agenticFlow.zoomReset();
    return;
  }
  if(event.target.closest("[data-agentic-layout]")){
    if(!isCurrentUserAdmin() || !agenticFlow) return;
    agenticFlow.autoLayout();
    return;
  }
  if(event.target.closest("[data-agentic-fit]")){
    agenticFlow?.fitView();
    return;
  }
  const agLock = event.target.closest("[data-agentic-lock]");
  if(agLock){
    if(!isCurrentUserAdmin() || !agenticFlow) return;
    agenticLocked = !agenticLocked;
    agenticFlow.setLocked(agenticLocked);
    // 전체 재렌더(캔버스 재마운트) 없이 버튼만 갱신
    agLock.classList.toggle("lock-on", agenticLocked);
    agLock.textContent = agenticLocked ? "🔒 이동잠금" : "🔓 이동가능";
    return;
  }
  if(event.target.closest("[data-agentic-run]")){
    if(!isCurrentUserAdmin()) return;
    runActiveAgenticService();
    return;
  }
  if(event.target.closest("[data-agentic-stop]")){
    agenticRunning = false;
    try{ agenticRunAbort?.abort(); }catch(e){ /* noop */ }
    return;
  }
  if(event.target.closest("[data-agentic-history]")){
    if(!isCurrentUserAdmin()) return;
    agenticPanelMode = "history";
    renderAgenticRunPanel();
    return;
  }
  const agHist = event.target.closest("[data-agentic-hist]");
  if(agHist){
    const run = (activeAgenticService()?.runs || [])[Number(agHist.dataset.agenticHist)];
    if(run){
      agenticPanelMode = "run";
      agenticRunSteps = (run.steps || []).map(s => ({ ...s }));
      agenticRunning = false;
      renderAgenticRunPanel();
    }
    return;
  }
  if(event.target.closest("[data-agentic-run-close]")){
    const panel = document.getElementById("agenticRunPanel");
    if(panel){ panel.hidden = true; }
    agenticPanelMode = "run";
    agenticFlow?.clearStatuses();
    return;
  }
  if(event.target.closest("[data-agentic-inspect-close]")){
    agenticSelectedNodeId = null;
    document.querySelectorAll("#agenticDrawflow .drawflow-node.selected").forEach(el => el.classList.remove("selected"));
    renderAgenticInspector();
    return;
  }
  const agDelNode = event.target.closest("[data-agentic-delete-node]");
  if(agDelNode){
    if(!isCurrentUserAdmin() || !agenticFlow || agenticSelectedNodeId == null) return;
    agenticFlow.removeNode(agenticSelectedNodeId);
    agenticSelectedNodeId = null;
    renderAgenticInspector();
    return;
  }
  const agRemoveTool = event.target.closest("[data-agentic-remove-tool]");
  if(agRemoveTool){
    if(!isCurrentUserAdmin() || !agenticFlow || agenticSelectedNodeId == null) return;
    const node = agenticFlow.getNodeData(agenticSelectedNodeId);
    if(node){
      const tools = (node.tools || []).filter(t => t !== agRemoveTool.dataset.agenticRemoveTool);
      agenticFlow.updateNodeData(agenticSelectedNodeId, { tools });
      renderAgenticInspector();
    }
    return;
  }

  const closeTabBtn = event.target.closest("[data-close-tab]");
  if(closeTabBtn){
    event.stopPropagation();
    const page = closeTabBtn.dataset.closeTab;
    const tab = document.querySelector(`.work-tab[data-page="${page}"]`);
    if(tab) tab.remove();
    if(currentPage === page) render("home");
    return;
  }

  const lockedToggle = event.target.closest(".toggle-row.locked");
  if(lockedToggle){
    const key = lockedToggle.dataset.permissionKey;
    const label = lockedToggle.querySelector("span:first-child")?.textContent?.trim() || key;
    const confirmed = confirm(`"${label}" 사용 권한이 없습니다.\n관리자에게 권한을 요청하시겠습니까?`);
    if(confirmed){
      requestPermissions([key]);
      renderScenarioList();
      syncScenarioEditor();
      alert("권한 요청이 등록되었습니다. 승인 전까지 해당 항목을 사용할 수 없습니다.");
    }
    return;
  }

  const archiveJobBtn = event.target.closest("[data-archive-job]");
  if(archiveJobBtn){
    const companyId = archiveJobBtn.dataset.archiveJob;
    archiveCanvasJob(companyId);
    overviewArchiveOpen = true;
    render("canvas");
    return;
  }

  const removeJobBtn = event.target.closest("[data-remove-job]");
  if(removeJobBtn){
    const companyId = removeJobBtn.dataset.removeJob;
    const job = canvasJobs().find(item => item.companyId === companyId);
    const name = job?.companyName || companyId;
    if(!confirm(`${name} 진행작업을 내 목록에서 삭제하시겠습니까?`)) return;
    removeCanvasJobForCurrentUser(companyId);
    render("canvas");
    return;
  }

  const approveBtn = event.target.closest("[data-approve-key]");
  if(approveBtn){
    const key = approveBtn.dataset.approveKey;
    userPermissions[key] = "granted";
    saveCanvasState();
    renderSidebarPermissions();
    render("permission");
    return;
  }

  const rejectBtn = event.target.closest("[data-reject-key]");
  if(rejectBtn){
    const key = rejectBtn.dataset.rejectKey;
    const label = scenarioSourceByKey(key)?.label || key;
    if(!confirm(`"${label}" 권한 요청을 거부하시겠습니까?`)) return;
    userPermissions[key] = "locked";
    saveCanvasState();
    renderSidebarPermissions();
    render("permission");
    return;
  }

  const revokeBtn = event.target.closest("[data-revoke-key]");
  if(revokeBtn){
    const key = revokeBtn.dataset.revokeKey;
    const label = scenarioSourceByKey(key)?.label || key;
    if(!confirm(`"${label}" 권한을 회수하시겠습니까?`)) return;
    userPermissions[key] = "locked";
    saveCanvasState();
    renderSidebarPermissions();
    render("permission");
    return;
  }

  const templateEditBtn = event.target.closest("[data-template-edit-btn]");
  if(templateEditBtn){
    const templateId = templateEditBtn.dataset.templateEditBtn;
    const domain = templateEditorDomain;
    const template = allScenarioTemplates(domain).find(t => t.id === templateId);
    if(!template) return;
    // 일반/마약 빌트인 편집은 조직 관리자만
    if(domain !== "customs" && !isCurrentUserAdmin()){
      alert("조직 관리자만 빌트인 템플릿을 편집할 수 있습니다.");
      return;
    }
    const editable = canEditTemplate(template);
    editingTemplateId = editable ? templateId : "__new__";
    templateDraftName = editable ? "" : `${template.name} 사본`;
    templateEditorItems = template.items.map((item, i) => normalizeScenarioItem({...item, id: uid()}, i));
    templateEditorSelectedId = templateEditorItems[0]?.id || null;
    templateEditorInitialized = false;
    if(domain === "customs") render("canvas"); else render(currentPage);
    return;
  }

  const discardNewBtn = event.target.closest("[data-discard-new-template]");
  if(discardNewBtn){
    editingTemplateId = null;
    templateDraftName = "";
    templateEditorItems = [];
    templateEditorSelectedId = null;
    templateEditorInitialized = false;
    render("canvas");
    return;
  }

  const deleteTemplateBtn = event.target.closest("[data-delete-template]");
  if(deleteTemplateBtn){
    const templateId = deleteTemplateBtn.dataset.deleteTemplate;
    const template = allScenarioTemplates().find(t => t.id === templateId);
    if(!template) return;
    if(!canDeleteTemplate(template)){
      alert("템플릿 소유자 또는 관리자만 삭제할 수 있습니다.");
      return;
    }
    if(!confirm(`"${template.name}" 템플릿을 삭제하시겠습니까?`)) return;
    const isBuiltin = scenarioTemplates.some(t => t.id === templateId);
    if(isBuiltin){
      hiddenBuiltinIds.add(templateId);
      delete builtinOverrides[templateId];
    } else {
      customTemplates = customTemplates.filter(t => t.id !== templateId);
    }
    if(editingTemplateId === templateId){ editingTemplateId = null; templateDraftName = ""; templateEditorItems = []; templateEditorSelectedId = null; }
    saveTemplatesState();
    saveCanvasState();
    templateEditorInitialized = false;
    render("canvas");
    return;
  }

  const archiveToggle = event.target.closest("[data-toggle-archive]");
  if(archiveToggle){
    overviewArchiveOpen = !overviewArchiveOpen;
    render("canvas");
    return;
  }

  const permissionRequest = event.target.closest("[data-permission-request]");
  if(permissionRequest){
    const keys = permissionRequest.dataset.permissionRequest.split(",").map(key => key.trim()).filter(Boolean);
    requestPermissions(keys);
    renderScenarioList();
    syncScenarioEditor();
    alert("권한 요청이 등록되었습니다. 승인 전까지 해당 데이터소스/AI 서비스를 포함한 분석은 실행할 수 없습니다.");
    return;
  }

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
    const { sources } = homeSelectedAnalysisOptions();
    [...sources, ...homeSyncPipelineOrder()].forEach(key => { homeCardCollapsed[key] = collapse; });
    homeRenderPromptTemplatePanels();
    return;
  }

  // 모두 닫고 초기화: 모든 카드를 접고 수행 결과를 비운다(입력값은 유지)
  const resetAll = event.target.closest("[data-home-reset-all]");
  if(resetAll){
    const { sources } = homeSelectedAnalysisOptions();
    [...sources, ...homeSyncPipelineOrder()].forEach(key => { homeCardCollapsed[key] = true; });
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

  // 수행 순서 프레임: ▲▼ 이동
  const frameMove = event.target.closest("[data-home-frame-move]");
  if(frameMove){
    homeMovePipelineFrame(frameMove.dataset.key, frameMove.dataset.homeFrameMove);
    return;
  }

  // AI 서비스 카드: 동작(behavior) 칩 토글
  const tplChip = event.target.closest("[data-home-tpl-behavior]");
  if(tplChip){
    const key = tplChip.dataset.homeTplBehavior;
    const value = tplChip.dataset.behavior;
    const st = homePromptTemplateState[key];
    if(st){
      const has = st.behaviors.includes(value);
      st.behaviors = has ? st.behaviors.filter(v => v !== value) : [...st.behaviors, value];
      tplChip.classList.toggle("on", !has);
      homeSyncCombinedPrompt();
    }
    return;
  }

  // LLM 사용 모드 토글 (외부LLM only → 내부LLM only → 외부LLM+내부LLM 순환)
  const llmModeBtn = event.target.closest("[data-home-llm-mode]");
  if(llmModeBtn){
    const cur = llmModeBtn.dataset.llmMode || "ext";
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

  const addScenarioShareEmailBtn = event.target.closest("[data-share-email-add]");
  if(addScenarioShareEmailBtn){
    addShareEmailsToScope(addScenarioShareEmailBtn.dataset.shareEmailAdd);
    return;
  }

  const removeScenarioShareEmailBtn = event.target.closest("[data-share-email-remove]");
  if(removeScenarioShareEmailBtn){
    removeShareEmailFromScope(removeScenarioShareEmailBtn.dataset.shareEmailRemove, removeScenarioShareEmailBtn.dataset.email || "");
    return;
  }

  const addWebTargetBtn = event.target.closest("[data-web-target-add]");
  if(addWebTargetBtn){
    addWebTargetToScope(addWebTargetBtn.dataset.webTargetAdd);
    return;
  }

  const removeWebTargetBtn = event.target.closest("[data-web-target-remove]");
  if(removeWebTargetBtn){
    removeWebTargetFromScope(removeWebTargetBtn.dataset.webTargetRemove, Number(removeWebTargetBtn.dataset.index));
    return;
  }

  const homeRunBtn = event.target.closest(".home-run-btn");
  if(homeRunBtn){
    const prompt = coachPromptText();
    if(!prompt){ alert("프롬프트를 먼저 입력하세요."); return; }
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

  const newScenarioButton = event.target.closest("[data-new-scenario-button]");
  if(newScenarioButton){
    showScenarioCompanyPicker = !showScenarioCompanyPicker;
    render("canvas");
    if(showScenarioCompanyPicker) loadScenarioCompanies();
    return;
  }

  const restoreJobButton = event.target.closest("[data-restore-job]");
  if(restoreJobButton){
    const companyId = restoreJobButton.dataset.restoreJob;
    restoreRunArchiveToWorkspace(companyId, { tab:"report" });
    canvasTab = "overview";
    render("canvas");
    return;
  }

  const analysisJobCard = event.target.closest("[data-analysis-job]");
  if(analysisJobCard){
    const page = analysisJobCard.dataset.analysisPage || "investigation";
    const targetTab = analysisJobCard.dataset.analysisTab || "ongoing";
    if(page === "generalinv"){
      generalInvestigationState.activeGenInvCaseId = analysisJobCard.dataset.analysisJob;
      generalInvestigationState.generalInvTab = "cases";
      generalInvestigationState.activeGiStepId = null;
      saveCanvasState();
      render("generalinv");
      return;
    }
    if(page === "lawsearch" || page === "fxsearch"){
      // 마약·외환 수사 사건 선택 후 해당 페이지의 프로파일 탭으로 이동
      const selectedCaseId = analysisJobCard.dataset.analysisJob;
      specialInvestigationState.activeDrugCaseId = selectedCaseId;
      const selectedCase = defaultDrugInvCases.find(c => c.caseId === selectedCaseId) || null;
      resetDrugCaseSubTabs(selectedCase);
      specialInvestigationState.drugInvTab = (selectedCase ? (targetTab || "profile") : "ongoing");
      saveCanvasState();
      render(page);
      return;
    }
    if(page !== "investigation"){
      render(page);
      return;
    }
    activeCanvasCompanyId = analysisJobCard.dataset.canvasCompany;
    customsState.investigationTab = targetTab;
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    loadCompanyRunArchive(activeCanvasCompanyId);
    saveCanvasState();
    render("investigation");
    return;
  }

  const companyTarget = event.target.closest("[data-canvas-company]");
  if(companyTarget){
    activeCanvasCompanyId = companyTarget.dataset.canvasCompany;
    showScenarioCompanyPicker = false;
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    loadCompanyRunArchive(activeCanvasCompanyId);
    if(companyTarget.dataset.openCompanyProfile === "true") canvasTab = "profile";
    saveCanvasState();
  }

  const riskScreeningTabBtn = event.target.closest("[data-rs-tab]");
  if(riskScreeningTabBtn){
    riskScreeningTab = riskScreeningTabBtn.dataset.rsTab;
    render("dw");
    return;
  }

  const customsInfoTabBtn = event.target.closest("[data-ci-tab]");
  if(customsInfoTabBtn){
    customsInfoTab = customsInfoTabBtn.dataset.ciTab;
    render("rag");
    return;
  }

  const intlTemplateBtn = event.target.closest("[data-intl-template]");
  if(intlTemplateBtn){
    const input = document.getElementById("coachPrompt");
    if(input){
      input.classList.remove("is-initial");  // 초기 안내문 상태 해제 (포커스 시 자동 비움 방지)
      input.value = intlTemplateBtn.dataset.intlTemplate;
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles:true }));
    }
    document.querySelectorAll(".intl-template-card").forEach(card => card.classList.toggle("selected", card === intlTemplateBtn));
    return;
  }

  const canvasTabButton = event.target.closest("[data-canvas-tab]");
  if(canvasTabButton){
    if(canvasTabButton.dataset.templateId){
      activeScenarioTemplateId = canvasTabButton.dataset.templateId;
      scenarioItems = cloneTemplateItems(canvasTabButton.dataset.templateId);
      selectedScenarioId = scenarioItems[0]?.id || null;
      stepOutputs = {};
      stepStatuses = {};
      openedSteps = new Set();
      expandedResultStepId = null;
      saveCompanyScenario();
      scenarioInitialized = false;
      scenarioLoadedForCompany = activeCanvasCompanyId;
    }
    canvasTab = canvasTabButton.dataset.canvasTab;
    render("canvas");
    return;
  }

  if(companyTarget){
    render("canvas");
    return;
  }

  const pageButton = event.target.closest("[data-page]");
  if(pageButton){
    if(pageButton.dataset.openArchive === "true"){
      overviewArchiveOpen = true;
    }
    if(pageButton.dataset.canvasTab){
      canvasTab = pageButton.dataset.canvasTab;
    }
    if(pageButton.classList.contains("special-analysis-btn")){
      const page = pageButton.dataset.page;
      const template = analysisTemplateForPage(page);
      if(page === "investigation" || template === "customs"){
        customsState.investigationTab = scenarioBuilderDefaultTab(page, "ongoing");
        customsState.showInvNewJobForm = false;
      }
      if(page === "generalinv" || template === "general-investigation"){
        generalInvestigationState.generalInvTab = scenarioBuilderDefaultTab(page, "cases");
        generalInvestigationState.showGenInvRegForm = false;
      }
      if(isSpecialInvestigationPage(page)){
        specialInvestigationState.drugInvTab = scenarioBuilderDefaultTab(page, "dashboard");
        specialInvestigationState.drugInvSelectedTarget = null;
        specialInvestigationState.drugAccordionOpen = { cargo:true, traveler:false, modus:false, intl:false };
      }
      if(page === "dw"){
        riskScreeningTab = "today";
      }
      if(page === "rag"){
        customsInfoTab = "today";
      }
    }
    render(pageButton.dataset.page);
    return;
  }

  const collapseButton = event.target.closest(".collapsible-label");
  if(collapseButton){
    const target = document.getElementById(collapseButton.dataset.collapseTarget);
    const icon = collapseButton.querySelector("span");
    if(target){
      target.classList.toggle("collapsed");
      icon.textContent = target.classList.contains("collapsed") ? "▶" : "▼";
    }
    return;
  }

  const adminToggle = event.target.closest(".admin-toggle");
  if(adminToggle){
    const nav = document.querySelector(".admin-nav");
    nav.classList.toggle("closed");
    adminToggle.querySelector("span").textContent = nav.classList.contains("closed") ? "▶" : "▼";
  }
});

/* ── AI 서비스 단독 실행 (관세조사/일반수사/마약수사 공통) ── */
document.addEventListener("click", (event) => {
  const runSelected = event.target.closest("#scenarioRunSelectedButton");
  if(runSelected){
    applySelectedScenarioPrompt();
    runSingleScenarioItem(selectedScenarioItem());
    return;
  }
});

document.addEventListener("change", (event)=>{
  /* ── AI Agentic 노드 필드(셀렉트/체크박스) ── */
  if(event.target.closest("[data-agentic-add-tool]")){
    const tool = event.target.value;
    if(tool && agenticFlow && agenticSelectedNodeId != null){
      const node = agenticFlow.getNodeData(agenticSelectedNodeId);
      const tools = node?.tools ? [...node.tools] : [];
      if(!tools.includes(tool)) tools.push(tool);
      agenticFlow.updateNodeData(agenticSelectedNodeId, { tools });
      renderAgenticInspector();
    }
    return;
  }
  const agField = event.target.dataset?.agenticField;
  if(agField && (event.target.tagName === "SELECT" || event.target.type === "checkbox")){
    if(agenticFlow && agenticSelectedNodeId != null){
      const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      agenticFlow.updateNodeData(agenticSelectedNodeId, { [agField]: value });
      // 반복 방식 변경 시 조건 라벨/안내가 바뀌므로 인스펙터를 다시 렌더
      if(agField === "loopMode") renderAgenticInspector();
    }
    return;
  }

  if(event.target && event.target.id === "giRegPersonSelect"){
    const person = riskPersonById(event.target.value);
    const targetInput = document.getElementById("giRegTarget");
    const nationInput = document.getElementById("giRegNation");
    const personIdInput = document.getElementById("giRegPersonId");
    if(person){
      if(targetInput) targetInput.value = person.name || "";
      if(nationInput) nationInput.value = person.nationality || "";
      if(personIdInput && person.birth_date) personIdInput.value = String(person.birth_date).replaceAll("-", "").slice(2, 8);
    }
    return;
  }

  const scenarioCompanySelect = event.target.closest("#newScenarioCompanySelect");
  if(scenarioCompanySelect){
    if(!scenarioCompanySelect.value) return;
    activeCanvasCompanyId = scenarioCompanySelect.value;
    const selectedCompany = findCompanyById(activeCanvasCompanyId) || { company_id:activeCanvasCompanyId, company_name:activeCanvasCompanyId };
    createCanvasJob(selectedCompany);
    showScenarioCompanyPicker = false;
    canvasTab = "overview";
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    scenarioItems = [];
    saveCanvasState();
    render("canvas");
  }
});

/* ── AI Agentic 노드/서비스 텍스트 필드 실시간 편집 (재렌더 없이 상태만 갱신) ── */
document.addEventListener("input", (event) => {
  if(event.target.matches("[data-agentic-service-name]")){
    const svc = activeAgenticService();
    if(svc){ svc.name = event.target.value; saveCanvasState(); }
    return;
  }
  const agField = event.target.dataset?.agenticField;
  if(agField && event.target.matches("textarea, input:not([type=checkbox])")){
    if(agenticFlow && agenticSelectedNodeId != null){
      const raw = event.target.value;
      const value = event.target.type === "number" ? Math.max(1, parseInt(raw, 10) || 1) : raw;
      agenticFlow.updateNodeData(agenticSelectedNodeId, { [agField]: value });
    }
    return;
  }
});

/* ── GI 워크벤치 단계 필드 실시간 편집 ── */
document.addEventListener("input", (event) => {
  const stepId = event.target.dataset.giStepId;
  if(!stepId) return;
  const aCase = activeGenInvCase();
  const step  = aCase?.giSteps?.find(s => s.id === stepId);
  if(!step) return;
  if(event.target.id === "giWbStepLabel") step.label = event.target.value;
  if(event.target.id === "giWbStepNote"){
    step.note = event.target.value;
    step.instruction = event.target.value;
  }
  saveCanvasState();
  // no re-render needed for text fields (live editing)
});

document.addEventListener("change", (event) => {
  const stepId = event.target.dataset.giStepId;
  if(stepId && event.target.id === "giWbStepType"){
    const aCase = activeGenInvCase();
    const step  = aCase?.giSteps?.find(s => s.id === stepId);
    if(step) step.type = event.target.value;
    saveCanvasState();
    render("generalinv");
    return;
  }
  if(stepId && event.target.id === "giWbStepSource"){
    const aCase = activeGenInvCase();
    const step  = aCase?.giSteps?.find(s => s.id === stepId);
    const source = giSourceByKey(event.target.value);
    if(step && source){
      step.key = source.key;
      step.type = source.type;
      step.label = source.label;
      step.sourceKey = giCommonSourceKey(source.key);
      step.targetType = aCase.targetType || "company";
      step.target_type = aCase.targetType || "company";
      step.behaviors = sourceDefaultBehaviors(step.sourceKey);
      step.behavior = step.behaviors[0];
      step.behaviorLabel = sourceBehaviorLabels(step.sourceKey, step.behaviors).join(", ");
      // 서비스 선택 시 최적 프롬프트 우선, 없으면 기본 instruction 사용
      const _targetType = aCase.targetType || "company";
      composePrompt(step.sourceKey, step.behaviors, _targetType).then(composed => {
        const inst = composed || sourceDefaultInstruction(step.sourceKey, _targetType);
        step.instruction = inst;
        step.note = inst;
        const noteEl = document.getElementById("giWbStepNote");
        if(noteEl && noteEl.dataset.giStepId === step.id) noteEl.value = inst;
      });
      step.instruction = sourceDefaultInstruction(step.sourceKey, aCase.targetType);
      step.note = step.instruction;
    }
    saveCanvasState();
    render("generalinv");
    return;
  }
  const giBehaviorBox = event.target.closest("#giWbBehaviorOptions");
  if(giBehaviorBox && event.target.matches("input[type='checkbox']")){
    const aCase = activeGenInvCase();
    const step  = aCase?.giSteps?.find(s => s.id === giBehaviorBox.dataset.giStepId);
    if(step){
      const values = selectedBehaviorValues("giWbBehaviorOptions");
      const sk = step.sourceKey || giCommonSourceKey(step.key);
      if(!values.length){
        step.behaviors = sourceDefaultBehaviors(sk);
      }else{
        step.behaviors = values;
      }
      step.behavior = step.behaviors[0];
      step.behaviorLabel = sourceBehaviorLabels(sk, step.behaviors).join(", ");
      // 선택 조건 기반 최적 프롬프트 자동 생성
      const targetType = aCase.targetType || "company";
      composePrompt(sk, step.behaviors, targetType).then(prompt => {
        if(prompt){
          step.instruction = prompt;
          step.note = prompt;
          const noteEl = document.getElementById("giWbStepNote");
          if(noteEl && noteEl.dataset.giStepId === step.id) noteEl.value = prompt;
        }
      });
    }
    saveCanvasState();
    render("generalinv");
    return;
  }
});

document.getElementById("promptRun")?.addEventListener("click",()=>render("home"));
document.getElementById("profileSwitcherBtn")?.addEventListener("click", openUserSelectModal);

document.addEventListener("keydown", (event) => {
  if(event.key !== "Escape") return;
  const drawer = document.querySelector(".home-dashboard-drawer.open");
  if(!drawer) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  const backdrop = document.querySelector(".home-dashboard-backdrop");
  if(backdrop) backdrop.hidden = true;
  document.querySelector("[data-dashboard-open]")?.classList.remove("open");
  document.querySelector("[data-dashboard-open]")?.setAttribute("aria-expanded", "false");
});

document.addEventListener("keydown", (event) => {
  if(event.key !== "Enter") return;
  // 프롬프트 입력창: Enter → 실행. Shift+Enter는 줄바꿈, 한글 IME 조합 중에는 무시.
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
  if(event.target?.id === "scenarioShareEmailInput"){
    event.preventDefault();
    addShareEmailsToScope("scenario");
    return;
  }
  if(event.target?.id === "templateShareEmailInput"){
    event.preventDefault();
    addShareEmailsToScope("template");
    return;
  }
  if(event.target?.id === "scenarioWebTargetUrl" || event.target?.id === "scenarioWebTargetQuery"){
    event.preventDefault();
    addWebTargetToScope("scenario");
    return;
  }
  if(event.target?.id === "templateWebTargetUrl" || event.target?.id === "templateWebTargetQuery"){
    event.preventDefault();
    addWebTargetToScope("template");
  }
});

function shutdownAllServers(){
  const confirmed = confirm("모든 서버를 종료하시겠습니까?\n실행 중인 분석 작업이 중단됩니다.");
  if(!confirmed) return;
  fetch("/api/shutdown", { method: "POST" })
    .then(() => {
      document.body.innerHTML = `<div style="display:grid;place-items:center;height:100vh;font-family:sans-serif;color:#475569">
        <div style="text-align:center">
          <div style="font-size:48px;margin-bottom:16px">⏻</div>
          <h2 style="margin:0 0 8px;color:#1e293b">서버가 종료되었습니다</h2>
          <p style="margin:0;color:#64748b">서버를 다시 시작한 후 페이지를 새로고침하세요.</p>
        </div>
      </div>`;
    })
    .catch(() => {
      alert("서버 종료 요청을 전송했습니다.");
    });
}

(async () => {
  const hasState = await loadCanvasState();
  // 업무시나리오 구성을 서버 파일에서 로드 (없으면 localStorage 구성을 서버로 이행)
  await loadScenarioBuilderConfigFromServer();
  // 수사유형별 빌트인 시나리오 템플릿을 서버 파일에서 로드/시드
  await loadScenarioTemplatesFromServer();
  // 저장 상태가 없으면 기본 사용자(u01) 권한으로 초기화
  if(!hasState){
    const initGroup = userGroups.find(g => g.id === (sampleUsers.find(u => u.id === currentUserId)?.groupId)) || userGroups[0];
    userPermissions = buildGroupPermissions(initGroup);
  }
  renderSidebarPermissions();
  syncSidebarCollapseIcons();
  updateProfileDisplay();
  updateAdminMenuVisibility();
  render();
})();
