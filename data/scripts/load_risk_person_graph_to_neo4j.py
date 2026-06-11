"""Load DuckDB risk-person investigation data into Neo4j.

This loader builds a richer personal investigation graph than the initial
network_edge-only sample. It includes profiles, cases, organizations, evidence,
risk indicators, analysis history, region/country nodes, and explicit
person-case participation.

Usage:
    python data/scripts/load_risk_person_graph_to_neo4j.py --clear
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
SOURCE_TAG = "duckdb.risk_person.sample"

NODE_LABELS = {
    "person": ("Person", "person_id"),
    "org": ("Organization", "org_id"),
    "case": ("Case", "case_id"),
}


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


def fetch_data() -> dict[str, list[dict[str, Any]]]:
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        return {
            "persons": as_dicts(conn, "SELECT * FROM risk_person_profile ORDER BY person_id"),
            "orgs": as_dicts(conn, "SELECT * FROM risk_org_profile ORDER BY org_id"),
            "cases": as_dicts(conn, "SELECT * FROM smuggling_case ORDER BY case_id"),
            "evidence": as_dicts(conn, "SELECT * FROM evidence_source ORDER BY source_id"),
            "person_case_links": as_dicts(conn, "SELECT * FROM person_case_link ORDER BY link_id"),
            "network_edges": as_dicts(conn, "SELECT * FROM network_edge ORDER BY edge_id"),
            "risk_indicators": as_dicts(conn, "SELECT * FROM risk_indicator ORDER BY indicator_id"),
            "analysis_results": as_dicts(conn, "SELECT * FROM analysis_result ORDER BY analysis_id"),
        }


def create_constraints(tx: ManagedTransaction) -> None:
    statements = [
        "CREATE CONSTRAINT person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.person_id IS UNIQUE",
        "CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (n:Organization) REQUIRE n.org_id IS UNIQUE",
        "CREATE CONSTRAINT case_id IF NOT EXISTS FOR (n:Case) REQUIRE n.case_id IS UNIQUE",
        "CREATE CONSTRAINT evidence_id IF NOT EXISTS FOR (n:Evidence) REQUIRE n.source_id IS UNIQUE",
        "CREATE CONSTRAINT risk_indicator_id IF NOT EXISTS FOR (n:RiskIndicator) REQUIRE n.indicator_id IS UNIQUE",
        "CREATE CONSTRAINT analysis_result_id IF NOT EXISTS FOR (n:AnalysisResult) REQUIRE n.analysis_id IS UNIQUE",
        "CREATE CONSTRAINT country_code IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT region_name IF NOT EXISTS FOR (n:Region) REQUIRE n.name IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def clear_graph(tx: ManagedTransaction) -> None:
    # 시작 노드 라벨로 범위를 한정해 다른 그래프(예: 업체 그래프의
    # Declaration-[:ORIGINATED_FROM]->Country)와 공유되는 관계 타입을 지우지 않는다.
    delete_statements = [
        "MATCH (:Person)-[r:INVOLVED_IN]->() DELETE r",
        "MATCH (s)-[r:NETWORK_EDGE]->() WHERE s:Person OR s:Organization OR s:Case DELETE r",
        "MATCH ()-[r:HAS_EVIDENCE]->(:Evidence) DELETE r",
        "MATCH (:Case)-[r:SUPPORTED_BY]->() DELETE r",
        "MATCH (:Person)-[r:HAS_RISK_INDICATOR]->() DELETE r",
        "MATCH (:Person)-[r:HAS_ANALYSIS_RESULT]->() DELETE r",
        "MATCH (:Case)-[r:ORIGINATED_FROM]->() DELETE r",
        "MATCH (:Case)-[r:TRANSITED_THROUGH]->() DELETE r",
        "MATCH (:Case)-[r:DESTINED_FOR]->() DELETE r",
        "MATCH (:Person)-[r:RESIDES_IN]->() DELETE r",
        "MATCH (:Organization)-[r:LOCATED_IN]->() DELETE r",
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


def merge_person(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (p:Person {person_id: $person_id})
        SET p.profile_type = $profile_type,
            p.name = $name,
            p.name_aliases = $name_aliases,
            p.birth_date = $birth_date,
            p.gender = $gender,
            p.nationality = $nationality,
            p.id_doc_type = $id_doc_type,
            p.id_doc_hash = $id_doc_hash,
            p.phone_hash = $phone_hash,
            p.email_hash = $email_hash,
            p.address_region = $address_region,
            p.occupation = $occupation,
            p.risk_level = $risk_level,
            p.risk_score = $risk_score,
            p.risk_tags = $risk_tags,
            p.watch_status = $watch_status,
            p.seed_batch_id = $seed_batch_id,
            p.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("address_region"):
        tx.run(
            """
            MATCH (p:Person {person_id: $person_id})
            MERGE (r:Region {name: $address_region})
            SET r.updated_from = $source_tag
            MERGE (p)-[:RESIDES_IN]->(r)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )


def merge_org(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (o:Organization {org_id: $org_id})
        SET o.org_name = $org_name,
            o.business_no_hash = $business_no_hash,
            o.org_type = $org_type,
            o.industry_code = $industry_code,
            o.country = $country,
            o.address_region = $address_region,
            o.risk_score = $risk_score,
            o.risk_tags = $risk_tags,
            o.watch_status = $watch_status,
            o.seed_batch_id = $seed_batch_id,
            o.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("address_region"):
        tx.run(
            """
            MATCH (o:Organization {org_id: $org_id})
            MERGE (r:Region {name: $address_region})
            SET r.updated_from = $source_tag
            MERGE (o)-[:LOCATED_IN]->(r)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )


def merge_case(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (c:Case {case_id: $case_id})
        SET c.case_no = $case_no,
            c.case_type = $case_type,
            c.contraband_category = $contraband_category,
            c.contraband_sub_category = $contraband_sub_category,
            c.case_status = $case_status,
            c.detection_date = $detection_date,
            c.detection_channel = $detection_channel,
            c.origin_country = $origin_country,
            c.transit_country = $transit_country,
            c.destination_region = $destination_region,
            c.modus_operandi = $modus_operandi,
            c.concealment_method = $concealment_method,
            c.quantity = $quantity,
            c.quantity_unit = $quantity_unit,
            c.estimated_value = $estimated_value,
            c.lead_agency = $lead_agency,
            c.summary = $summary,
            c.seed_batch_id = $seed_batch_id,
            c.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("origin_country"):
        tx.run(
            """
            MATCH (c:Case {case_id: $case_id})
            MERGE (country:Country {code: $origin_country})
            SET country.updated_from = $source_tag
            MERGE (c)-[:ORIGINATED_FROM]->(country)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )
    if row.get("transit_country") and row.get("transit_country") != "없음":
        tx.run(
            """
            MATCH (c:Case {case_id: $case_id})
            MERGE (country:Country {code: $transit_country})
            SET country.updated_from = $source_tag
            MERGE (c)-[:TRANSITED_THROUGH]->(country)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )
    if row.get("destination_region"):
        tx.run(
            """
            MATCH (c:Case {case_id: $case_id})
            MERGE (r:Region {name: $destination_region})
            SET r.updated_from = $source_tag
            MERGE (c)-[:DESTINED_FOR]->(r)
            """,
            {**row, "source_tag": SOURCE_TAG},
        )


def merge_evidence(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (e:Evidence {source_id: $source_id})
        SET e.source_type = $source_type,
            e.source_title = $source_title,
            e.source_date = $source_date,
            e.source_agency = $source_agency,
            e.classification_level = $classification_level,
            e.file_path = $file_path,
            e.summary = $summary,
            e.reliability_score = $reliability_score,
            e.created_by = $created_by,
            e.seed_batch_id = $seed_batch_id,
            e.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_person_case_link(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (p:Person {person_id: $person_id})
        MATCH (c:Case {case_id: $case_id})
        MERGE (p)-[r:INVOLVED_IN {link_id: $link_id}]->(c)
        SET r.role_in_case = $role_in_case,
            r.confidence_score = $confidence_score,
            r.evidence_level = $evidence_level,
            r.source_id = $source_id,
            r.seed_batch_id = $seed_batch_id,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("source_id"):
        tx.run(
            """
            MATCH (c:Case {case_id: $case_id})
            MATCH (e:Evidence {source_id: $source_id})
            MERGE (c)-[r:SUPPORTED_BY {link_id: $link_id, source_id: $source_id}]->(e)
            SET r.role_in_case = $role_in_case,
                r.evidence_level = $evidence_level,
                r.updated_from = $source_tag
            """,
            {**row, "source_tag": SOURCE_TAG},
        )


def merge_network_edge(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    source = NODE_LABELS.get(str(row["source_type"]))
    target = NODE_LABELS.get(str(row["target_type"]))
    if not source or not target:
        return
    source_label, source_key = source
    target_label, target_key = target
    tx.run(
        f"""
        MATCH (s:{source_label} {{{source_key}: $source_id}})
        MATCH (t:{target_label} {{{target_key}: $target_id}})
        MERGE (s)-[r:NETWORK_EDGE {{edge_id: $edge_id}}]->(t)
        SET r.relation_type = $relation_type,
            r.weight = $weight,
            r.confidence_score = $confidence_score,
            r.first_seen_at = $first_seen_at,
            r.last_seen_at = $last_seen_at,
            r.source_id_ref = $source_id_ref,
            r.seed_batch_id = $seed_batch_id,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("source_id_ref"):
        tx.run(
            f"""
            MATCH (s:{source_label} {{{source_key}: $source_id}})
            MATCH (e:Evidence {{source_id: $source_id_ref}})
            MERGE (s)-[r:HAS_EVIDENCE {{edge_id: $edge_id, source_id: $source_id_ref}}]->(e)
            SET r.relation_type = $relation_type,
                r.updated_from = $source_tag
            """,
            {**row, "source_tag": SOURCE_TAG},
        )


def merge_risk_indicator(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (ri:RiskIndicator {indicator_id: $indicator_id})
        SET ri.entity_type = $entity_type,
            ri.entity_id = $entity_id,
            ri.indicator_code = $indicator_code,
            ri.indicator_name = $indicator_name,
            ri.indicator_value = $indicator_value,
            ri.score = $score,
            ri.weight = $weight,
            ri.reason = $reason,
            ri.calculated_at = $calculated_at,
            ri.seed_batch_id = $seed_batch_id,
            ri.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("entity_type") == "person":
        tx.run(
            """
            MATCH (p:Person {person_id: $entity_id})
            MATCH (ri:RiskIndicator {indicator_id: $indicator_id})
            MERGE (p)-[:HAS_RISK_INDICATOR]->(ri)
            """,
            row,
        )


def merge_analysis_result(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (ar:AnalysisResult {analysis_id: $analysis_id})
        SET ar.entity_type = $entity_type,
            ar.entity_id = $entity_id,
            ar.analysis_type = $analysis_type,
            ar.model_or_agent = $model_or_agent,
            ar.input_summary = $input_summary,
            ar.output_summary = $output_summary,
            ar.risk_score_before = $risk_score_before,
            ar.risk_score_after = $risk_score_after,
            ar.explanation = $explanation,
            ar.review_status = $review_status,
            ar.seed_batch_id = $seed_batch_id,
            ar.created_at = $created_at,
            ar.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )
    if row.get("entity_type") == "person":
        tx.run(
            """
            MATCH (p:Person {person_id: $entity_id})
            MATCH (ar:AnalysisResult {analysis_id: $analysis_id})
            MERGE (p)-[:HAS_ANALYSIS_RESULT]->(ar)
            """,
            row,
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
                session.execute_write(clear_graph)

            for row in data["persons"]:
                session.execute_write(merge_person, row)
            for row in data["orgs"]:
                session.execute_write(merge_org, row)
            for row in data["cases"]:
                session.execute_write(merge_case, row)
            for row in data["evidence"]:
                session.execute_write(merge_evidence, row)
            for row in data["person_case_links"]:
                session.execute_write(merge_person_case_link, row)
            for row in data["network_edges"]:
                session.execute_write(merge_network_edge, row)
            for row in data["risk_indicators"]:
                session.execute_write(merge_risk_indicator, row)
            for row in data["analysis_results"]:
                session.execute_write(merge_analysis_result, row)

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
        "persons_loaded": len(data["persons"]),
        "orgs_loaded": len(data["orgs"]),
        "cases_loaded": len(data["cases"]),
        "evidence_loaded": len(data["evidence"]),
        "person_case_links_loaded": len(data["person_case_links"]),
        "network_edges_loaded": len(data["network_edges"]),
        "risk_indicators_loaded": len(data["risk_indicators"]),
        "analysis_results_loaded": len(data["analysis_results"]),
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB risk-person graph into Neo4j")
    parser.add_argument("--clear", action="store_true", help="Clear previously loaded risk-person graph before loading.")
    args = parser.parse_args()

    print(f"DuckDB: {DB_PATH}")
    data = fetch_data()
    result = load_to_neo4j(data, clear=args.clear)

    print("Load complete")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
