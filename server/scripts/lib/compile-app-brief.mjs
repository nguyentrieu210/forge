import { compileBrief as compileBaseBrief, BriefError } from "./compile-brief.mjs";
import { attachBriefUiViewPolicies } from "./brief-ui-view-policy.mjs";

export { BriefError };

/**
 * Public brief compiler used by forge-app.
 *
 * The mature base compiler owns fields, permissions, workflows and derived defaults.
 * UI01 adds its view grammar as a narrow post-stage so Matrix/Bulk survive into the package
 * and are then checked by the same server parser that accepts installed app metadata.
 */
export function compileBrief(brief) {
  return attachBriefUiViewPolicies(brief, compileBaseBrief(brief));
}
