"""[Phase 0] 위험모델 v2 스키마 확장 (비파괴·멱등).

조건1~7 재설계를 위한 컬럼/테이블을 추가만 한다(기존 데이터 보존). 이후 Phase 1~4가
이 스키마를 채운다.

추가 내용
  company_profiles      : entity_role, primary_domain, crime_types
  risk_person_profile   : entity_role, primary_domain, crime_types, personal_clearance_code
  import_declarations   : importer_person_id, crime_signal
  import_risk_scores    : customs_crime_rate, drug_crime_rate, forex_crime_rate   (수사대상 기업 범죄위험률)
  person_risk_scores    : (신규) 개인 2계층 지표 — 통관 베이스 + 범죄위험률
  person_import_event   : (신규) 마약/외환 개인의 반입·거래 이벤트(정식 신고 비현실 대체, 10~20건 충족용)

사용법: python data/scripts/migrate_risk_model_v2.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"


def _existing_columns(con: duckdb.DuckDBPyConnection, table: str) -> set[str]:
    return {r[0] for r in con.execute(f'PRAGMA table_info("{table}")').fetchall()}


def _add_column(con: duckdb.DuckDBPyConnection, table: str, col: str, decl: str) -> bool:
    """컬럼이 없으면 추가. 추가했으면 True."""
    if col in _existing_columns(con, table):
        return False
    con.execute(f'ALTER TABLE "{table}" ADD COLUMN {col} {decl}')
    return True


def migrate(con: duckdb.DuckDBPyConnection) -> dict[str, list[str]]:
    added: dict[str, list[str]] = {}

    def add(table: str, col: str, decl: str) -> None:
        if _add_column(con, table, col, decl):
            added.setdefault(table, []).append(col)

    # ── 기업 마스터: 역할/도메인/죄종 ──
    add("company_profiles", "entity_role", "VARCHAR")       # audit | investigation | both
    add("company_profiles", "primary_domain", "VARCHAR")    # customs | drug | forex
    add("company_profiles", "crime_types", "VARCHAR")       # CSV (죄종, audit는 빈값)

    # ── 개인 마스터: 역할/도메인/죄종 + 개인통관고유부호 ──
    add("risk_person_profile", "entity_role", "VARCHAR")        # 항상 investigation
    add("risk_person_profile", "primary_domain", "VARCHAR")
    add("risk_person_profile", "crime_types", "VARCHAR")
    add("risk_person_profile", "personal_clearance_code", "VARCHAR")

    # ── 수입신고: 개인 수입자 연결 + 죄종 신호 태그 ──
    add("import_declarations", "importer_person_id", "VARCHAR")
    add("import_declarations", "crime_signal", "VARCHAR")   # 예: undervalue|fta_misuse|hs_error|...

    # ── 수사대상 기업 범죄위험률(조건3): 6위험률(기존) + 3 범죄도메인 종합률 ──
    add("import_risk_scores", "customs_crime_rate", "DOUBLE")
    add("import_risk_scores", "drug_crime_rate", "DOUBLE")
    add("import_risk_scores", "forex_crime_rate", "DOUBLE")

    # ── (신규) 개인 2계층 지표 점수표 (조건4) ──
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS person_risk_scores (
            id BIGINT,
            person_id VARCHAR,
            risk_level VARCHAR,
            risk_score DOUBLE,
            -- Tier1 개인 통관 베이스(개인 수입 적용분만)
            undervaluation_suspicion_rate DOUBLE,
            hs_classification_error_rate DOUBLE,
            origin_misuse_suspicion_rate DOUBLE,
            offshore_fund_concealment_suspicion_rate DOUBLE,
            -- Tier2 범죄위험률
            customs_crime_rate DOUBLE,
            drug_crime_rate DOUBLE,
            forex_crime_rate DOUBLE,
            generated_at TIMESTAMP,
            seed_batch_id VARCHAR
        )
        """
    )
    if "person_risk_scores" not in added:
        added["person_risk_scores"] = ["(created/exists)"]

    # ── (신규) 개인 반입·거래 이벤트 (마약/외환 개인의 10~20건 충족) ──
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS person_import_event (
            event_id VARCHAR,
            person_id VARCHAR,
            seq INTEGER,
            event_date DATE,
            event_kind VARCHAR,       -- 여행자휴대품 | 국제우편 | 특송 | 정식수입 | 해외송금
            channel VARCHAR,
            origin_country VARCHAR,
            transit_country VARCHAR,
            item_name VARCHAR,
            item_category VARCHAR,
            declared_value DOUBLE,
            actual_value DOUBLE,      -- 저가/은닉 신호용(신고가 대비)
            currency VARCHAR,
            crime_signal VARCHAR,
            linked_case_id VARCHAR,
            note VARCHAR,
            seed_batch_id VARCHAR,
            created_at TIMESTAMP
        )
        """
    )
    if "person_import_event" not in added:
        added["person_import_event"] = ["(created/exists)"]

    return added


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        added = migrate(con)
    print("[Phase 0] 스키마 v2 확장 완료 (비파괴·멱등)")
    if not added:
        print("  변경 없음 — 이미 최신 스키마")
    for table, cols in added.items():
        print(f"  {table}: +{cols}")


if __name__ == "__main__":
    main()
