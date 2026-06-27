"""[국가코드 정규화] 수입신고서 원산지/적출국가/해외공급자 국가에 alpha-2 코드 컬럼 부여 (멱등).

수입신고서 항목정의서상 원산지코드(140)·적출국가코드(65)·해외공급자 국가(42)는 ISO 3166-1
alpha-2(an 2) 체계다. 그러나 DB는 표시용 한글 국가명을 보유한다(앱·Neo4j Country 노드가
이 이름을 사용). 기존 이름 컬럼을 보존하면서 spec 정합을 위한 *_code(alpha-2) 컬럼을 추가한다.

추가 컬럼
  import_declarations      : origin_country_code, departure_country_code, overseas_supplier_country_code
  import_declaration_items : origin_country_code
값: src.countries.country_alpha2(한글명/별칭) — 예 중국→CN, 독일→DE, BVI→VG, 파나마→PA

멱등: 컬럼 없을 때만 추가, 값은 매 실행 재계산. 재실행 안전.
실행: python data/scripts/normalize_country_codes.py [--db PATH]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))
from src.countries import country_alpha2  # noqa: E402

DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"


def _add_col(conn, table: str, col: str) -> None:
    cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()]
    if col not in cols:
        conn.execute(f'ALTER TABLE "{table}" ADD COLUMN {col} VARCHAR')


def normalize(conn: duckdb.DuckDBPyConnection) -> None:
    # (table, 코드컬럼, 원본 이름컬럼)
    targets = [
        ("import_declarations", "origin_country_code", "COALESCE(origin_country, origin_country_name)"),
        ("import_declarations", "departure_country_code", "departure_country"),
        ("import_declarations", "overseas_supplier_country_code", "overseas_supplier_country"),
        ("import_declaration_items", "origin_country_code", "origin_country"),
    ]
    pk = {"import_declarations": "id", "import_declaration_items": "item_id"}

    for table, code_col, name_expr in targets:
        _add_col(conn, table, code_col)
        key = pk[table]
        rows = conn.execute(f"SELECT {key}, {name_expr} FROM {table}").fetchall()
        for rid, name in rows:
            conn.execute(
                f"UPDATE {table} SET {code_col}=? WHERE {key}=?",
                [country_alpha2(name), rid],
            )
        dist = conn.execute(
            f"SELECT {code_col}, COUNT(*) FROM {table} GROUP BY 1 ORDER BY 2 DESC"
        ).fetchall()
        print(f"  {table}.{code_col}: {dict(dist)}")


def main() -> None:
    ap = argparse.ArgumentParser(description="국가코드 alpha-2 정규화")
    ap.add_argument("--db", type=Path, default=DB_PATH)
    args = ap.parse_args()
    print(f"DB: {args.db}")
    with duckdb.connect(str(args.db)) as conn:
        normalize(conn)
    print("[완료] 국가코드 alpha-2 정규화")


if __name__ == "__main__":
    main()
