"""Load DuckDB company data into Neo4j — 수입신고 **엣지** 모델 (2026 재설계 v2).

목적: 기업 위험도의 **원인 추적**. 직전 모델은 수입신고(Declaration)를 허브 노드로 두었으나,
본 버전은 **수입신고를 (기업)→(품목분류) 엣지**로 표현한다. 한 신고에 달려있던
출발항·도착항·해외거래처·관세사·금액·신고일·위험기여는 모두 엣지 속성으로 흡수한다.
이로써 그래프가 크게 단순해지고(신고 노드 폭증 제거) 기업–품목 관계가 직관적으로 보인다.

집계 그레인: (company_id, 품목분류 8자리, 수출입구분) 당 IMPORT_DECLARATION 엣지 1개.
  - count: 신고 건수, value: 신고금액 합계
  - departure_port/arrival_port/supplier/broker: 해당 그룹의 distinct 값(콤마 결합)
  - declaration_no: 대표 신고번호 샘플(콤마 결합, 최대 5)
  - contributes: 이 그룹 신고들이 끌어올린 위험요인 코드(콤마 결합) — 원인분석용
  - contributes_weight: 위 기여의 최대 가중치

  노드 (7종)
    - Company           기업
    - ItemClass         품목분류(8자리)
    - RiskScore         종합위험값(기업당 1)
    - RiskFactor        위험요인(연관 범죄, 지표 6종)
    - RelatedParty      특수관계인
    - AffiliatedCompany 관계사
    - CaseType          사건유형(검토/검사/보류)

  엣지
    - (Company)-[:IMPORT_DECLARATION {trade_flow, count, value, declaration_no,
                 departure_port, arrival_port, departure_country, arrival_country,
                 supplier, broker, hsk_code, item_name, status, trade_date,
                 contributes, contributes_weight}]->(ItemClass)
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
SAMPLE_MAX = 5  # 엣지 속성에 담을 distinct/샘플 값 최대 개수

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


def parse_port(label: str | None) -> str:
    """'부산항(KRPUS)' → '부산항'. 코드 괄호는 제거하고 이름만 남긴다."""
    if label and label.endswith(")") and "(" in label:
        name, _, _code = label.rpartition("(")
        return name.strip()
    return label or ""


def norm_country(raw: str | None) -> str | None:
    if not raw:
        return None
    code = country_code(raw)
    return country_name(code, default=raw) if code else raw


def join_distinct(values: list[Any], limit: int = SAMPLE_MAX) -> str | None:
    """distinct 문자열을 입력 순서대로 콤마 결합(최대 limit개, 초과 시 '…')."""
    seen: list[str] = []
    for v in values:
        s = str(v).strip() if v not in (None, "") else ""
        if s and s not in seen:
            seen.append(s)
    if not seen:
        return None
    if len(seen) > limit:
        return ", ".join(seen[:limit]) + f" … (+{len(seen) - limit})"
    return ", ".join(seen)


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

        # 수입신고 헤더 (IMPORT_DECLARATION 엣지로 흡수할 거래/경로/거래처/관세사)
        imports = as_dicts(
            conn,
            """
            SELECT declaration_no, company_id,
                   CAST(import_date AS VARCHAR) AS trade_date,
                   declared_value AS value, status, hs_code, item_name,
                   departure_port, arrival_port, overseas_supplier_name AS supplier,
                   filer_name,
                   COALESCE(NULLIF(departure_country, ''),
                            NULLIF(origin_country_name, ''), origin_country) AS dep_country
            FROM import_declarations
            WHERE company_id IS NOT NULL AND declaration_no IS NOT NULL
            """,
        )
        # 수출신고 (매수인·관세사 없음)
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

        # 신고-품목 라인 (신고별 distinct 8자리 품목분류 + 대표 10자리 hsk·품명)
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


# ── 수입신고 엣지 집계 ────────────────────────────────────────────────────────

def build_item_lines(item_lines: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """declaration_no → [{hs8, hsk_code, item_name}] (distinct hs8)."""
    by_decl: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for ln in item_lines:
        dno, code8 = ln.get("declaration_no"), hs8(ln.get("hsk_code"))
        if not dno or not code8:
            continue
        by_decl[dno].setdefault(code8, {
            "hs8": code8, "hsk_code": ln.get("hsk_code"), "item_name": ln.get("item_name"),
        })
    return {dno: list(items.values()) for dno, items in by_decl.items()}


def build_decl_contrib(indicators_by_company: dict[str, list[dict[str, Any]]]) -> dict[str, list[tuple]]:
    """declaration_no → [(indicator_code, weight)] (원인분석: 신고가 끌어올린 위험요인)."""
    by_decl: dict[str, list[tuple]] = defaultdict(list)
    for inds in indicators_by_company.values():
        for ind in inds:
            code = ind.get("indicator_code")
            weight = ind.get("score") or 1
            if not code:
                continue
            for dno in parse_contrib_decls(ind.get("related_refs")):
                by_decl[dno].append((code, weight))
    return by_decl


class EdgeAgg:
    """(company_id, hs8, trade_flow) 그룹의 수입신고 엣지 누적기."""

    __slots__ = ("company_id", "hs8", "trade_flow", "count", "value", "decl_nos",
                 "dep_ports", "arr_ports", "suppliers", "brokers", "dep_countries",
                 "arr_countries", "hsk_codes", "item_name", "statuses", "trade_date",
                 "contrib_codes", "contrib_weight")

    def __init__(self, company_id: str, code8: str, trade_flow: str):
        self.company_id = company_id
        self.hs8 = code8
        self.trade_flow = trade_flow
        self.count = 0
        self.value = 0.0
        self.decl_nos: list[str] = []
        self.dep_ports: list[str] = []
        self.arr_ports: list[str] = []
        self.suppliers: list[str] = []
        self.brokers: list[str] = []
        self.dep_countries: list[str] = []
        self.arr_countries: list[str] = []
        self.hsk_codes: list[str] = []
        self.item_name: str | None = None
        self.statuses: list[str] = []
        self.trade_date: str | None = None
        self.contrib_codes: list[str] = []
        self.contrib_weight: float = 0.0

    def add(self, decl: dict[str, Any], item: dict[str, Any], contribs: list[tuple]):
        self.count += 1
        try:
            self.value += float(decl.get("value") or 0)
        except (TypeError, ValueError):
            pass
        self.decl_nos.append(decl["declaration_no"])
        if decl.get("departure_port"):
            self.dep_ports.append(parse_port(decl["departure_port"]))
        if decl.get("arrival_port"):
            self.arr_ports.append(parse_port(decl["arrival_port"]))
        if decl.get("supplier"):
            self.suppliers.append(decl["supplier"])
        if decl.get("broker"):
            self.brokers.append(decl["broker"])
        if decl.get("dep_country_name"):
            self.dep_countries.append(decl["dep_country_name"])
        if decl.get("arr_country_name"):
            self.arr_countries.append(decl["arr_country_name"])
        if item.get("hsk_code"):
            self.hsk_codes.append(str(item["hsk_code"]))
        if not self.item_name and item.get("item_name"):
            self.item_name = item["item_name"]
        if decl.get("status"):
            self.statuses.append(decl["status"])
        d = decl.get("trade_date")
        if d and (self.trade_date is None or str(d) > str(self.trade_date)):
            self.trade_date = d
        for code, weight in contribs:
            self.contrib_codes.append(code)
            try:
                self.contrib_weight = max(self.contrib_weight, float(weight))
            except (TypeError, ValueError):
                pass

    def to_params(self) -> dict[str, Any]:
        return {
            "company_id": self.company_id,
            "code8": self.hs8,
            "trade_flow": self.trade_flow,
            "count": self.count,
            "value": round(self.value) if self.value else None,
            "declaration_no": join_distinct(self.decl_nos),
            "departure_port": join_distinct(self.dep_ports),
            "arrival_port": join_distinct(self.arr_ports),
            "departure_country": join_distinct(self.dep_countries),
            "arrival_country": join_distinct(self.arr_countries),
            "supplier": join_distinct(self.suppliers),
            "broker": join_distinct(self.brokers),
            "hsk_code": join_distinct(self.hsk_codes),
            "item_name": self.item_name,
            "status": join_distinct([STATUS_KO.get(s, s) for s in self.statuses]),
            "trade_date": self.trade_date,
            "contributes": join_distinct(self.contrib_codes, limit=6),
            "contributes_weight": round(self.contrib_weight, 1) if self.contrib_weight else None,
            "tag": SOURCE_TAG,
        }


def aggregate_declaration_edges(data: dict[str, Any]) -> list[EdgeAgg]:
    items_by_decl = build_item_lines(data["item_lines"])
    contrib_by_decl = build_decl_contrib(build_indicators_by_company(data["risk_indicators"]))
    broker_by_company = {c["company_id"]: c.get("customs_broker_firm")
                         for c in data["companies"] if c.get("customs_broker_firm")}

    agg: dict[tuple, EdgeAgg] = {}

    def feed(rows: list[dict[str, Any]], trade_flow: str, is_import: bool):
        for r in rows:
            dno = r["declaration_no"]
            decl = dict(r)
            if trade_flow == "수입":
                decl["dep_country_name"] = norm_country(r.get("dep_country"))
                decl["arr_country_name"] = KR_COUNTRY
                decl["broker"] = r.get("filer_name") or broker_by_company.get(r["company_id"])
            else:
                decl["dep_country_name"] = KR_COUNTRY
                decl["arr_country_name"] = norm_country(r.get("dest_country"))
                decl["supplier"] = None
                decl["broker"] = None
            # 품목 라인: 없으면 신고 자체 hs_code로 폴백
            items = items_by_decl.get(dno)
            if not items:
                code8 = hs8(r.get("hs_code"))
                if not code8:
                    continue
                items = [{"hs8": code8, "hsk_code": r.get("hs_code"), "item_name": r.get("item_name")}]
            contribs = contrib_by_decl.get(dno, [])
            for item in items:
                key = (r["company_id"], item["hs8"], trade_flow)
                bucket = agg.get(key)
                if bucket is None:
                    bucket = agg[key] = EdgeAgg(r["company_id"], item["hs8"], trade_flow)
                bucket.add(decl, item, contribs)

    feed(data["imports"], "수입", True)
    feed(data["exports"], "수출", False)
    return list(agg.values())


# ── Neo4j 적재 ───────────────────────────────────────────────────────────────

def create_constraints(tx: ManagedTransaction) -> None:
    tx.run("DROP CONSTRAINT item_name IF EXISTS")
    # 레거시(수입신고 노드 모델) 제약 제거 — 노드가 사라지므로 불필요
    for legacy in ("declaration_no", "departure_port_code", "arrival_port_code",
                   "supplier_name", "broker_name"):
        tx.run(f"DROP CONSTRAINT {legacy} IF EXISTS")
    statements = [
        "CREATE CONSTRAINT company_id IF NOT EXISTS FOR (n:Company) REQUIRE n.company_id IS UNIQUE",
        "CREATE CONSTRAINT item_class_code IF NOT EXISTS FOR (n:ItemClass) REQUIRE n.code IS UNIQUE",
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
        "IMPORT_DECLARATION", "RISK_INDICATORS", "DRIVEN_BY", "ANALYZED",
        "RELATED_PARTY", "AFFILIATED_WITH", "CASE",
        # 레거시(수입신고 허브 모델 + 그 이전)
        "FILED", "OF_ITEM", "FROM_PORT", "TO_PORT", "SUPPLIED_BY", "FILED_BY",
        "CONTRIBUTES_TO", "DEPARTS_FROM", "PORT_ROUTE", "VIA_SUPPLIER",
        "DECLARES_ITEM", "USES_BROKER", "TRADES_WITH_COUNTRY", "ARRIVES_AT",
        "IMPORTED", "SUPPLIES_TO", "HAS_RELATED_COMPANY", "EXPORTS_TO",
        "HAS_RISK_INDICATOR",
    ]
    for et in edge_types:
        tx.run(f"MATCH ()-[r:{et}]-() DELETE r")
    # 더 이상 노드로 적재하지 않는 레거시 라벨 정리(품목/위험/관계사 등은 유지)
    tx.run(
        """
        MATCH (n)
        WHERE n:Declaration OR n:Item OR n:OverseasSupplier
              OR n:Broker OR n:DeparturePort OR n:ArrivalPort
              OR n:HsCode OR n:RelatedCompany OR n:RiskIndicator
        DETACH DELETE n
        """
    )
    # 본 로더가 적재하는 ItemClass/RiskScore/RiskFactor/CaseType/AffiliatedCompany/
    # RelatedParty 및 Company 는 재적재 시 MERGE로 갱신되므로 source_tag 로만 정리.
    tx.run(
        """
        MATCH (n)
        WHERE (n:ItemClass OR n:RiskScore OR n:RiskFactor OR n:CaseType
               OR n:AffiliatedCompany OR n:RelatedParty)
          AND n.updated_from = $source_tag
        DETACH DELETE n
        """,
        {"source_tag": SOURCE_TAG},
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


def merge_import_declaration_edge(tx: ManagedTransaction, params: dict[str, Any]) -> None:
    """(Company)-[:IMPORT_DECLARATION {거래/경로/거래처/관세사/위험기여}]->(ItemClass).

    수입/수출은 trade_flow 로 구분되어 같은 기업–품목 사이에 별도 엣지로 적재된다.
    """
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (it:ItemClass {code: $code8})
        SET it.name = coalesce($item_name, it.name), it.updated_from = $tag
        MERGE (c)-[r:IMPORT_DECLARATION {trade_flow: $trade_flow}]->(it)
        SET r.count = $count, r.value = $value, r.declaration_no = $declaration_no,
            r.departure_port = $departure_port, r.arrival_port = $arrival_port,
            r.departure_country = $departure_country, r.arrival_country = $arrival_country,
            r.supplier = $supplier, r.broker = $broker,
            r.hsk_code = $hsk_code, r.item_name = $item_name,
            r.status = $status, r.trade_date = $trade_date,
            r.contributes = $contributes, r.contributes_weight = $contributes_weight,
            r.updated_from = $tag
        """,
        params,
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

    affiliate_by_company = {c["company_id"]: c.get("related_companies")
                            for c in data["companies"] if c.get("related_companies")}

    # 수입신고 엣지 집계 (company × 품목분류 × 수출입)
    edges = aggregate_declaration_edges(data)
    contrib_edges = sum(1 for e in edges if e.contrib_codes)

    # 사건건수(전체 status별) + 기업별 status 집합
    case_count: dict[str, int] = defaultdict(int)
    company_statuses: dict[str, set] = defaultdict(set)
    for r in data["imports"]:
        st = r.get("status")
        if st in CASE_STATUSES:
            case_count[st] += 1
            company_statuses[r["company_id"]].add(st)

    driver = GraphDatabase.driver(uri, auth=(user, password))
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

            # 수입신고 엣지 (Company → ItemClass)
            for e in edges:
                session.execute_write(merge_import_declaration_edge, e.to_params())

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

    decl_total = sum(e.count for e in edges)
    return {
        "companies_loaded": len(data["companies"]),
        "declaration_edges": len(edges),
        "declarations_aggregated": decl_total,
        "risk_factors": len(factors),
        "contributing_edges": contrib_edges,
        "related_parties_loaded": len(data["related_parties"]),
        "analyses_loaded": len(data["analyses"]),
        "case_count_by_status": dict(case_count),
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB company graph into Neo4j (수입신고 엣지 모델 v2)")
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
