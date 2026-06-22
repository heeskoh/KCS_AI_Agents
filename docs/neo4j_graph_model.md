# Neo4j Graph Model

## Modeling Principles

DuckDB remains the source-of-truth analytical store. Neo4j is a derived graph store for
relationship exploration, graph querying, and future visualization.

The model uses stable English labels and relationship types. Original Korean/source
classification values are preserved as node or relationship properties.

### Entity-centric model (2026 재모델링)

노드는 **엔티티/분류**만 둔다: Company, Person, Organization, Region, Country, Item,
OverseasSupplier, RelatedParty, AffiliatedCompany. **이벤트성 객체**(사건·수입신고·증거·위험점수·
위험지표·분석결과)는 노드가 아니라 **관계(엣지) 또는 노드 속성**으로 표현한다.

- 기업 그래프(2026 재정의): 기업/개인명·항만·분류·위험을 노드로 분리. 수입통관은 실제 체인
  (`DEPARTS_FROM`→`PORT_ROUTE`→`VIA_SUPPLIER`), `count`(건수)는 선 굵기 (아래 Company Import-Risk Graph 참조)
- 종합위험값/위험요인 → 기업 그래프에서는 `RiskScore`/`RiskFactor` 노드로 표현(인물 그래프는 Person 속성 흡수 유지)
- 업종(Industry) → Company 속성으로 흡수, 품목은 8자리 `ItemClass` 노드(10자리는 `DECLARES_ITEM` 엣지 속성)
- 사건 → 대표주체(인물 hub) 중심의 star 관계 (아래 risk-person 모델 참조)
- 증거 → 사건 엣지의 `evidence_*` 속성으로 흡수
- 분석결과 → Person 노드 속성(`latest_analysis_*`)으로 흡수

> 인물/수사 그래프 폐지 라벨: `Declaration`, `Case`/`SmugglingCase`, `Evidence`,
> `RiskIndicator`, `AnalysisResult`, `Industry`, `HsCode`/`RelatedCompany`.
> (기업 그래프는 2026 재정의에서 `RiskScore`·`RiskFactor`·`Broker`·`ItemClass`를 노드로 도입 — 아래 참조.)
> 레거시 로더 `load_network_edge_to_neo4j.py` 는 `load_risk_person_graph_to_neo4j.py`(엔티티 중심)로 대체됨.

## Investigation Graph

엔티티 중심 모델로 재적재되었다(상세는 `neo4j_risk_person_graph_model.md`).
노드는 Person·Organization·Region·Country만, 사건은 대표주체(인물 hub) 중심
`CASE_FROM`/`CASE_VIA`/`CASE_TO`/`CASE_LINK` 관계로 표현하며, 인적관계는 `NETWORK_EDGE`
(`relation_type` 속성에 원본 관계유형 보존), 위험지표·분석결과는 Person 노드 속성으로 흡수한다.

## Company Import-Risk Graph — 수입신고 허브 canonical 모델 (2026 원인분석 재설계)

목적: 기업 위험도의 **원인 추적**. 수입신고(`Declaration`)를 허브 노드로 두어, 한쪽으로는
위험지표(어떤 신고가 어떤 지표를 끌어올렸나), 다른 쪽으로는 품목·항·해외거래처·관세사(그 신고의
구성요소)로 연결한다. **canonical 1회 적재** 후 프런트가 4개 view로 프로젝션한다.

Loaded by `load_company_import_graph_to_neo4j.py` from `company_profiles`,
`import_declarations`(+`import_declaration_items`/`_specs`), `export_declaration`,
`import_risk_scores`, `company_risk_indicator`, `related_party`, `analysis_result`.
항만(`departure_port`/`arrival_port`)은 `backfill_ports.py`로 채운다(선행 필수).

**신고→위험지표 연결(원인분석 핵심)은 근거 소스레코드가 직접 참조한다.** 근거 생성기
(`generate_company_risk_profiles.py`)가 저가신고·FTA·HS분류 근거(`valuation_audit`/`fta_claim`/
`hs_classification_event`)를 **실제 수입신고에서 생성**하며 각 레코드에 `declaration_ref`
(=`declaration_no`)를 부여한다. 산출엔진(`src/risk_indicators.py`)은 이 `declaration_ref`를
읽어 `related_refs.declarations`에 담고, 로더가 `(:Declaration)-[:CONTRIBUTES_TO]->(:RiskFactor)`로
적재한다. (HS 매칭 휴리스틱이 아니라 레코드 직결 — 특수관계·환급·역외는 신고 비종속이라 미연결.)
소스 스키마 변경 시 `drop_risk_source_schema`→`create_risk_source_schema` 후 재생성(선행 필수).

### Nodes (12종)

| Label | 한글 | Natural key |
| --- | --- | --- |
| `Company` | 기업 | `company_id` |
| `Declaration` | 수입신고(허브, 수입+수출) | `declaration_no` (속성: `trade_flow, trade_date, value, status, hs_code, item_name`) |
| `ItemClass` | 품목분류(8자리) | `code`(HS8) |
| `DeparturePort` | 출발항 | `code` (속성 `country`) |
| `ArrivalPort` | 도착항 | `code` (속성 `country`) |
| `OverseasSupplier` | 해외거래처(=송하인) | `name` |
| `Broker` | 관세사 | `name` |
| `RiskScore` | 종합위험값(기업당 1) | `company_id` |
| `RiskFactor` | 위험요인(연관 범죄, 6종) | `code`=indicator_code |
| `RelatedParty` | 특수관계인 | `key` |
| `AffiliatedCompany` | 관계사 | `name` |
| `CaseType` | 사건유형 | `code` |

> 주의: `Declaration`/`Country`/`Item` 등은 `_NODE_ID_KEYS` 우선순위 때문에 `company_id`
> 속성을 노드에 넣으면 API에서 같은 기업의 노드가 1개로 병합된다. `Declaration`은
> `company_id` 대신 `filed_by_company` 속성을 쓴다.

### Relationships

| Pattern | 개념 | 속성 |
| --- | --- | --- |
| `(:Company)-[:FILED]->(:Declaration)` | 신고 | `trade_flow` |
| `(:Declaration)-[:OF_ITEM]->(:ItemClass)` | 품목분류(10자리는 엣지) | `hsk_code(10), item_name` |
| `(:Declaration)-[:FROM_PORT]->(:DeparturePort)` | 출발항 | |
| `(:Declaration)-[:TO_PORT]->(:ArrivalPort)` | 도착항 | |
| `(:Declaration)-[:SUPPLIED_BY]->(:OverseasSupplier)` | 해외거래처(수입만) | |
| `(:Declaration)-[:FILED_BY]->(:Broker)` | 관세사(수입만) | |
| `(:Declaration)-[:CONTRIBUTES_TO]->(:RiskFactor)` | **원인분석 핵심**: 신고→위험지표 | `weight`(지표 score) |
| `(:Company)-[:RISK_INDICATORS]->(:RiskScore)` | 오류지표 속성별 값 | 6종 비율 |
| `(:RiskScore)-[:DRIVEN_BY]->(:RiskFactor)` | 위험요인 구성 | `score, reason` |
| `(:Company)-[:ANALYZED]->(:RiskFactor)` | 분석결과 | `analysis_type, output_summary, ...` |
| `(:Company)-[:RELATED_PARTY]->(:RelatedParty)` | 특수관계 | `relation_type, ...` |
| `(:Company)-[:AFFILIATED_WITH]->(:AffiliatedCompany)` | 관계사 | `count` |
| `(:Company)-[:CASE]->(:CaseType)` | 사건(status별) | `count` |

### View 프로젝션 (canonical → 4-뷰)

`build_company_profile_graph()`(`/api/graph/company_profile`)가 기업의 canonical 전체
그래프를 1회 반환하고, `network-graph.js`가 **필터+레이아웃+인코딩**으로 4개 view를 만든다.

| View | 레이아웃 | 표시 | 인코딩 |
| --- | --- | --- | --- |
| 관계분석 | `concentric`(방사형) | 전체 | 색=노드유형 |
| 원인분석 | `cose`(군집) | RiskFactor←CONTRIBUTES_TO←Declaration→구성요소 | 굵기=기여 |
| 위험구성 | `breadthfirst`(계층, roots=RiskScore) | RiskScore→RiskFactor→Declaration | 위→아래 |
| 경로분석 | `preset`(레인) | Declaration→ports→supplier | 수입파랑/수출주황 |

> 폐지: 직전 11엣지 체인 모델(`DEPARTS_FROM`/`PORT_ROUTE`/`VIA_SUPPLIER`/`DECLARES_ITEM`/
> `USES_BROKER`). 신고를 노드로 복원하면서 경로·품목·관세사가 모두 `Declaration` 중심으로 재배치됨.
> `/api/graph/company_routes`(`build_company_trade_routes`)는 레거시(미사용).

## Confirmed Scope

The current confirmed graph scope is:

1. Investigation graph from `network_edge`.
2. Company import-risk graph from company/import/risk DuckDB tables.

The next integration step should add a small Neo4j query service that can return graph
JSON for a selected company or person while keeping DuckDB fallback behavior.
