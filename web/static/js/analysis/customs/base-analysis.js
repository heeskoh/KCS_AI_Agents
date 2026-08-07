/* 관세조사 등록 직후 자동 수행되는 기초데이터 분석 — 조사 대상 업체의 내부 보유자료
   (기업정보·수입신고 이력·위험지표)를 조회·대사한다. 진행 중에는 진행중인 관세조사
   카드에 "기초데이터 분석 진행중" 상태가 표시되고, 기업조사 프로파일 이후 서브탭은
   완료 전까지 비활성화된다(index.js activeCustomsCase 게이팅).
   결과는 캔버스 job의 baseAnalysis 필드에 저장되어 saveCanvasState로 함께 유지된다. */

const MIN_RUN_MS = 4000;   // 데모 가시성: 진행 상태가 최소한 이 시간 동안 보이도록 유지

export function ciBaseAnalysisRunning(job){
  return job?.baseAnalysis?.status === "running";
}

/* 기업 상세(detail: /api/company 응답 또는 companyDetailCache 항목) → 대사표·상위 지표 구성.
   자동 수행(ciAutoBaseAnalysis)과 프로파일 결과 창(ciBaseAnalysisForProfile)이 공용한다. */
function ciBaseRowsFromDetail(detail, fallbackName, companyId){
  const company = detail.company || {};
  const decls = detail.declarations || [];
  const declSum = decls.reduce((sum, d) => sum + Number(d.declared_value || 0), 0);
  const rows = [
    ["대상(기업)", `${company.company_name || fallbackName || companyId} · ${companyId}`],
    ["위험도", `${company.risk_score ?? "-"}점 (${company.risk_level || "-"})`],
    ["수입신고 이력", `${decls.length}건 · 신고금액 합계 ${declSum ? (declSum / 1e8).toFixed(1) + "억원" : "-"}`],
    ["연간 수입액/납부세액", `${company.annual_import_amount ? (company.annual_import_amount / 1e8).toFixed(0) + "억원" : "-"} / ${company.declared_duty_amount ? (company.declared_duty_amount / 1e8).toFixed(1) + "억원" : "-"}`],
  ];
  const indicators = Object.values(detail.risk_indicators || {}).slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3)
    .map(row => ({ name: row.indicator_name || row.indicator_code, score: Math.round(row.score || 0) }));
  return { rows, indicators };
}

/* 프로파일 '기초데이터 분석 결과' 창용 데이터 — 등록 시 자동 수행분(job.baseAnalysis)을
   우선 사용하고, 이 기능 도입 전에 등록된 작업은 기업 상세 캐시로 동일 결과를 구성한다. */
export function ciBaseAnalysisForProfile(job, detailCache, companyId){
  if(job?.baseAnalysis?.status === "done") return job.baseAnalysis;
  if(!detailCache || detailCache.loading || detailCache.error) return null;
  return { status: "done", ranLabel: "", ...ciBaseRowsFromDetail(detailCache, job?.companyName, companyId) };
}

export async function ciAutoBaseAnalysis(ctx, companyId){
  const job = ctx.canvasJobs().find(item => item.companyId === companyId);
  if(!job || ciBaseAnalysisRunning(job)) return;
  ctx.patchCanvasJob(companyId, {
    baseAnalysis: { status: "running", ranAt: Date.now() },
    status: { label: "기초데이터 분석 진행중", tone: "running" },
    updated: "방금",
  });
  const started = Date.now();
  let rows = [];
  let indicators = [];
  let status = "done";
  try{
    const res = await fetch(`/api/company?company_id=${encodeURIComponent(companyId)}`);
    const detail = res.ok ? await res.json() : {};
    ({ rows, indicators } = ciBaseRowsFromDetail(detail, job.companyName, companyId));
  } catch (e) {
    console.warn("[ci] 기초데이터 분석 자동 수행 실패", e);
    status = "error";
  }
  const waitLeft = MIN_RUN_MS - (Date.now() - started);
  if(waitLeft > 0) await new Promise(resolve => setTimeout(resolve, waitLeft));
  ctx.patchCanvasJob(companyId, {
    baseAnalysis: {
      status, ranAt: Date.now(), ranLabel: new Date().toLocaleString("ko-KR"),
      rows, indicators,
    },
    status: { label: status === "done" ? "기초분석 완료" : "대기", tone: "wait" },
    updated: "방금",
  });
  // 관세조사 화면이 열려 있을 때만 갱신 — 다른 페이지 열람 중 강제 전환 방지
  if(document.querySelector(".ci-hub")) ctx.render("investigation");
}
