import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { VersionedBomData } from "./manufacturing-lifecycle.js";
import type { ManufacturingGenealogyMovement, WorkOrderGenealogy } from "./manufacturing-genealogy.js";
import type { WorkOrderData } from "./types.js";

export interface ManufacturingCostEvidence extends JsonObject {
  schema_version: 1;
  evidence_scope: "READ_ONLY_CANONICAL_LEDGER";
  posting_status: "NOT_POSTED";
  work_order: string;
  company: string;
  production_item: string;
  bom_no: string;
  bom_revision: number;
  bom_checksum: string;
  currency: string;
  currency_scale: number;
  target_qty: string;
  target_qty_micros: number;
  produced_qty: string;
  produced_qty_micros: number;
  completion_pct: string;
  standard_material_cost_minor: number;
  standard_operating_cost_minor: number;
  standard_total_cost_minor: number;
  actual_consumption_value_minor: number;
  actual_recovery_value_minor: number;
  actual_net_material_cost_minor: number;
  actual_finished_good_value_minor: number;
  actual_accounted_output_value_minor: number;
  implied_operating_cost_minor: number;
  material_variance_minor: number;
  operation_variance_minor: number;
  total_variance_minor: number;
  material_recovery_credit_minor: number;
  actual_operation_cost_source: "IMPLIED_FROM_CANONICAL_FG_VALUATION" | "NOT_AVAILABLE";
  warnings: string[];
}

/**
 * Read-only cost evidence for one Work Order.
 *
 * Standard cost comes from the exact submitted BOM checksum captured by the Work Order.
 * Actual cost comes from canonical Stock Ledger movements already projected by genealogy.
 * Scrap/offcut/recovery is a stock-value credit: net material cost is consumption less
 * recovery and the implied operation component reconciles all canonical outputs back to
 * that net material cost. No Cost Sheet table and no GL posting are created here;
 * posting/period semantics remain explicit Finance/Inventory dependencies instead of
 * becoming a second accounting authority inside Manufacturing.
 */
export function buildManufacturingCostEvidence(
  workOrder: CanonicalDocument<WorkOrderData>,
  bom: CanonicalDocument<VersionedBomData>,
  genealogy: WorkOrderGenealogy,
): ManufacturingCostEvidence {
  if (workOrder.doctype !== "Work Order") throw errors.reference("Manufacturing cost evidence requires a Work Order");
  if (bom.doctype !== "Bill of Materials" || bom.docstatus !== 1) throw errors.reference("Manufacturing cost evidence requires a submitted BOM");
  if (genealogy.work_order !== workOrder.name) throw errors.reference("Genealogy does not belong to the Work Order");
  const workData = workOrder.data as WorkOrderData & { bom_checksum?: string; bom_revision?: number };
  const bomData = bom.data;
  const checksum = text(workData.bom_checksum);
  if (!checksum || checksum !== text(bomData.bom_checksum)) throw errors.reference("Work Order BOM checksum does not match submitted BOM evidence");
  if (workData.bom_no !== bom.name || workData.company !== bomData.company || workData.production_item !== bomData.item) {
    throw errors.reference("Work Order and BOM identity do not match");
  }

  const scale = Number.isSafeInteger(bomData.currency_scale) ? Number(bomData.currency_scale) : 2;
  const currency = text(bomData.currency) || "USD";
  const targetQty = positiveScaled(workData.qty_micros, workData.qty, "Work Order quantity");
  const bomQty = positiveScaled(bomData.quantity_micros, bomData.quantity, "BOM quantity");
  const producedQty = sumMovementQty(genealogy.finished_goods);
  if (producedQty > targetQty) throw errors.ledger("Finished-good genealogy quantity exceeds Work Order target");

  const standardMaterialFull = integerMinor(bomData.raw_material_cost_minor ?? 0, "BOM raw material cost");
  const standardOperatingFull = integerMinor(bomData.operating_cost_minor ?? 0, "BOM operating cost");
  const standardMaterial = prorateMinor(standardMaterialFull, producedQty, bomQty);
  const standardOperating = prorateMinor(standardOperatingFull, producedQty, bomQty);
  const standardTotal = safeAdd(standardMaterial, standardOperating);

  const consumptionValue = sumAbsOutwardValue(genealogy.consumptions);
  const recoveryValue = sumInwardValue(genealogy.recoveries);
  const netMaterialCost = safeSubtract(consumptionValue, recoveryValue);
  const finishedValue = sumInwardValue(genealogy.finished_goods);
  const accountedOutputValue = safeAdd(finishedValue, recoveryValue);
  const impliedOperating = producedQty > 0 ? safeSubtract(accountedOutputValue, consumptionValue) : 0;
  const materialVariance = safeSubtract(netMaterialCost, standardMaterial);
  const operationVariance = safeSubtract(impliedOperating, standardOperating);
  const variance = safeSubtract(finishedValue, standardTotal);
  const decomposedVariance = safeAdd(materialVariance, operationVariance);
  if (decomposedVariance !== variance) {
    throw errors.ledger(
      `Manufacturing cost variance decomposition does not reconcile to canonical finished-good value: material=${materialVariance}, operation=${operationVariance}, total=${variance}, decomposed=${decomposedVariance}`,
    );
  }

  const warnings = new Set<string>();
  if (producedQty === 0) warnings.add("NO_FINISHED_GOOD_COST_EVIDENCE");
  if (netMaterialCost < 0) warnings.add("RECOVERY_EXCEEDS_CONSUMPTION_VALUE");
  if (impliedOperating < 0) warnings.add("NEGATIVE_IMPLIED_OPERATING_COST");
  if (genealogy.warnings.includes("UNTRACKED_INPUT_MATERIALS_PRESENT")) warnings.add("INPUT_TRACEABILITY_INCOMPLETE");
  if (genealogy.warnings.includes("UNTRACKED_FINISHED_GOODS_PRESENT")) warnings.add("OUTPUT_TRACEABILITY_INCOMPLETE");

  return {
    schema_version: 1,
    evidence_scope: "READ_ONLY_CANONICAL_LEDGER",
    posting_status: "NOT_POSTED",
    work_order: workOrder.name,
    company: workData.company,
    production_item: workData.production_item,
    bom_no: bom.name,
    bom_revision: bomData.revision ?? workData.bom_revision ?? 1,
    bom_checksum: checksum,
    currency,
    currency_scale: scale,
    target_qty: fromScaledInt(targetQty, 6),
    target_qty_micros: targetQty,
    produced_qty: fromScaledInt(producedQty, 6),
    produced_qty_micros: producedQty,
    completion_pct: completionPct(producedQty, targetQty),
    standard_material_cost_minor: standardMaterial,
    standard_operating_cost_minor: standardOperating,
    standard_total_cost_minor: standardTotal,
    actual_consumption_value_minor: consumptionValue,
    actual_recovery_value_minor: recoveryValue,
    actual_net_material_cost_minor: netMaterialCost,
    actual_finished_good_value_minor: finishedValue,
    actual_accounted_output_value_minor: accountedOutputValue,
    implied_operating_cost_minor: impliedOperating,
    material_variance_minor: materialVariance,
    operation_variance_minor: operationVariance,
    total_variance_minor: variance,
    material_recovery_credit_minor: recoveryValue,
    actual_operation_cost_source: producedQty > 0 ? "IMPLIED_FROM_CANONICAL_FG_VALUATION" : "NOT_AVAILABLE",
    warnings: [...warnings].sort(),
  };
}

function sumMovementQty(rows: ManufacturingGenealogyMovement[]): number {
  return rows.reduce((sum, row) => safeAdd(sum, row.qty_micros), 0);
}

function sumAbsOutwardValue(rows: ManufacturingGenealogyMovement[]): number {
  return rows.reduce((sum, row) => safeAdd(sum, Math.abs(integerMinor(row.stock_value_difference_minor, "stock value"))), 0);
}

function sumInwardValue(rows: ManufacturingGenealogyMovement[]): number {
  return rows.reduce((sum, row) => safeAdd(sum, Math.max(0, integerMinor(row.stock_value_difference_minor, "stock value"))), 0);
}

function prorateMinor(fullBomCostMinor: number, qtyMicros: number, bomQtyMicros: number): number {
  if (qtyMicros === 0) return 0;
  return safeNumber(divideRounded(BigInt(fullBomCostMinor) * BigInt(qtyMicros), BigInt(bomQtyMicros)));
}

function completionPct(produced: number, target: number): string {
  if (target <= 0) return "0.000000";
  const micros = safeNumber(divideRounded(BigInt(produced) * 100_000_000n, BigInt(target)));
  return fromScaledInt(micros, 6);
}

function positiveScaled(micros: unknown, decimal: unknown, field: string): number {
  if (typeof micros === "number" && Number.isSafeInteger(micros) && micros > 0) return micros;
  if (typeof decimal === "number" || typeof decimal === "string") {
    const value = toScaledInt(decimal, 6, field);
    if (value <= 0) throw errors.validation(`${field} must be positive`);
    return value;
  }
  throw errors.validation(`${field} is required`);
}

function integerMinor(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw errors.validation(`${field} must use integer minor units`);
  return value;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Manufacturing cost arithmetic exceeds safe integer range");
  return value;
}

function safeSubtract(left: number, right: number): number {
  return safeAdd(left, -right);
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw errors.validation("Manufacturing cost divisor must be positive");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Manufacturing cost arithmetic exceeds safe integer range");
  return number;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
