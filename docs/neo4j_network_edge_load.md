# Neo4j Network Edge Sample Load

## What Was Added

Python scripts:

- `data/scripts/neo4j_smoke_test.py`
- `data/scripts/load_network_edge_to_neo4j.py`

Dependency:

- `neo4j>=5.26,<6.0`

Config example:

- `.env.example` now includes `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, and `NEO4J_DATABASE`.

## Connection Test

```powershell
.\venv\Scripts\python.exe data\scripts\neo4j_smoke_test.py
```

Expected result:

```text
Connection OK: KCS Neo4j ready
```

## Load DuckDB `network_edge` Data

Load the default 300-edge sample:

```powershell
.\venv\Scripts\python.exe data\scripts\load_network_edge_to_neo4j.py
```

Load all `network_edge` rows:

```powershell
.\venv\Scripts\python.exe data\scripts\load_network_edge_to_neo4j.py --limit 0 --clear
```

`--clear` removes the previously loaded sample graph before loading again.

## Current Full Load Result

The full load from `data/customs.duckdb` produced:

| Label | Count |
| --- | ---: |
| `Person` | 100 |
| `Organization` | 25 |
| `Case` | 634 |
| `Evidence` | 634 |

| Relationship | Count |
| --- | ---: |
| `NETWORK_EDGE` | 1,301 |
| `HAS_EVIDENCE` | 1,301 |

## Browser Verification Queries

Open:

```text
http://localhost:7474
```

Use:

```text
Username: neo4j
Password: kcsneo4j1234
```

Count nodes by label:

```cypher
MATCH (n)
RETURN labels(n)[0] AS label, count(*) AS count
ORDER BY label;
```

Count relationships:

```cypher
MATCH ()-[r]->()
RETURN type(r) AS relationship, count(*) AS count
ORDER BY relationship;
```

Show a person-centered relationship graph:

```cypher
MATCH p = (:Person {person_id: "RP-0006"})-[r:NETWORK_EDGE]->()
RETURN p
LIMIT 50;
```

Show person-to-person relationships:

```cypher
MATCH p = (:Person)-[r:NETWORK_EDGE]->(:Person)
RETURN p
LIMIT 50;
```

Show person-to-organization relationships:

```cypher
MATCH p = (:Person)-[r:NETWORK_EDGE]->(:Organization)
RETURN p
LIMIT 50;
```

Show cases and supporting evidence:

```cypher
MATCH p = (:Person)-[:NETWORK_EDGE]->(:Case)
MATCH e = (:Person)-[:HAS_EVIDENCE]->(:Evidence)
RETURN p, e
LIMIT 50;
```

Find high-risk persons with many graph connections:

```cypher
MATCH (p:Person)-[r:NETWORK_EDGE]->()
RETURN
  p.person_id AS person_id,
  p.name AS name,
  p.risk_level AS risk_level,
  p.risk_score AS risk_score,
  count(r) AS outgoing_edges
ORDER BY outgoing_edges DESC, p.risk_score DESC
LIMIT 20;
```

Find relationship types:

```cypher
MATCH ()-[r:NETWORK_EDGE]->()
RETURN r.relation_type AS relation_type, count(*) AS count
ORDER BY count DESC;
```

## Modeling Note

The loader uses a stable relationship type, `NETWORK_EDGE`, and keeps DuckDB's original
`relation_type` as a relationship property. This avoids problems with dynamic or localized
relationship type names while preserving the source data exactly.
