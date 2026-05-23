"""
추가 샘플 기업 10개 (C-1009 ~ C-1018) 및 관련 수입신고·위험스코어 데이터 삽입.
실행: python scripts/seed_companies.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import duckdb
from datetime import date, datetime
from src.paths import DB_PATH

# ──────────────────────────────────────────────
# 1. 기업 프로파일
# ──────────────────────────────────────────────
COMPANIES = [
    {
        "company_id": "C-1009",
        "company_name": "동방에너지화학",
        "business_registration_no": "117-81-23045",
        "industry_code": "C19",
        "founded_year": 2001,
        "risk_level": "HIGH",
        "risk_score": 84.2,
        "last_audit_date": date(2023, 7, 15),
        "address_postal_code": "44954",
        "address": "울산광역시 남구 산업로 128",
        "address_detail": "에너지플랜트 3동",
        "employee_count": 312,
        "major_export_countries": "사우디아라비아, UAE, 쿠웨이트",
        "customs_broker_firm": "동방관세법인",
        "related_companies": "Dongbang Energy FZE (UAE), DongBang Chem Singapore",
        "annual_revenue": 38_500_000_000.0,
        "annual_import_amount": 21_800_000_000.0,
        "declared_duty_amount": 1_460_000_000.0,
        "recent_customs_refund": 234_000_000.0,
        "fta_reduction_rate": 9.4,
    },
    {
        "company_id": "C-1010",
        "company_name": "강남패션그룹",
        "business_registration_no": "220-87-56123",
        "industry_code": "C14",
        "founded_year": 2008,
        "risk_level": "MEDIUM",
        "risk_score": 61.7,
        "last_audit_date": date(2024, 2, 5),
        "address_postal_code": "06036",
        "address": "서울특별시 강남구 테헤란로 512",
        "address_detail": "패션타워 8층",
        "employee_count": 94,
        "major_export_countries": "베트남, 캄보디아, 방글라데시",
        "customs_broker_firm": "한국관세사무소",
        "related_companies": "Gangnam Fashion Vietnam Co., Ltd.",
        "annual_revenue": 7_200_000_000.0,
        "annual_import_amount": 3_840_000_000.0,
        "declared_duty_amount": 298_000_000.0,
        "recent_customs_refund": 56_000_000.0,
        "fta_reduction_rate": 33.6,
    },
    {
        "company_id": "C-1011",
        "company_name": "태평양반도체",
        "business_registration_no": "134-86-78901",
        "industry_code": "C26",
        "founded_year": 1996,
        "risk_level": "HIGH",
        "risk_score": 78.9,
        "last_audit_date": date(2023, 10, 22),
        "address_postal_code": "13556",
        "address": "경기도 성남시 분당구 판교로 256",
        "address_detail": "반도체연구동 201호",
        "employee_count": 487,
        "major_export_countries": "대만, 일본, 미국",
        "customs_broker_firm": "태평양관세법인",
        "related_companies": "Taepyeong Semiconductor Taiwan Ltd., TPsemi Japan K.K.",
        "annual_revenue": 52_000_000_000.0,
        "annual_import_amount": 18_600_000_000.0,
        "declared_duty_amount": 892_000_000.0,
        "recent_customs_refund": 187_000_000.0,
        "fta_reduction_rate": 14.2,
    },
    {
        "company_id": "C-1012",
        "company_name": "한라냉동식품",
        "business_registration_no": "612-81-34782",
        "industry_code": "C10",
        "founded_year": 2003,
        "risk_level": "LOW",
        "risk_score": 29.5,
        "last_audit_date": date(2024, 6, 10),
        "address_postal_code": "63563",
        "address": "제주특별자치도 제주시 한림읍 금능농공길 82",
        "address_detail": "냉동창고 본동",
        "employee_count": 143,
        "major_export_countries": "호주, 뉴질랜드, 미국",
        "customs_broker_firm": "제주관세사무소",
        "related_companies": "Halla Frozen Foods Australia Pty",
        "annual_revenue": 6_100_000_000.0,
        "annual_import_amount": 2_150_000_000.0,
        "declared_duty_amount": 324_000_000.0,
        "recent_customs_refund": 18_000_000.0,
        "fta_reduction_rate": 41.8,
    },
    {
        "company_id": "C-1013",
        "company_name": "세종의료기기",
        "business_registration_no": "305-87-11234",
        "industry_code": "C32",
        "founded_year": 2012,
        "risk_level": "MEDIUM",
        "risk_score": 55.3,
        "last_audit_date": date(2024, 3, 28),
        "address_postal_code": "30151",
        "address": "세종특별자치시 한누리대로 2178",
        "address_detail": "의료기기클러스터 B동 402호",
        "employee_count": 218,
        "major_export_countries": "독일, 미국, 이스라엘",
        "customs_broker_firm": "세종관세법인",
        "related_companies": "Sejong Medical GmbH, Sejong Medical Inc. (USA)",
        "annual_revenue": 12_300_000_000.0,
        "annual_import_amount": 4_920_000_000.0,
        "declared_duty_amount": 276_000_000.0,
        "recent_customs_refund": 43_000_000.0,
        "fta_reduction_rate": 19.7,
    },
    {
        "company_id": "C-1014",
        "company_name": "대신물산",
        "business_registration_no": "108-86-44512",
        "industry_code": "G46",
        "founded_year": 2014,
        "risk_level": "HIGH",
        "risk_score": 81.4,
        "last_audit_date": date(2023, 5, 17),
        "address_postal_code": "04521",
        "address": "서울특별시 중구 을지로 100",
        "address_detail": "무역센터빌딩 22층",
        "employee_count": 67,
        "major_export_countries": "중국, 홍콩, 말레이시아",
        "customs_broker_firm": "국제관세법인",
        "related_companies": "Daesin Trading HK Ltd., Daesin Resources Malaysia",
        "annual_revenue": 9_800_000_000.0,
        "annual_import_amount": 7_630_000_000.0,
        "declared_duty_amount": 621_000_000.0,
        "recent_customs_refund": 196_000_000.0,
        "fta_reduction_rate": 6.8,
    },
    {
        "company_id": "C-1015",
        "company_name": "울산석유화학",
        "business_registration_no": "412-81-90127",
        "industry_code": "C20",
        "founded_year": 1989,
        "risk_level": "MEDIUM",
        "risk_score": 66.8,
        "last_audit_date": date(2024, 1, 9),
        "address_postal_code": "44259",
        "address": "울산광역시 북구 산업단지1길 48",
        "address_detail": "화학플랜트 제2공장",
        "employee_count": 524,
        "major_export_countries": "중국, 일본, 인도",
        "customs_broker_firm": "울산관세법인",
        "related_companies": "Ulsan Petrochemical India Pvt. Ltd.",
        "annual_revenue": 47_000_000_000.0,
        "annual_import_amount": 15_200_000_000.0,
        "declared_duty_amount": 1_140_000_000.0,
        "recent_customs_refund": 98_000_000.0,
        "fta_reduction_rate": 11.3,
    },
    {
        "company_id": "C-1016",
        "company_name": "경기농산물유통",
        "business_registration_no": "124-87-30918",
        "industry_code": "G46",
        "founded_year": 2007,
        "risk_level": "LOW",
        "risk_score": 33.1,
        "last_audit_date": date(2024, 4, 22),
        "address_postal_code": "16480",
        "address": "경기도 수원시 팔달구 농수산물시장로 45",
        "address_detail": "농산물유통센터 A동",
        "employee_count": 76,
        "major_export_countries": "중국, 태국, 필리핀",
        "customs_broker_firm": "수원관세사무소",
        "related_companies": "GG Agri Thailand Co., Ltd.",
        "annual_revenue": 3_800_000_000.0,
        "annual_import_amount": 1_620_000_000.0,
        "declared_duty_amount": 248_000_000.0,
        "recent_customs_refund": 9_000_000.0,
        "fta_reduction_rate": 38.4,
    },
    {
        "company_id": "C-1017",
        "company_name": "신한바이오텍",
        "business_registration_no": "314-87-56789",
        "industry_code": "C21",
        "founded_year": 2016,
        "risk_level": "MEDIUM",
        "risk_score": 59.6,
        "last_audit_date": date(2024, 2, 14),
        "address_postal_code": "34141",
        "address": "대전광역시 유성구 테크노2로 108",
        "address_detail": "바이오벤처센터 C동 305호",
        "employee_count": 132,
        "major_export_countries": "미국, 독일, 싱가포르",
        "customs_broker_firm": "대전관세법인",
        "related_companies": "Shinhan Biotech Singapore Pte., Shinhan Bio GmbH",
        "annual_revenue": 11_500_000_000.0,
        "annual_import_amount": 5_360_000_000.0,
        "declared_duty_amount": 198_000_000.0,
        "recent_customs_refund": 37_000_000.0,
        "fta_reduction_rate": 24.1,
    },
    {
        "company_id": "C-1018",
        "company_name": "인천항만물류",
        "business_registration_no": "503-86-21345",
        "industry_code": "H52",
        "founded_year": 2010,
        "risk_level": "HIGH",
        "risk_score": 73.8,
        "last_audit_date": date(2023, 12, 3),
        "address_postal_code": "22386",
        "address": "인천광역시 중구 항동7가 193",
        "address_detail": "항만물류센터 2층",
        "employee_count": 201,
        "major_export_countries": "중국, 일본, 홍콩",
        "customs_broker_firm": "인천항관세법인",
        "related_companies": "Incheon Port Logistics HK, ICN Logistics Shanghai",
        "annual_revenue": 14_700_000_000.0,
        "annual_import_amount": 9_870_000_000.0,
        "declared_duty_amount": 748_000_000.0,
        "recent_customs_refund": 219_000_000.0,
        "fta_reduction_rate": 8.1,
    },
]

# ──────────────────────────────────────────────
# 2. 위험 스코어 (risk_level은 risk_score 기준 자동 결정)
# ──────────────────────────────────────────────
RISK_SCORES = [
    # (company_id, risk_level, risk_score, underval, related, fta_misuse, refund_anom, hs_err, offshore, generated_at)
    ("C-1009", "HIGH",   84.2, 78.0, 72.0, 28.0, 35.0, 40.0, 81.0, datetime(2025, 6, 30, 9, 40)),
    ("C-1010", "MEDIUM", 61.7, 54.0, 32.0, 48.0, 29.0, 41.0, 33.0, datetime(2025, 6, 30, 9, 45)),
    ("C-1011", "HIGH",   78.9, 68.0, 74.0, 25.0, 42.0, 38.0, 71.0, datetime(2025, 6, 30, 9, 50)),
    ("C-1012", "LOW",    29.5, 12.0,  9.0, 15.0,  7.0, 18.0, 11.0, datetime(2025, 6, 30, 9, 55)),
    ("C-1013", "MEDIUM", 55.3, 44.0, 36.0, 19.0, 31.0, 48.0, 29.0, datetime(2025, 6, 30, 10,  0)),
    ("C-1014", "HIGH",   81.4, 71.0, 65.0, 74.0, 59.0, 36.0, 67.0, datetime(2025, 6, 30, 10,  5)),
    ("C-1015", "MEDIUM", 66.8, 52.0, 41.0, 27.0, 38.0, 53.0, 44.0, datetime(2025, 6, 30, 10, 10)),
    ("C-1016", "LOW",    33.1, 16.0, 11.0, 22.0,  9.0, 24.0, 13.0, datetime(2025, 6, 30, 10, 15)),
    ("C-1017", "MEDIUM", 59.6, 48.0, 39.0, 21.0, 27.0, 44.0, 31.0, datetime(2025, 6, 30, 10, 20)),
    ("C-1018", "HIGH",   73.8, 57.0, 61.0, 33.0, 76.0, 44.0, 58.0, datetime(2025, 6, 30, 10, 25)),
]

# ──────────────────────────────────────────────
# 3. 수입신고 내역 (각 기업 5~6건)
# ──────────────────────────────────────────────
# status: NORMAL / REVIEW / INSPECT
DECLARATIONS = [
    # C-1009 동방에너지화학 (원유·석유화학)
    ("C-1009","D-2025-061","2709.00","원유",          3_820_000_000.0,"SAU",date(2025,1,8),  "INSPECT"),
    ("C-1009","D-2025-062","2710.19","경질유",         1_240_000_000.0,"ARE",date(2025,2,14),"INSPECT"),
    ("C-1009","D-2025-063","2902.20","벤젠",            380_000_000.0,"KWT",date(2025,3,21),"REVIEW"),
    ("C-1009","D-2025-064","2901.10","에탄·프로판가스",  520_000_000.0,"QAT",date(2025,4,17),"NORMAL"),
    ("C-1009","D-2025-065","2917.36","테레프탈산",       160_000_000.0,"CHN",date(2025,5,30),"REVIEW"),

    # C-1010 강남패션그룹 (의류)
    ("C-1010","D-2025-066","6109.10","면 티셔츠",        94_000_000.0,"VNM",date(2025,1,15),"NORMAL"),
    ("C-1010","D-2025-067","6203.42","남성 면 청바지",    68_000_000.0,"BGD",date(2025,2,20),"REVIEW"),
    ("C-1010","D-2025-068","6204.62","여성 청바지",       77_000_000.0,"KHM",date(2025,3,12),"NORMAL"),
    ("C-1010","D-2025-069","6403.99","가죽 운동화",      112_000_000.0,"CHN",date(2025,4,25),"REVIEW"),
    ("C-1010","D-2025-070","6206.40","여성 블라우스",     51_000_000.0,"MMR",date(2025,5,19),"NORMAL"),

    # C-1011 태평양반도체 (반도체·전자부품)
    ("C-1011","D-2025-071","8542.31","DRAM 반도체",    1_680_000_000.0,"TWN",date(2025,1,11),"INSPECT"),
    ("C-1011","D-2025-072","8541.10","다이오드",         230_000_000.0,"JPN",date(2025,2,7), "REVIEW"),
    ("C-1011","D-2025-073","8504.90","변압기 부품",       97_000_000.0,"CHN",date(2025,3,18),"NORMAL"),
    ("C-1011","D-2025-074","8471.30","노트북",           440_000_000.0,"CHN",date(2025,4,3), "REVIEW"),
    ("C-1011","D-2025-075","8517.12","스마트폰",         890_000_000.0,"CHN",date(2025,5,22),"INSPECT"),
    ("C-1011","D-2025-076","8543.70","전자집적회로 모듈", 310_000_000.0,"SGP",date(2025,6,10),"REVIEW"),

    # C-1012 한라냉동식품 (냉동식품)
    ("C-1012","D-2025-077","0201.30","냉동 쇠고기",      348_000_000.0,"AUS",date(2025,1,20),"NORMAL"),
    ("C-1012","D-2025-078","0203.29","냉동 돼지고기",     212_000_000.0,"NZL",date(2025,2,28),"NORMAL"),
    ("C-1012","D-2025-079","0303.89","냉동 명태",         89_000_000.0,"RUS",date(2025,4,5), "NORMAL"),
    ("C-1012","D-2025-080","0714.10","냉동 카사바",        42_000_000.0,"THA",date(2025,5,14),"REVIEW"),
    ("C-1012","D-2025-081","1601.00","소시지",             57_000_000.0,"DNK",date(2025,6,8), "NORMAL"),

    # C-1013 세종의료기기 (의료기기)
    ("C-1013","D-2025-082","9018.90","내시경 장비",       267_000_000.0,"DEU",date(2025,1,24),"NORMAL"),
    ("C-1013","D-2025-083","9402.90","수술대",            184_000_000.0,"USA",date(2025,2,11),"REVIEW"),
    ("C-1013","D-2025-084","9027.80","혈당측정기",         93_000_000.0,"ISR",date(2025,3,30),"NORMAL"),
    ("C-1013","D-2025-085","3304.99","의료용 겔",          48_000_000.0,"CHE",date(2025,5,7), "REVIEW"),
    ("C-1013","D-2025-086","9021.10","정형외과 임플란트", 156_000_000.0,"DEU",date(2025,6,18),"NORMAL"),

    # C-1014 대신물산 (무역)
    ("C-1014","D-2025-087","7208.36","열연강판",          512_000_000.0,"CHN",date(2025,1,6), "INSPECT"),
    ("C-1014","D-2025-088","7304.31","강관",               278_000_000.0,"CHN",date(2025,2,17),"INSPECT"),
    ("C-1014","D-2025-089","3902.10","폴리프로필렌 수지",  198_000_000.0,"MYS",date(2025,3,24),"REVIEW"),
    ("C-1014","D-2025-090","8708.99","자동차 부품",        341_000_000.0,"HKG",date(2025,4,30),"INSPECT"),
    ("C-1014","D-2025-091","6305.33","PP 마대",             64_000_000.0,"CHN",date(2025,5,26),"REVIEW"),
    ("C-1014","D-2025-092","3926.90","기타 플라스틱 제품",  87_000_000.0,"VNM",date(2025,6,14),"NORMAL"),

    # C-1015 울산석유화학 (석유화학)
    ("C-1015","D-2025-093","2709.00","원유",            4_100_000_000.0,"SAU",date(2025,1,3), "INSPECT"),
    ("C-1015","D-2025-094","2901.10","LPG",              860_000_000.0,"QAT",date(2025,2,19),"REVIEW"),
    ("C-1015","D-2025-095","3901.20","폴리에틸렌",        290_000_000.0,"SGP",date(2025,3,15),"NORMAL"),
    ("C-1015","D-2025-096","2902.50","스티렌",             174_000_000.0,"JPN",date(2025,4,22),"NORMAL"),
    ("C-1015","D-2025-097","2915.21","아세트산",           128_000_000.0,"IND",date(2025,6,2), "REVIEW"),

    # C-1016 경기농산물유통 (농산물)
    ("C-1016","D-2025-098","0901.11","커피 원두",          96_000_000.0,"COL",date(2025,1,28),"NORMAL"),
    ("C-1016","D-2025-099","1507.10","대두유",              74_000_000.0,"BRA",date(2025,3,6), "NORMAL"),
    ("C-1016","D-2025-100","0603.11","장미(신선)",           38_000_000.0,"KEN",date(2025,4,14),"NORMAL"),
    ("C-1016","D-2025-101","0803.90","바나나",               52_000_000.0,"PHL",date(2025,5,31),"REVIEW"),
    ("C-1016","D-2025-102","2008.99","망고 통조림",           29_000_000.0,"THA",date(2025,6,20),"NORMAL"),

    # C-1017 신한바이오텍 (바이오·의약품)
    ("C-1017","D-2025-103","3004.90","항체 치료제",         382_000_000.0,"USA",date(2025,1,17),"NORMAL"),
    ("C-1017","D-2025-104","3002.12","모노클로널 항체",      218_000_000.0,"DEU",date(2025,2,26),"REVIEW"),
    ("C-1017","D-2025-105","2941.10","아목시실린 원료",      147_000_000.0,"CHN",date(2025,3,31),"REVIEW"),
    ("C-1017","D-2025-106","3822.90","진단시약",              89_000_000.0,"SGP",date(2025,5,8), "NORMAL"),
    ("C-1017","D-2025-107","3824.99","배양액·완충용액",       61_000_000.0,"USA",date(2025,6,25),"NORMAL"),

    # C-1018 인천항만물류 (물류)
    ("C-1018","D-2025-108","8426.91","항만 크레인 부품",    673_000_000.0,"CHN",date(2025,1,9), "INSPECT"),
    ("C-1018","D-2025-109","8709.19","항만 지게차",         441_000_000.0,"JPN",date(2025,2,23),"REVIEW"),
    ("C-1018","D-2025-110","9406.90","조립식 창고 구조물",  328_000_000.0,"CHN",date(2025,3,28),"INSPECT"),
    ("C-1018","D-2025-111","8431.49","컨베이어 부품",        186_000_000.0,"HKG",date(2025,5,3), "REVIEW"),
    ("C-1018","D-2025-112","3923.30","물류 컨테이너 박스",    94_000_000.0,"CHN",date(2025,6,16),"NORMAL"),
]


def main():
    print(f"DB 경로: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as conn:
        # ── 기존 ID 확인 ──
        existing_ids = {r[0] for r in conn.execute("SELECT company_id FROM company_profiles").fetchall()}
        new_companies = [c for c in COMPANIES if c["company_id"] not in existing_ids]
        if not new_companies:
            print("모든 기업이 이미 존재합니다. 스킵합니다.")
            return

        print(f"신규 기업 {len(new_companies)}개 삽입 시작...")

        # ── company_profiles ──
        conn.executemany(
            """
            INSERT INTO company_profiles VALUES (
                ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
            )
            """,
            [
                (
                    c["company_id"], c["company_name"], c["business_registration_no"],
                    c["industry_code"], c["founded_year"], c["risk_level"], c["risk_score"],
                    c["last_audit_date"], c["address_postal_code"], c["address"],
                    c["address_detail"], c["employee_count"], c["major_export_countries"],
                    c["customs_broker_firm"], c["related_companies"],
                    c["annual_revenue"], c["annual_import_amount"],
                    c["declared_duty_amount"], c["recent_customs_refund"],
                    c["fta_reduction_rate"],
                )
                for c in new_companies
            ],
        )
        print(f"  company_profiles: {len(new_companies)}행 삽입")

        # ── import_risk_scores ──
        max_id = conn.execute("SELECT COALESCE(MAX(id),0) FROM import_risk_scores").fetchone()[0]
        new_ids = {c["company_id"] for c in new_companies}
        new_risks = [r for r in RISK_SCORES if r[0] in new_ids]
        conn.executemany(
            """
            INSERT INTO import_risk_scores
            (id,company_id,risk_level,risk_score,
             undervaluation_suspicion_rate,related_party_anomaly_rate,
             fta_origin_misuse_suspicion_rate,customs_refund_anomaly_rate,
             hs_classification_error_rate,offshore_fund_concealment_suspicion_rate,
             generated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            [
                (max_id + i + 1, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9])
                for i, r in enumerate(new_risks)
            ],
        )
        print(f"  import_risk_scores: {len(new_risks)}행 삽입")

        # ── import_declarations ──
        max_decl_id = conn.execute("SELECT COALESCE(MAX(id),0) FROM import_declarations").fetchone()[0]
        new_decls = [d for d in DECLARATIONS if d[0] in new_ids]
        conn.executemany(
            """
            INSERT INTO import_declarations
            (id,company_id,declaration_no,hs_code,item_name,
             declared_value,origin_country,import_date,status)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            [
                (max_decl_id + i + 1, d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7])
                for i, d in enumerate(new_decls)
            ],
        )
        print(f"  import_declarations: {len(new_decls)}행 삽입")

        # ── 결과 확인 ──
        total = conn.execute("SELECT COUNT(*) FROM company_profiles").fetchone()[0]
        print(f"\n완료! 전체 기업 수: {total}개")
        print("\n[삽입된 기업 목록]")
        rows = conn.execute(
            "SELECT company_id, company_name, risk_level, risk_score FROM company_profiles ORDER BY company_id"
        ).fetchall()
        for r in rows:
            marker = " ◀ 신규" if r[0] in new_ids else ""
            print(f"  {r[0]}  {r[1]:<16}  {r[2]:<6}  {r[3]:>5.1f}{marker}")


if __name__ == "__main__":
    main()
