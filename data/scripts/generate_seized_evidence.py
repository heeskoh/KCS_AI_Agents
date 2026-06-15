"""위험인물(RP-xxxx)별 압수정보(통신/금융거래) 샘플 파일 생성.

data/communication_record_schema.json, data/financial_transaction_schema.json
에 정의된 표준 스키마를 따라, 각 인물 폴더 아래에
  data/evidence/<PERSON_ID>/communication_record.json
  data/evidence/<PERSON_ID>/financial_transaction_record.json
를 생성한다.

레코드는 person_activity_record(사건 연계 활동 / 거래 급증 패턴)와
network_edge(인물-인물, 인물-기업 관계)를 근거로 구성한다.
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "customs.duckdb"
EVIDENCE_DIR = ROOT / "data" / "evidence"

# 해외 국가 -> (전화번호 접두, 은행명, 국가코드)
COUNTRY_PREFIX = {
    "미국": ("+1-202", "US Sample Bank", "US"),
    "네덜란드": ("+31-6", "NL Sample Bank", "NL"),
    "태국": ("+66-8", "TH Sample Bank", "TH"),
    "필리핀": ("+63-9", "PH Sample Bank", "PH"),
    "중국": ("+86-138", "CN Sample Bank", "CN"),
    "멕시코": ("+52-55", "MX Sample Bank", "MX"),
    "말레이시아": ("+60-1", "MY Sample Bank", "MY"),
    "베트남": ("+84-90", "VN Sample Bank", "VN"),
}

EXTRACTION_DATE_OBJ = datetime(2026, 6, 16).date()

DEVICE_MODELS = [
    ("스마트폰", "Galaxy S22"),
    ("스마트폰", "Galaxy S23"),
    ("스마트폰", "iPhone 14"),
    ("스마트폰", "iPhone 15"),
    ("스마트폰", "Galaxy A54"),
]
EXTRACTION_TOOLS = ["Cellebrite UFED", "Magnet AXIOM", "Oxygen Forensic Detective"]
FOREIGN_APPS = ["WhatsApp", "WeChat", "Instagram DM", "Telegram"]
DOMESTIC_APPS = ["카카오톡", "텔레그램"]

DOMESTIC_MESSAGES = [
    "오늘 보낸 거 확인되면 바로 연락줘",
    "확인했음. 다음 건도 같은 방식으로",
    "물건 발송했어, 송장번호 따로 보낼게",
    "이번엔 좀 더 큰 건이라 시간 걸릴듯",
    "받았어. 결제 넣어둘게",
    "이번 건도 잘 처리됐어, 다음 주에 또 보자",
]
FOREIGN_MESSAGES = [
    "Package will ship soon, tracking to follow.",
    "received, thanks",
    "confirmed, will arrange next batch",
    "please check the address again",
]

SEIZED_DATE = "2026-06-15"
EXTRACTION_DATE = "2026-06-16"


def num_suffix(person_id: str) -> int:
    return int(person_id.split("-")[1])


def masked_phone_for_person(person_id: str) -> str:
    return f"010-****-{2000 + num_suffix(person_id):04d}"


def masked_account_for_person(person_id: str) -> str:
    n = num_suffix(person_id)
    return f"302-***-{100000 + n * 111:06d}"


def masked_account_for_self(person_id: str) -> str:
    n = num_suffix(person_id)
    return f"110-***-{200000 + n * 137:06d}"


def fetch_persons(conn):
    return conn.execute(
        "SELECT person_id, name FROM risk_person_profile ORDER BY person_id"
    ).fetchall()


def fetch_case_activity(conn, pid):
    return conn.execute(
        """
        SELECT activity_date, direction, counterpart_country, item_name,
               amount, linked_case_id
        FROM person_activity_record
        WHERE person_id=? AND is_case_related=true
        ORDER BY activity_date
        """,
        [pid],
    ).fetchall()


def fetch_burst_activity(conn, pid):
    return conn.execute(
        """
        SELECT activity_date, direction, counterpart_person_id, item_name, amount
        FROM person_activity_record
        WHERE person_id=? AND counterpart_person_id IS NOT NULL
        ORDER BY activity_date
        """,
        [pid],
    ).fetchall()


def fetch_org_edge(conn, pid):
    return conn.execute(
        """
        SELECT ro.org_id, ne.relation_type, ro.org_name, ro.country
        FROM network_edge ne
        JOIN risk_org_profile ro ON ro.org_id = ne.target_id
        WHERE ne.source_id=? AND ne.target_type='org'
        LIMIT 1
        """,
        [pid],
    ).fetchone()


def fetch_top_person_edge(conn, pid, exclude_id=None):
    rows = conn.execute(
        """
        SELECT target_id, relation_type, weight
        FROM network_edge
        WHERE source_id=? AND target_type='person'
        ORDER BY weight DESC
        """,
        [pid],
    ).fetchall()
    for target_id, relation_type, weight in rows:
        if target_id != exclude_id:
            return target_id, relation_type, weight
    return None


def build_communication_record(conn, pid, name, names, rng):
    device_type, model = DEVICE_MODELS[rng.randrange(len(DEVICE_MODELS))]
    records = []
    counter = 1

    def add(record_type, app, direction, ts, cp_name, cp_number, cp_person_id,
            duration, message, note):
        nonlocal counter
        records.append({
            "record_id": f"COMM-{counter:04d}",
            "record_type": record_type,
            "app": app,
            "direction": direction,
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S"),
            "counterpart_name": cp_name,
            "counterpart_number_masked": cp_number,
            "counterpart_person_id": cp_person_id,
            "duration_sec": duration,
            "message_preview": message,
            "note": note,
        })
        counter += 1

    # 1) 사건 연계 활동 중 해외 상대방과의 통신
    seen_countries = set()
    for activity_date, direction, country, item_name, amount, case_id in fetch_case_activity(conn, pid):
        if country == "대한민국" or country in seen_countries:
            continue
        seen_countries.add(country)
        prefix, _bank, _cc = COUNTRY_PREFIX.get(country, ("+99-000", "Sample Bank", "XX"))
        cp_number = f"{prefix}-***-{rng.randint(1000, 9999)}"
        cp_name = f"{country} 거래상대 (미상)"
        base_dt = datetime.combine(activity_date, datetime.min.time()) + timedelta(hours=9)
        add(
            "메신저", rng.choice(FOREIGN_APPS), "수신",
            base_dt - timedelta(days=2, hours=-rng.randint(0, 5)),
            cp_name, cp_number, None, None,
            rng.choice(FOREIGN_MESSAGES),
            f"{case_id} {item_name} 관련 사전 연락 추정",
        )
        add(
            "전화", None, "수신",
            base_dt + timedelta(hours=rng.randint(-2, 2)),
            cp_name, cp_number, None, rng.randint(60, 360), None,
            f"{case_id} {item_name} 거래 당일 통화",
        )

    # 2) 거래 급증(burst) 상대방과의 통신
    burst = fetch_burst_activity(conn, pid)
    burst_counterpart = None
    if burst:
        burst_counterpart = burst[0][2]
        cp_name = names.get(burst_counterpart, burst_counterpart)
        cp_number = masked_phone_for_person(burst_counterpart)
        for i, (activity_date, direction, _cp, item_name, amount) in enumerate(burst):
            base_dt = datetime.combine(activity_date, datetime.min.time())
            kind = i % 3
            ts = base_dt + timedelta(hours=rng.randint(8, 22), minutes=rng.randint(0, 59))
            comm_direction = "발신" if direction == "발송" else "수신"
            if kind == 0:
                add("전화", None, comm_direction, ts, cp_name, cp_number,
                    burst_counterpart, rng.randint(30, 300), None,
                    "거래 급증 구간 통화")
            elif kind == 1:
                add("메신저", rng.choice(DOMESTIC_APPS), comm_direction, ts, cp_name,
                    cp_number, burst_counterpart, None,
                    rng.choice(DOMESTIC_MESSAGES), None)
            else:
                add("SMS", None, comm_direction, ts, cp_name, cp_number,
                    burst_counterpart, None, rng.choice(DOMESTIC_MESSAGES), None)

    # 3) 위 패턴에 해당 없으면 관계망상 최상위 인물관계로 보강
    if not records:
        edge = fetch_top_person_edge(conn, pid, exclude_id=burst_counterpart)
        if edge:
            target_id, relation_type, _w = edge
            cp_name = names.get(target_id, target_id)
            cp_number = masked_phone_for_person(target_id)
            base_dt = datetime(2026, 6, 1, 12, 0, 0)
            add("전화", None, "발신", base_dt, cp_name, cp_number, target_id,
                rng.randint(30, 300), None, f"관계망({relation_type}) 인물과의 통화")
            add("메신저", rng.choice(DOMESTIC_APPS), "수신",
                base_dt + timedelta(days=1), cp_name, cp_number, target_id,
                None, rng.choice(DOMESTIC_MESSAGES), None)

    records.sort(key=lambda r: r["timestamp"])
    for i, r in enumerate(records, start=1):
        r["record_id"] = f"COMM-{i:04d}"

    return {
        "evidence_id": f"EV-SEIZED-{pid}-COMM",
        "source_type": "디지털포렌식 추출자료",
        "subject_person_id": pid,
        "subject_name": name,
        "device": {
            "device_type": device_type,
            "model": model,
            "imei_masked": f"353xxx-xx-xxxx{num_suffix(pid) % 100:02d}-{rng.randint(0, 9)}",
            "seized_date": SEIZED_DATE,
            "extraction_tool": rng.choice(EXTRACTION_TOOLS),
            "extraction_date": EXTRACTION_DATE,
        },
        "note": (
            f"person_activity_record({pid})의 사건 연계 활동 및 거래 급증 구간을 "
            "근거로 생성한 통신기록 샘플."
        ),
        "records": records,
    }


def build_financial_record(conn, pid, name, names, rng):
    records = []
    counter = 1

    def add(txn_date, txn_type, direction, amount, cp_type, cp_person_id,
            cp_org_id, cp_name, cp_account, cp_bank, note):
        nonlocal counter
        records.append({
            "record_id": f"FIN-{counter:04d}",
            "txn_date": txn_date.isoformat(),
            "txn_type": txn_type,
            "direction": direction,
            "amount": amount,
            "counterpart_type": cp_type,
            "counterpart_person_id": cp_person_id,
            "counterpart_org_id": cp_org_id,
            "counterpart_name": cp_name,
            "counterpart_account_masked": cp_account,
            "counterpart_bank": cp_bank,
            "note": note,
        })
        counter += 1

    # 1) 인물-기업(person-to-company) : 관계망상 연결된 기업과의 거래대금
    org_edge = fetch_org_edge(conn, pid)
    if org_edge:
        org_id, relation_type, org_name, country = org_edge
        _prefix, bank, cc = COUNTRY_PREFIX.get(country, ("+99-000", "Sample Bank", "XX"))
        cp_account = f"{cc}-WIRE-***-{rng.randint(1000, 9999)}"
        for activity_date, direction, _country, item_name, amount, case_id in fetch_case_activity(conn, pid):
            scaled = round(amount / 16, -3)
            if direction == "수신":
                add(
                    activity_date + timedelta(days=2), "해외송금", "이체", scaled,
                    "company", None, org_id, org_name, cp_account, bank,
                    f"{case_id} {item_name} 관련 수입대금 일부 송금 ({relation_type})",
                )
            else:
                add(
                    activity_date - timedelta(days=2), "해외송금", "입금", scaled,
                    "company", None, org_id, org_name, cp_account, bank,
                    f"{case_id} {item_name} 관련 수출대금 일부 수취 ({relation_type})",
                )
        # 가장 큰 사건 1건은 추정가액 규모의 의심 현금흐름 추가
        case_rows = fetch_case_activity(conn, pid)
        if case_rows:
            biggest = max(case_rows, key=lambda r: r[4])
            activity_date, direction, _country, item_name, amount, case_id = biggest
            add(
                activity_date, "현금입금" if direction == "수신" else "현금출금",
                "입금" if direction == "수신" else "출금", round(amount, -3),
                "company", None, org_id, org_name, None, None,
                f"{case_id} 추정가액 규모와 근접한 자금흐름, 자금원/용처 불명",
            )

    # 2) 인물-인물(person-to-person) : 거래 급증 구간 거래대금
    burst = fetch_burst_activity(conn, pid)
    if burst:
        burst_counterpart = burst[0][2]
        cp_name = names.get(burst_counterpart, burst_counterpart)
        cp_account = masked_account_for_person(burst_counterpart)
        for activity_date, direction, _cp, item_name, amount in burst:
            if direction == "발송":
                txn_type, txn_direction = "계좌이체", "이체"
                note = f"{item_name} 거래대금 ({activity_date.isoformat()} 발송 건)"
            else:
                txn_type, txn_direction = "계좌입금", "입금"
                note = f"{item_name} 거래대금 수취 ({activity_date.isoformat()} 수신 건)"
            txn_date = activity_date + timedelta(days=rng.randint(1, 3))
            if txn_date > EXTRACTION_DATE_OBJ:
                txn_date = EXTRACTION_DATE_OBJ
            add(
                txn_date, txn_type,
                txn_direction, amount, "person", burst_counterpart, None,
                cp_name, cp_account, "샘플제2은행", note,
            )

    records.sort(key=lambda r: r["txn_date"])
    for i, r in enumerate(records, start=1):
        r["record_id"] = f"FIN-{i:04d}"

    return {
        "evidence_id": f"EV-SEIZED-{pid}-FIN",
        "source_type": "금융계좌 추적자료",
        "subject_person_id": pid,
        "subject_name": name,
        "account": {
            "bank": "샘플은행",
            "account_no_masked": masked_account_for_self(pid),
            "account_holder": name,
        },
        "extraction_date": EXTRACTION_DATE,
        "note": (
            f"person_activity_record({pid})의 거래 급증 구간 및 사건 연계 활동을 "
            "근거로 생성한 금융거래기록 샘플."
        ),
        "records": records,
    }


def main():
    conn = duckdb.connect(str(DB_PATH), read_only=True)
    persons = fetch_persons(conn)
    names = {pid: name for pid, name in persons}

    for pid, name in persons:
        rng = random.Random(f"seized-{pid}")
        person_dir = EVIDENCE_DIR / pid
        person_dir.mkdir(parents=True, exist_ok=True)

        comm = build_communication_record(conn, pid, name, names, rng)
        fin = build_financial_record(conn, pid, name, names, rng)

        (person_dir / "communication_record.json").write_text(
            json.dumps(comm, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (person_dir / "financial_transaction_record.json").write_text(
            json.dumps(fin, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    print(f"generated evidence files for {len(persons)} persons under {EVIDENCE_DIR}")
    conn.close()


if __name__ == "__main__":
    main()
