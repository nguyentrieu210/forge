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

    const current = new Map<string, number>();
    for (const line of plan.procurement_entries) {
      if (line.kind !== "Billing" || line.qty_micros <= 0) continue;
      const key = `${line.purchase_order}\u0000${line.item_code}`;
      current.set(key, safeAdd(current.get(key) ?? 0, line.qty_micros, "current billing quantity"));
    }
    for (const [key, qty] of current) {
      const split = key.indexOf("\u0000");
      const purchaseOrder = key.slice(0, split);
      const itemCode = key.slice(split + 1);
      const source = await context.reader.getDocument<PurchaseOrderData>(context.command.tenant_id, "Purchase Order", purchaseOrder);
      if (!source || source.docstatus !== 1) throw errors.reference(`Submitted Purchase Order ${purchaseOrder} is required`);
      const ordered = source.data.items
        .filter((item) => item.item_code === itemCode)
        .reduce((sum, item) => safeAdd(sum, stockQtyMicros(item), `Purchase Order ${purchaseOrder} quantity`), 0);
      const billed = await context.reader.getProcuredQuantityMicros(context.command.tenant_id, purchaseOrder, "Billing", itemCode);
      if (safeAdd(billed, qty, `Purchase Order ${purchaseOrder} billed quantity`) > ordered) {
        throw errors.reference(`Billing quantity for ${itemCode} exceeds approved Purchase Order ${purchaseOrder}`);
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
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw errors.validation(`${field} must use safe integers`);
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}
