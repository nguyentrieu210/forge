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
  status?: CrmSalesTargetStatus | undefined;
  notes?: string | undefined;
}

export type CrmCommissionRuleStatus = "Active" | "Inactive";

export interface CrmCommissionRuleData extends JsonObject {
  company: string;
  rule_name: string;
  rate: string;
  effective_from: string;
  effective_to?: string | undefined;
  status?: CrmCommissionRuleStatus | undefined;
  notes?: string | undefined;
}

export type CrmCommissionAccrualStatus = "Draft" | "Approved" | "Paid" | "Cancelled";

export interface CrmCommissionAccrualData extends JsonObject {
  company: string;
  deal: string;
  payee: string;
  rule: string;
  currency?: string | undefined;
  earned_on: string;
  base_amount?: string | undefined;
  rate?: string | undefined;
  commission_amount?: string | undefined;
  status?: CrmCommissionAccrualStatus | undefined;
  payment_reference?: string | undefined;
  notes?: string | undefined;
}
