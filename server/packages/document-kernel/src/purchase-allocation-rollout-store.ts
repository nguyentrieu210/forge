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

  /**
   * Job Card completion is capped per operation, not across the entire Work Order.
   *
   * A 10-door order legitimately has 10 units cut and the same 10 units painted. The
   * older reader summed both operations into one 20/10 bucket and rejected the second
   * stage. Keep this indexed D1 query next to the production store so controllers do not
   * fall back to a bounded whole-DocType scan once a tenant has thousands of Job Cards.
   */
  async getJobCardOperationCompletedQuantityMicros(
    tenantId: string,
    workOrder: string,
    operation: string,
    excludeName?: string,
  ): Promise<number> {
    const row = await this.rolloutReader.prepare(
      `SELECT COALESCE(SUM(CAST(json_extract(payload_json,'$.completed_qty_micros') AS INTEGER)),0) AS total
       FROM documents
       WHERE tenant_id=?1 AND doctype='Job Card' AND docstatus=1
         AND json_extract(payload_json,'$.work_order')=?2
         AND json_extract(payload_json,'$.operation')=?3
         AND (?4 IS NULL OR name<>?4)`,
    ).bind(tenantId, workOrder, operation, excludeName ?? null).first<{ total: number }>();
    return Number(row?.total ?? 0);
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

  async getJobCardOperationCompletedQuantityMicros(
    tenantId: string,
    workOrder: string,
    operation: string,
    excludeName?: string,
  ): Promise<number> {
    const documents = await this.listDocumentsByDoctype(tenantId, "Job Card");
    return documents
      .filter((document) => document.docstatus === 1
        && document.data.work_order === workOrder
        && document.data.operation === operation
        && (!excludeName || document.name !== excludeName))
      .reduce((total, document) => total + (
        typeof document.data.completed_qty_micros === "number" ? document.data.completed_qty_micros : 0
      ), 0);
  }
}
