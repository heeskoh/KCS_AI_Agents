/* 범용 LLM 스트리밍 클라이언트 — /api/llm_stream(SSE 프레임: token/done/error).
   agentic 전역 상태(agenticRunAbort/agenticRunning)에 묶이지 않아 어디서든 재사용 가능하다.
   프레임 파싱은 core-engine/sse-runner(readSseResponse)가 담당.
   스트리밍 실패 시 /api/llm_query 단발 호출로 폴백. */
import { readSseResponse } from "../../core-engine/sse-runner.js";

async function llmAnswerOnce(prompt, mode, signal){
  try{
    const res = await fetch("/api/llm_query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, llm_mode: mode }),
      signal,
    }).then(r => r.json());
    return res.answer || "";
  }catch(error){
    if(error?.name === "AbortError") return "";
    return "";
  }
}

/**
 * LLM 텍스트 스트리밍. onToken(누적 텍스트)이 토큰마다 호출된다.
 * @returns {Promise<string>} 최종 텍스트 (실패/중단 시 부분 결과 또는 빈 문자열)
 */
export async function streamLlmText(prompt, { mode = "", onToken = null, signal = null } = {}){
  let resp;
  try{
    resp = await fetch("/api/llm_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, llm_mode: mode }),
      signal,
    });
  }catch(error){
    if(error?.name === "AbortError") return "";
    return llmAnswerOnce(prompt, mode, signal);
  }
  if(!resp.ok || !resp.body) return llmAnswerOnce(prompt, mode, signal);

  let acc = "", failed = false;
  await readSseResponse(resp, (ev, data) => {
    if(ev === "token" && data.text){
      acc += data.text;
      if(onToken) onToken(acc);
    } else if(ev === "done"){
      if(data.text) acc = data.text;
      return false;   // 서버가 keep-alive로 연결을 유지하므로 done 수신 시 즉시 종료
    } else if(ev === "error"){
      failed = true;
      return false;
    }
  });
  if(failed && !acc) return llmAnswerOnce(prompt, mode, signal);
  return acc;
}
