import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { AccountingStockEntryController } from "../../clouderp-core/src/accounting-stock-entry-controller.js";
import type { StockEntryData } from "../../clouderp-core/src/types.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { PhysicalStockEntryController } from "./physical-stock-entry.js";
import { GuardedManufacturingStockEntryController } from "./manufacturing-stock-guard.js";

interface WorkOrderRolloutData extends JsonObject {
  manufacturing_snapshot?: JsonObject;
  bom_checksum?: string;
}

/**
 * Final Stock Entry rollout boundary.
 *
 * Material Receipt/Issue uses the VN-policy-aware accounting controller. Material
 * Transfer/Manufacture keeps the manufacturing/physical-stock rollout path. Keeping
 * the routing here matters because this controller is registered last for Stock Entry.
 */
export class RolloutManufacturingStockEntryController extends GuardedManufacturingStockEntryController {
  private readonly legacyController = new PhysicalStockEntryController();
  private readonly accountingController = new AccountingStockEntryController();

  override async buildPlan(context: ControllerContext<StockEntryData>): Promise<MutationPlan<StockEntryData>> {
    const source = context.command.action === "cancel" ? context.existing?.data : context.command.document;
    if (source?.purpose === "Material Receipt" || source?.purpose === "Material Issue") {
      return this.accountingController.buildPlan(context);
    }
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
