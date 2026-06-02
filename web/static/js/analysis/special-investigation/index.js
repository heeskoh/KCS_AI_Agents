import { escapeHtml } from "../../core/dom.js";
import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import {
  createSpecialInvestigationTabs,
  SPECIAL_INVESTIGATION_CONFIG,
} from "./tabs.js";

export function createSpecialInvestigation(deps){
  const tabs = createSpecialInvestigationTabs(deps);

  function isSpecialInvestigationPage(page = deps.getCurrentPage()){
    return page === "lawsearch" || page === "fxsearch";
  }

  function activeSpecialInvestigationPage(){
    return isSpecialInvestigationPage(deps.getCurrentPage()) ? deps.getCurrentPage() : "lawsearch";
  }

  function specialInvestigationConfig(page = activeSpecialInvestigationPage()){
    return SPECIAL_INVESTIGATION_CONFIG[page] || SPECIAL_INVESTIGATION_CONFIG.lawsearch;
  }

  function renderSpecialInvestigation(){
    deps.render(activeSpecialInvestigationPage());
  }

  function drugInvestigationPage(pageKey = activeSpecialInvestigationPage()){
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
    const tab = deps.getDrugInvTab();
    if(tab === "company_profile" || tab === "person_profile"){
      deps.setDrugInvTab("profile");
    }
    return renderAnalysisTabContent(tabs, deps.getDrugInvTab(), context, "ongoing");
  }

  return {
    activeSpecialInvestigationPage,
    drugInvestigationPage,
    drugInvTabContent,
    isSpecialInvestigationPage,
    renderSpecialInvestigation,
    specialInvestigationConfig,
  };
}
