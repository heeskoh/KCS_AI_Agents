/* 재사용 가능한 채팅 스레드 컴포넌트 — 수사정보 분석 등 대화형 화면용.
   메시지 목록(user/assistant 버블) + 입력창 + 전송. 전송 시 streamLlmText로
   실시간 토큰 스트리밍을 어시스턴트 버블에 직접 반영한다(전체 재렌더 금지). */
import { escapeHtml, markdownToHtml } from "../../core/dom.js";
import { streamLlmText } from "./llm-stream.js";

export const CHAT_HISTORY_CAP = 50;   // workspace_state 비대화 방지

function bubbleHtml(message){
  const role = message.role === "user" ? "user" : "assistant";
  const body = role === "user"
    ? escapeHtml(message.text).replace(/\n/g, "<br>")
    : markdownToHtml(message.text || "");
  return `
    <div class="chat-bubble ${role}">
      <div class="chat-bubble-body markdown-output">${body}</div>
    </div>
  `;
}

export function chatThreadHtml({ mountId, messages = [], placeholder = "질문을 입력하세요", emptyText = "대화를 시작하세요." }){
  return `
    <div class="chat-thread" id="${escapeHtml(mountId)}">
      <div class="chat-thread-list" data-chat-list>
        ${messages.length ? messages.map(bubbleHtml).join("") : `<div class="chat-thread-empty">${escapeHtml(emptyText)}</div>`}
      </div>
      <div class="chat-thread-input">
        <textarea data-chat-input rows="2" placeholder="${escapeHtml(placeholder)}"></textarea>
        <button type="button" class="btn primary" data-chat-send>전송</button>
      </div>
    </div>
  `;
}

/* 채팅 스레드 동작 바인딩.
   opts:
     mountId       — chatThreadHtml과 동일 id
     getMessages   — () => 메시지 배열(영속 저장소 참조)
     buildPrompt   — (messages, userText) => LLM 프롬프트 문자열(컨텍스트 포함)
     mode          — llm_mode ("int" 권장)
     onDone        — (messages) => void (saveCanvasState 등) */
export function bindChatThread({ mountId, getMessages, buildPrompt, mode = "int", onDone = null }){
  const root = document.getElementById(mountId);
  if(!root) return;
  const list = root.querySelector("[data-chat-list]");
  const input = root.querySelector("[data-chat-input]");
  const send = root.querySelector("[data-chat-send]");
  if(!list || !input || !send) return;
  let streaming = false;

  const scrollBottom = () => { list.scrollTop = list.scrollHeight; };
  scrollBottom();

  const appendBubble = message => {
    const empty = list.querySelector(".chat-thread-empty");
    if(empty) empty.remove();
    list.insertAdjacentHTML("beforeend", bubbleHtml(message));
    scrollBottom();
    return list.lastElementChild;
  };

  const submit = async () => {
    const text = String(input.value || "").trim();
    if(!text || streaming) return;
    streaming = true;
    send.disabled = true;
    input.value = "";
    const messages = getMessages();
    const userMessage = { role: "user", text, at: Date.now() };
    messages.push(userMessage);
    appendBubble(userMessage);
    const assistantEl = appendBubble({ role: "assistant", text: "..." });
    const bodyEl = assistantEl.querySelector(".chat-bubble-body");
    const answer = await streamLlmText(buildPrompt(messages, text), {
      mode,
      onToken: acc => {
        if(bodyEl){ bodyEl.innerHTML = markdownToHtml(acc); scrollBottom(); }
      },
    });
    const finalText = answer || "응답을 받지 못했습니다. 잠시 후 다시 시도하세요.";
    if(bodyEl) bodyEl.innerHTML = markdownToHtml(finalText);
    messages.push({ role: "assistant", text: finalText, at: Date.now() });
    while(messages.length > CHAT_HISTORY_CAP) messages.shift();
    streaming = false;
    send.disabled = false;
    scrollBottom();
    if(onDone) onDone(messages);
  };

  send.addEventListener("click", submit);
  input.addEventListener("keydown", event => {
    if(event.key === "Enter" && !event.shiftKey){
      event.preventDefault();
      submit();
    }
  });

  /* 외부(정보 카드 인용 등)에서 입력창에 텍스트 삽입 */
  root.insertCite = text => {
    input.value = input.value ? `${input.value}\n${text}` : text;
    input.focus();
  };
}
