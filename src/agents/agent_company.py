"""Agent: 기업 기본정보(Company Profile) 빠른 조회.

조사 시작 시 첫 단계로 사용 — agent_db 의 종합 분석 이전에
대상 업체의 정체성 정보(상호/대표/업종/주소/규모/관세사 등)만 빠르게 확보.
"""
import duckdb

from src.agents.state import CustomsState
from src.agents.scope import has_company_scope, no_company_result
from src.paths import DB_PATH


def _format_amount(value) -> str:
    try:
        return f"{int(value):,}원"
    except (TypeError, ValueError):
        return "-"


def _format_count(value, suffix: str = "명") -> str:
    try:
        return f"{int(value):,}{suffix}"
    except (TypeError, ValueError):
        return "-"


def agent_company(state: CustomsState) -> CustomsState:
    """company_profiles 테이블에서 대상 업체 기본정보를 조회한다.

    `company_id` 또는 `business_registration_no` 어느 쪽으로 들어와도 매칭.
    """
    if not has_company_scope(state):
        return {**state, "company_result": no_company_result("기업 프로파일 조회")}

    company_id = state["company_id"]
    print(f"\n[Agent] 기업 프로파일 조회 시작: {company_id}")

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        df = conn.execute(
            """
            SELECT
                company_id,
                company_name,
                business_registration_no,
                industry_code,
                founded_year,
                address_postal_code,
                address,
                address_detail,
                employee_count,
                annual_revenue,
                annual_import_amount,
                customs_broker_firm,
                related_companies,
                major_export_countries,
                risk_level,
                risk_score
            FROM company_profiles
            WHERE company_id = ? OR business_registration_no = ?
            LIMIT 1
            """,
            [company_id, company_id],
        ).df()

    if df.empty:
        result = (
            f"❌ 기업ID/사업자번호 '{company_id}' 에 해당하는 업체를 "
            f"company_profiles 에서 찾지 못했습니다."
        )
    else:
        c = df.to_dict("records")[0]
        full_address = " ".join(
            part for part in [c.get("address"), c.get("address_detail")] if part
        ) or "-"
        result = "\n".join(
            [
                "[기업 기본정보]",
                f"- 업체명: {c.get('company_name')} (ID: {c.get('company_id')})",
                f"- 사업자번호: {c.get('business_registration_no') or '-'}",
                f"- 업종코드: {c.get('industry_code') or '-'} / 설립: {c.get('founded_year') or '-'}년",
                f"- 주소: ({c.get('address_postal_code') or '-'}) {full_address}",
                f"- 직원수: {_format_count(c.get('employee_count'))}",
                f"- 연매출: {_format_amount(c.get('annual_revenue'))} / "
                f"연간 수입금액: {_format_amount(c.get('annual_import_amount'))}",
                f"- 관세사: {c.get('customs_broker_firm') or '-'}",
                f"- 관계회사: {c.get('related_companies') or '-'}",
                f"- 주요 수출입국: {c.get('major_export_countries') or '-'}",
                f"- 사전 위험등급: {c.get('risk_level') or '-'} "
                f"(점수 {float(c.get('risk_score') or 0):.1f})",
            ]
        )

    print("[Agent] 기업 프로파일 조회 완료")
    return {**state, "company_result": result}
