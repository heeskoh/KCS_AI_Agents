---
name: risk-indicator-redesign
description: 기업 위험지표 6종을 근거데이터 기반으로 재설계하는 진행 중 작업의 확정 방향
metadata: 
  node_type: memory
  type: project
  originSessionId: 13ca55f6-d9ad-48f0-bb33-b16033ea2391
---

기업 위험지표 6종(저가신고·특수관계·FTA원산지·관세환급·HS분류·역외자금) 재설계. 2026-06-15 기준: Phase 0~4 **머지·push**(2b383a1), Phase 5~6 **머지·push**(b3e1adb).

[수사 도메인 확장 — 일반/마약 person] 2026-06-15 구현·검증 완료, **main 미커밋**. 신규: `data/scripts/person_risk_source_schema.py`(person 근거 소스 10테이블 + risk_indicator에 domain·recommendation·related_refs 컬럼 추가), `src/person_risk_indicators.py`(일반/마약/외환 3도메인×6지표=18, compute+Rule, 회사 엔진 헬퍼 재사용), `data/scripts/generate_person_risk_profiles.py`(우범자별 연계사건에서 근거 도출→6지표 산출, drug/general 도메인 자동판정). 수정: setup_risk_person_db.py(생성기 호출+risk_indicator INSERT 컬럼명시화), web_server.py(/api/risk-person-profile에 risk_indicators 코드맵+domain+recommendation), general-investigation/profile.js·special-investigation/profile.js(근거 bullet 렌더, 회사 .risk-reason/.risk-reco 재사용). 우범자 100명(일반13/마약87) 정합성위반 0·저장=재계산 확인. **외환(forex) 도메인은 person측 데이터모델 부재로 다음 차수 보류**(스키마/엔진엔 fx 지표 정의는 있으나 생성기·표시 미적용). Phase 5(프론트): web_server.py /api/company가 company_risk_indicator 반환, app-runtime.js 프로파일 패널이 지표 막대 아래 근거 bullet+권고 렌더(.risk-reason/.risk-reco CSS). Phase 6(LLM): src/agents/agent_risk_profile.py — 데이터 기반 지표를 LLM이 내러티브 조사 프로파일로 종합(점수 불변, 서술만 보강), module_registry에 'risk_profile' 등록, state.py risk_profile_result 키 추가. LLM provider는 사용자 .env(현재 openai/gpt-4o) 따름. 신규파일: `data/scripts/risk_source_schema.py`(14소스+company_risk_indicator DDL), `src/risk_indicators.py`(산출엔진+Rule1~5), `data/scripts/generate_company_risk_profiles.py`(STEP1~12 생성기). 수정: setup_db.py([5/5] 단계로 generate_all 호출, 난수 산출 함수 제거), load_company_import_graph_to_neo4j.py(HAS_RISK_INDICATOR 엣지). 45개 재생성 시 정합성 위반 0건·저장값=재계산값 확인. Neo4j RiskIndicator 6노드+HAS_RISK_INDICATOR 270엣지. 다음 차수: Phase 5(프론트 근거 bullet UI)·Phase 6(LLM 생성). 확정 방향:

- **산출 방식**: 근거 데이터를 먼저 생성하고 지표를 그로부터 계산(데이터→점수). 난수 기반 `setup_db.py::_generate_risk_detail_rates()` 대체. 이로써 정합성 Rule 1~5가 검사가 아닌 설계상 불변식이 됨.
- **소스 테이블**: 명세 22개를 통합 ~11개로(price_benchmark, valuation_audit, related_party, transfer_pricing_audit, fta_claim, origin_verification, drawback, drawback_audit, export_declaration, hs_classification_event, fx_transaction+offshore_company+forex_investigation) + 근거 저장용 `company_risk_indicator` 테이블 신설.
- **적용 범위**: customs.duckdb 기존 45개 기업 포함 전체 재생성.
- **이번 구축 범위**: Phase 0~4 (스키마·생성기 STEP1~12·산출엔진 `src/risk_indicators.py`·정합성 게이트·Neo4j 전파). Phase 5(프론트 근거 bullet UI)·Phase 6(LLM 생성 경로)는 다음 차수.

**Why**: 현재 지표는 결과 숫자만 입력돼 근거가 없고 22개 소스 테이블이 전무. 사용자는 "지표 높으면 관련 이력 존재" 원칙과 근거 설명을 요구.
**How to apply**: 신규 지표 근거는 [[workspace-state-overrides-code-defaults]]처럼 코드 기본값과 저장상태 양쪽을 함께 갱신해야 할 수 있음. Neo4j 전파는 우범자 그래프의 "근거=엣지" 철학(ANALYZED_BY/CASE_* 패턴)과 일관되게 HAS_RISK_INDICATOR 엣지로.
