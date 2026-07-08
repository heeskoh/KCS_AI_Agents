import os
import re
from typing import Any
from html import unescape

import duckdb

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

from src.agents.state import CustomsState
from src.agents.scope import has_company_scope, no_company_result
from src.config import CFG
from src.llm import llm
from src.paths import DB_PATH

MAX_RESULTS_PER_TOPIC = CFG.api.web_max_results

INDUSTRY_LABELS = {
    "C13": "섬유제품 제조업",
    "C20": "화학물질 및 화학제품 제조업",
    "C21": "의약품 제조업",
    "C26": "전자부품 제조업",
    "C30": "자동차 및 트레일러 제조업",
    "G46": "도매 및 상품중개업",
    "G47": "소매업",
}


def _clean_text(value: str | None) -> str:
    return " ".join((value or "").split())


def _normalize_web_targets(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    targets: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        url = _clean_text(str(item.get("url") or item.get("href") or ""))
        query = _clean_text(str(item.get("query") or item.get("keyword") or item.get("search_text") or ""))
        # 로그인 필요 사이트용 선택 자격증명(데모: 평문 전달, 결과 본문에는 마스킹만 노출)
        login_id = _clean_text(str(item.get("login_id") or item.get("loginId") or ""))
        login_pw = str(item.get("login_pw") or item.get("loginPw") or "")
        if not url or not (url.startswith("http://") or url.startswith("https://")):
            continue
        key = (url, query)
        if key in seen:
            continue
        seen.add(key)
        targets.append({"url": url, "query": query, "login_id": login_id, "login_pw": login_pw})
    return targets


def _scenario_web_targets(scenario: dict[str, Any]) -> list[dict[str, str]]:
    targets = _normalize_web_targets(scenario.get("web_targets"))
    for item in scenario.get("scenario_items") or []:
        if isinstance(item, dict):
            targets.extend(_normalize_web_targets(item.get("web_targets") or item.get("webTargets")))
    return _normalize_web_targets(targets)


def _html_to_text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    return _clean_text(unescape(html))


def _keyword_excerpt(text: str, query: str, limit: int = 1400) -> str:
    if not text:
        return ""
    words = [word for word in re.split(r"[\s,;/|]+", query or "") if len(word) >= 2]
    lowered = text.lower()
    indexes = [lowered.find(word.lower()) for word in words if lowered.find(word.lower()) >= 0]
    start = max(0, min(indexes) - 240) if indexes else 0
    return text[start:start + limit]


def _fetch_direct_url(target: dict[str, str]) -> dict[str, str]:
    url = target.get("url", "")
    query = target.get("query", "")
    if httpx is None:
        return {
            "topic": "URL 직접 등록",
            "title": "URL 확인 불가",
            "url": url,
            "snippet": "httpx 모듈이 없어 등록 URL을 직접 확인하지 못했습니다.",
        }
    try:
        with httpx.Client(timeout=CFG.api.web_timeout, follow_redirects=True) as client:
            response = client.get(url, headers={"User-Agent": "KCS-AI-Agents/1.0"})
            response.raise_for_status()
            title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", response.text)
            title = _clean_text(_html_to_text(title_match.group(1))) if title_match else url
            text = _html_to_text(response.text)
            excerpt = _keyword_excerpt(text, query)
            if query:
                snippet = f"검색 내용: {query}\n본문 발췌: {excerpt or '관련 내용을 찾지 못했습니다.'}"
            else:
                snippet = f"본문 발췌: {excerpt or '본문 텍스트를 추출하지 못했습니다.'}"
            return {
                "topic": "URL 직접 등록",
                "title": title or url,
                "url": url,
                "snippet": snippet,
            }
    except Exception as exc:
        return {
            "topic": "URL 직접 등록",
            "title": "URL 확인 실패",
            "url": url,
            "snippet": f"{query} - {exc}" if query else str(exc),
        }


def _normalize_result(item: dict[str, Any], provider: str, topic: str) -> dict[str, str]:
    if provider == "tavily":
        return {
            "topic": topic,
            "title": _clean_text(item.get("title")),
            "url": _clean_text(item.get("url")),
            "snippet": _clean_text(item.get("content")),
        }

    return {
        "topic": topic,
        "title": _clean_text(item.get("title")),
        "url": _clean_text(item.get("link")),
        "snippet": _clean_text(item.get("snippet")),
    }


def _search_tavily(query: str, topic: str) -> list[dict[str, str]]:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key or httpx is None:
        return []

    with httpx.Client(timeout=CFG.api.web_timeout) as client:
        response = client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": MAX_RESULTS_PER_TOPIC,
                "include_answer": False,
            },
        )
        response.raise_for_status()
        return [
            _normalize_result(item, "tavily", topic)
            for item in response.json().get("results", [])
        ]


def _search_serpapi(query: str, topic: str) -> list[dict[str, str]]:
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key or httpx is None:
        return []

    with httpx.Client(timeout=CFG.api.web_timeout) as client:
        response = client.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google",
                "q": query,
                "api_key": api_key,
                "num": MAX_RESULTS_PER_TOPIC,
                "hl": "ko",
                "gl": "kr",
            },
        )
        response.raise_for_status()
        return [
            _normalize_result(item, "serpapi", topic)
            for item in response.json().get("organic_results", [])[:MAX_RESULTS_PER_TOPIC]
        ]


def _search_topic(query: str, topic: str) -> list[dict[str, str]]:
    try:
        tavily_results = _search_tavily(query, topic)
        if tavily_results:
            return tavily_results[:MAX_RESULTS_PER_TOPIC]

        serp_results = _search_serpapi(query, topic)
        return serp_results[:MAX_RESULTS_PER_TOPIC]
    except Exception as exc:
        return [
            {
                "topic": topic,
                "title": "검색 실패",
                "url": "",
                "snippet": str(exc),
            }
        ]


def _dedupe_results(results: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    deduped: list[dict[str, str]] = []

    for item in results:
        key = item.get("url") or f"{item.get('topic')}:{item.get('title')}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def _company_context(company_id: str) -> dict[str, Any]:
    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        company = conn.execute(
            """
            SELECT
                company_id,
                company_name,
                business_registration_no,
                industry_code,
                founded_year,
                risk_level,
                risk_score,
                major_export_countries,
                customs_broker_firm,
                related_companies,
                annual_import_amount,
                declared_duty_amount,
                recent_customs_refund,
                fta_reduction_rate
            FROM company_profiles
            WHERE company_id = ?
            """,
            [company_id],
        ).df()

        imports = conn.execute(
            """
            SELECT declaration_no, hs_code, item_name, origin_country, import_date
            FROM import_declarations
            WHERE company_id = ?
            ORDER BY import_date DESC
            LIMIT 3
            """,
            [company_id],
        ).df()

    company_record = company.to_dict("records")[0] if not company.empty else {}
    import_records = imports.to_dict("records") if not imports.empty else []
    industry_code = company_record.get("industry_code", "")

    return {
        "company_id": company_id,
        "company_name": company_record.get("company_name", company_id),
        "business_registration_no": company_record.get("business_registration_no", ""),
        "industry_code": industry_code,
        "industry_name": INDUSTRY_LABELS.get(industry_code, str(industry_code)),
        "founded_year": company_record.get("founded_year", ""),
        "risk_level": company_record.get("risk_level", ""),
        "risk_score": company_record.get("risk_score", ""),
        "major_export_countries": company_record.get("major_export_countries", ""),
        "customs_broker_firm": company_record.get("customs_broker_firm", ""),
        "related_companies": company_record.get("related_companies", ""),
        "annual_import_amount": company_record.get("annual_import_amount", ""),
        "declared_duty_amount": company_record.get("declared_duty_amount", ""),
        "recent_customs_refund": company_record.get("recent_customs_refund", ""),
        "fta_reduction_rate": company_record.get("fta_reduction_rate", ""),
        "recent_imports": import_records,
    }


def _build_queries(context: dict[str, Any]) -> list[tuple[str, str]]:
    company_name = context["company_name"]
    industry_name = context["industry_name"]
    related_companies = context.get("related_companies") or ""
    recent_imports = context["recent_imports"]
    latest_import = recent_imports[0] if recent_imports else {}
    latest_item = latest_import.get("item_name", "")
    latest_origin = latest_import.get("origin_country", "")
    item_names = ", ".join(
        sorted({row.get("item_name", "") for row in recent_imports if row.get("item_name")})
    )

    counterparty_seed = related_companies or f"{latest_origin} {latest_item}"

    return [
        (
            "선택 회사 관련 기사",
            f'"{company_name}" 기사 수입 물류 운송비 가격 리스크',
        ),
        (
            "최근 수입 상대방 및 품목 기사",
            f"{counterparty_seed} 공급 가격 운임 리스크 기사",
        ),
        (
            "동종 업종 기사",
            f"{industry_name} 업황 가격 운송비 수입 관세 기사",
        ),
        (
            "수입 물품 관련 기사",
            f"{item_names or latest_item} 가격 동향 공급망 운송비 관세 기사",
        ),
    ]


def _format_results(results: list[dict[str, str]]) -> str:
    if not results:
        return "검색 결과 없음"

    lines: list[str] = []
    for item in results:
        lines.append(
            "\n".join(
                [
                    f"[{item['topic']}] {item['title']}",
                    f"URL: {item['url'] or 'N/A'}",
                    f"요약: {item['snippet']}",
                ]
            )
        )
    return "\n\n".join(lines)


def web_search_context(query: str, *, max_results: int = MAX_RESULTS_PER_TOPIC) -> dict[str, Any]:
    """단일 자연어 질의에 대한 웹검색 결과를 LLM 컨텍스트용으로 반환한다.

    TAVILY_API_KEY(우선) → SERPAPI_API_KEY(폴백) 순으로 사용한다. (외부 LLM 모드 전용)
    반환: {available, text, results, reason}
    """
    query = (query or "").strip()
    if not query:
        return {"available": False, "text": "", "results": [], "reason": "빈 질의"}
    if httpx is None:
        return {"available": False, "text": "", "results": [], "reason": "httpx 모듈 없음"}
    if not (os.getenv("TAVILY_API_KEY") or os.getenv("SERPAPI_API_KEY")):
        return {"available": False, "text": "", "results": [],
                "reason": "웹검색 API 키(TAVILY_API_KEY/SERPAPI_API_KEY) 미설정"}
    results = _dedupe_results(_search_topic(query, "웹검색"))[: max(1, max_results)]
    if not results:
        return {"available": False, "text": "", "results": [], "reason": "검색 결과 없음"}
    return {"available": True, "text": _format_results(results), "results": results, "reason": ""}


# 웹 정보수집 요청 — 지원 수집범위(behavior)와 라벨. 그 외 값(오설정)은 무시.
COLLECT_BEHAVIOR_LABELS = {
    "company_news": "기업 관련 기사",
    "supply_chain": "공급망·가격 정보",
    "industry_news": "동종업종 동향",
    "direct_url": "등록 URL 수집",
}


def _collect_behaviors(scenario: dict[str, Any]) -> list[str]:
    raw = scenario.get("current_agent_behaviors") or []
    values = [str(v) for v in raw if str(v) in COLLECT_BEHAVIOR_LABELS]
    return values


def _auto_collect_plan(context: dict[str, Any], behaviors: list[str]) -> list[str]:
    """수집범위(behavior)별 자동 수집계획 라인. 기업 컨텍스트 기반 질의 재사용."""
    queries = dict(
        zip(
            ("company_news", "supply_chain", "industry_news", "supply_chain_items"),
            _build_queries(context),
        )
    ) if context.get("business_registration_no") else {}
    lines: list[str] = []
    for value in behaviors:
        if value == "direct_url":
            continue  # 등록 URL 섹션에서 별도 표시
        label = COLLECT_BEHAVIOR_LABELS[value]
        planned = []
        if value == "company_news" and queries.get("company_news"):
            planned.append(queries["company_news"][1])
        if value == "supply_chain":
            for key in ("supply_chain", "supply_chain_items"):
                if queries.get(key):
                    planned.append(queries[key][1])
        if value == "industry_news" and queries.get("industry_news"):
            planned.append(queries["industry_news"][1])
        detail = " / ".join(planned) if planned else "대상 정보 기반 자동 질의 구성"
        lines.append(f"- {label}: {detail} — 상태: 접수완료 → 수집 대기")
    return lines


def agent_web(state: CustomsState) -> CustomsState:
    """웹 정보수집 요청 접수 — 등록 URL·수집범위에 대한 수집요청을 접수하고
    URL별 진행상태(접수완료→수집 대기)와 예상 일정을 보고서로 반환한다.
    실제 크롤링은 수행하지 않는 모의 접수(시뮬레이션)이며, 기존 실검색 함수
    (_fetch_direct_url/_search_*)는 보존하되 호출하지 않는다."""
    from datetime import datetime, timedelta

    print("[Agent] 웹 정보수집 요청 접수 시작")

    scenario = state.get("scenario") or {}
    direct_targets = _scenario_web_targets(scenario)
    behaviors = _collect_behaviors(scenario)

    if not has_company_scope(state) and not direct_targets:
        return {**state, "web_result": no_company_result("웹 정보수집 요청 Agent", "수집 요청은 조사 대상 또는 수집 URL 등록이 필요합니다.")}

    context = (
        _company_context(state["company_id"])
        if has_company_scope(state)
        else {
            "target_name": state.get("target_name") or state.get("person_id") or "대상 미지정",
            "target_type": state.get("target_type") or "person",
            "recent_imports": [],
        }
    )

    target_id = str(state.get("company_id") or state.get("target_id") or "TARGET").strip() or "TARGET"
    target_label = (
        f"{context.get('company_name', target_id)} ({target_id})"
        if has_company_scope(state)
        else str(context.get("target_name") or target_id)
    )
    now = datetime.now()
    receipt_no = f"WEBREQ-{target_id}-{now.strftime('%Y%m%d')}"
    start_at = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    reply_at = (now + timedelta(days=3)).strftime("%Y-%m-%d")
    behavior_labels = [COLLECT_BEHAVIOR_LABELS[v] for v in behaviors if v != "direct_url"]

    lines: list[str] = [
        "[웹 정보수집 요청 접수 결과]",
        f"- 접수번호: {receipt_no}",
        f"- 요청 대상: {target_label}",
        f"- 등록 URL: {len(direct_targets)}건 · 자동 수집범위: {', '.join(behavior_labels) or '없음'}",
        "- 본 결과는 수집요청 접수 시뮬레이션이며 실제 크롤링을 수행하지 않았습니다.",
    ]

    if direct_targets:
        lines.append("")
        lines.append("[수집 대상 URL 진행상태]")
        for index, target in enumerate(direct_targets, 1):
            login = (
                f"등록됨 (ID: {target.get('login_id')} / PW ***)"
                if target.get("login_id")
                else "미등록 — 공개 페이지 기준 수집"
            )
            lines.extend([
                f"{index}. {target['url']}",
                f"   - 수집 내용: {target.get('query') or '페이지 전반(수집 내용 미지정)'}",
                f"   - 로그인정보: {login}",
                "   - 진행상태: 접수완료 → 수집 대기",
                f"   - 예상 일정: {start_at} 수집 시작 · {reply_at} 결과 회신",
            ])

    auto_plan = _auto_collect_plan(context, behaviors) if has_company_scope(state) else []
    if auto_plan:
        lines.append("")
        lines.append("[자동 수집계획 — 수집범위 기반]")
        lines.extend(auto_plan)
        lines.append(f"- 예상 일정: {start_at} 수집 시작 · {reply_at} 결과 회신")

    lines.extend([
        "",
        "[진행상태 안내]",
        "- 접수완료 → 수집 대기 → 수집 중 → 결과 회신 순으로 진행됩니다.",
        "- 수집이 완료되면 이 단계의 결과가 수집 결과 보고서로 갱신됩니다.",
    ])
    receipt_text = "\n".join(lines)

    # LLM 보강(선택): 수집 우선순위·확인 포인트 제안. PW 원문은 프롬프트에 포함하지 않는다.
    if llm is not None and (direct_targets or auto_plan):
        safe_targets = [
            {"url": t["url"], "query": t.get("query", ""), "login": bool(t.get("login_id"))}
            for t in direct_targets
        ]
        try:
            review = llm.invoke(
                """
당신은 관세청 외부정보 수집 담당자입니다. 아래 수집요청 접수 내역을 검토하여
'수집 우선순위'와 'URL/수집범위별 확인 포인트'를 각각 3줄 이내로 간결히 제안하세요.
실제 수집 결과를 지어내지 말고, 무엇을 확인해야 하는지만 서술하세요.

[요청 대상]
{target}

[등록 URL(로그인정보 유무 포함)]
{targets}

[자동 수집범위]
{behaviors}
                """.format(
                    target=target_label,
                    targets=safe_targets or "없음",
                    behaviors=", ".join(behavior_labels) or "없음",
                )
            )
            if review and getattr(review, "content", ""):
                receipt_text += f"\n\n[AI 수집계획 검토]\n{review.content}"
        except Exception as exc:
            print(f"[Agent] 수집계획 LLM 검토 생략: {exc}")

    print("[Agent] 웹 정보수집 요청 접수 완료")
    return {**state, "web_result": receipt_text}
