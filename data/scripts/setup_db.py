"""DuckDB 초기화 및 복구 스크립트.

사용법
------
python data/scripts/setup_db.py           # 테이블 없을 때만 생성 (멱등)
python data/scripts/setup_db.py --reset   # 전체 DROP → 재생성 (완전 복구)
python data/scripts/setup_db.py --ml-only # ML 샘플 데이터만 보강 (스키마 유지)

실행 후 동작
-----------
1. 스키마 생성 (company_profiles, import_declarations, import_risk_scores)
2. 8개 기본 기업 + 40건 신고 + 위험점수 시드 데이터 삽입
3. ML 통계 분석용 샘플 데이터 자동 보강
   - 동종 업종 기업이 3개 미만이면 가상 기업 추가
   - HS코드별 신고가 5건 미만이면 비교 신고 추가
"""
import argparse
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

import duckdb

try:
    from refresh_realistic_sample_data import (
        COMPANY_META as PDF_SAMPLE_COMPANY_META,
        EXTRACT_PATH as PDF_SAMPLE_EXTRACT_PATH,
        SYNTHETIC_NAMES,
        _clean_hs,
        _origin,
        _tax_no,
    )
except ImportError:
    from data.scripts.refresh_realistic_sample_data import (
        COMPANY_META as PDF_SAMPLE_COMPANY_META,
        EXTRACT_PATH as PDF_SAMPLE_EXTRACT_PATH,
        SYNTHETIC_NAMES,
        _clean_hs,
        _origin,
        _tax_no,
    )

DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"

# ML 샘플 생성 기준 (agent_ml.py와 동일)
MIN_PEER_COMPANIES = 3
MIN_DECL_PER_HS    = 5


# ── 스키마 ─────────────────────────────────────────────────────────────────────

DDL_COMPANY_PROFILES = """
CREATE TABLE IF NOT EXISTS company_profiles (
    company_id               VARCHAR PRIMARY KEY,
    company_name             VARCHAR,
    business_registration_no VARCHAR,
    industry_code            VARCHAR,
    founded_year             INTEGER,
    risk_level               VARCHAR,
    risk_score               DOUBLE,
    last_audit_date          DATE,
    address_postal_code      VARCHAR,
    address                  VARCHAR,
    address_detail           VARCHAR,
    employee_count           INTEGER,
    major_export_countries   VARCHAR,
    customs_broker_firm      VARCHAR,
    related_companies        VARCHAR,
    annual_revenue           DOUBLE,
    annual_import_amount     DOUBLE,
    declared_duty_amount     DOUBLE,
    recent_customs_refund    DOUBLE,
    fta_reduction_rate       DOUBLE
)
"""

DDL_IMPORT_DECLARATIONS = """
CREATE TABLE IF NOT EXISTS import_declarations (
    id              INTEGER,
    company_id      VARCHAR,
    declaration_no  VARCHAR,
    hs_code         VARCHAR,
    item_name       VARCHAR,
    declared_value  DOUBLE,
    origin_country  VARCHAR,
    import_date     DATE,
    status          VARCHAR
)
"""

DDL_IMPORT_RISK_SCORES = """
CREATE TABLE IF NOT EXISTS import_risk_scores (
    id                                    INTEGER,
    company_id                            VARCHAR,
    risk_level                            VARCHAR,
    risk_score                            DOUBLE,
    undervaluation_suspicion_rate         DOUBLE,
    related_party_anomaly_rate            DOUBLE,
    fta_origin_misuse_suspicion_rate      DOUBLE,
    customs_refund_anomaly_rate           DOUBLE,
    hs_classification_error_rate          DOUBLE,
    offshore_fund_concealment_suspicion_rate DOUBLE,
    generated_at                          TIMESTAMP
)
"""

# ── 시드 데이터 ────────────────────────────────────────────────────────────────

SEED_COMPANIES = [
    ("C-1001", "한국소재무역",   "123-81-45890", "C20", 1998, "MEDIUM", 58.4, "2024-03-14",
     "06164", "서울특별시 강남구 테헤란로 521",      "17층",      128, "중국, 베트남, 인도네시아",
     "한빛관세법인",  "Korea Chemical Logistics Pte. Ltd.",
     12_500_000_000, 4_860_000_000, 312_000_000,  42_000_000, 18.5),
    ("C-1002", "서울인터내셔널", "214-86-90812", "G46", 2011, "HIGH",   82.7, "2023-11-20",
     "04522", "서울특별시 중구 세종대로 110",         "803호",      46, "사우디아라비아, 중국, 말레이시아",
     "세종합동관세사법인", "Seoul Intl Trading HK Ltd.",
     8_200_000_000,  6_420_000_000, 515_000_000, 138_000_000,  7.2),
    ("C-1003", "부산섬유산업",   "605-87-13245", "C13", 2005, "MEDIUM", 63.1, "2024-01-10",
     "48938", "부산광역시 중구 중앙대로 26",          "무역센터 402호", 72, "방글라데시, 베트남, 캄보디아",
     "부산정우관세법인", "Busan Apparel Sourcing Co.",
     5_600_000_000,  2_940_000_000, 186_000_000,  76_000_000, 31.4),
    ("C-1004", "대한전자부품",   "120-88-77421", "C26", 2016, "LOW",    37.8, "2024-05-08",
     "16648", "경기도 수원시 영통구 광교중앙로 154",  "B동 1201호", 214, "대만, 일본, 미국",
     "동서관세법인",  "DaeHan Components Taiwan",
     23_600_000_000, 7_180_000_000, 498_000_000,  18_000_000, 22.8),
    ("C-1005", "인천푸드소싱",   "131-82-55670", "G46", 2019, "HIGH",   76.5, "2022-09-30",
     "22382", "인천광역시 중구 공항동로 296",         "물류동 2층",  39, "태국, 칠레, 호주",
     "공항관세법인",  "Incheon Food Sourcing Thailand",
     4_100_000_000,  3_620_000_000, 279_000_000, 112_000_000, 42.7),
    ("C-1006", "광주모빌리티",   "410-87-33152", "C30", 2009, "MEDIUM", 67.9, "2024-02-21",
     "61947", "광주광역시 서구 상무중앙로 90",        "모빌리티타워 11층", 186, "멕시코, 독일, 중국",
     "남도관세법인",  "Gwangju Mobility Mexico S.A.",
     18_900_000_000, 5_980_000_000, 421_000_000,  64_000_000, 16.9),
    ("C-1007", "대전바이오랩",   "305-88-90433", "C21", 2014, "LOW",    41.2, "2024-04-18",
     "34141", "대전광역시 유성구 대학로 291",         "연구동 504호", 94, "스위스, 미국, 싱가포르",
     "충청관세법인",  "Daejeon BioLab Singapore",
     9_700_000_000,  2_680_000_000, 146_000_000,  21_000_000, 28.6),
    ("C-1008", "제주리테일커머스", "616-86-11824", "G47", 2020, "HIGH",  79.3, "2023-08-11",
     "63122", "제주특별자치도 제주시 연삼로 473",     "3층",        58, "중국, 일본, 홍콩",
     "탐라관세사무소", "Jeju Retail Commerce HK",
     6_300_000_000,  4_220_000_000, 362_000_000, 124_000_000, 11.5),
]

SEED_DECLARATIONS = [
    (1,  "C-1001", "D-2025-001", "8542.31", "반도체 집적회로",       820_000_000, "TWN", "2025-01-17", "NORMAL"),
    (2,  "C-1001", "D-2025-014", "3907.61", "PET 수지",              260_000_000, "CHN", "2025-03-04", "REVIEW"),
    (3,  "C-1001", "D-2025-028", "2917.36", "테레프탈산",            185_000_000, "IDN", "2025-04-11", "NORMAL"),
    (4,  "C-1001", "D-2025-041", "3206.11", "이산화티타늄 안료",      96_000_000, "VNM", "2025-05-02", "REVIEW"),
    (5,  "C-1001", "D-2025-052", "3901.20", "폴리에틸렌 원료",       310_000_000, "SGP", "2025-05-28", "NORMAL"),
    (6,  "C-1002", "D-2025-006", "2709.00", "원유",                1_440_000_000, "SAU", "2025-02-02", "INSPECT"),
    (7,  "C-1002", "D-2025-021", "6109.10", "면 티셔츠",             42_000_000, "CHN", "2025-03-26", "REVIEW"),
    (8,  "C-1002", "D-2025-032", "8504.40", "전원공급장치",          118_000_000, "MYS", "2025-04-18", "NORMAL"),
    (9,  "C-1002", "D-2025-044", "2710.19", "윤활유",               390_000_000, "ARE", "2025-05-09", "INSPECT"),
    (10, "C-1002", "D-2025-059", "3926.90", "플라스틱 부품",         74_000_000, "CHN", "2025-06-03", "REVIEW"),
    (11, "C-1003", "D-2025-009", "6204.62", "여성용 면바지",         56_000_000, "BGD", "2025-02-14", "NORMAL"),
    (12, "C-1003", "D-2025-027", "6109.10", "면 티셔츠",             32_000_000, "VNM", "2025-04-07", "INSPECT"),
    (13, "C-1003", "D-2025-039", "5407.52", "합성섬유 직물",         88_000_000, "KHM", "2025-04-29", "REVIEW"),
    (14, "C-1003", "D-2025-047", "6211.43", "스포츠 의류",           64_000_000, "VNM", "2025-05-14", "NORMAL"),
    (15, "C-1003", "D-2025-061", "5208.52", "면직물",               51_000_000, "BGD", "2025-06-08", "REVIEW"),
    (16, "C-1004", "D-2025-012", "8536.50", "전자 스위치",          275_000_000, "JPN", "2025-02-25", "NORMAL"),
    (17, "C-1004", "D-2025-033", "8542.39", "전자제어 칩셋",        620_000_000, "TWN", "2025-04-23", "NORMAL"),
    (18, "C-1004", "D-2025-045", "8504.40", "전원 모듈",            212_000_000, "USA", "2025-05-11", "NORMAL"),
    (19, "C-1004", "D-2025-056", "8534.00", "인쇄회로기판",         184_000_000, "CHN", "2025-05-31", "REVIEW"),
    (20, "C-1004", "D-2025-066", "8541.29", "트랜지스터",           156_000_000, "JPN", "2025-06-17", "NORMAL"),
    (21, "C-1005", "D-2025-016", "2008.99", "가공 열대과일",         84_000_000, "THA", "2025-03-10", "REVIEW"),
    (22, "C-1005", "D-2025-030", "0306.17", "냉동 새우",            156_000_000, "CHL", "2025-04-16", "INSPECT"),
    (23, "C-1005", "D-2025-048", "0202.30", "냉동 쇠고기",          245_000_000, "AUS", "2025-05-16", "REVIEW"),
    (24, "C-1005", "D-2025-060", "2106.90", "소스 베이스",           69_000_000, "THA", "2025-06-06", "NORMAL"),
    (25, "C-1005", "D-2025-069", "0811.90", "냉동 망고",             58_000_000, "PER", "2025-06-21", "HOLD"),
    (26, "C-1006", "D-2025-018", "8708.99", "자동차 차체부품",      344_000_000, "MEX", "2025-03-15", "NORMAL"),
    (27, "C-1006", "D-2025-035", "8507.60", "리튬이온 배터리팩",    510_000_000, "CHN", "2025-04-25", "REVIEW"),
    (28, "C-1006", "D-2025-049", "9032.89", "차량용 제어센서",      132_000_000, "DEU", "2025-05-18", "NORMAL"),
    (29, "C-1006", "D-2025-062", "8708.40", "변속기 부품",          270_000_000, "MEX", "2025-06-10", "INSPECT"),
    (30, "C-1006", "D-2025-071", "4011.10", "승용차 타이어",        118_000_000, "THA", "2025-06-24", "REVIEW"),
    (31, "C-1007", "D-2025-020", "3002.15", "진단용 항체 시약",     188_000_000, "CHE", "2025-03-19", "NORMAL"),
    (32, "C-1007", "D-2025-036", "3822.19", "실험실 분석시약",       92_000_000, "USA", "2025-04-26", "NORMAL"),
    (33, "C-1007", "D-2025-050", "9018.90", "의료용 소모품",         74_000_000, "SGP", "2025-05-20", "REVIEW"),
    (34, "C-1007", "D-2025-063", "8419.89", "배양 장비 부품",       146_000_000, "DEU", "2025-06-12", "NORMAL"),
    (35, "C-1007", "D-2025-073", "3926.90", "멸균 플라스틱 용기",    41_000_000, "SGP", "2025-06-27", "NORMAL"),
    (36, "C-1008", "D-2025-024", "3304.99", "기초 화장품",          164_000_000, "CHN", "2025-03-31", "REVIEW"),
    (37, "C-1008", "D-2025-037", "4202.92", "합성섬유 가방",        118_000_000, "HKG", "2025-04-27", "INSPECT"),
    (38, "C-1008", "D-2025-053", "8517.62", "무선통신기기",         232_000_000, "CHN", "2025-05-29", "REVIEW"),
    (39, "C-1008", "D-2025-064", "9503.00", "완구류",               52_000_000, "JPN", "2025-06-14", "NORMAL"),
    (40, "C-1008", "D-2025-075", "6404.11", "운동화",              103_000_000, "VNM", "2025-06-30", "HOLD"),
]

SEED_RISK_SCORES = [
    (1, "C-1001", "MEDIUM", 58.4, 34.0, 22.0, 18.0, 11.0, 27.0, 24.0, "2025-06-30 09:00:00"),
    (2, "C-1002", "HIGH",   82.7, 76.0, 69.0, 31.0, 48.0, 42.0, 73.0, "2025-06-30 09:05:00"),
    (3, "C-1003", "MEDIUM", 63.1, 51.0, 28.0, 57.0, 38.0, 46.0, 36.0, "2025-06-30 09:10:00"),
    (4, "C-1004", "LOW",    37.8, 19.0, 15.0, 12.0,  8.0, 21.0, 14.0, "2025-06-30 09:15:00"),
    (5, "C-1005", "HIGH",   76.5, 47.0, 58.0, 66.0, 72.0, 35.0, 61.0, "2025-06-30 09:20:00"),
    (6, "C-1006", "MEDIUM", 67.9, 49.0, 45.0, 22.0, 31.0, 52.0, 40.0, "2025-06-30 09:25:00"),
    (7, "C-1007", "LOW",    41.2, 18.0, 16.0, 24.0,  9.0, 29.0, 17.0, "2025-06-30 09:30:00"),
    (8, "C-1008", "HIGH",   79.3, 61.0, 64.0, 38.0, 68.0, 55.0, 57.0, "2025-06-30 09:35:00"),
]


# ── ML 샘플 생성 (agent_ml.py 와 동일한 로직 — 독립 실행을 위해 인라인) ─────────

def build_pdf_sample_seed_rows() -> tuple[list[tuple], list[tuple], list[tuple]]:
    """13개 수입신고서 PDF 추출 캐시를 초기 DB 시드 행으로 변환한다."""
    if not PDF_SAMPLE_EXTRACT_PATH.exists():
        raise FileNotFoundError(
            f"PDF 샘플 추출 캐시가 없습니다: {PDF_SAMPLE_EXTRACT_PATH}. "
            "먼저 python data/scripts/extract_import_pdf_samples.py 를 실행하세요."
        )

    extracts = json.loads(PDF_SAMPLE_EXTRACT_PATH.read_text(encoding="utf-8"))
    if len(extracts) != len(PDF_SAMPLE_COMPANY_META):
        raise RuntimeError(
            f"PDF 샘플 회사 메타 {len(PDF_SAMPLE_COMPANY_META)}건과 추출 결과 {len(extracts)}건이 일치하지 않습니다."
        )

    companies: list[tuple] = []
    declarations: list[tuple] = []
    risks: list[tuple] = []

    for idx, (meta, ext) in enumerate(zip(PDF_SAMPLE_COMPANY_META, extracts), 1):
        declared_value = int(ext.get("declared_value_krw") or 0)
        annual_import = round(declared_value * meta["annual_multiplier"])
        annual_revenue = round(annual_import * 1.65)
        duty = round(annual_import * meta["duty_rate"])
        refund = round(annual_import * meta["refund_rate"])

        companies.append((
            meta["company_id"],
            meta["company_name"],
            _tax_no(idx),
            meta["industry_code"],
            meta["founded_year"],
            meta["risk_level"],
            meta["risk_score"],
            "2026-04-15",
            meta["address_postal_code"],
            meta["address"],
            meta["address_detail"],
            meta["employee_count"],
            meta["major_export_countries"],
            meta["customs_broker_firm"],
            meta["related_companies"],
            annual_revenue,
            annual_import,
            duty,
            refund,
            meta["fta_reduction_rate"],
        ))

        declarations.append((
            2000 + idx,
            meta["company_id"],
            ext.get("declaration_no"),
            _clean_hs(ext.get("hs_code")),
            ext.get("item_name"),
            declared_value,
            _origin(ext.get("origin_country")),
            ext.get("import_date"),
            meta["status"],
        ))

        risks.append((
            2000 + idx,
            meta["company_id"],
            meta["risk_level"],
            meta["risk_score"],
            *meta["risk"],
            "2026-08-05 09:00:00",
        ))

    return companies, declarations, risks


def _company_seed(company_id: str) -> int:
    return sum(ord(c) * (i + 1) for i, c in enumerate(company_id))


def _generate_peer_companies(company_info: dict, n_virtual: int, rng: random.Random) -> tuple[list[dict], list[str]]:
    industry    = company_info["industry_code"]
    base_risk   = float(company_info.get("risk_score") or 50.0)
    base_import = float(company_info.get("annual_import_amount") or 2_000_000_000)
    base_rev    = float(company_info.get("annual_revenue") or 5_000_000_000)
    cid         = company_info["company_id"]

    rows, ids = [], []
    name_pool = SYNTHETIC_NAMES.get(industry, ["에스앤티무역", "케이글로벌", "해온상사", "다온트레이드"])
    for i in range(n_virtual):
        vid        = f"SYN-{cid}-P{i+1:02d}"
        base_name  = name_pool[i % len(name_pool)]
        suffix     = (i // len(name_pool)) + 1
        company_name = base_name if suffix == 1 else f"{base_name}{suffix}"
        risk_score = round(max(10.0, min(95.0, rng.gauss(base_risk, 18.0))), 1)
        risk_level = "HIGH" if risk_score >= 70 else "MEDIUM" if risk_score >= 45 else "LOW"
        rev_f      = max(0.25, min(3.0, rng.gauss(1.0, 0.4)))
        imp_f      = max(0.25, min(3.0, rng.gauss(1.0, 0.35)))
        ids.append(vid)
        rows.append({
            "company_id":               vid,
            "company_name":             company_name,
            "business_registration_no": f"000-00-{90000+i:05d}",
            "industry_code":            industry,
            "founded_year":             rng.randint(1995, 2022),
            "risk_level":               risk_level,
            "risk_score":               risk_score,
            "last_audit_date":          None,
            "address_postal_code":      "00000",
            "address":                  f"{industry} 비교군 샘플 주소",
            "address_detail":           "비교군 데이터",
            "employee_count":           rng.randint(15, 400),
            "major_export_countries":   "중국, 베트남, 일본",
            "customs_broker_firm":      f"{company_name} 관세대행",
            "related_companies":        None,
            "annual_revenue":           round(base_rev * rev_f),
            "annual_import_amount":     round(base_import * imp_f),
            "declared_duty_amount":     round(base_import * imp_f * rng.uniform(0.03, 0.12)),
            "recent_customs_refund":    round(base_import * imp_f * rng.uniform(0.005, 0.05)),
            "fta_reduction_rate":       round(rng.uniform(5.0, 55.0), 1),
        })
    return rows, ids


def _generate_peer_declarations(
    company_decls: list[dict],
    all_decls:     list[dict],
    peer_ids:      list[str],
    rng:           random.Random,
) -> list[dict]:
    status_pool = ["NORMAL"] * 7 + ["REVIEW"] * 2 + ["INSPECT"] * 1
    existing_ids = {r["id"] for r in all_decls}
    next_id = max(existing_ids) + 1 if existing_ids else 1001
    rows = []

    hs_codes = list({r["hs_code"] for r in company_decls})
    for hs_code in hs_codes:
        existing_count = sum(1 for r in all_decls if r["hs_code"] == hs_code)
        needed = max(0, MIN_DECL_PER_HS - existing_count)
        if needed == 0:
            continue

        ref_rows = [r for r in company_decls if r["hs_code"] == hs_code]
        ref_val    = sum(r["declared_value"] for r in ref_rows) / len(ref_rows)
        ref_item   = ref_rows[0]["item_name"]
        ref_origin = ref_rows[0]["origin_country"]

        for _ in range(needed):
            factor = rng.gauss(0.55, 0.08) if rng.random() < 0.05 else rng.gauss(1.0, 0.18)
            factor = max(0.35, min(1.6, factor))
            days_ago = rng.randint(1, 548)
            rows.append({
                "id":             next_id,
                "company_id":     rng.choice(peer_ids),
                "declaration_no": f"SYN-{next_id:07d}",
                "hs_code":        hs_code,
                "item_name":      ref_item,
                "declared_value": round(ref_val * factor),
                "origin_country": ref_origin,
                "import_date":    (date.today() - timedelta(days=days_ago)).isoformat(),
                "status":         rng.choice(status_pool),
            })
            next_id += 1
    return rows


def _risk_level_from_score(score: float) -> str:
    if score >= 70:
        return "HIGH"
    if score >= 45:
        return "MEDIUM"
    return "LOW"


def _clamp_rate(value: float) -> float:
    return round(max(3.0, min(96.0, value)), 1)


def _generate_risk_detail_rates(company: dict) -> tuple[float, float, float, float, float, float]:
    """Generate deterministic AI risk indicator values for a company profile."""
    company_id = str(company["company_id"])
    rng = random.Random(_company_seed(company_id) + 77_031)
    score = float(company.get("risk_score") or 50.0)
    import_amount = float(company.get("annual_import_amount") or 0.0)
    refund = float(company.get("recent_customs_refund") or 0.0)
    fta_rate = float(company.get("fta_reduction_rate") or 0.0)
    related = str(company.get("related_companies") or "")
    industry = str(company.get("industry_code") or "")

    refund_ratio = (refund / import_amount * 100.0) if import_amount else 0.0
    related_boost = 12.0 if related and related.strip().lower() not in {"none", "nan"} else 0.0
    trade_boost = 8.0 if industry.startswith("G") else 0.0
    manufacturing_boost = 5.0 if industry.startswith("C") else 0.0

    undervaluation = _clamp_rate(score * 0.72 + trade_boost + rng.uniform(-12, 12))
    related_party = _clamp_rate(score * 0.58 + related_boost + rng.uniform(-10, 14))
    fta_misuse = _clamp_rate(score * 0.35 + fta_rate * 0.65 + rng.uniform(-9, 13))
    refund_anomaly = _clamp_rate(score * 0.42 + refund_ratio * 3.2 + rng.uniform(-8, 15))
    hs_error = _clamp_rate(score * 0.45 + manufacturing_boost + rng.uniform(-10, 12))
    offshore = _clamp_rate(score * 0.55 + related_boost * 0.9 + rng.uniform(-12, 16))
    return undervaluation, related_party, fta_misuse, refund_anomaly, hs_error, offshore


def seed_missing_synthetic_risk_scores(conn: duckdb.DuckDBPyConnection) -> int:
    """Create AI risk indicator rows for SYN-* companies missing import_risk_scores."""
    rows = conn.execute(
        """
        SELECT c.*
        FROM company_profiles c
        LEFT JOIN import_risk_scores r ON c.company_id = r.company_id
        WHERE c.company_id LIKE 'SYN-%'
          AND r.company_id IS NULL
        ORDER BY c.company_id
        """
    ).df().to_dict("records")
    if not rows:
        return 0

    max_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM import_risk_scores").fetchone()[0]
    risk_rows = []
    for offset, company in enumerate(rows, 1):
        risk_score = round(float(company.get("risk_score") or 50.0), 1)
        risk_rows.append((
            max_id + offset,
            company["company_id"],
            company.get("risk_level") or _risk_level_from_score(risk_score),
            risk_score,
            *_generate_risk_detail_rates(company),
            "2026-08-05 10:30:00",
        ))

    conn.executemany(
        """
        INSERT INTO import_risk_scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        risk_rows,
    )
    return len(risk_rows)


def seed_ml_samples(conn: duckdb.DuckDBPyConnection) -> None:
    """모든 기본 기업에 대해 ML 통계 분석용 샘플 데이터를 삽입한다."""
    import pandas as pd

    pdf_companies, _, _ = build_pdf_sample_seed_rows()
    base_company_ids = [c[0] for c in SEED_COMPANIES] + [c[0] for c in pdf_companies]
    total_new_companies = 0
    total_new_decls     = 0

    for company_id in base_company_ids:
        # 이미 이 기업용 SYN 데이터가 있으면 건너뜀
        syn_prefix = f"SYN-{company_id}-"
        already = conn.execute(
            "SELECT COUNT(*) FROM company_profiles WHERE company_id LIKE ?",
            [syn_prefix + "%"],
        ).fetchone()[0]
        if already > 0:
            continue

        companies_df = conn.execute("SELECT * FROM company_profiles").df()
        decls_df     = conn.execute("SELECT * FROM import_declarations").df()

        company_row  = companies_df[companies_df["company_id"] == company_id]
        if company_row.empty:
            continue

        company_info  = company_row.iloc[0].to_dict()
        industry      = company_info["industry_code"]
        company_decls = decls_df[decls_df["company_id"] == company_id].to_dict("records")
        all_decls     = decls_df.to_dict("records")

        peer_companies = companies_df[companies_df["industry_code"] == industry]
        hs_decl_counts = {
            hs: int((decls_df["hs_code"] == hs).sum())
            for hs in {r["hs_code"] for r in company_decls}
        }

        needs_more_companies = len(peer_companies) < MIN_PEER_COMPANIES
        needs_more_hs_data   = any(cnt < MIN_DECL_PER_HS for cnt in hs_decl_counts.values())

        if not needs_more_companies and not needs_more_hs_data:
            continue

        rng = random.Random(_company_seed(company_id))
        peer_ids = [p for p in list(peer_companies["company_id"]) if p != company_id]

        # 가상 기업 삽입
        if needs_more_companies:
            n_needed = max(0, MIN_PEER_COMPANIES - len(peer_companies)) + 2
            new_companies, new_ids = _generate_peer_companies(company_info, n_needed, rng)
            peer_ids += new_ids
            new_comp_df = pd.DataFrame(new_companies)
            conn.register("_nc", new_comp_df)
            conn.execute("INSERT INTO company_profiles SELECT * FROM _nc")
            total_new_companies += len(new_companies)

        # HS 신고 보강 삽입
        if needs_more_hs_data and peer_ids:
            current_decls = conn.execute("SELECT * FROM import_declarations").df().to_dict("records")
            new_decls = _generate_peer_declarations(company_decls, current_decls, peer_ids, rng)
            if new_decls:
                new_decl_df = pd.DataFrame(new_decls)
                conn.register("_nd", new_decl_df)
                conn.execute("INSERT INTO import_declarations SELECT * FROM _nd")
                total_new_decls += len(new_decls)

        print(f"  [{company_id}] ML 샘플 생성 완료")

    print(f"  ML 샘플 총계: 기업 +{total_new_companies}개, 신고 +{total_new_decls}건")


# ── 메인 실행 ──────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="customs.duckdb 초기화 / 복구")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--reset",   action="store_true", help="전체 DROP 후 재생성 (완전 복구)")
    group.add_argument("--ml-only", action="store_true", help="ML 샘플 데이터만 보강")
    args = parser.parse_args()

    print(f"DuckDB {duckdb.__version__}  |  DB: {DB_PATH}")

    with duckdb.connect(str(DB_PATH)) as conn:

        if args.reset:
            print("\n[1/4] 기존 테이블 삭제 (--reset)")
            conn.execute("DROP TABLE IF EXISTS import_risk_scores")
            conn.execute("DROP TABLE IF EXISTS import_declarations")
            conn.execute("DROP TABLE IF EXISTS company_profiles")

        if not args.ml_only:
            print("\n[2/4] 스키마 생성")
            conn.execute(DDL_COMPANY_PROFILES)
            conn.execute(DDL_IMPORT_DECLARATIONS)
            conn.execute(DDL_IMPORT_RISK_SCORES)

            existing = conn.execute("SELECT COUNT(*) FROM company_profiles").fetchone()[0]
            if existing > 0 and not args.reset:
                print(f"  기본 데이터 이미 존재 ({existing}개 기업) — 건너뜀")
            else:
                print("\n[3/4] 기본 시드 데이터 삽입")
                pdf_companies, pdf_declarations, pdf_risk_scores = build_pdf_sample_seed_rows()
                seed_companies = SEED_COMPANIES + pdf_companies
                seed_declarations = SEED_DECLARATIONS + pdf_declarations
                seed_risk_scores = SEED_RISK_SCORES + pdf_risk_scores
                conn.executemany(
                    "INSERT INTO company_profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    seed_companies,
                )
                conn.executemany(
                    "INSERT INTO import_declarations VALUES (?,?,?,?,?,?,?,?,?)",
                    seed_declarations,
                )
                conn.executemany(
                    "INSERT INTO import_risk_scores VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    seed_risk_scores,
                )
                c_cnt = conn.execute("SELECT COUNT(*) FROM company_profiles").fetchone()[0]
                d_cnt = conn.execute("SELECT COUNT(*) FROM import_declarations").fetchone()[0]
                print(f"  기업 {c_cnt}개 / 신고 {d_cnt}건 / 위험점수 {len(seed_risk_scores)}건 삽입")

        print("\n[4/4] ML 통계 샘플 데이터 보강")
        seed_ml_samples(conn)
        added_syn_risks = seed_missing_synthetic_risk_scores(conn)
        if added_syn_risks:
            print(f"  SYN AI risk indicators: +{added_syn_risks} rows")

        # 최종 현황
        c_total = conn.execute("SELECT COUNT(*) FROM company_profiles").fetchone()[0]
        d_total = conn.execute("SELECT COUNT(*) FROM import_declarations").fetchone()[0]
        r_total = conn.execute("SELECT COUNT(*) FROM import_risk_scores").fetchone()[0]
        c_syn   = conn.execute("SELECT COUNT(*) FROM company_profiles WHERE company_id LIKE 'SYN-%'").fetchone()[0]
        d_syn   = conn.execute("SELECT COUNT(*) FROM import_declarations WHERE company_id LIKE 'SYN-%'").fetchone()[0]

    print(f"""
완료
  기업:  전체 {c_total}개 (기본 {c_total - c_syn}개 + 샘플 {c_syn}개)
  신고:  전체 {d_total}건 (기본 {d_total - d_syn}건 + 샘플 {d_syn}건)
  위험점수: {r_total}건
""")


if __name__ == "__main__":
    main()
