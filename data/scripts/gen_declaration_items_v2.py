"""[Phase 2a 보강] 수입신고 4테이블 상세(품목/규격/세목) 생성.

Phase 2a(gen_declarations_v2)는 신고서 헤더만 만들었다. 상세 신고서 5영역 뷰
(헤더+품목+규격+세목)와 NL-to-SQL 조회를 위해 본 스크립트가 각 신고서에 대해
import_declaration_items / _item_specs / _item_taxes 를 생성한다(헤더 1건=품목 1란 기준).

죄종 신호 반영: fta_misuse→협정세율(관세0)·C/O, strategic→수출입요건, ip_hs→상표/인증.
사용법: python data/scripts/gen_declaration_items_v2.py
"""
from __future__ import annotations

import random
import sys
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"

ITEM_COLS = ["item_id", "declaration_id", "line_no", "tariff_item_name_en", "trade_item_name_en",
             "hsk_code", "simple_tariff_code", "brand_code", "brand_name", "net_weight",
             "net_weight_unit", "tariff_quantity", "tariff_quantity_unit", "refund_quantity",
             "refund_quantity_unit", "origin_country", "origin_criteria", "origin_marking",
             "import_requirement_type", "import_requirement_approval_no", "import_requirement_doc",
             "import_requirement_issue_date", "import_requirement_law_code", "post_verification_agency",
             "item_customs_value_usd", "item_customs_value_krw", "special_tax_basis"]
SPEC_COLS = ["spec_id", "item_id", "seq", "model_spec", "ingredient", "spec_quantity",
             "spec_quantity_unit", "spec_unit_price", "spec_amount", "currency"]
TAX_COLS = ["tax_id", "item_id", "seq", "tax_type", "rate_type", "tax_rate", "reduction_rate",
            "tax_amount", "reduction_installment_code", "reduction_amount", "internal_tax_code"]

EN_NAME = {
    "메모리 집적회로": "Memory IC", "무선 통신기기": "Wireless comm device",
    "휴대용 컴퓨터": "Portable computer", "전기 커넥터": "Electric connector",
    "PET 수지": "PET resin", "자동차 부품": "Auto parts", "면 혼방 의류": "Cotton blend apparel",
    "기능성 화장품": "Functional cosmetics", "완구": "Toy", "신발": "Footwear",
    "위스키": "Whisky", "플라스틱 제품": "Plastic article",
}
# 개별소비세 대상 품명
EXCISE_ITEMS = {"위스키", "기능성 화장품"}


def hsk10(hs: str) -> str:
    digits = "".join(ch for ch in str(hs) if ch.isdigit())
    return (digits + "0000")[:10]


def _insert(con, table, cols, rows):
    if not rows:
        return
    ph = ",".join("?" * len(cols))
    con.executemany(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({ph})",
                    [[r.get(c) for c in cols] for r in rows])


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        decls = con.execute(
            "SELECT id, hs_code, item_name, declared_value, origin_country, total_customs_value_krw, "
            "payment_amount, exchange_rate, crime_signal, origin_cert_flag "
            "FROM import_declarations WHERE declaration_no LIKE 'DV2-%' ORDER BY id"
        ).df().to_dict("records")

        # 4테이블 전면 재생성
        con.execute("DELETE FROM import_declaration_item_taxes")
        con.execute("DELETE FROM import_declaration_item_specs")
        con.execute("DELETE FROM import_declaration_items")

        items, specs, taxes = [], [], []
        iid = sid = tid = 0
        for d in decls:
            rng = random.Random((int(d["id"]) * 2654435761) & 0xFFFFFFFF)
            sig = d.get("crime_signal")
            krw = float(d["total_customs_value_krw"] or d["declared_value"] or 0)
            usd = round(krw / float(d["exchange_rate"] or 1300), 2)
            name = d["item_name"]
            iid += 1
            item_id = iid
            is_fta = sig == "fta_misuse" or d.get("origin_cert_flag") == "Y"
            req_type = req_law = req_no = None
            if sig == "strategic":
                req_type, req_law, req_no = "수출입요건", "대외무역법", f"SA-{item_id:06d}"
            elif sig == "ip_hs":
                req_type, req_law, req_no = "지식재산권 확인", "상표법", f"IP-{item_id:06d}"
            items.append({
                "item_id": item_id, "declaration_id": d["id"], "line_no": 1,
                "tariff_item_name_en": EN_NAME.get(name, name), "trade_item_name_en": name,
                "hsk_code": hsk10(d["hs_code"]), "simple_tariff_code": None,
                "brand_code": None, "brand_name": (f"Brand-{rng.randint(1,99)}" if sig == "ip_hs" else None),
                "net_weight": round(rng.uniform(50, 5000), 1), "net_weight_unit": "KG",
                "tariff_quantity": rng.randint(1, 2000), "tariff_quantity_unit": "EA",
                "refund_quantity": 0, "refund_quantity_unit": "EA",
                "origin_country": d["origin_country"],
                "origin_criteria": ("WO" if is_fta else "PSR") if is_fta else None,
                "origin_marking": rng.choice(["표시", "미표시"]),
                "import_requirement_type": req_type, "import_requirement_approval_no": req_no,
                "import_requirement_doc": ("요건확인서" if req_type else None),
                "import_requirement_issue_date": None, "import_requirement_law_code": req_law,
                "post_verification_agency": ("원산지검증과" if is_fta else None),
                "item_customs_value_usd": usd, "item_customs_value_krw": round(krw),
                "special_tax_basis": round(krw),
            })
            # 규격(1~2)
            for s in range(rng.randint(1, 2)):
                sid += 1
                q = rng.randint(1, 1000)
                up = round(usd / max(1, q), 2)
                specs.append({
                    "spec_id": sid, "item_id": item_id, "seq": s + 1,
                    "model_spec": f"{EN_NAME.get(name,'MODEL')[:6].upper()}-{rng.randint(100,999)}",
                    "ingredient": ("폴리에스터/면" if "의류" in name else "혼합물" if "화장품" in name else None),
                    "spec_quantity": q, "spec_quantity_unit": "EA",
                    "spec_unit_price": up, "spec_amount": round(up * q, 2), "currency": "USD",
                })
            # 세목: 관세 + 부가세 (+ 개별소비세)
            duty_rate = 0.0 if is_fta else 8.0
            duty_amt = round(krw * duty_rate / 100)
            tid += 1
            taxes.append({"tax_id": tid, "item_id": item_id, "seq": 1, "tax_type": "관세",
                          "rate_type": "협정세율" if is_fta else "기본세율", "tax_rate": duty_rate,
                          "reduction_rate": 100.0 if is_fta else 0.0, "tax_amount": duty_amt,
                          "reduction_installment_code": None,
                          "reduction_amount": round(krw * 8 / 100) if is_fta else 0,
                          "internal_tax_code": None})
            excise = 0
            if name in EXCISE_ITEMS:
                excise = round(krw * 0.2)
                tid += 1
                taxes.append({"tax_id": tid, "item_id": item_id, "seq": 2, "tax_type": "개별소비세",
                              "rate_type": "기본세율", "tax_rate": 20.0, "reduction_rate": 0.0,
                              "tax_amount": excise, "reduction_installment_code": None,
                              "reduction_amount": 0, "internal_tax_code": "IC"})
            vat_base = krw + duty_amt + excise
            tid += 1
            taxes.append({"tax_id": tid, "item_id": item_id, "seq": 3, "tax_type": "부가가치세",
                          "rate_type": "기본세율", "tax_rate": 10.0, "reduction_rate": 0.0,
                          "tax_amount": round(vat_base * 0.1), "reduction_installment_code": None,
                          "reduction_amount": 0, "internal_tax_code": "VAT"})

        _insert(con, "import_declaration_items", ITEM_COLS, items)
        _insert(con, "import_declaration_item_specs", SPEC_COLS, specs)
        _insert(con, "import_declaration_item_taxes", TAX_COLS, taxes)

        # 검증
        cov = con.execute(
            "SELECT count(*) FROM import_declarations d WHERE declaration_no LIKE 'DV2-%' "
            "AND EXISTS (SELECT 1 FROM import_declaration_items i WHERE i.declaration_id=d.id)"
        ).fetchone()[0]
        tot = con.execute("SELECT count(*) FROM import_declarations WHERE declaration_no LIKE 'DV2-%'").fetchone()[0]
        sample = con.execute(
            "SELECT i.item_id, i.trade_item_name_en, i.hsk_code, "
            "(SELECT count(*) FROM import_declaration_item_specs s WHERE s.item_id=i.item_id) specs, "
            "(SELECT count(*) FROM import_declaration_item_taxes t WHERE t.item_id=i.item_id) taxes "
            "FROM import_declaration_items i LIMIT 3"
        ).fetchall()
    print("[신고서 4테이블] 생성 완료")
    print(f"  items: {len(items)}  specs: {len(specs)}  taxes: {len(taxes)}")
    print(f"  신고서 커버리지: {cov}/{tot}")
    print(f"  표본(item,품명,HSK,규격수,세목수): {sample}")


if __name__ == "__main__":
    main()
