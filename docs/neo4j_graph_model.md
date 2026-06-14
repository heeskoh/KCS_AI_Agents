# Neo4j Graph Model

## Modeling Principles

DuckDB remains the source-of-truth analytical store. Neo4j is a derived graph store for
relationship exploration, graph querying, and future visualization.

The model uses stable English labels and relationship types. Original Korean/source
classification values are preserved as node or relationship properties.

### Entity-centric model (2026 재모델링)

노드는 **엔티티/분류**만 둔다: Company, Person, Organization, Region, Country, HsCode,
Broker, RelatedCompany. **이벤트성 객체**(사건·수입신고·증거·위험점수·위험지표·분석결과)는
노드가 아니라 **관계(엣지) 또는 노드 속성**으로 표현한다.

- 수입신고 → `(:Company)-[:IMPORTED]->(:HsCode)` 엣지 (품명·금액·원산지·상태는 엣지 속성)
- 위험점수/지표 → Company·Person 노드 속성으로 흡수
- 업종(Industry)·품명(Item) → 노드 속성/엣지 속성으로 흡수
- 사건 → 대표주체(인물 hub) 중심의 star 관계 (아래 risk-person 모델 참조)
- 증거 → 사건 엣지의 `evidence_*` 속성으로 흡수
- 분석결과 → Person 노드 속성(`latest_analysis_*`)으로 흡수

> 폐지된 노드 라벨: `Declaration`, `Case`/`SmugglingCase`, `Evidence`, `RiskScore`,
> `RiskIndicator`, `AnalysisResult`, `Item`, `Industry`.
> 레거시 로더 `load_network_edge_to_neo4j.py` 는 `load_risk_person_graph_to_neo4j.py`(엔티티 중심)로 대체됨.

## Investigation Graph

엔티티 중심 모델로 재적재되었다(상세는 `neo4j_risk_person_graph_model.md`).
노드는 Person·Organization·Region·Country만, 사건은 대표주체(인물 hub) 중심
`CASE_FROM`/`CASE_VIA`/`CASE_TO`/`CASE_LINK` 관계로 표현하며, 인적관계는 `NETWORK_EDGE`
(`relation_type` 속성에 원본 관계유형 보존), 위험지표·분석결과는 Person 노드 속성으로 흡수한다.

## Company Import-Risk Graph

This graph is loaded from `company_profiles`, `import_declarations`, and
`import_risk_scores`.

### Nodes

| Label | Source | Natural key | Notes |
| --- | --- | --- | --- |
| `Company` | `company_profiles` (+`import_risk_scores` 흡수) | `company_id` | 위험점수 6개 지표율·업종코드를 속성으로 보유 |
| `Country` | `import_declarations.origin_country`, `company_profiles.major_export_countries` | `code` | Country code or raw country token |
| `HsCode` | `import_declarations.hs_code` | `code` | HS code node |
| `Broker` | `company_profiles.customs_broker_firm` | `name` | Customs broker firm |
| `RelatedCompany` | `company_profiles.related_companies` | `name` | Related/affiliate company string |

### Relationships

| Pattern | Meaning |
| --- | --- |
| `(:Company)-[:IMPORTED {declaration_no, item_name, declared_value, origin_country, import_date, status}]->(:HsCode)` | 수입신고 1건 = 기업→HS코드 관계 (Declaration 노드 폐지) |
| `(:Country)-[:SUPPLIES_TO {declaration_count, total_declared_value, review/inspect/hold_count}]->(:Company)` | 원산지국 공급 집계 |
| `(:Company)-[:EXPORTS_TO]->(:Country)` | Parsed major export countries |
| `(:Company)-[:USES_BROKER]->(:Broker)` | Company uses a customs broker |
| `(:Company)-[:HAS_RELATED_COMPANY]->(:RelatedCompany)` | Company has related company text |

위험점수(`undervaluation_suspicion_rate` 등 6종)·업종코드는 `Company` 노드 속성으로 흡수되어
`HAS_RISK_SCORE`/`IN_INDUSTRY` 관계와 `RiskScore`/`Industry`/`Item`/`Declaration` 노드는 폐지됨.

### Relationship Properties

`SUPPLIES_TO` stores:

- `declaration_count`
- `total_declared_value`
- `review_count`
- `inspect_count`
- `hold_count`

This lets Neo4j answer relation-strength questions without repeatedly aggregating all
declaration rows.

## Confirmed Scope

The current confirmed graph scope is:

1. Investigation graph from `network_edge`.
2. Company import-risk graph from company/import/risk DuckDB tables.

The next integration step should add a small Neo4j query service that can return graph
JSON for a selected company or person while keeping DuckDB fallback behavior.
