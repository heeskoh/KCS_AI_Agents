# -*- coding: utf-8 -*-
"""관세범죄 지식 레지스트리 xlsx → JSON 변환 (멱등).

data/관세범죄_지식레지스트리.xlsx (시스템 적재용 마스터, v0.1)를 파싱해
data/crime_knowledge_registry.json 을 생성한다. 웹서버 /api/crime-registry 가
이 JSON을 그대로 서빙하고, 프론트 knowledge-registry.js 가 입증 체인
(C 죄명 → F 요증사실 → E 증거 → A 수집행위 + G 게이트) 가이드를 만든다.

사용법: python data/scripts/build_crime_registry.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "관세범죄_지식레지스트리.xlsx"
OUT = ROOT / "data" / "crime_knowledge_registry.json"


def _rows(ws, skip: int = 1) -> list[list]:
    out = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i < skip:
            continue
        cells = ["" if c is None else str(c).strip() for c in row]
        if any(cells):
            out.append(cells)
    return out


def _get(cells: list, i: int) -> str:
    return cells[i] if i < len(cells) else ""


def build() -> dict:
    wb = openpyxl.load_workbook(SRC, data_only=True)

    crimes = [
        {
            "code": _get(r, 0), "category": _get(r, 1), "name": _get(r, 2),
            "law": _get(r, 3), "article": _get(r, 4), "conduct": _get(r, 5),
            "aggravation": _get(r, 6), "precedent": _get(r, 7),
            "prosecution": _get(r, 8), "forfeiture": _get(r, 9),
            "factStatus": _get(r, 10),
        }
        for r in _rows(wb["01_C_죄명"]) if _get(r, 0).startswith("C-")
    ]

    facts = [
        {
            "code": _get(r, 0), "crime": _get(r, 1), "layer": _get(r, 2),
            "text": _get(r, 3), "difficulty": _get(r, 4), "note": _get(r, 5),
        }
        for r in _rows(wb["02_F_요증사실"]) if _get(r, 0).startswith("F-")
    ]

    evidence = [
        {
            "code": _get(r, 0), "category": _get(r, 1), "name": _get(r, 2),
            "holder": _get(r, 3), "volatility": _get(r, 4), "gate": _get(r, 5),
            "note": _get(r, 6),
        }
        for r in _rows(wb["03_E_증거항목"]) if _get(r, 0).startswith("E-")
    ]

    actions = [
        {
            "code": _get(r, 0), "name": _get(r, 1), "law": _get(r, 2),
            "gate": _get(r, 3), "output": _get(r, 4), "duration": _get(r, 5),
            "note": _get(r, 6),
        }
        for r in _rows(wb["04_A_수집행위"]) if _get(r, 0).startswith("A-")
    ]

    fea_map = [
        {
            "id": _get(r, 0), "fact": _get(r, 1), "evidence": _get(r, 2),
            "required": _get(r, 3), "action": _get(r, 4), "gate": _get(r, 5),
            "note": _get(r, 6),
        }
        for r in _rows(wb["05_MAP_F-E-A"]) if _get(r, 0).startswith("MAP-")
    ]

    patterns = [
        {
            "code": _get(r, 0), "method": _get(r, 1), "methodName": _get(r, 2),
            "crime": _get(r, 3), "structure": _get(r, 4), "subStructure": _get(r, 5),
            "anchor": _get(r, 6), "condition": _get(r, 7), "rebuttal": _get(r, 8),
            "axes": _get(r, 9), "gate": _get(r, 10), "execType": _get(r, 11),
            "windowType": _get(r, 12), "windowValue": _get(r, 13), "status": _get(r, 14),
        }
        for r in _rows(wb["06_P_패턴"]) if _get(r, 0).startswith("P-")
    ]

    tags = [
        {"axis": _get(r, 0), "value": _get(r, 1), "desc": _get(r, 2), "target": _get(r, 3)}
        for r in _rows(wb["07_TAG_태그체계"]) if _get(r, 0).startswith("#")
    ]

    gates = [
        {
            "gate": _get(r, 0), "type": _get(r, 1), "basis": _get(r, 2),
            "nature": _get(r, 3), "auto": _get(r, 4), "approval": _get(r, 5),
        }
        for r in _rows(wb["08_G_게이트"]) if _get(r, 0).startswith("G")
    ]

    rules = [
        {"id": _get(r, 0), "group": _get(r, 1), "name": _get(r, 2),
         "text": _get(r, 3), "enforcement": _get(r, 4)}
        for r in _rows(wb["09_R_규칙"]) if _get(r, 0).startswith("R")
    ]

    return {
        "meta": {
            "title": "관세범죄 지식 레지스트리",
            "version": "v0.1",
            "source": SRC.name,
            "chains": {
                "detection": "M 수법 → P 패턴 → 피처 → 적중",
                "proof": "C 죄명 → F 요증사실 → E 증거 → A 수집행위(+G 게이트)",
            },
        },
        "crimes": crimes, "facts": facts, "evidence": evidence, "actions": actions,
        "map": fea_map, "patterns": patterns, "tags": tags, "gates": gates, "rules": rules,
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    data = build()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {k: len(v) for k, v in data.items() if isinstance(v, list)}
    print(f"생성: {OUT}")
    print(" ", counts)
    # 정합성: MAP 외래키 검증
    fcodes = {f["code"] for f in data["facts"]}
    ecodes = {e["code"] for e in data["evidence"]}
    acodes = {a["code"] for a in data["actions"]}
    bad = [m["id"] for m in data["map"]
           if m["fact"] not in fcodes or m["evidence"] not in ecodes or (m["action"] and m["action"] not in acodes)]
    print("  MAP 외래키 위반:", bad or "없음")


if __name__ == "__main__":
    main()
