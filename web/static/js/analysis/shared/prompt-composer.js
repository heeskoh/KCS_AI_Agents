/**
 * prompt-composer.js
 * 에이전트별 표준 프롬프트 JSON을 로드하고,
 * 선택된 behavior 조합에 맞는 최적 프롬프트를 반환합니다.
 */

const PROMPT_BASE_PATH = "/static/prompts/agents/";

/** 로드된 프롬프트 캐시 */
const _cache = {};

/**
 * 에이전트 프롬프트 JSON을 로드합니다 (캐시 사용).
 * @param {string} serviceId
 * @returns {Promise<object|null>}
 */
export async function loadAgentPrompt(serviceId) {
  if (_cache[serviceId]) return _cache[serviceId];
  try {
    const res = await fetch(`${PROMPT_BASE_PATH}${serviceId}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    _cache[serviceId] = data;
    return data;
  } catch {
    return null;
  }
}

/**
 * 선택된 behaviors 배열과 targetType을 기반으로 최적 프롬프트를 반환합니다.
 *
 * 우선순위:
 *   1. behaviors를 정렬하여 "+" 조합 키 매칭 (compositePrompts[targetType][behaviorKey])
 *   2. 단일 behavior 키 매칭
 *   3. "default" 키 매칭
 *   4. defaultPrompts[targetType] 폴백
 *
 * @param {string} serviceId
 * @param {string[]} behaviors - 선택된 behavior value 배열
 * @param {"company"|"person"} targetType
 * @returns {Promise<string>}
 */
export async function composePrompt(serviceId, behaviors = [], targetType = "company") {
  const data = await loadAgentPrompt(serviceId);
  if (!data) return "";

  const target = targetType === "person" ? "person" : "company";
  const composite = data.compositePrompts?.[target];

  if (composite) {
    // behaviors 정렬 후 "+" 조합 키 시도
    const sorted = [...behaviors].sort().join("+");
    if (sorted && composite[sorted]) return composite[sorted];

    // 단일 behavior 키 시도 (첫 번째 선택만)
    if (behaviors[0] && composite[behaviors[0]]) return composite[behaviors[0]];

    // default 키
    if (composite["default"]) return composite["default"];
  }

  // 폴백: defaultPrompts
  return data.defaultPrompts?.[target] || data.defaultPrompts?.company || "";
}

/**
 * behaviors 배열에서 인덱스 접근 없이 조합 가능한 모든 키를 반환합니다.
 * (디버깅·UI 검증용)
 * @param {string} serviceId
 * @param {"company"|"person"} targetType
 * @returns {Promise<string[]>}
 */
export async function listCompositeKeys(serviceId, targetType = "company") {
  const data = await loadAgentPrompt(serviceId);
  if (!data) return [];
  const target = targetType === "person" ? "person" : "company";
  return Object.keys(data.compositePrompts?.[target] || {});
}
