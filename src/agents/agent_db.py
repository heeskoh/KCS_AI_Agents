import duckdb

from src.agents.state import CustomsState
from src.agents.scope import (
    NO_COMPANY_SENTINELS,
    has_person_scope,
    no_target_result,
    prompt_text,
    target_id,
    target_type,
)
from src.llm import llm
from src.paths import DB_PATH

_DRUG_KEYWORDS = (
    "마약", "마약류", "필로폰", "메트암페타민", "대마", "코카인", "헤로인",
    "MDMA", "엑스터시", "향정", "narcotic", "drug", "methamphetamine",
    "cocaine", "heroin", "cannabis",
)


def _is_drug_investigation(prompt: str) -> bool:
    lowered = (prompt or "").lower()
    return any(keyword.lower() in lowered for keyword in _DRUG_KEYWORDS)


def _has_drug_related_db_text(raw_data: str) -> bool:
    lowered = (raw_data or "").lower()
    return any(keyword.lower() in lowered for keyword in _DRUG_KEYWORDS)


def _table_exists(conn: duckdb.DuckDBPyConnection, table_name: str) -> bool:
    return bool(conn.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_name = ?
        """,
        [table_name],
    ).fetchone()[0])


def _agent_person_db(state: CustomsState) -> CustomsState:
    person_id = target_id(state)
    print(f"\n[Agent] 개인 CDW 조회 시작: {person_id}")

    if not has_person_scope(state):
        return {**state, "db_result": no_target_result(state, "개인 CDW 조회")}

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        if not _table_exists(conn, "risk_person_profile"):
            return {
                **state,
                "db_result": (
                    "[개인 CDW 조회 결과]\n"
                    "- risk_person_profile 테이블이 없습니다.\n"
                    "- 기업 프로파일 테이블로 대체 조회하지 않았습니다."
                ),
            }

        person = conn.execute(
            """
            SELECT *
            FROM risk_person_profile
            WHERE person_id = ?
            """,
            [person_id],
        ).df()

        cases = conn.execute(
            """
            SELECT
                l.role_in_case,
                l.confidence_score,
                l.evidence_level,
                c.case_no,
                c.case_type,
                c.contraband_category,
                c.contraband_sub_category,
                c.case_status,
                c.detection_date,
                c.origin_country,
                c.transit_country,
                c.destination_region,
                c.modus_operandi,
                c.concealment_method,
                c.quantity,
                c.quantity_unit,
                c.estimated_value,
                c.summary
            FROM person_case_link l
            JOIN smuggling_case c ON l.case_id = c.case_id
            WHERE l.person_id = ?
            ORDER BY c.detection_date DESC
            """,
            [person_id],
        ).df() if _table_exists(conn, "person_case_link") and _table_exists(conn, "smuggling_case") else conn.execute("SELECT NULL WHERE FALSE").df()

        indicators = conn.execute(
            """
            SELECT indicator_code, indicator_name, indicator_value, score, weight, reason, calculated_at
            FROM risk_indicator
            WHERE entity_type = 'person' AND entity_id = ?
            ORDER BY score DESC NULLS LAST, calculated_at DESC
            """,
            [person_id],
        ).df() if _table_exists(conn, "risk_indicator") else conn.execute("SELECT NULL WHERE FALSE").df()

        analyses = conn.execute(
            """
            SELECT analysis_type, model_or_agent, output_summary, risk_score_before,
                   risk_score_after, explanation, review_status, created_at
            FROM analysis_result
            WHERE entity_type = 'person' AND entity_id = ?
            ORDER BY created_at DESC
            LIMIT 5
            """,
            [person_id],
        ).df() if _table_exists(conn, "analysis_result") else conn.execute("SELECT NULL WHERE FALSE").df()

    if person.empty:
        return {
            **state,
            "db_result": (
                "[개인 CDW 조회 결과]\n"
                f"- 조회 대상 `{person_id}`에 해당하는 우범자 프로파일이 DuckDB CDW에 없습니다.\n"
                "- 기업 프로파일 파일이나 이전 선택 기업으로 대체 조회하지 않았습니다."
            ),
        }

    raw_data = f"""
[우범자 프로파일]
{person.to_string(index=False)}

[관련 밀수/마약/우범 사건]
{cases.to_string(index=False) if not cases.empty else "관련 사건 없음"}

[개인 위험 지표]
{indicators.to_string(index=False) if not indicators.empty else "위험 지표 없음"}

[개인 분석 이력]
{analyses.to_string(index=False) if not analyses.empty else "분석 이력 없음"}
"""

    if llm:
        try:
            summary = llm.invoke(
                "다음 DuckDB CDW 개인 우범자 프로파일 조회 결과만 근거로 한국어로 요약하세요. "
                "기업 프로파일, 수입신고 기업 ID, 이전 선택 기업 정보는 절대 추정하거나 사용하지 마세요.\n\n"
                f"{raw_data}"
            ).content
        except Exception:
            summary = raw_data
    else:
        summary = raw_data

    print("[Agent] 개인 CDW 조회 완료")
    return {**state, "db_result": summary}

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
    if target_type(state) == "person":
        return _agent_person_db(state)

    company_id = (state.get("company_id") or "").strip()
    prompt = prompt_text(state)
    print(f"\n[Agent] DB 조회 시작: {company_id}")

    if company_id in NO_COMPANY_SENTINELS:
        result = (
            "[CDW 조회 결과]\n"
            "- 프롬프트에서 CDW 조회 대상이 되는 기업명, 회사ID 또는 신고번호가 확인되지 않았습니다.\n"
            "- CDW에 연관정보 없음: 임의 기업의 일반 위험정보를 대신 조회하지 않습니다."
        )
        return {**state, "db_result": result}

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

    if company.empty:
        result = (
            "[CDW 조회 결과]\n"
            f"- 조회 대상 `{company_id}`에 해당하는 기업 프로파일이 DuckDB CDW에 없습니다.\n"
            "- CDW에 연관정보 없음."
        )
        return {**state, "db_result": result}

    if _is_drug_investigation(prompt) and not _has_drug_related_db_text(raw_data):
        result = (
            "[CDW 조회 결과]\n"
            "- 요청 주제: 마약수사\n"
            "- DuckDB CDW 조회 결과에서 마약류 수사와 직접 연결되는 기업, 신고, 품목, 위험정보를 찾지 못했습니다.\n"
            "- CDW에 연관정보 없음: 일반 수입신고 위험지표를 마약 관련 근거로 확대 해석하지 않습니다."
        )
        return {**state, "db_result": result}

    db_only_instruction = (
        "이 답변은 DuckDB CDW 조회 결과 안에 있는 정보만 근거로 작성하세요. "
        "조회 결과에 없는 회사, 신고, 위험정보는 추정하거나 외부 지식으로 보완하지 말고 "
        "'DB 조회 결과 없음' 또는 'DB에 근거 없음'이라고 명확히 표시하세요.\n\n"
    )

    if llm:
        summary = llm.invoke(
            db_only_instruction +
            "아래 업체 프로파일, 수입신고, 위험지표를 관세 조사 담당자에게 보고하듯 "
            "핵심 위험 신호와 확인 필요 사항 중심으로 한국어로 요약하세요.\n"
            f"{raw_data}"
        ).content
    else:
        summary = _fallback_summary(company, declarations, risk)

    print("[Agent] DB 조회 완료")
    return {**state, "db_result": summary}
