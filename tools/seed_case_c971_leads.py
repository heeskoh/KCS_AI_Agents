# -*- coding: utf-8 -*-
"""위해물품 밀수 케이스(C-971) 수사단서 시드 — 밀수신고 + 정보입수보고서.

수사단서(leads)는 DuckDB가 아니라 사건 워크스페이스에 저장된다:
  data/workspace_state/<userId>.json  → customGenInvCases[].leads
  data/workspace_state/_base.json     → 현재 세션 스냅샷(동일 구조, 함께 갱신해야 반영됨)

등록 내용 (docs/crime-case-sim/case-c971-hazard-smuggling.html 케이스와 정합):
  1) 🚨 밀수신고(B급)  — 소비자 제보. 5·6월 특송검사 적발보다 앞선 단서로 배치
  2) 🕵️ 정·첩보        — 위 신고를 평가한 정보입수보고서(확정) — 기초자료 탭
                          '외부 정보 수집·정리 > 확정된 정보 문서'에도 표시된다

멱등: seedTag="case-c971"인 단서를 제거 후 재삽입. 기존 밀수신고(빈 껍데기)는 내용을 채워 재사용.
사용법: venv/Scripts/python.exe tools/seed_case_c971_leads.py
실행 후: 브라우저 새로고침(서버 재시작 불필요 — 워크스페이스는 요청 시 파일에서 읽음).
"""
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WS = ROOT / "data" / "workspace_state"
CASE_ID = "GI-2026-006"
SEED_TAG = "case-c971"
AUTHOR = "임수사"

REPORT_TITLE = "밀수신고 — (주)메디피아글로벌 수입 다이어트·활력 제품 무허가 의약품 성분 함유 의심"
REPORT_CONTENT = """1. 신고 요지
 - (주)메디피아글로벌(대표 정밀수)이 중국에서 수입해 온라인 판매 중인 '슬림에이스 다이어트',
   '파워업 활력정'에 의약품 성분이 함유된 것으로 의심된다는 소비자 제보

2. 신고자 진술 요지
 - 자사 온라인몰에서 '슬림에이스 다이어트' 구매·복용 후 심계항진·불면 증상 발생(3건 유사 후기 확인)
 - 오픈마켓 구매자 중 어지럼증 호소 사례 확인, 판매 페이지에 '식약처 인증', '의사 추천' 표기
 - 정식 의약품 없이 동일 효과를 표방, 복용 후 반응이 일반 건강기능식품과 상이

3. 제보자 확인 정보
 - 판매 페이지 URL 및 구매 내역 캡처 5건 제출, 제품 실물 1개 제출 의사 있음
 - 제보자는 소비자 본인(연락처 확보), 업체와 이해관계 없음

4. 확인 요청 사항
 - 해당 업체 수입신고 품명·성분 및 수입요건(식약처 품목허가) 이행 여부
 - 유통 중인 제품의 위해성분(식욕억제제·발기부전 치료 성분 등) 함유 여부"""

INTEL_TITLE = "정보입수보고 — (주)메디피아글로벌 위해물품 밀수입 의심 정보"
INTEL_CONTENT = """밀수신고센터 접수 제보(B급, 2026-04-28)를 근거로 대상 업체의 위해물품 밀수입 의심 정보를 정리.
소비자 직접 제보이며 물증(판매 페이지 캡처·제품 실물) 확보 가능. 성분분석 미실시 상태로 확인 필요."""
INTEL_DRAFT = """[개요]
 - 사건번호: GI-2026-006 / 대상: (주)메디피아글로벌(C-971), 대표 정밀수
 - 요지: 중국산 다이어트·활력 제품에 의약품 성분 함유 의심 — 품명 위장 수입 및 무허가 의약품
         유통 정황에 대한 소비자 제보 입수
 - 관련 혐의(검토): 관세법 §269②(밀수입)·§270①(부정수입), 약사법, 식품위생법

[입수 경위]
 - 입수일시: 2026-04-28 / 입수경로: 관세청 밀수신고센터 접수(밀수신고 B급)
 - 제보자: 제품 구매 소비자 본인(연락처 확보, 업체와 이해관계 없음)
 - 제출 자료: 판매 페이지 캡처 5건, 구매 내역, 제품 실물 제출 의사

[정보 내용]
 - 대상 업체는 '슬림에이스 다이어트', '파워업 활력정'을 자사몰·오픈마켓 등에서 온라인 판매 중
 - 복용 후 심계항진·불면(3건), 어지럼증 등 부작용 호소 — 식욕억제제 계열 성분 함유 의심
 - 판매 페이지에 '식약처 인증', '의사 추천' 등 표기 — 표시광고법 위반 병행 의심
 - 대상 업체는 건강기능식품·화장품 수입업으로 등록, 의약품 수입 품목허가 보유 사실 확인 필요

[신빙성 평가]
 - 등급: B급(신빙성 있음·확인 필요)
 - 제보자 신뢰도: 실명·연락처 확보된 직접 피해 소비자로 허위 제보 동기 낮음
 - 내용 구체성: 제품명·판매채널·증상이 특정되어 있고 물증(페이지 캡처·제품 실물) 확보 가능
 - 교차 확인: 온라인 후기에서 유사 부작용 호소 다수 확인 — 제보 내용과 부합
 - 한계: 성분 함유 여부는 제보자 진술·정황에 근거하며, 성분분석 결과 미확보(확인 필요)

[조치 의견]
 1. 대상 업체 수입신고 이력(품명·HS·수입요건 이행) 전수 확인 — CDW 조회
 2. 특송 반입 화물에 대한 검사 지정 강화 및 보관시료 성분분석 의뢰(식약처 합동)
 3. 온라인 판매 페이지 아카이브 보전(증거 인멸 대비) 및 판매 채널·수량 확인
 4. 성분분석에서 위해성분 검출 시 즉시 수사 전환 및 유통 차단(회수명령) 요청 검토"""


def ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def label(dt: datetime) -> str:
    ampm = "오전" if dt.hour < 12 else "오후"
    h12 = dt.hour if 1 <= dt.hour <= 12 else (dt.hour - 12 if dt.hour > 12 else 12)
    return f"{dt.year}. {dt.month}. {dt.day}. {ampm} {h12}:{dt.minute:02d}:{dt.second:02d}"


REPORT_AT = datetime(2026, 4, 28, 14, 20, 0)
INTEL_AT = datetime(2026, 4, 30, 9, 40, 0)


def build_leads(existing: list) -> list:
    """seedTag 단서 제거 → 밀수신고(기존 빈 껍데기 재사용) + 정·첩보 구성."""
    leads = [l for l in existing if l.get("seedTag") != SEED_TAG and l.get("type") != "intel"]

    # 1) 밀수신고 — 내용이 비어 있는 기존 단서가 있으면 그 id를 유지해 채운다
    report = next((l for l in leads if l.get("type") == "smuggle_report"), None)
    if report is None:
        report = {"id": f"lead_seed_{SEED_TAG}_report"}
        leads.append(report)
    report.update({
        "type": "smuggle_report", "title": REPORT_TITLE, "content": REPORT_CONTENT,
        "grade": "B", "docType": "신고내용",
        "aiDraft": "", "draft": "", "confirmed": False, "confirmedAt": None,
        "createdAt": ms(REPORT_AT), "createdLabel": label(REPORT_AT),
        "author": AUTHOR, "seedTag": SEED_TAG,
    })

    # 2) 정·첩보 — 정보입수보고서(확정) : 기초자료 탭 '확정된 정보 문서'에도 노출
    leads.append({
        "id": f"lead_seed_{SEED_TAG}_intel",
        "type": "intel", "title": INTEL_TITLE, "content": INTEL_CONTENT,
        "docType": "정보입수보고서",
        "aiDraft": INTEL_DRAFT, "draft": INTEL_DRAFT,
        "confirmed": True, "confirmedAt": "2026-04-30",
        "createdAt": ms(INTEL_AT), "createdLabel": label(INTEL_AT),
        "author": AUTHOR, "seedTag": SEED_TAG,
    })
    leads.sort(key=lambda l: l.get("createdAt") or 0)
    return leads


def patch_file(path: Path) -> int:
    if not path.exists():
        return 0
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    touched = 0

    def patch_cases(cases):
        nonlocal touched
        for c in cases or []:
            if c.get("caseId") != CASE_ID:
                continue
            c["leads"] = build_leads(c.get("leads") or [])
            touched += 1

    patch_cases(data.get("customGenInvCases"))
    # 사용자 워크스페이스 파일(_base 외)은 최상위에 customGenInvCases가 있고,
    # _base.json 은 전역 스냅샷 — 두 구조 모두 동일 키를 쓴다.
    for ws in (data.get("userWorkspaces") or {}).values():
        patch_cases(ws.get("customGenInvCases"))

    if touched:
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
    return touched


def main() -> None:
    total = 0
    for path in sorted(WS.glob("*.json")):
        n = patch_file(path)
        if n:
            print(f"  {path.name}: 사건 {n}건 갱신")
            total += n
    if not total:
        print("[seed] 대상 사건을 찾지 못했습니다 — 관세수사에서 C-971 사건을 먼저 등록하세요.")
        return
    print(f"[seed] C-971 수사단서 시드 완료 (사건 {total}곳)")
    print(f"  1) 밀수신고(B급) — {REPORT_TITLE[:40]}…")
    print(f"  2) 정·첩보(확정) — 정보입수보고서 {len(INTEL_DRAFT)}자")
    print("[seed] 브라우저 새로고침 후 관세수사 > 진행중인 수사 > (C-971) 상세에서 확인")


if __name__ == "__main__":
    main()
