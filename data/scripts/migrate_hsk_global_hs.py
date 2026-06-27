"""[HSK 마이그레이션] 품목 HS를 10자리 HSK(GlobalHS6 + HSK4) 체계로 확장 (멱등).

배경
----
v2 파이프라인(gen_declarations_v2 / gen_declaration_items_v2)은 신고서 헤더 hs_code를
6자리(예: '8471.30'), 품목 hsk_code를 10자리(예: '8471300000')로 생성한다. 그러나
현행 앱 코드(risk_indicators·agent_customs_value·hs_verify·ml 등, 커밋 40aedc8)는
품목 유형 비교·집계를 **global_hs(6자리)** 컬럼으로 수행하고, 신고서 hs_code는
dotted 10자리('XXXX.XX.XXXX')를 기대한다. 이 스키마 정합을 맞추는 일회성 마이그레이션이
커밋되지 않아(과거 customs.backup-pre-hskmigration.duckdb 단서) 재구축 시 누락된다.
본 스크립트가 그 변환을 재현·고정한다.

변환 규칙
--------
- import_declaration_items : hsk_code(10) → global_hs='XXXX.XX', hsk='XXXX'
- import_declarations      : hs_code → 대표품목(line_no 최소) hsk_code 기준 dotted-10으로
                             확장, global_hs='XXXX.XX', hsk='XXXX'
- price_benchmark          : global_hs=hs_code(이미 6자리), hsk=NULL  (40aedc8 모델과 일치)

멱등: 이미 컬럼이 있고 채워져 있으면 값만 재계산(재실행 안전).
사용법: python data/scripts/migrate_hsk_global_hs.py [--db PATH]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import duckdb

DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"


def _add_col(conn: duckdb.DuckDBPyConnection, table: str, col: str, typ: str = "VARCHAR") -> None:
    cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()]
    if col not in cols:
        conn.execute(f'ALTER TABLE "{table}" ADD COLUMN {col} {typ}')


def _g6(hsk10: str | None) -> str | None:
    """10자리 hsk_code → GlobalHS6 dotted 'XXXX.XX'."""
    if not hsk10:
        return None
    d = "".join(ch for ch in str(hsk10) if ch.isdigit())
    if len(d) < 6:
        return None
    return f"{d[0:4]}.{d[4:6]}"


def _hsk4(hsk10: str | None) -> str | None:
    if not hsk10:
        return None
    d = "".join(ch for ch in str(hsk10) if ch.isdigit())
    return d[6:10] if len(d) >= 10 else None


def _dotted10(hsk10: str | None) -> str | None:
    """10자리 → 'XXXX.XX.XXXX'."""
    if not hsk10:
        return None
    d = "".join(ch for ch in str(hsk10) if ch.isdigit())
    if len(d) < 10:
        return None
    return f"{d[0:4]}.{d[4:6]}.{d[6:10]}"


def migrate(conn: duckdb.DuckDBPyConnection) -> None:
    # 1) items: global_hs / hsk  (hsk_code 기준)
    _add_col(conn, "import_declaration_items", "global_hs")
    _add_col(conn, "import_declaration_items", "hsk")
    items = conn.execute(
        "SELECT item_id, hsk_code FROM import_declaration_items"
    ).fetchall()
    for item_id, hsk_code in items:
        conn.execute(
            "UPDATE import_declaration_items SET global_hs=?, hsk=? WHERE item_id=?",
            [_g6(hsk_code), _hsk4(hsk_code), item_id],
        )
    print(f"  items: {len(items)}행 global_hs/hsk 산출")

    # 2) declarations: 대표품목(line_no 최소) hsk_code → hs_code(dotted10)/global_hs/hsk
    _add_col(conn, "import_declarations", "global_hs")
    _add_col(conn, "import_declarations", "hsk")
    rep = conn.execute(
        """
        SELECT d.id,
               (SELECT it.hsk_code FROM import_declaration_items it
                 WHERE it.declaration_id = d.id
                 ORDER BY it.line_no NULLS LAST, it.item_id LIMIT 1) AS rep_hsk
        FROM import_declarations d
        """
    ).fetchall()
    n_full = 0
    for did, rep_hsk in rep:
        if rep_hsk:
            conn.execute(
                "UPDATE import_declarations SET hs_code=?, global_hs=?, hsk=? WHERE id=?",
                [_dotted10(rep_hsk), _g6(rep_hsk), _hsk4(rep_hsk), did],
            )
            n_full += 1
        else:
            # 품목이 없으면 기존 6자리 hs_code를 global_hs로만 정규화
            cur = conn.execute(
                "SELECT hs_code FROM import_declarations WHERE id=?", [did]
            ).fetchone()[0]
            g6 = cur if cur and "." in str(cur) else _g6(cur)
            conn.execute(
                "UPDATE import_declarations SET global_hs=? WHERE id=?", [g6, did]
            )
    print(f"  declarations: {len(rep)}행 (대표품목 매칭 {n_full})")

    # 3) price_benchmark: global_hs=hs_code(6자리), hsk=NULL
    _add_col(conn, "price_benchmark", "global_hs")
    _add_col(conn, "price_benchmark", "hsk")
    conn.execute(
        "UPDATE price_benchmark SET global_hs = hs_code, hsk = NULL "
        "WHERE global_hs IS NULL OR global_hs <> hs_code"
    )
    pb = conn.execute("SELECT COUNT(*) FROM price_benchmark").fetchone()[0]
    print(f"  price_benchmark: {pb}행 global_hs 정규화")


def main() -> None:
    ap = argparse.ArgumentParser(description="HSK(GlobalHS6+HSK4) 스키마 마이그레이션")
    ap.add_argument("--db", type=Path, default=DB_PATH)
    args = ap.parse_args()
    print(f"DB: {args.db}")
    with duckdb.connect(str(args.db)) as conn:
        migrate(conn)
    print("[완료] HSK global_hs/hsk 마이그레이션")


if __name__ == "__main__":
    main()
