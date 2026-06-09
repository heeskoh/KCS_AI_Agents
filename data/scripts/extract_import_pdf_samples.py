"""Extract structured fields from sample import declaration PDFs.

This script is intentionally small and cache-oriented. It calls the configured
OpenAI API once per PDF and writes a JSON cache that can be reviewed or reused
by the DB refresh script.
"""

from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


ROOT = Path(__file__).resolve().parents[2]
PDF_DIR = Path(r"C:/Users/heesk/Downloads/수입신고샘플/수입신고서 샘플")
OUT_PATH = ROOT / "data" / "sample_import_pdf_extracts.json"

PROMPT = """\
첨부 PDF는 한국 수입신고서 샘플입니다.
문서에서 확인 가능한 값만 추출하세요. 추정하지 말고 불명확하면 null을 사용하세요.
반드시 JSON 배열/마크다운 없이 단일 JSON 객체만 반환하세요.

필드:
- importer_name: 수입자 또는 업체명
- declaration_no: 신고번호
- hs_code: HS 코드
- item_name: 품명
- declared_value_krw: 과세가격 또는 신고가격. 숫자만, KRW 기준
- origin_country: 원산지 국가코드 또는 국가명
- import_date: 신고일자 또는 수입일자, YYYY-MM-DD
- risk_notes: 문서 내 리스크 단서. 없으면 null
"""


def _json_from_text(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


def _normalize_date(value: object) -> str | None:
    if not value:
        return None
    text = str(value)
    m = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", text)
    if not m:
        return text
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def _normalize_money(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"[^0-9]", "", str(value))
    return int(digits) if digits else None


def extract_one(client: OpenAI, path: Path) -> dict:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    response = client.responses.create(
        model=os.getenv("LLM_MODEL") or "gpt-4o",
        temperature=0,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": PROMPT},
                    {
                        "type": "input_file",
                        "filename": path.name,
                        "file_data": f"data:application/pdf;base64,{encoded}",
                    },
                ],
            }
        ],
    )
    parsed = _json_from_text(response.output_text)
    parsed["source_file"] = str(path)
    parsed["source_name"] = path.name
    parsed["import_date"] = _normalize_date(parsed.get("import_date"))
    parsed["declared_value_krw"] = _normalize_money(parsed.get("declared_value_krw"))
    return parsed


def main() -> None:
    load_dotenv(ROOT / ".env")
    client = OpenAI()
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    rows = []
    for i, path in enumerate(pdfs, 1):
        print(f"[{i:02d}/{len(pdfs):02d}] {path.name}")
        rows.append(extract_one(client, path))
    OUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
