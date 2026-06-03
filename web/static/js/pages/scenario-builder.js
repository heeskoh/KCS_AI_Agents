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
      <!-- 페이지 헤더 (저장 버튼 제거 — 각 탭 하단으로 이동) -->
      <div style="margin-bottom:16px">
        <h2 style="margin:0 0 4px">업무시나리오 구성</h2>
        <p class="muted" style="margin:0">전문업무분석 버튼, 업무분석별 서브탭, AI 서비스 기본 옵션을 구성합니다.</p>
      </div>

      <div class="summary-box" style="margin-bottom:16px">
        <b>1차 구현 범위</b>
        <p class="muted" style="margin:6px 0 0">저장된 설정은 다음 단계에서 업무분석 렌더링에 연결됩니다. 현재 기존 화면 동작은 변경되지 않습니다.</p>
      </div>

      ${scenarioBuilderViewTabs(activeView)}

      <div>
        ${activeView === "services" ? agentDefaultsSection(config) :
          analysisScenarioPoolSection(config, selectedPage, showNewForm, newDraft)
        }
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

      <!-- 신규 업무분석 등록 폼 -->
      ${showNewForm ? `<div style="padding:16px 18px;border-bottom:1px solid var(--line)">${newAnalysisPoolForm(newDraft)}</div>` : ""}

      <!-- 3열 메인 레이아웃 -->
      <div style="display:grid;grid-template-columns:140px 1fr 220px;min-height:480px">

        <!-- ① 왼쪽: 전문업무분석 목록 -->
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

        <!-- ② 중앙: 서브탭 편집 패널 -->
        <div style="padding:16px 18px;display:flex;flex-direction:column;gap:14px;
                    border-right:1px solid var(--line)">
          ${activePage && activeScenario
            ? subtabPoolEditor(activePage, activeScenario, isCustom)
            : `<div class="muted" style="padding:40px;text-align:center">
                 왼쪽에서 업무분석을 선택하세요.
               </div>`
          }
        </div>

        <!-- ③ 오른쪽: 활용 가능한 서브탭 선택 -->
        <div style="padding:14px 16px;background:#f8fffe">
          ${extraSubtabsPanel(activePage, activeScenario)}
        </div>

      </div>
    </section>
  `;
}

/* ── 서브탭 Pool 편집 패널 ─────────────────────────────── */
function subtabPoolEditor(page, scenario, isCustom){
  const allSubtabs = SUBTABS_BY_TEMPLATE[scenario.template] || [];
  const enabledIds = scenario.enabledSubtabs || [];
  const enabledSet = new Set(enabledIds);
  const includedSubtabs = enabledIds.map(id => allSubtabs.find(t => t.id === id)).filter(Boolean);
  const excludedSubtabs = allSubtabs.filter(t => !enabledSet.has(t.id));

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

    <!-- 미포함 서브탭 -->
    <div>
      <div style="font-size:12px;font-weight:700;color:#6b7f9e;margin-bottom:6px">
        미포함 서브탭
        <span style="font-weight:400">(${excludedSubtabs.length}개)</span>
      </div>
      ${excludedSubtabs.length === 0
        ? `<div class="muted" style="font-size:12px;padding:10px;background:#f8fbff;
                border-radius:7px;border:1px dashed var(--line);text-align:center">
             모든 서브탭이 포함되어 있습니다.
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:4px">
            ${excludedSubtabs.map(tab => `
              <div style="display:flex;align-items:center;gap:6px;
                          padding:7px 10px;background:#fff;
                          border:1px solid var(--line);border-radius:7px">
                <span style="flex:1;font-size:13px;color:#41506a">${escapeHtml(tabLabel(tab, scenario))}</span>
                <span style="font-size:10px;color:#94a3b8;font-family:monospace">${escapeHtml(tab.id)}</span>
                <button type="button" class="btn-inline-action"
                  style="font-size:11px"
                  data-sb-subtab-toggle="${escapeHtml(page)}:${escapeHtml(tab.id)}">+ 추가</button>
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
/* 현재 템플릿 Pool에 없는 '추가 기능 서브탭' 목록을 표시     */
const EXTRA_SUBTABS_BY_TEMPLATE = {
  "customs": [
    { id:"relationship", label:"우범자/기업 관계망 분석" },
    { id:"fund_track",   label:"자금추적(계좌, 가상계좌) 분석" },
    { id:"comms",        label:"통신내역 관계 분석" },
  ],
  "general-investigation": [
    { id:"relationship", label:"우범자/기업 관계망 분석" },
    { id:"fund_track",   label:"자금추적(계좌, 가상계좌) 분석" },
    { id:"comms",        label:"통신내역 관계 분석" },
  ],
  "special-investigation": [
    { id:"relationship", label:"우범자/기업 관계망 분석" },
    { id:"fund_track",   label:"자금추적(계좌, 가상계좌) 분석" },
    { id:"comms",        label:"통신내역 관계 분석" },
  ],
};

function extraSubtabsPanel(page, scenario){
  if(!scenario) return "";
  const extras = EXTRA_SUBTABS_BY_TEMPLATE[scenario.template] || [];

  return `
    <div style="font-size:12px;font-weight:700;color:#0f766e;margin-bottom:6px">
      활용 가능한 서브탭 선택
    </div>
    <p class="muted" style="font-size:11px;margin:0 0 12px;line-height:1.5">
      활용 가능한 <span style="color:#0f766e;font-weight:600">서브탭</span>을 선택하여
      전문 업무 분석 기능을 정의합니다.
    </p>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${extras.map(extra => `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    gap:8px;padding:11px 14px;background:#f0fdf4;
                    border:1px solid #86efac;border-radius:8px">
          <span style="font-size:13px;font-weight:600;color:#14532d">
            ${escapeHtml(extra.label)}
          </span>
          <button type="button"
            style="padding:4px 12px;background:#16a34a;color:#fff;border:none;
                   border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;
                   white-space:nowrap;flex-shrink:0"
            data-sb-extra-add="${escapeHtml(page)}:${escapeHtml(extra.id)}:${escapeHtml(extra.label)}">
            추가
          </button>
        </div>
      `).join("")}
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
    <div style="border:2px solid #7c3aed;border-radius:10px;padding:20px 22px;background:#faf5ff;margin-bottom:14px">

      <!-- 헤더 -->
      <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #e9d5ff">
        신규 업무분석 등록
      </div>

      <!-- ① 기본 정보 한 줄: Key / 제목 / 템플릿 -->
      <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:12px;margin-bottom:12px;align-items:end">
        <div>
          <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
            Key <span style="color:var(--red)">*</span>
            <span style="font-weight:400;color:#94a3b8">(영문·숫자·_·-)</span>
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
        <div>
          <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">
            템플릿 <span style="color:var(--red)">*</span>
          </label>
          <select class="gi-reg-select" data-sb-new-template style="height:34px;width:100%">
            ${ANALYSIS_TEMPLATE_OPTIONS.map(item => option(item.id, item.label, template)).join("")}
          </select>
        </div>
      </div>

      <!-- ② 설명 -->
      <div style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:#41506a;display:block;margin-bottom:4px">설명</label>
        <textarea class="gi-wb2-textarea" data-sb-new-desc rows="2"
          style="width:100%;box-sizing:border-box;resize:vertical"
          placeholder="업무분석 설명 (선택)">${escapeHtml(draft.description || "")}</textarea>
      </div>

      <!-- ③ 서브탭 Pool: 포함(왼쪽) / 미포함(오른쪽) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">

        <!-- 포함된 서브탭 -->
        <div style="background:#fff;border:1px solid #e9d5ff;border-radius:8px;padding:12px">
          <div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px">
            포함된 서브탭
            <span style="font-weight:400;color:#6b7f9e;margin-left:4px">${includedSubtabs.length}개</span>
          </div>
          ${includedSubtabs.length === 0
            ? `<div style="font-size:12px;color:#94a3b8;padding:10px 0;text-align:center">오른쪽에서 서브탭을 추가하세요.</div>`
            : `<div style="display:flex;flex-direction:column;gap:4px">
                ${includedSubtabs.map((tab, i) => `
                  <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;
                               background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px">
                    <span style="width:16px;font-size:11px;font-weight:700;color:#7c3aed;text-align:center">${i+1}</span>
                    <span style="flex:1;font-size:13px;color:#1e293b">${escapeHtml(tabLabel(tab, fakeSc))}</span>
                    <div style="display:flex;gap:2px;flex-shrink:0">
                      <button type="button" class="gi-move-btn"
                        data-sb-new-subtab-move="${escapeHtml(tab.id)}:up"
                        ${i===0?"disabled":""}>↑</button>
                      <button type="button" class="gi-move-btn"
                        data-sb-new-subtab-move="${escapeHtml(tab.id)}:down"
                        ${i===includedSubtabs.length-1?"disabled":""}>↓</button>
                    </div>
                    <button type="button" class="btn-inline-action job-remove-action"
                      data-sb-new-subtab-toggle="${escapeHtml(tab.id)}">제외</button>
                  </div>
                `).join("")}
              </div>`
          }
        </div>

        <!-- 미포함 서브탭 -->
        <div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px">
          <div style="font-size:12px;font-weight:700;color:#41506a;margin-bottom:8px">
            미포함 서브탭
            <span style="font-weight:400;color:#94a3b8;margin-left:4px">${excludedSubtabs.length}개</span>
          </div>
          ${excludedSubtabs.length === 0
            ? `<div style="font-size:12px;color:#94a3b8;padding:10px 0;text-align:center">모든 서브탭이 포함되었습니다.</div>`
            : `<div style="display:flex;flex-direction:column;gap:4px">
                ${excludedSubtabs.map(tab => `
                  <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;
                               background:#f8fbff;border:1px solid var(--line);border-radius:6px">
                    <span style="flex:1;font-size:13px;color:#41506a">${escapeHtml(tabLabel(tab, fakeSc))}</span>
                    <button type="button" class="btn-inline-action"
                      data-sb-new-subtab-toggle="${escapeHtml(tab.id)}">+ 추가</button>
                  </div>
                `).join("")}
              </div>`
          }
        </div>
      </div>

      <!-- ④ 기본 진입 탭 + 저장/취소 -->
      <div style="display:flex;align-items:center;gap:10px;padding-top:12px;border-top:1px solid #e9d5ff">
        <label style="font-size:12px;font-weight:600;color:#41506a;white-space:nowrap;margin:0">기본 진입 탭</label>
        <select data-sb-new-default-tab class="gi-reg-select"
          style="height:32px;min-width:180px" ${includedSubtabs.length===0?"disabled":""}>
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
