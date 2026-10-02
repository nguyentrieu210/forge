import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { reverseGl, reverseStock } from "../../ledger/src/index.js";
import {
  RolloutPurchaseReceiptController,
  type PurchaseReceiptData,
} from "../../clouderp-core/src/index.js";
import {
  DeliveryNoteController,
  type DeliveryNoteData,
} from "../../clouderp-selling/src/index.js";
import { requireLeafWarehouse } from "../../clouderp-stock/src/index.js";
import { assertStockPlanRespectsReservations } from "./outbound-reservation-guard.js";

type WarehouseLine = JsonObject & { warehouse?: string };
type WarehouseScopedDocument = JsonObject & {
  company?: string;
  items?: WarehouseLine[];
};

export async function assertPostingWarehouses(
  context: ControllerContext<JsonObject>,
  document: WarehouseScopedDocument,
): Promise<void> {
  const company = text(document.company);
  if (!company || !Array.isArray(document.items)) return;

  const checked = new Set<string>();
  for (const row of document.items) {
    const warehouse = text(row.warehouse);
    if (!warehouse || checked.has(warehouse)) continue;
    checked.add(warehouse);
    await requireLeafWarehouse(context, warehouse, company);
  }
}

abstract class WarehouseScopedController<T extends WarehouseScopedDocument>
implements DocumentController<T> {
  abstract readonly doctype: string;
  protected abstract readonly delegate: DocumentController<T>;

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    if (context.command.action === "submit") {
      await assertPostingWarehouses(
        context as unknown as ControllerContext<JsonObject>,
        context.command.document,
      );
    }
    return this.delegate.buildPlan(context);
  }
}

/** Delivery uses the Sales Order lineage as its own reservation source. */
export class WarehouseScopedDeliveryNoteController
extends WarehouseScopedController<DeliveryNoteData> {
  readonly doctype = "Delivery Note";
  protected readonly delegate = new DeliveryNoteController();

  override async buildPlan(context: ControllerContext<DeliveryNoteData>): Promise<MutationPlan<DeliveryNoteData>> {
    if (context.command.action === "submit") {
      await assertPostingWarehouses(
        context as unknown as ControllerContext<JsonObject>,
        context.command.document,
      );
    }
    const plan = await this.delegate.buildPlan(context);
    const source = context.command.action === "cancel" ? context.existing?.data : context.command.document;
    await assertStockPlanRespectsReservations(context, plan.stock_entries, [
      context.command.aggregate.name,
      text(source?.against_sales_order),
    ]);
    return plan;
  }
}

export async function exactPurchaseReceiptCancellationPlan(
  context: ControllerContext<PurchaseReceiptData>,
  plan: MutationPlan<PurchaseReceiptData>,
): Promise<MutationPlan<PurchaseReceiptData>> {
  if (!context.existing) throw errors.notFound();
  const revision = context.existing.version;
  const [stock, gl] = await Promise.all([
    context.reader.getVoucherStockEntries(
      context.command.tenant_id,
      "Purchase Receipt",
      context.command.aggregate.name,
      revision,
    ),
    context.reader.getVoucherGlEntries(
      context.command.tenant_id,
      "Purchase Receipt",
      context.command.aggregate.name,
      revision,
    ),
  ]);
  if (stock.length === 0) {
    throw errors.reference(`Original stock posting for Purchase Receipt ${context.command.aggregate.name} was not found`);
  }
  return {
    ...plan,
    stock_entries: reverseStock(stock),
    gl_entries: reverseGl(gl),
  };
}

export class WarehouseScopedPurchaseReceiptController
extends WarehouseScopedController<PurchaseReceiptData> {
  readonly doctype = "Purchase Receipt";
  protected readonly delegate = new RolloutPurchaseReceiptController();

  override async buildPlan(context: ControllerContext<PurchaseReceiptData>): Promise<MutationPlan<PurchaseReceiptData>> {
    if (context.command.action === "submit") {
      await assertPostingWarehouses(
        context as unknown as ControllerContext<JsonObject>,
        context.command.document,
      );
      const plan = await this.delegate.buildPlan(context);
      await assertStockPlanRespectsReservations(context, plan.stock_entries, [context.command.aggregate.name]);
      return plan;
    }
    if (context.command.action !== "cancel") return this.delegate.buildPlan(context);
    await assertNoActiveLandedCostVoucher(context);
    const delegated = await this.delegate.buildPlan(context);
    const exact = await exactPurchaseReceiptCancellationPlan(context, delegated);
    await assertStockPlanRespectsReservations(context, exact.stock_entries, [context.command.aggregate.name]);
    return exact;
  }
}

async function assertNoActiveLandedCostVoucher(context: ControllerContext<PurchaseReceiptData>): Promise<void> {
  const vouchers = await context.reader.listDocumentsByDoctype<JsonObject>(
    context.command.tenant_id,
    "Landed Cost Voucher",
  );
  const blocking = vouchers.find((voucher) => voucher.docstatus === 1
    && Array.isArray(voucher.data.purchase_receipts)
    && voucher.data.purchase_receipts.some((row) =>
      row && typeof row === "object" && !Array.isArray(row)
      && text((row as JsonObject).purchase_receipt) === context.command.aggregate.name));
  if (blocking) {
    throw errors.reference(
      `Cancel Landed Cost Voucher ${blocking.name} before cancelling Purchase Receipt ${context.command.aggregate.name}`,
    );
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
