"""Transport route analysis simulation agent."""

from src.agents.llm_simulation import run_llm_simulation
from src.agents.state import CustomsState


def agent_route_analysis(state: CustomsState) -> CustomsState:
    result = run_llm_simulation(
        state=state,
        agent_name="운송경로 분석 Agent",
        mission="선적지, 경유지, 운송경로, 공급망을 역추적하여 우회수입과 원산지 세탁 가능성을 분석한다.",
        focus_items=[
            "선적국·경유국·원산지의 조합과 통상 운송경로 대비 이상 여부",
            "공급망 변경, 우회항로, 단기 경유 패턴",
            "고위험 항만·국가·운송업체 관련 신호",
            "수입신고, 적하목록, 선하증권 간 운송정보 불일치",
        ],
        output_format=[
            "운송경로 요약",
            "우회수입 의심 포인트",
            "공급망 역추적 가설",
            "추가 확인할 운송·물류 자료",
        ],
        fallback="# 운송경로 분석 Agent 결과\n\nLLM을 사용할 수 없어 운송경로 분석 시뮬레이션을 생성하지 못했습니다.",
    )
    return {**state, "route_analysis_result": result}
