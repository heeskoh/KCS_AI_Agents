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
    if label in ("Case", "SmugglingCase"):
        # 사건 노드는 사건번호 대신 유형이 보이도록 (예: "분산형 · 마약류")
        type_parts = [props.get("case_type"), props.get("contraband_category")]
        type_name = " · ".join(str(p) for p in type_parts if p)
        if type_name:
            name = type_name
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

    # 2026 관계망 재구성: 적출국(수입/출국)은 (:Company)-[:TRADES_WITH_COUNTRY]->(:Country)
    suppliers = _read(
        """
        MATCH (c:Company {company_id: $company_id})-[r:TRADES_WITH_COUNTRY]->(country:Country)
        RETURN country.code AS country,
               country.name AS country_name,
               sum(r.count) AS declaration_count,
               count(*) AS item_kinds
        ORDER BY declaration_count DESC
        LIMIT 8
        """,
        company_id=company_id,
    )
    # 수입 품목은 (:Company)-[:DECLARES_ITEM]->(:Item) 관계 (해외거래처별 분리, count=건수)
    declarations = _read(
        """
        MATCH (c:Company {company_id: $company_id})-[r:DECLARES_ITEM]->(it:Item)
        RETURN r.declaration_no AS declaration_no,
               it.code AS hs_code,
               it.name AS item_name,
               r.overseas_supplier AS supplier,
               r.departure_country AS origin,
               r.import_date AS import_date,
               r.spec AS spec,
               r.count AS count
        ORDER BY r.count DESC, it.code
        LIMIT 10
        """,
        company_id=company_id,
    )
    related = _read(
        """
        MATCH (c:Company {company_id: $company_id})-[r:SUPPLIED_BY|AFFILIATED_WITH|RELATED_PARTY]->(n)
        RETURN type(r) AS relation,
               labels(n)[0] AS label,
               coalesce(n.name, n.code) AS value,
               r.relation_type AS relation_type
        ORDER BY relation, value
        LIMIT 30
        """,
        company_id=company_id,
    )
    # 위험점수는 RiskScore 노드 폐지 → Company 노드 속성으로 흡수됨
    risk = company

    supplier_lines = [
        f"- {row.get('country_name') or row['country']}: 신고 {row['declaration_count']}건 / 품목 {row['item_kinds']}종"
        for row in suppliers
    ] or ["- 수입/출국(적출국) 관계 없음"]
    declaration_lines = [
        f"- {row.get('declaration_no')} | HS {row.get('hs_code')} | {row.get('item_name')} | "
        f"{row.get('origin')} | {row.get('supplier') or '-'} | {row.get('count')}건"
        for row in declarations
    ] or ["- 품목 신고 관계 없음"]
    related_lines = [
        f"- {row['relation']} -> {row['label']}:{row['value']}"
        + (f" ({row['relation_type']})" if row.get('relation_type') else "")
        for row in related
    ] or ["- 주변 관계 없음"]

    risk_detail = (
        f"저가신고 {risk.get('undervaluation_suspicion_rate', '-')}, "
        f"특수관계 {risk.get('related_party_anomaly_rate', '-')}, "
        f"FTA {risk.get('fta_origin_misuse_suspicion_rate', '-')}, "
        f"환급 {risk.get('customs_refund_anomaly_rate', '-')}, "
        f"HS오류 {risk.get('hs_classification_error_rate', '-')}, "
        f"역외자금 {risk.get('offshore_fund_concealment_suspicion_rate', '-')}"
    ) if risk and risk.get('undervaluation_suspicion_rate') is not None else "위험지표 미산정"

    lines = [
        "[Neo4j 관계망 분석 결과]",
        f"대상 기업: {company.get('company_name') or company_id} ({company_id})",
        f"그래프 연결 수: {connected_count}",
        f"위험등급/점수: {_risk_text(company.get('risk_score'), company.get('risk_level'))}",
        f"업종: {company.get('industry_code') or '-'} / 지역: {company.get('region') or '-'}",
        f"주요 위험: {company.get('top_risk_name') or '-'} ({company.get('top_risk_score') if company.get('top_risk_score') is not None else '-'})",
        "",
        "■ 주요 수입/출국(적출국)",
        *supplier_lines,
        "",
        "■ 주요 수입품목(건수순)",
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
    # 사건 = Case 노드 허브. (인물)-[:INVOLVED_IN {역할·분석결과}]->(:Case).
    cases = _read(
        """
        MATCH (:Person {person_id: $person_id})-[r:INVOLVED_IN]->(c:Case)
        RETURN c.case_id AS case_id,
               c.case_type AS case_type,
               c.contraband_category AS contraband_category,
               c.contraband_sub_category AS contraband_sub_category,
               c.case_status AS case_status,
               r.role_in_case AS role_in_case,
               r.confidence_score AS confidence_score,
               r.analysis_summary AS analysis_summary
        ORDER BY r.confidence_score DESC
        LIMIT 12
        """,
        person_id=person_id,
    )

    # 사건을 통해 연결된 관계인(같은 Case에 연루된 다른 역할의 인물).
    co_actors = _read(
        """
        MATCH (:Person {person_id: $person_id})-[:INVOLVED_IN]->(c:Case)<-[r2:INVOLVED_IN]-(other:Person)
        WHERE other.person_id <> $person_id
        RETURN DISTINCT other.person_id AS person_id,
               other.name AS name,
               r2.role_in_case AS role,
               c.case_id AS case_id,
               c.case_type AS case_type
        ORDER BY case_id
        LIMIT 15
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
        + (f" | 분석: {row.get('analysis_summary')}" if row.get('analysis_summary') else "")
        for row in cases
    ] or ["- 관여 사건 없음"]
    # 사건을 통해 연결된 관계인(다자 사건의 다른 역할 인물)
    co_actor_lines = [
        f"- {row.get('name') or row['person_id']} ({row['person_id']}) | 역할 {row.get('role')} "
        f"| 사건 {row['case_id']}({row.get('case_type')})"
        for row in co_actors
    ] or ["- 사건 연루 관계인 없음"]
    # 위험지표는 노드 폐지 → Person 노드 속성으로 흡수됨
    indicator_lines = [f"- {person.get('top_indicators') or '위험지표 미산정'} (총 {person.get('indicator_count', 0)}건)"]

    lines = [
        "[Neo4j 우범자 관계망 분석 결과]",
        f"대상 우범자: {person.get('name') or person_id} ({person_id})",
        f"그래프 연결 수: {connected_count}",
        f"프로파일 유형: {person.get('profile_type') or '-'}",
        f"위험등급/점수: {_risk_text(person.get('risk_score'), person.get('risk_level'))}",
        f"위험태그: {person.get('risk_tags') or '-'}",
        f"감시상태: {person.get('watch_status') or '-'}",
        "",
        "■ 주요 네트워크 관계 (가족·동반여행자·공범 등)",
        *edge_lines,
        "",
        "■ 관여 사건 (역할·분석결과)",
        *case_lines,
        "",
        "■ 사건 연루 관계인",
        *co_actor_lines,
        "",
        "■ 위험지표",
        *indicator_lines,
    ]
    return "\n".join(lines)


def _clamp_hops(hops: int) -> int:
    try:
        return max(1, min(int(hops), 3))
    except (TypeError, ValueError):
        return 1


def build_company_network_graph(company_id: str, limit: int = 60, hops: int = 1) -> dict[str, Any] | None:
    """Return a node/edge graph centered on a company, or None if no company exists.

    hops: 1~3단계 이웃까지 확장(기본 1-hop ego 네트워크).
    """
    exists = _read(
        "MATCH (c:Company {company_id: $company_id}) RETURN c.company_id AS company_id LIMIT 1",
        company_id=company_id,
    )
    if not exists:
        return None

    h = _clamp_hops(hops)
    if h == 1:
        query = "MATCH (c:Company {company_id: $company_id})-[r]-(n) RETURN c, r, n LIMIT $limit"
    else:
        query = f"MATCH path = (c:Company {{company_id: $company_id}})-[*1..{h}]-(n) RETURN path LIMIT $limit"
    graph = _read_graph(query, company_id=company_id, limit=limit)
    graph["center"] = f"Company:{company_id}"
    return graph


def build_company_trade_routes(company_id: str, limit: int = 200) -> dict[str, Any] | None:
    """기업 중심 수입통관 체인 서브그래프(경로중심 view).

    기업→출발항→도착항→해외거래처(VIA_SUPPLIER는 수입만)의 체인을 반환한다.
    공유 항만을 통해 일부 타사 경로가 함께 조회될 수 있으나 중심은 해당 기업이다.
    기업이 없으면 None.
    """
    exists = _read(
        "MATCH (c:Company {company_id: $company_id}) RETURN c.company_id AS company_id LIMIT 1",
        company_id=company_id,
    )
    if not exists:
        return None
    graph = _read_graph(
        """
        MATCH (c:Company {company_id: $company_id})-[r1:DEPARTS_FROM]->(dp:DeparturePort)
        OPTIONAL MATCH (dp)-[r2:PORT_ROUTE {company_id: $company_id}]->(ap:ArrivalPort)
        OPTIONAL MATCH (ap)-[r3:VIA_SUPPLIER {company_id: $company_id}]->(s:OverseasSupplier)
        RETURN c, r1, dp, r2, ap, r3, s
        LIMIT $limit
        """,
        company_id=company_id,
        limit=limit,
    )
    graph["center"] = f"Company:{company_id}"
    graph["routeMode"] = True
    return graph


def build_company_profile_graph(company_id: str, limit: int = 600) -> dict[str, Any] | None:
    """기업 프로파일 원인분석용 canonical 통합 그래프(수입신고 허브 모델 전체).

    한 번의 조회로 기업의 모든 관계를 반환하고, 프런트가 4개 view(관계분석/원인분석/
    위험구성/경로분석)로 필터+레이아웃 프로젝션한다. 기업이 없으면 None.
    """
    exists = _read(
        "MATCH (c:Company {company_id: $company_id}) RETURN c.company_id AS company_id LIMIT 1",
        company_id=company_id,
    )
    if not exists:
        return None
    graph = _read_graph(
        """
        MATCH (c:Company {company_id: $company_id})
        OPTIONAL MATCH (c)-[rf:FILED]->(d:Declaration)
        OPTIONAL MATCH (d)-[ri:OF_ITEM]->(it:ItemClass)
        OPTIONAL MATCH (d)-[rfp:FROM_PORT]->(dp:DeparturePort)
        OPTIONAL MATCH (d)-[rtp:TO_PORT]->(ap:ArrivalPort)
        OPTIONAL MATCH (d)-[rs:SUPPLIED_BY]->(os:OverseasSupplier)
        OPTIONAL MATCH (d)-[rb:FILED_BY]->(b:Broker)
        OPTIONAL MATCH (d)-[rc:CONTRIBUTES_TO]->(cf:RiskFactor)
        OPTIONAL MATCH (c)-[rri:RISK_INDICATORS]->(rsc:RiskScore)
        OPTIONAL MATCH (rsc)-[rdb:DRIVEN_BY]->(df:RiskFactor)
        OPTIONAL MATCH (c)-[ran:ANALYZED]->(af:RiskFactor)
        OPTIONAL MATCH (c)-[rrp:RELATED_PARTY]->(rp:RelatedParty)
        OPTIONAL MATCH (c)-[raf:AFFILIATED_WITH]->(ac:AffiliatedCompany)
        OPTIONAL MATCH (c)-[rca:CASE]->(ct:CaseType)
        RETURN c, rf, d, ri, it, rfp, dp, rtp, ap, rs, os, rb, b, rc, cf,
               rri, rsc, rdb, df, ran, af, rrp, rp, raf, ac, rca, ct
        LIMIT $limit
        """,
        company_id=company_id,
        limit=limit,
    )
    graph["center"] = f"Company:{company_id}"
    graph["profileMode"] = True
    return graph


def build_person_network_graph(person_id: str, limit: int = 60, hops: int = 1) -> dict[str, Any] | None:
    """Return a node/edge graph centered on a risk person, or None if no person exists.

    hops: 1~3단계 이웃까지 확장(기본 1-hop ego 네트워크).
    """
    exists = _read(
        "MATCH (p:Person {person_id: $person_id}) RETURN p.person_id AS person_id LIMIT 1",
        person_id=person_id,
    )
    if not exists:
        return None

    h = _clamp_hops(hops)
    if h == 1:
        query = "MATCH (p:Person {person_id: $person_id})-[r]-(n) RETURN p, r, n LIMIT $limit"
    else:
        query = f"MATCH path = (p:Person {{person_id: $person_id}})-[*1..{h}]-(n) RETURN path LIMIT $limit"
    graph = _read_graph(query, person_id=person_id, limit=limit)
    graph["center"] = f"Person:{person_id}"
    return graph


def _split_node_ref(ref: str) -> tuple[str, str]:
    """프런트 노드 id('{label}:{value}')를 (label, value)로 분리."""
    text = str(ref or "")
    label, _, value = text.partition(":")
    return label, (value or label)


def build_path_graph(source_ref: str, target_ref: str, max_hops: int = 6) -> dict[str, Any]:
    """두 노드 사이 최단 경로를 그래프(nodes/edges)로 반환한다.

    source_ref/target_ref 는 프런트 노드 id 형식('{label}:{value}').
    경로가 없으면 {"nodes": [], "edges": [], "found": False} 를 반환한다.
    """
    src_label, src_value = _split_node_ref(source_ref)
    tgt_label, tgt_value = _split_node_ref(target_ref)
    # 라벨별 id 속성이 달라 _NODE_ID_KEYS 중 하나와 매칭되면 동일 노드로 본다.
    # 라벨별 id 속성이 다르고, 고유 id가 없는 노드는 elementId로 식별되므로 둘 다 매칭한다.
    id_expr_a = "[" + ", ".join(f"a.{k}" for k in _NODE_ID_KEYS) + "]"
    id_expr_b = "[" + ", ".join(f"b.{k}" for k in _NODE_ID_KEYS) + "]"
    query = (
        f"MATCH (a) WHERE $src_label IN labels(a) AND ($src_value IN {id_expr_a} OR elementId(a) = $src_value) "
        f"MATCH (b) WHERE $tgt_label IN labels(b) AND ($tgt_value IN {id_expr_b} OR elementId(b) = $tgt_value) "
        f"MATCH p = shortestPath((a)-[*..{int(max_hops)}]-(b)) "
        "RETURN p LIMIT 1"
    )
    graph = _read_graph(
        query,
        src_label=src_label, src_value=src_value,
        tgt_label=tgt_label, tgt_value=tgt_value,
    )
    graph["source"] = source_ref
    graph["target"] = target_ref
    graph["center"] = source_ref
    graph["found"] = bool(graph.get("nodes"))
    return graph
