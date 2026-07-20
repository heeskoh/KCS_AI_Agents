export const generalInvestigationState = {
  generalInvTab: "cases",
  activeGenInvCaseId: null,
  activeGiStepId: null,
  showGenInvRegForm: false,
  genInvFilter: "",
  giRegTargetType: "company",
  customGenInvCases: [],
  archivedGenInvCases: [],
  genInvArchiveOpen: false,
  // 수사단서(leads)·혐의 선택 UI 상태 (사건 상세)
  giCaseDetailOpen: false,
  leadFormType: "smuggle_report",
  leadFormStage: "plan",
  activeLeadId: null,
  leadDraftStreaming: false,
  crimeDraft: null,
  // 수사정보 분석 탭 UI 상태 — 분석 관점 A~E(관세조사 공용 워크벤치) 또는 "leads"
  insightView: "A",
  // 수사분석 워크벤치 중앙 상위 탭 — "viz"(AI정보분석 시각화) | "network"(관계망 분석)
  insightCenterTab: "viz",
  // 좌·우 열 접기 상태 (수사 대화 / 수집된 정보)
  insightChatCollapsed: false,
  insightCardsCollapsed: false,
  insightGroupsOpen: {},
};
