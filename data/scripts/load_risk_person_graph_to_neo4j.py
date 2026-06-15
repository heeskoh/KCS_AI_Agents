"""Load DuckDB risk-person investigation data into Neo4j (entity-centric model).

Modeling principle (2026 재모델링):
  - 노드 = 엔티티/분류: Person, Organization, Region, Country
  - 사건(Case)·증거(Evidence)·분석결과(AnalysisResult)·위험지표(RiskIndicator)는
    노드가 아니라 **관계(엣지) 또는 노드 속성**으로 표현한다.
      · 사건  → 대표주체(사건 소유 인물=hub) 중심의 별(star) 관계
                 · (참여자)-[:CASE_LINK {사건속성}]->(hub)         (network_edge person→case)
                 · (hub)-[:CASE_FROM/CASE_VIA {사건속성}]->(:Country)
                 · (hub)-[:CASE_TO {사건속성}]->(:Region)
      · 증거  → 사건 엣지의 evidence_summary/evidence_level 속성으로 흡수
      · 위험지표 → Person.top_indicators / indicator_count 속성으로 흡수
      · 분석결과 → Person.latest_analysis_* / analysis_count 속성으로 흡수

DuckDB remains the source of truth. Neo4j is a derived graph store.

Usage:
    python data/scripts/load_risk_person_graph_to_neo4j.py --clear
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from collections import defaultdict
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
SOURCE_TAG = "duckdb.risk_person.sample"

# network_edge.target_type → (Neo4j label, key) for entity targets (person/org).
ENTITY_TARGETS = {
    "person": ("Person", "person_id"),
    "org": ("Organization", "org_id"),
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


# ── 사건/증거/지표/분석 → 속성·엣지 사전 가공 ─────────────────────────────

def build_indices(data: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    cases_by_id = {c["case_id"]: c for c in data["cases"]}
    evidence_by_id = {e["source_id"]: e for e in data["evidence"]}

    # 사건 대표주체(hub) = person_case_link 의 인물 (사건당 1명).
    # 동일 사건에 복수 링크가 있으면 evidence_level/confidence 우선.
    hub_by_case: dict[str, dict[str, Any]] = {}
    for link in data["person_case_links"]:
        cid = link.get("case_id")
        if not cid:
            continue
        prev = hub_by_case.get(cid)
        if prev is None or (link.get("confidence_score") or 0) > (prev.get("confidence_score") or 0):
            hub_by_case[cid] = link

    # 위험지표 → 인물별 요약
    ind_by_person: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ri in data["risk_indicators"]:
        if ri.get("entity_type") == "person" and ri.get("entity_id"):
            ind_by_person[ri["entity_id"]].append(ri)

    # 분석결과 → 인물별 최신 + 건수
    ana_by_person: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ar in data["analysis_results"]:
        if ar.get("entity_type") == "person" and ar.get("entity_id"):
            ana_by_person[ar["entity_id"]].append(ar)

    return {
        "cases_by_id": cases_by_id,
        "evidence_by_id": evidence_by_id,
        "hub_by_case": hub_by_case,
        "ind_by_person": ind_by_person,
        "ana_by_person": ana_by_person,
    }


def person_rollup(person_id: str, idx: dict[str, Any]) -> dict[str, Any]:
    indicators = sorted(idx["ind_by_person"].get(person_id, []),
                        key=lambda r: (r.get("score") or 0), reverse=True)
    top = indicators[:3]
    top_text = ", ".join(
        f"{r.get('indicator_name') or r.get('indicator_code')}({r.get('score')})" for r in top
    )
    analyses = sorted(idx["ana_by_person"].get(person_id, []),
                      key=lambda r: str(r.get("created_at") or ""), reverse=True)
    latest = analyses[0] if analyses else {}
    return {
        "indicator_count": len(indicators),
        "top_indicators": top_text or None,
        "analysis_count": len(analyses),
        "latest_analysis_type": latest.get("analysis_type"),
        "latest_analysis_agent": latest.get("model_or_agent"),
        "latest_risk_score_after": latest.get("risk_score_after"),
        "latest_analysis_summary": latest.get("output_summary"),
    }


def case_edge_props(case: dict[str, Any], link: dict[str, Any] | None,
                    evidence: dict[str, Any] | None) -> dict[str, Any]:
    """사건 1건의 핵심 속성 + 대표 링크의 역할/증거를 엣지 속성으로 평탄화."""
    link = link or {}
    evidence = evidence or {}
    return {
        "case_id": case.get("case_id"),
        "case_no": case.get("case_no"),
        "case_type": case.get("case_type"),
        "contraband_category": case.get("contraband_category"),
        "contraband_sub_category": case.get("contraband_sub_category"),
        "case_status": case.get("case_status"),
        "detection_date": case.get("detection_date"),
        "detection_channel": case.get("detection_channel"),
        "modus_operandi": case.get("modus_operandi"),
        "estimated_value": case.get("estimated_value"),
        "role_in_case": link.get("role_in_case"),
        "confidence_score": link.get("confidence_score"),
        "evidence_level": link.get("evidence_level"),
        "evidence_summary": evidence.get("source_title") or evidence.get("summary"),
        "evidence_agency": evidence.get("source_agency"),
    }


# ── 스키마 ─────────────────────────────────────────────────────────────

def create_constraints(tx: ManagedTransaction) -> None:
    statements = [
        "CREATE CONSTRAINT person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.person_id IS UNIQUE",
        "CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (n:Organization) REQUIRE n.org_id IS UNIQUE",
        "CREATE CONSTRAINT country_code IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT region_name IF NOT EXISTS FOR (n:Region) REQUIRE n.name IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def clear_graph(tx: ManagedTransaction) -> None:
    # 본 로더가 만드는 관계만 범위 한정 삭제 (업체 그래프와 공존 가능).
    delete_statements = [
        "MATCH (s)-[r:NETWORK_EDGE]->() WHERE s:Person OR s:Organization DELETE r",
        "MATCH (:Person)-[r:CASE_LINK]->() DELETE r",
        "MATCH (:Person)-[r:CASE_FROM|CASE_VIA|CASE_TO]->() DELETE r",
        "MATCH (:Person)-[r:RESIDES_IN]->() DELETE r",
        "MATCH (:Organization)-[r:LOCATED_IN]->() DELETE r",
    ]
    for statement in delete_statements:
        tx.run(statement)
    tx.run(
        "MATCH (n) WHERE n.updated_from = $source_tag DETACH DELETE n",
        {"source_tag": SOURCE_TAG},
    )


# ── 노드/엣지 머지 ──────────────────────────────────────────────────────

def merge_person(tx: ManagedTransaction, row: dict[str, Any], rollup: dict[str, Any]) -> None:
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
            p.address_region = $address_region,
            p.occupation = $occupation,
            p.risk_level = $risk_level,
            p.risk_score = $risk_score,
            p.risk_tags = $risk_tags,
            p.watch_status = $watch_status,
            p.indicator_count = $indicator_count,
            p.top_indicators = $top_indicators,
            p.analysis_count = $analysis_count,
            p.latest_analysis_type = $latest_analysis_type,
            p.latest_analysis_agent = $latest_analysis_agent,
            p.latest_risk_score_after = $latest_risk_score_after,
            p.latest_analysis_summary = $latest_analysis_summary,
            p.seed_batch_id = $seed_batch_id,
            p.updated_from = $source_tag
        """,
        {**row, **rollup, "source_tag": SOURCE_TAG},
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


def merge_case_location(tx: ManagedTransaction, hub_person_id: str, props: dict[str, Any],
                        case: dict[str, Any]) -> None:
    """대표주체(hub) → 사건 장소(원산지/경유 Country, 도착 Region) 관계."""
    if case.get("origin_country"):
        code = country_code(case["origin_country"])
        tx.run(
            """
            MATCH (p:Person {person_id: $hub})
            MERGE (c:Country {code: $code})
            SET c.name = $name, c.updated_from = $source_tag
            MERGE (p)-[r:CASE_FROM {case_id: $case_id}]->(c)
            SET r += $props, r.updated_from = $source_tag
            """,
            {"hub": hub_person_id, "code": code, "name": country_name(code, default=case["origin_country"]),
             "case_id": props["case_id"], "props": props, "source_tag": SOURCE_TAG},
        )
    if case.get("transit_country") and case.get("transit_country") != "없음":
        code = country_code(case["transit_country"])
        tx.run(
            """
            MATCH (p:Person {person_id: $hub})
            MERGE (c:Country {code: $code})
            SET c.name = $name, c.updated_from = $source_tag
            MERGE (p)-[r:CASE_VIA {case_id: $case_id}]->(c)
            SET r += $props, r.updated_from = $source_tag
            """,
            {"hub": hub_person_id, "code": code, "name": country_name(code, default=case["transit_country"]),
             "case_id": props["case_id"], "props": props, "source_tag": SOURCE_TAG},
        )
    if case.get("destination_region"):
        tx.run(
            """
            MATCH (p:Person {person_id: $hub})
            MERGE (r2:Region {name: $name})
            SET r2.updated_from = $source_tag
            MERGE (p)-[r:CASE_TO {case_id: $case_id}]->(r2)
            SET r += $props, r.updated_from = $source_tag
            """,
            {"hub": hub_person_id, "name": case["destination_region"], "case_id": props["case_id"],
             "props": props, "source_tag": SOURCE_TAG},
        )


def merge_network_edge(tx: ManagedTransaction, row: dict[str, Any], idx: dict[str, Any]) -> None:
    if str(row.get("source_type")) != "person":
        return
    target_type = str(row.get("target_type"))

    # 1) person → person/org : 엔티티 간 직접 관계 (NETWORK_EDGE 유지)
    if target_type in ENTITY_TARGETS:
        label, key = ENTITY_TARGETS[target_type]
        tx.run(
            f"""
            MATCH (s:Person {{person_id: $source_id}})
            MATCH (t:{label} {{{key}: $target_id}})
            MERGE (s)-[r:NETWORK_EDGE {{edge_id: $edge_id}}]->(t)
            SET r.relation_type = $relation_type,
                r.weight = $weight,
                r.confidence_score = $confidence_score,
                r.first_seen_at = $first_seen_at,
                r.last_seen_at = $last_seen_at,
                r.updated_from = $source_tag
            """,
            {**row, "source_tag": SOURCE_TAG},
        )
        return

    # 2) person → case : 사건을 통해 대표주체(hub)와 연결 (CASE_LINK 스포크→허브)
    if target_type == "case":
        case = idx["cases_by_id"].get(row.get("target_id"))
        hub_link = idx["hub_by_case"].get(row.get("target_id"))
        if not case or not hub_link:
            return
        hub_id = hub_link.get("person_id")
        if not hub_id or hub_id == row.get("source_id"):
            return  # 대표주체 본인은 사건 장소 엣지로 표현됨
        evidence = idx["evidence_by_id"].get(hub_link.get("source_id"))
        props = case_edge_props(case, hub_link, evidence)
        props.update({
            "relation_type": row.get("relation_type"),
            "weight": row.get("weight"),
            "confidence_score": row.get("confidence_score"),
        })
        tx.run(
            """
            MATCH (s:Person {person_id: $source_id})
            MATCH (h:Person {person_id: $hub})
            MERGE (s)-[r:CASE_LINK {edge_id: $edge_id}]->(h)
            SET r += $props, r.updated_from = $source_tag
            """,
            {"source_id": row.get("source_id"), "hub": hub_id, "edge_id": row.get("edge_id"),
             "props": props, "source_tag": SOURCE_TAG},
        )


def load_to_neo4j(data: dict[str, list[dict[str, Any]]], clear: bool = False) -> dict[str, Any]:
    load_dotenv()
    uri = os.getenv("NEO4J_URI", DEFAULT_URI)
    user = os.getenv("NEO4J_USER", DEFAULT_USER)
    password = os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD)
    database = os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE)

    idx = build_indices(data)

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            session.execute_write(create_constraints)
            if clear:
                session.execute_write(clear_graph)

            for row in data["persons"]:
                session.execute_write(merge_person, row, person_rollup(row["person_id"], idx))
            for row in data["orgs"]:
                session.execute_write(merge_org, row)

            # 사건 → 대표주체 중심 장소 관계 (사건당 1회)
            for case_id, hub_link in idx["hub_by_case"].items():
                case = idx["cases_by_id"].get(case_id)
                hub_id = hub_link.get("person_id")
                if not case or not hub_id:
                    continue
                evidence = idx["evidence_by_id"].get(hub_link.get("source_id"))
                props = case_edge_props(case, hub_link, evidence)
                session.execute_write(merge_case_location, hub_id, props, case)

            # network_edge → 엔티티 직접관계 + 사건 스포크
            for row in data["network_edges"]:
                session.execute_write(merge_network_edge, row, idx)

            node_counts = session.run(
                "MATCH (n) WITH labels(n)[0] AS label, count(*) AS count RETURN label, count ORDER BY label"
            ).data()
            relationship_counts = session.run(
                "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY type"
            ).data()
    finally:
        driver.close()

    return {
        "persons_loaded": len(data["persons"]),
        "orgs_loaded": len(data["orgs"]),
        "cases_indexed": len(idx["hub_by_case"]),
        "network_edges_loaded": len(data["network_edges"]),
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB risk-person graph into Neo4j (entity-centric)")
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
