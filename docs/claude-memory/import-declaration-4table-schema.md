---
name: import-declaration-4table-schema
description: 수입신고 DB가 신고서 5개 영역을 담는 정규화 4-테이블 구조이며 헤더 대표값 컬럼은 호환용이라 제거 금지
metadata: 
  node_type: memory
  type: project
  originSessionId: 0d28a42f-084c-47c5-98ad-0bd6446833a8
---

수입신고 DB는 한국 수입신고서(관세법 시행규칙 별지 제1호의3서식) 5개 영역 전체를 담도록 2026-06-16 정규화 4-테이블로 재설계됨:
- `import_declarations` (헤더 1건, 76컬럼: 영역1 신고/당사자·영역2 화물운송·영역3 거래결제·영역5 세액합계)
- `import_declaration_items` (영역4 품목/란, 1신고 N란)
- `import_declaration_item_specs` (모델·규격별 하위 반복)
- `import_declaration_item_taxes` (품목별 세목 = 관세+내국세 반복)

DDL/시드는 [setup_db.py](data/scripts/setup_db.py), 현실값 생성은 [refresh_realistic_sample_data.py](data/scripts/refresh_realistic_sample_data.py)의 `build_declaration_rows()`. 4-테이블 컬럼 정의는 refresh의 `HEADER_COLS/ITEM_COLS/SPEC_COLS/TAX_COLS`에 단일 소스로 있고 setup_db가 import해 씀.

**Why:** 신고서 영역4가 반복 구조라 정규화 필요. 그런데 헤더의 `hs_code·item_name·declared_value·origin_country·origin_country_name`는 위험지표 산출·Neo4j 적재·웹서버·NL2SQL 등 21개 파일이 평면 테이블로 직접 읽음.

**How to apply:** 헤더의 위 5개 대표값 컬럼(첫 란 값)은 **절대 제거하지 말 것** — 제거 시 21개 소비처가 깨짐. 신규 필드는 추가만. 신고 INSERT는 컬럼 수가 많아 positional 금지, `insert_dicts()`로 컬럼 명시 삽입. 비교군(SYN-*)·레거시 40건은 대표값 10컬럼(`REP_DECL_COLS`)만 채우고 나머지 헤더 필드는 NULL. 원천은 [[risk-indicator-redesign]]과 함께 `setup_db.py --reset`로 전체 재생성. 8001 검증서버 관련 [[stop-verify-server-after-work]].
