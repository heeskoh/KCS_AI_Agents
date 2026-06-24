# Neo4j Graph Model

## Modeling Principles

DuckDB remains the source-of-truth analytical store. Neo4j is a derived graph store for
relationship exploration, graph querying, and future visualization.

The model uses stable English labels and relationship types. Original Korean/source
classification values are preserved as node or relationship properties.

### Entity-centric model (2026 재모델링)

노드는 **엔티티/분류**만 둔다: Company, Person, Organization, Region, Country, Item,
RelatedParty, AffiliatedCompany. **이벤트성 객체**(사건·수입신고·증거·위험점수·
위험지표·분석결과)는 노드가 아니라 **관계(엣지) 또는 노드 속성**으로 표현한다.

- 기업 그래프(2026 v2): 수입신고는 `(:Company)-[:IMPORT_DECLARATION]->(:ItemClass)` **엣지**이고
  출발항·도착항·해외거래처·관세사·신고금액은 엣지 속성으로 흡수, `count`(건수)는 선 굵기 (아래 Company Import-Risk Graph 참조)
- 종합위험값/위험요인 → 기업 그래프에서는 `RiskScore`/`RiskFactor` 노드로 표현(인물 그래프는 Person 속성 흡수 유지)
- 업종(Industry) → Company 속성으로 흡수, 품목은 8자리 `ItemClass` 노드(10자리 hsk는 신고 엣지 속성)
- 사건 → 대표주체(인물 hub) 중심의 star 관계 (아래 risk-person 모델 참조)
- 증거 → 사건 엣지의 `evidence_*` 속성으로 흡수
- 분석결과 → Person 노드 속성(`latest_analysis_*`)으로 흡수

> 인물/수사 그래프 폐지 라벨: `Declaration`, `Case`/`SmugglingCase`, `Evidence`,
> `RiskIndicator`, `AnalysisResult`, `Industry`, `HsCode`/`RelatedCompany`.
> (기업 그래프 v2 폐지 라벨: `Declaration`·`DeparturePort`·`ArrivalPort`·`OverseasSupplier`·`Broker`
> — 모두 `IMPORT_DECLARATION` 엣지 속성으로 흡수. `RiskScore`·`RiskFactor`·`ItemClass`는 노드 유지.)
> 레거시 로더 `load_network_edge_to_neo4j.py` 는 `load_risk_person_graph_to_neo4j.py`(엔티티 중심)로 대체됨.

## Investigation Graph

엔티티 중심 모델로 재적재되었다(상세는 `neo4j_risk_person_graph_model.md`).
노드는 Person·Organization·Region·Country만, 사건은 대표주체(인물 hub) 중심
`CASE_FROM`/`CASE_VIA`/`CASE_TO`/`CASE_LINK` 관계로 표현하며, 인적관계는 `NETWORK_EDGE`
(`relation_type` 속성에 원본 관계유형 보존), 위험지표·분석결과는 Person 노드 속성으로 흡수한다.

## Company Import-Risk Graph — 수입신고 **엣지** 모델 v2 (2026 재설계)

목적: 기업 위험도의 **원인 추적**. 직전 모델은 수입신고(`Declaration`)를 허브 노드로 두었으나,
**v2는 수입신고를 `(:Company)-[:IMPORT_DECLARATION]->(:ItemClass)` 엣지**로 표현한다.
한 신고에 달려있던 출발항·도착항·해외거래처·관세사·신고금액·신고일·위험기여는 **모두 엣지
속성으로 흡수**한다. 신고 노드 폭증이 사라져 기업–품목 관계가 직관적으로 보인다.
**집계 그레인**: (company_id, 품목분류 8자리, 수출입구분) 당 엣지 1개(`count`=신고건수).

Loaded by `load_company_import_graph_to_neo4j.py` from `company_profiles`,
`import_declarations`(+`import_declaration_items`/`_specs`), `export_declaration`,
`import_risk_scores`, `company_risk_indicator`, `related_party`, `analysis_result`.
선행 백필 2종(둘 다 멱등): `backfill_ports.py`(출발항·도착항) + `backfill_trade_partners.py`
(해외거래처·관세사). v2 신고 생성기는 이 4개 컬럼을 비워두므로 백필 없이는 엣지 속성이 빈다.

**신고→위험지표 연결(원인분석)은 엣지의 `contributes` 속성으로 표현한다.** 근거 생성기
(`generate_company_risk_profiles.py`)가 저가신고·FTA·HS분류 근거를 실제 수입신고에서 생성하며
`declaration_ref`(=`declaration_no`)를 부여하고, 산출엔진(`src/risk_indicators.py`)이 이를
`related_refs.declarations`에 담는다. 로더는 그 신고가 끌어올린 위험요인 코드를 해당
`IMPORT_DECLARATION` 엣지의 `contributes`(콤마결합)·`contributes_weight`(최대 score)에 적재한다.
(특수관계·환급·역외는 신고 비종속이라 contributes 없음.)

### Nodes (7종)

| Label | 한글 | Natural key |
| --- | --- | --- |
| `Company` | 기업 | `company_id` |
| `ItemClass` | 품목분류(8자리) | `code`(HS8) |
| `RiskScore` | 종합위험값(기업당 1) | `company_id` |
| `RiskFactor` | 위험요인(연관 범죄, 6종) | `code`=indicator_code |
| `RelatedParty` | 특수관계인 | `key` |
| `AffiliatedCompany` | 관계사 | `name` |
| `CaseType` | 사건유형 | `code` |

> 폐지 노드: `Declaration`·`DeparturePort`·`ArrivalPort`·`OverseasSupplier`·`Broker`
> (모두 `IMPORT_DECLARATION` 엣지 속성으로 흡수). 로더 `clear`가 잔존 노드를 정리한다.

### Relationships

| Pattern | 개념 | 속성 |
| --- | --- | --- |
| `(:Company)-[:IMPORT_DECLARATION]->(:ItemClass)` | **수입신고(=엣지)** | `trade_flow, count, value, declaration_no, departure_port, arrival_port, departure_country, arrival_country, supplier, broker, hsk_code, item_name, status, trade_date, contributes, contributes_weight` |
| `(:Company)-[:RISK_INDICATORS]->(:RiskScore)` | 오류지표 속성별 값 | 6종 비율 |
| `(:RiskScore)-[:DRIVEN_BY]->(:RiskFactor)` | 위험요인 구성 | `score, reason` |
| `(:Company)-[:ANALYZED]->(:RiskFactor)` | 분석결과 | `analysis_type, output_summary, ...` |
| `(:Company)-[:RELATED_PARTY]->(:RelatedParty)` | 특수관계 | `relation_type, ...` |
| `(:Company)-[:AFFILIATED_WITH]->(:AffiliatedCompany)` | 관계사 | `count` |
| `(:Company)-[:CASE]->(:CaseType)` | 사건(status별) | `count` |

> 수입/수출은 `trade_flow`로 구분되어 같은 기업–품목 사이에 별도 엣지로 적재된다.
> 프런트 `relLabelKo`가 `trade_flow`에 따라 "수입신고"/"수출신고" 라벨을 부여한다.

### View 프로젝션 (canonical → 4-뷰)

`build_company_profile_graph()`(`/api/graph/company_profile`)가 기업의 canonical 전체
그래프를 1회 반환하고, `network-graph.js`가 **필터+레이아웃+인코딩**으로 4개 view를 만든다.
`VIEW_PROJECTION`은 노드/엣지 화이트리스트 + `edgeFilter`(원인/위험 뷰는 `contributes` 있는
신고 엣지만)로 프로젝션한다.

| View | 레이아웃 | 표시 | 인코딩 |
| --- | --- | --- | --- |
| 관계분석 | `concentric`(방사형) | 전체 | 색=노드유형 |
| 원인분석 | `cose`(군집) | Company·RiskFactor·RiskScore·ItemClass + 기여 신고엣지 | 굵기=건수 |
| 위험구성 | `breadthfirst`(계층, roots=RiskScore) | RiskScore→RiskFactor + 기여 품목 | 위→아래 |
| 거래경로 | `preset`(레인) | 기업→품목 2열, 신고엣지(출발항·거래처는 엣지 상세) | 수입파랑/수출주황 |

> 폐지: 수입신고 허브 노드 모델(`FILED`/`OF_ITEM`/`FROM_PORT`/`TO_PORT`/`SUPPLIED_BY`/
> `FILED_BY`/`CONTRIBUTES_TO`)과 그 이전 11엣지 체인 모델. `/api/graph/company_routes`는 레거시(미사용).

### 자유 관계분석(독립 탭) — 교차 그래프

프로파일과 별개의 독립 "관계망 분석" 탭(page `model`)은 `build_explore_graph(company_ids,
person_ids, region, risk_level, industry)`(`/api/graph/explore`)로 **다중 시드 + 속성 필터**의
합집합 교차 그래프를 반환한다. 공유 노드(항만·거래처·관세사·품목분류·위험요인)가 기업을 자연
교차 연결한다. 프런트(`computeAnalysis`)는 community(라벨전파)·betweenness(Brandes)·
bridges(Tarjan 단절점)·shared_hub(공유 허브 교차) 알고리즘으로 분석한다.

## Confirmed Scope

The current confirmed graph scope is:

1. Investigation graph from `network_edge`.
2. Company import-risk graph from company/import/risk DuckDB tables.

The next integration step should add a small Neo4j query service that can return graph
JSON for a selected company or person while keeping DuckDB fallback behavior.
