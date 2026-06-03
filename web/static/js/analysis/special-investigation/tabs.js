import { dashboardSubtab } from "./dashboard.js";
import { dataSubtab } from "./data.js";
import { forensicSubtab } from "./forensic.js";
import { networkSubtab } from "./network.js";
import { ongoingSubtab } from "./ongoing.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { scenarioSubtab } from "./scenario.js";
import { slangSubtab } from "./slang.js";
import { withAgentMetadata } from "../shared/agent-metadata.js";
import {
  configuredSubtabsForPage,
  subtabWithAgentDefaultOptions,
} from "../shared/scenario-builder-config.js";

export const SPECIAL_INVESTIGATION_CONFIG = {
  lawsearch: {
    title: "마약 수사 분석",
    description: "마약 우범자 수사 등록부터 시나리오 실행, 관계망·포렌식 분석, 보고서 생성까지 통합 수사 워크플로우를 제공합니다.",
    profileTab: "마약프로파일",
    dashboardTab: "마약위험 대시보드",
  },
  fxsearch: {
    title: "외환 수사 분석",
    description: "외환 수사 대상 등록부터 시나리오 실행, 관계망·포렌식 분석, 보고서 생성까지 통합 수사 워크플로우를 제공합니다.",
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
].map(withAgentMetadata);

export function createSpecialInvestigationTabs(deps, page = "lawsearch"){
  const config = deps.getScenarioBuilderConfig?.();
  return configuredSubtabsForPage(SPECIAL_INVESTIGATION_SUBTABS, config, page).map(subtab => ({
    ...subtabWithAgentDefaultOptions(subtab, config),
    render: () => subtab.render(deps),
  }));
}
