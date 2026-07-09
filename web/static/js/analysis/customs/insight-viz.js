/* 관세조사 "수사정보 분석" — 분석 관점별(A~E) 시각화 결과 예시(HTML/SVG).
   중앙 "AI정보분석 시각화 결과" 영역에서 관점 탭 선택 시 해당 예시를 표시한다.
   데모 데이터 기반 정적 시안이며, 조사 대상 기업명·ID만 현재 대상으로 치환한다.
   스타일 토큰(s-·t- 접두 클래스)은 styles.css의 .ci-insight-viz 스코프에 정의. */
import { escapeHtml } from "../../core/dom.js";

/* A. 신고·물품 정합성 분석 — 신고 대사·검증 + 적정성 게이지 + 불일치 알림 */
function vizA(name, cid){
  return `
    <svg viewBox="0 0 960 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="신고-증빙 대사 검증 표와 적정성 게이지">
      <rect x="12" y="10" width="620" height="300" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="28" y="36" class="t-head s-ink">신고 대사·검증 — DV2-${cid}-07 (수리 2026-05-14)</text>
      <rect x="12" y="50" width="620" height="26" class="s-panel"/>
      <text x="30"  y="67" class="t-lbl s-muted">항목</text>
      <text x="150" y="67" class="t-lbl s-muted">수입신고(DB)</text>
      <text x="330" y="67" class="t-lbl s-muted">증빙 추출값(OCR)</text>
      <text x="505" y="67" class="t-lbl s-muted">출처</text>
      <text x="575" y="67" class="t-lbl s-muted">판정</text>
      <g class="t-cell s-ink">
        <text x="30" y="95">품명</text>
        <text x="150" y="95">메모리 집적회로</text><text x="330" y="95">MEMORY IC (DDR5)</text>
        <text x="505" y="95" class="s-muted">인보이스</text>
        <rect x="565" y="82" width="42" height="18" rx="9" class="s-good-soft"/><text x="586" y="95" text-anchor="middle" class="t-tiny s-good">일치</text>
        <line x1="12" y1="106" x2="632" y2="106" class="s-grid" stroke-width="1"/>
        <text x="30" y="124">세번(HS)</text>
        <text x="150" y="124" class="t-num">8542.31-0000</text><text x="330" y="124" class="t-num">8542.32 상당(사양표)</text>
        <text x="505" y="124" class="s-muted">사양서</text>
        <rect x="565" y="111" width="42" height="18" rx="9" class="s-warn-soft"/><text x="586" y="124" text-anchor="middle" class="t-tiny s-warn">검토</text>
        <line x1="12" y1="135" x2="632" y2="135" class="s-grid" stroke-width="1"/>
        <text x="30" y="153">신고가격</text>
        <text x="150" y="153" class="t-num">USD 1,820,000</text><text x="330" y="153" class="t-num">USD 2,140,000</text>
        <text x="505" y="153" class="s-muted">인보이스</text>
        <rect x="565" y="140" width="42" height="18" rx="9" class="s-crit-soft"/><text x="586" y="153" text-anchor="middle" class="t-tiny s-crit">불일치</text>
        <line x1="12" y1="164" x2="632" y2="164" class="s-grid" stroke-width="1"/>
        <text x="30" y="182">원산지</text>
        <text x="150" y="182">CN (FTA 미적용)</text><text x="330" y="182">CN — C/O 일치</text>
        <text x="505" y="182" class="s-muted">원산지증명</text>
        <rect x="565" y="169" width="42" height="18" rx="9" class="s-good-soft"/><text x="586" y="182" text-anchor="middle" class="t-tiny s-good">일치</text>
        <line x1="12" y1="193" x2="632" y2="193" class="s-grid" stroke-width="1"/>
        <text x="30" y="211">수량</text>
        <text x="150" y="211" class="t-num">42,000 EA</text><text x="330" y="211" class="t-num">42,000 EA</text>
        <text x="505" y="211" class="s-muted">B/L·P/L</text>
        <rect x="565" y="198" width="42" height="18" rx="9" class="s-good-soft"/><text x="586" y="211" text-anchor="middle" class="t-tiny s-good">일치</text>
        <line x1="12" y1="222" x2="632" y2="222" class="s-grid" stroke-width="1"/>
        <text x="30" y="240">환급 BOM</text>
        <text x="150" y="240">소요량 1.00</text><text x="330" y="240">실측 0.82 (과다 계상)</text>
        <text x="505" y="240" class="s-muted">BOM·작업지</text>
        <rect x="565" y="227" width="42" height="18" rx="9" class="s-crit-soft"/><text x="586" y="240" text-anchor="middle" class="t-tiny s-crit">불일치</text>
      </g>
      <rect x="12" y="258" width="620" height="52" class="s-panel"/>
      <text x="30" y="280" class="t-cell-b s-ink">대사 결과</text>
      <text x="30" y="298" class="t-cell s-muted">6개 항목 중 일치 3 · 검토 1 · 불일치 2 — 가격 저가신고 의심 및 환급 소요량 과다 계상</text>
      <rect x="470" y="268" width="146" height="30" rx="8" class="s-crit-soft"/>
      <text x="543" y="287" text-anchor="middle" class="t-cell-b s-crit">허위 BOM 의심 ⚠</text>
      <rect x="652" y="10" width="296" height="140" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="668" y="36" class="t-head s-ink">가격 적정성</text>
      <text x="932" y="36" text-anchor="end" class="t-cell s-muted">동종 신고 3,412건 대비</text>
      <rect x="668" y="52" width="264" height="10" rx="5" class="s-gridfill"/>
      <rect x="668" y="52" width="74" height="10" rx="5" class="s-crit"/>
      <circle cx="742" cy="57" r="7" class="s-surface s-crit-st" stroke-width="3"/>
      <text x="668" y="82" class="t-num s-crit" font-weight="800">하위 28% — 저가신고 의심</text>
      <text x="668" y="100" class="t-tiny s-muted">신고단가 43.3 USD/EA · 동종 중위값 51.0 USD/EA (−15.1%)</text>
      <text x="668" y="116" class="t-tiny s-muted">최근 6개월 하락 추세 지속</text>
      <rect x="668" y="124" width="120" height="18" rx="9" class="s-warn-soft"/>
      <text x="728" y="137" text-anchor="middle" class="t-tiny s-warn">과세가격 심사 권고</text>
      <rect x="652" y="162" width="296" height="148" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="668" y="188" class="t-head s-ink">HS 분류 적정성</text>
      <rect x="668" y="202" width="264" height="10" rx="5" class="s-gridfill"/>
      <rect x="668" y="202" width="182" height="10" rx="5" class="s-warn"/>
      <text x="668" y="232" class="t-num s-warn" font-weight="800">유사도 69% — 인접 세번 검토</text>
      <text x="668" y="250" class="t-tiny s-muted">신고 8542.31(프로세서·컨트롤러) vs 사양 8542.32(메모리)</text>
      <text x="668" y="266" class="t-tiny s-muted">세율차 0% → 관세 영향 없음 · 요건확인 대상 여부 확인</text>
      <rect x="668" y="278" width="132" height="18" rx="9" class="s-accent-soft"/>
      <text x="734" y="291" text-anchor="middle" class="t-tiny s-accent-txt">품목분류 사전심사 조회</text>
      <rect x="12" y="326" width="936" height="88" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="28" y="352" class="t-head s-ink">증빙 불일치 탐지 알림</text>
      <rect x="28" y="364" width="292" height="38" rx="8" class="s-crit-soft"/>
      <circle cx="46" cy="383" r="4" class="s-crit"/>
      <text x="58" y="379" class="t-cell-b s-ink">가격 불일치 · USD 320,000 (17.6%)</text>
      <text x="58" y="394" class="t-tiny s-muted">인보이스 대비 저가신고 — 포탈 추정 관세 2.1억원</text>
      <rect x="332" y="364" width="292" height="38" rx="8" class="s-crit-soft"/>
      <circle cx="350" cy="383" r="4" class="s-crit"/>
      <text x="362" y="379" class="t-cell-b s-ink">환급 소요량 과다 계상 · BOM 0.18 초과</text>
      <text x="362" y="394" class="t-tiny s-muted">관세환급 이상률 56% 지표와 정합 — 환급 추징 검토</text>
      <rect x="636" y="364" width="292" height="38" rx="8" class="s-warn-soft"/>
      <circle cx="654" cy="383" r="4" class="s-warn"/>
      <text x="666" y="379" class="t-cell-b s-ink">세번 인접 분류 · 8542.31 ↔ 8542.32</text>
      <text x="666" y="394" class="t-tiny s-muted">세율 동일 — 수입요건(전략물자 해당 여부)만 확인</text>
    </svg>`;
}

/* B. 물류·경로 분석 — 경로 흐름도 + B/L 추적 + 환적 탐지 */
function vizB(name, cid){
  return `
    <svg viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="운송 경로 흐름도와 환적 의심 구간">
      <text x="70"  y="26" class="t-lbl s-muted">원산지·출발</text>
      <text x="380" y="26" class="t-lbl s-muted">경유·환적</text>
      <text x="700" y="26" class="t-lbl s-muted">도착·반입</text>
      <line x1="250" y1="34" x2="250" y2="300" class="s-grid" stroke-width="1" stroke-dasharray="3 4"/>
      <line x1="620" y1="34" x2="620" y2="300" class="s-grid" stroke-width="1" stroke-dasharray="3 4"/>
      <path d="M150 90 C 300 70, 460 70, 700 96" fill="none" class="s-accent-st" stroke-width="3.5" opacity=".85"/>
      <text x="420" y="62" class="t-tiny s-accent-txt">직항 · 12건 · CNSHA→KRPUS (평균 3.2일)</text>
      <path d="M150 96 C 240 160, 300 190, 375 190" fill="none" class="s-warn-st" stroke-width="3" stroke-dasharray="7 5"/>
      <path d="M425 190 C 470 190, 500 232, 528 236" fill="none" class="s-warn-st" stroke-width="3" stroke-dasharray="7 5"/>
      <path d="M560 236 C 630 240, 660 150, 700 108" fill="none" class="s-crit-st" stroke-width="3.5" stroke-dasharray="7 5"/>
      <text x="300" y="228" class="t-tiny s-warn">VNSGN 환적 · 체류 9일</text>
      <text x="452" y="268" class="t-tiny s-warn">THBKK 환적 · B/L 분할(1→3)</text>
      <text x="612" y="182" class="t-tiny s-crit" font-weight="800">C/O 재발급 후 반입 — 원산지 세탁 의심</text>
      <circle cx="150" cy="92" r="17" class="s-accent"/><text x="150" y="96" text-anchor="middle" fill="#fff" class="t-tiny" font-weight="800">CN</text>
      <text x="150" y="128" text-anchor="middle" class="t-node s-ink">상하이항 CNSHA</text>
      <text x="150" y="142" text-anchor="middle" class="t-tiny s-muted">공급자: 중국 IMPEX C.</text>
      <circle cx="400" cy="190" r="15" class="s-warn"/><text x="400" y="194" text-anchor="middle" fill="#fff" class="t-tiny" font-weight="800">VN</text>
      <text x="400" y="222" text-anchor="middle" class="t-node s-ink">호치민 VNSGN</text>
      <circle cx="545" cy="236" r="15" class="s-warn"/><text x="545" y="240" text-anchor="middle" fill="#fff" class="t-tiny" font-weight="800">TH</text>
      <text x="545" y="212" text-anchor="middle" class="t-node s-ink">방콕 THBKK</text>
      <circle cx="712" cy="100" r="18" class="s-good"/><text x="712" y="104" text-anchor="middle" fill="#fff" class="t-tiny" font-weight="800">KR</text>
      <text x="712" y="136" text-anchor="middle" class="t-node s-ink">부산항 KRPUS</text>
      <text x="712" y="150" text-anchor="middle" class="t-tiny s-muted">수입자: ${escapeHtml(name)}</text>
      <rect x="12" y="308" width="452" height="80" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="28" y="332" class="t-head s-ink">B/L 추적 — SHSE2604118</text>
      <text x="28" y="352" class="t-cell s-muted">CNSHA 05-02 선적 → VNSGN 05-05 양하 → <tspan class="s-warn" font-weight="800">9일 체류(창고 미신고)</tspan> → THBKK 재선적</text>
      <text x="28" y="370" class="t-cell s-muted">분할 B/L 3건 재발행 → KRPUS 05-21 반입 · 신고 원산지 <tspan class="s-crit" font-weight="800">VN(FTA 적용)</tspan> — 실출발 CN</text>
      <rect x="478" y="308" width="230" height="80" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="494" y="332" class="t-head s-ink">경로 분포 (최근 24건)</text>
      <rect x="494" y="344" width="140" height="9" rx="4.5" class="s-accent"/><text x="642" y="352" class="t-num s-muted">직항 12</text>
      <rect x="494" y="358" width="82"  height="9" rx="4.5" class="s-warn"/><text x="584" y="366" class="t-num s-muted">환적 1회 7</text>
      <rect x="494" y="372" width="58"  height="9" rx="4.5" class="s-crit"/><text x="560" y="380" class="t-num s-muted">환적 2회+ 5</text>
      <rect x="722" y="308" width="226" height="80" rx="10" class="s-crit-soft"/>
      <text x="738" y="332" class="t-head s-crit">우회·환적 탐지</text>
      <text x="738" y="352" class="t-cell s-ink">동일 공급자 화물의 환적 경유율</text>
      <text x="738" y="372" class="t-num s-ink" font-weight="800" font-size="15">50% <tspan class="t-tiny s-muted" font-weight="400">(업계 평균 11%) — FTA 원산지 위반 의심</tspan></text>
    </svg>`;
}

/* C. 자금흐름 분석 — 계좌 흐름도 + 외환지급 vs 수입신고 시계열 */
function vizC(name, cid){
  return `
    <svg viewBox="0 0 960 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="계좌 간 자금 흐름도와 분할송금 시계열">
      <text x="14" y="24" class="t-lbl s-muted">국내 계좌</text>
      <text x="400" y="24" class="t-lbl s-muted">중계·분할</text>
      <text x="770" y="24" class="t-lbl s-muted">해외·가상자산</text>
      <rect x="14" y="86" width="150" height="52" rx="9" class="s-accent"/>
      <text x="89" y="108" text-anchor="middle" fill="#fff" class="t-node">${escapeHtml(name)}</text>
      <text x="89" y="124" text-anchor="middle" fill="#fff" class="t-tiny" opacity=".85">기업은행 124-**-8802</text>
      <path d="M164 100 C 250 70, 300 62, 380 66" fill="none" class="s-warn-st" stroke-width="4"/>
      <path d="M164 112 C 250 112, 300 112, 380 112" fill="none" class="s-warn-st" stroke-width="4"/>
      <path d="M164 124 C 250 158, 300 162, 380 158" fill="none" class="s-warn-st" stroke-width="4"/>
      <text x="228" y="52" class="t-tiny s-warn" font-weight="800">분할송금 3건 · 각 9,800만원 (1억 임계 회피)</text>
      <rect x="380" y="48" width="128" height="36" rx="8" class="s-surface s-warn-st" stroke-width="1.5"/>
      <text x="444" y="63" text-anchor="middle" class="t-tiny s-ink" font-weight="700">김○윤(직원)</text>
      <text x="444" y="77" text-anchor="middle" class="t-tiny s-muted">국민 402-**-1177</text>
      <rect x="380" y="94" width="128" height="36" rx="8" class="s-surface s-warn-st" stroke-width="1.5"/>
      <text x="444" y="109" text-anchor="middle" class="t-tiny s-ink" font-weight="700">박○은(가족)</text>
      <text x="444" y="123" text-anchor="middle" class="t-tiny s-muted">신한 110-**-3390</text>
      <rect x="380" y="140" width="128" height="36" rx="8" class="s-surface s-warn-st" stroke-width="1.5"/>
      <text x="444" y="155" text-anchor="middle" class="t-tiny s-ink" font-weight="700">환전상 ○○상사</text>
      <text x="444" y="169" text-anchor="middle" class="t-tiny s-crit">환치기 창구 의심</text>
      <path d="M508 66 C 590 66, 620 96, 680 100" fill="none" class="s-crit-st" stroke-width="4"/>
      <path d="M508 112 C 590 112, 620 106, 680 106" fill="none" class="s-crit-st" stroke-width="4"/>
      <path d="M508 158 C 560 158, 560 210, 680 214" fill="none" class="s-crit-st" stroke-width="3" stroke-dasharray="6 4"/>
      <text x="556" y="88" class="t-tiny s-crit" font-weight="800">당일 재집결 후 송금</text>
      <rect x="680" y="82" width="164" height="48" rx="9" class="s-crit"/>
      <text x="762" y="102" text-anchor="middle" fill="#fff" class="t-node">HK GLOBAL LINK LTD.</text>
      <text x="762" y="117" text-anchor="middle" fill="#fff" class="t-tiny" opacity=".85">HSBC HK · 페이퍼컴퍼니 의심</text>
      <rect x="680" y="192" width="164" height="44" rx="9" class="s-surface s-crit-st" stroke-width="1.5"/>
      <text x="762" y="210" text-anchor="middle" class="t-tiny s-ink" font-weight="700">가상자산 거래소 OTC</text>
      <text x="762" y="226" text-anchor="middle" class="t-tiny s-crit">USDT 매입 · 지갑 0x8a…e4</text>
      <path d="M164 130 C 300 220, 500 258, 680 258" fill="none" class="s-accent-st" stroke-width="2.5" opacity=".5"/>
      <rect x="680" y="244" width="164" height="30" rx="8" class="s-accent-soft"/>
      <text x="762" y="263" text-anchor="middle" class="t-tiny s-accent-txt">정상 수입대금 L/C 결제 (비교)</text>
      <rect x="14" y="292" width="932" height="116" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="30" y="316" class="t-head s-ink">외환 지급 vs 수입신고 금액 (월별)</text>
      <text x="930" y="316" text-anchor="end" class="t-tiny s-muted">단위: 억원 · 지급 초과분 = 신고 없는 송금</text>
      <line x1="40" y1="392" x2="930" y2="392" class="s-grid" stroke-width="1"/>
      <g class="t-tiny s-muted" text-anchor="middle">
        <rect x="70"  y="356" width="26" height="36" class="s-accent" opacity=".8"/><rect x="100" y="352" width="26" height="40" class="s-warn"/><text x="98"  y="405">1월</text>
        <rect x="215" y="360" width="26" height="32" class="s-accent" opacity=".8"/><rect x="245" y="354" width="26" height="38" class="s-warn"/><text x="243" y="405">2월</text>
        <rect x="360" y="358" width="26" height="34" class="s-accent" opacity=".8"/><rect x="390" y="344" width="26" height="48" class="s-warn"/><text x="388" y="405">3월</text>
        <rect x="505" y="362" width="26" height="30" class="s-accent" opacity=".8"/><rect x="535" y="334" width="26" height="58" class="s-warn"/><text x="533" y="405">4월</text>
        <rect x="650" y="360" width="26" height="32" class="s-accent" opacity=".8"/><rect x="680" y="326" width="26" height="66" class="s-warn"/><text x="678" y="405">5월</text>
        <rect x="795" y="358" width="26" height="34" class="s-accent" opacity=".8"/><rect x="825" y="318" width="26" height="74" class="s-crit"/><text x="823" y="405">6월</text>
      </g>
      <text x="853" y="330" class="t-num s-crit" font-weight="800">+7.4</text>
      <text x="30" y="340" class="t-tiny s-muted">■ 수입신고</text>
      <text x="30" y="354" class="t-tiny s-warn">■ 외환지급 — 4월부터 신고 대비 초과 확대</text>
    </svg>`;
}

/* D. 관계·네트워크 분석 — 중심성 관계망 + 페이퍼컴퍼니·공범 식별 */
function vizD(name, cid){
  return `
    <svg viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="중심성 인코딩 관계망과 페이퍼컴퍼니 식별">
      <ellipse cx="608" cy="196" rx="196" ry="132" class="s-crit-soft" opacity=".55"/>
      <text x="736" y="86" class="t-tiny s-crit" font-weight="800">공범 의심 클러스터</text>
      <g class="s-line" stroke-width="1.6">
        <line x1="300" y1="200" x2="150" y2="120"/>
        <line x1="300" y1="200" x2="140" y2="240"/>
        <line x1="300" y1="200" x2="210" y2="322"/>
        <line x1="300" y1="200" x2="520" y2="196"/>
      </g>
      <line x1="300" y1="200" x2="470" y2="88" class="s-crit-st" stroke-width="2" stroke-dasharray="6 4"/>
      <text x="330" y="122" class="t-tiny s-crit">특수관계(대표 동일 가족)</text>
      <g class="s-muted-st" stroke-width="1.6" opacity=".9">
        <line x1="520" y1="196" x2="470" y2="88"/>
        <line x1="520" y1="196" x2="668" y2="120"/>
        <line x1="520" y1="196" x2="688" y2="252"/>
        <line x1="668" y1="120" x2="780" y2="176"/>
        <line x1="688" y1="252" x2="780" y2="176"/>
        <line x1="688" y1="252" x2="640" y2="318"/>
      </g>
      <line x1="780" y1="176" x2="884" y2="120" class="s-crit-st" stroke-width="2.4"/>
      <text x="796" y="136" class="t-tiny s-crit">송금 집중</text>
      <circle cx="300" cy="200" r="26" class="s-accent" stroke="#ffff00" stroke-width="3"/>
      <text x="300" y="246" text-anchor="middle" class="t-node s-ink">${escapeHtml(name)}</text>
      <circle cx="150" cy="120" r="12" class="s-accent" opacity=".55"/><text x="150" y="100" text-anchor="middle" class="t-tiny s-muted">중국 IMPEX C.</text>
      <circle cx="140" cy="240" r="12" class="s-accent" opacity=".55"/><text x="140" y="268" text-anchor="middle" class="t-tiny s-muted">미국 TRADING</text>
      <circle cx="210" cy="322" r="11" fill="#9333ea"/><text x="210" y="348" text-anchor="middle" class="t-tiny s-muted">신성관세사무소</text>
      <circle cx="470" cy="88" r="14" class="s-crit"/><text x="470" y="66" text-anchor="middle" class="t-tiny s-ink" font-weight="700">(주)디브이글로벌</text>
      <circle cx="520" cy="196" r="21" class="s-warn"/>
      <text x="520" y="232" text-anchor="middle" class="t-node s-ink">이○호 (브로커)</text>
      <text x="520" y="200" text-anchor="middle" fill="#fff" class="t-tiny" font-weight="800">매개</text>
      <circle cx="668" cy="120" r="13" class="s-crit"/><text x="668" y="100" text-anchor="middle" class="t-tiny s-ink" font-weight="700">HK GLOBAL LINK</text>
      <circle cx="688" cy="252" r="13" class="s-crit"/><text x="688" y="282" text-anchor="middle" class="t-tiny s-ink" font-weight="700">VN NEW STAR</text>
      <circle cx="780" cy="176" r="15" class="s-crit"/><text x="780" y="206" text-anchor="middle" class="t-tiny s-ink" font-weight="700">공용계좌 402-**</text>
      <circle cx="640" cy="318" r="10" fill="#0d9488"/><text x="640" y="342" text-anchor="middle" class="t-tiny s-muted">통신 070-**-22</text>
      <circle cx="884" cy="120" r="11" class="s-crit" opacity=".8"/><text x="884" y="100" text-anchor="middle" class="t-tiny s-muted">USDT 지갑</text>
      <rect x="612" y="140" width="112" height="18" rx="9" class="s-crit-soft"/>
      <text x="668" y="153" text-anchor="middle" class="t-tiny s-crit" font-weight="800">페이퍼컴퍼니 의심 3사</text>
      <rect x="12" y="12" width="230" height="64" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="28" y="34" class="t-head s-ink">네트워크 요약</text>
      <text x="28" y="54" class="t-cell s-muted">노드 11 · 관계 14 · 클러스터 2</text>
      <text x="28" y="68" class="t-cell s-muted">특수관계 1 · 페이퍼컴퍼니 의심 3</text>
      <rect x="12" y="300" width="420" height="88" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="28" y="322" class="t-head s-ink">중심성 순위 (매개 Betweenness)</text>
      <g class="t-cell s-ink">
        <rect x="28" y="332" width="212" height="9" rx="4.5" class="s-warn"/><text x="248" y="341" class="t-num">이○호 0.61</text>
        <rect x="28" y="348" width="150" height="9" rx="4.5" class="s-accent"/><text x="186" y="357" class="t-num">대상기업 0.44</text>
        <rect x="28" y="364" width="96"  height="9" rx="4.5" class="s-crit"/><text x="132" y="373" class="t-num">공용계좌 0.28</text>
      </g>
      <text x="300" y="380" class="t-tiny s-muted">→ 브로커 이○호가 무역·자금 양측 연결 허브</text>
    </svg>`;
}

/* E. 행위·패턴 이상탐지 — 시계열 이상치 + 반복 히트맵 + 위험 스코어 */
function vizE(name, cid){
  return `
    <svg viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="신고 패턴 시계열 이상치와 반복 히트맵, 위험 스코어">
      <rect x="12" y="10" width="618" height="196" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="28" y="34" class="t-head s-ink">건당 신고금액 추이 — 이상치 탐지 (ML 예측범위 대비)</text>
      <path d="M40 120 C 150 116, 260 110, 360 112 C 460 114, 540 108, 610 104
               L 610 152 C 540 156, 460 160, 360 158 C 260 156, 150 162, 40 164 Z"
            class="s-accent-soft" opacity=".8"/>
      <path d="M40 146 L 100 138 L 160 142 L 220 132 L 280 138 L 340 128 L 400 134 L 460 92 L 520 74 L 580 60 L 610 56"
            fill="none" class="s-accent-st" stroke-width="2.5"/>
      <circle cx="460" cy="92" r="5" class="s-warn"/><circle cx="520" cy="74" r="5" class="s-crit"/>
      <circle cx="580" cy="60" r="5" class="s-crit"/><circle cx="610" cy="56" r="6" class="s-crit"/>
      <text x="470" y="70" class="t-tiny s-crit" font-weight="800">4월 이후 예측범위 +2.8σ 이탈</text>
      <line x1="40" y1="180" x2="610" y2="180" class="s-grid" stroke-width="1"/>
      <g class="t-tiny s-muted" text-anchor="middle">
        <text x="70" y="196">'25.7</text><text x="200" y="196">10</text><text x="330" y="196">'26.1</text><text x="470" y="196">4</text><text x="595" y="196">6월</text>
      </g>
      <rect x="12" y="220" width="428" height="168" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="28" y="244" class="t-head s-ink">반복·분할 징후 — 주차×요일 신고 히트맵</text>
      <g class="t-tiny s-muted">
        <text x="60" y="266" text-anchor="middle">월</text><text x="116" y="266" text-anchor="middle">화</text>
        <text x="172" y="266" text-anchor="middle">수</text><text x="228" y="266" text-anchor="middle">목</text>
        <text x="284" y="266" text-anchor="middle">금</text>
      </g>
      <g transform="translate(36,274)">
        <rect width="48" height="22" rx="4" class="s-accent" opacity=".15"/><rect x="56" width="48" height="22" rx="4" class="s-accent" opacity=".3"/><rect x="112" width="48" height="22" rx="4" class="s-accent" opacity=".15"/><rect x="168" width="48" height="22" rx="4" class="s-crit" opacity=".85"/><rect x="224" width="48" height="22" rx="4" class="s-accent" opacity=".25"/>
      </g>
      <g transform="translate(36,302)">
        <rect width="48" height="22" rx="4" class="s-accent" opacity=".2"/><rect x="56" width="48" height="22" rx="4" class="s-accent" opacity=".15"/><rect x="112" width="48" height="22" rx="4" class="s-accent" opacity=".3"/><rect x="168" width="48" height="22" rx="4" class="s-crit" opacity=".85"/><rect x="224" width="48" height="22" rx="4" class="s-accent" opacity=".2"/>
      </g>
      <g transform="translate(36,330)">
        <rect width="48" height="22" rx="4" class="s-accent" opacity=".15"/><rect x="56" width="48" height="22" rx="4" class="s-accent" opacity=".25"/><rect x="112" width="48" height="22" rx="4" class="s-accent" opacity=".2"/><rect x="168" width="48" height="22" rx="4" class="s-crit" opacity=".85"/><rect x="224" width="48" height="22" rx="4" class="s-accent" opacity=".15"/>
      </g>
      <g class="t-tiny s-muted">
        <text x="300" y="290">매주 목요일 3건 연속</text>
        <text x="300" y="304" class="s-crit" font-weight="800">임계 직하 분할신고 반복</text>
        <text x="300" y="322">건당 9,800만원 × 12건</text>
        <text x="300" y="340">동일 품목·동일 거래처</text>
      </g>
      <rect x="454" y="220" width="176" height="168" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="470" y="244" class="t-head s-ink">위험선별 스코어</text>
      <path d="M480 330 A 62 62 0 0 1 604 330" fill="none" class="s-grid" stroke-width="13" stroke-linecap="round"/>
      <path d="M480 330 A 62 62 0 0 1 585 283" fill="none" class="s-crit-st" stroke-width="13" stroke-linecap="round"/>
      <text x="542" y="322" text-anchor="middle" class="s-ink" font-size="26" font-weight="800">87</text>
      <text x="542" y="340" text-anchor="middle" class="t-tiny s-crit" font-weight="800">HIGH · 상위 3%</text>
      <text x="542" y="372" text-anchor="middle" class="t-tiny s-muted">ML 이상거래 모델 v2 · AUC .91</text>
      <rect x="644" y="10" width="304" height="378" rx="10" class="s-surface s-line" stroke-width="1"/>
      <text x="660" y="34" class="t-head s-ink">스코어 기여 요인 (SHAP 상위)</text>
      <g class="t-cell s-ink">
        <text x="660" y="62">분할·반복 신고 패턴</text>
        <rect x="660" y="70" width="222" height="10" rx="5" class="s-crit"/><text x="890" y="80" class="t-num s-muted">+34</text>
        <text x="660" y="104">환급 신청 주기 이상</text>
        <rect x="660" y="112" width="180" height="10" rx="5" class="s-crit" opacity=".8"/><text x="848" y="122" class="t-num s-muted">+27</text>
        <text x="660" y="146">신고금액 급증(+2.8σ)</text>
        <rect x="660" y="154" width="128" height="10" rx="5" class="s-warn"/><text x="796" y="164" class="t-num s-muted">+18</text>
        <text x="660" y="188">환적 경유율 상승</text>
        <rect x="660" y="196" width="86" height="10" rx="5" class="s-warn" opacity=".85"/><text x="754" y="206" class="t-num s-muted">+12</text>
        <text x="660" y="230">신규 거래처 집중</text>
        <rect x="660" y="238" width="52" height="10" rx="5" class="s-accent" opacity=".7"/><text x="720" y="248" class="t-num s-muted">+7</text>
        <text x="660" y="272">업력·규모 (감점)</text>
        <rect x="660" y="280" width="40" height="10" rx="5" class="s-good"/><text x="708" y="290" class="t-num s-muted">−6</text>
      </g>
      <rect x="660" y="308" width="272" height="64" rx="8" class="s-warn-soft"/>
      <text x="674" y="330" class="t-cell-b s-ink">유사 패턴 기존 사건 2건</text>
      <text x="674" y="348" class="t-tiny s-muted">'24 환급편취 C-0871 (일치도 0.83)</text>
      <text x="674" y="362" class="t-tiny s-muted">'25 분할송금 FX-0114 (일치도 0.77)</text>
    </svg>`;
}

const VIZ_BY_PERSPECTIVE = { A: vizA, B: vizB, C: vizC, D: vizD, E: vizE };

/* 관점 id(A~E) → 시각화 결과 HTML. 조사 대상 기업명·ID를 반영한다. */
export function insightVizHtml(perspId, company = {}){
  const build = VIZ_BY_PERSPECTIVE[perspId] || vizA;
  const name = company.company_name || company.company_id || "조사 대상 기업";
  const cid = company.company_id || "C-0000";
  return `<div class="ci-insight-viz">${build(name, cid)}</div>`;
}
