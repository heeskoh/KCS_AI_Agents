# Neo4j Risk-Person Graph Load

## What Was Added

Model document:

- `docs/neo4j_risk_person_graph_model.md`

Python scripts:

- `data/scripts/load_risk_person_graph_to_neo4j.py`
- `data/scripts/query_risk_person_graph_neo4j.py`

## Load The Risk-Person Graph

```powershell
.\venv\Scripts\python.exe data\scripts\load_risk_person_graph_to_neo4j.py --clear
```

`--clear` refreshes the risk-person graph relationships and nodes loaded from
`duckdb.risk_person.sample`. The company import graph remains available.

## Current Load Result

Loaded from `data/customs.duckdb`:

| Item | Count |
| --- | ---: |
| Persons | 100 |
| Organizations | 25 |
| Cases | 634 |
| Evidence records | 634 |
| Person-case links | 634 |
| Network edges | 1,301 |
| Risk indicators | 300 |
| Analysis results | 634 |

Key Neo4j labels now include:

| Label | Count |
| --- | ---: |
| `Person` | 100 |
| `Organization` | 25 |
| `Case` | 634 |
| `Evidence` | 634 |
| `RiskIndicator` | 300 |
| `AnalysisResult` | 634 |
| `Region` | 8 |
| `Country` | 48 |

Key risk-person relationships:

| Relationship | Count |
| --- | ---: |
| `INVOLVED_IN` | 634 |
| `NETWORK_EDGE` | 1,301 |
| `HAS_EVIDENCE` | 1,301 |
| `SUPPORTED_BY` | 634 |
| `HAS_RISK_INDICATOR` | 300 |
| `HAS_ANALYSIS_RESULT` | 634 |
| `ORIGINATED_FROM` | 634 |
| `TRANSITED_THROUGH` | 543 |
| `DESTINED_FOR` | 634 |
| `RESIDES_IN` | 100 |
| `LOCATED_IN` | 25 |

## Query A Person From Python

```powershell
.\venv\Scripts\python.exe data\scripts\query_risk_person_graph_neo4j.py RP-0006
```

Observed result:

```text
person_id: RP-0006
connected_paths: 39
```

## Browser Verification Queries

Open:

```text
http://localhost:7474
```

Person-centered graph:

```cypher
MATCH p = (:Person {person_id: "RP-0006"})-[r]-()
RETURN p
LIMIT 100;
```

Person, cases, and supporting evidence:

```cypher
MATCH p = (:Person {person_id: "RP-0006"})-[:INVOLVED_IN]->(:Case)-[:SUPPORTED_BY]->(:Evidence)
RETURN p
LIMIT 100;
```

Person-to-person and person-to-organization network:

```cypher
MATCH p = (:Person {person_id: "RP-0006"})-[:NETWORK_EDGE]->(:Person|Organization)
RETURN p
LIMIT 100;
```

Risk indicators:

```cypher
MATCH (:Person {person_id: "RP-0006"})-[:HAS_RISK_INDICATOR]->(ri:RiskIndicator)
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

High-risk persons involved in narcotics cases:

```cypher
MATCH (p:Person)-[:INVOLVED_IN]->(c:Case)
WHERE p.risk_score >= 70 AND c.contraband_category CONTAINS "마약"
RETURN p.person_id, p.name, p.risk_level, p.risk_score, count(c) AS narcotics_cases
ORDER BY narcotics_cases DESC, p.risk_score DESC;
```
