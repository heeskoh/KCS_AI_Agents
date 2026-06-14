/* ═══════════════════════════════════════════════════════════════════
   통합 서브탭 레지스트리

   "특정 업무 전용 서브탭" 개념을 없애고, 모든 서브탭을 업무분석과 무관한
   독립 탭으로 취급한다. 3개 업무(관세/일반/특수)에 흩어진 서브탭 정의를
   대표(canonical) id 기준으로 하나로 통합한다.

   - 같은 기능을 업무별로 다른 id로 구현한 경우는 ALIAS_GROUPS로 묶어 1개로 노출
     (예: AI서비스 분석 작업 — 관세/특수=scenario, 일반=workbench).
   - 같은 id이지만 내용이 업무별로 다른 경우(data/profile/report/ongoing 등)는
     단일 엔트리로 등록하되, render/label은 ctx.domain에 따라 해당 업무의
     기존 구현으로 위임한다(콘텐츠 보존). 해당 업무 구현이 없으면 가용한
     구현 하나로 폴백하므로, 어떤 서브탭이든 어느 업무에든 추가하면 렌더된다.
   ═══════════════════════════════════════════════════════════════════ */

import { CUSTOMS_SUBTABS } from "../customs/tabs.js";
import { GENERAL_INVESTIGATION_SUBTABS } from "../general-investigation/tabs.js";
import { SPECIAL_INVESTIGATION_SUBTABS } from "../special-investigation/tabs.js";
import { withAgentMetadata } from "./agent-metadata.js";
import { scenarioConfigForPage, subtabWithAgentDefaultOptions } from "./scenario-builder-config.js";

// 같은 기능의 업무별 서브탭 동의어 그룹. 그룹의 첫 id가 대표 id.
const SUBTAB_ALIAS_GROUPS = [["scenario", "workbench"]];

export function subtabAliasIds(id){
  return SUBTAB_ALIAS_GROUPS.find(group => group.includes(id)) || [id];
}
export function canonicalSubtabId(id){
  return subtabAliasIds(id)[0];
}

// 업무분석 템플릿 ↔ 도메인 키 매핑. 도메인 키는 어떤 업무 구현/deps를 쓸지 선택한다.
export const DOMAIN_BY_TEMPLATE = {
  customs: "customs",
  "general-investigation": "general",
  "special-investigation": "special",
};

// 도메인 키 → 해당 업무의 서브탭 정의 목록. 등록 순서가 대표 구현 선택 우선순위.
const DOMAIN_SOURCES = [
  ["customs", CUSTOMS_SUBTABS],
  ["general", GENERAL_INVESTIGATION_SUBTABS],
  ["special", SPECIAL_INVESTIGATION_SUBTABS],
];

// 대표 id 기준 통합 엔트리: { id, group, aiServices(합집합), impls:{domain:subtab} }
const REGISTRY_ENTRIES = (() => {
  const byId = new Map();
  const order = [];
  for(const [domain, list] of DOMAIN_SOURCES){
    for(const subtab of list){
      const id = canonicalSubtabId(subtab.id);
      if(!byId.has(id)){
        byId.set(id, { id, group: subtab.group, impls: {}, aiServices: new Set() });
        order.push(id);
      }
      const entry = byId.get(id);
      entry.impls[domain] = subtab;
      if(entry.group === undefined && subtab.group) entry.group = subtab.group;
      (subtab.aiServices || []).forEach(serviceId => entry.aiServices.add(serviceId));
    }
  }
  return order.map(id => byId.get(id));
})();

// 현재 도메인의 구현을 우선 선택하고, 없으면 가용한 첫 구현으로 폴백한다.
function pickImpl(entry, domain){
  if(entry.impls[domain]) return { impl: entry.impls[domain], domain };
  const fallbackDomain = Object.keys(entry.impls)[0];
  return { impl: entry.impls[fallbackDomain], domain: fallbackDomain };
}

function entryToCatalogSubtab(entry){
  const base = {
    id: entry.id,
    group: entry.group,
    aiServices: [...entry.aiServices],
    label: (ctx = {}) => {
      const { impl } = pickImpl(entry, ctx.domain);
      return typeof impl.label === "function" ? impl.label(ctx) : impl.label;
    },
    enabledWhen: (ctx = {}) => {
      const { impl } = pickImpl(entry, ctx.domain);
      return typeof impl.enabledWhen === "function" ? !!impl.enabledWhen(ctx) : impl.enabledWhen !== false;
    },
    __entry: entry,
  };
  return withAgentMetadata(base);
}

// deps 없이 사용 가능한 통합 카탈로그 — 관리자 '업무시나리오 구성' 화면용.
export const ANALYSIS_SUBTAB_CATALOG = REGISTRY_ENTRIES.map(entryToCatalogSubtab);

// 등록된 모든 서브탭 원본 id 집합(동의어 포함). "등록 여부" 판별에 사용.
export const ALL_SUBTAB_IDS = new Set(
  [...CUSTOMS_SUBTABS, ...GENERAL_INVESTIGATION_SUBTABS, ...SPECIAL_INVESTIGATION_SUBTABS].map(t => t.id)
);

// 시나리오 enabledSubtabs(동의어 포함)에 해당 서브탭이 포함됐는지.
export function scenarioHasSubtab(scenario, id){
  const enabled = new Set(scenario?.enabledSubtabs || []);
  return subtabAliasIds(id).some(aid => enabled.has(aid));
}

/* 현재 페이지(도메인)의 활성 대상을 업무 비종속 형태로 정규화한다.
   도메인 비종속 서브탭(network/forensic 등)이 마약 전용 컨텍스트 대신
   현재 페이지의 대상으로 렌더할 수 있도록 공통 형태를 제공한다.
   반환 형태: { case:{caseId}, type:{label}, targetType, targetName, targetId, label } */
export function buildTargetContext(domain, deps, ctx){
  if(domain === "special"){
    // 마약·외환수사: 기존 drugCaseContext 그대로 사용(특수 페이지 동작 보존).
    const aCase = deps?.activeDrugCase?.();
    return aCase && deps.drugCaseContext ? deps.drugCaseContext(aCase) : null;
  }
  const c = ctx?.case;
  if(!c) return null;
  if(domain === "customs"){
    const id = c.company_id || "";
    return {
      case: { ...c, caseId: c.caseId || id },
      type: { label: "관세조사" },
      targetType: "company",
      targetName: c.company_name || id || "조사 대상",
      targetId: id,
      label: "기업",
    };
  }
  // 일반수사 등 사건 기반 도메인
  const targetType = c.targetType || "company";
  const targetId = targetType === "person" ? (c.personId || "") : (c.companyId || "");
  const type = deps?.genInvTypeById ? deps.genInvTypeById(c.invTypeId) : null;
  return {
    case: c,
    type: type || { label: "" },
    targetType,
    targetName: c.targetName || c.caseId || "대상",
    targetId,
    label: targetType === "person" ? "수사 대상" : "기업",
  };
}

/* 런타임 빌더: 도메인별 deps를 받아 실제 render가 바인딩된 통합 서브탭을 만든다. */
export function createUnifiedSubtabRegistry(depsByDomain){
  const allSubtabs = ANALYSIS_SUBTAB_CATALOG.map(base => ({
    ...base,
    render: (ctx = {}) => {
      const { impl, domain } = pickImpl(base.__entry, ctx.domain);
      // 각 업무 구현은 자신의 업무 deps를 기대하므로 그 업무의 deps로 호출한다.
      // 정규화된 대상 컨텍스트(ctx.target)도 함께 전달한다(도메인 비종속 서브탭용).
      return impl.render(depsByDomain[domain], ctx);
    },
  }));

  // 페이지의 enabledSubtabs(동의어 정규화)로 필터하고, 도메인을 컨텍스트에 주입한다.
  // options:
  //   removeIds  — 시나리오 설정(enabledSubtabs)에서 나온 항목이라도 제외할 서브탭 id 목록
  //   appendIds  — 설정과 무관하게 항상 오른쪽 끝에 추가할 서브탭 id 목록(중복 제거)
  // 두 옵션은 "시나리오 설정과 다르게 동작하는" 탭(예: 관리자 전용 템플릿)을 위한 것이다.
  function subtabsForPage(page, domain, config, options = {}){
    const { removeIds = [], appendIds = [] } = options;
    const removeSet = new Set(removeIds.map(canonicalSubtabId));
    const scenario = scenarioConfigForPage(config, page);
    const enabled = scenario?.enabledSubtabs;
    // enabledSubtabs 순서를 그대로 따른다(관리자 정렬 반영). 동의어는 대표 id로 정규화 후 중복 제거.
    const list = (Array.isArray(enabled)
      ? enabled
          .map(id => allSubtabs.find(subtab => subtab.id === canonicalSubtabId(id)))
          .filter(Boolean)
          .filter((subtab, index, arr) => arr.indexOf(subtab) === index)
      : [...allSubtabs])
      .filter(subtab => !removeSet.has(subtab.id));
    // 항상 오른쪽 끝에 추가(설정 포함 여부·순서와 무관). 이미 있으면 중복 추가하지 않는다.
    const present = new Set(list.map(subtab => subtab.id));
    for(const id of appendIds){
      const cid = canonicalSubtabId(id);
      if(present.has(cid)) continue;
      const base = allSubtabs.find(subtab => subtab.id === cid);
      if(base){ list.push(base); present.add(cid); }
    }
    return list.map(base => ({
      ...subtabWithAgentDefaultOptions(base, config),
      label: ctx => base.label({ ...ctx, domain }),
      enabledWhen: ctx => base.enabledWhen({ ...ctx, domain }),
      render: ctx => {
        // 페이지 도메인의 deps로 정규화 대상을 만들어 ctx.target에 주입한다.
        const merged = { ...ctx, domain };
        merged.target = buildTargetContext(domain, depsByDomain[domain], merged);
        return base.render(merged);
      },
    }));
  }

  return { allSubtabs, subtabsForPage };
}
