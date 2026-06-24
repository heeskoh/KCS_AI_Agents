"""[Phase 2a] 신고서·이벤트 생성 (죄종 신호 주입) — 전면 재생성·멱등.

대상(Phase 1 마스터)별로 수입신고서/반입이벤트를 생성하고, 죄종에 맞는 신호를 심어
Phase 3 위험률 산출의 1차 근거를 만든다.

  - 기업: import_declarations 10~20건, 품목(HS) ≤4종
  - 관세계열 개인(customs): import_declarations 10~20건(importer_person_id), 품목 ≤2종
  - 마약/외환 개인: person_import_event 10~20건(여행자·특송·우편·송금) — 정식 신고 비현실 대체

죄종→신고 신호
  관세포탈/밀수   → undervalue (HS 벤치마크 대비 저가 declared_value)
  원산지위반      → fta_misuse (FTA 대상 HS + 원산지증명 플래그 + FTA국 원산지)
  지식재산침해    → ip_hs     (오분류 빈발 HS)
  전략물자        → strategic (이중용도 HS)
  외환계열        → offshore  (조세회피처 결제·고액 가산)
  마약계열(기업)  → cover     (위장 통상거래)
  audit 기업      → 6위험률 중 1개 주관심사(undervalue/fta/hs는 신고서로 표현)

부속 근거(FTA/환급/HS이벤트/특수관계/압수/송금/역외)와 지표 산출은 Phase 2b·3에서 처리.
사용법: python data/scripts/gen_declarations_v2.py
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
SEED_BATCH_ID = "risk-model-v2"
REF = date(2026, 6, 15)

# HS 풀: (hs, 품명, 기준 신고가KRW, fta대상, 이중용도(전략), 오분류빈발(ip))
HS_POOL = [
    ("8542.31", "메모리 집적회로", 120_000_000, True, True, False),
    ("8517.62", "무선 통신기기", 80_000_000, True, True, False),
    ("8471.30", "휴대용 컴퓨터", 70_000_000, True, True, False),
    ("8536.69", "전기 커넥터", 15_000_000, True, True, False),
    ("3907.61", "PET 수지", 25_000_000, True, False, False),
    ("8708.99", "자동차 부품", 30_000_000, True, False, False),
    ("6204.62", "면 혼방 의류", 12_000_000, True, False, True),
    ("3304.99", "기능성 화장품", 9_000_000, False, False, True),
    ("9503.00", "완구", 6_000_000, False, False, True),
    ("6402.99", "신발", 8_000_000, True, False, True),
    ("2208.30", "위스키", 40_000_000, False, False, False),
    ("3926.90", "플라스틱 제품", 5_000_000, False, False, False),
]
FTA_COUNTRIES = ["베트남", "중국", "태국", "독일", "미국"]
NORMAL_COUNTRIES = ["일본", "대만", "말레이시아", "인도네시아", "이탈리아"]
HAVEN = ["홍콩", "싱가포르", "BVI", "파나마"]
AUDIT_CONCERNS = ["undervalue", "fta_misuse", "ip_hs", "refund", "related", "offshore"]


def _d(days_ago: int) -> str:
    return (REF - timedelta(days=days_ago)).isoformat()


def _decl_signal_for(crimes: list[str], role: str, idx: int) -> str:
    """엔터티의 죄종/역할 → 신고서 신호 1개."""
    cset = set(crimes)
    if {"관세포탈", "밀수"} & cset:
        return "undervalue"
    if "원산지위반" in cset:
        return "fta_misuse"
    if "지식재산침해" in cset:
        return "ip_hs"
    if "전략물자" in cset:
        return "strategic"
    if {"외환불법거래", "외환자금세탁", "환치기", "재산국외도피"} & cset:
        return "offshore"
    if {"마약밀수입", "마약자금세탁", "신종마약유통"} & cset:
        return "cover"
    if role == "audit":
        return AUDIT_CONCERNS[idx % len(AUDIT_CONCERNS)]
    return "normal"


def _pick_items(signal: str, rng: random.Random, k: int) -> list[tuple]:
    """신호에 맞는 HS를 우선 포함해 ≤k종 선택."""
    pool = HS_POOL[:]
    pref = []
    if signal == "fta_misuse":
        pref = [h for h in pool if h[3]]
    elif signal == "strategic":
        pref = [h for h in pool if h[4]]
    elif signal == "ip_hs":
        pref = [h for h in pool if h[5]]
    rng.shuffle(pool)
    chosen = []
    if pref:
        chosen.append(rng.choice(pref))
    for h in pool:
        if len(chosen) >= k:
            break
        if h not in chosen:
            chosen.append(h)
    return chosen[:k]


def _factor(signal: str, rng: random.Random) -> float:
    """저가신고 신호면 벤치마크 하회 계수, 그 외 정상범위."""
    if signal == "undervalue":
        return rng.uniform(0.40, 0.65)
    if signal == "cover":
        return rng.uniform(0.85, 1.05)
    return rng.uniform(0.88, 1.12)


def gen_company_declarations(con: duckdb.DuckDBPyConnection, counter) -> int:
    comps = con.execute(
        "SELECT company_id, company_name, entity_role, primary_domain, crime_types "
        "FROM company_profiles ORDER BY company_id"
    ).df().to_dict("records")
    rows = []
    for i, c in enumerate(comps):
        rng = random.Random(hash(c["company_id"]) & 0xFFFFFFFF)
        crimes = [x for x in str(c["crime_types"] or "").split(",") if x]
        signal = _decl_signal_for(crimes, c["entity_role"], i)
        items = _pick_items(signal, rng, k=rng.randint(2, 4))
        n_decl = rng.randint(10, 20)
        for j in range(n_decl):
            hs, name, base, is_fta, _strat, _ip = rng.choice(items)
            val = round(base * _factor(signal, rng))
            is_haven = signal == "offshore" and rng.random() < 0.5
            origin = (rng.choice(FTA_COUNTRIES) if signal == "fta_misuse"
                      else rng.choice(HAVEN) if is_haven
                      else rng.choice(FTA_COUNTRIES + NORMAL_COUNTRIES))
            rows.append({
                "id": counter(), "company_id": c["company_id"], "importer_person_id": None,
                "declaration_no": f"DV2-{c['company_id']}-{j+1:02d}",
                "hs_code": hs, "item_name": name, "declared_value": val,
                "origin_country": origin, "origin_country_name": origin,
                "import_date": _d(rng.randint(20, 700)), "status": "수리",
                "declaration_type": "수입", "importer_name": c["company_name"],
                "total_customs_value_krw": val, "payment_amount": round(val / 1300, 2),
                "payment_currency": "USD", "exchange_rate": 1300.0,
                "departure_country": origin, "transport_type": rng.choice(["해상", "항공"]),
                "origin_cert_flag": "Y" if signal == "fta_misuse" or (is_fta and rng.random() < 0.5) else "N",
                "crime_signal": signal,
            })
    _insert_decls(con, rows)
    return len(rows)


def gen_person_customs_declarations(con: duckdb.DuckDBPyConnection, counter) -> int:
    persons = con.execute(
        "SELECT person_id, name, crime_types FROM risk_person_profile "
        "WHERE primary_domain='customs' ORDER BY person_id"
    ).df().to_dict("records")
    rows = []
    for p in persons:
        rng = random.Random(hash(p["person_id"]) & 0xFFFFFFFF)
        crimes = [x for x in str(p["crime_types"] or "").split(",") if x]
        signal = _decl_signal_for(crimes, "investigation", 0)
        items = _pick_items(signal, rng, k=rng.randint(1, 2))   # 개인 ≤2품목
        n_decl = rng.randint(10, 20)
        for j in range(n_decl):
            hs, name, base, is_fta, _strat, _ip = rng.choice(items)
            val = round(base * 0.3 * _factor(signal, rng))   # 개인 소액 스케일
            origin = rng.choice(FTA_COUNTRIES) if signal == "fta_misuse" else rng.choice(FTA_COUNTRIES + NORMAL_COUNTRIES)
            rows.append({
                "id": counter(), "company_id": None, "importer_person_id": p["person_id"],
                "declaration_no": f"DV2-{p['person_id']}-{j+1:02d}",
                "hs_code": hs, "item_name": name, "declared_value": val,
                "origin_country": origin, "origin_country_name": origin,
                "import_date": _d(rng.randint(20, 700)), "status": "수리",
                "declaration_type": "수입(개인)", "importer_person_name": p["name"],
                "total_customs_value_krw": val, "payment_amount": round(val / 1300, 2),
                "payment_currency": "USD", "exchange_rate": 1300.0,
                "departure_country": origin, "transport_type": rng.choice(["해상", "항공", "특송"]),
                "origin_cert_flag": "Y" if signal == "fta_misuse" else "N",
                "crime_signal": signal,
            })
    _insert_decls(con, rows)
    return len(rows)


def _insert_decls(con: duckdb.DuckDBPyConnection, rows: list[dict]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    ph = ", ".join("?" * len(cols))
    con.executemany(
        f"INSERT INTO import_declarations ({', '.join(cols)}) VALUES ({ph})",
        [[r.get(c) for c in cols] for r in rows],
    )


def gen_person_events(con: duckdb.DuckDBPyConnection) -> int:
    persons = con.execute(
        "SELECT person_id, primary_domain, crime_types FROM risk_person_profile "
        "WHERE primary_domain IN ('drug','forex') ORDER BY person_id"
    ).df().to_dict("records")
    DRUG_ITEMS = [("필로폰", "마약류"), ("대마", "마약류"), ("케타민", "신종마약"), ("합성대마", "신종마약")]
    rows = []
    con.execute("DELETE FROM person_import_event")
    for p in persons:
        rng = random.Random((hash(p["person_id"]) ^ 0x5A5A) & 0xFFFFFFFF)
        dom = p["primary_domain"]
        n = rng.randint(10, 20)
        for j in range(n):
            if dom == "drug":
                kind = rng.choice(["여행자휴대품", "국제우편", "특송"])
                item, cat = rng.choice(DRUG_ITEMS)
                declared = round(rng.uniform(50_000, 500_000))
                actual = round(declared * rng.uniform(3, 20))   # 은닉(실가치 ≫ 신고)
                signal = "drug_smuggle"
                origin = rng.choice(["태국", "베트남", "네덜란드", "필리핀", "미국"])
            else:  # forex
                kind = rng.choice(["해외송금", "환치기", "가상자산이체"])
                item, cat = ("자금", "외환")
                declared = round(rng.uniform(1e7, 2e8))
                actual = declared
                signal = rng.choice(["forex_remit", "hawala", "asset_flight"])
                origin = rng.choice(HAVEN + ["미국", "중국"])
            rows.append({
                "event_id": f"PE-{p['person_id']}-{j+1:02d}", "person_id": p["person_id"], "seq": j + 1,
                "event_date": _d(rng.randint(20, 700)), "event_kind": kind,
                "channel": kind, "origin_country": origin, "transit_country": None,
                "item_name": item, "item_category": cat,
                "declared_value": declared, "actual_value": actual, "currency": "KRW",
                "crime_signal": signal, "linked_case_id": None,
                "note": f"{dom} {signal} 이벤트", "seed_batch_id": SEED_BATCH_ID,
                "created_at": "2026-06-15 09:00:00",
            })
    if rows:
        cols = list(rows[0].keys())
        ph = ", ".join("?" * len(cols))
        con.executemany(
            f"INSERT INTO person_import_event ({', '.join(cols)}) VALUES ({ph})",
            [[r.get(c) for c in cols] for r in rows],
        )
    return len(rows)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        # 전면 재생성: 구 신고서/품목 4테이블 비우고 헤더 재생성(품목 4테이블은 Phase 2b)
        for t in ["import_declaration_item_taxes", "import_declaration_item_specs",
                  "import_declaration_items", "import_declarations"]:
            con.execute(f"DELETE FROM {t}")
        seq = {"n": 0}

        def counter() -> int:
            seq["n"] += 1
            return seq["n"]

        c_decls = gen_company_declarations(con, counter)
        p_decls = gen_person_customs_declarations(con, counter)
        p_events = gen_person_events(con)

        # 검증
        per_comp = con.execute(
            "SELECT min(c), max(c), avg(c) FROM (SELECT company_id, count(*) c FROM import_declarations "
            "WHERE company_id IS NOT NULL GROUP BY company_id)"
        ).fetchone()
        items_comp = con.execute(
            "SELECT max(h) FROM (SELECT company_id, count(distinct hs_code) h FROM import_declarations "
            "WHERE company_id IS NOT NULL GROUP BY company_id)"
        ).fetchone()[0]
        items_pers = con.execute(
            "SELECT max(h) FROM (SELECT importer_person_id, count(distinct hs_code) h FROM import_declarations "
            "WHERE importer_person_id IS NOT NULL GROUP BY importer_person_id)"
        ).fetchone()[0]
        ev_per = con.execute(
            "SELECT min(c), max(c) FROM (SELECT person_id, count(*) c FROM person_import_event GROUP BY person_id)"
        ).fetchone()
        sig = con.execute("SELECT crime_signal, count(*) FROM import_declarations GROUP BY 1 ORDER BY 2 DESC").fetchall()
    print("[Phase 2a] 신고서·이벤트 생성 완료")
    print(f"  기업 신고서: {c_decls}  /  개인(관세) 신고서: {p_decls}  /  개인 이벤트(마약·외환): {p_events}")
    print(f"  기업 신고건수 min/max/avg: {per_comp}  (품목 max/기업: {items_comp})")
    print(f"  개인 신고서 품목 max/인: {items_pers}  /  이벤트 min/max/인: {ev_per}")
    print(f"  신고 신호 분포: {sig}")


if __name__ == "__main__":
    main()
