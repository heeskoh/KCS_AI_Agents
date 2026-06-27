"""[수입신고서 필수항목 재구성] 공식 항목정의서(GOVCBR929) 필수항목(M) 전체 충족 (멱등).

배경
----
v2 생성기(gen_declarations_v2 / gen_declaration_items_v2)는 신고서의 일부 필드만 채워,
관세청 전자문서항목정의서(수입신고서 929)의 필수항목 46종 중 상당수가 공백/미저장이었다.
본 스크립트는 누락 컬럼을 추가하고, 연계데이터(company_profiles 납세의무자, item_taxes 관세액)
와 spec 형식(TYPE/SIZE/표준코드)에 맞는 대표값으로 필수항목을 backfill 한다.

대상(필수항목)
  신고서 공통부: 문서형태구분·신고세관·신고과·응답형태코드·분할수입신고여부·화물관리번호·
    입항일자·징수형태·신고인(상호/전화/이메일)·납세의무자(식별구분/식별번호/주소/상호/전화/성명)·
    거래구분·수입종류·총중량(+단위)·운송용기·검사장소 보세구역·결제방법·총관세총액
  란(품목)부: 상표코드·상표명·원산지결정기준·관세구분·합의세율신청여부·관세액기준

멱등: 신규 컬럼은 없을 때만 추가, 값은 매 실행 재계산(id 시드 결정적). 재실행 안전.
실행: python data/scripts/reconstruct_import_declaration_mandatory.py [--db PATH]
"""
from __future__ import annotations

import argparse
import random
from datetime import timedelta
from pathlib import Path

import duckdb

DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"

# 표준코드 대표 풀(무역통계부호 등 실제 체계에 부합하는 대표값)
OFFICE_CODES = ["010", "020", "030", "040", "050", "130"]   # 신고세관(301)
DIVISION_CODES = ["11", "22", "31", "41"]                    # 신고과(302)
COLLECTION_TYPES = ["11", "13", "14", "43"]                  # 징수형태(신고수리전/후납부·월별 등)
TRANSACTION_TYPES = ["11", "29", "83"]                       # 거래구분
IMPORT_TYPES = ["11", "21", "29"]                            # 수입종류
PAYMENT_METHODS = ["TT", "LS", "DA", "DP"]                   # 결제방법
PACKAGE_TYPES = ["CT", "BX", "PL", "PK", "DR"]               # 운송용기(포장종류)
CARRIERS = ["KMTC", "HJSC", "SITC", "ONEY", "HDMU"]          # MRN 선사부호
BROKERS = ["유한관세사법인", "한일관세사무소", "대한통관(주)", "세정관세사법인", "동방관세사무소"]
SURNAMES = list("김이박최정강조윤장임")
GIVENS = ["민준", "서연", "도윤", "하은", "지후", "수아", "건우", "예린"]


def _add_col(conn, table: str, col: str, typ: str = "VARCHAR") -> bool:
    cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()]
    if col not in cols:
        conn.execute(f'ALTER TABLE "{table}" ADD COLUMN {col} {typ}')
        return True
    return False


def _person_name(rng: random.Random) -> str:
    return rng.choice(SURNAMES) + rng.choice(GIVENS)


def reconstruct(conn: duckdb.DuckDBPyConnection) -> None:
    # ── 신규 컬럼(미저장 9종) ───────────────────────────────────────────────
    new_decl_cols = {
        "document_type_code": "VARCHAR",   # 문서형태구분
        "customs_division_code": "VARCHAR",  # 신고과
        "response_type_code": "VARCHAR",   # 응답형태코드
        "split_declaration_yn": "VARCHAR",  # 분할수입신고 여부
        "filer_phone": "VARCHAR",          # 신고인 전화번호
        "filer_email": "VARCHAR",          # 신고인 이메일주소
        "taxpayer_id_type": "VARCHAR",     # 납세의무자 식별번호 구분부호
    }
    for col, typ in new_decl_cols.items():
        _add_col(conn, "import_declarations", col, typ)
    _add_col(conn, "import_declaration_items", "agreed_tariff_apply_yn")  # 합의세율신청 여부
    _add_col(conn, "import_declaration_items", "tariff_basis")            # 관세액기준

    # ── 연계: 납세의무자(company) + 총관세총액(item_taxes) ────────────────────
    company = {
        r[0]: r for r in conn.execute(
            "SELECT company_id, company_name, business_registration_no, address, "
            "customs_broker_firm FROM company_profiles"
        ).fetchall()
    }
    duty = {
        r[0]: float(r[1] or 0) for r in conn.execute(
            """
            SELECT it.declaration_id, SUM(t.tax_amount) AS duty
            FROM import_declaration_item_taxes t
            JOIN import_declaration_items it ON it.item_id = t.item_id
            WHERE t.tax_type = '관세'
            GROUP BY it.declaration_id
            """
        ).fetchall()
    }

    decls = conn.execute(
        "SELECT id, company_id, declaration_no, import_date, payment_currency "
        "FROM import_declarations"
    ).fetchall()

    for did, cid, dno, idate, _cur in decls:
        rng = random.Random(f"decl-{did}")
        comp = company.get(cid)
        comp_name = comp[1] if comp else "수입자"
        biz_no = (comp[2] if comp and comp[2] else f"{rng.randint(100,799)}-{rng.randint(10,99)}-{rng.randint(10000,99999)}")
        addr = (comp[3].strip() if comp and comp[3] else "인천") or "인천"
        broker_firm = comp[4] if comp and len(comp) > 4 else None
        rep = _person_name(rng)
        broker = (broker_firm or rng.choice(BROKERS))
        office = rng.choice(OFFICE_CODES)
        # 화물관리번호 19자리: MRN(11)=YY+선사(4)+일련(5) + MSN(4) + HSN(4)
        yy = str(idate.year)[2:] if idate else "25"
        mrn = f"{yy}{rng.choice(CARRIERS)}{rng.randint(10000,99999)}"[:11].ljust(11, "0")
        cargo_no = f"{mrn}{rng.randint(1,9999):04d}{rng.randint(1,9999):04d}"
        arrival = (idate - timedelta(days=rng.randint(1, 7))) if idate else None
        weight = round(rng.uniform(120, 18000), 1)

        conn.execute(
            """
            UPDATE import_declarations SET
              document_type_code = 'GOVCBR929',
              customs_office_code = ?, customs_division_code = ?,
              response_type_code = 'AB', split_declaration_yn = 'N',
              cargo_control_no = ?, arrival_date = ?, warehousing_date = ?,
              collection_type = ?,
              filer_name = ?, filer_representative = ?,
              filer_phone = ?, filer_email = ?,
              taxpayer_id_type = '01', taxpayer_business_no = ?,
              taxpayer_address = ?, taxpayer_name = ?, taxpayer_person_name = ?,
              taxpayer_phone = ?,
              transaction_type = ?, import_type = ?,
              total_weight = ?, total_weight_unit = 'KG',
              package_type = ?, inspection_location = ?,
              payment_method = ?, tax_customs_duty = ?
            WHERE id = ?
            """,
            [
                office, rng.choice(DIVISION_CODES),
                cargo_no, arrival, arrival,
                rng.choice(COLLECTION_TYPES),
                f"{broker} {rep}", rep,
                f"02-{rng.randint(200,999)}-{rng.randint(1000,9999)}",
                f"broker{did % 500:03d}@kcsbroker.kr",
                biz_no, addr, comp_name, _person_name(rng),
                f"0{rng.randint(2,64)}-{rng.randint(200,999)}-{rng.randint(1000,9999)}",
                rng.choice(TRANSACTION_TYPES), rng.choice(IMPORT_TYPES),
                weight,
                rng.choice(PACKAGE_TYPES), f"{office}{rng.randint(10000,99999)}",
                rng.choice(PAYMENT_METHODS), duty.get(did, 0.0),
                did,
            ],
        )

    # ── 란(품목) 필수항목 ────────────────────────────────────────────────────
    items = conn.execute(
        "SELECT item_id, brand_name, origin_criteria, origin_country, simple_tariff_code "
        "FROM import_declaration_items"
    ).fetchall()
    BRANDS = ["SAMSUNG", "LG", "HANON", "MOBIS", "BOSCH", "NIKE", "ZARA", "NONAME"]
    for item_id, brand_name, ocrit, ocountry, stc in items:
        rng = random.Random(f"item-{item_id}")
        # 상표코드 4자리, 상표명(공백시 보강)
        bname = brand_name or rng.choice(BRANDS)
        bcode = ("NONE" if bname == "NONAME" else (bname[:3].upper() + str(rng.randint(0, 9))))
        # 원산지결정기준(공백시): 완전생산(C)/세번변경(D)/부가가치(E)
        crit = ocrit or rng.choice(["C", "D", "E"])
        # 관세구분(공백시): FTA국이면 협정(FKR1/CKR) else 기본(A)/WTO(C)
        if not stc:
            stc = rng.choice(["FTA1", "FTA2"]) if (ocountry and ocountry in ("US", "CN", "EU", "VN")) else rng.choice(["A", "C"])
        conn.execute(
            """
            UPDATE import_declaration_items SET
              brand_code = ?, brand_name = ?, origin_criteria = ?,
              simple_tariff_code = ?, agreed_tariff_apply_yn = 'N', tariff_basis = '1'
            WHERE item_id = ?
            """,
            [bcode, bname, crit, stc, item_id],
        )

    print(f"  신고서 {len(decls)}건 + 품목 {len(items)}란 필수항목 재구성 완료")


def main() -> None:
    ap = argparse.ArgumentParser(description="수입신고서 필수항목(GOVCBR929) 재구성")
    ap.add_argument("--db", type=Path, default=DB_PATH)
    args = ap.parse_args()
    print(f"DB: {args.db}")
    with duckdb.connect(str(args.db)) as conn:
        reconstruct(conn)
    print("[완료] 수입신고서 필수항목 재구성")


if __name__ == "__main__":
    main()
