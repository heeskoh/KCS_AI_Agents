import os
import duckdb
import warnings
from src.paths import DB_PATH

from dotenv import load_dotenv
from langchain.tools import tool
from langchain_openai import ChatOpenAI
# from langchain.agents import create_agent  
from langgraph.prebuilt import create_react_agent  # ✅ 이걸 그대로 사용
# ✅ LangGraph로 변경

warnings.filterwarnings("ignore")  # ✅ 경고 숨기기

# .env 에서 API 키 로드
load_dotenv()

# DuckDB 연결
conn = duckdb.connect(str(DB_PATH), read_only=True)


@tool
def run_sql(query: str) -> str:
    """
    수입신고 DuckDB를 SQL로 조회합니다.
    테이블: company_profiles, import_declarations, import_risk_scores
    SELECT 문만 사용 가능합니다.
    """
    try:
        if not query.strip().upper().startswith("SELECT"):
            return "오류: SELECT 문만 허용됩니다."
        result = conn.execute(query).df()
        if result.empty:
            return "조회 결과가 없습니다."
        return result.to_string(index=False)
    except Exception as e:
        return f"SQL 오류: {str(e)}"

@tool
def get_schema(table_name: str) -> str:
    """
    테이블 컬럼 구조를 확인합니다.
    사용 가능한 테이블: company_profiles, import_declarations, import_risk_scores
    """
    try:
        result = conn.execute(f"DESCRIBE {table_name}").df()
        return result.to_string(index=False)
    except Exception as e:
        return f"오류: {str(e)}"

# ✅ LangGraph 방식 Agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [run_sql, get_schema]

agent = create_react_agent(
    model=llm,
    tools=tools,
    prompt="당신은 관세조사 전문 AI입니다. 수입신고 DB를 조회하여 업체의 위험도를 분석합니다."
)

# 실행 테스트
print("🔍 조회 중...")
result = agent.invoke({
    "messages": [{"role": "user", "content": "9876543210 업체의 수입신고 이력과 위험점수를 조회해줘"}]
})

# 최종 답변 출력
print("\n✅ 결과:")
print(result["messages"][-1].content)
