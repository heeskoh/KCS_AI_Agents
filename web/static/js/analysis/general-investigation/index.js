import { escapeHtml } from "../../core/dom.js";
import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import { createGeneralInvestigationTabs } from "./tabs.js";
import { currentSubtabAgentDefaultOptions } from "../shared/scenario-builder-config.js";

export function createGeneralInvestigation(deps){
  const tabsForPage = (pageKey = "generalinv") => createGeneralInvestigationTabs(deps, pageKey);

  function generalInvPage(pageKey = "generalinv"){
    const tabs = tabsForPage(pageKey);
    const aCase = deps.activeGenInvCase();
    const tab = deps.getGeneralInvTab();
    const profileLabel = aCase && aCase.targetType === "person" ? "우범자 프로파일" : "기업 프로파일";
    const tabContext = { case:aCase, profileLabel };

    // 페이지별 타이틀/부제목 (fxsearch는 외환수사 전용 표현)
    const isFx = pageKey === "fxsearch";
    const pageTitle = isFx ? "외환 수사 분석" : "일반수사 분석";
    const pageDesc  = isFx
      ? "외환·자금세탁 범죄 수사 대상을 등록하고, 외환 수사 표준 시나리오에 따라 수사를 진행합니다."
      : "관세청 조사국이 수행하는 일반수사 대상을 등록하고, 수사 유형별 표준 분석시나리오에 따라 수사를 진행합니다.";

    return `
      <section class="card gi-hub${(tab==="workbench"||tab==="report") ? " gi-hub-full" : ""}">
        <div class="gi-page-head">
          <div>
            <h2>${escapeHtml(pageTitle)}</h2>
            <p class="muted">${escapeHtml(pageDesc)}</p>
          </div>
          ${aCase ? `
            <div class="gi-active-badge">
              <span class="muted">수사 대상</span>
              <strong>${escapeHtml(aCase.targetName)}</strong>
              <span class="gi-type-chip ${deps.genInvTypeById(aCase.invTypeId).cls}">${deps.genInvTypeById(aCase.invTypeId).num} ${escapeHtml(deps.genInvTypeById(aCase.invTypeId).label)}</span>
            </div>
          ` : ""}
        </div>
        <div class="gi-tab-nav">
          ${renderAnalysisTabButtons(tabs, tab, "data-gi-tab", "gi-tab", tabContext)}
        </div>
        <div class="gi-tab-body">
          ${generalInvTabContent(tabContext, pageKey)}
        </div>
      </section>
    `;
  }

  function generalInvTabContent(context = {}, pageKey = "generalinv"){
    const tabs = tabsForPage(pageKey);
    return renderAnalysisTabContent(tabs, deps.getGeneralInvTab(), context, "cases");
  }

  function currentTabAgentDefaultOptions(pageKey = "generalinv"){
    return currentSubtabAgentDefaultOptions(tabsForPage(pageKey), deps.getGeneralInvTab(), deps.getScenarioBuilderConfig?.());
  }

  return {
    currentTabAgentDefaultOptions,
    generalInvPage,
    generalInvTabContent,
  };
}
