# -*- coding: utf-8 -*-
"""마약 조직(Organization) 관리지표 6종을 산출해 risk_indicator에 적재한다 (멱등).

우범자(person) drug 지표 6종과 대칭이 되는 조직 단위 6종을 정의한다.
근거 소스: risk_org_profile(risk_score·risk_tags) + person_case_link(조직 연계 인물·역할) +
           smuggling_case(마약 사건) + network_edge(조직↔인물).
근거 소스가 얇은 슬롯은 risk_tags·risk_score에서 파생한 결정적 값으로 채운다(난수 없음).

조직 지표 6종 (risk_indicator: entity_type='org', domain='drug', code=drug_org_*):
  drug_org_precursor   전구물질·위장수입 위험   화학품·건강식품 명목 반입, 품명 위장
  drug_org_nominee     실화주·명의 위장         수입자·수취인·대금지급자 불일치
  drug_org_dispersion  소량 분산 반입           통관 회피용 물량 분산·특송 집중
  drug_org_hierarchy   조직 위계·연계           총책-자금책-운반책 관계망 밀집
  drug_org_laundering  자금세탁·환전 연계       분산송금·현금화·가상자산
  drug_org_supply      국제 공급망 위험         생산·환적국 경유·해외 공급책

멱등: seed_batch_id='drug-org-v1' 행 제거 후 재삽입.
사용법: venv/Scripts/python.exe data/scripts/generate_drug_org_indicators.py
실행 후: web_server 재시작 불필요(요청 시 조회) — 단, /api/risk-org-profile 신규 엔드포인트 추가 시 재시작.
"""
import json
from datetime import datetime
from pathlib import Path

import duckdb

DB = Path(__file__).resolve().parents[2] / "data" / "customs.duckdb"
SEED = "drug-org-v1"

# 코드 → (이름, 값 라벨 템플릿, 권고)
ORG_INDICATORS = [
    ("drug_org_precursor", "전구물질·위장수입 위험",
     "화학품·건강식품 명목 반입, 품명 위장",
     "전구물질 품명 위장 신고 정밀 검사 및 실물 성분분석 확대 권고"),
    ("drug_org_nominee", "실화주·명의 위장",
     "수입자·수취인·대금지급자 불일치",
     "실화주 규명 및 명의대여자·페이퍼 수입자 관계 수사 권고"),
    ("drug_org_dispersion", "소량 분산 반입",
     "통관 회피용 물량 분산·특송 집중",
     "동일 조직의 분산 반입 연결 및 특송 채널 검사 강화 권고"),
    ("drug_org_hierarchy", "조직 위계·연계",
     "총책-자금책-운반책 관계망 밀집",
     "조직 위계(총책·자금책·운반책) 규명 및 동시 검거 계획 수립 권고"),
    ("drug_org_laundering", "자금세탁·환전 연계",
     "분산송금·현금화·가상자산",
     "마약 수익 자금세탁(차명·환치기·가상자산) 흐름 추적 권고"),
    ("drug_org_supply", "국제 공급망 위험",
     "생산·환적국 경유·해외 공급책",
     "해외 공급책·환적 경로 국제공조 및 통제배달 검토 권고"),
]
WEIGHT = round(1 / 6, 3)

# risk_tags 키워드 → 강조 지표(해당 지표 점수를 끌어올림)
TAG_EMPHASIS = {
    "마약밀수": ["drug_org_precursor", "drug_org_dispersion", "drug_org_supply"],
    "신종마약": ["drug_org_precursor", "drug_org_supply"],
    "자금세탁": ["drug_org_laundering", "drug_org_nominee"],
    "유통": ["drug_org_hierarchy", "drug_org_dispersion"],
}


def clamp(v):
    return max(0.0, min(100.0, round(v, 1)))


def build_rows(con, now):
    orgs = con.execute(
        "SELECT org_id, org_name, risk_score, risk_tags FROM risk_org_profile "
        "WHERE domain = 'drug' ORDER BY org_id"
    ).fetchall()
    # 조직별 연계 인물·관계 (network_edge: person → org, 마약공급망·밀수조직·자금세탁망)
    link_roles = {}     # org_id → [relation_type ...] (연결 인물 수만큼)
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
        # 태그 강조 지표 집합
        emph = set()
        for kw, codes in TAG_EMPHASIS.items():
            if kw in tags:
                emph.update(codes)
        for i, (code, name, val_label, reco) in enumerate(ORG_INDICATORS):
            # 결정적 산출: 기준점수 + 지표별 오프셋 + 태그 강조 + 역할 근거
            offset = (base - 40.0) + (i * 7 - 17)             # 지표별로 벌어지게
            score = base + offset * 0.4
            if code in emph:
                score += 22
            if code == "drug_org_hierarchy" and len(roles) >= 3:
                score += 15
            if code == "drug_org_laundering" and any("자금세탁" in r for r in roles):
                score += 18
            if code == "drug_org_supply" and any("공급망" in r for r in roles):
                score += 12
            score = clamp(score)

            reason = f"- {val_label}"
            refs = {}
            uniq_rel = sorted(set(roles))
            if code == "drug_org_hierarchy" and roles:
                reason += f"\n- 연계 인물 {len(roles)}명 · 관계 {len(uniq_rel)}종: {', '.join(uniq_rel)}"
                refs["network_edge"] = uniq_rel
            if code in emph:
                matched = [kw for kw in TAG_EMPHASIS if kw in tags and code in TAG_EMPHASIS[kw]]
                if matched:
                    reason += f"\n- 위험태그 부합: {', '.join(matched)}"
            rows.append({
                "indicator_id": f"OV1-{org_id}-{code}",
                "entity_type": "org", "entity_id": org_id,
                "indicator_code": code, "indicator_name": name,
                "indicator_value": val_label, "score": score, "weight": WEIGHT,
                "reason": reason, "calculated_at": now,
                "seed_batch_id": SEED, "domain": "drug",
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
    print(f"[gen] 마약 조직 지표 생성 완료 — 조직 {n_org}개 × 6종 = {len(rows)}행")
    # 요약
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
