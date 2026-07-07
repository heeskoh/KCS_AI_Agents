import { dashboardSubtab } from "./dashboard.js";
import { dataSubtab } from "./data.js";
import { networkSubtab } from "./network.js";
import { ongoingSubtab } from "./ongoing.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { scenarioSubtab } from "./scenario.js";
import { templatesSubtab } from "./templates.js";
import { withAgentMetadata } from "../shared/agent-metadata.js";

// 관세조사 서브탭 정의 목록. 런타임 탭 구성은 통합 레지스트리(subtab-registry.js)가 담당한다.
export const CUSTOMS_SUBTABS = [
  ongoingSubtab,
  profileSubtab,
  dataSubtab,
  scenarioSubtab,
  networkSubtab,
  reportSubtab,
  dashboardSubtab,
  templatesSubtab,
].map(withAgentMetadata);
