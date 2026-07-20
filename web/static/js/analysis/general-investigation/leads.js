/* 수사단서 경로 — 사건당 복수 등록·이력 축적(타임라인).
   6종 경로별로 등록 문서가 다르며, 일부 문서(정보입수보고서·정보분석계획/보고·조사의뢰서)는
   LLM 초안 생성 + 사용자 편집·확정 흐름을 지원한다.
   lead 스키마: { id, type, stage?, title, content, grade?, docType, aiDraft, draft,
                 confirmed, confirmedAt, parentLeadId?, createdAt, author } */
import { escapeHtml } from "../../core/dom.js";
import { crimeSummary } from "./crime-taxonomy.js";

export const LEAD_TYPES = [
  { id: "smuggle_report", label: "밀수신고",  icon: "🚨", docLabel: "신고내용",       hasGrade: true },
  { id: "intel",          label: "정·첩보",   icon: "🕵️", docLabel: "정보입수보고서", aiDraft: true },
  { id: "info_analysis",  label: "정보분석",  icon: "📊", aiDraft: true,
    stages: [
      { id: "plan",   docLabel: "정보분석계획" },
      { id: "report", docLabel: "정보분석보고" },
    ] },
  { id: "hq_order",       label: "본청지시",  icon: "🏛️", docLabel: "지시 내용" },
  { id: "inv_request",    label: "조사의뢰",  icon: "📨", docLabel: "조사의뢰서",     aiDraft: true },
  { id: "case_transfer",  label: "사건이첩",  icon: "📁", docLabel: "이첩 관련서류" },
];

export function leadTypeById(id){
  return LEAD_TYPES.find(type => type.id === id) || LEAD_TYPES[0];
}

export function leadDocLabel(lead){
  const type = leadTypeById(lead.type);
  if(type.stages){
    const stage = type.stages.find(s => s.id === lead.stage) || type.stages[0];
    return stage.docLabel;
  }
  return type.docLabel || type.label;
}

export function leadSupportsAiDraft(lead){
  return !!leadTypeById(lead.type).aiDraft;
}

const GRADE_TONES = { "A": "gi-grade-a", "B": "gi-grade-b", "C": "gi-grade-c" };

/* ── 단서 이력 타임라인 ─────────────────────────────────────────── */
export function leadTimelineHtml(aCase, activeLeadId){
  const leads = [...(aCase.leads || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if(!leads.length){
    return `<div class="empty-state">등록된 수사단서가 없습니다. 우측에서 단서 경로를 선택해 등록하세요.</div>`;
  }
  return `
    <div class="gi-lead-timeline">
      ${leads.map(lead => {
        const type = leadTypeById(lead.type);
        const docState = lead.confirmed
          ? `<span class="gi-lead-state done">문서 확정</span>`
          : lead.autoDrafting
            ? `<span class="gi-lead-state draft"><span class="home-running-dot"></span> AI 초안 생성 중</span>`
            : (lead.draft || lead.aiDraft)
              ? `<span class="gi-lead-state draft">초안 작성중</span>`
              : `<span class="gi-lead-state wait">문서 미작성</span>`;
        return `
        <div class="gi-lead-node${lead.id === activeLeadId ? " active" : ""}" data-gi-lead-select="${escapeHtml(lead.id)}" role="button" tabindex="0">
          <div class="gi-lead-node-dot">${type.icon}</div>
          <div class="gi-lead-node-body">
            <div class="gi-lead-node-head">
              <strong>${escapeHtml(type.label)}${lead.stage ? ` · ${escapeHtml(leadDocLabel(lead))}` : ""}</strong>
              ${lead.grade ? `<span class="gi-lead-grade ${GRADE_TONES[lead.grade] || ""}">${escapeHtml(lead.grade)}급</span>` : ""}
              ${docState}
              <button type="button" class="gi-lead-remove" data-gi-lead-remove="${escapeHtml(lead.id)}" aria-label="단서 삭제">×</button>
            </div>
            <p class="gi-lead-node-title">${escapeHtml(lead.title || "(제목 없음)")}</p>
            <span class="gi-lead-node-meta">${escapeHtml(lead.createdLabel || "")} · ${escapeHtml(lead.author || "")}</span>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ── 단서 등록 폼 (유형별 필드) ──────────────────────────────────── */
export function leadRegisterFormHtml(aCase, state){
  const activeType = leadTypeById(state.leadFormType);
  const isPlanStage = state.leadFormStage !== "report";
  const planLeads = (aCase.leads || []).filter(lead => lead.type === "info_analysis" && lead.stage === "plan");
  return `
    <div class="gi-lead-form">
      <div class="gi-lead-form-types">
        ${LEAD_TYPES.map(type => `
          <button type="button" class="gi-lead-type-btn${type.id === activeType.id ? " active" : ""}"
            data-gi-lead-type="${escapeHtml(type.id)}">${type.icon} ${escapeHtml(type.label)}</button>
        `).join("")}
      </div>
      ${activeType.stages ? `
        <div class="gi-lead-form-stages">
          ${activeType.stages.map(stage => `
            <button type="button" class="gi-lead-stage-btn${(isPlanStage ? "plan" : "report") === stage.id ? " active" : ""}"
              data-gi-lead-stage="${escapeHtml(stage.id)}">${escapeHtml(stage.docLabel)} 등록</button>
          `).join("")}
        </div>
        ${!isPlanStage ? `
          <label class="gi-lead-field">
            <span>연계 정보분석계획</span>
            <select id="giLeadParentSelect">
              <option value="">(선택) 연결할 계획 문서</option>
              ${planLeads.map(lead => `<option value="${escapeHtml(lead.id)}">${escapeHtml(lead.title || lead.id)}</option>`).join("")}
            </select>
          </label>
        ` : ""}
      ` : ""}
      <label class="gi-lead-field">
        <span>제목</span>
        <input id="giLeadTitle" type="text" placeholder="예: ${escapeHtml(activeType.label)} — ${escapeHtml(aCase.targetName || "대상")} 관련">
      </label>
      <label class="gi-lead-field">
        <span>${escapeHtml(activeType.stages ? (isPlanStage ? "계획 개요" : "분석 결과 개요") : (activeType.docLabel || "내용"))}</span>
        <textarea id="giLeadContent" rows="4" placeholder="등록할 내용을 입력하세요. AI 초안 생성 시 이 내용이 근거로 사용됩니다."></textarea>
      </label>
      ${activeType.hasGrade ? `
        <label class="gi-lead-field gi-lead-field-inline">
          <span>신고 등급</span>
          <select id="giLeadGrade">
            <option value="A">A급 — 구체적 물증·즉시 착수</option>
            <option value="B" selected>B급 — 신빙성 있음·확인 필요</option>
            <option value="C">C급 — 첩보 수준·참고</option>
          </select>
        </label>
      ` : ""}
      <div class="gi-lead-form-actions">
        <button type="button" class="btn primary" data-gi-lead-add>단서 등록</button>
      </div>
    </div>
  `;
}

/* ── 선택 단서 문서 에디터 (AI 초안 생성 + 편집·확정) ───────────────── */
export function leadDraftEditorHtml(lead, streaming){
  const type = leadTypeById(lead.type);
  const docLabel = leadDocLabel(lead);
  const canDraft = leadSupportsAiDraft(lead);
  const draftValue = lead.draft || "";
  return `
    <div class="gi-lead-editor">
      <div class="gi-lead-editor-head">
        <strong>${type.icon} ${escapeHtml(docLabel)}</strong>
        ${lead.grade ? `<span class="gi-lead-grade ${GRADE_TONES[lead.grade] || ""}">${escapeHtml(lead.grade)}급</span>` : ""}
        ${lead.confirmed
          ? `<span class="gi-lead-state done">확정 ${escapeHtml(lead.confirmedAt || "")}</span>`
          : `<span class="gi-lead-state draft">작성중</span>`}
        <button type="button" class="btn secondary gi-lead-new-btn" data-gi-lead-select="">+ 새 단서 등록</button>
      </div>
      <div class="gi-lead-editor-src">
        <span>등록 내용</span>
        <p>${escapeHtml(lead.content || "(등록 내용 없음)")}</p>
      </div>
      ${canDraft ? `
        <div class="gi-lead-editor-actions">
          <button type="button" class="btn" data-gi-lead-draft="${escapeHtml(lead.id)}" ${streaming ? "disabled" : ""}>
            ${streaming ? "AI 초안 생성 중..." : (lead.aiDraft ? "AI 초안 재생성" : "AI 초안 생성")}
          </button>
          <span class="muted">등록 내용·혐의·기존 단서를 근거로 ${escapeHtml(docLabel)} 초안을 생성합니다.</span>
        </div>
        <div id="giLeadDraftStream" class="gi-lead-draft-stream" ${streaming ? "" : "hidden"}></div>
      ` : ""}
      <label class="gi-lead-field gi-lead-editor-doc">
        <span>${escapeHtml(docLabel)} 본문</span>
        <textarea id="giLeadDraftText" rows="10"
          placeholder="${canDraft ? "AI 초안 생성 버튼을 누르거나 직접 작성하세요." : "문서 내용을 작성하세요."}">${escapeHtml(draftValue)}</textarea>
      </label>
      <div class="gi-lead-form-actions">
        <button type="button" class="btn primary" data-gi-lead-confirm="${escapeHtml(lead.id)}">
          ${lead.confirmed ? "수정 내용 재확정" : "문서 확정"}
        </button>
      </div>
    </div>
  `;
}

/* ── AI 초안 프롬프트 (문서 유형별 서식 골격) ───────────────────────── */
const DOC_SECTIONS = {
  "정보입수보고서": ["개요", "입수 경위", "정보 내용", "신빙성 평가", "조치 의견"],
  "정보분석계획":   ["분석 목적", "분석 대상·범위", "분석 방법(활용 AI 분석서비스)", "추진 일정", "기대 산출물"],
  "정보분석보고":   ["분석 개요", "주요 분석 결과", "혐의 관련 판단", "후속 조치 건의"],
  "조사의뢰서":     ["의뢰 개요", "대상 인적사항", "혐의 사실", "의뢰 사항", "첨부 자료"],
};

export function buildLeadDraftPrompt(aCase, lead){
  const docLabel = leadDocLabel(lead);
  const sections = DOC_SECTIONS[docLabel] || ["개요", "내용", "조치 의견"];
  const crimeText = crimeSummary(aCase.crimes) || "혐의 미지정";
  const priorLeads = (aCase.leads || [])
    .filter(item => item.id !== lead.id && (item.confirmed || item.content))
    .slice(-3)
    .map(item => `- [${leadTypeById(item.type).label}] ${item.title || ""}: ${String(item.draft || item.content || "").slice(0, 300)}`)
    .join("\n");
  const parent = lead.parentLeadId ? (aCase.leads || []).find(item => item.id === lead.parentLeadId) : null;
  return `당신은 대한민국 관세청 조사국 수사관입니다. 아래 사건 정보를 바탕으로 공문서 형식의 "${docLabel}" 초안을 작성하십시오.

[사건 정보]
- 사건번호: ${aCase.caseId}
- 수사 대상: ${aCase.targetName} (${aCase.companyId || aCase.personId || "-"})
- 혐의: ${crimeText}

[등록된 근거 내용]
${lead.content || "(없음)"}
${parent ? `\n[연계 정보분석계획]\n${String(parent.draft || parent.content || "").slice(0, 500)}` : ""}
${priorLeads ? `\n[기존 수사단서 요약]\n${priorLeads}` : ""}

[작성 지침]
- 다음 섹션 구성을 따르십시오: ${sections.map(s => `[${s}]`).join(" ")}
- 등록된 근거 내용에 없는 사실을 지어내지 말고, 확인이 필요한 항목은 "확인 필요"로 표기하십시오.
- 간결한 공문서 문체(개조식)로 작성하십시오. 전체 분량은 500~900자.`;
}
