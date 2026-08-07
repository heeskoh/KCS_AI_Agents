---
name: crime-knowledge-registry
description: 관세범죄 지식 레지스트리 — 수사 플랫폼 AI 가이드라인(입증체인 C→F→E→A+G) 구조와 통합 지점
metadata:
  type: project
---

2026-08-07 수사 플랫폼(관세수사/generalinv)을 지식 레지스트리 기반 AI 수사 가이드라인
플랫폼으로 개편. 마스터는 `data/관세범죄_지식레지스트리.xlsx`(v0.1, 시트 9개) →
`data/scripts/build_crime_registry.py` → `data/crime_knowledge_registry.json` →
`/api/crime-registry` (web_server.py).

- **입증 체인**: C 죄명(19, 전개완료 8) → F 요증사실(50, F-O/F-S/F-P 3계층) → E 증거항목(56)
  → A 수집행위(16) + G 게이트(G1 자동수집/G2 임의조사/G3 영장·공조/G4 범칙조사). MAP 128행이 본체.
- **프론트 빌더**: `web/static/js/analysis/general-investigation/knowledge-registry.js` —
  혐의(k1~k9 유형/수법) → C코드 접합(CATEGORY_TO_CCODES/OFFENSE_TO_CCODES), F세트 전개
  (F-GEN 공통 상속 조건부), 운영규칙 반영(R-C1~C4 분기 안내·R-C5 미전개 경고·R-E1/E2/E3 경고·
  R-E5 휘발성 정렬·R-E6 즉시착수·R-E4 게이트 배지). guideProgress()가 입증 진도 산출
  (충족 = 필수◎ 증거 전부 확보, 절차 항목은 분모 제외).
- **기초데이터분석 자동 수행**: 사건 등록 즉시(events.js) `gisAutoBaseAnalysis`(app-runtime.js)가
  G1·A-01 내부자료 대사(회사/개인 API 조회)를 백그라운드 실행 → `aCase.baseAnalysis`에 저장
  (workspace_state로 영속) → 수사 프로파일 상단 패널(profile.js baseAnalysisPanelHtml)에 표시.
  자동 확보 G1 증거: 신고 있으면 E-101/E-103/E-108, 환급 있으면 E-106, 개인 사건 있으면 E-104/E-105.
- **증거수집 가이드 패널**: 워크벤치(탭 id는 "scenario" — "AI수사 증거 수집/분석") 2단계 상단
  `gisGuidelineHtml` — 죄명 칩·분기규칙·입증진도바·F 체크리스트·증거 칩(◎/○·게이트·휘발성·
  즉시발송·확보/수집중). 칩 클릭 → 증거수집 항목 등록(eCode 부여, G2+는 "신청 필요" 상태),
  결과 등록되면(status "결과 등록됨") 확보로 집계되어 진도 갱신.

**Why:** 사용자 요구 — 수사를 지식 레지스트리의 AI 가이드라인(기초분석 자동 → 증거수집 →
범죄 입증)에 따라 진행하는 플랫폼으로 전환.
**How to apply:** 레지스트리 갱신 시 xlsx 교체 후 build_crime_registry.py 재실행(멱등).
미전개(2차) 죄명 10건의 F 세트가 추가되면 매핑만으로 가이드가 자동 확장된다.
R-E2 판정은 보유주체가 업체·개인이 아니면 외부증거로 간주(규칙 명시 3종 포함).
[[risk-model-v2-pipeline]]
