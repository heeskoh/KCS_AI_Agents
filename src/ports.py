"""수입신고서 기준 출발항·도착항 매핑 단일 기준(single source of truth).

import_declarations / export_declaration 의 국가 코드(ISO alpha-3)를 대표 항만으로
변환한다. 수입은 도착지가 한국, 수출은 출발지가 한국이라는 전제로 경로를 구성한다.

  수입(import):  [출발지국가] → 출발항(해외) → 도착항(한국)
  수출(export):  출발항(한국) → 도착항(해외) ← [도착지국가]

운송수단(transport_type)이 '40 항공'이면 공항, 그 외(해상/'10 …')는 항만으로 매핑한다.
항만 표기는 기존 데이터와 동일하게 "이름(코드)" 형식(예: 부산항(KRPUS))을 사용한다.
"""

from __future__ import annotations

from src.countries import country_code, country_name

# 한국 관문 (운송수단별) — (이름, 코드)
KR_SEA_PORT = ("부산항", "KRPUS")
KR_AIR_PORT = ("인천공항", "KRINC")

# 국가코드(alpha-3) → {"sea": (이름,코드), "air": (이름,코드)} 대표 항만
_FOREIGN_PORTS: dict[str, dict[str, tuple[str, str]]] = {
    "CHN": {"sea": ("상하이항", "CNSHA"), "air": ("상하이푸둥공항", "CNPVG")},
    "VNM": {"sea": ("호치민항", "VNSGN"), "air": ("호치민공항", "VNSGN")},
    "IDN": {"sea": ("탄중프리옥항", "IDTPP"), "air": ("자카르타공항", "IDCGK")},
    "USA": {"sea": ("로스앤젤레스항", "USLAX"), "air": ("로스앤젤레스공항", "USLAX")},
    "JPN": {"sea": ("도쿄항", "JPTYO"), "air": ("나리타공항", "JPNRT")},
    "DEU": {"sea": ("함부르크항", "DEHAM"), "air": ("프랑크푸르트공항", "DEFRA")},
    "TWN": {"sea": ("가오슝항", "TWKHH"), "air": ("타오위안공항", "TWTPE")},
    "SAU": {"sea": ("제다항", "SAJED"), "air": ("제다공항", "SAJED")},
    "ARE": {"sea": ("제벨알리항", "AEJEA"), "air": ("두바이공항", "AEDXB")},
    "MYS": {"sea": ("클랑항", "MYPKG"), "air": ("쿠알라룸푸르공항", "MYKUL")},
    "THA": {"sea": ("램차방항", "THLCH"), "air": ("수완나품공항", "THBKK")},
    "IND": {"sea": ("나바셰바항", "INNSA"), "air": ("뭄바이공항", "INBOM")},
    "SGP": {"sea": ("싱가포르항", "SGSIN"), "air": ("창이공항", "SGSIN")},
    "HKG": {"sea": ("홍콩항", "HKHKG"), "air": ("홍콩공항", "HKHKG")},
    "NLD": {"sea": ("로테르담항", "NLRTM"), "air": ("암스테르담공항", "NLAMS")},
    "ITA": {"sea": ("제노바항", "ITGOA"), "air": ("밀라노공항", "ITMXP")},
    "FRA": {"sea": ("르아브르항", "FRLEH"), "air": ("파리샤를드골공항", "FRCDG")},
    "GBR": {"sea": ("펠릭스토항", "GBFXT"), "air": ("런던히스로공항", "GBLHR")},
    "MEX": {"sea": ("만사니요항", "MXZLO"), "air": ("멕시코시티공항", "MXMEX")},
    "BRA": {"sea": ("산투스항", "BRSSZ"), "air": ("상파울루공항", "BRGRU")},
    "AUS": {"sea": ("시드니항", "AUSYD"), "air": ("시드니공항", "AUSYD")},
    "CAN": {"sea": ("밴쿠버항", "CAVAN"), "air": ("밴쿠버공항", "CAYVR")},
    "TUR": {"sea": ("이스탄불항", "TRIST"), "air": ("이스탄불공항", "TRIST")},
    "CHE": {"sea": ("바젤항", "CHBSL"), "air": ("취리히공항", "CHZRH")},
    "PHL": {"sea": ("마닐라항", "PHMNL"), "air": ("마닐라공항", "PHMNL")},
    "BGD": {"sea": ("치타공항만", "BDCGP"), "air": ("다카공항", "BDDAC")},
    "KHM": {"sea": ("시아누크빌항", "KHKOS"), "air": ("프놈펜공항", "KHPNH")},
    "CHL": {"sea": ("발파라이소항", "CLVAP"), "air": ("산티아고공항", "CLSCL")},
    "PER": {"sea": ("카야오항", "PECLL"), "air": ("리마공항", "PELIM")},
}


def is_air(transport_type: str | None) -> bool:
    """운송수단 문자열이 항공이면 True. ('40 항공', '항공' 등)"""
    t = (transport_type or "").strip()
    return "항공" in t or t.startswith("40")


def transport_mode(transport_type: str | None, seed: int = 0) -> str:
    """운송수단 미지정 시 결정적으로 부여(대부분 해상, 5건 중 1건 항공)."""
    if transport_type:
        return transport_type
    return "40 항공" if seed % 5 == 0 else "10 해상 FCL"


def _port_label(name: str, code: str) -> str:
    return f"{name}({code})"


def foreign_port(country: str | None, transport_type: str | None) -> dict[str, str]:
    """해외 국가 → 대표 항만(운송수단 반영). {name, code, label, mode} 반환."""
    code = country_code(country)
    mode = "air" if is_air(transport_type) else "sea"
    entry = _FOREIGN_PORTS.get(code)
    if entry:
        name, pcode = entry[mode]
    else:
        nm = country_name(code, default=country or code)
        suffix = "공항" if mode == "air" else "항"
        name = f"{nm} 주요{suffix}"
        pcode = f"{code}{'A' if mode == 'air' else 'S'}"
    return {"name": name, "code": pcode, "label": _port_label(name, pcode), "mode": mode}


def korea_port(transport_type: str | None) -> dict[str, str]:
    """한국 관문 항만(운송수단 반영). {name, code, label, mode} 반환."""
    name, pcode = KR_AIR_PORT if is_air(transport_type) else KR_SEA_PORT
    mode = "air" if is_air(transport_type) else "sea"
    return {"name": name, "code": pcode, "label": _port_label(name, pcode), "mode": mode}


def import_route(departure_country: str | None, transport_type: str | None) -> dict[str, str]:
    """수입 경로: 출발항(해외) + 도착항(한국)."""
    return {
        "departure_port": foreign_port(departure_country, transport_type)["label"],
        "arrival_port": korea_port(transport_type)["label"],
    }


def export_route(dest_country: str | None, transport_type: str | None) -> dict[str, str]:
    """수출 경로: 출발항(한국) + 도착항(해외)."""
    return {
        "departure_port": korea_port(transport_type)["label"],
        "arrival_port": foreign_port(dest_country, transport_type)["label"],
    }
