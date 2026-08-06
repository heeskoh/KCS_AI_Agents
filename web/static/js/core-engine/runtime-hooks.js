/* ── 공용 코어: 런타임 훅 ───────────────────────────────────────────────
   진입점별로 선택 로딩되는 모듈(홈 셸 등)이 엔진(app-runtime) 이벤트에 연결하는 지점.
   엔진은 훅 이름으로 emit만 하고, 구독자가 없으면 아무 일도 일어나지 않는다 —
   업무영역 별도 사이트가 홈 셸을 로드하지 않아도 엔진 코드는 동일하게 동작한다.

   사용 중인 훅:
     "home-render"      — 홈 렌더 직후 (payload 없음)
     "home-run-started" — 홈 AI실행 시작 (payload: prompt 문자열) */
const listeners = {};

export function onHook(name, fn){
  (listeners[name] || (listeners[name] = [])).push(fn);
}

export function emitHook(name, payload){
  (listeners[name] || []).forEach(fn => {
    try{ fn(payload); }catch(error){ console.warn(`[hook:${name}]`, error); }
  });
}
