const PptxGenJS = require("pptxgenjs");
const pres = new PptxGenJS();

const colors = {
  primary: "1E2761", secondary: "0055CC", accent: "FF6B35",
  light: "E8EEF7", white: "FFFFFF", black: "1A1A1A",
  gray: "666666", lightGray: "CCCCCC"
};

const fonts = {
  title: { name: "Calibri", size: 40, bold: true, color: colors.white },
  heading: { name: "Calibri", size: 24, bold: true, color: colors.primary },
  subheading: { name: "Calibri", size: 18, bold: true, color: colors.primary },
  body: { name: "Calibri", size: 14, color: colors.black },
  small: { name: "Calibri", size: 11, color: colors.gray }
};

// Slide 1: Title
let s1 = pres.addSlide();
s1.background = { color: colors.primary };
s1.addText("KCS AI Agents", { x: 0.5, y: 2.5, w: 9, h: 1, ...fonts.title, align: "center" });
s1.addText("관세행정 AI 통합포털 프로토타입", { x: 0.5, y: 3.7, w: 9, h: 0.6, name: "Calibri", size: 20, color: colors.light, align: "center" });
s1.addText("AI 에이전트 기반 통합 플랫폼 아키텍처", { x: 0.5, y: 5.2, w: 9, h: 0.5, name: "Calibri", size: 14, color: colors.white, align: "center", italic: true });

// Slide 2: Directory Structure
let s2 = pres.addSlide();
s2.addText("프로젝트 디렉터리 구조", fonts.heading);

const dirs = [
  "KCS_AI_Agents/",
  "├── src/ [Python 백엔드]",
  "│   ├── agents/ [30+ AI 에이전트]",
  "│   ├── embeddings.py, neo4j_graph.py, workflows.py",
  "│   ├── config.py, llm.py, paths.py",
  "├── web/ [프론트엔드 웹 UI]",
  "│   ├── js/pages/, js/core/, js/analysis/",
  "│   ├── prompts/, vendor/",
  "├── data/ [DuckDB, ChromaDB, Evidence]",
  "├── config/ [thresholds.yaml]",
  "├── web_server.py, requirements.txt"
];

let y = 0.8;
dirs.forEach(d => {
  const size = d.includes("├") || d.includes("│") ? 9 : 11;
  s2.addText(d, { x: 0.5, y: y, w: 9, h: 0.25, name: "Courier New", size: size, color: colors.black });
  y += 0.25;
});

// Slide 3: Tech Stack
let s3 = pres.addSlide();
s3.addText("기술 스택", fonts.heading);

const stack = [
  ["언어", "Python 3.10~3.12"],
  ["AI 프레임워크", "LangChain 0.2+, LangGraph 0.1+"],
  ["LLM", "OpenAI, Anthropic, Google Gemini"],
  ["Database", "DuckDB (OLAP), Neo4j (그래프, Docker)"],
  ["RAG", "ChromaDB + LangChain Chroma"],
  ["임베딩", "HuggingFace (jhgan/ko-sroberta-multitask)"],
  ["문서", "PyPDF4, openpyxl"],
  ["프론트엔드", "Vanilla JavaScript + Drawflow"],
  ["서버", "Python BaseHTTPRequestHandler"]
];

let ty = 1.0;
stack.forEach(([cat, tech]) => {
  s3.addText(cat, { x: 0.5, y: ty, w: 2, h: 0.3, ...fonts.small, bold: true, color: colors.accent });
  s3.addText(tech, { x: 2.7, y: ty, w: 6.8, h: 0.3, ...fonts.small });
  ty += 0.35;
});

// Slide 4: Backend Architecture
let s4 = pres.addSlide();
s4.addText("백엔드 아키텍처", fonts.heading);

s4.addShape("rect", { x: 0.5, y: 1.1, w: 4.5, h: 1.2, fill: { color: colors.light }, line: { color: colors.primary, width: 2 }});
s4.addText("web_server.py\n(HTTP API)", { x: 0.5, y: 1.1, w: 4.5, h: 1.2, name: "Calibri", size: 14, bold: true, color: colors.primary, align: "center", valign: "middle" });

s4.addShape("rect", { x: 5.2, y: 1.1, w: 4.3, h: 1.2, fill: { color: colors.light }, line: { color: colors.primary, width: 2 }});
s4.addText("llm.py\n(LLM 라우팅)", { x: 5.2, y: 1.1, w: 4.3, h: 1.2, name: "Calibri", size: 14, bold: true, color: colors.primary, align: "center", valign: "middle" });

const boxData = [
  {x: 0.5, label: "30+ Agents\nModules"},
  {x: 2.8, label: "state.py\nCustomsState"},
  {x: 5.1, label: "workflows.py\nStateGraph"},
  {x: 7.3, label: "레지스트리"}
];

boxData.forEach(b => {
  s4.addShape("rect", { x: b.x, y: 2.7, w: 2.0, h: 1.0, fill: { color: colors.light }, line: { color: colors.secondary, width: 2 }});
  s4.addText(b.label, { x: b.x, y: 2.7, w: 2.0, h: 1.0, name: "Calibri", size: 12, bold: true, color: colors.secondary, align: "center", valign: "middle" });
});

const dbBoxes = [
  {x: 0.5, label: "DuckDB"},
  {x: 3.0, label: "Neo4j\nGraph"},
  {x: 5.5, label: "ChromaDB"},
  {x: 8.0, label: "Evidence"}
];

s4.addText("Data Layer", { x: 0.5, y: 4.1, w: 9, h: 0.3, ...fonts.subheading });

dbBoxes.forEach(b => {
  s4.addShape("rect", { x: b.x, y: 4.6, w: 2.2, h: 0.8, fill: { color: colors.light }, line: { color: colors.accent, width: 1.5 }});
  s4.addText(b.label, { x: b.x, y: 4.6, w: 2.2, h: 0.8, name: "Calibri", size: 10, color: colors.black, align: "center", valign: "middle" });
});

// Save
pres.save({ fileName: "KCS_AI_Agents_Architecture.pptx" });
console.log("✓ Saved: KCS_AI_Agents_Architecture.pptx");
