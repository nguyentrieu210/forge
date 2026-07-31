import { D1PurchaseAllocationDomainStore } from "./purchase-allocation-domain-store.js";
import { InMemoryPurchaseAllocationMutationStore } from "./purchase-allocation-in-memory-store.js";
import type { PurchaseSettlementWindowState } from "./purchase-allocation-reader.js";

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

  override async getPurchaseSettlementWindowState(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<(PurchaseSettlementWindowState & { next_window_has_activity: boolean }) | null> {
    const state = await super.getPurchaseSettlementWindowState(tenantId, queueKey, windowId);
    if (!state) return null;
    const row = await this.rolloutReader.prepare(
      `SELECT EXISTS (
         SELECT 1
         FROM purchase_settlement_windows next_window
         WHERE next_window.tenant_id=?1
           AND next_window.queue_key=?2
           AND next_window.window_sequence=(
             SELECT MIN(candidate.window_sequence)
             FROM purchase_settlement_windows candidate
             WHERE candidate.tenant_id=?1
               AND candidate.queue_key=?2
               AND candidate.window_sequence>?3
           )
           AND (
             EXISTS (SELECT 1 FROM purchase_window_obligation_entries obligation
                     WHERE obligation.tenant_id=next_window.tenant_id
                       AND obligation.window_id=next_window.window_id)
             OR EXISTS (SELECT 1 FROM purchase_receipt_allocation_entries allocation
                        WHERE allocation.tenant_id=next_window.tenant_id
                          AND allocation.window_id=next_window.window_id)
             OR EXISTS (SELECT 1 FROM purchase_unapplied_receipt_entries unapplied
                        WHERE unapplied.tenant_id=next_window.tenant_id
                          AND unapplied.window_id=next_window.window_id)
             OR EXISTS (SELECT 1 FROM purchase_settlement_entries settlement
                        WHERE settlement.tenant_id=next_window.tenant_id
                          AND settlement.window_id=next_window.window_id)
           )
       ) AS next_window_has_activity`,
    ).bind(tenantId, queueKey, state.window_sequence).first<{ next_window_has_activity: number }>();
    return {
      ...state,
      next_window_has_activity: Number(row?.next_window_has_activity ?? 0) === 1,
    };
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
