"""[관세조사 v3] 관세포탈 의심 기업 70개 체계 재구성 (멱등).

요구 조건 (2026-08 재설계)
------------------------
관세포탈 대시보드 대상(entity_role='audit') 기업을 70개(C-1001~C-1070)로 확장하고,
의심유형(대시보드 경보카드 = 지표율 >= 50점)을 아래 분포로 배정한다.

  (1) 품목분류 이상   hs_classification    30개사
  (2) 저가신고 의심   undervaluation       23개사
  (3) 환급 이상       customs_refund        7개사
  (4) 지식재산권 이상  related_party(권리사용료) 12개사
  (5) 원산지 우회     fta_origin_misuse    25개사
  합계 97태그 / 70개사 → 27개사는 2개 유형 중복 보유.

전체 위험도(risk_score)는 0.6*최고지표 + 0.32*차상위 + 0.08*나머지평균 으로 산출해
조사필요(>=90) ~6개 / 심사필요(70~90) ~15개 / 50~70 ~21개 / 50미만 ~28개로 분포시킨다.

원칙은 기존 재설계와 동일: 근거 데이터 선생성 -> src.risk_indicators 엔진 산출(저장=재계산),
배정 유형 지표 >= 55, 미배정 지표 < 50. 수사대상(investigation/both) 기업 데이터는 건드리지
않는다(기업 단위 삭제·삽입). price_benchmark 는 전체 신고 기준으로 재집계한다.

실행 순서 (이 스크립트 후 후처리 필수 — docs/claude-memory/global-hs-migration-required.md)
  1. python data/scripts/gen_audit_suspicion_v3.py
  2. python data/scripts/migrate_hsk_global_hs.py
  3. python data/scripts/reconstruct_import_declaration_mandatory.py
  4. python data/scripts/backfill_optional_declaration_fields.py
  5. python data/scripts/load_company_import_graph_to_neo4j.py --clear
"""
from __future__ import annotations

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import risk_indicators as ri  # noqa: E402

try:
    from risk_source_schema import COMPANY_SCOPED_TABLES, create_risk_source_schema  # type: ignore
except ImportError:
    from data.scripts.risk_source_schema import COMPANY_SCOPED_TABLES, create_risk_source_schema

REF_DATE = date(2026, 6, 15)
CALC_AT = "2026-08-07 09:00:00"
TAX_HAVENS = ["BVI", "케이맨", "파나마", "마샬제도", "홍콩"]
FTA_AGREEMENTS = ["한-아세안", "한-EU", "한-미", "한-중", "한-베트남"]
HIGH_RISK_HS_PREFIX = ("85", "84", "39", "62")
REGIONS = ["서울", "인천", "부산", "대구", "광주", "대전", "경기", "제주"]
COUNTRIES = ["중국", "미국", "베트남", "태국", "네덜란드", "멕시코", "필리핀", "홍콩", "일본"]
INDUSTRY = ["C26", "G46", "C20", "C13", "H52", "G47", "C28", "K64"]
FTA_COUNTRIES = ["베트남", "중국", "태국", "독일", "미국"]
NORMAL_COUNTRIES = ["일본", "대만", "말레이시아", "인도네시아", "이탈리아"]

# HS 풀: (global_hs6, 품명, 기준 신고가KRW, fta대상, 오분류빈발)
HS_POOL = [
    ("8542.31", "메모리 집적회로", 120_000_000, True, False),
    ("8517.62", "무선 통신기기", 80_000_000, True, False),
    ("8471.30", "휴대용 컴퓨터", 70_000_000, True, False),
    ("8536.69", "전기 커넥터", 15_000_000, True, False),
    ("3907.61", "PET 수지", 25_000_000, True, False),
    ("8708.99", "자동차 부품", 30_000_000, True, False),
    ("6204.62", "면 혼방 의류", 12_000_000, True, True),
    ("3304.99", "기능성 화장품", 9_000_000, False, True),
    ("9503.00", "완구", 6_000_000, False, True),
    ("6402.99", "신발", 8_000_000, True, True),
    ("2208.30", "위스키", 40_000_000, False, False),
    ("3926.90", "플라스틱 제품", 5_000_000, False, False),
]
EN_NAME = {
    "메모리 집적회로": "Memory IC", "무선 통신기기": "Wireless comm device",
    "휴대용 컴퓨터": "Portable computer", "전기 커넥터": "Electric connector",
    "PET 수지": "PET resin", "자동차 부품": "Auto parts", "면 혼방 의류": "Cotton blend apparel",
    "기능성 화장품": "Functional cosmetics", "완구": "Toy", "신발": "Footwear",
    "위스키": "Whisky", "플라스틱 제품": "Plastic article",
}
EXCISE_ITEMS = {"위스키", "기능성 화장품"}

# 카테고리 코드: H=품목분류, U=저가신고, O=원산지우회, I=지식재산권(권리사용료), R=환급
CAT_TO_INDICATOR = {
    "H": "hs_classification", "U": "undervaluation", "O": "fta_origin_misuse",
    "I": "related_party", "R": "customs_refund",
}
CAT_TO_SIGNAL = {"H": "hs_error", "U": "undervalue", "O": "fta_misuse", "I": "ip_hs", "R": "refund"}

# ── 배정 계획: (조합, 강도티어, 수량) — 티어 sat(96+)/high(78~90)/mid(58~72) ──
# 조합 합계: H 30 / U 23 / O 25 / I 12 / R 7 = 97태그, 70개사(중복 27).
PLAN: list[tuple[str, str, int]] = [
    # 조사필요(>=90) 6개사 — 두 지표 포화
    ("HU", "sat", 2), ("HO", "sat", 2), ("UI", "sat", 1), ("OI", "sat", 1),
    # 심사필요(70~90) 15개사 — 두 지표 높음
    ("HU", "high", 4), ("HO", "high", 4), ("UI", "high", 2), ("UR", "high", 2), ("OI", "high", 3),
    # 50~70 중위 복합 6개사
    ("HU", "mid", 2), ("HO", "mid", 1), ("UI", "mid", 1), ("UR", "mid", 1), ("OI", "mid", 1),
    # 단일 유형 강조 15개사 (전체 위험도 50~70)
    ("H", "high", 5), ("U", "high", 3), ("O", "high", 4), ("I", "high", 2), ("R", "high", 1),
    # 단일 유형 중위 28개사 (전체 위험도 50 미만)
    ("H", "mid", 10), ("U", "mid", 5), ("O", "mid", 9), ("I", "mid", 1), ("R", "mid", 3),
]
# 1차 지표 목표범위. 2차 지표는 sat=동일 / high=(72,86) / mid=(56,68).
# 종합 = 0.6*s1+0.32*s2+0.08*rest 이므로 sat 쌍(98+)이 90 이상, high 쌍이 70~85에 안착한다.
TIER_TARGET = {"sat": (98.0, 100.0), "high": (80.0, 90.0), "mid": (58.0, 72.0)}
TIER_SECOND = {"sat": (98.0, 100.0), "high": (72.0, 86.0), "mid": (56.0, 68.0)}


def _seed(cid: str) -> int:
    return sum(ord(c) * (i + 7) for i, c in enumerate(cid)) + 20_260_807


def _d(days_ago: int) -> str:
    return (REF_DATE - timedelta(days=days_ago)).isoformat()


def _level(score: float) -> str:
    return "CRITICAL" if score >= 85 else "HIGH" if score >= 70 else "MEDIUM" if score >= 50 else "LOW"


def _insert(conn: duckdb.DuckDBPyConnection, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    ph = ", ".join("?" * len(cols))
    conn.executemany(
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({ph})",
        [[r.get(c) for c in cols] for r in rows],
    )


class _Ids:
    """테이블별 id 카운터 — 기존 최댓값 다음부터 발급(수사대상 데이터 보존)."""

    def __init__(self, conn: duckdb.DuckDBPyConnection, tables: list[str], col: str = "id") -> None:
        self._n: dict[str, int] = {}
        for t in tables:
            try:
                mx = conn.execute(f"SELECT coalesce(max({col}), 0) FROM {t}").fetchone()[0]
            except duckdb.CatalogException:
                mx = 0
            self._n[t] = int(mx or 0)

    def next(self, table: str) -> int:
        self._n[table] = self._n.get(table, 0) + 1
        return self._n[table]


# ── 1) 배정 계획 → 기업별 카테고리 매핑 ──────────────────────────────────────

def build_assignment(existing_gaps: dict[str, float]) -> dict[str, dict]:
    """70개 기업(C-1001~C-1070)에 (categories, tier)를 배정한다.

    제약: 기존 신고서에서 저가 갭이 큰 기업(gap>=20%)은 반드시 U 그룹에 넣는다
    (미배정인데 갭만으로 undervaluation이 50점에 근접하는 모순 방지).
    """
    all_ids = [f"C-{1000 + i}" for i in range(1, 71)]
    slots: list[tuple[str, str]] = []
    for combo, tier, n in PLAN:
        slots.extend([(combo, tier)] * n)
    assert len(slots) == 70

    high_gap = [cid for cid, g in sorted(existing_gaps.items(), key=lambda x: -x[1]) if g >= 20.0]
    u_slots = [i for i, (combo, _) in enumerate(slots) if "U" in combo]
    non_u_slots = [i for i in range(len(slots)) if i not in u_slots]

    assignment: dict[str, dict] = {}
    used_slots: set[int] = set()
    # 저가 갭 보유 기업 → U 슬롯 우선 배정(티어 높은 순으로 자연 배치)
    for cid, slot_i in zip(high_gap, u_slots):
        combo, tier = slots[slot_i]
        assignment[cid] = {"cats": list(combo), "tier": tier}
        used_slots.add(slot_i)
    # 나머지 기업 → 남은 슬롯 순서대로
    remaining_ids = [c for c in all_ids if c not in assignment]
    remaining_slots = [i for i in range(len(slots)) if i not in used_slots]
    rng = random.Random(20260807)
    rng.shuffle(remaining_slots)
    for cid, slot_i in zip(remaining_ids, remaining_slots):
        combo, tier = slots[slot_i]
        assignment[cid] = {"cats": list(combo), "tier": tier}
    return assignment


# ── 2) 신규 기업 마스터 (C-1041~C-1070) ─────────────────────────────────────

def create_new_companies(conn: duckdb.DuckDBPyConnection) -> int:
    rng = random.Random(20260808)
    rows = []
    for i in range(41, 71):
        cid = f"C-{1000 + i}"
        rows.append((
            cid, f"관세조사대상기업{i:03d}",
            f"{rng.randint(100,999)}-{rng.randint(10,99)}-{rng.randint(10000,99999)}",
            rng.choice(INDUSTRY), rng.randint(1995, 2022), "LOW", 30.0, REF_DATE,
            None, f"{rng.choice(REGIONS)} ", None, rng.randint(5, 400),
            ", ".join(rng.sample(COUNTRIES, rng.randint(1, 3))), None, None,
            round(rng.uniform(5e9, 3e11), 0), round(rng.uniform(1e9, 1e11), 0),
            round(rng.uniform(1e7, 5e9), 0), round(rng.uniform(0, 1e9), 0),
            round(rng.uniform(0, 12), 1), "audit", "customs", "",
        ))
    conn.execute("DELETE FROM company_profiles WHERE company_id BETWEEN 'C-1041' AND 'C-1070'")
    conn.executemany(
        """INSERT INTO company_profiles
           (company_id, company_name, business_registration_no, industry_code, founded_year,
            risk_level, risk_score, last_audit_date, address_postal_code, address, address_detail,
            employee_count, major_export_countries, customs_broker_firm, related_companies,
            annual_revenue, annual_import_amount, declared_duty_amount, recent_customs_refund,
            fta_reduction_rate, entity_role, primary_domain, crime_types)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    return len(rows)


# ── 3) 신규 기업 수입신고서 + 4테이블 상세 ───────────────────────────────────

def create_new_declarations(conn: duckdb.DuckDBPyConnection, assignment: dict[str, dict]) -> tuple[int, int]:
    comps = conn.execute(
        "SELECT company_id, company_name FROM company_profiles "
        "WHERE company_id BETWEEN 'C-1041' AND 'C-1070' ORDER BY company_id"
    ).fetchall()
    # 신규 기업 신고서/상세 재실행 대비 삭제(멱등)
    conn.execute("""
        DELETE FROM import_declaration_item_taxes WHERE item_id IN (
          SELECT i.item_id FROM import_declaration_items i
          JOIN import_declarations d ON i.declaration_id = d.id
          WHERE d.company_id BETWEEN 'C-1041' AND 'C-1070')
    """)
    conn.execute("""
        DELETE FROM import_declaration_item_specs WHERE item_id IN (
          SELECT i.item_id FROM import_declaration_items i
          JOIN import_declarations d ON i.declaration_id = d.id
          WHERE d.company_id BETWEEN 'C-1041' AND 'C-1070')
    """)
    conn.execute("""
        DELETE FROM import_declaration_items WHERE declaration_id IN (
          SELECT id FROM import_declarations WHERE company_id BETWEEN 'C-1041' AND 'C-1070')
    """)
    conn.execute("DELETE FROM import_declarations WHERE company_id BETWEEN 'C-1041' AND 'C-1070'")

    ids = _Ids(conn, ["import_declarations"])
    item_ids = _Ids(conn, ["import_declaration_items"], col="item_id")
    spec_ids = _Ids(conn, ["import_declaration_item_specs"], col="spec_id")
    tax_ids = _Ids(conn, ["import_declaration_item_taxes"], col="tax_id")

    decl_rows, item_rows, spec_rows, tax_rows = [], [], [], []
    for cid, cname in comps:
        rng = random.Random(_seed(cid))
        cats = assignment[cid]["cats"]
        signals = [CAT_TO_SIGNAL[c] for c in cats]
        # 품목 선택: 원산지우회 기업은 FTA 대상, 품목분류/지재권 기업은 오분류빈발 HS 우선
        pool = HS_POOL[:]
        pref: list[tuple] = []
        if "O" in cats:
            pref += [h for h in pool if h[3]]
        if "H" in cats or "I" in cats:
            pref += [h for h in pool if h[4]]
        rng.shuffle(pool)
        items = ([rng.choice(pref)] if pref else []) + pool
        chosen, seen = [], set()
        for h in items:
            if h[0] not in seen:
                chosen.append(h)
                seen.add(h[0])
            if len(chosen) >= rng.randint(2, 4):
                break
        n_decl = rng.randint(12, 18)
        for j in range(n_decl):
            g6, name, base, is_fta, _mis = rng.choice(chosen)
            sig = signals[0] if (len(signals) == 1 or rng.random() < 0.6) else signals[1]
            if sig == "undervalue":
                factor = rng.uniform(0.50, 0.68)
            else:
                factor = rng.uniform(0.88, 1.12)
            val = round(base * factor)
            fta_use = sig == "fta_misuse" or (is_fta and rng.random() < 0.4)
            origin = (rng.choice(FTA_COUNTRIES) if fta_use
                      else rng.choice(FTA_COUNTRIES + NORMAL_COUNTRIES))
            did = ids.next("import_declarations")
            decl_rows.append({
                "id": did, "company_id": cid, "importer_person_id": None,
                "declaration_no": f"DV3-{cid}-{j+1:02d}",
                "hs_code": f"{g6}.0000", "global_hs": g6, "hsk": "0000",
                "item_name": name, "declared_value": val,
                "origin_country": origin, "origin_country_name": origin,
                "import_date": _d(rng.randint(20, 700)), "status": "수리",
                "declaration_type": "수입", "importer_name": cname,
                "total_customs_value_krw": val, "payment_amount": round(val / 1300, 2),
                "payment_currency": "USD", "exchange_rate": 1300.0,
                "departure_country": origin, "transport_type": rng.choice(["해상", "항공"]),
                "origin_cert_flag": "Y" if fta_use else "N",
                "crime_signal": sig,
            })
            # 품목 1란 + 규격 + 세목 (기존 4테이블 관례와 동일)
            usd = round(val / 1300, 2)
            iid = item_ids.next("import_declaration_items")
            req_type = req_law = req_no = None
            if sig == "ip_hs":
                req_type, req_law, req_no = "지식재산권 확인", "상표법", f"IP-{iid:06d}"
            item_rows.append({
                "item_id": iid, "declaration_id": did, "line_no": 1,
                "tariff_item_name_en": EN_NAME.get(name, name), "trade_item_name_en": name,
                "hsk_code": g6.replace(".", "") + "0000", "simple_tariff_code": None,
                "brand_code": None,
                "brand_name": (f"Brand-{rng.randint(1,99)}" if sig == "ip_hs" else None),
                "net_weight": round(rng.uniform(50, 5000), 1), "net_weight_unit": "KG",
                "tariff_quantity": rng.randint(1, 2000), "tariff_quantity_unit": "EA",
                "refund_quantity": 0, "refund_quantity_unit": "EA",
                "origin_country": origin,
                "origin_criteria": "WO" if fta_use else None,
                "origin_marking": rng.choice(["표시", "미표시"]),
                "import_requirement_type": req_type, "import_requirement_approval_no": req_no,
                "import_requirement_doc": ("요건확인서" if req_type else None),
                "import_requirement_issue_date": None, "import_requirement_law_code": req_law,
                "post_verification_agency": ("원산지검증과" if fta_use else None),
                "item_customs_value_usd": usd, "item_customs_value_krw": val,
                "special_tax_basis": val,
                "global_hs": g6, "hsk": "0000",
            })
            for s in range(rng.randint(1, 2)):
                q = rng.randint(1, 1000)
                up = round(usd / max(1, q), 2)
                spec_rows.append({
                    "spec_id": spec_ids.next("import_declaration_item_specs"), "item_id": iid,
                    "seq": s + 1,
                    "model_spec": f"{EN_NAME.get(name,'MODEL')[:6].upper()}-{rng.randint(100,999)}",
                    "ingredient": ("폴리에스터/면" if "의류" in name else "혼합물" if "화장품" in name else None),
                    "spec_quantity": q, "spec_quantity_unit": "EA",
                    "spec_unit_price": up, "spec_amount": round(up * q, 2), "currency": "USD",
                })
            duty_rate = 0.0 if fta_use else 8.0
            duty_amt = round(val * duty_rate / 100)
            tax_rows.append({
                "tax_id": tax_ids.next("import_declaration_item_taxes"), "item_id": iid, "seq": 1,
                "tax_type": "관세", "rate_type": "협정세율" if fta_use else "기본세율",
                "tax_rate": duty_rate, "reduction_rate": 100.0 if fta_use else 0.0,
                "tax_amount": duty_amt, "reduction_installment_code": None,
                "reduction_amount": round(val * 8 / 100) if fta_use else 0, "internal_tax_code": None,
            })
            excise = 0
            if name in EXCISE_ITEMS:
                excise = round(val * 0.2)
                tax_rows.append({
                    "tax_id": tax_ids.next("import_declaration_item_taxes"), "item_id": iid, "seq": 2,
                    "tax_type": "개별소비세", "rate_type": "기본세율", "tax_rate": 20.0,
                    "reduction_rate": 0.0, "tax_amount": excise,
                    "reduction_installment_code": None, "reduction_amount": 0, "internal_tax_code": "IC",
                })
            tax_rows.append({
                "tax_id": tax_ids.next("import_declaration_item_taxes"), "item_id": iid, "seq": 3,
                "tax_type": "부가가치세", "rate_type": "기본세율", "tax_rate": 10.0,
                "reduction_rate": 0.0, "tax_amount": round((val + duty_amt + excise) * 0.1),
                "reduction_installment_code": None, "reduction_amount": 0, "internal_tax_code": "VAT",
            })

    _insert(conn, "import_declarations", decl_rows)
    _insert(conn, "import_declaration_items", item_rows)
    _insert(conn, "import_declaration_item_specs", spec_rows)
    _insert(conn, "import_declaration_item_taxes", tax_rows)
    return len(decl_rows), len(item_rows)


# ── 4) 근거 데이터 생성기 — 목표 점수 도달까지 단위 근거 추가 ────────────────

def _baseline_sources(cid: str, rng: random.Random, ids: _Ids, decls: list[dict],
                      import_amt: float) -> dict[str, list[dict]]:
    """미배정 지표용 저강도 배경 데이터(점수 < 50 유지)."""
    hs_codes = sorted({str(h) for h in ((d.get("global_hs") or d.get("hs_code")) for d in decls)
                       if isinstance(h, str)}) or ["8542.31"]
    out: dict[str, list[dict]] = {t: [] for t in COMPANY_SCOPED_TABLES}
    for i in range(rng.randint(1, 2)):
        hs = rng.choice(hs_codes)
        out["export_declaration"].append({
            "id": ids.next("export_declaration"), "company_id": cid,
            "declaration_no": f"EXP-{ids._n['export_declaration']:06d}",
            "hs_code": hs, "item_name": next((d["item_name"] for d in decls
                                              if (d.get("global_hs") or d.get("hs_code")) == hs), "수출품"),
            "export_value": round(import_amt * rng.uniform(0.05, 0.25)),
            "dest_country": rng.choice(["USA", "CHN", "VNM", "JPN", "DEU"]),
            "export_date": _d(rng.randint(30, 900)), "status": "NORMAL",
        })
    if rng.random() < 0.5:
        out["related_party"].append({
            "id": ids.next("related_party"), "company_id": cid,
            "party_name": f"{cid} 거래계열사", "country": rng.choice(["CHN", "HKG", "SGP", "USA"]),
            "relation_type": "특수관계", "shareholding_pct": round(rng.uniform(5, 20), 1),
            "trade_share_pct": round(rng.uniform(3, 12), 1), "is_offshore": False, "note": None,
        })
    if rng.random() < 0.6:
        out["drawback"].append({
            "id": ids.next("drawback"), "company_id": cid,
            "drawback_no": f"DBK-{ids._n['drawback']:06d}",
            "claim_amount": round(import_amt * rng.uniform(0.005, 0.02)),
            "bom_ref": f"BOM-{cid[-4:]}-B1", "status": "정상",
            "claim_date": _d(rng.randint(20, 700)),
            "export_decl_ref": out["export_declaration"][0]["declaration_no"],
        })
    if rng.random() < 0.4:
        d = rng.choice(decls) if decls else None
        out["hs_classification_event"].append({
            "id": ids.next("hs_classification_event"), "company_id": cid,
            "event_date": _d(rng.randint(20, 800)), "event_type": "정정",
            "declared_hs": (d.get("global_hs") if d else rng.choice(hs_codes)),
            "declaration_ref": (d.get("declaration_no") if d else None),
            "ai_suggested_hs": None, "case_ref": None, "note": "신고 후 품목분류 정정",
        })
    if rng.random() < 0.4:
        out["fx_transaction"].append({
            "id": ids.next("fx_transaction"), "company_id": cid,
            "txn_date": _d(rng.randint(10, 700)),
            "amount": round(import_amt * rng.uniform(0.05, 0.2)), "direction": "송금",
            "counterpart_country": rng.choice(["CHN", "USA", "SGP"]),
            "counterpart_name": f"해외거래처{rng.randint(1, 9)}", "is_tax_haven": False, "note": None,
        })
    return out


def _make_escalators(cid: str, rng: random.Random, ids: _Ids, sources: dict[str, list[dict]],
                     decls: list[dict], import_amt: float) -> dict[str, Callable[[int], None]]:
    """지표별 '근거 1단위 추가' 함수 — 목표 점수 도달까지 반복 호출된다."""
    hs_codes = sorted({str(h) for h in ((d.get("global_hs") or d.get("hs_code")) for d in decls)
                       if isinstance(h, str)}) or ["8542.31"]

    def pick():
        return rng.choice(decls) if decls else None

    def add_underval(step: int) -> None:
        d = pick()
        detect = step % 3 == 0   # 1·4·7단계는 적발(+12), 나머지 정정(+6)
        sources["valuation_audit"].append({
            "id": ids.next("valuation_audit"), "company_id": cid,
            "audit_date": _d(rng.randint(40, 700)),
            "audit_type": "저가신고적발" if detect else "정정신고",
            "hs_code": (d.get("global_hs") if d else rng.choice(hs_codes)),
            "declaration_ref": (d.get("declaration_no") if d else None),
            "result": "추징" if detect else "정정",
            "adjusted_amount": round(import_amt * rng.uniform(0.02, 0.06 if detect else 0.02)),
            "note": "저가신고 적발 추징" if detect else "과세가격 정정",
        })

    def add_hs(step: int) -> None:
        d = pick()
        kind = ["정정", "AI불일치", "정정", "AI불일치", "심사"][step % 5]
        case = ("CL-00%d" % (step % 6 + 1), "8542.31") if kind == "AI불일치" else (None, None)
        sources["hs_classification_event"].append({
            "id": ids.next("hs_classification_event"), "company_id": cid,
            "event_date": _d(rng.randint(10, 800)), "event_type": kind,
            "declared_hs": (d.get("global_hs") if d else rng.choice(hs_codes)),
            "declaration_ref": (d.get("declaration_no") if d else None),
            "ai_suggested_hs": case[1], "case_ref": case[0],
            "note": {"정정": "신고 후 품목분류 정정", "심사": "품목분류 사전심사",
                     "AI불일치": "AI 추천 분류와 신고 불일치"}[kind],
        })

    def add_origin(step: int) -> None:
        d = pick()
        hs = (d.get("global_hs") if d else rng.choice(hs_codes)) or "8542.31"
        co_no = f"CO-{cid[-4:]}-{step:02d}"
        if step % 2 == 1:   # 검증실패(+18, 최초 1회 추징 +15)
            sources["fta_claim"].append({
                "id": ids.next("fta_claim"), "company_id": cid,
                "agreement": rng.choice(FTA_AGREEMENTS), "hs_code": hs,
                "declaration_ref": (d.get("declaration_no") if d else None), "co_no": co_no,
                "co_status": "정상", "reduction_amount": round(import_amt * rng.uniform(0.01, 0.06)),
                "claim_date": _d(rng.randint(30, 800)),
                "is_high_risk_hs": str(hs).replace(".", "").startswith(HIGH_RISK_HS_PREFIX),
            })
            sources["origin_verification"].append({
                "id": ids.next("origin_verification"), "company_id": cid,
                "fta_claim_ref": co_no, "verify_date": _d(rng.randint(20, 600)),
                "verify_result": "실패",
                "recovered_amount": round(import_amt * rng.uniform(0.01, 0.05)) if step == 1 else 0,
                "agency": "원산지검증과", "note": "원산지 우회 의심 검증 실패",
            })
        else:               # C/O 오류·미제출(+10)
            sources["fta_claim"].append({
                "id": ids.next("fta_claim"), "company_id": cid,
                "agreement": rng.choice(FTA_AGREEMENTS), "hs_code": hs,
                "declaration_ref": (d.get("declaration_no") if d else None), "co_no": co_no,
                "co_status": rng.choice(["오류", "미제출"]),
                "reduction_amount": round(import_amt * rng.uniform(0.01, 0.06)),
                "claim_date": _d(rng.randint(30, 800)),
                "is_high_risk_hs": str(hs).replace(".", "").startswith(HIGH_RISK_HS_PREFIX),
            })

    def add_ipr(step: int) -> None:
        if step == 1:   # 주 특수관계사(권리사용료 지급처) + 이전가격 조사
            sources["related_party"].append({
                "id": ids.next("related_party"), "company_id": cid,
                "party_name": f"{cid} 브랜드본사(권리사용료)", "country": rng.choice(["USA", "HKG", "SGP"]),
                "relation_type": "모회사", "shareholding_pct": round(rng.uniform(50, 90), 1),
                "trade_share_pct": round(rng.uniform(55, 85), 1), "is_offshore": False,
                "note": "상표권 사용료 지급 대상",
            })
            sources["transfer_pricing_audit"].append({
                "id": ids.next("transfer_pricing_audit"), "company_id": cid,
                "audit_date": _d(rng.randint(60, 800)),
                "abnormal_margin_rate": round(rng.uniform(18, 35), 1),
                "result": "추징", "recovered_amount": round(import_amt * rng.uniform(0.01, 0.04)),
                "note": "권리사용료 과세가격 미가산 의심",
            })
        else:
            sources["related_party"].append({
                "id": ids.next("related_party"), "company_id": cid,
                "party_name": f"{cid} 특수관계사{step}", "country": rng.choice(["CHN", "HKG", "SGP", "USA"]),
                "relation_type": "계열사", "shareholding_pct": round(rng.uniform(10, 40), 1),
                "trade_share_pct": round(rng.uniform(5, 20), 1), "is_offshore": False, "note": None,
            })

    def add_refund(step: int) -> None:
        exp_refs = [e["declaration_no"] for e in sources["export_declaration"]]
        if not exp_refs:    # 환급은 수출실적 전제
            sources["export_declaration"].append({
                "id": ids.next("export_declaration"), "company_id": cid,
                "declaration_no": f"EXP-{ids._n['export_declaration']:06d}",
                "hs_code": rng.choice(hs_codes), "item_name": "수출품",
                "export_value": round(import_amt * rng.uniform(0.05, 0.25)),
                "dest_country": rng.choice(["USA", "CHN", "VNM"]),
                "export_date": _d(rng.randint(30, 900)), "status": "NORMAL",
            })
            exp_refs = [sources["export_declaration"][-1]["declaration_no"]]
        if step == 1:       # 허위BOM 심사 + 추징(+16+10)
            sources["drawback_audit"].append({
                "id": ids.next("drawback_audit"), "company_id": cid,
                "audit_date": _d(rng.randint(30, 500)), "result": "추징",
                "recovered_amount": round(import_amt * rng.uniform(0.005, 0.02)),
                "finding": "허위BOM의심", "note": "소요량 과다 산정 의심",
            })
        status = ["과다", "부인", "반복", "과다"][step % 4]
        sources["drawback"].append({
            "id": ids.next("drawback"), "company_id": cid,
            "drawback_no": f"DBK-{ids._n['drawback']:06d}",
            "claim_amount": round(import_amt * rng.uniform(0.005, 0.03)),
            "bom_ref": f"BOM-{cid[-4:]}-{step:02d}", "status": status,
            "claim_date": _d(rng.randint(20, 700)),
            "export_decl_ref": rng.choice(exp_refs),
        })

    return {
        "undervaluation": add_underval, "hs_classification": add_hs,
        "fta_origin_misuse": add_origin, "related_party": add_ipr,
        "customs_refund": add_refund,
    }


def rebuild_audit_evidence(conn: duckdb.DuckDBPyConnection, assignment: dict[str, dict]) -> list[dict]:
    create_risk_source_schema(conn)
    audit_ids = sorted(assignment.keys())
    ph = ", ".join("?" * len(audit_ids))
    for t in COMPANY_SCOPED_TABLES:
        conn.execute(f"DELETE FROM {t} WHERE company_id IN ({ph})", audit_ids)
    conn.execute(f"DELETE FROM company_risk_indicator WHERE company_id IN ({ph})", audit_ids)
    conn.execute(f"DELETE FROM import_risk_scores WHERE company_id IN ({ph})", audit_ids)

    # price_benchmark 재집계(전체 신고 기준 — 기존 generate_all 관례와 동일)
    conn.execute("DELETE FROM price_benchmark")
    bench_rows = conn.execute(
        "SELECT global_hs, AVG(declared_value), COUNT(*) FROM import_declarations "
        "WHERE global_hs IS NOT NULL GROUP BY global_hs"
    ).fetchall()
    benchmark = {hs: float(avg) for hs, avg, _ in bench_rows}
    _insert(conn, "price_benchmark", [
        {"hs_code": hs, "global_hs": hs, "hsk": None, "period": "2025",
         "avg_declared_value": round(float(avg)), "sample_size": int(n),
         "currency": "KRW", "source": "import_declarations 집계"}
        for hs, avg, n in bench_rows
    ])

    companies = conn.execute(
        f"SELECT * FROM company_profiles WHERE company_id IN ({ph}) ORDER BY company_id", audit_ids
    ).df().to_dict("records")
    decls_all = conn.execute(
        f"SELECT * FROM import_declarations WHERE company_id IN ({ph})", audit_ids
    ).df().to_dict("records")
    decls_by_company: dict[str, list[dict]] = {}
    for d in decls_all:
        decls_by_company.setdefault(d["company_id"], []).append(d)

    evid_tables = COMPANY_SCOPED_TABLES + ["company_risk_indicator", "import_risk_scores"]
    ids = _Ids(conn, evid_tables)
    accum: dict[str, list[dict]] = {t: [] for t in COMPANY_SCOPED_TABLES}
    indicator_rows: list[dict] = []
    score_rows: list[dict] = []
    report: list[dict] = []

    for company in companies:
        cid = company["company_id"]
        plan = assignment[cid]
        rng = random.Random(_seed(cid) ^ 0xA5A5)
        decls = decls_by_company.get(cid, [])
        import_amt = float(company.get("annual_import_amount") or 2_000_000_000)

        sources = _baseline_sources(cid, rng, ids, decls, import_amt)
        esc = _make_escalators(cid, rng, ids, sources, decls, import_amt)

        # 배정 지표를 목표 티어 점수까지 근거 추가로 끌어올린다
        for k, cat in enumerate(plan["cats"]):
            code = CAT_TO_INDICATOR[cat]
            lo, hi = (TIER_TARGET if k == 0 else TIER_SECOND)[plan["tier"]]
            target = rng.uniform(lo, hi)
            step = 0
            while step < 40:
                ctx = {"declarations": decls, "price_benchmark": benchmark, **sources}
                if ri.compute_company_indicators(ctx)[code].score >= target:
                    break
                step += 1
                esc[code](step)

        ctx = {"declarations": decls, "price_benchmark": benchmark, **sources}
        results = ri.compute_company_indicators(ctx)
        violations = ri.validate_consistency(results, ctx)
        if violations:   # 설계상 발생하지 않아야 함(근거 선생성)
            raise RuntimeError(f"{cid} 정합성 위반: {[v.rule for v in violations]}")

        scores = sorted((results[c].score for c in ri.INDICATOR_ORDER), reverse=True)
        overall = round(min(100.0, 0.6 * scores[0] + 0.32 * scores[1] + 0.08 * (sum(scores[2:]) / 4)), 1)

        for code in ri.INDICATOR_ORDER:
            r = results[code]
            indicator_rows.append({
                "id": ids.next("company_risk_indicator"), "company_id": cid,
                "indicator_code": r.code, "indicator_name": r.name, "score": r.score,
                "reason": r.reason_text or "근거 데이터 없음",
                "related_refs": json.dumps(r.refs, ensure_ascii=False),
                "recommendation": r.recommendation, "calculated_at": CALC_AT,
            })
        rates = {ri.INDICATOR_TO_RATE_FIELD[c]: results[c].score for c in ri.INDICATOR_ORDER}
        score_rows.append({
            "id": ids.next("import_risk_scores"), "company_id": cid,
            "risk_level": _level(overall), "risk_score": overall, **rates,
            "generated_at": CALC_AT,
        })
        for t, rows in sources.items():
            accum[t].extend(rows)
        report.append({
            "company_id": cid, "cats": "".join(plan["cats"]), "tier": plan["tier"],
            "overall": overall,
            **{CAT_TO_INDICATOR[c]: results[CAT_TO_INDICATOR[c]].score for c in plan["cats"]},
        })

    for t, rows in accum.items():
        _insert(conn, t, rows)
    _insert(conn, "company_risk_indicator", indicator_rows)
    _insert(conn, "import_risk_scores", score_rows)

    # 마스터 동기화(프로파일·그래프 표시값 = 산출값)
    conn.execute(f"""
        UPDATE company_profiles c SET risk_score = s.risk_score, risk_level = s.risk_level
        FROM import_risk_scores s
        WHERE c.company_id = s.company_id AND c.company_id IN ({ph})
    """, audit_ids)
    return report


# ── 5) 검증 리포트 ───────────────────────────────────────────────────────────

def verify(conn: duckdb.DuckDBPyConnection) -> None:
    cats = {
        "품목분류 이상(hs)": "hs_classification_error_rate",
        "저가신고 의심(underval)": "undervaluation_suspicion_rate",
        "환급 이상(refund)": "customs_refund_anomaly_rate",
        "지식재산권 이상(ipr)": "related_party_anomaly_rate",
        "원산지 우회(origin)": "fta_origin_misuse_suspicion_rate",
    }
    print("\n[검증] 의심유형별 기업 수 (지표율 >= 50, audit 기업)")
    for label, col in cats.items():
        n = conn.execute(f"""
            SELECT count(*) FROM import_risk_scores s JOIN company_profiles c USING (company_id)
            WHERE c.entity_role = 'audit' AND s.{col} >= 50
        """).fetchone()[0]
        print(f"  {label}: {n}개사")
    n_audit = conn.execute(
        "SELECT count(*) FROM company_profiles WHERE entity_role='audit'").fetchone()[0]
    print(f"  분석대상(audit) 기업 합계: {n_audit}개사")
    print("\n[검증] 전체 위험도 분포 (audit)")
    for band, cond in [(">=90 조사필요", "risk_score >= 90"), ("70~90 심사필요", "risk_score >= 70 AND risk_score < 90"),
                       ("50~70", "risk_score >= 50 AND risk_score < 70"), ("<50", "risk_score < 50")]:
        n = conn.execute(f"SELECT count(*) FROM company_profiles WHERE entity_role='audit' AND {cond}").fetchone()[0]
        print(f"  {band}: {n}개사")
    multi = conn.execute("""
        SELECT count(*) FROM (
          SELECT company_id FROM import_risk_scores s JOIN company_profiles c USING (company_id)
          WHERE c.entity_role='audit' AND (
            (CASE WHEN hs_classification_error_rate >= 50 THEN 1 ELSE 0 END +
             CASE WHEN undervaluation_suspicion_rate >= 50 THEN 1 ELSE 0 END +
             CASE WHEN customs_refund_anomaly_rate >= 50 THEN 1 ELSE 0 END +
             CASE WHEN related_party_anomaly_rate >= 50 THEN 1 ELSE 0 END +
             CASE WHEN fta_origin_misuse_suspicion_rate >= 50 THEN 1 ELSE 0 END) >= 2))
    """).fetchone()[0]
    print(f"  복수 유형 보유: {multi}개사")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as conn:
        # 기존 audit 기업(C-1001~1040)의 신고서 기반 저가 갭 → U 그룹 강제 배정용
        gaps = dict(conn.execute("""
            WITH bench AS (
              SELECT global_hs, AVG(declared_value) b FROM import_declarations
              WHERE global_hs IS NOT NULL GROUP BY 1
            ), comp AS (
              SELECT d.company_id, d.global_hs, AVG(d.declared_value) a, COUNT(*) n
              FROM import_declarations d JOIN company_profiles c USING (company_id)
              WHERE c.entity_role = 'audit' AND d.global_hs IS NOT NULL GROUP BY 1, 2
            )
            SELECT company_id, ROUND(SUM(GREATEST(0, (b.b - a) / b.b * 100) * n) / SUM(n), 1)
            FROM comp JOIN bench b USING (global_hs) GROUP BY 1
        """).fetchall())

        assignment = build_assignment(gaps)
        n_new = create_new_companies(conn)
        print(f"[1] 신규 관세조사 기업 {n_new}개 생성 (C-1041~C-1070)")
        n_decl, n_item = create_new_declarations(conn, assignment)
        print(f"[2] 신규 수입신고 {n_decl}건 + 품목 {n_item}란 (4테이블) 생성")
        report = rebuild_audit_evidence(conn, assignment)
        print(f"[3] audit 70개사 근거·지표 재생성 완료")
        verify(conn)
        # 배정표 출력(상위 12개)
        print("\n[배정표 상위 12] (기업, 유형, 티어, 종합)")
        for r in sorted(report, key=lambda x: -x["overall"])[:12]:
            print("  ", r)
    print("\n완료 — 후처리: migrate_hsk_global_hs → reconstruct_mandatory → backfill_optional → Neo4j 재적재")


if __name__ == "__main__":
    main()
