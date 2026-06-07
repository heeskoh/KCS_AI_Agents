# Neo4j Phase 1 Inventory

## Purpose

This document captures the current project state before introducing Neo4j.
It focuses on DuckDB data, current network-analysis code, API/UI flow, and
candidate graph entities and relationships.

## Current Data Flow

The application currently uses DuckDB as the main local analytical store.

- Shared DB path: `src/paths.py`
- DuckDB file: `data/customs.duckdb`
- Backup DB: `data/customs.backup-20260519-213720.duckdb`
- Chroma vector store: `data/chroma_db`
- Web entry point: `web_server.py`
- Agent registry: `src/agents/module_registry.py`
- Network agent: `src/agents/agent_network.py`

The usual company investigation flow is:

1. Frontend selects a company or scenario.
2. `web_server.py` serves `/api/companies`, `/api/company`, `/api/run`, and `/api/gi_run`.
3. `create_initial_state()` creates agent state with `company_id`, target type, and scenario data.
4. Workflow modules run through `src/agents/module_registry.py`.
5. DuckDB-backed agents query `data/customs.duckdb`.
6. `agent_network.py` builds temporary in-memory `nodes`, `edges`, `alerts`, and risk summaries.
7. Results are streamed back as text output, then rendered by the web UI.

The current network analysis does not persist graph data. It generates a graph-shaped
result dynamically from DuckDB rows each time the agent runs.

## DuckDB Files And Scripts

Primary DuckDB-related files:

- `data/customs.duckdb`: active database.
- `data/scripts/setup_db.py`: creates and seeds company import-risk tables.
- `data/scripts/check_db.py`: checks core company/import/risk tables and ML readiness.
- `data/scripts/setup_risk_person_db.py`: creates and seeds person/case/org/network demo tables.
- `data/scripts/select_risk_db.py`: helper script for risk DB selection.
- `src/paths.py`: centralizes `DB_PATH`.

DuckDB is imported directly in multiple agents, including:

- `src/agents/agent_db.py`
- `src/agents/agent_network.py`
- `src/agents/agent_ml.py`
- `src/agents/agent_bigdata.py`
- `src/agents/agent_company.py`
- `src/agents/agent_customs_value.py`
- `src/agents/agent_declaration_verify.py`
- `src/agents/agent_hs_verify.py`
- `src/agents/agent_web.py`

## DuckDB Table Inventory

Observed from `data/customs.duckdb`:

| Table | Rows | Role |
| --- | ---: | --- |
| `company_profiles` | 56 | Company master profile and financial/risk attributes |
| `import_declarations` | 250 | Import declaration rows linked to companies |
| `import_risk_scores` | 56 | Latest and historical company risk indicators |
| `risk_person_profile` | 100 | Risk-person profiles for special investigations |
| `risk_org_profile` | 25 | Risk organization profiles |
| `smuggling_case` | 634 | Smuggling/investigation case records |
| `person_case_link` | 634 | Person-to-case link table |
| `network_edge` | 1,301 | Explicit graph-like edge table |
| `risk_indicator` | 300 | Risk indicator facts linked to entities |
| `evidence_source` | 634 | Evidence/source records |
| `analysis_result` | 634 | Agent/model analysis history |

## Important Schemas

### `company_profiles`

Key columns:

- `company_id`
- `company_name`
- `business_registration_no`
- `industry_code`
- `risk_level`
- `risk_score`
- `customs_broker_firm`
- `related_companies`
- `major_export_countries`
- `annual_revenue`
- `annual_import_amount`
- `declared_duty_amount`
- `recent_customs_refund`
- `fta_reduction_rate`

### `import_declarations`

Key columns:

- `id`
- `company_id`
- `declaration_no`
- `hs_code`
- `item_name`
- `declared_value`
- `origin_country`
- `import_date`
- `status`

Status distribution:

- `NORMAL`: 166
- `REVIEW`: 62
- `INSPECT`: 19
- `HOLD`: 3

### `import_risk_scores`

Key columns:

- `company_id`
- `risk_level`
- `risk_score`
- `undervaluation_suspicion_rate`
- `related_party_anomaly_rate`
- `fta_origin_misuse_suspicion_rate`
- `customs_refund_anomaly_rate`
- `hs_classification_error_rate`
- `offshore_fund_concealment_suspicion_rate`
- `generated_at`

### `network_edge`

Key columns:

- `edge_id`
- `source_type`
- `source_id`
- `target_type`
- `target_id`
- `relation_type`
- `weight`
- `confidence_score`
- `first_seen_at`
- `last_seen_at`
- `source_id_ref`

Current major relation groups:

- `person -> case`: `수사이력` 534, `사건관련` 100
- `person -> person`: `동일수취지` 101, `송금관계` 97, `연락빈번` 95, `동행` 92, `동일조직` 89, `공범의심` 89, `공범` 4
- `person -> org`: `거래관계` 22, `동일주소` 21, `명의대여` 21, `소속` 19, `연락관계` 17

This is the strongest immediate candidate for Neo4j sample loading because it already
stores source/target IDs, relation types, weights, confidence scores, and time ranges.

## Existing Network Analysis Code

`src/agents/agent_network.py` currently:

- Reads company profile data from `company_profiles`.
- Reads origin/import statistics from `import_declarations`.
- Infers related-company type from `related_companies`.
- Infers offshore risk from related-company name keywords.
- Creates temporary nodes:
  - subject company
  - related company
  - supplier/origin nodes
  - customs broker node
- Creates temporary edges:
  - equity/relationship edge to related company
  - trade edge from supplier/origin to company
  - service edge to customs broker
- Builds alert text using configurable thresholds from `config/thresholds.yaml`.
- Optionally asks the LLM to summarize the network risk.

This agent is a good migration target. The first Neo4j integration can preserve this
output shape while changing the source from dynamic DuckDB-only construction to a
persisted graph query.

## Existing UI/API Surface

Backend:

- `web_server.py` exposes:
  - `/api/companies`
  - `/api/company`
  - `/api/run`
  - `/api/gi_run`
  - `/api/llm_query`
  - upload and utility endpoints

Frontend:

- `web/static/app.js` and `web/static/js/app-runtime.js` contain the large legacy/runtime UI.
- `web/static/js/analysis/special-investigation/network.js` renders a static SVG-style
  relation network panel for special investigation scenarios.
- `web/static/js/analysis/general-investigation/workbench.js` includes `network` as an available service.
- `web/static/js/analysis/customs/*` handles customs investigation tabs and company workflows.

Current network UI appears mostly static/demo-driven in the special investigation panel.
Agent output is text-based rather than a first-class graph JSON API.

## Neo4j Candidate Nodes

High-priority nodes:

- `Company`: from `company_profiles`
- `Declaration`: from `import_declarations`
- `RiskScore`: from `import_risk_scores`, or modeled as properties/indicator nodes
- `Person`: from `risk_person_profile`
- `Organization`: from `risk_org_profile`
- `Case`: from `smuggling_case`
- `Evidence`: from `evidence_source`
- `AnalysisResult`: from `analysis_result`
- `RiskIndicator`: from `risk_indicator`
- `Country`: inferred from `origin_country`, `transit_country`, `major_export_countries`
- `HsCode`: inferred from `import_declarations.hs_code`
- `Item`: inferred from `import_declarations.item_name`
- `Broker`: inferred from `company_profiles.customs_broker_firm`
- `RelatedCompany`: inferred from `company_profiles.related_companies`
- `Industry`: inferred from `industry_code`

## Neo4j Candidate Relationships

Company/import graph:

- `(Company)-[:FILED]->(Declaration)`
- `(Declaration)-[:USES_HS_CODE]->(HsCode)`
- `(Declaration)-[:DECLARES_ITEM]->(Item)`
- `(Declaration)-[:ORIGINATED_FROM]->(Country)`
- `(Company)-[:HAS_RISK_SCORE]->(RiskScore)`
- `(Company)-[:USES_BROKER]->(Broker)`
- `(Company)-[:HAS_RELATED_COMPANY]->(RelatedCompany)`
- `(Company)-[:IN_INDUSTRY]->(Industry)`
- `(Company)-[:EXPORTS_TO]->(Country)`

Existing dynamic network-agent graph:

- `(RelatedCompany)-[:EQUITY_OR_AFFILIATE]->(Company)`
- `(Country)-[:SUPPLIES_TO {count,total_value,review_count}]->(Company)`
- `(Company)-[:SERVICE_RELATION]->(Broker)`

Risk-person graph:

- `(Person)-[:INVOLVED_IN]->(Case)` from `person_case_link`
- `(Person)-[:RELATED_TO {relation_type,weight,confidence_score}]->(Person)` from `network_edge`
- `(Person)-[:CONNECTED_TO {relation_type,weight,confidence_score}]->(Organization)` from `network_edge`
- `(Person)-[:LINKED_TO_CASE {relation_type,weight,confidence_score}]->(Case)` from `network_edge`
- `(Case)-[:SUPPORTED_BY]->(Evidence)`
- `(NetworkEdge)-[:SUPPORTED_BY]->(Evidence)` if edge provenance is modeled as a node
- `(Person)-[:HAS_RISK_INDICATOR]->(RiskIndicator)`
- `(Person)-[:HAS_ANALYSIS_RESULT]->(AnalysisResult)`
- `(Case)-[:ORIGINATED_FROM]->(Country)`
- `(Case)-[:TRANSITED_THROUGH]->(Country)`

## Recommended First Neo4j Sample Scope

For the first sample load, use two graph slices:

1. Risk-person investigation graph
   - `risk_person_profile`
   - `risk_org_profile`
   - `smuggling_case`
   - `network_edge`
   - `person_case_link`
   - `evidence_source`
   - `risk_indicator`

2. Company import-risk graph
   - `company_profiles`
   - `import_declarations`
   - `import_risk_scores`

The risk-person graph should be first because `network_edge` already stores explicit graph
edges. The company graph should be second because relationships must be derived from
columns such as `related_companies`, `customs_broker_firm`, `origin_country`, and `hs_code`.

## Early Graph Model Draft

Minimum sample model:

```text
(:Person {person_id, name, risk_level, risk_score, risk_tags})
(:Organization {org_id, org_name, org_type, country, risk_score})
(:Case {case_id, case_no, case_type, case_status, detection_date})
(:Evidence {source_id, source_type, source_title, reliability_score})
(:Company {company_id, company_name, industry_code, risk_level, risk_score})
(:Declaration {declaration_no, hs_code, item_name, declared_value, status})
(:Country {code_or_name})
(:HsCode {code})
(:Broker {name})
(:RelatedCompany {name})
```

Minimum relationships:

```text
(:Person)-[:INVOLVED_IN]->(:Case)
(:Person)-[:RELATED_TO]->(:Person)
(:Person)-[:CONNECTED_TO]->(:Organization)
(:Case)-[:SUPPORTED_BY]->(:Evidence)
(:Company)-[:FILED]->(:Declaration)
(:Declaration)-[:ORIGINATED_FROM]->(:Country)
(:Declaration)-[:USES_HS_CODE]->(:HsCode)
(:Company)-[:USES_BROKER]->(:Broker)
(:Company)-[:HAS_RELATED_COMPANY]->(:RelatedCompany)
```

## Open Questions For Phase 2

- Should Neo4j be installed with Docker, Neo4j Desktop, or direct server install?
- Should sample Neo4j data be loaded from all rows or from a smaller demo subset?
- Should `network_edge.relation_type` become dynamic relationship types, or remain a
  generic relationship with `relation_type` property?
- Should evidence provenance be attached directly as relationship properties or as
  separate `Evidence` nodes?
- Should the existing `agent_network.py` keep DuckDB fallback behavior when Neo4j is not running?

## Phase 1 Conclusion

The project is ready for a staged Neo4j introduction. The safest path is:

1. Keep DuckDB as the source-of-truth store.
2. Add Neo4j as a derived graph-analysis store.
3. First load explicit `network_edge` person/case/org graph data.
4. Then derive company import-risk graph relationships from existing DuckDB columns.
5. Add a Neo4j service module and keep DuckDB fallback in existing agents.
