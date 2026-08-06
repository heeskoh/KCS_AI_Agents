/* 표준보고서 지원 — 별도 사이트 진입점(report-support.html 전용).
   포털과 동일한 분석 엔진(app-runtime)을 공유하되, report-support.html이 먼저 설정한
   window.__KCS_PLATFORM__ = "report" 플래그로 표준보고서 플랫폼 셸로 부팅한다.
   셸 스타일은 platform-shell.css(공통) + report-support.css(액센트)가 담당한다. */
import "./js/app-runtime.js";
