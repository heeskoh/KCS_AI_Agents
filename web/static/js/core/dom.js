export function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function dataTable(headers, rows){
  return `<table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/* 이미지 삽입 허용 범위 — 첨부 사진(data URI)과 앱 내부 정적 경로만.
   escapeHtml이 바꾸는 문자(&<>"')가 없는 형태만 통과시키므로 이스케이프 뒤에 치환해도 안전하다.
   javascript: 등 다른 스킴은 매칭되지 않아 그대로 텍스트로 남는다. */
const SAFE_IMG_SRC = /^(?:data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+|\/static\/[\w\-./]+)$/;

export function inlineMarkdown(value){
  return escapeHtml(value)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt, src) =>
      SAFE_IMG_SRC.test(src)
        ? `<img src="${src}" alt="${alt}" class="md-image" loading="lazy">`
        : whole)
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`(.+?)`/g,"<code>$1</code>");
}

function isTableRow(line){
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.length > 0;
}

function isTableSeparator(line){
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim());
}

function splitTableRow(line){
  const trimmed = line.trim().replace(/^\|/,"").replace(/\|$/,"");
  return trimmed.split("|").map(cell => cell.trim());
}

function renderTable(headerLine, rows){
  const headers = splitTableRow(headerLine);
  const head = `<thead><tr>${headers.map(h=>`<th>${inlineMarkdown(h)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map(r=>{
    const cells = splitTableRow(r);
    return `<tr>${cells.map(c=>`<td>${inlineMarkdown(c)}</td>`).join("")}</tr>`;
  }).join("")}</tbody>`;
  return `<table class="table">${head}${body}</table>`;
}

export function markdownToHtml(value){
  const lines = String(value ?? "").replace(/\r\n/g,"\n").split("\n");
  const html = [];
  let listOpen = false;
  let listType = "";
  const closeList = () => {
    if(listOpen){
      html.push(`</${listType}>`);
      listOpen = false;
      listType = "";
    }
  };
  const openList = (type) => {
    if(listOpen && listType !== type) closeList();
    if(!listOpen){
      html.push(`<${type}>`);
      listOpen = true;
      listType = type;
    }
  };

  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    const trimmed = line.trim();
    if(!trimmed){ closeList(); continue; }

    if(isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i+1])){
      closeList();
      const bodyRows = [];
      let j = i + 2;
      while(j < lines.length && isTableRow(lines[j].trim())){
        bodyRows.push(lines[j]);
        j++;
      }
      html.push(renderTable(trimmed, bodyRows));
      i = j - 1;
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if(quote){
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if(heading){
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if(bullet){
      openList("ul");
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if(numbered){
      openList("ol");
      html.push(`<li value="${numbered[1]}">${inlineMarkdown(numbered[2])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  closeList();
  return html.join("");
}

/**
 * 보고서 검증 결과 텍스트(번호 항목 형식)를 헤더 라인과 항목 배열로 분리한다.
 * 각 항목은 { title, value, detail[] } 형태.
 */
export function parseValidationResult(value){
  const lines = String(value ?? "").replace(/\r\n/g,"\n").split("\n");
  const header = [];
  const items = [];
  let current = null;

  lines.forEach(line => {
    const m = line.match(/^\s*\d+\.\s*(.+)$/);
    if(m){
      if(current) items.push(current);
      const rest = m[1].trim();
      const colonIdx = rest.search(/[:：]/);
      const title = colonIdx >= 0 ? rest.slice(0, colonIdx).trim() : rest;
      const itemValue = colonIdx >= 0 ? rest.slice(colonIdx + 1).trim() : "";
      current = { title, value: itemValue, detail: [] };
      return;
    }
    const trimmed = line.trim();
    if(!trimmed) return;
    if(current) current.detail.push(trimmed.replace(/^[-*]\s*/, ""));
    else header.push(trimmed);
  });
  if(current) items.push(current);
  return { header, items };
}

function vdGradeBadge(text){
  const grade = text.match(/(상|중|하)/);
  if(grade){
    const cls = grade[1] === "상" ? "good" : grade[1] === "중" ? "mid" : "bad";
    return { cls, label: grade[1] };
  }
  if(/불일치|미포함|상이|모순|부적정|불충분/.test(text)) return { cls:"bad", label:"확인 필요" };
  if(/일치|포함|적정|충분|정확/.test(text)) return { cls:"good", label:"양호" };
  if(/주의|보완|일부/.test(text)) return { cls:"mid", label:"주의" };
  return { cls:"neutral", label:"참고" };
}

function vdMetricCard(icon, item){
  if(!item) return "";
  const fullText = [item.value, ...item.detail].join(" ");
  const badge = vdGradeBadge(fullText);
  const desc = item.detail.length ? item.detail.join(" ") : (item.value || "내용 없음");
  return `
    <div class="vd-metric-card">
      <div class="vd-metric-head">
        <span class="vd-metric-icon">${icon}</span>
        <span class="vd-metric-title">${escapeHtml(item.title)}</span>
        <span class="vd-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
      </div>
      <p>${inlineMarkdown(desc)}</p>
    </div>`;
}

/**
 * 보고서 검증 결과를 3단(검증결과 요약 / 항목별 메트릭 / 보완 권고) 대시보드로 렌더링한다.
 * 형식이 맞지 않으면 일반 마크다운으로 폴백한다.
 */
export function renderValidationDashboard(value){
  const { header, items } = parseValidationResult(value);
  if(!items.length) return markdownToHtml(value);

  const find = keyword => items.find(it => it.title.includes(keyword));

  const result     = find("검증 결과");
  const coverage   = find("반영률");
  const evidence   = find("충실도");
  const consistency= find("일관성");
  const external   = find("외부");
  const lawCheck   = find("법령") || find("판례");
  const recommend  = find("보완");

  const resultValue = result ? (result.value || result.detail[0] || "—") : "—";
  let resultTone = "neutral";
  if(/통과|적정/.test(resultValue)) resultTone = "pass";
  else if(/보완/.test(resultValue)) resultTone = "warn";
  else if(/실패|부적정/.test(resultValue)) resultTone = "fail";

  const coverageText = coverage ? (coverage.value || coverage.detail[0] || "") : "";
  const coverageMatch = coverageText.match(/(\d+)\s*\/\s*(\d+)/);
  const coveragePct = coverageMatch
    ? Math.round((Number(coverageMatch[1]) / Math.max(1, Number(coverageMatch[2]))) * 100)
    : 0;
  const coverageDesc = coverage ? (coverage.detail.join(" ") || coverageText) : "검증 정보 없음";

  const recommendItems = recommend
    ? (recommend.detail.length ? recommend.detail : (recommend.value ? [recommend.value] : []))
    : [];

  return `
    <div class="validation-dashboard">
      ${header.length ? `<div class="vd-header">${header.map(h=>escapeHtml(h)).join(" · ")}</div>` : ""}
      <div class="vd-summary">
        <div class="vd-card">
          <h4>검증 결과</h4>
          <div class="vd-result ${resultTone}">
            <span class="vd-result-value">${escapeHtml(resultValue)}</span>
          </div>
        </div>
        <div class="vd-card">
          <h4>에이전트 결과 반영률</h4>
          <div class="vd-coverage-row">
            <strong>${escapeHtml(coverageMatch ? coverageMatch[0] : (coverageText || "—"))}</strong>
            <span style="font-size:12px;color:#64748b">${coveragePct}%</span>
          </div>
          <div class="vd-gauge"><div class="vd-gauge-fill" style="width:${coveragePct}%"></div></div>
          <p class="vd-coverage-desc">${inlineMarkdown(coverageDesc)}</p>
        </div>
      </div>
      <div class="vd-metrics">
        ${vdMetricCard("📑", evidence)}
        ${vdMetricCard("⚖️", consistency)}
        ${vdMetricCard("🔗", external)}
        ${vdMetricCard("📜", lawCheck)}
      </div>
      ${recommendItems.length ? `
      <div class="vd-recommend">
        <h4>⚠️ 보완 권고</h4>
        <ul>${recommendItems.map(r => `<li>${inlineMarkdown(r)}</li>`).join("")}</ul>
      </div>` : ""}
    </div>
  `;
}
