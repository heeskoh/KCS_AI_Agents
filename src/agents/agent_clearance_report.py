"""Agent: 통관보고서 생성.

수입신고 1건을 대상으로 현장 통관보고서를 작성한다.

입력
  - 신고번호 (scenario.declaration_no 또는 지시문에서 추출)
  - 현장 사진 1장 이상 (scenario.uploaded_files 중 이미지)

처리
  1) 신고번호로 DuckDB에서 신고 내용을 읽어온다 (헤더 + 품목 + 세액)
  2) 등록된 사진을 증빙으로 목록화하고, 비전 판독이 가능하면 사진 설명을 붙인다
  3) 신고 내용과 사진 증빙을 근거로 통관 의견을 작성한다

RAG 검색이 아니라 신고건 단위 보고서 등록 서비스다.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date
from pathlib import Path
from typing import Any

import duckdb

from src.agents.ocr_engine import vision_model
from src.agents.state import CustomsState
from src.llm import llm

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "customs.duckdb"

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}
# 신고번호 형태 — DV2-C-1001-01 / AU-C-1041-003 / DP-C-3001-012 / HZ-2026-0534 / 41234-26-100001U
# 접두어에 숫자가 섞이므로(DV2) [A-Z]만으로 잡으면 안 된다.
_DECL_PATTERNS = [
    re.compile(r"\b[A-Z][A-Z0-9]{1,3}-C-\d{3,4}-\d{2,3}\b"),
    re.compile(r"\b[A-Z][A-Z0-9]{1,3}-\d{4}-\d{3,4}\b"),
    re.compile(r"\b\d{5}-\d{2}-\d{6}[A-Z]?\b"),
]

_OPINION_PROMPT = """당신은 관세청 통관 담당자입니다.
아래 수입신고 내용과 현장 사진 증빙을 근거로 통관보고서의 항목을 작성하세요.

[신고 내용]
{declaration}

[현장 사진 판독]
{photos}

아래 JSON만 반환하십시오 (마크다운/설명 없이).
{{
  "photo_analysis": {{
    "label": "<사진에서 확인된 라벨·표시사항 1~2줄>",
    "condition": "<포장 상태·파손·재포장 흔적 1~2줄>"
  }},
  "opinion": {{
    "match": "<현품과 신고사항 일치 여부 1~2줄>",
    "to_verify": "<추가 확인이 필요한 사항 1~2줄>",
    "decision": "<수리 | 보완요구 | 검사강화 중 하나와 근거 1줄>"
  }}
}}

사진에서 확인되지 않는 사실을 단정하지 말고, 확인이 필요하면 "확인 필요"로 표기하십시오.
사진이 없으면 photo_analysis 값은 빈 문자열로 두십시오.
"""

_PHOTO_PROMPT = (
    "이 사진은 수입 통관 현장에서 촬영한 증빙 사진입니다.\n"
    "무엇이 찍혔는지 2~3문장으로 설명하세요. 물품 종류, 포장 상태, 표시사항(라벨·마크),\n"
    "이상 징후(파손·재포장·원산지표시 누락 등)가 보이면 함께 적으십시오.\n"
    "보이지 않는 것은 추측하지 마십시오."
)


def _detect_declaration_no(scenario: dict[str, Any], state: CustomsState) -> str:
    direct = str(scenario.get("declaration_no") or scenario.get("declarationNo") or "").strip()
    if direct:
        return direct
    haystack = " ".join(str(v) for v in (
        scenario.get("user_prompt") or "",
        scenario.get("instruction") or "",
        *[item.get("instruction") or "" for item in (scenario.get("scenario_items") or [])],
    ))
    for pattern in _DECL_PATTERNS:
        m = pattern.search(haystack)
        if m:
            return m.group(0)
    return ""


def _load_declaration(declaration_no: str) -> dict[str, Any] | None:
    if not declaration_no or not DB_PATH.exists():
        return None
    with duckdb.connect(str(DB_PATH), read_only=True) as con:
        row = con.execute(
            "SELECT * FROM import_declarations WHERE declaration_no = ?", [declaration_no]
        ).df()
        if row.empty:
            return None
        header = row.to_dict("records")[0]
        items = con.execute(
            "SELECT * FROM import_declaration_items WHERE declaration_id = ?",
            [header.get("id")],
        ).df().to_dict("records")
        taxes = con.execute(
            "SELECT t.* FROM import_declaration_item_taxes t "
            "JOIN import_declaration_items i ON i.item_id = t.item_id "
            "WHERE i.declaration_id = ?", [header.get("id")],
        ).df().to_dict("records")
    return {"header": header, "items": items, "taxes": taxes}


def _fmt(value: Any) -> str:
    if value is None or str(value) in ("nan", "NaT", ""):
        return "-"
    if isinstance(value, float):
        return f"{value:,.0f}" if value >= 1000 else f"{value:,.2f}"
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def _render_declaration(data: dict[str, Any]) -> str:
    """3. 신고 내용 — 신고개요·거래당사자·운송화물·품목·금액세액을 항목으로 나열."""
    h = data["header"]
    items = data["items"]
    rows = [
        ("신고개요", f"신고일 {_fmt(h.get('import_date'))} · 처리상태 {_fmt(h.get('status'))}"
                     f" · 세관 {_fmt(h.get('customs_office_code'))}"
                     f" · 신고구분 {_fmt(h.get('declaration_type'))}"
                     f" · 검사구분 {_fmt(h.get('inspection_type'))}"),
        ("거래당사자", f"납세의무자 {_fmt(h.get('taxpayer_name'))}"
                       f"(사업자번호 {_fmt(h.get('taxpayer_business_no'))})"
                       f" · 신고인 {_fmt(h.get('filer_name'))}"
                       f" · 해외거래처 {_fmt(h.get('overseas_supplier_name'))}"
                       f"({_fmt(h.get('overseas_supplier_country'))})"),
        ("운송·화물", f"B/L {_fmt(h.get('bl_awb_no'))}"
                      f" · 화물관리번호 {_fmt(h.get('cargo_control_no'))}"
                      f" · {_fmt(h.get('departure_country'))} → {_fmt(h.get('arrival_port'))}"
                      f" · 선기명 {_fmt(h.get('vessel_name'))}"
                      f" · 운송형태 {_fmt(h.get('transport_type'))}"
                      f" · 총중량 {_fmt(h.get('total_weight'))} {_fmt(h.get('total_weight_unit'))}"
                      f" · 포장 {_fmt(h.get('total_packages'))} {_fmt(h.get('package_type'))}"),
        ("품목", f"품목번호(HS) {_fmt(h.get('hs_code'))} · 품명 {_fmt(h.get('item_name'))}"
                 f" · 원산지 {_fmt(h.get('origin_country'))}"),
    ]
    for item in items[:5]:
        rows.append(("규격", f"{_fmt(item.get('tariff_item_name_en'))}"
                             f" · 수량 {_fmt(item.get('tariff_quantity'))}"
                             f" {_fmt(item.get('tariff_quantity_unit'))}"
                             f" · 순중량 {_fmt(item.get('net_weight'))}"
                             f" {_fmt(item.get('net_weight_unit'))}"))
    rows += [
        ("금액", f"결제금액 {_fmt(h.get('payment_currency'))} {_fmt(h.get('payment_amount'))}"
                 f"({_fmt(h.get('payment_incoterms'))}) · 환율 {_fmt(h.get('exchange_rate'))}"
                 f" · 과세가격 KRW {_fmt(h.get('total_customs_value_krw'))}"),
        ("세액", f"관세 {_fmt(h.get('tax_customs_duty'))}"
                 f" · 부가세 {_fmt(h.get('tax_vat'))}"
                 f" · 총세액 {_fmt(h.get('total_tax_amount'))}"),
    ]
    return "\n".join(f"    -   **{label}:** {value}" for label, value in rows)


def _collect_photos(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    files = scenario.get("uploaded_files") or []
    if not isinstance(files, list):
        files = [files]
    photos = []
    for f in files:
        if not isinstance(f, dict):
            continue
        name = str(f.get("name") or "")
        if Path(name.split("?", 1)[0]).suffix.lower() in IMAGE_SUFFIXES:
            photos.append(f)
    return photos


def _describe_photo(file_info: dict[str, Any]) -> str:
    """사진 1장을 비전 모델로 설명. 불가하면 빈 문자열."""
    model = vision_model()
    content = str(file_info.get("content") or "")
    if not model or not content or str(file_info.get("encoding") or "").lower() != "base64":
        return ""
    raw = content.split(",", 1)[1] if content.startswith("data:") else content
    mime = str(file_info.get("mime") or "image/png")
    try:
        from openai import OpenAI
        resp = OpenAI().chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": _PHOTO_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{raw}"}},
            ]}],
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as exc:                                   # noqa: BLE001
        print(f"[Agent] 통관보고서 사진 판독 실패 — {str(exc)[:120]}")
        return ""


def _thumbnail_data_uri(file_info: dict[str, Any], max_px: int = 720) -> str:
    """보고서 본문에 삽입할 축소 이미지(data URI). 원본을 그대로 실으면 보고서가 비대해진다."""
    content = str(file_info.get("content") or "")
    if not content or str(file_info.get("encoding") or "").lower() != "base64":
        return ""
    raw = content.split(",", 1)[1] if content.startswith("data:") else content
    try:
        import base64
        import io

        from PIL import Image
        img = Image.open(io.BytesIO(base64.b64decode(raw)))
        img.thumbnail((max_px, max_px))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=72)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception as exc:                                   # noqa: BLE001
        print(f"[Agent] 통관보고서 사진 축소 실패 — {str(exc)[:100]}")
        return ""


def _render_photo_section(photos: list[dict[str, Any]], descriptions: list[str]) -> str:
    """2. 등록 증빙사진 — 제출 내역 + 실제 사진 삽입."""
    read_cnt = sum(1 for d in descriptions if d)
    lines = [
        f"*   **제출 내역:** {len(photos)}장"
        + (f" (판독 {read_cnt}장)" if photos else " — 등록된 현장 사진 없음"),
    ]
    if not photos:
        return "\n".join(lines)
    lines.append("*   **증빙 사진:**")
    for idx, photo in enumerate(photos, 1):
        name = str(photo.get("name") or f"사진{idx}")
        size_kb = int(photo.get("size") or 0) / 1024
        uri = _thumbnail_data_uri(photo)
        lines.append(f"    - 증빙사진 {idx}. {name} ({size_kb:,.0f} KB)")
        lines.append(f"    ![{name}]({uri})" if uri
                     else "    - (이미지를 보고서에 삽입하지 못했습니다)")
    return "\n".join(lines)


def _render_photo_readings(photos: list[dict[str, Any]], descriptions: list[str]) -> str:
    """LLM 의견 생성에 넘길 사진 판독 원문."""
    if not photos:
        return "(사진 없음)"
    return "\n".join(
        f"- {p.get('name')}: {d or '판독 불가'}" for p, d in zip(photos, descriptions)
    )


def _build_opinion(declaration_md: str, photo_readings: str) -> dict[str, Any]:
    """사진 분석·통관 의견을 구조화해 받는다. 실패하면 빈 dict."""
    if not llm:
        return {}
    try:
        raw = llm.invoke(_OPINION_PROMPT.format(
            declaration=declaration_md[:4000], photos=photo_readings[:3000],
        )).content.strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip().rstrip("`").strip()
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            raw = raw[start:end + 1]
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as exc:                                   # noqa: BLE001
        print(f"[Agent] 통관보고서 의견 생성 실패 — {str(exc)[:140]}")
        return {}


def agent_clearance_report(state: CustomsState) -> CustomsState:
    """신고번호 + 현장 사진으로 통관보고서를 작성한다."""
    print("[Agent] 통관보고서 생성 시작")

    scenario = state.get("scenario") or {}
    declaration_no = _detect_declaration_no(scenario, state)
    photos = _collect_photos(scenario)

    if not declaration_no:
        result = (
            "[통관보고서]\n"
            "- 신고번호가 지정되지 않았습니다.\n"
            "- 입력값에 신고번호를 입력하거나 지시문에 신고번호를 포함하세요 (예: DV2-C-1001-01)."
        )
        return {**state, "clearance_report_result": result}

    data = _load_declaration(declaration_no)
    if not data:
        result = (
            "[통관보고서]\n"
            f"- 신고번호 {declaration_no} 에 해당하는 수입신고를 찾지 못했습니다.\n"
            "- 신고번호를 확인하거나 CDW 자연어조회로 대상 신고건을 먼저 조회하세요."
        )
        return {**state, "clearance_report_result": result}

    declaration_md = _render_declaration(data)
    descriptions = [_describe_photo(p) for p in photos]

    parsed = _build_opinion(declaration_md, _render_photo_readings(photos, descriptions))
    analysis = parsed.get("photo_analysis") or {}
    opinion = parsed.get("opinion") or {}

    header = data["header"]
    author = str(scenario.get("current_user") or os.getenv("REPORT_AUTHOR") or "통관담당자")
    result = "\n".join([
        "# [통관보고서]",
        "",
        "## 1. 기본 정보 (Basic Information)",
        f"*   **신고번호:** {declaration_no}",
        f"*   **수입자:** {_fmt(header.get('importer_name'))} ({_fmt(header.get('company_id'))})",
        f"*   **품명:** {_fmt(header.get('item_name'))}",
        f"*   **원산지:** {_fmt(header.get('origin_country'))}",
        "",
        "## 2. 등록 증빙사진 (Registered Evidentiary Photographs)",
        _render_photo_section(photos, descriptions),
        "",
        "## 3. 신고 내용 (Declaration Details - CDW Inquiry)",
        "*   **조회 결과:**",
        declaration_md,
        "",
        "## 4. 현장 증빙사진 분석 (Field Photo Analysis)",
        "*   **분석 내용:**",
        f"    -   {analysis.get('label') or '라벨 확인 내용 없음 (사진 미등록 또는 판독 불가)'}",
        f"    -   {analysis.get('condition') or '포장 상태 확인 내용 없음'}",
        "",
        "## 5. 통관 의견 (Customs Opinion)",
        "*   **최종 의견 및 조치 사항:**",
        f"    1.  **현품 확인:** {opinion.get('match') or '확인 필요'}",
        f"    2.  **확인 필요:** {opinion.get('to_verify') or '확인 필요'}",
        f"    3.  **통관 의견:** {opinion.get('decision') or '확인 필요'}",
        "",
        "---",
        f"*보고서 작성일:* {date.today().isoformat()}",
        f"*작성자:* {author}",
    ])

    print("[Agent] 통관보고서 생성 완료")
    return {
        **state,
        "clearance_report_result": result,
        "clearance_report_declaration": declaration_no,
        "clearance_report_photos": [p.get("name") for p in photos],
    }
