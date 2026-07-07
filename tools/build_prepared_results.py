# -*- coding: utf-8 -*-
"""사전 준비 분석 결과 생성 도구.

관세조사 워크스페이스의 "분석 시나리오 확인 및 설정" 화면은 실시간 실행 대신
사전 준비된 분석 결과(data/prepared_analysis_results.json)를 표시한다.
이 스크립트는 실행 중인 서버의 /api/run(SSE)을 기업별로 1회 호출해
단계별 출력·보고서·검증 결과를 캡처하고 아카이브 파일로 저장한다.

사용 예:
  python tools/build_prepared_results.py --base http://127.0.0.1:8001 --companies C-1001,C-1002
  python tools/build_prepared_results.py --base http://127.0.0.1:8001 --all
  python tools/build_prepared_results.py --companies C-1001 --force   # 기존 항목 재생성

- 기업별 템플릿은 위험지표(company_risk_indicator) 최고 점수 기준으로 자동 선택.
- 성공(workflow completed)한 런만 저장하며 기존 파일에 증분 병합한다.
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "prepared_analysis_results.json"
TEMPLATES_PATH = ROOT / "data" / "scenario_templates.json"

# 위험지표 코드 → 관세조사 템플릿 id (최고 점수 지표 기준 자동 매핑)
INDICATOR_TEMPLATE = {
    "undervaluation": "customs-valuation",
    "related_party": "customs-valuation",
    "hs_classification": "customs-classification",
    "offshore_fund": "customs-forex-audit",
    "customs_refund": "customs-refund",
    "fta_origin_misuse": "customs-requirement",
}
DEFAULT_TEMPLATE = "customs-valuation"


def get_json(base: str, path_q: str):
    with urllib.request.urlopen(base + path_q, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def pick_template_id(base: str, company_id: str) -> str:
    try:
        profile = get_json(base, f"/api/company?company_id={urllib.parse.quote(company_id)}")
    except Exception as exc:
        print(f"  [warn] 기업 프로파일 조회 실패({exc}) → 기본 템플릿 사용")
        return DEFAULT_TEMPLATE
    indicators = profile.get("risk_indicators") or {}
    best_code, best_score = "", -1.0
    for code, row in indicators.items():
        try:
            score = float(row.get("score") or 0)
        except (TypeError, ValueError):
            score = 0.0
        if score > best_score:
            best_code, best_score = code, score
    return INDICATOR_TEMPLATE.get(best_code, DEFAULT_TEMPLATE)


def load_template(template_id: str) -> dict:
    data = json.loads(TEMPLATES_PATH.read_text(encoding="utf-8-sig"))
    for template in data.get("customs", []):
        if template.get("id") == template_id:
            return template
    raise SystemExit(f"scenario_templates.json customs에 템플릿이 없습니다: {template_id}")


def build_scenario_items(template: dict, company_id: str) -> list[dict]:
    items = []
    for index, item in enumerate(sorted(template.get("items", []), key=lambda v: v.get("order", 999)), 1):
        behaviors = list(item.get("behaviors") or [])
        items.append({
            **item,
            "id": f"prep-{company_id}-{index:02d}",
            "order": index,
            "behaviors": behaviors,
            "behavior": item.get("behavior") or (behaviors[0] if behaviors else ""),
            "target_type": "company",
            "targetType": "company",
        })
    return items


def scenario_signature(items: list[dict]) -> str:
    # app-runtime.js scenarioSignature()와 동일 형식 (JSON.stringify, 공백 없음)
    return json.dumps(
        [
            {
                "key": item.get("key"),
                "behaviors": item.get("behaviors") or [],
                "instruction": item.get("instruction") or "",
                "order": item.get("order"),
            }
            for item in items
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def scenario_payload(items: list[dict]) -> dict:
    # app-runtime.js scenarioPayload()의 서버 소비 필드만 재현
    has_key = lambda key: any(item.get("key") == key for item in items)
    has_type = lambda t: any(item.get("type") == t for item in items)
    return {
        "execution_mode": "sequential",
        "scenario_items": items,
        "previous_step_outputs": [],
        "target_type": "company",
        "targetType": "company",
        "db_query": has_type("db"),
        "rag_enabled": any(str(item.get("type") or "").startswith("rag_") for item in items),
        "rag_customs_public": has_key("rag_customs"),
        "rag_trade": has_key("rag_trade"),
        "rag_audit": has_key("rag_audit"),
        "rag_investigation": has_key("rag_investigation"),
        "rag_global": has_key("rag_global"),
        "rag_consultation": has_key("rag_consultation"),
        "rag_risk_select": has_key("rag_risk_select"),
        "bigdata_enabled": has_type("bigdata"),
        "bigdata_trade_stats": has_key("bigdata_trade"),
        "bigdata_hs_stats": has_key("bigdata_hs"),
        "web_enabled": has_type("web"),
        "report_enabled": has_type("report"),
        "validation_enabled": has_type("validation"),
    }


def iter_sse_events(response):
    """SSE 스트림을 (event, data dict) 튜플로 순회한다."""
    event, data_lines = "", []
    for raw in response:
        line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
        if line == "":
            if data_lines:
                try:
                    yield event or "message", json.loads("\n".join(data_lines))
                except json.JSONDecodeError:
                    pass
            event, data_lines = "", []
            continue
        if line.startswith("event:"):
            event = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].strip())


def run_company(base: str, company_id: str, template: dict) -> dict | None:
    items = build_scenario_items(template, company_id)
    payload = scenario_payload(items)
    url = (
        f"{base}/api/run?company_id={urllib.parse.quote(company_id)}"
        f"&scenario={urllib.parse.quote(json.dumps(payload, ensure_ascii=False))}"
    )
    step_outputs: dict[str, str] = {}
    step_statuses: dict[str, str] = {}
    latest_report, latest_validation = "", ""
    completed = False
    # step 이벤트는 순차 실행이므로 label 매칭(중복 label은 앞에서부터 소비)으로 item에 대응
    pending = list(items)

    print(f"  [run] {company_id} 템플릿={template.get('id')} 단계={len(items)}")
    request = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
    with urllib.request.urlopen(request, timeout=1800) as response:
        for event, data in iter_sse_events(response):
            if event == "step":
                status = data.get("status")
                label = data.get("label")
                match = next((it for it in pending if it.get("label") == label), None)
                if match is None and pending:
                    match = pending[0]
                if match is None:
                    continue
                if status == "done":
                    pending.remove(match)
                    step_statuses[match["id"]] = "완료"
                    step_outputs[match["id"]] = data.get("output") or "결과 없음"
                    if data.get("result_key") == "final_report":
                        latest_report = data.get("output") or ""
                    if data.get("result_key") == "validation_result":
                        latest_validation = data.get("output") or ""
                    print(f"    done  {label} ({len(str(data.get('output') or ''))}자)")
                elif status == "error":
                    print(f"    ERROR {label}: {str(data.get('error') or '')[:200]}")
                    return None
            elif event == "workflow":
                if data.get("status") == "completed":
                    # 서버가 keep-alive로 연결을 유지하므로 완료 이벤트에서 즉시 종료
                    completed = True
                    break
                elif data.get("status") == "failed":
                    print("    ERROR workflow failed")
                    return None
    if not completed:
        print("    ERROR 스트림이 완료 전에 종료되었습니다")
        return None
    return {
        "companyId": company_id,
        "savedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "prepared": True,
        "templateId": template.get("id"),
        "templateName": template.get("name"),
        "scenarioSignature": scenario_signature(items),
        "scenarioItems": items,
        "stepOutputs": step_outputs,
        "stepStatuses": step_statuses,
        "latestReport": latest_report or "보고서가 아직 생성되지 않았습니다.",
        "latestValidation": latest_validation or "검증 결과가 아직 없습니다.",
        "partial": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="사전 준비 분석 결과 생성")
    parser.add_argument("--base", default="http://127.0.0.1:8001", help="대상 서버 (기본: 8001 프리뷰)")
    parser.add_argument("--companies", default="", help="쉼표 구분 company_id 목록")
    parser.add_argument("--all", action="store_true", help="전체 기업 대상")
    parser.add_argument("--force", action="store_true", help="기존 저장분도 재생성")
    parser.add_argument("--template", default="", help="템플릿 id 강제 지정(자동 매핑 생략)")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    if args.all:
        companies = [c["company_id"] for c in get_json(base, "/api/companies").get("companies", []) if c.get("company_id")]
    else:
        companies = [c.strip() for c in args.companies.split(",") if c.strip()]
    if not companies:
        parser.error("--companies 또는 --all 을 지정하세요")

    store = {"version": 1, "archives": {}}
    if OUT_PATH.exists():
        try:
            existing = json.loads(OUT_PATH.read_text(encoding="utf-8-sig"))
            if isinstance(existing, dict) and isinstance(existing.get("archives"), dict):
                store = existing
        except json.JSONDecodeError:
            print(f"[warn] 기존 {OUT_PATH.name} 파싱 실패 — 새로 생성합니다")

    done, skipped, failed = 0, 0, []
    for company_id in companies:
        if not args.force and company_id in store["archives"]:
            skipped += 1
            continue
        template_id = args.template or pick_template_id(base, company_id)
        template = load_template(template_id)
        try:
            archive = run_company(base, company_id, template)
        except Exception as exc:
            print(f"  [fail] {company_id}: {exc}")
            failed.append(company_id)
            continue
        if archive is None:
            failed.append(company_id)
            continue
        store["archives"][company_id] = archive
        done += 1
        # 기업 1건 완료마다 저장 (장시간 실행 대비)
        OUT_PATH.write_text(json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n완료 {done} / 건너뜀 {skipped} / 실패 {len(failed)}{(' → ' + ', '.join(failed)) if failed else ''}")
    print(f"저장: {OUT_PATH} ({OUT_PATH.stat().st_size if OUT_PATH.exists() else 0:,} bytes, 총 {len(store['archives'])}개 기업)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
