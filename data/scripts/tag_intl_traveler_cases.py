"""d2(우범여행자)·d5/f5(국제공조) 케이스 crime_types 태그 보강 (멱등).

배경
----
관세조사 6지표 + 일반/마약/외환 수사유형은 company_profiles·risk_person_profile 의
`crime_types` 태그로 케이스를 식별한다. 그런데 마약 d2(우범여행자), 마약 d5·외환 f5
(국제공조) 3개 케이스는 전용 crime_types 태그가 없어 태그 기반 자동선별 시 후보가
0건이 된다. 데이터(공항여행자 route·해외 transit·역외/재산도피)는 이미 존재하므로,
명확한 신호를 가진 엔티티에 해당 태그를 **추가(append)** 하여 16개 케이스 전부를
태그 기준으로 완비한다.

태깅 기준 (도메인 분리 유지)
---------------------------
- 우범여행자  : primary_domain='drug' 이고 person_route_event.channel='공항 여행자' 보유 개인
- 국제공조(마약): primary_domain='drug' 이고 해외 transit_country(없음 제외) route 보유 개인
                 + 마약 우범기업 전체(밀수입=국제거래 본질)
- 국제공조(외환): primary_domain='forex' 이고 person_asset_flight 또는 person_offshore_link 보유 개인
                 + 외환 우범기업 전체(역외법인·외환거래 보유)

멱등성: crime_types 에 이미 태그가 있으면 건너뛴다. 재실행해도 중복 부여 없음.
실행: python data/scripts/tag_intl_traveler_cases.py
"""
from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

import duckdb

DB = Path(__file__).resolve().parents[1] / "customs.duckdb"

# (라벨, 테이블, id컬럼, 부여할 태그, 대상 id를 고르는 SELECT)
RULES = [
    ("우범여행자(개인)", "risk_person_profile", "person_id", "우범여행자", """
        SELECT DISTINCT p.person_id
        FROM risk_person_profile p
        JOIN person_route_event r ON r.person_id = p.person_id
        WHERE p.primary_domain = 'drug' AND r.channel = '공항 여행자'
    """),
    ("국제공조-마약(개인)", "risk_person_profile", "person_id", "국제공조", """
        SELECT DISTINCT p.person_id
        FROM risk_person_profile p
        JOIN person_route_event r ON r.person_id = p.person_id
        WHERE p.primary_domain = 'drug'
          AND r.transit_country IS NOT NULL AND r.transit_country NOT IN ('', '없음')
    """),
    ("국제공조-마약(기업)", "company_profiles", "company_id", "국제공조", """
        SELECT company_id FROM company_profiles WHERE primary_domain = 'drug'
    """),
    ("국제공조-외환(개인)", "risk_person_profile", "person_id", "국제공조", """
        SELECT DISTINCT p.person_id
        FROM risk_person_profile p
        LEFT JOIN person_asset_flight af ON af.person_id = p.person_id
        LEFT JOIN person_offshore_link ol ON ol.person_id = p.person_id
        WHERE p.primary_domain = 'forex'
          AND (af.person_id IS NOT NULL OR ol.person_id IS NOT NULL)
    """),
    ("국제공조-외환(기업)", "company_profiles", "company_id", "국제공조", """
        SELECT company_id FROM company_profiles WHERE primary_domain = 'forex'
    """),
]


def _has_tag(current: str | None, tag: str) -> bool:
    parts = [t.strip() for t in (current or "").split(",") if t.strip()]
    return tag in parts


def _append_tag(current: str | None, tag: str) -> str:
    parts = [t.strip() for t in (current or "").split(",") if t.strip()]
    parts.append(tag)
    return ",".join(parts)


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"DB 없음: {DB}")

    # 안전 백업
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = DB.with_name(f"customs.backup-pre-intltag-{stamp}.duckdb")
    shutil.copy2(DB, backup)
    print(f"[백업] {backup.name}")

    con = duckdb.connect(str(DB))
    total_updated = 0
    for label, table, idcol, tag, sel in RULES:
        ids = [r[0] for r in con.execute(sel).fetchall()]
        updated = skipped = 0
        for _id in ids:
            cur = con.execute(
                f"SELECT crime_types FROM {table} WHERE {idcol} = ?", [_id]
            ).fetchone()[0]
            if _has_tag(cur, tag):
                skipped += 1
                continue
            con.execute(
                f"UPDATE {table} SET crime_types = ? WHERE {idcol} = ?",
                [_append_tag(cur, tag), _id],
            )
            updated += 1
        total_updated += updated
        print(f"  [{label:18s}] 대상 {len(ids):3d}  부여 {updated:3d}  기존유지 {skipped:3d}")

    con.close()
    print(f"[완료] 총 {total_updated}건 태그 부여 (백업: {backup.name})")


if __name__ == "__main__":
    main()
