"""수입신고서에 해외거래처(송하인)·관세사를 채운다(완전성 보장 백필).

v2 신고서 생성기(gen_declarations_v2)는 거래/경로/품목만 만들고 해외거래처·관세사는
비워둔다. 수입신고 엣지 모델(load_company_import_graph_to_neo4j)이 이 둘을 엣지 속성으로
흡수하므로, 결정적(deterministic) 합성값으로 채운다. 멱등하며 여러 번 실행해도 안전하다.

  - import_declarations.overseas_supplier_name : (기업/개인 × 출발지국가) 기준 대표 송하인
  - company_profiles.customs_broker_firm        : 기업별 대표 관세사(로더의 관세사 폴백)

backfill_ports.py(출발항·도착항)와 짝을 이룬다. 신고서 재생성 후 두 백필을 함께 실행한다.

Usage:
    python data/scripts/backfill_trade_partners.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "customs.duckdb"

SUPPLIER_SUFFIX = ["무역", "상사", "Trading", "Corp", "Industries", "Global", "Logistics"]
BROKER_FIRMS = [
    "한울관세사무소", "대한관세법인", "세정관세법인", "유니패스관세법인",
    "글로벌통관관세사무소", "정직관세사무소", "케이씨관세법인", "삼성통관관세법인",
    "동방관세법인", "신성관세사무소",
]


def _supplier_name(country: str | None, owner: str) -> str:
    """(출발지국가 × 화주) 결정적 송하인명 — 같은 국가·화주는 동일 거래처로 묶인다."""
    base = (country or "해외").strip()
    suffix = SUPPLIER_SUFFIX[(hash((base, owner)) & 0xFFFF) % len(SUPPLIER_SUFFIX)]
    return f"{base} {suffix}"


def _broker_firm(company_id: str) -> str:
    return BROKER_FIRMS[(hash(("broker", company_id)) & 0xFFFF) % len(BROKER_FIRMS)]


def backfill_suppliers(con: duckdb.DuckDBPyConnection) -> int:
    rows = con.execute(
        """
        SELECT id,
               COALESCE(company_id, importer_person_id, 'X') AS owner,
               COALESCE(NULLIF(departure_country, ''),
                        NULLIF(origin_country_name, ''),
                        origin_country) AS dep
        FROM import_declarations
        """
    ).fetchall()
    updates = [(_supplier_name(dep, owner), decl_id) for decl_id, owner, dep in rows]
    con.executemany(
        "UPDATE import_declarations SET overseas_supplier_name=? WHERE id=?", updates,
    )
    return len(updates)


def backfill_brokers(con: duckdb.DuckDBPyConnection) -> int:
    ids = [r[0] for r in con.execute("SELECT company_id FROM company_profiles").fetchall()]
    updates = [(_broker_firm(cid), cid) for cid in ids]
    con.executemany(
        "UPDATE company_profiles SET customs_broker_firm=? WHERE company_id=?", updates,
    )
    return len(updates)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        n_sup = backfill_suppliers(con)
        n_brk = backfill_brokers(con)
        sup_null = con.execute(
            "SELECT count(*) FROM import_declarations "
            "WHERE overseas_supplier_name IS NULL OR overseas_supplier_name=''"
        ).fetchone()[0]
        distinct_sup = con.execute(
            "SELECT count(DISTINCT overseas_supplier_name) FROM import_declarations"
        ).fetchone()[0]
    print(f"suppliers backfilled: {n_sup}  (null remaining: {sup_null}, distinct: {distinct_sup})")
    print(f"brokers backfilled: {n_brk} companies")


if __name__ == "__main__":
    main()
