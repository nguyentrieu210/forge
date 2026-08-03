import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { fromScaledInt, percentOfMinor, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { OpportunityData } from "./crm-types.js";
import type {
  CrmCommissionAccrualData,
  CrmCommissionAccrualStatus,
  CrmCommissionRuleData,
  CrmCommissionRuleStatus,
  CrmSalesTargetData,
  CrmSalesTargetOwnerType,
  CrmSalesTargetStatus,
} from "./crm-performance-types.js";

const TARGET_OWNER_TYPES = new Set<CrmSalesTargetOwnerType>(["User", "Territory", "CRM Sales Team"]);
const TARGET_STATUSES = new Set<CrmSalesTargetStatus>(["Draft", "Active", "Closed"]);
const RULE_STATUSES = new Set<CrmCommissionRuleStatus>(["Active", "Inactive"]);
const ACCRUAL_STATUSES = new Set<CrmCommissionAccrualStatus>(["Draft", "Approved", "Paid", "Cancelled"]);

abstract class CrmPerformanceController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;
  abstract eventTypes(context: ControllerContext<T>, data: T): string[];
  abstract eventPayload(context: ControllerContext<T>, data: T, type: string): JsonObject;

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    if (context.command.action === "submit" || context.command.action === "cancel") throw errors.lifecycle(`${this.doctype} is managed through CRM lifecycle states, not submit/cancel`);
    const data = await this.normalize(context);
    const status = typeof data.status === "string" && data.status ? data.status : "Draft";
    const document: CanonicalDocument<T> = {
      tenant_id: context.command.tenant_id, doctype: this.doctype, name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id, docstatus: 0, status, version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now, modified_at: context.now, data, children: [],
    };
    return {
      command: context.command, document, gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [],
      events: this.eventTypes(context, data).map((type) => domainEvent({
        type, tenantId: context.command.tenant_id, aggregate: context.command.aggregate, aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id, commandId: context.command.command_id, occurredAt: context.now,
        payload: this.eventPayload(context, data, type),
      })),
      result: { doctype: this.doctype, name: context.command.aggregate.name, version: context.nextVersion, docstatus: 0, status },
    };
  }
}

export class CrmSalesTargetController extends CrmPerformanceController<CrmSalesTargetData> {
  readonly doctype = "CRM Sales Target";

  async normalize(context: ControllerContext<CrmSalesTargetData>): Promise<CrmSalesTargetData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Sales Targets");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.target_owner_type = normalizeEnum(input.target_owner_type, TARGET_OWNER_TYPES, "Target owner type");
    input.target_owner = requiredText(input.target_owner, "Target owner");
    input.currency = requiredText(input.currency, "Currency");
    input.start_date = requiredText(input.start_date, "Target start date");
    input.end_date = requiredText(input.end_date, "Target end date");
    input.target_amount = normalizePositiveDecimal(input.target_amount, "Target amount");
    input.notes = optionalText(input.notes);
    assertDate(input.start_date, "Target start date");
    assertDate(input.end_date, "Target end date");
    if (input.end_date < input.start_date) throw errors.validation("Target end date cannot precede start date");
    await assertRecord(context, "Company", input.company);
    await assertRecord(context, input.target_owner_type, input.target_owner);
    await assertRecord(context, "Currency", input.currency);

    const nextStatus = normalizeEnum(input.status ?? "Draft", TARGET_STATUSES, "Sales Target status");
    const previousStatus = context.existing ? normalizeEnum(context.existing.data.status ?? "Draft", TARGET_STATUSES, "Existing Sales Target status") : undefined;
    assertTargetTransition(context.command.action, previousStatus, nextStatus);
    input.status = nextStatus;
    if (nextStatus === "Active") {
      const targets = await context.reader.listDocumentsByDoctype<CrmSalesTargetData>(context.command.tenant_id, this.doctype);
      const overlap = targets.find((candidate) => candidate.name !== context.command.aggregate.name
        && candidate.data.status === "Active"
        && candidate.data.company === input.company
        && candidate.data.target_owner_type === input.target_owner_type
        && candidate.data.target_owner === input.target_owner
        && candidate.data.currency === input.currency
        && rangesOverlap(input.start_date, input.end_date, candidate.data.start_date, candidate.data.end_date));
      if (overlap) throw errors.validation(`Active CRM Sales Target overlaps ${overlap.name} for the same owner and currency`);
    }
    return input;
  }

  eventTypes(context: ControllerContext<CrmSalesTargetData>, data: CrmSalesTargetData): string[] {
    const events = [context.command.action === "create" ? "crm.sales_target.created" : "crm.sales_target.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Active") events.push(before === "Closed" ? "crm.sales_target.reopened" : "crm.sales_target.activated");
    if (before !== data.status && data.status === "Closed") events.push("crm.sales_target.closed");
    return events;
  }

  eventPayload(context: ControllerContext<CrmSalesTargetData>, data: CrmSalesTargetData, _type: string): JsonObject {
    return { action: context.command.action, company: data.company, status: data.status ?? "Draft", target_owner_type: data.target_owner_type, target_owner: data.target_owner, currency: data.currency, target_amount: data.target_amount, start_date: data.start_date, end_date: data.end_date };
  }
}

export class CrmCommissionRuleController extends CrmPerformanceController<CrmCommissionRuleData> {
  readonly doctype = "CRM Commission Rule";

  async normalize(context: ControllerContext<CrmCommissionRuleData>): Promise<CrmCommissionRuleData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Commission Rules");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.rule_name = requiredText(input.rule_name, "Commission rule name");
    input.rate = normalizePercent(input.rate, "Commission rate");
    input.effective_from = requiredText(input.effective_from, "Effective from");
    input.effective_to = optionalText(input.effective_to);
    input.notes = optionalText(input.notes);
    assertDate(input.effective_from, "Effective from");
    if (input.effective_to) {
      assertDate(input.effective_to, "Effective to");
      if (input.effective_to < input.effective_from) throw errors.validation("Commission rule effective_to cannot precede effective_from");
    }
    await assertRecord(context, "Company", input.company);
    input.status = normalizeEnum(input.status ?? "Active", RULE_STATUSES, "Commission rule status");
    return input;
  }

  eventTypes(context: ControllerContext<CrmCommissionRuleData>, data: CrmCommissionRuleData): string[] {
    const events = [context.command.action === "create" ? "crm.commission_rule.created" : "crm.commission_rule.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Inactive") events.push("crm.commission_rule.disabled");
    if (before === "Inactive" && data.status === "Active") events.push("crm.commission_rule.reactivated");
    return events;
  }

  eventPayload(context: ControllerContext<CrmCommissionRuleData>, data: CrmCommissionRuleData, _type: string): JsonObject {
    return { action: context.command.action, company: data.company, status: data.status ?? "Active", rate: data.rate, effective_from: data.effective_from, ...(data.effective_to ? { effective_to: data.effective_to } : {}) };
  }
}

export class CrmCommissionAccrualController extends CrmPerformanceController<CrmCommissionAccrualData> {
  readonly doctype = "CRM Commission Accrual";

  async normalize(context: ControllerContext<CrmCommissionAccrualData>): Promise<CrmCommissionAccrualData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Commission Accruals");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.deal = requiredText(input.deal, "CRM Deal");
    input.payee = requiredText(input.payee, "Commission payee");
    input.rule = requiredText(input.rule, "Commission rule");
    input.earned_on = requiredText(input.earned_on, "Commission earned date");
    input.payment_reference = optionalText(input.payment_reference);
    input.notes = optionalText(input.notes);
    assertDate(input.earned_on, "Commission earned date");
    await assertRecord(context, "Company", input.company);
    await assertRecord(context, "User", input.payee);

    const nextStatus = normalizeEnum(input.status ?? "Draft", ACCRUAL_STATUSES, "Commission accrual status");
    const previousStatus = context.existing ? normalizeEnum(context.existing.data.status ?? "Draft", ACCRUAL_STATUSES, "Existing commission accrual status") : undefined;
    assertAccrualTransition(context.command.action, previousStatus, nextStatus);
    if (!context.existing) {
      const deal = await requireDocumentData<OpportunityData>(context, "CRM Deal", input.deal);
      if (deal.company !== input.company) throw errors.reference("Commission CRM Deal belongs to another company");
      if (deal.status !== "Won") throw errors.lifecycle("Commission accrual requires a Won CRM Deal");
      const rule = await requireDocumentData<CrmCommissionRuleData>(context, "CRM Commission Rule", input.rule);
      if (rule.company !== input.company) throw errors.reference("Commission rule belongs to another company");
      if ((rule.status ?? "Active") !== "Active") throw errors.lifecycle("Commission rule must be Active when the accrual is created");
      if (input.earned_on < rule.effective_from || (rule.effective_to && input.earned_on > rule.effective_to)) throw errors.lifecycle("Commission earned date is outside the rule effective period");
      input.currency = requiredText(deal.currency, "CRM Deal currency");
      input.base_amount = normalizeNonNegativeDecimal(deal.opportunity_amount, "CRM Deal amount");
      input.rate = normalizePercent(rule.rate, "Commission rate");
      input.commission_amount = derivePercentAmount(input.base_amount, input.rate);
      const accruals = await context.reader.listDocumentsByDoctype<CrmCommissionAccrualData>(context.command.tenant_id, this.doctype);
      const duplicate = accruals.find((candidate) => candidate.data.status !== "Cancelled" && candidate.data.company === input.company && candidate.data.deal === input.deal && candidate.data.payee === input.payee && candidate.data.rule === input.rule);
      if (duplicate) throw errors.validation(`Commission accrual already exists as ${duplicate.name}`);
    } else {
      for (const field of ["deal", "payee", "rule", "earned_on", "currency", "base_amount", "rate", "commission_amount"]) assertImmutableField(context, field);
      input.currency = requiredText(context.existing.data.currency, "Existing accrual currency");
      input.base_amount = requiredText(context.existing.data.base_amount, "Existing accrual base amount");
      input.rate = requiredText(context.existing.data.rate, "Existing accrual rate");
      input.commission_amount = requiredText(context.existing.data.commission_amount, "Existing commission amount");
    }
    if (nextStatus === "Paid") {
      input.payment_reference = requiredText(input.payment_reference, "Payment Entry reference");
      await assertRecord(context, "Payment Entry", input.payment_reference);
    } else delete input.payment_reference;
    input.status = nextStatus;
    return input;
  }

  eventTypes(context: ControllerContext<CrmCommissionAccrualData>, data: CrmCommissionAccrualData): string[] {
    const events = [context.command.action === "create" ? "crm.commission_accrual.created" : "crm.commission_accrual.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Approved") events.push("crm.commission_accrual.approved");
    if (before !== data.status && data.status === "Paid") events.push("crm.commission_accrual.paid");
    if (before !== data.status && data.status === "Cancelled") events.push("crm.commission_accrual.cancelled");
    if (before === "Cancelled" && data.status === "Draft") events.push("crm.commission_accrual.reopened");
    return events;
  }

  eventPayload(context: ControllerContext<CrmCommissionAccrualData>, data: CrmCommissionAccrualData, _type: string): JsonObject {
    return { action: context.command.action, company: data.company, status: data.status ?? "Draft", deal: data.deal, payee: data.payee, currency: data.currency ?? "", base_amount: data.base_amount ?? "0", commission_amount: data.commission_amount ?? "0", ...(data.payment_reference ? { payment_reference: data.payment_reference } : {}) };
  }
}

function mergeExisting<T extends JsonObject>(context: ControllerContext<T>): T {
  return { ...(context.existing ? structuredClone(context.existing.data) : {}), ...structuredClone(context.command.document) } as T;
}
function assertStableCompany<T extends JsonObject>(context: ControllerContext<T>, company: string): void {
  if (context.existing && context.existing.data.company !== company) throw errors.lifecycle(`${context.command.aggregate.doctype} company cannot change after creation`);
}
function assertTargetTransition(action: string, previous: CrmSalesTargetStatus | undefined, next: CrmSalesTargetStatus): void {
  if (!previous) { if (action === "create" && next !== "Draft") throw errors.lifecycle("CRM Sales Target must be created as Draft before activation"); return; }
  if (previous === next) return;
  const allowed: Record<CrmSalesTargetStatus, ReadonlySet<CrmSalesTargetStatus>> = { Draft: new Set(["Active"]), Active: new Set(["Closed"]), Closed: new Set(["Active"]) };
  if (!allowed[previous].has(next)) throw errors.lifecycle(`CRM Sales Target cannot move from ${previous} to ${next}`);
}
function assertAccrualTransition(action: string, previous: CrmCommissionAccrualStatus | undefined, next: CrmCommissionAccrualStatus): void {
  if (!previous) { if (action === "create" && next !== "Draft") throw errors.lifecycle("CRM Commission Accrual must be created as Draft"); return; }
  if (previous === "Paid") throw errors.lifecycle("Paid CRM Commission Accrual is immutable");
  if (previous === next) return;
  const allowed: Record<CrmCommissionAccrualStatus, ReadonlySet<CrmCommissionAccrualStatus>> = { Draft: new Set(["Approved", "Cancelled"]), Approved: new Set(["Paid", "Cancelled"]), Paid: new Set(), Cancelled: new Set(["Draft"]) };
  if (!allowed[previous].has(next)) throw errors.lifecycle(`CRM Commission Accrual cannot move from ${previous} to ${next}`);
}
function assertImmutableField<T extends JsonObject>(context: ControllerContext<T>, field: string): void {
  if (field in context.command.document && JSON.stringify(context.existing?.data[field]) !== JSON.stringify(context.command.document[field])) throw errors.lifecycle(`${context.command.aggregate.doctype}.${field} is immutable after creation`);
}
async function assertRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  if (await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) return;
  if (await context.reader.getDocument(context.command.tenant_id, doctype, name)) return;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}
async function requireDocumentData<R extends JsonObject, T extends JsonObject = JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<R> {
  const document = await context.reader.getDocument<R>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
  return document.data;
}
function rangesOverlap(startA: string, endA: string, startB: unknown, endB: unknown): boolean { return typeof startB === "string" && typeof endB === "string" && startA <= endB && startB <= endA; }
function requiredText(value: unknown, label: string): string { const normalized = optionalText(value); if (!normalized) throw errors.validation(`${label} is required`); return normalized; }
function optionalText(value: unknown): string | undefined { if (value === undefined || value === null || value === "") return undefined; if (typeof value !== "string") throw errors.validation("CRM text fields must be strings"); const normalized = value.trim(); return normalized || undefined; }
function normalizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !allowed.has(value as T)) throw errors.validation(`${label} must be one of ${[...allowed].join(", ")}`); return value as T; }
function normalizePositiveDecimal(value: unknown, label: string): string { const text = normalizeNonNegativeDecimal(value, label); if (toScaledInt(text, 6, label) <= 0) throw errors.validation(`${label} must be greater than zero`); return text; }
function normalizeNonNegativeDecimal(value: unknown, label: string): string { const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : ""; if (!/^\d+(\.\d{1,6})?$/.test(text)) throw errors.validation(`${label} must be a non-negative decimal with at most 6 decimal places`); toScaledInt(text, 6, label); return text; }
function normalizePercent(value: unknown, label: string): string { const text = normalizeNonNegativeDecimal(value, label); if (toScaledInt(text, 6, label) > 100_000_000) throw errors.validation(`${label} must be between 0 and 100`); return text; }
function derivePercentAmount(base: string, rate: string): string { const baseScaled = toScaledInt(base, 6, "Commission base amount"); return fromScaledInt(percentOfMinor(baseScaled, rate, 6, "Commission rate"), 6); }
function assertDate(value: string, label: string): void { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) throw errors.validation(`${label} must use YYYY-MM-DD`); const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))); if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw errors.validation(`${label} is not a valid date`); }
function assertSalesManager(roles: string[], message: string): void { if (!roles.some((role) => role === "Sales Manager" || role === "System Manager")) throw errors.permission(message); }
