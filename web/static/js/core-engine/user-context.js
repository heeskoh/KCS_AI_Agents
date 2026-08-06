/* ── 공용 코어: 사용자 컨텍스트 · 권한 ─────────────────────────────────
   4개 사이트(포털·AI 조사관·AI 수사관·표준보고서)가 공유하는 현재 사용자 상태와
   권한 판정 로직. app-runtime(오케스트레이터)에서 1단계 리팩토링으로 추출했다.

   상태(currentUserId·userPermissions)는 ESM 라이브 바인딩으로 노출한다 —
   읽기는 import한 바인딩을 그대로 쓰고, 재할당은 반드시 set* 함수로 한다.
   (객체 속성 변경은 import 측에서도 가능: userPermissions[key] = ... 허용) */
import {
  ALL_INV_PAGES,
  AI_SERVICE_REGISTRY,
  DEFAULT_GRANTED_DATASOURCES,
  defaultUserPermissions,
  sampleUsers,
  userGroups,
} from "../config/service-registry.js";
import { isSuperAdminUser } from "../core/super-admin.js";

/* ── 상태 ── */
export let currentUserId = "u01";
export let userPermissions = { ...defaultUserPermissions };

export function setCurrentUserId(userId){ currentUserId = userId; }
export function setUserPermissions(perms){ userPermissions = perms; }

/* ── 현재 사용자 ── */
export function currentUser(){ return sampleUsers.find(u => u.id === currentUserId) || sampleUsers[0]; }
export function currentUserGroup(){ const u = currentUser(); return userGroups.find(g => g.id === u.groupId) || userGroups[0]; }
export function isCurrentUserAdmin(){ return currentUserGroup().isAdmin === true; }
export function isCurrentUserSuperAdmin(){ return isSuperAdminUser(currentUser()); }

/* ── 페이지 접근권한 — 권한관리.pdf 매트릭스 기반: 그룹 pages 목록(슈퍼관리자는 전체) ── */
export function currentUserPages(){
  if(isCurrentUserSuperAdmin()) return [...ALL_INV_PAGES, "report"];
  return currentUserGroup().pages || [];
}
export function pageAllowed(page){ return currentUserPages().includes(page); }

/* ── 서비스(업무지식베이스·AI 서비스) 권한 ── */
export function permissionStatus(key){
  return userPermissions[key] || "locked";
}
export function hasPermission(key){
  return permissionStatus(key) === "granted";
}
export function permissionLabel(status){
  if(status === "granted") return "사용 가능";
  if(status === "requested") return "요청중";
  return "권한 없음";
}

/* 그룹 권한 산출 규칙:
   - 업무지식베이스(permissionGroup=dataSources) : 그룹에 부여된 rag 목록에 따라 granted/locked
   - AI 서비스(permissionGroup=agents)          : 전체 사용자 허용(범용 도구 — 권한 제한 없음)
   저장 상태의 승인 이력(권한 요청→승인)은 loadCanvasState에서 granted로 병합된다. */
export function buildGroupPermissions(group){
  const perms = {};
  Object.keys(defaultUserPermissions).forEach(key => {
    perms[key] = AI_SERVICE_REGISTRY[key]?.permissionGroup === "dataSources"
      ? ((group.rag.includes(key) || DEFAULT_GRANTED_DATASOURCES.has(key)) ? "granted" : "locked")
      : "granted";
  });
  return perms;
}

/* ── 홈 전문 업무 카드 — 페이지별 대표 권한 키 매핑 (하나라도 granted면 활성) ── */
const HOME_SHORTCUT_PERMISSION_KEYS = {
  investigation: ["rag_audit", "declaration_verify", "customs_value"],
  generalinv: ["rag_investigation"],
  lawsearch: ["rag_investigation", "network"],
  fxsearch: ["rag_investigation", "ml"],
  case: ["rag_global"],
  model: ["rag_customs"],
};

export function shortcutStateForPage(page){
  if(page === "system") return isCurrentUserAdmin() ? "granted" : "locked";
  // 권한관리.pdf 매트릭스: 페이지 접근권한(pages)을 1차 기준으로 사용
  if(currentUserGroup().pages || isCurrentUserSuperAdmin()){
    if(["investigation","generalinv","lawsearch","fxsearch","case","model","report"].includes(page)){
      return pageAllowed(page) ? "granted" : "locked";
    }
  }
  const keys = HOME_SHORTCUT_PERMISSION_KEYS[page];
  if(!keys || !keys.length) return "granted";
  return keys.some(key => hasPermission(key)) ? "granted" : "locked";
}
