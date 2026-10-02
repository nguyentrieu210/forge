import { assertSafeInteger, safeAddInt } from "../../core/src/index.js";
import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { ProcurementP2PPurchaseInvoiceController, ProcurementP2PPurchaseOrderController } from "./procurement-p2p-controllers.js";
import type { PurchaseInvoiceData, PurchaseOrderData } from "./types.js";
import { stockQtyMicros } from "./uom.js";

/**
 * Backward-compatible policy cutover. The first-party procurement app sends
 * `receipt_match_required = 1` by default, but legacy integrations that do not know the field keep
 * their historical two-way PO/Invoice behavior instead of suddenly failing invoices in production.
 */
export class ProcurementP2PRolloutPurchaseOrderController extends ProcurementP2PPurchaseOrderController {
  override async buildPlan(context: ControllerContext<PurchaseOrderData>): Promise<MutationPlan<PurchaseOrderData>> {
    if (context.command.action !== "submit" || hasReceiptMatchField(context.command.document)) {
      return super.buildPlan(context);
    }
    const compatibilityContext: ControllerContext<PurchaseOrderData> = {
      ...context,
      command: {
        ...context.command,
        document: { ...context.command.document, receipt_match_required: false },
      },
    };
    const plan = await super.buildPlan(compatibilityContext);
    return { ...plan, command: context.command };
  }
}

/**
 * The kernel/D1 procurement-progress invariant deliberately keeps billed quantity <= ordered
 * quantity. Match tolerance therefore applies to receipt timing/measurement, never as permission
 * to create a payable quantity beyond the approved PO. Assert that boundary before commit so both
 * in-memory and D1 paths fail with the same domain meaning.
 */
export class ProcurementP2PRolloutPurchaseInvoiceController extends ProcurementP2PPurchaseInvoiceController {
  override async buildPlan(context: ControllerContext<PurchaseInvoiceData>): Promise<MutationPlan<PurchaseInvoiceData>> {
    const plan = await super.buildPlan(context);
    if (context.command.action !== "submit" || !plan.procurement_entries?.length) return plan;

    const current = new Map<string, { purchase_order: string; item_code: string; row_id?: string; qty_micros: number }>();
    for (const line of plan.procurement_entries) {
      if (line.kind !== "Billing" || line.qty_micros <= 0) continue;
      const rowId = line.purchase_order_item_row_id;
      const key = JSON.stringify([line.purchase_order, line.item_code, rowId ?? ""]);
      const prior = current.get(key);
      current.set(key, {
        purchase_order: line.purchase_order,
        item_code: line.item_code,
        ...(rowId ? { row_id: rowId } : {}),
        qty_micros: safeAdd(prior?.qty_micros ?? 0, line.qty_micros, "current billing quantity"),
      });
    }
    for (const entry of current.values()) {
      const source = await context.reader.getDocument<PurchaseOrderData>(
        context.command.tenant_id,
        "Purchase Order",
        entry.purchase_order,
      );
      if (!source || source.docstatus !== 1) {
        throw errors.reference(`Submitted Purchase Order ${entry.purchase_order} is required`);
      }
      const ordered = source.data.items
        .filter((item) => entry.row_id ? item.row_id === entry.row_id : item.item_code === entry.item_code)
        .reduce((sum, item) => safeAdd(sum, stockQtyMicros(item), `Purchase Order ${entry.purchase_order} quantity`), 0);
      if (ordered <= 0) {
        throw errors.reference(
          entry.row_id
            ? `Purchase Order ${entry.purchase_order} row ${entry.row_id} does not exist`
            : `Item ${entry.item_code} is not in Purchase Order ${entry.purchase_order}`,
        );
      }
      const billed = await context.reader.getProcuredQuantityMicros(
        context.command.tenant_id,
        entry.purchase_order,
        "Billing",
        entry.item_code,
        entry.row_id,
      );
      if (safeAdd(billed, entry.qty_micros, `Purchase Order ${entry.purchase_order} billed quantity`) > ordered) {
        throw errors.reference(
          entry.row_id
            ? `Billing quantity for ${entry.item_code} row ${entry.row_id} exceeds approved Purchase Order ${entry.purchase_order}`
            : `Billing quantity for ${entry.item_code} exceeds approved Purchase Order ${entry.purchase_order}`,
        );
      }
    }
    return plan;
  }
}

function hasReceiptMatchField(data: PurchaseOrderData): boolean {
  const value = (data as JsonObject).receipt_match_required;
  return value !== undefined && value !== null && value !== "";
}

function safeAdd(left: number, right: number, field: string): number {
  assertSafeInteger(left, `${field} must use safe integers`);
  assertSafeInteger(right, `${field} must use safe integers`);
  return safeAddInt(left, right, `${field} exceeds safe integer range`);
}
