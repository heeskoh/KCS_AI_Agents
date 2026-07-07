---
name: stop-verify-server-after-work
description: "검증용 프리뷰 서버(kcs-portal-verify, 8001)는 작업이 끝나면 항상 종료할 것"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7375d7b5-1930-43f9-a967-d5b7c5759e72
---

작업 검증을 위해 띄운 검증용 서버(`kcs-portal-verify`, 포트 8001)는 검증이 끝나면 항상 `preview_stop`으로 종료한다.

**Why:** 사용자가 2026-06-12에 명시적으로 요청함. 사용자는 본 서버(포트 8000)를 직접 띄워 사용하므로 검증용 서버가 남아 있으면 불필요한 프로세스가 쌓인다.

**How to apply:** 프리뷰 검증 워크플로우의 마지막 단계로 `preview_stop` 호출을 포함한다. 포트 8000은 사용자의 본 서버이므로 절대 종료하지 않는다. [[workspace-state-overrides-code-defaults]]
