# Neo4j Risk-Person Graph Model

## Purpose

This model represents risk-person investigation relationships in Neo4j. It is built from
DuckDB tables that already contain person profiles, cases, organizations, evidence,
network edges, risk indicators, and analysis history.

DuckDB remains the source of truth. Neo4j is a derived graph store used for relationship
exploration and graph analytics.

## Source Tables

| DuckDB table | Rows | Role |
| --- | ---: | --- |
| `risk_person_profile` | 100 | Risk-person master profile |
| `risk_org_profile` | 25 | Risk organization profile |
| `smuggling_case` | 634 | Investigation/smuggling case profile |
| `person_case_link` | 634 | Explicit person-case participation |
| `network_edge` | 1,301 | Explicit person/person, person/org, person/case edges |
| `risk_indicator` | 300 | Risk indicators per person |
| `evidence_source` | 634 | Evidence/source records |
| `analysis_result` | 634 | Analysis history per person |

Reference checks found no missing person/case/evidence references for the current sample.

## Nodes

| Label | Natural key | Source |
| --- | --- | --- |
| `Person` | `person_id` | `risk_person_profile` |
| `Organization` | `org_id` | `risk_org_profile` |
| `Case` | `case_id` | `smuggling_case` |
| `Evidence` | `source_id` | `evidence_source` |
| `RiskIndicator` | `indicator_id` | `risk_indicator` |
| `AnalysisResult` | `analysis_id` | `analysis_result` |
| `Country` | `code` | `smuggling_case.origin_country`, `smuggling_case.transit_country` |
| `Region` | `name` | `smuggling_case.destination_region`, profile address region |

## Relationships

| Pattern | Meaning |
| --- | --- |
| `(:Person)-[:INVOLVED_IN]->(:Case)` | Person-case participation from `person_case_link` |
| `(:Person)-[:NETWORK_EDGE]->(:Person)` | Person-to-person graph edge from `network_edge` |
| `(:Person)-[:NETWORK_EDGE]->(:Organization)` | Person-to-organization graph edge |
| `(:Person)-[:NETWORK_EDGE]->(:Case)` | Person-to-case graph edge |
| `(:Person)-[:HAS_RISK_INDICATOR]->(:RiskIndicator)` | Person risk indicator |
| `(:Person)-[:HAS_ANALYSIS_RESULT]->(:AnalysisResult)` | Person analysis history |
| `(:Case)-[:SUPPORTED_BY]->(:Evidence)` | Case evidence from `person_case_link.source_id` |
| `(:Person)-[:HAS_EVIDENCE]->(:Evidence)` | Edge/source evidence provenance from `network_edge.source_id_ref` |
| `(:Case)-[:ORIGINATED_FROM]->(:Country)` | Case origin country |
| `(:Case)-[:TRANSITED_THROUGH]->(:Country)` | Case transit country |
| `(:Case)-[:DESTINED_FOR]->(:Region)` | Case destination region |
| `(:Person)-[:RESIDES_IN]->(:Region)` | Person address region |
| `(:Organization)-[:LOCATED_IN]->(:Region)` | Organization address region |

## Relationship Properties

`INVOLVED_IN`:

- `link_id`
- `role_in_case`
- `confidence_score`
- `evidence_level`
- `source_id`
- `seed_batch_id`

`NETWORK_EDGE`:

- `edge_id`
- `relation_type`
- `weight`
- `confidence_score`
- `first_seen_at`
- `last_seen_at`
- `source_id_ref`
- `seed_batch_id`

## Modeling Decision

`network_edge.relation_type` remains a property on a stable `NETWORK_EDGE` relationship.
This avoids dynamic relationship-type churn while preserving the original source relation.

## Useful Browser Queries

Person-centered graph:

```cypher
MATCH p = (:Person {person_id: "RP-0006"})-[r]-()
RETURN p
LIMIT 100;
```

Risk indicators for a person:

```cypher
MATCH p = (:Person {person_id: "RP-0006"})-[:HAS_RISK_INDICATOR]->(ri:RiskIndicator)
RETURN ri.indicator_code, ri.indicator_name, ri.score, ri.reason
ORDER BY ri.score DESC;
```

Most connected persons:

```cypher
MATCH (p:Person)-[r:NETWORK_EDGE]->()
RETURN p.person_id, p.name, p.risk_level, p.risk_score, count(r) AS edge_count
ORDER BY edge_count DESC, p.risk_score DESC
LIMIT 20;
```

Cases with evidence:

```cypher
MATCH p = (:Person)-[:INVOLVED_IN]->(:Case)-[:SUPPORTED_BY]->(:Evidence)
RETURN p
LIMIT 100;
```
