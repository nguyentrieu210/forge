import type { JsonObject } from "../../contracts/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import type { WorkOrderData, WorkOrderRequiredItem } from "./types.js";
import {
  SnapshotWorkOrderController,
  type BomQuantityBasis,
  type VersionedBomData,
} from "./manufacturing-lifecycle.js";

interface SnapshotRow extends JsonObject {
  bom_row_id: string;
  item_code: string;
  qty_basis: BomQuantityBasis;
  bom_stock_qty_micros: number;
  required_qty_micros: number;
  source_warehouse: string;
  standard_rate_minor?: number;
  standard_cost_minor?: number;
}

interface ManufacturingSnapshot extends JsonObject {
  output_qty_micros: number;
  work_order_qty_micros: number;
  width_micros?: number;
  height_micros?: number;
  leaf_count_micros?: number;
  rows: SnapshotRow[];
}

interface GuardedWorkOrderData extends WorkOrderData {
  bom_no: string;
  manufacturing_snapshot?: ManufacturingSnapshot;
}

/**
 * Work Order quantity is expressed in the finished Item's stock UOM. Therefore BOM
 * scaling must divide by the BOM output converted to stock UOM, not by the transaction
 * quantity printed on the BOM. A 2-box BOM with 10 pieces per box represents 20 pieces,
 * not two unusually influential boxes.
 *
 * The same release boundary also snapshots standard material/operation cost. Costing
 * reports must never look back at a later-edited BOM and pretend its new rates were the
 * rates approved when the Work Order was released.
 */
export class StockUomSnapshotWorkOrderController extends SnapshotWorkOrderController {
  override async normalize(context: ControllerContext<WorkOrderData>): Promise<WorkOrderData> {
    const normalized = await super.normalize(context) as GuardedWorkOrderData;
    const snapshot = normalized.manufacturing_snapshot;
    if (!snapshot) throw errors.reference(`Work Order ${context.command.aggregate.name} has no manufacturing snapshot`);
    if (!Number.isSafeInteger(snapshot.output_qty_micros) || snapshot.output_qty_micros <= 0) {
      throw errors.validation("BOM output stock quantity must be positive");
    }

    const bom = await context.reader.getDocument<VersionedBomData>(
      context.command.tenant_id,
      "Bill of Materials",
      normalized.bom_no,
    );
    if (!bom || bom.docstatus !== 1) throw errors.reference(`Bill of Materials ${normalized.bom_no} must be submitted`);
    const bomRows = new Map(bom.data.items.map((row, index) => [row.row_id || `ROW-${index + 1}`, row]));

    const rows: SnapshotRow[] = snapshot.rows.map((row, index) => {
      const requiredQty = scaleRequiredQuantity(row, snapshot, index);
      const source = bomRows.get(row.bom_row_id);
      const standardRateMinor = safeNonNegative(source?.rate_minor ?? 0, `BOM row ${row.bom_row_id} rate`);
      const standardCostMinor = safeNumber(divideRounded(
        BigInt(standardRateMinor) * BigInt(requiredQty),
        1_000_000n,
      ));
      return {
        ...row,
        required_qty_micros: requiredQty,
        standard_rate_minor: standardRateMinor,
        standard_cost_minor: standardCostMinor,
      };
    });
    const requiredItems: WorkOrderRequiredItem[] = rows.map((row) => ({
      row_id: row.bom_row_id,
      item_code: row.item_code,
      required_qty: fromScaledInt(row.required_qty_micros, 6),
      required_qty_micros: row.required_qty_micros,
      source_warehouse: row.source_warehouse,
    }));

    const operatingCostMinor = scaleMinor(
      bom.data.operating_cost_minor ?? 0,
      snapshot.work_order_qty_micros,
      snapshot.output_qty_micros,
    );
    const standardMaterialCostMinor = rows.reduce(
      (sum, row) => safeAdd(sum, row.standard_cost_minor ?? 0),
      0,
    );
    const standardTotalCostMinor = safeAdd(standardMaterialCostMinor, operatingCostMinor);
    const currencyScale = Number.isSafeInteger(bom.data.currency_scale) ? Number(bom.data.currency_scale) : 2;
    const currency = typeof bom.data.currency === "string" && bom.data.currency.trim() ? bom.data.currency.trim() : "USD";

    return {
      ...normalized,
      required_items: requiredItems,
      operating_cost_minor: operatingCostMinor,
      costing_currency: currency,
      costing_currency_scale: currencyScale,
      standard_material_cost: fromScaledInt(standardMaterialCostMinor, currencyScale),
      standard_material_cost_minor: standardMaterialCostMinor,
      standard_operating_cost: fromScaledInt(operatingCostMinor, currencyScale),
      standard_operating_cost_minor: operatingCostMinor,
      standard_total_cost: fromScaledInt(standardTotalCostMinor, currencyScale),
      standard_total_cost_minor: standardTotalCostMinor,
      costing_snapshot_version: 1,
      manufacturing_snapshot: {
        ...snapshot,
        rows,
      },
    };
  }
}

function scaleRequiredQuantity(row: SnapshotRow, snapshot: ManufacturingSnapshot, index: number): number {
  const basis = basisMicros(row.qty_basis, snapshot, index);
  return safeNumber(divideRounded(
    BigInt(row.bom_stock_qty_micros) * BigInt(snapshot.work_order_qty_micros) * BigInt(basis),
    BigInt(snapshot.output_qty_micros) * 1_000_000n,
  ));
}

function basisMicros(basis: BomQuantityBasis, snapshot: ManufacturingSnapshot, index: number): number {
  if (basis === "Cố định") return 1_000_000;
  if (basis === "Theo chiều rộng") return required(snapshot.width_micros, "width_m", index);
  if (basis === "Theo chiều cao") return required(snapshot.height_micros, "height_m", index);
  if (basis === "Theo số lá") return required(snapshot.leaf_count_micros, "leaf_count", index);
  return safeNumber(divideRounded(
    BigInt(required(snapshot.width_micros, "width_m", index))
      * BigInt(required(snapshot.height_micros, "height_m", index)),
    1_000_000n,
  ));
}

function required(value: number | undefined, field: string, index: number): number {
  if (value === undefined) throw errors.validation(`Work Order requires ${field} for BOM row ${index + 1}`);
  return value;
}

function scaleMinor(value: number, numerator: number, denominator: number): number {
  return safeNumber(divideRounded(BigInt(value) * BigInt(numerator), BigInt(denominator)));
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  return (numerator + denominator / 2n) / denominator;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Manufacturing cost exceeds safe integer range");
  return value;
}

function safeNonNegative(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw errors.validation(`${label} must be a non-negative safe integer`);
  return value;
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Manufacturing quantity exceeds safe integer range");
  return number;
}