"""외부 정보 조회 에이전트 2종.

- agent_uni_external: 전자통관외부정보조회 — 전자통관 연계 외부기관 자료
  (국세청 세적자료, 한국은행 수신자료)를 조회·정리한다.
- agent_external_agency: 외부기관정보수집 — DART·NICE·CRETOP 등 외부 사이트별
  수집 가능 정보와 조사 활용 포인트를 정리한다.

데모 환경에는 실제 기관 연계가 없으므로, DuckDB의 기업 컨텍스트를 근거로
LLM이 조회 결과 형식의 시뮬레이션을 생성하고 그 사실을 결과에 명시한다.
"""

from __future__ import annotations

import duckdb

from src.agents.state import CustomsState
from src.agents.scope import (
    no_target_result,
    prompt_text,
    target_id,
    target_type,
)
from src.llm import llm
from src.paths import DB_PATH


def _error_state(state: CustomsState, result_key: str, message: str, detail: str | None = None) -> CustomsState:
    result = detail or f"[오류 발생]\n- {message}"
    return {
        **state,
        result_key: result,
        "agent_error": message,
        "agent_error_result": result,
    }


def _behaviors(state: CustomsState) -> list[str]:
    """현재 단계에 선택된 분석범위(behavior) 목록."""
    scenario = state.get("scenario") or {}
    behaviors = scenario.get("current_agent_behaviors") or []
    if isinstance(behaviors, str):
        behaviors = [behaviors]
    single = str(scenario.get("current_agent_behavior") or "").strip()
    if single and single not in behaviors:
        behaviors = [single, *behaviors]
    return [str(b).strip() for b in behaviors if str(b).strip()]


def _company_context(company_id: str) -> str:
    """LLM 시뮬레이션의 근거가 되는 기업 기본 컨텍스트 (DuckDB)."""
    if not company_id:
        return ""
    try:
        with duckdb.connect(str(DB_PATH), read_only=True) as conn:
            df = conn.execute(
                """
                SELECT company_id, company_name, business_registration_no, industry_code,
                       founded_year, address, employee_count, annual_revenue,
                       annual_import_amount, declared_duty_amount, risk_level
                FROM company_profiles
                WHERE company_id = ?
                """,
                [company_id],
            ).df()
        return df.to_string(index=False) if not df.empty else ""
    except Exception:
        return ""


# ── 전자통관외부정보조회 ──────────────────────────────────────────────────────

_UNI_EXTERNAL_SOURCES = {
    "nts_tax_data": {
        "label": "국세청 세적자료",
        "fields": "사업자 등록 상태, 과세유형, 개·폐업 이력, 신고 소득/매출, 체납 여부",
    },
    "bok_receipt_data": {
        "label": "한국은행 수신자료",
        "fields": "외환 수신(수출입 대금) 내역, 송·수금 상대국, 신고 외 외환 거래 징후",
    },
}


def agent_uni_external(state: CustomsState) -> CustomsState:
    """전자통관 연계 외부기관 자료(국세청 세적·한국은행 수신) 조회."""
    result_key = "db_external_result"
    tid = target_id(state)
    print(f"[Agent] 전자통관외부정보조회 시작: {tid}")

    if not tid:
        detail = no_target_result(state, "전자통관외부정보조회")
        return _error_state(state, result_key, "전자통관외부정보조회 대상이 지정되지 않았습니다.", detail)

    behaviors = _behaviors(state)
    selected = [key for key in _UNI_EXTERNAL_SOURCES if key in behaviors] or list(_UNI_EXTERNAL_SOURCES)
    source_lines = "\n".join(
        f"- {_UNI_EXTERNAL_SOURCES[key]['label']}: {_UNI_EXTERNAL_SOURCES[key]['fields']}"
        for key in selected
    )

    is_person = target_type(state) == "person"
    context = "" if is_person else _company_context(tid)
    target_desc = f"수사 대상 개인({tid})" if is_person else f"조사 대상 기업({tid})"

    header = (
        "[전자통관외부정보조회 결과]\n"
        f"- 조회 대상: {tid}\n"
        f"- 조회 자료: {', '.join(_UNI_EXTERNAL_SOURCES[k]['label'] for k in selected)}\n"
        "- 본 결과는 전자통관 연계 모의 조회(시뮬레이션)이며, 실제 기관 회신 자료가 아닙니다.\n"
    )

    if llm is None:
        result = header + "\n(LLM 미구성: 상세 시뮬레이션 결과를 생성할 수 없습니다.)"
        return {**state, result_key: result}

    instruction = (
        f"당신은 대한민국 관세청 조사관입니다. {target_desc}에 대해 전자통관 시스템과 연계된 "
        "외부기관 자료를 조회한 결과 보고를 작성하십시오.\n\n"
        "[조회 자료 범위]\n"
        f"{source_lines}\n\n"
        "[작성 규칙]\n"
        "- 자료 종류별로 섹션([국세청 세적자료], [한국은행 수신자료])을 나누어 항목·값 형식으로 정리하십시오.\n"
        "- 아래 기업 기본정보(있는 경우)와 정합적인 범위에서 사실적인 조회 값을 구성하되, "
        "과장된 혐의를 만들지 말고 특이사항이 없으면 '특이사항 없음'으로 기재하십시오.\n"
        "- 마지막에 '조사 활용 포인트' 2~3개를 제시하십시오.\n"
        "- 이 결과는 데모용 시뮬레이션임을 전제로 하되, 본문에서 별도 언급하지 마십시오(머리말에 이미 표기됨).\n"
        + (f"\n[기업 기본정보(DuckDB)]\n{context}\n" if context else "")
        + (f"\n[요청 프롬프트]\n{prompt_text(state)}\n" if prompt_text(state).strip() else "")
    )
    summary = llm.invoke(instruction)
    body = getattr(summary, "content", summary)
    print("[Agent] 전자통관외부정보조회 완료")
    return {**state, result_key: f"{header}\n{body}"}


# ── 외부기관정보수집 ─────────────────────────────────────────────────────────

_EXTERNAL_AGENCY_SITES = {
    "dart": {
        "label": "금융감독원 전자공시시스템(DART)",
        "url": "http://dart.fss.or.kr",
        "contents": "감사보고서, 사업보고서 등 공시서류, 산업군별 공시업체 정보",
    },
    "nice_bizline": {
        "label": "NICE평가정보 BizLINE",
        "url": "https://www.nicebizline.com",
        "contents": "기업개요, 사업내용, 재무제표, 재무분석, 기업분석 보고서",
    },
    "cretop": {
        "label": "한국기업데이터 CRETOP",
        "url": "http://www.cretop.com",
        "contents": "기업개요, 사업내용, 재무정보, 신용정보, 신용조사 리포트",
    },
    "korea_pds": {
        "label": "코리아PDS(KOREA PDS)",
        "url": "http://www.koreapds.com",
        "contents": "주요 원자재 거래가격 및 통계, 원자재 수급 관련 시장정보",
    },
    "kpi": {
        "label": "한국물가정보(KPI)",
        "url": "http://www.kpi.or.kr",
        "contents": "원자재 국제 동향, 시세",
    },
    "kipris": {
        "label": "특허정보넷(KIPRIS)",
        "url": "http://www.kipris.or.kr",
        "contents": "지식재산권 등 출원 정보",
    },
    "orbis": {
        "label": "뷰로반다익(ORBIS)",
        "url": "https://orbis.bvdinfo.com",
        "contents": "기업현황, 지배구조, 재무제표, 특허정보, 공시된 연간 보고서",
    },
    "dnb": {
        "label": "Dun&Bradstreet(D&B)",
        "url": "https://solutions.dnb.com/grs",
        "contents": "해외기업정보조회, 특정기업현지보고서",
    },
}


def agent_external_agency(state: CustomsState) -> CustomsState:
    """외부기관(공시·신용·시세·특허·해외기업정보) 사이트별 수집 정보 정리."""
    result_key = "external_agency_result"
    tid = target_id(state)
    print(f"[Agent] 외부기관정보수집 시작: {tid}")

    behaviors = _behaviors(state)
    selected = [key for key in _EXTERNAL_AGENCY_SITES if key in behaviors] or list(_EXTERNAL_AGENCY_SITES)

    site_table = "\n".join(
        f"■ {_EXTERNAL_AGENCY_SITES[key]['label']}\n"
        f"  URL: {_EXTERNAL_AGENCY_SITES[key]['url']}\n"
        f"  제공정보: {_EXTERNAL_AGENCY_SITES[key]['contents']}"
        for key in selected
    )
    header = (
        "[외부기관정보수집 결과]\n"
        f"- 수집 대상: {tid or '(대상 미지정)'}\n"
        f"- 수집 기관: {len(selected)}개\n\n"
        f"[수집 대상 기관 목록]\n{site_table}\n"
    )

    if llm is None:
        return {**state, result_key: header + "\n(LLM 미구성: 기관별 확인 포인트를 생성할 수 없습니다.)"}

    context = _company_context(tid) if target_type(state) == "company" else ""
    instruction = (
        "당신은 대한민국 관세청 조사관입니다. 아래 외부기관 정보원 목록을 대상으로, "
        "조사 대상에 대해 각 기관에서 무엇을 확인해야 하는지 '기관별 확인 포인트'를 작성하십시오.\n\n"
        f"[수집 대상 기관]\n{site_table}\n\n"
        "[작성 규칙]\n"
        "- 기관별로 1~3줄: 검색어(회사명·사업자번호·대표자 등)와 확인 항목, 조사 연관성을 제시하십시오.\n"
        "- 마지막에 '우선 수집 순서'를 근거와 함께 제안하십시오.\n"
        "- 실제 사이트 접속 결과가 아니므로 조회 값을 단정하지 말고 확인 계획 중심으로 기술하십시오.\n"
        + (f"\n[조사 대상 기업 기본정보(DuckDB)]\n{context}\n" if context else "")
        + (f"\n[요청 프롬프트]\n{prompt_text(state)}\n" if prompt_text(state).strip() else "")
    )
    summary = llm.invoke(instruction)
    body = getattr(summary, "content", summary)
    print("[Agent] 외부기관정보수집 완료")
    return {**state, result_key: f"{header}\n[기관별 확인 포인트]\n{body}"}
