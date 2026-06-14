import { casesSubtab } from "./cases.js";
import { dataSubtab } from "./data.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { workbenchSubtab } from "./workbench.js";
import { withAgentMetadata } from "../shared/agent-metadata.js";

// 일반수사 서브탭 정의 목록. 런타임 탭 구성은 통합 레지스트리(subtab-registry.js)가 담당한다.
export const GENERAL_INVESTIGATION_SUBTABS = [
  casesSubtab,
  profileSubtab,
  dataSubtab,
  workbenchSubtab,
  reportSubtab,
].map(withAgentMetadata);
