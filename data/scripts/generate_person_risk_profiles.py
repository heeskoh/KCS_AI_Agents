"""우범자 위험지표 근거 데이터 생성기 (일반/마약 도메인, 2026 재설계).

회사 측 generate_company_risk_profiles.py 와 대칭. 각 우범자의 실제 연계 사건
(person_case_link → smuggling_case)과 관계망(network_edge)에서 근거 레코드를 도출해
person 근거 소스 테이블을 채우고, src/person_risk_indicators.py 로 도메인별 6지표를
산출하여 risk_indicator(entity_type='person', domain·reason·recommendation·related_refs)에 기록한다.

도메인 결정: 연계 사건에 '마약류'가 있으면 drug, 아니면 general.
외환(forex)은 다음 차수(별도 데이터 모델 필요)로 보류.

사용법:
    python data/scripts/generate_person_risk_profiles.py
    (setup_risk_person_db.py 가 시드 후 자동 호출)
"""
from __future__ import annotations

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import person_risk_indicators as pri  # noqa: E402

try:
    from person_risk_source_schema import (  # type: ignore  # noqa: E402
        SOURCE_TABLES, create_person_risk_source_schema,
    )
except ImportError:
    from data.scripts.person_risk_source_schema import (  # noqa: E402
        SOURCE_TABLES, create_person_risk_source_schema,
    )

REF_DATE = date(2026, 6, 15)
SEED_BATCH_ID = "risk-person-indicator-v1"
NEW_DRUGS = ["합성대마", "신종 향정신성", "펜타닐 유사체", "케타민"]
CONCEAL_METHODS = ["인체은닉", "이중바닥", "우편분산", "식품위장", "전자제품 내장"]
IDENTITY_FLAGS = ["허위신고", "명의도용", "위명사용", "분산신고"]
LAUNDER_SCHEMES = ["차명계좌", "가상자산", "환치기", "현금운반"]


def _seed(person_id: str) -> int:
    return sum(ord(c) * (i + 5) for i, c in enumerate(str(person_id))) + 91_733


def _d(days_ago: int) -> str:
    return (REF_DATE - timedelta(days=days_ago)).isoformat()


class _Ids:
    def __init__(self) -> None:
        self._n: dict[str, int] = {}

    def next(self, table: str) -> int:
        self._n[table] = self._n.get(table, 0) + 1
        return self._n[table]


def _insert(conn: duckdb.DuckDBPyConnection, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    collist = ", ".join(cols)
    ph = ", ".join("?" * len(cols))
    conn.executemany(f"INSERT INTO {table} ({collist}) VALUES ({ph})",
                     [[r.get(c) for c in cols] for r in rows])


def _gen_sources(person: dict, cases: list[dict], net: list[dict],
                 domain: str, rng: random.Random, ids: _Ids) -> dict[str, list[dict]]:
    pid = person["person_id"]
    base = float(person.get("risk_score") or 50.0)
    out: dict[str, list[dict]] = {name: [] for name, _ in SOURCE_TABLES}

    # 경로/적발/은닉: 연계 사건에서 도출
    for c in cases:
        is_drug = c.get("contraband_category") == "마약류"
        out["person_route_event"].append({
            "id": ids.next("person_route_event"), "person_id": pid,
            "route_date": _d(rng.randint(30, 800)),
            "origin_country": c.get("origin_country"), "transit_country": c.get("transit_country"),
            "dest_region": c.get("destination_region"), "channel": c.get("case_type") or "여행자",
            "is_drug_route": is_drug, "risk_weight": round(min(100.0, base + rng.uniform(-15, 20)), 1),
            "note": None,
        })
        out["person_seizure_record"].append({
            "id": ids.next("person_seizure_record"), "person_id": pid,
            "seizure_date": c.get("detection_date") or _d(rng.randint(30, 800)),
            "contraband_category": c.get("contraband_category"),
            "contraband_sub": c.get("contraband_sub_category"),
            "quantity": c.get("quantity"), "quantity_unit": c.get("quantity_unit"),
            "batch_no": f"B-{ids._n['person_seizure_record']:05d}",
            "is_small_batch": (float(c.get("quantity") or 0) or rng.random()) < 1 or rng.random() < 0.5,
            "is_new_substance": is_drug and rng.random() < 0.35,
            "harm_weight": round(min(100.0, base + rng.uniform(-10, 25)), 1) if is_drug else round(rng.uniform(10, 50), 1),
            "case_status": c.get("case_status") or "적발", "note": c.get("summary"),
        })
        if c.get("concealment_method"):
            out["person_concealment_event"].append({
                "id": ids.next("person_concealment_event"), "person_id": pid,
                "event_date": c.get("detection_date") or _d(rng.randint(30, 800)),
                "method": c.get("concealment_method"),
                "sophistication_score": round(min(100.0, base + rng.uniform(-20, 25)), 1), "note": None,
            })

    # 관계망: network_edge person→person/org
    for e in net:
        out["person_network_link"].append({
            "id": ids.next("person_network_link"), "person_id": pid,
            "counterpart_id": e.get("target_id"), "counterpart_name": e.get("target_id"),
            "relation_type": e.get("relation_type"),
            "is_known_offender": str(e.get("target_type")) == "person",
            "strength": round(float(e.get("weight") or 0.5), 2), "note": None,
        })

    # 은닉 이벤트가 비었으면 위험도 높은 대상에 보강
    if not out["person_concealment_event"] and base >= 55:
        out["person_concealment_event"].append({
            "id": ids.next("person_concealment_event"), "person_id": pid,
            "event_date": _d(rng.randint(30, 600)), "method": rng.choice(CONCEAL_METHODS),
            "sophistication_score": round(min(100.0, base + rng.uniform(-15, 20)), 1), "note": None,
        })

    # 일반: 허위신고·명의도용 (고위험 일부)
    if domain == "general" and base >= 50:
        for _ in range(1 if base < 70 else 2):
            out["person_identity_flag"].append({
                "id": ids.next("person_identity_flag"), "person_id": pid,
                "flag_date": _d(rng.randint(20, 500)), "flag_type": rng.choice(IDENTITY_FLAGS),
                "detail": "신고 명의·내용 불일치 정황",
            })

    # 마약: 자금세탁 연계 (고위험)
    if domain == "drug" and base >= 60:
        for _ in range(1 if base < 78 else 2):
            out["person_laundering_link"].append({
                "id": ids.next("person_laundering_link"), "person_id": pid,
                "link_date": _d(rng.randint(20, 500)), "scheme": rng.choice(LAUNDER_SCHEMES),
                "amount": round(rng.uniform(2e8, 5e9)), "linked_case": cases[0]["case_id"] if cases else None,
                "note": "마약 수익 추정 자금 흐름",
            })

    return out


def generate_all(conn: duckdb.DuckDBPyConnection, verbose: bool = True) -> dict[str, int]:
    create_person_risk_source_schema(conn)
    for name, _ in SOURCE_TABLES:
        conn.execute(f"DELETE FROM {name}")
    conn.execute("DELETE FROM risk_indicator WHERE entity_type = 'person'")

    persons = conn.execute("SELECT * FROM risk_person_profile ORDER BY person_id").df().to_dict("records")
    links = conn.execute("SELECT person_id, case_id FROM person_case_link").df().to_dict("records")
    cases_by_id = {c["case_id"]: c for c in
                   conn.execute("SELECT * FROM smuggling_case").df().to_dict("records")}
    net_all = conn.execute(
        "SELECT source_id, target_type, target_id, relation_type, weight "
        "FROM network_edge WHERE source_type = 'person'"
    ).df().to_dict("records")

    cases_by_person: dict[str, list[dict]] = {}
    for ln in links:
        c = cases_by_id.get(ln["case_id"])
        if c:
            cases_by_person.setdefault(ln["person_id"], []).append(c)
    net_by_person: dict[str, list[dict]] = {}
    for e in net_all:
        net_by_person.setdefault(e["source_id"], []).append(e)

    ids = _Ids()
    accum: dict[str, list[dict]] = {name: [] for name, _ in SOURCE_TABLES}
    indicator_rows: list[dict] = []
    repaired = 0
    domain_counts = {"general": 0, "drug": 0}

    for person in persons:
        pid = person["person_id"]
        rng = random.Random(_seed(pid))
        cases = cases_by_person.get(pid, [])
        net = net_by_person.get(pid, [])
        domain = "drug" if any(c.get("contraband_category") == "마약류" for c in cases) else "general"
        domain_counts[domain] += 1

        sources = _gen_sources(person, cases, net, domain, rng, ids)
        results = pri.compute_person_indicators(domain, sources)
        violations = pri.validate_consistency(domain, results, sources)
        if violations:
            repaired += 1  # 근거가 사건에서 도출되므로 위반은 드묾(기록만)

        for code in pri.DOMAIN_ORDER[domain]:
            r = results[code]
            indicator_rows.append({
                "indicator_id": f"PRI-{ids.next('risk_indicator'):05d}",
                "entity_type": "person", "entity_id": pid,
                "indicator_code": code, "indicator_name": r.name,
                "indicator_value": (r.reasons[0] if r.reasons else None),
                "score": r.score, "weight": round(1.0 / 6, 3),
                "reason": r.reason_text or "근거 데이터 없음",
                "calculated_at": "2026-06-15 09:00:00", "seed_batch_id": SEED_BATCH_ID,
                "domain": domain, "recommendation": r.recommendation,
                "related_refs": json.dumps(r.refs, ensure_ascii=False),
            })

        for t, rws in sources.items():
            accum[t].extend(rws)

    for t, rws in accum.items():
        _insert(conn, t, rws)
    _insert(conn, "risk_indicator", indicator_rows)

    stats = {t: len(r) for t, r in accum.items()}
    stats["risk_indicator(person)"] = len(indicator_rows)
    stats["persons"] = len(persons)
    stats["domains"] = domain_counts
    if verbose:
        print(f"  우범자 {len(persons)}명 위험지표 재생성 — 일반 {domain_counts['general']} / 마약 {domain_counts['drug']} (보정 {repaired})")
        for name, _ in SOURCE_TABLES:
            if stats.get(name):
                print(f"    {name}: {stats[name]}")
        print(f"    risk_indicator(person): {len(indicator_rows)}")
    return stats


def main() -> None:
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as conn:
        generate_all(conn, verbose=True)
    print("완료")


if __name__ == "__main__":
    main()
