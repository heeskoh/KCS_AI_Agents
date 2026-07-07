# Memory Index

- [standalone 데모 빌드](standalone-demo-build.md) — 실제 SPA+API스냅샷+SSE녹화를 단일 HTML로 재생, tools/build_standalone_demo.py

- [검증용 서버 종료 규칙](stop-verify-server-after-work.md) — 검증 끝나면 8001 프리뷰 서버 항상 종료, 8000은 사용자 본 서버
- [workspace_state.json 우선 적용](workspace-state-overrides-code-defaults.md) — 권한·시나리오 기본값 변경 시 저장 상태도 함께 갱신 필요
- [위험지표 재설계 방향](risk-indicator-redesign.md) — 6종 지표를 근거데이터에서 산출, 통합 11테이블+company_risk_indicator, 45개 전체 재생성, Phase 0~4
- [수입신고 4-테이블 스키마](import-declaration-4table-schema.md) — 신고서 5영역 정규화(헤더+품목+규격+세목), 헤더 대표값 컬럼 제거 금지(21개 소비처 의존)
- [기업 프로파일 수입신고 엣지 그래프 v2](company-graph-6node-5edge.md) — 수입신고=기업→품목 IMPORT_DECLARATION 엣지(출발항/거래처/관세사/위험기여 흡수), 노드7종, backfill_ports+backfill_trade_partners 선행 후 재적재
- [관계망 분석 vs 프로파일 관계망](network-analysis-vs-profile-network.md) — 관계망 분석(신규·데이터소스/파일 입력, workbench:true)은 프로파일 관계망(base)을 기본으로 구축
- [우범자 다자사건 시드](risk-person-multiactor-seed.md) — 사건당 다수 인물·가족/동반여행자·analysis 사건연계는 setup_risk_person_db.py가 시드(generate_person_risk_profiles 아님)
- [도메인 기준 엔터티 이름](domain-based-entity-naming.md) — 우범자/우범기업 이름은 우범영역(마약/외환/밀수)으로 재구성, rename_by_domain.py(setup_forex 끝에서 자동), neo4j 재적재 필요
- [위험모델 v2 파이프라인](risk-model-v2-pipeline.md) — 기업(관세조사/수사)·개인 죄종기반 전면재구성 Phase 0~6 실행순서·스크립트, 마약/외환 기업=org 그래프
- [관세조사 리뷰모드·사전분석결과](customs-review-prepared-results.md) — 탭4는 사전 준비 결과 표시(prepared_analysis_results.json), build_prepared_results.py로 생성, remapArchiveResults id 매칭
- [DB 재구축 후 필수 후처리](global-hs-migration-required.md) — global_hs 마이그레이션→필수/선택항목 보강→Neo4j 재적재 순서 실행 + 서버 재시작(DuckDB 캐시)
