# -*- coding: utf-8 -*-
"""밀수 수사용 컬럼을 추가한다 (멱등) — 위험지표 6종 + 통관검사 구분.

배경: 기존 위험지표 6종은 심사(관세조사) 관점(저가신고·특수관계·FTA·환급·HS·역외)으로,
밀수 수사 대상 기업(혐의 c2 밀수출입 / c4 금지·제한 위반)에는 맞지 않는다.
또한 '반입채널·검사회피' 분석에는 신고별 통관검사 구분이 필요하다.

[import_risk_scores] 밀수 지표 6종 (DOUBLE, 0~100 비율)
  disguise_declaration_rate   품명 위장 신고율
  inspection_evasion_rate     통관검사 회피 지수
  contraband_detection_rate   금지·위해물품 적발률
  route_supplier_risk_rate    우범 경로·공급망 위험
  accomplice_network_rate     공범·차명 관계망
  proceeds_concealment_rate   범죄수익·자금 은닉

[import_declarations] 통관검사 구분 (VARCHAR)
  inspection_type             미검사 / 서류검사 / 물품검사

DDL 원본은 setup_db.py(+ HEADER_COLS는 refresh_realistic_sample_data.py)에 함께 반영되어
--reset 재구축 시에도 유지된다. 이 스크립트는 기존 customs.duckdb를 재구축 없이 갱신한다.

사용법:
  venv/Scripts/python.exe data/scripts/migrate_smuggling_risk_columns.py
실행 후: web_server 재시작 필요(DuckDB 인스턴스 캐시 — 컬럼 추가가 살아있는 서버에 안 보임).
"""
from pathlib import Path

import duckdb

DB = Path(__file__).resolve().parents[2] / "data" / "customs.duckdb"

# (테이블, [(컬럼, 타입, 설명)])
TARGETS = [
    ("import_risk_scores", [
        ("disguise_declaration_rate", "DOUBLE", "품명 위장 신고율"),
        ("inspection_evasion_rate", "DOUBLE", "통관검사 회피 지수"),
        ("contraband_detection_rate", "DOUBLE", "금지·위해물품 적발률"),
        ("route_supplier_risk_rate", "DOUBLE", "우범 경로·공급망 위험"),
        ("accomplice_network_rate", "DOUBLE", "공범·차명 관계망"),
        ("proceeds_concealment_rate", "DOUBLE", "범죄수익·자금 은닉"),
    ]),
    ("import_declarations", [
        ("inspection_type", "VARCHAR", "통관검사 구분(미검사/서류검사/물품검사)"),
    ]),
]


def main() -> None:
    con = duckdb.connect(str(DB))
    for table, columns in TARGETS:
        existing = {r[1] for r in con.execute(f"PRAGMA table_info('{table}')").fetchall()}
        added, skipped = [], []
        for col, dtype, label in columns:
            if col in existing:
                skipped.append(col)
                continue
            con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dtype}")
            added.append(f"{col} ({label})")
        con.commit()
        total = len(con.execute(f"PRAGMA table_info('{table}')").fetchall())
        print(f"[migrate] {table} — 컬럼 {total}개")
        if added:
            print("  추가:", ", ".join(added))
        if skipped:
            print("  이미 존재(건너뜀):", ", ".join(skipped))
    print("[migrate] 완료 — 실행 중인 web_server를 재시작하세요.")
    con.close()


if __name__ == "__main__":
    main()
