import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import { createCustomsInvestigationTabs } from "./tabs.js";

export function createCustomsInvestigation(deps){
  const tabs = createCustomsInvestigationTabs(deps);

  function investigationPage(){
    const tab = deps.getInvestigationTab();
    const workTabs = tabs.filter(item => item.group !== "tools");
    const toolTabs = tabs.filter(item => item.group === "tools");
    const isFullHeight = tab === "scenario" || tab === "report" || tab === "templates";
    return `
      <section class="card ci-hub${isFullHeight ? " ci-hub-full" : ""}">
        <div class="ci-page-head">
          <div>
            <h2>관세조사 분석</h2>
            <p class="muted">조사 우선순위가 높은 업체를 객관적 기준으로 선정하여 기초자료들을 등록하고, 표준 분석시나리오에 따라 분석을 수행합니다. 필요에 따라 분석 시나리오는 변경하여 맞춤형 시나리오를 구축할 수 있습니다.</p>
          </div>
        </div>
        <div class="ci-tab-nav">
          <div class="ci-tabs-left">
            ${renderAnalysisTabButtons(workTabs, tab, "data-investigation-tab", "ci-tab")}
          </div>
          <div class="ci-tabs-right">
            ${renderAnalysisTabButtons(toolTabs, tab, "data-investigation-tab", "ci-tab")}
          </div>
        </div>
        <div class="ci-tab-body">
          ${investigationTabContent()}
        </div>
      </section>
    `;
  }

  function investigationTabContent(){
    return renderAnalysisTabContent(tabs, deps.getInvestigationTab(), {}, "dashboard");
  }

  return {
    investigationPage,
    investigationTabContent,
  };
}
