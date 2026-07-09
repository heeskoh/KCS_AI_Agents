import { dashboardSubtab } from "./dashboard.js";
import { dataSubtab } from "./data.js";
import { insightSubtab } from "./insight.js";
import { ongoingSubtab } from "./ongoing.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { scenarioSubtab } from "./scenario.js";
import { templatesSubtab } from "./templates.js";
import { withAgentMetadata } from "../shared/agent-metadata.js";

// 관세조사 서브탭 정의 목록. 런타임 탭 구성은 통합 레지스트리(subtab-registry.js)가 담당한다.
// 관계망 단독 서브탭(조사자료 관계분석)은 제거 — 관계분석은 프로파일 내에 존재하고,
// 대화형 분석·시각화는 "수사정보 분석"(insight) 탭이 담당한다.
export const CUSTOMS_SUBTABS = [
  ongoingSubtab,
  profileSubtab,
  dataSubtab,
  scenarioSubtab,
  insightSubtab,
  reportSubtab,
  dashboardSubtab,
  templatesSubtab,
].map(withAgentMetadata);
