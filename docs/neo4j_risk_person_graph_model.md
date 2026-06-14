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

## Modeling (2026 재모델링 — 엔티티 중심)

노드는 엔티티만 두고, **사건(Case)·증거(Evidence)·위험지표(RiskIndicator)·분석결과(AnalysisResult)는
관계 또는 노드 속성으로 흡수**한다. 사건은 데이터 특성상 사건당 인물 1명(person_case_link)이므로
그 인물을 **대표주체(hub)** 로 삼아, 사건 속성을 hub→장소(Country/Region) 관계와
타인 연루(network_edge person→case) 시 spoke→hub 관계로 표현한다.

## Nodes

| Label | Natural key | Source | Notes |
| --- | --- | --- | --- |
| `Person` | `person_id` | `risk_person_profile` | `top_indicators`/`indicator_count`(위험지표 흡수), `latest_analysis_*`/`analysis_count`(분석결과 흡수) |
| `Organization` | `org_id` | `risk_org_profile` | |
| `Country` | `code` | `smuggling_case.origin_country`, `transit_country` | |
| `Region` | `name` | `smuggling_case.destination_region`, profile address region | |

## Relationships

사건 속성(`case_id, case_no, case_type, contraband_category, contraband_sub_category, case_status,
detection_date, role_in_case, confidence_score, evidence_level, evidence_summary`)은 아래 CASE_* 관계의 속성으로 평탄화된다.

| Pattern | Meaning |
| --- | --- |
| `(:Person hub)-[:CASE_FROM {사건속성}]->(:Country)` | 사건 원산지 (대표주체 기준) |
| `(:Person hub)-[:CASE_VIA {사건속성}]->(:Country)` | 사건 경유지 |
| `(:Person hub)-[:CASE_TO {사건속성}]->(:Region)` | 사건 도착지 |
| `(:Person spoke)-[:CASE_LINK {사건속성}]->(:Person hub)` | 동일 사건 연루(타인) — `network_edge` person→case 기준 |
| `(:Person)-[:NETWORK_EDGE {relation_type, weight, confidence_score}]->(:Person\|:Organization)` | 인적·조직 직접 관계 |
| `(:Person)-[:RESIDES_IN]->(:Region)` | Person address region |
| `(:Organization)-[:LOCATED_IN]->(:Region)` | Organization address region |

> 폐지: `Case`/`Evidence`/`RiskIndicator`/`AnalysisResult` 노드, `INVOLVED_IN`/`SUPPORTED_BY`/
> `HAS_EVIDENCE`/`HAS_RISK_INDICATOR`/`HAS_ANALYSIS_RESULT`/`ORIGINATED_FROM`/`TRANSITED_THROUGH`/`DESTINED_FOR` 관계.

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

Risk indicators / analysis for a person (노드 속성으로 흡수됨):

```cypher
MATCH (p:Person {person_id: "RP-0006"})
RETURN p.top_indicators, p.indicator_count, p.latest_analysis_summary, p.analysis_count;
```

Most connected persons:

```cypher
MATCH (p:Person)-[r:NETWORK_EDGE]->()
RETURN p.person_id, p.name, p.risk_level, p.risk_score, count(r) AS edge_count
ORDER BY edge_count DESC, p.risk_score DESC
LIMIT 20;
```

A person's cases (사건이 CASE_* 관계로 표현됨):

```cypher
MATCH (:Person {person_id: "RP-0006"})-[r:CASE_FROM|CASE_VIA|CASE_TO|CASE_LINK]-()
RETURN DISTINCT r.case_id, r.case_type, r.contraband_category, r.case_status, r.evidence_summary;
```
