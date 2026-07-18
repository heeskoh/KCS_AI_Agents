# -*- coding: utf-8 -*-
"""외환 조직(Organization) 관리지표 6종을 산출해 risk_indicator에 적재한다 (멱등).

외환 우범자(person) forex 지표 6종(fx_*)과 대칭이 되는 조직 단위 6종을 정의한다.
근거 소스: risk_org_profile(risk_score·risk_tags, domain='forex') + network_edge(조직↔인물).
근거가 얇은 슬롯은 risk_tags·risk_score에서 파생한 결정적 값으로 채운다(난수 없음).

조직 지표 6종 (risk_indicator: entity_type='org', domain='forex', code=fx_org_*):
  fx_org_remittance    비정상 해외송금 구조   가장무역대금·반복 대량 송금
  fx_org_hawala        환치기·무등록 송금     조직적 불법(무등록) 송금 채널
  fx_org_asset_flight  재산 국외도피          허위 무역·자본거래로 자산 이전
  fx_org_offshore      역외·조세회피처 연계   페이퍼컴퍼니 실소유·역외 자금
  fx_org_virtual       가상자산 자금이동      가상자산 통한 국외 우회 이전
  fx_org_structuring   차명·분산(구조화)      차명계좌·분할 송금 구조

멱등: seed_batch_id='forex-org-v1' 행 제거 후 재삽입.
사용법: venv/Scripts/python.exe data/scripts/generate_forex_org_indicators.py
실행 후: /api/risk-org-profile 는 도메인 무관 조회이므로 web_server 재시작 불필요(데이터만 갱신).
"""
import json
from datetime import datetime
from pathlib import Path

import duckdb

DB = Path(__file__).resolve().parents[2] / "data" / "customs.duckdb"
SEED = "forex-org-v1"

# 코드 → (이름, 값 라벨, 권고)
ORG_INDICATORS = [
    ("fx_org_remittance", "비정상 해외송금 구조",
     "가장무역대금·반복 대량 송금",
     "가장무역·용역대금 위장 송금의 외환거래 적정성 정밀 조사 권고"),
    ("fx_org_hawala", "환치기·무등록 송금",
     "조직적 불법(무등록) 송금 채널",
     "환치기(무등록 송금) 채널·상대 계좌망 규명 및 동시 압수 권고"),
    ("fx_org_asset_flight", "재산 국외도피",
     "허위 무역·자본거래로 자산 이전",
     "허위 무역대금·자본거래를 통한 재산 국외도피 흐름 추적 권고"),
    ("fx_org_offshore", "역외·조세회피처 연계",
     "페이퍼컴퍼니 실소유·역외 자금",
     "조세회피처 페이퍼컴퍼니 실소유·역외 자금흐름 국제공조 권고"),
    ("fx_org_virtual", "가상자산 자금이동",
     "가상자산 통한 국외 우회 이전",
     "가상자산을 이용한 자금 국외이전 경로·지갑 추적 권고"),
    ("fx_org_structuring", "차명·분산(구조화)",
     "차명계좌·분할 송금 구조",
     "차명·분할(구조화) 거래의 자금 출처·귀속 규명 권고"),
]
WEIGHT = round(1 / 6, 3)

# risk_tags 키워드 → 강조 지표(해당 지표 점수를 끌어올림)
TAG_EMPHASIS = {
    "외환불법거래": ["fx_org_remittance", "fx_org_structuring"],
    "외환자금세탁": ["fx_org_offshore", "fx_org_virtual", "fx_org_hawala"],
    "환치기": ["fx_org_hawala", "fx_org_remittance"],
    "재산국외도피": ["fx_org_asset_flight", "fx_org_offshore"],
    "역외": ["fx_org_offshore", "fx_org_asset_flight"],
    "페이퍼": ["fx_org_offshore", "fx_org_structuring"],
}


def clamp(v):
    return max(0.0, min(100.0, round(v, 1)))


def build_rows(con, now):
    orgs = con.execute(
        "SELECT org_id, org_name, risk_score, risk_tags FROM risk_org_profile "
        "WHERE domain = 'forex' ORDER BY org_id"
    ).fetchall()
    # 조직별 연계 인물·관계 (network_edge: person → org)
    link_roles = {}     # org_id → [relation_type ...]
    for org_id, rel, cnt in con.execute(
        """
        SELECT target_id AS org_id, relation_type, count(*) AS cnt
        FROM network_edge
        WHERE target_type = 'org' AND source_type = 'person'
        GROUP BY 1, 2
        """
    ).fetchall():
        link_roles.setdefault(org_id, []).extend([rel] * int(cnt))

    rows = []
    for org_id, org_name, risk_score, risk_tags in orgs:
        base = float(risk_score or 40.0)
        tags = str(risk_tags or "")
        roles = link_roles.get(org_id, [])
        emph = set()
        for kw, codes in TAG_EMPHASIS.items():
            if kw in tags:
                emph.update(codes)
        for i, (code, name, val_label, reco) in enumerate(ORG_INDICATORS):
            offset = (base - 40.0) + (i * 7 - 17)
            score = base + offset * 0.4
            if code in emph:
                score += 22
            if code == "fx_org_structuring" and len(roles) >= 3:
                score += 12
            if code == "fx_org_offshore" and any("자금세탁" in r for r in roles):
                score += 15
            score = clamp(score)

            reason = f"- {val_label}"
            refs = {}
            uniq_rel = sorted(set(roles))
            if code == "fx_org_structuring" and roles:
                reason += f"\n- 연계 인물 {len(roles)}명 · 관계 {len(uniq_rel)}종: {', '.join(uniq_rel)}"
                refs["network_edge"] = uniq_rel
            if code in emph:
                matched = [kw for kw in TAG_EMPHASIS if kw in tags and code in TAG_EMPHASIS[kw]]
                if matched:
                    reason += f"\n- 위험태그 부합: {', '.join(matched)}"
            rows.append({
                "indicator_id": f"FXV1-{org_id}-{code}",
                "entity_type": "org", "entity_id": org_id,
                "indicator_code": code, "indicator_name": name,
                "indicator_value": val_label, "score": score, "weight": WEIGHT,
                "reason": reason, "calculated_at": now,
                "seed_batch_id": SEED, "domain": "forex",
                "recommendation": reco if score >= 60 else "",
                "related_refs": json.dumps(refs, ensure_ascii=False),
            })
    return rows, len(orgs)


def main():
    con = duckdb.connect(str(DB))
    now = datetime.now()
    con.execute("DELETE FROM risk_indicator WHERE seed_batch_id = ?", [SEED])
    rows, n_org = build_rows(con, now)
    if rows:
        cols = list(rows[0].keys())
        ph = ", ".join(["?"] * len(cols))
        con.executemany(f"INSERT INTO risk_indicator ({', '.join(cols)}) VALUES ({ph})",
                        [[r[c] for c in cols] for r in rows])
    con.commit()
    print(f"[gen] 외환 조직 지표 생성 완료 — 조직 {n_org}개 x 6종 = {len(rows)}행")
    for org_id, in con.execute(
        "SELECT DISTINCT entity_id FROM risk_indicator WHERE seed_batch_id=? ORDER BY entity_id LIMIT 3", [SEED]
    ).fetchall():
        vals = con.execute(
            "SELECT indicator_name, score FROM risk_indicator WHERE entity_id=? AND seed_batch_id=? ORDER BY score DESC",
            [org_id, SEED]).fetchall()
        print(f"  {org_id}: " + " / ".join(f"{n} {s:.0f}" for n, s in vals))
    con.close()


if __name__ == "__main__":
    main()
