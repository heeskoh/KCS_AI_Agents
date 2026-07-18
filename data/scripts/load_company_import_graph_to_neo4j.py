"""Load DuckDB company data into Neo4j — 수입신고 허브 canonical 모델 (2026 원인분석 재설계).

목적: 기업 위험도의 **원인 추적**. 수입신고(Declaration)를 허브 노드로 두어
한쪽으로는 위험지표(어떤 신고가 어떤 지표를 끌어올렸나), 다른 쪽으로는
품목·항·해외거래처·관세사(그 신고의 구성요소)로 연결한다.

적재 전략: **canonical 1회 적재(풍부하게)**. 화면의 4개 view(관계분석/원인분석/위험구성/
경로분석)는 이 한 그래프를 프런트에서 필터+레이아웃+인코딩으로 **프로젝션**한다.

  노드 (12종)
    - Company           기업
    - Declaration       수입신고(허브). 수입/수출 모두. 속성: declaration_no, trade_flow, date, value, status, hs_code, item_name
    - ItemClass         품목분류(8자리)
    - DeparturePort     출발항 (속성 country)
    - ArrivalPort       도착항 (속성 country)
    - OverseasSupplier  해외거래처(=송하인)
    - Broker            관세사
    - RiskScore         종합위험값(기업당 1)
    - RiskFactor        위험요인(연관 범죄, 지표 6종)
    - RelatedParty      특수관계인
    - AffiliatedCompany 관계사
    - CaseType          사건유형(검토/검사/보류)

  엣지
    - (Company)-[:FILED]->(Declaration)
    - (Declaration)-[:OF_ITEM {hsk_code}]->(ItemClass)        # 10자리는 엣지 속성
    - (Declaration)-[:FROM_PORT]->(DeparturePort)
    - (Declaration)-[:TO_PORT]->(ArrivalPort)
    - (Declaration)-[:SUPPLIED_BY]->(OverseasSupplier)        # 수입만
    - (Declaration)-[:FILED_BY]->(Broker)                     # 수입만
    - (Declaration)-[:CONTRIBUTES_TO {weight}]->(RiskFactor)  # 원인분석 핵심(related_refs.declarations)
    - (Company)-[:RISK_INDICATORS {6 rates}]->(RiskScore)
    - (RiskScore)-[:DRIVEN_BY {score, reason}]->(RiskFactor)
    - (Company)-[:ANALYZED]->(RiskFactor)                     # 분석결과(analysis_result)
    - (Company)-[:RELATED_PARTY]->(RelatedParty)
    - (Company)-[:AFFILIATED_WITH]->(AffiliatedCompany)
    - (Company)-[:CASE]->(CaseType)

Usage:
    python data/scripts/load_company_import_graph_to_neo4j.py --clear
"""

from __future__ import annotations

import argparse
import json
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
SOURCE_TAG = "duckdb.company_import.sample"
KR_COUNTRY = "대한민국"

RISK_RATE_FIELDS = (
    "undervaluation_suspicion_rate",
    "related_party_anomaly_rate",
    "fta_origin_misuse_suspicion_rate",
    "customs_refund_anomaly_rate",
    "hs_classification_error_rate",
    "offshore_fund_concealment_suspicion_rate",
)

STATUS_KO = {"REVIEW": "검토", "INSPECT": "검사", "HOLD": "보류"}
CASE_STATUSES = ("REVIEW", "INSPECT", "HOLD")


# ── 공통 유틸 ─────────────────────────────────────────────────────────────────

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


def region_of(address: str | None) -> str | None:
    if not address:
        return None
    return str(address).strip().split()[0] or None


def hs8(code: Any) -> str | None:
    if code is None:
        return None
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    return digits[:8] if len(digits) >= 8 else (digits or None)


def parse_port(label: str | None) -> tuple[str, str]:
    if label and label.endswith(")") and "(" in label:
        name, _, code = label.rpartition("(")
        return name.strip(), code[:-1].strip()
    return (label or ""), (label or "")


def norm_country(raw: str | None) -> str | None:
    if not raw:
        return None
    code = country_code(raw)
    return country_name(code, default=raw) if code else raw


# ── DuckDB 조회 ───────────────────────────────────────────────────────────────

def fetch_data() -> dict[str, Any]:
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        companies = as_dicts(conn, "SELECT * FROM company_profiles ORDER BY company_id")
        risk_scores = as_dicts(conn, "SELECT * FROM import_risk_scores ORDER BY id")
        try:
            risk_indicators = as_dicts(
                conn, "SELECT * FROM company_risk_indicator ORDER BY company_id, score DESC")
        except duckdb.CatalogException:
            risk_indicators = []
        try:
            related_parties = as_dicts(conn, "SELECT * FROM related_party ORDER BY company_id, id")
        except duckdb.CatalogException:
            related_parties = []
        try:
            analyses = as_dicts(
                conn,
                "SELECT entity_id AS company_id, analysis_type, model_or_agent, output_summary, "
                "       risk_score_before, risk_score_after, review_status, "
                "       CAST(created_at AS VARCHAR) AS created_at "
                "FROM analysis_result WHERE entity_type = 'company' ORDER BY created_at DESC",
            )
        except duckdb.CatalogException:
            analyses = []

        # 수입신고 헤더 (Declaration 노드 + FROM/TO/SUPPLIED/FILED 엣지)
        imports = as_dicts(
            conn,
            """
            SELECT declaration_no, company_id,
                   CAST(import_date AS VARCHAR) AS trade_date,
                   declared_value AS value, status, hs_code, item_name,
                   departure_port, arrival_port, overseas_supplier_name AS supplier,
                   filer_name, filer_representative,
                   -- 밀수 '반입채널·검사회피' 분석 축 (없으면 NULL → 노드 속성 생략)
                   transport_type, inspection_type,
                   COALESCE(NULLIF(departure_country, ''),
                            NULLIF(origin_country_name, ''), origin_country) AS dep_country
            FROM import_declarations
            WHERE company_id IS NOT NULL AND declaration_no IS NOT NULL
            """,
        )
        # 수출신고 (Declaration 노드 + 경로) — 매수인·관세사 없음
        try:
            exports = as_dicts(
                conn,
                """
                SELECT declaration_no, company_id,
                       CAST(export_date AS VARCHAR) AS trade_date,
                       export_value AS value, status, hs_code, item_name,
                       departure_port, arrival_port, dest_country
                FROM export_declaration
                WHERE company_id IS NOT NULL AND declaration_no IS NOT NULL
                """,
            )
        except duckdb.CatalogException:
            exports = []

        # 신고-품목 라인 (OF_ITEM 엣지: 신고별 distinct 8자리 품목분류 + 10자리 hsk)
        item_lines = as_dicts(
            conn,
            """
            SELECT d.declaration_no AS declaration_no,
                   COALESCE(i.hsk_code, d.hs_code) AS hsk_code,
                   COALESCE(i.trade_item_name_en, i.tariff_item_name_en, d.item_name) AS item_name
            FROM import_declarations d
            LEFT JOIN import_declaration_items i ON i.declaration_id = d.id
            WHERE d.declaration_no IS NOT NULL AND COALESCE(i.hsk_code, d.hs_code) IS NOT NULL
            """,
        )

    return {
        "companies": companies,
        "risk_scores": risk_scores,
        "risk_indicators": risk_indicators,
        "related_parties": related_parties,
        "analyses": analyses,
        "imports": imports,
        "exports": exports,
        "item_lines": item_lines,
    }


def build_risk_by_company(risk_scores: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in risk_scores:
        cid = row.get("company_id")
        if not cid:
            continue
        prev = latest.get(cid)
        if prev is None or str(row.get("generated_at") or "") >= str(prev.get("generated_at") or ""):
            latest[cid] = row
    return latest


def build_indicators_by_company(risk_indicators: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in risk_indicators:
        cid = row.get("company_id")
        if cid and row.get("indicator_code"):
            grouped[cid].append(row)
    return grouped


def parse_contrib_decls(related_refs: Any) -> list[str]:
    """related_refs JSON에서 기여 수입신고번호 목록 추출."""
    if not related_refs:
        return []
    try:
        data = json.loads(related_refs) if isinstance(related_refs, str) else related_refs
    except (ValueError, TypeError):
        return []
    decls = data.get("declarations") if isinstance(data, dict) else None
    return [d for d in (decls or []) if d]


# ── Neo4j 적재 ───────────────────────────────────────────────────────────────

def create_constraints(tx: ManagedTransaction) -> None:
    tx.run("DROP CONSTRAINT item_name IF EXISTS")
    statements = [
        "CREATE CONSTRAINT company_id IF NOT EXISTS FOR (n:Company) REQUIRE n.company_id IS UNIQUE",
        "CREATE CONSTRAINT declaration_no IF NOT EXISTS FOR (n:Declaration) REQUIRE n.declaration_no IS UNIQUE",
        "CREATE CONSTRAINT item_class_code IF NOT EXISTS FOR (n:ItemClass) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT departure_port_code IF NOT EXISTS FOR (n:DeparturePort) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT arrival_port_code IF NOT EXISTS FOR (n:ArrivalPort) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT supplier_name IF NOT EXISTS FOR (n:OverseasSupplier) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT broker_name IF NOT EXISTS FOR (n:Broker) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT affiliate_name IF NOT EXISTS FOR (n:AffiliatedCompany) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT related_party_key IF NOT EXISTS FOR (n:RelatedParty) REQUIRE n.key IS UNIQUE",
        "CREATE CONSTRAINT risk_score_company IF NOT EXISTS FOR (n:RiskScore) REQUIRE n.company_id IS UNIQUE",
        "CREATE CONSTRAINT risk_factor_code IF NOT EXISTS FOR (n:RiskFactor) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT case_type_code IF NOT EXISTS FOR (n:CaseType) REQUIRE n.code IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def clear_company_graph(tx: ManagedTransaction) -> None:
    edge_types = [
        "FILED", "OF_ITEM", "FROM_PORT", "TO_PORT", "SUPPLIED_BY", "FILED_BY",
        "CONTRIBUTES_TO", "RISK_INDICATORS", "DRIVEN_BY", "ANALYZED",
        "RELATED_PARTY", "AFFILIATED_WITH", "CASE",
        # 레거시
        "DEPARTS_FROM", "PORT_ROUTE", "VIA_SUPPLIER", "DECLARES_ITEM", "USES_BROKER",
        "TRADES_WITH_COUNTRY", "ARRIVES_AT", "IMPORTED", "SUPPLIES_TO",
        "HAS_RELATED_COMPANY", "EXPORTS_TO", "HAS_RISK_INDICATOR",
    ]
    for et in edge_types:
        tx.run(f"MATCH ()-[r:{et}]-() DELETE r")
    tx.run(
        """
        MATCH (n)
        WHERE n:Declaration OR n:ItemClass OR n:Item OR n:OverseasSupplier OR n:AffiliatedCompany
              OR n:RelatedParty OR n:CaseType OR n:Broker OR n:RiskScore OR n:RiskFactor
              OR n:DeparturePort OR n:ArrivalPort OR n:HsCode OR n:RelatedCompany OR n:RiskIndicator
        DETACH DELETE n
        """
    )
    tx.run(
        "MATCH (n:Company) WHERE n.updated_from = $source_tag DETACH DELETE n",
        {"source_tag": SOURCE_TAG},
    )


def merge_company(tx: ManagedTransaction, row: dict[str, Any], risk: dict[str, Any]) -> None:
    params = {**row, "source_tag": SOURCE_TAG}
    params["region"] = region_of(row.get("address"))
    params["risk_level"] = risk.get("risk_level")
    params["risk_score"] = risk.get("risk_score")
    tx.run(
        """
        MERGE (c:Company {company_id: $company_id})
        SET c.company_name = $company_name,
            c.business_registration_no = $business_registration_no,
            c.industry_code = $industry_code,
            c.address = $address, c.region = $region,
            c.risk_level = $risk_level, c.risk_score = $risk_score,
            c.updated_from = $source_tag
        """,
        params,
    )


def merge_declaration(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    """Declaration 노드 + (Company)-[:FILED]->(Declaration)."""
    name = f"{row['declaration_no']}"
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (d:Declaration {declaration_no: $declaration_no})
        SET d.name = $name, d.trade_flow = $trade_flow, d.trade_date = $trade_date,
            d.value = $value, d.status = $status, d.hs_code = $hs_code,
            d.item_name = $item_name, d.updated_from = $source_tag
        SET d.filed_by_company = $company_id
        SET d.transport_type = $transport_type, d.inspection_type = $inspection_type
        MERGE (c)-[r:FILED]->(d)
        SET r.trade_flow = $trade_flow, r.updated_from = $source_tag
        """,
        {**row, "name": name, "source_tag": SOURCE_TAG,
         "transport_type": row.get("transport_type"), "inspection_type": row.get("inspection_type")},
    )


def merge_decl_ports(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    """(Declaration)-[:FROM_PORT]->(DeparturePort), -[:TO_PORT]->(ArrivalPort)."""
    if row.get("departure_port"):
        dep_name, dep_code = parse_port(row["departure_port"])
        tx.run(
            """
            MATCH (d:Declaration {declaration_no: $declaration_no})
            MERGE (p:DeparturePort {code: $code})
            SET p.name = $name, p.country = coalesce($country, p.country), p.updated_from = $tag
            MERGE (d)-[r:FROM_PORT]->(p) SET r.updated_from = $tag
            """,
            {"declaration_no": row["declaration_no"], "code": dep_code, "name": dep_name,
             "country": row.get("dep_country_name"), "tag": SOURCE_TAG},
        )
    if row.get("arrival_port"):
        arr_name, arr_code = parse_port(row["arrival_port"])
        tx.run(
            """
            MATCH (d:Declaration {declaration_no: $declaration_no})
            MERGE (p:ArrivalPort {code: $code})
            SET p.name = $name, p.country = coalesce($country, p.country), p.updated_from = $tag
            MERGE (d)-[r:TO_PORT]->(p) SET r.updated_from = $tag
            """,
            {"declaration_no": row["declaration_no"], "code": arr_code, "name": arr_name,
             "country": row.get("arr_country_name"), "tag": SOURCE_TAG},
        )


def merge_decl_supplier(tx: ManagedTransaction, declaration_no: str, supplier: str,
                        country: str | None = None) -> None:
    tx.run(
        """
        MATCH (d:Declaration {declaration_no: $declaration_no})
        MERGE (s:OverseasSupplier {name: $supplier})
        SET s.country = coalesce($country, s.country), s.updated_from = $tag
        MERGE (d)-[r:SUPPLIED_BY]->(s) SET r.updated_from = $tag
        """,
        {"declaration_no": declaration_no, "supplier": supplier,
         "country": country, "tag": SOURCE_TAG},
    )


def merge_decl_broker(tx: ManagedTransaction, declaration_no: str,
                      firm: str, manager: str | None = None) -> None:
    # 관세사무소(firm)만 노드로 두고, 담당 관세사(manager)는 FILED_BY 엣지 속성으로 표현.
    tx.run(
        """
        MATCH (d:Declaration {declaration_no: $declaration_no})
        MERGE (b:Broker {name: $firm})
        SET b.updated_from = $tag
        MERGE (d)-[r:FILED_BY]->(b)
        SET r.manager = $manager, r.updated_from = $tag
        """,
        {"declaration_no": declaration_no, "firm": firm, "manager": manager, "tag": SOURCE_TAG},
    )


def split_broker(filer_name: str | None, rep: str | None) -> tuple[str, str | None]:
    """filer_name('관세사무소 담당자') → (관세사무소, 담당자). rep(filer_representative) 우선."""
    name = (filer_name or "").strip()
    person = (rep or "").strip() or None
    if person and name.endswith(person):
        firm = name[: -len(person)].strip()
        return (firm or name), person
    if " " in name:
        firm, _, tail = name.rpartition(" ")
        return firm.strip(), (person or tail.strip() or None)
    return name, person


def merge_of_item(tx: ManagedTransaction, declaration_no: str, code8: str,
                  hsk_code: str, item_name: str) -> None:
    """(Declaration)-[:OF_ITEM {hsk_code(10)}]->(ItemClass(8자리))."""
    tx.run(
        """
        MATCH (d:Declaration {declaration_no: $declaration_no})
        MERGE (it:ItemClass {code: $code8})
        SET it.name = coalesce($item_name, it.name), it.updated_from = $tag
        MERGE (d)-[r:OF_ITEM {hsk_code: coalesce($hsk_code, '')}]->(it)
        SET r.item_name = $item_name, r.updated_from = $tag
        """,
        {"declaration_no": declaration_no, "code8": code8, "hsk_code": hsk_code,
         "item_name": item_name, "tag": SOURCE_TAG},
    )


def merge_risk_factor_catalog(tx: ManagedTransaction, factors: list[dict[str, Any]]) -> None:
    for f in factors:
        tx.run(
            "MERGE (rf:RiskFactor {code: $code}) SET rf.name = $name, rf.updated_from = $tag",
            {"code": f["code"], "name": f["name"], "tag": SOURCE_TAG},
        )


def merge_risk_score(tx: ManagedTransaction, company_id: str, risk: dict[str, Any]) -> None:
    score = risk.get("risk_score")
    level = risk.get("risk_level")
    name = f"위험 {round(score)}" if isinstance(score, (int, float)) else "위험값"
    if level:
        name += f" · {level}"
    params = {"company_id": company_id, "name": name, "risk_score": score,
              "risk_level": level, "tag": SOURCE_TAG}
    for field in RISK_RATE_FIELDS:
        params[field] = risk.get(field)
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (rs:RiskScore {company_id: $company_id})
        SET rs.name = $name, rs.risk_score = $risk_score, rs.risk_level = $risk_level,
            rs.updated_from = $tag
        MERGE (c)-[r:RISK_INDICATORS]->(rs)
        SET r.undervaluation_suspicion_rate = $undervaluation_suspicion_rate,
            r.related_party_anomaly_rate = $related_party_anomaly_rate,
            r.fta_origin_misuse_suspicion_rate = $fta_origin_misuse_suspicion_rate,
            r.customs_refund_anomaly_rate = $customs_refund_anomaly_rate,
            r.hs_classification_error_rate = $hs_classification_error_rate,
            r.offshore_fund_concealment_suspicion_rate = $offshore_fund_concealment_suspicion_rate,
            r.updated_from = $tag
        """,
        params,
    )


def merge_driven_by(tx: ManagedTransaction, company_id: str, ind: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (rs:RiskScore {company_id: $company_id})
        MATCH (rf:RiskFactor {code: $code})
        MERGE (rs)-[r:DRIVEN_BY]->(rf)
        SET r.score = $score, r.reason = $reason, r.updated_from = $tag
        """,
        {"company_id": company_id, "code": ind.get("indicator_code"),
         "score": ind.get("score"), "reason": ind.get("reason"), "tag": SOURCE_TAG},
    )


def merge_contributes(tx: ManagedTransaction, declaration_no: str, code: str, weight: float) -> None:
    """원인분석 핵심: (Declaration)-[:CONTRIBUTES_TO {weight}]->(RiskFactor)."""
    tx.run(
        """
        MATCH (d:Declaration {declaration_no: $declaration_no})
        MATCH (rf:RiskFactor {code: $code})
        MERGE (d)-[r:CONTRIBUTES_TO]->(rf)
        SET r.weight = $weight, r.updated_from = $tag
        """,
        {"declaration_no": declaration_no, "code": code, "weight": weight, "tag": SOURCE_TAG},
    )


def merge_analysis(tx: ManagedTransaction, row: dict[str, Any], factor_code: str) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MATCH (rf:RiskFactor {code: $factor_code})
        MERGE (c)-[r:ANALYZED {created_at: $created_at}]->(rf)
        SET r.analysis_type = $analysis_type, r.model_or_agent = $model_or_agent,
            r.output_summary = $output_summary, r.risk_score_before = $risk_score_before,
            r.risk_score_after = $risk_score_after, r.review_status = $review_status,
            r.updated_from = $tag
        """,
        {**row, "factor_code": factor_code, "tag": SOURCE_TAG},
    )


def merge_related_party(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    if not row.get("company_id") or not row.get("party_name"):
        return
    params = {
        **row,
        "key": f"{row['company_id']}:{row['party_name']}",
        "country_name": norm_country(row.get("country")),
        "tag": SOURCE_TAG,
    }
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (p:RelatedParty {key: $key})
        SET p.name = $party_name, p.country = $country_name,
            p.is_offshore = $is_offshore, p.updated_from = $tag
        MERGE (c)-[r:RELATED_PARTY {relation_type: $relation_type}]->(p)
        SET r.shareholding_pct = $shareholding_pct, r.trade_share_pct = $trade_share_pct,
            r.is_offshore = $is_offshore, r.note = $note, r.updated_from = $tag
        """,
        params,
    )


def merge_affiliated(tx: ManagedTransaction, company_id: str, affiliate: str, count: int) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (a:AffiliatedCompany {name: $affiliate})
        SET a.updated_from = $tag
        MERGE (c)-[r:AFFILIATED_WITH]->(a) SET r.count = $count, r.updated_from = $tag
        """,
        {"company_id": company_id, "affiliate": affiliate, "count": count, "tag": SOURCE_TAG},
    )


def merge_case(tx: ManagedTransaction, company_id: str, status: str, count: int) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (ct:CaseType {code: $code})
        SET ct.name = $name, ct.updated_from = $tag
        MERGE (c)-[r:CASE {status: $code}]->(ct)
        SET r.count = $count, r.updated_from = $tag
        """,
        {"company_id": company_id, "code": status, "name": STATUS_KO.get(status, status),
         "count": count, "tag": SOURCE_TAG},
    )


def load_to_neo4j(data: dict[str, Any], clear: bool = False) -> dict[str, Any]:
    load_dotenv()
    uri = os.getenv("NEO4J_URI", DEFAULT_URI)
    user = os.getenv("NEO4J_USER", DEFAULT_USER)
    password = os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD)
    database = os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE)

    risk_by_company = build_risk_by_company(data["risk_scores"])
    indicators_by_company = build_indicators_by_company(data["risk_indicators"])

    # 위험요인 카탈로그 + 기업별 최상위 지표(분석결과 연결)
    factor_catalog: dict[str, str] = {}
    top_factor: dict[str, str] = {}
    for cid, inds in indicators_by_company.items():
        for ind in inds:
            factor_catalog.setdefault(ind["indicator_code"], ind.get("indicator_name") or ind["indicator_code"])
        if inds:
            top_factor[cid] = inds[0]["indicator_code"]
    factors = [{"code": c, "name": n} for c, n in factor_catalog.items()]

    # 관세사(기업 대행사 폴백)·관계사·신고건수
    broker_by_company = {c["company_id"]: c.get("customs_broker_firm")
                         for c in data["companies"] if c.get("customs_broker_firm")}
    affiliate_by_company = {c["company_id"]: c.get("related_companies")
                            for c in data["companies"] if c.get("related_companies")}

    # OF_ITEM 그레인: (declaration_no, hs8) → 대표 hsk10·품명
    of_item: dict[tuple, dict[str, Any]] = {}
    for ln in data["item_lines"]:
        dno, code8 = ln.get("declaration_no"), hs8(ln.get("hsk_code"))
        if not dno or not code8:
            continue
        of_item.setdefault((dno, code8), {"hsk_code": ln.get("hsk_code"), "item_name": ln.get("item_name")})

    # 사건건수(전체 status별) + 기업별 status 집합
    case_count: dict[str, int] = defaultdict(int)
    company_statuses: dict[str, set] = defaultdict(set)
    for r in data["imports"]:
        st = r.get("status")
        if st in CASE_STATUSES:
            case_count[st] += 1
            company_statuses[r["company_id"]].add(st)

    driver = GraphDatabase.driver(uri, auth=(user, password))
    decl_count = 0
    contrib_count = 0
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            session.execute_write(create_constraints)
            if clear:
                session.execute_write(clear_company_graph)

            session.execute_write(merge_risk_factor_catalog, factors)

            for row in data["companies"]:
                cid = row["company_id"]
                risk = risk_by_company.get(cid, {})
                session.execute_write(merge_company, row, risk)
                if risk:
                    session.execute_write(merge_risk_score, cid, risk)
                for ind in indicators_by_company.get(cid, []):
                    session.execute_write(merge_driven_by, cid, ind)
                aff = affiliate_by_company.get(cid)
                if aff:
                    session.execute_write(merge_affiliated, cid, aff, 0)
                for st in company_statuses.get(cid, ()):
                    session.execute_write(merge_case, cid, st, case_count.get(st, 0))

            # 수입신고 노드 + 구성요소 엣지
            for r in data["imports"]:
                r2 = dict(r)
                r2["dep_country_name"] = norm_country(r.get("dep_country"))
                r2["arr_country_name"] = KR_COUNTRY
                r2["trade_flow"] = "수입"
                session.execute_write(merge_declaration, r2)
                session.execute_write(merge_decl_ports, r2)
                if r.get("supplier"):
                    session.execute_write(merge_decl_supplier, r["declaration_no"],
                                          r["supplier"], r2["dep_country_name"])
                broker = r.get("filer_name") or broker_by_company.get(r["company_id"])
                if broker:
                    firm, manager = split_broker(r.get("filer_name") or broker,
                                                 r.get("filer_representative"))
                    session.execute_write(merge_decl_broker, r["declaration_no"], firm, manager)
                decl_count += 1

            # 수출신고 노드 + 경로(매수인·관세사 없음)
            for r in data["exports"]:
                r2 = dict(r)
                r2["dep_country_name"] = KR_COUNTRY
                r2["arr_country_name"] = norm_country(r.get("dest_country"))
                r2["trade_flow"] = "수출"
                r2["supplier"] = None
                r2["filer_name"] = None
                session.execute_write(merge_declaration, r2)
                session.execute_write(merge_decl_ports, r2)
                decl_count += 1

            # OF_ITEM (품목분류)
            for (dno, code8), info in of_item.items():
                session.execute_write(merge_of_item, dno, code8, info.get("hsk_code"), info.get("item_name"))

            # CONTRIBUTES_TO (원인분석: 신고→위험요인)
            for cid, inds in indicators_by_company.items():
                for ind in inds:
                    code = ind.get("indicator_code")
                    weight = ind.get("score") or 1
                    for dno in parse_contrib_decls(ind.get("related_refs")):
                        session.execute_write(merge_contributes, dno, code, weight)
                        contrib_count += 1

            # 분석결과
            for row in data["analyses"]:
                code = top_factor.get(row.get("company_id"))
                if code:
                    session.execute_write(merge_analysis, row, code)

            for row in data["related_parties"]:
                session.execute_write(merge_related_party, row)

            node_counts = session.run(
                "MATCH (n) WITH labels(n)[0] AS label, count(*) AS count RETURN label, count ORDER BY label"
            ).data()
            relationship_counts = session.run(
                "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY type"
            ).data()
    finally:
        driver.close()

    return {
        "companies_loaded": len(data["companies"]),
        "declarations_loaded": decl_count,
        "risk_factors": len(factors),
        "contributes_edges": contrib_count,
        "of_item_edges": len(of_item),
        "related_parties_loaded": len(data["related_parties"]),
        "analyses_loaded": len(data["analyses"]),
        "case_count_by_status": dict(case_count),
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB company graph into Neo4j (수입신고 허브 canonical 모델)")
    parser.add_argument("--clear", action="store_true", help="Clear previously loaded company graph before loading.")
    args = parser.parse_args()

    print(f"DuckDB: {DB_PATH}")
    data = fetch_data()
    result = load_to_neo4j(data, clear=args.clear)

    print("Load complete")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
