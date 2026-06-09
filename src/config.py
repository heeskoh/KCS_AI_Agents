"""설정 로더 — config/thresholds.yaml의 임계값을 로드하여 데이터클래스로 노출한다.

사용법
------
    from src.config import CFG

    if risk_score >= CFG.risk.high_score:
        level = "HIGH"

YAML 파일이 없거나 파싱 실패 시 기본값(하드코딩 기준)으로 폴백하므로
서비스는 항상 정상 동작한다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_CONFIG_PATH = Path(__file__).parent.parent / "config" / "thresholds.yaml"


# ── 섹션별 데이터클래스 ────────────────────────────────────────────────────────

@dataclass
class RiskCFG:
    high_score:   float = 70.0
    medium_score: float = 45.0


@dataclass
class MLCFG:
    min_peer_companies:    int   = 3
    min_decl_per_hs:       int   = 5

    industry_zscore_high:   float = 1.5
    industry_zscore_medium: float = 0.5

    hs_review_rate_high:   float = 0.30
    hs_diff_pct_high:      float = -25.0
    hs_diff_pct_medium:    float = -10.0
    hs_zscore_high:        float = 2.0
    hs_zscore_medium:      float = 1.5

    anomaly_high:      float = 2.5
    anomaly_medium:    float = 1.5
    anomaly_price_pct: float = 20.0

    iqr_low_bound:  float = 0.7
    iqr_high_bound: float = 1.3


@dataclass
class SyntheticCFG:
    risk_std:   float = 18.0
    risk_min:   float = 10.0
    risk_max:   float = 95.0

    revenue_factor_min: float = 0.25
    revenue_factor_max: float = 3.0
    import_factor_min:  float = 0.25
    import_factor_max:  float = 3.0

    price_normal_mean: float = 1.0
    price_normal_std:  float = 0.18
    price_under_mean:  float = 0.55
    price_under_std:   float = 0.08
    anomaly_rate:      float = 0.05
    price_min:         float = 0.35
    price_max:         float = 1.60

    days_ago_max:     int   = 548
    duty_rate_min:    float = 0.03
    duty_rate_max:    float = 0.12
    refund_rate_min:  float = 0.005
    refund_rate_max:  float = 0.05
    fta_rate_min:     float = 5.0
    fta_rate_max:     float = 55.0


@dataclass
class NetworkCFG:
    related_high_score:   float = 70.0
    related_medium_score: float = 45.0

    origin_concentration: float = 0.70
    fta_reduction_rate:   float = 30.0
    review_rate:          float = 0.30
    combined_risk_score:  float = 70.0
    edge_review_rate:     float = 0.30


@dataclass
class HSVerifyCFG:
    price_low_ratio:  float = 0.40
    price_high_ratio: float = 2.00


@dataclass
class DeclarationCFG:
    price_mismatch_threshold: float = 0.15
    peer_undervalue_high:     float = -0.20
    peer_undervalue_warning:  float = -0.10


@dataclass
class CustomsValueCFG:
    q1_lower_bound: float = 0.80
    avg_lower_bound: float = 0.90
    q3_upper_bound: float = 1.20


@dataclass
class RAGCFG:
    top_k:        int = 3
    fallback_k:   int = 2
    audit_top_k:  int = 5
    audit_max_k:  int = 10


@dataclass
class APICFG:
    law_timeout:     float = 8.0
    kipris_timeout:  float = 8.0
    web_timeout:     float = 20.0
    web_max_results: int   = 2


@dataclass
class AppConfig:
    risk:          RiskCFG        = field(default_factory=RiskCFG)
    ml:            MLCFG          = field(default_factory=MLCFG)
    synthetic:     SyntheticCFG   = field(default_factory=SyntheticCFG)
    network:       NetworkCFG     = field(default_factory=NetworkCFG)
    hs_verify:     HSVerifyCFG    = field(default_factory=HSVerifyCFG)
    declaration:   DeclarationCFG = field(default_factory=DeclarationCFG)
    customs_value: CustomsValueCFG= field(default_factory=CustomsValueCFG)
    rag:           RAGCFG         = field(default_factory=RAGCFG)
    api:           APICFG         = field(default_factory=APICFG)


# ── 로더 ────────────────────────────────────────────────────────────────────────

def _apply(dataclass_instance: Any, mapping: dict) -> None:
    """YAML 섹션 dict의 값을 데이터클래스 인스턴스에 적용한다 (타입 변환 포함)."""
    if not isinstance(mapping, dict):
        return
    for key, val in mapping.items():
        if not hasattr(dataclass_instance, key):
            continue
        current = getattr(dataclass_instance, key)
        try:
            # 기존 타입으로 강제 변환 (int 필드에 float 값이 들어와도 안전하게 처리)
            if isinstance(current, int):
                setattr(dataclass_instance, key, int(val))
            elif isinstance(current, float):
                setattr(dataclass_instance, key, float(val))
            else:
                setattr(dataclass_instance, key, val)
        except (ValueError, TypeError):
            pass  # 변환 실패 시 기본값 유지


def _load_yaml(path: Path) -> dict:
    try:
        import yaml
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        print(f"[Config] {path} 없음 — 기본값 사용")
        return {}
    except Exception as exc:
        print(f"[Config] YAML 로드 실패: {exc} — 기본값 사용")
        return {}


def load_config(path: Path = _CONFIG_PATH) -> AppConfig:
    """thresholds.yaml을 읽어 AppConfig를 반환한다. 실패 시 기본값 반환."""
    raw = _load_yaml(path)
    cfg = AppConfig()

    _apply(cfg.risk,          raw.get("risk", {}))
    _apply(cfg.ml,            raw.get("ml", {}))
    _apply(cfg.synthetic,     raw.get("synthetic", {}))
    _apply(cfg.network,       raw.get("network", {}))
    _apply(cfg.hs_verify,     raw.get("hs_verify", {}))
    _apply(cfg.declaration,   raw.get("declaration", {}))
    _apply(cfg.customs_value, raw.get("customs_value", {}))
    _apply(cfg.rag,           raw.get("rag", {}))
    _apply(cfg.api,           raw.get("api", {}))

    return cfg


# ── 싱글턴 ──────────────────────────────────────────────────────────────────────
# 모듈 임포트 시 한 번만 로드. 런타임에 재로드하려면 reload_config() 호출.

CFG: AppConfig = load_config()


def reload_config() -> AppConfig:
    """설정 파일을 다시 읽어 CFG를 갱신한다 (서버 재시작 없이 반영 가능)."""
    global CFG
    CFG = load_config()
    print(f"[Config] 재로드 완료: {_CONFIG_PATH}")
    return CFG
