# Neo4j Agent Integration

## What Changed

The network-analysis agent now prefers Neo4j when graph data is available.

New service module:

- `src/neo4j_graph.py`

Updated agent:

- `src/agents/agent_network.py`

## Behavior

Company target:

1. `agent_network` tries `build_company_network_report(company_id)` from Neo4j.
2. If Neo4j is available and the company exists, it returns a Neo4j graph report.
3. If Neo4j is unavailable or the company is not found, the existing DuckDB fallback logic still runs.

Person target:

1. `agent_network` detects `target_type == "person"`.
2. It queries Neo4j with `build_person_network_report(person_id)`.
3. If Neo4j data is missing, it returns a clear message explaining that the risk-person graph must be loaded.

## Test Commands

Company network agent:

```powershell
.\venv\Scripts\python.exe -c "from src.agents.agent_network import agent_network; r=agent_network({'target_type':'company','company_id':'C-1002'}); print((r.get('network_result') or '')[:1200])"
```

Person network agent:

```powershell
.\venv\Scripts\python.exe -c "from src.agents.agent_network import agent_network; r=agent_network({'target_type':'person','person_id':'RP-0006'}); print((r.get('network_result') or '')[:1200])"
```

## Verified Results

Company `C-1002`:

- Neo4j report returned.
- Connected paths: 26.
- Supplier countries, recent declarations, related broker/company/industry/export context, and risk indicators were included.

Person `RP-0006`:

- Neo4j report returned.
- Connected paths: 39.
- Network edges, involved cases, risk indicators, and analysis history were included.

## Next Step

The next useful step is to expose graph-shaped JSON from Neo4j for the frontend, instead
of only returning a text report. That would let the UI render real nodes and edges from
Neo4j for both company and risk-person investigations.
