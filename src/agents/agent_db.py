import duckdb

from src.agents.state import CustomsState
from src.llm import llm
from src.paths import DB_PATH

def _fallback_summary(company, declarations, risk) -> str:
    if company.empty:
        return "기업 정보를 찾을 수 없습니다."

    c = company.to_dict("records")[0]
    r = risk.to_dict("records")[0] if not risk.empty else {}
    review_count = 0
    inspect_count = 0
    if not declarations.empty:
        statuses = declarations["status"].astype(str)
        review_count = int(statuses.isin(["REVIEW", "HOLD"]).sum())
        inspect_count = int(statuses.isin(["INSPECT"]).sum())

    return "\n".join(
        [
            "[DB 조회 요약]",
            f"- 업체명: {c.get('company_name')} ({c.get('company_id')})",
            f"- 업종/설립: {c.get('industry_code')} / {c.get('founded_year')}년",
            f"- 위험등급: {c.get('risk_level')} / 위험점수 {float(c.get('risk_score') or 0):.1f}",
            f"- 연간 수입금액: {int(c.get('annual_import_amount') or 0):,}원",
            f"- 최근 신고 건수: {len(declarations)}건, 검토/보류 {review_count}건, 검사 {inspect_count}건",
            f"- 주요 확인 지표: 저가신고 {float(r.get('undervaluation_suspicion_rate') or 0):.0f}, "
            f"특수관계 {float(r.get('related_party_anomaly_rate') or 0):.0f}, "
            f"FTA {float(r.get('fta_origin_misuse_suspicion_rate') or 0):.0f}, "
            f"환급 {float(r.get('customs_refund_anomaly_rate') or 0):.0f}",
            "- 확인 필요: 신고가격 산정 근거, 특수관계자 거래 조건, 원산지 증빙, 환급 신청 근거를 우선 검토하세요.",
        ]
    )


def agent_db(state: CustomsState) -> CustomsState:
    """Read company, declaration, and risk-score data from DuckDB."""
    company_id = state["company_id"]
    print(f"\n[Agent] DB 조회 시작: {company_id}")

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        company = conn.execute(
            """
            SELECT
                company_id,
                company_name,
                business_registration_no,
                industry_code,
                founded_year,
                risk_level,
                risk_score,
                last_audit_date,
                address_postal_code,
                address,
                address_detail,
                employee_count,
                major_export_countries,
                customs_broker_firm,
                related_companies,
                annual_revenue,
                annual_import_amount,
                declared_duty_amount,
                recent_customs_refund,
                fta_reduction_rate
            FROM company_profiles
            WHERE company_id = ?
            """,
            [company_id],
        ).df()

        declarations = conn.execute(
            """
            SELECT declaration_no, hs_code, item_name,
                   declared_value, origin_country, import_date, status
            FROM import_declarations
            WHERE company_id = ?
            ORDER BY import_date DESC
            """,
            [company_id],
        ).df()

        risk = conn.execute(
            """
            SELECT
                risk_level,
                risk_score,
                undervaluation_suspicion_rate,
                related_party_anomaly_rate,
                fta_origin_misuse_suspicion_rate,
                customs_refund_anomaly_rate,
                hs_classification_error_rate,
                offshore_fund_concealment_suspicion_rate,
                generated_at
            FROM import_risk_scores
            WHERE company_id = ?
            ORDER BY generated_at DESC
            LIMIT 1
            """,
            [company_id],
        ).df()

    raw_data = f"""
[기업 프로파일]
{company.to_string(index=False) if not company.empty else "정보 없음"}

[수입신고 이력]
{declarations.to_string(index=False) if not declarations.empty else "이력 없음"}

[위험 지표]
{risk.to_string(index=False) if not risk.empty else "지표 없음"}
"""
    if llm:
        summary = llm.invoke(
            "아래 업체 프로파일, 수입신고, 위험지표를 관세 조사 담당자에게 보고하듯 "
            "핵심 위험 신호와 확인 필요 사항 중심으로 한국어로 요약하세요.\n"
            f"{raw_data}"
        ).content
    else:
        summary = _fallback_summary(company, declarations, risk)

    print("[Agent] DB 조회 완료")
    return {**state, "db_result": summary}
