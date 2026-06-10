"""Neo4j graph query helpers for network-analysis agents."""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from neo4j import GraphDatabase
from neo4j.graph import Node, Path, Relationship


DEFAULT_URI = "bolt://localhost:7687"
DEFAULT_USER = "neo4j"
DEFAULT_PASSWORD = "kcsneo4j1234"
DEFAULT_DATABASE = "neo4j"


class Neo4jGraphError(RuntimeError):
    """Raised when Neo4j graph lookup cannot be completed."""


def _settings() -> tuple[str, str, str, str]:
    load_dotenv()
    return (
        os.getenv("NEO4J_URI", DEFAULT_URI),
        os.getenv("NEO4J_USER", DEFAULT_USER),
        os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD),
        os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE),
    )


def get_driver():
    """Neo4j driver 싱글톤 반환 (NL→Cypher 에이전트에서 사용)."""
    uri, user, password, _ = _settings()
    return GraphDatabase.driver(uri, auth=(user, password))


def _read(query: str, **params: Any) -> list[dict[str, Any]]:
    uri, user, password, database = _settings()
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            return session.run(query, **params).data()
    except Exception as exc:
        raise Neo4jGraphError(str(exc)) from exc
    finally:
        driver.close()


_NODE_ID_KEYS = (
    "company_id", "person_id", "org_id", "case_id", "declaration_id",
    "declaration_no", "source_id", "indicator_code", "code",
)
_NODE_NAME_KEYS = (
    "name", "company_name", "org_name", "person_name", "case_no",
    "item_name", "indicator_name", "code",
)


def _node_to_json(node: Node) -> dict[str, Any]:
    labels = list(node.labels)
    label = labels[0] if labels else "Node"
    props = dict(node)
    node_id = next((props[key] for key in _NODE_ID_KEYS if props.get(key) is not None), None)
    if node_id is None:
        node_id = node.element_id
    name = next((props[key] for key in _NODE_NAME_KEYS if props.get(key) is not None), node_id)
    return {
        "id": f"{label}:{node_id}",
        "label": label,
        "name": str(name),
        "properties": props,
    }


def _rel_to_json(rel: Relationship, source_id: str, target_id: str) -> dict[str, Any]:
    return {
        "id": str(rel.element_id),
        "source": source_id,
        "target": target_id,
        "type": rel.type,
        "properties": dict(rel),
    }


def _collect_graph_entity(value: Any, nodes: dict[str, Any], edges: dict[str, Any]) -> None:
    if isinstance(value, Node):
        node = _node_to_json(value)
        nodes.setdefault(node["id"], node)
    elif isinstance(value, Relationship):
        start = _node_to_json(value.start_node)
        end = _node_to_json(value.end_node)
        nodes.setdefault(start["id"], start)
        nodes.setdefault(end["id"], end)
        edge = _rel_to_json(value, start["id"], end["id"])
        edges.setdefault(edge["id"], edge)
    elif isinstance(value, Path):
        for node in value.nodes:
            entry = _node_to_json(node)
            nodes.setdefault(entry["id"], entry)
        for rel in value.relationships:
            start = _node_to_json(rel.start_node)
            end = _node_to_json(rel.end_node)
            edge = _rel_to_json(rel, start["id"], end["id"])
            edges.setdefault(edge["id"], edge)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _collect_graph_entity(item, nodes, edges)


def _read_graph(query: str, **params: Any) -> dict[str, Any]:
    uri, user, password, database = _settings()
    driver = GraphDatabase.driver(uri, auth=(user, password))
    nodes: dict[str, Any] = {}
    edges: dict[str, Any] = {}
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            for record in session.run(query, **params):
                for value in record.values():
                    _collect_graph_entity(value, nodes, edges)
    except Exception as exc:
        raise Neo4jGraphError(str(exc)) from exc
    finally:
        driver.close()
    return {"nodes": list(nodes.values()), "edges": list(edges.values())}


def _fmt_number(value: Any) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):,.0f}"
    except (TypeError, ValueError):
        return str(value)


def _risk_text(score: Any, level: Any = None) -> str:
    parts = []
    if level:
        parts.append(str(level))
    if score is not None:
        try:
            parts.append(f"{float(score):.1f}")
        except (TypeError, ValueError):
            parts.append(str(score))
    return " / ".join(parts) if parts else "미확인"


def build_company_network_report(company_id: str) -> str | None:
    """Return a company-centered Neo4j network report, or None if no company exists."""

    company_rows = _read(
        """
        MATCH (c:Company {company_id: $company_id})
        OPTIONAL MATCH (c)--(n)
        RETURN c {.*} AS company, count(n) AS connected_count
        """,
        company_id=company_id,
    )
    if not company_rows or not company_rows[0].get("company"):
        return None

    company = company_rows[0]["company"]
    connected_count = company_rows[0]["connected_count"]

    suppliers = _read(
        """
        MATCH (country:Country)-[r:SUPPLIES_TO]->(c:Company {company_id: $company_id})
        RETURN country.code AS country,
               r.declaration_count AS declaration_count,
               r.total_declared_value AS total_declared_value,
               r.review_count AS review_count,
               r.inspect_count AS inspect_count,
               r.hold_count AS hold_count
        ORDER BY total_declared_value DESC
        LIMIT 8
        """,
        company_id=company_id,
    )
    declarations = _read(
        """
        MATCH (c:Company {company_id: $company_id})-[:FILED]->(d:Declaration)
        OPTIONAL MATCH (d)-[:ORIGINATED_FROM]->(country:Country)
        RETURN d.declaration_no AS declaration_no,
               d.hs_code AS hs_code,
               d.item_name AS item_name,
               d.status AS status,
               d.declared_value AS declared_value,
               d.import_date AS import_date,
               coalesce(country.code, d.origin_country) AS origin
        ORDER BY d.import_date DESC
        LIMIT 10
        """,
        company_id=company_id,
    )
    related = _read(
        """
        MATCH (c:Company {company_id: $company_id})-[r:USES_BROKER|HAS_RELATED_COMPANY|IN_INDUSTRY|EXPORTS_TO]->(n)
        RETURN type(r) AS relation,
               labels(n)[0] AS label,
               coalesce(n.name, n.code, n.org_name, n.company_name) AS value
        ORDER BY relation, value
        LIMIT 30
        """,
        company_id=company_id,
    )
    risk_rows = _read(
        """
        MATCH (:Company {company_id: $company_id})-[:HAS_RISK_SCORE]->(r:RiskScore)
        RETURN r {.*} AS risk
        ORDER BY r.generated_at DESC
        LIMIT 1
        """,
        company_id=company_id,
    )
    flagged = _read(
        """
        MATCH (c:Company {company_id: $company_id})-[:FILED]->(d:Declaration)
        WHERE d.status IN ['REVIEW', 'INSPECT', 'HOLD']
        RETURN d.status AS status, count(*) AS count
        ORDER BY count DESC
        """,
        company_id=company_id,
    )

    supplier_lines = [
        f"- {row['country']}: {row['declaration_count']}건 / {_fmt_number(row['total_declared_value'])}원"
        f" / REVIEW {row['review_count']} INSPECT {row['inspect_count']} HOLD {row['hold_count']}"
        for row in suppliers
    ] or ["- 공급국가 관계 없음"]
    declaration_lines = [
        f"- {row['declaration_no']} | {row.get('status')} | HS {row.get('hs_code')} | "
        f"{row.get('origin')} | {_fmt_number(row.get('declared_value'))}원 | {row.get('item_name')}"
        for row in declarations
    ] or ["- 신고 관계 없음"]
    related_lines = [
        f"- {row['relation']} -> {row['label']}:{row['value']}"
        for row in related
    ] or ["- 주변 관계 없음"]
    flagged_text = ", ".join(f"{row['status']} {row['count']}건" for row in flagged) or "없음"

    risk = risk_rows[0]["risk"] if risk_rows else {}
    risk_detail = (
        f"저가신고 {risk.get('undervaluation_suspicion_rate', '-')}, "
        f"특수관계 {risk.get('related_party_anomaly_rate', '-')}, "
        f"FTA {risk.get('fta_origin_misuse_suspicion_rate', '-')}, "
        f"환급 {risk.get('customs_refund_anomaly_rate', '-')}, "
        f"HS오류 {risk.get('hs_classification_error_rate', '-')}, "
        f"역외자금 {risk.get('offshore_fund_concealment_suspicion_rate', '-')}"
    ) if risk else "위험점수 노드 없음"

    lines = [
        "[Neo4j 관계망 분석 결과]",
        f"대상 기업: {company.get('company_name') or company_id} ({company_id})",
        f"그래프 연결 수: {connected_count}",
        f"위험등급/점수: {_risk_text(company.get('risk_score'), company.get('risk_level'))}",
        f"업종: {company.get('industry_code') or '-'}",
        f"검사/보류 신고: {flagged_text}",
        "",
        "■ 주요 공급국가",
        *supplier_lines,
        "",
        "■ 최근 수입신고",
        *declaration_lines,
        "",
        "■ 주변 관계",
        *related_lines,
        "",
        "■ 위험지표",
        f"- {risk_detail}",
    ]
    return "\n".join(lines)


def build_person_network_report(person_id: str) -> str | None:
    """Return a risk-person centered Neo4j network report, or None if no person exists."""

    person_rows = _read(
        """
        MATCH (p:Person {person_id: $person_id})
        OPTIONAL MATCH (p)-[r]-()
        RETURN p {.*} AS person, count(r) AS connected_count
        """,
        person_id=person_id,
    )
    if not person_rows or not person_rows[0].get("person"):
        return None

    person = person_rows[0]["person"]
    connected_count = person_rows[0]["connected_count"]

    edges = _read(
        """
        MATCH (:Person {person_id: $person_id})-[r:NETWORK_EDGE]->(target)
        RETURN r.relation_type AS relation_type,
               labels(target)[0] AS target_label,
               coalesce(target.person_id, target.org_id, target.case_id) AS target_id,
               coalesce(target.name, target.org_name, target.case_no) AS target_name,
               r.weight AS weight,
               r.confidence_score AS confidence_score
        ORDER BY r.weight DESC, r.confidence_score DESC
        LIMIT 12
        """,
        person_id=person_id,
    )
    cases = _read(
        """
        MATCH (:Person {person_id: $person_id})-[r:INVOLVED_IN]->(c:Case)
        RETURN c.case_id AS case_id,
               c.case_no AS case_no,
               c.case_type AS case_type,
               c.contraband_category AS contraband_category,
               c.contraband_sub_category AS contraband_sub_category,
               c.case_status AS case_status,
               r.role_in_case AS role_in_case,
               r.confidence_score AS confidence_score
        ORDER BY r.confidence_score DESC, c.detection_date DESC
        LIMIT 12
        """,
        person_id=person_id,
    )
    indicators = _read(
        """
        MATCH (:Person {person_id: $person_id})-[:HAS_RISK_INDICATOR]->(ri:RiskIndicator)
        RETURN ri.indicator_code AS indicator_code,
               ri.indicator_name AS indicator_name,
               ri.score AS score,
               ri.reason AS reason
        ORDER BY ri.score DESC
        LIMIT 10
        """,
        person_id=person_id,
    )
    analyses = _read(
        """
        MATCH (:Person {person_id: $person_id})-[:HAS_ANALYSIS_RESULT]->(ar:AnalysisResult)
        RETURN ar.analysis_type AS analysis_type,
               ar.model_or_agent AS model_or_agent,
               ar.risk_score_after AS risk_score_after,
               ar.output_summary AS output_summary
        ORDER BY ar.created_at DESC
        LIMIT 5
        """,
        person_id=person_id,
    )

    edge_lines = [
        f"- {row['relation_type']} -> {row['target_label']}:{row['target_id']} "
        f"({row.get('target_name') or '-'}) / weight {row.get('weight')} confidence {row.get('confidence_score')}"
        for row in edges
    ] or ["- 직접 네트워크 관계 없음"]
    case_lines = [
        f"- {row['case_id']} | {row.get('case_type')} | {row.get('contraband_category')}/"
        f"{row.get('contraband_sub_category')} | 역할 {row.get('role_in_case')} | confidence {row.get('confidence_score')}"
        for row in cases
    ] or ["- 관여 사건 없음"]
    indicator_lines = [
        f"- {row['indicator_code']} / {row.get('indicator_name')} / score {row.get('score')}"
        for row in indicators
    ] or ["- 위험지표 없음"]
    analysis_lines = [
        f"- {row.get('analysis_type')} ({row.get('model_or_agent')}) / after {row.get('risk_score_after')}: "
        f"{row.get('output_summary')}"
        for row in analyses
    ] or ["- 분석 이력 없음"]

    lines = [
        "[Neo4j 우범자 관계망 분석 결과]",
        f"대상 우범자: {person.get('name') or person_id} ({person_id})",
        f"그래프 연결 수: {connected_count}",
        f"프로파일 유형: {person.get('profile_type') or '-'}",
        f"위험등급/점수: {_risk_text(person.get('risk_score'), person.get('risk_level'))}",
        f"위험태그: {person.get('risk_tags') or '-'}",
        f"감시상태: {person.get('watch_status') or '-'}",
        "",
        "■ 주요 네트워크 관계",
        *edge_lines,
        "",
        "■ 관여 사건",
        *case_lines,
        "",
        "■ 위험지표",
        *indicator_lines,
        "",
        "■ 분석 이력",
        *analysis_lines,
    ]
    return "\n".join(lines)


def build_company_network_graph(company_id: str, limit: int = 60) -> dict[str, Any] | None:
    """Return a node/edge graph centered on a company, or None if no company exists."""

    exists = _read(
        "MATCH (c:Company {company_id: $company_id}) RETURN c.company_id AS company_id LIMIT 1",
        company_id=company_id,
    )
    if not exists:
        return None

    graph = _read_graph(
        """
        MATCH path = (c:Company {company_id: $company_id})-[*1..2]-(n)
        RETURN path
        LIMIT $limit
        """,
        company_id=company_id,
        limit=limit,
    )
    graph["center"] = f"Company:{company_id}"
    return graph


def build_person_network_graph(person_id: str, limit: int = 60) -> dict[str, Any] | None:
    """Return a node/edge graph centered on a risk person, or None if no person exists."""

    exists = _read(
        "MATCH (p:Person {person_id: $person_id}) RETURN p.person_id AS person_id LIMIT 1",
        person_id=person_id,
    )
    if not exists:
        return None

    graph = _read_graph(
        """
        MATCH path = (p:Person {person_id: $person_id})-[*1..2]-(n)
        RETURN path
        LIMIT $limit
        """,
        person_id=person_id,
        limit=limit,
    )
    graph["center"] = f"Person:{person_id}"
    return graph
