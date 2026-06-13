import { dataTable, escapeHtml } from "../../core/dom.js";
import { specialInvestigationState } from "./state.js";

function drugContextHeader(ctx, title, desc){
  if(!ctx) return "";
  return `
    <div class="drug-context-head">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(desc || "")}</p>
      </div>
      <div class="drug-context-target">
        <span>${escapeHtml(ctx.label)}</span>
        <b>${escapeHtml(ctx.targetName)}</b>
        <small>${escapeHtml(ctx.case.caseId)} · ${escapeHtml(ctx.type.label)}</small>
      </div>
    </div>
  `;
}

function drugSubTabNav(group, active, tabs){
  return `
    <div class="drug-subtabs">
      ${tabs.map(t => `
        <button type="button" class="${active === t.key ? "active" : ""}"
          data-drug-subtab="${escapeHtml(group)}:${escapeHtml(t.key)}">
          ${escapeHtml(t.label)}
        </button>
      `).join("")}
    </div>
  `;
}

export function renderDataPanel(deps){
  const aCase = deps.activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const ctx = deps.drugCaseContext(aCase);
  const tabs = ctx.targetType === "company"
    ? [
        {key:"profile", label:"기업 프로파일"},
        {key:"cargo", label:"화물·특송"},
        {key:"trade", label:"거래·자금"},
        {key:"people", label:"연계 인물"},
      ]
    : [
        {key:"profile", label:"우범자 프로파일"},
        {key:"travel", label:"입출국·여행"},
        {key:"digital", label:"통화·디지털"},
        {key:"finance", label:"금융거래"},
      ];
  if(!tabs.some(t => t.key === specialInvestigationState.drugDataSubTab)) specialInvestigationState.drugDataSubTab = "profile";
  const tableByTab = {
    profile: ctx.targetType === "company"
      ? dataTable(["항목","내용","마약수사 관점"], [
          ["대상 기업", ctx.targetName, "실화주·명의대여·위장수입 여부 확인"],
          ["식별 ID", ctx.targetId || ctx.case.drugOrgId || "-", "마약프로파일 기준키"],
          ["주요 위험", "전구물질, 국제특송 반복, 고위험국 경유", "CDW·DB 조회 우선"],
          ["수집자료", "수입신고, BL, 송품장, 운송장, 대금지급 내역", "화물-자금-관계망 연결"],
        ])
      : dataTable(["항목","내용","마약수사 관점"], [
          ["대상 우범자", ctx.targetName, "개인 프로파일 기준 수사"],
          ["식별 ID", ctx.targetId || "-", "우범자 프로파일 기준키"],
          ["주요 위험", ctx.person?.risk_tags || "고위험국 이동, 소량 반복 반입, 은어/SNS 단서", "개인 DB·관계망 조회 우선"],
          ["수집자료", "입출국 기록, 특송 수령, 통화/SNS, 금융거래", "개인 행위 패턴 연결"],
        ]),
    cargo: dataTable(["관리번호","품명","경로","위험유형","상태"], [
      ["APLL2026053001", "N-페닐피페라진 유도체", "CN→KR", "전구물질", "검사지시"],
      ["EMS2026052711", "건강보조식품", "PH→KR", "소량분산", "감시중"],
      ["DHL2026052917", "전자부품 샘플", "TH→KR", "은닉반입", "분석중"],
    ]),
    trade: dataTable(["일자","상대방","금액","유형","마약수사 단서"], [
      ["2026-05-28", "해외 공급자", "USD 12,000", "해외송금", "전구물질 대금 의심"],
      ["2026-05-26", "김우범", "15,000,000원", "법인이체", "실화주 불일치"],
      ["2026-05-20", "불상 계좌", "5,500,000원", "ATM출금", "현금화"],
    ]),
    people: dataTable(["대상","역할","관계","위험점수"], [
      ["김우범", "연락책", "화물 수취/주문", "92"],
      ["박공범", "수취인", "주소 분산", "78"],
      ["최연락", "중개자", "운송장 공유", "82"],
    ]),
    travel: dataTable(["일자","경로","체류/수령지","위험단서","상태"], [
      ["2026-05-28", "방콕→인천", "인천공항", "고위험국 반복", "추적중"],
      ["2026-05-21", "암스테르담→인천", "서울", "특송 수령 직후 입국", "분석중"],
      ["2026-05-02", "마닐라→부산", "부산", "분산 배송지 접근", "감시중"],
    ]),
    digital: dataTable(["출처","단서","키워드","위험도","처리"], [
      ["메신저", "주문 대화", "아이스/작대기", "높음", "포렌식 연계"],
      ["SNS", "비공개 채널", "초록이", "중간", "은어사전 RAG"],
      ["통화", "해외번호 반복", "+63/+66", "중간", "통화상대 분석"],
    ]),
    finance: dataTable(["일자","거래처","금액","패턴","위험도"], [
      ["2026-05-28", "박공범", "2,800,000원", "소액 반복", "의심"],
      ["2026-05-20", "불상", "5,500,000원", "ATM 현금화", "의심"],
      ["2026-05-15", "해외송금", "USD 12,000", "대금 분산", "고위험"],
    ]),
  };
  return `
    <div class="drug-tab-stack">
      ${drugContextHeader(ctx, "기초자료 수집/등록", "선택한 마약수사 대상 기준으로 필요한 자료 묶음과 서브탭을 고정합니다.")}
      ${drugSubTabNav("data", specialInvestigationState.drugDataSubTab, tabs)}
      <section class="drug-profile-panel">
        <h4>${escapeHtml(tabs.find(t => t.key === specialInvestigationState.drugDataSubTab)?.label || "기초자료")}</h4>
        ${tableByTab[specialInvestigationState.drugDataSubTab] || tableByTab.profile}
      </section>
    </div>
  `;
}

export const dataSubtab = {
  id: "data",
  label: "기초자료 수집/등록",
  enabledWhen: context => !!context.case,
  aiServices: ["ocr", "rag_create", "db_cdw"],
  render: renderDataPanel,
};
