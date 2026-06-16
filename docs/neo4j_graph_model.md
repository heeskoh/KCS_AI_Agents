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

- 수입신고 → 기업 중심 5종 엣지(`SUPPLIED_BY`/`DECLARES_ITEM`/`TRADES_WITH_COUNTRY`/`AFFILIATED_WITH`/`RELATED_PARTY`),
  신고번호·사양·적출국·수입일자는 엣지 속성, `count`(건수)는 선 굵기 (아래 Company Import-Risk Graph 참조)
- 위험점수/지표 → Company·Person 노드 속성으로 흡수 (Company는 위험명·지역도 속성)
- 업종(Industry) → Company 속성으로 흡수, 품목(Item)은 HSK 기준 노드로 표현
- 사건 → 대표주체(인물 hub) 중심의 star 관계 (아래 risk-person 모델 참조)
- 증거 → 사건 엣지의 `evidence_*` 속성으로 흡수
- 분석결과 → Person 노드 속성(`latest_analysis_*`)으로 흡수

> 폐지된 노드 라벨: `Declaration`, `Case`/`SmugglingCase`, `Evidence`, `RiskScore`,
> `RiskIndicator`, `AnalysisResult`, `Industry`, 그리고 기업 그래프의 `HsCode`/`Broker`/`RelatedCompany`.
> 레거시 로더 `load_network_edge_to_neo4j.py` 는 `load_risk_person_graph_to_neo4j.py`(엔티티 중심)로 대체됨.

## Investigation Graph

엔티티 중심 모델로 재적재되었다(상세는 `neo4j_risk_person_graph_model.md`).
노드는 Person·Organization·Region·Country만, 사건은 대표주체(인물 hub) 중심
`CASE_FROM`/`CASE_VIA`/`CASE_TO`/`CASE_LINK` 관계로 표현하며, 인적관계는 `NETWORK_EDGE`
(`relation_type` 속성에 원본 관계유형 보존), 위험지표·분석결과는 Person 노드 속성으로 흡수한다.

## Company Import-Risk Graph (2026 관계망 재구성)

Loaded by `load_company_import_graph_to_neo4j.py` from `company_profiles`,
`import_declarations`(+`import_declaration_items`/`_specs`), `import_risk_scores`,
`company_risk_indicator`, `related_party`.

핵심 원칙: **모든 엣지는 기업 중심**이며, 각 엣지의 `count` 속성 = 해당 grain의 수입신고 건수로,
프런트(`network-graph.js`)에서 **선 굵기**로 시각화한다. 동일 grain이라도 지정한 구분 차원
(품목/해외거래처/수입신고NO)이 다르면 **별도 엣지**가 된다.

### Nodes (7종)

| Label | Source | Natural key | Notes |
| --- | --- | --- | --- |
| `Company` | `company_profiles` + `import_risk_scores` + `company_risk_indicator` 흡수 | `company_id` | 위험명(`top_risk_name`)·위험지표값(6종 지표율, `risk_indicator_summary`)·지역(`region`) 속성 보유 |
| `OverseasSupplier` | `import_declarations.overseas_supplier_name` | `name` | 해외거래처 |
| `RelatedParty` | `related_party` | `key`(=`company_id:party_name`) | 특수관계인 (관계유형·지분율·거래비중·역외여부) |
| `Item` | `import_declaration_items.hsk_code` | `code`(HSK10) | 품목 (`name`=거래품명, `origin`=원산지) |
| `Country` | `import_declarations.departure_country`(적출국, NULL시 origin_country) | `code` | 수입/출국 |
| `AffiliatedCompany` | `company_profiles.related_companies` | `name` | 관계사 |
| `CaseType` | `import_declarations.status`(REVIEW/INSPECT/HOLD) | `code` | 사건유형 (`name`=검토/검사/보류, `case_count`=사건건수). NORMAL(정상)은 제외 |

### Relationships (6종, 모두 Company→)

| Pattern | 구분 차원(다르면 별도 엣지) | 속성 |
| --- | --- | --- |
| `(:Company)-[:SUPPLIED_BY]->(:OverseasSupplier)` | 품목(HSK) | `hsk_code, item_name, spec, departure_country, import_date, declaration_no, count` |
| `(:Company)-[:DECLARES_ITEM]->(:Item)` | 해외거래처 | `overseas_supplier, spec, departure_country, import_date, declaration_no, count` |
| `(:Company)-[:TRADES_WITH_COUNTRY]->(:Country)` | 품목(HSK) | `hsk_code, overseas_supplier, spec, departure_country, import_date, declaration_no, count` |
| `(:Company)-[:AFFILIATED_WITH]->(:AffiliatedCompany)` | 수입신고 NO | `overseas_supplier, item, count` |
| `(:Company)-[:RELATED_PARTY]->(:RelatedParty)` | 관계유형 | `relation_type, shareholding_pct, trade_share_pct, is_offshore, note` |
| `(:Company)-[:CASE]->(:CaseType)` | 사건유형(status) | `declaration_no, overseas_supplier, item, departure_country, import_date, count` |

> 폐지: `HsCode`/`Broker`/`RelatedCompany` 노드, `IMPORTED`/`SUPPLIES_TO`/`EXPORTS_TO`/
> `USES_BROKER`/`HAS_RELATED_COMPANY`/`HAS_RISK_INDICATOR` 엣지. 위험점수·업종·위험지표는
> `Company` 노드 속성으로 흡수. 품목 행이 없는 신고(레거시·비교군)는 헤더 대표값(hs_code/item_name)으로 폴백.

### count = 선 굵기

각 엣지 `count`는 해당 grain의 신고-품목 라인 수다. 프런트는 `edgeWidth(count)`로 선 굵기를
매핑(Cytoscape `width: data(ew)` / SVG 폴백 `stroke-width`)하여 거래 빈도를 한눈에 보여준다.

## Confirmed Scope

The current confirmed graph scope is:

1. Investigation graph from `network_edge`.
2. Company import-risk graph from company/import/risk DuckDB tables.

The next integration step should add a small Neo4j query service that can return graph
JSON for a selected company or person while keeping DuckDB fallback behavior.
