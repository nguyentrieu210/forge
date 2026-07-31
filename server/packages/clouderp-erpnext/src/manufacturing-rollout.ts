import type { MutationPlan } from "../../contracts/src/index.js";
import type { StockEntryData } from "../../clouderp-core/src/types.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { PhysicalStockEntryController } from "./physical-stock-entry.js";
import { GuardedManufacturingStockEntryController } from "./manufacturing-stock-guard.js";

interface WorkOrderRolloutData {
  manufacturing_snapshot?: unknown;
  bom_checksum?: unknown;
}

/**
 * Routes legacy submitted Work Orders through the pre-Slice-C stock path.
 *
 * New Work Orders with an immutable snapshot receive revision/BOM-row guards. Existing
 * Work Orders remain executable and cancellable without pretending a historical checksum
 * existed. This class is the rollout boundary; no tenant-wide switch or data rewrite is
 * required merely to keep work already on the shop floor moving.
 */
export class RolloutManufacturingStockEntryController extends GuardedManufacturingStockEntryController {
  private readonly legacyController = new PhysicalStockEntryController();

  override async buildPlan(context: ControllerContext<StockEntryData>): Promise<MutationPlan<StockEntryData>> {
    if (await isLegacyWorkOrderMutation(context)) {
      return this.legacyController.buildPlan(context);
    }
    return super.buildPlan(context);
  }
}

async function isLegacyWorkOrderMutation(context: ControllerContext<StockEntryData>): Promise<boolean> {
  const source = context.command.action === "cancel"
    ? context.existing?.data
    : context.command.document;
  const workOrder = typeof source?.work_order === "string" ? source.work_order.trim() : "";
  const purpose = typeof source?.purpose === "string" ? source.purpose : "";
  if (!workOrder || !["Material Transfer", "Manufacture"].includes(purpose)) return false;

  const document = await context.reader.getDocument<WorkOrderRolloutData>(
    context.command.tenant_id,
    "Work Order",
    workOrder,
  );
  if (!document || document.docstatus !== 1) return false;
  return !document.data.manufacturing_snapshot || !document.data.bom_checksum;
}
