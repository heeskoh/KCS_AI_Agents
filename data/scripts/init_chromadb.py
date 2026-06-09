"""ChromaDB 초기화 및 복구 스크립트.

사용법
------
python data/scripts/init_chromadb.py           # 문서 없는 컬렉션만 채움 (멱등)
python data/scripts/init_chromadb.py --reset   # 전체 삭제 후 재생성 (완전 복구)
python data/scripts/init_chromadb.py --check   # 현재 컬렉션 상태만 확인

컬렉션 구조
-----------
rag_customs     : 관세법령·과세가격·원산지 업무 매뉴얼
rag_trade       : 통관 정보·수입신고 절차
rag_audit       : 감사·조사 사례 보고서  ← audit_search 에이전트도 여기 검색
rag_investigation: 조사 기법·혐의 유형 가이드
rag_global      : 국제 무역 협정·해외 거래 구조
"""
import argparse
import shutil
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

CHROMA_DIR = Path(__file__).resolve().parents[1] / "chroma_db"


# ── 컬렉션별 샘플 문서 ──────────────────────────────────────────────────────────

DOCUMENTS: dict[str, list[dict]] = {

    "rag_customs": [
        {
            "content": """
관세법 제30조 — 과세가격 결정 원칙
수입물품의 과세가격은 우리나라에 수출하기 위하여 판매되는 물품에 대하여 구매자가
실제로 지급하였거나 지급하여야 할 가격(거래가격)에 다음 각 호의 금액을 더하여 조정한 가격으로 한다.
1. 구매자가 부담하는 수수료와 중개료(구매수수료 제외)
2. 동종·동질 물품의 용기·포장 비용
3. 구매자가 무료 또는 인하가격으로 공급한 물품·서비스
4. 특허권·상표권 등 권리사용료(로열티)로서 수입물품과 관련하여 지급하는 금액
5. 수입 후 처분·사용의 이익 중 판매자에게 귀속되는 금액
6. 수입항까지의 운임, 보험료 및 운반·취급 비용(CIF 기준)
착안사항: 로열티·기술료 계약서, 해외 관계법인 지급내역, 무상공급 자재·설비 가치 확인.
""",
            "metadata": {"source": "관세법_제30조_과세가격", "category": "법령", "topic": "과세가격"},
        },
        {
            "content": """
관세법 제45조 — 특수관계자 간 거래가격의 적용
특수관계자 간 수입 물품의 거래가격이 과세가격으로 인정받으려면 다음 중 하나를 입증해야 한다.
① 해당 거래가격이 동종·동질 물품의 거래가격과 유사한 경우
② 해당 거래가격이 공제가격·계산가격 방법으로 결정된 가격과 유사한 경우
③ 과세가격 결정 시 특수관계가 가격에 영향을 미치지 않았음을 증명하는 경우
착안사항: 이전가격(TP) 문서(마스터파일·로컬파일), 비교 가능 거래가격(CUP), 독립기업 원칙 적용 여부.
""",
            "metadata": {"source": "관세법_제45조_특수관계", "category": "법령", "topic": "특수관계"},
        },
        {
            "content": """
FTA 협정관세 적용 원산지 요건 안내
한-중 FTA: 세번변경기준(CTH) 또는 부가가치기준(RVC 40%). 원산지증명서: 기관 발급(CCPIT 등).
한-미 FTA: 세번변경기준(CTSH) + 부가가치기준(RVC 35%). 자율발급 가능.
한-베트남 FTA: 세번변경기준 또는 RVC 40%. C/O Form VK 사용.
한-ASEAN FTA: 완전생산기준 또는 RVC 40%. Form AK 사용.
주의사항: 원산지 증명서 발급기관 불일치, 송장·선하증권 발급자 불일치, 제3국 우회수출 의심 시
FTA 협정세율 사후 검증 대상. 최근 5년 원산지 증명서 원본 보관 의무.
""",
            "metadata": {"source": "FTA원산지요건_안내", "category": "업무매뉴얼", "topic": "원산지"},
        },
    ],

    "rag_trade": [
        {
            "content": """
수입통관 절차 개요
① 수입신고: 관세사 또는 납세의무자 → 관세청 전자통관시스템(UNI-PASS) 전송
② 서류심사·물품검사: 위험도에 따라 C1(서류심사 없음)~C3(물품검사) 구분
③ 세액 결정: 과세가격 × 관세율 + 부가세·특소세 등
④ 납세고지 및 납부: 신고납부(P/L) 방식, 납부기한 15일
⑤ 물품 반출: 세액 납부 후 수입신고 수리
C3 검사 집중 대상: 고위험 업종·품목, 반복 저가신고, FTA 원산지 의심, 지적재산권 침해 의심 물품.
""",
            "metadata": {"source": "수입통관절차_개요", "category": "업무매뉴얼", "topic": "통관"},
        },
        {
            "content": """
수입신고 이상 패턴 분석 지침
저가신고 의심 기준:
- 동종 품목 평균 수입단가 대비 20% 이상 낮은 가격
- 동일 수출자로부터 반복적으로 단가가 하락하는 패턴
- 국제 시세 급등기에도 신고가격이 고정되는 경우
고가신고 의심 기준:
- 실제 시장가격 대비 현저히 높은 가격으로 반복 신고
- 관계법인 간 거래에서 고가 매입 후 국내 저가 판매 구조
환급 이상 기준:
- 수입 후 단기간 재수출로 관세 환급 신청 반복
- FTA 감면과 일반 환급 중복 적용 시도
착안사항: 수출국 세관 신고가격과의 대조, 통계청 수출입 단가 DB 비교.
""",
            "metadata": {"source": "수입신고_이상패턴_지침", "category": "업무매뉴얼", "topic": "이상탐지"},
        },
        {
            "content": """
특수관계 신고 및 검토 절차
특수관계 해당 여부:
1. 구매자·판매자가 상호 임원·이사인 경우
2. 법적으로 동업자인 경우
3. 한쪽이 상대방 의결권의 5% 이상 소유
4. 한쪽이 상대방을 직·간접 지배하는 경우
5. 동일인이 양쪽을 직·간접 지배하는 경우
6. 가족·친족 관계인 경우
특수관계 가격 검토 절차:
① 과세가격 결정에 영향 유무 심사 요청 → ② 동종·동질 비교가격 조회
→ ③ 가격조정 협의 또는 가격조사 착수
착안사항: 수입자 법인 등기부등본, 해외 관계법인 지분구조, 이사회 구성 확인.
""",
            "metadata": {"source": "특수관계_신고절차", "category": "업무매뉴얼", "topic": "특수관계"},
        },
    ],

    "rag_audit": [
        {
            "content": """
조사사례: 의류 수입 저가신고 및 원산지 검증
조사연도: 2024  업종: 섬유제품 제조업  HS코드: 6109.10, 6204.62  원산지: 베트남, 방글라데시
위험신호: 동일 품목 평균 수입단가 대비 35% 낮은 신고가격. FTA 원산지증명서 발급기관 불일치.
해외 관계법인 송장과 실제 선적서류 간 금액 차이 확인.
조사결과: 과세가격 누락분 및 원산지 오적용 확인. 관세·부가세 추징 및 가산세 부과.
착안사항: 면 의류 반복 수입, FTA 감면율 급증, 환급 신청액 증가, 특정 관세사법인 반복 신고.
""",
            "metadata": {"source": "audit_case_textile_2024", "category": "조사사례",
                         "industry_code": "C13", "hs_code": "6109.10", "risk_type": "undervaluation_origin"},
        },
        {
            "content": """
조사사례: 원유 수입 운임 및 보험료 과세가격 누락
조사연도: 2023  업종: 도매 및 상품중개업  HS코드: 2709.00  원산지: 사우디아라비아
위험신호: CIF 조건 신고자료와 실제 용선계약서 간 운임 차이 발생. 국제 유가 급등기에도 신고단가 고정.
해외 중개법인 수수료 별도 지급 후 과세가격 미포함.
조사결과: 운임 및 중개수수료 과세가격 가산 누락 확인. 수정신고 및 추징.
착안사항: 대량 원유 수입, 관계법인 거래, 운송비 급등기 신고가격 정체, 외화 지급내역 대조 필요.
""",
            "metadata": {"source": "audit_case_crude_oil_2023", "category": "조사사례",
                         "industry_code": "G46", "hs_code": "2709.00", "risk_type": "freight_assist_value"},
        },
        {
            "content": """
조사사례: 전자부품 HS 품목분류 오류
조사연도: 2025  업종: 전자부품 제조업  HS코드: 8536.50, 8542.39, 8504.40  원산지: 대만, 일본
위험신호: 유사 기능 전자제어 부품이 낮은 세율 품목으로 반복 분류. 제품 사양서에는 통신 제어 기능과
전원변환 모듈이 함께 표시되어 있었으나 신고 품명은 단순 스위치로 기재.
조사결과: 일부 품목 HS 재분류, 세율 차이에 따른 관세 추징. 품목분류 사전심사 권고.
착안사항: 모델명별 사양서 확보, BOM 대조, 동일 공급자 수입품의 품목분류 일관성 검토.
""",
            "metadata": {"source": "audit_case_electronics_2025", "category": "조사사례",
                         "industry_code": "C26", "hs_code": "8542.39", "risk_type": "hs_classification"},
        },
        {
            "content": """
조사사례: 식품 수입 관세환급 및 FTA 감면 중복 위험
조사연도: 2024  업종: 도매 및 상품중개업  HS코드: 2008.99, 0306.17  원산지: 태국, 칠레
위험신호: 수입 후 단기간 내 재수출 신고와 환급 신청 반복. 일부 건은 FTA 협정관세 감면 적용 후
환급 신청까지 이어짐. 냉동 수산물의 실제 보관료와 운송비 지급내역이 신고가격에 반영되지 않음.
조사결과: 환급 요건 일부 불충족 및 감면 적용 오류 확인. 환급금 환수와 협정관세 검증 착수.
착안사항: 최근 환급액 급증, FTA 감면적용비율 40% 이상, 냉장·냉동 운송비 누락 여부 점검.
""",
            "metadata": {"source": "audit_case_food_refund_2024", "category": "조사사례",
                         "industry_code": "G46", "hs_code": "0306.17", "risk_type": "refund_fta"},
        },
        {
            "content": """
조사사례: 화학 원재료 관계법인 거래가격 검증
조사연도: 2025  업종: 화학물질 및 화학제품 제조업  HS코드: 3907.61, 2917.36  원산지: 중국, 인도네시아
위험신호: 해외 관계법인으로부터 원재료를 수입하면서 장기공급계약 가격을 적용했으나 국제 시세와
큰 차이가 발생. 로열티와 기술지원비가 별도 지급되었고 수입물품 생산과 관련성이 확인됨.
조사결과: 특수관계 영향 및 권리사용료 가산 여부 검토 후 일부 과세가격 조정.
착안사항: 관계법인 거래, 원재료 국제시세 급변, 로열티·기술지원비 계약서 확보 필요.
""",
            "metadata": {"source": "audit_case_chemical_related_party_2025", "category": "조사사례",
                         "industry_code": "C20", "hs_code": "3907.61", "risk_type": "related_party_royalty"},
        },
        {
            "content": """
조사사례: 자동차 부품 이전가격 조작 의혹
조사연도: 2024  업종: 자동차 및 트레일러 제조업  HS코드: 8708.99, 8507.60  원산지: 멕시코, 중국
위험신호: 해외 모회사로부터 핵심 부품을 수입하면서 시장가격 대비 25% 높은 가격 적용.
국내 완성차 납품가는 국제 시장 수준이나 수입단가만 지속 상승. 관계법인 간 이전가격 적정성 의문.
조사결과: 이전가격 조사 착수, 정상가격 산출 방법(TNMM) 적용하여 과세가격 조정.
착안사항: 관계법인 수입 비중, 이전가격 문서화 자료, 독립기업 간 비교 가격(CUP) 확보.
""",
            "metadata": {"source": "audit_case_auto_parts_2024", "category": "조사사례",
                         "industry_code": "C30", "hs_code": "8708.99", "risk_type": "transfer_pricing"},
        },
    ],

    "rag_investigation": [
        {
            "content": """
수입 가격조작 탐지 기법
1. Z-score 분석: 동일 HS코드 수입가격의 표준편차로 이상치 탐지 (Z > 2.5: 고이상치)
2. IQR 분석: Q1 × 0.7 이하 또는 Q3 × 1.3 이상 가격을 이상치로 판정
3. 시계열 분석: 국제 원자재 시세와 신고단가의 상관관계 분리 탐지
4. 피어 그룹 비교: 동업종 동종 물품 수입업체 대비 가격 비교
5. 수출국 신고가격 대조: 상대국 세관 자료와의 Mirror Statistics 비교
조사 착수 기준: 동종 평균 대비 20% 이상 낮은 가격이 3회 이상 반복 + 관계법인 거래.
""",
            "metadata": {"source": "가격조작_탐지기법", "category": "조사기법", "topic": "이상탐지"},
        },
        {
            "content": """
원산지 위반 조사 절차
1단계 서류 검토:
- 원산지증명서(C/O) 발급기관·양식·날인 진위 여부
- 송장·선하증권·포장명세서 상의 원산지 표기 일관성
2단계 현지 실사 요청:
- 협정 상대국 세관에 원산지 사후 검증(PSI) 요청
- 생산 공정·투입 원자재 원산지 확인
3단계 관세 추징:
- 협정세율 적용 취소 → 일반세율 적용 차액 추징
- 가산세(부정 신고 시 최대 40%) 및 과태료 부과
착안사항: 동일 HS코드 물품의 원산지 국가 빈번한 변경, 제3국 경유 운송 이력.
""",
            "metadata": {"source": "원산지위반_조사절차", "category": "조사기법", "topic": "원산지"},
        },
        {
            "content": """
해외 자금 은닉 및 분산 신고 조사 기법
분산 신고 패턴:
- 단일 거래를 여러 건으로 분할하여 세관 심사 기준금액(미화 5,000달러) 이하로 신고
- 복수의 수입자 명의를 이용한 동일 화물 분할 반입
해외 자금 추적:
- 외국환거래법 위반 여부 (무신고 해외 송금)
- 수입대금 실제 지급금액과 신고가격 대조 (은행 외환거래 내역)
- 관계법인 간 자금 우회 경로 (페이퍼컴퍼니 활용 여부)
착안사항: 동일 수출자로부터 다수 소액 반복 수입, 해외 관계법인 지분구조 파악 선행 필요.
""",
            "metadata": {"source": "해외자금은닉_조사기법", "category": "조사기법", "topic": "자금추적"},
        },
    ],

    "rag_global": [
        {
            "content": """
글로벌 공급망 위험 지역 및 품목 현황 (2025)
고위험 원산지:
- 중국: 반도체·이차전지·희토류 수출통제 강화, HS 8542·8507 관련 원산지 오용 주의
- 베트남·캄보디아: 한-ASEAN FTA 원산지 세탁 경유 우회수출 의심 증가
- UAE·홍콩: 제3국 경유 원유·귀금속 중개 거래 구조, 실제 원산지 은폐 주의
고위험 품목:
- 원유(2709): 국제 유가 급등락기 운임 누락 리스크
- 의류(61·62류): ASEAN 원산지 세탁 + 저가신고 복합 리스크
- 전자부품(8542·8504): 수출통제 품목 위장 반입, HS 오분류
착안사항: 무역통계청 Mirror Statistics 이상 괴리, 위험 원산지 집중 수입 패턴.
""",
            "metadata": {"source": "글로벌공급망위험_2025", "category": "국제정보", "topic": "위험지역"},
        },
        {
            "content": """
해외 관계법인 구조 분석 방법론
단계별 분석:
1. 지분 구조 파악: 수입자 법인등기부 → 주주 → 해외 모회사 → 최종 실질 지배자
2. 조세 회피처 존재 여부: BVI·케이맨·홍콩·싱가포르 경유 지분 구조
3. 기능·위험 분석: 어느 법인이 재고·신용·환위험 부담? 수입자가 단순 유통 에이전트인가?
4. 경제적 실질 판단: 실질 지배자의 국적, 의사결정 소재지, 주요 자산 소재지
조사 우선순위:
- 수입대금이 중간 법인을 경유하여 제3국으로 송금되는 구조
- 관계법인 수수료·기술료가 수입가격에 가산되지 않은 경우
""",
            "metadata": {"source": "해외관계법인_분석방법론", "category": "국제정보", "topic": "관계법인"},
        },
        {
            "content": """
한국-주요 교역국 FTA 활용 현황 및 위험 동향
한-중 FTA 위험:
- 중간재 원산지 세탁: 중국 생산 제품을 베트남에서 단순 가공 후 한-베 FTA 활용
- 고부가가치 화학·전자 제품의 부가가치 비율 허위 계산
한-미 FTA 위험:
- 자동차 부품 역내 부가가치 기준(RVC) 미충족 위장
- 소프트웨어 포함 전자제품의 원산지 판정 기준 오적용
한-EU FTA 위험:
- 유럽산 명품·화장품 모조품의 정품 가장 반입
- 의약품·의료기기 원산지 증명 불충분
착안사항: FTA 감면 비율이 단기간 급격히 증가한 기업, 복수 FTA 동시 활용 패턴.
""",
            "metadata": {"source": "FTA활용현황_위험동향", "category": "국제정보", "topic": "FTA"},
        },
    ],
}


def check_status() -> None:
    """현재 ChromaDB 컬렉션 상태를 출력한다."""
    import chromadb
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    existing = {c.name: c.count() for c in client.list_collections()}

    print(f"\nChromaDB 위치: {CHROMA_DIR}")
    print(f"파일 크기: {sum(f.stat().st_size for f in CHROMA_DIR.rglob('*') if f.is_file()) / 1024:.1f} KB")
    print(f"\n{'컬렉션':<20} {'문서 수':>6}  {'상태'}")
    print("-" * 40)

    all_ok = True
    for col_name in DOCUMENTS:
        cnt    = existing.get(col_name, 0)
        expected = len(DOCUMENTS[col_name])
        status = "OK" if cnt >= expected else f"부족 ({cnt}/{expected})"
        if cnt < expected:
            all_ok = False
        print(f"  {col_name:<18} {cnt:>6}  {status}")

    # 알 수 없는 컬렉션 (구 UUID 방식 등)
    unknown = set(existing) - set(DOCUMENTS)
    for col_name in unknown:
        print(f"  {col_name:<18} {existing[col_name]:>6}  (구 컬렉션 — 삭제 권장)")

    print()
    if all_ok:
        print("모든 컬렉션 정상")
    else:
        print("일부 컬렉션 문서 부족 → init_chromadb.py 를 실행하세요")


def init_collections(reset: bool = False) -> None:
    """ChromaDB named collections을 생성·재구성한다."""
    try:
        from langchain_huggingface import HuggingFaceEmbeddings
    except ImportError:
        from langchain_community.embeddings import HuggingFaceEmbeddings

    from langchain_chroma import Chroma
    from langchain_core.documents import Document

    if reset and CHROMA_DIR.exists():
        print(f"[1/3] 기존 ChromaDB 삭제: {CHROMA_DIR}")
        shutil.rmtree(CHROMA_DIR)

    print("[2/3] 임베딩 모델 로드 (jhgan/ko-sroberta-multitask)")
    embeddings = HuggingFaceEmbeddings(model_name="jhgan/ko-sroberta-multitask")

    print("[3/3] 컬렉션 생성 및 문서 저장")
    import chromadb
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    existing = {c.name: c.count() for c in client.list_collections()}

    total_added = 0
    for col_name, doc_list in DOCUMENTS.items():
        current_count = existing.get(col_name, 0)

        if not reset and current_count >= len(doc_list):
            print(f"  {col_name}: 이미 {current_count}개 문서 존재 — 건너뜀")
            continue

        vs = Chroma(
            collection_name=col_name,
            persist_directory=str(CHROMA_DIR),
            embedding_function=embeddings,
        )

        if reset or current_count == 0:
            documents = [
                Document(page_content=d["content"].strip(), metadata=d["metadata"])
                for d in doc_list
            ]
            vs.add_documents(documents)
            n = len(documents)
        else:
            # 부족한 문서만 추가 (간단히 전체 재추가 후 중복은 ChromaDB가 처리)
            documents = [
                Document(page_content=d["content"].strip(), metadata=d["metadata"])
                for d in doc_list
            ]
            vs.add_documents(documents)
            n = len(doc_list) - current_count

        total_added += len(doc_list)
        print(f"  {col_name}: {len(doc_list)}개 문서 저장")

    print(f"\n완료: 전체 {total_added}개 문서 저장")

    # 검증 쿼리
    print("\n[검증] 샘플 검색 테스트")
    vs_audit = Chroma(
        collection_name="rag_audit",
        persist_directory=str(CHROMA_DIR),
        embedding_function=embeddings,
    )
    results = vs_audit.similarity_search("원유 운송비 과세가격 관계법인", k=2)
    for i, doc in enumerate(results, 1):
        print(f"  [{i}] {doc.metadata.get('source', '미상')}: {doc.page_content[:80].strip()}…")


def main() -> None:
    parser = argparse.ArgumentParser(description="ChromaDB 초기화 / 복구")
    parser.add_argument("--reset", action="store_true", help="전체 삭제 후 재생성 (완전 복구)")
    parser.add_argument("--check", action="store_true", help="현재 상태만 확인")
    args = parser.parse_args()

    import chromadb
    print(f"chromadb {chromadb.__version__}  |  ChromaDB: {CHROMA_DIR}")

    if args.check:
        if not CHROMA_DIR.exists():
            print("ChromaDB 디렉토리 없음 → init_chromadb.py --reset 을 실행하세요")
        else:
            check_status()
        return

    init_collections(reset=args.reset)

    print()
    check_status()


if __name__ == "__main__":
    main()
