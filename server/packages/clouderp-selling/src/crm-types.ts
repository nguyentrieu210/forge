import type { JsonObject } from "../../contracts/src/index.js";

export type LeadStatus = "New" | "Open" | "Qualified" | "Unqualified" | "Converted";

export interface LeadData extends JsonObject {
  company: string;
  lead_name: string;
  organization_name?: string;
  email_id?: string;
  mobile_no?: string;
  lead_source?: string;
  territory?: string;
  sales_team?: string;
  assigned_to?: string;
  status?: LeadStatus;
  converted_customer?: string;
  converted_deal?: string;
  notes?: string;
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
  status?: OpportunityStatus;
  probability?: string;
  opportunity_amount: string;
  weighted_value?: string;
  currency: string;
  expected_close_date: string;
  lead_source?: string;
  territory?: string;
  sales_team?: string;
  close_reason?: string;
  assigned_to?: string;
  notes?: string;
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
  status?: CrmActivityStatus;
  activity_at?: string;
  due_at?: string;
  completed_at?: string;
  assigned_to?: string;
  outcome?: string;
  notes?: string;
}
