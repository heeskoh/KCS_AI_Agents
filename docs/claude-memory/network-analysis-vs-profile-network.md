---
name: network-analysis-vs-profile-network
description: 관계망 분석(신규·데이터소스/파일 입력)과 프로파일 내 관계망(base)의 역할 구분
metadata: 
  node_type: memory
  type: project
  originSessionId: 3ed7b106-72de-4903-8c45-018d5b2310fd
---

관계망 그래프는 두 기능으로 구분된다(공유 컴포넌트 `networkGraphPanelHtml(targetType, targetId, title, opts)`, `opts.workbench`로 분기).

- **프로파일 내 관계망 (base, 기본)**: `profileNetworkLayout(...)`(workbench 없음). customs/general/special `profile.js`에서 호출. 회사는 `company_profile`(수입신고 허브 4-뷰 원인분석) 그래프. → [[company-graph-6node-5edge]]
- **관계망 분석 (신규 기능, 독립 탭)**: page id `model`("관계망 분석" 메뉴) = `customsOntologyPage()` → `networkGraphPanelHtml("explore","main",..., {workbench:true, explore:true})`. 프로파일 비종속 **자유 관계분석**. (구 정적 SVG 온톨로지 목업은 2026-06-22 교체됨.) special-investigation `network.js`의 워크벤치(선택 대상 중심)와 별개로, **시드/파일/필터로 직접 그래프 구성**.
  - **B 교차 그래프**: `build_explore_graph(company_ids, person_ids, region, risk_level, industry)` → `/api/graph/explore?companies=&persons=&region=&risk_level=&industry=`. 다중 시드 합집합 + 속성 필터. 공유 노드(항만·거래처·관세사·품목분류·위험요인)가 기업을 자연 교차연결.
  - **C 분석 기법**: `computeAnalysis`(network-graph.js)에 community(라벨전파)·betweenness(Brandes)·bridges(Tarjan 단절점)·shared_hub(공유 허브 교차, 2-hop 기업 도달) 추가. HUB_LABELS = 항만·거래처·관세사·품목분류·위험요인.
  - 프론트 상태: `explore` 진입 시 `loadEntities()`로 `/api/companies`(={companies:[]})·`/api/risk-persons`(={persons:[]}) 1회 로드. 시드/필터 변경 → `reloadGraph`. 4-뷰 토글·프로젝션은 explore에도 적용(`targetType==='explore'`).

**Why:** 사용자가 2026-06-22 명시: "관계망 분석은 데이터 소스·파일을 입력하여 최적의 관계망 분석을 위한 신규 기능이며, 현재 관계망분석은 프로파일 내의 관계망을 기본으로 하여 구축한다."

**How to apply:** ① 프로파일 관계망 변경(노드/엣지/4뷰)은 base이므로 관계망 분석 워크벤치에도 그대로 반영됨. ② 관계망 분석 "최적 분석"의 핵심 가치는 단일 기업 ego를 넘어 **여러 소스·파일 결합 확장 그래프**(교차분석: 공유 허브 군집·중심성 등) — 현재 base `company_profile`은 단일 기업이라 교차분석 제한. 확장 시 이 점 고려. ③ 워크벤치 전용 기능을 프로파일(profileNetworkLayout, workbench 미사용)에 새지 않게 `opts.workbench`로 분기 유지.
