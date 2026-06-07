"""Agent: OCR/문서인식.

첨부 파일 또는 전자서고 파일 링크를 입력으로 받아 파일 유형을 판별하고,
OCR/문서/표/그림 인식 계획과 후속 AI 서비스 연결 후보를 정리한다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

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


_LLM_PROMPT = """당신은 관세청 OCR/문서인식 AI 서비스입니다.
아래 파일 인식 결과를 보고 조사관이 후속 AI 서비스를 선택할 수 있도록 요약하세요.

작성 항목:
1. 파일별 인식 결과
2. 문서/표/그림에서 추출해야 할 핵심 항목
3. 관계망 분석, 수입신고검증, 품목분류검증, 과세가격평가, 법령정보조회 등 후속 AI 서비스 연결 권고
4. 즉시 확인해야 할 위험 신호

[파일 인식 결과 JSON]
{analysis_json}
"""


def _as_list(value: Any) -> list[Any]:
    if not value:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _file_name(file_info: dict[str, Any]) -> str:
    return str(file_info.get("name") or file_info.get("url") or file_info.get("link") or "문서").strip()


def _suffix(name: str) -> str:
    return Path(name.split("?", 1)[0]).suffix.lower()


def _has_text(file_info: dict[str, Any]) -> bool:
    return (file_info.get("encoding") or "").lower() == "text" and bool(file_info.get("content"))


def _text_sample(file_info: dict[str, Any], limit: int = 1800) -> str:
    content = str(file_info.get("content") or "")
    return content[:limit]


def _is_communication_record(name: str, text: str) -> bool:
    haystack = f"{name}\n{text[:2000]}".lower()
    if any(token in haystack for token in COMMUNICATION_HINTS):
        return True
    header = text.splitlines()[0].lower() if text.splitlines() else ""
    return (
        ("sender" in header and "receiver" in header)
        or ("from" in header and "to" in header and "date" in header)
        or ("발신" in header and "수신" in header)
    )


def _looks_like_table(text: str, suffix: str) -> bool:
    if suffix in TABLE_SUFFIXES:
        return True
    rows = [line for line in text.splitlines()[:20] if line.strip()]
    if len(rows) < 2:
        return False
    return sum(1 for line in rows if "," in line or "\t" in line or "|" in line) >= 2


def _infer_doc_kind(file_info: dict[str, Any]) -> str:
    name = _file_name(file_info)
    suffix = _suffix(name)
    mime = str(file_info.get("mime") or "").lower()
    text = _text_sample(file_info)

    if suffix in IMAGE_SUFFIXES or mime.startswith("image/"):
        return "scanned_image"
    if suffix in TABLE_SUFFIXES or _looks_like_table(text, suffix):
        return "communication_table" if _is_communication_record(name, text) else "table"
    if suffix in DOCUMENT_SUFFIXES or "pdf" in mime or "word" in mime:
        return "document"
    if suffix in TEXT_SUFFIXES or _has_text(file_info):
        return "communication_text" if _is_communication_record(name, text) else "text_document"
    return "unknown_file"


def _routes_for_kind(kind: str) -> list[str]:
    if kind in {"communication_table", "communication_text"}:
        return ["network", "summary", "report_generate"]
    if kind == "scanned_image":
        return ["ocr", "summary", "declaration_verify"]
    if kind == "table":
        return ["summary", "declaration_verify", "customs_value"]
    if kind == "document":
        return ["summary", "declaration_verify", "hs_verify", "customs_value", "law"]
    if kind == "text_document":
        return ["summary", "law", "report_generate"]
    return ["summary"]


def _recognition_method(kind: str, file_info: dict[str, Any]) -> str:
    if kind == "scanned_image":
        return "OCR 처리 필요"
    if kind == "document" and not _has_text(file_info):
        return "문서 텍스트 추출 또는 OCR 처리 필요"
    if kind in {"table", "communication_table"}:
        return "표 구조 인식"
    if kind in {"communication_text", "text_document"}:
        return "내용 인식"
    return "파일 유형 확인 필요"


def _figure_items(file_info: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    if kind != "scanned_image":
        return []
    name = _file_name(file_info)
    title = Path(name).stem or "첨부 이미지"
    keywords = [
        word for word in re.split(r"[\s_\-.]+", title)
        if word and len(word) > 1
    ][:8]
    return [{
        "original": name,
        "title": title,
        "description": "이미지로 스캔된 파일입니다. OCR 처리 후 문서 본문, 표, 도장/서명, 물품 사진 여부를 확인해야 합니다.",
        "keywords": keywords or ["스캔이미지", "OCR필요"],
    }]


def _normalize_link(link: Any) -> dict[str, Any]:
    if isinstance(link, dict):
        url = str(link.get("url") or link.get("link") or "")
        name = str(link.get("name") or url or "전자서고 링크")
        return {
            "name": name,
            "url": url,
            "type": link.get("type") or "file_link",
            "mime": link.get("mime") or "",
            "encoding": "link",
            "content": "",
            "size": int(link.get("size") or 0),
        }
    url = str(link or "")
    return {
        "name": url or "전자서고 링크",
        "url": url,
        "type": "file_link",
        "mime": "",
        "encoding": "link",
        "content": "",
        "size": 0,
    }


def _collect_file_inputs(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    files = [dict(file_info) for file_info in _as_list(scenario.get("uploaded_files"))]
    links = (
        _as_list(scenario.get("file_links"))
        + _as_list(scenario.get("document_links"))
        + _as_list(scenario.get("repository_links"))
    )
    files.extend(_normalize_link(link) for link in links)
    return files


def _analyze_file(file_info: dict[str, Any]) -> dict[str, Any]:
    name = _file_name(file_info)
    suffix = _suffix(name)
    kind = _infer_doc_kind(file_info)
    text = _text_sample(file_info)
    routes = _routes_for_kind(kind)
    tables = []
    if _looks_like_table(text, suffix):
        rows = [line for line in text.splitlines() if line.strip()]
        tables.append({
            "title": "표/대화 내역 후보",
            "row_count_sample": min(len(rows), 120),
            "columns_sample": re.split(r",|\t|\|", rows[0])[:12] if rows else [],
        })
    return {
        "name": name,
        "url": file_info.get("url") or file_info.get("link") or "",
        "mime": file_info.get("mime") or "",
        "suffix": suffix,
        "size": file_info.get("size") or 0,
        "encoding": file_info.get("encoding") or "",
        "kind": kind,
        "recognition_method": _recognition_method(kind, file_info),
        "text_available": bool(text.strip()),
        "content_preview": text[:600],
        "tables": tables,
        "figures": _figure_items(file_info, kind),
        "recommended_agents": routes,
    }


def _render_result(analyses: list[dict[str, Any]], recommended_agents: list[str]) -> str:
    lines = [
        "[OCR/문서인식 결과]",
        f"- 처리 대상 파일: {len(analyses)}건",
        f"- 후속 AI 서비스 추천: {', '.join(recommended_agents) if recommended_agents else '없음'}",
        "",
        "## 파일별 처리 계획",
    ]
    for item in analyses:
        source = f" · 링크: {item['url']}" if item.get("url") else ""
        lines.extend([
            f"### {item['name']}",
            f"- 파일 유형: {item['kind']} ({item.get('suffix') or item.get('mime') or 'unknown'}){source}",
            f"- 처리 방식: {item['recognition_method']}",
            f"- 연결 추천: {', '.join(item['recommended_agents'])}",
        ])
        if item["tables"]:
            table = item["tables"][0]
            cols = ", ".join(str(col).strip() for col in table["columns_sample"] if str(col).strip())
            lines.append(f"- 표 인식: {table['row_count_sample']}행 샘플, 컬럼 후보 [{cols or '-'}]")
        if item["figures"]:
            for fig in item["figures"]:
                lines.append(
                    f"- 그림 인식: 원본={fig['original']} / 제목={fig['title']} / 설명={fig['description']} / 키워드={', '.join(fig['keywords'])}"
                )
        if item["content_preview"]:
            lines.append("- 내용 미리보기:")
            lines.append(item["content_preview"])
        lines.append("")

    lines.append("## 구조화 JSON")
    lines.append(json.dumps(analyses, ensure_ascii=False, indent=2)[:6000])
    return "\n".join(lines)


def agent_ocr(state: CustomsState) -> CustomsState:
    """파일을 인식하고 후속 AI 서비스 연결 정보를 생성한다."""
    print("[Agent] OCR/문서인식 시작")

    scenario = state.get("scenario") or {}
    files = _collect_file_inputs(scenario)
    if not files:
        result = (
            "[OCR/문서인식 결과]\n"
            "- 첨부 파일 또는 전자서고 파일 링크가 없습니다.\n"
            "- 파일을 직접 등록하거나 scenario.file_links/document_links에 전자서고 링크를 제공하세요."
        )
        return {**state, "ocr_result": result, "ocr_recommended_agents": []}

    analyses = [_analyze_file(file_info) for file_info in files]
    recommended_agents = []
    for item in analyses:
        for agent in item["recommended_agents"]:
            if agent not in recommended_agents:
                recommended_agents.append(agent)

    raw_result = _render_result(analyses, recommended_agents)

    if llm:
        try:
            analysis_json = json.dumps(analyses, ensure_ascii=False, indent=2)[:7000]
            deep_analysis = llm.invoke(_LLM_PROMPT.format(analysis_json=analysis_json)).content
            result = raw_result + "\n\n[AI 심층 분석]\n" + deep_analysis
        except Exception as exc:
            print(f"[Agent] OCR LLM 분석 실패: {exc}")
            result = raw_result
    else:
        result = raw_result

    print("[Agent] OCR/문서인식 완료")
    return {
        **state,
        "ocr_result": result,
        "document_intelligence_result": analyses,
        "ocr_recommended_agents": recommended_agents,
    }
