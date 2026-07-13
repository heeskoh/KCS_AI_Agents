/* ── 기초자료 파일 등록 팝업 ──────────────────────────────────────────
   설계 원본(파일 등록 팝업.dc.html, DC/React 목업)을 앱의 바닐라 JS 패턴으로 재구현.
   3단계: empty(드롭존) → analyzing(분석중) → ready(파일속성 + AI 에이전트 선택).
   상태는 모듈 내부에 보관하고, 변경 시 오버레이 innerHTML을 다시 그린다(이벤트는 위임). */
import { escapeHtml } from "../core/dom.js";
import { openServiceDetailPopup } from "./service-detail-popup.js";   // AI 서비스 상세(입력정의·결과형식) 팝업

/* ── 데이터 정의(설계 원본과 동일) ── */
const GROUPS = [
  { title: "업무분석 AI 서비스", agents: [
    ["rag_risk_select", "위험Case검색", "위험선별 기준·선별 이력 기반 위험 신호 확인"],
    ["origin_analysis", "원산지 검증", "원산지 증빙·FTA 적용·우회수입 가능성 시뮬레이션"],
    ["abnormal_trade", "이상거래 검증", "가격·거래상대방·신고패턴 이상거래 징후 검증"],
    ["proceeds_tracking", "범죄수익 추적", "자금흐름·계좌 추적 단서 기반 은닉 가능성 분석"],
    ["route_analysis", "운송경로 분석", "운송경로·공급망 역추적으로 우회수입 탐지"],
    ["declaration_verify", "수입신고검증", "추출값과 수입신고DB 비교, 품명·중량·가격 불일치 확인"],
    ["hs_verify", "품목분류검증", "품목·HS코드·전략물자·수출허가내역 검증"],
    ["customs_value", "과세가격평가", "과세가격 결정요소·저가신고 가능성 검토"],
    ["rag_trade", "통관보고서 생성", "통관/무역 정보의 이상 징후·참고 근거 확인"],
  ]},
  { title: "분석지원 AI 서비스", agents: [
    ["ml", "ML 모델 실행", "전체 모델을 실행해 기업 위험 패턴 비교"],
    ["network", "관계망 분석", "특수관계·우회수입·페이퍼컴퍼니 가능성 식별"],
    ["proceeds_fund", "범죄자금내역 추적", "자금이체·현금입출금·가상계좌 내역을 시계열·소유주 중심 추적"],
    ["comm", "통신내역 분석", "통신 내역을 기반으로 연계·연락 패턴 분석"],
    ["ocr", "OCR/문서인식", "첨부 문서 주요 항목 추출·신고자료 대조 구조화"],
    ["rag_create", "업무특화RAG 분석서비스", "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리"],
    ["ontology", "관세 온톨로지", "기업·거래·품목 중심 관세 온톨로지·지식그래프 구성"],
    ["summary", "보고서 요약", "요약 대상을 조사관용 핵심 요약으로 정리"],
    ["translate", "문서 번역", "첨부 문서 번역"],
    ["report", "표준보고서 생성", "입력자료를 유사사례 표준보고서 형식으로 재구성"],
  ]},
  { title: "외부연계 AI 서비스", agents: [
    ["web_search", "웹 정보수집 요청", "참고 URL 등록 후 업체·공급망·가격 변동 외부정보 수집 요청"],
    ["patent", "특허정보 조회", "특허/로열티 거래·과세가격 반영 여부 확인"],
    ["law", "법령 검토", "관련 법령·고시·판례·유권해석 근거 검색"],
    ["address_check", "주소확인", "주소가 가정집(주거용)인지 상가건물(사업용)인지 확인"],
    ["mail_share", "내부메일 공유", "분석결과 보고서를 지정 수신자에게 메일 공유"],
  ]},
  { title: "보고서 생성 및 검증", agents: [
    ["report_generate", "보고서 생성", "대상 자료를 공식 조사보고서 초안으로 통합"],
    ["report_validate", "보고서 검증", "근거 충실성·과도한 추론·출처(URL) 검증"],
    ["result_synthesis", "결과통합", "선행 단계 결과를 지정한 최종 형식으로 종합"],
  ]},
];
const RECOMMEND = new Set(["declaration_verify", "hs_verify", "customs_value", "ocr"]);
const CONFIG = {
  customs_value: [
    { key: "method", label: "평가 방법", type: "opt", def: "m1",
      options: [["m1", "거래가격 기준"], ["m6", "합리적 기준"], ["auto", "자동 판단"]] },
  ],
  web_search: [
    { key: "keyword", label: "검색 키워드", type: "text", def: "", placeholder: "예: ABC Tech 원산지 거래" },
    { key: "url", label: "지정 URL (선택)", type: "text", def: "", placeholder: "https://" },
  ],
  patent: [
    { key: "q", label: "특허번호 / 출원인", type: "text", def: "", placeholder: "예: 10-2024-0012345 또는 ABC Tech" },
  ],
  law: [
    { key: "scope", label: "검토 범위", type: "opt", def: "customs",
      options: [["customs", "관세법"], ["fta", "FTA·협정"], ["trade", "대외무역법"], ["all", "전체"]] },
  ],
  address_check: [
    { key: "address", label: "확인 주소", type: "text", def: "", placeholder: "예: 서울 금천구 가산디지털1로 951" },
  ],
  translate: [
    { key: "lang", label: "대상 언어", type: "opt", def: "ko",
      options: [["ko", "한국어"], ["en", "영어"], ["zh", "중국어"], ["ja", "일본어"]] },
  ],
  summary: [
    { key: "len", label: "요약 길이", type: "opt", def: "mid",
      options: [["short", "짧게"], ["mid", "보통"], ["long", "상세"]] },
  ],
  mail_share: [
    { key: "to", label: "수신자 메일", type: "text", def: "", placeholder: "name@customs.go.kr" },
  ],
};
const EXISTING_RAG = [
  ["kb_base", "관세조사023 기초자료 RAG", "문서 124건 · 최근 갱신 2026-06-20"],
  ["kb_origin", "원산지·FTA 검증 RAG", "문서 38건 · 최근 갱신 2026-06-12"],
];
const PERMS = [
  ["org", "전체 공개", "모든 조사관이 검색·활용"],
  ["dept", "부서", "관세조사국 내 검색 허용"],
  ["team", "조사팀", "해당 조사팀 구성원만"],
  ["me", "본인만", "등록자 본인 전용"],
];

/* 에이전트 id → 표시명(제출 결과용) */
const AGENT_NAME = {};
GROUPS.forEach(g => g.agents.forEach(([id, name]) => { AGENT_NAME[id] = name; }));

/* ── 인라인 스타일 상수(설계 원본 그대로) ── */
const SEL = "border:1.5px solid #2f6fed;background:#eef4ff;border-radius:11px;overflow:hidden;transition:all .12s;";
const UNSEL = "border:1.5px solid #e3e9f2;background:#fff;border-radius:11px;overflow:hidden;transition:all .12s;";
const BOX_BASE = "width:18px;height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;margin-top:1px;";
const BOX_SEL = BOX_BASE + "background:#2f6fed;border:1.5px solid #2f6fed;";
const BOX_UNSEL = BOX_BASE + "background:#fff;border:1.5px solid #c6cfde;";
const OPT_SEL = "border:1.5px solid #2f6fed;background:#2f6fed;color:#fff;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:700;cursor:pointer;";
const OPT_UNSEL = "border:1.5px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;";
const CARD_SEL = "border:1.5px solid #2f6fed;background:#fff;border-radius:10px;padding:11px 13px;cursor:pointer;box-shadow:0 2px 8px rgba(47,111,237,.16);";
const CARD_UNSEL = "border:1.5px solid #dbe3ef;background:#fff;border-radius:10px;padding:11px 13px;cursor:pointer;";
const CARD_READONLY = "border:1px solid #e3e9f2;background:#fbfdff;border-radius:10px;padding:11px 13px;";
const CHEV_BASE = "font-size:15px;color:#9aa3b3;transition:transform .15s;display:inline-block;";
const PILL_BASE = "display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;font-size:12.5px;font-weight:700;";

/* ── 내부 상태 ── */
let S = null;          // { stage, selected:Set, expanded:Set, cfg:{}, file, subject, onSubmit }
let _bound = false;

function initState(opts){
  return {
    stage: "empty",
    selected: new Set(["declaration_verify", "hs_verify"]),
    expanded: new Set(),
    cfg: {},
    files: [],
    subject: opts.subject || "",
    subjectId: opts.subjectId || "",
    registeredRags: Array.isArray(opts.registeredRags) ? opts.registeredRags : [],
    onSubmit: typeof opts.onSubmit === "function" ? opts.onSubmit : null,
  };
}

/* ── 유틸 ── */
function fileKindBadge(name){
  const ext = (name.split(".").pop() || "").toLowerCase();
  if(["xls", "xlsx", "csv"].includes(ext)) return { label: "XLS", bg: "#e4f6ec", fg: "#1f9254" };
  if(["doc", "docx"].includes(ext))        return { label: "DOC", bg: "#e6effd", fg: "#2456c9" };
  if(["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext)) return { label: "IMG", bg: "#efe8fb", fg: "#7c3aed" };
  return { label: "PDF", bg: "#fde8e8", fg: "#c0392b" };
}
function humanSize(bytes){
  if(!bytes && bytes !== 0) return "";
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
function todayStr(){
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nowStamp(){
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function expiry(v){
  if(v === "none") return "무기한";
  const d = new Date();
  const add = { "3m": 3, "6m": 6, "1y": 12 }[v] || 0;
  d.setMonth(d.getMonth() + add);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function setCfg(id, key, val){
  if(!S.cfg[id]) S.cfg[id] = {};
  S.cfg[id][key] = val;
}
function ragInvalidState(){
  const rc = S.cfg.rag_create || {};
  const mode = rc.mode || "new";
  const on = S.selected.has("rag_create");
  const newInvalid = on && mode === "new" && (!(rc.name && rc.name.trim()) || !rc.perm || !rc.validity
    || (rc.validity === "custom" && !rc.customExpiry));
  const existInvalid = on && mode === "existing" && !rc.existingId;
  return { on, mode, newInvalid, existInvalid, invalid: newInvalid || existInvalid };
}
function footerData(){
  const ready = S.stage === "ready";
  const count = S.selected.size;
  const { mode, invalid } = ragInvalidState();
  const canSubmit = ready && count > 0 && !invalid;
  const hint = ready
    ? (invalid
        ? (mode === "new" ? "신규 RAG는 이름·검색 권한·유효기간(임의 설정 시 만료일)이 필수입니다." : "추가할 기존 RAG를 선택하세요.")
        : (count > 0 ? count + "개 AI 서비스로 처리 예약됩니다." : "처리할 AI 에이전트를 1개 이상 선택하세요."))
    : "파일을 업로드하면 속성 분석이 시작됩니다.";
  const label = canSubmit ? "파일 등록 · " + count + "개 서비스" : "파일 등록";
  const style = canSubmit
    ? "border:none;background:#2f6fed;color:#fff;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;"
    : "border:none;background:#c8d2e2;color:#fff;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:700;cursor:not-allowed;";
  return { count, canSubmit, hint, label, style };
}

/* ── 렌더 조각 ── */
function buildSettingsHtml(id){
  const fields = CONFIG[id];
  if(!fields) return "";
  const cur = S.cfg[id] || {};
  const rows = fields.map(f => {
    const val = cur[f.key] !== undefined ? cur[f.key] : f.def;
    let inner = "";
    if(f.type === "text"){
      inner = `<input type="text" value="${escapeHtml(val)}" data-fre-cfg-text="${id}::${f.key}" placeholder="${escapeHtml(f.placeholder || "")}"
        style="width:100%;border:1.5px solid #d8e0ec;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;color:#23314e;outline:none;background:#fff;">`;
    } else {
      inner = `<div style="display:flex;flex-wrap:wrap;gap:7px;">` + f.options.map(([ov, ol]) =>
        `<div data-fre-cfg-opt="${id}::${f.key}::${ov}" style="${val === ov ? OPT_SEL : OPT_UNSEL}">${escapeHtml(ol)}</div>`
      ).join("") + `</div>`;
    }
    return `<div>
      <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:7px;">${escapeHtml(f.label)}</div>
      ${inner}
    </div>`;
  }).join("");
  return `<div style="border-top:1px dashed #cfddf6;background:#f5f9ff;padding:14px 16px 16px;display:flex;flex-direction:column;gap:15px;">${rows}</div>`;
}

function agentCardHtml(id, name, desc){
  const selected = S.selected.has(id);
  const rec = RECOMMEND.has(id);
  const needsConfig = !!CONFIG[id];
  return `
    <div style="${selected ? SEL : UNSEL}">
      <div data-fre-agent-toggle="${id}" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:13px 14px;">
        <span style="${selected ? BOX_SEL : BOX_UNSEL}">${selected ? `<span style="color:#fff;font-size:12px;font-weight:900;line-height:1;">✓</span>` : ""}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13.5px;font-weight:700;color:#23314e;">${escapeHtml(name)}</span>
            ${rec ? `<span style="font-size:10.5px;font-weight:800;color:#2e9e5b;background:#e7f5ec;padding:2px 6px;border-radius:5px;">추천</span>` : ""}
            <span style="margin-left:auto;display:inline-flex;align-items:center;gap:6px;">
              ${needsConfig ? `<span style="font-size:10.5px;font-weight:800;color:#2f6fed;background:#e8f0ff;padding:2px 7px;border-radius:5px;">설정 필요</span>` : ""}
              <button type="button" data-fre-svc-detail="${escapeHtml(name)}" title="입력정의·결과형식 상세 보기"
                style="border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:6px;padding:2px 8px;font-size:10.5px;font-weight:700;cursor:pointer;line-height:1.5;">상세</button>
            </span>
          </div>
          <div style="font-size:12px;color:#8590a6;margin-top:5px;line-height:1.45;">${escapeHtml(desc)}</div>
        </div>
      </div>
      ${selected ? buildSettingsHtml(id) : ""}
    </div>`;
}

/* 업무지식베이스(정형DB·업무RAG 검색)는 기초자료 수집/등록의 AI 서비스 선택에서 제외한다.
   지식 검색은 분석 시나리오·My AI 분석에서 수행하며, 파일 등록 단계에는 노출하지 않는다. */
const KB_EXCLUDED = new Set([
  "db_cdw", "db_external", "company_profile",
  "rag_customs", "rag_audit", "rag_investigation", "rag_global", "rag_consultation",
]);

function groupsHtml(){
  return GROUPS.map((g, gi) => {
    const agents = g.agents.filter(([id]) => id !== "rag_create" && !KB_EXCLUDED.has(id));
    const expanded = S.expanded.has(gi);
    const recCount = agents.filter(([id]) => RECOMMEND.has(id)).length;
    const visible = expanded ? agents : agents.filter(([id]) => RECOMMEND.has(id));
    const hidden = agents.length - visible.length;
    const moreLabel = expanded ? "접기" : (recCount > 0 ? "나머지 " + hidden + "개 보기" : hidden + "개 서비스 보기");
    const chev = expanded ? CHEV_BASE + "transform:rotate(180deg);" : CHEV_BASE;
    const cards = visible.map(([id, name, desc]) => agentCardHtml(id, name, desc)).join("");
    return `
      <div style="margin-top:14px;">
        <div data-fre-group-toggle="${gi}" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 2px;">
          <span style="width:4px;height:14px;border-radius:2px;background:#2f6fed;display:inline-block;"></span>
          <span style="font-size:12.5px;font-weight:800;color:#5a6577;">${escapeHtml(g.title)}</span>
          <span style="font-size:11px;font-weight:700;color:#9aa3b3;">추천 ${recCount} · 전체 ${agents.length}</span>
          <span style="margin-left:auto;font-size:12px;color:#2f6fed;font-weight:700;">${moreLabel}</span>
          <span style="${chev}">⌄</span>
        </div>
        ${visible.length ? `<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">${cards}</div>` : ""}
      </div>`;
  }).join("");
}

/* 등록된 RAG 목록: 이 분석작업에서 생성된 업무특화 RAG(최신순) + 기본 샘플(동일 이름은 실제 기록 우선) */
function registeredRagList(){
  const created = (S.registeredRags || []).map(r => ({
    id: r.id, name: r.name, meta: r.meta || "업무특화 RAG",
    perm: r.perm || "", validity: r.validity || "", expiry: r.expiry || "",
    ownerName: r.ownerName || "", createdAt: r.createdAt || "", sample: false,
  }));
  const names = new Set(created.map(r => r.name));
  const samples = EXISTING_RAG.filter(([, label]) => !names.has(label))
    .map(([id, label, sub]) => ({ id, name: label, meta: sub, perm: "", validity: "", expiry: "", ownerName: "", createdAt: "", sample: true }));
  return [...created, ...samples];
}

const RAG_PERM_KO = { org: "전체 공개", dept: "부서", team: "조사팀", me: "본인만" };
const RAG_VAL_KO = { "3m": "3개월", "6m": "6개월", "1y": "1년", none: "무기한", custom: "임의 설정" };
const RAG_VALIDITY_OPTIONS = [["3m", "3개월"], ["6m", "6개월"], ["1y", "1년"], ["custom", "임의 설정"]];

/* 기존 RAG 카드 부가정보: 검색권한 · 유효기간(만료) · 초기 생성 담당자 */
function ragCardSub(r){
  if(r.sample) return r.meta;
  const parts = [];
  if(r.createdAt) parts.push(`등록 ${r.createdAt.slice(0, 10)}`);
  parts.push(`검색권한 ${RAG_PERM_KO[r.perm] || "전체 공개"}`);
  const val = RAG_VAL_KO[r.validity] || "무기한";
  parts.push(`유효기간 ${val}${r.expiry && r.expiry !== "무기한" ? ` (~${r.expiry})` : ""}`);
  if(r.ownerName) parts.push(`생성 담당자 ${r.ownerName}`);
  return parts.join(" · ");
}

function ragSectionHtml(){
  const rc = S.cfg.rag_create || {};
  const { on, mode, newInvalid } = ragInvalidState();
  const modeCards = [
    ["new", "신규 RAG 생성", "업무특화 RAG를 새로 만듭니다"],
    ["existing", "기존 RAG에 추가", "이 분석의 기존 RAG에 자료를 추가합니다"],
  ].map(([id, label, desc]) =>
    `<div data-fre-rag-mode="${id}" style="${mode === id ? CARD_SEL : CARD_UNSEL}">
      <div style="font-size:13px;font-weight:800;color:#23314e;">${label}</div>
      <div style="font-size:11.5px;color:#8590a6;margin-top:4px;line-height:1.4;">${desc}</div>
    </div>`).join("");

  // 동작방식 선택과 함께 항상 표시되는 등록된 RAG 목록.
  // '기존 RAG에 추가' 모드에서는 선택 대상(필수), 그 외에는 참고용으로 표시.
  const registered = registeredRagList();
  const selectable = mode === "existing";
  const registeredCards = registered.length
    ? registered.map(r =>
        `<div ${selectable ? `data-fre-rag-existing="${r.id}"` : ""} style="${selectable ? (rc.existingId === r.id ? CARD_SEL : CARD_UNSEL) : CARD_READONLY}">
          <div style="font-size:13px;font-weight:800;color:#23314e;">${escapeHtml(r.name)}</div>
          <div style="font-size:11.5px;color:#8590a6;margin-top:3px;">${escapeHtml(ragCardSub(r))}</div>
        </div>`).join("")
    : `<div style="font-size:11.5px;color:#9aa3b3;padding:11px 13px;border:1px dashed #d8e0ec;border-radius:10px;">등록된 업무특화 RAG가 없습니다. 신규로 생성하세요.</div>`;
  const registeredLabel = selectable
    ? `추가할 RAG 선택 <span style="color:#dc4646;">*</span>`
    : `등록된 RAG <span style="font-weight:600;color:#9aa3b3;">· 참고</span>`;

  // 선택한 기존 RAG 설정 변경 — 사용 권한 = 변경 권한(목록 자체가 사용 권한 보유분만 표시됨)
  const selRag = selectable ? registered.find(r => r.id === rc.existingId) : null;
  const curPerm = rc.existingPerm !== undefined ? rc.existingPerm : ((selRag && selRag.perm) || "org");
  const curVal = rc.existingValidity !== undefined
    ? rc.existingValidity
    : ((selRag && ["3m", "6m", "1y"].includes(selRag.validity)) ? selRag.validity : "custom");
  const curCustom = rc.existingCustomExpiry !== undefined
    ? rc.existingCustomExpiry
    : ((selRag && selRag.expiry && selRag.expiry !== "무기한") ? selRag.expiry : "");
  const editPermCards = PERMS.map(([id, label, desc]) =>
    `<div data-fre-rag-eperm="${id}" style="${curPerm === id ? CARD_SEL : CARD_UNSEL}">
      <div style="font-size:12.5px;font-weight:800;color:#23314e;">${label}</div>
      <div style="font-size:11px;color:#8590a6;margin-top:4px;line-height:1.35;">${desc}</div>
    </div>`).join("");
  const editValChips = RAG_VALIDITY_OPTIONS.map(([id, label]) =>
    `<div data-fre-rag-evalidity="${id}" style="${curVal === id ? OPT_SEL : OPT_UNSEL}">${label}</div>`).join("");
  const editExpiryPreview = curVal === "custom" ? (curCustom || "현행 유지") : expiry(curVal);
  const existingEditPanel = selRag ? `
    <div style="border:1.5px solid #dbe6fb;background:#fff;border-radius:10px;padding:13px;display:flex;flex-direction:column;gap:13px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:11.5px;font-weight:800;color:#5a6577;">선택 RAG 설정 변경</span>
        <span style="font-size:11px;color:#9aa3b3;">사용 권한이 있는 담당자는 검색 권한·유효기간을 변경할 수 있습니다.</span>
        ${selRag.ownerName ? `<span style="margin-left:auto;font-size:11px;font-weight:700;color:#2f5fd6;background:#eef4ff;border-radius:6px;padding:3px 8px;">초기 생성 담당자 ${escapeHtml(selRag.ownerName)}</span>` : ""}
      </div>
      <div>
        <div style="font-size:11px;font-weight:800;color:#5a6577;margin-bottom:7px;">검색 권한 <span style="font-weight:600;color:#9aa3b3;">(사용 권한과 변경 권한이 동일)</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">${editPermCards}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:800;color:#5a6577;margin-bottom:7px;">유효기간</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          ${editValChips}
          <span style="margin-left:auto;font-size:11.5px;color:#5a6577;">만료 예정 <b style="color:#2f5fd6;" data-fre-eexpiry-preview>${editExpiryPreview}</b></span>
        </div>
        ${curVal === "custom" ? `
          <input type="date" data-fre-rag-ecustom-date value="${escapeHtml(curCustom || "")}" min="${todayStr()}"
            style="margin-top:9px;border:1.5px solid #d8e0ec;border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;color:#23314e;outline:none;background:#fff;">` : ""}
      </div>
    </div>` : "";

  const permCards = PERMS.map(([id, label, desc]) =>
    `<div data-fre-rag-perm="${id}" style="${rc.perm === id ? CARD_SEL : CARD_UNSEL}">
      <div style="font-size:12.5px;font-weight:800;color:#23314e;">${label}</div>
      <div style="font-size:11px;color:#8590a6;margin-top:4px;line-height:1.35;">${desc}</div>
    </div>`).join("");

  const validityChips = RAG_VALIDITY_OPTIONS.map(([id, label]) =>
    `<div data-fre-rag-validity="${id}" style="${rc.validity === id ? OPT_SEL : OPT_UNSEL}">${label}</div>`).join("");
  const newExpiryPreview = rc.validity === "custom" ? (rc.customExpiry || "—") : (rc.validity ? expiry(rc.validity) : "—");

  const expand = !on ? "" : `
    <div style="border-top:1px dashed #cfddf6;background:#f5f9ff;padding:16px;display:flex;flex-direction:column;gap:16px;">
      <div>
        <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:8px;">동작 방식</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${modeCards}</div>
      </div>
      <div>
        <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:8px;">${registeredLabel}</div>
        <div style="display:flex;flex-direction:column;gap:9px;">${registeredCards}</div>
      </div>
      ${existingEditPanel}
      ${mode === "new" ? `
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div>
            <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:8px;">RAG 이름 <span style="color:#dc4646;">*</span></div>
            <input type="text" value="${escapeHtml(rc.name || "")}" data-fre-rag-name placeholder="예: 관세조사023 업무특화 RAG"
              style="width:100%;border:1.5px solid #d8e0ec;border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;color:#23314e;outline:none;background:#fff;">
          </div>
          <div>
            <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:8px;">검색 권한 <span style="color:#dc4646;">*</span></div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;">${permCards}</div>
          </div>
          <div>
            <div style="font-size:11.5px;font-weight:800;color:#5a6577;margin-bottom:8px;">유효기간 <span style="color:#dc4646;">*</span></div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
              ${validityChips}
              <span style="margin-left:auto;font-size:11.5px;color:#5a6577;">만료 예정 <b style="color:#2f5fd6;" data-fre-expiry-preview>${newExpiryPreview}</b></span>
            </div>
            ${rc.validity === "custom" ? `
              <input type="date" data-fre-rag-custom-date value="${escapeHtml(rc.customExpiry || "")}" min="${todayStr()}"
                style="margin-top:9px;border:1.5px solid #d8e0ec;border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;color:#23314e;outline:none;background:#fff;">` : ""}
          </div>
        </div>` : ""}
      ${newInvalid ? `<div style="font-size:11.5px;font-weight:700;color:#c0392b;background:#fdeaea;border-radius:8px;padding:9px 12px;">신규 업무특화 RAG는 이름·검색 권한·유효기간(임의 설정 시 만료일)이 필수 항목입니다.</div>` : ""}
    </div>`;

  return `
    <div style="margin-top:14px;border:1.5px solid #cfe0ff;border-radius:14px;overflow:hidden;background:linear-gradient(180deg,#f3f8ff,#fff);">
      <div data-fre-rag-toggle style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:14px 16px;">
        <span style="${on ? BOX_SEL : BOX_UNSEL}">${on ? `<span style="color:#fff;font-size:12px;font-weight:900;line-height:1;">✓</span>` : ""}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10.5px;font-weight:800;color:#2f6fed;background:#e3edff;padding:3px 9px;border-radius:6px;">업무특화RAG</span>
            <span style="font-size:14.5px;font-weight:800;color:#16213d;">업무특화RAG 분석서비스</span>
            <button type="button" data-fre-svc-detail="업무특화RAG 분석서비스" title="입력정의·결과형식 상세 보기"
              style="margin-left:auto;border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:6px;padding:2px 8px;font-size:10.5px;font-weight:700;cursor:pointer;line-height:1.5;">상세</button>
          </div>
          <div style="font-size:12px;color:#8590a6;margin-top:6px;line-height:1.45;">선택 자료를 RAG 지식으로 구성합니다. 기존 RAG에 추가하거나 업무특화 RAG를 신규 생성할 수 있습니다.</div>
        </div>
      </div>
      ${expand}
    </div>`;
}

function bodyHtml(){
  if(S.stage === "empty"){
    return `
      <div data-fre-pick data-fre-dropzone style="border:2px dashed #c3d0e6;border-radius:14px;background:#f7faff;padding:48px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;cursor:pointer;text-align:center;">
        <div style="width:60px;height:60px;border-radius:50%;background:#e7f0ff;display:flex;align-items:center;justify-content:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f6fed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>
        </div>
        <div style="font-size:16px;font-weight:700;color:#24324f;">파일을 끌어다 놓거나 클릭하여 업로드</div>
        <div style="font-size:13px;color:#8590a6;">PDF, XLS, XLSX, DOCX, 이미지 문서 · 최대 50MB · 여러 개 선택 가능</div>
        <div style="margin-top:6px;padding:9px 18px;background:#2f6fed;color:#fff;border-radius:9px;font-size:13.5px;font-weight:600;">파일 선택</div>
      </div>`;
  }
  if(S.stage === "analyzing"){
    return `
      <div style="border:1px solid #e6ebf3;border-radius:14px;padding:44px 24px;display:flex;flex-direction:column;align-items:center;gap:16px;">
        <div style="width:42px;height:42px;border-radius:50%;border:4px solid #e3eaf6;border-top-color:#2f6fed;animation:fre-spin .8s linear infinite;"></div>
        <div style="font-size:15px;font-weight:700;color:#24324f;">파일 속성을 분석하고 있습니다…</div>
        <div style="font-size:13px;color:#8590a6;">OCR · 문서유형 감지 · 핵심 항목 추출 진행 중</div>
      </div>`;
  }
  // ready — 파일별 분석 프레임(개별 삭제 버튼 포함), 많아지면 목록 스크롤, 맨 아래 파일추가
  const files = S.files || [];
  const specs = [
    { k: "문서유형 (자동감지)", v: "세금계산서" },
    { k: "언어", v: "영문 / 국문 혼용" },
    { k: "발행일자", v: "2026-04-22" },
    { k: "OCR 신뢰도", v: "98.2%" },
  ];
  const pill = (label, value, warn) =>
    `<span style="${PILL_BASE}${warn ? "background:#fdeaea;color:#c0392b;" : "background:#e3edff;color:#2456c9;"}">
      <span style="opacity:.6;font-weight:600;">${escapeHtml(label)}</span>${escapeHtml(value)}</span>`;
  const extracted = [
    pill("총액 ", "USD $1,820,000"), pill("품명 ", "ELECTRONIS XXX"),
    pill("공급자 ", "ABC Tech"), pill("수입자 ", "지에프 글로벌"),
    pill("거래일자 ", "2026-04-18"), pill("이상감지 ", "품명 불일치 의심", true),
  ].join("");
  const specsHtml = specs.map(sp =>
    `<div style="background:#fff;padding:11px 14px;">
      <div style="font-size:11px;color:#9aa3b3;font-weight:600;">${escapeHtml(sp.k)}</div>
      <div style="font-size:12.5px;color:#2a3550;font-weight:700;margin-top:3px;">${escapeHtml(sp.v)}</div>
    </div>`).join("");
  const fileFrames = files.map((file, i) => {
    const b = fileKindBadge(file.name || "");
    return `
      <div style="border:1px solid #e6ebf3;border-radius:12px;overflow:hidden;background:#fff;flex:0 0 auto;">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f7faff;border-bottom:1px solid #eef1f6;">
          <div style="width:34px;height:34px;border-radius:9px;background:${b.bg};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${b.fg};flex:0 0 auto;">${b.label}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:800;color:#16213d;word-break:break-all;">${escapeHtml(file.name || "")}</div>
            <div style="font-size:11.5px;color:#8590a6;margin-top:2px;">${escapeHtml(file.meta || "")}</div>
          </div>
          <button data-fre-file-del="${i}" title="파일 삭제" aria-label="${escapeHtml(file.name || "")} 삭제"
            style="flex:0 0 auto;width:20px;height:20px;border:1px solid #e3e9f2;background:#fff;border-radius:6px;color:#8590a6;font-size:11px;cursor:pointer;line-height:1;padding:0;">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:#eef1f6;">${specsHtml}</div>
        <div style="padding:12px 14px;border-top:1px solid #eef1f6;">
          <div style="font-size:11.5px;font-weight:700;color:#9aa3b3;margin-bottom:8px;">추출 데이터</div>
          <div style="display:flex;flex-wrap:wrap;gap:7px;">${extracted}</div>
        </div>
      </div>`;
  }).join("");

  return `
    <div style="display:flex;gap:18px;align-items:flex-start;">
      <!-- LEFT: 파일별 분석 프레임 목록 + 파일추가 -->
      <div style="width:300px;flex:0 0 auto;position:sticky;top:0;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;flex-direction:column;gap:10px;max-height:56vh;overflow-y:auto;padding-right:2px;">
          ${fileFrames}
        </div>
        <button data-fre-add style="border:1.5px solid #2f6fed;background:#eef4ff;color:#2f6fed;border-radius:10px;padding:9px 0;font-size:13px;font-weight:700;cursor:pointer;width:100%;">파일추가</button>
      </div>

      <!-- RIGHT: 에이전트 선택 -->
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;">
          <div>
            <div style="font-size:16px;font-weight:800;color:#16213d;">처리 AI 에이전트 선택</div>
            <div style="font-size:12.5px;color:#8590a6;margin-top:3px;">문서유형 기준 <b style="color:#2e9e5b;">추천</b> 서비스만 표시됩니다. 설정이 필요한 에이전트는 카드에서 바로 값을 입력하세요.</div>
          </div>
          <div style="font-size:13px;color:#5a6577;white-space:nowrap;">선택됨 <b style="color:#2f6fed;">${S.selected.size}</b>개</div>
        </div>
        ${ragSectionHtml()}
        ${groupsHtml()}
      </div>
    </div>`;
}

function modalHtml(){
  const fd = footerData();
  return `
    <div data-fre-modal style="width:1000px;max-width:96vw;max-height:92vh;min-width:720px;min-height:420px;resize:both;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.32);display:flex;flex-direction:column;overflow:hidden;animation:fre-popin .28s cubic-bezier(.2,.8,.2,1);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 22px;border-bottom:1px solid #eef1f6;flex:0 0 auto;">
        <div>
          <div style="font-size:17px;font-weight:800;color:#16213d;letter-spacing:-.01em;">기초자료 파일 등록</div>
          <div style="font-size:12px;color:#8590a6;margin-top:3px;">파일을 등록하면 속성을 자동 분석하고, 처리할 AI 에이전트를 선택합니다.</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          ${S.subject ? `<div style="font-size:12px;color:#8590a6;">조사 대상 <b style="color:#2f5fd6;">${escapeHtml(S.subject)}</b>${S.subjectId ? " · " + escapeHtml(S.subjectId) : ""}</div>` : ""}
          <button data-fre-close style="width:30px;height:30px;border:none;background:#f3f5f9;border-radius:8px;color:#5a6577;font-size:16px;cursor:pointer;line-height:1;">✕</button>
        </div>
      </div>
      <div style="padding:18px 22px 6px;overflow-y:auto;flex:1 1 auto;">${bodyHtml()}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 22px;border-top:1px solid #eef1f6;flex:0 0 auto;background:#fcfdff;">
        <div data-fre-footer style="font-size:12px;color:#9aa3b3;">${escapeHtml(fd.hint)}</div>
        <div style="display:flex;gap:10px;">
          <button data-fre-close style="border:1px solid #d8e0ec;background:#fff;color:#5a6577;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;">취소</button>
          <button data-fre-submit ${fd.canSubmit ? "" : "disabled"} style="${fd.style}">${escapeHtml(fd.label)}</button>
        </div>
      </div>
    </div>`;
}

function overlayEl(){ return document.getElementById("fileRegisterOverlay"); }

function rerender(){
  const ov = overlayEl();
  if(!ov) return;
  // 사용자가 조절한 모달 크기(resize 인라인 width/height)를 재렌더 후에도 유지
  const prev = ov.querySelector("[data-fre-modal]");
  const size = prev ? { w: prev.style.width, h: prev.style.height } : null;
  ov.innerHTML = modalHtml();
  if(size){
    const modal = ov.querySelector("[data-fre-modal]");
    if(modal){
      if(size.w) modal.style.width = size.w;
      if(size.h) modal.style.height = size.h;
    }
  }
}
/* 텍스트 입력 중에는 전체 재렌더 대신 푸터(안내문·등록 버튼)만 갱신해 포커스 유지 */
function refreshFooter(){
  const ov = overlayEl();
  if(!ov) return;
  const fd = footerData();
  const hintEl = ov.querySelector("[data-fre-footer]");
  if(hintEl) hintEl.textContent = fd.hint;
  const btn = ov.querySelector("[data-fre-submit]");
  if(btn){ btn.disabled = !fd.canSubmit; btn.setAttribute("style", fd.style); btn.textContent = fd.label; }
}

function close(){
  const ov = overlayEl();
  if(ov) ov.style.display = "none";
  S = null;
}

function pickFiles(append){
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;   // 여러 파일 동시 등록
  input.accept = ".pdf,.xls,.xlsx,.csv,.doc,.docx,.jpg,.jpeg,.png,.gif";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const files = input.files ? [...input.files] : [];
    document.body.removeChild(input);
    if(files.length) startAnalyze(files, append);
  });
  document.body.appendChild(input);
  input.click();
}

/* append=true: 이미 선택된 파일 목록에 새 파일을 추가(파일명+크기 기준 중복 제거) */
function startAnalyze(fileList, append){
  const list = Array.isArray(fileList) ? fileList : [fileList];
  const stamp = nowStamp();
  const mapped = list.map(file => ({
    name: file.name,
    size: file.size,
    meta: `${fileKindBadge(file.name).label} 문서 · ${humanSize(file.size)} · 업로드 ${stamp}`,
  }));
  if(append && Array.isArray(S.files) && S.files.length){
    const seen = new Set(S.files.map(f => `${f.name}::${f.size}`));
    S.files = [...S.files, ...mapped.filter(f => !seen.has(`${f.name}::${f.size}`))];
  } else {
    S.files = mapped;
  }
  S.stage = "analyzing";
  rerender();
  clearTimeout(S._t);
  S._t = setTimeout(() => { if(S){ S.stage = "ready"; rerender(); } }, 1400);
}

function submit(){
  const fd = footerData();
  if(!fd.canSubmit) return;
  const agentNames = [...S.selected].map(id => AGENT_NAME[id] || id);
  const ragOn = S.selected.has("rag_create");
  const files = S.files || [];
  let rag = null;
  if(ragOn){
    rag = { ...(S.cfg.rag_create || {}) };
    if((rag.mode || "new") === "existing" && rag.existingId){
      // 선택한 기존 RAG의 표시명을 함께 전달 — 빌트인 샘플을 실제 레지스트리 기록으로 등록할 때 필요
      const hit = registeredRagList().find(r => r.id === rag.existingId);
      rag.existingName = hit ? hit.name : "";
      // 설정이 원래 값 그대로면 전달하지 않음 — 동일 유효기간 재적용으로 만료일이 연장되지 않도록
      if(hit && !hit.sample){
        if(rag.existingPerm === hit.perm) delete rag.existingPerm;
        const validityUnchanged = rag.existingValidity === "custom"
          ? (!rag.existingCustomExpiry || rag.existingCustomExpiry === hit.expiry)
          : rag.existingValidity === hit.validity;
        if(validityUnchanged){ delete rag.existingValidity; delete rag.existingCustomExpiry; }
      }
    }
  }
  const payload = {
    files,
    file: files[0] || null,   // 하위호환
    agentIds: [...S.selected],
    agentNames,
    rag,
  };
  const cb = S.onSubmit;
  close();
  if(cb) cb(payload);
}

/* ── 이벤트 위임(오버레이 1회 바인딩) ── */
function bindOverlay(ov){
  if(_bound) return;
  _bound = true;

  ov.addEventListener("click", e => {
    if(!S) return;
    e.stopPropagation();   // 모달 내부 클릭이 앱 전역 핸들러로 전파되지 않도록
    if(e.target === ov){ close(); return; }   // 배경 클릭
    if(e.target.closest("[data-fre-close]")){ close(); return; }
    if(e.target.closest("[data-fre-pick]")){ pickFiles(); return; }
    if(e.target.closest("[data-fre-add]")){ pickFiles(true); return; }
    const fileDel = e.target.closest("[data-fre-file-del]");
    if(fileDel){
      const i = Number(fileDel.dataset.freFileDel);
      if(Array.isArray(S.files)) S.files.splice(i, 1);
      if(!S.files || !S.files.length){ S.stage = "empty"; S.files = []; }   // 전부 삭제하면 드롭존으로 복귀
      rerender();
      return;
    }
    if(e.target.closest("[data-fre-submit]")){ submit(); return; }

    // AI 서비스 '상세' 버튼 — 카드 선택 토글보다 먼저 처리해 클릭 전파로 선택이 바뀌지 않도록 한다
    const svcDetail = e.target.closest("[data-fre-svc-detail]");
    if(svcDetail){ openServiceDetailPopup(svcDetail.dataset.freSvcDetail); return; }

    const grp = e.target.closest("[data-fre-group-toggle]");
    if(grp){
      const gi = Number(grp.dataset.freGroupToggle);
      S.expanded.has(gi) ? S.expanded.delete(gi) : S.expanded.add(gi);
      rerender();
      return;
    }
    const agentToggle = e.target.closest("[data-fre-agent-toggle]");
    if(agentToggle){
      const id = agentToggle.dataset.freAgentToggle;
      S.selected.has(id) ? S.selected.delete(id) : S.selected.add(id);
      rerender();
      return;
    }
    if(e.target.closest("[data-fre-rag-toggle]")){
      S.selected.has("rag_create") ? S.selected.delete("rag_create") : S.selected.add("rag_create");
      rerender();
      return;
    }
    const ragMode = e.target.closest("[data-fre-rag-mode]");
    if(ragMode){ setCfg("rag_create", "mode", ragMode.dataset.freRagMode); rerender(); return; }
    const ragEx = e.target.closest("[data-fre-rag-existing]");
    if(ragEx){
      const id = ragEx.dataset.freRagExisting;
      setCfg("rag_create", "existingId", id);
      // 설정 변경 패널 초기값: 선택한 RAG의 현재 권한·유효기간(기간형 외에는 임의 설정 + 현행 만료일)
      const r = registeredRagList().find(x => x.id === id);
      setCfg("rag_create", "existingPerm", (r && r.perm) || "org");
      setCfg("rag_create", "existingValidity", (r && ["3m", "6m", "1y"].includes(r.validity)) ? r.validity : "custom");
      setCfg("rag_create", "existingCustomExpiry", (r && r.expiry && r.expiry !== "무기한") ? r.expiry : "");
      rerender();
      return;
    }
    const ragEperm = e.target.closest("[data-fre-rag-eperm]");
    if(ragEperm){ setCfg("rag_create", "existingPerm", ragEperm.dataset.freRagEperm); rerender(); return; }
    const ragEval = e.target.closest("[data-fre-rag-evalidity]");
    if(ragEval){ setCfg("rag_create", "existingValidity", ragEval.dataset.freRagEvalidity); rerender(); return; }
    const ragPerm = e.target.closest("[data-fre-rag-perm]");
    if(ragPerm){ setCfg("rag_create", "perm", ragPerm.dataset.freRagPerm); rerender(); return; }
    const ragVal = e.target.closest("[data-fre-rag-validity]");
    if(ragVal){ setCfg("rag_create", "validity", ragVal.dataset.freRagValidity); rerender(); return; }
    const cfgOpt = e.target.closest("[data-fre-cfg-opt]");
    if(cfgOpt){
      const [id, key, val] = cfgOpt.dataset.freCfgOpt.split("::");
      setCfg(id, key, val);
      rerender();
      return;
    }
  });

  // 텍스트 입력: 상태만 갱신(재렌더 없이) + 푸터만 갱신해 포커스 유지
  ov.addEventListener("input", e => {
    if(!S) return;
    const ragName = e.target.closest("[data-fre-rag-name]");
    if(ragName){ setCfg("rag_create", "name", ragName.value); refreshFooter(); return; }
    // 유효기간 임의 설정 날짜: 재렌더 없이 만료 예정 표시와 푸터만 갱신(입력 포커스 유지)
    const newDate = e.target.closest("[data-fre-rag-custom-date]");
    if(newDate){
      setCfg("rag_create", "customExpiry", newDate.value);
      const p = ov.querySelector("[data-fre-expiry-preview]");
      if(p) p.textContent = newDate.value || "—";
      refreshFooter();
      return;
    }
    const editDate = e.target.closest("[data-fre-rag-ecustom-date]");
    if(editDate){
      setCfg("rag_create", "existingCustomExpiry", editDate.value);
      const p = ov.querySelector("[data-fre-eexpiry-preview]");
      if(p) p.textContent = editDate.value || "현행 유지";
      return;
    }
    const cfgText = e.target.closest("[data-fre-cfg-text]");
    if(cfgText){
      const [id, key] = cfgText.dataset.freCfgText.split("::");
      setCfg(id, key, cfgText.value);
      return;
    }
  });

  // 드래그 앤 드롭: empty 단계는 드롭존에 새로 등록, ready 단계는 모달 어디든 드롭하면 파일 추가
  ov.addEventListener("dragover", e => {
    if(!S) return;
    if(S.stage === "empty" && e.target.closest("[data-fre-dropzone]")){ e.preventDefault(); return; }
    if(S.stage === "ready" && e.target.closest("[data-fre-modal]")){ e.preventDefault(); }
  });
  ov.addEventListener("drop", e => {
    if(!S) return;
    const inEmpty = S.stage === "empty" && e.target.closest("[data-fre-dropzone]");
    const inReady = S.stage === "ready" && e.target.closest("[data-fre-modal]");
    if(!inEmpty && !inReady) return;
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
    if(files.length) startAnalyze(files, !!inReady);
  });
}

/* ── 공개 API ── */
export function openFileRegisterPopup(opts = {}){
  let ov = overlayEl();
  if(!ov){
    ov = document.createElement("div");
    ov.id = "fileRegisterOverlay";
    ov.className = "file-register-overlay";
    document.body.appendChild(ov);
  }
  bindOverlay(ov);
  S = initState(opts);
  ov.style.display = "flex";
  rerender();
  // 데이터 소스 추가 패널에 드롭된 파일: 드롭존 단계를 건너뛰고 바로 속성 분석 시작
  const dropped = Array.isArray(opts.droppedFiles) ? opts.droppedFiles : [];
  if(dropped.length) startAnalyze(dropped);
}
