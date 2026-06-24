"""[Phase 3] 지표 산출 완성 — 회사 범죄위험률 + 개인 2계층 지표.

A) 회사: 수사대상(investigation/both)에 범죄위험률(customs/drug/forex_crime_rate) 부여하고
   종합 risk_score 를 6위험률+범죄율 혼합으로 갱신. audit 기업은 6위험률만(범죄율 NULL).
B) 개인: 2계층 지표 산출 → person_risk_scores
   - Tier1 통관 베이스(undervaluation/hs/origin/offshore): 관세계열 개인 신고서 기반(그 외 약함)
   - Tier2 범죄위험률: 도메인 6지표(src.person_risk_indicators) 집계
   그리고 risk_indicator(person) 에 도메인 6지표 상세 기록(프로파일 표시용).

선행: Phase 2a/2b 근거 + generate_company_risk_profiles(6위험률) 완료 상태.
사용법: python data/scripts/compute_indicators_v2.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
SEED_BATCH_ID = "risk-model-v2"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from src import person_risk_indicators as pri  # noqa: E402

ENGINE_DOMAIN = {"customs": "general", "drug": "drug", "forex": "forex"}
CRIME_DOMAIN_COL = {"customs": "customs_crime_rate", "drug": "drug_crime_rate", "forex": "forex_crime_rate"}
PERSON_EVID = [
    "person_route_event", "person_seizure_record", "person_concealment_event",
    "person_identity_flag", "person_laundering_link", "person_network_link",
    "person_fx_transaction", "person_asset_flight", "person_offshore_link",
    "person_virtual_asset_flow",
]
TIER1_NAMES = {
    "undervaluation_suspicion_rate": "저가신고 의심률",
    "hs_classification_error_rate": "HS 분류 오류율",
    "origin_misuse_suspicion_rate": "원산지 오용 의심률",
    "offshore_fund_concealment_suspicion_rate": "역외자금 은닉 의심률",
}


def _clamp(x):
    return round(max(0.0, min(100.0, x)), 1)


def _level(score):
    return "CRITICAL" if score >= 85 else "HIGH" if score >= 70 else "MEDIUM" if score >= 50 else "LOW"


# ── A) 회사 범죄위험률 ────────────────────────────────────────────────────────
def company_crime_rates(con):
    rows = con.execute(
        """SELECT s.company_id, s.risk_score AS six_avg,
                  s.undervaluation_suspicion_rate u, s.fta_origin_misuse_suspicion_rate fta,
                  s.hs_classification_error_rate hs, s.offshore_fund_concealment_suspicion_rate offr,
                  c.entity_role, c.primary_domain, c.crime_types
           FROM import_risk_scores s JOIN company_profiles c USING (company_id)"""
    ).df().to_dict("records")
    updated = 0
    for r in rows:
        role, dom = r["entity_role"], r["primary_domain"]
        crimes = [x for x in str(r["crime_types"] or "").split(",") if x]
        ccr = dcr = fcr = None
        new_overall = r["six_avg"]
        if role in ("investigation", "both") and crimes:
            base = max(r["six_avg"], 60.0)  # 수사대상 기본 심각도
            ncrime = len(crimes)
            if dom == "customs":
                ccr = _clamp(0.5 * base + 0.5 * max(r["u"], r["fta"], r["hs"]) + 4 * ncrime)
            elif dom == "forex":
                fcr = _clamp(0.5 * base + 0.5 * r["offr"] + 6 * ncrime)
            elif dom == "drug":
                dcr = _clamp(0.6 * base + 8 * ncrime)   # 기업 직접 마약근거는 연계인물(Phase4)
            domain_rate = next(v for v in (ccr, dcr, fcr) if v is not None)
            new_overall = _clamp(0.4 * r["six_avg"] + 0.6 * domain_rate)
        con.execute(
            "UPDATE import_risk_scores SET customs_crime_rate=?, drug_crime_rate=?, forex_crime_rate=?, "
            "risk_level=?, risk_score=? WHERE company_id=?",
            [ccr, dcr, fcr, _level(new_overall), new_overall, r["company_id"]],
        )
        updated += 1
    return updated


# ── B) 개인 2계층 ─────────────────────────────────────────────────────────────
def _person_benchmark(con):
    rows = con.execute(
        "SELECT hs_code, AVG(declared_value) FROM import_declarations "
        "WHERE importer_person_id IS NOT NULL AND hs_code IS NOT NULL GROUP BY hs_code"
    ).fetchall()
    return {hs: float(a) for hs, a in rows}


def _tier1(con, pid, bench, decls_by_person, off_count):
    """개인 통관 베이스: 신고서 저가갭 + 신호(hs/origin) + 역외링크."""
    decls = decls_by_person.get(pid, [])
    # undervaluation
    by_hs = {}
    sig = None
    for d in decls:
        if d.get("hs_code") and d.get("declared_value"):
            by_hs.setdefault(d["hs_code"], []).append(float(d["declared_value"]))
        sig = sig or d.get("crime_signal")
    gw, w = 0.0, 0
    for hs, vals in by_hs.items():
        b = bench.get(hs)
        if not b:
            continue
        avg = sum(vals) / len(vals)
        below = max(0.0, (b - avg) / b * 100.0)
        gw += below * len(vals)
        w += len(vals)
    under = _clamp((gw / w) * 1.4) if w else 0.0
    hs_rate = 60.0 if sig == "ip_hs" else (20.0 if decls else 0.0)
    origin_rate = 60.0 if sig == "fta_misuse" else (15.0 if decls else 0.0)
    offshore = _clamp(off_count * 18)
    return {
        "undervaluation_suspicion_rate": under,
        "hs_classification_error_rate": _clamp(hs_rate),
        "origin_misuse_suspicion_rate": _clamp(origin_rate),
        "offshore_fund_concealment_suspicion_rate": offshore,
    }


def person_indicators(con):
    persons = con.execute(
        "SELECT person_id, primary_domain, crime_types FROM risk_person_profile ORDER BY person_id"
    ).df().to_dict("records")
    bench = _person_benchmark(con)
    decls_all = con.execute(
        "SELECT importer_person_id pid, hs_code, declared_value, crime_signal "
        "FROM import_declarations WHERE importer_person_id IS NOT NULL"
    ).df().to_dict("records")
    decls_by_person = {}
    for d in decls_all:
        decls_by_person.setdefault(d["pid"], []).append(d)
    # 개인 근거 로드 (도메인 지표 ctx)
    evid = {}
    for t in PERSON_EVID:
        for row in con.execute(f"SELECT * FROM {t}").df().to_dict("records"):
            evid.setdefault(row["person_id"], {}).setdefault(t, []).append(row)
    off_count = {pid: len(v.get("person_offshore_link", [])) for pid, v in evid.items()}

    con.execute("DELETE FROM person_risk_scores")
    con.execute("DELETE FROM risk_indicator WHERE entity_type='person'")
    score_rows, ind_rows = [], []
    sid = 0
    for p in persons:
        pid, dom = p["person_id"], p["primary_domain"]
        edom = ENGINE_DOMAIN[dom]
        ctx = evid.get(pid, {})
        res = pri.compute_person_indicators(edom, ctx)
        codes = pri.DOMAIN_ORDER[edom]
        scores6 = [res[c].score for c in codes]
        top3 = sorted(scores6, reverse=True)[:3]
        # max 우세 집계: 단일 강지표 죄종도 해당 영역 위험을 제대로 반영(희석 방지)
        crime_rate = _clamp(max(0.45 * (sum(scores6) / 6) + 0.55 * (sum(top3) / len(top3)),
                                0.9 * max(scores6)))
        tier1 = _tier1(con, pid, bench, decls_by_person, off_count.get(pid, 0))
        # 종합은 범죄위험률 주도 + 통관베이스 가산(범죄자는 신고서 없어도 위험 유지)
        overall = _clamp(0.85 * crime_rate + 0.15 * (sum(tier1.values()) / 4))
        sid += 1
        score_rows.append({
            "id": sid, "person_id": pid, "risk_level": _level(overall), "risk_score": overall,
            **tier1,
            "customs_crime_rate": crime_rate if dom == "customs" else None,
            "drug_crime_rate": crime_rate if dom == "drug" else None,
            "forex_crime_rate": crime_rate if dom == "forex" else None,
            "generated_at": "2026-06-15 09:00:00", "seed_batch_id": SEED_BATCH_ID,
        })
        for c in codes:
            r = res[c]
            ind_rows.append({
                "indicator_id": f"PV2-{sid:04d}-{c}", "entity_type": "person", "entity_id": pid,
                "indicator_code": c, "indicator_name": r.name,
                "indicator_value": (r.reasons[0] if r.reasons else None), "score": r.score,
                "weight": round(1 / 6, 3), "reason": r.reason_text or "근거 데이터 없음",
                "calculated_at": "2026-06-15 09:00:00", "seed_batch_id": SEED_BATCH_ID,
                "domain": edom, "recommendation": r.recommendation,
                "related_refs": json.dumps(r.refs, ensure_ascii=False),
            })
    for tbl, rows in [("person_risk_scores", score_rows), ("risk_indicator", ind_rows)]:
        if rows:
            cols = list(rows[0].keys())
            ph = ", ".join("?" * len(cols))
            con.executemany(f"INSERT INTO {tbl} ({', '.join(cols)}) VALUES ({ph})",
                            [[r.get(c) for c in cols] for r in rows])
    return len(score_rows), len(ind_rows)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        n_comp = company_crime_rates(con)
        n_pscore, n_pind = person_indicators(con)
        # 표시용 마스터 점수 동기화(그래프·프로파일은 마스터 risk_score를 읽음)
        con.execute("""UPDATE risk_person_profile p SET risk_score=s.risk_score, risk_level=s.risk_level
                       FROM person_risk_scores s WHERE p.person_id=s.person_id""")
        con.execute("""UPDATE company_profiles c SET risk_score=s.risk_score, risk_level=s.risk_level
                       FROM import_risk_scores s WHERE c.company_id=s.company_id""")
        # 검증 샘플
        cs = con.execute(
            "SELECT s.company_id, c.entity_role, c.primary_domain, s.risk_score, "
            "s.customs_crime_rate, s.drug_crime_rate, s.forex_crime_rate "
            "FROM import_risk_scores s JOIN company_profiles c USING(company_id) "
            "WHERE s.company_id IN ('C-1001','C-2001','C-2013','C-2022') ORDER BY s.company_id"
        ).fetchall()
        ps = con.execute(
            "SELECT p.person_id, rp.primary_domain, p.risk_score, p.undervaluation_suspicion_rate, "
            "p.customs_crime_rate, p.drug_crime_rate, p.forex_crime_rate "
            "FROM person_risk_scores p JOIN risk_person_profile rp USING(person_id) "
            "WHERE p.person_id IN ('RP-0001','RP-0035','RP-FX-0001') ORDER BY p.person_id"
        ).fetchall()
    print("[Phase 3] 지표 산출 완성")
    print(f"  회사 갱신: {n_comp} / person_risk_scores: {n_pscore} / risk_indicator(person): {n_pind}")
    print("  회사 표본 (id,role,dom,종합,관세율,마약율,외환율):")
    for r in cs:
        print("   ", r)
    print("  개인 표본 (id,dom,종합,Tier1저가,관세율,마약율,외환율):")
    for r in ps:
        print("   ", r)


if __name__ == "__main__":
    main()
