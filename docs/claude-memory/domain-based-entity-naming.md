---
name: domain-based-entity-naming
description: 우범자·우범기업 이름은 우범영역(도메인) 기준 — rename_by_domain.py가 데이터로 재구성
metadata: 
  node_type: memory
  type: project
  originSessionId: 26ec2e7b-f054-4824-acc5-04ca4a92df91
---

샘플 우범자/우범기업 이름은 우범영역(domain)을 라벨로 사용한다: drug=마약, forex=외환, general=밀수. 개인은 `{라벨}우범자{NNN}`, 조직은 `{라벨}우범기업{NN}` (도메인별 id순 순번).

판별 근거(데이터): 개인 도메인 = `risk_indicator.domain`(우선순위 forex>drug>general), 조직 도메인 = RO-OFF*→forex, 그 외 network_edge로 연결된 인물 다수결.

구현: `data/scripts/rename_by_domain.py`의 `apply_domain_names(con)` (멱등 — 이름을 도메인+id순으로만 결정). `setup_forex_risk_db.py` main 끝에서 자동 호출되므로 표준 워크플로(setup_risk_person_db → setup_forex_risk_db → load_risk_person_graph_to_neo4j --clear)면 자동 적용된다. 단독 실행도 가능: `python data/scripts/rename_by_domain.py` (적재 후, neo4j 적재 전).

**Why:** 기존 '샘플우범자NNN'/'샘플무역네트워크NN'은 도메인 미상이라 관계망·프로파일에서 영역 식별이 안 됐다.
**How to apply:** 이름은 DuckDB risk_person_profile.name / risk_org_profile.org_name이 SoT. 변경 후 반드시 neo4j 재적재해야 그래프에 반영. company_profiles(C-*)는 실제 업체명이라 대상 아님. 관련 [[company-graph-6node-5edge]] [[risk-person-multiactor-seed]].
