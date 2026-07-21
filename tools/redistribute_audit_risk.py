"""관세조사 대상(audit) 기업의 위험지표 재분산.

관세포탈 대시보드가 의미 있게 보이도록 70개사의 심사 6대 지표와 전체 위험도를
분포시킨다. 지표 → 위험도 순으로 산출하므로 카드 밴드·경보 수치·근거 건수가
모두 같은 근거에서 나온다.

전체 위험도 = 최고 지표 + 나머지 지표 평균의 12% 가산 (최대 99)
  → 가장 높은 위험지표가 조사 우선순위를 좌우하되, 여러 지표가 겹치면 가중된다.

밴드 목표 (기존 riskScoreBand와 동일 경계)
  90+    조사필요   6개사
  70~90  심사필요  10개사
  50~70  확인      15개사
  <50    낮음      39개사

지표별 50점 이상 기업수는 8~16개사가 되도록 주지표를 순환 배정하고
일부 기업에 부지표를 추가한다.

실행: python tools/redistribute_audit_risk.py [--db ...] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "customs.duckdb"
SEED = 20260723

# (지표코드, 지표명, import_risk_scores 컬럼, 근거 참조 키)
INDICATORS = [
    ("undervaluation", "저가신고 의심률", "undervaluation_suspicion_rate",
     ["valuation_audit", "declarations"]),
    ("hs_classification", "HS 분류 오류율", "hs_classification_error_rate",
     ["hs_classification_event", "case_refs", "declarations"]),
    ("related_party", "특수관계 이상률", "related_party_anomaly_rate",
     ["related_party", "transfer_pricing_audit"]),
    ("customs_refund", "관세환급 이상률", "customs_refund_anomaly_rate",
     ["drawback", "drawback_audit"]),
    ("offshore_fund", "역외자금 은닉 의심률", "offshore_fund_concealment_suspicion_rate",
     ["offshore_company", "fx_transaction", "forex_investigation"]),
    ("fta_origin_misuse", "FTA 원산지 오용 의심률", "fta_origin_misuse_suspicion_rate",
     ["fta_claim", "origin_verification", "declarations"]),
]
CODE_TO_COL = {c: col for c, _, col, _ in INDICATORS}
CODE_TO_KEYS = {c: k for c, _, _, k in INDICATORS}

# 밴드: (라벨, 기업수, 주지표 점수범위, 부지표 추가 확률)
BANDS = [
    ("조사필요", 6, (88, 98), 0.85),
    ("심사필요", 10, (70, 88), 0.55),
    ("확인", 15, (52, 70), 0.35),
    ("낮음", 39, (0, 44), 0.15),
]

REASON_TEMPLATES = {
    "undervaluation": ["- 동일 HS 평균 신고금액 대비 {p}% 저가", "- 최근 과세가격 정정신고 {n}건",
                       "- 저가신고 적발이력 {m}건", "- 과세가격 추징 {a}억원"],
    "hs_classification": ["- 최근 품목분류 정정 {n}건", "- 품목분류 심사 {m}건",
                          "- AI 추천 불일치 {p}건", "- 유사 분류사례 {m}건 존재"],
    "related_party": ["- 특수관계사 {n}개", "- 거래비중 {p}%",
                      "- 이전가격 조사이력 존재 (추징 {a}억원)", "- 비정상 마진율 {m}%"],
    "customs_refund": ["- 환급 부인 {m}건", "- 과다환급 {n}건",
                       "- 허위 BOM 의심", "- 환급 추징 {a}억원"],
    "offshore_fund": ["- 역외 법인 경유 대금지급 {n}건", "- 신고외 외환거래 {m}건",
                      "- 조세피난처 소재 거래처 {m}개", "- 미신고 송금 추정 {a}억원"],
    "fta_origin_misuse": ["- 협정관세 적용 {n}건 중 원산지 검증 요청 {m}건",
                          "- 제3국 경유 의심 {m}건", "- 원산지증명서 불일치 {p}%",
                          "- 감면세액 추징 {a}억원"],
}


def risk_from_indicators(scores: dict[str, float]) -> float:
    vals = list(scores.values())
    top = max(vals)
    rest = [v for v in vals if v is not top] or [0.0]
    return round(min(99.0, top + (sum(rest) / len(rest)) * 0.12), 1)


def level_of(score: float) -> str:
    if score >= 90:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 50:
        return "MEDIUM"
    return "LOW"


def build_reason(rng, code: str, score: float) -> str:
    if score < 1:
        return "근거 데이터 없음"
    lines = [t.format(n=rng.randint(2, 9), m=rng.randint(1, 5), p=rng.randint(18, 52),
                      a=round(rng.uniform(1.2, 28.0), 1)) for t in REASON_TEMPLATES[code]]
    return "\n".join(lines[: 2 if score < 50 else 3 if score < 70 else 4])


def build_refs(rng, code: str, score: float, decl_nos: list[str]) -> str:
    keys = CODE_TO_KEYS[code]
    refs: dict = {}
    if score < 1:
        return json.dumps({k: [] for k in keys}, ensure_ascii=False)
    # 점수가 높을수록 근거 레코드가 많아진다
    lo, hi = (2, 4) if score < 50 else (3, 7) if score < 70 else (5, 12)
    for k in keys:
        if k == "declarations":
            refs[k] = rng.sample(decl_nos, min(len(decl_nos), rng.randint(lo, hi))) if decl_nos else []
        else:
            refs[k] = list(range(1, rng.randint(lo, hi) + 1))
    if "valuation_audit" in keys:
        refs["worst_gap_pct"] = round(rng.uniform(18.0, 52.0), 1)
    return json.dumps(refs, ensure_ascii=False)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--dry-run", action="store_true", help="계산 결과만 출력하고 저장하지 않음")
    args = ap.parse_args()

    rng = random.Random(SEED)
    con = duckdb.connect(args.db, read_only=args.dry_run)

    cids = [r[0] for r in con.execute(
        "SELECT company_id FROM company_profiles WHERE entity_role='audit' ORDER BY company_id"
    ).fetchall()]
    total_quota = sum(b[1] for b in BANDS)
    if len(cids) != total_quota:
        print(f"경고: audit {len(cids)}개사 / 밴드 합계 {total_quota} — 마지막 밴드로 보정합니다")

    decl_map: dict[str, list[str]] = {}
    for cid, dno in con.execute(
        "SELECT company_id, declaration_no FROM import_declarations "
        "WHERE company_id IN (SELECT company_id FROM company_profiles WHERE entity_role='audit')"
    ).fetchall():
        decl_map.setdefault(cid, []).append(dno)

    shuffled = cids[:]
    rng.shuffle(shuffled)
    assignment: list[tuple[str, str, tuple[int, int], float]] = []
    pos = 0
    for label, count, rng_score, sec_p in BANDS:
        take = shuffled[pos:pos + count] if label != BANDS[-1][0] else shuffled[pos:]
        pos += count
        for cid in take:
            assignment.append((cid, label, rng_score, sec_p))

    codes = [c for c, _, _, _ in INDICATORS]
    results = []
    for idx, (cid, label, (lo, hi), sec_p) in enumerate(assignment):
        primary = codes[idx % len(codes)]              # 주지표를 순환 배정 → 지표별 균등 분산
        scores = {c: 0.0 for c in codes}
        scores[primary] = round(rng.uniform(lo, hi), 1)
        for c in codes:
            if c == primary:
                continue
            if rng.random() < sec_p:                   # 부지표 — 겹치는 위험 표현
                scores[c] = round(rng.uniform(30, min(hi, 78)), 1)
            elif rng.random() < 0.45:
                scores[c] = round(rng.uniform(3, 28), 1)
        risk = risk_from_indicators(scores)
        results.append((cid, label, risk, level_of(risk), scores))

    band_cnt: dict[str, int] = {}
    ind_cnt = {c: 0 for c in codes}
    for _, label, risk, _, scores in results:
        b = "90+" if risk >= 90 else "70-90" if risk >= 70 else "50-70" if risk >= 50 else "<50"
        band_cnt[b] = band_cnt.get(b, 0) + 1
        for c, v in scores.items():
            if v >= 50:
                ind_cnt[c] += 1
    print("위험도 밴드:", {k: band_cnt.get(k, 0) for k in ("90+", "70-90", "50-70", "<50")})
    print("지표별 50점 이상:", ind_cnt)

    if args.dry_run:
        print("(dry-run — 저장하지 않음)")
        return

    for cid, _label, risk, level, scores in results:
        con.execute("UPDATE company_profiles SET risk_score=?, risk_level=? WHERE company_id=?",
                    [risk, level, cid])
        sets = ", ".join(f"{CODE_TO_COL[c]}=?" for c in codes)
        con.execute(f"UPDATE import_risk_scores SET risk_score=?, risk_level=?, {sets} WHERE company_id=?",
                    [risk, level, *[scores[c] for c in codes], cid])
        dnos = decl_map.get(cid, [])
        for c in codes:
            con.execute(
                "UPDATE company_risk_indicator SET score=?, reason=?, related_refs=? "
                "WHERE company_id=? AND indicator_code=?",
                [scores[c], build_reason(rng, c, scores[c]),
                 build_refs(rng, c, scores[c], dnos), cid, c])
    con.close()
    print(f"완료 — {len(results)}개사 갱신")


if __name__ == "__main__":
    main()
