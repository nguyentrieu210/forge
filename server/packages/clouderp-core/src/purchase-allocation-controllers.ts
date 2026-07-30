import type {
  CanonicalDocument,
  JsonObject,
  MutationPlan,
  ProcurementEntry,
} from "../../contracts/src/index.js";
import type {
  PurchaseAllocationMutationPlanExtension,
  PurchaseAllocationRevisionClaim,
  PurchaseObligationQueueSeed,
  PurchaseReceiptAllocationEntry,
  PurchaseSettlementWindowSeed,
  PurchaseUnappliedReceiptEntry,
  PurchaseWindowObligationEntry,
} from "../../contracts/src/purchase-allocation.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import {
  hasPurchaseAllocationReader,
  type PurchaseAllocationQueueState,
  type PurchaseAllocationReader,
} from "../../document-kernel/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import {
  PurchaseOrderController,
  PurchaseReceiptController,
} from "./controllers.js";
import type { PurchaseItem, PurchaseOrderData, PurchaseReceiptData } from "./types.js";
import { applyUomConversion, stockQtyMicros } from "./uom.js";
import {
  canonicalizePurchaseMaterial,
  planPurchaseReceiptAllocation,
  purchaseObligationQueueKey,
  type PurchaseAllocationObligation,
} from "./purchase-allocation.js";

interface ResolvedQueue {
  queue_key: string;
  queue_revision: number;
  window_id: string;
  window_revision: number;
  window_sequence: number;
  tolerance_bps: number;
  queue_seed?: PurchaseObligationQueueSeed;
  window_seed?: PurchaseSettlementWindowSeed;
}

interface AllocationPlanParts extends PurchaseAllocationMutationPlanExtension {
  procurement_entries: ProcurementEntry[];
}

/** Purchase Order controller that creates/cancels immutable PO-line obligations. */
export class AllocatingPurchaseOrderController extends PurchaseOrderController {
  override async buildPlan(context: ControllerContext<PurchaseOrderData>): Promise<MutationPlan<PurchaseOrderData>> {
    const plan = await super.buildPlan(context);
    if (!hasPurchaseAllocationReader(context.reader)
      || !["submit", "cancel"].includes(context.command.action)) return plan;

    const extension = context.command.action === "submit"
      ? await buildPurchaseOrderSubmitAllocation(context, plan.document, context.reader)
      : await buildPurchaseOrderCancelAllocation(context, plan.document, context.reader);
    return { ...plan, ...extension };
  }
}

/** Purchase Receipt controller that removes the mandatory PO picker and plans FIFO automatically. */
export class AllocatingPurchaseReceiptController extends PurchaseReceiptController {
  override async normalize(context: ControllerContext<PurchaseReceiptData>): Promise<PurchaseReceiptData> {
    if (!hasPurchaseAllocationReader(context.reader)) return super.normalize(context);
    const input = context.command.document;
    if (!input.supplier || !input.company || !input.currency || !input.posting_at) {
      throw errors.validation("Supplier, company, currency and posting_at are required");
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw errors.validation("At least one item is required");
    }

    const currency = await context.reader.getMasterRecordData(
      context.command.tenant_id,
      "Currency",
      input.currency,
    );
    if (context.command.action === "submit" && !currency) {
      throw errors.reference(`Currency ${input.currency} does not exist`);
    }
    const scale = typeof currency?.currency_scale === "number" && Number.isSafeInteger(currency.currency_scale)
      ? currency.currency_scale
      : 2;
    const normalized = input.items.map((item, index): PurchaseItem => normalizeReceiptItem(item, scale, index));
    const items = await applyUomConversion(context, normalized, { transactionKind: "purchase" });
    const allowNegative = Boolean(input.allow_negative_stock
      && (context.command.actor.roles.includes("Stock Manager")
        || context.command.actor.roles.includes("System Manager")));

    if (context.command.action === "submit") {
      await assertPurchasePostingUnlocked(context, input.company, input.posting_at);
      await assertPurchaseMasters(context, [
        ["Supplier", input.supplier],
        ["Company", input.company],
        ["Currency", input.currency],
        ...items.map((item): [string, string] => ["Item", item.item_code]),
        ...items.map((item): [string, string] => ["Warehouse", item.warehouse!]),
      ]);
    }
    return {
      ...input,
      currency_scale: scale,
      items,
      allow_negative_stock: allowNegative,
    };
  }

  override async buildPlan(context: ControllerContext<PurchaseReceiptData>): Promise<MutationPlan<PurchaseReceiptData>> {
    const plan = await super.buildPlan(context);
    if (!hasPurchaseAllocationReader(context.reader)
      || !["submit", "cancel"].includes(context.command.action)) return plan;

    const parts = context.command.action === "submit"
      ? await buildPurchaseReceiptSubmitAllocation(context, plan.document.data, context.reader)
      : await buildPurchaseReceiptCancelAllocation(context, plan.document.data, context.reader);
    return {
      ...plan,
      procurement_entries: parts.procurement_entries,
      purchase_allocation_entries: parts.purchase_allocation_entries,
      purchase_unapplied_entries: parts.purchase_unapplied_entries,
      purchase_revision_claims: parts.purchase_revision_claims,
    };
  }
}

async function buildPurchaseOrderSubmitAllocation(
  context: ControllerContext<PurchaseOrderData>,
  document: CanonicalDocument<PurchaseOrderData>,
  reader: PurchaseAllocationReader,
): Promise<PurchaseAllocationMutationPlanExtension> {
  const toleranceBps = await supplierToleranceBps(context, document.data.supplier);
  const resolved = new Map<string, ResolvedQueue>();
  const queueSeeds: PurchaseObligationQueueSeed[] = [];
  const windowSeeds: PurchaseSettlementWindowSeed[] = [];
  const obligations: PurchaseWindowObligationEntry[] = [];
  const claims = new Map<string, PurchaseAllocationRevisionClaim>();

  for (const [index, item] of document.data.items.entries()) {
    const material = await canonicalMaterialOf(item);
    let queue = resolved.get(material.material_match_key);
    if (!queue) {
      queue = await resolveQueueForPurchaseOrder(
        context,
        reader,
        document.data.company,
        document.data.supplier,
        material.material_match_key,
        material.snapshot,
        toleranceBps,
      );
      resolved.set(material.material_match_key, queue);
      if (queue.queue_seed) queueSeeds.push(queue.queue_seed);
      if (queue.window_seed) windowSeeds.push(queue.window_seed);
      addClaim(claims, "queue", queue.queue_key, queue.queue_revision, context.now);
      addClaim(claims, "window", queue.window_id, queue.window_revision, context.now);
    }
    const rowId = requiredRowId(item, index);
    const qty = stockQtyMicros(item);
    if (qty <= 0) throw errors.validation(`Purchase Order row ${index + 1} has no positive stock quantity`);
    obligations.push({
      entry_id: allocationId("OBL", context.command.command_id, rowId),
      queue_key: queue.queue_key,
      window_id: queue.window_id,
      line_key: `OBL-${safeSegment(rowId)}`,
      purchase_order: document.name,
      purchase_order_item_row_id: rowId,
      entry_kind: "open",
      qty_micros: qty,
      transaction_date: document.data.transaction_date,
      purchase_order_created_at: document.created_at,
      item_idx: index + 1,
      committed_at: context.now,
      source: "live",
      resolution: "resolved",
    });
  }
  return {
    purchase_queue_seeds: queueSeeds,
    purchase_window_seeds: windowSeeds,
    purchase_obligation_entries: obligations,
    purchase_revision_claims: [...claims.values()],
  };
}

async function buildPurchaseOrderCancelAllocation(
  context: ControllerContext<PurchaseOrderData>,
  document: CanonicalDocument<PurchaseOrderData>,
  reader: PurchaseAllocationReader,
): Promise<PurchaseAllocationMutationPlanExtension> {
  const obligations: PurchaseWindowObligationEntry[] = [];
  const claims = new Map<string, PurchaseAllocationRevisionClaim>();
  for (const [index, item] of document.data.items.entries()) {
    const rowId = requiredRowId(item, index);
    const state = await reader.getPurchaseObligationRowState(
      context.command.tenant_id,
      document.name,
      rowId,
    );
    if (!state) throw errors.reference(`Purchase obligation is missing for ${document.name} row ${rowId}`);
    if (state.window_status !== "Open") {
      throw errors.lifecycle(`Purchase Order ${document.name} belongs to a settled allocation window`);
    }
    if (state.allocated_qty_micros !== 0) {
      throw errors.reference(`Purchase Order ${document.name} row ${rowId} has received quantity and cannot be cancelled`);
    }
    addClaim(claims, "queue", state.queue_key, state.queue_revision, context.now);
    addClaim(claims, "window", state.window_id, state.window_revision, context.now);
    obligations.push({
      entry_id: allocationId("OBL-CANCEL", context.command.command_id, rowId),
      queue_key: state.queue_key,
      window_id: state.window_id,
      line_key: `CANCEL-${safeSegment(rowId)}`,
      purchase_order: document.name,
      purchase_order_item_row_id: rowId,
      entry_kind: "cancel",
      qty_micros: -state.nominal_qty_micros,
      transaction_date: document.data.transaction_date,
      purchase_order_created_at: document.created_at,
      item_idx: index + 1,
      committed_at: context.now,
      source: "live",
      resolution: "resolved",
    });
  }
  return {
    purchase_obligation_entries: obligations,
    purchase_revision_claims: [...claims.values()],
  };
}

async function buildPurchaseReceiptSubmitAllocation(
  context: ControllerContext<PurchaseReceiptData>,
  data: PurchaseReceiptData,
  reader: PurchaseAllocationReader,
): Promise<AllocationPlanParts> {
  const groups = new Map<string, {
    queue: PurchaseAllocationQueueState;
    materialKey: string;
    lines: Array<{ item: PurchaseItem; index: number }>;
  }>();

  for (const [index, item] of data.items.entries()) {
    const material = await canonicalMaterialOf(item);
    const state = await reader.getPurchaseAllocationQueueState(
      context.command.tenant_id,
      data.company,
      data.supplier,
      material.material_match_key,
    );
    if (!state?.open_window) {
      throw errors.reference(`No open Purchase Order obligation matches Receipt row ${index + 1}`);
    }
    const existing = groups.get(state.queue_key);
    if (existing) existing.lines.push({ item, index });
    else groups.set(state.queue_key, {
      queue: state,
      materialKey: material.material_match_key,
      lines: [{ item, index }],
    });
  }

  const allocations: PurchaseReceiptAllocationEntry[] = [];
  const unapplied: PurchaseUnappliedReceiptEntry[] = [];
  const procurement: ProcurementEntry[] = [];
  const claims = new Map<string, PurchaseAllocationRevisionClaim>();

  for (const group of groups.values()) {
    const window = group.queue.open_window!;
    const obligations: PurchaseAllocationObligation[] = (await reader.listPurchaseAllocationObligations(
      context.command.tenant_id,
      group.queue.queue_key,
      window.window_id,
    )).map((row) => ({ ...row }));
    const totals = await reader.getPurchaseAllocationWindowTotals(
      context.command.tenant_id,
      window.window_id,
    );
    let receivedBefore = totals.received_qty_micros;
    let sequence = 0;
    addClaim(claims, "queue", group.queue.queue_key, group.queue.revision, context.now);
    addClaim(claims, "window", window.window_id, window.revision, context.now);

    for (const { item, index } of group.lines) {
      const rowId = requiredRowId(item, index);
      const qty = stockQtyMicros(item);
      const baremWeight = theoreticalBaremWeightMicros(item, qty, index);
      const result = planPurchaseReceiptAllocation({
        queue_key: group.queue.queue_key,
        window_id: window.window_id,
        receipt_qty_micros: qty,
        receipt_barem_weight_micros: baremWeight,
        ...(item.actual_weight_micros === undefined
          ? {}
          : { actual_weight_micros: item.actual_weight_micros }),
        window_nominal_qty_micros: totals.nominal_qty_micros,
        window_received_before_micros: receivedBefore,
        tolerance_bps: window.tolerance_bps,
      }, obligations);
      receivedBefore = result.received_after_micros;

      for (const planned of result.allocations) {
        sequence += 1;
        const entryId = allocationId("ALLOC", context.command.command_id, rowId, sequence);
        allocations.push({
          entry_id: entryId,
          queue_key: group.queue.queue_key,
          window_id: window.window_id,
          line_key: `ALLOC-${safeSegment(rowId)}-${sequence}`,
          receipt_item_row_id: rowId,
          purchase_order: planned.purchase_order,
          purchase_order_item_row_id: planned.purchase_order_item_row_id,
          entry_kind: "allocate",
          qty_micros: planned.qty_micros,
          barem_weight_micros: planned.barem_weight_micros,
          ...(planned.projected_actual_weight_micros === undefined
            ? {}
            : {
                projected_actual_weight_micros: planned.projected_actual_weight_micros,
                projection_version: 1,
              }),
          allocation_sequence: sequence,
          posting_at: data.posting_at,
          committed_at: context.now,
          source: "live",
          resolution: "resolved",
        });
        procurement.push({
          line_key: `RECEIPT-${safeSegment(rowId)}-${sequence}`,
          purchase_order: planned.purchase_order,
          kind: "Receipt",
          item_code: item.item_code,
          qty_micros: planned.qty_micros,
          posting_at: data.posting_at,
        });
        const obligation = obligations.find((candidate) =>
          candidate.purchase_order === planned.purchase_order
          && candidate.purchase_order_item_row_id === planned.purchase_order_item_row_id);
        if (!obligation) throw errors.reference("FIFO planner returned an unknown Purchase Order row");
        obligation.remaining_qty_micros -= planned.qty_micros;
      }
      if (result.unapplied_qty_micros > 0) {
        unapplied.push({
          entry_id: allocationId("UNAPPLIED", context.command.command_id, rowId),
          queue_key: group.queue.queue_key,
          window_id: window.window_id,
          line_key: `UNAPPLIED-${safeSegment(rowId)}`,
          receipt_item_row_id: rowId,
          entry_kind: "receive",
          qty_micros: result.unapplied_qty_micros,
          posting_at: data.posting_at,
          committed_at: context.now,
        });
      }
    }
  }

  return {
    procurement_entries: procurement,
    purchase_allocation_entries: allocations,
    purchase_unapplied_entries: unapplied,
    purchase_revision_claims: [...claims.values()],
  };
}

async function buildPurchaseReceiptCancelAllocation(
  context: ControllerContext<PurchaseReceiptData>,
  data: PurchaseReceiptData,
  reader: PurchaseAllocationReader,
): Promise<AllocationPlanParts> {
  const sources = await reader.listPurchaseReceiptAllocationSources(
    context.command.tenant_id,
    context.command.aggregate.name,
  );
  const unappliedSources = await reader.listPurchaseReceiptUnappliedSources(
    context.command.tenant_id,
    context.command.aggregate.name,
  );
  const claims = new Map<string, PurchaseAllocationRevisionClaim>();
  const allocations: PurchaseReceiptAllocationEntry[] = [];
  const unapplied: PurchaseUnappliedReceiptEntry[] = [];
  const procurement: ProcurementEntry[] = [];

  for (const source of sources) {
    if (source.window_status !== "Open") {
      throw errors.lifecycle("Reverse settlement before cancelling this Purchase Receipt");
    }
    addClaim(claims, "queue", source.queue_key, source.queue_revision, context.now);
    addClaim(claims, "window", source.window_id, source.window_revision, context.now);
    allocations.push({
      entry_id: allocationId("ALLOC-REV", context.command.command_id, source.entry_id),
      queue_key: source.queue_key,
      window_id: source.window_id,
      line_key: `REV-${safeSegment(source.entry_id)}`,
      receipt_item_row_id: source.receipt_item_row_id,
      purchase_order: source.purchase_order,
      purchase_order_item_row_id: source.purchase_order_item_row_id,
      entry_kind: "reverse",
      qty_micros: -source.qty_micros,
      barem_weight_micros: -source.barem_weight_micros,
      ...(source.projected_actual_weight_micros === undefined
        ? {}
        : {
            projected_actual_weight_micros: -source.projected_actual_weight_micros,
            projection_version: source.projection_version ?? 1,
          }),
      allocation_sequence: source.allocation_sequence,
      posting_at: data.posting_at,
      committed_at: context.now,
      source: "live",
      resolution: "resolved",
      reversal_of_entry_id: source.entry_id,
    });
    const item = data.items.find((candidate) => candidate.row_id === source.receipt_item_row_id);
    if (!item) throw errors.reference(`Receipt row ${source.receipt_item_row_id} is missing during cancellation`);
    procurement.push({
      line_key: `REV-RECEIPT-${safeSegment(source.entry_id)}`,
      purchase_order: source.purchase_order,
      kind: "Receipt",
      item_code: item.item_code,
      qty_micros: -source.qty_micros,
      posting_at: data.posting_at,
    });
  }
  for (const source of unappliedSources) {
    if (source.window_status !== "Open") {
      throw errors.lifecycle("Reverse settlement before cancelling unapplied Receipt quantity");
    }
    addClaim(claims, "queue", source.queue_key, source.queue_revision, context.now);
    addClaim(claims, "window", source.window_id, source.window_revision, context.now);
    unapplied.push({
      entry_id: allocationId("UNAPPLIED-REV", context.command.command_id, source.entry_id),
      queue_key: source.queue_key,
      window_id: source.window_id,
      line_key: `REV-${safeSegment(source.entry_id)}`,
      receipt_item_row_id: source.receipt_item_row_id,
      entry_kind: "reverse",
      qty_micros: -source.qty_micros,
      source_entry_id: source.entry_id,
      posting_at: data.posting_at,
      committed_at: context.now,
      reason: "Purchase Receipt cancelled",
    });
  }
  return {
    procurement_entries: procurement,
    purchase_allocation_entries: allocations,
    purchase_unapplied_entries: unapplied,
    purchase_revision_claims: [...claims.values()],
  };
}

async function resolveQueueForPurchaseOrder(
  context: ControllerContext<PurchaseOrderData>,
  reader: PurchaseAllocationReader,
  company: string,
  supplier: string,
  materialMatchKey: string,
  snapshot: Awaited<ReturnType<typeof canonicalizePurchaseMaterial>>["snapshot"],
  toleranceBps: number,
): Promise<ResolvedQueue> {
  const existing = await reader.getPurchaseAllocationQueueState(
    context.command.tenant_id,
    company,
    supplier,
    materialMatchKey,
  );
  const queueKey = existing?.queue_key ?? await purchaseObligationQueueKey({
    tenant_id: context.command.tenant_id,
    company,
    supplier,
    material_match_key: materialMatchKey,
  });
  const sequence = existing?.open_window?.window_sequence ?? existing?.next_window_sequence ?? 1;
  const windowId = existing?.open_window?.window_id ?? purchaseWindowId(queueKey, sequence);
  return {
    queue_key: queueKey,
    queue_revision: existing?.revision ?? 0,
    window_id: windowId,
    window_revision: existing?.open_window?.revision ?? 0,
    window_sequence: sequence,
    tolerance_bps: existing?.open_window?.tolerance_bps ?? toleranceBps,
    ...(existing ? {} : {
      queue_seed: {
        queue_key: queueKey,
        company,
        supplier,
        material_match_key: materialMatchKey,
        material_schema_version: snapshot.schema_version,
        material_snapshot: snapshot,
        revision: 0,
        created_at: context.now,
        modified_at: context.now,
      },
    }),
    ...(existing?.open_window ? {} : {
      window_seed: {
        window_id: windowId,
        queue_key: queueKey,
        window_sequence: sequence,
        status: "Open",
        tolerance_bps: toleranceBps,
        revision: 0,
        opened_at: context.now,
      },
    }),
  };
}

async function canonicalMaterialOf(item: PurchaseItem) {
  const data = item as JsonObject;
  return canonicalizePurchaseMaterial({
    item_code: item.item_code,
    length_m: decimalField(data.length_m),
    theoretical_kg_per_m: decimalField(data.theoretical_kg_per_m),
    color: textOrEmpty(data.color),
    is_stamped: stampedField(data.is_stamped),
    measurement_profile: item.measurement_profile ?? "",
    stock_uom: item.stock_uom ?? item.uom ?? "",
  });
}

function theoreticalBaremWeightMicros(item: PurchaseItem, stockQty: number, index: number): number {
  const data = item as JsonObject;
  const explicit = decimalField(data.theoretical_kg);
  if (explicit !== undefined) return toScaledInt(explicit, 6, `items[${index}].theoretical_kg`);
  const length = decimalField(data.length_m);
  const kgPerM = decimalField(data.theoretical_kg_per_m);
  if (length === undefined || kgPerM === undefined) return 0;
  const metres = multiplyScaled(fromScaledInt(stockQty, 6), 6, length, 6, 6, `items[${index}].barem_metres`);
  return multiplyScaled(fromScaledInt(metres, 6), 6, kgPerM, 6, 6, `items[${index}].barem_weight`);
}

function normalizeReceiptItem(item: PurchaseItem, scale: number, index: number): PurchaseItem {
  if (!item.item_code || !item.warehouse) {
    throw errors.validation(`Item and warehouse are required at row ${index + 1}`);
  }
  const qty = toScaledInt(item.qty, 6, `items[${index}].qty`);
  if (qty <= 0) throw errors.validation(`Quantity must be positive at row ${index + 1}`);
  const rate = toScaledInt(item.rate, scale, `items[${index}].rate`);
  const valuation = item.valuation_rate ?? item.rate;
  const valuationMinor = toScaledInt(valuation, scale, `items[${index}].valuation_rate`);
  return {
    ...item,
    row_id: item.row_id || `ROW-${index + 1}`,
    qty: fromScaledInt(qty, 6),
    qty_micros: qty,
    rate: fromScaledInt(rate, scale),
    rate_minor: rate,
    valuation_rate: fromScaledInt(valuationMinor, scale),
    valuation_rate_minor: valuationMinor,
  };
}

async function supplierToleranceBps(
  context: ControllerContext<JsonObject>,
  supplier: string,
): Promise<number> {
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Supplier", supplier);
  const raw = master?.receipt_tolerance_pct;
  if (raw === undefined || raw === null || raw === "") return 0;
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw errors.validation("Supplier receipt_tolerance_pct must be numeric");
  }
  const bps = toScaledInt(raw, 2, "receipt_tolerance_pct");
  if (bps < 0 || bps > 10_000) throw errors.validation("Supplier receipt tolerance must be between 0 and 100 percent");
  return bps;
}

async function assertPurchasePostingUnlocked(
  context: ControllerContext<JsonObject>,
  company: string,
  postingAt: string,
): Promise<void> {
  if (context.command.actor.roles.includes("System Manager")
    || context.command.actor.user_id === "Administrator") return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && postingAt.slice(0, 10) <= lock) {
    throw errors.validation(`Posting date ${postingAt.slice(0, 10)} is locked for ${company}`);
  }
}

async function assertPurchaseMasters(
  context: ControllerContext<JsonObject>,
  records: Array<[string, string]>,
): Promise<void> {
  for (const [type, name] of new Map(records.map((row) => [`${row[0]}:${row[1]}`, row])).values()) {
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) {
      throw errors.reference(`${type} ${name} does not exist or is disabled`);
    }
  }
}

function addClaim(
  claims: Map<string, PurchaseAllocationRevisionClaim>,
  scopeType: "queue" | "window",
  scopeKey: string,
  expectedRevision: number,
  claimedAt: string,
): void {
  const key = `${scopeType}:${scopeKey}`;
  const existing = claims.get(key);
  if (existing && existing.expected_revision !== expectedRevision) {
    throw errors.validation(`Conflicting ${scopeType} revision inside one mutation plan`);
  }
  claims.set(key, {
    scope_type: scopeType,
    scope_key: scopeKey,
    expected_revision: expectedRevision,
    claimed_at: claimedAt,
  });
}

function requiredRowId(item: PurchaseItem, index: number): string {
  const rowId = item.row_id?.trim();
  if (!rowId) throw errors.validation(`Stable row_id is required at row ${index + 1}`);
  return rowId;
}

function purchaseWindowId(queueKey: string, sequence: number): string {
  return `PW-${queueKey.slice(0, 24)}-${String(sequence).padStart(6, "0")}`;
}

function allocationId(prefix: string, commandId: string, rowId: string, sequence?: number): string {
  return `${prefix}:${safeSegment(commandId)}:${safeSegment(rowId)}${sequence === undefined ? "" : `:${sequence}`}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 160);
}

function decimalField(value: unknown): DecimalInput | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stampedField(value: unknown): boolean | number | string | null | undefined {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string" || value === null) return value;
  return undefined;
}
