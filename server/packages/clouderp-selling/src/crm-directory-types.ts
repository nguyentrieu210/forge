import type { JsonObject } from "../../contracts/src/index.js";

export type CrmDirectoryStatus = "Active" | "Inactive" | "Duplicate";
export type CrmConsentStatus = "Unknown" | "Granted" | "Withdrawn";

export interface CrmOrganizationData extends JsonObject {
  company: string;
  organization_name: string;
  website?: string;
  domain?: string;
  email?: string;
  phone?: string;
  territory?: string;
  assigned_to?: string;
  linked_customer?: string;
  status?: CrmDirectoryStatus;
  duplicate_of?: string;
  notes?: string;
}

export interface CrmContactData extends JsonObject {
  company: string;
  first_name: string;
  last_name?: string;
  full_name?: string;
  organization?: string;
  job_title?: string;
  email?: string;
  phone?: string;
  territory?: string;
  assigned_to?: string;
  linked_customer?: string;
  status?: CrmDirectoryStatus;
  duplicate_of?: string;
  consent_status?: CrmConsentStatus;
  consent_at?: string;
  consent_source?: string;
  notes?: string;
}
