"""Agent: 위험지표 조사 프로파일 — 근거 기반 6종 위험지표(company_risk_indicator)를
LLM이 관세청 조사관 수준의 내러티브 프로파일로 종합한다.

점수·근거는 데이터 기반 산출 엔진(src/risk_indicators.py)이 생성한 company_risk_indicator를
그대로 사용한다. LLM은 점수를 바꾸지 않고, 4단계 생성 원칙에 따라 조사 권고와
종합 서술만 보강한다(정합성은 산출 단계에서 이미 보장됨).
"""
import duckdb

from src.agents.state import CustomsState
from src.agents.scope import has_company_scope, no_company_result
from src.llm import llm
from src.paths import DB_PATH

# 사용자 4단계 최종 프롬프트의 핵심 원칙
GENERATOR_PRINCIPLES = """[원칙]
1. 위험지표는 반드시 근거 데이터로 설명 가능해야 한다.
2. 위험지표가 높으면 관련 이력이 반드시 존재한다.
3. 관련 데이터가 없으면 위험지표를 낮게(또는 0으로) 본다.
4. 서로 무관한 위험을 동시에 부풀리지 않는다.
5. 실제 관세청 조사 프로파일 수준으로 서술한다."""

_LLM_PROMPT = """당신은 관세청 관세조사/관세수사 기업 프로파일 분석관입니다.
아래는 근거 데이터에서 산출된 기업 위험지표 6종입니다(점수와 근거는 확정값이므로 변경하지 마십시오).
주어진 점수·근거·관련데이터를 토대로 조사관용 종합 프로파일을 작성하세요.

{principles}

[대상 기업]
{company_line}

[산출된 위험지표 (점수·근거 확정)]
{indicator_block}

[작성 지침]
- 각 위험지표별로 (1) 산출점수 (2) 산출근거 요약 (3) 조사 권고사유를 정리하십시오.
- 점수가 높은 지표를 중심으로 조사 우선순위를 제시하십시오.
- 점수가 0이거나 근거가 없는 지표는 "특이사항 없음"으로 처리하고 무리한 의심을 부여하지 마십시오(원칙 3·4).
- 마지막에 기업 전체 위험 종합 의견과 권고 조사 방향을 3~5문장으로 서술하십시오.
- 점수는 주어진 값을 그대로 인용하고 임의로 조정하지 마십시오.
"""


def _load(company_id: str) -> tuple[dict, list[dict]]:
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        company = conn.execute(
            "SELECT company_id, company_name, industry_code, risk_level, risk_score "
            "FROM company_profiles WHERE company_id = ?",
            [company_id],
        ).df().to_dict("records")
        try:
            indicators = conn.execute(
                """
                SELECT indicator_code, indicator_name, score, reason, recommendation
                FROM company_risk_indicator
                WHERE company_id = ?
                ORDER BY score DESC
                """,
                [company_id],
            ).df().to_dict("records")
        except duckdb.CatalogException:
            indicators = []
    return (company[0] if company else {}), indicators


def _format_indicator_block(indicators: list[dict]) -> str:
    blocks = []
    for ind in indicators:
        score = ind.get("score")
        reason = str(ind.get("reason") or "근거 데이터 없음")
        reco = str(ind.get("recommendation") or "-")
        blocks.append(
            f"■ {ind.get('indicator_name')}  {score:.0f}%\n"
            f"  근거:\n{reason}\n"
            f"  권고: {reco}"
        )
    return "\n\n".join(blocks) if blocks else "산출된 위험지표 없음"


def _fallback(company: dict, indicators: list[dict]) -> str:
    """LLM 미가용 시 데이터 기반 프로파일을 그대로 제시."""
    name = company.get("company_name") or company.get("company_id") or "대상 기업"
    lines = [
        f"[위험지표 조사 프로파일] {name} ({company.get('company_id')})",
        f"종합 위험점수: {company.get('risk_score')} / 등급: {company.get('risk_level')}",
        "",
        _format_indicator_block(indicators),
    ]
    return "\n".join(lines)


def agent_risk_profile(state: CustomsState) -> CustomsState:
    """근거 기반 위험지표를 조사관용 내러티브 프로파일로 종합한다."""
    if not has_company_scope(state):
        return {**state, "risk_profile_result": no_company_result("위험지표 프로파일")}

    company_id = state["company_id"]
    print(f"[Agent] 위험지표 프로파일 시작: {company_id}")

    company, indicators = _load(company_id)
    if not indicators:
        return {
            **state,
            "risk_profile_result": no_company_result(
                "위험지표 프로파일",
                "company_risk_indicator 데이터가 없습니다. setup_db.py --reset 로 재생성이 필요합니다.",
            ),
        }

    fallback = _fallback(company, indicators)
    if not llm:
        return {**state, "risk_profile_result": fallback}

    company_line = f"{company.get('company_name')} ({company_id}), 업종 {company.get('industry_code')}, " \
                   f"종합 위험점수 {company.get('risk_score')} / {company.get('risk_level')}"
    prompt = _LLM_PROMPT.format(
        principles=GENERATOR_PRINCIPLES,
        company_line=company_line,
        indicator_block=_format_indicator_block(indicators),
    )
    try:
        return {**state, "risk_profile_result": llm.invoke(prompt).content}
    except Exception as exc:
        return {**state, "risk_profile_result": f"{fallback}\n\n[LLM 생성 오류]\n{exc}"}
