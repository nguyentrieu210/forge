import type { DomainReader } from "./store.js";

export interface PurchaseOpenWindowState {
  window_id: string;
  window_sequence: number;
  tolerance_bps: number;
  revision: number;
}

export interface PurchaseAllocationQueueState {
  queue_key: string;
  revision: number;
  next_window_sequence: number;
  open_window?: PurchaseOpenWindowState;
}

export interface PurchaseAllocationWindowTotals {
  nominal_qty_micros: number;
  received_qty_micros: number;
}

/** Read model consumed structurally by the pure FIFO planner in clouderp-core. */
export interface PurchaseAllocationObligationState {
  queue_key: string;
  window_id: string;
  purchase_order: string;
  purchase_order_item_row_id: string;
  remaining_qty_micros: number;
  transaction_date: string;
  purchase_order_created_at: string;
  item_idx: number;
}

export interface PurchaseObligationRowState {
  queue_key: string;
  queue_revision: number;
  window_id: string;
  window_revision: number;
  window_status: "Open" | "Settled" | "Reversed";
  nominal_qty_micros: number;
  allocated_qty_micros: number;
  remaining_qty_micros: number;
}

export interface PurchaseReceiptAllocationSourceState {
  entry_id: string;
  queue_key: string;
  queue_revision: number;
  window_id: string;
  window_revision: number;
  window_status: "Open" | "Settled" | "Reversed";
  receipt_item_row_id: string;
  purchase_order: string;
  purchase_order_item_row_id: string;
  qty_micros: number;
  barem_weight_micros: number;
  projected_actual_weight_micros?: number;
  projection_version?: number;
  allocation_sequence: number;
  posting_at: string;
}

export interface PurchaseUnappliedSourceState {
  entry_id: string;
  queue_key: string;
  queue_revision: number;
  window_id: string;
  window_revision: number;
  window_status: "Open" | "Settled" | "Reversed";
  receipt_item_row_id: string;
  qty_micros: number;
  posting_at: string;
}

export interface PurchaseAllocationReader extends DomainReader {
  isPurchaseAllocationEnabled(tenantId: string): Promise<boolean>;
  getPurchaseAllocationQueueState(
    tenantId: string,
    company: string,
    supplier: string,
    materialMatchKey: string,
  ): Promise<PurchaseAllocationQueueState | null>;
  listPurchaseAllocationObligations(
    tenantId: string,
    queueKey: string,
    windowId: string,
  ): Promise<PurchaseAllocationObligationState[]>;
  getPurchaseAllocationWindowTotals(
    tenantId: string,
    windowId: string,
  ): Promise<PurchaseAllocationWindowTotals>;
  getPurchaseObligationRowState(
    tenantId: string,
    purchaseOrder: string,
    purchaseOrderItemRowId: string,
  ): Promise<PurchaseObligationRowState | null>;
  listPurchaseReceiptAllocationSources(
    tenantId: string,
    purchaseReceipt: string,
  ): Promise<PurchaseReceiptAllocationSourceState[]>;
  listPurchaseReceiptUnappliedSources(
    tenantId: string,
    purchaseReceipt: string,
  ): Promise<PurchaseUnappliedSourceState[]>;
}

const PURCHASE_ALLOCATION_READER_METHODS: Array<keyof PurchaseAllocationReader> = [
  "isPurchaseAllocationEnabled",
  "getPurchaseAllocationQueueState",
  "listPurchaseAllocationObligations",
  "getPurchaseAllocationWindowTotals",
  "getPurchaseObligationRowState",
  "listPurchaseReceiptAllocationSources",
  "listPurchaseReceiptUnappliedSources",
];

export function hasPurchaseAllocationReader(reader: DomainReader): reader is PurchaseAllocationReader {
  const candidate = reader as Partial<PurchaseAllocationReader>;
  return PURCHASE_ALLOCATION_READER_METHODS.every((method) => typeof candidate[method] === "function");
}

export async function isPurchaseAllocationActive(
  reader: DomainReader,
  tenantId: string,
): Promise<reader is PurchaseAllocationReader> {
  return hasPurchaseAllocationReader(reader) && await reader.isPurchaseAllocationEnabled(tenantId);
}

export function requirePurchaseAllocationReader(reader: DomainReader): PurchaseAllocationReader {
  if (!hasPurchaseAllocationReader(reader)) {
    const candidate = reader as Partial<PurchaseAllocationReader>;
    const missing = PURCHASE_ALLOCATION_READER_METHODS.find((method) => typeof candidate[method] !== "function");
    throw new Error(`Purchase allocation reader is missing ${String(missing)}`);
  }
  return reader;
}
