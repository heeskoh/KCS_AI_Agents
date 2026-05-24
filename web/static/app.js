const pageNames = {
  home:"My AI 분석",
  canvas:"AI 작업 캔버스",
  profile:"기업 위험도 대시보드",
  classification:"품목분류",
  lawsearch:"법령·판례",
  document:"문서검증",
  dw:"DW 분석",
  model:"AI 모델",
  rag:"RAG",
  case:"사건 작업",
  report:"보고서",
  system:"시스템",
  governance:"거버넌스",
  permission:"권한 승인"
};

const COACH_PROMPT_PLACEHOLDER = "자연어로 질문을 입력하면 선택된 데이터 소스에 따라 AI가 답변을 제공합니다.\n기본은 LLM 자체 답변이며, 내부정보를 활용하실 때에는 하단의 데이터 소스나 Agent를 선택해 주세요.";
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
          <button class="home-tool-btn home-picker-trigger" type="button" data-home-source="rag_audit">업무별 RAG 선택 <span class="home-select-status">×</span></button>
          <button class="home-tool-btn home-picker-trigger" type="button" data-home-agent="hs_verify">Agent 선택 <span class="home-select-status">×</span></button>
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
        <p class="canvas-main-copy">다양한 데이터소스와 에이전트를 활용하여 나만의 분석을 수행합니다.</p>
        <div class="main-job-list">
          ${activeCanvasJobs().map(mainCanvasJob).join("") || `<div class="empty-state">진행 중인 분석 작업이 없습니다. 아카이브에서 완료된 결과를 확인할 수 있습니다.</div>`}
        </div>
      </section>

      <aside class="card home-special-card">
        <h3>전문 업무 분석</h3>
        <div class="special-analysis-list">
          <button class="special-analysis-btn red" data-page="profile">기업 위험도 대시보드</button>
          <button class="special-analysis-btn sky" data-page="classification">관세 조사 분석</button>
          <button class="special-analysis-btn rose" data-page="document">일반 수사 분석</button>
          <button class="special-analysis-btn purple" data-page="lawsearch">마약 수사 분석</button>
          <button class="special-analysis-btn teal" data-page="dw">위험선별 분석</button>
          <button class="special-analysis-btn green" data-page="rag">통관 정보분석</button>
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

  profile: () => riskDashboard(),

  classification: () => simplePage("품목분류 추천", "품명, 규격, 이미지, 과거 분류사례를 바탕으로 HS Code 후보와 판단근거를 추천합니다.", `
    <div class="query-box"><span>🧾</span><input value="전동식 모션베드의 품목분류 후보를 추천해줘"><button class="btn">추천</button></div>
    ${dataTable(["후보 HS","품명","추천근거","신뢰도"], [["9403.20","금속제 기타 가구","금속 프레임이 본질적 특성인 조절식 침대베이스","높음"],["9403.50","목제 침실가구","목재 구조가 본질적 특성인 경우","중간"],["9402.90","의료용 가구","병원·진료용으로 설계된 경우 한정","낮음"]])}
    <div class="summary-box"><b>AI 판단:</b> 일반 가정용 모션베드는 의료용 침대가 아니라 가구로 검토하고, 주요 재질과 본질적 특성에 따라 세부호를 결정합니다.</div>
  `),

  lawsearch: () => simplePage("법령·판례 검색", "관세법령, 고시·훈령, 품목분류 사례, 심판례·판례, 내부 유권해석을 RAG로 통합 검색합니다.", `
    <div class="query-box"><span>⚖</span><input value="저가신고와 로열티 누락 관련 법령과 유사 판례를 찾아줘"><button class="btn">검색</button></div>
    ${dataTable(["구분","검색 결과","활용"], [["관세법령","과세가격 결정 및 가산요소 관련 조항","법적 근거"],["심판례","로열티 지급과 과세가격 포함 여부 사례","쟁점 검토"],["내부사례","사후가격조정 조항 관련 심사 사례","조사 방향"]])}
  `),

  document: () => simplePage("문서검증센터", "비정형 문서를 OCR/LLM으로 인식하고 DB 값과 비교합니다.", `${dataTable(["추출항목","문서값","DB값","판정"], [["품명","Power Module","Power Module","일치"],["단가","USD 120","USD 98","불일치"],["Incoterms","CIF","FOB","불일치"],["로열티","존재","미신고","확인필요"]])}`),
  dw: () => simplePage("데이터 분석실(DW)", "자연어를 SQL/분석절차로 변환하여 DW 데이터를 조회·시각화합니다.", `${barChart([70,55,80,42,65,38,88,48])}`),
  model: () => simplePage("AI 모델센터", "LLM, ML, Vision, Graph 모델을 업무별로 관리하고 실행합니다.", `${dataTable(["모델명","적용업무","출력","상태"], [["위험화물 선별모델","물류·감시","위험점수","운영중"],["저가신고 탐지모델","관세조사","이상도","운영중"],["마약 은어 탐지모델","관세수사","의심대화","운영중"]])}`),
  rag: () => simplePage("RAG 지식센터", "조사·심사보고서, 법령, 판례, 내부 매뉴얼을 통합 검색합니다.", `${dataTable(["지식구분","문서수","활용업무"], [["조사보고서","128,450","관세조사·수사"],["심사사례","83,210","통관·심사"],["법령·훈령","12,840","전 업무"]])}`),
  case: () => simplePage("사건 작업공간", "사건 단위로 자료와 AI 분석결과를 관리합니다.", `<div class="split"><div class="card"><h3>ABC전자 관세가격 조사</h3><p>위험도 <b class="high">82점</b> · 진행률 65%</p></div><div class="card"><h3>다음 권고 조치</h3><p>로열티 계약서, 송금내역, 이전가격 정책문서 추가 요청</p></div></div>`),
  report: () => simplePage("보고서 생성센터", "AI 캔버스 블록을 조합해 조사보고서를 생성합니다.", `<button class="btn">조사보고서 초안 생성</button>`),
  system: () => simplePage("시스템 관리", "연계시스템, 데이터 파이프라인, 사용자 권한, 보안정책을 관리합니다.", ""),
  governance: () => simplePage("모델·권한·감사 로그", "AI 모델 사용 이력, 프롬프트 로그, 승인 프로세스를 점검합니다.", ""),
  permission: () => permissionApprovePage()
};

function notice(t,d,time){return `<div class="notice"><b>${t}</b><span class="muted" style="float:right">${time}</span><p>${d}</p><a>자세히 보기</a></div>`}
function task(t,d){return `<div class="task"><b>${t}</b><p class="muted">${d}</p></div>`}
function mainCanvasJob(job){
  const { title, company, owner, updated, companyId, isNew } = job;
  const status = job.status || {};
  const meta = `${company} · ${owner} · ${updated}`;
  return `
    <article class="main-job-card ${isNew ? "new" : ""}" data-canvas-company="${companyId}" data-open-company-profile="true">
      <div class="main-job-head">
        <div>
          <h3>${title}</h3>
          <p>${meta}</p>
        </div>
        <span class="job-status ${status.tone}">${status.label}</span>
      </div>
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
          <p class="muted">사용자가 요청한 데이터소스·Agent 사용 권한을 검토하고 승인 또는 거부합니다.</p>
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

const scenarioSources = {
  // ── 분석 데이터 소스 ────────────────────────────────────────────────────────
  db_cdw:          { label: "CDW 조회",         type: "db",            group: "분석 데이터 소스" },
  rag_customs:     { label: "관세e음 RAG",       type: "rag_customs",   group: "분석 데이터 소스" },
  rag_trade:       { label: "통관정보 RAG",      type: "rag_trade",     group: "분석 데이터 소스" },
  rag_audit:       { label: "심사정보 RAG",      type: "rag_audit",     group: "분석 데이터 소스" },
  rag_investigation:{ label: "조사정보 RAG",     type: "rag_investigation", group: "분석 데이터 소스" },
  rag_global:      { label: "국제정보 RAG",      type: "rag_global",    group: "분석 데이터 소스" },
  // ── 사용 가능 Agent ─────────────────────────────────────────────────────────
  ml:              { label: "ML 모델 실행 Agent",  type: "ml",               group: "사용 가능 Agent" },
  network:         { label: "관계망 분석 Agent",   type: "network",          group: "사용 가능 Agent" },
  ontology:        { label: "관세온톨로지 Agent",  type: "ontology",         group: "사용 가능 Agent" },
  web_search:      { label: "웹검색 Agent",        type: "web",              group: "사용 가능 Agent" },
  declaration_verify:{ label:"수입신고검증 Agent", type: "declaration_verify",group: "사용 가능 Agent" },
  hs_verify:       { label: "품목분류검증 Agent",  type: "hs_verify",        group: "사용 가능 Agent" },
  customs_value:   { label: "과세가격평가 Agent",  type: "customs_value",    group: "사용 가능 Agent" },
  patent:          { label: "특허정보 조회 Agent", type: "patent",           group: "사용 가능 Agent" },
  law:             { label: "법령정보 조회 Agent", type: "law",              group: "사용 가능 Agent" },
  ocr:             { label: "OCR/문서인식 Agent",  type: "ocr",              group: "사용 가능 Agent" },
  rag_create:      { label: "RAG 생성 Agent",      type: "rag_create",       group: "사용 가능 Agent" },
  summary:         { label: "보고서 요약 Agent",   type: "summary",          group: "사용 가능 Agent" },
  report_generate: { label: "보고서 생성 Agent",   type: "report",           group: "사용 가능 Agent" },
  report_validate: { label: "보고서 검증 Agent",   type: "validation",       group: "사용 가능 Agent" },
};

const sidebarPermissionGroups = {
  dataSources: ["db_cdw", "rag_customs", "rag_trade", "rag_audit", "rag_investigation", "rag_global"],
  agents: ["web_search", "declaration_verify", "hs_verify", "customs_value", "ml", "network", "ontology", "patent", "law", "ocr", "rag_create", "summary", "report_generate", "report_validate"],
};

const ALL_RAG    = ["db_cdw","rag_customs","rag_trade","rag_audit","rag_investigation","rag_global"];
const ALL_AGENTS = ["web_search","declaration_verify","hs_verify","customs_value","ml","network","ontology","patent","law","ocr","rag_create","summary","report_generate","report_validate"];

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

const defaultUserPermissions = {
  db_cdw: "granted",
  rag_customs: "granted",
  rag_trade: "granted",
  rag_audit: "granted",
  rag_investigation: "granted",
  rag_global: "granted",
  ocr: "granted",
  ml: "granted",
  network: "granted",
  ontology: "granted",
  web_search: "granted",
  declaration_verify: "granted",
  hs_verify: "granted",
  customs_value: "granted",
  summary: "granted",
  patent: "granted",
  rag_create: "granted",
  law: "granted",
  report_generate: "granted",
  report_validate: "granted",
};

const sourceDefaultConfig = {
  db_cdw: {
    defaultInstruction: "기업 프로파일, 최근 수입신고, 위험지표를 종합 요약",
    behaviorOptions: [
      { value: "profile_summary", label: "기업/신고 요약" },
      { value: "risk_focus", label: "위험지표 중심" },
      { value: "declaration_focus", label: "신고내역 중심" },
    ],
  },
  rag_customs: {
    defaultInstruction: "과세가격, 원산지, 품목분류 관련 규정 근거 확인",
    behaviorOptions: [
      { value: "regulation_basis", label: "규정 근거 확인" },
      { value: "case_comparison", label: "유사사례 비교" },
    ],
  },
  rag_trade: {
    defaultInstruction: "통관/무역 정보에서 이상 징후와 참고 근거 확인",
    behaviorOptions: [
      { value: "trade_signal", label: "무역 징후 확인" },
      { value: "market_context", label: "시장 맥락 확인" },
    ],
  },
  rag_audit: {
    defaultInstruction: "감사 정보와 추징 가능성 관점의 조사 포인트 정리",
    behaviorOptions: [
      { value: "audit_case", label: "감사사례 비교" },
      { value: "recovery_point", label: "추징 포인트" },
    ],
  },
  rag_investigation: {
    defaultInstruction: "조사 정보 기반으로 조사 순서와 확인 자료 정리",
    behaviorOptions: [
      { value: "investigation_plan", label: "조사계획 수립" },
      { value: "evidence_check", label: "증빙 체크" },
    ],
  },
  rag_global: {
    defaultInstruction: "국제 정보 기반으로 해외 거래구조와 위험 신호 확인",
    behaviorOptions: [
      { value: "global_signal", label: "국제 위험신호" },
      { value: "counterparty", label: "해외거래처 확인" },
    ],
  },
  ml: {
    defaultInstruction: "전체 모델을 실행해 위험 패턴을 비교",
    behaviorOptions: [
      { value: "all_models", label: "전체 모델 실행" },
      { value: "industry_stats", label: "동종업종 통계" },
      { value: "hs_risk", label: "HS 위험점수" },
      { value: "hs_recommend", label: "품목분류 추천" },
      { value: "anomaly", label: "이상치 탐색" },
    ],
  },
  ontology: {
    defaultInstruction: "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성",
    behaviorOptions: [
      { value: "traveler_ontology", label: "우범여행자 온톨로지" },
      { value: "cargo_relation", label: "화물 관계 분석" },
      { value: "semantic_rules", label: "추론 규칙 생성" },
    ],
  },
  web_search: {
    defaultInstruction: "업체, 공급망, 가격 변동 관련 기사 확인",
    behaviorOptions: [
      { value: "company_news", label: "업체 기사" },
      { value: "supply_chain", label: "공급망/가격" },
      { value: "industry_news", label: "동종업종 기사" },
    ],
  },
  declaration_verify: {
    defaultInstruction: "수입신고 항목과 문서/DB 간 불일치 여부 확인",
    behaviorOptions: [
      { value: "declaration_consistency", label: "신고 정합성" },
      { value: "missing_evidence", label: "누락 증빙" },
    ],
  },
  hs_verify: {
    defaultInstruction: "HS 코드 분류 적정성과 대체 후보 검토",
    behaviorOptions: [
      { value: "classification_check", label: "분류 적정성" },
      { value: "alternative_hs", label: "대체 HS 후보" },
    ],
  },
  customs_value: {
    defaultInstruction: "과세가격 결정 요소와 저가신고 가능성 검토",
    behaviorOptions: [
      { value: "valuation_basis", label: "과세가격 근거" },
      { value: "undervaluation", label: "저가신고 탐지" },
    ],
  },
  summary: {
    defaultInstruction: "선행 단계 결과를 조사관용 핵심 요약으로 정리",
    behaviorOptions: [
      { value: "brief", label: "핵심 요약" },
      { value: "evidence_table", label: "근거 표 정리" },
    ],
  },
  patent: {
    defaultInstruction: "특허/로열티 관련 거래와 과세가격 반영 여부 확인",
    behaviorOptions: [
      { value: "royalty_check", label: "로열티 확인" },
      { value: "patent_lookup", label: "특허 정보 조회" },
    ],
  },
  rag_create: {
    defaultInstruction: "선택 자료를 RAG 지식으로 구성하기 위한 항목 정리",
    behaviorOptions: [
      { value: "knowledge_build", label: "지식 생성" },
      { value: "source_cleanup", label: "자료 정제" },
    ],
  },
  law: {
    defaultInstruction: "관련 법령, 고시, 판례, 유권해석 근거 검색",
    behaviorOptions: [
      { value: "law_basis", label: "법령 근거" },
      { value: "precedent", label: "판례/유권해석" },
    ],
  },
  report_generate: {
    defaultInstruction: "이전 단계 결과를 공식 조사보고서 초안으로 통합",
    behaviorOptions: [
      { value: "full_report", label: "전체 보고서" },
      { value: "issue_report", label: "쟁점 중심 보고서" },
    ],
  },
  report_validate: {
    defaultInstruction: "보고서의 근거 충실성, 과도한 추론, URL/출처를 검증",
    behaviorOptions: [
      { value: "evidence_validation", label: "근거 검증" },
      { value: "risk_review", label: "리스크 리뷰" },
    ],
  },
};

function scenarioSourceEntries(){
  return Object.entries(scenarioSources).map(([key, source]) => ({
    key,
    ...source,
    ...(sourceDefaultConfig[key] || {}),
  }));
}

function scenarioSourceByKey(key){
  return scenarioSourceEntries().find(source => source.key === key) || scenarioSources[key] || null;
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

function sourceDefaultInstruction(key){
  return scenarioSourceByKey(key)?.defaultInstruction || "";
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
    instruction: item.instruction || sourceDefaultInstruction(key),
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
      { key:"ml", type:"ml", label:"ML 모델 실행 Agent", behaviors:["industry_stats","hs_risk"], order:4, instruction:"동종업종 통계와 HS 위험점수를 함께 비교" },
      { key:"report_generate", type:"report", label:"보고서 생성 Agent", behaviors:["full_report"], order:5, instruction:"이전 단계 결과를 공식 조사보고서 초안으로 통합" },
    ],
  },
  {
    id: "valuation-focused",
    name: "저가신고 집중 템플릿",
    description: "과세가격, 특수관계, 가격 이상치 검토에 집중하는 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["risk_focus","declaration_focus"], order:1, instruction:"위험지표와 신고내역을 함께 상세 확인" },
      { key:"customs_value", type:"customs_value", label:"과세가격평가 Agent", behaviors:["valuation_basis","undervaluation"], order:2, instruction:"과세가격 결정 요소와 저가신고 가능성 검토" },
      { key:"rag_customs", type:"rag_customs", label:"관세e음 RAG", behaviors:["regulation_basis","case_comparison"], order:3, instruction:"관련 규정과 유사사례를 함께 확인" },
      { key:"ml", type:"ml", label:"ML 모델 실행 Agent", behaviors:["anomaly","hs_risk"], order:4, instruction:"신고가격 이상치와 HS 위험점수 확인" },
      { key:"report_generate", type:"report", label:"보고서 생성 Agent", behaviors:["issue_report"], order:5, instruction:"저가신고 쟁점 중심 보고서 초안 작성" },
    ],
  },
  {
    id: "classification-origin",
    name: "품목분류·원산지 템플릿",
    description: "HS 분류, 원산지, FTA 증빙 검토에 맞춘 조사 흐름",
    items: [
      { key:"db_cdw", type:"db", label:"CDW 조회", behaviors:["declaration_focus"], order:1, instruction:"품목, 원산지, 신고가격 중심으로 최근 신고내역 확인" },
      { key:"hs_verify", type:"hs_verify", label:"품목분류검증 Agent", behaviors:["classification_check","alternative_hs"], order:2, instruction:"HS 코드 분류 적정성과 대체 후보 검토" },
      { key:"rag_customs", type:"rag_customs", label:"관세e음 RAG", behaviors:["regulation_basis"], order:3, instruction:"품목분류와 원산지 관련 규정 확인" },
      { key:"law", type:"law", label:"법령정보 조회 Agent", behaviors:["law_basis","precedent"], order:4, instruction:"관련 법령, 고시, 유권해석 근거 검색" },
      { key:"report_validate", type:"validation", label:"보고서 검증 Agent", behaviors:["evidence_validation"], order:5, instruction:"근거 충실성과 누락 증빙 검증" },
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
};
const COACH_AGENT_LABELS = {
  ocr:"OCR", ml:"ML 위험모델", network:"관계망", ontology:"관세온톨로지", web:"웹검색",
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
}

/* ── 홈 분석 실행 (실제 워크플로 스트리밍) ── */
const HOME_DEFAULT_AGENTS = [
  { type:"db",                 label:"CDW 조회",              key:"db_cdw" },
  { type:"rag_customs",        label:"관세e음 RAG",           key:"rag_customs" },
  { type:"rag_trade",          label:"통관정보 RAG",          key:"rag_trade" },
  { type:"rag_audit",          label:"심사정보 RAG",          key:"rag_audit" },
  { type:"rag_investigation",  label:"조사정보 RAG",          key:"rag_investigation" },
  { type:"rag_global",         label:"국제정보 RAG",          key:"rag_global" },
  { type:"web",                label:"웹검색 Agent",          key:"web_search" },
  { type:"declaration_verify", label:"수입신고검증 Agent",    key:"declaration_verify" },
  { type:"hs_verify",          label:"품목분류검증 Agent",    key:"hs_verify" },
  { type:"customs_value",      label:"과세가격평가 Agent",    key:"customs_value" },
  { type:"ml",                 label:"ML 모델 실행 Agent",    key:"ml" },
  { type:"network",            label:"관계망분석 Agent",      key:"network" },
  { type:"ontology",           label:"관세온톨로지 Agent",    key:"ontology" },
  { type:"patent",             label:"특허정보 조회 Agent",   key:"patent" },
  { type:"law",                label:"법령정보 조회 Agent",   key:"law" },
  { type:"ocr",                label:"OCR/문서인식 Agent",    key:"ocr" },
  { type:"rag_create",         label:"RAG 생성 Agent",        key:"rag_create" },
  { type:"summary",            label:"보고서 요약 Agent",     key:"summary" },
  { type:"report",             label:"보고서 생성 Agent",     key:"report_generate" },
  { type:"validation",         label:"보고서 검증 Agent",     key:"report_validate" },
];

let homeEventSource = null;
let homeRunResults = {};   // { result_key: text }
let homeStepStatus = {};   // { label: "running"|"done"|"error" }

function homeSelectedAnalysisOptions(){
  const sources = Array.from(document.querySelectorAll("[data-home-source].selected"))
    .map(btn => btn.dataset.homeSource)
    .filter(Boolean);
  const agents = Array.from(document.querySelectorAll("[data-home-agent].selected"))
    .map(btn => btn.dataset.homeAgent)
    .filter(Boolean);
  return { sources:[...new Set(sources)], agents:[...new Set(agents)] };
}

function homeAgentDefForKey(key){
  return HOME_DEFAULT_AGENTS.find(agent => agent.key === key || agent.type === key) || null;
}

function homeRunAgentsFromSelection(selection){
  const keys = [...(selection.sources || []), ...(selection.agents || [])];
  return keys.map(homeAgentDefForKey).filter(Boolean);
}

function homeToggleAnalysisOption(button){
  if(!button) return;
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
      ${html || `<div class="home-detail-body muted">실행할 RAG 또는 Agent 결과가 아직 없습니다.</div>`}
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
        ${escapeHtml(reasoning || "내부 에이전트 없이 LLM이 직접 답변합니다.")}
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
        <span>${hasSelectedInternalTool ? "선택된 데이터소스와 Agent를 준비합니다." : "선택된 데이터소스/Agent가 없어 LLM 자체 답변으로 처리합니다."}</span>
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
    homeShowLlmAnswer(prompt, answer, "선택된 데이터소스/Agent 없음 · LLM 자체 답변", btn);
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
        실행 에이전트: ${escapeHtml(agentNames)}
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
  const reportText = homeRunResults["보고서 생성"] || "";
  const mlText     = Object.values(homeRunResults).find((_v, _i) =>
    Object.keys(homeRunResults)[_i] === "ML 위험모델") || homeRunResults["ML 위험모델"] || "";
  const dvText     = homeRunResults["수입신고검증"] || "";

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
  const summary = summaryLines || "분석이 완료되었습니다. 각 에이전트의 분석 결과는 아래 상세 결과에서 확인하실 수 있습니다.";

  const agentCount = Object.keys(homeStepStatus).length;
  const hasReport  = "보고서 생성" in homeRunResults;
  const targetSummary = displayCompanyId
    ? `대상 기업 <b>${escapeHtml(displayCompanyId)}</b> · `
    : "";

  resultBox.innerHTML = `
    <h3>AI 분석 결과</h3>
    <p>${targetSummary}${agentCount}개 에이전트 분석 완료${coachAttachedFiles.length ? ` · 첨부 파일 ${coachAttachedFiles.length}건 활용` : ""}</p>
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
    }));
  }catch(error){
    console.warn("진행작업 상태를 저장하지 못했습니다.", error);
  }
}

function saveCurrentUserWorkspace(){
  if(!currentUserId) return;
  userWorkspaces[currentUserId] = {
    ...(userWorkspaces[currentUserId] || {}),
    activeCanvasCompanyId,
    activeScenarioTemplateId,
    canvasTab,
    latestReport,
    latestValidation,
    updatedAt: new Date().toISOString(),
  };
}

function restoreUserWorkspace(userId){
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
  canvasTab = workspace.canvasTab || "overview";
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
    perms[key] = (group.rag.includes(key) || group.agents.includes(key)) ? "granted" : "locked";
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

function canvasPage(){
  return `
    <section class="card canvas-hub">
      <div class="canvas-main-head">
        <div>
          <h2>AI 작업 캔버스</h2>
          <p class="muted">진행 중인 분석 작업을 확인하고, 각 작업의 프로파일·데이터 수집·시나리오·보고서 단계로 바로 진입합니다.</p>
        </div>
      </div>
      <div class="canvas-inner-tabs">
        <button class="${canvasTab === "overview" ? "active" : ""}" data-canvas-tab="overview">진행 작업</button>
        <button class="${canvasTab === "profile" ? "active" : ""}" data-canvas-tab="profile">기업프로파일</button>
        <button class="${canvasTab === "data" ? "active" : ""}" data-canvas-tab="data">데이터 수집</button>
        <button class="${canvasTab === "scenario" ? "active" : ""}" data-canvas-tab="scenario">분석 시나리오 설정 및 수행</button>
        <button class="${canvasTab === "report" ? "active" : ""}" data-canvas-tab="report">분석보고서 및 검증</button>
        <button class="scenario-template-tab ${canvasTab === "templates" ? "active" : ""}" data-canvas-tab="templates">분석 시나리오 템플릿</button>
      </div>
      <div class="canvas-tab-body">
        ${canvasTabContent()}
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
      company:"서울인터내셔널 (C-1002)",
      owner:"심사정보 RAG Agent",
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
      company:"제주리테일커머스 (C-1008)",
      owner:"보고서 생성 Agent",
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

function archivedCanvasJobs(){
  return visibleCanvasJobs().filter(isArchivedJob);
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

function activeCanvasCompany(){
  const listedCompany = findCompanyById(activeCanvasCompanyId);
  const job = activeCanvasJob();
  return {
    company_id: activeCanvasCompanyId,
    company_name: listedCompany?.company_name || job?.companyName || activeCanvasCompanyId,
    risk_level: listedCompany?.risk_level || (activeCanvasCompanyId === "C-1002" ? "HIGH" : activeCanvasCompanyId === "C-1008" ? "LOW" : "MEDIUM"),
    risk_score: listedCompany?.risk_score ?? (activeCanvasCompanyId === "C-1002" ? 82.7 : activeCanvasCompanyId === "C-1008" ? 44.6 : 58.4),
    annual_import_amount: listedCompany?.annual_import_amount,
    declared_duty_amount: listedCompany?.declared_duty_amount,
  };
}

function currentRunArchive(companyId = activeCanvasCompanyId){
  return canvasRunArchives[companyId] || null;
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
    })
    .catch(error => {
      scenarioCompaniesLoading = false;
      const picker = document.getElementById("newScenarioCompanySelect");
      if(picker) picker.innerHTML = `<option value="">기업 프로파일 로드 실패</option>`;
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
    })
    .catch(err => {
      companyDetailCache[companyId] = { error: String(err), loading: false };
      if(canvasTab === "profile") render("canvas");
    });
}

function canvasOverviewPanel(){
  const selected = activeCanvasCompany();
  const jobs = activeCanvasJobs();
  const archived = archivedCanvasJobs();
  return `
    <div class="canvas-overview-toolbar">
      <div>
        <strong>선택 기업: ${escapeHtml(selected.company_name)} (${escapeHtml(selected.company_id)})</strong>
        <p class="muted">진행 중인 박스를 선택하면 뒤쪽 탭의 기준 기업이 함께 변경됩니다.</p>
      </div>
      <div class="new-scenario-picker">
        <button class="btn" data-new-scenario-button="true">새 분석 시나리오</button>
        ${showScenarioCompanyPicker ? `
          <label class="new-scenario-company">
            <span>분석 대상 기업</span>
            <select id="newScenarioCompanySelect">
              ${companyOptionsHtml()}
            </select>
          </label>
        ` : ""}
      </div>
    </div>
    <div class="job-board">
      ${jobs.map(job => {
        const isDone = isCompletedActiveJob(job);
        const total = job.status.total ?? "?";
        const done  = job.status.done  ?? 0;
        return `
        <article class="job-card ${job.companyId === activeCanvasCompanyId ? "active" : ""} ${job.isNew ? "new" : ""} ${job.scenarioChanged ? "changed" : ""}" data-canvas-company="${job.companyId}" data-open-company-profile="true" tabindex="0" role="button">
          <div class="job-card-head">
            <div>
              <h3>${job.title}</h3>
              <p class="muted">${job.company} · ${job.owner} · ${job.updated}</p>
            </div>
            <div class="job-status-row">
              <span class="job-status ${job.status.tone}">${job.status.label}</span>
              ${isDone ? `<button class="btn-inline-action" data-archive-job="${escapeHtml(job.companyId)}" title="아카이브로 저장">아카이브</button>` : ""}
              <button class="btn-inline-action job-remove-action" data-remove-job="${escapeHtml(job.companyId)}" title="내 진행작업에서 삭제">삭제</button>
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

function canvasProfilePanel(){
  const companyId = activeCanvasCompanyId;
  const cache = companyDetailCache[companyId];

  if(!cache || cache.loading){
    return `
      <div class="canvas-selected-company">
        <span>선택 기업</span>
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
  const archive = currentRunArchive(companyId);
  const job = canvasJobs().find(item => item.companyId === companyId);
  const changed = Boolean(job?.scenarioChanged);

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
      <span>선택 기업</span>
      <strong>${escapeHtml(c.company_name || companyId)} (${escapeHtml(companyId)})</strong>
    </div>

    <div class="profile-run-archive ${changed ? "changed" : ""}">
      <div>
        <strong>${archive ? "저장된 직전 분석 결과" : "저장된 분석 결과 없음"}</strong>
        <p>${archive ? `${escapeHtml(archive.savedAt)} 저장 · 로그 ${Object.keys(archive.stepOutputs || {}).length}건` : "분석 시나리오를 실행하면 이 기업의 결과와 로그가 자동 저장됩니다."}</p>
        ${changed ? `<em>시나리오가 변경되었습니다. 기존 결과는 보존되며, 최신 조건으로 보려면 다시 실행하세요.</em>` : ""}
      </div>
      <div class="profile-run-actions">
        ${archive ? `<button class="btn secondary" data-canvas-tab="report">저장 결과 보기</button>` : ""}
        <button class="btn" data-canvas-tab="scenario">${changed ? "변경 시나리오 실행" : "분석 시나리오 설정"}</button>
      </div>
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

function canvasDataPanel(){
  const company = activeCanvasCompany();
  return `
    <section class="data-upload-board">
      <div class="canvas-selected-company">
        <span>선택 기업</span>
        <strong>${escapeHtml(company.company_name)} (${escapeHtml(company.company_id)})</strong>
      </div>
      <h3>AI 비정형 데이터 업로드 및 예외 관리기능</h3>
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
              <th>활용 Agent</th>
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
              agents:["RAG생성Agent"],
              result:"처리중",
              status:"분석중",
              tone:"running"
            })}
          </tbody>
        </table>
      </div>
    </div>
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
  if(!templateEditorItems.length) return `<li class="template-empty-step">왼쪽에서 Agent 단계를 선택 후 추가하세요.</li>`;
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
            <span>Agent 단계</span>
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
                <div><h3>새 템플릿</h3><p>Agent 단계를 추가하여 새 템플릿을 만드세요.</p></div>
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
  return `
    <section class="card scenario-workbench scenario-workbench-v2">
      <div class="scenario-title-row">
        <div>
          <h3>${escapeHtml(company.company_name)} 분석 시나리오 설정 및 실행</h3>
          <p class="muted">템플릿을 불러온 뒤 기업별 조사 목적에 맞게 단계, 동작, 추가 지시를 조정합니다. <em style="color:#0369a1;font-style:normal;font-weight:700">아카이브 전에는 언제든지 시나리오를 수정하고 재실행할 수 있습니다.</em></p>
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
              <button id="scenarioTemplateApplyButton" type="button" class="btn scenario-template-apply-btn">템플릿 적용하기</button>
            </div>
            <select id="scenarioTemplateSelect" class="scenario-template-select">${scenarioTemplateOptionsHtml()}</select>
          </div>

          <div class="scenario-agent-zone">
            <label class="scenario-field">
              <span>Agent 단계</span>
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
            <button id="scenarioAddButton" type="button" class="btn">단계 추가</button>
            <button id="scenarioDeleteButton" type="button" class="btn secondary" disabled>선택 삭제</button>
          </div>
          <button id="scenarioSaveButton" type="button" class="btn secondary scenario-save-bottom">신규 템플릿으로 등록</button>
        </aside>

        <section class="scenario-log">
          <div class="scenario-log-head">
            <h3>분석 실행 로그</h3>
            <div class="scenario-log-actions">
              <button id="scenarioRunButton" type="button" class="btn">분석 실행</button>
              <button id="scenarioClearButton" type="button" class="btn secondary">결과 지우기</button>
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

// ── 기업 위험도 대시보드 ──────────────────────────────────────────────

function riskDashboard(){
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
    underval : cnt("undervaluation_suspicion_rate", 50) * 3 + cnt("undervaluation_suspicion_rate", 30) * 1,
    hs       : cnt("hs_classification_error_rate", 40) * 5 + cnt("hs_classification_error_rate", 20) * 2,
    royalty  : cnt("related_party_anomaly_rate", 50) * 3 + cnt("related_party_anomaly_rate", 30) * 1,
    forex    : cnt("offshore_fund_concealment_suspicion_rate", 50) * 2,
    refund   : cnt("customs_refund_anomaly_rate", 40) * 3 + cnt("customs_refund_anomaly_rate", 20) * 1,
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

function riskAlertCard(label, count){
  return `
    <div class="risk-alert-item">
      <span>${label}</span>
      <strong>${count} <small>건</small></strong>
    </div>`;
}

function riskCompanyCard(c){
  const score = c.risk_score || 0;
  const level = c.risk_level || "LOW";
  const cls   = level === "HIGH" ? "danger" : level === "MEDIUM" ? "warn" : "safe";
  const badge = level === "HIGH" ? "조사검토필요" : level === "MEDIUM" ? "경계필요" : "양호";

  const tags = companyRiskTags(c);
  const visibleTags = tags.slice(0,2).map(t => `<span class="risk-tag">${escapeHtml(t)}</span>`).join("");
  const moreTags = tags.length > 2 ? `<span class="risk-tag more">+${tags.length-2}개 로직</span>` : "";

  const riskChange = (((c.undervaluation_suspicion_rate||0) + (c.offshore_fund_concealment_suspicion_rate||0)) / 17).toFixed(1);
  const scoreClass = level === "HIGH" ? "high" : level === "LOW" ? "good" : "";

  return `
    <div class="risk-company-card ${cls}">
      <div class="risk-card-head">
        <span class="risk-card-badge ${cls}">${badge}</span>
      </div>
      <div class="risk-card-name">
        <strong>${escapeHtml(c.company_name || c.company_id)}</strong>
        <span class="muted">#TRG-26-${escapeHtml(c.company_id.replace("C-",""))} | ${escapeHtml(industryLabel(c.industry_code))}</span>
      </div>
      <div class="risk-card-scores">
        <div>
          <span class="muted">위험도점수</span>
          <strong class="${scoreClass}">${score.toFixed(1)}</strong>
        </div>
        <div>
          <span class="muted">위험도변화</span>
          <strong class="${level==="HIGH"?"high":""}">${riskChange} ↑</strong>
        </div>
      </div>
      <div class="risk-card-tags">${visibleTags}${moreTags}</div>
      <div class="risk-card-review">
        <span class="muted">검토내용</span>
        <p>${companyReviewText(c)}</p>
      </div>
      <button class="btn secondary" style="margin-top:4px;width:100%"
        data-page="canvas" data-canvas-company="${escapeHtml(c.company_id)}" data-canvas-tab="profile">
        캔버스 분석 진입
      </button>
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
    if(grid) grid.innerHTML = filtered.map(riskCompanyCard).join("") || '<div class="empty-state">검색 조건에 맞는 기업이 없습니다.</div>';
  });

  scoreSelect.addEventListener("change", () => {
    riskDashboardFilter.minScore = parseInt(scoreSelect.value, 10);
    render("profile");
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
  const instruction = item.instruction || sourceDefaultInstruction(item.key) || "기본 분석";
  return `[동작 선택]\n- ${behaviors.join("\n- ")}\n\n${instruction}`;
}

function scenarioInstructionPreview(item){
  const behaviors = sourceBehaviorLabels(item.key, item.behaviors);
  const instruction = item.instruction || sourceDefaultInstruction(item.key) || "기본 분석";
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
  const item = selectedScenarioItem();
  if(!item) return;
  item.instruction = value;
  saveCompanyScenario();
  renderScenarioList();
}

function updateSelectedScenarioBehaviors(){
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
    behaviors: Array.isArray(item.behaviors) && item.behaviors.length ? item.behaviors : sourceDefaultBehaviors(item.key),
    behavior: (Array.isArray(item.behaviors) && item.behaviors.length ? item.behaviors : sourceDefaultBehaviors(item.key))[0],
    behaviorLabel: sourceBehaviorLabels(item.key, item.behaviors).join(", "),
    instruction: scenarioRunInstruction(item),
  }));
  return {
    scenario_items: runItems,
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
}

function runScenarioWorkflow(){
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
  contentEl.classList.toggle("content-fill", page === "canvas" && canvasTab === "report");
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
    patchCanvasJob(companyId, { archived: true, archivedAt: new Date().toLocaleString("ko-KR") });
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
    alert("권한 요청이 등록되었습니다. 승인 전까지 해당 데이터소스/Agent를 포함한 분석은 실행할 수 없습니다.");
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
    const restoredArchive = canvasRunArchives[companyId];
    const restoredTotal = restoredArchive?.scenarioItems?.length || 7;
    patchCanvasJob(companyId, {
      archived:false,
      scenarioChanged:false,
      status:{ label:"대기", tone:"wait", pct:0, done:0, total:restoredTotal },
      tab:"profile",
      updated:"방금",
    });
    activeCanvasCompanyId = companyId;
    canvasTab = "overview";
    render("canvas");
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
  const scenarioCompanySelect = event.target.closest("#newScenarioCompanySelect");
  if(scenarioCompanySelect){
    if(!scenarioCompanySelect.value) return;
    activeCanvasCompanyId = scenarioCompanySelect.value;
    const selectedCompany = findCompanyById(activeCanvasCompanyId) || { company_id:activeCanvasCompanyId, company_name:activeCanvasCompanyId };
    createCanvasJob(selectedCompany);
    showScenarioCompanyPicker = false;
    canvasTab = "profile";
    scenarioInitialized = false;
    scenarioLoadedForCompany = null;
    scenarioItems = [];
    saveCanvasState();
    render("canvas");
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
