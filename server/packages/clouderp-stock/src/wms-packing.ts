import { errors } from "../../core/src/index.js";

export interface PickedStockLine {
  item_code: string;
  warehouse: string;
  picked_qty_micros: number;
  batch_no?: string;
  serial_no?: string;
}

export interface PackedStockLine {
  item_code: string;
  warehouse: string;
  packed_qty_micros: number;
  batch_no?: string;
  serial_no?: string;
}

export interface PackageInput {
  package_id: string;
  lines: PackedStockLine[];
}

export interface PackingValidation {
  package_count: number;
  picked_qty_micros: number;
  packed_qty_micros: number;
  remaining_qty_micros: number;
  complete: boolean;
}

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function qty(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw errors.validation(`${field} must be a positive safe integer`);
  return value;
}
function identity(line: { item_code: string; warehouse: string; batch_no?: string; serial_no?: string }): string {
  return [text(line.item_code), text(line.warehouse), text(line.batch_no), text(line.serial_no)].join("\u0000");
}

/** Validates packing against already-picked physical stock without posting inventory. */
export function validatePacking(picked: PickedStockLine[], packages: PackageInput[]): PackingValidation {
  const pickedByKey = new Map<string, number>();
  let pickedTotal = 0;
  for (const [index, line] of picked.entries()) {
    if (!text(line.item_code) || !text(line.warehouse)) throw errors.validation(`picked[${index}] requires item_code and warehouse`);
    const amount = qty(line.picked_qty_micros, `picked[${index}].picked_qty_micros`);
    if (line.serial_no && amount !== 1_000_000) throw errors.validation(`Serial ${line.serial_no} picked quantity must equal one unit`);
    const key = identity(line);
    if (pickedByKey.has(key)) throw errors.validation(`Duplicate picked identity ${key.replaceAll("\u0000", "/")}`);
    pickedByKey.set(key, amount);
    pickedTotal += amount;
    if (!Number.isSafeInteger(pickedTotal)) throw errors.validation("Picked total exceeds safe integer bounds");
  }

  const packageIds = new Set<string>();
  const packedByKey = new Map<string, number>();
  let packedTotal = 0;
  for (const [packageIndex, pkg] of packages.entries()) {
    const packageId = text(pkg.package_id);
    if (!packageId) throw errors.validation(`packages[${packageIndex}].package_id is required`);
    if (packageIds.has(packageId)) throw errors.validation(`Duplicate package ${packageId}`);
    packageIds.add(packageId);
    if (!Array.isArray(pkg.lines) || pkg.lines.length === 0) throw errors.validation(`Package ${packageId} requires at least one line`);
    for (const [lineIndex, line] of pkg.lines.entries()) {
      const amount = qty(line.packed_qty_micros, `packages[${packageIndex}].lines[${lineIndex}].packed_qty_micros`);
      const key = identity(line);
      const pickedQty = pickedByKey.get(key);
      if (pickedQty === undefined) throw errors.reference(`Packed line ${key.replaceAll("\u0000", "/")} was not picked`);
      if (line.serial_no && amount !== 1_000_000) throw errors.validation(`Serial ${line.serial_no} packed quantity must equal one unit`);
      const cumulative = (packedByKey.get(key) ?? 0) + amount;
      if (!Number.isSafeInteger(cumulative) || cumulative > pickedQty) {
        throw errors.reference(`Packed quantity exceeds picked quantity for ${key.replaceAll("\u0000", "/")}`);
      }
      packedByKey.set(key, cumulative);
      packedTotal += amount;
      if (!Number.isSafeInteger(packedTotal)) throw errors.validation("Packed total exceeds safe integer bounds");
    }
  }

  return {
    package_count: packages.length,
    picked_qty_micros: pickedTotal,
    packed_qty_micros: packedTotal,
    remaining_qty_micros: pickedTotal - packedTotal,
    complete: packedTotal === pickedTotal,
  };
}
