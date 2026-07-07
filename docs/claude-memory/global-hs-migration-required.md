---
name: global-hs-migration-required
description: DB 재구축 후 필수 후처리 4종 — global_hs 마이그레이션·필수/선택항목 보강·Neo4j 재적재 + 서버 재시작
metadata: 
  node_type: memory
  type: project
  originSessionId: 4710970f-0d16-4c29-950b-345aaf09aff2
---

`data/customs.duckdb`를 v2 파이프라인으로 재구축하면 아래 멱등 후처리들이 커밋된 절차에 없어 누락된다. 누락 시 증상과 함께:

1. `python data/scripts/migrate_hsk_global_hs.py` — 없으면 과세가격평가·품목분류검증·수입신고검증 에이전트가 `global_hs` Binder Error로 실패.
2. `python data/scripts/reconstruct_import_declaration_mandatory.py` — 없으면 신고서 필수항목(신고인=관세사무소·담당자 filer_name/filer_representative, 화물관리번호 등)이 전부 NULL.
3. `python data/scripts/backfill_optional_declaration_fields.py` — 선택항목(운임·보험료·B/L 등) 보강.
4. `python data/scripts/load_company_import_graph_to_neo4j.py --clear` — 없으면 프로파일 관계망이 기업+위험요인만 남고 수입신고 체인(신고·품목·출발/도착항·해외거래처·관세사) 전체가 사라짐 (2026-07-08 실제 발생, 재적재로 복원). 우범자 그래프는 별도(`load_risk_person_graph_to_neo4j.py`).

**How to apply:** 1→2→3→4 순서로 실행 후 **실행 중인 web_server 프로세스 재시작** — DuckDB는 프로세스 내 동일 경로 인스턴스를 캐시해 스키마 변경(컬럼 추가)이 살아있는 서버에 보이지 않는다. Neo4j 그래프는 실시간 조회라 재시작 불필요. [[risk-model-v2-pipeline]] [[company-graph-6node-5edge]]
