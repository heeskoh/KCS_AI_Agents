/**
 * analysis/shared/network-graph.js
 *
 * 수사 프로파일 우측 관계망 그래프 패널.
 * Neo4j 그래프 API(/api/graph/person, /api/graph/company)를 호출해
 * 대상(기업/우범자) 중심의 관계망을 Cytoscape.js 로 그린다.
 * (Cytoscape 로드 실패 시 자체 SVG 렌더러로 폴백)
 *
 * 필터 기능:
 *  - 유형 칩: 노드 유형별 표시/숨김 토글
 *  - 필터 조건 등록(하단 표 영역): 조건을 여러 개 등록해 조합(합집합) 표시
 *      조건 = 기준 노드(다중) + 연결 대상 유형 + 관계 유형
 *      예) [사건1·사건2 → 국가]  : 두 사건과 연결된 국가만 표시
 *          [국가 → 사건]         : 해당 국가와 관련된 사건 표시
 *          [사건1 → 전체]        : 특정 사건의 모든 관계 표시
 *      등록된 조건은 목록에서 개별 on/off·삭제 가능
 *  - 그래프의 노드를 직접 클릭하면 작성 중인 조건의 기준 노드로 추가/해제(즉시 미리보기)
 *  - 하단 표: 현재 표시 중인 관계(엣지) 목록
 */
import { escapeHtml } from "../../core/dom.js";

/* 노드 라벨별 색상 */
const NODE_COLORS = {
  Person:        "#7c3aed",
  Company:       "#2563eb",
  Declaration:   "#0ea5e9",
  Country:       "#16a34a",
  Case:          "#dc2626",
  SmugglingCase: "#dc2626",
  Org:           "#d97706",
  Organization:  "#d97706",
  Evidence:      "#0f766e",
  RiskIndicator: "#ca8a04",
  RiskScore:     "#ca8a04",
  AnalysisResult:"#64748b",
  Agent:         "#0d9488",
  Broker:        "#9333ea",
  HsCode:        "#0891b2",
  Item:          "#65a30d",
  Industry:      "#a16207",
  Region:        "#475569",
  RelatedCompany:"#1d4ed8",
  OverseasSupplier:"#0369a1",
  RelatedParty:  "#be123c",
  AffiliatedCompany:"#1d4ed8",
  CaseType:      "#dc2626",
  // 2026 관계망 재정의: 품목분류(8자리)·종합위험값·위험요인
  ItemClass:     "#0891b2",
  RiskFactor:    "#b91c1c",
  Phone:         "#e11d48",
  Account:       "#0d9488",
  Place:         "#7c3aed",
  Vehicle:       "#b45309",
  Entity:        "#0891b2",
  DeparturePort: "#0d9488",
  ArrivalPort:   "#c2410c",
};
const NODE_LABEL_KO = {
  Person: "인물", Company: "기업", Declaration: "수입신고",
  Country: "국가", Case: "사건", SmugglingCase: "사건",
  Org: "조직", Organization: "조직", Evidence: "증거",
  RiskIndicator: "위험지표", RiskScore: "종합위험값", AnalysisResult: "분석이력", Agent: "AI 분석서비스",
  Broker: "관세사", HsCode: "HS코드", Item: "품목",
  Industry: "업종", Region: "지역", RelatedCompany: "관계사",
  OverseasSupplier: "해외거래처", RelatedParty: "특수관계인", AffiliatedCompany: "관계사",
  CaseType: "사건유형",
  ItemClass: "품목분류", RiskFactor: "위험요인",
  Phone: "전화번호", Account: "계좌", Place: "장소", Vehicle: "차량", Entity: "대상",
  DeparturePort: "출발항", ArrivalPort: "도착항",
};

function nodeColor(label){
  return NODE_COLORS[label] || "#64748b";
}
function nodeLabelKo(label){
  return NODE_LABEL_KO[label] || label;
}

/* 노드 유형 → 도형. 박스=기업/사람/거래처/관세사, 육각형=품목, 삼각형=항만/지역, 그 외=원. */
const NODE_SHAPE = {
  Company: "round-rectangle", Person: "round-rectangle", OverseasSupplier: "round-rectangle",
  Broker: "round-rectangle", AffiliatedCompany: "round-rectangle", RelatedCompany: "round-rectangle",
  RelatedParty: "round-rectangle", Organization: "round-rectangle", Org: "round-rectangle",
  ItemClass: "hexagon", Item: "hexagon", HsCode: "hexagon",
  DeparturePort: "triangle", ArrivalPort: "triangle", Country: "triangle", Region: "triangle", Place: "triangle",
};
function nodeShape(label){ return NODE_SHAPE[label] || "ellipse"; }

/* 도형 테두리(라인) 색 — 노드 색을 어둡게 하여 아이템별로 구분되게 한다. */
function darken(hex, f = 0.6){
  const h = String(hex || "#64748b").replace("#", "");
  if(h.length < 6) return "#475569";
  const c = i => Math.round(parseInt(h.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0");
  return `#${c(0)}${c(2)}${c(4)}`;
}
/* 도형 채움 색 — 노드 색을 흰색과 섞어 파스텔톤으로(라인은 darken으로 진하게 유지). */
function pastel(hex, f = 0.6){
  const h = String(hex || "#64748b").replace("#", "");
  if(h.length < 6) return "#e2e8f0";
  const c = i => {
    const v = parseInt(h.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * f).toString(16).padStart(2, "0");
  };
  return `#${c(0)}${c(2)}${c(4)}`;
}

/* 관계(엣지) 유형 한국어 라벨 — 엔티티 중심 모델에서 사건/수입 등 이벤트는 엣지로 표현된다.
   NETWORK_EDGE 는 relation_type 속성(예: 송금관계)이 더 구체적이므로 우선 사용. */
const REL_LABEL_KO = {
  CASE_FROM: "사건·원산지", CASE_VIA: "사건·경유", CASE_TO: "사건·도착지", CASE_LINK: "동일사건 연루",
  INVOLVED_IN: "사건연루(역할)",
  IMPORTED: "수입신고", SUPPLIES_TO: "공급", EXPORTS_TO: "수출",
  USES_BROKER: "관세사", HAS_RELATED_COMPANY: "관계사", RELATED_TO: "특수관계",
  // 2026 관계망 재구성 (기업 수입 그래프 5종 엣지)
  SUPPLIED_BY: "해외거래처(공급)", RELATED_PARTY: "특수관계", DECLARES_ITEM: "품목(10자리)",
  TRADES_WITH_COUNTRY: "수입/출국", AFFILIATED_WITH: "관계사", CASE: "사건",
  DEPARTS_FROM: "출발항", ARRIVES_AT: "도착항",
  // 2026 관계망 재정의: 수입통관 체인 + 위험/분석
  PORT_ROUTE: "출발→도착", VIA_SUPPLIER: "도착→거래처",
  RISK_INDICATORS: "오류지표", DRIVEN_BY: "위험요인", ANALYZED: "분석결과", USES_BROKER: "관세사",
  // 2026 수입신고 허브 모델
  FILED: "신고", OF_ITEM: "품목분류", FROM_PORT: "출발항", TO_PORT: "도착항",
  FILED_BY: "관세사", CONTRIBUTES_TO: "위험기여",
  NETWORK_EDGE: "인적관계", RESIDES_IN: "거주", LOCATED_IN: "소재",
  // 증거물 엣지 (압수 통신·금융기록)
  COMMUNICATED_WITH: "통신(증거)", FUNDS_FLOW: "자금흐름(증거)",
};
/* 파생 뷰 엣지의 짧은 유형 명칭 — 조립 라벨이 길 때 그래프에는 이것만 표시 */
const REL_SHORT_KO = {
  FILED: "수입신고", SUPPLIED_BY: "해외거래처", FILED_BY: "관세사",
  ROUTE: "운송경로", CONTRIBUTES_TO: "위험기여", DRIVEN_BY: "위험지표",
};
const EDGE_LABEL_MAX = 20;
function relLabelKo(type, props){
  // 파생 뷰(4-뷰)가 조립한 엣지 라벨(품목·항만·국가·담당자 등)이 있으면 우선 사용.
  // 내용이 길면 유형 명칭(+건수)만 그래프에 표시하고 상세는 엣지 클릭 상세창에서 확인한다.
  if(props && props.label_ko){
    const label = props.label_ko;
    if(label.length <= EDGE_LABEL_MAX) return label;
    const short = REL_SHORT_KO[type] || REL_LABEL_KO[type] || type;
    const count = Number(props.count);
    return Number.isFinite(count) && count > 1 ? `${short} ${count}건` : short;
  }
  if(type === "NETWORK_EDGE" && props && props.relation_type) return props.relation_type;
  // 관세사: 사무소는 노드, 담당 관세사는 엣지에 표시 (관세사 · 담당자명)
  if(type === "FILED_BY" && props && props.manager) return `관세사 · ${props.manager}`;
  return REL_LABEL_KO[type] || type;
}

/* 엣지 선 굵기 — 수입 신고 건수(count)에 비례. 건수 없으면 인적관계 가중치(weight) 사용. 기본 2 */
function edgeWidth(props){
  const c = Number(props && props.count);
  if(Number.isFinite(c) && c > 0) return Math.max(1.5, Math.min(11, 1.2 + c * 1.4));
  const w = Number(props && props.weight);
  if(Number.isFinite(w) && w > 0) return Math.max(1.5, Math.min(8, 1.5 + w * 5));
  return 2;
}

/* 그래프 데이터 캐시 + 패널별 필터 상태 */
const _graphCache = new Map();
const _loading = new Set();
/* key → {
     hiddenLabels:Set,
     draft: { focusIds:Set, targetLabel:string, relType:string },   // 작성 중인 조건(즉시 미리보기)
     conditions: [{ id, focusIds:string[], targetLabel, relType, enabled }],  // 등록된 조건들(합집합)
     condSeq: number
   } */
const _filterState = new Map();

function emptyDraft(){
  return { focusIds: new Set(), targetLabel: "", relType: "" };
}
function emptyState(){
  return {
    hiddenLabels: new Set(), draft: emptyDraft(), conditions: [], condSeq: 0,
    searchTerm: "",                    // A1: 노드 검색어
    pathSrc: "", pathTgt: "",          // B1: 경로 탐색 출발/도착 노드 id
    pathResult: null,                  // B1: 경로 API 응답 {nodes,edges,source,target,found}
    hops: 1,                           // 데이터소스: 이웃 확장 단계(1~3)
    fileNodes: [], fileEdges: [],      // 파일 등록으로 병합된 노드/엣지
    fileSources: [],                   // 등록된 파일/추출 출처 라벨 목록
    uploadSessionId: "",               // 비정형 파일 업로드 세션
    evidencePersonId: "",              // 통신/거래내역 등록 대상 인물ID
    evidenceKind: "communication",     // communication | financial
    evidenceResult: null,              // 최근 등록 결과 메시지
    analysisMode: "", analysisSel: [], // 분석 기법: ""|common|centrality|cluster|shared_hub, 선택 노드
    analysisResult: null,              // 분석 산출물(메시지/하이라이트 대상)
    scenarioName: "",                  // 등록할 시나리오 이름(작성 중)
    activeScenarioId: "",              // 선택/적용된 시나리오 id
    _autorun: null,                    // 시나리오 적용 후 자동 실행할 분석 모드
    viewMode: "decl",                  // 프로파일 4-뷰: decl(수입신고)|item(품목)|riskcause(위험원인)|route(경로)
    manualPositions: {},               // 정렬·드래그로 옮긴 노드 위치(뷰별 id→{x,y}, 재렌더 유지)
    alignBarOn: false,                  // 정렬 툴바 고정 표시 여부(off라도 2개 이상 선택 시 자동 표시)
    hiddenIds: new Set(),              // 속성창에서 숨김 처리한 노드 id(개별 숨기기/보이기 토글)
    domain: "",                        // 수사 도메인 필터: ""|drug|forex|general (우범자 그래프)
    // 자유 관계분석(explore 탭): 다중 시드 + 속성 필터
    explore: false,                    // explore 워크벤치 여부
    seedCompanies: [],                 // [{id, name}]
    seedPersons: [],                   // [{id, name}]
    filterRegion: "", filterRiskLevel: "", filterIndustry: "",
  };
}
function filterStateFor(key){
  if(!_filterState.has(key)) _filterState.set(key, emptyState());
  return _filterState.get(key);
}

/* 현재 뷰의 수동 노드 위치 맵(정렬·드래그 결과). 뷰별로 레이아웃이 달라 분리 저장. */
function manualPosFor(state){
  if(!state.manualPositions) state.manualPositions = {};
  const v = state.viewMode || "decl";
  if(!state.manualPositions[v]) state.manualPositions[v] = {};
  return state.manualPositions[v];
}

function graphUrl(targetType, targetId, hops = 1){
  const h = `&hops=${encodeURIComponent(hops)}`;
  if(targetType === "explore"){
    // 자유 관계분석: 다중 시드 + 속성 필터로 교차 그래프 조회
    const st = filterStateFor(graphKey(targetType, targetId));
    const p = new URLSearchParams();
    if(st.seedCompanies.length) p.set("companies", st.seedCompanies.map(s => s.id).join(","));
    if(st.seedPersons.length) p.set("persons", st.seedPersons.map(s => s.id).join(","));
    if(st.filterRegion) p.set("region", st.filterRegion);
    if(st.filterRiskLevel) p.set("risk_level", st.filterRiskLevel);
    if(st.filterIndustry) p.set("industry", st.filterIndustry);
    return `/api/graph/explore?${p.toString()}`;
  }
  // 회사 프로파일: canonical 통합 그래프(수입신고 허브) — 4-뷰 프로젝션의 단일 소스
  if(targetType === "person"){
    const st = filterStateFor(graphKey(targetType, targetId));
    const dq = st.domain ? `&domain=${encodeURIComponent(st.domain)}` : "";
    return `/api/graph/person?person_id=${encodeURIComponent(targetId)}${h}${dq}`;
  }
  return `/api/graph/company_profile?company_id=${encodeURIComponent(targetId)}`;
}

/* 자유 관계분석 시드 선택용 엔티티 목록(1회 로드 후 캐시) */
let _entityCache = null;
let _entityLoading = false;
function loadEntities(onReady){
  if(_entityCache){ onReady && onReady(_entityCache); return; }
  if(_entityLoading) return;
  _entityLoading = true;
  Promise.all([
    fetch("/api/companies").then(r => r.json()).catch(() => ({})),
    fetch("/api/risk-persons").then(r => r.json()).catch(() => ({})),
  ]).then(([c, p]) => {
    _entityCache = {
      companies: Array.isArray(c) ? c : (c && c.companies) || [],
      persons: Array.isArray(p) ? p : (p && p.persons) || [],
    };
    _entityLoading = false;
    onReady && onReady(_entityCache);
  }).catch(() => { _entityLoading = false; });
}

function truncate(text, max = 10){
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function graphKey(targetType, targetId){
  return `${targetType}:${targetId}`;
}

function containerId(targetType, targetId){
  return `profileNetGraph_${targetType}_${String(targetId).replace(/[^\w-]/g, "_")}`;
}

/* ── Cytoscape.js 동적 로드 (CDN, 실패 시 SVG 폴백) ── */
const CYTOSCAPE_SRC = "https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js";
let _cyLoadPromise = null;
function loadCytoscape(){
  if(window.cytoscape) return Promise.resolve(window.cytoscape);
  if(_cyLoadPromise) return _cyLoadPromise;
  _cyLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CYTOSCAPE_SRC;
    script.onload = () => window.cytoscape ? resolve(window.cytoscape) : reject(new Error("cytoscape load failed"));
    script.onerror = () => reject(new Error("cytoscape load failed"));
    document.head.appendChild(script);
  }).catch(err => { _cyLoadPromise = null; throw err; });
  return _cyLoadPromise;
}

/* key → cytoscape 인스턴스 (재렌더 시 destroy) */
const _cyInstances = new Map();

/* ── A1: 검색 하이라이트 (cy 인스턴스에 직접 적용 — 재렌더 없이 입력 포커스 유지) ── */
function applySearchHighlight(key, term){
  const cy = _cyInstances.get(key);
  if(!cy) return;
  const q = String(term || "").trim().toLowerCase();
  cy.nodes().removeClass("search-dim search-hit");
  if(!q) return;
  const hits = cy.nodes().filter(n => String(n.data("name") || "").toLowerCase().includes(q));
  if(!hits.length){
    cy.nodes().addClass("search-dim");
    return;
  }
  cy.nodes().addClass("search-dim");
  hits.removeClass("search-dim").addClass("search-hit");
  cy.animate({ center: { eles: hits }, zoom: Math.min(cy.zoom(), 1.1) }, { duration: 260 });
}

/* ── 상세 정보 패널 ──────────────────────────────────────
   마우스 액션: 호버 = 이웃 강조 · 클릭 = 상세 정보 · 더블클릭 = 기준 노드 지정/해제 */
const PROP_LABEL_KO = {
  case_no: "사건번호", case_id: "사건ID", case_type: "사건 유형", case_status: "처리 상태",
  contraband_category: "품목 분류", contraband_sub_category: "세부 품목", summary: "개요",
  detection_date: "적발일", detection_channel: "적발 경로", lead_agency: "주관 기관",
  origin_country: "출발국", transit_country: "경유국", destination_region: "반입지",
  modus_operandi: "수법", concealment_method: "은닉 방법",
  estimated_value: "추정 금액(원)", quantity: "수량", quantity_unit: "단위",
  company_id: "기업ID", company_name: "기업명", business_no: "사업자번호",
  person_id: "인물ID", name: "이름", alias: "별칭", role: "역할",
  country: "국가", country_name: "국가명", hs_code: "HS코드", item_name: "품목명",
  broker_name: "관세사", org_name: "조직명", risk_score: "위험점수", risk_level: "위험등급",
  declaration_no: "신고번호", declared_value: "신고금액", import_date: "수입일",
  // 2026 관계망 재구성: 기업 수입 그래프 노드/엣지 속성
  region: "지역", top_risk_name: "주요 위험", top_risk_score: "주요 위험점수",
  risk_indicator_summary: "위험지표", hsk_code: "품목번호(HSK)", spec: "사양/규격",
  departure_country: "적출국", overseas_supplier: "해외거래처", item: "품목", count: "건수",
  transport_type: "운송수단", trade_flow: "수출입 구분", port_code: "항만코드", trade_date: "신고일자",
  manager: "담당 관세사",
  item_class: "품목분류(8자리)", model_or_agent: "분석 모델/서비스", reason: "근거",
  shareholding_pct: "지분율(%)", trade_share_pct: "거래비중(%)", is_offshore: "역외 여부", note: "비고",
  origin: "원산지", status: "사건유형", case_count: "사건건수",
  indicator_name: "지표명", code: "코드", value: "값", score: "점수",
  // 인물(우범자) 프로파일 + 흡수된 위험지표 속성
  profile_type: "프로파일 유형", name_aliases: "별칭", birth_date: "생년월일", gender: "성별",
  nationality: "국적", occupation: "직업", risk_tags: "위험 태그", watch_status: "관찰 상태",
  address_region: "주소지", org_type: "조직 유형", relation_type: "관계 유형", weight: "가중치",
  confidence_score: "신뢰도",
  indicator_count: "위험지표 수", top_indicators: "주요 위험지표",
  // 정보분석(ANALYZED_BY) 엣지 속성
  analysis_type: "분석유형", input_summary: "분석 입력요약", output_summary: "정보분석 요약",
  analysis_summary: "분석 요약", analysis_review_status: "분석 검토상태",
  is_cargo_owner: "화주 여부", linked_case_id: "연계 사건",
  risk_score_before: "분석전 위험점수", risk_score_after: "분석후 위험점수",
  explanation: "분석 설명", review_status: "검토상태", created_at: "생성일시",
  // 사건(CASE_*) 엣지 속성
  case_no: "사건번호", role_in_case: "역할", evidence_level: "증거수준",
  evidence_summary: "증거 요약", modus_operandi: "수법",
};
const PROP_HIDDEN = new Set(["seed_batch_id", "updated_from", "label_ko"]);
/* 상세 패널에 우선 노출할 키 순서 */
const PROP_PRIORITY = [
  // 인물 핵심: 위험·정보분석 우선 노출
  "risk_level", "risk_score", "risk_tags", "top_indicators", "indicator_count",
  "analysis_type", "output_summary", "risk_score_after", "risk_score_before", "review_status",
  "nationality", "occupation", "watch_status",
  // 사건(CASE_*) 엣지 속성
  "case_no", "case_type", "case_status", "contraband_category", "contraband_sub_category",
  "summary", "detection_date", "detection_channel", "origin_country", "transit_country",
  "destination_region", "modus_operandi", "concealment_method", "estimated_value",
];

function fmtPropValue(value){
  if(value == null) return "-";
  if(typeof value === "number") return value >= 1000 ? value.toLocaleString("ko-KR") : String(value);
  const s = String(value);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s.replace(/T00:00:00.*$/, "");
}

function buildDetailRows(props, max = 12){
  const keys = Object.keys(props || {}).filter(k => !PROP_HIDDEN.has(k) && props[k] !== "" && props[k] != null);
  keys.sort((a, b) => {
    const ai = PROP_PRIORITY.indexOf(a), bi = PROP_PRIORITY.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
  });
  return keys.slice(0, max).map(k => `
    <div class="net-detail-row">
      <span>${escapeHtml(PROP_LABEL_KO[k] || k)}</span>
      <b>${escapeHtml(fmtPropValue(props[k]))}</b>
    </div>
  `).join("");
}

function showNetDetail(key, html){
  const area = document.querySelector(`[data-net-cy="${CSS.escape(key)}"]`)?.parentElement;
  if(!area) return;
  let panel = area.querySelector(".net-detail-panel");
  if(!panel){
    panel = document.createElement("div");
    panel.className = "net-detail-panel";
    area.appendChild(panel);
  }
  panel.innerHTML = html;
  panel.style.display = "block";
}

function hideNetDetail(key){
  const area = document.querySelector(`[data-net-cy="${CSS.escape(key)}"]`)?.parentElement;
  const panel = area?.querySelector(".net-detail-panel");
  if(panel) panel.style.display = "none";
}

function nodeDetailHtml(key, data){
  const state = filterStateFor(key);
  const isFocus = state.draft.focusIds.has(data.id);
  const isHidden = state.hiddenIds.has(data.id);
  const isCenter = currentRawGraph(key, state)?.center === data.id;
  return `
    <div class="net-detail-head">
      <i class="net-dot" style="background:${data.color}"></i>
      <strong>${escapeHtml(data.name)}</strong>
      <em>${escapeHtml(data.typeKo)}</em>
      <button type="button" class="net-detail-close" data-net-detail-close="${escapeHtml(key)}">×</button>
    </div>
    <div class="net-detail-body">${buildDetailRows(data.props) || `<div class="muted" style="font-size:11px">속성 정보가 없습니다.</div>`}</div>
    <div class="net-detail-foot">
      <button type="button" class="btn net-detail-focus" data-net-detail-focus="${escapeHtml(key)}::${escapeHtml(data.id)}">
        ${isFocus ? "기준 노드 해제" : "기준 노드로 지정"}
      </button>
      <button type="button" class="btn net-detail-hide" data-net-detail-hide="${escapeHtml(key)}::${escapeHtml(data.id)}"
        ${isCenter ? "disabled title='중심 노드는 숨길 수 없습니다'" : ""}>
        ${isHidden ? "보이기" : "숨기기"}
      </button>
      <span class="muted">더블클릭으로도 지정/해제됩니다</span>
    </div>
  `;
}

function edgeDetailHtml(key, edge, sourceData, targetData){
  return `
    <div class="net-detail-head">
      <strong>${escapeHtml(edge.typeKo || relLabelKo(edge.type, edge.props))}</strong>
      <em>관계</em>
      <button type="button" class="net-detail-close" data-net-detail-close="${escapeHtml(key)}">×</button>
    </div>
    <div class="net-detail-body">
      <div class="net-detail-row"><span>출발</span><b><i class="net-dot" style="background:${sourceData.color}"></i>${escapeHtml(sourceData.name)} (${escapeHtml(sourceData.typeKo)})</b></div>
      <div class="net-detail-row"><span>대상</span><b><i class="net-dot" style="background:${targetData.color}"></i>${escapeHtml(targetData.name)} (${escapeHtml(targetData.typeKo)})</b></div>
      ${buildDetailRows(edge.props, 8)}
    </div>
  `;
}

/* ── A2: 위험도 추출/등급 ── */
function nodeRiskScore(props){
  const score = Number(props && props.risk_score);
  if(Number.isFinite(score)) return score;
  const lvl = String((props && props.risk_level) || "").toUpperCase();
  if(lvl === "CRITICAL") return 95;
  if(lvl === "HIGH") return 85;
  if(lvl === "MEDIUM") return 65;
  if(lvl === "LOW") return 40;
  return NaN;
}
function riskTier(score){
  if(!Number.isFinite(score)) return "none";
  if(score >= 80) return "high";
  if(score >= 60) return "mid";
  return "low";
}
const RISK_BORDER = { high: "#dc2626", mid: "#f59e0b", low: "#cbd5e1", none: "#fff" };

/* 필터 적용된 그래프 → cytoscape elements (A2 위험도 인코딩 + B1 경로 강조 포함) */
function cyElements(graph){
  const coreSet = new Set(graph.coreIds || [graph.center]);
  const pathMode = !!graph.pathMode;
  const nodes = graph.nodes || [];
  const directIds = new Set();
  (graph.edges || []).forEach(e => {
    if(coreSet.has(e.source) && !coreSet.has(e.target)) directIds.add(e.target);
    if(coreSet.has(e.target) && !coreSet.has(e.source)) directIds.add(e.source);
  });
  const nodeEls = nodes.map(n => {
    const isCore = coreSet.has(n.id);
    const score = nodeRiskScore(n.properties);
    const tier = riskTier(score);
    // 미니멀 아이콘: 작은 솔리드 도형(중심 20px·일반 16px) + 위험도만큼 소폭 확대
    const baseW = isCore ? 20 : 16;
    const w = baseW + (tier === "high" ? 6 : tier === "mid" ? 3 : 0);
    return {
      data: {
        id: n.id,
        name: n.name,
        typeKo: nodeLabelKo(n.label),
        color: nodeColor(n.label),
        // 채움은 유형 원색 솔리드(파스텔 제거) — 작은 도형에서도 유형 구분이 되도록.
        // 중심(조사 대상) 노드만 파란색으로 별도 강조.
        pcolor: isCore ? "#0000FF" : nodeColor(n.label),
        // 노드 유형별 도형(박스/육각형/삼각형/원) + 라벨 하단 배치(가독성)
        shape: nodeShape(n.label),
        isBox: nodeShape(n.label) === "round-rectangle" ? 1 : 0,
        boxW: Math.round(w * 0.9),  // 박스는 원형보다 약간 작게
        ring: isCore ? 3 : (directIds.has(n.id) ? 2 : 1),
        core: isCore ? 1 : 0,
        risk: Number.isFinite(score) ? Math.round(score) : null,
        riskTier: tier,
        w,
        // 테두리는 기본 없음 — 중심(조사 대상) 노드는 형광 노란색(굵게), 고위험은 빨간 라인으로 강조
        bcolor: isCore ? "#ffff00" : (tier === "high" ? "#dc2626" : "#ffffff"),
        bwidth: isCore ? 4 : (tier === "high" ? 1.5 : 0),
        props: n.properties || {},
      },
    };
  });
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeEls = (graph.edges || [])
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e, i) => ({ data: {
      id: `e${i}`, source: e.source, target: e.target, type: e.type,
      typeKo: relLabelKo(e.type, e.properties), props: e.properties || {},
      ew: edgeWidth(e.properties),
      onPath: pathMode ? 1 : 0,
      fileEdge: (e.properties && e.properties.source === "file") ? 1 : 0,
      exportFlow: (e.properties && e.properties.trade_flow === "수출") ? 1 : 0,
    } }));
  return [...nodeEls, ...edgeEls];
}

const CY_STYLE = [
  { selector: "node", style: {
      "background-color": "data(pcolor)",
      // 유형별 도형 + 라벨을 아이콘 아래로(가독성)
      "shape": "data(shape)",
      "label": "data(name)",
      "color": "#333d4e",
      "font-size": "11px",
      "font-weight": 400,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 3,
      "text-wrap": "ellipsis",
      "text-max-width": "92px",
      "text-outline-width": 0,
      "text-background-color": "#ffffff",
      "text-background-opacity": .85,
      "text-background-padding": "2px",
      // A2: 위험도에 따라 크기·테두리(색/굵기)를 데이터로 매핑
      "width": "data(w)", "height": "data(w)",
      "border-width": "data(bwidth)", "border-color": "data(bcolor)",
  }},
  { selector: "node[core = 1]", style: {
      "font-size": "14px",
      "font-weight": 800,
  }},
  // 박스(기업·사람·거래처·관세사)는 원형보다 작게
  { selector: "node[isBox = 1]", style: {
      "width": "data(boxW)", "height": "data(boxW)",
  }},
  { selector: ".dim", style: { "opacity": .18 } },
  // A1: 검색 결과 — 비매칭 흐림 + 매칭 강조
  { selector: ".search-dim", style: { "opacity": .12 } },
  { selector: ".search-hit", style: {
      "border-color": "#facc15", "border-width": 3,
      "color": "#0066FF", "font-weight": 800,
  }},
  // 분석 기법 강조
  { selector: ".analysis-dim", style: { "opacity": .12 } },
  { selector: ".analysis-hit", style: {
      "border-color": "#16a34a", "border-width": 3,
      "color": "#0066FF", "font-weight": 800,
  }},
  // 정렬용 다중 선택 — 파란 후광(검색=노랑·분석=초록과 구분)
  { selector: "node:selected", style: {
      "border-color": "#2563eb", "border-width": 3,
      "overlay-color": "#2563eb", "overlay-opacity": .14, "overlay-padding": 4,
      "color": "#1d4ed8", "font-weight": 800,
  }},
  // 파일 등록 엣지 — 점선·자홍색으로 Neo4j 관계와 구분
  { selector: "edge[fileEdge = 1]", style: {
      "line-color": "#db2777", "target-arrow-color": "#db2777",
      "line-style": "dashed",
  }},
  // 경로분석: 수출 흐름은 주황색
  { selector: "edge[exportFlow = 1]", style: {
      "line-color": "#f59e0b", "target-arrow-color": "#f59e0b",
  }},
  { selector: "edge", style: {
      "curve-style": "bezier",
      "line-color": "#9bbcff",
      "width": "data(ew)",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#9bbcff",
      "arrow-scale": 1.1,
      "label": "data(typeKo)",
      "font-size": "10px",
      "font-weight": 400,
      "color": "#414141",
      "text-rotation": "autorotate",
      "text-background-color": "#f8fbff",
      "text-background-opacity": .9,
      "text-background-padding": "2px",
  }},
  // B1: 경로 상의 엣지 강조 (금색 굵은 선)
  { selector: "edge[onPath = 1]", style: {
      "line-color": "#f59e0b",
      "target-arrow-color": "#f59e0b",
      "width": 4.5,
  }},
];

/* 그래프 영역에 cytoscape 마운트 (이전 인스턴스는 파기) */
/* 화면상 글씨·노드 크기 클램프:
   - 글씨: 줌과 무관하게 화면 픽셀을 [9,14]로 유지(기준 일반 12·중심 14·엣지 10).
   - 노드: 줌인(zoom>1) 시 노드가 따라 커지지 않도록 역보정(기준 크기 고정) — 노드가 적어
     fit이 확대돼도 노드·글씨는 그대로이고 엣지 간격만 길어진다. 줌아웃 시에는 자연 축소 허용. */
function clampScreenSizes(cy){
  const z = cy.zoom() || 1;
  const clampFont = base => Math.max(9, Math.min(14, base * z)) / z;
  const sizeFactor = z > 1 ? 1 / z : 1;   // 확대 시 노드 크기 고정(축소는 허용)
  cy.batch(() => {
    cy.nodes("[core = 1]").style("font-size", `${clampFont(14).toFixed(2)}px`);
    cy.nodes("[core != 1]").style("font-size", `${clampFont(12).toFixed(2)}px`);
    cy.edges().style("font-size", `${clampFont(10).toFixed(2)}px`);
    cy.nodes().forEach(n => {
      const base = n.data("isBox") ? n.data("boxW") : n.data("w");
      const px = Number((base * sizeFactor).toFixed(2));
      n.style({ width: px, height: px });
    });
  });
}

function mountCytoscape(key, filteredGraph){
  const area = document.querySelector(`[data-net-cy="${CSS.escape(key)}"]`);
  if(!area) return;
  loadCytoscape().then(cytoscape => {
    const stale = _cyInstances.get(key);
    if(stale){ try { stale.destroy(); } catch (e) { /* noop */ } }
    if(!document.body.contains(area)) return;
    const cy = cytoscape({
      container: area,
      elements: cyElements(filteredGraph),
      style: CY_STYLE,
      wheelSensitivity: .25,
      maxZoom: 3, minZoom: .2,
    });
    // 레이아웃을 명시적으로 실행해 layoutstop 리스너를 run 전에 붙인다(동기 레이아웃 경합 방지).
    // 초기 표시: fit으로 과하게 줌아웃되면 라벨이 버튼(12px)보다 작아 보이므로 줌 하한(1.0)을
    // 적용하고 중심 노드를 화면 중앙에 둔다(노드·라벨 겹침은 레이아웃에서 이미 방지).
    const layout = cy.layout(viewLayout(filterStateFor(key), filteredGraph));
    layout.one("layoutstop", () => {
      // 정렬·드래그로 옮긴 노드 위치를 레이아웃 위에 복원(재렌더 후에도 유지)
      const mp = manualPosFor(filterStateFor(key));
      const movedIds = Object.keys(mp);
      if(movedIds.length){
        cy.batch(() => movedIds.forEach(id => {
          const n = cy.getElementById(id);
          if(n && n.nonempty()) n.position({ x: mp[id].x, y: mp[id].y });
        }));
        cy.fit(undefined, 30);
      }
      if(cy.zoom() < 1){
        cy.zoom(1);
        const core = cy.$("node[core = 1]");
        if(core.nonempty()) cy.center(core); else cy.center();
      }
      clampScreenSizes(cy);
    });
    layout.run();
    // 줌 변경 시에도 글씨(9~14px)·노드 크기를 화면 기준으로 유지
    cy.on("zoom", () => clampScreenSizes(cy));
    /* 마우스 액션 정리:
       - 호버: 해당 노드와 직접 이웃만 강조(나머지 흐림)
       - 클릭: 상세 정보 패널 표시 (노드 속성 / 관계 정보)
       - 더블클릭: 기준 노드 지정/해제
       - 빈 곳 클릭: 상세 패널 닫기 · 휠: 줌 · 드래그: 이동 */
    cy.on("mouseover", "node", evt => {
      cy.elements().addClass("dim");
      evt.target.closedNeighborhood().removeClass("dim");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("dim"));
    cy.on("tap", "node", evt => {
      // Shift+클릭은 정렬용 다중 선택 — 상세 패널은 띄우지 않는다(세로 툴바와 겹침 방지)
      if(evt.originalEvent && evt.originalEvent.shiftKey) return;
      showNetDetail(key, nodeDetailHtml(key, evt.target.data()));
    });
    cy.on("tap", "edge", evt => {
      const edge = evt.target;
      showNetDetail(key, edgeDetailHtml(key, edge.data(), edge.source().data(), edge.target().data()));
    });
    cy.on("tap", evt => {
      if(evt.target === cy) hideNetDetail(key);
    });
    cy.on("dbltap", "node", evt => {
      const nodeId = evt.target.id();
      const { draft } = filterStateFor(key);
      if(draft.focusIds.has(nodeId)) draft.focusIds.delete(nodeId);
      else draft.focusIds.add(nodeId);
      rerenderPanelByKey(key);
    });
    // 정렬: 다중 선택(Shift+클릭/드래그 박스) 변화 시 툴바 갱신
    cy.on("select unselect", "node", () => updateAlignToolbar(key));
    // 정렬: 노드를 손으로 옮기면 위치 저장(여럿 선택 상태면 함께 이동한 노드 모두 저장)
    cy.on("dragfree", "node", evt => {
      const mp = manualPosFor(filterStateFor(key));
      const moved = evt.target.selected() ? cy.$("node:selected") : evt.target;
      moved.forEach(nd => { mp[nd.id()] = { ...nd.position() }; });
    });
    _cyInstances.set(key, cy);
    updateAlignToolbar(key);
    // A1: 재렌더 후에도 검색 강조 유지
    const term = filterStateFor(key).searchTerm;
    if(term) applySearchHighlight(key, term);
    // 분석 기법 강조 유지
    applyAnalysisHighlight(key);
  }).catch(() => {
    // CDN 차단 등으로 cytoscape 로드 실패 → 자체 SVG 렌더러 폴백
    area.outerHTML = `<div class="profile-net-svg-fallback">${buildGraphSvg(filteredGraph, key)}</div>`;
  });
}

/* ── 프로파일 4-뷰: canonical 그래프(수입신고 허브)를 목적별 파생 그래프로 재구성 ──
   1) 수입신고 관계분석: 기업→수입신고→해외거래처 + 관세사→수입신고 (품목·항만은 엣지 속성으로 흡수)
   2) 품목기반 관계분석: 기업→품목→해외거래처 + 관세사→품목 (수입신고·항만은 엣지 속성으로 흡수)
   3) 위험구성 원인분석: 위험지표(0 아님)에 기여한 수입신고만 + 위험요인 노드 추가
   4) 경로분석: 기업→국가→항만→품목(수입신고 속성)→항만→국가, 수출·수입 방향별 국내측 우선 레인 */
const VIEW_MODES = [
  { id: "decl", label: "수입신고 관계분석", icon: "🕸️", desc: "기업 → 수입신고 → 해외거래처 · 관세사 → 수입신고 (품목·도착항·출발항·국가는 엣지에 표시)" },
  { id: "item", label: "품목기반 관계분석", icon: "📦", desc: "기업 → 품목 → 해외거래처 · 관세사 → 품목 (수입신고·항만은 엣지에 표시)" },
  { id: "riskcause", label: "위험구성 원인분석", icon: "🧩", desc: "위험지표가 0이 아닌 지표에 기여한 수입신고만 표시 + 위험요인 노드" },
  { id: "route", label: "경로분석", icon: "🛳️", desc: "기업 → 국가 → 항만 → 품목(수입신고 속성) → 항만 → 국가 (수출·수입 방향별)" },
];

function viewModeOf(state){
  const id = state.viewMode || "decl";
  return VIEW_MODES.find(v => v.id === id) || VIEW_MODES[0];
}

/* 수입신고 허브 인덱스: 신고별로 연결된 품목/항만/거래처/관세사(담당자)/위험요인을 모은다 */
function declRecords(graph){
  const byId = new Map((graph.nodes || []).map(n => [n.id, n]));
  const recs = new Map();
  (graph.nodes || []).forEach(n => {
    if(n.label === "Declaration") recs.set(n.id, { decl: n, item: null, dep: null, arr: null, sup: null, broker: null, manager: "", riskFactors: [] });
  });
  (graph.edges || []).forEach(e => {
    const declId = recs.has(e.source) ? e.source : (recs.has(e.target) ? e.target : null);
    if(!declId) return;
    const other = byId.get(declId === e.source ? e.target : e.source);
    if(!other || other.label === "Declaration") return;
    const r = recs.get(declId);
    if(e.type === "OF_ITEM") r.item = other;
    else if(e.type === "FROM_PORT") r.dep = other;
    else if(e.type === "TO_PORT") r.arr = other;
    else if(e.type === "SUPPLIED_BY") r.sup = other;
    else if(e.type === "FILED_BY"){ r.broker = other; r.manager = (e.properties && e.properties.manager) || ""; }
    else if(e.type === "CONTRIBUTES_TO") r.riskFactors.push(other);
  });
  return recs;
}

/* DRIVEN_BY(종합위험값→위험요인) 점수가 0보다 큰 활성 위험요인 id 집합 */
function activeRiskFactorIds(graph){
  const ids = new Set();
  (graph.edges || []).forEach(e => {
    if(e.type !== "DRIVEN_BY") return;
    const score = Number(e.properties && e.properties.score);
    if(!Number.isFinite(score) || score <= 0) return;
    if(String(e.target).startsWith("RiskFactor")) ids.add(e.target);
    else if(String(e.source).startsWith("RiskFactor")) ids.add(e.source);
  });
  return ids;
}

/* 뷰 빌더 공용: 노드 복제(+레인 스탬프, 캐시 원본 불변) / 파생 엣지 생성 */
function viewBuilder(graph){
  const nodes = new Map();
  const edges = [];
  const add = (node, lane) => {
    if(!node) return null;
    if(!nodes.has(node.id)) nodes.set(node.id, { ...node, properties: { ...(node.properties || {}) }, _lane: lane });
    return nodes.get(node.id);
  };
  const mk = (src, tgt, type, labelKo, props = {}) => {
    if(!src || !tgt) return;
    edges.push({ id: `v${edges.length}`, source: src.id, target: tgt.id, type, properties: { ...props, label_ko: labelKo } });
  };
  const done = laneNames => ({ ...graph, nodes: [...nodes.values()], edges, _laneNames: laneNames });
  return { add, mk, done };
}

/* 1)·3) 수입신고 관계분석 / 위험구성 원인분석(riskOnly) */
function viewDeclGraph(graph, opts = {}){
  const recs = declRecords(graph);
  if(!recs.size) return graph;
  const byId = new Map((graph.nodes || []).map(n => [n.id, n]));
  const center = byId.get(graph.center);
  const riskOnly = !!opts.riskOnly;
  const activeFactors = opts.activeFactors || null;
  const { add, mk, done } = viewBuilder(graph);
  const centerN = add(center, 0);
  const supLane = riskOnly ? 3 : 2;
  let riskDeclCount = 0;
  recs.forEach(r => {
    let factors = r.riskFactors;
    if(riskOnly && activeFactors) factors = factors.filter(f => activeFactors.has(f.id));
    if(riskOnly && !factors.length) return;   // 문제가 된 수입신고만 표시
    if(riskOnly) riskDeclCount += 1;
    const p = r.decl.properties || {};
    const itemName = (r.item && r.item.name) || p.item_name || "품목미상";
    const arrName = (r.arr && r.arr.name) || "";
    const depName = (r.dep && r.dep.name) || "";
    const declN = add(r.decl, 1);
    if(centerN) mk(centerN, declN, "FILED", `${itemName}${arrName ? ` · ${arrName}` : ""}`,
      { 품목: itemName, 도착항: arrName, 신고번호: p.declaration_no || "", trade_flow: p.trade_flow || "" });
    if(r.sup){
      const supN = add(r.sup, supLane);
      const country = (r.sup.properties && r.sup.properties.country) || "";
      mk(declN, supN, "SUPPLIED_BY", `${depName || "출발항 미상"}${country ? ` · ${country}` : ""}`,
        { 출발항: depName, 국가: country, 신고번호: p.declaration_no || "" });
    }
    if(r.broker){
      const brokerN = add(r.broker, 0);
      mk(brokerN, declN, "FILED_BY", `관세사 · ${r.manager || "-"}`, { manager: r.manager, 신고번호: p.declaration_no || "" });
    }
    if(riskOnly) factors.forEach(f => mk(declN, add(f, 2), "CONTRIBUTES_TO", "위험기여", { 신고번호: p.declaration_no || "" }));
  });
  // 신고 단위 위험기여 데이터가 없으면 활성 위험지표(0 아님)만이라도 기업에 연결해 표시
  if(riskOnly && !riskDeclCount && centerN){
    const byIdAll = new Map((graph.nodes || []).map(n => [n.id, n]));
    (graph.edges || []).forEach(e => {
      if(e.type !== "DRIVEN_BY") return;
      const score = Number(e.properties && e.properties.score);
      if(!Number.isFinite(score) || score <= 0) return;
      const factor = byIdAll.get(String(e.target).startsWith("RiskFactor") ? e.target : e.source);
      if(!factor) return;
      mk(centerN, add(factor, 2), "DRIVEN_BY", `위험지표 ${score}%`, { score, 비고: "관련 수입신고 기여 데이터 없음" });
    });
  }
  return done(riskOnly
    ? ["대상기업 · 관세사", "수입신고", "위험요인", "해외거래처"]
    : ["대상기업 · 관세사", "수입신고", "해외거래처"]);
}

/* 2) 품목기반 관계분석 — 수입신고를 엣지 속성으로 흡수, 품목 중심 (신고 다건은 집계) */
function viewItemGraph(graph){
  const recs = declRecords(graph);
  if(!recs.size) return graph;
  const byId = new Map((graph.nodes || []).map(n => [n.id, n]));
  const center = byId.get(graph.center);
  const { add, mk, done } = viewBuilder(graph);
  const centerN = add(center, 0);
  // (출발노드, 대상노드, 유형) 단위로 신고를 모아 한 엣지로 집계
  const agg = new Map();
  const collect = (src, tgt, type, extra) => {
    if(!src || !tgt) return;
    const k = `${src.id}|${tgt.id}|${type}`;
    if(!agg.has(k)) agg.set(k, { src, tgt, type, decls: [], arrs: new Set(), deps: new Set(), countries: new Set(), managers: new Set() });
    const a = agg.get(k);
    if(extra.declNo) a.decls.push(extra.declNo);
    if(extra.arr) a.arrs.add(extra.arr);
    if(extra.dep) a.deps.add(extra.dep);
    if(extra.country) a.countries.add(extra.country);
    if(extra.manager) a.managers.add(extra.manager);
  };
  recs.forEach(r => {
    if(!r.item) return;   // 품목 정보가 없는 신고는 품목 뷰에서 제외
    const p = r.decl.properties || {};
    const declNo = p.declaration_no || r.decl.name || "";
    const itemN = add(r.item, 1);
    collect(centerN, itemN, "FILED", { declNo, arr: (r.arr && r.arr.name) || "" });
    if(r.sup) collect(itemN, add(r.sup, 2), "SUPPLIED_BY", { declNo, dep: (r.dep && r.dep.name) || "", country: (r.sup.properties && r.sup.properties.country) || "" });
    if(r.broker) collect(add(r.broker, 0), itemN, "FILED_BY", { declNo, manager: r.manager });
  });
  agg.forEach(a => {
    const joined = set => [...set].filter(Boolean).join("/");
    const declText = a.decls.length > 2 ? `신고 ${a.decls.length}건` : a.decls.join("·");
    let label = "";
    if(a.type === "FILED") label = `${declText}${a.arrs.size ? ` · ${joined(a.arrs)}` : ""}`;
    else if(a.type === "SUPPLIED_BY") label = `${joined(a.deps) || "출발항 미상"}${a.countries.size ? ` · ${joined(a.countries)}` : ""}`;
    else if(a.type === "FILED_BY") label = `관세사 · ${joined(a.managers) || "-"} · ${declText}`;
    mk(a.src, a.tgt, a.type, label, {
      수입신고: a.decls.join(", "), count: a.decls.length,
      도착항: joined(a.arrs), 출발항: joined(a.deps), 국가: joined(a.countries), manager: joined(a.managers),
    });
  });
  return done(["대상기업 · 관세사", "품목", "해외거래처"]);
}

/* 4) 경로분석 — 신고별 방향(수출/수입)에 따라 국내측(국가→항만)→품목→해외측(항만→국가) 체인 */
function viewRouteGraph(graph){
  const recs = declRecords(graph);
  if(!recs.size) return graph;
  const byId = new Map((graph.nodes || []).map(n => [n.id, n]));
  const center = byId.get(graph.center);
  const { add, mk, done } = viewBuilder(graph);
  const centerN = add(center, 0);
  const countryOf = port => {
    const name = port && port.properties && port.properties.country;
    if(!name) return null;
    return { id: `Country:${name}`, label: "Country", name, properties: { name } };
  };
  // 같은 구간은 하나의 엣지로 집계(신고번호 목록·건수·방향 유지)
  const agg = new Map();
  const collect = (src, tgt, declNo, flow) => {
    if(!src || !tgt) return;
    const k = `${src.id}|${tgt.id}`;
    if(!agg.has(k)) agg.set(k, { src, tgt, decls: [], flows: new Set() });
    const a = agg.get(k);
    if(declNo) a.decls.push(declNo);
    a.flows.add(flow);
  };
  recs.forEach(r => {
    const p = r.decl.properties || {};
    const flow = p.trade_flow === "수출" ? "수출" : "수입";
    const declNo = p.declaration_no || r.decl.name || "";
    // 국내측 = 수출이면 출발(항·국가), 수입이면 도착(항·국가)
    const domPort = flow === "수출" ? r.dep : r.arr;
    const forPort = flow === "수출" ? r.arr : r.dep;
    const itemBase = r.item || { id: `Item:${p.item_name || r.decl.id}`, label: "ItemClass", name: p.item_name || "품목미상", properties: { item_name: p.item_name || "" } };
    const itemN = add(itemBase, 3);
    // 품목 노드 속성으로 수입신고 목록 축적
    const prev = itemN.properties["수입신고"];
    itemN.properties["수입신고"] = prev ? `${prev}, ${declNo}` : declNo;
    const chain = [centerN, add(countryOf(domPort), 1), add(domPort, 2), itemN, add(forPort, 4), add(countryOf(forPort), 5)].filter(Boolean);
    for(let i = 0; i < chain.length - 1; i += 1) collect(chain[i], chain[i + 1], declNo, flow);
  });
  agg.forEach(a => {
    const flow = a.flows.size === 1 ? [...a.flows][0] : "수출·수입";
    mk(a.src, a.tgt, "ROUTE", a.decls.length > 2 ? `신고 ${a.decls.length}건` : a.decls.join("·"),
      { 수입신고: a.decls.join(", "), count: a.decls.length, trade_flow: flow === "수출" ? "수출" : flow });
  });
  return done(["대상기업", "국가(국내측)", "항만(국내측)", "품목(수입신고)", "항만(해외측)", "국가(해외측)"]);
}

/* 속성창에서 숨김 처리한 노드(state.hiddenIds)와 연결 엣지를 그래프에서 제거.
   중심(center) 노드는 숨김 대상에서 제외(그래프가 비지 않도록). */
function applyHidden(graph, state){
  const hidden = state && state.hiddenIds;
  if(!hidden || !hidden.size) return graph;
  const drop = new Set([...hidden].filter(id => id !== graph.center));
  if(!drop.size) return graph;
  const nodes = (graph.nodes || []).filter(n => !drop.has(n.id));
  const edges = (graph.edges || []).filter(e => !drop.has(e.source) && !drop.has(e.target));
  return { ...graph, nodes, edges };
}

/* canonical 그래프 → 현재 뷰 파생 그래프. 수입신고 노드가 없는 그래프(자유 관계분석의
   임의 시드 등)는 변환 없이 원본을 그대로 표시한다(방사형 폴백). */
function projectForView(graph, modeId){
  const id = (VIEW_MODES.find(v => v.id === modeId) || VIEW_MODES[0]).id;
  if(id === "decl") return viewDeclGraph(graph);
  if(id === "item") return viewItemGraph(graph);
  if(id === "riskcause"){
    const active = activeRiskFactorIds(graph);
    return viewDeclGraph(graph, { riskOnly: true, activeFactors: active.size ? active : null });
  }
  if(id === "route") return viewRouteGraph(graph);
  return graph;
}

/* 레인(열) 좌표: 뷰 빌더가 스탬프한 _lane 기준 열 배치 */
function presetPositions(graph){
  const byLane = new Map();
  (graph.nodes || []).forEach(n => {
    const lane = Number.isFinite(n._lane) ? n._lane : 0;
    if(!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane).push(n);
  });
  const colW = 230, rowH = 66, pos = {};
  byLane.forEach(list => list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
  byLane.forEach((list, lane) => {
    const x = lane * colW;
    list.forEach((n, i) => { pos[n.id] = { x, y: (i - (list.length - 1) / 2) * rowH }; });
  });
  return pos;
}

/* 관계분석(방사형) 좌표 — 노드가 많아 한 겹 원이 비대해지면 라벨이 작아지므로,
   기준 노드를 중앙에 두고 나머지를 유형별로 엇갈려 2~3겹의 동심원으로 분산 배치한다.
   각 겹의 노드 수가 줄어 전체 지름이 작아지고(→ 줌이 커져) 노드·라벨이 커 보인다. */
function radialRingPositions(graph){
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const coreSet = new Set((graph.coreIds && graph.coreIds.length) ? graph.coreIds : [graph.center]);
  const cores = nodes.filter(n => coreSet.has(n.id));
  const others = nodes.filter(n => !coreSet.has(n.id));
  const pos = {};

  // 중심: 기준 노드 1개면 정중앙, 여러 개면 작은 안쪽 원
  if(cores.length <= 1){
    if(cores.length) pos[cores[0].id] = { x: 0, y: 0 };
  } else {
    const step = (Math.PI * 2) / cores.length;
    cores.forEach((n, i) => { pos[n.id] = { x: 64 * Math.cos(-Math.PI / 2 + step * i), y: 64 * Math.sin(-Math.PI / 2 + step * i) }; });
  }
  if(!others.length) return pos;

  // 직접 연결 여부 → 유형 → 이름 순 정렬(같은 유형이 같은 방향에 모이도록)
  const directIds = new Set();
  edges.forEach(e => {
    if(coreSet.has(e.source) && !coreSet.has(e.target)) directIds.add(e.target);
    if(coreSet.has(e.target) && !coreSet.has(e.source)) directIds.add(e.source);
  });
  others.sort((a, b) => {
    const da = directIds.has(a.id) ? 0 : 1, db = directIds.has(b.id) ? 0 : 1;
    if(da !== db) return da - db;
    if(a.label !== b.label) return String(a.label).localeCompare(String(b.label));
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const SPACING = 66;   // 한 겹 안에서 노드 사이 최소 간격(라벨 포함)
  const RING_GAP = 88;  // 겹과 겹 사이 간격
  const baseInner = cores.length <= 1 ? 112 : 162;

  // 겹 수(1~3)는 바깥 반지름이 가장 작아지는 값을 고른다. 겹을 늘리면 겹당 노드가
  // 줄어 둘레는 작아지지만 RING_GAP만큼 더해지므로, 노드 수에 따라 최적 겹수가 달라진다.
  const n = others.length;
  const outerRadius = R => (R - 1) * RING_GAP + Math.max(baseInner, (Math.ceil(n / R) * SPACING) / (Math.PI * 2));
  let R = 1;
  for(const cand of [2, 3]) if(outerRadius(cand) < outerRadius(R)) R = cand;

  // 유형별로 엇갈리도록 라운드로빈 분배(정렬이 유형순이라 같은 유형이 여러 겹에 분산됨).
  const rings = Array.from({ length: R }, () => []);
  others.forEach((node, i) => rings[i % R].push(node));
  let prevR = 0;
  rings.forEach((list, k) => {
    const need = (list.length * SPACING) / (Math.PI * 2);   // 라벨이 겹치지 않을 최소 반지름
    const r = Math.max(k === 0 ? baseInner : prevR + RING_GAP, need);
    prevR = r;
    const step = (Math.PI * 2) / Math.max(list.length, 1);
    const offset = (k * step) / 2;   // 인접 겹과 반 칸 엇갈리게
    list.forEach((n, i) => {
      const ang = -Math.PI / 2 + step * i + offset;
      pos[n.id] = { x: r * Math.cos(ang), y: r * Math.sin(ang) };
    });
  });
  return pos;
}

/* 뷰별 cytoscape 레이아웃 — 파생 뷰(_lane 스탬프)는 레인(열) preset,
   변환되지 않은 그래프(우범자·자유 시드 등)는 방사형 동심원 preset. */
function viewLayout(state, graph){
  const hasLanes = (graph.nodes || []).some(n => Number.isFinite(n._lane));
  if(hasLanes) return { name: "preset", positions: presetPositions(graph), padding: 30, fit: true, animate: false };
  return { name: "preset", positions: radialRingPositions(graph), padding: 20, fit: true, animate: false };
}

/* 회사 프로파일: 4-뷰 토글 바 (현재 뷰 강조) + 우측 도구(정렬 툴바·전체화면) */
function buildViewToggle(state, key){
  const k = escapeHtml(key);
  const isProfileViews = key.startsWith("company:") || key.startsWith("explore:");
  const cur = viewModeOf(state).id;
  const btns = isProfileViews ? VIEW_MODES.map(v =>
    `<button type="button" class="net-view-btn${v.id === cur ? " on" : ""}" data-net-view="${k}::${v.id}" title="${escapeHtml(v.desc)}">${v.icon} ${escapeHtml(v.label)}</button>`
  ).join("") : "";
  const desc = isProfileViews ? `<span class="net-view-desc">${escapeHtml(viewModeOf(state).desc)}</span>` : "";
  const nHidden = state.hiddenIds ? state.hiddenIds.size : 0;
  const hiddenChip = nHidden
    ? `<button type="button" class="net-hidden-chip" data-net-show-all="${k}" title="숨긴 노드를 모두 다시 표시">🙈 숨김 ${nHidden} · 모두 표시</button>`
    : "";
  // 우측 도구: 정렬 툴바 고정 토글 + 전체화면 토글(항상 표시)
  const tools = `
    <span class="net-view-tools">
      <button type="button" class="net-tool-btn${state.alignBarOn ? " on" : ""}" data-net-align-toggle="${k}" title="노드 정렬 툴바 고정 표시 (선택 시 자동 표시됨)">⠿ 정렬 툴바 ${state.alignBarOn ? "숨기기" : "보이기"}</button>
      <button type="button" class="net-tool-btn" data-net-fullscreen="${k}" title="관계분석을 전체화면으로 보기">⛶ 전체화면</button>
    </span>`;
  return `<div class="profile-net-views">${btns}${desc}${hiddenChip}${tools}</div>`;
}

/* ── 노드 정렬 툴바: 다중 선택한 노드를 가로/세로 기준 정렬 + 균등 간격 배치 ── */
const ALIGN_BTNS = [
  { mode: "left",    grp: "좌우", label: "왼쪽",   title: "선택 노드를 가장 왼쪽 기준으로 정렬" },
  { mode: "hcenter", grp: "좌우", label: "가운데", title: "선택 노드를 좌우 중앙에 정렬" },
  { mode: "right",   grp: "좌우", label: "오른쪽", title: "선택 노드를 가장 오른쪽 기준으로 정렬" },
  { mode: "top",     grp: "상하", label: "위",     title: "선택 노드를 가장 위 기준으로 정렬" },
  { mode: "vcenter", grp: "상하", label: "가운데", title: "선택 노드를 상하 중앙에 정렬" },
  { mode: "bottom",  grp: "상하", label: "아래",   title: "선택 노드를 가장 아래 기준으로 정렬" },
  { mode: "dist-h",  grp: "균등", label: "가로",   title: "가로 간격을 균등하게 배분 (3개 이상)" },
  { mode: "dist-v",  grp: "균등", label: "세로",   title: "세로 간격을 균등하게 배분 (3개 이상)" },
];
function buildAlignToolbar(key){
  const k = escapeHtml(key);
  const groups = ["좌우", "상하", "균등"].map(g => {
    const btns = ALIGN_BTNS.filter(b => b.grp === g).map(b =>
      `<button type="button" class="net-align-btn" data-net-align="${k}::${b.mode}" title="${escapeHtml(b.title)}" disabled>${escapeHtml(b.label)}</button>`
    ).join("");
    return `<span class="net-align-grp"><em>${g}</em><span class="net-align-row">${btns}</span></span>`;
  }).join("");
  return `
    <div class="net-align-bar" data-net-align-bar="${k}">
      <span class="net-align-count" data-net-align-count="${k}">Shift+클릭·드래그로<br>노드 다중 선택</span>
      ${groups}
      <button type="button" class="net-align-clear" data-net-align-clear="${k}" title="선택 해제" disabled>✕ 선택해제</button>
    </div>`;
}
/* 선택 노드 수/고정여부에 따라 툴바 표시·버튼 활성 갱신.
   표시: 고정(alignBarOn) 또는 2개 이상 선택 시. 안내문·겹침회피 클래스도 함께 갱신. */
function updateAlignToolbar(key){
  const bar = document.querySelector(`[data-net-align-bar="${CSS.escape(key)}"]`);
  if(!bar) return;
  const cy = _cyInstances.get(key);
  const n = cy ? cy.$("node:selected").length : 0;
  const on = filterStateFor(key).alignBarOn;
  const visible = on || n >= 2;
  bar.classList.toggle("show", visible);
  if(bar.parentElement) bar.parentElement.classList.toggle("align-on", visible);   // 상세패널 좌측 이동
  const countEl = bar.querySelector("[data-net-align-count]");
  if(countEl) countEl.innerHTML = n ? `선택 <b>${n}</b>개` : "Shift+클릭·드래그로<br>노드 다중 선택";
  bar.querySelectorAll("[data-net-align]").forEach(b => {
    const mode = b.dataset.netAlign.split("::")[1];
    b.disabled = n < (mode.startsWith("dist") ? 3 : 2);
  });
  const clr = bar.querySelector("[data-net-align-clear]");
  if(clr) clr.disabled = n < 1;
}
/* 관계분석 패널 전체화면 토글 (제목·필터·그래프·하단 포함 frame 단위) */
function toggleNetFullscreen(key){
  const [tt, ...rest] = key.split(":");
  const body = document.getElementById(containerId(tt, rest.join(":")));
  const frame = body ? body.closest(".profile-net-frame") : null;
  if(!frame) return;
  if(document.fullscreenElement === frame) document.exitFullscreen();
  else if(frame.requestFullscreen) frame.requestFullscreen().catch(() => {});
}
/* 선택 노드 정렬/균등 배치 실행 — cytoscape 모델 좌표를 직접 조작하고 위치를 저장 */
function alignSelected(key, mode){
  const cy = _cyInstances.get(key);
  if(!cy) return;
  const sel = cy.$("node:selected");
  const n = sel.length;
  if(n < (mode.startsWith("dist") ? 3 : 2)) return;
  const items = sel.map(nd => ({ nd, p: { ...nd.position() } }));
  const xs = items.map(o => o.p.x), ys = items.map(o => o.p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  cy.batch(() => {
    switch(mode){
      case "left":    items.forEach(o => o.nd.position("x", minX)); break;
      case "hcenter": items.forEach(o => o.nd.position("x", (minX + maxX) / 2)); break;
      case "right":   items.forEach(o => o.nd.position("x", maxX)); break;
      case "top":     items.forEach(o => o.nd.position("y", minY)); break;
      case "vcenter": items.forEach(o => o.nd.position("y", (minY + maxY) / 2)); break;
      case "bottom":  items.forEach(o => o.nd.position("y", maxY)); break;
      case "dist-h": {
        const step = (maxX - minX) / (n - 1);
        [...items].sort((a, b) => a.p.x - b.p.x).forEach((o, i) => o.nd.position("x", minX + step * i));
        break;
      }
      case "dist-v": {
        const step = (maxY - minY) / (n - 1);
        [...items].sort((a, b) => a.p.y - b.p.y).forEach((o, i) => o.nd.position("y", minY + step * i));
        break;
      }
    }
  });
  // 변경된 위치 저장(재렌더 후 유지)
  const mp = manualPosFor(filterStateFor(key));
  sel.forEach(nd => { mp[nd.id()] = { ...nd.position() }; });
  clampScreenSizes(cy);
}

/* 레인 헤더 — 파생 뷰가 지정한 열 이름(_laneNames)을 표시 (열 대표색은 해당 레인 첫 노드 색) */
function buildLaneHeader(graph){
  const names = graph && graph._laneNames;
  if(!names || !names.length) return "";
  const laneColor = i => {
    const n = (graph.nodes || []).find(nd => nd._lane === i);
    return n ? nodeColor(n.label) : "#94a3b8";
  };
  return `<div class="net-route-lanes">` + names.map((ko, i) =>
    `<div class="net-route-lane"><i class="net-dot" style="background:${laneColor(i)}"></i>${escapeHtml(ko)}</div>`
  ).join('<span class="net-route-arrow">→</span>') + `</div>`;
}

/* ── 활성 조건 목록: 등록된 조건(enabled) + 작성 중인 조건(미리보기) ── */
function activeConditions(state){
  const conds = state.conditions
    .filter(c => c.enabled)
    .map(c => ({ focusIds: new Set(c.focusIds), targetLabel: c.targetLabel, relType: c.relType }));
  if(state.draft.focusIds.size){
    conds.push({ focusIds: state.draft.focusIds, targetLabel: state.draft.targetLabel, relType: state.draft.relType });
  }
  return conds;
}

/* 단일 조건 평가: 기준 노드 + 직접 연결 노드(대상 유형/관계 유형 한정) → {nodeIds, edges} */
function evalCondition(cond, nodes, edges, nodeById){
  const { focusIds, targetLabel, relType } = cond;
  const visible = new Set([...focusIds]);
  const condEdges = [];
  edges.forEach(e => {
    const sFocus = focusIds.has(e.source), tFocus = focusIds.has(e.target);
    if(!sFocus && !tFocus) return;
    if(relType && e.type !== relType) return;
    const otherId = sFocus && tFocus ? null : (sFocus ? e.target : e.source);
    if(otherId !== null){
      const other = nodeById.get(otherId);
      if(!other) return;
      if(targetLabel && other.label !== targetLabel) return;
      visible.add(otherId);
    }
    condEdges.push(e);
  });
  return { nodeIds: visible, edges: condEdges };
}

/* ── 필터 적용 ───────────────────────────────────────────
   1) 유형 숨김: hiddenLabels 노드 제거 (중심·기준 노드는 유지)
   2) 활성 조건이 있으면 각 조건의 결과(기준 노드 + 매칭 연결)를 합집합으로 표시 */
/* Neo4j 원본 그래프 + 파일 등록 노드/엣지 병합 (id 기준 중복 제거) */
function mergedGraph(raw, state){
  if(!state.fileNodes.length && !state.fileEdges.length) return raw;
  const byId = new Map((raw.nodes || []).map(n => [n.id, n]));
  state.fileNodes.forEach(n => { if(!byId.has(n.id)) byId.set(n.id, n); });
  const edgeKey = e => `${e.source}|${e.type}|${e.target}`;
  const seen = new Set((raw.edges || []).map(edgeKey));
  const edges = [...(raw.edges || [])];
  state.fileEdges.forEach(e => { if(!seen.has(edgeKey(e))){ seen.add(edgeKey(e)); edges.push(e); } });
  return { ...raw, nodes: [...byId.values()], edges };
}

function applyFilter(graph, state){
  // B1: 경로 탐색 결과가 있으면 경로 서브그래프만 표시(양 끝을 기준 노드로)
  if(state.pathResult && state.pathResult.found){
    const pr = state.pathResult;
    return {
      ...graph,
      nodes: pr.nodes || [],
      edges: pr.edges || [],
      center: pr.source,
      coreIds: [pr.source, pr.target],
      pathMode: true,
    };
  }

  const centerId = graph.center;
  const { hiddenLabels } = state;
  const conds = activeConditions(state);
  const allFocus = new Set();
  conds.forEach(c => c.focusIds.forEach(id => allFocus.add(id)));

  let nodes = (graph.nodes || []).filter(n =>
    n.id === centerId || allFocus.has(n.id) || !hiddenLabels.has(n.label));
  const nodeIds = new Set(nodes.map(n => n.id));
  let edges = (graph.edges || []).filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  if(conds.length){
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const visible = new Set();
    const edgeKeys = new Set();
    const unionEdges = [];
    conds.forEach(cond => {
      const r = evalCondition(cond, nodes, edges, nodeById);
      r.nodeIds.forEach(id => visible.add(id));
      r.edges.forEach(e => {
        const k = `${e.source}|${e.type}|${e.target}`;
        if(!edgeKeys.has(k)){ edgeKeys.add(k); unionEdges.push(e); }
      });
    });
    nodes = nodes.filter(n => visible.has(n.id));
    edges = unionEdges.filter(e => visible.has(e.source) && visible.has(e.target));
  }

  return { ...graph, nodes, edges, coreIds: allFocus.size ? [...allFocus] : [centerId] };
}

/* ── 방사형 레이아웃: 기준 노드(들) + 직접 연결(안쪽 링) + 나머지(바깥 링) ── */
function buildGraphSvg(graph, key){
  const W = 560, H = 520, CX = W / 2, CY = H / 2;
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  if(!nodes.length) return `<div class="profile-net-empty">표시할 관계망 데이터가 없습니다.<br><span class="muted">필터 조건을 확인하세요.</span></div>`;

  const coreIds = (graph.coreIds || [graph.center]).filter(id => nodes.some(n => n.id === id));
  const coreSet = new Set(coreIds.length ? coreIds : [nodes[0].id]);

  const directIds = new Set();
  edges.forEach(e => {
    if(coreSet.has(e.source) && !coreSet.has(e.target)) directIds.add(e.target);
    if(coreSet.has(e.target) && !coreSet.has(e.source)) directIds.add(e.source);
  });

  const ring0 = nodes.filter(n => coreSet.has(n.id));
  const ring1 = nodes.filter(n => !coreSet.has(n.id) && directIds.has(n.id));
  const ring2 = nodes.filter(n => !coreSet.has(n.id) && !directIds.has(n.id));

  const pos = {};
  const place = (list, radius) => {
    const step = (Math.PI * 2) / Math.max(list.length, 1);
    list.forEach((node, i) => {
      const angle = -Math.PI / 2 + step * i;
      pos[node.id] = { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
    });
  };
  if(ring0.length === 1) pos[ring0[0].id] = { x: CX, y: CY };
  else place(ring0, 70);
  place(ring1, Math.min(175, 120 + ring1.length * 5));
  place(ring2, Math.min(250, 200 + ring2.length * 2));

  const edgeSvg = edges.map(e => {
    const a = pos[e.source], b = pos[e.target];
    if(!a || !b) return "";
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    return `
      <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-width="${edgeWidth(e.properties).toFixed(1)}"></line>
      <text x="${mx.toFixed(1)}" y="${(my - 3).toFixed(1)}" class="edge-label" text-anchor="middle">${escapeHtml(truncate(relLabelKo(e.type, e.properties), 12))}</text>
    `;
  }).join("");

  const nodeSvg = nodes.map(node => {
    const p = pos[node.id];
    if(!p) return "";
    const isCore = coreSet.has(node.id);
    const tier = riskTier(nodeRiskScore(node.properties)); // A2: 폴백에도 위험도 반영
    const r = (isCore ? 34 : 24) + (tier === "high" ? 6 : tier === "mid" ? 3 : 0);
    const stroke = isCore ? "#dc2626" : RISK_BORDER[tier];
    const strokeW = isCore ? 3 : (tier === "high" || tier === "mid" ? 3 : 1);
    return `
      <g class="net-node" data-net-node="${escapeHtml(key)}::${escapeHtml(node.id)}" style="cursor:pointer">
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${nodeColor(node.label)}"
          stroke="${stroke}" stroke-width="${strokeW}">
          <title>${escapeHtml(`${nodeLabelKo(node.label)}: ${node.name}`)} (클릭: 기준 노드 지정/해제)</title>
        </circle>
        <text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" class="node-label" text-anchor="middle">${escapeHtml(truncate(node.name, isCore ? 7 : 5))}</text>
        <text x="${p.x.toFixed(1)}" y="${(p.y + r + 15).toFixed(1)}" class="node-type" text-anchor="middle">${escapeHtml(nodeLabelKo(node.label))}</text>
      </g>
    `;
  }).join("");

  return `
    <svg class="drug-network-svg profile-net-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;
}

/* ── 상단 도구막대: A1 검색창 + 유형 칩 필터 ── */
function buildFilterBar(rawGraph, state, key){
  const counts = new Map();
  (rawGraph.nodes || []).forEach(n => counts.set(n.label, (counts.get(n.label) || 0) + 1));
  const labels = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const search = `
    <div class="profile-net-search-wrap">
      <input type="search" class="profile-net-search" data-net-search="${escapeHtml(key)}"
        placeholder="노드 검색(이름)..." value="${escapeHtml(state.searchTerm || "")}" autocomplete="off">
    </div>`;
  const chips = labels.length <= 1 ? "" : `
    <span class="profile-net-filter-title">유형</span>
    ${labels.map(label => `
      <button type="button" class="profile-net-filter-chip${state.hiddenLabels.has(label) ? " off" : ""}"
        data-net-filter="${escapeHtml(key)}::${escapeHtml(label)}">
        <i style="background:${nodeColor(label)}"></i>${escapeHtml(nodeLabelKo(label))}
        <b>${counts.get(label)}</b>
      </button>
    `).join("")}`;
  return `<div class="profile-net-filter">${search}${chips}</div>`;
}

/* 조건 한 건의 요약 문구: "사건1, 사건2 → 국가 (관계: 전체)" */
function condSummary(cond, nodeById){
  const names = [...cond.focusIds].map(id => {
    const node = nodeById.get(id);
    return `<i class="net-dot" style="background:${nodeColor(node?.label)}"></i>${escapeHtml(truncate(node?.name || id, 12))}`;
  }).join(", ");
  const target = cond.targetLabel ? nodeLabelKo(cond.targetLabel) : "전체 유형";
  const rel = cond.relType ? ` · 관계: ${escapeHtml(cond.relType)}` : "";
  return `${names} <span class="net-cond-arrow">→</span> <b>${escapeHtml(target)}</b>${rel}`;
}

/* ── 필터 조건 등록 화면 (작성 폼 + 등록된 조건 목록) ── */
function buildConditionBuilder(rawGraph, state, key){
  const nodes = rawGraph.nodes || [];
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const labels = [...new Set(nodes.map(n => n.label))];
  const relTypes = [...new Set((rawGraph.edges || []).map(e => e.type))].sort();
  const draft = state.draft;

  // 기준 노드 select 옵션 — 유형별 그룹 (작성 중인 조건에 이미 담긴 노드는 제외)
  const groups = labels.map(label => {
    const options = nodes
      .filter(n => n.label === label && !draft.focusIds.has(n.id))
      .map(n => `<option value="${escapeHtml(n.id)}">${escapeHtml(truncate(n.name, 22))}</option>`)
      .join("");
    return options ? `<optgroup label="${escapeHtml(nodeLabelKo(label))}">${options}</optgroup>` : "";
  }).join("");

  const focusChips = [...draft.focusIds].map(id => {
    const node = nodeById.get(id);
    return `
      <span class="net-cond-chip">
        <i class="net-dot" style="background:${nodeColor(node?.label)}"></i>
        ${escapeHtml(truncate(node?.name || id, 14))}
        <button type="button" data-net-focus-remove="${escapeHtml(key)}::${escapeHtml(id)}" aria-label="제거">×</button>
      </span>
    `;
  }).join("");

  const targetOptions = [`<option value="">전체 유형</option>`]
    .concat(labels.map(label =>
      `<option value="${escapeHtml(label)}" ${draft.targetLabel === label ? "selected" : ""}>${escapeHtml(nodeLabelKo(label))}</option>`))
    .join("");

  const relOptions = [`<option value="">전체 관계</option>`]
    .concat(relTypes.map(t =>
      `<option value="${escapeHtml(t)}" ${draft.relType === t ? "selected" : ""}>${escapeHtml(relLabelKo(t))}</option>`))
    .join("");

  // 등록된 조건 목록
  const condRows = state.conditions.map(cond => `
    <div class="net-cond-row${cond.enabled ? "" : " off"}">
      <label class="net-cond-toggle">
        <input type="checkbox" ${cond.enabled ? "checked" : ""} data-net-cond-toggle="${escapeHtml(key)}::${cond.id}">
        <span class="net-cond-desc">${condSummary({ ...cond, focusIds: new Set(cond.focusIds) }, nodeById)}</span>
      </label>
      <button type="button" class="net-cond-del" data-net-cond-del="${escapeHtml(key)}::${cond.id}" aria-label="조건 삭제">×</button>
    </div>
  `).join("");

  return `
    <div class="profile-net-cond">
      <div class="profile-net-cond-head">
        <strong>필터 조건 등록</strong>
        <span class="muted">기준 노드(다중) + 연결 대상 유형 + 관계 유형 → [조건 추가]. 그래프의 노드를 더블클릭해도 기준으로 추가됩니다.</span>
      </div>
      <div class="profile-net-cond-form">
        <select class="net-cond-select" data-net-focus-select="${escapeHtml(key)}">
          <option value="">+ 기준 노드 선택...</option>
          ${groups}
        </select>
        <label class="net-cond-target">
          <span>연결 대상</span>
          <select class="net-cond-select" data-net-target-select="${escapeHtml(key)}">
            ${targetOptions}
          </select>
        </label>
        <label class="net-cond-target">
          <span>관계 유형</span>
          <select class="net-cond-select" data-net-rel-select="${escapeHtml(key)}">
            ${relOptions}
          </select>
        </label>
        <button type="button" class="btn net-cond-add" data-net-cond-add="${escapeHtml(key)}" ${draft.focusIds.size ? "" : "disabled"}>+ 조건 추가</button>
        <button type="button" class="btn secondary net-cond-reset" data-net-reset="${escapeHtml(key)}">초기화</button>
      </div>
      <div class="profile-net-cond-chips">
        ${focusChips || `<span class="muted" style="font-size:11px">작성 중인 조건 없음 — 기준 노드를 선택하면 즉시 미리보기됩니다</span>`}
      </div>
      ${state.conditions.length ? `
        <div class="profile-net-cond-list">
          <div class="net-cond-list-title">등록된 조건 <b>${state.conditions.length}</b> <span class="muted">(체크 해제 시 일시 제외, 여러 조건은 합집합으로 표시)</span></div>
          ${condRows}
        </div>
      ` : ""}
    </div>
  `;
}

/* ── B1: 경로 탐색 UI (출발/도착 노드 선택 + 결과 요약) ── */
function nodeOptionGroups(nodes, selectedId){
  const labels = [...new Set(nodes.map(n => n.label))];
  return labels.map(label => {
    const options = nodes
      .filter(n => n.label === label)
      .map(n => `<option value="${escapeHtml(n.id)}" ${n.id === selectedId ? "selected" : ""}>${escapeHtml(truncate(n.name, 22))}</option>`)
      .join("");
    return options ? `<optgroup label="${escapeHtml(nodeLabelKo(label))}">${options}</optgroup>` : "";
  }).join("");
}

function buildPathFinder(rawGraph, state, key){
  const nodes = rawGraph.nodes || [];
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const pr = state.pathResult;

  let resultHtml = "";
  if(pr){
    if(pr.found){
      const seq = (pr.nodes || []).map(n =>
        `<i class="net-dot" style="background:${nodeColor(n.label)}"></i>${escapeHtml(truncate(n.name, 12))}`
      ).join(' <span class="net-cond-arrow">→</span> ');
      const hops = Math.max((pr.nodes || []).length - 1, 0);
      resultHtml = `
        <div class="net-path-result found">
          <div class="net-path-seq">${seq}</div>
          <div class="net-path-meta"><b>${hops}</b>단계 연결 · 관계 ${(pr.edges || []).length}건</div>
        </div>`;
    } else {
      resultHtml = `<div class="net-path-result none">선택한 두 대상 사이의 연결 경로를 찾지 못했습니다(6단계 이내).</div>`;
    }
  }

  const srcName = state.pathSrc ? truncate(nodeById.get(state.pathSrc)?.name || "", 18) : "";
  const tgtName = state.pathTgt ? truncate(nodeById.get(state.pathTgt)?.name || "", 18) : "";

  return `
    <div class="profile-net-pathfinder">
      <div class="profile-net-cond-head">
        <strong>경로 탐색</strong>
        <span class="muted">두 대상을 선택하면 사이를 잇는 최단 연결 경로를 찾아 강조합니다.</span>
      </div>
      <div class="profile-net-path-form">
        <select class="net-cond-select" data-net-path-src="${escapeHtml(key)}">
          <option value="">출발 노드...</option>
          ${nodeOptionGroups(nodes, state.pathSrc)}
        </select>
        <span class="net-path-arrow">→</span>
        <select class="net-cond-select" data-net-path-tgt="${escapeHtml(key)}">
          <option value="">도착 노드...</option>
          ${nodeOptionGroups(nodes, state.pathTgt)}
        </select>
        <button type="button" class="btn net-path-find" data-net-path-find="${escapeHtml(key)}"
          ${state.pathSrc && state.pathTgt && state.pathSrc !== state.pathTgt ? "" : "disabled"}>경로 찾기</button>
        ${pr ? `<button type="button" class="btn secondary net-path-clear" data-net-path-clear="${escapeHtml(key)}">해제</button>` : ""}
      </div>
      ${resultHtml}
    </div>
  `;
}

/* 경로 모드 배너 (그래프 상단) */
function buildPathBanner(state, key){
  const pr = state.pathResult;
  if(!pr || !pr.found) return "";
  const hops = Math.max((pr.nodes || []).length - 1, 0);
  return `
    <div class="profile-net-path-banner">
      <span>🔗 경로 보기 — ${hops}단계 연결</span>
      <button type="button" class="net-path-clear-inline" data-net-path-clear="${escapeHtml(key)}">전체 관계망으로 돌아가기</button>
    </div>`;
}

/* ── 하단 데이터 목록: 표시 중인 관계(엣지) 테이블 ── */
function buildEdgeTable(graph, maxRows = 80){
  const nodeById = new Map((graph.nodes || []).map(n => [n.id, n]));
  const edges = graph.edges || [];
  if(!edges.length) return `<div class="profile-net-empty" style="padding:14px">표시할 관계 데이터가 없습니다.</div>`;
  const rows = edges.slice(0, maxRows).map(e => {
    const s = nodeById.get(e.source), t = nodeById.get(e.target);
    return `
      <tr>
        <td><i class="net-dot" style="background:${nodeColor(s?.label)}"></i>${escapeHtml(s?.name || e.source)}<small>${escapeHtml(nodeLabelKo(s?.label || ""))}</small></td>
        <td class="net-rel">${escapeHtml(relLabelKo(e.type, e.properties))}</td>
        <td><i class="net-dot" style="background:${nodeColor(t?.label)}"></i>${escapeHtml(t?.name || e.target)}<small>${escapeHtml(nodeLabelKo(t?.label || ""))}</small></td>
      </tr>
    `;
  }).join("");
  const more = edges.length > maxRows ? `<div class="profile-net-more">전체 ${edges.length}건 중 ${maxRows}건 표시</div>` : "";
  return `
    <div class="profile-net-table-wrap">
      <table class="profile-net-table">
        <thead><tr><th>출발</th><th>관계</th><th>대상</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${more}
    </div>
  `;
}

/* ── 워크벤치 좌측 제어 패널: 데이터 소스 + 파일 등록 + 분석 기법 ── */
const ANALYSIS_METHODS = [
  { id: "", label: "기본 (필터/경로)" },
  { id: "common", label: "공통 이웃" },
  { id: "centrality", label: "중심성(연결도)" },
  { id: "betweenness", label: "매개 중심성(betweenness)" },
  { id: "cluster", label: "군집(연결요소)" },
  { id: "community", label: "커뮤니티 탐지(라벨전파)" },
  { id: "bridges", label: "브리지·단절점" },
  { id: "shared_hub", label: "공유 허브 교차(항만·거래처·관세사·품목·위험요인)" },
];

/* 공유 허브 교차에서 허브로 보는 노드 라벨(여러 기업이 공유하면 교차 신호) */
const HUB_LABELS = new Set(["DeparturePort", "ArrivalPort", "OverseasSupplier", "Broker", "ItemClass", "RiskFactor"]);

/* ── 분석 시나리오 (B 방식: 시작 요건을 미리 정의 → 질의시점에 적용) ──
   시나리오 = { id, name, builtin, description, spec }
   spec = { hops, analysisMode, analysisSel, hiddenLabels:[], conditions:[{focusIds:[],targetLabel,relType}] } */
const BUILTIN_SCENARIOS = [
  {
    id: "builtin:shared_port_cluster",
    name: "공유 출발항·운송수단 군집",
    builtin: true,
    description: "같은 출발항·운송수단을 공유하는 기업 군집을 탐지합니다(이웃 2단계 + 항만 허브 패턴).",
    spec: { hops: 2, analysisMode: "shared_hub", analysisSel: [], hiddenLabels: [], conditions: [] },
  },
];
let _userScenarios = [];        // 서버 저장 사용자 시나리오
let _scenariosLoaded = false;

function allScenarios(){ return [...BUILTIN_SCENARIOS, ..._userScenarios]; }

function scenarioSpecSummary(s){
  const sp = s.spec || {};
  const parts = [];
  if(sp.hops) parts.push(`이웃 ${sp.hops}단계`);
  if(sp.analysisMode){
    const m = ANALYSIS_METHODS.find(x => x.id === sp.analysisMode);
    parts.push(`기법: ${m ? m.label : sp.analysisMode}`);
  }
  if((sp.conditions || []).length) parts.push(`필터 조건 ${sp.conditions.length}개`);
  if((sp.hiddenLabels || []).length) parts.push(`숨김 ${sp.hiddenLabels.length}유형`);
  return parts.join(" · ") || "설정 없음";
}

async function loadScenarios(){
  if(_scenariosLoaded) return;
  _scenariosLoaded = true;
  try {
    const r = await fetch("/api/network_scenarios");
    if(r.ok){
      const d = await r.json();
      if(d.state && Array.isArray(d.state.scenarios)) _userScenarios = d.state.scenarios;
    }
  } catch { /* noop */ }
  // 로드 완료 후 이미 열려 있는 패널을 갱신해 시나리오 목록을 반영
  _filterState.forEach((_s, key) => rerenderPanelByKey(key));
}

function saveScenarios(){
  return fetch("/api/network_scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarios: _userScenarios }),
  }).catch(error => console.warn("분석 시나리오 저장 실패", error));
}

/* 시나리오 적용: 저장된 spec을 현재 패널 상태로 복원하고 필요 시 그래프를 재조회한다. */
function applyScenario(key, scenarioId){
  const sc = allScenarios().find(s => String(s.id) === String(scenarioId));
  if(!sc) return;
  const state = filterStateFor(key);
  const spec = sc.spec || {};
  const prevHops = state.hops;
  state.hiddenLabels = new Set(spec.hiddenLabels || []);
  state.conditions = (spec.conditions || []).map(c => ({
    id: ++state.condSeq,
    focusIds: [...(c.focusIds || [])],
    targetLabel: c.targetLabel || "",
    relType: c.relType || "",
    enabled: true,
  }));
  state.draft = emptyDraft();
  state.pathResult = null;
  state.analysisMode = spec.analysisMode || "";
  state.analysisSel = spec.analysisSel || [];
  state.activeScenarioId = String(sc.id);
  state.hops = spec.hops || state.hops;
  state._autorun = state.analysisMode || null;   // 적용 직후 분석 자동 실행
  const [tt, ...rest] = key.split(":");
  if(state.hops !== prevHops) reloadGraph(tt, rest.join(":"));
  else rerenderPanelByKey(key);
}

/* 현재 패널 설정(필터 조건·이웃 확장·분석 기법)을 시나리오로 등록한다. */
function registerScenario(key){
  const state = filterStateFor(key);
  const name = (state.scenarioName || "").trim();
  if(!name){ alert("시나리오 이름을 입력하세요."); return; }
  const id = "user:" + Date.now();
  _userScenarios.push({
    id, name, builtin: false,
    spec: {
      hops: state.hops,
      analysisMode: state.analysisMode || "",
      analysisSel: state.analysisSel || [],
      hiddenLabels: [...state.hiddenLabels],
      conditions: state.conditions.map(c => ({
        focusIds: [...c.focusIds], targetLabel: c.targetLabel, relType: c.relType,
      })),
    },
  });
  state.scenarioName = "";
  state.activeScenarioId = id;
  saveScenarios();
  rerenderPanelByKey(key);
}

function deleteScenario(key, id){
  _userScenarios = _userScenarios.filter(s => String(s.id) !== String(id));
  const state = filterStateFor(key);
  if(state.activeScenarioId === String(id)) state.activeScenarioId = "";
  saveScenarios();
  rerenderPanelByKey(key);
}

function buildScenarioSection(state, key){
  const scenarios = allScenarios();
  const sel = state.activeScenarioId || "";
  const options = [`<option value="">시나리오 선택...</option>`]
    .concat(scenarios.map(s =>
      `<option value="${escapeHtml(String(s.id))}" ${String(s.id) === sel ? "selected" : ""}>`
      + `${s.builtin ? "★ " : ""}${escapeHtml(s.name)}</option>`)).join("");
  const active = scenarios.find(s => String(s.id) === sel);
  const desc = active
    ? `<p class="net-ws-hint">${escapeHtml(active.description || scenarioSpecSummary(active))}</p>` : "";
  const delBtn = (active && !active.builtin)
    ? `<button type="button" class="net-ws-clear" data-net-scenario-del="${escapeHtml(key)}::${escapeHtml(String(active.id))}">이 시나리오 삭제</button>`
    : "";
  return `
    <div class="net-ws-sect">
      <div class="net-ws-sect-title">분석 시나리오</div>
      <div class="net-ws-field">
        <span>등록 시나리오</span>
        <select class="net-ws-select" data-net-scenario-select="${escapeHtml(key)}">${options}</select>
      </div>
      <button type="button" class="btn net-ws-btn" data-net-scenario-apply="${escapeHtml(key)}" ${sel ? "" : "disabled"}>시나리오 적용</button>
      ${desc}
      ${delBtn}
      <label class="net-ws-sub" style="margin-top:8px">현재 설정을 시나리오로 등록</label>
      <div class="net-ws-field">
        <input type="text" class="net-ws-select" data-net-scenario-name="${escapeHtml(key)}"
          value="${escapeHtml(state.scenarioName || "")}" placeholder="예) 공유 항만 군집 점검">
      </div>
      <button type="button" class="btn net-ws-btn" data-net-scenario-save="${escapeHtml(key)}">현재 설정 저장</button>
      <p class="net-ws-hint">필터 조건·이웃 확장·분석 기법을 묶어 재사용 가능한 시나리오로 저장합니다.</p>
    </div>
  `;
}

/* ── 통신/거래내역 xlsx·csv 등록 → 표준 압수정보 JSON 변환 ── */
const _stagedEvidenceFile = new Map(); // key → {name,mime,encoding,content,size}

function buildEvidenceImportSection(state, key){
  if(!state.evidencePersonId){
    const [type, id] = key.split(":");
    if(type === "person") state.evidencePersonId = id || "";
  }
  const staged = _stagedEvidenceFile.get(key);
  const resultLine = state.evidenceResult
    ? (state.evidenceResult.error
        ? `<p class="net-ws-hint" style="color:#dc2626">${escapeHtml(state.evidenceResult.error)}</p>`
        : `<p class="net-ws-hint">등록 완료: ${state.evidenceResult.added}건 추가 (총 ${state.evidenceResult.total}건) → ${escapeHtml(state.evidenceResult.file)}</p>`)
    : "";
  return `
    <div class="net-ws-sect">
      <div class="net-ws-sect-title">통신/거래내역 등록 (xlsx·csv → 표준 JSON)</div>
      <div class="net-ws-field">
        <span>대상 인물ID</span>
        <input type="text" class="net-ws-select" data-net-evidence-person="${escapeHtml(key)}"
          value="${escapeHtml(state.evidencePersonId)}" placeholder="예) RP-0067">
      </div>
      <div class="net-ws-field">
        <span>구분</span>
        <select class="net-ws-select" data-net-evidence-kind="${escapeHtml(key)}">
          <option value="communication" ${state.evidenceKind === "communication" ? "selected" : ""}>통신내역</option>
          <option value="financial" ${state.evidenceKind === "financial" ? "selected" : ""}>금융거래내역</option>
        </select>
      </div>
      <div class="net-ws-file-row">
        <label class="btn secondary net-ws-file-btn">파일 선택${staged ? `: ${escapeHtml(truncate(staged.name, 18))}` : ""}
          <input type="file" data-net-evidence-file="${escapeHtml(key)}"
            accept=".csv,.xlsx,.xls" style="display:none">
        </label>
        <button type="button" class="btn net-ws-btn" data-net-evidence-import="${escapeHtml(key)}">등록</button>
      </div>
      <p class="net-ws-hint">표준 필드명(${state.evidenceKind === "communication"
        ? "record_type, app, direction, timestamp, counterpart_name, ..."
        : "txn_date, txn_type, direction, amount, counterpart_type, ..."}) 헤더의 xlsx/csv를
        data/evidence/&lt;인물ID&gt;/${state.evidenceKind === "communication" ? "communication_record.json" : "financial_transaction_record.json"} 으로 등록합니다.</p>
      ${resultLine}
    </div>
  `;
}

/* 자유 관계분석(explore) 시드·필터 컨트롤 */
function buildExploreControls(state, key){
  const ent = _entityCache || { companies: [], persons: [] };
  const compOpts = ent.companies
    .filter(c => !state.seedCompanies.some(s => s.id === c.company_id))
    .map(c => `<option value="${escapeHtml(c.company_id)}">${escapeHtml(truncate(c.company_name || c.company_id, 24))} · ${escapeHtml(c.risk_level || "-")}</option>`)
    .join("");
  const persOpts = ent.persons
    .filter(p => !state.seedPersons.some(s => s.id === p.person_id))
    .map(p => `<option value="${escapeHtml(p.person_id)}">${escapeHtml(truncate(p.name || p.person_id, 24))}</option>`)
    .join("");
  const chips = (list, kind) => list.length
    ? list.map(s => `<span class="net-cond-chip"><i class="net-dot" style="background:${nodeColor(kind === "company" ? "Company" : "Person")}"></i>${escapeHtml(truncate(s.name || s.id, 14))}<button type="button" data-net-seed-remove="${escapeHtml(key)}::${kind}::${escapeHtml(s.id)}" aria-label="제거">×</button></span>`).join("")
    : `<span class="muted" style="font-size:11px">없음</span>`;
  const loadingHint = _entityCache ? "" : `<p class="net-ws-hint"><span class="home-running-dot"></span> 대상 목록 로딩 중...</p>`;
  return `
    <div class="net-ws-sect">
      <div class="net-ws-sect-title">시드(분석 대상)</div>
      ${loadingHint}
      <div class="net-ws-field"><span>기업 추가</span>
        <select class="net-ws-select" data-net-seed-add-company="${escapeHtml(key)}"><option value="">+ 기업 선택...</option>${compOpts}</select></div>
      <div class="profile-net-cond-chips">${chips(state.seedCompanies, "company")}</div>
      <div class="net-ws-field"><span>인물 추가</span>
        <select class="net-ws-select" data-net-seed-add-person="${escapeHtml(key)}"><option value="">+ 인물 선택...</option>${persOpts}</select></div>
      <div class="profile-net-cond-chips">${chips(state.seedPersons, "person")}</div>
      <div class="net-ws-sect-title" style="margin-top:10px">속성 필터(기업 일괄)</div>
      <div class="net-ws-field"><span>위험등급</span>
        <select class="net-ws-select" data-net-filter-risk="${escapeHtml(key)}">
          <option value="">전체</option>
          ${["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(l => `<option value="${l}" ${state.filterRiskLevel === l ? "selected" : ""}>${l}</option>`).join("")}
        </select></div>
      <div class="net-ws-field"><span>지역</span>
        <input type="text" class="net-ws-select" data-net-filter-region="${escapeHtml(key)}" value="${escapeHtml(state.filterRegion || "")}" placeholder="예) 서울특별시 (Enter)"></div>
      <p class="net-ws-hint">여러 기업·인물(시드)과 속성 필터를 합쳐 교차 관계망을 구성합니다. 공유 허브(항만·거래처·관세사·품목·위험요인)가 기업을 교차 연결합니다.</p>
    </div>`;
}

function buildWorkbenchControls(raw, state, key){
  const exploreControls = state.explore ? buildExploreControls(state, key) : "";
  const hopOptions = [1, 2, 3].map(h =>
    `<option value="${h}" ${Number(state.hops) === h ? "selected" : ""}>${h}단계</option>`).join("");
  const methodOptions = ANALYSIS_METHODS.map(m =>
    `<option value="${m.id}" ${state.analysisMode === m.id ? "selected" : ""}>${escapeHtml(m.label)}</option>`).join("");
  const fileChips = state.fileSources.length
    ? state.fileSources.map((s, i) => `
        <span class="net-file-chip">
          ${escapeHtml(truncate(s.name, 16))} <small>${s.nodes}N·${s.edges}E</small>
        </span>`).join("")
    : `<span class="muted" style="font-size:11px">등록된 파일 관계 없음</span>`;
  // 공통 이웃: 노드 2개 선택 UI
  const commonPickers = state.analysisMode === "common"
    ? `<div class="net-ws-field">
         <span>대상 2개 선택</span>
         <select class="net-ws-select" data-net-analysis-a="${escapeHtml(key)}">
           <option value="">대상 A...</option>${raw ? nodeOptionGroups(raw.nodes || [], state.analysisSel[0]) : ""}
         </select>
         <select class="net-ws-select" data-net-analysis-b="${escapeHtml(key)}">
           <option value="">대상 B...</option>${raw ? nodeOptionGroups(raw.nodes || [], state.analysisSel[1]) : ""}
         </select>
       </div>`
    : "";
  return `
    ${exploreControls}
    ${state.explore ? "" : `<div class="net-ws-sect">
      <div class="net-ws-sect-title">데이터 소스</div>
      <div class="net-ws-field">
        <span>이웃 확장</span>
        <select class="net-ws-select" data-net-hops="${escapeHtml(key)}">${hopOptions}</select>
      </div>
      <p class="net-ws-hint">Neo4j에서 대상 중심 N단계까지 조회합니다. 엔티티·관계 유형은 상단 칩에서 선택합니다.</p>
    </div>`}

    <div class="net-ws-sect">
      <div class="net-ws-sect-title">파일 등록</div>
      <label class="net-ws-sub">정형 관계 CSV <small>(출발,관계,대상[,가중치])</small></label>
      <textarea class="net-ws-textarea" data-net-csv="${escapeHtml(key)}" rows="3"
        placeholder="예) 홍길동,통화,김철수&#10;김철수,송금,ABC무역"></textarea>
      <button type="button" class="btn net-ws-btn" data-net-csv-add="${escapeHtml(key)}">관계 추가</button>

      <label class="net-ws-sub" style="margin-top:8px">비정형 문서/텍스트 <small>(LLM 추출)</small></label>
      <textarea class="net-ws-textarea" data-net-extract-text="${escapeHtml(key)}" rows="3"
        placeholder="통화내역·계좌거래·진술서 등을 붙여넣거나 파일을 첨부하세요."></textarea>
      <div class="net-ws-file-row">
        <label class="btn secondary net-ws-file-btn">파일 첨부
          <input type="file" data-net-extract-file="${escapeHtml(key)}" multiple
            accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx" style="display:none">
        </label>
        <button type="button" class="btn net-ws-btn" data-net-extract="${escapeHtml(key)}">관계 추출</button>
      </div>
      <div class="net-ws-file-chips">${fileChips}</div>
      ${state.fileSources.length ? `<button type="button" class="net-ws-clear" data-net-file-clear="${escapeHtml(key)}">파일 관계 비우기</button>` : ""}
    </div>

    ${buildEvidenceImportSection(state, key)}

    <div class="net-ws-sect">
      <div class="net-ws-sect-title">분석 기법</div>
      <div class="net-ws-field">
        <span>방법</span>
        <select class="net-ws-select" data-net-analysis-mode="${escapeHtml(key)}">${methodOptions}</select>
      </div>
      ${commonPickers}
      ${state.analysisMode ? `<button type="button" class="btn net-ws-btn" data-net-analysis-run="${escapeHtml(key)}">분석 실행</button>` : ""}
    </div>

    ${buildScenarioSection(state, key)}
  `;
}

/* ── 분석 기법 계산 (표시 중인 그래프 기준) ──
   반환: { text, hitIds:Set } — hitIds 노드를 강조하고 나머지는 흐림 처리 */
function computeAnalysis(mode, graph, sel){
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, new Set()]));
  edges.forEach(e => {
    if(adj.has(e.source) && adj.has(e.target)){
      adj.get(e.source).add(e.target);
      adj.get(e.target).add(e.source);
    }
  });

  if(mode === "common"){
    const [a, b] = sel || [];
    if(!a || !b || !adj.has(a) || !adj.has(b)) return { text: "공통 이웃: 대상 2개를 선택하세요.", hitIds: new Set() };
    const common = [...adj.get(a)].filter(id => adj.get(b).has(id));
    const hitIds = new Set([a, b, ...common]);
    const names = common.map(id => nodeById.get(id)?.name).filter(Boolean).slice(0, 6).join(", ");
    return {
      text: common.length
        ? `공통 이웃 ${common.length}건: ${names}${common.length > 6 ? " 외" : ""}`
        : "두 대상의 공통 이웃이 없습니다.",
      hitIds,
    };
  }
  if(mode === "centrality"){
    const ranked = nodes.map(n => ({ id: n.id, name: n.name, deg: adj.get(n.id)?.size || 0 }))
      .sort((x, y) => y.deg - x.deg);
    const top = ranked.slice(0, 5).filter(r => r.deg > 0);
    const hitIds = new Set(top.map(r => r.id));
    const desc = top.map(r => `${truncate(r.name, 10)}(${r.deg})`).join(", ");
    return { text: `최다 연결 상위 ${top.length}: ${desc}`, hitIds };
  }
  if(mode === "cluster"){
    const seen = new Set();
    let largest = [];
    for(const n of nodes){
      if(seen.has(n.id)) continue;
      const comp = [];
      const stack = [n.id];
      while(stack.length){
        const cur = stack.pop();
        if(seen.has(cur)) continue;
        seen.add(cur); comp.push(cur);
        (adj.get(cur) || []).forEach(nb => { if(!seen.has(nb)) stack.push(nb); });
      }
      if(comp.length > largest.length) largest = comp;
    }
    const compCount = (() => {
      const s = new Set(); let c = 0;
      for(const n of nodes){ if(s.has(n.id)) continue; c++; const st=[n.id]; while(st.length){const x=st.pop(); if(s.has(x))continue; s.add(x);(adj.get(x)||[]).forEach(nb=>{if(!s.has(nb))st.push(nb);});} }
      return c;
    })();
    return { text: `군집 ${compCount}개 · 최대 군집 ${largest.length}개 노드 강조`, hitIds: new Set(largest) };
  }
  if(mode === "betweenness"){
    // Brandes 매개 중심성 — 서로 다른 군집을 잇는 핵심 매개 노드 식별
    const ids = nodes.map(n => n.id);
    const bc = new Map(ids.map(id => [id, 0]));
    for(const s of ids){
      const stack = [], pred = new Map(ids.map(i => [i, []]));
      const sigma = new Map(ids.map(i => [i, 0])), dist = new Map(ids.map(i => [i, -1]));
      sigma.set(s, 1); dist.set(s, 0);
      const queue = [s];
      while(queue.length){
        const v = queue.shift(); stack.push(v);
        (adj.get(v) || []).forEach(w => {
          if(dist.get(w) < 0){ dist.set(w, dist.get(v) + 1); queue.push(w); }
          if(dist.get(w) === dist.get(v) + 1){ sigma.set(w, sigma.get(w) + sigma.get(v)); pred.get(w).push(v); }
        });
      }
      const delta = new Map(ids.map(i => [i, 0]));
      while(stack.length){
        const w = stack.pop();
        pred.get(w).forEach(v => delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w))));
        if(w !== s) bc.set(w, bc.get(w) + delta.get(w));
      }
    }
    const ranked = ids.map(id => ({ id, name: nodeById.get(id)?.name, b: bc.get(id) / 2 }))
      .sort((a, b) => b.b - a.b).slice(0, 6).filter(r => r.b > 0);
    return {
      text: ranked.length
        ? `매개 중심성 상위: ${ranked.map(r => `${truncate(r.name, 10)}(${r.b.toFixed(1)})`).join(", ")}`
        : "매개 경로가 없습니다(단절 그래프).",
      hitIds: new Set(ranked.map(r => r.id)),
    };
  }
  if(mode === "community"){
    // 라벨 전파 커뮤니티 탐지 — 강하게 연결된 자연 군집 분할
    const ids = nodes.map(n => n.id);
    const label = new Map(ids.map(id => [id, id]));
    for(let iter = 0; iter < 10; iter++){
      let changed = false;
      for(const id of ids){
        const cnt = new Map();
        (adj.get(id) || []).forEach(nb => { const l = label.get(nb); cnt.set(l, (cnt.get(l) || 0) + 1); });
        if(!cnt.size) continue;
        let best = label.get(id), bestN = -1;
        cnt.forEach((n, l) => { if(n > bestN){ bestN = n; best = l; } });
        if(best !== label.get(id)){ label.set(id, best); changed = true; }
      }
      if(!changed) break;
    }
    const groups = new Map();
    ids.forEach(id => { const l = label.get(id); if(!groups.has(l)) groups.set(l, []); groups.get(l).push(id); });
    const sorted = [...groups.values()].sort((a, b) => b.length - a.length).filter(g => g.length > 1);
    return {
      text: sorted.length
        ? `커뮤니티 ${sorted.length}개 · 최대 ${sorted[0].length}개 노드(강조)`
        : "분리된 커뮤니티가 없습니다.",
      hitIds: new Set(sorted[0] || []),
    };
  }
  if(mode === "bridges"){
    // Tarjan 브리지·단절점 — 끊으면 망이 분리되는 연결고리/단절점
    const disc = new Map(), low = new Map(), parent = new Map();
    const artic = new Set(); let bridges = 0, timer = 0;
    const visit = (root) => {
      const st = [[root, 0]]; parent.set(root, null);
      while(st.length){
        const frame = st[st.length - 1];
        const [u, idx] = frame;
        if(idx === 0){ disc.set(u, timer); low.set(u, timer); timer++; }
        const nbrs = [...(adj.get(u) || [])];
        if(idx < nbrs.length){
          frame[1]++;
          const v = nbrs[idx];
          if(!disc.has(v)){ parent.set(v, u); st.push([v, 0]); }
          else if(v !== parent.get(u)) low.set(u, Math.min(low.get(u), disc.get(v)));
        } else {
          st.pop();
          const p = parent.get(u);
          if(p !== null && p !== undefined){
            low.set(p, Math.min(low.get(p), low.get(u)));
            if(low.get(u) > disc.get(p)) bridges++;
            if(low.get(u) >= disc.get(p) && parent.get(p) !== null && parent.get(p) !== undefined) artic.add(p);
          } else {
            const rootChildren = nbrs.filter(v => parent.get(v) === u).length;
            if(rootChildren > 1) artic.add(u);
          }
        }
      }
    };
    nodes.forEach(n => { if(!disc.has(n.id)) visit(n.id); });
    return {
      text: `브리지(연결고리) ${bridges}개 · 단절점 ${artic.size}개 강조 — 끊으면 망이 분리되는 핵심 지점`,
      hitIds: new Set(artic),
    };
  }
  if(mode === "shared_hub"){
    // 공유 허브 교차: 같은 항만·해외거래처·관세사·품목분류·위험요인을 공유하는 기업 군집.
    // 허브 모델에선 기업이 신고/위험값을 거쳐 허브에 닿으므로 2-hop 도달 기업까지 센다.
    const hubs = [];
    nodes.forEach(n => {
      if(!HUB_LABELS.has(n.label)) return;
      const companies = new Set();
      (adj.get(n.id) || []).forEach(mid => {
        const m = nodeById.get(mid);
        if(m && m.label === "Company") companies.add(mid);
        else (adj.get(mid) || []).forEach(cid => {
          const c = nodeById.get(cid);
          if(c && c.label === "Company") companies.add(cid);
        });
      });
      if(companies.size >= 2) hubs.push({ hub: n, companies: [...companies] });
    });
    if(!hubs.length){
      return { text: "여러 기업이 공유하는 허브가 없습니다 — 시드/필터로 기업을 2곳 이상 담아 보세요.", hitIds: new Set() };
    }
    hubs.sort((a, b) => b.companies.length - a.companies.length);
    const hitIds = new Set();
    hubs.forEach(h => { hitIds.add(h.hub.id); h.companies.forEach(c => hitIds.add(c)); });
    const lines = hubs.slice(0, 4).map(h => {
      const names = h.companies.map(c => truncate(nodeById.get(c)?.name, 10)).slice(0, 5).join(", ");
      return `${truncate(h.hub.name, 14)}(${nodeLabelKo(h.hub.label)}) ← 기업 ${h.companies.length}: ${names}`;
    });
    return { text: `공유 허브 교차 ${hubs.length}건 — ${lines.join(" / ")}`, hitIds };
  }
  return null;
}

/* 분석 강조를 cy 인스턴스에 적용 (재렌더 후 호출) */
function applyAnalysisHighlight(key){
  const cy = _cyInstances.get(key);
  const r = filterStateFor(key).analysisResult;
  if(!cy) return;
  cy.elements().removeClass("analysis-dim analysis-hit");
  if(!r || !r.hitIds || !r.hitIds.size) return;
  cy.nodes().forEach(n => {
    if(r.hitIds.has(n.id())) n.addClass("analysis-hit");
    else n.addClass("analysis-dim");
  });
  cy.edges().forEach(e => {
    if(!(r.hitIds.has(e.source().id()) && r.hitIds.has(e.target().id()))) e.addClass("analysis-dim");
  });
}

/* 분석 산출물 메시지 (그래프 상단) */
function buildAnalysisResult(state, key){
  const r = state.analysisResult;
  if(!r) return "";
  return `
    <div class="net-analysis-result">
      <span>${escapeHtml(r.text)}</span>
      <button type="button" class="net-path-clear-inline" data-net-analysis-clear="${escapeHtml(key)}">해제</button>
    </div>`;
}

/* 현재 키의 원본(병합 포함) 그래프를 반환. Neo4j 미조회 + 파일만 있으면 합성. */
function currentRawGraph(key, state){
  const cached = _graphCache.get(key);
  if(cached) return mergedGraph(cached, state);
  if(state.fileNodes.length){
    return mergedGraph({ nodes: [], edges: [], center: state.fileNodes[0].id }, state);
  }
  return null;
}

/* ── 패널 내부 콘텐츠 렌더 ── */
function renderPanelContent(targetType, targetId){
  const key = graphKey(targetType, targetId);
  const state = filterStateFor(key);
  const raw = currentRawGraph(key, state);
  if(!raw){
    const body = `<div class="profile-net-empty"><span class="home-running-dot"></span> 관계망 로딩 중...</div>`;
    return state.workbench ? wrapWorkbench(null, state, key, body) : body;
  }
  const isProjectable = targetType === "company" || targetType === "explore";
  const filtered = applyFilter(raw, state);
  // 회사 프로파일·자유 관계분석: 4-뷰로 프로젝션(라벨/엣지 필터). 우범자는 전체.
  const projected = applyHidden(isProjectable ? projectForView(filtered, state.viewMode) : filtered, state);
  // 시나리오 적용 직후: 분석 기법을 1회 자동 실행
  if(state._autorun && projected.nodes.length){
    state.analysisMode = state._autorun;
    state.analysisResult = computeAnalysis(state._autorun, projected, state.analysisSel);
    state._autorun = null;
  }
  const graphArea = projected.nodes.length
    ? `<div class="profile-net-cy" data-net-cy="${escapeHtml(key)}"></div>`
    : `<div class="profile-net-empty">표시할 관계망 데이터가 없습니다.<br><span class="muted">다른 뷰를 선택하거나 필터를 확인하세요.</span></div>`;
  const main = `
    ${buildViewToggle(state, key)}
    ${buildFilterBar(raw, state, key)}
    ${buildLaneHeader(projected)}
    ${buildPathBanner(state, key)}
    <div class="profile-net-graph-area">${projected.nodes.length ? buildAlignToolbar(key) : ""}${graphArea}</div>
    <div class="resize-gutter y" data-resize-target="next" data-resize-min="80" title="드래그하여 상·하 프레임 크기 조절"></div>
    <div class="profile-net-bottom">
      ${buildAnalysisResult(state, key)}
      ${buildPathFinder(raw, state, key)}
      ${buildConditionBuilder(raw, state, key)}
      <div class="profile-net-list-head">
        <strong>관계 데이터 목록</strong>
        <span class="muted">노드 ${projected.nodes.length} · 관계 ${projected.edges.length}</span>
      </div>
      ${buildEdgeTable(projected)}
    </div>
  `;
  return state.workbench ? wrapWorkbench(raw, state, key, main) : main;
}

/* 워크벤치 모드: 좌측 데이터/파일/분석 제어 패널 + 우측 메인 */
function wrapWorkbench(raw, state, key, mainHtml){
  return `
    <div class="net-ws">
      <aside class="net-ws-left">${buildWorkbenchControls(raw, state, key)}</aside>
      <div class="net-ws-main">${mainHtml}</div>
    </div>
  `;
}

/* 패널 HTML 주입 + cytoscape 마운트 */
function renderPanelInto(el, targetType, targetId){
  const key = graphKey(targetType, targetId);
  el.innerHTML = renderPanelContent(targetType, targetId);
  const state = filterStateFor(key);
  const raw = currentRawGraph(key, state);
  if(raw){
    const filtered = applyFilter(raw, state);
    const projectable = targetType === "company" || targetType === "explore";
    const projected = applyHidden(projectable ? projectForView(filtered, state.viewMode) : filtered, state);
    if(projected.nodes.length) mountCytoscape(key, projected);
  }
}

function rerenderPanelByKey(key){
  const [targetType, ...rest] = key.split(":");
  const targetId = rest.join(":");
  const el = document.getElementById(containerId(targetType, targetId));
  if(el) renderPanelInto(el, targetType, targetId);
}

async function loadGraphInto(targetType, targetId){
  const key = graphKey(targetType, targetId);
  const el = document.getElementById(containerId(targetType, targetId));
  if(!el) return;
  if(_graphCache.has(key)){
    renderPanelInto(el, targetType, targetId);
    return;
  }
  if(_loading.has(key)) return;
  _loading.add(key);
  try {
    const res = await fetch(graphUrl(targetType, targetId, filterStateFor(key).hops));
    const data = await res.json();
    if(!res.ok || data.error){
      const message = data.error || `그래프 조회 실패 (${res.status})`;
      const state = filterStateFor(key);
      // 워크벤치 모드이거나 파일 관계가 있으면 빈 그래프로 패널을 표시(컨트롤 유지).
      if(state.workbench || state.fileNodes.length){
        _graphCache.set(key, { nodes: [], edges: [], center: "" });
        rerenderPanelByKey(key);
        return;
      }
      const target = document.getElementById(containerId(targetType, targetId));
      if(target) target.innerHTML = `<div class="profile-net-empty">Neo4j 관계망을 불러올 수 없습니다.<br><span class="muted">${escapeHtml(message)}</span></div>`;
      return;
    }
    _graphCache.set(key, data);
    rerenderPanelByKey(key);
  } catch (e) {
    const target = document.getElementById(containerId(targetType, targetId));
    if(target) target.innerHTML = `<div class="profile-net-empty">관계망 서버 연결에 실패했습니다.</div>`;
  } finally {
    _loading.delete(key);
  }
}

/* hop 변경 등으로 Neo4j를 다시 조회 (캐시 무효화 후 재로드) */
function reloadGraph(targetType, targetId){
  const key = graphKey(targetType, targetId);
  _graphCache.delete(key);
  _loading.delete(key);
  loadGraphInto(targetType, targetId);
}

/* ── 파일 등록: 임시 파일 스테이징 + 병합 유틸 ── */
const _stagedFiles = new Map();     // key → [{name,type,encoding,content,size}]
const _TEXT_EXT = /\.(txt|md|csv|json|tsv|log)$/i;

function readFileEntry(file){
  return new Promise(resolve => {
    const reader = new FileReader();
    const isText = _TEXT_EXT.test(file.name) || (file.type || "").startsWith("text");
    reader.onload = () => {
      let content = reader.result || "";
      let encoding = "text";
      if(!isText){
        encoding = "base64";
        const s = String(content);
        content = s.includes(",") ? s.split(",")[1] : s;  // data:...;base64,XXXX → XXXX
      }
      resolve({ name: file.name, mime: file.type || "", encoding, content, size: file.size });
    };
    reader.onerror = () => resolve(null);
    if(isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

/* 추출/CSV 결과를 상태에 병합 (id 기준 중복 제거) */
function mergeFileGraph(key, nodes, edges, sourceName){
  const state = filterStateFor(key);
  const existingIds = new Set(state.fileNodes.map(n => n.id));
  let addedN = 0, addedE = 0;
  nodes.forEach(n => { if(!existingIds.has(n.id)){ existingIds.add(n.id); state.fileNodes.push(n); addedN++; } });
  const ekey = e => `${e.source}|${e.type}|${e.target}`;
  const existingE = new Set(state.fileEdges.map(ekey));
  edges.forEach(e => { if(!existingE.has(ekey(e))){ existingE.add(ekey(e)); state.fileEdges.push(e); addedE++; } });
  state.fileSources.push({ name: sourceName, nodes: addedN, edges: addedE });
  rerenderPanelByKey(key);
}

/* CSV 텍스트(출발,관계,대상[,가중치]) → {nodes, edges} */
function parseCsvRelations(text){
  const nodes = new Map();
  const edges = [];
  String(text || "").split(/\r?\n/).forEach(line => {
    const cols = line.split(/[,\t]/).map(c => c.trim()).filter((c, i) => i < 4);
    if(cols.length < 3) return;
    const [src, rel, tgt, weight] = cols;
    if(!src || !tgt) return;
    const sid = `Entity:${src}`, tid = `Entity:${tgt}`;
    if(!nodes.has(sid)) nodes.set(sid, { id: sid, label: "Entity", name: src, properties: { source: "file" } });
    if(!nodes.has(tid)) nodes.set(tid, { id: tid, label: "Entity", name: tgt, properties: { source: "file" } });
    edges.push({ source: sid, target: tid, type: rel || "관계", properties: { source: "file", weight } });
  });
  return { nodes: [...nodes.values()], edges };
}

async function runExtract(key){
  const state = filterStateFor(key);
  const textEl = document.querySelector(`[data-net-extract-text="${CSS.escape(key)}"]`);
  const text = textEl ? textEl.value.trim() : "";
  const staged = _stagedFiles.get(key) || [];
  if(!text && !staged.length){ alert("추출할 텍스트를 입력하거나 파일을 첨부하세요."); return; }

  const btn = document.querySelector(`[data-net-extract="${CSS.escape(key)}"]`);
  if(btn){ btn.disabled = true; btn.textContent = "추출 중..."; }
  try {
    let payload = { text };
    if(staged.length){
      const up = await fetch("/api/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.uploadSessionId || "", files: staged }),
      }).then(r => r.json());
      if(up.session_id){ state.uploadSessionId = up.session_id; payload.session_id = up.session_id; }
    }
    const res = await fetch("/api/graph/extract", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if(!res.ok || data.error || !data.found){
      alert(data.error || "추출된 관계가 없습니다.");
      if(btn){ btn.disabled = false; btn.textContent = "관계 추출"; }
      return;
    }
    const srcName = staged.length ? `${staged[0].name} 외 ${staged.length}건` : "직접 입력";
    _stagedFiles.set(key, []);
    mergeFileGraph(key, data.nodes || [], data.edges || [], srcName);
  } catch (e) {
    alert("관계 추출 중 오류가 발생했습니다.");
    if(btn){ btn.disabled = false; btn.textContent = "관계 추출"; }
  }
}

/* 통신/거래내역 xlsx·csv → 표준 압수정보 JSON 등록 */
async function runEvidenceImport(key){
  const state = filterStateFor(key);
  const personId = (state.evidencePersonId || "").trim();
  const kind = state.evidenceKind || "communication";
  const staged = _stagedEvidenceFile.get(key);
  if(!personId){ alert("대상 인물ID를 입력하세요."); return; }
  if(!staged){ alert("등록할 xlsx/csv 파일을 선택하세요."); return; }

  const btn = document.querySelector(`[data-net-evidence-import="${CSS.escape(key)}"]`);
  if(btn){ btn.disabled = true; btn.textContent = "등록 중..."; }
  try {
    const res = await fetch("/api/evidence/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: personId, kind, file: staged }),
    });
    const data = await res.json();
    if(!res.ok || data.error){
      state.evidenceResult = { error: data.error || `등록 실패 (${res.status})` };
      rerenderPanelByKey(key);
      return;
    }
    state.evidenceResult = { added: data.added, total: data.total, file: data.file };
    _stagedEvidenceFile.delete(key);
    const kindLabel = kind === "communication" ? "통신내역" : "거래내역";
    mergeFileGraph(key, data.nodes || [], data.edges || [], `${personId} ${kindLabel} 등록`);
  } catch (e) {
    state.evidenceResult = { error: "등록 중 오류가 발생했습니다." };
    rerenderPanelByKey(key);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = "등록"; }
  }
}

/* ── B1: 경로 탐색 API 호출 ── */
async function fetchPath(key, sourceId, targetId){
  const state = filterStateFor(key);
  try {
    const res = await fetch(`/api/graph/path?source=${encodeURIComponent(sourceId)}&target=${encodeURIComponent(targetId)}`);
    const data = await res.json();
    state.pathResult = (!res.ok || data.error)
      ? { found: false, error: data.error || `조회 실패 (${res.status})` }
      : data;
  } catch (e) {
    state.pathResult = { found: false, error: "서버 연결 실패" };
  }
  rerenderPanelByKey(key);
}

/* ── 이벤트 위임 (1회 등록): 유형 칩, 기준 노드 추가/제거, 대상 유형, 초기화, 노드 클릭, 검색, 경로 ── */
let _handlerBound = false;
function bindHandlers(){
  if(_handlerBound) return;
  _handlerBound = true;
  loadScenarios();   // 서버 저장 시나리오 1회 로드

  // 전체화면 진입/이탈 시 cytoscape 캔버스를 새 컨테이너 크기에 맞춰 리사이즈
  document.addEventListener("fullscreenchange", () => {
    _cyInstances.forEach(cy => {
      try { cy.resize(); cy.fit(undefined, 30); clampScreenSizes(cy); } catch (e) { /* noop */ }
    });
  });

  // A1: 검색 입력 — 재렌더 없이 cy에 직접 강조(입력 포커스 유지)
  document.addEventListener("input", event => {
    const searchInput = event.target.closest("[data-net-search]");
    if(searchInput){
      const key = searchInput.dataset.netSearch;
      filterStateFor(key).searchTerm = searchInput.value;
      applySearchHighlight(key, searchInput.value);
      return;
    }
    const evidencePerson = event.target.closest("[data-net-evidence-person]");
    if(evidencePerson){
      const key = evidencePerson.dataset.netEvidencePerson;
      filterStateFor(key).evidencePersonId = evidencePerson.value;
      return;
    }
    // 시나리오 이름 입력 — 재렌더 없이 상태만 갱신(입력 포커스 유지)
    const scenarioName = event.target.closest("[data-net-scenario-name]");
    if(scenarioName){
      filterStateFor(scenarioName.dataset.netScenarioName).scenarioName = scenarioName.value;
    }
  });

  document.addEventListener("click", event => {
    // 노드 정렬 툴바: 선택 노드 정렬/균등 배치 (재렌더 없이 cy 위치만 조작)
    const alignBtn = event.target.closest("[data-net-align]");
    if(alignBtn){
      const [key, mode] = alignBtn.dataset.netAlign.split("::");
      alignSelected(key, mode);
      return;
    }
    const alignClear = event.target.closest("[data-net-align-clear]");
    if(alignClear){
      const key = alignClear.dataset.netAlignClear;
      const cy = _cyInstances.get(key);
      if(cy) cy.$("node:selected").unselect();
      updateAlignToolbar(key);
      return;
    }
    // 정렬 툴바 고정 표시 토글(재렌더 없이 — 선택 상태 유지)
    const alignToggle = event.target.closest("[data-net-align-toggle]");
    if(alignToggle){
      const key = alignToggle.dataset.netAlignToggle;
      const st = filterStateFor(key);
      st.alignBarOn = !st.alignBarOn;
      alignToggle.classList.toggle("on", st.alignBarOn);
      alignToggle.innerHTML = `⠿ 정렬 툴바 ${st.alignBarOn ? "숨기기" : "보이기"}`;
      updateAlignToolbar(key);
      return;
    }
    // 관계분석 전체화면 토글
    const fsBtn = event.target.closest("[data-net-fullscreen]");
    if(fsBtn){
      toggleNetFullscreen(fsBtn.dataset.netFullscreen);
      return;
    }
    const chip = event.target.closest("[data-net-filter]");
    if(chip){
      const [key, label] = chip.dataset.netFilter.split("::");
      const state = filterStateFor(key);
      if(state.hiddenLabels.has(label)) state.hiddenLabels.delete(label);
      else state.hiddenLabels.add(label);
      rerenderPanelByKey(key);
      return;
    }
    const detailClose = event.target.closest("[data-net-detail-close]");
    if(detailClose){
      hideNetDetail(detailClose.dataset.netDetailClose);
      return;
    }
    // 자유 관계분석: 시드 제거
    const seedRm = event.target.closest("[data-net-seed-remove]");
    if(seedRm){
      const [key, kind, ...idp] = seedRm.dataset.netSeedRemove.split("::");
      const id = idp.join("::");
      const st = filterStateFor(key);
      if(kind === "company") st.seedCompanies = st.seedCompanies.filter(s => s.id !== id);
      else st.seedPersons = st.seedPersons.filter(s => s.id !== id);
      const [tt, ...r] = key.split(":"); reloadGraph(tt, r.join(":"));
      return;
    }
    // 프로파일 4-뷰 전환 (관계분석/원인분석/위험구성/경로분석)
    const viewBtn = event.target.closest("[data-net-view]");
    if(viewBtn){
      const [key, mode] = viewBtn.dataset.netView.split("::");
      filterStateFor(key).viewMode = mode;
      rerenderPanelByKey(key);
      return;
    }
    const detailFocus = event.target.closest("[data-net-detail-focus]");
    if(detailFocus){
      const [key, ...idParts] = detailFocus.dataset.netDetailFocus.split("::");
      const nodeId = idParts.join("::");
      const { draft } = filterStateFor(key);
      if(draft.focusIds.has(nodeId)) draft.focusIds.delete(nodeId);
      else draft.focusIds.add(nodeId);
      rerenderPanelByKey(key);
      return;
    }
    const detailHide = event.target.closest("[data-net-detail-hide]");
    if(detailHide){
      const [key, ...idParts] = detailHide.dataset.netDetailHide.split("::");
      const nodeId = idParts.join("::");
      const state = filterStateFor(key);
      if(state.hiddenIds.has(nodeId)) state.hiddenIds.delete(nodeId);
      else state.hiddenIds.add(nodeId);
      hideNetDetail(key);          // 숨긴 노드의 상세창은 닫는다
      rerenderPanelByKey(key);
      return;
    }
    const showAllBtn = event.target.closest("[data-net-show-all]");
    if(showAllBtn){
      const key = showAllBtn.dataset.netShowAll;
      filterStateFor(key).hiddenIds.clear();
      rerenderPanelByKey(key);
      return;
    }
    const removeBtn = event.target.closest("[data-net-focus-remove]");
    if(removeBtn){
      const [key, ...idParts] = removeBtn.dataset.netFocusRemove.split("::");
      filterStateFor(key).draft.focusIds.delete(idParts.join("::"));
      rerenderPanelByKey(key);
      return;
    }
    const addBtn = event.target.closest("[data-net-cond-add]");
    if(addBtn){
      const key = addBtn.dataset.netCondAdd;
      const state = filterStateFor(key);
      if(state.draft.focusIds.size){
        state.conditions.push({
          id: ++state.condSeq,
          focusIds: [...state.draft.focusIds],
          targetLabel: state.draft.targetLabel,
          relType: state.draft.relType,
          enabled: true,
        });
        state.draft = emptyDraft();
        rerenderPanelByKey(key);
      }
      return;
    }
    const delBtn = event.target.closest("[data-net-cond-del]");
    if(delBtn){
      const [key, condId] = delBtn.dataset.netCondDel.split("::");
      const state = filterStateFor(key);
      state.conditions = state.conditions.filter(c => String(c.id) !== condId);
      rerenderPanelByKey(key);
      return;
    }
    const resetBtn = event.target.closest("[data-net-reset]");
    if(resetBtn){
      const key = resetBtn.dataset.netReset;
      _filterState.set(key, emptyState());
      rerenderPanelByKey(key);
      return;
    }
    // B1: 경로 찾기 / 해제
    const pathFind = event.target.closest("[data-net-path-find]");
    if(pathFind){
      const key = pathFind.dataset.netPathFind;
      const state = filterStateFor(key);
      if(state.pathSrc && state.pathTgt && state.pathSrc !== state.pathTgt){
        fetchPath(key, state.pathSrc, state.pathTgt);
      }
      return;
    }
    const pathClear = event.target.closest("[data-net-path-clear]");
    if(pathClear){
      const key = pathClear.dataset.netPathClear;
      const state = filterStateFor(key);
      state.pathResult = null;
      rerenderPanelByKey(key);
      return;
    }
    // 파일 등록: CSV 관계 추가
    const csvAdd = event.target.closest("[data-net-csv-add]");
    if(csvAdd){
      const key = csvAdd.dataset.netCsvAdd;
      const ta = document.querySelector(`[data-net-csv="${CSS.escape(key)}"]`);
      const parsed = parseCsvRelations(ta ? ta.value : "");
      if(!parsed.edges.length){ alert("‘출발,관계,대상’ 형식으로 1줄 이상 입력하세요."); return; }
      if(ta) ta.value = "";
      mergeFileGraph(key, parsed.nodes, parsed.edges, "CSV 입력");
      return;
    }
    // 파일 등록: 비정형 관계 추출
    const extractBtn = event.target.closest("[data-net-extract]");
    if(extractBtn){ runExtract(extractBtn.dataset.netExtract); return; }
    // 파일 관계 비우기
    const fileClear = event.target.closest("[data-net-file-clear]");
    if(fileClear){
      const key = fileClear.dataset.netFileClear;
      const state = filterStateFor(key);
      state.fileNodes = []; state.fileEdges = []; state.fileSources = [];
      _stagedFiles.set(key, []);
      rerenderPanelByKey(key);
      return;
    }
    // 통신/거래내역 등록: xlsx/csv → 표준 JSON 변환
    const evidenceImportBtn = event.target.closest("[data-net-evidence-import]");
    if(evidenceImportBtn){ runEvidenceImport(evidenceImportBtn.dataset.netEvidenceImport); return; }
    // 분석 실행 / 해제
    const analysisRun = event.target.closest("[data-net-analysis-run]");
    if(analysisRun){
      const key = analysisRun.dataset.netAnalysisRun;
      const state = filterStateFor(key);
      const raw = currentRawGraph(key, state);
      if(raw){
        const filtered = applyFilter(raw, state);
        state.analysisResult = computeAnalysis(state.analysisMode, filtered, state.analysisSel);
        rerenderPanelByKey(key);
      }
      return;
    }
    const analysisClear = event.target.closest("[data-net-analysis-clear]");
    if(analysisClear){
      filterStateFor(analysisClear.dataset.netAnalysisClear).analysisResult = null;
      rerenderPanelByKey(analysisClear.dataset.netAnalysisClear);
      return;
    }
    // 분석 시나리오: 적용 / 저장 / 삭제
    const scenarioApply = event.target.closest("[data-net-scenario-apply]");
    if(scenarioApply){
      const key = scenarioApply.dataset.netScenarioApply;
      const state = filterStateFor(key);
      if(state.activeScenarioId) applyScenario(key, state.activeScenarioId);
      return;
    }
    const scenarioSave = event.target.closest("[data-net-scenario-save]");
    if(scenarioSave){ registerScenario(scenarioSave.dataset.netScenarioSave); return; }
    const scenarioDel = event.target.closest("[data-net-scenario-del]");
    if(scenarioDel){
      const [key, scId] = scenarioDel.dataset.netScenarioDel.split("::");
      deleteScenario(key, scId);
      return;
    }

    const nodeEl = event.target.closest("[data-net-node]");
    if(nodeEl){
      const [key, ...idParts] = nodeEl.dataset.netNode.split("::");
      const nodeId = idParts.join("::");
      const { draft } = filterStateFor(key);
      if(draft.focusIds.has(nodeId)) draft.focusIds.delete(nodeId);
      else draft.focusIds.add(nodeId);
      rerenderPanelByKey(key);
    }
  });

  document.addEventListener("change", event => {
    // 자유 관계분석: 시드/필터 변경 → 교차 그래프 재조회
    const seedC = event.target.closest("[data-net-seed-add-company]");
    if(seedC){
      if(seedC.value){
        const key = seedC.dataset.netSeedAddCompany;
        const st = filterStateFor(key);
        const ent = (_entityCache?.companies || []).find(c => c.company_id === seedC.value);
        if(!st.seedCompanies.some(s => s.id === seedC.value))
          st.seedCompanies.push({ id: seedC.value, name: ent?.company_name || seedC.value });
        const [tt, ...r] = key.split(":"); reloadGraph(tt, r.join(":"));
      }
      return;
    }
    const seedP = event.target.closest("[data-net-seed-add-person]");
    if(seedP){
      if(seedP.value){
        const key = seedP.dataset.netSeedAddPerson;
        const st = filterStateFor(key);
        const ent = (_entityCache?.persons || []).find(p => p.person_id === seedP.value);
        if(!st.seedPersons.some(s => s.id === seedP.value))
          st.seedPersons.push({ id: seedP.value, name: ent?.name || seedP.value });
        const [tt, ...r] = key.split(":"); reloadGraph(tt, r.join(":"));
      }
      return;
    }
    const fRisk = event.target.closest("[data-net-filter-risk]");
    if(fRisk){
      const key = fRisk.dataset.netFilterRisk;
      filterStateFor(key).filterRiskLevel = fRisk.value || "";
      const [tt, ...r] = key.split(":"); reloadGraph(tt, r.join(":"));
      return;
    }
    const fReg = event.target.closest("[data-net-filter-region]");
    if(fReg){
      const key = fReg.dataset.netFilterRegion;
      filterStateFor(key).filterRegion = fReg.value.trim();
      const [tt, ...r] = key.split(":"); reloadGraph(tt, r.join(":"));
      return;
    }
    const scenarioSelect = event.target.closest("[data-net-scenario-select]");
    if(scenarioSelect){
      const key = scenarioSelect.dataset.netScenarioSelect;
      filterStateFor(key).activeScenarioId = scenarioSelect.value || "";
      rerenderPanelByKey(key);
      return;
    }
    const condToggle = event.target.closest("[data-net-cond-toggle]");
    if(condToggle){
      const [key, condId] = condToggle.dataset.netCondToggle.split("::");
      const cond = filterStateFor(key).conditions.find(c => String(c.id) === condId);
      if(cond) cond.enabled = condToggle.checked;
      rerenderPanelByKey(key);
      return;
    }
    const focusSelect = event.target.closest("[data-net-focus-select]");
    if(focusSelect){
      const key = focusSelect.dataset.netFocusSelect;
      if(focusSelect.value){
        filterStateFor(key).draft.focusIds.add(focusSelect.value);
        rerenderPanelByKey(key);
      }
      return;
    }
    const targetSelect = event.target.closest("[data-net-target-select]");
    if(targetSelect){
      const key = targetSelect.dataset.netTargetSelect;
      filterStateFor(key).draft.targetLabel = targetSelect.value || "";
      rerenderPanelByKey(key);
      return;
    }
    const relSelect = event.target.closest("[data-net-rel-select]");
    if(relSelect){
      const key = relSelect.dataset.netRelSelect;
      filterStateFor(key).draft.relType = relSelect.value || "";
      rerenderPanelByKey(key);
      return;
    }
    // B1: 경로 출발/도착 노드 선택 (버튼 활성화 상태 갱신 위해 재렌더)
    const pathSrcSel = event.target.closest("[data-net-path-src]");
    if(pathSrcSel){
      const key = pathSrcSel.dataset.netPathSrc;
      filterStateFor(key).pathSrc = pathSrcSel.value || "";
      rerenderPanelByKey(key);
      return;
    }
    const pathTgtSel = event.target.closest("[data-net-path-tgt]");
    if(pathTgtSel){
      const key = pathTgtSel.dataset.netPathTgt;
      filterStateFor(key).pathTgt = pathTgtSel.value || "";
      rerenderPanelByKey(key);
      return;
    }
    // 데이터 소스: hop 변경 → Neo4j 재조회
    const hopsSel = event.target.closest("[data-net-hops]");
    if(hopsSel){
      const key = hopsSel.dataset.netHops;
      filterStateFor(key).hops = Number(hopsSel.value) || 1;
      const [tt, ...rest] = key.split(":");
      reloadGraph(tt, rest.join(":"));
      return;
    }
    // 분석 기법: 방법 변경
    const modeSel = event.target.closest("[data-net-analysis-mode]");
    if(modeSel){
      const key = modeSel.dataset.netAnalysisMode;
      const state = filterStateFor(key);
      state.analysisMode = modeSel.value || "";
      state.analysisResult = null;
      rerenderPanelByKey(key);
      return;
    }
    const selA = event.target.closest("[data-net-analysis-a]");
    if(selA){ const k = selA.dataset.netAnalysisA; const s = filterStateFor(k); s.analysisSel = [selA.value, s.analysisSel[1] || ""]; return; }
    const selB = event.target.closest("[data-net-analysis-b]");
    if(selB){ const k = selB.dataset.netAnalysisB; const s = filterStateFor(k); s.analysisSel = [s.analysisSel[0] || "", selB.value]; return; }
    // 비정형 파일 첨부 → 읽어서 스테이징
    const fileInput = event.target.closest("[data-net-extract-file]");
    if(fileInput && fileInput.files && fileInput.files.length){
      const key = fileInput.dataset.netExtractFile;
      const files = [...fileInput.files];
      Promise.all(files.map(readFileEntry)).then(entries => {
        const valid = entries.filter(Boolean);
        const cur = _stagedFiles.get(key) || [];
        _stagedFiles.set(key, [...cur, ...valid]);
        const btn = document.querySelector(`[data-net-extract="${CSS.escape(key)}"]`);
        if(btn) btn.textContent = `관계 추출 (${(_stagedFiles.get(key) || []).length}개 첨부)`;
      });
      return;
    }
    // 통신/거래내역 등록: 구분 변경
    const evidenceKindSel = event.target.closest("[data-net-evidence-kind]");
    if(evidenceKindSel){
      const key = evidenceKindSel.dataset.netEvidenceKind;
      filterStateFor(key).evidenceKind = evidenceKindSel.value;
      filterStateFor(key).evidenceResult = null;
      rerenderPanelByKey(key);
      return;
    }
    // 통신/거래내역 등록: 파일 첨부 → 읽어서 스테이징
    const evidenceFileInput = event.target.closest("[data-net-evidence-file]");
    if(evidenceFileInput && evidenceFileInput.files && evidenceFileInput.files.length){
      const key = evidenceFileInput.dataset.netEvidenceFile;
      readFileEntry(evidenceFileInput.files[0]).then(entry => {
        if(entry) _stagedEvidenceFile.set(key, entry);
        filterStateFor(key).evidenceResult = null;
        rerenderPanelByKey(key);
      });
      return;
    }
  });
}

/** 우측 관계망 패널 HTML (그래프는 비동기 주입)
 *  opts.workbench=true → 좌측 데이터소스/파일등록/분석 제어 패널 포함(관계망분석 서브탭용) */
export function networkGraphPanelHtml(targetType, targetId, title = "관계망 분석", opts = {}){
  bindHandlers();
  const id = containerId(targetType, targetId);
  const state = filterStateFor(graphKey(targetType, targetId));
  state.workbench = !!opts.workbench;
  state.explore = !!opts.explore || targetType === "explore";
  if(opts.domain !== undefined) state.domain = opts.domain || "";
  // 자유 관계분석: 시드 선택용 엔티티 목록 로드 후 좌측 컨트롤 갱신
  if(state.explore){
    loadEntities(() => rerenderPanelByKey(graphKey(targetType, targetId)));
  }
  // 렌더 직후 비동기 로드 (캐시 있으면 즉시 그려짐)
  setTimeout(() => loadGraphInto(targetType, targetId), 0);
  return `
    <section class="profile-net-frame${state.workbench ? " net-frame-wb" : ""}">
      <div class="profile-net-frame-head">
        <h4>${escapeHtml(title)}</h4>
        <span class="muted">호버: 이웃 강조 · 클릭: 상세 · 더블클릭: 기준 노드 · 휠: 줌</span>
      </div>
      <div class="profile-net-body" id="${id}">
        ${renderPanelContent(targetType, targetId)}
      </div>
    </section>
  `;
}

/* 페이지 → 우범자 관계망 도메인 필터(설계 정의서 §6). 기업 그래프는 도메인 비종속이라 무시됨. */
export function graphDomainForPage(pageKey){
  return ({ fxsearch: "forex", lawsearch: "drug", generalinv: "general" })[pageKey] || "";
}

/** 좌측 대시보드(50%) + 우측 관계망 그래프(50%) 레이아웃 */
export function profileNetworkLayout(leftHtml, targetType, targetId, title = "분석 대상 기준 관계분석", domain = ""){
  if(!targetId) return leftHtml;
  return `
    <div class="profile-net-layout">
      <div class="profile-net-left">${leftHtml}</div>
      <div class="resize-gutter x" data-resize-min="220" title="드래그하여 좌·우 프레임 크기 조절"></div>
      <aside class="profile-net-right">
        ${networkGraphPanelHtml(targetType, targetId, title, { domain })}
      </aside>
    </div>
  `;
}
