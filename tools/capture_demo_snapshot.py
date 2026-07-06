# -*- coding: utf-8 -*-
"""8000 서버에서 standalone 데모용 GET API 응답 스냅샷 캡처."""
import json
import urllib.request
import urllib.parse
from pathlib import Path

BASE = "http://127.0.0.1:8000"
OUT = Path(__file__).parent / "snapshot_get.json"


def norm_key(path: str, query: str = "") -> str:
    """스냅샷 키: path + 정렬된 쿼리 (JS 심과 동일 규칙)."""
    if not query:
        return path
    pairs = sorted(urllib.parse.parse_qsl(query, keep_blank_values=True))
    return path + "?" + urllib.parse.urlencode(pairs)


def get(path_q: str):
    url = BASE + path_q
    with urllib.request.urlopen(url, timeout=60) as r:
        body = r.read().decode("utf-8")
    return json.loads(body)


snapshot = {}

def cap(path_q: str):
    p = urllib.parse.urlparse(path_q)
    key = norm_key(p.path, p.query)
    if key in snapshot:
        return snapshot[key]
    data = get(path_q)
    snapshot[key] = data
    return data


# 부팅 시퀀스 엔드포인트
for ep in [
    "/api/workspace_state",
    "/api/analysis_templates",
    "/api/scenario_builder_config",
    "/api/scenario_templates",
    "/api/prompt_overrides",
    "/api/network_scenarios",
    "/api/companies",
    "/api/risk-persons",
]:
    try:
        cap(ep)
        print("ok", ep)
    except Exception as e:
        print("FAIL", ep, e)

# 기업 상세: 전체 기업
companies = snapshot.get("/api/companies", {}).get("companies", [])
print("companies:", len(companies))
for c in companies:
    cid = c.get("company_id")
    if not cid:
        continue
    try:
        cap(f"/api/company?company_id={urllib.parse.quote(cid)}")
    except Exception as e:
        print("FAIL company", cid, e)

# 기업 프로파일 그래프: 전체 기업 (크기 보고 조정)
for c in companies:
    cid = c.get("company_id")
    if not cid:
        continue
    try:
        cap(f"/api/graph/company_profile?company_id={urllib.parse.quote(cid)}")
    except Exception as e:
        print("FAIL graph", cid, e)

# 우범자 프로파일 (일반수사 화면 대비, 목록에 있는 인물 전부)
persons = snapshot.get("/api/risk-persons", {}).get("persons", [])
print("persons:", len(persons))
for p_ in persons:
    pid = p_.get("person_id")
    if not pid:
        continue
    try:
        cap(f"/api/risk-person-profile?person_id={urllib.parse.quote(pid)}")
    except Exception as e:
        print("FAIL person", pid, e)

OUT.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
print("keys:", len(snapshot))
print("bytes:", OUT.stat().st_size)
