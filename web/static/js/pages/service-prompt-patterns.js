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

   두 형식 모두 상세설정 프롬프트 템플릿의 상세 동작(수행 절차·출력 형식)을
   역할 문단만 제거한 채 본문에 이어 붙인다 — 동작 선택에 따라 상세 내용도 함께 변경된다. */
import { composePrompt } from "../analysis/shared/prompt-composer.js";

export const PROMPT_PATTERNS = {
  /* AI 분석서비스형 — 품목분류검증 */
  hs_verify: {
    kind: "agent",
    label: "품목분류검증",
    // My AI 분석에서 직접 입력하는 입력값 토큰 — 대상 기업/개인은 모든 분석형 서비스의 필수 입력
    homeInputs: ["대상 기업/개인", "신고 HS", "품명/규격"],
    // 분석시나리오에서 자동 등록되는 입력값(대상은 워크스페이스가 결정)
    scenarioInputs: ctx => [
      `분석대상 ${ctx.targetLabel || "(조사 대상 미선택)"}`,
      "등록 기초자료의 품명/HS코드(자동 추출)",
    ],
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
  const action = descs.length ? `선택한 동작에 따라 ${descs.join(" ")} 핵심 결과를 정리합니다.` : "선택한 동작 기준으로 검색해 핵심 결과를 정리합니다.";
  const cond = `분석대상 '${targetLabel || "(조사 대상 미선택)"}' · 동작방식 '${(behaviorLabels || []).join(", ")}'`;
  const head = `${p.provides} 정보를 제공하는 지식베이스입니다. ${action}\n검색 조건: ${cond} (분석시나리오에서 자동 등록됨)`;
  return detail ? `${head}\n\n${detail}` : head;
}

/* 입력값 나열: 2개 이하 "A와 B", 3개 이상 "A, B와 C" */
function joinInputs(items){
  if(items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}와 ${items[items.length - 1]}`;
}

function agentScenarioPrompt(p, behaviorLabels, targetLabel, detail){
  const inputs = p.scenarioInputs({ targetLabel });
  const inputText = joinInputs(inputs.map(v => `'${v}'`));
  const head = `입력값 ${inputText}를 활용하여 AI 분석서비스를 수행해줘.\nAI 분석서비스 '${p.label}'의 동작방식은 '${(behaviorLabels || []).join(", ")}'와 같습니다.\n(입력값·동작방식은 분석시나리오에서 자동 등록됨)`;
  return detail ? `${head}\n\n${detail}` : head;
}

/* 분석시나리오 자동 생성 프롬프트 최종화 — 패턴 등록 서비스는 패턴으로 대체, 그 외는 원본 유지.
   composed(상세설정 템플릿)의 역할 문단만 제거하고 상세 동작(수행 절차·출력 형식)은 본문에 보존한다. */
export function finalizeScenarioPrompt(serviceKey, behaviorLabels, composed){
  const p = PROMPT_PATTERNS[serviceKey];
  if(!p) return composed;
  const target = scenarioTargetLabel();
  const detail = stripRole(composed);
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
  const head = `입력값 ${inputText}를 활용하여 AI 분석서비스를 수행해줘.\nAI 분석서비스 '${p.label}'의 동작방식은 '${(behaviorLabels || []).join(", ")}'와 같습니다.`;
  const detail = stripRole(composedDetail);
  return detail ? `${head}\n\n${detail}` : head;
}

/* 기초자료 상세 팝업 등에서 보여줄 시나리오 기준 템플릿 미리보기(상세 동작 포함, 비동기) */
export async function scenarioPatternPreviewAsync(serviceKey, behaviorValues, behaviorLabels){
  if(!isPatternService(serviceKey)) return "";
  const composed = await composePrompt(serviceKey, behaviorValues || [], "company").catch(() => "");
  return finalizeScenarioPrompt(serviceKey, behaviorLabels || [], composed || "");
}
