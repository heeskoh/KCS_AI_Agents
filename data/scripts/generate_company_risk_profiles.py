"""기업 위험지표 근거 데이터 생성기 (STEP1~12, 2026 재설계).

원칙
----
1. 위험지표는 반드시 근거 데이터로 설명 가능해야 한다.
2. 위험지표가 높으면 관련 이력이 반드시 존재한다(근거 선생성 → 지표 산출).
3. 관련 데이터가 없으면 지표를 낮춘다(산출 엔진이 데이터 기반이므로 자동).
4. 서로 무관한 위험을 무작위로 동시 부여하지 않는다(지표별 독립 propensity).

흐름 (STEP1~12)
--------------
STEP1  기업정보            : company_profiles (기존)
STEP2  수출입 이력          : import_declarations(기존) + export_declaration 생성
STEP3  특수관계사           : related_party
STEP4  FTA 이력            : fta_claim + origin_verification
STEP5  관세환급 이력         : drawback + drawback_audit
STEP6  품목분류 이력         : hs_classification_event (+ classification_case_library 참조)
STEP7  외환거래 이력         : fx_transaction + offshore_company + forex_investigation
STEP8  조사/수사 이력        : valuation_audit + transfer_pricing_audit
STEP9  위험지표 계산         : src/risk_indicators.compute_company_indicators
STEP10 정합성 검증          : src/risk_indicators.validate_consistency (Rule 1~5)
STEP11 모순 보정            : 위반 시 최소 근거 레코드 보강 후 재산출
STEP12 최종 확정            : company_risk_indicator + import_risk_scores 기록

사용법
------
python data/scripts/generate_company_risk_profiles.py          # 전체 기업 재생성
(setup_db.py 가 시드 후 자동 호출)
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

from src import risk_indicators as ri  # noqa: E402

try:
    from risk_source_schema import (  # type: ignore  # noqa: E402
        COMPANY_SCOPED_TABLES, create_risk_source_schema,
    )
except ImportError:
    from data.scripts.risk_source_schema import (  # noqa: E402
        COMPANY_SCOPED_TABLES, create_risk_source_schema,
    )

REF_DATE = date(2026, 6, 15)
TAX_HAVENS = ["BVI", "케이맨", "파나마", "마샬제도", "홍콩"]
FTA_AGREEMENTS = ["한-아세안", "한-EU", "한-미", "한-중", "한-베트남"]
HIGH_RISK_HS_PREFIX = ("85", "84", "39", "62")  # 우범 분류 다발 군(샘플)

CASE_LIBRARY = [
    ("CL-001", "8542.31", "메모리 집적회로 분류 결정", "DRAM 모듈의 8542 해당 여부", "통칙3 적용 8542.32 분류"),
    ("CL-002", "3907.61", "PET 수지 점도 기준 분류", "고점도 PET의 3907.61 vs 3907.69", "점도 기준 3907.61 유지"),
    ("CL-003", "6204.62", "혼방 면바지 분류", "면 혼용률에 따른 6204 세분류", "혼용률 우선 6204.62"),
    ("CL-004", "8708.99", "자동차 부품 범용성 판단", "범용 부품의 8708 해당 여부", "전용성 인정 8708.99"),
    ("CL-005", "3304.99", "기능성 화장품 분류", "약리작용 화장품의 3304 vs 3004", "효능 미입증 3304.99"),
    ("CL-006", "8517.62", "복합 통신기기 분류", "다기능 단말의 주기능 판단", "주기능 통신 8517.62"),
]


def _seed(company_id: str) -> int:
    return sum(ord(c) * (i + 3) for i, c in enumerate(str(company_id))) + 50_021


def _d(days_ago: int) -> str:
    return (REF_DATE - timedelta(days=days_ago)).isoformat()


def _level(intensity: float) -> int:
    """0(없음) / 1(낮음) / 2(중간) / 3(높음)."""
    if intensity >= 75:
        return 3
    if intensity >= 55:
        return 2
    if intensity >= 35:
        return 1
    return 0


def _emphasis(rng: random.Random, base: float, boost: float = 0.0) -> float:
    """지표별 독립 강조도. 기업 위험점수에 지표마다 다른 계수(0.45~1.20)를 곱해
    일부 지표는 높게(level 3 도달 가능) 일부는 낮게 분산시킨다(원칙 4: 무관 위험 동시부여 금지)."""
    return max(0.0, min(100.0, base * rng.uniform(0.45, 1.20) + rng.uniform(-12, 12) + boost))


class _Ids:
    """테이블별 자동증가 id 카운터."""

    def __init__(self) -> None:
        self._n: dict[str, int] = {}

    def next(self, table: str) -> int:
        self._n[table] = self._n.get(table, 0) + 1
        return self._n[table]


# ── 기업 1곳의 근거 레코드 생성 (STEP2~8) ────────────────────────────────────

def _generate_company_sources(
    company: dict[str, Any], decls: list[dict[str, Any]],
    rng: random.Random, ids: _Ids,
) -> dict[str, list[dict[str, Any]]]:
    cid = company["company_id"]
    base = float(company.get("risk_score") or 50.0)
    import_amt = float(company.get("annual_import_amount") or 2_000_000_000)
    related_hint = str(company.get("related_companies") or "").strip()
    has_related_hint = related_hint and related_hint.lower() not in {"none", "nan"}
    hs_codes = sorted({d["hs_code"] for d in decls if d.get("hs_code")}) or ["8542.31"]

    out: dict[str, list[dict[str, Any]]] = {t: [] for t in COMPANY_SCOPED_TABLES}

    # 지표별 독립 propensity (원칙 4: 무관한 위험 무작위 동시부여 금지)
    lv_under = _level(_emphasis(rng, base))
    lv_related = _level(_emphasis(rng, base, boost=12 if has_related_hint else 0))
    lv_fta = _level(_emphasis(rng, base))
    lv_refund = _level(_emphasis(rng, base))
    lv_hs = _level(_emphasis(rng, base))
    lv_offshore = _level(_emphasis(rng, base, boost=10 if has_related_hint else 0))

    # STEP2: 수출입 이력 — export_declaration (환급 연결용)
    n_exp = {0: 1, 1: 2, 2: 3, 3: 4}[max(lv_refund, 1)]
    for _ in range(n_exp):
        hs = rng.choice(hs_codes)
        out["export_declaration"].append({
            "id": ids.next("export_declaration"), "company_id": cid,
            "declaration_no": f"EXP-{ids._n['export_declaration']:06d}",
            "hs_code": hs, "item_name": next((d["item_name"] for d in decls if d["hs_code"] == hs), "수출품"),
            "export_value": round(import_amt * rng.uniform(0.05, 0.25)),
            "dest_country": rng.choice(["USA", "CHN", "VNM", "JPN", "DEU"]),
            "export_date": _d(rng.randint(30, 900)), "status": "NORMAL",
        })

    # STEP3: 특수관계사 — related_party
    n_related = {0: 0, 1: 1, 2: 3, 3: 5}[lv_related]
    for i in range(n_related):
        main = i == 0
        offshore = main and lv_offshore >= 2
        out["related_party"].append({
            "id": ids.next("related_party"), "company_id": cid,
            "party_name": related_hint if (main and has_related_hint) else f"{cid} 특수관계사{i+1}",
            "country": rng.choice(TAX_HAVENS) if offshore else rng.choice(["CHN", "HKG", "SGP", "USA"]),
            "relation_type": rng.choice(["모회사", "자회사", "계열사"]) if main else "특수관계",
            "shareholding_pct": round(rng.uniform(30, 90) if main else rng.uniform(5, 40), 1),
            "trade_share_pct": round({1: rng.uniform(20, 40), 2: rng.uniform(45, 70),
                                      3: rng.uniform(70, 88)}[lv_related] if main else rng.uniform(3, 18), 1),
            "is_offshore": offshore, "note": None,
        })
    # 이전가격 조사이력 (특수관계 높을 때)
    if lv_related >= 3:
        out["transfer_pricing_audit"].append({
            "id": ids.next("transfer_pricing_audit"), "company_id": cid,
            "audit_date": _d(rng.randint(60, 800)),
            "abnormal_margin_rate": round(rng.uniform(18, 35), 1),
            "result": "추징", "recovered_amount": round(import_amt * rng.uniform(0.01, 0.04)),
            "note": "특수관계 거래가격 비정상 마진",
        })

    # STEP4: FTA 이력 — fta_claim + origin_verification
    n_claims = {0: 0, 1: 1, 2: 2, 3: 3}[lv_fta]
    co_no_pool: list[str] = []
    for i in range(n_claims):
        hs = rng.choice(hs_codes)
        co_no = f"CO-{cid[-4:]}-{i+1:02d}"
        co_no_pool.append(co_no)
        status = "정상" if lv_fta <= 1 else rng.choice(["오류", "미제출", "정상"])
        out["fta_claim"].append({
            "id": ids.next("fta_claim"), "company_id": cid,
            "agreement": rng.choice(FTA_AGREEMENTS), "hs_code": hs, "co_no": co_no,
            "co_status": status, "reduction_amount": round(import_amt * rng.uniform(0.01, 0.06)),
            "claim_date": _d(rng.randint(30, 800)),
            "is_high_risk_hs": hs.replace(".", "").startswith(HIGH_RISK_HS_PREFIX),
        })
    n_fail = {0: 0, 1: 0, 2: 1, 3: 2}[lv_fta]
    for i in range(min(n_fail, len(co_no_pool)) or (1 if lv_fta >= 2 else 0)):
        ref = co_no_pool[i] if i < len(co_no_pool) else None
        out["origin_verification"].append({
            "id": ids.next("origin_verification"), "company_id": cid,
            "fta_claim_ref": ref, "verify_date": _d(rng.randint(20, 600)),
            "verify_result": "실패" if lv_fta >= 2 else "성공",
            "recovered_amount": round(import_amt * rng.uniform(0.01, 0.05)) if lv_fta >= 2 else 0,
            "agency": "원산지검증과", "note": None,
        })

    # STEP5: 관세환급 — drawback + drawback_audit
    n_db = {0: 0, 1: 1, 2: 2, 3: 3}[lv_refund]
    exp_refs = [e["declaration_no"] for e in out["export_declaration"]]
    for i in range(n_db):
        status = {0: "정상", 1: "정상", 2: rng.choice(["과다", "정상"]),
                  3: rng.choice(["부인", "과다", "반복"])}[lv_refund]
        out["drawback"].append({
            "id": ids.next("drawback"), "company_id": cid,
            "drawback_no": f"DBK-{ids._n['drawback']:06d}",
            "claim_amount": round(import_amt * rng.uniform(0.005, 0.03)),
            "bom_ref": f"BOM-{cid[-4:]}-{i+1:02d}", "status": status,
            "claim_date": _d(rng.randint(20, 700)),
            "export_decl_ref": rng.choice(exp_refs) if exp_refs else None,
        })
    if lv_refund >= 3:
        out["drawback_audit"].append({
            "id": ids.next("drawback_audit"), "company_id": cid,
            "audit_date": _d(rng.randint(30, 500)), "result": "추징",
            "recovered_amount": round(import_amt * rng.uniform(0.005, 0.02)),
            "finding": "허위BOM의심", "note": "소요량 과다 산정 의심",
        })

    # STEP6: 품목분류 이력 — hs_classification_event
    counts = {0: (0, 0, 0), 1: (1, 0, 1), 2: (3, 1, 3), 3: (6, 2, 5)}[lv_hs]
    n_corr, n_review, n_ai = counts
    for _ in range(n_corr):
        out["hs_classification_event"].append({
            "id": ids.next("hs_classification_event"), "company_id": cid,
            "event_date": _d(rng.randint(20, 800)), "event_type": "정정",
            "declared_hs": rng.choice(hs_codes), "ai_suggested_hs": None,
            "case_ref": None, "note": "신고 후 품목분류 정정",
        })
    for _ in range(n_review):
        out["hs_classification_event"].append({
            "id": ids.next("hs_classification_event"), "company_id": cid,
            "event_date": _d(rng.randint(20, 800)), "event_type": "심사",
            "declared_hs": rng.choice(hs_codes), "ai_suggested_hs": None,
            "case_ref": None, "note": "품목분류 사전심사",
        })
    for _ in range(n_ai):
        case = rng.choice(CASE_LIBRARY)
        out["hs_classification_event"].append({
            "id": ids.next("hs_classification_event"), "company_id": cid,
            "event_date": _d(rng.randint(10, 400)), "event_type": "AI불일치",
            "declared_hs": rng.choice(hs_codes), "ai_suggested_hs": case[1],
            "case_ref": case[0], "note": "AI 추천 분류와 신고 불일치",
        })

    # STEP7: 외환거래 — fx_transaction + offshore_company + forex_investigation
    n_offshore = {0: 0, 1: 0, 2: 1, 3: 3}[lv_offshore]
    haven = rng.choice(TAX_HAVENS[:4])  # 페이퍼 다발 관할지
    for i in range(n_offshore):
        out["offshore_company"].append({
            "id": ids.next("offshore_company"), "company_id": cid,
            "entity_name": f"{cid[-4:]} {haven} Holdings {i+1}", "jurisdiction": haven,
            "is_paper_company": lv_offshore >= 3, "ownership_pct": round(rng.uniform(50, 100), 1),
            "note": None,
        })
    n_fx = {0: 0, 1: 1, 2: 2, 3: 4}[lv_offshore]
    for _ in range(n_fx):
        to_haven = lv_offshore >= 2
        out["fx_transaction"].append({
            "id": ids.next("fx_transaction"), "company_id": cid,
            "txn_date": _d(rng.randint(10, 700)),
            "amount": round(import_amt * rng.uniform(0.05, 0.5)), "direction": "송금",
            "counterpart_country": haven if to_haven else rng.choice(["CHN", "USA", "SGP"]),
            "counterpart_name": f"해외거래처{rng.randint(1, 9)}", "is_tax_haven": to_haven,
            "note": None,
        })
    if lv_offshore >= 3:
        out["forex_investigation"].append({
            "id": ids.next("forex_investigation"), "company_id": cid,
            "investigation_date": _d(rng.randint(30, 400)), "result": "적발",
            "amount": round(import_amt * rng.uniform(0.05, 0.3)),
            "agency": "외환조사과", "note": "무역대금 가장 자금유출 의심",
        })

    # STEP8: 조사/수사 — valuation_audit (저가)
    if lv_under >= 1:
        out["valuation_audit"].append({
            "id": ids.next("valuation_audit"), "company_id": cid,
            "audit_date": _d(rng.randint(40, 700)), "audit_type": "정정신고",
            "hs_code": rng.choice(hs_codes), "result": "정정",
            "adjusted_amount": round(import_amt * rng.uniform(0.005, 0.02)), "note": "과세가격 정정",
        })
    if lv_under >= 2:
        for _ in range(lv_under - 1):
            out["valuation_audit"].append({
                "id": ids.next("valuation_audit"), "company_id": cid,
                "audit_date": _d(rng.randint(40, 700)), "audit_type": "정정신고",
                "hs_code": rng.choice(hs_codes), "result": "정정",
                "adjusted_amount": round(import_amt * rng.uniform(0.005, 0.02)), "note": "과세가격 정정",
            })
    if lv_under >= 3:
        out["valuation_audit"].append({
            "id": ids.next("valuation_audit"), "company_id": cid,
            "audit_date": _d(rng.randint(40, 600)), "audit_type": "저가신고적발",
            "hs_code": rng.choice(hs_codes), "result": "추징",
            "adjusted_amount": round(import_amt * rng.uniform(0.02, 0.06)), "note": "저가신고 적발 추징",
        })

    return out


def _build_ctx(company: dict, decls: list[dict], benchmark: dict[str, float],
               sources: dict[str, list[dict]]) -> dict[str, Any]:
    ctx: dict[str, Any] = {"declarations": decls, "price_benchmark": benchmark}
    ctx.update(sources)
    return ctx


# ── 정합성 보정 (STEP11) ─────────────────────────────────────────────────────

def _repair(company: dict, ids: _Ids, sources: dict[str, list[dict]],
            violations: list[ri.Violation], rng: random.Random) -> None:
    """위반 지표마다 최소 근거 레코드 1건을 보강한다."""
    cid = company["company_id"]
    for v in violations:
        if v.indicator == "fta_origin_misuse":
            sources["origin_verification"].append({
                "id": ids.next("origin_verification"), "company_id": cid,
                "fta_claim_ref": None, "verify_date": _d(rng.randint(20, 400)),
                "verify_result": "실패", "recovered_amount": 0,
                "agency": "원산지검증과", "note": "정합성 보정 생성",
            })
        elif v.indicator == "offshore_fund":
            sources["fx_transaction"].append({
                "id": ids.next("fx_transaction"), "company_id": cid,
                "txn_date": _d(rng.randint(20, 400)), "amount": 0, "direction": "송금",
                "counterpart_country": "BVI", "counterpart_name": "보정거래처",
                "is_tax_haven": True, "note": "정합성 보정 생성",
            })
        elif v.indicator == "related_party":
            sources["related_party"].append({
                "id": ids.next("related_party"), "company_id": cid,
                "party_name": f"{cid} 특수관계사", "country": "CHN",
                "relation_type": "특수관계", "shareholding_pct": 10.0,
                "trade_share_pct": 5.0, "is_offshore": False, "note": "정합성 보정 생성",
            })
        elif v.indicator == "hs_classification":
            sources["hs_classification_event"].append({
                "id": ids.next("hs_classification_event"), "company_id": cid,
                "event_date": _d(rng.randint(20, 400)), "event_type": "정정",
                "declared_hs": None, "ai_suggested_hs": None, "case_ref": None,
                "note": "정합성 보정 생성",
            })
        elif v.indicator == "customs_refund":
            sources["drawback"].append({
                "id": ids.next("drawback"), "company_id": cid,
                "drawback_no": f"DBK-{ids._n.get('drawback', 0)+1:06d}",
                "claim_amount": 0, "bom_ref": None, "status": "정상",
                "claim_date": _d(rng.randint(20, 400)), "export_decl_ref": None,
            })


# ── 전체 생성 (STEP9~12 포함) ────────────────────────────────────────────────

def _insert(conn: duckdb.DuckDBPyConnection, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    collist = ", ".join(cols)
    ph = ", ".join("?" * len(cols))
    conn.executemany(
        f"INSERT INTO {table} ({collist}) VALUES ({ph})",
        [[r.get(c) for c in cols] for r in rows],
    )


def generate_all(conn: duckdb.DuckDBPyConnection, verbose: bool = True) -> dict[str, int]:
    create_risk_source_schema(conn)

    # 초기화: 기업종속 소스 + company_risk_indicator + import_risk_scores 비우기
    for t in COMPANY_SCOPED_TABLES:
        conn.execute(f"DELETE FROM {t}")
    conn.execute("DELETE FROM import_risk_scores")
    conn.execute("DELETE FROM price_benchmark")
    conn.execute("DELETE FROM classification_case_library")

    # price_benchmark: HS별 평균 신고금액 (전체 신고 기준)
    bench_rows = conn.execute(
        """
        SELECT hs_code, AVG(declared_value) AS avg_val, COUNT(*) AS n
        FROM import_declarations WHERE hs_code IS NOT NULL
        GROUP BY hs_code
        """
    ).fetchall()
    benchmark = {hs: float(avg) for hs, avg, _ in bench_rows}
    _insert(conn, "price_benchmark", [
        {"hs_code": hs, "period": "2025", "avg_declared_value": round(float(avg)),
         "sample_size": int(n), "currency": "KRW", "source": "import_declarations 집계"}
        for hs, avg, n in bench_rows
    ])

    # classification_case_library (참조 사례)
    _insert(conn, "classification_case_library", [
        {"case_id": c[0], "hs_code": c[1], "title": c[2], "summary": c[3], "ruling": c[4]}
        for c in CASE_LIBRARY
    ])

    companies = conn.execute("SELECT * FROM company_profiles ORDER BY company_id").df().to_dict("records")
    decls_all = conn.execute("SELECT * FROM import_declarations").df().to_dict("records")
    decls_by_company: dict[str, list[dict]] = {}
    for d in decls_all:
        decls_by_company.setdefault(d["company_id"], []).append(d)

    ids = _Ids()
    accum: dict[str, list[dict]] = {t: [] for t in COMPANY_SCOPED_TABLES}
    indicator_rows: list[dict] = []
    risk_score_rows: list[dict] = []
    repaired = 0

    for company in companies:
        cid = company["company_id"]
        rng = random.Random(_seed(cid))
        decls = decls_by_company.get(cid, [])

        # STEP2~8
        sources = _generate_company_sources(company, decls, rng, ids)
        # STEP9
        ctx = _build_ctx(company, decls, benchmark, sources)
        results = ri.compute_company_indicators(ctx)
        # STEP10~11
        violations = ri.validate_consistency(results, ctx)
        if violations:
            _repair(company, ids, sources, violations, rng)
            ctx = _build_ctx(company, decls, benchmark, sources)
            results = ri.compute_company_indicators(ctx)
            repaired += 1

        # STEP12: company_risk_indicator
        for code in ri.INDICATOR_ORDER:
            r = results[code]
            indicator_rows.append({
                "id": ids.next("company_risk_indicator"), "company_id": cid,
                "indicator_code": r.code, "indicator_name": r.name, "score": r.score,
                "reason": r.reason_text or "근거 데이터 없음",
                "related_refs": json.dumps(r.refs, ensure_ascii=False),
                "recommendation": r.recommendation,
                "calculated_at": "2026-06-15 09:00:00",
            })

        # STEP12: import_risk_scores (요약 6 rate + overall)
        rates = {ri.INDICATOR_TO_RATE_FIELD[c]: results[c].score for c in ri.INDICATOR_ORDER}
        overall = round(sum(results[c].score for c in ri.INDICATOR_ORDER) / 6.0, 1)
        risk_score_rows.append({
            "id": ids.next("import_risk_scores"), "company_id": cid,
            "risk_level": "HIGH" if overall >= 70 else "MEDIUM" if overall >= 45 else "LOW",
            "risk_score": overall,
            **rates,
            "generated_at": "2026-06-15 09:00:00",
        })

        for t, rows in sources.items():
            accum[t].extend(rows)

    # 일괄 적재
    for t, rows in accum.items():
        _insert(conn, t, rows)
    _insert(conn, "company_risk_indicator", indicator_rows)
    _insert(conn, "import_risk_scores", risk_score_rows)

    stats = {t: len(rows) for t, rows in accum.items()}
    stats["company_risk_indicator"] = len(indicator_rows)
    stats["import_risk_scores"] = len(risk_score_rows)
    stats["companies"] = len(companies)
    stats["repaired"] = repaired

    if verbose:
        print(f"  기업 {len(companies)}개 위험지표 재생성 (보정 {repaired}건)")
        for t in COMPANY_SCOPED_TABLES:
            print(f"    {t}: {stats[t]}")
    return stats


def main() -> None:
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as conn:
        generate_all(conn, verbose=True)
    print("완료")


if __name__ == "__main__":
    main()
