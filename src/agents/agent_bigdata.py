import duckdb

from src.agents.state import CustomsState
from src.agents.scope import has_company_scope, no_company_result, no_target_result, target_id, target_type
from src.paths import DB_PATH


def agent_bigdata(state: CustomsState) -> CustomsState:
    """Simulate linked big-data platform signals from aggregate import stats."""
    if target_type(state) == "person":
        person_id = target_id(state)
        if not person_id:
            return {**state, "bigdata_result": no_target_result(state, "개인 빅데이터 통계 분석")}
        with duckdb.connect(str(DB_PATH), read_only=True) as conn:
            person = conn.execute(
                "SELECT person_id, name, risk_level, risk_score, risk_tags FROM risk_person_profile WHERE person_id=?",
                [person_id],
            ).df()
            indicators = conn.execute(
                """
                SELECT indicator_code, indicator_name, score, weight, reason
                FROM risk_indicator
                WHERE entity_type='person' AND entity_id=?
                ORDER BY score DESC NULLS LAST
                """,
                [person_id],
            ).df()
            peer_stats = conn.execute(
                """
                SELECT risk_level, COUNT(*) AS person_count, AVG(risk_score) AS avg_risk_score
                FROM risk_person_profile
                GROUP BY risk_level
                ORDER BY avg_risk_score DESC NULLS LAST
                """
            ).df()
        result = f"""
[개인 빅데이터 통계 분석 결과]

[대상 우범자]
{person.to_string(index=False) if not person.empty else "정보 없음"}

[개인 위험 지표]
{indicators.to_string(index=False) if not indicators.empty else "정보 없음"}

[우범자 위험등급 분포]
{peer_stats.to_string(index=False) if not peer_stats.empty else "정보 없음"}

분석 메모:
- 개인 대상이므로 company_profiles/import_declarations 기업 통계를 조회하지 않았습니다.
- risk_person_profile, risk_indicator 기준으로 개인 우범 지표와 동급 위험군 분포만 비교했습니다.
"""
        return {**state, "bigdata_result": result.strip()}

    if not has_company_scope(state):
        return {**state, "bigdata_result": no_company_result("빅데이터 통계 분석")}

    company_id = state["company_id"]
    scenario = state.get("scenario") or {}
    print(f"\n[Agent] 빅데이터 통계 분석 시작: {company_id}")

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        company_stats = conn.execute(
            """
            SELECT
                c.company_name,
                c.industry_code,
                c.risk_level,
                c.risk_score,
                c.annual_import_amount,
                AVG(d.declared_value) AS avg_declared_value,
                COUNT(d.id) AS declaration_count
            FROM company_profiles c
            LEFT JOIN import_declarations d ON c.company_id = d.company_id
            WHERE c.company_id = ?
            GROUP BY
                c.company_name,
                c.industry_code,
                c.risk_level,
                c.risk_score,
                c.annual_import_amount
            """,
            [company_id],
        ).df()

        industry_stats = conn.execute(
            """
            SELECT
                c.industry_code,
                COUNT(DISTINCT c.company_id) AS company_count,
                COUNT(d.id) AS declaration_count,
                AVG(d.declared_value) AS avg_declared_value,
                SUM(d.declared_value) AS total_declared_value,
                AVG(c.risk_score) AS avg_risk_score
            FROM company_profiles c
            LEFT JOIN import_declarations d ON c.company_id = d.company_id
            GROUP BY c.industry_code
            ORDER BY avg_risk_score DESC
            """
        ).df()

        hs_stats = conn.execute(
            """
            SELECT
                hs_code,
                item_name,
                COUNT(*) AS declaration_count,
                AVG(declared_value) AS avg_declared_value,
                SUM(declared_value) AS total_declared_value
            FROM import_declarations
            GROUP BY hs_code, item_name
            ORDER BY total_declared_value DESC
            """
        ).df()

        origin_stats = conn.execute(
            """
            SELECT
                origin_country,
                COUNT(*) AS declaration_count,
                SUM(declared_value) AS total_declared_value
            FROM import_declarations
            GROUP BY origin_country
            ORDER BY total_declared_value DESC
            """
        ).df()

    enabled_sources = []
    if scenario.get("bigdata_trade_stats", True):
        enabled_sources.append("동종 업종 수입 통계")
    if scenario.get("bigdata_hs_stats", True):
        enabled_sources.append("HS 코드별 수입 통계")

    result = f"""
[빅데이터 통계 분석 결과]
활성 데이터: {", ".join(enabled_sources) if enabled_sources else "선택 없음"}

[대상 업체 통계]
{company_stats.to_string(index=False) if not company_stats.empty else "정보 없음"}

[업종별 수입 및 위험 통계]
{industry_stats.to_string(index=False)}

[HS 코드별 수입 통계]
{hs_stats.to_string(index=False)}

[원산지별 수입 통계]
{origin_stats.to_string(index=False)}

분석 메모:
- 대상 업체의 신고금액, 품목, 원산지 집중도를 동종 업종 평균과 비교하는 데 사용할 수 있습니다.
- 현재 결과는 DuckDB 샘플 데이터 기반의 모의 통계이며, 실제 CDW/빅데이터 플랫폼 연결 전 화면 검증용입니다.
"""

    print("[Agent] 빅데이터 통계 분석 완료")
    return {**state, "bigdata_result": result.strip()}
