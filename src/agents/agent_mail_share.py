from datetime import datetime

from src.agents.state import CustomsState


_RESULT_KEYS = [
    "final_report",
    "validation_result",
    "summary_result",
    "db_result",
    "rag_result",
    "ml_result",
    "network_result",
    "web_result",
    "declaration_verify_result",
    "hs_verify_result",
    "customs_value_result",
    "law_result",
]


def _first_text(state: CustomsState, keys: list[str]) -> str:
    for key in keys:
        value = state.get(key)
        if value:
            return str(value)
    return ""


def _mail_recipients(state: CustomsState) -> str:
    scenario = state.get("scenario") or {}
    recipients = scenario.get("share_recipients")
    if isinstance(recipients, list) and recipients:
        return ", ".join(str(item).strip() for item in recipients if str(item).strip())
    if isinstance(recipients, str) and recipients.strip():
        return recipients.strip()
    return ""


def agent_mail_share(state: CustomsState) -> CustomsState:
    """Prepare an email share package for the latest analysis report."""
    print("\n[Agent] 분석결과 공유 시작")

    scenario = state.get("scenario") or {}
    recipients = _mail_recipients(state)
    if not recipients:
        raise ValueError("분석결과 공유 AI 서비스는 수신 이메일 ID를 1개 이상 등록해야 합니다.")

    company_id = state.get("company_id") or "대상 미지정"
    prompt = scenario.get("user_prompt") or "분석 요청"
    report = _first_text(state, ["final_report", "summary_result"])
    basis = "\n\n".join(
        f"[{key}]\n{str(state.get(key))[:1200]}"
        for key in _RESULT_KEYS
        if state.get(key)
    )
    if not report:
        report = basis or "공유할 분석 결과가 아직 생성되지 않았습니다."

    subject = f"[AI 분석결과 공유] {company_id} 결과보고서"
    sent_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    preview = report.strip().splitlines()
    preview_text = "\n".join(line for line in preview if line.strip())[:1800]

    result = f"""# 분석결과 공유 결과

- 발송 상태: 공유 준비 완료
- 발송 시각: {sent_at}
- 수신 이메일: {recipients}
- 제목: {subject}
- 첨부: AI 분석 결과보고서.md

## 이메일 본문
안녕하세요.

아래 요청에 대한 AI 분석 결과보고서를 공유드립니다.

- 대상: {company_id}
- 요청: {prompt}
- 후속 조치: 보고서 내용 검토 후 추가 확인이 필요한 증빙과 법령 근거를 확인해 주세요.

## 결과보고서 요약
{preview_text}
"""

    print("[Agent] 분석결과 공유 완료")
    return {**state, "mail_share_result": result}
