import { escapeHtml } from "../../core/dom.js";

export function renderProfilePanel(deps){
  const aCase = deps.activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const type = deps.genInvTypeById(aCase.invTypeId);
  if(aCase.targetType === "company"){
    const companyId = deps.generalInvCompanyId(aCase);
    if(!companyId){
      return `
        <div class="gi-stub-panel">
          <div class="gi-stub-head">
            <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
            <h3>${escapeHtml(aCase.targetName)} <span class="muted">${escapeHtml(aCase.caseId)}</span></h3>
          </div>
          <div class="profile-loading">연결된 기업 프로파일을 찾지 못했습니다. 수사 대상명을 기업 위험도 대시보드의 업체명과 맞춰 등록하세요.</div>
        </div>
      `;
    }
    return deps.canvasProfilePanel(companyId, {
      selectedLabel: "수사 대상 기업",
      archive: null,
      changed: false,
      reportAction: `<button class="btn secondary" data-gi-tab="report">분석 보고서 보기</button>`,
      scenarioAction: `<button class="btn" data-gi-tab="workbench">분석 시나리오 설정</button>`,
    });
  }
  const person = deps.riskPersonById(aCase.personId);
  return `
    <div class="gi-stub-panel">
      <div class="gi-stub-head">
        <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
        <h3>${escapeHtml(aCase.targetName)} <span class="muted">${escapeHtml(aCase.caseId)}</span></h3>
      </div>
      <div class="gi-stub-body">
        <div class="gi-stub-card">
          <strong>기본 인적사항</strong>
          <p class="muted">${person ? `${escapeHtml(person.person_id)} · ${escapeHtml(person.nationality || "-")} · ${escapeHtml(person.address_region || "-")}` : "성명, 생년월일, 국적, 주소권역, 연락처"}</p>
          <div class="gi-profile-mini">
            <span>유형 <b>${escapeHtml(person?.profile_type || aCase.personProfileType || "-")}</b></span>
            <span>위험등급 <b class="${(person?.risk_level || aCase.personRiskLevel) === "CRITICAL" || (person?.risk_level || aCase.personRiskLevel) === "HIGH" ? "high" : "mid-risk"}">${escapeHtml(person?.risk_level || aCase.personRiskLevel || "-")}</b></span>
            <span>위험점수 <b>${person?.risk_score != null ? Number(person.risk_score).toFixed(1) : aCase.personRiskScore ?? "-"}</b></span>
          </div>
        </div>
        <div class="gi-stub-card">
          <strong>수사 이력</strong>
          <p class="muted">과거 조사 이력, 적발 내역, 범칙금 부과 현황</p>
          <div class="gi-profile-mini">
            <span>상태 <b>${escapeHtml(person?.watch_status || "등록")}</b></span>
            <span>직업/활동 <b>${escapeHtml(person?.occupation || "-")}</b></span>
          </div>
        </div>
        <div class="gi-stub-card">
          <strong>연관 관계망</strong>
          <p class="muted">연관 법인·개인, 공급망 관계, 계좌 연결 현황</p>
          <div class="gi-profile-mini">
            <span>위험태그 <b>${escapeHtml(person?.risk_tags || aCase.personRiskTags || "-")}</b></span>
            <span>별칭 <b>${escapeHtml(person?.name_aliases || "-")}</b></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export const profileSubtab = {
  id: "profile",
  label: context => context.profileLabel,
  showWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
