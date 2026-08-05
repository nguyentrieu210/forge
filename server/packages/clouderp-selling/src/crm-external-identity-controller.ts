import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { CrmContactData } from "./crm-directory-types.js";
import {
  CRM_EXTERNAL_IDENTITY_PROVIDERS,
  type CrmCustomerExternalIdentityCommandData,
  type CrmCustomerExternalIdentityData,
  type CrmExternalIdentityProvider,
  type CrmExternalIdentityStatus,
} from "./crm-external-identity-types.js";

const MANAGER_ROLES = new Set(["Sales Manager", "System Manager"]);
const IDENTITY_STATUSES = new Set<CrmExternalIdentityStatus>(["Active", "Revoked"]);

export class CrmCustomerExternalIdentityController implements DocumentController<CrmCustomerExternalIdentityData> {
  readonly doctype = "CRM Customer External Identity";

  async buildPlan(context: ControllerContext<CrmCustomerExternalIdentityData>): Promise<MutationPlan<CrmCustomerExternalIdentityData>> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle("CRM Customer External Identity is an operational mapping and cannot be submitted or cancelled");
    }
    assertIdentityManager(context.command.actor.roles);

    const command = context.command.document as CrmCustomerExternalIdentityCommandData;
    const existing = context.existing?.data;
    const data = existing
      ? await normalizeUpdate(context, command, existing)
      : await normalizeCreate(context, command);
    const eventType = identityEventType(existing, data);
    const document: CanonicalDocument<CrmCustomerExternalIdentityData> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status: data.status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: [],
    };

    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      events: [domainEvent({
        type: eventType,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          company: data.company,
          provider: data.provider,
          identity_key: data.identity_key,
          linked_customer: data.linked_customer,
          status: data.status,
          ...(data.crm_contact ? { crm_contact: data.crm_contact } : {}),
          ...(data.last_change_reason ? { reason: data.last_change_reason } : {}),
        },
      })],
      result: {
        doctype: this.doctype,
        name: context.command.aggregate.name,
        version: context.nextVersion,
        docstatus: 0,
        status: data.status,
      },
    };
  }
}

async function normalizeCreate(
  context: ControllerContext<CrmCustomerExternalIdentityData>,
  command: CrmCustomerExternalIdentityCommandData,
): Promise<CrmCustomerExternalIdentityData> {
  const company = requiredText(command.company, "Company", 160);
  const provider = providerValue(command.provider);
  const externalScopeId = requiredText(command.external_scope_id, "External identity scope", 240);
  const externalIdentity = requiredText(command.external_identity, "External identity", 320);
  const identityKey = await crmCustomerExternalIdentityKey(provider, externalScopeId, externalIdentity);
  const scopeKey = await crmCustomerExternalScopeKey(provider, externalScopeId);
  const expectedName = crmCustomerExternalIdentityDocumentName(identityKey);
  if (context.command.aggregate.name !== expectedName) {
    throw errors.validation(`CRM Customer External Identity name must be ${expectedName}`);
  }
  const linkedCustomer = requiredText(command.linked_customer, "Linked Customer", 160);
  const crmContact = optionalText(command.crm_contact, 160);
  const source = requiredText(command.source, "Identity source", 240);
  const scopeLabel = optionalText(command.scope_label, 240);

  await assertReference(context, "Company", company);
  await assertReference(context, "Customer", linkedCustomer);
  if (crmContact) await assertContactBinding(context, crmContact, company, linkedCustomer);

  return {
    company,
    provider,
    scope_key: scopeKey,
    identity_key: identityKey,
    ...(scopeLabel ? { scope_label: scopeLabel } : {}),
    linked_customer: linkedCustomer,
    ...(crmContact ? { crm_contact: crmContact } : {}),
    status: "Active",
    source,
    linked_at: context.now,
    linked_by: context.command.actor.user_id,
  };
}

async function normalizeUpdate(
  context: ControllerContext<CrmCustomerExternalIdentityData>,
  command: CrmCustomerExternalIdentityCommandData,
  existing: CrmCustomerExternalIdentityData,
): Promise<CrmCustomerExternalIdentityData> {
  if (command.external_scope_id !== undefined || command.external_identity !== undefined) {
    throw errors.lifecycle("External identity source values are accepted only on initial link and are never persisted");
  }
  const company = requiredText(command.company ?? existing.company, "Company", 160);
  const provider = providerValue(command.provider ?? existing.provider);
  const identityKey = requiredHash(command.identity_key ?? existing.identity_key, "identity_key");
  const scopeKey = requiredHash(command.scope_key ?? existing.scope_key, "scope_key");
  const source = requiredText(command.source ?? existing.source, "Identity source", 240);
  if (company !== existing.company || provider !== existing.provider || identityKey !== existing.identity_key
    || scopeKey !== existing.scope_key || source !== existing.source) {
    throw errors.lifecycle("CRM Customer External Identity provider, scope, identity, company and source are immutable");
  }
  if (context.command.aggregate.name !== crmCustomerExternalIdentityDocumentName(identityKey)) {
    throw errors.lifecycle("CRM Customer External Identity document name does not match its immutable fingerprint");
  }

  const linkedCustomer = requiredText(command.linked_customer ?? existing.linked_customer, "Linked Customer", 160);
  const crmContact = optionalText(command.crm_contact ?? existing.crm_contact, 160);
  const status = statusValue(command.status ?? existing.status);
  const scopeLabel = optionalText(command.scope_label ?? existing.scope_label, 240);
  const targetChanged = linkedCustomer !== existing.linked_customer || crmContact !== existing.crm_contact;
  const statusChanged = status !== existing.status;
  const changeReason = optionalText(command.change_reason, 500);
  if ((targetChanged || statusChanged) && !changeReason) {
    throw errors.validation("Reassigning, revoking or reactivating an external identity requires change_reason");
  }

  await assertReference(context, "Customer", linkedCustomer);
  if (crmContact) await assertContactBinding(context, crmContact, company, linkedCustomer);

  const data: CrmCustomerExternalIdentityData = {
    company,
    provider,
    scope_key: scopeKey,
    identity_key: identityKey,
    ...(scopeLabel ? { scope_label: scopeLabel } : {}),
    linked_customer: linkedCustomer,
    ...(crmContact ? { crm_contact: crmContact } : {}),
    status,
    source,
    linked_at: existing.linked_at,
    linked_by: existing.linked_by,
    ...(changeReason ? { last_change_reason: changeReason } : existing.last_change_reason ? { last_change_reason: existing.last_change_reason } : {}),
  };

  if (status === "Revoked") {
    data.revoked_at = statusChanged ? context.now : existing.revoked_at ?? context.now;
    data.revoked_by = statusChanged ? context.command.actor.user_id : existing.revoked_by ?? context.command.actor.user_id;
    data.revocation_reason = statusChanged ? changeReason! : existing.revocation_reason ?? changeReason ?? "Revoked";
  }
  return data;
}

function identityEventType(
  existing: CrmCustomerExternalIdentityData | undefined,
  data: CrmCustomerExternalIdentityData,
): string {
  if (!existing) return "crm.customer_external_identity.linked";
  if (existing.status !== data.status) return data.status === "Revoked"
    ? "crm.customer_external_identity.revoked"
    : "crm.customer_external_identity.reactivated";
  if (existing.linked_customer !== data.linked_customer || existing.crm_contact !== data.crm_contact) {
    return "crm.customer_external_identity.reassigned";
  }
  return "crm.customer_external_identity.updated";
}

export async function crmCustomerExternalIdentityKey(
  provider: CrmExternalIdentityProvider,
  externalScopeId: string,
  externalIdentity: string,
): Promise<string> {
  const normalizedProvider = providerValue(provider);
  const scope = requiredText(externalScopeId, "External identity scope", 240);
  const identity = requiredText(externalIdentity, "External identity", 320);
  return sha256Hex(JSON.stringify(["crm-external-identity-v1", normalizedProvider, scope, identity]));
}

export async function crmCustomerExternalScopeKey(
  provider: CrmExternalIdentityProvider,
  externalScopeId: string,
): Promise<string> {
  const normalizedProvider = providerValue(provider);
  const scope = requiredText(externalScopeId, "External identity scope", 240);
  return sha256Hex(JSON.stringify(["crm-external-scope-v1", normalizedProvider, scope]));
}

export function crmCustomerExternalIdentityDocumentName(identityKey: string): string {
  return `CRM-EXT-${requiredHash(identityKey, "identity_key")}`;
}

function assertIdentityManager(roles: readonly string[]): void {
  if (!roles.some((role) => MANAGER_ROLES.has(role))) {
    throw errors.permission("Only Sales Manager or System Manager may manage external customer identities");
  }
}

async function assertReference(
  context: ControllerContext<CrmCustomerExternalIdentityData>,
  doctype: string,
  name: string,
): Promise<void> {
  if (await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) return;
  if (await context.reader.getDocument(context.command.tenant_id, doctype, name)) return;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}

async function assertContactBinding(
  context: ControllerContext<CrmCustomerExternalIdentityData>,
  contactName: string,
  company: string,
  customer: string,
): Promise<void> {
  const contact = await context.reader.getDocument<CrmContactData>(context.command.tenant_id, "CRM Contact", contactName);
  if (!contact || contact.data.company !== company || (contact.data.status ?? "Active") !== "Active") {
    throw errors.reference(`Active CRM Contact ${contactName} is required in the same company`);
  }
  if (contact.data.linked_customer !== customer) {
    throw errors.reference(`CRM Contact ${contactName} must already be linked to Customer ${customer}`);
  }
}

function providerValue(value: unknown): CrmExternalIdentityProvider {
  if (typeof value !== "string" || !CRM_EXTERNAL_IDENTITY_PROVIDERS.includes(value as CrmExternalIdentityProvider)) {
    throw errors.validation("Unsupported external customer identity provider");
  }
  return value as CrmExternalIdentityProvider;
}

function statusValue(value: unknown): CrmExternalIdentityStatus {
  if (typeof value !== "string" || !IDENTITY_STATUSES.has(value as CrmExternalIdentityStatus)) {
    throw errors.validation("External customer identity status is invalid");
  }
  return value as CrmExternalIdentityStatus;
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation("CRM external identity text fields must be strings");
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation("CRM external identity text field is invalid");
  return normalized;
}

function requiredText(value: unknown, label: string, max: number): string {
  const normalized = optionalText(value, max);
  if (!normalized) throw errors.validation(`${label} is required`);
  return normalized;
}

function requiredHash(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw errors.validation(`${field} is invalid`);
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
