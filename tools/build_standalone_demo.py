# -*- coding: utf-8 -*-
"""AI 관세행정 통합포털 standalone 데모 HTML 생성기.

실제 SPA 코드(web/static)를 그대로 임베드하고, /api/* 응답 스냅샷과
AI 워크플로 SSE 녹화를 내장해 서버 없이 단일 HTML로 재생한다.

- ES 모듈: import 구문을 bare specifier("app/...")로 재작성 → import map + Blob URL 로드
- fetch/EventSource: 심(shim)으로 교체해 스냅샷/녹화 재생, 상태 저장 POST는 no-op
- 이미지(/static/img/*): data URL 치환 (정적 태그 + MutationObserver)
- cytoscape/drawflow/dagre: 전역으로 선주입해 동적 로더 가드를 통과

사용:
  python tools/build_standalone_demo.py --snapshot <snapshot_get.json> \
      --sse <sse_recording.json> --out dist/demo.html
"""
import argparse
import base64
import json
import posixpath
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "web" / "static"


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8-sig")


def js_embed(obj) -> str:
    """인라인 <script> 안에 안전하게 넣을 수 있는 JSON 직렬화."""
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    # 문자열 내 "</script>"로 스크립트 블록이 닫히는 것 방지 ("<\/"는 JS에서 "</"와 동일)
    return s.replace("</", "<\\/")


def module_name(rel: str) -> str:
    return "app/" + rel.replace("\\", "/")


IMPORT_RE = re.compile(r"""(\b(?:from|import)\s*)(["'])([^"']+)\2""")


def rewrite_imports(src: str, rel: str) -> str:
    """정적 import/export-from 의 상대 경로를 bare specifier로 재작성."""
    base = posixpath.dirname(rel.replace("\\", "/"))

    def sub(m):
        head, quote, spec = m.group(1), m.group(2), m.group(3)
        if spec.startswith("./") or spec.startswith("../"):
            resolved = posixpath.normpath(posixpath.join(base, spec))
        elif spec.startswith("/static/"):
            resolved = spec[len("/static/"):]
        else:
            return m.group(0)  # bare/외부 URL은 그대로
        return f"{head}{quote}{module_name(resolved)}{quote}"

    return IMPORT_RE.sub(sub, src)


def collect_modules() -> dict[str, str]:
    mods = {}
    for p in [STATIC / "app.js", *sorted((STATIC / "js").rglob("*.js"))]:
        rel = p.relative_to(STATIC).as_posix()
        mods[module_name(rel)] = rewrite_imports(read_text(p), rel)
    return mods


def collect_images() -> dict[str, str]:
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".svg": "image/svg+xml", ".gif": "image/gif", ".webp": "image/webp"}
    out = {}
    img_dir = STATIC / "img"
    for p in sorted(img_dir.glob("*")):
        if p.suffix.lower() not in mime:
            continue
        b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        out[p.name] = f"data:{mime[p.suffix.lower()]};base64,{b64}"
    return out


def collect_prompts() -> dict[str, object]:
    out = {}
    for p in sorted((STATIC / "prompts").rglob("*.json")):
        rel = "/static/" + p.relative_to(STATIC).as_posix()
        out[rel] = json.loads(read_text(p))
    return out


SHIM = r"""
(() => {
  const D = window.__DEMO__;
  D.speed = D.speed ?? 0.35;   // SSE 재생 속도 배율 (녹화 간격 대비)

  /* ── 스냅샷 조회: path + 정렬 쿼리 정규화, id 파라미터 기반 폴백 ── */
  const byPath = {};
  for (const key of Object.keys(D.snapshot)) {
    const q = key.indexOf("?");
    const path = q < 0 ? key : key.slice(0, q);
    const params = q < 0 ? {} : Object.fromEntries(new URLSearchParams(key.slice(q + 1)));
    (byPath[path] = byPath[path] || []).push({ key, params });
  }
  function normalize(u) {
    const q = u.indexOf("?");
    if (q < 0) return { key: u, path: u, params: {} };
    const path = u.slice(0, q);
    const sp = new URLSearchParams(u.slice(q + 1));
    const pairs = [...sp.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const qs = pairs.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
    return { key: qs ? path + "?" + qs : path, path, params: Object.fromEntries(sp) };
  }
  const ID_KEYS = ["company_id", "person_id", "org_id", "id"];
  function lookup(u) {
    const { key, path, params } = normalize(u);
    if (key in D.snapshot) return D.snapshot[key];
    const cands = byPath[path];
    if (!cands) return undefined;
    const ids = ID_KEYS.filter(k => k in params);
    if (ids.length) {
      const hit = cands.find(c => ids.every(k => c.params[k] === params[k]));
      if (hit) return D.snapshot[hit.key];
      return undefined;
    }
    return cands.length === 1 ? D.snapshot[cands[0].key] : undefined;
  }
  function jsonResp(obj, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status, headers: { "Content-Type": "application/json" },
    }));
  }

  /* ── fetch 심 ── */
  const origFetch = window.fetch.bind(window);
  const SAVE_POST = /\/api\/(workspace_state|analysis_templates|scenario_builder_config|scenario_templates|prompt_overrides|network_scenarios)$/;
  const DEMO_NOTICE = "⚠️ 이 기능은 standalone 데모에서 비활성화되어 있습니다. (실서버에서 이용 가능)";
  window.fetch = function (input, init) {
    const raw = typeof input === "string" ? input : (input && input.url) || "";
    const method = ((init && init.method) || (typeof input !== "string" && input && input.method) || "GET").toUpperCase();
    let u = raw;
    try {
      const abs = new URL(raw, "http://demo.local");
      if (abs.host === "demo.local" || abs.host === location.host) u = abs.pathname + abs.search;
    } catch (e) { /* noop */ }
    if (!(u.startsWith("/api/") || u.startsWith("/static/prompts/"))) return origFetch(input, init);

    if (u.startsWith("/static/prompts/")) {
      const hit = D.prompts[u.split("?")[0]];
      return hit !== undefined ? jsonResp(hit) : jsonResp({ error: "not captured" }, 404);
    }
    if (method === "GET") {
      const hit = lookup(u);
      if (hit !== undefined) return jsonResp(hit);
      console.warn("[demo] 미캡처 GET:", u);
      return jsonResp({ error: "demo: not captured" }, 404);
    }
    if (SAVE_POST.test(u.split("?")[0])) return jsonResp({ status: "saved" });
    if (u.startsWith("/api/upload/clear")) return jsonResp({ status: "cleared" });
    if (u.startsWith("/api/llm_stream")) {
      const body = 'event: token\ndata: {"text":' + JSON.stringify(DEMO_NOTICE) + '}\n\n' +
                   'event: done\ndata: {"text":' + JSON.stringify(DEMO_NOTICE) + '}\n\n';
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    }
    console.warn("[demo] POST 스텁:", u);
    return jsonResp({ answer: DEMO_NOTICE, text: DEMO_NOTICE, result: DEMO_NOTICE, rows: [], sql: "", error: null });
  };

  /* ── EventSource 심: 녹화 재생 ── */
  function matchSse(url) {
    const { path, params } = normalize(url);
    return D.sse.find(rec => {
      const r = normalize(rec.url);
      if (r.path !== path) return false;
      return ID_KEYS.every(k => (params[k] || "") === (r.params[k] || ""));
    });
  }
  class DemoEventSource extends EventTarget {
    constructor(url) {
      super();
      this.url = String(url);
      this.readyState = 1;
      this._timers = [];
      this.onerror = null;
      this.onmessage = null;
      const rec = matchSse(this.url);
      if (!rec || !rec.frames.length) {
        console.warn("[demo] 녹화되지 않은 SSE:", this.url);
        this._timers.push(setTimeout(() => {
          const ev = new Event("error");
          if (this.onerror) this.onerror(ev);
          this.dispatchEvent(ev);
        }, 400));
        return;
      }
      let prev = rec.frames[0].t;
      let acc = 500;
      for (const f of rec.frames) {
        const gap = Math.max(0, f.t - prev);
        prev = f.t;
        acc += Math.min(gap * D.speed, 3000) + 200;
        this._timers.push(setTimeout(() => {
          if (this.readyState !== 1) return;
          const ev = new MessageEvent(f.event, { data: f.data });
          this.dispatchEvent(ev);
          if (f.event === "message" && this.onmessage) this.onmessage(ev);
        }, acc));
      }
    }
    close() { this.readyState = 2; this._timers.forEach(clearTimeout); this._timers = []; }
  }
  DemoEventSource.CONNECTING = 0; DemoEventSource.OPEN = 1; DemoEventSource.CLOSED = 2;
  window.EventSource = DemoEventSource;

  /* ── 이미지 data URL 치환 (동적 생성 <img> 포함) ── */
  function fixImg(el) {
    const src = el.getAttribute("src") || "";
    const m = src.match(/^\/static\/img\/(.+)$/);
    if (m && D.images[m[1]]) el.src = D.images[m[1]];
  }
  new MutationObserver(muts => {
    for (const mu of muts) {
      if (mu.type === "attributes" && mu.target.tagName === "IMG") fixImg(mu.target);
      if (mu.addedNodes) for (const n of mu.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "IMG") fixImg(n);
        if (n.querySelectorAll) n.querySelectorAll("img").forEach(fixImg);
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
})();
"""

BOOT = r"""
(() => {
  const mods = window.__DEMO__.modules;
  const map = { imports: {} };
  for (const [name, src] of Object.entries(mods)) {
    map.imports[name] = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  }
  const im = document.createElement("script");
  im.type = "importmap";
  im.textContent = JSON.stringify(map);
  document.currentScript.after(im);
  const boot = document.createElement("script");
  boot.type = "module";
  boot.textContent = 'import "app/app.js";';
  im.after(boot);
})();
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True, help="GET API 응답 스냅샷 JSON")
    ap.add_argument("--sse", required=True, help="SSE 녹화 JSON")
    ap.add_argument("--out", required=True, help="출력 HTML 경로")
    ap.add_argument("--speed", type=float, default=0.35, help="SSE 재생 속도 배율")
    args = ap.parse_args()

    snapshot = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
    sse = json.loads(Path(args.sse).read_text(encoding="utf-8"))

    styles = read_text(STATIC / "styles.css") + "\n" + read_text(STATIC / "vendor" / "drawflow.min.css")
    if "</style" in styles.lower():
        print("ERROR: CSS에 </style 포함", file=sys.stderr)
        return 1

    vendors = []
    for p in [ROOT / "tools" / "vendor" / "cytoscape.min.js",
              STATIC / "vendor" / "drawflow.min.js",
              STATIC / "vendor" / "dagre.min.js"]:
        src = read_text(p)
        if "</script" in src.lower():
            print(f"ERROR: {p.name}에 </script 포함 — 별도 처리 필요", file=sys.stderr)
            return 1
        vendors.append(f"<script>/* {p.name} */\n{src}\n</script>")

    demo = {
        "snapshot": snapshot,
        "sse": sse,
        "images": collect_images(),
        "prompts": collect_prompts(),
        "modules": collect_modules(),
        "speed": args.speed,
    }

    index = read_text(STATIC / "index.html")
    body_match = re.search(r"<body>([\s\S]*)</body>", index)
    title_match = re.search(r"<title>([\s\S]*?)</title>", index)
    body = body_match.group(1)
    title = title_match.group(1) if title_match else "AI 관세행정 통합포털"
    # 정적 <img>도 data URL로 치환
    for name, data_url in demo["images"].items():
        body = body.replace(f"/static/img/{name}", data_url)

    for name, src in demo["modules"].items():
        if "</script" in src.lower():
            print(f"ERROR: 모듈 {name}에 </script 포함", file=sys.stderr)
            return 1

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} (Standalone Demo)</title>
  <style>
{styles}
  </style>
  <script>window.__DEMO__ = {js_embed(demo)};</script>
  <script>{SHIM}</script>
  {chr(10).join(vendors)}
  <script>{BOOT}</script>
</head>
<body>{body}</body>
</html>
"""
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"OK: {out} ({out.stat().st_size / 1024 / 1024:.1f} MB, 모듈 {len(demo['modules'])}개, "
          f"스냅샷 {len(snapshot)}키, SSE {len(sse)}건)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
