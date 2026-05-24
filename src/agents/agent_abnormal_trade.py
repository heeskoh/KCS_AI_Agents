"""Abnormal trade verification simulation agent."""

from src.agents.llm_simulation import run_llm_simulation
from src.agents.state import CustomsState


def agent_abnormal_trade(state: CustomsState) -> CustomsState:
    result = run_llm_simulation(
        state=state,
        agent_name="이상거래 검증 Agent",
        mission="거래가격, 거래상대방, 반복 정정, 신고 패턴을 종합하여 이상거래 가능성을 검증한다.",
        focus_items=[
            "동종업종·동일 HS 대비 가격 편차",
            "반복 정정, 검사·보류, 고위험 상태 이력",
            "거래상대방 변경, 중개상 개입, 특수관계 가능성",
            "단가 급변, 과소·과대 신고, 물량 쪼개기 패턴",
        ],
        output_format=[
            "이상거래 의심 시나리오",
            "핵심 근거와 반대 근거",
            "위험도와 우선순위",
            "추가 검증 데이터와 질문",
        ],
        fallback="# 이상거래 검증 Agent 결과\n\nLLM을 사용할 수 없어 이상거래 검증 시뮬레이션을 생성하지 못했습니다.",
    )
    return {**state, "abnormal_trade_result": result}
