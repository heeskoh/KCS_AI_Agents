"""Agent: OCR/문서인식 — 업로드 파일을 파싱하여 JSON 구조로 변환하고 LLM으로 심층 분석한다."""
import json

from src.agents.state import CustomsState
from src.llm import llm

_SAMPLE_DOCS: dict[str, dict] = {
    "invoice": {
        "doc_type": "세금계산서(Invoice)",
        "supplier": "GF Global Co., Ltd. (TWN)",
        "buyer": "한국소재무역 (주)",
        "invoice_no": "INV-2025-0042",
        "invoice_date": "2025-04-22",
        "incoterms": "CIF Incheon",
        "currency": "USD",
        "items": [
            {"seq": 1, "description": "Power Module A100",   "hs_code": "8504.40", "qty": 200, "unit_price": "USD 120.00", "amount": "USD 24,000.00"},
            {"seq": 2, "description": "Control Board CB-200", "hs_code": "8542.31", "qty":  50, "unit_price": "USD  98.00", "amount": "USD  4,900.00"},
        ],
        "total_amount": "USD 28,900.00",
        "royalty_clause": None,
    },
    "bl": {
        "doc_type": "선하증권(B/L)",
        "bl_no": "HDMU0034562025",
        "vessel": "HYUNDAI PIONEER",
        "port_of_loading": "KAOHSIUNG, TW",
        "port_of_discharge": "INCHEON, KR",
        "shipper": "GF Global Co., Ltd.",
        "consignee": "한국소재무역 (주)",
        "container_no": "FCIU3345621",
        "gross_weight_kg": 850,
        "freight": "PREPAID",
    },
    "contract": {
        "doc_type": "매매계약서",
        "contract_no": "SALES-2025-KR-008",
        "contract_date": "2025-01-10",
        "seller": "GF Global Co., Ltd. (Taiwan)",
        "buyer": "한국소재무역 (주) (Korea)",
        "product": "Electronic Components",
        "total_value": "USD 290,000.00",
        "price_adjustment_clause": "제5조: 반기별 거래량에 따라 가격 소급 조정 가능",
        "royalty_clause": "제8조: 판매액의 3% 기술사용료 별도 지급",
        "related_party_note": "판매자 모회사 GF Holdings가 구매자 주식 32% 보유",
    },
}

_ALERTS = [
    ("contract", "price_adjustment_clause", "⚠️ 계약서 사후 가격조정 조항 발견 → 과세가격 사후 조정 가능성"),
    ("contract", "royalty_clause",          "⚠️ 기술사용료 조항 발견 → 관세법 제30조 가산요소 검토 필요"),
    ("contract", "related_party_note",      "⚠️ 특수관계 기재 발견 → 특수관계 영향 여부 확인 필요"),
]

_LLM_PROMPT = """당신은 관세청 수입신고 조사 전문가입니다.
아래 OCR 처리된 수입서류(세금계산서·B/L·계약서 등)를 분석하여 관세 조사 관점의 핵심 착안사항을 도출하세요.

분석 항목:
1. 문서 간 불일치: 세금계산서·B/L·계약서 간 당사자·금액·품목·Incoterms 불일치 여부
2. 과세가격 가산요소: 로열티, 권리사용료, 사후가격조정, 간접대금 등
3. 특수관계 징후: 지분관계, 모자회사, 공통 임원 등
4. HS 코드 적정성: 물품 명세와 신고 HS 코드의 일치 여부
5. 조사 우선순위: 즉시 확인이 필요한 항목 2~3개

[OCR 처리 문서]
{docs_json}

[이상징후 자동 탐지]
{alerts}

간결하고 구체적으로 작성하세요. 법령 조문(관세법 조항)을 1~2개 인용하세요.
"""


_LLM_REAL_PROMPT = """당신은 관세청 수입신고 조사 전문가입니다.
아래는 실제로 업로드된 수입 관련 문서 원문입니다. OCR 처리된 텍스트라 일부 노이즈가 있을 수 있습니다.
문서 내용을 분석하여 관세 조사 관점의 핵심 정보를 추출하세요.

추출 항목:
1. 문서 종류 식별 (세금계산서·B/L·계약서·원산지증명서 등)
2. 핵심 거래 정보 (당사자, 금액, HS코드, Incoterms, 원산지)
3. 과세가격 가산요소 발견 (로열티, 가격조정, 간접비용 등)
4. 특수관계 징후
5. 관세 조사 관점 주요 착안사항 (3~5개, 관세법 조항 인용)

[업로드 문서 원문]
{docs_text}
"""


def agent_ocr(state: CustomsState) -> CustomsState:
    """업로드된 파일을 OCR 인식하여 JSON으로 파싱하고 LLM으로 심층 분석한다."""
    print("\n[Agent] OCR/문서인식 시작")

    scenario = state.get("scenario") or {}
    uploaded = scenario.get("uploaded_files") or []
    company_id = str(state.get("company_id") or "")

    # 실제 업로드 파일에 텍스트 콘텐츠가 있는지 확인
    real_docs = [f for f in uploaded if (f.get("encoding") == "text" and f.get("content"))]

    if real_docs:
        # 실제 업로드 파일 처리 — LLM으로 직접 분석
        note = f"실제 업로드 파일 {len(real_docs)}건 분석"
        lines = ["[OCR/문서인식 결과]", note, ""]
        docs_text_parts: list[str] = []
        for f in real_docs:
            label = f"{f.get('name', '문서')} (유형: {f.get('type', 'document')}, {f.get('size', 0):,} bytes)"
            content = (f.get("content") or "")[:3000]
            lines.append(f"■ {label}")
            lines.append(content[:800] + ("\n... (이하 생략)" if len(content) >= 800 else ""))
            lines.append("")
            docs_text_parts.append(f"=== {label} ===\n{content}")

        raw_result = "\n".join(lines)

        if llm:
            try:
                docs_text = "\n\n".join(docs_text_parts)[:6000]
                analysis = llm.invoke(_LLM_REAL_PROMPT.format(docs_text=docs_text)).content
                ocr_result = raw_result + "\n[AI 심층 분석]\n" + analysis
            except Exception as exc:
                print(f"[Agent] OCR LLM 분석 실패: {exc}")
                ocr_result = raw_result
        else:
            ocr_result = raw_result

        print("[Agent] OCR/문서인식 완료 (실제 파일)")
        return {**state, "ocr_result": ocr_result}

    # ── 업로드 파일이 없거나 텍스트 추출 불가 → 시뮬레이션 ──
    if uploaded:
        return {**state, "ocr_result": "[OCR/문서인식 결과]\n- 첨부 파일은 있으나 OCR 텍스트가 추출되지 않았습니다.\n- 연관정보 없음: 샘플 문서를 대신 사용하지 않습니다."}
        keys = [f.get("type", "invoice") for f in uploaded]
        note = f"업로드 파일 {len(uploaded)}건 처리 (텍스트 추출 불가 → 샘플 매칭)"
    else:
        return {**state, "ocr_result": "[OCR/문서인식 결과]\n- 첨부 파일이 없습니다.\n- 연관정보 없음: 샘플 문서를 대신 사용하지 않습니다."}
        keys = list(_SAMPLE_DOCS.keys())
        note = f"[시뮬레이션] {company_id} 샘플 문서(세금계산서·B/L·계약서) OCR 처리"

    parsed: dict[str, dict] = {k: _SAMPLE_DOCS.get(k, _SAMPLE_DOCS["invoice"]) for k in keys}
    alerts: list[str] = []
    for doc_key, field, msg in _ALERTS:
        if doc_key in parsed and parsed[doc_key].get(field):
            alerts.append(msg)

    lines = ["[OCR/문서인식 결과]", note, f"처리 문서: {len(parsed)}건", ""]
    for doc_key, data in parsed.items():
        lines.append(f"■ {data.get('doc_type', doc_key)}")
        lines.append(json.dumps(data, ensure_ascii=False, indent=2))
        lines.append("")

    if alerts:
        lines.append("[AI 이상징후 자동 탐지]")
        lines.extend(alerts)
        lines.append("")

    raw_result = "\n".join(lines)

    if llm:
        try:
            docs_json = json.dumps(parsed, ensure_ascii=False, indent=2)
            alerts_text = "\n".join(alerts) if alerts else "탐지된 이상징후 없음"
            analysis = llm.invoke(
                _LLM_PROMPT.format(docs_json=docs_json[:4000], alerts=alerts_text)
            ).content
            ocr_result = raw_result + "\n[AI 심층 분석]\n" + analysis
        except Exception as exc:
            print(f"[Agent] OCR LLM 분석 실패: {exc}")
            ocr_result = raw_result
    else:
        ocr_result = raw_result

    print("[Agent] OCR/문서인식 완료")
    return {**state, "ocr_result": ocr_result}
