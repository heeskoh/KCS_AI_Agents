"""위험 점수 종합 조회 스크립트.

사용법
------
python data/scripts/select_risk_db.py              # 전체 기업 위험 점수 요약
python data/scripts/select_risk_db.py --id C-1001  # 특정 기업만 조회
python data/scripts/select_risk_db.py --high       # 고위험 기업만 조회
python data/scripts/select_risk_db.py --real       # 샘플 제외 실제 기업만 조회
"""
import argparse
from pathlib import Path

import duckdb

DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"


def main() -> None:
    parser = argparse.ArgumentParser(description="수입 위험 점수 조회")
    parser.add_argument("--id",   type=str,  help="특정 기업 ID 조회 (예: C-1001)")
    parser.add_argument("--high", action="store_true", help="고위험(HIGH) 기업만")
    parser.add_argument("--real", action="store_true", help="샘플 데이터 제외")
    args = parser.parse_args()

    print(f"DuckDB {duckdb.__version__}  |  DB: {DB_PATH}\n")

    filters = []
    if args.id:
        filters.append(f"c.company_id = '{args.id}'")
    if args.high:
        filters.append("c.risk_level = 'HIGH'")
    if args.real:
        filters.append("c.company_id NOT LIKE 'SYN-%'")

    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    query = f"""
    SELECT
        c.company_id,
        c.company_name,
        c.industry_code,
        c.risk_level,
        c.risk_score                              AS profile_score,
        COUNT(d.id)                               AS decl_count,
        SUM(d.declared_value)                     AS total_value,
        c.annual_import_amount,
        c.declared_duty_amount,
        c.recent_customs_refund,
        c.fta_reduction_rate,
        r.undervaluation_suspicion_rate,
        r.related_party_anomaly_rate,
        r.fta_origin_misuse_suspicion_rate,
        r.customs_refund_anomaly_rate,
        r.hs_classification_error_rate,
        r.offshore_fund_concealment_suspicion_rate
    FROM company_profiles c
    LEFT JOIN import_declarations d  ON c.company_id = d.company_id
    LEFT JOIN import_risk_scores  r  ON c.company_id = r.company_id
    {where}
    GROUP BY
        c.company_id, c.company_name, c.industry_code,
        c.risk_level, c.risk_score, c.annual_import_amount,
        c.declared_duty_amount, c.recent_customs_refund, c.fta_reduction_rate,
        r.undervaluation_suspicion_rate, r.related_party_anomaly_rate,
        r.fta_origin_misuse_suspicion_rate, r.customs_refund_anomaly_rate,
        r.hs_classification_error_rate, r.offshore_fund_concealment_suspicion_rate
    ORDER BY c.risk_score DESC NULLS LAST
    """

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        df = conn.execute(query).df()

    if df.empty:
        print("조회 결과 없음")
        return

    # 위험 등급별 집계
    level_counts = df["risk_level"].value_counts().to_dict()
    print(f"조회 결과: {len(df)}개 기업  (HIGH {level_counts.get('HIGH', 0)} / MEDIUM {level_counts.get('MEDIUM', 0)} / LOW {level_counts.get('LOW', 0)})")
    print()
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
