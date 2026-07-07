---
name: customs-review-prepared-results
description: 관세조사 탭4는 리뷰모드(사전 준비 결과 표시) — prepared_analysis_results.json + build_prepared_results.py로 생성
metadata: 
  node_type: memory
  type: project
  originSessionId: 4710970f-0d16-4c29-950b-345aaf09aff2
---

관세조사 워크스페이스(2026-07-07 개편)의 "분석 시나리오 확인 및 설정" 탭은 실시간 SSE 실행이 아니라 **사전 준비된 결과**를 표시한다.

- 저장소: `data/prepared_analysis_results.json` (읽기전용, GET `/api/prepared_results`). 서버는 절대 쓰지 않음 — 데모 리셋은 사용자 workspace_state 파일만 삭제.
- 생성: `python tools/build_prepared_results.py --base http://127.0.0.1:8001 --companies C-xxxx,...` (8001 프리뷰 대상 실행, `--all`/`--force` 지원). 템플릿은 위험지표 최고 점수로 자동 매핑.
- 폴백 순서: 사용자 본인 실행(`canvasRunArchives`) > 사전 결과(`preparedRunArchives`) — `currentRunArchive()`가 단일 진입점.
- id 불일치 주의: 저장된 companyScenarios 항목 id ≠ prep-* id → `remapArchiveResults()`(app-runtime.js)가 key 순서 매칭으로 재매핑.
- 리뷰모드는 `sharedScenarioWorkbenchHtml({reviewMode:true})` + `scenarioReviewWorkbench()` — customs 전용, general/special/canvas는 기존 실행형 유지. "분석 재수행 요청" 버튼은 모의 접수(실제 실행 없음).
- 리뷰모드 UI: 우측 패널은 선택된 단계 1개의 결과만(전역 `scenarioReviewMode` 플래그, sharedScenarioWorkbenchHtml 렌더 시 리셋). 좌측은 분석범위(behavior)별 설명+개별 프롬프트 블록 — 설명은 service-prompt-patterns.js `patternBehaviorDescription`, 프롬프트는 `composePrompt(key,[behavior])` 단독 호출, 저장은 `item.behaviorPrompts`(normalizeScenarioItem이 보존).
- 관세조사 탭에 관계망 분석(workbench) 탭 추가됨 — `analysis/customs/network.js`, enabledSubtabs는 코드 기본값+`data/scenario_builder_config.json` 양쪽 갱신 필요. [[workspace-state-overrides-code-defaults]]
