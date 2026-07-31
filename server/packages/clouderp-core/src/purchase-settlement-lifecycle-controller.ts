import { errors } from "../../core/src/index.js";
import { activePurchaseAllocationReader } from "../../document-kernel/src/index.js";
import { PurchaseSettlementController } from "./purchase-allocation-action-controllers.js";

type SettlementController = InstanceType<typeof PurchaseSettlementController>;
type SettlementContext = Parameters<SettlementController["buildPlan"]>[0];

/** Adds the cross-window lifecycle preflight without duplicating settlement math. */
export class PurchaseSettlementLifecycleController extends PurchaseSettlementController {
  override async buildPlan(context: SettlementContext) {
    const data = context.command.document;
    if (context.command.action === "submit"
      && data.operation === "Reverse"
      && typeof data.queue_key === "string"
      && typeof data.window_id === "string") {
      const reader = await activePurchaseAllocationReader(context.reader, context.command.tenant_id);
      if (reader) {
        const state = await reader.getPurchaseSettlementWindowState(
          context.command.tenant_id,
          data.queue_key,
          data.window_id,
        ) as (Awaited<ReturnType<typeof reader.getPurchaseSettlementWindowState>> & {
          next_window_has_activity?: boolean;
        });
        if (state?.next_window_has_activity) {
          throw errors.lifecycle(
            "An earlier settlement window cannot be reopened after the following window has activity",
          );
        }
      }
    }
    return super.buildPlan(context);
  }
}
