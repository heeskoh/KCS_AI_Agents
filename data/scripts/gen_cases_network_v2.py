"""[Phase 4] 사건 + 범죄중심 연결 + 관련기업/관련자 + 태그 (전면 재생성·멱등).

  1) risk_org_profile = 수사대상 기업(company_profiles investigation/both) 그래프 미러
     (org_id=company_id, domain) + 관련조직(REL-O-####). domain 컬럼 추가.
  2) network_edge  = person↔person(공범) + person↔org(범죄중심) → 그래프 관계망
  3) smuggling_case + person_case_link = 죄종별 사건(다자), case_domain 매핑
  4) 태그 = 마약우범자 / (마약·외환)국제공조 → risk_person_profile.risk_tags 보강

선행: Phase 1~3. 후행: Phase 5(이름/프론트), Phase 6(Neo4j 적재).
사용법: python data/scripts/gen_cases_network_v2.py
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
SEED = "risk-model-v2"
REF = date(2026, 6, 15)

# 죄종 → (case_type, contraband_category[case_domain용], sub)
CRIME_CASE = {
    "관세포탈": ("관세포탈", "관세포탈품", "저가신고"),
    "밀수": ("밀수입", "밀수품", "미신고 반입"),
    "원산지위반": ("원산지위반", "우회수입품", "원산지 세탁"),
    "지식재산침해": ("지식재산침해", "위조상품", "위조 브랜드"),
    "전략물자": ("전략물자 불법수출", "전략물자", "이중용도 품목"),
    "마약밀수입": ("마약 밀수입", "마약류", "필로폰/대마"),
    "마약자금세탁": ("마약 자금세탁", "마약류", "범죄수익 세탁"),
    "신종마약유통": ("신종마약 유통", "마약류", "신종 향정"),
    "외환불법거래": ("외환 불법거래", "외환사범", "무등록 외환거래"),
    "외환자금세탁": ("외환 자금세탁", "외환사범", "역외 세탁"),
    "환치기": ("환치기", "외환사범", "불법 환전송금"),
    "재산국외도피": ("재산국외도피", "외환사범", "자산 해외이전"),
}
DOMAIN_REL = {"customs": "밀수조직", "drug": "마약공급망", "forex": "자금세탁망"}
ORG_TYPE = {"customs": "수사대상기업", "drug": "수사대상기업", "forex": "수사대상기업"}
COUNTRIES = ["태국", "베트남", "중국", "미국", "네덜란드", "멕시코", "필리핀", "홍콩"]
REGIONS = ["서울", "인천", "부산", "경기", "대구", "광주"]


def _d(rng, lo=20, hi=700):
    return (REF - timedelta(days=rng.randint(lo, hi))).isoformat()


def _ensure_org_columns(con):
    cols = {r[1] for r in con.execute("PRAGMA table_info('risk_org_profile')").fetchall()}
    if "domain" not in cols:
        con.execute("ALTER TABLE risk_org_profile ADD COLUMN domain VARCHAR")
    if "entity_role" not in cols:
        con.execute("ALTER TABLE risk_org_profile ADD COLUMN entity_role VARCHAR")


def build_orgs(con) -> tuple[dict, int, int]:
    """수사대상 기업 미러 + 관련조직. 반환: (org_id→domain, mirror수, related수)."""
    inv = con.execute(
        "SELECT c.company_id, c.company_name, c.primary_domain, c.crime_types, "
        "COALESCE(s.risk_score,60) rs, c.address "
        "FROM company_profiles c LEFT JOIN import_risk_scores s USING(company_id) "
        "WHERE c.entity_role IN ('investigation','both') ORDER BY c.company_id"
    ).df().to_dict("records")
    rows = []
    org_domain = {}
    for c in inv:
        org_domain[c["company_id"]] = c["primary_domain"]
        rows.append({
            "org_id": c["company_id"], "org_name": c["company_name"],
            "business_no_hash": None, "org_type": ORG_TYPE[c["primary_domain"]],
            "industry_code": None, "country": "대한민국",
            "address_region": (str(c["address"] or "").strip() or None),
            "risk_score": float(c["rs"]), "risk_tags": c["crime_types"],
            "watch_status": "조사중", "seed_batch_id": SEED,
            "created_at": "2026-06-15 09:00:00", "updated_at": "2026-06-15 09:00:00",
            "domain": c["primary_domain"], "entity_role": "investigation",
        })
    mirror = len(rows)
    # 관련조직(REL-O): 도메인별 보조 행위자(조건7)
    rng = random.Random(404)
    rel_specs = {"customs": ("위장무역상", 4), "drug": ("마약 위장업체", 4), "forex": ("역외 페이퍼컴퍼니", 4)}
    seq = 0
    for dom, (label, n) in rel_specs.items():
        for _ in range(n):
            seq += 1
            oid = f"REL-O-{seq:03d}"
            org_domain[oid] = dom
            rows.append({
                "org_id": oid, "org_name": f"{label}{seq:02d}", "business_no_hash": None,
                "org_type": "관련조직", "industry_code": None,
                "country": rng.choice(["BVI", "홍콩", "중국"]) if dom == "forex" else "대한민국",
                "address_region": rng.choice(REGIONS), "risk_score": round(rng.uniform(40, 75), 1),
                "risk_tags": f"{label}", "watch_status": "관찰중", "seed_batch_id": SEED,
                "created_at": "2026-06-15 09:00:00", "updated_at": "2026-06-15 09:00:00",
                "domain": dom, "entity_role": "related",
            })
    con.execute("DELETE FROM risk_org_profile")
    cols = list(rows[0].keys())
    con.executemany(f"INSERT INTO risk_org_profile ({', '.join(cols)}) VALUES ({', '.join('?'*len(cols))})",
                    [[r[c] for c in cols] for r in rows])
    return org_domain, mirror, len(rows) - mirror


def build_network(con, org_domain) -> int:
    persons = con.execute(
        "SELECT person_id, primary_domain FROM risk_person_profile ORDER BY person_id"
    ).df().to_dict("records")
    pdom = {p["person_id"]: p["primary_domain"] for p in persons}
    orgs_by_dom = {}
    for oid, dom in org_domain.items():
        orgs_by_dom.setdefault(dom, []).append(oid)

    edges = []
    n = 0

    def add(src, tt, tid, rel, w):
        nonlocal n
        n += 1
        edges.append({
            "edge_id": f"NE2-{n:05d}", "source_type": "person", "source_id": src,
            "target_type": tt, "target_id": tid, "relation_type": rel,
            "weight": round(w, 2), "confidence_score": round(min(1.0, w + 0.1), 2),
            "first_seen_at": "2025-01-01", "last_seen_at": "2026-06-15",
            "source_id_ref": None, "seed_batch_id": SEED, "created_at": "2026-06-15 09:00:00",
        })

    # person↔person: 공범(person_network_link 미러)
    for r in con.execute(
        "SELECT person_id, counterpart_id, relation_type, strength FROM person_network_link"
    ).df().to_dict("records"):
        if r["counterpart_id"] in pdom:
            add(r["person_id"], "person", r["counterpart_id"], r["relation_type"] or "공범", float(r["strength"] or 0.5))

    # person↔org: 같은 도메인 수사대상기업/관련조직에 연결(범죄중심)
    rng = random.Random(909)
    for p in persons:
        dom = p["primary_domain"]
        cands = orgs_by_dom.get(dom, [])
        if not cands:
            continue
        for oid in rng.sample(cands, min(len(cands), rng.randint(1, 2))):
            add(p["person_id"], "org", oid, DOMAIN_REL[dom], rng.uniform(0.5, 0.9))

    con.execute("DELETE FROM network_edge")
    cols = list(edges[0].keys())
    con.executemany(f"INSERT INTO network_edge ({', '.join(cols)}) VALUES ({', '.join('?'*len(cols))})",
                    [[e[c] for c in cols] for e in edges])
    return len(edges)


def build_cases(con) -> tuple[int, int]:
    persons = con.execute(
        "SELECT person_id, primary_domain, crime_types, profile_type, address_region "
        "FROM risk_person_profile ORDER BY person_id"
    ).df().to_dict("records")
    # 공범 후보(같은 도메인) for 다자 사건
    net = {}
    for r in con.execute("SELECT source_id, target_id FROM network_edge WHERE target_type='person'").df().to_dict("records"):
        net.setdefault(r["source_id"], []).append(r["target_id"])

    cases, links = [], []
    cseq = lseq = 0
    for p in persons:
        rng = random.Random((hash(p["person_id"]) ^ 0xCA5E) & 0xFFFFFFFF)
        crimes = [c for c in str(p["crime_types"] or "").split(",") if c in CRIME_CASE]
        if not crimes:
            continue
        for crime in crimes[: rng.randint(1, 2)]:
            ctype, cat, sub = CRIME_CASE[crime]
            cseq += 1
            cid = f"SC2-{cseq:04d}"
            origin = rng.choice(COUNTRIES)
            transit = rng.choice(["홍콩", "없음", "말레이시아"])
            cases.append({
                "case_id": cid, "case_no": f"2026-{ctype[:2]}-{cseq:04d}", "case_type": ctype,
                "contraband_category": cat, "contraband_sub_category": sub, "case_status": rng.choice(["수사중", "송치", "내사"]),
                "detection_date": _d(rng), "detection_channel": rng.choice(["국제우편", "특송", "항만", "정보분석", "제보"]),
                "origin_country": origin, "transit_country": transit, "destination_region": p["address_region"] or rng.choice(REGIONS),
                "modus_operandi": sub, "concealment_method": rng.choice(["품명위장", "분산반입", "인체은닉", "차명거래", "가장무역"]),
                "quantity": round(rng.uniform(1, 500), 1), "quantity_unit": "EA",
                "estimated_value": round(rng.uniform(5e7, 5e9)), "lead_agency": rng.choice(["조사국", "외환조사과", "마약조사과"]),
                "summary": f"{p['person_id']} 외 관련자 {ctype} 사건", "seed_batch_id": SEED,
                "created_at": "2026-06-15 09:00:00", "updated_at": "2026-06-15 09:00:00",
            })
            # 주범 + 공범(다자)
            actors = [p["person_id"]] + rng.sample(net.get(p["person_id"], []), min(len(net.get(p["person_id"], [])), rng.randint(1, 2)))
            for i, aid in enumerate(dict.fromkeys(actors)):
                lseq += 1
                links.append({
                    "link_id": f"PCL2-{lseq:05d}", "person_id": aid, "case_id": cid,
                    "role_in_case": p["profile_type"] if i == 0 else rng.choice(["공범", "연락책", "운반책"]),
                    "is_cargo_owner": i == 0, "confidence_score": round(rng.uniform(0.6, 0.95), 2),
                    "evidence_level": rng.choice(["강", "중", "약"]), "source_id": None,
                    "seed_batch_id": SEED, "created_at": "2026-06-15 09:00:00",
                })
    con.execute("DELETE FROM smuggling_case")
    con.execute("DELETE FROM person_case_link")
    for tbl, rows in [("smuggling_case", cases), ("person_case_link", links)]:
        cols = list(rows[0].keys())
        con.executemany(f"INSERT INTO {tbl} ({', '.join(cols)}) VALUES ({', '.join('?'*len(cols))})",
                        [[r[c] for c in cols] for r in rows])
    return len(cases), len(links)


def apply_tags(con) -> int:
    # 마약 도메인 → '마약우범자', 해외 경로 보유 마약/외환 → 국제공조 태그
    con.execute(
        "UPDATE risk_person_profile SET risk_tags = risk_tags || ', 마약우범자' "
        "WHERE primary_domain='drug' AND risk_tags NOT LIKE '%마약우범자%'"
    )
    con.execute(
        "UPDATE risk_person_profile SET risk_tags = risk_tags || ', 마약국제공조' "
        "WHERE primary_domain='drug' AND person_id IN "
        "(SELECT DISTINCT person_id FROM person_route_event WHERE transit_country IS NOT NULL AND transit_country<>'없음') "
        "AND risk_tags NOT LIKE '%국제공조%'"
    )
    con.execute(
        "UPDATE risk_person_profile SET risk_tags = risk_tags || ', 외환국제공조' "
        "WHERE primary_domain='forex' AND person_id IN "
        "(SELECT DISTINCT person_id FROM person_fx_transaction WHERE counterpart_country IS NOT NULL) "
        "AND risk_tags NOT LIKE '%국제공조%'"
    )
    return con.execute("SELECT count(*) FROM risk_person_profile WHERE risk_tags LIKE '%우범자%' OR risk_tags LIKE '%국제공조%'").fetchone()[0]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        _ensure_org_columns(con)
        # 스테일 enrichment 제거(구 사건/인물 참조)
        con.execute("DELETE FROM analysis_result")
        con.execute("DELETE FROM evidence_source")
        org_domain, mirror, related = build_orgs(con)
        n_edges = build_network(con, org_domain)
        n_cases, n_links = build_cases(con)
        n_tag = apply_tags(con)
        # 검증
        org_persons = con.execute(
            "SELECT target_id, count(*) FROM network_edge WHERE target_type='org' GROUP BY 1 ORDER BY 2 DESC LIMIT 5"
        ).fetchall()
        case_dom = con.execute(
            "SELECT contraband_category, count(*) FROM smuggling_case GROUP BY 1 ORDER BY 2 DESC"
        ).fetchall()
    print("[Phase 4] 사건·연결·관련자·태그 완료")
    print(f"  risk_org_profile: 수사대상기업 미러 {mirror} + 관련조직 {related}")
    print(f"  network_edge: {n_edges}  /  smuggling_case: {n_cases}  /  person_case_link: {n_links}")
    print(f"  태그 부여 인물: {n_tag}")
    print(f"  org별 연결 인물 상위: {org_persons}")
    print(f"  사건 분류(케이스도메인): {case_dom}")


if __name__ == "__main__":
    main()
