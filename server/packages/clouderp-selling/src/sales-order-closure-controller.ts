import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import { SalesOrderController } from "./controllers.js";
import type { QuotationData } from "./quotation-types.js";
import type { SalesItem, SalesOrderData } from "./types.js";

/**
 * Transaction-closure hardening for Sales Order source traceability.
 *
 * The canonical SalesOrderController remains the pricing/UOM/fulfilment authority.
 * This subclass only closes two Sales-owned gaps:
 * - Quotation -> Sales Order source-line integrity and cumulative quoted quantity;
 * - domain revision numbering on top of the framework-owned amended_from chain.
 *
 * It deliberately does not own credit, stock valuation, GL or settlement authority.
 */
export class SalesOrderClosureController extends SalesOrderController {
  override async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const data = await super.normalize(context);
    const existing = context.existing?.data;
    let quotationName = text((data as JsonObject).against_quotation);

    if (existing) {
      const previousQuotation = text((existing as JsonObject).against_quotation);
      if (previousQuotation !== quotationName) {
        throw errors.lifecycle("Sales Order.against_quotation cannot change after creation");
      }
    }

    let revisionNo = existing ? revision(existing) : 1;
    if (!existing && context.command.amended_from) {
      const source = await requireSalesOrder(context, context.command.amended_from);
      if (source.docstatus !== 2) {
        throw errors.lifecycle("A revised Sales Order may amend only a cancelled Sales Order");
      }
      assertSameCommercialContext(data, source.data, context.command.amended_from);
      const sourceQuotation = text((source.data as JsonObject).against_quotation);
      if (sourceQuotation && !quotationName) quotationName = sourceQuotation;
      if (sourceQuotation !== quotationName) {
        throw errors.reference("Revised Sales Order must preserve its Quotation source");
      }
      revisionNo = revision(source.data) + 1;
    }

    const result = { ...data, revision_no: revisionNo } as SalesOrderData;
    delete (result as JsonObject).quotation_revision_no;

    if (!quotationName) {
      delete (result as JsonObject).against_quotation;
      return result;
    }

    const quotation = await requireQuotation(context, quotationName);
    if (quotation.docstatus !== 1) {
      throw errors.reference(`Quotation ${quotationName} must be submitted before creating a Sales Order`);
    }
    assertSameQuotationContext(result, quotation.data, quotationName);
    await assertQuotationItemIntegrity(context, result, quotation);

    (result as JsonObject).against_quotation = quotationName;
    (result as JsonObject).quotation_revision_no = revision(quotation.data);
    return result;
  }
}

async function assertQuotationItemIntegrity(
  context: ControllerContext<SalesOrderData>,
  order: SalesOrderData,
  quotation: CanonicalDocument<QuotationData>,
): Promise<void> {
  const quotationItems = new Map<string, SalesItem>();
  for (const item of quotation.data.items) {
    const rowId = text(item.row_id);
    if (!rowId) throw errors.reference(`Quotation ${quotation.name} contains an item without row identity`);
    quotationItems.set(rowId, item);
  }

  const orderQtyByQuotationRow = new Map<string, number>();
  for (const [index, item] of order.items.entries()) {
    const quotationItem = text((item as JsonObject).quotation_item);
    if (!quotationItem) {
      throw errors.reference(`Sales Order item ${index + 1} must preserve quotation_item when against_quotation is set`);
    }
    const source = quotationItems.get(quotationItem);
    if (!source) {
      throw errors.reference(`Quotation item ${quotationItem} does not belong to Quotation ${quotation.name}`);
    }
    if (source.item_code !== item.item_code) {
      throw errors.reference(`Sales Order item ${item.item_code} does not match Quotation item ${quotationItem}`);
    }
    if (factorMicros(source) !== factorMicros(item)) {
      throw errors.reference(`Sales Order item ${item.item_code} must preserve Quotation conversion_factor`);
    }
    const qty = quantityMicros(item);
    orderQtyByQuotationRow.set(quotationItem, (orderQtyByQuotationRow.get(quotationItem) ?? 0) + qty);
  }

  for (const [quotationItem, qty] of orderQtyByQuotationRow) {
    const quoted = quantityMicros(quotationItems.get(quotationItem)!);
    if (qty > quoted) {
      throw errors.reference(`Sales Order quantity exceeds Quotation item ${quotationItem}`, {
        quotation: quotation.name,
        quotation_item: quotationItem,
        quoted_qty_micros: quoted,
        order_qty_micros: qty,
      });
    }
  }

  if (context.command.action !== "submit") return;

  const submittedOrders = await context.reader.listDocumentsByDoctype<SalesOrderData>(
    context.command.tenant_id,
    "Sales Order",
  );
  const alreadyOrdered = new Map<string, number>();
  for (const document of submittedOrders) {
    if (document.docstatus !== 1 || document.name === context.command.aggregate.name) continue;
    if (text((document.data as JsonObject).against_quotation) !== quotation.name) continue;
    for (const item of document.data.items) {
      const quotationItem = text((item as JsonObject).quotation_item);
      if (!quotationItem) continue;
      alreadyOrdered.set(quotationItem, (alreadyOrdered.get(quotationItem) ?? 0) + quantityMicros(item));
    }
  }

  for (const [quotationItem, currentQty] of orderQtyByQuotationRow) {
    const quoted = quantityMicros(quotationItems.get(quotationItem)!);
    const prior = alreadyOrdered.get(quotationItem) ?? 0;
    if (prior + currentQty > quoted) {
      throw errors.reference(`Cumulative Sales Order quantity exceeds Quotation item ${quotationItem}`, {
        quotation: quotation.name,
        quotation_item: quotationItem,
        quoted_qty_micros: quoted,
        already_ordered_qty_micros: prior,
        current_order_qty_micros: currentQty,
      });
    }
  }
}

async function requireQuotation(
  context: ControllerContext<SalesOrderData>,
  name: string,
): Promise<CanonicalDocument<QuotationData>> {
  const quotation = await context.reader.getDocument<QuotationData>(context.command.tenant_id, "Quotation", name);
  if (!quotation) throw errors.reference(`Quotation ${name} does not exist or is unavailable`);
  return quotation;
}

async function requireSalesOrder(
  context: ControllerContext<SalesOrderData>,
  name: string,
): Promise<CanonicalDocument<SalesOrderData>> {
  const order = await context.reader.getDocument<SalesOrderData>(context.command.tenant_id, "Sales Order", name);
  if (!order) throw errors.reference(`Sales Order ${name} does not exist or is unavailable`);
  return order;
}

function assertSameQuotationContext(order: SalesOrderData, quotation: QuotationData, name: string): void {
  if (order.customer !== quotation.customer) throw errors.reference(`Quotation ${name} belongs to another customer`);
  if (order.company !== quotation.company) throw errors.reference(`Quotation ${name} belongs to another company`);
  if (order.currency !== quotation.currency) throw errors.reference(`Quotation ${name} uses another currency`);
}

function assertSameCommercialContext(order: SalesOrderData, source: SalesOrderData, name: string): void {
  if (order.customer !== source.customer) throw errors.reference(`Sales Order ${name} belongs to another customer`);
  if (order.company !== source.company) throw errors.reference(`Sales Order ${name} belongs to another company`);
  if (order.currency !== source.currency) throw errors.reference(`Sales Order ${name} uses another currency`);
}

function quantityMicros(item: SalesItem): number {
  if (typeof item.qty_micros === "number" && Number.isSafeInteger(item.qty_micros)) return item.qty_micros;
  return toScaledInt(item.qty, 6, "sales item qty");
}

function factorMicros(item: SalesItem): number {
  return toScaledInt(item.conversion_factor ?? "1", 6, "conversion_factor");
}

function revision(data: JsonObject): number {
  const raw = data.revision_no;
  if (raw === undefined || raw === null || raw === "") return 1;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw errors.reference("Document has an invalid revision_no");
  }
  return raw;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
