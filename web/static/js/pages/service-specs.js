/* ── AI 서비스 상세 스펙 레지스트리 (신규 기능) ───────────────────────────────
   각 AI 서비스의 입력 정의 · 입력 벨리데이션 · 결과 형식 · 결과 검증 규칙을 정의한다.
   서비스 상세 팝업(service-detail-popup.js)이 이 스펙을 렌더링하며,
   기존 소스는 참조하지 않는 독립 모듈이다.

   스펙 구조:
   - tag: 서비스 분류 · desc: 설명
   - inputs: [{ name, type, req, source, rule }]  ← 입력 정의 + 벨리데이션 규칙
   - output: { format, fields: [[필드, 설명], ...] } ← 결과 형식
   - checks: [..]  ← 실행 후 결과 벨리데이션
   - sample: [..]  ← 수행 결과 예시(시뮬레이션 표시용) */

export const SERVICE_SPECS = {
  /* ── 업무분석 AI 서비스 ── */
  "위험Case검색": {
    tag: "업무분석", desc: "위험선별 기준·선별 이력 기반으로 유사 위험 신호를 확인합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "조사 대상 선택", rule: "C-#### 또는 P-#### 형식" },
      { name: "위험 유형", type: "선택", req: false, source: "기본: 전체", rule: "저가신고·원산지·우회수입 중 선택" },
      { name: "검색 기간", type: "기간", req: false, source: "기본: 최근 36개월", rule: "1~60개월" },
    ],
    output: { format: "유사사례 표 + 요약", fields: [["사례 ID", "위험사례 식별자"], ["유사도", "0~100%"], ["위험 신호", "탐지된 패턴 설명"], ["근거", "선별 기준·이력 출처"]] },
    checks: ["유사도 60% 미만 사례 제외", "근거 출처(선별 기준 ID) 존재 확인"],
    sample: ["유사 위험사례 4건 검색 — 최고 유사도 87%", "저가신고 반복 패턴 2건 · 우회수입 의심 1건"],
  },
  "원산지 검증": {
    tag: "업무분석", desc: "원산지 증빙·FTA 적용·우회수입 가능성을 시뮬레이션합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "원산지 증빙", type: "파일/추출값", req: true, source: "첨부문서(원산지증명서)", rule: "증명서 번호·발급기관 추출 가능해야 함" },
      { name: "FTA 협정", type: "선택", req: false, source: "기본: 자동 판별", rule: "협정별 원산지 기준 존재 확인" },
      { name: "공급망 정보", type: "추출값", req: false, source: "계약서·운송서류", rule: "-" },
    ],
    output: { format: "판정 요약 + 시뮬레이션 표", fields: [["판정", "적정 / 불충분 / 위반 의심"], ["FTA 적용", "협정·세율 적용 결과"], ["우회수입 가능성", "경로별 확률"], ["필요 보완자료", "추가 증빙 목록"]] },
    checks: ["증명서 유효기간·서식 검증", "판정 근거 조항 인용 확인"],
    sample: ["원산지 증빙 서식 정합 — 발급기관 확인", "우회수입 시뮬레이션: 제3국 경유 가능성 낮음(12%)"],
  },
  "이상거래 검증": {
    tag: "업무분석", desc: "가격·거래상대방·신고패턴의 이상거래 징후를 검증합니다.",
    inputs: [
      { name: "대상 기업", type: "식별자", req: true, source: "조사 대상 선택", rule: "C-#### 형식" },
      { name: "거래 기간", type: "기간", req: false, source: "기본: 최근 24개월", rule: "1~60개월" },
      { name: "패턴 유형", type: "다중선택", req: false, source: "기본: 전체", rule: "가격급변·상대방 변경·분할신고" },
    ],
    output: { format: "징후 표 + 위험도 요약", fields: [["패턴", "탐지된 이상 패턴"], ["건수", "해당 신고 건수"], ["위험도", "높음/중간/낮음"], ["근거 신고번호", "대표 신고 목록"]] },
    checks: ["패턴별 최소 표본(3건) 미만 시 참고로만 표시", "위험도 산정 기준 명시"],
    sample: ["분할신고 의심 6건 — 동일 품목 반복 소액신고", "거래상대방 급변 1건 — 신규 공급자 검증 필요"],
  },
  "범죄수익 추적": {
    tag: "업무분석", desc: "자금흐름·계좌 추적 단서 기반으로 은닉 가능성을 분석합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "계좌/자금 자료", type: "파일", req: true, source: "금융거래내역 업로드", rule: "거래일자·금액·상대계좌 필드 필수" },
      { name: "추적 기간", type: "기간", req: false, source: "기본: 최근 12개월", rule: "1~36개월" },
    ],
    output: { format: "자금흐름 그래프 요약 + 표", fields: [["흐름 경로", "계좌 간 이체 경로"], ["집중 노드", "자금 집결 계좌"], ["은닉 의심", "현금화·가상계좌 전환 지점"], ["금액 합계", "경로별 합계"]] },
    checks: ["이체 합계와 원장 합계 일치 검증", "순환 이체(자기거래) 별도 표시"],
    sample: ["계좌 3개 경유 자금 집결 패턴 확인", "현금화 전환 2건 — 은닉 의심 지점 표시"],
  },
  "운송경로 분석": {
    tag: "업무분석", desc: "운송경로·공급망 역추적으로 우회수입을 탐지합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "운송서류", type: "파일/추출값", req: true, source: "B/L·적하목록", rule: "선적항·경유지·양륙항 추출 가능해야 함" },
      { name: "신고 원산지", type: "추출값", req: false, source: "수입신고서", rule: "-" },
    ],
    output: { format: "경로 재구성 + 의심 구간 표", fields: [["경로", "출발지→경유→도착"], ["소요일수", "구간별 운송일수"], ["우회 의심", "원산지와 불일치 구간"], ["판정", "정상 / 우회 의심"]] },
    checks: ["경유지 누락 여부 확인", "신고 원산지와 최초 선적지 대조"],
    sample: ["경유 1회(SG) — 신고 원산지와 정합", "운송일수 정상 범위"],
  },
  "수입신고검증": {
    tag: "업무분석", desc: "첨부문서 추출값과 수입신고DB를 비교해 품명·중량·가격 불일치를 확인합니다.",
    inputs: [
      { name: "대상 기업/신고", type: "식별자", req: true, source: "조사 대상 선택", rule: "C-#### 또는 신고번호 형식" },
      { name: "첨부문서 추출값", type: "추출값", req: true, source: "OCR/문서인식 결과", rule: "총액·품명·거래처 중 1개 이상" },
      { name: "비교 기간", type: "기간", req: false, source: "기본: 최근 24개월", rule: "1~60개월" },
      { name: "불일치 임계값", type: "수치", req: false, source: "기본: 가격 ±15% · 중량 ±10%", rule: "1~50%" },
    ],
    output: { format: "불일치 표 + 판정 요약", fields: [["항목", "품명/중량/가격/상대방"], ["신고값 · 추출값", "비교 원본"], ["편차", "% 또는 불일치 내용"], ["판정", "정상 / 확인 필요 / 불일치"]] },
    checks: ["신고DB 대조 건수 1건 이상", "편차 계산 재검증(임계값 대비)", "불일치 건 근거(신고번호) 첨부"],
    sample: ["신고DB 대조 12건 중 1건 품명 불일치 의심", "가격 편차 +18% 1건 — 저가신고 검토 대상"],
  },
  "품목분류검증": {
    tag: "업무분석", desc: "품목·HS코드 분류 적정성과 전략물자·수출허가내역을 검증합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "품명/HS코드", type: "추출값", req: true, source: "첨부문서·수입신고", rule: "HSK 10자리 또는 품명 텍스트" },
      { name: "관세율표 버전", type: "선택", req: false, source: "기본: 2026", rule: "-" },
      { name: "대체 후보 수", type: "수치", req: false, source: "기본: 3", rule: "1~10" },
    ],
    output: { format: "판정 + 대체 후보 표", fields: [["신고 HS", "신고된 분류"], ["판정", "적정 / 재검토"], ["대체 후보", "후보 HS·유사도"], ["전략물자", "해당 여부·허가내역"]] },
    checks: ["HS 형식(10자리) 검증", "전략물자 판정 시 허가내역 조회 필수"],
    sample: ["신고 HS 8517.62-1000 분류 적정", "전략물자 비해당 · 대체 후보 유사도 낮음(기각)"],
  },
  "과세가격평가": {
    tag: "업무분석", desc: "과세가격 결정요소와 저가신고 가능성을 검토합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "평가 방법", type: "선택", req: true, source: "기본: 거래가격 기준(1방법)", rule: "1방법 / 6방법 / 자동 판단" },
      { name: "거래가격 자료", type: "추출값", req: true, source: "계약서·인보이스", rule: "통화·금액 추출 가능해야 함" },
      { name: "가산/공제 요소", type: "추출값", req: false, source: "계약서(로열티 등)", rule: "-" },
    ],
    output: { format: "평가 요약 + 요소별 검토표", fields: [["평가 방법", "적용 방법·사유"], ["요소", "가산/공제 항목별 검토"], ["동종물품 비교", "신고가 대비 편차"], ["판정", "적정 / 저가신고 의심"]] },
    checks: ["가산요소 신고이력 대조", "동종물품 표본 5건 이상 확보"],
    sample: ["가산요소(권리사용료) 신고이력 확인 필요", "동종물품 대비 -12% — 정밀검토 권고"],
  },
  "통관보고서 생성": {
    tag: "업무분석", desc: "통관/무역 정보의 이상 징후와 참고 근거를 정리한 보고서를 생성합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "통관/무역 데이터", type: "데이터셋", req: true, source: "CDW·업로드 자료", rule: "기간·대상 지정 필요" },
    ],
    output: { format: "Markdown 보고서", fields: [["이상 징후", "탐지 항목 요약"], ["참고 근거", "출처별 인용"], ["권고", "후속 조치 제안"]] },
    checks: ["인용 출처 존재 확인", "필수 섹션(징후·근거·권고) 포함"],
    sample: ["이상 징후 2건 정리 — 근거 출처 포함"],
  },

  /* ── 분석지원 AI 서비스 ── */
  "ML 모델 실행": {
    tag: "분석지원", desc: "위험 모델 전체를 실행해 대상의 위험 패턴을 비교합니다.",
    inputs: [
      { name: "대상", type: "식별자", req: true, source: "조사 대상 선택", rule: "C-#### / P-####" },
      { name: "모델 범위", type: "다중선택", req: false, source: "기본: 전체 모델", rule: "동종업종·HS위험·이상치 등" },
    ],
    output: { format: "모델별 점수 표", fields: [["모델", "실행 모델명"], ["위험 점수", "0~100"], ["기여 요인", "상위 피처"], ["업종 대비", "백분위"]] },
    checks: ["모델 버전·학습일 표기", "점수 산출 실패 모델 별도 표시"],
    sample: ["6개 모델 실행 — 종합 위험점수 62 (업종 상위 18%)"],
  },
  "관계망 분석": {
    tag: "분석지원", desc: "특수관계·우회수입·페이퍼컴퍼니 가능성을 관계 그래프로 식별합니다.",
    inputs: [
      { name: "중심 대상", type: "식별자", req: true, source: "조사 대상 선택", rule: "C-#### / P-####" },
      { name: "탐색 깊이", type: "수치", req: false, source: "기본: 2", rule: "1~3단계" },
      { name: "관계 유형", type: "다중선택", req: false, source: "기본: 전체", rule: "지분·거래·인적관계" },
    ],
    output: { format: "그래프 요약 + 의심 클러스터 표", fields: [["노드/엣지", "관계망 규모"], ["의심 클러스터", "밀집 연결 그룹"], ["특수관계", "지분·임원 겸직"], ["페이퍼컴퍼니 지표", "실체성 점수"]] },
    checks: ["고립 노드 제외", "클러스터 판정 기준(연결도) 명시"],
    sample: ["노드 24 · 엣지 41 — 의심 클러스터 1개 식별"],
  },
  "범죄자금내역 추적": {
    tag: "분석지원", desc: "자금이체·현금입출금·가상계좌 내역 파일을 입력받아 시계열·소유주 중심으로 추적하고 관계망 그래프로 표현합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "계좌내역 파일", type: "파일", req: true, source: "금융거래내역 업로드", rule: "XLS/CSV · 일자·금액·상대 필드 필수" },
      { name: "추적 기간", type: "기간", req: false, source: "기본: 전체", rule: "-" },
    ],
    output: { format: "시계열 표 + 소유주별 요약", fields: [["시점", "이체 발생 시각"], ["경로", "출금→입금 계좌"], ["유형", "이체/현금/가상계좌"], ["누적 금액", "소유주별 합계"]] },
    checks: ["파일 필수 필드 누락 검증", "시계열 정렬·중복 제거"],
    sample: ["가상계좌 전환 3건 — 특정 시간대 집중 패턴"],
  },
  "통신내역 분석": {
    tag: "분석지원", desc: "통신 내역 기반으로 연계·연락 패턴을 분석합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "통신내역 파일", type: "파일", req: true, source: "통신내역 업로드", rule: "발신·수신·시각 필드 필수" },
    ],
    output: { format: "연락 패턴 표", fields: [["상대", "빈발 연락 대상"], ["빈도/시간대", "패턴 요약"], ["연계 의심", "공범 연계 지표"]] },
    checks: ["개인정보 마스킹 적용 확인"],
    sample: ["특정 번호 야간 집중 연락 패턴 1건"],
  },
  "OCR/문서인식": {
    tag: "분석지원", desc: "첨부 문서의 주요 항목을 추출하고 신고자료와 대조해 구조화합니다.",
    inputs: [
      { name: "문서 파일", type: "파일", req: true, source: "파일 업로드", rule: "PDF/XLS/DOCX/이미지 · 50MB 이하" },
      { name: "문서유형", type: "선택", req: false, source: "기본: 자동감지", rule: "세금계산서·계약서·B/L 등" },
    ],
    output: { format: "추출 필드 JSON + 신뢰도", fields: [["문서유형", "자동감지 결과"], ["추출 항목", "총액·품명·거래처·일자"], ["신뢰도", "항목별 OCR 신뢰도"], ["이상감지", "신고자료 대조 불일치"]] },
    checks: ["신뢰도 90% 미만 항목 '검토필요' 표시", "필수 항목(총액·품명) 추출 실패 시 재처리"],
    sample: ["문서유형 세금계산서 감지 · 신뢰도 98.2%", "품명 불일치 의심 1건 표시"],
  },
  "업무특화RAG 분석서비스": {
    tag: "업무특화RAG", desc: "선택 자료를 업무특화 RAG 지식으로 구성합니다. 기존 RAG에 추가하거나 신규 RAG를 생성합니다.",
    inputs: [
      { name: "동작 방식", type: "선택", req: true, source: "기본: 지식 생성", rule: "신규 생성 / 기존 RAG에 추가" },
      { name: "대상 RAG", type: "선택", req: true, source: "권한 보유 RAG 목록", rule: "접근 권한·유효기간 내 RAG만 선택 가능" },
      { name: "자료 파일", type: "파일 목록", req: true, source: "파일 등록 팝업", rule: "1개 이상 · 중복 파일명 제외" },
      { name: "검색 권한 · 유효기간", type: "설정", req: true, source: "신규 생성 시 필수", rule: "권한 4단계 · 기간(임의 설정 시 만료일)" },
    ],
    output: { format: "색인 요약 + 지식 항목 목록", fields: [["반영 문서 수", "색인된 자료 건수"], ["지식 항목", "추출·정리된 항목"], ["활용 위치", "시나리오 검색 단계"], ["권한/만료", "레지스트리 설정값"]] },
    checks: ["RAG 접근 권한 검증(사용=변경 권한)", "유효기간 만료 RAG 제외", "동일 이름 RAG는 자료 추가로 처리"],
    sample: ["문서 핵심 항목 추출·정리 완료", "RAG 지식 색인 반영 — 검색 단계에서 사용 가능"],
  },
  "관세 온톨로지": {
    tag: "분석지원", desc: "기업·거래·품목 중심의 관세 온톨로지·지식그래프를 구성합니다.",
    inputs: [
      { name: "대상 도메인", type: "선택", req: true, source: "기본: 기업·거래·품목", rule: "-" },
      { name: "원천 자료", type: "데이터셋", req: false, source: "CDW·업로드 자료", rule: "-" },
    ],
    output: { format: "지식그래프 요약", fields: [["엔터티", "기업/품목/거래 노드 수"], ["관계", "관계 유형별 수"], ["신규 연결", "이번 자료로 추가된 관계"]] },
    checks: ["중복 엔터티 병합 확인"],
    sample: ["엔터티 18 · 관계 32 구성 — 신규 연결 5건"],
  },
  "보고서 요약": {
    tag: "분석지원", desc: "요약 대상을 조사관용 핵심 요약으로 정리합니다.",
    inputs: [
      { name: "요약 대상", type: "문서/결과", req: true, source: "첨부문서·선행 단계 결과", rule: "-" },
      { name: "요약 길이", type: "선택", req: false, source: "기본: 보통", rule: "짧게 / 보통 / 상세" },
    ],
    output: { format: "요약 텍스트", fields: [["핵심 요지", "3~5문장"], ["주요 수치", "금액·건수 등"], ["조치 필요", "후속 확인 항목"]] },
    checks: ["원문에 없는 수치 생성 금지(환각 검증)"],
    sample: ["핵심 요지 4문장 요약 — 주요 수치 3건 포함"],
  },
  "문서 번역": {
    tag: "분석지원", desc: "첨부 문서를 지정 언어로 번역합니다.",
    inputs: [
      { name: "문서 파일", type: "파일", req: true, source: "파일 업로드", rule: "-" },
      { name: "대상 언어", type: "선택", req: true, source: "기본: 한국어", rule: "ko / en / zh / ja" },
    ],
    output: { format: "번역문 (원문 대조)", fields: [["번역문", "문단 단위 번역"], ["용어 대응", "관세 전문용어 매핑"]] },
    checks: ["숫자·고유명사 원문 일치 검증"],
    sample: ["영문 계약서 → 국문 번역 완료 (용어 매핑 12건)"],
  },
  "표준보고서 생성": {
    tag: "분석지원", desc: "입력자료를 유사사례 표준보고서 형식으로 재구성합니다.",
    inputs: [
      { name: "입력자료", type: "문서/결과", req: true, source: "업로드·선행 결과", rule: "-" },
      { name: "표준 양식", type: "선택", req: false, source: "기본: 조사보고서 양식", rule: "-" },
    ],
    output: { format: "표준양식 Markdown 보고서", fields: [["개요", "사건 요약"], ["사실관계", "근거 자료 정리"], ["판단", "적용 법령·판정"], ["조치", "권고 사항"]] },
    checks: ["표준 양식 필수 섹션 포함 검증"],
    sample: ["표준 양식 4개 섹션 구성 완료"],
  },

  /* ── 외부연계 AI 서비스 ── */
  "웹 정보수집 요청": {
    tag: "외부연계", desc: "참고 URL을 등록하고 업체·공급망·가격 변동 등 외부정보 수집을 요청합니다. 결과는 URL별 접수·진행상태로 표시됩니다.",
    inputs: [
      { name: "분석대상 기업/개인", type: "식별자", req: true, source: "조사 대상 선택", rule: "워크스페이스 자동" },
    ],
    output: { format: "수집요청 접수 보고서", fields: [["접수번호", "요청 식별자"], ["URL별 진행상태", "접수완료 → 수집 대기"], ["로그인정보", "등록 여부(PW 마스킹)"], ["예상 일정", "수집 시작·결과 회신"]] },
    checks: ["등록 URL 유효성 확인", "로그인정보 등록 여부 표시(PW 미노출)"],
    sample: ["수집요청 3건 접수 — URL 2건 수집 대기, 자동 수집범위 2종"],
  },
  "특허정보 조회": {
    tag: "외부연계", desc: "특허/로열티 거래와 과세가격 반영 여부를 확인합니다.",
    inputs: [
      { name: "특허번호/출원인", type: "텍스트", req: true, source: "직접 입력", rule: "10-YYYY-NNNNNNN 또는 출원인명" },
    ],
    output: { format: "특허·로열티 표", fields: [["특허", "번호·명칭·권리자"], ["로열티 계약", "계약·요율"], ["과세가격 반영", "신고 반영 여부"]] },
    checks: ["권리자와 거래상대방 일치 여부 대조"],
    sample: ["관련 특허 2건 — 로열티 계약 1건 신고 미반영 의심"],
  },
  "법령 검토": {
    tag: "외부연계", desc: "관련 법령·고시·판례·유권해석 근거를 검색합니다.",
    inputs: [
      { name: "검토 범위", type: "선택", req: true, source: "기본: 관세법", rule: "관세법 / FTA·협정 / 대외무역법 / 전체" },
      { name: "쟁점 키워드", type: "텍스트", req: false, source: "직접 입력", rule: "-" },
    ],
    output: { format: "근거 조문 목록", fields: [["조문", "법령·조항"], ["요지", "조문 핵심"], ["판례/해석", "관련 판례·유권해석"], ["적용 의견", "본 건 적용 가능성"]] },
    checks: ["조문 번호 실재 검증", "개정 이력(시행일) 확인"],
    sample: ["관세법 제38조 외 근거 3건 — 판례 1건 첨부"],
  },
  "주소확인": {
    tag: "외부연계", desc: "주소를 입력하면 건축물대장·지도·상권 정보를 대조해 해당 주소가 가정집(주거용)인지 상가건물(사업용)인지 확인합니다.",
    inputs: [
      { name: "확인 주소", type: "텍스트", req: true, source: "직접 입력", rule: "도로명 또는 지번 주소" },
      { name: "분석범위", type: "다중선택", req: false, source: "기본: 건물용도 판별", rule: "건물용도 판별(가정집/상가) · 사업장 실재성 확인" },
    ],
    output: { format: "주소 확인 판정 표", fields: [["판정", "가정집(주거용) / 상가건물(사업용) / 복합"], ["건물 정보", "건축물 용도·층수·규모"], ["근거", "건축물대장·지도·상권 정보 대조 결과"], ["조사 시사점", "위장 사업장·유령 주소 가능성"]] },
    checks: ["주소 형식(도로명/지번) 유효성 확인", "판정 불가 시 '확인 필요' 표기(단정 금지)"],
    sample: ["서울 금천구 가산디지털1로 951 — 상가건물(지식산업센터) 판정, 사업장 실재 가능성 높음"],
  },
  "내부메일 공유": {
    tag: "외부연계", desc: "분석결과 보고서를 지정 수신자에게 메일로 공유합니다.",
    inputs: [
      { name: "수신자 메일", type: "이메일", req: true, source: "직접 입력", rule: "name@customs.go.kr 형식 · 내부 도메인만" },
      { name: "첨부 보고서", type: "결과물", req: true, source: "선행 단계 보고서", rule: "보고서 생성 단계 선행 필요" },
    ],
    output: { format: "발송 결과", fields: [["수신자", "발송 대상"], ["상태", "발송/실패"], ["첨부", "포함 보고서"]] },
    checks: ["내부 도메인 외 수신자 차단", "첨부 크기 제한 확인"],
    sample: ["수신자 1명 발송 완료 — 보고서 1건 첨부"],
  },

  /* ── 업무지식베이스(시나리오 지식 검색 단계) ── */
  "CDW 자연어조회": {
    tag: "정형DB", desc: "자연어 질의를 해석해 CDW(관세 데이터 웨어하우스)에서 기업프로파일·통합위험정보·조사/소송 이력·수출입신고 내역을 조회합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식 (자연어 질의는 SQL로 해석·실행)" },
      { name: "분석범위", type: "다중선택", req: true, source: "기본: 전체 선택", rule: "기업프로파일조회 · 통합위험정보조회 · 조사및소송 이력조회 · 수출입신고내역조회" },
      { name: "조회 기간", type: "기간", req: false, source: "기본: 최근 36개월", rule: "1~60개월" },
    ],
    output: { format: "통합정보 요약 표", fields: [["기업프로파일", "기본정보·규모·업종"], ["통합위험정보", "위험등급·위험지표"], ["조사·소송 이력", "심사·조사·처분·소송 기록"], ["수출입신고 내역", "건수·금액·품목·상대국"]] },
    checks: ["대상 ID 존재 검증", "이력 없는 항목 '이력 없음' 표기 확인", "생성 SQL 실행 성공 여부(자연어 질의 시)"],
    sample: ["기업프로파일·위험지표·신고내역 종합 조회 완료", "조사·소송 이력 없음 — 최근 심사 기록 미존재"],
  },
  "전자통관외부정보조회": {
    tag: "정형DB", desc: "전자통관 시스템과 연계된 외부기관 자료(국세청 세적자료, 한국은행 수신자료)를 조회합니다.",
    inputs: [
      { name: "대상 기업/개인", type: "식별자", req: true, source: "시나리오·기초자료: 자동 / My AI: 직접 입력", rule: "C-#### 또는 P-#### 형식" },
      { name: "분석범위", type: "다중선택", req: true, source: "기본: 전체 선택", rule: "국세청세적자료 · 한국은행수신자료" },
    ],
    output: { format: "기관 자료별 조회 표", fields: [["국세청 세적자료", "사업자 상태·과세유형·개폐업·체납"], ["한국은행 수신자료", "외환 수신 내역·상대국·신고 외 거래 징후"], ["조사 활용 포인트", "후속 확인 항목"]] },
    checks: ["대상 ID 존재 검증", "기관 자료 미회신 항목 '자료 없음' 표기"],
    sample: ["국세청 세적자료 조회 완료 — 체납 이력 없음", "한국은행 수신자료 — 수신 상대국 3개국 확인"],
  },
  "외부기관정보수집": {
    tag: "외부연계", desc: "DART·NICE·CRETOP·KOREA PDS·KPI·KIPRIS·ORBIS·D&B 등 외부기관 사이트에서 공시·신용·시세·특허·해외기업정보를 수집합니다.",
    inputs: [
      { name: "대상 기업", type: "식별자", req: true, source: "조사 대상 선택", rule: "C-#### 형식" },
      { name: "수집 기관", type: "다중선택", req: true, source: "기본: 전체 선택", rule: "DART(공시) · BizLINE(기업분석) · CRETOP(신용) · KOREA PDS(원자재가격) · KPI(물가) · KIPRIS(특허) · ORBIS(글로벌기업) · D&B(해외기업)" },
    ],
    output: { format: "기관별 수집정보 표", fields: [["기관/URL", "수집 대상 사이트"], ["제공정보", "공시·신용·시세·특허 등"], ["확인 포인트", "검색어·확인 항목·조사 연관성"], ["우선순위", "우선 수집 순서 제안"]] },
    checks: ["기관별 URL 표기 확인", "실제 접속 결과 단정 금지(확인 계획 중심)"],
    sample: ["8개 기관 수집 포인트 정리 — DART 감사보고서 우선 확인 제안"],
  },
  "기업 프로파일 조회": {
    tag: "정형DB", desc: "기업 기본정보, 위험등급, 수입실적, 최근 신고·검사 이력을 조회합니다.",
    inputs: [
      { name: "기업 ID", type: "식별자", req: true, source: "조사 대상 선택", rule: "C-#### 형식" },
    ],
    output: { format: "프로파일 요약", fields: [["기본정보", "회사명·사업자번호·산업"], ["위험등급", "위험 수준·점수"], ["실적/이력", "수입실적·신고·검사 이력"]] },
    checks: ["기업 ID 존재 검증"],
    sample: ["기업 기본 프로파일 요약 생성"],
  },
  "관세정보RAG": {
    tag: "업무 RAG", desc: "업무규정·관세법령·사례집 기반으로 근거와 유사사례를 검색합니다.",
    inputs: [
      { name: "질의/쟁점", type: "텍스트", req: true, source: "단계 프롬프트", rule: "-" },
      { name: "검색 범위", type: "선택", req: false, source: "기본: 전체(규정·법령·사례)", rule: "-" },
    ],
    output: { format: "근거 문단 + 출처 목록", fields: [["근거", "관련 규정·조항 발췌"], ["유사사례", "사례집 매칭"], ["출처", "문서명·조항 번호"]] },
    checks: ["출처(문서명·조항) 표기 필수", "유사도 낮은 결과 제외"],
    sample: ["관세정보 근거 3건 — 출처 포함"],
  },
  "심사정보RAG": {
    tag: "업무 RAG", desc: "심사결과보고서 기반으로 유사 심사사례와 추징 포인트를 검색합니다. (심사국 한정)",
    inputs: [
      { name: "질의/쟁점", type: "텍스트", req: true, source: "단계 프롬프트", rule: "-" },
    ],
    output: { format: "유사사례 + 조사 포인트", fields: [["유사 심사사례", "사례 요약·유사도"], ["추징 포인트", "확인 항목"], ["출처", "보고서 식별자"]] },
    checks: ["심사국 권한 확인", "출처 보고서 표기"],
    sample: ["유사 심사사례 2건 — 추징 포인트 정리"],
  },
  "조사정보RAG": {
    tag: "업무 RAG", desc: "조사/수사결과보고서 기반 유사사례를 검색합니다. (조사국 한정)",
    inputs: [{ name: "질의/쟁점", type: "텍스트", req: true, source: "단계 프롬프트", rule: "-" }],
    output: { format: "유사사례 + 증빙 체크", fields: [["유사 조사사례", "사례 요약"], ["증빙 체크", "필요 증빙 목록"], ["출처", "보고서 식별자"]] },
    checks: ["조사국 권한 확인"],
    sample: ["유사 조사사례 검색 완료"],
  },
  "국제협력RAG": {
    tag: "업무 RAG", desc: "WCO 회의록·국제협력 자료에서 위험신호와 해외거래처 정보를 확인합니다.",
    inputs: [{ name: "질의/대상", type: "텍스트", req: true, source: "단계 프롬프트", rule: "-" }],
    output: { format: "위험신호 요약", fields: [["국제 위험신호", "관련 동향"], ["해외거래처", "확인 결과"], ["출처", "회의록·문서"]] },
    checks: ["출처 문서 표기"],
    sample: ["국제협력 위험신호 1건 확인"],
  },
  "상담내역 RAG": {
    tag: "업무 RAG", desc: "상담내역·민원 질의응답에서 유사 사례와 처리 흐름을 확인합니다.",
    inputs: [{ name: "질의", type: "텍스트", req: true, source: "단계 프롬프트", rule: "-" }],
    output: { format: "유사 상담사례 목록", fields: [["상담사례", "질의·답변 요약"], ["처리 흐름", "업무 처리 경로"]] },
    checks: ["개인정보 마스킹 확인"],
    sample: ["유사 상담사례 3건 정리"],
  },
  "업무특화 RAG 검색": {
    tag: "업무특화RAG", desc: "권한이 있는 업무특화 RAG에서 이번 조사와 관련된 근거·유사사례를 우선 검색합니다.",
    inputs: [
      { name: "대상 RAG", type: "선택", req: true, source: "권한 보유 RAG 목록", rule: "접근 권한·유효기간 내 RAG만 선택 가능" },
      { name: "질의", type: "텍스트", req: true, source: "단계 프롬프트(자동 생성)", rule: "-" },
    ],
    output: { format: "검색 결과 + 근거", fields: [["검색 결과", "RAG 지식 매칭 문단"], ["근거 자료", "원본 파일·항목"], ["요약", "조사 관점 핵심"]] },
    checks: ["RAG 접근 권한 검증(검색권한 기준)", "유효기간 만료 RAG 차단"],
    sample: ["업무특화 RAG 검색 — 근거 2건 요약"],
  },

  /* ── 보고서 생성 및 검증 ── */
  "보고서 생성": {
    tag: "보고서", desc: "대상 자료를 공식 조사보고서 초안으로 통합합니다.",
    inputs: [
      { name: "선행 단계 결과", type: "결과물", req: true, source: "시나리오 선행 단계", rule: "1개 이상 완료 단계 필요" },
      { name: "보고서 유형", type: "선택", req: false, source: "기본: 조사보고서", rule: "-" },
    ],
    output: { format: "Markdown 보고서", fields: [["개요", "조사 대상·목적"], ["분석 결과", "단계별 핵심 결과"], ["판단 근거", "출처 인용"], ["조치 권고", "후속 절차"]] },
    checks: ["필수 섹션 4개 포함", "인용 출처(단계·문서) 연결 확인"],
    sample: ["4개 섹션 보고서 초안 생성 — 근거 인용 8건"],
  },
  "보고서 검증": {
    tag: "보고서", desc: "근거 충실성·과도한 추론·출처(URL)를 검증합니다.",
    inputs: [
      { name: "대상 보고서", type: "결과물", req: true, source: "보고서 생성 단계", rule: "보고서 생성 선행 필요" },
    ],
    output: { format: "검증 대시보드", fields: [["근거 충실성", "점수(0~100)"], ["과도한 추론", "의심 문장 목록"], ["출처 검증", "URL·문서 유효성"], ["종합 판정", "승인 가능 / 보완 필요"]] },
    checks: ["점수 산정 기준 표기", "보완 필요 문장에 위치(섹션) 표시"],
    sample: ["근거 충실성 84점 — 보완 필요 문장 2건"],
  },
  "결과통합": {
    tag: "보고서", desc: "선행 단계 결과를 지정한 최종 형식으로 종합합니다.",
    inputs: [
      { name: "선행 결과 목록", type: "결과물", req: true, source: "시나리오 전체 단계", rule: "완료 단계만 포함" },
      { name: "최종 형식", type: "선택", req: false, source: "기본: 통합 보고서", rule: "보고서 / 요약 / 표" },
    ],
    output: { format: "통합 문서", fields: [["단계별 요약", "각 서비스 핵심 결과"], ["교차 검증", "단계 간 일치/모순"], ["종합 결론", "통합 판단"]] },
    checks: ["누락 단계 목록 표시", "모순 결과 강조 표시"],
    sample: ["6개 단계 결과 통합 — 모순 없음"],
  },
};

/* ── 서비스 설정 편집 메타 (P1 단순 설정형 · P2 검증 입력형) ─────────────────
   서비스 설정 팝업(service-config-popup.js)이 이 메타로 편집 폼을 자동 생성한다.
   키: 서비스명 → 입력값 이름(spec.inputs의 name과 일치) → 컨트롤 정의.
   메타가 없는 입력값은 '자동 연결 입력'(읽기 전용)으로 표시된다.
   control: choice(단일 선택) / multi(다중 선택) / text(형식 검증) / number(범위 검증) */
export const SERVICE_EDIT_META = {
  /* P1 — 단순 설정형 */
  "문서 번역": {
    "대상 언어": { control: "choice", def: "ko", options: [["ko", "한국어"], ["en", "영어"], ["zh", "중국어"], ["ja", "일본어"]] },
  },
  "보고서 요약": {
    "요약 길이": { control: "choice", def: "mid", options: [["short", "짧게"], ["mid", "보통"], ["long", "상세"]] },
  },
  "법령 검토": {
    "검토 범위": { control: "choice", def: "customs", options: [["customs", "관세법"], ["fta", "FTA·협정"], ["trade", "대외무역법"], ["all", "전체"]] },
    "쟁점 키워드": { control: "text", required: false, placeholder: "예: 권리사용료 가산" },
  },
  "과세가격평가": {
    "평가 방법": { control: "choice", def: "m1", options: [["m1", "거래가격 기준(1방법)"], ["m6", "합리적 기준(6방법)"], ["auto", "자동 판단"]] },
  },
  "품목분류검증": {
    "관세율표 버전": { control: "choice", def: "2026", options: [["2026", "2026"], ["2025", "2025"]] },
    "대체 후보 수": { control: "number", def: 3, min: 1, max: 10, unit: "건" },
  },
  "ML 모델 실행": {
    "모델 범위": { control: "multi", def: ["all"], options: [["all", "전체 모델"], ["industry", "동종업종 통계"], ["hs_risk", "HS 위험점수"], ["hs_rec", "품목분류 추천"], ["anomaly", "이상치 탐색"]] },
  },
  "관계망 분석": {
    "탐색 깊이": { control: "number", def: 2, min: 1, max: 3, unit: "단계" },
    "관계 유형": { control: "multi", def: ["share", "trade", "person"], options: [["share", "지분"], ["trade", "거래"], ["person", "인적관계"]] },
  },
  "표준보고서 생성": {
    "표준 양식": { control: "choice", def: "inv", options: [["inv", "조사보고서"], ["audit", "심사보고서"]] },
  },
  "결과통합": {
    "최종 형식": { control: "choice", def: "report", options: [["report", "통합 보고서"], ["summary", "요약"], ["table", "표"]] },
  },
  "위험Case검색": {
    "위험 유형": { control: "choice", def: "all", options: [["all", "전체"], ["low_price", "저가신고"], ["origin", "원산지"], ["divert", "우회수입"]] },
    "검색 기간": { control: "number", def: 36, min: 1, max: 60, unit: "개월" },
  },
  "원산지 검증": {
    "FTA 협정": { control: "choice", def: "auto", options: [["auto", "자동 판별"], ["kr_cn", "한-중"], ["kr_asean", "한-아세안"], ["kr_us", "한-미"], ["kr_eu", "한-EU"]] },
  },
  "범죄수익 추적": {
    "추적 기간": { control: "number", def: 12, min: 1, max: 36, unit: "개월" },
  },

  /* P2 — 검증 입력형 */
  // "웹 정보수집 요청"은 수집 URL·내용을 "수집 대상 URL 등록" 패널(URL 직접 등록 탭)에서 관리 — 설정 메타 중복 제거
  "특허정보 조회": {
    "특허번호/출원인": { control: "text", required: true, pattern: "^(10-\\d{4}-\\d{7}|\\D.+)$", placeholder: "예: 10-2024-0012345 또는 ABC Tech", patternMsg: "특허번호는 10-YYYY-NNNNNNN 형식, 또는 출원인명을 입력하세요" },
  },
  "내부메일 공유": {
    "수신자 메일": { control: "text", required: true, pattern: "^[\\w.+-]+@customs\\.go\\.kr$", placeholder: "name@customs.go.kr", patternMsg: "내부 도메인(@customs.go.kr) 메일만 사용할 수 있습니다" },
  },
  "주소확인": {
    "확인 주소": { control: "text", required: true, placeholder: "예: 서울 금천구 가산디지털1로 951" },
  },
  "수입신고검증": {
    "비교 기간": { control: "number", def: 24, min: 1, max: 60, unit: "개월" },
    "불일치 임계값": { control: "number", def: 15, min: 1, max: 50, unit: "%" },
  },
  "이상거래 검증": {
    "거래 기간": { control: "number", def: 24, min: 1, max: 60, unit: "개월" },
    "패턴 유형": { control: "multi", def: ["price", "party", "split"], options: [["price", "가격급변"], ["party", "상대방 변경"], ["split", "분할신고"]] },
  },
};

/* ── 3세트 UI(분석시나리오·기초자료·My AI 분석) 통합 대상 서비스 ─────────────
   서비스 하나씩 구축·검증하며 확장한다. runtimeKey는 시나리오/홈에서 쓰는 서비스 키로,
   프롬프트 템플릿(composePrompt)·홈 카드 게이팅에 사용된다.
   defaultBehaviors: 상세설정 프롬프트 템플릿 조회 시 기본 동작 조합 */
export const SERVICE_RUNTIME = {
  "CDW 자연어조회": { runtimeKey: "db_cdw", defaultBehaviors: ["profile_summary", "risk_focus", "audit_history", "declaration_focus"], defaultBehaviorLabels: ["기업프로파일조회", "통합위험정보조회", "조사및소송 이력조회", "수출입신고내역조회"] },
  "전자통관외부정보조회": { runtimeKey: "db_external", defaultBehaviors: ["nts_tax_data", "bok_receipt_data"], defaultBehaviorLabels: ["국세청세적자료", "한국은행수신자료"] },
  "외부기관정보수집": { runtimeKey: "external_agency", defaultBehaviors: ["dart", "nice_bizline", "cretop", "korea_pds", "kpi", "kipris", "orbis", "dnb"], defaultBehaviorLabels: ["금융감독원 전자공시(DART)", "NICE평가정보(BizLINE)", "한국기업데이터(CRETOP)", "코리아PDS(KOREA PDS)", "한국물가정보(KPI)", "특허정보넷(KIPRIS)", "뷰로반다익(ORBIS)", "Dun&Bradstreet(D&B)"] },
  "수입신고검증": { runtimeKey: "declaration_verify", defaultBehaviors: ["declaration_consistency", "missing_evidence"], defaultBehaviorLabels: ["신고 정합성", "누락 증빙"] },
  "품목분류검증": { runtimeKey: "hs_verify", defaultBehaviors: ["classification_check", "alternative_hs"], defaultBehaviorLabels: ["분류 적정성", "대체 HS 후보"] },
  "위험Case검색": { runtimeKey: "rag_risk_select", defaultBehaviors: ["selection_rule", "risk_signal"], defaultBehaviorLabels: ["선별기준 확인", "위험신호 정리"] },
  "원산지 검증": { runtimeKey: "origin_analysis", defaultBehaviors: ["origin_certificate", "fta_risk", "circumvention"], defaultBehaviorLabels: ["원산지증명 검토", "FTA 리스크", "우회수입 확인"] },
  "이상거래 검증": { runtimeKey: "abnormal_trade", defaultBehaviors: ["price_pattern", "counterparty_pattern", "declaration_pattern"], defaultBehaviorLabels: ["가격 패턴", "거래상대방", "신고패턴"] },
  "범죄수익 추적": { runtimeKey: "proceeds_tracking", defaultBehaviors: ["fund_flow", "account_trace", "concealment"], defaultBehaviorLabels: ["자금흐름", "계좌추적 단서", "은닉 가능성"] },
  "운송경로 분석": { runtimeKey: "route_analysis", defaultBehaviors: ["route_check", "supply_chain", "transshipment"], defaultBehaviorLabels: ["운송경로", "공급망 역추적", "우회경유"] },
  "과세가격평가": { runtimeKey: "customs_value", defaultBehaviors: ["valuation_basis", "undervaluation"], defaultBehaviorLabels: ["과세가격 근거", "저가신고 탐지"] },
  /* ── 분석지원 AI 서비스 ── */
  "ML 모델 실행": { runtimeKey: "ml", defaultBehaviors: ["all_models"], defaultBehaviorLabels: ["전체 모델 실행"] },
  "관계망 분석": { runtimeKey: "network", defaultBehaviors: ["relationship", "paper_company"], defaultBehaviorLabels: ["관계망 분석", "페이퍼컴퍼니"] },
  "범죄자금내역 추적": { runtimeKey: "fund_trace", defaultBehaviors: ["fund_flow", "transfer", "virtual_asset", "cash"], defaultBehaviorLabels: ["자금흐름내역", "계좌·송금 이체내역", "가상자산 거래내역", "현금 입출금내역"] },
  "통신내역 분석": { runtimeKey: "comms_analysis", defaultBehaviors: ["call", "sms", "sns", "messenger"], defaultBehaviorLabels: ["통화내역", "SMS", "SNS", "메신저"] },
  "OCR/문서인식": { runtimeKey: "ocr", defaultBehaviors: ["document_extract", "evidence_parse"], defaultBehaviorLabels: ["문서 항목 추출", "증빙 구조화"] },
  "업무특화RAG 분석서비스": { runtimeKey: "rag_create", defaultBehaviors: ["knowledge_build"], defaultBehaviorLabels: ["지식 생성"] },
  "관세 온톨로지": { runtimeKey: "ontology", defaultBehaviors: ["cargo_relation", "semantic_rules"], defaultBehaviorLabels: ["화물 관계 분석", "추론 규칙 생성"] },
  "보고서 요약": { runtimeKey: "summary", defaultBehaviors: ["brief"], defaultBehaviorLabels: ["핵심 요약"] },
  "문서 번역": { runtimeKey: "translate", defaultBehaviors: ["faithful"], defaultBehaviorLabels: ["원문 충실 번역"] },
  /* ── 외부연계 AI 서비스 ── */
  "웹 정보수집 요청": { runtimeKey: "web_search", defaultBehaviors: ["company_news", "supply_chain"], defaultBehaviorLabels: ["업체 기사", "공급망/가격"] },
  "특허정보 조회": { runtimeKey: "patent", defaultBehaviors: ["royalty_check", "patent_lookup"], defaultBehaviorLabels: ["로열티 확인", "특허 정보 조회"] },
  "법령 검토": { runtimeKey: "law", defaultBehaviors: ["law_basis", "precedent"], defaultBehaviorLabels: ["법령 근거", "판례/유권해석"] },
  "주소확인": { runtimeKey: "address_check", defaultBehaviors: ["building_use"], defaultBehaviorLabels: ["건물용도 판별(가정집/상가)"] },
  "내부메일 공유": { runtimeKey: "mail_share", defaultBehaviors: ["email_share"], defaultBehaviorLabels: ["이메일 공유"] },
  /* ── 보고서 생성 및 검증 ── */
  "보고서 생성": { runtimeKey: "report_generate", defaultBehaviors: ["full_report"], defaultBehaviorLabels: ["전체 보고서"] },
  "보고서 검증": { runtimeKey: "report_validate", defaultBehaviors: ["evidence_validation", "risk_review"], defaultBehaviorLabels: ["근거 검증", "리스크 리뷰"] },
  "결과통합": { runtimeKey: "result_synthesis", defaultBehaviors: ["synthesize", "final_format"], defaultBehaviorLabels: ["결과 종합", "최종 형식 적용"] },
  "통관보고서 생성": { runtimeKey: "rag_trade", defaultBehaviors: ["trade_signal", "market_context"], defaultBehaviorLabels: ["무역 징후 확인", "시장 맥락 확인"] },
  "표준보고서 생성": { runtimeKey: "report_standard", defaultBehaviors: ["match_template", "fill_sections"], defaultBehaviorLabels: ["템플릿 형식 적용", "섹션별 채움"] },
};
export function serviceRuntimeOf(displayName){
  const { key } = findServiceSpec(displayName);
  return key ? (SERVICE_RUNTIME[key] || null) : null;
}

/* 표시명 별칭: 업로드 표에는 "문서 요약 agent" 등 변형 표기가 존재 */
const ALIASES = {
  "CDW 조회": "CDW 자연어조회",           // 구 표기(레거시 시나리오·아카이브)
  "전자통관통합정보조회": "CDW 자연어조회", // 구 표기(중간 개편명)
  "CDW 자연어 분석": "CDW 자연어조회",     // 구 표기(3세트 초기명)
  "문서 요약": "보고서 요약",
  "특허정보조회": "특허정보 조회",
  "수입신고검증 AI 서비스": "수입신고검증",
  "품목분류검증 AI 서비스": "품목분류검증",
  "위험Case 분석": "위험Case검색",       // 시나리오 템플릿 표기
  "위험Case검색 서비스": "위험Case검색",  // 레지스트리 표기
  "자금흐름 관계분석": "범죄자금내역 추적",       // 시나리오 템플릿 표기(fund_trace)
  "통신내역 관계분석": "통신내역 분석",           // 시나리오 템플릿 표기(comms_analysis)
  "통신내역 AI 분석 서비스": "통신내역 분석",     // 레지스트리 표기
  "범죄자금내역 추적 AI 서비스": "범죄자금내역 추적",
  "결과통합 AI서비스": "결과통합",                // 레지스트리 표기(붙임 표기)
  "주소확인 AI 서비스": "주소확인",               // 레지스트리 표기
};

/* 공백 무시 매칭 인덱스: "관세정보 RAG" ↔ "관세정보RAG" 같은 표기 변형을 흡수 */
let _compactIndex = null;
function compactIndex(){
  if(!_compactIndex){
    _compactIndex = {};
    Object.keys(SERVICE_SPECS).forEach(key => { _compactIndex[key.replace(/\s+/g, "")] = key; });
    Object.entries(ALIASES).forEach(([alias, key]) => { _compactIndex[alias.replace(/\s+/g, "")] = key; });
  }
  return _compactIndex;
}

/* 표시명("수입신고검증 agent", "관세정보 RAG" 등)에서 스펙을 찾는다.
   key: 스펙 레지스트리의 정식 키(별칭·표기 변형이 정규화된 값) — 설정 저장 키로도 사용 */
export function findServiceSpec(displayName){
  const base = String(displayName || "").replace(/\s*(agent|AI 서비스)\s*$/i, "").trim();
  const key = SERVICE_SPECS[base] ? base : (ALIASES[base] || compactIndex()[base.replace(/\s+/g, "")]);
  return key ? { name: base, key, spec: SERVICE_SPECS[key] } : { name: base, key: null, spec: null };
}
