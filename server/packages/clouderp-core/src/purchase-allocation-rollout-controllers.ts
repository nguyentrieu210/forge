import type { MutationPlan } from "../../contracts/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { activePurchaseAllocationReader } from "../../document-kernel/src/index.js";
import {
  PurchaseOrderController,
  PurchaseReceiptController,
} from "./controllers.js";
import {
  AllocatingPurchaseOrderController,
  AllocatingPurchaseReceiptController,
} from "./purchase-allocation-controllers.js";
import type { PurchaseOrderData, PurchaseReceiptData } from "./types.js";

/**
 * Production-safe switch between the legacy purchase flow and allocation v1.
 * A tenant remains on the legacy controllers until its rollout row is enabled
 * after backfill/checksum review.
 */
export class RolloutPurchaseOrderController implements DocumentController<PurchaseOrderData> {
  readonly doctype = "Purchase Order";
  private readonly legacy = new PurchaseOrderController();
  private readonly allocating = new AllocatingPurchaseOrderController();

  async buildPlan(context: ControllerContext<PurchaseOrderData>): Promise<MutationPlan<PurchaseOrderData>> {
    const active = await activePurchaseAllocationReader(
      context.reader,
      context.command.tenant_id,
    );
    return active
      ? this.allocating.buildPlan({ ...context, reader: active })
      : this.legacy.buildPlan(context);
  }
}

export class RolloutPurchaseReceiptController implements DocumentController<PurchaseReceiptData> {
  readonly doctype = "Purchase Receipt";
  private readonly legacy = new PurchaseReceiptController();
  private readonly allocating = new AllocatingPurchaseReceiptController();

  async buildPlan(context: ControllerContext<PurchaseReceiptData>): Promise<MutationPlan<PurchaseReceiptData>> {
    const active = await activePurchaseAllocationReader(
      context.reader,
      context.command.tenant_id,
    );
    return active
      ? this.allocating.buildPlan({ ...context, reader: active })
      : this.legacy.buildPlan(context);
  }
}
