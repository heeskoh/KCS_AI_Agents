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

function inlineMarkdown(value){
  return escapeHtml(value)
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
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if(numbered){
      openList("ol");
      html.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  closeList();
  return html.join("");
}
