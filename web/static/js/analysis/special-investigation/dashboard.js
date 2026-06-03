import { escapeHtml } from "../../core/dom.js";
import { specialInvestigationState } from "./state.js";

export function renderDashboardPanel(){
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
    const isOpen  = specialInvestigationState.drugAccordionOpen[ind.key] !== false;
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

export const dashboardSubtab = {
  id: "dashboard",
  label: context => context.config.dashboardTab,
  group: "tools",
  aiServices: ["ml", "abnormal_trade", "network"],
  render: renderDashboardPanel,
};
