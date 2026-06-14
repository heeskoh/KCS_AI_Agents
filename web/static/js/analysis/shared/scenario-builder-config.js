import { AGENT_SERVICE_DEFINITIONS } from "./agent-metadata.js";

export const SCENARIO_BUILDER_STORAGE_KEY = "kcs_ai_scenario_builder_config_v1";
export const SCENARIO_BUILDER_CONFIG_VERSION = 1;

export const DEFAULT_ANALYSIS_BUTTONS = [
  { className: "red", page: "profile", label: "기업 위험도 대시보드" },
  { className: "sky", page: "investigation", label: "관세 조사 분석" },
  { className: "rose", page: "generalinv", label: "일반 수사 분석" },
  { className: "purple", page: "lawsearch", label: "마약 수사 분석" },
  { className: "teal", page: "fxsearch", label: "외환 수사 분석" },
  { className: "olive", page: "case", label: "국제 정보분석" },
  { className: "lime", page: "model", label: "관세 온톨로지" },
  { className: "brown", page: "report", label: "Case별 RAG" },
];

export const DEFAULT_ANALYSIS_SCENARIOS = {
  investigation: {
    page: "investigation",
    title: "관세조사 분석",
    template: "customs",
    defaultTab: "ongoing",
    enabledSubtabs: ["ongoing", "profile", "data", "scenario", "report", "dashboard"],
  },
  generalinv: {
    page: "generalinv",
    title: "일반 수사 분석",
    template: "general-investigation",
    defaultTab: "cases",
    enabledSubtabs: ["cases", "profile", "data", "workbench", "report"],
  },
  lawsearch: {
    page: "lawsearch",
    title: "마약 수사 분석",
    template: "special-investigation",
    defaultTab: "dashboard",
    enabledSubtabs: ["ongoing", "profile", "data", "scenario", "network", "forensic", "report", "slang", "dashboard"],
  },
  fxsearch: {
    page: "fxsearch",
    title: "외환 수사 분석",
    template: "special-investigation",
    defaultTab: "dashboard",
    enabledSubtabs: ["ongoing", "profile", "data", "scenario", "network", "forensic", "report", "slang", "dashboard"],
  },
};

export const ANALYSIS_TEMPLATE_OPTIONS = [
  { id: "customs", label: "관세조사 템플릿" },
  { id: "general-investigation", label: "일반수사 템플릿" },
  { id: "special-investigation", label: "특수수사 템플릿" },
];

export const DEFAULT_AGENT_OPTION_DEFAULTS = Object.fromEntries(
  Object.entries(AGENT_SERVICE_DEFINITIONS).map(([serviceId, definition]) => [
    serviceId,
    {
      serviceId,
      agentId: definition.agentId || serviceId,
      enabled: true,
      instruction: "",
      behavior: "",
      options: {},
    },
  ])
);

export function defaultScenarioBuilderConfig(){
  return cloneConfig({
    version: SCENARIO_BUILDER_CONFIG_VERSION,
    analysisButtons: DEFAULT_ANALYSIS_BUTTONS,
    analysisScenarios: DEFAULT_ANALYSIS_SCENARIOS,
    customAnalysisScenarios: [],
    agentOptionDefaults: DEFAULT_AGENT_OPTION_DEFAULTS,
  });
}

export function normalizeScenarioBuilderConfig(config = {}){
  const defaults = defaultScenarioBuilderConfig();
  const scenarioOverrides = isPlainObject(config.analysisScenarios) ? config.analysisScenarios : {};
  const baseScenarios = Object.fromEntries(
    Object.entries(defaults.analysisScenarios).map(([page, scenario]) => [
      page,
      {...scenario, ...(isPlainObject(scenarioOverrides[page]) ? scenarioOverrides[page] : {})},
    ])
  );
  const customAnalysisScenarios = Array.isArray(config.customAnalysisScenarios)
    ? config.customAnalysisScenarios.map(normalizeCustomScenario).filter(Boolean)
    : [];
  const analysisScenarios = {
    ...baseScenarios,
    ...Object.fromEntries(customAnalysisScenarios.map(scenario => [scenario.page, scenario])),
  };
  const agentOverrides = isPlainObject(config.agentOptionDefaults) ? config.agentOptionDefaults : {};
  const agentOptionDefaults = Object.fromEntries(
    Object.entries(defaults.agentOptionDefaults).map(([serviceId, defaults]) => [
      serviceId,
      {...defaults, ...(isPlainObject(agentOverrides[serviceId]) ? agentOverrides[serviceId] : {})},
    ])
  );
  return {
    ...defaults,
    ...config,
    version: SCENARIO_BUILDER_CONFIG_VERSION,
    analysisButtons: Array.isArray(config.analysisButtons) ? config.analysisButtons : defaults.analysisButtons,
    analysisScenarios,
    customAnalysisScenarios,
    agentOptionDefaults,
  };
}

export function loadScenarioBuilderConfig(storage = globalThis.localStorage){
  if(!storage) return defaultScenarioBuilderConfig();
  try{
    const raw = storage.getItem(SCENARIO_BUILDER_STORAGE_KEY);
    return normalizeScenarioBuilderConfig(raw ? JSON.parse(raw) : {});
  }catch(error){
    console.warn("업무시나리오 구성 설정을 불러오지 못했습니다.", error);
    return defaultScenarioBuilderConfig();
  }
}

export function saveScenarioBuilderConfig(config, storage = globalThis.localStorage){
  const normalized = normalizeScenarioBuilderConfig(config);
  if(storage){
    storage.setItem(SCENARIO_BUILDER_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function scenarioConfigForPage(config, page){
  const normalized = normalizeScenarioBuilderConfig(config);
  return normalized.analysisScenarios[page] || null;
}

export function analysisButtonsForConfig(config){
  const normalized = normalizeScenarioBuilderConfig(config);
  const customButtons = normalized.customAnalysisScenarios.map(scenario => ({
    className: scenario.className || "blue",
    page: scenario.page,
    label: scenario.title,
  }));
  const seen = new Set();
  return [...normalized.analysisButtons, ...customButtons].filter(button => {
    if(!button?.page || seen.has(button.page)) return false;
    seen.add(button.page);
    return true;
  });
}

export function isCustomAnalysisPage(config, page){
  const normalized = normalizeScenarioBuilderConfig(config);
  return normalized.customAnalysisScenarios.some(scenario => scenario.page === page);
}

export function scenarioDefaultTabForPage(config, page, fallbackId = ""){
  const scenario = scenarioConfigForPage(config, page);
  return scenario?.defaultTab || fallbackId;
}

export function configuredSubtabsForPage(subtabs, config, page){
  const scenario = scenarioConfigForPage(config, page);
  if(!scenario || !Array.isArray(scenario.enabledSubtabs)) return subtabs;
  const enabled = new Set(scenario.enabledSubtabs);
  return subtabs.filter(subtab => enabled.has(subtab.id));
}

export function agentDefaultOptionsForService(config, serviceId){
  const normalized = normalizeScenarioBuilderConfig(config);
  return normalized.agentOptionDefaults[serviceId] || DEFAULT_AGENT_OPTION_DEFAULTS[serviceId] || null;
}

export function agentDefaultOptionsByAgentId(config){
  const normalized = normalizeScenarioBuilderConfig(config);
  const byAgentId = {};
  Object.entries(normalized.agentOptionDefaults || {}).forEach(([serviceId, defaults]) => {
    const agentId = defaults.agentId || AGENT_SERVICE_DEFINITIONS[serviceId]?.agentId || serviceId;
    if(!byAgentId[agentId]){
      byAgentId[agentId] = {
        agentId,
        enabled: defaults.enabled !== false,
        instruction: defaults.instruction || "",
        behavior: defaults.behavior || "",
        options: {...(isPlainObject(defaults.options) ? defaults.options : {})},
        services: {},
      };
    }
    byAgentId[agentId].services[serviceId] = {
      ...defaults,
      serviceId,
      agentId,
      enabled: defaults.enabled !== false,
      options: {...(isPlainObject(defaults.options) ? defaults.options : {})},
    };
  });
  return byAgentId;
}

export function agentDefaultOptionsForRequirement(config, requirement){
  if(!requirement) return null;
  const serviceDefault = agentDefaultOptionsForService(config, requirement.serviceId) || {};
  const agentDefaults = agentDefaultOptionsByAgentId(config)[requirement.agentId] || {};
  return {
    agentId: requirement.agentId,
    serviceId: requirement.serviceId,
    label: requirement.label,
    category: requirement.category,
    enabled: serviceDefault.enabled !== false && agentDefaults.enabled !== false,
    behavior: serviceDefault.behavior || agentDefaults.behavior || "",
    instruction: serviceDefault.instruction || agentDefaults.instruction || "",
    options: {
      ...(isPlainObject(agentDefaults.options) ? agentDefaults.options : {}),
      ...(isPlainObject(serviceDefault.options) ? serviceDefault.options : {}),
    },
  };
}

export function agentDefaultOptionsForSubtab(config, subtab){
  return (subtab?.agentRequirements || []).map(requirement => ({
    requirement,
    action: (subtab.agentActions || []).find(item =>
      item.serviceId === requirement.serviceId && item.agentId === requirement.agentId
    ) || null,
    defaultOptions: agentDefaultOptionsForRequirement(config, requirement),
  }));
}

export function subtabWithAgentDefaultOptions(subtab, config){
  return {
    ...subtab,
    agentDefaultOptions: agentDefaultOptionsForSubtab(config, subtab),
  };
}

export function currentSubtabAgentDefaultOptions(subtabs, activeTab, config){
  const subtab = (subtabs || []).find(item => item.id === activeTab) || null;
  return subtab ? agentDefaultOptionsForSubtab(config, subtab) : [];
}

export function subtabAgentDefaultOptionMap(subtabs, config){
  return Object.fromEntries((subtabs || []).map(subtab => [
    subtab.id,
    agentDefaultOptionsForSubtab(config, subtab),
  ]));
}

function cloneConfig(value){
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value){
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeCustomScenario(value){
  if(!isPlainObject(value)) return null;
  const page = String(value.page || "").trim();
  if(!page || DEFAULT_ANALYSIS_SCENARIOS[page]) return null;
  const template = ANALYSIS_TEMPLATE_OPTIONS.some(item => item.id === value.template)
    ? value.template
    : "special-investigation";
  const fallback = template === "customs"
    ? DEFAULT_ANALYSIS_SCENARIOS.investigation
    : template === "general-investigation"
      ? DEFAULT_ANALYSIS_SCENARIOS.generalinv
      : DEFAULT_ANALYSIS_SCENARIOS.lawsearch;
  const enabledSubtabs = Array.isArray(value.enabledSubtabs) && value.enabledSubtabs.length
    ? value.enabledSubtabs
    : fallback.enabledSubtabs;
  return {
    page,
    title: String(value.title || page).trim(),
    description: String(value.description || "").trim(),
    template,
    className: String(value.className || "blue").trim(),
    defaultTab: String(value.defaultTab || fallback.defaultTab),
    enabledSubtabs,
  };
}
