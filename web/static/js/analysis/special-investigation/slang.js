import { escapeHtml } from "../../core/dom.js";

export function renderSlangPanel(){
  const slangDict = [
    { term:"아이스",  meaning:"필로폰(메스암페타민)", category:"각성제", confidence:98 },
    { term:"작대기", meaning:"주사기", category:"도구", confidence:95 },
    { term:"떡",     meaning:"대마초 압축분", category:"대마", confidence:90 },
    { term:"야바",   meaning:"메스암페타민 알약(태국산)", category:"각성제", confidence:97 },
    { term:"찰리",   meaning:"코카인", category:"코카인", confidence:88 },
    { term:"초코",   meaning:"헤로인(갈색)", category:"아편류", confidence:85 },
    { term:"LSD",    meaning:"도장·우표 모양 환각제", category:"환각제", confidence:99 },
    { term:"빽빽이", meaning:"필로폰 대량(1kg↑)", category:"각성제", confidence:82 },
  ];
  return `
    <div style="display:flex;gap:16px;height:100%;flex-direction:column">
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e">
        <strong>핵심 RAG</strong> — 은어사전 기반 해독 서비스입니다. 수사 문서에서 탐지된 은어를 실시간으로 해독하고, 연관 용어를 추천합니다.
      </div>
      <div style="display:flex;gap:14px;flex:1;min-height:0;flex-wrap:wrap">
        <div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:8px">
          <div class="panel-section-hdr"><span>은어 해독기</span></div>
          <div style="display:flex;gap:8px">
            <input id="slangInput" class="form-input" style="flex:1" placeholder="은어 또는 문장을 입력하세요 (예: 아이스 한 작대기 챙겨와)">
            <button class="btn primary" data-slang-decode>해독</button>
          </div>
          <div id="slangDecodeResult" style="min-height:80px;background:#f8fbff;border:1px solid #dde8ff;border-radius:8px;padding:12px;font-size:13px;color:#41506a">
            해독 결과가 여기에 표시됩니다. 입력 문장 내 은어를 자동으로 탐지하여 정확한 의미로 변환합니다.
          </div>
          <div class="panel-section-hdr" style="margin-top:4px"><span>연관 은어 추천</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${["아이스","야바","찰리","떡","초코","LSD","빽빽이"].map(t=>`
              <button class="btn small" data-slang-suggest="${escapeHtml(t)}">${escapeHtml(t)}</button>
            `).join("")}
          </div>
        </div>
        <div style="flex:1;min-width:280px">
          <div class="panel-section-hdr" style="margin-bottom:8px"><span>은어사전 (${slangDict.length}건)</span></div>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>은어</th><th>의미</th><th>분류</th><th>신뢰도</th></tr></thead>
              <tbody>
                ${slangDict.map(s=>`
                  <tr>
                    <td><strong style="color:#1e40af">${escapeHtml(s.term)}</strong></td>
                    <td>${escapeHtml(s.meaning)}</td>
                    <td><span style="background:#eef4ff;color:#1e40af;border-radius:4px;padding:1px 6px;font-size:11px">${escapeHtml(s.category)}</span></td>
                    <td><span style="font-size:12px;color:${s.confidence>=90?"#16a34a":"#d97706"}">${s.confidence}%</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

export const slangSubtab = {
  id: "slang",
  label: "은어/수사어 RAG",
  group: "tools",
  aiServices: ["rag_investigation", "rag_global", "law"],
  render: renderSlangPanel,
};
