import { dataTable, escapeHtml, markdownToHtml, renderValidationDashboard } from "./core/dom.js";
import { composePrompt, setPromptOverride, savePromptOverrides } from "./analysis/shared/prompt-composer.js";
import { indicatorItems, indicatorSetLabel, indicatorSetForCompany } from "./analysis/shared/risk-indicator-sets.js";
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
import { networkGraphPanelHtml } from "./analysis/shared/network-graph.js";
import { openFileRegisterPopup } from "./pages/file-register-popup.js";
import { openSourceAddPopup } from "./pages/source-add-popup.js";
import "./pages/service-detail-popup.js";   // AI 서비스 상세 팝업(신규) — self-init, 기존 코드 무변경
import { serviceInputStripHtml } from "./pages/service-workspace-ui.js";   // 3세트 UI 입력값 스트립(신규)
import { getServiceSettings, settingValueLabel, setServiceSetting } from "./pages/service-config-popup.js";   // 리뷰모드 인라인 설정 UI
import { findServiceSpec, SERVICE_EDIT_META } from "./pages/service-specs.js";
import { finalizeScenarioPrompt, patternBehaviorDescription } from "./pages/service-prompt-patterns.js";   // 프롬프트 패턴(신규) — 등록 서비스만 대체, 그 외 passthrough
import { bindGiInsightChat } from "./analysis/general-investigation/insight.js";   // 수사정보 분석 탭 Chat 바인딩
import { bindCiInsightChat } from "./analysis/customs/insight.js";                 // 관세조사 수사정보 분석 탭 Chat 바인딩
import { initInvCopilot, setEvidenceContextProvider } from "./pages/inv-copilot.js";   // 업무영역 별도 사이트(조사관·수사관·보고서) 공통 플랫폼 셸
import { streamLlmText } from "./analysis/shared/llm-stream.js";   // 증거 결과 AI 분석/요약(관세수사 스테이지)
import { crimeSummary } from "./analysis/general-investigation/crime-taxonomy.js";   // 요청서·검색 컨텍스트의 혐의 요약
import { isPlatformShellPage, isStandalonePlatform, platformBootPage } from "./core-engine/platform-sites.js";
import "./core-engine/resize-gutters.js";   // 리사이즈 거터 — self-init, 전 사이트 공용(포털 전용 home-runtime에서 이동)
import {
  currentUserId, userPermissions, setCurrentUserId, setUserPermissions,
  currentUser, currentUserGroup, isCurrentUserAdmin, isCurrentUserSuperAdmin,
  currentUserPages, pageAllowed, permissionStatus, hasPermission, permissionLabel,
  buildGroupPermissions, shortcutStateForPage,
} from "./core-engine/user-context.js";
import {
  LEGACY_LOCAL_STATE_KEY, fetchJsonStore, createDebouncedStore, registerBeaconFlush,
  cloneSavedValue, userWorkspaces, setUserWorkspaces,
} from "./core-engine/workspace-store.js";
import { openRunEventStream, readSseResponse } from "./core-engine/sse-runner.js";
import { emitHook } from "./core-engine/runtime-hooks.js";

const pages = createPageRegistry({
  activeAnalysisJobs,
  agenticServicePage,
  analysisButtons: () => analysisButtonsForConfig(scenarioBuilderConfig),
  canvasPage,
  getCurrentUser: () => currentUser(),
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
  shortcutState: shortcutStateForPage,
  simplePage,
});

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
    team:"마약수사 전담팀", investigator:"임수사",
    ownerUserId:"", assignees:[],
    updated:"방금",
    status:{ label:"진행중", tone:"running", done:2, total:6, pct:33 },
  },
  {
    caseId:"DRUG-2026-002", invTypeId:"d1", domain:"lawsearch",
    targetName:"(주)위장무역", targetType:"company", companyId:"__NO_COMPANY_SELECTED__", drugOrgId:"RO-002", nationality:"한국",
    team:"마약수사 전담팀", investigator:"임수사",
    ownerUserId:"", assignees:[],
    updated:"오늘 09:10",
    status:{ label:"자료수집", tone:"running", done:1, total:6, pct:17 },
  },
  {
    caseId:"DRUG-2026-003", invTypeId:"d5", domain:"lawsearch",
    targetName:"Park James", targetType:"person", personId:"RP-0003", nationality:"미국",
    team:"국제협력팀", investigator:"임수사",
    ownerUserId:"", assignees:[],
    updated:"어제",
    status:{ label:"보고서 검증", tone:"review", done:5, total:6, pct:83 },
  },
  {
    caseId:"FX-2026-001", invTypeId:"f3", domain:"fxsearch",
    targetName:"(주)글로벌송금", targetType:"company", companyId:"FX-CO-101", drugOrgId:"FX-101", nationality:"한국",
    team:"외환수사 전담팀", investigator:"임수사",
    ownerUserId:"", assignees:[],
    updated:"오늘 11:20",
    status:{ label:"진행중", tone:"running", done:2, total:6, pct:33 },
  },
  {
    caseId:"FX-2026-002", invTypeId:"f2", domain:"fxsearch",
    targetName:"이자금", targetType:"person", personId:"RP-0005", nationality:"한국",
    team:"외환수사 전담팀", investigator:"임수사",
    ownerUserId:"", assignees:[],
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
        <div class="main-job-head-right">
          <span class="job-status ${status.tone}">${status.label}</span>
          <button type="button" class="canvas-job-del" title="내 캔버스에서 삭제"
            data-canvas-job-del="${escapeHtml(job.jobId || companyId || "")}"
            data-canvas-job-page="${escapeHtml(job.page || "investigation")}">×</button>
        </div>
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
    ragAdminHtml: adminRagPanelHtml(),
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
  // 사용자가 옮긴 위치가 있으면 재렌더 후에도 유지
  if(node && agenticInspectorPos){
    panel.style.left  = `${agenticInspectorPos.left}px`;
    panel.style.top   = `${agenticInspectorPos.top}px`;
    panel.style.right = "auto";
  }
}

/* 에이전트 설명창(인스펙터 팝업)을 헤더를 잡고 드래그해 이동. 위치는 세션 동안 유지. */
let agenticInspectorPos = null;   // {left, top}
(function setupAgenticInspectorDrag(){
  let drag = null;   // { panel, startX, startY, startLeft, startTop }
  document.addEventListener("mousedown", (e) => {
    const head = e.target.closest && e.target.closest(".agentic-inspect-head");
    if(!head || e.target.closest(".agentic-inspect-close")) return;   // 닫기 버튼 제외
    const panel = head.closest(".agentic-inspector-popup");
    if(!panel) return;
    e.preventDefault();
    drag = { panel, startX:e.clientX, startY:e.clientY, startLeft:panel.offsetLeft, startTop:panel.offsetTop };
    panel.classList.add("dragging");
  });
  document.addEventListener("mousemove", (e) => {
    if(!drag) return;
    const { panel, startX, startY, startLeft, startTop } = drag;
    const parent = panel.offsetParent || document.documentElement;
    const maxLeft = Math.max(0, parent.clientWidth  - panel.offsetWidth);
    const maxTop  = Math.max(0, parent.clientHeight - panel.offsetHeight);
    const left = Math.min(Math.max(0, startLeft + (e.clientX - startX)), maxLeft);
    const top  = Math.min(Math.max(0, startTop  + (e.clientY - startY)), maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    agenticInspectorPos = { left, top };
  });
  document.addEventListener("mouseup", () => {
    if(drag){ drag.panel.classList.remove("dragging"); drag = null; }
  });
})();

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

  let acc = "";
  await readSseResponse(resp, (ev, data) => {
    if(ev === "token" && data.text){ acc += data.text; if(onToken) onToken(acc); }
    else if(ev === "done"){ if(data.text) acc = data.text; }
    else if(ev === "error"){ throw new Error(data.detail || "스트리밍 오류"); }
  }, { shouldStop: () => !agenticRunning });
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

import {
  DB_SEARCH_GROUP,
  RAG_SEARCH_GROUP,
  ANALYSIS_AI_GROUP,
  LLM_SERVICE_GROUP,
  EXTERNAL_AI_GROUP,
  REPORT_AI_GROUP,
  AI_SERVICE_REGISTRY,
  sidebarPermissionGroups,
  ALL_INV_PAGES,
  userGroups,
  sampleUsers,
  defaultUserPermissions,
  DEFAULT_GRANTED_DATASOURCES,
  scenarioSourceEntries,
  scenarioSourceByKey,
  sourceBehaviorOptions,
  sourceDefaultBehavior,
  sourceDefaultBehaviors,
  normalizeTargetType,
  sourceDefaultInstruction,
  sourceBehaviorLabel,
  sourceBehaviorLabels,
  scenarioSuggestedInstruction,
  isAutoScenarioInstruction,
} from "./config/service-registry.js";

/* 구버전 라벨 → 현재 서비스 키 (저장된 시나리오 호환용) */
const SCENARIO_LABEL_SYNONYMS = {
  "심사결과RAG": "rag_audit",
  "수입신고검증": "declaration_verify",
  "품목분류검증": "hs_verify",
  "품목분류": "hs_verify",
  "과세가격평가": "customs_value",
  "웹검색": "web_search",
  "웹정보수집요청": "web_search",
  "웹 정보수집 요청": "web_search",
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

  // 업무특화 RAG 검색 단계: 구버전 라벨("업무특화RAG(이름) 검색하기")을 표준 서비스명으로 정규화하고
  // 라벨에만 있던 RAG 이름은 ragName으로 흡수한다.
  let label = item.label || source?.label || key;
  let legacyRagName = "";
  if(key === "rag_custom_search"){
    const m = /^업무특화RAG\((.+)\) 검색하기$/.exec(label);
    if(m){ legacyRagName = m[1]; label = "업무특화 RAG 검색"; }
  }
  // 웹검색 → 웹 정보수집 요청 개편: 저장된 구 라벨을 새 명칭으로 이행
  if(key === "web_search" && /^웹\s*검색|^웹검색/.test(label)){
    label = "웹 정보수집 요청 AI 서비스";
  }

  return {
    id: item.id || uid(),
    key,
    type: item.type || source?.type || "db",
    label,
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
    // 업무특화 RAG 단계(검색·생성): 대상 RAG 식별자/이름 보존 (구버전은 라벨에서 이름 복구)
    ragId: (key === "rag_custom_search" || key === "rag_create") ? (item.ragId || item.rag_id || "") : "",
    ragName: (key === "rag_custom_search" || key === "rag_create") ? (item.ragName || item.rag_name || legacyRagName || "") : "",
    // 분석범위별 개별 프롬프트(리뷰 모드 상세설정) — 현재 유효한 동작 값만 보존
    behaviorPrompts: (item.behaviorPrompts && typeof item.behaviorPrompts === "object")
      ? Object.fromEntries(Object.entries(item.behaviorPrompts).filter(([value, text]) => validBehaviorValues.has(value) && text))
      : {},
    // 첨부자료 직접 등록(파일명/링크) — 리뷰 모드 입력값 칩에서 편집
    docRef: String(item.docRef || "").trim(),
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

/* 관세조사 집중형 템플릿 5종 — 공통 수집 단계(CDW·빅데이터·전자통관외부·외부기관·신고검증) 뒤에
   집중 검증 단계가 붙고, 심사정보 RAG → 법령 검토 → 보고서 생성/검증으로 마무리한다.
   (서버 파일 data/scenario_templates.json 의 customs 섹션과 동일하게 유지할 것) */
const customsTemplateCommonHead = (mlBehaviors) => [
  { key:"db_cdw", type:"db", label:"CDW 자연어조회", behaviors:["profile_summary","risk_focus","audit_history","declaration_focus"], order:1, instruction:"기업프로파일·통합위험정보·조사/소송 이력·수출입신고 내역을 종합 조회" },
  { key:"ml", type:"ml", label:"빅데이터모델 결과 수집", behaviors:mlBehaviors, order:2, instruction:"빅데이터 위험모델 전체 실행 결과를 수집해 대상 기업의 위험 패턴 비교" },
  { key:"db_external", type:"db_external", label:"전자통관외부정보조회", behaviors:["nts_tax_data","bok_receipt_data"], order:3, instruction:"국세청 세적자료·한국은행 수신자료로 세정·외환 기초정보 확인" },
  { key:"external_agency", type:"external_agency", label:"외부기관정보수집 AI 서비스", behaviors:["dart","nice_bizline","cretop","korea_pds","kpi","kipris","orbis","dnb"], order:4, instruction:"DART·NICE·CRETOP 등 외부기관 사이트의 공시·신용·시세·특허 정보 수집" },
  { key:"declaration_verify", type:"declaration_verify", label:"수입신고검증 AI 서비스", behaviors:["declaration_consistency","missing_evidence"], order:5, instruction:"첨부문서 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 누락 증빙 확인" },
];
const customsTemplateCommonTail = (ragInstr, lawInstr, reportInstr) => [
  { key:"rag_audit", type:"rag_audit", label:"심사정보 RAG", behaviors:["audit_case","recovery_point"], order:7, instruction:ragInstr },
  { key:"law", type:"law", label:"법령 검토 AI 서비스", behaviors:["law_basis","precedent"], order:8, instruction:lawInstr },
  { key:"report_generate", type:"report", label:"보고서 생성 AI 서비스", behaviors:["issue_report"], order:9, instruction:reportInstr },
  { key:"report_validate", type:"validation", label:"보고서 검증 AI 서비스", behaviors:["evidence_validation"], order:10, instruction:"보고서의 근거 충실성과 누락 증빙 검증" },
];
const ML_BEHAVIORS_STD = ["all_models","industry_stats"];
const ML_BEHAVIORS_HS = ["all_models","hs_risk","hs_recommend"];

const scenarioTemplates = [
  {
    id: "customs-valuation",
    name: "관세조사-과세가격평가 집중",
    description: "CDW·빅데이터·외부정보 수집 후 신고검증과 과세가격평가에 집중하는 조사 흐름",
    items: [
      ...customsTemplateCommonHead(ML_BEHAVIORS_STD),
      { key:"customs_value", type:"customs_value", label:"과세가격평가 AI 서비스", behaviors:["valuation_basis","undervaluation"], order:6, required:true, instruction:"과세가격 결정 요소(가산·공제)와 저가신고 가능성 집중 검토" },
      ...customsTemplateCommonTail(
        "과세가격 쟁점 관점의 유사 심사사례와 추징 포인트 정리",
        "과세가격 결정(관세법 제30~35조) 관련 법령·판례·유권해석 근거 검토",
        "과세가격 쟁점 중심 조사보고서 초안 작성",
      ),
    ],
  },
  {
    id: "customs-classification",
    name: "관세조사-품목분류 집중",
    description: "CDW·빅데이터·외부정보 수집 후 신고검증과 품목분류검증에 집중하는 조사 흐름",
    items: [
      ...customsTemplateCommonHead(ML_BEHAVIORS_HS),
      { key:"hs_verify", type:"hs_verify", label:"품목분류검증 AI 서비스", behaviors:["classification_check","alternative_hs"], order:6, required:true, instruction:"HS 분류 적정성과 대체 후보(세율 차이) 집중 검토" },
      ...customsTemplateCommonTail(
        "품목분류 오류·재분류 관점의 유사 심사사례와 추징 포인트 정리",
        "품목분류(관세법 제86조, 관세율표 해석통칙) 관련 법령·판례 근거 검토",
        "품목분류 쟁점 중심 조사보고서 초안 작성",
      ),
    ],
  },
  {
    id: "customs-forex-audit",
    name: "관세조사-외환심사 집중",
    description: "CDW·빅데이터·외환 수신자료 수집 후 신고검증과 이상거래 검증에 집중하는 조사 흐름",
    items: [
      ...customsTemplateCommonHead(ML_BEHAVIORS_STD),
      { key:"abnormal_trade", type:"abnormal_trade", label:"이상거래 검증 AI 서비스", behaviors:["price_pattern","counterparty_pattern","declaration_pattern"], order:6, required:true, instruction:"외환 수수 내역과 연계해 가격·거래상대방·신고 패턴의 이상 징후 검증" },
      ...customsTemplateCommonTail(
        "외환 수수-신고금액 불일치 관점의 유사 심사사례와 추징 포인트 정리",
        "외국환거래법·관세법상 가격조작·허위신고 관련 법령·판례 근거 검토",
        "외환심사 쟁점 중심 조사보고서 초안 작성",
      ),
    ],
  },
  {
    id: "customs-refund",
    name: "관세조사-관세환급 집중",
    description: "CDW·빅데이터·외부정보 수집 후 환급 근거가 되는 과세가격 적정성에 집중하는 조사 흐름",
    items: [
      ...customsTemplateCommonHead(ML_BEHAVIORS_STD),
      { key:"customs_value", type:"customs_value", label:"과세가격평가 AI 서비스", behaviors:["valuation_basis","undervaluation"], order:6, required:true, instruction:"환급 신청의 근거가 되는 과세가격·납부세액의 적정성 집중 검토" },
      ...customsTemplateCommonTail(
        "관세환급 이상·과다환급 관점의 유사 심사사례와 추징 포인트 정리",
        "관세환급특례법·관세법상 환급요건 관련 법령·판례 근거 검토",
        "관세환급 쟁점 중심 조사보고서 초안 작성",
      ),
    ],
  },
  {
    id: "customs-requirement",
    name: "관세조사-통관요건 집중",
    description: "CDW·빅데이터·외부정보 수집 후 통관요건 판정의 기초인 품목분류에 집중하는 조사 흐름",
    items: [
      ...customsTemplateCommonHead(ML_BEHAVIORS_HS),
      { key:"hs_verify", type:"hs_verify", label:"품목분류검증 AI 서비스", behaviors:["classification_check","alternative_hs"], order:6, required:true, instruction:"통관요건(허가·승인·세관장확인 대상) 판정의 기초가 되는 품목분류 적정성 집중 검토" },
      ...customsTemplateCommonTail(
        "수입요건 미구비·요건회피 관점의 유사 심사사례와 추징 포인트 정리",
        "세관장확인 대상 수입요건(관세법 제226조)·개별법령 요건 관련 법령·판례 근거 검토",
        "통관요건 쟁점 중심 조사보고서 초안 작성",
      ),
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
// 리뷰 모드(관세조사 "분석 시나리오 확인 및 설정") 여부 — sharedScenarioWorkbenchHtml 렌더 시 갱신.
// true면 우측 패널은 선택된 AI 서비스의 결과만, 좌측은 분석범위별 개별 프롬프트 편집을 표시한다.
let scenarioReviewMode = false;
// 리뷰 모드 우측 패널 보기 탭: "result"(분석 결과) | "prompt"(통합 프롬프트)
let scenarioResultViewTab = "result";
// 리뷰 모드 분석범위별 상세설정 활성 탭 { itemId: behaviorValue }
let behaviorPromptActiveTab = {};
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
  getRiskOrgProfile: orgId => riskOrgProfiles[orgId] || null,
  isRiskOrgProfileLoading: orgId => Boolean(riskOrgProfileLoading[orgId]),
  loadRiskOrgProfile,
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
  // 기업조사 프로파일 혐의 배너용 — 기업 상세(crime_types 포함) 캐시 접근
  getCompanyDetail: companyId => companyDetailCache[companyId] || null,
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
  scenarioReviewWorkbench,
  getScenarioCompanies: () => scenarioCompanies,
  // 수사정보 분석(insight) 탭 — Chat 영속·기초자료·RAG·저장 접근자
  getUploadedFilesByCompany: companyId => uploadedFilesByCompany[companyId] || [],
  getActiveRagsForCompany: companyId => activeRagsForCompany(companyId),
  getCustomsInsightChat: companyId => customsInsightChatFor(companyId),
  saveCanvasState: () => saveCanvasState(),
};
const customsInvestigation = createCustomsInvestigation(customsDeps);

/* 관세조사 수사정보 분석 대화 저장소 — canvasJobOverrides에 편승해 workspace_state에 영속 */
function customsInsightChatFor(companyId){
  if(!canvasJobOverrides[companyId]) canvasJobOverrides[companyId] = {};
  const override = canvasJobOverrides[companyId];
  if(!Array.isArray(override.insightChat)) override.insightChat = [];
  return override.insightChat;
}

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
let riskOrgProfiles      = {};   // 마약수사 조직 프로파일(지표·연계인물) 캐시
let riskOrgProfileLoading = {};

const GEN_INV_TYPES = [
  { id:"t1", num:"①", label:"관세포탈 수사",              cls:"gi-t1" },
  { id:"t2", num:"②", label:"밀수입·밀수출 수사",         cls:"gi-t2" },
  { id:"t3", num:"③", label:"원산지 위반 수사",            cls:"gi-t3" },
  { id:"t4", num:"④", label:"외환·자금세탁 범죄 수사",    cls:"gi-t4" },
  { id:"t5", num:"⑤", label:"지식재산권 침해 수사",        cls:"gi-t5" },
  { id:"t6", num:"⑥", label:"전략물자·수출통제 위반 수사", cls:"gi-t6" },
  { id:"t7", num:"⑦", label:"기타 수사",                  cls:"gi-t7" },
  { id:"t8", num:"⑧", label:"마약 밀수·유통 수사",         cls:"gi-t8" },
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
  getRiskOrgProfile: orgId => riskOrgProfiles[orgId] || null,
  isRiskOrgProfileLoading: orgId => Boolean(riskOrgProfileLoading[orgId]),
  loadRiskOrgProfile,
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
  giStageWorkbenchHtml,   // 관세수사 4단계 스테이지 워크벤치(관세조사 확인및설정 복사본)
  // 수사보고서 관리 — 증거수집·접견/신문의 요청/결과에서 자동 생성되는 수사보고 목록·수정 저장
  getGiStageDocs: caseId => gisStageDocsForCase(caseId),
  updateGiStageDoc: (caseId, docId, text) => updateGiStageDoc(caseId, docId, text),
  // 수사정보 분석(insight) 탭 deps
  getUploadedFilesByCompany: companyId => uploadedFilesByCompany[companyId] || [],
  saveCanvasState,
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
  // 관계망(network) 서브탭은 노출하지 않는다 — 관계 시각화는 "수사정보 분석" 탭으로 통일
  options.removeIds.push("network");
  // 분석 시나리오 템플릿 서브탭도 수사에서는 노출하지 않는다(워크벤치 내 템플릿 영역 삭제와 동일 취지)
  options.appendIds = options.appendIds.filter(id => id !== "templates");
  // 수사정보 분석 탭 — 설정(enabledSubtabs)에 없어도 활성 사건이 있으면 노출(폴백)
  if(aCase && !options.appendIds.includes("insight")) options.appendIds.push("insight");
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
  gi_web:      { sourceKey:"web_search", type:"agent", label:"웹 정보수집 요청 AI 서비스" },
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
  let result = String(label || "").replaceAll(legacy, "보고서 검증");
  // RAG 생성 AI 서비스 → 업무특화RAG 분석서비스 명칭 통일(저장된 단계 라벨 마이그레이션)
  result = result.replaceAll("RAG 생성 AI 서비스", "업무특화RAG 분석서비스");
  if(result === "RAG 생성" || result === "RAG생성") result = "업무특화RAG 분석서비스";
  return result;
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
  const suffix = webTargetCountSuffix(webTargets);
  return `${behaviors.join(", ")} · ${instruction}${suffix}`;
}

function giScenarioRunInstruction(step, targetType = "company"){
  const sourceKey = step.sourceKey || giCommonSourceKey(step.key);
  const behaviors = sourceBehaviorLabels(sourceKey, step.behaviors);
  const normalizedTarget = normalizeTargetType(targetType || step.target_type || step.targetType);
  const instruction = step.instruction || step.note || sourceDefaultInstruction(sourceKey, normalizedTarget) || "기본 분석";
  const webTargets = scenarioItemWebTargets({ ...step, key: sourceKey });
  return `[분석범위]\n- ${behaviors.join("\n- ")}\n\n${instruction}${extraPromptsRunText(step.extraPrompts)}${webTargetPromptText(webTargets)}`;
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

  /* 헤더 [전체 시나리오 수행] 진행 표시.
     매 갱신마다 버튼이 다시 그려지므로 렌더 직후 상태를 재적용한다. */
  let giRunAllActive = true;
  const giSyncRunAll = () => {
    const control = runAllProgressControl();
    if(giRunAllActive) control.setProgress(stepsToRun.filter(s => aCase.stepStates[s.id] === "done").length, stepsToRun.length);
    else control.reset();
  };
  giSyncRunAll();

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

  /* SSE 이벤트 처리 — 프레임 파싱·종료·연결오류 분류는 core-engine/sse-runner가 담당 */
  giRunEventSource = openRunEventStream(url, {
  onStep(data){
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
      console.error(`[관세수사 실행] 단계 오류 — ${step.label || step.id}\n${data.error || "(상세 없음)"}`);
      aCase.stepStates[step.id]  = "error";
      aCase.stepResults[step.id] = `❗ 실행 오류 — ${step.label || step.id}\n\n${data.error || "실행 중 오류가 발생했습니다.(서버가 상세 사유를 반환하지 않음)"}`;
    }
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
    giSyncRunAll();
  },

  onWorkflow(data, terminal){
    if(data.status === "failed") console.error(`[관세수사 실행] 워크플로 실패` + (data.error ? `\n${data.error}` : " (직전 단계 오류 참조)"));
    if(terminal){
      giRunEventSource = null;
      giRunAllActive = false;
      saveCanvasState();
      refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
      giSyncRunAll();
    }
  },

  onDisconnect(info, ev){
    const running = stepsToRun.some(s => aCase.stepStates[s.id] === "run");
    giRunEventSource = null;
    if(running){
      console.error(`[관세수사 실행] 서버 연결 오류 — ${info.reason} · 엔드포인트 /api/gi_run · 연결상태 ${info.readyState}`, ev);
      stepsToRun.forEach(s => {
        if(aCase.stepStates[s.id] === "run"){
          aCase.stepStates[s.id] = "error";
          aCase.stepResults[s.id] = `❗ ${info.reason}\n\n엔드포인트: /api/gi_run\n서버 상태(실행 여부·콘솔 로그)를 확인한 뒤 다시 실행하세요.`;
        }
      });
    }
    giRunAllActive = false;
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
    giSyncRunAll();
  },
  });
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

  /* 헤더 [전체 시나리오 수행] 진행 표시 — 렌더 직후 재적용(giStreamSteps와 동일 방식) */
  let drugRunAllActive = true;
  const drugSyncRunAll = () => {
    const control = runAllProgressControl();
    if(drugRunAllActive) control.setProgress(stepsToRun.filter(s => aCase.stepStates[s.id] === "done").length, stepsToRun.length);
    else control.reset();
  };
  drugSyncRunAll();

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
  drugRunEventSource = openRunEventStream(`/api/gi_run?${params.toString()}`, {
  onStep(data){
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
      console.error(`[특별수사 실행] 단계 오류 — ${step.label || step.id}\n${data.error || "(상세 없음)"}`);
      aCase.stepStates[step.id] = "error";
      aCase.stepResults[step.id] = `❗ 실행 오류 — ${step.label || step.id}\n\n${data.error || "실행 중 오류가 발생했습니다.(서버가 상세 사유를 반환하지 않음)"}`;
    }
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, renderSpecialInvestigation);
    drugSyncRunAll();
  },

  onWorkflow(data, terminal){
    if(data.status === "failed") console.error(`[특별수사 실행] 워크플로 실패` + (data.error ? `\n${data.error}` : " (직전 단계 오류 참조)"));
    if(terminal){
      drugRunEventSource = null;
      drugRunAllActive = false;
      saveCanvasState();
      refreshScenarioWorkbenchFromCase(aCase, renderSpecialInvestigation);
      drugSyncRunAll();
    }
  },

  onDisconnect(info, ev){
    const running = stepsToRun.some(s => aCase.stepStates[s.id] === "run");
    drugRunEventSource = null;
    if(running){
      console.error(`[특별수사 실행] 서버 연결 오류 — ${info.reason} · 엔드포인트 /api/gi_run · 연결상태 ${info.readyState}`, ev);
      stepsToRun.forEach(s => {
        if(aCase.stepStates[s.id] === "run"){
          aCase.stepStates[s.id] = "error";
          aCase.stepResults[s.id] = `❗ ${info.reason}\n\n엔드포인트: /api/gi_run\n서버 상태(실행 여부·콘솔 로그)를 확인한 뒤 다시 실행하세요.`;
        }
      });
    }
    drugRunAllActive = false;
    saveCanvasState();
    refreshScenarioWorkbenchFromCase(aCase, renderSpecialInvestigation);
    drugSyncRunAll();
  },
  });
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
    description:"공통 CDW 자연어조회를 시작점으로 구성하는 기본 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
    ]),
  },
  {
    id:"t8",
    name:"마약 밀수·유통 수사 템플릿",
    description:"신고검증, 운송경로, 관계망, 통신내역, 범죄수익 추적을 연결하는 마약수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량 불일치, 은닉 의심 화물 패턴"),
      giTemplateStep("gi_route", "밀수 경로·경유지 추적"),
      giTemplateStep("gi_net", "공범·조직 관계망 분석"),
      giTemplateStep("gi_comms", "통신 내역 연계 분석"),
      giTemplateStep("gi_fundtrace", "마약류 자금 흐름 추적"),
      giTemplateStep("gi_rag_inv"),
      giTemplateStep("gi_rag_int", "국제 공조·해외 단속 사례"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
];

const GI_SCENARIO_STEPS = Object.fromEntries(
  giScenarioTemplates.map(template => [template.id, template.items])
);


const defaultGenInvCases = [
  { caseId:"GI-2026-001", targetName:"한국소재무역(주)", invTypeId:"t1", targetType:"company", companyId:"C-1001",
    status:{ label:"진행중", tone:"running", pct:65, done:4, total:7 },
    ownerUserId:"", assignees:[],
    investigator:"임수사", team:"조사국 조사1과", created:"2026-05-10", updated:"방금" },
  { caseId:"GI-2026-002", targetName:"샘플우범자001 (개인)", invTypeId:"t2", targetType:"person", personId:"RP-0001",
    status:{ label:"대기", tone:"wait", pct:10, done:1, total:7 },
    ownerUserId:"", assignees:[],
    investigator:"임수사", team:"세관 수사분야", created:"2026-05-15", updated:"오늘 09:30" },
  { caseId:"GI-2026-003", targetName:"글로벌패션코리아", invTypeId:"t5", targetType:"company", companyId:"C-1003",
    status:{ label:"검토중", tone:"review", pct:85, done:6, total:7 },
    ownerUserId:"", assignees:[],
    investigator:"임수사", team:"조사국 조사1과", created:"2026-04-28", updated:"어제" },
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
let canvasJobOverrides = {};
let canvasRunArchives = {};
// 사전 준비된 분석 결과(읽기전용, data/prepared_analysis_results.json) —
// 관세조사 "분석 시나리오 확인 및 설정" 화면이 실시간 실행 없이 표시하는 아카이브.
// 사용자가 직접 실행한 canvasRunArchives가 항상 우선한다.
let preparedRunArchives = {};
let hiddenCanvasJobsByUser = {};
let overviewArchiveOpen = false;
let customTemplates = [];
let hiddenBuiltinIds = new Set();
let builtinOverrides = {};
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
let scenarioTemplateZoneOpen = false;   // 분석 템플릿 패널 접기(기본 닫힘) — 세션 한정 UI 상태
let scenarioServiceZoneOpen  = false;   // AI 서비스 패널 접기(기본 닫힘) — 분석 템플릿과 동일 토글 패턴
let latestReport = "보고서가 아직 생성되지 않았습니다.";
let latestValidation = "검증 결과가 아직 없습니다.";
let scenarioCompaniesLoading = false;
let companyDetailCache = {};
let companyScenarios = {};   // { [companyId]: scenarioItem[] }
let uploadedFilesByCompany = {};   // { [companyId]: uploadRecord[] } — 분석작업(기업)별 업로드 파일. userWorkspaces 스냅샷으로 사용자별 분리·영속
let ragsByCompany = {};   // { [companyId]: ragRecord[] } — 사건(기업/개인)별 업무특화 RAG. 전역 공유 레지스트리(top-level 저장), 권한으로 가시성 제어
let currentPage = "home";

/* ── 관세행정 Copilot 모드 — 기간계 시스템에서 ?copilot=1 로 호출하는 독립 단일 UI.
   My AI 분석(home)만 노출하고 포털 크롬(업무 탭·바로가기·캔버스·대시보드)은 숨긴다.
   호출 예: window.open("http://<host>:8000/?copilot=1", "kcsCopilot",
            `width=${Math.round(screen.availWidth*0.3)},height=${screen.availHeight}`) */
export const isCopilotMode = new URLSearchParams(location.search).has("copilot");

function applyCopilotChrome(){
  document.body.classList.add("copilot-mode");
  document.title = "관세행정 Copilot";
  const brand = document.querySelector(".tb-brand-text");
  if(brand){
    const strong = brand.querySelector("strong");
    const span = brand.querySelector("span");
    if(strong) strong.textContent = "관세행정 Copilot";
    if(span) span.textContent = "기간계 연계 AI 분석 어시스턴트";
  }
}

/* copilotAdjustComposer — pages/home-runtime.js로 이동 */
let riskDashboardFilter = { query: "", minScore: 0, focus: "all" };

/* 위험도 대시보드 상단 지표(KPI·경보 카드) → 해당 기업만 보기 필터.
   각 항목의 match가 카드에 표시되는 개수와 클릭 시 목록을 함께 결정한다(항상 일치).

   경보 5종의 판정값은 company_profiles가 아니라 import_risk_scores의 지표율이며,
   이 값은 DB의 company_risk_indicator.score(근거데이터에서 산출한 위험지표)와 동일하다.
   50점 이상을 '의심 수준'으로 보고 6종 지표에 같은 기준을 적용한다. */
const RISK_INDICATOR_THRESHOLD = 50;
const riskRateAtLeast = field => c => (c[field] || 0) >= RISK_INDICATOR_THRESHOLD;

/* code — DB company_risk_indicator.indicator_code. 해당 기업들의 근거 레코드 수를 합산해
   "N개사 · 근거 M건"으로 병기한다(근거 건수는 API의 risk_evidence로 내려온다). */
const RISK_DASH_FOCUS = {
  all:      { label: "분석대상 기업",        match: () => true },
  // 조사필요 — 전체 위험도 90점 이상(카드 밴드 urgent와 동일 경계)
  audit:    { label: "조사필요",             match: c => (c.risk_score || 0) >= 90 },
  // 심사필요 — 70~90점(카드 밴드 caution). 조사필요와 겹치지 않게 상한을 둔다
  review:   { label: "심사필요",             match: c => (c.risk_score || 0) >= 70 && (c.risk_score || 0) < 90 },
  underval: { label: "신고가격오류 의심",    code: "undervaluation",
              match: riskRateAtLeast("undervaluation_suspicion_rate") },
  hs:       { label: "품목분류 위장 의심",   code: "hs_classification",
              match: riskRateAtLeast("hs_classification_error_rate") },
  royalty:  { label: "권리사용료 미신고",    code: "related_party",
              match: riskRateAtLeast("related_party_anomaly_rate") },
  forex:    { label: "외환 송금액 불일치",   code: "offshore_fund",
              match: riskRateAtLeast("offshore_fund_concealment_suspicion_rate") },
  refund:   { label: "환급금액 오신청 의심", code: "customs_refund",
              match: riskRateAtLeast("customs_refund_anomaly_rate") },
};

/* 지표 해당 기업 수와 근거 건수 — 카드 표시값과 클릭 후 목록이 같은 조건에서 나온다 */
function riskFocusStats(focus){
  const def = RISK_DASH_FOCUS[focus];
  if(!def) return { companies: 0, evidence: 0 };
  const matched = riskDashboardCompanies().filter(def.match);
  const evidence = def.code
    ? matched.reduce((sum, c) => sum + Number((c.risk_evidence || {})[def.code] || 0), 0)
    : 0;
  return { companies: matched.length, evidence };
}

function riskFocusCount(focus){
  return riskFocusStats(focus).companies;
}

function riskFocusMatch(company){
  return (RISK_DASH_FOCUS[riskDashboardFilter.focus] || RISK_DASH_FOCUS.all).match(company);
}

/* 관세포탈 대시보드 대상 — 관세조사 대상 기업(entity_role="audit")만 본다.
   우범기업(밀수·마약·외환)과 덤핑관리 기업은 각자 전용 화면에서 다루므로 제외한다.
   entity_role이 비어 있는 구 데이터는 관세조사 대상으로 간주(하위호환). */
function isAuditTargetCompany(company){
  const role = company.entity_role;
  return !role || role === "audit";
}

function riskDashboardCompanies(){
  return scenarioCompanies.filter(isAuditTargetCompany);
}

/* 검색어·스코어·포커스를 모두 적용한 목록 — 위험도 내림차순(동점이면 업체명순) */
function riskDashboardFiltered(){
  const q = riskDashboardFilter.query.toLowerCase();
  const minS = riskDashboardFilter.minScore;
  return riskDashboardCompanies().filter(c => {
    // 검색어는 소문자로 정규화하므로 기업ID도 소문자로 비교해야 한다
    // (그렇지 않으면 화면에 보이는 대로 "C-1041"을 입력했을 때 매칭되지 않는다)
    if(q && !((c.company_name||"").toLowerCase().includes(q)
           || (c.company_id||"").toLowerCase().includes(q))) return false;
    if(minS && (c.risk_score||0) < minS) return false;
    return riskFocusMatch(c);
  }).sort((a, b) => (b.risk_score||0) - (a.risk_score||0)
    || String(a.company_name||"").localeCompare(String(b.company_name||""), "ko"));
}

/* 코치 상태·컴포저 렌더·홈 카드/입력 패널 — pages/home-runtime.js로 이동 */

/* 공용 유틸(시나리오 공유·clarify 입력에서도 사용) — 홈 분리 시 엔진에 잔류 */
export function normalizeEmailIds(value){
  return [...new Set(String(value || "")
    .split(/[,\s;]+/)
    .map(item => item.trim())
    .filter(Boolean)
  )];
}

export function isValidEmailId(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// 공유 이메일 패널/칩 갱신.
// - MyAI(홈): 이메일 폼·칩은 mail_share 카드 안에 인라인 렌더됨(#homeShareEmailChips 갱신).
// - intl 등 정적 패널 페이지: #homeMailSharePanel 표시/숨김 토글(존재할 때만).

export function homeMountClarify(targetEl, svcLabel, def, onSubmit){
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


// 카드 우측 '프롬프트 및 수행 결과' 패널 — 자동등록·수정 가능 프롬프트 + 결과 + 단일 수행.


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

/* 등록분(URL/키워드) → 프롬프트 본문·요약 표기 공용 헬퍼 */
function webTargetPromptText(webTargets){
  const urls = webTargets.filter(t => t.url);
  const kws = webTargets.filter(t => !t.url && t.query);
  return (urls.length ? `\n\n[직접 등록 URL]\n${urls.map(t => `- ${t.url}${t.query ? `\n  검색 내용: ${t.query}` : ""}`).join("\n")}` : "")
    + (kws.length ? `\n\n[주요 검색 키워드]\n${kws.map(t => `- ${t.query}`).join("\n")}` : "");
}
function webTargetCountSuffix(webTargets){
  const urlN = webTargets.filter(t => t.url).length;
  const kwN = webTargets.length - urlN;
  const parts = [];
  if(urlN) parts.push(`URL ${urlN}건`);
  if(kwN) parts.push(`키워드 ${kwN}건`);
  return parts.length ? ` · ${parts.join("·")}` : "";
}

function normalizeWebTargets(value){
  const rawItems = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];
  rawItems.forEach(item => {
    if(!item) return;
    const url = String(item.url || item.href || "").trim();
    const query = String(item.query || item.keyword || item.searchText || item.search_text || "").trim();
    // 로그인 필요 사이트용 선택 자격증명(데모: workspace_state 평문 저장, 화면에는 PW 마스킹만 표시)
    const loginId = String(item.loginId || item.login_id || "").trim();
    const loginPw = String(item.loginPw || item.login_pw || "");
    if(!url && !query) return;   // URL 직접 등록 또는 키워드 단독 등록 모두 허용
    const key = `${url}\n${query}`;
    if(seen.has(key)) return;
    seen.add(key);
    normalized.push({ url, query, loginId, loginPw, login_id: loginId, login_pw: loginPw });
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
  // 수집 대상 URL 등록은 분석범위에서 "URL 직접 등록"을 선택했을 때만 표시
  const activeBehaviors = Array.isArray(item.behaviors) && item.behaviors.length
    ? item.behaviors
    : sourceDefaultBehaviors(item.key);
  if(!activeBehaviors.includes("direct_url")) return "";
  const targets = scenarioItemWebTargets(item);
  const urlId = scope === "template" ? "templateWebTargetUrl" : "scenarioWebTargetUrl";
  const queryId = scope === "template" ? "templateWebTargetQuery" : "scenarioWebTargetQuery";
  const loginIdId = scope === "template" ? "templateWebTargetLoginId" : "scenarioWebTargetLoginId";
  const loginPwId = scope === "template" ? "templateWebTargetLoginPw" : "scenarioWebTargetLoginPw";
  const cards = targets.length
    ? targets.map((target, index) => `
        <div class="scenario-web-target-chip">
          <span>
            <strong>${target.url ? escapeHtml(target.url) : `🔍 ${escapeHtml(target.query)}`}</strong>
            <small>${target.url ? escapeHtml(target.query || "수집 내용 미지정") : "주요 검색 키워드"}</small>
            ${target.loginId ? `<small class="scenario-web-target-login">🔒 로그인정보 등록 (${escapeHtml(target.loginId)} / •••)</small>` : ""}
          </span>
          <button type="button" data-web-target-remove="${scope}" data-index="${index}" aria-label="등록 삭제">×</button>
        </div>
      `).join("")
    : `<span class="scenario-web-target-empty">등록된 URL·검색 키워드가 없습니다.</span>`;
  return `
    <div class="scenario-web-target-panel">
      <div class="scenario-web-target-head">
        <strong>수집 대상 URL·검색 키워드 등록</strong>
        <span>수집을 요청할 URL을 직접 등록하거나, URL 없이 주요 검색 키워드만 등록할 수 있습니다. 로그인이 필요한 사이트는 ID/PW를 함께 등록하세요.</span>
      </div>
      <div class="scenario-web-target-form">
        <input id="${urlId}" class="scenario-web-target-url" type="url" placeholder="https:// (선택 — 키워드만 등록 가능)">
        <input id="${queryId}" class="scenario-web-target-query" type="text" placeholder="수집할 내용 / 주요 검색 키워드">
        <input id="${loginIdId}" class="scenario-web-target-login-id" type="text" placeholder="로그인 ID (선택)" autocomplete="off">
        <input id="${loginPwId}" class="scenario-web-target-login-pw" type="password" placeholder="로그인 PW (선택)" autocomplete="new-password">
        <button type="button" class="btn secondary" data-web-target-add="${scope}">등록</button>
      </div>
      <div class="scenario-web-target-list">${cards}</div>
    </div>
  `;
}

/* 관세조사 스테이지 UI: '외부데이터 수집'의 웹 정보수집 대상 항목.
   시나리오에 없으면(createIfMissing) 등록 시점에 자동 추가해 항시 등록 가능하게 한다. */
function ciStageWebItem(createIfMissing = false){
  if(!document.getElementById("ciExtWebPanel")) return null;   // 관세조사 스테이지 UI가 아니면 미개입
  let item = scenarioItems.find(entry => entry.key === "web_search");
  if(!item && createIfMissing){
    const source = scenarioSourceByKey("web_search");
    if(!source) return null;
    const behaviors = [...new Set([...(sourceDefaultBehaviors("web_search") || []), "direct_url"])];
    item = {
      id: uid(), key: "web_search", type: source.type, label: source.label,
      behaviors, order: scenarioItems.length + 1,
      targetType: "company", target_type: "company",
      instruction: scenarioSuggestedInstruction("web_search", "company", behaviors),
      shareRecipients: [], webTargets: [],
    };
    scenarioItems.push(item);
    normalizeScenarioOrder();
    saveCompanyScenario();
    renderScenarioList();
    setScenarioStatus("웹 정보수집 요청 AI 서비스가 시나리오에 추가되었습니다");
    // normalizeScenarioOrder가 배열 항목을 복제 재할당하므로 배열에서 실물 참조를 재취득한다
    item = scenarioItems.find(entry => entry.key === "web_search");
  }
  return item;
}

function renderWebTargetPanel(scope){
  // 리뷰 모드(시나리오 스코프): URL 등록 패널은 "URL 직접 등록" 탭 본문에 내장 —
  // 좌측 독립 컨테이너 대신 탭 안의 슬롯을 갱신한다(등록/삭제 후 재렌더 경로 포함).
  if(scope === "scenario" && scenarioReviewMode){
    // 4단계 스테이지 UI: '외부데이터 수집' 단계에 웹 정보수집(URL 등록)을 통합 표시.
    // 서비스가 시나리오에 없어도 폼은 항시 렌더 — 등록 시 서비스가 자동 추가된다.
    // 관세조사(#ciExtWebPanel)·관세수사(#gisExtWebPanel)는 같은 폼을 각자 슬롯에 렌더.
    const ext = document.getElementById("ciExtWebPanel") || document.getElementById("gisExtWebPanel");
    if(ext){
      const webItem = scenarioItems.find(item => item.key === "web_search");
      const formItem = webItem
        ? { ...webItem, behaviors: [...new Set([...(webItem.behaviors?.length ? webItem.behaviors : sourceDefaultBehaviors("web_search") || []), "direct_url"])] }
        : { key: "web_search", behaviors: ["direct_url"], webTargets: [], web_targets: [] };
      ext.innerHTML = webTargetPanelHtml(formItem, scope)
        + (webItem ? "" : `<p class="muted" style="font-size:11.5px;margin:6px 0 0">등록 시 '웹 정보수집 요청 AI 서비스'가 3단계 시나리오에 자동 추가됩니다.</p>`);
      const slot = document.querySelector("#scenarioBehaviorPromptList [data-behavior-url-slot]");
      if(slot) slot.innerHTML = `<div class="muted" style="font-size:12px">URL·검색 키워드 등록은 좌측 '2. 외부데이터 수집' 단계에서 관리합니다.</div>`;
      const legacy = document.getElementById("scenarioWebTargetPanel");
      if(legacy) legacy.innerHTML = "";
      return;
    }
    const slot = document.querySelector("#scenarioBehaviorPromptList [data-behavior-url-slot]");
    if(slot) slot.innerHTML = webTargetPanelHtml(shareEmailScopeItem(scope), scope);
    const legacy = document.getElementById("scenarioWebTargetPanel");
    if(legacy) legacy.innerHTML = "";
    return;
  }
  const panelId = scope === "template" ? "templateWebTargetPanel" : "scenarioWebTargetPanel";
  const panel = document.getElementById(panelId);
  if(!panel) return;
  panel.innerHTML = webTargetPanelHtml(shareEmailScopeItem(scope), scope);
}

function addWebTargetToScope(scope){
  // 스테이지 UI(관세조사 ci/관세수사 gis): 선택 상태와 무관하게 웹 정보수집 항목에 등록(없으면 자동 추가)
  const item = (scope === "scenario" && (ciStageWebItem(true) || gisStageWebItem(true))) || shareEmailScopeItem(scope);
  if(!item || item.key !== "web_search") return false;
  const urlId = scope === "template" ? "templateWebTargetUrl" : "scenarioWebTargetUrl";
  const queryId = scope === "template" ? "templateWebTargetQuery" : "scenarioWebTargetQuery";
  const loginIdId = scope === "template" ? "templateWebTargetLoginId" : "scenarioWebTargetLoginId";
  const loginPwId = scope === "template" ? "templateWebTargetLoginPw" : "scenarioWebTargetLoginPw";
  const urlInput = document.getElementById(urlId);
  const queryInput = document.getElementById(queryId);
  const loginIdInput = document.getElementById(loginIdId);
  const loginPwInput = document.getElementById(loginPwId);
  const url = String(urlInput?.value || "").trim();
  const query = String(queryInput?.value || "").trim();
  const loginId = String(loginIdInput?.value || "").trim();
  const loginPw = String(loginPwInput?.value || "");
  if(!url && !query) return false;   // URL 직접 등록 또는 주요 검색 키워드 단독 등록
  if(url && !isValidHttpUrl(url)){
    alert("http 또는 https URL을 입력하세요.");
    urlInput?.focus();
    return false;
  }
  setScenarioItemWebTargets(item, [...scenarioItemWebTargets(item), { url, query, loginId, loginPw }]);
  if(urlInput) urlInput.value = "";
  if(queryInput) queryInput.value = "";
  if(loginIdInput) loginIdInput.value = "";
  if(loginPwInput) loginPwInput.value = "";
  if(scope === "scenario") persistScenarioWebTargetState();
  renderWebTargetPanel(scope);
  return true;
}

function removeWebTargetFromScope(scope, index){
  const item = (scope === "scenario" && (ciStageWebItem(false) || gisStageWebItem(false))) || shareEmailScopeItem(scope);
  if(!item || item.key !== "web_search") return;
  setScenarioItemWebTargets(item, scenarioItemWebTargets(item).filter((_, i) => i !== index));
  if(scope === "scenario") persistScenarioWebTargetState();
  renderWebTargetPanel(scope);
}

/* 시나리오 스코프 URL 등록 상태 영속 — 관세수사 스테이지에서는 사건 단계로 저장 */
function persistScenarioWebTargetState(){
  if(document.getElementById("gisExtWebPanel")){
    const aCase = activeGenInvCase();
    if(aCase){ saveWorkbenchToCaseSteps(aCase); saveCanvasState(); }
    return;
  }
  saveScenarioShareEmailState();
}

function addPendingScenarioWebTarget(){
  const url = document.getElementById("scenarioWebTargetUrl")?.value || "";
  const query = document.getElementById("scenarioWebTargetQuery")?.value || "";
  if(!url.trim() && !query.trim()) return true;
  return addWebTargetToScope("scenario");
}

/* ── 업무특화 RAG 단계: 신규 구축된 RAG 선택 + 최적 프롬프트 적용 ──
   대상: rag_custom_search(검색 단계) + rag_create(업무특화RAG 분석서비스).
   고객·일반·특수 수사 시나리오 모두 동일한 syncScenarioEditor/패널을 공유한다. */
function isRagSelectStep(item){
  return !!item && (item.key === "rag_custom_search" || item.key === "rag_create");
}
/* 업무특화 RAG 단계의 권한: 표준 서비스 권한 키 대신 RAG 자체의 검색권한(업무특화RAG 서비스에서 설정)을 따른다.
   지정된 RAG에 접근 권한이 있으면 실행 가능, 없으면 잠금. RAG 미지정 단계는 구성 자체를 허용한다. */
function scenarioItemPermissionStatus(item){
  if(isRagSelectStep(item)){
    if(item.ragId){
      const f = findRagById(item.ragId);
      return (f && f.rag.status !== "suspended" && !ragExpired(f.rag) && canAccessRag(f.rag)) ? "granted" : "locked";
    }
    return "granted";
  }
  return permissionStatus(item.key);
}
function scenarioItemHasPermission(item){
  return scenarioItemPermissionStatus(item) === "granted";
}
function scenarioItemRagId(item){
  return isRagSelectStep(item) ? (item.ragId || "") : "";
}
function setScenarioItemRag(item, ragId, ragName){
  if(!isRagSelectStep(item)) return;
  item.ragId = ragId || "";
  item.ragName = ragName || "";
  // 라벨은 표준 AI 서비스명 유지 — 선택한 RAG 이름은 설명(instruction)에 반영된다
}
function customRagPromptFor(name, key){
  if(key === "rag_create")
    return `업무특화 RAG "${name}" 구성에 이번 선택 자료를 반영하고, 핵심 항목·근거를 정리한다.`;
  return `업무특화 RAG "${name}"에서 이번 조사 대상과 관련된 근거·유사사례를 우선 검색하고, 핵심 결과를 요약한다.`;
}
function ragSelectPanelHtml(item){
  if(!isRagSelectStep(item)) return "";
  // 권한이 있는 모든 업무특화 RAG 표시(사건 무관, 사용중지·만료 제외)
  const rags = accessibleRags();
  const optLabel = r => `${r.name}${r.subjectName ? ` · ${r.subjectName}` : ""}`;
  const options = [`<option value="">— 업무특화 RAG 선택 —</option>`]
    .concat(rags.map(r => `<option value="${escapeHtml(r.id)}" ${item.ragId === r.id ? "selected" : ""}>${escapeHtml(optLabel(r))}</option>`))
    .join("");
  const selected = rags.find(r => r.id === item.ragId);
  const useWord = item.key === "rag_custom_search" ? "검색할" : "사용할";
  const meta = selected
    ? escapeHtml(selected.meta || "")
    : (rags.length ? `${useWord} RAG를 선택하면 해당 RAG 기준으로 프롬프트가 구성됩니다.`
                   : "사용 권한이 있는 업무특화 RAG가 없습니다. 기초자료 등록에서 먼저 생성하세요.");
  return `
    <div class="scenario-rag-panel">
      <div class="scenario-rag-head">
        <strong>업무특화 RAG 선택</strong>
        <span>권한이 있는 모든 업무특화 RAG 중 이 단계가 ${useWord} RAG를 지정하고 프롬프트에 반영합니다.</span>
      </div>
      <div class="scenario-rag-form">
        <select class="scenario-rag-select" data-rag-select ${rags.length ? "" : "disabled"}>${options}</select>
        <button type="button" class="btn secondary" data-rag-fill-prompt ${rags.length ? "" : "disabled"}>선택 RAG로 프롬프트 채우기</button>
      </div>
      <div class="scenario-rag-meta">${meta}</div>
    </div>`;
}
function renderRagSelectPanel(){
  const panel = document.getElementById("scenarioRagPanel");
  if(!panel) return;
  const item = selectedScenarioItem();
  panel.innerHTML = ragSelectPanelHtml(item);
  const sel = panel.querySelector("[data-rag-select]");
  if(sel) sel.addEventListener("change", () => selectScenarioRag(sel.value));
}
function selectScenarioRag(ragId){
  const item = selectedScenarioItem();
  if(!isRagSelectStep(item)) return;
  const rag = accessibleRags().find(r => r.id === ragId);
  setScenarioItemRag(item, ragId, rag ? rag.name : "");
  // RAG 선택 시 해당 RAG 기준 최적 프롬프트를 채워 적용
  if(rag){
    item.instruction = customRagPromptFor(rag.name, item.key);
    const el = document.getElementById("scenarioInstruction");
    if(el) el.value = item.instruction;
  }
  saveScenarioShareEmailState();   // 고객/일반/특수 수사 모두 올바른 저장소에 영속
  renderRagSelectPanel();
  renderScenarioList();
}
function fillScenarioRagPrompt(){
  const item = selectedScenarioItem();
  if(!isRagSelectStep(item)) return;
  const name = item.ragName || "선택한 업무특화 RAG";
  item.instruction = customRagPromptFor(name, item.key);
  const el = document.getElementById("scenarioInstruction");
  if(el) el.value = item.instruction;
  saveScenarioShareEmailState();
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
    homeMountClarify(slot, "웹 정보수집 요청 AI 서비스(수집 URL 등록)",
      { label: "수집할 URL", placeholder: "예: https://example.com/notice" },
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
    setScenarioStatus("수집할 URL을 1개 이상 등록 후 다시 실행하세요");
  }
  return false;
}

/* 홈 픽커·실행 파이프라인·AI통합분석결과 렌더 — pages/home-runtime.js로 이동 */

/* 진행작업 상태 저장소: 서버 파일(data/workspace_state.json).
   - 로드: GET /api/workspace_state (없으면 기존 localStorage 상태를 1회 이행 후 제거)
   - 저장: 디바운스 POST, 페이지 종료 시 sendBeacon 플러시 (localStorage 미사용)
   저장소 접근(fetchJsonStore·디바운스·비콘)은 core-engine/workspace-store.js가 담당. */
const workspaceStore = createDebouncedStore("/api/workspace_state", { label: "진행작업 상태" });
const templatesStore = createDebouncedStore("/api/analysis_templates", { label: "분석 템플릿" });
registerBeaconFlush([workspaceStore, templatesStore]);

async function loadCanvasState(){
  try{
    let saved = await fetchJsonStore("/api/workspace_state");
    if(!saved || !Object.keys(saved).length){
      // 서버 파일이 없으면 기존 localStorage 상태를 1회 이행
      saved = JSON.parse(localStorage.getItem(LEGACY_LOCAL_STATE_KEY) || "{}");
      if(Object.keys(saved).length){
        fetch("/api/workspace_state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saved),
        }).catch(() => {});
      }
    }
    // 서버 파일이 단일 저장소 — 과거 백업으로 남아 있던 localStorage 항목은 정리
    try{ localStorage.removeItem(LEGACY_LOCAL_STATE_KEY); }catch(e){ /* noop */ }
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
    if(saved.uploadedFilesByCompany && typeof saved.uploadedFilesByCompany === "object") uploadedFilesByCompany = saved.uploadedFilesByCompany;
    if(saved.ragsByCompany && typeof saved.ragsByCompany === "object") ragsByCompany = saved.ragsByCompany;
    // 구버전(전역 레지스트리 도입 전)에는 업무특화 RAG가 사용자 워크스페이스 내부에 저장됐고,
    // 그 위치는 복원 대상이 아니어서 시나리오 RAG 선택이 비어 보였다 — 전역 레지스트리로 1회 이행.
    if(saved.userWorkspaces && typeof saved.userWorkspaces === "object"){
      Object.entries(saved.userWorkspaces).forEach(([wsUserId, ws]) => {
        const legacy = ws && ws.ragsByCompany;
        if(!legacy || typeof legacy !== "object") return;
        Object.entries(legacy).forEach(([cid, arr]) => {
          if(!Array.isArray(arr) || !arr.length) return;
          if(!Array.isArray(ragsByCompany[cid])) ragsByCompany[cid] = [];
          arr.forEach(r => {
            if(!r || !r.name) return;
            if(ragsByCompany[cid].some(x => x && (x.id === r.id || x.name === r.name))) return;
            ragsByCompany[cid].push({ id: uid(), status: "active", ownerUserId: wsUserId, companyId: cid, ...r });
          });
        });
        delete ws.ragsByCompany;   // 이행 완료 — 다음 저장 시 구 위치 제거
      });
    }
    if(saved.userPermissions && typeof saved.userPermissions === "object"){
      setUserPermissions({...defaultUserPermissions, ...saved.userPermissions});
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
    // 사전 준비된 분석 결과 로드(서버 읽기전용 파일 — workspace_state에는 저장되지 않음)
    const prepared = await fetchJsonStore("/api/prepared_results");
    if(prepared && typeof prepared.archives === "object" && prepared.archives) preparedRunArchives = prepared.archives;
    if(saved.hiddenCanvasJobsByUser && typeof saved.hiddenCanvasJobsByUser === "object") hiddenCanvasJobsByUser = saved.hiddenCanvasJobsByUser;
    if(saved.userWorkspaces && typeof saved.userWorkspaces === "object") setUserWorkspaces(saved.userWorkspaces);
    if(saved.agenticServicesByGroup && typeof saved.agenticServicesByGroup === "object") agenticServicesByGroup = saved.agenticServicesByGroup;
    if(saved.ciScenarioNotes && typeof saved.ciScenarioNotes === "object") ciScenarioNotesByCompany = saved.ciScenarioNotes;
    if(Array.isArray(saved.ciExtAgencies)) ciExtAgencyChecked = new Set(saved.ciExtAgencies);
    if(saved.ciExtUrlOpen === false) ciExtUrlOpen = false;
    if(Array.isArray(saved.ciBaseAiServices) && saved.ciBaseAiServices.length) ciBaseAiServices = saved.ciBaseAiServices;
    if(saved.ciBaseNotes && typeof saved.ciBaseNotes === "object") ciBaseNotesByCompany = saved.ciBaseNotes;
    if(saved.giStageScenarioNotes && typeof saved.giStageScenarioNotes === "object") gisScenarioNotesByCase = saved.giStageScenarioNotes;
    if(Array.isArray(saved.giStageExtAgencies)) gisExtAgencyChecked = new Set(saved.giStageExtAgencies);
    if(saved.giStageExtUrlOpen === false) gisExtUrlOpen = false;
    if(Array.isArray(saved.giStageBaseAiServicesV2) && saved.giStageBaseAiServicesV2.length) gisBaseAiServices = saved.giStageBaseAiServicesV2;
    if(saved.giStageBaseNotes && typeof saved.giStageBaseNotes === "object") gisBaseNotesByCase = saved.giStageBaseNotes;
    if(saved.giStageEvidence && typeof saved.giStageEvidence === "object") gisEvidenceByCase = saved.giStageEvidence;
    if(saved.giStageInterview && typeof saved.giStageInterview === "object") gisInterviewByCase = saved.giStageInterview;
    if(saved.giStageEvidenceNotes && typeof saved.giStageEvidenceNotes === "object") gisEvidenceNotesByCase = saved.giStageEvidenceNotes;
    if(saved.giStageInterviewNotes && typeof saved.giStageInterviewNotes === "object") gisInterviewNotesByCase = saved.giStageInterviewNotes;
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
    if(saved.currentUserId) setCurrentUserId(saved.currentUserId);
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
    uploadedFilesByCompany,
    ragsByCompany,
    userPermissions,
    canvasJobOverrides,
    canvasRunArchives,
    hiddenCanvasJobsByUser,
    userWorkspaces,
    agenticServicesByGroup,
    ciScenarioNotes: ciScenarioNotesByCompany,
    ciExtAgencies: [...ciExtAgencyChecked],
    ciExtUrlOpen,
    ciBaseAiServices,
    ciBaseNotes: ciBaseNotesByCompany,
    giStageScenarioNotes: gisScenarioNotesByCase,
    giStageExtAgencies: [...gisExtAgencyChecked],
    giStageExtUrlOpen: gisExtUrlOpen,
    // V2: 기초 AI 서비스 기본 구성 개편(수입신고검증·과세가격평가·품목분류검증) —
    // 구 키(giStageBaseAiServices)의 저장분이 새 기본값을 덮어쓰지 않도록 키를 올림
    giStageBaseAiServicesV2: gisBaseAiServices,
    giStageBaseNotes: gisBaseNotesByCase,
    giStageEvidence: gisEvidenceByCase,
    giStageInterview: gisInterviewByCase,
    giStageEvidenceNotes: gisEvidenceNotesByCase,
    giStageInterviewNotes: gisInterviewNotesByCase,
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

function saveTemplatesState(){
  templatesStore.save(buildTemplatesPayload());
}

function saveCanvasState(){
  try{
    saveCurrentUserWorkspace();
    workspaceStore.save(buildWorkspaceStatePayload());
  }catch(error){
    console.warn("진행작업 상태를 저장하지 못했습니다.", error);
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
    uploadedFilesByCompany: cloneSavedValue(uploadedFilesByCompany, {}),
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
    uploadedFilesByCompany: cloneSavedValue(uploadedFilesByCompany, {}),
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
  uploadedFilesByCompany = workspace.uploadedFilesByCompany && typeof workspace.uploadedFilesByCompany === "object"
    ? cloneSavedValue(workspace.uploadedFilesByCompany, {})
    : {};
  // ragsByCompany는 사용자 워크스페이스에서 복원하지 않음 — 전역 공유 레지스트리(top-level 저장)로 유지
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
  // 사전 준비된 결과가 있으면 그 시나리오 구성을 사용 — stepOutputs 키(item.id)와 일치해야 결과가 표시된다
  const prepared = preparedRunArchives[companyId];
  if(prepared?.scenarioItems?.length) return prepared.scenarioItems.map((item, index) => normalizeScenarioItem({...item}, index));
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

/* permissionStatus·hasPermission·permissionLabel — core-engine/user-context.js로 이동 */

export function uniqueByKey(items){
  const seen = new Set();
  return items.filter(item => {
    if(!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

export function requestPermissions(keys){
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


/* currentUser·currentUserGroup·isCurrentUserAdmin·isCurrentUserSuperAdmin·
   currentUserPages·pageAllowed — core-engine/user-context.js로 이동 */

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
  if(!Array.isArray(defs) || !defs.length) return;
  // 서버 파일(data/scenario_templates.json)이 빌트인의 원본 —
  // 코드 시드는 파일이 없을 때의 초기값이며, 파일 기준으로 목록 자체(추가·삭제 포함)를 재구성한다.
  const next = defs
    .filter(def => def && def.id && Array.isArray(def.items) && def.items.length)
    .map(def => ({
      ...def,
      name: def.name || def.id,
      description: def.description || "",
      items: def.items.map((item, index) => ({ ...item, order: item.order ?? index + 1 })),
    }));
  if(!next.length) return;
  targetArray.splice(0, targetArray.length, ...next);
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

export function cssString(value){
  if(window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

/* buildGroupPermissions — core-engine/user-context.js로 이동 */

/* 사용자 전환 시: 진행 중이던 모든 SSE 분석 실행을 중단한다 */
function stopAllRunningWork(){
  [
    ["scenarioEventSource", () => scenarioEventSource, () => { scenarioEventSource = null; }],
    ["scenarioSingleEventSource", () => scenarioSingleEventSource, () => { scenarioSingleEventSource = null; }],
    ["giRunEventSource", () => giRunEventSource, () => { giRunEventSource = null; }],
    ["drugRunEventSource", () => drugRunEventSource, () => { drugRunEventSource = null; }],
  ].forEach(([, get, clear]) => {
    const source = get();
    if(source){ try { source.close(); } catch (e) { /* noop */ } clear(); }
  });
  emitHook("home-stop-runs");   // 홈 실행 스트림 중단(포털 home-runtime에서만 구독)
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
  setCurrentUserId(userId);
  const user  = sampleUsers.find(u => u.id === userId) || sampleUsers[0];
  const group = userGroups.find(g => g.id === user.groupId) || userGroups[0];
  setUserPermissions(buildGroupPermissions(group));
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
  // 상단 메뉴 오른쪽 끝 관리자 버튼 — 관리자에게만 노출
  const adminBtn = document.getElementById("tbAdminBtn");
  if(adminBtn) adminBtn.style.display = isCurrentUserAdmin() ? "" : "none";
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
      // 별도 사이트(조사관·수사관·보고서)에서는 홈이 없으므로 해당 사이트 기본 페이지로 복귀
      render(isStandalonePlatform() ? platformBootPage() : "home");
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
        <div class="resize-gutter x" data-resize-target="next" data-resize-min="280" title="드래그하여 보고서·검증 영역 폭 조절"></div>
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
  // 관계망 분석(Main 독립 탭): web/KCS_Investigation.html 폐쇄망 플랫폼을 iframe 임베드.
  // 프로파일 내부 관계망(networkGraphPanelHtml)과는 분리된 독립 분석 화면이다.
  // .content 패딩(12/14px)을 음수 마진으로 상쇄해 topbar(64px) 아래 전 영역을 꽉 채운다.
  return `
    <section style="margin:-12px -14px -14px;height:calc(100vh - 64px);display:flex;flex-direction:column;overflow:hidden">
      <iframe src="/KCS_Investigation.html" title="관계망 분석"
        style="flex:1;width:100%;border:0;display:block"></iframe>
    </section>
  `;
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

/* 전역 상태 동기화: 카드에 저장된 상태가 실행 이력(아카이브·사전 준비 결과)보다
   뒤처지면 읽기 시점에 보정한다 — 실행 중·시나리오 변경(재실행 필요) 상태는 유지. */
function syncJobStatusWithArchive(job){
  const st = job.status || {};
  if(st.tone === "running" || job.scenarioChanged) return job;
  const archive = currentRunArchive(job.companyId);
  const items = archive?.scenarioItems || [];
  if(!items.length) return job;
  const outputs = archive.stepOutputs || {};
  const done = items.filter(it => outputs[it.id]).length;
  if(!done) return job;
  const storedDone = Number(st.done) || 0;
  if(storedDone >= done && st.label && st.label !== "대기") return job;
  const complete = done >= items.length;
  return {
    ...job,
    status: { label: complete ? "완료" : "진행중", done, total: items.length,
      pct: Math.round(done / items.length * 100), tone: complete ? "done" : "running" },
    tab: complete ? "report" : job.tab,
  };
}

function canvasJobs(){
  // 기본 샘플 작업 없음 — AI 캔버스는 사용자가 직접 등록·분석한 작업만 관리한다.
  return customCanvasJobs.map(applyJobOverride).map(syncJobStatusWithArchive);
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

/* 개인 캔버스에서 진행중 심사/수사 작업을 현재 사용자 기준으로 삭제(제거).
   - 관세조사(통관): 기존 removeCanvasJobForCurrentUser(소유 custom은 삭제, 공유는 숨김)
   - 일반/마약/외환 수사: caseId(jobId)를 사용자별 숨김목록에 추가 */
function deleteCanvasJobForCurrentUser(jobId, page){
  if(!jobId) return;
  if(page === "investigation"){
    removeCanvasJobForCurrentUser(jobId);
    return;
  }
  const hidden = new Set(hiddenCanvasJobsByUser[currentUserId] || []);
  hidden.add(jobId);
  hiddenCanvasJobsByUser[currentUserId] = [...hidden];
  saveCanvasState();
}

function isCanvasJobHiddenForUser(jobId){
  return (hiddenCanvasJobsByUser[currentUserId] || []).includes(jobId);
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
    .filter(item => !isCanvasJobHiddenForUser(item.caseId))
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
    .filter(item => !isCanvasJobHiddenForUser(item.caseId))
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
  // 본인이 직접 실행한 아카이브 우선, 없으면 사전 준비된 결과로 폴백
  return canvasRunArchives[companyId] || preparedRunArchives[companyId] || null;
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

/* 아카이브의 stepOutputs/stepStatuses를 현재 시나리오 항목 id 기준으로 재매핑한다.
   사전 준비 아카이브(prep-* id)와 사용자 저장 시나리오(companyScenarios)의 항목 id가
   달라도, 같은 AI 서비스(key)를 순서대로 매칭해 결과를 표시할 수 있게 한다.
   id가 이미 일치하는 아카이브(본인 실행분)는 원본 그대로 반환한다. */
function remapArchiveResults(archive, items){
  const outputs = archive?.stepOutputs ? {...archive.stepOutputs} : {};
  const statuses = archive?.stepStatuses ? {...archive.stepStatuses} : {};
  const archiveItems = Array.isArray(archive?.scenarioItems) ? archive.scenarioItems : [];
  if(!archiveItems.length || !Array.isArray(items) || !items.length) return { outputs, statuses };
  if(items.some(item => outputs[item.id] !== undefined || statuses[item.id] !== undefined)) return { outputs, statuses };
  const pending = [...archiveItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const remappedOutputs = {};
  const remappedStatuses = {};
  items.forEach(item => {
    const index = pending.findIndex(candidate => candidate.key === item.key);
    if(index < 0) return;
    const [match] = pending.splice(index, 1);
    if(outputs[match.id] !== undefined) remappedOutputs[item.id] = outputs[match.id];
    if(statuses[match.id] !== undefined) remappedStatuses[item.id] = statuses[match.id];
  });
  return { outputs: remappedOutputs, statuses: remappedStatuses };
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
  const remapped = remapArchiveResults(archive, getCompanyScenario(companyId));
  stepOutputs = remapped.outputs;
  stepStatuses = remapped.statuses;
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

function loadRiskOrgProfile(orgId){
  if(!orgId) return;
  if(riskOrgProfiles[orgId]) return;
  if(riskOrgProfileLoading[orgId]) return;
  riskOrgProfileLoading[orgId] = true;
  fetch(`/api/risk-org-profile?org_id=${encodeURIComponent(orgId)}`)
    .then(response => {
      if(!response.ok) throw new Error(`조직 프로파일 API 오류: ${response.status}`);
      return response.json();
    })
    .then(data => {
      riskOrgProfileLoading[orgId] = false;
      if(!data.error) riskOrgProfiles[orgId] = data;
      if(isSpecialInvestigationPage(currentPage) && specialInvestigationState.drugInvTab === "profile"){
        renderSpecialInvestigation();
      }
    })
    .catch(error => {
      riskOrgProfileLoading[orgId] = false;
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
  // 위험지표 세트: 수사 프로파일은 혐의(options.indicatorSet)로 지정, 없으면 기업 crime_types로 추정
  const indicatorSetKey = options.indicatorSet || indicatorSetForCompany(c);
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
          <h3>AI 위험 지표 분석 <span class="muted" style="font-size:11.5px;font-weight:600">· ${escapeHtml(indicatorSetLabel(indicatorSetKey))}</span></h3>
          <div class="risk-circle ${riskTone(riskLevel)}">
            <strong>${riskScore != null ? Number(riskScore).toFixed(1) : "-"}</strong>
            <span>${riskLabel}</span>
          </div>
        </div>
        <div class="risk-bars">
          ${indicatorItems(indicatorSetKey).map(({ label, code, field }) => {
            const val = risk[field];
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

/* ── 기초자료 데이터 소스 추가 — 모든 소스 등록은 소스 추가 팝업에서 시작 ──
   팝업(source-add-popup.js)이 유형별 입력·검증을 담당하고, 여기서는 완성된
   소스 기록(rec)을 업로드 기록(uploadedFilesByCompany)에 영속화한다. */
function addSourceRecord(rec){
  const companyId = activeCanvasCompanyId;
  if(!companyId || !rec) return;
  if(!Array.isArray(uploadedFilesByCompany[companyId])) uploadedFilesByCompany[companyId] = [];
  uploadedFilesByCompany[companyId].unshift({ id: uid(), uploadedAt: new Date().toISOString(), ...rec });
  saveCanvasState();
  render(currentPage);
}

/* 검증 차트 등 다른 모듈이 소스 기록을 등록하는 진입점(예: 역외자금 외부 수집 내역) */
document.addEventListener("kcs:add-sources", e => {
  (e.detail?.records || []).forEach(addSourceRecord);
});

/* 소스 추가 팝업 열기 — 파일 계열은 파일 등록 팝업으로 전환, 나머지는 rec 영속화 */
function openSourceAddPopupFor(subjectRaw){
  let subject = (subjectRaw || "").trim(), subjectId = "";
  const m = subject.match(/^(.*)\s*\(([^)]+)\)\s*$/);
  if(m){ subject = m[1].trim(); subjectId = m[2].trim(); }
  openSourceAddPopup({
    subject, subjectId,
    onFile: files => openUploadPopupFor(subjectRaw, files || undefined),
    onRegister: addSourceRecord,
  });
}

/* 기초자료 파일 등록 팝업 열기 — 버튼 클릭과 소스 패널 드래그 앤 드롭이 공용.
   droppedFiles가 있으면 팝업이 드롭존을 건너뛰고 바로 속성 분석을 시작한다. */
function openUploadPopupFor(subjectRaw, droppedFiles){
  let subject = (subjectRaw || "").trim(), subjectId = "";
  const m = subject.match(/^(.*)\s*\(([^)]+)\)\s*$/);   // "이름 (C-1023)" → 이름 + 식별자 분리
  if(m){ subject = m[1].trim(); subjectId = m[2].trim(); }
  // 이 사건(기업/개인)에 등록된 활성 업무특화 RAG → 팝업 동작방식 선택에 표시.
  // 목록은 canAccessRag 통과분만이므로(사용 권한 보유) 팝업에서 설정 변경도 허용된다.
  const registeredRags = activeRagsForCompany(activeCanvasCompanyId).map(r => ({
    id: r.id, name: r.name, meta: r.meta,
    perm: r.perm || "", validity: r.validity || "", expiry: r.expiry || "무기한",
    ownerName: r.ownerName || "", createdAt: r.createdAt || "",
  }));
  // 대상 유형(개인/기업) 추정
  let subjectType = "company";
  try { if(currentPage === "generalinv" && activeGenInvCase()?.targetType === "person") subjectType = "person"; } catch(e){ /* noop */ }
  const subjectInfo = { name: subject, type: subjectType };
  openFileRegisterPopup({ subject, subjectId, registeredRags, droppedFiles, onSubmit: (payload) => {
    saveUploadedFile(payload);   // 사건별 업로드 영속 저장(파일 여러 개 가능)
    const rag = payload && payload.rag;
    const files = payload && payload.files && payload.files.length ? payload.files : (payload && payload.file ? [payload.file] : []);
    if(rag && (rag.mode || "new") === "new" && rag.name && rag.name.trim()){
      // 신규 업무특화 RAG 생성: 전역 레지스트리 등록 + 분석 프로세스 맨 앞에 검색 단계 추가
      registerCustomRag(rag, files, subjectInfo);
      prependCustomRagSearchStep(rag.name.trim());
    } else if(rag && rag.mode === "existing" && rag.existingId){
      // 기존 RAG에 추가: 레지스트리 기록이면 자료 추가, 빌트인 샘플이면 실제 기록으로 등록 —
      // 어느 쪽이든 시나리오의 RAG 선택 드롭다운에서 선택 가능해진다.
      // 사용 권한 = 설정 변경 권한: 팝업에서 바꾼 검색권한·유효기간을 함께 반영한다.
      const found = findRagById(rag.existingId);
      if(found){
        if(rag.existingPerm) found.rag.perm = rag.existingPerm;
        if(rag.existingValidity){
          if(rag.existingValidity === "custom"){
            // 임의 설정: 날짜가 지정된 경우에만 만료일 변경
            if(rag.existingCustomExpiry){
              found.rag.validity = "custom";
              found.rag.expiry = rag.existingCustomExpiry;
            }
          } else {
            found.rag.validity = rag.existingValidity;
            found.rag.expiry = ragExpiryFromValidity(rag.existingValidity);
          }
        }
        appendRagFiles(found.rag, files);   // 메타(검색권한 포함)도 여기서 갱신
        saveCanvasState();
        prependCustomRagSearchStep(found.rag.name, found.rag.id);
      } else if(rag.existingName){
        registerCustomRag({
          name: rag.existingName,
          perm: rag.existingPerm || "org",
          validity: rag.existingValidity || "none",
          customExpiry: rag.existingCustomExpiry || "",
        }, files, subjectInfo);
        prependCustomRagSearchStep(rag.existingName);
      }
    }
    render(currentPage);   // 표에 저장된 업로드 반영(고객·일반·특수 수사 공통)
  }});
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
  // 분석작업(기업)별로 저장된 업로드 파일 — 재로그인 후에도 복원되어 표 상단에 표시
  const persistedUploads = Array.isArray(uploadedFilesByCompany[resolvedCompanyId]) ? uploadedFilesByCompany[resolvedCompanyId] : [];
  const persistedRows = persistedUploads.map(uploadRowFromRecord).join("");
  const totalDocs = 124 + persistedUploads.length;
  const runningDocs = 20 + persistedUploads.length;
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
        <button type="button" class="source-add-panel source-add-open" data-source-open data-source-drop data-upload-subject="${subjectName}">
          <strong>＋ 데이터 소스 추가</strong>
          <span>웹 검색 · 파일(드롭 가능) · 웹사이트 · 내부 데이터 링크 · 외부 API</span>
        </button>
        <div class="upload-stat-card"><span>총 등록 소스</span><strong>${totalDocs}</strong></div>
        <div class="upload-stat-card"><span>정상추출 자동승인</span><strong>80</strong></div>
        <div class="upload-stat-card warn"><span>검토필요 이상감지</span><strong>44</strong></div>
        <div class="upload-stat-card active"><span>AI 분석 진행중</span><strong>${runningDocs}</strong></div>
      </div>

      <div class="upload-table-wrap">
        <table class="upload-table">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="전체 선택"></th>
              <th>소스명</th>
              <th>소스유형</th>
              <th>추출데이터</th>
              <th>활용 AI 서비스</th>
              <th>AI검증결과</th>
              <th>진행상태</th>
            </tr>
          </thead>
          <tbody>
            ${persistedRows}
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
              agents:["업무특화RAG 분석서비스"],
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

function uploadRow({file,type,extracted,agents,result,status,tone,deleteId}){
  // deleteId가 있으면(사용자가 등록한 영속 행) 진행상태 옆에 삭제 버튼 표시
  const delBtn = deleteId
    ? `<button type="button" class="upload-del-btn" data-upload-delete="${escapeHtml(deleteId)}" title="업로드 삭제" aria-label="${file} 삭제"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`
    : "";
  return `
    <tr>
      <td><input type="checkbox" aria-label="${file} 선택"></td>
      <td class="upload-file">${file}</td>
      <td>${type}</td>
      <td>${extracted.map(item => `<span class="extract-pill">${item}</span>`).join("")}</td>
      <td>${agents.map(agent => `<strong class="agent-line">${agent}</strong>`).join("")}</td>
      <td>${result}</td>
      <td><div class="upload-status-cell"><span class="upload-status ${tone}">${status}</span>${delBtn}</div></td>
    </tr>
  `;
}

/* 파일 등록 팝업 제출 시: 업로드 기록을 사건(기업/개인)별 저장소에 영속화(파일 여러 개 가능).
   서버 저장되어 재로그인 후에도 복원된다. */
function saveUploadedFile(payload){
  const companyId = activeCanvasCompanyId;
  if(!companyId || !payload) return;
  const files = payload.files && payload.files.length ? payload.files : (payload.file ? [payload.file] : []);
  if(!files.length) return;
  const agents = (payload.agentNames || []).map(n =>
    n === "업무특화RAG 분석서비스" ? n : `${n} agent`);
  if(!Array.isArray(uploadedFilesByCompany[companyId])) uploadedFilesByCompany[companyId] = [];
  files.forEach(f => {
    uploadedFilesByCompany[companyId].unshift({
      id: uid(),
      name: (f && f.name) || "신규 파일",
      type: "신규 등록",
      extracted: ["AI 분석 예약"],
      agents: agents.length ? agents : ["—"],
      result: "처리중",
      status: "분석중",
      tone: "running",
      uploadedAt: new Date().toISOString(),
    });
  });
  saveCanvasState();
}

/* ── 업무특화 RAG 전역 레지스트리: 사건(기업/개인)별 독립 + 공유권한별 가시성 ── */
const RAG_PERM_KO = { org: "전체 공개", dept: "부서", team: "조사팀", me: "본인만" };
const RAG_VALIDITY_KO = { "3m": "3개월", "6m": "6개월", "1y": "1년", none: "무기한", custom: "임의 설정" };
function ragExpiryFromValidity(validity){
  if(!validity || validity === "none") return "무기한";
  const add = { "3m": 3, "6m": 6, "1y": 12 }[validity];
  if(!add) return "무기한";
  const d = new Date(); d.setMonth(d.getMonth() + add);
  return d.toISOString().slice(0, 10);
}
function allCustomRags(){ return Object.values(ragsByCompany).flat(); }
function ragExpired(r){ return !!r && r.expiry && r.expiry !== "무기한" && r.expiry < new Date().toISOString().slice(0, 10); }
/* 공유권한 기준 접근 가능 여부(관리자·소유자는 항상 가능) */
function canAccessRag(r){
  if(!r) return false;
  if(isCurrentUserAdmin()) return true;
  if(r.ownerUserId && r.ownerUserId === currentUserId) return true;
  const grp = currentUserGroup() || {};
  switch(r.perm){
    case "org": return true;
    case "dept": return !r.ownerOrg || r.ownerOrg === grp.org;
    case "team": return !r.ownerTeam || r.ownerTeam === grp.team;
    case "me": return false;
    default: return true;   // 권한 미지정(구버전 레코드)은 공개로 취급
  }
}
/* 시나리오에서 사용 가능한 RAG: 사용중지·만료 제외 + 권한 보유 */
function accessibleRags(){
  return allCustomRags().filter(r => r.status !== "suspended" && !ragExpired(r) && canAccessRag(r));
}
/* 특정 사건(기업/개인)의 RAG 중 활성·접근 가능한 것 */
function activeRagsForCompany(companyId){
  return (ragsByCompany[companyId] || []).filter(r => r.status !== "suspended" && !ragExpired(r) && canAccessRag(r));
}
function findRagById(id){
  for(const cid of Object.keys(ragsByCompany)){
    const arr = ragsByCompany[cid] || [];
    const idx = arr.findIndex(r => r && r.id === id);
    if(idx >= 0) return { rag: arr[idx], companyId: cid, index: idx };
  }
  return null;
}

/* 기존 RAG 기록에 자료 파일 추가(파일명 기준 중복 제거) + 메타 갱신 */
function appendRagFiles(rec, files){
  if(!rec) return;
  if(!Array.isArray(rec.files)) rec.files = [];
  const names = new Set(rec.files.map(f => f && f.name));
  (Array.isArray(files) ? files : []).forEach(f => {
    const name = (f && f.name) || String(f || "");
    if(!name || names.has(name)) return;
    names.add(name);
    rec.files.push({ name });
  });
  const permKo = rec.perm ? (RAG_PERM_KO[rec.perm] || rec.perm) : "";
  rec.meta = `자료 ${rec.files.length}건 · 갱신 ${new Date().toISOString().slice(0, 10)}${permKo ? " · 검색권한 " + permKo : ""}`;
}

/* 신규 업무특화 RAG 생성 시: 전역 레지스트리에 사건별 등록(파일목록·권한·유효기간·등록자·상태 포함) */
function registerCustomRag(rag, files, subject){
  const companyId = activeCanvasCompanyId;
  const name = rag && rag.name ? String(rag.name).trim() : "";
  if(!companyId || !name) return;
  if(!Array.isArray(ragsByCompany[companyId])) ragsByCompany[companyId] = [];
  const dup = ragsByCompany[companyId].find(r => r.name === name);
  if(dup){   // 동일 이름이면 새 레코드 대신 기존 RAG에 자료만 추가
    appendRagFiles(dup, files);
    saveCanvasState();
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const permKo = rag.perm ? (RAG_PERM_KO[rag.perm] || rag.perm) : "";
  const grp = currentUserGroup() || {};
  const validity = rag.validity || "";
  // 임의 설정(custom)은 팝업에서 지정한 날짜를 만료일로 사용
  const expiry = validity === "custom" ? (rag.customExpiry || "무기한") : ragExpiryFromValidity(validity);
  ragsByCompany[companyId].unshift({
    id: uid(),
    name,
    companyId,
    subjectName: (subject && subject.name) || activeCanvasCompany(companyId)?.company_name || companyId,
    subjectType: (subject && subject.type) || "company",
    files: Array.isArray(files) ? files.map(f => ({ name: (f && f.name) || String(f) })) : [],
    perm: rag.perm || "",
    validity,
    expiry,
    ownerUserId: currentUserId,
    ownerName: currentUser()?.name || currentUserId,
    ownerOrg: grp.org || "",
    ownerTeam: grp.team || "",
    status: "active",
    meta: `신규 등록 ${date}${permKo ? " · 검색권한 " + permKo : ""}`,
    createdAt: new Date().toISOString(),
  });
  saveCanvasState();
}

/* ── 관리자: 업무특화 RAG 관리 패널 ── */
function adminRagPanelHtml(){
  const rags = allCustomRags().slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if(!rags.length){
    return `<div class="rag-admin-wrap"><div class="rag-admin-head"><strong>업무특화 RAG 관리</strong></div><p class="muted" style="padding:20px;text-align:center">등록된 업무특화 RAG가 없습니다. 기초자료 등록에서 생성됩니다.</p></div>`;
  }
  const VAL = [["3m", "3개월"], ["6m", "6개월"], ["1y", "1년"], ["none", "무기한"]];
  const rows = rags.map(r => {
    const expired = ragExpired(r);
    const suspended = r.status === "suspended";
    const statusKo = suspended ? "사용중지" : (expired ? "만료" : "사용중");
    const statusCls = suspended ? "off" : (expired ? "exp" : "on");
    const valChips = VAL.map(([v, l]) =>
      `<button type="button" class="rag-admin-chip${r.validity === v ? " on" : ""}" data-rag-admin-validity="${escapeHtml(r.id)}::${v}">${l}</button>`).join("");
    const files = (r.files || []).length
      ? (r.files || []).map(f => `<span class="rag-admin-file">${escapeHtml(f.name || "")}</span>`).join("")
      : `<span class="muted">-</span>`;
    return `
      <tr class="${suspended || expired ? "rag-admin-off" : ""}">
        <td><b>${escapeHtml(r.name)}</b></td>
        <td>${escapeHtml(r.subjectName || "")}<div class="muted" style="font-size:11px">${r.subjectType === "person" ? "개인" : "기업"}${r.companyId ? " · " + escapeHtml(r.companyId) : ""}</div></td>
        <td><div class="rag-admin-files">${files}</div></td>
        <td>${escapeHtml(RAG_PERM_KO[r.perm] || r.perm || "공개")}</td>
        <td>
          <div class="rag-admin-validity">${valChips}</div>
          <div class="muted" style="font-size:11px;margin-top:4px">만료 예정 <b style="color:#2f5fd6">${escapeHtml(r.expiry || "무기한")}</b></div>
        </td>
        <td>${escapeHtml(r.ownerName || "")}</td>
        <td><span class="rag-admin-status ${statusCls}">${statusKo}</span></td>
        <td class="rag-admin-actions">
          <button type="button" class="btn secondary" data-rag-admin-toggle="${escapeHtml(r.id)}">${suspended ? "재개" : "사용중지"}</button>
          <button type="button" class="btn danger" data-rag-admin-delete="${escapeHtml(r.id)}">삭제</button>
        </td>
      </tr>`;
  }).join("");
  return `
    <div class="rag-admin-wrap">
      <div class="rag-admin-head">
        <strong>업무특화 RAG 관리</strong>
        <span class="muted">사건(기업/개인)별 RAG의 권한·유효기간·사용상태를 관리합니다 · 총 ${rags.length}건</span>
      </div>
      <div class="rag-admin-table-wrap">
        <table class="rag-admin-table">
          <thead><tr>
            <th>RAG</th><th>대상</th><th>파일목록</th><th>권한</th><th>유효기간</th><th>등록자</th><th>상태</th><th>관리</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
function adminSetRagValidity(id, validity){
  const f = findRagById(id);
  if(!f) return;
  f.rag.validity = validity;
  f.rag.expiry = ragExpiryFromValidity(validity);
  saveCanvasState();
  render("scenarioBuilder");
}
function adminToggleRagStatus(id){
  const f = findRagById(id);
  if(!f) return;
  f.rag.status = f.rag.status === "suspended" ? "active" : "suspended";
  saveCanvasState();
  render("scenarioBuilder");
}
function adminDeleteRag(id){
  const f = findRagById(id);
  if(!f) return;
  (ragsByCompany[f.companyId] || []).splice(f.index, 1);
  saveCanvasState();
  render("scenarioBuilder");
}

/* 저장된 업로드 기록 → 표 행 HTML (저장값은 평문, 렌더 시 이스케이프) */
function uploadRowFromRecord(r){
  return uploadRow({
    file: escapeHtml(r.name || ""),
    type: escapeHtml(r.type || ""),
    extracted: (r.extracted || []).map(escapeHtml),
    agents: (r.agents || []).map(escapeHtml),
    result: escapeHtml(r.result || ""),
    status: escapeHtml(r.status || ""),
    tone: r.tone || "running",
    deleteId: r.id,
  });
}

/* 업로드 기록 삭제 (분석작업별 저장소에서 제거 후 영속화) */
function deleteUploadedFile(recordId){
  const companyId = activeCanvasCompanyId;
  const list = uploadedFilesByCompany[companyId];
  if(!companyId || !Array.isArray(list)) return;
  const idx = list.findIndex(r => r.id === recordId);
  if(idx < 0) return;
  list.splice(idx, 1);
  saveCanvasState();
  if(currentPage === "investigation") render("investigation");
}

/* 신규 업무특화 RAG 생성 시: 현재 조사 기업의 분석 프로세스 맨 앞에 "업무특화RAG(이름) 검색하기" 단계를 추가.
   영속 저장(companyScenarios)과 활성 메모리(scenarioItems)를 모두 갱신해야 시나리오 탭 로드 게이팅과 무관하게 반영된다. */
function prependCustomRagSearchStep(ragName, ragId){
  const companyId = activeCanvasCompanyId;
  const name = String(ragName || "").trim();
  if(!companyId || !name) return false;
  const label = "업무특화 RAG 검색";   // 표준 AI 서비스명 — RAG 이름은 설명(instruction)에 표시
  const list = getCompanyScenario(companyId);                 // 저장본 또는 기본 템플릿(정규화됨)
  // 동일 RAG 검색 단계 중복 방지 (구버전 라벨 형식 포함)
  if(list.some(item => item.key === "rag_custom_search" && (item.ragName === name || item.label === `업무특화RAG(${name}) 검색하기`))) return false;
  const ragRec = ragId
    ? (findRagById(ragId)?.rag || null)
    : (ragsByCompany[companyId] || []).find(r => r.name === name);
  const step = normalizeScenarioItem({
    key: "rag_custom_search",
    label,
    behaviors: ["knowledge_search"],
    instruction: `신규 생성한 업무특화 RAG "${name}"에서 이번 조사와 관련된 근거·유사사례를 우선 검색`,
    ragId: ragRec ? ragRec.id : "",
    ragName: name,
  }, 0);
  const next = [step, ...list].map((item, i) => ({ ...item, order: i + 1 }));
  companyScenarios[companyId] = next.map(item => ({ ...item }));
  // 시나리오가 이미 이 기업으로 메모리에 로드되어 있으면 즉시 반영 + 재렌더(탭이 떠 있을 때만 DOM 존재)
  if(companyId === activeCanvasCompanyId && scenarioLoadedForCompany === activeCanvasCompanyId){
    scenarioItems = next;
    selectedScenarioId = scenarioItems[0]?.id || selectedScenarioId;
    try { renderScenarioList(); renderScenarioSteps(); } catch(e){ /* 시나리오 탭 미표시 */ }
  }
  saveCanvasState();
  return true;
}

/* 보고서 워크벤치: 시나리오 아카이브 기준 분석 완료 판정 + 보고서/검증 단계 결과 조회 */
function wbReportContext(){
  const archive = currentRunArchive();
  const items = archive?.scenarioItems || [];
  const outputs = archive?.stepOutputs || {};
  const isReportStep = it => ["report_generate", "report_validate"].includes(it.key)
    || ["report", "validation", "approve", "result_synthesis"].includes(it.type);
  const analysis = items.filter(it => !isReportStep(it));
  return {
    outputs,
    analysisDone: analysis.length > 0 && analysis.every(it => outputs[it.id]),
    reportItem: items.find(it => it.key === "report_generate" || it.type === "report"),
    validItem: items.find(it => it.key === "report_validate" || ["validation", "approve"].includes(it.type)),
  };
}
function wbReportReady(){
  return !!latestReport && !/아직 생성되지 않았습니다|대기 중입니다/.test(latestReport);
}

/* 보고서/검증 서비스 결과를 "분석 보고서 및 검증" 탭 상태에 등록 —
   시나리오 전체 실행·개별 실행·워크벤치 버튼이 모두 이 경로를 공유한다. */
function applyReportStepOutput(item, output){
  if(!output || !item) return;
  const isReport = item.key === "report_generate" || item.type === "report";
  const isValid = item.key === "report_validate" || ["validation", "approve"].includes(item.type);
  if(!isReport && !isValid) return;
  const company = activeCanvasCompany();
  const companyName = company ? `${company.company_name} (${company.company_id})` : activeCanvasCompanyId;
  if(isReport){
    latestReport = output;
    const el = document.getElementById("scenarioReportOutput");
    if(el) setMarkdown(el, ensureReportRequiredSections(latestReport, "customs", { targetName: companyName }));
    document.getElementById("wbReportValidateBtn")?.removeAttribute("disabled");
  } else {
    latestValidation = output;
    const el = document.getElementById("scenarioValidationOutput");
    if(el){
      // 보고서 워크벤치에서는 검증 대시보드로, 시나리오 탭에서는 마크다운으로 표시
      if(document.getElementById("wbReportValidateBtn")) el.innerHTML = renderValidationDashboard(latestValidation);
      else setMarkdown(el, latestValidation);
    }
  }
  saveCanvasState();
}

/* 보고서/검증 시나리오 단계 찾기 + 워크벤치에서 실행 시 시나리오 상태 하이드레이션 */
function wbFindScenarioItem(kind){
  const match = it => kind === "report"
    ? (it.key === "report_generate" || it.type === "report")
    : (it.key === "report_validate" || ["validation", "approve"].includes(it.type));
  // 시나리오 탭을 거치지 않았으면 아카이브(사전 준비 포함)에서 단계·선행 결과를 복원
  if(scenarioLoadedForCompany !== activeCanvasCompanyId){
    const archive = currentRunArchive();
    if(archive?.scenarioItems?.length){
      scenarioItems = archive.scenarioItems.map((it, i) => normalizeScenarioItem({ ...it }, i));
      stepOutputs = { ...(archive.stepOutputs || {}) };
      stepStatuses = Object.fromEntries(Object.keys(stepOutputs).map(id => [id, "완료"]));
      scenarioLoadedForCompany = activeCanvasCompanyId;
    }
  }
  return scenarioItems.find(match) || null;
}

/* [보고서 생성] — 시나리오 분석 미완료면 안내, 완료면 보고서 생성 AI 서비스를 재호출 */
function wbGenerateReport(){
  const ctx = wbReportContext();
  if(!ctx.analysisDone){ alert("분석을 완료해주세요."); return; }
  const item = wbFindScenarioItem("report");
  if(!item){ alert("시나리오에 보고서 생성 단계가 없습니다. 분석 시나리오에서 단계를 추가해주세요."); return; }
  const el = document.getElementById("scenarioReportOutput");
  if(el) setMarkdown(el, "보고서 생성 AI 서비스 실행 중...");
  runSingleScenarioItem(item);   // 시나리오와 동일한 보고서 생성 서비스 호출
}
/* [보고서 검증] — 보고서 생성 완료 후 보고서 검증 AI 서비스를 재호출 */
function wbValidateReport(){
  if(!wbReportReady()){ alert("보고서 생성을 먼저 완료해주세요."); return; }
  const item = wbFindScenarioItem("validate");
  if(!item){ alert("시나리오에 보고서 검증 단계가 없습니다. 분석 시나리오에서 단계를 추가해주세요."); return; }
  const el = document.getElementById("scenarioValidationOutput");
  if(el) el.innerHTML = `<div class="profile-loading">보고서 검증 AI 서비스 실행 중...</div>`;
  runSingleScenarioItem(item);   // 시나리오와 동일한 보고서 검증 서비스 호출
}

function canvasReportPanel(){
  const company = activeCanvasCompany();
  const companyName = `${company.company_name} (${company.company_id})`;
  const ready = wbReportReady();
  return commonAnalysisReportPanel({
    selectedLabel: "선택 기업",
    targetText: escapeHtml(companyName),
    reportTitle: "분석 보고서",
    validationTitle: "보고서 검증",
    reportHtml: markdownToHtml(ensureReportRequiredSections(latestReport, "customs", { targetName: companyName })),
    validationHtml: renderValidationDashboard(latestValidation),
    reportId: "scenarioReportOutput",
    validationId: "scenarioValidationOutput",
    reportActions: `<button id="wbReportGenBtn" type="button" class="btn"
      title="시나리오 분석이 완료된 경우 보고서 단계 결과를 적용합니다">▶ 보고서 생성</button>`,
    validationActions: `<button id="wbReportValidateBtn" type="button" class="btn secondary"
      ${ready ? "" : `disabled title="보고서 생성 후 실행할 수 있습니다"`}>▶ 보고서 검증</button>`,
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

/* ── 관세조사 템플릿 4단계 구조 표시 — 단계별 서비스 그룹 + 필수/선택 뱃지 ── */
const CI_TEMPLATE_STAGES = [
  { key: "base",   title: "1) 기초데이터 분석" },
  { key: "ext",    title: "2) 외부데이터 수집" },
  { key: "deep",   title: "3) 심층분석 시나리오" },
  { key: "report", title: "4) 보고서 생성 및 검증" },
];
const CI_TEMPLATE_BASE_KEYS = ["db_cdw", "ml", "db_external", "rag_audit", "declaration_verify", "law"];

function ciTemplateItemStage(item){
  if(["report", "validation", "approve"].includes(item.type)
    || ["report_generate", "report_validate"].includes(item.key)) return "report";
  if(["web_search", "external_agency"].includes(item.key)) return "ext";
  if(CI_TEMPLATE_BASE_KEYS.includes(item.key)) return "base";
  return "deep";
}

/* 필수/선택 — 항목에 명시(required)가 있으면 우선, 없으면 기초·보고서 단계는 필수 */
function ciTemplateItemRequired(item){
  if(typeof item.required === "boolean") return item.required;
  const stage = ciTemplateItemStage(item);
  return stage === "base" || stage === "report";
}

function ciTemplateStagedListHtml(template){
  const items = template.items || [];
  const stageItemRow = item => `
    <li>
      <b>${item.order ?? ""}</b>
      <div>
        <div class="template-step-title">
          <strong>${escapeHtml(normalizeReportValidationLabel(item.label))}</strong>
          <em class="tpl-req ${ciTemplateItemRequired(item) ? "req" : "opt"}">${ciTemplateItemRequired(item) ? "필수" : "선택"}</em>
        </div>
        <small>${escapeHtml(sourceBehaviorLabels(item.key, item.behaviors).join(", "))}</small>
      </div>
    </li>`;
  return CI_TEMPLATE_STAGES.map(stage => {
    const stageItems = items.filter(item => ciTemplateItemStage(item) === stage.key);
    let extraHtml = "";
    if(stage.key === "base"){
      // 기초조사에 등록된 AI 분석서비스(템플릿 저장분 또는 기본 6종) — 변경 가능 목록 표시
      const baseSvcs = (Array.isArray(template.baseAiServices) && template.baseAiServices.length)
        ? template.baseAiServices : CI_BASE_AI_DEFAULTS;
      extraHtml = `
        <div class="template-stage-sub">AI 분석서비스</div>
        <ol class="template-step-list">${baseSvcs.map(svc => `
          <li>
            <b>·</b>
            <div>
              <div class="template-step-title">
                <strong>${escapeHtml(svc.label)}</strong>
              </div>
              ${svc.note ? `<small>${escapeHtml(svc.note)}</small>` : ""}
            </div>
          </li>`).join("")}</ol>`;
    }
    if(stage.key === "ext"){
      const agencyKeys = Array.isArray(template.extAgencies) ? template.extAgencies : ["dart", "nice", "orbis"];
      const labels = CI_EXT_AGENCIES.filter(a => agencyKeys.includes(a.key)).map(a => a.label);
      if(template.extUrlOpen !== false){
        const urlCount = Array.isArray(template.webTargets) ? template.webTargets.length : 0;
        labels.push(urlCount ? `URL 직접 등록 ${urlCount}건` : "URL 직접 등록");
      }
      extraHtml = `<div class="template-stage-sub">수집 기관</div>
        <div class="template-agency-chips">${labels.map(label => `<span>${escapeHtml(label)}</span>`).join("")}</div>`;
    }
    const emptyStage = !stageItems.length && !extraHtml;
    return `
      <div class="template-stage-group">
        <div class="template-stage-title">${stage.title}</div>
        ${stageItems.length ? `<ol class="template-step-list">${stageItems.map(stageItemRow).join("")}</ol>` : ""}
        ${extraHtml}
        ${emptyStage ? `<div class="template-stage-empty">구성된 서비스 없음</div>` : ""}
      </div>`;
  }).join("");
}

function templateCardHtml(template){
  const isCustom = !!template.isCustom;
  const isEditing = editingTemplateId === template.id;
  const editable = canEditTemplate(template);
  const deletable = canDeleteTemplate(template);
  const ownerLabel = templateOwnerLabel(template);
  const stepListHtml = isEditing
    ? `<ol class="template-step-list template-step-list-editable" id="templateEditorStepList">${editingCardStepsHtml()}</ol>`
    : (templateEditorDomain === "customs"
      ? `<div class="template-staged-list">${ciTemplateStagedListHtml(template)}</div>`
      : `<ol class="template-step-list">${template.items.map((item, i) => `
        <li>
          <b>${i + 1}</b>
          <div>
            <strong>${escapeHtml(normalizeReportValidationLabel(item.label))}</strong>
            <small>${escapeHtml(sourceBehaviorLabels(item.key, item.behaviors).join(", "))}</small>
          </div>
        </li>`).join("")}
      </ol>`);
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

/* ═══ 관세조사 분석 시나리오 템플릿 — 4단계 스테이지 편집기 ═══
   "분석 시나리오 확인 및 설정"과 동일한 4단계 구성(기초조사·외부데이터·심층·보고서)으로
   템플릿을 등록/수정한다. 실행 버튼 없이 구성 편집만 제공한다. */
let tplStage = null;   // 편집 중 템플릿 상태(null이면 안내 표시)

function tplStageReportDefaults(){
  return [
    { id: uid(), key: "report_generate", type: "report", label: "보고서 생성 AI 서비스",
      behaviors: ["issue_report"], order: 1, required: true, instruction: "전체 분석 결과를 종합한 조사보고서 초안 작성" },
    { id: uid(), key: "report_validate", type: "validation", label: "보고서 검증 AI 서비스",
      behaviors: ["evidence_validation"], order: 2, required: true, instruction: "보고서의 근거 충실성과 누락 증빙 검증" },
  ];
}

function tplStageLoad(template = null, { copyName = "" } = {}){
  tplStage = {
    id: template?.id || null,
    name: copyName || template?.name || "",
    stageOpen: { base: false, ext: false, deep: true, report: false },
    baseAiServices: (Array.isArray(template?.baseAiServices) && template.baseAiServices.length
      ? template.baseAiServices : CI_BASE_AI_DEFAULTS).map(svc => ({ ...svc })),
    baseSelectedKey: null,
    baseDetailKey: null,
    extAgencies: Array.isArray(template?.extAgencies) ? [...template.extAgencies] : ["dart", "nice", "orbis"],
    extUrlOpen: template?.extUrlOpen !== false,
    webTargets: normalizeWebTargets(template?.webTargets || []),
    deepNotes: template?.deepNotes || "",
    items: (template?.items || []).map(item => ({ ...item, id: uid() })),
    selectedItemId: null,
  };
  if(!tplStage.items.some(ciIsReportStageItem)) tplStage.items.push(...tplStageReportDefaults());
}

function tplStageDeepItems(){ return tplStage ? tplStage.items.filter(item => !ciIsReportStageItem(item)) : []; }
function tplStageReportItems(){ return tplStage ? tplStage.items.filter(ciIsReportStageItem) : []; }

function tplStageSectionHtml(key, title, isDefault, bodyHtml){
  const open = tplStage.stageOpen[key];
  return `
    <section class="ci-stage${open ? " open" : ""}" data-tpl-stage="${key}">
      <div class="ci-stage-head" data-tpl-stage-toggle="${key}" role="button" tabindex="0">
        <span>${title}${isDefault ? ` <em>(default)</em>` : ""}</span>
      </div>
      <div class="ci-stage-body">${bodyHtml}</div>
    </section>
  `;
}

function tplStageReqBadge(item){
  const required = ciTemplateItemRequired(item);
  return `<em class="tpl-req ${required ? "req" : "opt"}" data-tpl-req-toggle="${escapeHtml(item.id)}"
    title="클릭하여 필수/선택 전환">${required ? "필수" : "선택"}</em>`;
}

function tplStageEditorHtml(){
  if(!tplStage){
    return `<div class="empty-state">오른쪽 템플릿 카드의 [템플릿 변경]을 누르거나 [새 템플릿]으로 시작하세요.</div>`;
  }
  const baseServiceList = services => `
    <ul class="ci-base-list">
      ${services.map(service => `
        <li>${escapeHtml(service.label)}${service.items.length
          ? `<ul>${service.items.map(entry => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`
          : ""}</li>
      `).join("")}
    </ul>
  `;

  const stage1 = `
    <p class="ci-stage-note">다음 서비스를 배치(Batch)로 항시 수행합니다(default) — 로그 수준의 초안 보고서를 생성합니다.</p>
    ${baseServiceList(CI_BASE_BATCH_SERVICES)}
    <div class="ci-base-ai">
      <strong class="ci-base-ai-title">AI 분석서비스</strong>
      <div class="ci-stage-tools">
        <select id="tplBaseSelect" class="scenario-template-select">${scenarioSourceOptionsHtml()}</select>
        <button type="button" class="btn scenario-template-apply-btn" data-tpl-base-add>서비스 추가</button>
        <button type="button" class="btn secondary scenario-template-apply-btn" data-tpl-base-delete>선택 삭제</button>
      </div>
      <div class="ci-base-ai-list">
        ${tplStage.baseAiServices.map(svc => `
          <div class="ci-base-chip${svc.key === tplStage.baseSelectedKey ? " active" : ""}" data-tpl-base-chip="${escapeHtml(svc.key)}">
            <strong>${escapeHtml(svc.label)}</strong>
            <span class="ci-base-chip-side">
              <i>${tplStage.baseDetailKey === svc.key ? "▴" : "▾"}</i>
            </span>
          </div>
          ${tplStage.baseDetailKey === svc.key ? `
          <div class="ci-base-chip-detail">
            <p>${escapeHtml(svc.desc || "기초조사 배치 수행에 포함됩니다.")}</p>
            <textarea class="ci-stage-notes ci-base-svc-notes" data-tpl-base-note="${escapeHtml(svc.key)}" rows="2"
              placeholder="조사 착안사항 및 확인사항">${escapeHtml(svc.note || "")}</textarea>
          </div>` : ""}
        `).join("") || `<div class="empty-state">등록된 AI 분석서비스가 없습니다.</div>`}
      </div>
    </div>
    ${baseServiceList(CI_BASE_TAIL_SERVICES)}
  `;

  const stage2 = `
    <p class="ci-stage-note">데이터 수집이 필요한 외부 기관을 선택하세요.</p>
    <div class="ci-agency-list">
      ${CI_EXT_AGENCIES.map(agency => `
        <label><input type="checkbox" data-tpl-agency="${agency.key}" ${tplStage.extAgencies.includes(agency.key) ? "checked" : ""}> ${escapeHtml(agency.label)}</label>
      `).join("")}
      <label><input type="checkbox" data-tpl-url-toggle ${tplStage.extUrlOpen ? "checked" : ""}> URL 직접 등록</label>
    </div>
    ${tplStage.extUrlOpen ? `
    <div class="scenario-web-target-panel">
      <div class="scenario-web-target-head">
        <strong>수집 대상 URL·검색 키워드 등록</strong>
        <span>템플릿에 등록한 URL·키워드는 템플릿 적용 시 웹 정보수집 요청 AI 서비스에 함께 적용됩니다.</span>
      </div>
      <div class="scenario-web-target-form">
        <input id="tplWebUrl" class="scenario-web-target-url" type="url" placeholder="https:// (선택 — 키워드만 등록 가능)">
        <input id="tplWebQuery" class="scenario-web-target-query" type="text" placeholder="수집할 내용 / 주요 검색 키워드">
        <input id="tplWebLoginId" class="scenario-web-target-login-id" type="text" placeholder="로그인 ID (선택)" autocomplete="off">
        <input id="tplWebLoginPw" class="scenario-web-target-login-pw" type="password" placeholder="로그인 PW (선택)" autocomplete="new-password">
        <button type="button" class="btn secondary" data-tpl-web-add>등록</button>
      </div>
      <div class="scenario-web-target-list">
        ${tplStage.webTargets.length ? tplStage.webTargets.map((target, index) => `
          <div class="scenario-web-target-chip">
            <span>
              <strong>${target.url ? escapeHtml(target.url) : `🔍 ${escapeHtml(target.query)}`}</strong>
              <small>${target.url ? escapeHtml(target.query || "수집 내용 미지정") : "주요 검색 키워드"}</small>
              ${target.loginId ? `<small class="scenario-web-target-login">🔒 로그인정보 등록 (${escapeHtml(target.loginId)} / •••)</small>` : ""}
            </span>
            <button type="button" data-tpl-web-remove="${index}" aria-label="등록 삭제">×</button>
          </div>
        `).join("") : `<span class="scenario-web-target-empty">등록된 URL·검색 키워드가 없습니다.</span>`}
      </div>
    </div>` : ""}
  `;

  const deepItems = tplStageDeepItems();
  const stage3 = `
    <p class="ci-stage-note">심층분석을 위한 분석 시나리오 등록 — 서비스를 추가하고 순서를 변경하거나 조사 착안사항을 등록합니다.</p>
    <div class="ci-stage-tools">
      <select id="tplDeepSelect" class="scenario-template-select">${scenarioSourceOptionsHtml()}</select>
      <button type="button" class="btn scenario-template-apply-btn" data-tpl-deep-add>서비스 추가</button>
      <button type="button" class="btn secondary scenario-template-apply-btn" data-tpl-deep-delete>선택 삭제</button>
    </div>
    <textarea id="tplDeepNotes" class="ci-stage-notes" rows="3"
      placeholder="조사 착안사항 및 확인사항">${escapeHtml(tplStage.deepNotes || "")}</textarea>
    <div class="ci-base-ai-list">
      ${deepItems.map((item, index) => `
        <div class="ci-base-chip tpl-deep-chip${item.id === tplStage.selectedItemId ? " active" : ""}" data-tpl-deep-chip="${escapeHtml(item.id)}">
          <strong>${index + 1}. ${escapeHtml(normalizeReportValidationLabel(item.label))}</strong>
          <span class="ci-base-chip-side">
            ${tplStageReqBadge(item)}
            <button type="button" class="step-move-btn" data-tpl-move="${escapeHtml(item.id)}" data-dir="up" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="step-move-btn" data-tpl-move="${escapeHtml(item.id)}" data-dir="down" ${index === deepItems.length - 1 ? "disabled" : ""}>↓</button>
          </span>
        </div>
        ${item.id === tplStage.selectedItemId ? `
        <div class="ci-base-chip-detail">
          <div class="scenario-field">
            <span>분석범위</span>
            <div id="tplStageBehaviors" class="scenario-behavior-options"></div>
          </div>
          <textarea id="tplDeepInstruction" class="ci-stage-notes" rows="3"
            placeholder="이 단계에서 중점적으로 확인할 내용(추가 지시)">${escapeHtml(item.instruction || "")}</textarea>
        </div>` : ""}
      `).join("") || `<div class="empty-state">서비스를 추가해 심층 분석 시나리오를 구성하세요.</div>`}
    </div>
  `;

  const stage4 = `
    <p class="ci-stage-note">보고서 생성과 검증 서비스를 통합 실행하여 보고서와 검증 결과를 생성합니다.</p>
    <div class="ci-base-ai-list">
      ${tplStageReportItems().map(item => `
        <div class="ci-base-chip">
          <strong>${escapeHtml(normalizeReportValidationLabel(item.label))}</strong>
        </div>
      `).join("")}
    </div>
  `;

  return `
    <label class="tpl-name-field">
      <span>템플릿 이름</span>
      <input id="tplStageName" type="text" placeholder="템플릿 이름을 입력하세요" value="${escapeHtml(tplStage.name)}">
    </label>
    ${tplStageSectionHtml("base",   "1. 기초데이터 분석", true,  stage1)}
    ${tplStageSectionHtml("ext",    "2. 외부데이터 수집", false, stage2)}
    ${tplStageSectionHtml("deep",   "3. 심층 분석 시나리오", false, stage3)}
    ${tplStageSectionHtml("report", "4. 보고서 생성 및 검증", true, stage4)}
    <button id="tplStageSaveButton" type="button" class="btn template-save-btn">분석 시나리오 템플릿 저장</button>
  `;
}

function tplStageRender(){
  const box = document.getElementById("tplStageEditor");
  if(!box) return;
  box.innerHTML = tplStageEditorHtml();
  const selected = tplStage?.items.find(item => item.id === tplStage.selectedItemId);
  if(selected && !ciIsReportStageItem(selected)){
    syncBehaviorOptions(selected.key, selected.behaviors, "tplStageBehaviors");
  }
}

function tplStageSave(){
  if(!tplStage) return;
  const name = String(document.getElementById("tplStageName")?.value || "").trim();
  if(!name){ alert("템플릿 이름을 입력해 주세요."); document.getElementById("tplStageName")?.focus(); return; }
  const deep = tplStageDeepItems().map((item, index) => ({ ...item, order: index + 1 }));
  const report = tplStageReportItems().map((item, index) => ({ ...item, order: deep.length + index + 1 }));
  const payload = {
    name,
    description: `${new Date().toLocaleDateString("ko-KR")} 저장 · 4단계`,
    items: [...deep, ...report].map(item => ({ ...item, id: uid() })),
    baseAiServices: tplStage.baseAiServices.map(svc => ({ ...svc })),
    extAgencies: [...tplStage.extAgencies],
    extUrlOpen: tplStage.extUrlOpen,
    webTargets: tplStage.webTargets.map(target => ({ ...target })),
    deepNotes: tplStage.deepNotes,
  };
  const customIdx = tplStage.id ? customTemplates.findIndex(t => t.id === tplStage.id) : -1;
  const isBuiltin = tplStage.id && scenarioTemplates.some(t => t.id === tplStage.id);
  if(customIdx >= 0){
    customTemplates[customIdx] = { ...customTemplates[customIdx], ...payload, isCustom: true };
  }else if(isBuiltin){
    builtinOverrides[tplStage.id] = payload;
  }else{
    const newId = `custom-${uid()}`;
    customTemplates.unshift({
      id: newId, ...payload, isCustom: true, shared: true,
      ownerUserId: currentUserId, ownerName: currentUser().name, ownerOrgId: currentUserGroup().org,
    });
    tplStage.id = newId;
  }
  saveTemplatesState();
  saveCanvasState();
  alert(`"${name}" 템플릿이 저장되었습니다.`);
  render(currentPage);
}

/* 템플릿 스테이지 편집기 — 위임 핸들러(클릭) */
document.addEventListener("click", (event) => {
  if(event.target.closest("[data-tpl-new]")){
    tplStageLoad(null);
    tplStageRender();
    return;
  }
  if(!document.getElementById("tplStageEditor")) return;   // 관세조사 템플릿 탭이 아닐 때 미개입

  const stageToggle = event.target.closest("[data-tpl-stage-toggle]");
  if(stageToggle && tplStage){
    const key = stageToggle.dataset.tplStageToggle;
    tplStage.stageOpen[key] = !tplStage.stageOpen[key];
    tplStageRender();
    return;
  }
  const baseChip = event.target.closest("[data-tpl-base-chip]");
  if(baseChip && tplStage){
    const key = baseChip.dataset.tplBaseChip;
    tplStage.baseDetailKey = (tplStage.baseDetailKey === key && tplStage.baseSelectedKey === key) ? null : key;
    tplStage.baseSelectedKey = key;
    tplStageRender();
    return;
  }
  if(event.target.closest("[data-tpl-base-add]") && tplStage){
    const key = document.getElementById("tplBaseSelect")?.value;
    const source = key ? scenarioSourceByKey(key) : null;
    if(!source) return;
    if(tplStage.baseAiServices.some(svc => svc.key === `svc_${key}`)){ alert("이미 추가된 서비스입니다."); return; }
    tplStage.baseAiServices.push({
      key: `svc_${key}`, label: source.label,
      desc: AI_SERVICE_REGISTRY[key]?.description || AI_SERVICE_REGISTRY[key]?.desc || "기초조사 배치 수행에 포함됩니다.",
    });
    tplStage.baseSelectedKey = `svc_${key}`;
    tplStage.baseDetailKey = `svc_${key}`;
    tplStageRender();
    return;
  }
  if(event.target.closest("[data-tpl-base-delete]") && tplStage){
    if(!tplStage.baseSelectedKey){ alert("삭제할 AI 분석서비스를 먼저 선택하세요."); return; }
    tplStage.baseAiServices = tplStage.baseAiServices.filter(svc => svc.key !== tplStage.baseSelectedKey);
    tplStage.baseSelectedKey = null;
    tplStage.baseDetailKey = null;
    tplStageRender();
    return;
  }
  const reqToggle = event.target.closest("[data-tpl-req-toggle]");
  if(reqToggle && tplStage){
    const item = tplStage.items.find(entry => entry.id === reqToggle.dataset.tplReqToggle);
    if(item){ item.required = !ciTemplateItemRequired(item); tplStageRender(); }
    return;
  }
  const moveBtn = event.target.closest("[data-tpl-move]");
  if(moveBtn && tplStage){
    const deep = tplStageDeepItems();
    const pos = deep.findIndex(item => item.id === moveBtn.dataset.tplMove);
    const swapWith = moveBtn.dataset.dir === "up" ? pos - 1 : pos + 1;
    if(pos < 0 || swapWith < 0 || swapWith >= deep.length) return;
    const a = tplStage.items.indexOf(deep[pos]);
    const b = tplStage.items.indexOf(deep[swapWith]);
    [tplStage.items[a], tplStage.items[b]] = [tplStage.items[b], tplStage.items[a]];
    tplStageRender();
    return;
  }
  const deepChip = event.target.closest("[data-tpl-deep-chip]");
  if(deepChip && tplStage){
    const id = deepChip.dataset.tplDeepChip;
    tplStage.selectedItemId = tplStage.selectedItemId === id ? null : id;
    tplStageRender();
    return;
  }
  if(event.target.closest("[data-tpl-deep-add]") && tplStage){
    const key = document.getElementById("tplDeepSelect")?.value;
    const source = key ? scenarioSourceByKey(key) : null;
    if(!source) return;
    const item = {
      id: uid(), key, type: source.type, label: source.label,
      behaviors: sourceDefaultBehaviors(key), required: false,
      instruction: sourceDefaultInstruction(key) || "",
      targetType: "company", target_type: "company", shareRecipients: [], webTargets: [],
    };
    const deep = tplStageDeepItems();
    const insertAt = deep.length ? tplStage.items.indexOf(deep[deep.length - 1]) + 1 : 0;
    tplStage.items.splice(insertAt, 0, item);
    tplStage.selectedItemId = item.id;
    tplStageRender();
    return;
  }
  if(event.target.closest("[data-tpl-deep-delete]") && tplStage){
    const selected = tplStage.items.find(item => item.id === tplStage.selectedItemId);
    if(!selected || ciIsReportStageItem(selected)){ alert("삭제할 심층 서비스를 먼저 선택하세요."); return; }
    tplStage.items = tplStage.items.filter(item => item.id !== selected.id);
    tplStage.selectedItemId = null;
    tplStageRender();
    return;
  }
  if(event.target.closest("[data-tpl-web-add]")){
    const url = String(document.getElementById("tplWebUrl")?.value || "").trim();
    const query = String(document.getElementById("tplWebQuery")?.value || "").trim();
    const loginId = String(document.getElementById("tplWebLoginId")?.value || "").trim();
    const loginPw = String(document.getElementById("tplWebLoginPw")?.value || "");
    if(!url && !query) return;
    if(url && !isValidHttpUrl(url)){ alert("http 또는 https URL을 입력하세요."); return; }
    tplStage.webTargets = normalizeWebTargets([...tplStage.webTargets, { url, query, loginId, loginPw }]);
    tplStageRender();
    return;
  }
  const tplWebRemove = event.target.closest("[data-tpl-web-remove]");
  if(tplWebRemove){
    tplStage.webTargets = tplStage.webTargets.filter((_, index) => index !== Number(tplWebRemove.dataset.tplWebRemove));
    tplStageRender();
    return;
  }
  if(event.target.closest("#tplStageSaveButton")){
    tplStageSave();
    return;
  }
});

/* 템플릿 스테이지 편집기 — 입력/체크 핸들러 */
document.addEventListener("input", (event) => {
  if(!tplStage || !document.getElementById("tplStageEditor")) return;
  if(event.target?.id === "tplStageName"){ tplStage.name = event.target.value; return; }
  if(event.target?.id === "tplDeepNotes"){ tplStage.deepNotes = event.target.value; return; }
  if(event.target?.id === "tplDeepInstruction"){
    const item = tplStage.items.find(entry => entry.id === tplStage.selectedItemId);
    if(item) item.instruction = event.target.value;
    return;
  }
  const baseNote = event.target.closest?.("[data-tpl-base-note]");
  if(baseNote){
    const svc = tplStage.baseAiServices.find(entry => entry.key === baseNote.dataset.tplBaseNote);
    if(svc) svc.note = baseNote.value;
  }
});

document.addEventListener("change", (event) => {
  if(!tplStage || !document.getElementById("tplStageEditor")) return;
  const agency = event.target.closest?.("[data-tpl-agency]");
  if(agency){
    tplStage.extAgencies = agency.checked
      ? [...new Set([...tplStage.extAgencies, agency.dataset.tplAgency])]
      : tplStage.extAgencies.filter(key => key !== agency.dataset.tplAgency);
    return;
  }
  if(event.target.closest?.("[data-tpl-url-toggle]")){
    tplStage.extUrlOpen = event.target.checked;
    tplStageRender();
    return;
  }
  if(event.target.closest?.("#tplStageBehaviors")){
    const item = tplStage.items.find(entry => entry.id === tplStage.selectedItemId);
    if(item) item.behaviors = selectedBehaviorValues("tplStageBehaviors");
  }
});

function scenarioTemplatePanel(domain = "customs"){
  templateEditorDomain = domain;
  const allTemplates = allScenarioTemplates(domain);
  // 관세조사: 4단계 스테이지 편집기(분석 시나리오 확인 및 설정과 동일 구성, 실행 없음)
  if(domain === "customs"){
    return `
      <div class="template-management-layout tpl-stage-layout">
        <aside class="template-editor-panel tpl-stage-panel">
          <div class="template-editor-header">분석 시나리오 템플릿 설정하기</div>
          <div class="template-editor-body ci-stage-side tpl-stage-editor" id="tplStageEditor">${tplStageEditorHtml()}</div>
        </aside>
        <div class="template-grid-area">
          <div class="template-grid-header">
            <div>
              <h2>분석 시나리오 템플릿</h2>
              <p class="muted">공통 조사 흐름을 관리하는 화면입니다. 기업별 실행 화면에서는 여기의 템플릿을 불러와 필요한 부분만 조정합니다.</p>
            </div>
            <button type="button" class="btn secondary" data-tpl-new>새 템플릿</button>
          </div>
          <div class="template-card-grid">
            ${allTemplates.map(t => templateCardHtml(t)).join("")}
          </div>
        </div>
      </div>
    `;
  }
  const editorName = editingTemplateName();
  const hasEditing = !!editingTemplateId;
  const allowNew = false; // 일반/마약/외환은 빌트인 편집만
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
            <span>분석범위</span>
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
  // reviewMode: 사전 준비된 결과를 확인하고 설정을 조정하는 설정/결과 화면(관세조사·관세수사).
  // 일괄 실행·초기화 버튼 대신 선택 서비스 단독 실행("AI 분석서비스 수행")만 노출한다.
  const reviewMode        = ctx.reviewMode        || false;
  // reviewRunButtons: 리뷰 레이아웃(분석범위별 상세설정·결과/통합 프롬프트 탭)을 쓰되
  // 실시간 실행 버튼(단계별 자동실행 등)을 유지 — 관세수사(실행형 도메인)용
  const reviewRunButtons  = ctx.reviewRunButtons  || false;
  const reviewNoteHtml    = ctx.reviewNoteHtml    || "";
  const titleHtml         = ctx.titleHtml         || "조사 및 수사 분석 단계";
  const subtitleHtml      = ctx.subtitleHtml       || "";
  const templateOptionsHtml = ctx.templateOptionsHtml || scenarioTemplateOptionsHtml();
  // 워크벤치 렌더의 단일 통과 지점 — 이후 renderScenarioSteps/syncScenarioEditor가 모드별로 분기한다
  scenarioReviewMode = reviewMode;

  return `
    <section class="card scenario-workbench scenario-workbench-v2${reviewMode ? " scenario-review-mode" : ""}">
      <div class="scenario-work-header">
        <div class="scenario-title-row">
          <div>
            <h3>${titleHtml}</h3>
            <p class="muted">${subtitleHtml}</p>
          </div>
        </div>

        <div class="scenario-header-actions">
          <div class="scenario-runall-zone">
            <button id="scenarioRunAllButton" type="button" class="btn primary scenario-runall-btn"
              ${archived ? "disabled" : ""} title="시나리오의 모든 단계를 순서대로 실행합니다">▶ 전체 시나리오 수행</button>
          </div>

          <div class="scenario-service-zone${scenarioServiceZoneOpen ? " open" : ""}">
            <button id="scenarioServiceToggle" type="button" class="btn secondary scenario-zone-toggle"
              title="AI 서비스 패널 ${scenarioServiceZoneOpen ? "닫기" : "열기"}">🤖 AI 서비스 ${scenarioServiceZoneOpen ? "▴" : "▾"}</button>
            <span class="scenario-service-controls" ${scenarioServiceZoneOpen ? "" : `style="display:none"`}>
              <select id="scenarioQuickSourceSelect" class="scenario-template-select"></select>
              <button type="button" class="btn scenario-template-apply-btn" data-scenario-quick-add
                ${archived ? "disabled" : ""}>단계 추가</button>
              <button type="button" class="btn secondary scenario-template-apply-btn" data-scenario-quick-delete
                ${archived ? "disabled" : ""}>선택 삭제</button>
            </span>
          </div>

          <div class="scenario-template-zone${scenarioTemplateZoneOpen ? " open" : ""}">
            <button id="scenarioTemplateToggle" type="button" class="btn secondary scenario-zone-toggle"
              title="분석 템플릿 패널 ${scenarioTemplateZoneOpen ? "닫기" : "열기"}">🧩 분석 템플릿 ${scenarioTemplateZoneOpen ? "▴" : "▾"}</button>
            <span class="scenario-template-controls" ${scenarioTemplateZoneOpen ? "" : `style="display:none"`}>
              <select id="scenarioTemplateSelect" class="scenario-template-select">
                ${templateOptionsHtml}
              </select>
              <button id="scenarioTemplateApplyButton" type="button"
                class="btn scenario-template-apply-btn" ${archived ? "disabled" : ""}>
                템플릿적용하기
              </button>
              <button id="scenarioSaveButton" type="button"
                class="btn secondary scenario-save-bottom">신규 템플릿으로 등록</button>
            </span>
          </div>
        </div>
      </div>

      <section class="scenario-board">
        <ol id="scenarioList" class="scenario-list scenario-list-horizontal"></ol>
      </section>

      <div class="scenario-layout scenario-execution-layout">
        <aside class="scenario-config">
          <div class="scenario-agent-zone">
            <div id="scenarioSourceHint" class="scenario-source-hint"></div>
            ${reviewMode ? `
            <div class="scenario-field scenario-setting-field" id="scenarioServiceSettingsField" style="display:none">
              <span>입력/설정값</span>
              <div id="scenarioServiceSettings" class="scenario-setting-options"></div>
            </div>
            ` : `
            <div class="scenario-field">
              <span>분석범위</span>
              <div id="scenarioBehaviorOptions" class="scenario-behavior-options"></div>
            </div>
            `}
            <div id="scenarioShareEmailPanel"></div>
            <div id="scenarioWebTargetPanel"></div>
            <div id="scenarioRagPanel"></div>
            ${reviewMode ? `
            <div class="scenario-field scenario-behavior-prompt-field">
              <div id="scenarioBehaviorPromptList" class="scenario-behavior-prompt-list"></div>
            </div>
            ` : `
            <label class="scenario-field">
              <span>자동 생성 프롬프트</span>
              <textarea id="scenarioInstruction"
                class="scenario-prompt-editor"
                placeholder="선택한 AI 서비스와 동작 조건에 맞춰 최적 프롬프트가 자동 생성됩니다. 필요하면 직접 수정하세요."></textarea>
            </label>
            `}
          </div>
          <div id="scenarioPromptValidation" class="scenario-prompt-validation"></div>
          <div class="scenario-prompt-actions">
            <button id="scenarioApplyPromptButton" type="button" class="btn secondary"
              ${archived ? "disabled" : ""}>프롬프트 변경 적용</button>
            <button id="scenarioValidatePromptButton" type="button" class="btn secondary"
              ${archived ? "disabled" : ""}>프롬프트 검증</button>
            ${reviewMode && !reviewRunButtons ? `
            <button id="scenarioReviewRunButton" type="button" class="btn primary"
              ${archived ? "disabled" : ""}>▶ AI 분석서비스 수행</button>
            ` : `
            <button id="scenarioRunSelectedButton" type="button" class="btn primary"
              ${archived ? "disabled" : ""}>▶ 이 AI서비스만 실행</button>
            `}
          </div>
        </aside>

        <section class="scenario-log">
          <div class="scenario-log-head">
            ${reviewMode ? `
            <div class="scenario-result-tabs">
              <button type="button" class="scenario-result-tab ${scenarioResultViewTab === "result" ? "active" : ""}" data-result-view-tab="result">분석 결과</button>
              <button type="button" class="scenario-result-tab ${scenarioResultViewTab === "prompt" ? "active" : ""}" data-result-view-tab="prompt">통합 프롬프트</button>
            </div>
            ` : `<h3>분석 실행 로그</h3>`}
            <div class="scenario-log-actions">
              ${reviewMode && !reviewRunButtons ? reviewNoteHtml : `
              <button id="scenarioRunButton" type="button" class="btn"
                ${archived ? "disabled" : ""}>단계별 자동실행</button>
              <button id="scenarioClearButton" type="button" class="btn secondary"
                ${archived ? "disabled" : ""}>결과 지우기</button>
              `}
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

/* ── 관세조사 — 분석 시나리오 확인 및 설정: 4단계 스테이지 UI ──────────────
   (1) 기초 조사 분석(default·항시 수행) → (2) 외부데이터 수집(외부기관+웹 정보수집 통합)
   → (3) 심층 분석 시나리오(서비스 추가·순서변경·착안사항) → (4) 보고서 생성 및 검증(default).
   좌측 25% 설정(스테이지 아코디언) / 우측 75% 분석 결과 로그.
   기존 워크벤치의 요소 id 계약(scenarioList·scenarioStepAccordion·픽커·템플릿 등)을
   유지하므로 실행·프롬프트·리뷰모드 엔진 함수는 그대로 동작한다. */
/* 기초조사 — 아래 서비스들을 배치(Batch)로 항시 수행 (서비스 → 세부 수행 항목) */
const CI_BASE_BATCH_SERVICES = [
  { label: "CDW 조회", items: ["기업 프로파일·수입신고 내역", "최근 심사/범죄 이력"] },
  { label: "심사정보 RAG 조회", items: ["유사사례 검색"] },
  { label: "빅데이터모델 결과수집", items: ["기업심사통합정보"] },
  { label: "전자통관 외부정보조회", items: ["국세청(세적정보)", "한국은행(외환거래)", "여신협회(해외카드내역)"] },
  { label: "수입신고서 검증(신고내용·첨부파일)", items: [] },
];
const CI_BASE_TAIL_SERVICES = [
  { label: "법령검토(통관적법성 검증)", items: [] },
];
/* 기초조사 AI 분석서비스 — 관리 가능한 목록(추가/삭제·영속), 칩 클릭 시 상세 토글 */
const CI_BASE_AI_DEFAULTS = [
  { key: "base_hs",     label: "품목분류 검증",     desc: "신고 품목의 HS코드 분류 적정성을 검증합니다." },
  { key: "base_price",  label: "신고가격 검증",     desc: "신고가격·과세가격의 적정성(저가·고가신고 여부)을 검증합니다." },
  { key: "base_refund", label: "환급내역 검증",     desc: "관세 환급 신청 내역의 적정성을 검증합니다." },
  { key: "base_forex",  label: "외환거래 분석",     desc: "수입대금 송금·외환거래와 신고내역의 일치 여부를 분석합니다." },
  { key: "base_req",    label: "요건확인대상 검증", desc: "수입요건 확인 대상 해당 여부와 요건 구비를 검증합니다." },
  { key: "base_origin", label: "원산지 검증",       desc: "FTA 원산지결정기준 충족·원산지증명서 적정성을 검증합니다." },
];
let ciBaseAiServices = CI_BASE_AI_DEFAULTS.map(svc => ({ ...svc }));   // 영속
let ciBaseNotesByCompany = {};                                         // 기초조사 착안사항(기업별·영속)
let ciBaseSelectedKey = null;                                          // 선택 칩(삭제 대상)
let ciBaseDetailOpenKey = null;                                        // 상세 토글(칩 재클릭으로 접기)
let ciBaseRunStatus = {};                                              // 기초 배치 실행 상태 { label: running|done|error }

/* 기초 배치 고정 서비스 → 실제 실행 서비스 매핑(세부 항목은 프롬프트로 전달) */
const CI_BASE_FIXED_RUNS = [
  { label: "CDW 조회", key: "db_cdw",
    instruction: "기업 프로파일·수입신고 내역과 최근 심사/범죄 이력을 조회하십시오." },
  { label: "심사정보 RAG 조회", key: "rag_audit",
    instruction: "유사사례를 검색하여 조사 참고사항을 정리하십시오." },
  { label: "빅데이터모델 결과수집", key: "ml",
    instruction: "기업심사통합정보(빅데이터모델 결과)를 수집·정리하십시오." },
  { label: "전자통관 외부정보조회", key: "db_external",
    instruction: "국세청(세적정보)·한국은행(외환거래)·여신협회(해외카드내역) 정보를 조회하십시오." },
  { label: "수입신고서 검증(신고내용·첨부파일)", key: "declaration_verify",
    instruction: "수입신고 내용과 첨부파일의 정합성을 검증하십시오." },
];
/* 기초 AI 분석서비스(기본 6종) → 실행 서비스 매핑 — 미매핑은 수입신고검증 관점 실행 */
const CI_BASE_AI_RUN_KEYS = {
  base_hs: "hs_verify", base_price: "customs_value", base_forex: "abnormal_trade",
  base_refund: "declaration_verify", base_req: "declaration_verify", base_origin: "declaration_verify",
};

function ciBaseStateIcon(state){
  return state === "running" ? "⏳" : state === "done" ? "✅" : state === "error" ? "⚠️" : "";
}

function ciPaintBaseRunStatus(){
  document.querySelectorAll("[data-ci-base-state]").forEach(el => {
    el.textContent = ciBaseStateIcon(ciBaseRunStatus[el.dataset.ciBaseState]);
  });
}

/* 기초 고정 서비스 박스의 선택 강조 — ciSelectedBase와 동기화 */
function ciPaintBaseSelection(){
  document.querySelectorAll("[data-ci-base-result]").forEach(li =>
    li.classList.toggle("active", li.dataset.ciBaseResult === ciSelectedBase));
}

/* 저장하지 않는 일회성 실행 항목 — 기초 배치 순차 수행용 */
function ciTransientItem(key, label, instruction){
  const source = scenarioSourceByKey(key) || {};
  return {
    id: `cibase_${uid()}`, key, type: source.type || "agent", label,
    behaviors: sourceDefaultBehaviors(key), order: 0,
    targetType: "company", target_type: "company",
    instruction, shareRecipients: [], webTargets: [],
  };
}

/* 기초 조사 분석 실행 — 고정 배치 5종 + 등록된 AI 분석서비스 전체를 순차 수행 */
async function ciRunBaseBatch(){
  const specs = [
    ...CI_BASE_FIXED_RUNS.map(fixed => ({ ...fixed })),
    ...ciBaseAiServices.map(svc => ({
      label: svc.label,
      key: CI_BASE_AI_RUN_KEYS[svc.key]
        || (svc.key.startsWith("svc_") ? svc.key.slice(4) : "declaration_verify"),
      instruction: `${svc.desc || `${svc.label}을(를) 수행하십시오.`}` +
        (svc.note ? `\n[조사 착안사항·확인사항]\n${svc.note}` : ""),
    })),
    { label: "법령검토(통관적법성 검증)", key: "law",
      instruction: "통관적법성 관점에서 관련 법령을 검토하십시오." },
  ];
  ciBaseRunStatus = {};
  ciBaseRunResults = [];
  ciPaintBaseRunStatus();
  ciRenderResultTab();
  for(const spec of specs){
    const item = ciTransientItem(spec.key, spec.label, spec.instruction);
    if(!scenarioItemHasPermission(item)){
      ciBaseRunStatus[spec.label] = "error";
      ciBaseRunResults.push({ label: spec.label, status: "error", output: "권한이 없어 건너뛰었습니다." });
      ciPaintBaseRunStatus();
      ciRenderResultTab();
      continue;
    }
    ciBaseRunStatus[spec.label] = "running";
    const entry = { label: spec.label, status: "running", output: "" };
    ciBaseRunResults.push(entry);
    ciPaintBaseRunStatus();
    ciRenderResultTab();
    await new Promise(resolve => runSingleScenarioItem(item, resolve));
    entry.status = stepStatuses[item.id] === "오류" ? "error" : "done";
    entry.output = stepOutputs[item.id] || "";
    ciBaseRunStatus[spec.label] = entry.status;
    ciPaintBaseRunStatus();
    ciRenderResultTab();
  }
}

function ciBaseAiListHtml(){
  return ciBaseAiServices.map(svc => `
    <div class="ci-base-chip${svc.key === ciBaseSelectedKey ? " active" : ""}" data-ci-base-chip="${escapeHtml(svc.key)}">
      <strong>${escapeHtml(svc.label)}</strong>
      <span class="ci-base-chip-side">
        <i class="ci-base-state" data-ci-base-state="${escapeHtml(svc.label)}">${ciBaseStateIcon(ciBaseRunStatus[svc.label])}</i>
        <i>${ciBaseDetailOpenKey === svc.key ? "▴" : "▾"}</i>
      </span>
    </div>
    ${ciBaseDetailOpenKey === svc.key ? `
    <div class="ci-base-chip-detail">
      <p>${escapeHtml(svc.desc || "기초조사 배치 수행에 포함됩니다.")}</p>
      <textarea class="ci-stage-notes ci-base-svc-notes" data-ci-base-note="${escapeHtml(svc.key)}" rows="2"
        placeholder="조사 착안사항 및 확인사항">${escapeHtml(svc.note || "")}</textarea>
    </div>` : ""}
  `).join("");
}

function ciRenderBaseAiList(){
  const box = document.getElementById("ciBaseAiList");
  if(box) box.innerHTML = ciBaseAiListHtml()
    || `<div class="empty-state">등록된 AI 분석서비스가 없습니다.</div>`;
}
const CI_EXT_AGENCIES = [
  { key: "dart",   label: "금융감독원 전자공시시스템(DART)" },
  { key: "nice",   label: "NICE평가정보 BizLINE" },
  { key: "cretop", label: "한국기업데이터 CRETOP" },
  { key: "kpds",   label: "코리아PDS(KOREA PDS)" },
  { key: "kpi",    label: "한국물가정보(KPI)" },
  { key: "kipris", label: "특허정보넷(KIPRIS)" },
  { key: "orbis",  label: "뷰로반다이크(ORBIS)" },
  { key: "dnb",    label: "Dun&Bradstreet(D&B)" },
];
let ciStageOpen = { base: false, ext: false, deep: true, report: false };   // 세션 UI 상태
let ciDetailCollapsed = false;   // 선택 서비스 상세 접힘 — 활성 칩 재클릭으로 토글
let ciExtAgencyChecked = new Set(["dart", "nice", "orbis"]);                // 외부기관 선택(영속)
let ciExtUrlOpen = true;                                                    // URL 직접 등록 체크(상세 폼 표시·영속)
let ciScenarioNotesByCompany = {};                                          // 조사 착안사항(기업별·영속)

/* 스테이지 아코디언 토글 — DOM 클래스만 전환(재렌더 없음). '외부데이터 수집'을 열면
   웹 정보수집 서비스가 선택되어 URL 등록 폼이 해당 서비스에 바로 연결된다. */
document.addEventListener("click", (event) => {
  /* 기초조사 AI 분석서비스 — 칩 선택/상세 토글·추가·삭제 */
  const baseChip = event.target.closest("[data-ci-base-chip]");
  if(baseChip){
    const key = baseChip.dataset.ciBaseChip;
    ciBaseDetailOpenKey = (ciBaseDetailOpenKey === key && ciBaseSelectedKey === key) ? null : key;
    ciBaseSelectedKey = key;
    ciRenderBaseAiList();
    // '선택된 서비스 분석결과'가 이 기초 서비스의 결과를 가리키게 한다
    const svc = ciBaseAiServices.find(entry => entry.key === key);
    if(svc){
      ciSelectedBase = svc.label;
      ciResultTab = "selected";
      ciRenderResultTab();
      ciPaintBaseSelection();
    }
    return;
  }
  // 기초데이터 분석 고정 서비스(CDW 조회 등) 클릭 → 해당 배치 결과를 선택 결과로 표시
  const baseFixed = event.target.closest("[data-ci-base-result]");
  if(baseFixed){
    ciSelectedBase = baseFixed.dataset.ciBaseResult;
    ciResultTab = "selected";
    ciRenderResultTab();
    ciPaintBaseSelection();
    return;
  }
  if(event.target.closest("[data-ci-base-add]")){
    const select = document.getElementById("ciBaseServiceSelect");
    const key = select?.value;
    const source = key ? scenarioSourceByKey(key) : null;
    if(!source) return;
    if(ciBaseAiServices.some(svc => svc.key === `svc_${key}`)){
      alert("이미 기초조사에 추가된 서비스입니다.");
      return;
    }
    ciBaseAiServices.push({
      key: `svc_${key}`,
      label: source.label,
      desc: AI_SERVICE_REGISTRY[key]?.description || AI_SERVICE_REGISTRY[key]?.desc
        || "기초조사 배치 수행에 포함됩니다.",
    });
    ciBaseSelectedKey = `svc_${key}`;
    ciBaseDetailOpenKey = `svc_${key}`;
    ciRenderBaseAiList();
    saveCanvasState();
    return;
  }
  if(event.target.closest("[data-ci-base-delete]")){
    if(!ciBaseSelectedKey){ alert("삭제할 AI 분석서비스를 먼저 선택하세요."); return; }
    ciBaseAiServices = ciBaseAiServices.filter(svc => svc.key !== ciBaseSelectedKey);
    ciBaseSelectedKey = null;
    ciBaseDetailOpenKey = null;
    ciRenderBaseAiList();
    saveCanvasState();
    return;
  }

  /* 단계 헤더 [▶ 실행] — 토글보다 먼저 처리(헤더 내부 버튼) */
  const stageRun = event.target.closest("[data-ci-stage-run]");
  if(stageRun){
    ciRunStage(stageRun.dataset.ciStageRun, stageRun);
    return;
  }

  const toggle = event.target.closest("[data-ci-stage-toggle]");
  if(!toggle) return;
  const key = toggle.dataset.ciStageToggle;
  ciStageOpen[key] = !ciStageOpen[key];
  const section = toggle.closest(".ci-stage");
  section?.classList.toggle("open", ciStageOpen[key]);
  if(key === "ext" && ciStageOpen.ext){
    const webItem = scenarioItems.find(item => item.key === "web_search");
    if(webItem && selectedScenarioId !== webItem.id){
      selectedScenarioId = webItem.id;
      renderScenarioList();
      syncScenarioEditor();
      if(scenarioReviewMode) renderScenarioSteps();
    }
    renderWebTargetPanel("scenario");
  }
});

document.addEventListener("change", (event) => {
  const agency = event.target.closest("[data-ci-agency]");
  if(agency){
    if(agency.checked) ciExtAgencyChecked.add(agency.dataset.ciAgency);
    else ciExtAgencyChecked.delete(agency.dataset.ciAgency);
    saveCanvasState();
    return;
  }
  // URL 직접 등록 체크 → 상세(URL·키워드 등록 폼) 표시/숨김
  const urlToggle = event.target.closest("[data-ci-url-toggle]");
  if(urlToggle){
    ciExtUrlOpen = urlToggle.checked;
    const panel = document.getElementById("ciExtWebPanel");
    if(panel){
      panel.hidden = !ciExtUrlOpen;
      if(ciExtUrlOpen) renderWebTargetPanel("scenario");
    }
    saveCanvasState();
  }
});

document.addEventListener("input", (event) => {
  if(event.target?.id === "ciScenarioNotes"){
    if(activeCanvasCompanyId) ciScenarioNotesByCompany[activeCanvasCompanyId] = event.target.value;
    saveCanvasState();   // 디바운스 저장이므로 입력마다 호출해도 부담 없음
    return;
  }
  if(event.target?.id === "ciBaseNotes"){
    if(activeCanvasCompanyId) ciBaseNotesByCompany[activeCanvasCompanyId] = event.target.value;
    saveCanvasState();
    return;
  }
  // 기초조사 AI 분석서비스 — 서비스별 조사 착안사항·확인사항
  const baseNote = event.target.closest?.("[data-ci-base-note]");
  if(baseNote){
    const svc = ciBaseAiServices.find(entry => entry.key === baseNote.dataset.ciBaseNote);
    if(svc){ svc.note = baseNote.value; saveCanvasState(); }
  }
});

/* ── 결과 영역 탭 — 선택된 서비스 / 4단계별 결과 ── */
const CI_RESULT_TABS = [
  { key: "selected", label: "선택된 서비스 분석결과" },
  { key: "base",     label: "1. 기초데이터 분석 결과" },
  { key: "ext",      label: "2. 외부 데이터 수집 결과" },
  { key: "deep",     label: "3. 심층 분석 결과" },
  { key: "report",   label: "4. 보고서 생성 및 검증 결과" },
];
let ciResultTab = "selected";
let ciBaseRunResults = [];   // 기초 배치 실행 결과 [{label, status, output}]
let ciSelectedBase = null;   // '선택된 서비스 분석결과'가 가리키는 기초데이터 서비스 라벨(없으면 시나리오 선택 항목)

function ciResultBlockHtml(label, status, output){
  const statusLabel = status === "running" ? "실행 중" : status === "error" ? "오류" : status === "done" ? "완료" : "대기";
  return `
    <section class="ci-result-block">
      <div class="ci-result-block-head"><span>${escapeHtml(label)}</span><em>${statusLabel}</em></div>
      <div class="ci-result-block-body">
        ${output ? `<div class="markdown-output">${markdownToHtml(output)}</div>`
          : `<div class="muted" style="font-size:12px">${status === "running" ? "실행 중…" : "결과가 아직 없습니다."}</div>`}
      </div>
    </section>
  `;
}

function ciStageResultsHtml(stageKey){
  const blocks = [];
  if(stageKey === "base"){
    ciBaseRunResults.forEach(entry => blocks.push(ciResultBlockHtml(entry.label, entry.status, entry.output)));
  }
  if(stageKey === "ext"){
    ciExtRunResults.forEach(entry => blocks.push(ciResultBlockHtml(entry.label, entry.status, entry.output)));
  }
  scenarioItems
    .filter(item => ciTemplateItemStage(item) === stageKey)
    .forEach(item => {
      const status = { "실행 중": "running", "실행중": "running", "완료": "done", "오류": "error" }[stepStatuses[item.id]] || "wait";
      if(stepOutputs[item.id] || status !== "wait"){
        blocks.push(ciResultBlockHtml(normalizeReportValidationLabel(item.label), status, stepOutputs[item.id] || ""));
      }
    });
  if(!blocks.length){
    const stageLabel = CI_RESULT_TABS.find(t => t.key === stageKey)?.label || "";
    return `<div class="empty-state">${escapeHtml(stageLabel.replace(/ 결과$/, ""))}을(를) 실행하면 결과가 여기에 표시됩니다.</div>`;
  }
  return blocks.join("");
}

function ciRenderResultTab(){
  const body = document.getElementById("ciResultBody");
  const accordion = document.getElementById("scenarioStepAccordion");
  if(!body || !accordion) return;
  document.querySelectorAll("[data-ci-result-tab]").forEach(tab =>
    tab.classList.toggle("active", tab.dataset.ciResultTab === ciResultTab));
  const selectedMode = ciResultTab === "selected";
  // 선택된 서비스가 기초데이터 분석의 서비스면 accordion 대신 해당 결과 블록 표시
  const baseSelected = selectedMode && !!ciSelectedBase;
  accordion.style.display = selectedMode && !baseSelected ? "" : "none";
  body.style.display = selectedMode && !baseSelected ? "none" : "";
  if(baseSelected){
    const entry = ciBaseRunResults.find(e => e.label === ciSelectedBase);
    body.innerHTML = entry
      ? ciResultBlockHtml(entry.label, entry.status, entry.output)
      : `<section class="ci-result-block">
           <div class="ci-result-block-head"><span>${escapeHtml(ciSelectedBase)}</span><em>대기</em></div>
           <div class="ci-result-block-body">
             <div class="muted" style="font-size:12px">1. 기초데이터 분석을 실행하면 이 서비스의 결과가 표시됩니다.</div>
           </div>
         </section>`;
    return;
  }
  if(!selectedMode) body.innerHTML = ciStageResultsHtml(ciResultTab);
}

document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-ci-result-tab]");
  if(!tab) return;
  ciResultTab = tab.dataset.ciResultTab;
  ciRenderResultTab();
});

function ciStageSection(key, title, isDefault, bodyHtml){
  const open = ciStageOpen[key];
  return `
    <section class="ci-stage${open ? " open" : ""}" data-ci-stage="${key}">
      <div class="ci-stage-head" data-ci-stage-toggle="${key}" role="button" tabindex="0">
        <span>${title}${isDefault ? ` <em>(default)</em>` : ""}</span>
        <span class="ci-stage-head-actions">
          <button type="button" class="ci-stage-run" data-ci-stage-run="${key}" title="이 단계의 서비스를 순차 실행">▶ 실행</button>
        </span>
      </div>
      <div class="ci-stage-body">${bodyHtml}</div>
    </section>
  `;
}

/* 단계별 실행 — 해당 단계에 포함된 서비스를 순차 실행한다.
   기초(base)·외부데이터(ext)는 시나리오 구성과 무관하게 단계의 서비스를 수행한다. */
const CI_STAGE_RUN_KEYS = {
  ext: ["web_search", "external_agency"],
};

/* 외부기관 체크 키 → external_agency 서비스의 분석범위(behavior) 값 매핑 */
const CI_AGENCY_BEHAVIOR = {
  dart: "dart", nice: "nice_bizline", cretop: "cretop", kpds: "korea_pds",
  kpi: "kpi", kipris: "kipris", orbis: "orbis", dnb: "dnb",
};
let ciExtRunResults = [];   // 외부데이터 배치 실행 결과(시나리오에 없는 서비스의 일회성 실행분)

/* 외부데이터 수집 실행 — 외부기관정보수집 → 웹 정보수집 요청을 순차 수행.
   시나리오에 해당 서비스가 있으면 그 항목으로(선택 기관을 분석범위에 반영),
   없으면 일회성 항목으로 실행해 결과 탭에 기록한다. */
async function ciRunExtBatch(){
  ciExtRunResults = [];
  const agencyBehaviors = [...ciExtAgencyChecked].map(key => CI_AGENCY_BEHAVIOR[key]).filter(Boolean);
  const agencyItem = scenarioItems.find(item => item.key === "external_agency");
  const webItem = scenarioItems.find(item => item.key === "web_search");
  const specs = [
    {
      label: "외부기관정보수집 AI 서비스",
      transient: !agencyItem,
      item: agencyItem
        ? { ...agencyItem, behaviors: agencyBehaviors.length ? agencyBehaviors : agencyItem.behaviors }
        : (() => {
            const item = ciTransientItem("external_agency", "외부기관정보수집 AI 서비스",
              "선택한 외부기관 사이트의 공시·신용·시세·특허 정보를 수집하십시오.");
            if(agencyBehaviors.length) item.behaviors = agencyBehaviors;
            return item;
          })(),
    },
    {
      label: "웹 정보수집 요청 AI 서비스",
      transient: !webItem,
      item: webItem || ciTransientItem("web_search", "웹 정보수집 요청 AI 서비스",
        "등록된 URL·검색 키워드에 대한 수집 요청을 접수하십시오."),
    },
  ];
  for(const spec of specs){
    if(!scenarioItemHasPermission(spec.item)){
      ciExtRunResults.push({ label: spec.label, status: "error", output: "권한이 없어 건너뛰었습니다." });
      ciRenderResultTab();
      continue;
    }
    let entry = null;
    if(spec.transient){
      entry = { label: spec.label, status: "running", output: "" };
      ciExtRunResults.push(entry);
      ciRenderResultTab();
    }else{
      // 시나리오 항목 실행 — 선택을 따라가 진행 상태가 3단계 목록·결과 탭에 반영된다
      selectedScenarioId = spec.item.id;
      renderScenarioList();
      syncScenarioEditor();
      if(scenarioReviewMode) renderScenarioSteps();
    }
    await new Promise(resolve => runSingleScenarioItem(spec.item, resolve));
    if(entry){
      entry.status = stepStatuses[spec.item.id] === "오류" ? "error" : "done";
      entry.output = stepOutputs[spec.item.id] || "";
      ciRenderResultTab();
    }
  }
}

function ciStageRunItems(stageKey){
  if(stageKey === "report") return scenarioItems.filter(ciIsReportStageItem);
  if(stageKey === "deep")   return scenarioItems.filter(item => !ciIsReportStageItem(item));
  const keys = CI_STAGE_RUN_KEYS[stageKey] || [];
  return scenarioItems.filter(item => keys.includes(item.key));
}

async function ciRunStage(stageKey, btn){
  if(isCompanyArchived()){ alert("아카이브된 작업은 복원 후 분석할 수 있습니다."); return; }
  if(stageKey === "base" || stageKey === "ext"){
    if(btn){ btn.disabled = true; btn.textContent = "실행 중…"; }
    try{ await (stageKey === "base" ? ciRunBaseBatch() : ciRunExtBatch()); }
    finally{ if(btn){ btn.disabled = false; btn.textContent = "▶ 실행"; } }
    return;
  }
  const items = ciStageRunItems(stageKey).filter(scenarioItemHasPermission);
  if(!items.length){ alert("이 단계에서 실행할 수 있는 서비스가 시나리오에 없습니다."); return; }
  if(btn){ btn.disabled = true; btn.textContent = "실행 중…"; }
  try{
    for(const item of items){
      selectedScenarioId = item.id;
      renderScenarioList();
      syncScenarioEditor();
      if(scenarioReviewMode) renderScenarioSteps();
      await new Promise(resolve => runSingleScenarioItem(item, resolve));
    }
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = "▶ 실행"; }
  }
}

/* 관세조사 — 분석 시나리오 확인 및 설정 (리뷰 모드 · 4단계 스테이지 레이아웃) */
function scenarioReviewWorkbench(){
  const company = activeCanvasCompany();
  const archived = isCompanyArchived(company.company_id);
  const archive = currentRunArchive(company.company_id);
  scenarioReviewMode = true;   // 이후 renderScenarioSteps/syncScenarioEditor가 리뷰 모드로 분기
  const preparedNote = archive
    ? `<span class="muted" style="font-size:12px">사전 준비된 분석 결과 · ${escapeHtml(archive.savedAt || "")}</span>`
    : `<span class="muted" style="font-size:12px">준비된 분석 결과가 없습니다</span>`;

  const baseServiceList = services => `
    <ul class="ci-base-list">
      ${services.map(service => `
        <li class="ci-base-selectable" data-ci-base-result="${escapeHtml(service.label)}" title="클릭하면 이 서비스의 결과를 표시합니다">${escapeHtml(service.label)}
          <i class="ci-base-state" data-ci-base-state="${escapeHtml(service.label)}">${ciBaseStateIcon(ciBaseRunStatus[service.label])}</i>
          ${service.items.length
            ? `<ul>${service.items.map(entry => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`
            : ""}</li>
      `).join("")}
    </ul>
  `;
  const stage1 = `
    <p class="ci-stage-note">다음 서비스를 배치(Batch)로 항시 수행합니다(default) — 로그 수준의 초안 보고서를 생성합니다.</p>
    ${baseServiceList(CI_BASE_BATCH_SERVICES)}
    <div class="ci-base-ai">
      <strong class="ci-base-ai-title">AI 분석서비스</strong>
      <div class="ci-stage-tools">
        <select id="ciBaseServiceSelect" class="scenario-template-select"></select>
        <button type="button" class="btn scenario-template-apply-btn" data-ci-base-add ${archived ? "disabled" : ""}>서비스 추가</button>
        <button type="button" class="btn secondary scenario-template-apply-btn" data-ci-base-delete ${archived ? "disabled" : ""}>선택 삭제</button>
      </div>
      <textarea id="ciBaseNotes" class="ci-stage-notes" rows="2"
        placeholder="조사 착안사항 및 확인사항">${escapeHtml(ciBaseNotesByCompany[company.company_id] || "")}</textarea>
      <div class="ci-base-ai-list" id="ciBaseAiList">${ciBaseAiListHtml()}</div>
    </div>
    ${baseServiceList(CI_BASE_TAIL_SERVICES)}
  `;

  const stage2 = `
    <p class="ci-stage-note">데이터 수집이 필요한 외부 기관을 선택하세요.</p>
    <div class="ci-agency-list">
      ${CI_EXT_AGENCIES.map(agency => `
        <label><input type="checkbox" data-ci-agency="${agency.key}" ${ciExtAgencyChecked.has(agency.key) ? "checked" : ""}> ${escapeHtml(agency.label)}</label>
      `).join("")}
      <label><input type="checkbox" data-ci-url-toggle ${ciExtUrlOpen ? "checked" : ""}> URL 직접 등록</label>
    </div>
    <div id="ciExtWebPanel" class="ci-ext-web-panel" ${ciExtUrlOpen ? "" : "hidden"}></div>
  `;

  const stage3 = `
    <p class="ci-stage-note">심층분석을 위한 분석 시나리오 등록 — 서비스를 추가하고 순서를 변경하거나 조사 착안사항을 등록합니다.</p>
    <div class="ci-stage-tools">
      <select id="scenarioQuickSourceSelect" class="scenario-template-select"></select>
      <button type="button" class="btn scenario-template-apply-btn" data-scenario-quick-add ${archived ? "disabled" : ""}>서비스 추가</button>
      <button type="button" class="btn secondary scenario-template-apply-btn" data-scenario-quick-delete ${archived ? "disabled" : ""}>선택 삭제</button>
    </div>
    <textarea id="ciScenarioNotes" class="ci-stage-notes" rows="3"
      placeholder="조사 착안사항 및 확인사항">${escapeHtml(ciScenarioNotesByCompany[company.company_id] || "")}</textarea>
    <ol id="scenarioList" class="scenario-list ci-stage-list"></ol>
    <div id="ciStageConfigDock" class="ci-stage-config-dock">
    <div class="ci-stage-config">
      <div class="scenario-agent-zone">
        <div id="scenarioSourceHint" class="scenario-source-hint"></div>
        <div class="scenario-field scenario-setting-field" id="scenarioServiceSettingsField" style="display:none">
          <span>입력/설정값</span>
          <div id="scenarioServiceSettings" class="scenario-setting-options"></div>
        </div>
        <div id="scenarioShareEmailPanel"></div>
        <div id="scenarioWebTargetPanel"></div>
        <div id="scenarioRagPanel"></div>
        <div class="scenario-field scenario-behavior-prompt-field">
          <div id="scenarioBehaviorPromptList" class="scenario-behavior-prompt-list"></div>
        </div>
      </div>
      <div id="scenarioPromptValidation" class="scenario-prompt-validation"></div>
      <div class="scenario-prompt-actions">
        <button id="scenarioApplyPromptButton" type="button" class="btn secondary" ${archived ? "disabled" : ""}>프롬프트 변경 적용</button>
        <button id="scenarioValidatePromptButton" type="button" class="btn secondary" ${archived ? "disabled" : ""}>프롬프트 검증</button>
        <button id="scenarioReviewRunButton" type="button" class="btn primary" ${archived ? "disabled" : ""}>▶ AI 분석서비스 수행</button>
      </div>
    </div>
    </div>
  `;

  const stage4 = `
    <p class="ci-stage-note">보고서 생성과 검증 서비스를 통합 실행하여 보고서와 검증 결과를 생성합니다.</p>
    <ol id="ciStage4List" class="scenario-list ci-stage-list"></ol>
  `;

  return `
    <section class="card scenario-workbench scenario-workbench-v2 scenario-review-mode ci-stage-workbench">
      <div class="scenario-work-header">
        <div class="scenario-title-row">
          <div>
            <h3>분석 시나리오 확인 및 설정</h3>
            <p class="muted">기초데이터 분석 → 외부데이터 수집 → 심층 분석 시나리오 → 보고서 생성 및 검증의 4단계로 분석을 구성합니다. <em style="color:#0369a1;font-style:normal;font-weight:700">기초 분석과 보고서 생성·검증은 기본(default)으로 항시 수행됩니다.</em></p>
          </div>
        </div>
        <div class="scenario-header-actions">
          ${preparedNote}
          <button id="scenarioRunAllButton" type="button" class="btn primary scenario-runall-btn"
            ${archived ? "disabled" : ""} title="4단계 분석을 순서대로 실행합니다">▶ 전체 시나리오 수행</button>
        </div>
      </div>

      <div class="ci-stage-layout">
        <aside class="ci-stage-side">
          ${ciStageSection("base",   "1. 기초데이터 분석", true,  stage1)}
          ${ciStageSection("ext",    "2. 외부데이터 수집", false, stage2)}
          ${ciStageSection("deep",   "3. 심층 분석 시나리오", false, stage3)}
          ${ciStageSection("report", "4. 보고서 생성 및 검증", true, stage4)}
          <div class="ci-stage-templates">
            <select id="scenarioTemplateSelect" class="scenario-template-select">
              ${scenarioTemplateOptionsHtml()}
            </select>
            <div class="ci-stage-template-actions">
              <button id="scenarioTemplateApplyButton" type="button" class="btn scenario-template-apply-btn" ${archived ? "disabled" : ""}>템플릿 적용</button>
              <button id="scenarioSaveButton" type="button" class="btn secondary scenario-save-bottom">신규 템플릿 등록</button>
            </div>
          </div>
        </aside>

        <section class="scenario-log ci-stage-main">
          <div class="ci-result-tabs">
            ${CI_RESULT_TABS.map(tab => `
              <button type="button" class="ci-result-tab${ciResultTab === tab.key ? " active" : ""}"
                data-ci-result-tab="${tab.key}">${escapeHtml(tab.label)}</button>
            `).join("")}
          </div>
          <div id="scenarioClarify" class="scenario-clarify-slot"></div>
          <div id="scenarioStepAccordion" class="scenario-step-accordion" ${ciResultTab === "selected" ? "" : `style="display:none"`}></div>
          <div id="ciResultBody" class="ci-result-body" ${ciResultTab === "selected" ? `style="display:none"` : ""}></div>
        </section>
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════════════════════════
   관세수사 — AI서비스 분석 작업: 4단계 스테이지 UI
   관세조사 "분석 시나리오 확인 및 설정"(위 ci* 클러스터)의 복사본.
   공유가 아닌 독립 코드(gis* 접두)로 유지해 수사 쪽을 자유롭게 변경한다.
   실행은 관세수사 엔진(/api/gi_run SSE)을 쓰는 전용 러너(gisStreamSteps)로 수행.
   기존 워크벤치 요소 id 계약(scenarioList·scenarioStepAccordion·픽커·템플릿 등)은
   유지하므로 initGiScenarioWorkbench의 바인딩·엔진 함수는 그대로 동작한다.
   ═══════════════════════════════════════════════════════════════════════ */
const GIS_BASE_BATCH_SERVICES = [
  { label: "CDW 조회", items: ["피의자 관련 모든 자료 수집", "수출입내역 · 관세/환급내역"] },
  { label: "전자통관 외부기관정보", items: ["국세청(세적자료)", "한국은행(외환거래내역)", "여신협회(해외카드내역)"] },
];
const GIS_BASE_TAIL_SERVICES = [
  { label: "법령검토(통관적정성)", items: [] },
];
const GIS_BASE_AI_DEFAULTS = [
  { key: "base_decl",  label: "수입신고검증", desc: "수입신고 내용과 첨부서류의 정합성을 검증합니다." },
  { key: "base_price", label: "과세가격평가", desc: "신고가격·과세가격의 적정성(저가·고가신고 여부)을 평가합니다." },
  { key: "base_hs",    label: "품목분류검증", desc: "신고 품목의 HS코드 분류 적정성을 검증합니다." },
];
const GIS_BASE_FIXED_RUNS = [
  { label: "CDW 조회", key: "db_cdw",
    instruction: "피의자 관련 모든 자료(수출입내역, 관세/환급내역)를 수집하십시오." },
  { label: "전자통관 외부기관정보", key: "db_external",
    instruction: "국세청(세적자료)·한국은행(외환거래내역)·여신협회(해외카드내역) 정보를 조회하십시오." },
];
const GIS_BASE_AI_RUN_KEYS = {
  base_decl: "declaration_verify", base_price: "customs_value", base_hs: "hs_verify",
};
const GIS_EXT_AGENCIES = [
  { key: "dart",   label: "금융감독원 전자공시시스템(DART)" },
  { key: "nice",   label: "NICE평가정보 BizLINE" },
  { key: "cretop", label: "한국기업데이터 CRETOP" },
  { key: "kpds",   label: "코리아PDS(KOREA PDS)" },
  { key: "kpi",    label: "한국물가정보(KPI)" },
  { key: "kipris", label: "특허정보넷(KIPRIS)" },
  { key: "orbis",  label: "뷰로반다이크(ORBIS)" },
  { key: "dnb",    label: "Dun&Bradstreet(D&B)" },
];
const GIS_AGENCY_BEHAVIOR = {
  dart: "dart", nice: "nice_bizline", cretop: "cretop", kpds: "korea_pds",
  kpi: "kpi", kipris: "kipris", orbis: "orbis", dnb: "dnb",
};
const GIS_STAGE_RUN_KEYS = {
  ext: ["web_search", "external_agency"],
};
const GIS_RESULT_TABS = [
  { key: "selected", label: "선택된 서비스 분석결과" },
  { key: "base",     label: "1. 기초데이터 분석 결과" },
  { key: "ext",      label: "2. 증거 수집 결과" },
  { key: "deep",     label: "3. 접견/신문 결과" },
  { key: "report",   label: "4. 범죄일람표 결과" },
];
const GIS_STAGE_BASE_KEYS = ["db_cdw", "ml", "db_external", "rag_audit", "declaration_verify",
  "customs_value", "hs_verify", "abnormal_trade", "law"];

/* 증거 수집(2단계) 항목 카탈로그 — 요청/입수·임의조사·압수조사 */
const GIS_EVIDENCE_CATALOG = [
  { key: "fin",      label: "금융정보 – 은행 거래내역", desc: "은행 거래내역을 요청하여 증거로 분석합니다." },
  { key: "tel",      label: "통신내역 – 전화, SMS",     desc: "통신내역을 요청하여 증거로 분석합니다." },
  { key: "coop",     label: "해외 세관 공조 자료",      desc: "해외 세관 공조 자료를 요청하여 증거로 분석합니다." },
  { key: "books",    label: "장부·계약·회계자료",       desc: "장부·계약·회계자료 제출을 요구하여 증거로 분석합니다. (임의조사)" },
  { key: "inspect",  label: "현품검사·감정",            desc: "현품검사·감정을 실시하여 증거로 확보합니다. (임의조사)" },
  { key: "agency",   label: "관계기관 조회",            desc: "관계기관 조회로 자료를 확보하여 증거로 분석합니다. (임의조사)" },
  { key: "seizure",  label: "사업장 수색·압수",         desc: "사업장 수색·압수로 증거물을 확보합니다. (압수조사)" },
  { key: "forensic", label: "디지털 포렌식",            desc: "압수물 디지털 포렌식으로 증거를 분석합니다. (압수조사)" },
];
/* 접견/신문(3단계) 항목 카탈로그 — 본문은 기록 템플릿으로 시작 */
const GIS_INTERVIEW_CATALOG = [
  { key: "witness", label: "참고인-접견", template: "참고인 접견 내용\n일자 : \n참고인 : \n동행자 : \n수사관 : " },
  { key: "suspect", label: "혐의자 - 신문", template: "혐의자 신문 내용\n일자 : \n참고인 : \n동행자 : \n수사관 : " },
];

let gisBaseAiServices = GIS_BASE_AI_DEFAULTS.map(svc => ({ ...svc }));   // 영속
let gisBaseNotesByCase = {};        // 기초조사 착안사항(사건별·영속)
let gisScenarioNotesByCase = {};    // 수사 착안사항(사건별·영속)
let gisBaseSelectedKey = null;
let gisBaseDetailOpenKey = null;
let gisBaseRunStatus = {};
let gisBaseRunResults = [];
let gisExtRunResults = [];
let gisStageOpen = { base: false, ext: false, deep: true, report: false };   // ext=증거 수집, deep=접견/신문
let gisDetailCollapsed = false;
let gisExtAgencyChecked = new Set(["dart", "nice", "orbis"]);   // 영속
let gisExtUrlOpen = true;                                       // 영속
let gisResultTab = "selected";
let gisSelectedBase = null;
let gisStageEventSource = null;
let gisEvidenceByCase = {};        // 증거 수집 항목(사건별·영속) [{id,key,label,desc,note,status,result}]
let gisInterviewByCase = {};       // 접견/신문 항목(사건별·영속) [{id,key,label,content,status,result}]
let gisEvidenceNotesByCase = {};   // 2단계 공통 착안사항(사건별·영속)
let gisInterviewNotesByCase = {};  // 3단계 공통 착안사항(사건별·영속)
let gisEvidenceSelectedId = null;
let gisInterviewSelectedId = null;
let gisEvidenceClosed = {};        // itemId → 접힘(기본 펼침)
let gisInterviewClosed = {};

function gisBaseStateIcon(state){
  return state === "running" ? "⏳" : state === "done" ? "✅" : state === "error" ? "⚠️" : "";
}

function gisPaintBaseRunStatus(){
  document.querySelectorAll("[data-gis-base-state]").forEach(el => {
    el.textContent = gisBaseStateIcon(gisBaseRunStatus[el.dataset.gisBaseState]);
  });
}

function gisPaintBaseSelection(){
  document.querySelectorAll("[data-gis-base-result]").forEach(li =>
    li.classList.toggle("active", li.dataset.gisBaseResult === gisSelectedBase));
}

/* ── 증거 수집(2단계)·접견/신문(3단계) — 항목 등록/요청/결과 등록 ── */
function gisEvidenceItems(aCase){
  if(!aCase) return [];
  if(!Array.isArray(gisEvidenceByCase[aCase.caseId])){
    gisEvidenceByCase[aCase.caseId] = GIS_EVIDENCE_CATALOG.slice(0, 2).map(cat => ({
      id: `gse_${uid()}`, key: cat.key, label: cat.label, desc: cat.desc,
      note: "", status: "", result: "",
    }));
  }
  return gisEvidenceByCase[aCase.caseId];
}

function gisInterviewItems(aCase){
  if(!aCase) return [];
  if(!Array.isArray(gisInterviewByCase[aCase.caseId])){
    gisInterviewByCase[aCase.caseId] = GIS_INTERVIEW_CATALOG.map(cat => ({
      id: `gsi_${uid()}`, key: cat.key, label: cat.label,
      content: cat.template, status: "", result: "",
    }));
  }
  return gisInterviewByCase[aCase.caseId];
}

function gisEvidenceListHtml(aCase){
  const items = gisEvidenceItems(aCase);
  if(!items.length) return `<div class="empty-state">위에서 증거 항목을 선택해 등록하세요.</div>`;
  return items.map(item => {
    const closed = !!gisEvidenceClosed[item.id];
    return `
    <div class="gis-ev-item${item.id === gisEvidenceSelectedId ? " active" : ""}" data-gis-ev-item="${escapeHtml(item.id)}">
      <div class="gis-ev-head" data-gis-ev-select="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="gis-ev-head-side">
          ${item.status ? `<em class="gis-ev-status">${escapeHtml(item.status)}</em>` : ""}
          <i>${closed ? "▸" : "▾"}</i>
        </span>
      </div>
      ${closed ? "" : `
      <div class="gis-ev-body">
        <p class="gis-ev-desc">${escapeHtml(item.desc || "")}</p>
        <textarea class="ci-stage-notes" data-gis-ev-note="${escapeHtml(item.id)}" rows="2"
          placeholder="수사 착안사항 및 확인사항">${escapeHtml(item.note || "")}</textarea>
        <div class="gis-ev-actions">
          <button type="button" class="gis-ev-btn" data-gis-ev-request="${escapeHtml(item.id)}">요청</button>
          <button type="button" class="gis-ev-btn" data-gis-ev-result="${escapeHtml(item.id)}">결과 등록</button>
        </div>
      </div>`}
    </div>`;
  }).join("");
}

function gisInterviewListHtml(aCase){
  const items = gisInterviewItems(aCase);
  if(!items.length) return `<div class="empty-state">위에서 접견/신문 항목을 선택해 등록하세요.</div>`;
  return items.map(item => {
    const closed = !!gisInterviewClosed[item.id];
    return `
    <div class="gis-ev-item${item.id === gisInterviewSelectedId ? " active" : ""}" data-gis-iv-item="${escapeHtml(item.id)}">
      <div class="gis-ev-head" data-gis-iv-select="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="gis-ev-head-side">
          ${item.status ? `<em class="gis-ev-status">${escapeHtml(item.status)}</em>` : ""}
          <i>${closed ? "▸" : "▾"}</i>
        </span>
      </div>
      ${closed ? "" : `
      <div class="gis-ev-body">
        <textarea class="ci-stage-notes gis-iv-content" data-gis-iv-content="${escapeHtml(item.id)}" rows="5"
          placeholder="접견/신문 내용을 기록하세요">${escapeHtml(item.content || "")}</textarea>
        <div class="gis-ev-actions">
          <button type="button" class="gis-ev-btn" data-gis-iv-request="${escapeHtml(item.id)}">요청</button>
          <button type="button" class="gis-ev-btn" data-gis-iv-result="${escapeHtml(item.id)}">결과 등록</button>
        </div>
      </div>`}
    </div>`;
  }).join("");
}

function gisRenderEvidenceList(){
  const box = document.getElementById("gisEvidenceList");
  const aCase = activeGenInvCase();
  if(box && aCase) box.innerHTML = gisEvidenceListHtml(aCase);
}

function gisRenderInterviewList(){
  const box = document.getElementById("gisInterviewList");
  const aCase = activeGenInvCase();
  if(box && aCase) box.innerHTML = gisInterviewListHtml(aCase);
}

/* ── 요청서 자동 생성·승인 발송 / 결과 등록 AI 분석·요약 ─────────────── */
let gisSelectedEvItem = null;   // 선택된 증거/접견 항목 — '선택된 서비스 분석결과'에 개별 결과 표시 {kind, id}

/* 항목 유형 → 요청서 수신 기관(표준 형식) */
const GIS_EV_REQUEST_DEST = {
  fin:      "금융감독원 · 해당 금융기관",
  tel:      "과학기술정보통신부 · 통신사업자",
  coop:     "관세청 국제협력총괄과(해외 세관당국)",
  books:    "피조사 업체(장부·계약·회계자료 제출요구)",
  inspect:  "세관 감정관실",
  agency:   "관계 행정기관",
  seizure:  "관할 검찰청(압수수색영장 신청)",
  forensic: "관세청 디지털포렌식센터",
};

function gisFindStageItem(kind, id){
  const aCase = activeGenInvCase();
  if(!aCase) return null;
  return (kind === "ev" ? gisEvidenceItems(aCase) : gisInterviewItems(aCase))
    .find(entry => entry.id === id) || null;
}

/* 표준 형식 요청서 자동 생성 — 승인 후 유관기관 발송으로 등록 */
function gisBuildRequestDoc(kind, item){
  const aCase = activeGenInvCase() || {};
  const today = new Date().toLocaleDateString("ko-KR");
  const crime = crimeSummary(aCase.crimes) || "확인 중";
  if(kind === "iv"){
    const target = item.key === "suspect" ? "피의자" : "참고인";
    return `[출석요청서 — 표준 형식]

문서번호: KCS-수사-${aCase.caseId || "-"}-${String(Date.now()).slice(-4)}
수신: ${target} (${aCase.targetName || "-"} 관련)
발신: 관세청 조사국 (수사관: ${currentUser().name})
시행일: ${today}
제목: ${item.label} 출석 요청

1. 사건: ${aCase.caseId || "-"} · 대상 ${aCase.targetName || "-"} (혐의: ${crime})
2. 요청 내용: ${item.label} 진행을 위한 출석 요청
3. 일시·장소: 접수 후 개별 협의 (관할 세관 조사실)
4. 지참물: 신분증, 관련 자료 일체
5. 비고: 정당한 사유 없이 불응 시 관세법령에 따른 조치가 있을 수 있음`;
  }
  return `[자료요청서 — 표준 형식]

문서번호: KCS-수사-${aCase.caseId || "-"}-${String(Date.now()).slice(-4)}
수신: ${GIS_EV_REQUEST_DEST[item.key] || "유관기관"}
발신: 관세청 조사국 (수사관: ${currentUser().name})
시행일: ${today}
제목: ${item.label} 자료 요청 (${aCase.targetName || "-"} 관련)

1. 사건: ${aCase.caseId || "-"} · 대상 ${aCase.targetName || "-"} (혐의: ${crime})
2. 요청 자료: ${item.label}${item.desc ? ` — ${item.desc}` : ""}
3. 요청 사유: 관세범죄 수사를 위한 증거자료 확보
4. 수사 착안사항: ${item.note || "-"}
5. 협조 기한: 접수일로부터 14일 이내
6. 근거: 관세법 제266조(자료 제출 요구) 등`;
}

function gisCloseDocOverlay(){
  document.getElementById("gisDocOverlay")?.remove();
}

function gisOpenDocOverlay(title, innerHtml){
  gisCloseDocOverlay();
  const overlay = document.createElement("div");
  overlay.id = "gisDocOverlay";
  overlay.className = "gis-doc-overlay";
  overlay.innerHTML = `
    <div class="gis-doc-card">
      <div class="gis-doc-head"><strong>${escapeHtml(title)}</strong>
        <button type="button" class="gis-doc-x" data-gis-doc-cancel title="닫기">✕</button></div>
      ${innerHtml}
    </div>`;
  document.body.appendChild(overlay);
}

function gisOpenRequestPopup(kind, item){
  gisOpenDocOverlay(`요청서 승인 — ${item.label}`, `
    <p class="gis-doc-note">표준 형식 요청서가 자동 생성되었습니다. 검토·수정 후 승인하면 유관기관 발송으로 등록됩니다.</p>
    <textarea id="gisDocText" class="gis-doc-text" rows="15">${escapeHtml(gisBuildRequestDoc(kind, item))}</textarea>
    <div class="gis-doc-actions">
      <button type="button" class="btn secondary" data-gis-doc-cancel>취소</button>
      <button type="button" class="btn primary" data-gis-doc-approve data-kind="${kind}" data-id="${escapeHtml(item.id)}">승인 및 발송</button>
    </div>`);
}

function gisOpenResultPopup(kind, item){
  const prefill = item.raw || (kind === "iv" ? item.content || "" : "");
  gisOpenDocOverlay(`결과 등록 — ${item.label}`, `
    <p class="gis-doc-note">입수한 결과 원문을 등록하세요. 등록 시 AI가 내용을 분석/요약하여 결과로 제공합니다.</p>
    <textarea id="gisResText" class="gis-doc-text" rows="13"
      placeholder="입수 자료·녹취록 등 결과 원문을 입력하세요">${escapeHtml(prefill)}</textarea>
    <div class="gis-doc-actions">
      <button type="button" class="btn secondary" data-gis-doc-cancel>취소</button>
      <button type="button" class="btn primary" data-gis-res-submit data-kind="${kind}" data-id="${escapeHtml(item.id)}">등록 및 AI 분석</button>
    </div>`);
}

/* 결과 원문 → AI 분석/요약(스트리밍) — '선택된 서비스 분석결과'에 실시간 표시 */
async function gisSummarizeItem(kind, id){
  const aCase = activeGenInvCase();
  const item = gisFindStageItem(kind, id);
  if(!aCase || !item) return;
  const raw = String(item.raw || "").slice(0, 6000);
  const prompt = kind === "ev"
    ? `당신은 관세청 수사 지원 AI입니다. 사건 ${aCase.caseId}(대상 ${aCase.targetName})의 증거자료 "${item.label}" 원문을 분석하십시오.
개조식으로: ① 핵심 내용 요약 ② 혐의 입증 관점 시사점 ③ 추가 확인 필요사항.
${item.note ? `[수사 착안사항]\n${item.note}\n` : ""}
[증거 원문]
${raw}`
    : `당신은 관세청 수사 지원 AI입니다. 사건 ${aCase.caseId}(대상 ${aCase.targetName})의 ${item.label} 기록(녹취/면담)을 요약하십시오.
개조식으로: ① 진술 요지 ② 혐의 관련 핵심 진술 ③ 모순점·추가 확인 필요사항.
[기록 원문]
${raw}`;
  item.status = "분석 중";
  item.result = "";
  gisSelectedEvItem = { kind, id };
  gisSelectedBase = null;
  gisResultTab = "selected";
  (kind === "ev" ? gisRenderEvidenceList : gisRenderInterviewList)();
  gisRenderResultTab();
  const answer = await streamLlmText(prompt, {
    mode: "int",
    onToken: acc => { item.result = acc; gisRenderResultTab(); },
  });
  item.result = answer || `(AI 요약 실패 — 원문 등록)\n\n${raw}`;
  item.status = "결과 등록됨";
  item.resultAt = Date.now();   // 수사보고(결과 보고서) 작성일
  saveCanvasState();
  (kind === "ev" ? gisRenderEvidenceList : gisRenderInterviewList)();
  gisRenderResultTab();
}

/* 수사보고서 관리 연동 — 증거요청/결과에서 자동 생성되는 수사보고 목록과 수정 저장 */
function gisStageDocsForCase(caseId){
  const docs = [];
  const push = (kind, item) => {
    if(item.request) docs.push({
      id: `gis:${kind}:${item.id}:req`, icon: "📮",
      title: `수사보고 – 증거요청 (${item.label})`, docLabel: "증거요청 보고서",
      status: item.result ? "요청·회신 완료" : "발송됨",
      date: item.requestedAt || "", text: item.request,
    });
    if(item.result) docs.push({
      id: `gis:${kind}:${item.id}:res`, icon: "🧾",
      title: `수사보고 – 결과 (${item.label})`, docLabel: "결과 보고서",
      status: "등록됨", date: item.resultAt || "", text: item.result,
    });
  };
  (gisEvidenceByCase[caseId] || []).forEach(item => push("ev", item));
  (gisInterviewByCase[caseId] || []).forEach(item => push("iv", item));
  return docs;
}

function updateGiStageDoc(caseId, docId, text){
  const m = String(docId).match(/^gis:(ev|iv):(.+):(req|res)$/);
  if(!m) return false;
  const list = m[1] === "ev" ? gisEvidenceByCase[caseId] : gisInterviewByCase[caseId];
  const item = (list || []).find(entry => entry.id === m[2]);
  if(!item) return false;
  if(m[3] === "req") item.request = text;
  else item.result = text;
  saveCanvasState();
  return true;
}

/* 증거내 검색 컨텍스트 — 등록된 증거·접견 기록·기초데이터 분석 결과를 모아 전달 */
function gisEvidenceSearchContext(){
  const aCase = activeGenInvCase();
  if(!aCase) return "";
  const cut = (text, n = 600) => String(text || "").slice(0, n);
  const parts = [`[사건] ${aCase.caseId} · 대상 ${aCase.targetName} · 혐의 ${crimeSummary(aCase.crimes) || "미지정"}`];
  gisEvidenceItems(aCase).forEach(item => {
    parts.push(`[증거: ${item.label}] 상태 ${item.status || "등록"}${item.note ? ` · 착안 ${cut(item.note, 150)}` : ""}\n${cut(item.result || item.raw || item.desc)}`);
  });
  gisInterviewItems(aCase).forEach(item => {
    parts.push(`[접견/신문: ${item.label}] 상태 ${item.status || "등록"}\n${cut(item.result || item.content)}`);
  });
  gisBaseRunResults.forEach(entry => {
    if(entry.output) parts.push(`[기초데이터 분석: ${entry.label}]\n${cut(entry.output)}`);
  });
  scenarioItems.forEach(item => {
    if(gisStageItemStage(item) === "base" && stepOutputs[item.id])
      parts.push(`[기초데이터 분석: ${normalizeReportValidationLabel(item.label)}]\n${cut(stepOutputs[item.id])}`);
  });
  return parts.join("\n\n").slice(0, 9000);
}
setEvidenceContextProvider(gisEvidenceSearchContext);

function gisIsReportStageItem(item){
  return ["report", "validation", "approve"].includes(item.type)
    || ["report_generate", "report_validate"].includes(item.key);
}

function gisStageItemStage(item){
  if(gisIsReportStageItem(item)) return "report";
  if(["web_search", "external_agency"].includes(item.key)) return "ext";
  if(GIS_STAGE_BASE_KEYS.includes(item.key)) return "base";
  return "deep";
}

/* 저장하지 않는 일회성 실행 단계 — 기초·외부 배치 수행용(사건 상태 미기록) */
function gisTransientStep(key, label, instruction){
  const source = scenarioSourceByKey(key) || {};
  return {
    id: `gisbase_${uid()}`, key, sourceKey: key, type: source.type || "agent", label,
    behaviors: sourceDefaultBehaviors(key),
    note: instruction, instruction,
  };
}

/* 관세수사 스테이지 전용 SSE 러너 — giStreamSteps의 복사본(독립 변경용).
   기본은 사건 상태(stepStates/stepResults)에 기록하고, transient 모드에서는
   사건 상태를 건드리지 않고 opts.onStep 콜백으로만 전달한다. 종료 시 resolve. */
function gisStreamSteps(aCase, stepsToRun, opts = {}){
  return new Promise(resolve => {
    if(!aCase || !stepsToRun.length){ resolve(); return; }
    if(gisStageEventSource){ try{ gisStageEventSource.close(); }catch(e){} gisStageEventSource = null; }
    const transient = !!opts.transient;
    if(!transient){
      if(!aCase.stepStates)  aCase.stepStates  = {};
      if(!aCase.stepResults) aCase.stepResults = {};
      stepsToRun.forEach(s => { if(aCase.stepStates[s.id] === "run") delete aCase.stepStates[s.id]; });
      saveCanvasState();
      refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
    }
    const targetType = aCase.targetType || "company";
    const stepsPayload = stepsToRun.map(s => ({
      id: s.id, key: s.key, label: s.label, type: s.type,
      sourceKey: s.sourceKey || giCommonSourceKey(s.key),
      target_type: targetType, targetType,
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
      case_id:     aCase.caseId,
      target_name: aCase.targetName,
      target_type: targetType,
      targetType,
      target_id:   targetType === "person" ? (aCase.personId || "") : (aCase.companyId || generalInvCompanyId(aCase) || ""),
      steps:       JSON.stringify(stepsPayload),
      share_recipients: JSON.stringify(shareRecipients),
      web_targets: JSON.stringify(normalizeWebTargets(stepsPayload.flatMap(step => step.web_targets || []))),
    });
    const finish = () => { gisStageEventSource = null; resolve(); };
    gisStageEventSource = openRunEventStream(`/api/gi_run?${params.toString()}`, {
      onStep(data){
        const step = stepsToRun.find(s => s.id === data.gi_step_id);
        if(!step) return;
        if(transient){
          const output = data.status === "done" ? (data.output || "")
            : data.status === "error"
              ? `❗ 실행 오류 — ${step.label || step.id}\n\n${data.error || "실행 중 오류가 발생했습니다.(서버가 상세 사유를 반환하지 않음)"}`
              : "";
          opts.onStep?.(step, data.status, output);
          return;
        }
        if(data.status === "running"){
          aCase.stepStates[step.id] = "run";
        } else if(data.status === "done"){
          aCase.stepStates[step.id]  = "done";
          aCase.stepResults[step.id] = data.output || "";
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
          console.error(`[수사 스테이지 실행] 단계 오류 — ${step.label || step.id}\n${data.error || "(상세 없음)"}`);
          aCase.stepStates[step.id]  = "error";
          aCase.stepResults[step.id] = `❗ 실행 오류 — ${step.label || step.id}\n\n${data.error || "실행 중 오류가 발생했습니다.(서버가 상세 사유를 반환하지 않음)"}`;
        }
        saveCanvasState();
        refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
      },
      onWorkflow(data, terminal){
        if(data.status === "failed") console.error("[수사 스테이지 실행] 워크플로 실패" + (data.error ? `\n${data.error}` : " (직전 단계 오류 참조)"));
        if(terminal){
          if(!transient){
            saveCanvasState();
            refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
          }
          finish();
        }
      },
      onDisconnect(info, ev){
        if(transient){
          stepsToRun.forEach(s => opts.onStep?.(s, "disconnect",
            `❗ ${info.reason}\n\n엔드포인트: /api/gi_run\n서버 상태(실행 여부·콘솔 로그)를 확인한 뒤 다시 실행하세요.`));
        } else {
          const running = stepsToRun.some(s => aCase.stepStates[s.id] === "run");
          if(running){
            console.error(`[수사 스테이지 실행] 서버 연결 오류 — ${info.reason} · 엔드포인트 /api/gi_run · 연결상태 ${info.readyState}`, ev);
            stepsToRun.forEach(s => {
              if(aCase.stepStates[s.id] === "run"){
                aCase.stepStates[s.id] = "error";
                aCase.stepResults[s.id] = `❗ ${info.reason}\n\n엔드포인트: /api/gi_run\n서버 상태(실행 여부·콘솔 로그)를 확인한 뒤 다시 실행하세요.`;
              }
            });
          }
          saveCanvasState();
          refreshScenarioWorkbenchFromCase(aCase, () => render("generalinv"));
        }
        finish();
      },
    });
  });
}

/* 기초 조사 분석 실행 — 고정 배치 5종 + 등록된 AI 분석서비스 + 법령검토를 순차 수행 */
async function gisRunBaseBatch(){
  const aCase = activeGenInvCase();
  if(!aCase){ alert("수사 대상을 먼저 선택하세요."); return; }
  const specs = [
    ...GIS_BASE_FIXED_RUNS.map(fixed => ({ ...fixed })),
    ...gisBaseAiServices.map(svc => ({
      label: svc.label,
      key: GIS_BASE_AI_RUN_KEYS[svc.key]
        || (svc.key.startsWith("svc_") ? svc.key.slice(4) : "declaration_verify"),
      instruction: `${svc.desc || `${svc.label}을(를) 수행하십시오.`}` +
        (svc.note ? `\n[수사 착안사항·확인사항]\n${svc.note}` : ""),
    })),
    { label: "법령검토(통관적정성)", key: "law",
      instruction: "통관적정성 관점에서 관련 법령을 검토하십시오." },
  ];
  gisBaseRunStatus = {};
  gisBaseRunResults = [];
  const runnable = [];
  specs.forEach(spec => {
    const step = gisTransientStep(spec.key, spec.label, spec.instruction);
    if(!scenarioItemHasPermission(step)){
      gisBaseRunStatus[spec.label] = "error";
      gisBaseRunResults.push({ label: spec.label, status: "error", output: "권한이 없어 건너뛰었습니다." });
      return;
    }
    const entry = { label: spec.label, status: "wait", output: "" };
    gisBaseRunResults.push(entry);
    runnable.push({ step, entry });
  });
  gisPaintBaseRunStatus();
  gisRenderResultTab();
  if(!runnable.length) return;
  const byId = new Map(runnable.map(r => [r.step.id, r.entry]));
  await gisStreamSteps(aCase, runnable.map(r => r.step), {
    transient: true,
    onStep(step, status, output){
      const entry = byId.get(step.id);
      if(!entry) return;
      if(status === "running") entry.status = "running";
      else if(status === "done"){ entry.status = "done"; entry.output = output; }
      else if(status === "error"){ entry.status = "error"; entry.output = output; }
      else if(status === "disconnect" && entry.status !== "done" && entry.status !== "error"){
        entry.status = "error"; entry.output = entry.output || output;
      }
      gisBaseRunStatus[entry.label] = entry.status === "wait" ? "" : entry.status;
      gisPaintBaseRunStatus();
      gisRenderResultTab();
    },
  });
}

function gisBaseAiListHtml(){
  return gisBaseAiServices.map(svc => `
    <div class="ci-base-chip${svc.key === gisBaseSelectedKey ? " active" : ""}" data-gis-base-chip="${escapeHtml(svc.key)}">
      <strong>${escapeHtml(svc.label)}</strong>
      <span class="ci-base-chip-side">
        <i class="ci-base-state" data-gis-base-state="${escapeHtml(svc.label)}">${gisBaseStateIcon(gisBaseRunStatus[svc.label])}</i>
        <i>${gisBaseDetailOpenKey === svc.key ? "▴" : "▾"}</i>
      </span>
    </div>
    ${gisBaseDetailOpenKey === svc.key ? `
    <div class="ci-base-chip-detail">
      <p>${escapeHtml(svc.desc || "기초조사 배치 수행에 포함됩니다.")}</p>
      <textarea class="ci-stage-notes ci-base-svc-notes" data-gis-base-note="${escapeHtml(svc.key)}" rows="2"
        placeholder="수사 착안사항 및 확인사항">${escapeHtml(svc.note || "")}</textarea>
    </div>` : ""}
  `).join("");
}

function gisRenderBaseAiList(){
  const box = document.getElementById("gisBaseAiList");
  if(box) box.innerHTML = gisBaseAiListHtml()
    || `<div class="empty-state">등록된 AI 분석서비스가 없습니다.</div>`;
}

/* 외부데이터 수집 실행 — 외부기관정보수집 → 웹 정보수집 요청을 순차 수행 */
async function gisRunExtBatch(){
  const aCase = activeGenInvCase();
  if(!aCase){ alert("수사 대상을 먼저 선택하세요."); return; }
  gisExtRunResults = [];
  const agencyBehaviors = [...gisExtAgencyChecked].map(key => GIS_AGENCY_BEHAVIOR[key]).filter(Boolean);
  const agencyItem = scenarioItems.find(item => item.key === "external_agency");
  const webItem = scenarioItems.find(item => item.key === "web_search");
  const specs = [
    {
      label: "외부기관정보수집 AI 서비스",
      transient: !agencyItem,
      item: agencyItem
        ? { ...agencyItem, sourceKey: "external_agency", behaviors: agencyBehaviors.length ? agencyBehaviors : agencyItem.behaviors }
        : (() => {
            const step = gisTransientStep("external_agency", "외부기관정보수집 AI 서비스",
              "선택한 외부기관 사이트의 공시·신용·시세·특허 정보를 수집하십시오.");
            if(agencyBehaviors.length) step.behaviors = agencyBehaviors;
            return step;
          })(),
    },
    {
      label: "웹 정보수집 요청 AI 서비스",
      transient: !webItem,
      item: webItem
        ? { ...webItem, sourceKey: "web_search" }
        : gisTransientStep("web_search", "웹 정보수집 요청 AI 서비스",
            "등록된 URL·검색 키워드에 대한 수집 요청을 접수하십시오."),
    },
  ];
  for(const spec of specs){
    if(!scenarioItemHasPermission(spec.item)){
      gisExtRunResults.push({ label: spec.label, status: "error", output: "권한이 없어 건너뛰었습니다." });
      gisRenderResultTab();
      continue;
    }
    if(spec.transient){
      const entry = { label: spec.label, status: "running", output: "" };
      gisExtRunResults.push(entry);
      gisRenderResultTab();
      await gisStreamSteps(aCase, [spec.item], {
        transient: true,
        onStep(step, status, output){
          if(status === "done"){ entry.status = "done"; entry.output = output; }
          else if(status === "error"){ entry.status = "error"; entry.output = output; }
          else if(status === "disconnect" && entry.status === "running"){ entry.status = "error"; entry.output = entry.output || output; }
          gisRenderResultTab();
        },
      });
    }else{
      // 시나리오 항목 실행 — 선택을 따라가 진행 상태가 3단계 목록·결과 탭에 반영된다
      selectedScenarioId = spec.item.id;
      renderScenarioList();
      syncScenarioEditor();
      if(scenarioReviewMode) renderScenarioSteps();
      await gisStreamSteps(aCase, [spec.item]);
    }
  }
}

function gisStageRunItems(stageKey){
  if(stageKey === "report") return scenarioItems.filter(gisIsReportStageItem);
  if(stageKey === "deep")   return scenarioItems.filter(item => !gisIsReportStageItem(item));
  const keys = GIS_STAGE_RUN_KEYS[stageKey] || [];
  return scenarioItems.filter(item => keys.includes(item.key));
}

async function gisRunStage(stageKey, btn){
  const aCase = activeGenInvCase();
  if(!aCase){ alert("수사 대상을 먼저 선택하세요."); return; }
  if(stageKey === "base"){
    if(btn){ btn.disabled = true; btn.textContent = "실행 중…"; }
    try{ await gisRunBaseBatch(); }
    finally{ if(btn){ btn.disabled = false; btn.textContent = "▶ 실행"; } }
    return;
  }
  // 증거 수집·접견/신문은 개별 등록 방식 — 단계 실행 없음(실행 버튼 미노출)
  if(stageKey === "ext" || stageKey === "deep") return;
  const items = gisStageRunItems(stageKey).filter(scenarioItemHasPermission);
  if(!items.length){ alert("이 단계에서 실행할 수 있는 서비스가 시나리오에 없습니다."); return; }
  if(!ensureMailShareRecipients(items)) return;
  if(!ensureDirectUrlTargets(items)) return;
  saveWorkbenchToCaseSteps(aCase);
  const steps = (aCase.giSteps || []).filter(s => items.some(i => i.id === s.id));
  if(btn){ btn.disabled = true; btn.textContent = "실행 중…"; }
  try{
    await gisStreamSteps(aCase, steps);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = "▶ 실행"; }
  }
}

function gisResultBlockHtml(label, status, output){
  const statusLabel = status === "running" ? "실행 중" : status === "error" ? "오류" : status === "done" ? "완료" : "대기";
  return `
    <section class="ci-result-block">
      <div class="ci-result-block-head"><span>${escapeHtml(label)}</span><em>${statusLabel}</em></div>
      <div class="ci-result-block-body">
        ${output ? `<div class="markdown-output">${markdownToHtml(output)}</div>`
          : `<div class="muted" style="font-size:12px">${status === "running" ? "실행 중…" : "결과가 아직 없습니다."}</div>`}
      </div>
    </section>
  `;
}

function gisStageResultsHtml(stageKey){
  const blocks = [];
  const aCase = activeGenInvCase();
  if(stageKey === "base"){
    gisBaseRunResults.forEach(entry => blocks.push(gisResultBlockHtml(entry.label, entry.status, entry.output)));
  }
  // 증거 수집·접견/신문 — 등록 항목의 요청/결과 기록 표시
  if(stageKey === "ext" || stageKey === "deep"){
    const items = stageKey === "ext" ? gisEvidenceItems(aCase) : gisInterviewItems(aCase);
    items.forEach(item => {
      if(item.result) blocks.push(gisResultBlockHtml(item.label, "done", item.result));
      else if(item.status === "요청됨")
        blocks.push(gisResultBlockHtml(item.label, "wait", "요청 접수됨 — 결과 등록 대기"));
    });
  }
  // AI 서비스 단계 결과(자동 구성 단계 등) — 기초·범죄일람표 단계에 귀속
  if(stageKey === "base" || stageKey === "report"){
    scenarioItems
      .filter(item => gisStageItemStage(item) === stageKey)
      .forEach(item => {
        const status = { "실행 중": "running", "실행중": "running", "완료": "done", "오류": "error" }[stepStatuses[item.id]] || "wait";
        if(stepOutputs[item.id] || status !== "wait"){
          blocks.push(gisResultBlockHtml(normalizeReportValidationLabel(item.label), status, stepOutputs[item.id] || ""));
        }
      });
  }
  if(!blocks.length){
    const stageLabel = GIS_RESULT_TABS.find(t => t.key === stageKey)?.label || "";
    return `<div class="empty-state">${escapeHtml(stageLabel.replace(/ 결과$/, ""))}을(를) 실행하면 결과가 여기에 표시됩니다.</div>`;
  }
  return blocks.join("");
}

function gisRenderResultTab(){
  const body = document.getElementById("gisResultBody");
  const accordion = document.getElementById("scenarioStepAccordion");
  if(!body || !accordion) return;
  document.querySelectorAll("[data-gis-result-tab]").forEach(tab =>
    tab.classList.toggle("active", tab.dataset.gisResultTab === gisResultTab));
  const selectedMode = gisResultTab === "selected";
  const evSelected = selectedMode && !!gisSelectedEvItem;
  const baseSelected = selectedMode && !evSelected && !!gisSelectedBase;
  accordion.style.display = selectedMode && !baseSelected && !evSelected ? "" : "none";
  body.style.display = selectedMode && !baseSelected && !evSelected ? "none" : "";
  // 개별 증거 분석·녹취 요약 — 선택된 증거/접견 항목의 결과 표시
  if(evSelected){
    const item = gisFindStageItem(gisSelectedEvItem.kind, gisSelectedEvItem.id);
    if(!item){ gisSelectedEvItem = null; body.innerHTML = ""; return; }
    if(item.result || item.status === "분석 중"){
      body.innerHTML = gisResultBlockHtml(item.label, item.status === "분석 중" ? "running" : "done", item.result || "");
    }else if(item.request){
      body.innerHTML = gisResultBlockHtml(item.label, "wait", `**요청서 발송됨(승인 완료)** — 결과 등록 대기\n\n\`\`\`\n${item.request}\n\`\`\``);
    }else{
      body.innerHTML = `
        <section class="ci-result-block">
          <div class="ci-result-block-head"><span>${escapeHtml(item.label)}</span><em>대기</em></div>
          <div class="ci-result-block-body">
            <div class="muted" style="font-size:12px">[요청]으로 표준 요청서를 발송하거나, [결과 등록]으로 원문을 등록하면 AI 분석/요약 결과가 표시됩니다.</div>
          </div>
        </section>`;
    }
    return;
  }
  if(baseSelected){
    const entry = gisBaseRunResults.find(e => e.label === gisSelectedBase);
    body.innerHTML = entry
      ? gisResultBlockHtml(entry.label, entry.status, entry.output)
      : `<section class="ci-result-block">
           <div class="ci-result-block-head"><span>${escapeHtml(gisSelectedBase)}</span><em>대기</em></div>
           <div class="ci-result-block-body">
             <div class="muted" style="font-size:12px">1. 기초데이터 분석을 실행하면 이 서비스의 결과가 표시됩니다.</div>
           </div>
         </section>`;
    return;
  }
  if(!selectedMode) body.innerHTML = gisStageResultsHtml(gisResultTab);
}

/* 선택 칩 아래 상세 설정 아코디언 배치(관세수사 스테이지) — DOM 노드 이동으로 바인딩 보존 */
function gisPlaceScenarioDetail(){
  const config = document.querySelector(".gis-stage-config");
  const dock = document.getElementById("gisStageConfigDock");
  if(!config || !dock) return;
  const active = document.querySelector("#scenarioList .scenario-chip.active, #gisStage4List .scenario-chip.active");
  if(!active || gisDetailCollapsed){
    dock.appendChild(config);
    config.style.display = "none";
    return;
  }
  config.style.display = "";
  const holder = document.createElement("li");
  holder.className = "ci-chip-detail";
  active.after(holder);
  holder.appendChild(config);
}

/* 관세수사 스테이지 UI: 웹 정보수집 항목 — 없으면 등록 시점에 자동 추가 */
function gisStageWebItem(createIfMissing = false){
  if(!document.getElementById("gisExtWebPanel")) return null;   // 관세수사 스테이지 UI가 아니면 미개입
  let item = scenarioItems.find(entry => entry.key === "web_search");
  if(!item && createIfMissing){
    const source = scenarioSourceByKey("web_search");
    if(!source) return null;
    const aCase = activeGenInvCase();
    const targetType = aCase?.targetType || "company";
    const behaviors = [...new Set([...(sourceDefaultBehaviors("web_search") || []), "direct_url"])];
    item = {
      id: uid(), key: "web_search", type: source.type, label: source.label,
      behaviors, order: scenarioItems.length + 1,
      targetType, target_type: targetType,
      instruction: scenarioSuggestedInstruction("web_search", targetType, behaviors),
      shareRecipients: [], webTargets: [],
    };
    scenarioItems.push(item);
    normalizeScenarioOrder();
    if(aCase){ saveWorkbenchToCaseSteps(aCase); saveCanvasState(); }
    renderScenarioList();
    setScenarioStatus("웹 정보수집 요청 AI 서비스가 시나리오에 추가되었습니다");
    item = scenarioItems.find(entry => entry.key === "web_search");
  }
  return item;
}

/* 관세수사 — AI서비스 분석 작업 (4단계 스테이지 레이아웃) */
function giStageWorkbenchHtml(){
  const aCase = activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  scenarioReviewMode = true;      // renderScenarioSteps/syncScenarioEditor 리뷰 모드 분기
  scenarioResultViewTab = "result";
  const states = aCase.stepStates || {};
  const doneCount = Object.values(states).filter(s => s === "done").length;
  const doneNote = doneCount
    ? `<span class="muted" style="font-size:12px">AI 분석 수행 결과 · 완료 ${doneCount}단계</span>`
    : `<span class="muted" style="font-size:12px">수행된 분석 결과가 없습니다</span>`;

  const baseServiceList = services => `
    <ul class="ci-base-list">
      ${services.map(service => `
        <li class="ci-base-selectable" data-gis-base-result="${escapeHtml(service.label)}" title="클릭하면 이 서비스의 결과를 표시합니다">${escapeHtml(service.label)}
          <i class="ci-base-state" data-gis-base-state="${escapeHtml(service.label)}">${gisBaseStateIcon(gisBaseRunStatus[service.label])}</i>
          ${service.items.length
            ? `<ul>${service.items.map(entry => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`
            : ""}</li>
      `).join("")}
    </ul>
  `;
  const stage1 = `
    <p class="ci-stage-note">다음 서비스를 배치(Batch)로 항시 수행합니다(default) — 로그 수준의 초안 보고서를 생성합니다.</p>
    ${baseServiceList(GIS_BASE_BATCH_SERVICES)}
    <div class="ci-base-ai">
      <strong class="ci-base-ai-title">AI 분석서비스</strong>
      <div class="ci-stage-tools">
        <select id="gisBaseServiceSelect" class="scenario-template-select"></select>
        <button type="button" class="btn scenario-template-apply-btn" data-gis-base-add>서비스 추가</button>
        <button type="button" class="btn secondary scenario-template-apply-btn" data-gis-base-delete>선택 삭제</button>
      </div>
      <textarea id="gisBaseNotes" class="ci-stage-notes" rows="2"
        placeholder="수사 착안사항 및 확인사항">${escapeHtml(gisBaseNotesByCase[aCase.caseId] || "")}</textarea>
      <div class="ci-base-ai-list" id="gisBaseAiList">${gisBaseAiListHtml()}</div>
    </div>
    ${baseServiceList(GIS_BASE_TAIL_SERVICES)}
  `;

  const stage2 = `
    <div class="ci-stage-tools">
      <select id="gisEvidenceSelect" class="scenario-template-select">
        ${GIS_EVIDENCE_CATALOG.map(cat => `<option value="${escapeHtml(cat.key)}">${escapeHtml(cat.label)}</option>`).join("")}
      </select>
      <button type="button" class="btn scenario-template-apply-btn" data-gis-ev-add>등록</button>
      <button type="button" class="btn secondary scenario-template-apply-btn" data-gis-ev-del>선택 삭제</button>
    </div>
    <textarea id="gisEvidenceNotes" class="ci-stage-notes" rows="2"
      placeholder="수사 착안사항 및 확인사항">${escapeHtml(gisEvidenceNotesByCase[aCase.caseId] || "")}</textarea>
    <div id="gisEvidenceList" class="gis-ev-list">${gisEvidenceListHtml(aCase)}</div>
  `;

  const stage3 = `
    <div class="ci-stage-tools">
      <select id="gisInterviewSelect" class="scenario-template-select">
        ${GIS_INTERVIEW_CATALOG.map(cat => `<option value="${escapeHtml(cat.key)}">${escapeHtml(cat.label)}</option>`).join("")}
      </select>
      <button type="button" class="btn scenario-template-apply-btn" data-gis-iv-add>등록</button>
      <button type="button" class="btn secondary scenario-template-apply-btn" data-gis-iv-del>선택 삭제</button>
    </div>
    <textarea id="gisInterviewNotes" class="ci-stage-notes" rows="2"
      placeholder="수사 착안사항 및 확인사항">${escapeHtml(gisInterviewNotesByCase[aCase.caseId] || "")}</textarea>
    <div id="gisInterviewList" class="gis-ev-list">${gisInterviewListHtml(aCase)}</div>
  `;

  const stage4 = `
    <p class="ci-stage-note">범죄일람표(보고서) 생성과 검증 서비스를 통합 실행하여 결과를 생성합니다.</p>
    <ol id="gisStage4List" class="scenario-list ci-stage-list"></ol>
    <div class="gis-engine-dock" style="display:none">
      <select id="scenarioQuickSourceSelect"></select>
      <ol id="scenarioList"></ol>
    </div>
  `;

  // 실행 버튼은 기초데이터 분석·범죄일람표 작성에만 노출 — 증거 수집·접견/신문은 개별 등록 방식
  const gisStageSection = (key, title, isDefault, bodyHtml, withRun = true) => `
    <section class="ci-stage${gisStageOpen[key] ? " open" : ""}" data-gis-stage="${key}">
      <div class="ci-stage-head" data-gis-stage-toggle="${key}" role="button" tabindex="0">
        <span>${title}${isDefault ? ` <em>(default)</em>` : ""}</span>
        ${withRun ? `
        <span class="ci-stage-head-actions">
          <button type="button" class="ci-stage-run" data-gis-stage-run="${key}" title="이 단계의 서비스를 순차 실행">▶ 실행</button>
        </span>` : ""}
      </div>
      <div class="ci-stage-body">${bodyHtml}</div>
    </section>
  `;

  return `
    <section class="card scenario-workbench scenario-workbench-v2 scenario-review-mode ci-stage-workbench gis-stage-workbench">
      <div class="scenario-work-header">
        <div class="scenario-title-row">
          <div>
            <h3>분석 시나리오 확인 및 설정</h3>
            <p class="muted">기초데이터 분석 → 외부데이터 수집 → 심층 분석 시나리오 → 보고서 생성 및 검증의 4단계로 분석을 구성합니다. <em style="color:#0369a1;font-style:normal;font-weight:700">기초 분석과 보고서 생성·검증은 기본(default)으로 항시 수행됩니다.</em></p>
          </div>
        </div>
        <div class="scenario-header-actions">
          ${doneNote}
          <button id="scenarioRunAllButton" type="button" class="btn primary scenario-runall-btn"
            title="4단계 분석을 순서대로 실행합니다">▶ 전체 시나리오 수행</button>
        </div>
      </div>

      <div class="ci-stage-layout">
        <aside class="ci-stage-side">
          ${gisStageSection("base",   "1. 기초데이터 분석", true,  stage1)}
          ${gisStageSection("ext",    "2. 증거 수집", false, stage2, false)}
          ${gisStageSection("deep",   "3. 접견/신문", false, stage3, false)}
          ${gisStageSection("report", "4. 범죄일람표 작성", true, stage4)}
        </aside>

        <section class="scenario-log ci-stage-main">
          <div class="ci-result-tabs">
            ${GIS_RESULT_TABS.map(tab => `
              <button type="button" class="ci-result-tab${gisResultTab === tab.key ? " active" : ""}"
                data-gis-result-tab="${tab.key}">${escapeHtml(tab.label)}</button>
            `).join("")}
          </div>
          <div id="scenarioClarify" class="scenario-clarify-slot"></div>
          <div id="scenarioStepAccordion" class="scenario-step-accordion" ${gisResultTab === "selected" ? "" : `style="display:none"`}></div>
          <div id="gisResultBody" class="ci-result-body" ${gisResultTab === "selected" ? `style="display:none"` : ""}></div>
        </section>
      </div>
    </section>
  `;
}

/* ── 관세수사 스테이지 위임 핸들러(gis 전용 — 관세조사 ci 핸들러와 독립) ── */
document.addEventListener("click", (event) => {
  const baseChip = event.target.closest("[data-gis-base-chip]");
  if(baseChip){
    const key = baseChip.dataset.gisBaseChip;
    gisBaseDetailOpenKey = (gisBaseDetailOpenKey === key && gisBaseSelectedKey === key) ? null : key;
    gisBaseSelectedKey = key;
    gisRenderBaseAiList();
    const svc = gisBaseAiServices.find(entry => entry.key === key);
    if(svc){
      gisSelectedBase = svc.label;
      gisSelectedEvItem = null;
      gisResultTab = "selected";
      gisRenderResultTab();
      gisPaintBaseSelection();
    }
    return;
  }
  const baseFixed = event.target.closest("[data-gis-base-result]");
  if(baseFixed){
    gisSelectedBase = baseFixed.dataset.gisBaseResult;
    gisSelectedEvItem = null;
    gisResultTab = "selected";
    gisRenderResultTab();
    gisPaintBaseSelection();
    return;
  }
  if(event.target.closest("[data-gis-base-add]")){
    const select = document.getElementById("gisBaseServiceSelect");
    const key = select?.value;
    const source = key ? scenarioSourceByKey(key) : null;
    if(!source) return;
    if(gisBaseAiServices.some(svc => svc.key === `svc_${key}`)){
      alert("이미 기초조사에 추가된 서비스입니다.");
      return;
    }
    gisBaseAiServices.push({
      key: `svc_${key}`,
      label: source.label,
      desc: AI_SERVICE_REGISTRY[key]?.description || AI_SERVICE_REGISTRY[key]?.desc
        || "기초조사 배치 수행에 포함됩니다.",
    });
    gisBaseSelectedKey = `svc_${key}`;
    gisBaseDetailOpenKey = `svc_${key}`;
    gisRenderBaseAiList();
    saveCanvasState();
    return;
  }
  if(event.target.closest("[data-gis-base-delete]")){
    if(!gisBaseSelectedKey){ alert("삭제할 AI 분석서비스를 먼저 선택하세요."); return; }
    gisBaseAiServices = gisBaseAiServices.filter(svc => svc.key !== gisBaseSelectedKey);
    gisBaseSelectedKey = null;
    gisBaseDetailOpenKey = null;
    gisRenderBaseAiList();
    saveCanvasState();
    return;
  }
  const stageRun = event.target.closest("[data-gis-stage-run]");
  if(stageRun){
    gisRunStage(stageRun.dataset.gisStageRun, stageRun);
    return;
  }
  const toggle = event.target.closest("[data-gis-stage-toggle]");
  if(toggle){
    const key = toggle.dataset.gisStageToggle;
    gisStageOpen[key] = !gisStageOpen[key];
    const section = toggle.closest(".ci-stage");
    section?.classList.toggle("open", gisStageOpen[key]);
    return;
  }
  const resultTab = event.target.closest("[data-gis-result-tab]");
  if(resultTab){
    gisResultTab = resultTab.dataset.gisResultTab;
    gisRenderResultTab();
    return;
  }

  /* ── 증거 수집(ev)·접견/신문(iv) 항목 — 등록/삭제/선택·접기/요청/결과 등록 ── */
  const evConf = {
    ev: { catalog: GIS_EVIDENCE_CATALOG, items: gisEvidenceItems, render: gisRenderEvidenceList,
          selectId: "gisEvidenceSelect", closed: gisEvidenceClosed,
          getSel: () => gisEvidenceSelectedId, setSel: id => { gisEvidenceSelectedId = id; },
          listOf: aCase => gisEvidenceByCase[aCase.caseId],
          setList: (aCase, list) => { gisEvidenceByCase[aCase.caseId] = list; } },
    iv: { catalog: GIS_INTERVIEW_CATALOG, items: gisInterviewItems, render: gisRenderInterviewList,
          selectId: "gisInterviewSelect", closed: gisInterviewClosed,
          getSel: () => gisInterviewSelectedId, setSel: id => { gisInterviewSelectedId = id; },
          listOf: aCase => gisInterviewByCase[aCase.caseId],
          setList: (aCase, list) => { gisInterviewByCase[aCase.caseId] = list; } },
  };
  for(const [kind, conf] of Object.entries(evConf)){
    const attr = name => event.target.closest(`[data-gis-${kind}-${name}]`);
    const add = attr("add");
    if(add){
      const aCase = activeGenInvCase();
      if(!aCase) return;
      const key = document.getElementById(conf.selectId)?.value;
      const cat = conf.catalog.find(entry => entry.key === key);
      if(!cat) return;
      const item = kind === "ev"
        ? { id: `gse_${uid()}`, key: cat.key, label: cat.label, desc: cat.desc, note: "", status: "", result: "" }
        : { id: `gsi_${uid()}`, key: cat.key, label: cat.label, content: cat.template, status: "", result: "" };
      conf.items(aCase).push(item);
      conf.setSel(item.id);
      conf.render();
      saveCanvasState();
      return;
    }
    if(attr("del")){
      const aCase = activeGenInvCase();
      if(!aCase) return;
      const selId = conf.getSel();
      if(!selId){ alert("삭제할 항목을 먼저 선택하세요."); return; }
      conf.setList(aCase, conf.items(aCase).filter(item => item.id !== selId));
      conf.setSel(null);
      conf.render();
      saveCanvasState();
      return;
    }
    const sel = attr("select");
    if(sel){
      // 헤더 클릭 = 선택 + 상세/접기 토글, '선택된 서비스 분석결과'가 이 항목의 개별 결과를 표시
      const id = sel.dataset[`gis${kind === "ev" ? "Ev" : "Iv"}Select`];
      if(conf.getSel() === id) conf.closed[id] = !conf.closed[id];
      else { conf.setSel(id); conf.closed[id] = !!conf.closed[id] ? false : conf.closed[id]; }
      gisSelectedEvItem = { kind, id };
      gisSelectedBase = null;
      gisResultTab = "selected";
      conf.render();
      gisRenderResultTab();
      return;
    }
    const req = attr("request");
    if(req){
      // 요청 → 표준 형식 요청서 자동 생성 → 승인(발송)으로 등록
      const item = gisFindStageItem(kind, req.dataset[`gis${kind === "ev" ? "Ev" : "Iv"}Request`]);
      if(item) gisOpenRequestPopup(kind, item);
      return;
    }
    const res = attr("result");
    if(res){
      // 결과 등록 → 원문 등록 후 AI 분석/요약으로 결과 제공
      const item = gisFindStageItem(kind, res.dataset[`gis${kind === "ev" ? "Ev" : "Iv"}Result`]);
      if(item) gisOpenResultPopup(kind, item);
      return;
    }
  }

  /* ── 요청서 승인/결과 등록 오버레이 버튼 ── */
  if(event.target.closest("[data-gis-doc-cancel]")){
    if(event.target.closest("#gisDocOverlay")) gisCloseDocOverlay();
    return;
  }
  const approve = event.target.closest("[data-gis-doc-approve]");
  if(approve){
    const item = gisFindStageItem(approve.dataset.kind, approve.dataset.id);
    if(item){
      item.request = document.getElementById("gisDocText")?.value || "";
      item.status = "요청됨";
      item.requestedAt = Date.now();   // 수사보고(증거요청 보고서) 작성일
      saveCanvasState();
      gisRenderEvidenceList();
      gisRenderInterviewList();
      gisSelectedEvItem = { kind: approve.dataset.kind, id: approve.dataset.id };
      gisSelectedBase = null;
      gisResultTab = "selected";
      gisRenderResultTab();
    }
    gisCloseDocOverlay();
    return;
  }
  const resSubmit = event.target.closest("[data-gis-res-submit]");
  if(resSubmit){
    const item = gisFindStageItem(resSubmit.dataset.kind, resSubmit.dataset.id);
    const raw = document.getElementById("gisResText")?.value.trim() || "";
    if(!item) { gisCloseDocOverlay(); return; }
    if(!raw){ alert("등록할 결과 내용을 입력하세요."); return; }
    item.raw = raw;
    gisCloseDocOverlay();
    gisSummarizeItem(resSubmit.dataset.kind, resSubmit.dataset.id);
    return;
  }
});

document.addEventListener("change", (event) => {
  const agency = event.target.closest("[data-gis-agency]");
  if(agency){
    if(agency.checked) gisExtAgencyChecked.add(agency.dataset.gisAgency);
    else gisExtAgencyChecked.delete(agency.dataset.gisAgency);
    saveCanvasState();
    return;
  }
  const urlToggle = event.target.closest("[data-gis-url-toggle]");
  if(urlToggle){
    gisExtUrlOpen = urlToggle.checked;
    const panel = document.getElementById("gisExtWebPanel");
    if(panel){
      panel.hidden = !gisExtUrlOpen;
      if(gisExtUrlOpen) renderWebTargetPanel("scenario");
    }
    saveCanvasState();
  }
});

document.addEventListener("input", (event) => {
  if(event.target?.id === "gisScenarioNotes"){
    const aCase = activeGenInvCase();
    if(aCase) gisScenarioNotesByCase[aCase.caseId] = event.target.value;
    saveCanvasState();
    return;
  }
  if(event.target?.id === "gisBaseNotes"){
    const aCase = activeGenInvCase();
    if(aCase) gisBaseNotesByCase[aCase.caseId] = event.target.value;
    saveCanvasState();
    return;
  }
  const baseNote = event.target.closest?.("[data-gis-base-note]");
  if(baseNote){
    const svc = gisBaseAiServices.find(entry => entry.key === baseNote.dataset.gisBaseNote);
    if(svc){ svc.note = baseNote.value; saveCanvasState(); }
    return;
  }
  // 증거 수집·접견/신문 — 단계 공통 착안사항·항목별 착안사항/기록 내용
  if(event.target?.id === "gisEvidenceNotes"){
    const aCase = activeGenInvCase();
    if(aCase) gisEvidenceNotesByCase[aCase.caseId] = event.target.value;
    saveCanvasState();
    return;
  }
  if(event.target?.id === "gisInterviewNotes"){
    const aCase = activeGenInvCase();
    if(aCase) gisInterviewNotesByCase[aCase.caseId] = event.target.value;
    saveCanvasState();
    return;
  }
  const evNote = event.target.closest?.("[data-gis-ev-note]");
  if(evNote){
    const item = gisEvidenceItems(activeGenInvCase()).find(entry => entry.id === evNote.dataset.gisEvNote);
    if(item){ item.note = evNote.value; saveCanvasState(); }
    return;
  }
  const ivContent = event.target.closest?.("[data-gis-iv-content]");
  if(ivContent){
    const item = gisInterviewItems(activeGenInvCase()).find(entry => entry.id === ivContent.dataset.gisIvContent);
    if(item){ item.content = ivContent.value; saveCanvasState(); }
  }
});


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
            <h2>관세포탈 위험도 모니터링</h2>
            <p class="muted">관세조사 대상 기업의 관세포탈 위험도 현황을 실시간으로 모니터링합니다.</p>
          </div>
        </div>
        <div class="profile-loading">위험도 데이터 로딩 중...</div>
      </div>`;
  }

  const companies = riskDashboardCompanies();
  const total = companies.length;
  const needAudit  = riskFocusCount("audit");    // 조사필요 — 위험도 90점 이상
  const needReview = riskFocusCount("review");   // 심사필요 — 70~90점

  // 경보 카드 수치 — DB 위험지표(company_risk_indicator) 기준 해당 기업 수 + 근거 레코드 건수.
  // 예전에는 구간별 건수에 가중치를 곱한 합계라 클릭 후 목록 수와 맞지 않았다.
  const alertStats = {
    underval : riskFocusStats("underval"),
    hs       : riskFocusStats("hs"),
    royalty  : riskFocusStats("royalty"),
    forex    : riskFocusStats("forex"),
    refund   : riskFocusStats("refund"),
  };

  const minS = riskDashboardFilter.minScore;
  const filtered = riskDashboardFiltered();
  const focusKey = riskDashboardFilter.focus;

  return `
    <div class="risk-dashboard">
      <div class="risk-dash-header">
        <div>
          <h2>관세포탈 위험도 모니터링</h2>
          <p class="muted">관세조사 대상 기업의 관세포탈 위험도 현황을 실시간으로 모니터링합니다.</p>
        </div>
        <div class="risk-kpi-side">
          <button type="button" class="risk-register-btn" data-risk-register
            title="엑셀 파일(.xlsx/.xls/.csv)로 분석대상 기업을 일괄 등록합니다">📎 기업목록 등록</button>
          <input type="file" id="riskRegisterFile" accept=".xlsx,.xls,.csv" style="display:none">
          <div class="risk-kpi-strip">
            ${riskKpiItem("all",    "분석대상 기업",   `${total.toLocaleString()} 개사`, focusKey)}
            ${riskKpiItem("audit",  "조사필요",        `${needAudit} 개사`, focusKey)}
            ${riskKpiItem("review", "심사필요",        `${needReview} 개사`, focusKey)}
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
        ${riskAlertCard("underval", "신고가격오류 의심",   alertStats.underval, focusKey)}
        ${riskAlertCard("hs",       "품목분류 위장 의심",  alertStats.hs,       focusKey)}
        ${riskAlertCard("royalty",  "권리사용료 미신고",   alertStats.royalty,  focusKey)}
        ${riskAlertCard("forex",    "외환 송금액 불일치",  alertStats.forex,    focusKey)}
        ${riskAlertCard("refund",   "환급금액 오신청 의심", alertStats.refund,   focusKey)}
      </div>

      ${focusKey === "all" ? "" : `
        <div class="risk-focus-bar">
          <span class="risk-focus-tag">${escapeHtml(RISK_DASH_FOCUS[focusKey].label)}</span>
          <span class="muted">해당 기업 ${filtered.length}개사만 표시 중${
            RISK_DASH_FOCUS[focusKey].code
              ? ` · 근거 ${riskFocusStats(focusKey).evidence.toLocaleString()}건`
              : ""}</span>
          <button type="button" class="btn secondary risk-focus-clear" data-risk-focus="all">✕ 전체 보기</button>
        </div>`}

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

/* 상단 KPI — 클릭하면 그 조건의 기업만 보여준다(같은 항목 재클릭 시 전체로 복귀) */
function riskKpiItem(focus, label, valueText, activeFocus){
  const active = focus === activeFocus;
  return `
    <button type="button" class="risk-kpi-item${active ? " active" : ""}"
      data-risk-focus="${focus}" title="${escapeHtml(label)} 대상 기업만 보기">
      <span>${escapeHtml(label)}</span>
      <strong>${valueText}</strong>
    </button>`;
}

/* 경보 카드 — 해당 기업 수를 주 수치로, DB 위험지표의 근거 레코드 건수를 함께 표기 */
function riskAlertCard(focus, label, stats, activeFocus){
  const active = focus === activeFocus;
  return `
    <button type="button" class="risk-alert-item${active ? " active" : ""}"
      data-risk-focus="${focus}" title="${escapeHtml(label)} 대상 기업만 보기">
      <span>${escapeHtml(label)}</span>
      <strong>${stats.companies} <small>개사</small></strong>
      <em class="risk-alert-evidence">근거 ${stats.evidence.toLocaleString()}건</em>
    </button>`;
}

/* 공통 위험도 카드 — investigation 대시보드 / profile 페이지 동일 사용 */
function riskCompanyCard(c){ return sharedRiskCard(c); }

/* risk_score 구간 → 테두리 색·버튼 라벨 (조사 긴급도 밴드) */
function riskScoreBand(score){
  if(score >= 90) return { cls: "urgent",  label: "관세조사 - 시급" };
  if(score >= 70) return { cls: "caution", label: "관세조사 - 주의" };
  if(score >= 50) return { cls: "check",   label: "관세조사 - 확인" };
  return { cls: "low", label: "위험도 낮음" };
}

function sharedRiskCard(c){
  const score = c.risk_score || 0;
  const band  = riskScoreBand(score);
  const tags  = companyRiskTags(c);
  const visibleTags = tags.slice(0,2).map(t => `<span class="risk-tag">${escapeHtml(t)}</span>`).join("");
  const moreTags = tags.length > 2 ? `<span class="risk-tag more">+${tags.length-2}개</span>` : "";
  const cardId = `#TRG-26-${escapeHtml(c.company_id.replace("C-",""))}`;
  return `
    <div class="risk-company-card ${band.cls}">
      <div class="ci-card-top-row">
        <div class="ci-card-name-head">
          <strong class="ci-card-name">${escapeHtml(c.company_name || c.company_id)}</strong>
          <span class="muted ci-card-id">${cardId} <em class="ci-card-industry">[${escapeHtml(industryLabel(c.industry_code))}]</em></span>
        </div>
        <button class="btn ci-card-select-btn ${band.cls}" data-investigation-select="${escapeHtml(c.company_id)}">${band.label}</button>
      </div>
      <div class="risk-card-scores">
        <div><span class="muted">위험도점수</span><strong class="${band.cls}">${score.toFixed(1)}</strong></div>
        <div><span class="muted">주요 위험</span><div class="risk-card-tags">${visibleTags}${moreTags}</div></div>
      </div>
      <div class="risk-card-review">
        <p>${companyReviewText(c)}</p>
      </div>
    </div>`;
}

/* 위험 태그 — 대상의 지표 세트(심사/밀수)에 해당하는 지표만 표시한다.
   밀수 수사 대상에 저가신고·FTA 등 심사 태그가 섞이지 않도록 세트별로 분기. */
function companyRiskTags(c){
  const tags = [];
  if(indicatorSetForCompany(c) === "smuggling"){
    if((c.disguise_declaration_rate||0) >= 50)   tags.push("#품명위장신고");
    if((c.contraband_detection_rate||0) >= 50)   tags.push("#위해물품적발");
    if((c.inspection_evasion_rate||0) >= 50)     tags.push("#검사회피");
    if((c.proceeds_concealment_rate||0) >= 50)   tags.push("#범죄수익은닉");
    if((c.accomplice_network_rate||0) >= 50)     tags.push("#공범차명");
    if((c.route_supplier_risk_rate||0) >= 50)    tags.push("#우범경로");
    return tags;
  }
  if((c.undervaluation_suspicion_rate||0) >= 50)              tags.push("#단기저가신고");
  if((c.offshore_fund_concealment_suspicion_rate||0) >= 50)   tags.push("#외환거래불일치");
  if((c.related_party_anomaly_rate||0) >= 50)                 tags.push("#특수관계거래");
  if((c.hs_classification_error_rate||0) >= 40)               tags.push("#품목분류오류");
  if((c.customs_refund_anomaly_rate||0) >= 50)                tags.push("#환급오신청");
  if((c.fta_origin_misuse_suspicion_rate||0) >= 50)           tags.push("#FTA원산지");
  return tags;
}

function companyReviewText(c){
  if(indicatorSetForCompany(c) === "smuggling"){
    const dg = c.disguise_declaration_rate || 0;
    const cb = c.contraband_detection_rate || 0;
    const ev = c.inspection_evasion_rate || 0;
    const pc = c.proceeds_concealment_rate || 0;
    if(cb >= 60) return `통관검사에서 금지·위해물품이 적발되어 반입 경로 전반의 확인이 필요합니다.`;
    if(dg >= 60) return `신고품명과 실제 물품(성분)이 불일치하는 위장 신고가 확인됩니다.`;
    if(ev >= 60) return `저검사 채널에 신고가 집중되어 통관검사 회피 설계가 의심됩니다.`;
    if(pc >= 60) return `수입대금이 차명·해외 수취처를 경유해 범죄수익 은닉이 의심됩니다.`;
    return `반입채널·검사 이력 검토 결과 경미한 이상 징후가 있어 모니터링이 권장됩니다.`;
  }
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
  const rerender = () => {
    if(currentPage === "investigation") render("investigation");
    else render("profile");
  };

  // 분석대상 기업등록 — 엑셀 파일 선택으로 일괄 등록 접수
  const registerBtn = document.querySelector("[data-risk-register]");
  const registerFile = document.getElementById("riskRegisterFile");
  if(registerBtn && registerFile){
    registerBtn.addEventListener("click", () => registerFile.click());
    registerFile.addEventListener("change", () => {
      const file = registerFile.files?.[0];
      if(!file) return;
      alert(`분석대상 기업등록 접수: "${file.name}"\n엑셀 목록의 기업이 분석대상으로 등록됩니다.`);
      registerFile.value = "";
    });
  }

  // 상단 KPI·경보 카드 클릭 → 해당 조건의 기업만 표시(같은 항목 재클릭은 전체 해제)
  document.querySelectorAll("[data-risk-focus]").forEach(el => {
    el.addEventListener("click", () => {
      const next = el.dataset.riskFocus;
      riskDashboardFilter.focus = (next === riskDashboardFilter.focus) ? "all" : next;
      rerender();
    });
  });

  if(!queryInput) return;

  queryInput.addEventListener("input", () => {
    riskDashboardFilter.query = queryInput.value;
    const grid = document.getElementById("riskCompanyGrid");
    if(grid){
      grid.innerHTML = riskDashboardFiltered().map(riskCompanyCard).join("")
        || '<div class="empty-state">검색 조건에 맞는 기업이 없습니다.</div>';
    }
  });

  scoreSelect.addEventListener("change", () => {
    riskDashboardFilter.minScore = parseInt(scoreSelect.value, 10);
    rerender();
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
  return `[분석범위]\n- ${behaviors.join("\n- ")}\n\n${instruction}${extraPromptsRunText(item.extraPrompts)}${webTargetPromptText(webTargets)}`;
}

function scenarioInstructionPreview(item){
  const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
  const instruction = item.instruction || sourceDefaultInstruction(item.key, item.target_type || item.targetType || "company") || "기본 분석";
  const webTargets = scenarioItemWebTargets(item);
  return `${behaviors.join(", ")} · ${instruction}${webTargetCountSuffix(webTargets)}`;
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
    scenarioResultViewTab = "result";
    behaviorPromptActiveTab = {};
    const archive = currentRunArchive(activeCanvasCompanyId);
    scenarioItems = getCompanyScenario(activeCanvasCompanyId);
    if(archive){
      const remapped = remapArchiveResults(archive, scenarioItems);
      stepOutputs = remapped.outputs;
      stepStatuses = remapped.statuses;
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

  // 리뷰 모드(분석 시나리오 확인 및 설정)에서는 실행·초기화 버튼이 렌더되지 않는다 — 옵셔널 바인딩
  document.getElementById("scenarioRunButton")?.addEventListener("click", runScenarioWorkflow);
  // 헤더 [전체 시나리오 수행] — 리뷰 모드 등 하단 실행 버튼이 없는 레이아웃에서도 전체 실행 제공
  document.getElementById("scenarioRunAllButton")?.addEventListener("click", runScenarioWorkflow);
  document.getElementById("scenarioClearButton")?.addEventListener("click", clearScenarioResults);
  document.getElementById("scenarioReviewRunButton")?.addEventListener("click", runSelectedScenarioService);
  // 리뷰 모드: 분석범위 설정 팝업(체크박스 행 대체)
  document.getElementById("scenarioBehaviorConfigButton")?.addEventListener("click", openScenarioBehaviorPopup);
  // 리뷰 모드 우측 패널 보기 탭: 분석 결과 ↔ 통합 프롬프트
  document.querySelectorAll("[data-result-view-tab]").forEach(button => {
    button.addEventListener("click", () => {
      scenarioResultViewTab = button.dataset.resultViewTab;
      document.querySelectorAll("[data-result-view-tab]").forEach(b =>
        b.classList.toggle("active", b.dataset.resultViewTab === scenarioResultViewTab));
      renderScenarioSteps();
    });
  });
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
  // 관세조사 4단계 스테이지 UI: '외부데이터 수집' 웹 패널 초기 렌더
  if(document.getElementById("ciExtWebPanel")) renderWebTargetPanel("scenario");
  // 기초조사 AI 분석서비스 추가용 셀렉트 — AI 서비스 카탈로그로 채움
  const ciBaseSelect = document.getElementById("ciBaseServiceSelect");
  if(ciBaseSelect && !ciBaseSelect.options.length) ciBaseSelect.innerHTML = scenarioSourceOptionsHtml();
}

/* 분석범위(동작) 하나에 대한 짧은 설명 — 패턴 등록분 우선, 없으면 기본 문구 */
function scenarioBehaviorDescription(key, behaviorValue){
  const label = sourceBehaviorLabel(key, behaviorValue);
  return patternBehaviorDescription(key, label)
    || `'${label}' 관점의 조회·분석을 수행합니다.`;
}

/* 리뷰 모드 전용: 선택된 AI 서비스의 분석범위별 상세설정을 탭 형태로 렌더한다.
   탭 = 분석범위(동작), 본문 = 설명 + 개별 프롬프트(프레임 남은 높이 전체 사용).
   비활성 탭의 textarea도 DOM에 유지(display:none)해 편집값·수집(collectBehaviorPrompts)이 보존된다.
   개별 프롬프트는 item.behaviorPrompts[동작값]에 저장, 없으면 동작 단독 composePrompt로 자동 생성. */
function renderBehaviorPromptBlocks(item){
  const box = document.getElementById("scenarioBehaviorPromptList");
  if(!box) return;
  if(!item){
    box.innerHTML = `<div class="empty-state">AI 서비스 단계를 먼저 선택하세요.</div>`;
    return;
  }
  const targetType = item.target_type || item.targetType || "company";
  const behaviors = Array.isArray(item.behaviors) && item.behaviors.length
    ? item.behaviors
    : sourceDefaultBehaviors(item.key);
  const savedTab = behaviorPromptActiveTab[item.id];
  const activeValue = behaviors.includes(savedTab) ? savedTab : behaviors[0];
  behaviorPromptActiveTab[item.id] = activeValue;

  const tabs = behaviors.map(value => `
    <button type="button" class="scenario-behavior-prompt-tab ${value === activeValue ? "active" : ""}"
      data-behavior-tab="${escapeHtml(value)}">${escapeHtml(sourceBehaviorLabel(item.key, value))}</button>
  `).join("");
  const blocks = behaviors.map(value => {
    const label = sourceBehaviorLabel(item.key, value);
    const desc = scenarioBehaviorDescription(item.key, value);
    const saved = item.behaviorPrompts?.[value] || "";
    // 웹 정보수집 요청의 "URL 직접 등록" 탭: 수집 대상 URL 등록 패널을 탭 본문에 내장
    const urlPanel = (item.key === "web_search" && value === "direct_url")
      ? `<div data-behavior-url-slot>${webTargetPanelHtml(item, "scenario")}</div>`
      : "";
    return `
      <div class="scenario-behavior-prompt ${value === activeValue ? "active" : ""}" data-behavior-block="${escapeHtml(value)}">
        <div class="scenario-behavior-prompt-head">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(desc)}</span>
        </div>
        ${urlPanel}
        <textarea class="scenario-prompt-editor" data-behavior-prompt="${escapeHtml(value)}"
          placeholder="'${escapeHtml(label)}' 분석범위의 개별 프롬프트가 자동 생성됩니다. 필요하면 직접 수정하세요.">${escapeHtml(saved)}</textarea>
      </div>
    `;
  }).join("");
  box.innerHTML = `<div class="scenario-behavior-prompt-tabs">${tabs}</div>${blocks}`;

  // 탭 전환: 재렌더 없이 클래스만 토글 — 편집 중인 다른 탭 textarea 값 보존
  box.querySelectorAll("[data-behavior-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset.behaviorTab;
      behaviorPromptActiveTab[item.id] = value;
      box.querySelectorAll("[data-behavior-tab]").forEach(b => b.classList.toggle("active", b === button));
      box.querySelectorAll("[data-behavior-block]").forEach(block =>
        block.classList.toggle("active", block.dataset.behaviorBlock === value));
    });
  });

  // 저장된 개별 프롬프트가 없는 동작은 동작 단독 composePrompt로 자동 생성해 채운다
  const issuedItemId = item.id;
  behaviors.forEach(value => {
    if(item.behaviorPrompts?.[value]) return;
    composePrompt(item.key, [value], targetType).then(composed => {
      const liveItem = selectedScenarioItem();
      if(!liveItem || liveItem.id !== issuedItemId) return;
      const el = document.querySelector(`#scenarioBehaviorPromptList textarea[data-behavior-prompt="${CSS.escape(value)}"]`);
      if(!el || el.value.trim()) return;
      el.value = composed || scenarioSuggestedInstruction(item.key, targetType, [value]);
    });
  });
}

/* 리뷰 모드 전용: 분석범위 선택 팝업 — 좌측 공간 최소화를 위해 체크박스 행 대신 팝업으로 설정.
   적용 시 item.behaviors 갱신 → 상세설정 탭·통합 프롬프트가 함께 갱신된다. */
function openScenarioBehaviorPopup(){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  if(!item) return;
  const current = Array.isArray(item.behaviors) && item.behaviors.length
    ? item.behaviors
    : sourceDefaultBehaviors(item.key);
  const options = sourceBehaviorOptions(item.key);
  document.getElementById("scenarioBehaviorPopup")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "scenarioBehaviorPopup";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;z-index:10600;padding:20px;";
  overlay.innerHTML = `
    <div style="width:420px;max-width:92vw;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.36);overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #eef1f6;">
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:800;color:#16213d;">분석범위 설정</div>
          <div style="font-size:11.5px;color:#8590a6;margin-top:2px;">${escapeHtml(normalizeReportValidationLabel(item.label))} · 최소 1개 이상 선택</div>
        </div>
        <button type="button" data-behavior-popup-close style="width:26px;height:26px;border:none;background:#f3f5f9;border-radius:8px;color:#5a6577;cursor:pointer;">✕</button>
      </div>
      <div style="padding:14px 18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;">
        ${options.map(option => `
          <label class="scenario-behavior-check">
            <input type="checkbox" value="${escapeHtml(option.value)}" ${current.includes(option.value) ? "checked" : ""}>
            <span>${escapeHtml(option.label)}</span>
          </label>
        `).join("")}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #eef1f6;background:#fcfdff;">
        <button type="button" class="btn secondary" data-behavior-popup-close>취소</button>
        <button type="button" class="btn primary" data-behavior-popup-apply>적용</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", event => {
    if(event.target === overlay || event.target.closest("[data-behavior-popup-close]")){
      overlay.remove();
      return;
    }
    if(event.target.closest("[data-behavior-popup-apply]")){
      const values = [...overlay.querySelectorAll("input:checked")].map(input => input.value);
      if(!values.length){
        alert("분석범위는 최소 하나 이상 선택해야 합니다.");
        return;
      }
      const live = selectedScenarioItem();
      if(live){
        live.behaviors = values;
        live.behavior = values[0];
        live.behaviorLabel = sourceBehaviorLabels(live.key, values).join(", ");
        // 관세수사(사건 기반)면 케이스 단계로 역저장, 그 외(관세조사)는 기업 시나리오 저장
        if(currentPage === "generalinv"){
          const giCase = activeGenInvCase();
          if(giCase) saveWorkbenchToCaseSteps(giCase);
          saveCanvasState();
        } else {
          saveCompanyScenario();
        }
        renderScenarioList();
        syncScenarioEditor();
        if(scenarioReviewMode) renderScenarioSteps();
      }
      overlay.remove();
    }
  });
}

/* 리뷰 모드 전용: 서비스 설정값(SERVICE_EDIT_META)을 분석범위와 유사한 인라인 칩 UI로 렌더.
   값 변경은 서비스 설정 팝업과 동일 저장소(/api/service_settings)에 즉시 저장된다. */
function renderServiceSettingsPanel(item){
  const field = document.getElementById("scenarioServiceSettingsField");
  const box = document.getElementById("scenarioServiceSettings");
  if(!field || !box) return;
  const found = item ? findServiceSpec(item.label) : { key: null };
  const meta = found.key ? SERVICE_EDIT_META[found.key] : null;
  if(!meta){
    field.style.display = "none";
    box.innerHTML = "";
    return;
  }
  field.style.display = "";
  const serviceKey = found.key;
  const values = getServiceSettings(serviceKey);
  box.innerHTML = Object.entries(meta).map(([name, m]) => {
    const value = values[name];
    let control = "";
    if(m.control === "choice"){
      control = `<select data-setting-input="${escapeHtml(name)}">${m.options.map(([v, label]) =>
        `<option value="${escapeHtml(v)}" ${v === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
    } else if(m.control === "number"){
      control = `<input type="number" data-setting-input="${escapeHtml(name)}" value="${escapeHtml(String(value ?? ""))}"
        min="${m.min ?? ""}" max="${m.max ?? ""}">${m.unit ? `<em>${escapeHtml(m.unit)}</em>` : ""}`;
    } else if(m.control === "multi"){
      const arr = Array.isArray(value) ? value : [];
      control = m.options.map(([v, label]) =>
        `<button type="button" class="scenario-setting-multi ${arr.includes(v) ? "on" : ""}"
          data-setting-multi="${escapeHtml(name)}::${escapeHtml(v)}">${escapeHtml(label)}</button>`).join("");
    } else {
      control = `<input type="text" data-setting-input="${escapeHtml(name)}" value="${escapeHtml(String(value ?? ""))}"
        placeholder="${escapeHtml(m.placeholder || "")}">`;
    }
    return `
      <label class="scenario-behavior-check scenario-setting-check">
        <span>${escapeHtml(name)}</span>
        ${control}
      </label>
    `;
  }).join("");

  box.querySelectorAll("[data-setting-input]").forEach(el => {
    el.addEventListener("change", () => {
      const name = el.dataset.settingInput;
      const m = SERVICE_EDIT_META[serviceKey][name];
      let value = el.value;
      if(m.control === "number"){
        let n = Number(value);
        if(Number.isNaN(n)) n = m.def ?? 0;
        if(m.min !== undefined) n = Math.max(m.min, n);
        if(m.max !== undefined) n = Math.min(m.max, n);
        value = n;
        el.value = String(n);
      }
      setServiceSetting(serviceKey, name, value);
    });
  });
  box.querySelectorAll("[data-setting-multi]").forEach(button => {
    button.addEventListener("click", () => {
      const [name, v] = button.dataset.settingMulti.split("::");
      const current = getServiceSettings(serviceKey)[name];
      const arr = Array.isArray(current) ? [...current] : [];
      const next = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
      if(!next.length) return;   // 최소 1개 유지
      setServiceSetting(serviceKey, name, next);
      renderServiceSettingsPanel(item);
    });
  });
}

/* 리뷰 모드 전용: 선택 단계의 통합 프롬프트(입력/설정값 + 분석범위별 프롬프트 병합) 텍스트 */
function buildIntegratedPromptText(item){
  if(!item) return "";
  const behaviors = Array.isArray(item.behaviors) && item.behaviors.length
    ? item.behaviors
    : sourceDefaultBehaviors(item.key);
  const labels = sourceBehaviorLabels(item.key, behaviors);
  const found = findServiceSpec(item.label);
  const meta = found.key ? SERVICE_EDIT_META[found.key] : null;
  const settingLines = meta
    ? Object.keys(meta).map(name =>
        `- ${name}: ${settingValueLabel(found.key, name, getServiceSettings(found.key)[name])}`)
    : [];
  // 화면에서 편집 중인 값 우선(collectBehaviorPrompts), 없으면 저장분(item.behaviorPrompts)
  const current = collectBehaviorPrompts();
  const prompts = Object.values(current).some(text => text) ? current : (item.behaviorPrompts || {});
  const merged = mergeBehaviorPrompts(item, prompts);
  const webTargets = scenarioItemWebTargets(item);
  const webText = webTargets.length
    ? `[수집 대상 URL]\n${webTargets.map(t =>
        `- ${t.url}${t.query ? ` (${t.query})` : ""}${t.loginId ? " · 로그인정보 등록됨" : ""}`).join("\n")}`
    : "";
  return [
    `[AI 서비스] ${normalizeReportValidationLabel(item.label)}`,
    `[분석범위] ${labels.join(", ")}`,
    settingLines.length ? `[입력/설정값]\n${settingLines.join("\n")}` : "",
    item.docRef ? `[첨부자료] ${item.docRef}` : "",
    merged || item.instruction || "",
    extraPromptsRunText(item.extraPrompts).trim(),
    webText,
  ].filter(Boolean).join("\n\n");
}

/* 리뷰 모드 전용: 분석범위별 개별 프롬프트 textarea 값을 {동작값: 프롬프트}로 수집 */
function collectBehaviorPrompts(){
  const prompts = {};
  document.querySelectorAll("#scenarioBehaviorPromptList textarea[data-behavior-prompt]").forEach(el => {
    const value = el.dataset.behaviorPrompt;
    if(value) prompts[value] = el.value.trim();
  });
  return prompts;
}

/* 리뷰 모드 전용: 분석범위별 개별 프롬프트를 실행용 통합 지시문으로 병합 */
function mergeBehaviorPrompts(item, prompts){
  return Object.entries(prompts)
    .filter(([, text]) => text)
    .map(([value, text]) => `[분석범위: ${sourceBehaviorLabel(item.key, value)}]\n${text}`)
    .join("\n\n");
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
  if(scenarioReviewMode){
    // 리뷰 모드: 통합 프롬프트 대신 설정값 인라인 UI + 분석범위별 탭 상세설정을 렌더한다
    renderServiceSettingsPanel(item);
    renderBehaviorPromptBlocks(item);
  }else{
    const _fallback = item?.instruction || scenarioSuggestedInstruction(item?.key, targetType, item?.behaviors) || "";
    if(instruction) instruction.value = _fallback;
    if(item?.key){
      // race 가드: promise 발행 시점의 단계가 resolve 시점에도 선택돼 있어야 적용.
      // (이 가드 없이는 단계 A의 늦은 응답이 단계 B 화면/데이터에 A의 프롬프트를 덮어쓴다)
      const issuedItemId = item.id;
      composePrompt(item.key, item.behaviors || sourceDefaultBehaviors(item.key), targetType).then(composed => {
        const liveItem = selectedScenarioItem();
        if(!liveItem || liveItem.id !== issuedItemId) return;
        const el = document.getElementById("scenarioInstruction");
        if(!el) return;
        // 패턴 등록 서비스는 상세 템플릿(composed)이 없어도 설명형 패턴 프롬프트로 대체(그 외는 composePrompt 원본)
        const finalText = finalizeScenarioPrompt(item.key,
          sourceBehaviorLabels(item.key, item.behaviors || sourceDefaultBehaviors(item.key)), composed);
        if(!finalText) return;
        // 사용자가 직접 수정하지 않은 경우(=자동 생성값과 동일할 때)에만 교체
        const current = el.value;
        if(!current || current === _fallback || current === composed){
          el.value = finalText;
          liveItem.instruction = finalText;
        }
      });
    }
  }
  if(hint && item){
    const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
    const status = scenarioItemPermissionStatus(item);
    const needsPermission = status === "locked" || status === "requested";
    // 리뷰 모드: 프롬프트 영역 최대화를 위해 분석범위 요약·설명 문구(상세설정과 중복)를 생략
    hint.innerHTML = `
      <div class="hint-header">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="source-permission ${status}">${permissionLabel(status)}</span>
        <button type="button" data-service-detail="${escapeHtml(item.label)}" title="입력정의·결과형식 상세 보기"
          style="margin-left:auto;border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:6px;padding:2px 9px;font-size:11px;font-weight:700;cursor:pointer;line-height:1.6;">서비스 상세</button>
      </div>
      ${scenarioReviewMode ? "" : `<span class="hint-behaviors">${escapeHtml(behaviors.join(", "))}</span>`}
      ${serviceInputStripHtml(item.label, {
        targetLabel: (() => { const c = activeCanvasCompany(); return c ? `${c.company_name} (${c.company_id})` : ""; })(),
        docCount: (uploadedFilesByCompany[activeCanvasCompanyId] || []).length,
        // 리뷰 모드: 설정 입력은 아래 "입력/설정값" 인라인 UI로 표시 — 스트립에서 중복 제외.
        // 첨부자료 입력은 직접 등록(파일명/링크)한 값을 우선 표시하고 클릭 편집을 허용.
        hideSettings: scenarioReviewMode,
        docEditable: scenarioReviewMode,
        docLabel: scenarioReviewMode ? (item.docRef || "") : "",
      })}
      ${needsPermission ? `
        <div class="hint-permission-callout">
          <span>${status === "requested" ? "권한 요청이 접수되었습니다. 승인 대기 중입니다." : "이 단계를 실행하려면 추가 권한이 필요합니다."}</span>
          ${status === "locked" ? `<button type="button" class="btn-perm-request" data-permission-request="${escapeHtml(item.key)}">권한 요청</button>` : ""}
        </div>
      ` : (scenarioReviewMode ? "" : `<p>${escapeHtml(scenarioSuggestedInstruction(item.key, targetType, item.behaviors) || "선택 조건에 맞는 프롬프트를 입력하세요.")}</p>`)}
    `;
    // 리뷰 모드: 첨부자료(문서) 입력값 칩 클릭 → 파일명/링크 직접 등록
    if(scenarioReviewMode){
      hint.querySelectorAll("[data-doc-input]").forEach(chip => {
        chip.addEventListener("click", () => {
          const live = selectedScenarioItem();
          if(!live) return;
          const value = prompt("첨부자료 파일명 또는 링크(URL)를 입력하세요", live.docRef || "");
          if(value === null) return;
          live.docRef = value.trim();
          saveCompanyScenario();
          syncScenarioEditor();
        });
      });
    }
  }
  if(hint && !item) hint.innerHTML = "";
  if(validation) validation.innerHTML = "";
  renderShareEmailPanel("scenario");
  renderWebTargetPanel("scenario");
  renderRagSelectPanel();
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
    const finalText = finalizeScenarioPrompt(key, sourceBehaviorLabels(key, behaviors), composed);
    if(finalText && instruction) instruction.value = finalText;
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
    // 리뷰 모드에서는 통합 프롬프트 textarea(#scenarioInstruction)가 없다 — 옵셔널 접근
    instruction: String(instruction?.value || "").trim() || suggestedInstruction,
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
  // 리뷰 모드에서는 통합 프롬프트 textarea가 없다 — 옵셔널 접근
  if(instruction) instruction.value = scenarioSuggestedInstruction(key, targetType, item.behaviors);
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
  // 4단계 템플릿의 기초 AI 분석서비스·외부기관 구성도 함께 적용
  const appliedTemplate = allScenarioTemplates().find(t => t.id === templateId);
  if(Array.isArray(appliedTemplate?.baseAiServices) && appliedTemplate.baseAiServices.length){
    ciBaseAiServices = appliedTemplate.baseAiServices.map(svc => ({ ...svc }));
  }
  if(Array.isArray(appliedTemplate?.extAgencies)){
    ciExtAgencyChecked = new Set(appliedTemplate.extAgencies);
  }
  if(typeof appliedTemplate?.extUrlOpen === "boolean") ciExtUrlOpen = appliedTemplate.extUrlOpen;
  if(Array.isArray(appliedTemplate?.webTargets) && appliedTemplate.webTargets.length){
    const webItem = scenarioItems.find(item => item.key === "web_search");
    if(webItem) setScenarioItemWebTargets(webItem, appliedTemplate.webTargets);
  }
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

function applySelectedScenarioPrompt(){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  const validation = document.getElementById("scenarioPromptValidation");
  if(scenarioReviewMode){
    // 리뷰 모드: 분석범위별 개별 프롬프트를 저장하고 실행용 통합 지시문으로 병합
    if(!item) return;
    const prompts = collectBehaviorPrompts();
    const empty = Object.entries(prompts).filter(([, text]) => !text);
    if(empty.length){
      const labels = empty.map(([value]) => sourceBehaviorLabel(item.key, value));
      if(validation) validation.innerHTML = `<div class="prompt-validation-msg warn">개별 프롬프트를 입력한 뒤 적용하세요: ${escapeHtml(labels.join(", "))}</div>`;
      return;
    }
    item.behaviorPrompts = prompts;
    item.instruction = mergeBehaviorPrompts(item, prompts) || item.instruction;
    saveCompanyScenario();
    renderScenarioList();
    renderScenarioSteps();
    if(validation) validation.innerHTML = `<div class="prompt-validation-msg good">분석범위별 프롬프트 ${Object.keys(prompts).length}건이 등록되었습니다. AI 분석서비스 수행 시 적용됩니다.</div>`;
    return;
  }
  const instruction = document.getElementById("scenarioInstruction");
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
  const validation = document.getElementById("scenarioPromptValidation");
  if(scenarioReviewMode){
    // 리뷰 모드: 분석범위별 개별 프롬프트 각각을 점검
    if(!item || !validation) return;
    const prompts = collectBehaviorPrompts();
    const messages = [];
    Object.entries(prompts).forEach(([value, text]) => {
      const label = sourceBehaviorLabel(item.key, value);
      if(!text) messages.push(`'${label}' 프롬프트가 비어 있습니다.`);
      else if(text.length < 20) messages.push(`'${label}' 프롬프트가 너무 짧아 분석 범위가 불명확할 수 있습니다.`);
    });
    if(!Object.keys(prompts).length) messages.push("검증할 분석범위 프롬프트가 없습니다.");
    validation.innerHTML = messages.length
      ? `<div class="prompt-validation-msg warn">${escapeHtml(messages.join(" "))}</div>`
      : `<div class="prompt-validation-msg good">분석범위 ${Object.keys(prompts).length}건 모두 선택된 AI 서비스와 동작 조건에 맞는 프롬프트입니다.</div>`;
    return;
  }
  const instruction = document.getElementById("scenarioInstruction");
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
    // 패턴 등록 서비스는 이전 자동 생성값도 패턴 형태이므로 패턴 기준으로도 비교한다
    const prevFinal = finalizeScenarioPrompt(item.key, sourceBehaviorLabels(item.key, previousBehaviors), prevComposed);
    const isAuto = isAutoScenarioInstruction(previousInstruction, item.key, targetType, previousBehaviors)
      || String(previousInstruction || "").trim() === String(prevComposed || "").trim()
      || String(previousInstruction || "").trim() === String(prevFinal || "").trim();
    if(isAuto){
      // JSON 기반 최적 프롬프트 우선 적용
      return composePrompt(item.key, values, targetType).then(composed => {
        const prompt = finalizeScenarioPrompt(item.key, sourceBehaviorLabels(item.key, values), composed)
          || scenarioSuggestedInstruction(item.key, targetType, values);
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
    const finalText = finalizeScenarioPrompt(key, sourceBehaviorLabels(key, nextBehaviors), composed);
    if(finalText){
      item.instruction = finalText;
      const el = document.getElementById("scenarioInstruction");
      if(el) el.value = finalText;
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

/* 관세조사 4단계 스테이지 UI: 보고서 생성·검증 서비스는 4단계 컨테이너로 분리 렌더 */
function ciIsReportStageItem(item){
  return ["report", "validation", "approve"].includes(item.type)
    || ["report_generate", "report_validate"].includes(item.key);
}

/* 관세조사 스테이지 UI: 선택된 서비스 칩 바로 아래에 상세 설정(.ci-stage-config)을
   아코디언처럼 배치한다. DOM 노드를 이동시키므로 내부 요소의 이벤트 바인딩이 보존된다. */
function ciPlaceScenarioDetail(){
  const config = document.querySelector(".ci-stage-config");
  const dock = document.getElementById("ciStageConfigDock");
  if(!config || !dock) return;
  const active = document.querySelector("#scenarioList .scenario-chip.active, #ciStage4List .scenario-chip.active");
  if(!active || ciDetailCollapsed){
    dock.appendChild(config);
    config.style.display = "none";
    return;
  }
  config.style.display = "";
  const holder = document.createElement("li");
  holder.className = "ci-chip-detail";
  active.after(holder);
  holder.appendChild(config);
}

function renderScenarioList(){
  const target = document.getElementById("scenarioList");
  if(!target) return;
  normalizeScenarioOrder();
  // 4단계 스테이지 UI — 관세조사(ci*)와 관세수사(gis*)는 각자 독립 상태·함수를 쓴다
  const ciStage4  = document.getElementById("ciStage4List");
  const gisStage4 = document.getElementById("gisStage4List");
  const stage4 = ciStage4 || gisStage4;
  const isGisStage = !ciStage4 && !!gisStage4;
  const isReportItem = isGisStage ? gisIsReportStageItem : ciIsReportStageItem;
  const chipHtml = item => {
    const status = scenarioItemPermissionStatus(item);
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
        ${stage4 ? "" : `<p>${escapeHtml(scenarioInstructionPreview(item))}</p>`}
      </div>
    </li>
  `;
  };

  if(stage4){
    // 리스트 재렌더 전 상세 설정 블록을 dock으로 대피(내부 이벤트 바인딩 보존)
    const dock = document.getElementById(isGisStage ? "gisStageConfigDock" : "ciStageConfigDock");
    const config = document.querySelector(isGisStage ? ".gis-stage-config" : ".ci-stage-config");
    if(dock && config) dock.appendChild(config);
    target.innerHTML = scenarioItems.filter(item => !isReportItem(item)).map(chipHtml).join("");
    stage4.innerHTML = scenarioItems.filter(isReportItem).map(chipHtml).join("")
      || `<div class="empty-state">보고서 생성·검증 서비스가 시나리오에 없습니다.</div>`;
  }else{
    target.innerHTML = scenarioItems.map(chipHtml).join("");
  }

  const containers = stage4 ? [target, stage4] : [target];
  containers.forEach(container => container.querySelectorAll(".scenario-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      // 스테이지 UI: 활성 칩 재클릭 = 상세 접기/펴기 토글, 다른 칩 클릭 = 선택 + 상세 표시
      if(stage4 && selectedScenarioId === chip.dataset.scenarioId){
        if(isGisStage) gisDetailCollapsed = !gisDetailCollapsed;
        else ciDetailCollapsed = !ciDetailCollapsed;
      }else{
        selectedScenarioId = chip.dataset.scenarioId;
        if(isGisStage) gisDetailCollapsed = false;
        else ciDetailCollapsed = false;
      }
      // 시나리오 서비스 선택 → '선택된 서비스 분석결과'가 이 항목을 가리키게 복귀
      ciSelectedBase = null;
      gisSelectedBase = null;
      gisSelectedEvItem = null;
      renderScenarioList();
      syncScenarioEditor();
      // 리뷰 모드: 우측 결과 패널이 선택된 AI 서비스를 따라가도록 갱신
      if(scenarioReviewMode) renderScenarioSteps();
      if(document.getElementById("ciResultBody")){ ciRenderResultTab(); ciPaintBaseSelection(); }
      if(document.getElementById("gisResultBody")){ gisRenderResultTab(); gisPaintBaseSelection(); }
    });
    chip.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", chip.dataset.scenarioId));
    chip.addEventListener("dragover", event => event.preventDefault());
    chip.addEventListener("drop", event => {
      event.preventDefault();
      moveScenarioItem(event.dataTransfer.getData("text/plain"), chip.dataset.scenarioId);
    });
  }));

  // 선택 칩 아래 상세 설정 아코디언 배치
  if(stage4) (isGisStage ? gisPlaceScenarioDetail : ciPlaceScenarioDetail)();
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
  // 스테이지 UI: 단계별 결과 탭이 열려 있으면 해당 탭 본문도 최신화(관세조사 ci / 관세수사 gis)
  if(document.getElementById("ciResultBody") && ciResultTab !== "selected") ciRenderResultTab();
  if(document.getElementById("gisResultBody") && gisResultTab !== "selected") gisRenderResultTab();
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
  // 리뷰 모드: 전체 로그 아코디언 대신 상단 카드에서 선택된 AI 서비스의 결과만 펼쳐 보여준다
  const visibleItems = scenarioReviewMode
    ? scenarioItems.filter(item => item.id === selectedScenarioId)
    : scenarioItems;
  if(scenarioReviewMode && !visibleItems.length){
    target.innerHTML = `<div class="empty-state">상단 단계 카드에서 AI 서비스를 선택하면 해당 결과가 표시됩니다.</div>`;
    return;
  }
  // 리뷰 모드 · 통합 프롬프트 탭: 선택 단계의 입력/설정값·분석범위별 프롬프트를 병합해 표시
  if(scenarioReviewMode && scenarioResultViewTab === "prompt"){
    const item = visibleItems[0];
    const promptText = buildIntegratedPromptText(item);
    target.innerHTML = `
      <section class="scenario-step ${item.type} open">
        <div class="scenario-step-head">
          <div class="scenario-step-toggle" style="cursor:default">
            <span>${escapeHtml(normalizeReportValidationLabel(item.label))} — 통합 프롬프트</span>
          </div>
        </div>
        <div class="scenario-step-body scenario-integrated-prompt">${escapeHtml(promptText || "구성된 프롬프트가 없습니다.").replace(/\n/g, "<br>")}</div>
      </section>
    `;
    return;
  }
  target.innerHTML = visibleItems.map(item => {
    const open = scenarioReviewMode ? true : openedSteps.has(item.id);
    const full = expandedResultStepId === item.id;
    const hasOutput = Boolean(stepOutputs[item.id]);
    const status = stepStatuses[item.id] || "대기";
    const output = stepOutputs[item.id] || "아직 실행 결과가 없습니다.";
    const canRerunFromStep = status === "오류";
    // 리뷰 모드: 항상 펼침 상태이므로 접기 토글·전체결과보기 버튼 없이 서비스명만 표시
    // (실시간 수행 시 진행 상태를 알 수 있도록 대기 외 상태 배지는 노출)
    const headHtml = scenarioReviewMode ? `
        <div class="scenario-step-head">
          <div class="scenario-step-toggle" style="cursor:default">
            <span>${escapeHtml(normalizeReportValidationLabel(item.label))}</span>
            ${status !== "대기" ? `<em>${escapeHtml(status)}</em>` : ""}
          </div>
        </div>` : `
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
        </div>`;
    return `
      <section class="scenario-step ${item.type} ${open ? "open" : ""} ${full ? "result-full" : ""}">
        ${headHtml}
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
    ragId: scenarioItemRagId(item),
    ragName: isRagSelectStep(item) ? (item.ragName || "") : "",
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

/* AI 분석서비스 수행(리뷰 모드 전용) — 선택된 AI 서비스 단계를 현재 DB 내용 기반으로
   실시간 실행(LLM 시뮬레이션)하고 결과를 리뷰 결과 패널에 표시한다. */
function runSelectedScenarioService(){
  const item = selectedScenarioItem();
  if(!item){ alert("실행할 AI 서비스 단계를 선택하세요."); return; }
  // 관세수사: 사건 단계 스트리밍 실행 경로(giStreamSteps) 사용
  if(currentPage === "generalinv"){
    const giCase = activeGenInvCase();
    if(!giCase){ alert("수사 대상을 먼저 선택하세요."); return; }
    saveWorkbenchToCaseSteps(giCase);
    if(!ensureMailShareRecipients([item])) return;
    if(!ensureDirectUrlTargets([item])) return;
    const step = (giCase.giSteps || []).find(s => s.id === item.id);
    if(step) giStreamSteps(giCase, [step]);
    return;
  }
  saveCompanyScenario();
  runSingleScenarioItem(item);
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
  // 사건 워크벤치가 전역 scenarioItems를 차지했음을 표시 — 관세조사 워크벤치가
  // 같은 기업으로 돌아왔을 때 재로드를 건너뛰어 사건 단계가 노출되는 누수 방지
  scenarioLoadedForCompany = `case:${aCase.caseId}`;
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

  // 관세수사 4단계 스테이지 UI: 웹 패널 초기 렌더 + 기초 AI 서비스 추가용 셀렉트 채움
  if(document.getElementById("gisExtWebPanel")) renderWebTargetPanel("scenario");
  const gisBaseSelect = document.getElementById("gisBaseServiceSelect");
  if(gisBaseSelect && !gisBaseSelect.options.length) gisBaseSelect.innerHTML = scenarioSourceOptionsHtml();

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

  /* 전체 시나리오 실행 — 하단 [실행] 버튼과 헤더 [전체 시나리오 수행]이 공유한다.
     하단 버튼은 레이아웃에 따라 렌더되지 않으므로 헤더는 이 함수를 직접 호출해야 한다. */
  const runGiScenarioAll = () => {
    if(!addPendingScenarioWebTarget()) return;
    const pendingShareEmail = document.getElementById("scenarioShareEmailInput")?.value || "";
    if(pendingShareEmail.trim() && !addShareEmailsToScope("scenario", pendingShareEmail)) return;
    saveWorkbenchToCaseSteps(aCase);
    const toRun = scenarioItems.filter(s => (aCase.stepStates||{})[s.id] !== "done");
    if(!ensureMailShareRecipients(toRun)) return;
    if(!ensureDirectUrlTargets(toRun)) return;
    giStreamSteps(aCase, aCase.giSteps.filter(s => toRun.some(r => r.id === s.id)));
  };
  document.getElementById("scenarioRunButton")?.addEventListener("click", runGiScenarioAll);
  document.getElementById("scenarioRunAllButton")?.addEventListener("click", runGiScenarioAll);

  // 리뷰 모드(관세조사와 동일 구조): 선택 서비스 단독 실시간 실행
  document.getElementById("scenarioReviewRunButton")?.addEventListener("click", runSelectedScenarioService);

  // 리뷰 레이아웃: 분석범위 설정 팝업 + [분석 결과|통합 프롬프트] 탭
  document.getElementById("scenarioBehaviorConfigButton")?.addEventListener("click", openScenarioBehaviorPopup);
  document.querySelectorAll("[data-result-view-tab]").forEach(button => {
    button.addEventListener("click", () => {
      scenarioResultViewTab = button.dataset.resultViewTab;
      document.querySelectorAll("[data-result-view-tab]").forEach(b =>
        b.classList.toggle("active", b.dataset.resultViewTab === scenarioResultViewTab));
      renderScenarioSteps();
    });
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

  /* 전체 시나리오 실행 — 헤더 [전체 시나리오 수행]은 하단 [실행] 버튼 렌더 여부와 무관하게 동작해야 한다. */
  const runDrugScenarioAll = () => {
    if(!addPendingScenarioWebTarget()) return;
    const pendingShareEmail = document.getElementById("scenarioShareEmailInput")?.value || "";
    if(pendingShareEmail.trim() && !addShareEmailsToScope("scenario", pendingShareEmail)) return;
    saveWorkbenchToCaseSteps(aCase);
    const toRun = aCase.giSteps?.filter(s => (aCase.stepStates||{})[s.id] !== "done") || [];
    const scenarioRunItems = scenarioItems.filter(s => toRun.some(r => r.id === s.id));
    if(!ensureMailShareRecipients(scenarioRunItems)) return;
    if(!ensureDirectUrlTargets(scenarioRunItems)) return;
    if(toRun.length) drugStreamSteps(aCase, toRun);
  };
  document.getElementById("scenarioRunButton")?.addEventListener("click", runDrugScenarioAll);
  document.getElementById("scenarioRunAllButton")?.addEventListener("click", runDrugScenarioAll);

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

/* 헤더 [전체 시나리오 수행] 버튼의 진행 상태 표시 — 관세조사·관세수사·마약수사 워크벤치 공용.
   실행 중에는 버튼 자체가 스피너 + "수행 중… N/M"이 되고, 종료 시 원래 라벨로 복원한다.
   버튼이 없는 레이아웃(리뷰 모드 등)에서도 안전하도록 null-safe. */
function runAllProgressControl(){
  const button = document.getElementById("scenarioRunAllButton");
  const idleLabel = button ? (button.dataset.idleLabel || button.innerHTML) : "";
  if(button) button.dataset.idleLabel = idleLabel;
  return {
    setProgress(done, total){
      if(!button) return;
      button.disabled = true;
      button.classList.add("running");
      button.innerHTML = `<span class="home-running-dot"></span> 수행 중… ${done}/${total}`;
    },
    reset(){
      if(!button) return;
      button.classList.remove("running");
      button.disabled = false;
      button.innerHTML = idleLabel;
    },
  };
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
  const firstLockedIndex = candidateItems.findIndex(item => !scenarioItemHasPermission(item));
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
    stepOutputs[item.id] = `권한이 없어 실행되지 않았습니다. (${permissionLabel(scenarioItemPermissionStatus(item))})`;
  });

  const priorCompleted = scenarioItems.slice(0, runStartIndex).filter(item => stepStatuses[item.id] === "완료").length;
  let completed = priorCompleted;
  // 리뷰 모드(분석 시나리오 확인 및 설정)에서는 하단 실행 버튼(scenarioRunButton)이 렌더되지 않으므로
  // null-safe 헬퍼로 활성/비활성만 반영한다(헤더 [전체 시나리오 수행]만으로도 실행 가능).
  const runButton = document.getElementById("scenarioRunButton");
  // 헤더 [전체 시나리오 수행] — 실행 중에는 버튼 자체에 진행 상태(스피너·N/M)를 표시한다.
  const { setProgress: setRunAllProgress, reset: resetRunAll } = runAllProgressControl();
  const setRunDisabled = value => {
    if(runButton) runButton.disabled = value;
    if(value) setRunAllProgress(completed, scenarioItems.length);
    else resetRunAll();
  };
  setRunDisabled(true);
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

  scenarioEventSource = openRunEventStream(url, {
  onWorkflow(data){
    if(data.status === "completed"){
      setScenarioStatus("완료");
      saveRunArchive(companyId);
      updateCanvasJobStatus(companyId, { label:"완료", done:scenarioItems.length - skippedItems.length, total:scenarioItems.length, pct:skippedItems.length ? Math.round(((scenarioItems.length - skippedItems.length) / scenarioItems.length) * 100) : 100, tone:"done" });
      setRunDisabled(false);
    }
    if(data.status === "failed"){
      console.error(`[시나리오 실행] 워크플로 실패 — 대상 ${companyId}` + (data.error ? `\n${data.error}` : " (직전 단계 오류 참조)"));
      setScenarioStatus("실패");
      updateCanvasJobStatus(companyId, { label:"오류", done:completed, total:scenarioItems.length, pct:scenarioItems.length ? Math.round((completed / scenarioItems.length) * 100) : 0, tone:"review" });
      setRunDisabled(false);
    }
  },

  onStep(data){
    const runIndex = runnableItems.findIndex((item, itemIndex) => data.key === `${item.type}_agent_${itemIndex + 1}` || data.label === item.label);
    const index = runIndex >= 0 ? scenarioItems.findIndex(item => item.id === runnableItems[runIndex].id) : scenarioItems.findIndex(item => data.label === item.label);
    const item = index >= 0 ? scenarioItems[index] : null;
    if(!item) return;
    if(data.status === "running"){
      stepStatuses[item.id] = "실행 중";
      openedSteps.add(item.id);
      // 전체 시나리오 수행: 현재 실행 중인 AI 서비스를 선택 상태로 바꿔 좌측 상세설정·우측 결과를 따라가게 한다.
      selectedScenarioId = item.id;
      renderScenarioList();
      syncScenarioEditor();
    }
    if(data.status === "done"){
      completed += 1;
      stepStatuses[item.id] = "완료";
      stepOutputs[item.id] = data.output || "결과 없음";
      openedSteps.add(item.id);
      // 완료 단계의 결과가 즉시 보이도록 선택을 해당 단계로 유지(다음 단계 실행 시 자동 이동).
      selectedScenarioId = item.id;
      updateScenarioProgress(completed);
      setRunAllProgress(completed, scenarioItems.length);   // 버튼 진행 표시 갱신
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
      // 서버가 전달한 실제 에러 원문을 콘솔 로그 + 결과 패널에 모두 남긴다(진단용).
      console.error(`[시나리오 실행] 단계 오류 — ${item.label}\n${data.error || "(상세 없음)"}`);
      stepStatuses[item.id] = "오류";
      stepOutputs[item.id] = `❗ 실행 오류 — ${item.label}\n\n${data.error || "오류가 발생했습니다.(서버가 상세 사유를 반환하지 않음)"}`;
      openedSteps.add(item.id);
      setScenarioStatus("오류");
      updateCanvasJobStatus(companyId, { label:"오류", done:completed, total:scenarioItems.length, pct:scenarioItems.length ? Math.round((completed / scenarioItems.length) * 100) : 0, tone:"review" });
      setRunDisabled(false);
      scenarioEventSource.close();
      saveIntermediateResults(companyId);
      renderScenarioList();
    }
    renderScenarioSteps();
  },

  onDisconnect(info, ev){
    // 정상 종료(완료/실패/단계오류 close)는 래퍼가 걸러내므로 여기는 예기치 않은 연결 끊김이다.
    const endpoint = String(url).split("?")[0];
    const detail = `엔드포인트: ${endpoint} · 연결상태: ${info.readyState}(${info.connecting ? "연결 안 됨" : "종료"})`;
    console.error(`[시나리오 실행] 서버 연결 오류 — ${info.reason}\n${detail}`, ev);
    setScenarioStatus(info.connecting ? "서버 연결 실패" : "연결 종료");
    // 실행 중이던 단계는 오류로, 아직 시작 전이면 첫 실행대상 단계에 사유를 표시(서버 미실행 등).
    const msg = `❗ ${info.reason}\n\n${detail}\n\n서버 상태(실행 여부·콘솔 로그)를 확인한 뒤 다시 실행하세요.`;
    let marked = false;
    Object.entries(stepStatuses).forEach(([id, status]) => {
      if(status === "실행 중" || status === "실행중"){ stepStatuses[id] = "오류"; stepOutputs[id] = msg; marked = true; }
    });
    if(!marked && runnableItems[0]){
      stepStatuses[runnableItems[0].id] = "오류";
      stepOutputs[runnableItems[0].id] = msg;
      openedSteps.add(runnableItems[0].id);
      selectedScenarioId = runnableItems[0].id;
    }
    setRunDisabled(false);
    renderScenarioList();
    renderScenarioSteps();
  },
  });
}

/* 선택한 AI 서비스 한 단계만 별도로 실행 (단계별 자동실행과는 별도의 SSE 연결 사용) */
function runSingleScenarioItem(item, onDone = null){
  // onDone: 완료·중단 여부와 관계없이 1회 호출 — 단계별 순차 실행(ciRunStage)의 대기 지점
  let doneCalled = false;
  const done = () => { if(!doneCalled){ doneCalled = true; try{ onDone?.(); }catch(e){ /* noop */ } } };
  if(!item){ done(); return; }
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 분석할 수 있습니다.");
    done(); return;
  }
  const companyId = activeCanvasCompanyId;
  if(!companyId){
    alert("분석 대상 기업을 선택하세요.");
    done(); return;
  }
  if(!scenarioItemHasPermission(item)){
    alert(`이 AI 서비스를 실행할 권한이 없습니다. (${permissionLabel(scenarioItemPermissionStatus(item))})`);
    done(); return;
  }
  const resumeSingle = () => runSingleScenarioItem(item);
  if(!ensureMailShareRecipients([item], resumeSingle)){ done(); return; }
  if(!ensureDirectUrlTargets([item], resumeSingle)){ done(); return; }

  if(scenarioSingleEventSource){ try{ scenarioSingleEventSource.close(); }catch(e){} scenarioSingleEventSource = null; }

  const runButton = document.getElementById("scenarioRunSelectedButton")
    || document.getElementById("scenarioReviewRunButton");
  if(runButton) runButton.disabled = true;
  stepStatuses[item.id] = "실행 중";
  openedSteps.add(item.id);
  renderScenarioList();
  renderScenarioSteps();

  // previous_step_outputs(이전 단계 전체 결과)가 페이로드에 실려 GET URL이 http.server의
  // 요청라인 한도(64KB)를 넘을 수 있으므로 EventSource 대신 POST fetch 스트리밍으로 실행한다.
  const controller = new AbortController();
  scenarioSingleEventSource = { close(){ try{ controller.abort(); }catch(e){} } };

  const finish = () => {
    if(scenarioSingleEventSource){ scenarioSingleEventSource.close(); scenarioSingleEventSource = null; }
    if(runButton) runButton.disabled = !selectedScenarioItem();
  };

  const handleStep = data => {
    if(data.status === "running"){
      stepStatuses[item.id] = "실행 중";
      renderScenarioList();
    }
    if(data.status === "done"){
      stepStatuses[item.id] = "완료";
      stepOutputs[item.id] = data.output || "결과 없음";
      applyReportStepOutput(item, data.output);   // 보고서/검증 서비스 결과 → 분석 보고서 및 검증 탭 반영
      openedSteps.add(item.id);
      saveIntermediateResults(companyId);
      renderScenarioList();
      renderScenarioSteps();
    }
    if(data.status === "error"){
      console.error(`[AI서비스 실행] 단계 오류 — ${item.label}\n${data.error || "(상세 없음)"}`);
      stepStatuses[item.id] = "오류";
      stepOutputs[item.id] = `❗ 실행 오류 — ${item.label}\n\n${data.error || "오류가 발생했습니다.(서버가 상세 사유를 반환하지 않음)"}`;
      openedSteps.add(item.id);
      saveIntermediateResults(companyId);
      renderScenarioList();
      renderScenarioSteps();
    }
  };

  (async () => {
    try{
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, scenario: scenarioPayload([item]) }),
        signal: controller.signal,
      });
      if(!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      // 서버는 keep-alive SSE라 workflow 종료 이벤트 수신 즉시 reader를 닫아야 한다
      // (readSseResponse: onEvent가 false를 반환하면 취소 후 종료)
      await readSseResponse(res, (eventName, data) => {
        if(eventName === "step") handleStep(data);
        if(eventName === "workflow" && (data.status === "completed" || data.status === "failed")) return false;
      }, { swallowReadErrors: false });
    }catch(err){
      // 의도적 중단(abort: 새 실행/이탈)은 오류로 표시하지 않는다.
      const aborted = err && (err.name === "AbortError" || /abort/i.test(String(err.message || "")));
      if(!aborted && stepStatuses[item.id] === "실행 중"){
        const msg = String((err && err.message) || err);
        const connFail = /Failed to fetch|NetworkError|ERR_|load failed/i.test(msg);
        const reason = connFail
          ? "서버에 연결하지 못했습니다 (서버 미실행·중단 또는 네트워크 오류)."
          : `서버 실행 중 오류가 발생했습니다 (${msg}).`;
        console.error(`[AI서비스 실행] 연결/실행 오류 — ${item.label}\n${reason}\n원문: ${msg}`, err);
        stepStatuses[item.id] = "오류";
        stepOutputs[item.id] = `❗ ${reason}\n\n엔드포인트: /api/run\n원문: ${msg}\n\n서버 상태(실행 여부·콘솔 로그)를 확인한 뒤 다시 실행하세요.`;
        renderScenarioList();
        renderScenarioSteps();
      }
    }finally{
      finish();
      done();
    }
  })();
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

export function render(page="home"){
  // AI Agentic 서비스는 부서 관리자 전용 — 비관리자는 My AI 분석으로 폴백
  if(page === "agentic" && !isCurrentUserAdmin()) page = "home";
  currentPage = page;
  const pageTemplate = analysisTemplateForPage(page);
  addWorkTab(page);
  document.querySelectorAll(".nav-item,.my-analysis,.work-tab,.quick-card,.tb-platform-pill").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(`[data-page="${page}"]`).forEach(b=>b.classList.add("active"));
  const contentEl = document.getElementById("content");
  const fillPage = page === "agentic" ||
                   (page === "canvas" && canvasTab === "report") ||
                   // 업무영역 별도 사이트: 좌측 AI 채팅 패널 풀 높이 유지
                   page === "dumping" || page === "taxhelp" ||
                   (isStandalonePlatform() && isPlatformShellPage(page)) ||
                   // 관세조사: 모든 서브탭을 시나리오/관계분석과 동일한 전체 프레임으로 통일
                   (page === "investigation" || pageTemplate === "customs") ||
                   // 관세수사: 모든 서브탭을 관세조사와 동일한 전체 프레임으로 통일
                   (page === "generalinv" || pageTemplate === "general-investigation") ||
                   (isSpecialInvestigationPage(page) && (specialInvestigationState.drugInvTab === "scenario" || specialInvestigationState.drugInvTab === "network" || specialInvestigationState.drugInvTab === "forensic" || specialInvestigationState.drugInvTab === "report"));
  contentEl.classList.toggle("content-fill", fillPage);
  contentEl.innerHTML = pages[page] ? pages[page]() : (customAnalysisPage(page) || pages.home());
  // 업무영역 별도 사이트(조사관·수사관·보고서) — 좌측 AI 채팅 패널 바인딩
  if(isPlatformShellPage(page)){
    initInvCopilot({ userId: currentUserId, companyId: activeCanvasCompanyId || "" });
  }
  if(page === "home" || page === "case"){
    // 국제정보 분석(case)은 My AI 분석과 동일 구성 — 같은 코칭/실행 초기화 사용
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    emitHook("home-render");   // 홈 컴포저/코치/셸 초기화 — 포털(home-runtime)에서만 구독
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
    // 수사정보 분석 탭 — Chat 스레드 바인딩(렌더 후)
    if(generalInvestigationState.generalInvTab === "insight"){
      bindGiInsightChat(genDeps);
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
    // 수사정보 분석 탭 — Chat 스레드·정보카드 바인딩(렌더 후)
    if(customsState.investigationTab === "insight"){
      bindCiInsightChat(customsDeps);
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

/* 홈 컴포저 입력/카드/코치 리스너 — pages/home-runtime.js로 이동 */

document.addEventListener("change", (event) => {

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
      // 즉시 서버에 영속화 — 다른 PC/세션에서도 동일하게 동작하도록 단일 저장소(서버)에 반영
      saveScenarioBuilderState({
        ...scenarioBuilderConfig,
        analysisScenarios: {
          ...scenarioBuilderConfig.analysisScenarios,
          [page]: { ...scenario, defaultTab: event.target.value },
        },
      });
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
  updateGiStageDoc,   // 수사보고서 관리 [등록] — 증거요청/결과 보고서 수정 저장
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
    const v = scenarioBuilderViewButton.dataset.scenarioBuilderView;
    scenarioBuilderViewTab = (v === "services" || v === "rags") ? v : "subtabs";
    render("scenarioBuilder");
    return;
  }
  // 업무특화 RAG 관리: 유효기간 조정 / 사용중지·재개 / 삭제
  const ragAdminVal = event.target.closest("[data-rag-admin-validity]");
  if(ragAdminVal){
    if(!isCurrentUserSuperAdmin()) return;
    const [id, v] = ragAdminVal.dataset.ragAdminValidity.split("::");
    adminSetRagValidity(id, v);
    return;
  }
  const ragAdminToggle = event.target.closest("[data-rag-admin-toggle]");
  if(ragAdminToggle){
    if(!isCurrentUserSuperAdmin()) return;
    adminToggleRagStatus(ragAdminToggle.dataset.ragAdminToggle);
    return;
  }
  const ragAdminDel = event.target.closest("[data-rag-admin-delete]");
  if(ragAdminDel){
    if(!isCurrentUserSuperAdmin()) return;
    const f = findRagById(ragAdminDel.dataset.ragAdminDelete);
    if(f && confirm(`"${f.rag.name}" 업무특화 RAG를 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.`)) adminDeleteRag(ragAdminDel.dataset.ragAdminDelete);
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
    // 즉시 서버에 영속화 — 다른 PC/세션에서도 저장된 구성대로 동작
    saveScenarioBuilderState({
      ...scenarioBuilderConfig,
      analysisScenarios: {
        ...scenarioBuilderConfig.analysisScenarios,
        [page]: { ...scenario, enabledSubtabs: enabled },
      },
    });
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
    // 즉시 서버에 영속화 — 순서 변경도 다른 PC/세션에 반영
    saveScenarioBuilderState({
      ...scenarioBuilderConfig,
      analysisScenarios: {
        ...scenarioBuilderConfig.analysisScenarios,
        [page]: { ...scenario, enabledSubtabs: enabled },
      },
    });
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

  /* ── 기초자료 파일 등록 팝업 열기 ── */
  const uploadOpen = event.target.closest("[data-upload-open]");
  if(uploadOpen){
    openUploadPopupFor(uploadOpen.dataset.uploadSubject || "");
    return;
  }
  // 기초자료 업로드 행 삭제
  const uploadDel = event.target.closest("[data-upload-delete]");
  if(uploadDel){
    const rec = (uploadedFilesByCompany[activeCanvasCompanyId] || []).find(r => r.id === uploadDel.dataset.uploadDelete);
    if(rec && confirm(`"${rec.name}" 업로드를 삭제하시겠습니까?`)) deleteUploadedFile(uploadDel.dataset.uploadDelete);
    return;
  }
  /* ── 보고서 워크벤치: 보고서 생성 / 보고서 검증 ── */
  if(event.target.closest("#wbReportGenBtn")){ wbGenerateReport(); return; }
  if(event.target.closest("#wbReportValidateBtn")){ wbValidateReport(); return; }

  /* ── 분석 템플릿 패널 접기/펼치기 (재렌더 없이 표시만 토글) ── */
  const tplToggle = event.target.closest("#scenarioTemplateToggle");
  if(tplToggle){
    scenarioTemplateZoneOpen = !scenarioTemplateZoneOpen;
    const controls = tplToggle.parentElement?.querySelector(".scenario-template-controls");
    if(controls) controls.style.display = scenarioTemplateZoneOpen ? "" : "none";
    tplToggle.parentElement?.classList.toggle("open", scenarioTemplateZoneOpen);
    tplToggle.innerHTML = `🧩 분석 템플릿 ${scenarioTemplateZoneOpen ? "▴" : "▾"}`;
    tplToggle.title = `분석 템플릿 패널 ${scenarioTemplateZoneOpen ? "닫기" : "열기"}`;
    return;
  }

  /* ── AI 서비스 패널 접기/펼치기 (분석 템플릿과 동일 패턴) ── */
  const svcToggle = event.target.closest("#scenarioServiceToggle");
  if(svcToggle){
    scenarioServiceZoneOpen = !scenarioServiceZoneOpen;
    const controls = svcToggle.parentElement?.querySelector(".scenario-service-controls");
    if(controls) controls.style.display = scenarioServiceZoneOpen ? "" : "none";
    svcToggle.parentElement?.classList.toggle("open", scenarioServiceZoneOpen);
    svcToggle.innerHTML = `🤖 AI 서비스 ${scenarioServiceZoneOpen ? "▴" : "▾"}`;
    svcToggle.title = `AI 서비스 패널 ${scenarioServiceZoneOpen ? "닫기" : "열기"}`;
    return;
  }

  /* ── 기초자료 데이터 소스 추가 팝업 열기 ── */
  const srcOpen = event.target.closest("[data-source-open]");
  if(srcOpen){
    openSourceAddPopupFor(srcOpen.dataset.uploadSubject || "");
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
  const agDelSvc = event.target.closest("[data-agentic-delete-service]");
  if(agDelSvc){
    if(!isCurrentUserAdmin()) return;
    const store = agenticGroupStore();
    const serviceId = agDelSvc.dataset.agenticDeleteService;
    const svc = store.services.find(s => s.id === serviceId);
    if(!svc) return;
    if(!confirm(`"${svc.name}" 서비스를 삭제하시겠습니까?\n삭제한 서비스와 흐름은 복구할 수 없습니다.`)) return;
    store.services = store.services.filter(s => s.id !== serviceId);
    // 활성 서비스를 지웠으면 남은 첫 서비스로 전환(없으면 null)
    if(store.activeServiceId === serviceId){
      store.activeServiceId = store.services[0] ? store.services[0].id : null;
    }
    saveCanvasState();
    render("agentic");   // 목록·캔버스 재마운트
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
    // 관세조사: 4단계 스테이지 편집기에 로드(편집 불가 템플릿은 사본으로)
    if(domain === "customs" && document.getElementById("tplStageEditor")){
      const editable = canEditTemplate(template);
      tplStageLoad(template, { copyName: editable ? "" : `${template.name} 사본` });
      if(!editable) tplStage.id = null;   // 사본 저장(신규 커스텀)
      tplStageRender();
      document.getElementById("tplStageEditor")?.scrollIntoView({ block: "nearest" });
      return;
    }
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
    render(currentPage);
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
    if(tplStage?.id === templateId) tplStage = null;
    saveTemplatesState();
    saveCanvasState();
    templateEditorInitialized = false;
    render(currentPage);
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

  const ragFillPromptBtn = event.target.closest("[data-rag-fill-prompt]");
  if(ragFillPromptBtn){
    fillScenarioRagPrompt();
    return;
  }

  /* 홈 컴포저/코치 클릭 핸들러 — pages/home-runtime.js로 이동 */

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

  const canvasJobDel = event.target.closest("[data-canvas-job-del]");
  if(canvasJobDel){
    event.stopPropagation();
    const jobId = canvasJobDel.dataset.canvasJobDel;
    const page = canvasJobDel.dataset.canvasJobPage || "investigation";
    const card = canvasJobDel.closest("[data-analysis-job]");
    const title = card?.querySelector("h3")?.textContent?.trim() || "이 작업";
    if(window.confirm(`'${title}'을(를) 내 캔버스에서 삭제할까요?`)){
      deleteCanvasJobForCurrentUser(jobId, page);
      render(currentPage === "canvas" ? "canvas" : "home");
    }
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
    // 모든 진입 경로(카드형 버튼·My AI 하단 바로가기·좌측 사이드바 메뉴 등)에서
    // 분석 페이지로 들어올 때는 항시 관리자 업무시나리오의 기본 진입 탭으로 리셋한다.
    {
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
  /* ── AI Agentic 분기 유형 프리셋(승인/반려·정상/비정상 등) ── */
  if(event.target.matches("[data-agentic-branch-preset]")){
    if(agenticFlow && agenticSelectedNodeId != null){
      const opt = event.target.selectedOptions[0];
      const raw = opt?.dataset?.labels;   // "승인|반려" (custom은 없음)
      if(raw) agenticFlow.updateNodeData(agenticSelectedNodeId, { outLabels: raw.split("|") });
      renderAgenticInspector();   // 프리셋 반영해 분기 이름 입력칸 갱신
    }
    return;
  }
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
  // 분기/반복 출력 라벨(분기 이름) 편집 — 포커스 유지 위해 인스펙터 재렌더 없이 데이터·포트라벨만 갱신
  const agOutIdx = event.target.dataset?.agenticOutlabel;
  if(agOutIdx != null && event.target.matches("input")){
    if(agenticFlow && agenticSelectedNodeId != null){
      const node = agenticFlow.getNodeData(agenticSelectedNodeId);
      const labels = Array.isArray(node?.outLabels)
        ? [...node.outLabels]
        : (node?._outputs ? node._outputs.map(o => o.label) : []);
      labels[Number(agOutIdx)] = event.target.value;
      agenticFlow.updateNodeData(agenticSelectedNodeId, { outLabels: labels });
    }
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
// 상단 메뉴 관리자 버튼 — 슈퍼관리자는 업무시나리오 구성, 부서 관리자는 시스템 관리로 진입
document.getElementById("tbAdminBtn")?.addEventListener("click", () => {
  if(isCurrentUserSuperAdmin()){ render("scenarioBuilder"); return; }
  if(isCurrentUserAdmin()) render("system");
});

// 관세행정 Copilot 새 창 실행 — 화면 가로 30% 폭 · 최대 높이(기간계 호출과 동일한 방식)
document.getElementById("copilotOpenBtn")?.addEventListener("click", () => {
  const w = Math.max(420, Math.round(screen.availWidth * 0.3));
  const h = screen.availHeight;
  window.open(`${location.origin}/?copilot=1`, "kcsCopilot",
    `width=${w},height=${h},left=${screen.availWidth - w},top=0,resizable=yes`);
});

/* 기초자료 데이터 소스 추가 패널: 파일 드래그 앤 드롭(NotebookLM식) —
   드롭하면 파일 등록 팝업이 열리고 드롭존 없이 바로 속성 분석이 시작된다. */
document.addEventListener("dragover", (event) => {
  const zone = event.target.closest?.("[data-source-drop]");
  if(!zone || ![...(event.dataTransfer?.types || [])].includes("Files")) return;
  event.preventDefault();
  zone.classList.add("dragging");
});
document.addEventListener("dragleave", (event) => {
  const zone = event.target.closest?.("[data-source-drop]");
  if(zone && !zone.contains(event.relatedTarget)) zone.classList.remove("dragging");
});
document.addEventListener("drop", (event) => {
  const zone = event.target.closest?.("[data-source-drop]");
  if(!zone) return;
  event.preventDefault();
  zone.classList.remove("dragging");
  const files = event.dataTransfer?.files ? [...event.dataTransfer.files] : [];
  if(files.length) openUploadPopupFor(zone.dataset.uploadSubject || "", files);
});

document.addEventListener("keydown", (event) => {
  if(event.key !== "Enter") return;
  // 프롬프트 입력창: Enter → 실행. Shift+Enter는 줄바꿈, 한글 IME 조합 중에는 무시.
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
    setUserPermissions(buildGroupPermissions(initGroup));
  }
  renderSidebarPermissions();
  syncSidebarCollapseIcons();
  updateProfileDisplay();
  updateAdminMenuVisibility();
  if(isCopilotMode) applyCopilotChrome();
  // 업무영역 별도 사이트(조사관·수사관·보고서)는 각자의 기본 페이지로 바로 부팅
  render(isStandalonePlatform() ? platformBootPage() : "home");
})();
