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
        const nodeData = editor.getNodeFromId(nodeEl.id.replace("node-", ""))?.data;
        // 노드별 커스텀 분기 이름(outLabels) 우선, 없으면 타입 기본 라벨
        const labels = (nodeData && nodeData.outLabels) || (type ? agenticOutputLabels(type) : null);
        if(!labels) return;
        labels.forEach((text, idx) => {
          if(!text) return;
          const port = nodeEl.querySelector(`.outputs .output_${idx + 1}`);
          if(!port) return;
          const span = document.createElement("span");
          span.className = "agentic-port-label";
          span.textContent = text;
          // 연결점 '밖'(선 쪽)에 표시 — 포트 오른쪽 바깥에 배치
          span.style.left = `${port.offsetLeft + port.offsetWidth + 6}px`;
          span.style.top  = `${port.offsetTop + port.offsetHeight / 2}px`;
          nodeEl.appendChild(span);
        });
      });
    }catch(e){ /* noop */ }
  }, 0);
}

/* 새 서비스 기본 흐름: 시작 → 나의 에이전트 → 종료 (좌 입력·우 출력 각 1개) */
function seedDefaultFlow(editor){
  const startData = defaultNodeData("start");
  const agentData = { ...defaultNodeData("agent"), label: "나의 에이전트" };
  const endData   = defaultNodeData("end");
  const sp = agenticNodePorts("start"), ap = agenticNodePorts("agent"), ep = agenticNodePorts("end");
  const startId = editor.addNode("start", sp.in, sp.out,  30, 110, "agentic-df tone-go agentic-type-start",    startData, agenticNodeInnerHtml("start", startData));
  const agentId = editor.addNode("agent", ap.in, ap.out, 205, 110, "agentic-df tone-agent agentic-type-agent", agentData, agenticNodeInnerHtml("agent", agentData));
  const endId   = editor.addNode("end",   ep.in, ep.out, 380, 110, "agentic-df tone-stop agentic-type-end",  endData,   agenticNodeInnerHtml("end", endData));
  editor.addConnection(startId, agentId, "output_1", "input_1");
  editor.addConnection(agentId, endId,   "output_1", "input_1");
}

/* ── 연결점(포트) 위치 조정: 노드 테두리 위 임의 지점으로 이동 ──
   위치는 node.data.portPos[portClass] = {side, pct} 로 저장(0~1 비율, 줌 무관)해
   재진입·자동정렬 후에도 복원한다. */
const PORT_POS_MIN = 0.08, PORT_POS_MAX = 0.92;   // 모서리 겹침 방지 여백

function portPositionStyle(pos){
  const p = Math.max(PORT_POS_MIN, Math.min(PORT_POS_MAX, pos.pct)) * 100;
  const base = "position:absolute;margin:0;transform:translate(-50%,-50%);";
  if(pos.side === "left")   return base + `left:0;top:${p}%;bottom:auto;right:auto;`;
  if(pos.side === "right")  return base + `left:100%;top:${p}%;bottom:auto;right:auto;`;
  if(pos.side === "top")    return base + `top:0;left:${p}%;bottom:auto;right:auto;`;
  return base + `top:100%;left:${p}%;bottom:auto;right:auto;`;   // bottom
}

/* 커서 위치를 노드 테두리의 (side, pct)로 투영한다. 화면좌표 → 노드 비율(줌 무관). */
function nearestBorderPos(nodeRect, clientX, clientY){
  const cx = Math.max(nodeRect.left, Math.min(clientX, nodeRect.right));
  const cy = Math.max(nodeRect.top,  Math.min(clientY, nodeRect.bottom));
  const lx = nodeRect.width  ? (cx - nodeRect.left) / nodeRect.width  : 0.5;
  const ly = nodeRect.height ? (cy - nodeRect.top)  / nodeRect.height : 0.5;
  const d = { left: lx, right: 1 - lx, top: ly, bottom: 1 - ly };
  const side = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a), "left");
  const pct = (side === "left" || side === "right") ? ly : lx;
  return { side, pct };
}

/* 저장된 포트 위치를 DOM에 반영하고 연결선을 갱신한다. */
function applyPortPositions(editor, container){
  try{
    const data = editor.drawflow.drawflow[editor.module].data;
    Object.values(data).forEach(n => {
      const posMap = n.data?.portPos;
      if(!posMap) return;
      Object.entries(posMap).forEach(([cls, pos]) => {
        const sel = cls.startsWith("input") ? ".inputs ." + cls : ".outputs ." + cls;
        const el = container.querySelector(`#node-${n.id} ${sel}`);
        if(el && pos && pos.side) el.setAttribute("style", portPositionStyle(pos));
      });
      editor.updateConnectionNodes(`node-${n.id}`);
    });
  }catch(e){ /* noop */ }
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

/* 연결선 곡선 — 파워포인트 커넥터처럼 자연스럽게.
   · 정방향(출력이 입력보다 왼쪽): 부드러운 수평 S-커브
   · 역방향(되돌아가는 연결): 노드 밑으로 크게 도는 U자형 아크(노드 위 직선 관통 방지)
   Drawflow의 this.createCurvature를 대체하며, 기본 연결·자동정렬 모두에 적용된다. */
function agenticConnectionCurve(sx, sy, ex, ey, curv, type){
  const horiz = () => {
    const c = Math.abs(ex - sx) * curv;
    return ` M ${sx} ${sy} C ${sx + c} ${sy} ${ex - c} ${ey} ${ex} ${ey}`;
  };
  if(type !== "openclose") return horiz();     // reroute 세그먼트 등은 기본 수평 곡선
  const dx = ex - sx;
  if(dx >= -12) return horiz();                // 정방향/근수직: 부드러운 S
  // 역방향: 아래로 도는 U자형 아크
  const span = Math.abs(dx);
  const off  = Math.max(48, span * 0.28);                    // 출입 접선 길이(부드러운 진출입)
  const dip  = Math.max(70, Math.min(220, span * 0.16));     // 아래로 내려가는 깊이(노드 회피)
  const yBase = Math.max(sy, ey) + dip;
  return ` M ${sx} ${sy} C ${sx + off} ${yBase} ${ex - off} ${yBase} ${ex} ${ey}`;
}

export function createAgenticFlow({ container, service, persist, onSelect, onConnectionsChange, onNodeRemoved, locked = true }){
  const editor = new window.Drawflow(container);
  editor.reroute = true;
  editor.start();
  editor.createCurvature = agenticConnectionCurve;   // 커스텀 곡선(U자형/아크) 적용

  if(hasFlowData(service)){
    editor.import(service.drawflow);
    refreshImportedNodes(editor, container);
    applyPortPositions(editor, container);   // 저장된 연결점 위치(테두리) 복원
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

  // ── 우클릭 컨텍스트 메뉴 = 선택 노드에 입력점/출력점 추가·제거 ──
  // 노드를 선택(단일 클릭)한 뒤 우클릭하면 포트를 손수 늘리거나 줄일 수 있다.
  // 추가 포트는 좌(입력)·우(출력) 열에 쌓이고, 2번째 입력/출력은 상/하단 앵커로 배치된다.
  function closeCtxMenu(){
    const m = container.querySelector(".agentic-ctxmenu");
    if(m) m.remove();
  }
  // 제거 하한 = 4방향 앵커 기준(agenticNodePorts). 재진입 시 ensureAnchorPorts가 앵커를
  // 복원하므로, 앵커 미만 제거는 되돌아온다 → 하한을 앵커에 맞춰 수동 추가분만 제거하게 한다.
  function portFloor(type){
    return agenticNodePorts(type);
  }
  function applyPortChange(id, act){
    try{
      const node = editor.getNodeFromId(id);
      if(!node) return;
      const curIn  = Object.keys(node.inputs  || {}).length;
      const curOut = Object.keys(node.outputs || {}).length;
      const floor  = portFloor(node.data?.type);
      if(act === "add-in")  editor.addNodeInput(id);
      if(act === "add-out") editor.addNodeOutput(id);
      if(act === "del-in"  && curIn  > floor.in)  editor.removeNodeInput(id,  `input_${curIn}`);
      if(act === "del-out" && curOut > floor.out) editor.removeNodeOutput(id, `output_${curOut}`);
      editor.updateConnectionNodes(`node-${id}`);
      decoratePorts(editor, container);
      persist(editor.export());
      if(onConnectionsChange) onConnectionsChange();
    }catch(e){ /* noop */ }
  }
  function openCtxMenu(nodeEl, clientX, clientY){
    closeCtxMenu();
    const id = nodeEl.id.replace("node-", "");
    const node = editor.getNodeFromId(id);
    if(!node) return;
    const curIn  = Object.keys(node.inputs  || {}).length;
    const curOut = Object.keys(node.outputs || {}).length;
    const floor  = portFloor(node.data?.type);
    const menu = document.createElement("div");
    menu.className = "agentic-ctxmenu";
    menu.innerHTML = `
      <button type="button" data-act="add-in">＋ 입력점 추가</button>
      <button type="button" data-act="add-out">＋ 출력점 추가</button>
      <div class="agentic-ctxmenu-sep"></div>
      <button type="button" data-act="del-in"${curIn  > floor.in  ? "" : " disabled"}>－ 입력점 제거</button>
      <button type="button" data-act="del-out"${curOut > floor.out ? "" : " disabled"}>－ 출력점 제거</button>`;
    container.appendChild(menu);
    const rect = container.getBoundingClientRect();
    let x = clientX - rect.left, y = clientY - rect.top;
    x = Math.min(x, rect.width  - menu.offsetWidth  - 8);
    y = Math.min(y, rect.height - menu.offsetHeight - 8);
    menu.style.left = `${Math.max(4, x)}px`;
    menu.style.top  = `${Math.max(4, y)}px`;
    menu.addEventListener("mousedown", ev => ev.stopPropagation());
    menu.addEventListener("click", ev => {
      const btn = ev.target.closest("button[data-act]");
      if(!btn || btn.disabled) return;
      applyPortChange(id, btn.dataset.act);
      closeCtxMenu();
    });
  }
  container.addEventListener("contextmenu", (ev) => {
    const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".drawflow-node") : null;
    if(!nodeEl){ closeCtxMenu(); return; }
    ev.preventDefault();
    container.querySelectorAll(".drawflow-node.selected").forEach(el => el.classList.remove("selected"));
    nodeEl.classList.add("selected");
    openCtxMenu(nodeEl, ev.clientX, ev.clientY);
  });
  // 빈 곳 클릭·ESC로 메뉴 닫기
  container.addEventListener("mousedown", (ev) => {
    if(!(ev.target.closest && ev.target.closest(".agentic-ctxmenu"))) closeCtxMenu();
  });
  const onEscKey = (ev) => { if(ev.key === "Escape") closeCtxMenu(); };
  document.addEventListener("keydown", onEscKey);

  // ── 연결점(포트) 드래그로 위치 이동 ──
  // 포트를 잡고 '자기 노드 테두리'에 놓으면 그 지점으로 이동, '다른 노드 포트'로 끌면
  // 기존대로 연결이 생성된다(Drawflow 기본). 드래그 시작을 막지 않고 놓는 위치로 구분한다.
  let portDrag = null;   // { nodeEl, id, portEl, cls, startX, startY, moved }
  const onPortDown = (ev) => {
    if(ev.button !== 0) return;
    const portEl = ev.target && ev.target.closest ? ev.target.closest(".input, .output") : null;
    if(!portEl) return;
    const nodeEl = portEl.closest(".drawflow-node");
    if(!nodeEl) return;
    const cls = [...portEl.classList].find(c => /^(input|output)_\d+$/.test(c));
    if(!cls) return;
    portDrag = { nodeEl, id: nodeEl.id.replace("node-", ""), portEl, cls,
                 startX: ev.clientX, startY: ev.clientY, moved: false };
  };
  const onPortMove = (ev) => {
    if(!portDrag) return;
    if(Math.abs(ev.clientX - portDrag.startX) + Math.abs(ev.clientY - portDrag.startY) > 4) portDrag.moved = true;
  };
  const onPortUp = (ev) => {
    const pd = portDrag; portDrag = null;
    if(!pd || !pd.moved) return;
    // 다른 노드의 포트에 놓았으면 = 연결 생성 → 이동하지 않음(Drawflow가 처리)
    const tgt = document.elementFromPoint(ev.clientX, ev.clientY);
    const tgtNode = tgt && tgt.closest ? tgt.closest(".drawflow-node") : null;
    const tgtPort = tgt && tgt.closest ? tgt.closest(".input, .output") : null;
    if(tgtPort && tgtNode && tgtNode !== pd.nodeEl) return;
    // 자기 노드(±여백) 위에 놓았으면 = 그 지점으로 포트 이동
    const r = pd.nodeEl.getBoundingClientRect();
    const band = 26;
    const within = ev.clientX >= r.left - band && ev.clientX <= r.right + band &&
                   ev.clientY >= r.top  - band && ev.clientY <= r.bottom + band;
    if(!within) return;
    const pos = nearestBorderPos(r, ev.clientX, ev.clientY);
    try{
      const rec = editor.drawflow.drawflow[editor.module].data[pd.id];
      if(rec){ rec.data = rec.data || {}; rec.data.portPos = { ...(rec.data.portPos || {}), [pd.cls]: pos }; }
      pd.portEl.setAttribute("style", portPositionStyle(pos));
      editor.updateConnectionNodes(`node-${pd.id}`);
      decoratePorts(editor, container);
      persist(editor.export());
    }catch(e){ /* noop */ }
  };
  container.addEventListener("mousedown", onPortDown, true);   // capture: Drawflow보다 먼저 대상 기록
  document.addEventListener("mousemove", onPortMove);
  document.addEventListener("mouseup", onPortUp);

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
      // 간격을 넉넉히 + 순환(되돌아가는 연결)은 greedy로 방향 정리해 겹침을 줄인다.
      g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 130, marginx: 36, marginy: 40,
                   acyclicer: "greedy", ranker: "network-simplex" });
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
      applyPortPositions(editor, container);   // 정렬 후 저장된 연결점 위치 복원
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
      // 분기/반복 노드: 출력 포트별 연결 대상 노드명을 함께 제공(커스텀 분기 이름 우선)
      const labels = (node.data?.outLabels) || agenticOutputLabels(node.data?.type);
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
      if("outLabels" in patch) decoratePorts(editor, container);   // 분기 이름 변경 → 포트 라벨 갱신
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
      try{ document.removeEventListener("keydown", onEscKey); }catch(e){ /* noop */ }
      try{ container.removeEventListener("mousedown", onPortDown, true); }catch(e){ /* noop */ }
      try{ document.removeEventListener("mousemove", onPortMove); }catch(e){ /* noop */ }
      try{ document.removeEventListener("mouseup", onPortUp); }catch(e){ /* noop */ }
      try{ closeCtxMenu(); }catch(e){ /* noop */ }
      try{ editor.clear(); }catch(e){ /* noop */ }
    },
  };
}
