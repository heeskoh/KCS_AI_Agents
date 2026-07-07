---
name: risk-person-multiactor-seed
description: 우범자 원천 데이터의 다자사건·가족/동반여행자 관계·analysis 사건연계는 setup_risk_person_db.py가 시드함
metadata: 
  node_type: memory
  type: project
  originSessionId: 0d28a42f-084c-47c5-98ad-0bd6446833a8
---

우범자(개인) 관계망 재설계를 위해 2026-06-16 원천 데이터를 보강함. **핵심 테이블 시드는 `generate_person_risk_profiles.py`가 아니라 [setup_risk_person_db.py](data/scripts/setup_risk_person_db.py)** (smuggling_case·person_case_link·network_edge·analysis_result 생성). generate_person_risk_profiles.py는 이를 읽어 근거테이블·risk_indicator(person)만 산출하며 setup 끝에서 자동 호출됨.

보강 내용:
- **다자사건**: 기존 "사건당 인물 1명" → 대표사건(SC-i) 100건에 공동연루자 1~3명을 서로 다른 역할로 추가(person_case_link 650→856). 예) SC-0001 = 모집책·자금책·연락책·공범 4명. → "사건 속 다른 역할의 인물들" 그래프 가능.
- **가족관계(42)·동반여행자(33)** 인물↔인물 network_edge 신규. 공범(공동연루자 owner↔co) 212.
- **analysis_result.linked_case_id** 컬럼 추가(끝에) + 100% 채움 → 분석결과를 사건 엣지에 연결 가능. 기존 DB는 create_schema의 ALTER로 마이그레이션.

**Why/How to apply:** 다음 단계인 우범자 Neo4j 그래프 재설계([[company-graph-6node-5edge]]와 대칭) 입력이 이 데이터임. 현재 [load_risk_person_graph_to_neo4j.py](data/scripts/load_risk_person_graph_to_neo4j.py)는 아직 "사건당 1명" 가정의 hub 모델([[neo4j_risk_person_graph_model]] 문서)이라, 다자사건·가족·동반여행자를 노드/엣지로 노출하려면 로더·문서·프런트 라벨 갱신 필요. setup 재실행은 `python data/scripts/setup_risk_person_db.py`. 콘솔 인코딩 오류 방지로 `$env:PYTHONIOENCODING='utf-8'`.
