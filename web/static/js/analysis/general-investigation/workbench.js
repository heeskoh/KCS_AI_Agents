import { escapeHtml } from "../../core/dom.js";
import { generalInvestigationState } from "./state.js";

/* 수사 분석 시나리오는 단계 순서보다 "사용할 AI 분석서비스 선택"이 중심 —
   서비스 카탈로그에서 켜고 끄면 아래 시나리오 보드에 단계가 추가/제거된다. */
const SERVICE_GROUP_LABELS = { db: "DB 조회", rag: "RAG 검색", report: "보고서·검증", approve: "보고서·검증", agent: "AI 분석 서비스" };
const SERVICE_GROUP_ORDER = ["DB 조회", "AI 분석 서비스", "RAG 검색", "보고서·검증"];

function giServiceCatalogHtml(deps, aCase){
  const sources = deps.getGiStepSources?.() || [];
  // giSteps는 워크벤치 init에서 지연 생성되므로, 카탈로그 렌더 시점에 선초기화
  const steps = (deps.activeGiCaseSteps?.() ?? aCase.giSteps) || [];
  const selectedSourceKeys = new Set(steps.map(step => step.sourceKey || deps.giCommonSourceKey(step.key)));
  const groups = {};
  sources.forEach(source => {
    const groupLabel = SERVICE_GROUP_LABELS[source.type] || "AI 분석 서비스";
    (groups[groupLabel] = groups[groupLabel] || []).push(source);
  });
  const selectedCount = sources.filter(source => selectedSourceKeys.has(source.sourceKey)).length;
  return `
    <div class="gi-svc-catalog">
      <div class="gi-svc-catalog-head">
        <strong>AI 분석서비스 선택</strong>
        <span class="muted">사용할 서비스를 선택하면 시나리오 단계로 추가됩니다 · 선택 ${selectedCount}개 · 실행 순서는 아래 시나리오 보드에서 조정</span>
      </div>
      ${SERVICE_GROUP_ORDER.filter(label => groups[label]?.length).map(label => `
        <div class="gi-svc-group">
          <span class="gi-svc-group-label">${escapeHtml(label)}</span>
          <div class="gi-svc-grid">
            ${groups[label].map(source => {
              const on = selectedSourceKeys.has(source.sourceKey);
              return `
                <button type="button" class="gi-svc-card${on ? " on" : ""}" data-gi-svc-toggle="${escapeHtml(source.key)}">
                  <i>${on ? "✓" : "+"}</i>
                  <span>${escapeHtml(source.label)}</span>
                </button>
              `;
            }).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

export function renderWorkbenchPanel(deps) {
  const aCase = deps.activeGenInvCase();
  if (!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const templateOptionsHtml = deps.giScenarioTemplateOptionsHtml
    ? deps.giScenarioTemplateOptionsHtml(aCase.invTypeId)
    : "";

  return giServiceCatalogHtml(deps, aCase) + deps.sharedScenarioWorkbenchHtml({
    archived: false,
    titleHtml: "조사 및 수사 분석 단계",
    subtitleHtml: "혐의·수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다. 위 카탈로그에서 AI 분석서비스를 선택·해제할 수 있습니다.",
    templateOptionsHtml,
  });
}

export const workbenchSubtab = {
  id:       "workbench",
  label:    "AI서비스 분석 작업",
  enabledWhen: context => !!context.case,
  aiServices: [
    "db_cdw", "declaration_verify", "customs_value", "hs_verify",
    "route_analysis", "network", "proceeds_tracking", "origin_analysis",
    "abnormal_trade", "patent", "law", "report_generate", "report_validate",
  ],
  render: renderWorkbenchPanel,
};
