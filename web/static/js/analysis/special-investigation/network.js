import { dataTable, escapeHtml } from "../../core/dom.js";

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

export function renderNetworkPanel(deps){
  const aCase = deps.activeDrugCase();
  if(!aCase) return `<div class="profile-loading">수사 대상을 먼저 선택하세요.</div>`;
  const ctx = deps.drugCaseContext(aCase);
  const centerType = ctx.targetType === "company" ? "company" : "suspect";
  const nodes = ctx.targetType === "company" ? [
    { id:"center", label: ctx.targetName, type:centerType, x:50, y:50 },
    { id:"n1", label:"김우범", type:"suspect", x:20, y:25 },
    { id:"n2", label:"박공범", type:"associate", x:75, y:22 },
    { id:"n3", label:"ABC Courier", type:"company", x:18, y:70 },
    { id:"n4", label:"전구물질 화물", type:"cargo_owner", x:80, y:72 },
    { id:"n5", label:"해외공급자", type:"associate", x:55, y:84 },
    { id:"n6", label:"분산송금 계좌", type:"money", x:32, y:48 },
  ] : [
    { id:"center", label: ctx.targetName, type:centerType, x:50, y:50 },
    { id:"n1", label:"박공범", type:"associate", x:20, y:25 },
    { id:"n2", label:"최연락", type:"associate", x:75, y:20 },
    { id:"n3", label:"이중간", type:"money", x:15, y:70 },
    { id:"n4", label:"김화주", type:"cargo_owner", x:80, y:75 },
    { id:"n5", label:"(주)위장무역", type:"company", x:55, y:82 },
    { id:"n6", label:"ABC Courier", type:"company", x:30, y:48 },
  ];
  const edges = ctx.targetType === "company" ? [
    { from:"center", to:"n1", label:"연락책" },
    { from:"center", to:"n2", label:"수취인" },
    { from:"center", to:"n3", label:"운송계약" },
    { from:"center", to:"n4", label:"수입신고" },
    { from:"n4", to:"n5", label:"공급" },
    { from:"center", to:"n6", label:"대금" },
    { from:"n1", to:"n6", label:"분산송금" },
  ] : [
    { from:"center", to:"n1", label:"친인척" },
    { from:"center", to:"n2", label:"동업자" },
    { from:"center", to:"n3", label:"자금책" },
    { from:"center", to:"n4", label:"화주명의" },
    { from:"n4", to:"n5", label:"대표자" },
    { from:"center", to:"n6", label:"이용업체" },
    { from:"n1", to:"n5", label:"관계사" },
  ];
  const actorRows = ctx.targetType === "company"
    ? [["김우범","연락책","기업 화물 주문·수취 조율","92"],["박공범","수취인","주소 분산 수령","78"],["ABC Courier","운송업체","특송 반복 취급","76"],["해외공급자","공급망","전구물질 공급 의심","88"]]
    : [["박공범","친인척","소량 수령·분산 주소","78"],["최연락","동업자","운송장 공유","82"],["이중간","자금책","소액 반복 이체","64"],["(주)위장무역","관련기업","위장수입 의심","89"]];
  const routeRows = ctx.targetType === "company"
    ? [["APLL2026053001","CN→KR","전구물질","검사지시"],["MSCU2026053002","MX→NL→KR","환적 경유","검사지시"],["DHL2026052917","TH→KR","특송 분산","분석중"]]
    : [["DS-001","방콕→인천","고위험국 이동","추적중"],["EMS2026052711","PH→KR","소량 수령","감시중"],["DHL2026052917","TH→KR","공범 주소 수령","분석중"]];
  const evidenceRows = [["디지털","메신저 은어","아이스·초록이 주문 표현","포렌식"],["자금","분산송금","소액 반복 이체·ATM 출금","자금분석"],["CDW","위험지표","고위험 경로·소량반복 반입","DB조회"],["관계망","2촌 연결","기존 적발자와 직접/간접 연결","분석완료"]];
  const graphSvg = `
    <svg width="100%" height="100%" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" class="drug-network-svg">
      ${edges.map(e=>{
        const from = nodes.find(n=>n.id===e.from);
        const to   = nodes.find(n=>n.id===e.to);
        if(!from||!to) return "";
        const x1=from.x*10, y1=from.y*5.6, x2=to.x*10, y2=to.y*5.6;
        const mx=(x1+x2)/2, my=(y1+y2)/2;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
                <text x="${mx}" y="${my - 6}" text-anchor="middle">${escapeHtml(e.label)}</text>`;
      }).join("")}
      ${nodes.map(n=>{
        const colors={suspect:"#dc2626",associate:"#d97706",cargo_owner:"#7c3aed",company:"#0284c7",money:"#16a34a"};
        const labels={suspect:"우범자",associate:"관계자",cargo_owner:"화물",company:"기업",money:"자금"};
        const x=n.x*10, y=n.y*5.6;
        return `<g class="drug-network-node">
          <circle cx="${x}" cy="${y}" r="${n.id === "center" ? 28 : 24}" fill="${colors[n.type]}" />
          <text x="${x}" y="${y + 4}" class="node-label" text-anchor="middle">${escapeHtml(n.label.substring(0,4))}</text>
          <text x="${x}" y="${y + 46}" class="node-type" text-anchor="middle">${escapeHtml(labels[n.type])}</text>
        </g>`;
      }).join("")}
    </svg>
  `;
  return `
    <div class="drug-network-page">
      ${drugContextHeader(ctx, "관계망 분석", "선택한 수사 대상을 중심으로 관계자·화물·자금·증거 단서를 재구성합니다.")}
      <div class="drug-network-layout">
        <div class="drug-network-left">
          <section class="drug-network-frame drug-network-graph-frame">
            <div class="drug-network-frame-head">
              <h4>관계망 그래프</h4>
              <span>중심: ${escapeHtml(ctx.targetName)}</span>
            </div>
            <div class="drug-network-graph" id="drugNetworkCanvas">${graphSvg}</div>
          </section>
          <section class="drug-network-frame drug-network-evidence-frame">
            <div class="drug-network-frame-head"><h4>증거 단서</h4></div>
            <div class="drug-network-scroll">
              ${dataTable(["분류","단서","내용","후속분석"], evidenceRows)}
            </div>
          </section>
        </div>
        <aside class="drug-network-right">
          <section class="drug-network-frame">
            <div class="drug-network-frame-head"><h4>연계 대상</h4></div>
            <div class="drug-network-scroll">
              ${dataTable(["대상","역할","마약수사 단서","위험점수"], actorRows)}
            </div>
          </section>
          <section class="drug-network-frame">
            <div class="drug-network-frame-head"><h4>경로·화물</h4></div>
            <div class="drug-network-scroll">
              ${dataTable(["관리번호","경로","위험유형","상태"], routeRows)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

export const networkSubtab = {
  id: "network",
  label: "관계망 분석",
  showWhen: context => !!context.case,
  aiServices: ["network", "route_analysis"],
  render: renderNetworkPanel,
};
