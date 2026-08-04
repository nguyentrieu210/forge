import type { JsonObject } from "../../contracts/src/index.js";

export type CrmLeadScoreFact = "Lead Source" | "Territory" | "Status" | "Sales Team" | "Has Email" | "Has Mobile";
export type CrmLeadScoreOperator = "Equals" | "Present" | "Absent";
export type CrmLeadScoreRuleStatus = "Active" | "Inactive";

export interface CrmLeadScoreRuleData extends JsonObject {
  company: string;
  rule_name: string;
  fact: CrmLeadScoreFact;
  operator: CrmLeadScoreOperator;
  match_value?: string | undefined;
  points: number;
  effective_from: string;
  effective_to?: string | undefined;
  status?: CrmLeadScoreRuleStatus | undefined;
  notes?: string | undefined;
}

export interface CrmLeadScoreSnapshotData extends JsonObject {
  company: string;
  lead: string;
  score?: number | undefined;
  matched_rule_count?: number | undefined;
  matched_rules?: string | undefined;
  scored_at?: string | undefined;
}
