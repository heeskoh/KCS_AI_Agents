"""OCR 환경 준비 — Tesseract 언어팩 내려받기 + 동작 확인.

Tesseract 본체는 별도 설치가 필요하다 (Windows: winget install UB-Mannheim.TesseractOCR).
언어팩(kor/eng)은 용량이 커 git에 넣지 않으므로 이 스크립트로 내려받는다.

실행: python tools/setup_ocr.py [--langs kor,eng] [--check]
"""
from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESSDATA = ROOT / "data" / "tessdata"
BASE_URL = "https://github.com/tesseract-ocr/tessdata_best/raw/main/{lang}.traineddata"
DEFAULT_TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def download(langs: list[str]) -> None:
    TESSDATA.mkdir(parents=True, exist_ok=True)
    for lang in langs:
        dst = TESSDATA / f"{lang}.traineddata"
        if dst.exists():
            print(f"  {lang}: 이미 있음 ({dst.stat().st_size / 1024 / 1024:.1f} MB)")
            continue
        url = BASE_URL.format(lang=lang)
        print(f"  {lang}: 내려받는 중 …")
        urllib.request.urlretrieve(url, dst)
        print(f"  {lang}: 완료 ({dst.stat().st_size / 1024 / 1024:.1f} MB)")


def check() -> int:
    try:
        import fitz
        import pytesseract
        from PIL import Image  # noqa: F401
    except ImportError as exc:
        print(f"✗ 라이브러리 없음 — {exc}")
        print("  pip install -r requirements.txt 를 먼저 실행하세요.")
        return 1

    cmd = os.getenv("TESSERACT_CMD") or DEFAULT_TESSERACT
    if not Path(cmd).exists():
        print(f"✗ Tesseract 실행파일 없음: {cmd}")
        print("  Windows: winget install --id UB-Mannheim.TesseractOCR")
        print("  다른 경로에 설치했다면 TESSERACT_CMD 환경변수로 지정하세요.")
        return 1
    pytesseract.pytesseract.tesseract_cmd = cmd
    os.environ.setdefault("TESSDATA_PREFIX", str(TESSDATA))

    langs = pytesseract.get_languages(config="")
    print(f"✓ Tesseract {pytesseract.get_tesseract_version()} — {cmd}")
    print(f"✓ PyMuPDF {fitz.__doc__.split(':')[0].strip()}")
    print(f"✓ 언어팩: {', '.join(l for l in langs if l != 'osd') or '(없음)'}")
    if "kor" not in langs:
        print("✗ 한국어 언어팩(kor)이 없습니다 — 이 스크립트를 --langs kor 로 다시 실행하세요.")
        return 1
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default="kor,eng", help="쉼표 구분 언어 코드")
    ap.add_argument("--check", action="store_true", help="내려받지 않고 상태만 확인")
    args = ap.parse_args()

    if not args.check:
        print(f"언어팩 위치: {TESSDATA}")
        download([l.strip() for l in args.langs.split(",") if l.strip()])
        print()
    sys.exit(check())


if __name__ == "__main__":
    main()
