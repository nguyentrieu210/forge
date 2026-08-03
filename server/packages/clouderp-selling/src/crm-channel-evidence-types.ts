import type { JsonObject } from "../../contracts/src/index.js";

export interface CrmSellInSnapshotData extends JsonObject {
  company: string;
  partner: string;
  sales_order: string;
  sales_order_version?: number;
  order_status?: string;
  order_docstatus?: number;
  currency?: string;
  order_total?: string;
  recorded_at?: string;
}

export type CrmPromotionExecutionStatus = "Planned" | "Executed" | "Cancelled";

export interface CrmPromotionExecutionData extends JsonObject {
  company: string;
  campaign: string;
  partner: string;
  salesperson: string;
  planned_date: string;
  status?: CrmPromotionExecutionStatus;
  executed_at?: string;
  field_check_in?: string;
  notes?: string;
}
