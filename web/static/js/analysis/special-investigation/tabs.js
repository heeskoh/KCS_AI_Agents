import { renderDashboardPanel } from "./dashboard.js";
import { renderDataPanel } from "./data.js";
import { renderForensicPanel } from "./forensic.js";
import { renderNetworkPanel } from "./network.js";
import { renderOngoingPanel } from "./ongoing.js";
import { renderProfilePanel } from "./profile.js";
import { renderReportPanel } from "./report.js";
import { renderScenarioPanel } from "./scenario.js";
import { renderSlangPanel } from "./slang.js";

export const SPECIAL_INVESTIGATION_CONFIG = {
  lawsearch: {
    title: "마약 수사 분석",
    description: "마약 우범자 수사 등록부터 시나리오 실행, 관계망·포렌식 분석, 보고서 생성까지 통합 수사 워크플로우를 제공합니다.",
    profileTab: "마약프로파일",
    dashboardTab: "마약위험 대시보드",
  },
  fxsearch: {
    title: "외환 수사 분석",
    description: "외환 수사 대상 등록부터 시나리오 실행, 관계망·포렌식 분석, 보고서 생성까지 통합 수사 워크플로우를 제공합니다.",
    profileTab: "외환프로파일",
    dashboardTab: "외환위험 대시보드",
  },
};

export function createSpecialInvestigationTabs(deps){
  return [
    { id:"ongoing", label:"진행중인 수사", render:() => renderOngoingPanel(deps) },
    { id:"profile", label:ctx => ctx.config.profileTab, showWhen:ctx => !!ctx.case, render:() => renderProfilePanel(deps) },
    { id:"data", label:"기초자료 수집/등록", showWhen:ctx => !!ctx.case, render:() => renderDataPanel(deps) },
    { id:"scenario", label:"분석 시나리오 설정 및 실행", showWhen:ctx => !!ctx.case, render:() => renderScenarioPanel(deps) },
    { id:"network", label:"관계망 분석", showWhen:ctx => !!ctx.case, render:() => renderNetworkPanel(deps) },
    { id:"forensic", label:"자금·디지털 포렌식 분석", showWhen:ctx => !!ctx.case, render:() => renderForensicPanel(deps) },
    { id:"report", label:"분석보고서 및 검증", showWhen:ctx => !!ctx.case, render:() => renderReportPanel(deps) },
    { id:"slang", label:"은어사전 RAG", group:"tools", render:() => renderSlangPanel(deps) },
    { id:"dashboard", label:ctx => ctx.config.dashboardTab, group:"tools", render:() => renderDashboardPanel(deps) },
  ];
}
