"""[Phase 1] 엔터티 마스터 생성 (기업/개인) — 역할·도메인·죄종 배정 (전면 재생성·멱등).

설계 결정 반영
  - 기업 entity_role: audit | investigation | both  (관세조사 대상 / 수사대상 / 둘 다)
  - 1 엔터티 = 1 주(主)도메인 + 동일 도메인 내 1~2 죄종(정합성: 무관 범죄 혼재 금지)
  - ID 체계 안정 유지: 기업 C-####, 개인 RP-#### / 외환개인 RP-FX-#### (역할·도메인은 컬럼)
  - 이름은 도메인 기반 직접 부여(관세조사대상기업 / 마약·외환·밀수 우범기업·우범자)

규모(중규모)
  - 관세조사 기업(audit, customs)         : 40  (C-1001~C-1040)
  - 수사대상 기업(investigation/both)     : 30  (C-2001~C-2030)
        customs 12(앞 5건 both) / drug 9 / forex 9
  - 수사대상 개인(investigation)          : 80
        drug 34(RP-0001~0034) / customs 26(RP-0035~0060) / forex 20(RP-FX-0001~0020)

근거·신고서·지표·사건은 Phase 2~4에서 채운다. 본 단계는 마스터만 생성한다.
사용법: python data/scripts/gen_entities_v2.py
"""
from __future__ import annotations

import hashlib
import random
import sys
from datetime import date, datetime
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
SEED_BATCH_ID = "risk-model-v2"

# ── 죄종 풀(조건5): 도메인별 죄종. 1 엔터티는 동일 도메인 내 1~2개만. ──
CRIMES = {
    "customs": ["관세포탈", "밀수", "원산지위반", "지식재산침해", "전략물자"],
    "drug": ["마약밀수입", "마약자금세탁", "신종마약유통"],
    "forex": ["외환불법거래", "외환자금세탁", "환치기", "재산국외도피"],
}
# 범죄도메인 한글 라벨(이름·태그용). customs 범죄 엔터티는 사용자 합의대로 '밀수' 라벨.
DOMAIN_KO = {"customs": "밀수", "drug": "마약", "forex": "외환"}

REGIONS = ["서울", "인천", "부산", "대구", "광주", "대전", "경기", "제주"]
COUNTRIES = ["중국", "미국", "베트남", "태국", "네덜란드", "멕시코", "필리핀", "홍콩", "일본"]
INDUSTRY = ["C26", "G46", "C20", "C13", "H52", "G47", "C28", "K64"]
PROFILE_TYPES = {
    "drug": ["운반책", "수하인", "연락책", "모집책", "총책 의심"],
    "customs": ["수입대표", "명의수입자", "중개책", "화주", "통관책"],
    "forex": ["자금책", "송금책", "환치기책", "차명계좌주", "총책 의심"],
}
OCCUPATIONS = ["무직", "무역업", "온라인 판매자", "물류대행", "요식업", "프리랜서", "유학생", "회사원"]


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def risk_level(score: float) -> str:
    if score >= 85:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 50:
        return "MEDIUM"
    return "LOW"


def pick_crimes(domain: str, idx: int, rng: random.Random) -> list[str]:
    """동일 도메인 내 1~2 죄종(정합성). 주죄종 + 35% 확률 보조죄종(중복 제외)."""
    pool = CRIMES[domain]
    primary = pool[idx % len(pool)]
    crimes = [primary]
    if len(pool) > 1 and rng.random() < 0.35:
        secondary = pool[(idx + 1 + idx // len(pool)) % len(pool)]
        if secondary != primary:
            crimes.append(secondary)
    return crimes


# ── 기업 ──────────────────────────────────────────────────────────────────────
def build_companies(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    rng = random.Random(20260624)
    rows: list[tuple] = []
    counts = {"audit": 0, "investigation": 0, "both": 0}
    name_seq = {"관세조사대상기업": 0, "마약우범기업": 0, "외환우범기업": 0, "밀수우범기업": 0}
    today = date(2026, 6, 15)

    def add_company(cid: str, role: str, domain: str, crimes: list[str]) -> None:
        counts[role] += 1
        if role == "audit":
            label = "관세조사대상기업"
        else:
            label = f"{DOMAIN_KO[domain]}우범기업"
        name_seq[label] += 1
        name = f"{label}{name_seq[label]:03d}"
        base = rng.uniform(45, 75) if role == "audit" else rng.uniform(60, 95)
        score = round(min(99.0, base), 1)
        rows.append((
            cid, name, f"{rng.randint(100,999)}-{rng.randint(10,99)}-{rng.randint(10000,99999)}",
            rng.choice(INDUSTRY), rng.randint(1995, 2022), risk_level(score), score, today,
            None, f"{rng.choice(REGIONS)} ", None, rng.randint(5, 400),
            ", ".join(rng.sample(COUNTRIES, rng.randint(1, 3))), None, None,
            round(rng.uniform(5e9, 3e11), 0), round(rng.uniform(1e9, 1e11), 0),
            round(rng.uniform(1e7, 5e9), 0), round(rng.uniform(0, 1e9), 0),
            round(rng.uniform(0, 12), 1),
            role, domain, ",".join(crimes),
        ))

    # 관세조사 대상(audit) 40
    for i in range(1, 41):
        add_company(f"C-{1000 + i}", "audit", "customs", [])
    # 수사대상(investigation/both) 30 : customs 12(앞5 both) / drug 9 / forex 9
    inv_plan = ([("customs", k) for k in range(12)]
                + [("drug", k) for k in range(9)]
                + [("forex", k) for k in range(9)])
    for n, (domain, k) in enumerate(inv_plan, start=1):
        cid = f"C-{2000 + n}"
        role = "both" if (domain == "customs" and k < 5) else "investigation"
        add_company(cid, role, domain, pick_crimes(domain, k, rng))

    con.execute("DELETE FROM company_profiles")
    con.executemany(
        """INSERT INTO company_profiles
           (company_id, company_name, business_registration_no, industry_code, founded_year,
            risk_level, risk_score, last_audit_date, address_postal_code, address, address_detail,
            employee_count, major_export_countries, customs_broker_firm, related_companies,
            annual_revenue, annual_import_amount, declared_duty_amount, recent_customs_refund,
            fta_reduction_rate, entity_role, primary_domain, crime_types)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    return counts


# ── 개인 ──────────────────────────────────────────────────────────────────────
def build_persons(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    rng = random.Random(20260625)
    rows: list[tuple] = []
    counts = {"drug": 0, "customs": 0, "forex": 0}
    name_seq = {"마약우범자": 0, "밀수우범자": 0, "외환우범자": 0}
    now = datetime(2026, 6, 15, 9, 0, 0)

    plan = ([("drug", f"RP-{i:04d}") for i in range(1, 35)]          # 34
            + [("customs", f"RP-{i:04d}") for i in range(35, 61)]    # 26
            + [("forex", f"RP-FX-{i:04d}") for i in range(1, 21)])   # 20

    for idx, (domain, pid) in enumerate(plan):
        counts[domain] += 1
        label = f"{DOMAIN_KO[domain]}우범자"
        name_seq[label] += 1
        name = f"{label}{name_seq[label]:03d}"
        crimes = pick_crimes(domain, idx, rng)
        base = rng.uniform(55, 96)
        score = round(min(99.0, base), 1)
        ptype = rng.choice(PROFILE_TYPES[domain])
        birth = date(rng.randint(1972, 2003), rng.randint(1, 12), rng.randint(1, 28))
        tags = ", ".join(crimes + [rng.choice(["특송", "국제우편", "고위험국", "분산송금", "차명"])])
        rows.append((
            pid, ptype, name, f"Alias-{pid}", birth, rng.choice(["M", "F"]),
            rng.choice(["대한민국", "중국", "베트남", "태국", "미국", "필리핀"]),
            "여권", digest(f"id-{pid}"), digest(f"ph-{pid}"), digest(f"em-{pid}"),
            rng.choice(REGIONS), rng.choice(OCCUPATIONS), risk_level(score), score, tags,
            rng.choice(["관찰중", "조사중", "보류"]), SEED_BATCH_ID, now, now,
            "investigation", domain, ",".join(crimes), "P" + digest(f"pcc-{pid}")[:12],
        ))

    con.execute("DELETE FROM risk_person_profile")
    con.executemany(
        """INSERT INTO risk_person_profile
           (person_id, profile_type, name, name_aliases, birth_date, gender, nationality,
            id_doc_type, id_doc_hash, phone_hash, email_hash, address_region, occupation,
            risk_level, risk_score, risk_tags, watch_status, seed_batch_id, created_at, updated_at,
            entity_role, primary_domain, crime_types, personal_clearance_code)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    return counts


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        comp = build_companies(con)
        per = build_persons(con)
        # 검증 집계
        comp_dist = con.execute(
            "SELECT entity_role, primary_domain, count(*) FROM company_profiles "
            "GROUP BY 1,2 ORDER BY 1,2"
        ).fetchall()
        per_dist = con.execute(
            "SELECT primary_domain, count(*) FROM risk_person_profile GROUP BY 1 ORDER BY 1"
        ).fetchall()
        # 정합성: crime_types 가 primary_domain 풀에 속하는지
        bad = con.execute("SELECT company_id, primary_domain, crime_types FROM company_profiles "
                          "WHERE entity_role IN ('investigation','both') AND (crime_types IS NULL OR crime_types='')").fetchall()
        samples_c = con.execute("SELECT company_id, company_name, entity_role, primary_domain, crime_types "
                                "FROM company_profiles WHERE company_id IN ('C-1001','C-2001','C-2013','C-2022') ORDER BY company_id").fetchall()
        samples_p = con.execute("SELECT person_id, name, primary_domain, crime_types FROM risk_person_profile "
                                "WHERE person_id IN ('RP-0001','RP-0035','RP-FX-0001') ORDER BY person_id").fetchall()
    print("[Phase 1] 엔터티 마스터 생성 완료")
    print("  기업:", comp, "→ 합계", sum(comp.values()))
    print("  개인:", per, "→ 합계", sum(per.values()))
    print("  기업 분포(role,domain):", comp_dist)
    print("  개인 분포(domain):", per_dist)
    print("  죄종 누락(수사대상):", bad or "없음")
    print("  표본기업:", samples_c)
    print("  표본개인:", samples_p)


if __name__ == "__main__":
    main()
