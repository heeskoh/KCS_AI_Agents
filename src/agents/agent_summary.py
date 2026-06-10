"""Agent: 문서 요약 — 제공된 문서(OCR 결과 포함)를 LLM으로 요약하고 조사 착안사항을 도출한다."""
from src.agents.state import CustomsState
from src.llm import llm

_PROMPT = """당신은 관세 조사 전문 분석가입니다.
아래 문서 내용을 관세 조사 관점에서 핵심 사항 위주로 요약하세요.

요약 항목:
1. 문서 개요 (문서 종류, 당사자, 주요 거래 내용, 거래 금액·통화·Incoterms)
2. 과세가격 관련 주요 수치 (금액·단가·운임·보험료)
3. 특수관계·로열티·가격조정 조항 여부 (조항명·내용 포함)
4. 원산지·HS 코드 관련 정보 (신고 원산지, 품목 명세)
5. 관세 조사 관점 주요 착안사항 (3~5개, 각 항목에 관세법 조항 인용)

[문서 내용]
{content}
"""

_FALLBACK = """[문서 요약 결과]
LLM 미사용 — 아래는 OCR 추출 원문 요약입니다.

{content}

[조사 착안사항]
- 계약서 가격조정·로열티 조항 유무 확인 (관세법 제30조)
- 세금계산서와 수입신고가격 일치 여부 대조
- Incoterms 조건에 따른 운임·보험료 가산 여부 검토
- 특수관계자 거래 여부 확인 (관세법 제23조)
- FTA 원산지 증명서 유효성 검토
"""


def _collect_document_content(state: CustomsState) -> str:
    """요약 대상 문서 내용을 수집한다. 업로드 파일 원문 → OCR → DB 순으로 우선."""
    parts: list[str] = []

    scenario = state.get("scenario") or {}
    uploaded = scenario.get("uploaded_files") or []
    real_docs = [f for f in uploaded if f.get("encoding") == "text" and f.get("content")]
    if real_docs:
        for f in real_docs:
            label = f"{f.get('name', '문서')} (유형: {f.get('type', 'document')})"
            parts.append(f"[업로드 원문 — {label}]\n{(f.get('content') or '')[:2500]}")

    ocr = state.get("ocr_result")
    if ocr:
        parts.append("[OCR 추출 결과]\n" + ocr[:2000])

    db = state.get("db_result")
    if db:
        parts.append("[DB 조회 결과]\n" + db[:1500])

    company = state.get("company_result")
    if company:
        parts.append("[기업 기본정보]\n" + company[:1000])

    if parts:
        return "\n\n".join(parts)

    return "요약할 문서 내용이 없습니다."


def agent_summary(state: CustomsState) -> CustomsState:
    """제공된 문서를 요약하고 관세 조사 착안사항을 도출한다."""
    print("[Agent] 문서 요약 시작")

    content = _collect_document_content(state)

    if llm:
        try:
            result = llm.invoke(_PROMPT.format(content=content[:5000])).content
        except Exception as exc:
            print(f"[Agent] 문서 요약 LLM 실패: {exc}")
            result = _FALLBACK.format(content=content[:2000])
    else:
        result = _FALLBACK.format(content=content[:2000])

    print("[Agent] 문서 요약 완료")
    return {**state, "summary_result": result}
