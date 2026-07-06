import { escapeHtml } from "../core/dom.js";

/* AI Agentic 서비스 — 노드 기반 비주얼 에이전트 빌더 (부서 관리자 전용).
   캔버스는 Drawflow(로컬 벤더링)로 마운트하며, 팔레트/인스펙터는 기존 HTML 렌더를 유지한다.
   노드 타입 팔레트 16종 (이미지 사양과 동일 순서).
   in/out = Drawflow 포트 수 (분기·반복은 출력 2개). */
export const AGENTIC_NODE_TYPES = [
  { type:"start",     label:"시작",         glyph:"▶",  tone:"go",    fixed:true, in:0, out:1 },
  { type:"agent",     label:"에이전트",      glyph:"🧊", tone:"agent",            in:1, out:1 },
  { type:"classify",  label:"분류",          glyph:"🗂", tone:"slate",            in:1, out:1 },
  { type:"note",      label:"노트",          glyph:"📝", tone:"slate",            in:0, out:0 },
  { type:"run",       label:"실행",          glyph:"⚡", tone:"go",               in:1, out:1 },
  { type:"end",       label:"종료",          glyph:"⏹", tone:"stop",  fixed:true, in:1, out:0 },
  { type:"branch",    label:"분기",          glyph:"🔀", tone:"amber",            in:1, out:2, outLabels:["참","거짓"] },
  { type:"loop",      label:"반복",          glyph:"🔁", tone:"amber",            in:1, out:2, outLabels:["본문","종료"] },
  { type:"human",     label:"사용자 개입",    glyph:"🙋", tone:"amber",            in:1, out:1 },
  { type:"messenger", label:"메신저 전송",    glyph:"💬", tone:"slate",            in:1, out:1 },
  { type:"email",     label:"메일 발송",      glyph:"✉", tone:"slate",            in:1, out:1 },
  { type:"file_find", label:"파일 찾기",      glyph:"🔎", tone:"slate",            in:1, out:1 },
  { type:"file_up",   label:"파일 업로드",    glyph:"📤", tone:"slate",            in:1, out:1 },
  { type:"mcp",       label:"MCP/API 연계",   glyph:"🔌", tone:"agent",            in:1, out:1 },
  { type:"ml",        label:"ML/DL 모델",     glyph:"🧠", tone:"agent",            in:1, out:1 },
  { type:"db",        label:"데이터베이스",    glyph:"🗄", tone:"agent",            in:1, out:1 },
];

const NODE_TYPE_BY_ID = Object.fromEntries(AGENTIC_NODE_TYPES.map(n => [n.type, n]));

export function agenticNodeTypeDef(type){
  return NODE_TYPE_BY_ID[type] || { type, label:type, glyph:"•", tone:"slate", in:1, out:1 };
}

export function agenticNodePorts(type){
  const def = agenticNodeTypeDef(type);
  return { in: def.in ?? 1, out: def.out ?? 1 };
}

/* 출력 포트 라벨 (분기=참/거짓, 반복=본문/종료). 없으면 null. */
export function agenticOutputLabels(type){
  return agenticNodeTypeDef(type).outLabels || null;
}

export const AGENTIC_MODEL_OPTIONS = ["KCS_LLM", "외부 LLM", "외부+내부 LLM"];
export const AGENTIC_OUTPUT_FORMATS = [
  { value:"text",     label:"text" },
  { value:"markdown", label:"markdown" },
  { value:"json",     label:"json" },
  { value:"table",    label:"표(table)" },
];
export const AGENTIC_TOOL_CATALOG = [
  "웹 검색", "CDW 자연어조회", "관세정보 RAG", "심사정보 RAG", "문서 OCR",
  "HS 품목분류", "관계망 분석", "보고서 생성", "메일 발송",
];

/* 노드 기본 데이터 — Drawflow node.data 로 저장된다. */
export function defaultNodeData(type){
  const def = agenticNodeTypeDef(type);
  return {
    type,
    label: def.label,
    query: "",
    includeHistory: true,
    model: "KCS_LLM",
    tools: [],
    outputFormat: "text",
    note: "",
    condition: "",
    loopMode: "while",     // 반복 방식: while(조건) | foreach(목록)
    maxIterations: 10,     // 안전 상한 (무한루프 방지)
    recipients: "",        // 메일/메신저 수신자
    useNeo4j: false,       // DB 노드: 그래프(Neo4j) 조회 여부
  };
}

export function nodeHint(type){
  const hints = {
    start:"워크플로 시작 지점",
    agent:"질의를 모델에 전달하고 도구를 선택 함",
    classify:"입력을 기준에 따라 분류",
    note:"작업 메모를 기록",
    run:"등록된 작업을 실행",
    end:"워크플로 종료 지점",
    branch:"조건에 따라 흐름 분기",
    loop:"조건이 만족될 때까지 반복",
    human:"사용자 확인/개입 단계",
    messenger:"메신저로 결과 전송",
    email:"메일로 결과 발송",
    file_find:"파일을 검색",
    file_up:"파일을 업로드",
    mcp:"MCP/API 외부 연계",
    ml:"ML/DL 모델 호출",
    db:"데이터베이스 조회",
  };
  return hints[type] || "";
}

/* Drawflow 노드 내부 HTML (캔버스에 그려지는 카드 본문) */
export function agenticNodeInnerHtml(type, data = {}){
  const def = agenticNodeTypeDef(type);
  // 캔버스 노드는 이름만 표시 — 상세는 우측 속성창에서 편집
  return `
    <div class="agentic-df-inner tone-${def.tone}" title="${escapeHtml(def.label)}">
      <span class="agentic-df-ic">${def.glyph}</span>
      <span class="agentic-df-title">${escapeHtml(data.label || def.label)}</span>
    </div>`;
}

/* ── 좌측 팔레트 ── */
function paletteSection(store, service, listOpen){
  const serviceItems = store.services.map(svc => `
    <div class="agentic-svc-row${svc.id === service?.id ? " active" : ""}">
      <button class="agentic-svc-item${svc.id === service?.id ? " active" : ""}" type="button"
              data-agentic-select-service="${escapeHtml(svc.id)}">
        <span class="agentic-svc-name">${escapeHtml(svc.name)}</span>
        <span class="agentic-svc-meta">${agenticServiceNodeCount(svc)} 노드</span>
      </button>
      <button class="agentic-svc-del" type="button" data-agentic-delete-service="${escapeHtml(svc.id)}"
              title="서비스 삭제" aria-label="${escapeHtml(svc.name)} 서비스 삭제">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `).join("") || `<div class="agentic-svc-empty">등록된 서비스가 없습니다.</div>`;

  const nodeButtons = AGENTIC_NODE_TYPES.map(def => `
    <button class="agentic-pal-node tone-${def.tone}" type="button"
            data-agentic-add-node="${escapeHtml(def.type)}" title="${escapeHtml(def.label)} 노드 추가">
      <span class="agentic-pal-ic">${def.glyph}</span>
      <span>${escapeHtml(def.label)}</span>
    </button>
  `).join("");

  return `
    <aside class="agentic-palette">
      <div class="agentic-palette-actions">
        <button class="agentic-act-btn primary" type="button" data-agentic-new>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          새 Agent 서비스
        </button>
        <button class="agentic-act-btn${listOpen ? " open" : ""}" type="button" data-agentic-toggle-list aria-expanded="${listOpen ? "true" : "false"}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          서비스 목록
        </button>
      </div>

      ${listOpen ? `<div class="agentic-svc-list">${serviceItems}</div>` : ""}

      <div class="agentic-palette-label">노드</div>
      <div class="agentic-node-palette">${nodeButtons}</div>
    </aside>
  `;
}

export function agenticServiceNodeCount(svc){
  try{ return Object.keys(svc?.drawflow?.drawflow?.Home?.data || {}).length; }
  catch(e){ return 0; }
}

/* ── 중앙 캔버스 (Drawflow 마운트 지점) ── */
function canvasSection(service, locked){
  if(!service){
    return `
      <main class="agentic-main">
        <div class="agentic-canvas agentic-canvas-empty">
          <div class="empty-state">왼쪽에서 <b>새 Agent 서비스</b>를 만들어 시작하세요.</div>
        </div>
      </main>`;
  }
  return `
    <main class="agentic-main">
      <div class="agentic-canvas-head">
        <input class="agentic-svc-title" type="text" value="${escapeHtml(service.name)}"
               data-agentic-service-name placeholder="서비스 이름">
        <div class="agentic-canvas-tools">
          <span class="muted">클릭=선택·편집 · 이동은 잠금 해제 후 · 화면 맞춤으로 전체 보기</span>
          <button class="agentic-mini-btn wide run" type="button" data-agentic-run title="워크플로 실행">▶ 실행</button>
          <button class="agentic-mini-btn wide" type="button" data-agentic-history title="실행 이력">🕘 이력</button>
          <button class="agentic-mini-btn wide${locked ? " lock-on" : ""}" type="button" data-agentic-lock title="노드 이동 잠금/해제">${locked ? "🔒 이동잠금" : "🔓 이동가능"}</button>
          <button class="agentic-mini-btn wide" type="button" data-agentic-layout title="흐름에 맞춰 노드 자동 정렬">⤢ 자동 정렬</button>
          <button class="agentic-mini-btn wide" type="button" data-agentic-fit title="모든 노드가 보이도록 화면 맞춤">▣ 화면맞춤</button>
          <button class="agentic-mini-btn" type="button" data-agentic-zoom="in" title="확대">＋</button>
          <button class="agentic-mini-btn" type="button" data-agentic-zoom="out" title="축소">－</button>
          <button class="agentic-mini-btn" type="button" data-agentic-zoom="reset" title="배율 초기화">⟲</button>
        </div>
      </div>
      <div id="agenticDrawflow" class="agentic-canvas agentic-df-canvas"></div>
      <div id="agenticInspector" class="agentic-inspector-popup" hidden></div>
      <div id="agenticRunPanel" class="agentic-run-panel" hidden></div>
    </main>`;
}

/* 실행 결과 패널 — 단계별 상태/출력 + 최종 결과 */
const RUN_STATUS_META = {
  pending: { icon: "○", cls: "pending", label: "대기" },
  running: { icon: "◌", cls: "running", label: "실행 중" },
  done:    { icon: "✓", cls: "done", label: "완료" },
  error:   { icon: "✕", cls: "error", label: "오류" },
};

export function agenticRunPanelHtml(steps, { running } = {}){
  const doneCount = steps.filter(s => s.status === "done").length;
  const headLabel = running ? "실행 중…" : "실행 결과";
  const stepHtml = steps.map(s => {
    const def = agenticNodeTypeDef(s.type);
    const meta = RUN_STATUS_META[s.status] || RUN_STATUS_META.pending;
    const body = s.output
      ? `<div class="agentic-run-output">${escapeHtml(s.output)}</div>`
      : "";
    return `
      <div class="agentic-run-step">
        <div class="agentic-run-step-head">
          <span class="agentic-run-ic ${meta.cls}">${meta.icon}</span>
          <span class="agentic-run-glyph">${def.glyph}</span>
          <span class="agentic-run-name">${escapeHtml(s.label || def.label)}</span>
          <span class="agentic-run-type">${escapeHtml(def.label)}</span>
        </div>
        ${body}
      </div>`;
  }).join("");
  return `
    <div class="agentic-run-head">
      <strong>${headLabel}</strong>
      <span class="agentic-run-progress">${doneCount}/${steps.length}</span>
      <span class="agentic-run-spacer"></span>
      ${running
        ? `<button class="agentic-run-btn stop" type="button" data-agentic-stop>■ 중지</button>`
        : `<button class="agentic-run-btn" type="button" data-agentic-run-close>닫기</button>`}
    </div>
    <div class="agentic-run-steps">${stepHtml || `<div class="muted" style="padding:8px">실행할 노드가 없습니다.</div>`}</div>
    ${!running && steps.length ? `<p class="agentic-run-note">분기 조건은 LLM이 참/거짓을 평가해 해당 경로만 실행하고, 반복은 조건이 참인 동안(최대 횟수까지) 본문을 반복합니다. 에이전트·DB 노드는 실제 호출, 메일·메신저는 발송 시뮬레이션입니다.</p>` : ""}
  `;
}

/* ── 우측 인스펙터 (부분 렌더 가능) ── */
export function agenticInspectorHtml(node){
  if(!node) return "";   // 선택 노드 없음 → 팝업 숨김
  const def = agenticNodeTypeDef(node.type);
  return `
    <div class="agentic-inspect-card">
      <div class="agentic-inspect-head">
        <span class="agentic-inspect-ic tone-${def.tone}">${def.glyph}</span>
        <div>
          <strong>【${escapeHtml(def.label)}】</strong>
          <small>${escapeHtml(nodeHint(node.type))}</small>
        </div>
        <button class="agentic-inspect-close" type="button" data-agentic-inspect-close aria-label="닫기">×</button>
      </div>
      ${node.type === "agent" ? agentNodeFields(node)
        : node.type === "loop" ? loopNodeFields(node)
        : agenticOutputLabels(node.type) ? branchNodeFields(node)
        : (["db", "email", "messenger"].includes(node.type) ? connectorNodeFields(node) : genericNodeFields(node))}
      ${def.fixed ? "" : `
        <button class="agentic-del-btn" type="button" data-agentic-delete-node>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          노드 삭제
        </button>`}
    </div>`;
}

function agentNodeFields(node){
  const modelOpts = AGENTIC_MODEL_OPTIONS.map(m =>
    `<option value="${escapeHtml(m)}"${m === node.model ? " selected" : ""}>${escapeHtml(m)}</option>`).join("");
  const fmtOpts = AGENTIC_OUTPUT_FORMATS.map(f =>
    `<option value="${escapeHtml(f.value)}"${f.value === node.outputFormat ? " selected" : ""}>${escapeHtml(f.label)}</option>`).join("");
  const tools = (node.tools || []).map(t => `
    <span class="agentic-tool-chip">${escapeHtml(t)}<button type="button" class="agentic-tool-x" data-agentic-remove-tool="${escapeHtml(t)}" aria-label="도구 제거">×</button></span>`).join("");
  return `
    <label class="agentic-field">
      <span>이름</span>
      <input type="text" value="${escapeHtml(node.label || "")}" data-agentic-field="label" placeholder="에이전트 이름">
    </label>
    <label class="agentic-field">
      <span>질의</span>
      <textarea rows="5" data-agentic-field="query" placeholder="질의 내용을 입력하세요">${escapeHtml(node.query || "")}</textarea>
    </label>
    <div class="agentic-toggle-row">
      <span>이력을 포함해서 전송</span>
      <label class="agentic-switch">
        <input type="checkbox" data-agentic-field="includeHistory"${node.includeHistory ? " checked" : ""}>
        <i></i>
      </label>
    </div>
    <label class="agentic-field row">
      <span>AI 모델 선택</span>
      <select data-agentic-field="model">${modelOpts}</select>
    </label>
    <div class="agentic-field">
      <span>도구 선택</span>
      <div class="agentic-tools">
        ${tools || `<span class="agentic-tools-empty">선택된 도구 없음</span>`}
      </div>
      <select class="agentic-tool-add" data-agentic-add-tool>
        <option value="">＋ 도구 추가…</option>
        ${AGENTIC_TOOL_CATALOG.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
      </select>
    </div>
    <label class="agentic-field row">
      <span>결과 포맷 정의</span>
      <select data-agentic-field="outputFormat">${fmtOpts}</select>
    </label>
  `;
}

/* 출력 포트별(참/거짓·본문/종료) 연결 대상 표시 — 분기·반복 공용 */
function routeListHtml(node){
  const routes = (node._outputs || []).map(o => {
    const targets = (o.targets && o.targets.length) ? o.targets.map(escapeHtml).join(", ") : null;
    return `
      <div class="agentic-route">
        <span class="agentic-route-port">${escapeHtml(o.label)}</span>
        <svg width="16" height="12" viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="7" x2="18" y2="7"/><polyline points="13 2 18 7 13 12"/></svg>
        <span class="agentic-route-target${targets ? "" : " empty"}">${targets || "미연결"}</span>
      </div>`;
  }).join("");
  return `
    <div class="agentic-field">
      <span>출력 분기</span>
      <div class="agentic-routes">${routes}</div>
      <small class="agentic-route-hint">캔버스에서 각 포트를 다음 노드로 연결하세요.</small>
    </div>`;
}

/* 분기 노드 전용 — 조건(참/거짓) + 라우팅 */
function branchNodeFields(node){
  return `
    <label class="agentic-field">
      <span>이름</span>
      <input type="text" value="${escapeHtml(node.label || "")}" data-agentic-field="label" placeholder="노드 이름">
    </label>
    <label class="agentic-field">
      <span>분기 조건</span>
      <textarea rows="3" data-agentic-field="condition" placeholder="예: 위험도 점수가 0.7 이상이면 참">${escapeHtml(node.condition || "")}</textarea>
    </label>
    ${routeListHtml(node)}
  `;
}

/* 반복 노드 전용 — 반복 방식/조건/최대 횟수 + 본문·종료 라우팅 */
function loopNodeFields(node){
  const mode = node.loopMode || "while";
  const modeOpts = [
    ["while", "조건 반복 (while)"],
    ["foreach", "목록 반복 (for each)"],
  ].map(([v, l]) => `<option value="${v}"${mode === v ? " selected" : ""}>${escapeHtml(l)}</option>`).join("");
  const condLabel = mode === "foreach" ? "반복 대상" : "반복 지속 조건";
  const condPlaceholder = mode === "foreach"
    ? "예: 검색된 기사 목록의 각 항목"
    : "예: 미처리 대상이 남아 있는 동안 (참이면 본문 반복)";
  return `
    <label class="agentic-field">
      <span>이름</span>
      <input type="text" value="${escapeHtml(node.label || "")}" data-agentic-field="label" placeholder="노드 이름">
    </label>
    <label class="agentic-field row">
      <span>반복 방식</span>
      <select data-agentic-field="loopMode">${modeOpts}</select>
    </label>
    <label class="agentic-field">
      <span>${condLabel}</span>
      <textarea rows="3" data-agentic-field="condition" placeholder="${escapeHtml(condPlaceholder)}">${escapeHtml(node.condition || "")}</textarea>
    </label>
    <label class="agentic-field row">
      <span>최대 반복 횟수</span>
      <input type="number" min="1" max="9999" step="1" data-agentic-field="maxIterations" value="${escapeHtml(String(node.maxIterations ?? 10))}">
    </label>
    ${routeListHtml(node)}
    <p class="agentic-loop-hint"><b>본문</b>: 조건이 참인 동안 반복 실행 · <b>종료</b>: 반복 종료 후 진행</p>
  `;
}

/* 커넥터 노드 — DB(자연어 조회)·메일/메신저(수신자) 실행 파라미터 */
function connectorNodeFields(node){
  const nameField = `
    <label class="agentic-field">
      <span>이름</span>
      <input type="text" value="${escapeHtml(node.label || "")}" data-agentic-field="label" placeholder="노드 이름">
    </label>`;
  if(node.type === "db"){
    return `
      ${nameField}
      <label class="agentic-field">
        <span>조회 질의 (자연어)</span>
        <textarea rows="4" data-agentic-field="query" placeholder="예: 최근 3개월 고위험 수입신고 상위 10건">${escapeHtml(node.query || "")}</textarea>
      </label>
      <div class="agentic-toggle-row">
        <span>그래프(Neo4j)로 조회</span>
        <label class="agentic-switch">
          <input type="checkbox" data-agentic-field="useNeo4j"${node.useNeo4j ? " checked" : ""}>
          <i></i>
        </label>
      </div>
      <small class="agentic-route-hint">자연어 질의를 SQL/Cypher로 변환해 실제 조회합니다.</small>
    `;
  }
  // email / messenger
  const ch = node.type === "email" ? "메일" : "메신저";
  return `
    ${nameField}
    <label class="agentic-field">
      <span>수신자</span>
      <input type="text" value="${escapeHtml(node.recipients || "")}" data-agentic-field="recipients" placeholder="예: team@kcs.go.kr, 홍길동">
    </label>
    <label class="agentic-field">
      <span>메모 (메시지 템플릿)</span>
      <textarea rows="3" data-agentic-field="note" placeholder="비워두면 이전 단계 결과를 본문으로 사용">${escapeHtml(node.note || "")}</textarea>
    </label>
    <small class="agentic-route-hint">${ch} 발송 백엔드가 없어 발송은 시뮬레이션되며, 수신자·본문을 결과에 기록합니다.</small>
  `;
}

function genericNodeFields(node){
  return `
    <label class="agentic-field">
      <span>이름</span>
      <input type="text" value="${escapeHtml(node.label || "")}" data-agentic-field="label" placeholder="노드 이름">
    </label>
    <label class="agentic-field">
      <span>메모</span>
      <textarea rows="4" data-agentic-field="note" placeholder="이 노드의 동작/조건을 메모로 기록하세요">${escapeHtml(node.note || "")}</textarea>
    </label>
  `;
}

/* 실행 이력 목록 패널 */
export function agenticHistoryHtml(runs){
  const items = (runs || []).map((r, i) => {
    const meta = RUN_STATUS_META[{ "완료": "done", "오류": "error", "중지": "running" }[r.status]] || RUN_STATUS_META.pending;
    return `
      <button class="agentic-hist-item" type="button" data-agentic-hist="${i}">
        <span class="agentic-run-ic ${meta.cls}">${meta.icon}</span>
        <span class="agentic-hist-time">${escapeHtml(r.startedAtLabel || "")}</span>
        <span class="agentic-hist-meta">${(r.steps || []).length}단계 · ${escapeHtml(r.status || "")}</span>
      </button>`;
  }).join("") || `<div class="muted" style="padding:10px">실행 이력이 없습니다.</div>`;
  return `
    <div class="agentic-run-head">
      <strong>실행 이력</strong>
      <span class="agentic-run-progress">${(runs || []).length}건</span>
      <span class="agentic-run-spacer"></span>
      <button class="agentic-run-btn" type="button" data-agentic-run-close>닫기</button>
    </div>
    <div class="agentic-hist-list">${items}</div>`;
}

export function agenticServicePage({ store, service, listOpen = false, locked = true }){
  return `
    <div class="agentic-shell">
      ${paletteSection(store, service, listOpen)}
      ${canvasSection(service, locked)}
    </div>
  `;
}
