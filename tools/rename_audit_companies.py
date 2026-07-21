"""관세조사 대상(audit) 기업에 실감나는 상호를 부여한다.

"관세조사대상기업001" 같은 일련번호 이름을 업종에 맞는 한국식 상호로 바꾼다.
이름은 실제로 존재하는 기업과 겹치지 않도록 조합한 가상 상호다
(데모 데이터에 관세포탈 혐의가 붙으므로 실존 상호를 쓰면 안 된다).

company_name 은 수입신고의 importer_name·taxpayer_name 에도 들어가므로 함께 갱신한다.
실행 후 Neo4j 재적재 필요:
  python data/scripts/load_company_import_graph_to_neo4j.py --clear

실행: python tools/rename_audit_companies.py [--db ...] [--dry-run] [--revert]
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "customs.duckdb"
SEED = 20260724

# 업종코드 → (앞말 후보, 뒷말 후보). 조합으로 상호를 만든다.
INDUSTRY_STYLE: dict[str, tuple[list[str], list[str]]] = {
    # C13 섬유제품 제조
    "C13": (["한성", "우진", "삼일", "동보", "예신", "대창", "성진", "명진", "한올", "보성"],
            ["텍스", "섬유", "패브릭", "테크텍스", "코퍼레이션"]),
    # C20 화학물질·화학제품
    "C20": (["케이", "동아", "한남", "유진", "백산", "청진", "한별", "한결", "삼양", "정우"],
            ["케미칼", "화학", "케미", "폴리머", "소재"]),
    # C26 전자부품·컴퓨터·통신장비
    "C26": (["누리", "에이스", "한빛", "세종", "지앤", "코어", "다온"],
            ["일렉트로닉스", "전자", "테크", "세미콘", "디바이스"]),
    # C28 전기장비
    "C28": (["대명", "신흥", "우성", "한독", "미래", "정한", "동성", "가온", "태영"],
            ["일렉트릭", "전기", "파워", "이엔지", "시스템"]),
    # G46 도매·상품중개
    "G46": (["삼우", "글로벌", "동방", "한서", "제일", "태평", "무진"],
            ["무역", "상사", "트레이딩", "인터내셔널", "코퍼레이션"]),
    # G47 소매업
    "G47": (["오늘", "가온누리", "굿", "미소", "행복", "다올", "새롬", "온리", "베스트"],
            ["리테일", "커머스", "유통", "쇼핑", "마켓"]),
    # H52 창고·운송관련 서비스
    "H52": (["범한", "대륙", "신속", "해든", "동서", "케이엘", "퍼스트", "온로드",
             "정성", "그린", "대성"],
            ["로지스", "물류", "로지스틱스", "익스프레스", "포워딩"]),
    # K64 금융업
    "K64": (["다산", "누리온", "정도", "청우", "한마음", "예성", "정석", "미소온"],
            ["캐피탈", "파이낸스", "인베스트", "홀딩스", "파트너스"]),
}
FALLBACK = (["한독", "우신", "정도", "대한", "동보"], ["코퍼레이션", "트레이딩", "산업"])

# 위 목록에 오타/비한글이 섞이지 않도록 정리 (편집 실수 방지)
for _code, (_a, _b) in list(INDUSTRY_STYLE.items()):
    INDUSTRY_STYLE[_code] = (
        [w for w in _a if all("가" <= ch <= "힣" for ch in w)],
        _b,
    )


def build_names(rows: list[tuple[str, str]], rng: random.Random) -> dict[str, str]:
    """company_id → 새 상호. 전체에서 중복되지 않게 만든다."""
    used: set[str] = set()
    out: dict[str, str] = {}
    for cid, industry in rows:
        heads, tails = INDUSTRY_STYLE.get(industry or "", FALLBACK)
        if not heads:
            heads, tails = FALLBACK
        for _ in range(400):
            name = f"(주){rng.choice(heads)}{rng.choice(tails)}"
            if name not in used:
                break
        else:                                        # 조합이 고갈되면 숫자를 붙여 유일성 확보
            name = f"(주){rng.choice(heads)}{rng.choice(tails)}{len(used) + 1}"
        used.add(name)
        out[cid] = name
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--revert", action="store_true", help="일련번호 이름으로 되돌린다")
    args = ap.parse_args()

    rng = random.Random(SEED)
    con = duckdb.connect(args.db, read_only=args.dry_run)
    rows = con.execute(
        "SELECT company_id, industry_code FROM company_profiles "
        "WHERE entity_role='audit' ORDER BY company_id"
    ).fetchall()
    if not rows:
        print("audit 기업이 없습니다.")
        return

    if args.revert:
        mapping = {cid: f"관세조사대상기업{int(cid.split('-')[1]) - 1000:03d}" for cid, _ in rows}
    else:
        mapping = build_names([(c, i) for c, i in rows], rng)

    print(f"대상 {len(mapping)}개사 — 예시")
    for cid in list(mapping)[:6]:
        old = con.execute("SELECT company_name FROM company_profiles WHERE company_id=?", [cid]).fetchone()[0]
        print(f"  {cid}  {old}  →  {mapping[cid]}")

    if args.dry_run:
        print("(dry-run — 저장하지 않음)")
        return

    for cid, name in mapping.items():
        old = con.execute("SELECT company_name FROM company_profiles WHERE company_id=?", [cid]).fetchone()[0]
        con.execute("UPDATE company_profiles SET company_name=? WHERE company_id=?", [name, cid])
        # 신고서에 박힌 상호도 함께 교체 (importer_name / taxpayer_name)
        con.execute("UPDATE import_declarations SET importer_name=? WHERE company_id=?", [name, cid])
        con.execute("UPDATE import_declarations SET taxpayer_name=? WHERE company_id=?", [name, cid])
        con.execute(
            "UPDATE import_declarations SET taxpayer_email=REPLACE(taxpayer_email, ?, ?) "
            "WHERE company_id=? AND taxpayer_email LIKE ?",
            [old, name, cid, f"%{old}%"])
    con.close()
    print(f"완료 — {len(mapping)}개사 상호 변경")
    print("Neo4j 재적재 필요: python data/scripts/load_company_import_graph_to_neo4j.py --clear")


if __name__ == "__main__":
    main()
