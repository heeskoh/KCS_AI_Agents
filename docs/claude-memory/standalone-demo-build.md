---
name: standalone-demo-build
description: 플랫폼 동작 결과를 단일 HTML로 재생하는 standalone 데모 빌드 절차 (tools/build_standalone_demo.py)
metadata: 
  node_type: memory
  type: project
  originSessionId: 7b56254f-f759-4f10-a8b4-474074b770de
---

standalone 데모 HTML은 실제 SPA 코드를 그대로 내장하고 API 스냅샷 + SSE 녹화를 재생하는 방식.

**Why:** 서버·DB 없이 시연/공유 가능해야 하고, 화면이 실서비스와 100% 동일해야 신뢰도가 있음. ES 모듈이라 번들러 없이 import map + Blob URL로 로드 (node 없음 환경).

**How to apply:**
1. `python tools/capture_demo_snapshot.py` — 8000 서버에서 GET API 스냅샷 캡처 (부팅 API + 전 기업/인물 상세·그래프)
2. SSE 녹화 — 8001 검증서버 UI에서 EventSource 래퍼(preview_eval 주입, POST 차단 포함)로 /api/run 1회 실제 실행 후 프레임 저장
3. `python tools/build_standalone_demo.py --snapshot ... --sse ... --out dist/xxx.html`
- 심(shim): fetch(스냅샷 조회, 상태저장 POST=no-op), EventSource(녹화 재생, speed 배율), 이미지 data-URL MutationObserver
- cytoscape(unpkg CDN 의존)는 tools/vendor/cytoscape.min.js 로 선주입, drawflow/dagre도 인라인 — 로더의 window 가드로 통과
- 데모 데이터 원본은 dist/demo_data/에 보관. 2026-07 C-1002 케이스(8단계 시나리오)로 최초 구축, [[stop-verify-server-after-work]] 규칙 준수
