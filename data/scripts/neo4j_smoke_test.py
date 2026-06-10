"""Test the local Neo4j Bolt connection.

Usage:
    python data/scripts/neo4j_smoke_test.py
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from neo4j import GraphDatabase


DEFAULT_URI = "bolt://localhost:7687"
DEFAULT_USER = "neo4j"
DEFAULT_PASSWORD = "kcsneo4j1234"
DEFAULT_DATABASE = "neo4j"


def main() -> None:
    load_dotenv()

    uri = os.getenv("NEO4J_URI", DEFAULT_URI)
    user = os.getenv("NEO4J_USER", DEFAULT_USER)
    password = os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD)
    database = os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE)

    print(f"Neo4j URI: {uri}")
    print(f"Neo4j database: {database}")

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            record = session.run(
                """
                RETURN
                  'KCS Neo4j ready' AS message,
                  datetime() AS checked_at
                """
            ).single()
        print(f"Connection OK: {record['message']} | {record['checked_at']}")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
