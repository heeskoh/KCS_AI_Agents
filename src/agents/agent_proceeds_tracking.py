"""Criminal proceeds tracking simulation agent."""

from src.agents.llm_simulation import run_llm_simulation
from src.agents.state import CustomsState


def agent_proceeds_tracking(state: CustomsState) -> CustomsState:
    result = run_llm_simulation(
        state=state,
        agent_name="범죄수익 추적 Agent",
        mission="관세범죄 의심 거래의 자금흐름, 계좌 추적 단서, 환치기·차명거래 가능성을 정리한다.",
        focus_items=[
            "수입대금, 송금 주체, 수취 계좌, 제3자 지급 가능성",
            "계약금액과 실제 송금액 차이",
            "반복 소액 송금, 분산 입금, 우회 송금 패턴",
            "특수관계자 또는 관계망 분석 결과와 자금흐름의 연결",
        ],
        output_format=[
            "자금흐름 가설",
            "추적 대상 계좌·거래 단서",
            "범죄수익 은닉 가능성",
            "금융자료 요청 항목과 우선순위",
        ],
        fallback="# 범죄수익 추적 Agent 결과\n\nLLM을 사용할 수 없어 범죄수익 추적 시뮬레이션을 생성하지 못했습니다.",
    )
    return {**state, "proceeds_tracking_result": result}
