import type { JsonObject } from "../../contracts/src/index.js";

export type CrmSalesTargetOwnerType = "User" | "Territory" | "CRM Sales Team";
export type CrmSalesTargetStatus = "Draft" | "Active" | "Closed";

export interface CrmSalesTargetData extends JsonObject {
  company: string;
  target_owner_type: CrmSalesTargetOwnerType;
  target_owner: string;
  currency: string;
  start_date: string;
  end_date: string;
  target_amount: string;
  status?: CrmSalesTargetStatus;
  notes?: string;
}

export type CrmCommissionRuleStatus = "Active" | "Inactive";

export interface CrmCommissionRuleData extends JsonObject {
  company: string;
  rule_name: string;
  rate: string;
  effective_from: string;
  effective_to?: string;
  status?: CrmCommissionRuleStatus;
  notes?: string;
}

export type CrmCommissionAccrualStatus = "Draft" | "Approved" | "Paid" | "Cancelled";

export interface CrmCommissionAccrualData extends JsonObject {
  company: string;
  deal: string;
  payee: string;
  rule: string;
  currency?: string;
  earned_on: string;
  base_amount?: string;
  rate?: string;
  commission_amount?: string;
  status?: CrmCommissionAccrualStatus;
  payment_reference?: string;
  notes?: string;
}
