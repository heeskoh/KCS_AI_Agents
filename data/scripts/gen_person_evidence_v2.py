"""[Phase 2b·개인] 개인 위험지표 근거 생성 (죄종 기반·cases 비의존·전면 재생성).

신모델 마스터(primary_domain·crime_types)에서 직접 개인 근거를 생성한다. 기존 generate_
person_risk_profiles 는 cases(사건) 의존 + forex 제외라 신모델과 맞지 않아 대체한다.

도메인 매핑(엔진 도메인): customs→general, drug→drug, forex→forex.
죄종→강(强) 지표 매핑으로 관련 지표만 높게 산출되도록 근거 분량/가중치를 조절한다.
지표 산출(2계층)은 Phase 3에서 수행한다. 본 단계는 근거 테이블만 채운다.

사용법: python data/scripts/gen_person_evidence_v2.py
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"
SEED_BATCH_ID = "risk-model-v2"
REF = date(2026, 6, 15)

EVIDENCE_TABLES = [
    "person_route_event", "person_seizure_record", "person_concealment_event",
    "person_identity_flag", "person_laundering_link", "person_network_link",
    "person_fx_transaction", "person_asset_flight", "person_offshore_link",
    "person_virtual_asset_flow", "person_activity_record",
]
ENGINE_DOMAIN = {"customs": "general", "drug": "drug", "forex": "forex"}

# 죄종 → 강 지표
CRIME_STRONG = {
    "관세포탈": ["general_identity", "general_route"],
    "밀수": ["general_route", "general_small_batch", "general_prior_record"],
    "원산지위반": ["general_route", "general_identity"],
    "지식재산침해": ["general_small_batch", "general_concealment"],
    "전략물자": ["general_concealment", "general_network"],
    "마약밀수입": ["drug_route", "drug_small_batch", "drug_concealment"],
    "마약자금세탁": ["drug_laundering", "drug_network"],
    "신종마약유통": ["drug_new_substance", "drug_network"],
    "외환불법거래": ["fx_remittance", "fx_structuring"],
    "외환자금세탁": ["fx_offshore", "fx_virtual_asset", "fx_structuring"],
    "환치기": ["fx_hawala", "fx_structuring"],
    "재산국외도피": ["fx_asset_flight", "fx_offshore"],
}
HAVENS = ["BVI", "케이맨", "파나마", "홍콩", "싱가포르"]
COUNTRIES = ["태국", "베트남", "중국", "미국", "네덜란드", "멕시코", "필리핀"]
REGIONS = ["서울", "인천", "부산", "경기", "대구", "광주"]


def _d(rng, lo=20, hi=700):
    return (REF - timedelta(days=rng.randint(lo, hi))).isoformat()


def _n(strong: bool, rng, lo_s=4, hi_s=7, lo_w=0, hi_w=2) -> int:
    return rng.randint(lo_s, hi_s) if strong else rng.randint(lo_w, hi_w)


class Ids:
    def __init__(self): self.c = {}
    def nx(self, t): self.c[t] = self.c.get(t, 0) + 1; return self.c[t]


def gen_for_person(person, all_ids_by_domain, rng, ids, acc):
    pid = person["person_id"]
    domain = person["primary_domain"]
    edom = ENGINE_DOMAIN[domain]
    crimes = [c for c in str(person["crime_types"] or "").split(",") if c]
    strong = set()
    for c in crimes:
        strong.update(CRIME_STRONG.get(c, []))

    def S(code):  # 해당 지표가 강한가
        return code in strong

    # ── 관계망(general/drug 공통): 우범자 known-offender 링크 ──
    if edom in ("general", "drug"):
        net_strong = S(f"{edom}_network")
        peers = [q for q in all_ids_by_domain.get(domain, []) if q != pid]
        for _ in range(_n(net_strong, rng, 3, 5, 1, 2)):
            if not peers:
                break
            cp = rng.choice(peers)
            acc["person_network_link"].append({
                "id": ids.nx("person_network_link"), "person_id": pid, "counterpart_id": cp,
                "counterpart_name": cp, "relation_type": rng.choice(["공범", "동일조직", "거래", "가족"]),
                "is_known_offender": True, "strength": round(rng.uniform(0.6, 0.95) if net_strong else rng.uniform(0.2, 0.5), 2),
                "note": None,
            })

    if edom == "drug":
        # 경로
        for _ in range(_n(S("drug_route"), rng)):
            acc["person_route_event"].append({
                "id": ids.nx("person_route_event"), "person_id": pid, "route_date": _d(rng),
                "origin_country": rng.choice(["태국", "베트남", "네덜란드", "필리핀", "멕시코"]),
                "transit_country": rng.choice(["홍콩", "없음", "말레이시아"]), "dest_region": rng.choice(REGIONS),
                "channel": rng.choice(["국제우편", "특송화물", "공항 여행자"]), "is_drug_route": True,
                "risk_weight": round(rng.uniform(70, 95) if S("drug_route") else rng.uniform(20, 45), 1), "note": None,
            })
        # 압수: 소량반복(drug_small_batch) + 신종(drug_new_substance)
        n_seiz = max(_n(S("drug_small_batch"), rng), _n(S("drug_new_substance"), rng), 1)
        for _ in range(n_seiz):
            new = S("drug_new_substance") and rng.random() < 0.7
            acc["person_seizure_record"].append({
                "id": ids.nx("person_seizure_record"), "person_id": pid, "seizure_date": _d(rng),
                "contraband_category": "마약류",
                "contraband_sub": rng.choice(["케타민", "합성대마", "MDMA"]) if new else rng.choice(["필로폰", "대마"]),
                "quantity": round(rng.uniform(5, 200), 1), "quantity_unit": "g",
                "batch_no": f"B-{ids.c['person_seizure_record']:04d}",
                "is_small_batch": S("drug_small_batch"), "is_new_substance": new,
                "harm_weight": round(rng.uniform(70, 95) if new else rng.uniform(20, 50), 1),
                "case_status": rng.choice(["송치", "처분", "수사중"]), "note": None,
            })
        # 은닉
        for _ in range(_n(S("drug_concealment"), rng)):
            acc["person_concealment_event"].append({
                "id": ids.nx("person_concealment_event"), "person_id": pid, "event_date": _d(rng),
                "method": rng.choice(["인체은닉", "이중바닥", "전자제품 내부", "식품 위장"]),
                "sophistication_score": round(rng.uniform(70, 95) if S("drug_concealment") else rng.uniform(20, 45), 1), "note": None,
            })
        # 자금세탁
        for _ in range(_n(S("drug_laundering"), rng, 2, 3, 0, 1)):
            acc["person_laundering_link"].append({
                "id": ids.nx("person_laundering_link"), "person_id": pid, "link_date": _d(rng),
                "scheme": rng.choice(["차명계좌", "가상자산", "현금다발", "분산송금"]),
                "amount": round(rng.uniform(2e8, 3e9)), "linked_case": None, "note": "마약수익 추정", })

    elif edom == "general":
        for _ in range(_n(S("general_route"), rng)):
            acc["person_route_event"].append({
                "id": ids.nx("person_route_event"), "person_id": pid, "route_date": _d(rng),
                "origin_country": rng.choice(COUNTRIES), "transit_country": rng.choice(["홍콩", "없음"]),
                "dest_region": rng.choice(REGIONS), "channel": rng.choice(["항만 컨테이너", "특송화물", "국제우편"]),
                "is_drug_route": False,
                "risk_weight": round(rng.uniform(65, 90) if S("general_route") else rng.uniform(20, 45), 1), "note": None,
            })
        n_seiz = max(_n(S("general_small_batch"), rng), _n(S("general_prior_record"), rng), 1)
        sub_by_crime = {"밀수": ("밀수품", "고가 잡화"), "지식재산침해": ("위조상품", "위조 브랜드"),
                        "전략물자": ("전략물자", "이중용도 부품"), "관세포탈": ("일반화물", "저가신고품"),
                        "원산지위반": ("우회수입품", "원산지 세탁")}
        cat, sub = next((sub_by_crime[c] for c in crimes if c in sub_by_crime), ("밀수품", "기타"))
        for _ in range(n_seiz):
            acc["person_seizure_record"].append({
                "id": ids.nx("person_seizure_record"), "person_id": pid, "seizure_date": _d(rng),
                "contraband_category": cat, "contraband_sub": sub,
                "quantity": round(rng.uniform(10, 500), 1), "quantity_unit": "EA",
                "batch_no": f"B-{ids.c['person_seizure_record']:04d}",
                "is_small_batch": S("general_small_batch"), "is_new_substance": False, "harm_weight": 0.0,
                "case_status": rng.choice(["송치", "처분"]) if S("general_prior_record") else "수사중", "note": None,
            })
        for _ in range(_n(S("general_concealment"), rng)):
            acc["person_concealment_event"].append({
                "id": ids.nx("person_concealment_event"), "person_id": pid, "event_date": _d(rng),
                "method": rng.choice(["품명위장", "이중송장", "원산지 세탁", "분할반입"]),
                "sophistication_score": round(rng.uniform(65, 90) if S("general_concealment") else rng.uniform(20, 45), 1), "note": None,
            })
        for _ in range(_n(S("general_identity"), rng, 2, 4, 0, 1)):
            acc["person_identity_flag"].append({
                "id": ids.nx("person_identity_flag"), "person_id": pid, "flag_date": _d(rng),
                "flag_type": rng.choice(["명의대여", "허위신고", "실수입자 위장"]),
                "detail": "명의/신고 위장 정황", })

    elif edom == "forex":
        # 송금/환치기/구조화 → person_fx_transaction
        # 송금/환치기/구조화는 모두 person_fx_transaction 을 읽으므로 하나라도 강이면 거래를 충분히 생성
        fx_txn_strong = S("fx_remittance") or S("fx_hawala") or S("fx_structuring")
        n_remit = _n(fx_txn_strong, rng, 5, 9, 1, 2)
        for _ in range(n_remit):
            haw = S("fx_hawala") and rng.random() < 0.85
            struct = S("fx_structuring") and rng.random() < 0.8
            nominee = S("fx_structuring") and rng.random() < 0.6
            acc["person_fx_transaction"].append({
                "id": ids.nx("person_fx_transaction"), "person_id": pid, "txn_date": _d(rng),
                "amount": round(rng.uniform(5e8, 8e9)), "direction": "송금",
                "channel": rng.choice(["은행", "환전상", "무등록송금"]),
                "counterpart_country": rng.choice(HAVENS + ["미국", "중국"]),
                "counterpart_name": f"해외상대{rng.randint(1,9)}",
                "is_structured": struct, "is_nominee": nominee, "is_hawala": haw, "note": None,
            })
        for _ in range(_n(S("fx_asset_flight"), rng, 2, 4, 0, 1)):
            acc["person_asset_flight"].append({
                "id": ids.nx("person_asset_flight"), "person_id": pid, "event_date": _d(rng),
                "asset_type": rng.choice(["부동산", "예금", "주식", "귀금속"]),
                "amount": round(rng.uniform(2e9, 5e10)), "dest_country": rng.choice(HAVENS + ["미국"]),
                "method": rng.choice(["가장무역대금", "차명계좌", "허위투자"]), "note": None, })
        for _ in range(_n(S("fx_offshore"), rng, 2, 3, 0, 1)):
            acc["person_offshore_link"].append({
                "id": ids.nx("person_offshore_link"), "person_id": pid,
                "entity_name": f"{pid[-4:]} {rng.choice(HAVENS)} Ltd", "jurisdiction": rng.choice(HAVENS),
                "is_paper": S("fx_offshore"), "ownership_pct": round(rng.uniform(50, 100), 1), "note": None, })
        for _ in range(_n(S("fx_virtual_asset"), rng, 3, 5, 0, 1)):
            acc["person_virtual_asset_flow"].append({
                "id": ids.nx("person_virtual_asset_flow"), "person_id": pid, "txn_date": _d(rng),
                "asset": rng.choice(["BTC", "USDT", "ETH"]), "amount_krw": round(rng.uniform(1e8, 3e9)),
                "wallet": f"0x{ids.c['person_virtual_asset_flow']:06x}", "exchange": rng.choice(["해외거래소", "P2P", "믹서"]),
                "dest_country": rng.choice(HAVENS), "note": None, })


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        persons = con.execute(
            "SELECT person_id, primary_domain, crime_types FROM risk_person_profile ORDER BY person_id"
        ).df().to_dict("records")
        by_domain = {}
        for p in persons:
            by_domain.setdefault(p["primary_domain"], []).append(p["person_id"])

        for t in EVIDENCE_TABLES:
            con.execute(f"DELETE FROM {t}")

        ids = Ids()
        acc = {t: [] for t in EVIDENCE_TABLES}
        for p in persons:
            rng = random.Random((hash(p["person_id"]) ^ 0x1234) & 0xFFFFFFFF)
            gen_for_person(p, by_domain, rng, ids, acc)

        for t, rows in acc.items():
            if not rows:
                continue
            cols = list(rows[0].keys())
            ph = ", ".join("?" * len(cols))
            con.executemany(f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({ph})",
                            [[r.get(c) for c in cols] for r in rows])

        stats = {t: len(rows) for t, rows in acc.items() if rows}
        # 발화 사전검증: pri 로 도메인별 강 지표 점수 샘플
        sys.path.insert(0, str(PROJECT_ROOT))
        from src import person_risk_indicators as pri
        def sample(pid):
            p = next(x for x in persons if x["person_id"] == pid)
            edom = ENGINE_DOMAIN[p["primary_domain"]]
            ctx = {t: [r for r in acc[t] if r.get("person_id") == pid] for t in EVIDENCE_TABLES}
            res = pri.compute_person_indicators(edom, ctx)
            return {c: round(res[c].score) for c in pri.DOMAIN_ORDER[edom]}
    print("[Phase 2b·개인] 근거 생성 완료")
    for t, n in stats.items():
        print(f"  {t}: {n}")
    print("  표본 RP-0001(drug):", sample("RP-0001"))
    print("  표본 RP-0035(customs→general):", sample("RP-0035"))
    print("  표본 RP-FX-0001(forex):", sample("RP-FX-0001"))


if __name__ == "__main__":
    main()
