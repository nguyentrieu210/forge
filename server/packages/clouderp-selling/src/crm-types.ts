import type { JsonObject } from "../../contracts/src/index.js";

export type LeadStatus = "New" | "Open" | "Qualified" | "Unqualified" | "Converted";

export interface LeadData extends JsonObject {
  company: string;
  lead_name: string;
  organization_name?: string | undefined;
  email_id?: string | undefined;
  mobile_no?: string | undefined;
  lead_source?: string | undefined;
  territory?: string | undefined;
  sales_team?: string | undefined;
  assigned_to?: string | undefined;
  status?: LeadStatus | undefined;
  converted_customer?: string | undefined;
  converted_deal?: string | undefined;
  notes?: string | undefined;
}

export type OpportunityPartyType = "CRM Lead" | "Customer";
export type OpportunityStatus = "Open" | "Won" | "Lost";

export interface OpportunityData extends JsonObject {
  company: string;
  opportunity_name: string;
  party_type: OpportunityPartyType;
  party: string;
  pipeline: string;
  sales_stage: string;
  status?: OpportunityStatus | undefined;
  probability?: string | undefined;
  opportunity_amount: string;
  weighted_value?: string | undefined;
  currency: string;
  expected_close_date: string;
  lead_source?: string | undefined;
  territory?: string | undefined;
  sales_team?: string | undefined;
  close_reason?: string | undefined;
  assigned_to?: string | undefined;
  notes?: string | undefined;
}

export type CrmActivityType = "Call" | "Email" | "Meeting" | "Task";
export type CrmActivityStatus = "Open" | "Completed" | "Cancelled";
export type CrmActivityReferenceDoctype = "CRM Lead" | "CRM Deal" | "Customer";

export interface CrmActivityData extends JsonObject {
  company: string;
  reference_doctype: CrmActivityReferenceDoctype;
  reference_name: string;
  activity_type: CrmActivityType;
  subject: string;
  status?: CrmActivityStatus | undefined;
  activity_at?: string | undefined;
  due_at?: string | undefined;
  completed_at?: string | undefined;
  assigned_to?: string | undefined;
  outcome?: string | undefined;
  notes?: string | undefined;
}
