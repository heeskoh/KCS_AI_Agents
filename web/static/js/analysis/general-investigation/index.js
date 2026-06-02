import { escapeHtml } from "../../core/dom.js";
import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import { createGeneralInvestigationTabs } from "./tabs.js";

export function createGeneralInvestigation(deps){
  const tabs = createGeneralInvestigationTabs(deps);

  function generalInvPage(){
    const aCase = deps.activeGenInvCase();
    const tab = deps.getGeneralInvTab();
    const profileLabel = aCase && aCase.targetType === "person" ? "우범자 프로파일" : "기업 프로파일";
    const tabContext = { case:aCase, profileLabel };
    return `
      <section class="card gi-hub${(tab==="workbench"||tab==="report") ? " gi-hub-full" : ""}">
        <div class="gi-page-head">
          <div>
            <h2>일반수사 분석</h2>
            <p class="muted">관세청 조사국이 수행하는 일반수사 대상을 등록하고, 수사 유형별 표준 분석시나리오에 따라 수사를 진행합니다.</p>
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
          ${generalInvTabContent(tabContext)}
        </div>
      </section>
    `;
  }

  function generalInvTabContent(context = {}){
    return renderAnalysisTabContent(tabs, deps.getGeneralInvTab(), context, "cases");
  }

  return {
    generalInvPage,
    generalInvTabContent,
  };
}
