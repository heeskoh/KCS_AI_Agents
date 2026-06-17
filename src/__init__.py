"""Customs agent workflow package."""

# 패키지 로드 시점에 표준 출력/오류를 UTF-8로 통일한다.
# (모든 진입점: web_server, workflows CLI, scripts — src import만으로 표준 적용)
from src.encoding import force_utf8_stdio as _force_utf8_stdio

_force_utf8_stdio()
