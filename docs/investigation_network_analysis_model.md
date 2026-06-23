# 수사영역별 관계망 분석 정의서 (Investigation Network Analysis Model)

> 상태: **설계 정의(Design Definition)** — 승인 후 적재/API/프론트 구현 진행
> 대상 도메인: **관세수사 · 마약수사 · 외환수사**
> 대상 구분: **우범기업(company) · 우범자(person)**
> 관련 문서: [neo4j_graph_model.md](neo4j_graph_model.md), [neo4j_risk_person_graph_model.md](neo4j_risk_person_graph_model.md)

---

## 1. 목적과 범위

각 수사영역(관세/마약/외환)의 **데이터베이스 + 문서증거**를 기반으로, 대상(우범기업·우범자)
중심의 관계망 분석을 **도메인 인지형(domain-aware)** 으로 정의한다.

- 기존 단일 통합 그래프는 유지하고, **이벤트성 엣지(사건·위험지표·증거물·분석결과)에
  `domain` 속성**(`customs` / `drug` / `forex`)을 부여하여 프런트에서 도메인별로 필터·프로젝션한다.
- Main의 독립 "관계망 분석" 탭(page `model`)은 별도 플랫폼(`KCS_Investigation.html`, iframe)으로
  분리되어 있으므로 **본 정의서의 대상이 아니다.** 본 정의서는 **각 수사영역 프로파일 내부의
  관계분석**(`profileNetworkLayout` → `networkGraphPanelHtml`)을 다룬다.

### 1.1 SoT 원칙

- **DuckDB** = 분석 원천(Source of Truth). **Neo4j** = 파생 그래프 저장소(관계 탐색·시각화용).
- 노드/엣지 라벨은 안정적 영문, 원본 한글 분류값은 노드/엣지 속성으로 보존.

---

## 2. 수사 영역(죄종) → 도메인 매핑

17개 죄종은 3개 수사 도메인으로 귀속한다. 한 죄종이 복수 도메인에 걸치면 **주 도메인(primary)**
으로 분류하고, 사건 엣지의 `crime_types[]` 속성에 원본 죄종 배열을 보존한다.

**법적 근거(웹 검증)**: 도메인 구분은 관세청 조사국이 **특별사법경찰(특사경)** 로서 수사하는
관할 법률과 일치한다 — 관세법(customs) · 외국환거래법(forex) · 마약류관리법(drug) ·
대외무역법(무역안보). 죄종 대부분은 **관세법 제11장 벌칙(제269~282조)** 에 실제 근거가 있다.

| 죄종 | 관세법 조문 | 주 도메인 | 비고 |
| --- | --- | --- | --- |
| 금지품수출입죄 | 제269조① | customs | 대상이 마약류면 drug 보조태그 |
| 밀수입죄 | 제269조② | customs | 마약류 밀수면 drug |
| 밀수출입죄 | 제269조②③ | customs | 마약류면 drug |
| 밀수출·밀반송죄 | 제269조③ | customs | 마약류면 drug |
| 밀수품취득죄 | 제274조 | customs | **유통단계**(취득·양도·운반·보관) — 마약 공범망 연결에 활용 |
| 관세포탈죄 | 제270조① | customs | |
| 관세법위반죄 | (포괄) | customs | |
| 가격조작죄 | 제270조의2 | customs | |
| 허위신고죄 | 제276조 | customs | 질서벌적 |
| 부정수출입죄 | 제270조②③ | customs | |
| 부정감면죄 | 제270조④ | customs | |
| 부정환급죄 | 제270조⑤ | customs | |
| 대외무역법위반죄 | (대외무역법) | customs / **trade_security** | 전략물자·무역안보 — 별도 서브도메인 `trade_security` 태그 병행 |
| 남북교류협력 관련 법률 위반 | (남북교류협력법) | customs | 반출입 승인 위반 (원문 "남부교류협력"=남북교류협력으로 해석) |
| 외국환거래법위반죄 | (외국환거래법) | forex | 환치기·미신고 송금·재산도피 — 세관 특사경 직무 ✅ |
| 조세범처벌법 위반죄 | (조세범처벌법) | **(배경)** | **국세청 소관** — 세관 특사경 직무 밖. forex 사건의 *역외탈세 배경죄종* 으로만 `crime_types[]` 에 보존, 주 도메인 미부여 |
| 형법 | (형법) | (배경) | 사건 배경 죄종 — 주 도메인은 연계 사건에 따름 |
| 절도죄 | (형법) | (배경) | 일반수사(general) 연계 — 도메인 미지정시 general |

> **마약수사(drug)** 는 별도 죄종 목록이 아니라 위 죄종 중 **대상이 마약류(향정·대마 등)**
> 인 사건의 횡단 분류이다. 사건 엣지 `contraband_category="마약류"` → `domain="drug"`.
> 세관 운영상으로도 *"마약류범죄와 관세법위반을 함께 수사"* 하므로 횡단 분류가 실제와 부합.

> **무역안보(trade_security)**: 관세청이 전략물자·무역안보 수사 전담체계를 가동 중이므로,
> 대외무역법위반은 customs 주 도메인에 더해 `trade_security` 보조태그를 병행 부여하여
> 향후 독립 서브도메인 승격에 대비한다.

> **배경죄종 처리**: 조세범처벌법·형법·절도죄 등 세관 특사경 직무 밖 죄종은 노드/뷰의
> 주 도메인을 만들지 않고, 연계 사건 엣지의 `crime_types[]` 배열에만 보존하여 맥락을 유지한다.

---

## 3. 대상(Target) 구분

| 대상 | 라벨 | 자연키 | 도메인 가용성 |
| --- | --- | --- | --- |
| 우범기업 | `Company` | `company_id` | 관세 ✅ / 마약 ✅ / 외환 ✅ |
| 우범자 | `Person` | `person_id` | 관세 △(기업 대표·관계인) / 마약 ✅ / 외환 ✅ |

- **관세수사**: 기본 대상은 기업. 인물은 대표자·특수관계인·관세사 등 **관련인**으로 등장.
- **마약수사·외환수사**: 기업·우범자 모두 1차 대상.

---

## 4. 노드 스키마 (역할 = 속성)

노드는 **엔티티 종류**로만 라벨링하고, "총책·자금책·조력자·송하인" 같은 **역할(role)은
노드 또는 엣지 속성**으로 표현한다(요청사항 반영).

| 분류 | 라벨 | 자연키 | 핵심 속성 |
| --- | --- | --- | --- |
| 우범기업 | `Company` | `company_id` | `company_name, risk_level, risk_score, industry_code, region, is_subject(bool)` |
| 우범자 | `Person` | `person_id` | `name, risk_level, risk_score, nationality, role(총책/자금책/조력자/운반책…), is_subject(bool)` |
| 관련기업 | `AffiliatedCompany` | `name` | `relation_type(관계사/위장수입업체…)` |
| 관련인 | `RelatedParty` | `key`=`{owner}:{name}` | `relation_type(대표/주주/특수관계…), country, is_offshore, role` |
| 거래처(해외) | `OverseasSupplier` | `name` | `country, role(송하인/매수인)` |
| 관세사 | `Broker` | `name` | `firm` |
| 지역/국가(출발·경유·도착) | `Country` | `code`(ISO) | `name` — **방향은 노드가 아닌 엣지(CASE_FROM/VIA/TO)로 구분** |
| 출발(공)항 | `DeparturePort` | `code` | `name, country, mode(sea/air)` |
| 도착(공)항 | `ArrivalPort` | `code` | `name, country, mode(sea/air)` |

> **역할 속성 위치 규칙**: 대상 고유의 신분(예: 우범자의 총책/자금책)은 **노드 속성 `role`**,
> 특정 사건 안에서의 역할(예: 이 사건에서의 cargo_owner 여부)은 **사건 엣지 속성
> `role_in_case`** 로 둔다. 동일인이 사건마다 다른 역할이면 엣지 속성이 우선이다.

### 4.1 기존 모델과의 정합

- **[결정 (c)] 지역/국가는 `Country` 단일 노드로 통합**한다. 출발지·경유지·도착지의 방향성은
  노드 라벨이 아니라 **엣지(`CASE_FROM`/`CASE_VIA`/`CASE_TO`)로 구분**한다 → 같은 "중국"이
  방향마다 다른 노드로 쪼개지는 중복을 방지하고 교차분석(같은 국가 공유)을 자연스럽게 한다.
- 항만 모델(`DeparturePort`/`ArrivalPort`)은 기존 canonical 모델 재사용. `mode` 속성으로
  해상(sea)/항공(air) 구분을 추가하여 "출발항/출발공항"을 하나의 라벨로 표현.

---

## 5. 엣지 스키마 (4대 엣지군 + domain 속성)

요청한 4종 엣지군(사건·위험지표·증거물·분석결과)을 기본으로 한다. **모든 4대 엣지에
`domain` 속성**(`customs`/`drug`/`forex`)을 부여한다.

### 5.1 사건(Case) 엣지군

대상–주변 엔티티를 사건으로 연결. 사건 자체는 노드가 아닌 엣지(이벤트성)로 표현하되,
다자 사건은 대표주체 hub 패턴(`CASE_FROM`/`CASE_VIA`/`CASE_TO`)을 유지한다.

| 패턴 | 개념 | 핵심 속성 |
| --- | --- | --- |
| `(:Company|:Person)-[:CASE]->(:CaseType)` | 사건 유형 연루 | `domain, case_id, case_no, crime_types[], contraband_category, status, disposition, role_in_case, count` |
| `(:Person)-[:CONTROLS]->(:Company)` | **실소유·지배** (개인↔기업 관세사건 교량) | `domain, control_type(대표/실소유주/지분), shareholding_pct` |
| `(:Person)-[:CASE_FROM]->(:Country)` | 사건 출발지 | `domain, case_id` |
| `(:Person)-[:CASE_VIA]->(:Country)` | 사건 경유지 | `domain, case_id` |
| `(:Person)-[:CASE_TO]->(:Country)` | 사건 도착지 | `domain, case_id` |
| `(:Person)-[:CASE_LINK]->(:Person)` | 공범/연루 인물 | `domain, case_id, role_pair` |

> **관세범의 '신고' 매개 처리**: 관세범은 수입신고를 매개로 성립하나 신고주체는 통상 기업이다.
> 개인(대표·실소유주)을 관세 사건에 연결하려면 `(:Person)-[:CONTROLS]->(:Company)-[:FILED]->
> (:Declaration)` 경로로 교량한다. 이로써 관세 도메인의 "개인 관계분석"이 기업 통관 그래프와
> 자연 연결된다(§6.1 개인 행 참조).

> **범칙조사 상태값**: 관세범칙조사 특유의 처분단계를 `CASE` 엣지 `disposition` 속성에 보존한다
> — `통고처분 / 고발 / 무혐의 / 조사중`. 기존 `status`(검토/검사/보류)와 별개 축이다.

### 5.2 위험지표(RiskIndicator) 엣지군

대상의 위험지표를 위험요인 노드로 연결(원인분석 핵심). 도메인별 6지표.

| 패턴 | 개념 | 핵심 속성 |
| --- | --- | --- |
| `(:Company|:Person)-[:RISK_INDICATORS]->(:RiskScore)` | 종합위험값 | `domain, 6종 지표율` |
| `(:RiskScore)-[:DRIVEN_BY]->(:RiskFactor)` | 위험요인 구성 | `domain, score, reason` |
| `(:Declaration|:Evidence)-[:CONTRIBUTES_TO]->(:RiskFactor)` | 근거→지표 | `domain, weight` |

도메인별 RiskFactor `code` 세트(`src/risk_indicators.py`, `src/person_risk_indicators.py`):

- **customs(기업)**: `undervaluation, related_party, fta_origin_misuse, customs_refund, hs_classification, offshore_fund`
- **drug(우범자)**: `drug_route, drug_network, drug_small_batch, drug_concealment, drug_new_substance, drug_laundering`
- **forex(우범자)**: `fx_remittance, fx_hawala, fx_asset_flight, fx_offshore, fx_virtual_asset, fx_structuring` *(신규)*
- **general(우범자)**: `general_route, general_network, general_small_batch, general_prior_record, general_concealment, general_identity`

### 5.3 증거물(Evidence) 엣지군 — **신규**

압수문건·기초데이터(통신기록·금융거래기록 등)를 대상–관련 엔티티 사이의 증거 엣지로 표현.
증거 자체는 엣지 속성으로 흡수(이벤트성 원칙)하되, 통신·자금 상대가 **등록된 우범자/기업**이면
대상–상대 간 직접 증거 엣지를 만든다.

| 패턴 | 개념 | 핵심 속성 |
| --- | --- | --- |
| `(:Person)-[:COMMUNICATED_WITH]->(:Person)` | 통신 증거 | `domain, evidence_id, channel(메신저/전화/SMS), direction, count, period, case_ref` |
| `(:Person)-[:FUNDS_FLOW]->(:Person|:Company|:OverseasSupplier)` | 자금 증거 | `domain, evidence_id, txn_type(해외송금/현금입금/이체), amount_sum, count, period, scheme(차명/환치기/가상자산), case_ref` |
| `(:Person|:Company)-[:HAS_EVIDENCE]->(:CaseType)` | 증거→사건 연결 | `domain, evidence_id, evidence_type(통신/금융/포렌식), reliability, summary` |

> 증거 소스: `data/evidence/RP-XXXX/communication_record.json`,
> `financial_transaction_record.json`. `counterpart_person_id`/`counterpart_org_id` 로 링크.

> **[결정 (d)] 미등록 상대는 노드화하지 않는다.** 통신·자금 상대가 **등록된 우범자/기업/역외법인**
> (RP-/RO-/RO-OFF- ID)일 때만 대상–상대 노드 간 증거 엣지를 만든다. 미등록 상대(임의 전화번호·
> 계좌)는 노드를 만들지 않고 `(:Person)-[:HAS_EVIDENCE]->(:CaseType)` 엣지의
> `counterpart_label`(마스킹 텍스트)·`counterpart_count` 속성으로만 흡수한다 → 미확인 노드 노이즈 방지.

### 5.4 분석결과(AnalysisResult) 엣지군

AI/모델 분석결과를 대상–위험요인(또는 사건) 사이 엣지로 흡수.

| 패턴 | 개념 | 핵심 속성 |
| --- | --- | --- |
| `(:Company|:Person)-[:ANALYZED]->(:RiskFactor|:CaseType)` | 분석결과 | `domain, analysis_type, model_or_agent, output_summary, risk_score_before, risk_score_after, review_status, created_at` |

### 5.5 통관/관계 보조 엣지 (관세 도메인 재사용)

기업 canonical 모델의 통관 체인은 관세 도메인 관계분석에서 그대로 사용한다.

`FILED, OF_ITEM, FROM_PORT, TO_PORT, SUPPLIED_BY, FILED_BY, RELATED_PARTY, AFFILIATED_WITH`
— 이들은 구조적 관계이므로 `domain` 속성 없이 유지(필요 시 `customs` 기본).

---

## 6. 도메인 × 대상별 관계분석 정의

각 셀은 **시드(중심 노드) + 표시 노드/엣지 + 핵심 뷰**를 정의한다.

### 6.1 관세수사 (customs)

| 대상 | 시드 | 핵심 노드 | 핵심 엣지 | 뷰 |
| --- | --- | --- | --- | --- |
| 기업 | `Company` | Declaration, ItemClass, 항만, 거래처, 관세사, RiskScore/Factor, 관계사, 특수관계인 | FILED, OF_ITEM, FROM/TO_PORT, SUPPLIED_BY, FILED_BY, CONTRIBUTES_TO, RISK_INDICATORS, DRIVEN_BY, ANALYZED, CASE | 관계분석/원인분석/위험구성/경로분석 (기존 4뷰) |
| 개인 | `Person`(대표·실소유주·관계인) | Company, Declaration, RelatedParty, AffiliatedCompany | CONTROLS→FILED, RELATED_PARTY, AFFILIATED_WITH, CASE | 관계분석(개인→지배기업→통관 교량) |

### 6.2 마약수사 (drug)

| 대상 | 시드 | 핵심 노드 | 핵심 엣지 | 뷰 |
| --- | --- | --- | --- | --- |
| 우범자 | `Person` | 공범 Person, 거래처, 출발/도착 지역·항만, CaseType, RiskFactor | CASE, CASE_FROM/VIA/TO, CASE_LINK, COMMUNICATED_WITH, FUNDS_FLOW, RISK_INDICATORS, DRIVEN_BY, ANALYZED | 관계분석/경로분석(밀반입 경로)/위험구성/증거망 |
| 기업 | `Company` | 위장수입업체(AffiliatedCompany), 거래처, 관세사 | CASE, AFFILIATED_WITH, SUPPLIED_BY, FUNDS_FLOW | 관계분석/자금흐름 |

### 6.3 외환수사 (forex)

| 대상 | 시드 | 핵심 노드 | 핵심 엣지 | 뷰 |
| --- | --- | --- | --- | --- |
| 우범자 | `Person` | 역외법인(AffiliatedCompany), 차명 Person, 해외 거래처, 가상자산 흐름 상대 | FUNDS_FLOW(환치기/가상자산/차명), CASE, RISK_INDICATORS, DRIVEN_BY, ANALYZED | 관계분석/자금흐름(핵심)/위험구성/증거망 |
| 기업 | `Company` | 역외법인, 특수관계인, 해외 거래처 | RELATED_PARTY, AFFILIATED_WITH, FUNDS_FLOW, CASE | 관계분석/자금흐름 |

### 6.4 공통 4뷰 → 도메인 매핑

기존 프로파일 4뷰(`VIEW_MODES`)를 도메인별로 라벨/프로젝션 재정의한다.

| 공통 뷰 | 관세 | 마약 | 외환 |
| --- | --- | --- | --- |
| 관계분석 | 전체 관계 | 전체 관계 | 전체 관계 |
| 원인분석 | 신고→위험요인 | 사건/증거→위험요인 | 자금흐름→위험요인 |
| 위험구성 | RiskScore→Factor→신고 | RiskScore→Factor→증거 | RiskScore→Factor→자금 |
| 경로분석 | 출발항→도착항→거래처 | 출발지→경유→도착지(밀반입) | 송금 경유·역외 흐름 |

---

## 7. 외환(forex) 우범자 신규 샘플 데이터 설계

현재 외환 우범자 지표/데이터는 미구현 → 본 정의서에서 신규 설계, 승인 후 생성.

### 7.1 대상 규모 **[결정 (a) 확정]**

- 외환 우범자 **20명**(`RP-FX-0001`~`RP-FX-0020`) 신규, 기존 RP-XXXX 풀과 별개 ID 접두.
- 역외법인 **8개**(`RO-OFF-001`~`008`), 차명 인물 일부는 기존 RP 풀과 교차 링크.

### 7.2 소스 테이블 (이미 스키마 존재: `person_risk_source_schema.py`)

| 테이블 | 용도 | 그래프 매핑 |
| --- | --- | --- |
| `person_fx_transaction` | 해외송금(환치기/구조화/차명) | `FUNDS_FLOW {scheme}` |
| `person_asset_flight` | 재산 국외도피 | `FUNDS_FLOW {txn_type=도피}`, `CASE` |
| `person_offshore_link` | 역외법인 연계 | `(:Person)-[:AFFILIATED_WITH]->(:AffiliatedCompany {is_offshore})` |
| `person_virtual_asset_flow` | 가상자산(BTC/ETH/USDT) | `FUNDS_FLOW {scheme=가상자산}` |
| `risk_person_profile` | 우범자 기본정보 | `Person` |
| `risk_indicator(domain=forex)` | 외환 6지표 | `RISK_INDICATORS`/`DRIVEN_BY` |

### 7.3 외환 6지표 (신규, `src/person_risk_indicators.py` forex 분기 활성화)

`fx_remittance(해외송금 이상), fx_hawala(환치기·불법송금), fx_asset_flight(재산 국외도피),
fx_offshore(페이퍼·조세회피처 연계), fx_virtual_asset(가상자산 자금이동), fx_structuring(차명·분산거래)`

### 7.4 증거 파일

외환 우범자별 `data/evidence/RP-FX-XXXX/financial_transaction_record.json`
(해외송금·가상자산 흐름 중심), 필요 시 `communication_record.json`(환치기 브로커 연락).

---

## 8. 구현 단계 (승인 후 후속 작업)

1. **소스/지표**: `person_risk_indicators.py` forex 분기 활성화, `generate_person_risk_profiles.py`
   에 forex 도메인 분기 추가, 외환 샘플 시드 생성기(`setup_*` 또는 신규 스크립트).
2. **적재**: `load_risk_person_graph_to_neo4j.py` 에 `domain` 속성·`COMMUNICATED_WITH`·
   `FUNDS_FLOW`·`HAS_EVIDENCE` 엣지 추가. 증거 파일 → 엣지 변환 로직.
   지역 방향 분리(`DepartureRegion`/`ArrivalRegion`), 항만 `mode` 속성.
3. **API**: `src/neo4j_graph.py` 에 도메인 파라미터 추가
   (`build_person_network_graph(person_id, domain=...)`), `/api/graph/person?domain=` 확장.
4. **프론트**: `network-graph.js` 에 도메인별 `VIEW_PROJECTION`/`REL_LABEL_KO` 확장,
   `profileNetworkLayout` 호출부(관세/마약/외환 profile.js)에서 `domain` 전달.
5. **검증**: 도메인별 프로파일 진입 → 관계망 4뷰 렌더 + 증거망/자금흐름 뷰 확인.

---

## 9. 법적 타당성 검증 결과 (웹 조사)

본 설계는 관세법 벌칙체계 및 관세청 조사국 특별사법경찰 관할과 **부합**함을 확인했다.

- ✅ 죄종 17종 대부분이 **관세법 제11장 벌칙(제269~282조)** 에 실제 근거 보유.
- ✅ 3-도메인(관세/마약/외환)이 세관 특사경 관할 법률(관세법/마약류관리법/외국환거래법)과 일치.
- ✅ 엣지 `domain` + `crime_types[]` 방식이 **다법률 관할 사건**(한 사건이 복수 법률 위반)을 표현.
- 반영 완료: 조세범처벌법 배경죄종 격하, 밀수품취득죄(제274조) 추가, 대외무역법 `trade_security`
  보조태그, 개인↔기업 `CONTROLS` 교량, 범칙 `disposition` 상태값.

출처: 관세법 제270조(CaseNote), 관세청 조직개편(김·장), 관세 조사(세종), 무역안보 수사(Lexology).

## 10. 결정 확정 사항

- **(a) 확정**: 외환 우범자 20명 + 역외법인 8개 규모로 신규 생성.
- **(b) 확정**: `trade_security`(대외무역법·전략물자)는 **customs 보조태그로 유지**, 향후 승격 대비.
- **(c) 확정**: 지역/국가는 **`Country` 단일 노드로 통합**, 출발·경유·도착 방향은 엣지로 구분.
- **(d) 확정**: 증거 상대가 **등록 엔티티일 때만 노드 연결**, 미등록 상대는 엣지 속성으로 흡수.
