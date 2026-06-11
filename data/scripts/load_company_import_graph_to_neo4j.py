"""Load DuckDB company import-risk data into Neo4j.

This loader creates a company-centered graph from:
  - company_profiles
  - import_declarations
  - import_risk_scores

Usage:
    python data/scripts/load_company_import_graph_to_neo4j.py
    python data/scripts/load_company_import_graph_to_neo4j.py --clear
"""

from __future__ import annotations

import argparse
import math
import os
from pathlib import Path
from typing import Any

import duckdb
from dotenv import load_dotenv
from neo4j import GraphDatabase, ManagedTransaction


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"

DEFAULT_URI = "bolt://localhost:7687"
DEFAULT_USER = "neo4j"
DEFAULT_PASSWORD = "kcsneo4j1234"
DEFAULT_DATABASE = "neo4j"
SOURCE_TAG = "duckdb.company_import.sample"


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
        supply_stats = as_dicts(
            conn,
            """
            SELECT
                company_id,
                origin_country,
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
            export_countries.append({
                "company_id": company["company_id"],
                "country": country,
            })

    return {
        "companies": companies,
        "declarations": declarations,
        "risk_scores": risk_scores,
        "supply_stats": supply_stats,
        "export_countries": export_countries,
    }


def create_constraints(tx: ManagedTransaction) -> None:
    statements = [
        "CREATE CONSTRAINT company_id IF NOT EXISTS FOR (n:Company) REQUIRE n.company_id IS UNIQUE",
        "CREATE CONSTRAINT declaration_no IF NOT EXISTS FOR (n:Declaration) REQUIRE n.declaration_no IS UNIQUE",
        "CREATE CONSTRAINT risk_score_id IF NOT EXISTS FOR (n:RiskScore) REQUIRE n.risk_score_id IS UNIQUE",
        "CREATE CONSTRAINT country_code IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT hs_code IF NOT EXISTS FOR (n:HsCode) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT item_name IF NOT EXISTS FOR (n:Item) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT broker_name IF NOT EXISTS FOR (n:Broker) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT related_company_name IF NOT EXISTS FOR (n:RelatedCompany) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT industry_code IF NOT EXISTS FOR (n:Industry) REQUIRE n.code IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def clear_company_graph(tx: ManagedTransaction) -> None:
    # 시작 노드 라벨로 범위를 한정해 다른 그래프(예: 위험인물 그래프의
    # Case-[:ORIGINATED_FROM]->Country)와 공유되는 관계 타입을 지우지 않는다.
    delete_statements = [
        "MATCH (:Company)-[r:FILED]->() DELETE r",
        "MATCH (:Declaration)-[r:USES_HS_CODE]->() DELETE r",
        "MATCH (:Declaration)-[r:DECLARES_ITEM]->() DELETE r",
        "MATCH (:Declaration)-[r:ORIGINATED_FROM]->() DELETE r",
        "MATCH (:Country)-[r:SUPPLIES_TO]->(:Company) DELETE r",
        "MATCH (:Company)-[r:HAS_RISK_SCORE]->() DELETE r",
        "MATCH (:Company)-[r:USES_BROKER]->() DELETE r",
        "MATCH (:Company)-[r:HAS_RELATED_COMPANY]->() DELETE r",
        "MATCH (:Company)-[r:IN_INDUSTRY]->() DELETE r",
        "MATCH (:Company)-[r:EXPORTS_TO]->() DELETE r",
    ]
    for statement in delete_statements:
        tx.run(statement)
    tx.run(
        """
        MATCH (n)
        WHERE n.updated_from = $source_tag
        DETACH DELETE n
        """,
        {"source_tag": SOURCE_TAG},
    )


def merge_company(tx: ManagedTransaction, row: dict[str, Any]) -> None:
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
            c.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )

    if row.get("industry_code"):
        tx.run(
            """
            MATCH (c:Company {company_id: $company_id})
            MERGE (i:Industry {code: $industry_code})
            SET i.updated_from = $source_tag
            MERGE (c)-[:IN_INDUSTRY]->(i)
            """,
            {**row, "source_tag": SOURCE_TAG},
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
        MERGE (country:Country {code: $country})
        SET country.updated_from = $source_tag
        MERGE (c)-[:EXPORTS_TO]->(country)
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_declaration(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (d:Declaration {declaration_no: $declaration_no})
        SET d.duckdb_id = $id,
            d.hs_code = $hs_code,
            d.item_name = $item_name,
            d.declared_value = $declared_value,
            d.origin_country = $origin_country,
            d.import_date = $import_date,
            d.status = $status,
            d.updated_from = $source_tag
        MERGE (c)-[:FILED]->(d)
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("hs_code"):
        tx.run(
            """
            MATCH (d:Declaration {declaration_no: $declaration_no})
            MERGE (h:HsCode {code: $hs_code})
            SET h.updated_from = $source_tag
            MERGE (d)-[:USES_HS_CODE]->(h)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )
    if row.get("item_name"):
        tx.run(
            """
            MATCH (d:Declaration {declaration_no: $declaration_no})
            MERGE (item:Item {name: $item_name})
            SET item.updated_from = $source_tag
            MERGE (d)-[:DECLARES_ITEM]->(item)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )
    if row.get("origin_country"):
        tx.run(
            """
            MATCH (d:Declaration {declaration_no: $declaration_no})
            MERGE (country:Country {code: $origin_country})
            SET country.updated_from = $source_tag
            MERGE (d)-[:ORIGINATED_FROM]->(country)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )


def merge_supply_stat(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (country:Country {code: $origin_country})
        SET country.updated_from = $source_tag
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


def merge_risk_score(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    risk_score_id = f"IRS-{row['id']}"
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (r:RiskScore {risk_score_id: $risk_score_id})
        SET r.duckdb_id = $id,
            r.risk_level = $risk_level,
            r.risk_score = $risk_score,
            r.undervaluation_suspicion_rate = $undervaluation_suspicion_rate,
            r.related_party_anomaly_rate = $related_party_anomaly_rate,
            r.fta_origin_misuse_suspicion_rate = $fta_origin_misuse_suspicion_rate,
            r.customs_refund_anomaly_rate = $customs_refund_anomaly_rate,
            r.hs_classification_error_rate = $hs_classification_error_rate,
            r.offshore_fund_concealment_suspicion_rate = $offshore_fund_concealment_suspicion_rate,
            r.generated_at = $generated_at,
            r.updated_from = $source_tag
        MERGE (c)-[:HAS_RISK_SCORE]->(r)
        """,
        {**row, "risk_score_id": risk_score_id, "source_tag": SOURCE_TAG},
    )


def load_to_neo4j(data: dict[str, list[dict[str, Any]]], clear: bool = False) -> dict[str, Any]:
    load_dotenv()
    uri = os.getenv("NEO4J_URI", DEFAULT_URI)
    user = os.getenv("NEO4J_USER", DEFAULT_USER)
    password = os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD)
    database = os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE)

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            session.execute_write(create_constraints)
            if clear:
                session.execute_write(clear_company_graph)

            for row in data["companies"]:
                session.execute_write(merge_company, row)
            for row in data["export_countries"]:
                session.execute_write(merge_export_country, row)
            for row in data["declarations"]:
                session.execute_write(merge_declaration, row)
            for row in data["supply_stats"]:
                session.execute_write(merge_supply_stat, row)
            for row in data["risk_scores"]:
                session.execute_write(merge_risk_score, row)

            node_counts = session.run(
                """
                MATCH (n)
                WITH labels(n)[0] AS label, count(*) AS count
                RETURN label, count
                ORDER BY label
                """
            ).data()
            relationship_counts = session.run(
                """
                MATCH ()-[r]->()
                RETURN type(r) AS type, count(*) AS count
                ORDER BY type
                """
            ).data()
    finally:
        driver.close()

    return {
        "companies_loaded": len(data["companies"]),
        "declarations_loaded": len(data["declarations"]),
        "risk_scores_loaded": len(data["risk_scores"]),
        "supply_stats_loaded": len(data["supply_stats"]),
        "export_country_links_loaded": len(data["export_countries"]),
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB company import-risk graph into Neo4j")
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
