import { escapeHtml } from "../../core/dom.js";

function riskTone(score){
  const value = Number(score || 0);
  if(value >= 85) return "high";
  if(value >= 70) return "mid";
  return "low";
}

function fmt(value, fallback = "-"){
  if(value === null || value === undefined || value === "") return fallback;
  if(typeof value === "number") return Number.isFinite(value) ? value.toFixed(value % 1 ? 1 : 0) : fallback;
  return String(value);
}

function smallTable(headers, rows, emptyText = "등록된 데이터가 없습니다."){
  if(!rows.length) return `<div class="profile-loading" style="padding:18px">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="person-profile-table-wrap">
      <table class="person-profile-table">
        <thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(fmt(cell))}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function metricCards(items){
  return `
    <div class="person-profile-metrics">
      ${items.map(item => `
        <div class="person-profile-metric ${item.tone || ""}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(fmt(item.value))}</strong>
          <p>${escapeHtml(item.desc || "")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPersonFullProfile(aCase, person, detail, type){
  const profile = detail.profile || person || {};
  const summary = detail.summary || {};
  const indicators = detail.indicators || [];
  const cases = detail.cases || [];
  const roles = detail.roles || [];
  const network = detail.network || [];
  const orgs = detail.orgs || [];
  const evidence = detail.evidence || [];
  const analysis = detail.analysis || [];
  const score = Number(profile.risk_score || person?.risk_score || 0);
  const topCases = cases.slice(0, 8).map(row => [
    row.case_no || row.case_id,
    row.case_type,
    row.contraband_category,
    row.detection_channel,
    row.role_in_case,
    row.evidence_level,
  ]);
  const relationRows = network.slice(0, 10).map(row => [
    `${row.source_type}:${row.source_id}`,
    row.relation_type,
    `${row.target_type}:${row.target_id}`,
    row.weight,
    row.confidence_score,
  ]);
  return `
    <div class="person-profile-full">
      <div class="person-profile-head">
        <div>
          <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
          <h3>${escapeHtml(profile.name || aCase.targetName)} <span>${escapeHtml(profile.person_id || aCase.personId || "")}</span></h3>
          <p>${escapeHtml(profile.profile_type || "-")} · ${escapeHtml(profile.nationality || "-")} · ${escapeHtml(profile.address_region || "-")} · ${escapeHtml(profile.watch_status || "관찰중")}</p>
        </div>
        <div class="person-risk-badge ${riskTone(score)}">
          <span>종합 위험점수</span>
          <strong>${score ? score.toFixed(1) : "-"}</strong>
          <em>${escapeHtml(profile.risk_level || "-")}</em>
        </div>
      </div>

      ${metricCards([
        { label:"관련 사건", value:summary.case_count || cases.length, desc:"개인-사건 역할 연결", tone:"mid" },
        { label:"위험지표", value:summary.indicator_count || indicators.length, desc:summary.top_indicator || "개인 위험 스코어 입력", tone:riskTone(score) },
        { label:"관계망 엣지", value:summary.network_edge_count || network.length, desc:`고위험 관계 ${summary.high_risk_relation_count || 0}건`, tone:"high" },
        { label:"연결 조직", value:summary.org_count || orgs.length, desc:"법인·비공식조직·해외업체", tone:"mid" },
        { label:"증거자료", value:summary.evidence_count || evidence.length, desc:"첩보/수사/압수자료", tone:"low" },
        { label:"AI 분석", value:summary.analysis_count || analysis.length, desc:"프로파일링·수사이력 분석", tone:"low" },
      ])}

      <div class="person-profile-grid">
        <section class="person-profile-panel">
          <h4>기본 프로파일</h4>
          <dl class="person-profile-defs">
            <dt>성명/별칭</dt><dd>${escapeHtml(profile.name || "-")} / ${escapeHtml(profile.name_aliases || "-")}</dd>
            <dt>생년월일/성별</dt><dd>${escapeHtml(fmt(profile.birth_date))} / ${escapeHtml(profile.gender || "-")}</dd>
            <dt>식별문서</dt><dd>${escapeHtml(profile.id_doc_type || "-")} · hash 관리</dd>
            <dt>직업/활동</dt><dd>${escapeHtml(profile.occupation || "-")}</dd>
            <dt>주요 위험태그</dt><dd>${escapeHtml(profile.risk_tags || "-")}</dd>
          </dl>
        </section>
        <section class="person-profile-panel">
          <h4>역할별 관계 요약</h4>
          ${smallTable(["역할", "사건수", "평균신뢰도", "최고증거"], roles.slice(0, 8).map(row => [
            row.role,
            row.case_count,
            row.avg_confidence != null ? Number(row.avg_confidence).toFixed(2) : "-",
            row.top_evidence_level,
          ]), "역할별 사건 연결이 없습니다.")}
        </section>
      </div>

      <div class="person-profile-grid">
        <section class="person-profile-panel">
          <h4>개인 위험지표</h4>
          ${smallTable(["코드", "지표명", "값", "점수", "가중치"], indicators.slice(0, 8).map(row => [
            row.indicator_code,
            row.indicator_name,
            row.indicator_value,
            row.score,
            row.weight,
          ]))}
        </section>
        <section class="person-profile-panel">
          <h4>관련 사건 이력</h4>
          ${smallTable(["사건번호", "유형", "품목", "채널", "역할", "증거"], topCases)}
        </section>
      </div>

      <div class="person-profile-grid">
        <section class="person-profile-panel">
          <h4>관계망 연결</h4>
          ${smallTable(["출발", "관계", "대상", "가중치", "신뢰도"], relationRows)}
        </section>
        <section class="person-profile-panel">
          <h4>연결 조직/법인</h4>
          ${smallTable(["조직", "유형", "국가", "위험점수", "상태"], orgs.slice(0, 8).map(row => [
            row.org_name || row.org_id,
            row.org_type,
            row.country,
            row.risk_score,
            row.watch_status,
          ]), "연결 조직 정보가 없습니다.")}
        </section>
      </div>

      <div class="person-profile-grid">
        <section class="person-profile-panel">
          <h4>증거자료</h4>
          ${smallTable(["자료명", "유형", "기관", "등급", "신뢰도"], evidence.slice(0, 8).map(row => [
            row.source_title,
            row.source_type,
            row.source_agency,
            row.classification_level,
            row.reliability_score,
          ]))}
        </section>
        <section class="person-profile-panel">
          <h4>AI 분석 이력</h4>
          ${smallTable(["유형", "AI 서비스", "변경전", "변경후", "검토"], analysis.slice(0, 8).map(row => [
            row.analysis_type,
            row.model_or_agent,
            row.risk_score_before,
            row.risk_score_after,
            row.review_status,
          ]))}
        </section>
      </div>
    </div>
  `;
}

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
  const personId = person?.person_id || aCase.personId;
  if(!personId){
    return `<div class="profile-loading">연결된 우범자 프로파일 ID가 없습니다. 사건 등록 시 우범자를 선택해 주세요.</div>`;
  }
  const detail = deps.getRiskPersonProfile?.(personId);
  if(!detail){
    deps.loadRiskPersonProfile?.(personId);
    return `<div class="profile-loading">우범자 통합 프로파일 로딩 중...</div>`;
  }
  return renderPersonFullProfile(aCase, person, detail, type);
}

export const profileSubtab = {
  id: "profile",
  label: context => context.profileLabel,
  showWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
