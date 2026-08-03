import type { JsonObject } from "../../contracts/src/index.js";
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

/**
 * Allocates canonical on-hand stock once across dated gross requirements.
 *
 * This is deliberately NOT ATP: no reservations, open PO/WO supply, lead time or safety
 * stock is silently inferred. It is safe as a planning preview and intentionally not the
 * source used by automatic Material Request conversion until WS04 exposes reserved/
 * projected inventory contracts.
 */
export async function netMrpAgainstOnHand(
  mrp: MrpExplosionResult,
  getStockBalanceMicros: (itemCode: string, warehouse: string) => Promise<number>,
): Promise<MrpOnHandNettingResult> {
  const remaining = new Map<string, number>();
  const warnings = new Set<string>();
  const rows = [
    ...mrp.purchase_requirements.map((row) => ({ ...row, requirement_type: "Purchase" as const })),
    ...mrp.manufacture_requirements.map((row) => ({ ...row, requirement_type: "Manufacture" as const })),
  ].sort((a, b) => (a.schedule_date ?? mrp.planning_date).localeCompare(b.schedule_date ?? mrp.planning_date)
    || a.item_code.localeCompare(b.item_code)
    || a.requirement_type.localeCompare(b.requirement_type));

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

function safeNonNegative(value: unknown, field: string): number {
  const parsed = safeInteger(value, field);
  if (parsed < 0) throw errors.validation(`${field} cannot be negative`);
  return parsed;
}

function safeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
  return value;
}
