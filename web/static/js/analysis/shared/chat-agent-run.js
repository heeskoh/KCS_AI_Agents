/* 대화창용 의도분석 실행기 — 관세행정 Copilot과 동일한 흐름을 채팅에 붙인다.
   사용자 질문 → /api/analyze_intent 로 의도분석 → 내부 AI 서비스가 지정되면
   /api/run 워크플로로 실행하고 결과를 마크다운으로 합쳐 채팅 버블에 스트리밍한다.
   내부 서비스가 없으면(llm_direct) handled:false 를 돌려 호출부가 일반 LLM 답변으로 폴백한다.

   Copilot(app-runtime homeRunAnalysis)과 같은 엔드포인트·규약을 쓰되, 홈 화면의
   전역 상태(카드·KPI)에 묶이지 않아 워크벤치 대화창 등 어디서든 재사용 가능하다. */

/** 의도분석 후 내부 AI 서비스를 실행한다.
 * @param {string} userText  사용자 질문
 * @param {object} opts
 *   - companyId   대화가 묶인 대상 기업(사건) — 의도분석이 대상을 못 잡아도 이 값으로 스코프
 *   - targetType  "company" | "person" (기본 company)
 *   - llmMode     "int" | "ext" | "ext_int" (기본 "int")
 *   - onToken(accMarkdown)  진행 중 누적 마크다운을 받는 콜백
 *   - signal      AbortSignal
 * @returns {Promise<{handled:boolean, text:string, agents:string[]}>}
 *   handled=false 이면 실행할 내부 서비스가 없어 호출부가 LLM 답변으로 폴백해야 한다.
 */
export async function runChatIntent(userText, {
  companyId = "", targetType = "company", llmMode = "int",
  onToken = null, signal = null,
} = {}){
  // 1) 의도분석
  let intent;
  try {
    const res = await fetch("/api/analyze_intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userText, llm_mode: llmMode }),
      signal,
    });
    intent = await res.json();
  } catch(err) {
    if(err?.name === "AbortError") return { handled: false, text: "", agents: [] };
    return { handled: false, text: "", agents: [] };
  }

  if(intent?.mode === "error") return { handled: false, text: "", agents: [] };

  const agents = (intent?.agent_defs || []).filter(a => a && a.key);
  // 내부 서비스 없음 → 일반 LLM 답변으로 폴백
  if(intent?.mode !== "agents" || !agents.length){
    return { handled: false, text: "", agents: [] };
  }

  const runCompanyId = intent.company_id || companyId || "__NO_COMPANY_SELECTED__";
  const reasoning = intent.reasoning || "";
  const labels = agents.map(a => a.label);

  const header = () =>
    `🔎 **의도분석** — 실행 AI 서비스: ${labels.join(", ")}`
    + (reasoning ? `\n_판단 근거: ${reasoning}_` : "")
    + "\n\n";

  // 2) 워크플로 실행 (POST SSE — 프롬프트가 실려도 URL 한도 영향 없음)
  const scenarioItems = agents.map((a, i) => ({
    id: `chat_${i}`, type: a.type || "agent", key: a.key, label: a.label,
    order: i + 1, behaviors: ["기본"], behavior: "기본", instruction: userText,
  }));
  const payload = {
    company_id: runCompanyId,
    scenario: {
      scenario_items: scenarioItems,
      target_type: targetType, targetType,
      db_query: true, rag_enabled: true, rag_customs_public: true, rag_audit: true,
      llm_mode: llmMode, myai_mode: true, user_prompt: userText,
    },
  };

  const outputs = new Map();     // label → 결과 텍스트
  const status = new Map();      // label → "running" | "done" | "error"
  agents.forEach(a => status.set(a.label, "wait"));

  const compose = (running) => {
    let md = header();
    for(const a of agents){
      const st = status.get(a.label);
      const badge = st === "done" ? "✅" : st === "error" ? "⚠️" : st === "running" ? "⏳" : "•";
      md += `### ${badge} ${a.label}\n`;
      const body = outputs.get(a.label);
      if(body) md += body.trim() + "\n\n";
      else if(st === "running") md += "_실행 중…_\n\n";
      else if(running) md += "_대기 중_\n\n";
    }
    return md.trim();
  };

  let resp;
  try {
    resp = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch(err) {
    if(err?.name === "AbortError") return { handled: true, text: compose(false), agents: labels };
    return { handled: true, text: header() + "\n_서버에 연결하지 못했습니다._", agents: labels };
  }
  if(!resp.ok || !resp.body){
    return { handled: true, text: header() + "\n_실행 요청이 반려되었습니다._", agents: labels };
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = () => { if(onToken) onToken(compose(true)); };
  emit();

  const handleEvent = (name, data) => {
    if(name === "step" && data){
      const label = data.label;
      if(!label) return;
      if(data.status === "running"){ status.set(label, "running"); }
      else if(data.status === "done"){ status.set(label, "done"); outputs.set(label, String(data.output || "")); }
      else if(data.status === "error"){ status.set(label, "error"); outputs.set(label, String(data.error || "실행 오류")); }
      emit();
    }
  };

  while(true){
    let chunk;
    try { chunk = await reader.read(); }
    catch(err){ break; }
    if(chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let idx;
    while((idx = buffer.indexOf("\n\n")) >= 0){
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const evName = /event:\s*(\w+)/.exec(frame)?.[1] || "message";
      const dataMatch = /data:\s*([\s\S]*)/.exec(frame);
      if(!dataMatch) continue;
      let data = {};
      try { data = JSON.parse(dataMatch[1]); } catch(e){ continue; }
      handleEvent(evName, data);
      if(evName === "workflow" && (data.status === "completed" || data.status === "failed")){
        try { reader.cancel(); } catch(e){}
      }
    }
  }

  return { handled: true, text: compose(false), agents: labels };
}
