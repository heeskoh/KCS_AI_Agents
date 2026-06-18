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
        if not url or not (url.startswith("http://") or url.startswith("https://")):
            continue
        key = (url, query)
        if key in seen:
            continue
        seen.add(key)
        targets.append({"url": url, "query": query})
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


def agent_web(state: CustomsState) -> CustomsState:
    """Analyze web news as a company outlook analyst."""
    print("[Agent] 웹 검색 시작")

    scenario = state.get("scenario") or {}
    direct_targets = _scenario_web_targets(scenario)

    if not has_company_scope(state) and not direct_targets:
        return {**state, "web_result": no_company_result("웹검색 Agent", "기업 기반 웹검색은 조회 대상 기업이 필요합니다.")}

    context = (
        _company_context(state["company_id"])
        if has_company_scope(state)
        else {
            "target_name": state.get("target_name") or state.get("person_id") or "대상 미지정",
            "target_type": state.get("target_type") or "person",
            "recent_imports": [],
        }
    )
    if has_company_scope(state) and not context.get("business_registration_no") and context.get("company_name") == context.get("company_id") and not direct_targets:
        return {**state, "web_result": "[웹검색 Agent 결과]\n- 조회 대상 기업 프로파일이 DuckDB에 없습니다.\n- 연관정보 없음: 기업명 없는 웹검색을 수행하지 않습니다."}
    queries = _build_queries(context) if has_company_scope(state) and context.get("business_registration_no") else []

    collected: list[dict[str, str]] = []
    for topic, query in queries:
        collected.extend(_search_topic(query, topic))
    for target in direct_targets:
        collected.append(_fetch_direct_url(target))

    raw_results = _format_results(_dedupe_results(collected))

    if raw_results == "검색 결과 없음":
        web_result = "외부 정보 참고: 검색 결과가 없거나 검색 API가 설정되지 않았습니다."
    elif llm is None:
        web_result = f"외부 정보 참고 후보:\n{raw_results}"
    else:
        summary = llm.invoke(
            """
당신은 기업 전망 분석가입니다.
아래 웹 기사 후보와 직접 등록 URL 발췌문을 검토하여 회사 운영, 가격, 운송비, 공급망, 수입관세 평가와 연결 가능한 정보만 추출하세요.

검색 목적:
1. 선택 회사와 관련된 기사
2. 최근 수입 상대방 및 수입 물품 관련 기사, 3개 미만
3. 선택 회사와 같은 업종 관련 기사, 3개 미만
4. 수입 물품 관련 기사, 3개 미만
5. [URL 직접 등록] 항목은 사용자가 지정한 URL에서 찾은 발췌문이므로, 검색 내용과의 관련성을 우선 판단

출력 형식:
- 외부 정보 참고
- 기사 또는 URL별 제목, 분류, URL, 관련 가격/운송비/공급망 시사점, 조사 참고 필요성을 간결하게 작성
- 관련성이 낮은 기사는 제외
- 실제 상대방 또는 회사명이 없으면 관계법인, 원산지, 수입품 기준으로 검색했다는 점을 명시

[회사/수입 컨텍스트]
{context}

[웹 기사 후보]
{raw_results}
            """.format(
                context=context,
                raw_results=raw_results,
            )
        )
        web_result = summary.content

    print("[Agent] 웹 검색 완료")
    return {**state, "web_result": web_result}
