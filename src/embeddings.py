"""공유 임베딩 싱글톤 — HuggingFace 한국어 모델을 프로세스에서 한 번만 로드한다.

여러 에이전트(agent_rag, agent_audit_search)가 각자 모델을 로드하면
서버 시작 시 동일 모델이 N번 로드되어 수십 초의 지연이 발생한다.
이 모듈을 통해 최초 호출 시 한 번만 로드하고 이후 캐시된 객체를 반환한다.
"""
from __future__ import annotations

_embeddings = None
_init_error: str | None = None
_loaded = False


def get_embeddings():
    """임베딩 객체를 반환한다. 첫 호출 시에만 모델을 로드한다."""
    global _embeddings, _init_error, _loaded
    if _loaded:
        return _embeddings

    _loaded = True
    try:
        from langchain_huggingface import HuggingFaceEmbeddings
    except ImportError:
        try:
            from langchain_community.embeddings import HuggingFaceEmbeddings
        except ImportError:
            _init_error = "HuggingFaceEmbeddings 패키지 없음 (langchain-huggingface 또는 langchain-community 필요)"
            return None

    try:
        _embeddings = HuggingFaceEmbeddings(model_name="jhgan/ko-sroberta-multitask")
    except Exception as exc:
        _init_error = f"{type(exc).__name__}: {exc}"
        _embeddings = None

    return _embeddings


def get_init_error() -> str | None:
    return _init_error
