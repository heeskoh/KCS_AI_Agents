import { dashboardSubtab } from "./dashboard.js";
import { dataSubtab } from "./data.js";
import { ongoingSubtab } from "./ongoing.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { scenarioSubtab } from "./scenario.js";
import { templatesSubtab } from "./templates.js";

export const CUSTOMS_SUBTABS = [
  ongoingSubtab,
  profileSubtab,
  dataSubtab,
  scenarioSubtab,
  reportSubtab,
  dashboardSubtab,
  templatesSubtab,
];

export function createCustomsInvestigationTabs(deps){
  return CUSTOMS_SUBTABS.map(subtab => ({
    ...subtab,
    render: () => subtab.render(deps),
  }));
}
