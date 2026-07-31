import type {
  CanonicalDocument,
  JsonObject,
  ManufacturingEntry,
  MutationPlan,
  StockLedgerEntry,
} from "../../contracts/src/index.js";
import type { StockEntryData } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import {
  ManufacturingStockEntryController,
  type ManufacturingRowKind,
} from "./manufacturing-lifecycle.js";

interface SnapshotRow extends JsonObject {
  bom_row_id: string;
  required_qty_micros: number;
}

interface SnapshotData extends JsonObject {
  manufacturing_snapshot?: { bom_checksum: string; rows: SnapshotRow[] };
  bom_checksum?: string;
}

interface ProgressRow extends JsonObject {
  row_id: string;
  item_code: string;
  qty: string | number;
  qty_micros?: number;
  target_warehouse?: string;
  bom_row_id?: string;
  manufacturing_kind?: ManufacturingRowKind;
  work_order_bom_checksum?: string;
}

interface ProgressDocument extends StockEntryData {
  items: ProgressRow[];
}

/**
 * Final aggregate guard after row normalization.
 *
 * It prevents split rows from exceeding one BOM row and rebalances the value retained
 * in scrap/offcut warehouses out of the finished-good valuation. Quantity/value still
 * live in the existing append-only stock ledger; no parallel manufacturing ledger is
 * introduced merely because humans enjoy reconciling avoidable duplicates.
 */
export class GuardedManufacturingStockEntryController extends ManufacturingStockEntryController {
  override async normalize(context: ControllerContext<StockEntryData>): Promise<StockEntryData> {
    const normalized = await super.normalize(context) as ProgressDocument;
    if (!normalized.work_order || !["Material Transfer", "Manufacture"].includes(normalized.purpose)) return normalized;

    const workOrder = await context.reader.getDocument<SnapshotData>(
      context.command.tenant_id,
      "Work Order",
      normalized.work_order,
    );
    if (!workOrder || workOrder.docstatus !== 1 || !workOrder.data.manufacturing_snapshot) {
      throw errors.reference(`Work Order ${normalized.work_order} does not contain an immutable BOM snapshot`);
    }
    const snapshot = workOrder.data.manufacturing_snapshot;
    const documents = await context.reader.listDocumentsByDoctype<ProgressDocument>(context.command.tenant_id, "Stock Entry");
    const pending = new Map<string, number>();

    for (const [index, row] of normalized.items.entries()) {
      const rowId = row.bom_row_id;
      if (!rowId) throw errors.reference(`Dòng ${index + 1} thiếu bom_row_id sau chuẩn hoá`);
      if (row.work_order_bom_checksum !== snapshot.bom_checksum) {
        throw errors.reference(`Dòng ${index + 1} không khớp checksum BOM của Work Order`);
      }
      const bucket = row.manufacturing_kind === "Issue" ? "Issue" : "Consumption";
      const key = `${bucket}:${rowId}`;
      const qty = row.qty_micros ?? toScaledInt(row.qty, 6, `items[${index}].qty`);
      pending.set(key, (pending.get(key) ?? 0) + qty);
    }

    for (const [key, requested] of pending) {
      const [bucket, rowId] = key.split(":") as ["Issue" | "Consumption", string];
      const required = snapshot.rows.find((row) => row.bom_row_id === rowId);
      if (!required) throw errors.reference(`BOM row ${rowId} is not present in the Work Order snapshot`);
      const prior = sumPrior(documents, normalized.work_order, rowId, bucket, context.command.aggregate.name);
      if (context.command.action === "submit" && prior + requested > required.required_qty_micros) {
        throw errors.reference(`BOM row ${rowId} exceeds the Work Order snapshot`, {
          required_qty_micros: required.required_qty_micros,
          prior_qty_micros: prior,
          requested_qty_micros: requested,
        });
      }
    }
    return normalized;
  }

  override async buildPlan(context: ControllerContext<StockEntryData>): Promise<MutationPlan<StockEntryData>> {
    const plan = await super.buildPlan(context);
    const data = plan.document.data as ProgressDocument;

    if (context.command.action === "cancel" && data.purpose === "Material Transfer" && data.work_order) {
      const reversals: ManufacturingEntry[] = data.items
        .filter((row) => (row.manufacturing_kind ?? "Issue") === "Issue")
        .map((row, index) => ({
          line_key: `REV-ISSUE-${row.bom_row_id ?? row.row_id ?? index + 1}-${row.row_id ?? index + 1}`,
          work_order: data.work_order!,
          kind: "Material Transfer",
          item_code: row.item_code,
          qty_micros: -(row.qty_micros ?? toScaledInt(row.qty, 6, `items[${index}].qty`)),
          posting_at: data.posting_at,
        }));
      return {
        ...plan,
        manufacturing_entries: [...(plan.manufacturing_entries ?? []), ...reversals],
      };
    }

    if (context.command.action === "submit" && data.purpose === "Material Transfer") {
      return {
        ...plan,
        manufacturing_entries: uniqueIssueLineKeys(plan.manufacturing_entries ?? [], data.items),
      };
    }

    if (context.command.action !== "submit" || data.purpose !== "Manufacture") return plan;

    const recoveryPrefixes = data.items
      .filter((row) => (row.manufacturing_kind === "Scrap" || row.manufacturing_kind === "Offcut") && row.target_warehouse)
      .map((row) => `TGT-${row.row_id}`);
    if (recoveryPrefixes.length === 0) return plan;

    const stockEntries = plan.stock_entries ?? [];
    const recoveredValueMinor = stockEntries
      .filter((line) => recoveryPrefixes.some((prefix) => line.line_key.startsWith(prefix)))
      .reduce((sum, line) => sum + Math.max(0, line.stock_value_difference_minor), 0);
    if (recoveredValueMinor === 0) return plan;

    return {
      ...plan,
      stock_entries: rebalanceFinishedValue(stockEntries, recoveredValueMinor),
    };
  }
}

function uniqueIssueLineKeys(entries: ManufacturingEntry[], rows: ProgressRow[]): ManufacturingEntry[] {
  let issueIndex = 0;
  return entries.map((entry) => {
    if (entry.kind !== "Material Transfer" || !entry.line_key.startsWith("ISSUE-")) return entry;
    const row = rows[issueIndex];
    const index = issueIndex;
    issueIndex += 1;
    if (!row) throw errors.validation("Material Transfer progress does not match normalized rows");
    return {
      ...entry,
      line_key: `ISSUE-${row.bom_row_id ?? row.row_id ?? index + 1}-${row.row_id ?? index + 1}`,
    };
  });
}

function rebalanceFinishedValue(entries: StockLedgerEntry[], recoveredValueMinor: number): StockLedgerEntry[] {
  const finishedIndexes = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.line_key.startsWith("FINISHED") && entry.actual_qty_micros > 0);
  if (finishedIndexes.length === 0) throw errors.validation("Manufacture recovery requires a finished-good stock posting");

  const oldFinishedValue = finishedIndexes.reduce(
    (sum, { entry }) => sum + Math.max(0, entry.stock_value_difference_minor),
    0,
  );
  const correctedValue = oldFinishedValue - recoveredValueMinor;
  if (correctedValue < 0) {
    throw errors.validation("Recovered scrap/offcut value cannot exceed total finished-good value");
  }
  const totalQty = finishedIndexes.reduce((sum, { entry }) => sum + entry.actual_qty_micros, 0);
  if (totalQty <= 0) throw errors.validation("Finished-good quantity must be positive");

  const result = [...entries];
  let assigned = 0;
  for (const [position, { entry, index }] of finishedIndexes.entries()) {
    const isLast = position === finishedIndexes.length - 1;
    const value = isLast
      ? correctedValue - assigned
      : safeNumber(divideRounded(BigInt(correctedValue) * BigInt(entry.actual_qty_micros), BigInt(totalQty)));
    assigned += value;
    const rate = safeNumber(divideRounded(BigInt(value) * 1_000_000n, BigInt(entry.actual_qty_micros)));
    result[index] = {
      ...entry,
      valuation_rate_minor: rate,
      stock_value_difference_minor: value,
    };
  }
  return result;
}

function sumPrior(
  documents: Array<CanonicalDocument<ProgressDocument>>,
  workOrder: string,
  bomRowId: string,
  bucket: "Issue" | "Consumption",
  excludeName: string,
): number {
  let total = 0;
  for (const document of documents) {
    if (document.name === excludeName || document.docstatus !== 1 || document.data.work_order !== workOrder) continue;
    for (const row of document.data.items ?? []) {
      const rowBucket = row.manufacturing_kind === "Issue" ? "Issue" : "Consumption";
      if (row.bom_row_id !== bomRowId || rowBucket !== bucket) continue;
      total += row.qty_micros ?? toScaledInt(row.qty, 6, "prior manufacturing quantity");
    }
  }
  return total;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  return (numerator + denominator / 2n) / denominator;
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Stock value exceeds safe integer range");
  return number;
}
