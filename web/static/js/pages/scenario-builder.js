import { escapeHtml } from "../core/dom.js";
import {
  AGENT_SERVICE_DEFINITIONS,
  collectSubtabAgentRequirements,
} from "../analysis/shared/agent-metadata.js";
import {
  ANALYSIS_TEMPLATE_OPTIONS,
  DEFAULT_ANALYSIS_SCENARIOS,
} from "../analysis/shared/scenario-builder-config.js";
import { CUSTOMS_SUBTABS } from "../analysis/customs/tabs.js";
import { GENERAL_INVESTIGATION_SUBTABS } from "../analysis/general-investigation/tabs.js";
import { SPECIAL_INVESTIGATION_SUBTABS } from "../analysis/special-investigation/tabs.js";

const SUBTABS_BY_TEMPLATE = {
  customs: CUSTOMS_SUBTABS,
  "general-investigation": GENERAL_INVESTIGATION_SUBTABS,
  "special-investigation": SPECIAL_INVESTIGATION_SUBTABS,
};

export function scenarioBuilderPage({ config, isSuperAdmin }){
  if(!isSuperAdmin()){
    return `
      <section class="card" style="text-align:center;padding:56px 20px">
        <h2>업무시나리오 구성</h2>
        <p class="muted">Super 관리자만 접근할 수 있습니다.</p>
      </section>
    `;
  }

  return `
    <section class="card scenario-builder-page">
      <div style="display:flex;align-items:flex-start;gap:16px;justify-content:space-between;margin-bottom:18px">
        <div>
          <h2 style="margin:0 0 6px">업무시나리오 구성</h2>
          <p class="muted" style="margin:0">전문업무분석 버튼, 업무분석별 서브탭, AI 에이전트 기본 옵션을 구성합니다.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn secondary" type="button" data-scenario-builder-reset>기본값 복원</button>
          <button class="btn" type="button" data-scenario-builder-save>설정 저장</button>
        </div>
      </div>

      <div class="summary-box" style="margin-bottom:16px">
        <b>1차 구현 범위</b>
        <p class="muted" style="margin:6px 0 0">저장된 설정은 다음 단계에서 업무분석 렌더링에 연결됩니다. 현재 기존 화면 동작은 변경되지 않습니다.</p>
      </div>

      <div style="display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:16px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px">
          ${analysisScenarioSection(config)}
          ${newAnalysisForm()}
        </div>
        ${agentDefaultsSection(config)}
      </div>
    </section>
  `;
}

function analysisScenarioSection(config){
  const scenarios = config.analysisScenarios || {};
  const customPages = (config.customAnalysisScenarios || []).map(scenario => scenario.page);
  const pages = [...Object.keys(DEFAULT_ANALYSIS_SCENARIOS), ...customPages]
    .filter((page, index, items) => page && items.indexOf(page) === index);
  return `
    <section class="summary-box">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
        <div>
          <b>업무분석별 서브탭 구성</b>
          <p class="muted" style="margin:4px 0 0">기본 진입 서브탭과 사용할 서브탭을 선택합니다.</p>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${pages.map(page => scenarioEditorCard(scenarios[page] || DEFAULT_ANALYSIS_SCENARIOS[page])).join("")}
      </div>
    </section>
  `;
}

function scenarioEditorCard(scenario){
  const subtabs = SUBTABS_BY_TEMPLATE[scenario.template] || [];
  const enabled = new Set(scenario.enabledSubtabs || []);
  return `
    <article style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fff" data-scenario-builder-analysis="${escapeHtml(scenario.page)}">
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:12px">
        <div>
          <strong>${escapeHtml(scenario.title)}</strong>
          <p class="muted" style="margin:3px 0 0;font-size:12px">${escapeHtml(scenario.page)} · ${escapeHtml(scenario.template)}</p>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#41506a">
          기본 진입
          <select class="gi-reg-select" style="height:30px" data-scenario-default-tab="${escapeHtml(scenario.page)}">
            ${subtabs.map(tab => option(tab.id, tabLabel(tab, scenario), scenario.defaultTab)).join("")}
          </select>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        ${subtabs.map(tab => `
          <label style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:#f8fbff;font-size:12px">
            <input type="checkbox" data-scenario-subtab="${escapeHtml(scenario.page)}:${escapeHtml(tab.id)}" ${enabled.has(tab.id) ? "checked" : ""}>
            <span>${escapeHtml(tabLabel(tab, scenario))}</span>
          </label>
        `).join("")}
      </div>
    </article>
  `;
}

function agentDefaultsSection(config){
  const requirements = collectSubtabAgentRequirements([
    ...CUSTOMS_SUBTABS,
    ...GENERAL_INVESTIGATION_SUBTABS,
    ...SPECIAL_INVESTIGATION_SUBTABS,
  ]);
  const byService = new Map(requirements.map(item => [item.serviceId, item]));
  const services = Object.keys(AGENT_SERVICE_DEFINITIONS)
    .filter(serviceId => byService.has(serviceId))
    .sort((a, b) => agentLabel(a).localeCompare(agentLabel(b), "ko"));
  return `
    <section class="summary-box" style="max-height:calc(100vh - 190px);overflow:auto">
      <div style="position:sticky;top:0;background:inherit;padding-bottom:10px;z-index:1">
        <b>AI 에이전트 기본 옵션</b>
        <p class="muted" style="margin:4px 0 0">서브탭에서 활용 중인 AI 에이전트 기준입니다.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${services.map(serviceId => agentDefaultCard(serviceId, config.agentOptionDefaults?.[serviceId] || {})).join("")}
      </div>
    </section>
  `;
}

function agentDefaultCard(serviceId, defaults){
  const definition = AGENT_SERVICE_DEFINITIONS[serviceId] || {};
  const agentId = defaults.agentId || definition.agentId || serviceId;
  return `
    <article style="border:1px solid var(--line);border-radius:8px;padding:12px;background:#fff" data-agent-default="${escapeHtml(serviceId)}">
      <div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between;margin-bottom:8px">
        <div>
          <strong style="font-size:13px">${escapeHtml(definition.label || serviceId)}</strong>
          <p class="muted" style="margin:3px 0 0;font-size:11px">${escapeHtml(serviceId)} → ${escapeHtml(agentId)}</p>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px">
          <input type="checkbox" data-agent-enabled="${escapeHtml(serviceId)}" ${defaults.enabled !== false ? "checked" : ""}>
          사용
        </label>
      </div>
      <label style="display:block;font-size:12px;color:#41506a;margin-bottom:8px">
        기본 behavior
        <input class="form-input" style="width:100%;height:30px;margin-top:4px;box-sizing:border-box" data-agent-behavior="${escapeHtml(serviceId)}" value="${escapeHtml(defaults.behavior || "")}" placeholder="예: risk_signal">
      </label>
      <label style="display:block;font-size:12px;color:#41506a">
        기본 지시문
        <textarea class="gi-wb2-textarea" rows="3" style="width:100%;box-sizing:border-box;margin-top:4px" data-agent-instruction="${escapeHtml(serviceId)}" placeholder="에이전트 실행 시 기본 지시문">${escapeHtml(defaults.instruction || "")}</textarea>
      </label>
    </article>
  `;
}

function newAnalysisForm(){
  return `
    <section class="summary-box">
      <b>?좉퇋 ?낅Т遺꾩꽍 異붽?</b>
      <p class="muted" style="margin:4px 0 12px">湲곗〈 ?쒗뵆由우쓣 議고빀?댁꽌 ?꾨Ц?낅Т遺꾩꽍 踰꾪듉怨??붾㈃???앹꽦?⑸땲??</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:10px">
        <label style="display:block;font-size:12px;color:#41506a">
          key
          <input class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px" data-custom-analysis-key placeholder="ex) auditcase">
        </label>
        <label style="display:block;font-size:12px;color:#41506a">
          title
          <input class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px" data-custom-analysis-title placeholder="?붾㈃ ?쒕ぉ">
        </label>
        <label style="display:block;font-size:12px;color:#41506a">
          template
          <select class="gi-reg-select" style="width:100%;height:34px;margin-top:4px" data-custom-analysis-template>
            ${ANALYSIS_TEMPLATE_OPTIONS.map(item => option(item.id, item.label, "special-investigation")).join("")}
          </select>
        </label>
      </div>
      <label style="display:block;font-size:12px;color:#41506a;margin-bottom:10px">
        description
        <textarea class="gi-wb2-textarea" rows="2" style="width:100%;box-sizing:border-box;margin-top:4px" data-custom-analysis-description placeholder="?낅Т遺꾩꽍 ?ㅻ챸"></textarea>
      </label>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
        ${ANALYSIS_TEMPLATE_OPTIONS.map(item => customTemplateSubtabs(item.id)).join("")}
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn" type="button" data-custom-analysis-add>異붽?</button>
      </div>
    </section>
  `;
  return `
    <section class="summary-box">
      <b>신규 업무분석 추가</b>
      <p class="muted" style="margin:4px 0 12px">다음 단계에서 설정 기반 registry 확장으로 연결됩니다.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
        <input class="form-input" disabled placeholder="업무분석 key">
        <input class="form-input" disabled placeholder="화면 제목">
        <select class="gi-reg-select" disabled>
          <option>customs 템플릿</option>
          <option>general-investigation 템플릿</option>
          <option>special-investigation 템플릿</option>
        </select>
        <button class="btn secondary" type="button" disabled>추가 준비중</button>
      </div>
    </section>
  `;
}

function customTemplateSubtabs(template){
  const subtabs = SUBTABS_BY_TEMPLATE[template] || [];
  const fallback = Object.values(DEFAULT_ANALYSIS_SCENARIOS).find(scenario => scenario.template === template);
  return `
    <article style="border:1px solid var(--line);border-radius:8px;padding:12px;background:#fff" data-custom-template-tabs="${escapeHtml(template)}">
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:10px">
        <strong style="font-size:13px">${escapeHtml(template)}</strong>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#41506a">
          湲곕낯 吏꾩엯
          <select class="gi-reg-select" style="height:30px" data-custom-analysis-default-tab="${escapeHtml(template)}">
            ${subtabs.map(tab => option(tab.id, tabLabel(tab, fallback || { page:"", template }), fallback?.defaultTab || subtabs[0]?.id)).join("")}
          </select>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        ${subtabs.map(tab => `
          <label style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:#f8fbff;font-size:12px">
            <input type="checkbox" data-custom-analysis-subtab="${escapeHtml(template)}:${escapeHtml(tab.id)}" checked>
            <span>${escapeHtml(tabLabel(tab, fallback || { page:"", template }))}</span>
          </label>
        `).join("")}
      </div>
    </article>
  `;
}

function option(value, label, selected){
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function tabLabel(tab, scenario){
  const context = {
    config: {
      profileTab: "프로파일",
      dashboardTab: "위험 대시보드",
      ...(scenario.page === "lawsearch" ? { profileTab:"마약프로파일", dashboardTab:"마약위험 대시보드" } : {}),
      ...(scenario.page === "fxsearch" ? { profileTab:"외환프로파일", dashboardTab:"외환위험 대시보드" } : {}),
    },
  };
  return typeof tab.label === "function" ? tab.label(context) : tab.label;
}

function agentLabel(serviceId){
  return AGENT_SERVICE_DEFINITIONS[serviceId]?.label || serviceId;
}
