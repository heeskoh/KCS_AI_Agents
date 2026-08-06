/* ── 공용 코어: 워크스페이스 영속(저장소 클라이언트) ─────────────────────
   서버 JSON 스토어(data/workspace_state.json·analysis_templates.json 등)에 대한
   로드·디바운스 저장·종료 시 sendBeacon 플러시와, 사용자별 워크스페이스 스냅샷 맵.
   app-runtime(오케스트레이터)에서 2단계 리팩토링으로 추출했다.

   상태 직렬화(어떤 변수를 payload에 담고 복원할지)는 상태 소유자인 app-runtime이
   담당하고, 이 모듈은 "저장소 접근 방법"만 담당한다. */

/* 구버전 localStorage 백업 키 — 서버 파일 이행 후 정리 대상 */
export const LEGACY_LOCAL_STATE_KEY = "kcs_ai_canvas_state_v1";

/* GET url → { state: {...} } 응답에서 state만 꺼낸다. 실패 시 null. */
export async function fetchJsonStore(url){
  try{
    const res = await fetch(url);
    if(!res.ok) return null;
    const data = await res.json();
    return data && typeof data.state === "object" && data.state ? data.state : null;
  }catch(error){
    return null;
  }
}

/* 디바운스 POST 스토어 — save(payload)로 저장 예약, delay 후 flush.
   페이지 종료 시에는 beacon()이 대기분을 sendBeacon으로 플러시한다. */
export function createDebouncedStore(url, { label = url, delay = 400 } = {}){
  let timer = null;
  let pending = null;

  const flush = () => {
    if(timer){ clearTimeout(timer); timer = null; }
    if(!pending) return;
    const body = JSON.stringify(pending);
    pending = null;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(error => console.warn(`${label}을(를) 서버에 저장하지 못했습니다.`, error));
  };

  const save = (payload) => {
    pending = payload;
    if(timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };

  const beacon = () => {
    if(timer){ clearTimeout(timer); timer = null; }
    if(!pending) return;
    try{
      navigator.sendBeacon(url, new Blob([JSON.stringify(pending)], { type: "application/json" }));
    }catch(e){ /* noop */ }
    pending = null;
  };

  return { url, save, flush, beacon };
}

/* 종료 직전 대기 중인 저장분을 일괄 플러시 */
export function registerBeaconFlush(stores){
  window.addEventListener("beforeunload", () => stores.forEach(store => store.beacon()));
}

/* 저장 스냅샷 안전 복제 — 직렬화 불가 값은 fallback */
export function cloneSavedValue(value, fallback){
  if(value === undefined || value === null) return fallback;
  try{
    return JSON.parse(JSON.stringify(value));
  }catch(error){
    return fallback;
  }
}

/* ── 사용자별 워크스페이스 스냅샷 맵 { userId: snapshot } ──
   재할당은 setUserWorkspaces로, 속성 변경(userWorkspaces[id] = ...)은 import 측에서 허용. */
export let userWorkspaces = {};
export function setUserWorkspaces(map){ userWorkspaces = map; }
