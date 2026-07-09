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

2. import_declarations — 수입신고서 헤더 (신고 1건, 수입신고서 영역1·2·3·5)
   id (INT PK),  company_id (TEXT FK),  declaration_no (TEXT),
   hs_code (TEXT, HSK 10자리 "8708.99.9099"=GlobalHS6+HSK4),
   global_hs (TEXT, 국제공통 6자리 "8708.99" — ★품목 유형 구분·집계·동종비교는 이 컬럼 사용),
   hsk (TEXT, 국내 세분 4자리 "9099"),
   item_name/declared_value/origin_country/origin_country_name (대표 품목값=첫 란),
   import_date (DATE),  status (TEXT: NORMAL/REVIEW/INSPECT/HOLD),
   [영역1 당사자] customs_office_code, declaration_type, clearance_plan, filer_name,
     importer_name, importer_customs_code, taxpayer_name, taxpayer_address,
     taxpayer_business_no, taxpayer_phone, taxpayer_email, overseas_supplier_name,
     overseas_supplier_country,
   [영역2 화물·운송] bl_awb_no, cargo_control_no, master_bl_awb_no, forwarder_name,
     departure_country, arrival_port, transport_type, vessel_name, arrival_date,
     warehousing_date, inspection_location, total_weight, total_packages, package_type,
   [영역3 거래·결제] transaction_type, import_type, collection_type, origin_cert_flag,
     price_declaration_flag, payment_incoterms, payment_currency, payment_amount,
     exchange_rate, freight_krw, insurance_krw, total_customs_value_usd, total_customs_value_krw,
   [영역5 세액합계] tax_customs_duty, tax_individual_consumption, tax_traffic, tax_liquor,
     tax_education, tax_rural_special, tax_vat, penalty_late_declaration,
     penalty_non_declaration, total_tax_amount, total_vat_base, total_vat_exempt_base

2-1. import_declaration_items — 수입신고서 품목/란 (1신고 N란, 영역4)
   item_id (INT PK),  declaration_id (INT FK→import_declarations.id),  line_no (INT 란번호),
   tariff_item_name_en, trade_item_name_en, hsk_code (HSK10 "8708990099"),
   global_hs (6자리 "8708.99"), hsk (4자리 "9099"), brand_name,
   net_weight, tariff_quantity, tariff_quantity_unit, refund_quantity,
   origin_country, origin_criteria, origin_marking,
   import_requirement_type, import_requirement_doc, import_requirement_law_code,
   post_verification_agency, item_customs_value_usd, item_customs_value_krw, special_tax_basis

2-2. import_declaration_item_specs — 품목 모델·규격별 (영역4 하위 반복)
   spec_id (PK), item_id (FK→import_declaration_items.item_id), seq,
   model_spec, ingredient, spec_quantity, spec_unit_price, spec_amount, currency

2-3. import_declaration_item_taxes — 품목별 세목 (관세+내국세, 영역4 하위 반복)
   tax_id (PK), item_id (FK→import_declaration_items.item_id), seq,
   tax_type (관세/부가가치세 등), rate_type, tax_rate, reduction_rate, tax_amount,
   reduction_amount, internal_tax_code

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
Neo4j 그래프 데이터베이스 스키마 (엔티티 중심 관계망):

설계 원칙: 노드는 엔티티/분류만(기업·사람·조직·지역·국가·품목·해외거래처·특수관계인·관계사).
사건/수입신고/증거/위험점수/분석결과는 노드가 아니라 관계(엣지) 또는 노드 속성으로 표현한다.
기업 수입 관계망(2026 재구성): 모든 엣지는 기업 중심이며, 엣지 속성 count = 수입신고 건수(선 굵기).

노드 레이블:
- Company { company_id, company_name, region(지역), risk_level, risk_score,
            top_risk_name(위험명), top_risk_score, risk_indicator_summary, industry_code,
            undervaluation_suspicion_rate, related_party_anomaly_rate, fta_origin_misuse_suspicion_rate,
            customs_refund_anomaly_rate, hs_classification_error_rate, offshore_fund_concealment_suspicion_rate }
- Person  { person_id, name, risk_level, risk_score, nationality, risk_tags, watch_status,
            top_indicators, indicator_count, latest_analysis_summary, analysis_count }   -- 위험지표/분석결과 흡수
- Organization { org_id, org_name, org_type, country, risk_score }
- Country { code, name }                 -- 수입/출국 (적출국 기준)
- Item { code(HSK 품목번호), name(거래품명), origin(원산지) }
- OverseasSupplier { name }              -- 해외거래처
- RelatedParty { key, name, country, is_offshore }  -- 특수관계인
- AffiliatedCompany { name }             -- 관계사
- CaseType { code(REVIEW/INSPECT/HOLD), name(검토/검사/보류), case_count(사건건수) }  -- 사건유형
- Region { name }

관계 유형(기업 수입 관계망 5종 — 모두 기업 중심, count=건수=선굵기):
- (Company)-[:SUPPLIED_BY { hsk_code, item_name, spec, departure_country, import_date, declaration_no, count }]->(OverseasSupplier)  -- 품목(HSK)이 다르면 다른 엣지
- (Company)-[:DECLARES_ITEM { overseas_supplier, spec, departure_country, import_date, declaration_no, count }]->(Item)            -- 해외거래처가 다르면 다른 엣지
- (Company)-[:TRADES_WITH_COUNTRY { hsk_code, overseas_supplier, spec, departure_country, import_date, declaration_no, count }]->(Country)  -- 품목(HSK)이 다르면 다른 엣지(적출국)
- (Company)-[:AFFILIATED_WITH { declaration_no, overseas_supplier, item }]->(AffiliatedCompany)  -- 수입신고 NO가 다르면 다른 엣지
- (Company)-[:RELATED_PARTY { relation_type, shareholding_pct, trade_share_pct, is_offshore }]->(RelatedParty)
- (Company)-[:CASE { declaration_no, overseas_supplier, item, departure_country, import_date, count }]->(CaseType)  -- 신고 처리상태별 사건
- (Person)-[:NETWORK_EDGE { relation_type, weight, confidence_score }]->(Person|Organization)
- (Person)-[:CASE_FROM|CASE_VIA { case_id, case_type, contraband_category, role_in_case, evidence_level, ... }]->(Country)  -- 사건 원산지/경유
- (Person)-[:CASE_TO { 사건속성 }]->(Region)        -- 사건 도착지
- (Person)-[:CASE_LINK { 사건속성 }]->(Person)       -- 동일 사건 연루(대표주체 허브)
- (Person)-[:RESIDES_IN]->(Region), (Organization)-[:LOCATED_IN]->(Region)
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
- "C-숫자"(예: C-2008, C-101) 형태는 company_id 식별자입니다 → company_id = 'C-2008' 로 직접 필터(절대 company_name으로 검색 금지).
- "DV2-C-숫자-NN"·"D-..." 형태는 declaration_no(신고번호)입니다 → declaration_no = '...' 또는 declaration_no ILIKE 'DV2-C-2008-%' 로 검색.
- 그 외 식별자가 없는 일반 기업명 키워드만 company_name ILIKE '%키워드%'로 검색합니다.
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
    """LLM 응답에서 JSON 블록 추출.

    응답이 JSON 앞뒤로 설명 문장·코드펜스를 붙이는 경우가 있어, 첫 번째로 완결되는
    JSON 객체만 raw_decode로 꺼낸다. (탐욕적 정규식 \\{.*\\}는 마지막 }까지 잡아
    'Extra data' 파싱 오류를 낸다)
    """
    text = text.strip()
    # 코드 블록 제거
    if "```" in text:
        text = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    # strict=False: LLM이 JSON 문자열 안에 이스케이프하지 않은 개행을 넣는 경우 허용
    decoder = json.JSONDecoder(strict=False)
    idx = text.find("{")
    while idx != -1:
        try:
            obj, _ = decoder.raw_decode(text, idx)
        except json.JSONDecodeError:
            obj = None
        if isinstance(obj, dict):
            return obj
        idx = text.find("{", idx + 1)
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
        # LLM이 생성한 SQL이 다중행을 반환하는 스칼라 서브쿼리를 포함해도 하드 크래시하지
        # 않도록 한다(다중행 시 임의 1행 반환). 자연어 질의의 견고성을 우선한다.
        try:
            conn.execute("SET scalar_subquery_error_on_multiple_rows=false")
        except duckdb.Error:
            pass
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
