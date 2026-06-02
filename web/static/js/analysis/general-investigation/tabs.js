import { renderCasesPanel } from "./cases.js";
import { renderDataPanel } from "./data.js";
import { renderProfilePanel } from "./profile.js";
import { renderReportPanel } from "./report.js";
import { renderWorkbenchPanel } from "./workbench.js";

export function createGeneralInvestigationTabs(deps){
  return [
    { id:"cases", label:"진행중인 수사", render:() => renderCasesPanel(deps) },
    { id:"profile", label:ctx => ctx.profileLabel, showWhen:ctx => !!ctx.case, render:() => renderProfilePanel(deps) },
    { id:"data", label:"기초자료 수집/등록", showWhen:ctx => !!ctx.case, render:() => renderDataPanel(deps) },
    { id:"workbench", label:"분석 시나리오 설정 및 수행", showWhen:ctx => !!ctx.case, render:() => renderWorkbenchPanel(deps) },
    { id:"report", label:"분석 보고서 및 검증", showWhen:ctx => !!ctx.case, render:() => renderReportPanel(deps) },
  ];
}
