import { escapeHtml } from "../../core/dom.js";
import { renderAnalysisTabButtons, renderAnalysisTabContent } from "../../core/tabs.js";
import { currentSubtabAgentDefaultOptions } from "../shared/scenario-builder-config.js";

export function createGeneralInvestigation(deps){
  // 통합 서브탭 레지스트리에서 이 페이지의 서브탭을 구성한다(업무 전용 목록 제거).
  const tabsForPage = (pageKey = "generalinv") => deps.buildSubtabsForPage(pageKey);

  function generalInvPage(pageKey = "generalinv"){
    const tabs = tabsForPage(pageKey);
    // 업무탭은 왼쪽, 도구탭(group:"tools" — 예: 분석 시나리오 템플릿)은 오른쪽 끝으로 분리한다.
    const workTabs = tabs.filter(item => item.group !== "tools");
    const toolTabs = tabs.filter(item => item.group === "tools");
    const aCase = deps.activeGenInvCase();
    const tab = deps.getGeneralInvTab();
    // 일반수사 프로파일 명칭: 대상 유형별 재정의 (기업/개인). 대상 미선택 시 수사영역 대표 명칭.
    const profileLabel = !aCase
      ? "일반수사 프로파일"
      : aCase.targetType === "person" ? "개인수사 프로파일" : "기업수사 프로파일";
    const tabContext = { case:aCase, profileLabel };
    const targetId = aCase
      ? (aCase.targetType === "person" ? (aCase.personId || aCase.caseId) : (aCase.companyId || aCase.caseId))
      : "";
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
              <em>${escapeHtml(targetId)}</em>
              <span class="gi-type-chip ${deps.genInvTypeById(aCase.invTypeId).cls}">${deps.genInvTypeById(aCase.invTypeId).num} ${escapeHtml(deps.genInvTypeById(aCase.invTypeId).label)}</span>
            </div>
          ` : ""}
        </div>
        <div class="gi-tab-nav" style="justify-content:space-between">
          <div style="display:flex;gap:2px">
            ${renderAnalysisTabButtons(workTabs, tab, "data-gi-tab", "gi-tab", tabContext)}
          </div>
          <div style="display:flex;gap:2px">
            ${renderAnalysisTabButtons(toolTabs, tab, "data-gi-tab", "gi-tab", tabContext)}
          </div>
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
