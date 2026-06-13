import { escapeHtml } from "./dom.js";

function analysisTabVisible(tab, context = {}){
  return typeof tab.showWhen === "function" ? !!tab.showWhen(context) : tab.showWhen !== false;
}

function analysisTabEnabled(tab, context = {}){
  return typeof tab.enabledWhen === "function" ? !!tab.enabledWhen(context) : true;
}

function analysisTabLabel(tab, context = {}){
  return typeof tab.label === "function" ? tab.label(context) : tab.label;
}

export function renderAnalysisTabButtons(tabs, activeTab, dataAttr, className, context = {}){
  return tabs
    .filter(tab => analysisTabVisible(tab, context))
    .map(tab => {
      const enabled = analysisTabEnabled(tab, context);
      const hint = typeof tab.disabledHint === "function" ? tab.disabledHint(context) : (tab.disabledHint || "조사 대상을 먼저 선택하세요");
      const classes = `${className}${tab.className ? ` ${tab.className}` : ""}${activeTab === tab.id ? " active" : ""}${enabled ? "" : " disabled"}`;
      // 비활성(회색) 탭: data 속성을 제거하고 disabled 처리하여 클릭/탭 전환을 막는다.
      const attrs = enabled
        ? `${dataAttr}="${escapeHtml(tab.id)}"`
        : `disabled aria-disabled="true" title="${escapeHtml(hint)}"`;
      return `
      <button class="${classes}" ${attrs}>
        ${escapeHtml(analysisTabLabel(tab, context))}
      </button>
    `;
    })
    .join("");
}

export function renderAnalysisTabContent(tabs, activeTab, context = {}, fallbackId = ""){
  const visibleTabs = tabs.filter(tab => analysisTabVisible(tab, context));
  const active = visibleTabs.find(item => item.id === activeTab);
  // 활성 탭이 비활성(대상 미선택) 상태면 안전한 기본 탭으로 폴백한다.
  const tab = (active && analysisTabEnabled(active, context) ? active : null)
    || visibleTabs.find(item => item.id === fallbackId)
    || visibleTabs.find(item => analysisTabEnabled(item, context))
    || visibleTabs[0];
  return tab?.render ? tab.render(context) : "";
}
