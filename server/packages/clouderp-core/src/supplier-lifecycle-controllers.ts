import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import {
  assertSupplierEligible,
  calculateSupplierRating,
  validateSupplierContractPolicy,
} from "./supplier-policy.js";

export interface SupplierQualificationData extends JsonObject {
  supplier: string;
  company: string;
  valid_from: string;
  valid_until: string;
  approved_categories?: string;
  approval_reason: string;
  approved_by?: string;
  approved_on?: string;
}

export interface SupplierContractData extends JsonObject {
  supplier: string;
  company: string;
  currency: string;
  contract_reference: string;
  valid_from: string;
  valid_until: string;
  maximum_qty?: string;
  maximum_qty_micros?: number;
  maximum_value?: string;
  maximum_value_minor?: number;
  notes?: string;
  approved_by?: string;
  approved_on?: string;
}

export interface SupplierRatingData extends JsonObject {
  supplier: string;
  company: string;
  assessment_date: string;
  quality_score: string | number;
  quality_weight: string | number;
  delivery_score: string | number;
  delivery_weight: string | number;
  commercial_score: string | number;
  commercial_weight: string | number;
  service_score: string | number;
  service_weight: string | number;
  overall_score?: string;
  overall_score_bps?: number;
  grade?: "A" | "B" | "C" | "D";
  notes?: string;
}

abstract class SupplierLifecycleController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T>;
  abstract submittedStatus: string;

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    const existing = context.existing;
    const data = context.command.action === "cancel"
      ? structuredClone(requireExisting(existing).data)
      : await this.normalize(context);
    const docstatus = nextDocStatus(context.command.action);
    const status = docstatus === 0 ? "Draft" : docstatus === 2 ? "Cancelled" : this.submittedStatus;
    const document: CanonicalDocument<T> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: existing?.owner ?? context.command.actor.user_id,
      docstatus,
      status,
      version: context.nextVersion,
      created_at: existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: [],
    };
    const event = context.command.action === "submit"
      ? `${eventPrefix(this.doctype)}.submitted`
      : context.command.action === "cancel"
        ? `${eventPrefix(this.doctype)}.cancelled`
        : `${eventPrefix(this.doctype)}.updated`;
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: [],
      stock_bundle_usages: [],
      manufacturing_entries: [],
      events: [domainEvent({
        type: event,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: { action: context.command.action, status },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        docstatus,
        status,
      },
    };
  }
}

export class SupplierQualificationController extends SupplierLifecycleController<SupplierQualificationData> {
  readonly doctype = "Supplier Qualification";
  submittedStatus = "Approved";

  async normalize(context: ControllerContext<SupplierQualificationData>): Promise<SupplierQualificationData> {
    const input = context.command.document;
    const supplier = requiredText(input.supplier, "supplier");
    const company = requiredText(input.company, "company");
    const validFrom = isoDate(input.valid_from, "valid_from");
    const validUntil = isoDate(input.valid_until, "valid_until");
    const reason = requiredText(input.approval_reason, "approval_reason");
    if (validFrom > validUntil) throw errors.validation("Supplier qualification valid_from must not be after valid_until");
    if (context.command.action === "submit") {
      requirePurchaseManager(context);
      await assertMasters(context, [["Supplier", supplier], ["Company", company]]);
      const existing = await context.reader.listDocumentsByDoctype<SupplierQualificationData>(
        context.command.tenant_id,
        this.doctype,
      );
      for (const doc of existing) {
        if (doc.name === context.command.aggregate.name || doc.docstatus !== 1) continue;
        if (doc.data.supplier !== supplier || doc.data.company !== company) continue;
        if (rangesOverlap(validFrom, validUntil, doc.data.valid_from, doc.data.valid_until)) {
          throw errors.reference(`Supplier ${supplier} already has an overlapping approved qualification ${doc.name}`);
        }
      }
    }
    return {
      ...input,
      supplier,
      company,
      valid_from: validFrom,
      valid_until: validUntil,
      approved_categories: normalizedCategoryText(input.approved_categories),
      approval_reason: reason,
      ...(context.command.action === "submit"
        ? { approved_by: context.command.actor.user_id, approved_on: context.now }
        : {}),
    };
  }
}

export class SupplierContractController extends SupplierLifecycleController<SupplierContractData> {
  readonly doctype = "Supplier Contract";
  submittedStatus = "Active";

  async normalize(context: ControllerContext<SupplierContractData>): Promise<SupplierContractData> {
    const input = context.command.document;
    const supplier = requiredText(input.supplier, "supplier");
    const company = requiredText(input.company, "company");
    const currency = requiredText(input.currency, "currency");
    const reference = requiredText(input.contract_reference, "contract_reference");
    const currencyMaster = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
    const currencyScale = currencyMaster && typeof currencyMaster.currency_scale === "number" && Number.isSafeInteger(currencyMaster.currency_scale)
      ? currencyMaster.currency_scale
      : 2;
    const maximumQtyMicros = optionalScaled(input.maximum_qty, 6, "maximum_qty");
    const maximumValueMinor = optionalScaled(input.maximum_value, currencyScale, "maximum_value");
    validateSupplierContractPolicy({
      supplier,
      company,
      currency,
      valid_from: input.valid_from,
      valid_until: input.valid_until,
      ...(maximumQtyMicros === undefined ? {} : { maximum_qty_micros: maximumQtyMicros }),
      ...(maximumValueMinor === undefined ? {} : { maximum_value_minor: maximumValueMinor }),
    });
    if (context.command.action === "submit") {
      requirePurchaseManager(context);
      await assertMasters(context, [["Supplier", supplier], ["Company", company], ["Currency", currency]]);
    }
    return {
      ...input,
      supplier,
      company,
      currency,
      contract_reference: reference,
      valid_from: isoDate(input.valid_from, "valid_from"),
      valid_until: isoDate(input.valid_until, "valid_until"),
      ...(maximumQtyMicros === undefined ? {} : {
        maximum_qty_micros: maximumQtyMicros,
        maximum_qty: fromScaledInt(maximumQtyMicros, 6),
      }),
      ...(maximumValueMinor === undefined ? {} : {
        maximum_value_minor: maximumValueMinor,
        maximum_value: fromScaledInt(maximumValueMinor, currencyScale),
      }),
      ...(context.command.action === "submit"
        ? { approved_by: context.command.actor.user_id, approved_on: context.now }
        : {}),
    };
  }
}

export class SupplierRatingController extends SupplierLifecycleController<SupplierRatingData> {
  readonly doctype = "Supplier Rating";
  submittedStatus = "Assessed";

  async normalize(context: ControllerContext<SupplierRatingData>): Promise<SupplierRatingData> {
    const input = context.command.document;
    const supplier = requiredText(input.supplier, "supplier");
    const company = requiredText(input.company, "company");
    const assessmentDate = isoDate(input.assessment_date, "assessment_date");
    const dimensions = [
      dimension("quality", input.quality_score, input.quality_weight),
      dimension("delivery", input.delivery_score, input.delivery_weight),
      dimension("commercial", input.commercial_score, input.commercial_weight),
      dimension("service", input.service_score, input.service_weight),
    ];
    const rating = calculateSupplierRating(dimensions);
    if (context.command.action === "submit") {
      requirePurchaseManager(context);
      await assertMasters(context, [["Supplier", supplier], ["Company", company]]);
    }
    return {
      ...input,
      supplier,
      company,
      assessment_date: assessmentDate,
      overall_score_bps: rating.score_bps,
      overall_score: fromScaledInt(rating.score_bps, 2),
      grade: rating.grade,
    };
  }
}

export function assertSupplierQualificationEligible(
  supplier: string,
  company: string,
  qualifications: Array<CanonicalDocument<SupplierQualificationData>>,
  asOfDate: string,
  category?: string,
): boolean {
  const day = isoDate(asOfDate, "as_of_date");
  const candidates = qualifications.filter((doc) =>
    doc.docstatus === 1
    && doc.data.supplier === supplier
    && doc.data.company === company);
  if (candidates.length === 0) return false;
  const effective = candidates.filter((doc) => doc.data.valid_from <= day && doc.data.valid_until >= day);
  if (effective.length !== 1) {
    if (effective.length === 0) throw errors.reference(`Supplier ${supplier} has no effective approved qualification on ${day}`);
    throw errors.validation(`Supplier ${supplier} has overlapping effective qualifications on ${day}`);
  }
  const doc = effective[0]!;
  assertSupplierEligible(supplier, {
    procurement_status: "Approved",
    approved_from: doc.data.valid_from,
    approved_until: doc.data.valid_until,
    approved_categories: doc.data.approved_categories,
  }, day, category);
  return true;
}

function dimension(key: string, score: string | number, weight: string | number) {
  return {
    key,
    score_bps: percentToBps(score, `${key}_score`),
    weight_bps: percentToBps(weight, `${key}_weight`),
  };
}

function percentToBps(value: string | number, field: string): number {
  const bps = toScaledInt(value, 2, field);
  if (bps < 0 || bps > 10_000) throw errors.validation(`${field} must be between 0 and 100`);
  return bps;
}

function optionalScaled(value: unknown, scale: number, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const result = toScaledInt(value, scale, field);
  if (result < 0) throw errors.validation(`${field} must be non-negative`);
  return result;
}

async function assertMasters(context: ControllerContext<JsonObject>, rows: Array<[string, string]>): Promise<void> {
  for (const [type, name] of rows) {
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) {
      throw errors.reference(`${type} ${name} does not exist or is disabled`);
    }
  }
}

function requirePurchaseManager(context: ControllerContext<JsonObject>): void {
  if (context.command.actor.user_id === "Administrator") return;
  if (context.command.actor.roles.includes("Purchase Manager") || context.command.actor.roles.includes("System Manager")) return;
  throw errors.permission("Purchase Manager role is required");
}

function requireExisting<T extends JsonObject>(document: CanonicalDocument<T> | null | undefined): CanonicalDocument<T> {
  if (!document) throw errors.notFound();
  return document;
}

function normalizedCategoryText(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const categories = new Set<string>();
  for (const entry of raw) if (typeof entry === "string" && entry.trim()) categories.add(entry.trim());
  return [...categories].sort((a, b) => a.localeCompare(b, "vi")).join(", ");
}

function rangesOverlap(leftFrom: string, leftUntil: string, rightFrom: string, rightUntil: string): boolean {
  return leftFrom <= rightUntil && rightFrom <= leftUntil;
}

function eventPrefix(doctype: string): string {
  return doctype.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${field} is required`);
  return value.trim();
}

function isoDate(value: string, field: string): string {
  const text = requiredText(value, field).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw errors.validation(`${field} must be a valid ISO date`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw errors.validation(`${field} must be a valid ISO date`);
  }
  return text;
}
