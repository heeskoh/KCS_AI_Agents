import { casesSubtab } from "./cases.js";
import { dataSubtab } from "./data.js";
import { profileSubtab } from "./profile.js";
import { reportSubtab } from "./report.js";
import { workbenchSubtab } from "./workbench.js";

export const GENERAL_INVESTIGATION_SUBTABS = [
  casesSubtab,
  profileSubtab,
  dataSubtab,
  workbenchSubtab,
  reportSubtab,
];

export function createGeneralInvestigationTabs(deps){
  return GENERAL_INVESTIGATION_SUBTABS.map(subtab => ({
    ...subtab,
    render: () => subtab.render(deps),
  }));
}
