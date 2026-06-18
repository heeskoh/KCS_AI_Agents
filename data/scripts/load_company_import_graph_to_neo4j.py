"""Load DuckDB company import data into Neo4j (2026 관계망 재구성).

모델 (6 노드 / 5 엣지 — 모든 엣지는 기업 중심):
  노드
    - Company         기업 (속성: 위험명/위험지표 값/지역 + 6종 지표율)
    - OverseasSupplier 해외거래처
    - RelatedParty    특수관계인 (관계유형·지분율·거래비중·역외여부)
    - Item            품목 (HSK 품목번호 = code, 거래품명 = name)
    - Country         수입/출국 (적출국 기준)
    - AffiliatedCompany 관계사
  엣지 (건수=count 속성 → 프런트에서 선 굵기)
    - (Company)-[:SUPPLIED_BY {item/품목별 분리}]->(OverseasSupplier)
          품목(HSK)이 다르면 다른 엣지. 속성: declaration_no, item_name, hsk_code, spec,
          departure_country(적출국), import_date, count
    - (Company)-[:RELATED_PARTY {relation_type, ...}]->(RelatedParty)
    - (Company)-[:DECLARES_ITEM {supplier별 분리}]->(Item)
          해외거래처가 다르면 다른 엣지. 속성: declaration_no, overseas_supplier, spec,
          departure_country, import_date, count
    - (Company)-[:TRADES_WITH_COUNTRY {item별 분리}]->(Country)
          품목(HSK)이 다르면 다른 엣지. 속성: declaration_no, overseas_supplier, spec,
          departure_country, import_date, count   (Country = 적출국)
    - (Company)-[:AFFILIATED_WITH {declaration_no별 분리}]->(AffiliatedCompany)
          수입신고 NO가 다르면 다른 엣지. 속성: overseas_supplier, item

DuckDB는 원천(source of truth), Neo4j는 파생 그래프 저장소.

Usage:
    python data/scripts/load_company_import_graph_to_neo4j.py --clear
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
SOURCE_TAG = "duckdb.company_import.sample"

RISK_RATE_FIELDS = (
    "undervaluation_suspicion_rate",
    "related_party_anomaly_rate",
    "fta_origin_misuse_suspicion_rate",
    "customs_refund_anomaly_rate",
    "hs_classification_error_rate",
    "offshore_fund_concealment_suspicion_rate",
)

# 신고 처리상태 → 사건유형(한글). NORMAL(정상)은 사건이 아니므로 제외.
STATUS_KO = {"REVIEW": "검토", "INSPECT": "검사", "HOLD": "보류", "NORMAL": "정상"}
CASE_STATUSES = ("REVIEW", "INSPECT", "HOLD")


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


def country_tokens(raw: str | None) -> list[str]:
    if not raw:
        return []
    tokens = []
    for token in str(raw).replace("/", ",").replace(";", ",").split(","):
        cleaned = token.strip()
        if cleaned and cleaned.lower() not in {"none", "nan"}:
            tokens.append(cleaned)
    return sorted(set(tokens))


def region_of(address: str | None) -> str | None:
    """주소 → 지역(시/도) 추출. 예) '서울특별시 중구 ...' → '서울특별시'."""
    if not address:
        return None
    return str(address).strip().split()[0] or None


def _join(values: list[Any], sep: str = ", ", limit: int = 5) -> str | None:
    items = [str(v) for v in values if v is not None and str(v) != ""]
    if not items:
        return None
    uniq = list(dict.fromkeys(items))
    if len(uniq) <= limit:
        return sep.join(uniq)
    return sep.join(uniq[:limit]) + f" 외 {len(uniq) - limit}"


def fetch_company_import_data() -> dict[str, Any]:
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        companies = as_dicts(conn, "SELECT * FROM company_profiles ORDER BY company_id")
        risk_scores = as_dicts(conn, "SELECT * FROM import_risk_scores ORDER BY id")
        try:
            risk_indicators = as_dicts(conn, "SELECT * FROM company_risk_indicator ORDER BY id")
        except duckdb.CatalogException:
            risk_indicators = []
        try:
            related_parties = as_dicts(conn, "SELECT * FROM related_party ORDER BY company_id, id")
        except duckdb.CatalogException:
            related_parties = []

        # 품목 규격(사양) 집계: item_id → "규격A / 규격B"
        spec_rows = as_dicts(
            conn,
            "SELECT item_id, string_agg(model_spec, ' / ') AS spec "
            "FROM import_declaration_item_specs GROUP BY item_id",
        )
        spec_by_item = {r["item_id"]: r["spec"] for r in spec_rows}

        # 신고-품목 라인 (품목 행이 없으면 헤더 대표값으로 폴백)
        lines = as_dicts(
            conn,
            """
            SELECT
                d.company_id                                   AS company_id,
                d.declaration_no                               AS declaration_no,
                d.status                                       AS status,
                CAST(d.import_date AS VARCHAR)                 AS import_date,
                COALESCE(NULLIF(d.departure_country, ''), d.origin_country) AS departure_country,
                COALESCE(i.origin_country, d.origin_country)   AS origin_country,
                d.overseas_supplier_name                       AS supplier,
                COALESCE(i.hsk_code, d.hs_code)                AS hsk_code,
                COALESCE(i.trade_item_name_en, i.tariff_item_name_en, d.item_name) AS item_name,
                i.item_id                                      AS item_id
            FROM import_declarations d
            LEFT JOIN import_declaration_items i ON i.declaration_id = d.id
            WHERE COALESCE(i.hsk_code, d.hs_code) IS NOT NULL
            ORDER BY d.company_id, d.declaration_no
            """,
        )
        for ln in lines:
            ln["spec"] = spec_by_item.get(ln.get("item_id"))
            ln["origin_name"] = country_name(ln["origin_country"]) if ln.get("origin_country") else None

    return {
        "companies": companies,
        "risk_scores": risk_scores,
        "risk_indicators": risk_indicators,
        "related_parties": related_parties,
        "lines": lines,
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


def build_risk_names_by_company(risk_indicators: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """company_id → {top_risk_name, top_risk_score, risk_indicator_summary} (위험명/지표값)."""
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in risk_indicators:
        cid = row.get("company_id")
        if cid:
            grouped[cid].append(row)
    out: dict[str, dict[str, Any]] = {}
    for cid, rows in grouped.items():
        ranked = sorted(rows, key=lambda r: (r.get("score") or 0), reverse=True)
        summary = _join(
            [f"{r.get('indicator_name')}({r.get('score')})" for r in ranked],
            sep=", ", limit=6,
        )
        top = ranked[0] if ranked else {}
        out[cid] = {
            "top_risk_name": top.get("indicator_name"),
            "top_risk_score": top.get("score"),
            "risk_indicator_summary": summary,
        }
    return out


# ── 엣지 집계 ────────────────────────────────────────────────────────────────

def aggregate_edges(lines: list[dict[str, Any]], affiliate_by_company: dict[str, str]):
    """신고-품목 라인을 5종 엣지 grain으로 집계한다(건수 포함)."""
    supplied_by: dict[tuple, dict[str, Any]] = {}   # (company, supplier, hsk)
    declares_item: dict[tuple, dict[str, Any]] = {}  # (company, hsk, supplier)
    trades_country: dict[tuple, dict[str, Any]] = {}  # (company, country, hsk)
    affiliated: dict[tuple, dict[str, Any]] = {}      # (company, affiliate, declaration_no)
    case: dict[tuple, dict[str, Any]] = {}            # (company, status)
    case_count: dict[str, int] = defaultdict(int)     # status → 사건건수(전체)

    def acc(bucket: dict, key: tuple, base: dict, ln: dict):
        agg = bucket.get(key)
        if agg is None:
            agg = {**base, "_decl": set(), "_date": set(), "_spec": set(),
                   "_supplier": set(), "_item": set(), "_country": set(), "_origin": set(), "count": 0}
            bucket[key] = agg
        agg["count"] += 1
        if ln.get("declaration_no"):
            agg["_decl"].add(ln["declaration_no"])
        if ln.get("import_date"):
            agg["_date"].add(ln["import_date"])
        if ln.get("spec"):
            agg["_spec"].add(ln["spec"])
        if ln.get("supplier"):
            agg["_supplier"].add(ln["supplier"])
        if ln.get("item_name"):
            agg["_item"].add(ln["item_name"])
        if ln.get("departure_country"):
            agg["_country"].add(ln["departure_country"])
        if ln.get("origin_name"):
            agg["_origin"].add(ln["origin_name"])

    for ln in lines:
        cid = ln.get("company_id")
        hsk = ln.get("hsk_code")
        supplier = ln.get("supplier")
        country = ln.get("departure_country")
        status = ln.get("status")
        if not cid or not hsk:
            continue

        # A. 해외거래처 (품목별 분리) — supplier 있을 때만
        if supplier:
            acc(supplied_by, (cid, supplier, hsk),
                {"company_id": cid, "supplier": supplier, "hsk_code": hsk}, ln)

        # C. 품목 (해외거래처별 분리)
        acc(declares_item, (cid, hsk, supplier or ""),
            {"company_id": cid, "hsk_code": hsk, "supplier": supplier}, ln)

        # D. 수입/출국 (품목별 분리) — country 있을 때만
        if country:
            acc(trades_country, (cid, country, hsk),
                {"company_id": cid, "country_token": country, "hsk_code": hsk}, ln)

        # E. 관계사 (수입신고 NO별 분리)
        affiliate = affiliate_by_company.get(cid)
        if affiliate and ln.get("declaration_no"):
            acc(affiliated, (cid, affiliate, ln["declaration_no"]),
                {"company_id": cid, "affiliate": affiliate, "declaration_no": ln["declaration_no"]}, ln)

        # F. 사건유형 (신고 처리상태별) — 플래그된 상태(검토/검사/보류)만 사건으로 취급
        if status in CASE_STATUSES:
            acc(case, (cid, status), {"company_id": cid, "status": status}, ln)
            case_count[status] += 1

    def finalize(bucket: dict) -> list[dict[str, Any]]:
        rows = []
        for agg in bucket.values():
            rows.append({
                **{k: v for k, v in agg.items() if not k.startswith("_")},
                "declaration_no": _join(sorted(agg["_decl"])),
                "import_date": _join(sorted(agg["_date"])),
                "spec": _join(sorted(agg["_spec"])),
                "overseas_supplier": _join(sorted(agg["_supplier"])),
                "item_name": _join(sorted(agg["_item"])),
                "departure_country": _join(sorted(agg["_country"])),
                "origin": _join(sorted(agg["_origin"])),
            })
        return rows

    return {
        "supplied_by": finalize(supplied_by),
        "declares_item": finalize(declares_item),
        "trades_country": finalize(trades_country),
        "affiliated": finalize(affiliated),
        "case": finalize(case),
        "case_count": dict(case_count),
    }


# ── 항만(출발항·도착항) 경로 집계 ────────────────────────────────────────────

KR_COUNTRY = "대한민국"


def parse_port(label: str | None) -> tuple[str, str]:
    """'부산항(KRPUS)' → ('부산항', 'KRPUS'). 코드 없으면 라벨 자체를 코드로."""
    if label and label.endswith(")") and "(" in label:
        name, _, code = label.rpartition("(")
        return name.strip(), code[:-1].strip()
    return (label or ""), (label or "")


def fetch_port_routes() -> list[dict[str, Any]]:
    """수입·수출 신고서에서 출발항·도착항 엣지를 집계한다.

    수입: 출발항(해외, 출발지국가) + 도착항(한국)
    수출: 출발항(한국) + 도착항(해외, 도착지국가)
    role(departure/arrival) → 노드 라벨(DeparturePort/ArrivalPort) 결정.
    """
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        imports = as_dicts(
            conn,
            """
            SELECT company_id, declaration_no,
                   CAST(import_date AS VARCHAR) AS trade_date,
                   departure_port, arrival_port, transport_type,
                   COALESCE(NULLIF(departure_country, ''),
                            NULLIF(origin_country_name, ''),
                            origin_country) AS country
            FROM import_declarations
            WHERE company_id IS NOT NULL
              AND (departure_port IS NOT NULL OR arrival_port IS NOT NULL)
            """,
        )
        exports = as_dicts(
            conn,
            """
            SELECT company_id, declaration_no,
                   CAST(export_date AS VARCHAR) AS trade_date,
                   departure_port, arrival_port, transport_type,
                   dest_country AS country
            FROM export_declaration
            WHERE company_id IS NOT NULL
              AND (departure_port IS NOT NULL OR arrival_port IS NOT NULL)
            """,
        )

    agg: dict[tuple, dict[str, Any]] = {}

    def add(cid, role, label, transport, country, decl, date, flow):
        if not cid or not label:
            return
        name, code = parse_port(label)
        country_name_ = country_name(country_code(country), default=country) if country else None
        key = (cid, role, code, flow)
        cur = agg.get(key)
        if cur is None:
            cur = {
                "company_id": cid,
                "role": role,
                "node_label": "DeparturePort" if role == "departure" else "ArrivalPort",
                "rel_type": "DEPARTS_FROM" if role == "departure" else "ARRIVES_AT",
                "port_code": code,
                "port_name": name,
                "transport_type": transport,
                "country": country_name_,
                "trade_flow": flow,
                "_decl": set(),
                "_date": set(),
                "count": 0,
            }
            agg[key] = cur
        cur["count"] += 1
        if decl:
            cur["_decl"].add(decl)
        if date:
            cur["_date"].add(date)

    for r in imports:
        # 수입: 출발항=해외(출발지국가), 도착항=한국
        add(r["company_id"], "departure", r.get("departure_port"), r.get("transport_type"),
            r.get("country"), r.get("declaration_no"), r.get("trade_date"), "수입")
        add(r["company_id"], "arrival", r.get("arrival_port"), r.get("transport_type"),
            KR_COUNTRY, r.get("declaration_no"), r.get("trade_date"), "수입")
    for r in exports:
        # 수출: 출발항=한국, 도착항=해외(도착지국가)
        add(r["company_id"], "departure", r.get("departure_port"), r.get("transport_type"),
            KR_COUNTRY, r.get("declaration_no"), r.get("trade_date"), "수출")
        add(r["company_id"], "arrival", r.get("arrival_port"), r.get("transport_type"),
            r.get("country"), r.get("declaration_no"), r.get("trade_date"), "수출")

    rows = []
    for cur in agg.values():
        rows.append({
            **{k: v for k, v in cur.items() if not k.startswith("_")},
            "declaration_no": _join(sorted(cur["_decl"])),
            "trade_date": _join(sorted(cur["_date"])),
        })
    return rows


# ── Neo4j 적재 ───────────────────────────────────────────────────────────────

def create_constraints(tx: ManagedTransaction) -> None:
    # 레거시 제약 제거: Item은 HSK 코드(code)로 식별한다. name 유일성은 잘못된 가정이라 제거.
    tx.run("DROP CONSTRAINT item_name IF EXISTS")
    statements = [
        "CREATE CONSTRAINT company_id IF NOT EXISTS FOR (n:Company) REQUIRE n.company_id IS UNIQUE",
        "CREATE CONSTRAINT country_code IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT item_code IF NOT EXISTS FOR (n:Item) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT supplier_name IF NOT EXISTS FOR (n:OverseasSupplier) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT affiliate_name IF NOT EXISTS FOR (n:AffiliatedCompany) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT related_party_key IF NOT EXISTS FOR (n:RelatedParty) REQUIRE n.key IS UNIQUE",
        "CREATE CONSTRAINT case_type_code IF NOT EXISTS FOR (n:CaseType) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT departure_port_code IF NOT EXISTS FOR (n:DeparturePort) REQUIRE n.code IS UNIQUE",
        "CREATE CONSTRAINT arrival_port_code IF NOT EXISTS FOR (n:ArrivalPort) REQUIRE n.code IS UNIQUE",
    ]
    for statement in statements:
        tx.run(statement)


def clear_company_graph(tx: ManagedTransaction) -> None:
    # 신규 + 레거시 엣지 모두 제거 (완전 재구성)
    edge_types = [
        "SUPPLIED_BY", "RELATED_PARTY", "DECLARES_ITEM", "TRADES_WITH_COUNTRY", "AFFILIATED_WITH", "CASE",
        "DEPARTS_FROM", "ARRIVES_AT",
        "IMPORTED", "SUPPLIES_TO", "USES_BROKER", "HAS_RELATED_COMPANY", "EXPORTS_TO", "HAS_RISK_INDICATOR",
    ]
    for et in edge_types:
        tx.run(f"MATCH ()-[r:{et}]-() DELETE r")
    # 기업 그래프 전용 분류/엔티티 노드는 라벨 단위 전량 삭제(잔존 레거시 포함).
    # Country는 우범자 그래프와 공유하므로 제외.
    tx.run(
        """
        MATCH (n)
        WHERE n:Item OR n:OverseasSupplier OR n:AffiliatedCompany OR n:RelatedParty OR n:CaseType
              OR n:HsCode OR n:Broker OR n:RelatedCompany OR n:RiskIndicator
              OR n:DeparturePort OR n:ArrivalPort
        DETACH DELETE n
        """
    )
    # Company는 source_tag 기준 삭제(타 적재분 보호).
    tx.run(
        "MATCH (n:Company) WHERE n.updated_from = $source_tag DETACH DELETE n",
        {"source_tag": SOURCE_TAG},
    )


def merge_company(tx: ManagedTransaction, row: dict[str, Any], risk: dict[str, Any],
                  risk_name: dict[str, Any]) -> None:
    params = {**row, "source_tag": SOURCE_TAG}
    params["region"] = region_of(row.get("address"))
    for field in RISK_RATE_FIELDS:
        params[field] = risk.get(field)
    params["top_risk_name"] = risk_name.get("top_risk_name")
    params["top_risk_score"] = risk_name.get("top_risk_score")
    params["risk_indicator_summary"] = risk_name.get("risk_indicator_summary")
    tx.run(
        """
        MERGE (c:Company {company_id: $company_id})
        SET c.company_name = $company_name,
            c.business_registration_no = $business_registration_no,
            c.industry_code = $industry_code,
            c.region = $region,
            c.risk_level = $risk_level,
            c.risk_score = $risk_score,
            c.top_risk_name = $top_risk_name,
            c.top_risk_score = $top_risk_score,
            c.risk_indicator_summary = $risk_indicator_summary,
            c.undervaluation_suspicion_rate = $undervaluation_suspicion_rate,
            c.related_party_anomaly_rate = $related_party_anomaly_rate,
            c.fta_origin_misuse_suspicion_rate = $fta_origin_misuse_suspicion_rate,
            c.customs_refund_anomaly_rate = $customs_refund_anomaly_rate,
            c.hs_classification_error_rate = $hs_classification_error_rate,
            c.offshore_fund_concealment_suspicion_rate = $offshore_fund_concealment_suspicion_rate,
            c.updated_from = $source_tag
        """,
        params,
    )


def merge_related_party(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    if not row.get("company_id") or not row.get("party_name"):
        return
    code = country_code(row.get("country")) if row.get("country") else None
    params = {
        **row,
        "key": f"{row['company_id']}:{row['party_name']}",
        "country_name": country_name(code, default=row.get("country")) if code else row.get("country"),
        "source_tag": SOURCE_TAG,
    }
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (p:RelatedParty {key: $key})
        SET p.name = $party_name,
            p.country = $country_name,
            p.is_offshore = $is_offshore,
            p.updated_from = $source_tag
        MERGE (c)-[r:RELATED_PARTY {relation_type: $relation_type}]->(p)
        SET r.shareholding_pct = $shareholding_pct,
            r.trade_share_pct = $trade_share_pct,
            r.is_offshore = $is_offshore,
            r.note = $note,
            r.updated_from = $source_tag
        """,
        params,
    )


def merge_supplied_by(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (s:OverseasSupplier {name: $supplier})
        SET s.updated_from = $source_tag
        MERGE (c)-[r:SUPPLIED_BY {hsk_code: $hsk_code}]->(s)
        SET r.declaration_no = $declaration_no,
            r.item_name = $item_name,
            r.spec = $spec,
            r.departure_country = $departure_country,
            r.import_date = $import_date,
            r.count = $count,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_declares_item(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (it:Item {code: $hsk_code})
        SET it.name = coalesce($item_name, it.name),
            it.origin = coalesce($origin, it.origin),
            it.updated_from = $source_tag
        MERGE (c)-[r:DECLARES_ITEM {supplier: coalesce($supplier, '(미상)')}]->(it)
        SET r.declaration_no = $declaration_no,
            r.overseas_supplier = $supplier,
            r.spec = $spec,
            r.departure_country = $departure_country,
            r.import_date = $import_date,
            r.count = $count,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_trades_country(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    code = country_code(row.get("country_token"))
    params = {
        **row,
        "country_code": code,
        "country_name": country_name(code, default=row.get("country_token")),
        "source_tag": SOURCE_TAG,
    }
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (country:Country {code: $country_code})
        SET country.name = $country_name,
            country.updated_from = $source_tag
        MERGE (c)-[r:TRADES_WITH_COUNTRY {hsk_code: $hsk_code}]->(country)
        SET r.declaration_no = $declaration_no,
            r.item_name = $item_name,
            r.overseas_supplier = $overseas_supplier,
            r.spec = $spec,
            r.departure_country = $departure_country,
            r.import_date = $import_date,
            r.count = $count,
            r.updated_from = $source_tag
        """,
        params,
    )


def merge_port(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    """출발항(DeparturePort)·도착항(ArrivalPort) 노드 + DEPARTS_FROM/ARRIVES_AT 엣지.

    노드 속성: name, code, transport_type(운송수단), country(출발지/도착지국가).
    엣지 속성: trade_flow(수입/수출), transport_type, declaration_no, trade_date, count.
    """
    label = "DeparturePort" if row.get("role") == "departure" else "ArrivalPort"
    rel = "DEPARTS_FROM" if row.get("role") == "departure" else "ARRIVES_AT"
    tx.run(
        f"""
        MATCH (c:Company {{company_id: $company_id}})
        MERGE (p:{label} {{code: $port_code}})
        SET p.name = $port_name,
            p.transport_type = coalesce($transport_type, p.transport_type),
            p.country = coalesce($country, p.country),
            p.updated_from = $source_tag
        MERGE (c)-[r:{rel} {{trade_flow: $trade_flow, port_code: $port_code}}]->(p)
        SET r.transport_type = $transport_type,
            r.country = $country,
            r.declaration_no = $declaration_no,
            r.trade_date = $trade_date,
            r.count = $count,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def merge_case(tx: ManagedTransaction, row: dict[str, Any], case_count: dict[str, int]) -> None:
    """신고 처리상태 → (:Company)-[:CASE {신고속성}]->(:CaseType). CaseType.case_count=전체 사건건수."""
    status = row.get("status")
    params = {
        **row,
        "case_type_code": status,
        "case_type_name": STATUS_KO.get(status, status),
        "case_count": case_count.get(status, 0),
        "source_tag": SOURCE_TAG,
    }
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (ct:CaseType {code: $case_type_code})
        SET ct.name = $case_type_name,
            ct.case_count = $case_count,
            ct.updated_from = $source_tag
        MERGE (c)-[r:CASE {status: $case_type_code}]->(ct)
        SET r.declaration_no = $declaration_no,
            r.overseas_supplier = $overseas_supplier,
            r.item = $item_name,
            r.departure_country = $departure_country,
            r.import_date = $import_date,
            r.count = $count,
            r.updated_from = $source_tag
        """,
        params,
    )


def merge_affiliated(tx: ManagedTransaction, row: dict[str, Any]) -> None:
    tx.run(
        """
        MATCH (c:Company {company_id: $company_id})
        MERGE (a:AffiliatedCompany {name: $affiliate})
        SET a.updated_from = $source_tag
        MERGE (c)-[r:AFFILIATED_WITH {declaration_no: $declaration_no}]->(a)
        SET r.overseas_supplier = $overseas_supplier,
            r.item = $item_name,
            r.count = $count,
            r.updated_from = $source_tag
        """,
        {**row, "source_tag": SOURCE_TAG},
    )


def load_to_neo4j(data: dict[str, Any], clear: bool = False) -> dict[str, Any]:
    load_dotenv()
    uri = os.getenv("NEO4J_URI", DEFAULT_URI)
    user = os.getenv("NEO4J_USER", DEFAULT_USER)
    password = os.getenv("NEO4J_PASSWORD", DEFAULT_PASSWORD)
    database = os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE)

    risk_by_company = build_risk_by_company(data["risk_scores"])
    risk_names = build_risk_names_by_company(data["risk_indicators"])
    affiliate_by_company = {
        c["company_id"]: c.get("related_companies")
        for c in data["companies"] if c.get("related_companies")
    }
    edges = aggregate_edges(data["lines"], affiliate_by_company)
    port_routes = fetch_port_routes()

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session(database=database) as session:
            session.execute_write(create_constraints)
            if clear:
                session.execute_write(clear_company_graph)

            for row in data["companies"]:
                session.execute_write(
                    merge_company, row,
                    risk_by_company.get(row["company_id"], {}),
                    risk_names.get(row["company_id"], {}),
                )
            for row in data["related_parties"]:
                session.execute_write(merge_related_party, row)
            for row in edges["supplied_by"]:
                session.execute_write(merge_supplied_by, row)
            for row in edges["declares_item"]:
                session.execute_write(merge_declares_item, row)
            for row in edges["trades_country"]:
                session.execute_write(merge_trades_country, row)
            for row in edges["affiliated"]:
                session.execute_write(merge_affiliated, row)
            for row in edges["case"]:
                session.execute_write(merge_case, row, edges["case_count"])
            for row in port_routes:
                session.execute_write(merge_port, row)

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
        "related_parties_loaded": len(data["related_parties"]),
        "supplied_by_edges": len(edges["supplied_by"]),
        "declares_item_edges": len(edges["declares_item"]),
        "trades_country_edges": len(edges["trades_country"]),
        "affiliated_edges": len(edges["affiliated"]),
        "case_edges": len(edges["case"]),
        "port_edges": len(port_routes),
        "case_count_by_status": edges["case_count"],
        "neo4j_node_counts": node_counts,
        "neo4j_relationship_counts": relationship_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load DuckDB company import graph into Neo4j (6노드/5엣지 재구성)")
    parser.add_argument("--clear", action="store_true", help="Clear previously loaded company graph before loading.")
    args = parser.parse_args()

    print(f"DuckDB: {DB_PATH}")
    data = fetch_company_import_data()
    result = load_to_neo4j(data, clear=args.clear)

    print("Load complete")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
