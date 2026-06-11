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
  Broker:        "#9333ea",
  HsCode:        "#0891b2",
  Item:          "#65a30d",
  Industry:      "#a16207",
  Region:        "#475569",
  RelatedCompany:"#1d4ed8",
};
const NODE_LABEL_KO = {
  Person: "인물", Company: "기업", Declaration: "수입신고",
  Country: "국가", Case: "사건", SmugglingCase: "사건",
  Org: "조직", Organization: "조직", Evidence: "증거",
  RiskIndicator: "위험지표", RiskScore: "위험점수", AnalysisResult: "분석이력",
  Broker: "관세사", HsCode: "HS코드", Item: "품목",
  Industry: "업종", Region: "지역", RelatedCompany: "관계사",
};

function nodeColor(label){
  return NODE_COLORS[label] || "#64748b";
}
function nodeLabelKo(label){
  return NODE_LABEL_KO[label] || label;
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
  return { hiddenLabels: new Set(), draft: emptyDraft(), conditions: [], condSeq: 0 };
}
function filterStateFor(key){
  if(!_filterState.has(key)) _filterState.set(key, emptyState());
  return _filterState.get(key);
}

function graphUrl(targetType, targetId){
  return targetType === "person"
    ? `/api/graph/person?person_id=${encodeURIComponent(targetId)}`
    : `/api/graph/company?company_id=${encodeURIComponent(targetId)}`;
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

/* 필터 적용된 그래프 → cytoscape elements */
function cyElements(graph){
  const coreSet = new Set(graph.coreIds || [graph.center]);
  const nodes = graph.nodes || [];
  const directIds = new Set();
  (graph.edges || []).forEach(e => {
    if(coreSet.has(e.source) && !coreSet.has(e.target)) directIds.add(e.target);
    if(coreSet.has(e.target) && !coreSet.has(e.source)) directIds.add(e.source);
  });
  const nodeEls = nodes.map(n => ({
    data: {
      id: n.id,
      name: n.name,
      typeKo: nodeLabelKo(n.label),
      color: nodeColor(n.label),
      ring: coreSet.has(n.id) ? 3 : (directIds.has(n.id) ? 2 : 1),
      core: coreSet.has(n.id) ? 1 : 0,
    },
  }));
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeEls = (graph.edges || [])
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e, i) => ({ data: { id: `e${i}`, source: e.source, target: e.target, type: e.type } }));
  return [...nodeEls, ...edgeEls];
}

const CY_STYLE = [
  { selector: "node", style: {
      "background-color": "data(color)",
      "label": "data(name)",
      "color": "#fff",
      "font-size": "12px",
      "font-weight": 800,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "ellipsis",
      "text-max-width": "62px",
      "width": 52, "height": 52,
      "border-width": 3, "border-color": "#fff",
      "text-outline-width": 2, "text-outline-color": "data(color)",
  }},
  { selector: "node[core = 1]", style: {
      "width": 72, "height": 72,
      "font-size": "13px",
      "border-width": 4, "border-color": "#dc2626",
  }},
  { selector: "edge", style: {
      "curve-style": "bezier",
      "line-color": "#9bbcff",
      "width": 2,
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#9bbcff",
      "arrow-scale": 1.1,
      "label": "data(type)",
      "font-size": "10px",
      "font-weight": 700,
      "color": "#64748b",
      "text-rotation": "autorotate",
      "text-background-color": "#f8fbff",
      "text-background-opacity": .9,
      "text-background-padding": "2px",
  }},
];

/* 그래프 영역에 cytoscape 마운트 (이전 인스턴스는 파기) */
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
      layout: {
        name: "concentric",
        concentric: node => node.data("ring"),
        levelWidth: () => 1,
        minNodeSpacing: 26,
        padding: 14,
        animate: false,
      },
      wheelSensitivity: .25,
      maxZoom: 3, minZoom: .3,
    });
    cy.on("tap", "node", evt => {
      const nodeId = evt.target.id();
      const { draft } = filterStateFor(key);
      if(draft.focusIds.has(nodeId)) draft.focusIds.delete(nodeId);
      else draft.focusIds.add(nodeId);
      rerenderPanelByKey(key);
    });
    _cyInstances.set(key, cy);
  }).catch(() => {
    // CDN 차단 등으로 cytoscape 로드 실패 → 자체 SVG 렌더러 폴백
    area.outerHTML = `<div class="profile-net-svg-fallback">${buildGraphSvg(filteredGraph, key)}</div>`;
  });
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
function applyFilter(graph, state){
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
      <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>
      <text x="${mx.toFixed(1)}" y="${(my - 3).toFixed(1)}" class="edge-label" text-anchor="middle">${escapeHtml(truncate(e.type, 12))}</text>
    `;
  }).join("");

  const nodeSvg = nodes.map(node => {
    const p = pos[node.id];
    if(!p) return "";
    const isCore = coreSet.has(node.id);
    const r = isCore ? 34 : 24;
    return `
      <g class="net-node" data-net-node="${escapeHtml(key)}::${escapeHtml(node.id)}" style="cursor:pointer">
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${nodeColor(node.label)}"
          ${isCore ? 'stroke="#dc2626" stroke-width="3"' : ""}>
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

/* ── 상단 유형 칩 필터 ── */
function buildFilterBar(rawGraph, state, key){
  const counts = new Map();
  (rawGraph.nodes || []).forEach(n => counts.set(n.label, (counts.get(n.label) || 0) + 1));
  const labels = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  if(labels.length <= 1) return "";
  return `
    <div class="profile-net-filter">
      <span class="profile-net-filter-title">유형</span>
      ${labels.map(label => `
        <button type="button" class="profile-net-filter-chip${state.hiddenLabels.has(label) ? " off" : ""}"
          data-net-filter="${escapeHtml(key)}::${escapeHtml(label)}">
          <i style="background:${nodeColor(label)}"></i>${escapeHtml(nodeLabelKo(label))}
          <b>${counts.get(label)}</b>
        </button>
      `).join("")}
    </div>
  `;
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
      `<option value="${escapeHtml(t)}" ${draft.relType === t ? "selected" : ""}>${escapeHtml(t)}</option>`))
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
        <span class="muted">기준 노드(다중) + 연결 대상 유형 + 관계 유형 → [조건 추가]. 그래프의 노드를 클릭해도 기준으로 추가됩니다.</span>
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
        <td class="net-rel">${escapeHtml(e.type)}</td>
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

/* ── 패널 내부 콘텐츠 렌더 ── */
function renderPanelContent(targetType, targetId){
  const key = graphKey(targetType, targetId);
  const raw = _graphCache.get(key);
  if(!raw) return `<div class="profile-net-empty"><span class="home-running-dot"></span> 관계망 로딩 중...</div>`;
  const state = filterStateFor(key);
  const filtered = applyFilter(raw, state);
  const graphArea = filtered.nodes.length
    ? `<div class="profile-net-cy" data-net-cy="${escapeHtml(key)}"></div>`
    : `<div class="profile-net-empty">표시할 관계망 데이터가 없습니다.<br><span class="muted">필터 조건을 확인하세요.</span></div>`;
  return `
    ${buildFilterBar(raw, state, key)}
    <div class="profile-net-graph-area">${graphArea}</div>
    ${buildConditionBuilder(raw, state, key)}
    <div class="profile-net-list-head">
      <strong>관계 데이터 목록</strong>
      <span class="muted">노드 ${filtered.nodes.length} · 관계 ${filtered.edges.length}</span>
    </div>
    ${buildEdgeTable(filtered)}
  `;
}

/* 패널 HTML 주입 + cytoscape 마운트 */
function renderPanelInto(el, targetType, targetId){
  const key = graphKey(targetType, targetId);
  el.innerHTML = renderPanelContent(targetType, targetId);
  const raw = _graphCache.get(key);
  if(raw){
    const filtered = applyFilter(raw, filterStateFor(key));
    if(filtered.nodes.length) mountCytoscape(key, filtered);
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
    const res = await fetch(graphUrl(targetType, targetId));
    const data = await res.json();
    if(!res.ok || data.error){
      const message = data.error || `그래프 조회 실패 (${res.status})`;
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

/* ── 이벤트 위임 (1회 등록): 유형 칩, 기준 노드 추가/제거, 대상 유형, 초기화, 노드 클릭 ── */
let _handlerBound = false;
function bindHandlers(){
  if(_handlerBound) return;
  _handlerBound = true;

  document.addEventListener("click", event => {
    const chip = event.target.closest("[data-net-filter]");
    if(chip){
      const [key, label] = chip.dataset.netFilter.split("::");
      const state = filterStateFor(key);
      if(state.hiddenLabels.has(label)) state.hiddenLabels.delete(label);
      else state.hiddenLabels.add(label);
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
    }
  });
}

/** 우측 관계망 패널 HTML (그래프는 비동기 주입) */
export function networkGraphPanelHtml(targetType, targetId, title = "관계망 그래프"){
  bindHandlers();
  const id = containerId(targetType, targetId);
  // 렌더 직후 비동기 로드 (캐시 있으면 즉시 그려짐)
  setTimeout(() => loadGraphInto(targetType, targetId), 0);
  return `
    <section class="profile-net-frame">
      <div class="profile-net-frame-head">
        <h4>${escapeHtml(title)}</h4>
        <span class="muted">Neo4j · ${targetType === "person" ? "우범자" : "기업"} 중심 2단계 관계</span>
      </div>
      <div class="profile-net-body" id="${id}">
        ${renderPanelContent(targetType, targetId)}
      </div>
    </section>
  `;
}

/** 좌측 대시보드(60%) + 우측 관계망 그래프(40%) 레이아웃 */
export function profileNetworkLayout(leftHtml, targetType, targetId, title){
  if(!targetId) return leftHtml;
  return `
    <div class="profile-net-layout">
      <div class="profile-net-left">${leftHtml}</div>
      <aside class="profile-net-right">
        ${networkGraphPanelHtml(targetType, targetId, title)}
      </aside>
    </div>
  `;
}
