/* ═══════════════════════════════════════════════════════════════════
   표준보고서 지원 — 서식 기반 보고서 작성 워크벤치 (report-support.html)

   3단 구조(관세수사 '수사보고서 관리'와 동일한 골격·스타일 재사용):
     좌: 표준 서식 목록(대상 기준 작성 상태 배지)
     중: 프롬프트 템플릿 작성 — [작성 설정](입력 항목 + 프롬프트 템플릿) ↔ [보고서](문서 형식)
     우: 필수 항목 점검(서식 섹션 자동 대조) + AI 근거 검증

   서식은 실제 통관검사 문서 3종(통관 검사보고서 적합/부적합, 통관검사 연계
   정보분석 요청서)을 기준으로 구성한다. 각 서식은 입력 항목(fields)과
   프롬프트 템플릿(template)을 가지며, 템플릿의 {{키}}가 입력값으로 치환되어
   AI 초안 생성 프롬프트가 만들어진다. 템플릿은 사용자가 직접 수정할 수 있다.
   작성 결과는 대상×서식 단위로 workspace_state에 영속된다.
   ═══════════════════════════════════════════════════════════════════ */
import { escapeHtml, markdownToHtml, renderValidationDashboard } from "../core/dom.js";
import { streamLlmText } from "../analysis/shared/llm-stream.js";

/* 공통 작성 지침 — 모든 서식 템플릿 말미에 붙는 규칙 */
const COMMON_RULES = [
  "- 공문서 어투(개조식)로 작성하고, 표는 마크다운 표로 만드십시오.",
  "- 입력되지 않은 항목은 임의로 만들어 내지 말고 \"(미기재)\"로 표기하십시오.",
  "- 입력값에 없는 수치·금액·일자·모델명을 새로 만들지 마십시오.",
].join("\n");

/* ── 표준 서식 카탈로그 (통관검사 문서 3종) ─────────────────────────
   sections: 문서 섹션 제목 = '필수 항목 점검'의 대조 기준
   fields:   프롬프트 템플릿에 치환되는 입력 항목
   template: AI 초안 생성 프롬프트 기본 템플릿({{키}} 치환) */
export const REPORT_FORMS = [
  {
    id: "inspection_pass",
    group: "통관검사",
    icon: "✅",
    label: "통관 검사보고서 (적합)",
    desc: "현품 검사 결과가 신고 내용과 일치할 때 작성하는 검사보고서입니다.",
    docNoPrefix: "CIR",
    sections: ["1. 기본 정보", "2. 검사 개요", "3. 검사 항목 및 결과", "4. 종합 의견 및 조치사항"],
    guide: "검사 항목 5종(포장·수량 / 현품 일치성 / 원산지 표시 / 안전·규제 / 위해 물품)의 결과와 비고를 모두 채우십시오.",
    fields: [
      { key: "inspectNo",   label: "검사 번호",      hint: "예: CIR-20260808-01" },
      { key: "inspectDate", label: "검사 일자",      hint: "예: 2026년 08월 08일" },
      { key: "declNo",      label: "수입 신고번호",  hint: "예: 12345-26-100987X" },
      { key: "place",       label: "검사 장소",      hint: "예: 인천항 제1보세창고" },
      { key: "importer",    label: "수입자",         hint: "예: (주)에이비씨 무역" },
      { key: "itemName",    label: "신고 품명",      hint: "예: 전자부품 (PCB Assembly)" },
      { key: "qty",         label: "신고 수량",      hint: "예: 500 CTN" },
      { key: "weight",      label: "신고 중량",      hint: "예: 2,500 kg" },
      { key: "inspectType", label: "검사 유형",      def: "관리대상화물 현품 검사 (발췌 검사)" },
      { key: "scope",       label: "검사 대상",      hint: "예: 전체 500 CTN 중 20 CTN 무작위 발췌 검사" },
      { key: "purpose",     label: "검사 목적",      type: "textarea", rows: 2,
        def: "수입 신고 내역(품명, 수량, 규격)과 실제 화물의 일치 여부 확인 및 수입 금지 품목 포함 여부 점검" },
      { key: "findings",    label: "검사 항목별 확인 내용", type: "textarea", rows: 5,
        hint: "항목별로 한 줄씩 — 예: 포장 및 수량: 양호, 파손 없음 500 CTN 확인" },
      { key: "officer",     label: "검사 담당자",    hint: "예: 세관 검사관 홍길동" },
      { key: "witness",     label: "입회인",         hint: "예: (주)에이비씨 무역 관세사 김철수" },
    ],
    template: `당신은 대한민국 관세청 세관 검사관입니다. 아래 검사 내역을 바탕으로 "통관 검사보고서(적합)"를 작성하십시오.

[문서 정보]
- 문서번호: {{docNo}} · 발행일자: {{issueDate}}

[1. 기본 정보]
- 검사 번호: {{inspectNo}} · 검사 일자: {{inspectDate}}
- 수입 신고번호: {{declNo}} · 검사 장소: {{place}}
- 수입자: {{importer}} · 신고 품명: {{itemName}}
- 신고 수량: {{qty}} · 신고 중량: {{weight}}

[2. 검사 개요]
- 검사 유형: {{inspectType}}
- 검사 목적: {{purpose}}
- 검사 대상: {{scope}}

[3. 검사 항목별 확인 내용]
{{findings}}

[작성 지침]
- 다음 구성을 그대로 따르십시오: "## 1. 기본 정보", "## 2. 검사 개요", "## 3. 검사 항목 및 결과", "## 4. 종합 의견 및 조치사항"
- 1·2는 항목명과 값을 표로 정리하십시오.
- 3은 "검사 항목 | 점검 내용 | 결과 | 비고" 4열 표로 작성하고, 항목은 포장 및 수량 / 현품 일치성 / 원산지 표시 / 안전·규제 / 위해 물품 5개를 포함하십시오.
- 4에는 검사 결과(적합 PASS), 종합 소견, 향후 조치를 적으십시오. 향후 조치는 통관 수입신고 수리 승인 절차를 기준으로 작성하십시오.
- 문서 마지막에 "검사 담당자: {{officer}} (인/서명)", "입회인: {{witness}} (인/서명)" 서명란을 두십시오.
${COMMON_RULES}`,
  },
  {
    id: "inspection_reject",
    group: "통관검사",
    icon: "⚠️",
    label: "통관 검사보고서 (부적합)",
    desc: "신고 내용과 현품이 불일치하거나 표시 의무 위반이 확인될 때 작성합니다.",
    docNoPrefix: "CIR",
    sections: ["1. 기본 정보", "2. 검사 항목 및 결과", "3. 부적합 상세내용 및 조치 요구사항",
               "4. 종합 판정 및 통관 조치사항", "5. 부적합 증빙자료"],
    guide: "부적합 항목별로 발견 내용·관련 법령·조치 요구사항을 짝지어 적고, 증빙 사진 항목을 함께 기재하십시오.",
    fields: [
      { key: "inspectNo",   label: "검사 번호",      hint: "예: CIR-20260808-02" },
      { key: "inspectDate", label: "검사 일자" },
      { key: "declNo",      label: "수입 신고번호" },
      { key: "place",       label: "검사 장소" },
      { key: "importer",    label: "수입자" },
      { key: "itemName",    label: "신고 품명" },
      { key: "qty",         label: "신고 수량" },
      { key: "weight",      label: "신고 중량" },
      { key: "findings",    label: "검사 항목별 확인 내용", type: "textarea", rows: 5,
        hint: "항목별 결과(양호/부적합)와 비고 — 예: 현품 일치성: 부적합, 신고(PCB-A200) vs 실물(PCB-B300) 불일치" },
      { key: "ncItems",     label: "부적합 상세 내용", type: "textarea", rows: 5,
        hint: "부적합 항목별 발견 내용(상세) — 예: 수입신고서상 모델명은 PCB-A200이나 현품 각인은 PCB-B300으로 확인" },
      { key: "laws",        label: "관련 법령·규정",  type: "textarea", rows: 2,
        hint: "예: 관세법 제241조(수입의 신고), 대외무역법 제33조(원산지 표시의 의무)" },
      { key: "actions",     label: "조치 요구사항",   type: "textarea", rows: 3,
        hint: "예: 수입신고 정정 신청, 보세구역 내 원산지 표시 시정명령 후 재검사 요청" },
      { key: "evidence",    label: "증빙자료 목록",   type: "textarea", rows: 2,
        hint: "예: [증빙1] 모델명 불일치 촬영 사진 / [증빙2] 개별 제품 원산지 표시 누락 사진" },
      { key: "officer",     label: "검사 담당자" },
      { key: "witness",     label: "입회인" },
    ],
    template: `당신은 대한민국 관세청 세관 검사관입니다. 아래 검사 내역을 바탕으로 "통관 검사보고서(부적합)"를 작성하십시오.

[문서 정보]
- 문서번호: {{docNo}} · 발행일자: {{issueDate}}

[1. 기본 정보]
- 검사 번호: {{inspectNo}} · 검사 일자: {{inspectDate}}
- 수입 신고번호: {{declNo}} · 검사 장소: {{place}}
- 수입자: {{importer}} · 신고 품명: {{itemName}}
- 신고 수량: {{qty}} · 신고 중량: {{weight}}

[2. 검사 항목별 확인 내용]
{{findings}}

[3. 부적합 발견 내용]
{{ncItems}}

[관련 법령·규정]
{{laws}}

[조치 요구사항]
{{actions}}

[증빙자료]
{{evidence}}

[작성 지침]
- 다음 구성을 그대로 따르십시오: "## 1. 기본 정보", "## 2. 검사 항목 및 결과", "## 3. 부적합 상세내용 및 조치 요구사항", "## 4. 종합 판정 및 통관 조치사항", "## 5. 부적합 증빙자료"
- 2는 "검사 항목 | 점검 내용 | 결과 | 비고" 4열 표로 작성하고, 부적합 항목에는 증빙 참조 표기([증빙1] 등)를 붙이십시오.
- 3은 "부적합 항목 | 발견 내용(상세) | 관련 법령·규정 | 조치 요구사항" 4열 표로 작성하십시오.
- 4에는 최종 검사 결과(부적합 REJECTED / HOLD), 종합 의견, 후속 조치를 번호를 붙여 적으십시오.
- 5는 증빙별로 촬영 대상과 확인 내용을 정리하고 "[현장 촬영 사진 첨부 영역]"을 표기하십시오.
- 문서 마지막에 "검사 담당자: {{officer}} (인/서명)", "입회인: {{witness}} (인/서명)" 서명란을 두십시오.
${COMMON_RULES}`,
  },
  {
    id: "analysis_request",
    group: "통관검사 연계",
    icon: "📨",
    label: "정보분석 요청서",
    desc: "통관검사 적발 건을 정보분석 부서에 심층 분석 요청하는 공문입니다.",
    docNoPrefix: "IAR",
    sections: ["1. 대상 화물 및 요청자 정보", "2. 통관검사 적발 요지 및 정보분석 요청 사유",
               "3. 중점 정보분석 요청 항목", "4. 첨부 자료"],
    guide: "적발 요지는 확인된 사실만 적고, 요청 항목은 분석 부서가 바로 착수할 수 있도록 항목별로 구분하십시오.",
    fields: [
      { key: "declNo",      label: "수입 신고번호" },
      { key: "inspectDate", label: "검사/적발 일자" },
      { key: "importer",    label: "수입자" },
      { key: "exporter",    label: "해외 수출자",   hint: "예: XYZ Electronics Co., Ltd." },
      { key: "itemName",    label: "신고 품명" },
      { key: "unitPrice",   label: "신고 단가",     hint: "예: USD 5.00 / CTN" },
      { key: "reqDept",     label: "요청 부서",     hint: "예: 인천세관 수입검사 1과" },
      { key: "reqOfficer",  label: "요청 담당자",   hint: "예: 세관 검사관 홍길동" },
      { key: "suspicion",   label: "의심·혐의 유형", hint: "예: 저가신고(관세포탈) 의심 및 외환거래 이상 혐의" },
      { key: "summary",     label: "검사 적발 요지", type: "textarea", rows: 4,
        hint: "예: 저사양 모델로 신고되었으나 현품 검사 결과 고단가 모델로 확인, 신고 단가가 시장 가격 대비 현저히 낮음" },
      { key: "reason",      label: "분석 요청 사유", type: "textarea", rows: 3,
        hint: "예: 의도적 품명 위장 및 저가신고 가능성, 과거 수입 실적 전반의 가격 조작·이면결제 분석 필요" },
      { key: "reqItems",    label: "중점 정보분석 요청 항목", type: "textarea", rows: 6,
        def: `① 과거 수입실적 및 신고 단가 분석
 - 최근 3년간 해당 수입자의 동종 품목 수입 단가 변동 추이
 - 동일 수출자와의 거래 내역 및 단가 비교
 - 타 업체 동종 물품 수입건과의 신고 단가(과세가격) 형평성 비교
② 외환거래 내역 및 이면결제 추적
 - 수입신고 대금 결제 내역과 실제 해외 송금(지급) 내역 불일치 여부
 - 차액에 대한 제3자 송금 또는 불법 환치기(외국환거래법 위반) 등 이면결제 정황 확인
③ 연관 업체 및 우범 이력 조회
 - 대표자 및 특수관계자 명의의 타 수입통관 이력 및 적발 이력 조회
 - 관세 체납 이력 및 범칙조사 대상 여부 확인` },
      { key: "attachments", label: "첨부 자료",     type: "textarea", rows: 3,
        hint: "예: 1) 통관 검사보고서(부적합, CIR-20260808-02) 1부 2) 현품 촬영 사진 1부 3) 수입신고서·상업송장 사본 1부" },
    ],
    template: `당신은 대한민국 관세청 세관 검사관입니다. 아래 적발 내역을 바탕으로 "통관검사 연계 정보분석 요청서"를 작성하십시오.

[문서 정보]
- 문서번호: {{docNo}} · 요청일자: {{issueDate}}

[1. 대상 화물 및 요청자 정보]
- 수입 신고번호: {{declNo}} · 검사/적발 일자: {{inspectDate}}
- 수입자: {{importer}} · 해외 수출자: {{exporter}}
- 신고 품명: {{itemName}} · 신고 단가: {{unitPrice}}
- 요청 부서: {{reqDept}} · 요청 담당자: {{reqOfficer}}

[2. 적발 요지 및 요청 사유]
- 의심·혐의 유형: {{suspicion}}
- 검사 적발 요지: {{summary}}
- 분석 요청 사유: {{reason}}

[3. 중점 정보분석 요청 항목]
{{reqItems}}

[4. 첨부 자료]
{{attachments}}

[작성 지침]
- 다음 구성을 그대로 따르십시오: "## 1. 대상 화물 및 요청자 정보", "## 2. 통관검사 적발 요지 및 정보분석 요청 사유", "## 3. 중점 정보분석 요청 항목", "## 4. 첨부 자료"
- 1은 항목명과 값을 표로 정리하십시오.
- 3은 "항목명 | 중점 확인 및 분석 내용" 2열 표로 작성하고, 입력된 ①②③ 구분을 유지하십시오.
- 4는 번호를 붙여 나열하고 마지막에 "끝."을 표기한 뒤, "위와 같이 적발 화물에 대한 심층 정보분석을 요청합니다." 문장을 넣으십시오.
- 문서 마지막에 "요청 부서: {{reqDept}}", "요청자: {{reqOfficer}} (인/서명)" 서명란을 두십시오.
${COMMON_RULES}`,
  },
];

export function reportFormById(id){
  return REPORT_FORMS.find(form => form.id === id) || REPORT_FORMS[0];
}

/* ── 세션 상태(선택 상태만 — 작성 내용은 deps 저장소에 영속) ── */
let rsFormId = REPORT_FORMS[0].id;
let rsTargetId = "";          // "" = 연계 대상 미지정
let rsMode = "doc";           // "doc"(보고서 — 기본) | "setup"(기본 정보 확인·프롬프트 템플릿)
let rsEditing = false;        // 보고서 문서 직접 수정(contenteditable)
let rsBusy = "";              // "draft" | "validate"
let rsPhase = "";             // 초안 생성 진행 단계 안내
let deps = null;

function docKey(targetId, formId){ return `${targetId || "-"}::${formId}`; }
function store(){ return deps?.getStore?.() || {}; }
function docOf(targetId = rsTargetId, formId = rsFormId){ return store()[docKey(targetId, formId)] || null; }

function saveDoc(patch){
  const all = store();
  const key = docKey(rsTargetId, rsFormId);
  all[key] = { ...(all[key] || {}), ...patch, updatedAt: Date.now() };
  deps?.save?.();
  return all[key];
}

/* ── 작성 대상(연계 사건·기업) — 근거 자료 연계용, 선택 사항 ── */
function targetOptions(){
  const list = [];
  (deps?.customsJobs?.() || []).forEach(job => list.push({
    id: `C:${job.companyId}`,
    label: `${job.companyName || job.company || job.companyId} (${job.companyId})`,
    group: "진행중인 관세조사", kind: "customs",
    name: job.companyName || job.company || job.companyId, code: job.companyId,
  }));
  (deps?.invCases?.() || []).filter(item => !item.draft && !item.archived).forEach(item => list.push({
    id: `G:${item.caseId}`,
    label: `${item.targetName} (${item.caseId})`,
    group: "진행중인 관세수사", kind: "general",
    name: item.targetName, code: item.companyId || item.personId || item.caseId, caseId: item.caseId,
  }));
  return list;
}

function activeTarget(){
  return targetOptions().find(item => item.id === rsTargetId) || null;
}

/* ── 날짜·문서번호 기본값 ── */
function todayLabel(){
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}
function defaultDocNo(form){
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${form.docNoPrefix}-${ymd}-01`;
}

/* 입력값 — 저장분 → 서식 기본값 순으로 채운다 */
function fieldValues(form, doc){
  const saved = doc?.values || {};
  const values = {
    docNo: saved.docNo || defaultDocNo(form),
    issueDate: saved.issueDate || todayLabel(),
  };
  form.fields.forEach(field => {
    values[field.key] = saved[field.key] ?? field.def ?? "";
  });
  return values;
}

/* 템플릿 치환 — {{키}} → 입력값(빈 값은 "(미기재)") */
function renderTemplate(template, values){
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null || String(value).trim() === "" ? "(미기재)" : String(value);
  });
}

function docTemplate(form, doc){
  return doc?.template ?? form.template;
}

/* ── 증빙 사진 — 문서에 직접 삽입(base64 내장) ──
   원본 그대로 넣으면 작업공간 저장이 비대해지므로 캔버스로 축소·JPEG 재인코딩한다. */
const PHOTO_MAX_DIM = 1400;      // 긴 변 기준 축소 한도(px)
const PHOTO_QUALITY = 0.8;
const PHOTO_TOTAL_LIMIT = 6 * 1024 * 1024;   // 문서 1건의 본문(HTML) 총량 상한

function resizeImageToDataUrl(file){
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve("");
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try{ resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY)); }
        catch(error){ resolve(""); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function photoFigureHtml(dataUrl, caption){
  return `<figure class="rs-photo"><img src="${dataUrl}" alt="${escapeHtml(caption)}">`
    + `<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

/* 선택한 사진을 문서에 삽입 — 수정 중이면 커서 위치, 아니면 문서 끝에 붙인다 */
async function insertPhotos(fileList){
  const files = [...(fileList || [])].filter(file => /^image\//.test(file.type));
  if(!files.length) return;
  const doc = docOf();
  if(!hasBody(doc)){
    alert("보고서 본문을 먼저 작성한 뒤 사진을 등록하세요.");
    return;
  }
  const pieces = [];
  for(const file of files){
    const dataUrl = await resizeImageToDataUrl(file);
    if(dataUrl) pieces.push(photoFigureHtml(dataUrl, file.name.replace(/\.[^.]+$/, "")));
  }
  if(!pieces.length){ alert("등록할 수 있는 이미지가 없습니다."); return; }
  const added = pieces.join("");
  const box = document.getElementById("rsDocBody");
  const editingNow = rsEditing && box?.isContentEditable;
  const nextHtml = editingNow ? null : docBodyHtml(doc) + added;
  if(!editingNow && nextHtml.length > PHOTO_TOTAL_LIMIT){
    alert("사진 용량이 너무 큽니다. 장수를 줄이거나 더 작은 사진을 사용하세요.");
    return;
  }
  if(editingNow){
    box.focus();
    document.execCommand("insertHTML", false, added);
    saveDoc({ bodyHtml: box.innerHTML });   // 편집 상태 유지 — 재렌더하지 않는다
  }else{
    saveDoc({ bodyHtml: nextHtml });
    rerender();
  }
}

function photoCount(doc){
  return (String(doc?.bodyHtml || "").match(/<img\b/g) || []).length;
}

/* ── 보고서 본문 — AI 초안은 마크다운, 사용자가 문서에서 직접 고치면 HTML로 보관 ── */
function docBodyHtml(doc){
  if(doc?.bodyHtml) return doc.bodyHtml;
  return doc?.body ? markdownToHtml(doc.body) : "";
}
function docBodyText(doc){
  if(doc?.bodyHtml){
    const el = document.createElement("div");
    el.innerHTML = doc.bodyHtml;
    return el.textContent || "";
  }
  return doc?.body || "";
}
function hasBody(doc){
  return !!(doc?.bodyHtml || doc?.body);
}

/* ── 필수 항목 점검 ── */
function sectionCoverage(form, body){
  const text = String(body || "");
  const done = form.sections.filter(section => text.includes(section));
  return {
    done,
    missing: form.sections.filter(section => !text.includes(section)),
    pct: form.sections.length ? Math.round((done.length / form.sections.length) * 100) : 0,
  };
}

function fmtDate(value){
  if(!value) return "";
  const d = new Date(Number(value) || value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ko-KR");
}

/* 서식 기본값(def)·자동값(문서번호·일자)만 있는 상태는 '미작성' —
   사용자가 실제로 채운 입력 항목이 있을 때만 '입력중'으로 본다. */
function docStatus(doc, form){
  if(!doc) return { label: "미작성", cls: "wait" };
  if(doc.registeredAt) return { label: "등록됨", cls: "done" };
  if(doc.drafting) return { label: "초안 생성 중", cls: "run" };
  if(hasBody(doc)) return { label: "작성중", cls: "run" };
  const touched = form && doc.values && form.fields.some(field => {
    const value = String(doc.values[field.key] ?? "").trim();
    return value && value !== String(field.def ?? "").trim();
  });
  return touched ? { label: "입력중", cls: "run" } : { label: "미작성", cls: "wait" };
}

/* ── 좌: 표준 서식 목록 ── */
function formListHtml(){
  const groups = [...new Set(REPORT_FORMS.map(form => form.group))];
  return groups.map(group => `
    <div class="rs-form-group">
      <p class="rs-form-group-title">${escapeHtml(group)}</p>
      ${REPORT_FORMS.filter(form => form.group === group).map(form => {
        const status = docStatus(docOf(rsTargetId, form.id), form);
        return `
          <button type="button" class="gi-report3-item${form.id === rsFormId ? " active" : ""}" data-rs-form="${escapeHtml(form.id)}">
            <strong>${form.icon} ${escapeHtml(form.label)}</strong>
            <span>입력 ${form.fields.length}항목 · 섹션 ${form.sections.length}개</span>
            <em class="gi-chip-state ${status.cls}">${escapeHtml(status.label)}</em>
          </button>`;
      }).join("")}
    </div>`).join("");
}

/* ── 중 · 기본 정보 확인 — AI가 연계 대상 자료에서 채운 값(확인 전용) + 프롬프트 템플릿 ── */
function setupPaneHtml(form, doc){
  const values = fieldValues(form, doc);
  const extracted = doc?.extractedAt;
  const rowHtml = [{ key: "docNo", label: "문서번호" }, { key: "issueDate", label: "발행·요청일자" }, ...form.fields]
    .map(field => {
      const raw = String(values[field.key] ?? "").trim();
      const filled = !!raw;
      return `
        <div class="rs-info-row${field.type === "textarea" ? " wide" : ""}">
          <span class="rs-info-label">${escapeHtml(field.label)}</span>
          <span class="rs-info-value${filled ? "" : " empty"}">${filled ? escapeHtml(raw).replace(/\n/g, "<br>") : "(미기재)"}</span>
        </div>`;
    }).join("");

  return `
    <div class="rs-setup">
      <div class="rs-setup-block">
        <div class="rs-setup-head">
          <strong>기본 정보 ${extracted
            ? (doc?.extractedCount
                ? `<em class="rs-auto-chip">AI 자동 생성 ${doc.extractedCount}항목</em>`
                : `<em class="rs-auto-chip warn">자료 부족</em>`)
            : ""}</strong>
          <span class="muted">${extracted
            ? (doc?.extractedCount
                ? `연계 대상 자료에서 자동 추출 · ${escapeHtml(fmtDate(extracted))} — 수정은 [보고서]에서 문서를 직접 고치세요`
                : "연계 대상 자료에서 확인된 항목이 없습니다 — 대상의 기초데이터 분석을 먼저 수행하면 자동으로 채워집니다")
            : "연계 대상을 선택하고 [AI 초안 생성]을 실행하면 대상 자료에서 자동으로 채워집니다"}</span>
        </div>
        <div class="rs-info-grid">${rowHtml}</div>
      </div>

      <div class="rs-setup-block">
        <div class="rs-setup-head">
          <strong>프롬프트 템플릿</strong>
          <button type="button" class="btn-inline-action" data-rs-template-reset>기본 템플릿 복원</button>
        </div>
        <textarea class="rs-template-area" data-rs-template rows="14">${escapeHtml(docTemplate(form, doc))}</textarea>
        <p class="muted" style="font-size:11.5px;margin:0">
          {{docNo}} {{issueDate}} ${form.fields.map(f => `{{${f.key}}}`).join(" ")} 가 위 기본 정보로 치환되어 AI에 전달됩니다.
        </p>
      </div>
    </div>`;
}

/* ── 중 · 보고서 — 표준 문서 형식 ── */
function docPaneHtml(form, doc, target){
  const user = deps?.currentUser?.() || {};
  const status = docStatus(doc, form);
  const values = fieldValues(form, doc);
  const bodyHtml = hasBody(doc)
    ? docBodyHtml(doc)
    : `<div class="gi-report3-empty"><p>아직 작성된 보고서가 없습니다.<br>
        위에서 <b>연계 대상</b>을 선택하고 <b>AI 초안 생성</b>을 실행하면<br>
        대상 자료로 기본 정보와 보고서가 함께 작성됩니다.</p></div>`;
  const photos = photoCount(doc);
  return `
    <div class="gi-report3-doc">
      <input type="file" id="rsPhotoInput" accept="image/*" multiple style="display:none">
      ${rsEditing ? `<p class="rs-edit-hint">문서를 직접 클릭해 수정하세요 — 표·문단을 그대로 편집할 수 있습니다.
        사진은 커서 위치에 삽입되며, 사진을 지우려면 선택 후 Delete를 누르세요. 완료 후 [저장]을 누르세요.</p>` : ""}
      ${photos ? `<p class="rs-photo-note">📷 첨부 사진 ${photos}장</p>` : ""}
      <div class="gi-doc-frame">
        <div class="gi-doc-head">
          <div class="gi-doc-row"><span>서식</span><b>${escapeHtml(form.label)}</b></div>
          <div class="gi-doc-row"><span>문서번호</span><b>${escapeHtml(values.docNo)}</b></div>
          <div class="gi-doc-row"><span>연계 대상</span><b>${escapeHtml(target ? target.label : "미지정")}</b></div>
          <div class="gi-doc-row"><span>작성자</span><b>${escapeHtml(user.name || "-")} · ${escapeHtml((deps?.currentUserGroup?.() || {}).team || "관세청")}</b></div>
          <div class="gi-doc-row"><span>작성일</span><b>${escapeHtml(fmtDate(doc?.updatedAt) || "-")}</b></div>
          <div class="gi-doc-row"><span>상태</span><b>${escapeHtml(status.label)}${doc?.registeredAt ? ` (${escapeHtml(fmtDate(doc.registeredAt))})` : ""}</b></div>
        </div>
        <div class="gi-doc-body markdown-output${rsEditing ? " rs-doc-editing" : ""}" id="rsDocBody"
          ${rsEditing ? `contenteditable="true" spellcheck="false"` : ""}>${bodyHtml}</div>
        <div class="gi-doc-foot">관세청 · 표준보고서 지원</div>
      </div>
    </div>`;
}

/* ── 중: 액션 바 + 모드 전환 ── */
function centerPaneHtml(){
  const form = reportFormById(rsFormId);
  const doc = docOf();
  const target = activeTarget();
  const options = targetOptions();
  const groups = [...new Set(options.map(item => item.group))];
  const busyDraft = rsBusy === "draft";
  return `
    <div class="rs-target-bar">
      <div class="rs-mode-tabs">
        <button type="button" class="ci-result-tab${rsMode === "doc" ? " active" : ""}" data-rs-mode="doc">보고서</button>
        <button type="button" class="ci-result-tab${rsMode === "setup" ? " active" : ""}" data-rs-mode="setup">기본 정보 확인</button>
      </div>
      <label>연계 대상</label>
      <select id="rsTargetSelect" class="scenario-template-select">
        <option value="">-- 미지정 --</option>
        ${groups.map(group => `
          <optgroup label="${escapeHtml(group)}">
            ${options.filter(item => item.group === group).map(item =>
              `<option value="${escapeHtml(item.id)}"${item.id === rsTargetId ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
          </optgroup>`).join("")}
      </select>
      <div class="rs-doc-actions">
        ${rsEditing ? `
          <button type="button" class="btn secondary" data-rs-photo title="커서 위치에 사진을 삽입합니다">📷 사진 등록</button>
          <button type="button" class="btn" data-rs-save>저장</button>
          <button type="button" class="btn secondary" data-rs-edit>취소</button>
        ` : `
          <button type="button" class="btn" data-rs-draft ${busyDraft ? "disabled" : ""}>
            ${busyDraft ? (rsPhase || "생성 중…") : hasBody(doc) ? "↺ 초안 재작성" : "▶ AI 초안 생성"}
          </button>
          ${rsMode === "doc" ? `
            <button type="button" class="btn secondary" data-rs-photo ${hasBody(doc) ? "" : "disabled"}
              title="현장 촬영 사진을 보고서에 첨부합니다">📷 사진 등록</button>
            <button type="button" class="btn secondary" data-rs-edit ${hasBody(doc) ? "" : "disabled"}>✎ 수정</button>
            <button type="button" class="btn secondary" data-rs-register ${hasBody(doc) ? "" : "disabled"}>등록</button>
          ` : ""}
        `}
      </div>
    </div>
    ${rsMode === "setup" ? setupPaneHtml(form, doc) : docPaneHtml(form, doc, target)}`;
}

/* ── 우: 필수 항목 점검 + AI 근거 검증 ── */
function validationPaneHtml(){
  const form = reportFormById(rsFormId);
  const doc = docOf();
  const coverage = sectionCoverage(form, docBodyText(doc));
  const busy = rsBusy === "validate";
  return `
    <div class="gi-report3-valid">
      <div class="rs-check-card">
        <div class="rs-check-head">
          <strong>서식 필수 섹션</strong>
          <b>${coverage.done.length}/${form.sections.length} · ${coverage.pct}%</b>
        </div>
        <div class="gis-guide-bar"><i style="width:${coverage.pct}%"></i></div>
        <ul class="rs-check-list">
          ${form.sections.map(section => {
            const ok = coverage.done.includes(section);
            return `<li class="${ok ? "ok" : "miss"}">${ok ? "✅" : "⚠"} ${escapeHtml(section)}</li>`;
          }).join("")}
        </ul>
        <p class="muted" style="font-size:11.5px;margin:0">${escapeHtml(form.guide)}</p>
      </div>

      <div class="rs-check-card">
        <div class="rs-check-head">
          <strong>AI 근거 검증</strong>
          <button type="button" class="btn secondary" style="height:26px;padding:0 10px;font-size:11px"
            data-rs-validate ${hasBody(doc) && !busy ? "" : "disabled"}>${busy ? "검증 중…" : "▶ 검증 실행"}</button>
        </div>
        <div id="rsValidationBody" class="rs-validation-body">
          ${doc?.validation
            ? renderValidationDashboard(doc.validation)
            : `<p class="muted" style="font-size:12px">본문 작성 후 검증을 실행하면 기본 정보와의 일치, 근거 없는 서술, 필수 섹션 반영을 점검합니다.</p>`}
        </div>
      </div>
    </div>`;
}

/* ── 페이지 — 3단 구조 ── */
export function reportSupportPage(){
  return `
    <section class="card rs-hub">
      <div class="rs-page-head">
        <div>
          <h2>표준보고서 지원</h2>
          <p class="muted">서식과 연계 대상을 고르면 AI가 대상 자료로 기본 정보와 보고서를 작성합니다. 문서를 그대로 확인·수정하고 필수 섹션과 근거를 검증하세요.</p>
        </div>
      </div>
      <div class="gi-report3 rs-report3">
        <aside class="gi-report3-col">
          <div class="rs-col-head">표준 서식</div>
          <div class="gi-report3-list" id="rsFormList">${formListHtml()}</div>
        </aside>
        <div class="resize-gutter x" data-resize-min="200" title="드래그하여 크기 조절"></div>
        <section class="gi-report3-col rs-doc-col">
          <div class="rs-col-head">보고서 작성</div>
          ${centerPaneHtml()}
        </section>
        <div class="resize-gutter x" data-resize-target="next" data-resize-min="260" title="드래그하여 크기 조절"></div>
        <aside class="gi-report3-col">
          <div class="rs-col-head">검증</div>
          ${validationPaneHtml()}
        </aside>
      </div>
    </section>
  `;
}

/* ── 프롬프트 템플릿 수집(재렌더 없이 DOM에서 읽어 저장) ──
   기본 정보(values)는 AI가 채우므로 여기서는 템플릿만 반영한다. */
function collectSetup(){
  const templateEl = document.querySelector("[data-rs-template]");
  if(!templateEl) return docOf();
  return saveDoc({ template: templateEl.value });
}

/* ── 위임 핸들러 ── */
function rerender(){ deps?.render?.("report"); }

document.addEventListener("click", (event) => {
  if(!deps) return;

  const formBtn = event.target.closest("[data-rs-form]");
  if(formBtn){
    if(rsMode === "setup" && document.querySelector("[data-rs-template]")) collectSetup();
    rsFormId = formBtn.dataset.rsForm;
    rsEditing = false;
    rerender();
    return;
  }

  const modeBtn = event.target.closest("[data-rs-mode]");
  if(modeBtn){
    if(rsMode === "setup") collectSetup();
    rsMode = modeBtn.dataset.rsMode;
    rsEditing = false;
    rerender();
    return;
  }

  if(event.target.closest("[data-rs-template-reset]")){
    const area = document.querySelector("[data-rs-template]");
    if(area) area.value = reportFormById(rsFormId).template;
    saveDoc({ template: null });
    rerender();
    return;
  }

  if(event.target.closest("[data-rs-edit]")){
    rsEditing = !rsEditing;
    rerender();
    return;
  }

  if(event.target.closest("[data-rs-save]")){
    // 문서 형태 그대로 수정한 결과(HTML)를 보관 — 표·문단 서식이 유지된다
    const box = document.getElementById("rsDocBody");
    if(box) saveDoc({ bodyHtml: box.innerHTML, drafting: false });
    rsEditing = false;
    rerender();
    return;
  }

  if(event.target.closest("[data-rs-register]")){
    if(!hasBody(docOf())){ alert("등록할 보고서 본문이 없습니다."); return; }
    saveDoc({ registeredAt: Date.now() });
    rerender();
    return;
  }

  if(event.target.closest("[data-rs-photo]")){
    if(!hasBody(docOf())){ alert("보고서 본문을 먼저 작성한 뒤 사진을 등록하세요."); return; }
    document.getElementById("rsPhotoInput")?.click();
    return;
  }

  if(event.target.closest("[data-rs-draft]")){ runDraft(); return; }
  if(event.target.closest("[data-rs-validate]")){ runValidation(); return; }
});

/* 입력 항목·템플릿은 포커스 유지를 위해 재렌더 없이 저장(blur 시점) */
document.addEventListener("change", (event) => {
  if(!deps) return;
  if(event.target?.id === "rsTargetSelect"){
    if(rsMode === "setup" && document.querySelector("[data-rs-template]")) collectSetup();
    rsTargetId = event.target.value;
    rsEditing = false;
    // 대상 기업 상세를 미리 적재 — 기본 정보 자동 생성의 근거 확보
    deps?.ensureTargetDetail?.(activeTarget());
    rerender();
    return;
  }
  if(event.target?.matches?.("[data-rs-template]")) collectSetup();
  if(event.target?.id === "rsPhotoInput"){
    // FileList는 value 초기화 시 비워지므로 먼저 배열로 복사한다
    const files = [...event.target.files];
    event.target.value = "";   // 같은 파일 재선택 허용
    insertPhotos(files);
  }
});

/* ① 기본 정보 자동 생성 — 연계 대상 자료에서 서식 입력 항목을 추출해 JSON으로 받는다 */
async function extractValues(form, target, context){
  const fieldList = form.fields
    .map(field => `- ${field.key} (${field.label})${field.hint ? ` — ${field.hint}` : ""}`).join("\n");
  const prompt = `당신은 대한민국 관세청의 보고서 작성 지원 AI입니다.
아래 [대상 자료]에서 "${form.label}" 작성에 필요한 항목 값을 추출하십시오.

[대상]
${target ? `${target.name} (${target.code})${target.caseId ? ` · 사건번호 ${target.caseId}` : ""}` : "(미지정)"}

[대상 자료]
${context || "(등록된 자료 없음)"}

[추출할 항목]
${fieldList}

[규칙]
- 결과는 오직 JSON 객체 하나로만 출력하십시오. 설명·코드펜스·주석을 붙이지 마십시오.
- 키는 위 항목의 영문 키를 그대로 쓰고, 값은 문자열로 작성하십시오.
- 자료에서 확인되지 않는 항목은 값을 빈 문자열("")로 두십시오. 절대 추측해서 만들지 마십시오.
- 여러 줄이 필요한 항목은 줄바꿈(\\n)을 포함한 문자열로 작성하십시오.`;
  let raw = "";
  try{
    raw = await streamLlmText(prompt, { mode: "int" });
  }catch(error){
    console.warn("[report-support] 기본 정보 추출 실패", error);
    return {};
  }
  const match = String(raw).match(/\{[\s\S]*\}/);
  if(!match) return {};
  try{
    const parsed = JSON.parse(match[0]);
    const picked = {};
    form.fields.forEach(field => {
      const value = parsed[field.key];
      if(typeof value === "string" && value.trim()) picked[field.key] = value.trim();
    });
    return picked;
  }catch(error){
    console.warn("[report-support] 기본 정보 JSON 파싱 실패", error);
    return {};
  }
}

/* AI 초안 생성 — ① 연계 대상 자료로 기본 정보 자동 생성 → ② 보고서 본문 작성 */
async function runDraft(){
  if(rsBusy) return;
  const form = reportFormById(rsFormId);
  const doc = rsMode === "setup" && document.querySelector("[data-rs-template]") ? collectSetup() : docOf();
  const photos = photoCount(doc);
  if(hasBody(doc) && !confirm(
    `현재 "${form.label}" 보고서를 새 초안으로 대체합니다.`
    + (photos ? `\n첨부된 사진 ${photos}장도 함께 삭제됩니다.` : "")
    + `\n계속할까요?`)) return;
  const target = activeTarget();
  const context = deps?.targetContext?.(target) || "";

  rsBusy = "draft";
  rsMode = "doc";          // 생성 진행을 보고서 화면에서 확인
  rsEditing = false;
  rsPhase = target ? "기본 정보 생성 중…" : "보고서 작성 중…";
  saveDoc({ drafting: true });
  rerender();

  // ① 연계 대상이 있으면 대상 자료에서 기본 정보를 먼저 채운다(확인 전용)
  let values = fieldValues(form, doc);
  if(target){
    const extracted = await extractValues(form, target, context);
    const merged = { ...values, ...extracted };
    // 확인된 항목이 없어도 시도 이력을 남긴다 — 자료 부족을 화면에서 알 수 있게
    saveDoc({ values: merged, extractedAt: Date.now(), extractedCount: Object.keys(extracted).length });
    values = merged;
    rsPhase = "보고서 작성 중…";
    rerender();
  }

  // ② 기본 정보를 치환한 프롬프트로 보고서 본문 생성
  const filled = renderTemplate(docTemplate(form, doc), values);
  const prompt = context
    ? `${filled}\n\n[연계 대상 시스템 자료 — 참고용, 없는 사실을 만들지 말 것]\n${context}`
    : filled;
  const paint = acc => {
    const box = document.getElementById("rsDocBody");
    if(box) box.innerHTML = markdownToHtml(acc);
  };
  let text = "";
  try{
    text = await streamLlmText(prompt, { mode: "ext_int", onToken: paint });
  }catch(error){
    console.warn("[report-support] 초안 생성 실패", error);
  }
  rsBusy = "";
  rsPhase = "";
  // 새 초안은 마크다운 본문으로 보관(직접 수정분 bodyHtml은 초기화)
  saveDoc({ body: text || doc?.body || "", bodyHtml: null, drafting: false });
  rerender();
}

/* AI 근거 검증 — 입력값 대조·근거 없는 서술·필수 섹션 반영 점검 */
async function runValidation(){
  if(rsBusy) return;
  const form = reportFormById(rsFormId);
  const doc = docOf();
  if(!hasBody(doc)) return;
  rsBusy = "validate";
  rerender();
  const values = fieldValues(form, doc);
  const inputSummary = ["docNo", "issueDate", ...form.fields.map(f => f.key)]
    .map(key => `- ${key}: ${String(values[key] || "(미기재)").slice(0, 300)}`).join("\n");
  const prompt = `당신은 대한민국 관세청의 보고서 검증 담당자입니다. 아래 "${form.label}"를 검증하십시오.

[검증 항목]
1. 검증 결과: 통과/보완 필요 중 하나로 판정
2. 필수 섹션 반영률: 서식 필수 섹션(${form.sections.join(", ")}) 반영 여부
3. 기본 정보 일치도: 보고서 내용이 아래 기본 정보와 일치하는지, 기본 정보에 없는 수치·모델명·금액이 등장하는지
4. 근거 충실도: 판단·의견에 근거가 제시되었는지
5. 법령 검토: 인용 법령·조문 적정성
6. 보완 권고: 구체적 보완 사항

[기본 정보]
${inputSummary}

[보고서 본문]
${docBodyText(doc)}

각 항목을 "N. 항목명: 결과" 형태의 개조식으로 간결하게 작성하고, 없는 내용을 지어내지 마십시오.`;
  const paint = acc => {
    const box = document.getElementById("rsValidationBody");
    if(box) box.innerHTML = markdownToHtml(acc);
  };
  let text = "";
  try{
    text = await streamLlmText(prompt, { mode: "int", onToken: paint });
  }catch(error){
    console.warn("[report-support] 검증 실패", error);
  }
  rsBusy = "";
  saveDoc({ validation: text || "검증 결과를 받지 못했습니다." });
  rerender();
}

/* app-runtime이 호출 — 저장소·대상 목록·재렌더 등 엔진 의존성 주입 */
export function initReportSupport(injected){
  deps = injected;
  return { reportSupportPage };
}
