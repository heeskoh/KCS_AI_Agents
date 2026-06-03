import { casesSubtab } from "./cases.js";
import { dataSubtab } from "./data.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { workbenchSubtab } from "./workbench.js";
import { withAgentMetadata } from "../shared/agent-metadata.js";
import {
  configuredSubtabsForPage,
  subtabWithAgentDefaultOptions,
} from "../shared/scenario-builder-config.js";

export const GENERAL_INVESTIGATION_SUBTABS = [
  casesSubtab,
  profileSubtab,
  dataSubtab,
  workbenchSubtab,
  reportSubtab,
].map(withAgentMetadata);

export function createGeneralInvestigationTabs(deps, page = "generalinv"){
  const config = deps.getScenarioBuilderConfig?.();
  return configuredSubtabsForPage(GENERAL_INVESTIGATION_SUBTABS, config, page).map(subtab => ({
    ...subtabWithAgentDefaultOptions(subtab, config),
    render: () => subtab.render(deps),
  }));
}
