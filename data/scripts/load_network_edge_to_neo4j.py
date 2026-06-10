"""Load DuckDB network_edge sample data into Neo4j.

The loader keeps DuckDB as the source of truth and creates an idempotent
sample graph in Neo4j using MERGE.

Usage:
    python data/scripts/load_network_edge_to_neo4j.py
    python data/scripts/load_network_edge_to_neo4j.py --limit 0
"""

from __future__ import annotations

import argparse
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

NODE_LABELS = {
    "person": "Person",
    "org": "Organization",
    "case": "Case",
}


def _as_dicts(conn: duckdb.DuckDBPyConnection, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    return conn.execute(sql, params or []).df().to_dict("records")


def fetch_network_sample(limit: int) -> dict[str, list[dict[str, Any]]]:
    edge_limit = "" if limit <= 0 else f"LIMIT {int(limit)}"
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        edges = _as_dicts(
            conn,
            f"""
            SELECT *
            FROM network_edge
            ORDER BY edge_id
            {edge_limit}
            """,
        )

        person_ids = sorted({
            str(v)
            for e in edges
            for t, v in ((e["source_type"], e["source_id"]), (e["target_type"], e["target_id"]))
            if t == "person" and v
        })
        org_ids = sorted({
            str(v)
            for e in edges
            for t, v in ((e["source_type"], e["source_id"]), (e["target_type"], e["target_id"]))
            if t == "org" and v
        })
        case_ids = sorted({
            str(v)
            for e in edges
            for t, v in ((e["source_type"], e["source_id"]), (e["target_type"], e["target_id"]))
            if t == "case" and v
        })
        evidence_ids = sorted({str(e["source_id_ref"]) for e in edges if e.get("source_id_ref")})

        persons = _as_dicts(
            conn,
            "SELECT * FROM risk_person_profile WHERE person_id IN (SELECT unnest(?))",
            [person_ids],
        ) if person_ids else []
        orgs = _as_dicts(
            conn,
            "SELECT * FROM risk_org_profile WHERE org_id IN (SELECT unnest(?))",
            [org_ids],
        ) if org_ids else []
        cases = _as_dicts(
            conn,
            "SELECT * FROM smuggling_case WHERE case_id IN (SELECT unnest(?))",
            [case_ids],
        ) if case_ids else []
        evidence = _as_dicts(
            conn,
            "SELECT * FROM evidence_source WHERE source_id IN (SELECT unnest(?))",
            [evidence_ids],
        ) if evidence_ids else []

    return {
        "edges": edges,
        "persons": persons,
        "orgs": orgs,
        "cases": cases,
        "evidence": evidence,
    }


def create_constraints(tx: ManagedTransaction) -> None:
    statements = [
        "CREATE CONSTRAINT person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.person_id IS UNIQUE",
        "CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (n:Organization) REQUIRE n.org_id IS UNIQUE",
        "CREATE CONSTRAINT case_id IF NOT EXISTS FOR (n:Case) REQUIRE n.case_id IS UNIQUE",
        "CREATE CONSTRAINT evidence_id IF NOT EXISTS FOR (n:Evidence) REQUIRE n.source_id IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def merge_person(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (n:Person {person_id: $person_id})
        SET n.name = $name,
            n.profile_type = $profile_type,
            n.risk_level = $risk_level,
            n.risk_score = $risk_score,
            n.risk_tags = $risk_tags,
            n.watch_status = $watch_status,
            n.nationality = $nationality,
            n.address_region = $address_region,
            n.updated_from = 'duckdb.network_edge.sample'
        """,
        row,
    )


def merge_org(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (n:Organization {org_id: $org_id})
        SET n.org_name = $org_name,
            n.org_type = $org_type,
            n.industry_code = $industry_code,
            n.country = $country,
            n.address_region = $address_region,
            n.risk_score = $risk_score,
            n.risk_tags = $risk_tags,
            n.watch_status = $watch_status,
            n.updated_from = 'duckdb.network_edge.sample'
        """,
        row,
    )


def merge_case(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (n:Case {case_id: $case_id})
        SET n.case_no = $case_no,
            n.case_type = $case_type,
            n.contraband_category = $contraband_category,
            n.contraband_sub_category = $contraband_sub_category,
            n.case_status = $case_status,
            n.detection_date = $detection_date,
            n.origin_country = $origin_country,
            n.transit_country = $transit_country,
            n.destination_region = $destination_region,
            n.summary = $summary,
            n.updated_from = 'duckdb.network_edge.sample'
        """,
        row,
    )


def merge_evidence(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (n:Evidence {source_id: $source_id})
        SET n.source_type = $source_type,
            n.source_title = $source_title,
            n.source_date = $source_date,
            n.source_agency = $source_agency,
            n.classification_level = $classification_level,
            n.file_path = $file_path,
            n.summary = $summary,
            n.reliability_score = $reliability_score,
            n.updated_from = 'duckdb.network_edge.sample'
        """,
        row,
    )


def merge_stub_node(tx: ManagedTransaction, node_type: str, node_id: str) -> None:
    label = NODE_LABELS[node_type]
    key = {"person": "person_id", "org": "org_id", "case": "case_id"}[node_type]
    tx.run(
        f"""
        MERGE (n:{label} {{{key}: $node_id}})
        SET n.updated_from = coalesce(n.updated_from, 'duckdb.network_edge.sample.stub')
        """,
        {"node_id": node_id},
    )


def merge_network_edge(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    source_label = NODE_LABELS.get(str(row["source_type"]))
    target_label = NODE_LABELS.get(str(row["target_type"]))
    source_key = {"person": "person_id", "org": "org_id", "case": "case_id"}[str(row["source_type"])]
    target_key = {"person": "person_id", "org": "org_id", "case": "case_id"}[str(row["target_type"])]

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
            r.updated_from = 'duckdb.network_edge.sample'
        """,
        row,
    )

    if row.get("source_id_ref"):
        tx.run(
            f"""
            MATCH (s:{source_label} {{{source_key}: $source_id}})
            MATCH (e:Evidence {{source_id: $source_id_ref}})
            MERGE (s)-[r:HAS_EVIDENCE {{edge_id: $edge_id, source_id: $source_id_ref}}]->(e)
            SET r.relation_type = $relation_type,
                r.updated_from = 'duckdb.network_edge.sample'
            """,
            row,
        )


def load_to_neo4j(data: dict[str, list[dict[str, Any]]], clear: bool = False) -> dict[str, int]:
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
                session.run("MATCH ()-[r:HAS_EVIDENCE]->() DELETE r")
                session.run("MATCH ()-[r:NETWORK_EDGE]->() DELETE r")
                session.run(
                    """
                    MATCH (n)
                    WHERE n.updated_from STARTS WITH 'duckdb.network_edge.sample'
                    DETACH DELETE n
                    """
                )

            for row in data["persons"]:
                session.execute_write(merge_person, row)
            for row in data["orgs"]:
                session.execute_write(merge_org, row)
            for row in data["cases"]:
                session.execute_write(merge_case, row)
            for row in data["evidence"]:
                session.execute_write(merge_evidence, row)

            for edge in data["edges"]:
                if edge["source_type"] in NODE_LABELS:
                    session.execute_write(merge_stub_node, str(edge["source_type"]), str(edge["source_id"]))
                if edge["target_type"] in NODE_LABELS:
                    session.execute_write(merge_stub_node, str(edge["target_type"]), str(edge["target_id"]))
                session.execute_write(merge_network_edge, edge)

            counts = session.run(
                """
                MATCH (n)
                WITH labels(n)[0] AS label, count(*) AS count
                RETURN label, count
                ORDER BY label
                """
            ).data()
            rel_counts = session.run(
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
        "network_edges_loaded": len(data["edges"]),
        "neo4j_node_counts": counts,
        "neo4j_relationship_counts": rel_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB network_edge sample data into Neo4j")
    parser.add_argument("--limit", type=int, default=300, help="network_edge rows to load. Use 0 for all rows.")
    parser.add_argument("--clear", action="store_true", help="Clear previously loaded sample graph before loading.")
    args = parser.parse_args()

    print(f"DuckDB: {DB_PATH}")
    print(f"network_edge limit: {'all' if args.limit <= 0 else args.limit}")

    data = fetch_network_sample(args.limit)
    result = load_to_neo4j(data, clear=args.clear)

    print("Load complete")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
