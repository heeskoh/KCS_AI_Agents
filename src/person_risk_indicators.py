"""수사 도메인(일반/마약/외환) 위험지표 산출 엔진 + 정합성 규칙 (2026 재설계).

회사 측 src/risk_indicators.py 와 대칭. 한 대상(person)의 근거 소스 레코드(dict 묶음)를
입력받아 도메인별 6종 지표의 (점수·근거·참조·권고)를 산출한다. DB 쓰기 없음.

소스 스키마: data/scripts/person_risk_source_schema.py
공용 자료구조/헬퍼는 src.risk_indicators 에서 재사용.
"""
from __future__ import annotations

from typing import Any

from src.risk_indicators import (
    IndicatorResult, Violation, _clamp, _won, _rows, normalize_ctx,
)

# ── 도메인별 6지표 메타 ───────────────────────────────────────────────────────

INDICATOR_NAMES: dict[str, str] = {
    # 일반수사
    "general_route": "고위험 경로 반복",
    "general_network": "우범자 관계망 근접",
    "general_small_batch": "소량 분산 반입",
    "general_prior_record": "적발·수사 이력",
    "general_concealment": "은닉수법 정교성",
    "general_identity": "허위신고·명의도용",
    # 마약수사
    "drug_route": "고위험 마약경로",
    "drug_network": "마약 전력자 관계망",
    "drug_small_batch": "소량 반복 반입",
    "drug_concealment": "은닉수법 위험도",
    "drug_new_substance": "신종마약·위해도",
    "drug_laundering": "자금세탁 연계",
    # 외환수사
    "fx_remittance": "해외송금 이상",
    "fx_hawala": "환치기·불법송금",
    "fx_asset_flight": "재산 국외도피",
    "fx_offshore": "페이퍼·조세회피처 연계",
    "fx_virtual_asset": "가상자산 자금이동",
    "fx_structuring": "차명·분산거래",
}

DOMAIN_ORDER: dict[str, list[str]] = {
    "general": ["general_route", "general_network", "general_small_batch",
                "general_prior_record", "general_concealment", "general_identity"],
    "drug": ["drug_route", "drug_network", "drug_small_batch",
             "drug_concealment", "drug_new_substance", "drug_laundering"],
    "forex": ["fx_remittance", "fx_hawala", "fx_asset_flight",
              "fx_offshore", "fx_virtual_asset", "fx_structuring"],
}

RECOMMENDATIONS: dict[str, str] = {
    "general_route": "고위험 원산지·경유지 반복 이동 경위 및 동행자 확인 권고",
    "general_network": "기존 적발자와의 관계망 및 공범 연계 수사 권고",
    "general_small_batch": "소량 분산 반입 패턴의 동일 공급책 연결 여부 추적 권고",
    "general_prior_record": "과거 적발·송치 이력 기반 재범 위험 집중 관리 권고",
    "general_concealment": "은닉수법 정교화 정황에 대한 정밀 검사 권고",
    "general_identity": "허위신고·명의도용 정황의 실소유·실수입자 규명 권고",
    "drug_route": "마약 우범 경로 반복 이용에 대한 통제배달·세관 협력 검사 권고",
    "drug_network": "마약 전력자 관계망 및 자금·물품 연결고리 수사 권고",
    "drug_small_batch": "소량 반복 반입의 동일 조직 분산 반입 여부 추적 권고",
    "drug_concealment": "고위험 은닉수법(인체·우편 분산) 대비 정밀 검사 권고",
    "drug_new_substance": "신종마약·고위해 품목 식별 및 위해성 평가 권고",
    "drug_laundering": "마약 수익 자금세탁 흐름(차명·가상자산) 추적 권고",
    "fx_remittance": "비정상 해외송금 규모·빈도에 대한 외환거래 적정성 조사 권고",
    "fx_hawala": "환치기(불법 무등록 송금) 채널 및 상대방 규명 권고",
    "fx_asset_flight": "재산 국외도피 정황(가장거래·허위무역대금) 정밀 추적 권고",
    "fx_offshore": "조세회피처 페이퍼컴퍼니 실소유 및 자금흐름 외환조사 권고",
    "fx_virtual_asset": "가상자산을 통한 자금 국외이동 경로 추적 권고",
    "fx_structuring": "차명·분할(구조화) 거래의 자금 출처·귀속 규명 권고",
}

# 정합성 규칙: (지표코드 → (임계치, 근거테이블, 최소건수)). 지표>임계 시 근거 필수.
CONSISTENCY_RULES: dict[str, tuple[float, str]] = {
    "general_prior_record": (60.0, "person_seizure_record"),
    "general_identity": (60.0, "person_identity_flag"),
    "drug_route": (60.0, "person_route_event"),
    "drug_laundering": (70.0, "person_laundering_link"),
    "fx_remittance": (60.0, "person_fx_transaction"),
    "fx_offshore": (70.0, "person_offshore_link"),
    "fx_virtual_asset": (60.0, "person_virtual_asset_flow"),
}


def _result(code: str, score: float, reasons: list[str], refs: dict) -> IndicatorResult:
    return IndicatorResult(code, INDICATOR_NAMES[code], _clamp(score),
                           [r for r in reasons if r], refs, RECOMMENDATIONS[code])


# ── 일반수사 ─────────────────────────────────────────────────────────────────

def _general_route(ctx):
    rows = _rows(ctx, "person_route_event")
    n = len(rows)
    hi = sum(float(r.get("risk_weight") or 0) for r in rows)
    score = n * 10 + hi * 0.15
    top = max((r.get("origin_country") for r in rows), default=None)
    return _result("general_route", score,
                   [f"고위험 경로 {n}건" if n else "", f"주요 원산지 {top}" if top else ""],
                   {"person_route_event": [r.get("id") for r in rows]})


def _general_network(ctx):
    rows = _rows(ctx, "person_network_link")
    known = [r for r in rows if r.get("is_known_offender")]
    strength = max((float(r.get("strength") or 0) for r in rows), default=0.0)
    score = len(known) * 16 + strength * 30
    return _result("general_network", score,
                   [f"우범자 {len(known)}명과 직접 관계" if known else "",
                    f"최대 관계강도 {strength:.2f}" if strength else ""],
                   {"person_network_link": [r.get("id") for r in rows]})


def _general_small_batch(ctx):
    rows = [r for r in _rows(ctx, "person_seizure_record") if r.get("is_small_batch")]
    score = len(rows) * 14
    return _result("general_small_batch", score,
                   [f"소량 분산 반입 {len(rows)}회" if rows else ""],
                   {"person_seizure_record": [r.get("id") for r in rows]})


def _general_prior_record(ctx):
    rows = _rows(ctx, "person_seizure_record")
    sent = [r for r in rows if r.get("case_status") in ("송치", "처분")]
    score = len(rows) * 10 + len(sent) * 10
    return _result("general_prior_record", score,
                   [f"적발 이력 {len(rows)}건" if rows else "",
                    f"송치·처분 {len(sent)}건" if sent else ""],
                   {"person_seizure_record": [r.get("id") for r in rows]})


def _general_concealment(ctx):
    rows = _rows(ctx, "person_concealment_event")
    soph = max((float(r.get("sophistication_score") or 0) for r in rows), default=0.0)
    methods = sorted({r.get("method") for r in rows if r.get("method")})
    score = len(rows) * 8 + soph * 0.5
    return _result("general_concealment", score,
                   [f"은닉수법 {len(rows)}건({', '.join(methods)})" if rows else "",
                    f"수법 정교성 {soph:.0f}" if soph else ""],
                   {"person_concealment_event": [r.get("id") for r in rows]})


def _general_identity(ctx):
    rows = _rows(ctx, "person_identity_flag")
    by_type: dict[str, int] = {}
    for r in rows:
        t = r.get("flag_type") or "기타"
        by_type[t] = by_type.get(t, 0) + 1
    score = len(rows) * 18
    return _result("general_identity", score,
                   [f"{t} {c}건" for t, c in by_type.items()],
                   {"person_identity_flag": [r.get("id") for r in rows]})


# ── 마약수사 ─────────────────────────────────────────────────────────────────

def _drug_route(ctx):
    rows = [r for r in _rows(ctx, "person_route_event") if r.get("is_drug_route")]
    hi = sum(float(r.get("risk_weight") or 0) for r in rows)
    score = len(rows) * 14 + hi * 0.12
    return _result("drug_route", score,
                   [f"마약 우범경로 {len(rows)}건" if rows else ""],
                   {"person_route_event": [r.get("id") for r in rows]})


def _drug_network(ctx):
    rows = [r for r in _rows(ctx, "person_network_link") if r.get("is_known_offender")]
    strength = max((float(r.get("strength") or 0) for r in rows), default=0.0)
    score = len(rows) * 18 + strength * 25
    return _result("drug_network", score,
                   [f"마약 전력자 {len(rows)}명 관계" if rows else "",
                    f"최대 관계강도 {strength:.2f}" if strength else ""],
                   {"person_network_link": [r.get("id") for r in rows]})


def _drug_small_batch(ctx):
    rows = [r for r in _rows(ctx, "person_seizure_record")
            if r.get("is_small_batch") and r.get("contraband_category") == "마약류"]
    score = len(rows) * 16
    return _result("drug_small_batch", score,
                   [f"소량 반복 반입 {len(rows)}회" if rows else ""],
                   {"person_seizure_record": [r.get("id") for r in rows]})


def _drug_concealment(ctx):
    rows = _rows(ctx, "person_concealment_event")
    soph = max((float(r.get("sophistication_score") or 0) for r in rows), default=0.0)
    methods = sorted({r.get("method") for r in rows if r.get("method")})
    score = len(rows) * 10 + soph * 0.6
    return _result("drug_concealment", score,
                   [f"은닉수법 {', '.join(methods)}" if methods else "",
                    f"수법 위험도 {soph:.0f}" if soph else ""],
                   {"person_concealment_event": [r.get("id") for r in rows]})


def _drug_new_substance(ctx):
    rows = [r for r in _rows(ctx, "person_seizure_record") if r.get("contraband_category") == "마약류"]
    new = [r for r in rows if r.get("is_new_substance")]
    harm = max((float(r.get("harm_weight") or 0) for r in rows), default=0.0)
    subs = sorted({r.get("contraband_sub") for r in new if r.get("contraband_sub")})
    score = len(new) * 18 + harm * 0.4
    return _result("drug_new_substance", score,
                   [f"신종마약 {len(new)}건({', '.join(subs)})" if new else "",
                    f"위해도 {harm:.0f}" if harm else ""],
                   {"person_seizure_record": [r.get("id") for r in rows]})


def _drug_laundering(ctx):
    rows = _rows(ctx, "person_laundering_link")
    amt = sum(float(r.get("amount") or 0) for r in rows)
    schemes = sorted({r.get("scheme") for r in rows if r.get("scheme")})
    score = len(rows) * 16 + min(20, amt / 5e9 * 20)
    return _result("drug_laundering", score,
                   [f"자금세탁 연계 {len(rows)}건({', '.join(schemes)})" if rows else "",
                    f"연계 금액 {_won(amt)}" if amt else ""],
                   {"person_laundering_link": [r.get("id") for r in rows]})


# ── 외환수사 ─────────────────────────────────────────────────────────────────

def _fx_remittance(ctx):
    rows = [r for r in _rows(ctx, "person_fx_transaction") if r.get("direction") == "송금"]
    amt = sum(float(r.get("amount") or 0) for r in rows)
    score = len(rows) * 8 + min(40, amt / 5e10 * 40)
    return _result("fx_remittance", score,
                   [f"해외송금 {len(rows)}건 {_won(amt)}" if rows else ""],
                   {"person_fx_transaction": [r.get("id") for r in rows]})


def _fx_hawala(ctx):
    rows = [r for r in _rows(ctx, "person_fx_transaction") if r.get("is_hawala")]
    amt = sum(float(r.get("amount") or 0) for r in rows)
    score = len(rows) * 18 + min(20, amt / 3e10 * 20)
    return _result("fx_hawala", score,
                   [f"환치기 의심 {len(rows)}건 {_won(amt)}" if rows else ""],
                   {"person_fx_transaction": [r.get("id") for r in rows]})


def _fx_asset_flight(ctx):
    rows = _rows(ctx, "person_asset_flight")
    amt = sum(float(r.get("amount") or 0) for r in rows)
    types = sorted({r.get("asset_type") for r in rows if r.get("asset_type")})
    score = len(rows) * 16 + min(24, amt / 5e10 * 24)
    return _result("fx_asset_flight", score,
                   [f"재산 국외도피 {len(rows)}건({', '.join(types)})" if rows else "",
                    f"도피 규모 {_won(amt)}" if amt else ""],
                   {"person_asset_flight": [r.get("id") for r in rows]})


def _fx_offshore(ctx):
    rows = _rows(ctx, "person_offshore_link")
    paper = [r for r in rows if r.get("is_paper")]
    juris: dict[str, int] = {}
    for r in rows:
        j = r.get("jurisdiction") or "역외"
        juris[j] = juris.get(j, 0) + 1
    score = len(rows) * 12 + len(paper) * 10
    top = max(juris, key=juris.get) if juris else None
    return _result("fx_offshore", score,
                   [f"{top} 법인 {juris[top]}개" if top else "",
                    f"페이퍼컴퍼니 {len(paper)}개" if paper else ""],
                   {"person_offshore_link": [r.get("id") for r in rows]})


def _fx_virtual_asset(ctx):
    rows = _rows(ctx, "person_virtual_asset_flow")
    amt = sum(float(r.get("amount_krw") or 0) for r in rows)
    assets = sorted({r.get("asset") for r in rows if r.get("asset")})
    score = len(rows) * 12 + min(28, amt / 3e10 * 28)
    return _result("fx_virtual_asset", score,
                   [f"가상자산 이동 {len(rows)}건({', '.join(assets)})" if rows else "",
                    f"이동 규모 {_won(amt)}" if amt else ""],
                   {"person_virtual_asset_flow": [r.get("id") for r in rows]})


def _fx_structuring(ctx):
    rows = [r for r in _rows(ctx, "person_fx_transaction")
            if r.get("is_structured") or r.get("is_nominee")]
    nominee = sum(1 for r in rows if r.get("is_nominee"))
    structured = sum(1 for r in rows if r.get("is_structured"))
    score = nominee * 14 + structured * 10
    return _result("fx_structuring", score,
                   [f"차명거래 {nominee}건" if nominee else "",
                    f"분산(구조화) 거래 {structured}건" if structured else ""],
                   {"person_fx_transaction": [r.get("id") for r in rows]})


_COMPUTERS = {
    "general_route": _general_route, "general_network": _general_network,
    "general_small_batch": _general_small_batch, "general_prior_record": _general_prior_record,
    "general_concealment": _general_concealment, "general_identity": _general_identity,
    "drug_route": _drug_route, "drug_network": _drug_network,
    "drug_small_batch": _drug_small_batch, "drug_concealment": _drug_concealment,
    "drug_new_substance": _drug_new_substance, "drug_laundering": _drug_laundering,
    "fx_remittance": _fx_remittance, "fx_hawala": _fx_hawala,
    "fx_asset_flight": _fx_asset_flight, "fx_offshore": _fx_offshore,
    "fx_virtual_asset": _fx_virtual_asset, "fx_structuring": _fx_structuring,
}


def compute_person_indicators(domain: str, ctx: dict[str, Any]) -> dict[str, IndicatorResult]:
    """도메인(general/drug/forex)의 6종 지표를 근거 소스(ctx)로부터 산출."""
    if domain not in DOMAIN_ORDER:
        raise ValueError(f"unknown domain: {domain}")
    ctx = normalize_ctx(ctx)
    return {code: _COMPUTERS[code](ctx) for code in DOMAIN_ORDER[domain]}


def validate_consistency(domain: str, results: dict[str, IndicatorResult],
                         ctx: dict[str, Any]) -> list[Violation]:
    """지표가 임계치를 넘으면 관련 근거 데이터가 존재해야 한다."""
    ctx = normalize_ctx(ctx)
    violations: list[Violation] = []
    for code in DOMAIN_ORDER[domain]:
        rule = CONSISTENCY_RULES.get(code)
        res = results.get(code)
        if rule and res and res.score > rule[0] and len(_rows(ctx, rule[1])) < 1:
            msg = f"{res.name} > {rule[0]:.0f} 이나 근거({rule[1]})가 없음"
            violations.append(Violation(code, res.score, msg, msg))
    return violations
