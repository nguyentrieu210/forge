import type { JsonObject } from "../../contracts/src/index.js";

export type CrmDirectoryStatus = "Active" | "Inactive" | "Duplicate";
export type CrmConsentStatus = "Unknown" | "Granted" | "Withdrawn";

export interface CrmOrganizationData extends JsonObject {
  company: string;
  organization_name: string;
  website?: string | undefined;
  domain?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  territory?: string | undefined;
  assigned_to?: string | undefined;
  linked_customer?: string | undefined;
  status?: CrmDirectoryStatus | undefined;
  duplicate_of?: string | undefined;
  notes?: string | undefined;
}

export interface CrmContactData extends JsonObject {
  company: string;
  first_name: string;
  last_name?: string | undefined;
  full_name?: string | undefined;
  organization?: string | undefined;
  job_title?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  territory?: string | undefined;
  assigned_to?: string | undefined;
  linked_customer?: string | undefined;
  status?: CrmDirectoryStatus | undefined;
  duplicate_of?: string | undefined;
  consent_status?: CrmConsentStatus | undefined;
  consent_at?: string | undefined;
  consent_source?: string | undefined;
  notes?: string | undefined;
}
