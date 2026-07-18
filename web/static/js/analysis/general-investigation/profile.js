import { escapeHtml } from "../../core/dom.js";
import { profileNetworkLayout } from "../shared/network-graph.js";
import { crimeCategoryById, crimeOffenseById, CRIME_PROFILE_EMPHASIS, profileGraphTypeForCrimes } from "./crime-taxonomy.js";
import { indicatorSetForCase } from "../shared/risk-indicator-sets.js";

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
          <div class="risk-bars">
          ${indicators.map(row => {
            const pct = row.score != null ? Math.min(100, Number(row.score)) : 0;
            const tone = pct >= 60 ? "high" : pct >= 30 ? "mid" : "low";
            const bullets = String(row.reason || "")
              .split("\n").map(s => s.replace(/^[-\s]+/, "").trim()).filter(Boolean);
            const reasonHtml = bullets.length
              ? `<ul class="risk-reason">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : "";
            const recoHtml = (pct >= 60 && row.recommendation)
              ? `<p class="risk-reco">📌 ${escapeHtml(row.recommendation)}</p>` : "";
            return `
              <div class="risk-bar-row">
                <span>${escapeHtml(row.indicator_name || row.indicator_code)}</span>
                <div class="risk-bar-track"><i class="${tone}" style="width:${pct}%"></i></div>
                <strong class="${tone === "high" ? "high" : tone === "mid" ? "mid-risk" : "good"}">${row.score != null ? Number(row.score).toFixed(0) : "-"}%</strong>
              </div>${reasonHtml}${recoHtml}`;
          }).join("") || '<p class="muted">산출된 위험지표가 없습니다.</p>'}
          </div>
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

/* ── 혐의 뱃지 스트립 — 혐의 범죄 내용에 따라 프로파일에서 중점 볼 지표 안내 ── */
function crimeBadgeStripHtml(aCase){
  const crimes = aCase.crimes;
  if(!crimes?.categoryId){
    return `
      <div class="gi-profile-crime-strip empty">
        <span class="gi-crime-chip empty">혐의 미지정</span>
        <span class="muted">혐의를 지정하면 관련 지표가 강조됩니다.</span>
        <button type="button" class="btn secondary" data-gi-tab="cases">진행중인 수사에서 혐의 지정</button>
      </div>
    `;
  }
  const category = crimeCategoryById(crimes.categoryId);
  const offenses = (crimes.offenseIds || []).map(id => crimeOffenseById(id)).filter(Boolean);
  const emphasis = CRIME_PROFILE_EMPHASIS[crimes.categoryId] || [];
  return `
    <div class="gi-profile-crime-strip">
      <span class="gi-crime-chip">${escapeHtml(category?.label || "")}</span>
      ${offenses.map(offense => `<span class="gi-crime-offense-chip">${escapeHtml(offense.label)}</span>`).join("")}
      ${emphasis.length ? `<span class="gi-profile-emphasis">중점 확인: ${emphasis.map(tag => `<b>${escapeHtml(tag)}</b>`).join(" · ")}</span>` : ""}
    </div>
  `;
}

export function renderProfilePanel(deps){
  const aCase = deps.activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const type = deps.genInvTypeById(aCase.invTypeId);
  const crimeStrip = crimeBadgeStripHtml(aCase);
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
    // 수사 기업 대상: 혐의 뱃지 + 좌측 대시보드/우측 관계망(60:40) — 프로파일이 전체 화면 사용
    // (외부 정보 수집·정리 섹션은 기초자료 수집/등록 탭으로 이동)
    // 프로파일 그래프는 죄명 기준으로 공유/분리: 관세포탈(c1)은 관세조사와 공용 스코프,
    // 그 외 죄명은 crime-{categoryId} 스코프로 분리(profileGraphTypeForCrimes 참조)
    // 위험지표도 죄명 기준으로 세트 전환: 밀수·금지품(c2·c4·c7)은 밀수 6종, 그 외는 심사 6종
    return crimeStrip + profileNetworkLayout(
      deps.canvasProfilePanel(companyId, {
        selectedLabel: "수사 대상 기업",
        archive: null,
        changed: false,
        indicatorSet: indicatorSetForCase(aCase.crimes),
        reportAction: `<button class="btn secondary" data-gi-tab="report">분석 보고서 보기</button>`,
        scenarioAction: `<button class="btn" data-gi-tab="scenario">분석 시나리오 설정</button>`,
      }),
      profileGraphTypeForCrimes(aCase.crimes?.categoryId), companyId,
    );
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
  // 우범자 프로파일: 혐의 뱃지 + 좌측 위험내역/우측 관계망(60:40) — 프로파일이 전체 화면 사용
  // 기업과 동일하게 죄명 기준으로 그래프 스코프 분리(관세포탈 외 죄명은 각자 프로파일)
  return crimeStrip + profileNetworkLayout(
    renderPersonFullProfile(aCase, person, detail, type),
    profileGraphTypeForCrimes(aCase.crimes?.categoryId, "person"), personId, undefined, "general",
  );
}

export const profileSubtab = {
  id: "profile",
  label: context => context.profileLabel,
  enabledWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
