# KCS AI Agents — 관세청 AI 데모 포털

관세청 AI 지능형 수사/조사 데모 SPA. 백엔드 `web_server.py`(stdlib http.server + DuckDB + Neo4j),
프론트 `web/static/js/app-runtime.js`(모놀리식 엔진) + `web/static/js/analysis/{customs,general-investigation,special-investigation,shared}`(도메인별 서브탭 모듈).

## 프로젝트 맥락 (필독)

과거 세션에서 축적한 설계 결정·데이터 파이프라인·주의사항이 `docs/claude-memory/`에 있습니다.
작업 시작 전 [docs/claude-memory/MEMORY.md](docs/claude-memory/MEMORY.md) 인덱스를 확인하고 관련 파일을 읽으세요.

## 핵심 주의사항

- **DB 재구축 후 필수 후처리 4종** (누락 시 에이전트 오류·관계망 결손): `docs/claude-memory/global-hs-migration-required.md` 참조.
  실행 후 web_server 프로세스 재시작 필요(DuckDB 인스턴스 캐시).
- **검증 서버**: 8000은 사용자 본 서버(불가침), 검증은 8001(`kcs-portal-verify` launch 설정) 사용 후 반드시 종료.
- **권한·시나리오 기본값 변경 시** `data/scenario_builder_config.json`(서버 저장분)도 함께 갱신 — 코드 기본값을 덮어씀.
- 관세조사 탭4는 리뷰모드(사전 준비 결과 표시): `data/prepared_analysis_results.json`,
  생성은 `python tools/build_prepared_results.py --base http://127.0.0.1:8001 --companies C-xxxx`.
- `data/customs.duckdb`·Neo4j 데이터·`.env`·`data/workspace_state/`는 git 미포함 — 클라우드 환경에서는 데모 실행 불가, 코드 작업만 가능.
