from __future__ import annotations

from typing import Any


def _cfg(company: str, person: str | None = None, supports: dict[str, bool] | None = None) -> dict[str, Any]:
    return {
        "supports": supports or {"company": True, "person": True},
        "default_prompts": {
            "company": company,
            "person": person or company,
        },
    }


AI_SERVICE_TARGET_CONFIG: dict[str, dict[str, Any]] = {
    "db_cdw": _cfg("기업 프로파일, 최근 수입신고, 위험지표를 종합 요약", "우범자 프로파일, 여행·반입 이력, 위험지표를 종합 요약"),
    "company_profile": _cfg("기업 기본정보, 위험등급, 수입실적, 최근 신고·검사 이력을 조회", "기업 프로파일 조회는 개인 대상에서 사용하지 않습니다.", {"company": True, "person": False}),
    "rag_customs": _cfg("관세 업무 정보에서 과세가격, 원산지, 품목분류 관련 근거 확인", "휴대품, 여행자 통관, 조사 절차 관련 규정 근거 확인"),
    "rag_trade": _cfg("통관/무역 정보에서 이상 징후와 참고 근거 확인", "개인 반입·운송·거래 정보에서 이상 징후와 참고 근거 확인"),
    "rag_audit": _cfg("심사정보와 추징 가능성 관점의 조사 포인트 정리", "개인 사건 검토 이력과 추징 가능성 관점의 조사 포인트 정리"),
    "rag_investigation": _cfg("조사 정보 기반으로 조사 순서와 확인 자료 정리", "개인 수사 정보 기반으로 수사 순서와 확인 자료 정리"),
    "rag_global": _cfg("국제협력 정보 기반으로 해외 거래구조와 위험 신호 확인", "국제 여행·체류·공조 정보 기반으로 개인 위험 신호 확인"),
    "rag_consultation": _cfg("상담내역과 민원 질의 응답에서 유사 사례와 처리 흐름 확인", "개인 민원·상담내역에서 유사 사례와 처리 흐름 확인"),
    "rag_risk_select": _cfg("위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인", "개인 위험선별 기준과 선별 이력을 바탕으로 위험 신호 확인"),
    "ml": _cfg("전체 모델을 실행해 기업 위험 패턴을 비교", "전체 모델을 실행해 개인 위험 패턴을 비교"),
    "network": _cfg("관계망과 거래 구조를 분석해 특수관계, 우회수입, 페이퍼컴퍼니 가능성을 식별", "인물·동행자·연락처·주소 관계망을 분석해 공범, 전달책, 반복 연계 가능성을 식별"),
    "ontology": _cfg("기업·거래·품목 중심 관세 온톨로지와 지식그래프 관계를 구성", "우범여행자 중심 관세 온톨로지와 지식그래프 관계를 구성"),
    "origin_analysis": _cfg("원산지 증빙과 FTA 적용, 우회수입 가능성을 시뮬레이션 분석", "개인 반입 물품의 원산지 증빙과 우회 반입 가능성을 분석"),
    "abnormal_trade": _cfg("가격·거래상대방·신고패턴의 이상거래 징후를 검증", "반입·송금·연락·이동 패턴의 이상 징후를 검증"),
    "proceeds_tracking": _cfg("자금흐름과 계좌 추적 단서를 기반으로 범죄수익 은닉 가능성을 분석", "개인 계좌·송금·현금 반입 단서를 기반으로 범죄수익 은닉 가능성을 분석"),
    "route_analysis": _cfg("운송경로와 공급망을 역추적하여 우회수입 가능성을 탐지", "여행경로, 경유지, 동행 이력을 분석해 우회 반입 가능성을 탐지"),
    "web": _cfg("업체, 공급망, 가격 변동 관련 기사 또는 직접 등록한 URL에서 지정 정보를 확인", "인물, 조직, 사건, 여행 경로 관련 공개 정보 또는 직접 등록한 URL에서 지정 정보를 확인"),
    "web_search": _cfg("업체, 공급망, 가격 변동 관련 기사 또는 직접 등록한 URL에서 지정 정보를 확인", "인물, 조직, 사건, 여행 경로 관련 공개 정보 또는 직접 등록한 URL에서 지정 정보를 확인"),
    "declaration_verify": _cfg("첨부문서 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치와 화물 이상 패턴 확인", "개인 휴대품 신고, 반입 물품, 첨부 증빙을 비교해 불일치와 은닉 가능성 확인"),
    "hs_verify": _cfg("수입신고 품목과 세금계산서 물품목록을 비교하고 HS코드·전략물자·수출허가내역을 검증", "개인 반입 물품의 품목분류와 규제 대상 여부를 검증"),
    "customs_value": _cfg("과세가격 결정 요소와 저가신고 가능성 검토", "개인 반입 물품의 과세가격 산정 근거와 축소 신고 가능성 검토"),
    "patent": _cfg("특허/로열티 관련 거래와 과세가격 반영 여부 확인", "개인 반입 물품의 상표권·지식재산권 침해 가능성 확인"),
    "law": _cfg("관련 법령, 고시, 판례, 유권해석 근거 검색", "개인 수사·통관·처분 관련 법령, 고시, 판례, 유권해석 근거 검색"),
    "ocr": _cfg("첨부 문서에서 주요 항목을 추출하고 신고자료와 대조할 수 있도록 구조화", "개인 신분·여행·반입 관련 첨부 문서에서 주요 항목을 추출하고 구조화"),
    "rag_create": _cfg("선택 자료를 RAG 지식으로 구성하기 위한 항목 정리", "개인 사건 자료를 RAG 지식으로 구성하기 위한 항목 정리"),
    "summary": _cfg("선행 단계 결과를 조사관용 핵심 요약으로 정리", "선행 단계 결과를 개인 수사 담당자용 핵심 요약으로 정리"),
    "report": _cfg("이전 단계 결과를 공식 조사보고서 초안으로 통합", "이전 단계 결과를 개인 수사보고서 초안으로 통합"),
    "report_generate": _cfg("이전 단계 결과를 공식 조사보고서 초안으로 통합", "이전 단계 결과를 개인 수사보고서 초안으로 통합"),
    "validation": _cfg("보고서의 근거 충실성, 과도한 추론, URL/출처를 검증", "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증"),
    "report_validate": _cfg("보고서의 근거 충실성, 과도한 추론, URL/출처를 검증", "개인 수사보고서의 근거 충실성, 과도한 추론, URL/출처를 검증"),
    "mail_share": _cfg("분석결과 보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유", "개인 수사 결과보고서를 이메일 본문과 첨부 요약으로 구성하여 지정 수신자에게 공유"),
    "result_synthesis": _cfg("선행 단계 결과를 사용자가 지정한 최종 결과 형식으로 종합", "선행 단계 결과를 사용자가 지정한 최종 결과 형식으로 종합"),
}


def normalize_target_type(value: Any) -> str:
    return "person" if str(value or "").strip().lower() == "person" else "company"


def service_supports_target(key: str | None, target_type: str | None) -> bool:
    config = AI_SERVICE_TARGET_CONFIG.get(str(key or ""))
    if not config:
        return True
    return config.get("supports", {}).get(normalize_target_type(target_type), True) is not False


def default_prompt(key: str | None, target_type: str | None) -> str:
    config = AI_SERVICE_TARGET_CONFIG.get(str(key or ""))
    if not config:
        return ""
    prompts = config.get("default_prompts", {})
    target = normalize_target_type(target_type)
    return str(prompts.get(target) or prompts.get("company") or "")
