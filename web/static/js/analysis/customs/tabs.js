import { renderDashboardPanel } from "./dashboard.js";
import { renderDataPanel } from "./data.js";
import { renderOngoingPanel } from "./ongoing.js";
import { renderProfilePanel } from "./profile.js";
import { renderReportPanel } from "./report.js";
import { renderScenarioPanel } from "./scenario.js";
import { renderTemplatesPanel } from "./templates.js";

export function createCustomsInvestigationTabs(deps){
  return [
    { id:"ongoing", label:"진행중인 관세조사", group:"work", render:() => renderOngoingPanel(deps) },
    { id:"profile", label:"기업프로파일", group:"work", render:() => renderProfilePanel(deps) },
    { id:"data", label:"기초자료 수집/등록", group:"work", render:() => renderDataPanel(deps) },
    { id:"scenario", label:"분석 시나리오 설정 및 수행", group:"work", render:() => renderScenarioPanel(deps) },
    { id:"report", label:"분석 보고서 및 검증", group:"work", render:() => renderReportPanel(deps) },
    { id:"dashboard", label:"기업 위험도 대시보드", group:"tools", render:() => renderDashboardPanel(deps) },
    { id:"templates", label:"분석 시나리오 템플릿", group:"tools", className:"ci-tab-template", render:() => renderTemplatesPanel(deps) },
  ];
}
