# Neo4j Graph Model

## Modeling Principles

DuckDB remains the source-of-truth analytical store. Neo4j is a derived graph store for
relationship exploration, graph querying, and future visualization.

The model uses stable English labels and relationship types. Original Korean/source
classification values are preserved as node or relationship properties.

## Investigation Graph

This graph has already been loaded from `network_edge`.

### Nodes

| Label | Source | Natural key |
| --- | --- | --- |
| `Person` | `risk_person_profile` | `person_id` |
| `Organization` | `risk_org_profile` | `org_id` |
| `Case` | `smuggling_case` | `case_id` |
| `Evidence` | `evidence_source` | `source_id` |

### Relationships

| Relationship | Meaning |
| --- | --- |
| `(:Person)-[:NETWORK_EDGE]->(:Person)` | Person-to-person relation from DuckDB `network_edge` |
| `(:Person)-[:NETWORK_EDGE]->(:Organization)` | Person-to-organization relation |
| `(:Person)-[:NETWORK_EDGE]->(:Case)` | Person-to-case relation |
| `(:Person)-[:HAS_EVIDENCE]->(:Evidence)` | Evidence provenance for a loaded edge |

`NETWORK_EDGE.relation_type` stores the original DuckDB relation type.

## Company Import-Risk Graph

This graph is loaded from `company_profiles`, `import_declarations`, and
`import_risk_scores`.

### Nodes

| Label | Source | Natural key | Notes |
| --- | --- | --- | --- |
| `Company` | `company_profiles` | `company_id` | Main company profile |
| `Declaration` | `import_declarations` | `declaration_no` | One node per import declaration |
| `RiskScore` | `import_risk_scores` | `risk_score_id` | One node per risk-score row |
| `Country` | `import_declarations.origin_country`, `company_profiles.major_export_countries` | `code` | Country code or raw country token |
| `HsCode` | `import_declarations.hs_code` | `code` | HS code node |
| `Item` | `import_declarations.item_name` | `name` | Declared item name |
| `Broker` | `company_profiles.customs_broker_firm` | `name` | Customs broker firm |
| `RelatedCompany` | `company_profiles.related_companies` | `name` | Related/affiliate company string |
| `Industry` | `company_profiles.industry_code` | `code` | Industry code |

### Relationships

| Pattern | Meaning |
| --- | --- |
| `(:Company)-[:FILED]->(:Declaration)` | Company filed/imported a declaration |
| `(:Declaration)-[:USES_HS_CODE]->(:HsCode)` | Declaration uses an HS code |
| `(:Declaration)-[:DECLARES_ITEM]->(:Item)` | Declaration declares an item |
| `(:Declaration)-[:ORIGINATED_FROM]->(:Country)` | Declaration origin country |
| `(:Country)-[:SUPPLIES_TO]->(:Company)` | Aggregated origin-country supply relation |
| `(:Company)-[:HAS_RISK_SCORE]->(:RiskScore)` | Company risk-score row |
| `(:Company)-[:USES_BROKER]->(:Broker)` | Company uses a customs broker |
| `(:Company)-[:HAS_RELATED_COMPANY]->(:RelatedCompany)` | Company has related company text |
| `(:Company)-[:IN_INDUSTRY]->(:Industry)` | Company industry code |
| `(:Company)-[:EXPORTS_TO]->(:Country)` | Parsed major export countries |

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
