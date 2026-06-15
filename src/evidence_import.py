"""통신내역/금융거래내역 xlsx·csv 업로드 → 표준 압수정보 JSON 변환.

data/communication_record_schema.json, data/financial_transaction_schema.json
에 정의된 표준 스키마에 맞춰 행 데이터를 변환하고,
data/evidence/<PERSON_ID>/communication_record.json
data/evidence/<PERSON_ID>/financial_transaction_record.json
에 누적 등록한다(기존 레코드에 이어서 record_id 부여).

관계망(network-graph) 패널에서 즉시 표시할 수 있도록 노드/엣지 목록도 함께 반환한다.
"""
from __future__ import annotations

import io
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

from src.paths import DATA_DIR, DB_PATH

EVIDENCE_DIR = DATA_DIR / "evidence"

COMM_FIELDS = [
    "record_type", "app", "direction", "timestamp", "counterpart_name",
    "counterpart_number_masked", "counterpart_person_id", "duration_sec",
    "message_preview", "note",
]
FIN_FIELDS = [
    "txn_date", "txn_type", "direction", "amount", "counterpart_type",
    "counterpart_person_id", "counterpart_org_id", "counterpart_name",
    "counterpart_account_masked", "counterpart_bank", "note",
]

# 한글 헤더 별칭 -> 표준 필드명
COMM_ALIASES: dict[str, list[str]] = {
    "record_type": ["유형", "기록유형", "구분", "통신유형"],
    "app": ["앱", "어플", "어플리케이션"],
    "direction": ["방향", "발신수신", "송수신"],
    "timestamp": ["일시", "시각", "통화일시", "날짜"],
    "counterpart_name": ["상대방", "상대방명", "상대방이름"],
    "counterpart_number_masked": ["상대방번호", "전화번호", "번호", "상대방전화번호"],
    "counterpart_person_id": ["상대방인물ID", "인물ID", "상대방ID"],
    "duration_sec": ["통화시간", "통화시간(초)", "통화시간초"],
    "message_preview": ["메시지", "내용", "메시지내용"],
    "note": ["비고", "메모"],
}
FIN_ALIASES: dict[str, list[str]] = {
    "txn_date": ["거래일", "일자", "거래일자", "날짜"],
    "txn_type": ["거래유형", "구분"],
    "direction": ["방향", "입출금"],
    "amount": ["금액", "거래금액"],
    "counterpart_type": ["상대방유형", "유형"],
    "counterpart_person_id": ["상대방인물ID", "인물ID"],
    "counterpart_org_id": ["상대방기업ID", "기업ID"],
    "counterpart_name": ["상대방", "상대방명"],
    "counterpart_account_masked": ["상대방계좌", "계좌번호", "상대방계좌번호"],
    "counterpart_bank": ["은행", "상대방은행"],
    "note": ["비고", "메모"],
}

KIND_CONFIG = {
    "communication": {
        "fields": COMM_FIELDS,
        "aliases": COMM_ALIASES,
        "filename": "communication_record.json",
        "id_prefix": "COMM",
        "evidence_id": "COMM",
        "source_type": "디지털포렌식 추출자료",
    },
    "financial": {
        "fields": FIN_FIELDS,
        "aliases": FIN_ALIASES,
        "filename": "financial_transaction_record.json",
        "id_prefix": "FIN",
        "evidence_id": "FIN",
        "source_type": "금융계좌 추적자료",
    },
}


class EvidenceImportError(ValueError):
    pass


def _read_table(data: bytes, filename: str) -> pd.DataFrame:
    suffix = Path(filename).suffix.lower()
    try:
        if suffix in (".xlsx", ".xls"):
            return pd.read_excel(io.BytesIO(data))
        return pd.read_csv(io.BytesIO(data))
    except Exception as exc:
        raise EvidenceImportError(f"파일을 읽을 수 없습니다: {exc}") from exc


def _normalize_columns(df: pd.DataFrame, aliases: dict[str, list[str]], fields: list[str]) -> pd.DataFrame:
    rename: dict[str, str] = {}
    for col in df.columns:
        key = str(col).strip()
        if key in fields:
            continue
        for field, alias_list in aliases.items():
            if key in alias_list:
                rename[col] = field
                break
    return df.rename(columns=rename)


def _cell(row: pd.Series, field: str) -> Any:
    if field not in row.index:
        return None
    val = row[field]
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _to_records(df: pd.DataFrame, kind: str) -> list[dict[str, Any]]:
    cfg = KIND_CONFIG[kind]
    df = _normalize_columns(df, cfg["aliases"], cfg["fields"])
    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec: dict[str, Any] = {}
        for field in cfg["fields"]:
            rec[field] = _cell(row, field)

        if kind == "communication":
            ts = rec.get("timestamp")
            if isinstance(ts, (pd.Timestamp, datetime)):
                rec["timestamp"] = ts.strftime("%Y-%m-%dT%H:%M:%S")
            elif ts is not None:
                rec["timestamp"] = str(ts)
            if rec.get("duration_sec") is not None:
                try:
                    rec["duration_sec"] = int(rec["duration_sec"])
                except (TypeError, ValueError):
                    pass
        else:
            d = rec.get("txn_date")
            if isinstance(d, (pd.Timestamp, datetime)):
                rec["txn_date"] = d.strftime("%Y-%m-%d")
            elif d is not None:
                rec["txn_date"] = str(d)
            if rec.get("amount") is not None:
                try:
                    rec["amount"] = float(rec["amount"])
                except (TypeError, ValueError):
                    pass

        if not any(v is not None for v in rec.values()):
            continue
        records.append(rec)

    if not records:
        raise EvidenceImportError("변환할 수 있는 행이 없습니다. 표준 필드명을 확인하세요.")
    return records


def _person_name(person_id: str) -> str:
    try:
        with duckdb.connect(str(DB_PATH), read_only=True) as conn:
            row = conn.execute(
                "SELECT name FROM risk_person_profile WHERE person_id=?", [person_id]
            ).fetchone()
        if row:
            return row[0]
    except Exception:
        pass
    return person_id


def _load_or_init(person_dir: Path, person_id: str, person_name: str, kind: str) -> dict[str, Any]:
    cfg = KIND_CONFIG[kind]
    path = person_dir / cfg["filename"]
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    base: dict[str, Any] = {
        "evidence_id": f"EV-SEIZED-{person_id}-{cfg['evidence_id']}",
        "source_type": cfg["source_type"],
        "subject_person_id": person_id,
        "subject_name": person_name,
        "note": f"xlsx/csv 업로드로 등록된 {('통신' if kind == 'communication' else '금융거래')}기록.",
        "records": [],
    }
    if kind == "communication":
        base["device"] = {
            "device_type": None, "model": None, "imei_masked": None,
            "seized_date": None, "extraction_tool": None,
            "extraction_date": datetime.now().date().isoformat(),
        }
    else:
        base["account"] = {"bank": None, "account_no_masked": None, "account_holder": person_name}
        base["extraction_date"] = datetime.now().date().isoformat()
    return base


def _build_graph_fragment(person_id: str, person_name: str, records: list[dict[str, Any]], kind: str) -> dict[str, list]:
    """등록된 레코드를 관계망 패널에 즉시 병합할 노드/엣지로 변환."""
    subject_id = f"Person:{person_id}"
    nodes: dict[str, dict] = {
        subject_id: {"id": subject_id, "label": "Person", "name": person_name, "properties": {"source": "evidence_import"}}
    }
    edge_counts: dict[tuple[str, str, str], int] = {}
    edge_meta: dict[tuple[str, str, str], dict] = {}

    for rec in records:
        if kind == "communication":
            cp_id = rec.get("counterpart_person_id")
            cp_name = rec.get("counterpart_name") or rec.get("counterpart_number_masked") or "미상"
            if cp_id:
                target_id = f"Person:{cp_id}"
                label = "Person"
            else:
                number = rec.get("counterpart_number_masked") or cp_name
                target_id = f"Phone:{number}"
                label = "Phone"
            rel_type = rec.get("record_type") or "통신"
        else:
            cp_id = rec.get("counterpart_person_id")
            org_id = rec.get("counterpart_org_id")
            cp_name = rec.get("counterpart_name") or "미상"
            if cp_id:
                target_id = f"Person:{cp_id}"
                label = "Person"
            elif org_id:
                target_id = f"Organization:{org_id}"
                label = "Organization"
            else:
                target_id = f"Entity:{cp_name}"
                label = "Entity"
            rel_type = rec.get("txn_type") or "거래"

        if target_id not in nodes:
            nodes[target_id] = {"id": target_id, "label": label, "name": str(cp_name), "properties": {"source": "evidence_import"}}

        ekey = (subject_id, rel_type, target_id)
        edge_counts[ekey] = edge_counts.get(ekey, 0) + 1
        edge_meta[ekey] = {"source": "evidence_import"}

    edges = [
        {"source": s, "target": t, "type": r, "properties": {**edge_meta[(s, r, t)], "count": c}}
        for (s, r, t), c in edge_counts.items()
    ]
    return {"nodes": list(nodes.values()), "edges": edges}


def import_evidence_file(person_id: str, kind: str, data: bytes, filename: str) -> dict[str, Any]:
    if kind not in KIND_CONFIG:
        raise EvidenceImportError("kind는 'communication' 또는 'financial' 이어야 합니다.")
    if not person_id:
        raise EvidenceImportError("person_id가 필요합니다.")

    df = _read_table(data, filename)
    new_records = _to_records(df, kind)

    cfg = KIND_CONFIG[kind]
    person_name = _person_name(person_id)
    person_dir = EVIDENCE_DIR / person_id
    person_dir.mkdir(parents=True, exist_ok=True)

    doc = _load_or_init(person_dir, person_id, person_name, kind)
    existing = doc.get("records") or []
    for i, rec in enumerate(new_records, start=len(existing) + 1):
        rec["record_id"] = f"{cfg['id_prefix']}-{i:04d}"
    doc["records"] = existing + new_records

    path = person_dir / cfg["filename"]
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

    graph = _build_graph_fragment(person_id, person_name, new_records, kind)
    return {
        "person_id": person_id,
        "kind": kind,
        "added": len(new_records),
        "total": len(doc["records"]),
        "file": str(path.relative_to(DATA_DIR.parent)),
        "nodes": graph["nodes"],
        "edges": graph["edges"],
    }
