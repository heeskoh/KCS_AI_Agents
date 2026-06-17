"""표준 입출력 인코딩 통일 — 모든 결과 표시는 UTF-8을 표준으로 한다.

Windows 기본 콘솔 코드페이지(cp949 등)에서도 한글·이모지가 포함된 결과 텍스트가
깨지거나 UnicodeEncodeError로 작업이 중단되지 않도록 stdout/stderr를 UTF-8로
재설정한다. 인터프리터 실행 방식(직접 실행/서비스/출력 리다이렉트)과 무관하게 적용된다.

HTTP/SSE 응답은 이미 UTF-8(ensure_ascii=False, charset=utf-8)로 전송되며,
이 모듈은 서버·에이전트가 콘솔/로그로 출력하는 결과 표시까지 UTF-8로 일원화한다.
"""
from __future__ import annotations

import sys

UTF8 = "utf-8"


def force_utf8_stdio() -> None:
    """sys.stdout/sys.stderr를 UTF-8(errors='replace')로 재설정한다. 실패해도 무시."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding=UTF8, errors="replace")
        except (ValueError, OSError):
            # 일부 환경(예: 이미 분리된 스트림)에서는 재설정이 불가능할 수 있다.
            pass
