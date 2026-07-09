import { escapeHtml } from "../../core/dom.js";
import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import { currentSubtabAgentDefaultOptions } from "../shared/scenario-builder-config.js";

export function createCustomsInvestigation(deps){
  // 통합 서브탭 레지스트리에서 이 페이지의 서브탭을 구성한다(업무 전용 목록 제거).
  const tabsForPage = (pageKey = "investigation") => deps.buildSubtabsForPage(pageKey);

  // 진행중인 관세조사로 '실제 등록된' 기업이 선택됐을 때만 case를 채운다.
  // (전역 activeCanvasCompanyId가 다른 화면에서 남아 있어도, 이 페이지에 등록된
  //  관세조사 job이 아니면 미선택으로 보아 일반수사와 동일하게 탭을 비활성화한다.)
  function activeCustomsCase(){
    const activeCompanyId = deps.getActiveCanvasCompanyId?.() || "";
    if(!activeCompanyId) return null;
    const isRegistered = (deps.activeCanvasJobs?.() || [])
      .some(job => job.companyId === activeCompanyId && deps.canvasJobCategory?.(job) === "관세조사 분석");
    if(!isRegistered) return null;
    const company = (deps.getScenarioCompanies?.() || []).find(c => c.company_id === activeCompanyId);
    return company || { company_id: activeCompanyId };
  }

  function investigationPage(pageKey = "investigation"){
    const tabs = tabsForPage(pageKey);
    const tab = deps.getInvestigationTab();
    const workTabs = tabs.filter(item => item.group !== "tools");
    const toolTabs = tabs.filter(item => item.group === "tools");
    // 모든 서브탭을 시나리오/조사자료 관계분석과 동일한 전체 프레임(풀 높이)으로 통일
    const isFullHeight = true;
    // 조사 대상이 선택돼야 기업프로파일 이후 서브탭이 활성화된다.
    const activeCase = activeCustomsCase();
    const activeCompanyId = activeCase?.company_id || "";
    const activeCompany = activeCase;
    const tabContext = { case: activeCase };
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
    const ctx = context || { case: activeCustomsCase() };
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
