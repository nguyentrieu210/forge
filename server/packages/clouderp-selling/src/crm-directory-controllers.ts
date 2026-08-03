import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type {
  CrmConsentStatus,
  CrmContactData,
  CrmDirectoryStatus,
  CrmOrganizationData,
} from "./crm-directory-types.js";

const DIRECTORY_STATUSES = new Set<CrmDirectoryStatus>(["Active", "Inactive", "Duplicate"]);
const CONSENT_STATUSES = new Set<CrmConsentStatus>(["Unknown", "Granted", "Withdrawn"]);

abstract class CrmDirectoryController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle(`${this.doctype} is an operational CRM record and cannot be submitted or cancelled`);
    }
    const data = await this.normalize(context);
    const status = typeof data.status === "string" && data.status ? data.status : "Active";
    const document: CanonicalDocument<T> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: [],
    };
    const eventTypes = this.eventTypes(context, data);
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      events: eventTypes.map((type) => domainEvent({
        type,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: this.eventPayload(context, data, type),
      })),
      result: {
        doctype: this.doctype,
        name: context.command.aggregate.name,
        version: context.nextVersion,
        docstatus: 0,
        status,
      },
    };
  }

  protected abstract eventTypes(context: ControllerContext<T>, data: T): string[];
  protected abstract eventPayload(context: ControllerContext<T>, data: T, type: string): JsonObject;
}

export class CrmOrganizationController extends CrmDirectoryController<CrmOrganizationData> {
  readonly doctype = "CRM Organization";

  async normalize(context: ControllerContext<CrmOrganizationData>): Promise<CrmOrganizationData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.organization_name = requiredText(input.organization_name, "Organization name");
    input.website = optionalText(input.website);
    input.domain = optionalText(input.domain);
    input.email = optionalText(input.email)?.toLowerCase();
    input.phone = optionalText(input.phone);
    input.territory = optionalText(input.territory);
    input.assigned_to = optionalText(input.assigned_to);
    input.linked_customer = optionalText(input.linked_customer);
    input.duplicate_of = optionalText(input.duplicate_of);
    input.notes = optionalText(input.notes);

    await assertRecord(context, "Company", input.company);
    if (input.territory) await assertRecord(context, "Territory", input.territory);
    if (input.assigned_to) await assertRecord(context, "User", input.assigned_to);
    if (input.linked_customer) await assertRecord(context, "Customer", input.linked_customer);
    if (input.email) assertEmail(input.email, "Organization email");

    const websiteDomain = input.website ? websiteHost(input.website, "Organization website") : undefined;
    if (input.domain) input.domain = normalizeDomain(input.domain, "Organization domain");
    if (!input.domain && websiteDomain) input.domain = websiteDomain;
    if (input.domain && websiteDomain && websiteDomain !== input.domain && !websiteDomain.endsWith(`.${input.domain}`)) {
      throw errors.validation("Organization website host must match the configured domain");
    }

    const status = normalizeEnum(input.status ?? "Active", DIRECTORY_STATUSES, "Organization status");
    await enforceDuplicateState(context, this.doctype, input.company, status, input.duplicate_of);
    if (status === "Duplicate") {
      const canonical = await requireDocumentData<CrmOrganizationData>(context, this.doctype, input.duplicate_of!);
      if (canonical.company !== input.company) throw errors.reference("Duplicate organization must belong to the same company");
    } else {
      delete input.duplicate_of;
      const duplicate = await findOrganizationDuplicate(context, input);
      if (duplicate) {
        throw errors.validation(`Possible duplicate CRM Organization ${duplicate}; review and mark this record as Duplicate if intentional`);
      }
    }
    input.status = status;
    return input;
  }

  protected eventTypes(context: ControllerContext<CrmOrganizationData>, data: CrmOrganizationData): string[] {
    const events = [context.command.action === "create" ? "crm.organization.created" : "crm.organization.updated"];
    const before = context.existing?.data.status ?? "Active";
    if (before !== data.status && data.status === "Duplicate") events.push("crm.organization.duplicate_marked");
    if (before === "Duplicate" && data.status !== "Duplicate") events.push("crm.organization.reactivated");
    return events;
  }

  protected eventPayload(context: ControllerContext<CrmOrganizationData>, data: CrmOrganizationData, _type: string): JsonObject {
    return {
      action: context.command.action,
      company: data.company,
      status: data.status ?? "Active",
      ...(data.domain ? { domain: data.domain } : {}),
      ...(data.linked_customer ? { linked_customer: data.linked_customer } : {}),
      ...(data.duplicate_of ? { duplicate_of: data.duplicate_of } : {}),
    };
  }
}

export class CrmContactController extends CrmDirectoryController<CrmContactData> {
  readonly doctype = "CRM Contact";

  async normalize(context: ControllerContext<CrmContactData>): Promise<CrmContactData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.first_name = requiredText(input.first_name, "First name");
    input.last_name = optionalText(input.last_name);
    input.full_name = [input.first_name, input.last_name].filter(Boolean).join(" ");
    input.organization = optionalText(input.organization);
    input.job_title = optionalText(input.job_title);
    input.email = optionalText(input.email)?.toLowerCase();
    input.phone = optionalText(input.phone);
    input.territory = optionalText(input.territory);
    input.assigned_to = optionalText(input.assigned_to);
    input.linked_customer = optionalText(input.linked_customer);
    input.duplicate_of = optionalText(input.duplicate_of);
    input.consent_at = optionalText(input.consent_at);
    input.consent_source = optionalText(input.consent_source);
    input.notes = optionalText(input.notes);

    await assertRecord(context, "Company", input.company);
    if (input.organization) {
      const organization = await requireDocumentData<CrmOrganizationData>(context, "CRM Organization", input.organization);
      if (organization.company !== input.company) throw errors.reference("CRM Contact organization belongs to another company");
    }
    if (input.territory) await assertRecord(context, "Territory", input.territory);
    if (input.assigned_to) await assertRecord(context, "User", input.assigned_to);
    if (input.linked_customer) await assertRecord(context, "Customer", input.linked_customer);
    if (input.email) assertEmail(input.email, "Contact email");

    const status = normalizeEnum(input.status ?? "Active", DIRECTORY_STATUSES, "Contact status");
    await enforceDuplicateState(context, this.doctype, input.company, status, input.duplicate_of);
    if (status === "Duplicate") {
      const canonical = await requireDocumentData<CrmContactData>(context, this.doctype, input.duplicate_of!);
      if (canonical.company !== input.company) throw errors.reference("Duplicate contact must belong to the same company");
    } else {
      delete input.duplicate_of;
      const duplicate = await findContactDuplicate(context, input);
      if (duplicate) {
        throw errors.validation(`Possible duplicate CRM Contact ${duplicate}; review and mark this record as Duplicate if intentional`);
      }
    }

    const consentStatus = normalizeEnum(input.consent_status ?? "Unknown", CONSENT_STATUSES, "Consent status");
    const previousConsent = context.existing
      ? normalizeEnum(context.existing.data.consent_status ?? "Unknown", CONSENT_STATUSES, "Existing consent status")
      : undefined;
    if (consentStatus === "Unknown") {
      delete input.consent_at;
      delete input.consent_source;
    } else {
      const changed = previousConsent !== consentStatus;
      if (changed && context.command.action !== "create") {
        const suppliedAt = optionalText(context.command.document.consent_at);
        const suppliedSource = optionalText(context.command.document.consent_source);
        if (!suppliedAt || !suppliedSource) {
          throw errors.validation("Changing consent status requires fresh consent_at and consent_source evidence");
        }
        input.consent_at = suppliedAt;
        input.consent_source = suppliedSource;
      }
      input.consent_at = requiredText(input.consent_at, "Consent evidence time");
      input.consent_source = requiredText(input.consent_source, "Consent evidence source");
      assertDatetime(input.consent_at, "Consent evidence time");
      if (Date.parse(input.consent_at) > Date.parse(context.now)) {
        throw errors.validation("Consent evidence time cannot be in the future");
      }
    }

    input.status = status;
    input.consent_status = consentStatus;
    return input;
  }

  protected eventTypes(context: ControllerContext<CrmContactData>, data: CrmContactData): string[] {
    const events = [context.command.action === "create" ? "crm.contact.created" : "crm.contact.updated"];
    const beforeStatus = context.existing?.data.status ?? "Active";
    const beforeConsent = context.existing?.data.consent_status ?? "Unknown";
    if (beforeStatus !== data.status && data.status === "Duplicate") events.push("crm.contact.duplicate_marked");
    if (beforeStatus === "Duplicate" && data.status !== "Duplicate") events.push("crm.contact.reactivated");
    if (beforeConsent !== data.consent_status) events.push("crm.contact.consent_changed");
    return events;
  }

  protected eventPayload(context: ControllerContext<CrmContactData>, data: CrmContactData, _type: string): JsonObject {
    return {
      action: context.command.action,
      company: data.company,
      status: data.status ?? "Active",
      consent_status: data.consent_status ?? "Unknown",
      ...(data.organization ? { organization: data.organization } : {}),
      ...(data.linked_customer ? { linked_customer: data.linked_customer } : {}),
      ...(data.duplicate_of ? { duplicate_of: data.duplicate_of } : {}),
    };
  }
}

function mergeExisting<T extends JsonObject>(context: ControllerContext<T>): T {
  return {
    ...(context.existing ? structuredClone(context.existing.data) : {}),
    ...structuredClone(context.command.document),
  } as T;
}

function assertStableCompany<T extends JsonObject>(context: ControllerContext<T>, company: string): void {
  if (!context.existing) return;
  const previous = context.existing.data.company;
  if (typeof previous === "string" && previous !== company) {
    throw errors.lifecycle(`${context.command.aggregate.doctype} company cannot change after creation`);
  }
}

async function enforceDuplicateState<T extends JsonObject>(
  context: ControllerContext<T>,
  doctype: string,
  company: string,
  status: CrmDirectoryStatus,
  duplicateOf: string | undefined,
): Promise<void> {
  const previousStatus = context.existing
    ? normalizeEnum(context.existing.data.status ?? "Active", DIRECTORY_STATUSES, `Existing ${doctype} status`)
    : undefined;
  if (status === "Duplicate") {
    if (!duplicateOf) throw errors.validation(`${doctype} marked Duplicate requires duplicate_of`);
    if (duplicateOf === context.command.aggregate.name) throw errors.validation(`${doctype} cannot be a duplicate of itself`);
    if (previousStatus !== "Duplicate") assertSalesManager(context.command.actor.roles, `Only a Sales Manager may mark ${doctype} as Duplicate`);
    const target = await requireDocumentData<JsonObject>(context, doctype, duplicateOf);
    if (target.company !== company) throw errors.reference(`${doctype} duplicate target belongs to another company`);
    if (target.status === "Duplicate") throw errors.reference(`${doctype} duplicate target must be a canonical non-duplicate record`);
  } else if (previousStatus === "Duplicate") {
    assertSalesManager(context.command.actor.roles, `Only a Sales Manager may reactivate ${doctype}`);
  }
}

async function findOrganizationDuplicate(
  context: ControllerContext<CrmOrganizationData>,
  input: CrmOrganizationData,
): Promise<string | undefined> {
  const documents = await context.reader.listDocumentsByDoctype<CrmOrganizationData>(context.command.tenant_id, "CRM Organization");
  const ownName = context.command.aggregate.name;
  const identityName = normalizeIdentityText(input.organization_name);
  for (const candidate of documents) {
    if (candidate.name === ownName || candidate.data.company !== input.company || candidate.data.status === "Duplicate") continue;
    if (input.domain) {
      const candidateDomain = optionalText(candidate.data.domain);
      if (candidateDomain && normalizeDomain(candidateDomain, "Organization domain") === input.domain) return candidate.name;
      continue;
    }
    if (normalizeIdentityText(candidate.data.organization_name) === identityName) return candidate.name;
  }
  return undefined;
}

async function findContactDuplicate(
  context: ControllerContext<CrmContactData>,
  input: CrmContactData,
): Promise<string | undefined> {
  const documents = await context.reader.listDocumentsByDoctype<CrmContactData>(context.command.tenant_id, "CRM Contact");
  const ownName = context.command.aggregate.name;
  const phone = normalizePhone(input.phone);
  for (const candidate of documents) {
    if (candidate.name === ownName || candidate.data.company !== input.company || candidate.data.status === "Duplicate") continue;
    const candidateEmail = optionalText(candidate.data.email)?.toLowerCase();
    if (input.email && candidateEmail === input.email) return candidate.name;
    if (!input.email && phone && !candidateEmail && normalizePhone(candidate.data.phone) === phone) return candidate.name;
  }
  return undefined;
}

async function assertRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  const tenantId = context.command.tenant_id;
  if (await context.reader.hasMasterRecord(tenantId, doctype, name)) return;
  if (await context.reader.getDocument(tenantId, doctype, name)) return;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}

async function requireDocumentData<R extends JsonObject, T extends JsonObject = JsonObject>(
  context: ControllerContext<T>,
  doctype: string,
  name: string,
): Promise<R> {
  const document = await context.reader.getDocument<R>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
  return document.data;
}

function requiredText(value: unknown, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${label} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation("CRM text fields must be strings");
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw errors.validation(`${label} must be one of ${[...allowed].join(", ")}`);
  }
  return value as T;
}

function assertSalesManager(roles: string[], message: string): void {
  if (!roles.some((role) => role === "Sales Manager" || role === "System Manager")) throw errors.permission(message);
}

function assertEmail(value: string, label: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw errors.validation(`${label} is invalid`);
}

function assertDatetime(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw errors.validation(`${label} must be an ISO datetime`);
}

function websiteHost(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw errors.validation(`${label} must be an absolute http(s) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw errors.validation(`${label} must use http or https`);
  return normalizeDomain(url.hostname, label);
}

function normalizeDomain(value: string, label: string): string {
  const domain = value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw errors.validation(`${label} is not a valid domain`);
  }
  return domain;
}

function normalizeIdentityText(value: unknown): string {
  return optionalText(value)
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
}

function normalizePhone(value: unknown): string | undefined {
  const text = optionalText(value);
  if (!text) return undefined;
  const plus = text.startsWith("+") ? "+" : "";
  const digits = text.replace(/\D/g, "");
  return digits ? `${plus}${digits}` : undefined;
}
