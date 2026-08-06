/* ── 공용 코어: 업무영역 별도 사이트 레지스트리 ─────────────────────────
   AI 조사관(investigator.html)·AI 수사관(detective.html)·표준보고서 지원
   (report-support.html)의 사이트별 구성(부팅 페이지·셸 적용 페이지·AI 역할).
   각 HTML이 모듈 로드 전에 window.__KCS_PLATFORM__ = "<키>" 플래그를 설정한다. */

const PLATFORM_SITES = {
  investigator: {
    boot: "investigation",
    pages: ["investigation", "dumping", "taxhelp"],
    role: "관세청 관세조사 업무를 돕는 'AI 조사관'",
    scope: "관세조사·덤핑·납세지원",
  },
  detective: {
    boot: "generalinv",
    pages: ["generalinv"],
    role: "관세청 관세수사 업무를 돕는 'AI 수사관'",
    scope: "관세수사·사건분석·우범자 정보",
  },
  report: {
    boot: "report",
    pages: ["report"],
    role: "관세청 표준보고서 작성·검증을 돕는 AI 어시스턴트",
    scope: "보고서 작성·표준 서식·근거 검증",
  },
};

function siteKey(){
  const flag = window.__KCS_PLATFORM__;
  if(flag === true) return "investigator";   // 구버전 플래그 호환
  return PLATFORM_SITES[flag] ? flag : null;
}

export function siteConfig(){ return PLATFORM_SITES[siteKey()] || PLATFORM_SITES.investigator; }
export function isStandalonePlatform(){ return !!siteKey(); }
export function platformBootPage(){ return siteConfig().boot; }
export function isPlatformShellPage(page){
  const key = siteKey();
  return key ? PLATFORM_SITES[key].pages.includes(page) : false;
}
