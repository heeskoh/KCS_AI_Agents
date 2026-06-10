"""Agent: 수입신고검증 — OCR 추출 내용과 수입신고 DB를 비교하고 ML/관계망 결과를 통합하여 불일치 항목을 도출한다."""
import duckdb

from src.agents.state import CustomsState
from src.agents.scope import has_company_scope, no_company_result
from src.config import CFG
from src.llm import llm
from src.paths import DB_PATH

# OCR 샘플 추출값 (실제는 ocr_result 파싱)
_SAMPLE_OCR = {
    "invoice_items": [
        {"description": "Power Module A100",   "hs_code": "8504.40", "unit_price_usd": 120.0, "incoterms": "CIF"},
        {"description": "Control Board CB-200", "hs_code": "8542.31", "unit_price_usd":  98.0, "incoterms": "CIF"},
    ],
    "total_usd": 28900.0,
    "royalty": "없음",
    "incoterms": "CIF",
}

_LLM_PROMPT = """당신은 관세청 수입신고 검증 전문 조사관입니다.
아래 수입신고 검증 결과와 ML·관계망 분석 결과를 종합하여 조사 착안사항을 도출하세요.

분석 항목:
1. 첨부문서 비교: 세금계산서, 적하목록, 선하증권 등에서 추출한 품명·규격·중량·수량·가격·인도조건과 수입신고 DB 항목의 불일치를 구분
2. 불일치 항목 추출: 품명 불일치, 중량 불일치, 가격 불일치, 신고수량 불일치, 원산지/선적지 불일치를 표로 정리
3. 화물 이상 패턴: 반복 정정, 과소중량, 단가 급변, HS별 평균 대비 편차, 검사/보류 상태 등 이상 패턴을 설명
4. DB/문서 차이의 성격 판단: 저가신고·누락신고·서류오류·단순 기재오류 중 가능성을 나누고 판단 근거를 제시
5. 조사 우선순위: 즉시 확보할 증빙과 질문 목록 2~3개를 법령 근거와 함께 제안

[수입신고검증 결과]
{verify_raw}

[ML 모델 결과 (참고)]
{ml_result}

[관계망 분석 결과 (참고)]
{network_result}

이는 실제 처분이 아니라 OpenAI 기반 시뮬레이션 결과임을 전제로, 관세법 조항을 인용하여 구체적으로 작성하세요.
"""


def _parse_ocr_items(ocr_result: str | None) -> list[dict]:
    if not ocr_result:
        return []
    import json, re
    match = re.search(r'"items"\s*:\s*(\[.*?\])', ocr_result, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass
    return []


def agent_declaration_verify(state: CustomsState) -> CustomsState:
    """첨부문서 추출값과 수입신고 DB를 비교하고 ML·관계망 결과를 통합하여 불일치 항목을 추출한다."""
    if not has_company_scope(state):
        return {**state, "declaration_verify_result": no_company_result("수입신고검증")}

    company_id = state["company_id"]
    print(f"[Agent] 수입신고검증 시작: {company_id}")

    ocr_items = _parse_ocr_items(state.get("ocr_result"))
    if not ocr_items:
        result = (
            "[수입신고검증 결과]\n"
            "- OCR/첨부 문서에서 검증할 수입신고 항목을 찾지 못했습니다.\n"
            "- 연관정보 없음: 샘플 송장 항목을 대신 사용하지 않습니다."
        )
        return {**state, "declaration_verify_result": result}

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        db_rows = conn.execute(
            """SELECT declaration_no, hs_code, item_name, declared_value, origin_country, status
               FROM import_declarations WHERE company_id=? ORDER BY import_date DESC LIMIT 10""",
            [company_id],
        ).df()

        # 동종 업종 평균 조회
        company_info = conn.execute(
            "SELECT industry_code FROM company_profiles WHERE company_id=?",
            [company_id],
        ).df()
        industry_code = company_info.iloc[0]["industry_code"] if not company_info.empty else None

        peer_avg_map: dict[str, float] = {}
        if industry_code:
            peer_avg = conn.execute(
                """SELECT d.hs_code, AVG(d.declared_value) AS peer_avg
                   FROM import_declarations d
                   JOIN company_profiles c ON d.company_id = c.company_id
                   WHERE c.industry_code = ? AND d.company_id != ?
                   GROUP BY d.hs_code""",
                [industry_code, company_id],
            ).df()
            for _, r in peer_avg.iterrows():
                peer_avg_map[str(r["hs_code"])] = float(r["peer_avg"] or 0)

    mismatches: list[dict] = []
    matches: list[str] = []
    peer_flags: list[str] = []

    ocr_hs_set = {item.get("hs_code", "") for item in ocr_items if item.get("hs_code")}

    def _to_float(v) -> float:
        import re
        return float(re.sub(r"[^\d.]", "", str(v or "0")) or "0")

    ocr_price_map = {
        item["hs_code"]: _to_float(item.get("unit_price_usd") or item.get("unit_price", 0))
        for item in ocr_items if item.get("hs_code")
    }

    for _, row in db_rows.iterrows():
        hs = str(row["hs_code"])
        val = float(row["declared_value"] or 0)

        if hs in ocr_hs_set:
            ocr_price = ocr_price_map.get(hs, 0)
            implied_val = ocr_price * 200
            diff_pct = ((val - implied_val) / implied_val * 100) if implied_val else 0

            if abs(diff_pct) > CFG.declaration.price_mismatch_threshold * 100:
                mismatches.append({
                    "항목": "신고금액 불일치",
                    "신고번호": row["declaration_no"],
                    "HS코드": hs,
                    "DB신고금액": f"{val:,.0f}원",
                    "문서추정금액": f"{implied_val:,.0f}원",
                    "차이": f"{diff_pct:+.1f}%",
                    "판정": "⚠️ 검토 필요",
                })
            else:
                matches.append(f"HS {hs}: 신고금액 정상 범위 ({diff_pct:+.1f}%)")

            # 동종 업종 평균 비교
            peer_avg_val = peer_avg_map.get(hs, 0)
            if peer_avg_val > 0:
                peer_diff = (val - peer_avg_val) / peer_avg_val * 100
                if peer_diff < CFG.declaration.peer_undervalue_high * 100:
                    peer_flags.append(f"HS {hs}: 동종업종 평균 대비 {peer_diff:+.1f}% 저가 → 저가신고 의심")
                elif peer_diff < CFG.declaration.peer_undervalue_warning * 100:
                    peer_flags.append(f"HS {hs}: 동종업종 평균 대비 {peer_diff:+.1f}% 낮음 → 추가 확인 필요")
        else:
            mismatches.append({
                "항목": "문서 미포함 품목",
                "신고번호": row["declaration_no"],
                "HS코드": hs,
                "품명": row["item_name"],
                "DB상태": row["status"],
                "판정": "⚠️ 문서 누락 확인 필요",
            })

    # Incoterms 검증
    ocr_inco = _SAMPLE_OCR["incoterms"]
    if ocr_inco == "FOB" and not db_rows.empty:
        mismatches.append({
            "항목": "Incoterms 불일치",
            "문서값": ocr_inco,
            "신고값": "CIF 추정",
            "판정": "⚠️ 운임·보험료 가산 여부 확인 필요",
        })

    lines = [
        "[수입신고검증 결과]",
        f"대상 기업: {company_id}",
        f"검증 신고 건수: {len(db_rows)}건  |  OCR 추출 품목: {len(ocr_items)}건",
        "",
    ]

    if mismatches:
        lines.append(f"■ 불일치 항목 ({len(mismatches)}건)")
        for m in mismatches:
            lines.append("  " + "  |  ".join(f"{k}: {v}" for k, v in m.items()))
        lines.append("")

    if matches:
        lines.append(f"■ 일치 항목 ({len(matches)}건)")
        lines.extend(f"  ✅ {m}" for m in matches)
        lines.append("")

    if peer_flags:
        lines.append("■ 동종 업종 비교 결과")
        lines.extend(f"  {f}" for f in peer_flags)
        lines.append("")

    if not mismatches:
        lines.append("✅ 주요 불일치 항목 없음 — 추가 정밀 검토 권장")

    verify_raw = "\n".join(lines)

    if llm:
        try:
            ml_snippet = (state.get("ml_result") or "ML 결과 없음")[:800]
            net_snippet = (state.get("network_result") or "관계망 결과 없음")[:800]
            analysis = llm.invoke(
                _LLM_PROMPT.format(
                    verify_raw=verify_raw,
                    ml_result=ml_snippet,
                    network_result=net_snippet,
                )
            ).content
            declaration_verify_result = verify_raw + "\n\n[AI 통합 검증 분석]\n" + analysis
        except Exception as exc:
            print(f"[Agent] 수입신고검증 LLM 실패: {exc}")
            declaration_verify_result = verify_raw
    else:
        declaration_verify_result = verify_raw

    print("[Agent] 수입신고검증 완료")
    return {**state, "declaration_verify_result": declaration_verify_result}
