import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { requireLeafWarehouse } from "../../clouderp-stock/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import type { StockReturnData } from "./types.js";
import { StockReturnController } from "./controllers.js";

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

export class StockReturnIntegrityController extends StockReturnController {
  override async buildPlan(context: ControllerContext<StockReturnData>): Promise<MutationPlan<StockReturnData>> {
    if (context.command.action === "submit") {
      const company = text(context.command.document.company);
      for (const row of context.command.document.items ?? []) {
        if (!row.warehouse) continue;
        await requireLeafWarehouse(
          context as unknown as ControllerContext<JsonObject>,
          row.warehouse,
          company,
        );
      }
    }
    return super.buildPlan(context);
  }
}
