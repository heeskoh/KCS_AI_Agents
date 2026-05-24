"""Agent: 과세가격평가 — 동일 품목 타사 과세가격을 조회하고 관세법 제30~35조 결정 방법을 적용하여 신고가격을 검증한다."""
import duckdb

from src.agents.state import CustomsState
from src.agents.scope import has_company_scope, no_company_result
from src.config import CFG
from src.llm import llm
from src.paths import DB_PATH

_LLM_PROMPT = """당신은 관세청 과세가격 결정 전문 조사관입니다.
아래 과세가격 비교 분석 결과를 검토하여 관세법 제30조~제35조 결정 방법 적용 및 가산요소를 평가하세요.

분석 항목:
1. 거래가격 방법(제30조) 적용 가능성: 특수관계·조건부 거래 여부, 가격 왜곡 가능성
2. 가산요소 검토: 로열티·권리사용료(제30조 1항 나목), 운임·보험료(CIF 조건), 사후가격조정
3. 대체 결정 방법 필요성: 저가신고 품목에 대해 동종·유사물품 방법(제31~32조) 적용 검토
4. 추가 세액 추정: 저가 신고된 품목의 추정 추징 세액 범위
5. 확보 필요 자료: 과세가격 입증을 위한 필수 서류 목록

[과세가격 비교 분석 결과]
{value_raw}

[특수관계·로열티 관련 참고 정보]
{context}

관세법 조항을 구체적으로 인용하고 실무적 조사 방향을 제시하세요.
"""


def agent_customs_value(state: CustomsState) -> CustomsState:
    """타사 동일 품목 과세가격과 비교하고 관세법상 결정 방법·가산요소를 평가한다."""
    if not has_company_scope(state):
        return {**state, "customs_value_result": no_company_result("과세가격평가")}

    company_id = state["company_id"]
    print(f"\n[Agent] 과세가격평가 시작: {company_id}")

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        my_decl = conn.execute(
            """SELECT hs_code, item_name, declared_value, origin_country
               FROM import_declarations WHERE company_id=? ORDER BY import_date DESC""",
            [company_id],
        ).df()

        peer_stats = conn.execute(
            """SELECT
                 d.hs_code,
                 d.origin_country,
                 COUNT(*)                           AS peer_count,
                 AVG(d.declared_value)              AS peer_avg,
                 MIN(d.declared_value)              AS peer_min,
                 MAX(d.declared_value)              AS peer_max,
                 PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.declared_value) AS q1,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.declared_value) AS q3
               FROM import_declarations d
               WHERE d.company_id != ?
               GROUP BY d.hs_code, d.origin_country
               HAVING COUNT(*) >= 1""",
            [company_id],
        ).df()

        company_info = conn.execute(
            """SELECT company_name, risk_level, fta_reduction_rate, recent_customs_refund,
                      related_companies, annual_import_amount, declared_duty_amount
               FROM company_profiles WHERE company_id=?""",
            [company_id],
        ).df()

    if my_decl.empty:
        return {**state, "customs_value_result": "[과세가격평가 결과]\n- 조회 대상 기업의 수입신고 데이터가 없습니다.\n- 연관정보 없음: 과세가격 비교를 수행하지 않습니다."}

    lines = [
        "[과세가격평가 결과]",
        f"대상 기업: {company_id}  |  검증 품목: {my_decl['hs_code'].nunique()}종",
        "",
    ]

    # 기업 정보 요약
    if not company_info.empty:
        ci = company_info.iloc[0]
        fta_rate = float(ci.get("fta_reduction_rate") or 0)
        refund = float(ci.get("recent_customs_refund") or 0)
        lines += [
            "■ 기업 과세 프로필",
            f"  위험등급: {ci.get('risk_level', 'N/A')}  |  FTA 감면율: {fta_rate:.1f}%  |  최근 환급액: {refund:,.0f}원",
            f"  관계회사: {ci.get('related_companies') or '없음'}",
            "",
        ]

    seen: set[str] = set()
    red_flags: list[str] = []

    for _, row in my_decl.iterrows():
        hs = str(row["hs_code"])
        origin = str(row["origin_country"])
        key = f"{hs}_{origin}"
        if key in seen:
            continue
        seen.add(key)

        val = float(row["declared_value"] or 0)
        peer = peer_stats[
            (peer_stats["hs_code"] == hs) & (peer_stats["origin_country"] == origin)
        ]

        lines.append(f"■ HS {hs} / {row['item_name']} (원산지: {origin})")

        if peer.empty:
            lines.append("  타사 비교 데이터 없음 — 국제 시세 및 유사 수입신고 직접 조회 필요")
            lines.append("  → 관세법 제31조(동종·동질물품 방법) 또는 제32조(유사물품 방법) 적용 검토")
        else:
            p = peer.iloc[0]
            avg = float(p["peer_avg"] or 0)
            q1  = float(p["q1"]  or 0)
            q3  = float(p["q3"]  or 0)
            diff_pct = ((val - avg) / avg * 100) if avg else 0

            if val < q1 * CFG.customs_value.q1_lower_bound:
                verdict = "🔴 저가신고 의심 — 1분위(Q1) 대비 20% 이상 낮음"
                red_flags.append(f"HS {hs}: 저가신고 의심 ({diff_pct:+.1f}%) → 거래가격 방법 외 대체 방법 적용 검토")
            elif val < avg * CFG.customs_value.avg_lower_bound:
                verdict = "🟡 주의 — 평균 대비 10% 이상 낮음"
            elif val > q3 * CFG.customs_value.q3_upper_bound:
                verdict = "🟡 고가 의심 — 3분위(Q3) 대비 20% 이상 높음"
            else:
                verdict = "🟢 정상 범위"

            lines += [
                f"  신고금액:    {val:>15,.0f}원",
                f"  타사 평균:   {avg:>15,.0f}원  (차이 {diff_pct:+.1f}%)",
                f"  타사 Q1~Q3: {q1:,.0f} ~ {q3:,.0f}원",
                f"  비교 건수:   {int(p['peer_count'])}건",
                f"  판정: {verdict}",
            ]

        lines.append("")

    # 가산요소 체크 (OCR/계약 결과 참고)
    ocr_text = state.get("ocr_result") or ""
    royalty_flag = "로열티" in ocr_text or "기술사용료" in ocr_text or "royalt" in ocr_text.lower()
    adjust_flag  = "가격조정" in ocr_text or "소급 조정" in ocr_text
    network_text = state.get("network_result") or ""
    related_flag = "특수관계" in network_text or "지분" in network_text

    lines.append("■ 가산요소 점검")
    lines.append(f"  로열티·기술사용료 조항: {'⚠️ 확인됨 → 관세법 제30조 1항 나목 검토 필요' if royalty_flag else '미확인'}")
    lines.append(f"  사후가격조정 조항:       {'⚠️ 확인됨 → 조정액 전액 과세가격 포함 여부 검토' if adjust_flag else '미확인'}")
    lines.append(f"  특수관계 거래:           {'⚠️ 관계망 분석에서 확인됨 → 거래가격 방법 적용 요건 검토' if related_flag else '미확인'}")
    lines.append("")

    if red_flags:
        lines.append("[종합] 저가·고가 신고 의심 품목")
        lines.extend(f"  ⚠️ {f}" for f in red_flags)
        lines.append("→ 거래계약서·송장·외환 지급내역 원본 자료를 요청하세요.")
    else:
        lines.append("[종합] 신고가격 비교 이상 없음 — 추가 서류 확인 권장")

    value_raw = "\n".join(lines)

    if llm:
        try:
            context_parts = []
            if royalty_flag:
                context_parts.append("OCR에서 로열티/기술사용료 조항 탐지됨")
            if adjust_flag:
                context_parts.append("OCR에서 사후가격조정 조항 탐지됨")
            if related_flag:
                context_parts.append("관계망 분석에서 특수관계 확인됨")
            context = "\n".join(context_parts) if context_parts else "특이사항 없음"

            analysis = llm.invoke(
                _LLM_PROMPT.format(value_raw=value_raw[:4000], context=context)
            ).content
            customs_value_result = value_raw + "\n\n[AI 과세가격 결정 분석]\n" + analysis
        except Exception as exc:
            print(f"[Agent] 과세가격평가 LLM 실패: {exc}")
            customs_value_result = value_raw
    else:
        customs_value_result = value_raw

    print("[Agent] 과세가격평가 완료")
    return {**state, "customs_value_result": customs_value_result}
