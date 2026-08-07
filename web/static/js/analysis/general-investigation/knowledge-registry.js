/* 관세범죄 지식 레지스트리 — AI 수사 가이드라인 빌더.

   /api/crime-registry(data/crime_knowledge_registry.json)를 로드해 입증 체인
   (C 죄명 → F 요증사실 → E 증거항목 → A 수집행위 + G 게이트)을 사건 혐의에 맞게
   전개한다. 운영 규칙(09_R) 중 UI에 반영하는 것:
     R-C1 허위신고 3분법 / R-C2 목적 배타 / R-C3 선결죄명  → 죄명 분기 안내(조사관 확인)
     R-C5 전개 완결성  → 미전개 죄명·계층 결손 시 미완성 표시
     R-E1 커버리지 / R-E2 외부증거 우선 / R-E3 고의 필수    → 요증사실·계획 경고
     R-E5 휘발성 선행 / R-E6 장기행위 즉시착수              → 우선 확보 정렬·즉시발송 표시
     R-E4 게이트 정합                                        → G2~G4 '신청 필요' 배지 */

let _registry = null;
let _loading = null;

export function getCrimeRegistry(){
  return _registry;
}

export function loadCrimeRegistry(onReady){
  if(_registry){ onReady?.(_registry); return Promise.resolve(_registry); }
  if(!_loading){
    _loading = fetch("/api/crime-registry")
      .then(res => res.ok ? res.json() : null)
      .then(data => { _registry = (data && !data.error) ? data : null; return _registry; })
      .catch(() => null)
      .finally(() => { _loading = null; });
  }
  return _loading.then(registry => { onReady?.(registry); return registry; });
}

/* ── 혐의(유형 k1~k9 / 수법) → 죄명 C코드 매핑 ──────────────────────────────
   레지스트리 06_P_패턴의 M↔C 접합과 01_C 죄명 체계를 근거로 한 접합 테이블.
   후보가 복수인 경우 첫 번째가 주 죄명, 나머지는 분기 후보(조사관 확인). */
const CATEGORY_TO_CCODES = {
  k1: ["C-11"],          // 관세포탈
  k2: ["C-21"],          // 밀수입 (밀수출은 C-22 미전개)
  k3: ["C-12"],          // 부정감면
  k4: ["C-13"],          // 부정환급
  k5: ["C-31"],          // 부정수입
  k6: ["C-52"],          // 지재권 침해물품 수입 (미전개 — 공통 F만 제공)
  k7: ["C-61"],          // 신고 없는 지급방법
  k8: ["C-23", "C-21"],  // 금지품 수출입(미전개) → 밀수입 F 세트로 보강
  k9: ["C-24"],          // 밀수품 취득 등 (R-C3 선결죄명)
};
const OFFENSE_TO_CCODES = {
  k1_valuation:  ["C-11", "C-14"],   // 가산요소 누락/가격조작 — R-C2 목적 배타
  k1_name_disguise: ["C-11", "C-21"],// 품명 위장 — R-C1 동일성 분기
  k7_hawala:     ["C-61"],
  k7_unlicensed: ["C-62", "C-61"],   // 무등록 외국환업무(미전개)
  k7_flight:     ["C-63", "C-61"],   // 재산국외도피(미전개)
  k2_false_name: ["C-21", "C-11"],   // 허위 품명 — R-C1 분기
};

/* 죄명 조합에 따라 표시할 분기 규칙(조사관 확인 항목) */
const BRANCH_RULE_IDS = {
  "R-C1": codes => codes.includes("C-11") || codes.includes("C-21"),
  "R-C2": codes => codes.includes("C-11") && codes.includes("C-14"),
  "R-C3": codes => codes.includes("C-24"),
  "R-C4": codes => codes.some(c => ["C-51", "C-52", "C-61", "C-62", "C-63"].includes(c)),
};

/* R-E2 외부증거(대상자가 통제 불가) — 규칙 본문 명시 항목 + 보유주체가 대상자
   (업체·개인)가 아닌 제3기관(세관·금융기관·해외당국 등) 증거 전반 */
const EXTERNAL_ECODES = new Set(["E-1001", "E-602", "E-404"]);
const isExternalEvidence = (eCode, holder) =>
  EXTERNAL_ECODES.has(eCode) || !/업체|개인/.test(String(holder || ""));
/* R-E6 즉시착수 수집행위 */
const IMMEDIATE_ACODES = new Set(["A-07", "A-08"]);

function byCode(list, key = "code"){
  const map = {};
  (list || []).forEach(item => { map[item[key]] = item; });
  return map;
}

export function ccodesForCrimes(crimes){
  if(!crimes?.categoryId) return [];
  const codes = [];
  (crimes.offenseIds || []).forEach(offenseId => {
    (OFFENSE_TO_CCODES[offenseId] || []).forEach(code => {
      if(!codes.includes(code)) codes.push(code);
    });
  });
  (CATEGORY_TO_CCODES[crimes.categoryId] || []).forEach(code => {
    if(!codes.includes(code)) codes.push(code);
  });
  return codes;
}

/* ── 증거수집 가이드 전개 ────────────────────────────────────────────────────
   반환: {
     ready, ccodes:[{...죄명, developed, branchRules:[]}], undeveloped:[...],
     facts:[{...요증사실, procedural, conditional, evidences:[{...}], warnings:[]}],
     patterns:[...], planWarnings:[], gates:{G1..G4 정의}
   } */
export function buildEvidenceGuide(crimes, opts = {}){
  const registry = _registry;
  if(!registry) return { ready: false };
  const codes = ccodesForCrimes(crimes);
  if(!codes.length) return { ready: true, ccodes: [] };

  const crimeByCode = byCode(registry.crimes);
  const evidenceByCode = byCode(registry.evidence);
  const actionByCode = byCode(registry.actions);
  const ruleById = byCode(registry.rules, "id");

  const selected = codes.map(code => crimeByCode[code]).filter(Boolean);
  const developed = selected.filter(c => c.factStatus === "완료");
  const undeveloped = selected.filter(c => c.factStatus !== "완료");
  const devCodes = developed.map(c => c.code);

  const branchRules = Object.entries(BRANCH_RULE_IDS)
    .filter(([, test]) => test(codes))
    .map(([id]) => ruleById[id])
    .filter(Boolean);

  /* F 세트: 전개 완료 죄명의 F + 공통(F-GEN) 상속 */
  const mapByFact = {};
  (registry.map || []).forEach(row => {
    (mapByFact[row.fact] = mapByFact[row.fact] || []).push(row);
  });

  const factRows = (registry.facts || []).filter(f => devCodes.includes(f.crime));
  const hasOwn = (test) => factRows.some(f => test(f));
  (registry.facts || []).filter(f => f.crime === "(공통)").forEach(f => {
    // 공통 요증사실 상속 조건 — 레지스트리 비고(전 죄명 상속/공범/법인/몰수 등) 기준
    if(f.code === "F-GEN-01" && hasOwn(x => x.layer === "F-S")) return;         // 고의 — 자체 F-S 보유 시 생략
    if(f.code === "F-GEN-03" && opts.targetType !== "company") return;          // 양벌규정 — 법인 피의자만
    if(f.code === "F-GEN-04" && hasOwn(x => x.text.includes("고발"))) return;   // 고발 — 자체 F-P 보유 시 생략
    if(f.code === "F-GEN-06"){                                                  // 몰수 — 몰수 규정 적용 죄명만
      const applies = developed.some(c => c.forfeiture && !c.forfeiture.includes("해당 없음"));
      if(!applies || hasOwn(x => x.text.includes("몰수"))) return;
    }
    factRows.push(f);
  });

  const volRank = { "상": 0, "중": 1, "하": 2 };
  const facts = factRows.map(f => {
    const rows = mapByFact[f.code] || [];
    const evidences = rows.map(row => {
      const ev = evidenceByCode[row.evidence] || {};
      const act = actionByCode[row.action] || {};
      return {
        eCode: row.evidence, name: ev.name || row.evidence,
        required: row.required === "◎",
        holder: ev.holder || "", volatility: ev.volatility || "하",
        gate: row.gate || ev.gate || act.gate || "G2",
        action: row.action, actionName: act.name || "", actionLaw: act.law || "",
        actionOutput: act.output || "", duration: act.duration || "",
        immediate: IMMEDIATE_ACODES.has(row.action),
        external: isExternalEvidence(row.evidence, ev.holder),
        note: row.note || ev.note || "",
      };
    }).sort((a, b) =>
      // R-E5 휘발성 선행 → 필수(◎) 우선 → 게이트 낮은 순
      (volRank[a.volatility] - volRank[b.volatility])
      || (b.required - a.required)
      || String(a.gate).localeCompare(String(b.gate)));

    const warnings = [];
    if(evidences.length){
      // R-E1 커버리지 — 업체 제출자료(E-2xx·E-3xx)만으로 구성된 요증사실
      const onlyInternal = evidences.every(e => /^E-[23]\d\d$/.test(e.eCode));
      if(onlyInternal) warnings.push("R-E1 커버리지 미달 — 업체 제출자료만으로 구성");
      // R-E2 외부증거 우선 — 대상자가 통제 불가한 증거가 없는 요증사실
      if(!evidences.some(e => e.external)) warnings.push("R-E2 취약 요증사실 — 대상자 통제 불가 증거 없음");
      // R-E3 고의 필수 — F-S 계층에 필수(◎) 증거 미배정
      if(f.layer === "F-S" && !evidences.some(e => e.required)) warnings.push("R-E3 승인 차단 — 주관적 요건에 필수 증거 없음");
    }
    return {
      ...f, evidences, warnings,
      procedural: !evidences.length,                         // 절차 확인 항목(고발 등)
      conditional: f.code === "F-GEN-02" ? "공범 존재 시" : "",
    };
  });
  // 계층 순 정렬: 객관(F-O) → 주관(F-S) → 절차(F-P), 같은 계층은 코드순
  const layerRank = { "F-O": 0, "F-S": 1, "F-P": 2 };
  facts.sort((a, b) => (layerRank[a.layer] - layerRank[b.layer]) || a.code.localeCompare(b.code));

  const planWarnings = [];
  if(undeveloped.length){
    planWarnings.push(`R-C5 미완성 — ${undeveloped.map(c => `${c.name}(${c.code})`).join("·")}: 요증사실 세트 미전개(2차 예정), 공통·인접 죄명 가이드로 보강`);
  }
  if(facts.some(f => f.warnings.some(w => w.startsWith("R-E3")))){
    planWarnings.push("R-E3 — 고의(주관적 요건) 필수 증거가 미배정된 계획은 승인이 차단됩니다");
  }

  const patterns = (registry.patterns || []).filter(p => codes.includes(p.crime));

  return {
    ready: true,
    ccodes: selected.map(c => ({ ...c, developed: c.factStatus === "완료" })),
    undeveloped, facts, patterns, branchRules, planWarnings,
    gates: byCode(registry.gates || [], "gate"),
  };
}

/* ── 입증 진도 — 확보된 증거(E코드 집합) 기준 요증사실 충족 판정 ──────────
   충족: 필수(◎) 증거 전부 확보 / 부분: 1개 이상 확보 / 미확보: 없음.
   절차 항목(증거 미배정)은 진도 분모에서 제외한다. */
export function guideProgress(guide, securedECodes){
  const secured = securedECodes instanceof Set ? securedECodes : new Set(securedECodes || []);
  const perFact = {};
  let done = 0, total = 0;
  (guide?.facts || []).forEach(f => {
    if(f.procedural){ perFact[f.code] = "procedural"; return; }
    total += 1;
    const req = f.evidences.filter(e => e.required);
    const reqDone = req.length && req.every(e => secured.has(e.eCode));
    const anyDone = f.evidences.some(e => secured.has(e.eCode));
    if(reqDone){ perFact[f.code] = "done"; done += 1; }
    else if(anyDone){ perFact[f.code] = "partial"; }
    else { perFact[f.code] = "none"; }
  });
  return { done, total, pct: total ? Math.round(done / total * 100) : 0, perFact };
}

/* 게이트 → 표시 배지(R-E4 게이트 정합: G2 이상은 승인·허가 절차 필요) */
export const GATE_BADGES = {
  G1: { label: "G1 자동수집", cls: "g1", desc: "세관 내부 보유자료 — 자동 대사" },
  G2: { label: "G2 임의조사", cls: "g2", desc: "제출요구·현장확인 — 내부 결재 필요" },
  G3: { label: "G3 영장·공조", cls: "g3", desc: "금융·통신·해외공조 — 영장/허가/공조 절차" },
  G4: { label: "G4 범칙조사", cls: "g4", desc: "수색·압수·포렌식·신문 — 범칙전환 + 영장" },
};
export function gateBadge(gate){
  const key = String(gate || "").split("/")[0].trim();
  return GATE_BADGES[key] || GATE_BADGES.G2;
}
