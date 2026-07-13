/* ── 기초자료 데이터 소스 추가 팝업 (NotebookLM식) ────────────────────
   기초자료 수집/등록 탭의 "데이터 소스 추가" 버튼으로 열리며, 모든 소스 등록이
   이 팝업에서 시작된다:
     · 웹 검색바      : 검색어 → 웹 정보수집 요청 소스로 접수
     · 파일 드롭존    : 드롭/클릭 → 파일 등록 팝업으로 전환(속성 분석부터)
     · 소스 유형 버튼 : 파일 업로드 / 웹사이트 / 내부 데이터 링크 / 외부 API
   등록 결과는 onRegister(rec) 콜백으로 전달되어 업로드 기록에 영속된다.
   파일 계열은 onFile(files|null) 콜백 — null이면 파일 선택 없이 팝업만 전환. */
import { escapeHtml } from "../core/dom.js";

const INTERNAL_LINK_OPTIONS = [
  ["cdw",      "CDW 자연어조회 — 수입신고·기업 원장", "CDW 자연어조회"],
  ["profile",  "기업 프로파일·위험지표 DB",           "CDW 자연어조회"],
  ["external", "전자통관 외부정보(국세청·한국은행)",   "전자통관외부정보조회"],
];
const API_AUTH_OPTIONS = [["key", "API Key"], ["oauth", "OAuth2"], ["none", "인증 없음"]];

const KIND_BUTTONS = [
  { id: "file",     icon: "📄", label: "파일 업로드",      desc: "PDF · XLS · DOCX · 이미지" },
  { id: "web",      icon: "🌐", label: "웹사이트",         desc: "웹 정보수집(웹검색) 서비스" },
  { id: "internal", icon: "🗄️", label: "내부 데이터 링크", desc: "CDW · 기업 프로파일 등 내부 DB" },
  { id: "api",      icon: "🔌", label: "외부 API",        desc: "외부 시스템 연계 등록" },
];

let S = null;          // { subject, subjectId, kind, onFile, onRegister }
let _bound = false;

function overlayEl(){ return document.getElementById("sourceAddOverlay"); }

function formHtml(){
  if(!S.kind) return "";
  if(S.kind === "file"){
    return `
      <div class="sap-form">
        <strong>파일 업로드</strong>
        <p class="muted">PDF, XLS, XLSX, DOCX, 이미지 · 최대 50MB · 여러 개 선택 가능 — 선택하면 속성 분석과 AI 에이전트 선택(파일 등록)으로 이동합니다.</p>
        <div class="sap-form-actions">
          <button type="button" class="btn secondary" data-sap-kind-close>취소</button>
          <button type="button" class="btn" data-sap-file-pick>파일 선택</button>
        </div>
      </div>`;
  }
  const forms = {
    web: `
      <div class="sap-form-row">
        <input id="sapWebUrl" type="text" placeholder="수집할 웹사이트 URL (https://...)">
        <input id="sapWebKeyword" type="text" placeholder="수집 키워드 (선택)">
      </div>
      <p class="muted">등록 시 웹 정보수집(웹검색) 서비스로 외부 정보 수집이 예약됩니다.</p>`,
    internal: `
      <div class="sap-form-row">
        <select id="sapInternalKind">
          ${INTERNAL_LINK_OPTIONS.map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <input id="sapInternalQuery" type="text" placeholder="연결 조건/메모 (선택) — 예: 최근 24개월 수입신고">
      </div>
      <p class="muted">내부 데이터는 링크로 연결되어 분석 시 실시간 조회됩니다.</p>`,
    api: `
      <div class="sap-form-row">
        <input id="sapApiName" type="text" placeholder="API 이름 (예: UNI-PASS 화물추적)">
        <input id="sapApiUrl" type="text" placeholder="엔드포인트 URL (https://...)">
        <select id="sapApiAuth">
          ${API_AUTH_OPTIONS.map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}
        </select>
      </div>
      <p class="muted">외부 API를 연계 등록하면 분석 단계에서 호출 가능한 소스로 사용됩니다.</p>`,
  };
  const titles = { web: "웹사이트 소스 등록", internal: "내부 데이터 링크 등록", api: "외부 API 연계 등록" };
  return `
    <div class="sap-form">
      <strong>${titles[S.kind]}</strong>
      ${forms[S.kind]}
      <div class="sap-form-actions">
        <button type="button" class="btn secondary" data-sap-kind-close>취소</button>
        <button type="button" class="btn" data-sap-submit="${S.kind}">소스 등록</button>
      </div>
    </div>`;
}

function modalHtml(){
  return `
    <div class="sap-modal">
      <div class="sap-head">
        <div>
          <strong>데이터 소스 추가</strong>
          <span>웹 검색, 파일 드롭 또는 소스 유형 선택으로 조사 자료를 등록합니다.</span>
        </div>
        <div class="sap-head-right">
          ${S.subject ? `<span class="muted">조사 대상 <b>${escapeHtml(S.subject)}</b>${S.subjectId ? " · " + escapeHtml(S.subjectId) : ""}</span>` : ""}
          <button type="button" data-sap-close aria-label="닫기">✕</button>
        </div>
      </div>
      <div class="sap-body">
        <div class="sap-search">
          <input id="sapSearchInput" type="text" placeholder="웹에서 새 소스를 검색하세요 — 웹 정보수집 서비스로 접수">
          <button type="button" data-sap-search title="웹 소스 검색 요청">🔍</button>
        </div>
        <div class="sap-dropzone" data-sap-dropzone data-sap-file>
          <strong>또는 파일 드롭</strong>
          <span>PDF, 이미지, 문서 등 — 드롭하거나 클릭하면 파일 등록으로 이동합니다</span>
        </div>
        <div class="sap-kind-buttons">
          ${KIND_BUTTONS.map(k => `
            <button type="button" class="sap-kind-btn${S.kind === k.id ? " active" : ""}" data-sap-kind="${k.id}">
              <strong>${k.icon} ${escapeHtml(k.label)}</strong><small>${escapeHtml(k.desc)}</small>
            </button>
          `).join("")}
        </div>
        ${formHtml()}
      </div>
    </div>`;
}

function rerender(){
  const ov = overlayEl();
  if(ov) ov.innerHTML = modalHtml();
}

function close(){
  const ov = overlayEl();
  if(ov) ov.style.display = "none";
  S = null;
}

/* 폼 입력값 → 소스 기록(rec). 검증 실패 시 null. */
function buildRecord(kind){
  const val = id => (document.getElementById(id)?.value || "").trim();
  if(kind === "web"){
    const url = val("sapWebUrl");
    if(!url){ alert("수집할 웹사이트 URL을 입력하세요."); return null; }
    const keyword = val("sapWebKeyword");
    return { name: url, type: "웹사이트",
      extracted: [keyword ? `키워드: ${keyword}` : "웹 정보수집 예약"],
      agents: ["웹 정보수집 요청 agent"], result: "수집 요청 접수", status: "수집중", tone: "running" };
  }
  if(kind === "internal"){
    const opt = INTERNAL_LINK_OPTIONS.find(([id]) => id === val("sapInternalKind")) || INTERNAL_LINK_OPTIONS[0];
    const query = val("sapInternalQuery");
    return { name: opt[1], type: "내부 데이터 링크",
      extracted: [query || "전체 연동"],
      agents: [opt[2]], result: "링크 연결됨", status: "연결됨", tone: "done" };
  }
  if(kind === "api"){
    const name = val("sapApiName"), url = val("sapApiUrl");
    if(!name || !url){ alert("API 이름과 엔드포인트 URL을 입력하세요."); return null; }
    const auth = API_AUTH_OPTIONS.find(([id]) => id === val("sapApiAuth"))?.[1] || "API Key";
    return { name, type: "외부 API 연계",
      extracted: [url, `인증: ${auth}`],
      agents: ["외부 API 연계"], result: "연계 등록 완료", status: "연계 등록", tone: "done" };
  }
  return null;
}

function submitSearch(){
  const query = (document.getElementById("sapSearchInput")?.value || "").trim();
  if(!query) return;
  const rec = { name: `웹 검색 — ${query}`, type: "웹 검색",
    extracted: [`키워드: ${query}`],
    agents: ["웹 정보수집 요청 agent"], result: "수집 요청 접수", status: "수집중", tone: "running" };
  const cb = S.onRegister;
  close();
  if(cb) cb(rec);
}

/* OS 파일 선택기 — 선택하면 팝업을 닫고 파일 등록 팝업으로 전환(드롭과 동일 경로) */
function pickFiles(){
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".pdf,.xls,.xlsx,.csv,.doc,.docx,.jpg,.jpeg,.png,.gif";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const files = input.files ? [...input.files] : [];
    document.body.removeChild(input);
    if(!files.length) return;
    const cb = S?.onFile;
    close();
    if(cb) cb(files);
  });
  document.body.appendChild(input);
  input.click();
}

function bindOverlay(ov){
  if(_bound) return;
  _bound = true;

  ov.addEventListener("click", e => {
    if(!S) return;
    e.stopPropagation();   // 팝업 내부 클릭이 앱 전역 핸들러로 전파되지 않도록
    if(e.target === ov || e.target.closest("[data-sap-close]")){ close(); return; }
    if(e.target.closest("[data-sap-search]")){ submitSearch(); return; }
    // 파일 폼의 [파일 선택]: OS 파일 선택기 → 선택 즉시 파일 등록 팝업으로 전환(속성 분석부터)
    if(e.target.closest("[data-sap-file-pick]")){ pickFiles(); return; }
    // 드롭존 클릭: 파일 등록 팝업으로 전환(빈 드롭존부터)
    if(e.target.closest("[data-sap-file]")){
      const cb = S.onFile;
      close();
      if(cb) cb(null);
      return;
    }
    const kindBtn = e.target.closest("[data-sap-kind]");
    if(kindBtn){
      const kind = kindBtn.dataset.sapKind;
      S.kind = S.kind === kind ? null : kind;   // 재클릭 시 닫기
      rerender();
      return;
    }
    if(e.target.closest("[data-sap-kind-close]")){ S.kind = null; rerender(); return; }
    const submit = e.target.closest("[data-sap-submit]");
    if(submit){
      const rec = buildRecord(submit.dataset.sapSubmit);
      if(!rec) return;
      const cb = S.onRegister;
      close();
      if(cb) cb(rec);
      return;
    }
  });

  // 웹 검색 입력 Enter → 접수 (한글 IME 조합 중 무시)
  ov.addEventListener("keydown", e => {
    if(!S || e.key !== "Enter" || e.target?.id !== "sapSearchInput") return;
    if(e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submitSearch();
  });

  // 파일 드래그 앤 드롭 → 파일 등록 팝업으로 전환(드롭 파일 전달)
  ov.addEventListener("dragover", e => {
    if(!S) return;
    const zone = e.target.closest("[data-sap-dropzone]");
    if(zone && [...(e.dataTransfer?.types || [])].includes("Files")){
      e.preventDefault();
      zone.classList.add("dragging");
    }
  });
  ov.addEventListener("dragleave", e => {
    e.target.closest("[data-sap-dropzone]")?.classList.remove("dragging");
  });
  ov.addEventListener("drop", e => {
    if(!S) return;
    const zone = e.target.closest("[data-sap-dropzone]");
    if(!zone) return;
    e.preventDefault();
    const files = e.dataTransfer?.files ? [...e.dataTransfer.files] : [];
    const cb = S.onFile;
    close();
    if(files.length && cb) cb(files);
  });
}

/* ── 공개 API ── */
export function openSourceAddPopup(opts = {}){
  let ov = overlayEl();
  if(!ov){
    ov = document.createElement("div");
    ov.id = "sourceAddOverlay";
    ov.className = "file-register-overlay";   // 동일한 오버레이 배경 스타일 재사용
    document.body.appendChild(ov);
  }
  bindOverlay(ov);
  S = {
    subject: opts.subject || "",
    subjectId: opts.subjectId || "",
    kind: null,
    onFile: typeof opts.onFile === "function" ? opts.onFile : null,
    onRegister: typeof opts.onRegister === "function" ? opts.onRegister : null,
  };
  ov.style.display = "flex";
  rerender();
}
