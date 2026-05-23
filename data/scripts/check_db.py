"""DuckDB 상태 점검 스크립트.

사용법
------
python data/scripts/check_db.py           # 전체 요약
python data/scripts/check_db.py --detail  # 전체 데이터 출력 포함
python data/scripts/check_db.py --ml      # ML 분석 준비도 점검
"""
import argparse
from pathlib import Path

import duckdb

DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"

MIN_PEER_COMPANIES = 3
MIN_DECL_PER_HS    = 5


def check_schema(conn: duckdb.DuckDBPyConnection) -> bool:
    tables = {r[0] for r in conn.execute("SHOW TABLES").fetchall()}
    required = {"company_profiles", "import_declarations", "import_risk_scores"}
    missing  = required - tables
    if missing:
        print(f"  [ERROR] 테이블 없음: {missing}")
        return False
    print(f"  테이블 OK: {sorted(tables)}")
    return True


def check_counts(conn: duckdb.DuckDBPyConnection) -> None:
    c_total = conn.execute("SELECT COUNT(*) FROM company_profiles").fetchone()[0]
    c_real  = conn.execute("SELECT COUNT(*) FROM company_profiles WHERE company_id NOT LIKE 'SYN-%'").fetchone()[0]
    c_syn   = c_total - c_real

    d_total = conn.execute("SELECT COUNT(*) FROM import_declarations").fetchone()[0]
    d_real  = conn.execute("SELECT COUNT(*) FROM import_declarations WHERE company_id NOT LIKE 'SYN-%'").fetchone()[0]
    d_syn   = d_total - d_real

    r_total = conn.execute("SELECT COUNT(*) FROM import_risk_scores").fetchone()[0]

    print(f"  기업 프로파일:  전체 {c_total:>3}개  (기본 {c_real}개 + 샘플 {c_syn}개)")
    print(f"  수입 신고:      전체 {d_total:>3}건  (기본 {d_real}건 + 샘플 {d_syn}건)")
    print(f"  위험 점수:      전체 {r_total:>3}건")


def check_industry_stats(conn: duckdb.DuckDBPyConnection) -> None:
    df = conn.execute("""
        SELECT
            c.industry_code,
            COUNT(DISTINCT c.company_id)                                          AS total_companies,
            SUM(CASE WHEN c.company_id NOT LIKE 'SYN-%' THEN 1 ELSE 0 END)       AS real_companies,
            ROUND(AVG(c.risk_score), 1)                                           AS avg_risk,
            COUNT(d.id)                                                            AS total_decls,
            SUM(CASE WHEN d.company_id NOT LIKE 'SYN-%' THEN 1 ELSE 0 END)       AS real_decls
        FROM company_profiles c
        LEFT JOIN import_declarations d ON c.company_id = d.company_id
        GROUP BY c.industry_code
        ORDER BY c.industry_code
    """).df()
    print()
    print(df.to_string(index=False))


def check_ml_readiness(conn: duckdb.DuckDBPyConnection) -> None:
    companies_df = conn.execute(
        "SELECT company_id, industry_code, risk_score FROM company_profiles WHERE company_id NOT LIKE 'SYN-%'"
    ).df()
    decls_df = conn.execute("SELECT company_id, hs_code FROM import_declarations").df()
    all_decls_df = conn.execute("SELECT hs_code, COUNT(*) as cnt FROM import_declarations GROUP BY hs_code").df()

    print(f"\n  {'기업ID':<12} {'업종':<6} {'위험점수':>6}  {'동종기업':>6}  {'HS코드 최소':>9}  {'ML준비'}")
    print("  " + "-" * 58)

    all_ok = True
    for _, row in companies_df.iterrows():
        cid      = row["company_id"]
        industry = row["industry_code"]

        peer_cnt = conn.execute(
            "SELECT COUNT(DISTINCT company_id) FROM company_profiles WHERE industry_code=?",
            [industry],
        ).fetchone()[0]

        my_hs = decls_df[decls_df["company_id"] == cid]["hs_code"].unique()
        if len(my_hs) == 0:
            hs_min = 0
        else:
            hs_min = min(
                int(all_decls_df[all_decls_df["hs_code"] == hs]["cnt"].sum()) if len(all_decls_df[all_decls_df["hs_code"] == hs]) > 0 else 0
                for hs in my_hs
            )

        peer_ok = peer_cnt >= MIN_PEER_COMPANIES
        hs_ok   = hs_min  >= MIN_DECL_PER_HS
        ready   = "OK" if (peer_ok and hs_ok) else "WARN"
        if ready == "WARN":
            all_ok = False

        peer_str = f"{peer_cnt:>2}" + ("" if peer_ok else f" (<{MIN_PEER_COMPANIES})")
        hs_str   = f"{hs_min:>2}" + ("" if hs_ok  else f" (<{MIN_DECL_PER_HS})")
        flag     = "  OK" if ready == "OK" else "  WARN"
        print(f"  {cid:<12} {industry:<6} {float(row['risk_score']):>6.1f}  {peer_str:>8}  {hs_str:>11}  {flag}")

    print()
    if all_ok:
        print("  [ML] 모든 기업 분석 준비 완료")
    else:
        print("  [ML] WARN 항목 있음 → setup_db.py --ml-only 를 실행하세요")


def check_detail(conn: duckdb.DuckDBPyConnection) -> None:
    print("\n[기업 프로파일 전체]")
    print(conn.execute("""
        SELECT company_id, company_name, industry_code, risk_level,
               risk_score, employee_count, annual_import_amount, fta_reduction_rate
        FROM company_profiles ORDER BY company_id
    """).df().to_string(index=False))

    print("\n[수입 신고 전체]")
    print(conn.execute("""
        SELECT id, company_id, declaration_no, hs_code, item_name,
               declared_value, origin_country, import_date, status
        FROM import_declarations ORDER BY company_id, import_date
    """).df().to_string(index=False))

    print("\n[위험 점수 전체]")
    print(conn.execute("""
        SELECT company_id, risk_level, risk_score,
               undervaluation_suspicion_rate, related_party_anomaly_rate,
               fta_origin_misuse_suspicion_rate, hs_classification_error_rate,
               generated_at
        FROM import_risk_scores ORDER BY risk_score DESC
    """).df().to_string(index=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="customs.duckdb 상태 점검")
    parser.add_argument("--detail", action="store_true", help="전체 데이터 출력")
    parser.add_argument("--ml",     action="store_true", help="ML 분석 준비도 점검")
    args = parser.parse_args()

    print(f"DuckDB {duckdb.__version__}  |  DB: {DB_PATH}")
    print(f"파일 크기: {DB_PATH.stat().st_size / 1024:.1f} KB\n" if DB_PATH.exists() else "  [ERROR] DB 파일 없음\n")

    if not DB_PATH.exists():
        print("  setup_db.py --reset 을 실행하여 DB를 생성하세요.")
        return

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        print("[스키마]")
        schema_ok = check_schema(conn)
        if not schema_ok:
            print("\n  setup_db.py --reset 을 실행하여 DB를 복구하세요.")
            return

        print("\n[데이터 현황]")
        check_counts(conn)

        print("\n[업종별 현황]")
        check_industry_stats(conn)

        if args.ml or not args.detail:
            print("\n[ML 분석 준비도]")
            check_ml_readiness(conn)

        if args.detail:
            check_detail(conn)

    print("\n점검 완료")


if __name__ == "__main__":
    main()
