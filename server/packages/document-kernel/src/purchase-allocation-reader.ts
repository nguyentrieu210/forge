import type { DomainReader } from "./store.js";
import type { PurchaseAllocationObligation } from "../../clouderp-core/src/purchase-allocation.js";

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
  window_id: string;
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
  window_id: string;
  receipt_item_row_id: string;
  qty_micros: number;
  posting_at: string;
}

export interface PurchaseAllocationReader extends DomainReader {
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
  ): Promise<PurchaseAllocationObligation[]>;
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

export function requirePurchaseAllocationReader(reader: DomainReader): PurchaseAllocationReader {
  const candidate = reader as Partial<PurchaseAllocationReader>;
  const methods: Array<keyof PurchaseAllocationReader> = [
    "getPurchaseAllocationQueueState",
    "listPurchaseAllocationObligations",
    "getPurchaseAllocationWindowTotals",
    "getPurchaseObligationRowState",
    "listPurchaseReceiptAllocationSources",
    "listPurchaseReceiptUnappliedSources",
  ];
  for (const method of methods) {
    if (typeof candidate[method] !== "function") {
      throw new Error(`Purchase allocation reader is missing ${String(method)}`);
    }
  }
  return reader as PurchaseAllocationReader;
}
