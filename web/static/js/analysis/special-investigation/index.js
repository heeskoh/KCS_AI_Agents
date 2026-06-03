import { escapeHtml } from "../../core/dom.js";
import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import { currentSubtabAgentDefaultOptions } from "../shared/scenario-builder-config.js";
import {
  createSpecialInvestigationTabs,
  SPECIAL_INVESTIGATION_CONFIG,
} from "./tabs.js";

export function createSpecialInvestigation(deps){
  function isSpecialInvestigationPage(page = deps.getCurrentPage()){
    const scenario = deps.getAnalysisScenarioConfig?.(page);
    // fxsearch는 general-investigation 기반으로 이전됨 — 제외
    return page === "lawsearch" || scenario?.template === "special-investigation";
  }

  function activeSpecialInvestigationPage(){
    return isSpecialInvestigationPage(deps.getCurrentPage()) ? deps.getCurrentPage() : "lawsearch";
  }

  function specialInvestigationConfig(page = activeSpecialInvestigationPage()){
    const scenario = deps.getAnalysisScenarioConfig?.(page);
    const base = SPECIAL_INVESTIGATION_CONFIG[page] || SPECIAL_INVESTIGATION_CONFIG.lawsearch;
    return scenario?.template === "special-investigation"
      ? {...base, title: scenario.title || base.title, description: scenario.description || base.description}
      : base;
  }

  function renderSpecialInvestigation(){
    deps.render(activeSpecialInvestigationPage());
  }

  function drugInvestigationPage(pageKey = activeSpecialInvestigationPage()){
    const tabs = createSpecialInvestigationTabs(deps, pageKey);
    const config = specialInvestigationConfig(pageKey);
    const tab = deps.getDrugInvTab();
    const aCase = deps.activeDrugCase();
    const tabContext = { pageKey, config, case:aCase };
    const workTabs = tabs.filter(item => item.group !== "tools");
    const toolTabs = tabs.filter(item => item.group === "tools");
    const isFullHeight = tab === "scenario" || tab === "report";
    return `
      <section class="card gi-hub${isFullHeight ? " gi-hub-full" : ""}">
        <div class="gi-page-head">
          <div>
            <h2>${escapeHtml(config.title)}</h2>
            <p class="muted">${escapeHtml(config.description)}</p>
          </div>
          ${aCase ? `
            <div class="gi-active-badge">
              <span class="muted">수사 대상</span>
              <strong>${escapeHtml(aCase.targetName)}</strong>
              <span class="gi-type-chip ${deps.drugInvTypeById(aCase.invTypeId).cls}">
                ${deps.drugInvTypeById(aCase.invTypeId).num} ${escapeHtml(deps.drugInvTypeById(aCase.invTypeId).label)}
              </span>
            </div>
          ` : ""}
        </div>

        <!-- 탭 내비게이션: 좌측 업무탭 + 우측 도구탭 -->
        <div class="gi-tab-nav" style="justify-content:space-between">
          <div style="display:flex;gap:2px">
            ${renderAnalysisTabButtons(workTabs, tab, "data-drug-tab", "gi-tab", tabContext)}
          </div>
          <div style="display:flex;gap:2px">
            ${renderAnalysisTabButtons(toolTabs, tab, "data-drug-tab", "gi-tab", tabContext)}
          </div>
        </div>

        <div class="gi-tab-body">
          ${drugInvTabContent(tabContext)}
        </div>
      </section>
    `;
  }

  function drugInvTabContent(context = {}){
    const tabs = createSpecialInvestigationTabs(deps, context.pageKey || activeSpecialInvestigationPage());
    const tab = deps.getDrugInvTab();
    if(tab === "company_profile" || tab === "person_profile"){
      deps.setDrugInvTab("profile");
    }
    return renderAnalysisTabContent(tabs, deps.getDrugInvTab(), context, "ongoing");
  }

  function currentTabAgentDefaultOptions(pageKey = activeSpecialInvestigationPage()){
    return currentSubtabAgentDefaultOptions(
      createSpecialInvestigationTabs(deps, pageKey),
      deps.getDrugInvTab(),
      deps.getScenarioBuilderConfig?.()
    );
  }

  return {
    activeSpecialInvestigationPage,
    currentTabAgentDefaultOptions,
    drugInvestigationPage,
    drugInvTabContent,
    isSpecialInvestigationPage,
    renderSpecialInvestigation,
    specialInvestigationConfig,
  };
}
