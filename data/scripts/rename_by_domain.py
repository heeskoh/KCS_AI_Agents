"""우범자·우범기업 이름을 '보유 데이터의 우범영역(도메인)' 기준으로 재구성한다.

생성기(setup_risk_person_db.py / setup_forex_risk_db.py)는 사람을 '샘플우범자NNN',
조직을 '샘플무역네트워크NN' 등 도메인 미상 이름으로 시드한다. 본 스크립트는 적재된
데이터로 각 대상의 우범영역을 판별해 이름을 다음 규칙으로 재정의한다(멱등):

  도메인  →  라벨     예시(개인)        예시(기업/조직)
  drug    →  마약     마약우범자001     마약우범기업01
  forex   →  외환     외환우범자001     외환우범기업01
  general →  밀수     밀수우범자001     밀수우범기업01

도메인 판별(데이터 기반):
  - 개인: risk_indicator.domain (우선순위 forex > drug > general).
          보조: 이름이 외환우범자면 forex, 연계사건에 '마약류' 있으면 drug, 그 외 general.
  - 조직: org_id 가 RO-OFF* 이면 forex, 아니면 network_edge 로 연결된 인물들의
          도메인 다수결, 연결 없으면 general.

순번은 도메인별로 id 오름차순 001.. 부여한다. 이름은 (도메인, id순)만으로 결정되므로
재실행해도 동일 결과(멱등)이며, 이미 적합한 이름(외환우범자 등)도 안전하게 유지된다.

사용법:
    python data/scripts/rename_by_domain.py
    (setup_risk_person_db.py · setup_forex_risk_db.py 이후, neo4j 적재 전에 실행)
"""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PROJECT_ROOT / "data" / "customs.duckdb"

DOMAIN_LABEL = {"drug": "마약", "forex": "외환", "general": "밀수"}
DOMAIN_PRIORITY = {"forex": 3, "drug": 2, "general": 1}


def _person_domains(con: duckdb.DuckDBPyConnection) -> dict[str, str]:
    """person_id → domain. risk_indicator.domain 최댓값(우선순위) 사용, 보조 규칙 폴백."""
    dom: dict[str, str] = {}
    rows = con.execute(
        "SELECT entity_id, domain FROM risk_indicator "
        "WHERE entity_type = 'person' AND domain IS NOT NULL"
    ).fetchall()
    for pid, d in rows:
        if DOMAIN_PRIORITY.get(d, 0) > DOMAIN_PRIORITY.get(dom.get(pid), 0):
            dom[pid] = d

    # 지표가 없는 인물 폴백: 이름(외환) / 연계사건(마약류) / general
    drug_by_case = {
        r[0] for r in con.execute(
            "SELECT DISTINCT l.person_id FROM person_case_link l "
            "JOIN smuggling_case c ON c.case_id = l.case_id "
            "WHERE c.contraband_category = '마약류'"
        ).fetchall()
    }
    for (pid, name) in con.execute("SELECT person_id, name FROM risk_person_profile").fetchall():
        if pid in dom:
            continue
        if str(name or "").startswith("외환"):
            dom[pid] = "forex"
        elif pid in drug_by_case:
            dom[pid] = "drug"
        else:
            dom[pid] = "general"
    return dom


def _org_domains(con: duckdb.DuckDBPyConnection, person_dom: dict[str, str]) -> dict[str, str]:
    """org_id → domain. RO-OFF*=forex, 그 외 network_edge 연결 인물 다수결, 없으면 general."""
    from collections import Counter

    votes: dict[str, Counter] = {}
    edges = con.execute(
        "SELECT source_id, target_id FROM network_edge"
    ).fetchall()
    for si, ti in edges:
        org = next((x for x in (si, ti) if str(x).startswith("RO")), None)
        per = next((x for x in (si, ti) if str(x).startswith("RP")), None)
        if org and per and per in person_dom:
            votes.setdefault(org, Counter())[person_dom[per]] += 1

    dom: dict[str, str] = {}
    for (oid,) in con.execute("SELECT org_id FROM risk_org_profile").fetchall():
        if str(oid).startswith("RO-OFF"):
            dom[oid] = "forex"
        elif oid in votes:
            dom[oid] = votes[oid].most_common(1)[0][0]
        else:
            dom[oid] = "general"
    return dom


def _assign(ids_with_dom: list[tuple[str, str]], word: str, width: int) -> dict[str, str]:
    """(id, domain) 목록 → {id: 새이름}. 도메인별 id 오름차순 순번 부여."""
    seq: dict[str, int] = {}
    names: dict[str, str] = {}
    for _id, dom in sorted(ids_with_dom, key=lambda t: t[0]):
        seq[dom] = seq.get(dom, 0) + 1
        names[_id] = f"{DOMAIN_LABEL.get(dom, '밀수')}{word}{seq[dom]:0{width}d}"
    return names


def apply_domain_names(con: duckdb.DuckDBPyConnection) -> dict[str, object]:
    """우범자/우범기업 이름을 도메인 기준으로 재구성(멱등). 통계 dict 반환."""
    person_dom = _person_domains(con)
    org_dom = _org_domains(con, person_dom)

    person_names = _assign(list(person_dom.items()), "우범자", 3)
    org_names = _assign(list(org_dom.items()), "우범기업", 2)

    con.executemany(
        "UPDATE risk_person_profile SET name = ?, updated_at = now() WHERE person_id = ?",
        [(name, pid) for pid, name in person_names.items()],
    )
    con.executemany(
        "UPDATE risk_org_profile SET org_name = ?, updated_at = now() WHERE org_id = ?",
        [(name, oid) for oid, name in org_names.items()],
    )

    from collections import Counter
    return {
        "persons_renamed": len(person_names),
        "orgs_renamed": len(org_names),
        "person_domains": dict(Counter(person_dom.values())),
        "org_domains": dict(Counter(org_dom.values())),
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    print(f"DuckDB: {DB_PATH}")
    with duckdb.connect(str(DB_PATH)) as con:
        stats = apply_domain_names(con)
        samples = con.execute(
            "SELECT person_id, name FROM risk_person_profile "
            "WHERE person_id IN ('RP-0001','RP-0004','RP-FX-0001') ORDER BY person_id"
        ).fetchall()
        org_samples = con.execute(
            "SELECT org_id, org_name FROM risk_org_profile "
            "WHERE org_id IN ('RO-001','RO-004','RO-OFF-001') ORDER BY org_id"
        ).fetchall()
    print("우범영역 기준 이름 재구성 완료")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print("  표본(person):", samples)
    print("  표본(org):", org_samples)


if __name__ == "__main__":
    main()
