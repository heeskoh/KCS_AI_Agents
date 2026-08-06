/* ── 공용 코어: SSE 실행기 ──────────────────────────────────────────────
   워크플로 실행 스트림의 공통 처리기. 두 가지 소비 방식을 모두 담당한다:
   1) GET SSE(EventSource) — openRunEventStream: step/workflow 프레임 파싱,
      workflow 종료(completed/failed) 시 자동 close, 연결 오류 분류(onDisconnect)
   2) POST fetch SSE — readSseResponse: keep-alive 스트림의 프레임(event/data)을
      onEvent(name, data)로 전달, false 반환 시 reader 취소 후 종료
   소비자(홈 MyAI·시나리오 러너·관세수사/특별수사 러너·LLM 스트림)는 상태 반영만 담당한다. */

/* EventSource 연결 오류 분류 — readyState 0(CONNECTING)=서버 미도달, 그 외=실행 중 종료 */
export function sseDisconnectReason(readyState){
  const connecting = readyState === 0;
  return {
    connecting,
    readyState,
    reason: connecting
      ? "서버에 연결하지 못했습니다 (서버 미실행·중단 또는 네트워크 오류)."
      : "실행 중 서버와의 연결이 종료되었습니다 (서버 오류·타임아웃 가능).",
  };
}

/* GET SSE(EventSource) 워크플로 스트림.
   opts:
     onStep(data)              — step 프레임(JSON 파싱 완료)
     onWorkflow(data, terminal) — workflow 프레임. terminal=completed/failed(수신 시 이미 close됨)
     onDisconnect(info, ev)    — 예기치 않은 연결 종료(정상 close 후에는 호출되지 않음).
                                 info = sseDisconnectReason(...) 결과
   반환 핸들: close()(멱등)·readyState — 기존 EventSource 변수 자리에 그대로 저장해 사용한다. */
export function openRunEventStream(url, { onStep = null, onWorkflow = null, onDisconnect = null } = {}){
  const source = new EventSource(url);
  let closed = false;
  const handle = {
    close(){ if(!closed){ closed = true; try{ source.close(); }catch(e){ /* noop */ } } },
    get readyState(){ return source.readyState; },
  };
  source.addEventListener("step", event => {
    let data;
    try{ data = JSON.parse(event.data); }catch(e){ return; }
    if(onStep) onStep(data);
  });
  source.addEventListener("workflow", event => {
    let data;
    try{ data = JSON.parse(event.data); }catch(e){ return; }
    const terminal = data.status === "completed" || data.status === "failed";
    if(terminal) handle.close();
    if(onWorkflow) onWorkflow(data, terminal);
  });
  source.onerror = (ev) => {
    if(closed) return;   // 정상 종료(완료/실패/명시적 close) 이후의 오탐 방지
    const info = sseDisconnectReason(source.readyState);
    handle.close();
    if(onDisconnect) onDisconnect(info, ev);
  };
  return handle;
}

/* POST fetch SSE 스트림 파서.
   onEvent(name, data)가 false를 반환하면 reader를 취소하고 종료한다
   (서버가 keep-alive라 종료 이벤트 수신 즉시 닫아야 하는 스트림용).
   opts.shouldStop()        — 청크마다 검사해 true면 중단(부분 결과 유지).
   opts.swallowReadErrors   — 기본 true: 읽기 오류(Abort 포함) 시 부분 처리로 조용히 종료
                              (LLM 토큰 스트림용). false면 오류를 전파해 호출부가 표시한다.
   onEvent에서 던진 예외는 그대로 전파된다(호출부 catch 책임). */
export async function readSseResponse(resp, onEvent, { shouldStop = null, swallowReadErrors = true } = {}){
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try{
    while(!finished){
      let chunk;
      try{ chunk = await reader.read(); }
      catch(e){
        if(swallowReadErrors) break;   // AbortError 등 → 부분 처리로 종료
        throw e;
      }
      if(chunk.done) break;
      if(shouldStop && shouldStop()) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let sep;
      while((sep = buffer.indexOf("\n\n")) >= 0){
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let eventName = "message", dataText = "";
        block.split("\n").forEach(line => {
          const clean = line.replace(/\r$/, "");
          if(clean.startsWith("event:")) eventName = clean.slice(6).trim();
          else if(clean.startsWith("data:")) dataText += clean.slice(5).trim();
        });
        if(!dataText) continue;
        let data;
        try{ data = JSON.parse(dataText); }catch(e){ continue; }
        if(onEvent(eventName, data) === false){ finished = true; break; }
      }
    }
  }finally{
    try{ reader.cancel(); }catch(e){ /* noop */ }
  }
}
