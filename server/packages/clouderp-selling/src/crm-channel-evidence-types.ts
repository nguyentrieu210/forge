import type { JsonObject } from "../../contracts/src/index.js";

export interface CrmSellInSnapshotData extends JsonObject {
  company: string;
  partner: string;
  sales_order: string;
  sales_order_version?: number | undefined;
  order_status?: string | undefined;
  order_docstatus?: number | undefined;
  currency?: string | undefined;
  order_total?: string | undefined;
  recorded_at?: string | undefined;
}

export type CrmPromotionExecutionStatus = "Planned" | "Executed" | "Cancelled";

export interface CrmPromotionExecutionData extends JsonObject {
  company: string;
  campaign: string;
  partner: string;
  salesperson: string;
  planned_date: string;
  status?: CrmPromotionExecutionStatus | undefined;
  executed_at?: string | undefined;
  field_check_in?: string | undefined;
  notes?: string | undefined;
}
