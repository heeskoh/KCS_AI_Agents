"""위험지표 근거 데이터 스키마 (2026 재설계).

설계 원칙
--------
6종 기업 위험지표(저가신고·특수관계·FTA원산지·관세환급·HS분류·역외자금)를
**근거 데이터로부터 산출**하기 위한 소스 테이블 정의. 지표는 결과 숫자가 아니라
아래 테이블의 레코드를 집계하여 계산되며, 그 과정이 곧 근거가 된다.

근거 데이터(소스 테이블) → src/risk_indicators.py 산출 엔진 → company_risk_indicator(근거 저장)
→ import_risk_scores(요약 rate) → Neo4j(:Company)-[:HAS_RISK_INDICATOR]->(:RiskIndicator)

DuckDB가 단일 진실원천(source of truth)이다.

지표 ↔ 소스 테이블 매핑
---------------------
A 저가신고 의심률   : price_benchmark, valuation_audit, (related_party 거래비중 재사용)
B 특수관계 이상률   : related_party, transfer_pricing_audit
C FTA 원산지 오용   : fta_claim, origin_verification
D 관세환급 이상률   : export_declaration, drawback, drawback_audit
E HS 분류 오류율    : hs_classification_event, classification_case_library
F 역외자금 은닉     : fx_transaction, offshore_company, forex_investigation
근거 저장           : company_risk_indicator
"""
from __future__ import annotations

import duckdb

# 지표 코드/한글명/rate컬럼 매핑은 산출 엔진(src/risk_indicators.py)이 단일 소유.


# ── 소스 테이블 DDL ──────────────────────────────────────────────────────────

# A. 저가신고 ─────────────────────────────────────────────
DDL_PRICE_BENCHMARK = """
CREATE TABLE IF NOT EXISTS price_benchmark (
    hs_code            VARCHAR,
    period             VARCHAR,         -- 기준 연도/분기 (예: '2025')
    avg_declared_value DOUBLE,          -- 동일 HS 평균 신고금액(원) — 수량 미보유로 신고금액 기준
    sample_size        INTEGER,         -- 표본 신고 건수
    currency           VARCHAR,         -- 통화 (KRW)
    source             VARCHAR          -- 산정 출처
)
"""

DDL_VALUATION_AUDIT = """
CREATE TABLE IF NOT EXISTS valuation_audit (
    id              INTEGER,
    company_id      VARCHAR,
    audit_date      DATE,
    audit_type      VARCHAR,            -- 정정신고 / 과세가격심사 / 저가신고적발
    hs_code         VARCHAR,
    result          VARCHAR,            -- 정정 / 추징 / 정상
    adjusted_amount DOUBLE,             -- 정정·추징 금액(원)
    note            VARCHAR
)
"""

# B. 특수관계 ─────────────────────────────────────────────
DDL_RELATED_PARTY = """
CREATE TABLE IF NOT EXISTS related_party (
    id               INTEGER,
    company_id       VARCHAR,
    party_name       VARCHAR,
    country          VARCHAR,
    relation_type    VARCHAR,           -- 모회사 / 자회사 / 계열사 / 특수관계
    shareholding_pct DOUBLE,            -- 지분율(%)
    trade_share_pct  DOUBLE,            -- 해당 특수관계사 거래비중(%)
    is_offshore      BOOLEAN,           -- 조세회피처 소재 여부
    note             VARCHAR
)
"""

DDL_TRANSFER_PRICING_AUDIT = """
CREATE TABLE IF NOT EXISTS transfer_pricing_audit (
    id                  INTEGER,
    company_id          VARCHAR,
    audit_date          DATE,
    abnormal_margin_rate DOUBLE,        -- 비정상 마진율(%)
    result              VARCHAR,        -- 조사 / 추징 / 정상
    recovered_amount    DOUBLE,         -- 추징 금액(원)
    note                VARCHAR
)
"""

# C. FTA 원산지 ───────────────────────────────────────────
DDL_FTA_CLAIM = """
CREATE TABLE IF NOT EXISTS fta_claim (
    id               INTEGER,
    company_id       VARCHAR,
    agreement        VARCHAR,           -- 한-EU / 한-아세안 / 한-미 등
    hs_code          VARCHAR,
    co_no            VARCHAR,           -- 원산지증명서(C/O) 번호
    co_status        VARCHAR,           -- 정상 / 오류 / 미제출
    reduction_amount DOUBLE,            -- FTA 특혜관세 감면액(원)
    claim_date       DATE,
    is_high_risk_hs  BOOLEAN            -- 우범 HS 해당 여부
)
"""

DDL_ORIGIN_VERIFICATION = """
CREATE TABLE IF NOT EXISTS origin_verification (
    id               INTEGER,
    company_id       VARCHAR,
    fta_claim_ref    VARCHAR,           -- fta_claim.co_no 참조
    verify_date      DATE,
    verify_result    VARCHAR,           -- 성공 / 실패
    recovered_amount DOUBLE,            -- 검증 실패 시 추징액(원)
    agency           VARCHAR,
    note             VARCHAR
)
"""

# D. 관세환급 ─────────────────────────────────────────────
DDL_EXPORT_DECLARATION = """
CREATE TABLE IF NOT EXISTS export_declaration (
    id              INTEGER,
    company_id      VARCHAR,
    declaration_no  VARCHAR,
    hs_code         VARCHAR,
    item_name       VARCHAR,
    export_value    DOUBLE,
    dest_country    VARCHAR,
    export_date     DATE,
    status          VARCHAR
)
"""

DDL_DRAWBACK = """
CREATE TABLE IF NOT EXISTS drawback (
    id              INTEGER,
    company_id      VARCHAR,
    drawback_no     VARCHAR,
    claim_amount    DOUBLE,             -- 환급 신청액(원)
    bom_ref         VARCHAR,            -- 소요량(BOM) 산정서 참조
    status          VARCHAR,            -- 정상 / 부인 / 과다 / 반복
    claim_date      DATE,
    export_decl_ref VARCHAR             -- export_declaration.declaration_no 참조
)
"""

DDL_DRAWBACK_AUDIT = """
CREATE TABLE IF NOT EXISTS drawback_audit (
    id               INTEGER,
    company_id       VARCHAR,
    audit_date       DATE,
    result           VARCHAR,           -- 부인 / 추징 / 정상
    recovered_amount DOUBLE,            -- 환급 부인·추징액(원)
    finding          VARCHAR,           -- 허위BOM의심 / 과다환급 / 반복환급 등
    note             VARCHAR
)
"""

# E. HS 분류 ──────────────────────────────────────────────
DDL_HS_CLASSIFICATION_EVENT = """
CREATE TABLE IF NOT EXISTS hs_classification_event (
    id              INTEGER,
    company_id      VARCHAR,
    event_date      DATE,
    event_type      VARCHAR,            -- 정정 / 심사 / AI불일치
    declared_hs     VARCHAR,            -- 신고 HS
    ai_suggested_hs VARCHAR,            -- AI 추천 HS (AI불일치 시)
    case_ref        VARCHAR,            -- classification_case_library.case_id 참조
    note            VARCHAR
)
"""

DDL_CLASSIFICATION_CASE_LIBRARY = """
CREATE TABLE IF NOT EXISTS classification_case_library (
    case_id   VARCHAR,
    hs_code   VARCHAR,
    title     VARCHAR,
    summary   VARCHAR,
    ruling    VARCHAR                   -- 품목분류 결정/판례 요지
)
"""

# F. 역외자금 ─────────────────────────────────────────────
DDL_FX_TRANSACTION = """
CREATE TABLE IF NOT EXISTS fx_transaction (
    id                 INTEGER,
    company_id         VARCHAR,
    txn_date           DATE,
    amount             DOUBLE,          -- 거래 금액(원)
    direction          VARCHAR,         -- 송금 / 수취
    counterpart_country VARCHAR,
    counterpart_name   VARCHAR,
    is_tax_haven       BOOLEAN,         -- 조세회피처 상대 여부
    note               VARCHAR
)
"""

DDL_OFFSHORE_COMPANY = """
CREATE TABLE IF NOT EXISTS offshore_company (
    id               INTEGER,
    company_id       VARCHAR,
    entity_name      VARCHAR,
    jurisdiction     VARCHAR,           -- BVI / 케이맨 / 홍콩 등
    is_paper_company BOOLEAN,           -- 페이퍼컴퍼니 여부
    ownership_pct    DOUBLE,
    note             VARCHAR
)
"""

DDL_FOREX_INVESTIGATION = """
CREATE TABLE IF NOT EXISTS forex_investigation (
    id                 INTEGER,
    company_id         VARCHAR,
    investigation_date DATE,
    result             VARCHAR,         -- 적발 / 무혐의 / 조사중
    amount             DOUBLE,          -- 관련 금액(원)
    agency             VARCHAR,
    note               VARCHAR
)
"""

# ── 근거 저장 테이블 ─────────────────────────────────────────────────────────
# 인물 그래프의 risk_indicator(reason 보유)를 기업용으로 미러링.
DDL_COMPANY_RISK_INDICATOR = """
CREATE TABLE IF NOT EXISTS company_risk_indicator (
    id             INTEGER,
    company_id     VARCHAR,
    indicator_code VARCHAR,             -- undervaluation / related_party / ...
    indicator_name VARCHAR,             -- 저가신고 의심률 / ...
    score          DOUBLE,              -- 0~100 산출 점수
    reason         VARCHAR,             -- 근거 bullet (줄바꿈 구분)
    related_refs   VARCHAR,             -- 근거 레코드 참조 (JSON 문자열)
    recommendation VARCHAR,             -- 조사 권고사유
    calculated_at  TIMESTAMP
)
"""

# 생성/삭제 순회용 (테이블명, DDL)
SOURCE_TABLES: list[tuple[str, str]] = [
    ("price_benchmark", DDL_PRICE_BENCHMARK),
    ("valuation_audit", DDL_VALUATION_AUDIT),
    ("related_party", DDL_RELATED_PARTY),
    ("transfer_pricing_audit", DDL_TRANSFER_PRICING_AUDIT),
    ("fta_claim", DDL_FTA_CLAIM),
    ("origin_verification", DDL_ORIGIN_VERIFICATION),
    ("export_declaration", DDL_EXPORT_DECLARATION),
    ("drawback", DDL_DRAWBACK),
    ("drawback_audit", DDL_DRAWBACK_AUDIT),
    ("hs_classification_event", DDL_HS_CLASSIFICATION_EVENT),
    ("classification_case_library", DDL_CLASSIFICATION_CASE_LIBRARY),
    ("fx_transaction", DDL_FX_TRANSACTION),
    ("offshore_company", DDL_OFFSHORE_COMPANY),
    ("forex_investigation", DDL_FOREX_INVESTIGATION),
    ("company_risk_indicator", DDL_COMPANY_RISK_INDICATOR),
]

# company_id 종속 테이블만 (특정 기업 데이터 재생성 시 삭제 대상).
# 참조성 테이블(price_benchmark, classification_case_library)은 기업 비종속이므로 제외.
COMPANY_SCOPED_TABLES: list[str] = [
    name for name, _ in SOURCE_TABLES
    if name not in {"price_benchmark", "classification_case_library"}
]


def create_risk_source_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """근거 소스 테이블 + company_risk_indicator 생성 (멱등)."""
    for _, ddl in SOURCE_TABLES:
        conn.execute(ddl)


def drop_risk_source_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """근거 소스 테이블 전체 삭제 (--reset 시)."""
    for name, _ in SOURCE_TABLES:
        conn.execute(f"DROP TABLE IF EXISTS {name}")
