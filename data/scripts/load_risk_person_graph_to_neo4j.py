"""Load DuckDB risk-person investigation data into Neo4j (2026 관계망 재구성).

대상 1명(우범자)을 중심으로 연계된 결과를 분석하고, **관련된 사건을 통해
연루 관계인들이 함께 드러나도록** Case(사건) 노드를 중심 허브로 둔다.

모델 (노드 / 엣지):
  노드
    - Person        우범자/인물 (위험등급·점수·태그·위험지표 요약 속성)
    - Case          사건 (유형·품목·상태·적발일·수법·금액 등). 다자 사건 허브.
    - Country       관련국가 (원산지/경유)
    - Region        도착지·거주지
    - Organization  연계 조직
  엣지
    - (Person)-[:INVOLVED_IN {role_in_case, is_cargo_owner, confidence_score,
          evidence_level, evidence_summary, + 분석결과(analysis_type/analysis_summary/
          risk_score_after/analysis_review_status)}]->(Case)
          → 한 사건에 여러 인물이 서로 다른 역할로 연결(관계인 표시). 분석결과 흡수.
    - (Case)-[:CASE_FROM]->(Country)   원산지
    - (Case)-[:CASE_VIA]->(Country)    경유지
    - (Case)-[:CASE_TO]->(Region)      도착지
    - (Person)-[:NETWORK_EDGE {relation_type(공범/가족관계/동반여행자/송금관계 등),
          weight, confidence_score}]->(Person|Organization)
    - (Person)-[:RESIDES_IN]->(Region) / (Organization)-[:LOCATED_IN]->(Region)

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


# ── 인덱스 사전 가공 ─────────────────────────────────────────────────────

def build_indices(data: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    evidence_by_id = {e["source_id"]: e for e in data["evidence"]}

    # 위험지표 → 인물별 요약 (Person 노드 속성으로 흡수)
    ind_by_person: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ri in data["risk_indicators"]:
        if ri.get("entity_type") == "person" and ri.get("entity_id"):
            ind_by_person[ri["entity_id"]].append(ri)

    # 분석결과 → (인물, 사건) 키로 매핑 (INVOLVED_IN 엣지 속성으로 흡수)
    analysis_by_pc: dict[tuple, dict[str, Any]] = {}
    for ar in data["analysis_results"]:
        if ar.get("entity_type") != "person" or not ar.get("entity_id"):
            continue
        key = (ar["entity_id"], ar.get("linked_case_id"))
        prev = analysis_by_pc.get(key)
        # 같은 (인물,사건)에 여러 건이면 최신(created_at) 우선
        if prev is None or str(ar.get("created_at") or "") >= str(prev.get("created_at") or ""):
            analysis_by_pc[key] = ar

    return {
        "evidence_by_id": evidence_by_id,
        "ind_by_person": ind_by_person,
        "analysis_by_pc": analysis_by_pc,
    }


def person_rollup(person_id: str, idx: dict[str, Any]) -> dict[str, Any]:
    indicators = sorted(idx["ind_by_person"].get(person_id, []),
                        key=lambda r: (r.get("score") or 0), reverse=True)
    top = indicators[:3]
    top_text = ", ".join(
        f"{r.get('indicator_name') or r.get('indicator_code')}({r.get('score')})" for r in top
    )
    return {
        "indicator_count": len(indicators),
        "top_indicators": top_text or None,
    }


# ── 스키마 ─────────────────────────────────────────────────────────────

def create_constraints(tx: ManagedTransaction) -> None:
    statements = [
        "CREATE CONSTRAINT person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.person_id IS UNIQUE",
        "CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (n:Organization) REQUIRE n.org_id IS UNIQUE",
        "CREATE CONSTRAINT country_code IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT region_name IF NOT EXISTS FOR (n:Region) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT case_id IF NOT EXISTS FOR (n:Case) REQUIRE n.case_id IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def clear_graph(tx: ManagedTransaction) -> None:
    # 신규 + 레거시 엣지 모두 범위 한정 삭제 (업체 그래프와 공존).
    edge_types = [
        "INVOLVED_IN", "CASE_FROM", "CASE_VIA", "CASE_TO", "NETWORK_EDGE",
        "RESIDES_IN", "LOCATED_IN",
        "CASE_LINK", "ANALYZED_BY",  # 레거시
    ]
    for et in edge_types:
        tx.run(f"MATCH (s)-[r:{et}]->() WHERE s:Person OR s:Organization OR s:Case DELETE r")
    # 본 로더 전용 노드만 삭제. Country는 업체 그래프와 공유하므로 제외.
    tx.run(
        """
        MATCH (n)
        WHERE n.updated_from = $source_tag
          AND (n:Person OR n:Organization OR n:Region OR n:Case OR n:Agent)
        DETACH DELETE n
        """,
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


def merge_case(tx: ManagedTransaction, case: dict[str, Any]) -> None:
    """사건 노드 + 사건→장소(원산지/경유 Country, 도착 Region) 관계."""
    name = " · ".join(p for p in [case.get("case_type"), case.get("contraband_category")] if p) \
        or case.get("case_no") or case.get("case_id")
    tx.run(
        """
        MERGE (c:Case {case_id: $case_id})
        SET c.case_no = $case_no,
            c.name = $name,
            c.case_type = $case_type,
            c.contraband_category = $contraband_category,
            c.contraband_sub_category = $contraband_sub_category,
            c.case_status = $case_status,
            c.detection_date = $detection_date,
            c.detection_channel = $detection_channel,
            c.modus_operandi = $modus_operandi,
            c.concealment_method = $concealment_method,
            c.quantity = $quantity,
            c.quantity_unit = $quantity_unit,
            c.estimated_value = $estimated_value,
            c.lead_agency = $lead_agency,
            c.summary = $summary,
            c.updated_from = $source_tag
        """,
        {**case, "name": name, "source_tag": SOURCE_TAG},
    )
    if case.get("origin_country"):
        code = country_code(case["origin_country"])
        tx.run(
            """
            MATCH (c:Case {case_id: $case_id})
            MERGE (n:Country {code: $code})
            SET n.name = $cname, n.updated_from = $source_tag
            MERGE (c)-[r:CASE_FROM]->(n)
            SET r.updated_from = $source_tag
            """,
            {"case_id": case["case_id"], "code": code,
             "cname": country_name(code, default=case["origin_country"]), "source_tag": SOURCE_TAG},
        )
    if case.get("transit_country") and case.get("transit_country") != "없음":
        code = country_code(case["transit_country"])
        tx.run(
            """
            MATCH (c:Case {case_id: $case_id})
            MERGE (n:Country {code: $code})
            SET n.name = $cname, n.updated_from = $source_tag
            MERGE (c)-[r:CASE_VIA]->(n)
            SET r.updated_from = $source_tag
            """,
            {"case_id": case["case_id"], "code": code,
             "cname": country_name(code, default=case["transit_country"]), "source_tag": SOURCE_TAG},
        )
    if case.get("destination_region"):
        tx.run(
            """
            MATCH (c:Case {case_id: $case_id})
            MERGE (r2:Region {name: $region})
            SET r2.updated_from = $source_tag
            MERGE (c)-[r:CASE_TO]->(r2)
            SET r.updated_from = $source_tag
            """,
            {"case_id": case["case_id"], "region": case["destination_region"], "source_tag": SOURCE_TAG},
        )


def merge_involved(tx: ManagedTransaction, link: dict[str, Any], idx: dict[str, Any]) -> None:
    """(Person)-[:INVOLVED_IN {역할 + 증거 + 분석결과}]->(Case). 다자 사건 = 같은 Case에 여러 인물."""
    if not link.get("person_id") or not link.get("case_id"):
        return
    evidence = idx["evidence_by_id"].get(link.get("source_id")) or {}
    analysis = idx["analysis_by_pc"].get((link["person_id"], link["case_id"])) or {}
    params = {
        "person_id": link["person_id"],
        "case_id": link["case_id"],
        "link_id": link.get("link_id"),
        "role_in_case": link.get("role_in_case"),
        "is_cargo_owner": link.get("is_cargo_owner"),
        "confidence_score": link.get("confidence_score"),
        "evidence_level": link.get("evidence_level"),
        "evidence_summary": evidence.get("source_title") or evidence.get("summary"),
        "evidence_agency": evidence.get("source_agency"),
        "analysis_type": analysis.get("analysis_type"),
        "analysis_summary": analysis.get("output_summary"),
        "risk_score_after": analysis.get("risk_score_after"),
        "analysis_review_status": analysis.get("review_status"),
        "source_tag": SOURCE_TAG,
    }
    tx.run(
        """
        MATCH (p:Person {person_id: $person_id})
        MATCH (c:Case {case_id: $case_id})
        MERGE (p)-[r:INVOLVED_IN {link_id: $link_id}]->(c)
        SET r.role_in_case = $role_in_case,
            r.is_cargo_owner = $is_cargo_owner,
            r.confidence_score = $confidence_score,
            r.evidence_level = $evidence_level,
            r.evidence_summary = $evidence_summary,
            r.evidence_agency = $evidence_agency,
            r.analysis_type = $analysis_type,
            r.analysis_summary = $analysis_summary,
            r.risk_score_after = $risk_score_after,
            r.analysis_review_status = $analysis_review_status,
            r.updated_from = $source_tag
        """,
        params,
    )


def merge_network_edge(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    """person → person/org 직접 관계만 NETWORK_EDGE 로 표현.
    person → case 는 INVOLVED_IN(person_case_link)으로 이미 표현되므로 건너뛴다."""
    if str(row.get("source_type")) != "person":
        return
    target_type = str(row.get("target_type"))
    if target_type not in ENTITY_TARGETS:
        return
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
            for row in data["cases"]:
                session.execute_write(merge_case, row)
            for row in data["person_case_links"]:
                session.execute_write(merge_involved, row, idx)
            for row in data["network_edges"]:
                session.execute_write(merge_network_edge, row)

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
        "cases_loaded": len(data["cases"]),
        "involved_in_loaded": len(data["person_case_links"]),
        "network_edges_loaded": len(data["network_edges"]),
        "analysis_folded": len(idx["analysis_by_pc"]),
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    # Windows 콘솔(cp949)에서 한글 출력 시 UnicodeEncodeError 방지.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Load DuckDB risk-person graph into Neo4j (Case 허브 재구성)")
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
