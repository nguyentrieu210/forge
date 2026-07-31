import type { JsonObject } from "../../contracts/src/index.js";
import type { StockEntryData, StockEntryItem } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { SerialBatchBundleData } from "../../clouderp-stock/src/index.js";
import { AdvancedStockEntryController } from "./controllers.js";

export type WarehouseRole =
  | "RAW_MATERIAL"
  | "WIP"
  | "FINISHED_GOODS"
  | "QUARANTINE"
  | "SCRAP_OFFCUT"
  | "GENERAL";

interface PhysicalLotRef extends JsonObject {
  batch_no?: string;
  serial_no?: string;
  qty_micros: number;
}

interface PhysicalStockRow extends StockEntryItem {
  inventory_mode?: string;
  measurement_profile?: string;
  color?: string;
  colour?: string;
  condition?: string;
  generation?: string;
  length_m?: string | number;
  width_m?: string | number;
  height_m?: string | number;
  roll_width_m?: string | number;
  thickness_mm?: string | number;
  qty_bar?: string | number;
  set_count?: string | number;
  physical_identity_version?: number;
  physical_identity_key?: string;
  physical_count_micros?: number;
  length_micros?: number;
  width_micros?: number;
  height_micros?: number;
  thickness_micros?: number;
  source_warehouse_role?: WarehouseRole;
  target_warehouse_role?: WarehouseRole;
  physical_lot_refs?: PhysicalLotRef[];
}

interface PhysicalStockData extends StockEntryData {
  quality_release_reference?: string;
  recovery_reason?: string;
  finished_good_color?: string;
  finished_good_condition?: string;
  finished_good_generation?: string;
  finished_good_length_m?: string | number;
  finished_good_width_m?: string | number;
  finished_good_height_m?: string | number;
  finished_good_roll_width_m?: string | number;
  finished_good_thickness_mm?: string | number;
  finished_good_set_count?: string | number;
  finished_good_physical_identity?: JsonObject;
}

interface IdentityHints {
  color?: string;
  condition?: string;
  generation?: string;
  lengthMicros?: number;
}

interface ModeValidation {
  action: string;
  itemCode: string;
  mode: string;
  profile: string;
  color: string;
  lengthMicros: number | undefined;
  widthMicros: number | undefined;
  heightMicros: number | undefined;
  physicalCountMicros: number;
  refs: PhysicalLotRef[];
  index: number;
}

/**
 * Freezes server-built physical identity and warehouse-role meaning on Stock Entry rows.
 * The append-only stock ledger remains the only quantity/value movement ledger, so the
 * identity snapshot cannot drift into a parallel third stock book.
 */
export class PhysicalStockEntryController extends AdvancedStockEntryController {
  override async normalize(context: ControllerContext<StockEntryData>): Promise<StockEntryData> {
    const normalized = await super.normalize(context) as PhysicalStockData;
    const rows: PhysicalStockRow[] = [];
    for (const [index, input] of normalized.items.entries()) {
      rows.push(await enrichPhysicalRow(context, normalized, input as PhysicalStockRow, index));
    }

    let finishedGoodPhysicalIdentity: JsonObject | undefined;
    if (normalized.purpose === "Manufacture" && normalized.finished_good_item && normalized.target_warehouse) {
      const pseudoRow: PhysicalStockRow = {
        row_id: "FINISHED",
        item_code: normalized.finished_good_item,
        qty: normalized.finished_good_qty ?? "0",
        target_warehouse: normalized.target_warehouse,
        ...(normalized.finished_good_qty_micros === undefined ? {} : { qty_micros: normalized.finished_good_qty_micros }),
        ...(normalized.finished_good_bundle ? { serial_and_batch_bundle: normalized.finished_good_bundle } : {}),
        ...(normalized.finished_good_color ? { color: normalized.finished_good_color } : {}),
        ...(normalized.finished_good_condition ? { condition: normalized.finished_good_condition } : {}),
        ...(normalized.finished_good_generation ? { generation: normalized.finished_good_generation } : {}),
        ...(normalized.finished_good_length_m === undefined ? {} : { length_m: normalized.finished_good_length_m }),
        ...(normalized.finished_good_width_m === undefined ? {} : { width_m: normalized.finished_good_width_m }),
        ...(normalized.finished_good_height_m === undefined ? {} : { height_m: normalized.finished_good_height_m }),
        ...(normalized.finished_good_roll_width_m === undefined ? {} : { roll_width_m: normalized.finished_good_roll_width_m }),
        ...(normalized.finished_good_thickness_mm === undefined ? {} : { thickness_mm: normalized.finished_good_thickness_mm }),
        ...(normalized.finished_good_set_count === undefined ? {} : { set_count: normalized.finished_good_set_count }),
      };
      const enriched = await enrichPhysicalRow(context, normalized, pseudoRow, rows.length, true);
      finishedGoodPhysicalIdentity = physicalSnapshot(enriched);
    }

    return {
      ...normalized,
      items: rows,
      ...(finishedGoodPhysicalIdentity ? { finished_good_physical_identity: finishedGoodPhysicalIdentity } : {}),
    };
  }
}

async function enrichPhysicalRow(
  context: ControllerContext<StockEntryData>,
  document: PhysicalStockData,
  row: PhysicalStockRow,
  index: number,
  finishedGood = false,
): Promise<PhysicalStockRow> {
  const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", row.item_code);
  if (!item && context.command.action === "submit") throw errors.reference(`Item ${row.item_code} does not exist`);

  const mode = text(item?.inventory_mode) || "Hàng thường";
  const profile = text(item?.measurement_profile);
  const sourceRole = row.source_warehouse ? await warehouseRole(context, row.source_warehouse) : undefined;
  const targetRole = row.target_warehouse ? await warehouseRole(context, row.target_warehouse) : undefined;
  assertWarehouseRoles(document, sourceRole, targetRole, finishedGood, index);

  const direction = row.source_warehouse ? "Outward" : "Inward";
  const bundleWarehouse = row.source_warehouse ?? row.target_warehouse;
  const { refs, hints } = await readPhysicalLotRefs(
    context,
    row,
    bundleWarehouse,
    direction,
    isDimensionedMode(mode),
    index,
  );

  const explicitColor = text(row.color ?? row.colour);
  const explicitCondition = text(row.condition);
  const explicitGeneration = text(row.generation);
  const explicitLengthMicros = positiveMicros(row.length_m, `items[${index}].length_m`);
  assertStringCompatible("màu", explicitColor, hints.color, index);
  assertStringCompatible("tình trạng", explicitCondition, hints.condition, index);
  assertStringCompatible("đời sản phẩm", explicitGeneration, hints.generation, index);
  assertNumberCompatible("chiều dài", explicitLengthMicros, hints.lengthMicros, index);

  const color = explicitColor || hints.color || text(item?.default_color);
  const condition = explicitCondition || hints.condition || "";
  const generation = explicitGeneration || hints.generation || "";
  const lengthMicros = explicitLengthMicros ?? hints.lengthMicros;
  const widthMicros = positiveMicros(row.width_m ?? row.roll_width_m, `items[${index}].width_m`);
  const heightMicros = positiveMicros(row.height_m, `items[${index}].height_m`);
  const thicknessMicros = positiveMicros(row.thickness_mm, `items[${index}].thickness_mm`);
  const physicalCountMicros = physicalCount(row, mode, index);

  validateModeFields({
    action: context.command.action,
    itemCode: row.item_code,
    mode,
    profile,
    color,
    lengthMicros,
    widthMicros,
    heightMicros,
    physicalCountMicros,
    refs,
    index,
  });

  const identityKey = canonicalIdentityKey({
    itemCode: row.item_code,
    mode,
    profile,
    color,
    condition,
    generation,
    lengthMicros,
    widthMicros,
    heightMicros,
    thicknessMicros,
    refs,
  });

  return {
    ...row,
    inventory_mode: mode,
    ...(profile ? { measurement_profile: profile } : {}),
    ...(color ? { color } : {}),
    ...(condition ? { condition } : {}),
    ...(generation ? { generation } : {}),
    physical_identity_version: 1,
    physical_identity_key: identityKey,
    physical_count_micros: physicalCountMicros,
    ...(lengthMicros === undefined ? {} : { length_m: fromScaledInt(lengthMicros, 6), length_micros: lengthMicros }),
    ...(widthMicros === undefined ? {} : { width_m: fromScaledInt(widthMicros, 6), width_micros: widthMicros }),
    ...(heightMicros === undefined ? {} : { height_m: fromScaledInt(heightMicros, 6), height_micros: heightMicros }),
    ...(thicknessMicros === undefined ? {} : { thickness_mm: fromScaledInt(thicknessMicros, 6), thickness_micros: thicknessMicros }),
    ...(sourceRole ? { source_warehouse_role: sourceRole } : {}),
    ...(targetRole ? { target_warehouse_role: targetRole } : {}),
    ...(refs.length ? { physical_lot_refs: refs } : {}),
  };
}

function physicalSnapshot(row: PhysicalStockRow): JsonObject {
  return {
    item_code: row.item_code,
    physical_identity_version: row.physical_identity_version ?? 1,
    physical_identity_key: row.physical_identity_key ?? "",
    inventory_mode: row.inventory_mode ?? "Hàng thường",
    ...(row.measurement_profile ? { measurement_profile: row.measurement_profile } : {}),
    ...(row.color ? { color: row.color } : {}),
    ...(row.condition ? { condition: row.condition } : {}),
    ...(row.generation ? { generation: row.generation } : {}),
    ...(row.physical_count_micros === undefined ? {} : { physical_count_micros: row.physical_count_micros }),
    ...(row.length_micros === undefined ? {} : { length_micros: row.length_micros }),
    ...(row.width_micros === undefined ? {} : { width_micros: row.width_micros }),
    ...(row.height_micros === undefined ? {} : { height_micros: row.height_micros }),
    ...(row.thickness_micros === undefined ? {} : { thickness_micros: row.thickness_micros }),
    ...(row.target_warehouse_role ? { target_warehouse_role: row.target_warehouse_role } : {}),
    ...(row.physical_lot_refs ? { physical_lot_refs: row.physical_lot_refs } : {}),
  };
}

async function readPhysicalLotRefs(
  context: ControllerContext<StockEntryData>,
  row: PhysicalStockRow,
  warehouse: string | undefined,
  direction: "Inward" | "Outward",
  dimensioned: boolean,
  index: number,
): Promise<{ refs: PhysicalLotRef[]; hints: IdentityHints }> {
  const bundleName = text(row.serial_and_batch_bundle);
  if (!bundleName) {
    if (dimensioned && context.command.action === "submit") {
      throw errors.validation(`Dòng ${index + 1} của ${row.item_code} phải chọn lô/bundle vật lý`);
    }
    return { refs: [], hints: {} };
  }

  const document = await context.reader.getDocument<SerialBatchBundleData>(
    context.command.tenant_id,
    "Serial and Batch Bundle",
    bundleName,
  );
  if (!document) {
    if (context.command.action === "submit") throw errors.reference(`Serial and Batch Bundle ${bundleName} does not exist`);
    return { refs: [], hints: {} };
  }
  if (context.command.action === "submit" && document.docstatus !== 1) {
    throw errors.reference(`Serial and Batch Bundle ${bundleName} must be submitted`);
  }
  const bundle = document.data;
  if (bundle.item_code !== row.item_code || (warehouse && bundle.warehouse !== warehouse) || bundle.type !== direction) {
    throw errors.reference(`Serial and Batch Bundle ${bundleName} does not match physical item, warehouse or direction`);
  }
  if (!Array.isArray(bundle.entries) || bundle.entries.length === 0) {
    throw errors.validation(`Serial and Batch Bundle ${bundleName} requires entries`);
  }

  const refs: PhysicalLotRef[] = [];
  const hints: IdentityHints = {};
  let total = 0;
  for (const [entryIndex, entry] of bundle.entries.entries()) {
    const qtyMicros = typeof entry.qty_micros === "number"
      ? entry.qty_micros
      : toScaledInt(entry.qty, 6, `bundle.entries[${entryIndex}].qty`);
    if (qtyMicros <= 0 || (!entry.batch_no && !entry.serial_no)) {
      throw errors.validation(`Bundle ${bundleName} has an invalid physical row at ${entryIndex + 1}`);
    }
    total += qtyMicros;
    refs.push({
      qty_micros: qtyMicros,
      ...(entry.batch_no ? { batch_no: entry.batch_no } : {}),
      ...(entry.serial_no ? { serial_no: entry.serial_no } : {}),
    });

    if (!entry.batch_no) continue;
    const [batch, aluminiumLot] = await Promise.all([
      context.reader.getMasterRecordData(context.command.tenant_id, "Batch", entry.batch_no),
      context.reader.getMasterRecordData(context.command.tenant_id, "Aluminium Lot", entry.batch_no),
    ]);
    if (direction === "Outward" && !batch) throw errors.reference(`Batch ${entry.batch_no} does not exist`);
    if (batch && text(batch.item_code) && text(batch.item_code) !== row.item_code) {
      throw errors.reference(`Batch ${entry.batch_no} belongs to another Item`);
    }
    if (!aluminiumLot) continue;
    if (text(aluminiumLot.profile) && text(aluminiumLot.profile) !== row.item_code) {
      throw errors.reference(`Lô nhôm ${entry.batch_no} thuộc mã khác ${row.item_code}`);
    }
    // `Aluminium Lot.warehouse` is a legacy descriptive projection. The stock ledger's
    // batch balance is authoritative after transfer, so a stale lot warehouse must not
    // reject a valid second movement.
    setStringHint(hints, "color", text(aluminiumLot.colour ?? aluminiumLot.color), entry.batch_no);
    setStringHint(hints, "condition", text(aluminiumLot.condition), entry.batch_no);
    setStringHint(hints, "generation", text(aluminiumLot.generation), entry.batch_no);
    const lotLength = positiveMicros(aluminiumLot.width_m ?? aluminiumLot.length_m, `Aluminium Lot ${entry.batch_no}.width_m`);
    if (lotLength !== undefined) setLengthHint(hints, lotLength, entry.batch_no);
  }

  const rowQty = row.qty_micros ?? toScaledInt(row.qty, 6, `items[${index}].qty`);
  if (context.command.action === "submit" && total !== rowQty) {
    throw errors.reference(`Bundle ${bundleName} quantity does not match row ${index + 1}`, {
      bundle_qty_micros: total,
      row_qty_micros: rowQty,
    });
  }
  return { refs, hints };
}

function assertStringCompatible(
  label: string,
  explicitValue: string,
  lotValue: string | undefined,
  index: number,
): void {
  if (explicitValue && lotValue && normalizeText(explicitValue) !== normalizeText(lotValue)) {
    throw errors.reference(`Dòng ${index + 1} khai ${label} ${explicitValue} nhưng lô vật lý là ${lotValue}`);
  }
}

function assertNumberCompatible(
  label: string,
  explicitValue: number | undefined,
  lotValue: number | undefined,
  index: number,
): void {
  if (explicitValue !== undefined && lotValue !== undefined && explicitValue !== lotValue) {
    throw errors.reference(`Dòng ${index + 1} khai ${label} khác lô vật lý`);
  }
}

function setStringHint(
  hints: IdentityHints,
  field: "color" | "condition" | "generation",
  value: string,
  lot: string,
): void {
  if (!value) return;
  const current = hints[field];
  if (current && normalizeText(current) !== normalizeText(value)) {
    throw errors.reference(`Các lô trong cùng dòng có ${field} khác nhau; tách lô ${lot} sang dòng riêng`);
  }
  if (field === "color") hints.color = value;
  else if (field === "condition") hints.condition = value;
  else hints.generation = value;
}

function setLengthHint(hints: IdentityHints, value: number, lot: string): void {
  if (hints.lengthMicros !== undefined && hints.lengthMicros !== value) {
    throw errors.reference(`Các lô trong cùng dòng có chiều dài khác nhau; tách lô ${lot} sang dòng riêng`);
  }
  hints.lengthMicros = value;
}

async function warehouseRole(
  context: ControllerContext<StockEntryData>,
  warehouse: string,
): Promise<WarehouseRole> {
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Warehouse", warehouse);
  if (!master) {
    if (context.command.action === "submit") throw errors.reference(`Warehouse ${warehouse} does not exist`);
    return "GENERAL";
  }
  if (checked(master.disabled) || checked(master.is_group)) {
    throw errors.reference(`Warehouse ${warehouse} is disabled or is a group`);
  }
  const declared = text(master.warehouse_role ?? master.stock_role);
  if (!declared) return "GENERAL";
  const role = normalizeWarehouseRole(declared);
  if (!role) throw errors.validation(`Warehouse ${warehouse} has unsupported stock role ${declared}`);
  return role;
}

function assertWarehouseRoles(
  document: PhysicalStockData,
  sourceRole: WarehouseRole | undefined,
  targetRole: WarehouseRole | undefined,
  finishedGood: boolean,
  index: number,
): void {
  const label = finishedGood ? "thành phẩm" : `dòng ${index + 1}`;
  if (document.purpose === "Material Receipt") {
    assertAllowed(targetRole, ["RAW_MATERIAL", "QUARANTINE", "GENERAL"], `${label}: kho nhận`);
  } else if (document.purpose === "Material Issue") {
    assertAllowed(sourceRole, ["RAW_MATERIAL", "WIP", "FINISHED_GOODS", "SCRAP_OFFCUT", "GENERAL"], `${label}: kho xuất`);
  } else if (document.purpose === "Manufacture") {
    if (finishedGood) assertAllowed(targetRole, ["WIP", "FINISHED_GOODS", "QUARANTINE", "GENERAL"], `${label}: kho nhập`);
    else assertAllowed(sourceRole, ["RAW_MATERIAL", "WIP", "GENERAL"], `${label}: kho cấp vật tư`);
  }

  if (document.purpose === "Material Transfer" && sourceRole === "QUARANTINE" && targetRole !== "QUARANTINE") {
    if (!text(document.quality_release_reference)) {
      throw errors.validation(`${label}: chuyển hàng khỏi kho chờ kiểm phải có quality_release_reference`);
    }
  }
  if (document.purpose === "Material Transfer" && sourceRole === "SCRAP_OFFCUT" && targetRole !== "SCRAP_OFFCUT") {
    if (!text(document.recovery_reason)) {
      throw errors.validation(`${label}: phục hồi hàng từ kho phế/đầu thừa phải có recovery_reason`);
    }
  }
}

function assertAllowed(role: WarehouseRole | undefined, allowed: WarehouseRole[], label: string): void {
  if (role && !allowed.includes(role)) {
    throw errors.validation(`${label} có vai trò ${role}, không hợp lệ cho mục đích chứng từ`);
  }
}

function validateModeFields(input: ModeValidation): void {
  if (!isDimensionedMode(input.mode)) return;
  if (!input.profile && input.action === "submit") {
    throw errors.validation(`Dòng ${input.index + 1} của ${input.itemCode} thiếu Measurement Profile`);
  }
  if (input.action !== "submit") return;
  const mode = normalizeText(input.mode);
  if (mode === "nhom cay/la") {
    if (!input.color || !input.lengthMicros || input.physicalCountMicros <= 0) {
      throw errors.validation(`Dòng ${input.index + 1} của ${input.itemCode} thiếu màu, chiều dài hoặc số cây/lá`);
    }
  } else if (mode === "tam/kinh" || mode === "kinh/tam") {
    if (!input.widthMicros || !input.heightMicros) {
      throw errors.validation(`Dòng ${input.index + 1} của ${input.itemCode} thiếu rộng/cao tấm kính`);
    }
  } else if (mode === "cuon") {
    if (!input.widthMicros) throw errors.validation(`Dòng ${input.index + 1} của ${input.itemCode} thiếu khổ cuộn`);
  } else if (mode === "thanh pham theo m2") {
    if (!input.widthMicros || !input.heightMicros || input.physicalCountMicros <= 0) {
      throw errors.validation(`Dòng ${input.index + 1} của ${input.itemCode} thiếu rộng/cao/số bộ thành phẩm`);
    }
  }
  if (input.refs.length === 0) {
    throw errors.validation(`Dòng ${input.index + 1} của ${input.itemCode} thiếu lineage lô/batch/serial`);
  }
}

function physicalCount(row: PhysicalStockRow, mode: string, index: number): number {
  const normalized = normalizeText(mode);
  if (normalized === "nhom cay/la") return positiveMicros(row.qty_bar, `items[${index}].qty_bar`) ?? 0;
  if (normalized === "thanh pham theo m2") return positiveMicros(row.set_count, `items[${index}].set_count`) ?? 0;
  return row.qty_micros ?? toScaledInt(row.qty, 6, `items[${index}].qty`);
}

function canonicalIdentityKey(input: {
  itemCode: string;
  mode: string;
  profile: string;
  color: string;
  condition: string;
  generation: string;
  lengthMicros: number | undefined;
  widthMicros: number | undefined;
  heightMicros: number | undefined;
  thicknessMicros: number | undefined;
  refs: PhysicalLotRef[];
}): string {
  const lots = input.refs
    .map((ref) => `${ref.batch_no ?? ""}:${ref.serial_no ?? ""}`)
    .sort()
    .join(",");
  return [
    "phys-v1",
    input.itemCode,
    input.mode,
    input.profile,
    input.color,
    input.condition,
    input.generation,
    input.lengthMicros ?? "",
    input.widthMicros ?? "",
    input.heightMicros ?? "",
    input.thicknessMicros ?? "",
    lots,
  ].map((value) => encodeURIComponent(String(value))).join("|");
}

function positiveMicros(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = toScaledInt(value as string | number, 6, field);
  if (result <= 0) throw errors.validation(`${field} must be positive`);
  return result;
}

function isDimensionedMode(mode: string): boolean {
  return normalizeText(mode) !== "hang thuong";
}

export function normalizeWarehouseRole(value: unknown): WarehouseRole | "" {
  const normalized = normalizeText(value).replace(/[\s_-]+/g, " ");
  const aliases = new Map<string, WarehouseRole>([
    ["raw material", "RAW_MATERIAL"],
    ["nguyen vat lieu", "RAW_MATERIAL"],
    ["kho nguyen vat lieu", "RAW_MATERIAL"],
    ["wip", "WIP"],
    ["work in progress", "WIP"],
    ["dang san xuat", "WIP"],
    ["kho dang san xuat", "WIP"],
    ["finished goods", "FINISHED_GOODS"],
    ["thanh pham", "FINISHED_GOODS"],
    ["kho thanh pham", "FINISHED_GOODS"],
    ["quarantine", "QUARANTINE"],
    ["cho kiem", "QUARANTINE"],
    ["kho cho kiem", "QUARANTINE"],
    ["scrap offcut", "SCRAP_OFFCUT"],
    ["scrap", "SCRAP_OFFCUT"],
    ["offcut", "SCRAP_OFFCUT"],
    ["kho dau thua", "SCRAP_OFFCUT"],
    ["kho phe", "SCRAP_OFFCUT"],
    ["general", "GENERAL"],
    ["kho chinh", "GENERAL"],
  ]);
  return aliases.get(normalized) ?? "";
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  const normalized = normalizeText(value);
  return normalized === "co" || normalized === "yes" || normalized === "true";
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalizeText(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("đ", "d")
    .toLocaleLowerCase("vi");
}
