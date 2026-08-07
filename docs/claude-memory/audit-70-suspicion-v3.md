---
name: audit-70-suspicion-v3
description: 관세조사(audit) 기업 70개 체계 — 의심유형 5종 분포·위험도 밴드·gen_audit_suspicion_v3.py
metadata:
  type: project
---

2026-08-07 관세포탈 대시보드 대상(entity_role='audit')을 70개(C-1001~C-1070, 신규 C-1041~70 +450신고)로
재구성. 의심유형(지표율≥50) 분포: 품목분류(hs) 30 / 저가신고(underval) 23 / 원산지우회(fta) 25 /
지식재산권(related_party=권리사용료) 12 / 환급(refund) 7 — 97태그, 27개사 2유형 중복.
위험도 밴드: ≥90 조사필요 6 / 70~90 심사필요 17 / 50~70 18 / <50 29.

- 생성기: `data/scripts/gen_audit_suspicion_v3.py` (멱등). 배정계획(PLAN)→근거 선생성→
  src.risk_indicators 엔진으로 목표점수까지 단위근거 추가(저장=재계산 유지). 수사대상 기업은 불변
  (기업단위 삭제·삽입, id는 max+1 연속).
- **audit 종합 risk_score = 0.6*최고지표 + 0.32*차상위 + 0.08*나머지평균** (기존 6지표 평균 아님 —
  main의 generate_company_risk_profiles.py generate_all을 다시 돌리면 이 분포가 깨진다. audit 재생성은
  반드시 gen_audit_suspicion_v3.py 사용).
- 기존 저가갭(신고서 벤치마크 하회) 기업은 U그룹에 강제 배정해 "미배정인데 지표≥50" 모순 방지.
- 대시보드 경보카드(app-runtime.js RISK_DASH_FOCUS): 외환(offshore_fund) 카드 제거, 원산지 우회
  (origin/fta_origin_misuse) 카드 추가, 라벨 저가신고/품목분류/지식재산권/환급 이상으로 변경.
- 실행 순서: gen_audit_suspicion_v3 → migrate_hsk_global_hs → reconstruct_mandatory →
  backfill_optional → load_company_import_graph_to_neo4j --clear ([[global-hs-migration-required]]).
- 재구성 직전 백업: `data/customs.backup-pre-audit70.duckdb` (git 미포함).

**Why:** 사용자 요구 — 70개사·유형별 30/23/7/12/25 분포·위험도 적절 분포. 기존 audit 40개는 지표가
전반적으로 낮아(평균 5~17) 조사필요/심사필요가 0이었음.
**How to apply:** DB 전면 재구축 시 v2 파이프라인 뒤에 gen_audit_suspicion_v3.py를 실행해야 이 분포가
복원된다. 유형 수를 바꿀 때는 PLAN 상수만 수정. [[risk-model-v2-pipeline]] [[risk-indicator-redesign]]
