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
    // 기업 마약/외환 프로파일의 관계분석은 관세 수입신고 허브(company_profile)가 아니라
    // 우범조직(risk Organization) ego 네트워크를 사용한다. 대상 조직은 사건의 drugOrgId.
    const orgId = aCase?.drugOrgId || aCase?.companyId || "";
    return profileNetworkLayout(drugCompanyProfilePanel(deps), "org", orgId, undefined, domain);
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

  const isCompany = aCase.targetType === "company";
  const company = isCompany
    ? (deps.findCompanyById(aCase.companyId) || deps.getScenarioCompanies().find(c => c.company_id === aCase.companyId))
    : null;
  const name = isCompany ? (company?.company_name || aCase.targetName) : "관련 기업군";
  const id = isCompany ? (aCase.drugOrgId || aCase.companyId || "마약수사 기업 프로파일") : "PERSON-LINKED-ORG";
  const baseScore = isCompany
    ? Math.max(72, Math.round(company?.risk_score || 82))
    : 89;
  const riskTags = isCompany
    ? "마약 전구물질, 위장수입, 국제특송 반복, 고위험국 경유"
    : "명의대여 법인, 특송업체 반복 이용, 위장 수입자, 분산 배송";
  const metrics = [
    { label:"마약위험 종합점수", value:`${baseScore}`, desc:"화물·거래·경로·관계망 통합", tone:drugRiskScoreClass(baseScore) },
    { label:"전구물질 거래지수", value:isCompany ? "91" : "84", desc:"N-페닐피페라진 등 의심 품목", tone:"high" },
    { label:"국제특송 반복도", value:isCompany ? "78" : "86", desc:"소량·분산 반입 패턴", tone:"mid" },
    { label:"고위험국 경유", value:isCompany ? "4개국" : "3개국", desc:"MX·NL·TH·PH 경유 이력", tone:"mid" },
    { label:"위장수입자 연계", value:isCompany ? "높음" : "매우 높음", desc:"명의대여·실화주 불일치 의심", tone:"high" },
    { label:"자금세탁 의심", value:isCompany ? "주의" : "고위험", desc:"분산송금·ATM 출금 연계", tone:isCompany ? "mid" : "high" },
  ];
  const cargoRows = [
    ["APLL2026053001", "N-페닐피페라진 유도체", "CN→KR", "전구물질", "95", "검사지시"],
    ["MSCU2026053002", "유기화합물 혼합분말", "MX→NL→KR", "전구물질", "91", "검사지시"],
    ["DHL2026052917", "전자부품 샘플", "TH→KR", "은닉 반입", "84", "분석중"],
    ["EMS2026052711", "건강보조식품", "PH→KR", "반복 소량", "79", "감시중"],
  ];
  const relatedRows = [
    ["김우범", "연락책", "필로폰 관련 별칭·메신저 주문", "49.9"],
    ["박공범", "수취인", "소량 반복 수령·주소 분산", "78"],
    ["최연락", "중개자", "특송번호 공유·공동 출입국", "82"],
    ["ABC Courier", "운송업체", "고위험 화물 반복 취급", "76"],
  ];
  const body = `
    ${drugMetricCards(metrics)}
    <div class="drug-profile-grid">
      <section class="drug-profile-panel">
        <h4>기업 마약 프로파일</h4>
        <dl class="drug-profile-defs">
          <dt>대상</dt><dd>${escapeHtml(name)} (${escapeHtml(id)})</dd>
          <dt>유형</dt><dd>${isCompany ? "수입·물류 관련 기업" : "개인 수사대상 연계 기업군"}</dd>
          <dt>감시상태</dt><dd>${isCompany ? "검사지시/분석중" : "관계망 추적"}</dd>
          <dt>마약위험 태그</dt><dd>${escapeHtml(riskTags)}</dd>
          <dt>중점 확인</dt><dd>실화주 확인, 전구물질 품명 위장, 특송 분산 반입, 해외 공급자 연계</dd>
        </dl>
      </section>
      <section class="drug-profile-panel">
        <h4>마약수사 중심 위험지표</h4>
        <ul class="drug-risk-list">
          <li><strong>전구물질 품명 위장</strong><span>화학품·전자부품·건강식품 명목 반입</span></li>
          <li><strong>반복 소량 배송</strong><span>통관 회피 목적의 물량 분산 의심</span></li>
          <li><strong>고위험국 경유</strong><span>마약류 생산·환적 국가 이동 경로 포함</span></li>
          <li><strong>실화주 불명확</strong><span>수입자·수취인·대금지급자 불일치</span></li>
        </ul>
      </section>
    </div>
    <div class="drug-profile-grid">
      <section class="drug-profile-panel">
        <h4>의심 화물/통관 이력</h4>
        ${dataTable(["관리번호","품명","경로","위험유형","점수","상태"], cargoRows)}
      </section>
      <section class="drug-profile-panel">
        <h4>연계 인물/조직</h4>
        ${dataTable(["대상","역할","마약수사 단서","위험점수"], relatedRows)}
      </section>
    </div>
  `;
  return drugProfileShell("마약프로파일", "선택한 기업의 마약류·전구물질·위장수입 위험을 조직 단위로 재구성한 프로파일입니다.", `${aCase.caseId} · 기업 · ${deps.drugInvTypeById(aCase.invTypeId).label}`, body);
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
  const tags = person?.risk_tags || "마약류, 필로폰, 고위험국 이동, 분산송금";
  // 실제 우범자 프로파일(근거 기반 위험지표) 로드
  if(personId && !deps.getRiskPersonProfile?.(personId) && !deps.isRiskPersonProfileLoading?.(personId)) {
    deps.loadRiskPersonProfile?.(personId);
  }
  const detail = deps.getRiskPersonProfile?.(personId);
  const realIndicators = detail?.indicators || [];
  const metrics = [
    { label:"우범자 마약위험", value:`${score}`, desc:"개인 프로파일·사건·관계망 통합", tone:drugRiskScoreClass(score) },
    { label:"고위험국 이동", value:"92", desc:"NL·TH·PH 반복 이동/배송", tone:"high" },
    { label:"관계망 근접도", value:"0.78", desc:"기존 적발자와 2촌 이내 연결", tone:"high" },
    { label:"소량 반복 반입", value:"5회", desc:"국제우편·특송 분산 수령", tone:"mid" },
    { label:"은어/SNS 단서", value:"18건", desc:"필로폰·MDMA 관련 별칭 탐지", tone:"high" },
    { label:"분산송금 패턴", value:"주의", desc:"소액 반복·ATM 출금 연계", tone:"mid" },
  ];
  const incidentRows = [
    ["RS-2026-0001", "밀수입", "필로폰", "공항 여행자", "연락책", "강함"],
    ["RS-2026-0001-02", "밀반출", "위조상품", "국제우편", "연락책", "중간"],
    ["RS-2026-DRG-07", "마약 자금세탁", "분산송금", "ATM/해외송금", "자금책 의심", "중간"],
  ];
  const body = `
    ${drugMetricCards(metrics)}
    <div class="drug-profile-grid">
      <section class="drug-profile-panel">
        <h4>우범자 마약 프로파일</h4>
        <dl class="drug-profile-defs">
          <dt>대상</dt><dd>${escapeHtml(name)} (${escapeHtml(personId)})</dd>
          <dt>유형</dt><dd>${escapeHtml(person?.profile_type || "마약수사 연계 우범자")}</dd>
          <dt>국적/권역</dt><dd>${escapeHtml(person?.nationality || aCase.nationality || "미상")} / ${escapeHtml(person?.address_region || "추적중")}</dd>
          <dt>위험등급</dt><dd>${escapeHtml(level)} · ${score}점</dd>
          <dt>마약위험 태그</dt><dd>${escapeHtml(tags)}</dd>
          <dt>감시상태</dt><dd>${escapeHtml(person?.watch_status || "추적중")}</dd>
        </dl>
      </section>
      <section class="drug-profile-panel">
        <h4>마약수사 중심 확인 포인트</h4>
        <ul class="drug-risk-list">
          <li><strong>입국/배송 경로</strong><span>고위험국 출발·경유·도착 패턴</span></li>
          <li><strong>수취·연락 역할</strong><span>반복 수취인, 연락책, 운반책 여부</span></li>
          <li><strong>디지털 단서</strong><span>은어, 메신저 주문, SNS 채널 참여</span></li>
          <li><strong>자금 흐름</strong><span>분산송금, 현금화, 해외송금 연결</span></li>
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
  return drugProfileShell("마약프로파일", "선택한 우범자의 이동·관계망·디지털·자금 단서를 마약수사 지표 중심으로 재구성한 프로파일입니다.", `${aCase.caseId} · 우범자 · ${deps.drugInvTypeById(aCase.invTypeId).label}`, body);
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
