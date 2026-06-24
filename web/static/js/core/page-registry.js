import { dataTable } from "./dom.js";
import { homePage } from "../pages/home.js";

export const pageNames = {
  home:"My AI 분석",
  agentic:"AI Agentic 서비스",
  canvas:"AI 작업 캔버스",
  investigation:"관세조사분석",
  generalinv:"일반수사분석",
  profile:"기업 위험도 대시보드",
  classification:"품목분류",
  lawsearch:"마약수사분석",
  fxsearch:"외환수사분석",
  document:"문서검증",
  dw:"위험선별 분석",
  model:"관계망 분석",
  rag:"통관정보 분석",
  case:"국제정보 분석",
  report:"보고서",
  customsReport:"통관보고서 생성",
  system:"시스템",
  governance:"거버넌스",
  permission:"권한 승인",
  scenarioBuilder:"업무시나리오 구성",
};

export function createPageRegistry({
  activeAnalysisJobs,
  agenticServicePage,
  analysisButtons,
  canvasPage,
  customsInfoPage,
  customsOntologyPage,
  drugInvestigationPage,
  generalInvPage,
  intlInfoPage,
  investigationPage,
  isSuperAdmin,
  mainCanvasJob,
  permissionApprovePage,
  riskDashboard,
  riskScreeningPage,
  scenarioBuilderPage,
  shortcutState,
  simplePage,
}){
  return {
    home: () => homePage({
      activeAnalysisJobs,
      mainCanvasJob,
      isSuperAdmin,
      shortcutState,
      analysisButtons: typeof analysisButtons === "function" ? analysisButtons() : analysisButtons,
    }),

    canvas: () => canvasPage(),

    agentic: () => agenticServicePage(),

    investigation: () => investigationPage(),

    generalinv: () => generalInvPage(),

    profile: () => riskDashboard(),

    classification: () => simplePage("품목분류 추천", "품명, 규격, 이미지, 과거 분류사례를 바탕으로 HS Code 후보와 판단근거를 추천합니다.", `
      <div class="query-box"><span>🧾</span><input value="전동식 모션베드의 품목분류 후보를 추천해줘"><button class="btn">추천</button></div>
      ${dataTable(["후보 HS","품명","추천근거","신뢰도"], [["9403.20","금속제 기타 가구","금속 프레임이 본질적 특성인 조절식 침대베이스","높음"],["9403.50","목제 침실가구","목재 구조가 본질적 특성인 경우","중간"],["9402.90","의료용 가구","병원·진료용으로 설계된 경우 한정","낮음"]])}
      <div class="summary-box"><b>AI 판단:</b> 일반 가정용 모션베드는 의료용 침대가 아니라 가구로 검토하고, 주요 재질과 본질적 특성에 따라 세부호를 결정합니다.</div>
    `),

    lawsearch: () => drugInvestigationPage(),
    fxsearch: () => drugInvestigationPage("fxsearch"),

    document: () => simplePage("문서검증센터", "비정형 문서를 OCR/LLM으로 인식하고 DB 값과 비교합니다.", `${dataTable(["추출항목","문서값","DB값","판정"], [["품명","Power Module","Power Module","일치"],["단가","USD 120","USD 98","불일치"],["Incoterms","CIF","FOB","불일치"],["로열티","존재","미신고","확인필요"]])}`),
    dw: () => riskScreeningPage(),
    model: () => customsOntologyPage(),
    rag: () => customsInfoPage(),
    case: () => intlInfoPage(),
    report: () => simplePage("보고서 생성센터", "AI 캔버스 블록을 조합해 조사보고서를 생성합니다.", `<button class="btn">조사보고서 초안 생성</button>`),

    customsReport: () => simplePage(
      "통관보고서 생성",
      "수입신고·심사·위험선별 결과를 종합해 통관 보고서 초안을 자동 생성합니다.",
      `
      <div class="query-box">
        <span>📄</span>
        <input value="2026년 5월 ABC무역(주) 수입통관 검토 보고서를 생성해줘">
        <button class="btn">보고서 생성</button>
      </div>
      ${dataTable(["보고서 유형", "대상", "포함 섹션", "형식"], [
        ["수입통관 검토 보고서", "기업/신고건", "신고개요·심사결과·위험지표·조치의견", "DOCX / PDF"],
        ["품목분류 검토 보고서", "신고 품목", "HS후보·판단근거·관련 사례", "DOCX / PDF"],
        ["과세가격 검토 보고서", "신고 가격", "신고가·비교가·가산요소·결론", "DOCX / PDF"],
      ])}
      <div class="summary-box"><b>AI 생성 흐름:</b> 신고내역·심사정보 RAG → 신고검증·품목분류·과세가격 결과 취합 → 보고서 생성 AI 서비스(report_generate)로 5섹션 초안 작성 → 검증 AI 서비스로 사실관계 점검 후 다운로드.</div>
      `
    ),
    system: () => simplePage("시스템 관리", "연계시스템, 데이터 파이프라인, 사용자 권한, 보안정책을 관리합니다.", ""),
    governance: () => simplePage("모델·권한·감사 로그", "AI 모델 사용 이력, 프롬프트 로그, 승인 프로세스를 점검합니다.", ""),
    permission: () => permissionApprovePage(),
    scenarioBuilder: () => scenarioBuilderPage(),
  };
}
