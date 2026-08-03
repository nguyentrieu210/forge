import type { JsonObject } from "../../contracts/src/index.js";

export type CrmMarketingConfigStatus = "Active" | "Inactive";
export type CrmConsentRequirement = "Any" | "Granted";

export interface CrmSegmentData extends JsonObject {
  company: string;
  segment_name: string;
  territory?: string;
  lead_source?: string;
  consent_requirement?: CrmConsentRequirement;
  status?: CrmMarketingConfigStatus;
  notes?: string;
}

export type CrmMarketingListStatus = "Draft" | "Active" | "Archived";

export interface CrmMarketingListData extends JsonObject {
  company: string;
  list_name: string;
  segment?: string;
  status?: CrmMarketingListStatus;
  notes?: string;
}

export type CrmMarketingMemberStatus = "Active" | "Unsubscribed";
export type CrmMarketingMemberSource = "Manual" | "Import" | "Segment";

export interface CrmMarketingListMemberData extends JsonObject {
  company: string;
  marketing_list: string;
  contact: string;
  source?: CrmMarketingMemberSource;
  status?: CrmMarketingMemberStatus;
  added_at?: string;
  unsubscribed_at?: string;
  unsubscribed_reason?: string;
}

export type CrmCampaignChannel = "Email" | "SMS" | "Phone" | "Social" | "Other";
export type CrmCampaignStatus = "Draft" | "Active" | "Paused" | "Completed" | "Cancelled";

export interface CrmCampaignData extends JsonObject {
  company: string;
  campaign_name: string;
  marketing_list: string;
  channel: CrmCampaignChannel;
  currency: string;
  budget: string;
  start_date: string;
  end_date: string;
  owner_user?: string;
  status?: CrmCampaignStatus;
  notes?: string;
}

export type CrmAttributionModel = "First Touch" | "Last Touch" | "Influenced";
export type CrmAttributionStatus = "Active" | "Cancelled";

export interface CrmCampaignAttributionData extends JsonObject {
  company: string;
  campaign: string;
  deal: string;
  model: CrmAttributionModel;
  attribution_percent: string;
  deal_amount?: string;
  currency?: string;
  deal_status?: string;
  attributed_value?: string;
  status?: CrmAttributionStatus;
  notes?: string;
}
