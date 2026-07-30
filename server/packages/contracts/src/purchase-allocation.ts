import type { JsonObject, JsonValue, MutationPlan } from "./index.js";

export type PurchaseAllocationSource = "live" | "legacy";
export type PurchaseAllocationResolution = "resolved" | "legacy_unresolved";
export type PurchaseSettlementWindowStatus = "Open" | "Settled" | "Reversed";

/** Canonical material identity is computed by the server; clients never provide the hash as authority. */
export interface PurchaseMaterialSnapshot extends JsonObject {
  schema_version: number;
  item_code: string;
  length_m_micros: number;
  theoretical_kg_per_m_micros: number;
  color: string;
  is_stamped: 0 | 1;
  measurement_profile: string;
  stock_uom: string;
  [key: string]: JsonValue | undefined;
}

/** Seed/upsert data for one continuous supplier/material obligation queue. */
export interface PurchaseObligationQueueSeed {
  queue_key: string;
  company: string;
  supplier: string;
  material_match_key: string;
  material_schema_version: number;
  material_snapshot: PurchaseMaterialSnapshot;
  revision: number;
  created_at: string;
  modified_at: string;
}

/** One finite tolerance period inside a continuous obligation queue. */
export interface PurchaseSettlementWindowSeed {
  window_id: string;
  queue_key: string;
  window_sequence: number;
  status: PurchaseSettlementWindowStatus;
  /** 5% is stored as 500 basis points. */
  tolerance_bps: number;
  revision: number;
  opened_at: string;
  settled_at?: string;
  settled_by?: string;
  settlement_reason?: string;
}

/** Signed, append-only PO-line obligation event. */
export interface PurchaseWindowObligationEntry {
  entry_id: string;
  queue_key: string;
  window_id: string;
  line_key: string;
  purchase_order: string;
  purchase_order_item_row_id?: string;
  entry_kind: "open" | "cancel" | "legacy";
  qty_micros: number;
  transaction_date: string;
  purchase_order_created_at: string;
  item_idx: number;
  committed_at: string;
  source: PurchaseAllocationSource;
  resolution: PurchaseAllocationResolution;
}

/** Signed, immutable allocation from one Purchase Receipt row to one Purchase Order row. */
export interface PurchaseReceiptAllocationEntry {
  entry_id: string;
  queue_key: string;
  window_id: string;
  line_key: string;
  receipt_item_row_id?: string;
  purchase_order: string;
  purchase_order_item_row_id?: string;
  entry_kind: "allocate" | "reverse" | "manual_allocate" | "apply_unapplied" | "legacy";
  qty_micros: number;
  barem_weight_micros: number;
  projected_actual_weight_micros?: number;
  projection_version?: number;
  allocation_sequence: number;
  posting_at: string;
  committed_at: string;
  reason?: string;
  source: PurchaseAllocationSource;
  resolution: PurchaseAllocationResolution;
  reversal_of_entry_id?: string;
}

/** Signed balance movement for Receipt quantity that has not yet been applied to a nominal PO obligation. */
export interface PurchaseUnappliedReceiptEntry {
  entry_id: string;
  queue_key: string;
  window_id: string;
  line_key: string;
  receipt_item_row_id: string;
  entry_kind: "receive" | "apply" | "reverse" | "settle";
  qty_micros: number;
  source_entry_id?: string;
  allocation_entry_id?: string;
  posting_at: string;
  committed_at: string;
  reason?: string;
}

/** Immutable close/reverse event for one finite tolerance window. */
export interface PurchaseSettlementEntry {
  entry_id: string;
  queue_key: string;
  window_id: string;
  entry_kind: "close" | "reverse";
  nominal_qty_micros: number;
  received_qty_micros: number;
  minimum_qty_micros: number;
  maximum_qty_micros: number;
  shortage_variance_micros: number;
  overage_variance_micros: number;
  committed_at: string;
  reason: string;
  reversal_of_entry_id?: string;
}

/** Optimistic commit guard used in addition to supplier-level Durable Object serialization. */
export interface PurchaseAllocationRevisionClaim {
  scope_type: "queue" | "window";
  scope_key: string;
  expected_revision: number;
  claimed_at: string;
}

/**
 * M1 extension of the normal document mutation plan. The D1 adapter must persist
 * every supplied row in the same batch as the document, stock and compatibility
 * procurement projection. All arrays are optional so unaffected controllers keep
 * their existing plan shape.
 */
export interface PurchaseAllocationMutationPlanExtension {
  purchase_queue_seeds?: PurchaseObligationQueueSeed[];
  purchase_window_seeds?: PurchaseSettlementWindowSeed[];
  purchase_obligation_entries?: PurchaseWindowObligationEntry[];
  purchase_allocation_entries?: PurchaseReceiptAllocationEntry[];
  purchase_unapplied_entries?: PurchaseUnappliedReceiptEntry[];
  purchase_settlement_entries?: PurchaseSettlementEntry[];
  purchase_revision_claims?: PurchaseAllocationRevisionClaim[];
}

export type PurchaseAllocationMutationPlan<T extends JsonObject = JsonObject> =
  MutationPlan<T> & PurchaseAllocationMutationPlanExtension;
