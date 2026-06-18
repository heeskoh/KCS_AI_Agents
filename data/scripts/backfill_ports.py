"""수입·수출 신고서에 출발항·도착항·운송수단을 채운다(완전성 보장 백필).

수입신고서에는 도착항(한국)·운송수단이 일부만 채워져 있고 출발항(해외)이 없었다.
수출신고서에는 항·운송수단 정보가 전혀 없었다. 이 스크립트는 두 테이블에
대해 국가 기준으로 대표 항만을 결정적(deterministic)으로 부여한다.

  수입: departure_port(해외, 출발지국가 기준) + arrival_port(한국) + transport_type
  수출: departure_port(한국)            + arrival_port(해외, 도착지국가 기준) + transport_type

기존에 채워진 arrival_port/transport_type(수입신고서의 해상/항공 구분)은 보존하고,
비어 있는 값과 신규 컬럼만 채운다. 멱등(idempotent)하며 여러 번 실행해도 안전하다.

Usage:
    python data/scripts/backfill_ports.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "customs.duckdb"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ports import foreign_port, korea_port, transport_mode  # noqa: E402


def _ensure_columns(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("ALTER TABLE import_declarations ADD COLUMN IF NOT EXISTS departure_port VARCHAR")
    for col in ("departure_port", "arrival_port", "transport_type"):
        con.execute(f"ALTER TABLE export_declaration ADD COLUMN IF NOT EXISTS {col} VARCHAR")


def backfill_imports(con: duckdb.DuckDBPyConnection) -> int:
    rows = con.execute(
        """
        SELECT id, transport_type, arrival_port,
               COALESCE(NULLIF(departure_country, ''),
                        NULLIF(origin_country_name, ''),
                        origin_country) AS dep
        FROM import_declarations
        """
    ).fetchall()
    updates = []
    for decl_id, tt, arr, dep in rows:
        tt2 = transport_mode(tt, seed=decl_id or 0)
        arr2 = arr or korea_port(tt2)["label"]            # 도착항(한국) — 기존 보존
        dep_port = foreign_port(dep, tt2)["label"]        # 출발항(해외)
        updates.append((tt2, arr2, dep_port, decl_id))
    con.executemany(
        "UPDATE import_declarations SET transport_type=?, arrival_port=?, departure_port=? WHERE id=?",
        updates,
    )
    return len(updates)


def backfill_exports(con: duckdb.DuckDBPyConnection) -> int:
    rows = con.execute(
        "SELECT id, transport_type, dest_country FROM export_declaration"
    ).fetchall()
    updates = []
    for decl_id, tt, dest in rows:
        tt2 = transport_mode(tt, seed=decl_id or 0)
        dep_port = korea_port(tt2)["label"]               # 출발항(한국)
        arr_port = foreign_port(dest, tt2)["label"]       # 도착항(해외)
        updates.append((tt2, dep_port, arr_port, decl_id))
    con.executemany(
        "UPDATE export_declaration SET transport_type=?, departure_port=?, arrival_port=? WHERE id=?",
        updates,
    )
    return len(updates)


def main() -> None:
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        _ensure_columns(con)
        n_imp = backfill_imports(con)
        n_exp = backfill_exports(con)
        # 검증 요약
        imp_null = con.execute(
            "SELECT count(*) FROM import_declarations WHERE departure_port IS NULL OR arrival_port IS NULL"
        ).fetchone()[0]
        exp_null = con.execute(
            "SELECT count(*) FROM export_declaration WHERE departure_port IS NULL OR arrival_port IS NULL"
        ).fetchone()[0]
    print(f"imports backfilled: {n_imp}  (port-null remaining: {imp_null})")
    print(f"exports backfilled: {n_exp}  (port-null remaining: {exp_null})")


if __name__ == "__main__":
    main()
