import type { JsonObject, MutationPlan, ProcurementEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { PurchaseInvoiceController } from "./controllers.js";
import { evaluateThreeWayMatch } from "./procurement-decisions.js";
import { ProcurementPurchaseOrderController } from "./procurement-integrity-controllers.js";
import type { PurchaseInvoiceData, PurchaseItem, PurchaseOrderData } from "./types.js";
import { stockQtyMicros } from "./uom.js";

const PURCHASE_MATCH_POLICY_VERSION = 1;
const MAX_INVOICE_QUANTITY_TOLERANCE_BPS = 5_000;
const MAX_INVOICE_PRICE_TOLERANCE_BPS = 10_000;

interface LinkedInvoiceLine {
  index: number;
  item: PurchaseItem;
  purchase_order: string;
}

interface PurchaseMatchEvidence extends JsonObject {
  purchase_order: string;
  item_code: string;
  policy_version: number;
  receipt_match_required: boolean;
  quantity_tolerance_bps: number;
  price_tolerance_bps: number;
  ordered_qty_micros: number;
  received_qty_micros: number;
  billed_before_micros: number;
  invoiced_qty_micros: number;
  ordered_rate_minor: number;
  invoice_rate_minor: number;
  status: "Match" | "Legacy";
}

/**
 * Procurement owns the commercial match policy, while the base Purchase Invoice controller keeps
 * sole authority for AP/Payment Ledger/GL posting. A submitted PO freezes the policy so a later
 * Supplier/Item metadata edit cannot silently change how an already-approved order is invoiced.
 */
export class ProcurementP2PPurchaseOrderController extends ProcurementPurchaseOrderController {
  override async buildPlan(context: ControllerContext<PurchaseOrderData>): Promise<MutationPlan<PurchaseOrderData>> {
    const plan = await super.buildPlan(context);
    if (context.command.action !== "submit") return plan;
    const data = await snapshotPurchaseMatchPolicy(context, plan.document.data);
    return {
      ...plan,
      document: { ...plan.document, data },
    };
  }
}

/**
 * Wires the existing pure three-way-match engine into the authoritative Purchase Invoice submit
 * path. This controller never writes a second AP or stock ledger: it validates PO/Receipt facts,
 * records match evidence on the invoice, then delegates all financial posting to the base
 * PurchaseInvoiceController plan.
 */
export class ProcurementP2PPurchaseInvoiceController extends PurchaseInvoiceController {
  override async buildPlan(context: ControllerContext<PurchaseInvoiceData>): Promise<MutationPlan<PurchaseInvoiceData>> {
    if (context.command.action === "submit") {
      return this.buildSubmitPlan(context);
    }

    const plan = await super.buildPlan(context);
    if (context.command.action !== "cancel") return plan;
    return {
      ...plan,
      procurement_entries: buildBillingProgressEntries(context, plan.document.data, true),
    };
  }

  private async buildSubmitPlan(context: ControllerContext<PurchaseInvoiceData>): Promise<MutationPlan<PurchaseInvoiceData>> {
    const input = context.command.document;
    const headerPurchaseOrder = optionalText(input.against_purchase_order);

    // The legacy base controller only understands a single header PO and would reject tolerance
    // before the richer matcher can run. Strip that reference for plan construction, then restore
    // it and perform the complete line-aware validation below. Financial calculations are unchanged.
    const baseContext = headerPurchaseOrder
      ? {
          ...context,
          command: {
            ...context.command,
            document: { ...input, against_purchase_order: undefined },
          },
        }
      : context;
    const basePlan = await super.buildPlan(baseContext);
    const normalizedData: PurchaseInvoiceData = headerPurchaseOrder
      ? { ...basePlan.document.data, against_purchase_order: headerPurchaseOrder }
      : basePlan.document.data;
    const linked = linkedInvoiceLines(normalizedData);
    if (linked.length === 0) {
      return {
        ...basePlan,
        command: context.command,
        document: { ...basePlan.document, data: normalizedData },
      };
    }

    const poCache = new Map<string, { name: string; data: PurchaseOrderData; docstatus: number }>();
    const grouped = groupLinkedLines(linked);
    const evidence: PurchaseMatchEvidence[] = [];
    let hasLegacyPolicy = false;

    for (const group of grouped.values()) {
      let po = poCache.get(group.purchase_order);
      if (!po) {
        const document = await context.reader.getDocument<PurchaseOrderData>(
          context.command.tenant_id,
          "Purchase Order",
          group.purchase_order,
        );
        if (!document || document.docstatus !== 1) {
          throw errors.reference(`Submitted Purchase Order ${group.purchase_order} is required`);
        }
        po = { name: document.name, data: document.data, docstatus: document.docstatus };
        poCache.set(group.purchase_order, po);
      }
      assertPurchaseInvoiceContext(normalizedData, po.data, po.name);

      const orderLines = po.data.items.filter((row) => row.item_code === group.item_code);
      if (orderLines.length === 0) {
        throw errors.reference(`Item ${group.item_code} is not in Purchase Order ${po.name}`);
      }
      const orderedQty = sumStockQty(orderLines, `Purchase Order ${po.name} ${group.item_code}`);
      const currentInvoiceQty = sumStockQty(group.lines.map((line) => line.item), `Purchase Invoice ${group.item_code}`);
      const billedBefore = await context.reader.getProcuredQuantityMicros(
        context.command.tenant_id,
        po.name,
        "Billing",
        group.item_code,
      );
      const invoicedQty = safeAdd(billedBefore, currentInvoiceQty, `Purchase Invoice billed quantity for ${group.item_code}`);
      const receivedQty = await context.reader.getProcuredQuantityMicros(
        context.command.tenant_id,
        po.name,
        "Receipt",
        group.item_code,
      );
      const orderedRate = effectiveRatePerStockUnitMinor(orderLines, `Purchase Order ${po.name} ${group.item_code}`);
      const invoiceRate = effectiveRatePerStockUnitMinor(group.lines.map((line) => line.item), `Purchase Invoice ${group.item_code}`);
      const raw = po.data as JsonObject;
      const policyVersion = integerOrZero(raw.purchase_match_policy_version);

      if (policyVersion !== PURCHASE_MATCH_POLICY_VERSION) {
        hasLegacyPolicy = true;
        if (invoicedQty > orderedQty) {
          throw errors.reference(`Billing quantity for ${group.item_code} exceeds Purchase Order ${po.name}`);
        }
        evidence.push({
          purchase_order: po.name,
          item_code: group.item_code,
          policy_version: 0,
          receipt_match_required: false,
          quantity_tolerance_bps: 0,
          price_tolerance_bps: 0,
          ordered_qty_micros: orderedQty,
          received_qty_micros: receivedQty,
          billed_before_micros: billedBefore,
          invoiced_qty_micros: invoicedQty,
          ordered_rate_minor: orderedRate,
          invoice_rate_minor: invoiceRate,
          status: "Legacy",
        });
        continue;
      }

      const quantityToleranceBps = boundedInteger(
        raw.invoice_quantity_tolerance_bps,
        "invoice_quantity_tolerance_bps",
        MAX_INVOICE_QUANTITY_TOLERANCE_BPS,
      );
      const priceToleranceBps = boundedInteger(
        raw.invoice_price_tolerance_bps,
        "invoice_price_tolerance_bps",
        MAX_INVOICE_PRICE_TOLERANCE_BPS,
      );
      const receiptMatchRequired = booleanValue(raw.receipt_match_required, true);
      const result = evaluateThreeWayMatch([{
        line_key: `${po.name}:${group.item_code}`,
        item_code: group.item_code,
        ordered_qty_micros: orderedQty,
        received_qty_micros: receivedQty,
        invoiced_qty_micros: invoicedQty,
        ordered_rate_minor: orderedRate,
        invoice_rate_minor: invoiceRate,
        currency: normalizedData.currency,
        currency_scale: normalizedData.currency_scale ?? 2,
      }], {
        quantity_tolerance_bps: quantityToleranceBps,
        price_tolerance_bps: priceToleranceBps,
        require_receipt_before_invoice: receiptMatchRequired,
      });
      if (result.status === "Hold") {
        throw errors.reference(`Purchase Invoice procurement hold for ${po.name}/${group.item_code}: ${result.hold_reasons.join("; ")}`);
      }
      evidence.push({
        purchase_order: po.name,
        item_code: group.item_code,
        policy_version: PURCHASE_MATCH_POLICY_VERSION,
        receipt_match_required: receiptMatchRequired,
        quantity_tolerance_bps: quantityToleranceBps,
        price_tolerance_bps: priceToleranceBps,
        ordered_qty_micros: orderedQty,
        received_qty_micros: receivedQty,
        billed_before_micros: billedBefore,
        invoiced_qty_micros: invoicedQty,
        ordered_rate_minor: orderedRate,
        invoice_rate_minor: invoiceRate,
        status: "Match",
      });
    }

    const data: PurchaseInvoiceData = {
      ...normalizedData,
      purchase_match_status: hasLegacyPolicy ? "Legacy" : "Match",
      purchase_match_checked_at: context.now,
      purchase_match_evidence: evidence,
    };
    return {
      ...basePlan,
      command: context.command,
      document: { ...basePlan.document, data },
      procurement_entries: buildBillingProgressEntries(context, data, false),
    };
  }
}

async function snapshotPurchaseMatchPolicy(
  context: ControllerContext<PurchaseOrderData>,
  data: PurchaseOrderData,
): Promise<PurchaseOrderData> {
  const raw = data as JsonObject;
  const quantityBps = percentToBps(
    raw.invoice_quantity_tolerance_pct,
    "invoice_quantity_tolerance_pct",
    MAX_INVOICE_QUANTITY_TOLERANCE_BPS,
  );
  const priceBps = percentToBps(
    raw.invoice_price_tolerance_pct,
    "invoice_price_tolerance_pct",
    MAX_INVOICE_PRICE_TOLERANCE_BPS,
  );
  const explicitReceiptMatch = optionalBoolean(raw.receipt_match_required);
  let receiptMatchRequired = explicitReceiptMatch;
  if (receiptMatchRequired === undefined) {
    receiptMatchRequired = false;
    for (const item of data.items) {
      const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", item.item_code);
      if (!isExplicitNonStock(master?.is_stock_item)) {
        receiptMatchRequired = true;
        break;
      }
    }
  }
  return {
    ...data,
    purchase_match_policy_version: PURCHASE_MATCH_POLICY_VERSION,
    receipt_match_required: receiptMatchRequired,
    invoice_quantity_tolerance_bps: quantityBps,
    invoice_quantity_tolerance_pct: fromScaledInt(quantityBps, 2),
    invoice_price_tolerance_bps: priceBps,
    invoice_price_tolerance_pct: fromScaledInt(priceBps, 2),
  };
}

function linkedInvoiceLines(data: PurchaseInvoiceData): LinkedInvoiceLine[] {
  const header = optionalText(data.against_purchase_order);
  const result: LinkedInvoiceLine[] = [];
  for (const [index, item] of data.items.entries()) {
    const purchaseOrder = optionalText(item.purchase_order) ?? header;
    if (!purchaseOrder) continue;
    result.push({ index, item, purchase_order: purchaseOrder });
  }
  return result;
}

function groupLinkedLines(lines: LinkedInvoiceLine[]): Map<string, { purchase_order: string; item_code: string; lines: LinkedInvoiceLine[] }> {
  const groups = new Map<string, { purchase_order: string; item_code: string; lines: LinkedInvoiceLine[] }>();
  for (const line of lines) {
    const key = `${line.purchase_order}\u0000${line.item.item_code}`;
    const current = groups.get(key);
    if (current) current.lines.push(line);
    else groups.set(key, { purchase_order: line.purchase_order, item_code: line.item.item_code, lines: [line] });
  }
  return groups;
}

function buildBillingProgressEntries(
  context: ControllerContext<PurchaseInvoiceData>,
  data: PurchaseInvoiceData,
  reverse: boolean,
): ProcurementEntry[] {
  return linkedInvoiceLines(data).map((line) => {
    const qty = stockQtyMicros(line.item);
    return {
      line_key: `${reverse ? "REV-" : ""}BILL-${line.item.row_id || line.index + 1}`,
      purchase_order: line.purchase_order,
      kind: "Billing",
      item_code: line.item.item_code,
      qty_micros: reverse ? -qty : qty,
      posting_at: data.posting_at,
    };
  });
}

function assertPurchaseInvoiceContext(invoice: PurchaseInvoiceData, order: PurchaseOrderData, orderName: string): void {
  if (invoice.supplier !== order.supplier || invoice.company !== order.company || invoice.currency !== order.currency) {
    throw errors.reference(`Purchase Invoice commercial context does not match Purchase Order ${orderName}`);
  }
}

function sumStockQty(items: PurchaseItem[], label: string): number {
  let total = 0;
  for (const item of items) total = safeAdd(total, stockQtyMicros(item), `${label} quantity`);
  if (total <= 0) throw errors.validation(`${label} quantity must be positive`);
  return total;
}

/** Weighted net rate per canonical stock unit, so Cây/Mét/Kg invoices compare apples to apples. */
function effectiveRatePerStockUnitMinor(items: PurchaseItem[], label: string): number {
  let qty = 0;
  let amount = 0;
  for (const [index, item] of items.entries()) {
    const lineQty = stockQtyMicros(item);
    qty = safeAdd(qty, lineQty, `${label} quantity`);
    const lineAmount = item.net_amount_minor ?? item.amount_minor;
    if (typeof lineAmount !== "number" || !Number.isSafeInteger(lineAmount) || lineAmount < 0) {
      throw errors.validation(`${label} row ${index + 1} has no valid normalized net amount`);
    }
    amount = safeAdd(amount, lineAmount, `${label} net amount`);
  }
  if (qty <= 0) throw errors.validation(`${label} quantity must be positive`);
  const numerator = BigInt(amount) * 1_000_000n;
  const denominator = BigInt(qty);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation(`${label} effective rate exceeds safe integer range`);
  return result;
}

function percentToBps(value: unknown, field: string, maxBps: number): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const bps = toScaledInt(value, 2, field);
  if (bps < 0 || bps > maxBps) {
    throw errors.validation(`${field} must be between 0 and ${fromScaledInt(maxBps, 2)}`);
  }
  return bps;
}

function boundedInteger(value: unknown, field: string, max: number): number {
  const result = integerOrZero(value);
  if (result < 0 || result > max) throw errors.validation(`${field} is outside the supported range`);
  return result;
}

function integerOrZero(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return optionalBoolean(value) ?? fallback;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw errors.validation("receipt_match_required must be boolean");
}

function isExplicitNonStock(value: unknown): boolean {
  return value === false || value === 0 || value === "0" || value === "false";
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeAdd(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw errors.validation(`${field} must use safe integers`);
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}
