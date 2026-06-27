"""국가 코드 ↔ 한글 국가명 정규화 단일 기준(single source of truth).

DuckDB(import_declarations.origin_country)와 Neo4j(Country 노드)는 ISO 3166-1
alpha-3 코드를 정식 식별자로 사용하고, 한글명은 이 모듈을 통해 부여한다.
시드/적재 스크립트와 런타임 에이전트 모두 동일한 매핑을 참조하도록 한다.
"""

from __future__ import annotations

# ISO 3166-1 alpha-3 코드 → 한글 국가명 (정식 기준)
COUNTRY_NAMES: dict[str, str] = {
    "TWN": "대만",        "CHN": "중국",          "JPN": "일본",        "KOR": "한국",
    "SAU": "사우디아라비아", "ARE": "아랍에미리트",   "MYS": "말레이시아",   "THA": "태국",
    "VNM": "베트남",      "BGD": "방글라데시",     "KHM": "캄보디아",    "IDN": "인도네시아",
    "CHE": "스위스",      "DEU": "독일",          "USA": "미국",        "GBR": "영국",
    "AUS": "호주",        "CHL": "칠레",          "PER": "페루",        "SGP": "싱가포르",
    "HKG": "홍콩",        "MEX": "멕시코",         "IND": "인도",        "BRA": "브라질",
    "TUR": "터키",        "FRA": "프랑스",         "NLD": "네덜란드",    "PHL": "필리핀",
    "ITA": "이탈리아",    "CAN": "캐나다",
}

# 한글명/별칭 → 코드 역매핑. 표기 흔들림(별칭)을 흡수한다.
_NAME_ALIASES: dict[str, str] = {
    "대한민국": "KOR",
    "UAE": "ARE", "아랍 에미리트": "ARE", "에미리트": "ARE",
    "타이": "THA", "비엣남": "VNM",
    "튀르키예": "TUR", "터키예": "TUR",
    # 과거 name[:3] 절단 버그로 생긴 손상 표기 보정
    "인도네": "IDN", "이탈리": "ITA", "튀르키": "TUR",
}


def _build_name_to_code() -> dict[str, str]:
    mapping = {name: code for code, name in COUNTRY_NAMES.items()}
    mapping.update(_NAME_ALIASES)
    return mapping


# 한글명/별칭 → 코드
NAME_TO_CODE: dict[str, str] = _build_name_to_code()


# ISO 3166-1 alpha-3 → alpha-2 (수입신고서 원산지/적출국가 코드는 alpha-2 체계)
ALPHA3_TO_ALPHA2: dict[str, str] = {
    "TWN": "TW", "CHN": "CN", "JPN": "JP", "KOR": "KR", "SAU": "SA", "ARE": "AE",
    "MYS": "MY", "THA": "TH", "VNM": "VN", "BGD": "BD", "KHM": "KH", "IDN": "ID",
    "CHE": "CH", "DEU": "DE", "USA": "US", "GBR": "GB", "AUS": "AU", "CHL": "CL",
    "PER": "PE", "SGP": "SG", "HKG": "HK", "MEX": "MX", "IND": "IN", "BRA": "BR",
    "TUR": "TR", "FRA": "FR", "NLD": "NL", "PHL": "PH", "ITA": "IT", "CAN": "CA",
}

# COUNTRY_NAMES(alpha-3)에 없는 데이터 표기(코드성 별칭) → alpha-2
_EXTRA_ALPHA2: dict[str, str] = {
    "BVI": "VG", "파나마": "PA", "PANAMA": "PA",
}


def country_alpha2(name_or_code: str | None, default: str = "UN") -> str:
    """한글명/별칭/코드 → ISO 3166-1 alpha-2 코드(수입신고서 원산지·적출국가 코드).

    이미 alpha-2면 그대로, 한글명/alpha-3은 변환, 미해석 시 default('UN')."""
    if not name_or_code:
        return default
    text = str(name_or_code).strip()
    if text in _EXTRA_ALPHA2:
        return _EXTRA_ALPHA2[text]
    if text.upper() in _EXTRA_ALPHA2:
        return _EXTRA_ALPHA2[text.upper()]
    a3 = country_code(text)                       # 한글명/코드 → alpha-3
    if a3 in ALPHA3_TO_ALPHA2:
        return ALPHA3_TO_ALPHA2[a3]
    if len(text) == 2 and text.isalpha():         # 이미 alpha-2
        return text.upper()
    return default


def country_name(code: str | None, default: str | None = None) -> str:
    """국가 코드 → 한글명. 미등록 코드면 default(없으면 원본 코드)를 반환한다."""
    if not code:
        return default or ""
    key = code.strip().upper()
    return COUNTRY_NAMES.get(key, default if default is not None else code)


def country_code(name_or_code: str | None) -> str:
    """한글명/별칭/코드 → ISO alpha-3 코드. 해석 불가 시 원본(대문자 3자)을 반환한다."""
    if not name_or_code:
        return "UNK"
    text = name_or_code.strip()
    upper = text.upper()
    if upper in COUNTRY_NAMES:          # 이미 코드
        return upper
    if text in NAME_TO_CODE:            # 한글명/별칭
        return NAME_TO_CODE[text]
    if upper in NAME_TO_CODE:           # 영문 별칭(UAE 등)
        return NAME_TO_CODE[upper]
    return upper[:3]
