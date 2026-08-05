import type { JsonObject } from "../../contracts/src/index.js";

export const CRM_EXTERNAL_IDENTITY_PROVIDERS = ["shopee", "lazada", "tiktok_shop", "facebook"] as const;
export type CrmExternalIdentityProvider = typeof CRM_EXTERNAL_IDENTITY_PROVIDERS[number];
export type CrmExternalIdentityStatus = "Active" | "Revoked";

/**
 * Canonical CRM mapping from an opaque external actor fingerprint to ERP Customer.
 * Raw provider buyer/user identifiers are intentionally never persisted here.
 */
export interface CrmCustomerExternalIdentityData extends JsonObject {
  company: string;
  provider: CrmExternalIdentityProvider;
  scope_key: string;
  identity_key: string;
  scope_label?: string;
  linked_customer: string;
  crm_contact?: string;
  status: CrmExternalIdentityStatus;
  source: string;
  linked_at: string;
  linked_by: string;
  revoked_at?: string;
  revoked_by?: string;
  revocation_reason?: string;
  last_change_reason?: string;
}

/** Transient command-only fields consumed by the controller and never persisted. */
export interface CrmCustomerExternalIdentityCommandData extends CrmCustomerExternalIdentityData {
  external_scope_id?: string;
  external_identity?: string;
  change_reason?: string;
}

export interface CrmCustomer360ExternalIdentityData extends JsonObject {
  row_id: string;
  identity: string;
  provider: CrmExternalIdentityProvider;
  scope_label?: string;
  status: CrmExternalIdentityStatus;
  linked_at: string;
}
