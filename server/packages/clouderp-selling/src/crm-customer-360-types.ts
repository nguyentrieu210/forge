import type { JsonObject } from "../../contracts/src/index.js";
import type { CrmCustomer360ExternalIdentityData } from "./crm-external-identity-types.js";

export interface CrmCustomer360CurrencyData extends JsonObject {
  row_id: string;
  currency: string;
  pipeline_amount: string;
  weighted_pipeline_amount: string;
  won_deal_amount: string;
  quoted_amount: string;
  ordered_amount: string;
  invoiced_amount: string;
  outstanding_amount: string;
  received_amount: string;
}

export interface CrmCustomer360ActivityData extends JsonObject {
  row_id: string;
  activity: string;
  activity_type: string;
  subject: string;
  status: string;
  reference_doctype: string;
  reference_name: string;
  activity_at: string;
  due_at?: string;
  assigned_to?: string;
}

export interface CrmCustomer360Data extends JsonObject {
  company: string;
  customer: string;
  as_of: string;
  status: "Current";
  organization_count: number;
  contact_count: number;
  external_identity_count?: number;
  open_deal_count: number;
  won_deal_count: number;
  lost_deal_count: number;
  open_activity_count: number;
  overdue_activity_count: number;
  quotation_count: number;
  sales_order_count: number;
  delivery_count: number;
  sales_invoice_count: number;
  payment_count: number;
  last_activity_at?: string;
  currency_summary: CrmCustomer360CurrencyData[];
  external_identities?: CrmCustomer360ExternalIdentityData[];
  recent_activities: CrmCustomer360ActivityData[];
}
