"""스캔 문서 OCR — PDF/이미지에서 실제 텍스트를 추출한다.

두 가지 판독 경로를 쓰며, 기본은 비전 모델이다.
  1) 비전 모델 (기본) — 페이지 이미지를 그대로 읽는다. 신고서처럼 격자 서식에서
     라벨과 값의 대응을 유지하므로 항목 매핑 정확도가 높다.
  2) Tesseract — 비전 사용 불가/실패 시 폴백. 로컬 실행이라 외부 전송이 없다.
둘 다 실패하면 빈 문자열을 돌려주고, 호출부는 시뮬레이션으로 폴백한다.

환경변수
  OCR_VISION_MODEL  비전 판독 모델 (기본 gpt-5.6-terra). "off"면 Tesseract만 사용
  TESSERACT_CMD     tesseract 실행파일 경로 (기본: Program Files 설치 위치)
  TESSDATA_PREFIX   언어팩 디렉터리 (기본: <repo>/data/tessdata)
  OCR_DPI           렌더링 해상도 (기본 300, 비전은 200)
  OCR_MAX_PAGES     인식할 최대 페이지 (기본 3)
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


_VISION_PROMPT = (
    "이 이미지는 대한민국 관세청 수입신고서 등 통관 서류입니다.\n"
    "서식에서 확인되는 항목을 '항목명: 값' 한 줄씩으로 옮겨 적으세요.\n"
    "- 라벨과 값의 대응을 정확히 유지하십시오(격자에서 같은 칸에 있는 값).\n"
    "- 값이 비어 있는 항목은 생략하고, 보이지 않는 값은 지어내지 마십시오.\n"
    "- 금액·수량은 통화/단위 표기를 원문 그대로 두십시오.\n"
    "설명 없이 목록만 출력하십시오."
)


@lru_cache(maxsize=1)
def vision_model() -> str:
    """비전 판독 모델명. 'off'이거나 API 키가 없으면 빈 문자열."""
    model = (os.getenv("OCR_VISION_MODEL") or "gpt-5.6-terra").strip()
    if model.lower() in {"off", "none", "0", "false"}:
        return ""
    if not os.getenv("OPENAI_API_KEY"):
        return ""
    try:
        import openai  # noqa: F401
    except ImportError:
        return ""
    return model


def _vision_read(png_bytes: bytes) -> str:
    """페이지 이미지 1장을 비전 모델로 판독해 '항목: 값' 텍스트를 얻는다."""
    model = vision_model()
    if not model:
        return ""
    import base64 as _b64

    from openai import OpenAI
    try:
        resp = OpenAI().chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": _VISION_PROMPT},
                {"type": "image_url", "image_url": {
                    "url": "data:image/png;base64," + _b64.b64encode(png_bytes).decode(),
                    "detail": "high"}},
            ]}],
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as exc:                                   # noqa: BLE001
        print(f"[OCR] 비전 판독 실패({model}) — {str(exc)[:140]}")
        return ""


def _read_page_image(png_bytes: bytes) -> tuple[str, str]:
    """페이지 이미지 → (텍스트, 사용한 엔진). 비전 우선, 실패 시 Tesseract."""
    text = _vision_read(png_bytes)
    if text:
        return text, "vision"
    if ocr_available():
        from PIL import Image
        return _image_to_text(Image.open(io.BytesIO(png_bytes))).strip(), "tesseract"
    return "", ""


def extract(file_info: dict) -> tuple[str, str]:
    """PDF/이미지 첨부에서 판독 텍스트와 사용 엔진을 돌려준다. 실패 시 ("", "")."""
    name = str(file_info.get("name") or "")
    suffix = Path(name.split("?", 1)[0]).suffix.lower()
    if suffix not in PDF_SUFFIXES | IMAGE_SUFFIXES:
        return "", ""
    data = _decode(file_info)
    if not data:
        return "", ""

    max_pages = int(os.getenv("OCR_MAX_PAGES") or 3)
    dpi = int(os.getenv("OCR_DPI") or (200 if vision_model() else 300))
    try:
        if suffix in IMAGE_SUFFIXES:
            return _read_page_image(data)

        import fitz
        parts: list[str] = []
        engines: list[str] = []
        with fitz.open(stream=data, filetype="pdf") as doc:
            for page in list(doc)[:max_pages]:
                # 이미 텍스트 레이어가 있으면 판독 없이 그대로 쓴다 (빠르고 정확)
                embedded = (page.get_text() or "").strip()
                if len(embedded) > 80:
                    parts.append(embedded)
                    engines.append("embedded")
                    continue
                text, engine = _read_page_image(page.get_pixmap(dpi=dpi).tobytes("png"))
                if text:
                    parts.append(text)
                    engines.append(engine)
        used = next((e for e in engines if e in ("vision", "tesseract")), engines[0] if engines else "")
        return "\n".join(p for p in parts if p.strip()).strip(), used
    except Exception as exc:                                   # noqa: BLE001
        print(f"[OCR] 추출 실패 ({name}) — {exc}")
        return "", ""


def extract_text(file_info: dict) -> str:
    """판독 텍스트만 필요할 때 쓰는 단축형."""
    return extract(file_info)[0]
