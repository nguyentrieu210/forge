import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type {
  PurchaseItem,
  PurchaseOrderData,
  RequestForQuotationData,
  SupplierQuotationData,
} from "./types.js";

const BPS = 10_000n;
const QTY_SCALE = 6;

type RfqRow = {
  row_id: string;
  item: RequestForQuotationData["items"][number];
  requested_qty_micros: number;
  uom: string | null;
};

export interface SupplierQuotationDocument {
  name: string;
  data: SupplierQuotationData;
  docstatus?: number;
}

export interface QuotationLineOffer {
  quotation: string;
  supplier: string;
  rfq_row_id: string;
  item_code: string;
  qty_micros: number;
  qty: string;
  uom: string | null;
  rate_minor: number;
  rate: string;
  currency: string;
  currency_scale: number;
}

export interface QuotationLineComparison {
  rfq_row_id: string;
  item_code: string;
  requested_qty_micros: number;
  requested_qty: string;
  uom: string | null;
  offers: QuotationLineOffer[];
}

export interface QuotationDocumentComparison {
  quotation: string;
  supplier: string;
  currency: string;
  company_currency: string | null;
  expired: boolean;
  complete: boolean;
  covered_rows: number;
  total_rows: number;
  base_grand_total_minor: number | null;
}

export interface SupplierQuotationComparison {
  rfq: string;
  company: string;
  as_of_date: string;
  lines: QuotationLineComparison[];
  quotations: QuotationDocumentComparison[];
  complete_rank: string[];
}

export interface SupplierSelectionInput {
  rfq_row_id: string;
  quotation: string;
}

export interface SupplierSelectionDecision {
  rfq: string;
  reason: string;
  lines: Array<{
    rfq_row_id: string;
    quotation: string;
    supplier: string;
    item_code: string;
    currency: string;
    rate_minor: number;
  }>;
}

export interface PurchaseOrderQuotationLineCheck {
  po_row_id: string;
  quotation_row_id: string;
  item_code: string;
  ordered_qty_micros: number;
  quoted_qty_micros: number;
  ordered_rate_minor: number;
  quoted_rate_minor: number;
  price_variance_minor: number;
}

export interface PurchaseOrderQuotationCheck {
  quotation: string;
  supplier: string;
  currency: string;
  lines: PurchaseOrderQuotationLineCheck[];
}

export function compareSupplierQuotations(
  rfqName: string,
  rfq: RequestForQuotationData,
  quotations: SupplierQuotationDocument[],
  asOfDate: string,
): SupplierQuotationComparison {
  const normalizedAsOf = dateOnly(asOfDate, "as_of_date");
  if (!rfqName.trim()) throw errors.validation("rfq name is required");
  if (!rfq.company) throw errors.validation("RFQ company is required");
  if (!Array.isArray(rfq.items) || rfq.items.length === 0) throw errors.validation("RFQ requires at least one item");
  if (!Array.isArray(rfq.suppliers) || rfq.suppliers.length === 0) throw errors.validation("RFQ requires at least one supplier");

  const invited = new Set(rfq.suppliers.map((row) => requiredText(row.supplier, "RFQ supplier")));
  const rfqRows: RfqRow[] = rfq.items.map((item, index) => ({
    row_id: requiredText(item.row_id || `ROW-${index + 1}`, `RFQ row ${index + 1}`),
    item,
    requested_qty_micros: positiveQtyMicros(item, `rfq.items[${index}].qty`),
    uom: lineUom(item),
  }));
  const rfqById = new Map(rfqRows.map((row) => [row.row_id, row]));
  if (rfqById.size !== rfqRows.length) throw errors.validation("RFQ item row_id values must be unique");

  const lineOffers = new Map<string, QuotationLineOffer[]>();
  const documentRows: QuotationDocumentComparison[] = [];
  for (const quote of quotations) {
    if (!quote.name.trim()) throw errors.validation("Supplier Quotation name is required");
    if (quote.docstatus !== undefined && quote.docstatus !== 1) {
      throw errors.reference(`Supplier Quotation ${quote.name} must be submitted before comparison`);
    }
    const data = quote.data;
    if (data.request_for_quotation && data.request_for_quotation !== rfqName) {
      throw errors.reference(`Supplier Quotation ${quote.name} belongs to another RFQ`);
    }
    if (data.company !== rfq.company) throw errors.reference(`Supplier Quotation ${quote.name} belongs to another company`);
    if (!invited.has(data.supplier)) throw errors.reference(`Supplier ${data.supplier} was not invited to ${rfqName}`);
    const scale = integerScale(data.currency_scale, `${quote.name}.currency_scale`, 2);
    const seenRows = new Set<string>();
    for (const [index, item] of data.items.entries()) {
      const target = resolveQuotedRfqRow(item, rfqRows, rfqById, quote.name, index);
      if (seenRows.has(target.row_id)) throw errors.validation(`Supplier Quotation ${quote.name} quotes RFQ row ${target.row_id} more than once`);
      seenRows.add(target.row_id);
      const qtyMicros = positiveQtyMicros(item, `${quote.name}.items[${index}].qty`);
      const rateMinor = integerMinor(
        item.rate_minor ?? toScaledInt(item.rate, scale, `${quote.name}.items[${index}].rate`),
        `${quote.name}.items[${index}].rate_minor`,
      );
      if (rateMinor < 0) throw errors.validation(`Supplier Quotation ${quote.name} has a negative rate at row ${index + 1}`);
      const offer: QuotationLineOffer = {
        quotation: quote.name,
        supplier: data.supplier,
        rfq_row_id: target.row_id,
        item_code: item.item_code,
        qty_micros: qtyMicros,
        qty: fromScaledInt(qtyMicros, QTY_SCALE),
        uom: lineUom(item),
        rate_minor: rateMinor,
        rate: fromScaledInt(rateMinor, scale),
        currency: data.currency,
        currency_scale: scale,
      };
      const list = lineOffers.get(target.row_id);
      if (list) list.push(offer);
      else lineOffers.set(target.row_id, [offer]);
    }
    const expired = Boolean(data.valid_till && dateOnly(data.valid_till, `${quote.name}.valid_till`) < normalizedAsOf);
    const baseTotal = data.base_grand_total_minor === undefined
      ? null
      : integerMinor(data.base_grand_total_minor, `${quote.name}.base_grand_total_minor`);
    documentRows.push({
      quotation: quote.name,
      supplier: data.supplier,
      currency: data.currency,
      company_currency: data.company_currency ?? null,
      expired,
      complete: seenRows.size === rfqRows.length,
      covered_rows: seenRows.size,
      total_rows: rfqRows.length,
      base_grand_total_minor: baseTotal,
    });
  }

  const lines: QuotationLineComparison[] = rfqRows.map((row) => ({
    rfq_row_id: row.row_id,
    item_code: row.item.item_code,
    requested_qty_micros: row.requested_qty_micros,
    requested_qty: fromScaledInt(row.requested_qty_micros, QTY_SCALE),
    uom: row.uom,
    offers: [...(lineOffers.get(row.row_id) ?? [])].sort(compareLineOffers),
  }));
  const completeRank = documentRows
    .filter((row) => row.complete && !row.expired && row.base_grand_total_minor !== null)
    .sort((a, b) => compareNullableMinor(a.base_grand_total_minor, b.base_grand_total_minor) || a.quotation.localeCompare(b.quotation))
    .map((row) => row.quotation);

  return {
    rfq: rfqName,
    company: rfq.company,
    as_of_date: normalizedAsOf,
    lines,
    quotations: documentRows.sort((a, b) => a.quotation.localeCompare(b.quotation)),
    complete_rank: completeRank,
  };
}

export function validateSupplierSelection(
  comparison: SupplierQuotationComparison,
  selections: SupplierSelectionInput[],
  reason: string,
): SupplierSelectionDecision {
  const selectionReason = requiredText(reason, "supplier selection reason");
  if (!Array.isArray(selections) || selections.length === 0) throw errors.validation("At least one supplier selection is required");
  const requiredRows = new Set(comparison.lines.map((line) => line.rfq_row_id));
  const byRow = new Map<string, SupplierSelectionInput>();
  for (const selection of selections) {
    const rowId = requiredText(selection.rfq_row_id, "rfq_row_id");
    const quotation = requiredText(selection.quotation, "quotation");
    if (!requiredRows.has(rowId)) throw errors.reference(`RFQ row ${rowId} does not exist in comparison`);
    if (byRow.has(rowId)) throw errors.validation(`RFQ row ${rowId} is selected more than once`);
    byRow.set(rowId, { rfq_row_id: rowId, quotation });
  }
  if (byRow.size !== requiredRows.size) throw errors.validation("Every RFQ item row must have one supplier selection");

  const lines = comparison.lines.map((line) => {
    const selection = byRow.get(line.rfq_row_id)!;
    const quoteMeta = comparison.quotations.find((row) => row.quotation === selection.quotation);
    if (!quoteMeta) throw errors.reference(`Supplier Quotation ${selection.quotation} is not in this comparison`);
    if (quoteMeta.expired) throw errors.reference(`Supplier Quotation ${selection.quotation} is expired`);
    const offer = line.offers.find((candidate) => candidate.quotation === selection.quotation);
    if (!offer) throw errors.reference(`Supplier Quotation ${selection.quotation} does not quote RFQ row ${line.rfq_row_id}`);
    return {
      rfq_row_id: line.rfq_row_id,
      quotation: offer.quotation,
      supplier: offer.supplier,
      item_code: offer.item_code,
      currency: offer.currency,
      rate_minor: offer.rate_minor,
    };
  });
  return { rfq: comparison.rfq, reason: selectionReason, lines };
}

export function validatePurchaseOrderAgainstQuotation(
  po: PurchaseOrderData,
  quotationName: string,
  quotation: SupplierQuotationData,
): PurchaseOrderQuotationCheck {
  if (po.supplier !== quotation.supplier || po.company !== quotation.company || po.currency !== quotation.currency) {
    throw errors.reference("Purchase Order commercial context does not match Supplier Quotation");
  }
  if (quotation.valid_till && dateOnly(po.transaction_date, "purchase_order.transaction_date") > dateOnly(quotation.valid_till, "supplier_quotation.valid_till")) {
    throw errors.reference(`Supplier Quotation ${quotationName} is expired for Purchase Order date ${po.transaction_date}`);
  }
  const quoteScale = integerScale(quotation.currency_scale, "supplier_quotation.currency_scale", 2);
  const quoteRows = quotation.items.map((item, index) => ({
    row_id: requiredText(item.row_id || `ROW-${index + 1}`, `supplier_quotation.items[${index}].row_id`),
    item,
    uom: lineUom(item),
  }));
  const seenQuoteRows = new Set<string>();
  const lines = po.items.map((item, index): PurchaseOrderQuotationLineCheck => {
    const raw = item as JsonObject;
    const explicit = typeof raw.supplier_quotation_item === "string" ? raw.supplier_quotation_item.trim() : "";
    const candidates = explicit
      ? quoteRows.filter((row) => row.row_id === explicit)
      : quoteRows.filter((row) => row.item.item_code === item.item_code && uomCompatible(row.uom, lineUom(item)));
    if (candidates.length !== 1) {
      throw errors.validation(`Purchase Order row ${index + 1} must identify exactly one Supplier Quotation row`);
    }
    const matched = candidates[0]!;
    if (matched.item.item_code !== item.item_code) throw errors.reference(`Purchase Order row ${index + 1} item does not match Supplier Quotation row ${matched.row_id}`);
    if (seenQuoteRows.has(matched.row_id)) throw errors.validation(`Supplier Quotation row ${matched.row_id} is consumed more than once in this Purchase Order`);
    seenQuoteRows.add(matched.row_id);
    const orderedQty = positiveQtyMicros(item, `purchase_order.items[${index}].qty`);
    const quotedQty = positiveQtyMicros(matched.item, `supplier_quotation.items[${matched.row_id}].qty`);
    if (orderedQty > quotedQty) throw errors.validation(`Purchase Order row ${index + 1} quantity exceeds Supplier Quotation row ${matched.row_id}`);
    const orderedRate = integerMinor(item.rate_minor ?? toScaledInt(item.rate, quoteScale, `purchase_order.items[${index}].rate`), `purchase_order.items[${index}].rate_minor`);
    const quotedRate = integerMinor(matched.item.rate_minor ?? toScaledInt(matched.item.rate, quoteScale, `supplier_quotation.items[${matched.row_id}].rate`), `supplier_quotation.items[${matched.row_id}].rate_minor`);
    return {
      po_row_id: requiredText(item.row_id || `ROW-${index + 1}`, `purchase_order.items[${index}].row_id`),
      quotation_row_id: matched.row_id,
      item_code: item.item_code,
      ordered_qty_micros: orderedQty,
      quoted_qty_micros: quotedQty,
      ordered_rate_minor: orderedRate,
      quoted_rate_minor: quotedRate,
      price_variance_minor: orderedRate - quotedRate,
    };
  });
  return { quotation: quotationName, supplier: quotation.supplier, currency: quotation.currency, lines };
}

export interface ThreeWayMatchPolicy {
  quantity_tolerance_bps?: number;
  price_tolerance_bps?: number;
  require_receipt_before_invoice?: boolean;
}

export interface ThreeWayMatchLineInput {
  line_key: string;
  item_code: string;
  ordered_qty_micros: number;
  received_qty_micros: number;
  invoiced_qty_micros: number;
  ordered_rate_minor: number;
  invoice_rate_minor: number;
  currency: string;
  currency_scale: number;
}

export interface ThreeWayMatchLineResult extends ThreeWayMatchLineInput {
  invoice_over_receipt_micros: number;
  invoice_over_order_micros: number;
  price_variance_minor: number;
  quantity_within_tolerance: boolean;
  price_within_tolerance: boolean;
  hold_reasons: string[];
}

export interface ThreeWayMatchResult {
  status: "Match" | "Hold";
  quantity_tolerance_bps: number;
  price_tolerance_bps: number;
  lines: ThreeWayMatchLineResult[];
  hold_reasons: string[];
}

export function evaluateThreeWayMatch(
  lines: ThreeWayMatchLineInput[],
  policy: ThreeWayMatchPolicy = {},
): ThreeWayMatchResult {
  if (!Array.isArray(lines) || lines.length === 0) throw errors.validation("Three-way match requires at least one line");
  const quantityTolerance = toleranceBps(policy.quantity_tolerance_bps ?? 0, "quantity_tolerance_bps");
  const priceTolerance = toleranceBps(policy.price_tolerance_bps ?? 0, "price_tolerance_bps");
  const requireReceipt = policy.require_receipt_before_invoice !== false;
  const seen = new Set<string>();
  const results = lines.map((line, index): ThreeWayMatchLineResult => {
    const key = requiredText(line.line_key, `lines[${index}].line_key`);
    if (seen.has(key)) throw errors.validation(`Three-way match line_key ${key} appears twice`);
    seen.add(key);
    requiredText(line.item_code, `lines[${index}].item_code`);
    requiredText(line.currency, `lines[${index}].currency`);
    integerScale(line.currency_scale, `lines[${index}].currency_scale`, 2);
    const ordered = nonNegativeInt(line.ordered_qty_micros, `lines[${index}].ordered_qty_micros`);
    const received = nonNegativeInt(line.received_qty_micros, `lines[${index}].received_qty_micros`);
    const invoiced = nonNegativeInt(line.invoiced_qty_micros, `lines[${index}].invoiced_qty_micros`);
    const orderedRate = nonNegativeInt(line.ordered_rate_minor, `lines[${index}].ordered_rate_minor`);
    const invoiceRate = nonNegativeInt(line.invoice_rate_minor, `lines[${index}].invoice_rate_minor`);
    if (ordered <= 0) throw errors.validation(`Ordered quantity must be positive at line ${key}`);
    const quantityWithinReceipt = !requireReceipt || withinUpperTolerance(invoiced, received, quantityTolerance);
    const quantityWithinOrder = withinUpperTolerance(invoiced, ordered, quantityTolerance);
    const quantityWithinTolerance = quantityWithinReceipt && quantityWithinOrder;
    const priceWithinTolerance = orderedRate === 0
      ? invoiceRate === 0
      : withinAbsoluteTolerance(invoiceRate, orderedRate, priceTolerance);
    const holdReasons: string[] = [];
    if (!quantityWithinReceipt) holdReasons.push("Invoice quantity exceeds received quantity tolerance");
    if (!quantityWithinOrder) holdReasons.push("Invoice quantity exceeds ordered quantity tolerance");
    if (!priceWithinTolerance) holdReasons.push("Invoice price exceeds purchase order price tolerance");
    return {
      ...line,
      line_key: key,
      ordered_qty_micros: ordered,
      received_qty_micros: received,
      invoiced_qty_micros: invoiced,
      ordered_rate_minor: orderedRate,
      invoice_rate_minor: invoiceRate,
      invoice_over_receipt_micros: Math.max(0, invoiced - received),
      invoice_over_order_micros: Math.max(0, invoiced - ordered),
      price_variance_minor: invoiceRate - orderedRate,
      quantity_within_tolerance: quantityWithinTolerance,
      price_within_tolerance: priceWithinTolerance,
      hold_reasons: holdReasons,
    };
  });
  const holdReasons = results.flatMap((line) => line.hold_reasons.map((reason) => `${line.line_key}: ${reason}`));
  return {
    status: holdReasons.length ? "Hold" : "Match",
    quantity_tolerance_bps: quantityTolerance,
    price_tolerance_bps: priceTolerance,
    lines: results,
    hold_reasons: holdReasons,
  };
}

function resolveQuotedRfqRow(
  item: PurchaseItem,
  rfqRows: RfqRow[],
  byId: Map<string, RfqRow>,
  quotation: string,
  index: number,
): RfqRow {
  const raw = item as JsonObject;
  const explicit = typeof raw.request_for_quotation_item === "string" ? raw.request_for_quotation_item.trim() : "";
  if (explicit) {
    const row = byId.get(explicit);
    if (!row) throw errors.reference(`Supplier Quotation ${quotation} row ${index + 1} references unknown RFQ row ${explicit}`);
    if (row.item.item_code !== item.item_code) throw errors.reference(`Supplier Quotation ${quotation} row ${index + 1} item does not match RFQ row ${explicit}`);
    return row;
  }
  const quoteUom = lineUom(item);
  const candidates = rfqRows.filter((row) => row.item.item_code === item.item_code && uomCompatible(row.uom, quoteUom));
  if (candidates.length !== 1) {
    throw errors.validation(`Supplier Quotation ${quotation} row ${index + 1} must declare request_for_quotation_item because the RFQ match is ${candidates.length === 0 ? "missing" : "ambiguous"}`);
  }
  return candidates[0]!;
}

function compareLineOffers(a: QuotationLineOffer, b: QuotationLineOffer): number {
  if (a.currency === b.currency && a.currency_scale === b.currency_scale) {
    if (a.rate_minor !== b.rate_minor) return a.rate_minor < b.rate_minor ? -1 : 1;
    return a.quotation.localeCompare(b.quotation);
  }
  return a.currency.localeCompare(b.currency) || a.quotation.localeCompare(b.quotation);
}

function compareNullableMinor(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

function positiveQtyMicros(item: { qty: unknown; qty_micros?: number }, field: string): number {
  const qty = item.qty_micros ?? (typeof item.qty === "string" || typeof item.qty === "number" ? toScaledInt(item.qty, QTY_SCALE, field) : NaN);
  if (!Number.isSafeInteger(qty) || qty <= 0) throw errors.validation(`${field} must be a positive quantity`);
  return qty;
}

function lineUom(item: { uom?: string; stock_uom?: string }): string | null {
  const value = item.uom?.trim() || item.stock_uom?.trim() || "";
  return value || null;
}

function uomCompatible(left: string | null, right: string | null): boolean {
  if (!left || !right) return true;
  return left.toLocaleLowerCase("vi") === right.toLocaleLowerCase("vi");
}

function dateOnly(value: string, field: string): string {
  const text = requiredText(value, field).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw errors.validation(`${field} must contain a valid ISO date`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw errors.validation(`${field} must contain a valid ISO date`);
  }
  return text;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${field} is required`);
  return value.trim();
}

function integerScale(value: unknown, field: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 9) {
    throw errors.validation(`${field} must be an integer from 0 to 9`);
  }
  return value;
}

function integerMinor(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw errors.validation(`${field} must use integer minor units`);
  return value;
}

function nonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw errors.validation(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function toleranceBps(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw errors.validation(`${field} must be an integer between 0 and 10000`);
  return value;
}

function withinUpperTolerance(actual: number, baseline: number, tolerance: number): boolean {
  if (actual <= baseline) return true;
  if (baseline <= 0) return false;
  return BigInt(actual - baseline) * BPS <= BigInt(baseline) * BigInt(tolerance);
}

function withinAbsoluteTolerance(actual: number, baseline: number, tolerance: number): boolean {
  if (actual === baseline) return true;
  if (baseline <= 0) return false;
  return BigInt(Math.abs(actual - baseline)) * BPS <= BigInt(baseline) * BigInt(tolerance);
}
