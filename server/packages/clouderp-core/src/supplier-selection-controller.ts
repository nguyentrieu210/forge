import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import {
  compareSupplierQuotations,
  validateSupplierSelection,
} from "./procurement-decisions.js";
import type {
  PurchaseOrderData,
  RequestForQuotationData,
  SupplierQuotationData,
} from "./types.js";

export interface SupplierSelectionData extends JsonObject {
  request_for_quotation: string;
  supplier_quotation: string;
  company: string;
  supplier?: string;
  decision_date: string;
  selection_reason: string;
  quotation_currency?: string;
  base_grand_total_minor?: number;
  approved_by?: string;
  approved_on?: string;
}

export class SupplierSelectionController implements DocumentController<SupplierSelectionData> {
  readonly doctype = "Supplier Selection";

  async normalize(context: ControllerContext<SupplierSelectionData>): Promise<SupplierSelectionData> {
    const input = context.command.document;
    const rfqName = requiredText(input.request_for_quotation, "request_for_quotation");
    const quotationName = requiredText(input.supplier_quotation, "supplier_quotation");
    const company = requiredText(input.company, "company");
    const decisionDate = isoDate(input.decision_date, "decision_date");
    const reason = requiredText(input.selection_reason, "selection_reason");
    if (context.command.action !== "submit") {
      return {
        ...input,
        request_for_quotation: rfqName,
        supplier_quotation: quotationName,
        company,
        decision_date: decisionDate,
        selection_reason: reason,
      };
    }
    requirePurchaseManager(context);
    const rfq = await requireSubmitted<RequestForQuotationData>(context, "Request for Quotation", rfqName);
    const quotation = await requireSubmitted<SupplierQuotationData>(context, "Supplier Quotation", quotationName);
    if (rfq.data.company !== company || quotation.data.company !== company) {
      throw errors.reference("Supplier Selection company does not match RFQ or Supplier Quotation");
    }
    if (quotation.data.request_for_quotation && quotation.data.request_for_quotation !== rfqName) {
      throw errors.reference(`Supplier Quotation ${quotationName} belongs to another RFQ`);
    }
    const comparison = compareSupplierQuotations(
      rfqName,
      rfq.data,
      [{ name: quotationName, data: quotation.data, docstatus: quotation.docstatus }],
      decisionDate,
    );
    const meta = comparison.quotations.find((row) => row.quotation === quotationName);
    if (!meta || !meta.complete) throw errors.reference(`Supplier Quotation ${quotationName} does not cover the complete RFQ`);
    if (meta.expired) throw errors.reference(`Supplier Quotation ${quotationName} is expired on selection date ${decisionDate}`);
    validateSupplierSelection(
      comparison,
      comparison.lines.map((line) => ({ rfq_row_id: line.rfq_row_id, quotation: quotationName })),
      reason,
    );
    return {
      ...input,
      request_for_quotation: rfqName,
      supplier_quotation: quotationName,
      company,
      supplier: quotation.data.supplier,
      decision_date: decisionDate,
      selection_reason: reason,
      quotation_currency: quotation.data.currency,
      ...(quotation.data.base_grand_total_minor === undefined
        ? {}
        : { base_grand_total_minor: quotation.data.base_grand_total_minor }),
      approved_by: context.command.actor.user_id,
      approved_on: context.now,
    };
  }

  async buildPlan(context: ControllerContext<SupplierSelectionData>): Promise<MutationPlan<SupplierSelectionData>> {
    if (context.command.action === "cancel") {
      requirePurchaseManager(context);
      const existing = requireExisting(context.existing);
      const purchaseOrders = await context.reader.listDocumentsByDoctype<PurchaseOrderData>(
        context.command.tenant_id,
        "Purchase Order",
      );
      for (const po of purchaseOrders) {
        if (po.docstatus !== 1) continue;
        const raw = po.data as JsonObject;
        if (raw.supplier_selection === context.command.aggregate.name) {
          throw errors.reference(`Supplier Selection cannot be cancelled while submitted Purchase Order ${po.name} uses it`);
        }
      }
      return this.plan(context, structuredClone(existing.data));
    }
    return this.plan(context, await this.normalize(context));
  }

  private plan(context: ControllerContext<SupplierSelectionData>, data: SupplierSelectionData): MutationPlan<SupplierSelectionData> {
    const existing = context.existing;
    const docstatus = nextDocStatus(context.command.action);
    const status = docstatus === 0 ? "Draft" : docstatus === 2 ? "Cancelled" : "Approved";
    const document: CanonicalDocument<SupplierSelectionData> = {
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
      ? "supplier_selection.approved"
      : context.command.action === "cancel"
        ? "supplier_selection.cancelled"
        : "supplier_selection.updated";
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

export function validatePurchaseOrderSupplierSelection(
  purchaseOrder: PurchaseOrderData,
  selectionName: string,
  selection: SupplierSelectionData,
): void {
  if (selection.company !== purchaseOrder.company) {
    throw errors.reference(`Purchase Order company does not match Supplier Selection ${selectionName}`);
  }
  if (selection.supplier !== purchaseOrder.supplier) {
    throw errors.reference(`Purchase Order supplier does not match Supplier Selection ${selectionName}`);
  }
  if (!purchaseOrder.supplier_quotation || selection.supplier_quotation !== purchaseOrder.supplier_quotation) {
    throw errors.reference(`Purchase Order must use Supplier Quotation selected by ${selectionName}`);
  }
}

async function requireSubmitted<T extends JsonObject>(
  context: ControllerContext<JsonObject>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
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
