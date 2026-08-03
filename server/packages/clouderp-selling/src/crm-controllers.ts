import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { fromScaledInt, percentOfMinor, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type {
  CrmActivityData,
  CrmActivityReferenceDoctype,
  CrmActivityStatus,
  CrmActivityType,
  LeadData,
  LeadStatus,
  OpportunityData,
  OpportunityPartyType,
  OpportunityStatus,
} from "./crm-types.js";

const LEAD_STATUSES = new Set<LeadStatus>(["New", "Open", "Qualified", "Unqualified", "Converted"]);
const OPPORTUNITY_PARTY_TYPES = new Set<OpportunityPartyType>(["CRM Lead", "Customer"]);
const OPPORTUNITY_STATUSES = new Set<OpportunityStatus>(["Open", "Won", "Lost"]);
const ACTIVITY_TYPES = new Set<CrmActivityType>(["Call", "Email", "Meeting", "Task"]);
const ACTIVITY_STATUSES = new Set<CrmActivityStatus>(["Open", "Completed", "Cancelled"]);
const ACTIVITY_REFERENCES = new Set<CrmActivityReferenceDoctype>(["CRM Lead", "CRM Deal", "Customer"]);

abstract class CrmRecordController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle(`${this.doctype} is an operational CRM record and cannot be submitted or cancelled`);
    }
    const data = await this.normalize(context);
    const status = this.status(data);
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

  protected status(data: T): string {
    return typeof data.status === "string" && data.status ? data.status : "Open";
  }

  protected eventTypes(context: ControllerContext<T>, _data: T): string[] {
    return [`crm.${slug(this.doctype)}.${context.command.action === "create" ? "created" : "updated"}`];
  }

  protected eventPayload(context: ControllerContext<T>, data: T, _type: string): JsonObject {
    return { action: context.command.action, status: this.status(data) };
  }
}

export class CrmLeadController extends CrmRecordController<LeadData> {
  readonly doctype = "CRM Lead";

  async normalize(context: ControllerContext<LeadData>): Promise<LeadData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.lead_name = requiredText(input.lead_name, "Lead name");
    input.organization_name = optionalText(input.organization_name);
    input.email_id = optionalText(input.email_id);
    input.mobile_no = optionalText(input.mobile_no);
    input.lead_source = optionalText(input.lead_source);
    input.territory = optionalText(input.territory);
    input.assigned_to = optionalText(input.assigned_to);
    input.converted_customer = optionalText(input.converted_customer);
    input.converted_deal = optionalText(input.converted_deal);
    input.notes = optionalText(input.notes);
    if (input.email_id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email_id)) {
      throw errors.validation("CRM Lead email is invalid");
    }

    await assertRecord(context, "Company", input.company);
    if (input.lead_source) await requireActiveRecordData(context, "CRM Lead Source", input.lead_source);
    if (input.territory) await assertRecord(context, "Territory", input.territory);
    if (input.assigned_to) await assertRecord(context, "User", input.assigned_to);

    const nextStatus = normalizeEnum(input.status ?? "New", LEAD_STATUSES, "CRM Lead status");
    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "New", LEAD_STATUSES, "Existing CRM Lead status")
      : undefined;
    assertLeadTransition(previousStatus, nextStatus, context.command.actor.roles);

    if (nextStatus === "Converted") {
      if (!input.converted_customer) throw errors.validation("Converted CRM Lead requires a Customer reference");
      if (!input.converted_deal) throw errors.validation("Converted CRM Lead requires a CRM Deal reference");
      await assertRecord(context, "Customer", input.converted_customer);
      const deal = await requireRecordData(context, "CRM Deal", input.converted_deal);
      if (deal.company !== input.company || deal.party_type !== "CRM Lead" || deal.party !== context.command.aggregate.name) {
        throw errors.reference(`CRM Deal ${input.converted_deal} is not linked to this CRM Lead and company`);
      }
      const previousCustomer = context.existing ? optionalText(context.existing.data.converted_customer) : undefined;
      const previousDeal = context.existing ? optionalText(context.existing.data.converted_deal) : undefined;
      if (previousStatus === "Converted" && previousCustomer && input.converted_customer !== previousCustomer) {
        throw errors.lifecycle("Reopen CRM Lead before changing its converted Customer reference");
      }
      if (previousStatus === "Converted" && previousDeal && input.converted_deal !== previousDeal) {
        throw errors.lifecycle("Reopen CRM Lead before changing its converted CRM Deal reference");
      }
    } else {
      delete input.converted_customer;
      delete input.converted_deal;
    }
    input.status = nextStatus;
    return input;
  }

  protected eventTypes(context: ControllerContext<LeadData>, data: LeadData): string[] {
    const events = [context.command.action === "create" ? "crm.lead.created" : "crm.lead.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && context.command.action !== "create") events.push("crm.lead.status_changed");
    if (data.status === "Converted" && before !== "Converted") events.push("crm.lead.converted");
    return events;
  }

  protected eventPayload(context: ControllerContext<LeadData>, data: LeadData, _type: string): JsonObject {
    return {
      action: context.command.action,
      status: data.status ?? "New",
      company: data.company,
      ...(data.lead_source ? { lead_source: data.lead_source } : {}),
      ...(data.territory ? { territory: data.territory } : {}),
      ...(data.converted_deal ? { converted_deal: data.converted_deal } : {}),
    };
  }
}

export class CrmDealController extends CrmRecordController<OpportunityData> {
  readonly doctype = "CRM Deal";

  async normalize(context: ControllerContext<OpportunityData>): Promise<OpportunityData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.opportunity_name = requiredText(input.opportunity_name, "Deal name");
    input.party_type = normalizeEnum(input.party_type, OPPORTUNITY_PARTY_TYPES, "CRM Deal party type");
    input.party = requiredText(input.party, "CRM Deal party");
    input.pipeline = requiredText(input.pipeline, "CRM Pipeline");
    input.sales_stage = requiredText(input.sales_stage, "CRM Stage");
    input.currency = requiredText(input.currency, "Currency");
    input.opportunity_amount = normalizeNonNegativeDecimal(input.opportunity_amount, "CRM Deal amount");
    input.expected_close_date = requiredText(input.expected_close_date, "Expected close date");
    assertDate(input.expected_close_date, "Expected close date");
    input.lead_source = optionalText(input.lead_source);
    input.territory = optionalText(input.territory);
    input.close_reason = optionalText(input.close_reason);
    input.assigned_to = optionalText(input.assigned_to);
    input.notes = optionalText(input.notes);

    await assertRecord(context, "Company", input.company);
    const party = await requireRecordData(context, input.party_type, input.party);
    if (input.party_type === "CRM Lead" && typeof party.company === "string" && party.company !== input.company) {
      throw errors.reference(`CRM Lead ${input.party} belongs to another company`);
    }
    await assertRecord(context, "Currency", input.currency);
    await requireActiveRecordData(context, "CRM Pipeline", input.pipeline);
    if (input.lead_source) await requireActiveRecordData(context, "CRM Lead Source", input.lead_source);
    if (input.territory) await assertRecord(context, "Territory", input.territory);
    if (input.assigned_to) await assertRecord(context, "User", input.assigned_to);

    const stage = await requireActiveRecordData(context, "CRM Stage", input.sales_stage);
    const stagePipeline = requiredText(stage.pipeline, `CRM Stage ${input.sales_stage} pipeline`);
    if (stagePipeline !== input.pipeline) {
      throw errors.reference(`CRM Stage ${input.sales_stage} does not belong to CRM Pipeline ${input.pipeline}`);
    }
    const stageType = normalizeEnum(stage.stage_type ?? "Open", OPPORTUNITY_STATUSES, `CRM Stage ${input.sales_stage} type`);
    const probability = stageType === "Won"
      ? "100"
      : stageType === "Lost"
        ? "0"
        : normalizePercent(stage.probability ?? "0", `CRM Stage ${input.sales_stage} probability`);
    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "Open", OPPORTUNITY_STATUSES, "Existing CRM Deal status")
      : undefined;
    assertOpportunityTransition(previousStatus, stageType, context.command.actor.roles);

    if (stageType === "Won" || stageType === "Lost") {
      if (!input.close_reason) throw errors.validation(`${stageType} CRM Deal requires a configured close reason`);
      const reason = await requireActiveRecordData(context, "CRM Deal Close Reason", input.close_reason);
      const outcome = normalizeEnum(reason.outcome, new Set<OpportunityStatus>(["Won", "Lost"]), `Close Reason ${input.close_reason} outcome`);
      if (outcome !== stageType) {
        throw errors.reference(`Close Reason ${input.close_reason} is configured for ${outcome}, not ${stageType}`);
      }
    } else {
      delete input.close_reason;
    }

    input.status = stageType;
    input.probability = probability;
    input.weighted_value = deriveWeightedValue(input.opportunity_amount, probability);
    return input;
  }

  protected eventTypes(context: ControllerContext<OpportunityData>, data: OpportunityData): string[] {
    const events = [context.command.action === "create" ? "crm.deal.created" : "crm.deal.updated"];
    const beforeStage = context.existing?.data.sales_stage;
    const beforeStatus = context.existing?.data.status;
    if (context.command.action !== "create" && beforeStage !== data.sales_stage) events.push("crm.deal.stage_changed");
    if (data.status === "Won" && beforeStatus !== "Won") events.push("crm.deal.won");
    if (data.status === "Lost" && beforeStatus !== "Lost") events.push("crm.deal.lost");
    return events;
  }

  protected eventPayload(context: ControllerContext<OpportunityData>, data: OpportunityData, _type: string): JsonObject {
    return {
      action: context.command.action,
      status: data.status ?? "Open",
      company: data.company,
      pipeline: data.pipeline,
      sales_stage: data.sales_stage,
      probability: data.probability ?? "0",
      weighted_value: data.weighted_value ?? "0.000000",
      ...(data.close_reason ? { close_reason: data.close_reason } : {}),
    };
  }
}

export class CrmActivityController extends CrmRecordController<CrmActivityData> {
  readonly doctype = "CRM Activity";

  async normalize(context: ControllerContext<CrmActivityData>): Promise<CrmActivityData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.reference_doctype = normalizeEnum(input.reference_doctype, ACTIVITY_REFERENCES, "Activity reference type");
    input.reference_name = requiredText(input.reference_name, "Activity reference");
    input.activity_type = normalizeEnum(input.activity_type, ACTIVITY_TYPES, "Activity type");
    input.subject = requiredText(input.subject, "Activity subject");
    input.status = normalizeEnum(input.status ?? "Open", ACTIVITY_STATUSES, "Activity status");
    input.activity_at = optionalText(input.activity_at) ?? context.now;
    input.due_at = optionalText(input.due_at);
    input.assigned_to = optionalText(input.assigned_to);
    input.outcome = optionalText(input.outcome);
    input.notes = optionalText(input.notes);

    await assertRecord(context, "Company", input.company);
    if (input.assigned_to) await assertRecord(context, "User", input.assigned_to);
    assertDatetime(input.activity_at, "Activity time");
    if (input.due_at) {
      assertDatetime(input.due_at, "Activity due time");
      if (Date.parse(input.due_at) < Date.parse(input.activity_at)) {
        throw errors.validation("Activity due time cannot precede activity time");
      }
    }
    const reference = await requireRecordData(context, input.reference_doctype, input.reference_name);
    if ((input.reference_doctype === "CRM Lead" || input.reference_doctype === "CRM Deal")
      && typeof reference.company === "string" && reference.company !== input.company) {
      throw errors.reference(`${input.reference_doctype} ${input.reference_name} belongs to another company`);
    }

    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "Open", ACTIVITY_STATUSES, "Existing Activity status")
      : undefined;
    assertActivityTransition(context, previousStatus, input.status);
    if (input.status === "Completed") {
      const wasCompleted = previousStatus === "Completed";
      input.completed_at = wasCompleted && typeof context.existing?.data.completed_at === "string"
        ? context.existing.data.completed_at
        : context.now;
    } else {
      delete input.completed_at;
    }
    return input;
  }

  protected eventTypes(context: ControllerContext<CrmActivityData>, data: CrmActivityData): string[] {
    const events = [context.command.action === "create" ? "crm.activity.created" : "crm.activity.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && context.command.action !== "create") events.push("crm.activity.status_changed");
    if (data.status === "Completed" && before !== "Completed") events.push("crm.activity.completed");
    return events;
  }

  protected eventPayload(context: ControllerContext<CrmActivityData>, data: CrmActivityData, _type: string): JsonObject {
    return {
      action: context.command.action,
      status: data.status ?? "Open",
      company: data.company,
      reference_doctype: data.reference_doctype,
      reference_name: data.reference_name,
      activity_type: data.activity_type,
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

async function assertRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  const tenantId = context.command.tenant_id;
  if (await context.reader.hasMasterRecord(tenantId, doctype, name)) return;
  if (await context.reader.getDocument(tenantId, doctype, name)) return;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}

async function requireRecordData<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<JsonObject> {
  const tenantId = context.command.tenant_id;
  const document = await context.reader.getDocument<JsonObject>(tenantId, doctype, name);
  if (document) return document.data;
  const master = await context.reader.getMasterRecordData(tenantId, doctype, name);
  if (master) return master;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}

async function requireActiveRecordData<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<JsonObject> {
  const data = await requireRecordData(context, doctype, name);
  if (truthy(data.disabled)) throw errors.reference(`${doctype} ${name} is disabled`);
  return data;
}

function assertLeadTransition(previous: LeadStatus | undefined, next: LeadStatus, roles: string[]): void {
  if (!previous || previous === next) return;
  if (previous === "Converted") {
    if (next !== "Qualified" && next !== "Open") throw errors.lifecycle(`Converted CRM Lead cannot move directly to ${next}`);
    assertSalesManager(roles, "Only a Sales Manager may reopen a converted CRM Lead");
    return;
  }
  if (previous === "Unqualified") {
    if (next !== "Open") throw errors.lifecycle(`Unqualified CRM Lead cannot move directly to ${next}`);
    assertSalesManager(roles, "Only a Sales Manager may reopen an unqualified CRM Lead");
    return;
  }
  const allowed: Record<LeadStatus, ReadonlySet<LeadStatus>> = {
    New: new Set(["Open"]),
    Open: new Set(["Qualified", "Unqualified"]),
    Qualified: new Set(["Open", "Unqualified", "Converted"]),
    Unqualified: new Set(),
    Converted: new Set(),
  };
  if (!allowed[previous].has(next)) throw errors.lifecycle(`CRM Lead cannot move from ${previous} to ${next}`);
}

function assertOpportunityTransition(previous: OpportunityStatus | undefined, next: OpportunityStatus, roles: string[]): void {
  if (!previous || previous === next) return;
  if ((previous === "Won" || previous === "Lost") && next === "Open") {
    assertSalesManager(roles, `Only a Sales Manager may reopen a ${previous.toLowerCase()} CRM Deal`);
    return;
  }
  if (previous === "Won" || previous === "Lost") throw errors.lifecycle(`CRM Deal cannot move from ${previous} directly to ${next}`);
}

function assertActivityTransition(
  context: ControllerContext<CrmActivityData>,
  previous: CrmActivityStatus | undefined,
  next: CrmActivityStatus,
): void {
  if (!previous) return;
  if (previous === "Open") return;
  if (next === previous) {
    throw errors.lifecycle("Completed or cancelled CRM Activity is immutable; reopen it before correction");
  }
  if (next === "Open") {
    assertSalesManager(context.command.actor.roles, `Only a Sales Manager may reopen a ${previous.toLowerCase()} CRM Activity`);
    const changedKeys = Object.keys(context.command.document).filter((key) => key !== "status");
    if (changedKeys.length) throw errors.lifecycle("Reopen CRM Activity in a status-only correction command before editing details");
    return;
  }
  throw errors.lifecycle(`CRM Activity cannot move from ${previous} directly to ${next}`);
}

function assertSalesManager(roles: string[], message: string): void {
  if (!roles.some((role) => role === "Sales Manager" || role === "System Manager")) throw errors.permission(message);
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

function normalizeNonNegativeDecimal(value: unknown, label: string): string {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d{1,6})?$/.test(text)) {
    throw errors.validation(`${label} must be a non-negative decimal with at most 6 decimal places`);
  }
  return text;
}

function normalizePercent(value: unknown, label: string): string {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw errors.validation(`${label} must be a percentage from 0 to 100`);
  const numeric = Number(text);
  if (numeric < 0 || numeric > 100) throw errors.validation(`${label} must be a percentage from 0 to 100`);
  return text;
}

function deriveWeightedValue(amount: string, probability: string): string {
  const amountScaled = toScaledInt(amount, 6, "CRM Deal amount");
  const weightedScaled = percentOfMinor(amountScaled, probability, 6, "CRM Deal probability");
  return fromScaledInt(weightedScaled, 6);
}

function assertDate(value: string, label: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw errors.validation(`${label} must use YYYY-MM-DD`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw errors.validation(`${label} is not a valid date`);
  }
}

function assertDatetime(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw errors.validation(`${label} must be an ISO datetime`);
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
