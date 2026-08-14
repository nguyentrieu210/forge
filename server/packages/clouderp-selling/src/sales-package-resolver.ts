import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";

export type SalesPackageSelectionMode = "ALL" | "SELECTABLE";
export type SalesPackageQuantityBasis = "FIXED" | "HEIGHT" | "WIDTH" | "CUT_WIDTH" | "AREA" | "SET_COUNT" | "LEAF_COUNT";

export interface SalesPackageComponentSnapshot extends JsonObject {
  component_key: string;
  item_code: string;
  uom: string;
  qty_basis: SalesPackageQuantityBasis;
  factor: string;
  factor_micros: number;
  qty: string;
  qty_micros: number;
  required: boolean;
  default_selected: boolean;
  deduct_from_parent: boolean;
  deduct_from_discount_basis: boolean;
  inherit_color: boolean;
  inherit_dimensions: boolean;
  inherit_set_count: boolean;
  display_label?: string;
  sales_option?: string;
  role?: string;
}

export interface ResolvedSalesPackage extends JsonObject {
  sales_package: string;
  sales_package_version?: number;
  sales_package_checksum: string;
  selection_mode: SalesPackageSelectionMode;
  components: SalesPackageComponentSnapshot[];
}

export interface SalesPackageResolveInput {
  packageName: string;
  postingDate: string;
  itemCode: string;
  facts: Record<string, unknown>;
}

const ONE = 1_000_000;

/**
 * Resolve a commercial fulfillment package from master data.
 *
 * This resolver deliberately knows nothing about door brands or vertical labels. It maps
 * deterministic measurement facts into physical fulfillment quantities and snapshots the
 * exact package version/checksum so future master-data edits cannot mutate old orders.
 */
export async function resolveSalesPackage(
  context: ControllerContext<JsonObject>,
  input: SalesPackageResolveInput,
): Promise<ResolvedSalesPackage> {
  const packageName = text(input.packageName);
  if (!packageName) throw errors.validation("Sales Package is required");
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Sales Package", packageName);
  if (!master) throw errors.reference(`Sales Package ${packageName} does not exist`);
  if (disabled(master.disabled)) throw errors.validation(`Sales Package ${packageName} is disabled`);

  const day = input.postingDate.slice(0, 10);
  const validFrom = text(master.valid_from);
  const validUpto = text(master.valid_upto);
  if (validFrom && day < validFrom.slice(0, 10)) throw errors.validation(`Sales Package ${packageName} is not effective yet`);
  if (validUpto && day > validUpto.slice(0, 10)) throw errors.validation(`Sales Package ${packageName} is no longer effective`);

  const appliesItem = text(master.item_code);
  if (appliesItem && appliesItem !== input.itemCode) {
    throw errors.validation(`Sales Package ${packageName} does not apply to ${input.itemCode}`);
  }

  const selectionMode = selectionModeOf(master.selection_mode);
  const rows = rowsOf(master.items ?? master.components);
  if (rows.length === 0) throw errors.validation(`Sales Package ${packageName} has no components`);

  const componentKeys = new Set<string>();
  const components = rows.map((row, index) => {
    const componentKey = text(row.component_key) || `COMP-${String(index + 1).padStart(3, "0")}`;
    if (componentKeys.has(componentKey)) throw errors.validation(`Sales Package ${packageName} has duplicate component_key ${componentKey}`);
    componentKeys.add(componentKey);
    const configuredItemCode = text(row.item_code);
    const itemCode = configuredItemCode === "$SOURCE_ITEM" ? input.itemCode : configuredItemCode;
    const uom = text(row.uom);
    if (!itemCode) throw errors.validation(`Sales Package ${packageName} component ${componentKey} requires item_code`);
    if (!uom) throw errors.validation(`Sales Package ${packageName} component ${componentKey} requires uom`);
    const basis = quantityBasisOf(row.qty_basis ?? row.quantity_basis);
    const factorMicros = positiveFactor(row.factor ?? row.qty ?? 1, `${packageName}.${componentKey}.factor`);
    const basisMicros = quantityBasisMicros(input.facts, basis);
    const qtyMicros = multiplyMicros(basisMicros, factorMicros, `${packageName}.${componentKey}`);
    if (qtyMicros <= 0) throw errors.validation(`Sales Package ${packageName} component ${componentKey} resolves to zero quantity`);
    return {
      component_key: componentKey,
      item_code: itemCode,
      uom,
      qty_basis: basis,
      factor: fromScaledInt(factorMicros, 6),
      factor_micros: factorMicros,
      qty: fromScaledInt(qtyMicros, 6),
      qty_micros: qtyMicros,
      required: row.required !== false && row.required !== 0,
      default_selected: row.default_selected !== false && row.default_selected !== 0,
      deduct_from_parent: row.deduct_from_parent !== false && row.deduct_from_parent !== 0,
      deduct_from_discount_basis: row.deduct_from_discount_basis === true || row.deduct_from_discount_basis === 1,
      inherit_color: row.inherit_color === true || row.inherit_color === 1,
      inherit_dimensions: row.inherit_dimensions === true || row.inherit_dimensions === 1,
      inherit_set_count: row.inherit_set_count === true || row.inherit_set_count === 1,
      ...(text(row.display_label) ? { display_label: text(row.display_label) } : {}),
      ...(text(row.sales_option) ? { sales_option: text(row.sales_option) } : {}),
      ...(text(row.role) ? { role: text(row.role) } : {}),
    } satisfies SalesPackageComponentSnapshot;
  });

  const canonical = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Sales Package", packageName);
  const checksum = packageChecksum(packageName, selectionMode, components);
  return {
    sales_package: packageName,
    ...(canonical ? { sales_package_version: canonical.version } : {}),
    sales_package_checksum: checksum,
    selection_mode: selectionMode,
    components,
  };
}

/** Verify a frozen package snapshot without re-reading mutable master data. */
export function parseSalesPackageSnapshot(value: unknown): ResolvedSalesPackage | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (!candidate.trim()) return null;
    try { candidate = JSON.parse(candidate); } catch { throw errors.validation("sales_package_snapshot must be valid JSON"); }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const data = candidate as JsonObject;
  const packageName = text(data.sales_package);
  const checksum = text(data.sales_package_checksum);
  const selectionMode = selectionModeOf(data.selection_mode);
  const rows = rowsOf(data.components);
  if (!packageName || !checksum || rows.length === 0) throw errors.validation("sales_package_snapshot is incomplete");
  const components = rows.map((row) => parseComponent(row));
  const expected = packageChecksum(packageName, selectionMode, components);
  const legacyExpected = legacyPackageChecksum(packageName, selectionMode, components);
  if (expected !== checksum && legacyExpected !== checksum) throw errors.validation(`Sales Package snapshot checksum mismatch for ${packageName}`);
  return {
    sales_package: packageName,
    ...(integer(data.sales_package_version) ? { sales_package_version: integer(data.sales_package_version) } : {}),
    sales_package_checksum: checksum,
    selection_mode: selectionMode,
    components,
  };
}

export function packageComponent(
  snapshot: ResolvedSalesPackage,
  componentKey: string,
): SalesPackageComponentSnapshot | undefined {
  return snapshot.components.find((row) => row.component_key === componentKey);
}

function parseComponent(row: JsonObject): SalesPackageComponentSnapshot {
  const componentKey = text(row.component_key);
  const itemCode = text(row.item_code);
  const uom = text(row.uom);
  const basis = quantityBasisOf(row.qty_basis);
  const factorMicros = integer(row.factor_micros) || toScaledInt(String(row.factor ?? "1"), 6, "Sales Package component factor");
  const qtyMicros = integer(row.qty_micros) || toScaledInt(String(row.qty ?? "0"), 6, "Sales Package component qty");
  if (!componentKey || !itemCode || !uom || qtyMicros <= 0) throw errors.validation("Sales Package component snapshot is incomplete");
  return {
    component_key: componentKey,
    item_code: itemCode,
    uom,
    qty_basis: basis,
    factor: fromScaledInt(factorMicros, 6),
    factor_micros: factorMicros,
    qty: fromScaledInt(qtyMicros, 6),
    qty_micros: qtyMicros,
    required: row.required !== false && row.required !== 0,
    default_selected: row.default_selected !== false && row.default_selected !== 0,
    deduct_from_parent: row.deduct_from_parent !== false && row.deduct_from_parent !== 0,
    deduct_from_discount_basis: row.deduct_from_discount_basis === true || row.deduct_from_discount_basis === 1,
    inherit_color: row.inherit_color === true || row.inherit_color === 1,
    inherit_dimensions: row.inherit_dimensions === true || row.inherit_dimensions === 1,
    inherit_set_count: row.inherit_set_count === true || row.inherit_set_count === 1,
    ...(text(row.display_label) ? { display_label: text(row.display_label) } : {}),
    ...(text(row.sales_option) ? { sales_option: text(row.sales_option) } : {}),
    ...(text(row.role) ? { role: text(row.role) } : {}),
  };
}

function quantityBasisMicros(facts: Record<string, unknown>, basis: SalesPackageQuantityBasis): number {
  if (basis === "FIXED") return ONE;
  const aliases: Record<Exclude<SalesPackageQuantityBasis, "FIXED">, string[]> = {
    HEIGHT: ["height_m", "height", "chieu_cao"],
    WIDTH: ["width_m", "width", "chieu_rong"],
    CUT_WIDTH: ["cut_width_m", "cut_width"],
    AREA: ["physical_area_sqm", "area_sqm", "billable_area_sqm"],
    SET_COUNT: ["set_count", "bo"],
    LEAF_COUNT: ["leaf_count", "so_la"],
  };
  for (const key of aliases[basis]) {
    const raw = facts[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0) throw errors.validation(`Sales Package ${basis} fact ${key} must be non-negative`);
    const micros = Math.round(numeric * ONE);
    if (!Number.isSafeInteger(micros)) throw errors.validation(`Sales Package ${basis} fact exceeds safe integer range`);
    return micros;
  }
  throw errors.validation(`Sales Package requires ${basis} measurement fact`);
}

function rowsOf(value: unknown): JsonObject[] {
  if (typeof value === "string" && value.trim()) {
    try { value = JSON.parse(value); } catch { throw errors.validation("Sales Package components must be valid JSON"); }
  }
  if (!Array.isArray(value)) return [];
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.validation(`Sales Package component ${index + 1} must be an object`);
    return row as JsonObject;
  });
}

function selectionModeOf(value: unknown): SalesPackageSelectionMode {
  const mode = text(value).toUpperCase() || "ALL";
  if (mode !== "ALL" && mode !== "SELECTABLE") throw errors.validation(`Unsupported Sales Package selection_mode ${mode}`);
  return mode;
}

function quantityBasisOf(value: unknown): SalesPackageQuantityBasis {
  const basis = text(value).toUpperCase() || "FIXED";
  if (!["FIXED", "HEIGHT", "WIDTH", "CUT_WIDTH", "AREA", "SET_COUNT", "LEAF_COUNT"].includes(basis)) {
    throw errors.validation(`Unsupported Sales Package qty_basis ${basis}`);
  }
  return basis as SalesPackageQuantityBasis;
}

function positiveFactor(value: unknown, field: string): number {
  const micros = toScaledInt(value === undefined || value === null || value === "" ? "1" : String(value), 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be greater than zero`);
  return micros;
}

function multiplyMicros(left: number, right: number, field: string): number {
  const product = BigInt(left) * BigInt(right);
  const rounded = (product + BigInt(ONE / 2)) / BigInt(ONE);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} quantity exceeds safe integer range`);
  return result;
}

function packageChecksum(packageName: string, selectionMode: string, components: SalesPackageComponentSnapshot[]): string {
  const canonical = JSON.stringify({
    package: packageName,
    selection_mode: selectionMode,
    components: components.map((row) => ({
      component_key: row.component_key,
      item_code: row.item_code,
      uom: row.uom,
      qty_basis: row.qty_basis,
      factor_micros: row.factor_micros,
      qty_micros: row.qty_micros,
      required: row.required,
      default_selected: row.default_selected,
      deduct_from_parent: row.deduct_from_parent,
      deduct_from_discount_basis: row.deduct_from_discount_basis,
      inherit_color: row.inherit_color,
      inherit_dimensions: row.inherit_dimensions,
      inherit_set_count: row.inherit_set_count,
      display_label: row.display_label ?? "",
      sales_option: row.sales_option ?? "",
      role: row.role ?? "",
    })),
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

/** Checksum shape used before selectable component pricing fields were introduced. */
function legacyPackageChecksum(packageName: string, selectionMode: string, components: SalesPackageComponentSnapshot[]): string {
  const canonical = JSON.stringify({
    package: packageName,
    selection_mode: selectionMode,
    components: components.map((row) => ({
      component_key: row.component_key,
      item_code: row.item_code,
      uom: row.uom,
      qty_basis: row.qty_basis,
      factor_micros: row.factor_micros,
      qty_micros: row.qty_micros,
      required: row.required,
      default_selected: row.default_selected,
      role: row.role ?? "",
    })),
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function disabled(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || text(value).toLowerCase() === "true";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
