# -*- coding: utf-8 -*-
"""통관보고서 생성 서비스 처리과정 standalone HTML 생성기.

agent_clearance_report 를 실제로 실행하면서 각 단계의 입·출력을 캡처해,
서버 없이 열어볼 수 있는 단일 HTML로 재구성한다. 값을 지어내지 않고
실행 결과를 그대로 담는다.

단계
  1) 입력 접수     신고번호 + 현장사진
  2) 신고내용 조회  DuckDB 4-테이블에서 신고건 로드
  3) 사진 판독     비전 모델로 증빙사진 설명 생성
  4) 의견 생성     신고내용 + 사진판독 → 통관의견(JSON)
  5) 보고서 조립   5개 섹션 템플릿으로 렌더링

사용:
  python tools/build_clearance_report_demo.py --declaration DV2-C-1001-01 \
      --photo <이미지경로> [--out dist/clearance_report_demo.html]
  --photo 를 생략하면 샘플 현장사진을 생성해 사용한다.
"""
from __future__ import annotations

import argparse
import base64
import html
import io
import json
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DEFAULT_OUT = ROOT / "dist" / "clearance_report_demo.html"


def sample_photo() -> tuple[bytes, str]:
    """현장사진이 주어지지 않았을 때 쓸 샘플 이미지(라벨이 보이는 화물 사진)."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (760, 480), (236, 238, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([60, 140, 700, 430], fill=(196, 164, 120), outline=(88, 68, 44), width=5)
    d.rectangle([100, 180, 340, 300], fill=(252, 252, 250), outline=(60, 60, 60), width=3)
    d.text((118, 205), "PET RESIN", fill=(15, 15, 15))
    d.text((118, 230), "ORIGIN: CHINA", fill=(15, 15, 15))
    d.text((118, 255), "NET 25KG", fill=(15, 15, 15))
    d.text((70, 105), "IMPORT CARGO - PALLET 1/4", fill=(45, 45, 45))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue(), "현장사진_팔레트1.png"


def thumb_data_uri(raw: bytes, max_px: int = 900) -> str:
    from PIL import Image
    img = Image.open(io.BytesIO(raw))
    img.thumbnail((max_px, max_px))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=78)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def capture(declaration_no: str, photo_bytes: bytes, photo_name: str) -> dict:
    """에이전트 내부 단계를 순서대로 실행하며 입·출력을 캡처한다."""
    from src.agents import agent_clearance_report as A

    photo = {
        "name": photo_name, "mime": "image/png", "encoding": "base64",
        "content": base64.b64encode(photo_bytes).decode(), "size": len(photo_bytes),
    }
    steps: list[dict] = []

    steps.append({
        "no": 1, "title": "입력 접수", "elapsed": 0.0,
        "detail": f"신고번호 <code>{html.escape(declaration_no)}</code> · "
                  f"현장사진 {html.escape(photo_name)} ({len(photo_bytes)/1024:,.0f} KB)",
        "body": "", "kind": "input",
    })

    t0 = time.time()
    data = A._load_declaration(declaration_no)
    if not data:
        raise SystemExit(f"신고번호 {declaration_no} 을(를) DB에서 찾지 못했습니다.")
    declaration_md = A._render_declaration(data)
    steps.append({
        "no": 2, "title": "신고내용 조회 (DuckDB)", "elapsed": time.time() - t0,
        "detail": "import_declarations · items · specs · taxes 4개 테이블 조인",
        "body": declaration_md, "kind": "md",
    })

    t0 = time.time()
    description = A._describe_photo(photo)
    steps.append({
        "no": 3, "title": "현장사진 판독 (비전 모델)", "elapsed": time.time() - t0,
        "detail": f"모델 {html.escape(A.vision_model() or '사용 불가')}",
        "body": description or "(판독 결과 없음)", "kind": "text",
    })

    t0 = time.time()
    opinion = A._build_opinion(declaration_md, f"- {photo_name}: {description}")
    steps.append({
        "no": 4, "title": "통관의견 생성", "elapsed": time.time() - t0,
        "detail": "신고내용 + 사진판독을 근거로 구조화 JSON 생성",
        "body": json.dumps(opinion, ensure_ascii=False, indent=2), "kind": "json",
    })

    t0 = time.time()
    state = A.agent_clearance_report({"scenario": {
        "declaration_no": declaration_no, "uploaded_files": [photo],
        "current_user": "김통관 (인천세관 통관지원과)",
    }})
    report = state.get("clearance_report_result") or ""
    steps.append({
        "no": 5, "title": "보고서 조립", "elapsed": time.time() - t0,
        "detail": "5개 섹션 템플릿 렌더링 · 사진을 720px JPEG로 축소해 삽입",
        "body": report, "kind": "report",
    })

    header = data["header"]
    return {
        "declaration_no": declaration_no,
        "company": f"{header.get('importer_name')} ({header.get('company_id')})",
        "item": str(header.get("item_name")),
        "origin": str(header.get("origin_country")),
        "photo_uri": thumb_data_uri(photo_bytes),
        "photo_name": photo_name,
        "steps": steps,
        "report": report,
    }


def render_html(cap: dict) -> str:
    def esc(v):
        return html.escape(str(v))

    step_cards = []
    for s in cap["steps"]:
        body = ""
        if s["kind"] == "report":
            # 보고서 원문은 접어두고 렌더된 형태를 아래 별도 영역에 보여준다
            body = f'<details><summary>보고서 원문(Markdown) 보기</summary><pre>{esc(s["body"])}</pre></details>'
        elif s["kind"] == "json":
            body = f'<pre class="json">{esc(s["body"])}</pre>'
        elif s["kind"] in ("md", "text") and s["body"]:
            body = f'<pre>{esc(s["body"])}</pre>'
        step_cards.append(f"""
      <li class="step">
        <div class="step-head">
          <span class="step-no">{s['no']}</span>
          <b>{esc(s['title'])}</b>
          <span class="elapsed">{s['elapsed']:.1f}s</span>
        </div>
        <p class="step-detail">{s['detail']}</p>
        {body}
      </li>""")

    # 보고서 본문을 간단 마크다운 → HTML (제목/불릿/굵게/이미지)
    report_html = md_to_html(cap["report"])

    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>통관보고서 생성 처리과정 — {esc(cap['declaration_no'])}</title>
<style>
  :root {{ --line:#e3e8f0; --muted:#64748b; --blue:#2f6fed; --bg:#f6f8fc; }}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--bg);color:#0f172a;
    font-family:"Malgun Gothic","맑은 고딕",system-ui,-apple-system,sans-serif;line-height:1.6}}
  .wrap{{max-width:1080px;margin:0 auto;padding:28px 20px 64px}}
  header h1{{margin:0 0 6px;font-size:22px}}
  header p{{margin:0;color:var(--muted);font-size:13px}}
  .meta{{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 26px}}
  .meta div{{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px}}
  .meta b{{color:#123c85}}
  h2{{font-size:16px;margin:30px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--line)}}
  ol.steps{{list-style:none;margin:0;padding:0;display:grid;gap:12px}}
  .step{{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}}
  .step-head{{display:flex;align-items:center;gap:10px}}
  .step-no{{flex:none;width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;
    font-size:12px;font-weight:800;display:grid;place-items:center}}
  .step-head b{{flex:1;font-size:14px}}
  .elapsed{{font-size:12px;color:var(--muted)}}
  .step-detail{{margin:8px 0 0 34px;font-size:12.5px;color:var(--muted)}}
  .step pre,.step details{{margin:10px 0 0 34px}}
  pre{{background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:10px 12px;
    font-size:12px;line-height:1.55;overflow:auto;max-height:340px;white-space:pre-wrap;word-break:break-word}}
  pre.json{{background:#0f172a;color:#e2e8f0;border-color:#0f172a}}
  summary{{cursor:pointer;font-size:12.5px;color:var(--blue);font-weight:700}}
  code{{background:#eef2f7;border-radius:4px;padding:1px 5px;font-size:12px}}
  .report{{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px 26px}}
  .report h1{{font-size:19px;margin:0 0 14px}}
  .report h2{{font-size:15px;margin:20px 0 8px;border:0;padding:0;color:#123c85}}
  .report ul{{margin:6px 0;padding-left:20px}}
  .report li{{font-size:13.5px;margin:3px 0}}
  .report img{{display:block;max-width:100%;height:auto;margin:10px 0;
    border:1px solid var(--line);border-radius:10px}}
  .report hr{{border:0;border-top:1px solid var(--line);margin:20px 0 12px}}
  .report em{{color:var(--muted);font-style:normal;font-size:12.5px}}
  footer{{margin-top:34px;font-size:12px;color:var(--muted)}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>통관보고서 생성 서비스 — 처리과정</h1>
    <p>신고번호와 현장사진을 입력받아 신고내용을 조회하고 증빙을 첨부해 통관의견까지 작성하는 과정을 실행 결과 그대로 담았습니다.</p>
  </header>

  <div class="meta">
    <div>신고번호 <b>{esc(cap['declaration_no'])}</b></div>
    <div>수입자 <b>{esc(cap['company'])}</b></div>
    <div>품명 <b>{esc(cap['item'])}</b></div>
    <div>원산지 <b>{esc(cap['origin'])}</b></div>
    <div>생성일 <b>{date.today().isoformat()}</b></div>
  </div>

  <h2>입력 — 현장 증빙사진</h2>
  <img src="{cap['photo_uri']}" alt="{esc(cap['photo_name'])}"
       style="display:block;max-width:100%;border:1px solid var(--line);border-radius:12px">

  <h2>처리 단계</h2>
  <ol class="steps">{''.join(step_cards)}
  </ol>

  <h2>산출물 — 통관보고서</h2>
  <div class="report">{report_html}</div>

  <footer>
    이 문서는 tools/build_clearance_report_demo.py 로 생성되었으며, 표시된 값은 실제 실행 결과입니다.
    서버 없이 열람할 수 있도록 사진과 스타일을 파일 안에 포함했습니다.
  </footer>
</div>
</body>
</html>
"""


def md_to_html(md: str) -> str:
    """보고서 렌더용 최소 마크다운 변환 (제목·불릿·굵게·이미지·구분선)."""
    import re
    out: list[str] = []
    in_list = False

    def inline(text: str) -> str:
        text = html.escape(text)
        text = re.sub(r"!\[([^\]]*)\]\((data:image/[^)]+)\)",
                      lambda m: f'<img src="{m.group(2)}" alt="{m.group(1)}">', text)
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
        return text

    for raw in md.split("\n"):
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            if in_list:
                out.append("</ul>")
                in_list = False
            continue
        if stripped == "---":
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append("<hr>")
            continue
        heading = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if heading:
            if in_list:
                out.append("</ul>")
                in_list = False
            level = len(heading.group(1))
            out.append(f"<h{level}>{inline(heading.group(2))}</h{level}>")
            continue
        bullet = re.match(r"^(?:\*|-)\s+(.*)$", stripped) or re.match(r"^\d+\.\s+(.*)$", stripped)
        if bullet:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{inline(bullet.group(1))}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        out.append(f"<p>{inline(stripped)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--declaration", default="DV2-C-1001-01", help="대상 신고번호")
    ap.add_argument("--photo", help="현장사진 경로 (생략 시 샘플 생성)")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    if args.photo:
        path = Path(args.photo)
        if not path.exists():
            raise SystemExit(f"사진을 찾을 수 없습니다: {path}")
        photo_bytes, photo_name = path.read_bytes(), path.name
    else:
        photo_bytes, photo_name = sample_photo()
        print("현장사진 미지정 — 샘플 이미지를 생성했습니다.")

    print(f"신고번호 {args.declaration} 처리과정 캡처 중 …")
    cap = capture(args.declaration, photo_bytes, photo_name)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_html(cap), encoding="utf-8")
    print(f"생성 완료: {out}  ({out.stat().st_size/1024:,.0f} KB)")
    for s in cap["steps"]:
        print(f"  {s['no']}. {s['title']:24s} {s['elapsed']:5.1f}s")


if __name__ == "__main__":
    main()
