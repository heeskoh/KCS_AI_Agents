import { escapeHtml } from "../core/dom.js";
import {
  AGENT_SERVICE_DEFINITIONS,
  collectSubtabAgentRequirements,
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

export function scenarioBuilderPage({ config, isSuperAdmin, activeView = "subtabs", selectedPage = "", showNewForm = false, newDraft = {} }){
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
      <div style="display:flex;align-items:flex-start;gap:16px;justify-content:space-between;margin-bottom:18px">
        <div>
          <h2 style="margin:0 0 6px">업무시나리오 구성</h2>
          <p class="muted" style="margin:0">전문업무분석 버튼, 업무분석별 서브탭, AI 서비스 기본 옵션을 구성합니다.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn secondary" type="button" data-scenario-builder-reset>기본값 복원</button>
          <button class="btn" type="button" data-scenario-builder-save>설정 저장</button>
        </div>
      </div>

      <div class="summary-box" style="margin-bottom:16px">
        <b>1차 구현 범위</b>
        <p class="muted" style="margin:6px 0 0">저장된 설정은 다음 단계에서 업무분석 렌더링에 연결됩니다. 현재 기존 화면 동작은 변경되지 않습니다.</p>
      </div>

      ${scenarioBuilderViewTabs(activeView)}

      <div style="display:flex;flex-direction:column;gap:16px">
        ${activeView === "services" ? agentDefaultsSection(config) : `
          ${analysisScenarioPoolSection(config, selectedPage, showNewForm, newDraft)}
        `}
      </div>
    </section>
  `;
}

function scenarioBuilderViewTabs(activeView){
  const views = [
    ["subtabs", "업무분석별 서브탭 구성"],
    ["services", "AI 서비스 기본 옵션"],
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

/* ── 기존 카드형 (참조용 보존 — 사용 안 함) ──────────────── */
function analysisScenarioSection(config){
  const scenarios = config.analysisScenarios || {};
  const customPages = (config.customAnalysisScenarios || []).map(scenario => scenario.page);
  const pages = [...Object.keys(DEFAULT_ANALYSIS_SCENARIOS), ...customPages]
    .filter((page, index, items) => page && items.indexOf(page) === index);
  return `
    <section class="summary-box">
      <b>업무분석별 서브탭 구성</b>
      <p class="muted" style="margin:4px 0 0">기본 진입 서브탭과 사용할 서브탭을 선택합니다.</p>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:12px">
        ${pages.map(page => scenarioEditorCard(scenarios[page] || DEFAULT_ANALYSIS_SCENARIOS[page])).join("")}
      </div>
    </section>
  `;
}

/* ── Pool 기반 서브탭 구성 UI ────────────────────────────── */
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
    <section class="summary-box">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px">
        <div>
          <b>업무분석별 서브탭 구성</b>
          <p class="muted" style="margin:4px 0 0">업무분석을 선택한 후 서브탭 포함/제외 및 순서를 조정합니다.</p>
        </div>
        <button type="button" class="btn${showNewForm ? " secondary" : ""}" data-sb-new-toggle>
          ${showNewForm ? "✕ 취소" : "+ 신규 업무분석"}
        </button>
      </div>

      ${showNewForm ? newAnalysisPoolForm(newDraft) : ""}

      <div style="display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;min-height:420px">

        <!-- 왼쪽: 업무분석 목록 -->
        <div style="border-right:1px solid var(--line);background:#f8fbff">
          <div style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7f9e;letter-spacing:.04em;background:#f1f5f9;border-bottom:1px solid var(--line)">
            전문업무분석
          </div>
          ${allPages.map(page => {
            const sc = scenarios[page] || DEFAULT_ANALYSIS_SCENARIOS[page] || {};
            const isActive = page === activePage;
            const isC = customPages.includes(page);
            return `
              <div style="position:relative;border-bottom:1px solid var(--line)">
                <button type="button" data-sb-select-page="${escapeHtml(page)}"
                  style="display:block;width:100%;text-align:left;padding:10px 14px 10px ${isC?"32px":"14px"};border:none;cursor:pointer;
                         background:${isActive?"#eef4ff":"transparent"};
                         border-left:3px solid ${isActive?"#1e40af":"transparent"};
                         font-size:13px;font-weight:${isActive?"700":"400"};
                         color:${isActive?"#1e40af":"#41506a"}">
                  ${isC ? `<span style="font-size:10px;background:#7c3aed;color:#fff;border-radius:3px;padding:1px 4px;margin-right:4px">신규</span>` : ""}
                  ${escapeHtml(sc.title || page)}
                </button>
                ${isC ? `
                  <button type="button" data-sb-delete-page="${escapeHtml(page)}"
                    style="position:absolute;right:6px;top:50%;transform:translateY(-50%);
                           background:none;border:none;cursor:pointer;color:#dc2626;font-size:12px;padding:2px 4px"
                    title="삭제">✕</button>` : ""}
              </div>`;
          }).join("")}
        </div>

        <!-- 오른쪽: Pool 편집 -->
        <div style="padding:16px 18px;display:flex;flex-direction:column;gap:16px">
          ${activePage && activeScenario
            ? subtabPoolEditor(activePage, activeScenario, isCustom)
            : `<div class="muted" style="padding:40px;text-align:center">왼쪽에서 업무분석을 선택하세요.</div>`
          }
        </div>
      </div>
    </section>
  `;
}

/* ── 서브탭 Pool 편집 패널 (기존·신규 공통) ─────────────── */
function subtabPoolEditor(page, scenario, isCustom){
  const allSubtabs = SUBTABS_BY_TEMPLATE[scenario.template] || [];
  const enabledIds = scenario.enabledSubtabs || [];
  const enabledSet = new Set(enabledIds);
  const includedSubtabs = enabledIds.map(id => allSubtabs.find(t => t.id === id)).filter(Boolean);
  const excludedSubtabs = allSubtabs.filter(t => !enabledSet.has(t.id));

  return `
    <!-- 기본 진입 탭 -->
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:12px;font-weight:600;color:#41506a;white-space:nowrap">기본 진입 탭</span>
      <select data-sb-default-tab="${escapeHtml(page)}" class="gi-reg-select" style="height:32px;min-width:180px">
        ${includedSubtabs.map(tab => option(tab.id, tabLabel(tab, scenario), scenario.defaultTab)).join("")}
      </select>
      <span class="muted" style="font-size:11px">${escapeHtml(page)} · ${escapeHtml(scenario.template)}
        ${isCustom ? `<span style="background:#7c3aed;color:#fff;border-radius:3px;padding:1px 5px;margin-left:4px;font-size:10px">신규</span>` : ""}
      </span>
    </div>

    <!-- 포함된 서브탭 -->
    <div>
      <div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px">
        포함된 서브탭 <span style="font-weight:400;color:#6b7f9e">(${includedSubtabs.length}개 · 순서 조정 가능)</span>
      </div>
      ${includedSubtabs.length === 0
        ? `<div class="muted" style="font-size:12px;padding:12px;background:#f8fbff;border-radius:7px;border:1px dashed var(--line)">포함된 서브탭이 없습니다. 아래에서 추가하세요.</div>`
        : `<div style="display:flex;flex-direction:column;gap:6px">
            ${includedSubtabs.map((tab, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#eef4ff;border:1px solid #aac7ff;border-radius:8px">
                <span style="width:20px;text-align:center;font-size:11px;font-weight:700;color:#1e40af">${i+1}</span>
                <span style="flex:1;font-size:13px;font-weight:600;color:#1e293b">${escapeHtml(tabLabel(tab, scenario))}</span>
                <span style="font-size:11px;color:#6b7f9e;font-family:monospace">${escapeHtml(tab.id)}</span>
                <div style="display:flex;gap:3px">
                  <button type="button" class="gi-move-btn"
                    data-sb-subtab-move="${escapeHtml(page)}:${escapeHtml(tab.id)}:up"
                    ${i === 0 ? "disabled" : ""}>↑</button>
                  <button type="button" class="gi-move-btn"
                    data-sb-subtab-move="${escapeHtml(page)}:${escapeHtml(tab.id)}:down"
                    ${i === includedSubtabs.length-1 ? "disabled" : ""}>↓</button>
                </div>
                <button type="button" class="btn-inline-action job-remove-action"
                  data-sb-subtab-toggle="${escapeHtml(page)}:${escapeHtml(tab.id)}">제외</button>
              </div>
            `).join("")}
          </div>`
      }
    </div>

    <!-- 미포함 서브탭 -->
    <div>
      <div style="font-size:12px;font-weight:700;color:#6b7f9e;margin-bottom:8px">
        미포함 서브탭 <span style="font-weight:400">(${excludedSubtabs.length}개)</span>
      </div>
      ${excludedSubtabs.length === 0
        ? `<div class="muted" style="font-size:12px;padding:12px;background:#f8fbff;border-radius:7px;border:1px dashed var(--line)">모든 서브탭이 포함되어 있습니다.</div>`
        : `<div style="display:flex;flex-direction:column;gap:6px">
            ${excludedSubtabs.map(tab => `
              <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#fff;border:1px solid var(--line);border-radius:8px;opacity:.75">
                <span style="flex:1;font-size:13px;color:#41506a">${escapeHtml(tabLabel(tab, scenario))}</span>
                <span style="font-size:11px;color:#94a3b8;font-family:monospace">${escapeHtml(tab.id)}</span>
                <button type="button" class="btn-inline-action"
                  data-sb-subtab-toggle="${escapeHtml(page)}:${escapeHtml(tab.id)}">+ 추가</button>
              </div>
            `).join("")}
          </div>`
      }
    </div>
  `;
}

/* ── 신규 업무분석 등록 폼 ──────────────────────────────── */
function newAnalysisPoolForm(draft){
  const template = draft.template || "special-investigation";
  const allSubtabs = SUBTABS_BY_TEMPLATE[template] || [];
  const enabledSet = new Set(draft.enabledSubtabs || []);
  const enabledIds = (draft.enabledSubtabs || []).filter(id => allSubtabs.some(t => t.id === id));
  const includedSubtabs = enabledIds.map(id => allSubtabs.find(t => t.id === id)).filter(Boolean);
  const excludedSubtabs = allSubtabs.filter(t => !enabledSet.has(t.id));
  const fakeSc = { page: draft.page || "", template, defaultTab: draft.defaultTab || "" };

  return `
    <div style="border:2px solid #7c3aed;border-radius:10px;padding:18px;background:#faf5ff;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:14px">신규 업무분석 등록</div>

      <!-- 기본 정보 -->
      <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:10px;margin-bottom:14px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
            Key <span style="color:var(--red)">*</span>
            <span style="font-weight:400;color:#94a3b8"> (영문·숫자·_·-)</span>
          </label>
          <input class="form-input" data-sb-new-key style="height:34px;width:100%;box-sizing:border-box"
            value="${escapeHtml(draft.page || "")}" placeholder="예: auditcase">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
            제목 <span style="color:var(--red)">*</span>
          </label>
          <input class="form-input" data-sb-new-title style="height:34px;width:100%;box-sizing:border-box"
            value="${escapeHtml(draft.title || "")}" placeholder="화면에 표시될 업무분석 명칭">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
            템플릿 <span style="color:var(--red)">*</span>
          </label>
          <select class="gi-reg-select" data-sb-new-template style="height:34px;width:100%">
            ${ANALYSIS_TEMPLATE_OPTIONS.map(item =>
              option(item.id, item.label, template)
            ).join("")}
          </select>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">설명</label>
        <textarea class="gi-wb2-textarea" data-sb-new-desc rows="2"
          style="width:100%;box-sizing:border-box" placeholder="업무분석 설명 (선택)">${escapeHtml(draft.description || "")}</textarea>
      </div>

      <!-- 서브탭 Pool -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

        <!-- 포함 목록 -->
        <div>
          <div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px">
            포함된 서브탭 <span style="font-weight:400;color:#6b7f9e">(${includedSubtabs.length}개)</span>
          </div>
          ${includedSubtabs.length === 0
            ? `<div class="muted" style="font-size:12px;padding:10px;background:#f8fbff;border-radius:7px;border:1px dashed var(--line)">오른쪽에서 서브탭을 추가하세요.</div>`
            : `<div style="display:flex;flex-direction:column;gap:5px">
                ${includedSubtabs.map((tab, i) => `
                  <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:#ede9fe;border:1px solid #c4b5fd;border-radius:7px">
                    <span style="width:18px;font-size:11px;font-weight:700;color:#7c3aed">${i+1}</span>
                    <span style="flex:1;font-size:12px;font-weight:600;color:#1e293b">${escapeHtml(tabLabel(tab, fakeSc))}</span>
                    <div style="display:flex;gap:2px">
                      <button type="button" class="gi-move-btn"
                        data-sb-new-subtab-move="${escapeHtml(tab.id)}:up" ${i===0?"disabled":""}>↑</button>
                      <button type="button" class="gi-move-btn"
                        data-sb-new-subtab-move="${escapeHtml(tab.id)}:down" ${i===includedSubtabs.length-1?"disabled":""}>↓</button>
                    </div>
                    <button type="button" class="btn-inline-action job-remove-action"
                      data-sb-new-subtab-toggle="${escapeHtml(tab.id)}">제외</button>
                  </div>
                `).join("")}
              </div>`
          }
        </div>

        <!-- 미포함 목록 -->
        <div>
          <div style="font-size:12px;font-weight:700;color:#6b7f9e;margin-bottom:6px">
            미포함 서브탭 <span style="font-weight:400">(${excludedSubtabs.length}개)</span>
          </div>
          ${excludedSubtabs.length === 0
            ? `<div class="muted" style="font-size:12px;padding:10px;background:#f8fbff;border-radius:7px;border:1px dashed var(--line)">모든 서브탭이 포함되었습니다.</div>`
            : `<div style="display:flex;flex-direction:column;gap:5px">
                ${excludedSubtabs.map(tab => `
                  <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:7px">
                    <span style="flex:1;font-size:12px;color:#41506a">${escapeHtml(tabLabel(tab, fakeSc))}</span>
                    <button type="button" class="btn-inline-action"
                      data-sb-new-subtab-toggle="${escapeHtml(tab.id)}">+ 추가</button>
                  </div>
                `).join("")}
              </div>`
          }
        </div>
      </div>

      <!-- 기본 진입 탭 + 저장/취소 -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:#41506a;white-space:nowrap">기본 진입 탭</span>
        <select data-sb-new-default-tab class="gi-reg-select" style="height:32px;min-width:160px" ${includedSubtabs.length===0?"disabled":""}>
          ${includedSubtabs.map(tab => option(tab.id, tabLabel(tab, fakeSc), draft.defaultTab || includedSubtabs[0]?.id)).join("")}
        </select>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button type="button" class="btn" data-sb-new-save>저장</button>
          <button type="button" class="btn secondary" data-sb-new-cancel>취소</button>
        </div>
      </div>
    </div>
  `;
}

function scenarioEditorCard(scenario){
  const subtabs = SUBTABS_BY_TEMPLATE[scenario.template] || [];
  const enabled = new Set(scenario.enabledSubtabs || []);
  return `
    <article style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fff" data-scenario-builder-analysis="${escapeHtml(scenario.page)}">
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:12px">
        <div>
          <strong>${escapeHtml(scenario.title)}</strong>
          <p class="muted" style="margin:3px 0 0;font-size:12px">${escapeHtml(scenario.page)} · ${escapeHtml(scenario.template)}</p>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#41506a">
          기본 진입
          <select class="gi-reg-select" style="height:30px" data-scenario-default-tab="${escapeHtml(scenario.page)}">
            ${subtabs.map(tab => option(tab.id, tabLabel(tab, scenario), scenario.defaultTab)).join("")}
          </select>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        ${subtabs.map(tab => `
          <label style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:#f8fbff;font-size:12px">
            <input type="checkbox" data-scenario-subtab="${escapeHtml(scenario.page)}:${escapeHtml(tab.id)}" ${enabled.has(tab.id) ? "checked" : ""}>
            <span>${escapeHtml(tabLabel(tab, scenario))}</span>
          </label>
        `).join("")}
      </div>
    </article>
  `;
}

/* ─────────────────────────────────────────────────────────────
   AI 서비스 기본 옵션 탭
   - 카테고리별(DB / AI 서비스 / RAG) 그룹핑
   - 서비스별 사용처(서브탭) 배지 표시
   - data-agent-* 속성명 유지 → 기존 저장 로직 호환
   ───────────────────────────────────────────────────────────── */
function agentDefaultsSection(config){
  const allSubtabs = [
    ...CUSTOMS_SUBTABS,
    ...GENERAL_INVESTIGATION_SUBTABS,
    ...SPECIAL_INVESTIGATION_SUBTABS,
  ];

  // serviceId → 사용하는 서브탭 목록 매핑
  const usageMap = buildServiceUsageMap(allSubtabs);

  // 실제 서브탭에서 사용 중인 서비스만, 중복 없이
  const usedServiceIds = [...new Set(
    allSubtabs.flatMap(st => st.aiServices || [])
  )].filter(id => AGENT_SERVICE_DEFINITIONS[id]);

  // 카테고리별 그룹핑 + 라벨 가나다순 정렬
  const CATEGORY_META = {
    db:    { label:"DB 조회",    color:"#1e40af", bg:"#eef4ff" },
    rag:   { label:"RAG 검색",   color:"#16a34a", bg:"#f0fdf4" },
    agent: { label:"AI 서비스",  color:"#7c3aed", bg:"#faf5ff" },
  };
  const groups = {};
  for(const serviceId of usedServiceIds){
    const def  = AGENT_SERVICE_DEFINITIONS[serviceId] || {};
    const cat  = def.category || "agent";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(serviceId);
  }
  Object.values(groups).forEach(arr =>
    arr.sort((a, b) => agentLabel(a).localeCompare(agentLabel(b), "ko"))
  );

  const categoryOrder = ["db", "rag", "agent"];

  return `
    <section class="summary-box" style="max-height:calc(100vh - 190px);overflow:auto">
      <div style="position:sticky;top:0;background:inherit;padding-bottom:10px;z-index:1;border-bottom:1px solid var(--line);margin-bottom:14px">
        <b>AI 서비스 기본 옵션</b>
        <p class="muted" style="margin:4px 0 0">서브탭에서 활용 중인 AI 서비스의 기본 동작과 지시문을 설정합니다.
          총 <strong>${usedServiceIds.length}</strong>개 서비스</p>
      </div>

      ${categoryOrder.filter(cat => groups[cat]?.length).map(cat => {
        const meta = CATEGORY_META[cat];
        return `
          <div style="margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="display:inline-block;padding:3px 10px;border-radius:999px;
                           font-size:11px;font-weight:700;letter-spacing:.04em;
                           background:${meta.bg};color:${meta.color}">
                ${escapeHtml(meta.label)}
              </span>
              <span class="muted" style="font-size:12px">${groups[cat].length}개</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">
              ${groups[cat].map(serviceId =>
                serviceCard(serviceId, config.agentOptionDefaults?.[serviceId] || {}, usageMap[serviceId] || [], meta)
              ).join("")}
            </div>
          </div>`;
      }).join("")}
    </section>
  `;
}

/* 서비스 → 사용 서브탭 목록 매핑 빌드 */
function buildServiceUsageMap(allSubtabs){
  const map = {};
  for(const subtab of allSubtabs){
    for(const svcId of subtab.aiServices || []){
      if(!map[svcId]) map[svcId] = [];
      // 서브탭 레이블은 id로 표시 (간결하게)
      if(!map[svcId].includes(subtab.id)) map[svcId].push(subtab.id);
    }
  }
  return map;
}

/* 서비스 카드 — data-agent-* 속성명은 변경 금지 (저장 로직 호환) */
function serviceCard(serviceId, defaults, usedInSubtabs, catMeta){
  const definition = AGENT_SERVICE_DEFINITIONS[serviceId] || {};
  const agentId    = definition.agentId || serviceId;
  const isEnabled  = defaults.enabled !== false;

  // 사용처 배지 (최대 4개 + 나머지 수)
  const visibleSubtabs = usedInSubtabs.slice(0, 4);
  const extraCount     = usedInSubtabs.length - visibleSubtabs.length;
  const usageBadges = visibleSubtabs.map(id =>
    `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0">${escapeHtml(id)}</span>`
  ).join("") + (extraCount > 0
    ? `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:#f1f5f9;color:#94a3b8">+${extraCount}</span>`
    : "");

  return `
    <article style="border:1px solid var(--line);border-radius:8px;padding:12px 14px;background:#fff;
                    ${!isEnabled ? "opacity:.6" : ""}"
             data-agent-default="${escapeHtml(serviceId)}">

      <!-- 헤더: 서비스명 + 활성화 토글 -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <strong style="font-size:13px;color:#1e293b">${escapeHtml(definition.label || serviceId)}</strong>
          </div>
          <div style="font-size:11px;color:#94a3b8;font-family:monospace">
            serviceId: ${escapeHtml(serviceId)}
            <span style="margin:0 4px;color:#cbd5e1">→</span>
            agentId: ${escapeHtml(agentId)}
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#41506a;cursor:pointer;white-space:nowrap;flex-shrink:0">
          <input type="checkbox" data-agent-enabled="${escapeHtml(serviceId)}" ${isEnabled ? "checked" : ""}>
          사용
        </label>
      </div>

      <!-- 사용처 배지 -->
      ${usedInSubtabs.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;align-items:center">
          <span style="font-size:10px;color:#94a3b8;margin-right:2px">사용처</span>
          ${usageBadges}
        </div>` : ""}

      <!-- 기본 동작 -->
      <label style="display:block;font-size:12px;color:#41506a;margin-bottom:8px">
        기본 동작
        <input class="form-input" style="width:100%;height:30px;margin-top:4px;box-sizing:border-box"
          data-agent-behavior="${escapeHtml(serviceId)}"
          value="${escapeHtml(defaults.behavior || "")}"
          placeholder="예: risk_signal">
      </label>

      <!-- 기본 지시문 -->
      <label style="display:block;font-size:12px;color:#41506a">
        기본 지시문
        <textarea class="gi-wb2-textarea" rows="2"
          style="width:100%;box-sizing:border-box;margin-top:4px;resize:vertical"
          data-agent-instruction="${escapeHtml(serviceId)}"
          placeholder="이 서비스 실행 시 기본 지시문">${escapeHtml(defaults.instruction || "")}</textarea>
      </label>
    </article>
  `;
}

function newAnalysisForm(){
  return `
    <section class="summary-box">
      <b>?좉퇋 ?낅Т遺꾩꽍 異붽?</b>
      <p class="muted" style="margin:4px 0 12px">湲곗〈 ?쒗뵆由우쓣 議고빀?댁꽌 ?꾨Ц?낅Т遺꾩꽍 踰꾪듉怨??붾㈃???앹꽦?⑸땲??</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:10px">
        <label style="display:block;font-size:12px;color:#41506a">
          key
          <input class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px" data-custom-analysis-key placeholder="ex) auditcase">
        </label>
        <label style="display:block;font-size:12px;color:#41506a">
          title
          <input class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px" data-custom-analysis-title placeholder="?붾㈃ ?쒕ぉ">
        </label>
        <label style="display:block;font-size:12px;color:#41506a">
          template
          <select class="gi-reg-select" style="width:100%;height:34px;margin-top:4px" data-custom-analysis-template>
            ${ANALYSIS_TEMPLATE_OPTIONS.map(item => option(item.id, item.label, "special-investigation")).join("")}
          </select>
        </label>
      </div>
      <label style="display:block;font-size:12px;color:#41506a;margin-bottom:10px">
        description
        <textarea class="gi-wb2-textarea" rows="2" style="width:100%;box-sizing:border-box;margin-top:4px" data-custom-analysis-description placeholder="?낅Т遺꾩꽍 ?ㅻ챸"></textarea>
      </label>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
        ${ANALYSIS_TEMPLATE_OPTIONS.map(item => customTemplateSubtabs(item.id)).join("")}
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn" type="button" data-custom-analysis-add>異붽?</button>
      </div>
    </section>
  `;
  return `
    <section class="summary-box">
      <b>신규 업무분석 추가</b>
      <p class="muted" style="margin:4px 0 12px">다음 단계에서 설정 기반 registry 확장으로 연결됩니다.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
        <input class="form-input" disabled placeholder="업무분석 key">
        <input class="form-input" disabled placeholder="화면 제목">
        <select class="gi-reg-select" disabled>
          <option>customs 템플릿</option>
          <option>general-investigation 템플릿</option>
          <option>special-investigation 템플릿</option>
        </select>
        <button class="btn secondary" type="button" disabled>추가 준비중</button>
      </div>
    </section>
  `;
}

function customTemplateSubtabs(template){
  const subtabs = SUBTABS_BY_TEMPLATE[template] || [];
  const fallback = Object.values(DEFAULT_ANALYSIS_SCENARIOS).find(scenario => scenario.template === template);
  return `
    <article style="border:1px solid var(--line);border-radius:8px;padding:12px;background:#fff" data-custom-template-tabs="${escapeHtml(template)}">
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:10px">
        <strong style="font-size:13px">${escapeHtml(template)}</strong>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#41506a">
          湲곕낯 吏꾩엯
          <select class="gi-reg-select" style="height:30px" data-custom-analysis-default-tab="${escapeHtml(template)}">
            ${subtabs.map(tab => option(tab.id, tabLabel(tab, fallback || { page:"", template }), fallback?.defaultTab || subtabs[0]?.id)).join("")}
          </select>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        ${subtabs.map(tab => `
          <label style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:#f8fbff;font-size:12px">
            <input type="checkbox" data-custom-analysis-subtab="${escapeHtml(template)}:${escapeHtml(tab.id)}" checked>
            <span>${escapeHtml(tabLabel(tab, fallback || { page:"", template }))}</span>
          </label>
        `).join("")}
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
