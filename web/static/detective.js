/* 지능형 관세수사 - AI 수사관 — 별도 사이트 진입점(detective.html 전용).
   포털과 동일한 분석 엔진(app-runtime)을 공유하되, detective.html이 먼저 설정한
   window.__KCS_PLATFORM__ = "detective" 플래그로 관세수사 플랫폼 셸로 부팅한다.
   셸 스타일은 platform-shell.css(공통) + detective.css(액센트)가 담당한다. */
import "./js/app-runtime.js";
