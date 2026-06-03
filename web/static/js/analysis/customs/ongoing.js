import { escapeHtml } from "../../core/dom.js";
import { customsState } from "./state.js";

export function renderOngoingPanel(deps){
  const jobs     = deps.activeCanvasJobs().filter(j => deps.canvasJobCategory(j) === "관세조사 분석");
  const archived = deps.archivedCanvasJobs().filter(j => deps.canvasJobCategory(j) === "관세조사 분석");
  return `
    <div class="ci-ongoing">
      <div class="ci-ongoing-toolbar">
        <div>
          <strong>진행중인 관세조사</strong>
          <p class="muted">관세조사 분석 카테고리로 등록된 분석 작업 현황입니다.</p>
        </div>
        <button class="btn" data-inv-new-job type="button">
          ${customsState.showInvNewJobForm ? "✕ 취소" : "+ 신규 조사 등록"}
        </button>
      </div>

      ${customsState.showInvNewJobForm ? invNewJobForm(deps) : ""}

      <div class="job-board">
        ${jobs.map(job => ciOngoingJobCard(deps, job)).join("") ||
          `<div class="empty-state">진행 중인 관세조사 분석이 없습니다.<br><span class="muted">신규 조사 등록 버튼으로 분석 작업을 추가하세요.</span></div>`}
      </div>

      <div class="overview-archive-section">
        <button class="overview-archive-toggle" data-inv-toggle-archive>
          완료건 확인 <strong>(${archived.length}건)</strong>
          <span>${customsState.invArchiveOpen ? "▲" : "▼"}</span>
        </button>
        ${customsState.invArchiveOpen ? `
          <div class="job-board archive-board" style="margin-top:12px">
            ${archived.map(job => {
              const archive = deps.currentRunArchive(job.companyId);
              return `
                <article class="job-card archive-card" data-inv-company="${escapeHtml(job.companyId)}" data-inv-tab="report" tabindex="0" role="button">
                  <div class="job-card-head">
                    <div>
                      <h3>${job.title}</h3>
                      <p class="muted">${job.company} · ${archive?.savedAt || job.updated}</p>
                    </div>
                    <div class="job-status-row">
                      <span class="job-status done">아카이브</span>
                      <button class="btn-inline-action" data-inv-restore-job="${escapeHtml(job.companyId)}">복원</button>
                    </div>
                  </div>
                  <div class="archive-summary">
                    <span>저장 로그 ${archive ? Object.keys(archive.stepOutputs||{}).length : 0}건</span>
                    <strong>${job.status?.pct||100}%</strong>
                  </div>
                </article>`;
            }).join("") || `<div class="empty-state">완료된 조사 결과가 없습니다.</div>`}
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function ciOngoingJobCard(deps, job){
  const isDone = deps.isCompletedActiveJob(job);
  const total  = job.status.total ?? "?";
  const done   = job.status.done  ?? 0;
  return `
    <article class="job-card${job.companyId === deps.getActiveCanvasCompanyId() ? " active" : ""}${job.isNew ? " new" : ""}${job.scenarioChanged ? " changed" : ""}"
      data-inv-company="${escapeHtml(job.companyId)}" data-inv-tab="profile" tabindex="0" role="button">
      <div class="job-card-head">
        <div>
          <span class="canvas-category-chip">관세조사 분석</span>
          <h3>${escapeHtml(job.title)}</h3>
          <p class="muted">${escapeHtml(job.company)} · ${escapeHtml(job.owner)} · ${escapeHtml(job.updated)}</p>
        </div>
        <div class="job-status-row">
          <span class="job-status ${job.status.tone}">${job.status.label}</span>
          ${isDone ? `<button class="btn-inline-action" data-inv-archive-job="${escapeHtml(job.companyId)}">아카이브</button>` : ""}
          <button class="btn-inline-action job-remove-action" data-inv-remove-job="${escapeHtml(job.companyId)}">삭제</button>
        </div>
      </div>
      ${job.scenarioChanged ? `<div class="job-change-note">시나리오가 변경되어 재실행이 필요합니다.</div>` : ""}
      <div class="job-progress"><i style="width:${job.status.pct}%"></i></div>
      <div class="job-meta">
        <span>${done}/${total} 단계</span>
        <strong>${job.status.pct}%</strong>
      </div>
    </article>
  `;
}

function invNewJobForm(deps){
  if(!deps.getScenarioCompanies().length) deps.loadScenarioCompanies();
  const companies = deps.getScenarioCompanies();
  return `
    <div class="gi-reg-form" style="padding:12px 16px">
      <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:nowrap">
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">조사 대상 업체 <span style="color:var(--red)">*</span></label>
          <select id="invNewJobCompany" class="gi-reg-select" style="width:100%;height:36px">
            <option value="">-- 업체를 선택하세요 --</option>
            ${companies.map(c =>
              `<option value="${escapeHtml(c.company_id)}">${escapeHtml(c.company_name||c.company_id)} (${escapeHtml(c.company_id)})</option>`
            ).join("")}
          </select>
        </div>
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">분석 시나리오 템플릿 <span style="color:var(--red)">*</span></label>
          <select id="invNewJobTemplate" class="gi-reg-select" style="width:100%;height:36px">
            ${deps.scenarioTemplateOptionsHtml()}
          </select>
        </div>
        <button class="btn" type="button" data-inv-submit style="height:36px;padding:0 20px;white-space:nowrap;flex:none">등록</button>
        <button class="btn secondary" type="button" data-inv-new-job style="height:36px;padding:0 16px;white-space:nowrap;flex:none">취소</button>
      </div>
    </div>
  `;
}

export const ongoingSubtab = {
  id: "ongoing",
  label: "진행중인 관세조사",
  group: "work",
  aiServices: [],
  render: renderOngoingPanel,
};
