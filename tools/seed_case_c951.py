# -*- coding: utf-8 -*-
"""관세포탈(저가신고 가격조작) 시연 케이스 시드 — (주)로우텍무역 C-951.

docs/crime-case-sim 의 c1_price 케이스를 실제 포털 데이터로 구축한다:
  1) company_profiles      : C-951 기업 프로파일 (위험 HIGH 87)
  2) import_declarations   : 24개월 수입신고 47건 (분기별 단가 하락 = 저가신고 시계열 근거)
     + import_declaration_items 1란씩
  3) price_benchmark       : HS 8517.62 동종 신고가 벤치마크 (편차 -39% 근거)
  4) valuation_audit       : 과거 가격심사·정정 이력 2건
  5) related_party         : 대표 김포탈·홍콩 HK NOMINEE·가족법인 (관계망 근거)
  6) company_risk_indicator: 지표 6종 (undervaluation 78.7 등, 근거 bullet + related_refs)

멱등: C-951 기존 행 삭제 후 재삽입.
사용법:
  venv/Scripts/python.exe tools/seed_case_c951.py            # DuckDB 시드
  venv/Scripts/python.exe tools/seed_case_c951.py --neo4j    # + Neo4j 그래프 재적재(전체 --clear)
실행 후: 실행 중인 web_server 재시작 권장(신규 기업 반영 확인용 — 데이터 조회는 요청별 연결이라 대부분 즉시 반영).
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "customs.duckdb"

CID = "C-951"
CNAME = "(주)로우텍무역"
HS6 = "8517.62"
HS_CODE = "8517.62.1000"
HSK = "8517621000"
FX = 1350.0            # KRW/USD
BENCH_UNIT_USD = 6.70  # 동종물품 단가 벤치마크
DUTY_RATE = 0.08
VAT_RATE = 0.10

# 주 수입 루트는 홍콩(GX GLOBAL LTD·HKHKG 출발) — 이중 인보이스·홍콩 정산 시나리오와 정합.
# (공급사명, 국가, 국가코드, 출발항, 출발도시)
SUPPLIERS = [
    ("GX GLOBAL LTD", "홍콩", "HK", "HKHKG", "홍콩"),
    ("GX GLOBAL LTD", "홍콩", "HK", "HKHKG", "홍콩"),
    ("SHENZHEN TELE CO", "중국", "CN", "CNSZX", "선전"),
]
FILERS = [
    ("한빛관세사무소 이관세", "한빛관세사무소"),
    ("한빛관세사무소 이관세", "한빛관세사무소"),
    ("세정관세사법인 윤하은", "세정관세사법인"),
]
ARRIVALS = ["KRICN", "KRPUS", "KRICN"]


def build_declarations(start_id: int):
    """24개월(2024-08~2026-07) 47건 — 분기별 단가 하락(4.55→3.80 USD)."""
    headers, items = [], []
    base = datetime(2024, 8, 4)
    n = 47
    for i in range(n):
        # 대략 2건/월 + 약간의 불규칙
        day_offset = int(i * (730 / n)) + (i * 7) % 11
        d = base + timedelta(days=day_offset)
        t = day_offset / 730.0                       # 0..1 진행률
        unit = round(4.55 - 1.55 * t + ((i * 13) % 7 - 3) * 0.02, 2)   # 4.55 → ~3.80 (±0.06)
        qty = 10000 + ((i * 37) % 11) * 1000                            # 10k~20k
        # 3건은 노트북(대조군: 정상가)
        is_pc = i in (11, 27, 41)
        hs_code, global_hs, hsk = (("8471.30.0000", "8471.30", "8471300000") if is_pc
                                   else (HS_CODE, HS6, HSK))
        item_name = "휴대용 컴퓨터" if is_pc else "무선통신 모듈"
        if is_pc:
            unit, qty = 182.0, 2500
        sup, sup_country, sup_cc, dep_port, dep_city = SUPPLIERS[i % 3]
        filer, filer_firm = FILERS[i % 3]
        arrival = ARRIVALS[i % 3]
        value_usd = round(unit * qty, 2)
        value_krw = round(value_usd * FX)
        freight = round(value_krw * 0.021)
        insurance = round(value_krw * 0.0015)
        customs_value_krw = value_krw + freight + insurance
        duty = round(customs_value_krw * DUTY_RATE)
        vat = round((customs_value_krw + duty) * VAT_RATE)
        no = f"DV2-{CID}-{i+1:02d}"
        did = start_id + i
        headers.append({
            "id": did, "company_id": CID, "declaration_no": no,
            "hs_code": hs_code, "global_hs": global_hs, "hsk": hsk,
            "item_name": item_name, "declared_value": float(value_krw),
            "origin_country": "중국", "origin_country_name": "중국", "origin_country_code": "CN",
            "import_date": d, "status": "수리",
            "customs_office_code": "030" if arrival == "KRICN" else "020",
            "declaration_type": "일반P/L신고", "clearance_plan": "출항전신고",
            "filer_name": filer, "filer_representative": filer.split()[-1],
            "importer_name": CNAME, "importer_customs_code": "IMP-C951",
            "importer_is_taxpayer": True,
            "taxpayer_name": CNAME, "taxpayer_business_no": "214-87-95101",
            "taxpayer_address": "서울 금천구 가산디지털1로 951",
            "overseas_supplier_name": sup, "overseas_supplier_country": sup_country,
            "overseas_supplier_country_code": sup_cc, "overseas_supplier_code": "SZTC" if "SHEN" in sup else "GXGL",
            "bl_awb_no": f"BL951-{2024 + (i//24)}-{i+1:03d}", "cargo_control_no": f"KCC951{i+1:05d}",
            "forwarder_name": "퍼시픽로지스", "departure_country": sup_country, "departure_country_code": sup_cc,
            "departure_port": dep_port, "arrival_port": arrival,
            "transport_type": "해상", "vessel_name": "PACIFIC GLORY",
            "arrival_date": d + timedelta(days=3), "warehousing_date": d + timedelta(days=4),
            "total_weight": round(qty * 0.045, 1), "total_weight_unit": "KG",
            "total_packages": max(1, qty // 500), "package_type": "CT",
            "transaction_type": "일반형태거래", "import_type": "일반수입",
            "collection_type": "신고수리후납부", "origin_cert_flag": "Y",
            "price_declaration_flag": "Y", "payment_incoterms": "FOB",
            "payment_currency": "USD", "payment_amount": value_usd, "payment_method": "TT",
            "exchange_rate": FX, "freight_krw": freight, "insurance_krw": insurance,
            "addition_krw": 0.0, "deduction_krw": 0.0,
            "total_customs_value_usd": round(customs_value_krw / FX, 2),
            "total_customs_value_krw": float(customs_value_krw),
            "tax_customs_duty": float(duty), "tax_vat": float(vat),
            "total_tax_amount": float(duty + vat), "total_vat_base": float(customs_value_krw + duty),
            "crime_signal": None if is_pc else "undervaluation",
            "document_type_code": "B", "split_declaration_yn": "N",
        })
        items.append({
            "item_id": did * 10 + 1, "declaration_id": did, "line_no": 1,
            "tariff_item_name_en": "Portable computer" if is_pc else "Wireless communication module",
            "trade_item_name_en": item_name, "hsk_code": hsk,
            "net_weight": round(qty * 0.042, 1), "net_weight_unit": "KG",
            "tariff_quantity": float(qty), "tariff_quantity_unit": "EA",
            "origin_country": "중국", "origin_criteria": "WO", "origin_marking": "표시",
            "item_customs_value_usd": round(customs_value_krw / FX, 2),
            "item_customs_value_krw": float(customs_value_krw),
            "global_hs": global_hs, "hsk": hsk, "origin_country_code": "CN",
        })
    return headers, items


def insert_dicts(con, table, rows):
    if not rows:
        return
    cols = list(rows[0].keys())
    placeholders = ", ".join(["?"] * len(cols))
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})"
    con.executemany(sql, [[r.get(c) for c in cols] for r in rows])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--neo4j", action="store_true", help="시드 후 Neo4j 기업 그래프 재적재(--clear)")
    args = ap.parse_args()

    con = duckdb.connect(str(DB))
    now = datetime.now()

    # ── 멱등 정리 ─────────────────────────────────────────────
    ids = [r[0] for r in con.execute(
        "SELECT id FROM import_declarations WHERE company_id = ?", [CID]).fetchall()]
    if ids:
        con.execute(f"DELETE FROM import_declaration_items WHERE declaration_id IN ({','.join(map(str, ids))})")
        con.execute(f"DELETE FROM import_declaration_item_specs WHERE item_id IN (SELECT item_id FROM import_declaration_items WHERE declaration_id IN ({','.join(map(str, ids))}))")
    # 관세환급 신청 원장 — 다른 시드에 없어 이 스크립트가 생성(멱등)
    con.execute("""
        CREATE TABLE IF NOT EXISTS customs_refund_claim (
            id INTEGER, company_id VARCHAR, claim_date TIMESTAMP, claim_type VARCHAR,
            refund_amount DOUBLE, status VARCHAR, export_ref VARCHAR, note VARCHAR)
    """)
    for t, col in [("import_declarations", "company_id"), ("company_profiles", "company_id"),
                   ("company_risk_indicator", "company_id"), ("valuation_audit", "company_id"),
                   ("related_party", "company_id"), ("import_risk_scores", "company_id"),
                   ("hs_classification_event", "company_id"), ("fta_claim", "company_id"),
                   ("origin_verification", "company_id"), ("customs_refund_claim", "company_id")]:
        con.execute(f"DELETE FROM {t} WHERE {col} = ?", [CID])
    con.execute("DELETE FROM price_benchmark WHERE hs_code = ? AND source = ?", [HS6, "seed_case_c951"])

    # ── 1) 기업 프로파일 ─────────────────────────────────────
    insert_dicts(con, "company_profiles", [{
        "company_id": CID, "company_name": CNAME,
        "business_registration_no": "214-87-95101", "industry_code": "G46",
        "founded_year": 2015, "risk_level": "HIGH", "risk_score": 87.0,
        "last_audit_date": datetime(2024, 11, 20),
        "address": "서울 금천구", "address_detail": "가산디지털1로 951",
        "employee_count": 38, "major_export_countries": "홍콩, 중국",
        "customs_broker_firm": "한빛관세사무소",
        "related_companies": "(주)로우텍세컨드",
        "annual_revenue": 21_400_000_000.0, "annual_import_amount": 18_700_000_000.0,
        "declared_duty_amount": 940_000_000.0, "recent_customs_refund": 60_000_000.0,
        "fta_reduction_rate": 2.1,
        "entity_role": "investigation", "primary_domain": "customs",
        "crime_types": "관세포탈,가격조작",
    }])

    # ── 2) 수입신고 47건 + 품목 란 ───────────────────────────
    start_id = (con.execute("SELECT COALESCE(MAX(id), 0) FROM import_declarations").fetchone()[0] or 0) + 1
    headers, items = build_declarations(start_id)
    insert_dicts(con, "import_declarations", headers)
    insert_dicts(con, "import_declaration_items", items)

    # 시계열 통계(근거 수치 산정)
    mod_rows = [h for h in headers if h["hs_code"] == HS_CODE]
    units = [h["payment_amount"] / i2["tariff_quantity"]
             for h, i2 in zip(headers, items) if h["hs_code"] == HS_CODE]
    avg_unit, first_unit, last_unit = sum(units) / len(units), units[0], units[-1]
    avg_decl_krw = sum(h["declared_value"] for h in mod_rows) / len(mod_rows)
    gap_pct = round((avg_unit / BENCH_UNIT_USD - 1) * 100, 1)   # ≈ -39%
    bench_decl_krw = round(avg_decl_krw / (1 + gap_pct / 100))

    # ── 3) 가격 벤치마크(동종 신고가) ────────────────────────
    insert_dicts(con, "price_benchmark", [
        {"hs_code": HS6, "period": "2025", "avg_declared_value": float(bench_decl_krw),
         "sample_size": 128, "currency": "KRW", "source": "seed_case_c951", "global_hs": HS6, "hsk": None},
        {"hs_code": HS6, "period": "2026", "avg_declared_value": float(round(bench_decl_krw * 1.03)),
         "sample_size": 74, "currency": "KRW", "source": "seed_case_c951", "global_hs": HS6, "hsk": None},
    ])

    # ── 3b) 동일품목(HS 8517.62) 타사 신고 단가 보정 ─────────
    # 저가신고 검증 차트(단가 추이 + 동종 상·하한 밴드)용: 타사 신고 단가가 무작위 값이라
    # 벤치마크(USD 6.70) 주변 5.2~9.4 대역으로 정규화한다(결제금액 유지, 수량만 조정 — 멱등).
    peer_rows = con.execute(
        """
        SELECT i.item_id, d.payment_amount
        FROM import_declarations d JOIN import_declaration_items i ON i.declaration_id = d.id
        WHERE d.company_id <> ? AND d.global_hs = ? AND d.payment_amount > 0
        ORDER BY i.item_id
        """, [CID, HS6]).fetchall()
    for k, (item_id, pay) in enumerate(peer_rows):
        unit = 5.2 + ((k * 37) % 43) / 43 * 4.2      # 5.2~9.4 결정적 의사난수
        con.execute("UPDATE import_declaration_items SET tariff_quantity = ? WHERE item_id = ?",
                    [max(1.0, round(pay / unit)), item_id])

    # ── 4) 가격심사·정정 이력 ────────────────────────────────
    va_start = (con.execute("SELECT COALESCE(MAX(id),0) FROM valuation_audit").fetchone()[0] or 0) + 1
    insert_dicts(con, "valuation_audit", [
        {"id": va_start, "company_id": CID, "audit_date": datetime(2025, 3, 18),
         "audit_type": "가격심사", "hs_code": HS6, "declaration_ref": f"DV2-{CID}-07",
         "result": "추징", "adjusted_amount": 128_000_000.0,
         "note": "저가신고 확인 — 인보이스 대비 신고가 과소, 관세·부가세 추징"},
        {"id": va_start + 1, "company_id": CID, "audit_date": datetime(2025, 11, 6),
         "audit_type": "정정신고", "hs_code": HS6, "declaration_ref": f"DV2-{CID}-21",
         "result": "정정", "adjusted_amount": 96_500_000.0,
         "note": "과세가격 정정(가산요소 권리사용료 누락)"},
    ])

    # ── 5) 특수관계·관련 당사자 ──────────────────────────────
    rp_start = (con.execute("SELECT COALESCE(MAX(id),0) FROM related_party").fetchone()[0] or 0) + 1
    insert_dicts(con, "related_party", [
        {"id": rp_start, "company_id": CID, "party_name": "김포탈(대표이사)", "country": "KOR",
         "relation_type": "대표이사", "shareholding_pct": 62.0, "trade_share_pct": 0.0,
         "is_offshore": False, "note": "실운영자 — 홍콩 개인계좌 차액 수취 의심"},
        {"id": rp_start + 1, "company_id": CID, "party_name": "HK NOMINEE LTD", "country": "HKG",
         "relation_type": "해외정산법인", "shareholding_pct": 0.0, "trade_share_pct": 34.0,
         "is_offshore": True, "note": "이중 인보이스 차액 정산 계좌 보유 의심"},
        {"id": rp_start + 2, "company_id": CID, "party_name": "(주)로우텍세컨드", "country": "KOR",
         "relation_type": "가족법인", "shareholding_pct": 48.0, "trade_share_pct": 12.0,
         "is_offshore": False, "note": "배우자 명의 — 수입 물량 분산 의심"},
    ])

    # ── 5b) FTA 감면 신고 + 원산지 사후검증 ──────────────────
    # 원산지 중국 화물에 한-중 FTA 감면 적용 — 홍콩 경유(HKHKG) 신고는 직접운송원칙 검토 대상.
    fc_start = (con.execute("SELECT COALESCE(MAX(id),0) FROM fta_claim").fetchone()[0] or 0) + 1
    fta_rows = []
    for k, h in enumerate(mod_rows[::3][:12]):
        risky = h["departure_port"] == "HKHKG"
        fta_rows.append({
            "id": fc_start + k, "company_id": CID, "agreement": "한-중",
            "hs_code": HS6, "declaration_ref": h["declaration_no"],
            "co_no": f"CO-951-{k+1:02d}",
            "co_status": "직접운송 검토" if risky else "정상",
            "reduction_amount": float(round(h["total_customs_value_krw"] * 0.021)),
            "claim_date": h["import_date"], "is_high_risk_hs": False,
        })
    insert_dicts(con, "fta_claim", fta_rows)
    fta_risky = [r for r in fta_rows if r["co_status"] != "정상"]
    ov_start = (con.execute("SELECT COALESCE(MAX(id),0) FROM origin_verification").fetchone()[0] or 0) + 1
    insert_dicts(con, "origin_verification", [{
        "id": ov_start, "company_id": CID, "fta_claim_ref": fta_risky[0]["co_no"],
        "verify_date": datetime(2026, 6, 10), "verify_result": "진행중", "recovered_amount": 0.0,
        "agency": "원산지검증과", "note": "홍콩 환적 신고 — 직접운송원칙(비가공증명) 서류 보완 요구",
    }])

    # ── 5c) 관세환급 신청 — 최근 4분기 증가 추세 + 수출이행 근거 미확인 1건(보류).
    #        합계 6,000만원 = company_profiles.recent_customs_refund 와 정합 ──
    rf_start = (con.execute("SELECT COALESCE(MAX(id),0) FROM customs_refund_claim").fetchone()[0] or 0) + 1
    refund_rows = [
        {"claim_date": datetime(2025, 8, 12), "claim_type": "간이정액", "refund_amount": 6_000_000.0,
         "status": "지급", "export_ref": "EX-951-01", "note": ""},
        {"claim_date": datetime(2025, 11, 5), "claim_type": "간이정액", "refund_amount": 7_000_000.0,
         "status": "지급", "export_ref": "EX-951-02", "note": ""},
        {"claim_date": datetime(2026, 1, 20), "claim_type": "간이정액", "refund_amount": 9_000_000.0,
         "status": "지급", "export_ref": "EX-951-03", "note": ""},
        {"claim_date": datetime(2026, 3, 14), "claim_type": "개별환급", "refund_amount": 12_000_000.0,
         "status": "지급", "export_ref": "EX-951-04", "note": ""},
        {"claim_date": datetime(2026, 5, 22), "claim_type": "개별환급", "refund_amount": 12_000_000.0,
         "status": "심사중", "export_ref": "EX-951-05", "note": ""},
        {"claim_date": datetime(2026, 6, 30), "claim_type": "개별환급", "refund_amount": 14_000_000.0,
         "status": "보류", "export_ref": "",
         "note": "수출이행(수출신고) 근거 미확인 — 소요량 대비 환급 물량 과다 의심"},
    ]
    insert_dicts(con, "customs_refund_claim",
                 [{"id": rf_start + i, "company_id": CID, **r} for i, r in enumerate(refund_rows)])

    # ── 6) 위험지표 6종 (데이터 근거 연동) ───────────────────
    # related_refs의 신고번호는 Neo4j CONTRIBUTES_TO(신고→위험요인) 엣지의 원천 — 저가신고 신고 전체 연결
    sample_refs = [h["declaration_no"] for h in mod_rows]
    ind = lambda code, name, score, reason, refs, reco: {
        "company_id": CID, "indicator_code": code, "indicator_name": name, "score": score,
        "reason": reason, "related_refs": refs, "recommendation": reco, "calculated_at": now,
    }
    insert_dicts(con, "company_risk_indicator", [
        ind("undervaluation", "저가신고 의심률", 78.7,
            f"- HS {HS6} 신고단가 평균 USD {avg_unit:.2f} — 동종 벤치마크(USD {BENCH_UNIT_USD:.2f}) 대비 {gap_pct}%\n"
            f"- 24개월 단가 지속 하락(USD {first_unit:.2f} → {last_unit:.2f}, 분기당 약 -5%)\n"
            f"- 가격심사 추징 1건·과세가격 정정 1건(가산요소 누락)\n"
            f"- 저가신고 신호 신고 44건 (crime_signal=undervaluation)",
            '{"declarations": ' + str(sample_refs).replace("'", '"') + ', "price_benchmark": ["8517.62"], "valuation_audit": [1, 2]}',
            "이중 인보이스 확보(압수)와 과세가격 재산정, 홍콩 정산계좌 자금흐름 추적 권고"),
        ind("related_party", "특수관계 이상률", 46.0,
            "- 홍콩 HK NOMINEE LTD 거래 비중 34% — 실체 미확인 해외정산법인\n"
            "- 가족법인 (주)로우텍세컨드로 수입 물량 12% 분산",
            '{"related_party": [1, 2, 3]}',
            "특수관계자 거래가격 적정성(이전가격) 검토 권고"),
        ind("fta_origin_misuse", "FTA 원산지 오용 의심률", 24.0,
            f"- 한-중 FTA 감면 신고 {len(fta_rows)}건 중 홍콩 경유 {len(fta_risky)}건 — 직접운송원칙 충족 여부 검토 필요\n"
            f"- 원산지증명 사후검증 1건 진행 중(비가공증명 서류 보완 요구)",
            json.dumps({"fta_claim": [r["id"] for r in fta_rows],
                        "origin_verification": [ov_start]}),
            "원산지증명서·운송서류(B/L) 대사와 비가공증명 확보 권고"),
        ind("customs_refund", "관세환급 이상률", 18.0,
            "- 최근 4분기 환급 신청 6건 6,000만원 — 분기별 증가 추세\n"
            "- 수출이행 근거 미확인 신청 1건(보류, 1,400만원) — 환급 물량 과다 의심",
            json.dumps({"customs_refund_claim": list(range(rf_start, rf_start + len(refund_rows)))}),
            "수출이행 내역 대사 및 환급 심사 강화 권고"),
        ind("hs_classification", "HS 분류 오류율", 12.5,
            "- AI 분류 추천 불일치 1건(부속품 세번 검토 필요)",
            '{"declarations": ["DV2-C-951-45"]}',
            "품목분류 사전심사 확인 권고"),
        ind("offshore_fund", "역외자금 은닉 의심률", 55.0,
            "- 수입대금 외 홍콩 별도 송금 정황(외환 내역 확보 필요)\n"
            "- 역외 정산법인(HK NOMINEE LTD) 연계",
            '{"related_party": [2]}',
            "외국환은행 송금내역 자료요청 및 자금흐름 관계분석 권고"),
    ])

    # ── 6b) HS 분류 이벤트 — AI 분류 추천 불일치 1건 (지표 12.5%·검증 차트의 근거) ──
    ev_id = (con.execute("SELECT COALESCE(MAX(id),0) FROM hs_classification_event").fetchone()[0] or 0) + 1
    insert_dicts(con, "hs_classification_event", [{
        "id": ev_id, "company_id": CID, "event_date": datetime(2026, 5, 18),
        "event_type": "AI불일치", "declared_hs": HS_CODE, "declaration_ref": f"DV2-{CID}-45",
        "ai_suggested_hs": "8517.71.0000", "case_ref": None,
        "note": "부속품(안테나 모듈) 포함 신고 — AI 분류는 8517.71(안테나·부분품) 추천, 세번 검토 필요",
    }])

    # ── 7) 위험지표 비율(import_risk_scores) — 프로파일 'AI 위험 지표 분석' 게이지의 원천.
    #       company_risk_indicator의 score와 동일 값으로 정합 유지 ─────────────
    irs_id = (con.execute("SELECT COALESCE(MAX(id),0) FROM import_risk_scores").fetchone()[0] or 0) + 1
    insert_dicts(con, "import_risk_scores", [{
        "id": irs_id, "company_id": CID, "risk_level": "HIGH", "risk_score": 87.0,
        "undervaluation_suspicion_rate": 78.7,
        "related_party_anomaly_rate": 46.0,
        "fta_origin_misuse_suspicion_rate": 24.0,
        "customs_refund_anomaly_rate": 18.0,
        "hs_classification_error_rate": 12.5,
        "offshore_fund_concealment_suspicion_rate": 55.0,
        "customs_crime_rate": 87.0,
        "generated_at": now,
    }])

    con.commit()

    # 요약 출력
    print(f"[seed] {CNAME} ({CID}) 시드 완료")
    print(f"  - 수입신고 {len(headers)}건 (무선통신 모듈 {len(mod_rows)} + 대조군 3) / 품목 란 {len(items)}건")
    print(f"  - 평균 신고단가 USD {avg_unit:.2f} vs 벤치마크 {BENCH_UNIT_USD:.2f} → 편차 {gap_pct}%")
    print(f"  - 벤치마크 2행 · 가격심사 2건 · 특수관계 3건 · 위험지표 6종(undervaluation 78.7)")
    print(f"  - FTA 감면 신고 {len(fta_rows)}건(직접운송 검토 {len(fta_risky)}) · 환급 신청 {len(refund_rows)}건")
    print(f"  - import_risk_scores 1행(지표 게이지 %: 78.7/46/24/18/12.5/55)")
    con.close()

    if args.neo4j:
        print("[seed] Neo4j 기업 그래프 재적재(--clear) 실행...")
        r = subprocess.run([sys.executable, str(ROOT / "data/scripts/load_company_import_graph_to_neo4j.py"),
                            "--clear"], cwd=str(ROOT))
        print(f"[seed] Neo4j 로더 종료 코드: {r.returncode}")
    else:
        print("[seed] Neo4j 반영은 --neo4j 옵션 또는:")
        print("       venv/Scripts/python.exe data/scripts/load_company_import_graph_to_neo4j.py --clear")


if __name__ == "__main__":
    main()
