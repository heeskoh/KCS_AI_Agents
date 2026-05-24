"""Agent: RAG생성 — 제공된 파일 목록으로 RAG를 생성하고 LLM으로 문서 핵심 내용을 요약한다.

유효기간: 기본 2개월 / 접근 권한: 현재 로그인 사용자 only (시뮬레이션).
"""
import hashlib
from datetime import date, timedelta

from src.agents.state import CustomsState
from src.agents.scope import company_id as scoped_company_id
from src.llm import llm

_DEFAULT_VALIDITY_DAYS = 60  # 2개월

_LLM_PROMPT = """당신은 관세 조사 문서 처리 전문가입니다.
아래 RAG 생성 정보와 포함된 문서 목록을 바탕으로 RAG 활용 가이드를 작성하세요.

작성 항목:
1. 문서 유형별 핵심 내용 요약: 각 문서에서 RAG 검색 시 활용 가능한 핵심 정보
2. 주요 검색 시나리오: 이 RAG로 답할 수 있는 질문 3~5개 예시
3. 한계 및 주의사항: RAG 검색 결과 해석 시 주의할 점
4. 후속 에이전트 활용 방안: 이 RAG 결과를 어떤 에이전트와 연계할 것인지

[RAG 생성 정보]
{rag_info}

[문서 목록]
{file_list}

실무적이고 간결하게 작성하세요.
"""


def _build_rag_id(company_id: str, files: list[str]) -> str:
    seed = company_id + "|".join(sorted(files))
    return "RAG-" + hashlib.md5(seed.encode()).hexdigest()[:10].upper()


def _infer_doc_type(filename: str) -> str:
    name = filename.lower()
    if any(k in name for k in ["invoice", "세금계산서", "inv"]):
        return "세금계산서(Invoice)"
    if any(k in name for k in ["bl", "선하증권", "b/l"]):
        return "선하증권(B/L)"
    if any(k in name for k in ["contract", "계약서", "sales"]):
        return "매매계약서"
    if any(k in name for k in ["packing", "포장명세"]):
        return "포장명세서(Packing List)"
    if any(k in name for k in ["certificate", "원산지"]):
        return "원산지 증명서"
    return "기타 서류"


def agent_rag_create(state: CustomsState) -> CustomsState:
    """파일 목록을 기반으로 RAG를 생성하고 LLM으로 문서 내용을 요약한다."""
    print("\n[Agent] RAG생성 시작")

    company_id = scoped_company_id(state) or "미지정"
    scenario = state.get("scenario") or {}

    uploaded_files: list[dict] = scenario.get("uploaded_files") or []
    validity_days: int = scenario.get("rag_validity_days") or _DEFAULT_VALIDITY_DAYS
    owner: str = scenario.get("current_user") or "김관세 (조사국 조사1과)"

    if not uploaded_files:
        result = (
            "[RAG 생성 결과]\n"
            "- 업로드된 문서가 없습니다.\n"
            "- 연관정보 없음: 샘플 파일을 대신 사용하여 RAG를 생성하지 않습니다."
        )
        return {**state, "rag_create_result": result}
    else:
        file_names = [f.get("name", f"file_{i}") for i, f in enumerate(uploaded_files)]
        sim_note = f"업로드 파일 {len(file_names)}건으로 RAG 생성"

    rag_id = _build_rag_id(company_id, file_names)
    expire_date = date.today() + timedelta(days=validity_days)
    total_chunks = len(file_names) * 12

    doc_types = [(name, _infer_doc_type(name)) for name in file_names]

    lines = [
        "[RAG생성 결과]",
        sim_note,
        "",
        f"■ RAG 식별자:  {rag_id}",
        f"■ 대상 기업:   {company_id}",
        f"■ 생성 일자:   {date.today().isoformat()}",
        f"■ 유효 기간:   {validity_days}일 (만료: {expire_date.isoformat()})",
        f"■ 접근 권한:   {owner}  only",
        "",
        f"■ 포함 파일 ({len(file_names)}건)",
    ]
    for i, (name, dtype) in enumerate(doc_types, 1):
        lines.append(f"  {i}. [{dtype}] {name}")

    lines += [
        "",
        "■ 임베딩 처리 현황 (시뮬레이션)",
        f"  - 청킹: {total_chunks}청크 생성 (평균 512 토큰/청크)",
        f"  - 임베딩 모델: jhgan/ko-sroberta-multitask",
        f"  - 벡터 저장소: ChromaDB  컬렉션: {rag_id.lower()}",
        "",
        "■ 사용 방법",
        f"  시나리오에서 'RAG 검색' 단계를 추가할 때 컬렉션 ID '{rag_id}'를 지정하세요.",
        "  유효기간 만료 후에는 자동으로 접근이 차단됩니다.",
    ]

    rag_info = (
        f"RAG ID: {rag_id}\n"
        f"대상 기업: {company_id}\n"
        f"유효기간: {validity_days}일 (만료: {expire_date.isoformat()})\n"
        f"접근 권한: {owner}\n"
        f"총 청크: {total_chunks}개"
    )
    file_list_text = "\n".join(f"- [{dtype}] {name}" for name, dtype in doc_types)

    rag_raw = "\n".join(lines)

    if llm:
        try:
            guide = llm.invoke(
                _LLM_PROMPT.format(rag_info=rag_info, file_list=file_list_text)
            ).content
            rag_create_result = rag_raw + "\n\n[AI RAG 활용 가이드]\n" + guide
        except Exception as exc:
            print(f"[Agent] RAG생성 LLM 실패: {exc}")
            rag_create_result = rag_raw
    else:
        rag_create_result = rag_raw

    print("[Agent] RAG생성 완료")
    return {**state, "rag_create_result": rag_create_result}
