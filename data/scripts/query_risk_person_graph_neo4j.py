"""Query a risk-person centered Neo4j graph sample.

Usage:
    python data/scripts/query_risk_person_graph_neo4j.py RP-0006
"""

from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv
from neo4j import GraphDatabase


DEFAULT_URI = "bolt://localhost:7687"
DEFAULT_USER = "neo4j"
DEFAULT_PASSWORD = "kcsneo4j1234"
DEFAULT_DATABASE = "neo4j"


def main() -> None:
    parser = argparse.ArgumentParser(description="Query a Neo4j risk-person graph sample")
    parser.add_argument("person_id", nargs="?", default="RP-0006")
    args = parser.parse_args()

    load_dotenv()
    uri = os.getenv("NEO4J_URI", DEFAULT_URI)
    user = os.getenv("NEO4J_USER", DEFAULT_USER)
    password = os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD)
    database = os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE)

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        with driver.session(database=database) as session:
            paths = session.run(
                """
                MATCH p = (:Person {person_id: $person_id})-[r]-()
                RETURN count(p) AS paths
                """,
                person_id=args.person_id,
            ).single()["paths"]

            top_edges = session.run(
                """
                MATCH (:Person {person_id: $person_id})-[r:NETWORK_EDGE]->(target)
                RETURN r.relation_type AS relation_type,
                       labels(target)[0] AS target_label,
                       coalesce(target.person_id, target.org_id, target.case_id) AS target_id,
                       r.weight AS weight,
                       r.confidence_score AS confidence_score
                ORDER BY r.weight DESC, r.confidence_score DESC
                LIMIT 10
                """,
                person_id=args.person_id,
            ).data()

            # 사건은 CASE_* 관계로 표현됨 (Case 노드 폐지)
            cases = session.run(
                """
                MATCH (:Person {person_id: $person_id})-[r:CASE_FROM|CASE_VIA|CASE_TO|CASE_LINK]-()
                WITH r.case_id AS case_id, collect(r)[0] AS r
                RETURN case_id,
                       r.case_type AS case_type,
                       r.contraband_category AS contraband_category,
                       r.role_in_case AS role_in_case,
                       r.confidence_score AS confidence_score
                ORDER BY r.confidence_score DESC
                LIMIT 10
                """,
                person_id=args.person_id,
            ).data()

            # 위험지표는 Person 노드 속성으로 흡수됨 (RiskIndicator 노드 폐지)
            indicators = session.run(
                """
                MATCH (p:Person {person_id: $person_id})
                RETURN p.top_indicators AS top_indicators,
                       p.indicator_count AS indicator_count
                """,
                person_id=args.person_id,
            ).data()

            # 분석은 ANALYZED_BY 엣지로 표현됨 (AnalysisResult 노드 폐지)
            analyses = session.run(
                """
                MATCH (:Person {person_id: $person_id})-[r:ANALYZED_BY]->(a:Agent)
                RETURN r.analysis_type AS analysis_type,
                       a.name AS agent,
                       r.risk_score_after AS risk_score_after,
                       r.output_summary AS output_summary
                ORDER BY r.created_at DESC
                LIMIT 10
                """,
                person_id=args.person_id,
            ).data()

        print(f"person_id: {args.person_id}")
        print(f"connected_paths: {paths}")
        print(f"top_network_edges: {top_edges}")
        print(f"involved_cases: {cases}")
        print(f"risk_indicators: {indicators}")
        print(f"analyses: {analyses}")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
