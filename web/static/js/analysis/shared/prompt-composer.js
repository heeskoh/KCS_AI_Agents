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
/** 표준 섹션 출력 순서 */
const CANONICAL_ORDER = ["조회 범위", "분석 지표", "수행 절차", "출력 형식", "유의사항"];

/** 구버전 헤더 → 표준 헤더 매핑 */
const HEADER_ALIASES = {
  "검색 범위": "조회 범위",
  "분석 범위": "조회 범위",
  "조회 항목": "조회 범위",
  "분석 항목": "분석 지표",
};

/**
 * 프롬프트 텍스트를 역할 문장 + 섹션 맵으로 파싱합니다.
 * 섹션은 "\n\n" 으로 구분된 단락 중 [헤더] 로 시작하는 단락입니다.
 * @param {string} text
 * @returns {{role:string, sections:Map<string,string[]>}}
 */
function parsePromptSections(text) {
  const parts = String(text || "").trim().split(/\n\n+/);
  const role = [];
  const sections = new Map();
  let current = null;
  for (const part of parts) {
    const trimmed = part.trim();
    const m = trimmed.match(/^\[([^\]]+)\]\n?/);
    if (m) {
      const header = HEADER_ALIASES[m[1].trim()] || m[1].trim();
      const body = trimmed.slice(m[0].length);
      if (!sections.has(header)) sections.set(header, []);
      if (body) sections.get(header).push(...body.split("\n"));
      current = header;
    } else if (current === null) {
      role.push(trimmed);
    } else {
      sections.get(current).push(...trimmed.split("\n"));
    }
  }
  return { role: role.join("\n\n"), sections };
}

/**
 * 여러 프롬프트의 섹션을 헤더별로 병합합니다 (중복 라인 제거).
 * @param {string[]} prompts
 * @returns {Map<string,string[]>}
 */
function mergeSections(prompts) {
  const merged = new Map();
  for (const prompt of prompts) {
    const { sections } = parsePromptSections(prompt);
    for (const [header, lines] of sections) {
      if (!merged.has(header)) merged.set(header, []);
      const acc = merged.get(header);
      for (const line of lines) {
        if (!acc.includes(line)) acc.push(line);
      }
    }
  }
  return merged;
}

/**
 * 역할 문장 + 섹션 맵을 표준 순서([조회 범위]→[분석 지표]→[수행 절차]→[출력 형식]→[유의사항])로
 * 재조립합니다. [수행 절차]의 번호는 병합 후 다시 매깁니다.
 * @param {string} role
 * @param {Map<string,string[]>} sections
 * @returns {string}
 */
function buildPrompt(role, sections) {
  const ordered = [];
  for (const header of CANONICAL_ORDER) {
    if (sections.has(header)) ordered.push([header, sections.get(header)]);
  }
  for (const [header, lines] of sections) {
    if (!CANONICAL_ORDER.includes(header)) ordered.push([header, lines]);
  }
  const blocks = ordered.map(([header, lines]) => {
    let body = lines;
    if (header === "수행 절차") {
      let n = 0;
      body = lines.map(line =>
        /^\d+\./.test(line.trim())
          ? `${++n}. ${line.trim().replace(/^\d+\.\s*/, "")}`
          : line);
    }
    return `[${header}]\n${body.join("\n")}`;
  });
  return [role, ...blocks].filter(Boolean).join("\n\n");
}

export async function composePrompt(serviceId, behaviors = [], targetType = "company") {
  const data = await loadAgentPrompt(serviceId);
  if (!data) return "";

  const target = targetType === "person" ? "person" : "company";
  const composite = data.compositePrompts?.[target];

  if (composite) {
    const singles = behaviors.map(b => composite[b]).filter(Boolean);
    const sortedKey = [...behaviors].sort().join("+");
    const comboText = (sortedKey && composite[sortedKey]) || null;

    if (singles.length) {
      // 역할 문장: 조합 키 프롬프트(연계 분석 설명)가 있으면 우선, 없으면 첫 단일 프롬프트
      const role = parsePromptSections(comboText || singles[0]).role
        || parsePromptSections(composite["default"] || "").role;
      // 선택된 모든 단일 동작 프롬프트의 섹션을 병합 → 표준 순서로 재조립
      const merged = mergeSections(singles);
      const built = buildPrompt(role, merged);
      if (built) return built;
    }

    if (comboText) return comboText;
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
