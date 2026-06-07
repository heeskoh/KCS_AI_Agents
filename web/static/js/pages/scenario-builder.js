import { escapeHtml } from "../core/dom.js";
import {
  AGENT_SERVICE_DEFINITIONS,
  AI_SERVICE_CATALOG,
  collectSubtabAgentRequirements,
  getServiceBehaviorOptions,
  getServiceDefaultInstruction,
} from "../analysis/shared/agent-metadata.js";
import {
  ANALYSIS_TEMPLATE_OPTIONS,
  DEFAULT_ANALYSIS_SCENARIOS,
} from "../analysis/shared/scenario-builder-config.js";
import { CUSTOMS_SUBTABS } from "../analysis/customs/tabs.js";
import { GENERAL_INVESTIGATION_SUBTABS } from "../analysis/general-investigation/tabs.js";
import { SPECIAL_INVESTIGATION_SUBTABS } from "../analysis/special-investigation/tabs.js";

const SUBTABS_BY_TEMPLATE = {
  customs: CUSTOMS_SUBTABS,
  "general-investigation": GENERAL_INVESTIGATION_SUBTABS,
  "special-investigation": SPECIAL_INVESTIGATION_SUBTABS,
};

export function scenarioBuilderPage({ config, isSuperAdmin, activeView = "subtabs", selectedPage = "", showNewForm = false, newDraft = {}, editingServiceId = null }){
  if(!isSuperAdmin()){
    return `
      <section class="card" style="text-align:center;padding:56px 20px">
        <h2>업무시나리오 구성</h2>
        <p class="muted">Super 관리자만 접근할 수 있습니다.</p>
      </section>
    `;
  }

  return `
    <section class="card scenario-builder-page">
      <!-- 페이지 헤더 -->
      <div style="margin-bottom:16px">
        <h2 style="margin:0 0 4px">업무시나리오 구성</h2>
        <p class="muted" style="margin:0">전문업무분석 버튼, 업무분석별 서브탭, AI 서비스 기본 옵션을 구성합니다.</p>
      </div>


${scenarioBuilderViewTabs(activeView)}

      <div>
        ${activeView === "services" ? agentDefaultsSection(config, editingServiceId) :
          analysisScenarioPoolSection(config, selectedPage, showNewForm, newDraft)
        }
      </div>
    </section>
  `;
}

function scenarioBuilderViewTabs(activeView){
  const views = [
    ["subtabs", "업무분석별 서브탭 구성"],
    ["services", "AI 서비스 설정"],
  ];
  return `
    <div class="gi-tab-nav" style="margin-bottom:16px">
      ${views.map(([view, label]) => `
        <button class="gi-tab${activeView === view ? " active" : ""}" type="button" data-scenario-builder-view="${escapeHtml(view)}">
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
   3열 Pool UI: [업무분석 목록] | [서브탭 편집] | [추가 서브탭 풀]
   ═══════════════════════════════════════════════════════════ */
function analysisScenarioPoolSection(config, selectedPage, showNewForm, newDraft){
  const scenarios = config.analysisScenarios || {};
  const builtinPages = Object.keys(DEFAULT_ANALYSIS_SCENARIOS);
  const customPages = (config.customAnalysisScenarios || []).map(sc => sc.page);
  const allPages = [...builtinPages, ...customPages]
    .filter((page, index, items) => page && items.indexOf(page) === index);

  const activePage = allPages.includes(selectedPage) ? selectedPage : allPages[0] || "";
  const activeScenario = scenarios[activePage] || DEFAULT_ANALYSIS_SCENARIOS[activePage] || null;
  const isCustom = customPages.includes(activePage);

  return `
    <section class="summary-box" style="padding:0;overflow:visible">

      <!-- 섹션 헤더 + 신규 버튼 -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;
                  padding:14px 18px;border-bottom:1px solid var(--line)">
        <div>
          <b>업무분석별 서브탭 구성</b>
          <p class="muted" style="margin:3px 0 0;font-size:12px">업무분석을 선택한 후 서브탭 포함/제외 및 순서를 조정합니다.</p>
        </div>
        <button type="button" class="btn${showNewForm ? " secondary" : ""}" data-sb-new-toggle>
          ${showNewForm ? "✕ 취소" : "+ 신규 업무분석"}
        </button>
      </div>

      <!-- 2열 비율 레이아웃: 70% (왼쪽 영역) | 30% (서브탭 Pool) -->
      <div style="display:grid;grid-template-columns:7fr 3fr;min-height:480px">

        <!-- ① 왼쪽 70%: 신규 폼 또는 (업무분석 목록 + 서브탭 편집) -->
        <div style="border-right:1px solid var(--line);display:grid;
                    grid-template-columns:${showNewForm ? "1fr" : "minmax(120px,15%) 1fr"}">

          ${showNewForm ? `
            <!-- 신규 업무분석 등록 폼 (70% 전체 사용) -->
            <div style="padding:18px 20px">
              ${newAnalysisPoolForm(newDraft)}
            </div>
          ` : `
            <!-- 업무분석 목록 (15%) -->
            <div style="border-right:1px solid var(--line);background:#f8fbff">
              <div style="padding:8px 12px;font-size:11px;font-weight:700;color:#6b7f9e;
                          letter-spacing:.04em;background:#f1f5f9;border-bottom:1px solid var(--line)">
                전문업무분석
              </div>
              ${allPages.map(page => {
                const sc = scenarios[page] || DEFAULT_ANALYSIS_SCENARIOS[page] || {};
                const isActive = page === activePage;
                const isC = customPages.includes(page);
                return `
                  <div style="position:relative;border-bottom:1px solid var(--line)">
                    <button type="button" data-sb-select-page="${escapeHtml(page)}"
                      style="display:block;width:100%;text-align:left;
                             padding:10px 28px 10px 14px;
                             border:none;border-left:3px solid ${isActive?"#1e40af":"transparent"};
                             cursor:pointer;background:${isActive?"#eef4ff":"transparent"};
                             font-size:13px;font-weight:${isActive?"700":"400"};
                             color:${isActive?"#1e40af":"#41506a"}">
                      ${isC ? `<span style="font-size:10px;background:#7c3aed;color:#fff;
                                  border-radius:3px;padding:1px 4px;margin-right:4px">신규</span>` : ""}
                      ${escapeHtml(sc.title || page)}
                    </button>
                    ${isC ? `
                      <button type="button" data-sb-delete-page="${escapeHtml(page)}"
                        style="position:absolute;right:6px;top:50%;transform:translateY(-50%);
                               background:none;border:none;cursor:pointer;
                               color:#dc2626;font-size:12px;padding:2px 4px"
                        title="삭제">✕</button>` : ""}
                  </div>`;
              }).join("")}
            </div>

            <!-- 서브탭 편집 (나머지) -->
            <div style="padding:16px 18px;display:flex;flex-direction:column;gap:14px">
              ${activePage && activeScenario
                ? subtabPoolEditor(activePage, activeScenario, isCustom)
                : `<div class="muted" style="padding:40px;text-align:center">
                     왼쪽에서 업무분석을 선택하세요.
                   </div>`
              }
            </div>
          `}
        </div>

        <!-- ② 오른쪽 30%: 활용 가능한 서브탭 선택 (항상 고정) -->
        <div style="padding:14px 16px;background:#f8fffe">
          ${extraSubtabsPanel(activePage, activeScenario, showNewForm, newDraft)}
        </div>

      </div>
    </section>
  `;
}

/* ── 서브탭 Pool 편집 패널 (미포함 섹션 없음 — Pool 패널에서 확인) ── */
function subtabPoolEditor(page, scenario, isCustom){
  const allSubtabs = SUBTABS_BY_TEMPLATE[scenario.template] || [];
  const enabledIds = scenario.enabledSubtabs || [];
  const includedSubtabs = enabledIds.map(id => allSubtabs.find(t => t.id === id)).filter(Boolean);

  return `
    <!-- 기본 진입 탭 -->
    <div>
      <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:6px">
        기본 진입 탭
      </label>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <select data-sb-default-tab="${escapeHtml(page)}" class="gi-reg-select"
          style="height:32px;flex:1;min-width:160px">
          ${includedSubtabs.map(tab => option(tab.id, tabLabel(tab, scenario), scenario.defaultTab)).join("")}
        </select>
        <span class="muted" style="font-size:11px;font-family:monospace;white-space:nowrap">
          ${escapeHtml(page)} · ${escapeHtml(scenario.template)}
          ${isCustom ? `<span style="background:#7c3aed;color:#fff;border-radius:3px;
                          padding:1px 5px;margin-left:4px;font-size:10px">신규</span>` : ""}
        </span>
      </div>
    </div>

    <!-- 포함된 서브탭 -->
    <div style="flex:1">
      <div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:6px">
        포함된 서브탭
        <span style="font-weight:400;color:#6b7f9e">(${includedSubtabs.length}개 · 순서 조정 가능)</span>
      </div>
      ${includedSubtabs.length === 0
        ? `<div class="muted" style="font-size:12px;padding:10px;background:#f8fbff;
                border-radius:7px;border:1px dashed var(--line);text-align:center">
             포함된 서브탭이 없습니다. 아래에서 추가하세요.
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:4px">
            ${includedSubtabs.map((tab, i) => `
              <div style="display:flex;align-items:center;gap:6px;
                          padding:7px 10px;background:#eef4ff;
                          border:1px solid #aac7ff;border-radius:7px">
                <span style="width:18px;text-align:center;font-size:11px;
                             font-weight:700;color:#1e40af;flex-shrink:0">${i+1}</span>
                <span style="flex:1;font-size:13px;color:#1e293b;min-width:0;
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${escapeHtml(tabLabel(tab, scenario))}
                </span>
                <span style="font-size:10px;color:#94a3b8;font-family:monospace;
                             flex-shrink:0">${escapeHtml(tab.id)}</span>
                <div style="display:flex;gap:2px;flex-shrink:0">
                  <button type="button" class="gi-move-btn"
                    data-sb-subtab-move="${escapeHtml(page)}:${escapeHtml(tab.id)}:up"
                    ${i === 0 ? "disabled" : ""}>↑</button>
                  <button type="button" class="gi-move-btn"
                    data-sb-subtab-move="${escapeHtml(page)}:${escapeHtml(tab.id)}:down"
                    ${i === includedSubtabs.length-1 ? "disabled" : ""}>↓</button>
                </div>
                <button type="button" class="btn-inline-action job-remove-action"
                  style="font-size:11px;flex-shrink:0"
                  data-sb-subtab-toggle="${escapeHtml(page)}:${escapeHtml(tab.id)}">제외</button>
              </div>
            `).join("")}
          </div>`
      }
    </div>

    <!-- 하단 액션 버튼 -->
    <div style="display:flex;justify-content:flex-end;gap:8px;
                padding-top:12px;border-top:1px solid var(--line);margin-top:auto">
      <button class="btn secondary" type="button" data-scenario-builder-reset>기본값 복원</button>
      <button class="btn" type="button" data-scenario-builder-save>설정 저장</button>
    </div>
  `;
}

/* ── 오른쪽: 활용 가능한 서브탭 선택 패널 ────────────────── */
/* ── 오른쪽 30%: 활용 가능한 서브탭 선택 Panel ──────────────
   - 하드코딩 제거 — SUBTABS_BY_TEMPLATE 에서 실제 구현된 서브탭 읽음
   - 신규 폼 모드: sbNewDraft.enabledSubtabs 에 없는 것 표시
                   클릭 → data-sb-new-subtab-toggle
   - 편집 모드: scenario.enabledSubtabs 에 없는 것 표시
                클릭 → data-sb-subtab-toggle
   ─────────────────────────────────────────────────────────── */
function extraSubtabsPanel(page, scenario, showNewForm, newDraft){
  let excludedSubtabs = [];
  let dataAttr = "";          // 클릭 이벤트 속성 키
  let fakeSc   = {};

  if(showNewForm && newDraft){
    // 신규 폼 모드: fixed template pool 에서 미포함 서브탭
    const FIXED_TEMPLATE = "special-investigation";
    const allSubtabs = SUBTABS_BY_TEMPLATE[FIXED_TEMPLATE] || [];
    const enabledSet = new Set(newDraft.enabledSubtabs || []);
    excludedSubtabs  = allSubtabs.filter(t => !enabledSet.has(t.id));
    fakeSc = { page: newDraft.page || "", template: FIXED_TEMPLATE };
    dataAttr = "data-sb-new-subtab-toggle";
  } else if(scenario){
    // 편집 모드: 선택된 업무분석 template pool 에서 미포함 서브탭
    const allSubtabs = SUBTABS_BY_TEMPLATE[scenario.template] || [];
    const enabledSet = new Set(scenario.enabledSubtabs || []);
    excludedSubtabs  = allSubtabs.filter(t => !enabledSet.has(t.id));
    fakeSc = scenario;
    dataAttr = `data-sb-subtab-toggle-prefix`; // page:tabId 형식 — 아래에서 조합
  } else {
    return `<div class="muted" style="font-size:12px;padding:20px 0;text-align:center">
              업무분석을 선택하면 서브탭 목록이 표시됩니다.
            </div>`;
  }

  return `
    <div style="font-size:12px;font-weight:700;color:#0f766e;margin-bottom:6px">
      활용 가능한 서브탭 선택
    </div>
    <p class="muted" style="font-size:11px;margin:0 0 10px;line-height:1.5">
      서브탭을 선택하여 전문 업무 분석 기능을 구성합니다.
    </p>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${excludedSubtabs.length === 0
        ? `<div style="font-size:12px;color:#94a3b8;padding:10px 0;text-align:center">
             모든 서브탭이 포함되었습니다.
           </div>`
        : excludedSubtabs.map(tab => {
            const label = escapeHtml(tabLabel(tab, fakeSc));
            // 신규 폼: data-sb-new-subtab-toggle="tabId"
            // 편집:   data-sb-subtab-toggle="page:tabId"
            const btnAttr = showNewForm
              ? `data-sb-new-subtab-toggle="${escapeHtml(tab.id)}"`
              : `data-sb-subtab-toggle="${escapeHtml(page)}:${escapeHtml(tab.id)}"`;
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;
                          gap:8px;padding:9px 12px;background:#f0fdf4;
                          border:1px solid #86efac;border-radius:8px">
                <span style="font-size:12px;font-weight:600;color:#14532d;
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${label}
                </span>
                <button type="button"
                  style="padding:3px 10px;background:#16a34a;color:#fff;border:none;
                         border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;
                         white-space:nowrap;flex-shrink:0"
                  ${btnAttr}>추가</button>
              </div>`;
          }).join("")
      }
    </div>
  `;
}

/* ── 신규 업무분석 등록 폼 ──────────────────────────────────
   - 템플릿 selector 없음 (special-investigation 내부 고정)
   - 포함 서브탭(왼쪽) / 미포함 서브탭(오른쪽) 2열 Pool
   - ongoing 은 필수 — 제외 불가
   - 모든 버튼 white-space:nowrap
   ─────────────────────────────────────────────────────────── */
function newAnalysisPoolForm(draft){
  // 템플릿 고정: special-investigation
  const FIXED_TEMPLATE = "special-investigation";
  const allSubtabs = SUBTABS_BY_TEMPLATE[FIXED_TEMPLATE] || [];
  const enabledSet  = new Set(draft.enabledSubtabs || []);
  const enabledIds  = (draft.enabledSubtabs || []).filter(id => allSubtabs.some(t => t.id === id));
  const includedSubtabs = enabledIds.map(id => allSubtabs.find(t => t.id === id)).filter(Boolean);
  // excludedSubtabs는 오른쪽 Pool(extraSubtabsPanel)에서 처리 — 여기서 불필요
  const fakeSc = { page: draft.page || "", template: FIXED_TEMPLATE, defaultTab: draft.defaultTab || "" };

  return `
    <div style="border:2px solid #7c3aed;border-radius:10px;padding:16px 18px;background:#faf5ff">

      <!-- 헤더 -->
      <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:14px;
                  padding-bottom:10px;border-bottom:1px solid #e9d5ff">
        신규 업무분석 등록
      </div>

      <!-- ① Key / 제목 (2열, 템플릿 없음) -->
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-bottom:10px;align-items:end">
        <div>
          <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
            Key <span style="color:var(--red)">*</span>
            <span style="font-weight:400;color:#94a3b8;font-size:11px"> (영문·숫자·_·-)</span>
          </label>
          <input class="form-input" data-sb-new-key
            style="height:34px;width:100%;box-sizing:border-box"
            value="${escapeHtml(draft.page || "")}" placeholder="예: auditcase">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
            제목 <span style="color:var(--red)">*</span>
          </label>
          <input class="form-input" data-sb-new-title
            style="height:34px;width:100%;box-sizing:border-box"
            value="${escapeHtml(draft.title || "")}" placeholder="화면에 표시될 업무분석 명칭">
        </div>
      </div>

      <!-- ② 설명 -->
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">설명</label>
        <textarea class="gi-wb2-textarea" data-sb-new-desc rows="2"
          style="width:100%;box-sizing:border-box;resize:vertical"
          placeholder="업무분석 설명 (선택)">${escapeHtml(draft.description || "")}</textarea>
      </div>

      <!-- ③ 포함된 서브탭 (1열, 미포함은 오른쪽 Pool에서 추가) -->
      <div style="background:#fff;border:1px solid #e9d5ff;border-radius:8px;
                  padding:10px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:8px">
          포함된 서브탭
          <span style="font-weight:400;color:#6b7f9e">${includedSubtabs.length}개</span>
          <span style="font-weight:400;color:#94a3b8;font-size:10px;margin-left:6px">
            (오른쪽 Pool에서 추가)
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${includedSubtabs.length === 0
            ? `<div style="font-size:12px;color:#94a3b8;padding:8px 0;text-align:center">
                 오른쪽 서브탭 목록에서 추가하세요.
               </div>`
            : includedSubtabs.map((tab, i) => {
                const isMandatory = tab.id === "ongoing";
                return `
                  <div style="display:flex;align-items:center;gap:5px;padding:6px 8px;
                               background:${isMandatory?"#eff6ff":"#f5f3ff"};
                               border:1px solid ${isMandatory?"#93c5fd":"#ddd6fe"};border-radius:6px">
                    <span style="width:16px;font-size:11px;font-weight:700;flex-shrink:0;
                                 color:${isMandatory?"#1d4ed8":"#7c3aed"};text-align:center">${i+1}</span>
                    <span style="flex:1;font-size:12px;color:#1e293b;min-width:0;
                                 white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      ${escapeHtml(tabLabel(tab, fakeSc))}
                    </span>
                    ${isMandatory
                      ? `<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;
                                      border-radius:4px;padding:1px 6px;
                                      white-space:nowrap;flex-shrink:0">필수</span>`
                      : `<div style="display:flex;gap:2px;flex-shrink:0">
                           <button type="button" class="gi-move-btn"
                             data-sb-new-subtab-move="${escapeHtml(tab.id)}:up"
                             ${i===0?"disabled":""}>↑</button>
                           <button type="button" class="gi-move-btn"
                             data-sb-new-subtab-move="${escapeHtml(tab.id)}:down"
                             ${i===includedSubtabs.length-1?"disabled":""}>↓</button>
                         </div>
                         <button type="button" class="btn-inline-action job-remove-action"
                           style="font-size:11px;padding:2px 8px;white-space:nowrap;flex-shrink:0"
                           data-sb-new-subtab-toggle="${escapeHtml(tab.id)}">제외</button>`
                    }
                  </div>`;
              }).join("")
          }
        </div>
      </div>

      <!-- ④ 기본 진입 탭 + 저장/취소 (한 줄, 줄바꿈 없음) -->
      <div style="display:flex;align-items:center;gap:8px;
                  padding-top:10px;border-top:1px solid #e9d5ff;flex-wrap:nowrap">
        <label style="font-size:12px;font-weight:600;color:#41506a;
                      white-space:nowrap;flex-shrink:0;margin:0">기본 진입 탭</label>
        <select data-sb-new-default-tab class="gi-reg-select"
          style="height:32px;flex:1;min-width:0" ${includedSubtabs.length===0?"disabled":""}>
          ${includedSubtabs.map(tab =>
            option(tab.id, tabLabel(tab, fakeSc), draft.defaultTab || includedSubtabs[0]?.id)
          ).join("")}
        </select>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button type="button" class="btn"
            style="padding:0 16px;height:32px;font-size:12px;white-space:nowrap"
            data-sb-new-save>저장</button>
          <button type="button" class="btn secondary"
            style="padding:0 12px;height:32px;font-size:12px;white-space:nowrap"
            data-sb-new-cancel>취소</button>
        </div>
      </div>

    </div>
  `;
}


/* ─────────────────────────────────────────────────────────────
   AI 서비스 기본 옵션 탭
   - 카테고리별(DB / AI 서비스 / RAG) 그룹핑
   - 서비스별 사용처(서브탭) 배지 표시
   - data-agent-* 속성명 유지 → 기존 저장 로직 호환
   ───────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════
   AI 서비스 설정 탭
   - 카테고리별 그룹 (DB 조회 / RAG 검색 / AI 서비스)
   - 서비스 카드: AI 서비스 단계 select + 동작 선택 체크박스
                  서비스 설명 박스 + 추가 지시 textarea
   - data-agent-* 속성명 유지 (저장 로직 호환)
   ═══════════════════════════════════════════════════════════ */
function agentDefaultsSection(config, editingServiceId = null){
  const allSubtabs = [
    ...CUSTOMS_SUBTABS,
    ...GENERAL_INVESTIGATION_SUBTABS,
    ...SPECIAL_INVESTIGATION_SUBTABS,
  ];

  // serviceId → 사용 서브탭 목록
  const usageMap = buildServiceUsageMap(allSubtabs);

  // 관리자 설정 화면은 현재 시나리오에서 쓰는 서비스만이 아니라,
  // 등록 가능한 전체 AI 서비스 레지스트리를 기준으로 보여준다.
  const usedServiceIds = Object.keys(AGENT_SERVICE_DEFINITIONS)
    .filter(id => AI_SERVICE_CATALOG[id]?.adminVisible !== false);

  const CATEGORY_META = {
    db:       { label:"DB 검색", color:"#ea580c", bg:"#fff7ed", border:"#fed7aa" },
    rag:      { label:"RAG 검색", color:"#16a34a", bg:"#f0fdf4", border:"#86efac" },
    analysis: { label:"업무분석 AI서비스", color:"#7c3aed", bg:"#faf5ff", border:"#ddd6fe" },
    llm:      { label:"파일·요약·번역 LLM 기능 서비스", color:"#ca8a04", bg:"#fefce8", border:"#fde68a" },
    external: { label:"외부연계 AI서비스", color:"#0f766e", bg:"#f0fdfa", border:"#99f6e4" },
    report:   { label:"보고서 생성 및 검증", color:"#2563eb", bg:"#eff6ff", border:"#bfdbfe" },
  };

  const groups = {};
  for(const serviceId of usedServiceIds){
    const cat = AI_SERVICE_CATALOG[serviceId]?.category || "analysis";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(serviceId);
  }
  Object.values(groups).forEach(arr =>
    arr.sort((a, b) => (AI_SERVICE_CATALOG[a]?.label||a).localeCompare(AI_SERVICE_CATALOG[b]?.label||b, "ko"))
  );

  const categoryOrder = ["db", "rag", "analysis", "llm", "external", "report"];

  return `
    <section class="summary-box" style="max-height:calc(100vh - 190px);overflow:auto;padding:0">
      <div style="position:sticky;top:0;background:#fff;padding:14px 18px 10px;z-index:2;
                  border-bottom:1px solid var(--line)">
        <b>AI 서비스 설정</b>
        <p class="muted" style="margin:4px 0 0;font-size:12px">
          서브탭에서 활용 중인 AI 서비스의 기본 동작과 지시문을 설정합니다.
          총 <strong>${usedServiceIds.length}</strong>개 서비스
        </p>
      </div>
      <div style="padding:16px 18px">
        ${categoryOrder.filter(cat => groups[cat]?.length).map(cat => {
          const meta = CATEGORY_META[cat];
          return `
            <div style="margin-bottom:22px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                <span style="display:inline-block;padding:3px 12px;border-radius:999px;
                             font-size:11px;font-weight:700;
                             background:${meta.bg};color:${meta.color};
                             border:1px solid ${meta.border}">
                  ${escapeHtml(meta.label)}
                </span>
                <span class="muted" style="font-size:12px">${groups[cat].length}개</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
                ${groups[cat].map(serviceId =>
                  serviceCard(serviceId, config.agentOptionDefaults?.[serviceId] || {}, usageMap[serviceId] || [], meta, serviceId === editingServiceId)
                ).join("")}
              </div>
            </div>`;
        }).join("")}
      </div>
    </section>
  `;
}

/* 서비스 → 사용 서브탭 목록 매핑 빌드 */
function buildServiceUsageMap(allSubtabs){
  const map = {};
  for(const subtab of allSubtabs){
    for(const svcId of subtab.aiServices || []){
      if(!map[svcId]) map[svcId] = [];
      if(!map[svcId].includes(subtab.id)) map[svcId].push(subtab.id);
    }
  }
  return map;
}

/* ── 서비스 카드 ────────────────────────────────────────────
   동작 선택 구조:
   - allBehaviors = built-in behaviorOptions + customBehaviors (통합 목록)
   - checked = 분석 시나리오에서 default로 사용할 동작
   - 읽기 모드: 통합 체크박스 목록 표시 (checked 상태 포함, 비활성화)
   - 편집 모드: 체크박스 활성화 + 신규 추가 입력
   - 신규 추가 → 체크박스 목록에 동일 스타일로 추가됨
   ─────────────────────────────────────────────────────────── */
function serviceCard(serviceId, defaults, usedInSubtabs, catMeta, isEditing = false){
  const def          = AI_SERVICE_CATALOG[serviceId] || {};
  const behaviors    = getServiceBehaviorOptions(serviceId);            // built-in 목록
  const customBehaviors = Array.isArray(defaults.customBehaviors) ? defaults.customBehaviors : [];
  const instruction  = defaults.instruction || "";
  const defaultInst  = getServiceDefaultInstruction(serviceId);
  const stageCatLabel= catMeta?.label || def.category || "";

  // 저장된 checked 값 (없으면 첫 번째 built-in이 default)
  const savedBehavior  = defaults.behavior || behaviors[0]?.value || "";
  const savedBehaviors = Array.isArray(defaults.behaviors) && defaults.behaviors.length
    ? defaults.behaviors : [savedBehavior];

  // 통합 동작 목록: built-in + 사용자 추가 (value/label 통일)
  const allBehaviors = [
    ...behaviors,
    ...customBehaviors.map(v => ({ value: v, label: v, isCustom: true })),
  ];

  // 체크박스 렌더 헬퍼 (읽기/편집 모드 공용)
  const behaviorCheckbox = (opt, disabled) => `
    <label style="display:flex;align-items:center;gap:5px;font-size:12px;
                  ${disabled ? "cursor:default;opacity:.85" : "cursor:pointer"};white-space:nowrap">
      <input type="checkbox"
        data-agent-behavior-opt="${escapeHtml(serviceId)}:${escapeHtml(opt.value)}"
        ${savedBehaviors.includes(opt.value) ? "checked" : ""}
        ${disabled ? "disabled" : ""}>
      ${escapeHtml(opt.label)}
      ${opt.isCustom && !disabled ? `
        <button type="button"
          style="background:none;border:none;cursor:pointer;color:#94a3b8;
                 font-size:11px;padding:0;margin-left:2px;line-height:1"
          data-agent-remove-behavior="${escapeHtml(serviceId)}:${customBehaviors.indexOf(opt.value)}">✕</button>` : ""}
    </label>`;

  const isEditing_ = isEditing;

  /* ── 공통 섹션 헬퍼 ── */
  const descBox = (bgColor, borderColor) => `
    <div style="background:${bgColor};border:1px solid ${borderColor};
                border-radius:7px;padding:10px 12px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:12px;font-weight:700;color:#1e293b">${escapeHtml(def.label || serviceId)}</span>
        <span style="font-size:10px;background:${catMeta?.bg||"#f1f5f9"};
                     color:${catMeta?.color||"#41506a"};border-radius:3px;padding:1px 6px">
          ${escapeHtml(stageCatLabel)}
        </span>
      </div>
      <p style="margin:0;font-size:12px;color:#41506a;line-height:1.5">${escapeHtml(defaultInst)}</p>
    </div>`;

  /* ── 읽기 모드 ── */
  if(!isEditing_){
    return `
      <article style="border:1px solid var(--line);border-radius:10px;padding:14px;
                      background:#fff;display:flex;flex-direction:column;gap:10px"
               data-agent-default="${escapeHtml(serviceId)}">

        <!-- 헤더 -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;
                    padding-bottom:8px;border-bottom:1px solid var(--line)">
          <strong style="font-size:13px;color:#1e293b">${escapeHtml(def.label || serviceId)}</strong>
          <button type="button"
            style="height:28px;padding:0 12px;background:#f1f5f9;color:#41506a;
                   border:1px solid var(--line);border-radius:6px;font-size:12px;
                   cursor:pointer;white-space:nowrap;flex-shrink:0"
            data-agent-edit="${escapeHtml(serviceId)}">수정</button>
        </div>

        <!-- 동작 선택: 통합 체크박스 목록 (비활성, checked=default) -->
        <div>
          <div style="font-size:12px;font-weight:600;color:#41506a;margin-bottom:6px">
            동작 선택
            <span style="font-weight:400;color:#94a3b8;margin-left:6px;font-size:11px">
              (☑ = 분석 시나리오 기본값)
            </span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 16px">
            ${allBehaviors.map(opt => behaviorCheckbox(opt, true)).join("")}
          </div>
        </div>

        ${descBox("#f8fbff", "var(--line)")}

        ${instruction ? `
          <div>
            <div style="font-size:12px;font-weight:600;color:#41506a;margin-bottom:4px">추가 지시</div>
            <p style="margin:0;font-size:12px;color:#41506a;line-height:1.5;
                      background:#f8fbff;border:1px solid var(--line);border-radius:7px;padding:8px 12px">
              ${escapeHtml(instruction)}
            </p>
          </div>` : ""}

      </article>`;
  }

  /* ── 편집 모드 ── */
  return `
    <article style="border:2px solid #1e40af;border-radius:10px;padding:14px;
                    background:#fff;display:flex;flex-direction:column;gap:10px"
             data-agent-default="${escapeHtml(serviceId)}">

      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;
                  padding-bottom:8px;border-bottom:1px solid #bfdbfe">
        <strong style="font-size:13px;color:#1e293b">${escapeHtml(def.label || serviceId)}</strong>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button type="button"
            style="height:28px;padding:0 14px;background:#1e40af;color:#fff;border:none;
                   border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;font-weight:600"
            data-agent-save="${escapeHtml(serviceId)}">저장</button>
          <button type="button"
            style="height:28px;padding:0 10px;background:#f1f5f9;color:#41506a;
                   border:1px solid var(--line);border-radius:6px;font-size:12px;
                   cursor:pointer;white-space:nowrap"
            data-agent-cancel="${escapeHtml(serviceId)}">취소</button>
        </div>
      </div>

      <!-- 동작 선택: 통합 체크박스 목록 (활성, checked=default) + 추가 입력 -->
      <div>
        <div style="font-size:12px;font-weight:600;color:#41506a;margin-bottom:6px">
          동작 선택
          <span style="font-weight:400;color:#94a3b8;margin-left:6px;font-size:11px">
            체크 = 분석 시나리오 기본값
          </span>
        </div>

        <!-- 통합 체크박스 목록 (built-in + 사용자 추가) -->
        <div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:10px">
          ${allBehaviors.map(opt => behaviorCheckbox(opt, false)).join("")}
        </div>

        <!-- 신규 동작 추가 입력 (체크박스 목록에 추가됨) -->
        <div style="display:flex;gap:6px;align-items:center">
          <input class="form-input"
            id="behaviorInput_${escapeHtml(serviceId)}"
            style="flex:1;height:30px;font-size:12px;box-sizing:border-box"
            placeholder="신규 동작 입력 (예: risk_signal)"
            data-agent-behavior="${escapeHtml(serviceId)}">
          <button type="button"
            style="height:30px;padding:0 12px;background:#1e40af;color:#fff;border:none;
                   border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0"
            data-agent-add-behavior="${escapeHtml(serviceId)}">+ 추가</button>
        </div>
      </div>

      ${descBox("#eff6ff", "#bfdbfe")}

      <!-- 추가 지시 textarea -->
      <div>
        <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
          추가 지시
        </label>
        <textarea class="gi-wb2-textarea" rows="3"
          style="width:100%;box-sizing:border-box;font-size:12px;resize:vertical"
          data-agent-instruction="${escapeHtml(serviceId)}"
          placeholder="${escapeHtml(defaultInst)}"
        >${escapeHtml(instruction)}</textarea>
      </div>

    </article>
  `;
}

function option(value, label, selected){
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function tabLabel(tab, scenario){
  const context = {
    config: {
      profileTab: "프로파일",
      dashboardTab: "위험 대시보드",
      ...(scenario.page === "lawsearch" ? { profileTab:"마약프로파일", dashboardTab:"마약위험 대시보드" } : {}),
      ...(scenario.page === "fxsearch" ? { profileTab:"외환프로파일", dashboardTab:"외환위험 대시보드" } : {}),
    },
  };
  return typeof tab.label === "function" ? tab.label(context) : tab.label;
}

function agentLabel(serviceId){
  return AGENT_SERVICE_DEFINITIONS[serviceId]?.label || serviceId;
}
