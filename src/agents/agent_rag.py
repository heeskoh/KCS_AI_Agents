"""Agent: 다중 RAG 검색 — 5개 named collection에서 source_key별로 검색한다.

컬렉션 구조
-----------
rag_customs     : 관세법령·과세가격·원산지 업무 매뉴얼
rag_trade       : 통관 정보·수입신고 절차
rag_audit       : 감사·조사 사례 보고서
rag_investigation: 조사 기법·혐의 유형 가이드
rag_global      : 국제 무역 협정·해외 거래 구조
"""
from collections.abc import Callable

try:
    from langchain_chroma import Chroma
except ImportError:
    Chroma = None

from src.agents.state import CustomsState
from src.agents.scope import company_id as scoped_company_id, prompt_text, is_no_company_id
from src.config import CFG
from src.embeddings import get_embeddings, get_init_error
from src.llm import llm
from src.paths import CHROMA_DIR

RAG_COLLECTIONS = [
    "rag_customs",
    "rag_trade",
    "rag_audit",
    "rag_investigation",
    "rag_global",
]

RAG_SOURCE_GUIDES = {
    "rag_customs":      "관세 업무 매뉴얼, 과세가격, 원산지, 내부 규정 관점에서 조사 참고사항을 정리합니다.",
    "rag_trade":        "통관 정보와 신고 이력 관점에서 이상 징후를 정리합니다.",
    "rag_audit":        "감사 정보와 추징 사례 관점에서 조사 쟁점을 정리합니다.",
    "rag_investigation":"조사 정보와 혐의 유형 관점에서 조사 단서를 정리합니다.",
    "rag_global":       "국제 정보와 해외 거래 구조 관점에서 위험 단서를 정리합니다.",
}

# ── 초기화: 컬렉션별 vectorstore dict ──────────────────────────────────────────
_vectorstores: dict[str, object] = {}
_init_error: str | None = None

def _init_vectorstores() -> None:
    global _init_error
    if Chroma is None:
        _init_error = "langchain_chroma 패키지 없음"
        return

    embeddings = get_embeddings()
    if embeddings is None:
        _init_error = get_init_error() or "임베딩 초기화 실패"
        print(f"[RAG] 임베딩 초기화 실패, RAG 스킵: {_init_error}")
        return

    failed = []
    for col in RAG_COLLECTIONS:
        try:
            _vectorstores[col] = Chroma(
                collection_name=col,
                persist_directory=str(CHROMA_DIR),
                embedding_function=embeddings,
            )
        except BaseException as exc:
            failed.append(f"{col}: {exc}")

    if failed:
        print(f"[RAG] 일부 컬렉션 초기화 실패: {failed}")
    if _vectorstores:
        counts = {k: v.get(include=[])["ids"].__len__() for k, v in _vectorstores.items()
                  if hasattr(v, "_collection")}
        print(f"[RAG] 컬렉션 로드 완료: {list(_vectorstores.keys())}")


_init_vectorstores()


# ── 내부 헬퍼 ──────────────────────────────────────────────────────────────────

def _append_rag_result(state: CustomsState, source_label: str, result: str) -> CustomsState:
    existing = state.get("rag_result")
    section  = f"[{source_label}]\n{result}"
    combined = f"{existing}\n\n{section}" if existing else section
    return {**state, "rag_result": combined}


def _search_docs(source_key: str, query: str, k: int = 3) -> list:
    """source_key 컬렉션 검색. 없으면 모든 컬렉션에서 통합 검색."""
    if source_key in _vectorstores:
        try:
            return _vectorstores[source_key].similarity_search(query, k=k)
        except BaseException as exc:
            print(f"[RAG] {source_key} 검색 실패: {exc}")
            return []

    # rag_common 또는 컬렉션 미존재 시 → 전체 통합 검색
    all_docs = []
    for vs in _vectorstores.values():
        try:
            all_docs.extend(vs.similarity_search(query, k=CFG.rag.fallback_k))
        except BaseException:
            pass
    # 중복 제거 (동일 page_content 기준)
    seen, unique = set(), []
    for doc in all_docs:
        key = doc.page_content[:80]
        if key not in seen:
            seen.add(key)
            unique.append(doc)
    return unique[:k]


def _run_rag(state: CustomsState, source_label: str, source_key: str) -> CustomsState:
    print(f"\n[RAG Agent] {source_label} 검색 시작")

    scenario = state.get("scenario") or {}
    instructions = [
        item.get("instruction", "")
        for item in scenario.get("scenario_items", [])
        if item.get("key") == source_key and item.get("instruction")
    ]
    cid = scoped_company_id(state)
    query_parts = [prompt_text(state), " ".join(instructions)]
    if not is_no_company_id(cid):
        query_parts.append(cid)
    db_result = state.get("db_result") or ""
    if db_result and "연관정보 없음" not in db_result:
        query_parts.append(db_result)
    query = "\n".join(p for p in query_parts if p).strip()

    if not query:
        rag_result = (
            f"[{source_label}]\n"
            "- 검색할 프롬프트나 대상 정보가 없습니다.\n"
            "- 연관정보 없음: 임의 키워드로 RAG를 검색하지 않습니다."
        )
        return _append_rag_result(state, source_label, rag_result)

    docs = []
    if _vectorstores:
        docs = _search_docs(source_key, query, k=CFG.rag.top_k)

    if not docs:
        if not (_init_error or get_init_error()):
            rag_result = (
                f"[{source_label}]\n"
                f"- `{source_key}` 컬렉션에서 현재 프롬프트와 직접 연결되는 문서를 찾지 못했습니다.\n"
                "- 연관정보 없음: 선택된 RAG 범위를 벗어난 근거를 생성하지 않습니다."
            )
            return _append_rag_result(state, source_label, rag_result)
        guide  = RAG_SOURCE_GUIDES.get(source_key, "선택한 자료 관점에서 조사 참고사항을 정리합니다.")
        reason = (
            f"RAG 엔진 초기화 실패 ({_init_error or get_init_error()})"
            if (_init_error or get_init_error())
            else f"'{source_key}' 컬렉션에 문서가 없습니다. init_chromadb.py를 실행하여 문서를 등록하세요."
        )
        rag_result = (
            f"{reason}\n"
            f"대체 점검 관점: {guide}\n"
            "- 신고가격 근거, 품목분류 검토표, 원산지 증빙, 특수관계 거래계약서를 우선 확인하세요."
        )
    else:
        cases = "\n---\n".join(
            f"[출처: {doc.metadata.get('source', '미상')}]\n{doc.page_content}"
            for doc in docs
        )
        guide = RAG_SOURCE_GUIDES.get(source_key, "선택한 RAG 자료 관점에서 조사 참고사항을 정리합니다.")
        if llm:
            try:
                response = llm.invoke(
                    "다음 참고 자료를 바탕으로 현재 업체 조사에 참고할 내용을 한국어로 요약하세요.\n"
                    f"RAG 구분: {source_label}\n"
                    f"정리 관점: {guide}\n"
                    "핵심 위험 신호, 확인할 증빙, 보고서에 반영할 문장을 구분해서 작성하세요.\n\n"
                    f"{cases}"
                )
                rag_result = response.content
            except Exception as llm_exc:
                print(f"[RAG Agent] LLM 호출 실패, RAG 문서만 반환: {llm_exc}")
                rag_result = f"{guide}\n\n{cases}"
        else:
            rag_result = f"{guide}\n\n{cases}"

    print(f"[RAG Agent] {source_label} 완료")
    return _append_rag_result(state, source_label, rag_result)


# ── 공개 에이전트 ──────────────────────────────────────────────────────────────

def agent_rag(state: CustomsState) -> CustomsState:
    """전체 컬렉션 통합 검색 (기본 RAG)."""
    return _run_rag(state, "참고 RAG", "rag_common")


def agent_rag_source(source_label: str, source_key: str) -> Callable[[CustomsState], CustomsState]:
    """특정 컬렉션 지정 RAG 에이전트 팩토리."""
    def runner(state: CustomsState) -> CustomsState:
        return _run_rag(state, source_label, source_key)
    return runner
