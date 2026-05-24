"""Agent: 품목분류검증 — 수입신고 HS 코드를 타사 실적·원산지·신고가와 비교하고
오분류·FTA 탈루 가능성을 LLM으로 심층 분석한다.

이상 탐지 기준
--------------
1. status IN (REVIEW, INSPECT, HOLD)   — 관세청 검토·조사 대상
2. 원산지 불일치  — 동일 HS 코드 타사 주요 원산지와 상이
3. 신고가 이상    — 타사 평균 대비 40% 미만 또는 200% 초과
"""
import duckdb

from src.agents.state import CustomsState
from src.agents.scope import has_company_scope, no_company_result
from src.config import CFG
from src.llm import llm
from src.paths import DB_PATH

# ── HS 코드 참조 데이터 (DB 실제 사용 37개 커버) ───────────────────────────────
_HS_RULES: dict[str, dict] = {
    # ── 농축수산물 ──────────────────────────────────────────────────────────────
    "0202.30": {
        "name": "냉동 쇠고기 (뼈 없는 것)",
        "common_errors": ["0201.30 냉장 쇠고기로 오분류", "0202.20 뼈 있는 냉동 쇠고기로 오분류"],
        "key_point": "냉동/냉장 구분, 뼈 포함 여부가 세번 결정. 검역 증명서 필수.",
        "duty_rate": "40%",
        "fta_notes": "한-호주 FTA: 0% / 한-미 FTA: 0%",
        "origin_check": "호주·미국산 FTA C/O 발급 기관 적정성 및 직접운송 요건 확인",
    },
    "0306.17": {
        "name": "냉동 새우 (기타)",
        "common_errors": ["0306.16 냉동 팬더새우로 오분류", "0306.15 냉동 랍스터로 오분류"],
        "key_point": "새우 종류(흰새우·블랙타이거)에 따라 소호 구분. 양식/천연 구분 무관.",
        "duty_rate": "20%",
        "fta_notes": "한-칠레 FTA: 0%",
        "origin_check": "칠레산 FTA 적용 시 직접운송 요건 및 C/O 진위 확인",
    },
    "0811.90": {
        "name": "냉동 과실·견과류 (기타)",
        "common_errors": ["0811.20 냉동 나무딸기류로 오분류", "2007.99 과일 잼·퓨레로 오분류"],
        "key_point": "가당 여부(설탕 첨가 여부)로 세번 분기. 무가당 냉동 과일이 원칙.",
        "duty_rate": "30%",
        "fta_notes": "한-페루 FTA: 0%",
        "origin_check": "페루산 냉동 망고 직접운송 및 원산지 기준(WO) 확인",
    },
    # ── 식품·음료 ───────────────────────────────────────────────────────────────
    "2008.99": {
        "name": "조제·보존처리 과실 (기타)",
        "common_errors": ["2009.89 과즙으로 오분류", "2007.99 잼으로 오분류"],
        "key_point": "조제 방법(당절임·건조·냉동)에 따라 분류 달라짐. 설탕 함량·처리 공정 확인.",
        "duty_rate": "45%",
        "fta_notes": "한-아세안 FTA: 태국산 → 원산지 충족 시 감면 가능",
        "origin_check": "태국산 열대과일 가공품 WO 또는 CTH 원산지 기준 검토",
    },
    "2106.90": {
        "name": "조제 식품 (기타, 소스 베이스)",
        "common_errors": ["2103.90 기타 혼합 조미료로 오분류", "2104.10 수프·부용으로 오분류"],
        "key_point": "최종 용도(소스 원료 vs 완제품 소스)에 따라 2103↔2106 구분. BOM 필수.",
        "duty_rate": "8%",
        "fta_notes": "한-아세안 FTA: 원산지 충족 시 감면",
        "origin_check": "태국산 소스 베이스 — 가공 공정 및 원재료 원산지 비율 확인",
    },
    # ── 에너지·광물 ─────────────────────────────────────────────────────────────
    "2709.00": {
        "name": "원유 (미정제 석유·역청유)",
        "common_errors": ["2710.19 정제유·윤활유로 오분류", "2713.20 석유 코크스로 오분류"],
        "key_point": "미정제 원유 여부가 관건. API 중력·황 함유량 성분분석서(ASSAY) 첨부 필수.",
        "duty_rate": "3%",
        "fta_notes": "한-GCC FTA(사우디·UAE·쿠웨이트 등): 0%",
        "origin_check": "GCC 산유국 C/O 발급 기관 적정성 및 ASSAY 보고서 원본 대조",
    },
    "2710.19": {
        "name": "기타 석유 제품 (윤활유·경유류)",
        "common_errors": ["2709.00 원유로 오분류", "3403.19 윤활 조제품으로 오분류"],
        "key_point": "비중·점도·용도(연료용/윤활용)로 세번 확정. 배합 비율도 중요.",
        "duty_rate": "3~5%",
        "fta_notes": "한-GCC FTA 적용 가능",
        "origin_check": "UAE·GCC산 윤활유 FTA 적용 시 최소 가공 기준 충족 확인",
    },
    # ── 화학 ────────────────────────────────────────────────────────────────────
    "2917.36": {
        "name": "테레프탈산 (TPA)",
        "common_errors": ["2917.39 기타 방향족 다가카르복시산으로 오분류"],
        "key_point": "순도 99% 이상 공업용 TPA 기준. 벤젠 유래 방향족 화합물 세번 확정.",
        "duty_rate": "6.5%",
        "fta_notes": "한-아세안 FTA: 인도네시아산 CTH 충족 시 0%",
        "origin_check": "인도네시아산 TPA — 최종 공정국(원산지) 및 CTH 기준 충족 여부",
    },
    "3002.15": {
        "name": "진단용 항체·면역 제제",
        "common_errors": ["3822.19 실험실 시약으로 오분류", "3002.90 기타 혈액 분획으로 오분류"],
        "key_point": "체외 진단용 vs 치료용 구분 중요. 용도에 따라 3002↔3822 분기.",
        "duty_rate": "0%",
        "fta_notes": "한-스위스(EU) FTA: 0%",
        "origin_check": "스위스산 바이오의약품 세번변경 원산지 기준 및 허가 번호 일치 여부",
    },
    "3206.11": {
        "name": "이산화티타늄 안료 (TiO₂, 80% 이상)",
        "common_errors": ["3206.19 기타 이산화티타늄으로 오분류", "2823.00 산화티타늄(광물)으로 오분류"],
        "key_point": "TiO₂ 함량 80% 이상 기준으로 3206.11 확정. 도료용/플라스틱용 구분.",
        "duty_rate": "6.5%",
        "fta_notes": "한-아세안 FTA: 베트남산 RVC 충족 시 0%",
        "origin_check": "베트남산 TiO₂ 안료 — 제조공정 실질변형(CTH·RVC) 및 순도 분석서 확인",
    },
    "3304.99": {
        "name": "기초 화장품·미용제품 (기타)",
        "common_errors": ["3305.10 샴푸로 오분류", "3307.90 기타 미용제품으로 오분류"],
        "key_point": "피부용·모발용·구강용 구분. 기능성 화장품 성분 함량 확인.",
        "duty_rate": "6.5~8%",
        "fta_notes": "한-중 FTA: 원산지 기준 충족 시 감면",
        "origin_check": "중국산 화장품 OEM 여부, 상표권 사용료 과세가격 가산 여부",
    },
    "3822.19": {
        "name": "실험실 진단·분석 시약 (기타)",
        "common_errors": ["3002.15 항체 진단 시약으로 오분류", "3821.00 배양 배지로 오분류"],
        "key_point": "체외진단 의료기기와 일반 시약 구분. 구성 성분과 용도 명확히.",
        "duty_rate": "0%",
        "fta_notes": "한-미 FTA: 0%",
        "origin_check": "미국산 시약 FTA 원산지 기준 — 제조·성분 혼합 공정 국가 확인",
    },
    "3901.20": {
        "name": "폴리에틸렌 수지 (LLDPE·LDPE, 비중 0.94 미만)",
        "common_errors": ["3901.10 HDPE(고밀도)로 오분류", "3902.10 폴리프로필렌으로 오분류"],
        "key_point": "밀도(비중) 0.94 기준으로 LLDPE(3901.20)↔HDPE(3901.10) 구분.",
        "duty_rate": "6.5%",
        "fta_notes": "한-싱가포르 FTA: 0%",
        "origin_check": "싱가포르 경유 수입 — 실질 원산지(석유화학 단지 소재국) 확인 필수",
    },
    "3907.61": {
        "name": "PET 수지 (폴리에틸렌 테레프탈레이트, 비재활용)",
        "common_errors": ["3907.69 기타 폴리에스터로 오분류", "3907.91 재활용 PET 수지로 오분류"],
        "key_point": "고유점도(IV) 수치와 용도(섬유용·병용·필름용)로 소호 구분. IV 0.72dl/g 기준.",
        "duty_rate": "6.5%",
        "fta_notes": "한-중 FTA: 0%",
        "origin_check": "중국산 PET 수지 — RVC 40% 또는 CTH 원산지 기준 충족 여부 및 IV 시험성적서",
    },
    "3926.90": {
        "name": "기타 플라스틱 제품",
        "common_errors": ["3923.29 포장용 플라스틱 용기로 오분류", "4016.99 고무 제품으로 오분류"],
        "key_point": "용도·재질이 세번 결정. 플라스틱 성형품 최종 용도 명확히.",
        "duty_rate": "8%",
        "fta_notes": "한-중 FTA / 한-아세안 FTA: 원산지 충족 시 감면",
        "origin_check": "중국·싱가포르산 플라스틱 부품 — 성형 공정 실질변형 해당 여부 확인",
    },
    # ── 섬유·의류 ───────────────────────────────────────────────────────────────
    "4011.10": {
        "name": "승용차용 신품 타이어 (고무)",
        "common_errors": ["4012.11 재생 타이어로 오분류", "4011.20 버스·화물차용 타이어로 오분류"],
        "key_point": "승용차(15인승 이하) 전용 여부. 치수 코드(림 직경) 기준 소호 결정.",
        "duty_rate": "8%",
        "fta_notes": "한-아세안 FTA: 태국산 CTH 충족 시 감면",
        "origin_check": "태국산 타이어 — 고무 원재료 원산지 및 가공 공정 CTH 충족 여부",
    },
    "4202.92": {
        "name": "합성섬유 가방 (기타)",
        "common_errors": ["6307.90 기타 섬유 제품으로 오분류", "3926.90 플라스틱 제품으로 오분류"],
        "key_point": "외면 재질이 세번 결정. 섬유 직물 외면이면 4202.92.",
        "duty_rate": "10~13%",
        "fta_notes": "홍콩산 — FTA 미체결, 일반세율 적용",
        "origin_check": "홍콩 경유 가방 — 실질 제조국(중국·베트남) 확인, 홍콩 원산지 주장 시 실질변형 근거 요구",
    },
    "5208.52": {
        "name": "면직물 (날염, 중량 200g/m² 이하)",
        "common_errors": ["5210.52 혼방 직물로 오분류", "5212.25 기타 면직물로 오분류"],
        "key_point": "면 함량 85% 이상 기준. 날염 여부 및 중량(g/m²)이 소호 결정.",
        "duty_rate": "10%",
        "fta_notes": "방글라데시 LDC 특혜관세 적용 가능",
        "origin_check": "방글라데시산 직물 — LDC C/O 발급 기관 적정성, 원산지 허위신고 주의",
    },
    "5407.52": {
        "name": "합성섬유 필라멘트 직물 (날염)",
        "common_errors": ["5407.42 염색 직물로 오분류", "5407.72 혼방 직물로 오분류"],
        "key_point": "필라멘트 원사 85% 이상, 날염 여부로 확정. 중량 측정 필수.",
        "duty_rate": "10%",
        "fta_notes": "한-아세안 FTA: 캄보디아산 CTH 충족 시 감면",
        "origin_check": "캄보디아산 합성섬유 직물 — 원사 수입국(주로 중국) 확인, 단순 제직이 CTH 충족인지 검토",
    },
    "6109.10": {
        "name": "면 T셔츠·싱글렛 (메리야스·편물제)",
        "common_errors": ["6110.20 면 풀오버·스웨트셔츠로 오분류", "6109.90 혼방 T셔츠로 오분류"],
        "key_point": "면 함량 80% 이상 기준. 편물 조직(메리야스) 확인.",
        "duty_rate": "13%",
        "fta_notes": "한-베트남 FTA: 0% (Yarn-Forward 조건)",
        "origin_check": "베트남·중국산 면 T셔츠 — Yarn-Forward: 역내산 원사 사용 여부, 중국산 원사 혼용 시 FTA 배제",
    },
    "6204.62": {
        "name": "여성용 면바지·반바지 (직물제)",
        "common_errors": ["6203.42 남성용 면바지로 오분류", "6204.69 혼방 바지로 오분류"],
        "key_point": "성별·재질·직물/편물 구분 필수. 면 함량 80% 이상.",
        "duty_rate": "13%",
        "fta_notes": "방글라데시 LDC 특혜 적용",
        "origin_check": "방글라데시산 의류 — LDC 특혜 CTH 기준 및 C/O 발급 기관 적정성",
    },
    "6211.43": {
        "name": "여성용 스포츠 의류 (합성섬유, 직물제)",
        "common_errors": ["6211.42 면 스포츠 의류로 오분류", "6114.30 합성섬유 편물 의류로 오분류"],
        "key_point": "합성섬유 85% 이상 및 용도(스포츠·트레이닝)로 확정. 편물·직물 구분.",
        "duty_rate": "13%",
        "fta_notes": "한-베트남 FTA: 0% (Yarn-Forward 조건)",
        "origin_check": "베트남산 스포츠 의류 — 합성섬유 원사 역내산 여부, 중국산 원사 혼용 시 FTA 배제 위험",
    },
    "6404.11": {
        "name": "운동화 (외창 고무·플라스틱, 갑피 섬유)",
        "common_errors": ["6402.99 갑피 합성피혁 운동화로 오분류", "6405.20 기타 신발로 오분류"],
        "key_point": "갑피 재질(섬유 vs 합성피혁)과 외창 재질(고무·플라스틱 vs EVA)로 세번 확정.",
        "duty_rate": "13%",
        "fta_notes": "한-베트남 FTA: 0%",
        "origin_check": "베트남산 운동화 FTA 원산지 기준(CTH) — 갑피·창 부품 원산지 확인",
    },
    # ── 전기·전자 ───────────────────────────────────────────────────────────────
    "8419.89": {
        "name": "기타 가열·냉각 장비 (산업용 배양기 등)",
        "common_errors": ["8514.10 저항 가열 노로 오분류", "9018.90 의료용 기기로 오분류"],
        "key_point": "열 처리 목적(가열·냉각·건조)과 산업용/의료용 구분. 배양기는 8419.89.",
        "duty_rate": "0%",
        "fta_notes": "한-EU FTA: 독일산 0%",
        "origin_check": "독일산 배양 장비 — EU FTA 원산지 기준(충분가공·품목별 기준) 검토",
    },
    "8504.40": {
        "name": "정지형 변환기 (전원공급장치·인버터)",
        "common_errors": ["8504.31 변압기로 오분류", "8543.70 기타 전기기기로 오분류", "8517.62 무선통신 장치로 오분류"],
        "key_point": "본질 기능이 전력 변환(AC→DC·DC→AC)인지 확인. 통신 제어 기능 포함 시 8517 분류 가능성.",
        "duty_rate": "0%",
        "fta_notes": "한-미 FTA: 0% / 한-아세안 FTA: 말레이시아·미국산 0%",
        "origin_check": "말레이시아·미국산 전원공급장치 — FTA 원산지 기준(CTH·부가가치) 및 전자부품 원산지 확인",
    },
    "8507.60": {
        "name": "리튬이온 배터리 팩",
        "common_errors": ["8507.80 기타 배터리로 오분류", "8507.10 납산 배터리로 오분류"],
        "key_point": "셀 구성·정격전압·용량이 세번 결정. 팩 조립국이 원산지인지 셀 제조국인지 중요.",
        "duty_rate": "0%",
        "fta_notes": "한-중 FTA: 0% (셀 원산지 기준 포함)",
        "origin_check": "중국산 배터리 팩 — 셀 가격 비율 60% 초과 시 셀 제조국 기준 적용 가능성",
    },
    "8517.62": {
        "name": "무선통신 기기 (수신·송수신 장치)",
        "common_errors": ["8525.60 방송용 송신기로 오분류", "8471.70 기억장치로 오분류"],
        "key_point": "무선통신 방식(WiFi·5G·BT)과 주요 기능 확인. 복합 기능 제품 세번 판정 복잡.",
        "duty_rate": "0%",
        "fta_notes": "ITA 협정 대상: 무관세",
        "origin_check": "중국산 무선통신기기 — 통신 칩 원산지 및 회로 설계 국가 확인",
    },
    "8534.00": {
        "name": "인쇄회로기판 (PCB·PCBA)",
        "common_errors": ["8542.31 IC로 오분류", "8538.90 전기기기 부품으로 오분류"],
        "key_point": "부품 실장 여부(PCB vs PCBA) 및 완성품/반제품 구분.",
        "duty_rate": "0%",
        "fta_notes": "ITA 대상 0% / 한-중 FTA 적용 가능",
        "origin_check": "중국산 PCB — 패턴 설계국 vs 제조국 구분, 단순 라미네이팅이 실질변형 해당 여부",
    },
    "8536.50": {
        "name": "전자 스위치·릴레이 (전압 1kV 이하)",
        "common_errors": ["8535.90 전압 1kV 초과 스위치로 오분류", "8516.80 가전용 스위치로 오분류"],
        "key_point": "작동 전압 1kV 이하 기준. 전자식 vs 기계식 구분.",
        "duty_rate": "0%",
        "fta_notes": "한-일본 FTA 미체결 → 일반세율 적용",
        "origin_check": "일본산 전자 스위치 — FTA 없음, 일반 관세 정확 납부 및 덤핑 마진 여부 확인",
    },
    "8541.29": {
        "name": "트랜지스터 (소산전력 1W 이상)",
        "common_errors": ["8541.21 소산전력 1W 미만 트랜지스터로 오분류", "8542.31 IC로 오분류"],
        "key_point": "소산전력 1W 기준으로 8541.21↔8541.29 구분. 단일 소자 vs 집적화.",
        "duty_rate": "0%",
        "fta_notes": "한-일본 FTA 미체결, ITA 대상",
        "origin_check": "일본산 트랜지스터 — ITA 협정 적용 가능성 및 데이터 시트 원산지 증빙",
    },
    "8542.31": {
        "name": "마이크로프로세서·컨트롤러 IC",
        "common_errors": ["8542.39 기타 IC로 오분류", "8471.50 처리장치로 오분류"],
        "key_point": "단독 프로세서 칩인지 복합 모듈인지 구분. BOM·사양서 필수.",
        "duty_rate": "0%",
        "fta_notes": "ITA 협정: 0% (한-대만 공식 FTA 없음)",
        "origin_check": "대만산 IC — 웨이퍼 가공국(팹 위치)이 원산지, 단순 패키징은 원산지 불인정",
    },
    "8542.39": {
        "name": "기타 집적회로 (칩셋·로직 IC)",
        "common_errors": ["8542.31 마이크로프로세서로 오분류", "8534.00 PCB로 오분류"],
        "key_point": "칩셋 기능(통신·그래픽·전력관리)으로 구분. 단일칩 vs 모듈 구분.",
        "duty_rate": "0%",
        "fta_notes": "ITA 협정 대상, 대만산 무관세",
        "origin_check": "대만산 칩셋 — 팹 소재국(TSMC·UMC) 확인, 위탁생산 시 팹 국가가 원산지",
    },
    # ── 자동차 부품 ─────────────────────────────────────────────────────────────
    "8708.40": {
        "name": "자동차 변속기 부품",
        "common_errors": ["8708.99 기타 자동차 부품으로 오분류", "8483.40 기어박스로 오분류"],
        "key_point": "변속기 완성품 vs 부품(기어·샤프트·케이스) 구분. 완성품이면 8708.40.",
        "duty_rate": "8%",
        "fta_notes": "한-멕시코 FTA: 원산지 충족 시 감면",
        "origin_check": "멕시코산 변속기 부품 — FTA CTH·RVC 30% 충족 및 미국산 부품 혼입 비율 확인",
    },
    "8708.99": {
        "name": "기타 자동차 차체·부품",
        "common_errors": ["8708.29 자동차 유리·판넬로 오분류", "7326.90 기타 철강 가공품으로 오분류"],
        "key_point": "전용 자동차 부품인지 범용 철강 부품인지가 세번 결정. 차종 특정 여부.",
        "duty_rate": "8%",
        "fta_notes": "한-멕시코 FTA 적용 가능",
        "origin_check": "멕시코산 차체부품 — OEM 거래 이전가격 적정성 및 FTA 원산지 기준 검토",
    },
    # ── 의료·정밀기기 ────────────────────────────────────────────────────────────
    "9018.90": {
        "name": "의료용 기기·소모품 (기타)",
        "common_errors": ["3822.19 실험실 시약으로 오분류", "9019.10 재활 치료 기기로 오분류"],
        "key_point": "의료기기 여부(식약처 허가) 기준. 연구용 vs 의료용 구분.",
        "duty_rate": "0%",
        "fta_notes": "한-싱가포르 FTA: 0%",
        "origin_check": "싱가포르산 의료 소모품 — FTA 원산지 기준 및 식약처 허가 번호 일치 여부",
    },
    "9032.89": {
        "name": "자동 조절·제어 기기 (기타, 차량용 센서)",
        "common_errors": ["8543.70 기타 전기기기로 오분류", "9026.80 측정 기기로 오분류"],
        "key_point": "측정 vs 제어 기능 구분. 자동조절 목적이 본질이면 9032.",
        "duty_rate": "0%",
        "fta_notes": "한-EU FTA: 독일산 0%",
        "origin_check": "독일산 차량 제어센서 — EU FTA 원산지 기준(CTH·부가가치 45%) 충족 여부",
    },
    "9503.00": {
        "name": "완구류·축소 모형 (기타)",
        "common_errors": ["9504.50 비디오게임기로 오분류", "9508.10 놀이기구로 오분류"],
        "key_point": "어린이 전용 완구 기준. 전자기능 포함 완구는 9503 유지 여부 확인.",
        "duty_rate": "8%",
        "fta_notes": "한-일본 FTA 미체결 → 일반세율",
        "origin_check": "일본산 완구 — 국내 생산 여부, 해외 위탁생산 시 실질 제조국 원산지 적용",
    },
}

# HS 코드 미등록 시 기본값
_DEFAULT_RULE = {
    "name": "기타 품목",
    "common_errors": [],
    "key_point": "품명·규격·기능을 기반으로 주요 재질과 본질적 특성을 확인하세요.",
    "duty_rate": "해당 없음",
    "fta_notes": "해당 없음",
    "origin_check": "원산지 증명서 발급기관 적정성 및 원재료 구성 내역 확인",
}

# 이상 탐지 임계값 (thresholds.yaml: hs_verify 섹션)
_PRICE_LOW_RATIO  = CFG.hs_verify.price_low_ratio    # 타사 평균 대비 저가 비율
_PRICE_HIGH_RATIO = CFG.hs_verify.price_high_ratio   # 타사 평균 대비 고가 비율
_ISSUE_STATUSES   = {"REVIEW", "INSPECT", "HOLD"}

_LLM_PROMPT = """당신은 관세청 품목분류 및 원산지 검증 전문 조사관입니다.
아래 DB 기반 품목분류 검증 결과를 분석하여 관세 조사 관점의 위험을 평가하세요.

분석 항목:
1. 오분류 위험: 신고 HS 코드의 적정성, 오분류 시 세율 차이·탈루 규모 추정
2. 원산지 적정성: 실질 변형 기준 충족 여부, FTA 혜택 적정성 및 C/O 진위
3. 타사 비교: 동일 품목 주요 원산지 및 신고가 범위와의 일치 여부
4. 세율 영향: 오분류·원산지 오류 시 추가 납부 세액 추정 방향
5. 필요 서류: 품목분류 확정을 위해 우선 확보할 서류 목록

[품목분류 검증 데이터]
{hs_raw}

관세법 제86조(품목분류 적용기준), FTA 특례법, 관세법 제23조(특수관계)를 인용하여
간결하고 실무적으로 작성하세요.
"""


# ── 이상 탐지 헬퍼 ─────────────────────────────────────────────────────────────

def _detect_issues(
    row_status: str,
    declared_value: float,
    origin: str,
    peer_avg: float,
    peer_min: float,
    peer_max: float,
    peer_top_origin: str,
) -> tuple[bool, list[str]]:
    """개별 HS 신고건의 이상 여부와 사유를 반환한다."""
    flags: list[str] = []

    if row_status in _ISSUE_STATUSES:
        label = {"REVIEW": "검토", "INSPECT": "조사", "HOLD": "보류"}[row_status]
        flags.append(f"관세청 {label} 지정 상태")

    if peer_avg > 0:
        ratio = declared_value / peer_avg
        if ratio < _PRICE_LOW_RATIO:
            flags.append(
                f"신고가 {declared_value/1e8:.1f}억 — 타사 평균({peer_avg/1e8:.1f}억) 대비 "
                f"{ratio:.0%} 수준, 저가 신고 의심"
            )
        elif ratio > _PRICE_HIGH_RATIO:
            flags.append(
                f"신고가 {declared_value/1e8:.1f}억 — 타사 평균({peer_avg/1e8:.1f}억) 대비 "
                f"{ratio:.0%} 수준, 고가 신고 확인 필요"
            )

    if origin and peer_top_origin and origin != peer_top_origin:
        flags.append(
            f"신고 원산지({origin}) — 타사 주요 원산지({peer_top_origin})와 상이"
        )

    return bool(flags), flags


# ── 에이전트 ───────────────────────────────────────────────────────────────────

def agent_hs_verify(state: CustomsState) -> CustomsState:
    """수입신고 HS 코드와 원산지를 검증하고 오분류·FTA 탈루 가능성을 도출한다."""
    if not has_company_scope(state):
        return {**state, "hs_verify_result": no_company_result("품목분류검증")}

    company_id = state["company_id"]
    print(f"\n[Agent] 품목분류검증 시작: {company_id}")

    with duckdb.connect(str(DB_PATH), read_only=True) as conn:
        # ── 기업 수입신고 ─────────────────────────────────────────────────────
        decl = conn.execute(
            """SELECT declaration_no, hs_code, item_name, declared_value,
                      origin_country, status
               FROM import_declarations
               WHERE company_id = ?
               ORDER BY import_date DESC""",
            [company_id],
        ).df()

        if decl.empty:
            return {**state, "hs_verify_result": "[품목분류검증] 수입신고 데이터 없음"}

        hs_list = list(decl["hs_code"].unique())

        # ── 타사 동일 HS 원산지 분포 ─────────────────────────────────────────
        peer_origins = conn.execute(
            f"""SELECT hs_code, origin_country, COUNT(*) AS cnt
                FROM import_declarations
                WHERE hs_code IN ({','.join(['?']*len(hs_list))})
                  AND company_id != ?
                GROUP BY hs_code, origin_country
                ORDER BY hs_code, cnt DESC""",
            hs_list + [company_id],
        ).df()

        # ── 타사 동일 HS 신고가 통계 ─────────────────────────────────────────
        peer_stats = conn.execute(
            f"""SELECT hs_code,
                       AVG(declared_value)  AS avg_val,
                       MIN(declared_value)  AS min_val,
                       MAX(declared_value)  AS max_val,
                       COUNT(*)             AS cnt
                FROM import_declarations
                WHERE hs_code IN ({','.join(['?']*len(hs_list))})
                  AND company_id != ?
                GROUP BY hs_code""",
            hs_list + [company_id],
        ).df()

    # ── 보고서 생성 ───────────────────────────────────────────────────────────
    lines = [
        "[품목분류검증 결과]",
        f"대상 기업: {company_id}  |  검증 신고 건수: {len(decl)}건  |  HS 종류: {len(hs_list)}개",
        "",
    ]

    all_issues: list[str] = []
    hs_seen: set[str] = set()

    for _, row in decl.iterrows():
        hs     = str(row["hs_code"])
        origin = str(row.get("origin_country") or "")
        status = str(row.get("status") or "NORMAL")
        value  = float(row.get("declared_value") or 0)

        if hs in hs_seen:
            continue
        hs_seen.add(hs)

        rule = _HS_RULES.get(hs, _DEFAULT_RULE)

        # 타사 통계 조회
        ps_row = peer_stats[peer_stats["hs_code"] == hs]
        peer_avg = float(ps_row.iloc[0]["avg_val"]) if not ps_row.empty else 0.0
        peer_min = float(ps_row.iloc[0]["min_val"]) if not ps_row.empty else 0.0
        peer_max = float(ps_row.iloc[0]["max_val"]) if not ps_row.empty else 0.0

        # 타사 주요 원산지
        po_rows = peer_origins[peer_origins["hs_code"] == hs]
        peer_top_origin = str(po_rows.iloc[0]["origin_country"]) if not po_rows.empty else ""

        # 이상 탐지
        has_issue, issue_flags = _detect_issues(
            row_status=status, declared_value=value, origin=origin,
            peer_avg=peer_avg, peer_min=peer_min, peer_max=peer_max,
            peer_top_origin=peer_top_origin,
        )

        icon = "⚠️" if has_issue else "✅"
        lines.append(f"■ {icon} HS {hs} — {row['item_name']}")
        lines.append(f"  품목명: {rule['name']}")
        lines.append(f"  관세율: {rule['duty_rate']}  |  FTA: {rule['fta_notes']}")
        lines.append(f"  검토 포인트: {rule['key_point']}")
        lines.append(f"  원산지 확인: {rule['origin_check']}")
        if rule.get("common_errors"):
            lines.append(f"  자주 발생 오분류: {', '.join(rule['common_errors'])}")

        # 신고 정보
        lines.append(f"  신고 현황: 원산지={origin}  |  신고가={value/1e8:.1f}억원  |  상태={status}")

        # 타사 비교
        if peer_avg > 0:
            lines.append(
                f"  타사 신고가: 평균 {peer_avg/1e8:.1f}억 "
                f"(범위 {peer_min/1e8:.1f}~{peer_max/1e8:.1f}억, {int(ps_row.iloc[0]['cnt'])}건)"
            )
        if not po_rows.empty:
            top3 = ", ".join(
                f"{r['origin_country']}({int(r['cnt'])}건)"
                for _, r in po_rows.head(3).iterrows()
            )
            lines.append(f"  타사 주요 원산지: {top3}")

        # 이상 징후
        if issue_flags:
            for f in issue_flags:
                lines.append(f"  ⚠️ {f}")
            all_issues.append(hs)

        lines.append("")

    # ── 종합 판정 ─────────────────────────────────────────────────────────────
    if all_issues:
        lines.append(f"[종합] 검토 필요 HS 코드: {', '.join(all_issues)}")
        lines.append("→ 사양서·BOM·원산지증명서·계약서를 우선 확보하여 정밀 재검토를 권장합니다.")
    else:
        lines.append("[종합] 신고 HS 코드 이상 징후 없음 — 원산지 증명서 주기적 검토 권장")

    hs_raw = "\n".join(lines)

    # ── LLM 심층 분석 ─────────────────────────────────────────────────────────
    if llm:
        try:
            analysis = llm.invoke(
                _LLM_PROMPT.format(hs_raw=hs_raw[:5000])
            ).content
            hs_verify_result = hs_raw + "\n\n[AI 품목분류 심층 분석]\n" + analysis
        except Exception as exc:
            print(f"[Agent] 품목분류검증 LLM 실패: {exc}")
            hs_verify_result = hs_raw
    else:
        hs_verify_result = hs_raw

    print("[Agent] 품목분류검증 완료")
    return {**state, "hs_verify_result": hs_verify_result}
