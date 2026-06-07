"""Agent: 조사보고서 RAG 단일 키워드 검색.

agent_rag_source 가 5종 RAG(customs/trade/audit/investigation/global)을
시나리오 기반으로 묶어 호출하는 반면, 본 에이전트는
임의의 자연어 질의로 ChromaDB 의 조사보고서 컬렉션을 단발성 검색하는 용도.

- 시나리오에 `audit_search_query` 가 있으면 그것을 사용
- 없으면 `db_result` + `company_id` 로 자동 질의 구성
"""
try:
    from langchain_chroma import Chroma
except ImportError:
    Chroma = None

from src.agents.state import CustomsState
from src.agents.scope import company_id as scoped_company_id, prompt_text, is_no_company_id, target_query_terms
from src.config import CFG
from src.embeddings import get_embeddings, get_init_error
from src.paths import CHROMA_DIR

_vectorstore = None
_init_error: str | None = None

if Chroma is not None:
    try:
        embeddings = get_embeddings()
        if embeddings is None:
            _init_error = get_init_error() or "임베딩 초기화 실패"
            print(f"[AuditSearch] 임베딩 초기화 실패: {_init_error}")
        else:
            _vectorstore = Chroma(
                collection_name="rag_audit",
                persist_directory=str(CHROMA_DIR),
                embedding_function=embeddings,
            )
    except BaseException as exc:
        _init_error = f"{type(exc).__name__}: {exc}"
        _vectorstore = None
        print(f"[AuditSearch] Chroma 초기화 실패: {_init_error}")


def _resolve_query(state: CustomsState) -> str:
    """시나리오 우선, 없으면 기존 분석 결과로 자동 질의 구성."""
    scenario = state.get("scenario") or {}
    explicit = (scenario.get("audit_search_query") or "").strip()
    if explicit:
        return explicit

    cid = scoped_company_id(state)
    parts = [
        prompt_text(state),
        *target_query_terms(state),
        state.get("company_result") or "",
        state.get("db_result") or "",
    ]
    if not is_no_company_id(cid):
        parts.append(cid)
    return "\n".join(p for p in parts if p and "연관정보 없음" not in p).strip()


def agent_audit_search(state: CustomsState) -> CustomsState:
    """과거 조사보고서를 단일 키워드로 빠르게 검색."""
    query = _resolve_query(state)
    if not query:
        return {**state, "audit_search_result": "[조사보고서 RAG 검색 결과]\n- 검색할 프롬프트나 대상 정보가 없습니다.\n- 연관정보 없음: 임의 키워드로 검색하지 않습니다."}
    print(f"[Agent] 조사보고서 검색 시작: {query[:60]}…")

    if _vectorstore is None:
        if _init_error:
            result = (
                f"조사보고서 RAG 사용 불가 — Chroma 초기화 실패: {_init_error}\n"
                "(서버 다른 단계는 정상 동작합니다. chromadb 패키지 버전을 확인해주세요.)"
            )
        else:
            result = (
                "조사보고서 RAG 검색을 사용할 수 없습니다 "
                "(langchain_community / chromadb 패키지 미설치)."
            )
        print("[Agent] 조사보고서 검색 스킵")
        return {**state, "audit_search_result": result}

    try:
        scenario = state.get("scenario") or {}
        top_k = max(1, min(int(scenario.get("audit_search_top_k", CFG.rag.audit_top_k)), CFG.rag.audit_max_k))
        docs = _vectorstore.similarity_search(query, k=top_k)
    except BaseException as exc:
        return {
            **state,
            "audit_search_result": f"조사보고서 검색 실패: {type(exc).__name__}: {exc}",
        }

    if not docs:
        result = "관련 조사보고서를 찾지 못했습니다."
    else:
        lines = ["[조사보고서 검색 결과]"]
        for i, doc in enumerate(docs, 1):
            meta = doc.metadata or {}
            source = meta.get("source", "미상")
            year = meta.get("year", "-")
            violation = meta.get("violation_type", "-")
            snippet = " ".join((doc.page_content or "").split())[:240]
            lines.append(
                f"[{i}] {source} ({year}, {violation})\n    {snippet}…"
            )
        result = "\n".join(lines)

    print("[Agent] 조사보고서 검색 완료")
    return {**state, "audit_search_result": result}
