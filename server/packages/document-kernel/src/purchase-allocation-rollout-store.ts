import { D1PurchaseAllocationDomainStore } from "./purchase-allocation-domain-store.js";
import { InMemoryPurchaseAllocationMutationStore } from "./purchase-allocation-in-memory-store.js";

/** Production allocation store. No rollout row means the new engine is disabled. */
export class D1RolloutPurchaseAllocationDomainStore extends D1PurchaseAllocationDomainStore {
  private readonly rolloutReader: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    super(db);
    this.rolloutReader = db.withSession?.("first-primary") ?? db;
  }

  async isPurchaseAllocationEnabled(tenantId: string): Promise<boolean> {
    const row = await this.rolloutReader.prepare(
      `SELECT enabled FROM purchase_allocation_rollout_state WHERE tenant_id=?1`,
    ).bind(tenantId).first<{ enabled: number }>();
    return Number(row?.enabled ?? 0) === 1;
  }
}

/** Test store with an explicit switch; disabled by default like production. */
export class InMemoryRolloutPurchaseAllocationMutationStore extends InMemoryPurchaseAllocationMutationStore {
  private allocationEnabled = false;

  setPurchaseAllocationEnabled(enabled = true): void {
    this.allocationEnabled = enabled;
  }

  async isPurchaseAllocationEnabled(_tenantId: string): Promise<boolean> {
    return this.allocationEnabled;
  }
}
