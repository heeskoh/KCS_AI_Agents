"""Create and seed risk-person profiling tables in customs.duckdb.

This script creates the first eight tables for contraband smuggling
risk-person profiles and loads deterministic synthetic demo data.
The sample records are fictional and should not be treated as real people.
"""

from __future__ import annotations

import argparse
import hashlib
import random
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb


DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"
SEED_BATCH_ID = "risk-person-sample-v1"


DDL = [
    """
    CREATE TABLE IF NOT EXISTS risk_person_profile (
        person_id VARCHAR PRIMARY KEY,
        profile_type VARCHAR,
        name VARCHAR,
        name_aliases VARCHAR,
        birth_date DATE,
        gender VARCHAR,
        nationality VARCHAR,
        id_doc_type VARCHAR,
        id_doc_hash VARCHAR,
        phone_hash VARCHAR,
        email_hash VARCHAR,
        address_region VARCHAR,
        occupation VARCHAR,
        risk_level VARCHAR,
        risk_score DOUBLE,
        risk_tags VARCHAR,
        watch_status VARCHAR,
        seed_batch_id VARCHAR,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS risk_org_profile (
        org_id VARCHAR PRIMARY KEY,
        org_name VARCHAR,
        business_no_hash VARCHAR,
        org_type VARCHAR,
        industry_code VARCHAR,
        country VARCHAR,
        address_region VARCHAR,
        risk_score DOUBLE,
        risk_tags VARCHAR,
        watch_status VARCHAR,
        seed_batch_id VARCHAR,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS smuggling_case (
        case_id VARCHAR PRIMARY KEY,
        case_no VARCHAR,
        case_type VARCHAR,
        contraband_category VARCHAR,
        contraband_sub_category VARCHAR,
        case_status VARCHAR,
        detection_date DATE,
        detection_channel VARCHAR,
        origin_country VARCHAR,
        transit_country VARCHAR,
        destination_region VARCHAR,
        modus_operandi VARCHAR,
        concealment_method VARCHAR,
        quantity DOUBLE,
        quantity_unit VARCHAR,
        estimated_value DOUBLE,
        lead_agency VARCHAR,
        summary VARCHAR,
        seed_batch_id VARCHAR,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS person_case_link (
        link_id VARCHAR PRIMARY KEY,
        person_id VARCHAR,
        case_id VARCHAR,
        role_in_case VARCHAR,
        confidence_score DOUBLE,
        evidence_level VARCHAR,
        source_id VARCHAR,
        seed_batch_id VARCHAR,
        created_at TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS network_edge (
        edge_id VARCHAR PRIMARY KEY,
        source_type VARCHAR,
        source_id VARCHAR,
        target_type VARCHAR,
        target_id VARCHAR,
        relation_type VARCHAR,
        weight DOUBLE,
        confidence_score DOUBLE,
        first_seen_at DATE,
        last_seen_at DATE,
        source_id_ref VARCHAR,
        seed_batch_id VARCHAR,
        created_at TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS risk_indicator (
        indicator_id VARCHAR PRIMARY KEY,
        entity_type VARCHAR,
        entity_id VARCHAR,
        indicator_code VARCHAR,
        indicator_name VARCHAR,
        indicator_value VARCHAR,
        score DOUBLE,
        weight DOUBLE,
        reason VARCHAR,
        calculated_at TIMESTAMP,
        seed_batch_id VARCHAR
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS evidence_source (
        source_id VARCHAR PRIMARY KEY,
        source_type VARCHAR,
        source_title VARCHAR,
        source_date DATE,
        source_agency VARCHAR,
        classification_level VARCHAR,
        file_path VARCHAR,
        summary VARCHAR,
        reliability_score DOUBLE,
        created_by VARCHAR,
        seed_batch_id VARCHAR,
        created_at TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS analysis_result (
        analysis_id VARCHAR PRIMARY KEY,
        entity_type VARCHAR,
        entity_id VARCHAR,
        analysis_type VARCHAR,
        model_or_agent VARCHAR,
        input_summary VARCHAR,
        output_summary VARCHAR,
        risk_score_before DOUBLE,
        risk_score_after DOUBLE,
        explanation VARCHAR,
        review_status VARCHAR,
        seed_batch_id VARCHAR,
        created_at TIMESTAMP
    )
    """,
]


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def risk_level(score: float) -> str:
    if score >= 85:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 45:
        return "MEDIUM"
    return "LOW"


def choose_weighted(rng: random.Random, items: list[tuple[str, int]]) -> str:
    values, weights = zip(*items)
    return rng.choices(values, weights=weights, k=1)[0]


def create_schema(conn: duckdb.DuckDBPyConnection) -> None:
    for statement in DDL:
        conn.execute(statement)


def clear_seed(conn: duckdb.DuckDBPyConnection) -> None:
    tables = [
        "analysis_result",
        "risk_indicator",
        "network_edge",
        "person_case_link",
        "smuggling_case",
        "risk_org_profile",
        "risk_person_profile",
        "evidence_source",
    ]
    for table in tables:
        conn.execute(f"DELETE FROM {table} WHERE seed_batch_id = ?", [SEED_BATCH_ID])


def build_seed_rows() -> dict[str, list[tuple]]:
    rng = random.Random(20260528)
    now = datetime.now().replace(microsecond=0)
    today = date.today()

    contraband = [
        ("마약류", "필로폰", "메신저 은어 주문과 국제우편 분산 반입"),
        ("마약류", "대마 카트리지", "전자담배 액상으로 위장한 특송 반입"),
        ("총기류", "권총 부품", "공구 부품 품명으로 분할 반입"),
        ("불법의약품", "스테로이드", "건강보조식품으로 위장한 반복 구매"),
        ("불법의약품", "마취성 진통제", "처방전 위조 의심 소량 반복 반입"),
        ("위조상품", "고가 브랜드 의류", "상표 제거 후 재부착 방식 유통"),
    ]
    countries = ["태국", "베트남", "중국", "미국", "멕시코", "네덜란드", "필리핀", "말레이시아"]
    regions = ["서울", "인천", "부산", "대구", "광주", "대전", "경기", "제주"]
    channels = ["국제우편", "특송화물", "공항 여행자", "항만 컨테이너", "환적화물"]
    roles = ["운반책", "수취인", "발송책", "모집책", "자금책", "연락책", "공범"]
    profile_types = [("운반책", 28), ("수취인", 24), ("연락책", 16), ("모집책", 12), ("자금책", 10), ("총책 의심", 6), ("조직대표", 4)]
    occupations = ["무직", "배송기사", "온라인 판매자", "무역업", "유학생", "프리랜서", "물류대행", "요식업"]

    persons: list[tuple] = []
    orgs: list[tuple] = []
    cases: list[tuple] = []
    links: list[tuple] = []
    edges: list[tuple] = []
    indicators: list[tuple] = []
    sources: list[tuple] = []
    analyses: list[tuple] = []

    for i in range(1, 26):
        org_id = f"RO-{i:03d}"
        org_name = f"샘플무역네트워크{i:02d}"
        score = round(rng.uniform(45, 92), 1)
        tag = rng.choice(["위장업체", "반복수취지", "고위험국 거래", "명의대여 의심"])
        orgs.append((
            org_id,
            org_name,
            digest(f"biz-{org_id}"),
            rng.choice(["법인", "개인사업자", "해외업체", "비공식조직"]),
            rng.choice(["G46", "H52", "G47", "N79", "S96"]),
            rng.choice(countries),
            rng.choice(regions),
            score,
            tag,
            rng.choice(["관찰중", "조사중", "보류"]),
            SEED_BATCH_ID,
            now,
            now,
        ))

    for i in range(1, 101):
        person_id = f"RP-{i:04d}"
        category, sub_category, method = contraband[(i - 1) % len(contraband)]
        base_score = rng.uniform(38, 96)
        if category in {"마약류", "총기류"}:
            base_score += rng.uniform(3, 8)
        score = round(min(99.0, base_score), 1)
        level = risk_level(score)
        profile_type = choose_weighted(rng, profile_types)
        nationality = rng.choice(["대한민국", "중국", "태국", "베트남", "미국", "필리핀", "말레이시아"])
        region = rng.choice(regions)
        tags = [category, sub_category, rng.choice(["특송", "국제우편", "고위험국", "동일주소", "분산송금"])]
        birth = date(rng.randint(1972, 2003), rng.randint(1, 12), rng.randint(1, 28))

        persons.append((
            person_id,
            profile_type,
            f"샘플우범자{i:03d}",
            f"Alias-{i:03d}, {sub_category}관련별칭",
            birth,
            rng.choice(["남", "여", "미상"]),
            nationality,
            rng.choice(["여권", "외국인등록", "주민등록", "미확인"]),
            digest(f"id-doc-{person_id}"),
            digest(f"010-{i:04d}-{rng.randint(1000, 9999)}"),
            digest(f"riskperson{i:03d}@example.invalid"),
            region,
            rng.choice(occupations),
            level,
            score,
            ", ".join(tags),
            rng.choice(["관찰중", "조사중", "첩보확인", "보류"]),
            SEED_BATCH_ID,
            now,
            now,
        ))

        case_id = f"SC-{i:04d}"
        source_id = f"EV-{i:04d}"
        detection_date = today - timedelta(days=rng.randint(5, 720))
        channel = rng.choice(channels)
        origin = rng.choice(countries)
        transit = rng.choice([c for c in countries if c != origin] + ["없음"])
        case_type = rng.choice(["밀수입", "밀수출", "환적", "특송", "우편", "여행자"])
        quantity = round(rng.uniform(0.2, 35.0), 2)
        estimated_value = round(quantity * rng.uniform(450_000, 9_500_000), -3)

        cases.append((
            case_id,
            f"RS-2026-{i:04d}",
            case_type,
            category,
            sub_category,
            rng.choice(["첩보", "조사중", "송치", "종결", "보강필요"]),
            detection_date,
            channel,
            origin,
            transit,
            region,
            method,
            rng.choice(["이중바닥", "식품포장", "전자제품 내부", "서류봉투", "의류 봉제선", "분할배송"]),
            quantity,
            rng.choice(["kg", "정", "점", "개", "ml"]),
            estimated_value,
            rng.choice(["조사국 조사1과", "인천공항세관", "부산세관", "국제우편세관", "서울세관"]),
            f"{category}/{sub_category} 관련 {channel} 경로 이상징후 샘플 사건",
            SEED_BATCH_ID,
            now,
            now,
        ))

        sources.append((
            source_id,
            rng.choice(["첩보보고서", "수사보고서", "압수자료", "외부기관자료", "RAG문서"]),
            f"샘플 위해물품 첩보자료 {i:03d}",
            detection_date,
            rng.choice(["관세청", "경찰청", "국정원", "해외세관", "식약처"]),
            rng.choice(["내부", "대외비", "일반"]),
            f"data/evidence/sample-risk-person-{i:03d}.pdf",
            f"{person_id}와 {case_id} 연결 근거가 포함된 합성 샘플 자료",
            round(rng.uniform(0.55, 0.96), 2),
            "system-seed",
            SEED_BATCH_ID,
            now,
        ))

        links.append((
            f"PCL-{i:04d}",
            person_id,
            case_id,
            rng.choice(roles),
            round(rng.uniform(0.55, 0.98), 2),
            rng.choice(["확정", "강함", "중간", "약함"]),
            source_id,
            SEED_BATCH_ID,
            now,
        ))

        org_id = f"RO-{((i - 1) % 25) + 1:03d}"
        edges.extend([
            (
                f"NE-PCASE-{i:04d}",
                "person",
                person_id,
                "case",
                case_id,
                "사건관련",
                round(rng.uniform(0.55, 1.0), 2),
                round(rng.uniform(0.58, 0.98), 2),
                detection_date - timedelta(days=rng.randint(0, 90)),
                detection_date,
                source_id,
                SEED_BATCH_ID,
                now,
            ),
            (
                f"NE-PORG-{i:04d}",
                "person",
                person_id,
                "org",
                org_id,
                rng.choice(["소속", "명의대여", "동일주소", "거래관계", "연락관계"]),
                round(rng.uniform(0.35, 0.92), 2),
                round(rng.uniform(0.45, 0.91), 2),
                detection_date - timedelta(days=rng.randint(30, 500)),
                detection_date,
                source_id,
                SEED_BATCH_ID,
                now,
            ),
        ])
        if i > 1 and i % 3 == 0:
            edges.append((
                f"NE-PP-{i:04d}",
                "person",
                person_id,
                "person",
                f"RP-{rng.randint(1, i - 1):04d}",
                rng.choice(["공범", "동행", "동일수취지", "연락빈번", "송금관계"]),
                round(rng.uniform(0.4, 0.95), 2),
                round(rng.uniform(0.45, 0.93), 2),
                detection_date - timedelta(days=rng.randint(1, 240)),
                detection_date,
                source_id,
                SEED_BATCH_ID,
                now,
            ))

        indicator_specs = [
            ("HIGH_RISK_ROUTE", "고위험국 반복 이동/배송", f"{origin}->{region} / {channel}", rng.uniform(45, 95), 0.24),
            ("NETWORK_PROXIMITY", "기존 적발자와 관계망 근접도", f"관계강도 {rng.uniform(0.4, 0.95):.2f}", rng.uniform(35, 90), 0.22),
            ("SMALL_BATCH_REPEAT", "소량 반복 반입 패턴", f"{rng.randint(2, 11)}회 반복", rng.uniform(30, 86), 0.18),
        ]
        for j, (code, name, value, ind_score, weight) in enumerate(indicator_specs, 1):
            indicators.append((
                f"RI-{i:04d}-{j}",
                "person",
                person_id,
                code,
                name,
                value,
                round(ind_score, 1),
                weight,
                f"{sub_category} 관련 {name} 샘플 지표",
                now,
                SEED_BATCH_ID,
            ))

        analyses.append((
            f"AR-{i:04d}",
            "person",
            person_id,
            "프로파일링",
            "risk_person_profile_agent",
            f"{category}/{sub_category}, {channel}, 관계망 지표 입력",
            f"{level} 위험군. {method} 수법과 {origin} 경로를 우선 확인 필요.",
            round(max(0, score - rng.uniform(2, 12)), 1),
            score,
            "사건 연결, 관계망 강도, 반복 경로, 위해물품 가중치를 종합 산정",
            rng.choice(["미검토", "검토완료", "보강필요"]),
            SEED_BATCH_ID,
            now,
        ))

        # Add richer investigation history: each risk person ends up with
        # 3-10 linked cases, evidence records, case edges, and relationship
        # edges to other persons in the sample network.
        history_count = rng.randint(3, 10)
        for h in range(2, history_count + 1):
            hist_category, hist_sub_category, hist_method = rng.choice(contraband)
            hist_case_id = f"SC-{i:04d}-{h:02d}"
            hist_source_id = f"EV-{i:04d}-{h:02d}"
            hist_detection_date = today - timedelta(days=rng.randint(15, 1_460))
            hist_channel = rng.choice(channels)
            hist_origin = rng.choice(countries)
            hist_transit = rng.choice([c for c in countries if c != hist_origin] + ["없음"])
            hist_quantity = round(rng.uniform(0.1, 42.0), 2)
            hist_value = round(hist_quantity * rng.uniform(350_000, 12_000_000), -3)
            hist_role = rng.choice(roles)

            cases.append((
                hist_case_id,
                f"RS-2026-{i:04d}-{h:02d}",
                rng.choice(["밀반입", "밀반출", "추적", "특송", "우편", "여행자"]),
                hist_category,
                hist_sub_category,
                rng.choice(["첩보", "조사중", "송치", "종결", "보강필요"]),
                hist_detection_date,
                hist_channel,
                hist_origin,
                hist_transit,
                region,
                hist_method,
                rng.choice(["이중바닥", "상품포장", "전자제품 내부", "서류봉투", "의류 봉제선", "분할배송"]),
                hist_quantity,
                rng.choice(["kg", "정", "점", "개", "ml"]),
                hist_value,
                rng.choice(["조사국 조사1과", "인천공항세관", "부산세관", "국제우편세관", "서울세관"]),
                f"{person_id} 관련 반복 수사이력 {h - 1}: {hist_category}/{hist_sub_category} {hist_channel} 경로 의심",
                SEED_BATCH_ID,
                now,
                now,
            ))

            sources.append((
                hist_source_id,
                rng.choice(["첩보보고서", "수사보고서", "압수자료", "내부기관자료", "RAG문서"]),
                f"우범자 반복 수사이력 근거자료 {i:03d}-{h:02d}",
                hist_detection_date,
                rng.choice(["관세청", "경찰청", "국정원", "해외기관", "식약처"]),
                rng.choice(["대외비", "일반", "내부"]),
                f"data/evidence/sample-risk-person-{i:03d}-{h:02d}.pdf",
                f"{person_id}의 {hist_case_id} 연결 근거와 관계망 단서가 포함된 샘플 자료",
                round(rng.uniform(0.55, 0.97), 2),
                "system-seed",
                SEED_BATCH_ID,
                now,
            ))

            links.append((
                f"PCL-{i:04d}-{h:02d}",
                person_id,
                hist_case_id,
                hist_role,
                round(rng.uniform(0.52, 0.99), 2),
                rng.choice(["확정", "강함", "중간", "약함"]),
                hist_source_id,
                SEED_BATCH_ID,
                now,
            ))

            edges.append((
                f"NE-PCASE-{i:04d}-{h:02d}",
                "person",
                person_id,
                "case",
                hist_case_id,
                "수사이력",
                round(rng.uniform(0.55, 1.0), 2),
                round(rng.uniform(0.55, 0.98), 2),
                hist_detection_date - timedelta(days=rng.randint(0, 120)),
                hist_detection_date,
                hist_source_id,
                SEED_BATCH_ID,
                now,
            ))

            related_person = f"RP-{rng.randint(1, 100):04d}"
            if related_person == person_id:
                related_person = f"RP-{(i % 100) + 1:04d}"
            edges.append((
                f"NE-PPH-{i:04d}-{h:02d}",
                "person",
                person_id,
                "person",
                related_person,
                rng.choice(["공범의심", "동행", "동일수취지", "연락빈번", "송금관계", "동일조직"]),
                round(rng.uniform(0.42, 0.96), 2),
                round(rng.uniform(0.45, 0.95), 2),
                hist_detection_date - timedelta(days=rng.randint(1, 365)),
                hist_detection_date,
                hist_source_id,
                SEED_BATCH_ID,
                now,
            ))

            analyses.append((
                f"AR-{i:04d}-{h:02d}",
                "person",
                person_id,
                "수사이력분석",
                "risk_person_history_agent",
                f"{hist_category}/{hist_sub_category}, {hist_channel}, {hist_role} 수사이력",
                f"{hist_case_id}에서 {hist_role} 역할로 식별. 반복 경로와 관계망 단서 확인 필요.",
                round(max(0, score - rng.uniform(3, 15)), 1),
                score,
                "반복 사건, 수사역할, 운송경로, 상호 관계망 가중치를 종합",
                rng.choice(["미검토", "검토완료", "보강필요"]),
                SEED_BATCH_ID,
                now,
            ))

    return {
        "risk_person_profile": persons,
        "risk_org_profile": orgs,
        "smuggling_case": cases,
        "evidence_source": sources,
        "person_case_link": links,
        "network_edge": edges,
        "risk_indicator": indicators,
        "analysis_result": analyses,
    }


def insert_rows(conn: duckdb.DuckDBPyConnection, rows: dict[str, list[tuple]]) -> None:
    insert_sql = {
        "risk_person_profile": "INSERT INTO risk_person_profile VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "risk_org_profile": "INSERT INTO risk_org_profile VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "smuggling_case": "INSERT INTO smuggling_case VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "evidence_source": "INSERT INTO evidence_source VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        "person_case_link": "INSERT INTO person_case_link VALUES (?,?,?,?,?,?,?,?,?)",
        "network_edge": "INSERT INTO network_edge VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "risk_indicator": "INSERT INTO risk_indicator VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        "analysis_result": "INSERT INTO analysis_result VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    }
    for table, table_rows in rows.items():
        conn.executemany(insert_sql[table], table_rows)


def print_summary(conn: duckdb.DuckDBPyConnection) -> None:
    print(f"DuckDB: {DB_PATH}")
    print(f"seed_batch_id: {SEED_BATCH_ID}")
    for table in [
        "risk_person_profile",
        "risk_org_profile",
        "smuggling_case",
        "person_case_link",
        "network_edge",
        "risk_indicator",
        "evidence_source",
        "analysis_result",
    ]:
        count = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE seed_batch_id = ?",
            [SEED_BATCH_ID],
        ).fetchone()[0]
        print(f"{table}: {count:,}")
    sample_rows = conn.execute(
        """
        SELECT person_id, name, profile_type, risk_level, risk_score, risk_tags
        FROM risk_person_profile
        WHERE seed_batch_id = ?
        ORDER BY person_id
        LIMIT 5
        """,
        [SEED_BATCH_ID],
    ).fetchall()
    print("sample risk persons:")
    for row in sample_rows:
        print(f"  {row}")


def main() -> None:
    parser = argparse.ArgumentParser(description="우범자 프로파일 DuckDB 테이블 생성 및 샘플 적재")
    parser.add_argument("--db", type=Path, default=DB_PATH, help="DuckDB 파일 경로")
    parser.add_argument("--no-clear", action="store_true", help="기존 동일 seed_batch_id 데이터를 삭제하지 않음")
    parser.add_argument("--summary-only", action="store_true", help="DB 수정 없이 생성된 샘플 건수만 조회")
    args = parser.parse_args()

    with duckdb.connect(str(args.db)) as conn:
        create_schema(conn)
        if not args.summary_only:
            if not args.no_clear:
                clear_seed(conn)
            rows = build_seed_rows()
            insert_rows(conn, rows)
        print_summary(conn)


if __name__ == "__main__":
    main()
