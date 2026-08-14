import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SalesLinkedWorkOrderController } from "./manufacturing-sales-lineage.js";
import { StockUomSnapshotWorkOrderController } from "./manufacturing-work-order-guard.js";
import type { WorkOrderData } from "./types.js";

/**
 * Final Work Order release authority selector.
 *
 * AlumDoor already has a richer Sales Order -> Production Request -> Work Order vertical
 * flow with `production_request_line_key`, dimensions, leaf plan and paint/cut lineage.
 * Generic Production Plan lineage must compose beside that path, not replace it.
 */
export class ManufacturingReleaseAuthorityWorkOrderController extends SalesLinkedWorkOrderController {
  private readonly verticalDelegate = new StockUomSnapshotWorkOrderController();

  override async normalize(context: ControllerContext<WorkOrderData>): Promise<WorkOrderData> {
    const input = context.command.document as WorkOrderData & JsonObject;
    const productionRequest = text(input.production_request);
    const productionRequestLineKey = text(input.production_request_line_key);
    const productionPlan = text(input.production_plan);
    const productionPlanRowId = text(input.production_plan_row_id);
    const againstSalesOrder = text(input.against_sales_order);

    if (productionRequest || productionRequestLineKey) {
      if (!productionRequest || !productionRequestLineKey) {
        throw errors.validation("Work Order requires both production_request and production_request_line_key");
      }
      if (productionPlan || productionPlanRowId) {
        throw errors.validation("Work Order cannot mix Production Request and Production Plan release authorities");
      }
      return this.verticalDelegate.normalize(context);
    }

    // Historical AlumDoor records may carry direct sales lineage before Production Request
    // became mandatory. Keep them executable/cancellable without rewriting their authority.
    if (againstSalesOrder && !productionPlan && !productionPlanRowId) {
      return this.verticalDelegate.normalize(context);
    }

    return super.normalize(context);
  }
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFC").trim()
    : "";
}
