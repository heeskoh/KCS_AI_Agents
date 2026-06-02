import { escapeHtml } from "./dom.js";

function analysisTabVisible(tab, context = {}){
  return typeof tab.showWhen === "function" ? !!tab.showWhen(context) : tab.showWhen !== false;
}

function analysisTabLabel(tab, context = {}){
  return typeof tab.label === "function" ? tab.label(context) : tab.label;
}

export function renderAnalysisTabButtons(tabs, activeTab, dataAttr, className, context = {}){
  return tabs
    .filter(tab => analysisTabVisible(tab, context))
    .map(tab => {
      const classes = `${className}${tab.className ? ` ${tab.className}` : ""}${activeTab === tab.id ? " active" : ""}`;
      return `
      <button class="${classes}" ${dataAttr}="${escapeHtml(tab.id)}">
        ${escapeHtml(analysisTabLabel(tab, context))}
      </button>
    `;
    })
    .join("");
}

export function renderAnalysisTabContent(tabs, activeTab, context = {}, fallbackId = ""){
  const visibleTabs = tabs.filter(tab => analysisTabVisible(tab, context));
  const tab = visibleTabs.find(item => item.id === activeTab)
    || visibleTabs.find(item => item.id === fallbackId)
    || visibleTabs[0];
  return tab?.render ? tab.render(context) : "";
}
