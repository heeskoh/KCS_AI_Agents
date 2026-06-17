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

## Modeling (2026 관계망 재구성 — Case 허브)

대상 1명(우범자)을 중심으로 연계된 결과를 분석하고, **관련 사건을 통해 연루 관계인들이 함께
드러나도록** `Case`(사건) 노드를 다자(多者) 허브로 둔다. 한 사건에 여러 인물이 서로 다른 역할로
`INVOLVED_IN` 연결되며(`person_case_link`가 사건당 2~4명 보유), 분석결과는 그 참여 엣지에 흡수한다.

요약:
- **사건** = `Case` 노드. 여러 인물이 `INVOLVED_IN`(역할별)으로 연결 → "사건 연루 관계인" 표시.
- **사건 장소** = `(:Case)-[:CASE_FROM/CASE_VIA]->(:Country)`, `(:Case)-[:CASE_TO]->(:Region)`.
- **증거** = `INVOLVED_IN` 엣지의 `evidence_summary`/`evidence_level`/`evidence_agency` 속성으로 흡수.
- **분석결과** = `INVOLVED_IN` 엣지의 `analysis_type`/`analysis_summary`/`risk_score_after`/
  `analysis_review_status` 속성으로 흡수(`analysis_result.linked_case_id`로 인물·사건 매칭).
- **위험지표** = `Person.top_indicators`/`indicator_count` 속성으로 흡수.
- **인적관계** = `NETWORK_EDGE`(`relation_type`에 가족관계·동반여행자·공범·송금관계 등 보존).

## Nodes

| Label | Natural key | Source | Notes |
| --- | --- | --- | --- |
| `Person` | `person_id` | `risk_person_profile` | `top_indicators`/`indicator_count`(위험지표 흡수) |
| `Case` | `case_id` | `smuggling_case` | 사건 허브. 유형·품목·상태·수법·금액 등 속성 |
| `Organization` | `org_id` | `risk_org_profile` | |
| `Country` | `code` | `smuggling_case.origin_country`, `transit_country` | |
| `Region` | `name` | `smuggling_case.destination_region`, profile address region | |

## Relationships

| Pattern | Meaning |
| --- | --- |
| `(:Person)-[:INVOLVED_IN {role_in_case, is_cargo_owner, confidence_score, evidence_*, analysis_*}]->(:Case)` | 사건 연루(역할별, 다자). 분석결과 흡수 |
| `(:Case)-[:CASE_FROM]->(:Country)` | 사건 원산지 |
| `(:Case)-[:CASE_VIA]->(:Country)` | 사건 경유지 |
| `(:Case)-[:CASE_TO]->(:Region)` | 사건 도착지 |
| `(:Person)-[:NETWORK_EDGE {relation_type, weight, confidence_score}]->(:Person\|:Organization)` | 인적·조직 직접 관계(가족·동반여행자·공범 등) |
| `(:Person)-[:RESIDES_IN]->(:Region)` | Person address region |
| `(:Organization)-[:LOCATED_IN]->(:Region)` | Organization address region |

사건 연루 관계인 조회: `(:Person {person_id})-[:INVOLVED_IN]->(:Case)<-[:INVOLVED_IN]-(other:Person)`.

> 폐지: `Agent`/`AnalysisResult`/`Evidence`/`RiskIndicator` 노드, `CASE_LINK`(대표주체 spoke→hub)·
> `ANALYZED_BY` 관계, 인물 중심 `CASE_FROM/VIA/TO`(이제 Case 중심).

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

Risk indicators for a person (노드 속성으로 흡수됨):

```cypher
MATCH (p:Person {person_id: "RP-0006"})
RETURN p.top_indicators, p.indicator_count;
```

Analysis history for a person (ANALYZED_BY 엣지):

```cypher
MATCH (:Person {person_id: "RP-0006"})-[r:ANALYZED_BY]->(a:Agent)
RETURN a.name, r.analysis_type, r.risk_score_after, r.output_summary, r.created_at
ORDER BY r.created_at DESC;
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
