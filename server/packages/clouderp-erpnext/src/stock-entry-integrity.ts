import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import type { StockEntryData } from "../../clouderp-core/src/types.js";
import { requireLeafWarehouse } from "../../clouderp-stock/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { RolloutManufacturingStockEntryController } from "./manufacturing-rollout.js";

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

async function assertWarehouseScope(context: ControllerContext<StockEntryData>): Promise<void> {
  if (context.command.action !== "submit") return;
  const document = context.command.document;
  const company = text(document.company);
  if (!company) return;

  const names = new Set<string>();
  for (const row of Array.isArray(document.items) ? document.items : []) {
    if (row.source_warehouse) names.add(text(row.source_warehouse));
    if (row.target_warehouse) names.add(text(row.target_warehouse));
  }
  if (document.target_warehouse) names.add(text(document.target_warehouse));

  for (const warehouseName of names) {
    if (!warehouseName) continue;
    await requireLeafWarehouse(
      context as unknown as ControllerContext<JsonObject>,
      warehouseName,
      company,
    );
  }
}

/**
 * Cross-company warehouse guard around the complete Stock Entry rollout chain.
 * The wrapped controller still owns physical identity, manufacturing revision and
 * legacy-work-order routing. Cancel is deliberately not revalidated against current
 * warehouse masters so historical reversals remain possible after master-data changes.
 */
export class StockEntryIntegrityController extends RolloutManufacturingStockEntryController {
  override async buildPlan(context: ControllerContext<StockEntryData>): Promise<MutationPlan<StockEntryData>> {
    await assertWarehouseScope(context);
    return super.buildPlan(context);
  }
}
