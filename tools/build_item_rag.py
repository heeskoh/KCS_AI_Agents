"""품목정보RAG(rag_item) 빌드 — HSK별 품명·규격 수입신고 가이드 PDF → ChromaDB.

관세청 발간 「HSK별 품명·규격 수입신고 가이드」(핵심품목 2,583개) PDF의 품목별
신고 가이드(Ⅱ장)를 HSK 10단위 항목 단위로 추출하여 별도 RAG 컬렉션 `rag_item`을
구성한다. 각 항목은 품명·거래품명·모델/규격·성분·수입요건확인·신고 유의사항을 담는다.

기존 5개 RAG 컬렉션(rag_customs 등)과 동일한 임베딩(jhgan/ko-sroberta-multitask)·
저장소(data/chroma_db)를 사용하되, 컬렉션만 추가한다(무변경·가산).

사용법
------
python tools/build_item_rag.py --pdf "<PDF경로>"   # 추출→JSONL→컬렉션 빌드
python tools/build_item_rag.py --extract-only      # PDF→JSONL만 (임베딩 생략)
python tools/build_item_rag.py --check             # 현재 rag_item 상태 확인

산출물
------
data/item_rag_source.jsonl : 추출 원천 데이터(재현용, git 포함 가능)
data/chroma_db/rag_item    : 임베딩 컬렉션(git 미포함)

주의: 빌드 후 rag_item을 서비스에 반영하려면 web_server(8000) 재시작 필요.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
CHROMA_DIR = DATA_DIR / "chroma_db"
SOURCE_JSONL = DATA_DIR / "item_rag_source.jsonl"

COLLECTION = "rag_item"
DEFAULT_PDF = Path.home() / "Downloads" / "HSK별 품명 규격 수입신고 가이드(HSK 2,583개 품목).pdf"

# 항목 헤더: 라인 시작의 (0101.29-1000) 경주말 형태만 항목 경계로 인정
_HEADER = re.compile(r"(?m)^\s*\((\d{4}\.\d{2}-\d{4})\)\s*(.+)$")
# 품목별 가이드(Ⅱ장) 시작 페이지(1-based 31 = index 30). 총론(Ⅰ장)은 제외.
_GUIDE_START_PAGE_INDEX = 30


def extract_items(pdf_path: Path) -> list[dict]:
    """PDF에서 HSK 10단위 항목을 추출한다."""
    import fitz  # PyMuPDF

    doc = fitz.open(str(pdf_path))
    pages = [doc[i].get_text() for i in range(_GUIDE_START_PAGE_INDEX, doc.page_count)]
    doc.close()
    text = "\n".join(pages)

    matches = list(_HEADER.finditer(text))
    items: list[dict] = []
    seen: set[str] = set()
    for idx, m in enumerate(matches):
        code = m.group(1)
        name = m.group(2).strip()
        if code in seen:  # 교차참조 등 중복 헤더 스킵
            continue
        seen.add(code)
        body_start = m.end()
        body_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()
        # 페이지 러닝헤더(- NN -)·과다 개행 정리
        body = re.sub(r"(?m)^\s*-\s*\d+\s*-\s*$", "", body)
        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        items.append({
            "hsk_code": code,
            "hs4": code[:4],
            "name_ko": name,
            "text": body,
        })
    return items


def build_document_text(item: dict) -> str:
    """검색·표시용 문서 본문. 헤더(HSK·품명)를 앞세워 매칭 정확도를 높인다."""
    return f"HSK {item['hsk_code']} {item['name_ko']}\n\n{item['text']}"


def write_source_jsonl(items: list[dict]) -> None:
    with SOURCE_JSONL.open("w", encoding="utf-8") as fh:
        for it in items:
            fh.write(json.dumps(it, ensure_ascii=False) + "\n")
    print(f"[추출] {len(items)}개 항목 → {SOURCE_JSONL}")


def load_source_jsonl() -> list[dict]:
    if not SOURCE_JSONL.exists():
        return []
    with SOURCE_JSONL.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def build_collection(items: list[dict], reset: bool = True, batch_size: int = 256) -> None:
    """rag_item 컬렉션을 생성하고 문서를 임베딩·저장한다."""
    try:
        from langchain_huggingface import HuggingFaceEmbeddings
    except ImportError:
        from langchain_community.embeddings import HuggingFaceEmbeddings
    from langchain_chroma import Chroma
    from langchain_core.documents import Document
    import chromadb

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    if reset:
        try:
            client.delete_collection(COLLECTION)
            print(f"[빌드] 기존 '{COLLECTION}' 컬렉션 삭제")
        except Exception:
            pass

    print("[빌드] 임베딩 모델 로드 (jhgan/ko-sroberta-multitask)")
    embeddings = HuggingFaceEmbeddings(model_name="jhgan/ko-sroberta-multitask")

    vs = Chroma(
        collection_name=COLLECTION,
        persist_directory=str(CHROMA_DIR),
        embedding_function=embeddings,
    )

    docs = [
        Document(
            page_content=build_document_text(it),
            metadata={
                "source": it["hsk_code"],
                "hsk_code": it["hsk_code"],
                "hs4": it["hs4"],
                "name_ko": it["name_ko"],
                "category": "품목신고가이드",
            },
        )
        for it in items
    ]

    total = len(docs)
    print(f"[빌드] {total}개 문서 임베딩·저장 (batch={batch_size})")
    for start in range(0, total, batch_size):
        chunk = docs[start:start + batch_size]
        vs.add_documents(chunk)
        print(f"  {min(start + batch_size, total)}/{total}")

    print(f"[빌드] 완료: '{COLLECTION}' {total}개 문서")

    # 검증 샘플
    print("\n[검증] 샘플 검색")
    for q in ("전동 장난감 자동차 수입신고", "니코틴 전자담배 성분", "경주말 품명"):
        res = vs.similarity_search(q, k=1)
        if res:
            m = res[0].metadata
            print(f"  '{q}' → HSK {m.get('hsk_code')} {m.get('name_ko')}")


def check_status() -> None:
    import chromadb
    if not CHROMA_DIR.exists():
        print("ChromaDB 디렉토리 없음")
        return
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    counts = {c.name: c.count() for c in client.list_collections()}
    print(f"ChromaDB: {CHROMA_DIR}")
    cnt = counts.get(COLLECTION, 0)
    print(f"  {COLLECTION}: {cnt}개 문서 {'OK' if cnt else '(비어있음)'}")
    src = load_source_jsonl()
    print(f"  {SOURCE_JSONL.name}: {len(src)}개 항목")


def main() -> None:
    ap = argparse.ArgumentParser(description="품목정보RAG(rag_item) 빌드")
    ap.add_argument("--pdf", default=str(DEFAULT_PDF), help="HSK 가이드 PDF 경로")
    ap.add_argument("--extract-only", action="store_true", help="PDF→JSONL만 (임베딩 생략)")
    ap.add_argument("--from-jsonl", action="store_true", help="추출 생략, 기존 JSONL로 컬렉션 빌드")
    ap.add_argument("--check", action="store_true", help="현재 rag_item 상태 확인")
    ap.add_argument("--no-reset", action="store_true", help="기존 컬렉션 유지(추가 저장)")
    args = ap.parse_args()

    if args.check:
        check_status()
        return

    if args.from_jsonl:
        items = load_source_jsonl()
        if not items:
            sys.exit(f"JSONL 없음: {SOURCE_JSONL}")
        print(f"[로드] {len(items)}개 항목 ← {SOURCE_JSONL}")
    else:
        pdf_path = Path(args.pdf)
        if not pdf_path.exists():
            sys.exit(f"PDF 없음: {pdf_path}")
        items = extract_items(pdf_path)
        write_source_jsonl(items)

    if args.extract_only:
        print("[완료] 추출만 수행 (임베딩 생략)")
        return

    build_collection(items, reset=not args.no_reset)


if __name__ == "__main__":
    main()
