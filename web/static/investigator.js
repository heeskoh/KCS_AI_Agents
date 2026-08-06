/* 지능형 관세조사 - AI 조사관 — 별도 사이트 진입점(investigator.html 전용).
   포털과 동일한 분석 엔진(app-runtime)을 공유하되, investigator.html이 먼저 설정한
   window.__KCS_PLATFORM__ 플래그로 엔진이 플랫폼 셸(관세조사·덤핑관리·납세도움정보 +
   좌측 AI 조사관 채팅)로 부팅한다. 셸 스타일은 investigator.css가 담당한다. */
import "./js/app-runtime.js";
