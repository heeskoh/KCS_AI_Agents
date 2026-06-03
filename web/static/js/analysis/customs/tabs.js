import { dashboardSubtab } from "./dashboard.js";
import { dataSubtab } from "./data.js";
import { ongoingSubtab } from "./ongoing.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { scenarioSubtab } from "./scenario.js";
import { templatesSubtab } from "./templates.js";
import { withAgentMetadata } from "../shared/agent-metadata.js";
import {
  configuredSubtabsForPage,
  subtabWithAgentDefaultOptions,
} from "../shared/scenario-builder-config.js";

export const CUSTOMS_SUBTABS = [
  ongoingSubtab,
  profileSubtab,
  dataSubtab,
  scenarioSubtab,
  reportSubtab,
  dashboardSubtab,
  templatesSubtab,
].map(withAgentMetadata);

export function createCustomsInvestigationTabs(deps, page = "investigation"){
  const config = deps.getScenarioBuilderConfig?.();
  return configuredSubtabsForPage(CUSTOMS_SUBTABS, config, page).map(subtab => ({
    ...subtabWithAgentDefaultOptions(subtab, config),
    render: () => subtab.render(deps),
  }));
}
