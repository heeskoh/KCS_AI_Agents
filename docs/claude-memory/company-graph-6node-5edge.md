---
name: company-graph-6node-5edge
description: 기업 프로파일 Neo4j 그래프는 수입신고=엣지 모델 v2(2026 재설계)이며 신고를 기업→품목 엣지로 표현, 출발항/거래처/관세사/위험기여는 엣지 속성으로 흡수
metadata: 
  node_type: memory
  type: project
  originSessionId: 0d28a42f-084c-47c5-98ad-0bd6446833a8
---

기업 프로파일 Neo4j 그래프 = **수입신고 엣지 모델 v2**(2026 재설계, 목적: 위험도 **원인 추적**).
직전 "수입신고 허브 노드" 모델 폐기. 로더 [load_company_import_graph_to_neo4j.py](data/scripts/load_company_import_graph_to_neo4j.py),
조회 [neo4j_graph.py](src/neo4j_graph.py)(build_company_profile_graph/build_explore_graph),
프런트 [network-graph.js](web/static/js/analysis/shared/network-graph.js), 문서 [neo4j_graph_model.md](docs/neo4j_graph_model.md).

**핵심 변경**: 수입신고는 노드가 아니라 `(:Company)-[:IMPORT_DECLARATION]->(:ItemClass)` **엣지**.
출발항·도착항·해외거래처·관세사·신고금액·신고일·status·위험기여(contributes/contributes_weight)는
모두 엣지 속성으로 흡수. 집계 그레인=(company_id, 품목분류 8자리, trade_flow) 당 엣지 1개(count=신고건수,
declaration_no=대표샘플 콤마결합). 수입/수출은 trade_flow로 구분(같은 기업-품목 별도 엣지), 프런트
relLabelKo가 trade_flow로 "수입신고/수출신고" 라벨링.

노드(7): Company·ItemClass(8자리,code)·RiskScore(company_id)·RiskFactor(code=indicator_code)·
RelatedParty(key)·AffiliatedCompany(name)·CaseType(code).
폐지노드: Declaration·DeparturePort·ArrivalPort·OverseasSupplier·Broker(엣지속성 흡수, clear가 정리).
엣지: IMPORT_DECLARATION(위 속성)·Company-RISK_INDICATORS→RiskScore(6비율)·RiskScore-DRIVEN_BY→RiskFactor·
Company-ANALYZED→RiskFactor·RELATED_PARTY·AFFILIATED_WITH·CASE.

**Why:** 사용자 요청(수입신고를 기업/개인↔품목 엣지로). 신고 노드 폭증 제거로 기업–품목 관계가 직관적.
**How to apply:** ① **선행 백필 2종 필수**(둘 다 멱등, v2 신고생성기가 4컬럼을 비워둠):
`python data/scripts/backfill_ports.py`(출발항·도착항) + `python data/scripts/backfill_trade_partners.py`
(해외거래처 overseas_supplier_name·관세사 customs_broker_firm). 그 후 `python data/scripts/
load_company_import_graph_to_neo4j.py --clear`. ② 프런트 4-뷰(VIEW_PROJECTION+edgeFilter): 관계분석=전체·
원인분석/위험구성=contributes 있는 신고엣지만(cose/breadthfirst)·거래경로(구 경로분석)=기업→품목 2열 preset
(출발항/거래처는 엣지 상세). ROUTE_LANES=[Company,ItemClass]. ③ 회사 그래프는 graphUrl이 company_profile로
가고 viewMode 프로젝션(우범자 Person·우범조직 Organization ego 그래프는 [[network-analysis-vs-profile-network]]
처럼 raw 유지, 영향 없음). ④ 검증: /api/graph/company_profile?company_id=C-1021 → IMPORT_DECLARATION 엣지에
departure_port/arrival_port/supplier/broker/contributes 채워짐 확인. 데이터: [[import-declaration-4table-schema]]
+ [[risk-model-v2-pipeline]]. **미해결(별건)**: 관세조사 profile 탭 그래프 컨테이너가 좌측 대시보드 높이(~7000px)에
맞춰 늘어남 — .ci-tab-body bounded height 없음 + profile이 isFullHeight 미포함(CSS, 본 변경과 무관·기존 이슈).
