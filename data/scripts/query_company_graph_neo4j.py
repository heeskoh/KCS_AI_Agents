"""Query a company-centered Neo4j graph sample.

Usage:
    python data/scripts/query_company_graph_neo4j.py C-1002
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
    parser = argparse.ArgumentParser(description="Query a Neo4j company graph sample")
    parser.add_argument("company_id", nargs="?", default="C-1002")
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
                MATCH p = (c:Company)--()
                WHERE c.company_id = $company_id
                RETURN count(p) AS paths
                """,
                company_id=args.company_id,
            ).single()["paths"]

            declarations = session.run(
                """
                MATCH (c:Company)-[:FILED]->(d:Declaration)-[:ORIGINATED_FROM]->(country:Country)
                WHERE c.company_id = $company_id
                RETURN d.declaration_no AS declaration_no,
                       d.status AS status,
                       country.code AS origin
                ORDER BY d.import_date DESC
                LIMIT 5
                """,
                company_id=args.company_id,
            ).data()

            suppliers = session.run(
                """
                MATCH (country:Country)-[r:SUPPLIES_TO]->(c:Company)
                WHERE c.company_id = $company_id
                RETURN country.code AS country,
                       r.declaration_count AS declaration_count,
                       r.total_declared_value AS total_declared_value
                ORDER BY total_declared_value DESC
                LIMIT 5
                """,
                company_id=args.company_id,
            ).data()

        print(f"company_id: {args.company_id}")
        print(f"connected_paths: {paths}")
        print(f"recent_declarations: {declarations}")
        print(f"top_supplier_countries: {suppliers}")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
