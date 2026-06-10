"""Origin analysis simulation agent."""

from src.agents.llm_simulation import run_llm_simulation
from src.agents.state import CustomsState


def agent_origin_analysis(state: CustomsState) -> CustomsState:
    result = run_llm_simulation(
        state=state,
        agent_name="원산지 분석 Agent",
        mission="수입신고 품목의 원산지 증빙, FTA 적용, 실질적 변형 기준 충족 여부를 검토한다.",
        focus_items=[
            "원산지증명서 발급기관, 발급일, 협정세율 적용 가능성",
            "품목별 원재료 구성과 실질적 변형 기준 충족 여부",
            "선적국, 원산지, 공급자 소재지 간 불일치",
            "우회수입 또는 제3국 단순 경유 가능성",
        ],
        output_format=[
            "원산지 판단 요약",
            "증빙 불일치 또는 추가 확인 항목",
            "FTA 적용 리스크",
            "추가 확보 서류와 조사 질문",
        ],
        fallback="# 원산지 분석 Agent 결과\n\nLLM을 사용할 수 없어 원산지 분석 시뮬레이션을 생성하지 못했습니다.",
    )
    return {**state, "origin_analysis_result": result}
