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
import { D1PurchaseAllocationMutationStore } from "./purchase-allocation-d1-store.js";

interface QueueRow {
  queue_key: string;
  queue_revision: number;
  window_id: string | null;
  window_sequence: number | null;
  tolerance_bps: number | null;
  window_revision: number | null;
  next_window_sequence: number;
}

/** Allocation-aware command store plus the read projections required by PO/Receipt controllers. */
export class D1PurchaseAllocationDomainStore extends D1PurchaseAllocationMutationStore {
  private readonly allocationReader: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    super(db);
    this.allocationReader = db.withSession?.("first-primary") ?? db;
  }

  async getPurchaseAllocationQueueState(
    tenantId: string,
    company: string,
    supplier: string,
    materialMatchKey: string,
  ): Promise<PurchaseAllocationQueueState | null> {
    const row = await this.allocationReader.prepare(
      `SELECT q.queue_key, q.revision AS queue_revision,
              w.window_id, w.window_sequence, w.tolerance_bps, w.revision AS window_revision,
              (SELECT COALESCE(MAX(all_w.window_sequence),0)+1
               FROM purchase_settlement_windows all_w
               WHERE all_w.tenant_id=q.tenant_id AND all_w.queue_key=q.queue_key) AS next_window_sequence
       FROM purchase_obligation_queues q
       LEFT JOIN purchase_settlement_windows w
         ON w.tenant_id=q.tenant_id AND w.queue_key=q.queue_key AND w.status='Open'
       WHERE q.tenant_id=?1 AND q.company=?2 AND q.supplier=?3 AND q.material_match_key=?4
       ORDER BY w.window_sequence DESC LIMIT 1`,
    ).bind(tenantId, company, supplier, materialMatchKey).first<QueueRow>();
    if (!row) return null;
    return {
      queue_key: String(row.queue_key),
      revision: Number(row.queue_revision),
      next_window_sequence: Number(row.next_window_sequence),
      ...(row.window_id && row.window_sequence != null && row.tolerance_bps != null && row.window_revision != null
        ? {
            open_window: {
              window_id: String(row.window_id),
              window_sequence: Number(row.window_sequence),
              tolerance_bps: Number(row.tolerance_bps),
              revision: Number(row.window_revision),
            },
          }
        : {}),
    };
  }

  async listPurchaseAllocationObligations(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<PurchaseAllocationObligationState[]> {
    const result = await this.allocationReader.prepare(
      `SELECT balance.queue_key, balance.window_id, balance.purchase_order,
              balance.purchase_order_item_row_id, balance.remaining_qty_micros,
              (SELECT source.transaction_date
               FROM purchase_window_obligation_entries source
               WHERE source.tenant_id=balance.tenant_id
                 AND source.purchase_order=balance.purchase_order
                 AND source.purchase_order_item_row_id IS balance.purchase_order_item_row_id
                 AND source.qty_micros>0 AND source.resolution='resolved'
               ORDER BY source.committed_at, source.entry_id LIMIT 1) AS transaction_date,
              (SELECT source.purchase_order_created_at
               FROM purchase_window_obligation_entries source
               WHERE source.tenant_id=balance.tenant_id
                 AND source.purchase_order=balance.purchase_order
                 AND source.purchase_order_item_row_id IS balance.purchase_order_item_row_id
                 AND source.qty_micros>0 AND source.resolution='resolved'
               ORDER BY source.committed_at, source.entry_id LIMIT 1) AS purchase_order_created_at,
              (SELECT source.item_idx
               FROM purchase_window_obligation_entries source
               WHERE source.tenant_id=balance.tenant_id
                 AND source.purchase_order=balance.purchase_order
                 AND source.purchase_order_item_row_id IS balance.purchase_order_item_row_id
                 AND source.qty_micros>0 AND source.resolution='resolved'
               ORDER BY source.committed_at, source.entry_id LIMIT 1) AS item_idx
       FROM purchase_obligation_balances balance
       WHERE balance.tenant_id=?1 AND balance.queue_key=?2 AND balance.window_id=?3
         AND balance.purchase_order_item_row_id IS NOT NULL
         AND balance.remaining_qty_micros>0`,
    ).bind(tenantId, queueKey, windowId).all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      queue_key: String(row.queue_key),
      window_id: String(row.window_id),
      purchase_order: String(row.purchase_order),
      purchase_order_item_row_id: String(row.purchase_order_item_row_id),
      remaining_qty_micros: Number(row.remaining_qty_micros),
      transaction_date: String(row.transaction_date),
      purchase_order_created_at: String(row.purchase_order_created_at),
      item_idx: Number(row.item_idx),
    }));
  }

  async getPurchaseAllocationWindowTotals(
    tenantId: string,
    windowId: string,
  ): Promise<PurchaseAllocationWindowTotals> {
    const nominal = await this.allocationReader.prepare(
      `SELECT COALESCE(SUM(qty_micros),0) AS total
       FROM purchase_window_obligation_entries
       WHERE tenant_id=?1 AND window_id=?2`,
    ).bind(tenantId, windowId).first<{ total: number }>();
    const received = await this.allocationReader.prepare(
      `SELECT
         COALESCE((SELECT SUM(qty_micros) FROM purchase_receipt_allocation_entries
                   WHERE tenant_id=?1 AND window_id=?2),0)
         + COALESCE((SELECT SUM(qty_micros) FROM purchase_unapplied_receipt_entries
                     WHERE tenant_id=?1 AND window_id=?2),0) AS total`,
    ).bind(tenantId, windowId).first<{ total: number }>();
    return {
      nominal_qty_micros: Number(nominal?.total ?? 0),
      received_qty_micros: Number(received?.total ?? 0),
    };
  }

  async getPurchaseObligationRowState(
    tenantId: string,
    purchaseOrder: string,
    purchaseOrderItemRowId: string,
  ): Promise<PurchaseObligationRowState | null> {
    const row = await this.allocationReader.prepare(
      `SELECT balance.queue_key, queue.revision AS queue_revision,
              balance.window_id, window.revision AS window_revision, window.status AS window_status,
              balance.nominal_qty_micros, balance.allocated_qty_micros, balance.remaining_qty_micros
       FROM purchase_obligation_balances balance
       JOIN purchase_obligation_queues queue
         ON queue.tenant_id=balance.tenant_id AND queue.queue_key=balance.queue_key
       JOIN purchase_settlement_windows window
         ON window.tenant_id=balance.tenant_id AND window.window_id=balance.window_id
       WHERE balance.tenant_id=?1 AND balance.purchase_order=?2
         AND balance.purchase_order_item_row_id=?3
       ORDER BY window.window_sequence DESC LIMIT 1`,
    ).bind(tenantId, purchaseOrder, purchaseOrderItemRowId).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      queue_key: String(row.queue_key),
      queue_revision: Number(row.queue_revision),
      window_id: String(row.window_id),
      window_revision: Number(row.window_revision),
      window_status: String(row.window_status) as PurchaseObligationRowState["window_status"],
      nominal_qty_micros: Number(row.nominal_qty_micros),
      allocated_qty_micros: Number(row.allocated_qty_micros),
      remaining_qty_micros: Number(row.remaining_qty_micros),
    };
  }

  async listPurchaseReceiptAllocationSources(
    tenantId: string,
    purchaseReceipt: string,
  ): Promise<PurchaseReceiptAllocationSourceState[]> {
    const result = await this.allocationReader.prepare(
      `SELECT source.entry_id, source.queue_key, queue.revision AS queue_revision,
              source.window_id, window.revision AS window_revision, window.status AS window_status,
              source.receipt_item_row_id, source.purchase_order, source.purchase_order_item_row_id,
              source.qty_micros + COALESCE(SUM(reversal.qty_micros),0) AS qty_micros,
              source.barem_weight_micros + COALESCE(SUM(reversal.barem_weight_micros),0) AS barem_weight_micros,
              CASE WHEN source.projected_actual_weight_micros IS NULL THEN NULL
                   ELSE source.projected_actual_weight_micros
                        + COALESCE(SUM(reversal.projected_actual_weight_micros),0) END AS projected_actual_weight_micros,
              source.projection_version, source.allocation_sequence, source.posting_at
       FROM purchase_receipt_allocation_entries source
       JOIN purchase_obligation_queues queue
         ON queue.tenant_id=source.tenant_id AND queue.queue_key=source.queue_key
       JOIN purchase_settlement_windows window
         ON window.tenant_id=source.tenant_id AND window.window_id=source.window_id
       LEFT JOIN purchase_receipt_allocation_entries reversal
         ON reversal.tenant_id=source.tenant_id
        AND reversal.reversal_of_entry_id=source.entry_id
        AND reversal.entry_kind='reverse'
       WHERE source.tenant_id=?1 AND source.voucher_no=?2
         AND source.entry_kind!='reverse' AND source.qty_micros>0
         AND source.resolution='resolved'
       GROUP BY source.tenant_id, source.entry_id
       HAVING source.qty_micros + COALESCE(SUM(reversal.qty_micros),0)>0
       ORDER BY source.allocation_sequence, source.entry_id`,
    ).bind(tenantId, purchaseReceipt).all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      entry_id: String(row.entry_id),
      queue_key: String(row.queue_key),
      queue_revision: Number(row.queue_revision),
      window_id: String(row.window_id),
      window_revision: Number(row.window_revision),
      window_status: String(row.window_status) as PurchaseReceiptAllocationSourceState["window_status"],
      receipt_item_row_id: String(row.receipt_item_row_id),
      purchase_order: String(row.purchase_order),
      purchase_order_item_row_id: String(row.purchase_order_item_row_id),
      qty_micros: Number(row.qty_micros),
      barem_weight_micros: Number(row.barem_weight_micros),
      ...(row.projected_actual_weight_micros == null
        ? {}
        : { projected_actual_weight_micros: Number(row.projected_actual_weight_micros) }),
      ...(row.projection_version == null ? {} : { projection_version: Number(row.projection_version) }),
      allocation_sequence: Number(row.allocation_sequence),
      posting_at: String(row.posting_at),
    }));
  }

  async listPurchaseReceiptUnappliedSources(
    tenantId: string,
    purchaseReceipt: string,
  ): Promise<PurchaseUnappliedSourceState[]> {
    const result = await this.allocationReader.prepare(
      `SELECT source.entry_id, source.queue_key, queue.revision AS queue_revision,
              source.window_id, window.revision AS window_revision, window.status AS window_status,
              source.receipt_item_row_id,
              source.qty_micros + COALESCE(SUM(movement.qty_micros),0) AS qty_micros,
              source.barem_weight_micros + COALESCE(SUM(movement.barem_weight_micros),0) AS barem_weight_micros,
              CASE WHEN source.projected_actual_weight_micros IS NULL THEN NULL
                   ELSE source.projected_actual_weight_micros
                     + COALESCE(SUM(movement.projected_actual_weight_micros),0) END AS projected_actual_weight_micros,
              source.projection_version, source.posting_at
       FROM purchase_unapplied_receipt_entries source
       JOIN purchase_obligation_queues queue
         ON queue.tenant_id=source.tenant_id AND queue.queue_key=source.queue_key
       JOIN purchase_settlement_windows window
         ON window.tenant_id=source.tenant_id AND window.window_id=source.window_id
       LEFT JOIN purchase_unapplied_receipt_entries movement
         ON movement.tenant_id=source.tenant_id AND movement.source_entry_id=source.entry_id
       WHERE source.tenant_id=?1 AND source.voucher_no=?2 AND source.entry_kind='receive'
       GROUP BY source.tenant_id, source.entry_id
       HAVING source.qty_micros + COALESCE(SUM(movement.qty_micros),0)>0
       ORDER BY source.committed_at, source.entry_id`,
    ).bind(tenantId, purchaseReceipt).all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      entry_id: String(row.entry_id),
      queue_key: String(row.queue_key),
      queue_revision: Number(row.queue_revision),
      window_id: String(row.window_id),
      window_revision: Number(row.window_revision),
      window_status: String(row.window_status) as PurchaseUnappliedSourceState["window_status"],
      receipt_item_row_id: String(row.receipt_item_row_id),
      qty_micros: Number(row.qty_micros),
      barem_weight_micros: Number(row.barem_weight_micros),
      ...(row.projected_actual_weight_micros == null
        ? {}
        : { projected_actual_weight_micros: Number(row.projected_actual_weight_micros) }),
      ...(row.projection_version == null ? {} : { projection_version: Number(row.projection_version) }),
      posting_at: String(row.posting_at),
    }));
  }

  async listPurchaseUnappliedQueueSources(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<PurchaseUnappliedQueueSourceState[]> {
    const result = await this.allocationReader.prepare(
      `SELECT source.entry_id, source.queue_key, source.window_id,
              source.voucher_no, source.voucher_revision, source.receipt_item_row_id,
              COALESCE(json_extract(child.payload_json,'$.item_code'),'') AS item_code,
              source.qty_micros + COALESCE(SUM(movement.qty_micros),0) AS qty_micros,
              source.barem_weight_micros + COALESCE(SUM(movement.barem_weight_micros),0) AS barem_weight_micros,
              CASE WHEN source.projected_actual_weight_micros IS NULL THEN NULL
                   ELSE source.projected_actual_weight_micros
                     + COALESCE(SUM(movement.projected_actual_weight_micros),0) END AS projected_actual_weight_micros,
              source.projection_version, source.posting_at, source.committed_at,
              COALESCE((SELECT MAX(allocation.allocation_sequence)
                        FROM purchase_receipt_allocation_entries allocation
                        WHERE allocation.tenant_id=source.tenant_id
                          AND allocation.voucher_no=source.voucher_no),0)+1 AS next_allocation_sequence
       FROM purchase_unapplied_receipt_entries source
       LEFT JOIN purchase_unapplied_receipt_entries movement
         ON movement.tenant_id=source.tenant_id AND movement.source_entry_id=source.entry_id
       LEFT JOIN document_children child
         ON child.tenant_id=source.tenant_id
        AND child.parent_key='Purchase Receipt:' || source.voucher_no
        AND child.fieldname='items' AND child.row_id=source.receipt_item_row_id
       WHERE source.tenant_id=?1 AND source.queue_key=?2 AND source.window_id=?3
         AND source.entry_kind='receive'
       GROUP BY source.tenant_id, source.entry_id
       HAVING source.qty_micros + COALESCE(SUM(movement.qty_micros),0)>0
       ORDER BY source.committed_at, source.entry_id`,
    ).bind(tenantId, queueKey, windowId).all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      entry_id: String(row.entry_id),
      queue_key: String(row.queue_key),
      window_id: String(row.window_id),
      voucher_no: String(row.voucher_no),
      voucher_revision: Number(row.voucher_revision),
      receipt_item_row_id: String(row.receipt_item_row_id),
      item_code: String(row.item_code),
      qty_micros: Number(row.qty_micros),
      barem_weight_micros: Number(row.barem_weight_micros),
      ...(row.projected_actual_weight_micros == null
        ? {}
        : { projected_actual_weight_micros: Number(row.projected_actual_weight_micros) }),
      ...(row.projection_version == null ? {} : { projection_version: Number(row.projection_version) }),
      posting_at: String(row.posting_at),
      committed_at: String(row.committed_at),
      next_allocation_sequence: Number(row.next_allocation_sequence),
    }));
  }

  async getPurchaseSettlementWindowState(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<PurchaseSettlementWindowState | null> {
    const row = await this.allocationReader.prepare(
      `SELECT queue.queue_key, queue.revision AS queue_revision,
              window.window_id, window.revision AS window_revision,
              window.window_sequence, window.status AS window_status, window.tolerance_bps,
              COALESCE((SELECT SUM(qty_micros) FROM purchase_window_obligation_entries obligation
                        WHERE obligation.tenant_id=window.tenant_id AND obligation.window_id=window.window_id),0)
                AS nominal_qty_micros,
              COALESCE((SELECT SUM(qty_micros) FROM purchase_receipt_allocation_entries allocation
                        WHERE allocation.tenant_id=window.tenant_id AND allocation.window_id=window.window_id),0)
                + COALESCE((SELECT SUM(qty_micros) FROM purchase_unapplied_receipt_entries unapplied
                            WHERE unapplied.tenant_id=window.tenant_id AND unapplied.window_id=window.window_id),0)
                AS received_qty_micros,
              close.entry_id AS close_entry_id, close.committed_at AS close_committed_at,
              close.reason AS close_reason, close.minimum_qty_micros, close.maximum_qty_micros,
              close.shortage_variance_micros, close.overage_variance_micros
       FROM purchase_settlement_windows window
       JOIN purchase_obligation_queues queue
         ON queue.tenant_id=window.tenant_id AND queue.queue_key=window.queue_key
       LEFT JOIN purchase_settlement_entries close
         ON close.tenant_id=window.tenant_id AND close.window_id=window.window_id
        AND close.entry_kind='close'
       WHERE window.tenant_id=?1 AND window.queue_key=?2 AND window.window_id=?3
       LIMIT 1`,
    ).bind(tenantId, queueKey, windowId).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      queue_key: String(row.queue_key),
      queue_revision: Number(row.queue_revision),
      window_id: String(row.window_id),
      window_revision: Number(row.window_revision),
      window_sequence: Number(row.window_sequence),
      window_status: String(row.window_status) as PurchaseSettlementWindowState["window_status"],
      tolerance_bps: Number(row.tolerance_bps),
      nominal_qty_micros: Number(row.nominal_qty_micros),
      received_qty_micros: Number(row.received_qty_micros),
      ...(row.close_entry_id == null ? {} : {
        close_entry_id: String(row.close_entry_id),
        close_committed_at: String(row.close_committed_at),
        close_reason: String(row.close_reason),
        minimum_qty_micros: Number(row.minimum_qty_micros),
        maximum_qty_micros: Number(row.maximum_qty_micros),
        shortage_variance_micros: Number(row.shortage_variance_micros),
        overage_variance_micros: Number(row.overage_variance_micros),
      }),
    };
  }

  async getPurchaseAllocationOverrideSource(
    tenantId: string,
    entryId: string,
  ): Promise<PurchaseAllocationOverrideSourceState | null> {
    const row = await this.allocationReader.prepare(
      `SELECT source.entry_id, source.queue_key, queue.revision AS queue_revision,
              source.window_id, window.revision AS window_revision, window.status AS window_status,
              source.voucher_no, source.voucher_revision, source.receipt_item_row_id,
              source.purchase_order, source.purchase_order_item_row_id,
              source.qty_micros + COALESCE(SUM(reversal.qty_micros),0) AS qty_micros,
              source.barem_weight_micros + COALESCE(SUM(reversal.barem_weight_micros),0)
                AS barem_weight_micros,
              CASE WHEN source.projected_actual_weight_micros IS NULL THEN NULL
                   ELSE source.projected_actual_weight_micros
                     + COALESCE(SUM(reversal.projected_actual_weight_micros),0) END
                AS projected_actual_weight_micros,
              source.projection_version, source.posting_at,
              COALESCE((SELECT MAX(allocation.allocation_sequence)
                        FROM purchase_receipt_allocation_entries allocation
                        WHERE allocation.tenant_id=source.tenant_id
                          AND allocation.voucher_no=source.voucher_no),0)+1 AS next_allocation_sequence
       FROM purchase_receipt_allocation_entries source
       JOIN purchase_obligation_queues queue
         ON queue.tenant_id=source.tenant_id AND queue.queue_key=source.queue_key
       JOIN purchase_settlement_windows window
         ON window.tenant_id=source.tenant_id AND window.window_id=source.window_id
       LEFT JOIN purchase_receipt_allocation_entries reversal
         ON reversal.tenant_id=source.tenant_id
        AND reversal.reversal_of_entry_id=source.entry_id AND reversal.entry_kind='reverse'
       WHERE source.tenant_id=?1 AND source.entry_id=?2 AND source.qty_micros>0
         AND source.entry_kind IN ('allocate','manual_allocate','apply_unapplied')
       GROUP BY source.tenant_id, source.entry_id
       HAVING source.qty_micros + COALESCE(SUM(reversal.qty_micros),0)>0`,
    ).bind(tenantId, entryId).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      entry_id: String(row.entry_id),
      queue_key: String(row.queue_key),
      queue_revision: Number(row.queue_revision),
      window_id: String(row.window_id),
      window_revision: Number(row.window_revision),
      window_status: String(row.window_status) as PurchaseAllocationOverrideSourceState["window_status"],
      voucher_no: String(row.voucher_no),
      voucher_revision: Number(row.voucher_revision),
      receipt_item_row_id: String(row.receipt_item_row_id),
      purchase_order: String(row.purchase_order),
      purchase_order_item_row_id: String(row.purchase_order_item_row_id),
      qty_micros: Number(row.qty_micros),
      barem_weight_micros: Number(row.barem_weight_micros),
      ...(row.projected_actual_weight_micros == null ? {} : {
        projected_actual_weight_micros: Number(row.projected_actual_weight_micros),
      }),
      ...(row.projection_version == null ? {} : { projection_version: Number(row.projection_version) }),
      posting_at: String(row.posting_at),
      next_allocation_sequence: Number(row.next_allocation_sequence),
    };
  }

}
