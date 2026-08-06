# core-engine — 사이트 공용 코어

4개 사이트(포털 `index.html` · AI 조사관 `investigator.html` · AI 수사관 `detective.html` ·
표준보고서 지원 `report-support.html`)가 공유하는 코어 모듈. `app-runtime.js`(오케스트레이터)
해체 리팩토링의 1단계 산출물이다.

## 모듈

| 파일 | 책임 |
|---|---|
| `user-context.js` | 현재 사용자 상태(`currentUserId`·`userPermissions`)와 권한 판정(사용자/그룹/페이지/서비스 권한, 홈 카드 잠금 상태) |
| `platform-sites.js` | 업무영역 별도 사이트 레지스트리 — `window.__KCS_PLATFORM__` 플래그 → 부팅 페이지·셸 적용 페이지·AI 역할 |
| `workspace-store.js` | 워크스페이스 영속 — 서버 JSON 스토어 로드(`fetchJsonStore`)·디바운스 POST(`createDebouncedStore`)·종료 시 sendBeacon 플러시, 사용자별 스냅샷 맵(`userWorkspaces`). 상태 직렬화(payload 구성·복원)는 상태 소유자인 app-runtime이 담당 |
| `sse-runner.js` | SSE 실행기 — GET SSE 워크플로 스트림(`openRunEventStream`: step/workflow 파싱·종료 시 자동 close·연결오류 분류)과 POST fetch SSE 프레임 파서(`readSseResponse`). 소비자(홈 MyAI·시나리오·관세수사/특별수사 러너·llm-stream·chat-agent-run)는 상태 반영만 담당 |
| `runtime-hooks.js` | 런타임 훅(`onHook`/`emitHook`) — 진입점별 선택 로딩 모듈(홈 셸 등)이 엔진 이벤트에 연결하는 지점. 구독자가 없으면 no-op |

## 규칙

- **상태는 ESM 라이브 바인딩**: `currentUserId`·`userPermissions`·`userWorkspaces`는 import해서 읽고,
  재할당은 반드시 `setCurrentUserId()`·`setUserPermissions()`·`setUserWorkspaces()`로 한다
  (직접 재할당은 ESM 문법 오류). 객체 속성 변경(`userPermissions[key] = ...`)은 허용.
- core-engine은 `js/config/`·`js/core/`만 의존한다. `app-runtime.js`나 `js/pages/`·`js/analysis/`를
  import하면 순환 참조가 생기므로 금지.

## 리팩토링 로드맵 (남은 단계)

1. ~~사용자·권한 코어 추출~~ (완료 — `user-context.js`)
2. ~~사이트 레지스트리 추출~~ (완료 — `platform-sites.js`)
3. ~~워크스페이스 영속 추출~~ (완료 — `workspace-store.js`)
4. ~~SSE 실행기 추출~~ (완료 — `sse-runner.js`)
5. ~~홈/코치 로직 분리~~ (완료) — 코치 상태·컴포저 렌더·홈 실행 파이프라인 전체(coach*·home*
   약 140개 함수, ~2,800줄)를 `pages/home-runtime.js`로 이동. 엔진과의 연결은
   `runtime-hooks`("home-render": 코치/컴포저/셸 초기화, "home-stop-runs": 홈 스트림 중단)와
   엔진 export(`render`·`cssString`·`uniqueByKey`·`requestPermissions`·`isCopilotMode`·
   `normalizeEmailIds`·`isValidEmailId`·`homeMountClarify`)뿐이다.
   국제정보(case) 페이지도 같은 훅으로 컴포저를 초기화한다(포털 전용 페이지라 문제 없음).
   공용 유틸(이메일 정규화·clarify 입력)은 시나리오 실행에서도 쓰여 엔진에 잔류·export.
6. ~~진입점별 로딩 분리~~ (완료) — 포털(app.js)만 `home-runtime`(홈 전체)을 로드하고
   업무영역 3개 사이트(investigator/detective/report-support)는 엔진만 로드한다.
   엔진(app-runtime)은 12,344줄 → 9,515줄로 축소.
