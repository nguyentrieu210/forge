import type { JsonObject } from "../../contracts/src/index.js";

export type CrmSalesTeamStatus = "Active" | "Inactive";
export type CrmSalesTeamMemberRole = "Manager" | "Member";
export type CrmSalesTeamMemberStatus = "Active" | "Inactive";

export interface CrmSalesTeamData extends JsonObject {
  company: string;
  team_name: string;
  manager: string;
  territory?: string;
  status?: CrmSalesTeamStatus;
  notes?: string;
}

export interface CrmSalesTeamMemberData extends JsonObject {
  company: string;
  sales_team: string;
  user: string;
  member_role?: CrmSalesTeamMemberRole;
  status?: CrmSalesTeamMemberStatus;
  notes?: string;
}
