"""자연어 → SQL/Cypher 변환 후 DuckDB 또는 Neo4j에서 실행하는 에이전트."""

from __future__ import annotations

import json
import re
import textwrap
from typing import Any

import duckdb

from src.llm import llm
from src.paths import DB_PATH

# ── DuckDB 스키마 설명 ────────────────────────────────────────────────────────
_DUCKDB_SCHEMA = """
DuckDB 데이터베이스 스키마 (관세청 CDW):

1. company_profiles — 기업 기본정보
   company_id (PK, TEXT),  company_name (TEXT),  business_registration_no (TEXT),
   industry_code (TEXT),   founded_year (INT),    risk_level (TEXT: HIGH/MED/LOW),
   risk_score (FLOAT),     last_audit_date (DATE),
   address_postal_code (TEXT),  address (TEXT),   address_detail (TEXT),
   employee_count (INT),   major_export_countries (TEXT),   customs_broker_firm (TEXT),
   related_companies (TEXT),    annual_revenue (BIGINT),
   annual_import_amount (BIGINT),  declared_duty_amount (BIGINT),
   recent_customs_refund (BIGINT), fta_reduction_rate (FLOAT)

2. import_declarations — 수입신고 이력
   id (INT PK),  company_id (TEXT FK),  declaration_no (TEXT),
   hs_code (TEXT),  item_name (TEXT),  declared_value (BIGINT),
   origin_country (TEXT),  import_date (DATE),
   status (TEXT: NORMAL/REVIEW/INSPECT/HOLD)

3. import_risk_scores — 위험점수 지표
   id (INT PK),  company_id (TEXT FK),
   risk_level (TEXT),  risk_score (FLOAT),
   undervaluation_suspicion_rate (FLOAT),
   related_party_anomaly_rate (FLOAT),
   fta_origin_misuse_suspicion_rate (FLOAT),
   customs_refund_anomaly_rate (FLOAT),
   hs_classification_error_rate (FLOAT),
   offshore_fund_concealment_suspicion_rate (FLOAT),
   generated_at (TIMESTAMP)

4. risk_person_profile — 우범자 프로파일 (개인 조회용)
   person_id (PK, TEXT),  name (TEXT),  birth_year (INT),
   nationality (TEXT),  risk_level (TEXT: HIGH/MED/LOW),
   risk_score (FLOAT),  occupation (TEXT),  last_detection_date (DATE)

5. smuggling_case — 밀수/우범 사건
   case_id (PK),  case_no (TEXT),  case_type (TEXT),
   contraband_category (TEXT),  case_status (TEXT),
   detection_date (DATE),  origin_country (TEXT),
   quantity (FLOAT),  quantity_unit (TEXT),  estimated_value (BIGINT),
   summary (TEXT)

6. risk_indicator — 위험 지표
   entity_type (TEXT: company/person),  entity_id (TEXT),
   indicator_code (TEXT),  indicator_name (TEXT),
   indicator_value (TEXT),  score (FLOAT),  weight (FLOAT),
   reason (TEXT),  calculated_at (TIMESTAMP)
"""

# ── Neo4j 스키마 설명 ─────────────────────────────────────────────────────────
_NEO4J_SCHEMA = """
Neo4j 그래프 데이터베이스 스키마 (관계망):

노드 레이블:
- Company { company_id, company_name, risk_level, industry_code }
- Person  { person_id, name, risk_level, nationality }
- Declaration { declaration_no, hs_code, item_name, declared_value, origin_country, import_date }
- Country { code, name }

관계 유형:
- (Company)-[:FILED]->(Declaration)
- (Company)-[:RELATED_TO]->(Company)   -- 특수관계
- (Country)-[:SUPPLIES_TO]->(Company)
- (Person)-[:INVOLVED_IN]->(smuggling_case)
- (Person)-[:ASSOCIATED_WITH]->(Company)
"""

# ── LLM 프롬프트 ──────────────────────────────────────────────────────────────
_SQL_SYSTEM = textwrap.dedent("""
당신은 한국 관세청 CDW(통관데이터웨어하우스) 전문 SQL 작성 AI입니다.
사용자의 자연어 질문을 DuckDB SQL SELECT 문으로 변환하세요.

[규칙]
- SELECT 문만 생성합니다. INSERT/UPDATE/DELETE/DROP은 절대 금지.
- 결과는 반드시 JSON 형식: {{"sql": "...", "explanation": "..."}}
- 테이블명, 컬럼명은 스키마에 있는 것만 사용합니다.
- 날짜 필터는 DATE 리터럴(예: DATE '2024-01-01') 또는 CURRENT_DATE를 사용합니다.
- 결과 건수 제한: 기본 LIMIT 20, 집계 쿼리는 제한 없음.
- company_id를 알 수 없으면 company_name ILIKE '%키워드%'로 검색합니다.
- 위험도 높은 순: ORDER BY risk_score DESC
- 최신 위험점수 조회 시: QUALIFY ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY generated_at DESC) = 1

[스키마]
{schema}
""").strip()

_CYPHER_SYSTEM = textwrap.dedent("""
당신은 한국 관세청 Neo4j 관계망 DB 전문 Cypher 작성 AI입니다.
사용자의 자연어 질문을 Cypher MATCH 쿼리로 변환하세요.

[규칙]
- MATCH/RETURN/WITH만 사용합니다. CREATE/DELETE/SET은 절대 금지.
- 결과는 반드시 JSON 형식: {{"cypher": "...", "explanation": "..."}}
- LIMIT은 50 이하로 설정합니다.

[스키마]
{schema}
""").strip()


def _extract_json(text: str) -> dict:
    """LLM 응답에서 JSON 블록 추출."""
    text = text.strip()
    # 코드 블록 제거
    if "```" in text:
        text = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    # JSON 객체 추출
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        return json.loads(m.group())
    return json.loads(text)


def generate_sql(prompt: str, service: str) -> dict[str, str]:
    """자연어 프롬프트 → DuckDB SQL 변환."""
    if not llm:
        raise RuntimeError("LLM이 초기화되지 않았습니다.")

    full_prompt = (
        _SQL_SYSTEM.format(schema=_DUCKDB_SCHEMA)
        + f"\n\n서비스: {service}\n질문: {prompt}\n\n"
        + '반드시 JSON 형식으로만 응답하세요: {"sql": "...", "explanation": "..."}'
    )
    response = llm.invoke(full_prompt).content
    return _extract_json(response)


def generate_cypher(prompt: str) -> dict[str, str]:
    """자연어 프롬프트 → Neo4j Cypher 변환."""
    if not llm:
        raise RuntimeError("LLM이 초기화되지 않았습니다.")

    full_prompt = (
        _CYPHER_SYSTEM.format(schema=_NEO4J_SCHEMA)
        + f"\n\n질문: {prompt}\n\n"
        + '반드시 JSON 형식으로만 응답하세요: {"cypher": "...", "explanation": "..."}'
    )
    response = llm.invoke(full_prompt).content
    return _extract_json(response)


def execute_duckdb_sql(sql: str) -> list[dict[str, Any]]:
    """DuckDB에서 SELECT 쿼리 실행. SELECT만 허용."""
    sql_upper = sql.strip().upper()
    if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
        raise ValueError("SELECT 또는 WITH 문만 실행 가능합니다.")
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        df = conn.execute(sql).df()
    return df.to_dict("records")


def execute_neo4j_cypher(cypher: str) -> list[dict[str, Any]]:
    """Neo4j에서 MATCH 쿼리 실행."""
    try:
        from src.neo4j_graph import get_driver
        driver = get_driver()
        with driver.session() as session:
            result = session.run(cypher)
            return [dict(record) for record in result]
    except Exception as exc:
        raise RuntimeError(f"Neo4j 쿼리 실행 오류: {exc}") from exc


def _format_rows_as_markdown(rows: list[dict], max_rows: int = 30) -> str:
    """결과 rows → Markdown 테이블."""
    if not rows:
        return "_조회 결과가 없습니다._"

    display = rows[:max_rows]
    headers = list(display[0].keys())
    header_line = " | ".join(f"**{h}**" for h in headers)
    sep_line = " | ".join("---" for _ in headers)
    data_lines = []
    for row in display:
        cells = []
        for h in headers:
            v = row.get(h)
            if v is None:
                cells.append("—")
            elif isinstance(v, float):
                cells.append(f"{v:,.2f}")
            elif isinstance(v, int):
                cells.append(f"{v:,}")
            else:
                cells.append(str(v)[:80])
        data_lines.append(" | ".join(cells))

    table = "\n".join([header_line, sep_line] + data_lines)
    if len(rows) > max_rows:
        table += f"\n\n_※ 전체 {len(rows)}건 중 {max_rows}건 표시_"
    return table


def _llm_summarize(prompt: str, sql: str, rows: list[dict]) -> str:
    """쿼리 결과를 LLM으로 자연어 요약."""
    if not llm or not rows:
        return ""
    sample = rows[:15]
    data_str = json.dumps(sample, ensure_ascii=False, default=str, indent=2)
    response = llm.invoke(
        f"다음은 한국 관세청 CDW 데이터베이스 조회 결과입니다.\n"
        f"사용자 질문: {prompt}\n"
        f"실행된 SQL: {sql}\n\n"
        f"조회 결과 (최대 15건):\n{data_str}\n\n"
        f"관세 조사 관점에서 핵심 내용을 간결하게 한국어로 요약하세요. "
        f"데이터에 없는 정보는 추정하지 마세요."
    ).content
    return response


def run_nl_db_query(
    prompt: str,
    service: str = "db_cdw",
    use_neo4j: bool = False,
) -> dict[str, Any]:
    """
    자연어 질문 → SQL/Cypher 생성 → 실행 → 결과 반환.

    Returns:
        {
          "service": str,
          "query": str,          # 생성된 SQL 또는 Cypher
          "explanation": str,    # 쿼리 설명
          "rows": list[dict],
          "table_md": str,       # Markdown 테이블
          "summary": str,        # LLM 요약
          "error": str | None,
        }
    """
    result: dict[str, Any] = {
        "service": service,
        "query": "",
        "explanation": "",
        "rows": [],
        "table_md": "",
        "summary": "",
        "error": None,
    }

    try:
        if use_neo4j:
            gen = generate_cypher(prompt)
            query = gen.get("cypher", "")
            result["query"] = query
            result["explanation"] = gen.get("explanation", "")
            rows = execute_neo4j_cypher(query)
        else:
            gen = generate_sql(prompt, service)
            query = gen.get("sql", "")
            result["query"] = query
            result["explanation"] = gen.get("explanation", "")
            rows = execute_duckdb_sql(query)

        result["rows"] = rows
        result["table_md"] = _format_rows_as_markdown(rows)
        result["summary"] = _llm_summarize(prompt, query, rows)

    except Exception as exc:
        result["error"] = str(exc)

    return result
