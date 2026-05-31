const pageNames = {
  home:"My AI 분석",
  canvas:"AI 작업 캔버스",
  investigation:"관세조사분석",
  generalinv:"일반수사분석",
  profile:"기업 위험도 대시보드",
  classification:"품목분류",
  lawsearch:"마약수사분석",
  document:"문서검증",
  dw:"위험선별 분석",
  model:"관세 온톨로지",
  rag:"통관정보 분석",
  case:"국제정보 분석",
  report:"보고서",
  system:"시스템",
  governance:"거버넌스",
  permission:"권한 승인"
};

const COACH_PROMPT_PLACEHOLDER = "자연어로 질문을 입력하면 선택된 데이터 소스에 따라 AI가 답변을 제공합니다.\n기본은 LLM 자체 답변이며, 내부정보를 활용하실 때에는 하단의 데이터 소스나 AI 서비스를 선택해 주세요.";
const pages = {
  home: () => `
    <div class="home-layout">
    <div class="home-focus-grid">
      <section class="card home-analysis-card home-col-card">
        <h3>My AI 분석</h3>

        <div class="coach-editor-wrap">
          <div class="coach-editor-hdr">
            <span>프롬프트 편집기</span>
            <span class="coach-char-count" id="coachCharCount">0자</span>
          </div>
          <textarea id="coachPrompt" class="coach-textarea" rows="4" placeholder="${escapeHtml(COACH_PROMPT_PLACEHOLDER)}"></textarea>
        </div>

        <div class="home-command-bar">
          <label class="home-tool-btn file-tool">
            <img class="home-tool-icon" src="/static/img/fileupload.png" alt="">
            <span>파일첨부</span>
            <input type="file" id="coachFileInput" multiple accept=".txt,.md,.csv,.json,.html,.xml,.pdf,.docx,.xlsx,.png,.jpg,.jpeg" style="display:none">
          </label>
          <button class="home-tool-btn" type="button" data-home-source="db_cdw"><span class="home-check off"></span>CDW조회</button>
          <button class="home-tool-btn" type="button" data-home-source="rag_customs"><span class="home-check off"></span>관세e음 RAG</button>
          <button class="home-tool-btn" type="button" data-home-agent="mail_share"><span class="home-check off"></span>분석결과공유</button>
          <button class="home-tool-btn home-picker-trigger" type="button" data-home-source="rag_audit">업무별 RAG 선택 <span class="home-select-status">×</span></button>
          <button class="home-tool-btn home-picker-trigger" type="button" data-home-agent="hs_verify">AI 서비스 선택 <span class="home-select-status">×</span></button>
          <div class="home-command-actions">
            <button class="home-action-btn coach" id="coachAnalyzeBtn" type="button"><img class="home-action-icon" src="/static/img/AICoaching.png" alt=""><b>AI코칭</b></button>
            <button class="home-action-btn improve coach-btn-improve" id="coachImproveBtn" type="button" style="display:none"><img class="home-action-icon" src="/static/img/implement.png" alt=""><b>개선 적용됨</b></button>
            <button class="home-action-btn reset coach-btn-reset" id="coachResetBtn" type="button" style="display:none"><img class="home-action-icon" src="/static/img/reset.png" alt=""><b>초기화</b></button>
            <button class="home-action-btn run home-run-btn" type="button"><img class="home-action-icon" src="/static/img/enter.png" alt=""><b>AI실행</b></button>
          </div>
        </div>
        <div class="home-file-chips coach-file-chips" id="coachFileChips"></div>

        <div class="coach-sugg-panel" id="coachSuggPanel" style="display:none">
          <div class="coach-sugg-hdr">
            <span>실시간 제안</span>
            <span class="coach-sugg-badge" id="coachSuggBadge">0</span>
            <span class="coach-score-mini" id="coachScoreMini"></span>
            <span class="coach-engine-tag" id="coachEngineTag"></span>
            <button class="coach-sugg-toggle" id="coachSuggToggle" type="button" aria-expanded="true">접기</button>
          </div>
          <div class="coach-sugg-body" id="coachSuggBody"></div>
        </div>

        <div class="summary-box markdown-output" id="homeResultBox" style="display:none"></div>
        <div class="home-analysis-detail" id="homeAnalysisDetail" style="display:none"></div>
      </section>

      <section class="card home-canvas-card home-col-card">
        <h3>AI 작업 캔버스</h3>
        <button class="btn secondary canvas-open-main" data-page="canvas" data-canvas-tab="overview">캔버스 열기</button>
        <p class="canvas-main-copy">다양한 데이터소스와 AI 서비스를 활용하여 나만의 분석을 수행합니다.</p>
        <div class="main-job-list">
          ${activeAnalysisJobs().map(mainCanvasJob).join("") || `<div class="empty-state">진행 중인 분석 작업이 없습니다. 아카이브에서 완료된 결과를 확인할 수 있습니다.</div>`}
        </div>
      </section>

      <aside class="card home-special-card">
        <h3>전문 업무 분석</h3>
        <div class="special-analysis-list">
          <button class="special-analysis-btn red" data-page="profile">기업 위험도 대시보드</button>
          <button class="special-analysis-btn sky" data-page="investigation">관세 조사 분석</button>
          <button class="special-analysis-btn rose" data-page="generalinv">일반 수사 분석</button>
          <button class="special-analysis-btn purple" data-page="lawsearch">마약 수사 분석</button>
<button class="special-analysis-btn olive" data-page="case">국제 정보분석</button>
          <button class="special-analysis-btn lime" data-page="model">관세 온톨로지</button>
          <button class="special-analysis-btn brown" data-page="report">Case별 RAG</button>
        </div>
        <button class="home-shutdown-btn" id="shutdownAllBtn" type="button">모든 서버 종료 하기</button>
      </aside>
    </div>
    </div>
  `,

  canvas: () => canvasPage(),

  investigation: () => investigationPage(),

  generalinv: () => generalInvPage(),

  profile: () => riskDashboard(),

  classification: () => simplePage("품목분류 추천", "품명, 규격, 이미지, 과거 분류사례를 바탕으로 HS Code 후보와 판단근거를 추천합니다.", `
    <div class="query-box"><span>🧾</span><input value="전동식 모션베드의 품목분류 후보를 추천해줘"><button class="btn">추천</button></div>
    ${dataTable(["후보 HS","품명","추천근거","신뢰도"], [["9403.20","금속제 기타 가구","금속 프레임이 본질적 특성인 조절식 침대베이스","높음"],["9403.50","목제 침실가구","목재 구조가 본질적 특성인 경우","중간"],["9402.90","의료용 가구","병원·진료용으로 설계된 경우 한정","낮음"]])}
    <div class="summary-box"><b>AI 판단:</b> 일반 가정용 모션베드는 의료용 침대가 아니라 가구로 검토하고, 주요 재질과 본질적 특성에 따라 세부호를 결정합니다.</div>
  `),

  lawsearch: () => drugInvestigationPage(),

  document: () => simplePage("문서검증센터", "비정형 문서를 OCR/LLM으로 인식하고 DB 값과 비교합니다.", `${dataTable(["추출항목","문서값","DB값","판정"], [["품명","Power Module","Power Module","일치"],["단가","USD 120","USD 98","불일치"],["Incoterms","CIF","FOB","불일치"],["로열티","존재","미신고","확인필요"]])}`),
  dw: () => riskScreeningPage(),
  model: () => customsOntologyPage(),
  rag: () => customsInfoPage(),
  case: () => intlInfoPage(),
  report: () => simplePage("보고서 생성센터", "AI 캔버스 블록을 조합해 조사보고서를 생성합니다.", `<button class="btn">조사보고서 초안 생성</button>`),
  system: () => simplePage("시스템 관리", "연계시스템, 데이터 파이프라인, 사용자 권한, 보안정책을 관리합니다.", ""),
  governance: () => simplePage("모델·권한·감사 로그", "AI 모델 사용 이력, 프롬프트 로그, 승인 프로세스를 점검합니다.", ""),
  permission: () => permissionApprovePage()
};

function notice(t,d,time){return `<div class="notice"><b>${t}</b><span class="muted" style="float:right">${time}</span><p>${d}</p><a>자세히 보기</a></div>`}
function task(t,d){return `<div class="task"><b>${t}</b><p class="muted">${d}</p></div>`}

const canvasWorkCategories = [
  "관세조사 분석",
  "기업 수사 분석",
  "개인수사 분석",
  "마약 수사 분석",
  "위험선별 분석",
  "통관 정보분석",
  "국제정보분석",
  "관세온톨로지",
  "Case 별 RAG",
];

function canvasJobCategory(job){
  return canvasWorkCategories.includes(job?.category) ? job.category : canvasWorkCategories[0];
}

const DRUG_INV_TYPES = [
  { id:"d1", num:"①", label:"마약 밀수입 수사",       cls:"gi-t1" },
  { id:"d2", num:"②", label:"마약 우범여행자 수사",   cls:"gi-t2" },
  { id:"d3", num:"③", label:"마약 자금세탁 수사",     cls:"gi-t3" },
  { id:"d4", num:"④", label:"신종마약 유통 수사",     cls:"gi-t4" },
  { id:"d5", num:"⑤", label:"국제공조 수사",          cls:"gi-t5" },
];
function drugInvTypeById(id){ return DRUG_INV_TYPES.find(t=>t.id===id) || DRUG_INV_TYPES[0]; }

/* ── 마약수사 유형별 초기 시나리오 단계 ─────────────────────
   GI_SERVICE_ALIASES 키 재사용 (gi_cdw, gi_imp, gi_route, gi_net,
   gi_profit, gi_law, gi_rep, gi_appr) + 마약전용 키 추가          */
const DRUG_SCENARIO_STEPS = {
  d1: [ // 마약 밀수입 수사
    { key:"gi_cdw" },
    { key:"gi_imp",    label:"수입신고 검증 AI 서비스" },
    { key:"gi_route",  label:"운송경로 분석 AI 서비스" },
    { key:"gi_net",    label:"관계망 분석 AI 서비스" },
    { key:"gi_profit", label:"범죄수익 추적 AI 서비스" },
    { key:"gi_rag_inv",label:"조사결과 RAG" },
    { key:"gi_rag_int",label:"국제공조 RAG" },
    { key:"gi_law" },
    { key:"gi_rep" },
    { key:"gi_appr" },
  ],
  d2: [ // 마약 우범여행자 수사
    { key:"gi_cdw" },
    { key:"gi_route",  label:"여행경로 분석 AI 서비스" },
    { key:"gi_net",    label:"관계망 분석 AI 서비스" },
    { key:"gi_rag_inv",label:"조사결과 RAG" },
    { key:"gi_law" },
    { key:"gi_rep" },
    { key:"gi_appr" },
  ],
  d3: [ // 마약 자금세탁 수사
    { key:"gi_cdw" },
    { key:"gi_profit", label:"자금세탁 추적 AI 서비스" },
    { key:"gi_net",    label:"관계망 분석 AI 서비스" },
    { key:"gi_rag_inv",label:"조사결과 RAG" },
    { key:"gi_rag_int",label:"국제공조 RAG" },
    { key:"gi_law" },
    { key:"gi_rep" },
    { key:"gi_appr" },
  ],
  d4: [ // 신종마약 유통 수사
    { key:"gi_cdw" },
    { key:"gi_imp",    label:"수입신고 검증 AI 서비스" },
    { key:"gi_net",    label:"관계망 분석 AI 서비스" },
    { key:"gi_rag_inv",label:"조사결과 RAG" },
    { key:"gi_rag_int",label:"국제공조 RAG" },
    { key:"gi_law" },
    { key:"gi_rep" },
    { key:"gi_appr" },
  ],
  d5: [ // 국제공조 수사
    { key:"gi_cdw" },
    { key:"gi_net",    label:"관계망 분석 AI 서비스" },
    { key:"gi_rag_int",label:"국제공조 RAG" },
    { key:"gi_rag_inv",label:"조사결과 RAG" },
    { key:"gi_law" },
    { key:"gi_rep" },
    { key:"gi_appr" },
  ],
};

/* ── 마약수사 케이스 스텝 초기화/조회 헬퍼 ─────────────────── */
let activeDrugStepId = null;

function activeDrugCaseSteps(){
  const aCase = activeDrugCase();
  if(!aCase) return [];
  if(!aCase.giSteps){
    const defaults = DRUG_SCENARIO_STEPS[aCase.invTypeId] || DRUG_SCENARIO_STEPS.d1;
    aCase.giSteps    = defaults.map((s, i) => normalizeGiScenarioStep({
      ...s, id:`drs_${i}_${uid()}`,
      label: s.label || GI_STEP_SOURCES_MAP[s.key]?.label || s.key,
    }, i));
    aCase.stepStates  = {};
    aCase.stepResults = {};
    aCase.stepExpanded= {};
  }
  aCase.giSteps = aCase.giSteps.map((step, index) => normalizeGiScenarioStep(step, index));
  if(!aCase.stepResults)  aCase.stepResults  = {};
  if(!aCase.stepExpanded) aCase.stepExpanded = {};
  return aCase.giSteps;
}

function activeDrugStep(){
  return activeDrugCaseSteps().find(s => s.id === activeDrugStepId) || null;
}

// GI_SERVICE_ALIASES를 key → label 역방향 맵 (정의 후 사용)
let GI_STEP_SOURCES_MAP = {};

const defaultDrugInvCases = [
  {
    caseId:"DRUG-2026-001", invTypeId:"d2",
    targetName:"김우범", nationality:"한국",
    team:"마약수사 전담팀", investigator:"홍길동",
    updated:"방금",
    status:{ label:"진행중", tone:"running", done:2, total:6, pct:33 },
  },
  {
    caseId:"DRUG-2026-002", invTypeId:"d1",
    targetName:"(주)위장무역", nationality:"한국",
    team:"마약수사 전담팀", investigator:"김조사",
    updated:"오늘 09:10",
    status:{ label:"자료수집", tone:"running", done:1, total:6, pct:17 },
  },
  {
    caseId:"DRUG-2026-003", invTypeId:"d5",
    targetName:"Park James", nationality:"미국",
    team:"국제협력팀", investigator:"이국제",
    updated:"어제",
    status:{ label:"보고서 검증", tone:"review", done:5, total:6, pct:83 },
  },
];

function mainCanvasJob(job){
  const { title, company, owner, updated, companyId, isNew } = job;
  const status = job.status || {};
  const meta = `${company} · ${owner} · ${updated}`;
  return `
    <article class="main-job-card ${isNew ? "new" : ""}" data-analysis-job="${escapeHtml(job.jobId || companyId)}" data-analysis-page="${escapeHtml(job.page || "investigation")}" data-analysis-tab="${escapeHtml(job.openTab || "ongoing")}" data-canvas-company="${escapeHtml(companyId || "")}">
      <div class="main-job-head">
        <div>
          <h3>${title}</h3>
          <p>${meta}</p>
        </div>
        <span class="job-status ${status.tone}">${status.label}</span>
      </div>
      <span class="canvas-category-chip">${escapeHtml(canvasJobCategory(job))}</span>
      <div class="job-progress"><i style="width:${status.pct}%"></i></div>
      <div class="job-meta">
        <span>${status.done ?? 0}/${status.total ?? "?"} 단계</span>
        <strong>${status.pct}%</strong>
      </div>
    </article>
  `;
}
function barChart(arr){return `<div class="chart">${arr.map(v=>`<div class="bar" style="height:${v}%"></div>`).join("")}</div>`}
function dataTable(headers, rows){return `<table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`}
function simplePage(title,desc,body){return `<section class="card"><h2>${title}</h2><p class="muted">${desc}</p>${body}</section>`}

function permissionApprovePage(){
  if(!isCurrentUserAdmin()){
    return `<section class="card" style="text-align:center;padding:60px 20px">
      <div style="font-size:48px;margin-bottom:16px">🔒</div>
      <h2 style="color:#991b1b">접근 권한 없음</h2>
      <p class="muted">권한 승인 관리는 정보기획담당관, 데이터담당관, 운영·지원 담당자만 사용할 수 있습니다.</p>
    </section>`;
  }
  const allKeys = Object.keys(defaultUserPermissions);
  const requested = allKeys.filter(key => permissionStatus(key) === "requested");
  const granted   = allKeys.filter(key => permissionStatus(key) === "granted");
  const locked    = allKeys.filter(key => permissionStatus(key) === "locked");

  const requestedRows = requested.map(key => {
    const source = scenarioSourceByKey(key);
    const label  = source?.label || key;
    const group  = source?.group || "-";
    return `
      <tr class="perm-row requested">
        <td><span class="perm-group-badge">${escapeHtml(group)}</span></td>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td><span class="perm-status-badge requested">요청중</span></td>
        <td>${escapeHtml(currentUser().name)} · ${escapeHtml(currentUserGroup().org + " " + currentUserGroup().team)}</td>
        <td>${new Date().toLocaleDateString("ko-KR")}</td>
        <td class="perm-actions">
          <button class="btn perm-approve-btn" data-approve-key="${escapeHtml(key)}">승인</button>
          <button class="btn secondary perm-reject-btn" data-reject-key="${escapeHtml(key)}">거부</button>
        </td>
      </tr>
    `;
  }).join("");

  const grantedRows = granted.map(key => {
    const source = scenarioSourceByKey(key);
    const label  = source?.label || key;
    const group  = source?.group || "-";
    return `
      <tr class="perm-row granted">
        <td><span class="perm-group-badge">${escapeHtml(group)}</span></td>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td><span class="perm-status-badge granted">승인됨</span></td>
        <td>김관세 · 조사국 조사1과</td>
        <td>-</td>
        <td class="perm-actions">
          <button class="btn secondary perm-revoke-btn" data-revoke-key="${escapeHtml(key)}">권한 회수</button>
        </td>
      </tr>
    `;
  }).join("");

  const lockedRows = locked.map(key => {
    const source = scenarioSourceByKey(key);
    const label  = source?.label || key;
    const group  = source?.group || "-";
    return `
      <tr class="perm-row locked">
        <td><span class="perm-group-badge">${escapeHtml(group)}</span></td>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td><span class="perm-status-badge locked">미요청</span></td>
        <td>-</td>
        <td>-</td>
        <td class="perm-actions">
          <button class="btn perm-approve-btn" data-approve-key="${escapeHtml(key)}">직접 승인</button>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <section class="card perm-page">
      <div class="perm-page-head">
        <div>
          <h2>권한 승인 관리</h2>
          <p class="muted">사용자가 요청한 데이터소스·AI 서비스 사용 권한을 검토하고 승인 또는 거부합니다.</p>
        </div>
        <div class="perm-summary">
          <span class="perm-summary-item requested">요청중 <strong>${requested.length}</strong></span>
          <span class="perm-summary-item granted">승인됨 <strong>${granted.length}</strong></span>
          <span class="perm-summary-item locked">미요청 <strong>${locked.length}</strong></span>
        </div>
      </div>

      ${requested.length ? `
        <div class="perm-section">
          <h3 class="perm-section-title requested-title">⏳ 승인 대기 (${requested.length}건)</h3>
          <table class="perm-table">
            <thead><tr><th>구분</th><th>기능명</th><th>상태</th><th>요청자</th><th>요청일</th><th>처리</th></tr></thead>
            <tbody>${requestedRows}</tbody>
          </table>
        </div>
      ` : `
        <div class="perm-empty">현재 승인 대기 중인 권한 요청이 없습니다.</div>
      `}

      <div class="perm-section" style="margin-top:24px">
        <h3 class="perm-section-title granted-title">✓ 승인된 권한 (${granted.length}건)</h3>
        <table class="perm-table">
          <thead><tr><th>구분</th><th>기능명</th><th>상태</th><th>사용자</th><th>승인일</th><th>처리</th></tr></thead>
          <tbody>${grantedRows || '<tr><td colspan="6" class="perm-empty-cell">승인된 권한이 없습니다.</td></tr>'}</tbody>
        </table>
      </div>

      <div class="perm-section" style="margin-top:24px">
        <h3 class="perm-section-title locked-title">🔒 미요청 권한 (${locked.length}건)</h3>
        <table class="perm-table">
          <thead><tr><th>구분</th><th>기능명</th><th>상태</th><th>사용자</th><th>요청일</th><th>처리</th></tr></thead>
          <tbody>${lockedRows || '<tr><td colspan="6" class="perm-empty-cell">해당 없음</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

const AI_SERVICE_GROUP = "사용 가능 AI 서비스";
const DATA_SOURCE_GROUP = "분석 데이터 소스";

const AI_SERVICE_REGISTRY = {
  db_cdw: {
    label: "CDW 조회", type: "db", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "기업 프로파일, 최근 수입신고, 위험지표를 종합 요약",
    behaviorOptions: [
      { value: "profile_summary", label: "기업/신고 요약" },
      { value: "risk_focus", label: "위험지표 중심" },
      { value: "declaration_focus", label: "신고내역 중심" },
    ],
  },
  rag_customs: {
    label: "관세e음 RAG", type: "rag_customs", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "과세가격, 원산지, 품목분류 관련 규정 근거 확인",
    behaviorOptions: [
      { value: "regulation_basis", label: "규정 근거 확인" },
      { value: "case_comparison", label: "유사사례 비교" },
    ],
  },
  rag_trade: {
    label: "통관정보 RAG", type: "rag_trade", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    behaviorOptions: [
      { value: "trade_signal", label: "무역 징후 확인" },
      { value: "market_context", label: "시장 맥락 확인" },
    ],
  },
  rag_audit: {
    label: "심사정보 RAG", type: "rag_audit", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "감사 정보와 추징 가능성 관점의 조사 포인트 정리",
    behaviorOptions: [
      { value: "audit_case", label: "감사사례 비교" },
      { value: "recovery_point", label: "추징 포인트" },
    ],
  },
  rag_investigation: {
    label: "조사정보 RAG", type: "rag_investigation", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    behaviorOptions: [
      { value: "investigation_plan", label: "조사계획 수립" },
      { value: "evidence_check", label: "증빙 체크" },
    ],
  },
  rag_global: {
    label: "국제정보 RAG", type: "rag_global", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "국제 정보 기반으로 해외 거래구조와 위험 신호 확인",
    behaviorOptions: [
      { value: "global_signal", label: "국제 위험신호" },
      { value: "counterparty", label: "해외거래처 확인" },
    ],
  },
  rag_consultation: {
    label: "상담내역 RAG", type: "rag_consultation", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "상담내역과 민원 질의 응답에서 유사 사례와 처리 흐름 확인",
    behaviorOptions: [
      { value: "consultation_case", label: "상담사례 확인" },
      { value: "response_pattern", label: "답변흐름 정리" },
    ],
  },
  rag_risk_select: {
    label: "위험선별 RAG", type: "rag_risk_select", group: DATA_SOURCE_GROUP, permissionGroup: "dataSources",
    defaultInstruction: "위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인",
    behaviorOptions: [
      { value: "selection_rule", label: "선별기준 확인" },
      { value: "risk_signal", label: "위험신호 정리" },
    ],
  },
  ml: {
    label: "ML 모델 실행 AI 서비스", type: "ml", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "전체 모델을 실행해 위험 패턴을 비교",
    behaviorOptions: [
      { value: "all_models", label: "전체 모델 실행" },
      { value: "industry_stats", label: "동종업종 통계" },
      { value: "hs_risk", label: "HS 위험점수" },
      { value: "hs_recommend", label: "품목분류 추천" },
      { value: "anomaly", label: "이상치 탐색" },
    ],
  },
  network: {
    label: "관계망 분석 AI 서비스", type: "network", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    behaviorOptions: [
      { value: "relationship", label: "관계망 분석" },
      { value: "paper_company", label: "페이퍼컴퍼니" },
    ],
  },
  ontology: {
    label: "관세온톨로지 AI 서비스", type: "ontology", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성",
    behaviorOptions: [
      { value: "traveler_ontology", label: "우범여행자 온톨로지" },
      { value: "cargo_relation", label: "화물 관계 분석" },
      { value: "semantic_rules", label: "추론 규칙 생성" },
    ],
  },
  origin_analysis: {
    label: "원산지 분석 AI 서비스", type: "origin_analysis", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    behaviorOptions: [
      { value: "origin_certificate", label: "원산지증명 검토" },
      { value: "fta_risk", label: "FTA 리스크" },
      { value: "circumvention", label: "우회수입 확인" },
    ],
  },
  abnormal_trade: {
    label: "이상거래 검증 AI 서비스", type: "abnormal_trade", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    behaviorOptions: [
      { value: "price_pattern", label: "가격 패턴" },
      { value: "counterparty_pattern", label: "거래상대방" },
      { value: "declaration_pattern", label: "신고패턴" },
    ],
  },
  proceeds_tracking: {
    label: "범죄수익 추적 AI 서비스", type: "proceeds_tracking", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    behaviorOptions: [
      { value: "fund_flow", label: "자금흐름" },
      { value: "account_trace", label: "계좌추적 단서" },
      { value: "concealment", label: "은닉 가능성" },
    ],
  },
  route_analysis: {
    label: "운송경로 분석 AI 서비스", type: "route_analysis", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    behaviorOptions: [
      { value: "route_check", label: "운송경로" },
      { value: "supply_chain", label: "공급망 역추적" },
      { value: "transshipment", label: "우회경유" },
    ],
  },
  web_search: {
    label: "웹검색 AI 서비스", type: "web", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "업체, 공급망, 가격 변동 관련 기사 확인",
    behaviorOptions: [
      { value: "company_news", label: "업체 기사" },
      { value: "supply_chain", label: "공급망/가격" },
      { value: "industry_news", label: "동종업종 기사" },
    ],
  },
  declaration_verify: {
    label: "수입신고검증 AI 서비스", type: "declaration_verify", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    behaviorOptions: [
      { value: "declaration_consistency", label: "신고 정합성" },
      { value: "missing_evidence", label: "누락 증빙" },
    ],
  },
  hs_verify: {
    label: "품목분류검증 AI 서비스", type: "hs_verify", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    behaviorOptions: [
      { value: "classification_check", label: "분류 적정성" },
      { value: "alternative_hs", label: "대체 HS 후보" },
    ],
  },
  customs_value: {
    label: "과세가격평가 AI 서비스", type: "customs_value", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "과세가격 결정 요소와 저가신고 가능성 검토",
    behaviorOptions: [
      { value: "valuation_basis", label: "과세가격 근거" },
      { value: "undervaluation", label: "저가신고 탐지" },
    ],
  },
  patent: {
    label: "특허정보 조회 AI 서비스", type: "patent", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    behaviorOptions: [
      { value: "royalty_check", label: "로열티 확인" },
      { value: "patent_lookup", label: "특허 정보 조회" },
    ],
  },
  law: {
    label: "법령정보 조회 AI 서비스", type: "law", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "관련 법령, 고시, 판례, 유권해석 근거 검색",
    behaviorOptions: [
      { value: "law_basis", label: "법령 근거" },
      { value: "precedent", label: "판례/유권해석" },
    ],
  },
  ocr: {
    label: "OCR/문서인식 AI 서비스", type: "ocr", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    behaviorOptions: [
      { value: "document_extract", label: "문서 항목 추출" },
      { value: "evidence_parse", label: "증빙 구조화" },
    ],
  },
  rag_create: {
    label: "RAG 생성 AI 서비스", type: "rag_create", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    behaviorOptions: [
      { value: "knowledge_build", label: "지식 생성" },
      { value: "source_cleanup", label: "자료 정제" },
    ],
  },
  summary: {
    label: "보고서 요약 AI 서비스", type: "summary", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "선행 단계 결과를 조사관용 핵심 요약으로 정리",
    behaviorOptions: [
      { value: "brief", label: "핵심 요약" },
      { value: "evidence_table", label: "근거 표 정리" },
    ],
  },
  report_generate: {
    label: "보고서 생성 AI 서비스", type: "report", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "이전 단계 결과를 공식 조사보고서 초안으로 통합",
    behaviorOptions: [
      { value: "full_report", label: "전체 보고서" },
      { value: "issue_report", label: "쟁점 중심 보고서" },
    ],
  },
  report_validate: {
    label: "보고서 검증 AI 서비스", type: "validation", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    behaviorOptions: [
      { value: "evidence_validation", label: "근거 검증" },
      { value: "risk_review", label: "리스크 리뷰" },
    ],
  },
  mail_share: {
    label: "내부메일 공유 AI 서비스", type: "mail_share", group: AI_SERVICE_GROUP, permissionGroup: "agents",
    defaultInstruction: "분석 결과보고서를 내부메일 본문과 첨부 요약으로 구성하여 관련 부서에 공유",
    behaviorOptions: [
      { value: "internal_mail", label: "내부메일 공유" },
      { value: "team_brief", label: "팀 공유 요약" },
    ],
  },
};

const targetConfig = (companyPrompt, personPrompt = companyPrompt, supports = { company:true, person:true }) => ({
  supports,
  defaultPrompts: {
    company: companyPrompt,
    person: personPrompt,
  },
});

const AI_SERVICE_TARGET_CONFIG = {
  db_cdw: targetConfig(
    "기업 프로파일, 최근 수입신고, 위험지표를 종합 요약",
    "우범자 프로파일, 여행·반입 이력, 위험지표를 종합 요약"
  ),
  rag_customs: targetConfig(
    "과세가격, 원산지, 품목분류 관련 규정 근거 확인",
    "휴대품, 여행자 통관, 조사 절차 관련 규정 근거 확인"
  ),
  rag_trade: targetConfig(
    "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    "개인 반입·운송·거래 정보에서 이상 징후와 참고 근거 확인"
  ),
  rag_audit: targetConfig(
    "감사 정보와 추징 가능성 관점의 조사 포인트 정리",
    "개인 사건 검토 이력과 추징 가능성 관점의 조사 포인트 정리"
  ),
  rag_investigation: targetConfig(
    "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    "개인 수사 정보 기반으로 수사 순서와 확인 자료 정리"
  ),
  rag_global: targetConfig(
    "국제 정보 기반으로 해외 거래구조와 위험 신호 확인",
    "국제 여행·체류·공조 정보 기반으로 개인 위험 신호 확인"
  ),
  rag_consultation: targetConfig(
    "상담내역과 민원 질의 응답에서 유사 사례와 처리 흐름 확인",
    "개인 민원·상담내역에서 유사 사례와 처리 흐름 확인"
  ),
  rag_risk_select: targetConfig(
    "위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인",
    "개인 위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인"
  ),
  ml: targetConfig(
    "전체 모델을 실행해 기업 위험 패턴을 비교",
    "전체 모델을 실행해 개인 위험 패턴을 비교"
  ),
  network: targetConfig(
    "관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별",
    "인물·동행자·연락처·주소 관계망을 분석해 공범, 전달책, 반복 연계 가능성을 식별"
  ),
  ontology: targetConfig(
    "기업·거래·품목 중심 관세 온톨로지와 지식그래프 관계를 구성",
    "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성"
  ),
  origin_analysis: targetConfig(
    "원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석",
    "개인 반입 물품의 원산지 증빙과 우회 반입 가능성을 분석"
  ),
  abnormal_trade: targetConfig(
    "가격·거래상대방·신고패턴의 이상거래 징후를 검증",
    "반입·송금·연락·이동 패턴의 이상 징후를 검증"
  ),
  proceeds_tracking: targetConfig(
    "자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석",
    "개인 계좌·송금·현금 반입 단서를 기반으로 범죄수익 은닉 가능성을 분석"
  ),
  route_analysis: targetConfig(
    "운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지",
    "여행경로, 경유지, 동행 이력을 분석해 우회 반입 가능성을 탐지"
  ),
  web_search: targetConfig(
    "업체, 공급망, 가격 변동 관련 기사 확인",
    "인물, 조직, 사건, 여행 경로 관련 공개 정보를 확인"
  ),
  declaration_verify: targetConfig(
    "첨부문서(세금계산서·적하목록) 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인",
    "개인 휴대품 신고, 반입 물품, 첨부 증빙을 비교해 불일치와 은닉 가능성 확인"
  ),
  hs_verify: targetConfig(
    "수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증",
    "개인 반입 물품의 품목분류와 규제 대상 여부를 검증"
  ),
  customs_value: targetConfig(
    "과세가격 결정 요소와 저가신고 가능성 검토",
    "개인 반입 물품의 과세가격 산정 근거와 축소 신고 가능성 검토"
  ),
  patent: targetConfig(
    "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    "개인 반입 물품의 상표권·지식재산권 침해 가능성 확인"
  ),
  law: targetConfig(
    "관련 법령, 고시, 판례, 유권해석 근거 검색",
    "개인 수사·통관·처분 관련 법령, 고시, 판례, 유권해석 근거 검색"
  ),
  ocr: targetConfig(
    "첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화",
    "개인 신분·여행·반입 관련 첨부 문서에서 주요 항목을 추출하고 구조화"
  ),
  rag_create: targetConfig(
    "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    "개인 사건 자료를 RAG 지식으로 구성하기 위한 항목 정리"
  ),
  summary: targetConfig(
    "선행 단계 결과를 조사관용 핵심 요약으로 정리",
    "선행 단계 결과를 개인 수사 담당자용 핵심 요약으로 정리"
  ),
  report_generate: targetConfig(
    "이전 단계 결과를 공식 조사보고서 초안으로 통합",
    "이전 단계 결과를 개인 수사보고서 초안으로 통합"
  ),
  report_validate: targetConfig(
    "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증"
  ),
  mail_share: targetConfig(
    "분석 결과보고서를 내부메일 본문과 첨부 요약으로 구성하여 관련 부서에 공유",
    "개인 수사 결과보고서를 내부메일 본문과 첨부 요약으로 구성하여 관련 부서에 공유"
  ),
};

const registryKeysByPermissionGroup = (groupName) =>
  Object.entries(AI_SERVICE_REGISTRY)
    .filter(([, source]) => source.permissionGroup === groupName)
    .map(([key]) => key);

const sidebarPermissionGroups = {
  dataSources: registryKeysByPermissionGroup("dataSources"),
  agents: registryKeysByPermissionGroup("agents"),
};

const ALL_RAG = sidebarPermissionGroups.dataSources;
const ALL_AGENTS = sidebarPermissionGroups.agents;

const userGroups = [
  // ── 정보국 ──────────────────────────────────────────────────────────────
  {id:"g01",org:"정보국",team:"정보기획담당관", isAdmin:true,  rag:ALL_RAG,                              agents:ALL_AGENTS},
  {id:"g02",org:"정보국",team:"인공지능혁신팀", isAdmin:false, rag:["db_cdw","rag_customs"],              agents:["ocr","ml","network","declaration_verify","hs_verify","law","report_generate","report_validate"]},
  {id:"g03",org:"정보국",team:"시스템운영팀",   isAdmin:false, rag:["db_cdw","rag_customs"],              agents:["ocr","patent","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g04",org:"정보국",team:"연구개발장비팀", isAdmin:false, rag:["db_cdw","rag_customs","rag_trade"],  agents:["ocr","patent","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g05",org:"정보국",team:"데이터담당관",   isAdmin:true,  rag:ALL_RAG,                              agents:ALL_AGENTS},
  // ── 본청 업무분야 ────────────────────────────────────────────────────────
  {id:"g06",org:"본청",team:"통관 분야", isAdmin:false,
    rag:["db_cdw","rag_customs","rag_trade"],
    agents:["ocr","declaration_verify","hs_verify","summary","law","report_generate","report_validate"]},
  {id:"g07",org:"본청",team:"감시분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_trade"],
    agents:["ocr","ml","network","web_search","declaration_verify","law","report_generate","report_validate"]},
  {id:"g08",org:"본청",team:"심사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g09",org:"본청",team:"조사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_investigation"],
    agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g10",org:"본청",team:"국제협력",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_global"],
    agents:["ocr","web_search","summary","law","report_generate","report_validate"]},
  {id:"g11",org:"본청",team:"정보분석",  isAdmin:false,
    rag:ALL_RAG,
    agents:["ocr","ml","network","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g12",org:"본청",team:"운영·지원", isAdmin:true,  rag:ALL_RAG, agents:ALL_AGENTS},
  // ── 세관 업무분야 ────────────────────────────────────────────────────────
  {id:"g13",org:"세관",team:"통관 분야", isAdmin:false,
    rag:["db_cdw","rag_customs","rag_trade"],
    agents:["ocr","declaration_verify","hs_verify","summary","law","report_generate","report_validate"]},
  {id:"g14",org:"세관",team:"감시분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_trade"],
    agents:["ocr","ml","network","web_search","declaration_verify","law","report_generate","report_validate"]},
  {id:"g15",org:"세관",team:"심사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_audit"],
    agents:["ocr","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g16",org:"세관",team:"조사분야",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_investigation"],
    agents:["ocr","ml","network","web_search","declaration_verify","hs_verify","customs_value","law","report_generate","report_validate"]},
  {id:"g17",org:"세관",team:"국제협력",  isAdmin:false,
    rag:["db_cdw","rag_customs","rag_global"],
    agents:["ocr","web_search","summary","law","report_generate","report_validate"]},
  {id:"g18",org:"세관",team:"정보분석",  isAdmin:false,
    rag:ALL_RAG,
    agents:["ocr","ml","network","web_search","rag_create","law","report_generate","report_validate"]},
  {id:"g19",org:"세관",team:"운영·지원", isAdmin:true,  rag:ALL_RAG, agents:ALL_AGENTS},
];

const sampleUsers = [
  {id:"u01",groupId:"g01",name:"김기획",  avatar:"김"},
  {id:"u02",groupId:"g02",name:"이혁신",  avatar:"이"},
  {id:"u03",groupId:"g03",name:"박운영",  avatar:"박"},
  {id:"u04",groupId:"g04",name:"최연구",  avatar:"최"},
  {id:"u05",groupId:"g05",name:"정데이터",avatar:"정"},
  {id:"u06",groupId:"g06",name:"강통관",  avatar:"강"},
  {id:"u07",groupId:"g07",name:"조감시",  avatar:"조"},
  {id:"u08",groupId:"g08",name:"윤심사",  avatar:"윤"},
  {id:"u09",groupId:"g09",name:"임조사",  avatar:"임"},
  {id:"u10",groupId:"g10",name:"한협력",  avatar:"한"},
  {id:"u11",groupId:"g11",name:"노분석",  avatar:"노"},
  {id:"u12",groupId:"g12",name:"류지원",  avatar:"류"},
  {id:"u13",groupId:"g13",name:"오통관",  avatar:"오"},
  {id:"u14",groupId:"g14",name:"서감시",  avatar:"서"},
  {id:"u15",groupId:"g15",name:"신심사",  avatar:"신"},
  {id:"u16",groupId:"g16",name:"권조사",  avatar:"권"},
  {id:"u17",groupId:"g17",name:"황협력",  avatar:"황"},
  {id:"u18",groupId:"g18",name:"전분석",  avatar:"전"},
  {id:"u19",groupId:"g19",name:"고지원",  avatar:"고"},
];

const defaultUserPermissions = Object.fromEntries(
  Object.keys(AI_SERVICE_REGISTRY).map(key => [key, "granted"])
);

function scenarioSourceEntries(){
  return Object.entries(AI_SERVICE_REGISTRY).map(([key, source]) => ({
    key,
    ...source,
    ...(AI_SERVICE_TARGET_CONFIG[key] || {}),
  }));
}

function scenarioSourceByKey(key){
  const source = AI_SERVICE_REGISTRY[key];
  return source ? { key, ...source, ...(AI_SERVICE_TARGET_CONFIG[key] || {}) } : null;
}

function sourceBehaviorOptions(key){
  const source = scenarioSourceByKey(key);
  return source?.behaviorOptions || [{ value: "default", label: "기본 동작" }];
}

function sourceDefaultBehavior(key){
  return sourceBehaviorOptions(key)[0]?.value || "default";
}

function sourceDefaultBehaviors(key){
  return [sourceDefaultBehavior(key)];
}

function normalizeTargetType(value){
  return String(value || "").toLowerCase() === "person" ? "person" : "company";
}

function sourceSupportsTarget(key, targetType = "company"){
  const source = scenarioSourceByKey(key);
  const normalized = normalizeTargetType(targetType);
  return source?.supports?.[normalized] !== false;
}

function sourceDefaultInstruction(key, targetType = "company"){
  const source = scenarioSourceByKey(key);
  const normalized = normalizeTargetType(targetType);
  return source?.defaultPrompts?.[normalized]
    || source?.defaultPrompts?.company
    || source?.defaultInstruction
    || "";
}

function sourceBehaviorLabel(key, behavior){
  return sourceBehaviorOptions(key).find(option => option.value === behavior)?.label || "기본 동작";
}

function sourceBehaviorLabels(key, behaviors){
  const values = Array.isArray(behaviors) && behaviors.length ? behaviors : sourceDefaultBehaviors(key);
  return values.map(value => sourceBehaviorLabel(key, value));
}

function normalizeScenarioItem(item, index = 0){
  const source = scenarioSourceByKey(item.key) || scenarioSourceByKey("db_cdw");
  const key = source?.key || item.key || "db_cdw";
  const targetType = normalizeTargetType(item.target_type || item.targetType || "company");
  const behaviors = Array.isArray(item.behaviors) && item.behaviors.length
    ? item.behaviors
    : item.behavior
      ? [item.behavior]
      : sourceDefaultBehaviors(key);
  return {
    id: item.id || uid(),
    key,
    type: item.type || source?.type || "db",
    label: item.label || source?.label || key,
    behaviors,
    behavior: behaviors[0],
    behaviorLabel: sourceBehaviorLabels(key, behaviors).join(", "),
    order: item.order || index + 1,
    targetType,
    target_type: targetType,
    instruction: item.instruction || sourceDefaultInstruction(key, targetType),
  };
}

const scenarioTemplates = [
  {
    id: "customs-basic",
    name: "관세조사 기본 템플릿",
    description: "신고내역, 관세 규정, 통관정보, ML 모델을 순차 실행하는 기본 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["profile_summary"], order:1, instruction:"신고내역 중심 · 기업 프로파일과 최근 수입신고를 요약" },
      { key:"rag_customs", type:"rag_customs", label:"관세e음 RAG", behaviors:["regulation_basis"], order:2, instruction:"규정 근거 확인 · 과세가격, 원산지, 품목분류 관련 규정 근거 확인" },
      { key:"rag_trade", type:"rag_trade", label:"통관정보 RAG", behaviors:["trade_signal"], order:3, instruction:"무역 징후 확인 · 통관 이상 징후와 참고 근거 확인" },
      { key:"ml", type:"ml", label:"ML 모델 실행 AI 서비스", behaviors:["industry_stats","hs_risk"], order:4, instruction:"동종업종 통계와 HS 위험점수를 함께 비교" },
      { key:"report_generate", type:"report", label:"보고서 생성 AI 서비스", behaviors:["full_report"], order:5, instruction:"이전 단계 결과를 공식 조사보고서 초안으로 통합" },
    ],
  },
  {
    id: "valuation-focused",
    name: "저가신고 집중 템플릿",
    description: "과세가격, 특수관계, 가격 이상치 검토에 집중하는 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["risk_focus","declaration_focus"], order:1, instruction:"위험지표와 신고내역을 함께 상세 확인" },
      { key:"customs_value", type:"customs_value", label:"과세가격평가 AI 서비스", behaviors:["valuation_basis","undervaluation"], order:2, instruction:"과세가격 결정 요소와 저가신고 가능성 검토" },
      { key:"rag_customs", type:"rag_customs", label:"관세e음 RAG", behaviors:["regulation_basis","case_comparison"], order:3, instruction:"관련 규정과 유사사례를 함께 확인" },
      { key:"ml", type:"ml", label:"ML 모델 실행 AI 서비스", behaviors:["anomaly","hs_risk"], order:4, instruction:"신고가격 이상치와 HS 위험점수 확인" },
      { key:"report_generate", type:"report", label:"보고서 생성 AI 서비스", behaviors:["issue_report"], order:5, instruction:"저가신고 쟁점 중심 보고서 초안 작성" },
    ],
  },
  {
    id: "classification-origin",
    name: "품목분류·원산지 템플릿",
    description: "HS 분류, 원산지, FTA 증빙 검토에 맞춘 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["declaration_focus"], order:1, instruction:"품목, 원산지, 신고가격 중심으로 최근 신고내역 확인" },
      { key:"hs_verify", type:"hs_verify", label:"품목분류검증 AI 서비스", behaviors:["classification_check","alternative_hs"], order:2, instruction:"HS 코드 분류 적정성과 대체 후보 검토" },
      { key:"rag_customs", type:"rag_customs", label:"관세e음 RAG", behaviors:["regulation_basis"], order:3, instruction:"품목분류와 원산지 관련 규정 확인" },
      { key:"law", type:"law", label:"법령정보 조회 AI 서비스", behaviors:["law_basis","precedent"], order:4, instruction:"관련 법령, 고시, 유권해석 근거 검색" },
      { key:"report_validate", type:"validation", label:"보고서 검증 AI 서비스", behaviors:["evidence_validation"], order:5, instruction:"근거 충실성과 누락 증빙 검증" },
    ],
  },
];

function allScenarioTemplates(){
  const builtins = scenarioTemplates
    .filter(t => !hiddenBuiltinIds.has(t.id))
    .map(t => ({
      ...t,
      ...(builtinOverrides[t.id] || {}),
      ownerUserId: "system",
      ownerName: "공통",
      isBuiltin: true,
    }));
  const sharedCustoms = customTemplates.map(t => ({
    ...t,
    ownerUserId: t.ownerUserId || currentUserId,
    ownerName: t.ownerName || currentUser().name,
    isCustom: true,
  }));
  return [...builtins, ...sharedCustoms];
}

function scenarioTemplateOptionsHtml(){
  const templates = allScenarioTemplates();
  const builtIn = templates
    .filter(t => t.isBuiltin)
    .map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
    .join("");
  const shared = templates.filter(t => !t.isBuiltin);
  const sharedHtml = shared.length
    ? `<optgroup label="공유 템플릿">${shared.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} · ${escapeHtml(templateOwnerLabel(t))}</option>`).join("")}</optgroup>`
    : "";
  return `<optgroup label="공통 템플릿">${builtIn}</optgroup>` + sharedHtml;
  const custom  = customTemplates.length
    ? `<optgroup label="내 저장 템플릿">${customTemplates.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("")}</optgroup>`
    : "";
  return builtIn + custom;
}

function scenarioTemplateById(id){
  return allScenarioTemplates().find(template => template.id === id) || scenarioTemplates[0];
}

function cloneTemplateItems(templateId){
  const template = scenarioTemplateById(templateId);
  return template.items.map((item, index) => normalizeScenarioItem({...item, id: uid()}, index));
}

function templateOwnerLabel(template){
  if(template.ownerUserId === "system" || template.isBuiltin) return "공통";
  const owner = sampleUsers.find(user => user.id === template.ownerUserId);
  return owner?.name || template.ownerName || "사용자";
}

function canEditTemplate(template){
  return isCurrentUserAdmin() || template.ownerUserId === currentUserId;
}

function canDeleteTemplate(template){
  return canEditTemplate(template);
}

function scenarioSourceOptionsHtml(){
  const groups = scenarioSourceEntries().reduce((acc, source) => {
    if(!acc[source.group]) acc[source.group] = [];
    acc[source.group].push(source);
    return acc;
  }, {});
  return Object.entries(groups).map(([group, sources]) => `
    <optgroup label="${escapeHtml(group)}">
      ${sources.map(source => {
        const status = permissionStatus(source.key);
        const suffix = status === "granted" ? "" : ` · ${permissionLabel(status)}`;
        return `<option value="${escapeHtml(source.key)}">${escapeHtml(source.label + suffix)}</option>`;
      }).join("")}
    </optgroup>
  `).join("");
}

let scenarioCompanies = [];
let scenarioItems = [];
let selectedScenarioId = null;
let scenarioEventSource = null;
let stepOutputs = {};
let stepStatuses = {};
let openedSteps = new Set();
let expandedResultStepId = null;
let scenarioInitialized = false;
let scenarioLoadedForCompany = null;
let editingTemplateId = null;
let templateEditorItems = [];
let templateEditorSelectedId = null;
let templateEditorInitialized = false;
let templateDraftName = "";
let canvasTab = "overview";
let investigationTab   = "ongoing";
let showInvNewJobForm  = false;
let invArchiveOpen     = false;

/* ── 마약수사분석 상태 ──────────────────────────────────────── */
let drugInvTab           = "dashboard"; // "dashboard"|"ongoing"|"data"|"scenario"|"network"|"forensic"|"report"|"slang"
let drugInvSelectedTarget = null;
let drugAccordionOpen    = { cargo:true, traveler:false, modus:false, intl:false };
let activeDrugCaseId     = null;
let showDrugNewCaseForm  = false;
let drugCaseFilter       = "";
let drugRegTargetType    = "company"; // 마약수사 등록 대상 유형: "company"|"person"
let archivedDrugCases    = [];   // 마약수사 완료 아카이브
let drugArchiveOpen      = false;
let archivedGenInvCases  = [];   // 일반수사 완료 아카이브
let genInvArchiveOpen    = false;

/* ── 위험선별 분석 상태 ─────────────────────────────────────── */
let riskScreeningTab     = "today";    // "today"|"tracking"

/* ── 통관정보분석 상태 ─────────────────────────────────────── */
let customsInfoTab       = "today";    // "today"|"stats"
let customsInfoDateFrom  = "";
let customsInfoDateTo    = "";

/* ── 국제정보분석 상태 ─────────────────────────────────────── */
let intlInfoMessages     = [];

/* ── 관세온톨로지 상태 ─────────────────────────────────────── */
let ontologyTab          = "graph";    // "graph"|"rules"|"inference"

/* ── 일반수사분석 상태 ─────────────────────────────────────── */
let generalInvTab        = "cases";   // "cases"|"profile"|"data"|"workbench"|"report"
let activeGenInvCaseId   = null;
let showGenInvRegForm    = false;
let genInvFilter         = "";
let customGenInvCases    = [];
let riskPersons          = [];
let riskPersonsLoading   = false;

const GEN_INV_TYPES = [
  { id:"t1", num:"①", label:"관세포탈 수사",              cls:"gi-t1" },
  { id:"t2", num:"②", label:"밀수입·밀수출 수사",         cls:"gi-t2" },
  { id:"t3", num:"③", label:"원산지 위반 수사",            cls:"gi-t3" },
  { id:"t4", num:"④", label:"외환·자금세탁 범죄 수사",    cls:"gi-t4" },
  { id:"t5", num:"⑤", label:"지식재산권 침해 수사",        cls:"gi-t5" },
  { id:"t6", num:"⑥", label:"전략물자·수출통제 위반 수사", cls:"gi-t6" },
  { id:"t7", num:"⑦", label:"기타 수사",                  cls:"gi-t7" },
];

function genInvTypeById(id){ return GEN_INV_TYPES.find(t => t.id === id) || GEN_INV_TYPES[6]; }
let activeGiStepId = null;  // 워크벤치 선택 단계 ID
let giRunEventSource = null; // 일반수사 분석 실행 SSE 연결
let giRegTargetType  = "company"; // 수사 대상 등록 유형: "company" | "person"

const GI_SERVICE_ALIASES = {
  gi_cdw:      { sourceKey:"db_cdw", type:"db" },
  gi_imp:      { sourceKey:"declaration_verify", type:"agent" },
  gi_val:      { sourceKey:"customs_value", type:"agent" },
  gi_hs:       { sourceKey:"hs_verify", type:"agent" },
  gi_route:    { sourceKey:"route_analysis", type:"agent" },
  gi_net:      { sourceKey:"network", type:"agent" },
  gi_profit:   { sourceKey:"proceeds_tracking", type:"agent" },
  gi_origin:   { sourceKey:"origin_analysis", type:"agent", label:"원산지 검증 AI 서비스" },
  gi_anomaly:  { sourceKey:"abnormal_trade", type:"agent" },
  gi_patent:   { sourceKey:"patent", type:"agent" },
  gi_rag_rev:  { sourceKey:"rag_audit", type:"rag", label:"심사결과 RAG" },
  gi_rag_inv:  { sourceKey:"rag_investigation", type:"rag", label:"조사결과 RAG" },
  gi_rag_int:  { sourceKey:"rag_global", type:"rag", label:"국제협력 RAG" },
  gi_law:      { sourceKey:"law", type:"rag", label:"법령 검토" },
  gi_rep:      { sourceKey:"report_generate", type:"report", label:"보고서 작성" },
  gi_appr:     { sourceKey:"report_validate", type:"approve", label:"보고서 승인" },
};

/* GI_STEP_SOURCES_MAP 초기화 (DRUG_SCENARIO_STEPS에서 사용) */
Object.entries(GI_SERVICE_ALIASES).forEach(([key, alias]) => {
  const source = scenarioSourceByKey(alias.sourceKey);
  GI_STEP_SOURCES_MAP[key] = { label: alias.label || source?.label || key, ...alias };
});

const GI_STEP_SOURCES = Object.entries(GI_SERVICE_ALIASES).map(([key, alias]) => {
  const source = scenarioSourceByKey(alias.sourceKey);
  return {
    key,
    sourceKey: alias.sourceKey,
    label: alias.label || source?.label || key,
    type: alias.type || "agent",
  };
});

function canonicalGiStepKey(key){
  const value = String(key || "");
  const exact = GI_STEP_SOURCES.find(source => source.key === value);
  if(exact) return exact.key;
  const withoutSuffix = value.replace(/\d+$/,"");
  return GI_STEP_SOURCES.find(source => source.key === withoutSuffix)?.key || value;
}

function giSourceByKey(key){
  const canonical = canonicalGiStepKey(key);
  return GI_STEP_SOURCES.find(source => source.key === canonical) || { key: canonical || key, sourceKey:"summary", label: key || "분석 단계", type:"agent" };
}

function giCommonSourceKey(key){
  const canonical = canonicalGiStepKey(key);
  return GI_SERVICE_ALIASES[canonical]?.sourceKey || "summary";
}

function normalizeGiScenarioStep(step, index = 0){
  const source = giSourceByKey(step.key);
  const sourceKey = step.sourceKey || giCommonSourceKey(step.key);
  const targetType = normalizeTargetType(step.target_type || step.targetType || activeGenInvCase()?.targetType || "company");
  const behaviors = Array.isArray(step.behaviors) && step.behaviors.length
    ? step.behaviors
    : sourceDefaultBehaviors(sourceKey);
  const instruction = step.instruction ?? step.note ?? sourceDefaultInstruction(sourceKey, targetType);
  return {
    ...step,
    id: step.id || `gis_${index}_${uid()}`,
    key: step.key || source.key,
    type: step.type || source.type,
    label: step.label || source.label,
    sourceKey,
    targetType,
    target_type: targetType,
    behaviors,
    behavior: behaviors[0],
    behaviorLabel: sourceBehaviorLabels(sourceKey, behaviors).join(", "),
    instruction,
    note: instruction,
  };
}

function giScenarioInstructionPreview(step, targetType = "company"){
  const sourceKey = step.sourceKey || giCommonSourceKey(step.key);
  const behaviors = sourceBehaviorLabels(sourceKey, step.behaviors);
  const normalizedTarget = normalizeTargetType(targetType || step.target_type || step.targetType);
  const instruction = step.instruction || step.note || sourceDefaultInstruction(sourceKey, normalizedTarget) || "기본 분석";
  return `${behaviors.join(", ")} · ${instruction}`;
}

function giScenarioRunInstruction(step, targetType = "company"){
  const sourceKey = step.sourceKey || giCommonSourceKey(step.key);
  const behaviors = sourceBehaviorLabels(sourceKey, step.behaviors);
  const normalizedTarget = normalizeTargetType(targetType || step.target_type || step.targetType);
  const instruction = step.instruction || step.note || sourceDefaultInstruction(sourceKey, normalizedTarget) || "기본 분석";
  return `[동작 선택]\n- ${behaviors.join("\n- ")}\n\n${instruction}`;
}

function giStepSourceOptionsHtml(selectedKey = ""){
  const typeLabel = {db:"DB 조회",agent:"AI 서비스",rag:"RAG",report:"보고서",approve:"승인"};
  return GI_STEP_SOURCES.map(source =>
    `<option value="${escapeHtml(source.key)}"${source.key === selectedKey ? " selected" : ""}>${escapeHtml(typeLabel[source.type] || source.type)} · ${escapeHtml(source.label)}</option>`
  ).join("");
}

function activeGiCaseSteps(){
  const aCase = activeGenInvCase();
  if(!aCase) return [];
  if(!aCase.giSteps){
    const defaults = GI_SCENARIO_STEPS[aCase.invTypeId] || GI_SCENARIO_STEPS.t7;
    aCase.giSteps    = defaults.map((s, i) => normalizeGiScenarioStep({...s, id:`gis_${i}_${uid()}`}, i));
    aCase.stepStates  = {};
    aCase.stepResults = {};   // 단계별 실행 결과 텍스트
    aCase.stepExpanded= {};   // 결과 펼침 상태
    aCase.stepsDone   = 0;
  }
  aCase.giSteps = aCase.giSteps.map((step, index) => normalizeGiScenarioStep(step, index));
  if(!aCase.stepResults)  aCase.stepResults  = {};
  if(!aCase.stepExpanded) aCase.stepExpanded = {};
  return aCase.giSteps;
}

function activeGiStep(){
  return activeGiCaseSteps().find(s => s.id === activeGiStepId) || null;
}

/* ── 일반수사 분석 SSE 실행 ──────────────────────────────── */
function giStreamSteps(aCase, stepsToRun){
  if(!aCase || !stepsToRun.length) return;

  /* 기존 연결 종료 */
  if(giRunEventSource){ try{ giRunEventSource.close(); }catch(e){} giRunEventSource = null; }

  /* 실행 대상 단계를 "실행중" 상태로 즉시 표시 */
  if(!aCase.stepStates)  aCase.stepStates  = {};
  if(!aCase.stepResults) aCase.stepResults = {};
  stepsToRun.forEach(s => { aCase.stepStates[s.id] = "run"; });
  saveCanvasState();
  render("generalinv");

  /* URL 파라미터 구성 */
  const stepsPayload = stepsToRun.map(s => ({
    id: s.id,
    key: s.key,
    label: s.label,
    type: s.type,
    sourceKey: s.sourceKey || giCommonSourceKey(s.key),
    target_type: aCase.targetType || "company",
    targetType: aCase.targetType || "company",
    behaviors: s.behaviors || sourceDefaultBehaviors(s.sourceKey || giCommonSourceKey(s.key)),
    note: giScenarioRunInstruction(s, aCase.targetType),
  }));
  const params = new URLSearchParams({
    case_id:     aCase.caseId,
    target_name: aCase.targetName,
    target_type: aCase.targetType || "company",
    targetType:  aCase.targetType || "company",
    target_id:   aCase.targetType === "person" ? (aCase.personId || "") : (aCase.companyId || generalInvCompanyId(aCase) || ""),
    steps:       JSON.stringify(stepsPayload),
  });
  const url = `/api/gi_run?${params.toString()}`;
  giRunEventSource = new EventSource(url);

  /* SSE 이벤트 처리 */
  giRunEventSource.addEventListener("step", e => {
    const data = JSON.parse(e.data);
    const giStepId = data.gi_step_id;
    const step = stepsToRun.find(s => s.id === giStepId);
    if(!step) return;

    if(data.status === "running"){
      aCase.stepStates[step.id] = "run";
    } else if(data.status === "done"){
      aCase.stepStates[step.id]  = "done";
      aCase.stepResults[step.id] = data.output || "";
      /* 케이스 진행률 업데이트 */
      const allSteps = aCase.giSteps || [];
      const doneCnt  = allSteps.filter(s => (aCase.stepStates||{})[s.id] === "done").length;
      aCase.stepsDone = doneCnt;
      aCase.status = {
        ...aCase.status,
        done: doneCnt, total: allSteps.length,
        pct:  allSteps.length ? Math.round(doneCnt / allSteps.length * 100) : 0,
        label: doneCnt === allSteps.length ? "완료" : "진행중",
        tone:  doneCnt === allSteps.length ? "done"  : "run",
      };
    } else if(data.status === "error"){
      aCase.stepStates[step.id]  = "error";
      aCase.stepResults[step.id] = `[오류] ${data.error || "실행 중 오류가 발생했습니다."}`;
    }
    saveCanvasState();
    render("generalinv");
  });

  giRunEventSource.addEventListener("workflow", e => {
    const data = JSON.parse(e.data);
    if(data.status === "completed" || data.status === "failed"){
      if(giRunEventSource){ giRunEventSource.close(); giRunEventSource = null; }
      saveCanvasState();
      render("generalinv");
    }
  });

  giRunEventSource.onerror = () => {
    if(giRunEventSource){ giRunEventSource.close(); giRunEventSource = null; }
    stepsToRun.forEach(s => {
      if(aCase.stepStates[s.id] === "run") aCase.stepStates[s.id] = "error";
    });
    saveCanvasState();
    render("generalinv");
  };
}

function giTemplateStep(key, instruction = "", behaviors = null){
  const source = giSourceByKey(key);
  const sourceKey = source.sourceKey || giCommonSourceKey(key);
  const selectedBehaviors = Array.isArray(behaviors) && behaviors.length
    ? behaviors
    : sourceDefaultBehaviors(sourceKey);
  return {
    key: canonicalGiStepKey(key),
    sourceKey,
    type: source.type,
    label: source.label,
    behaviors: selectedBehaviors,
    instruction: instruction || sourceDefaultInstruction(sourceKey),
  };
}

function giTemplateItems(items){
  return items.map((item, index) => ({ ...item, order:index + 1 }));
}

/* ── 일반수사 분석 시나리오 템플릿 ──────────────────────── */
const giScenarioTemplates = [
  {
    id:"t1",
    name:"관세포탈 수사 템플릿",
    description:"과세가격, 신고검증, 품목분류, 이상거래, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_val"),
      giTemplateStep("gi_rag_rev"),
      giTemplateStep("gi_imp"),
      giTemplateStep("gi_val"),
      giTemplateStep("gi_hs"),
      giTemplateStep("gi_anomaly", "이상거래 검증 AI 서비스 신규 구성"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t2",
    name:"밀수입·밀수출 수사 템플릿",
    description:"신고검증, 운송경로, 관계망, 범죄수익, 조사·국제 RAG를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_route"),
      giTemplateStep("gi_net", "관계망 분석 AI 서비스 실행"),
      giTemplateStep("gi_profit", "자금흐름, 계좌 추적 연계"),
      giTemplateStep("gi_rag_inv"),
      giTemplateStep("gi_rag_int"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t3",
    name:"원산지 위반 수사 템플릿",
    description:"신고검증, 운송경로, 원산지, 조사·국제 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_route", "우회수입 탐지"),
      giTemplateStep("gi_origin"),
      giTemplateStep("gi_rag_inv"),
      giTemplateStep("gi_rag_int"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t4",
    name:"외환·자금세탁 범죄 수사 템플릿",
    description:"신고검증, 범죄수익 추적, 조사·국제 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_profit", "자금흐름, 계좌 추적 연계"),
      giTemplateStep("gi_rag_inv"),
      giTemplateStep("gi_rag_int"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t5",
    name:"지식재산권 침해 수사 템플릿",
    description:"신고검증, 특허정보, 품목분류, 운송경로, 심사 RAG를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴"),
      giTemplateStep("gi_patent", "권리자 정보 확인"),
      giTemplateStep("gi_hs", "위조품 식별"),
      giTemplateStep("gi_route", "우회수입 탐지, 공급망 역추적"),
      giTemplateStep("gi_rag_rev"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t6",
    name:"전략물자·수출통제 위반 수사 템플릿",
    description:"신고검증, 품목분류, 특허정보, 국제 RAG, 법령 검토를 연결하는 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
      giTemplateStep("gi_imp", "품명·중량·가격 불일치, 화물 이상 패턴, 수출허가 검증"),
      giTemplateStep("gi_hs", "전략물자 해당 여부, HS코드 기반 해당 품목 자동 식별, 수출허가 검증"),
      giTemplateStep("gi_patent", "권리자 정보 확인"),
      giTemplateStep("gi_rag_int", "대북제재 스크리닝"),
      giTemplateStep("gi_law"),
      giTemplateStep("gi_rep", "증거 정리"),
      giTemplateStep("gi_appr"),
    ]),
  },
  {
    id:"t7",
    name:"기타 수사 템플릿",
    description:"공통 CDW 조회를 시작점으로 구성하는 기본 수사 흐름",
    items: giTemplateItems([
      giTemplateStep("gi_cdw"),
    ]),
  },
];

const GI_SCENARIO_STEPS = Object.fromEntries(
  giScenarioTemplates.map(template => [template.id, template.items])
);


const defaultGenInvCases = [
  { caseId:"GI-2026-001", targetName:"한국소재무역(주)", invTypeId:"t1", targetType:"company", companyId:"C-1001",
    status:{ label:"진행중", tone:"running", pct:65, done:4, total:7 },
    investigator:"임조사", team:"조사국 조사1과", created:"2026-05-10", updated:"방금" },
  { caseId:"GI-2026-002", targetName:"김우범 (개인)", invTypeId:"t2", targetType:"person",
    status:{ label:"대기", tone:"wait", pct:10, done:1, total:7 },
    investigator:"권조사", team:"세관 조사분야", created:"2026-05-15", updated:"오늘 09:30" },
  { caseId:"GI-2026-003", targetName:"글로벌패션코리아", invTypeId:"t5", targetType:"company", companyId:"C-1003",
    status:{ label:"검토중", tone:"review", pct:85, done:6, total:7 },
    investigator:"임조사", team:"조사국 조사1과", created:"2026-04-28", updated:"어제" },
];
const defaultGenInvCasesBaseline = JSON.parse(JSON.stringify(defaultGenInvCases));

function allGenInvCases(){ return [...defaultGenInvCases, ...customGenInvCases]; }
function activeGenInvCase(){ return allGenInvCases().find(c => c.caseId === activeGenInvCaseId) || null; }
function riskPersonById(personId){ return riskPersons.find(person => person.person_id === personId) || null; }
/* ─────────────────────────────────────────────────────────── */
let activeCanvasCompanyId = "C-1001";
let activeScenarioTemplateId = "customs-basic";
let showScenarioCompanyPicker = false;
let customCanvasJobs = [];
let userPermissions = {...defaultUserPermissions};
let canvasJobOverrides = {};
let canvasRunArchives = {};
let hiddenCanvasJobsByUser = {};
let userWorkspaces = {};
let overviewArchiveOpen = false;
let customTemplates = [];
let hiddenBuiltinIds = new Set();
let builtinOverrides = {};
let currentUserId = "u01";
let latestReport = "보고서가 아직 생성되지 않았습니다.";
let latestValidation = "검증 결과가 아직 없습니다.";
const canvasStateKey = "kcs_ai_canvas_state_v1";
let scenarioCompaniesLoading = false;
let companyDetailCache = {};
let companyScenarios = {};   // { [companyId]: scenarioItem[] }
let currentPage = "home";
let riskDashboardFilter = { query: "", minScore: 0 };

/* ── 실시간 프롬프트 코치 상태 ── */
let coachSuggestions = [];
let coachBaseScore = 35;
let coachImprovedPrompt = "";
let coachOriginalPrompt = "";
let coachIsRunning = false;
let coachUploadSessionId = "";        // 백엔드 업로드 세션 ID
let coachAttachedFiles = [];          // [{ name, type, size, mime, encoding, content }] (content 로컬 캐시)
let coachSuggestionsCollapsed = false;

const COACH_TEXT_EXT = /\.(txt|md|csv|json|html|htm|xml|log|tsv|sql|yaml|yml)$/i;
const COACH_MAX_TEXT_SIZE = 512 * 1024;  // 512KB 까지 텍스트로 읽음
const COACH_MAX_BINARY_SIZE = 12 * 1024 * 1024; // 서버 텍스트 추출용 base64 전송 한도

const COACH_TYPE_COLORS = {
  "추가":   { bg:"#e0ecff", tx:"#1e40af" },
  "누락":   { bg:"#fde7e7", tx:"#b91c1c" },
  "모호":   { bg:"#fef3c7", tx:"#92400e" },
  "미지정": { bg:"#fef3c7", tx:"#92400e" },
};

function coachEl(id){ return document.getElementById(id); }

function coachSetScoreMini(n){
  const el = coachEl("coachScoreMini");
  if(!el) return;
  if(n === null || n === undefined){ el.textContent = ""; return; }
  const c = n >= 80 ? "var(--green)" : n >= 55 ? "var(--orange)" : "var(--red)";
  el.innerHTML = `점수 <b style="color:${c}">${Math.round(n)}/100</b>`;
}

const COACH_SOURCE_LABELS = {
  db_cdw:"CDW", rag_customs:"관세e음 RAG", rag_trade:"통관정보 RAG",
  rag_audit:"심사정보 RAG", rag_investigation:"조사정보 RAG", rag_global:"국제정보 RAG",
  rag_consultation:"상담내역 RAG", rag_risk_select:"위험선별 RAG",
};
const COACH_AGENT_LABELS = {
  ocr:"OCR", ml:"ML 위험모델", network:"관계망", ontology:"관세온톨로지",
  origin_analysis:"원산지분석", abnormal_trade:"이상거래검증",
  proceeds_tracking:"범죄수익추적", route_analysis:"운송경로분석", web:"웹검색",
  declaration_verify:"수입신고검증", hs_verify:"품목분류검증", customs_value:"과세가격평가",
  summary:"보고서요약", patent:"특허정보", rag_create:"RAG생성", law:"법령정보",
  report:"보고서생성", validate:"보고서검증", report_generate:"보고서생성", report_validate:"보고서검증",
};

function coachUsesHtml(uses){
  if(!uses || !uses.length) return "";
  const chips = uses.map(u => {
    const label = COACH_SOURCE_LABELS[u] || COACH_AGENT_LABELS[u] || u;
    const isAgent = !!COACH_AGENT_LABELS[u];
    return `<span class="coach-use-chip ${isAgent ? 'agent' : 'source'}">${escapeHtml(label)}</span>`;
  }).join("");
  return `<div class="coach-uses-row">활용: ${chips}</div>`;
}

function coachMakeCard(s){
  const colors = COACH_TYPE_COLORS[s.type] || COACH_TYPE_COLORS["미지정"];
  const d = document.createElement("div");
  d.id = "coach_card_" + s.id;
  d.className = "coach-sugg-card new-in";
  d.innerHTML = `
    <div class="coach-card-top">
      <span class="coach-type-badge" style="background:${colors.bg};color:${colors.tx}">${escapeHtml(s.type)}</span>
      <span class="coach-card-title">${escapeHtml(s.title || "")}</span>
      <span class="coach-score-tag">+${s.scoreGain || 0}</span>
    </div>
    <div class="coach-card-desc">${escapeHtml(s.desc || "")}</div>
    <div class="coach-ba-wrap">
      <div class="coach-ba-box"><div class="coach-ba-lbl">이전</div><div class="coach-ba-txt">${escapeHtml(s.before || "")}</div></div>
      <div class="coach-ba-arrow">→</div>
      <div class="coach-ba-box coach-ba-after"><div class="coach-ba-lbl">이후</div><div class="coach-ba-txt">${escapeHtml(s.after || "")}</div></div>
    </div>
    ${coachUsesHtml(s.uses)}
    ${s.trigPhrase ? `<div class="coach-trigger-hint">감지: "${escapeHtml(s.trigPhrase)}"</div>` : ""}
  `;
  return d;
}

function coachRefreshCards(){
  const body = coachEl("coachSuggBody");
  const panel = coachEl("coachSuggPanel");
  const badge = coachEl("coachSuggBadge");
  const toggle = coachEl("coachSuggToggle");
  const improveBtn = coachEl("coachImproveBtn");
  const resetBtn = coachEl("coachResetBtn");
  if(!body) return;

  body.innerHTML = "";
  if(coachSuggestions.length === 0){
    if(panel) panel.style.display = "none";
  } else {
    if(panel) panel.style.display = "block";
    coachSuggestions.forEach(s => body.appendChild(coachMakeCard(s)));
  }
  if(badge) badge.textContent = coachSuggestions.length;
  body.style.display = coachSuggestionsCollapsed ? "none" : "block";
  if(panel) panel.classList.toggle("collapsed", coachSuggestionsCollapsed);
  if(toggle){
    toggle.textContent = coachSuggestionsCollapsed ? "열기" : "접기";
    toggle.setAttribute("aria-expanded", coachSuggestionsCollapsed ? "false" : "true");
    toggle.style.display = coachSuggestions.length > 0 ? "inline-flex" : "none";
  }
  if(improveBtn) improveBtn.style.display = coachImprovedPrompt ? "inline-flex" : "none";
  if(resetBtn) resetBtn.style.display = (coachSuggestions.length > 0 || coachImprovedPrompt) ? "inline-flex" : "none";
}

function setHomeActionLabel(button, label){
  if(!button) return;
  const labelEl = button.querySelector("b");
  if(labelEl) labelEl.textContent = label;
  else button.textContent = label;
}

function coachImprove(){
  const ta = coachEl("coachPrompt");
  if(!ta || !coachImprovedPrompt) return;
  ta.value = coachImprovedPrompt;
  const cc = coachEl("coachCharCount");
  if(cc) cc.textContent = ta.value.length + "자";
  coachSetScoreMini(95);
  const improveBtn = coachEl("coachImproveBtn");
  if(improveBtn){
    setHomeActionLabel(improveBtn, "개선 적용됨");
    improveBtn.disabled = true;
  }
}

function coachReset(){
  const ta = coachEl("coachPrompt");
  if(ta && coachOriginalPrompt) ta.value = coachOriginalPrompt;
  coachSuggestions = [];
  coachSuggestionsCollapsed = false;
  coachBaseScore = 35;
  coachImprovedPrompt = "";
  coachAttachedFiles = [];
  if(coachUploadSessionId){
    fetch("/api/upload/clear", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ session_id: coachUploadSessionId }),
    }).catch(() => {});
    coachUploadSessionId = "";
  }
  coachRenderFileChips();
  const cc = coachEl("coachCharCount");
  if(cc && ta) cc.textContent = ta.value.length + "자";
  const improveBtn = coachEl("coachImproveBtn");
  if(improveBtn){
    setHomeActionLabel(improveBtn, "개선 적용");
    improveBtn.disabled = false;
  }
  const engineTag = coachEl("coachEngineTag");
  if(engineTag) engineTag.textContent = "";
  coachSetScoreMini(null);
  coachRefreshCards();
}

async function coachRunAnalyze(){
  if(coachIsRunning) return;
  const ta = coachEl("coachPrompt");
  const analyzeBtn = coachEl("coachAnalyzeBtn");
  if(!ta) return;

  const prompt = ta.value.trim();
  if(!prompt){
    alert("프롬프트를 먼저 입력하세요.");
    return;
  }

  coachIsRunning = true;
  coachOriginalPrompt = prompt;
  if(analyzeBtn){
    analyzeBtn.disabled = true;
    setHomeActionLabel(analyzeBtn, "분석 중...");
  }

  const improveBtn = coachEl("coachImproveBtn");
  if(improveBtn){
    improveBtn.style.display = "none";
    setHomeActionLabel(improveBtn, "개선 적용");
    improveBtn.disabled = false;
  }

  try{
    const selectedOptions = homeSelectedAnalysisOptions();
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        selected_sources: selectedOptions.sources,
        selected_agents: selectedOptions.agents,
        attached_files: coachAttachedFiles.map(f => ({
          name: f.name, type: f.type, size: f.size, encoding: f.encoding,
        })),
      }),
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    coachBaseScore = data.score || 35;
    coachImprovedPrompt = data.improved_prompt || "";
    coachSuggestions = (data.suggestions || []).map((s, i) => ({
      ...s,
      id: s.id || "s" + (i + 1),
    }));
    coachSuggestionsCollapsed = false;

    coachSetScoreMini(coachBaseScore);
    coachRefreshCards();

    const engineTag = coachEl("coachEngineTag");
    if(engineTag) engineTag.textContent = data.engine === "llm" ? "외부 LLM 분석" : "규칙 기반 (LLM 미설정)";
  } catch(err){
    alert("코칭 요청 실패: " + (err.message || err));
    console.error("[coach] error", err);
  } finally {
    coachIsRunning = false;
    if(analyzeBtn){
      analyzeBtn.disabled = false;
      setHomeActionLabel(analyzeBtn, "AI 코칭 재실행");
    }
  }
}

/* ── 파일 첨부 처리 ────────────────────────────────────────────── */
function coachInferDocType(name){
  const n = (name || "").toLowerCase();
  if(/invoice|inv|세금|계산서|송장/.test(n)) return "invoice";
  if(/bl|선하|b_l|billoflading/.test(n))     return "bl";
  if(/contract|계약|sales/.test(n))           return "contract";
  if(/packing|포장/.test(n))                  return "packing_list";
  if(/origin|원산지|certificate/.test(n))     return "origin_certificate";
  return "document";
}

function coachRenderFileChips(){
  const wrap = coachEl("coachFileChips");
  if(!wrap) return;
  if(coachAttachedFiles.length === 0){ wrap.innerHTML = ""; return; }
  wrap.innerHTML = coachAttachedFiles.map((f, i) => {
    const sizeKB = (f.size / 1024).toFixed(1);
    const textBadge = f.encoding === "text"
      ? `<span class="coach-file-textbadge">텍스트 추출</span>`
      : (f.encoding === "base64" ? `<span class="coach-file-textbadge">서버 추출</span>` : `<span class="coach-file-binbadge">바이너리</span>`);
    return `<span class="coach-file-chip" title="${escapeHtml(f.name)}">
      <span class="coach-file-type">${escapeHtml(f.type)}</span>
      <span class="coach-file-name">${escapeHtml(f.name)}</span>
      <span class="coach-file-size">${sizeKB}KB</span>
      ${textBadge}
      <button type="button" class="coach-file-remove" data-coach-remove-file="${i}">×</button>
    </span>`;
  }).join("");
}

function coachReadFile(file){
  return new Promise((resolve) => {
    const isText = COACH_TEXT_EXT.test(file.name) || (file.type && file.type.startsWith("text/")) || file.type === "application/json";
    if(isText && file.size <= COACH_MAX_TEXT_SIZE){
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        type: coachInferDocType(file.name),
        mime: file.type || "text/plain",
        size: file.size,
        encoding: "text",
        content: String(reader.result || ""),
      });
      reader.onerror = () => resolve({
        name: file.name, type: coachInferDocType(file.name), mime: file.type || "",
        size: file.size, encoding: "binary", content: "",
      });
      reader.readAsText(file, "UTF-8");
    } else if(file.size <= COACH_MAX_BINARY_SIZE) {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        const base64 = raw.includes(",") ? raw.split(",", 2)[1] : raw;
        resolve({
          name: file.name,
          type: coachInferDocType(file.name),
          mime: file.type || "application/octet-stream",
          size: file.size,
          encoding: "base64",
          content: base64,
        });
      };
      reader.onerror = () => resolve({
        name: file.name, type: coachInferDocType(file.name), mime: file.type || "",
        size: file.size, encoding: "binary", content: "",
      });
      reader.readAsDataURL(file);
    } else {
      resolve({
        name: file.name,
        type: coachInferDocType(file.name),
        mime: file.type || "application/octet-stream",
        size: file.size,
        encoding: "binary",
        content: "",
      });
    }
  });
}

async function coachHandleFileSelect(fileList){
  const files = Array.from(fileList || []);
  if(!files.length) return;
  const newOnes = [];
  for(const f of files){
    const entry = await coachReadFile(f);
    newOnes.push(entry);
    coachAttachedFiles.push(entry);
  }
  coachRenderFileChips();

  // 백엔드 업로드
  try{
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: coachUploadSessionId || undefined,
        files: newOnes,
      }),
    });
    if(res.ok){
      const data = await res.json();
      coachUploadSessionId = data.session_id;
      console.log("[coach] 업로드 완료", data);
    }
  } catch(err){
    console.error("[coach] 업로드 실패", err);
    alert("파일 업로드에 실패했습니다: " + (err.message || err));
  }
}

async function coachRemoveFile(idx){
  coachAttachedFiles.splice(idx, 1);
  coachRenderFileChips();
  // 세션 전체 재업로드 (간단 처리)
  if(coachUploadSessionId){
    try{
      await fetch("/api/upload/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: coachUploadSessionId }),
      });
      coachUploadSessionId = "";
    } catch(e){ console.error(e); }
    if(coachAttachedFiles.length){
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: coachAttachedFiles }),
      });
      if(res.ok){
        const data = await res.json();
        coachUploadSessionId = data.session_id;
      }
    }
  }
}

function coachInitHome(){
  const ta = coachEl("coachPrompt");
  if(!ta) return;
  const cc = coachEl("coachCharCount");
  if(cc) cc.textContent = ta.value.length + "자";
  coachSuggestions = [];
  coachSuggestionsCollapsed = false;
  coachBaseScore = 35;
  coachImprovedPrompt = "";
  coachOriginalPrompt = "";
  coachSetScoreMini(null);
  coachRefreshCards();
  coachRenderFileChips();
  homeSyncPickerStatuses();
}

/* ── 홈 분석 실행 (실제 워크플로 스트리밍) ── */
const HOME_DEFAULT_AGENTS = [
  { type:"db",                 label:"CDW 조회",              key:"db_cdw" },
  { type:"rag_customs",        label:"관세e음 RAG",           key:"rag_customs" },
  { type:"rag_trade",          label:"통관정보 RAG",          key:"rag_trade" },
  { type:"rag_audit",          label:"심사정보 RAG",          key:"rag_audit" },
  { type:"rag_investigation",  label:"조사정보 RAG",          key:"rag_investigation" },
  { type:"rag_global",         label:"국제정보 RAG",          key:"rag_global" },
  { type:"rag_consultation",   label:"상담내역 RAG",          key:"rag_consultation" },
  { type:"rag_risk_select",    label:"위험선별 RAG",          key:"rag_risk_select" },
  { type:"web",                label:"웹검색 AI 서비스",          key:"web_search" },
  { type:"declaration_verify", label:"수입신고검증 AI 서비스",    key:"declaration_verify" },
  { type:"hs_verify",          label:"품목분류검증 AI 서비스",    key:"hs_verify" },
  { type:"customs_value",      label:"과세가격평가 AI 서비스",    key:"customs_value" },
  { type:"ml",                 label:"ML 모델 실행 AI 서비스",    key:"ml" },
  { type:"network",            label:"관계망분석 AI 서비스",      key:"network" },
  { type:"ontology",           label:"관세온톨로지 AI 서비스",    key:"ontology" },
  { type:"origin_analysis",    label:"원산지 분석 AI 서비스",     key:"origin_analysis" },
  { type:"abnormal_trade",     label:"이상거래 검증 AI 서비스",   key:"abnormal_trade" },
  { type:"proceeds_tracking",  label:"범죄수익 추적 AI 서비스",   key:"proceeds_tracking" },
  { type:"route_analysis",     label:"운송경로 분석 AI 서비스",   key:"route_analysis" },
  { type:"patent",             label:"특허정보 조회 AI 서비스",   key:"patent" },
  { type:"law",                label:"법령정보 조회 AI 서비스",   key:"law" },
  { type:"ocr",                label:"OCR/문서인식 AI 서비스",    key:"ocr" },
  { type:"rag_create",         label:"RAG 생성 AI 서비스",        key:"rag_create" },
  { type:"summary",            label:"보고서 요약 AI 서비스",     key:"summary" },
  { type:"report",             label:"보고서 생성 AI 서비스",     key:"report_generate" },
  { type:"validation",         label:"보고서 검증 AI 서비스",     key:"report_validate" },
  { type:"mail_share",         label:"내부메일 공유 AI 서비스",   key:"mail_share" },
];

let homeEventSource = null;
let homeRunResults = {};   // { result_key: text }
let homeStepStatus = {};   // { label: "running"|"done"|"error" }
let homeSelectedRagKeys = [];
let homeSelectedAgentKeys = [];

const HOME_PICKER_RAG_KEYS = ["rag_trade", "rag_audit", "rag_investigation", "rag_global", "rag_consultation", "rag_risk_select"];
const HOME_PICKER_AGENT_KEYS = sidebarPermissionGroups.agents;

function homeSelectedAnalysisOptions(){
  const sources = Array.from(document.querySelectorAll("[data-home-source].selected:not(.home-picker-trigger)"))
    .map(btn => btn.dataset.homeSource)
    .filter(Boolean);
  const agents = Array.from(document.querySelectorAll("[data-home-agent].selected:not(.home-picker-trigger)"))
    .map(btn => btn.dataset.homeAgent)
    .filter(Boolean);
  const pickerSources = homeSelectedRagKeys.filter(hasPermission);
  const pickerAgents = homeSelectedAgentKeys.filter(hasPermission);
  return {
    sources:[...new Set([...sources, ...pickerSources])],
    agents:[...new Set([...agents, ...pickerAgents])],
  };
}

function homeAgentDefForKey(key){
  return HOME_DEFAULT_AGENTS.find(agent => agent.key === key || agent.type === key) || null;
}

function homeRunAgentsFromSelection(selection){
  const keys = [...(selection.sources || []), ...(selection.agents || [])];
  const agents = keys.map(homeAgentDefForKey).filter(Boolean);
  let shareIndex = agents.findIndex(agent => agent.key === "mail_share");
  let reportIndex = agents.findIndex(agent => agent.key === "report_generate");
  if(shareIndex >= 0 && reportIndex < 0){
    const reportAgent = homeAgentDefForKey("report_generate");
    if(reportAgent) agents.splice(shareIndex, 0, reportAgent);
  } else if(shareIndex >= 0 && reportIndex > shareIndex){
    const [reportAgent] = agents.splice(reportIndex, 1);
    agents.splice(shareIndex, 0, reportAgent);
  }
  return uniqueByKey(agents);
}

function homeResultByLabel(...needles){
  const entry = Object.entries(homeRunResults)
    .find(([label]) => needles.some(needle => label.includes(needle)));
  return entry ? entry[1] : "";
}

function homeToggleAnalysisOption(button){
  if(!button) return;
  if(button.classList.contains("home-picker-trigger")) return;
  const selected = !button.classList.contains("selected");
  button.classList.toggle("selected", selected);
  const check = button.querySelector(".home-check");
  if(check){
    check.classList.toggle("on", selected);
    check.classList.toggle("off", !selected);
    check.textContent = selected ? "✓" : "";
  }
  const status = button.querySelector(".home-select-status");
  if(status){
    status.classList.toggle("selected", selected);
    status.textContent = selected ? "✓" : "×";
  }
}

function homeSyncPickerStatuses(){
  const ragTrigger = document.querySelector(".home-picker-trigger[data-home-source]");
  const agentTrigger = document.querySelector(".home-picker-trigger[data-home-agent]");
  [
    [ragTrigger, homeSelectedRagKeys.length],
    [agentTrigger, homeSelectedAgentKeys.length],
  ].forEach(([button, count]) => {
    if(!button) return;
    button.classList.toggle("active", count > 0);
    const status = button.querySelector(".home-select-status");
    if(status){
      status.classList.toggle("selected", count > 0);
      status.textContent = count > 0 ? "" : "×";
      status.title = count > 0 ? `${count}개 선택됨` : "선택 없음";
    }
  });
}

function homePickerKeys(kind){
  return kind === "rag" ? HOME_PICKER_RAG_KEYS : HOME_PICKER_AGENT_KEYS;
}

function homePickerSelectedKeys(kind){
  return kind === "rag" ? homeSelectedRagKeys : homeSelectedAgentKeys;
}

function homeSetPickerSelectedKeys(kind, keys){
  const unique = [...new Set(keys)];
  if(kind === "rag") homeSelectedRagKeys = unique;
  else homeSelectedAgentKeys = unique;
  homeSyncPickerStatuses();
}

function homePickerTitle(kind){
  return kind === "rag" ? "업무별 RAG 선택" : "AI 서비스 선택";
}

function homePickerDescription(kind){
  return kind === "rag"
    ? "질의 시 데이터 원천으로 사용할 RAG 시스템을 선택하세요."
    : "질의 시 활용할 AI 서비스를 선택하고, 자동화된 업무를 수행하세요.";
}

function homePickerRowHtml(kind, key){
  const source = scenarioSourceByKey(key);
  if(!source) return "";
  const selected = homePickerSelectedKeys(kind).includes(key);
  const status = permissionStatus(key);
  const isGranted = status === "granted";
  const statusText = selected ? "사용" : "미사용";
  const subText = isGranted ? sourceDefaultInstruction(key) : permissionLabel(status);
  const control = isGranted
    ? `<button class="home-use-toggle ${selected ? "active" : ""}" type="button" data-home-picker-toggle="${escapeHtml(key)}"><i></i>${statusText}</button>`
    : `<button class="home-permission-request" type="button" data-home-picker-request="${escapeHtml(key)}">${status === "requested" ? "요청중" : "권한 요청"}</button>`;
  return `
    <div class="home-permission-row ${status}">
      <div>
        <strong>${escapeHtml(source.label)}</strong>
        <span>${escapeHtml(subText || "")}</span>
      </div>
      ${control}
    </div>
  `;
}

function openHomePicker(kind){
  document.getElementById("homePickerOverlay")?.remove();
  const html = `
    <div class="home-permission-overlay" id="homePickerOverlay" data-home-picker-kind="${escapeHtml(kind)}">
      <div class="home-permission-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(homePickerTitle(kind))}">
        <div class="home-permission-head">
          <div>
            <h2>${escapeHtml(homePickerTitle(kind))}</h2>
            <p>${escapeHtml(homePickerDescription(kind))}</p>
          </div>
          <button class="home-permission-close" type="button" data-home-picker-close aria-label="닫기">×</button>
        </div>
        <div class="home-permission-body">
          ${homePickerKeys(kind).map(key => homePickerRowHtml(kind, key)).join("")}
        </div>
        <p class="home-permission-note">※ 질의 시 권한이 없는 데이터 원천이나 AI 서비스가 필요한 경우 조회 권한을 요청하십시오.</p>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
}

function detectCompanyId(prompt){
  const m = prompt.match(/C-\d{4}/);
  if(m) return m[0];
  if(/한국소재무역/.test(prompt)) return "C-1001";
  if(/서울인터내셔널/.test(prompt)) return "C-1002";
  if(/제주리테일/.test(prompt)) return "C-1008";
  if(/대한전자/.test(prompt)) return "C-1004";
  if(/대전바이오/.test(prompt)) return "C-1007";
  return "";
}

function homeDetailMarkup(){
  const agentLabels = Object.keys(homeStepStatus);
  const html = agentLabels.map(label => {
    const status = homeStepStatus[label] || "wait";
    const output = homeRunResults[label];
    const statusBadge =
      status === "done"    ? `<span class="home-detail-badge done">완료</span>` :
      status === "running" ? `<span class="home-detail-badge running">실행 중</span>` :
      status === "error"   ? `<span class="home-detail-badge error">오류</span>` :
                              `<span class="home-detail-badge wait">대기</span>`;
    const bodyHtml = output
      ? `<div class="home-detail-body markdown-output">${markdownToHtml(output)}</div>`
      : (status === "running" ? `<div class="home-detail-body muted">실행 중...</div>` : "");
    return `
      <details class="home-detail-item" ${status === "running" || status === "error" ? "open" : ""}>
        <summary><b>${escapeHtml(label)}</b> ${statusBadge}</summary>
        ${bodyHtml}
      </details>`;
  }).join("");
  return `
    <section class="home-result-detail" id="homeResultDetail">
      <h3>분석 상세 결과</h3>
      ${html || `<div class="home-detail-body muted">실행할 RAG 또는 AI 서비스 결과가 아직 없습니다.</div>`}
    </section>
  `;
}

function homeRenderDetail(){
  const detailInResult = document.getElementById("homeResultDetail");
  if(detailInResult){
    detailInResult.outerHTML = homeDetailMarkup();
    return;
  }
  const legacyDetail = document.getElementById("homeAnalysisDetail");
  if(legacyDetail){
    legacyDetail.style.display = "none";
    legacyDetail.innerHTML = "";
  }
}

// ── 홈 분석: 에이전트 스트리밍 실행 ───────────────────────────────────────────
function homeStreamAgents(prompt, companyId, runAgents, btn, displayCompanyId = ""){
  if(homeEventSource){ try{ homeEventSource.close(); }catch(e){} homeEventSource = null; }

  const resultBox = document.getElementById("homeResultBox");

  homeStepStatus = {};
  runAgents.forEach(a => { homeStepStatus[a.label] = "wait"; });
  homeRenderDetail();

  const scenarioItems = runAgents.map((a, i) => ({
    id: `home_${i}`,
    type: a.type,
    key: a.key,
    label: a.label,
    order: i + 1,
    behaviors: ["기본"],
    behavior: "기본",
    behaviorLabel: "기본",
    instruction: prompt,
  }));

  const payload = {
    scenario_items: scenarioItems,
    target_type: "company",
    targetType: "company",
    db_query: true,
    rag_enabled: true,
    rag_customs_public: true,
    rag_audit: true,
    bigdata_enabled: false,
    user_prompt: prompt,
    upload_session_id: coachUploadSessionId || undefined,
    attached_files_summary: coachAttachedFiles.map(f => ({
      name: f.name, type: f.type, size: f.size, encoding: f.encoding,
    })),
  };

  const url = `/api/run?company_id=${encodeURIComponent(companyId)}&scenario=${encodeURIComponent(JSON.stringify(payload))}`;
  homeEventSource = new EventSource(url);
  let completed = 0;
  const total = runAgents.length;

  homeEventSource.addEventListener("step", event => {
    const data = JSON.parse(event.data);
    const label = data.label;
    if(data.status === "running"){
      homeStepStatus[label] = "running";
    } else if(data.status === "done"){
      completed += 1;
      homeStepStatus[label] = "done";
      homeRunResults[label] = data.output || "결과 없음";
      if(resultBox){
        const progressBar = resultBox.querySelector(".home-progress-fill");
        if(progressBar) progressBar.style.width = `${Math.round((completed / total) * 100)}%`;
      }
    } else if(data.status === "error"){
      homeStepStatus[label] = "error";
      homeRunResults[label] = data.error || "오류 발생";
    }
    homeRenderDetail();
  });

  homeEventSource.addEventListener("workflow", event => {
    const data = JSON.parse(event.data);
    if(data.status === "completed"){
      homeRenderSummary(prompt, companyId, "agents", displayCompanyId);
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      if(homeEventSource){ homeEventSource.close(); homeEventSource = null; }
    } else if(data.status === "failed"){
      if(resultBox){
        resultBox.innerHTML = `<h3>AI 분석 결과</h3><p class="high">분석 중 오류가 발생했습니다.</p>`;
      }
      setHomeActionLabel(btn, "AI실행");
      btn.disabled = false;
      if(homeEventSource){ homeEventSource.close(); homeEventSource = null; }
    }
  });

  homeEventSource.onerror = () => {
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    if(homeEventSource){ homeEventSource.close(); homeEventSource = null; }
  };
}

// ── 홈 분석: LLM 직접 답변 표시 ───────────────────────────────────────────────
function homeShowLlmAnswer(prompt, answer, reasoning, btn){
  const resultBox = document.getElementById("homeResultBox");
  const detail = document.getElementById("homeAnalysisDetail");
  if(detail) detail.style.display = "none";
  if(resultBox){
    resultBox.innerHTML = `
      <h3>AI 분석 결과</h3>
      <p class="muted" style="font-size:12px;margin-bottom:8px">
        ${escapeHtml(reasoning || "내부 AI 서비스 없이 LLM이 직접 답변합니다.")}
      </p>
      <div class="markdown-output">${markdownToHtml(answer || "결과 없음")}</div>
    `;
  }
  setHomeActionLabel(btn, "AI실행");
  btn.disabled = false;
}

// ── 홈 분석 진입점 — 프롬프트 의도 분석 후 분기 ──────────────────────────────
async function homeRunAnalysis(prompt, btn){
  if(homeEventSource){ try{ homeEventSource.close(); }catch(e){} homeEventSource = null; }
  homeRunResults = {};
  homeStepStatus = {};

  const resultBox = document.getElementById("homeResultBox");
  const detail = document.getElementById("homeAnalysisDetail");
  const selectedOptions = homeSelectedAnalysisOptions();
  const selectedRunAgents = homeRunAgentsFromSelection(selectedOptions);
  const hasSelectedInternalTool = selectedRunAgents.length > 0;

  // 로딩 상태 표시
  if(resultBox){
    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <h3>AI 분석 결과</h3>
      <div class="home-running-line">
        <span class="home-running-dot"></span>
        <span>${hasSelectedInternalTool ? "선택된 데이터소스와 AI 서비스를 준비합니다." : "선택된 데이터소스/AI 서비스가 없어 LLM 자체 답변으로 처리합니다."}</span>
      </div>
      <div class="home-running-prompt">${escapeHtml(prompt)}</div>
    `;
  }
  if(detail){ detail.style.display = "none"; }

  setHomeActionLabel(btn, "분석 중…");
  btn.disabled = true;

  // AI 코칭 결과에서 추천 에이전트 키 추출
  const coachUses = [...new Set(
    (coachSuggestions || []).flatMap(s => s.uses || [])
  )];

  if(!hasSelectedInternalTool){
    let answer = "";
    try {
      const r = await fetch("/api/llm_query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          upload_session_id: coachUploadSessionId || undefined,
          attached_files: coachAttachedFiles.map(f => ({
            name: f.name, type: f.type, size: f.size, encoding: f.encoding,
          })),
        }),
      });
      const d = await r.json();
      answer = d.answer || "결과를 가져올 수 없습니다.";
    } catch(e) {
      answer = "LLM 호출에 실패했습니다.";
    }
    homeShowLlmAnswer(prompt, answer, "선택된 데이터소스/AI 서비스 없음 · LLM 자체 답변", btn);
    return;
  }

  // 1단계: LLM으로 프롬프트 의도 분석
  let intent;
  try {
    const res = await fetch("/api/analyze_intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        coach_uses: coachUses,
        selected_sources: selectedOptions.sources,
        selected_agents: selectedOptions.agents,
        upload_session_id: coachUploadSessionId || undefined,
        attached_files: coachAttachedFiles.map(f => ({
          name: f.name, type: f.type, size: f.size, encoding: f.encoding,
        })),
      }),
    });
    intent = await res.json();
  } catch(e) {
    if(resultBox) resultBox.innerHTML = `<h3>AI 분석 결과</h3><p class="high">서버 연결에 실패했습니다.</p>`;
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    return;
  }

  // LLM 사용 불가 에러
  if(intent.mode === "error"){
    if(resultBox) resultBox.innerHTML = `<h3>AI 분석 결과</h3><p class="high">${escapeHtml(intent.error || "LLM을 사용할 수 없습니다.")}</p>`;
    setHomeActionLabel(btn, "AI실행");
    btn.disabled = false;
    return;
  }

  const mode       = intent.mode || "agents";
  const reasoning  = intent.reasoning || "";
  const agentDefs  = intent.agent_defs || [];
  const detectedCompanyId = intent.company_id || detectCompanyId(prompt);
  const runCompanyId = detectedCompanyId || "__NO_COMPANY_SELECTED__";

  // 2단계: 모드별 분기
  if(mode === "llm_direct" && !hasSelectedInternalTool){
    // LLM 직접 답변 — 이미 intent.llm_answer에 포함됐거나 별도 쿼리
    let answer = (intent.llm_answer || "").trim();
    if(!answer){
      // intent 분석에서 LLM이 답변을 주지 못한 경우 별도 호출
      try {
        const r = await fetch("/api/llm_query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            upload_session_id: coachUploadSessionId || undefined,
            attached_files: coachAttachedFiles.map(f => ({
              name: f.name, type: f.type, size: f.size, encoding: f.encoding,
            })),
          }),
        });
        const d = await r.json();
        answer = d.answer || "결과를 가져올 수 없습니다.";
      } catch(e) {
        answer = "LLM 호출에 실패했습니다.";
      }
    }
    homeShowLlmAnswer(prompt, answer, reasoning, btn);
    return;
  }

  // agents 모드 — LLM이 선택한 에이전트만 실행
  const runAgents = selectedRunAgents.length ? selectedRunAgents : agentDefs;

  // 기업 ID 표시 업데이트
  if(resultBox){
    const agentNames = runAgents.map(a => a.label).join(", ");
    const targetText = detectedCompanyId ? ` (대상 기업: <b>${escapeHtml(detectedCompanyId)}</b>)` : "";
    resultBox.innerHTML = `
      <h3>AI 분석 결과</h3>
      <div class="home-running-line">
        <span class="home-running-dot"></span>
        <span>분석 중입니다…${targetText}</span>
      </div>
      <div class="home-running-prompt">${escapeHtml(prompt)}</div>
      <div class="home-progress-bar"><div class="home-progress-fill" style="width:0%"></div></div>
      <p class="muted" style="font-size:12px;margin-top:6px">
        실행 AI 서비스: ${escapeHtml(agentNames)}
        ${reasoning ? `<br>판단 근거: ${escapeHtml(reasoning)}` : ""}
      </p>
      ${homeDetailMarkup()}
    `;
  }
  if(detail){ detail.style.display = "none"; }

  homeStreamAgents(prompt, runCompanyId, runAgents, btn, detectedCompanyId);
}

function homeRenderSummary(prompt, companyId, mode, displayCompanyId = ""){
  const resultBox = document.getElementById("homeResultBox");
  if(!resultBox) return;

  // llm_direct 모드는 homeShowLlmAnswer에서 이미 처리됨
  if(mode === "llm_direct") return;

  // agents 모드: 실행된 에이전트 결과에서 요약 도출
  const reportText = homeResultByLabel("보고서 생성");
  const mlText     = Object.values(homeRunResults).find((_v, _i) =>
    Object.keys(homeRunResults)[_i].includes("ML 위험모델") || Object.keys(homeRunResults)[_i].includes("ML 모델")) || homeResultByLabel("ML 위험모델", "ML 모델") || "";
  const dvText     = homeResultByLabel("수입신고검증");

  // ML/검증 결과가 없으면 전체 결과에서 위험도 패턴 탐지
  const allResults = Object.values(homeRunResults).join("\n");
  const riskHigh   = /고위험|🔴|저가신고|위반/.test(mlText + dvText + allResults);
  const riskMed    = /주의|🟡/.test(mlText + dvText + allResults);
  const riskWord   = riskHigh ? "높음" : (riskMed ? "보통" : "낮음");
  const riskClass  = riskHigh ? "high" : (riskMed ? "" : "good");

  const scoreMatch = allResults.match(/(\d{2,3})\s*\/\s*100|위험점수[^\d]*(\d{2,3})/);
  const score    = scoreMatch ? (scoreMatch[1] || scoreMatch[2]) : (riskHigh ? "82" : riskMed ? "56" : "35");
  const priority = riskHigh ? "1순위" : "2순위";
  const recommend = riskHigh ? "추가자료 요청" : "정기 모니터링";

  // 보고서 or 가장 긴 결과 텍스트에서 요약 추출
  const summarySource = reportText ||
    Object.values(homeRunResults).sort((a, b) => b.length - a.length)[0] || "";
  const summaryLines = summarySource
    .split("\n")
    .filter(l => l.trim() && !/^[#\-=]+$/.test(l.trim()))
    .slice(0, 4)
    .join(" ")
    .slice(0, 300);
  const summary = summaryLines || "분석이 완료되었습니다. 각 AI 서비스의 분석 결과는 아래 상세 결과에서 확인하실 수 있습니다.";

  const agentCount = Object.keys(homeStepStatus).length;
  const hasReport  = Object.keys(homeRunResults).some(label => label.includes("보고서 생성"));
  const hasShare   = Object.keys(homeRunResults).some(label => label.includes("내부메일 공유"));
  const targetSummary = displayCompanyId
    ? `대상 기업 <b>${escapeHtml(displayCompanyId)}</b> · `
    : "";

  resultBox.innerHTML = `
    <h3>AI 분석 결과</h3>
    <p>${targetSummary}${agentCount}개 AI 서비스 분석 완료${coachAttachedFiles.length ? ` · 첨부 파일 ${coachAttachedFiles.length}건 활용` : ""}</p>
    ${hasShare ? `<p class="good" style="margin-top:4px">분석 결과보고서가 내부메일 공유 대상으로 준비되었습니다.</p>` : ""}
    <div class="markdown-output" style="margin-top:8px">${markdownToHtml(summary)}</div>
    ${hasReport || riskHigh || riskMed ? `
    <div class="kpi">
      <div>위험 가능성 <b class="${riskClass}">${riskWord}</b></div>
      <div>위험도 점수 <b class="${riskClass}">${score}/100</b></div>
      <div>조사 우선순위 <b>${priority}</b></div>
      <div>권고 조치 <b style="font-size:14px">${recommend}</b></div>
    </div>` : ""}
    ${homeDetailMarkup()}
  `;
}

function loadCanvasState(){
  try{
    const saved = JSON.parse(localStorage.getItem(canvasStateKey) || "{}");
    if(Array.isArray(saved.customCanvasJobs)) customCanvasJobs = saved.customCanvasJobs;
    if(Array.isArray(saved.customGenInvCases)) customGenInvCases = saved.customGenInvCases;
    if(saved.activeCanvasCompanyId) activeCanvasCompanyId = saved.activeCanvasCompanyId;
    if(saved.activeScenarioTemplateId) activeScenarioTemplateId = saved.activeScenarioTemplateId;
    if(saved.latestReport) latestReport = saved.latestReport;
    if(saved.latestValidation) latestValidation = saved.latestValidation;
    if(saved.companyScenarios && typeof saved.companyScenarios === "object") companyScenarios = saved.companyScenarios;
    if(saved.userPermissions && typeof saved.userPermissions === "object"){
      userPermissions = {...defaultUserPermissions, ...saved.userPermissions};
    }
    if(saved.canvasJobOverrides && typeof saved.canvasJobOverrides === "object") canvasJobOverrides = saved.canvasJobOverrides;
    if(saved.canvasRunArchives && typeof saved.canvasRunArchives === "object") canvasRunArchives = saved.canvasRunArchives;
    if(saved.hiddenCanvasJobsByUser && typeof saved.hiddenCanvasJobsByUser === "object") hiddenCanvasJobsByUser = saved.hiddenCanvasJobsByUser;
    if(saved.userWorkspaces && typeof saved.userWorkspaces === "object") userWorkspaces = saved.userWorkspaces;
    if(Array.isArray(saved.customTemplates)) customTemplates = saved.customTemplates;
    if(Array.isArray(saved.hiddenBuiltinIds)) hiddenBuiltinIds = new Set(saved.hiddenBuiltinIds);
    if(saved.builtinOverrides && typeof saved.builtinOverrides === "object") builtinOverrides = saved.builtinOverrides;
    if(saved.currentUserId) currentUserId = saved.currentUserId;
    migrateLegacyWorkspaceState(saved);
    restoreUserWorkspace(currentUserId);
  }catch(error){
    console.warn("진행작업 상태를 불러오지 못했습니다.", error);
  }
}

function saveCanvasState(){
  try{
    saveCurrentUserWorkspace();
    localStorage.setItem(canvasStateKey, JSON.stringify({
      customCanvasJobs,
      customGenInvCases,
      activeCanvasCompanyId,
      activeScenarioTemplateId,
      latestReport,
      latestValidation,
      companyScenarios,
      userPermissions,
      canvasJobOverrides,
      canvasRunArchives,
      hiddenCanvasJobsByUser,
      userWorkspaces,
      customTemplates,
      hiddenBuiltinIds: [...hiddenBuiltinIds],
      builtinOverrides,
      currentUserId,
      generalInvTab,
      activeGenInvCaseId,
      drugInvTab,
      activeDrugCaseId,
      investigationTab,
    }));
  }catch(error){
    console.warn("진행작업 상태를 저장하지 못했습니다.", error);
  }
}

function cloneSavedValue(value, fallback){
  if(value === undefined || value === null) return fallback;
  try{
    return JSON.parse(JSON.stringify(value));
  }catch(error){
    return fallback;
  }
}

function migrateLegacyWorkspaceState(saved){
  if(!currentUserId) return;
  const existing = userWorkspaces[currentUserId];
  const hasWorkspaceWork = existing && (
    Array.isArray(existing.customCanvasJobs) ||
    Array.isArray(existing.customGenInvCases) ||
    Array.isArray(existing.defaultGenInvCasesState) ||
    existing.companyScenarios ||
    existing.canvasRunArchives ||
    existing.canvasJobOverrides
  );
  const hasLegacyWork = (
    Array.isArray(saved.customCanvasJobs) ||
    Array.isArray(saved.customGenInvCases) ||
    saved.companyScenarios ||
    saved.canvasRunArchives ||
    saved.canvasJobOverrides
  );
  if(hasWorkspaceWork || !hasLegacyWork) return;
  userWorkspaces[currentUserId] = {
    ...(existing || {}),
    customCanvasJobs: cloneSavedValue(customCanvasJobs, []),
    customGenInvCases: cloneSavedValue(customGenInvCases, []),
    defaultGenInvCasesState: cloneSavedValue(defaultGenInvCases, []),
    companyScenarios: cloneSavedValue(companyScenarios, {}),
    canvasJobOverrides: cloneSavedValue(canvasJobOverrides, {}),
    canvasRunArchives: cloneSavedValue(canvasRunArchives, {}),
    hiddenCanvasJobIds: cloneSavedValue(hiddenCanvasJobsByUser[currentUserId] || [], []),
  };
}

function saveCurrentUserWorkspace(){
  if(!currentUserId) return;
  userWorkspaces[currentUserId] = {
    ...(userWorkspaces[currentUserId] || {}),
    activeCanvasCompanyId,
    activeScenarioTemplateId,
    investigationTab,
    canvasTab,
    generalInvTab,
    activeGenInvCaseId,
    latestReport,
    latestValidation,
    customCanvasJobs: cloneSavedValue(customCanvasJobs, []),
    customGenInvCases: cloneSavedValue(customGenInvCases, []),
    defaultGenInvCasesState: cloneSavedValue(defaultGenInvCases, []),
    companyScenarios: cloneSavedValue(companyScenarios, {}),
    canvasJobOverrides: cloneSavedValue(canvasJobOverrides, {}),
    canvasRunArchives: cloneSavedValue(canvasRunArchives, {}),
    hiddenCanvasJobIds: cloneSavedValue(hiddenCanvasJobsByUser[currentUserId] || [], []),
    updatedAt: new Date().toISOString(),
  };
}

function restoreWorkspaceWorkState(userId){
  const workspace = userWorkspaces[userId] || {};
  customCanvasJobs = Array.isArray(workspace.customCanvasJobs)
    ? cloneSavedValue(workspace.customCanvasJobs, [])
    : [];
  customGenInvCases = Array.isArray(workspace.customGenInvCases)
    ? cloneSavedValue(workspace.customGenInvCases, [])
    : [];
  defaultGenInvCases.splice(
    0,
    defaultGenInvCases.length,
    ...cloneSavedValue(defaultGenInvCasesBaseline, [])
  );
  if(Array.isArray(workspace.defaultGenInvCasesState)){
    workspace.defaultGenInvCasesState.forEach(savedCase => {
      const idx = defaultGenInvCases.findIndex(item => item.caseId === savedCase.caseId);
      if(idx >= 0) Object.assign(defaultGenInvCases[idx], cloneSavedValue(savedCase, defaultGenInvCases[idx]));
    });
  }
  companyScenarios = workspace.companyScenarios && typeof workspace.companyScenarios === "object"
    ? cloneSavedValue(workspace.companyScenarios, {})
    : {};
  canvasJobOverrides = workspace.canvasJobOverrides && typeof workspace.canvasJobOverrides === "object"
    ? cloneSavedValue(workspace.canvasJobOverrides, {})
    : {};
  canvasRunArchives = workspace.canvasRunArchives && typeof workspace.canvasRunArchives === "object"
    ? cloneSavedValue(workspace.canvasRunArchives, {})
    : {};
  hiddenCanvasJobsByUser[userId] = Array.isArray(workspace.hiddenCanvasJobIds)
    ? cloneSavedValue(workspace.hiddenCanvasJobIds, [])
    : (hiddenCanvasJobsByUser[userId] || []);
}

function restoreUserWorkspace(userId){
  restoreWorkspaceWorkState(userId);
  const firstVisibleJob = () => activeCanvasJobs()[0] || null;
  const workspace = userWorkspaces[userId] || {};
  const candidate = workspace.activeCanvasCompanyId;
  const visibleIds = new Set(activeCanvasJobs().map(job => job.companyId));
  const fallbackJob = firstVisibleJob();

  if(candidate && visibleIds.has(candidate)){
    activeCanvasCompanyId = candidate;
  }else if(fallbackJob){
    activeCanvasCompanyId = fallbackJob.companyId;
  }

  activeScenarioTemplateId = workspace.activeScenarioTemplateId || activeScenarioTemplateId || "customs-basic";
  investigationTab = workspace.investigationTab || "ongoing";
  canvasTab = workspace.canvasTab || "overview";
  generalInvTab = workspace.generalInvTab || "cases";
  activeGenInvCaseId = workspace.activeGenInvCaseId && allGenInvCases().some(item => item.caseId === workspace.activeGenInvCaseId)
    ? workspace.activeGenInvCaseId
    : null;
  drugInvTab = workspace.drugInvTab || "ongoing";
  activeDrugCaseId = workspace.activeDrugCaseId && defaultDrugInvCases.some(c => c.caseId === workspace.activeDrugCaseId)
    ? workspace.activeDrugCaseId
    : null;
  scenarioLoadedForCompany = null;
  scenarioInitialized = false;
  loadCompanyRunArchive(activeCanvasCompanyId);
  scenarioItems = getCompanyScenario(activeCanvasCompanyId);
  selectedScenarioId = scenarioItems[0]?.id || null;
}

function getCompanyScenario(companyId){
  const saved = companyScenarios[companyId];
  if(saved && saved.length) return saved.map((item, index) => normalizeScenarioItem({...item}, index));
  return cloneTemplateItems("customs-basic");
}

function saveCompanyScenario(){
  if(!activeCanvasCompanyId) return;
  companyScenarios[activeCanvasCompanyId] = scenarioItems.map(item => ({...item}));
  const archive = canvasRunArchives[activeCanvasCompanyId];
  if(archive && archive.scenarioSignature && archive.scenarioSignature !== scenarioSignature()){
    patchCanvasJob(activeCanvasCompanyId, {
      scenarioChanged: true,
      status: { label:"재실행 필요", tone:"review" },
      archived: false,
    });
  }
  saveCanvasState();
}

function permissionStatus(key){
  return userPermissions[key] || "locked";
}

function hasPermission(key){
  return permissionStatus(key) === "granted";
}

function permissionLabel(status){
  if(status === "granted") return "사용 가능";
  if(status === "requested") return "요청중";
  return "권한 없음";
}

function uniqueByKey(items){
  const seen = new Set();
  return items.filter(item => {
    if(!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function requestPermissions(keys){
  keys.forEach(key => {
    if(permissionStatus(key) !== "granted") userPermissions[key] = "requested";
  });
  saveCanvasState();
  renderSidebarPermissions();
  const sourceSelect = document.getElementById("scenarioSourceSelect");
  if(sourceSelect){
    const selected = sourceSelect.value;
    sourceSelect.innerHTML = scenarioSourceOptionsHtml();
    sourceSelect.value = selected;
  }
}


function currentUser(){ return sampleUsers.find(u => u.id === currentUserId) || sampleUsers[0]; }
function currentUserGroup(){ const u = currentUser(); return userGroups.find(g => g.id === u.groupId) || userGroups[0]; }
function isCurrentUserAdmin(){ return currentUserGroup().isAdmin === true; }

function buildGroupPermissions(group){
  const perms = {};
  Object.keys(defaultUserPermissions).forEach(key => {
    perms[key] = (group.rag.includes(key) || group.agents.includes(key) || key === "mail_share") ? "granted" : "locked";
  });
  return perms;
}

function applyUserSwitch(userId){
  saveCurrentUserWorkspace();
  currentUserId = userId;
  const user  = sampleUsers.find(u => u.id === userId) || sampleUsers[0];
  const group = userGroups.find(g => g.id === user.groupId) || userGroups[0];
  userPermissions = buildGroupPermissions(group);
  restoreUserWorkspace(currentUserId);
  currentPage = "home";
  saveCanvasState();
  renderSidebarPermissions();
  updateProfileDisplay();
  updateAdminMenuVisibility();
}

function updateProfileDisplay(){
  const user  = currentUser();
  const group = currentUserGroup();
  const avatarEl = document.getElementById("profileAvatar");
  const nameEl   = document.getElementById("profileName");
  const teamEl   = document.getElementById("profileTeam");
  if(avatarEl) avatarEl.textContent = user.avatar;
  if(nameEl)   nameEl.textContent   = user.name;
  if(teamEl)   teamEl.textContent   = `${group.org} ${group.team}`;
}

function updateAdminMenuVisibility(){
  const permBtn = document.querySelector(".permission-approve-nav");
  if(!permBtn) return;
  permBtn.style.display = isCurrentUserAdmin() ? "" : "none";
}

function renderUserList(){
  const orgs = [...new Set(userGroups.map(g => g.org))];
  return orgs.map(org => {
    const groups = userGroups.filter(g => g.org === org);
    return `
      <div class="user-org-section">
        <h3 class="user-org-title">${escapeHtml(org)}</h3>
        <div class="user-grid">
          ${groups.map(group => {
            const user = sampleUsers.find(u => u.groupId === group.id);
            if(!user) return "";
            const isActive = user.id === currentUserId;
            return `
              <button class="user-card ${isActive ? "active" : ""} ${group.isAdmin ? "is-admin" : ""}" data-switch-user="${user.id}">
                <div class="user-card-avatar">${escapeHtml(user.avatar)}</div>
                <div class="user-card-info">
                  <strong>${escapeHtml(user.name)}</strong>
                  <span>${escapeHtml(group.team)}</span>
                  ${group.isAdmin ? `<em class="user-admin-badge">관리자</em>` : ""}
                </div>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function openUserSelectModal(){
  let overlay = document.getElementById("userSelectOverlay");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "userSelectOverlay";
    overlay.className = "user-select-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="user-select-modal">
      <div class="user-select-head">
        <div>
          <h2>사용자 선택</h2>
          <p class="muted">프로토타입 — 로그인 대체용 담당자 전환</p>
        </div>
        <button class="user-select-close" id="userSelectClose">✕</button>
      </div>
      <div class="user-select-body">${renderUserList()}</div>
    </div>
  `;
  overlay.style.display = "flex";
  document.getElementById("userSelectClose").addEventListener("click", () => overlay.style.display = "none");
  overlay.addEventListener("click", e => { if(e.target === overlay) overlay.style.display = "none"; });
  overlay.querySelectorAll("[data-switch-user]").forEach(btn => {
    btn.addEventListener("click", () => {
      applyUserSwitch(btn.dataset.switchUser);
      overlay.style.display = "none";
      render("home");
    });
  });
}

function updatePermissionBadge(){
  const btn = document.querySelector(".permission-approve-nav");
  if(!btn) return;
  const pendingCount = Object.values(userPermissions).filter(s => s === "requested").length;
  btn.dataset.pending = pendingCount > 0 ? "true" : "false";
  btn.title = pendingCount > 0 ? `승인 대기 ${pendingCount}건` : "권한 승인";
}

function renderSidebarPermissions(){
  Object.entries(sidebarPermissionGroups).forEach(([panelId, keys]) => {
    const rows = document.querySelectorAll(`#${panelId} .toggle-row`);
    rows.forEach((row, index) => {
      const key = keys[index];
      const input = row.querySelector("input");
      if(!key || !input) return;
      const status = permissionStatus(key);
      row.dataset.permissionKey = key;
      row.classList.toggle("granted", status === "granted");
      row.classList.toggle("requested", status === "requested");
      row.classList.toggle("locked", status === "locked");
      input.checked = status === "granted";
      input.disabled = true;
      row.querySelector(".permission-meta")?.remove();
      if(status === "requested"){
        row.insertAdjacentHTML("beforeend", `
          <span class="permission-meta">
            <b>요청중</b>
          </span>
        `);
      }
    });
  });
  updatePermissionBadge();
}

function syncSidebarCollapseIcons(){
  document.querySelectorAll(".collapsible-label").forEach(button => {
    const target = document.getElementById(button.dataset.collapseTarget);
    const icon = button.querySelector("span");
    if(target && icon) icon.textContent = target.classList.contains("collapsed") ? "▶" : "▼";
  });
}

/* ═══════════════════════════════════════════════════════════════
   일반수사 분석 페이지
═══════════════════════════════════════════════════════════════ */

function generalInvPage(){
  const aCase = activeGenInvCase();
  const tab   = generalInvTab;
  const showSubs = !!aCase;
  const profileLabel = aCase && aCase.targetType === "person" ? "우범자 프로파일" : "기업 프로파일";
  return `
    <section class="card gi-hub${(tab==="workbench"||tab==="report") ? " gi-hub-full" : ""}">
      <div class="gi-page-head">
        <div>
          <h2>일반수사 분석</h2>
          <p class="muted">관세청 조사국이 수행하는 일반수사 대상을 등록하고, 수사 유형별 표준 분석시나리오에 따라 수사를 진행합니다.</p>
        </div>
        ${aCase ? `
          <div class="gi-active-badge">
            <span class="muted">수사 대상</span>
            <strong>${escapeHtml(aCase.targetName)}</strong>
            <span class="gi-type-chip ${genInvTypeById(aCase.invTypeId).cls}">${genInvTypeById(aCase.invTypeId).num} ${escapeHtml(genInvTypeById(aCase.invTypeId).label)}</span>
          </div>
        ` : ""}
      </div>
      <div class="gi-tab-nav">
        <button class="gi-tab${tab==="cases"?" active":""}" data-gi-tab="cases">진행중인 수사</button>
        ${showSubs ? `
          <button class="gi-tab${tab==="profile"?" active":""}" data-gi-tab="profile">${profileLabel}</button>
          <button class="gi-tab${tab==="data"?" active":""}" data-gi-tab="data">기초자료 수집/등록</button>
          <button class="gi-tab${tab==="workbench"?" active":""}" data-gi-tab="workbench">분석 시나리오 설정 및 수행</button>
          <button class="gi-tab${tab==="report"?" active":""}" data-gi-tab="report">분석 보고서 및 검증</button>
        ` : ""}
      </div>
      <div class="gi-tab-body">
        ${generalInvTabContent()}
      </div>
    </section>
  `;
}

function generalInvTabContent(){
  if(generalInvTab === "profile")   return generalInvProfilePanel();
  if(generalInvTab === "data")      return generalInvDataPanel();
  if(generalInvTab === "workbench") return generalInvWorkbenchPanel();
  if(generalInvTab === "report")    return generalInvReportPanel();
  return generalInvCasesPanel();
}

/* ── [진행중인 수사] 패널 ──────────────────────────────────── */
function generalInvCasesPanel(){
  const all = allGenInvCases();
  const q   = genInvFilter.toLowerCase();
  const filtered = q ? all.filter(c =>
    c.targetName.toLowerCase().includes(q) ||
    c.caseId.toLowerCase().includes(q) ||
    genInvTypeById(c.invTypeId).label.includes(q)
  ) : all;

  return `
    <div class="gi-cases-panel">
      <div class="gi-cases-toolbar">
        <input class="gi-search" id="giSearchInput" placeholder="수사대상, 사건번호, 수사유형 검색..."
          value="${escapeHtml(genInvFilter)}">
        <button class="btn gi-reg-toggle-btn" data-gi-reg-toggle type="button">
          ${showGenInvRegForm ? "✕ 닫기" : "+ 수사 등록"}
        </button>
      </div>

      ${showGenInvRegForm ? generalInvRegForm() : ""}

      <div class="gi-case-board">
        ${filtered.map(genInvCaseCard).join("") ||
          `<div class="empty-state">등록된 수사 대상이 없습니다. 수사 등록 버튼으로 추가하세요.</div>`}
      </div>

      <div class="overview-archive-section">
        <button class="overview-archive-toggle" data-gi-toggle-archive>
          완료건 확인 <strong>(${archivedGenInvCases.length}건)</strong>
          <span>${genInvArchiveOpen ? "▲" : "▼"}</span>
        </button>
        ${genInvArchiveOpen ? `
          <div class="job-board archive-board" style="margin-top:12px">
            ${archivedGenInvCases.map(c => {
              const type = genInvTypeById(c.invTypeId);
              return `
                <article class="job-card archive-card" tabindex="0">
                  <div class="job-card-head">
                    <div>
                      <span class="gi-case-no">${escapeHtml(c.caseId)}</span>
                      <h3>${escapeHtml(c.targetName)}</h3>
                      <p class="muted">${escapeHtml(c.investigator)} · ${escapeHtml(c.team)} · ${escapeHtml(c.updated)}</p>
                    </div>
                    <div class="job-status-row">
                      <span class="job-status done">아카이브</span>
                      <button class="btn-inline-action" data-gi-restore-case="${escapeHtml(c.caseId)}">복원</button>
                    </div>
                  </div>
                  <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
                  <div class="archive-summary" style="margin-top:8px">
                    <span>${c.status.done}/${c.status.total} 단계 완료</span>
                    <strong>${c.status.pct}%</strong>
                  </div>
                </article>`;
            }).join("") || `<div class="empty-state">완료된 수사 결과가 없습니다.</div>`}
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function genInvCaseCard(c){
  const type     = genInvTypeById(c.invTypeId);
  const isActive = c.caseId === activeGenInvCaseId;
  const isDone   = c.status.pct >= 100 || c.status.tone === "done";
  return `
    <article class="gi-case-card${isActive ? " active" : ""}" data-gi-case="${escapeHtml(c.caseId)}" tabindex="0" role="button">
      <div class="gi-case-head">
        <div>
          <span class="gi-case-no">${escapeHtml(c.caseId)}</span>
          <h3 class="gi-case-name">${escapeHtml(c.targetName)}</h3>
        </div>
        <div class="job-status-row">
          <span class="job-status ${c.status.tone}">${c.status.label}</span>
          ${isDone ? `<button class="btn-inline-action" data-gi-archive-case="${escapeHtml(c.caseId)}" title="아카이브">아카이브</button>` : ""}
          <button class="btn-inline-action job-remove-action" data-gi-remove-case="${escapeHtml(c.caseId)}" title="삭제">삭제</button>
        </div>
      </div>
      <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
      <div class="job-progress"><i style="width:${c.status.pct}%"></i></div>
      <div class="job-meta">
        <span>${c.status.done}/${c.status.total} 단계</span>
        <strong>${c.status.pct}%</strong>
      </div>
      <div class="gi-case-foot">
        <span class="muted">${escapeHtml(c.investigator)} · ${escapeHtml(c.team)}</span>
        <span class="muted">${escapeHtml(c.updated)}</span>
      </div>
    </article>
  `;
}

function generalInvRegForm(){
  const isCo = giRegTargetType === "company";
  if(!isCo && !riskPersons.length && !riskPersonsLoading) loadRiskPersons();

  const targetOptions = isCo
    ? `<option value="">-- 기업을 선택하세요 --</option>
       ${scenarioCompanies.map(c =>
         `<option value="${escapeHtml(c.company_id)}">${escapeHtml(c.company_name||c.company_id)} (${escapeHtml(c.company_id)})</option>`
       ).join("")}`
    : `<option value="">-- 우범자를 선택하세요 --</option>
       ${riskPersonsLoading
         ? `<option disabled>로딩 중...</option>`
         : riskPersons.map(p =>
             `<option value="${escapeHtml(p.person_id)}">${escapeHtml(p.name)} (${escapeHtml(p.person_id)}) · ${escapeHtml(p.risk_level||"-")}</option>`
           ).join("")}`;

  return `
    <div class="gi-reg-form" style="padding:12px 16px">
      <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:nowrap">

        <!-- ① 수사대상 유형 -->
        <div style="flex:none">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사대상 유형 <span style="color:var(--red)">*</span></label>
          <div style="display:flex;gap:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;height:36px">
            <button type="button" data-gi-reg-type="company"
              style="padding:0 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;
                     background:${isCo?"#1e40af":"#fff"};color:${isCo?"#fff":"#41506a"}">기업</button>
            <button type="button" data-gi-reg-type="person"
              style="padding:0 14px;font-size:12px;font-weight:600;border:none;border-left:1px solid var(--line);cursor:pointer;
                     background:${!isCo?"#1e40af":"#fff"};color:${!isCo?"#fff":"#41506a"}">개인</button>
          </div>
        </div>

        <!-- ② 수사대상 선택 -->
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사대상 선택 <span style="color:var(--red)">*</span></label>
          <select id="giRegTargetSelect" class="gi-reg-select" style="width:100%;height:36px">
            ${targetOptions}
          </select>
        </div>

        <!-- ③ 수사 유형 선택 -->
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사 유형 선택 <span style="color:var(--red)">*</span></label>
          <select id="giRegTypeSelect" class="gi-reg-select" style="width:100%;height:36px">
            ${GEN_INV_TYPES.map(t =>
              `<option value="${t.id}">${t.num} ${escapeHtml(t.label)}</option>`
            ).join("")}
          </select>
        </div>

        <!-- ④ 등록/취소 -->
        <button class="btn" type="button" data-gi-register style="height:36px;padding:0 20px;white-space:nowrap;flex:none">등록</button>
        <button class="btn secondary" type="button" data-gi-reg-toggle style="height:36px;padding:0 16px;white-space:nowrap;flex:none">취소</button>
      </div>
    </div>
  `;
}

/* ── 서브탭 스텁 패널들 ────────────────────────────────────── */
function generalInvProfilePanel(){
  const aCase = activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const type = genInvTypeById(aCase.invTypeId);
  if(aCase.targetType === "company"){
    const companyId = generalInvCompanyId(aCase);
    if(!companyId){
      return `
        <div class="gi-stub-panel">
          <div class="gi-stub-head">
            <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
            <h3>${escapeHtml(aCase.targetName)} <span class="muted">${escapeHtml(aCase.caseId)}</span></h3>
          </div>
          <div class="profile-loading">연결된 기업 프로파일을 찾지 못했습니다. 수사 대상명을 기업 위험도 대시보드의 업체명과 맞춰 등록하세요.</div>
        </div>
      `;
    }
    return canvasProfilePanel(companyId, {
      selectedLabel: "수사 대상 기업",
      archive: null,
      changed: false,
      reportAction: `<button class="btn secondary" data-gi-tab="report">분석 보고서 보기</button>`,
      scenarioAction: `<button class="btn" data-gi-tab="workbench">분석 시나리오 설정</button>`,
    });
  }
  const person = riskPersonById(aCase.personId);
  return `
    <div class="gi-stub-panel">
      <div class="gi-stub-head">
        <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
        <h3>${escapeHtml(aCase.targetName)} <span class="muted">${escapeHtml(aCase.caseId)}</span></h3>
      </div>
      <div class="gi-stub-body">
        <div class="gi-stub-card">
          <strong>기본 인적사항</strong>
          <p class="muted">${person ? `${escapeHtml(person.person_id)} · ${escapeHtml(person.nationality || "-")} · ${escapeHtml(person.address_region || "-")}` : "성명, 생년월일, 국적, 주소권역, 연락처"}</p>
          <div class="gi-profile-mini">
            <span>유형 <b>${escapeHtml(person?.profile_type || aCase.personProfileType || "-")}</b></span>
            <span>위험등급 <b class="${(person?.risk_level || aCase.personRiskLevel) === "CRITICAL" || (person?.risk_level || aCase.personRiskLevel) === "HIGH" ? "high" : "mid-risk"}">${escapeHtml(person?.risk_level || aCase.personRiskLevel || "-")}</b></span>
            <span>위험점수 <b>${person?.risk_score != null ? Number(person.risk_score).toFixed(1) : aCase.personRiskScore ?? "-"}</b></span>
          </div>
        </div>
        <div class="gi-stub-card">
          <strong>수사 이력</strong>
          <p class="muted">과거 조사 이력, 적발 내역, 범칙금 부과 현황</p>
          <div class="gi-profile-mini">
            <span>상태 <b>${escapeHtml(person?.watch_status || "등록")}</b></span>
            <span>직업/활동 <b>${escapeHtml(person?.occupation || "-")}</b></span>
          </div>
        </div>
        <div class="gi-stub-card">
          <strong>연관 관계망</strong>
          <p class="muted">연관 법인·개인, 공급망 관계, 계좌 연결 현황</p>
          <div class="gi-profile-mini">
            <span>위험태그 <b>${escapeHtml(person?.risk_tags || aCase.personRiskTags || "-")}</b></span>
            <span>별칭 <b>${escapeHtml(person?.name_aliases || "-")}</b></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generalInvCompanyId(aCase){
  if(!aCase || aCase.targetType !== "company") return "";
  if(aCase.companyId) return aCase.companyId;
  const normalizedTarget = normalizeCompanyName(aCase.targetName);
  const matched = scenarioCompanies.find(company =>
    normalizeCompanyName(company.company_name || company.company_id) === normalizedTarget ||
    normalizedTarget.includes(normalizeCompanyName(company.company_name || "")) ||
    normalizeCompanyName(company.company_name || "").includes(normalizedTarget)
  );
  return matched?.company_id || "";
}

function normalizeCompanyName(name){
  return String(name || "")
    .replace(/\(주\)|주식회사|\s|\(|\)|㈜/g, "")
    .toLowerCase();
}

function generalInvDataPanel(){
  const aCase = activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const type = genInvTypeById(aCase.invTypeId);
  const caseBadge = `${type.num} ${type.label} · ${aCase.caseId}`;
  /* 기업/개인 구분 없이 동일한 패널 — subjectName으로 수사 대상명 직접 표시 */
  return canvasDataPanel(activeCanvasCompanyId, {
    selectedLabel: aCase.targetType === "company" ? "수사 대상 기업" : "수사 대상 개인",
    subjectName:   aCase.targetName,
    heading:       "기초자료 수집/등록",
    description:   "수사 대상 관련 서류, 계약서, 수입신고 자료, 금융거래 내역 등을 업로드합니다.",
    caseBadge,
  });
}

function generalInvReportPanel(){
  const aCase = activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const steps   = activeGiCaseSteps();
  const states  = aCase.stepStates  || {};
  const results = aCase.stepResults || {};
  const type    = genInvTypeById(aCase.invTypeId);

  /* 보고서 작성(gi_rep)·보고서 승인(gi_appr) 단계 찾기 */
  const repStep  = steps.find(s => s.key === "gi_rep");
  const apprStep = steps.find(s => s.key === "gi_appr");
  const repDone  = !!(repStep  && states[repStep.id]  === "done");
  const apprDone = !!(apprStep && states[apprStep.id] === "done");
  const repText  = repStep  ? (results[repStep.id]  || "") : "";
  const apprText = apprStep ? (results[apprStep.id] || "") : "";

  const placeholder = (label, tab) => `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:#94a3b8;text-align:center;padding:24px">
      <span style="font-size:36px;opacity:.25">📄</span>
      <p style="margin:0;font-size:13px;font-weight:600">${escapeHtml(label)} 미실행</p>
      <p style="margin:0;font-size:12px">'분석 시나리오 설정 및 수행' 탭에서<br>해당 단계를 실행하면 결과가 표시됩니다.</p>
      <button class="btn secondary" style="height:30px;padding:0 14px;font-size:12px" data-gi-tab="workbench">워크벤치로 이동</button>
    </div>`;

  /* 상태 배지 */
  const badge = apprDone
    ? `<span class="gi-chip-state done" style="margin-left:auto">보고서 완료</span>`
    : repDone
      ? `<span class="gi-chip-state run" style="margin-left:auto">검증 대기중</span>`
      : `<span class="gi-chip-state wait" style="margin-left:auto">보고서 미작성</span>`;

  /* 보고서 재실행 버튼 */
  const repActions = repStep ? `
    <div style="display:flex;gap:6px;align-items:center">
      <span style="font-size:12px;color:#64748b">${repDone ? "보고서 생성 완료" : "미실행"}</span>
      ${repDone
        ? `<button class="btn secondary" style="height:26px;padding:0 10px;font-size:11px" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(repStep.id)}">↺ 재작성</button>`
        : `<button class="btn" style="height:26px;padding:0 10px;font-size:11px" data-gi-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(repStep.id)}">▶ 실행</button>`}
    </div>` : "";

  const apprActions = apprStep ? `
    <div style="display:flex;gap:6px;align-items:center">
      <span style="font-size:12px;color:#64748b">${apprDone ? "검증 완료" : "미실행"}</span>
      ${apprDone
        ? `<button class="btn secondary" style="height:26px;padding:0 10px;font-size:11px" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(apprStep.id)}">↺ 재검증</button>`
        : `<button class="btn" style="height:26px;padding:0 10px;font-size:11px" data-gi-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(apprStep.id)}" ${!repDone ? "disabled title='보고서 작성 후 실행 가능'" : ""}>▶ 실행</button>`}
    </div>` : "";

  return `
    <div class="canvas-report-wrap">
      <div class="canvas-selected-company">
        <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
        <strong>${escapeHtml(aCase.targetName)}</strong>
        <span class="muted" style="font-size:12px">${escapeHtml(aCase.caseId)}</span>
        ${badge}
      </div>
      <div class="scenario-results canvas-report-results">

        <section class="scenario-result-panel">
          <div class="scenario-result-panel-head">
            <h3>수사 보고서</h3>
            ${repActions}
          </div>
          <div class="markdown-output">
            ${repDone ? markdownToHtml(repText) : placeholder("보고서 작성(gi_rep)", "workbench")}
          </div>
        </section>

        <section class="scenario-result-panel">
          <div class="scenario-result-panel-head">
            <h3>보고서 검증 · 승인</h3>
            ${apprActions}
          </div>
          <div class="markdown-output">
            ${apprDone ? markdownToHtml(apprText) : placeholder("보고서 승인(gi_appr)", "workbench")}
          </div>
        </section>

      </div>
    </div>
  `;
}

/* ── [분석 시나리오 설정 및 수행] 패널 ────────────────────── */
function generalInvWorkbenchPanel(){
  const aCase = activeGenInvCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const type   = genInvTypeById(aCase.invTypeId);
  const steps  = activeGiCaseSteps();
  if(!activeGiStepId && steps[0]) activeGiStepId = steps[0].id;
  const states = aCase.stepStates || {};
  const done   = steps.filter(s => states[s.id] === "done").length;
  const total  = steps.length;
  const pct    = total ? Math.round(done / total * 100) : 0;
  const selStep = activeGiStep();

  const typeLabel = {db:"DB 조회",agent:"AI 서비스",rag:"RAG",report:"보고서",approve:"승인"};
  /* chip CSS class: reuse canvas workbench chip type classes */
  const chipCls   = {db:"bigdata",agent:"agent",rag:"rag_customs",report:"report",approve:"validation"};

  /* ── 왼쪽 보드: 시나리오 단계 칩 목록 */
  const boardChips = steps.map((step, i) => {
    const state    = states[step.id] || "wait";
    const isActive = step.id === activeGiStepId;
    const isDone   = state === "done";
    const stateTag = isDone
      ? `<span class="gi-chip-state done">완료</span>`
      : state === "run"
        ? `<span class="gi-chip-state run">실행중</span>`
        : "";
    return `
      <div class="scenario-chip ${chipCls[step.type]||"agent"}${isActive ? " active" : ""}${isDone ? " gi-chip-done" : ""}"
        data-gi-step-select="${escapeHtml(step.id)}" tabindex="0" role="button" style="position:relative">
        <div class="chip-num"${isDone ? ' style="background:#22c55e"' : ""}>${isDone ? "✓" : i+1}</div>
        <div class="chip-body">
          <div class="chip-title-row">
            <strong>${escapeHtml(step.label)}</strong>
            ${stateTag}
          </div>
          <p style="margin:0;font-size:12px;color:#64748b">${escapeHtml(typeLabel[step.type]||step.type)} · ${escapeHtml(giScenarioInstructionPreview(step, aCase.targetType).slice(0,60))}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          ${i > 0 ? `<button class="gi-move-btn" data-gi-step-up="${escapeHtml(step.id)}" title="위로">↑</button>` : `<span style="width:22px"></span>`}
          ${i < steps.length-1 ? `<button class="gi-move-btn" data-gi-step-down="${escapeHtml(step.id)}" title="아래로">↓</button>` : `<span style="width:22px"></span>`}
        </div>
      </div>`;
  }).join("");

  /* ── 가운데: 선택된 단계 설정 */
  const configPanel = selStep ? `
    <div class="scenario-config-title" style="margin-bottom:14px">
      <strong>${escapeHtml(selStep.label)}</strong>
      <span class="gi-chip-state${states[selStep.id]==="done" ? " done" : states[selStep.id]==="run" ? " run" : " wait"}" style="margin-left:8px">
        ${states[selStep.id]==="done" ? "완료" : states[selStep.id]==="run" ? "실행중" : "대기"}
      </span>
    </div>
    <div class="scenario-agent-zone" style="overflow-y:auto;flex:1;min-height:0">
      <label class="scenario-field">
        <span>AI 서비스 단계</span>
        <select id="giWbStepSource" class="gi-reg-select" data-gi-step-id="${escapeHtml(selStep.id)}">
          ${giStepSourceOptionsHtml(canonicalGiStepKey(selStep.key))}
        </select>
      </label>
      <div class="scenario-field">
        <span>동작 선택</span>
        <div id="giWbBehaviorOptions" class="scenario-behavior-options" data-gi-step-id="${escapeHtml(selStep.id)}">
          ${behaviorOptionsHtml(selStep.sourceKey || giCommonSourceKey(selStep.key), selStep.behaviors)}
        </div>
      </div>
      <div class="scenario-source-hint">
        <div class="hint-header">
          <strong>${escapeHtml(scenarioSourceByKey(selStep.sourceKey || giCommonSourceKey(selStep.key))?.label || selStep.label)}</strong>
          <span>${escapeHtml(typeLabel[selStep.type] || selStep.type)}</span>
        </div>
        <p>${escapeHtml(sourceDefaultInstruction(selStep.sourceKey || giCommonSourceKey(selStep.key), aCase.targetType) || "이 단계의 추가 지시를 입력하세요.")}</p>
      </div>
      <label class="scenario-field">
        <span>추가 지시</span>
        <textarea id="giWbStepNote" class="gi-wb2-textarea" rows="4"
          style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;font:inherit;font-size:13px;width:100%;box-sizing:border-box;resize:vertical"
          placeholder="이 단계에서 중점적으로 확인할 내용을 입력하세요."
          data-gi-step-id="${escapeHtml(selStep.id)}">${escapeHtml(selStep.instruction || selStep.note || "")}</textarea>
      </label>
    </div>
    <div class="scenario-actions" style="margin-top:12px">
      <select id="giWbAddSource" class="gi-reg-select" style="flex:1">
        <option value="">+ 단계 추가 선택...</option>
        ${giStepSourceOptionsHtml()}
      </select>
      <button class="btn" type="button" data-gi-step-add>단계 추가</button>
      <button class="btn secondary" type="button" data-gi-step-delete="${escapeHtml(selStep.id)}">선택 삭제</button>
    </div>
  ` : `
    <div class="scenario-config-title" style="margin-bottom:14px"><strong>분석 시나리오 설정</strong></div>
    <div class="scenario-agent-zone" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#94a3b8;text-align:center;gap:8px">
      <span style="font-size:32px;opacity:.25">⚙</span>
      <p style="margin:0;font-size:13px">왼쪽에서 단계를 선택하면<br>설정을 확인하고 편집할 수 있습니다.</p>
    </div>
    <div class="scenario-actions" style="margin-top:12px">
      <select id="giWbAddSource" class="gi-reg-select" style="flex:1">
        <option value="">+ 단계 추가 선택...</option>
        ${giStepSourceOptionsHtml()}
      </select>
      <button class="btn" type="button" data-gi-step-add>단계 추가</button>
      <button class="btn secondary" type="button" disabled>선택 삭제</button>
    </div>
  `;

  /* ── 오른쪽: 실행 로그 (각 단계 상태 행) */
  const stepResults  = aCase.stepResults  || {};
  const stepExpanded = aCase.stepExpanded || {};
  const isGiRunning  = !!giRunEventSource;

  const logRows = steps.map((step, i) => {
    const state      = states[step.id] || "wait";
    const isDone     = state === "done";
    const isRun      = state === "run";
    const isError    = state === "error";
    const hasResult  = !!(stepResults[step.id]);
    const isExpanded = !!stepExpanded[step.id];

    const stateCell = isDone
      ? `<span class="gi-chip-state done">완료</span>
         ${hasResult ? `<button class="gi-log-act-btn" data-gi-toggle-result="${escapeHtml(step.id)}" title="${isExpanded?"접기":"결과 보기"}">${isExpanded ? "▲" : "▼"}</button>` : ""}
         <button class="gi-log-act-btn" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}" title="재실행">↺</button>`
      : isError
        ? `<span class="gi-chip-state" style="background:#fee2e2;color:#dc2626">오류</span>
           ${hasResult ? `<button class="gi-log-act-btn" data-gi-toggle-result="${escapeHtml(step.id)}" title="${isExpanded?"접기":"오류보기"}">${isExpanded ? "▲" : "▼"}</button>` : ""}
           <button class="gi-log-act-btn" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}" title="재실행">↺</button>`
        : isRun
          ? `<span class="gi-chip-state run" style="animation:gi-blink 1.2s infinite">실행중...</span>`
          : `<button class="gi-log-act-btn primary" data-gi-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}" title="실행" ${isGiRunning?"disabled":""}>▶</button>`;

    const resultSection = (isDone || isError) && hasResult && isExpanded
      ? `<div class="gi-log-result">${markdownToHtml(stepResults[step.id])}</div>`
      : "";

    return `
      <div class="gi-log-row${isDone ? " gi-log-done" : isRun ? " gi-log-run" : isError ? " gi-log-error" : ""}">
        <div class="gi-log-num">${isDone ? "✓" : isError ? "!" : i+1}</div>
        <div class="gi-log-name">${escapeHtml(step.label)}</div>
        <div class="gi-log-state">${stateCell}</div>
      </div>
      ${resultSection}`;
  }).join("");

  return `
    <section class="card scenario-workbench scenario-workbench-v2" style="padding:0;overflow:hidden">
      <div class="scenario-title-row" style="padding:14px 18px 0">
        <div>
          <h3 style="display:flex;align-items:center;gap:10px;margin:0 0 2px">
            <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
            ${escapeHtml(aCase.targetName)}
            <span class="muted" style="font-weight:400;font-size:13px">${escapeHtml(aCase.caseId)}</span>
          </h3>
          <p class="muted" style="margin:0;font-size:12px">수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다. 단계를 추가·삭제·순서 변경하여 맞춤형 시나리오를 구성할 수 있습니다.</p>
        </div>
        <div class="scenario-status">
          <span>${done === total && total > 0 ? "완료" : done > 0 ? "진행중" : "대기"}</span>
          <strong>${done}/${total}</strong>
        </div>
      </div>
      <div class="scenario-progress" style="margin:10px 18px 0;height:6px">
        <i style="width:${pct}%"></i>
      </div>
      <div class="scenario-layout scenario-execution-layout" style="padding:14px 18px 14px;margin-top:10px">

        <!-- 왼쪽: 시나리오 단계 목록 -->
        <section class="scenario-board">
          <div class="scenario-board-head">
            <h3>수사 시나리오</h3>
            <span class="muted" style="font-size:12px">${total}단계</span>
          </div>
          <div class="scenario-list-vertical" style="margin-top:10px">
            ${boardChips}
          </div>
        </section>

        <!-- 가운데: 단계 설정 -->
        <aside class="scenario-config" style="display:flex;flex-direction:column">
          ${configPanel}
        </aside>

        <!-- 오른쪽: 실행 로그 -->
        <section class="scenario-log" style="display:flex;flex-direction:column">
          <div class="scenario-log-head">
            <h3>분석 실행${isGiRunning ? ' <span class="gi-chip-state run" style="font-size:11px;animation:gi-blink 1.2s infinite">실행중</span>' : ""}</h3>
            <div class="scenario-log-actions">
              <button class="btn" type="button" data-gi-run-step="${escapeHtml(aCase.caseId)}:all" ${isGiRunning?"disabled":""}>
                ${isGiRunning ? "⏳ 실행중..." : "분석 실행"}
              </button>
              <button class="btn secondary" type="button" data-gi-rerun-step="${escapeHtml(aCase.caseId)}:clear">결과 지우기</button>
            </div>
          </div>
          <div class="gi-log-list scenario-step-accordion" style="margin-top:10px;flex:1;overflow-y:auto">
            ${logRows || `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">분석 실행 버튼을 눌러 시나리오를 시작하세요.</div>`}
          </div>
        </section>

      </div>
    </section>
  `;
}
function investigationPage(){
  const tab = investigationTab;
  const isFullHeight = tab === "scenario" || tab === "report" || tab === "templates";
  return `
    <section class="card ci-hub${isFullHeight ? " ci-hub-full" : ""}">
      <div class="ci-page-head">
        <div>
          <h2>관세조사 분석</h2>
          <p class="muted">조사 우선순위가 높은 업체를 객관적 기준으로 선정하여 기초자료들을 등록하고, 표준 분석시나리오에 따라 분석을 수행합니다. 필요에 따라 분석 시나리오는 변경하여 맞춤형 시나리오를 구축할 수 있습니다.</p>
        </div>
      </div>
      <div class="ci-tab-nav">
        <div class="ci-tabs-left">
          <button class="ci-tab${tab==="ongoing"?" active":""}" data-investigation-tab="ongoing">진행중인 관세조사</button>
          <button class="ci-tab${tab==="profile"?" active":""}" data-investigation-tab="profile">기업프로파일</button>
          <button class="ci-tab${tab==="data"?" active":""}" data-investigation-tab="data">기초자료 수집/등록</button>
          <button class="ci-tab${tab==="scenario"?" active":""}" data-investigation-tab="scenario">분석 시나리오 설정 및 수행</button>
          <button class="ci-tab${tab==="report"?" active":""}" data-investigation-tab="report">분석 보고서 및 검증</button>
        </div>
        <div class="ci-tabs-right">
          <button class="ci-tab${tab==="dashboard"?" active":""}" data-investigation-tab="dashboard">기업 위험도 대시보드</button>
          <button class="ci-tab ci-tab-template${tab==="templates"?" active":""}" data-investigation-tab="templates">분석 시나리오 템플릿</button>
        </div>
      </div>
      <div class="ci-tab-body">
        ${investigationTabContent()}
      </div>
    </section>
  `;
}

function investigationTabContent(){
  if(investigationTab === "ongoing")   return investigationOngoingPanel();
  if(investigationTab === "profile")   return canvasProfilePanel();
  if(investigationTab === "data")      return canvasDataPanel(activeCanvasCompanyId, {
    selectedLabel: "조사 대상 기업",
    heading:       "기초자료 수집/등록",
    description:   "관세조사 대상 기업의 서류, 계약서, 수입신고 자료 등을 업로드합니다.",
  });
  if(investigationTab === "scenario")  return scenarioWorkbenchV2();
  if(investigationTab === "templates") return scenarioTemplatePanel();
  if(investigationTab === "report")    return canvasReportPanel();
  return investigationDashboardPanel();
}

function investigationOngoingPanel(){
  const jobs     = activeCanvasJobs().filter(j => canvasJobCategory(j) === "관세조사 분석");
  const archived = archivedCanvasJobs().filter(j => canvasJobCategory(j) === "관세조사 분석");
  return `
    <div class="ci-ongoing">
      <div class="ci-ongoing-toolbar">
        <div>
          <strong>진행중인 관세조사</strong>
          <p class="muted">관세조사 분석 카테고리로 등록된 분석 작업 현황입니다.</p>
        </div>
        <button class="btn" data-inv-new-job type="button">
          ${showInvNewJobForm ? "✕ 취소" : "+ 신규 조사 등록"}
        </button>
      </div>

      ${showInvNewJobForm ? invNewJobForm() : ""}

      <div class="job-board">
        ${jobs.map(job => ciOngoingJobCard(job)).join("") ||
          `<div class="empty-state">진행 중인 관세조사 분석이 없습니다.<br><span class="muted">신규 조사 등록 버튼으로 분석 작업을 추가하세요.</span></div>`}
      </div>

      <div class="overview-archive-section">
        <button class="overview-archive-toggle" data-inv-toggle-archive>
          완료건 확인 <strong>(${archived.length}건)</strong>
          <span>${invArchiveOpen ? "▲" : "▼"}</span>
        </button>
        ${invArchiveOpen ? `
          <div class="job-board archive-board" style="margin-top:12px">
            ${archived.map(job => {
              const archive = currentRunArchive(job.companyId);
              return `
                <article class="job-card archive-card" data-inv-company="${escapeHtml(job.companyId)}" data-inv-tab="report" tabindex="0" role="button">
                  <div class="job-card-head">
                    <div>
                      <h3>${job.title}</h3>
                      <p class="muted">${job.company} · ${archive?.savedAt || job.updated}</p>
                    </div>
                    <div class="job-status-row">
                      <span class="job-status done">아카이브</span>
                      <button class="btn-inline-action" data-inv-restore-job="${escapeHtml(job.companyId)}">복원</button>
                    </div>
                  </div>
                  <div class="archive-summary">
                    <span>저장 로그 ${archive ? Object.keys(archive.stepOutputs||{}).length : 0}건</span>
                    <strong>${job.status?.pct||100}%</strong>
                  </div>
                </article>`;
            }).join("") || `<div class="empty-state">완료된 조사 결과가 없습니다.</div>`}
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function ciOngoingJobCard(job){
  const isDone = isCompletedActiveJob(job);
  const total  = job.status.total ?? "?";
  const done   = job.status.done  ?? 0;
  return `
    <article class="job-card${job.companyId === activeCanvasCompanyId ? " active" : ""}${job.isNew ? " new" : ""}${job.scenarioChanged ? " changed" : ""}"
      data-inv-company="${escapeHtml(job.companyId)}" data-inv-tab="profile" tabindex="0" role="button">
      <div class="job-card-head">
        <div>
          <span class="canvas-category-chip">관세조사 분석</span>
          <h3>${escapeHtml(job.title)}</h3>
          <p class="muted">${escapeHtml(job.company)} · ${escapeHtml(job.owner)} · ${escapeHtml(job.updated)}</p>
        </div>
        <div class="job-status-row">
          <span class="job-status ${job.status.tone}">${job.status.label}</span>
          ${isDone ? `<button class="btn-inline-action" data-inv-archive-job="${escapeHtml(job.companyId)}">아카이브</button>` : ""}
          <button class="btn-inline-action job-remove-action" data-inv-remove-job="${escapeHtml(job.companyId)}">삭제</button>
        </div>
      </div>
      ${job.scenarioChanged ? `<div class="job-change-note">시나리오가 변경되어 재실행이 필요합니다.</div>` : ""}
      <div class="job-progress"><i style="width:${job.status.pct}%"></i></div>
      <div class="job-meta">
        <span>${done}/${total} 단계</span>
        <strong>${job.status.pct}%</strong>
      </div>
    </article>
  `;
}


function invNewJobForm(){
  if(!scenarioCompanies.length) loadScenarioCompanies();
  const companies = scenarioCompanies;
  return `
    <div class="gi-reg-form" style="padding:12px 16px">
      <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:nowrap">
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">조사 대상 업체 <span style="color:var(--red)">*</span></label>
          <select id="invNewJobCompany" class="gi-reg-select" style="width:100%;height:36px">
            <option value="">-- 업체를 선택하세요 --</option>
            ${companies.map(c =>
              `<option value="${escapeHtml(c.company_id)}">${escapeHtml(c.company_name||c.company_id)} (${escapeHtml(c.company_id)})</option>`
            ).join("")}
          </select>
        </div>
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">분석 시나리오 템플릿 <span style="color:var(--red)">*</span></label>
          <select id="invNewJobTemplate" class="gi-reg-select" style="width:100%;height:36px">
            ${scenarioTemplateOptionsHtml()}
          </select>
        </div>
        <button class="btn" type="button" data-inv-submit style="height:36px;padding:0 20px;white-space:nowrap;flex:none">등록</button>
        <button class="btn secondary" type="button" data-inv-new-job style="height:36px;padding:0 16px;white-space:nowrap;flex:none">취소</button>
      </div>
    </div>
  `;
}
/* investigationDashboardPanel → 공통 riskDashboardContent() 위임 */
function investigationDashboardPanel(){
  return riskDashboardContent();
}

function ciRunDwQuery(){
  const input = document.getElementById("ciDwQuery");
  const result = document.getElementById("ciDwResult");
  if(!input || !result) return;
  const q = input.value.trim();
  if(!q){ alert("DW 조회 조건을 입력하세요."); return; }
  result.style.display = "block";
  result.innerHTML = `<div class="profile-loading">DW 조회 중...</div>`;
  setTimeout(() => {
    result.innerHTML = `
      <div class="ci-dw-result-content">
        <div class="ci-dw-result-head">
          <strong>DW 조회 결과</strong>
          <span class="muted">"${escapeHtml(q)}" 조건 기준 · ${scenarioCompanies.length}개사 중 ${Math.ceil(scenarioCompanies.length*0.3)}개사 해당</span>
        </div>
        ${dataTable(
          ["업체명","사업자번호","업종","수입금액","위험점수","주요위험요인"],
          scenarioCompanies.slice(0,5).map(c => [
            escapeHtml(c.company_name||c.company_id),
            escapeHtml(c.business_registration_no||"-"),
            escapeHtml(industryLabel(c.industry_code)),
            fmtAmount(c.annual_import_amount),
            `<strong class="${(c.risk_score||0)>=70?"high":(c.risk_score||0)>=40?"mid-risk":""}">${(c.risk_score||0).toFixed(1)}</strong>`,
            companyRiskTags(c).slice(0,2).join(", ")||"-"
          ])
        )}
      </div>
    `;
  }, 800);
}

/* ═══════════════════════════════════════════════════════════════ */

function canvasPage(){
  return `
    <section class="card canvas-hub">
      <div class="canvas-main-head">
        <div>
          <h2>AI 작업 캔버스</h2>
          <p class="muted">진행 중인 분석 작업을 카드 형태로 확인하고, 작업별 진행 상태와 다음 단계를 한눈에 봅니다.</p>
        </div>
      </div>
      <div class="canvas-tab-body canvas-overview-only">
        ${canvasOverviewPanel()}
      </div>
    </section>
  `;
}

function activeDrugCase(){
  return defaultDrugInvCases.find(c => c.caseId === activeDrugCaseId) || null;
}

function drugInvestigationPage(){
  const tab    = drugInvTab;
  const aCase  = activeDrugCase();
  const isFullHeight = tab === "scenario" || tab === "report";
  return `
    <section class="card gi-hub${isFullHeight ? " gi-hub-full" : ""}">
      <div class="gi-page-head">
        <div>
          <h2>마약 수사 분석</h2>
          <p class="muted">마약 우범자 수사 등록부터 시나리오 실행, 관계망·포렌식 분석, 보고서 생성까지 통합 수사 워크플로우를 제공합니다.</p>
        </div>
        ${aCase ? `
          <div class="gi-active-badge">
            <span class="muted">수사 대상</span>
            <strong>${escapeHtml(aCase.targetName)}</strong>
            <span class="gi-type-chip ${drugInvTypeById(aCase.invTypeId).cls}">
              ${drugInvTypeById(aCase.invTypeId).num} ${escapeHtml(drugInvTypeById(aCase.invTypeId).label)}
            </span>
          </div>
        ` : ""}
      </div>

      <!-- 탭 내비게이션: 좌측 업무탭 + 우측 도구탭 -->
      <div class="gi-tab-nav" style="justify-content:space-between">
        <div style="display:flex;gap:2px">
          <button class="gi-tab${tab==="ongoing"?" active":""}"  data-drug-tab="ongoing">진행중인 수사</button>
          ${aCase ? `
            <button class="gi-tab${tab==="data"?" active":""}"     data-drug-tab="data">기초자료 수집/등록</button>
            <button class="gi-tab${tab==="scenario"?" active":""}" data-drug-tab="scenario">분석 시나리오 설정 및 실행</button>
            <button class="gi-tab${tab==="network"?" active":""}"  data-drug-tab="network">관계망 분석</button>
            <button class="gi-tab${tab==="forensic"?" active":""}" data-drug-tab="forensic">자금·디지털 포렌식 분석</button>
            <button class="gi-tab${tab==="report"?" active":""}"   data-drug-tab="report">분석보고서 및 검증</button>
          ` : ""}
        </div>
        <div style="display:flex;gap:2px">
          <button class="gi-tab${tab==="slang"?" active":""}"     data-drug-tab="slang">은어사전 RAG</button>
          <button class="gi-tab${tab==="dashboard"?" active":""}" data-drug-tab="dashboard">마약위험 대시보드</button>
        </div>
      </div>

      <div class="gi-tab-body">
        ${drugInvTabContent()}
      </div>
    </section>
  `;
}

function drugInvTabContent(){
  if(drugInvTab === "dashboard") return drugRiskDashboard();
  if(drugInvTab === "data")      return drugDataPanel();
  if(drugInvTab === "scenario")  return drugScenarioPanel();
  if(drugInvTab === "network")   return drugNetworkPanel();
  if(drugInvTab === "forensic")  return drugForensicPanel();
  if(drugInvTab === "report")    return drugReportPanel();
  if(drugInvTab === "slang")     return drugSlangRagPanel();
  return drugOngoingPanel();
}

function drugRiskDashboard(){
  const today = new Date().toISOString().slice(0,10);

  /* ── KPI 데이터 ─────────────────────────────────────────── */
  const kpis = [
    { label:"총 RISK 대상 건수",   value:248, accent:"#1e40af" },
    { label:"당월 신규식별 RISK",  value:34,  accent:"#7c3aed" },
    { label:"이월 RISK 건수",      value:91,  accent:"#0284c7" },
    { label:"진행중인 RISK",       value:112, accent:"#d97706" },
    { label:"당월 완료된 RISK",    value:11,  accent:"#16a34a" },
    { label:"3개월↑ 장기 진행",    value:19,  accent:"#dc2626" },
  ];

  /* ── 4대 지표 ────────────────────────────────────────────── */
  const indicators = [
    {
      key:"cargo", icon:"📦",
      title:"High Risk Cargo", subtitle:"고위험 수입 화물",
      today:42, yesterday:38,
      color:"#dc2626", bg:"#fef2f2", border:"#fecaca",
      detail:[
        {label:"마약 전구물질", count:18, delta:+3},
        {label:"저가신고 의심", count:12, delta:-1},
        {label:"원산지 위반",   count:8,  delta:+2},
        {label:"이중용도 품목", count:4,  delta: 0},
      ],
      rows:[
        {id:"APLL2026053001", goods:"N-페닐피페라진 유도체", origin:"CN", importer:"(주)케미칼인터",  risk:"마약 전구물질", score:95, status:"검사지시"},
        {id:"MSCU2026053002", goods:"유기화합물 혼합분말",   origin:"MX", importer:"글로벌화학(주)",   risk:"마약 전구물질", score:91, status:"검사지시"},
        {id:"COSU2026053008", goods:"노트북 (저가신고의심)", origin:"HK", importer:"개인통관 박XX",     risk:"저가신고 의심", score:88, status:"심사중"},
        {id:"HLCU2026053014", goods:"레이저 장비 부품",      origin:"IL", importer:"(주)광학기술",     risk:"이중용도 품목", score:76, status:"대기"},
        {id:"EGLV2026053019", goods:"면 티셔츠 (원산지위반)",origin:"VN", importer:"패션유통(주)",     risk:"원산지 위반",   score:82, status:"심사중"},
      ],
    },
    {
      key:"traveler", icon:"✈️",
      title:"Traveler Alert", subtitle:"우범여행자 입국 경보",
      today:17, yesterday:21,
      color:"#d97706", bg:"#fffbeb", border:"#fde68a",
      detail:[
        {label:"신규 식별",     count:5, delta:+2},
        {label:"기존 우범자",   count:8, delta:-4},
        {label:"감시대상 입국", count:4, delta: 0},
      ],
      rows:[
        {id:"DS-001", goods:"김우범",       origin:"방콕→인천",    importer:"감시중",  risk:"기존 우범자", score:92, status:"추적중"},
        {id:"DS-002", goods:"이마약",       origin:"두바이→인천",  importer:"감시중",  risk:"기존 우범자", score:87, status:"추적중"},
        {id:"DS-009", goods:"Park James",   origin:"LA→인천",      importer:"신규",    risk:"신규 식별",   score:71, status:"감시중"},
        {id:"DS-010", goods:"田中 健一",    origin:"도쿄→인천",    importer:"신규",    risk:"신규 식별",   score:68, status:"감시중"},
        {id:"DS-003", goods:"최연락",       origin:"암스→인천",    importer:"감시중",  risk:"감시대상",    score:64, status:"감시중"},
      ],
    },
    {
      key:"modus", icon:"🧬",
      title:"New Drug Modus", subtitle:"신종 마약 수법 탐지",
      today:6, yesterday:4,
      color:"#7c3aed", bg:"#faf5ff", border:"#ddd6fe",
      detail:[
        {label:"신종 은어 탐지",  count:3, delta:+1},
        {label:"신종 약물 확인",  count:2, delta:+2},
        {label:"신규 유통경로",   count:1, delta: 0},
      ],
      rows:[
        {id:"MDS-031", goods:"'초록이'",        origin:"SNS",           importer:"MDMA 추정",       risk:"신종 은어",    score:88, status:"사전등록"},
        {id:"MDS-032", goods:"'머큐리'",        origin:"텔레그램",      importer:"필로폰 추정",     risk:"신종 은어",    score:82, status:"사전등록"},
        {id:"MDS-033", goods:"신규 합성마약A",  origin:"중국 실험실",   importer:"펜타닐 유사체",   risk:"신종 약물",    score:94, status:"분석중"},
        {id:"MDS-034", goods:"펜타닐 패치 위조",origin:"다크웹",        importer:"특송 경유",       risk:"신종 약물",    score:91, status:"수사중"},
        {id:"MDS-035", goods:"필로폰 신유통로", origin:"방콕→인천→부산",importer:"해운 환적",       risk:"신규 경로",    score:79, status:"감시중"},
      ],
    },
    {
      key:"intl", icon:"🌐",
      title:"International Alert", subtitle:"국제 마약 정보 경보",
      today:11, yesterday:9,
      color:"#0284c7", bg:"#eff6ff", border:"#bfdbfe",
      detail:[
        {label:"WCO 경보",      count:4, delta:+2},
        {label:"INCB 정보",     count:4, delta: 0},
        {label:"양자 정보공유", count:3, delta: 0},
      ],
      rows:[
        {id:"WCO-2026-041", goods:"필로폰 신규경로 경보",    origin:"WCO",  importer:"동남아→동북아",   risk:"WCO 경보",       score:95, status:"조치중"},
        {id:"WCO-2026-042", goods:"합성마약 성분 분류 개정", origin:"WCO",  importer:"HS 분류 변경",     risk:"WCO 경보",       score:82, status:"검토중"},
        {id:"INCB-2026-18", goods:"전구물질 거래 급증 경보", origin:"INCB", importer:"중남미→동아시아", risk:"INCB 정보",      score:88, status:"조치중"},
        {id:"INCB-2026-19", goods:"MDMA 원료 공급망 분석",  origin:"INCB", importer:"서유럽",           risk:"INCB 정보",      score:76, status:"검토중"},
        {id:"KR-US-2026-07",goods:"필로폰 밀수 공조수사",   origin:"양자", importer:"한-미 공조",       risk:"양자 정보공유",  score:91, status:"공조중"},
      ],
    },
  ];

  /* ── 헬퍼 ──────────────────────────────────────────────── */
  function trend(now, prev){
    if(now === prev) return `<span style="color:#6b7f9e;font-size:11px">→ 전일 동일</span>`;
    const up = now > prev, d = Math.abs(now - prev);
    return `<span style="color:${up?"#dc2626":"#16a34a"};font-size:11px;font-weight:700">${up?"▲":"▼"} ${d}건 (전일 ${prev}건)</span>`;
  }
  function statusChip(s){
    const danger  = ["검사지시","수사중"];
    const warning = ["심사중","추적중","조치중","분석중"];
    const purple  = ["사전등록","공조중"];
    const c  = danger.includes(s)?"#dc2626":warning.includes(s)?"#d97706":purple.includes(s)?"#7c3aed":"#64748b";
    const bg = danger.includes(s)?"#fee2e2":warning.includes(s)?"#fef3c7":purple.includes(s)?"#ede9fe":"#f1f5f9";
    return `<span style="background:${bg};color:${c};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap">${escapeHtml(s)}</span>`;
  }

  /* ── 아코디언 섹션 (헤더바 + 테이블) ───────────────────── */
  function accordionSection(ind){
    const isOpen  = drugAccordionOpen[ind.key] !== false;
    const isTraveler = ind.key === "traveler";
    const col2 = isTraveler ? "성명"     : "대상";
    const col3 = isTraveler ? "입국경로" : "출처/원산지";
    const col4 = isTraveler ? "구분"     : "수입자/관련자";
    return `
      <div style="border:1px solid ${ind.border};border-radius:10px;overflow:hidden">
        <!-- 헤더바 (클릭 → 토글) -->
        <div data-drug-acc="${ind.key}"
             style="background:${ind.bg};padding:10px 16px;display:flex;align-items:center;
                    gap:10px;cursor:pointer;user-select:none">
          <span style="font-size:16px;flex:none">${ind.icon}</span>
          <strong style="font-size:13px;font-weight:800;color:${ind.color};white-space:nowrap">${ind.title}</strong>
          <span style="font-size:11px;color:#6b7f9e;white-space:nowrap">${ind.subtitle}</span>
          <strong style="font-size:26px;font-weight:900;color:${ind.color};line-height:1;margin-left:14px;flex:none">${ind.today}</strong>
          <div style="flex:none">
            <div style="font-size:10px;color:#6b7f9e;line-height:1.3">당일 건수</div>
            ${trend(ind.today, ind.yesterday)}
          </div>
          <span style="margin-left:auto;font-size:13px;color:${ind.color};font-weight:700;flex:none">${isOpen?"▲":"▼"}</span>
        </div>
        <!-- 테이블 (토글) -->
        ${isOpen ? `
          <div style="overflow-x:auto;border-top:1px solid ${ind.border}">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:${ind.bg}">
                  <th style="padding:10px 14px;text-align:left;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border}">ID</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border}">${col2}</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border}">${col3}</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border}">${col4}</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border}">위험유형</th>
                  <th style="padding:10px 14px;text-align:center;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border}">위험점수</th>
                  <th style="padding:10px 14px;text-align:center;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border}">상태</th>
                  <th style="padding:10px 14px;text-align:center;font-weight:700;color:#41506a;white-space:nowrap;border-bottom:1px solid ${ind.border};width:110px">분석 수행</th>
                </tr>
              </thead>
              <tbody>
                ${ind.rows.map((r,i)=>`
                  <tr style="background:${i%2===0?"#fff":ind.bg+"88"};border-bottom:1px solid ${ind.border}">
                    <td style="padding:11px 14px;font-family:monospace;font-size:12px;color:#1e40af;white-space:nowrap">${escapeHtml(r.id)}</td>
                    <td style="padding:11px 14px"><strong style="font-size:13px">${escapeHtml(r.goods)}</strong></td>
                    <td style="padding:11px 14px;color:#41506a;white-space:nowrap">${escapeHtml(r.origin)}</td>
                    <td style="padding:11px 14px;color:#41506a">${escapeHtml(r.importer)}</td>
                    <td style="padding:11px 14px">
                      <span style="background:${ind.bg};color:${ind.color};border:1px solid ${ind.border};
                                   border-radius:5px;padding:3px 10px;font-size:12px;font-weight:600;white-space:nowrap">
                        ${escapeHtml(r.risk)}
                      </span>
                    </td>
                    <td style="padding:11px 14px;text-align:center">
                      <strong style="font-size:14px;color:${r.score>=90?"#dc2626":r.score>=75?"#d97706":"#16a34a"}">${r.score}</strong>
                    </td>
                    <td style="padding:11px 14px;text-align:center">${statusChip(r.status)}</td>
                    <td style="padding:11px 14px;text-align:center">
                      <button style="display:inline-flex;align-items:center;justify-content:center;
                                     height:32px;padding:0 14px;font-size:12px;font-weight:700;
                                     white-space:nowrap;background:${ind.color};color:#fff;
                                     border:none;border-radius:6px;cursor:pointer;line-height:1">
                        분석 수행
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}
      </div>`;
  }

  const EVENTS = [
    {time:"09:42",type:"High Risk Cargo",color:"#dc2626",bg:"#fee2e2",msg:"인천항 화물(APLL2026053001) — 마약 전구물질 검출 의심, 검사지시 발부"},
    {time:"08:15",type:"Traveler Alert", color:"#d97706",bg:"#fef3c7",msg:"인천공항 김우범(DS-001) 감시구역 진입, 동향 추적 중"},
    {time:"07:30",type:"New Drug Modus", color:"#7c3aed",bg:"#ede9fe",msg:"SNS 신종 은어 '초록이'(MDMA) 패턴 급증, 사전 추가 완료"},
    {time:"06:55",type:"International",  color:"#0284c7",bg:"#eff6ff",msg:"WCO — 방콕→인천→부산 필로폰 신규 유통경로 식별"},
    {time:"05:18",type:"Traveler Alert", color:"#d97706",bg:"#fef3c7",msg:"신규 우범여행자 2명 인천공항 입국, 관계망 분석 개시"},
    {time:"04:50",type:"High Risk Cargo",color:"#dc2626",bg:"#fee2e2",msg:"인천공항 특송화물 3건 마약 전구물질 포함 의심"},
    {time:"03:22",type:"International",  color:"#0284c7",bg:"#eff6ff",msg:"INCB — 전구물질 거래량 동남아 급증, 한국 경유 경보"},
    {time:"02:41",type:"New Drug Modus", color:"#7c3aed",bg:"#ede9fe",msg:"다크웹 펜타닐 유사체 신규 매물 탐지, 수법 분류 등록"},
    {time:"01:30",type:"High Risk Cargo",color:"#dc2626",bg:"#fee2e2",msg:"부산항 컨테이너 화물 — 원산지 위반 의심 2건 추가"},
    {time:"00:48",type:"Traveler Alert", color:"#d97706",bg:"#fef3c7",msg:"이마약(DS-002) 두바이 출발 — 입국 예정, 선제 감시 등록"},
    {time:"00:15",type:"International",  color:"#0284c7",bg:"#eff6ff",msg:"양자정보 — 미국 DEA, 신종 합성마약 원료 공급망 공유"},
  ];

  return `
    <div class="risk-dashboard">

      <!-- ① KPI 헤더 -->
      <div class="risk-dash-header">
        <div>
          <h2>마약위험 모니터링 대시보드</h2>
          <p class="muted">마약 수사 전 분야의 RISK 현황을 실시간으로 모니터링합니다. 기준일: ${today}</p>
        </div>
        <div class="risk-kpi-strip">
          ${kpis.map(k=>`
            <div class="risk-kpi-item">
              <span>${k.label}</span>
              <strong style="color:${k.accent}">${k.value}<small style="font-size:13px;font-weight:600;margin-left:2px">건</small></strong>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- ② 메인: 좌(아코디언 4개) + 우(이벤트 스크롤) 7:3 -->
      <div style="display:grid;grid-template-columns:7fr 3fr;gap:14px;align-items:start">

        <!-- 아코디언 4개 -->
        <div style="display:flex;flex-direction:column;gap:8px">
          ${indicators.map(accordionSection).join("")}
        </div>

        <!-- 이벤트 패널 — sticky + 자체 스크롤 -->
        <div style="background:var(--card);border:1px solid var(--line);border-radius:14px;
                    padding:16px 16px;position:sticky;top:12px">
          <div style="display:flex;align-items:center;margin-bottom:12px">
            <strong style="font-size:14px;color:#123c85">최근 주요 RISK 이벤트</strong>
            <span style="margin-left:auto;font-size:11px;color:#6b7f9e">최근 24시간</span>
          </div>
          <div style="overflow-y:auto;max-height:680px;display:flex;flex-direction:column;gap:8px;padding-right:3px">
            ${EVENTS.map(e=>`
              <div style="display:flex;align-items:flex-start;gap:9px;padding:10px 12px;
                          background:${e.bg};border-radius:9px;border:1px solid ${e.color}22">
                <span style="font-size:12px;color:#6b7f9e;white-space:nowrap;padding-top:1px;
                             flex:none;min-width:36px">${e.time}</span>
                <div style="flex:1;min-width:0">
                  <span style="display:inline-block;background:${e.color};color:#fff;border-radius:4px;
                               padding:2px 8px;font-size:11px;font-weight:700;margin-bottom:4px">
                    ${e.type}
                  </span>
                  <div style="font-size:13px;color:#1e293b;line-height:1.6">${e.msg}</div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

      </div>
    </div>
  `;
}

function drugOngoingPanel(){
  const all      = defaultDrugInvCases;
  const q        = drugCaseFilter.toLowerCase();
  const filtered = q ? all.filter(c =>
    c.targetName.toLowerCase().includes(q) ||
    c.caseId.toLowerCase().includes(q) ||
    drugInvTypeById(c.invTypeId).label.includes(q)
  ) : all;

  return `
    <div class="gi-cases-panel">
      <div class="gi-cases-toolbar">
        <input class="gi-search" id="drugSearchInput" placeholder="수사대상, 사건번호, 수사유형 검색..."
          value="${escapeHtml(drugCaseFilter)}">
        <button class="btn gi-reg-toggle-btn" data-drug-reg-toggle type="button">
          ${showDrugNewCaseForm ? "✕ 닫기" : "+ 수사 등록"}
        </button>
      </div>

      ${showDrugNewCaseForm ? drugNewCaseForm() : ""}

      <div class="gi-case-board">
        ${filtered.map(drugCaseCard).join("") ||
          `<div class="empty-state">등록된 마약 수사 대상이 없습니다. 수사 등록 버튼으로 추가하세요.</div>`}
      </div>

      <div class="overview-archive-section">
        <button class="overview-archive-toggle" data-drug-toggle-archive>
          완료건 확인 <strong>(${archivedDrugCases.length}건)</strong>
          <span>${drugArchiveOpen ? "▲" : "▼"}</span>
        </button>
        ${drugArchiveOpen ? `
          <div class="job-board archive-board" style="margin-top:12px">
            ${archivedDrugCases.map(c => {
              const type = drugInvTypeById(c.invTypeId);
              return `
                <article class="job-card archive-card" tabindex="0">
                  <div class="job-card-head">
                    <div>
                      <span class="gi-case-no">${escapeHtml(c.caseId)}</span>
                      <h3>${escapeHtml(c.targetName)}</h3>
                      <p class="muted">${escapeHtml(c.investigator)} · ${escapeHtml(c.team)} · ${escapeHtml(c.updated)}</p>
                    </div>
                    <div class="job-status-row">
                      <span class="job-status done">아카이브</span>
                      <button class="btn-inline-action" data-drug-restore-case="${escapeHtml(c.caseId)}">복원</button>
                    </div>
                  </div>
                  <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
                  <div class="archive-summary" style="margin-top:8px">
                    <span>${c.status.done}/${c.status.total} 단계 완료</span>
                    <strong>${c.status.pct}%</strong>
                  </div>
                </article>`;
            }).join("") || `<div class="empty-state">완료된 수사 결과가 없습니다.</div>`}
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function drugCaseCard(c){
  const type     = drugInvTypeById(c.invTypeId);
  const isActive = c.caseId === activeDrugCaseId;
  const isDone   = c.status.pct >= 100 || c.status.tone === "done";
  return `
    <article class="gi-case-card${isActive ? " active" : ""}"
             data-drug-case="${escapeHtml(c.caseId)}" tabindex="0" role="button">
      <div class="gi-case-head">
        <div>
          <span class="gi-case-no">${escapeHtml(c.caseId)}</span>
          <h3 class="gi-case-name">${escapeHtml(c.targetName)}</h3>
        </div>
        <div class="job-status-row">
          <span class="job-status ${c.status.tone}">${escapeHtml(c.status.label)}</span>
          ${isDone ? `<button class="btn-inline-action" data-drug-archive-case="${escapeHtml(c.caseId)}" title="아카이브">아카이브</button>` : ""}
          <button class="btn-inline-action job-remove-action" data-drug-remove-case="${escapeHtml(c.caseId)}" title="삭제">삭제</button>
        </div>
      </div>
      <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
      <div class="job-progress" style="margin:8px 0 4px"><i style="width:${c.status.pct}%"></i></div>
      <div class="job-meta">
        <span>${c.status.done}/${c.status.total} 단계</span>
        <strong>${c.status.pct}%</strong>
      </div>
      <div class="gi-case-foot">
        <span class="muted">${escapeHtml(c.investigator)} · ${escapeHtml(c.team)}</span>
        <span class="muted">${escapeHtml(c.updated)}</span>
      </div>
    </article>
  `;
}

function drugNewCaseForm(){
  const isCo = drugRegTargetType === "company";
  if(!isCo && !riskPersons.length && !riskPersonsLoading) loadRiskPersons();

  const targetOptions = isCo
    ? `<option value="">-- 기업을 선택하세요 --</option>
       ${scenarioCompanies.map(c =>
         `<option value="${escapeHtml(c.company_id)}">${escapeHtml(c.company_name||c.company_id)} (${escapeHtml(c.company_id)})</option>`
       ).join("")}`
    : `<option value="">-- 우범자를 선택하세요 --</option>
       ${riskPersonsLoading
         ? `<option disabled>로딩 중...</option>`
         : riskPersons.map(p =>
             `<option value="${escapeHtml(p.person_id)}">${escapeHtml(p.name)} (${escapeHtml(p.person_id)}) · ${escapeHtml(p.risk_level||"-")}</option>`
           ).join("")}`;

  return `
    <div class="gi-reg-form" style="padding:12px 16px">
      <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:nowrap">

        <!-- ① 수사대상 유형 -->
        <div style="flex:none">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사대상 유형 <span style="color:var(--red)">*</span></label>
          <div style="display:flex;gap:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;height:36px">
            <button type="button" data-drug-reg-type="company"
              style="padding:0 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;
                     background:${isCo?"#1e40af":"#fff"};color:${isCo?"#fff":"#41506a"}">기업</button>
            <button type="button" data-drug-reg-type="person"
              style="padding:0 14px;font-size:12px;font-weight:600;border:none;border-left:1px solid var(--line);cursor:pointer;
                     background:${!isCo?"#1e40af":"#fff"};color:${!isCo?"#fff":"#41506a"}">개인</button>
          </div>
        </div>

        <!-- ② 수사대상 선택 -->
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사대상 선택 <span style="color:var(--red)">*</span></label>
          <select id="drugRegTargetSelect" class="gi-reg-select" style="width:100%;height:36px">
            ${targetOptions}
          </select>
        </div>

        <!-- ③ 수사 유형 선택 -->
        <div style="flex:2;min-width:0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">수사 유형 선택 <span style="color:var(--red)">*</span></label>
          <select id="drugRegType" class="gi-reg-select" style="width:100%;height:36px">
            ${DRUG_INV_TYPES.map(t=>`<option value="${t.id}">${t.num} ${escapeHtml(t.label)}</option>`).join("")}
          </select>
        </div>

        <!-- ④ 등록/취소 -->
        <button class="btn" type="button" data-drug-reg-submit style="height:36px;padding:0 20px;white-space:nowrap;flex:none">등록</button>
        <button class="btn secondary" type="button" data-drug-reg-toggle style="height:36px;padding:0 16px;white-space:nowrap;flex:none">취소</button>
      </div>
    </div>
  `;
}

function drugNetworkPanel(){
  const t = drugInvSelectedTarget;
  const nodes = t ? [
    { id:"center", label: t.name, type:"suspect", x:50, y:50 },
    { id:"n1", label:"박공범", type:"associate", x:20, y:25 },
    { id:"n2", label:"최연락", type:"associate", x:75, y:20 },
    { id:"n3", label:"이중간", type:"associate", x:15, y:70 },
    { id:"n4", label:"김화주", type:"cargo_owner", x:80, y:75 },
    { id:"n5", label:"(주)위장무역", type:"company", x:55, y:80 },
    { id:"n6", label:"ABC Courier", type:"company", x:30, y:48 },
  ] : [];
  const edges = t ? [
    { from:"center", to:"n1", label:"친인척" },
    { from:"center", to:"n2", label:"동업자" },
    { from:"center", to:"n3", label:"자금책" },
    { from:"center", to:"n4", label:"화주명의" },
    { from:"n4", to:"n5", label:"대표자" },
    { from:"center", to:"n6", label:"이용업체" },
    { from:"n1", to:"n5", label:"관계사" },
  ] : [];
  return `
    <div style="display:flex;gap:16px;height:100%">
      <div style="flex:1;min-width:0">
        <div class="panel-section-hdr" style="margin-bottom:8px">
          <span>관계망 그래프</span>
          ${t ? `<span class="muted" style="font-size:12px">중심: ${escapeHtml(t.name)}</span>` : ""}
        </div>
        ${t ? `
          <div class="network-canvas" id="drugNetworkCanvas" style="position:relative;height:420px;background:#f8fbff;border:1px solid #dde8ff;border-radius:10px;overflow:hidden">
            <svg width="100%" height="100%" style="position:absolute;top:0;left:0">
              ${edges.map(e=>{
                const from = nodes.find(n=>n.id===e.from);
                const to   = nodes.find(n=>n.id===e.to);
                if(!from||!to) return "";
                const x1=from.x+"%", y1=from.y+"%", x2=to.x+"%", y2=to.y+"%";
                const mx=((from.x+to.x)/2)+"%", my=((from.y+to.y)/2)+"%";
                return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#aac7ff" stroke-width="1.5"/>
                        <text x="${mx}" y="${my}" font-size="10" fill="#6b7f9e" text-anchor="middle">${escapeHtml(e.label)}</text>`;
              }).join("")}
            </svg>
            ${nodes.map(n=>{
              const colors={suspect:"#dc2626",associate:"#d97706",cargo_owner:"#7c3aed",company:"#0284c7"};
              const labels={suspect:"용의자",associate:"관계자",cargo_owner:"화주",company:"기업"};
              return `<div style="position:absolute;left:calc(${n.x}% - 32px);top:calc(${n.y}% - 32px);text-align:center;width:64px">
                <div style="width:44px;height:44px;border-radius:50%;background:${colors[n.type]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin:0 auto;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.18)">${escapeHtml(n.label.substring(0,4))}</div>
                <div style="font-size:10px;color:#41506a;margin-top:2px;background:rgba(255,255,255,.85);border-radius:4px;padding:1px 3px">${escapeHtml(labels[n.type])}</div>
              </div>`;
            }).join("")}
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            ${[["용의자","#dc2626"],["관계자","#d97706"],["화주","#7c3aed"],["기업","#0284c7"]].map(([l,c])=>`
              <span style="display:flex;align-items:center;gap:4px;font-size:12px"><span style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block"></span>${l}</span>
            `).join("")}
          </div>
        ` : `<div class="empty-state">좌측 '진행중인 수사' 탭에서 우범자를 선택하거나, 우범자 목록에서 [관계망 보기] 버튼을 클릭하세요.</div>`}
      </div>
      <div style="width:260px;flex:none">
        <div class="panel-section-hdr" style="margin-bottom:8px"><span>관계자 목록</span></div>
        ${t ? `
          <div style="display:flex;flex-direction:column;gap:6px">
            ${[
              {name:"박공범",rel:"친인척",risk:"고위험",riskScore:78},
              {name:"최연락",rel:"동업자",risk:"고위험",riskScore:82},
              {name:"이중간",rel:"자금책",risk:"중위험",riskScore:64},
              {name:"김화주",rel:"화주명의",risk:"중위험",riskScore:55},
              {name:"(주)위장무역",rel:"관련기업(대표)",risk:"고위험",riskScore:89},
              {name:"ABC Courier",rel:"이용업체",risk:"중위험",riskScore:60},
            ].map(r=>`
              <div class="gi-case-card" style="padding:10px 12px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div>
                    <strong style="font-size:13px">${escapeHtml(r.name)}</strong>
                    <span class="muted" style="font-size:11px;margin-left:6px">${escapeHtml(r.rel)}</span>
                  </div>
                  <span class="risk-chip ${r.risk==="고위험"?"high":"mid"}">${escapeHtml(r.risk)}</span>
                </div>
                <div style="font-size:12px;color:#6b7f9e;margin-top:4px">위험점수: <strong>${r.riskScore}</strong></div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="empty-state muted" style="font-size:12px">대상자를 선택하면 관계자 목록이 표시됩니다.</div>`}
      </div>
    </div>
  `;
}

/* ── 기초자료 수집/등록 ─────────────────────────────────── */
function drugDataPanel(){
  const aCase = activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const type = drugInvTypeById(aCase.invTypeId);
  return canvasDataPanel(activeCanvasCompanyId, {
    selectedLabel: "수사 대상",
    subjectName:   `${escapeHtml(aCase.targetName)}`,
    heading:       "기초자료 수집/등록",
    description:   "수사 대상 관련 서류, 통화 내역, 입출국 기록, 금융거래 내역 등을 업로드합니다.",
    caseBadge:     `${type.num} ${type.label} · ${aCase.caseId}`,
  });
}

/* ── 분석 시나리오 설정 및 실행 — generalInvWorkbenchPanel 동일 구조 ── */
function drugScenarioPanel(){
  const aCase = activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const type  = drugInvTypeById(aCase.invTypeId);
  const steps = activeDrugCaseSteps();
  if(!activeDrugStepId && steps[0]) activeDrugStepId = steps[0].id;
  const states = aCase.stepStates  || {};
  const done   = steps.filter(s => states[s.id] === "done").length;
  const total  = steps.length;
  const pct    = total ? Math.round(done / total * 100) : 0;
  const selStep = activeDrugStep();

  const typeLabel = {db:"DB 조회",agent:"AI 서비스",rag:"RAG",report:"보고서",approve:"승인"};
  const chipCls   = {db:"bigdata",agent:"agent",rag:"rag_customs",report:"report",approve:"validation"};

  /* 왼쪽: 단계 칩 목록 */
  const boardChips = steps.map((step, i) => {
    const state    = states[step.id] || "wait";
    const isActive = step.id === activeDrugStepId;
    const isDone   = state === "done";
    const stateTag = isDone
      ? `<span class="gi-chip-state done">완료</span>`
      : state === "run" ? `<span class="gi-chip-state run">실행중</span>` : "";
    return `
      <div class="scenario-chip ${chipCls[step.type]||"agent"}${isActive?" active":""}${isDone?" gi-chip-done":""}"
        data-drug-step-select="${escapeHtml(step.id)}" tabindex="0" role="button" style="position:relative">
        <div class="chip-num"${isDone?' style="background:#22c55e"':""}}>${isDone?"✓":i+1}</div>
        <div class="chip-body">
          <div class="chip-title-row">
            <strong>${escapeHtml(step.label)}</strong>${stateTag}
          </div>
          <p style="margin:0;font-size:12px;color:#64748b">${escapeHtml(typeLabel[step.type]||step.type)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          ${i > 0 ? `<button class="gi-move-btn" data-drug-step-up="${escapeHtml(step.id)}">↑</button>` : `<span style="width:22px"></span>`}
          ${i < steps.length-1 ? `<button class="gi-move-btn" data-drug-step-down="${escapeHtml(step.id)}">↓</button>` : `<span style="width:22px"></span>`}
        </div>
      </div>`;
  }).join("");

  /* 가운데: 단계 설정 */
  const configPanel = selStep ? `
    <div class="scenario-config-title" style="margin-bottom:14px">
      <strong>${escapeHtml(selStep.label)}</strong>
      <span class="gi-chip-state${states[selStep.id]==="done"?" done":states[selStep.id]==="run"?" run":" wait"}" style="margin-left:8px">
        ${states[selStep.id]==="done"?"완료":states[selStep.id]==="run"?"실행중":"대기"}
      </span>
    </div>
    <div class="scenario-agent-zone" style="overflow-y:auto;flex:1;min-height:0">
      <div class="scenario-source-hint">
        <div class="hint-header">
          <strong>${escapeHtml(selStep.label)}</strong>
          <span>${escapeHtml(typeLabel[selStep.type]||selStep.type)}</span>
        </div>
      </div>
      <label class="scenario-field">
        <span>추가 지시</span>
        <textarea class="gi-wb2-textarea" rows="4"
          style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;font:inherit;font-size:13px;width:100%;box-sizing:border-box;resize:vertical"
          placeholder="이 단계에서 중점적으로 확인할 내용을 입력하세요."
          data-drug-step-note="${escapeHtml(selStep.id)}">${escapeHtml(selStep.instruction||selStep.note||"")}</textarea>
      </label>
    </div>
    <div class="scenario-actions" style="margin-top:12px">
      <select id="drugWbAddSource" class="gi-reg-select" style="flex:1">
        <option value="">+ 단계 추가 선택...</option>
        ${giStepSourceOptionsHtml()}
      </select>
      <button class="btn" type="button" data-drug-step-add>단계 추가</button>
      <button class="btn secondary" type="button" data-drug-step-delete="${escapeHtml(selStep.id)}">선택 삭제</button>
    </div>
  ` : `
    <div class="scenario-config-title" style="margin-bottom:14px"><strong>분석 시나리오 설정</strong></div>
    <div class="scenario-agent-zone" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#94a3b8;text-align:center;gap:8px">
      <span style="font-size:32px;opacity:.25">⚙</span>
      <p style="margin:0;font-size:13px">왼쪽에서 단계를 선택하면<br>설정을 확인하고 편집할 수 있습니다.</p>
    </div>
    <div class="scenario-actions" style="margin-top:12px">
      <select id="drugWbAddSource" class="gi-reg-select" style="flex:1">
        <option value="">+ 단계 추가 선택...</option>
        ${giStepSourceOptionsHtml()}
      </select>
      <button class="btn" type="button" data-drug-step-add>단계 추가</button>
      <button class="btn secondary" type="button" disabled>선택 삭제</button>
    </div>
  `;

  /* 오른쪽: 실행 로그 */
  const stepResults  = aCase.stepResults  || {};
  const stepExpanded = aCase.stepExpanded || {};
  const logRows = steps.map((step, i) => {
    const state     = states[step.id] || "wait";
    const isDone    = state === "done";
    const isRun     = state === "run";
    const isError   = state === "error";
    const hasResult = !!(stepResults[step.id]);
    const isExpanded= !!stepExpanded[step.id];
    const stateCell = isDone
      ? `<span class="gi-chip-state done">완료</span>
         ${hasResult ? `<button class="gi-log-act-btn" data-drug-toggle-result="${escapeHtml(step.id)}">${isExpanded?"▲":"▼"}</button>` : ""}
         <button class="gi-log-act-btn" data-drug-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">↺</button>`
      : isError
        ? `<span class="gi-chip-state" style="background:#fee2e2;color:#dc2626">오류</span>
           <button class="gi-log-act-btn" data-drug-rerun-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">↺</button>`
        : isRun
          ? `<span class="gi-chip-state run" style="animation:gi-blink 1.2s infinite">실행중...</span>`
          : `<button class="gi-log-act-btn primary" data-drug-run-step="${escapeHtml(aCase.caseId)}:${escapeHtml(step.id)}">▶</button>`;
    const resultSection = (isDone||isError) && hasResult && isExpanded
      ? `<div class="gi-log-result">${markdownToHtml(stepResults[step.id])}</div>` : "";
    return `
      <div class="gi-log-row${isDone?" gi-log-done":isRun?" gi-log-run":isError?" gi-log-error":""}">
        <div class="gi-log-num">${isDone?"✓":isError?"!":i+1}</div>
        <div class="gi-log-name">${escapeHtml(step.label)}</div>
        <div class="gi-log-state">${stateCell}</div>
      </div>${resultSection}`;
  }).join("");

  return `
    <section class="card scenario-workbench scenario-workbench-v2" style="padding:0;overflow:hidden">
      <div class="scenario-title-row" style="padding:14px 18px 0">
        <div>
          <h3 style="display:flex;align-items:center;gap:10px;margin:0 0 2px">
            <span class="gi-type-chip ${type.cls}">${type.num} ${escapeHtml(type.label)}</span>
            ${escapeHtml(aCase.targetName)}
            <span class="muted" style="font-weight:400;font-size:13px">${escapeHtml(aCase.caseId)}</span>
          </h3>
          <p class="muted" style="margin:0;font-size:12px">수사 유형에 맞는 분석 시나리오를 설정하고 각 단계를 순차적으로 실행합니다.</p>
        </div>
        <div class="scenario-status">
          <span>${done===total&&total>0?"완료":done>0?"진행중":"대기"}</span>
          <strong>${done}/${total}</strong>
        </div>
      </div>
      <div class="scenario-progress" style="margin:10px 18px 0;height:6px">
        <i style="width:${pct}%"></i>
      </div>
      <div class="scenario-layout scenario-execution-layout" style="padding:14px 18px 14px;margin-top:10px">
        <section class="scenario-board">
          <div class="scenario-board-head">
            <h3>수사 시나리오</h3>
            <span class="muted" style="font-size:12px">${total}단계</span>
          </div>
          <div class="scenario-list-vertical" style="margin-top:10px">${boardChips}</div>
        </section>
        <aside class="scenario-config" style="display:flex;flex-direction:column">${configPanel}</aside>
        <section class="scenario-log" style="display:flex;flex-direction:column">
          <div class="scenario-log-head">
            <h3>분석 실행</h3>
            <div class="scenario-log-actions">
              <button class="btn" type="button" data-drug-run-step="${escapeHtml(aCase.caseId)}:all">분석 실행</button>
              <button class="btn secondary" type="button" data-drug-run-step="${escapeHtml(aCase.caseId)}:clear">결과 지우기</button>
            </div>
          </div>
          <div class="gi-log-list scenario-step-accordion" style="margin-top:10px;flex:1;overflow-y:auto">
            ${logRows || `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">분석 실행 버튼을 눌러 시나리오를 시작하세요.</div>`}
          </div>
        </section>
      </div>
    </section>
  `;
}

/* ── 자금·디지털 포렌식 분석 ─────────────────────────────── */
function drugForensicPanel(){
  const aCase = activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;

  const forTabs = ["자금 흐름 분석","디지털 포렌식","SNS·다크웹 모니터링"];
  const txData = [
    {date:"2026-05-28",from:"김우범",to:"박공범",  amount:"₩ 2,800,000",type:"현금이체",risk:"의심",riskScore:88},
    {date:"2026-05-26",from:"김우범",to:"위장무역",amount:"₩15,000,000",type:"법인이체",risk:"고위험",riskScore:93},
    {date:"2026-05-20",from:"박공범",to:"불상",    amount:"₩ 5,500,000",type:"ATM출금", risk:"의심",riskScore:81},
    {date:"2026-05-15",from:"위장무역",to:"해외송금",amount:"USD 12,000",type:"해외송금",risk:"고위험",riskScore:95},
  ];
  return `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="background:#f8fbff;border:1px solid #dde8ff;border-radius:10px;padding:12px 16px">
        <strong style="font-size:13px;color:#123c85">수사 대상</strong>
        <span style="margin-left:10px;font-size:13px">${aCase.caseId} · ${escapeHtml(aCase.targetName)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <!-- 자금흐름 -->
        <div>
          <div class="panel-section-hdr" style="margin-bottom:10px"><span>💰 자금 흐름 분석</span></div>
          <div style="overflow-x:auto">
            <table class="data-table" style="font-size:12px">
              <thead><tr><th>일자</th><th>출금처</th><th>입금처</th><th>금액</th><th>구분</th><th>위험도</th></tr></thead>
              <tbody>
                ${txData.map(t=>`
                  <tr>
                    <td>${t.date}</td>
                    <td>${escapeHtml(t.from)}</td>
                    <td>${escapeHtml(t.to)}</td>
                    <td style="font-weight:700;white-space:nowrap">${escapeHtml(t.amount)}</td>
                    <td>${escapeHtml(t.type)}</td>
                    <td><span class="risk-chip ${t.risk==="고위험"?"high":"mid"}">${escapeHtml(t.risk)}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <!-- 디지털 포렌식 -->
        <div>
          <div class="panel-section-hdr" style="margin-bottom:10px"><span>💻 디지털 포렌식</span></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              {type:"휴대폰 분석",items:["카카오톡 대화 142건","삭제 파일 복원 23건","GPS 이동경로 34일치"],status:"분석완료"},
              {type:"SNS 모니터링",items:["텔레그램 채널 3개 식별","은어 사용 메시지 18건","공모자 계정 2개 특정"],status:"진행중"},
              {type:"다크웹 흔적",items:["마켓 계정 연관 의심 1건","암호화폐 주소 연결 가능성"],status:"검토중"},
            ].map(f=>`
              <div style="background:#fff;border:1px solid #dde8ff;border-radius:8px;padding:12px 14px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <strong style="font-size:13px;color:#123c85">${f.type}</strong>
                  <span style="margin-left:auto;font-size:11px;color:${f.status==="분석완료"?"#16a34a":f.status==="진행중"?"#d97706":"#6b7f9e"};font-weight:700">${f.status}</span>
                </div>
                <ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:3px">
                  ${f.items.map(i=>`<li style="font-size:12px;color:#41506a">${i}</li>`).join("")}
                </ul>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ── 분석보고서 및 검증 ──────────────────────────────────── */
function drugReportPanel(){
  const aCase = activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  return `
    <div class="canvas-report-wrap">
      <div class="canvas-selected-company">
        <span>수사 대상</span>
        <strong>${aCase.caseId} · ${escapeHtml(aCase.targetName)}</strong>
        <span class="gi-type-chip ${drugInvTypeById(aCase.invTypeId).cls}" style="margin-left:8px">
          ${drugInvTypeById(aCase.invTypeId).num} ${escapeHtml(drugInvTypeById(aCase.invTypeId).label)}
        </span>
      </div>
      <div class="scenario-results canvas-report-results">
        <section class="scenario-result-panel">
          <h3>분석 보고서</h3>
          <div class="markdown-output" style="min-height:120px">${markdownToHtml(latestReport) || "<p class='muted'>분석 시나리오를 실행하면 보고서가 생성됩니다.</p>"}</div>
        </section>
        <section class="scenario-result-panel">
          <h3>보고서 검증</h3>
          <div class="markdown-output" style="min-height:80px">${markdownToHtml(latestValidation) || "<p class='muted'>보고서 생성 후 검증 결과가 표시됩니다.</p>"}</div>
        </section>
      </div>

      <!-- 마약수사 전용 추가 섹션 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">

        <!-- 국제공조 요건 -->
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-size:18px">🌐</span>
            <strong style="font-size:14px;color:#1e40af">국제공조 요건</strong>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              {label:"공조 요청 대상국",value:"태국, 멕시코",status:"확인"},
              {label:"MLA(형사사법공조) 요건",value:"요청서 작성 필요",status:"준비중"},
              {label:"INCB 통보 필요 여부",value:"전구물질 해당 시 필수",status:"검토중"},
              {label:"WCO CEN 등록",value:"밀수 정보 공유 등록",status:"미등록"},
            ].map(r=>`
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border-radius:7px">
                <span style="flex:1;font-size:12px;color:#1e293b">${r.label}</span>
                <span style="font-size:12px;color:#1e40af">${r.value}</span>
                <span style="font-size:11px;font-weight:700;color:${r.status==="확인"?"#16a34a":r.status==="준비중"||r.status==="검토중"?"#d97706":"#dc2626"}">${r.status}</span>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- 물리 검사 결과 요약 -->
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-size:18px">🔬</span>
            <strong style="font-size:14px;color:#92400e">물리 검사 결과 요약</strong>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              {label:"감정 기관",value:"국립과학수사연구원"},
              {label:"검출 성분",value:"메스암페타민 (필로폰)"},
              {label:"압수 중량",value:"285g"},
              {label:"순도",value:"89.3%"},
              {label:"감정 결과",value:"양성 (마약류)", highlight:true},
            ].map(r=>`
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border-radius:7px">
                <span style="flex:1;font-size:12px;color:#41506a">${r.label}</span>
                <strong style="font-size:12px;color:${r.highlight?"#dc2626":"#1e293b"}">${r.value}</strong>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function drugSlangRagPanel(){
  const slangDict = [
    { term:"아이스",  meaning:"필로폰(메스암페타민)", category:"각성제", confidence:98 },
    { term:"작대기", meaning:"주사기", category:"도구", confidence:95 },
    { term:"떡",     meaning:"대마초 압축분", category:"대마", confidence:90 },
    { term:"야바",   meaning:"메스암페타민 알약(태국산)", category:"각성제", confidence:97 },
    { term:"찰리",   meaning:"코카인", category:"코카인", confidence:88 },
    { term:"초코",   meaning:"헤로인(갈색)", category:"아편류", confidence:85 },
    { term:"LSD",    meaning:"도장·우표 모양 환각제", category:"환각제", confidence:99 },
    { term:"빽빽이", meaning:"필로폰 대량(1kg↑)", category:"각성제", confidence:82 },
  ];
  return `
    <div style="display:flex;gap:16px;height:100%;flex-direction:column">
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e">
        <strong>핵심 RAG</strong> — 은어사전 기반 해독 서비스입니다. 수사 문서에서 탐지된 은어를 실시간으로 해독하고, 연관 용어를 추천합니다.
      </div>
      <div style="display:flex;gap:14px;flex:1;min-height:0;flex-wrap:wrap">
        <div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:8px">
          <div class="panel-section-hdr"><span>은어 해독기</span></div>
          <div style="display:flex;gap:8px">
            <input id="slangInput" class="form-input" style="flex:1" placeholder="은어 또는 문장을 입력하세요 (예: 아이스 한 작대기 챙겨와)">
            <button class="btn primary" data-slang-decode>해독</button>
          </div>
          <div id="slangDecodeResult" style="min-height:80px;background:#f8fbff;border:1px solid #dde8ff;border-radius:8px;padding:12px;font-size:13px;color:#41506a">
            해독 결과가 여기에 표시됩니다. 입력 문장 내 은어를 자동으로 탐지하여 정확한 의미로 변환합니다.
          </div>
          <div class="panel-section-hdr" style="margin-top:4px"><span>연관 은어 추천</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${["아이스","야바","찰리","떡","초코","LSD","빽빽이"].map(t=>`
              <button class="btn small" data-slang-suggest="${escapeHtml(t)}">${escapeHtml(t)}</button>
            `).join("")}
          </div>
        </div>
        <div style="flex:1;min-width:280px">
          <div class="panel-section-hdr" style="margin-bottom:8px"><span>은어사전 (${slangDict.length}건)</span></div>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>은어</th><th>의미</th><th>분류</th><th>신뢰도</th></tr></thead>
              <tbody>
                ${slangDict.map(s=>`
                  <tr>
                    <td><strong style="color:#1e40af">${escapeHtml(s.term)}</strong></td>
                    <td>${escapeHtml(s.meaning)}</td>
                    <td><span style="background:#eef4ff;color:#1e40af;border-radius:4px;padding:1px 6px;font-size:11px">${escapeHtml(s.category)}</span></td>
                    <td><span style="font-size:12px;color:${s.confidence>=90?"#16a34a":"#d97706"}">${s.confidence}%</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   위험선별 분석 페이지
   ═══════════════════════════════════════════════════════════════ */
function riskScreeningPage(){
  const tab = riskScreeningTab;
  const today = new Date().toISOString().slice(0,10);
  const highRiskItems = [
    { declNo:"202605300001", hsCd:"2933.39", goods:"N-페닐피페라진 유도체", importer:"(주)케미칼인터", origin:"CN", weight:"500kg", riskScore:95, reason:"마약 전구물질", status:"검사지시" },
    { declNo:"202605300002", hsCd:"8471.30", goods:"노트북 (저가신고의심)", importer:"개인통관 박XX", origin:"HK", weight:"1.2kg", riskScore:88, reason:"저가신고 의심", status:"검사지시" },
    { declNo:"202605300003", hsCd:"6109.10", goods:"면 티셔츠 (원산지위반)", importer:"패션유통(주)", origin:"VN", weight:"2,400kg", riskScore:82, reason:"원산지 위반 의심", status:"심사중" },
    { declNo:"202605300004", hsCd:"2208.40", goods:"럼주 (브랜드 위조)", importer:"주류무역(주)", origin:"DO", weight:"480L", riskScore:79, reason:"브랜드 위조 의심", status:"심사중" },
    { declNo:"202605300005", hsCd:"9013.80", goods:"레이저 장비", importer:"(주)광학기술", origin:"IL", weight:"18kg", riskScore:76, reason:"이중용도 품목", status:"대기" },
    { declNo:"202605300006", hsCd:"7108.12", goods:"금 정제품", importer:"귀금속(주)", origin:"AE", weight:"8.5kg", riskScore:74, reason:"고가 귀금속 신고가 불일치", status:"대기" },
  ];
  const trackingItems = [
    { declNo:"202605280012", goods:"화학원료 혼합물", importer:"(주)켐트레이딩", riskScore:91, trackStatus:"세관 검사 중", updated:"오늘 09:12" },
    { declNo:"202605270008", goods:"의류 (원산지 불명)", importer:"패스트패션(주)", riskScore:83, trackStatus:"샘플 분석 중", updated:"어제 16:30" },
    { declNo:"202605250003", goods:"전자부품 세트", importer:"전자부품(주)", riskScore:78, trackStatus:"서류 보완 요청", updated:"2026-05-25" },
  ];
  return `
    <section class="card gi-hub">
      <div class="gi-page-head">
        <div>
          <h2>위험선별 분석</h2>
          <p class="muted">수입신고 건 중 위험도가 높은 적하목록을 선별하고 추적관리합니다.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="muted" style="font-size:12px">기준일: ${today}</span>
          <span style="background:#fee2e2;color:#dc2626;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:700">고위험 ${highRiskItems.length}건</span>
        </div>
      </div>
      <div class="gi-tab-nav">
        <button class="gi-tab${tab==="today"?" active":""}" data-rs-tab="today">당일 고위험 적하목록</button>
        <button class="gi-tab${tab==="tracking"?" active":""}" data-rs-tab="tracking">추적관리</button>
      </div>
      <div class="gi-tab-body">
        ${tab === "tracking" ? `
          <h4 style="margin-bottom:12px;color:#41506a;font-size:14px">추적관리 대상 (${trackingItems.length}건)</h4>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>신고번호</th><th>품명</th><th>수입자</th><th>위험점수</th><th>추적상태</th><th>갱신시각</th></tr></thead>
              <tbody>
                ${trackingItems.map(t=>`
                  <tr>
                    <td style="font-family:monospace;font-size:12px">${escapeHtml(t.declNo)}</td>
                    <td>${escapeHtml(t.goods)}</td>
                    <td>${escapeHtml(t.importer)}</td>
                    <td><strong style="color:${t.riskScore>=90?"#dc2626":t.riskScore>=80?"#d97706":"#16a34a"}">${t.riskScore}</strong></td>
                    <td><span style="background:#eef4ff;color:#1e40af;border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(t.trackStatus)}</span></td>
                    <td class="muted">${escapeHtml(t.updated)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : `
          <h4 style="margin-bottom:12px;color:#41506a;font-size:14px">당일(${today}) 고위험 수입신고 (${highRiskItems.length}건)</h4>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>신고번호</th><th>HS Code</th><th>품명</th><th>수입자</th><th>원산지</th><th>중량</th><th>위험점수</th><th>위험사유</th><th>상태</th><th>추적등록</th></tr></thead>
              <tbody>
                ${highRiskItems.map(item=>`
                  <tr>
                    <td style="font-family:monospace;font-size:12px">${escapeHtml(item.declNo)}</td>
                    <td style="font-family:monospace">${escapeHtml(item.hsCd)}</td>
                    <td>${escapeHtml(item.goods)}</td>
                    <td>${escapeHtml(item.importer)}</td>
                    <td><span style="background:#f0fdf4;color:#166534;border-radius:4px;padding:1px 6px;font-size:11px">${escapeHtml(item.origin)}</span></td>
                    <td style="font-size:12px">${escapeHtml(item.weight)}</td>
                    <td><strong style="color:${item.riskScore>=90?"#dc2626":item.riskScore>=80?"#d97706":"#16a34a"}">${item.riskScore}</strong></td>
                    <td style="font-size:12px;color:#7c3aed">${escapeHtml(item.reason)}</td>
                    <td><span style="background:${item.status==="검사지시"?"#fee2e2":item.status==="심사중"?"#fef3c7":"#f1f5f9"};color:${item.status==="검사지시"?"#dc2626":item.status==="심사중"?"#d97706":"#64748b"};border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(item.status)}</span></td>
                    <td><button class="btn small" data-rs-tab="tracking" style="font-size:11px">추적등록</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   통관정보 분석 페이지
   ═══════════════════════════════════════════════════════════════ */
function customsInfoPage(){
  const tab = customsInfoTab;
  const today = new Date().toISOString().slice(0,10);
  const declarations = [
    { declNo:"IMP-20260530-0001", type:"수입", goods:"반도체 장비", hs:"8486.20", importer:"삼성전자(주)", origin:"US", value:"USD 2,400,000", riskScore:12, status:"수리완료" },
    { declNo:"IMP-20260530-0002", type:"수입", goods:"유기화합물", hs:"2901.10", importer:"(주)석유화학", origin:"SA", value:"USD 890,000", riskScore:45, status:"심사중" },
    { declNo:"EXP-20260530-0001", type:"수출", goods:"자동차 부품", hs:"8708.29", importer:"현대모비스(주)", origin:"KR", value:"USD 1,200,000", riskScore:8, status:"수리완료" },
    { declNo:"IMP-20260530-0003", type:"수입", goods:"의류 완제품", hs:"6203.42", importer:"(주)패션코리아", origin:"BD", value:"USD 320,000", riskScore:78, status:"검사지시" },
    { declNo:"EXP-20260530-0002", type:"수출", goods:"화장품", hs:"3304.99", importer:"(주)뷰티코리아", origin:"KR", value:"USD 560,000", riskScore:15, status:"수리완료" },
  ];
  const countryStats = [
    {country:"미국(US)",import:142,export:89,risk:18},
    {country:"중국(CN)",import:328,export:215,risk:35},
    {country:"일본(JP)",import:98,export:134,risk:12},
    {country:"베트남(VN)",import:187,export:67,risk:28},
    {country:"독일(DE)",import:76,export:45,risk:9},
  ];
  const hsStats = [
    {group:"84 기계·기기",count:412,risk:22},
    {group:"85 전기기기",count:389,risk:19},
    {group:"61-62 의류",count:287,risk:65},
    {group:"29 유기화합물",count:156,risk:48},
    {group:"87 자동차",count:234,risk:11},
  ];
  return `
    <section class="card gi-hub">
      <div class="gi-page-head">
        <div>
          <h2>통관정보 분석</h2>
          <p class="muted">전체 통관 내역 기준의 분석 정보를 제공합니다. 국가별·HS그룹별·위험도 통계를 확인합니다.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="date" class="form-input" style="height:32px;font-size:12px" value="${today}" id="ciDateFrom">
          <span class="muted">~</span>
          <input type="date" class="form-input" style="height:32px;font-size:12px" value="${today}" id="ciDateTo">
          <button class="btn" style="height:32px;padding:0 12px;font-size:12px" data-ci-tab="${tab}">조회</button>
        </div>
      </div>
      <div class="gi-tab-nav">
        <button class="gi-tab${tab==="today"?" active":""}" data-ci-tab="today">당일 수출입 신고내역</button>
        <button class="gi-tab${tab==="stats"?" active":""}" data-ci-tab="stats">통계 분석</button>
      </div>
      <div class="gi-tab-body">
        ${tab === "stats" ? `
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:260px">
              <h4 style="margin-bottom:10px;font-size:14px;color:#41506a">국가별 신고 현황</h4>
              <table class="data-table">
                <thead><tr><th>국가</th><th>수입</th><th>수출</th><th>평균위험도</th></tr></thead>
                <tbody>
                  ${countryStats.map(c=>`
                    <tr>
                      <td>${escapeHtml(c.country)}</td>
                      <td>${c.import}</td>
                      <td>${c.export}</td>
                      <td><span style="color:${c.risk>=50?"#dc2626":c.risk>=30?"#d97706":"#16a34a"};font-weight:700">${c.risk}</span></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
            <div style="flex:1;min-width:260px">
              <h4 style="margin-bottom:10px;font-size:14px;color:#41506a">HS 그룹별 위험도</h4>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${hsStats.map(h=>`
                  <div style="background:#f8fbff;border:1px solid #dde8ff;border-radius:8px;padding:10px 12px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                      <span style="font-size:13px;color:#123c85;font-weight:600">${escapeHtml(h.group)}</span>
                      <span class="risk-chip ${h.risk>=50?"high":h.risk>=30?"mid":"low"}" style="margin-left:auto">${h.risk}점</span>
                    </div>
                    <div style="background:#e5edff;border-radius:4px;height:8px;overflow:hidden">
                      <div style="width:${h.risk}%;background:${h.risk>=50?"#dc2626":h.risk>=30?"#d97706":"#22c55e"};height:100%;border-radius:4px"></div>
                    </div>
                    <div style="font-size:11px;color:#6b7f9e;margin-top:4px">신고건수: ${h.count}건</div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        ` : `
          <h4 style="margin-bottom:12px;color:#41506a;font-size:14px">당일(${today}) 수출입 신고내역 (${declarations.length}건)</h4>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>신고번호</th><th>구분</th><th>품명</th><th>HS Code</th><th>신고인</th><th>원산지</th><th>신고가액</th><th>위험도</th><th>처리상태</th></tr></thead>
              <tbody>
                ${declarations.map(d=>`
                  <tr>
                    <td style="font-family:monospace;font-size:12px">${escapeHtml(d.declNo)}</td>
                    <td><span style="background:${d.type==="수입"?"#eff6ff":"#f0fdf4"};color:${d.type==="수입"?"#1d4ed8":"#166534"};border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(d.type)}</span></td>
                    <td>${escapeHtml(d.goods)}</td>
                    <td style="font-family:monospace">${escapeHtml(d.hs)}</td>
                    <td>${escapeHtml(d.importer)}</td>
                    <td><span style="background:#f0fdf4;color:#166534;border-radius:4px;padding:1px 6px;font-size:11px">${escapeHtml(d.origin)}</span></td>
                    <td style="font-size:12px">${escapeHtml(d.value)}</td>
                    <td><strong style="color:${d.riskScore>=70?"#dc2626":d.riskScore>=40?"#d97706":"#16a34a"}">${d.riskScore}</strong></td>
                    <td><span style="background:${d.status==="검사지시"?"#fee2e2":d.status==="심사중"?"#fef3c7":"#f0fdf4"};color:${d.status==="검사지시"?"#dc2626":d.status==="심사중"?"#d97706":"#166534"};border-radius:4px;padding:2px 8px;font-size:12px">${escapeHtml(d.status)}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   국제정보 분석 페이지 (WCO 챗봇 UI)
   ═══════════════════════════════════════════════════════════════ */
function intlInfoPage(){
  const promptTemplates = [
    "WCO 최신 HS 개정사항 중 국내 수출입 영향이 큰 품목을 분석해줘",
    "WCO 마약 관련 최신 결의문 내용을 요약하고 국내 조치사항을 알려줘",
    "WCO 원산지 규정 분과위원회 결정사항 중 한-미 무역에 영향을 주는 것은?",
    "WCO SAFE Framework 최신 개정 내용을 정리해줘",
    "WCO AEO 상호인정협정 현황과 국내 활용 방안을 알려줘",
  ];
  return `
    <section class="card gi-hub gi-hub-full">
      <div class="gi-page-head">
        <div>
          <h2>국제정보 분석</h2>
          <p class="muted">WCO 회의 결과와 분과위원회 결정사항을 기반으로 국내 수출입 품목과 연관된 분석을 제공합니다.</p>
        </div>
      </div>
      <div class="gi-tab-body" style="display:flex;flex-direction:column;height:100%;min-height:0">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:12px">
          <div style="font-size:13px;color:#1e40af;font-weight:600;margin-bottom:6px">프롬프트 템플릿</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${promptTemplates.map(t=>`
              <button class="btn small" data-intl-template="${escapeHtml(t)}" style="font-size:11px;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t)}</button>
            `).join("")}
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;border:1px solid #dde8ff;border-radius:8px;padding:12px;background:#f8fbff;min-height:200px;display:flex;flex-direction:column;gap:10px" id="intlChatMessages">
          ${intlInfoMessages.length === 0 ? `
            <div class="empty-state" style="margin:auto">
              WCO 회의 결과 및 분과위원회 결정사항에 대해 질문하세요.<br>
              <span class="muted" style="font-size:12px">위 템플릿을 클릭하거나 직접 입력하세요.</span>
            </div>
          ` : intlInfoMessages.map(m=>`
            <div style="display:flex;${m.role==="user"?"justify-content:flex-end":"justify-content:flex-start"}">
              <div style="max-width:75%;background:${m.role==="user"?"#1e40af":"#fff"};color:${m.role==="user"?"#fff":"#1e293b"};border-radius:${m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px"};padding:10px 14px;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,.08);border:${m.role==="ai"?"1px solid #dde8ff":"none"};white-space:pre-wrap">
                ${m.role==="ai"?`<div style="font-size:10px;color:#6b7f9e;margin-bottom:4px">WCO AI 분석</div>`:""}
                ${escapeHtml(m.text)}
              </div>
            </div>
          `).join("")}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="intlChatInput" class="form-input" style="flex:1" placeholder="WCO 관련 질문을 입력하세요...">
          <button class="btn primary" data-intl-send style="width:80px">전송</button>
        </div>
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   관세 온톨로지 페이지
   ═══════════════════════════════════════════════════════════════ */
function customsOntologyPage(){
  const tab = ontologyTab;
  const ontologyNodes = [
    {id:"traveler",label:"우범여행자",type:"person",x:50,y:20,desc:"마약·밀수 관련 위험 여행자"},
    {id:"associate",label:"관계자",type:"person",x:20,y:45,desc:"우범여행자와 연관된 인물"},
    {id:"company",label:"기업",type:"org",x:80,y:45,desc:"우범자/관계자가 대표자인 기업"},
    {id:"cargo_a",label:"화물(관계자화주)",type:"cargo",x:15,y:75,desc:"우범여행자 관계자가 화주인 화물"},
    {id:"cargo_b",label:"화물(기업화주)",type:"cargo",x:85,y:75,desc:"우범여행자/관계자 기업의 화물"},
    {id:"declaration",label:"수입신고",type:"event",x:50,y:90,desc:"화물 관련 수입신고"},
  ];
  const ontologyEdges = [
    {from:"traveler",to:"associate",label:"알고있음",type:"relation"},
    {from:"traveler",to:"company",label:"대표자",type:"role"},
    {from:"associate",to:"company",label:"관계자",type:"role"},
    {from:"associate",to:"cargo_a",label:"화주",type:"role"},
    {from:"company",to:"cargo_b",label:"화주기업",type:"role"},
    {from:"cargo_a",to:"declaration",label:"신고대상",type:"event"},
    {from:"cargo_b",to:"declaration",label:"신고대상",type:"event"},
  ];
  const rules = [
    { id:"R01", name:"우범여행자 화물 감시", condition:"우범여행자 = 화물.화주 OR 우범여행자.관계자 = 화물.화주", action:"위험도 +30, 검사지시", category:"화물감시" },
    { id:"R02", name:"우범여행자 기업 연계", condition:"우범여행자 = 기업.대표자 OR 우범여행자.관계자 = 기업.대표자", action:"기업 위험도 상향, 통관 강화심사", category:"기업감시" },
    { id:"R03", name:"관계자 화물 추적", condition:"우범여행자.관계자 = 화물.화주 AND 화물.원산지 IN 우범국가", action:"위험도 +20, 심층검사", category:"화물감시" },
    { id:"R04", name:"고빈도 입국 패턴", condition:"여행자.최근30일입국횟수 >= 3 AND 여행자.입국경로 IN 마약경로", action:"우범여행자 등록 검토", category:"입국감시" },
    { id:"R05", name:"저가신고 연계기업 감시", condition:"기업.저가신고건수 >= 3 AND 기업.대표자 = 우범여행자.관계자", action:"전수 검사, 조사국 통보", category:"가격심사" },
  ];
  const inferences = [
    { id:"INF-001", subject:"(주)위장무역", conclusion:"고위험 기업 분류", path:"박공범(관계자) → 대표자 → (주)위장무역 → 화물 3건 → 마약전구물질 포함", confidence:92 },
    { id:"INF-002", subject:"화물 202605300001", conclusion:"심층검사 대상", path:"김우범(우범여행자) → 화주 → 화물 202605300001 → R01 적용", confidence:95 },
    { id:"INF-003", subject:"최연락", conclusion:"우범여행자 등록 검토", path:"최연락 → 최근30일 4회 입국 → 방콕 경유 → R04 적용", confidence:78 },
  ];
  const nodeColors = {person:"#7c3aed",org:"#0284c7",cargo:"#d97706",event:"#16a34a"};
  const nodeLabels = {person:"인물",org:"기관/기업",cargo:"화물",event:"사건/신고"};
  return `
    <section class="card gi-hub">
      <div class="gi-page-head">
        <div>
          <h2>관세 온톨로지</h2>
          <p class="muted">지식그래프 기반 의미론적 온톨로지 — 우범여행자 감시 온톨로지, 관계망 그래프, 룰 및 추론 엔진을 제공합니다.</p>
        </div>
      </div>
      <div class="gi-tab-nav">
        <button class="gi-tab${tab==="graph"?" active":""}" data-ont-tab="graph">관계망 그래프</button>
        <button class="gi-tab${tab==="rules"?" active":""}" data-ont-tab="rules">온톨로지 룰</button>
        <button class="gi-tab${tab==="inference"?" active":""}" data-ont-tab="inference">추론 엔진 결과</button>
      </div>
      <div class="gi-tab-body">
        ${tab === "rules" ? `
          <div style="margin-bottom:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e">
            룰(Rule) 기반 추론 엔진이 아래 조건을 평가하여 우범여행자 관련 화물·기업에 자동으로 위험등급을 부여하고 조치를 취합니다.
          </div>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>규칙ID</th><th>규칙명</th><th>조건(IF)</th><th>조치(THEN)</th><th>분류</th></tr></thead>
              <tbody>
                ${rules.map(r=>`
                  <tr>
                    <td style="font-family:monospace;color:#1e40af">${escapeHtml(r.id)}</td>
                    <td><strong>${escapeHtml(r.name)}</strong></td>
                    <td style="font-family:monospace;font-size:11px;color:#7c3aed">${escapeHtml(r.condition)}</td>
                    <td style="font-size:12px;color:#dc2626">${escapeHtml(r.action)}</td>
                    <td><span style="background:#eef4ff;color:#1e40af;border-radius:4px;padding:1px 6px;font-size:11px">${escapeHtml(r.category)}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : tab === "inference" ? `
          <div style="margin-bottom:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:13px;color:#166534">
            추론 엔진이 온톨로지 룰을 적용하여 도출한 결론입니다. 추론 경로를 통해 판단 근거를 투명하게 확인할 수 있습니다.
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${inferences.map(inf=>`
              <div style="background:#f8fbff;border:1px solid #dde8ff;border-radius:10px;padding:14px 16px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                  <span style="font-family:monospace;color:#1e40af;font-size:12px">${escapeHtml(inf.id)}</span>
                  <strong style="font-size:14px">${escapeHtml(inf.subject)}</strong>
                  <span style="background:#fee2e2;color:#dc2626;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:700;margin-left:auto">${escapeHtml(inf.conclusion)}</span>
                  <span style="font-size:12px;color:${inf.confidence>=90?"#16a34a":"#d97706"}">신뢰도 ${inf.confidence}%</span>
                </div>
                <div style="font-size:12px;color:#6b7f9e;background:#fff;border:1px solid #e5edff;border-radius:6px;padding:8px 10px;font-family:monospace">
                  추론 경로: ${escapeHtml(inf.path)}
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <div style="display:flex;gap:16px">
            <div style="flex:1;min-width:0">
              <div class="panel-section-hdr" style="margin-bottom:8px"><span>우범여행자 감시 온톨로지 그래프</span></div>
              <div style="position:relative;height:480px;background:#f8fbff;border:1px solid #dde8ff;border-radius:10px;overflow:hidden">
                <svg width="100%" height="100%" style="position:absolute;top:0;left:0">
                  ${ontologyEdges.map(e=>{
                    const from = ontologyNodes.find(n=>n.id===e.from);
                    const to   = ontologyNodes.find(n=>n.id===e.to);
                    if(!from||!to) return "";
                    const x1=from.x+"%", y1=from.y+"%", x2=to.x+"%", y2=to.y+"%";
                    const mx=((from.x+to.x)/2)+"%", my=((from.y+to.y)/2)+"%";
                    const color = e.type==="relation"?"#7c3aed":e.type==="role"?"#0284c7":"#16a34a";
                    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${e.type==="event"?"4,3":""}"/>
                            <text x="${mx}" y="${my}" font-size="10" fill="${color}" text-anchor="middle" dy="-3">${escapeHtml(e.label)}</text>`;
                  }).join("")}
                </svg>
                ${ontologyNodes.map(n=>`
                  <div style="position:absolute;left:calc(${n.x}% - 40px);top:calc(${n.y}% - 28px);text-align:center;width:80px">
                    <div style="background:${nodeColors[n.type]};color:#fff;border-radius:8px;padding:6px 4px;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.15);border:2px solid #fff;cursor:default" title="${escapeHtml(n.desc)}">${escapeHtml(n.label)}</div>
                    <div style="font-size:10px;color:#6b7f9e;margin-top:2px">${escapeHtml(nodeLabels[n.type])}</div>
                  </div>
                `).join("")}
              </div>
              <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">
                ${Object.entries(nodeColors).map(([type,color])=>`
                  <span style="display:flex;align-items:center;gap:4px;font-size:12px">
                    <span style="width:12px;height:12px;border-radius:3px;background:${color};display:inline-block"></span>${nodeLabels[type]}
                  </span>
                `).join("")}
              </div>
            </div>
            <div style="width:280px;flex:none">
              <div class="panel-section-hdr" style="margin-bottom:8px"><span>온톨로지 클래스 정의</span></div>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${ontologyNodes.map(n=>`
                  <div style="background:#fff;border:1px solid #dde8ff;border-radius:8px;padding:10px 12px;border-left:3px solid ${nodeColors[n.type]}">
                    <div style="display:flex;align-items:center;gap:6px">
                      <strong style="font-size:13px;color:${nodeColors[n.type]}">${escapeHtml(n.label)}</strong>
                      <span style="font-size:10px;color:#6b7f9e;border:1px solid #dde8ff;border-radius:3px;padding:1px 5px">${escapeHtml(nodeLabels[n.type])}</span>
                    </div>
                    <div style="font-size:12px;color:#6b7f9e;margin-top:3px">${escapeHtml(n.desc)}</div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        `}
      </div>
    </section>
  `;
}

function canvasTabContent(){
  if(canvasTab === "profile") return canvasProfilePanel();
  if(canvasTab === "data") return canvasDataPanel();
  if(canvasTab === "scenario") return scenarioWorkbenchV2();
  if(canvasTab === "templates") return scenarioTemplatePanel();
  if(canvasTab === "report") return canvasReportPanel();
  return canvasOverviewPanel();
}

function currentJobStatus(){
  const total = scenarioItems.length || 7;
  const done = Object.values(stepStatuses).filter(status => status === "완료").length;
  const hasRunning = Object.values(stepStatuses).some(status => status === "실행 중");
  if(hasRunning) return { label:"실행 중", done, total, pct:Math.round((done / total) * 100), tone:"running" };
  if(done && done >= total) return { label:"완료", done, total, pct:100, tone:"done" };
  if(done) return { label:"일부 완료", done, total, pct:Math.round((done / total) * 100), tone:"running" };
  return { label:"대기", done:0, total, pct:0, tone:"wait" };
}

function scenarioSignature(items = scenarioItems){
  return JSON.stringify(items.map(item => ({
    key: item.key,
    behaviors: item.behaviors || [],
    instruction: item.instruction || "",
    order: item.order,
  })));
}

function applyJobOverride(job){
  const override = canvasJobOverrides[job.companyId] || {};
  return {
    ...job,
    ...override,
    status: {...(job.status || {}), ...(override.status || {})},
  };
}

function canvasJobs(){
  const status = currentJobStatus();
  const defaultJobs = [
    {
      companyId:"C-1001",
      companyName:"한국소재무역",
      title:"한국소재무역 관세 위험 분석",
      category:"위험선별 분석",
      company:"한국소재무역 (C-1001)",
      owner:"조사국 조사1과",
      updated:"방금",
      status,
      next:"분석 시나리오 설정 및 수행",
      tab:"scenario",
      assignees:["u01","u08"],
    },
    {
      companyId:"C-1002",
      companyName:"서울인터내셔널",
      title:"서울인터내셔널 원유·의류 수입 검토",
      category:"통관 정보분석",
      company:"서울인터내셔널 (C-1002)",
      owner:"심사정보 RAG AI 서비스",
      updated:"오늘 08:40",
      status:{ label:"자료 수집", done:2, total:7, pct:29, tone:"running" },
      next:"데이터 수집",
      tab:"data",
      assignees:["u01","u09"],
    },
    {
      companyId:"C-1008",
      companyName:"제주리테일커머스",
      title:"제주리테일커머스 환급 이상 검토",
      category:"관세조사 분석",
      company:"제주리테일커머스 (C-1008)",
      owner:"보고서 생성 AI 서비스",
      updated:"어제",
      status:{ label:"보고서 검증", done:6, total:7, pct:86, tone:"review" },
      next:"분석보고서 및 검증",
      tab:"report",
      assignees:["u01","u16"],
    },
  ];
  return [...defaultJobs.map(applyJobOverride), ...customCanvasJobs.map(applyJobOverride)];
}

function isJobAssignedToCurrentUser(job){
  const assignees = Array.isArray(job.assignees) && job.assignees.length ? job.assignees : ["u01"];
  const hidden = hiddenCanvasJobsByUser[currentUserId] || [];
  return assignees.includes(currentUserId) && !hidden.includes(job.companyId);
}

function visibleCanvasJobs(){
  return canvasJobs().filter(isJobAssignedToCurrentUser);
}

function removeCanvasJobForCurrentUser(companyId){
  const job = canvasJobs().find(item => item.companyId === companyId);
  if(!job) return;
  const assignees = Array.isArray(job.assignees) ? job.assignees : [];
  const sharedWithOthers = assignees.some(userId => userId !== currentUserId);
  if(sharedWithOthers || !customCanvasJobs.some(item => item.companyId === companyId)){
    const hidden = new Set(hiddenCanvasJobsByUser[currentUserId] || []);
    hidden.add(companyId);
    hiddenCanvasJobsByUser[currentUserId] = [...hidden];
  } else {
    customCanvasJobs = customCanvasJobs.filter(item => item.companyId !== companyId);
    delete canvasJobOverrides[companyId];
    delete canvasRunArchives[companyId];
    delete companyScenarios[companyId];
  }
  const nextJob = activeCanvasJobs()[0] || null;
  if(activeCanvasCompanyId === companyId && nextJob){
    activeCanvasCompanyId = nextJob.companyId;
  }
  saveCanvasState();
}

function isArchivedJob(job){
  return job.archived === true;
}

function isCompletedActiveJob(job){
  return !isArchivedJob(job) && (job.status?.tone === "done" || job.status?.label === "완료" || job.status?.pct >= 100);
}

function activeCanvasJobs(){
  return visibleCanvasJobs().filter(job => !isArchivedJob(job));
}

function activeGeneralInvestigationJobs(){
  return allGenInvCases()
    .filter(item => !item.archived)
    .filter(item => {
      if(!item.ownerUserId && !item.assignees) return true;
      if(item.ownerUserId === currentUserId) return true;
      return Array.isArray(item.assignees) && item.assignees.includes(currentUserId);
    })
    .map(item => {
      const status = item.status || { label:"대기", done:0, total:activeGiCaseStepsForCard(item).length || 1, pct:0, tone:"wait" };
      const total = status.total || activeGiCaseStepsForCard(item).length || 1;
      const done = status.done ?? 0;
      const targetLabel = item.targetType === "person" ? "개인수사 분석" : "기업 수사 분석";
      return {
        jobId: item.caseId,
        companyId: item.companyId || item.personId || item.caseId,
        companyName: item.targetName,
        title: `${item.targetName} ${genInvTypeById(item.invTypeId).label}`,
        category: targetLabel,
        company: `${item.targetName} (${item.caseId})`,
        owner: item.investigator || currentUser().name,
        updated: item.updated || "방금",
        status: { ...status, done, total, pct: status.pct ?? Math.round((done / total) * 100) },
        next: "진행중인 수사",
        page: "generalinv",
        openTab: "cases",
      };
    });
}

function activeGiCaseStepsForCard(aCase){
  if(!aCase) return [];
  return aCase.giSteps || (GI_SCENARIO_STEPS[aCase.invTypeId] || GI_SCENARIO_STEPS.t7 || []);
}

function activeDrugInvestigationJobs(){
  return defaultDrugInvCases.map(item => ({
    jobId: item.caseId,
    companyId: item.caseId,
    companyName: item.targetName,
    title: item.targetName,
    category: item.category,
    company: `${item.targetName} (${item.caseId})`,
    owner: item.owner,
    updated: item.updated,
    status: item.status,
    next: "진행중인 분석작업",
    page: "lawsearch",
    openTab: "ongoing",
  }));
}

function activeAnalysisJobs(){
  const customsJobs = activeCanvasJobs().map(job => ({
    ...job,
    jobId: job.companyId,
    page: "investigation",
    openTab: "ongoing",
  }));
  return [...customsJobs, ...activeGeneralInvestigationJobs(), ...activeDrugInvestigationJobs()]
    .sort((a, b) => (b.updated === "방금") - (a.updated === "방금"));
}

function archivedCanvasJobs(){
  return visibleCanvasJobs().filter(isArchivedJob);
}

function isCompanyArchived(companyId = activeCanvasCompanyId){
  return Boolean(canvasJobs().find(job => job.companyId === companyId && isArchivedJob(job)));
}

function findCompanyById(companyId){
  const listedCompany = scenarioCompanies.find(company => company.company_id === companyId);
  if(listedCompany) return listedCompany;
  const job = canvasJobs().find(item => item.companyId === companyId);
  return job ? { company_id:job.companyId, company_name:job.companyName } : null;
}

function createCanvasJob(company){
  const companyId = company.company_id;
  const companyName = company.company_name || companyId;
  const existing = canvasJobs().find(job => job.companyId === companyId);
  if(existing){
    const assignees = new Set(existing.assignees || []);
    assignees.add(currentUserId);
    patchCanvasJob(companyId, { assignees:[...assignees], archived:false });
    hiddenCanvasJobsByUser[currentUserId] = (hiddenCanvasJobsByUser[currentUserId] || []).filter(id => id !== companyId);
    saveCanvasState();
    return;
  }
  customCanvasJobs.unshift({
    companyId,
    companyName,
    title:`${companyName} 신규 분석 시나리오`,
    category:"관세조사 분석",
    company:`${companyName} (${companyId})`,
    owner:"신규 분석 작업",
    updated:"방금",
    status:{ label:"대기", done:0, total:7, pct:0, tone:"wait" },
    next:"기업프로파일",
    tab:"profile",
    isNew:true,
    ownerUserId:currentUserId,
    assignees:[currentUserId],
  });
  saveCanvasState();
}

function patchCanvasJob(companyId, patch){
  const customJob = customCanvasJobs.find(job => job.companyId === companyId);
  if(customJob){
    Object.assign(customJob, patch);
    if(patch.status) customJob.status = { ...customJob.status, ...patch.status };
  }else{
    const current = canvasJobOverrides[companyId] || {};
    canvasJobOverrides[companyId] = {
      ...current,
      ...patch,
      status: { ...(current.status || {}), ...(patch.status || {}) },
    };
  }
  saveCanvasState();
}

function updateCanvasJobStatus(companyId, statusPatch){
  const patch = { status: statusPatch, updated: "방금" };
  if(statusPatch.label === "완료"){
    patch.tab = "report";
  }else if(statusPatch.tone === "running" || statusPatch.label === "대기" || statusPatch.label === "오류"){
    patch.archived = false;
  }
  patchCanvasJob(companyId, patch);
}

function activeCanvasJob(){
  const jobs = visibleCanvasJobs();
  return jobs.find(job => job.companyId === activeCanvasCompanyId) || jobs[0];
}

function activeCanvasCompany(companyIdOverride = activeCanvasCompanyId){
  const companyId = companyIdOverride || activeCanvasCompanyId;
  const listedCompany = findCompanyById(companyId);
  const job = companyId === activeCanvasCompanyId
    ? activeCanvasJob()
    : canvasJobs.find(item => item.companyId === companyId);
  return {
    company_id: companyId,
    company_name: listedCompany?.company_name || job?.companyName || companyId,
    risk_level: listedCompany?.risk_level || (companyId === "C-1002" ? "HIGH" : companyId === "C-1008" ? "LOW" : "MEDIUM"),
    risk_score: listedCompany?.risk_score ?? (companyId === "C-1002" ? 82.7 : companyId === "C-1008" ? 44.6 : 58.4),
    annual_import_amount: listedCompany?.annual_import_amount,
    declared_duty_amount: listedCompany?.declared_duty_amount,
  };
}

function currentRunArchive(companyId = activeCanvasCompanyId){
  return canvasRunArchives[companyId] || null;
}

function hasMeaningfulArchiveResults(archive){
  if(!archive) return false;
  const report = archive.latestReport || "";
  const validation = archive.latestValidation || "";
  return Boolean(
    Object.keys(archive.stepOutputs || {}).length ||
    (report && report !== "보고서가 아직 생성되지 않았습니다." && report !== "보고서 생성 대기 중입니다.") ||
    (validation && validation !== "검증 결과가 아직 없습니다." && validation !== "검증 대기 중입니다.")
  );
}

function archiveStatusSummary(archive){
  const total = archive?.scenarioItems?.length || Object.keys(archive?.stepStatuses || {}).length || 7;
  const statuses = Object.values(archive?.stepStatuses || {});
  const done = statuses.filter(status => status === "완료").length;
  const hasError = statuses.some(status => status === "오류");
  const hasRunning = statuses.some(status => status === "실행 중");
  const pct = total ? Math.round((done / total) * 100) : 0;
  if(hasError) return { label:"오류", done, total, pct, tone:"review" };
  if(done >= total && total > 0 && !archive?.partial) return { label:"완료", done, total, pct:100, tone:"done" };
  if(done > 0 || archive?.partial) return { label:hasRunning ? "실행 중" : "일부 완료", done, total, pct, tone:"running" };
  if(archive?.jobStatus) return { ...archive.jobStatus };
  return { label:"대기", done:0, total, pct:0, tone:"wait" };
}

function restoreRunArchiveToWorkspace(companyId, options = {}){
  const archive = currentRunArchive(companyId);
  const existingJobStatus = canvasJobs().find(job => job.companyId === companyId)?.status;
  const archivedStatus = archiveStatusSummary(archive);
  const status = archivedStatus.pct || !existingJobStatus ? archivedStatus : existingJobStatus;
  const hasReport = archive && archive.latestReport && archive.latestReport !== "보고서가 아직 생성되지 않았습니다.";
  const nextTab = options.tab || (hasReport ? "report" : "scenario");
  patchCanvasJob(companyId, {
    archived:false,
    scenarioChanged:false,
    status,
    tab:nextTab,
    updated:"방금",
  });
  activeCanvasCompanyId = companyId;
  if(archive?.scenarioItems?.length){
    companyScenarios[companyId] = archive.scenarioItems.map(item => ({...item}));
    scenarioItems = archive.scenarioItems.map((item, index) => normalizeScenarioItem({...item}, index));
    selectedScenarioId = scenarioItems[0]?.id || null;
  }else{
    scenarioItems = getCompanyScenario(companyId);
    selectedScenarioId = scenarioItems[0]?.id || null;
  }
  scenarioLoadedForCompany = companyId;
  scenarioInitialized = false;
  loadCompanyRunArchive(companyId);
  saveCanvasState();
}

function finalArchiveSnapshot(companyId){
  const existing = currentRunArchive(companyId) || {};
  const currentHasResults = hasMeaningfulArchiveResults({ stepOutputs, latestReport, latestValidation });
  const useCurrent = companyId === activeCanvasCompanyId && currentHasResults;
  const jobStatus = canvasJobs().find(job => job.companyId === companyId)?.status || archiveStatusSummary(existing);
  const snapshot = {
    ...existing,
    companyId,
    savedAt: new Date().toLocaleString("ko-KR"),
    scenarioSignature: useCurrent ? scenarioSignature() : (existing.scenarioSignature || scenarioSignature(getCompanyScenario(companyId))),
    scenarioItems: useCurrent
      ? scenarioItems.map(item => ({...item}))
      : ((existing.scenarioItems && existing.scenarioItems.length)
          ? existing.scenarioItems.map(item => ({...item}))
          : getCompanyScenario(companyId).map(item => ({...item}))),
    stepOutputs: useCurrent ? {...stepOutputs} : {...(existing.stepOutputs || {})},
    stepStatuses: useCurrent ? {...stepStatuses} : {...(existing.stepStatuses || {})},
    latestReport: useCurrent ? latestReport : (existing.latestReport || latestReport),
    latestValidation: useCurrent ? latestValidation : (existing.latestValidation || latestValidation),
    jobStatus,
    partial: false,
  };
  if(!hasMeaningfulArchiveResults(snapshot) && hasMeaningfulArchiveResults(existing)){
    return { ...existing, savedAt: snapshot.savedAt, partial:false };
  }
  return snapshot;
}

function archiveCanvasJob(companyId){
  const archive = finalArchiveSnapshot(companyId);
  canvasRunArchives[companyId] = archive;
  if(archive.scenarioItems?.length){
    companyScenarios[companyId] = archive.scenarioItems.map(item => ({...item}));
  }
  patchCanvasJob(companyId, {
    archived:true,
    archivedAt: archive.savedAt,
    scenarioChanged:false,
    status: archiveStatusSummary(archive),
    tab:"report",
    updated:"방금",
  });
}

function loadCompanyRunArchive(companyId){
  const archive = currentRunArchive(companyId);
  if(!archive){
    latestReport = "보고서가 아직 생성되지 않았습니다.";
    latestValidation = "검증 결과가 아직 없습니다.";
    stepOutputs = {};
    stepStatuses = {};
    openedSteps = new Set();
    expandedResultStepId = null;
    return;
  }
  latestReport = archive.latestReport || "보고서가 아직 생성되지 않았습니다.";
  latestValidation = archive.latestValidation || "검증 결과가 아직 없습니다.";
  stepOutputs = archive.stepOutputs ? {...archive.stepOutputs} : {};
  stepStatuses = archive.stepStatuses ? {...archive.stepStatuses} : {};
  openedSteps = new Set(Object.keys(stepOutputs));
  expandedResultStepId = null;
}

function saveRunArchive(companyId){
  canvasRunArchives[companyId] = {
    companyId,
    savedAt: new Date().toLocaleString("ko-KR"),
    scenarioSignature: scenarioSignature(),
    scenarioItems: scenarioItems.map(item => ({...item})),
    stepOutputs: {...stepOutputs},
    stepStatuses: {...stepStatuses},
    latestReport,
    latestValidation,
    partial: false,
  };
  patchCanvasJob(companyId, { scenarioChanged:false, tab:"report" });
}

function saveIntermediateResults(companyId){
  canvasRunArchives[companyId] = {
    ...(canvasRunArchives[companyId] || {}),
    companyId,
    savedAt: new Date().toLocaleString("ko-KR"),
    scenarioSignature: scenarioSignature(),
    scenarioItems: scenarioItems.map(item => ({...item})),
    stepOutputs: {...stepOutputs},
    stepStatuses: {...stepStatuses},
    latestReport,
    latestValidation,
    partial: true,
  };
  saveCanvasState();
}

function riskTone(riskLevel){
  if(riskLevel === "HIGH") return "high";
  if(riskLevel === "LOW") return "good";
  return "";
}

function companyOptions(){
  return scenarioCompanies;
}

function companyOptionsHtml(){
  const companies = companyOptions();
  if(!companies.length) return `<option value="">기업 프로파일 로드 중...</option>`;
  return companies
    .map(company => `<option value="${company.company_id}" ${company.company_id === activeCanvasCompanyId ? "selected" : ""}>${escapeHtml(company.company_name)} (${escapeHtml(company.company_id)})</option>`)
    .join("");
}

function refreshCompanyPicker(){
  const picker = document.getElementById("newScenarioCompanySelect");
  if(picker) picker.innerHTML = companyOptionsHtml();
}

function loadScenarioCompanies(){
  if(scenarioCompanies.length) return;
  if(scenarioCompaniesLoading) return;
  scenarioCompaniesLoading = true;
  fetch("/api/companies")
    .then(response => {
      if(!response.ok) throw new Error(`기업 프로파일 API 오류: ${response.status}`);
      return response.json();
    })
    .then(data => {
      scenarioCompanies = data.companies || [];
      scenarioCompaniesLoading = false;
      refreshCompanyPicker();
      if(canvasTab === "overview" && showScenarioCompanyPicker) render("canvas");
      if(currentPage === "profile") render("profile");
      if(currentPage === "investigation" && investigationTab === "dashboard") render("investigation");
    })
    .catch(error => {
      scenarioCompaniesLoading = false;
      const picker = document.getElementById("newScenarioCompanySelect");
      if(picker) picker.innerHTML = `<option value="">기업 프로파일 로드 실패</option>`;
      console.error(error);
    });
}

function loadRiskPersons(){
  if(riskPersons.length) return;
  if(riskPersonsLoading) return;
  riskPersonsLoading = true;
  fetch("/api/risk-persons")
    .then(response => {
      if(!response.ok) throw new Error(`우범자 프로파일 API 오류: ${response.status}`);
      return response.json();
    })
    .then(data => {
      riskPersons = data.persons || [];
      riskPersonsLoading = false;
      if(currentPage === "generalinv" && showGenInvRegForm && giRegTargetType === "person"){
        render("generalinv");
      }
    })
    .catch(error => {
      riskPersonsLoading = false;
      console.error(error);
    });
}

function loadCompanyDetail(companyId){
  if(companyDetailCache[companyId]) return;
  companyDetailCache[companyId] = { loading: true };
  fetch(`/api/company?company_id=${encodeURIComponent(companyId)}`)
    .then(r => { if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      companyDetailCache[companyId] = { ...data, loading: false };
      if(canvasTab === "profile") render("canvas");
      if(currentPage === "generalinv" && generalInvTab === "profile" && generalInvCompanyId(activeGenInvCase()) === companyId) render("generalinv");
      if(currentPage === "investigation" && investigationTab === "profile") render("investigation");
    })
    .catch(err => {
      companyDetailCache[companyId] = { error: String(err), loading: false };
      if(canvasTab === "profile") render("canvas");
      if(currentPage === "generalinv" && generalInvTab === "profile" && generalInvCompanyId(activeGenInvCase()) === companyId) render("generalinv");
      if(currentPage === "investigation" && investigationTab === "profile") render("investigation");
    });
}

function canvasOverviewPanel(){
  const jobs = activeAnalysisJobs();
  const archived = archivedCanvasJobs();
  return `
    <div class="job-board">
      ${jobs.map(job => {
        const isCustoms = (job.page || "investigation") === "investigation";
        const isDone = isCustoms && isCompletedActiveJob(job);
        const total = job.status.total ?? "?";
        const done  = job.status.done  ?? 0;
        const isActive = isCustoms
          ? job.companyId === activeCanvasCompanyId
          : job.jobId === activeGenInvCaseId;
        return `
        <article class="job-card ${isActive ? "active" : ""} ${job.isNew ? "new" : ""} ${job.scenarioChanged ? "changed" : ""}" data-analysis-job="${escapeHtml(job.jobId || job.companyId)}" data-analysis-page="${escapeHtml(job.page || "investigation")}" data-analysis-tab="${escapeHtml(job.openTab || "ongoing")}" data-canvas-company="${escapeHtml(job.companyId || "")}" tabindex="0" role="button">
          <div class="job-card-head">
            <div>
              <span class="canvas-category-chip">${escapeHtml(canvasJobCategory(job))}</span>
              <h3>${job.title}</h3>
              <p class="muted">${job.company} · ${job.owner} · ${job.updated}</p>
            </div>
            <div class="job-status-row">
              <span class="job-status ${job.status.tone}">${job.status.label}</span>
              ${isDone ? `<button class="btn-inline-action" data-archive-job="${escapeHtml(job.companyId)}" title="아카이브로 저장">아카이브</button>` : ""}
              ${isCustoms ? `<button class="btn-inline-action job-remove-action" data-remove-job="${escapeHtml(job.companyId)}" title="내 진행작업에서 삭제">삭제</button>` : ""}
            </div>
          </div>
          ${job.scenarioChanged ? `<div class="job-change-note">시나리오가 변경되어 재실행이 필요합니다.</div>` : ""}
          <div class="job-progress">
            <i style="width:${job.status.pct}%"></i>
          </div>
          <div class="job-meta">
            <span>${done}/${total} 단계</span>
            <strong>${job.status.pct}%</strong>
          </div>
        </article>
      `}).join("") || `<div class="empty-state">진행 중인 분석 작업이 없습니다.</div>`}
    </div>
    <div class="overview-archive-section">
      <button class="overview-archive-toggle" data-toggle-archive>
        완료건 확인 <strong>(${archived.length}건)</strong>
        <span>${overviewArchiveOpen ? "▲" : "▼"}</span>
      </button>
      ${overviewArchiveOpen ? `
        <div class="job-board archive-board" style="margin-top:12px">
          ${archived.map(job => {
            const archive = currentRunArchive(job.companyId);
            return `
              <article class="job-card archive-card ${job.companyId === activeCanvasCompanyId ? "active" : ""}" data-canvas-company="${job.companyId}" data-canvas-tab="report" tabindex="0" role="button">
                <div class="job-card-head">
                  <div>
                    <h3>${job.title}</h3>
                    <p class="muted">${job.company} · ${archive?.savedAt || job.archivedAt || job.updated}</p>
                  </div>
                  <div class="job-status-row">
                    <span class="job-status done">아카이브</span>
                    <button class="btn-inline-action" data-restore-job="${job.companyId}" title="진행 작업으로 복원">복원</button>
                  </div>
                </div>
                <div class="archive-summary">
                  <span>저장 로그 ${archive ? Object.keys(archive.stepOutputs || {}).length : 0}건</span>
                  <strong>${job.status?.pct || 100}%</strong>
                </div>
              </article>
            `;
          }).join("") || `<div class="empty-state">아카이브된 분석 결과가 없습니다.</div>`}
        </div>
      ` : ""}
    </div>
  `;
}

function canvasArchivePanel(){
  const jobs = archivedCanvasJobs();
  return `
    <div class="canvas-overview-toolbar">
      <div>
        <strong>분석 결과 아카이브</strong>
        <p class="muted">완료된 분석 작업과 저장된 실행 로그를 다시 열람하거나 진행 작업으로 복원합니다.</p>
      </div>
      <button class="btn secondary" data-canvas-tab="overview">진행 작업 보기</button>
    </div>
    <div class="job-board archive-board">
      ${jobs.map(job => {
        const archive = currentRunArchive(job.companyId);
        return `
          <article class="job-card archive-card ${job.companyId === activeCanvasCompanyId ? "active" : ""}" data-canvas-company="${job.companyId}" data-open-company-profile="true" tabindex="0" role="button">
            <div class="job-card-head">
              <div>
                <h3>${job.title}</h3>
                <p class="muted">${job.company} · ${archive?.savedAt || job.archivedAt || job.updated}</p>
              </div>
              <span class="job-status done">아카이브</span>
            </div>
            <div class="archive-summary">
              <span>저장 로그 ${archive ? Object.keys(archive.stepOutputs || {}).length : 0}건</span>
              <strong>${job.status?.pct || 100}%</strong>
            </div>
            <div class="archive-actions">
              <button class="btn secondary" data-canvas-company="${job.companyId}" data-canvas-tab="report">결과 열기</button>
              <button class="btn secondary" data-restore-job="${job.companyId}">진행 작업으로 복원</button>
            </div>
          </article>
        `;
      }).join("") || `<div class="empty-state">아카이브된 분석 결과가 없습니다.</div>`}
    </div>
  `;
}

function fmtAmount(v){
  if(v == null || v === "") return "-";
  const n = Number(v);
  if(isNaN(n)) return "-";
  if(n >= 1e8) return `${(n/1e8).toFixed(1)}억원`;
  if(n >= 1e4) return `${(n/1e4).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

function canvasProfilePanel(companyIdOverride = activeCanvasCompanyId, options = {}){
  const companyId = companyIdOverride || activeCanvasCompanyId;
  const cache = companyDetailCache[companyId];
  const selectedLabel = options.selectedLabel || "선택 기업";

  if(!cache || cache.loading){
    return `
      <div class="canvas-selected-company">
        <span>${escapeHtml(selectedLabel)}</span>
        <strong>${escapeHtml(companyId)}</strong>
      </div>
      <div class="profile-loading">기업 프로파일 로딩 중...</div>
    `;
  }

  if(cache.error){
    return `<div class="profile-loading" style="color:var(--red)">프로파일 로드 실패: ${escapeHtml(cache.error)}</div>`;
  }

  const c = cache.company || {};
  const risk = cache.risk || {};
  const declarations = cache.declarations || [];
  const riskLevel = c.risk_level || risk.risk_level || "-";
  const riskScore = c.risk_score ?? risk.risk_score;
  const riskLabel = riskLevel === "HIGH" ? "높음" : riskLevel === "LOW" ? "낮음" : riskLevel === "MEDIUM" ? "중간" : riskLevel;

  const declarationRows = declarations.slice(0,10).map(d => `
    <tr>
      <td>${escapeHtml(d.declaration_no || "-")}</td>
      <td>${escapeHtml(d.hs_code || "-")}</td>
      <td>${escapeHtml(d.item_name || "-")}</td>
      <td>${fmtAmount(d.declared_value)}</td>
      <td>${escapeHtml(d.origin_country || "-")}</td>
      <td>${escapeHtml(String(d.import_date || "-").slice(0,10))}</td>
      <td><span class="upload-status ${d.status === "NORMAL" ? "done" : d.status === "REVIEW" ? "review" : "running"}">${escapeHtml(d.status || "-")}</span></td>
    </tr>
  `).join("");

  return `
    <div class="canvas-selected-company">
      <span>${escapeHtml(selectedLabel)}</span>
      <strong>${escapeHtml(c.company_name || companyId)} (${escapeHtml(companyId)})</strong>
    </div>

    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="card"><span class="muted">위험등급</span><h2 class="${riskTone(riskLevel)}">${riskLabel}</h2></div>
      <div class="card"><span class="muted">AI 위험점수</span><h2 class="${riskTone(riskLevel)}">${riskScore != null ? Number(riskScore).toFixed(1) : "-"}</h2></div>
      <div class="card"><span class="muted">연간 수입금액</span><h2>${fmtAmount(c.annual_import_amount)}</h2></div>
      <div class="card"><span class="muted">신고 관세액</span><h2>${fmtAmount(c.declared_duty_amount)}</h2></div>
    </div>

    <div class="profile-grid" style="margin-bottom:14px">
      <div class="card">
        <h3>기업 기본정보</h3>
      <div class="profile-info-grid">
        <div><span class="muted">사업자번호</span><strong>${escapeHtml(c.business_registration_no || "-")}</strong></div>
        <div><span class="muted">업종코드</span><strong>${escapeHtml(c.industry_code || "-")}</strong></div>
        <div><span class="muted">설립연도</span><strong>${escapeHtml(String(c.founded_year || "-"))}</strong></div>
        <div><span class="muted">직원수</span><strong>${c.employee_count != null ? `${Number(c.employee_count).toLocaleString()}명` : "-"}</strong></div>
        <div><span class="muted">연매출</span><strong>${fmtAmount(c.annual_revenue)}</strong></div>
        <div><span class="muted">최근환급</span><strong>${fmtAmount(c.recent_customs_refund)}</strong></div>
        <div><span class="muted">FTA 감면율</span><strong>${c.fta_reduction_rate != null ? `${c.fta_reduction_rate}%` : "-"}</strong></div>
        <div><span class="muted">최근 감사일</span><strong>${escapeHtml(String(c.last_audit_date || "-").slice(0,10))}</strong></div>
        <div style="grid-column:1/-1"><span class="muted">주소</span><strong>${escapeHtml([c.address_postal_code ? `(${c.address_postal_code})` : "", c.address, c.address_detail].filter(Boolean).join(" ") || "-")}</strong></div>
        <div><span class="muted">관세사</span><strong>${escapeHtml(c.customs_broker_firm || "-")}</strong></div>
        <div><span class="muted">관계회사</span><strong>${escapeHtml(c.related_companies || "-")}</strong></div>
        <div style="grid-column:3/-1"><span class="muted">주요 수출입국</span><strong>${escapeHtml(c.major_export_countries || "-")}</strong></div>
      </div>
      </div>

      <div class="card risk-panel">
        <div class="risk-panel-head">
          <h3>AI 위험 지표 분석</h3>
          <div class="risk-circle ${riskTone(riskLevel)}">
            <strong>${riskScore != null ? Number(riskScore).toFixed(1) : "-"}</strong>
            <span>${riskLabel}</span>
          </div>
        </div>
        <div class="risk-bars">
          ${[
            ["저가신고 의심률",        risk.undervaluation_suspicion_rate],
            ["특수관계 이상률",        risk.related_party_anomaly_rate],
            ["FTA 원산지 오용 의심률", risk.fta_origin_misuse_suspicion_rate],
            ["관세환급 이상률",        risk.customs_refund_anomaly_rate],
            ["HS 분류 오류률",         risk.hs_classification_error_rate],
            ["역외자금 은닉 의심률",   risk.offshore_fund_concealment_suspicion_rate],
          ].map(([label, val]) => {
            const pct = val != null ? Math.min(100, Number(val)) : 0;
            const tone = pct >= 60 ? "high" : pct >= 30 ? "mid" : "low";
            return `
              <div class="risk-bar-row">
                <span>${label}</span>
                <div class="risk-bar-track">
                  <i class="${tone}" style="width:${pct}%"></i>
                </div>
                <strong class="${tone === "high" ? "high" : tone === "mid" ? "mid-risk" : "good"}">${val != null ? Number(val).toFixed(1) : "-"}%</strong>
              </div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <div class="card">
      <h3>최근 수입신고 내역 (최대 10건)</h3>
      ${declarations.length ? `
        <table class="table">
          <thead><tr><th>신고번호</th><th>HS코드</th><th>품명</th><th>신고금액</th><th>원산지</th><th>수입일</th><th>상태</th></tr></thead>
          <tbody>${declarationRows}</tbody>
        </table>
      ` : `<p class="muted">수입신고 내역이 없습니다.</p>`}
    </div>
  `;
}

function canvasDataPanel(companyIdOverride, options = {}){
  // null/undefined 모두 안전하게 처리
  const resolvedCompanyId = companyIdOverride || activeCanvasCompanyId;
  const selectedLabel  = options.selectedLabel  || "선택 기업";
  const heading        = options.heading        || "기초자료 수집/등록";
  const description    = options.description    || "";
  const caseBadge      = options.caseBadge      || "";
  // options.subjectName 이 있으면 회사 조회 없이 그 값을 표시 (수사 대상 등)
  let subjectName;
  if(options.subjectName){
    subjectName = escapeHtml(options.subjectName);
  } else {
    const company = activeCanvasCompany(resolvedCompanyId);
    subjectName = `${escapeHtml(company.company_name)} (${escapeHtml(company.company_id)})`;
  }
  return `
    <section class="data-upload-board">
      <div class="canvas-selected-company">
        <span>${escapeHtml(selectedLabel)}</span>
        <strong>${subjectName}</strong>
        ${caseBadge ? `<em class="canvas-context-badge">${escapeHtml(caseBadge)}</em>` : ""}
      </div>
      <h3>${escapeHtml(heading)}</h3>
      ${description ? `<p class="muted" style="margin:-8px 0 14px">${escapeHtml(description)}</p>` : ""}
      <div class="upload-summary-grid">
        <button type="button" class="upload-drop-card">
          <strong>파일 업로드</strong>
          <span>PDF, XLS, DOCX, 이미지 문서</span>
        </button>
        <div class="upload-stat-card"><span>총 업로드 문서</span><strong>124</strong></div>
        <div class="upload-stat-card"><span>정상추출 자동승인</span><strong>80</strong></div>
        <div class="upload-stat-card warn"><span>검토필요 이상감지</span><strong>44</strong></div>
        <div class="upload-stat-card active"><span>AI 분석 진행중</span><strong>20</strong></div>
      </div>

      <div class="upload-table-wrap">
        <table class="upload-table">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="전체 선택"></th>
              <th>파일명</th>
              <th>파일유형</th>
              <th>추출데이터</th>
              <th>활용 AI 서비스</th>
              <th>AI검증결과</th>
              <th>진행상태</th>
            </tr>
          </thead>
          <tbody>
            ${uploadRow({
              file:"INV_HG_20260422.pdf",
              type:"세금계산서",
              extracted:["총액: USD ₩1,820,000","품명: ELECTRONIS XXX"],
              agents:["수입신고검증 agent","품목분류검증 agent"],
              result:"품명 불일치 확인",
              status:"처리완료",
              tone:"done"
            })}
            ${uploadRow({
              file:"계약서_HG_20260422.pdf",
              type:"계약서",
              extracted:["주계약: 에이비씨 테크","피계약: 지에프 글로벌","계약금: ₩2,000 만원"],
              agents:["수입신고검증 agent","과세가격평가 agent"],
              result:"가산요소(권리사용료) 신고이력 없음",
              status:"처리완료",
              tone:"done"
            })}
            ${uploadRow({
              file:"기업설명서.pdf",
              type:"분석중",
              extracted:["문서 요약 agent"],
              agents:["문서 요약 agent"],
              result:"-",
              status:"검토필요",
              tone:"review"
            })}
            ${uploadRow({
              file:"특허 권리 계약서.pdf",
              type:"분석중",
              extracted:["처리중"],
              agents:["수입신고검증 agent","특허정보조회 agent"],
              result:"처리중",
              status:"분석중",
              tone:"running"
            })}
            ${uploadRow({
              file:"개인조사자료.xls",
              type:"매출 관련 정보",
              extracted:["업체정보: 에이비씨 테크","우범자: 김관세","연관자: 김우범"],
              agents:["RAG생성 AI 서비스"],
              result:"처리중",
              status:"분석중",
              tone:"running"
            })}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function uploadRow({file,type,extracted,agents,result,status,tone}){
  return `
    <tr>
      <td><input type="checkbox" aria-label="${file} 선택"></td>
      <td class="upload-file">${file}</td>
      <td>${type}</td>
      <td>${extracted.map(item => `<span class="extract-pill">${item}</span>`).join("")}</td>
      <td>${agents.map(agent => `<strong class="agent-line">${agent}</strong>`).join("")}</td>
      <td>${result}</td>
      <td><span class="upload-status ${tone}">${status}</span></td>
    </tr>
  `;
}

function canvasReportPanel(){
  const company = activeCanvasCompany();
  return `
    <div class="canvas-report-wrap">
      <div class="canvas-selected-company">
        <span>선택 기업</span>
        <strong>${escapeHtml(company.company_name)} (${escapeHtml(company.company_id)})</strong>
      </div>
      <div class="scenario-results canvas-report-results">
        <section class="scenario-result-panel">
          <h3>분석 보고서</h3>
          <div id="scenarioReportOutput" class="markdown-output">${markdownToHtml(latestReport)}</div>
        </section>
        <section class="scenario-result-panel">
          <h3>보고서 검증</h3>
          <div id="scenarioValidationOutput" class="markdown-output">${markdownToHtml(latestValidation)}</div>
        </section>
      </div>
    </div>
  `;
}

function editingCardStepsHtml(){
  if(!templateEditorItems.length) return `<li class="template-empty-step">왼쪽에서 AI 서비스 단계를 선택 후 추가하세요.</li>`;
  const last = templateEditorItems.length - 1;
  return templateEditorItems.map((item, i) => `
    <li class="template-editable-step ${item.id === templateEditorSelectedId ? "selected" : ""}" data-teditor-id="${item.id}">
      <b>${i + 1}</b>
      <div class="template-editable-step-body">
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(sourceBehaviorLabels(item.key, item.behaviors).join(", "))}</small>
      </div>
      <div class="step-reorder-btns">
        <button type="button" class="step-move-btn" data-move-step="${item.id}" data-move-dir="up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="step-move-btn" data-move-step="${item.id}" data-move-dir="down" ${i === last ? "disabled" : ""}>↓</button>
      </div>
    </li>
  `).join("");
}

function templateCardHtml(template){
  const isCustom = !!template.isCustom;
  const isEditing = editingTemplateId === template.id;
  const editable = canEditTemplate(template);
  const deletable = canDeleteTemplate(template);
  const ownerLabel = templateOwnerLabel(template);
  const stepListHtml = isEditing
    ? `<ol class="template-step-list template-step-list-editable" id="templateEditorStepList">${editingCardStepsHtml()}</ol>`
    : `<ol class="template-step-list">${template.items.map((item, i) => `
        <li>
          <b>${i + 1}</b>
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <small>${escapeHtml(sourceBehaviorLabels(item.key, item.behaviors).join(", "))}</small>
          </div>
        </li>`).join("")}
      </ol>`;
  const stepCount = isEditing ? templateEditorItems.length : template.items.length;

  // Button states:
  // - 편집 중: 변경·삭제 모두 비활성
  // - 편집 중 아님: 변경·삭제 모두 활성 (빌트인 포함)
  const changeBtn = isEditing
    ? `<button class="btn secondary" type="button" disabled style="opacity:.4">템플릿 변경</button>`
    : `<button class="btn secondary" type="button" data-template-edit-btn="${escapeHtml(template.id)}">${editable ? "템플릿 변경" : "복사 후 변경"}</button>`;
  const deleteBtn = isEditing
    ? `<button class="btn secondary" type="button" disabled style="opacity:.4">템플릿 삭제</button>`
    : `<button class="btn secondary template-delete-action" type="button" data-delete-template="${escapeHtml(template.id)}" ${deletable ? "" : "disabled title=\"소유자 또는 관리자만 삭제할 수 있습니다.\""}>템플릿 삭제</button>`;

  return `
    <article class="template-card ${isEditing ? "template-card-editing" : ""}" data-template-card="${escapeHtml(template.id)}">
      <div class="template-card-head">
        <div>
          <h3>${escapeHtml(template.name)}</h3>
          <p>${escapeHtml(template.description || "")}</p>
          <em class="template-owner-badge">${escapeHtml(ownerLabel)}${editable ? " · 편집 가능" : " · 공유 읽기"}</em>
        </div>
        <span class="template-step-count">${stepCount}단계</span>
      </div>
      ${stepListHtml}
      <div class="template-card-actions">
        ${changeBtn}
        ${deleteBtn}
      </div>
    </article>
  `;
}

function editingTemplateName(){
  if(!editingTemplateId) return "";
  if(editingTemplateId === "__new__") return templateDraftName || "";
  const t = allScenarioTemplates().find(t => t.id === editingTemplateId);
  return t?.name || "";
}

function scenarioTemplatePanel(){
  const allTemplates = allScenarioTemplates();
  const editorName = editingTemplateName();
  const hasEditing = !!editingTemplateId;
  return `
    <div class="template-management-layout">
      <aside class="template-editor-panel">
        <div class="template-editor-header">분석 시나리오 템플릿 설정하기</div>
        <div class="template-editor-body">
          <label class="template-name-field">
            <span>템플릿 이름</span>
            <input id="templateNameInput" type="text" placeholder="템플릿 이름을 입력하세요" value="${escapeHtml(editorName)}" ${!hasEditing ? "disabled" : ""}>
          </label>
          <label class="scenario-field">
            <span>AI 서비스 단계</span>
            <select id="templateSourceSelect" ${!hasEditing ? "disabled" : ""}>${scenarioSourceOptionsHtml()}</select>
          </label>
          <div class="scenario-field">
            <span>동작 선택</span>
            <div id="templateBehaviorOptions" class="scenario-behavior-options"></div>
          </div>
          <div id="templateSourceHint" class="scenario-source-hint"></div>
          <label class="scenario-field">
            <span>추가 지시</span>
            <textarea id="templateInstruction" placeholder="${hasEditing ? "이 단계에서 중점적으로 확인할 내용을 입력하세요." : "템플릿을 선택하거나 새 템플릿을 만드세요."}" ${!hasEditing ? "disabled" : ""}></textarea>
          </label>
          <div class="scenario-actions">
            <button id="templateAddButton" type="button" class="btn" ${!hasEditing ? "disabled" : ""}>단계 추가</button>
            <button id="templateDeleteStepButton" type="button" class="btn secondary" ${!templateEditorSelectedId ? "disabled" : ""}>선택 삭제</button>
          </div>
          <button id="templateSaveButton" type="button" class="btn template-save-btn" ${!hasEditing ? "disabled" : ""}>분석 시나리오 템플릿 저장</button>
        </div>
      </aside>

      <div class="template-grid-area">
        <div class="template-grid-header">
          <div>
            <h2>분석 시나리오 템플릿</h2>
            <p class="muted">공통 조사 흐름을 관리하는 화면입니다. 기업별 실행 화면에서는 여기의 템플릿을 불러와 필요한 부분만 조정합니다.</p>
          </div>
          <button id="templateNewButton" type="button" class="btn secondary">새 템플릿</button>
        </div>
        <div class="template-card-grid">
          ${editingTemplateId === "__new__" ? `
            <article class="template-card template-card-editing" data-template-card="__new__">
              <div class="template-card-head">
                <div><h3>새 템플릿</h3><p>AI 서비스 단계를 추가하여 새 템플릿을 만드세요.</p></div>
                <span class="template-step-count">${templateEditorItems.length}단계</span>
              </div>
              <ol class="template-step-list template-step-list-editable" id="templateEditorStepList">
                ${editingCardStepsHtml()}
              </ol>
              <div class="template-card-actions">
                <button class="btn secondary" type="button" disabled style="opacity:.4">템플릿 변경</button>
                <button class="btn secondary template-delete-action" type="button" data-discard-new-template="true">템플릿 삭제</button>
              </div>
            </article>
          ` : ""}
          ${allTemplates.map(t => templateCardHtml(t)).join("")}
        </div>
      </div>
    </div>
  `;
}

function attachEditingStepListeners(){
  document.querySelectorAll(".template-editable-step[data-teditor-id]").forEach(step => {
    step.addEventListener("click", (e) => {
      if(e.target.closest(".step-move-btn")) return;
      templateEditorSelectedId = step.dataset.teditorId;
      document.querySelectorAll(".template-editable-step").forEach(s => s.classList.remove("selected"));
      step.classList.add("selected");
      syncTemplateEditorFields();
      const delBtn = document.getElementById("templateDeleteStepButton");
      if(delBtn) delBtn.disabled = false;
    });
  });
  document.querySelectorAll(".step-move-btn[data-move-step]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.moveStep;
      const dir = btn.dataset.moveDir;
      const idx = templateEditorItems.findIndex(i => i.id === id);
      if(idx < 0) return;
      if(dir === "up" && idx > 0){
        [templateEditorItems[idx - 1], templateEditorItems[idx]] = [templateEditorItems[idx], templateEditorItems[idx - 1]];
      } else if(dir === "down" && idx < templateEditorItems.length - 1){
        [templateEditorItems[idx], templateEditorItems[idx + 1]] = [templateEditorItems[idx + 1], templateEditorItems[idx]];
      }
      templateEditorItems.forEach((item, i) => { item.order = i + 1; });
      templateEditorSelectedId = id;
      refreshEditingCard();
    });
  });
}

function refreshEditingCard(){
  const list = document.getElementById("templateEditorStepList");
  if(!list) return;
  list.innerHTML = editingCardStepsHtml();
  attachEditingStepListeners();
  const badge = document.querySelector(".template-card-editing .template-step-count");
  if(badge) badge.textContent = `${templateEditorItems.length}단계`;
  const delBtn = document.getElementById("templateDeleteStepButton");
  if(delBtn) delBtn.disabled = !templateEditorSelectedId;
}

function syncTemplateEditorFields(){
  const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
  const src = document.getElementById("templateSourceSelect");
  const instr = document.getElementById("templateInstruction");
  const hint = document.getElementById("templateSourceHint");
  if(src && item) src.value = item.key;
  if(item) syncBehaviorOptions(item.key, item.behaviors || sourceDefaultBehaviors(item.key), "templateBehaviorOptions");
  if(!item) syncBehaviorOptions(src?.value || "db_cdw", null, "templateBehaviorOptions");
  if(instr) instr.value = item?.instruction || sourceDefaultInstruction(item?.key) || "";
  if(hint && item){
    const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
    const status = permissionStatus(item.key);
    hint.innerHTML = `
      <div class="hint-header">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="source-permission ${status}">${permissionLabel(status)}</span>
      </div>
      <span class="hint-behaviors">${escapeHtml(behaviors.join(", "))}</span>
      <p>${escapeHtml(sourceDefaultInstruction(item.key) || "이 단계의 추가 지시를 입력하세요.")}</p>
    `;
  }
  if(hint && !item) hint.innerHTML = "";
}

function initTemplateEditor(){
  const srcSel = document.getElementById("templateSourceSelect");
  if(!srcSel || templateEditorInitialized) return;
  templateEditorInitialized = true;

  syncBehaviorOptions(srcSel.value || "db_cdw", null, "templateBehaviorOptions");
  attachEditingStepListeners();
  syncTemplateEditorFields();

  document.getElementById("templateAddButton")?.addEventListener("click", () => {
    if(!editingTemplateId) return;
    const key = document.getElementById("templateSourceSelect").value;
    const source = scenarioSourceByKey(key);
    if(!source) return;
    const behaviors = selectedBehaviorValues("templateBehaviorOptions");
    const instruction = document.getElementById("templateInstruction").value.trim();
    const newItem = normalizeScenarioItem({
      id: uid(), key, type: source.type, label: source.label,
      behaviors: behaviors.length ? behaviors : sourceDefaultBehaviors(key),
      instruction: instruction || sourceDefaultInstruction(key) || "",
    }, templateEditorItems.length);
    templateEditorItems.push(newItem);
    templateEditorSelectedId = newItem.id;
    templateEditorItems.forEach((item, i) => { item.order = i + 1; });
    refreshEditingCard();
    syncTemplateEditorFields();
  });

  document.getElementById("templateDeleteStepButton")?.addEventListener("click", () => {
    if(!templateEditorSelectedId) return;
    templateEditorItems = templateEditorItems.filter(i => i.id !== templateEditorSelectedId);
    templateEditorItems.forEach((item, i) => { item.order = i + 1; });
    templateEditorSelectedId = templateEditorItems[0]?.id || null;
    refreshEditingCard();
    syncTemplateEditorFields();
  });

  document.getElementById("templateSourceSelect")?.addEventListener("change", event => {
    const key = event.target.value;
    syncBehaviorOptions(key, null, "templateBehaviorOptions");
    const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
    if(item){
      item.key = key;
      item.label = scenarioSourceByKey(key)?.label || key;
      item.type = scenarioSourceByKey(key)?.type || "db";
      refreshEditingCard();
    }
  });

  document.getElementById("templateInstruction")?.addEventListener("input", event => {
    const item = templateEditorItems.find(i => i.id === templateEditorSelectedId);
    if(item) item.instruction = event.target.value;
  });

  document.getElementById("templateSaveButton")?.addEventListener("click", () => {
    const nameInput = document.getElementById("templateNameInput");
    const name = nameInput?.value?.trim();
    if(!name){ nameInput?.focus(); alert("템플릿 이름을 입력해 주세요."); return; }
    if(!templateEditorItems.length){ alert("최소 한 단계 이상 추가해 주세요."); return; }
    const savedItems = templateEditorItems.map(i => ({...i, id: uid()}));
    const isExistingCustom = editingTemplateId && editingTemplateId !== "__new__"
      && customTemplates.some(t => t.id === editingTemplateId);
    const isBuiltin = editingTemplateId && editingTemplateId !== "__new__"
      && scenarioTemplates.some(t => t.id === editingTemplateId);
    if(isExistingCustom){
      const idx = customTemplates.findIndex(t => t.id === editingTemplateId);
      customTemplates[idx] = { ...customTemplates[idx], name, description:`${templateEditorItems.length}단계 · 수정됨`, items: savedItems, isCustom: true };
    } else if(isBuiltin){
      // Update the built-in card in-place via override (no new card created)
      builtinOverrides[editingTemplateId] = { name, description:`${templateEditorItems.length}단계 · 수정됨`, items: savedItems };
    } else {
      // __new__ → create new custom card
      const newId = `custom-${uid()}`;
      customTemplates.unshift({ id: newId, name, description:`${templateEditorItems.length}단계`, items: savedItems, isCustom: true, ownerUserId: currentUserId, ownerName: currentUser().name, shared: true });
      editingTemplateId = newId;
    }
    templateDraftName = "";
    saveCanvasState();
    templateEditorInitialized = false;
    render("canvas");
    alert(`"${name}" 템플릿이 저장되었습니다.`);
  });

  document.getElementById("templateNewButton")?.addEventListener("click", () => {
    editingTemplateId = "__new__";
    templateDraftName = "";
    templateEditorItems = [];
    templateEditorSelectedId = null;
    templateEditorInitialized = false;
    render("canvas");
  });
}

function scenarioWorkbenchV2(){
  const company = activeCanvasCompany();
  const archived = isCompanyArchived(company.company_id);
  return `
    <section class="card scenario-workbench scenario-workbench-v2">
      <div class="scenario-title-row">
        <div>
          <h3>${escapeHtml(company.company_name)} 분석 시나리오 설정 및 실행</h3>
          <p class="muted">템플릿을 불러온 뒤 기업별 조사 목적에 맞게 단계, 동작, 추가 지시를 조정합니다. <em style="color:#0369a1;font-style:normal;font-weight:700">${archived ? "아카이브된 작업은 복원 후 다시 분석할 수 있습니다." : "아카이브 전에는 언제든지 시나리오를 수정하고 재실행할 수 있습니다."}</em></p>
        </div>
        <div class="scenario-status">
          <span id="scenarioRunStatus">대기</span>
          <strong id="scenarioDoneCount">0/0</strong>
        </div>
      </div>
      <div class="scenario-layout scenario-execution-layout">
        <section class="scenario-board">
          <div class="scenario-board-head">
            <h3>조사 시나리오</h3>
          </div>
          <ol id="scenarioList" class="scenario-list scenario-list-vertical"></ol>
          <div class="scenario-progress">
            <i id="scenarioProgressFill"></i>
          </div>
        </section>

        <aside class="scenario-config">
          <div class="scenario-config-title">
            <strong>분석 시나리오 설정</strong>
          </div>

          <div class="scenario-template-zone">
            <div class="scenario-template-zone-head">
              <span>분석 시나리오 템플릿</span>
              <button id="scenarioTemplateApplyButton" type="button" class="btn scenario-template-apply-btn" ${archived ? "disabled" : ""}>템플릿 적용하기</button>
            </div>
            <select id="scenarioTemplateSelect" class="scenario-template-select">${scenarioTemplateOptionsHtml()}</select>
          </div>

          <div class="scenario-agent-zone">
            <label class="scenario-field">
              <span>AI 서비스 단계</span>
              <select id="scenarioSourceSelect"></select>
            </label>
            <div class="scenario-field">
              <span>동작 선택</span>
              <div id="scenarioBehaviorOptions" class="scenario-behavior-options"></div>
            </div>
            <div id="scenarioSourceHint" class="scenario-source-hint"></div>
            <label class="scenario-field">
              <span>추가 지시</span>
              <textarea id="scenarioInstruction" placeholder="이 단계에서 중점적으로 확인할 내용을 입력하세요."></textarea>
            </label>
          </div>

          <div class="scenario-actions">
            <button id="scenarioAddButton" type="button" class="btn" ${archived ? "disabled" : ""}>단계 추가</button>
            <button id="scenarioDeleteButton" type="button" class="btn secondary" disabled>선택 삭제</button>
          </div>
          <button id="scenarioSaveButton" type="button" class="btn secondary scenario-save-bottom">신규 템플릿으로 등록</button>
        </aside>

        <section class="scenario-log">
          <div class="scenario-log-head">
            <h3>분석 실행 로그</h3>
            <div class="scenario-log-actions">
              <button id="scenarioRunButton" type="button" class="btn" ${archived ? "disabled" : ""}>분석 실행</button>
              <button id="scenarioClearButton" type="button" class="btn secondary" ${archived ? "disabled" : ""}>결과 지우기</button>
            </div>
          </div>
          <div id="scenarioStepAccordion" class="scenario-step-accordion"></div>
        </section>
      </div>
    </section>
  `;
}


function uid(){
  if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function inlineMarkdown(value){
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`(.+?)`/g,"<code>$1</code>");
}

function markdownToHtml(value){
  const lines = String(value ?? "").replace(/\r\n/g,"\n").split("\n");
  const html = [];
  let listOpen = false;
  let listType = "";
  const closeList = () => {
    if(listOpen){
      html.push(`</${listType}>`);
      listOpen = false;
      listType = "";
    }
  };
  const openList = (type) => {
    if(listOpen && listType !== type) closeList();
    if(!listOpen){
      html.push(`<${type}>`);
      listOpen = true;
      listType = type;
    }
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if(!trimmed){ closeList(); return; }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if(heading){
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if(bullet){
      openList("ul");
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      return;
    }
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if(numbered){
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

function setMarkdown(target, value){
  if(target) target.innerHTML = markdownToHtml(value);
}

// ── 기업 위험도 대시보드 (공통 콘텐츠 함수) ─────────────────────────

/* riskDashboardContent() — 순수 내용만 반환. 어디서든 재사용 가능.
   - 메인 '기업 위험도 대시보드' 전용 페이지: riskDashboard() 가 section.card 래퍼로 감쌈
   - 관세조사분석 탭 내 embedded: investigationDashboardPanel() 이 직접 호출             */
function riskDashboardContent(){
  if(!scenarioCompanies.length){
    return `
      <div class="risk-dashboard">
        <div class="risk-dash-header">
          <div>
            <h2>분석대상 업체 위험도 모니터링</h2>
            <p class="muted">담당자가 관리하는 전체 기업의 위험도 현황을 실시간으로 모니터링합니다.</p>
          </div>
        </div>
        <div class="profile-loading">위험도 데이터 로딩 중...</div>
      </div>`;
  }

  const companies = scenarioCompanies;
  const total = companies.length;
  const needReview = companies.filter(c => c.risk_level === "HIGH").length;
  const nearAudit  = companies.filter(c => (c.risk_score||0) >= 75).length;

  const cnt = (field, thr) => companies.filter(c => (c[field]||0) > thr).length;
  const alertCounts = {
    underval : cnt("undervaluation_suspicion_rate", 50) * 3 + cnt("undervaluation_suspicion_rate", 30),
    hs       : cnt("hs_classification_error_rate", 40) * 5 + cnt("hs_classification_error_rate", 20) * 2,
    royalty  : cnt("related_party_anomaly_rate", 50) * 3 + cnt("related_party_anomaly_rate", 30),
    forex    : cnt("offshore_fund_concealment_suspicion_rate", 50) * 2,
    refund   : cnt("customs_refund_anomaly_rate", 40) * 3 + cnt("customs_refund_anomaly_rate", 20),
  };

  const q = riskDashboardFilter.query.toLowerCase();
  const minS = riskDashboardFilter.minScore;
  const filtered = companies.filter(c => {
    if(q && !((c.company_name||"").toLowerCase().includes(q) || (c.company_id||"").includes(q))) return false;
    if(minS && (c.risk_score||0) < minS) return false;
    return true;
  });

  return `
    <div class="risk-dashboard">
      <div class="risk-dash-header">
        <div>
          <h2>분석대상 업체 위험도 모니터링</h2>
          <p class="muted">담당자가 관리하는 전체 기업의 위험도 현황을 실시간으로 모니터링합니다.</p>
        </div>
        <div class="risk-kpi-strip">
          <div class="risk-kpi-item">
            <span>총 관리대상 업체</span>
            <strong>${total.toLocaleString()} 개사</strong>
          </div>
          <div class="risk-kpi-item">
            <span>심사필요</span>
            <strong>${needReview} 개사</strong>
          </div>
          <div class="risk-kpi-item">
            <span>조사 임박</span>
            <strong>${nearAudit} 개사</strong>
          </div>
        </div>
      </div>

      <div class="ci-dw-bar">
        <strong>DW 조회</strong>
        <input id="ciDwQuery" class="ci-dw-input" placeholder="자연어로 DW 조건을 입력하세요 (예: 최근 1년 수입금액 10억 이상 · HS 8471 · 저가신고 의심업체)">
        <button class="btn ci-dw-run" type="button" onclick="ciRunDwQuery()">조회 실행</button>
      </div>
      <div class="ci-dw-result" id="ciDwResult" style="display:none"></div>

      <div class="risk-alert-strip">
        ${riskAlertCard("신고가격오류 의심", alertCounts.underval)}
        ${riskAlertCard("품목분류 위장 의심", alertCounts.hs)}
        ${riskAlertCard("권리사용료 미신고", alertCounts.royalty)}
        ${riskAlertCard("외환 송금액 불일치", alertCounts.forex)}
        ${riskAlertCard("환급금액 오신청 의심", alertCounts.refund)}
      </div>

      <div class="risk-dash-filter">
        <h3>검색조건</h3>
        <input id="riskFilterQuery" class="risk-filter-input"
          placeholder="업체명, 사업자번호, 대표자... 검색"
          value="${escapeHtml(riskDashboardFilter.query)}">
        <select id="riskFilterScore" class="risk-filter-select">
          <option value="0"  ${minS===0  ? "selected":""}>스코어: 전체</option>
          <option value="80" ${minS===80 ? "selected":""}>스코어: 80점 이상만</option>
          <option value="60" ${minS===60 ? "selected":""}>스코어: 60점 이상만</option>
          <option value="40" ${minS===40 ? "selected":""}>스코어: 40점 이상만</option>
        </select>
      </div>

      <div class="risk-company-grid" id="riskCompanyGrid">
        ${filtered.map(riskCompanyCard).join("") || '<div class="empty-state">검색 조건에 맞는 기업이 없습니다.</div>'}
      </div>
    </div>`;
}

/* 메인 '기업 위험도 대시보드' 전용 페이지 — section.card 래퍼만 추가 */
function riskDashboard(){
  return `<section class="card" style="padding:0;overflow:visible">${riskDashboardContent()}</section>`;
}

function riskAlertCard(label, count){
  return `
    <div class="risk-alert-item">
      <span>${label}</span>
      <strong>${count} <small>건</small></strong>
    </div>`;
}

/* 공통 위험도 카드 — investigation 대시보드 / profile 페이지 동일 사용 */
function riskCompanyCard(c){ return sharedRiskCard(c); }

function sharedRiskCard(c){
  const score = c.risk_score || 0;
  const level = c.risk_level || "LOW";
  const cls   = level === "HIGH" ? "danger" : level === "MEDIUM" ? "warn" : "safe";
  const tags  = companyRiskTags(c);
  const visibleTags = tags.slice(0,2).map(t => `<span class="risk-tag">${escapeHtml(t)}</span>`).join("");
  const moreTags = tags.length > 2 ? `<span class="risk-tag more">+${tags.length-2}개</span>` : "";
  const scoreClass = level === "HIGH" ? "high" : level === "LOW" ? "good" : "";
  const cardId = `#TRG-26-${escapeHtml(c.company_id.replace("C-",""))}`;
  return `
    <div class="risk-company-card ${cls}">
      <div class="ci-card-top-row">
        <div class="ci-card-name-head">
          <strong class="ci-card-name">${escapeHtml(c.company_name || c.company_id)}</strong>
          <span class="muted ci-card-id">${cardId}</span>
        </div>
        <button class="btn ci-card-select-btn ${cls}" data-investigation-select="${escapeHtml(c.company_id)}">조사대상 선정</button>
      </div>
      <span class="muted ci-card-industry">${escapeHtml(industryLabel(c.industry_code))}</span>
      <div class="risk-card-scores">
        <div><span class="muted">위험도점수</span><strong class="${scoreClass}">${score.toFixed(1)}</strong></div>
        <div><span class="muted">주요 위험</span><div class="risk-card-tags">${visibleTags}${moreTags}</div></div>
      </div>
      <div class="risk-card-review">
        <p>${companyReviewText(c)}</p>
      </div>
    </div>`;
}

function companyRiskTags(c){
  const tags = [];
  if((c.undervaluation_suspicion_rate||0) >= 50)              tags.push("#단기저가신고");
  if((c.offshore_fund_concealment_suspicion_rate||0) >= 50)   tags.push("#외환거래불일치");
  if((c.related_party_anomaly_rate||0) >= 50)                 tags.push("#특수관계거래");
  if((c.hs_classification_error_rate||0) >= 40)               tags.push("#품목분류오류");
  if((c.customs_refund_anomaly_rate||0) >= 50)                tags.push("#환급오신청");
  if((c.fta_origin_misuse_suspicion_rate||0) >= 50)           tags.push("#FTA원산지");
  return tags;
}

function companyReviewText(c){
  const u = c.undervaluation_suspicion_rate || 0;
  const r = c.related_party_anomaly_rate   || 0;
  const h = c.hs_classification_error_rate  || 0;
  const f = c.fta_origin_misuse_suspicion_rate || 0;
  if(u >= 60) return `전일 수입신고 ${Math.ceil(u/30)}건이 업계평균 대비 ${Math.round(u/3)}% 낮게 신고됨(이전가격 조작의심)`;
  if(r >= 60) return `특수관계자 거래 비중이 높아 로열티 미신고 가능성이 확인됩니다.`;
  if(f >= 60) return `FTA 원산지 서류 오류가 다수 발견되어 추가 검토가 필요합니다.`;
  if(h >= 50) return `가격신고 오류가 확인되나, 오타일 가능성이 높아 보입니다.`;
  if(u >= 35) return `수입신고 ${Math.ceil(u/25)}건이 업계평균 대비 ${Math.round(u/3)}% 낮게 신고됨`;
  return `수입신고 데이터 검토 결과 경미한 이상 징후가 있어 모니터링이 권장됩니다.`;
}

function industryLabel(code){
  const map = { G46:"도매 및 상품중개업", G47:"소매업", C20:"화학물질", C13:"섬유 제조", C21:"의약품", C26:"전자부품", C30:"자동차" };
  return map[code] || code || "기타";
}

function initGenInvSearch(){
  const input = document.getElementById("giSearchInput");
  if(!input) return;
  input.addEventListener("input", () => {
    genInvFilter = input.value;
    const board = document.querySelector(".gi-case-board");
    if(!board) return;
    const q = genInvFilter.toLowerCase();
    const all = allGenInvCases();
    const filtered = q ? all.filter(c =>
      c.targetName.toLowerCase().includes(q) ||
      c.caseId.toLowerCase().includes(q) ||
      genInvTypeById(c.invTypeId).label.includes(q)
    ) : all;
    board.innerHTML = filtered.map(genInvCaseCard).join("") ||
      `<div class="empty-state">검색 결과가 없습니다.</div>`;
  });
}

function initRiskDashboard(){
  const queryInput = document.getElementById("riskFilterQuery");
  const scoreSelect = document.getElementById("riskFilterScore");
  if(!queryInput) return;

  queryInput.addEventListener("input", () => {
    riskDashboardFilter.query = queryInput.value;
    const q = riskDashboardFilter.query.toLowerCase();
    const minS = riskDashboardFilter.minScore;
    const filtered = scenarioCompanies.filter(c => {
      if(q && !((c.company_name||"").toLowerCase().includes(q) || (c.company_id||"").includes(q))) return false;
      if(minS && (c.risk_score||0) < minS) return false;
      return true;
    });
    const grid = document.getElementById("riskCompanyGrid");
    if(grid){
      const cardFn = currentPage === "investigation" ? ciCompanyCard : riskCompanyCard;
      grid.innerHTML = filtered.map(cardFn).join("") || '<div class="empty-state">검색 조건에 맞는 기업이 없습니다.</div>';
    }
  });

  scoreSelect.addEventListener("change", () => {
    riskDashboardFilter.minScore = parseInt(scoreSelect.value, 10);
    if(currentPage === "investigation") render("investigation");
    else render("profile");
  });
}

// ── 시나리오 워크벤치 ─────────────────────────────────────────────────


function normalizeScenarioOrder(){
  scenarioItems = scenarioItems.map((item,index)=>({...item, order:index+1}));
}

function selectedScenarioItem(){
  return scenarioItems.find(item=>item.id === selectedScenarioId) || null;
}

function behaviorOptionsHtml(key, selectedValues = null){
  const selected = Array.isArray(selectedValues) && selectedValues.length ? selectedValues : sourceDefaultBehaviors(key);
  return sourceBehaviorOptions(key)
    .map(option => `
      <label class="scenario-behavior-check">
        <input type="checkbox" value="${escapeHtml(option.value)}" ${selected.includes(option.value) ? "checked" : ""}>
        <span>${escapeHtml(option.label)}</span>
      </label>
    `)
    .join("");
}

function syncBehaviorOptions(key, selectedValues = null, boxId = "scenarioBehaviorOptions"){
  const behaviorBox = document.getElementById(boxId);
  if(!behaviorBox) return;
  behaviorBox.innerHTML = behaviorOptionsHtml(key, selectedValues);
  if(boxId === "scenarioBehaviorOptions"){
    behaviorBox.querySelectorAll("input").forEach(input => {
      input.addEventListener("change", () => updateSelectedScenarioBehaviors());
    });
  }
}

function selectedBehaviorValues(boxId = "scenarioBehaviorOptions"){
  return Array.from(document.querySelectorAll(`#${boxId} input:checked`))
    .map(input => input.value);
}

function scenarioRunInstruction(item){
  const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
  const instruction = item.instruction || sourceDefaultInstruction(item.key, item.target_type || item.targetType || "company") || "기본 분석";
  return `[동작 선택]\n- ${behaviors.join("\n- ")}\n\n${instruction}`;
}

function scenarioInstructionPreview(item){
  const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
  const instruction = item.instruction || sourceDefaultInstruction(item.key, item.target_type || item.targetType || "company") || "기본 분석";
  return `${behaviors.join(", ")} · ${instruction}`;
}

function initScenarioWorkbench(){
  const sourceSelect = document.getElementById("scenarioSourceSelect");
  const instruction = document.getElementById("scenarioInstruction");
  const templateSelect = document.getElementById("scenarioTemplateSelect");
  if(!sourceSelect) return;

  sourceSelect.innerHTML = scenarioSourceOptionsHtml();

  // Only reload scenario data when company changes; preserve stepOutputs/stepStatuses otherwise
  if(scenarioLoadedForCompany !== activeCanvasCompanyId){
    scenarioLoadedForCompany = activeCanvasCompanyId;
    const archive = canvasRunArchives[activeCanvasCompanyId];
    scenarioItems = getCompanyScenario(activeCanvasCompanyId);
    if(archive){
      stepOutputs = {...(archive.stepOutputs || {})};
      stepStatuses = {...(archive.stepStatuses || {})};
      latestReport = archive.latestReport || "보고서가 아직 생성되지 않았습니다.";
      latestValidation = archive.latestValidation || "검증 결과가 아직 없습니다.";
    }else{
      stepOutputs = {};
      stepStatuses = {};
      latestReport = "보고서가 아직 생성되지 않았습니다.";
      latestValidation = "검증 결과가 아직 없습니다.";
    }
    selectedScenarioId = scenarioItems[0]?.id || null;
  }

  if(scenarioInitialized) return;
  scenarioInitialized = true;

  document.getElementById("scenarioAddButton").addEventListener("click", addScenarioItem);
  document.getElementById("scenarioDeleteButton").addEventListener("click", deleteSelectedScenario);
  document.getElementById("scenarioRunButton").addEventListener("click", runScenarioWorkflow);
  document.getElementById("scenarioClearButton").addEventListener("click", clearScenarioResults);
  document.getElementById("scenarioTemplateApplyButton")?.addEventListener("click", applySelectedScenarioTemplate);
  document.getElementById("scenarioSaveButton")?.addEventListener("click", () => {
    const defaultName = `${activeCanvasCompany()?.company_name || "기업"} 분석 템플릿`;
    const name = prompt("저장할 템플릿 이름을 입력하세요:", defaultName);
    if(!name?.trim()) return;
    const newTemplate = {
      id: `custom-${uid()}`,
      name: name.trim(),
      description: `${new Date().toLocaleDateString("ko-KR")} 저장 · ${scenarioItems.length}단계`,
      items: scenarioItems.map(item => ({...item, id: uid()})),
      isCustom: true,
      ownerUserId: currentUserId,
      ownerName: currentUser().name,
      shared: true,
    };
    customTemplates.unshift(newTemplate);
    saveCanvasState();
    const templateSelect = document.getElementById("scenarioTemplateSelect");
    if(templateSelect){
      const selected = templateSelect.value;
      templateSelect.innerHTML = scenarioTemplateOptionsHtml();
      templateSelect.value = selected;
    }
    setScenarioStatus("템플릿 저장됨");
  });
  sourceSelect.addEventListener("change", event => updateSelectedScenarioSource(event.target.value));
  instruction.addEventListener("input", event => updateSelectedScenarioInstruction(event.target.value));
  if(templateSelect) templateSelect.value = activeScenarioTemplateId;

  syncScenarioEditor();
  renderScenarioList();
  renderScenarioSteps();
}

function syncScenarioEditor(){
  const item = selectedScenarioItem();
  const sourceSelect = document.getElementById("scenarioSourceSelect");
  const instruction = document.getElementById("scenarioInstruction");
  const hint = document.getElementById("scenarioSourceHint");
  const deleteButton = document.getElementById("scenarioDeleteButton");
  if(sourceSelect && item) sourceSelect.value = item.key;
  if(item) syncBehaviorOptions(item.key, item.behaviors || sourceDefaultBehaviors(item.key));
  if(!item) syncBehaviorOptions("db_cdw", []);
  if(instruction) instruction.value = item?.instruction || sourceDefaultInstruction(item?.key) || "";
  if(hint && item){
    const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
    const status = permissionStatus(item.key);
    const needsPermission = status === "locked" || status === "requested";
    hint.innerHTML = `
      <div class="hint-header">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="source-permission ${status}">${permissionLabel(status)}</span>
      </div>
      <span class="hint-behaviors">${escapeHtml(behaviors.join(", "))}</span>
      ${needsPermission ? `
        <div class="hint-permission-callout">
          <span>${status === "requested" ? "권한 요청이 접수되었습니다. 승인 대기 중입니다." : "이 단계를 실행하려면 추가 권한이 필요합니다."}</span>
          ${status === "locked" ? `<button type="button" class="btn-perm-request" data-permission-request="${escapeHtml(item.key)}">권한 요청</button>` : ""}
        </div>
      ` : `<p>${escapeHtml(sourceDefaultInstruction(item.key) || "이 단계의 추가 지시를 입력하세요.")}</p>`}
    `;
  }
  if(hint && !item) hint.innerHTML = "";
  if(deleteButton) deleteButton.disabled = !item;
}

function addScenarioItem(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  const sourceSelect = document.getElementById("scenarioSourceSelect");
  const instruction = document.getElementById("scenarioInstruction");
  const key = sourceSelect.value;
  const source = scenarioSourceByKey(key);
  if(!source) return;
  const behaviors = selectedBehaviorValues();
  const item = {
    id: uid(),
    key,
    type: source.type,
    label: source.label,
    behaviors: behaviors.length ? behaviors : sourceDefaultBehaviors(key),
    order: scenarioItems.length + 1,
    instruction: instruction.value.trim() || sourceDefaultInstruction(key),
  };
  item.behavior = item.behaviors[0];
  item.behaviorLabel = sourceBehaviorLabels(key, item.behaviors).join(", ");
  scenarioItems.push(item);
  selectedScenarioId = item.id;
  openedSteps.add(item.id);
  instruction.value = sourceDefaultInstruction(key);
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
  syncScenarioEditor();
}

function deleteSelectedScenario(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  if(!selectedScenarioId) return;
  if(expandedResultStepId === selectedScenarioId) expandedResultStepId = null;
  scenarioItems = scenarioItems.filter(item => item.id !== selectedScenarioId);
  delete stepOutputs[selectedScenarioId];
  delete stepStatuses[selectedScenarioId];
  openedSteps.delete(selectedScenarioId);
  selectedScenarioId = scenarioItems[0]?.id || null;
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
  syncScenarioEditor();
}

function applySelectedScenarioTemplate(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  const templateSelect = document.getElementById("scenarioTemplateSelect");
  const templateId = templateSelect?.value || "customs-basic";
  activeScenarioTemplateId = templateId;
  scenarioItems = cloneTemplateItems(templateId);
  selectedScenarioId = scenarioItems[0]?.id || null;
  stepOutputs = {};
  stepStatuses = {};
  openedSteps = new Set();
  expandedResultStepId = null;
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
  syncScenarioEditor();
  updateScenarioProgress(0);
  setScenarioStatus("템플릿 적용됨");
}

function updateSelectedScenarioInstruction(value){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  if(!item) return;
  item.instruction = value;
  saveCompanyScenario();
  renderScenarioList();
}

function updateSelectedScenarioBehaviors(){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  if(!item) return;
  const values = selectedBehaviorValues();
  if(!values.length){
    syncBehaviorOptions(item.key, item.behaviors || sourceDefaultBehaviors(item.key));
    alert("동작은 최소 하나 이상 선택해야 합니다.");
    return;
  }
  item.behaviors = values;
  item.behavior = values[0];
  item.behaviorLabel = sourceBehaviorLabels(item.key, values).join(", ");
  saveCompanyScenario();
  renderScenarioList();
  syncScenarioEditor();
}

function updateSelectedScenarioSource(key){
  if(isCompanyArchived()) return;
  const item = selectedScenarioItem();
  const source = scenarioSourceByKey(key);
  if(!item || !source) return;
  item.key = key;
  item.type = source.type;
  item.label = source.label;
  item.behaviors = sourceDefaultBehaviors(key);
  item.behavior = item.behaviors[0];
  item.behaviorLabel = sourceBehaviorLabels(key, item.behaviors).join(", ");
  item.instruction = sourceDefaultInstruction(key);
  saveCompanyScenario();
  renderScenarioList();
  syncScenarioEditor();
}

function renderScenarioList(){
  const target = document.getElementById("scenarioList");
  if(!target) return;
  normalizeScenarioOrder();
  target.innerHTML = scenarioItems.map(item => {
    const status = permissionStatus(item.key);
    const locked = status !== "granted";
    return `
    <li class="scenario-chip ${item.type} ${item.id === selectedScenarioId ? "active" : ""} ${locked ? `needs-permission ${status}` : ""}" data-scenario-id="${item.id}" draggable="true">
      <div class="chip-num">${item.order}</div>
      <div class="chip-body">
        <div class="chip-title-row">
          <strong>${escapeHtml(item.label)}</strong>
          ${locked ? `<em>${permissionLabel(status)}</em>` : ""}
        </div>
        <p>${escapeHtml(scenarioInstructionPreview(item))}</p>
      </div>
    </li>
  `;
  }).join("");

  target.querySelectorAll(".scenario-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      selectedScenarioId = chip.dataset.scenarioId;
      renderScenarioList();
      syncScenarioEditor();
    });
    chip.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", chip.dataset.scenarioId));
    chip.addEventListener("dragover", event => event.preventDefault());
    chip.addEventListener("drop", event => {
      event.preventDefault();
      moveScenarioItem(event.dataTransfer.getData("text/plain"), chip.dataset.scenarioId);
    });
  });

  updateScenarioProgress();
}

function moveScenarioItem(dragId, targetId){
  if(!dragId || !targetId || dragId === targetId) return;
  const from = scenarioItems.findIndex(item => item.id === dragId);
  const to = scenarioItems.findIndex(item => item.id === targetId);
  if(from < 0 || to < 0) return;
  const [moved] = scenarioItems.splice(from,1);
  scenarioItems.splice(to,0,moved);
  saveCompanyScenario();
  renderScenarioList();
  renderScenarioSteps();
}

function renderScenarioSteps(){
  const target = document.getElementById("scenarioStepAccordion");
  if(!target) return;
  const fullMode = Boolean(expandedResultStepId);
  target.classList.toggle("result-full-active", fullMode);
  target.closest(".scenario-log")?.classList.toggle("result-full-active", fullMode);
  target.closest(".scenario-workbench-v2")?.classList.toggle("result-full-active", fullMode);
  target.closest(".canvas-hub")?.classList.toggle("result-full-active", fullMode);
  if(!scenarioItems.length){
    target.innerHTML = `<div class="empty-state">아직 등록된 분석 단계가 없습니다.</div>`;
    return;
  }
  normalizeScenarioOrder();
  target.innerHTML = scenarioItems.map(item => {
    const open = openedSteps.has(item.id);
    const full = expandedResultStepId === item.id;
    const hasOutput = Boolean(stepOutputs[item.id]);
    const status = stepStatuses[item.id] || "대기";
    const output = stepOutputs[item.id] || "아직 실행 결과가 없습니다.";
    return `
      <section class="scenario-step ${item.type} ${open ? "open" : ""} ${full ? "result-full" : ""}">
        <div class="scenario-step-head">
          <button type="button" class="scenario-step-toggle" data-step-id="${item.id}">
            <span>${escapeHtml(item.label)}</span>
            <em>${escapeHtml(status)}</em>
            <i>›</i>
          </button>
          <button type="button" class="scenario-step-full" data-full-step-id="${item.id}" ${hasOutput ? "" : "disabled"}>
            ${full ? "전체결과 닫기" : "전체결과보기"}
          </button>
        </div>
        <div class="scenario-step-body markdown-output">${markdownToHtml(output)}</div>
      </section>
    `;
  }).join("");

  target.querySelectorAll(".scenario-step-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.stepId;
      if(openedSteps.has(id)) openedSteps.delete(id);
      else openedSteps.add(id);
      renderScenarioSteps();
    });
  });
  target.querySelectorAll(".scenario-step-full").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const id = button.dataset.fullStepId;
      if(button.disabled) return;
      if(expandedResultStepId === id){
        expandedResultStepId = null;
      }else{
        expandedResultStepId = id;
        openedSteps.add(id);
      }
      renderScenarioSteps();
    });
  });
}

function scenarioPayload(items = scenarioItems){
  const hasKey = key => items.some(item => item.key === key);
  const hasSourceType = type => items.some(item => item.type === type);
  const hasRag = items.some(item => item.type.startsWith("rag_"));
  const runItems = items.map(item => ({
    ...item,
    target_type: "company",
    targetType: "company",
    targetSupport: scenarioSourceByKey(item.key)?.supports || { company:true, person:true },
    behaviors: Array.isArray(item.behaviors) && item.behaviors.length ? item.behaviors : sourceDefaultBehaviors(item.key),
    behavior: (Array.isArray(item.behaviors) && item.behaviors.length ? item.behaviors : sourceDefaultBehaviors(item.key))[0],
    behaviorLabel: sourceBehaviorLabels(item.key, item.behaviors).join(", "),
    instruction: scenarioRunInstruction(item),
  }));
  return {
    scenario_items: runItems,
    target_type: "company",
    targetType: "company",
    db_query: hasSourceType("db"),
    rag_enabled: hasRag,
    rag_customs_public: hasKey("rag_customs"),
    rag_trade: hasKey("rag_trade"),
    rag_audit: hasKey("rag_audit"),
    rag_investigation: hasKey("rag_investigation"),
    rag_global: hasKey("rag_global"),
    rag_consultation: hasKey("rag_consultation"),
    rag_risk_select: hasKey("rag_risk_select"),
    bigdata_enabled: hasSourceType("bigdata"),
    bigdata_trade_stats: hasKey("bigdata_trade"),
    bigdata_hs_stats: hasKey("bigdata_hs"),
    web_enabled: hasSourceType("web"),
    report_enabled: hasSourceType("report"),
    validation_enabled: hasSourceType("validation"),
  };
}

function updateScenarioProgress(done = null){
  const total = scenarioItems.length;
  const completed = done ?? Object.values(stepStatuses).filter(status => status === "완료").length;
  const count = document.getElementById("scenarioDoneCount");
  const fill = document.getElementById("scenarioProgressFill");
  if(count) count.textContent = `${completed}/${total}`;
  if(fill) fill.style.width = total ? `${(completed / total) * 100}%` : "0";
}

function setScenarioStatus(text){
  const target = document.getElementById("scenarioRunStatus");
  if(target) target.textContent = text;
}

function clearScenarioResults(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 수정할 수 있습니다.");
    return;
  }
  stepOutputs = {};
  stepStatuses = {};
  openedSteps = new Set();
  expandedResultStepId = null;
  latestReport = "보고서가 아직 생성되지 않았습니다.";
  latestValidation = "검증 결과가 아직 없습니다.";
  updateCanvasJobStatus(activeCanvasCompanyId, { label:"대기", done:0, total:scenarioItems.length || 5, pct:0, tone:"wait" });
  setMarkdown(document.getElementById("scenarioReportOutput"), "보고서가 아직 생성되지 않았습니다.");
  setMarkdown(document.getElementById("scenarioValidationOutput"), "검증 결과가 아직 없습니다.");
  setScenarioStatus("대기");
  updateScenarioProgress(0);
  renderScenarioSteps();
  saveIntermediateResults(activeCanvasCompanyId);
}

function runScenarioWorkflow(){
  if(isCompanyArchived()){
    alert("아카이브된 작업은 복원 후 분석할 수 있습니다.");
    return;
  }
  if(!scenarioItems.length){
    alert("분석 시나리오 단계를 먼저 추가하세요.");
    return;
  }
  const companyId = activeCanvasCompanyId;
  if(!companyId){
    alert("분석 대상 기업을 선택하세요.");
    return;
  }
  // 첫 번째 권한 없는 단계 찾기 → 그 이전 단계까지만 실행
  const firstLockedIndex = scenarioItems.findIndex(item => !hasPermission(item.key));
  const runnableItems = firstLockedIndex >= 0 ? scenarioItems.slice(0, firstLockedIndex) : scenarioItems;
  const skippedItems  = firstLockedIndex >= 0 ? scenarioItems.slice(firstLockedIndex) : [];

  if(!runnableItems.length){
    alert("실행 가능한 단계가 없습니다.\n첫 번째 단계에 권한이 없어 실행할 수 없습니다.\n권한 요청 후 승인되면 실행할 수 있습니다.");
    return;
  }

  if(scenarioEventSource) scenarioEventSource.close();
  stepOutputs = {};
  stepStatuses = {};
  openedSteps = new Set();
  expandedResultStepId = null;

  // 권한 없는 단계는 미리 "건너뜀"으로 표시
  skippedItems.forEach(item => {
    stepStatuses[item.id] = "건너뜀";
    stepOutputs[item.id] = `권한이 없어 실행되지 않았습니다. (${permissionLabel(permissionStatus(item.key))})`;
  });

  let completed = 0;
  const runButton = document.getElementById("scenarioRunButton");
  runButton.disabled = true;
  setScenarioStatus("실행 중");
  updateCanvasJobStatus(companyId, { label:"실행 중", done:0, total:runnableItems.length, pct:0, tone:"running" });
  updateScenarioProgress(0);
  setMarkdown(document.getElementById("scenarioReportOutput"), "보고서 생성 대기 중입니다.");
  setMarkdown(document.getElementById("scenarioValidationOutput"), "검증 대기 중입니다.");
  latestReport = "보고서 생성 대기 중입니다.";
  latestValidation = "검증 대기 중입니다.";
  renderScenarioSteps();

  const url = `/api/run?company_id=${encodeURIComponent(companyId)}&scenario=${encodeURIComponent(JSON.stringify(scenarioPayload(runnableItems)))}`;
  scenarioEventSource = new EventSource(url);

  scenarioEventSource.addEventListener("workflow", event => {
    const data = JSON.parse(event.data);
    if(data.status === "completed"){
      setScenarioStatus("완료");
      saveRunArchive(companyId);
      updateCanvasJobStatus(companyId, { label:"완료", done:runnableItems.length, total:runnableItems.length, pct:100, tone:"done" });
      runButton.disabled = false;
      scenarioEventSource.close();
    }
    if(data.status === "failed"){
      setScenarioStatus("실패");
      updateCanvasJobStatus(companyId, { label:"오류", done:completed, total:runnableItems.length, pct:runnableItems.length ? Math.round((completed / runnableItems.length) * 100) : 0, tone:"review" });
      runButton.disabled = false;
      scenarioEventSource.close();
    }
  });

  scenarioEventSource.addEventListener("step", event => {
    const data = JSON.parse(event.data);
    const index = scenarioItems.findIndex((item, itemIndex) => data.key === `${item.type}_agent_${itemIndex + 1}` || data.label === item.label);
    const item = scenarioItems[Math.max(0,index)];
    if(!item) return;
    if(data.status === "running"){
      stepStatuses[item.id] = "실행 중";
      openedSteps.add(item.id);
    }
    if(data.status === "done"){
      completed += 1;
      stepStatuses[item.id] = "완료";
      stepOutputs[item.id] = data.output || "결과 없음";
      openedSteps.add(item.id);
      updateScenarioProgress(completed);
      updateCanvasJobStatus(companyId, { label:"실행 중", done:completed, total:runnableItems.length, pct:runnableItems.length ? Math.round((completed / runnableItems.length) * 100) : 0, tone:"running" });
      if(data.result_key === "final_report"){
        latestReport = data.output || "보고서 없음";
        setMarkdown(document.getElementById("scenarioReportOutput"), latestReport);
      }
      if(data.result_key === "validation_result"){
        latestValidation = data.output || "검증 결과 없음";
        setMarkdown(document.getElementById("scenarioValidationOutput"), latestValidation);
      }
      // 단계 완료마다 중간 결과 저장
      saveIntermediateResults(companyId);
    }
    if(data.status === "error"){
      stepStatuses[item.id] = "오류";
      stepOutputs[item.id] = data.error || "오류가 발생했습니다.";
      openedSteps.add(item.id);
      setScenarioStatus("오류");
      updateCanvasJobStatus(companyId, { label:"오류", done:completed, total:scenarioItems.length, pct:scenarioItems.length ? Math.round((completed / scenarioItems.length) * 100) : 0, tone:"review" });
      runButton.disabled = false;
      scenarioEventSource.close();
    }
    renderScenarioSteps();
  });

  scenarioEventSource.onerror = () => {
    setScenarioStatus("연결 종료");
    runButton.disabled = false;
    if(scenarioEventSource) scenarioEventSource.close();
  };
}

function addWorkTab(page){
  const tabs = document.getElementById("workTabs");
  let tab = tabs.querySelector(`[data-page="${page}"]`);
  if(!tab){
    tab = document.createElement("button");
    tab.className = "work-tab";
    tab.dataset.page = page;
    const label = document.createElement("span");
    label.textContent = pageNames[page] || page;
    tab.appendChild(label);
    if(page !== "home"){
      const close = document.createElement("span");
      close.className = "work-tab-close";
      close.dataset.closeTab = page;
      close.textContent = "×";
      tab.appendChild(close);
    }
    tabs.appendChild(tab);
  }
}

function render(page="home"){
  currentPage = page;
  addWorkTab(page);
  document.querySelectorAll(".nav-item,.my-analysis,.work-tab,.quick-card").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(`[data-page="${page}"]`).forEach(b=>b.classList.add("active"));
  const contentEl = document.getElementById("content");
  const fillPage = (page === "canvas" && canvasTab === "report") ||
                   (page === "investigation" && investigationTab === "scenario") ||
                   (page === "generalinv" && generalInvTab === "workbench");
  contentEl.classList.toggle("content-fill", fillPage);
  contentEl.innerHTML = pages[page] ? pages[page]() : pages.home();
  if(page === "home"){
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    coachInitHome();
  }
  if(page === "profile"){
    loadScenarioCompanies();
    initRiskDashboard();
  }
  if(page === "generalinv"){
    initGenInvSearch();
    if(!scenarioCompanies.length) loadScenarioCompanies();
    if(showGenInvRegForm && giRegTargetType === "person") loadRiskPersons();
    if(generalInvTab === "profile"){
      const companyId = generalInvCompanyId(activeGenInvCase());
      if(companyId) loadCompanyDetail(companyId);
    }
    if(generalInvTab === "data"){
      const companyId = generalInvCompanyId(activeGenInvCase());
      if(companyId && !scenarioCompanies.length) loadScenarioCompanies();
    }
  }
  if(page === "lawsearch"){
    if(drugInvTab === "data"){
      if(!scenarioCompanies.length) loadScenarioCompanies();
    }
  }
  if(page === "investigation"){
    if(!scenarioCompanies.length) loadScenarioCompanies();
    if(investigationTab === "ongoing" && showScenarioCompanyPicker) loadScenarioCompanies();
    if(investigationTab === "dashboard") initRiskDashboard();
    if(investigationTab === "profile")   loadCompanyDetail(activeCanvasCompanyId);
    if(investigationTab === "scenario"){
      scenarioInitialized = false;
      initScenarioWorkbench();
    }
    if(investigationTab === "templates"){
      templateEditorInitialized = false;
      initTemplateEditor();
    }
  }
  if(page === "canvas" && canvasTab === "scenario"){
    scenarioInitialized = false;
    initScenarioWorkbench();
  }
  if(page === "canvas" && canvasTab === "templates"){
    templateEditorInitialized = false;
    initTemplateEditor();
  }
  if(page === "canvas" && canvasTab === "overview" && showScenarioCompanyPicker){
    loadScenarioCompanies();
  }
  if(page === "canvas" && canvasTab === "profile"){
    loadCompanyDetail(activeCanvasCompanyId);
  }
}

document.addEventListener("input", (event) => {
  if(event.target && event.target.id === "drugSearchInput"){
    drugCaseFilter = event.target.value;
    render("lawsearch");
    return;
  }
});

document.addEventListener("input", (event) => {
  if(event.target && event.target.id === "coachPrompt"){
    const cc = document.getElementById("coachCharCount");
    if(cc) cc.textContent = event.target.value.length + "자";
  }
});

document.addEventListener("change", (event) => {
  if(event.target && event.target.id === "coachFileInput"){
    coachHandleFileSelect(event.target.files);
    event.target.value = "";  // 같은 파일 재선택 가능하게
  }
});

document.addEventListener("click", (event)=>{
  if(event.target.closest("#shutdownAllBtn")){
    shutdownAllServers();
    return;
  }

  const closeTabBtn = event.target.closest("[data-close-tab]");
  if(closeTabBtn){
    event.stopPropagation();
    const page = closeTabBtn.dataset.closeTab;
    const tab = document.querySelector(`.work-tab[data-page="${page}"]`);
    if(tab) tab.remove();
    if(currentPage === page) render("home");
    return;
  }

  const lockedToggle = event.target.closest(".toggle-row.locked");
  if(lockedToggle){
    const key = lockedToggle.dataset.permissionKey;
    const label = lockedToggle.querySelector("span:first-child")?.textContent?.trim() || key;
    const confirmed = confirm(`"${label}" 사용 권한이 없습니다.\n관리자에게 권한을 요청하시겠습니까?`);
    if(confirmed){
      requestPermissions([key]);
      renderScenarioList();
      syncScenarioEditor();
      alert("권한 요청이 등록되었습니다. 승인 전까지 해당 항목을 사용할 수 없습니다.");
    }
    return;
  }

  const archiveJobBtn = event.target.closest("[data-archive-job]");
  if(archiveJobBtn){
    const companyId = archiveJobBtn.dataset.archiveJob;
    archiveCanvasJob(companyId);
    overviewArchiveOpen = true;
    render("canvas");
    return;
  }

  const removeJobBtn = event.target.closest("[data-remove-job]");
  if(removeJobBtn){
    const companyId = removeJobBtn.dataset.removeJob;
    const job = canvasJobs().find(item => item.companyId === companyId);
    const name = job?.companyName || companyId;
    if(!confirm(`${name} 진행작업을 내 목록에서 삭제하시겠습니까?`)) return;
    removeCanvasJobForCurrentUser(companyId);
    render("canvas");
    return;
  }

  const approveBtn = event.target.closest("[data-approve-key]");
  if(approveBtn){
    const key = approveBtn.dataset.approveKey;
    userPermissions[key] = "granted";
    saveCanvasState();
    renderSidebarPermissions();
    render("permission");
    return;
  }

  const rejectBtn = event.target.closest("[data-reject-key]");
  if(rejectBtn){
    const key = rejectBtn.dataset.rejectKey;
    const label = scenarioSourceByKey(key)?.label || key;
    if(!confirm(`"${label}" 권한 요청을 거부하시겠습니까?`)) return;
    userPermissions[key] = "locked";
    saveCanvasState();
    renderSidebarPermissions();
    render("permission");
    return;
  }

  const revokeBtn = event.target.closest("[data-revoke-key]");
  if(revokeBtn){
    const key = revokeBtn.dataset.revokeKey;
    const label = scenarioSourceByKey(key)?.label || key;
    if(!confirm(`"${label}" 권한을 회수하시겠습니까?`)) return;
    userPermissions[key] = "locked";
    saveCanvasState();
    renderSidebarPermissions();
    render("permission");
    return;
  }

  const templateEditBtn = event.target.closest("[data-template-edit-btn]");
  if(templateEditBtn){
    const templateId = templateEditBtn.dataset.templateEditBtn;
    const template = allScenarioTemplates().find(t => t.id === templateId);
    if(!template) return;
    const editable = canEditTemplate(template);
    editingTemplateId = editable ? templateId : "__new__";
    templateDraftName = editable ? "" : `${template.name} 사본`;
    templateEditorItems = template.items.map((item, i) => normalizeScenarioItem({...item, id: uid()}, i));
    templateEditorSelectedId = templateEditorItems[0]?.id || null;
    templateEditorInitialized = false;
    render("canvas");
    return;
  }

  const discardNewBtn = event.target.closest("[data-discard-new-template]");
  if(discardNewBtn){
    editingTemplateId = null;
    templateDraftName = "";
    templateEditorItems = [];
    templateEditorSelectedId = null;
    templateEditorInitialized = false;
    render("canvas");
    return;
  }

  const deleteTemplateBtn = event.target.closest("[data-delete-template]");
  if(deleteTemplateBtn){
    const templateId = deleteTemplateBtn.dataset.deleteTemplate;
    const template = allScenarioTemplates().find(t => t.id === templateId);
    if(!template) return;
    if(!canDeleteTemplate(template)){
      alert("템플릿 소유자 또는 관리자만 삭제할 수 있습니다.");
      return;
    }
    if(!confirm(`"${template.name}" 템플릿을 삭제하시겠습니까?`)) return;
    const isBuiltin = scenarioTemplates.some(t => t.id === templateId);
    if(isBuiltin){
      hiddenBuiltinIds.add(templateId);
      delete builtinOverrides[templateId];
    } else {
      customTemplates = customTemplates.filter(t => t.id !== templateId);
    }
    if(editingTemplateId === templateId){ editingTemplateId = null; templateDraftName = ""; templateEditorItems = []; templateEditorSelectedId = null; }
    saveCanvasState();
    templateEditorInitialized = false;
    render("canvas");
    return;
  }

  const archiveToggle = event.target.closest("[data-toggle-archive]");
  if(archiveToggle){
    overviewArchiveOpen = !overviewArchiveOpen;
    render("canvas");
    return;
  }

  const permissionRequest = event.target.closest("[data-permission-request]");
  if(permissionRequest){
    const keys = permissionRequest.dataset.permissionRequest.split(",").map(key => key.trim()).filter(Boolean);
    requestPermissions(keys);
    renderScenarioList();
    syncScenarioEditor();
    alert("권한 요청이 등록되었습니다. 승인 전까지 해당 데이터소스/AI 서비스를 포함한 분석은 실행할 수 없습니다.");
    return;
  }

  const homePickerClose = event.target.closest("[data-home-picker-close]");
  if(homePickerClose || (event.target.id === "homePickerOverlay")){
    document.getElementById("homePickerOverlay")?.remove();
    return;
  }

  const homePickerToggle = event.target.closest("[data-home-picker-toggle]");
  if(homePickerToggle){
    const overlay = document.getElementById("homePickerOverlay");
    const kind = overlay?.dataset.homePickerKind || "rag";
    const key = homePickerToggle.dataset.homePickerToggle;
    const current = homePickerSelectedKeys(kind);
    const next = current.includes(key)
      ? current.filter(item => item !== key)
      : [...current, key];
    homeSetPickerSelectedKeys(kind, next);
    openHomePicker(kind);
    const prompt = (document.getElementById("coachPrompt")?.value || "").trim();
    if(prompt && (coachSuggestions.length > 0 || coachImprovedPrompt)){
      coachRunAnalyze();
    }
    return;
  }

  const homePickerRequest = event.target.closest("[data-home-picker-request]");
  if(homePickerRequest){
    const overlay = document.getElementById("homePickerOverlay");
    const kind = overlay?.dataset.homePickerKind || "rag";
    requestPermissions([homePickerRequest.dataset.homePickerRequest]);
    openHomePicker(kind);
    return;
  }

  const homePickerTrigger = event.target.closest(".home-picker-trigger");
  if(homePickerTrigger){
    openHomePicker(homePickerTrigger.dataset.homeAgent ? "agent" : "rag");
    return;
  }

  const homeOptionBtn = event.target.closest("[data-home-source], [data-home-agent]");
  if(homeOptionBtn){
    homeToggleAnalysisOption(homeOptionBtn);
    const prompt = (document.getElementById("coachPrompt")?.value || "").trim();
    if(prompt && (coachSuggestions.length > 0 || coachImprovedPrompt)){
      coachRunAnalyze();
    }
    return;
  }

  const homeRunBtn = event.target.closest(".home-run-btn");
  if(homeRunBtn){
    const prompt = (document.getElementById("coachPrompt")?.value || "").trim();
    if(!prompt){ alert("프롬프트를 먼저 입력하세요."); return; }
    homeRunAnalysis(prompt, homeRunBtn);
    return;
  }

  /* 프롬프트 코치 컨트롤 */
  if(event.target.closest("#coachAnalyzeBtn")){ coachRunAnalyze(); return; }
  if(event.target.closest("#coachImproveBtn")){ coachImprove(); return; }
  if(event.target.closest("#coachResetBtn")){ coachReset(); return; }
  if(event.target.closest("#coachSuggToggle")){
    coachSuggestionsCollapsed = !coachSuggestionsCollapsed;
    coachRefreshCards();
    return;
  }
  const removeFileBtn = event.target.closest("[data-coach-remove-file]");
  if(removeFileBtn){
    coachRemoveFile(parseInt(removeFileBtn.dataset.coachRemoveFile, 10));
    return;
  }

  const newScenarioButton = event.target.closest("[data-new-scenario-button]");
  if(newScenarioButton){
    showScenarioCompanyPicker = !showScenarioCompanyPicker;
    render("canvas");
    if(showScenarioCompanyPicker) loadScenarioCompanies();
    return;
  }

  const restoreJobButton = event.target.closest("[data-restore-job]");
  if(restoreJobButton){
    const companyId = restoreJobButton.dataset.restoreJob;
    restoreRunArchiveToWorkspace(companyId, { tab:"report" });
    canvasTab = "overview";
    render("canvas");
    return;
  }

  /* ── 진행중인 관세조사 핸들러 ── */
  const invNewJobBtn = event.target.closest("[data-inv-new-job]");
  if(invNewJobBtn){
    showInvNewJobForm = !showInvNewJobForm;
    if(showInvNewJobForm && !scenarioCompanies.length) loadScenarioCompanies();
    render("investigation");
    return;
  }

  const invSubmitBtn = event.target.closest("[data-inv-submit]");
  if(invSubmitBtn){
    const companyId = document.getElementById("invNewJobCompany")?.value;
    const templateId = document.getElementById("invNewJobTemplate")?.value;
    if(!companyId){ alert("조사 대상 업체를 선택하세요."); return; }
    const company = findCompanyById(companyId) || { company_id:companyId, company_name:companyId };
    createCanvasJob(company);
    activeCanvasCompanyId = companyId;
    const tpl = scenarioTemplateById(templateId || "customs-basic") || scenarioTemplateById("customs-basic");
    if(tpl){
      activeScenarioTemplateId = tpl.id;
      scenarioItems = tpl.items.map((item, i) => normalizeScenarioItem({...item, id:uid()}, i));
      selectedScenarioId = scenarioItems[0]?.id || null;
      companyScenarios[companyId] = scenarioItems.map(item => ({...item}));
      stepOutputs = {};
      stepStatuses = {};
      openedSteps = new Set();
      expandedResultStepId = null;
      patchCanvasJob(companyId, {
        status:{ label:"대기", tone:"wait", pct:0, done:0, total:scenarioItems.length },
        tab:"profile",
        scenarioChanged:false,
      });
    }
    loadCompanyRunArchive(companyId);
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    showInvNewJobForm = false;
    // 탭 이동 없이 카드 등록 후 목록 유지
    saveCanvasState();
    render("investigation");
    return;
  }

  const invToggleArchive = event.target.closest("[data-inv-toggle-archive]");
  if(invToggleArchive){
    invArchiveOpen = !invArchiveOpen;
    render("investigation");
    return;
  }

  const invArchiveJobBtn = event.target.closest("[data-inv-archive-job]");
  if(invArchiveJobBtn){
    const companyId = invArchiveJobBtn.dataset.invArchiveJob;
    archiveCanvasJob(companyId);
    invArchiveOpen = true;
    render("investigation");
    return;
  }

  const invRestoreJobBtn = event.target.closest("[data-inv-restore-job]");
  if(invRestoreJobBtn){
    const companyId = invRestoreJobBtn.dataset.invRestoreJob;
    restoreRunArchiveToWorkspace(companyId, { tab:"profile" });
    invArchiveOpen = false;
    investigationTab = "ongoing";
    render("investigation");
    return;
  }

  const invRemoveJobBtn = event.target.closest("[data-inv-remove-job]");
  if(invRemoveJobBtn){
    const companyId = invRemoveJobBtn.dataset.invRemoveJob;
    const job = canvasJobs().find(item => item.companyId === companyId);
    const name = job?.companyName || job?.company || companyId;
    if(!confirm(`${name} 진행작업을 내 목록에서 삭제하시겠습니까?`)) return;
    removeCanvasJobForCurrentUser(companyId);
    render("investigation");
    return;
  }

  const invCompanyCard = event.target.closest("[data-inv-company]");
  if(invCompanyCard && !event.target.closest("[data-inv-archive-job],[data-inv-restore-job],[data-inv-remove-job]")){
    const companyId = invCompanyCard.dataset.invCompany;
    const targetTab = invCompanyCard.dataset.invTab || "profile";
    activeCanvasCompanyId = companyId;
    investigationTab = targetTab;
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    loadCompanyRunArchive(companyId);
    saveCanvasState();
    render("investigation");
    return;
  }

  const analysisJobCard = event.target.closest("[data-analysis-job]");
  if(analysisJobCard){
    const page = analysisJobCard.dataset.analysisPage || "investigation";
    const targetTab = analysisJobCard.dataset.analysisTab || "ongoing";
    if(page === "generalinv"){
      activeGenInvCaseId = analysisJobCard.dataset.analysisJob;
      generalInvTab = "cases";
      activeGiStepId = null;
      saveCanvasState();
      render("generalinv");
      return;
    }
    if(page !== "investigation"){
      render(page);
      return;
    }
    activeCanvasCompanyId = analysisJobCard.dataset.canvasCompany;
    investigationTab = targetTab;
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    loadCompanyRunArchive(activeCanvasCompanyId);
    saveCanvasState();
    render("investigation");
    return;
  }

  const companyTarget = event.target.closest("[data-canvas-company]");
  if(companyTarget){
    activeCanvasCompanyId = companyTarget.dataset.canvasCompany;
    showScenarioCompanyPicker = false;
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    loadCompanyRunArchive(activeCanvasCompanyId);
    if(companyTarget.dataset.openCompanyProfile === "true") canvasTab = "profile";
    saveCanvasState();
  }

  /* ── 일반수사분석 클릭 핸들러 ── */
  const giRegTypeBtn = event.target.closest("[data-gi-reg-type]");
  if(giRegTypeBtn){
    giRegTargetType = giRegTypeBtn.dataset.giRegType;
    if(giRegTargetType === "person") loadRiskPersons();
    render("generalinv");
    return;
  }

  const giRegToggle = event.target.closest("[data-gi-reg-toggle]");
  if(giRegToggle){
    showGenInvRegForm = !showGenInvRegForm;
    if(showGenInvRegForm){
      if(!scenarioCompanies.length) loadScenarioCompanies();
    }
    render("generalinv");
    return;
  }

  const giRegister = event.target.closest("[data-gi-register]");
  if(giRegister){
    const selectedId = document.getElementById("giRegTargetSelect")?.value || "";
    if(!selectedId){ alert("수사 대상을 선택하세요."); return; }
    const invTypeId = document.getElementById("giRegTypeSelect")?.value || GEN_INV_TYPES[0].id;

    let targetName, extraFields = {};
    if(giRegTargetType === "company"){
      const co = findCompanyById(selectedId) || scenarioCompanies.find(c => c.company_id === selectedId);
      targetName = co?.company_name || selectedId;
      extraFields = { companyId: selectedId, targetType:"company" };
    } else {
      const person = riskPersonById(selectedId);
      targetName = person?.name || selectedId;
      extraFields = {
        targetType:"person", personId: selectedId,
        personProfileType: person?.profile_type || "",
        personRiskLevel:   person?.risk_level   || "",
        personRiskScore:   person?.risk_score,
        personNationality: person?.nationality   || "",
      };
    }

    const caseId = `GI-${new Date().getFullYear()}-${String(customGenInvCases.length + defaultGenInvCases.length + 1).padStart(3,"0")}`;
    const newCase = {
      caseId, targetName, invTypeId,
      ...extraFields,
      status:{ label:"대기", tone:"wait", pct:0, done:0, total:7 },
      investigator: currentUser().name,
      team: currentUserGroup().org + " " + currentUserGroup().team,
      created: new Date().toLocaleDateString("ko-KR"),
      updated: "방금",
      ownerUserId: currentUserId,
      assignees: [currentUserId],
    };
    customGenInvCases.unshift(newCase);
    showGenInvRegForm = false;
    giRegTargetType   = "company";
    // 탭 이동 없이 목록에 카드만 등록
    saveCanvasState();
    render("generalinv");
    return;
  }

  /* ── 일반수사 케이스 삭제 ── */
  const giRemoveCase = event.target.closest("[data-gi-remove-case]");
  if(giRemoveCase){
    event.stopPropagation();
    const caseId = giRemoveCase.dataset.giRemoveCase;
    const idx = defaultGenInvCases.findIndex(c => c.caseId === caseId);
    if(idx !== -1) defaultGenInvCases.splice(idx, 1);
    const cidx = customGenInvCases.findIndex(c => c.caseId === caseId);
    if(cidx !== -1) customGenInvCases.splice(cidx, 1);
    if(activeGenInvCaseId === caseId){ activeGenInvCaseId = null; generalInvTab = "cases"; }
    saveCanvasState(); render("generalinv"); return;
  }

  /* ── 일반수사 케이스 아카이브 ── */
  const giArchiveCase = event.target.closest("[data-gi-archive-case]");
  if(giArchiveCase){
    event.stopPropagation();
    const caseId = giArchiveCase.dataset.giArchiveCase;
    const fromDefault = defaultGenInvCases.findIndex(c => c.caseId === caseId);
    const fromCustom  = customGenInvCases.findIndex(c => c.caseId === caseId);
    const c = fromDefault !== -1 ? defaultGenInvCases.splice(fromDefault, 1)[0]
            : fromCustom  !== -1 ? customGenInvCases.splice(fromCustom, 1)[0] : null;
    if(c){ archivedGenInvCases.unshift({...c, archivedAt: new Date().toLocaleString()}); }
    if(activeGenInvCaseId === caseId){ activeGenInvCaseId = null; generalInvTab = "cases"; }
    saveCanvasState(); render("generalinv"); return;
  }

  /* ── 일반수사 아카이브 복원 ── */
  const giRestoreCase = event.target.closest("[data-gi-restore-case]");
  if(giRestoreCase){
    event.stopPropagation();
    const caseId = giRestoreCase.dataset.giRestoreCase;
    const idx = archivedGenInvCases.findIndex(c => c.caseId === caseId);
    if(idx !== -1){ customGenInvCases.push(archivedGenInvCases.splice(idx, 1)[0]); }
    saveCanvasState(); render("generalinv"); return;
  }

  /* ── 일반수사 아카이브 토글 ── */
  const giToggleArchive = event.target.closest("[data-gi-toggle-archive]");
  if(giToggleArchive){
    genInvArchiveOpen = !genInvArchiveOpen;
    render("generalinv"); return;
  }

  const giCase = event.target.closest("[data-gi-case]");
  if(giCase){
    activeGenInvCaseId = giCase.dataset.giCase;
    generalInvTab      = "profile";
    activeGiStepId     = null;
    saveCanvasState();
    render("generalinv");
    return;
  }

  /* ── 워크벤치 단계 핸들러 ── */
  const giStepSelect = event.target.closest("[data-gi-step-select]");
  if(giStepSelect && !event.target.closest("[data-gi-step-up],[data-gi-step-down]")){
    activeGiStepId = giStepSelect.dataset.giStepSelect;
    saveCanvasState();
    render("generalinv");
    return;
  }

  const giStepUp = event.target.closest("[data-gi-step-up]");
  if(giStepUp){
    const aCase = activeGenInvCase();
    const steps = aCase?.giSteps;
    if(steps){
      const id = giStepUp.dataset.giStepUp;
      const i = steps.findIndex(s => s.id === id);
      if(i > 0){ [steps[i-1], steps[i]] = [steps[i], steps[i-1]]; }
    }
    saveCanvasState();
    render("generalinv");
    return;
  }

  const giStepDown = event.target.closest("[data-gi-step-down]");
  if(giStepDown){
    const aCase = activeGenInvCase();
    const steps = aCase?.giSteps;
    if(steps){
      const id = giStepDown.dataset.giStepDown;
      const i = steps.findIndex(s => s.id === id);
      if(i >= 0 && i < steps.length - 1){ [steps[i], steps[i+1]] = [steps[i+1], steps[i]]; }
    }
    saveCanvasState();
    render("generalinv");
    return;
  }

  const giStepAdd = event.target.closest("[data-gi-step-add]");
  if(giStepAdd){
    const sel = document.getElementById("giWbAddSource");
    if(!sel?.value){ alert("추가할 단계를 선택하세요."); return; }
    const key = sel.value;
    const src = giSourceByKey(key);
    const aCase = activeGenInvCase();
    if(aCase){
      if(!aCase.giSteps) activeGiCaseSteps();
      const sourceKey = giCommonSourceKey(src.key);
      aCase.giSteps.push(normalizeGiScenarioStep({
        ...src,
        id:`gis_${uid()}`,
        sourceKey,
        targetType: aCase.targetType || "company",
        target_type: aCase.targetType || "company",
        behaviors: sourceDefaultBehaviors(sourceKey),
        instruction: sourceDefaultInstruction(sourceKey, aCase.targetType),
      }, aCase.giSteps.length));
      activeGiStepId = aCase.giSteps[aCase.giSteps.length - 1].id;
    }
    saveCanvasState();
    render("generalinv");
    return;
  }

  const giStepDelete = event.target.closest("[data-gi-step-delete]");
  if(giStepDelete){
    const id = giStepDelete.dataset.giStepDelete;
    const aCase = activeGenInvCase();
    if(aCase?.giSteps){
      aCase.giSteps = aCase.giSteps.filter(s => s.id !== id);
      if(aCase.stepStates) delete aCase.stepStates[id];
      if(activeGiStepId === id) activeGiStepId = null;
    }
    saveCanvasState();
    render("generalinv");
    return;
  }

  const giRunStep = event.target.closest("[data-gi-run-step]");
  if(giRunStep){
    const val = giRunStep.dataset.giRunStep;
    const colonIdx = val.indexOf(":");
    const caseId = val.slice(0, colonIdx);
    const stepId = val.slice(colonIdx + 1);
    const aCase = allGenInvCases().find(c => c.caseId === caseId);
    if(aCase){
      const steps = activeGenInvCaseId === caseId ? activeGiCaseSteps() : (aCase.giSteps || []);
      if(stepId === "all"){
        /* 완료되지 않은 전체 단계를 SSE로 실행 */
        const toRun = steps.filter(s => (aCase.stepStates||{})[s.id] !== "done");
        giStreamSteps(aCase, toRun.length ? toRun : steps);
      } else {
        /* 개별 단계 실행 */
        const step = steps.find(s => s.id === stepId);
        if(step) giStreamSteps(aCase, [step]);
      }
    }
    return;
  }

  const giRerunStep = event.target.closest("[data-gi-rerun-step]");
  if(giRerunStep){
    const val = giRerunStep.dataset.giRerunStep;
    const colonIdx = val.indexOf(":");
    const caseId = val.slice(0, colonIdx);
    const stepId = val.slice(colonIdx + 1);
    const aCase = allGenInvCases().find(c => c.caseId === caseId);
    if(aCase){
      if(!aCase.stepStates)  aCase.stepStates  = {};
      if(!aCase.stepResults) aCase.stepResults = {};
      const steps = activeGenInvCaseId === caseId ? activeGiCaseSteps() : (aCase.giSteps || []);
      if(stepId === "clear"){
        /* 전체 초기화 (재실행 없이 상태만 지움) */
        if(giRunEventSource){ giRunEventSource.close(); giRunEventSource = null; }
        aCase.stepStates  = {};
        aCase.stepResults = {};
        aCase.stepExpanded = {};
        aCase.stepsDone = 0;
        aCase.status = { ...aCase.status, done:0, pct:0, label:"대기", tone:"wait" };
        saveCanvasState();
        render("generalinv");
      } else {
        /* 개별 단계 재실행: 상태 초기화 후 SSE 실행 */
        delete aCase.stepStates[stepId];
        delete aCase.stepResults[stepId];
        const step = steps.find(s => s.id === stepId);
        if(step) giStreamSteps(aCase, [step]);
      }
    }
    return;
  }

  /* 결과 펼침/접기 */
  const giToggleResult = event.target.closest("[data-gi-toggle-result]");
  if(giToggleResult){
    const stepId = giToggleResult.dataset.giToggleResult;
    const aCase  = activeGenInvCase();
    if(aCase){
      if(!aCase.stepExpanded) aCase.stepExpanded = {};
      aCase.stepExpanded[stepId] = !aCase.stepExpanded[stepId];
      saveCanvasState();
      render("generalinv");
    }
    return;
  }

  const giType = event.target.closest("[data-gi-type]");
  if(giType){
    const typeId = giType.dataset.giType;
    const aCase  = activeGenInvCase();
    if(aCase){
      const idx = customGenInvCases.findIndex(c => c.caseId === aCase.caseId);
      if(idx >= 0) customGenInvCases[idx].invTypeId = typeId;
      else {
        const di = defaultGenInvCases.findIndex(c => c.caseId === aCase.caseId);
        if(di >= 0) defaultGenInvCases[di].invTypeId = typeId;
      }
    }
    saveCanvasState();
    render("generalinv");
    return;
  }

  const giTab = event.target.closest("[data-gi-tab]");
  if(giTab){
    generalInvTab = giTab.dataset.giTab;
    saveCanvasState();
    render("generalinv");
    return;
  }

  const drugTab = event.target.closest("[data-drug-tab]");
  if(drugTab){
    drugInvTab = drugTab.dataset.drugTab;
    render("lawsearch");
    return;
  }

  /* ── 마약수사 워크벤치 핸들러 ── */
  const drugStepSelect = event.target.closest("[data-drug-step-select]");
  if(drugStepSelect && !event.target.closest("[data-drug-step-up],[data-drug-step-down]")){
    activeDrugStepId = drugStepSelect.dataset.drugStepSelect;
    render("lawsearch"); return;
  }

  const drugStepUp = event.target.closest("[data-drug-step-up]");
  if(drugStepUp){
    const aCase = activeDrugCase(); if(!aCase) return;
    const steps = activeDrugCaseSteps();
    const idx = steps.findIndex(s => s.id === drugStepUp.dataset.drugStepUp);
    if(idx > 0){ [steps[idx-1], steps[idx]] = [steps[idx], steps[idx-1]]; }
    saveCanvasState(); render("lawsearch"); return;
  }

  const drugStepDown = event.target.closest("[data-drug-step-down]");
  if(drugStepDown){
    const aCase = activeDrugCase(); if(!aCase) return;
    const steps = activeDrugCaseSteps();
    const idx = steps.findIndex(s => s.id === drugStepDown.dataset.drugStepDown);
    if(idx < steps.length-1){ [steps[idx], steps[idx+1]] = [steps[idx+1], steps[idx]]; }
    saveCanvasState(); render("lawsearch"); return;
  }

  const drugStepDelete = event.target.closest("[data-drug-step-delete]");
  if(drugStepDelete){
    const aCase = activeDrugCase(); if(!aCase) return;
    const id = drugStepDelete.dataset.drugStepDelete;
    aCase.giSteps = activeDrugCaseSteps().filter(s => s.id !== id);
    if(activeDrugStepId === id) activeDrugStepId = aCase.giSteps[0]?.id || null;
    saveCanvasState(); render("lawsearch"); return;
  }

  const drugStepAdd = event.target.closest("[data-drug-step-add]");
  if(drugStepAdd){
    const aCase = activeDrugCase(); if(!aCase) return;
    const sel = document.getElementById("drugWbAddSource");
    const key = sel?.value; if(!key) return;
    if(!aCase.giSteps) activeDrugCaseSteps();
    const src = GI_STEP_SOURCES.find(s => s.key === key) || GI_STEP_SOURCES[0];
    aCase.giSteps.push(normalizeGiScenarioStep({
      ...src, id:`drs_${uid()}`,
      sourceKey: src.sourceKey,
      behaviors: sourceDefaultBehaviors(src.sourceKey),
      instruction: sourceDefaultInstruction(src.sourceKey, aCase.targetType||"person"),
    }, aCase.giSteps.length));
    activeDrugStepId = aCase.giSteps[aCase.giSteps.length-1].id;
    saveCanvasState(); render("lawsearch"); return;
  }

  const drugRunStep = event.target.closest("[data-drug-run-step]");
  if(drugRunStep){
    const [caseId, stepId] = drugRunStep.dataset.drugRunStep.split(":");
    const aCase = activeDrugCase(); if(!aCase) return;
    if(stepId === "clear"){
      aCase.stepStates  = {}; aCase.stepResults = {}; aCase.stepExpanded = {};
      saveCanvasState(); render("lawsearch"); return;
    }
    if(!aCase.stepStates) aCase.stepStates = {};
    if(!aCase.stepResults) aCase.stepResults = {};
    const steps = activeDrugCaseSteps();
    const toRun = stepId === "all" ? steps : steps.filter(s => s.id === stepId);
    toRun.forEach(s => {
      aCase.stepStates[s.id] = "done";
      aCase.stepResults[s.id] = `[${escapeHtml(s.label)}] 분석이 완료되었습니다.`;
    });
    saveCanvasState(); render("lawsearch"); return;
  }

  const drugToggleResult = event.target.closest("[data-drug-toggle-result]");
  if(drugToggleResult){
    const aCase = activeDrugCase(); if(!aCase) return;
    if(!aCase.stepExpanded) aCase.stepExpanded = {};
    const id = drugToggleResult.dataset.drugToggleResult;
    aCase.stepExpanded[id] = !aCase.stepExpanded[id];
    render("lawsearch"); return;
  }

  const drugAccBtn = event.target.closest("[data-drug-acc]");
  if(drugAccBtn){
    const key = drugAccBtn.dataset.drugAcc;
    drugAccordionOpen[key] = !drugAccordionOpen[key];
    render("lawsearch");
    return;
  }

  /* ── 마약수사 케이스 삭제 ── */
  const drugRemoveCase = event.target.closest("[data-drug-remove-case]");
  if(drugRemoveCase){
    event.stopPropagation();
    const caseId = drugRemoveCase.dataset.drugRemoveCase;
    const idx = defaultDrugInvCases.findIndex(c => c.caseId === caseId);
    if(idx !== -1) defaultDrugInvCases.splice(idx, 1);
    if(activeDrugCaseId === caseId){ activeDrugCaseId = null; drugInvTab = "ongoing"; }
    saveCanvasState(); render("lawsearch"); return;
  }

  /* ── 마약수사 케이스 아카이브 ── */
  const drugArchiveCase = event.target.closest("[data-drug-archive-case]");
  if(drugArchiveCase){
    event.stopPropagation();
    const caseId = drugArchiveCase.dataset.drugArchiveCase;
    const idx = defaultDrugInvCases.findIndex(c => c.caseId === caseId);
    const c = idx !== -1 ? defaultDrugInvCases.splice(idx, 1)[0] : null;
    if(c){ archivedDrugCases.unshift({...c, archivedAt: new Date().toLocaleString()}); }
    if(activeDrugCaseId === caseId){ activeDrugCaseId = null; drugInvTab = "ongoing"; }
    saveCanvasState(); render("lawsearch"); return;
  }

  /* ── 마약수사 아카이브 복원 ── */
  const drugRestoreCase = event.target.closest("[data-drug-restore-case]");
  if(drugRestoreCase){
    event.stopPropagation();
    const caseId = drugRestoreCase.dataset.drugRestoreCase;
    const idx = archivedDrugCases.findIndex(c => c.caseId === caseId);
    if(idx !== -1){ defaultDrugInvCases.push(archivedDrugCases.splice(idx, 1)[0]); }
    saveCanvasState(); render("lawsearch"); return;
  }

  /* ── 마약수사 아카이브 토글 ── */
  const drugToggleArchive = event.target.closest("[data-drug-toggle-archive]");
  if(drugToggleArchive){
    drugArchiveOpen = !drugArchiveOpen;
    render("lawsearch"); return;
  }

  const drugCaseBtn = event.target.closest("[data-drug-case]");
  if(drugCaseBtn){
    activeDrugCaseId = drugCaseBtn.dataset.drugCase;
    drugInvTab = "data";
    render("lawsearch");
    return;
  }

  /* ── 마약수사 등록 대상 유형 전환 ── */
  const drugRegTypeBtn = event.target.closest("[data-drug-reg-type]");
  if(drugRegTypeBtn){
    drugRegTargetType = drugRegTypeBtn.dataset.drugRegType;
    if(drugRegTargetType === "person") loadRiskPersons();
    if(drugRegTargetType === "company" && !scenarioCompanies.length) loadScenarioCompanies();
    render("lawsearch");
    return;
  }

  const drugRegToggle = event.target.closest("[data-drug-reg-toggle]");
  if(drugRegToggle){
    showDrugNewCaseForm = !showDrugNewCaseForm;
    if(showDrugNewCaseForm){
      if(!scenarioCompanies.length) loadScenarioCompanies();
    }
    render("lawsearch");
    return;
  }

  const drugRegSubmit = event.target.closest("[data-drug-reg-submit]");
  if(drugRegSubmit){
    const selectedId = document.getElementById("drugRegTargetSelect")?.value || "";
    if(!selectedId){ alert("수사 대상을 선택하세요."); return; }
    const invTypeId = document.getElementById("drugRegType")?.value || "d1";

    let targetName, extraFields = {};
    if(drugRegTargetType === "company"){
      const co = findCompanyById(selectedId) || scenarioCompanies.find(c => c.company_id === selectedId);
      targetName = co?.company_name || selectedId;
      extraFields = { companyId: selectedId, targetType:"company" };
    } else {
      const person = riskPersonById(selectedId);
      targetName = person?.name || selectedId;
      extraFields = { targetType:"person", personId: selectedId, nationality: person?.nationality || "미상" };
    }

    const autoId = "DRUG-" + new Date().getFullYear() + "-" + String(defaultDrugInvCases.length + 1).padStart(3,"0");
    const newCase = {
      caseId: autoId,
      targetName, invTypeId,
      ...extraFields,
      team:        "마약수사 전담팀",
      investigator: currentUser().name,
      updated: "방금",
      status: { label:"대기", tone:"wait", done:0, total:6, pct:0 },
    };
    defaultDrugInvCases.push(newCase);
    showDrugNewCaseForm = false;
    drugRegTargetType   = "company";
    // 탭 이동 없이 목록에 카드만 등록
    saveCanvasState();
    render("lawsearch");
    return;
  }

  const drugNetworkBtn = event.target.closest("[data-drug-network-target]");
  if(drugNetworkBtn){
    try{ drugInvSelectedTarget = JSON.parse(drugNetworkBtn.dataset.drugNetworkTarget); }catch(e){}
    drugInvTab = "network";
    render("lawsearch");
    return;
  }

  const slangDecodeBtn = event.target.closest("[data-slang-decode]");
  if(slangDecodeBtn){
    const input = document.getElementById("slangInput");
    const result = document.getElementById("slangDecodeResult");
    if(input && result){
      const slangMap = {"아이스":"필로폰(메스암페타민)","작대기":"주사기","떡":"대마초 압축분","야바":"메스암페타민 알약","찰리":"코카인","초코":"헤로인","LSD":"환각제","빽빽이":"필로폰 대량(1kg↑)"};
      const text = input.value;
      let decoded = text;
      let found = [];
      Object.entries(slangMap).forEach(([term,meaning])=>{
        if(text.includes(term)){ decoded = decoded.replace(new RegExp(term,"g"),`<mark title="${meaning}">${term}(=${meaning})</mark>`); found.push(`${term} → ${meaning}`); }
      });
      result.innerHTML = found.length ? `<div style="margin-bottom:8px;color:#16a34a;font-size:12px">탐지된 은어 ${found.length}건</div>${decoded}<hr style="margin:8px 0;border-color:#dde8ff"><div style="font-size:12px;color:#6b7f9e">${found.join(" | ")}</div>` : `<span style="color:#6b7f9e">탐지된 은어가 없습니다: ${escapeHtml(text)}</span>`;
    }
    return;
  }

  const slangSuggestBtn = event.target.closest("[data-slang-suggest]");
  if(slangSuggestBtn){
    const input = document.getElementById("slangInput");
    if(input) input.value = slangSuggestBtn.dataset.slangSuggest;
    return;
  }

  const riskScreeningTabBtn = event.target.closest("[data-rs-tab]");
  if(riskScreeningTabBtn){
    riskScreeningTab = riskScreeningTabBtn.dataset.rsTab;
    render("dw");
    return;
  }

  const customsInfoTabBtn = event.target.closest("[data-ci-tab]");
  if(customsInfoTabBtn){
    customsInfoTab = customsInfoTabBtn.dataset.ciTab;
    render("rag");
    return;
  }

  const ontologyTabBtn = event.target.closest("[data-ont-tab]");
  if(ontologyTabBtn){
    ontologyTab = ontologyTabBtn.dataset.ontTab;
    render("model");
    return;
  }

  const intlSendBtn = event.target.closest("[data-intl-send]");
  if(intlSendBtn){
    const input = document.getElementById("intlChatInput");
    if(input && input.value.trim()){
      const q = input.value.trim();
      intlInfoMessages.push({role:"user",text:q});
      const templates = [
        "WCO 2024 관련 결의사항을 분석합니다...",
        "해당 HS 품목에 대한 국제 분류 동향을 검토합니다...",
        "최신 분과위원회 결정사항과 연계하여 분석합니다...",
      ];
      intlInfoMessages.push({role:"ai",text:`[AI 분석] "${escapeHtml(q)}" 관련 WCO 회의결과를 검토한 결과:\n\n• WCO 관세품목분류위원회(HSC) 최신 결정사항과 비교 분석\n• 국내 수출입 품목과의 연관성 확인\n• ${templates[Math.floor(Math.random()*templates.length)]}\n\n실제 구현 시 WCO 문서 RAG 기반으로 정확한 답변이 제공됩니다.`});
      input.value = "";
      render("case");
    }
    return;
  }

  const intlTemplateBtn = event.target.closest("[data-intl-template]");
  if(intlTemplateBtn){
    const input = document.getElementById("intlChatInput");
    if(input) input.value = intlTemplateBtn.dataset.intlTemplate;
    return;
  }

  const investigationSelectBtn = event.target.closest("[data-investigation-select]");
  if(investigationSelectBtn){
    const companyId = investigationSelectBtn.dataset.investigationSelect;
    activeCanvasCompanyId = companyId;
    investigationTab = "profile";
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    loadCompanyRunArchive(companyId);
    saveCanvasState();
    render("investigation");
    return;
  }

  const investigationTabButton = event.target.closest("[data-investigation-tab]");
  if(investigationTabButton){
    const companyId = investigationTabButton.dataset.canvasCompany;
    if(companyId){
      activeCanvasCompanyId = companyId;
      scenarioInitialized = false;
      scenarioLoadedForCompany = null;
      loadCompanyRunArchive(companyId);
      showScenarioCompanyPicker = false;
      saveCanvasState();
    }
    investigationTab = investigationTabButton.dataset.investigationTab;
    render("investigation");
    return;
  }

  const canvasTabButton = event.target.closest("[data-canvas-tab]");
  if(canvasTabButton){
    if(canvasTabButton.dataset.templateId){
      activeScenarioTemplateId = canvasTabButton.dataset.templateId;
      scenarioItems = cloneTemplateItems(canvasTabButton.dataset.templateId);
      selectedScenarioId = scenarioItems[0]?.id || null;
      stepOutputs = {};
      stepStatuses = {};
      openedSteps = new Set();
      expandedResultStepId = null;
      saveCompanyScenario();
      scenarioInitialized = false;
      scenarioLoadedForCompany = activeCanvasCompanyId;
    }
    canvasTab = canvasTabButton.dataset.canvasTab;
    render("canvas");
    return;
  }

  if(companyTarget){
    render("canvas");
    return;
  }

  const pageButton = event.target.closest("[data-page]");
  if(pageButton){
    if(pageButton.dataset.openArchive === "true"){
      overviewArchiveOpen = true;
    }
    if(pageButton.dataset.canvasTab){
      canvasTab = pageButton.dataset.canvasTab;
    }
    if(pageButton.classList.contains("special-analysis-btn")){
      if(pageButton.dataset.page === "investigation"){
        investigationTab = "ongoing";
        showInvNewJobForm = false;
      }
      if(pageButton.dataset.page === "generalinv"){
        generalInvTab = "cases";
        showGenInvRegForm = false;
      }
      if(pageButton.dataset.page === "lawsearch"){
        drugInvTab = "dashboard";
        drugInvSelectedTarget = null;
        drugAccordionOpen = { cargo:true, traveler:false, modus:false, intl:false };
      }
      if(pageButton.dataset.page === "dw"){
        riskScreeningTab = "today";
      }
      if(pageButton.dataset.page === "rag"){
        customsInfoTab = "today";
      }
      if(pageButton.dataset.page === "case"){
        intlInfoMessages = [];
      }
      if(pageButton.dataset.page === "model"){
        ontologyTab = "graph";
      }
    }
    render(pageButton.dataset.page);
    return;
  }

  const collapseButton = event.target.closest(".collapsible-label");
  if(collapseButton){
    const target = document.getElementById(collapseButton.dataset.collapseTarget);
    const icon = collapseButton.querySelector("span");
    if(target){
      target.classList.toggle("collapsed");
      icon.textContent = target.classList.contains("collapsed") ? "▶" : "▼";
    }
    return;
  }

  const adminToggle = event.target.closest(".admin-toggle");
  if(adminToggle){
    const nav = document.querySelector(".admin-nav");
    nav.classList.toggle("closed");
    adminToggle.querySelector("span").textContent = nav.classList.contains("closed") ? "▶" : "▼";
  }
});

document.addEventListener("change", (event)=>{
  if(event.target && event.target.id === "giRegPersonSelect"){
    const person = riskPersonById(event.target.value);
    const targetInput = document.getElementById("giRegTarget");
    const nationInput = document.getElementById("giRegNation");
    const personIdInput = document.getElementById("giRegPersonId");
    if(person){
      if(targetInput) targetInput.value = person.name || "";
      if(nationInput) nationInput.value = person.nationality || "";
      if(personIdInput && person.birth_date) personIdInput.value = String(person.birth_date).replaceAll("-", "").slice(2, 8);
    }
    return;
  }

  const scenarioCompanySelect = event.target.closest("#newScenarioCompanySelect");
  if(scenarioCompanySelect){
    if(!scenarioCompanySelect.value) return;
    activeCanvasCompanyId = scenarioCompanySelect.value;
    const selectedCompany = findCompanyById(activeCanvasCompanyId) || { company_id:activeCanvasCompanyId, company_name:activeCanvasCompanyId };
    createCanvasJob(selectedCompany);
    showScenarioCompanyPicker = false;
    canvasTab = "overview";
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    scenarioItems = [];
    saveCanvasState();
    render("canvas");
  }
});

/* ── GI 워크벤치 단계 필드 실시간 편집 ── */
document.addEventListener("input", (event) => {
  const stepId = event.target.dataset.giStepId;
  if(!stepId) return;
  const aCase = activeGenInvCase();
  const step  = aCase?.giSteps?.find(s => s.id === stepId);
  if(!step) return;
  if(event.target.id === "giWbStepLabel") step.label = event.target.value;
  if(event.target.id === "giWbStepNote"){
    step.note = event.target.value;
    step.instruction = event.target.value;
  }
  saveCanvasState();
  // no re-render needed for text fields (live editing)
});

document.addEventListener("change", (event) => {
  const stepId = event.target.dataset.giStepId;
  if(stepId && event.target.id === "giWbStepType"){
    const aCase = activeGenInvCase();
    const step  = aCase?.giSteps?.find(s => s.id === stepId);
    if(step) step.type = event.target.value;
    saveCanvasState();
    render("generalinv");
    return;
  }
  if(stepId && event.target.id === "giWbStepSource"){
    const aCase = activeGenInvCase();
    const step  = aCase?.giSteps?.find(s => s.id === stepId);
    const source = giSourceByKey(event.target.value);
    if(step && source){
      step.key = source.key;
      step.type = source.type;
      step.label = source.label;
      step.sourceKey = giCommonSourceKey(source.key);
      step.targetType = aCase.targetType || "company";
      step.target_type = aCase.targetType || "company";
      step.behaviors = sourceDefaultBehaviors(step.sourceKey);
      step.behavior = step.behaviors[0];
      step.behaviorLabel = sourceBehaviorLabels(step.sourceKey, step.behaviors).join(", ");
      step.instruction = sourceDefaultInstruction(step.sourceKey, aCase.targetType);
      step.note = step.instruction;
    }
    saveCanvasState();
    render("generalinv");
    return;
  }
  const giBehaviorBox = event.target.closest("#giWbBehaviorOptions");
  if(giBehaviorBox && event.target.matches("input[type='checkbox']")){
    const aCase = activeGenInvCase();
    const step  = aCase?.giSteps?.find(s => s.id === giBehaviorBox.dataset.giStepId);
    if(step){
      const values = selectedBehaviorValues("giWbBehaviorOptions");
      if(!values.length){
        step.behaviors = sourceDefaultBehaviors(step.sourceKey || giCommonSourceKey(step.key));
      }else{
        step.behaviors = values;
      }
      step.behavior = step.behaviors[0];
      step.behaviorLabel = sourceBehaviorLabels(step.sourceKey || giCommonSourceKey(step.key), step.behaviors).join(", ");
    }
    saveCanvasState();
    render("generalinv");
    return;
  }
});

document.getElementById("promptRun")?.addEventListener("click",()=>render("home"));
document.getElementById("profileSwitcherBtn")?.addEventListener("click", openUserSelectModal);

function shutdownAllServers(){
  const confirmed = confirm("모든 서버를 종료하시겠습니까?\n실행 중인 분석 작업이 중단됩니다.");
  if(!confirmed) return;
  fetch("/api/shutdown", { method: "POST" })
    .then(() => {
      document.body.innerHTML = `<div style="display:grid;place-items:center;height:100vh;font-family:sans-serif;color:#475569">
        <div style="text-align:center">
          <div style="font-size:48px;margin-bottom:16px">⏻</div>
          <h2 style="margin:0 0 8px;color:#1e293b">서버가 종료되었습니다</h2>
          <p style="margin:0;color:#64748b">서버를 다시 시작한 후 페이지를 새로고침하세요.</p>
        </div>
      </div>`;
    })
    .catch(() => {
      alert("서버 종료 요청을 전송했습니다.");
    });
}

loadCanvasState();
// 저장 상태가 없으면 기본 사용자(u01) 권한으로 초기화
if(!localStorage.getItem(canvasStateKey)){
  const initGroup = userGroups.find(g => g.id === (sampleUsers.find(u => u.id === currentUserId)?.groupId)) || userGroups[0];
  userPermissions = buildGroupPermissions(initGroup);
}
renderSidebarPermissions();
syncSidebarCollapseIcons();
updateProfileDisplay();
updateAdminMenuVisibility();
render();
