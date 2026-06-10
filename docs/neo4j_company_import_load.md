# Neo4j Company Import-Risk Graph Load

## What Was Added

Python scripts:

- `data/scripts/load_company_import_graph_to_neo4j.py`
- `data/scripts/query_company_graph_neo4j.py`

Model document:

- `docs/neo4j_graph_model.md`

## Load Company Import-Risk Graph

```powershell
.\venv\Scripts\python.exe data\scripts\load_company_import_graph_to_neo4j.py --clear
```

`--clear` removes only the company import-risk graph relationships and nodes loaded from
`duckdb.company_import.sample`. It keeps the existing investigation graph from
`network_edge`.

## Current Load Result

Loaded from `data/customs.duckdb`:

| Item | Count |
| --- | ---: |
| Companies | 56 |
| Declarations | 250 |
| Risk scores | 56 |
| Aggregated country-to-company supply relations | 159 |
| Company export-country relations | 113 |

Neo4j now contains the company graph plus the previously loaded investigation graph.

Key company graph labels:

| Label | Count |
| --- | ---: |
| `Company` | 56 |
| `Declaration` | 250 |
| `RiskScore` | 56 |
| `Country` | 46 |
| `HsCode` | 50 |
| `Item` | 52 |
| `Broker` | 50 |
| `RelatedCompany` | 21 |
| `Industry` | 9 |

Key company graph relationships:

| Relationship | Count |
| --- | ---: |
| `FILED` | 250 |
| `USES_HS_CODE` | 250 |
| `DECLARES_ITEM` | 250 |
| `ORIGINATED_FROM` | 250 |
| `SUPPLIES_TO` | 159 |
| `HAS_RISK_SCORE` | 56 |
| `USES_BROKER` | 56 |
| `HAS_RELATED_COMPANY` | 21 |
| `IN_INDUSTRY` | 56 |
| `EXPORTS_TO` | 113 |

## Query A Company From Python

```powershell
.\venv\Scripts\python.exe data\scripts\query_company_graph_neo4j.py C-1002
```

Observed result:

```text
company_id: C-1002
connected_paths: 26
```

## Browser Verification Queries

Open:

```text
http://localhost:7474
```

Show a company-centered graph:

```cypher
MATCH p = (:Company {company_id: "C-1002"})--()
RETURN p
LIMIT 80;
```

Show declarations, HS codes, items, and origins:

```cypher
MATCH p =
  (:Company {company_id: "C-1002"})-[:FILED]->(:Declaration)
  -[:USES_HS_CODE|DECLARES_ITEM|ORIGINATED_FROM]->()
RETURN p
LIMIT 80;
```

Show strongest supplier countries:

```cypher
MATCH (country:Country)-[r:SUPPLIES_TO]->(c:Company {company_id: "C-1002"})
RETURN
  country.code AS country,
  r.declaration_count AS declaration_count,
  r.total_declared_value AS total_declared_value,
  r.review_count AS review_count,
  r.inspect_count AS inspect_count,
  r.hold_count AS hold_count
ORDER BY total_declared_value DESC;
```

Show high-risk companies and their related graph context:

```cypher
MATCH p = (c:Company)--()
WHERE c.risk_score >= 70
RETURN p
LIMIT 120;
```

Find companies with many review/inspect/hold declarations:

```cypher
MATCH (c:Company)-[:FILED]->(d:Declaration)
WHERE d.status IN ["REVIEW", "INSPECT", "HOLD"]
RETURN
  c.company_id AS company_id,
  c.company_name AS company_name,
  c.risk_score AS risk_score,
  count(d) AS flagged_declarations
ORDER BY flagged_declarations DESC, risk_score DESC
LIMIT 20;
```

Find companies sharing the same HS code:

```cypher
MATCH (c1:Company)-[:FILED]->(:Declaration)-[:USES_HS_CODE]->(h:HsCode)<-[:USES_HS_CODE]-(:Declaration)<-[:FILED]-(c2:Company)
WHERE c1.company_id <> c2.company_id
RETURN
  h.code AS hs_code,
  c1.company_id AS company_a,
  c2.company_id AS company_b,
  count(*) AS shared_declaration_paths
ORDER BY shared_declaration_paths DESC
LIMIT 30;
```

## Next Integration Step

The next practical step is to add a Neo4j query service module under `src/` and let
`agent_network.py` prefer Neo4j when available, while keeping the current DuckDB fallback.
