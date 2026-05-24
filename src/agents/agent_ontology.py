"""Customs ontology agent.

Builds an LLM-generated knowledge-graph style ontology for customs analysis
scenarios. The default example focuses on suspicious traveler monitoring.
"""

from src.agents.state import CustomsState
from src.llm import llm


_ONTOLOGY_PROMPT = """당신은 관세 지식그래프/온톨로지 설계 전문가입니다.
사용자 프롬프트와 선행 분석 결과를 바탕으로 OpenAI 기반 시뮬레이션 형태의 관세 업무용 의미 기반 온톨로지 예시를 작성하세요.

반드시 다음 관점을 포함하세요.
1. 우범여행자 중심 엔티티
2. 우범여행자의 관계자
3. 우범여행자 또는 관계자가 화주인 화물
4. 우범여행자 또는 관계자가 대표자인 기업의 화물
5. 감시·조사에서 사용할 관계, 속성, 추론 규칙, 예시 질의
6. 실제 시스템 연계 시 필요한 데이터 테이블과 필드

출력 형식:
- 온톨로지 목적
- 핵심 클래스
- 핵심 관계
- 주요 속성
- 추론 규칙
- 예시 트리플
- 활용 질의 예시
- 시스템 연계 데이터 예시

[사용자 프롬프트]
{prompt}

[선행 분석 결과]
{context}
"""


_FALLBACK_ONTOLOGY = """# 관세 온톨로지 Agent 결과

## 온톨로지 목적
우범여행자, 관계자, 기업, 화물, 수입신고, 여행자 휴대품 정보를 연결하여 감시·조사 단서를 의미 기반으로 탐색합니다.

## 핵심 클래스
- SuspiciousTraveler: 우범여행자
- RelatedPerson: 우범여행자의 관계자
- Company: 우범여행자 또는 관계자가 대표자인 기업
- Cargo: 우범여행자 또는 관계자와 연관된 화물
- ImportDeclaration: 수입신고
- TravelEvent: 입출국 또는 여행 이력
- RiskSignal: 위험 신호

## 핵심 관계
- hasRelatedPerson: 우범여행자 -> 관계자
- representsCompany: 우범여행자/관계자 -> 기업
- isShipperOf: 우범여행자/관계자 -> 화물
- companyShipsCargo: 기업 -> 화물
- cargoDeclaredBy: 화물 -> 수입신고
- hasRiskSignal: 여행자/기업/화물/신고 -> 위험 신호

## 주요 속성
- travelerId, passportNo, nationality, travelFrequency
- relationshipType, companyRole, businessRegistrationNo
- cargoHsCode, cargoItemName, declaredValue, originCountry
- riskScore, riskType, detectedAt

## 추론 규칙
- 우범여행자의 관계자가 화주인 화물은 `TravelerLinkedCargo`로 분류합니다.
- 우범여행자 또는 관계자가 대표자인 기업의 화물은 `TravelerControlledCompanyCargo`로 분류합니다.
- 동일 HS 코드·동일 출발국·반복 저가신고가 결합되면 `RepeatUndervaluationSignal`을 생성합니다.
- 여행 이력과 화물 반입 시점이 근접하면 `TravelCargoTemporalLink`를 생성합니다.

## 예시 트리플
- suspiciousTraveler:T001 hasRelatedPerson person:P091
- person:P091 representsCompany company:C-1001
- company:C-1001 companyShipsCargo cargo:CG-2026-001
- cargo:CG-2026-001 cargoDeclaredBy declaration:IMP-001
- declaration:IMP-001 hasRiskSignal risk:RepeatUndervaluationSignal

## 활용 질의 예시
- 특정 우범여행자와 2단계 이내 관계자가 화주인 최근 1년 화물 목록을 조회합니다.
- 우범여행자 관계자가 대표자인 기업 중 고위험 HS 코드를 반복 수입한 기업을 찾습니다.
- 입국 후 7일 이내 동일 국가발 화물 신고가 발생한 관계망을 탐색합니다.
"""


def _collect_context(state: CustomsState) -> str:
    keys = [
        "db_result",
        "rag_result",
        "web_result",
        "network_result",
        "declaration_verify_result",
        "hs_verify_result",
        "customs_value_result",
        "law_result",
    ]
    parts = []
    for key in keys:
        value = state.get(key)
        if value:
            parts.append(f"[{key}]\n{str(value)[:1200]}")
    return "\n\n".join(parts) if parts else "(선행 분석 결과 없음)"


def agent_ontology(state: CustomsState) -> CustomsState:
    """Generate a customs ontology example for semantic knowledge-graph analysis."""
    print("\n[Agent] 관세온톨로지 생성 시작")
    scenario = state.get("scenario") or {}
    prompt = scenario.get("user_prompt") or state.get("company_id") or ""
    context = _collect_context(state)

    if llm:
        try:
            result = llm.invoke(
                _ONTOLOGY_PROMPT.format(prompt=prompt, context=context[:5000])
            ).content
        except Exception as exc:
            print(f"[Agent] 관세온톨로지 LLM 실패: {exc}")
            result = _FALLBACK_ONTOLOGY
    else:
        result = _FALLBACK_ONTOLOGY

    print("[Agent] 관세온톨로지 생성 완료")
    return {**state, "ontology_result": result}
