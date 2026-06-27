"""[세목 보강] 수입신고서 서식 세목 영역(세종/세율/감면) 구조에 맞춰 _item_taxes 보강 (멱등).

작성예(HWP) 세목 영역은 세종(관세·개별소비세·교통세·주세·교육세·농특세·부가세)을 행으로 갖는
반복그룹이다. 현재 데이터는 관세·부가세(+개소세 일부)만 있어 세종 스택이 불완전했다.
본 스크립트는 실제 과세체계에 맞춰 보강한다.

보강 내용
  1) 교육세 행 추가: 개별소비세 보유 품목에 교육세 = 개별소비세액 × 30% (내국세종부호 'ED')
  2) 내국세종부호 정합: 관세→NULL, 개별소비세→'IC', 교육세→'ED', 부가가치세→'VAT'
  3) 세종 순서(seq) 재정렬: 관세(1) → 개별소비세 → 교육세 → 부가가치세(말미)
  4) 신고서 세액 합계 backfill(서식 ㉖~): 총관세/총개별소비세/총교육세/총부가세/총부가세과표/총세액합계

멱등: 교육세 행은 없을 때만 추가, 합계·순서·코드는 매 실행 재계산. 재실행 안전.
실행: python data/scripts/augment_item_taxes_sejong.py [--db PATH]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import duckdb

DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"

EDU_RATE = 0.30   # 교육세 = 개별소비세액의 30%
INTERNAL_CODE = {"개별소비세": "IC", "교육세": "ED", "부가가치세": "VAT",
                 "교통세": "TR", "주세": "LQ", "농어촌특별세": "RU"}
SEJONG_ORDER = {"관세": 1, "개별소비세": 2, "교통세": 3, "주세": 4,
                "교육세": 5, "농어촌특별세": 6, "부가가치세": 9}


def augment(conn: duckdb.DuckDBPyConnection) -> None:
    # 1) 교육세 행 추가 (개별소비세 보유 품목, 중복 방지)
    rows = conn.execute(
        """
        SELECT t.item_id, t.tax_amount
        FROM import_declaration_item_taxes t
        WHERE t.tax_type = '개별소비세'
          AND NOT EXISTS (
            SELECT 1 FROM import_declaration_item_taxes e
            WHERE e.item_id = t.item_id AND e.tax_type = '교육세')
        """
    ).fetchall()
    next_id = (conn.execute("SELECT COALESCE(MAX(tax_id),0) FROM import_declaration_item_taxes").fetchone()[0])
    added = 0
    for item_id, ic_amount in rows:
        next_id += 1
        edu = round(float(ic_amount or 0) * EDU_RATE)
        conn.execute(
            """
            INSERT INTO import_declaration_item_taxes
              (tax_id, item_id, seq, tax_type, rate_type, tax_rate, reduction_rate,
               tax_amount, reduction_installment_code, reduction_amount, internal_tax_code)
            VALUES (?, ?, 5, '교육세', '기본세율', 30.0, 0.0, ?, NULL, 0.0, 'ED')
            """,
            [next_id, item_id, edu],
        )
        added += 1

    # 2) 내국세종부호 정합
    for tax_type, code in INTERNAL_CODE.items():
        conn.execute(
            "UPDATE import_declaration_item_taxes SET internal_tax_code=? "
            "WHERE tax_type=? AND (internal_tax_code IS NULL OR internal_tax_code<>?)",
            [code, tax_type, code],
        )
    conn.execute("UPDATE import_declaration_item_taxes SET internal_tax_code=NULL WHERE tax_type='관세'")

    # 3) 세종 순서(seq) 재정렬
    for tax_type, order in SEJONG_ORDER.items():
        conn.execute(
            "UPDATE import_declaration_item_taxes SET seq=? WHERE tax_type=?",
            [order, tax_type],
        )

    # 4) 신고서 세액 합계 backfill (품목→신고서 집계)
    conn.execute(
        """
        UPDATE import_declarations AS d SET
          tax_customs_duty           = COALESCE(a.duty, 0),
          tax_individual_consumption = COALESCE(a.ic, 0),
          tax_education              = COALESCE(a.edu, 0),
          tax_vat                    = COALESCE(a.vat, 0),
          total_vat_base             = COALESCE(round(a.vat / 0.10), 0),
          total_tax_amount           = COALESCE(a.total, 0)
        FROM (
          SELECT it.declaration_id AS did,
                 SUM(CASE WHEN t.tax_type='관세' THEN t.tax_amount END)         AS duty,
                 SUM(CASE WHEN t.tax_type='개별소비세' THEN t.tax_amount END)    AS ic,
                 SUM(CASE WHEN t.tax_type='교육세' THEN t.tax_amount END)        AS edu,
                 SUM(CASE WHEN t.tax_type='부가가치세' THEN t.tax_amount END)    AS vat,
                 SUM(t.tax_amount)                                              AS total
          FROM import_declaration_item_taxes t
          JOIN import_declaration_items it ON it.item_id = t.item_id
          GROUP BY it.declaration_id
        ) AS a
        WHERE d.id = a.did
        """
    )

    dist = dict(conn.execute(
        "SELECT tax_type, COUNT(*) FROM import_declaration_item_taxes GROUP BY 1 ORDER BY 2 DESC"
    ).fetchall())
    print(f"  교육세 행 추가: {added}")
    print(f"  세종 분포: {dist}")
    print(f"  품목당 세목수 분포: "
          f"{dict(conn.execute('SELECT n,COUNT(*) FROM (SELECT item_id,COUNT(*) n FROM import_declaration_item_taxes GROUP BY item_id) GROUP BY n ORDER BY n').fetchall())}")


def main() -> None:
    ap = argparse.ArgumentParser(description="수입신고서 세목(_item_taxes) 보강")
    ap.add_argument("--db", type=Path, default=DB_PATH)
    args = ap.parse_args()
    print(f"DB: {args.db}")
    with duckdb.connect(str(args.db)) as conn:
        augment(conn)
    print("[완료] 세목 보강")


if __name__ == "__main__":
    main()
