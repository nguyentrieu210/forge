import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { CutOrderController } from "./alumdoor-inventory.js";
import { assertCancellationReason } from "./alumdoor-reason-masters.js";
import { withReservationLifecycleReader } from "./reservation-lifecycle-reader.js";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Composition wrapper instead of subclassing because CutOrderController's internal data type
 * is intentionally private to alumdoor-inventory.ts. This keeps the public controller registry
 * on JsonObject while preserving the exact mature Cut Order mutation plan.
 */
export class CutOrderReservationIntegrityController implements DocumentController<JsonObject> {
  readonly doctype = "Cut Order";
  private readonly delegate = new CutOrderController();

  async buildPlan(context: ControllerContext<JsonObject>): Promise<MutationPlan<JsonObject>> {
    if (context.command.action === "cancel") {
      await assertCancellationReason(context, context.command.document.cancel_reason, "Phiếu cắt");
    }
    const document = context.command.action === "cancel" ? context.existing?.data : context.command.document;
    const ownSources = [
      context.command.aggregate.name,
      text(document?.production_order),
      text(document?.so_reference),
    ];
    const scoped = withReservationLifecycleReader(context, ownSources);
    return this.delegate.buildPlan(scoped as never) as unknown as Promise<MutationPlan<JsonObject>>;
  }
}
