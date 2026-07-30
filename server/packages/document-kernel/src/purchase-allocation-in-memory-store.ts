import type {
  JsonObject,
  MutationPlan,
  MutationReceipt,
  MutationSnapshot,
} from "../../contracts/src/index.js";
import type {
  PurchaseObligationQueueSeed,
  PurchaseReceiptAllocationEntry,
  PurchaseSettlementEntry,
  PurchaseSettlementWindowSeed,
  PurchaseUnappliedReceiptEntry,
  PurchaseWindowObligationEntry,
} from "../../contracts/src/purchase-allocation.js";
import { errors } from "../../core/src/index.js";
import { InMemoryMutationStore } from "./in-memory-store.js";
import type {
  PurchaseAllocationObligationState,
  PurchaseAllocationQueueState,
  PurchaseAllocationWindowTotals,
  PurchaseObligationRowState,
  PurchaseReceiptAllocationSourceState,
  PurchaseUnappliedSourceState,
} from "./purchase-allocation-reader.js";

interface StoredQueue extends PurchaseObligationQueueSeed {
  tenant_id: string;
}

interface StoredWindow extends PurchaseSettlementWindowSeed {
  tenant_id: string;
}

/**
 * Test adapter mirroring the allocation tables and revision semantics used by D1.
 * It lets controller/kernel tests run the same queue reads used by production.
 */
export class InMemoryPurchaseAllocationMutationStore extends InMemoryMutationStore {
  private readonly purchaseQueues = new Map<string, StoredQueue>();
  private readonly purchaseWindows = new Map<string, StoredWindow>();
  private readonly purchaseObligations: PurchaseWindowObligationEntry[] = [];
  private readonly purchaseAllocations: PurchaseReceiptAllocationEntry[] = [];
  private readonly purchaseUnapplied: PurchaseUnappliedReceiptEntry[] = [];
  private readonly purchaseSettlements: PurchaseSettlementEntry[] = [];

  override async execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt> {
    const tenantId = plan.command.tenant_id;
    const queues = new Map(this.purchaseQueues);
    const windows = new Map(this.purchaseWindows);

    for (const seed of plan.purchase_queue_seeds ?? []) {
      const key = queueMapKey(tenantId, seed.queue_key);
      const existing = queues.get(key);
      if (existing) {
        if (existing.company !== seed.company
          || existing.supplier !== seed.supplier
          || existing.material_match_key !== seed.material_match_key) {
          throw errors.reference("Purchase allocation queue identity conflict");
        }
      } else {
        queues.set(key, { tenant_id: tenantId, ...structuredClone(seed) });
      }
    }
    for (const seed of plan.purchase_window_seeds ?? []) {
      const key = windowMapKey(tenantId, seed.window_id);
      if (!queues.has(queueMapKey(tenantId, seed.queue_key))) {
        throw errors.reference("Purchase settlement window references a missing queue");
      }
      const openConflict = [...windows.values()].some((window) =>
        window.tenant_id === tenantId
        && window.queue_key === seed.queue_key
        && window.status === "Open"
        && window.window_id !== seed.window_id);
      if (openConflict) throw errors.lifecycle("Purchase allocation queue already has an open window");
      if (!windows.has(key)) windows.set(key, { tenant_id: tenantId, ...structuredClone(seed) });
    }

    for (const claim of plan.purchase_revision_claims ?? []) {
      if (claim.scope_type === "queue") {
        const key = queueMapKey(tenantId, claim.scope_key);
        const row = queues.get(key);
        if (!row || row.revision !== claim.expected_revision) throw errors.purchaseAllocationConflict();
        queues.set(key, { ...row, revision: row.revision + 1, modified_at: claim.claimed_at });
      } else {
        const key = windowMapKey(tenantId, claim.scope_key);
        const row = windows.get(key);
        if (!row || row.revision !== claim.expected_revision) throw errors.purchaseAllocationConflict();
        windows.set(key, { ...row, revision: row.revision + 1 });
      }
    }

    this.assertAllocationPlan(tenantId, plan, windows);
    const receipt = await super.execute(plan);

    this.purchaseQueues.clear();
    for (const [key, value] of queues) this.purchaseQueues.set(key, value);
    this.purchaseWindows.clear();
    for (const [key, value] of windows) this.purchaseWindows.set(key, value);
    this.purchaseObligations.push(...structuredClone(plan.purchase_obligation_entries ?? []));
    this.purchaseAllocations.push(...structuredClone(plan.purchase_allocation_entries ?? []));
    this.purchaseUnapplied.push(...structuredClone(plan.purchase_unapplied_entries ?? []));
    this.purchaseSettlements.push(...structuredClone(plan.purchase_settlement_entries ?? []));

    for (const settlement of plan.purchase_settlement_entries ?? []) {
      const key = windowMapKey(tenantId, settlement.window_id);
      const window = this.purchaseWindows.get(key);
      if (!window) continue;
      if (settlement.entry_kind === "close") {
        this.purchaseWindows.set(key, {
          ...window,
          status: "Settled",
          settled_at: settlement.committed_at,
          settled_by: plan.command.actor.user_id,
          settlement_reason: settlement.reason,
        });
      } else {
        this.purchaseWindows.set(key, { ...window, status: "Reversed" });
      }
    }
    return receipt;
  }

  async getPurchaseAllocationQueueState(
    tenantId: string,
    company: string,
    supplier: string,
    materialMatchKey: string,
  ): Promise<PurchaseAllocationQueueState | null> {
    const queue = [...this.purchaseQueues.values()].find((row) =>
      row.tenant_id === tenantId
      && row.company === company
      && row.supplier === supplier
      && row.material_match_key === materialMatchKey);
    if (!queue) return null;
    const windows = [...this.purchaseWindows.values()]
      .filter((row) => row.tenant_id === tenantId && row.queue_key === queue.queue_key)
      .sort((left, right) => left.window_sequence - right.window_sequence);
    const open = windows.find((row) => row.status === "Open");
    return {
      queue_key: queue.queue_key,
      revision: queue.revision,
      next_window_sequence: (windows.at(-1)?.window_sequence ?? 0) + 1,
      ...(open ? {
        open_window: {
          window_id: open.window_id,
          window_sequence: open.window_sequence,
          tolerance_bps: open.tolerance_bps,
          revision: open.revision,
        },
      } : {}),
    };
  }

  async listPurchaseAllocationObligations(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<PurchaseAllocationObligationState[]> {
    const grouped = new Map<string, PurchaseAllocationObligationState>();
    for (const entry of this.purchaseObligations) {
      if (entry.queue_key !== queueKey || entry.window_id !== windowId || !entry.purchase_order_item_row_id) continue;
      const key = `${entry.purchase_order}\u0000${entry.purchase_order_item_row_id}`;
      const row = grouped.get(key) ?? {
        queue_key: entry.queue_key,
        window_id: entry.window_id,
        purchase_order: entry.purchase_order,
        purchase_order_item_row_id: entry.purchase_order_item_row_id,
        remaining_qty_micros: 0,
        transaction_date: entry.transaction_date,
        purchase_order_created_at: entry.purchase_order_created_at,
        item_idx: entry.item_idx,
      };
      row.remaining_qty_micros += entry.qty_micros;
      grouped.set(key, row);
    }
    for (const entry of this.purchaseAllocations) {
      if (entry.queue_key !== queueKey || entry.window_id !== windowId || !entry.purchase_order_item_row_id) continue;
      const row = grouped.get(`${entry.purchase_order}\u0000${entry.purchase_order_item_row_id}`);
      if (row) row.remaining_qty_micros -= entry.qty_micros;
    }
    return [...grouped.values()]
      .filter((row) => row.remaining_qty_micros > 0)
      .sort((left, right) => left.transaction_date.localeCompare(right.transaction_date)
        || left.purchase_order_created_at.localeCompare(right.purchase_order_created_at)
        || left.purchase_order.localeCompare(right.purchase_order)
        || left.item_idx - right.item_idx
        || left.purchase_order_item_row_id.localeCompare(right.purchase_order_item_row_id))
      .map((row) => structuredClone(row));
  }

  async getPurchaseAllocationWindowTotals(
    tenantId: string,
    windowId: string,
  ): Promise<PurchaseAllocationWindowTotals> {
    return {
      nominal_qty_micros: this.purchaseObligations
        .filter((entry) => entry.window_id === windowId)
        .reduce((sum, entry) => sum + entry.qty_micros, 0),
      received_qty_micros: this.purchaseAllocations
        .filter((entry) => entry.window_id === windowId)
        .reduce((sum, entry) => sum + entry.qty_micros, 0)
        + this.purchaseUnapplied
          .filter((entry) => entry.window_id === windowId)
          .reduce((sum, entry) => sum + entry.qty_micros, 0),
    };
  }

  async getPurchaseObligationRowState(
    tenantId: string,
    purchaseOrder: string,
    purchaseOrderItemRowId: string,
  ): Promise<PurchaseObligationRowState | null> {
    const entries = this.purchaseObligations.filter((entry) =>
      entry.purchase_order === purchaseOrder
      && entry.purchase_order_item_row_id === purchaseOrderItemRowId);
    if (!entries.length) return null;
    const latest = entries.at(-1)!;
    const queue = this.purchaseQueues.get(queueMapKey(tenantId, latest.queue_key));
    const window = this.purchaseWindows.get(windowMapKey(tenantId, latest.window_id));
    if (!queue || !window) return null;
    const nominal = entries.reduce((sum, entry) => sum + entry.qty_micros, 0);
    const allocated = this.purchaseAllocations
      .filter((entry) => entry.purchase_order === purchaseOrder
        && entry.purchase_order_item_row_id === purchaseOrderItemRowId)
      .reduce((sum, entry) => sum + entry.qty_micros, 0);
    return {
      queue_key: latest.queue_key,
      queue_revision: queue.revision,
      window_id: latest.window_id,
      window_revision: window.revision,
      window_status: window.status,
      nominal_qty_micros: nominal,
      allocated_qty_micros: allocated,
      remaining_qty_micros: nominal - allocated,
    };
  }

  async listPurchaseReceiptAllocationSources(
    tenantId: string,
    purchaseReceipt: string,
  ): Promise<PurchaseReceiptAllocationSourceState[]> {
    return this.purchaseAllocations
      .filter((source) => source.entry_kind !== "reverse" && source.qty_micros > 0)
      .map((source) => {
        const reversed = this.purchaseAllocations
          .filter((entry) => entry.reversal_of_entry_id === source.entry_id)
          .reduce((sum, entry) => sum + entry.qty_micros, 0);
        const queue = this.purchaseQueues.get(queueMapKey(tenantId, source.queue_key));
        const window = this.purchaseWindows.get(windowMapKey(tenantId, source.window_id));
        return { source, net: source.qty_micros + reversed, queue, window };
      })
      .filter(({ source, net, queue, window }) =>
        source.entry_id.includes("") && net > 0 && Boolean(queue && window))
      .filter(({ source }) => source.line_key.length > 0)
      .filter(({ source }) => {
        const allocationReceipt = source.entry_id.split(":")[1] ?? "";
        return allocationReceipt === purchaseReceipt || source.entry_id.includes(purchaseReceipt);
      })
      .map(({ source, net, queue, window }) => ({
        entry_id: source.entry_id,
        queue_key: source.queue_key,
        queue_revision: queue!.revision,
        window_id: source.window_id,
        window_revision: window!.revision,
        window_status: window!.status,
        receipt_item_row_id: source.receipt_item_row_id!,
        purchase_order: source.purchase_order,
        purchase_order_item_row_id: source.purchase_order_item_row_id!,
        qty_micros: net,
        barem_weight_micros: source.barem_weight_micros
          + this.purchaseAllocations
            .filter((entry) => entry.reversal_of_entry_id === source.entry_id)
            .reduce((sum, entry) => sum + entry.barem_weight_micros, 0),
        ...(source.projected_actual_weight_micros === undefined ? {} : {
          projected_actual_weight_micros: source.projected_actual_weight_micros
            + this.purchaseAllocations
              .filter((entry) => entry.reversal_of_entry_id === source.entry_id)
              .reduce((sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0),
        }),
        ...(source.projection_version === undefined ? {} : { projection_version: source.projection_version }),
        allocation_sequence: source.allocation_sequence,
        posting_at: source.posting_at,
      }));
  }

  async listPurchaseReceiptUnappliedSources(
    tenantId: string,
    purchaseReceipt: string,
  ): Promise<PurchaseUnappliedSourceState[]> {
    return this.purchaseUnapplied
      .filter((source) => source.entry_kind === "receive" && source.entry_id.includes(purchaseReceipt))
      .map((source) => {
        const movement = this.purchaseUnapplied
          .filter((entry) => entry.source_entry_id === source.entry_id)
          .reduce((sum, entry) => sum + entry.qty_micros, 0);
        const queue = this.purchaseQueues.get(queueMapKey(tenantId, source.queue_key));
        const window = this.purchaseWindows.get(windowMapKey(tenantId, source.window_id));
        return { source, net: source.qty_micros + movement, queue, window };
      })
      .filter(({ net, queue, window }) => net > 0 && Boolean(queue && window))
      .map(({ source, net, queue, window }) => ({
        entry_id: source.entry_id,
        queue_key: source.queue_key,
        queue_revision: queue!.revision,
        window_id: source.window_id,
        window_revision: window!.revision,
        window_status: window!.status,
        receipt_item_row_id: source.receipt_item_row_id,
        qty_micros: net,
        posting_at: source.posting_at,
      }));
  }

  override snapshot(): MutationSnapshot {
    return {
      ...super.snapshot(),
      purchase_obligation_entries: structuredClone(this.purchaseObligations),
      purchase_allocation_entries: structuredClone(this.purchaseAllocations),
      purchase_unapplied_entries: structuredClone(this.purchaseUnapplied),
      purchase_settlement_entries: structuredClone(this.purchaseSettlements),
    };
  }

  private assertAllocationPlan<T extends JsonObject>(
    tenantId: string,
    plan: MutationPlan<T>,
    windows: Map<string, StoredWindow>,
  ): void {
    for (const entry of plan.purchase_obligation_entries ?? []) {
      const window = windows.get(windowMapKey(tenantId, entry.window_id));
      if (!window || window.status !== "Open") throw errors.lifecycle("Purchase allocation window is not open");
      if (entry.source === "live" && !entry.purchase_order_item_row_id) {
        throw errors.reference("Live purchase obligation requires a PO row id");
      }
    }
    for (const entry of plan.purchase_allocation_entries ?? []) {
      const window = windows.get(windowMapKey(tenantId, entry.window_id));
      if (!window || window.status !== "Open") throw errors.lifecycle("Purchase allocation window is not open");
      if (entry.source === "live" && (!entry.receipt_item_row_id || !entry.purchase_order_item_row_id)) {
        throw errors.reference("Live purchase allocation requires Receipt and PO row ids");
      }
      const current = this.purchaseAllocations
        .filter((row) => row.purchase_order === entry.purchase_order
          && row.purchase_order_item_row_id === entry.purchase_order_item_row_id)
        .reduce((sum, row) => sum + row.qty_micros, 0);
      const incoming = (plan.purchase_allocation_entries ?? [])
        .filter((row) => row !== entry
          && row.purchase_order === entry.purchase_order
          && row.purchase_order_item_row_id === entry.purchase_order_item_row_id)
        .reduce((sum, row) => sum + row.qty_micros, entry.qty_micros);
      const nominal = this.purchaseObligations
        .filter((row) => row.purchase_order === entry.purchase_order
          && row.purchase_order_item_row_id === entry.purchase_order_item_row_id)
        .reduce((sum, row) => sum + row.qty_micros, 0)
        + (plan.purchase_obligation_entries ?? [])
          .filter((row) => row.purchase_order === entry.purchase_order
            && row.purchase_order_item_row_id === entry.purchase_order_item_row_id)
          .reduce((sum, row) => sum + row.qty_micros, 0);
      if (current + incoming < 0 || current + incoming > nominal) {
        throw errors.reference("Purchase allocation quantity is outside the PO obligation");
      }
    }
  }
}

function queueMapKey(tenantId: string, queueKey: string): string {
  return `${tenantId}:${queueKey}`;
}

function windowMapKey(tenantId: string, windowId: string): string {
  return `${tenantId}:${windowId}`;
}
