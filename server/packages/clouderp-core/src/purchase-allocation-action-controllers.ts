import type {
  CanonicalDocument,
  JsonObject,
  MutationPlan,
  ProcurementEntry,
} from "../../contracts/src/index.js";
import type {
  PurchaseAllocationRevisionClaim,
  PurchaseReceiptAllocationEntry,
  PurchaseSettlementEntry,
} from "../../contracts/src/purchase-allocation.js";
import { errors } from "../../core/src/index.js";
import {
  activePurchaseAllocationReader,
  nextDocStatus,
  type ControllerContext,
  type DocumentController,
  type PurchaseAllocationReader,
} from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { purchaseSettlementBounds } from "./purchase-allocation.js";

interface PurchaseSettlementData extends JsonObject {
  operation: "Close" | "Reverse";
  queue_key: string;
  window_id: string;
  reason: string;
  nominal_qty_micros?: number;
  received_qty_micros?: number;
  minimum_qty_micros?: number;
  maximum_qty_micros?: number;
  shortage_variance_micros?: number;
  overage_variance_micros?: number;
  nominal_qty?: string;
  received_qty?: string;
  minimum_qty?: string;
  maximum_qty?: string;
}

interface PurchaseAllocationOverrideData extends JsonObject {
  source_allocation_entry_id: string;
  target_purchase_order: string;
  target_purchase_order_item_row_id: string;
  qty: string | number;
  qty_micros?: number;
  reason: string;
  source_purchase_receipt?: string;
  source_purchase_order?: string;
  source_purchase_order_item_row_id?: string;
  barem_weight_micros?: number;
  projected_actual_weight_micros?: number;
}

const SETTLEMENT_ROLES = new Set([
  "System Manager",
  "Stock Manager",
  "Purchase Manager",
  "Chủ xưởng",
  "Kế toán",
]);
const OVERRIDE_ROLES = new Set([
  "System Manager",
  "Stock Manager",
  "Purchase Manager",
  "Chủ xưởng",
]);

/** Audited control document for final-delivery close and correction reversal. */
export class PurchaseSettlementController implements DocumentController<PurchaseSettlementData> {
  readonly doctype = "Purchase Settlement";

  async buildPlan(context: ControllerContext<PurchaseSettlementData>): Promise<MutationPlan<PurchaseSettlementData>> {
    if (context.command.action === "cancel") {
      throw errors.lifecycle("Purchase Settlement is immutable; submit a Reverse settlement instead");
    }
    const data = normalizeSettlement(context.command.document);
    const settlementEntries: PurchaseSettlementEntry[] = [];
    const claims: PurchaseAllocationRevisionClaim[] = [];

    if (context.command.action === "submit") {
      assertRole(context, SETTLEMENT_ROLES, "close or reverse a purchase settlement window");
      const reader = await requireActiveReader(context);
      const state = await reader.getPurchaseSettlementWindowState(
        context.command.tenant_id,
        data.queue_key,
        data.window_id,
      );
      if (!state) throw errors.reference("Purchase settlement window does not exist");

      if (data.operation === "Close") {
        if (state.window_status !== "Open") {
          throw errors.lifecycle("Only an open purchase settlement window can be closed");
        }
        const bounds = purchaseSettlementBounds(state.nominal_qty_micros, state.tolerance_bps);
        if (state.received_qty_micros < bounds.minimum_qty_micros
          || state.received_qty_micros > bounds.maximum_qty_micros) {
          throw errors.reference("Received quantity is outside the settlement tolerance", {
            received_qty_micros: state.received_qty_micros,
            minimum_qty_micros: bounds.minimum_qty_micros,
            maximum_qty_micros: bounds.maximum_qty_micros,
          });
        }
        const shortage = Math.max(state.nominal_qty_micros - state.received_qty_micros, 0);
        const overage = Math.max(state.received_qty_micros - state.nominal_qty_micros, 0);
        settlementEntries.push({
          entry_id: controlId("SETTLE", context.command.command_id),
          queue_key: state.queue_key,
          window_id: state.window_id,
          entry_kind: "close",
          nominal_qty_micros: state.nominal_qty_micros,
          received_qty_micros: state.received_qty_micros,
          minimum_qty_micros: bounds.minimum_qty_micros,
          maximum_qty_micros: bounds.maximum_qty_micros,
          shortage_variance_micros: shortage,
          overage_variance_micros: overage,
          committed_at: context.now,
          reason: data.reason,
        });
        Object.assign(data, summaryFields({
          nominal: state.nominal_qty_micros,
          received: state.received_qty_micros,
          minimum: bounds.minimum_qty_micros,
          maximum: bounds.maximum_qty_micros,
          shortage,
          overage,
        }));
      } else {
        if (state.window_status !== "Settled" || !state.close_entry_id
          || state.minimum_qty_micros === undefined || state.maximum_qty_micros === undefined
          || state.shortage_variance_micros === undefined || state.overage_variance_micros === undefined) {
          throw errors.lifecycle("Only a settled window with a close event can be reversed");
        }
        settlementEntries.push({
          entry_id: controlId("SETTLE-REV", context.command.command_id),
          queue_key: state.queue_key,
          window_id: state.window_id,
          entry_kind: "reverse",
          nominal_qty_micros: state.nominal_qty_micros,
          received_qty_micros: state.received_qty_micros,
          minimum_qty_micros: state.minimum_qty_micros,
          maximum_qty_micros: state.maximum_qty_micros,
          shortage_variance_micros: state.shortage_variance_micros,
          overage_variance_micros: state.overage_variance_micros,
          committed_at: context.now,
          reason: data.reason,
          reversal_of_entry_id: state.close_entry_id,
        });
        Object.assign(data, summaryFields({
          nominal: state.nominal_qty_micros,
          received: state.received_qty_micros,
          minimum: state.minimum_qty_micros,
          maximum: state.maximum_qty_micros,
          shortage: state.shortage_variance_micros,
          overage: state.overage_variance_micros,
        }));
      }
      claims.push(
        revisionClaim("queue", state.queue_key, state.queue_revision, context.now),
        revisionClaim("window", state.window_id, state.window_revision, context.now),
      );
    }

    return controlPlan(context, this.doctype, data, {
      purchase_settlement_entries: settlementEntries,
      purchase_revision_claims: claims,
      eventType: data.operation === "Close"
        ? "purchase_allocation.settlement_closed"
        : "purchase_allocation.settlement_reversed",
    });
  }
}

/**
 * Audited reassignment of an existing Receipt allocation to another PO row in
 * the same supplier/material/window. The source is partially reversed and the
 * target receives a manual allocation in one atomic mutation.
 */
export class PurchaseAllocationOverrideController implements DocumentController<PurchaseAllocationOverrideData> {
  readonly doctype = "Purchase Allocation Override";

  async buildPlan(context: ControllerContext<PurchaseAllocationOverrideData>): Promise<MutationPlan<PurchaseAllocationOverrideData>> {
    if (context.command.action === "cancel") {
      throw errors.lifecycle("Purchase Allocation Override is immutable; submit a new corrective override");
    }
    const data = normalizeOverride(context.command.document);
    const allocations: PurchaseReceiptAllocationEntry[] = [];
    const procurement: ProcurementEntry[] = [];
    const claims: PurchaseAllocationRevisionClaim[] = [];

    if (context.command.action === "submit") {
      assertRole(context, OVERRIDE_ROLES, "override FIFO purchase allocation");
      const reader = await requireActiveReader(context);
      const source = await reader.getPurchaseAllocationOverrideSource(
        context.command.tenant_id,
        data.source_allocation_entry_id,
      );
      if (!source) throw errors.reference("Source purchase allocation does not exist or has been fully reversed");
      if (source.window_status !== "Open") {
        throw errors.lifecycle("Reverse settlement before overriding an allocation in this window");
      }
      const target = await reader.getPurchaseObligationRowState(
        context.command.tenant_id,
        data.target_purchase_order,
        data.target_purchase_order_item_row_id,
      );
      if (!target) throw errors.reference("Target Purchase Order row has no allocation obligation");
      if (target.window_status !== "Open"
        || target.queue_key !== source.queue_key
        || target.window_id !== source.window_id) {
        throw errors.reference("Manual override target must be in the same open supplier/material/window");
      }
      if (source.purchase_order === data.target_purchase_order
        && source.purchase_order_item_row_id === data.target_purchase_order_item_row_id) {
        throw errors.validation("Manual override target is already the source Purchase Order row");
      }
      const qty = data.qty_micros!;
      if (qty > source.qty_micros) {
        throw errors.reference("Manual override quantity exceeds the remaining source allocation");
      }
      if (qty > target.remaining_qty_micros) {
        throw errors.reference("Manual override quantity exceeds the target Purchase Order balance");
      }

      const barem = proportionalPart(source.barem_weight_micros, qty, source.qty_micros, "override barem weight");
      const actual = source.projected_actual_weight_micros === undefined
        ? undefined
        : proportionalPart(source.projected_actual_weight_micros, qty, source.qty_micros, "override actual weight");
      const reverseSequence = source.next_allocation_sequence;
      const manualSequence = reverseSequence + 1;
      allocations.push({
        entry_id: controlId("OVERRIDE-REV", context.command.command_id),
        queue_key: source.queue_key,
        window_id: source.window_id,
        line_key: `OVERRIDE-REV-${safeSegment(context.command.command_id)}`,
        voucher_no: source.voucher_no,
        voucher_revision: source.voucher_revision,
        receipt_item_row_id: source.receipt_item_row_id,
        purchase_order: source.purchase_order,
        purchase_order_item_row_id: source.purchase_order_item_row_id,
        entry_kind: "reverse",
        qty_micros: -qty,
        barem_weight_micros: -barem,
        ...(actual === undefined ? {} : {
          projected_actual_weight_micros: -actual,
          projection_version: source.projection_version ?? 1,
        }),
        allocation_sequence: reverseSequence,
        posting_at: source.posting_at,
        committed_at: context.now,
        reason: data.reason,
        source: "live",
        resolution: "resolved",
        reversal_of_entry_id: source.entry_id,
      });
      allocations.push({
        entry_id: controlId("OVERRIDE-ALLOC", context.command.command_id),
        queue_key: source.queue_key,
        window_id: source.window_id,
        line_key: `OVERRIDE-ALLOC-${safeSegment(context.command.command_id)}`,
        voucher_no: source.voucher_no,
        voucher_revision: source.voucher_revision,
        receipt_item_row_id: source.receipt_item_row_id,
        purchase_order: data.target_purchase_order,
        purchase_order_item_row_id: data.target_purchase_order_item_row_id,
        entry_kind: "manual_allocate",
        qty_micros: qty,
        barem_weight_micros: barem,
        ...(actual === undefined ? {} : {
          projected_actual_weight_micros: actual,
          projection_version: source.projection_version ?? 1,
        }),
        allocation_sequence: manualSequence,
        posting_at: source.posting_at,
        committed_at: context.now,
        reason: data.reason,
        source: "live",
        resolution: "resolved",
      });
      procurement.push(
        {
          line_key: `OVERRIDE-REV-${safeSegment(context.command.command_id)}`,
          voucher_type: "Purchase Receipt",
          voucher_no: source.voucher_no,
          voucher_revision: source.voucher_revision,
          purchase_order: source.purchase_order,
          kind: "Receipt",
          item_code: await itemCodeOfReceiptRow(reader, context.command.tenant_id, source.voucher_no, source.receipt_item_row_id),
          qty_micros: -qty,
          posting_at: source.posting_at,
        },
        {
          line_key: `OVERRIDE-ALLOC-${safeSegment(context.command.command_id)}`,
          voucher_type: "Purchase Receipt",
          voucher_no: source.voucher_no,
          voucher_revision: source.voucher_revision,
          purchase_order: data.target_purchase_order,
          kind: "Receipt",
          item_code: await itemCodeOfReceiptRow(reader, context.command.tenant_id, source.voucher_no, source.receipt_item_row_id),
          qty_micros: qty,
          posting_at: source.posting_at,
        },
      );
      claims.push(
        revisionClaim("queue", source.queue_key, source.queue_revision, context.now),
        revisionClaim("window", source.window_id, source.window_revision, context.now),
      );
      Object.assign(data, {
        source_purchase_receipt: source.voucher_no,
        source_purchase_order: source.purchase_order,
        source_purchase_order_item_row_id: source.purchase_order_item_row_id,
        barem_weight_micros: barem,
        ...(actual === undefined ? {} : { projected_actual_weight_micros: actual }),
      });
    }

    return controlPlan(context, this.doctype, data, {
      procurement_entries: procurement,
      purchase_allocation_entries: allocations,
      purchase_revision_claims: claims,
      eventType: "purchase_allocation.manual_override_submitted",
    });
  }
}

function normalizeSettlement(input: PurchaseSettlementData): PurchaseSettlementData {
  const operation = input.operation;
  if (operation !== "Close" && operation !== "Reverse") {
    throw errors.validation("Purchase Settlement operation must be Close or Reverse");
  }
  return {
    ...input,
    operation,
    queue_key: requiredText(input.queue_key, "queue_key"),
    window_id: requiredText(input.window_id, "window_id"),
    reason: requiredReason(input.reason),
  };
}

function normalizeOverride(input: PurchaseAllocationOverrideData): PurchaseAllocationOverrideData {
  const qtyMicros = toScaledInt(input.qty, 6, "qty");
  if (qtyMicros <= 0) throw errors.validation("Manual override quantity must be positive");
  return {
    ...input,
    source_allocation_entry_id: requiredText(input.source_allocation_entry_id, "source_allocation_entry_id"),
    target_purchase_order: requiredText(input.target_purchase_order, "target_purchase_order"),
    target_purchase_order_item_row_id: requiredText(
      input.target_purchase_order_item_row_id,
      "target_purchase_order_item_row_id",
    ),
    qty: fromScaledInt(qtyMicros, 6),
    qty_micros: qtyMicros,
    reason: requiredReason(input.reason),
  };
}

async function requireActiveReader<T extends JsonObject>(
  context: ControllerContext<T>,
): Promise<PurchaseAllocationReader> {
  const reader = await activePurchaseAllocationReader(context.reader, context.command.tenant_id);
  if (!reader) throw errors.lifecycle("Purchase allocation rollout is not enabled for this tenant");
  return reader;
}

function assertRole<T extends JsonObject>(
  context: ControllerContext<T>,
  allowed: ReadonlySet<string>,
  action: string,
): void {
  if (context.command.actor.user_id === "Administrator") return;
  if (!context.command.actor.roles.some((role) => allowed.has(role))) {
    throw errors.permission(`A purchase or stock manager role is required to ${action}`);
  }
}

function controlPlan<T extends JsonObject>(
  context: ControllerContext<T>,
  doctype: string,
  data: T,
  extension: {
    procurement_entries?: ProcurementEntry[];
    purchase_allocation_entries?: PurchaseReceiptAllocationEntry[];
    purchase_settlement_entries?: PurchaseSettlementEntry[];
    purchase_revision_claims?: PurchaseAllocationRevisionClaim[];
    eventType: string;
  },
): MutationPlan<T> {
  const docstatus = nextDocStatus(context.command.action);
  const status = docstatus === 0 ? "Draft" : "Submitted";
  const document: CanonicalDocument<T> = {
    tenant_id: context.command.tenant_id,
    doctype,
    name: context.command.aggregate.name,
    owner: context.existing?.owner ?? context.command.actor.user_id,
    docstatus,
    status,
    version: context.nextVersion,
    created_at: context.existing?.created_at ?? context.now,
    modified_at: context.now,
    data,
    children: [],
  };
  return {
    command: context.command,
    document,
    gl_entries: [],
    stock_entries: [],
    payment_entries: [],
    fulfillment_entries: [],
    procurement_entries: extension.procurement_entries ?? [],
    purchase_allocation_entries: extension.purchase_allocation_entries ?? [],
    purchase_settlement_entries: extension.purchase_settlement_entries ?? [],
    purchase_revision_claims: extension.purchase_revision_claims ?? [],
    events: context.command.action === "submit" ? [domainEvent({
      type: extension.eventType,
      tenantId: context.command.tenant_id,
      aggregate: context.command.aggregate,
      aggregateVersion: context.nextVersion,
      actor: context.command.actor.user_id,
      commandId: context.command.command_id,
      occurredAt: context.now,
      payload: { status, doctype },
    })] : [],
    result: { doctype, name: document.name, version: document.version, docstatus, status },
  };
}

function summaryFields(values: {
  nominal: number;
  received: number;
  minimum: number;
  maximum: number;
  shortage: number;
  overage: number;
}): Partial<PurchaseSettlementData> {
  return {
    nominal_qty_micros: values.nominal,
    received_qty_micros: values.received,
    minimum_qty_micros: values.minimum,
    maximum_qty_micros: values.maximum,
    shortage_variance_micros: values.shortage,
    overage_variance_micros: values.overage,
    nominal_qty: fromScaledInt(values.nominal, 6),
    received_qty: fromScaledInt(values.received, 6),
    minimum_qty: fromScaledInt(values.minimum, 6),
    maximum_qty: fromScaledInt(values.maximum, 6),
  };
}

function revisionClaim(
  scopeType: "queue" | "window",
  scopeKey: string,
  expectedRevision: number,
  claimedAt: string,
): PurchaseAllocationRevisionClaim {
  return {
    scope_type: scopeType,
    scope_key: scopeKey,
    expected_revision: expectedRevision,
    claimed_at: claimedAt,
  };
}

async function itemCodeOfReceiptRow(
  reader: PurchaseAllocationReader,
  tenantId: string,
  receipt: string,
  rowId: string,
): Promise<string> {
  const document = await reader.getDocument(tenantId, "Purchase Receipt", receipt);
  const items = document?.data.items;
  if (!Array.isArray(items)) throw errors.reference(`Purchase Receipt ${receipt} has no item rows`);
  const row = items.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)
    && (candidate as JsonObject).row_id === rowId) as JsonObject | undefined;
  const itemCode = typeof row?.item_code === "string" ? row.item_code.trim() : "";
  if (!itemCode) throw errors.reference(`Purchase Receipt ${receipt} row ${rowId} has no item_code`);
  return itemCode;
}

function proportionalPart(total: number, part: number, whole: number, field: string): number {
  if (!Number.isSafeInteger(total) || total < 0
    || !Number.isSafeInteger(part) || part <= 0
    || !Number.isSafeInteger(whole) || whole <= 0 || part > whole) {
    throw errors.validation(`${field} has invalid proportional inputs`);
  }
  if (part === whole) return total;
  const value = Number(BigInt(total) * BigInt(part) / BigInt(whole));
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} exceeds safe integer range`);
  return value;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${field} is required`);
  return value.trim();
}

function requiredReason(value: unknown): string {
  const reason = requiredText(value, "reason");
  if (reason.length < 5) throw errors.validation("Reason must contain at least 5 characters");
  if (reason.length > 500) throw errors.validation("Reason must not exceed 500 characters");
  return reason;
}

function controlId(prefix: string, commandId: string): string {
  return `${prefix}:${safeSegment(commandId)}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 160);
}
