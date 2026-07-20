import { escapeHtml } from "../../core/dom.js";
import { generalInvestigationState } from "./state.js";
import { CRIME_TAXONOMY, crimeCategoryById, crimeSummary, crimeAnalysisPlan } from "./crime-taxonomy.js";
import { leadTimelineHtml, leadRegisterFormHtml } from "./leads.js";

export function renderCasesPanel(deps){
  // 캔버스와 동일하게 로그인 사용자가 소유/담당한 수사만 표시 (관세조사와 동작 일치)
  const userId = deps.getCurrentUserId?.();
  const all = deps.allGenInvCases().filter(c =>
    c.ownerUserId === userId || (Array.isArray(c.assignees) && c.assignees.includes(userId)));
  const q   = generalInvestigationState.genInvFilter.toLowerCase();
  const filtered = q ? all.filter(c =>
    c.targetName.toLowerCase().includes(q) ||
    c.caseId.toLowerCase().includes(q) ||
    deps.genInvTypeById(c.invTypeId).label.includes(q)
  ) : all;

  // 상세 열림: 선택 카드는 보드에서 숨기고 상세 패널을 가장 위쪽에 표시
  const detailCase = generalInvestigationState.giCaseDetailOpen
    ? filtered.find(c => c.caseId === generalInvestigationState.activeGenInvCaseId)
    : null;
  const boardCases = detailCase ? filtered.filter(c => c !== detailCase) : filtered;

  return `
    <div class="gi-cases-panel">
      ${detailCase ? giCaseDetailHtml(deps, detailCase) : ""}

      <div class="gi-cases-toolbar">
        <input class="gi-search" id="giSearchInput" placeholder="수사대상, 사건번호, 수사유형 검색..."
          value="${escapeHtml(generalInvestigationState.genInvFilter)}">
        <button class="btn gi-reg-toggle-btn" data-gi-reg-toggle type="button">
          ${generalInvestigationState.showGenInvRegForm ? "✕ 닫기" : "+ 수사 등록"}
        </button>
      </div>

      ${generalInvestigationState.showGenInvRegForm ? generalInvRegForm(deps) : ""}

      <div class="gi-case-board">
        ${boardCases.map(c => genInvCaseCard(deps, c)).join("") ||
          (detailCase ? "" : `<div class="empty-state">등록된 수사 대상이 없습니다. 수사 등록 버튼으로 추가하세요.</div>`)}
      </div>

      ${(() => {
        const archivedForUser = generalInvestigationState.archivedGenInvCases.filter(c =>
          c.ownerUserId === userId || (Array.isArray(c.assignees) && c.assignees.includes(userId)) || (!c.ownerUserId && !c.assignees));
        return `
      <div class="overview-archive-section">
        <button class="overview-archive-toggle" data-gi-toggle-archive>
          완료건 확인 <strong>(${archivedForUser.length}건)</strong>
          <span>${generalInvestigationState.genInvArchiveOpen ? "▲" : "▼"}</span>
        </button>
        ${generalInvestigationState.genInvArchiveOpen ? `
          <div class="job-board archive-board" style="margin-top:12px">
            ${archivedForUser.map(c => {
              const type = deps.genInvTypeById(c.invTypeId);
              return `
                <article class="job-card archive-card" tabindex="0">
                  <div class="job-card-head">
                    <div>
                      <span class="gi-case-no">${escapeHtml(c.caseId)}</span>
                      <h3>${escapeHtml(c.targetName)}</h3>
                      <p class="muted">${escapeHtml(c.investigator)} · ${escapeHtml(c.team)} · ${escapeHtml(c.updated)}</p>
                    </div>
                    <div class="job-status-row">
                      <span class="job-status done">아카이브</span>
                      <button class="btn-inline-action" data-gi-restore-case="${escapeHtml(c.caseId)}">복원</button>
                    </div>
                  </div>
                  <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
                  <div class="archive-summary" style="margin-top:8px">
                    <span>${c.status.done}/${c.status.total} 단계 완료</span>
                    <strong>${c.status.pct}%</strong>
                  </div>
                </article>`;
            }).join("") || `<div class="empty-state">완료된 수사 결과가 없습니다.</div>`}
          </div>
        ` : ""}
      </div>`;
      })()}
    </div>
  `;
}

function genInvCaseCard(deps, c){
  const type     = deps.genInvTypeById(c.invTypeId);
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
          <button class="btn-inline-action gi-detail-open-btn" data-gi-detail-open="${escapeHtml(c.caseId)}" title="혐의·수사단서 상세">상세</button>
          <span class="job-status ${c.status.tone}">${c.status.label}</span>
          ${isDone ? `<button class="btn-inline-action" data-gi-archive-case="${escapeHtml(c.caseId)}" title="아카이브">아카이브</button>` : ""}
          <button class="btn-inline-action job-remove-action" data-gi-remove-case="${escapeHtml(c.caseId)}" title="삭제">삭제</button>
        </div>
      </div>
      <div class="gi-case-chip-row">
        <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
        ${(() => {
          const crime = crimeSummary(c.crimes);
          return crime
            ? `<span class="gi-crime-chip">${escapeHtml(crime)}</span>`
            : `<span class="gi-crime-chip empty">혐의 미지정</span>`;
        })()}
        ${(() => {
          const leads = c.leads || [];
          const confirmed = leads.filter(lead => lead.confirmed).length;
          return `<span class="gi-lead-chip">단서 ${leads.length}건 · 확정 ${confirmed}건</span>`;
        })()}
      </div>
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

/* ── 사건 상세 — 혐의 범죄 선택 + 수사단서 이력·등록 ─────────────────────
   수사는 Case별 상세가 중요: 대상 선택 후 단서 경로(6종)별 자료를 축적한다.
   혐의 등록 시 분석 시나리오가 매핑된다.
   문서(정보입수보고서 등) 본문 작성·확정은 '분석 보고서 및 검증' 탭이 담당한다 —
   여기서는 단서 등록과 이력 확인만 수행한다. */
function giCaseDetailHtml(deps, aCase){
  const state = generalInvestigationState;
  const type = deps.genInvTypeById(aCase.invTypeId);
  return `
    <div class="gi-case-detail">
      <div class="gi-case-detail-head">
        <div>
          <span class="gi-case-no">${escapeHtml(aCase.caseId)}</span>
          <h3>${escapeHtml(aCase.targetName)}</h3>
          <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
        </div>
        <div class="gi-case-detail-actions">
          <button type="button" class="btn secondary" data-gi-tab="profile">수사 프로파일</button>
          <button type="button" class="btn secondary" data-gi-tab="scenario">분석 시나리오</button>
          <button type="button" class="btn" data-gi-detail-close title="상세를 닫고 카드로 돌아갑니다">✕ 닫기</button>
        </div>
      </div>

      ${crimeSelectorHtml(aCase, state)}

      <div class="gi-case-detail-grid">
        <div class="gi-lead-col gi-lead-col-timeline">
          <h4>수사단서 이력 <span class="muted">(${(aCase.leads || []).length}건)</span></h4>
          ${leadTimelineHtml(aCase, state.activeLeadId)}
        </div>
        <div class="resize-gutter x" data-resize-min="260" title="드래그하여 좌·우 영역 크기 조절"></div>
        <div class="gi-lead-col gi-lead-col-editor">
          <h4>수사단서 등록</h4>
          ${leadRegisterFormHtml(aCase, state)}
        </div>
      </div>
    </div>
  `;
}

function crimeSelectorHtml(aCase, state){
  const confirmed = aCase.crimes && aCase.crimes.categoryId ? aCase.crimes : null;
  const draft = state.crimeDraft || confirmed || { categoryId: null, offenseIds: [] };
  const category = crimeCategoryById(draft.categoryId);
  return `
    <div class="gi-crime-selector">
      <div class="gi-crime-selector-head">
        <strong>혐의 범죄</strong>
        ${confirmed
          ? `<span class="gi-crime-chip">${escapeHtml(crimeSummary(confirmed))}</span>`
          : `<span class="gi-crime-chip empty">미지정 — 대분류와 죄명을 선택 후 등록하세요</span>`}
        <span class="muted">혐의 등록 시 관련 분석 시나리오(정보분석 워크스페이스)가 자동 구성됩니다.</span>
      </div>
      <div class="gi-crime-cats">
        ${CRIME_TAXONOMY.map(cat => `
          <button type="button" class="gi-crime-cat-btn${cat.id === draft.categoryId ? " active" : ""}"
            data-gi-crime-cat="${escapeHtml(cat.id)}">${cat.num} ${escapeHtml(cat.label)}</button>
        `).join("")}
      </div>
      ${category ? `
        <div class="gi-crime-offenses">
          ${category.offenses.map(offense => `
            <button type="button" class="gi-crime-offense-btn${(draft.offenseIds || []).includes(offense.id) ? " on" : ""}"
              data-gi-crime-offense="${escapeHtml(offense.id)}">${escapeHtml(offense.label)}</button>
          `).join("")}
          <button type="button" class="btn primary gi-crime-apply-btn" data-gi-crime-apply>혐의 등록</button>
        </div>
        ${(() => {
          // 선택 중인 죄명 기준 분석서비스 자동 구성 미리보기 (관점 매트릭스 기반)
          const plan = crimeAnalysisPlan(draft);
          return plan ? `
            <div class="gi-crime-plan-preview">
              <span class="gi-crime-plan-dims">분석 관점: ${escapeHtml(plan.dimSummary)}</span>
              <span class="gi-crime-plan-flow">자동 구성(${plan.keys.length}단계): ${escapeHtml(plan.labels.join(" → "))}</span>
            </div>
          ` : "";
        })()}
      ` : ""}
    </div>
  `;
}

function generalInvRegForm(deps){
  const isCo = generalInvestigationState.giRegTargetType === "company";
  if(!isCo && !deps.getRiskPersons().length && !deps.isRiskPersonsLoading()) deps.loadRiskPersons();

  const targetOptions = isCo
    ? `<option value="">-- 기업을 선택하세요 --</option>
       ${deps.getScenarioCompanies().map(c =>
         `<option value="${escapeHtml(c.company_id)}">${escapeHtml(c.company_name||c.company_id)} (${escapeHtml(c.company_id)})</option>`
       ).join("")}`
    : `<option value="">-- 우범자를 선택하세요 --</option>
       ${deps.isRiskPersonsLoading()
         ? `<option disabled>로딩 중...</option>`
         : deps.getRiskPersons().map(p =>
             `<option value="${escapeHtml(p.person_id)}">${escapeHtml(p.name)} (${escapeHtml(p.person_id)}) · ${escapeHtml(p.risk_level||"-")}</option>`
           ).join("")}`;

  return `
    <div class="gi-reg-form" style="padding:12px 16px">
      <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:nowrap">

        <!-- ① 수사대상 유형 -->
        <div style="flex:none">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사대상 유형 <span style="color:var(--red)">*</span></label>
          <div style="display:flex;gap:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;height:36px">
            <button type="button" data-gi-reg-type="company"
              style="padding:0 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;
                     background:${isCo?"#1e40af":"#fff"};color:${isCo?"#fff":"#41506a"}">기업</button>
            <button type="button" data-gi-reg-type="person"
              style="padding:0 14px;font-size:12px;font-weight:600;border:none;border-left:1px solid var(--line);cursor:pointer;
                     background:${!isCo?"#1e40af":"#fff"};color:${!isCo?"#fff":"#41506a"}">개인</button>
          </div>
        </div>

        <!-- ② 수사대상 선택 -->
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사대상 선택 <span style="color:var(--red)">*</span></label>
          <select id="giRegTargetSelect" class="gi-reg-select" style="width:100%;height:36px">
            ${targetOptions}
          </select>
        </div>

        <!-- ③ 수사 유형 선택 -->
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사 유형 선택 <span style="color:var(--red)">*</span></label>
          <select id="giRegTypeSelect" class="gi-reg-select" style="width:100%;height:36px">
            ${deps.GEN_INV_TYPES.map(t =>
              `<option value="${t.id}">${t.num} ${escapeHtml(t.label)}</option>`
            ).join("")}
          </select>
        </div>

        <!-- ④ 등록/취소 -->
        <button class="btn" type="button" data-gi-register style="height:36px;padding:0 20px;white-space:nowrap;flex:none">등록</button>
        <button class="btn secondary" type="button" data-gi-reg-toggle style="height:36px;padding:0 16px;white-space:nowrap;flex:none">취소</button>
      </div>
    </div>
  `;
}

export const casesSubtab = {
  id: "cases",
  label: "진행중인 수사",
  aiServices: [],
  render: renderCasesPanel,
};
