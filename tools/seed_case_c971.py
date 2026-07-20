# -*- coding: utf-8 -*-
"""위해물품 밀수 시연 케이스 시드 — (주)메디피아글로벌 C-971.

docs/crime-case-sim/case-c971-hazard-smuggling.html 의 케이스를 포털 데이터로 구축한다:
  1) company_profiles        : C-971 기업 프로파일 (위험 HIGH 84)
  2) import_declarations     : 18개월 수입신고 38건 (품명 위장·특송 92%·소액 분할)
     + import_declaration_items 1란씩
  3) import_risk_scores      : 프로파일 지표 게이지 6종 %
  4) company_risk_indicator  : 지표 근거 bullet + related_refs
  5) hs_classification_event : 품명 위장 → HS 오분류 이벤트(성분분석 적발 근거)
  6) related_party           : 정밀수(대표)·박차명(차명)·중국 공급자 3사
  7) smuggling_case          : 위해물품 밀수 사건 3건(성분분석 적발 건)

지표는 밀수 수사 세트 6종만 적재한다(품명위장·검사회피·위해적발·경로공급망·공범차명·수익은닉).
심사(관세조사) 세트(저가신고·특수관계·FTA·환급·HS·역외)는 밀수 대상에 해당하지 않아
채우지 않는다 — 남겨두면 대시보드 태그·집계에 심사 지표가 섞여 표시된다.

멱등: C-971 기존 행 삭제 후 재삽입.
사용법:
  venv/Scripts/python.exe tools/seed_case_c971.py            # DuckDB 시드
  venv/Scripts/python.exe tools/seed_case_c971.py --neo4j    # + Neo4j 그래프 재적재(--clear)
실행 후: 실행 중인 web_server 재시작 권장.
"""
import argparse
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "customs.duckdb"

CID = "C-971"
CNAME = "(주)메디피아글로벌"
FX = 1350.0
DUTY_RATE = 0.08
VAT_RATE = 0.10

# (신고품명, HS, global_hs, HSK, 공급사, 출발항, 출발도시)
PRODUCTS = [
    ("건강기능식품(다이어트)", "2106.90.9099", "2106.90", "2106909099", "GUANGZHOU HEALTH TRADE", "CNCAN", "광저우"),
    ("건강기능식품(활력)",     "2106.90.9099", "2106.90", "2106909099", "SHENZHEN VITA CO",       "CNSZX", "선전"),
    ("화장품(크림)",           "3304.99.0000", "3304.99", "3304990000", "GZ COSMETIC LAB",        "CNCAN", "광저우"),
]
# 월별 신고건수 (standalone PATTERN과 동일 = 총 38건)
PATTERN = [
    ("2025-02", 2, 2, 0), ("2025-03", 3, 3, 0), ("2025-05", 3, 3, 0), ("2025-07", 2, 1, 1),
    ("2025-09", 4, 4, 0), ("2025-11", 3, 3, 0), ("2025-12", 3, 3, 0), ("2026-01", 4, 4, 0),
    ("2026-03", 3, 3, 0), ("2026-04", 4, 4, 0), ("2026-05", 3, 3, 1), ("2026-06", 4, 4, 1),
]
# 물품검사 적발 건의 성분분석 결과 (standalone ANALYSIS와 정합) — 적발 순서대로 매칭
HAZARD_SUBSTANCES = [
    ("시부트라민 13.5mg/캡슐 · 페놀프탈레인 42mg/캡슐", "식품위생법 제7조·약사법 제61조"),   # 2026-05 적발
    ("실데나필 88mg/정 · 타다라필 21mg/정", "약사법 제31조·제61조"),                        # 2026-06 적발
]


def insert_dicts(con, table, rows):
    if not rows:
        return
    cols = list(rows[0].keys())
    ph = ", ".join(["?"] * len(cols))
    con.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({ph})",
                    [[r.get(c) for c in cols] for r in rows])


def build_declarations(start_id: int):
    """18개월 38건 — 전량 품명 위장, 특송 97%, 신고금액 1,140~1,498만원(소액 분할).

    inspection_type: 월별 PATTERN의 검사건수만큼 물품검사(=적발), 일반화물은 서류검사, 나머지 미검사.
    '반입채널·검사회피' 그래프의 분석 축이 된다(검사율 7.9% — 검사 2건 모두 위해성분 적발).
    """
    headers, items, seq = [], [], 0
    for ym, n, express, inspected in PATTERN:
        y, m = int(ym[:4]), int(ym[5:])
        for k in range(n):
            seq += 1
            d = datetime(y, m, min(3 + k * 6, 27))
            p = PRODUCTS[seq % 3]
            name, hs_code, global_hs, hsk, supplier, dep_port, dep_city = p
            # 소액 분할: 1,140~1,498만원 (1,500만원 직하 집중)
            value_krw = 11_400_000 + ((seq * 317) % 359) * 10_000
            qty = 6000 + ((seq * 53) % 8) * 1000
            is_express = k < express
            # 검사 구분: 그 달의 검사건수(inspected)만큼만 검사 — 특송은 물품검사(적발),
            # 일반화물은 서류검사. 나머지는 미검사 → 미검사 35 / 서류 1 / 물품 2 (검사율 7.9%)
            if k >= n - inspected:
                inspection_type = "물품검사" if is_express else "서류검사"
            else:
                inspection_type = "미검사"
            freight = round(value_krw * 0.035)
            insurance = round(value_krw * 0.001)
            cv = value_krw + freight + insurance
            duty = round(cv * DUTY_RATE)
            vat = round((cv + duty) * VAT_RATE)
            no = f"HZ-{y}-{m:02d}{seq:02d}"
            did = start_id + seq - 1
            headers.append({
                "id": did, "company_id": CID, "declaration_no": no,
                "hs_code": hs_code, "global_hs": global_hs, "hsk": hsk,
                "item_name": name, "declared_value": float(value_krw),
                "origin_country": "중국", "origin_country_name": "중국", "origin_country_code": "CN",
                "import_date": d, "status": "수리",
                "customs_office_code": "030", "declaration_type": "일반P/L신고",
                "clearance_plan": "보세구역장치후신고",
                "filer_name": "정민관세사무소 서지호", "filer_representative": "서지호",
                "importer_name": CNAME, "importer_customs_code": "IMP-C971",
                "importer_is_taxpayer": True, "taxpayer_name": CNAME,
                "taxpayer_business_no": "512-86-97102",
                "taxpayer_address": "경기 성남시 분당구 판교로 971",
                "overseas_supplier_name": supplier, "overseas_supplier_country": "중국",
                "overseas_supplier_country_code": "CN",
                "bl_awb_no": f"{'EXP' if is_express else 'BL'}971-{y}-{seq:03d}",
                "cargo_control_no": f"KCC971{seq:05d}",
                "forwarder_name": "스카이특송" if is_express else "한성해운",
                "departure_country": "중국", "departure_country_code": "CN",
                "departure_port": dep_port, "arrival_port": "KRICN",
                "transport_type": "항공" if is_express else "해상",
                "vessel_name": "SKY EXPRESS" if is_express else "HANSUNG STAR",
                "arrival_date": d + timedelta(days=2 if is_express else 6),
                "warehousing_date": d + timedelta(days=3 if is_express else 7),
                "inspection_location": "특송통관장" if is_express else "일반보세창고",
                "inspection_type": inspection_type,
                "total_weight": round(qty * 0.012, 1), "total_weight_unit": "KG",
                "total_packages": max(1, qty // 600), "package_type": "CT",
                "transaction_type": "일반형태거래", "import_type": "일반수입",
                "collection_type": "신고수리전납부", "origin_cert_flag": "N",
                "price_declaration_flag": "N", "payment_incoterms": "CIF",
                "payment_currency": "USD", "payment_amount": round(value_krw / FX, 2),
                "payment_method": "TT", "exchange_rate": FX,
                "freight_krw": freight, "insurance_krw": insurance,
                "addition_krw": 0.0, "deduction_krw": 0.0,
                "total_customs_value_usd": round(cv / FX, 2), "total_customs_value_krw": float(cv),
                "tax_customs_duty": float(duty), "tax_vat": float(vat),
                "total_tax_amount": float(duty + vat), "total_vat_base": float(cv + duty),
                "crime_signal": "hazard_smuggling",
                "document_type_code": "B", "split_declaration_yn": "Y",
            })
            items.append({
                "item_id": did * 10 + 1, "declaration_id": did, "line_no": 1,
                "tariff_item_name_en": "Health supplement" if "건강" in name else "Cosmetic cream",
                "trade_item_name_en": name, "hsk_code": hsk,
                "net_weight": round(qty * 0.011, 1), "net_weight_unit": "KG",
                "tariff_quantity": float(qty), "tariff_quantity_unit": "EA",
                "origin_country": "중국", "origin_criteria": "WO", "origin_marking": "표시",
                "item_customs_value_usd": round(cv / FX, 2), "item_customs_value_krw": float(cv),
                "global_hs": global_hs, "hsk": hsk, "origin_country_code": "CN",
            })
    return headers, items


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
        idlist = ",".join(map(str, ids))
        con.execute(f"DELETE FROM import_declaration_item_specs WHERE item_id IN "
                    f"(SELECT item_id FROM import_declaration_items WHERE declaration_id IN ({idlist}))")
        con.execute(f"DELETE FROM import_declaration_item_taxes WHERE item_id IN "
                    f"(SELECT item_id FROM import_declaration_items WHERE declaration_id IN ({idlist}))")
        con.execute(f"DELETE FROM import_declaration_items WHERE declaration_id IN ({idlist})")
    for t in ["import_declarations", "company_profiles", "company_risk_indicator",
              "related_party", "import_risk_scores", "hs_classification_event"]:
        con.execute(f"DELETE FROM {t} WHERE company_id = ?", [CID])
    con.execute("DELETE FROM smuggling_case WHERE seed_batch_id = ?", ["case-c971"])

    # ── 1) 기업 프로파일 ─────────────────────────────────────
    insert_dicts(con, "company_profiles", [{
        "company_id": CID, "company_name": CNAME,
        "business_registration_no": "512-86-97102", "industry_code": "G46",
        "founded_year": 2019, "risk_level": "HIGH", "risk_score": 84.0,
        "last_audit_date": datetime(2026, 5, 14),
        "address": "경기 성남시", "address_detail": "분당구 판교로 971",
        "employee_count": 14, "major_export_countries": "중국",
        "customs_broker_firm": "정민관세사무소",
        "related_companies": None,
        "annual_revenue": 6_840_000_000.0, "annual_import_amount": 4_120_000_000.0,
        "declared_duty_amount": 330_000_000.0, "recent_customs_refund": 0.0,
        "fta_reduction_rate": 0.0,
        "entity_role": "investigation", "primary_domain": "customs",
        "crime_types": "위해물품밀수,허위신고",
    }])

    # ── 2) 수입신고 38건 + 품목 란 ───────────────────────────
    start_id = (con.execute("SELECT COALESCE(MAX(id), 0) FROM import_declarations").fetchone()[0] or 0) + 1
    headers, items = build_declarations(start_id)
    insert_dicts(con, "import_declarations", headers)
    insert_dicts(con, "import_declaration_items", items)

    express_n = sum(1 for h in headers if h["transport_type"] == "항공")
    inspect_n = {t: sum(1 for h in headers if h["inspection_type"] == t)
                 for t in ("미검사", "서류검사", "물품검사")}
    # 성분분석 위해 확정 대표 신고 — 물품검사 적발 2건(직접 증거) + 유통품 수거 분석 2건
    seized_headers = [h for h in headers if h["inspection_type"] == "물품검사"]
    seized_refs = [h["declaration_no"] for h in seized_headers]
    hazard_refs = seized_refs + [headers[-12]["declaration_no"], headers[-20]["declaration_no"]]
    # 특송 반입 전체(검사회피 근거) — 그래프의 CONTRIBUTES_TO 엣지로 연결된다
    express_refs = [h["declaration_no"] for h in headers if h["transport_type"] == "항공"]

    # ── 3) 위험지표 비율(프로파일 게이지) ────────────────────
    irs_id = (con.execute("SELECT COALESCE(MAX(id),0) FROM import_risk_scores").fetchone()[0] or 0) + 1
    # 밀수 세트 6종(혐의 c4 금지·제한 위반 → 위해물품)이 프로파일에 표시된다.
    # 심사 세트 6종은 참고용 최소값만 채워 대조 가능하게 둔다.
    insert_dicts(con, "import_risk_scores", [{
        "id": irs_id, "company_id": CID, "risk_level": "HIGH", "risk_score": 84.0,
        # ── 밀수 세트(주 표시) ──
        "disguise_declaration_rate": 88.0,     # 품명 위장 신고율 — 성분분석 9/12 불일치
        "inspection_evasion_rate": 66.5,       # 통관검사 회피 — 특송 97%·소액 분할·검사율 7.9%
        "contraband_detection_rate": 75.0,     # 금지·위해물품 적발률 — 분석 12건 중 9건 위해 확정
        "route_supplier_risk_rate": 48.0,      # 우범 경로·공급망 — 중국 3사 동일 대역
        "accomplice_network_rate": 52.0,       # 공범·차명 관계망 — 박차명 차명계좌
        "proceeds_concealment_rate": 61.0,     # 범죄수익·자금 은닉 — 차명 경유 송금·현금화
        # ── 심사(관세조사) 세트는 밀수 대상에 해당하지 않으므로 채우지 않는다 ──
        #    (구 스키마 매핑값을 남기면 대시보드 태그·집계에 저가신고·FTA 등이 섞여 표시됨)
        "customs_crime_rate": 84.0,
        "generated_at": now,
    }])

    # ── 4) 위험지표 근거 bullet ──────────────────────────────
    ind = lambda code, name, score, reason, refs, reco: {
        "company_id": CID, "indicator_code": code, "indicator_name": name, "score": score,
        "reason": reason, "related_refs": refs, "recommendation": reco, "calculated_at": now,
    }
    # related_refs.declarations = Neo4j CONTRIBUTES_TO(신고→위험요인) 엣지의 원천.
    # 키 이름은 로더 규약(load_company_import_graph_to_neo4j.parse_contrib_decls) 고정.
    decl_refs = '{"declarations": ' + str(hazard_refs).replace("'", '"') + '}'
    express_decl_refs = '{"declarations": ' + str(express_refs).replace("'", '"') + '}'
    insert_dicts(con, "company_risk_indicator", [
        # ── 밀수 세트(프로파일 주 표시) ──
        ind("disguise_declaration", "품명 위장 신고율", 88.0,
            "- 신고품명 '건강기능식품·화장품'과 실물 불일치 — 성분분석 12건 중 9건 위해물품 확정\n"
            "- 실물 기준 정상 분류 HS 3004.90(의약품) — 식약처 품목허가 회피 목적 위장 신고\n"
            "- 공급자 제출 성분표와 실제 분석 결과 전면 불일치(허위 서류)\n"
            "- 세관장 확인대상(관세법 §226) 회피",
            decl_refs,
            "잔여 26건 보관시료 전량 성분분석 및 공급자 발행 성분표 원본 압수 권고"),
        ind("inspection_evasion", "통관검사 회피 지수", 66.5,
            "- 특송 반입 37/38건(97%) — 동종업계 특송 비중(23%) 대비 4배\n"
            "- 신고금액을 1,500만원 직하(1,144~1,484만원)로 집중 조정 — 고액 검사 선별 회피\n"
            "- 신고 38건 중 검사 3건(7.9%) — 검사 실시 2건에서 즉시 위해성분 적발\n"
            "- 검사 적발 직후 반입 중단 지시 확인(통신내역 2026-05-14)",
            express_decl_refs,
            "특송·소액 분할 패턴 검사 선별기준 재조정 및 차기 반입 화물 100% 검사 지정 권고"),
        ind("contraband_detection", "금지·위해물품 적발률", 75.0,
            "- 성분분석 12건 중 위해물품 9건 확정(75%) · 기준초과 1건\n"
            "- 시부트라민 13.5mg/캡슐(2010년 판매금지) · 실데나필 88mg/정(전문의약품)\n"
            "- 덱사메타손 0.08%(화장품 사용금지) · 수은 3.2ppm(기준 3.2배 초과)\n"
            "- 유통 42,000정 중 미회수 38,200정(회수율 9.0%) · 부작용 신고 7건",
            decl_refs,
            "식약처 위해평가·회수명령 요청 및 미분석 26건 확대 분석 권고"),
        ind("route_supplier_risk", "우범 경로·공급망 위험", 48.0,
            "- 전량 중국발(광저우·선전) — 공급자 3사 동일 지역·동일 연락처 대역(실질 동일 공급망)\n"
            "- 공급자별 반입 비중: GUANGZHOU HEALTH TRADE 42% · SHENZHEN VITA 37% · GZ COSMETIC 21%",
            '{"related_party": [3, 4, 5]}',
            "공급자 3사 실체 확인 국제공조 및 동일 공급망 연계 기업 확대 조사 권고"),
        ind("accomplice_network", "공범·차명 관계망", 52.0,
            "- 차명계좌 명의자 박차명(P-972) — 자금 경유·분할신고 실행 공범\n"
            "- 대표 정밀수(P-971) 성분·라벨·분할반입 총괄 지시(통신내역 6건 확보)\n"
            "- 중국 공급책(+86-135-****-7712) 연계 — 국제공조 대상",
            '{"related_party": [1, 2]}',
            "정밀수·박차명 체포영장 신청 및 휴대전화 포렌식 권고"),
        ind("proceeds_concealment", "범죄수익·자금 은닉", 61.0,
            "- 판매대금 법인 인출 → 차명계좌(박차명) → 중국 공급자 해외송금 2일 내 연속 실행 3회\n"
            "- 확인된 해외 유출 2.46억원(무역외 송금 — 수입신고 대금과 별도)\n"
            "- 대표 정밀수 개인 인출 6,400만원 중 6,000만원 현금출금(용도 불명)\n"
            "- 판매수익 11.1억원 대비 신고 수입금액 5.3억원 — 수익·신고 규모 괴리",
            '{"related_party": [1, 2]}',
            "법인·차명·개인 전 계좌 지급정지 및 몰수·추징 보전 청구 권고"),
    ])
    # 심사 세트 6종은 company_risk_indicator에 넣지 않는다 — 근거·위험요인(RiskFactor) 노드가
    # 밀수 세트로만 구성되도록 하기 위함. 게이지 대조값은 import_risk_scores 컬럼에만 남는다.

    # ── 5) 품목분류 이벤트(성분분석 적발 근거) ───────────────
    hce_id = (con.execute("SELECT COALESCE(MAX(id),0) FROM hs_classification_event").fetchone()[0] or 0) + 1
    hce_rows = []
    for i, (h, (subs, law)) in enumerate(zip(seized_headers, HAZARD_SUBSTANCES)):
        hce_rows.append({
            "id": hce_id + i, "company_id": CID,
            "event_date": h["import_date"], "event_type": "적발",
            "declared_hs": h["global_hs"], "declaration_ref": h["declaration_no"],
            "ai_suggested_hs": "3004.90", "case_ref": f"HZ-CASE-{i+1:02d}",
            "note": f"물품검사 성분분석 — {subs} 검출. 신고품명 '{h['item_name']}'과 실물 불일치({law})",
        })
    insert_dicts(con, "hs_classification_event", hce_rows)

    # ── 6) 공범·공급자 관계 ──────────────────────────────────
    rp = (con.execute("SELECT COALESCE(MAX(id),0) FROM related_party").fetchone()[0] or 0) + 1
    insert_dicts(con, "related_party", [
        {"id": rp, "company_id": CID, "party_name": "정밀수(대표이사)", "country": "KOR",
         "relation_type": "대표이사", "shareholding_pct": 88.0, "trade_share_pct": 0.0,
         "is_offshore": False, "note": "실운영자 — 성분·라벨·분할반입 총괄 지시(통신내역 확보)"},
        {"id": rp + 1, "company_id": CID, "party_name": "박차명(자금관리)", "country": "KOR",
         "relation_type": "차명계좌 명의자", "shareholding_pct": 0.0, "trade_share_pct": 0.0,
         "is_offshore": False, "note": "판매대금 경유·해외송금 실행 공범"},
        {"id": rp + 2, "company_id": CID, "party_name": "GUANGZHOU HEALTH TRADE", "country": "CHN",
         "relation_type": "해외공급자", "shareholding_pct": 0.0, "trade_share_pct": 42.0,
         "is_offshore": True, "note": "시부트라민 함유 다이어트 제품 공급 — 국제공조 대상"},
        {"id": rp + 3, "company_id": CID, "party_name": "SHENZHEN VITA CO", "country": "CHN",
         "relation_type": "해외공급자", "shareholding_pct": 0.0, "trade_share_pct": 37.0,
         "is_offshore": True, "note": "실데나필·타다라필 함유 활력 제품 공급"},
        {"id": rp + 4, "company_id": CID, "party_name": "GZ COSMETIC LAB", "country": "CHN",
         "relation_type": "해외공급자", "shareholding_pct": 0.0, "trade_share_pct": 21.0,
         "is_offshore": True, "note": "덱사메타손·수은 초과 크림 공급"},
    ])

    # ── 7) 위해물품 밀수 사건 ────────────────────────────────
    sc_rows = []
    for i, (h, (subs, law)) in enumerate(zip(seized_headers, HAZARD_SUBSTANCES)):
        sc_rows.append({
            "case_id": f"SC2-C971-{i+1:02d}", "case_no": f"2026-위해물품-{i+1:04d}",
            "case_type": "위해물품 밀수입", "contraband_category": "위해물품",
            "contraband_sub_category": "의약품 성분 함유 식품·화장품",
            "case_status": "수사", "detection_date": h["import_date"],
            "detection_channel": "특송", "origin_country": "중국",
            "transit_country": "없음", "destination_region": "수도권",
            "modus_operandi": "품명 위장(건강기능식품·화장품 신고) + 소액 분할·특송 반입",
            "concealment_method": "라벨 위장·성분 미표시",
            "quantity": float(h["total_packages"]), "quantity_unit": "CT",
            "estimated_value": h["declared_value"],
            "lead_agency": "관세청 본청 수사1팀",
            "summary": f"{CNAME}({CID}) 신고 {h['declaration_no']} — {subs} 검출. {law} 위반",
            "seed_batch_id": "case-c971", "created_at": now, "updated_at": now,
        })
    insert_dicts(con, "smuggling_case", sc_rows)

    con.commit()
    print(f"[seed] {CNAME} ({CID}) 시드 완료")
    print(f"  - 수입신고 {len(headers)}건 (특송 {express_n}건 = {express_n/len(headers)*100:.0f}%) / 품목 란 {len(items)}건")
    print(f"  - 통관검사: 미검사 {inspect_n['미검사']} / 서류검사 {inspect_n['서류검사']} / 물품검사 {inspect_n['물품검사']}"
          f" (검사율 {(inspect_n['서류검사']+inspect_n['물품검사'])/len(headers)*100:.1f}%) — 물품검사 2건 모두 적발")
    print(f"  - 신고금액 {min(h['declared_value'] for h in headers)/10000:.0f}~{max(h['declared_value'] for h in headers)/10000:.0f}만원 (1,500만원 직하 분할)")
    print(f"  - 밀수 지표 게이지 %: 품명위장 88 / 위해적발 75 / 검사회피 66.5 / 수익은닉 61 / 공범 52 / 경로 48")
    print(f"  - 위험지표 근거 밀수 6종(그래프 RiskFactor 6) · 기여 신고 연결 {len(hazard_refs)*2 + len(express_refs)}건")
    print(f"  - 품목분류 적발 {len(hce_rows)}건 · 관계 5건 · 밀수사건 {len(sc_rows)}건")
    con.close()

    if args.neo4j:
        print("[seed] Neo4j 기업 그래프 재적재(--clear) 실행...")
        r = subprocess.run([sys.executable, str(ROOT / "data/scripts/load_company_import_graph_to_neo4j.py"),
                            "--clear"], cwd=str(ROOT))
        print(f"[seed] Neo4j 로더 종료 코드: {r.returncode}")
    else:
        print("[seed] Neo4j 반영: venv/Scripts/python.exe data/scripts/load_company_import_graph_to_neo4j.py --clear")


if __name__ == "__main__":
    main()
