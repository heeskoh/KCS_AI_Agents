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


def _error_state(state: CustomsState, result_key: str, message: str, detail: str | None = None) -> CustomsState:
    result = detail or f"[오류 발생]\n- {message}"
    return {
        **state,
        result_key: result,
        "agent_error": message,
        "agent_error_result": result,
    }


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
    print(f"[Agent] 개인 CDW 조회 시작: {person_id}")

    if not has_person_scope(state):
        detail = no_target_result(state, "개인 CDW 조회")
        return _error_state(state, "db_result", "개인 CDW 조회 대상이 지정되지 않았습니다.", detail)

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        if not _table_exists(conn, "risk_person_profile"):
            result = (
                "[개인 CDW 조회 결과]\n"
                "- risk_person_profile 테이블이 없습니다.\n"
                "- 기업 프로파일 테이블로 대체 조회하지 않았습니다."
            )
            return _error_state(state, "db_result", "개인 CDW 프로파일 테이블이 없습니다.", result)

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
        result = (
            "[개인 CDW 조회 결과]\n"
            f"- 조회 대상 `{person_id}`에 해당하는 우범자 프로파일이 DuckDB CDW에 없습니다.\n"
            "- 기업 프로파일 파일이나 이전 선택 기업으로 대체 조회하지 않았습니다."
        )
        return _error_state(state, "db_result", f"CDW 개인 프로파일이 없습니다: {person_id}", result)

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


# 동작방식(behavior)별 요약 초점 — 분석 시나리오의 CDW 동작칩 선택 시 적용.
_DB_BEHAVIOR_FOCUS = {
    "risk_focus": "위험지표(저가신고·특수관계·FTA 오용·환급 이상·품목분류 오류·역외은닉 의심율)와 위험등급 변화 추이에 집중해 보고하세요.",
    "declaration_focus": "최근 수입신고 내역(품목·금액·원산지·처리상태)의 패턴과 검토/검사 비중, 이상 징후에 집중해 보고하세요.",
    "profile_summary": "기업 기본 프로파일과 최근 신고·위험지표를 균형 있게 요약하세요.",
}


def _db_behaviors(state: CustomsState) -> list[str]:
    """현재 단계에 선택된 동작방식(behavior) 목록을 반환한다."""
    scenario = state.get("scenario") or {}
    behaviors = scenario.get("current_agent_behaviors") or []
    if isinstance(behaviors, str):
        behaviors = [behaviors]
    single = str(scenario.get("current_agent_behavior") or "").strip()
    if single and single not in behaviors:
        behaviors = [single, *behaviors]
    return [str(b).strip() for b in behaviors if str(b).strip()]


def _agent_nl_db(state: CustomsState, prompt: str) -> CustomsState:
    """기업 미지정 시 자연어 → SQL(NL→SQL) 방식으로 CDW를 조회한다.

    'My AI 분석'의 자유 질의도 워크벤치와 동일한 워크플로 파이프라인(agent_db)을
    통해 실행되도록 하는 폴백 경로.
    """
    from src.agents.agent_nl_to_sql import run_nl_db_query

    print(f"[Agent] CDW NL→SQL 조회 시작: {prompt[:60]}")
    result = run_nl_db_query(prompt, service="db_cdw")

    if result.get("error"):
        message = f"CDW NL→SQL 조회 오류: {result['error']}"
        print(f"[Agent] {message}")
        return _error_state(state, "db_result", message)

    parts: list[str] = []
    if result.get("summary"):
        parts.append(str(result["summary"]))
    if result.get("table_md"):
        parts.append(f"[조회 결과]\n{result['table_md']}")
    if result.get("query"):
        explanation = f"\n{result['explanation']}" if result.get("explanation") else ""
        parts.append(f"[실행 SQL]\n```sql\n{result['query']}\n```{explanation}")

    rows = result.get("rows") or []
    print(f"[Agent] CDW NL→SQL 조회 완료: {len(rows)}건")
    return {**state, "db_result": "\n\n".join(parts) or "[CDW 조회 결과]\n- 조회 결과가 없습니다."}


def agent_db(state: CustomsState) -> CustomsState:
    """Read company, declaration, and risk-score data from DuckDB."""
    if target_type(state) == "person":
        return _agent_person_db(state)

    company_id = (state.get("company_id") or "").strip()
    prompt = prompt_text(state)
    print(f"[Agent] CDW DB 조회 시작: {company_id}")

    if company_id in NO_COMPANY_SENTINELS:
        # 대상 기업이 지정되지 않아도 사용자 프롬프트가 있으면 NL→SQL로 직접 조회
        if prompt.strip():
            return _agent_nl_db(state, prompt)
        result = (
            "[CDW 조회 결과]\n"
            "- 프롬프트에서 CDW 조회 대상이 되는 기업명, 회사ID 또는 신고번호가 확인되지 않았습니다.\n"
            "- CDW에 연관정보 없음: 임의 기업의 일반 위험정보를 대신 조회하지 않습니다."
        )
        return _error_state(state, "db_result", "CDW 조회 대상 기업이 확인되지 않았습니다.", result)

    behaviors = _db_behaviors(state)
    risk_history = None
    declaration_breakdown = None

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

        # 동작방식 조건화: 선택 behavior에 따라 조회 데이터를 추가한다.
        if "risk_focus" in behaviors:
            risk_history = conn.execute(
                """
                SELECT generated_at, risk_level, risk_score,
                       undervaluation_suspicion_rate, related_party_anomaly_rate,
                       fta_origin_misuse_suspicion_rate, customs_refund_anomaly_rate,
                       hs_classification_error_rate, offshore_fund_concealment_suspicion_rate
                FROM import_risk_scores
                WHERE company_id = ?
                ORDER BY generated_at DESC
                LIMIT 5
                """,
                [company_id],
            ).df()
        if "declaration_focus" in behaviors:
            declaration_breakdown = conn.execute(
                """
                SELECT status,
                       COUNT(*) AS declaration_count,
                       SUM(declared_value) AS total_declared_value
                FROM import_declarations
                WHERE company_id = ?
                GROUP BY status
                ORDER BY declaration_count DESC
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
    if risk_history is not None and not risk_history.empty:
        raw_data += f"\n[위험지표 추이(최근 5)]\n{risk_history.to_string(index=False)}\n"
    if declaration_breakdown is not None and not declaration_breakdown.empty:
        raw_data += f"\n[신고 처리상태 분포]\n{declaration_breakdown.to_string(index=False)}\n"

    if company.empty:
        result = (
            "[CDW 조회 결과]\n"
            f"- 조회 대상 `{company_id}`에 해당하는 기업 프로파일이 DuckDB CDW에 없습니다.\n"
            "- CDW에 연관정보 없음."
        )
        return _error_state(state, "db_result", f"CDW 기업 프로파일이 없습니다: {company_id}", result)

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

    focus_lines = [_DB_BEHAVIOR_FOCUS[b] for b in behaviors if b in _DB_BEHAVIOR_FOCUS]
    focus_instruction = (
        "\n[동작방식 초점]\n" + "\n".join(f"- {line}" for line in focus_lines) + "\n"
        if focus_lines else ""
    )

    if llm:
        summary = llm.invoke(
            db_only_instruction +
            "아래 업체 프로파일, 수입신고, 위험지표를 관세 조사 담당자에게 보고하듯 "
            "핵심 위험 신호와 확인 필요 사항 중심으로 한국어로 요약하세요."
            + focus_instruction +
            f"\n{raw_data}"
        ).content
    else:
        summary = _fallback_summary(company, declarations, risk)

    print("[Agent] CDW DB 조회 완료")
    return {**state, "db_result": summary}
