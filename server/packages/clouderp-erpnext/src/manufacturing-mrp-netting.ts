import type { JsonObject } from "../../contracts/src/index.js";
import { inventoryPosition } from "../../clouderp-stock/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import type { MrpExplosionResult, MrpRequirement } from "./manufacturing-mrp.js";

export interface NettedMrpRequirement extends JsonObject {
  requirement_type: MrpRequirement["requirement_type"];
  item_code: string;
  warehouse?: string;
  schedule_date?: string;
  gross_qty: string;
  gross_qty_micros: number;
  on_hand_before: string;
  on_hand_before_micros: number;
  allocated_on_hand: string;
  allocated_on_hand_micros: number;
  net_requirement: string;
  net_requirement_micros: number;
  source_count: number;
}

export interface MrpOnHandNettingResult extends JsonObject {
  schema_version: 1;
  production_plan: string;
  company: string;
  planning_date: string;
  netting_mode: "ON_HAND_ONLY_NOT_ATP";
  purchase_requirements: NettedMrpRequirement[];
  manufacture_requirements: NettedMrpRequirement[];
  warnings: string[];
}

export interface MrpProjectedAvailabilityInput extends JsonObject {
  on_hand_qty_micros: number;
  open_purchase_qty_micros?: number;
  open_manufacture_qty_micros?: number;
  reserved_qty_micros?: number;
  safety_stock_qty_micros?: number;
  /** False means a material fact is ambiguous; the netter must not reduce demand. */
  complete?: boolean;
  warnings?: string[];
}

export interface ProjectedNettedMrpRequirement extends JsonObject {
  requirement_type: MrpRequirement["requirement_type"];
  item_code: string;
  warehouse?: string;
  schedule_date?: string;
  gross_qty: string;
  gross_qty_micros: number;
  on_hand_qty: string;
  on_hand_qty_micros: number;
  open_purchase_qty: string;
  open_purchase_qty_micros: number;
  open_manufacture_qty: string;
  open_manufacture_qty_micros: number;
  reserved_qty: string;
  reserved_qty_micros: number;
  safety_stock_qty: string;
  safety_stock_qty_micros: number;
  projected_before_demand: string;
  projected_before_demand_micros: number;
  available_before: string;
  available_before_micros: number;
  allocated_projected: string;
  allocated_projected_micros: number;
  net_requirement: string;
  net_requirement_micros: number;
  source_count: number;
  availability_complete: boolean;
}

export interface MrpProjectedNettingResult extends JsonObject {
  schema_version: 1;
  production_plan: string;
  company: string;
  planning_date: string;
  /**
   * This is projected MATERIAL-PLANNING netting, not generic selling ATP.
   *
   * It uses only authoritative inputs explicitly supplied by the caller:
   * on-hand + dated open PO + dated open WO - active reservations - safety stock.
   */
  netting_mode: "PROJECTED_MRP_V1";
  purchase_requirements: ProjectedNettedMrpRequirement[];
  manufacture_requirements: ProjectedNettedMrpRequirement[];
  warnings: string[];
}

/**
 * Allocates canonical on-hand stock once across dated gross requirements.
 *
 * This is deliberately NOT ATP: no reservations, open PO/WO supply, lead time or safety
 * stock is silently inferred. It is safe as a planning preview and intentionally not the
 * source used by automatic Material Request conversion.
 */
export async function netMrpAgainstOnHand(
  mrp: MrpExplosionResult,
  getStockBalanceMicros: (itemCode: string, warehouse: string) => Promise<number>,
): Promise<MrpOnHandNettingResult> {
  const remaining = new Map<string, number>();
  const warnings = new Set<string>();
  const rows = sortedRows(mrp);

  const netted: NettedMrpRequirement[] = [];
  for (const row of rows) {
    const gross = safeNonNegative(row.gross_qty_micros, "gross MRP quantity");
    const warehouse = row.warehouse?.trim();
    if (!warehouse) {
      warnings.add(`UNALLOCATED_WAREHOUSE:${row.item_code}`);
      netted.push(toNetted(row, 0, 0, gross));
      continue;
    }
    const key = `${row.item_code}\u0000${warehouse}`;
    let available = remaining.get(key);
    if (available === undefined) {
      const raw = await getStockBalanceMicros(row.item_code, warehouse);
      available = Math.max(0, safeInteger(raw, "stock balance"));
    }
    const before = available;
    const allocated = Math.min(before, gross);
    const net = gross - allocated;
    remaining.set(key, before - allocated);
    netted.push(toNetted(row, before, allocated, net));
  }

  return {
    schema_version: 1,
    production_plan: mrp.production_plan,
    company: mrp.company,
    planning_date: mrp.planning_date,
    netting_mode: "ON_HAND_ONLY_NOT_ATP",
    purchase_requirements: netted.filter((row) => row.requirement_type === "Purchase"),
    manufacture_requirements: netted.filter((row) => row.requirement_type === "Manufacture"),
    warnings: [...warnings].sort(),
  };
}

/**
 * Nets gross MRP requirements against dated projected material availability.
 *
 * The callback returns a cumulative snapshot through each need date. We then subtract
 * quantities already allocated to earlier rows so one PO/WO/on-hand unit cannot satisfy
 * the plan twice. If the callback marks a snapshot incomplete, this function fails closed
 * for that row: gross demand is preserved rather than reduced by uncertain availability.
 */
export async function netMrpAgainstProjectedAvailability(
  mrp: MrpExplosionResult,
  getAvailability: (
    company: string,
    itemCode: string,
    warehouse: string,
    throughDate: string,
  ) => Promise<MrpProjectedAvailabilityInput>,
): Promise<MrpProjectedNettingResult> {
  const allocatedByKey = new Map<string, number>();
  const warnings = new Set<string>();
  const netted: ProjectedNettedMrpRequirement[] = [];

  for (const row of sortedRows(mrp)) {
    const gross = safeNonNegative(row.gross_qty_micros, "gross MRP quantity");
    const warehouse = row.warehouse?.trim();
    const throughDate = row.schedule_date ?? mrp.planning_date;
    if (!warehouse) {
      warnings.add(`UNALLOCATED_WAREHOUSE:${row.item_code}`);
      netted.push(toProjected(row, {
        onHand: 0, openPurchase: 0, openManufacture: 0, reserved: 0, safety: 0,
        projected: 0, available: 0, allocated: 0, net: gross, complete: false,
      }));
      continue;
    }

    const snapshot = await getAvailability(mrp.company, row.item_code, warehouse, throughDate);
    const onHand = safeInteger(snapshot.on_hand_qty_micros, "on_hand_qty_micros");
    const openPurchase = safeNonNegative(snapshot.open_purchase_qty_micros ?? 0, "open_purchase_qty_micros");
    const openManufacture = safeNonNegative(snapshot.open_manufacture_qty_micros ?? 0, "open_manufacture_qty_micros");
    const reserved = safeNonNegative(snapshot.reserved_qty_micros ?? 0, "reserved_qty_micros");
    const safety = safeNonNegative(snapshot.safety_stock_qty_micros ?? 0, "safety_stock_qty_micros");
    for (const warning of snapshot.warnings ?? []) warnings.add(String(warning));

    const position = inventoryPosition({
      on_hand_qty_micros: onHand,
      inbound_qty_micros: safeAdd([openPurchase, openManufacture], "projected inbound"),
      reserved_qty_micros: reserved,
    });
    const projected = position.projected_qty_micros;
    const key = `${row.item_code}\u0000${warehouse}`;
    const alreadyAllocated = allocatedByKey.get(key) ?? 0;
    const complete = snapshot.complete !== false;

    // Safety stock is a floor, not supply. Ambiguous snapshots never reduce demand.
    const usableCumulative = complete ? Math.max(0, safeAdd([projected, -safety], "projected availability")) : 0;
    const available = complete ? Math.max(0, safeAdd([usableCumulative, -alreadyAllocated], "remaining projected availability")) : 0;
    const allocated = Math.min(available, gross);
    const net = gross - allocated;
    allocatedByKey.set(key, safeAdd([alreadyAllocated, allocated], "allocated projected quantity"));

    netted.push(toProjected(row, {
      onHand, openPurchase, openManufacture, reserved, safety,
      projected, available, allocated, net, complete,
    }));
  }

  return {
    schema_version: 1,
    production_plan: mrp.production_plan,
    company: mrp.company,
    planning_date: mrp.planning_date,
    netting_mode: "PROJECTED_MRP_V1",
    purchase_requirements: netted.filter((row) => row.requirement_type === "Purchase"),
    manufacture_requirements: netted.filter((row) => row.requirement_type === "Manufacture"),
    warnings: [...warnings].sort(),
  };
}

export function materialRequestDraftsFromProjectedMrp(
  result: MrpProjectedNettingResult,
  requestedBy?: string,
): JsonObject[] {
  const drafts: JsonObject[] = [];
  for (const [type, rows] of [
    ["Purchase", result.purchase_requirements],
    ["Manufacture", result.manufacture_requirements],
  ] as const) {
    const required = rows.filter((row) => row.net_requirement_micros > 0);
    if (required.length === 0) continue;
    drafts.push({
      company: result.company,
      material_request_type: type,
      transaction_date: result.planning_date,
      ...(requestedBy ? { requested_by: requestedBy } : {}),
      mrp_source_doctype: "Production Plan",
      mrp_source_name: result.production_plan,
      mrp_schema_version: 1,
      mrp_netting_mode: result.netting_mode,
      note: `MRP ${type} requirement generated from Production Plan ${result.production_plan}; projected availability netting applied`,
      items: required.map((row, index) => ({
        row_id: `MRP-${type.toUpperCase()}-${index + 1}`,
        item_code: row.item_code,
        qty: row.net_requirement,
        ...(row.warehouse ? { warehouse: row.warehouse } : {}),
        ...(row.schedule_date ? { schedule_date: row.schedule_date } : {}),
        note: `${row.source_count} MRP source path${row.source_count === 1 ? "" : "s"}; gross ${row.gross_qty}; projected allocation ${row.allocated_projected}`,
      })),
    });
  }
  return drafts;
}

function sortedRows(mrp: MrpExplosionResult): Array<MrpRequirement & { requirement_type: "Purchase" | "Manufacture" }> {
  return [
    ...mrp.purchase_requirements.map((row) => ({ ...row, requirement_type: "Purchase" as const })),
    ...mrp.manufacture_requirements.map((row) => ({ ...row, requirement_type: "Manufacture" as const })),
  ].sort((a, b) => (a.schedule_date ?? mrp.planning_date).localeCompare(b.schedule_date ?? mrp.planning_date)
    || a.item_code.localeCompare(b.item_code)
    || a.requirement_type.localeCompare(b.requirement_type));
}

function toNetted(
  row: MrpRequirement & { requirement_type: "Purchase" | "Manufacture" },
  before: number,
  allocated: number,
  net: number,
): NettedMrpRequirement {
  return {
    requirement_type: row.requirement_type,
    item_code: row.item_code,
    ...(row.warehouse ? { warehouse: row.warehouse } : {}),
    ...(row.schedule_date ? { schedule_date: row.schedule_date } : {}),
    gross_qty: row.gross_qty,
    gross_qty_micros: row.gross_qty_micros,
    on_hand_before: fromScaledInt(before, 6),
    on_hand_before_micros: before,
    allocated_on_hand: fromScaledInt(allocated, 6),
    allocated_on_hand_micros: allocated,
    net_requirement: fromScaledInt(net, 6),
    net_requirement_micros: net,
    source_count: row.source_count,
  };
}

function toProjected(
  row: MrpRequirement & { requirement_type: "Purchase" | "Manufacture" },
  value: {
    onHand: number;
    openPurchase: number;
    openManufacture: number;
    reserved: number;
    safety: number;
    projected: number;
    available: number;
    allocated: number;
    net: number;
    complete: boolean;
  },
): ProjectedNettedMrpRequirement {
  return {
    requirement_type: row.requirement_type,
    item_code: row.item_code,
    ...(row.warehouse ? { warehouse: row.warehouse } : {}),
    ...(row.schedule_date ? { schedule_date: row.schedule_date } : {}),
    gross_qty: row.gross_qty,
    gross_qty_micros: row.gross_qty_micros,
    on_hand_qty: fromScaledInt(value.onHand, 6),
    on_hand_qty_micros: value.onHand,
    open_purchase_qty: fromScaledInt(value.openPurchase, 6),
    open_purchase_qty_micros: value.openPurchase,
    open_manufacture_qty: fromScaledInt(value.openManufacture, 6),
    open_manufacture_qty_micros: value.openManufacture,
    reserved_qty: fromScaledInt(value.reserved, 6),
    reserved_qty_micros: value.reserved,
    safety_stock_qty: fromScaledInt(value.safety, 6),
    safety_stock_qty_micros: value.safety,
    projected_before_demand: fromScaledInt(value.projected, 6),
    projected_before_demand_micros: value.projected,
    available_before: fromScaledInt(value.available, 6),
    available_before_micros: value.available,
    allocated_projected: fromScaledInt(value.allocated, 6),
    allocated_projected_micros: value.allocated,
    net_requirement: fromScaledInt(value.net, 6),
    net_requirement_micros: value.net,
    source_count: row.source_count,
    availability_complete: value.complete,
  };
}

function safeNonNegative(value: unknown, field: string): number {
  const parsed = safeInteger(value, field);
  if (parsed < 0) throw errors.validation(`${field} cannot be negative`);
  return parsed;
}

function safeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
  return value;
}

function safeAdd(values: number[], field: string): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) throw errors.validation(`${field} exceeds safe integer bounds`);
  }
  return total;
}
