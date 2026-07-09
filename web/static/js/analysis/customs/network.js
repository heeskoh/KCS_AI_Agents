import { escapeHtml } from "../../core/dom.js";
import { networkGraphPanelHtml, graphDomainForPage } from "../shared/network-graph.js";

function targetContextHeader(ctx, title, desc){
  if(!ctx) return "";
  return `
    <div class="drug-context-head">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(desc || "")}</p>
      </div>
      <div class="drug-context-target">
        <span>${escapeHtml(ctx.label)}</span>
        <b>${escapeHtml(ctx.targetName)}</b>
        <small>${escapeHtml(ctx.case?.caseId || "")} · ${escapeHtml(ctx.type?.label || "")}</small>
      </div>
    </div>
  `;
}

// 관세조사 관계망 분석: 조사 대상 기업을 중심으로 수입신고·거래처·관세사·위험요인 등
// Neo4j 관계망을 워크벤치 모드(데이터소스/파일등록/분석제어 포함)로 조회한다.
// 정규화된 대상 컨텍스트(uctx.target)는 통합 서브탭 레지스트리가 주입한다.
export function renderNetworkPanel(deps, uctx){
  const ctx = uctx?.target;
  if(!ctx) return `<div class="profile-loading">조사 대상을 먼저 선택하세요.</div>`;
  const targetType = ctx.targetType === "company" ? "company" : "person";
  const targetId = ctx.targetId || "";
  const domain = graphDomainForPage(uctx?.pageKey);
  const header = targetContextHeader(
    ctx,
    "조사자료 관계분석",
    "조사 대상 기업을 중심으로 수입신고·해외공급자·관세사·관계회사·위험요인 관계망을 분석합니다.",
  );
  if(!targetId){
    return `
      <div class="drug-network-page">
        ${header}
        <div class="profile-loading">연결된 대상 ID가 없어 관계망을 조회할 수 없습니다. 조사 대상 기업을 다시 선택해 주세요.</div>
      </div>
    `;
  }
  return `
    <div class="drug-network-page">
      ${header}
      <div class="profile-net-right net-right-wb">
        ${networkGraphPanelHtml(targetType, targetId, "조사자료 관계분석", { workbench: true, domain })}
      </div>
    </div>
  `;
}

export const networkSubtab = {
  id: "network",
  label: "조사자료 관계분석",
  group: "work",
  enabledWhen: context => !!context.case,
  aiServices: ["network", "route_analysis"],
  render: renderNetworkPanel,
};
