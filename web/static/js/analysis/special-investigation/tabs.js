import { dashboardSubtab } from "./dashboard.js";
import { dataSubtab } from "./data.js";
import { forensicSubtab } from "./forensic.js";
import { networkSubtab } from "./network.js";
import { ongoingSubtab } from "./ongoing.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { scenarioSubtab } from "./scenario.js";
import { slangSubtab } from "./slang.js";
import { templatesSubtab } from "./templates.js";
import { withAgentMetadata } from "../shared/agent-metadata.js";

export const SPECIAL_INVESTIGATION_CONFIG = {
  lawsearch: {
    title: "마약 수사 분석",
    description: "마약 우범자 수사 등록부터 시나리오 실행, 관계망·압수증거 분석, 보고서 생성까지 통합 수사 워크플로우를 제공합니다.",
    profileTab: "마약프로파일",
    dashboardTab: "마약위험 대시보드",
  },
  fxsearch: {
    title: "외환 수사 분석",
    description: "외환 수사 대상 등록부터 시나리오 실행, 관계망·압수증거 분석, 보고서 생성까지 통합 수사 워크플로우를 제공합니다.",
    profileTab: "외환프로파일",
    dashboardTab: "외환위험 대시보드",
  },
};

export const SPECIAL_INVESTIGATION_SUBTABS = [
  ongoingSubtab,
  profileSubtab,
  dataSubtab,
  scenarioSubtab,
  networkSubtab,
  forensicSubtab,
  reportSubtab,
  slangSubtab,
  dashboardSubtab,
  templatesSubtab,
].map(withAgentMetadata);
