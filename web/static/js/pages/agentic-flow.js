/* AI Agentic 서비스 — Drawflow 캔버스 컨트롤러.
   전역 render() 의 innerHTML 교체와 충돌하지 않도록, 캔버스 컨테이너에만
   Drawflow 인스턴스를 마운트하고 명령형으로 관리한다.
   상태의 단일 진실원은 editor.export() JSON (서비스별 service.drawflow). */
import {
  agenticNodeTypeDef,
  agenticNodePorts,
  agenticNodeInnerHtml,
  agenticOutputLabels,
  defaultNodeData,
} from "./agentic-service.js";

const DRAWFLOW_JS  = "/static/vendor/drawflow.min.js";
const DRAWFLOW_CSS = "/static/vendor/drawflow.min.css";
const DAGRE_JS     = "/static/vendor/dagre.min.js";

let _drawflowPromise = null;
let _dagrePromise = null;

/* Drawflow 스크립트/스타일 지연 로드 (CDN이 아닌 로컬 벤더링). */
export function loadDrawflow(){
  if(window.Drawflow) return Promise.resolve(window.Drawflow);
  if(_drawflowPromise) return _drawflowPromise;
  _drawflowPromise = new Promise((resolve, reject) => {
    if(!document.querySelector(`link[href="${DRAWFLOW_CSS}"]`)){
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = DRAWFLOW_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = DRAWFLOW_JS;
    script.onload = () => window.Drawflow ? resolve(window.Drawflow) : reject(new Error("Drawflow load failed"));
    script.onerror = () => reject(new Error("Drawflow load failed"));
    document.body.appendChild(script);
  });
  return _drawflowPromise;
}

/* dagre 자동 레이아웃 라이브러리 지연 로드 (로컬 벤더링) */
export function loadDagre(){
  if(window.dagre) return Promise.resolve(window.dagre);
  if(_dagrePromise) return _dagrePromise;
  _dagrePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = DAGRE_JS;
    script.onload = () => window.dagre ? resolve(window.dagre) : reject(new Error("dagre load failed"));
    script.onerror = () => reject(new Error("dagre load failed"));
    document.body.appendChild(script);
  });
  return _dagrePromise;
}

function hasFlowData(service){
  try{ return Object.keys(service?.drawflow?.drawflow?.Home?.data || {}).length > 0; }
  catch(e){ return false; }
}

/* Drawflow는 import 시 노드를 저장된 html 문자열로 다시 그린다(data가 아님).
   따라서 노드 데이터가 바뀌면 저장 html도 동기화해야 라운드트립이 맞다. */
function syncNodeHtml(editor, id, data){
  try{
    const store = editor.drawflow.drawflow[editor.module].data[id];
    if(store) store.html = agenticNodeInnerHtml(data.type, data);
  }catch(e){ /* noop */ }
}

/* import 직후: 저장 html이 과거값일 수 있으므로 data 기준으로 노드 내용을 재생성한다. */
function refreshImportedNodes(editor, container){
  try{
    const data = editor.drawflow.drawflow[editor.module].data;
    Object.values(data).forEach(n => {
      const fresh = agenticNodeInnerHtml(n.data?.type, n.data || {});
      n.html = fresh;
      const contentEl = container.querySelector(`#node-${n.id} .drawflow_content_node`);
      if(contentEl) contentEl.innerHTML = fresh;
    });
  }catch(e){ /* noop */ }
}

/* 분기/반복 노드의 출력 포트 옆에 라벨(참/거짓·본문/종료)을 그린다.
   Drawflow 내부 구조에 의존하지 않고 DOM의 노드 타입 클래스(agentic-type-*)에서 읽는다. */
function decoratePorts(editor, container){
  // setTimeout(0) — requestAnimationFrame은 백그라운드/비표시 탭에서 발화하지 않을 수 있다.
  setTimeout(() => {
    try{
      container.querySelectorAll(".drawflow-node").forEach(nodeEl => {
        nodeEl.querySelectorAll(".agentic-port-label").forEach(e => e.remove());
        const typeClass = [...nodeEl.classList].find(c => c.startsWith("agentic-type-"));
        const type = typeClass ? typeClass.replace("agentic-type-", "") : null;
        const labels = type ? agenticOutputLabels(type) : null;
        if(!labels) return;
        labels.forEach((text, idx) => {
          const port = nodeEl.querySelector(`.outputs .output_${idx + 1}`);
          if(!port) return;
          const span = document.createElement("span");
          span.className = "agentic-port-label";
          span.textContent = text;
          span.style.top = `${port.offsetTop + port.offsetHeight / 2}px`;
          nodeEl.appendChild(span);
        });
      });
    }catch(e){ /* noop */ }
  }, 0);
}

/* 새 서비스 기본 흐름: 시작 → 나의 에이전트 → 종료 */
function seedDefaultFlow(editor){
  const startData = defaultNodeData("start");
  const agentData = { ...defaultNodeData("agent"), label: "나의 에이전트" };
  const endData   = defaultNodeData("end");
  const startId = editor.addNode("start", 0, 1,  30, 110, "agentic-df tone-go agentic-type-start",    startData, agenticNodeInnerHtml("start", startData));
  const agentId = editor.addNode("agent", 1, 1, 205, 110, "agentic-df tone-agent agentic-type-agent", agentData, agenticNodeInnerHtml("agent", agentData));
  const endId   = editor.addNode("end",   1, 0, 380, 110, "agentic-df tone-stop agentic-type-end",  endData,   agenticNodeInnerHtml("end", endData));
  editor.addConnection(startId, agentId, "output_1", "input_1");
  editor.addConnection(agentId, endId,   "output_1", "input_1");
}

/* 새 노드 배치 위치 — 기존 노드들의 오른쪽에 둔다. */
/* 새 노드는 현재 보이는 캔버스 영역 안에 격자(grid)로 배치한다.
   Drawflow 팬(canvas_x/y)·줌(zoom)을 역산해 화면 좌상단을 캔버스 좌표로 변환하고,
   뷰포트 크기에 맞춰 열·행 수를 정해 화면 밖으로 벗어나지 않게 한다. */
function nextPosition(editor, container){
  try{
    const data = editor.drawflow.drawflow[editor.module].data;
    const slot = Object.keys(data).length;          // 다음 배치 슬롯
    const rect = container.getBoundingClientRect();
    const zoom = editor.zoom || 1;
    const cx = editor.canvas_x || 0;
    const cy = editor.canvas_y || 0;
    const viewW = rect.width / zoom;
    const viewH = rect.height / zoom;
    const colW = 168, rowH = 96;
    const cols = Math.max(2, Math.floor((viewW - 48) / colW));
    const rows = Math.max(2, Math.floor((viewH - 48) / rowH));
    const baseX = (-cx) / zoom + 28;
    const baseY = (-cy) / zoom + 28;
    const x = baseX + (slot % cols) * colW;
    const y = baseY + (Math.floor(slot / cols) % rows) * rowH;
    return { x: Math.round(x), y: Math.round(y) };
  }catch(e){
    return { x: 90, y: 120 };
  }
}

/* 연결 유효성 검사 — 부적합 사유 문자열 반환(적합하면 null). */
function invalidConnectionReason(editor, info){
  const { output_id, input_id, output_class, input_class } = info;
  if(String(output_id) === String(input_id)) return "같은 노드끼리는 연결할 수 없습니다.";
  const node = editor.getNodeFromId(output_id);
  const conns = node?.outputs?.[output_class]?.connections || [];
  // 방금 생성분 포함 동일 경로가 2개 이상이면 중복
  const dupes = conns.filter(c => String(c.node) === String(input_id) && c.output === input_class);
  if(dupes.length > 1) return "이미 연결된 경로입니다.";
  return null;
}

/* 캔버스 내 일시 알림 토스트 */
function flashMessage(container, text){
  let toast = container.querySelector(".agentic-toast");
  if(!toast){
    toast = document.createElement("div");
    toast.className = "agentic-toast";
    container.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 2200);
}

export function createAgenticFlow({ container, service, persist, onSelect, onConnectionsChange, onNodeRemoved, locked = true }){
  const editor = new window.Drawflow(container);
  editor.reroute = true;
  editor.start();

  if(hasFlowData(service)){
    editor.import(service.drawflow);
    refreshImportedNodes(editor, container);
  }else{
    seedDefaultFlow(editor);
    persist(editor.export());
  }
  decoratePorts(editor, container);

  /* 모든 노드가 보이도록 줌·팬을 맞춘다 (화면 밖 노드 복구). */
  function doFitView(){
    try{
      const data = editor.drawflow.drawflow[editor.module].data;
      const nodes = Object.values(data);
      if(!nodes.length) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach(n => {
        const el = container.querySelector(`#node-${n.id}`);
        const w = el ? el.offsetWidth : 140, h = el ? el.offsetHeight : 44;
        minX = Math.min(minX, n.pos_x); minY = Math.min(minY, n.pos_y);
        maxX = Math.max(maxX, n.pos_x + w + 24); maxY = Math.max(maxY, n.pos_y + h);
      });
      const rect = container.getBoundingClientRect();
      const pad = 24;
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      // 캔버스보다 큰 경우에만 축소, 작으면 원본 배율 유지(불필요한 센터링 방지)
      let z = Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh, 1);
      z = Math.max(editor.zoom_min || 0.4, Math.min(z, editor.zoom_max || 1.6));
      // 세로 중앙정렬 대신 좌상단 정렬(여백 pad만) — 그래프가 항상 캔버스 좌상단에서 시작
      const cx = pad - minX * z;
      const cy = pad - minY * z;
      editor.zoom = z; editor.canvas_x = cx; editor.canvas_y = cy;
      editor.precanvas.style.transform = `translate(${cx}px, ${cy}px) scale(${z})`;
    }catch(e){ /* noop */ }
  }

  // 단일 클릭 = 선택 표시만(이동/선택). 속성창 열기는 더블클릭으로 분리한다.
  // 잠금(fixed) 모드에서는 Drawflow가 노드 선택을 막으므로 클릭→선택 표시를 직접 처리한다.
  editor.on("click", (ev) => {
    if(editor.editor_mode !== "fixed") return;
    const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".drawflow-node") : null;
    container.querySelectorAll(".drawflow-node.selected").forEach(el => el.classList.remove("selected"));
    if(nodeEl){ nodeEl.classList.add("selected"); }   // 선택 표시만, 속성창은 더블클릭
    else onSelect(null);                               // 빈 곳 클릭 = 속성창 닫기
  });

  // 더블클릭 = 속성창(인스펙터) 열기. (편집·잠금 모드 공통)
  container.addEventListener("dblclick", (ev) => {
    const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".drawflow-node") : null;
    if(!nodeEl) return;
    container.querySelectorAll(".drawflow-node.selected").forEach(el => el.classList.remove("selected"));
    nodeEl.classList.add("selected");
    onSelect(nodeEl.id.replace("node-", ""));
  });

  editor.editor_mode = locked ? "fixed" : "edit";
  setTimeout(doFitView, 30);   // 초기 진입 시 전체 보이도록

  // ── 연결 유효성 검사 ──
  // Drawflow는 자기연결(출력=입력 동일 노드)·중복 경로를 기본 차단한다.
  // (1) 방어적 재검증: 혹시 생성됐다면 제거 + 사유 안내.
  // (2) 포트에 드롭했으나 거절된 경우에만 피드백(빈 캔버스 드롭 취소와 구분).
  let releasedOnInput = false;
  container.addEventListener("mouseup", e => {
    releasedOnInput = !!(e.target.closest && e.target.closest(".input"));
  }, true);

  editor.on("connectionCreated", info => {
    const reason = invalidConnectionReason(editor, info);
    if(reason){
      setTimeout(() => {
        try{ editor.removeSingleConnection(info.output_id, info.input_id, info.output_class, info.input_class); }catch(e){ /* noop */ }
        flashMessage(container, reason);
      }, 0);
    }
  });
  editor.on("connectionCancel", () => {
    if(releasedOnInput) flashMessage(container, "이미 연결되어 있거나 연결할 수 없는 포트입니다.");
    releasedOnInput = false;
  });

  // 단일 클릭 선택은 속성창을 열지 않는다(이동/선택만). 속성창은 위 더블클릭 핸들러로 연다.
  editor.on("nodeUnselected", () => onSelect(null));   // 빈 곳/다른 곳 클릭 = 속성창 닫기
  ["nodeMoved", "connectionCreated", "connectionRemoved", "connectionSelected", "nodeRemoved"].forEach(ev =>
    editor.on(ev, () => persist(editor.export())));
  // 노드 삭제(인스펙터 버튼 또는 Delete 키) → 선택 해제 + 인스펙터 갱신
  editor.on("nodeRemoved", () => { if(onNodeRemoved) onNodeRemoved(); });
  // 연결 변경 시 인스펙터(분기 라우팅 표시)를 갱신
  ["connectionCreated", "connectionRemoved"].forEach(ev =>
    editor.on(ev, () => { if(onConnectionsChange) onConnectionsChange(); }));

  return {
    editor,

    addNode(type){
      const def = agenticNodeTypeDef(type);
      const ports = agenticNodePorts(type);
      const data = defaultNodeData(type);
      const pos = nextPosition(editor, container);
      const id = editor.addNode(type, ports.in, ports.out, pos.x, pos.y,
        `agentic-df tone-${def.tone} agentic-type-${type}`, data, agenticNodeInnerHtml(type, data));
      decoratePorts(editor, container);
      persist(editor.export());
      return id;
    },

    async autoLayout(){
      let dagre;
      try{ dagre = await loadDagre(); }catch(e){ return false; }
      const exported = editor.export();
      const nodes = exported.drawflow?.[editor.module]?.data || {};
      if(!Object.keys(nodes).length) return false;
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 90, marginx: 30, marginy: 30 });
      g.setDefaultEdgeLabel(() => ({}));
      Object.values(nodes).forEach(n => {
        const el = container.querySelector(`#node-${n.id}`);
        g.setNode(String(n.id), { width: el?.offsetWidth || 150, height: el?.offsetHeight || 64 });
      });
      Object.values(nodes).forEach(n => {
        Object.values(n.outputs || {}).forEach(out => {
          (out.connections || []).forEach(c => g.setEdge(String(n.id), String(c.node)));
        });
      });
      dagre.layout(g);
      Object.values(nodes).forEach(n => {
        const p = g.node(String(n.id));
        if(p){ n.pos_x = Math.round(p.x - p.width / 2); n.pos_y = Math.round(p.y - p.height / 2); }
      });
      editor.import(exported);
      refreshImportedNodes(editor, container);
      decoratePorts(editor, container);
      setTimeout(doFitView, 30);   // 정렬 후 전체가 보이도록 화면 맞춤
      persist(editor.export());
      return true;
    },

    selectNode(id){
      // 선택 '표시'만 한다. (편집모드에서 mousedown을 쏘면 Drawflow가 드래그를 시작해
      //  노드가 마우스를 따라다니다 클릭해야 고정되는 문제가 생기므로 dispatch 금지)
      const el = container.querySelector(`#node-${id}`);
      if(!el) return;
      container.querySelectorAll(".drawflow-node.selected").forEach(n => n.classList.remove("selected"));
      el.classList.add("selected");
      onSelect(String(id));
    },

    getNodeData(id){
      const node = editor.getNodeFromId(id);
      if(!node) return null;
      const result = { id, ...node.data };
      // 분기/반복 노드: 출력 포트별 연결 대상 노드명을 함께 제공
      const labels = agenticOutputLabels(node.data?.type);
      if(labels){
        result._outputs = labels.map((label, idx) => {
          const out = node.outputs?.[`output_${idx + 1}`];
          const targets = (out?.connections || []).map(c => {
            const tgt = editor.getNodeFromId(c.node);
            return tgt?.data?.label || agenticNodeTypeDef(tgt?.data?.type).label || String(c.node);
          });
          return { label, targets };
        });
      }
      return result;
    },

    updateNodeData(id, patch){
      const node = editor.getNodeFromId(id);
      if(!node) return;
      const data = { ...node.data, ...patch };
      editor.updateNodeDataFromId(id, data);
      syncNodeHtml(editor, id, data);   // 저장 html을 data와 동기화 (라운드트립 보장)
      if("label" in patch){
        const titleEl = container.querySelector(`#node-${id} .agentic-df-title`);
        if(titleEl) titleEl.textContent = patch.label || agenticNodeTypeDef(data.type).label;
      }
      persist(editor.export());
    },

    removeNode(id){
      editor.removeNodeId(`node-${id}`);
      persist(editor.export());
    },

    zoomIn(){ editor.zoom_in(); },
    zoomOut(){ editor.zoom_out(); },
    zoomReset(){ editor.zoom_reset(); },
    fitView(){ doFitView(); },
    setLocked(lock){ editor.editor_mode = lock ? "fixed" : "edit"; },
    isLocked(){ return editor.editor_mode === "fixed"; },

    /* 실행용 그래프 추출: 노드 + 방향 엣지(출력→입력) */
    getGraph(){
      const data = editor.drawflow.drawflow[editor.module].data;
      const nodes = Object.values(data).map(n => ({ id: String(n.id), type: n.data?.type, data: n.data || {} }));
      const edges = [];
      Object.values(data).forEach(n => {
        Object.entries(n.outputs || {}).forEach(([port, out]) => {
          (out.connections || []).forEach(c => edges.push({ from: String(n.id), to: String(c.node), fromPort: port }));
        });
      });
      return { nodes, edges };
    },

    /* 실행 중 노드 상태 표시 (running/done/error) */
    setNodeStatus(id, status){
      const el = container.querySelector(`#node-${id}`);
      if(!el) return;
      el.classList.remove("is-running", "is-done", "is-error");
      if(status) el.classList.add(`is-${status}`);
    },
    clearStatuses(){
      container.querySelectorAll(".drawflow-node").forEach(el =>
        el.classList.remove("is-running", "is-done", "is-error"));
    },

    destroy(){
      try{ editor.clear(); }catch(e){ /* noop */ }
    },
  };
}
