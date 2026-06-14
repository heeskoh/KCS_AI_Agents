import { dataTable, escapeHtml } from "../../core/dom.js";
import { specialInvestigationState } from "./state.js";

function drugContextHeader(ctx, title, desc){
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
        <small>${escapeHtml(ctx.case.caseId)} · ${escapeHtml(ctx.type.label)}</small>
      </div>
    </div>
  `;
}

function drugSubTabNav(group, active, tabs){
  return `
    <div class="drug-subtabs">
      ${tabs.map(t => `
        <button type="button" class="${active === t.key ? "active" : ""}"
          data-drug-subtab="${escapeHtml(group)}:${escapeHtml(t.key)}">
          ${escapeHtml(t.label)}
        </button>
      `).join("")}
    </div>
  `;
}

export function renderForensicPanel(deps, uctx){
  // 정규화된 대상 컨텍스트(ctx.target)를 사용해 어느 업무에서든 현재 대상으로 렌더한다.
  const ctx = uctx?.target;
  if(!ctx) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const tabs = [
    {key:"dashboard", label:"종합 분석 대시보드"},
    {key:"money", label:"자금흐름"},
    {key:"account", label:"계좌관계"},
    {key:"suspicious", label:"의심거래 탐지"},
    {key:"comm", label:"통신관계"},
    {key:"crypto", label:"가상자산 흐름"},
    {key:"cash", label:"현금인출 패턴"},
    {key:"movement", label:"이동경로 동선"},
    {key:"social", label:"SNS/다크웹"},
    {key:"message", label:"메시지/대화"},
    {key:"location", label:"사진정보 기반 위치/관계인"},
    {key:"device", label:"디바이스 사용 이력"},
  ];
  if(!tabs.some(t => t.key === specialInvestigationState.drugForensicSubTab)) specialInvestigationState.drugForensicSubTab = "dashboard";
  const txData = ctx.targetType === "company" ? [
    {date:"2026-05-28",from:ctx.targetName,to:"해외 공급자",  amount:"USD 12,000",type:"해외송금",risk:"고위험",riskScore:95},
    {date:"2026-05-26",from:"김우범",to:ctx.targetName,amount:"₩15,000,000",type:"법인이체",risk:"고위험",riskScore:93},
    {date:"2026-05-20",from:ctx.targetName,to:"불상 계좌", amount:"₩ 5,500,000",type:"ATM출금", risk:"의심",riskScore:81},
    {date:"2026-05-15",from:"박공범",to:ctx.targetName,amount:"₩ 2,800,000",type:"분산입금",risk:"의심",riskScore:88},
  ] : [
    {date:"2026-05-28",from:ctx.targetName,to:"박공범",  amount:"₩ 2,800,000",type:"현금이체",risk:"의심",riskScore:88},
    {date:"2026-05-26",from:ctx.targetName,to:"위장무역",amount:"₩15,000,000",type:"법인이체",risk:"고위험",riskScore:93},
    {date:"2026-05-20",from:"박공범",to:"불상",    amount:"₩ 5,500,000",type:"ATM출금", risk:"의심",riskScore:81},
    {date:"2026-05-15",from:"위장무역",to:"해외송금",amount:"USD 12,000",type:"해외송금",risk:"고위험",riskScore:95},
  ];
  const digitalItems = ctx.targetType === "company" ? [
    {type:"업무메일/문서",items:["송품장 품명 반복 수정 11건","운송장 수취지 변경 7건","실화주 미기재 파일 4건"],status:"분석완료"},
    {type:"법인 단말 분석",items:["해외 공급자 연락처 6건","특송번호 공유 내역 18건","삭제 파일 복원 12건"],status:"진행중"},
    {type:"계정/접속 로그",items:["해외 IP 접속 9건","야간 대량 업로드 3건"],status:"검토중"},
  ] : [
    {type:"휴대폰 분석",items:["카카오톡 대화 142건","삭제 파일 복원 23건","GPS 이동경로 34일치"],status:"분석완료"},
    {type:"SNS 모니터링",items:["텔레그램 채널 3개 식별","은어 사용 메시지 18건","공모자 계정 2개 특정"],status:"진행중"},
    {type:"다크웹 흔적",items:["마켓 계정 연관 의심 1건","암호화폐 주소 연결 가능성"],status:"검토중"},
  ];
  const detailRows = {
    money: dataTable(["시각","송금인","수취인","금액","위험단서"], txData.map(t => [t.date, t.from, t.to, t.amount, `${t.type} · ${t.risk}`])),
    account: dataTable(["계좌/지갑","소유/사용자","연계 대상","중심도","상태"], [
      ["KB-2145-****", ctx.targetName, "박공범·위장무역", "0.85", "추적"],
      ["NH-7712-****", "박공범", "현금화 계좌", "0.77", "확인"],
      ["USDT-0x8F...21", "불상", "해외 공급자", "0.69", "보전요청"],
      ["카드-9981", ctx.targetName, "숙박·이동 결제", "0.58", "분석중"],
    ]),
    suspicious: dataTable(["탐지규칙","건수","대표 단서","위험도"], [
      ["소액 반복 송금", "23건", "100만원 이하 48시간 내 반복", "매우 높음"],
      ["ATM 현금화", "11건", "송금 직후 인출", "높음"],
      ["해외송금 분산", "7건", "동일 공급자 유사 금액", "높음"],
      ["법인계좌 우회", "5건", "수취인·실화주 불일치", "중간"],
    ]),
    comm: dataTable(["대상","통화/메시지","주요 시간대","연결강도","단서"], [
      [ctx.targetName, "박공범", "22-02시", "0.85", "입금 직전 연락"],
      [ctx.targetName, "최연락", "18-24시", "0.72", "운송장 공유"],
      ["박공범", "해외번호 +66", "심야", "0.69", "도착 전 통화"],
      ["ABC Courier", ctx.targetName, "업무시간", "0.52", "특송 문의"],
    ]),
    crypto: dataTable(["지갑","거래유형","금액","거래소/체인","상태"], [
      ["0x8F...21", "USDT 입금", "12,840 USDT", "TRON", "추적"],
      ["bc1q...5k", "BTC 전환", "0.41 BTC", "Bitcoin", "분석중"],
      ["업비트 연계", "원화 출금", "8,200,000원", "거래소", "조회요청"],
    ]),
    cash: dataTable(["일시","장소","금액","연계거래","판정"], [
      ["2026-05-28 23:14", "부산 해운대 ATM", "2,000,000원", "박공범 송금", "의심"],
      ["2026-05-26 01:42", "서울 강남 ATM", "3,500,000원", "법인 입금", "고위험"],
      ["2026-05-21 22:08", "인천공항 ATM", "1,800,000원", "입국 직후", "의심"],
    ]),
    movement: dataTable(["일시","위치","대상","단서","연계"], [
      ["2026-05-28", "인천공항", ctx.targetName, "입국/특송 수령 근접", "높음"],
      ["2026-05-29", "부산항", "박공범", "화물 반출지 접근", "중간"],
      ["2026-05-30", "서울 강남", "최연락", "자금 인출지 인접", "중간"],
    ]),
    social: dataTable(["채널","계정/방","탐지어","마약수사 의미","위험도"], [
      ["텔레그램", "비공개 채널 A", "아이스/작대기", "필로폰 거래 의심", "높음"],
      ["SNS", "계정 @green", "초록이", "MDMA 은어", "중간"],
      ["다크웹", "마켓 계정 후보", "샘플/배송", "구매·판매 흔적", "높음"],
    ]),
    message: dataTable(["대화상대","메시지 단서","시각","분석결과"], [
      ["박공범", "오늘 밤 물건 도착", "2026-05-28 21:12", "수령 지시"],
      ["최연락", "번호 바꿔서 보내", "2026-05-27 18:44", "특송 분산"],
      ["해외번호", "sample ready", "2026-05-26 02:19", "공급자 연락"],
    ]),
    location: dataTable(["파일","촬영위치","관련인","단서","정확도"], [
      ["IMG_2048.jpg", "부산항 인근", "박공범", "화물 반출지", "92%"],
      ["IMG_2051.jpg", "인천공항", ctx.targetName, "입국 동선", "88%"],
      ["IMG_2060.jpg", "강남 ATM", "최연락", "현금화 장소", "81%"],
    ]),
    device: dataTable(["디바이스","사용자","접속IP/위치","주요 이벤트","상태"], [
      ["iPhone 15", ctx.targetName, "KR/Seoul", "삭제 메시지 복원 23건", "분석완료"],
      ["Galaxy S24", "박공범", "KR/Busan", "특송 앱 조회 17건", "진행중"],
      ["노트북", "불상", "NL/Amsterdam", "VPN 접속", "검토중"],
    ]),
  };
  const detailTitle = tabs.find(t => t.key === specialInvestigationState.drugForensicSubTab)?.label || "상세분석";
  const renderTrend = values => values.map((v,i)=>`
    <span style="height:${v}%;left:${i*9.09}%"></span>
  `).join("");
  const dashboard = `
    <div class="drug-forensic-kpis">
      <button class="drug-forensic-upload" type="button">자료등록 및 검증/삭제</button>
      ${[
        ["총 파일 수", "867 개"],
        ["문서 개수", "110개"],
        ["이미지 개수", "410개"],
        ["영상 개수", "50개"],
        ["대화내역 건수", "43건"],
        ["식별 우범 관계인수", "130명"],
      ].map(item => `
        <div class="drug-forensic-kpi">
          <span>${item[0]}</span>
          <strong>${item[1]}</strong>
        </div>
      `).join("")}
    </div>
    <div class="drug-forensic-dashboard">
      <div class="drug-forensic-toolbar">
        <strong>종합 분석 대시보드</strong>
        <span>자금·디지털 압수증거 통합 현황</span>
        <div>
          <button>분석기간 2025-06-01 - 2026-06-17</button>
          <button>대상 전체</button>
          <button>관할 전체</button>
          <button>새로고침</button>
        </div>
      </div>
      <div class="drug-forensic-grid">
        <section class="df-card df-risk-score">
          <h4>종합 위험도</h4>
          <div class="df-score"><strong>92</strong><span>/100</span></div>
          <b>매우 높음</b>
          <div class="df-spark">${renderTrend([35,22,31,18,29,16,42,33,51,45,39,62])}</div>
        </section>
        <section class="df-card">
          <h4>위험도 분포</h4>
          <div class="df-donut"></div>
          <ul class="df-legend">
            <li><i style="background:#ef4444"></i>매우 높음 38%</li>
            <li><i style="background:#f59e0b"></i>높음 42%</li>
            <li><i style="background:#facc15"></i>보통 15%</li>
            <li><i style="background:#22c55e"></i>낮음 5%</li>
          </ul>
        </section>
        <section class="df-card df-wide">
          <h4>핵심 위험 지표</h4>
          <div class="df-gauge-row">
            ${[
              ["자금 흐름",94],["의심 거래",89],["계좌 네트워크",91],["가상자산",88],["현금 인출",76],["통신/메시지",85],["SNS/다크웹",87],
            ].map(([label,score])=>`
              <div class="df-gauge">
                <div style="--score:${score}"><strong>${score}</strong></div>
                <span>${label}</span>
              </div>
            `).join("")}
          </div>
          <div class="df-trend-row">
            ${[
              ["총 거래 금액","₩11,250,000,000","+18.3%"],
              ["의심 거래 건수","326건","+18.0%"],
              ["해외 송금 금액","₩2,350,000,000","+25.7%"],
              ["현금 인출 금액","₩380,000,000","+12.1%"],
              ["가상자산 거래액","$1,250,000","+31.5%"],
              ["통신 연관 빈도","2,845회","+9.2%"],
            ].map(([label,val,delta])=>`
              <div><span>${label}</span><strong>${val}</strong><em>${delta}</em></div>
            `).join("")}
          </div>
        </section>
        <section class="df-card">
          <h4>위험 Top 5 인물/계좌</h4>
          ${dataTable(["순위","이름/계좌","역할","위험도"], [
            ["1","김OO","총책/자금책","96"],
            ["2","이OO","운반책","94"],
            ["3","박OO","수취인","91"],
            ["4","최OO","연락책","86"],
            ["5","OO물류","운송사","78"],
          ])}
        </section>
        <section class="df-card">
          <h4>실시간 알림</h4>
          <ul class="df-alerts">
            <li><b>고위험 의심거래 탐지</b><span>12건</span></li>
            <li><b>해외 자금 유입 시도</b><span>3건</span></li>
            <li><b>현금 다량 인출 감지</b><span>5건</span></li>
            <li><b>가상자산 의심 월렛</b><span>2건</span></li>
            <li><b>위치 기반 이상 활동</b><span>4건</span></li>
          </ul>
        </section>
        <section class="df-card">
          <h4>분석 대상 개요</h4>
          <div class="df-icon-stats">
            ${[["분석 인물","128명"],["분석 계좌","623개"],["분석 디바이스","246대"],["분석 파일/증거","456개"]].map(([a,b])=>`<div><i></i><span>${a}</span><strong>${b}</strong></div>`).join("")}
          </div>
        </section>
        <section class="df-card">
          <h4>네트워크 중심도 Top 10</h4>
          <div class="df-bars">
            ${[["김OO",.85],["이OO",.77],["박OO",.71],["최OO",.65],["정OO",.46],["송OO",.44],["문OO",.38],["한OO",.28]].map(([n,v])=>`<div><span>${n}</span><i><b style="width:${v*100}%"></b></i><em>${v}</em></div>`).join("")}
          </div>
        </section>
        <section class="df-card df-map">
          <h4>자금 흐름 요약 지도</h4>
          <svg viewBox="0 0 520 210" preserveAspectRatio="none">
            <path d="M30 120 C130 70, 220 90, 300 60 S420 50, 490 80" />
            <path d="M45 130 C160 150, 230 110, 340 150 S430 165, 490 120" />
            <circle cx="80" cy="115" r="5"/><circle cx="260" cy="80" r="5"/><circle cx="420" cy="88" r="5"/><circle cx="350" cy="148" r="5"/>
          </svg>
        </section>
        <section class="df-card">
          <h4>의심 유형 분포</h4>
          <div class="df-donut df-donut-alt"></div>
          <strong class="df-center-number">326건</strong>
        </section>
        <section class="df-card">
          <h4>시간대별 의심 활동</h4>
          <div class="df-heatmap">${Array.from({length:56}).map((_,i)=>`<i style="opacity:${0.18 + ((i*7)%10)/12}"></i>`).join("")}</div>
        </section>
      </div>
    </div>
  `;
  return `
    <div class="drug-forensic-page">
      ${drugContextHeader(ctx, "자금·디지털 압수증거 분석", "선택 대상 유형에 맞춰 자금·디지털·SNS 단서를 전환합니다.")}
      ${drugSubTabNav("forensic", specialInvestigationState.drugForensicSubTab, tabs)}
      ${specialInvestigationState.drugForensicSubTab === "dashboard" ? dashboard : `
        <section class="drug-forensic-detail">
          <div class="drug-forensic-detail-head">
            <h4>${escapeHtml(detailTitle)} 상세분석 대시보드</h4>
            <span>${escapeHtml(ctx.case.caseId)} · ${escapeHtml(ctx.targetName)}</span>
          </div>
          <div class="drug-forensic-detail-grid">
            <div class="df-card df-wide">
              <h4>${escapeHtml(detailTitle)} 분석 결과</h4>
              <div class="drug-forensic-scroll">${detailRows[specialInvestigationState.drugForensicSubTab] || detailRows.money}</div>
            </div>
            <div class="df-card">
              <h4>위험 요약</h4>
              <div class="df-score small"><strong>${specialInvestigationState.drugForensicSubTab === "crypto" ? "88" : specialInvestigationState.drugForensicSubTab === "comm" ? "85" : "92"}</strong><span>/100</span></div>
              <ul class="df-alerts">
                <li><b>고위험 단서</b><span>12건</span></li>
                <li><b>추가 확인</b><span>7건</span></li>
                <li><b>증거 보전</b><span>필요</span></li>
              </ul>
            </div>
            <div class="df-card df-wide">
              <h4>시간 흐름</h4>
              <div class="df-spark detail">${renderTrend([18,28,25,40,33,52,48,62,70,54,78,83])}</div>
            </div>
          </div>
        </section>
      `}
    </div>
  `;
}

export const forensicSubtab = {
  id: "forensic",
  label: "자금·디지털 압수증거 분석",
  enabledWhen: context => !!context.case,
  aiServices: ["proceeds_tracking", "network", "web_search"],
  render: renderForensicPanel,
};
