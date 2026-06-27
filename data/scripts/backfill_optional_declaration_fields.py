"""[선택항목 보강] 수입신고서 조건부(C) 항목 backfill — 운임·보험료·해외공급자 등 (멱등).

필수항목·세목 보강 후 남은 신고서 공통부 선택항목(운임/보험료/가산·공제·과세가격(미화)·
해외공급자·운송주선인·선(기)명·국내도착항·B/L번호·통관고유부호·통관계획 등)을
연계데이터(원산지·결제금액·환율·운송수단)와 정합되게 채운다.

핵심 정합
  - 과세가격: total_customs_value_krw(=declared_value, CIF원화) 기준
    · total_customs_value_usd = CIF원화 / 환율
    · 운임 = CIF×2~6%, 보험료 = CIF×0.1~0.4% (CIF 구성요소 표현)
  - 운송수단(해상/항공/특송)별 선(기)명·운수기관·B/L 체계 분기
  - 해외공급자 = 적출국 기반 상호/부호

멱등: id 시드 결정적, 매 실행 재계산. 재실행 안전.
실행: python data/scripts/backfill_optional_declaration_fields.py [--db PATH]
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import duckdb

DB_PATH = Path(__file__).resolve().parents[1] / "customs.duckdb"

FORWARDERS = [("범한판토스", "PANT"), ("현대글로비스", "GLOV"), ("CJ대한통운", "CJLX"),
              ("롯데글로벌로지스", "LOGL"), ("한진", "HJIN"), ("DHL코리아", "DHLK")]
PORTS = ["KRPUS", "KRINC", "KRICN", "KRPTK", "KRKPO", "KRKAN"]   # 부산·인천항·인천공항·평택·포항·광양(도착항=국내)
# 적출국별 대표 출발항(UN/LOCODE) — 해외 departure_port
DEP_PORTS = {
    "중국": ["CNSHA", "CNNGB", "CNSZX"], "일본": ["JPTYO", "JPYOK", "JPUKB"],
    "미국": ["USLAX", "USNYC", "USOAK"], "독일": ["DEHAM", "DEBRV"],
    "베트남": ["VNSGN", "VNHPH"], "태국": ["THBKK", "THLCH"], "대만": ["TWKHH", "TWTPE"],
    "말레이시아": ["MYPKG", "MYPEN"], "인도네시아": ["IDJKT", "IDSUB"], "이탈리아": ["ITGOA", "ITSPE"],
    "싱가포르": ["SGSIN"], "홍콩": ["HKHKG"], "파나마": ["PAONX"], "BVI": ["VGRAD"],
}
SEA_LINES = [("HMM", "HMM ROTTERDAM"), ("KMTC", "KMTC SHANGHAI"), ("SITC", "SITC HUNHE"),
             ("ONEY", "ONE COLUMBA"), ("HJSC", "HANJIN GDANSK")]
AIR_LINES = [("KE", "KE", "대한항공"), ("OZ", "OZ", "아시아나"), ("KZ", "KZ", "니혼카고")]
EXPRESS = [("DHL", "DHL EXPRESS"), ("FDX", "FEDEX"), ("UPS", "UPS"), ("TNT", "TNT")]
INCOTERMS = ["CIF", "CIF", "CFR", "FOB", "EXW"]
CLEARANCE = ["A", "B", "C"]     # 통관계획: 즉시반출·보세운송·기타
SUPPLIER_KINDS = ["TRADING", "INDUSTRIAL", "GLOBAL", "INTL", "IMPEX"]


def backfill(conn: duckdb.DuckDBPyConnection) -> None:
    rows = conn.execute(
        "SELECT id, origin_country_name, departure_country, transport_type, "
        "exchange_rate, declared_value, taxpayer_name, taxpayer_business_no, import_date "
        "FROM import_declarations"
    ).fetchall()

    n = 0
    for (did, origin, dep, transport, fx, cif_krw, tname, biz, idate) in rows:
        rng = random.Random(f"opt-{did}")
        fx = float(fx or 1300.0)
        cif_krw = float(cif_krw or 0)
        origin = origin or dep or "미상"
        yy = str(idate.year)[2:] if idate else "25"

        # CIF 구성요소
        freight = round(cif_krw * rng.uniform(0.02, 0.06))
        insurance = round(cif_krw * rng.uniform(0.001, 0.004))
        cif_usd = round(cif_krw / fx, 2) if fx else 0.0

        # 운송수단별 선(기)명·운수기관·B/L
        if transport == "해상":
            carrier, vessel = rng.choice(SEA_LINES)
            bl = f"{carrier}{yy}{rng.randint(1000000,9999999)}"
            master_bl = f"{carrier}M{rng.randint(1000000,9999999)}"
            vnat = rng.choice(["PA", "LR", "MH", "KR"])
        elif transport == "항공":
            code, carrier, vessel = rng.choice(AIR_LINES)
            bl = f"{rng.randint(100,999)}-{rng.randint(10000000,99999999)}"
            master_bl = f"{code}{rng.randint(10000000,99999999)}"
            vnat = "KR"
        else:  # 특송
            carrier, vessel = rng.choice(EXPRESS)
            bl = f"{carrier}{rng.randint(100000000,999999999)}"
            master_bl = ""
            vnat = "KR"

        fwd_name, fwd_code = rng.choice(FORWARDERS)
        dep_port = rng.choice(DEP_PORTS.get(origin, [f"{(origin[:2] if origin else 'XX')}PRT"]))
        supplier = f"{origin} {rng.choice(SUPPLIER_KINDS)} CO.,LTD"
        supplier_code = f"{(origin[:2] if origin else 'XX')}{rng.randint(100000000,999999999)}"
        customs_code = f"{(biz or '0000000000').replace('-','')[:10]}{rng.randint(10000,99999)}"[:15]

        conn.execute(
            """
            UPDATE import_declarations SET
              bl_awb_no = ?, master_bl_awb_no = ?,
              vessel_name = ?, vessel_nationality = ?, carrier_code = ?,
              departure_port = ?, arrival_port = ?, forwarder_name = ?, forwarder_code = ?,
              overseas_supplier_name = ?, overseas_supplier_country = ?, overseas_supplier_code = ?,
              importer_name = COALESCE(NULLIF(importer_name,''), ?),
              importer_customs_code = ?, taxpayer_customs_code = ?,
              taxpayer_email = ?, clearance_plan = ?, price_declaration_flag = ?,
              total_packages = ?, payment_incoterms = ?,
              freight_krw = ?, insurance_krw = ?, addition_krw = 0, deduction_krw = 0,
              total_customs_value_usd = ?, total_vat_exempt_base = 0,
              electronic_invoice_no = ?
            WHERE id = ?
            """,
            [
                bl, master_bl,
                vessel, vnat, carrier,
                dep_port, rng.choice(PORTS), fwd_name, fwd_code,
                supplier, origin, supplier_code,
                tname,
                customs_code, customs_code,
                f"trade{did % 600:03d}@{(origin[:3] if origin else 'sup')}.com".lower(),
                rng.choice(CLEARANCE), rng.choice(["Y", "N"]),
                rng.randint(1, 5000), rng.choice(INCOTERMS),
                freight, insurance,
                cif_usd,
                f"EINV{yy}{did:08d}",
                did,
            ],
        )
        n += 1

    print(f"  신고서 {n}건 선택항목 보강 완료")


def main() -> None:
    ap = argparse.ArgumentParser(description="수입신고서 선택(C) 항목 보강")
    ap.add_argument("--db", type=Path, default=DB_PATH)
    args = ap.parse_args()
    print(f"DB: {args.db}")
    with duckdb.connect(str(args.db)) as conn:
        backfill(conn)
    print("[완료] 선택항목 보강")


if __name__ == "__main__":
    main()
