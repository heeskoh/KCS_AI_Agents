---
name: risk-model-v2-pipeline
description: 위험모델 v2 — 기업(관세조사/수사)·개인 죄종기반 재구성 파이프라인(Phase 0~6)
metadata: 
  node_type: memory
  type: project
  originSessionId: 26ec2e7b-f054-4824-acc5-04ca4a92df91
---

기업·개인 데이터를 죄종(15종→3도메인 customs/drug/forex) 기반으로 전면 재구성한 v2 모델. 실행 순서(각 멱등):

1. `data/scripts/migrate_risk_model_v2.py` — 스키마 확장(비파괴): company_profiles/risk_person_profile +entity_role·primary_domain·crime_types, import_declarations +importer_person_id·crime_signal, import_risk_scores +customs/drug/forex_crime_rate, 신규 person_risk_scores·person_import_event.
2. `gen_entities_v2.py` — 마스터: 관세조사기업 40(C-1001~40,audit) + 수사대상기업 30(C-2001~30,investigation/both) + 개인 80(drug RP-0001~34 / customs RP-0035~60 / forex RP-FX-0001~20). 1엔터티=1주도메인+동일도메인 1~2죄종. 이름 도메인기반 직접부여(관세조사대상기업/마약·외환·밀수 우범기업·우범자).
3. `gen_declarations_v2.py` — 신고서(기업 10~20건·품목≤4 / 관세개인 ≤2) + person_import_event(마약·외환 개인 반입/송금). crime_signal 주입.
4. `generate_company_risk_profiles.py`(죄종인지로 수정됨) — 회사 근거+6위험률. audit=관심사1개 강조, 무관지표 baseline.
5. `gen_person_evidence_v2.py` — 개인 근거(person_route/seizure/fx/offshore 등) 죄종기반.
6. `compute_indicators_v2.py` — 회사 범죄위험률 + 개인 2계층(person_risk_scores Tier1통관베이스+Tier2범죄율) + risk_indicator(person).
7. `gen_cases_network_v2.py` — risk_org_profile=수사대상기업 그래프미러(org_id=company_id,domain컬럼)+관련조직(REL-O), network_edge(person↔person/org), smuggling_case+person_case_link(다자), 태그(마약우범자·국제공조). load merge_org가 domain컬럼 사용하도록 패치됨.
8. `rename_by_domain.py` — **v2에선 미실행**(Phase2에서 이미 도메인명 부여, org미러명 보존). [[domain-based-entity-naming]] 의 단독 rename은 v1용.
9. Neo4j 적재(둘 다 --clear): `load_company_import_graph_to_neo4j.py`(Company 허브) + `load_risk_person_graph_to_neo4j.py`(Person/Org risk).

**Why:** company_profiles 포함 모든 샘플이 가짜였고 위험률/죄종 정합성이 없었음.
**How to apply:** SoT=DuckDB→Neo4j. 마약/외환 기업 프로파일은 [[company-graph-6node-5edge]] 아닌 /api/graph/org(Organization). 프론트 하드코딩 케이스(defaultGenInvCases/defaultDrugInvCases)는 C-2001/C-2013/C-2022/RP-0035/RP-FX-0002 등으로 매핑됨. 신고서 4테이블(items/specs/taxes)은 `gen_declaration_items_v2.py`로 생성(1신고=1품목, 헤더 세액 backfill 포함, 커버리지 100%) — 상세 5영역 뷰는 agent_nl_to_sql이 DuckDB 직접조회. forex 캘리브레이션 완료(외환금액 억~수백억 상향 + fx_transaction 기반 지표 거래량/플래그 보강 → 도메인 평균 customs77·drug75·forex73 균형). compute_indicators_v2가 person_risk_scores·import_risk_scores를 risk_person_profile·company_profiles 마스터 risk_score에 동기화(그래프/프로파일 표시값=산출값). [[network-analysis-vs-profile-network]]
