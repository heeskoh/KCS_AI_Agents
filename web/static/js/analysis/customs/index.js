import { escapeHtml } from "../../core/dom.js";
import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import { createCustomsInvestigationTabs } from "./tabs.js";
import { currentSubtabAgentDefaultOptions } from "../shared/scenario-builder-config.js";

export function createCustomsInvestigation(deps){
  const tabsForPage = (pageKey = "investigation") => createCustomsInvestigationTabs(deps, pageKey);

  function investigationPage(pageKey = "investigation"){
    const tabs = tabsForPage(pageKey);
    const tab = deps.getInvestigationTab();
    const workTabs = tabs.filter(item => item.group !== "tools");
    const toolTabs = tabs.filter(item => item.group === "tools");
    const isFullHeight = tab === "scenario" || tab === "report" || tab === "templates";
    const activeCompanyId = deps.getActiveCanvasCompanyId?.() || "";
    const activeCompany = (deps.getScenarioCompanies?.() || []).find(company => company.company_id === activeCompanyId) || null;
    // 조사 대상이 선택돼야 기업프로파일 이후 서브탭이 활성화된다.
    const tabContext = { case: activeCompanyId ? (activeCompany || { company_id: activeCompanyId }) : null };
    return `
      <section class="card ci-hub${isFullHeight ? " ci-hub-full" : ""}">
        <div class="ci-page-head">
          <div>
            <h2>관세조사 분석</h2>
            <p class="muted">조사 우선순위가 높은 업체를 객관적 기준으로 선정하여 기초자료들을 등록하고, 표준 분석시나리오에 따라 분석을 수행합니다. 필요에 따라 분석 시나리오는 변경하여 맞춤형 시나리오를 구축할 수 있습니다.</p>
          </div>
          ${activeCompanyId ? `
            <div class="gi-active-badge">
              <span class="muted">조사 대상</span>
              <strong>${escapeHtml(activeCompany?.company_name || activeCompanyId)}</strong>
              <em>${escapeHtml(activeCompanyId)}</em>
              <span class="gi-type-chip gi-t3">원산지 위반 수사</span>
            </div>
          ` : ""}
        </div>
        <div class="ci-tab-nav">
          <div class="ci-tabs-left">
            ${renderAnalysisTabButtons(workTabs, tab, "data-investigation-tab", "ci-tab", tabContext)}
          </div>
          <div class="ci-tabs-right">
            ${renderAnalysisTabButtons(toolTabs, tab, "data-investigation-tab", "ci-tab", tabContext)}
          </div>
        </div>
        <div class="ci-tab-body">
          ${investigationTabContent(pageKey, tabContext)}
        </div>
      </section>
    `;
  }

  function investigationTabContent(pageKey = "investigation", context = null){
    const tabs = tabsForPage(pageKey);
    const activeCompanyId = deps.getActiveCanvasCompanyId?.() || "";
    const ctx = context || { case: activeCompanyId ? { company_id: activeCompanyId } : null };
    return renderAnalysisTabContent(tabs, deps.getInvestigationTab(), ctx, "ongoing");
  }

  function currentTabAgentDefaultOptions(pageKey = "investigation"){
    return currentSubtabAgentDefaultOptions(tabsForPage(pageKey), deps.getInvestigationTab(), deps.getScenarioBuilderConfig?.());
  }

  return {
    currentTabAgentDefaultOptions,
    investigationPage,
    investigationTabContent,
  };
}
