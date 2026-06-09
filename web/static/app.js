const dataSources = {
  db_cdw: { label: "CDW 조회", type: "db", permitted: true },
  rag_customs: { label: "관세 규정 RAG", type: "rag_customs", permitted: true },
  rag_trade: { label: "통관 정보 RAG", type: "rag_trade", permitted: true },
  rag_audit: { label: "감사 정보 RAG", type: "rag_audit", permitted: false },
  rag_investigation: { label: "조사 정보 RAG", type: "rag_investigation", permitted: true },
  rag_global: { label: "국제 정보 RAG", type: "rag_global", permitted: false },
  bigdata_trade: { label: "동종 업종 통계", type: "bigdata", permitted: true },
  bigdata_hs: { label: "HS 코드 통계", type: "bigdata", permitted: true },
  web_search: { label: "웹 정보 검색", type: "web", permitted: true },
  report_generate: { label: "보고서 생성", type: "report", permitted: true },
  report_validate: { label: "보고서 검증", type: "validation", permitted: true },
};

const companySelect = document.querySelector("#companySelect");
const runButton = document.querySelector("#runButton");
const shutdownButton = document.querySelector("#shutdownButton");
const scenarioSource = document.querySelector("#scenarioSource");
const scenarioInstruction = document.querySelector("#scenarioInstruction");
const deleteScenarioButton = document.querySelector("#deleteScenarioButton");
const scenarioList = document.querySelector("#scenarioList");
const addScenarioButton = document.querySelector("#addScenarioButton");
const analysisOutput = document.querySelector("#analysisOutput");
const reportOutput = document.querySelector("#reportOutput");
const validationOutput = document.querySelector("#validationOutput");
const runStatus = document.querySelector("#runStatus");
const doneCount = document.querySelector("#doneCount");
const progressFill = document.querySelector("#progressFill");
const stepAccordion = document.querySelector("#stepAccordion");
const permissionPopup = document.querySelector("#permissionPopup");
const permissionPopupMessage = document.querySelector("#permissionPopupMessage");
const permissionPopupClose = document.querySelector("#permissionPopupClose");

const screens = Array.from(document.querySelectorAll(".screen"));
const topTabs = Array.from(document.querySelectorAll(".top-tab"));
const permissionInputs = Array.from(document.querySelectorAll("[data-source]"));

let companies = [];
let currentProfile = null;
let scenarioItems = [];
let selectedScenarioId = null;
let eventSource = null;
let completed = 0;
let totalSteps = 0;
let draggedId = null;
let stepOutputs = {};
let openStepIds = new Set();

function uid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const amount = Math.round(Number(value) / 100000000);
  return `${amount.toLocaleString("ko-KR")}억`;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("ko-KR");
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function riskLevelKo(level) {
  return { HIGH: "고위험", MEDIUM: "중위험", LOW: "저위험" }[level] || level || "-";
}

function statusKo(status) {
  return { NORMAL: "정상", REVIEW: "검토", INSPECT: "검사", HOLD: "보류" }[status] || status || "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function markdownToHtml(value) {
  const lines = String(value ?? "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listOpen = false;
  let listType = "";

  const closeList = (type = "") => {
    if (listOpen) {
      html.push(`</${listType}>`);
      listOpen = false;
      listType = "";
    }
  };

  const openList = (type) => {
    if (listOpen && listType !== type) closeList();
    if (!listOpen) {
      html.push(`<${type}>`);
      listOpen = true;
      listType = type;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      return;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      openList("ul");
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      return;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      openList("ol");
      html.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  });

  closeList();
  return html.join("");
}

function setMarkdown(element, value) {
  if (!element) return;
  element.innerHTML = markdownToHtml(value);
}

function switchScreen(name) {
  topTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.screen === name));
  screens.forEach((screen) => screen.classList.toggle("active", screen.dataset.screenPanel === name));
}

function showPermissionPopup(label) {
  permissionPopupMessage.textContent = `${label} 활성화 권한 변경을 요청했습니다. 관리자 승인 후 사용할 수 있습니다.`;
  permissionPopup.hidden = false;
}

function closePermissionPopup() {
  permissionPopup.hidden = true;
}

function syncPermissionControls() {
  permissionInputs.forEach((input) => {
    const info = dataSources[input.dataset.source];
    input.checked = Boolean(info && info.permitted);
  });
}

function populateScenarioSource() {
  scenarioSource.innerHTML = "";
  Object.entries(dataSources)
    .filter(([, info]) => info.permitted)
    .forEach(([key, info]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = info.label;
      scenarioSource.appendChild(option);
    });
}

function normalizeScenarioOrder() {
  scenarioItems = scenarioItems.map((item, index) => ({ ...item, order: index + 1 }));
}

function selectedItem() {
  return scenarioItems.find((item) => item.id === selectedScenarioId) || null;
}

function syncDeleteButton() {
  deleteScenarioButton.disabled = !selectedItem();
}

function selectScenarioItem(id) {
  selectedScenarioId = id;
  const item = selectedItem();
  if (item) {
    scenarioSource.value = item.key;
    scenarioInstruction.value = item.instruction || "";
  }
  renderScenarioList();
  syncDeleteButton();
}

function moveScenarioItem(dragId, targetId) {
  if (!dragId || !targetId || dragId === targetId) return;
  const fromIndex = scenarioItems.findIndex((item) => item.id === dragId);
  const toIndex = scenarioItems.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = scenarioItems.splice(fromIndex, 1);
  scenarioItems.splice(toIndex, 0, moved);
  normalizeScenarioOrder();
  renderScenarioList();
}

function renderScenarioList() {
  normalizeScenarioOrder();
  scenarioList.innerHTML = "";

  scenarioItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = `scenario-row ${item.type}`;
    li.classList.toggle("selected", item.id === selectedScenarioId);
    li.draggable = true;
    li.dataset.id = item.id;
    li.innerHTML = `
      <div class="scenario-item">
        <span class="scenario-order">${item.order}</span>
        <span class="scenario-pill">${escapeHtml(item.label)}</span>
        <p>${escapeHtml(item.instruction || "기본 분석")}</p>
      </div>
    `;

    li.addEventListener("click", () => selectScenarioItem(item.id));
    li.addEventListener("dragstart", () => {
      draggedId = item.id;
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => {
      draggedId = null;
      li.classList.remove("dragging", "drag-over");
    });
    li.addEventListener("dragover", (event) => {
      event.preventDefault();
      li.classList.add("drag-over");
    });
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
    li.addEventListener("drop", (event) => {
      event.preventDefault();
      li.classList.remove("drag-over");
      moveScenarioItem(draggedId, item.id);
    });

    scenarioList.appendChild(li);
  });

  totalSteps = scenarioItems.length;
  doneCount.textContent = `${completed}/${totalSteps}`;
  renderStepAccordion();
}

function stepDomId(item, index) {
  return item.id || `${item.key}-${index}`;
}

function renderStepAccordion() {
  if (!stepAccordion) return;
  normalizeScenarioOrder();

  if (!scenarioItems.length) {
    stepAccordion.innerHTML = `<div class="empty-state">아직 등록된 분석 단계가 없습니다.</div>`;
    return;
  }

  stepAccordion.innerHTML = scenarioItems
    .map((item, index) => {
      const id = stepDomId(item, index);
      const isOpen = openStepIds.has(id);
      const output = stepOutputs[id] || "아직 실행 결과가 없습니다.";
      const status = stepOutputs[`${id}:status`] || "대기";
      return `
        <section class="step-panel ${item.type} ${isOpen ? "open" : ""}" data-step-id="${id}">
          <button class="step-toggle" type="button">
            <span>${escapeHtml(item.label)}</span>
            <em class="step-status">${escapeHtml(status)}</em>
            <i>›</i>
          </button>
          <div class="step-body markdown-output">${markdownToHtml(output)}</div>
        </section>
      `;
    })
    .join("");

  stepAccordion.querySelectorAll(".step-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.closest(".step-panel");
      const id = panel.dataset.stepId;
      if (openStepIds.has(id)) openStepIds.delete(id);
      else openStepIds.add(id);
      renderStepAccordion();
    });
  });
}

function setStepOutput(index, output, status = "완료") {
  const item = scenarioItems[index];
  if (!item) return;
  const id = stepDomId(item, index);
  stepOutputs[id] = output || "";
  stepOutputs[`${id}:status`] = status;
  openStepIds.add(id);
  renderStepAccordion();
}

function setStepStatus(index, status) {
  const item = scenarioItems[index];
  if (!item) return;
  const id = stepDomId(item, index);
  stepOutputs[`${id}:status`] = status;
  openStepIds.add(id);
  renderStepAccordion();
}

function addScenarioItem() {
  const key = scenarioSource.value;
  const info = dataSources[key];
  if (!info) return;

  const newItem = {
    id: uid(),
    key,
    type: info.type,
    label: info.label,
    order: scenarioItems.length + 1,
    instruction: scenarioInstruction.value.trim(),
  };
  scenarioItems.push(newItem);
  scenarioInstruction.value = "";
  selectedScenarioId = newItem.id;
  openStepIds.add(newItem.id);
  renderScenarioList();
  syncDeleteButton();
}

function deleteSelectedScenario() {
  if (!selectedScenarioId) return;
  scenarioItems = scenarioItems.filter((item) => item.id !== selectedScenarioId);
  openStepIds.delete(selectedScenarioId);
  delete stepOutputs[selectedScenarioId];
  delete stepOutputs[`${selectedScenarioId}:status`];
  selectedScenarioId = scenarioItems[0]?.id || null;
  const nextItem = selectedItem();
  scenarioSource.value = nextItem?.key || scenarioSource.value;
  scenarioInstruction.value = nextItem?.instruction || "";
  renderScenarioList();
  syncDeleteButton();
}

function updateSelectedInstruction(value) {
  const item = selectedItem();
  if (!item) return;
  item.instruction = value;
  renderScenarioList();
}

function updateSelectedSource(key) {
  const item = selectedItem();
  const info = dataSources[key];
  if (!item || !info) return;
  item.key = key;
  item.type = info.type;
  item.label = info.label;
  renderScenarioList();
}

function resetStepResults() {
  stepOutputs = {};
  openStepIds = new Set();
  renderStepAccordion();
}

function scenarioPayload() {
  const hasKey = (key) => scenarioItems.some((item) => item.key === key);
  const hasSourceType = (type) => scenarioItems.some((item) => item.type === type);
  const hasRag = scenarioItems.some((item) => item.type.startsWith("rag_"));

  return {
    scenario_items: scenarioItems,
    db_query: hasSourceType("db"),
    rag_enabled: hasRag,
    rag_customs_public: hasKey("rag_customs"),
    rag_trade: hasKey("rag_trade"),
    rag_audit: hasKey("rag_audit"),
    rag_investigation: hasKey("rag_investigation"),
    rag_global: hasKey("rag_global"),
    bigdata_enabled: hasSourceType("bigdata"),
    bigdata_trade_stats: hasKey("bigdata_trade"),
    bigdata_hs_stats: hasKey("bigdata_hs"),
    web_enabled: hasSourceType("web"),
    report_enabled: hasSourceType("report"),
    validation_enabled: hasSourceType("validation"),
  };
}

async function loadCompanies() {
  const response = await fetch("/api/companies");
  const data = await response.json();
  companies = data.companies || [];
  companySelect.innerHTML = "";

  companies.forEach((company) => {
    const option = document.createElement("option");
    option.value = company.company_id;
    option.textContent = `${company.company_name} (${company.company_id})`;
    companySelect.appendChild(option);
  });

  await loadProfile();
}

async function loadProfile() {
  if (!companySelect.value) return;
  const response = await fetch(`/api/company?company_id=${encodeURIComponent(companySelect.value)}`);
  currentProfile = await response.json();
  renderProfile(currentProfile);
}

function setText(id, value) {
  const element = document.querySelector(id);
  if (element) element.textContent = value;
}

function riskBadgeClass(level) {
  return level === "HIGH" ? "danger" : level === "MEDIUM" ? "warn" : "safe";
}

function renderInfoRows(company) {
  const rows = [
    ["업종 코드", company.industry_code],
    ["설립연도", company.founded_year],
    ["주소", `${company.address || "-"} ${company.address_detail || ""}`.trim()],
    ["우편번호", company.address_postal_code],
    ["종업원 수", `${formatNumber(company.employee_count)}명`],
    ["주요 수출국", company.major_export_countries],
    ["관세사 법인", company.customs_broker_firm],
    ["관계 법인", company.related_companies],
    ["최근 환급액", formatMoney(company.recent_customs_refund)],
    ["최근 감사일", formatDate(company.last_audit_date)],
  ];

  const target = document.querySelector("#profileInfoRows");
  target.innerHTML = rows
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`)
    .join("");
}

function renderRiskBars(risk) {
  const metrics = [
    ["수입가격 저가 신고 의심", risk.undervaluation_suspicion_rate],
    ["특수관계자 거래 이상", risk.related_party_anomaly_rate],
    ["FTA 원산지 오남용 의심", risk.fta_origin_misuse_suspicion_rate],
    ["관세 환급 이상 수령", risk.customs_refund_anomaly_rate],
    ["HS 품목분류 오류", risk.hs_classification_error_rate],
    ["해외 자금 은닉 의심", risk.offshore_fund_concealment_suspicion_rate],
  ];

  const target = document.querySelector("#profileRiskBars");
  target.innerHTML = metrics
    .map(([label, value]) => {
      const score = Number(value || 0);
      return `
        <div class="risk-bar-row">
          <div><span>${escapeHtml(label)}</span><strong>${score.toFixed(0)}</strong></div>
          <i><b style="width: ${Math.max(0, Math.min(score, 100))}%"></b></i>
        </div>
      `;
    })
    .join("");
}

function renderDeclarations(declarations) {
  const target = document.querySelector("#profileDeclarations");
  if (!declarations.length) {
    target.innerHTML = `<tr><td colspan="6">수입 신고 내역이 없습니다.</td></tr>`;
    return;
  }

  target.innerHTML = declarations
    .slice(0, 8)
    .map(
      (row) => `
        <tr>
          <td>${formatDate(row.import_date)}</td>
          <td>${escapeHtml(row.item_name || "-")}</td>
          <td>${escapeHtml(row.hs_code || "-")}</td>
          <td>${escapeHtml(row.origin_country || "-")}</td>
          <td>${formatMoney(row.declared_value)}</td>
          <td><span class="status-pill ${String(row.status || "").toLowerCase()}">${statusKo(row.status)}</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderTimeline(company, risk, declarations) {
  const latest = declarations[0];
  const events = [
    [formatDate(company.last_audit_date), `${riskLevelKo(company.risk_level)} 등급, AI 위험점수 ${Number(company.risk_score || 0).toFixed(0)}점`],
    [formatDate(risk.generated_at), "수입가격, 특수관계자, FTA, 환급, HS, 해외 자금 지표 갱신"],
    [formatDate(latest?.import_date), latest ? `최근 신고 ${latest.declaration_no} · ${latest.item_name} · ${formatMoney(latest.declared_value)}` : "최근 수입 신고 없음"],
    [String(company.founded_year || "-"), `${company.company_name || "기업"} 설립`],
  ].filter(([date]) => date && date !== "-");

  const target = document.querySelector("#profileTimeline");
  target.innerHTML = events
    .map(([date, text]) => `<li><time>${escapeHtml(date)}</time><span></span><p>${escapeHtml(text)}</p></li>`)
    .join("");
}

function renderProfile(profile) {
  const company = profile.company || {};
  const risk = profile.risk || {};
  const declarations = profile.declarations || [];
  const initials = (company.company_name || "AI").replace(/[\s()㈜주식회사]/g, "").slice(0, 3).toUpperCase();

  const riskBadge = document.querySelector("#profileRiskLevel");
  riskBadge.className = `badge ${riskBadgeClass(company.risk_level)}`;

  setText("#profileLogo", initials || "AI");
  setText("#profileName", company.company_name || "기업을 선택하세요");
  setText("#profileMeta", `사업자번호 ${company.business_registration_no || "-"} · ${company.address || "-"} · 설립 ${company.founded_year || "-"}년 · ${company.industry_code || "-"}`);
  setText("#profileRiskLevel", riskLevelKo(company.risk_level));
  setText("#profileAuditStatus", company.last_audit_date ? "감사 이력 있음" : "상시 모니터링");
  setText("#kpiRevenue", formatMoney(company.annual_revenue));
  setText("#kpiImport", formatMoney(company.annual_import_amount));
  setText("#kpiDuty", formatMoney(company.declared_duty_amount));
  setText("#kpiFta", formatPct(company.fta_reduction_rate));
  setText("#kpiRisk", `${Number(company.risk_score || 0).toFixed(0)} / 100`);
  setText("#riskCircleScore", Number(company.risk_score || 0).toFixed(0));
  setText("#riskCircleLevel", riskLevelKo(company.risk_level));

  renderInfoRows(company);
  renderRiskBars(risk);
  renderDeclarations(declarations);
  renderTimeline(company, risk, declarations);
}

function setProgress(status) {
  runStatus.textContent = status;
  doneCount.textContent = `${completed}/${totalSteps}`;
  progressFill.style.width = totalSteps ? `${(completed / totalSteps) * 100}%` : "0";
}

function runWorkflow() {
  if (!scenarioItems.length) {
    analysisOutput.textContent = "조사 시나리오가 비어 있습니다. 추가 버튼으로 실행 단계를 먼저 등록하세요.";
    return;
  }

  if (eventSource) eventSource.close();
  completed = 0;
  totalSteps = scenarioItems.length;
  resetStepResults();
  setProgress("실행 중");
  runButton.disabled = true;
  analysisOutput.textContent = "분석 시나리오 실행을 시작합니다.\n";
  reportOutput.textContent = "보고서 생성 대기 중입니다.";
  validationOutput.textContent = "검증 대기 중입니다.";
  setMarkdown(reportOutput, "보고서 생성 대기 중입니다.");
  setMarkdown(validationOutput, "검증 대기 중입니다.");
  switchScreen("analysis");

  const companyId = encodeURIComponent(companySelect.value);
  const scenarioParam = encodeURIComponent(JSON.stringify(scenarioPayload()));
  eventSource = new EventSource(`/api/run?company_id=${companyId}&scenario=${scenarioParam}`);

  eventSource.addEventListener("workflow", (event) => {
    const data = JSON.parse(event.data);
    if (data.status === "started") {
      totalSteps = data.total_steps || totalSteps;
      setProgress("실행 중");
    }
    if (data.status === "completed") {
      setProgress("완료");
      runButton.disabled = false;
      eventSource.close();
    }
    if (data.status === "failed") {
      setProgress("실패");
      runButton.disabled = false;
      eventSource.close();
    }
  });

  eventSource.addEventListener("step", (event) => {
    const data = JSON.parse(event.data);
    const stepIndex = scenarioItems.findIndex((item, index) => data.key === `${item.type}_agent_${index + 1}` || data.label === item.label);
    const index = Math.max(0, stepIndex);

    if (data.status === "running") {
      analysisOutput.textContent += `\n> ${data.label} 실행 중...`;
      setStepStatus(index, "실행 중");
    }
    if (data.status === "done") {
      completed += 1;
      setProgress("실행 중");
      analysisOutput.textContent += `\n- ${data.label} 완료\n${data.output || ""}\n`;
      setStepOutput(index, data.output || "결과 없음", "완료");
      if (data.result_key === "final_report") setMarkdown(reportOutput, data.output || "보고서 없음");
      if (data.result_key === "validation_result") setMarkdown(validationOutput, data.output || "검증 결과 없음");
    }
    if (data.status === "error") {
      analysisOutput.textContent += `\n! ${data.label} 오류: ${data.error}`;
      setStepOutput(index, data.error || "오류가 발생했습니다.", "오류");
      setProgress("오류");
      runButton.disabled = false;
      eventSource.close();
    }
  });

  eventSource.onerror = () => {
    setProgress("연결 종료");
    runButton.disabled = false;
    if (eventSource) eventSource.close();
  };
}

permissionInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const key = input.dataset.source;
    const info = dataSources[key];
    if (!info) return;

    if (!info.permitted && input.checked) {
      input.checked = false;
      showPermissionPopup(info.label);
      return;
    }

    info.permitted = input.checked;
    populateScenarioSource();
  });
});

topTabs.forEach((tab) => tab.addEventListener("click", () => switchScreen(tab.dataset.screen)));
companySelect.addEventListener("change", loadProfile);
addScenarioButton.addEventListener("click", addScenarioItem);
deleteScenarioButton.addEventListener("click", deleteSelectedScenario);
scenarioInstruction.addEventListener("input", (event) => updateSelectedInstruction(event.target.value));
scenarioSource.addEventListener("change", (event) => updateSelectedSource(event.target.value));
runButton.addEventListener("click", runWorkflow);
shutdownButton.addEventListener("click", async () => {
  if (eventSource) eventSource.close();
  shutdownButton.disabled = true;
  shutdownButton.textContent = "종료 중...";
  runButton.disabled = true;
  try {
    await fetch("/api/shutdown", { method: "POST" });
    shutdownButton.textContent = "종료 완료";
    setProgress("플랫폼 종료");
  } catch (error) {
    shutdownButton.disabled = false;
    shutdownButton.textContent = "플랫폼 종료";
    runButton.disabled = false;
    alert(`플랫폼 종료 요청 실패: ${error.message}`);
  }
});
permissionPopupClose.addEventListener("click", closePermissionPopup);
permissionPopup.addEventListener("click", (event) => {
  if (event.target === permissionPopup) closePermissionPopup();
});

syncPermissionControls();
populateScenarioSource();

loadCompanies()
  .then(() => {
    scenarioItems = [
      { id: uid(), key: "db_cdw", type: "db", label: "CDW 조회", order: 1, instruction: "기업 프로파일과 최근 수입신고를 요약" },
      { id: uid(), key: "rag_customs", type: "rag_customs", label: "관세 규정 RAG", order: 2, instruction: "과세가격과 원산지 규정 관점 확인" },
      { id: uid(), key: "bigdata_trade", type: "bigdata", label: "동종 업종 통계", order: 3, instruction: "동종 업종 평균과 편차 비교" },
      { id: uid(), key: "bigdata_hs", type: "bigdata", label: "HS 코드 통계", order: 4, instruction: "품목분류와 신고가격 이상치 확인" },
      { id: uid(), key: "web_search", type: "web", label: "웹 정보 검색", order: 5, instruction: "업체, 공급망, 가격 변동 기사 확인" },
      { id: uid(), key: "report_generate", type: "report", label: "보고서 생성", order: 6, instruction: "조사 착안사항 중심으로 정리" },
      { id: uid(), key: "report_validate", type: "validation", label: "보고서 검증", order: 7, instruction: "근거 충실성과 과도한 추론 점검" },
    ];
    selectedScenarioId = scenarioItems[0].id;
    renderScenarioList();
    const item = selectedItem();
    scenarioSource.value = item.key;
    scenarioInstruction.value = item.instruction || "";
    syncDeleteButton();
    renderStepAccordion();
  })
  .catch((error) => {
    analysisOutput.textContent = `초기화 오류: ${error.message}`;
  });
