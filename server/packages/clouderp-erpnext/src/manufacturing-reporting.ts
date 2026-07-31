import type { JsonObject } from "../../contracts/src/index.js";
import type { StockEntryData } from "../../clouderp-core/src/types.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { RolloutManufacturingStockEntryController } from "./manufacturing-rollout.js";

interface ReportingStockRow extends JsonObject {
  work_order?: string;
}

interface ReportingStockData extends StockEntryData {
  items: ReportingStockRow[];
}

/**
 * Denormalizes the immutable Work Order reference onto each manufacturing child row.
 *
 * Child-row reports are intentionally document reports, not a replacement for the stock
 * ledger. Copying this stable reference lets operators group issue/consume/scrap/offcut
 * rows by Work Order without guessing the parent from a generated row name.
 */
export class ReportingManufacturingStockEntryController extends RolloutManufacturingStockEntryController {
  override async normalize(context: ControllerContext<StockEntryData>): Promise<StockEntryData> {
    const normalized = await super.normalize(context) as ReportingStockData;
    if (!normalized.work_order || !["Material Transfer", "Manufacture"].includes(normalized.purpose)) {
      return normalized;
    }
    return {
      ...normalized,
      items: normalized.items.map((row) => ({
        ...row,
        work_order: normalized.work_order,
      })),
    };
  }
}
