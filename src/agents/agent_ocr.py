"""Agent: OCR/문서인식.

단순 OCR(텍스트 덤프)이 아니라, 첨부 문서를 인식해 **값을 신고서 항목에 매핑하고
보고서 형태로 재구성**하는 서비스다. 표를 그대로 옮기지 않고 영역별 서술형으로 정리한다.

처리 흐름
  1) 파일 유형 판별 (수입신고서 / 인보이스 / B/L / 포장명세서 / 원산지증명서 / 통신내역 / 기타)
  2) 값 추출 — 본문 텍스트가 있으면 LLM이 실제로 읽어 매핑,
     스캔 이미지처럼 텍스트를 얻을 수 없으면 OCR 시뮬레이션으로 서식 항목을 채운다
     (시뮬레이션인 경우 보고서에 반드시 표시한다)
  3) 보고서 렌더링 — 신고개요 / 거래당사자 / 운송·화물 / 품목 / 금액·세액 / 요건 /
     검토 착안사항 / 후속 AI 서비스
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from src.agents.ocr_engine import extract_text
from src.agents.state import CustomsState
from src.llm import llm


TEXT_SUFFIXES = {".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html", ".htm", ".log"}
TABLE_SUFFIXES = {".csv", ".tsv", ".xls", ".xlsx"}
DOCUMENT_SUFFIXES = {".pdf", ".doc", ".docx", ".hwp", ".hwpx"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}
COMMUNICATION_HINTS = {
    "통신", "sms", "문자", "sns", "카톡", "카카오", "대화", "메시지", "message",
    "chat", "sender", "receiver", "발신", "수신", "전화", "연락처", "call",
}

# 파일명·본문으로 판별하는 서류 종류 (앞에서부터 먼저 일치)
DOC_TYPES = [
    ("import_declaration", "수입신고서",
     ("수입신고", "import declaration", "신고번호", "품목번호", "과세가격")),
    ("invoice", "상업송장(Invoice)",
     ("invoice", "인보이스", "송장", "commercial invoice")),
    ("bill_of_lading", "선하증권(B/L)",
     ("b/l", "bill of lading", "선하증권", "awb", "화물운송장")),
    ("packing_list", "포장명세서(Packing List)",
     ("packing", "포장명세")),
    ("certificate_origin", "원산지증명서(C/O)",
     ("certificate of origin", "원산지증명", "c/o", "form a")),
    ("contract", "매매계약서",
     ("contract", "계약서", "agreement")),
]

# 수입신고서 매핑 스키마 — (영역, [(키, 표시명)])
DECLARATION_SCHEMA: list[tuple[str, list[tuple[str, str]]]] = [
    ("신고 개요", [
        ("declaration_no", "신고번호"), ("declaration_date", "신고일"),
        ("customs_office", "세관·과"), ("declaration_type", "신고구분"),
        ("import_type", "수입종류"), ("transaction_type", "거래구분"),
        ("clearance_plan", "통관계획"),
    ]),
    ("거래 당사자", [
        ("importer", "수입자"), ("taxpayer", "납세의무자"),
        ("taxpayer_business_no", "사업자등록번호"), ("filer", "신고인(관세사)"),
        ("overseas_supplier", "해외거래처"), ("supplier_country", "공급국"),
    ]),
    ("운송·화물", [
        ("bl_no", "B/L(AWB) 번호"), ("cargo_control_no", "화물관리번호"),
        ("vessel_name", "선기명"), ("departure_country", "적출국"),
        ("arrival_port", "도착항"), ("arrival_date", "입항일"),
        ("transport_type", "운송형태"), ("total_weight", "총중량"),
        ("total_packages", "포장개수"),
    ]),
    ("품목 내역", [
        ("hs_code", "품목번호(HS)"), ("item_name", "품명"),
        ("trade_item_name", "거래품명"), ("brand", "상표"),
        ("model_spec", "모델·규격"), ("quantity", "수량"),
        ("net_weight", "순중량"), ("origin_country", "원산지"),
        ("origin_marking", "원산지표시"),
    ]),
    ("금액·세액", [
        ("incoterms", "인코텀즈"), ("payment_amount", "결제금액"),
        ("exchange_rate", "환율"), ("customs_value", "과세가격"),
        ("freight", "운임"), ("insurance", "보험료"),
        ("duty_rate", "관세율"), ("duty_amount", "관세액"),
        ("vat_amount", "부가세액"), ("reduction_rate", "감면율"),
        ("total_tax", "총세액"),
    ]),
    ("수입요건·확인", [
        ("requirement_type", "수입요건"), ("requirement_agency", "요건확인기관"),
        ("requirement_approval_no", "요건승인번호"),
        ("post_verification_agency", "사후확인기관"),
        ("inspection_type", "검사구분"),
    ]),
]
SCHEMA_KEYS = [k for _, fields in DECLARATION_SCHEMA for k, _ in fields]

_SOURCE_LABEL = {
    "text": "문서 본문 인식",
    "ocr": "OCR 판독(Tesseract kor+eng)",
    "simulated": "OCR 시뮬레이션(판독 불가)",
}

_EXTRACT_PROMPT = """당신은 관세청 수입신고서 인식 AI입니다.
아래 문서 내용을 읽고 수입신고서 항목에 값을 매핑하여 JSON으로만 반환하세요.

[문서 정보]
- 파일명: {name}
- 판별된 서류 종류: {doc_label}

[문서 내용]
{content}

[반환 형식] 순수 JSON만 (마크다운/설명 없이)
{{
  "doc_label": "<서류 종류>",
  "confidence": <0~100 정수, 값을 실제로 읽어낸 정도>,
  "fields": {{ {field_hint} }},
  "findings": ["<검토 착안사항 1>", "<검토 착안사항 2>"]
}}

[작성 지침]
- 문서에 없는 항목은 빈 문자열("")로 두고 지어내지 마십시오.
- 금액은 통화기호와 함께 원문 표기를 유지하십시오 (예: "USD 33,300.00").
- findings에는 저가신고·품목분류·원산지·요건 관점에서 확인이 필요한 사항만 적으십시오.
"""

_SIMULATE_PROMPT = """당신은 관세청 OCR 시뮬레이션 엔진입니다.
아래 파일은 스캔 이미지 등으로 본문 텍스트를 추출할 수 없습니다.
파일명에서 유추되는 품목을 근거로 **데모용 샘플 수입신고서 값**을 생성하세요.

[파일 정보]
- 파일명: {name}
- 판별된 서류 종류: {doc_label}

[반환 형식] 순수 JSON만
{{
  "doc_label": "<서류 종류>",
  "confidence": <55~80 사이 정수>,
  "fields": {{ {field_hint} }},
  "findings": ["<검토 착안사항>"]
}}

[작성 지침]
- 파일명의 품목과 실제로 맞는 HS 품목번호·수입요건·사후확인기관을 사용하십시오.
  (예: 냉동 과실 → 0811.90-9000, 식품의약품안전처, 수입식품등 수입신고 확인증)
- 금액·수량·환율은 서로 계산이 맞아떨어지도록 구성하십시오
  (과세가격 = 결제금액 x 환율, 관세액 = 과세가격 x 관세율, 부가세 = (과세가격+관세액) x 10%).
- 실제 신고서에서 쓰는 형식을 지키십시오 (신고번호 예: 41234-26-100001U).
- 신고일·입항일은 {today} 기준 최근 3개월 이내로, 환율은 1,300~1,400 KRW/USD
  범위의 소수점 4자리(예: 1,354.6439)로 작성하십시오.
- 금액은 통화 표기를 앞에 두십시오 (예: "USD 33,300.00", "KRW 47,548,000").
"""

_REVIEW_PROMPT = """당신은 관세청 심사 담당자입니다.
아래 수입신고서 인식 결과를 보고 조사·심사 관점의 검토 의견을 작성하세요.

{mapped}

작성 항목 (각 2~4줄, 개조식):
1. 신고 내용 요약
2. 확인이 필요한 항목 — 값이 비어 있거나 정합성이 의심되는 부분
3. 위험 신호 — 저가신고·품목분류·원산지·요건 관점
4. 후속 AI 서비스 활용 방안

문서에 없는 사실을 단정하지 말고, 확인이 필요하면 "확인 필요"로 표기하십시오.
"""


def _as_list(value: Any) -> list[Any]:
    if not value:
        return []
    return value if isinstance(value, list) else [value]


def _file_name(file_info: dict[str, Any]) -> str:
    return str(file_info.get("name") or file_info.get("url") or file_info.get("link") or "문서").strip()


def _suffix(name: str) -> str:
    return Path(name.split("?", 1)[0]).suffix.lower()


def _has_text(file_info: dict[str, Any]) -> bool:
    return (file_info.get("encoding") or "").lower() == "text" and bool(file_info.get("content"))


def _text_sample(file_info: dict[str, Any], limit: int = 6000) -> str:
    """인식 대상 본문 — 텍스트 첨부는 그대로, PDF·이미지는 OCR로 추출한다."""
    if _has_text(file_info):
        return str(file_info.get("content") or "")[:limit]
    return extract_text(file_info)[:limit]


def _is_communication_record(name: str, text: str) -> bool:
    haystack = f"{name}\n{text[:2000]}".lower()
    if any(token in haystack for token in COMMUNICATION_HINTS):
        return True
    lines = text.splitlines()
    header = lines[0].lower() if lines else ""
    return (
        ("sender" in header and "receiver" in header)
        or ("from" in header and "to" in header and "date" in header)
        or ("발신" in header and "수신" in header)
    )


def _detect_doc_type(name: str, text: str) -> tuple[str, str]:
    haystack = f"{name}\n{text[:3000]}".lower()
    for code, label, hints in DOC_TYPES:
        if any(h in haystack for h in hints):
            return code, label
    if _is_communication_record(name, text):
        return "communication", "통신·거래 내역"
    return "other", "기타 서류"


def _routes_for(doc_code: str) -> list[str]:
    if doc_code == "import_declaration":
        return ["declaration_verify", "hs_verify", "customs_value", "law", "summary"]
    if doc_code in {"invoice", "packing_list"}:
        return ["customs_value", "declaration_verify", "summary"]
    if doc_code == "certificate_origin":
        return ["origin_analysis", "hs_verify", "law", "summary"]
    if doc_code == "bill_of_lading":
        return ["route_analysis", "declaration_verify", "summary"]
    if doc_code == "communication":
        return ["network", "proceeds_tracking", "summary"]
    return ["summary", "law"]


def _field_hint() -> str:
    return ", ".join(f'"{k}": ""' for k in SCHEMA_KEYS)


def _parse_json(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`").strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start >= 0 and end > start:
        raw = raw[start:end + 1]
    return json.loads(raw)


def _recognize(file_info: dict[str, Any]) -> dict[str, Any]:
    """파일 1건 → 신고서 항목에 매핑된 인식 결과."""
    name = _file_name(file_info)
    text = _text_sample(file_info)
    doc_code, doc_label = _detect_doc_type(name, text)
    simulated = not text.strip()
    # 인식 경로 구분 — 텍스트 첨부 / OCR 판독 / 시뮬레이션
    source = ("text" if _has_text(file_info)
              else "simulated" if simulated else "ocr")

    result: dict[str, Any] = {
        "name": name,
        "url": file_info.get("url") or file_info.get("link") or "",
        "suffix": _suffix(name),
        "size": file_info.get("size") or 0,
        "doc_code": doc_code,
        "doc_label": doc_label,
        "simulated": simulated,
        "source": source,
        "ocr_chars": len(text) if source == "ocr" else 0,
        "confidence": 0,
        "fields": {},
        "findings": [],
        "recommended_agents": _routes_for(doc_code),
    }

    if llm is None:
        result["findings"] = ["LLM을 사용할 수 없어 항목 매핑을 수행하지 못했습니다."]
        return result

    prompt = (
        _SIMULATE_PROMPT.format(name=name, doc_label=doc_label, field_hint=_field_hint(),
                                today=date.today().isoformat())
        if simulated else
        _EXTRACT_PROMPT.format(name=name, doc_label=doc_label, field_hint=_field_hint(),
                               content=text)
    )
    try:
        parsed = _parse_json(llm.invoke(prompt).content)
        result["doc_label"] = str(parsed.get("doc_label") or doc_label)
        result["confidence"] = int(parsed.get("confidence") or 0)
        fields = parsed.get("fields") or {}
        result["fields"] = {k: str(fields.get(k) or "").strip() for k in SCHEMA_KEYS}
        result["findings"] = [str(f) for f in (parsed.get("findings") or []) if str(f).strip()]
    except Exception as exc:                                   # noqa: BLE001
        print(f"[Agent] OCR 항목 매핑 실패: {exc}")
        result["findings"] = [f"항목 매핑 중 오류가 발생했습니다: {exc}"]
    return result


def _render_document(item: dict[str, Any]) -> str:
    """인식 결과 1건 → 보고서 본문 (표가 아닌 영역별 항목 나열)."""
    fields = item.get("fields") or {}
    filled = sum(1 for v in fields.values() if v)
    lines = [
        f"### {item['name']}",
        f"- 서류 종류: {item['doc_label']}",
        f"- 인식 방식: {_SOURCE_LABEL.get(item.get('source'), '문서 본문 인식')}"
        + (f" · 판독 {item['ocr_chars']:,}자" if item.get("ocr_chars") else "")
        + f" · 신뢰도 {item['confidence']}%",
        f"- 매핑된 항목: {filled}/{len(SCHEMA_KEYS)}개",
        "",
    ]
    for section, spec in DECLARATION_SCHEMA:
        rows = [(label, fields.get(key, "")) for key, label in spec if fields.get(key)]
        if not rows:
            continue
        lines.append(f"**{section}**")
        lines.extend(f"- {label}: {value}" for label, value in rows)
        lines.append("")

    missing = [label for _, spec in DECLARATION_SCHEMA for key, label in spec if not fields.get(key)]
    if missing:
        lines.append(f"**미인식 항목** ({len(missing)}개)")
        lines.append("- " + ", ".join(missing[:14]) + (" 외" if len(missing) > 14 else ""))
        lines.append("")
    if item.get("findings"):
        lines.append("**검토 착안사항**")
        lines.extend(f"- {f}" for f in item["findings"])
        lines.append("")
    return "\n".join(lines)


def _render_result(analyses: list[dict[str, Any]], recommended: list[str]) -> str:
    by_source: dict[str, int] = {}
    for a in analyses:
        key = a.get("source") or "text"
        by_source[key] = by_source.get(key, 0) + 1
    detail = ", ".join(f"{_SOURCE_LABEL[k]} {n}건" for k, n in by_source.items() if k in _SOURCE_LABEL)
    head = [
        "[OCR/문서인식 결과]",
        f"- 인식 문서: {len(analyses)}건" + (f" ({detail})" if detail else ""),
        f"- 서류 종류: {', '.join(sorted({a['doc_label'] for a in analyses}))}",
        f"- 후속 AI 서비스 추천: {', '.join(recommended) if recommended else '없음'}",
        "",
        "## 문서별 인식 내용",
        "",
    ]
    return "\n".join(head + [_render_document(a) for a in analyses])


def _normalize_link(link: Any) -> dict[str, Any]:
    if isinstance(link, dict):
        url = str(link.get("url") or link.get("link") or "")
        return {"name": str(link.get("name") or url or "전자서고 링크"), "url": url,
                "type": link.get("type") or "file_link", "mime": link.get("mime") or "",
                "encoding": "link", "content": "", "size": int(link.get("size") or 0)}
    url = str(link or "")
    return {"name": url or "전자서고 링크", "url": url, "type": "file_link",
            "mime": "", "encoding": "link", "content": "", "size": 0}


def _collect_file_inputs(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    files = [dict(f) for f in _as_list(scenario.get("uploaded_files"))]
    links = (_as_list(scenario.get("file_links"))
             + _as_list(scenario.get("document_links"))
             + _as_list(scenario.get("repository_links")))
    files.extend(_normalize_link(link) for link in links)
    return files


def agent_ocr(state: CustomsState) -> CustomsState:
    """첨부 문서를 인식해 신고서 항목에 매핑하고 보고서로 재구성한다."""
    print("[Agent] OCR/문서인식 시작")

    scenario = state.get("scenario") or {}
    files = _collect_file_inputs(scenario)
    if not files:
        result = (
            "[OCR/문서인식 결과]\n"
            "- 첨부 파일 또는 전자서고 파일 링크가 없습니다.\n"
            "- 파일을 등록하거나 scenario.file_links/document_links에 전자서고 링크를 제공하세요."
        )
        return {**state, "ocr_result": result, "ocr_recommended_agents": []}

    analyses = [_recognize(f) for f in files]
    recommended: list[str] = []
    for item in analyses:
        for agent in item["recommended_agents"]:
            if agent not in recommended:
                recommended.append(agent)

    result = _render_result(analyses, recommended)

    if llm:
        try:
            mapped = "\n\n".join(_render_document(a) for a in analyses)[:7000]
            review = llm.invoke(_REVIEW_PROMPT.format(mapped=mapped)).content
            result += "\n## 심사 검토 의견\n" + review
        except Exception as exc:                               # noqa: BLE001
            print(f"[Agent] OCR 검토 의견 생성 실패: {exc}")

    print("[Agent] OCR/문서인식 완료")
    return {
        **state,
        "ocr_result": result,
        "document_intelligence_result": analyses,
        "ocr_recommended_agents": recommended,
    }
