import { dataTable, escapeHtml } from "../../core/dom.js";
import { profileNetworkLayout, graphDomainForPage } from "../shared/network-graph.js";

export function renderProfilePanel(deps, context){
  const ctx = deps.drugCaseContext();
  if(!ctx) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const aCase = deps.activeDrugCase();
  // 수사영역(마약 lawsearch=drug / 외환 fxsearch=forex)별 관계망 도메인 필터
  const domain = graphDomainForPage(context?.pageKey);
  // 좌측 위험내역 대시보드 + 우측 Neo4j 관계망 그래프 (60:40)
  if(ctx.targetType === "company"){
    const companyId = aCase?.companyId || "";
    // 특별수사(마약 drug·외환 forex): 조직 중심 관계망(연계 인물·역할) 그래프로 — 위계/자금·공급 전용 뷰 제공.
    // 그 외는 기존 기업 수입신고 관계망 유지.
    if(domain === "drug" || domain === "forex"){
      const orgId = aCase?.drugOrgId || companyId;
      return profileNetworkLayout(drugCompanyProfilePanel(deps), "org", orgId, undefined, domain);
    }
    return profileNetworkLayout(drugCompanyProfilePanel(deps), "company", companyId, undefined, domain);
  }
  const personId = deps.riskPersonById?.(aCase?.personId)?.person_id || aCase?.personId || "";
  return profileNetworkLayout(drugPersonProfilePanel(deps), "person", personId, undefined, domain);
}

function drugRiskScoreClass(score){
  const value = Number(score || 0);
  if(value >= 85) return "high";
  if(value >= 65) return "mid";
  return "low";
}

function drugRiskLevelLabel(level){
  const key = String(level || "").toUpperCase();
  if(key === "CRITICAL") return "긴급";
  if(key === "HIGH") return "고위험";
  if(key === "MEDIUM") return "중위험";
  if(key === "LOW") return "저위험";
  return level || "미분류";
}

function drugMetricCards(metrics){
  return `
    <div class="drug-profile-metrics">
      ${metrics.map(m => `
        <div class="drug-profile-metric ${escapeHtml(m.tone || "")}">
          <span>${escapeHtml(m.label)}</span>
          <strong>${escapeHtml(String(m.value))}</strong>
          <p>${escapeHtml(m.desc || "")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

/* 근거기반 위험지표(indicators) → 상단 요약 카드.
   지표 이름·점수·근거 첫 줄로 카드를 구성한다(하드코딩 고정값 대체).
   overallLabel/overallValue: 종합 위험 카드 1장을 맨 앞에 고정 표시. */
function metricsFromIndicators(indicators, overall){
  const tone = s => (s >= 60 ? "high" : s >= 30 ? "mid" : "low");
  const cards = (indicators || []).slice(0, 5).map(row => {
    const s = Number(row.score || 0);
    const desc = String(row.reason || "").split("\n").map(t => t.replace(/^[-\s]+/, "").trim()).filter(Boolean)[0] || "";
    return { label: row.indicator_name || row.indicator_code, value: `${Math.round(s)}`, desc, tone: tone(s) };
  });
  return overall ? [overall, ...cards] : cards;
}

/* 조직 프로파일 도메인 문구(마약 drug / 외환 forex) — 지표 카드·바는 데이터 기반이므로
   여기서는 헤딩·태그·확인 포인트 등 서술 문구만 도메인에 맞게 전환한다. */
function specialOrgWording(isForex){
  if(isForex){
    return {
      scoreLabel: "외환위험 종합점수", scoreDesc: "송금·환치기·역외·자산 흐름 통합",
      tagsLabel: "외환위험 태그", tagsFallback: "환치기, 재산 국외도피, 역외 페이퍼, 차명 분산송금",
      linkedGroupTags: "명의대여 법인, 환치기 채널, 차명계좌, 역외 페이퍼컴퍼니",
      profileHead: "기업 외환 프로파일", companyTypeLabel: "외환·송금 관련 기업",
      memberRoles: "명 (총책·자금책·환치기책 등)",
      focus: "실소유주 확인, 가장무역대금 위장, 환치기 채널, 역외 페이퍼컴퍼니 연계",
      pointsHead: "외환수사 중심 확인 포인트",
      points: [
        ["가장무역대금 위장", "용역·무역대금 명목 비정상 송금"],
        ["환치기·무등록 송금", "조직적 불법(무등록) 송금 채널 이용"],
        ["재산 국외도피", "허위 자본거래로 자산 국외 이전"],
        ["역외·차명 분산", "페이퍼컴퍼니·차명계좌 구조화 거래"],
      ],
      shellTitle: "외환프로파일",
      shellSub: "선택한 기업의 환치기·재산도피·역외 위험을 조직 단위로 재구성한 프로파일입니다.",
    };
  }
  return {
    scoreLabel: "마약위험 종합점수", scoreDesc: "화물·거래·경로·관계망 통합",
    tagsLabel: "마약위험 태그", tagsFallback: "마약 전구물질, 위장수입, 국제특송 반복, 고위험국 경유",
    linkedGroupTags: "명의대여 법인, 특송업체 반복 이용, 위장 수입자, 분산 배송",
    profileHead: "기업 마약 프로파일", companyTypeLabel: "수입·물류 관련 기업",
    memberRoles: "명 (총책·자금책·운반책 등)",
    focus: "실화주 확인, 전구물질 품명 위장, 특송 분산 반입, 해외 공급자 연계",
    pointsHead: "마약수사 중심 확인 포인트",
    points: [
      ["전구물질 품명 위장", "화학품·전자부품·건강식품 명목 반입"],
      ["반복 소량 배송", "통관 회피 목적의 물량 분산 의심"],
      ["고위험국 경유", "마약류 생산·환적 국가 이동 경로 포함"],
      ["실화주 불명확", "수입자·수취인·대금지급자 불일치"],
    ],
    shellTitle: "마약프로파일",
    shellSub: "선택한 기업의 마약류·전구물질·위장수입 위험을 조직 단위로 재구성한 프로파일입니다.",
  };
}

function drugProfileShell(title, subtitle, badge, body){
  return `
    <div class="drug-profile-wrap">
      <div class="drug-profile-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <span class="gi-type-chip gi-t2">${escapeHtml(badge)}</span>
      </div>
      ${body}
    </div>
  `;
}

function drugCompanyProfilePanel(deps){
  const aCase = deps.activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  if(!deps.getScenarioCompanies().length) deps.loadScenarioCompanies();

  const isForex = deps.getCurrentPage?.() === "fxsearch";
  const W = specialOrgWording(isForex);
  const isCompany = aCase.targetType === "company";
  const company = isCompany
    ? (deps.findCompanyById(aCase.companyId) || deps.getScenarioCompanies().find(c => c.company_id === aCase.companyId))
    : null;
  const name = isCompany ? (company?.company_name || aCase.targetName) : "관련 기업군";
  const orgId = isCompany ? (aCase.drugOrgId || aCase.companyId || "") : "";
  const id = orgId || "PERSON-LINKED-ORG";
  const baseScore = isCompany
    ? Math.max(72, Math.round(company?.risk_score || 82))
    : 89;
  const riskTags = isCompany
    ? (company?.crime_types || W.tagsFallback)
    : W.linkedGroupTags;
  // 조직 관리지표(risk-org-profile) 로드 — 근거기반 6종. 상단 카드·지표바에 재사용.
  if(orgId && !deps.getRiskOrgProfile?.(orgId) && !deps.isRiskOrgProfileLoading?.(orgId)){
    deps.loadRiskOrgProfile?.(orgId);
  }
  const orgDetail = orgId ? deps.getRiskOrgProfile?.(orgId) : null;
  const orgIndicators = orgDetail?.indicators || [];
  const metrics = orgIndicators.length
    ? metricsFromIndicators(orgIndicators, {
        label: W.scoreLabel, value: `${baseScore}`, desc: W.scoreDesc, tone: drugRiskScoreClass(baseScore) })
    : [{ label:W.scoreLabel, value:`${baseScore}`, desc: deps.isRiskOrgProfileLoading?.(orgId) ? "조직 지표 불러오는 중…" : W.scoreDesc, tone:drugRiskScoreClass(baseScore) }];
  // 연계 인물(관계망) — API members(근거) 우선, 없으면 대체 안내
  const members = orgDetail?.members || [];
  const relatedRows = members.length
    ? members.slice(0, 12).map(m => [
        m.person_name || m.person_id || "-",
        m.relation_type || "관계 미상",
        m.person_id || "-",
        m.person_risk_score != null && Number(m.person_risk_score) > 0 ? Number(m.person_risk_score).toFixed(0) : "-",
      ])
    : [];
  const body = `
    ${drugMetricCards(metrics)}
    <div class="drug-profile-grid">
      <section class="drug-profile-panel">
        <h4>${escapeHtml(W.profileHead)}</h4>
        <dl class="drug-profile-defs">
          <dt>대상</dt><dd>${escapeHtml(name)} (${escapeHtml(id)})</dd>
          <dt>유형</dt><dd>${isCompany ? W.companyTypeLabel : "개인 수사대상 연계 기업군"}</dd>
          <dt>감시상태</dt><dd>${isCompany ? "검사지시/분석중" : "관계망 추적"}</dd>
          <dt>${escapeHtml(W.tagsLabel)}</dt><dd>${escapeHtml(riskTags)}</dd>
          <dt>연계 인물</dt><dd>${members.length ? `${members.length}${W.memberRoles}` : "관계망 추적중"}</dd>
          <dt>중점 확인</dt><dd>${escapeHtml(W.focus)}</dd>
        </dl>
      </section>
      <section class="drug-profile-panel">
        <h4>조직 위험지표 (근거 기반)</h4>
        ${orgIndicators.length ? `<div class="risk-bars">
          ${orgIndicators.map(row => {
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
          }).join("")}
        </div>`
        : `<p class="muted">${deps.isRiskOrgProfileLoading?.(orgId) ? "조직 위험지표 불러오는 중…" : "산출된 조직 위험지표가 없습니다."}</p>`}
      </section>
    </div>
    <div class="drug-profile-grid">
      <section class="drug-profile-panel">
        <h4>연계 인물/조직 (관계망)</h4>
        ${relatedRows.length
          ? dataTable(["대상","관계","식별자","개인위험"], relatedRows)
          : `<p class="muted">${deps.isRiskOrgProfileLoading?.(orgId) ? "관계망 불러오는 중…" : "연계 인물 데이터가 없습니다."}</p>`}
      </section>
      <section class="drug-profile-panel">
        <h4>${escapeHtml(W.pointsHead)}</h4>
        <ul class="drug-risk-list">
          ${W.points.map(p => `<li><strong>${escapeHtml(p[0])}</strong><span>${escapeHtml(p[1])}</span></li>`).join("")}
        </ul>
      </section>
    </div>
  `;
  return drugProfileShell(W.shellTitle, W.shellSub, `${aCase.caseId} · 기업 · ${deps.drugInvTypeById(aCase.invTypeId).label}`, body);
}

function drugPersonProfilePanel(deps){
  const aCase = deps.activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  if(!deps.getRiskPersons().length && !deps.isRiskPersonsLoading()) deps.loadRiskPersons();

  const person = aCase.targetType === "person"
    ? (deps.riskPersonById(aCase.personId) || null)
    : null;
  const name = aCase.targetType === "person" ? aCase.targetName : (person?.name || "연계 우범자군");
  const personId = person?.person_id || aCase.personId || "PERSON-LINKED-RISK";
  const score = Math.round(Number(person?.risk_score || (aCase.targetType === "person" ? 82 : 76)));
  const level = drugRiskLevelLabel(person?.risk_level || (score >= 85 ? "CRITICAL" : score >= 70 ? "HIGH" : "MEDIUM"));
  const isForex = deps.getCurrentPage?.() === "fxsearch";
  const P = specialPersonWording(isForex);
  const tags = person?.risk_tags || P.tagsFallback;
  // 실제 우범자 프로파일(근거 기반 위험지표) 로드
  if(personId && !deps.getRiskPersonProfile?.(personId) && !deps.isRiskPersonProfileLoading?.(personId)) {
    deps.loadRiskPersonProfile?.(personId);
  }
  const detail = deps.getRiskPersonProfile?.(personId);
  const realIndicators = detail?.indicators || [];
  // 상단 카드 = 종합 위험 1장 + 근거기반 도메인 지표 상위 5종(하드코딩 고정값 대체)
  const metrics = realIndicators.length
    ? metricsFromIndicators(realIndicators, {
        label: P.scoreLabel, value: `${score}`, desc: "개인 프로파일·사건·관계망 통합", tone: drugRiskScoreClass(score) })
    : [{ label:P.scoreLabel, value:`${score}`, desc:"위험지표 불러오는 중…", tone:drugRiskScoreClass(score) }];
  const incidentRows = P.incidents;
  const body = `
    ${drugMetricCards(metrics)}
    <div class="drug-profile-grid">
      <section class="drug-profile-panel">
        <h4>${escapeHtml(P.profileHead)}</h4>
        <dl class="drug-profile-defs">
          <dt>대상</dt><dd>${escapeHtml(name)} (${escapeHtml(personId)})</dd>
          <dt>유형</dt><dd>${escapeHtml(person?.profile_type || P.personTypeFallback)}</dd>
          <dt>국적/권역</dt><dd>${escapeHtml(person?.nationality || aCase.nationality || "미상")} / ${escapeHtml(person?.address_region || "추적중")}</dd>
          <dt>위험등급</dt><dd>${escapeHtml(level)} · ${score}점</dd>
          <dt>${escapeHtml(P.tagsLabel)}</dt><dd>${escapeHtml(tags)}</dd>
          <dt>감시상태</dt><dd>${escapeHtml(person?.watch_status || "추적중")}</dd>
        </dl>
      </section>
      <section class="drug-profile-panel">
        <h4>${escapeHtml(P.pointsHead)}</h4>
        <ul class="drug-risk-list">
          ${P.points.map(p => `<li><strong>${escapeHtml(p[0])}</strong><span>${escapeHtml(p[1])}</span></li>`).join("")}
        </ul>
      </section>
    </div>
    <div class="drug-profile-grid">
      <section class="drug-profile-panel">
        <h4>개인 위험지표 (근거 기반)</h4>
        ${realIndicators.length ? `<div class="risk-bars">
          ${realIndicators.map(row => {
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
          }).join("")}
        </div>`
        : `<p class="muted">${deps.isRiskPersonProfileLoading?.(personId) ? "위험지표 불러오는 중…" : "산출된 위험지표가 없습니다."}</p>`}
      </section>
      <section class="drug-profile-panel">
        <h4>관련 사건 이력</h4>
        ${dataTable(["사건번호","유형","품목/단서","채널","역할","증거수준"], incidentRows)}
      </section>
    </div>
  `;
  return drugProfileShell(P.shellTitle, P.shellSub, `${aCase.caseId} · 우범자 · ${deps.drugInvTypeById(aCase.invTypeId).label}`, body);
}

/* 우범자 프로파일 도메인 문구(마약 drug / 외환 forex). 지표 카드·바는 데이터 기반. */
function specialPersonWording(isForex){
  if(isForex){
    return {
      scoreLabel: "우범자 외환위험", tagsLabel: "외환위험 태그",
      tagsFallback: "환치기, 재산 국외도피, 분산송금, 고위험국 이동",
      profileHead: "우범자 외환 프로파일", personTypeFallback: "외환수사 연계 우범자",
      pointsHead: "외환수사 중심 확인 포인트",
      points: [
        ["송금·자금 경로", "가장무역대금·용역대금 위장 송금 패턴"],
        ["환치기·역할", "환치기책·송금책·자금책·차명계좌주 여부"],
        ["역외·차명", "역외 페이퍼컴퍼니·차명계좌 연계"],
        ["자산 이동", "가상자산·현금화·재산 국외도피 연결"],
      ],
      incidents: [
        ["FX-2026-0001", "환치기", "무등록 송금", "대포통장/차명계좌", "환치기책", "강함"],
        ["FX-2026-0001-02", "재산도피", "가장 무역대금", "해외 법인계좌", "자금책", "중간"],
        ["FX-2026-VA-05", "가상자산 이전", "코인 환전", "거래소/지갑", "송금책 의심", "중간"],
      ],
      shellTitle: "외환프로파일",
      shellSub: "선택한 우범자의 송금·환치기·역외·자산 단서를 외환수사 지표 중심으로 재구성한 프로파일입니다.",
    };
  }
  return {
    scoreLabel: "우범자 마약위험", tagsLabel: "마약위험 태그",
    tagsFallback: "마약류, 필로폰, 고위험국 이동, 분산송금",
    profileHead: "우범자 마약 프로파일", personTypeFallback: "마약수사 연계 우범자",
    pointsHead: "마약수사 중심 확인 포인트",
    points: [
      ["입국/배송 경로", "고위험국 출발·경유·도착 패턴"],
      ["수취·연락 역할", "반복 수취인, 연락책, 운반책 여부"],
      ["디지털 단서", "은어, 메신저 주문, SNS 채널 참여"],
      ["자금 흐름", "분산송금, 현금화, 해외송금 연결"],
    ],
    incidents: [
      ["RS-2026-0001", "밀수입", "필로폰", "공항 여행자", "연락책", "강함"],
      ["RS-2026-0001-02", "밀반출", "위조상품", "국제우편", "연락책", "중간"],
      ["RS-2026-DRG-07", "마약 자금세탁", "분산송금", "ATM/해외송금", "자금책 의심", "중간"],
    ],
    shellTitle: "마약프로파일",
    shellSub: "선택한 우범자의 이동·관계망·디지털·자금 단서를 마약수사 지표 중심으로 재구성한 프로파일입니다.",
  };
}

// 마약/외환 프로파일 탭 명칭: 런타임은 대상(기업/개인)별로 재정의하고,
// 대상 미선택(또는 관리자 화면)에서는 조사영역 대표 명칭(config.profileTab)을 사용한다.
function specialProfileTabLabel(context){
  const domainWord = context.pageKey === "fxsearch" ? "외환" : "마약";
  const targetType = context.case?.targetType;
  if(targetType === "company") return `기업 ${domainWord}프로파일`;
  if(targetType === "person") return `개인 ${domainWord}프로파일`;
  return context.config?.profileTab || `${domainWord}프로파일`;
}

export const profileSubtab = {
  id: "profile",
  label: specialProfileTabLabel,
  enabledWhen: context => !!context.case,
  aiServices: ["db_cdw", "company"],
  render: renderProfilePanel,
};
