import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { D1ExactManufacturingCostingService as BaseExactManufacturingCostingService } from "./manufacturing-costing-exact-base.js";
import type { ManufacturingCostAdjustmentInput } from "./manufacturing-costing-base.js";

export * from "./manufacturing-costing-exact-base.js";

/** Maps storage-level race guards back to the same stable API validation contract. */
export class D1ExactManufacturingCostingService extends BaseExactManufacturingCostingService {
  override async adjust(
    tenantId: string,
    actor: Actor,
    input: ManufacturingCostAdjustmentInput,
    now = new Date().toISOString(),
  ): Promise<{ adjustment_id: string; existing: boolean }> {
    try {
      return await super.adjust(tenantId, actor, input, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("MANUFACTURING_COST_NEGATIVE_TOTAL")) {
        throw errors.validation("Manufacturing cost adjustments cannot make total actual cost negative");
      }
      throw error;
    }
  }
}
