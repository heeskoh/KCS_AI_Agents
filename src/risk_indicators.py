"""기업 위험지표 6종 산출 엔진 + 정합성 규칙 (2026 재설계).

설계 원칙
--------
위험지표는 결과 숫자가 아니라 **근거 데이터의 집계 결과**다. 이 모듈은 DB 쓰기 없이,
한 기업의 근거 소스 레코드(dict 묶음)를 입력받아 지표별 (점수·근거·참조·권고)를 산출한다.
생성기(data/scripts/generate_company_risk_profiles.py)와 런타임 에이전트가 함께 재사용한다.

지표가 임계치를 넘으면 관련 근거 데이터가 반드시 존재하도록 `validate_consistency()`가
Rule 1~5를 검사한다. 생성기는 검증 실패 시 데이터를 보강(STEP11)하여 정합성을 보장한다.

소스 스키마: data/scripts/risk_source_schema.py
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

# ── 지표 메타데이터 (단일 소유) ──────────────────────────────────────────────

INDICATOR_NAMES: dict[str, str] = {
    "undervaluation": "저가신고 의심률",
    "related_party": "특수관계 이상률",
    "fta_origin_misuse": "FTA 원산지 오용 의심률",
    "customs_refund": "관세환급 이상률",
    "hs_classification": "HS 분류 오류율",
    "offshore_fund": "역외자금 은닉 의심률",
}

# 산출 순서 (프로파일 표시·저장 순서)
INDICATOR_ORDER: list[str] = list(INDICATOR_NAMES.keys())

# import_risk_scores 의 6개 rate 컬럼명 ↔ 지표 코드
INDICATOR_TO_RATE_FIELD: dict[str, str] = {
    "undervaluation": "undervaluation_suspicion_rate",
    "related_party": "related_party_anomaly_rate",
    "fta_origin_misuse": "fta_origin_misuse_suspicion_rate",
    "customs_refund": "customs_refund_anomaly_rate",
    "hs_classification": "hs_classification_error_rate",
    "offshore_fund": "offshore_fund_concealment_suspicion_rate",
}

RECOMMENDATIONS: dict[str, str] = {
    "undervaluation": "동일 HS 평균 신고금액 대비 저가 신고 여부 및 과세가격 적정성 정밀 심사 권고",
    "related_party": "특수관계사 거래가격(이전가격) 적정성 및 거래비중 집중도 심층 조사 권고",
    "fta_origin_misuse": "FTA 협정관세 적용 원산지(C/O) 진위 및 직접운송 요건 검증 권고",
    "customs_refund": "관세환급 소요량(BOM) 산정 적정성 및 과다·반복 환급 정밀 심사 권고",
    "hs_classification": "신고 HS 품목분류 적정성 재검토 및 사전심사 신청 권고",
    "offshore_fund": "역외법인·조세회피처 자금흐름 및 외환거래 적정성 외환조사 권고",
}

# 정합성 규칙 임계치 (지표 점수 > threshold → 근거 존재 필수)
CONSISTENCY_RULES: dict[str, float] = {
    "fta_origin_misuse": 60.0,   # Rule-1: 원산지 검증 이력 ≥1
    "offshore_fund": 70.0,       # Rule-2: 해외송금 또는 조세회피처 거래 ≥1
    "related_party": 50.0,       # Rule-3: 특수관계사 ≥1
    "hs_classification": 60.0,   # Rule-4: 품목분류 정정 이력 ≥1
    "customs_refund": 60.0,      # Rule-5: 환급 또는 환급심사 이력 ≥1
}


# ── 결과 자료구조 ────────────────────────────────────────────────────────────

@dataclass
class IndicatorResult:
    code: str
    name: str
    score: float
    reasons: list[str] = field(default_factory=list)
    refs: dict[str, Any] = field(default_factory=dict)
    recommendation: str = ""

    @property
    def reason_text(self) -> str:
        return "\n".join(f"- {r}" for r in self.reasons)


@dataclass
class Violation:
    indicator: str
    score: float
    rule: str
    message: str


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _clamp(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def _won(amount: float) -> str:
    """원 금액을 억원 단위 사람이 읽는 문자열로."""
    if not amount:
        return "0원"
    if amount >= 1e8:
        return f"{amount / 1e8:.1f}억원"
    if amount >= 1e4:
        return f"{amount / 1e4:.0f}만원"
    return f"{amount:.0f}원"


def _rows(ctx: dict[str, Any], key: str) -> list[dict[str, Any]]:
    return list(ctx.get(key) or [])


def _decl_nos_for_hs(decls: list[dict[str, Any]], hs_set: set) -> list[str]:
    """지표 근거 HS 집합(GlobalHS 6자리)과 일치하는 수입신고번호 목록(저가신고 벤치마크 갭 등)."""
    if not hs_set:
        return []
    return sorted({
        d.get("declaration_no") for d in decls
        if d.get("declaration_no") and (d.get("global_hs") or d.get("hs_code")) in hs_set
    })


def _refs(records: list[dict[str, Any]]) -> set:
    """근거 소스레코드가 직접 참조하는 수입신고번호(declaration_ref) 집합.

    원인분석: 근거가 개별 신고와 직결되도록 소스 생성 시 부여한 declaration_ref를 사용.
    """
    return {r.get("declaration_ref") for r in records if r.get("declaration_ref")}


def _clean_val(v: Any) -> Any:
    """pandas NaN(float)을 None으로 정규화 (DuckDB .df() 읽기 대비)."""
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def normalize_ctx(ctx: dict[str, Any]) -> dict[str, Any]:
    """ctx 내 모든 행(dict)의 NaN을 None으로 정규화. price_benchmark(dict)는 그대로."""
    out: dict[str, Any] = {}
    for key, value in ctx.items():
        if isinstance(value, list):
            out[key] = [{k: _clean_val(v) for k, v in row.items()} for row in value]
        else:
            out[key] = value
    return out


# ── 지표별 산출 ──────────────────────────────────────────────────────────────

def _compute_undervaluation(ctx: dict[str, Any]) -> IndicatorResult:
    decls = _rows(ctx, "declarations")
    bench: dict[str, float] = ctx.get("price_benchmark") or {}
    audits = _rows(ctx, "valuation_audit")
    related = _rows(ctx, "related_party")

    # 품목 유형(GlobalHS 6자리)별 회사 평균 신고금액 vs 벤치마크 → 가중 저가폭(%)
    by_hs: dict[str, list[float]] = {}
    for d in decls:
        hs = d.get("global_hs") or d.get("hs_code")
        if hs and d.get("declared_value"):
            by_hs.setdefault(hs, []).append(float(d["declared_value"]))
    gap_weighted, weight = 0.0, 0
    worst_gap = 0.0
    gap_hs: set = set()
    for hs, vals in by_hs.items():
        b = bench.get(hs)
        if not b:
            continue
        company_avg = sum(vals) / len(vals)
        below = max(0.0, (b - company_avg) / b * 100.0)
        gap_weighted += below * len(vals)
        weight += len(vals)
        worst_gap = max(worst_gap, below)
        if below > 0:
            gap_hs.add(hs)
    below_pct = (gap_weighted / weight) if weight else 0.0

    n_corr = sum(1 for a in audits if (a.get("audit_type") == "정정신고" or a.get("result") == "정정"))
    n_detect = sum(1 for a in audits if a.get("audit_type") == "저가신고적발")
    recovered = sum(float(a.get("adjusted_amount") or 0) for a in audits if a.get("result") == "추징")
    max_trade = max((float(r.get("trade_share_pct") or 0) for r in related), default=0.0)

    score = _clamp(below_pct * 1.4 + n_corr * 6 + n_detect * 12
                   + (10 if recovered > 0 else 0) + max_trade * 0.12)

    reasons: list[str] = []
    if below_pct >= 1:
        reasons.append(f"동일 HS 평균 신고금액 대비 {below_pct:.0f}% 저가")
    if n_corr:
        reasons.append(f"최근 과세가격 정정신고 {n_corr}건")
    if n_detect:
        reasons.append(f"저가신고 적발이력 {n_detect}건")
    if recovered > 0:
        reasons.append(f"과세가격 추징 {_won(recovered)}")
    if max_trade >= 1:
        reasons.append(f"특수관계 거래비중 {max_trade:.0f}%")

    # 기여 신고: 감사 근거가 직접 참조한 신고(declaration_ref) ∪ 벤치마크 갭 신고(HS)
    contrib = _refs(audits) | set(_decl_nos_for_hs(decls, gap_hs))
    return IndicatorResult(
        "undervaluation", INDICATOR_NAMES["undervaluation"], score, reasons,
        {"valuation_audit": [a.get("id") for a in audits], "worst_gap_pct": round(worst_gap, 1),
         "declarations": sorted(contrib)},
        RECOMMENDATIONS["undervaluation"],
    )


def _compute_related_party(ctx: dict[str, Any]) -> IndicatorResult:
    related = _rows(ctx, "related_party")
    tp = _rows(ctx, "transfer_pricing_audit")

    n_related = len(related)
    max_trade = max((float(r.get("trade_share_pct") or 0) for r in related), default=0.0)
    max_abnormal = max((float(t.get("abnormal_margin_rate") or 0) for t in tp), default=0.0)
    tp_recovered = sum(float(t.get("recovered_amount") or 0) for t in tp)

    score = _clamp(n_related * 6 + max_trade * 0.5
                   + (20 if tp else 0) + max_abnormal * 0.3)

    reasons = []
    if n_related:
        reasons.append(f"특수관계사 {n_related}개")
    if max_trade >= 1:
        reasons.append(f"거래비중 {max_trade:.0f}%")
    if tp:
        msg = "이전가격 조사이력 존재"
        if tp_recovered > 0:
            msg += f" (추징 {_won(tp_recovered)})"
        reasons.append(msg)
    if max_abnormal >= 1:
        reasons.append(f"비정상 마진율 {max_abnormal:.0f}%")

    return IndicatorResult(
        "related_party", INDICATOR_NAMES["related_party"], score, reasons,
        {"related_party": [r.get("id") for r in related],
         "transfer_pricing_audit": [t.get("id") for t in tp]},
        RECOMMENDATIONS["related_party"],
    )


def _compute_fta_origin_misuse(ctx: dict[str, Any]) -> IndicatorResult:
    claims = _rows(ctx, "fta_claim")
    verifs = _rows(ctx, "origin_verification")

    co_errors = sum(1 for c in claims if c.get("co_status") in ("오류", "미제출"))
    high_risk = sum(1 for c in claims if c.get("is_high_risk_hs"))
    verify_fail = sum(1 for v in verifs if v.get("verify_result") == "실패")
    recovered = sum(float(v.get("recovered_amount") or 0) for v in verifs)

    score = _clamp(verify_fail * 18 + co_errors * 10 + high_risk * 5
                   + (15 if recovered > 0 else 0))

    reasons = []
    if verify_fail:
        reasons.append(f"원산지 검증 실패 {verify_fail}건")
    if co_errors:
        reasons.append(f"C/O 오류·미제출 {co_errors}건")
    if high_risk:
        reasons.append(f"우범 HS 적용 {high_risk}건")
    if recovered > 0:
        reasons.append(f"FTA 추징금 {_won(recovered)}")

    err_claims = [c for c in claims
                  if c.get("co_status") in ("오류", "미제출") or c.get("is_high_risk_hs")]
    return IndicatorResult(
        "fta_origin_misuse", INDICATOR_NAMES["fta_origin_misuse"], score, reasons,
        {"fta_claim": [c.get("id") for c in claims],
         "origin_verification": [v.get("id") for v in verifs],
         "declarations": sorted(_refs(err_claims))},
        RECOMMENDATIONS["fta_origin_misuse"],
    )


def _compute_customs_refund(ctx: dict[str, Any]) -> IndicatorResult:
    drawbacks = _rows(ctx, "drawback")
    audits = _rows(ctx, "drawback_audit")

    denied = sum(1 for d in drawbacks if d.get("status") == "부인")
    excess = sum(1 for d in drawbacks if d.get("status") == "과다")
    repeat = sum(1 for d in drawbacks if d.get("status") == "반복")
    fake_bom = sum(1 for a in audits if "허위BOM" in str(a.get("finding") or ""))
    recovered = sum(float(a.get("recovered_amount") or 0) for a in audits)

    score = _clamp(denied * 14 + excess * 12 + repeat * 8 + fake_bom * 16
                   + (10 if recovered > 0 else 0))

    reasons = []
    if denied:
        reasons.append(f"환급 부인 {denied}건")
    if excess:
        reasons.append(f"과다환급 {excess}건")
    if repeat:
        reasons.append(f"반복환급 {repeat}건")
    if fake_bom:
        reasons.append("허위 BOM 의심")
    if recovered > 0:
        reasons.append(f"환급 추징 {_won(recovered)}")

    return IndicatorResult(
        "customs_refund", INDICATOR_NAMES["customs_refund"], score, reasons,
        {"drawback": [d.get("id") for d in drawbacks],
         "drawback_audit": [a.get("id") for a in audits]},
        RECOMMENDATIONS["customs_refund"],
    )


def _compute_hs_classification(ctx: dict[str, Any]) -> IndicatorResult:
    events = _rows(ctx, "hs_classification_event")

    corrections = sum(1 for e in events if e.get("event_type") == "정정")
    reviews = sum(1 for e in events if e.get("event_type") == "심사")
    ai_mismatch = sum(1 for e in events if e.get("event_type") == "AI불일치")
    case_refs = {e.get("case_ref") for e in events if e.get("case_ref")}

    score = _clamp(corrections * 8 + reviews * 6 + ai_mismatch * 7
                   + (10 if case_refs else 0))

    reasons = []
    if corrections:
        reasons.append(f"최근 품목분류 정정 {corrections}건")
    if reviews:
        reasons.append(f"품목분류 심사 {reviews}건")
    if ai_mismatch:
        reasons.append(f"AI 추천 불일치 {ai_mismatch}건")
    if case_refs:
        reasons.append(f"유사 분류사례 {len(case_refs)}건 존재")

    return IndicatorResult(
        "hs_classification", INDICATOR_NAMES["hs_classification"], score, reasons,
        {"hs_classification_event": [e.get("id") for e in events],
         "case_refs": sorted(c for c in case_refs if c),
         "declarations": sorted(_refs(events))},
        RECOMMENDATIONS["hs_classification"],
    )


def _compute_offshore_fund(ctx: dict[str, Any]) -> IndicatorResult:
    offshores = _rows(ctx, "offshore_company")
    fx = _rows(ctx, "fx_transaction")
    investigations = _rows(ctx, "forex_investigation")

    offshore_n = len(offshores)
    paper_n = sum(1 for o in offshores if o.get("is_paper_company"))
    haven_remit = [f for f in fx if f.get("is_tax_haven") and f.get("direction") == "송금"]
    haven_amount = sum(float(f.get("amount") or 0) for f in haven_remit)
    hits = sum(1 for i in investigations if i.get("result") == "적발")

    score = _clamp(offshore_n * 10 + paper_n * 8 + len(haven_remit) * 6
                   + min(20, haven_amount / 5e10 * 20) + hits * 18)

    reasons = []
    if offshore_n:
        # 대표 관할지 기준 "BVI 법인 N개"
        juris: dict[str, int] = {}
        for o in offshores:
            j = o.get("jurisdiction") or "역외"
            juris[j] = juris.get(j, 0) + 1
        top_j = max(juris, key=juris.get)
        reasons.append(f"{top_j} 법인 {juris[top_j]}개" if len(juris) == 1
                       else f"역외법인 {offshore_n}개({top_j} 등)")
    if haven_amount > 0:
        reasons.append(f"조세회피처 해외송금 {_won(haven_amount)}")
    if hits:
        reasons.append(f"외환조사 적발 {hits}건")

    return IndicatorResult(
        "offshore_fund", INDICATOR_NAMES["offshore_fund"], score, reasons,
        {"offshore_company": [o.get("id") for o in offshores],
         "fx_transaction": [f.get("id") for f in fx],
         "forex_investigation": [i.get("id") for i in investigations]},
        RECOMMENDATIONS["offshore_fund"],
    )


_COMPUTERS = {
    "undervaluation": _compute_undervaluation,
    "related_party": _compute_related_party,
    "fta_origin_misuse": _compute_fta_origin_misuse,
    "customs_refund": _compute_customs_refund,
    "hs_classification": _compute_hs_classification,
    "offshore_fund": _compute_offshore_fund,
}


def compute_company_indicators(ctx: dict[str, Any]) -> dict[str, IndicatorResult]:
    """한 기업의 근거 소스(ctx)로부터 6종 지표를 산출.

    ctx 키:
      declarations, price_benchmark(dict hs->avg), valuation_audit, related_party,
      transfer_pricing_audit, fta_claim, origin_verification, export_declaration,
      drawback, drawback_audit, hs_classification_event, fx_transaction,
      offshore_company, forex_investigation
    """
    ctx = normalize_ctx(ctx)
    return {code: _COMPUTERS[code](ctx) for code in INDICATOR_ORDER}


# ── 정합성 검증 (Rule 1~5) ───────────────────────────────────────────────────

def _has_evidence(indicator: str, ctx: dict[str, Any]) -> bool:
    if indicator == "fta_origin_misuse":            # Rule-1
        return len(_rows(ctx, "origin_verification")) >= 1
    if indicator == "offshore_fund":                # Rule-2
        return len(_rows(ctx, "fx_transaction")) >= 1 or len(_rows(ctx, "offshore_company")) >= 1
    if indicator == "related_party":                # Rule-3
        return len(_rows(ctx, "related_party")) >= 1
    if indicator == "hs_classification":            # Rule-4
        return any(e.get("event_type") == "정정" for e in _rows(ctx, "hs_classification_event"))
    if indicator == "customs_refund":               # Rule-5
        return len(_rows(ctx, "drawback")) >= 1 or len(_rows(ctx, "drawback_audit")) >= 1
    return True


_RULE_MSG = {
    "fta_origin_misuse": "FTA 원산지 오용 의심률 > 60 이나 원산지 검증 이력이 없음",
    "offshore_fund": "역외자금 은닉 의심률 > 70 이나 해외송금/조세회피처 거래가 없음",
    "related_party": "특수관계 이상률 > 50 이나 특수관계사 데이터가 없음",
    "hs_classification": "HS 분류 오류율 > 60 이나 품목분류 정정 이력이 없음",
    "customs_refund": "관세환급 이상률 > 60 이나 환급/환급심사 이력이 없음",
}


def validate_consistency(results: dict[str, IndicatorResult], ctx: dict[str, Any]) -> list[Violation]:
    """Rule 1~5: 지표가 임계치를 넘으면 관련 근거 데이터가 존재해야 한다."""
    ctx = normalize_ctx(ctx)
    violations: list[Violation] = []
    for indicator, threshold in CONSISTENCY_RULES.items():
        res = results.get(indicator)
        if res and res.score > threshold and not _has_evidence(indicator, ctx):
            violations.append(Violation(indicator, res.score, _RULE_MSG[indicator],
                                        _RULE_MSG[indicator]))
    return violations
