---
name: workspace-state-overrides-code-defaults
description: data/workspace_state.json이 코드 기본값을 덮어씀 + 이 파일을 PS5.1로 쓰면 BOM 때문에 서버 파싱 실패(상태 유실 사고 이력)
metadata: 
  node_type: memory
  type: project
  originSessionId: 7375d7b5-1930-43f9-a967-d5b7c5759e72
---

KCS 포털은 `data/workspace_state.json`(서버 `/api/workspace_state`)에 사용자 권한 스냅샷과 회사별 시나리오를 영속화하고, 부팅 시 이 값이 app-runtime.js의 코드 기본값을 덮어쓴다. 단, 2026-06-12 이후 그룹 정의가 부여한 권한은 저장 스냅샷의 locked보다 우선하도록 보강됨(loadCanvasState의 union 로직).

**Why:** 템플릿/권한을 코드에서 수정해도 저장 상태가 우선이라 UI에 반영되지 않았음. 또한 2026-06-12에 PowerShell 5.1 `Set-Content -Encoding utf8`(BOM 포함)로 이 파일을 수정했다가 서버 `json.loads`가 실패 → 빈 상태 응답 → 클라이언트 localStorage 마이그레이션이 파일을 덮어써 상태가 유실되는 사고가 있었음. 서버는 이후 `utf-8-sig`로 읽도록 수정했지만 같은 패턴의 다른 파일은 여전히 위험.

**How to apply:**
- **커밋 시 `data/workspace_state/*.json` 변경을 항상 포함**할 것(2026-06-23 사용자 지시). 런타임 사용자 상태(커스텀 캔버스 작업·활성 기업·시나리오)는 보존 대상이며 incidental로 제외하지 말 것. CRLF만 바뀐 파일은 실제 내용 변경이 없으니 그대로 둬도 무방.
- 기본값을 코드에서 바꿀 때 저장 상태(`userPermissions`, `companyScenarios.<id>`)도 함께 갱신/제거해야 즉시 반영. 사용자 커스텀 시나리오는 보존할 것.
- Python이 읽는 JSON 파일을 PowerShell로 쓰지 말 것 — 쓰려면 `[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))`(BOM 없음) 또는 Python 사용.
- 분석 템플릿(내 저장 템플릿/기본 템플릿 오버라이드)은 `data/analysis_templates.json`으로 분리됨 (`/api/analysis_templates`). [[stop-verify-server-after-work]]
