import type { JsonObject } from "../../contracts/src/index.js";

export type CrmMarketingConfigStatus = "Active" | "Inactive";
export type CrmConsentRequirement = "Any" | "Granted";

export interface CrmSegmentData extends JsonObject {
  company: string;
  segment_name: string;
  territory?: string | undefined;
  lead_source?: string | undefined;
  consent_requirement?: CrmConsentRequirement | undefined;
  status?: CrmMarketingConfigStatus | undefined;
  notes?: string | undefined;
}

export type CrmMarketingListStatus = "Draft" | "Active" | "Archived";

export interface CrmMarketingListData extends JsonObject {
  company: string;
  list_name: string;
  segment?: string | undefined;
  status?: CrmMarketingListStatus | undefined;
  notes?: string | undefined;
}

export type CrmMarketingMemberStatus = "Active" | "Unsubscribed";
export type CrmMarketingMemberSource = "Manual" | "Import" | "Segment";

export interface CrmMarketingListMemberData extends JsonObject {
  company: string;
  marketing_list: string;
  contact: string;
  source?: CrmMarketingMemberSource | undefined;
  status?: CrmMarketingMemberStatus | undefined;
  added_at?: string | undefined;
  unsubscribed_at?: string | undefined;
  unsubscribed_reason?: string | undefined;
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
  owner_user?: string | undefined;
  status?: CrmCampaignStatus | undefined;
  notes?: string | undefined;
}

export type CrmAttributionModel = "First Touch" | "Last Touch" | "Influenced";
export type CrmAttributionStatus = "Active" | "Cancelled";

export interface CrmCampaignAttributionData extends JsonObject {
  company: string;
  campaign: string;
  deal: string;
  model: CrmAttributionModel;
  attribution_percent: string;
  deal_amount?: string | undefined;
  currency?: string | undefined;
  deal_status?: string | undefined;
  attributed_value?: string | undefined;
  status?: CrmAttributionStatus | undefined;
  notes?: string | undefined;
}
