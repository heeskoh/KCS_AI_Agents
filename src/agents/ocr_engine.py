"""스캔 문서 OCR — PDF/이미지에서 실제 텍스트를 추출한다.

PyMuPDF로 PDF 페이지를 이미지로 렌더링하고 Tesseract(kor+eng)로 인식한다.
엔진이나 언어팩이 없으면 조용히 빈 문자열을 돌려주고, 호출부는 시뮬레이션으로 폴백한다.

환경변수
  TESSERACT_CMD    tesseract 실행파일 경로 (기본: Program Files 설치 위치)
  TESSDATA_PREFIX  언어팩 디렉터리 (기본: <repo>/data/tessdata)
  OCR_DPI          렌더링 해상도 (기본 300)
  OCR_MAX_PAGES    인식할 최대 페이지 (기본 3)
"""
from __future__ import annotations

import base64
import binascii
import io
import os
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TESSDATA = ROOT / "data" / "tessdata"
DEFAULT_TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

PDF_SUFFIXES = {".pdf"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


@lru_cache(maxsize=1)
def ocr_available() -> bool:
    """OCR 엔진과 언어팩이 모두 준비됐는지 (기동 시 1회만 판정)."""
    try:
        import fitz  # noqa: F401
        import pytesseract
        from PIL import Image  # noqa: F401
    except ImportError as exc:
        print(f"[OCR] 라이브러리 없음 — {exc}")
        return False

    cmd = os.getenv("TESSERACT_CMD") or DEFAULT_TESSERACT
    if Path(cmd).exists():
        pytesseract.pytesseract.tesseract_cmd = cmd
    tessdata = os.getenv("TESSDATA_PREFIX") or str(DEFAULT_TESSDATA)
    if Path(tessdata).exists():
        os.environ["TESSDATA_PREFIX"] = tessdata
    try:
        langs = pytesseract.get_languages(config="")
    except Exception as exc:                                   # noqa: BLE001
        print(f"[OCR] Tesseract 실행 불가 — {exc}")
        return False
    if "kor" not in langs:
        print(f"[OCR] 한국어 언어팩 없음 (사용 가능: {', '.join(langs)})")
    print(f"[OCR] 준비됨 — {cmd} · 언어 {', '.join(l for l in langs if l != 'osd')}")
    return True


def _decode(file_info: dict) -> bytes:
    encoding = str(file_info.get("encoding") or "").lower()
    content = file_info.get("content") or ""
    if not content:
        return b""
    if encoding == "base64":
        raw = content.split(",", 1)[1] if content.startswith("data:") else content
        try:
            return base64.b64decode(raw, validate=False)
        except (binascii.Error, ValueError):
            return b""
    if encoding == "text":
        return str(content).encode("utf-8", "ignore")
    return b""


def _image_to_text(img) -> str:
    import pytesseract
    langs = "kor+eng"
    try:
        return pytesseract.image_to_string(img, lang=langs)
    except Exception:                                          # noqa: BLE001
        return pytesseract.image_to_string(img, lang="eng")


def extract_text(file_info: dict) -> str:
    """PDF/이미지 첨부에서 OCR 텍스트를 추출한다. 실패하면 빈 문자열."""
    name = str(file_info.get("name") or "")
    suffix = Path(name.split("?", 1)[0]).suffix.lower()
    if suffix not in PDF_SUFFIXES | IMAGE_SUFFIXES:
        return ""
    data = _decode(file_info)
    if not data or not ocr_available():
        return ""

    dpi = int(os.getenv("OCR_DPI") or 300)
    max_pages = int(os.getenv("OCR_MAX_PAGES") or 3)
    try:
        from PIL import Image
        if suffix in IMAGE_SUFFIXES:
            return _image_to_text(Image.open(io.BytesIO(data))).strip()

        import fitz
        parts: list[str] = []
        with fitz.open(stream=data, filetype="pdf") as doc:
            for page in list(doc)[:max_pages]:
                # 이미 텍스트 레이어가 있으면 OCR 없이 그대로 쓴다 (빠르고 정확)
                embedded = (page.get_text() or "").strip()
                if len(embedded) > 80:
                    parts.append(embedded)
                    continue
                pix = page.get_pixmap(dpi=dpi)
                parts.append(_image_to_text(Image.open(io.BytesIO(pix.tobytes("png")))))
        return "\n".join(p for p in parts if p.strip()).strip()
    except Exception as exc:                                   # noqa: BLE001
        print(f"[OCR] 추출 실패 ({name}) — {exc}")
        return ""
