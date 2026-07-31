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
  PurchaseAllocationOverrideSourceState,
  PurchaseAllocationQueueState,
  PurchaseAllocationWindowTotals,
  PurchaseObligationRowState,
  PurchaseReceiptAllocationSourceState,
  PurchaseSettlementWindowState,
  PurchaseUnappliedQueueSourceState,
  PurchaseUnappliedSourceState,
} from "./purchase-allocation-reader.js";

interface StoredQueue extends PurchaseObligationQueueSeed {
  tenant_id: string;
}

interface StoredWindow extends PurchaseSettlementWindowSeed {
  tenant_id: string;
}

/** Test adapter mirroring allocation tables and revision semantics used by D1. */
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
    const effectivePlan = materializeVoucherIdentity(plan);

    for (const seed of effectivePlan.purchase_queue_seeds ?? []) {
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
    for (const seed of effectivePlan.purchase_window_seeds ?? []) {
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

    for (const claim of effectivePlan.purchase_revision_claims ?? []) {
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

    this.assertAllocationPlan(tenantId, effectivePlan, windows);
    const receipt = await super.execute(effectivePlan);

    this.purchaseQueues.clear();
    for (const [key, value] of queues) this.purchaseQueues.set(key, value);
    this.purchaseWindows.clear();
    for (const [key, value] of windows) this.purchaseWindows.set(key, value);
    this.purchaseObligations.push(...structuredClone(effectivePlan.purchase_obligation_entries ?? []));
    this.purchaseAllocations.push(...structuredClone(effectivePlan.purchase_allocation_entries ?? []));
    this.purchaseUnapplied.push(...structuredClone(effectivePlan.purchase_unapplied_entries ?? []));
    this.purchaseSettlements.push(...structuredClone(effectivePlan.purchase_settlement_entries ?? []));

    for (const settlement of effectivePlan.purchase_settlement_entries ?? []) {
      const key = windowMapKey(tenantId, settlement.window_id);
      const window = this.purchaseWindows.get(key);
      if (!window) continue;
      if (settlement.entry_kind === "close") {
        this.purchaseWindows.set(key, {
          ...window,
          status: "Settled",
          settled_at: settlement.committed_at,
          settled_by: effectivePlan.command.actor.user_id,
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
      .filter((source) => source.voucher_no === purchaseReceipt
        && source.entry_kind !== "reverse" && source.qty_micros > 0)
      .map((source) => {
        const reversals = this.purchaseAllocations.filter((entry) => entry.reversal_of_entry_id === source.entry_id);
        const queue = this.purchaseQueues.get(queueMapKey(tenantId, source.queue_key));
        const window = this.purchaseWindows.get(windowMapKey(tenantId, source.window_id));
        return {
          source,
          net: source.qty_micros + reversals.reduce((sum, entry) => sum + entry.qty_micros, 0),
          reversals,
          queue,
          window,
        };
      })
      .filter(({ net, queue, window }) => net > 0 && Boolean(queue && window))
      .map(({ source, net, reversals, queue, window }) => ({
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
          + reversals.reduce((sum, entry) => sum + entry.barem_weight_micros, 0),
        ...(source.projected_actual_weight_micros === undefined ? {} : {
          projected_actual_weight_micros: source.projected_actual_weight_micros
            + reversals.reduce((sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0),
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
      .filter((source) => source.entry_kind === "receive" && source.voucher_no === purchaseReceipt)
      .map((source) => {
        const movements = this.purchaseUnapplied.filter((entry) => entry.source_entry_id === source.entry_id);
        const queue = this.purchaseQueues.get(queueMapKey(tenantId, source.queue_key));
        const window = this.purchaseWindows.get(windowMapKey(tenantId, source.window_id));
        return {
          source,
          movements,
          net: source.qty_micros + movements.reduce((sum, entry) => sum + entry.qty_micros, 0),
          barem: (source.barem_weight_micros ?? 0)
            + movements.reduce((sum, entry) => sum + (entry.barem_weight_micros ?? 0), 0),
          actual: source.projected_actual_weight_micros === undefined
            ? undefined
            : source.projected_actual_weight_micros
              + movements.reduce((sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0),
          queue,
          window,
        };
      })
      .filter(({ net, queue, window }) => net > 0 && Boolean(queue && window))
      .map(({ source, net, barem, actual, queue, window }) => ({
        entry_id: source.entry_id,
        queue_key: source.queue_key,
        queue_revision: queue!.revision,
        window_id: source.window_id,
        window_revision: window!.revision,
        window_status: window!.status,
        receipt_item_row_id: source.receipt_item_row_id,
        qty_micros: net,
        barem_weight_micros: barem,
        ...(actual === undefined ? {} : { projected_actual_weight_micros: actual }),
        ...(source.projection_version === undefined ? {} : { projection_version: source.projection_version }),
        posting_at: source.posting_at,
      }));
  }

  async listPurchaseUnappliedQueueSources(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<PurchaseUnappliedQueueSourceState[]> {
    const rows: PurchaseUnappliedQueueSourceState[] = [];
    for (const source of this.purchaseUnapplied) {
      if (source.entry_kind !== "receive" || source.queue_key !== queueKey || source.window_id !== windowId) continue;
      const movements = this.purchaseUnapplied.filter((entry) => entry.source_entry_id === source.entry_id);
      const qty = source.qty_micros + movements.reduce((sum, entry) => sum + entry.qty_micros, 0);
      if (qty <= 0) continue;
      const barem = (source.barem_weight_micros ?? 0)
        + movements.reduce((sum, entry) => sum + (entry.barem_weight_micros ?? 0), 0);
      const actual = source.projected_actual_weight_micros === undefined
        ? undefined
        : source.projected_actual_weight_micros
          + movements.reduce((sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0);
      const voucherNo = source.voucher_no!;
      const document = await this.getDocument(tenantId, "Purchase Receipt", voucherNo);
      const nextSequence = this.purchaseAllocations
        .filter((entry) => entry.voucher_no === voucherNo)
        .reduce((maximum, entry) => Math.max(maximum, entry.allocation_sequence), 0) + 1;
      rows.push({
        entry_id: source.entry_id,
        queue_key: source.queue_key,
        window_id: source.window_id,
        voucher_no: voucherNo,
        voucher_revision: source.voucher_revision!,
        receipt_item_row_id: source.receipt_item_row_id,
        item_code: itemCodeForRow(document?.data, source.receipt_item_row_id),
        qty_micros: qty,
        barem_weight_micros: barem,
        ...(actual === undefined ? {} : { projected_actual_weight_micros: actual }),
        ...(source.projection_version === undefined ? {} : { projection_version: source.projection_version }),
        posting_at: source.posting_at,
        committed_at: source.committed_at,
        next_allocation_sequence: nextSequence,
      });
    }
    return rows.sort((left, right) => left.committed_at.localeCompare(right.committed_at)
      || left.entry_id.localeCompare(right.entry_id));
  }


  async getPurchaseSettlementWindowState(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<PurchaseSettlementWindowState | null> {
    const queue = this.purchaseQueues.get(queueMapKey(tenantId, queueKey));
    const window = this.purchaseWindows.get(windowMapKey(tenantId, windowId));
    if (!queue || !window || window.queue_key !== queueKey) return null;
    const totals = await this.getPurchaseAllocationWindowTotals(tenantId, windowId);
    const close = this.purchaseSettlements.find((entry) =>
      entry.queue_key === queueKey && entry.window_id === windowId && entry.entry_kind === "close");
    return {
      queue_key: queueKey,
      queue_revision: queue.revision,
      window_id: windowId,
      window_revision: window.revision,
      window_sequence: window.window_sequence,
      window_status: window.status,
      tolerance_bps: window.tolerance_bps,
      nominal_qty_micros: totals.nominal_qty_micros,
      received_qty_micros: totals.received_qty_micros,
      ...(close ? {
        close_entry_id: close.entry_id,
        close_committed_at: close.committed_at,
        close_reason: close.reason,
        minimum_qty_micros: close.minimum_qty_micros,
        maximum_qty_micros: close.maximum_qty_micros,
        shortage_variance_micros: close.shortage_variance_micros,
        overage_variance_micros: close.overage_variance_micros,
      } : {}),
    };
  }

  async getPurchaseAllocationOverrideSource(
    tenantId: string,
    entryId: string,
  ): Promise<PurchaseAllocationOverrideSourceState | null> {
    const source = this.purchaseAllocations.find((entry) => entry.entry_id === entryId && entry.qty_micros > 0);
    if (!source || !source.voucher_no || source.voucher_revision === undefined
      || !source.receipt_item_row_id || !source.purchase_order_item_row_id) return null;
    const queue = this.purchaseQueues.get(queueMapKey(tenantId, source.queue_key));
    const window = this.purchaseWindows.get(windowMapKey(tenantId, source.window_id));
    if (!queue || !window) return null;
    const reversals = this.purchaseAllocations.filter((entry) =>
      entry.entry_kind === "reverse" && entry.reversal_of_entry_id === source.entry_id);
    const qty = source.qty_micros + reversals.reduce((sum, entry) => sum + entry.qty_micros, 0);
    if (qty <= 0) return null;
    const barem = source.barem_weight_micros
      + reversals.reduce((sum, entry) => sum + entry.barem_weight_micros, 0);
    const actual = source.projected_actual_weight_micros === undefined
      ? undefined
      : source.projected_actual_weight_micros
        + reversals.reduce((sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0);
    const nextSequence = this.purchaseAllocations
      .filter((entry) => entry.voucher_no === source.voucher_no)
      .reduce((maximum, entry) => Math.max(maximum, entry.allocation_sequence), 0) + 1;
    return {
      entry_id: source.entry_id,
      queue_key: source.queue_key,
      queue_revision: queue.revision,
      window_id: source.window_id,
      window_revision: window.revision,
      window_status: window.status,
      voucher_no: source.voucher_no,
      voucher_revision: source.voucher_revision,
      receipt_item_row_id: source.receipt_item_row_id,
      purchase_order: source.purchase_order,
      purchase_order_item_row_id: source.purchase_order_item_row_id,
      qty_micros: qty,
      barem_weight_micros: barem,
      ...(actual === undefined ? {} : { projected_actual_weight_micros: actual }),
      ...(source.projection_version === undefined ? {} : { projection_version: source.projection_version }),
      posting_at: source.posting_at,
      next_allocation_sequence: nextSequence,
    };
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
      const windowAcceptsEntry = window?.status === "Open"
        || (window?.status === "Reversed" && entry.entry_kind === "reverse");
      if (!windowAcceptsEntry) throw errors.lifecycle("Purchase allocation window is not open");
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
    for (const entry of plan.purchase_unapplied_entries ?? []) {
      const window = windows.get(windowMapKey(tenantId, entry.window_id));
      const windowAcceptsEntry = window?.status === "Open"
        || (window?.status === "Reversed" && entry.entry_kind === "reverse");
      if (!windowAcceptsEntry) throw errors.lifecycle("Purchase allocation window is not open");
    }
  }
}

function materializeVoucherIdentity<T extends JsonObject>(plan: MutationPlan<T>): MutationPlan<T> {
  const fallbackNo = plan.command.aggregate.name;
  const fallbackRevision = plan.document.version;
  return {
    ...plan,
    ...(plan.procurement_entries === undefined ? {} : {
      procurement_entries: plan.procurement_entries.map((line) => ({
        ...line,
        voucher_type: line.voucher_type ?? plan.command.aggregate.doctype,
        ...resolveVoucherIdentity(line, fallbackNo, fallbackRevision),
      })),
    }),
    ...(plan.purchase_allocation_entries === undefined ? {} : {
      purchase_allocation_entries: plan.purchase_allocation_entries.map((line) => ({
        ...line,
        ...resolveVoucherIdentity(line, fallbackNo, fallbackRevision),
      })),
    }),
    ...(plan.purchase_unapplied_entries === undefined ? {} : {
      purchase_unapplied_entries: plan.purchase_unapplied_entries.map((line) => ({
        ...line,
        ...resolveVoucherIdentity(line, fallbackNo, fallbackRevision),
      })),
    }),
  };
}

function resolveVoucherIdentity(
  line: { voucher_no?: string; voucher_revision?: number },
  fallbackNo: string,
  fallbackRevision: number,
): { voucher_no: string; voucher_revision: number } {
  const hasNo = line.voucher_no !== undefined;
  const hasRevision = line.voucher_revision !== undefined;
  if (hasNo !== hasRevision) {
    throw errors.validation("Purchase source voucher_no and voucher_revision must be supplied together");
  }
  const voucherNo = line.voucher_no ?? fallbackNo;
  const voucherRevision = line.voucher_revision ?? fallbackRevision;
  if (!voucherNo.trim()) throw errors.validation("Purchase source voucher_no is required");
  if (!Number.isSafeInteger(voucherRevision) || voucherRevision <= 0) {
    throw errors.validation("Purchase source voucher_revision must be a positive safe integer");
  }
  return { voucher_no: voucherNo, voucher_revision: voucherRevision };
}

function itemCodeForRow(data: JsonObject | undefined, rowId: string): string {
  const rows = data?.items;
  if (!Array.isArray(rows)) return "";
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as JsonObject;
    if (row.row_id === rowId && typeof row.item_code === "string") return row.item_code;
  }
  return "";
}

function queueMapKey(tenantId: string, queueKey: string): string {
  return `${tenantId}:${queueKey}`;
}

function windowMapKey(tenantId: string, windowId: string): string {
  return `${tenantId}:${windowId}`;
}
