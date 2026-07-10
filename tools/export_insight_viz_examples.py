"""수사정보 분석 관점별(A~E) 시각화 예시를 독립 실행형 SVG 파일로 내보낸다.

web/static/js/analysis/customs/insight-viz.js의 템플릿에서 SVG를 추출해
스타일(styles.css의 .ci-insight-viz 토큰과 동일)·흰 배경을 내장한 파일을
docs/insight-viz-examples/ 아래에 생성한다. 브라우저에서 바로 열리고
그대로 공유·인쇄·변환(PNG)할 수 있다.

실행:  python tools/export_insight_viz_examples.py
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web/static/js/analysis/customs/insight-viz.js"
OUT_DIR = ROOT / "docs/insight-viz-examples"

COMPANY_NAME = "관세조사대상기업022"
COMPANY_ID = "C-1022"

FILES = {
    "A": "A_신고물품정합성_분석",
    "B": "B_물류경로_분석",
    "C": "C_자금흐름_분석",
    "D": "D_관계네트워크_분석",
    "E": "E_행위패턴_이상탐지",
}

# styles.css의 .ci-insight-viz 스코프 토큰과 동일한 값 (독립 파일용 비스코프 정의)
STYLE = """<style>
  text{font-family:"Pretendard","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
  .s-surface{fill:#ffffff}.s-panel{fill:#f0f4fb}.s-line{stroke:#dbe3ef}.s-grid{stroke:#e7edf6}
  .s-gridfill{fill:#e7edf6;stroke:none}.s-ink{fill:#1f2a3d}.s-muted{fill:#68758d}.s-muted-st{stroke:#68758d}
  .s-accent{fill:#2563eb}.s-accent-st{stroke:#2563eb}.s-accent-soft{fill:#eaf1fe}.s-accent-txt{fill:#2563eb}
  .s-good{fill:#16a34a}.s-good-soft{fill:#e8f7ee}
  .s-warn{fill:#d97706}.s-warn-st{stroke:#d97706}.s-warn-soft{fill:#fdf3e3}
  .s-crit{fill:#dc2626}.s-crit-st{stroke:#dc2626}.s-crit-soft{fill:#fdeaea}
  .t-lbl{font-size:10.5px;font-weight:700;letter-spacing:.05em}
  .t-cell{font-size:11px}.t-cell-b{font-size:11px;font-weight:700}
  .t-num{font-size:11px}.t-node{font-size:10.5px;font-weight:700}
  .t-tiny{font-size:9.5px}.t-head{font-size:12px;font-weight:800}
</style>"""


def extract_svg(source: str, persp: str) -> str:
    """function vizX(name, cid){ return `...`; } 블록에서 템플릿 본문을 꺼낸다."""
    marker = f"function viz{persp}(name, cid)"
    start = source.index(marker)
    tpl_start = source.index("`", start) + 1
    tpl_end = source.index("`", tpl_start)
    svg = source[tpl_start:tpl_end].strip()
    svg = svg.replace("${escapeHtml(name)}", COMPANY_NAME).replace("${cid}", COMPANY_ID)
    if "${" in svg:
        raise ValueError(f"viz{persp}: 치환되지 않은 템플릿 표현식이 남아 있습니다.")
    return svg


def standalone(svg: str) -> str:
    """스타일·흰 배경·크기 속성을 내장한 독립 SVG 문서로 변환."""
    open_end = svg.index(">")
    open_tag, body = svg[: open_end + 1], svg[open_end + 1 :]
    m = re.search(r'viewBox="0 0 (\d+) (\d+)"', open_tag)
    w, h = m.group(1), m.group(2)
    open_tag = open_tag.replace("<svg ", f'<svg width="{w}" height="{h}" ', 1)
    bg = f'\n  <rect width="{w}" height="{h}" fill="#ffffff"/>'
    return f"{open_tag}\n  {STYLE}{bg}{body}"


def main() -> None:
    source = SRC.read_text(encoding="utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for persp, stem in FILES.items():
        path = OUT_DIR / f"{stem}.svg"
        path.write_text(standalone(extract_svg(source, persp)), encoding="utf-8")
        print(f"생성: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
