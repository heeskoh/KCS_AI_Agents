"""수사 도메인(일반/마약/외환) 위험지표 근거 데이터 스키마 (2026 재설계).

설계 원칙 (회사 측 risk_source_schema.py 와 대칭)
------------------------------------------------
일반수사·마약수사·외환수사 대상(person/org)의 6종 위험지표를 **근거 데이터에서 산출**한다.
지표는 결과 숫자가 아니라 아래 소스 테이블 레코드의 집계 결과이며 그 과정이 곧 근거가 된다.

근거 소스 테이블 → src/person_risk_indicators.py 산출 엔진 → risk_indicator(domain·reason·recommendation·related_refs)
→ /api/risk-person-profile → 프로파일 패널 근거 bullet.

도메인 ↔ 6지표 ↔ 소스 테이블
-----------------------------
[일반수사 general]
  general_route          고위험 경로 반복      ← person_route_event
  general_network        우범자 관계망 근접     ← person_network_link
  general_small_batch    소량 분산 반입        ← person_seizure_record
  general_prior_record   적발·수사 이력        ← person_seizure_record / person_case_link
  general_concealment    은닉수법 정교성        ← person_concealment_event
  general_identity       허위신고·명의도용      ← person_identity_flag

[마약수사 drug]
  drug_route             고위험 마약경로        ← person_route_event(is_drug)
  drug_network           마약 전력자 관계망     ← person_network_link(known offender)
  drug_small_batch       소량 반복 반입        ← person_seizure_record
  drug_concealment       은닉수법 위험도        ← person_concealment_event
  drug_new_substance     신종마약·위해도        ← person_seizure_record(harm_weight)
  drug_laundering        자금세탁 연계          ← person_laundering_link

[공통 — 관계망 확장용 활동 로그]
  person_activity_record  우범자의 전자상거래·국제우편·특송 송수신 전체 이력.
    압수사건과 무관한 평시 거래도 포함하여, 관계망 분석에서
    "거래상대방 국가/지역", "거래관계 급증" 등의 패턴 탐지에 활용.
    is_case_related/linked_case_id 로 사건 연계 여부 표시.

[외환수사 forex]
  fx_remittance          해외송금 이상          ← person_fx_transaction
  fx_hawala              환치기·불법송금        ← person_fx_transaction(channel)
  fx_asset_flight        재산 국외도피          ← person_asset_flight
  fx_offshore            페이퍼·조세회피처 연계  ← person_offshore_link
  fx_virtual_asset       가상자산 자금이동      ← person_virtual_asset_flow
  fx_structuring         차명·분산거래          ← person_fx_transaction(structured/nominee)
"""
from __future__ import annotations

import duckdb

# ── 일반/마약 공용 근거 테이블 ───────────────────────────────────────────────

DDL_PERSON_ROUTE_EVENT = """
CREATE TABLE IF NOT EXISTS person_route_event (
    id              INTEGER,
    person_id       VARCHAR,
    route_date      DATE,
    origin_country  VARCHAR,
    transit_country VARCHAR,
    dest_region     VARCHAR,
    channel         VARCHAR,            -- 여행자 / 특송 / 우편 / 화물
    is_drug_route   BOOLEAN,            -- 마약 우범 경로 여부
    risk_weight     DOUBLE,             -- 경로 위험 가중치(0~100)
    note            VARCHAR
)
"""

DDL_PERSON_NETWORK_LINK = """
CREATE TABLE IF NOT EXISTS person_network_link (
    id               INTEGER,
    person_id        VARCHAR,
    counterpart_id   VARCHAR,
    counterpart_name VARCHAR,
    relation_type    VARCHAR,           -- 공범 / 수취인 / 동행 / 송금관계
    is_known_offender BOOLEAN,          -- 기존 적발자 여부
    strength         DOUBLE,            -- 관계 강도(0~1)
    note             VARCHAR
)
"""

DDL_PERSON_SEIZURE_RECORD = """
CREATE TABLE IF NOT EXISTS person_seizure_record (
    id                  INTEGER,
    person_id           VARCHAR,
    seizure_date        DATE,
    contraband_category VARCHAR,        -- 마약류 / 총기류 / 위조상품 등
    contraband_sub      VARCHAR,        -- 필로폰 / 신종마약 등
    quantity            DOUBLE,
    quantity_unit       VARCHAR,
    batch_no            VARCHAR,
    is_small_batch      BOOLEAN,        -- 소량 분산 반입 여부
    is_new_substance    BOOLEAN,        -- 신종마약 여부
    harm_weight         DOUBLE,         -- 위해도 가중치(0~100)
    case_status         VARCHAR,        -- 적발 / 송치 / 처분
    note                VARCHAR
)
"""

DDL_PERSON_CONCEALMENT_EVENT = """
CREATE TABLE IF NOT EXISTS person_concealment_event (
    id                  INTEGER,
    person_id           VARCHAR,
    event_date          DATE,
    method              VARCHAR,        -- 인체은닉 / 이중바닥 / 우편분산 / 식품위장
    sophistication_score DOUBLE,        -- 수법 정교성(0~100)
    note                VARCHAR
)
"""

DDL_PERSON_IDENTITY_FLAG = """
CREATE TABLE IF NOT EXISTS person_identity_flag (
    id          INTEGER,
    person_id   VARCHAR,
    flag_date   DATE,
    flag_type   VARCHAR,                -- 허위신고 / 명의도용 / 위명사용 / 분산신고
    detail      VARCHAR
)
"""

DDL_PERSON_LAUNDERING_LINK = """
CREATE TABLE IF NOT EXISTS person_laundering_link (
    id          INTEGER,
    person_id   VARCHAR,
    link_date   DATE,
    scheme      VARCHAR,                -- 차명계좌 / 가상자산 / 환치기 / 현금운반
    amount      DOUBLE,
    linked_case VARCHAR,
    note        VARCHAR
)
"""

DDL_PERSON_ACTIVITY_RECORD = """
CREATE TABLE IF NOT EXISTS person_activity_record (
    id                   INTEGER,
    person_id            VARCHAR,
    activity_date        DATE,
    activity_type        VARCHAR,        -- 전자상거래주문 / 국제우편발송 / 국제우편수취 / 특송발송 / 특송수취
    direction            VARCHAR,        -- 발송 / 수신
    channel              VARCHAR,        -- 해외직구 / 오픈마켓 / SNS마켓 / 구매대행 / EMS / 특송업체
    counterpart_name     VARCHAR,
    counterpart_country  VARCHAR,        -- 해외 상대방 국가(국내면 '대한민국')
    counterpart_region   VARCHAR,        -- 국내 상대방 거주지역(해외면 NULL)
    counterpart_person_id VARCHAR,       -- 등록된 인물(RP-xxxx)이면 FK, 미식별이면 NULL
    item_name            VARCHAR,
    item_category        VARCHAR,
    amount               DOUBLE,
    is_case_related      BOOLEAN,        -- 압수사건과 직접 연계 여부
    linked_case_id       VARCHAR,        -- 연계 시 smuggling_case.case_id
    note                 VARCHAR
)
"""

# ── 외환수사 전용 근거 테이블 ────────────────────────────────────────────────

DDL_PERSON_FX_TRANSACTION = """
CREATE TABLE IF NOT EXISTS person_fx_transaction (
    id                  INTEGER,
    person_id           VARCHAR,
    txn_date            DATE,
    amount              DOUBLE,
    direction           VARCHAR,        -- 송금 / 수취
    channel             VARCHAR,        -- 정식송금 / 환치기 / 차명 / 분산
    counterpart_country VARCHAR,
    counterpart_name    VARCHAR,
    is_structured       BOOLEAN,        -- 분할(구조화) 거래 여부
    is_nominee          BOOLEAN,        -- 차명 거래 여부
    is_hawala           BOOLEAN,        -- 환치기(불법송금) 여부
    note                VARCHAR
)
"""

DDL_PERSON_ASSET_FLIGHT = """
CREATE TABLE IF NOT EXISTS person_asset_flight (
    id           INTEGER,
    person_id    VARCHAR,
    event_date   DATE,
    asset_type   VARCHAR,               -- 현금 / 부동산 / 증권 / 귀금속
    amount       DOUBLE,
    dest_country VARCHAR,
    method       VARCHAR,               -- 허위무역대금 / 가장거래 / 직접반출
    note         VARCHAR
)
"""

DDL_PERSON_OFFSHORE_LINK = """
CREATE TABLE IF NOT EXISTS person_offshore_link (
    id            INTEGER,
    person_id     VARCHAR,
    entity_name   VARCHAR,
    jurisdiction  VARCHAR,              -- BVI / 케이맨 / 홍콩 등
    is_paper      BOOLEAN,
    ownership_pct DOUBLE,
    note          VARCHAR
)
"""

DDL_PERSON_VIRTUAL_ASSET_FLOW = """
CREATE TABLE IF NOT EXISTS person_virtual_asset_flow (
    id           INTEGER,
    person_id    VARCHAR,
    txn_date     DATE,
    asset        VARCHAR,               -- BTC / ETH / USDT
    amount_krw   DOUBLE,
    wallet       VARCHAR,
    exchange     VARCHAR,
    dest_country VARCHAR,
    note         VARCHAR
)
"""

SOURCE_TABLES: list[tuple[str, str]] = [
    ("person_route_event", DDL_PERSON_ROUTE_EVENT),
    ("person_network_link", DDL_PERSON_NETWORK_LINK),
    ("person_seizure_record", DDL_PERSON_SEIZURE_RECORD),
    ("person_concealment_event", DDL_PERSON_CONCEALMENT_EVENT),
    ("person_identity_flag", DDL_PERSON_IDENTITY_FLAG),
    ("person_laundering_link", DDL_PERSON_LAUNDERING_LINK),
    ("person_activity_record", DDL_PERSON_ACTIVITY_RECORD),
    ("person_fx_transaction", DDL_PERSON_FX_TRANSACTION),
    ("person_asset_flight", DDL_PERSON_ASSET_FLIGHT),
    ("person_offshore_link", DDL_PERSON_OFFSHORE_LINK),
    ("person_virtual_asset_flow", DDL_PERSON_VIRTUAL_ASSET_FLOW),
]

# risk_indicator 확장 컬럼 (기존 테이블에 추가). reason 은 이미 존재.
RISK_INDICATOR_NEW_COLUMNS: list[tuple[str, str]] = [
    ("domain", "VARCHAR"),          # general / drug / forex
    ("recommendation", "VARCHAR"),  # 조사 권고사유
    ("related_refs", "VARCHAR"),    # 근거 레코드 참조(JSON)
]


def create_person_risk_source_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """근거 소스 테이블 생성 + risk_indicator 확장 컬럼 추가 (멱등)."""
    for _, ddl in SOURCE_TABLES:
        conn.execute(ddl)
    extend_risk_indicator(conn)


def extend_risk_indicator(conn: duckdb.DuckDBPyConnection) -> None:
    """risk_indicator 테이블에 domain/recommendation/related_refs 컬럼 추가(있으면 건너뜀)."""
    existing = {
        row[1]  # PRAGMA table_info: (cid, name, type, ...) → name 은 인덱스 1
        for row in conn.execute("PRAGMA table_info('risk_indicator')").fetchall()
    } if conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='risk_indicator'"
    ).fetchone()[0] else set()
    if not existing:
        return
    for col, col_type in RISK_INDICATOR_NEW_COLUMNS:
        if col not in existing:
            conn.execute(f"ALTER TABLE risk_indicator ADD COLUMN {col} {col_type}")


def drop_person_risk_source_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """근거 소스 테이블 전체 삭제 (--reset 시). risk_indicator 본체는 별도 관리."""
    for name, _ in SOURCE_TABLES:
        conn.execute(f"DROP TABLE IF EXISTS {name}")
