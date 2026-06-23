"""외환수사(forex) 우범자·역외법인 샘플 데이터 생성기 (2026 신규).

설계 정의서 docs/investigation_network_analysis_model.md §7 [결정 (a)] 반영:
  - 외환 우범자 20명 (RP-FX-0001~RP-FX-0020)
  - 역외법인 8개 (RO-OFF-001~RO-OFF-008)
  - 외환 6지표(fx_*) 근거 소스(person_fx_transaction/asset_flight/offshore_link/virtual_asset_flow)
  - 사건·관계망·분석결과 + 증거파일(data/evidence/RP-FX-XXXX/*.json)

기존 일반/마약 100명 시드(seed_batch_id="risk-person-sample-v1")와 분리된 별도 배치
(seed_batch_id="risk-forex-sample-v1")로, 멱등 재실행 가능하다. 외환 지표는 본 스크립트가
직접 src/person_risk_indicators.py 로 산출하므로 generate_person_risk_profiles 에 의존하지 않는다.

사용법:
    python data/scripts/setup_forex_risk_db.py
    (setup_risk_person_db.py 이후 실행 권장 — 같은 risk_person_profile 풀에 추가)
"""
from __future__ import annotations

import hashlib
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
EVIDENCE_DIR = PROJECT_ROOT / "data" / "evidence"
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

SEED_BATCH_ID = "risk-forex-sample-v1"
FOREX_PROFILE_TYPE = "외환사범"  # generate_person_risk_profiles 가 forex 대상을 식별하는 마커
REF_DATE = date(2026, 6, 15)
N_PERSONS = 20
N_OFFSHORE = 8

OFFSHORE_JURIS = ["BVI", "케이맨", "홍콩", "싱가포르", "라부안", "파나마"]
FX_COUNTRIES = ["홍콩", "중국", "싱가포르", "미국", "일본", "베트남", "UAE"]
REGIONS = ["서울", "인천", "부산", "경기", "대구"]
OCCUPATIONS = ["무역업", "자산운용", "환전상", "귀금속도매", "부동산임대", "IT사업"]
VA_ASSETS = ["BTC", "ETH", "USDT"]
FX_CASE_TYPES = ["재산국외도피", "불법송금", "가상자산거래", "차명송금"]
FX_SUB = {"재산국외도피": "허위무역대금", "불법송금": "환치기", "가상자산거래": "USDT 환전", "차명송금": "차명 분산"}


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def risk_level(score: float) -> str:
    if score >= 85:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 45:
        return "MEDIUM"
    return "LOW"


def _d(rng: random.Random, lo: int, hi: int) -> date:
    return REF_DATE - timedelta(days=rng.randint(lo, hi))


def _insert(conn: duckdb.DuckDBPyConnection, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    collist = ", ".join(cols)
    ph = ", ".join("?" * len(cols))
    conn.executemany(f"INSERT INTO {table} ({collist}) VALUES ({ph})",
                     [[r.get(c) for c in cols] for r in rows])


def clear_seed(conn: duckdb.DuckDBPyConnection) -> None:
    # seed_batch_id 기반 본체 테이블 정리
    for table in ("analysis_result", "risk_indicator", "network_edge", "person_case_link",
                  "smuggling_case", "risk_org_profile", "risk_person_profile"):
        conn.execute(f"DELETE FROM {table} WHERE seed_batch_id = ?", [SEED_BATCH_ID])
    # 외환 우범자(RP-FX-)의 근거 소스 레코드 정리
    fx_persons = [r[0] for r in conn.execute(
        "SELECT person_id FROM risk_person_profile WHERE person_id LIKE 'RP-FX-%'").fetchall()]
    if fx_persons:
        ph = ",".join("?" * len(fx_persons))
        for name, _ in SOURCE_TABLES:
            cols = {row[1] for row in conn.execute(f"PRAGMA table_info('{name}')").fetchall()}
            if "person_id" in cols:
                conn.execute(f"DELETE FROM {name} WHERE person_id IN ({ph})", fx_persons)


def build(conn: duckdb.DuckDBPyConnection) -> dict[str, int]:
    create_person_risk_source_schema(conn)
    clear_seed(conn)
    now = datetime.now().replace(microsecond=0)

    persons, orgs, cases, links, edges, sources, analyses = [], [], [], [], [], [], []
    fx_txn, asset_flight, offshore_link, va_flow = [], [], [], []
    indicator_rows = []
    seq = {"fx": 0, "af": 0, "off": 0, "va": 0, "ri": 0}

    # ── 역외법인 8개 ──────────────────────────────────────────────────────────
    org_rng = random.Random(7_0001)
    for k in range(1, N_OFFSHORE + 1):
        org_id = f"RO-OFF-{k:03d}"
        juris = OFFSHORE_JURIS[(k - 1) % len(OFFSHORE_JURIS)]
        orgs.append({
            "org_id": org_id, "org_name": f"{juris} 역외법인{k:02d}",
            "business_no_hash": digest(f"biz-{org_id}"), "org_type": "역외법인",
            "industry_code": org_rng.choice(["K64", "K66", "M70"]), "country": juris,
            "address_region": "해외", "risk_score": round(org_rng.uniform(60, 92), 1),
            "risk_tags": "페이퍼컴퍼니, 조세회피처", "watch_status": "조사중",
            "seed_batch_id": SEED_BATCH_ID, "created_at": now, "updated_at": now,
        })

    # ── 외환 우범자 20명 ─────────────────────────────────────────────────────
    for i in range(1, N_PERSONS + 1):
        pid = f"RP-FX-{i:04d}"
        rng = random.Random(50_000 + i)
        region = rng.choice(REGIONS)
        score = round(min(99.0, rng.uniform(52, 95)), 1)
        level = risk_level(score)
        persons.append({
            "person_id": pid, "profile_type": FOREX_PROFILE_TYPE,
            "name": f"외환우범자{i:03d}", "name_aliases": f"FX-Alias-{i:03d}",
            "birth_date": date(rng.randint(1965, 1995), rng.randint(1, 12), rng.randint(1, 28)),
            "gender": rng.choice(["남", "여"]), "nationality": rng.choice(["대한민국", "중국", "미국"]),
            "id_doc_type": "주민등록", "id_doc_hash": digest(f"id-{pid}"),
            "phone_hash": digest(f"010-fx-{i:04d}"), "email_hash": digest(f"fx{i}@example.invalid"),
            "address_region": region, "occupation": rng.choice(OCCUPATIONS),
            "risk_level": level, "risk_score": score,
            "risk_tags": "외환, " + rng.choice(["환치기", "재산도피", "가상자산", "차명거래"]),
            "watch_status": rng.choice(["조사중", "관찰중", "첩보확인"]),
            "seed_batch_id": SEED_BATCH_ID, "created_at": now, "updated_at": now,
        })

        # 연계 사건 1~2건
        n_case = rng.randint(1, 2)
        person_cases = []
        for h in range(1, n_case + 1):
            case_id = f"SC-FX-{i:04d}-{h:02d}"
            ctype = rng.choice(FX_CASE_TYPES)
            dest = rng.choice(FX_COUNTRIES)
            dt = _d(rng, 30, 900)
            est = round(rng.uniform(3e8, 8e10), -4)
            cases.append({
                "case_id": case_id, "case_no": f"FX-2026-{i:04d}-{h:02d}", "case_type": ctype,
                "contraband_category": "외환사범", "contraband_sub_category": FX_SUB[ctype],
                "case_status": rng.choice(["첩보", "조사중", "송치"]), "detection_date": dt,
                "detection_channel": rng.choice(["FIU 통보", "외환검사", "수사첩보", "국제공조"]),
                "origin_country": "대한민국", "transit_country": rng.choice(["없음", "홍콩", "싱가포르"]),
                "destination_region": dest, "modus_operandi": FX_SUB[ctype],
                "concealment_method": rng.choice(["가장무역", "차명계좌", "분할송금", "역외경유"]),
                "quantity": None, "quantity_unit": None, "estimated_value": est,
                "lead_agency": rng.choice(["조사국 외환조사과", "서울세관 외환조사", "관세청 국제조사"]),
                "summary": f"{ctype} 관련 {dest} 경유 자금흐름 이상 샘플 사건",
                "seed_batch_id": SEED_BATCH_ID, "created_at": now, "updated_at": now,
            })
            person_cases.append({"case_id": case_id, "dest": dest})
            links.append({
                "link_id": f"PCL-FX-{i:04d}-{h:02d}", "person_id": pid, "case_id": case_id,
                "role_in_case": rng.choice(["자금책", "실소유주", "차명인", "송금책"]),
                "is_cargo_owner": False, "confidence_score": round(rng.uniform(0.6, 0.97), 2),
                "evidence_level": rng.choice(["확정", "강함", "중간"]),
                "source_id": f"EV-FX-{i:04d}-{h:02d}", "seed_batch_id": SEED_BATCH_ID, "created_at": now,
            })
            edges.append({
                "edge_id": f"NE-FXCASE-{i:04d}-{h:02d}", "source_type": "person", "source_id": pid,
                "target_type": "case", "target_id": case_id, "relation_type": "외환사건",
                "weight": round(rng.uniform(0.6, 1.0), 2), "confidence_score": round(rng.uniform(0.6, 0.95), 2),
                "first_seen_at": dt - timedelta(days=rng.randint(10, 120)), "last_seen_at": dt,
                "source_id_ref": f"EV-FX-{i:04d}-{h:02d}", "seed_batch_id": SEED_BATCH_ID, "created_at": now,
            })

        # 연계 역외법인(1~2개) — 자금 증거(FUNDS_FLOW)와 offshore_link 양쪽에서 재사용
        n_off = rng.randint(1, 2)
        linked_orgs = org_rng_sample(i, n_off)

        # ── 근거 소스: person_fx_transaction + 금융증거(FUNDS_FLOW용 상대 연결) ──
        comm_records, fin_records = [], []
        n_txn = rng.randint(4, 9)
        for _ in range(n_txn):
            seq["fx"] += 1
            cc = rng.choice(FX_COUNTRIES)
            amt = round(rng.uniform(1e7, 9e8), -3)
            is_hawala = rng.random() < 0.45
            is_struct = rng.random() < 0.4
            is_nominee = rng.random() < 0.35
            channel = "환치기" if is_hawala else ("차명" if is_nominee else ("분산" if is_struct else "정식송금"))
            tdt = _d(rng, 10, 1000)
            fx_txn.append({
                "id": seq["fx"], "person_id": pid, "txn_date": tdt, "amount": amt,
                "direction": "송금", "channel": channel, "counterpart_country": cc,
                "counterpart_name": f"{cc} 수취계좌", "is_structured": is_struct,
                "is_nominee": is_nominee, "is_hawala": is_hawala, "note": None,
            })
            # 송금의 약 60%는 연계 역외법인 계좌로 — 등록 엔티티이므로 FUNDS_FLOW 엣지 형성
            cp_org = rng.choice(linked_orgs) if (linked_orgs and rng.random() < 0.6) else None
            fin_records.append({
                "txn_date": tdt.isoformat(), "txn_type": "해외송금", "direction": "이체",
                "amount": amt, "counterpart_country": cc,
                "counterpart_org_id": cp_org, "counterpart_person_id": None,
                "channel": channel, "note": f"{channel} 의심 해외송금"
                + (f" → {cp_org}" if cp_org else ""),
            })

        # ── person_offshore_link (위 연계 역외법인 재사용) ─────────────────
        for oid in linked_orgs:
            seq["off"] += 1
            org = next(o for o in orgs if o["org_id"] == oid)
            offshore_link.append({
                "id": seq["off"], "person_id": pid, "entity_name": org["org_name"],
                "jurisdiction": org["country"], "is_paper": rng.random() < 0.7,
                "ownership_pct": round(rng.uniform(30, 100), 1), "note": "실소유 의심",
            })
            edges.append({
                "edge_id": f"NE-FXOFF-{pid}-{oid}", "source_type": "person", "source_id": pid,
                "target_type": "org", "target_id": oid, "relation_type": "역외법인지배",
                "weight": round(rng.uniform(0.5, 0.95), 2), "confidence_score": round(rng.uniform(0.5, 0.9), 2),
                "first_seen_at": _d(rng, 200, 1200), "last_seen_at": _d(rng, 10, 199),
                "source_id_ref": None, "seed_batch_id": SEED_BATCH_ID, "created_at": now,
            })

        # ── person_asset_flight (고위험 일부) ───────────────────────────────
        if score >= 60:
            for _ in range(rng.randint(1, 2)):
                seq["af"] += 1
                dest = rng.choice(FX_COUNTRIES)
                asset_flight.append({
                    "id": seq["af"], "person_id": pid, "event_date": _d(rng, 20, 800),
                    "asset_type": rng.choice(["현금", "부동산", "증권", "귀금속"]),
                    "amount": round(rng.uniform(5e8, 5e10), -4), "dest_country": dest,
                    "method": rng.choice(["허위무역대금", "가장거래", "직접반출"]), "note": None,
                })

        # ── person_virtual_asset_flow ───────────────────────────────────────
        if rng.random() < 0.7:
            for _ in range(rng.randint(1, 3)):
                seq["va"] += 1
                va_flow.append({
                    "id": seq["va"], "person_id": pid, "txn_date": _d(rng, 10, 700),
                    "asset": rng.choice(VA_ASSETS), "amount_krw": round(rng.uniform(2e7, 2e9), -3),
                    "wallet": digest(f"wallet-{pid}-{seq['va']}")[:16],
                    "exchange": rng.choice(["해외거래소", "P2P", "OTC데스크"]),
                    "dest_country": rng.choice(FX_COUNTRIES), "note": None,
                })

        # ── 차명/공범 인물 관계 (외환 우범자 또는 기존 RP 풀) ──────────────
        if i > 1 and rng.random() < 0.6:
            cp = f"RP-FX-{rng.randint(1, i - 1):04d}"
            edges.append({
                "edge_id": f"NE-FXPP-{i:04d}", "source_type": "person", "source_id": pid,
                "target_type": "person", "target_id": cp,
                "relation_type": rng.choice(["차명", "공범", "송금관계"]),
                "weight": round(rng.uniform(0.4, 0.92), 2), "confidence_score": round(rng.uniform(0.5, 0.9), 2),
                "first_seen_at": _d(rng, 100, 800), "last_seen_at": _d(rng, 5, 99),
                "source_id_ref": None, "seed_batch_id": SEED_BATCH_ID, "created_at": now,
            })
            comm_records.append({
                "timestamp": (REF_DATE - timedelta(days=rng.randint(5, 300))).isoformat(),
                "record_type": "메신저", "direction": rng.choice(["수신", "발신"]),
                "counterpart_person_id": cp, "message_preview": "[샘플] 송금 분할·계좌 관련 협의",
                "note": "외환사범 공범 연락 정황",
            })

        # ── 외환 6지표 산출 ─────────────────────────────────────────────────
        ctx = {
            "person_fx_transaction": [t for t in fx_txn if t["person_id"] == pid],
            "person_asset_flight": [a for a in asset_flight if a["person_id"] == pid],
            "person_offshore_link": [o for o in offshore_link if o["person_id"] == pid],
            "person_virtual_asset_flow": [v for v in va_flow if v["person_id"] == pid],
        }
        results = pri.compute_person_indicators("forex", ctx)
        for code in pri.DOMAIN_ORDER["forex"]:
            r = results[code]
            seq["ri"] += 1
            indicator_rows.append({
                "indicator_id": f"PRI-FX-{seq['ri']:05d}", "entity_type": "person", "entity_id": pid,
                "indicator_code": code, "indicator_name": r.name,
                "indicator_value": (r.reasons[0] if r.reasons else None), "score": r.score,
                "weight": round(1.0 / 6, 3), "reason": r.reason_text or "근거 데이터 없음",
                "calculated_at": "2026-06-15 09:00:00", "seed_batch_id": SEED_BATCH_ID,
                "domain": "forex", "recommendation": r.recommendation,
                "related_refs": json.dumps(r.refs, ensure_ascii=False),
            })

        # ── 분석결과 ────────────────────────────────────────────────────────
        analyses.append({
            "analysis_id": f"AR-FX-{i:04d}", "entity_type": "person", "entity_id": pid,
            "analysis_type": "외환프로파일링", "model_or_agent": "forex_risk_agent",
            "input_summary": "해외송금·역외법인·가상자산·차명거래 근거 입력",
            "output_summary": f"{level} 위험군. 환치기·재산도피 자금흐름 우선 추적 필요.",
            "risk_score_before": round(max(0, score - 8), 1), "risk_score_after": score,
            "explanation": "해외송금 규모·환치기·역외 페이퍼·가상자산·차명거래 가중치 종합",
            "review_status": "미검토", "seed_batch_id": SEED_BATCH_ID, "created_at": now,
            "linked_case_id": person_cases[0]["case_id"] if person_cases else None,
        })

        # ── 증거파일 생성 ───────────────────────────────────────────────────
        _write_evidence(pid, fin_records, comm_records)

    # ── 일괄 적재 ─────────────────────────────────────────────────────────────
    _insert(conn, "risk_org_profile", orgs)
    _insert(conn, "risk_person_profile", persons)
    _insert(conn, "smuggling_case", cases)
    _insert(conn, "person_case_link", links)
    _insert(conn, "network_edge", edges)
    _insert(conn, "person_fx_transaction", fx_txn)
    _insert(conn, "person_asset_flight", asset_flight)
    _insert(conn, "person_offshore_link", offshore_link)
    _insert(conn, "person_virtual_asset_flow", va_flow)
    _insert(conn, "risk_indicator", indicator_rows)
    _insert(conn, "analysis_result", analyses)

    return {
        "risk_person_profile(forex)": len(persons), "risk_org_profile(offshore)": len(orgs),
        "smuggling_case": len(cases), "person_case_link": len(links), "network_edge": len(edges),
        "person_fx_transaction": len(fx_txn), "person_asset_flight": len(asset_flight),
        "person_offshore_link": len(offshore_link), "person_virtual_asset_flow": len(va_flow),
        "risk_indicator(forex)": len(indicator_rows), "analysis_result": len(analyses),
    }


def org_rng_sample(person_idx: int, n: int) -> list[str]:
    rng = random.Random(900 + person_idx)
    return [f"RO-OFF-{k:03d}" for k in rng.sample(range(1, N_OFFSHORE + 1), n)]


def _write_evidence(pid: str, fin_records: list[dict], comm_records: list[dict]) -> None:
    pdir = EVIDENCE_DIR / pid
    pdir.mkdir(parents=True, exist_ok=True)
    fin = {
        "evidence_id": f"EV-SEIZED-{pid}-FIN", "subject_person_id": pid,
        "account": {"bank": "샘플은행", "account_no_masked": f"110-***-{pid[-4:]}"},
        "records": fin_records,
    }
    (pdir / "financial_transaction_record.json").write_text(
        json.dumps(fin, ensure_ascii=False, indent=2), encoding="utf-8")
    if comm_records:
        comm = {
            "evidence_id": f"EV-SEIZED-{pid}-COMM", "subject_person_id": pid,
            "device": {"device_type": "스마트폰", "seized_date": "2026-06-15",
                       "extraction_tool": "Cellebrite UFED"},
            "records": comm_records,
        }
        (pdir / "communication_record.json").write_text(
            json.dumps(comm, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as conn:
        stats = build(conn)
    print("외환(forex) 샘플 생성 완료")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
