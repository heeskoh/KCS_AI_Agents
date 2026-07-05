/* ── AI 서비스 프롬프트 패턴 (신규 기능) ─────────────────────────────────────
   역할(role) 문단 없는 설명형 프롬프트 패턴 2종을 정의하고, 등록된 서비스의
   분석시나리오 자동 생성 프롬프트를 이 패턴으로 대체한다. (서비스 단위 점진 등록)

   [지식베이스형 kb]
     "{OOOO} 정보를 제공하는 지식베이스입니다. {선택 동작에 따른 설명형 문장}
      검색 조건: {$조건}"
     - 분석시나리오/기초자료: {$조건} = 분석대상 기업/개인 + 동작방식 자동 등록
     - My AI 분석: 기존 UI(조건 직접 입력 + 예시 안내) 유지 — 패턴 미적용

   [AI분석서비스형 agent]
     "입력값 {$입력값1}와 {$입력값2}를 활용하여 AI 분석서비스를 수행해줘.
      AI 분석서비스 {$이름}의 동작방식은 {$동작방식}와 같습니다."
     - 분석시나리오: 입력값 = 분석대상 기업/개인·등록 자료 자동 등록
     - My AI 분석: 입력값을 [토큰]으로 표시해 직접 입력

   용어: 체크박스(분석범위) 선택 항목은 '분석범위'로 표기하고,
   '동작방식'은 상세설정 프롬프트 템플릿의 상세 내용(수행 절차·출력 형식)을 가리킨다.
   두 형식 모두 템플릿 상세를 역할 문단만 제거한 채 [동작방식] 블록으로 본문에 이어 붙이며,
   분석범위 선택에 따라 상세 내용도 함께 변경된다. */
import { composePrompt } from "../analysis/shared/prompt-composer.js";

export const PROMPT_PATTERNS = {
  /* ── AI 분석서비스형 ──
     homeInputs: My AI 분석에서 직접 입력하는 입력값 토큰(AI_SERVICE_INPUTS 칩 라벨과 일치)
     scenarioInputs: 분석시나리오에서 자동 등록되는 입력값(대상은 워크스페이스가 결정) */
  hs_verify: {
    kind: "agent",
    label: "품목분류검증",
    homeInputs: ["대상 기업/개인", "신고 HS", "품명/규격"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 품명/HS코드(자동 추출)",
    ],
  },
  declaration_verify: {
    kind: "agent",
    label: "수입신고검증",
    homeInputs: ["대상 기업/신고", "대조 문서"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 첨부문서 추출값(자동)",
    ],
  },
  rag_risk_select: {
    kind: "agent",
    label: "위험Case 분석",
    homeInputs: ["대상 기업/개인", "위험 유형"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "위험선별 기준·선별 이력(자동 연계)",
    ],
    fallbackDetail: `[수행 절차]
1. 위험선별 기준과 과거 선별 이력에서 분석대상과 유사한 위험Case를 검색하십시오.
2. 유사 Case별 위험 신호(저가신고·원산지·우회수입 등)와 판정 결과를 비교하십시오.
3. 분석대상에 적용 가능한 위험 신호를 우선순위로 정리하십시오.

[출력 형식]
- 유사 위험Case 표 (Case ID·유사도·위험 신호·판정)
- 분석대상 적용 위험 신호 요약과 후속 확인 항목`,
  },
  origin_analysis: {
    kind: "agent",
    label: "원산지 검증",
    homeInputs: ["대상 기업/품목", "신고 원산지", "FTA 협정"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 원산지 증빙(자동 추출)",
    ],
  },
  abnormal_trade: {
    kind: "agent",
    label: "이상거래 검증",
    homeInputs: ["대상 기업", "점검 관점"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "최근 거래·신고 내역(CDW 자동 연계)",
    ],
  },
  proceeds_tracking: {
    kind: "agent",
    label: "범죄수익 추적",
    homeInputs: ["대상(기업/인물)", "추적 기간"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 계좌·자금흐름 내역(자동 추출)",
    ],
  },
  route_analysis: {
    kind: "agent",
    label: "운송경로 분석",
    homeInputs: ["대상(화물/인물)", "경로 단서"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 운송서류·경로 정보(자동 추출)",
    ],
  },
  customs_value: {
    kind: "agent",
    label: "과세가격평가",
    homeInputs: ["대상 기업/신고", "조사기간", "대상 HS"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 거래가격·계약 정보(자동 추출)",
    ],
  },

  /* ── 분석지원 AI 서비스 ── */
  ml: {
    kind: "agent",
    label: "ML 모델 실행",
    homeInputs: ["대상 기업", "실행 모델"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "전체 위험 모델(자동 실행)",
    ],
  },
  network: {
    kind: "agent",
    label: "관계망 분석",
    homeInputs: ["분석 대상(기업/인물)", "탐색 단계(hop)"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "관계망 데이터(지분·거래·인적관계, 자동 연계)",
    ],
  },
  fund_trace: {
    kind: "agent",
    label: "자금흐름 관계분석",
    homeInputs: ["대상(기업/인물)", "자금내역 파일"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 자금내역 파일(자금이체·현금입출금·가상계좌, 자동 연결)",
    ],
    fallbackDetail: `[수행 절차]
1. 등록된 자금내역 파일(자금이체·현금입출금·가상계좌)을 시계열로 정렬하십시오.
2. 소유주·계좌 중심으로 자금 흐름 경로를 재구성하고 관계망 그래프로 표현하십시오.
3. 자금 집결·분산 노드와 현금화·가상자산 전환 지점을 식별하십시오.
4. 반복 패턴(정기 이체·분할 이체)과 시간대 집중 패턴을 분석하십시오.

[출력 형식]
- 시계열 자금흐름 표 (시점·경로·유형·금액)
- 소유주별 누적 금액과 관계망 그래프 요약
- 은닉 의심 지점과 근거`,
  },
  comms_analysis: {
    kind: "agent",
    label: "통신내역 관계분석",
    homeInputs: ["대상(인물/번호)", "통신 소스"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 통신내역(통화·SMS·SNS·메신저, 자동 연결)",
    ],
    fallbackDetail: `[수행 절차]
1. 등록된 통신 소스(통화·SMS·SNS·메신저) 중 선택한 분석범위를 시계열로 정리하십시오.
2. 상대별 연락 빈도·시간대 패턴을 분석하십시오.
3. 공범·전달책 연계 가능성이 있는 반복 연락 관계를 식별하십시오.

[출력 형식]
- 상대별 연락 빈도 표 (상대·채널·빈도·시간대)
- 연계 의심 관계와 근거`,
  },
  ocr: {
    kind: "agent",
    label: "OCR/문서인식",
    homeInputs: ["대상 문서"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료 문서(자동 연결)",
    ],
  },
  rag_create: {
    kind: "agent",
    label: "업무특화RAG 분석서비스",
    homeInputs: ["대상 자료"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료·선택 RAG(자동 연계)",
    ],
    fallbackDetail: `[수행 절차]
1. 선택 자료에서 핵심 항목(주체·품목·금액·일자·쟁점)을 추출하십시오.
2. 중복·불필요 내용을 정제하고 검색 가능한 지식 항목으로 정리하십시오.
3. 대상 RAG에 반영할 색인 구조(제목·요약·근거 원문)를 구성하십시오.

[출력 형식]
- 지식 항목 목록 (항목·요약·근거 위치)
- 반영 대상 RAG와 색인 결과 요약`,
  },
  ontology: {
    kind: "agent",
    label: "관세온톨로지",
    homeInputs: ["분석 대상"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "기업·거래·품목 데이터(자동 연계)",
    ],
    fallbackDetail: `[수행 절차]
1. 대상 데이터에서 엔터티(기업·거래·품목·인물)를 추출하십시오.
2. 엔터티 간 관계(거래·지분·운송·연락)를 정의하고 중복을 병합하십시오.
3. 지식그래프에 신규 관계를 반영하고 추론 규칙 후보를 정리하십시오.

[출력 형식]
- 엔터티·관계 요약 (유형별 수)
- 신규 연결 목록과 추론 규칙 제안`,
  },
  summary: {
    kind: "agent",
    label: "보고서 요약",
    homeInputs: ["요약 대상"],
    scenarioInputs: () => ["선행 단계 분석 결과(자동 연계)"],
    fallbackDetail: `[수행 절차]
1. 요약 대상에서 핵심 쟁점·수치·판단을 추출하십시오.
2. 조사관이 바로 활용할 수 있도록 3~5문장 핵심 요지로 정리하십시오.
3. 후속 확인이 필요한 항목을 별도로 표시하십시오.

[출력 형식]
- 핵심 요지 (3~5문장)
- 주요 수치·근거 표
- 후속 확인 항목`,
  },
  translate: {
    kind: "agent",
    label: "문서 번역",
    homeInputs: ["대상 문서"],   // My AI는 전용 입력 폼 유지 — 홈 카드 패턴은 적용되지 않음
    scenarioInputs: () => ["등록 기초자료 문서(자동 연결)"],
  },

  /* ── 외부연계 AI 서비스 ── */
  web_search: {
    kind: "agent",
    label: "웹검색",
    homeInputs: ["검색어"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "직접 등록 URL·웹 공개정보(자동 연계)",
    ],
  },
  patent: {
    kind: "agent",
    label: "특허정보 조회",
    homeInputs: ["검색 품목/키워드"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 품목·상표 정보(자동 추출)",
    ],
  },
  law: {
    kind: "agent",
    label: "법령 검토",
    homeInputs: ["검토 쟁점/법령"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "선행 단계 분석 쟁점(자동 연계)",
    ],
  },
  mail_share: {
    kind: "agent",
    label: "내부메일 공유",
    homeInputs: ["수신자 메일"],   // My AI는 전용 입력 폼 유지
    scenarioInputs: () => [
      "분석결과 보고서(자동 첨부)",
      "수신자(공유 패널에서 지정)",
    ],
  },

  /* ── 보고서 생성 및 검증 ── */
  report_generate: {
    kind: "agent",
    label: "보고서 생성",
    homeInputs: ["보고서 제목", "보고서 대상 자료"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "선행 단계 분석 결과(자동 통합)",
    ],
  },
  report_validate: {
    kind: "agent",
    label: "보고서 검증",
    homeInputs: ["검증 대상 보고서"],
    scenarioInputs: () => ["직전 단계 생성 보고서(자동 연계)"],
  },
  result_synthesis: {
    kind: "agent",
    label: "결과통합",
    homeInputs: ["최종 결과 형식"],
    scenarioInputs: () => [
      "선행 단계 전체 결과(자동 연계)",
      "지정한 최종 결과 형식",
    ],
    fallbackDetail: `[수행 절차]
1. 선행 단계 결과를 수집해 단계별 핵심 결론을 정리하십시오.
2. 단계 간 일치·모순되는 판단을 교차 검증하십시오.
3. 사용자가 지정한 최종 형식(보고서·요약·표)으로 종합하십시오.

[출력 형식]
- 단계별 핵심 결과 요약
- 교차 검증 결과 (일치·모순 표시)
- 지정 형식의 최종 종합 결론`,
  },
  rag_trade: {
    kind: "agent",
    label: "통관보고서 생성",
    homeInputs: ["대상 기업/개인", "확인 범위"],
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "통관/무역 데이터(자동 연계)",
    ],
    fallbackDetail: `[수행 절차]
1. 통관/무역 정보에서 분석대상 관련 이상 징후를 탐색하십시오.
2. 유사 사례·시장 맥락과 비교해 징후의 유의성을 평가하십시오.
3. 참고 근거(출처 포함)를 정리해 보고서 형태로 구성하십시오.

[출력 형식]
- 이상 징후 목록 (징후·근거·유의성)
- 참고 근거 출처 목록
- 종합 의견`,
  },
  report_standard: {
    kind: "agent",
    label: "표준보고서 생성",
    homeInputs: ["입력자료"],   // My AI는 전용 입력 폼 유지
    scenarioInputs: () => ["선행 단계 결과·입력자료(자동 연계)", "유사사례 표준보고서 양식"],
  },

  /* 지식베이스형 */
  rag_customs: {
    kind: "kb",
    provides: "업무규정·관세법령·사례집",
    behaviorDesc: {
      "관세정보 근거 확인": "관련 규정·법령 근거를 확인하고",
      "유사사례 비교": "유사사례를 비교해 차이점을 정리하며",
    },
  },
  rag_audit: {
    kind: "kb",
    provides: "심사결과보고서 기반 유사사례·추징 포인트",
    behaviorDesc: {
      "심사사례 비교": "유사 심사사례를 비교하고",
      "추징 포인트": "추징 가능 포인트를 정리하며",
    },
  },
  db_cdw: {
    kind: "kb",
    provides: "관세 데이터 웨어하우스(CDW) 조회",
    behaviorDesc: {
      "기업/신고 요약": "기업·신고 현황을 요약 조회하고",
      "위험지표 중심": "위험지표 중심으로 조회하고",
      "신고내역 중심": "신고내역 중심으로 조회하고",
    },
  },
};

export function isPatternService(serviceKey){
  return !!PROMPT_PATTERNS[serviceKey];
}

/* 상세설정 프롬프트 템플릿에서 역할 문단("당신은 …")만 제거하고 상세 동작(수행 절차·출력 형식 등)은 보존 */
export function stripRole(text){
  const t = String(text || "").trim();
  if(!t) return "";
  const paraEnd = t.indexOf("\n\n");
  const first = paraEnd >= 0 ? t.slice(0, paraEnd) : t;
  if(/^당신은\s/.test(first)) return paraEnd >= 0 ? t.slice(paraEnd + 2).trim() : "";
  return t;
}

/* 분석시나리오 워크스페이스의 조사 대상(기업/개인) 라벨 — 페이지 헤더 배지에서 읽는다 */
function scenarioTargetLabel(){
  const badge = document.querySelector(".gi-active-badge");
  if(!badge) return "";
  const name = badge.querySelector("strong")?.textContent?.trim() || "";
  const id = badge.querySelector("em")?.textContent?.trim() || "";
  if(name && id && name !== id) return `${name} (${id})`;
  return name || id;
}

function kbScenarioPrompt(p, behaviorLabels, targetLabel, detail){
  const descs = (behaviorLabels || []).map(l => p.behaviorDesc[l]).filter(Boolean);
  const action = descs.length ? `선택한 분석범위에 따라 ${descs.join(" ")} 핵심 결과를 정리합니다.` : "선택한 분석범위 기준으로 검색해 핵심 결과를 정리합니다.";
  const cond = `분석대상 '${targetLabel || "(조사 대상 미선택)"}' · 분석범위 '${(behaviorLabels || []).join(", ")}'`;
  const head = `${p.provides} 정보를 제공하는 지식베이스입니다. ${action}\n검색 조건: ${cond} (분석시나리오에서 자동 등록됨)`;
  return detail ? `${head}\n\n[동작방식]\n${detail}` : head;
}

/* 입력값 나열: 2개 이하 "A와 B", 3개 이상 "A, B와 C" */
function joinInputs(items){
  if(items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}와 ${items[items.length - 1]}`;
}

function agentScenarioPrompt(p, behaviorLabels, targetLabel, detail){
  const inputs = p.scenarioInputs({ targetLabel });
  const inputText = joinInputs(inputs.map(v => `'${v}'`));
  const scope = `AI 분석서비스 '${p.label}'의 분석범위는 '${(behaviorLabels || []).join(", ")}'${detail ? "이며, 동작방식은 아래와 같습니다." : "입니다."}`;
  const head = `입력값 ${inputText}를 활용하여 AI 분석서비스를 수행해줘.\n${scope}\n(입력값·분석범위는 분석시나리오에서 자동 등록됨)`;
  return detail ? `${head}\n\n[동작방식]\n${detail}` : head;
}

/* 분석시나리오 자동 생성 프롬프트 최종화 — 패턴 등록 서비스는 패턴으로 대체, 그 외는 원본 유지.
   composed(상세설정 템플릿)의 역할 문단만 제거하고 상세 동작(수행 절차·출력 형식)은 본문에 보존한다. */
export function finalizeScenarioPrompt(serviceKey, behaviorLabels, composed){
  const p = PROMPT_PATTERNS[serviceKey];
  if(!p) return composed;
  const target = scenarioTargetLabel();
  // 상세설정 템플릿이 없는 서비스는 패턴에 정의한 기본 동작방식(fallbackDetail)을 사용
  const detail = stripRole(composed) || p.fallbackDetail || "";
  return p.kind === "kb"
    ? kbScenarioPrompt(p, behaviorLabels, target, detail)
    : agentScenarioPrompt(p, behaviorLabels, target, detail);
}

/* My AI 분석 — AI분석서비스형 프롬프트(입력값은 [토큰]으로 직접 입력).
   composedDetail: 상세설정 템플릿 원문(역할 제거는 내부에서 처리) — 있으면 상세 동작을 함께 표시 */
export function homeAgentPatternPrompt(serviceKey, behaviorLabels, composedDetail){
  const p = PROMPT_PATTERNS[serviceKey];
  if(!p || p.kind !== "agent") return "";
  const inputText = joinInputs(p.homeInputs.map(l => `[${l}]`));
  const detail = stripRole(composedDetail) || p.fallbackDetail || "";
  const scope = `AI 분석서비스 '${p.label}'의 분석범위는 '${(behaviorLabels || []).join(", ")}'${detail ? "이며, 동작방식은 아래와 같습니다." : "입니다."}`;
  const head = `입력값 ${inputText}를 활용하여 AI 분석서비스를 수행해줘.\n${scope}`;
  return detail ? `${head}\n\n[동작방식]\n${detail}` : head;
}

/* 기초자료 상세 팝업 등에서 보여줄 시나리오 기준 템플릿 미리보기(상세 동작 포함, 비동기) */
export async function scenarioPatternPreviewAsync(serviceKey, behaviorValues, behaviorLabels){
  if(!isPatternService(serviceKey)) return "";
  const composed = await composePrompt(serviceKey, behaviorValues || [], "company").catch(() => "");
  return finalizeScenarioPrompt(serviceKey, behaviorLabels || [], composed || "");
}
