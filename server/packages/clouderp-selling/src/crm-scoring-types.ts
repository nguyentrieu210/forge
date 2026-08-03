import type { JsonObject } from "../../contracts/src/index.js";

export type CrmLeadScoreFact = "Lead Source" | "Territory" | "Status" | "Sales Team" | "Has Email" | "Has Mobile";
export type CrmLeadScoreOperator = "Equals" | "Present" | "Absent";
export type CrmLeadScoreRuleStatus = "Active" | "Inactive";

export interface CrmLeadScoreRuleData extends JsonObject {
  company: string;
  rule_name: string;
  fact: CrmLeadScoreFact;
  operator: CrmLeadScoreOperator;
  match_value?: string;
  points: number;
  effective_from: string;
  effective_to?: string;
  status?: CrmLeadScoreRuleStatus;
  notes?: string;
}

export interface CrmLeadScoreSnapshotData extends JsonObject {
  company: string;
  lead: string;
  score?: number;
  matched_rule_count?: number;
  matched_rules?: string;
  scored_at?: string;
}
