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

  lines.forEach(line => {
    const trimmed = line.trim();
    if(!trimmed){ closeList(); return; }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if(heading){
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if(bullet){
      openList("ul");
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      return;
    }
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if(numbered){
      openList("ol");
      html.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      return;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  });
  closeList();
  return html.join("");
}
