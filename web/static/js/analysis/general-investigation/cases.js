import { escapeHtml } from "../../core/dom.js";
import { generalInvestigationState } from "./state.js";

export function renderCasesPanel(deps){
  const all = deps.allGenInvCases();
  const q   = generalInvestigationState.genInvFilter.toLowerCase();
  const filtered = q ? all.filter(c =>
    c.targetName.toLowerCase().includes(q) ||
    c.caseId.toLowerCase().includes(q) ||
    deps.genInvTypeById(c.invTypeId).label.includes(q)
  ) : all;

  return `
    <div class="gi-cases-panel">
      <div class="gi-cases-toolbar">
        <input class="gi-search" id="giSearchInput" placeholder="수사대상, 사건번호, 수사유형 검색..."
          value="${escapeHtml(generalInvestigationState.genInvFilter)}">
        <button class="btn gi-reg-toggle-btn" data-gi-reg-toggle type="button">
          ${generalInvestigationState.showGenInvRegForm ? "✕ 닫기" : "+ 수사 등록"}
        </button>
      </div>

      ${generalInvestigationState.showGenInvRegForm ? generalInvRegForm(deps) : ""}

      <div class="gi-case-board">
        ${filtered.map(c => genInvCaseCard(deps, c)).join("") ||
          `<div class="empty-state">등록된 수사 대상이 없습니다. 수사 등록 버튼으로 추가하세요.</div>`}
      </div>

      <div class="overview-archive-section">
        <button class="overview-archive-toggle" data-gi-toggle-archive>
          완료건 확인 <strong>(${generalInvestigationState.archivedGenInvCases.length}건)</strong>
          <span>${generalInvestigationState.genInvArchiveOpen ? "▲" : "▼"}</span>
        </button>
        ${generalInvestigationState.genInvArchiveOpen ? `
          <div class="job-board archive-board" style="margin-top:12px">
            ${generalInvestigationState.archivedGenInvCases.map(c => {
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
      </div>
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
          <span class="job-status ${c.status.tone}">${c.status.label}</span>
          ${isDone ? `<button class="btn-inline-action" data-gi-archive-case="${escapeHtml(c.caseId)}" title="아카이브">아카이브</button>` : ""}
          <button class="btn-inline-action job-remove-action" data-gi-remove-case="${escapeHtml(c.caseId)}" title="삭제">삭제</button>
        </div>
      </div>
      <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
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
