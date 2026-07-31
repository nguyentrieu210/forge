import type { CanonicalDocument } from "../../contracts/src/index.js";
import type { StockEntryData } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import {
  ManufacturingStockEntryController,
  type ManufacturingRowKind,
} from "./manufacturing-lifecycle.js";

interface SnapshotRow {
  bom_row_id: string;
  required_qty_micros: number;
}

interface SnapshotData extends StockEntryData {
  manufacturing_snapshot?: { bom_checksum: string; rows: SnapshotRow[] };
  bom_checksum?: string;
}

interface ProgressRow {
  row_id: string;
  item_code: string;
  qty: string | number;
  qty_micros?: number;
  bom_row_id?: string;
  manufacturing_kind?: ManufacturingRowKind;
  work_order_bom_checksum?: string;
}

interface ProgressDocument extends StockEntryData {
  items: ProgressRow[];
}

/** Final aggregate guard after row normalization, including multiple lines in one voucher. */
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
