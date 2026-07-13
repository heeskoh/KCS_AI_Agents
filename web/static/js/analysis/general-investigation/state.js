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
  insightGroupsOpen: {},
};
