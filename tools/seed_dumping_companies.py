"""덤핑관리 기업 30개사 + 수입신고 시드.

덤핑 규제 대상(국가 × 품목) 목록은 data/dumping_regulation_source.json 에서 읽는다
(수입규제DB PDF에서 추출). 규제 조합과 일치하는 원산지·품목의 신고가 있으면
덤핑 대시보드의 감시 대상이 된다.

생성 규칙
- 기업 30개사(C-3001~C-3030), primary_domain='dumping', entity_role='dumping', crime_types='덤핑'
- 기업마다 품목 3~4종을 수입하고 그중 1~2종이 덤핑 규제 품목
  (덤핑 품목은 규제국을 원산지로, 비규제 품목은 규제 목록에 없는 국가를 원산지로 둔다)
- 품목별 수입신고 10~14건 → 기업당 30~50건
- 4-테이블 스키마(헤더/품목/규격/세목)를 모두 채운다

실행: python tools/seed_dumping_companies.py [--db data/customs.duckdb] [--reset]
반복 실행 시 --reset 으로 기존 C-30xx 데이터를 지우고 다시 만든다.
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
REG_SOURCE = ROOT / "data" / "dumping_regulation_source.json"

COMPANY_COUNT = 30
ID_PREFIX = "C-30"
SEED = 20260721

# 규제국명 → (국가코드, 대표 출항항)
COUNTRY_META = {
    "미국": ("US", "LOS ANGELES"), "인도": ("IN", "NHAVA SHEVA"), "캐나다": ("CA", "VANCOUVER"),
    "중국": ("CN", "SHANGHAI"), "튀르키예": ("TR", "ISTANBUL"), "태국": ("TH", "LAEM CHABANG"),
    "EU": ("EU", "ROTTERDAM"), "파키스탄": ("PK", "KARACHI"), "호주": ("AU", "SYDNEY"),
    "브라질": ("BR", "SANTOS"), "대만": ("TW", "KAOHSIUNG"), "멕시코": ("MX", "MANZANILLO"),
    "말레이시아": ("MY", "PORT KLANG"), "일본": ("JP", "TOKYO"), "베트남": ("VN", "HAI PHONG"),
    "GCC": ("AE", "JEBEL ALI"), "사우디아라비아": ("SA", "DAMMAM"), "뉴질랜드": ("NZ", "AUCKLAND"),
    "인도네시아": ("ID", "TANJUNG PRIOK"), "남아프리카공화국": ("ZA", "DURBAN"),
}
# 덤핑 규제 목록에 없는 정상 수입국 — 비규제 품목의 원산지로 쓴다
CLEAN_COUNTRIES = [("독일", "DE", "HAMBURG"), ("프랑스", "FR", "LE HAVRE"),
                   ("이탈리아", "IT", "GENOA"), ("스페인", "ES", "VALENCIA"),
                   ("싱가포르", "SG", "SINGAPORE"), ("네덜란드", "NL", "ROTTERDAM")]

# 비규제(정상) 품목 — HS 6단위와 함께
CLEAN_ITEMS = [
    ("산업용 베어링", "8482.10"), ("공작기계 부품", "8466.93"), ("전동기", "8501.31"),
    ("절연전선", "8544.49"), ("합성고무 패킹", "4016.93"), ("알루미늄 프로파일", "7604.21"),
    ("공업용 필터", "8421.39"), ("유압 실린더", "8412.21"), ("산업용 펌프", "8413.70"),
    ("계측기 부품", "9026.90"), ("포장용 필름", "3920.20"), ("접착제", "3506.91"),
]

# 덤핑 규제 품목 키워드 → HS 6단위(대표값). 매칭 실패 시 기타 화학·철강으로 폴백.
HS_BY_KEYWORD = [
    ("전기강판", "7225.11"), ("열연", "7208.51"), ("냉연", "7209.16"), ("도금강판", "7210.49"),
    ("컬러강판", "7210.70"), ("아연도금", "7210.49"), ("석도강판", "7210.12"), ("주석도금", "7210.11"),
    ("후판", "7208.51"), ("강관", "7304.29"), ("강선", "7217.10"), ("선재", "7213.91"),
    ("철근", "7214.20"), ("스테인리스", "7219.33"), ("강철 못", "7317.00"), ("구조물", "7308.90"),
    ("황동봉", "7407.21"), ("동관", "7411.10"), ("동제관연결구", "7412.20"), ("인동", "7405.00"),
    ("페로바나듐", "7202.92"), ("변압기", "8504.23"), ("풍력타워", "7308.20"),
    ("광섬유", "9001.10"), ("임플란트", "9021.29"), ("타이어", "4011.20"),
    ("에폭시", "3907.30"), ("레진", "3907.30"), ("수지", "3907.99"), ("폴리스티렌", "3903.19"),
    ("ABS", "3903.30"), ("PVC", "3904.10"), ("폴리염화비닐", "3904.10"), ("폴리아세탈", "3907.10"),
    ("PET", "3907.61"), ("테레프탈레이트", "3907.61"), ("테레프탈산", "2917.36"),
    ("고무", "4002.19"), ("폴리실리콘", "2804.61"), ("실리카", "2811.22"),
    ("아세톤", "2914.11"), ("페놀", "2907.11"), ("스티렌", "2902.50"), ("가소제", "2917.39"),
    ("시안화나트륨", "2837.11"), ("과산화수소", "2847.00"), ("탄산칼륨", "2836.40"),
    ("에피클로로히드린", "2910.30"), ("TDI", "2929.10"), ("헥사놀", "2905.16"),
    ("차아황산소다", "2831.10"), ("설폰산", "2904.10"), ("무수프탈산", "2917.35"),
    ("우르소데옥시콜산", "2918.19"), ("단량체", "3911.90"), ("올리고머", "3911.90"),
    ("감열지", "4809.90"), ("직물", "5903.10"), ("폴리에스터", "5503.20"), ("나일론", "5402.31"),
    ("필라멘트", "5402.47"), ("금속드리사", "5605.00"), ("고흡수성", "3906.90"), ("고용성수지", "3906.90"),
    ("인쇄용 판", "3701.30"), ("굴착기", "8431.49"), ("절삭 장비", "8207.13"),
]
FALLBACK_HS = "3824.99"

INDUSTRIES = ["C24", "C20", "C22", "G46", "C25", "C26"]
REGIONS = [("서울", "강남구 테헤란로"), ("인천", "연수구 송도과학로"), ("경기", "화성시 동탄산단로"),
           ("부산", "강서구 녹산산단로"), ("경남", "창원시 성산구 공단로"), ("충남", "천안시 서북구 직산로"),
           ("전남", "여수시 여수산단로"), ("울산", "남구 산업로")]
BROKERS = ["대성관세법인", "한울관세사무소", "정민관세사무소", "케이씨관세법인", "동방관세법인"]
PORTS_KR = ["인천항", "부산항", "평택항", "광양항", "울산항"]
CUSTOMS_OFFICES = ["030", "040", "050", "020", "010"]


def hs_for(item_name: str) -> str:
    for kw, hs in HS_BY_KEYWORD:
        if kw in item_name:
            return hs
    return FALLBACK_HS


def load_regulations() -> list[dict]:
    if not REG_SOURCE.exists():
        raise SystemExit(f"규제 목록이 없습니다: {REG_SOURCE}\n"
                         "수입규제DB PDF에서 먼저 추출하세요.")
    regs = json.loads(REG_SOURCE.read_text(encoding="utf-8"))
    out = []
    for r in regs:
        country = r["country"]
        if country not in COUNTRY_META:
            continue
        name = r["name_ko"].strip()
        if not name:
            continue
        out.append({"country": country, "item": name, "hs": hs_for(name),
                    "name_ko": name, "name_en": r.get("name_en", "")})
    return out


def ensure_schema(con) -> None:
    """덤핑 규제 참조 테이블 — 대시보드가 신고건과 대조할 기준 데이터."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS dumping_regulation (
            reg_id            VARCHAR PRIMARY KEY,
            regulating_country VARCHAR,
            country_code      VARCHAR,
            item_name_ko      VARCHAR,
            item_name_en      VARCHAR,
            global_hs         VARCHAR,
            source            VARCHAR,
            registered_at     DATE
        )
    """)


def seed_regulations(con, regs_raw: list[dict]) -> None:
    con.execute("DELETE FROM dumping_regulation")
    rows = []
    for i, r in enumerate(regs_raw, 1):
        code = COUNTRY_META.get(r["country"], ("XX", ""))[0]
        rows.append((f"DR-{i:04d}", r["country"], code, r["name_ko"], r.get("name_en", ""),
                     hs_for(r["name_ko"]), "수입규제DB 2026-07-21", date(2026, 7, 21)))
    con.executemany(
        "INSERT INTO dumping_regulation VALUES (?,?,?,?,?,?,?,?)", rows)
    print(f"  dumping_regulation: {len(rows)}건")


def next_ids(con) -> tuple[int, int, int, int]:
    def mx(table, col):
        v = con.execute(f"SELECT COALESCE(MAX({col}),0) FROM {table}").fetchone()[0]
        return int(v)
    return (mx("import_declarations", "id"), mx("import_declaration_items", "item_id"),
            mx("import_declaration_item_specs", "spec_id"),
            mx("import_declaration_item_taxes", "tax_id"))


def reset(con) -> None:
    ids = con.execute(
        f"SELECT id FROM import_declarations WHERE company_id LIKE '{ID_PREFIX}%'").fetchall()
    if ids:
        idl = [r[0] for r in ids]
        items = con.execute(
            "SELECT item_id FROM import_declaration_items WHERE declaration_id IN "
            f"({','.join('?'*len(idl))})", idl).fetchall()
        if items:
            iid = [r[0] for r in items]
            ph = ",".join("?" * len(iid))
            con.execute(f"DELETE FROM import_declaration_item_specs WHERE item_id IN ({ph})", iid)
            con.execute(f"DELETE FROM import_declaration_item_taxes WHERE item_id IN ({ph})", iid)
        con.execute("DELETE FROM import_declaration_items WHERE declaration_id IN "
                    f"({','.join('?'*len(idl))})", idl)
        con.execute(f"DELETE FROM import_declarations WHERE company_id LIKE '{ID_PREFIX}%'")
    con.execute(f"DELETE FROM import_risk_scores WHERE company_id LIKE '{ID_PREFIX}%'")
    con.execute(f"DELETE FROM company_profiles WHERE company_id LIKE '{ID_PREFIX}%'")
    print(f"  기존 {ID_PREFIX}xx 데이터 삭제")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--reset", action="store_true", help="기존 C-30xx 데이터 삭제 후 재생성")
    args = ap.parse_args()

    rng = random.Random(SEED)
    regs = load_regulations()
    print(f"덤핑 규제 조합 {len(regs)}건 로드")

    con = duckdb.connect(args.db)
    ensure_schema(con)
    seed_regulations(con, regs)
    if args.reset:
        reset(con)

    d_id, i_id, s_id, t_id = next_ids(con)
    companies, scores = [], []
    decls, items, specs, taxes = [], [], [], []

    for n in range(1, COMPANY_COUNT + 1):
        cid = f"{ID_PREFIX}{n:02d}"
        cname = f"덤핑관리기업{n:03d}"
        region, street = rng.choice(REGIONS)
        dump_cnt = rng.choice([1, 1, 2])                    # 덤핑 품목 1~2종
        total_items = rng.choice([3, 3, 4])                 # 전체 품목 3~4종
        picked = rng.sample(regs, dump_cnt)
        clean = rng.sample(CLEAN_ITEMS, total_items - dump_cnt)

        item_plan = [{"name": r["item"], "hs": r["hs"], "country": r["country"],
                      "dumping": True} for r in picked]
        for nm, hs in clean:
            c = rng.choice(CLEAN_COUNTRIES)
            item_plan.append({"name": nm, "hs": hs, "country": c[0], "dumping": False})
        rng.shuffle(item_plan)

        annual_import = rng.randint(80, 640) * 100_000_000
        # 덤핑 비중이 높을수록 위험도 상승 — 규제품목 수 기준
        risk = round(52 + dump_cnt * 9 + rng.uniform(-4, 8), 1)
        level = "HIGH" if risk >= 70 else "MEDIUM" if risk >= 50 else "LOW"
        companies.append((
            cid, cname, f"{rng.randint(100,899)}-{rng.randint(10,99)}-{rng.randint(10000,99999)}",
            rng.choice(INDUSTRIES), rng.randint(1998, 2020), level, risk,
            date(2026, rng.randint(1, 7), rng.randint(1, 28)), f"{rng.randint(10000,63000)}",
            region, f"{street} {rng.randint(1,300)}", rng.randint(18, 320),
            ",".join(sorted({p["country"] for p in item_plan})),
            rng.choice(BROKERS), None,
            float(annual_import * rng.uniform(1.3, 2.2)), float(annual_import),
            float(annual_import * rng.uniform(0.02, 0.06)), 0.0, 0.0,
            "dumping", "dumping", "덤핑",
        ))
        scores.append((
            None, cid, level, risk,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, None,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        ))

        seq = 0
        for plan in item_plan:
            cc, port = (COUNTRY_META.get(plan["country"])
                        or next((c[1], c[2]) for c in CLEAN_COUNTRIES if c[0] == plan["country"]))
            n_decl = rng.randint(10, 14)                    # 품명별 신고 10건 이상
            for _ in range(n_decl):
                seq += 1
                d_id += 1
                i_id += 1
                imp_date = date(2026, 7, 21) - timedelta(days=rng.randint(1, 330))
                qty = rng.randint(400, 9000)
                unit = round(rng.uniform(1.2, 46.0), 2)
                # 덤핑 품목은 정상가 대비 낮은 단가로 신고(덤핑 마진 시뮬레이션)
                if plan["dumping"]:
                    unit = round(unit * rng.uniform(0.58, 0.82), 2)
                usd = round(qty * unit, 2)
                krw = round(usd * 1330)
                duty = round(krw * rng.uniform(0.03, 0.08))
                vat = round((krw + duty) * 0.1)
                dno = f"DP-{cid}-{seq:03d}"
                decls.append((
                    d_id, cid, dno, f"{plan['hs']}.0000", plan["name"], float(krw),
                    plan["country"], plan["country"], imp_date, "수리",
                    rng.choice(CUSTOMS_OFFICES), "수입", "B",
                    f"{rng.choice(BROKERS)} 담당자", "담당자", cname, None,
                    f"{rng.randint(100000000000000, 999999999999999)}", None, region, cname, None,
                    f"0{rng.randint(2,64)}-{rng.randint(200,999)}-{rng.randint(1000,9999)}",
                    f"trade{n:03d}@dumping.co.kr",
                    f"{rng.randint(100000000000000, 999999999999999)}",
                    f"{rng.randint(100,899)}-{rng.randint(10,99)}-{rng.randint(10000,99999)}",
                    f"{plan['country']} STEEL&CHEM CO.,LTD", plan["country"],
                    f"{cc}{rng.randint(100000,999999)}",
                    f"EINV{rng.randint(10**9, 10**10-1)}",
                    f"BL{rng.randint(10**9, 10**10-1)}",
                    f"CC{rng.randint(10**9, 10**10-1)}",
                    f"MBL{rng.randint(10**8, 10**9-1)}",
                    "글로벌포워딩", f"FW{rng.randint(1000,9999)}",
                    plan["country"], rng.choice(PORTS_KR), "해상",
                    f"MV {rng.choice(['PIONEER','HARMONY','ATLANTIC','ORIENT'])}",
                    plan["country"], f"CR{rng.randint(1000,9999)}",
                    imp_date, imp_date + timedelta(days=1), "보세창고",
                    float(qty * rng.uniform(0.9, 1.4)), "KG", rng.randint(10, 400), "PALLET",
                    "일반형태수입", "일반수입", "수리전", "Y", "N",
                    "CIF", "USD", float(usd), "T/T", 1330.0,
                    float(krw * 0.02), float(krw * 0.004), 0.0, 0.0,
                    float(usd), float(krw),
                    float(duty), 0.0, 0.0, 0.0, 0.0, 0.0, float(vat),
                    0.0, 0.0, float(duty + vat), float(krw + duty), 0.0,
                    port, None,
                    "dumping" if plan["dumping"] else None,
                    plan["hs"], "0000", "A", "1", "1", "N",
                    f"0{rng.randint(2,64)}-{rng.randint(200,999)}-{rng.randint(1000,9999)}",
                    f"broker{n:03d}@customs.co.kr", "1", cc, cc, cc,
                    rng.choice(["서류심사", "생략", "물품검사"]),
                ))
                items.append((
                    i_id, d_id, 1, plan["name"], plan["name"], f"{plan['hs']}.0000", None,
                    None, None, float(qty * rng.uniform(0.9, 1.2)), "KG",
                    float(qty), "KG", 0.0, "KG", plan["country"], "WO",
                    "원산지표시대상", None, None, None, None, None, None,
                    float(usd), float(krw), 0.0, plan["hs"], "0000", "N",
                    "종가세", cc,
                ))
                s_id += 1
                specs.append((s_id, i_id, 1, f"{plan['name']} 규격 {rng.choice('ABCD')}-{rng.randint(10,99)}",
                              None, float(qty), "KG", float(unit), float(usd), "USD"))
                for tt, amt, rate in (("관세", duty, 8.0), ("부가세", vat, 10.0)):
                    t_id += 1
                    taxes.append((t_id, i_id, 1, tt, "종가세", rate, 0.0, float(amt), None, 0.0, None))

    con.executemany(f"INSERT INTO company_profiles VALUES ({','.join('?'*23)})", companies)
    max_score_id = con.execute("SELECT COALESCE(MAX(id),0) FROM import_risk_scores").fetchone()[0]
    scores = [(max_score_id + k + 1, *s[1:]) for k, s in enumerate(scores)]
    con.executemany(f"INSERT INTO import_risk_scores VALUES ({','.join('?'*20)})", scores)
    con.executemany(f"INSERT INTO import_declarations VALUES ({','.join('?'*92)})", decls)
    con.executemany(f"INSERT INTO import_declaration_items VALUES ({','.join('?'*32)})", items)
    con.executemany(f"INSERT INTO import_declaration_item_specs VALUES ({','.join('?'*10)})", specs)
    con.executemany(f"INSERT INTO import_declaration_item_taxes VALUES ({','.join('?'*11)})", taxes)

    print(f"  company_profiles: {len(companies)}개사")
    print(f"  import_declarations: {len(decls)}건")
    print(f"  import_declaration_items: {len(items)}건")
    print(f"  specs/taxes: {len(specs)}/{len(taxes)}건")
    con.close()
    print("완료")


if __name__ == "__main__":
    main()
