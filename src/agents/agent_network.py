"""Agent: 관계망 분석 — DB 데이터 기반으로 기업 간 거래·지분 관계망을 동적 생성하고
우회수입·역외 자금·이전가격 위험 징후를 도출한다.

그래프 구성
-----------
[노드]
  subject      : 조사 대상 기업
  related      : DB related_companies 의 관계법인
  supplier     : 수입신고 원산지 상위 3개국 (거래 집중도 포함)
  broker       : 통관 대리 관세사법인

[엣지]
  equity       : 지분·모자 관계
  trade        : 수입 거래 (원산지 → 대상기업)
  service      : 관세사 통관 서비스

[알림 규칙]
  - 역외 관할권(HK·BVI·케이맨 등) 관계법인
  - 관계법인 소재국 = 주요 수입국 (연계 거래·이전가격 위험)
  - 단일 원산지 집중도 ≥ 70 %
  - FTA 고감면율(≥30%) + 고위험 원산지(중국·베트남 등) 조합
  - 경유 허브 의심(HKG·SGP 경유)
  - 검토·조사 상태 신고 비율 높음
  - 위험점수 70 이상 + 역외 관계법인
"""
import re
from typing import Optional

import duckdb

from src.agents.state import CustomsState
from src.agents.scope import (
    has_company_scope,
    has_person_scope,
    no_company_result,
    no_target_result,
    target_id,
    target_type,
)
from src.config import CFG
from src.llm import llm
from src.neo4j_graph import Neo4jGraphError, build_company_network_report, build_person_network_report
from src.paths import DB_PATH

# ── 참조 데이터 ────────────────────────────────────────────────────────────────

COUNTRY_NAMES: dict[str, str] = {
    "TWN": "대만",    "CHN": "중국",     "JPN": "일본",       "KOR": "한국",
    "SAU": "사우디아라비아", "ARE": "UAE",  "MYS": "말레이시아", "THA": "태국",
    "VNM": "베트남",  "BGD": "방글라데시", "KHM": "캄보디아",   "IDN": "인도네시아",
    "CHE": "스위스",  "DEU": "독일",     "USA": "미국",        "GBR": "영국",
    "AUS": "호주",    "CHL": "칠레",     "PER": "페루",        "SGP": "싱가포르",
    "HKG": "홍콩",    "MEX": "멕시코",   "IND": "인도",        "BRA": "브라질",
}

# 역외 관할권 키워드 (company name → 리스크 판정)
_OFFSHORE_HIGH: tuple[str, ...] = (
    "BVI", "British Virgin", "Cayman", "케이맨",
    "Seychelles", "Panama", "파나마",
)
_OFFSHORE_MEDIUM: tuple[str, ...] = (
    " HK", "(HK)", "Hong Kong", "홍콩",
    "Luxembourg", "Liechtenstein", "Isle of Man",
)
_OFFSHORE_LOW: tuple[str, ...] = (
    "Singapore", "Pte.", "싱가포르",
    "UAE", "Dubai",
)

# 관계법인 유형 키워드
_PARENT_KW:    tuple[str, ...] = ("Holdings", "Group", "Capital", "Investment", "Partners", "Parent")
_LOGISTICS_KW: tuple[str, ...] = ("Logistics", "Supply", "Sourcing", "Distribution", "Freight", "Cargo")
_TRADING_KW:   tuple[str, ...] = ("Trading", "Trade", "Commerce", "Intl", "International", "Import", "Export")
_LAB_KW:       tuple[str, ...] = ("Lab", "Bio", "Tech", "Research", "Science", "Pharma")

# 고위험 원산지 (저가신고·원산지 세탁 이슈)
_HIGH_RISK_ORIGINS: frozenset[str] = frozenset({"CHN", "VNM", "KHM", "BGD", "IDN"})

# 경유 허브 의심 원산지 (중간 집하 경유)
_HUB_ORIGINS: frozenset[str] = frozenset({"HKG", "SGP", "ARE", "MYS"})

_LLM_PROMPT = """당신은 관세청 관계망 분석 전문 조사관입니다.
아래 DB 기반으로 동적 생성된 기업 관계망 분석 결과를 검토하고 관세 조사 관점의 위험 요소를 평가하세요.

분석 항목:
1. 특수관계 판단: 관세법 제23조 기준 특수관계자 여부 및 거래 규모
2. 우회수입 징후: 원산지 우회, 중간 경유 허브, 다단계 중개 구조
3. 역외 자금 위험: 조세피난처 관계법인, 불명확한 수수료 지급 구조
4. 이전가격 위험: 관계법인 소재국과 주요 수입국 일치 여부
5. 조사 우선순위: 가장 먼저 확인해야 할 노드와 서류

[관계망 분석 데이터]
{network_data}

관련 법령 근거(관세법 조항 포함)와 함께 간결하고 실무적으로 작성하세요.
"""


# ── 파싱 · 분류 헬퍼 ───────────────────────────────────────────────────────────

def _classify_related(name: str) -> tuple[str, str, str]:
    """관계법인명 → (node_type, offshore_level, inferred_country).

    Returns:
        node_type      : parent | logistics | trading | lab | affiliate
        offshore_level : HIGH | MEDIUM | LOW | NONE
        country_hint   : 추론된 국가명 (없으면 "해외")
    """
    # 역외 리스크
    if any(k.lower() in name.lower() for k in _OFFSHORE_HIGH):
        offshore = "HIGH"
    elif any(k.lower() in name.lower() for k in _OFFSHORE_MEDIUM):
        offshore = "MEDIUM"
    elif any(k.lower() in name.lower() for k in _OFFSHORE_LOW):
        offshore = "LOW"
    else:
        offshore = "NONE"

    # 유형
    if any(k.lower() in name.lower() for k in _PARENT_KW):
        node_type = "parent"
    elif any(k.lower() in name.lower() for k in _LOGISTICS_KW):
        node_type = "logistics"
    elif any(k.lower() in name.lower() for k in _TRADING_KW):
        node_type = "trading"
    elif any(k.lower() in name.lower() for k in _LAB_KW):
        node_type = "affiliate"
    else:
        node_type = "affiliate"

    # 국가 추론
    country_map = {
        "HK": "홍콩", "(HK)": "홍콩", "Hong Kong": "홍콩",
        "Singapore": "싱가포르", "Pte": "싱가포르",
        "Taiwan": "대만", "(TW)": "대만", " TW": "대만",
        "Thailand": "태국", "China": "중국", "Vietnam": "베트남",
        "Mexico": "멕시코", "Germany": "독일", "Japan": "일본",
        "Australia": "호주", "USA": "미국", "Inc.": "미국",
        "BVI": "영국령 버진아일랜드", "Cayman": "케이맨 제도",
        "UK": "영국", "Ltd.": "해외", "Co.": "해외",
    }
    country = "해외"
    for kw, cn in country_map.items():
        if kw in name:
            country = cn
            break

    return node_type, offshore, country


def _related_risk_level(offshore: str, risk_score: float) -> str:
    if offshore == "HIGH" or risk_score >= CFG.network.related_high_score:
        return "HIGH"
    if offshore == "MEDIUM" or risk_score >= CFG.network.related_medium_score:
        return "MEDIUM"
    return "LOW"


def _origin_risk(origin_code: str) -> str:
    if origin_code in _HIGH_RISK_ORIGINS:
        return "MEDIUM"
    if origin_code in _HUB_ORIGINS:
        return "MEDIUM"
    return "LOW"


# ── 알림 생성 ──────────────────────────────────────────────────────────────────

def _build_alerts(
    company: dict,
    related_name: Optional[str],
    related_type: str,
    offshore_level: str,
    related_country: str,
    origin_stats: list[dict],          # [{code, name, total_val, cnt, review_cnt}]
    total_import: float,
    bypass_risk: str,
) -> list[str]:
    alerts: list[str] = []
    risk_score = float(company.get("risk_score") or 0)
    fta_rate   = float(company.get("fta_reduction_rate") or 0)

    # 역외 관계법인
    if offshore_level == "HIGH":
        alerts.append(
            f"🔴 관계법인 소재지가 조세피난처 또는 역외 관할권 ({related_country}) — "
            "역외 자금 은닉·우회수입 구조 강하게 의심 (관세법 제30조 가산요소 검토)"
        )
    elif offshore_level == "MEDIUM":
        alerts.append(
            f"⚠️ 관계법인 소재지가 금융 허브 관할권 ({related_country}) — "
            "특수관계 거래가격 적정성 검토 필요 (관세법 제23조)"
        )
    elif offshore_level == "LOW" and related_name:
        alerts.append(
            f"ℹ️ 관계법인 소재지 {related_country} — 특수관계 여부 및 수수료·로열티 지급 여부 확인"
        )

    # 관계법인 소재국과 주요 수입국 일치
    if origin_stats:
        top_origin = origin_stats[0]
        top_country = top_origin["name"]
        if related_country != "해외" and related_country in top_country:
            alerts.append(
                f"⚠️ 최대 수입국({top_country})과 관계법인 소재국({related_country}) 일치 — "
                "이전가격 조작 및 관계법인 공급가격 적정성 검토 (관세법 제45조)"
            )

    # 단일 원산지 집중
    if total_import > 0 and origin_stats:
        top_val   = origin_stats[0]["total_val"]
        top_share = top_val / total_import * 100
        if top_share >= CFG.network.origin_concentration * 100:
            alerts.append(
                f"⚠️ 단일 원산지 집중: {origin_stats[0]['name']} {top_share:.0f}% — "
                "공급자 다변화 부재, 독점 공급 구조에서의 가격 조작 위험"
            )

    # 고위험 원산지 + FTA 고감면율
    high_risk_origins = [o for o in origin_stats if o["code"] in _HIGH_RISK_ORIGINS]
    if high_risk_origins and fta_rate >= CFG.network.fta_reduction_rate:
        codes = ", ".join(o["name"] for o in high_risk_origins)
        alerts.append(
            f"⚠️ 고위험 원산지({codes}) + FTA 감면율 {fta_rate:.1f}% — "
            "원산지 세탁·우회수출 의심, C/O 진위 및 실질 변형 요건 검토"
        )

    # 경유 허브 의심
    hub_origins = [o for o in origin_stats if o["code"] in _HUB_ORIGINS]
    if hub_origins:
        codes = ", ".join(o["name"] for o in hub_origins)
        alerts.append(
            f"ℹ️ 경유 허브 의심 원산지: {codes} — "
            "제3국 우회수출 가능성, 선하증권·원산지증명서 원본 대조 필요"
        )

    # 검토·조사 비율 높음
    total_cnt  = sum(o["cnt"] for o in origin_stats)
    review_cnt = sum(o["review_cnt"] for o in origin_stats)
    if total_cnt > 0 and review_cnt / total_cnt >= CFG.network.review_rate:
        alerts.append(
            f"🔴 신고 검토·조사 비율 {review_cnt}/{total_cnt}건 ({review_cnt/total_cnt*100:.0f}%) — "
            "반복 검토 패턴, 신고가격 근거서류 우선 확보 필요"
        )

    # 물류·유통 관계법인 → 서비스 대가 과세가격 영향
    if related_type in ("logistics", "trading") and related_name:
        alerts.append(
            f"ℹ️ {related_type.upper()} 성격의 관계법인({related_name}) — "
            "운임·수수료·서비스 대가가 과세가격 가산요소에 해당하는지 검토 (관세법 제30조 제1항)"
        )

    # 종합 고위험 조합
    if offshore_level in ("HIGH", "MEDIUM") and risk_score >= CFG.network.combined_risk_score:
        alerts.append(
            f"🔴 역외 관계법인 + 위험점수 {risk_score:.0f} — 즉각 조사 착수 권고"
        )

    if not alerts:
        alerts.append("ℹ️ 현재 DB 데이터 기준 특이 관계망 징후 없음 — 추가 외환거래 내역 확인 권고")

    return alerts


# ── 네트워크 동적 생성 ─────────────────────────────────────────────────────────

def _build_network(conn: duckdb.DuckDBPyConnection, company_id: str) -> dict:
    """DB 데이터를 바탕으로 관계망 노드·엣지·알림을 동적으로 생성한다."""

    # ── 기업 프로파일 ──────────────────────────────────────────────────────────
    cp = conn.execute("""
        SELECT company_name, industry_code, risk_level, risk_score,
               related_companies, customs_broker_firm,
               annual_import_amount, fta_reduction_rate,
               major_export_countries
        FROM company_profiles WHERE company_id = ?
    """, [company_id]).df()

    if cp.empty:
        return {"nodes": [], "edges": [], "alerts": ["기업 정보 없음"], "bypass_risk": "미확인", "offshore_risk": "미확인"}

    row = cp.iloc[0].to_dict()
    company_name  = row.get("company_name") or company_id
    related_name  = (row.get("related_companies") or "").strip() or None
    broker_name   = (row.get("customs_broker_firm") or "").strip() or None
    risk_score    = float(row.get("risk_score") or 0)
    total_import  = float(row.get("annual_import_amount") or 0)

    # ── 수입신고 원산지 집계 ───────────────────────────────────────────────────
    orig_df = conn.execute("""
        SELECT origin_country                                                     AS code,
               COUNT(*)                                                           AS cnt,
               SUM(declared_value)                                                AS total_val,
               SUM(CASE WHEN status IN ('REVIEW','INSPECT','HOLD') THEN 1 ELSE 0 END) AS review_cnt
        FROM import_declarations
        WHERE company_id = ?
        GROUP BY origin_country
        ORDER BY total_val DESC
        LIMIT 5
    """, [company_id]).df()

    origin_stats: list[dict] = []
    for _, o in orig_df.iterrows():
        code = str(o["code"])
        origin_stats.append({
            "code":       code,
            "name":       COUNTRY_NAMES.get(code, code),
            "total_val":  float(o["total_val"] or 0),
            "cnt":        int(o["cnt"]),
            "review_cnt": int(o["review_cnt"]),
        })

    # ── 관계법인 분류 ──────────────────────────────────────────────────────────
    related_type    = "affiliate"
    offshore_level  = "NONE"
    related_country = "해외"
    if related_name:
        related_type, offshore_level, related_country = _classify_related(related_name)

    # ── 노드 구성 ──────────────────────────────────────────────────────────────
    nodes: list[dict] = []

    # 1) 대상 기업
    nodes.append({
        "id":    company_id,
        "label": company_name,
        "type":  "subject",
        "risk":  row.get("risk_level") or "UNKNOWN",
        "meta":  f"위험점수 {risk_score:.0f} / 연수입 {total_import/1e8:.1f}억원",
    })

    # 2) 관계법인
    rel_id = None
    if related_name:
        rel_id    = f"REL-{company_id}"
        rel_risk  = _related_risk_level(offshore_level, risk_score)
        node_type_label = {
            "parent":    "모회사/지주사",
            "logistics": "물류·조달 법인",
            "trading":   "무역·중개 법인",
            "affiliate": "관계법인",
        }.get(related_type, "관계법인")
        nodes.append({
            "id":    rel_id,
            "label": related_name,
            "type":  related_type,
            "risk":  rel_risk,
            "meta":  f"{node_type_label} / 소재: {related_country}",
        })

    # 3) 공급자 노드 (상위 3개 원산지)
    supplier_ids: list[str] = []
    for o in origin_stats[:3]:
        sid   = f"SUPPLIER-{o['code']}"
        share = o["total_val"] / total_import * 100 if total_import else 0
        orisk = _origin_risk(o["code"])
        nodes.append({
            "id":    sid,
            "label": f"{o['name']} 공급처",
            "type":  "supplier",
            "risk":  orisk,
            "meta":  f"{o['cnt']}건 / {o['total_val']/1e8:.1f}억원 ({share:.0f}%)",
        })
        supplier_ids.append((sid, o))

    # 4) 관세사법인
    broker_id = None
    if broker_name:
        broker_id = f"BROKER-{company_id}"
        nodes.append({
            "id":    broker_id,
            "label": broker_name,
            "type":  "broker",
            "risk":  "LOW",
            "meta":  "통관 대리인",
        })

    # ── 엣지 구성 ─────────────────────────────────────────────────────────────
    edges: list[dict] = []

    # 관계법인 → 대상기업 (유형에 따라 방향 결정)
    if rel_id:
        if related_type == "parent":
            edges.append({
                "from":  rel_id,
                "to":    company_id,
                "label": "모회사 (지배)",
                "type":  "equity",
            })
        elif related_type in ("logistics", "trading"):
            edges.append({
                "from":  company_id,
                "to":    rel_id,
                "label": "수수료·용역 지급",
                "type":  "service",
            })
        else:
            edges.append({
                "from":  rel_id,
                "to":    company_id,
                "label": "관계법인",
                "type":  "equity",
            })

    # 공급자 → 대상기업
    for sid, o in supplier_ids:
        review_rate = o["review_cnt"] / o["cnt"] * 100 if o["cnt"] else 0
        flag = " ⚠️" if review_rate >= CFG.network.edge_review_rate * 100 else ""
        edges.append({
            "from":  sid,
            "to":    company_id,
            "label": f"수입 {o['cnt']}건{flag}",
            "type":  "trade",
        })

    # 대상기업 → 관세사
    if broker_id:
        edges.append({
            "from":  company_id,
            "to":    broker_id,
            "label": "통관 위임",
            "type":  "service",
        })

    # ── 알림 생성 ─────────────────────────────────────────────────────────────
    alerts = _build_alerts(
        company        = row,
        related_name   = related_name,
        related_type   = related_type,
        offshore_level = offshore_level,
        related_country= related_country,
        origin_stats   = origin_stats,
        total_import   = total_import,
        bypass_risk    = "",  # computed below
    )

    # 우회수입 / 역외 위험 종합 판정
    bypass_risk  = "높음" if any(o["code"] in _HUB_ORIGINS for o in origin_stats) else \
                   "중간" if any(o["code"] in _HIGH_RISK_ORIGINS for o in origin_stats) else "낮음"
    offshore_risk = {"HIGH": "높음", "MEDIUM": "중간", "LOW": "낮음", "NONE": "낮음"}.get(offshore_level, "미확인")

    return {
        "nodes":        nodes,
        "edges":        edges,
        "alerts":       alerts,
        "bypass_risk":  bypass_risk,
        "offshore_risk":offshore_risk,
        "origin_stats": origin_stats,
    }


# ── 에이전트 진입점 ────────────────────────────────────────────────────────────

def agent_network(state: CustomsState) -> CustomsState:
    if target_type(state) == "person":
        if not has_person_scope(state):
            return {**state, "network_result": no_target_result(state, "관계망분석")}

        person_id = target_id(state)
        print(f"[Agent] Neo4j 우범자 관계망 분석 시작: {person_id}")
        try:
            neo4j_result = build_person_network_report(person_id)
            if neo4j_result:
                print("[Agent] Neo4j 우범자 관계망 분석 완료")
                return {**state, "network_result": neo4j_result}
        except Neo4jGraphError as exc:
            print(f"[Agent] Neo4j 우범자 관계망 조회 실패: {exc}")

        result = "\n".join([
            "[관계망분석 결과]",
            f"- 우범자 `{person_id}`에 대한 Neo4j 관계망을 조회하지 못했습니다.",
            "- 우범자 관계망은 Neo4j 그래프 적재 후 조회 가능합니다.",
        ])
        return {**state, "network_result": result}
    """DB 기반으로 기업 관계망을 동적 생성하고 위험 징후를 분석한다."""
    if not has_company_scope(state):
        return {**state, "network_result": no_company_result("관계망분석")}

    company_id = state["company_id"]
    print(f"[Agent] 관계망 분석 시작: {company_id}")

    try:
        neo4j_result = build_company_network_report(company_id)
        if neo4j_result:
            print("[Agent] Neo4j 기업 관계망 분석 완료")
            return {**state, "network_result": neo4j_result}
    except Neo4jGraphError as exc:
        print(f"[Agent] Neo4j 기업 관계망 조회 실패, DuckDB fallback 사용: {exc}")

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        net = _build_network(conn, company_id)

    # ── 텍스트 보고서 구성 ─────────────────────────────────────────────────────
    company_node = next((n for n in net["nodes"] if n["type"] == "subject"), {})
    company_name = company_node.get("label", company_id)

    nodes_txt = "\n".join(
        f"  [{n['type'].upper():<10}] {n['label']:<35} 위험:{n['risk']:<7}  {n.get('meta','')}"
        for n in net["nodes"]
    )
    edges_txt = "\n".join(
        f"  {e['from']:<25} ──[{e['label']}]──▶ {e['to']:<25}  ({e['type']})"
        for e in net["edges"]
    )
    origin_txt = "\n".join(
        f"  {o['name']:<15} {o['cnt']:>3}건  {o['total_val']/1e8:>6.1f}억원  "
        f"검토·조사:{o['review_cnt']}건"
        for o in net["origin_stats"]
    ) if net["origin_stats"] else "  데이터 없음"

    lines = [
        "[관계망 분석 결과]",
        f"대상 기업: {company_name} ({company_id})",
        f"우회수입 위험: {net['bypass_risk']}  |  역외 자금 위험: {net['offshore_risk']}",
        "",
        "■ 수입 원산지 현황",
        origin_txt,
        "",
        "■ 관계망 노드",
        nodes_txt,
        "",
        "■ 관계망 엣지(연결)",
        edges_txt,
        "",
        "■ 위험 연결점 알림",
        *net["alerts"],
    ]
    raw_result = "\n".join(lines)

    if llm:
        try:
            network_data = (
                f"노드:\n{nodes_txt}\n\n"
                f"엣지:\n{edges_txt}\n\n"
                f"원산지:\n{origin_txt}\n\n"
                f"알림:\n" + "\n".join(net["alerts"])
            )
            analysis = llm.invoke(
                _LLM_PROMPT.format(network_data=network_data)
            ).content
            network_result = raw_result + "\n\n[AI 관계망 위험 분석]\n" + analysis
        except Exception as exc:
            print(f"[Agent] 관계망 LLM 분석 실패: {exc}")
            network_result = raw_result
    else:
        network_result = raw_result

    print("[Agent] 관계망 분석 완료")
    return {**state, "network_result": network_result}
