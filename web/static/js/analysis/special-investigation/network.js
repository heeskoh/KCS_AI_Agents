import { escapeHtml } from "../../core/dom.js";
import { networkGraphPanelHtml } from "../shared/network-graph.js";

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

// 관계망 분석: 프로파일 탭과 동일한 실제 Neo4j 관계망 그래프(/api/graph/*)를 표시한다.
// 정규화된 대상 컨텍스트(ctx.target)를 사용하므로 어느 업무(관세·일반·마약·외환)에서든
// 현재 선택된 대상(기업/인물)을 중심으로 동작한다.
export function renderNetworkPanel(deps, uctx){
  const ctx = uctx?.target;
  if(!ctx) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const targetType = ctx.targetType === "company" ? "company" : "person";
  const targetId = ctx.targetId || "";
  const header = targetContextHeader(
    ctx,
    "관계망 분석",
    "선택한 대상을 중심으로 인물·기업·사건·국가 등 Neo4j 관계망을 조회합니다.",
  );
  if(!targetId){
    return `
      <div class="drug-network-page">
        ${header}
        <div class="profile-loading">연결된 대상 ID가 없어 관계망을 조회할 수 없습니다. 대상에 기업/인물 ID를 연결해 주세요.</div>
      </div>
    `;
  }
  return `
    <div class="drug-network-page">
      ${header}
      <div class="profile-net-right" style="height:auto;min-height:620px">
        ${networkGraphPanelHtml(targetType, targetId, "관계망 그래프")}
      </div>
    </div>
  `;
}

export const networkSubtab = {
  id: "network",
  label: "관계망 분석",
  enabledWhen: context => !!context.case,
  aiServices: ["network", "route_analysis"],
  render: renderNetworkPanel,
};
