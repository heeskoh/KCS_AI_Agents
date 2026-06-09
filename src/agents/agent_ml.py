"""Agent: ML 모델 실행 — 시나리오 지시에 따라 적합한 모델을 선택하고 결과를 도출한다.

지원 모델
- industry_stats : 동종 업종 수입 통계
- hs_risk        : HS 코드별 수입 통계 및 위험점수
- hs_recommend   : 품목분류 추천
- anomaly        : 이상치 식별 (Z-score 기반)

데이터 부족 시 동작
- 대상 기업의 업종·규모·수입 패턴을 기반으로 동종 기업/신고 샘플 데이터를 인메모리 DB에 자동 생성
- 원본 DB는 절대 수정하지 않으며, 분석 결과에 샘플 보강 여부를 명시
"""
import random
from datetime import date, timedelta

import duckdb
import pandas as pd

from src.agents.state import CustomsState
from src.config import CFG
from src.llm import llm
from src.paths import DB_PATH

# ── 통계 모델 최소 데이터 기준 (thresholds.yaml: ml.min_peer_companies / ml.min_decl_per_hs)
MIN_PEER_COMPANIES = CFG.ml.min_peer_companies
MIN_DECL_PER_HS    = CFG.ml.min_decl_per_hs

MODEL_REGISTRY: dict[str, str] = {
    "industry_stats": "동종 업종 수입 통계 모델",
    "hs_risk":        "HS 코드별 수입 통계 및 위험점수 모델",
    "hs_recommend":   "품목분류 추천 모델",
    "anomaly":        "이상치 식별 모델",
}

_KEYWORDS: dict[str, list[str]] = {
    "industry_stats": ["업종", "동종", "통계", "비교"],
    "hs_risk":        ["hs", "품목코드", "위험점수", "리스크", "risk"],
    "hs_recommend":   ["분류", "추천", "hs코드", "품명"],
    "anomaly":        ["이상", "이상치", "anomaly", "편차", "outlier"],
}

_HS_HINTS: dict[str, tuple[str, list[str]]] = {
    "8504": ("전기변성기·정류기", ["8504.40 전력공급장치", "8504.31 변압기 ≤1kVA", "8504.50 인덕터"]),
    "8542": ("전자집적회로",     ["8542.31 프로세서·컨트롤러", "8542.32 메모리", "8542.39 기타"]),
    "3907": ("폴리에스터 수지",  ["3907.61 PET 수지", "3907.69 기타 폴리에스터", "3907.30 에폭시"]),
    "2709": ("원유",             ["2709.00 원유"]),
    "6109": ("의류",             ["6109.10 면 T셔츠", "6109.90 기타 소재 T셔츠"]),
    "8708": ("자동차 부품",      ["8708.99 기타 차체부품", "8708.40 변속기", "8708.30 브레이크"]),
    "8507": ("축전지",           ["8507.60 리튬이온 전지", "8507.10 납축전지"]),
    "3002": ("의약품·시약",      ["3002.15 진단용 항체", "3002.12 항혈청"]),
    "3304": ("화장품",           ["3304.99 기타 미용품", "3304.91 파우더류"]),
}

_LLM_PROMPT = """당신은 관세청 AI 데이터 분석 전문가입니다.
아래 ML 모델 실행 결과를 종합하여 관세 조사 관점의 위험 판단 및 조사 방향을 제시하세요.

분석 항목:
1. 위험 스코어 평가: 동종 업종 대비 위험 수준과 그 의미
2. 수입가격 이상치: 저가·고가 신고 패턴과 탈세 가능성
3. 품목분류 위험: 오분류 가능성이 있는 HS 코드
4. 종합 위험 판단: 위험등급(높음/보통/낮음)과 주요 근거 2~3개
5. 조사 권고사항: 우선 확인이 필요한 서류·자료

[ML 모델 실행 결과]
{ml_raw}

간결하고 실무적으로 작성하세요.
"""


# ── 샘플 데이터 생성 ───────────────────────────────────────────────────────────

def _company_seed(company_id: str) -> int:
    """기업 ID를 결정론적 난수 시드로 변환 (실행마다 동일한 샘플 생성 보장)."""
    return sum(ord(c) * (i + 1) for i, c in enumerate(company_id))


def _generate_peer_companies(
    company_info: pd.Series,
    n_virtual: int,
    rng: random.Random,
) -> tuple[pd.DataFrame, list[str]]:
    """대상 기업 프로파일 기반으로 동종 업종 가상 기업을 생성한다."""
    industry      = str(company_info["industry_code"])
    base_revenue  = float(company_info.get("annual_revenue") or 5_000_000_000)
    base_import   = float(company_info.get("annual_import_amount") or 2_000_000_000)
    base_risk     = float(company_info.get("risk_score") or 50.0)
    company_id    = str(company_info["company_id"])

    rows = []
    ids  = []
    for i in range(n_virtual):
        vid = f"SYN-{company_id}-P{i+1:02d}"
        ids.append(vid)

        risk_score = rng.gauss(base_risk, CFG.synthetic.risk_std)
        risk_score = round(max(CFG.synthetic.risk_min, min(CFG.synthetic.risk_max, risk_score)), 1)
        risk_level = "HIGH" if risk_score >= CFG.risk.high_score else "MEDIUM" if risk_score >= CFG.risk.medium_score else "LOW"

        rev_factor = max(CFG.synthetic.revenue_factor_min, min(CFG.synthetic.revenue_factor_max, rng.gauss(1.0, 0.4)))
        imp_factor = max(CFG.synthetic.import_factor_min,  min(CFG.synthetic.import_factor_max,  rng.gauss(1.0, 0.35)))

        rows.append({
            "company_id":               vid,
            "company_name":             f"(샘플){industry}업종기업{i+1:02d}",
            "business_registration_no": f"000-00-{90000 + i:05d}",
            "industry_code":            industry,
            "founded_year":             rng.randint(1995, 2022),
            "risk_level":               risk_level,
            "risk_score":               risk_score,
            "last_audit_date":          None,
            "address_postal_code":      "00000",
            "address":                  "(샘플 주소)",
            "address_detail":           "",
            "employee_count":           rng.randint(15, 400),
            "major_export_countries":   "중국",
            "customs_broker_firm":      "(샘플)관세법인",
            "related_companies":        None,
            "annual_revenue":           round(base_revenue * rev_factor),
            "annual_import_amount":     round(base_import * imp_factor),
            "declared_duty_amount":     round(base_import * imp_factor * rng.uniform(CFG.synthetic.duty_rate_min, CFG.synthetic.duty_rate_max)),
            "recent_customs_refund":    round(base_import * imp_factor * rng.uniform(CFG.synthetic.refund_rate_min, CFG.synthetic.refund_rate_max)),
            "fta_reduction_rate":       round(rng.uniform(CFG.synthetic.fta_rate_min, CFG.synthetic.fta_rate_max), 1),
        })

    return pd.DataFrame(rows), ids


def _generate_peer_declarations(
    company_decls: pd.DataFrame,
    all_decls:     pd.DataFrame,
    peer_ids:      list[str],
    rng:           random.Random,
) -> pd.DataFrame:
    """각 HS코드별로 비교 가능한 동종 신고 데이터를 생성한다.

    정상 범위(±25%) 거래 위주이나 일부 이상치(±40%)를 섞어
    Z-score 탐지가 의미 있게 동작하도록 분포를 구성한다.
    """
    status_pool = ["NORMAL"] * 7 + ["REVIEW"] * 2 + ["INSPECT"] * 1
    next_id     = int(all_decls["id"].max()) + 1 if len(all_decls) else 1001
    rows        = []

    for hs_code in company_decls["hs_code"].unique():
        existing_count = int((all_decls["hs_code"] == hs_code).sum())
        needed = max(0, MIN_DECL_PER_HS - existing_count)
        if needed == 0:
            continue

        ref_val  = float(company_decls.loc[company_decls["hs_code"] == hs_code, "declared_value"].mean())
        ref_item = company_decls.loc[company_decls["hs_code"] == hs_code, "item_name"].iloc[0]
        ref_origin = company_decls.loc[company_decls["hs_code"] == hs_code, "origin_country"].iloc[0]

        for _ in range(needed):
            if rng.random() < CFG.synthetic.anomaly_rate:
                factor = rng.gauss(CFG.synthetic.price_under_mean, CFG.synthetic.price_under_std)
            else:
                factor = rng.gauss(CFG.synthetic.price_normal_mean, CFG.synthetic.price_normal_std)

            factor   = max(CFG.synthetic.price_min, min(CFG.synthetic.price_max, factor))
            decl_val = round(ref_val * factor)
            days_ago = rng.randint(1, CFG.synthetic.days_ago_max)
            decl_date = (date.today() - timedelta(days=days_ago)).isoformat()

            rows.append({
                "id":             next_id,
                "company_id":     rng.choice(peer_ids),
                "declaration_no": f"SYN-{next_id:07d}",
                "hs_code":        hs_code,
                "item_name":      ref_item,
                "declared_value": decl_val,
                "origin_country": ref_origin,
                "import_date":    decl_date,
                "status":         rng.choice(status_pool),
            })
            next_id += 1

    return pd.DataFrame(rows) if rows else pd.DataFrame()


def _ensure_analysis_data(conn: duckdb.DuckDBPyConnection, company_id: str) -> tuple[bool, str]:
    """통계 분석에 필요한 최소 데이터가 없으면 DuckDB에 샘플 데이터를 영구 저장한다.

    이미 해당 기업의 샘플 데이터가 존재하면 중복 생성하지 않는다.
    커넥션은 호출자가 관리하며, 이 함수는 커넥션을 열거나 닫지 않는다.

    Returns:
        was_inserted : 이번 호출에서 새로 삽입된 경우 True
        note         : 결과에 표시할 내용 설명
    """
    decls_df     = conn.execute("SELECT * FROM import_declarations").df()
    companies_df = conn.execute("SELECT * FROM company_profiles").df()

    company_row = companies_df[companies_df["company_id"] == company_id]
    if company_row.empty:
        return False, ""

    company_info  = company_row.iloc[0]
    industry      = str(company_info["industry_code"])
    company_decls = decls_df[decls_df["company_id"] == company_id]

    if company_decls.empty:
        return False, ""

    peer_companies = companies_df[companies_df["industry_code"] == industry]
    hs_decl_counts = {
        hs: int((decls_df["hs_code"] == hs).sum())
        for hs in company_decls["hs_code"].unique()
    }

    needs_more_companies = len(peer_companies) < MIN_PEER_COMPANIES
    needs_more_hs_data   = any(cnt < MIN_DECL_PER_HS for cnt in hs_decl_counts.values())

    if not needs_more_companies and not needs_more_hs_data:
        return False, ""

    # 이미 이 기업용 샘플이 DB에 있으면 중복 삽입 방지
    syn_prefix = f"SYN-{company_id}-"
    if companies_df["company_id"].str.startswith(syn_prefix).any():
        return False, ""

    rng = random.Random(_company_seed(company_id))

    # ── 가상 기업 생성 및 삽입 ────────────────────────────────────────────────
    synthetic_companies_df = pd.DataFrame()
    synthetic_peer_ids: list[str] = [
        p for p in peer_companies["company_id"] if p != company_id
    ]

    if needs_more_companies:
        n_needed = max(0, MIN_PEER_COMPANIES - len(peer_companies)) + 2
        synthetic_companies_df, new_ids = _generate_peer_companies(
            company_info, n_needed, rng
        )
        synthetic_peer_ids += new_ids
        conn.register("_new_companies", synthetic_companies_df)
        conn.execute("INSERT INTO company_profiles SELECT * FROM _new_companies")

    # ── HS코드별 신고 보강 및 삽입 ────────────────────────────────────────────
    synthetic_decls_df = pd.DataFrame()
    if needs_more_hs_data and synthetic_peer_ids:
        current_decls = conn.execute("SELECT * FROM import_declarations").df()
        synthetic_decls_df = _generate_peer_declarations(
            company_decls, current_decls, synthetic_peer_ids, rng
        )
        if not synthetic_decls_df.empty:
            conn.register("_new_decls", synthetic_decls_df)
            conn.execute("INSERT INTO import_declarations SELECT * FROM _new_decls")

    note_parts = []
    if not synthetic_companies_df.empty:
        note_parts.append(f"동종 업종 샘플 기업 {len(synthetic_companies_df)}개")
    if not synthetic_decls_df.empty:
        note_parts.append(f"HS코드별 비교 신고 {len(synthetic_decls_df)}건")

    note = (
        f"※ 샘플 데이터 DB 등록: {', '.join(note_parts)} 추가 저장 (기업 프로파일 기반 시뮬레이션)"
        if note_parts else ""
    )
    print(f"[Agent] ML 샘플 데이터 저장: {note}")
    return bool(note_parts), note


# ── ML 모델 실행 함수들 ────────────────────────────────────────────────────────

def _run_industry_stats(conn, company_id: str) -> str:
    peer = conn.execute("""
        SELECT c.industry_code,
               COUNT(DISTINCT c.company_id)                    AS company_count,
               AVG(c.risk_score)                               AS avg_risk,
               STDDEV_SAMP(c.risk_score)                       AS std_risk,
               AVG(d.declared_value)                           AS avg_import,
               COUNT(d.id)                                     AS total_decls,
               SUM(CASE WHEN d.status IN ('REVIEW','INSPECT') THEN 1 ELSE 0 END) AS review_decls
        FROM company_profiles c
        LEFT JOIN import_declarations d ON c.company_id = d.company_id
        GROUP BY c.industry_code
    """).df()

    target = conn.execute(
        "SELECT industry_code, risk_score, annual_import_amount FROM company_profiles WHERE company_id=?",
        [company_id],
    ).df()

    lines = ["[동종 업종 수입 통계 모델]"]
    if target.empty:
        lines.append("- 기업 정보 없음")
        return "\n".join(lines)

    t   = target.iloc[0]
    ind = str(t["industry_code"])
    row = peer[peer["industry_code"] == ind]
    if row.empty:
        lines.append(f"- 업종코드 {ind}: 동종 데이터 없음")
        return "\n".join(lines)

    p        = row.iloc[0]
    avg_risk = float(p["avg_risk"] or 0)
    std_risk = float(p["std_risk"] or 0)
    my_risk  = float(t["risk_score"] or 0)
    diff     = my_risk - avg_risk
    z_risk   = diff / std_risk if std_risk > 0 else 0

    if z_risk > CFG.ml.industry_zscore_high:
        risk_flag = "🔴 동종 대비 이상 고위험"
    elif z_risk > CFG.ml.industry_zscore_medium:
        risk_flag = "🟡 동종 평균 초과"
    elif z_risk > -0.5:
        risk_flag = "🟢 동종 평균 수준"
    else:
        risk_flag = "🟢 동종 대비 저위험"

    total    = int(p["total_decls"] or 0)
    reviewed = int(p["review_decls"] or 0)
    review_rate = reviewed / total * 100 if total else 0

    lines += [
        f"- 업종코드: {ind}",
        f"- 대상 위험점수: {my_risk:.1f}  |  동종 평균: {avg_risk:.1f} (σ={std_risk:.1f})  |  차이: {diff:+.1f}  Z={z_risk:+.2f}  {risk_flag}",
        f"- 동종 기업 수: {int(p['company_count'])}개사",
        f"- 동종 평균 건별 수입금액: {float(p['avg_import'] or 0):,.0f}원",
        f"- 동종 전체 신고 {total}건 중 검토·조사 건: {reviewed}건 ({review_rate:.1f}%)",
    ]
    return "\n".join(lines)


def _run_hs_risk(conn, company_id: str) -> str:
    all_stats = conn.execute("""
        SELECT hs_code,
               COUNT(*)                                               AS cnt,
               AVG(declared_value)                                    AS avg_val,
               STDDEV_SAMP(declared_value)                            AS std_val,
               MIN(declared_value)                                    AS min_val,
               MAX(declared_value)                                    AS max_val,
               SUM(CASE WHEN status IN ('REVIEW','INSPECT') THEN 1 ELSE 0 END) AS review_cnt,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY declared_value) AS q1,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY declared_value) AS q3
        FROM import_declarations
        GROUP BY hs_code
    """).df()

    my_decl = conn.execute(
        "SELECT hs_code, declared_value, status FROM import_declarations WHERE company_id=?",
        [company_id],
    ).df()

    lines = ["[HS 코드별 수입 통계 및 위험점수 모델]"]
    if my_decl.empty:
        lines.append("- 수입신고 내역 없음")
        return "\n".join(lines)

    for _, row in my_decl.iterrows():
        peer = all_stats[all_stats["hs_code"] == row["hs_code"]]
        if peer.empty:
            continue
        p = peer.iloc[0]

        avg_val    = float(p["avg_val"] or 0)
        std_val    = float(p["std_val"] or 0)
        my_val     = float(row["declared_value"])
        diff_pct   = (my_val - avg_val) / avg_val * 100 if avg_val else 0
        z_score    = abs(my_val - avg_val) / std_val if std_val > 0 else 0
        review_rate = float(p["review_cnt"]) / float(p["cnt"]) * 100 if p["cnt"] else 0

        q1 = float(p["q1"] or avg_val)
        q3 = float(p["q3"] or avg_val)
        iqr_flag = ""
        if my_val < q1 * CFG.ml.iqr_low_bound:
            iqr_flag = " ⚠️ IQR 하한 이탈(저가 신고 의심)"
        elif my_val > q3 * CFG.ml.iqr_high_bound:
            iqr_flag = " ⚠️ IQR 상한 이탈(고가 신고 의심)"

        if review_rate > CFG.ml.hs_review_rate_high * 100 or diff_pct < CFG.ml.hs_diff_pct_high or z_score > CFG.ml.hs_zscore_high:
            risk = "🔴 고위험"
        elif diff_pct < CFG.ml.hs_diff_pct_medium or z_score > CFG.ml.hs_zscore_medium:
            risk = "🟡 주의"
        else:
            risk = "🟢 정상"

        lines.append(
            f"- HS {row['hs_code']}: 신고가 {my_val:,.0f}  "
            f"| 전체평균 {avg_val:,.0f} ({diff_pct:+.1f}%)  "
            f"| Z={z_score:.2f}  | 검토율 {review_rate:.1f}%  → {risk}{iqr_flag}"
        )
    return "\n".join(lines)


def _run_hs_recommend(conn, company_id: str) -> str:
    my_items = conn.execute(
        "SELECT DISTINCT hs_code, item_name FROM import_declarations WHERE company_id=?",
        [company_id],
    ).df()

    lines = ["[품목분류 추천 모델]"]
    if my_items.empty:
        lines.append("- 수입신고 내역 없음")
        return "\n".join(lines)

    for _, row in my_items.iterrows():
        prefix = str(row["hs_code"])[:4]
        hint   = _HS_HINTS.get(prefix)
        if hint:
            desc, candidates = hint
            lines.append(f"- {row['item_name']}  (현재 신고: {row['hs_code']})")
            lines.append(f"  분류군: {desc}")
            for c in candidates:
                marker = "  ✅ 현재 신고" if str(row["hs_code"]).startswith(c[:7].replace(" ", "")) else "     후보"
                lines.append(f"{marker}: {c}")
        else:
            lines.append(f"- {row['item_name']} ({row['hs_code']}): 추가 사양서·BOM 검토 필요")
    return "\n".join(lines)


def _run_anomaly(conn, company_id: str) -> str:
    stats = conn.execute("""
        SELECT hs_code,
               COUNT(*)                     AS cnt,
               AVG(declared_value)          AS avg_val,
               STDDEV_SAMP(declared_value)  AS std_val,
               MIN(declared_value)          AS min_val,
               MAX(declared_value)          AS max_val
        FROM import_declarations
        GROUP BY hs_code
        HAVING COUNT(*) >= 3
    """).df()

    my_decl = conn.execute(
        "SELECT hs_code, declared_value, status, import_date FROM import_declarations WHERE company_id=?",
        [company_id],
    ).df()

    lines = ["[이상치 식별 모델 (Z-score 기반)]"]
    lines.append(f"※ Z > {CFG.ml.anomaly_high}: 고이상치,  Z > {CFG.ml.anomaly_medium}: 이상치 의심")
    anomalies = []
    normals   = []

    for _, row in my_decl.iterrows():
        peer = stats[stats["hs_code"] == row["hs_code"]]
        if peer.empty:
            continue
        p   = peer.iloc[0]
        std = float(p["std_val"] or 0)
        avg = float(p["avg_val"] or 0)
        val = float(row["declared_value"])

        if std > 0:
            z = (val - avg) / std  # 부호 유지 (음수 = 저가)
            if abs(z) > CFG.ml.anomaly_medium:
                direction = "저가신고 의심" if z < 0 else "고가신고"
                anomalies.append((row["hs_code"], val, avg, z, str(row["status"]), direction))
            else:
                normals.append((row["hs_code"], val, avg, z))
        else:
            # 표준편차 0 = 모든 값이 동일 → 직접 비교
            diff_pct = (val - avg) / avg * 100 if avg else 0
            if abs(diff_pct) > CFG.ml.anomaly_price_pct:
                anomalies.append((row["hs_code"], val, avg, float("nan"), str(row["status"]),
                                  "저가신고 의심" if diff_pct < 0 else "고가신고"))

    if anomalies:
        for hs, val, avg, z, status, direction in sorted(anomalies, key=lambda x: -abs(x[3] if x[3] == x[3] else 99)):
            flag     = "🔴" if abs(z) > CFG.ml.anomaly_high else "🟡"
            z_str    = f"Z={z:+.2f}" if z == z else f"편차={((val-avg)/avg*100):+.1f}%"
            lines.append(
                f"{flag} HS {hs}: 신고가 {val:,.0f} | 동종평균 {avg:,.0f} | {z_str} | 상태:{status} → {direction}"
            )
    else:
        lines.append("- 이상치 없음: 모든 신고 건이 Z < 1.5 정상 범위 내에 있습니다.")

    if normals:
        lines.append(f"- 정상 범위 신고: {len(normals)}건 (Z < 1.5)")

    return "\n".join(lines)


_RUNNERS = {
    "industry_stats": _run_industry_stats,
    "hs_risk":        _run_hs_risk,
    "hs_recommend":   _run_hs_recommend,
    "anomaly":        _run_anomaly,
}


def _select_models(instruction: str) -> list[str]:
    text     = instruction.lower()
    selected = [k for k, kws in _KEYWORDS.items() if any(kw in text for kw in kws)]
    return selected or list(MODEL_REGISTRY.keys())


# ── 에이전트 진입점 ────────────────────────────────────────────────────────────

def agent_ml(state: CustomsState) -> CustomsState:
    """시나리오 지시에 따라 ML 모델을 선택·실행하고 LLM으로 분석 결과를 해석한다.

    데이터가 부족하면 기업 프로파일 기반 샘플 데이터를 자동 생성하여 분석한다.
    """
    company_id = state["company_id"]
    scenario   = state.get("scenario") or {}

    instruction = " ".join(
        item.get("instruction", "")
        for item in scenario.get("scenario_items", [])
        if item.get("type") == "ml" and item.get("instruction")
    ).strip() or "전체 모델 실행"

    selected = _select_models(instruction)
    print(f"\n[Agent] ML 모델 실행 시작: {[MODEL_REGISTRY[m] for m in selected]}")

    sections = [
        "[ML 모델 실행 결과]",
        f"대상 기업: {company_id}  |  지시: {instruction}",
        f"선택 모델: {', '.join(MODEL_REGISTRY[m] for m in selected)}",
        "",
    ]

    try:
        with duckdb.connect(str(DB_PATH)) as conn:
            was_inserted, aug_note = _ensure_analysis_data(conn, company_id)
            if was_inserted:
                sections.append(aug_note)
                sections.append("")

            for model_key in selected:
                try:
                    sections.append(_RUNNERS[model_key](conn, company_id))
                except Exception as exc:
                    sections.append(f"[{MODEL_REGISTRY[model_key]}] 실행 오류: {exc}")
                sections.append("")

    except Exception as exc:
        sections.append(f"[DB 연결 오류] {exc}")

    ml_raw = "\n".join(sections)

    if llm:
        try:
            interpretation = llm.invoke(_LLM_PROMPT.format(ml_raw=ml_raw[:4000])).content
            ml_result = ml_raw + "\n\n[AI 위험 판단 해석]\n" + interpretation
        except Exception as exc:
            print(f"[Agent] ML LLM 해석 실패: {exc}")
            ml_result = ml_raw
    else:
        ml_result = ml_raw

    print("[Agent] ML 모델 실행 완료")
    return {**state, "ml_result": ml_result}
