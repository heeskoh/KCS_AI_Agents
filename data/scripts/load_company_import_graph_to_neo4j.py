"""Load DuckDB company import-risk data into Neo4j (entity-centric model).

Modeling principle (2026 재모델링):
  - 노드 = 엔티티/분류: Company, Country, HsCode, Broker, RelatedCompany
  - 수입신고(Declaration)는 노드가 아니라 **관계(엣지)**로 표현한다.
        (:Company)-[:IMPORTED {declaration_no, item_name, declared_value, origin_country,
                               import_date, status}]->(:HsCode)
  - 위험점수(RiskScore)·업종(Industry)·품명(Item)은 **노드 속성 또는 엣지 속성**으로 흡수한다.
        · 위험점수 6개 지표율 → Company 속성
        · 업종코드 → Company.industry_code 속성
        · 품명     → IMPORTED 엣지 item_name 속성
  - 국가/관세사/관계사 관계는 유지: SUPPLIES_TO, EXPORTS_TO, USES_BROKER, HAS_RELATED_COMPANY

DuckDB remains the source of truth. Neo4j is a derived graph store.

Usage:
    python data/scripts/load_company_import_graph_to_neo4j.py --clear
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path
from typing import Any

import duckdb
from dotenv import load_dotenv
from neo4j import GraphDatabase, ManagedTransaction


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from src.countries import country_code, country_name  # noqa: E402

DEFAULT_URI = "bolt://localhost:7687"
DEFAULT_USER = "neo4j"
DEFAULT_PASSWORD = "kcsneo4j1234"
DEFAULT_DATABASE = "neo4j"
SOURCE_TAG = "duckdb.company_import.sample"

RISK_RATE_FIELDS = (
    "undervaluation_suspicion_rate",
    "related_party_anomaly_rate",
    "fta_origin_misuse_suspicion_rate",
    "customs_refund_anomaly_rate",
    "hs_classification_error_rate",
    "offshore_fund_concealment_suspicion_rate",
)


def clean_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if value != value:
            return None
    except TypeError:
        pass
    if isinstance(value, float) and math.isnan(value):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def clean_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: clean_value(value) for key, value in row.items()}


def as_dicts(conn: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
    return [clean_row(row) for row in conn.execute(sql).df().to_dict("records")]


def country_tokens(raw: str | None) -> list[str]:
    if not raw:
        return []
    tokens = []
    for token in str(raw).replace("/", ",").replace(";", ",").split(","):
        cleaned = token.strip()
        if cleaned and cleaned.lower() not in {"none", "nan"}:
            tokens.append(cleaned)
    return sorted(set(tokens))


def fetch_company_import_data() -> dict[str, list[dict[str, Any]]]:
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        companies = as_dicts(conn, "SELECT * FROM company_profiles ORDER BY company_id")
        declarations = as_dicts(conn, "SELECT * FROM import_declarations ORDER BY id")
        risk_scores = as_dicts(conn, "SELECT * FROM import_risk_scores ORDER BY id")
        # 2026 재설계: 근거 기반 위험지표 (테이블 없으면 빈 목록 — 하위호환)
        try:
            risk_indicators = as_dicts(conn, "SELECT * FROM company_risk_indicator ORDER BY id")
        except duckdb.CatalogException:
            risk_indicators = []
        supply_stats = as_dicts(
            conn,
            """
            SELECT
                company_id,
                origin_country,
                MAX(origin_country_name) AS origin_country_name,
                COUNT(*) AS declaration_count,
                SUM(declared_value) AS total_declared_value,
                SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) AS review_count,
                SUM(CASE WHEN status = 'INSPECT' THEN 1 ELSE 0 END) AS inspect_count,
                SUM(CASE WHEN status = 'HOLD' THEN 1 ELSE 0 END) AS hold_count
            FROM import_declarations
            GROUP BY company_id, origin_country
            ORDER BY company_id, origin_country
            """,
        )

    export_countries = []
    for company in companies:
        for country in country_tokens(company.get("major_export_countries")):
            code = country_code(country)
            export_countries.append({
                "company_id": company["company_id"],
                "country_code": code,
                "country_name": country_name(code, default=country),
            })

    return {
        "companies": companies,
        "declarations": declarations,
        "risk_scores": risk_scores,
        "supply_stats": supply_stats,
        "export_countries": export_countries,
        "risk_indicators": risk_indicators,
    }


def build_risk_by_company(risk_scores: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """company_id → 최신 위험점수 행 (generated_at 기준)."""
    latest: dict[str, dict[str, Any]] = {}
    for row in risk_scores:
        cid = row.get("company_id")
        if not cid:
            continue
        prev = latest.get(cid)
        if prev is None or str(row.get("generated_at") or "") >= str(prev.get("generated_at") or ""):
            latest[cid] = row
    return latest


def create_constraints(tx: ManagedTransaction) -> None:
    statements = [
        "CREATE CONSTRAINT company_id IF NOT EXISTS FOR (n:Company) REQUIRE n.company_id IS UNIQUE",
        "CREATE CONSTRAINT country_code IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT hs_code IF NOT EXISTS FOR (n:HsCode) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT broker_name IF NOT EXISTS FOR (n:Broker) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT related_company_name IF NOT EXISTS FOR (n:RelatedCompany) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT risk_indicator_code IF NOT EXISTS FOR (n:RiskIndicator) REQUIRE n.code IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def clear_company_graph(tx: ManagedTransaction) -> None:
    delete_statements = [
        "MATCH (:Company)-[r:IMPORTED]->() DELETE r",
        "MATCH (:Country)-[r:SUPPLIES_TO]->(:Company) DELETE r",
        "MATCH (:Company)-[r:USES_BROKER]->() DELETE r",
        "MATCH (:Company)-[r:HAS_RELATED_COMPANY]->() DELETE r",
        "MATCH (:Company)-[r:EXPORTS_TO]->() DELETE r",
        "MATCH (:Company)-[r:HAS_RISK_INDICATOR]->() DELETE r",
    ]
    for statement in delete_statements:
        tx.run(statement)
    # 본 로더 전용 노드만 삭제. Country는 우범자 그래프와 공유하므로 제외
    # (공유 노드를 DETACH DELETE 하면 상대 그래프의 관계까지 사라짐).
    tx.run(
        """
        MATCH (n)
        WHERE n.updated_from = $source_tag
          AND (n:Company OR n:HsCode OR n:Broker OR n:RelatedCompany OR n:RiskIndicator)
        DETACH DELETE n
        """,
        {"source_tag": SOURCE_TAG},
    )


def merge_company(tx: ManagedTransaction, row: dict[str, Any], risk: dict[str, Any]) -> None:
    params = {**row, "source_tag": SOURCE_TAG}
    for field in RISK_RATE_FIELDS:
        params[field] = risk.get(field)
    tx.run(
        """
        MERGE (c:Company {company_id: $company_id})
        SET c.company_name = $company_name,
            c.business_registration_no = $business_registration_no,
            c.industry_code = $industry_code,
            c.founded_year = $founded_year,
            c.risk_level = $risk_level,
            c.risk_score = $risk_score,
            c.last_audit_date = $last_audit_date,
            c.address_postal_code = $address_postal_code,
            c.address = $address,
            c.address_detail = $address_detail,
            c.employee_count = $employee_count,
            c.major_export_countries = $major_export_countries,
            c.annual_revenue = $annual_revenue,
            c.annual_import_amount = $annual_import_amount,
            c.declared_duty_amount = $declared_duty_amount,
            c.recent_customs_refund = $recent_customs_refund,
            c.fta_reduction_rate = $fta_reduction_rate,
            c.undervaluation_suspicion_rate = $undervaluation_suspicion_rate,
            c.related_party_anomaly_rate = $related_party_anomaly_rate,
            c.fta_origin_misuse_suspicion_rate = $fta_origin_misuse_suspicion_rate,
            c.customs_refund_anomaly_rate = $customs_refund_anomaly_rate,
            c.hs_classification_error_rate = $hs_classification_error_rate,
            c.offshore_fund_concealment_suspicion_rate = $offshore_fund_concealment_suspicion_rate,
            c.updated_from = $source_tag
        """,
        params,
    )
    if row.get("customs_broker_firm"):
        tx.run(
            """
            MATCH (c:Company {company_id: $company_id})
            MERGE (b:Broker {name: $customs_broker_firm})
            SET b.updated_from = $source_tag
            MERGE (c)-[:USES_BROKER]->(b)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )
    if row.get("related_companies"):
        tx.run(
            """
            MATCH (c:Company {company_id: $company_id})
            MERGE (r:RelatedCompany {name: $related_companies})
            SET r.updated_from = $source_tag
            MERGE (c)-[:HAS_RELATED_COMPANY]->(r)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )


def merge_export_country(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (country:Country {code: $country_code})
        SET country.name = $country_name,
            country.updated_from = $source_tag
        MERGE (c)-[:EXPORTS_TO]->(country)
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_declaration(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    """수입신고 → (:Company)-[:IMPORTED {...}]->(:HsCode). HS 코드 없으면 건너뜀."""
    if not row.get("hs_code"):
        return
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (h:HsCode {code: $hs_code})
        SET h.updated_from = $source_tag
        MERGE (c)-[r:IMPORTED {declaration_no: $declaration_no}]->(h)
        SET r.duckdb_id = $id,
            r.item_name = $item_name,
            r.declared_value = $declared_value,
            r.origin_country = $origin_country,
            r.origin_country_name = $origin_country_name,
            r.import_date = $import_date,
            r.status = $status,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_supply_stat(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (country:Country {code: $origin_country})
        SET country.name = $origin_country_name,
            country.updated_from = $source_tag
        MERGE (country)-[r:SUPPLIES_TO]->(c)
        SET r.declaration_count = $declaration_count,
            r.total_declared_value = $total_declared_value,
            r.review_count = $review_count,
            r.inspect_count = $inspect_count,
            r.hold_count = $hold_count,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_risk_indicator(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    """위험지표 1건 → (:Company)-[:HAS_RISK_INDICATOR {score, reason, ...}]->(:RiskIndicator).

    지표 유형(indicator_code)은 분류 엔티티인 RiskIndicator 노드(6종 공유)로 두고,
    기업별 점수·근거는 엣지 속성으로 표현(우범자 그래프의 근거=엣지 철학과 일관).
    """
    if not row.get("company_id") or not row.get("indicator_code"):
        return
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (ri:RiskIndicator {code: $indicator_code})
        SET ri.name = $indicator_name, ri.updated_from = $source_tag
        MERGE (c)-[r:HAS_RISK_INDICATOR]->(ri)
        SET r.score = $score,
            r.reason = $reason,
            r.recommendation = $recommendation,
            r.related_refs = $related_refs,
            r.calculated_at = $calculated_at,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def load_to_neo4j(data: dict[str, list[dict[str, Any]]], clear: bool = False) -> dict[str, Any]:
    load_dotenv()
    uri = os.getenv("NEO4J_URI", DEFAULT_URI)
    user = os.getenv("NEO4J_USER", DEFAULT_USER)
    password = os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD)
    database = os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE)

    risk_by_company = build_risk_by_company(data["risk_scores"])

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            session.execute_write(create_constraints)
            if clear:
                session.execute_write(clear_company_graph)

            for row in data["companies"]:
                session.execute_write(merge_company, row, risk_by_company.get(row["company_id"], {}))
            for row in data["export_countries"]:
                session.execute_write(merge_export_country, row)
            for row in data["declarations"]:
                session.execute_write(merge_declaration, row)
            for row in data["supply_stats"]:
                session.execute_write(merge_supply_stat, row)
            for row in data["risk_indicators"]:
                session.execute_write(merge_risk_indicator, row)

            node_counts = session.run(
                "MATCH (n) WITH labels(n)[0] AS label, count(*) AS count RETURN label, count ORDER BY label"
            ).data()
            relationship_counts = session.run(
                "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY type"
            ).data()
    finally:
        driver.close()

    return {
        "companies_loaded": len(data["companies"]),
        "declarations_loaded": len(data["declarations"]),
        "supply_stats_loaded": len(data["supply_stats"]),
        "export_country_links_loaded": len(data["export_countries"]),
        "risk_scores_folded": len(risk_by_company),
        "risk_indicators_loaded": len(data["risk_indicators"]),
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB company import-risk graph into Neo4j (entity-centric)")
    parser.add_argument("--clear", action="store_true", help="Clear previously loaded company graph before loading.")
    args = parser.parse_args()

    print(f"DuckDB: {DB_PATH}")
    data = fetch_company_import_data()
    result = load_to_neo4j(data, clear=args.clear)

    print("Load complete")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
