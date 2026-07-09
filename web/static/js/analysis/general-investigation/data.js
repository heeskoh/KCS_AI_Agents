import { escapeHtml } from "../../core/dom.js";

/* 외부 자료요청 — 주민등록·전화가입자·금융거래 등 외부기관 자료를 접수형으로 요청.
   실제 연계 없이 접수 이력·상태(접수됨→회신대기→회신완료)만 관리하는 모의 흐름
   (웹 정보수집 요청 에이전트와 동일한 접수형 컨셉). */
const EXTERNAL_REQUEST_KINDS = [
  { id: "resident", label: "주민등록", org: "행정안전부", icon: "🪪", placeholder: "대상자 성명/주민번호 앞자리" },
  { id: "telecom",  label: "전화가입자", org: "통신사(SKT·KT·LGU+)", icon: "📱", placeholder: "전화번호 또는 대상자명" },
  { id: "finance",  label: "금융거래", org: "FIU·은행", icon: "🏦", placeholder: "계좌번호 또는 대상자/기업명" },
];
const EXTERNAL_STATUS_FLOW = ["접수됨", "회신대기", "회신완료"];
const EXTERNAL_STATUS_TONE = { "접수됨": "wait", "회신대기": "running", "회신완료": "done" };

function giExternalRequestsHtml(aCase){
  const requests = aCase.externalRequests || [];
  return `
    <div class="gi-ext-requests">
      <h4>외부 자료요청 <span class="muted">외부기관 보유 자료(주민등록·전화가입자·금융거래 등)를 요청합니다 — 접수 후 회신 상태를 관리</span></h4>
      <div class="gi-ext-cards">
        ${EXTERNAL_REQUEST_KINDS.map(kind => `
          <div class="gi-ext-card">
            <div class="gi-ext-card-head">
              <strong>${kind.icon} ${escapeHtml(kind.label)}</strong>
              <span>${escapeHtml(kind.org)}</span>
            </div>
            <div class="gi-ext-card-form">
              <input id="giExtTarget_${kind.id}" type="text" placeholder="${escapeHtml(kind.placeholder)}">
              <button type="button" class="btn secondary" data-gi-ext-request="${kind.id}">자료요청 접수</button>
            </div>
          </div>
        `).join("")}
      </div>
      ${requests.length ? `
        <table class="gi-ext-table">
          <thead><tr><th>구분</th><th>대상</th><th>상태</th><th>접수일시</th><th></th></tr></thead>
          <tbody>
            ${requests.map(request => {
              const canAdvance = request.status !== "회신완료";
              return `
              <tr>
                <td>${escapeHtml(EXTERNAL_REQUEST_KINDS.find(k => k.id === request.kind)?.label || request.kind)}</td>
                <td>${escapeHtml(request.target || "")}</td>
                <td><span class="job-status ${EXTERNAL_STATUS_TONE[request.status] || "wait"}">${escapeHtml(request.status)}</span></td>
                <td>${escapeHtml(request.requestedAt || "")}</td>
                <td>
                  ${canAdvance ? `<button type="button" class="btn-inline-action" data-gi-ext-advance="${escapeHtml(request.id)}">다음 상태</button>` : ""}
                  <button type="button" class="btn-inline-action job-remove-action" data-gi-ext-remove="${escapeHtml(request.id)}">삭제</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      ` : `<div class="gi-insight-empty">접수된 외부 자료요청이 없습니다.</div>`}
    </div>
  `;
}

export function renderDataPanel(deps){
  const aCase = deps.activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const type = deps.genInvTypeById(aCase.invTypeId);
  const caseBadge = `${type.num} ${type.label} · ${aCase.caseId}`;
  /* 기업/개인 구분 없이 동일한 패널 — subjectName으로 수사 대상명 직접 표시.
     하단에 외부 자료요청(접수형) 섹션을 덧붙인다. */
  return deps.canvasDataPanel(deps.getActiveCanvasCompanyId(), {
    selectedLabel: aCase.targetType === "company" ? "수사 대상 기업" : "수사 대상 개인",
    subjectName:   aCase.targetName,
    heading:       "기초자료 수집/등록",
    description:   "수사 대상 관련 서류, 계약서, 수입신고 자료, 금융거래 내역 등을 업로드합니다.",
    caseBadge,
  }) + giExternalRequestsHtml(aCase);
}

export const dataSubtab = {
  id: "data",
  label: "기초자료 수집/등록",
  enabledWhen: context => !!context.case,
  aiServices: ["ocr", "rag_create", "db_cdw"],
  render: renderDataPanel,
};
