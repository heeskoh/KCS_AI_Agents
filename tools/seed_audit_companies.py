"""관세조사 대상(audit) 기업 30개사 + 수입신고 시드.

기존 C-1001~C-1040과 같은 성격의 관세조사 대상 기업을 C-1041~C-1070으로 추가한다.
관세포탈 대시보드(entity_role='audit')에 그대로 합류한다.

생성 규칙
- 기업 30개사, entity_role='audit', primary_domain='customs', crime_types 없음
- 기업마다 품목 3~4종, 품명별 수입신고 10~14건 → 기업당 30~50건
- 심사 6대 지표(저가신고·HS분류·특수관계·관세환급·역외자금·FTA원산지)를
  import_risk_scores 와 company_risk_indicator 양쪽에 같은 값으로 적재
  (대시보드 경보 수치는 rate, 근거 건수는 company_risk_indicator.related_refs 사용)
- 대부분은 낮은 위험도, 일부만 특정 지표가 50점 이상이 되도록 분포시킨다
  (기존 40개사의 분포: 지표별 50점 이상 2~7개사)

실행: python tools/seed_audit_companies.py [--db data/customs.duckdb] [--reset]
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "customs.duckdb"

COMPANY_COUNT = 30
START_NO = 1041                      # C-1041 ~ C-1070
SEED = 20260722

# 심사 6대 지표 — (코드, 지표명, import_risk_scores 컬럼, 근거 참조 키, 권고문)
INDICATORS = [
    ("undervaluation", "저가신고 의심률", "undervaluation_suspicion_rate",
     ["valuation_audit", "declarations"],
     "동일 HS 평균 신고금액 대비 저가 신고 여부 및 과세가격 적정성 정밀 심사 권고"),
    ("hs_classification", "HS 분류 오류율", "hs_classification_error_rate",
     ["hs_classification_event", "case_refs", "declarations"],
     "품목분류 정정 이력과 유사 결정례 대조를 통한 HS 적정성 재검토 권고"),
    ("related_party", "특수관계 이상률", "related_party_anomaly_rate",
     ["related_party", "transfer_pricing_audit"],
     "특수관계사 거래가격(이전가격) 적정성 및 거래비중 집중도 심층 조사 권고"),
    ("customs_refund", "관세환급 이상률", "customs_refund_anomaly_rate",
     ["drawback", "drawback_audit"],
     "관세환급 소요량(BOM) 산정 적정성 및 과다·반복 환급 정밀 심사 권고"),
    ("offshore_fund", "역외자금 은닉 의심률", "offshore_fund_concealment_suspicion_rate",
     ["offshore_company", "fx_transaction", "forex_investigation"],
     "역외 페이퍼컴퍼니 경유 대금 지급과 외환거래 정합성 확인 권고"),
    ("fta_origin_misuse", "FTA 원산지 오용 의심률", "fta_origin_misuse_suspicion_rate",
     ["fta_claim", "origin_verification", "declarations"],
     "FTA 협정관세 적용 원산지증명서 진위 및 우회수입 여부 검증 권고"),
]

REASON_TEMPLATES = {
    "undervaluation": ["- 동일 HS 평균 신고금액 대비 {p}% 저가", "- 최근 과세가격 정정신고 {n}건",
                       "- 저가신고 적발이력 {m}건", "- 과세가격 추징 {a}억원"],
    "hs_classification": ["- 최근 품목분류 정정 {n}건", "- 품목분류 심사 {m}건",
                          "- AI 추천 불일치 {p}건", "- 유사 분류사례 {m}건 존재"],
    "related_party": ["- 특수관계사 {n}개", "- 거래비중 {p}%",
                      "- 이전가격 조사이력 존재 (추징 {a}억원)", "- 비정상 마진율 {m}%"],
    "customs_refund": ["- 환급 부인 {m}건", "- 과다환급 {n}건",
                       "- 허위 BOM 의심", "- 환급 추징 {a}억원"],
    "offshore_fund": ["- 역외 법인 경유 대금지급 {n}건", "- 신고외 외환거래 {m}건",
                      "- 조세피난처 소재 거래처 {m}개", "- 미신고 송금 추정 {a}억원"],
    "fta_origin_misuse": ["- 협정관세 적용 {n}건 중 원산지 검증 요청 {m}건",
                          "- 제3국 경유 의심 {m}건", "- 원산지증명서 불일치 {p}%",
                          "- 감면세액 추징 {a}억원"],
}

ITEM_POOL = [
    ("메모리 집적회로", "8542.32"), ("완구", "9503.00"), ("휴대용 컴퓨터", "8471.30"),
    ("면 혼방 의류", "6205.20"), ("위스키", "2208.30"), ("PET 수지", "3907.61"),
    ("플라스틱 제품", "3926.90"), ("자동차 부품", "8708.99"), ("무선 통신기기", "8517.62"),
    ("기능성 화장품", "3304.99"), ("전기 커넥터", "8536.69"), ("신발", "6404.19"),
    ("의료용 진단기기", "9018.19"), ("가공식품", "2106.90"), ("산업용 로봇", "8479.50"),
    ("LED 조명", "9405.40"), ("배터리 셀", "8507.60"), ("광학렌즈", "9002.11"),
    ("주방용품", "7323.93"), ("스포츠용품", "9506.62"), ("가구", "9403.60"),
    ("농산물 가공품", "2008.99"), ("윤활유", "2710.19"), ("의약품 원료", "2941.90"),
]
ORIGINS = [("중국", "CN", "SHANGHAI"), ("베트남", "VN", "HAI PHONG"), ("일본", "JP", "TOKYO"),
           ("대만", "TW", "KAOHSIUNG"), ("미국", "US", "LOS ANGELES"), ("독일", "DE", "HAMBURG"),
           ("태국", "TH", "LAEM CHABANG"), ("말레이시아", "MY", "PORT KLANG"),
           ("인도네시아", "ID", "TANJUNG PRIOK"), ("멕시코", "MX", "MANZANILLO")]

INDUSTRIES = ["C20", "C26", "C28", "C13", "G46", "G47", "H52", "K64"]
REGIONS = ["서울", "인천", "경기", "부산", "대구", "광주", "대전", "울산", "충남", "경남"]
BROKERS = ["케이씨관세법인", "대성관세법인", "한울관세사무소", "정민관세사무소", "동방관세법인"]
PORTS_KR = ["인천항", "부산항", "평택항", "광양항", "울산항"]
CUSTOMS_OFFICES = ["010", "020", "030", "040", "050"]

# 지표별로 '50점 이상'을 받을 기업 수 — 기존 40개사 분포(2~7개사)에 맞춘다
HIGH_QUOTA = {"undervaluation": 5, "hs_classification": 5, "related_party": 3,
              "customs_refund": 4, "offshore_fund": 2, "fta_origin_misuse": 3}


def build_reason(rng, code: str, score: float) -> str:
    if score < 1:
        return "근거 데이터 없음"
    lines = []
    for tpl in REASON_TEMPLATES[code]:
        lines.append(tpl.format(n=rng.randint(2, 9), m=rng.randint(1, 5),
                                p=rng.randint(18, 52), a=round(rng.uniform(1.2, 28.0), 1)))
    return "\n".join(lines[: 3 if score < 60 else 4])


def build_refs(rng, keys: list[str], score: float, decl_nos: list[str]) -> str:
    refs: dict = {}
    if score < 1:
        for k in keys:
            refs[k] = []
        return json.dumps(refs, ensure_ascii=False)
    for k in keys:
        if k == "declarations":
            refs[k] = rng.sample(decl_nos, min(len(decl_nos), rng.randint(3, 8)))
        else:
            refs[k] = list(range(1, rng.randint(2, 6)))
    if "valuation_audit" in keys:
        refs["worst_gap_pct"] = round(rng.uniform(21.0, 49.0), 1)
    return json.dumps(refs, ensure_ascii=False)


def next_ids(con):
    def mx(t, c):
        return int(con.execute(f"SELECT COALESCE(MAX({c}),0) FROM {t}").fetchone()[0])
    return (mx("import_declarations", "id"), mx("import_declaration_items", "item_id"),
            mx("import_declaration_item_specs", "spec_id"),
            mx("import_declaration_item_taxes", "tax_id"),
            mx("import_risk_scores", "id"), mx("company_risk_indicator", "id"))


def target_ids() -> list[str]:
    return [f"C-{START_NO + i}" for i in range(COMPANY_COUNT)]


def reset(con) -> None:
    ids = target_ids()
    ph = ",".join("?" * len(ids))
    dec = con.execute(f"SELECT id FROM import_declarations WHERE company_id IN ({ph})", ids).fetchall()
    if dec:
        dl = [r[0] for r in dec]
        dph = ",".join("?" * len(dl))
        it = con.execute(f"SELECT item_id FROM import_declaration_items WHERE declaration_id IN ({dph})", dl).fetchall()
        if it:
            il = [r[0] for r in it]
            iph = ",".join("?" * len(il))
            con.execute(f"DELETE FROM import_declaration_item_specs WHERE item_id IN ({iph})", il)
            con.execute(f"DELETE FROM import_declaration_item_taxes WHERE item_id IN ({iph})", il)
        con.execute(f"DELETE FROM import_declaration_items WHERE declaration_id IN ({dph})", dl)
        con.execute(f"DELETE FROM import_declarations WHERE company_id IN ({ph})", ids)
    con.execute(f"DELETE FROM company_risk_indicator WHERE company_id IN ({ph})", ids)
    con.execute(f"DELETE FROM import_risk_scores WHERE company_id IN ({ph})", ids)
    con.execute(f"DELETE FROM company_profiles WHERE company_id IN ({ph})", ids)
    print(f"  기존 {ids[0]}~{ids[-1]} 데이터 삭제")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()

    rng = random.Random(SEED)
    con = duckdb.connect(args.db)
    if args.reset:
        reset(con)

    d_id, i_id, s_id, t_id, rs_id, ci_id = next_ids(con)
    cids = target_ids()

    # 지표별 고득점 기업 배정 (한 기업이 여러 지표에서 높을 수도 있게 독립 추첨)
    high_map = {c: set() for c in cids}
    for code, _, _, _, _ in [(i[0], i[1], i[2], i[3], i[4]) for i in INDICATORS]:
        for c in rng.sample(cids, HIGH_QUOTA[code]):
            high_map[c].add(code)

    companies, scores, indicators = [], [], []
    decls, items, specs, taxes = [], [], [], []

    for idx, cid in enumerate(cids):
        no = START_NO + idx
        cname = f"관세조사대상기업{no - 1000:03d}"
        region = rng.choice(REGIONS)
        item_plan = []
        for nm, hs in rng.sample(ITEM_POOL, rng.choice([3, 3, 4])):
            o = rng.choice(ORIGINS)
            item_plan.append({"name": nm, "hs": hs, "country": o[0], "cc": o[1], "port": o[2]})

        # ── 신고 생성 (지표 근거로 신고번호를 참조하므로 먼저 만든다) ──
        decl_nos, seq = [], 0
        for plan in item_plan:
            for _ in range(rng.randint(10, 14)):              # 품명별 10건 이상
                seq += 1
                d_id += 1
                i_id += 1
                dno = f"AU-{cid}-{seq:03d}"
                decl_nos.append(dno)
                imp_date = date(2026, 7, 21) - timedelta(days=rng.randint(1, 350))
                qty = rng.randint(300, 8000)
                unit = round(rng.uniform(1.5, 52.0), 2)
                usd = round(qty * unit, 2)
                krw = round(usd * 1330)
                duty = round(krw * rng.uniform(0.02, 0.08))
                vat = round((krw + duty) * 0.1)
                decls.append((
                    d_id, cid, dno, f"{plan['hs']}.0000", plan["name"], float(krw),
                    plan["country"], plan["country"], imp_date, "수리",
                    rng.choice(CUSTOMS_OFFICES), "수입", "B",
                    f"{rng.choice(BROKERS)} 담당자", "담당자", cname, None,
                    f"{rng.randint(10**14, 10**15-1)}", None, region, cname, None,
                    f"0{rng.randint(2,64)}-{rng.randint(200,999)}-{rng.randint(1000,9999)}",
                    f"trade{no}@audit.co.kr", f"{rng.randint(10**14, 10**15-1)}",
                    f"{rng.randint(100,899)}-{rng.randint(10,99)}-{rng.randint(10000,99999)}",
                    f"{plan['country']} TRADING CO.,LTD", plan["country"],
                    f"{plan['cc']}{rng.randint(100000,999999)}",
                    f"EINV{rng.randint(10**9, 10**10-1)}", f"BL{rng.randint(10**9, 10**10-1)}",
                    f"CC{rng.randint(10**9, 10**10-1)}", f"MBL{rng.randint(10**8, 10**9-1)}",
                    "글로벌포워딩", f"FW{rng.randint(1000,9999)}",
                    plan["country"], rng.choice(PORTS_KR), "해상",
                    f"MV {rng.choice(['PIONEER','HARMONY','ATLANTIC','ORIENT'])}",
                    plan["country"], f"CR{rng.randint(1000,9999)}",
                    imp_date, imp_date + timedelta(days=1), "보세창고",
                    float(qty * rng.uniform(0.9, 1.4)), "KG", rng.randint(5, 300), "PALLET",
                    "일반형태수입", "일반수입", "수리전", "Y", "N",
                    "CIF", "USD", float(usd), "T/T", 1330.0,
                    float(krw * 0.02), float(krw * 0.004), 0.0, 0.0,
                    float(usd), float(krw),
                    float(duty), 0.0, 0.0, 0.0, 0.0, 0.0, float(vat),
                    0.0, 0.0, float(duty + vat), float(krw + duty), 0.0,
                    plan["port"], None, None,
                    plan["hs"], "0000", "A", "1", "1", "N",
                    f"0{rng.randint(2,64)}-{rng.randint(200,999)}-{rng.randint(1000,9999)}",
                    f"broker{no}@customs.co.kr", "1", plan["cc"], plan["cc"], plan["cc"],
                    rng.choice(["서류심사", "생략", "물품검사"]),
                ))
                items.append((
                    i_id, d_id, 1, plan["name"], plan["name"], f"{plan['hs']}.0000", None,
                    None, None, float(qty * rng.uniform(0.9, 1.2)), "KG",
                    float(qty), "KG", 0.0, "KG", plan["country"], "WO",
                    "원산지표시대상", None, None, None, None, None, None,
                    float(usd), float(krw), 0.0, plan["hs"], "0000", "N", "종가세", plan["cc"],
                ))
                s_id += 1
                specs.append((s_id, i_id, 1, f"{plan['name']} 규격 {rng.choice('ABCD')}-{rng.randint(10,99)}",
                              None, float(qty), "KG", float(unit), float(usd), "USD"))
                for tt, amt, rate in (("관세", duty, 8.0), ("부가세", vat, 10.0)):
                    t_id += 1
                    taxes.append((t_id, i_id, 1, tt, "종가세", rate, 0.0, float(amt), None, 0.0, None))

        # ── 지표 산출 ──
        rates = {}
        for code, name, col, keys, recomm in INDICATORS:
            if code in high_map[cid]:
                score = round(rng.uniform(52, 97), 1)
            elif rng.random() < 0.35:
                score = round(rng.uniform(5, 34), 1)
            else:
                score = 0.0
            rates[col] = score
            ci_id += 1
            indicators.append((
                ci_id, cid, code, name, score,
                build_reason(rng, code, score),
                build_refs(rng, keys, score, decl_nos),
                recomm, None,
            ))

        risk = round(min(sum(rates.values()) / len(rates) * 1.15, 96.0), 1)
        level = "HIGH" if risk >= 70 else "MEDIUM" if risk >= 50 else "LOW"
        annual_import = rng.randint(60, 900) * 100_000_000
        companies.append((
            cid, cname, f"{rng.randint(100,899)}-{rng.randint(10,99)}-{rng.randint(10000,99999)}",
            rng.choice(INDUSTRIES), rng.randint(2000, 2021), level, risk,
            date(2026, rng.randint(1, 7), rng.randint(1, 28)), None, region, None,
            rng.randint(15, 480), ", ".join(sorted({p["country"] for p in item_plan})[:2]),
            rng.choice(BROKERS), None,
            float(annual_import * rng.uniform(1.3, 2.4)), float(annual_import),
            float(annual_import * rng.uniform(0.03, 0.07)),
            float(annual_import * rng.uniform(0.0, 0.02)), round(rng.uniform(0.0, 6.0), 1),
            "audit", "customs", "",
        ))
        rs_id += 1
        scores.append((
            rs_id, cid, level, risk,
            rates["undervaluation_suspicion_rate"], rates["related_party_anomaly_rate"],
            rates["fta_origin_misuse_suspicion_rate"], rates["customs_refund_anomaly_rate"],
            rates["hs_classification_error_rate"],
            rates["offshore_fund_concealment_suspicion_rate"], None,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        ))

    con.executemany(f"INSERT INTO company_profiles VALUES ({','.join('?'*23)})", companies)
    con.executemany(f"INSERT INTO import_risk_scores VALUES ({','.join('?'*20)})", scores)
    con.executemany(f"INSERT INTO company_risk_indicator VALUES ({','.join('?'*9)})", indicators)
    con.executemany(f"INSERT INTO import_declarations VALUES ({','.join('?'*92)})", decls)
    con.executemany(f"INSERT INTO import_declaration_items VALUES ({','.join('?'*32)})", items)
    con.executemany(f"INSERT INTO import_declaration_item_specs VALUES ({','.join('?'*10)})", specs)
    con.executemany(f"INSERT INTO import_declaration_item_taxes VALUES ({','.join('?'*11)})", taxes)

    print(f"  company_profiles: {len(companies)}개사 ({cids[0]}~{cids[-1]})")
    print(f"  import_risk_scores: {len(scores)}건")
    print(f"  company_risk_indicator: {len(indicators)}건")
    print(f"  import_declarations: {len(decls)}건")
    print(f"  specs/taxes: {len(specs)}/{len(taxes)}건")
    con.close()
    print("완료")


if __name__ == "__main__":
    main()
