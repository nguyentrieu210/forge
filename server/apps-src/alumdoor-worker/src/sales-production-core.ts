import { roundTo } from "../../../packages/core/src/index.js";
import {
  calculateDoorFormula,
  inferDoorType,
  isManualPullGroup,
  parseDoorPolicy,
  RAY_TYPES,
  selectDoorPolicy,
  type CustomerGroup,
  type DoorFormulaPolicy,
  type DoorType,
  type SalesMode,
} from "./door-formulas.js";
import { inspectSalesLineBomComposition, previewProductionLineBom, resolveProductionLineBom } from "./bom-template-materializer.js";
import { evaluateGeometryRules, type GeometryPolicyRule } from "./geometry-policy.js";
import {
  normalizeBomActualComponents,
  type BomActualComponentInput,
  type BomActualRequirement,
} from "./bom-actual-components.js";

export type ProductionPlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

type Json = Record<string, unknown>;

type LeafRounding = "Ngưỡng trừ-một-lá" | "Nấc 0-0.3-0.7-1" | "Làm tròn xuống";

interface SalesOrderDoc extends Json {
  name: string;
  docstatus?: number;
  customer?: string;
  customer_group?: string;
  company?: string;
  currency?: string;
  delivery_date?: string;
  install_address?: string;
  items?: Json[];
}

interface ItemDoc extends Json {
  item_code?: string;
  item_name?: string;
  item_group?: string;
  door_type?: string;
  inventory_mode?: string;
  stock_uom?: string;
  default_sales_uom?: string;
  sales_qty_basis?: string;
  uom_conversions?: Json[];
  purchase_kg_per_m2?: number;
  leaf_divisor_m?: number;
  min_area_sqm?: number;
  measurement_profile?: string;
  supply_type?: string;
  include_item_in_manufacturing?: unknown;
}

interface RawPolicy extends Json {
  name?: string;
  policy_name?: string;
  door_type?: string;
  item_group?: string;
  leaf_formula?: string;
  leaf_height_deduction_m?: unknown;
  leaf_divisor_source?: string;
  leaf_divisor_const?: unknown;
  leaf_rounding?: LeafRounding;
  leaf_round_threshold?: unknown;
  leaf_variants?: Array<{ variant_label?: string; addend?: unknown }>;
  ray_type?: string;
  geometry_profile?: string;
  geometry_rules?: GeometryPolicyRule[];
}

interface GeometryProfileDoc extends Json {
  name?: string;
  profile_code?: string;
  fields?: Array<{ geometry_field?: string; role?: string; required?: unknown; visible?: unknown; editable?: unknown; sequence?: unknown }>;
  disabled?: unknown;
}

interface ProductionStandard extends Json {
  name?: string;
  department?: string;
  door_type?: string;
  operation?: string;
  minutes_per_set?: number;
  capacity_basis?: "m2" | "set" | "operation" | "batch";
  minutes_per_unit?: number;
  batch_capacity?: number;
  persons?: number;
  shift_hours?: number;
  efficiency?: number;
  workstation?: string;
  default_overtime_hours?: number;
  standard_time?: string;
  effective_from?: string;
  effective_to?: string;
  disabled?: unknown;
}

interface BomDoc extends Json {
  name?: string;
  item?: string;
  color?: string;
  docstatus?: number;
  is_active?: unknown;
  bom_status?: string;
  effective_from?: string;
  effective_to?: string;
  revision?: number;
  generated_by_configurator?: unknown;
}

export interface LeafPlan {
  leaf_formula: string;
  leaf_variant?: string;
  height_basis_m: number;
  height_deduction_m: number;
  divisor_m: number;
  raw_leaf_count: number;
  leaf_count: number;
  single_layer_leaf_count?: number;
  double_layer_leaf_count?: number;
  explanation: string;
}

export interface SalesProductionLine extends Json {
  request_line_key: string;
  sales_order_row_id: string;
  item_code: string;
  item_group: string;
  door_type: DoorType;
  ray_type?: string;
  department: string;
  set_no: number;
  set_count: 1;
  width_m: number;
  height_m: number;
  mesh_height_m?: number;
  color?: string;
  motor_model?: string;
  sales_mode: SalesMode;
  formula_policy: string;
  formula_version: string;
  width_basis: string;
  cut_width_m: number;
  billable_area_sqm: number;
  leaf_count: number;
  single_layer_leaf_count?: number;
  double_layer_leaf_count?: number;
  estimated_weight_kg?: number;
  estimated_minutes: number;
  schedule_warning?: string;
  source_warehouse: string;
  target_warehouse: string;
  bom_no: string;
  bom_template?: string;
  bom_template_code?: string;
  bom_fingerprint?: string;
  bom_materialization_required?: 0 | 1;
  bom_actual_components?: BomActualComponentInput[];
  bom_actual_requirements?: BomActualRequirement[];
  missing_actual_component_keys?: string[];
  bom_actual_complete?: 0 | 1;
  output_qty: number;
  stock_uom: string;
  paint_required: 0 | 1;
  formula_snapshot: string;
  accessories?: string;
  install_note?: string;
  note?: string;
}

interface BuildInputs {
  sales: SalesOrderDoc;
  items: Map<string, ItemDoc>;
  policies: RawPolicy[];
  geometry_profiles?: Map<string, GeometryProfileDoc>;
  standards: ProductionStandard[];
  boms: BomDoc[];
  source_warehouse: string;
  target_warehouse: string;
}

const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

const refuse = (message: string) => answer({ message }, 422);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function isAreaFinishedProduct(item: ItemDoc): boolean {
  return [item.inventory_mode, item.measurement_profile]
    .some((value) => normalized(value) === normalized("Thành phẩm theo m2"));
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(normalized(value));
}

function finitePositive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  return number;
}

function finiteNonNegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} không được âm.`);
  return number;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} phải là số nguyên dương.`);
  return number;
}

const SALES_AREA_UOMS = new Set(["m2", "m²", "sqm"]);
const SALES_METRE_UOMS = new Set(["m", "mét", "met", "meter", "metre"]);

type SalesLinearBasis = "RAY" | "TRUC";

function salesLinearBasis(item: ItemDoc): SalesLinearBasis | undefined {
  const configured = text(item.sales_qty_basis).toUpperCase();
  if (["RAY", "HEIGHT_X_SETS"].includes(configured)) return "RAY";
  if (["TRUC", "WIDTH_X_SETS"].includes(configured)) return "TRUC";
  const itemName = normalized(item.item_name);
  const itemCode = normalized(item.item_code);
  if (itemName.startsWith("ray") || itemCode.includes("ray")) return "RAY";
  if (itemName.startsWith("trục") || itemName.startsWith("truc")
    || itemCode.includes("trục") || itemCode.includes("truc")) return "TRUC";
  return undefined;
}

function isWidthQuantitySalesItem(item: ItemDoc): boolean {
  const itemName = normalized(item.item_name);
  const itemCode = normalized(item.item_code).replace(/[ _-]+/g, "");
  return itemName.includes("bộ ba lá đáy")
    || itemName === "lá đầu"
    || itemCode.includes("bo3laday")
    || itemCode === "tpa282"
    || itemCode.includes("ladau");
}

function isIntermediateFinishedLeafForSales(item: ItemDoc, componentIndex: number): boolean {
  if (componentIndex !== 0) return false;
  return normalized(item.item_group) === normalized("Nan/lá cửa")
    && normalized(item.item_name).startsWith("tp lá ");
}

function parentSalesWidthField(parent: Json): "width_pb_ray_m" | "width_pb_nhua_m" | null {
  const doorType = normalized(parent.door_type);
  const itemGroup = normalized(parent.item_group ?? parent.product_group);
  const alwaysUsesPbRay = [
    "cửa úc",
    "cửa tấm liền úc",
    "cửa lưới",
    "cửa đài loan",
    "cửa siêu trường",
  ].includes(doorType)
    || [
      "cửa tấm liền úc",
      "cửa lưới",
      "cửa đài loan",
      "cửa đài loan inox",
      "cửa kéo đài loan",
      "cửa siêu trường",
    ].includes(itemGroup);
  if (alwaysUsesPbRay) return "width_pb_ray_m";
  const customerGroup = text(parent.customer_group);
  if (customerGroup === "Lẻ") return "width_pb_ray_m";
  if (customerGroup === "Đại lý") return "width_pb_nhua_m";
  return null;
}

function inheritedPositive(parent: Json, fieldname: string): number | undefined {
  const value = Number(parent[fieldname]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function salesCompositionQuantity(
  item: ItemDoc,
  parent: Json,
  salesUom: string,
  setCount: number,
): { qty: number | null; length_m?: number } {
  const uom = normalized(salesUom);
  const width = inheritedPositive(parent, "width_m");
  const height = inheritedPositive(parent, "height_m");
  const linear = salesLinearBasis(item);
  if (isWidthQuantitySalesItem(item) && SALES_METRE_UOMS.has(uom) && width) {
    return { qty: roundTo(width * setCount), length_m: width };
  }
  if (isWidthQuantitySalesItem(item) && SALES_METRE_UOMS.has(uom)) return { qty: null };
  if (linear) {
    const length = linear === "RAY" ? height : width;
    if (length && SALES_METRE_UOMS.has(uom)) return { qty: roundTo(length * setCount), length_m: length };
    if (SALES_METRE_UOMS.has(uom)) return { qty: null };
    if (length) return { qty: roundTo(setCount), length_m: length };
  }
  if (isAreaFinishedProduct(item) && SALES_AREA_UOMS.has(uom)) {
    const billableArea = inheritedPositive(parent, "billable_area_sqm");
    if (billableArea) return { qty: roundTo(billableArea) };
    if (width && height) return { qty: roundTo(width * height * setCount) };
    return { qty: null };
  }
  return { qty: roundTo(setCount) };
}

async function enrichSalesBomComponents(
  call: ProductionPlatformCall,
  components: Json[],
  parent: Json,
): Promise<Json[]> {
  const setCount = Number(parent.set_count) > 0 ? Number(parent.set_count) : 1;
  const itemCodes = [...new Set(components.map((row) => text(row.item_code)).filter(Boolean))];
  const itemEntries = await Promise.all(itemCodes.map(async (itemCode) => [
    itemCode,
    await readDoc<ItemDoc>(call, "Item", itemCode),
  ] as const));
  const itemByCode = new Map(itemEntries);

  return components.flatMap((component, componentIndex) => {
    const item = itemByCode.get(text(component.item_code)) ?? {};
    // The first TP LÁ row is an intermediate production item. Keep it in the
    // source BOM, but omit it from the sales composition to avoid presenting
    // it as another sellable child line.
    if (isIntermediateFinishedLeafForSales(item, componentIndex)) return [];
    const configuredSalesUom = text(item.default_sales_uom);
    const calculated = salesCompositionQuantity(item, parent, configuredSalesUom, setCount);
    const {
      qty: _productionQty,
      stock_qty: _productionStockQty,
      stock_uom: _productionUom,
      production_qty: _legacyProductionQty,
      production_uom: _legacyProductionUom,
      quantity_fields: _productionQuantityFields,
      quantity_error: _productionQuantityError,
      uom_warning: _legacyUomWarning,
      ...composition
    } = component;
    void _productionQty;
    void _productionStockQty;
    void _productionUom;
    void _legacyProductionQty;
    void _legacyProductionUom;
    void _productionQuantityFields;
    void _productionQuantityError;
    void _legacyUomWarning;
    const normalizedWidth = inheritedPositive(parent, "width_m");
    const selectedWidthField = parentSalesWidthField(parent);
    const widthPbRay = inheritedPositive(parent, "width_pb_ray_m")
      ?? (selectedWidthField === "width_pb_ray_m" ? normalizedWidth : undefined);
    const widthPbNhua = inheritedPositive(parent, "width_pb_nhua_m")
      ?? (selectedWidthField === "width_pb_nhua_m" ? normalizedWidth : undefined);

    return [{
      ...composition,
      set_count: setCount,
      uom: configuredSalesUom,
      qty: calculated.qty,
      ...(configuredSalesUom ? {} : {
        sales_uom_missing: true,
        sales_uom_message: `Vật tư ${text(component.item_code)} chưa cấu hình ĐVT bán trên Item.`,
      }),
      ...(widthPbRay ? { width_pb_ray_m: widthPbRay } : {}),
      ...(widthPbNhua ? { width_pb_nhua_m: widthPbNhua } : {}),
      ...(normalizedWidth ? { width_m: normalizedWidth } : {}),
      ...(inheritedPositive(parent, "height_m") ? { height_m: inheritedPositive(parent, "height_m") } : {}),
      ...(inheritedPositive(parent, "mesh_height_m") ? { mesh_height_m: inheritedPositive(parent, "mesh_height_m") } : {}),
      ...(inheritedPositive(parent, "cut_width_m") ? { cut_width_m: inheritedPositive(parent, "cut_width_m") } : {}),
      ...(calculated.length_m ? { length_m: calculated.length_m } : {}),
    }];
  });
}

function dateOnly(value: unknown): string {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function activeOn(row: { effective_from?: string; effective_to?: string; disabled?: unknown }, on: string): boolean {
  if (checked(row.disabled)) return false;
  const from = dateOnly(row.effective_from);
  const to = dateOnly(row.effective_to);
  return (!from || from <= on) && (!to || to >= on);
}

async function readDoc<T extends Json>(call: ProductionPlatformCall, doctype: string, name: string): Promise<T & { modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T & { modified?: string } }).data ?? {}) as T & { modified?: string };
}

async function listDocs<T extends Json>(
  call: ProductionPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 500,
): Promise<T[]> {
  // The Frappe facade clamps one page to 100 rows even when callers request
  // more.  BOM imports already exceed that threshold, so a single request
  // silently omitted valid BOMs whose names sorted after the first page.
  const output: T[] = [];
  const pageSize = Math.min(Math.max(limit, 1), 100);
  for (let offset = 0; offset < limit; offset += pageSize) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_page_length: String(Math.min(pageSize, limit - offset)),
      limit_start: String(offset),
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim().slice(0, 240);
      throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status})${detail ? `: ${detail}` : ""}`);
    }
    const page = (((await response.json()) as { data?: T[] }).data ?? []);
    output.push(...page);
    if (page.length < Math.min(pageSize, limit - offset)) break;
  }
  return output.slice(0, limit);
}

async function createDoc<T extends Json>(call: ProductionPlatformCall, doctype: string, document: T): Promise<T & { name: string; modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(document),
  });
  if (!response.ok) throw new Error(`Không tạo được ${doctype}: ${(await response.text()).slice(0, 220)}`);
  const data = ((await response.json()) as { data?: T & { name?: string; modified?: string } }).data;
  if (!data?.name) throw new Error(`${doctype} đã tạo nhưng không trả về số chứng từ.`);
  return { ...data, name: data.name };
}

async function updateDoc(
  call: ProductionPlatformCall,
  doctype: string,
  name: string,
  document: Json,
): Promise<void> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(document),
  });
  if (!response.ok) throw new Error(`Không cập nhật được ${doctype} ${name}: ${(await response.text()).slice(0, 180)}`);
}

function parsedPolicies(raw: RawPolicy[]): Array<{ parsed: DoorFormulaPolicy; raw: RawPolicy }> {
  return raw.map((row) => ({ parsed: parseDoorPolicy(row), raw: row }));
}

/**
 * `rayType` là loại ray khai trên DÒNG BÁN, không phải thuộc tính của nhóm hàng — nên nó
 * phải đi vào đây thay vì được suy ra. Trống thì không lọc, giữ nguyên dữ liệu cũ.
 */
function choosePolicy(
  rawPolicies: RawPolicy[],
  doorType: DoorType,
  itemGroup: string,
  rayType?: string,
): { parsed: DoorFormulaPolicy; raw: RawPolicy } {
  const pairs = parsedPolicies(rawPolicies);
  const wantedRay = RAY_TYPES.find((entry) => entry === text(rayType));
  const parsed = selectDoorPolicy(pairs.map((entry) => entry.parsed), doorType, itemGroup, wantedRay);
  const pair = pairs.find((entry) => entry.parsed.policy_name === parsed.policy_name);
  if (!pair) throw new Error(`Không đọc được chi tiết chính sách ${parsed.policy_name}.`);
  return pair;
}

function australianStep(raw: number): number {
  const whole = Math.floor(raw);
  const firstDecimal = Math.floor((raw - whole) * 10 + 1e-9);
  if (firstDecimal === 0) return whole;
  if (firstDecimal <= 3) return whole + 0.3;
  if (firstDecimal <= 7) return whole + 0.7;
  return whole + 1;
}

function policyVersion(policy: RawPolicy): string {
  const payload = [
    text(policy.policy_name ?? policy.name),
    text(policy.door_type),
    text(policy.item_group),
    text(policy.leaf_formula),
    text(policy.leaf_height_deduction_m),
    text(policy.leaf_divisor_source),
    text(policy.leaf_divisor_const),
    text(policy.leaf_rounding),
    text(policy.leaf_round_threshold),
    text(policy.geometry_profile),
    JSON.stringify(policy.geometry_rules ?? []),
    JSON.stringify(policy.leaf_variants ?? []),
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function calculateLeafPlan(policy: RawPolicy, line: Json): LeafPlan {
  const formula = text(policy.leaf_formula);
  if (!formula) throw new Error(`${text(policy.policy_name ?? policy.name)}: chưa khai Dạng công thức chia lá.`);
  const height = finitePositive(line.height_m, "Cao phủ bì");
  const deductionInput = policy.leaf_height_deduction_m ?? line.leaf_height_deduction_m;
  if (deductionInput === undefined || deductionInput === null || deductionInput === "") {
    throw new Error(`${text(policy.policy_name ?? policy.name)}: chưa khai Trừ chiều cao trước khi chia; nhập rõ 0 nếu loại cửa không trừ.`);
  }
  const deduction = finiteNonNegative(deductionInput, "Trừ chiều cao trước khi chia");
  const effective = height - deduction;
  if (!(effective > 0)) throw new Error(`Chiều cao sau khi trừ phải lớn hơn 0: ${height} − ${deduction}.`);
  /**
   * `||` chứ KHÔNG phải `??`. Chính sách nào lấy ước số từ bản lá của từng mã thì để trống ô
   * hằng số — mà "để trống" trong kho này là chuỗi `"0"`, không phải null. `??` chỉ rơi xuống
   * khi null/undefined nên nó giữ nguyên `"0"`, rồi `finitePositive` ném "Ước số chia lá phải
   * lớn hơn 0" và KHÔNG BAO GIỜ đọc tới bản lá của mã. Đo trên dữ liệu Alumdoor 21/08/2026:
   * chính sách "Cửa CN Đức" khai `leaf_divisor_source = "Bản lá của bộ quy cách"` cùng với
   * `leaf_divisor_const = "0"` — tức toàn bộ 15 mã cửa Đức không tính nổi số lá.
   *
   * `||` coi `"0"`, `""`, `0` đều là chưa khai, và đó đúng là ý nghĩa của chúng ở đây: ước số
   * chia bằng 0 vốn vô nghĩa nên không có giá trị hợp lệ nào bị `||` nuốt mất.
   */
  const divisor = finitePositive(policy.leaf_divisor_const || line.leaf_divisor_m, "Ước số chia lá");
  const rounding = text(policy.leaf_rounding ?? line.leaf_rounding) as LeafRounding;
  if (!["Ngưỡng trừ-một-lá", "Nấc 0-0.3-0.7-1", "Làm tròn xuống"].includes(rounding)) {
    throw new Error(`${text(policy.policy_name ?? policy.name)}: chưa khai Cách làm tròn số lá.`);
  }

  let addend = 0;
  let raw = effective / divisor;
  let leafVariant = "";
  if (formula === "Kiểu Úc") {
    leafVariant = text(line.leaf_variant);
    if (!leafVariant) throw new Error("Cửa Úc cần chọn Biến thể chia lá theo loại motor.");
    const normalizedLeafVariant = normalized(leafVariant);
    const variant = (policy.leaf_variants ?? []).find(
      (entry) => normalized(entry.variant_label) === normalizedLeafVariant,
    );
    if (!variant) throw new Error(`${text(policy.policy_name ?? policy.name)}: chưa khai biến thể ${leafVariant}.`);
    addend = finiteNonNegative(variant.addend, `Cộng thêm ${leafVariant}`);
    raw += addend;
  }

  let count: number;
  if (rounding === "Nấc 0-0.3-0.7-1") {
    count = australianStep(raw);
  } else if (rounding === "Làm tròn xuống") {
    count = Math.floor(raw + 1e-9);
  } else {
    const threshold = finiteNonNegative(policy.leaf_round_threshold ?? 0.6, "Ngưỡng làm tròn");
    if (threshold > 1) throw new Error("Ngưỡng làm tròn phải từ 0 đến 1.");
    const after = raw - 1;
    if (!(after > 0)) throw new Error("Số lá sau khi trừ một lá phải lớn hơn 0.");
    const fraction = after - Math.floor(after);
    count = fraction >= threshold ? Math.ceil(after) : Math.floor(after);
  }
  if (!(count > 0)) throw new Error("Số lá tính được phải lớn hơn 0.");

  const result: LeafPlan = {
    leaf_formula: formula,
    ...(leafVariant ? { leaf_variant: leafVariant } : {}),
    height_basis_m: roundTo(height),
    height_deduction_m: roundTo(deduction),
    divisor_m: roundTo(divisor),
    raw_leaf_count: roundTo(raw),
    leaf_count: roundTo(count),
    explanation: `${formula}: (${roundTo(height)} − ${roundTo(deduction)}) ÷ ${roundTo(divisor)}`
      + (leafVariant ? ` + ${roundTo(addend)} (${leafVariant})` : "")
      + ` = ${roundTo(raw)} → ${roundTo(count)} lá (${rounding}).`,
  };

  if (formula === "Kiểu tấm liền Úc") {
    const single = finiteNonNegative(line.single_layer_leaf_count ?? 0, "Số lá một lớp");
    if (single > count) throw new Error(`Số lá một lớp ${single} không được lớn hơn tổng ${count}.`);
    result.single_layer_leaf_count = roundTo(single);
    result.double_layer_leaf_count = roundTo(count - single);
    result.explanation += ` AL70: ${roundTo(single)} lá một lớp, ${roundTo(count - single)} lá hai lớp.`;
  }
  return result;
}

function parseMinutes(value: unknown): number | null {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const source = normalized(value).replaceAll(",", ".");
  if (!source) return null;
  const hours = Number(source.match(/(\d+(?:\.\d+)?)\s*(?:giờ|gio|h)/)?.[1] ?? 0);
  const minutes = Number(source.match(/(\d+(?:\.\d+)?)\s*(?:phút|phut|p)/)?.[1] ?? 0);
  const total = hours * 60 + minutes;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function findStandard(
  standards: ProductionStandard[], doorType: DoorType, department: string, on: string, quantity: { area_sqm: number; sets: number },
): { minutes: number; basis?: string; warning?: string } {
  const candidates = standards
    .filter((row) => activeOn(row, on))
    .filter((row) => !text(row.door_type) || text(row.door_type) === doorType)
    .filter((row) => text(row.department) === department || text(row.department) === doorType)
    .map((row) => {
      const parsed = parseMinutes(row.minutes_per_unit ?? row.minutes_per_set ?? row.standard_time);
      const operation = normalized(row.operation);
      return { row, minutes: parsed ?? (operation.includes("sơn") || operation.includes("son") ? 180 : null) };
    })
    .filter((entry): entry is { row: ProductionStandard; minutes: number } => entry.minutes !== null)
    .sort((left, right) => Number(right.row.minutes_per_set != null) - Number(left.row.minutes_per_set != null));
  if (!candidates.length) {
    return { minutes: 0, warning: `Chưa có định mức phút cho ${doorType}/${department}.` };
  }
  const selected = candidates[0]!;
  const operation = normalized(selected.row.operation);
  const inferredBasis = operation.includes("sơn") || operation.includes("son")
    ? "batch"
    : ["Cửa Úc", "Cửa Lưới", "Cửa tấm liền Úc"].includes(doorType) ? "m2" : "set";
  const basis = text(selected.row.capacity_basis) || inferredBasis;
  const factor = basis === "m2" ? quantity.area_sqm
    : basis === "batch" ? Math.ceil(quantity.sets / Math.max(1, Number(selected.row.batch_capacity ?? 1)))
      : quantity.sets;
  return { minutes: roundTo(selected.minutes * factor, 2), basis };
}

function productionDepartment(doorType: DoorType): string {
  return doorType === "Cửa tấm liền Úc" ? "Cửa Úc" : doorType;
}

function raySpecificGeometry(
  doorType: DoorType,
  chosen: { parsed: DoorFormulaPolicy; raw: RawPolicy },
  profile: GeometryProfileDoc | undefined,
  row: Json,
  customerGroup: CustomerGroup,
  width: number,
  height: number,
): { cut_width_m: number; ray_type: string; applied_rules: string[] } | null {
  if (doorType !== "Cửa tấm liền Úc") return null;
  const rayType = text(row.ray_type);
  if (!rayType) throw new Error("Cửa tấm liền Úc cần chọn Loại ray theo từng dòng (Ray sắt U70 hoặc Ray hộp/đơn U76).");
  const profileName = text(chosen.raw.geometry_profile);
  if (!profileName) throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Profile.`);
  if (!profile || checked(profile.disabled)) throw new Error(`${chosen.parsed.policy_name}: không đọc được Geometry Profile đang hiệu lực ${profileName}.`);
  const rules = Array.isArray(chosen.raw.geometry_rules) ? chosen.raw.geometry_rules : [];
  if (!rules.length) throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Rules.`);
  /**
   * MÃ Ô HÌNH HỌC PHẢI TRÙNG VỚI DANH MỤC `Geometry Field`, và danh mục đó dùng gạch nối:
   * RONG-CAT-LA · CAO-PB · RONG-PB-RAY. Code trước đây tra CAT_LA_RONG / PB_CAO / PB_RAY_RONG —
   * hai bộ từ vựng không có một chữ nào chung, nên bộ lọc dưới đây luôn ra RỖNG và mọi dòng cửa
   * tấm liền Úc chết với "Loại ray ... không được hỗ trợ. Cho phép: ." — thông báo tự nó đã lộ
   * ra danh sách rỗng mà không ai đọc ra nghĩa.
   */
  const supportedRayTypes = [...new Set(
    rules
      .filter((rule) => text(rule.target_field) === "RONG-CAT-LA")
      .map((rule) => text(rule.ray_type))
      .filter(Boolean),
  )];
  if (!supportedRayTypes.includes(rayType)) {
    throw new Error(`Loại ray ${rayType} không được ${chosen.parsed.policy_name} hỗ trợ. Cho phép: ${supportedRayTypes.join(", ")}.`);
  }
  const result = evaluateGeometryRules({
    policy_name: chosen.parsed.policy_name,
    geometry_profile: profileName,
    profile_fields: Array.isArray(profile.fields) ? profile.fields : [],
    rules,
    inputs: { "CAO-PB": height, "RONG-PB-RAY": width },
    context: {
      customer_group: customerGroup,
      ray_type: rayType,
      has_butterfly_bracket: checked(row.has_butterfly_bracket),
    },
    required_targets: ["RONG-CAT-LA"],
  });
  const cutWidth = finitePositive(result.values["RONG-CAT-LA"], "Rộng cắt lá theo Geometry Policy");
  return { cut_width_m: roundTo(cutWidth), ray_type: rayType, applied_rules: result.applied_rules.map((entry) => entry.rule_code) };
}

function bomItemKey(value: unknown): string {
  return text(value)
    .replace(/m²/gi, "M")
    .replaceAll("㎡", "M")
    // Catalog imports preserve Vietnamese display names while several legacy
    // BOM exports use their unaccented equivalents (ĐL/TRỌN BỘ vs DL/TRONBO).
    // Compare those as the same business code, not as two different products.
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[Đđ]/g, "D")
    .toLocaleUpperCase("vi")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function isFullSetSalesItemCode(value: unknown): boolean {
  return bomItemKey(value).includes("TRONBO");
}

/**
 * Mã hàng có nói TÁCH MÓN không — cùng ba cách viết mà nguồn dùng.
 *
 * `scripts/lib/alumdoor-sales-bom-composition.mjs` đo trên `ms-lien/ĐM.md`: 2 mã viết `TACHMON`
 * và 4 mã chỉ có hậu tố ` - TM` (`TP-LUOI-MV-STD - TM`, `TP-LUOI-SN-STD - TM`,
 * `TP-LUOI-SNPHI19-INOX - TM`, `TP-LUOIMV-INOX- TM`). `TM` chỉ tính ở CUỐI mã: hai chữ quá ngắn
 * để nhận ở giữa.
 *
 * Cho toàn bộ vị từ này chạy qua 569 mã phân biệt của `ĐM.md` + `app-vat-tu/BaoCao.md`: khớp
 * đúng 6 mã, đúng 6 mã tách món thật, KHÔNG mã nào trúng oan, và giao với
 * `isFullSetSalesItemCode` (94 mã) là RỖNG.
 */
function isSplitSalesItemCode(value: unknown): boolean {
  const key = bomItemKey(value);
  return key.includes("TACHMON") || key.includes("CHILA") || key.endsWith("TM");
}

/**
 * Dòng bán này có cấu thành để xổ không.
 *
 * Trước đây cổng này chỉ là `isFullSetSalesItemCode` — dò chuỗi `TRONBO` trong MÃ HÀNG. Hai chỗ
 * hỏng đo được:
 *
 *  1. HÔM NAY: bộ dựng template cấu thành đã sinh template cho cả 6 mặt hàng TÁCH MÓN, nhưng mã
 *     của chúng không chứa `TRONBO` nên cổng từ chối trước khi tới `inspectSalesLineBom
 *     Composition` — 6 template đó là hàng chết, không đơn nào xổ được.
 *  2. SAU KHI GỘP MÃ: mã sạch token thì không mã nào còn `TRONBO`, cổng từ chối 100% cửa lưới.
 *
 * Nên hỏi thêm CÁCH GIAO trên dòng bán (`sales_mode`, Select hai giá trị đã có trên Quotation /
 * Sales Order / Sales Invoice Item). Dòng nào khai cách giao là dòng nói rõ nó cần cấu thành
 * nào — đó chính là fact đã được trả về dòng bán thay vì nhét trong mã.
 *
 * Vẫn giữ hai phép dò mã làm ĐƯỜNG LUI cho 100 mã còn nhồi cách giao: chúng chưa được gộp, và
 * dòng bán cũ để trống `sales_mode` thì vẫn phải chạy như trước.
 */
function salesLineHasComposition(itemCode: string, args: Json): boolean {
  if (text(args.sales_mode)) return true;
  return isFullSetSalesItemCode(itemCode) || isSplitSalesItemCode(itemCode);
}

function sameBomItem(left: unknown, right: unknown): boolean {
  const leftKey = bomItemKey(left);
  return Boolean(leftKey) && leftKey === bomItemKey(right);
}

function bomItemSpecificity(candidate: unknown, itemCode: string): number {
  const candidateCode = text(candidate);
  if (!candidateCode) return -1;
  if (candidateCode === text(itemCode)) return 2;
  if (normalized(candidateCode) === normalized(itemCode)) return 1;
  return sameBomItem(candidateCode, itemCode) ? 0 : -1;
}

function compareBomCandidates(left: BomDoc, right: BomDoc, itemCode: string): number {
  return (bomItemSpecificity(right.item, itemCode) - bomItemSpecificity(left.item, itemCode))
    || (Number(Boolean(text(right.color))) - Number(Boolean(text(left.color))))
    || (Number(right.revision ?? 0) - Number(left.revision ?? 0));
}

function sameBomSelectionLevel(left: BomDoc, right: BomDoc, itemCode: string): boolean {
  return bomItemSpecificity(left.item, itemCode) === bomItemSpecificity(right.item, itemCode)
    && Boolean(text(left.color)) === Boolean(text(right.color))
    && Number(left.revision ?? 0) === Number(right.revision ?? 0);
}

function bomConflictNames(rows: BomDoc[]): string {
  return rows.map((row) => text(row.name)).filter(Boolean).join(", ");
}

function selectBom(boms: BomDoc[], itemCode: string, color: string, on: string, allowMissing = false): string {
  const candidates = boms
    .filter((row) => sameBomItem(row.item, itemCode) && row.docstatus === 1)
    .filter((row) => !checked(row.generated_by_configurator))
    .filter((row) => color ? !text(row.color) || text(row.color) === color : !text(row.color))
    .filter((row) => (row.bom_status ? row.bom_status === "Active" : checked(row.is_active)))
    .filter((row) => activeOn(row, on))
    .sort((left, right) => compareBomCandidates(left, right, itemCode));
  if (!candidates.length) {
    if (allowMissing) return "";
    throw new Error(`${itemCode}: chưa có BOM đang hiệu lực${color ? ` cho màu ${color}` : ""}.`);
  }
  const conflicts = candidates.filter((row) => sameBomSelectionLevel(row, candidates[0]!, itemCode));
  if (conflicts.length > 1) {
    throw new Error(`${itemCode}: có ${conflicts.length} BOM đang hiệu lực cùng mức (${bomConflictNames(conflicts)}); cần tăng revision hoặc vô hiệu hóa bản trùng.`);
  }
  return text(candidates[0]!.name);
}

function selectPreviewBom(boms: BomDoc[], itemCode: string, color: string, on: string): string {
  const active = selectBom(boms, itemCode, color, on, true);
  if (active) return active;
  const draft = boms
    // The list API exposes the payload fields only; imported BOMs are drafts
    // unless a docstatus is explicitly present on the row.
    .filter((row) => sameBomItem(row.item, itemCode) && Number(row.docstatus ?? 0) === 0)
    .filter((row) => !checked(row.generated_by_configurator))
    .filter((row) => color ? !text(row.color) || text(row.color) === color : !text(row.color))
    .filter((row) => row.bom_status ? row.bom_status === "Draft" : checked(row.is_active))
    .filter((row) => activeOn(row, on))
    .sort((left, right) => compareBomCandidates(left, right, itemCode));
  const conflicts = draft.length
    ? draft.filter((row) => sameBomSelectionLevel(row, draft[0]!, itemCode))
    : [];
  if (conflicts.length > 1) {
    throw new Error(`${itemCode}: có ${conflicts.length} BOM nháp cùng mức${color ? ` cho màu ${color}` : ""} (${bomConflictNames(conflicts)}); cần tăng revision hoặc vô hiệu hóa bản trùng.`);
  }
  return text(draft[0]?.name);
}

export function buildSalesProductionLines(input: BuildInputs, options: { allow_missing_bom?: boolean } = {}): SalesProductionLine[] {
  const sales = input.sales;
  const customerGroup = text(sales.customer_group) as CustomerGroup;
  if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
    throw new Error(`Đơn hàng ${sales.name} chưa có Nhóm giá Đại lý/Lẻ.`);
  }
  const on = dateOnly(sales.delivery_date) || new Date().toISOString().slice(0, 10);
  const lines: SalesProductionLine[] = [];
  for (const [index, row] of (sales.items ?? []).entries()) {
    const itemCode = text(row.item_code);
    if (!itemCode) continue;
    const item = input.items.get(itemCode);
    if (!item) throw new Error(`Dòng ${index + 1}: không đọc được Item ${itemCode}.`);
    if (!isAreaFinishedProduct(item)) continue;
    const doorType = inferDoorType(item.door_type, item.item_group);
    if (!doorType) continue;
    const itemGroup = text(item.item_group);
    const sourceRow = text(row.row_id ?? row.name) || `R${index + 1}`;
    const width = finitePositive(row.width_m, `Dòng ${index + 1}: Rộng`);
    const height = finitePositive(row.height_m, `Dòng ${index + 1}: Cao`);
    const sets = positiveInteger(row.set_count ?? 1, `Dòng ${index + 1}: Số bộ`);
    const salesMode = (text(row.sales_mode) || "Trọn bộ") as SalesMode;
    if (salesMode !== "Trọn bộ" && salesMode !== "Tách món") throw new Error(`Dòng ${index + 1}: Cách bán không hợp lệ.`);
    const chosen = choosePolicy(input.policies, doorType, itemGroup, text(row.ray_type));
    const formula = calculateDoorFormula(chosen.parsed, {
      door_type: doorType,
      item_group: itemGroup,
      customer_group: customerGroup,
      sales_mode: salesMode,
      has_butterfly_bracket: checked(row.has_butterfly_bracket),
      is_manual_pull: checked(row.is_manual_pull) || isManualPullGroup(itemGroup),
      measured_width_m: width,
      cover_height_m: height,
      ...(row.mesh_height_m == null || row.mesh_height_m === "" ? {} : { mesh_height_m: Number(row.mesh_height_m) }),
      set_count: sets,
      min_area_sqm: Number(item.min_area_sqm ?? 0) || 0,
      ...(Number(item.purchase_kg_per_m2 ?? 0) > 0 ? { kg_per_m2: Number(item.purchase_kg_per_m2) } : {}),
      purpose: chosen.parsed.purchase_formula === "Barem kg/m2" ? "all" : "sales",
    });
    const geometry = raySpecificGeometry(
      doorType,
      chosen,
      input.geometry_profiles?.get(text(chosen.raw.geometry_profile)),
      row,
      customerGroup,
      width,
      height,
    );
    const liveCutWidth = geometry?.cut_width_m ?? finitePositive(formula.cut_width_m, "Rộng cắt lá");
    const leaf = calculateLeafPlan(chosen.raw, row);
    const department = productionDepartment(doorType);
    const billablePerSet = roundTo(finitePositive(formula.billable_area_sqm, "Diện tích tính tiền") / sets);
    const standard = findStandard(input.standards, doorType, department, on, { area_sqm: billablePerSet, sets: 1 });
    const estimatedWeightPerSet = formula.purchase_kg == null ? undefined : roundTo(Number(formula.purchase_kg) / sets);
    const color = text(row.color);
    const bomNo = selectBom(input.boms, itemCode, color, on, Boolean(options.allow_missing_bom));
    const stockUom = text(item.stock_uom) || "Bộ";
    const outputQty = ["m2", "m²", "sqm"].includes(normalized(stockUom)) ? billablePerSet : 1;
    const formulaVersion = policyVersion(chosen.raw);
    const paintRequired = checked(row.paint_required) ? 1 : 0;
    const bomActualComponents = normalizeBomActualComponents(row.bom_actual_components);

    for (let setNo = 1; setNo <= sets; setNo += 1) {
      const lineKey = `${sourceRow}-SET-${setNo}`;
      const snapshot = {
        schema_version: 1,
        sales_order: sales.name,
        sales_order_row_id: sourceRow,
        request_line_key: lineKey,
        item_code: itemCode,
        item_group: itemGroup,
        door_type: doorType,
        customer_group: customerGroup,
        sales_mode: salesMode,
        width_m: roundTo(width),
        height_m: roundTo(height),
        mesh_height_m: row.mesh_height_m == null || row.mesh_height_m === "" ? null : roundTo(Number(row.mesh_height_m)),
        set_no: setNo,
        formula_policy: chosen.parsed.policy_name,
        formula_version: formulaVersion,
        width_basis: formula.width_basis,
        cut_width_m: liveCutWidth,
        billable_area_sqm: billablePerSet,
        leaf,
        estimated_weight_kg: estimatedWeightPerSet ?? null,
        estimated_minutes: standard.minutes,
        bom_actual_components: bomActualComponents,
        ray_type: geometry?.ray_type ?? null,
        geometry_applied_rules: geometry?.applied_rules ?? [],
      };
      lines.push({
        request_line_key: lineKey,
        sales_order_row_id: sourceRow,
        item_code: itemCode,
        item_group: itemGroup,
        door_type: doorType,
        ...(geometry?.ray_type ? { ray_type: geometry.ray_type } : {}),
        department,
        set_no: setNo,
        set_count: 1,
        width_m: roundTo(width),
        height_m: roundTo(height),
        ...(row.mesh_height_m == null || row.mesh_height_m === "" ? {} : { mesh_height_m: roundTo(Number(row.mesh_height_m)) }),
        ...(color ? { color } : {}),
        ...(text(row.motor_model) ? { motor_model: text(row.motor_model) } : {}),
        sales_mode: salesMode,
        formula_policy: chosen.parsed.policy_name,
        formula_version: formulaVersion,
        width_basis: formula.width_basis,
        cut_width_m: roundTo(liveCutWidth),
        billable_area_sqm: billablePerSet,
        leaf_count: leaf.leaf_count,
        ...(leaf.single_layer_leaf_count == null ? {} : { single_layer_leaf_count: leaf.single_layer_leaf_count }),
        ...(leaf.double_layer_leaf_count == null ? {} : { double_layer_leaf_count: leaf.double_layer_leaf_count }),
        ...(estimatedWeightPerSet == null ? {} : { estimated_weight_kg: estimatedWeightPerSet }),
        estimated_minutes: standard.minutes,
        ...(standard.warning ? { schedule_warning: standard.warning } : {}),
        source_warehouse: input.source_warehouse,
        target_warehouse: input.target_warehouse,
        bom_no: bomNo,
        output_qty: roundTo(outputQty),
        stock_uom: stockUom,
        paint_required: paintRequired as 0 | 1,
        formula_snapshot: JSON.stringify(snapshot),
        ...(bomActualComponents.length ? { bom_actual_components: bomActualComponents } : {}),
        ...(text(row.accessories) ? { accessories: text(row.accessories) } : {}),
        ...(text(row.install_note) ? { install_note: text(row.install_note) } : {}),
        ...(text(row.note) ? { note: text(row.note) } : {}),
      });
    }
  }
  if (!lines.length) throw new Error(`Đơn hàng ${sales.name} không có dòng thành phẩm cửa cần sản xuất.`);
  return lines;
}

async function loadBuildInputs(call: ProductionPlatformCall, args: Json): Promise<BuildInputs> {
  const order = text(args.sales_order);
  if (!order) throw new Error("Cần chọn Đơn hàng.");
  const sourceWarehouse = text(args.source_warehouse);
  const targetWarehouse = text(args.target_warehouse);
  if (!sourceWarehouse || !targetWarehouse) throw new Error("Cần chọn Kho nguyên vật liệu và Kho nhập thành phẩm.");
  const sales = await readDoc<SalesOrderDoc>(call, "Sales Order", order);
  if (sales.docstatus !== 1) throw new Error(`Đơn hàng ${order} chưa ghi sổ.`);
  const codes = [...new Set((sales.items ?? []).map((row) => text(row.item_code)).filter(Boolean))];
  const [itemRows, policies, standards, boms] = await Promise.all([
    Promise.all(codes.map(async (code) => [code, await readDoc<ItemDoc>(call, "Item", code)] as const)),
    listDocs<RawPolicy>(call, "Cutting Policy", [
      "name", "policy_name", "door_type", "item_group",
      "dealer_width_basis", "retail_width_basis", "dealer_cut_deduction_m", "retail_cut_deduction_m",
      "butterfly_cut_deduction_m", "dealer_split_sales_basis", "dealer_full_sales_basis", "retail_sales_basis",
      "manual_pull_sales_basis", "purchase_formula", "purchase_height_basis", "purchase_width_basis",
      "priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",
      "leaf_divisor_source", "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold", "leaf_variants",
    ]),
    listDocs<ProductionStandard>(call, "Production Standard", [
      "name", "department", "door_type", "operation", "minutes_per_set", "minutes_per_unit", "capacity_basis", "batch_capacity",
      "persons", "shift_hours", "efficiency", "workstation", "default_overtime_hours", "standard_time",
      "effective_from", "effective_to", "disabled",
    ]).catch(() => []),
    listDocs<BomDoc>(call, "Bill of Materials", [
      "name", "item", "color", "docstatus", "is_active", "bom_status",
      "effective_from", "effective_to", "revision", "generated_by_configurator",
    ]),
  ]);
  const fullPolicies = await Promise.all(policies.map(async (policy) => {
    const name = text(policy.name);
    return name ? { ...policy, ...await readDoc<RawPolicy>(call, "Cutting Policy", name) } : policy;
  }));
  const geometryProfileNames = [...new Set(fullPolicies.map((policy) => text(policy.geometry_profile)).filter(Boolean))];
  const geometryProfiles = new Map(await Promise.all(geometryProfileNames.map(async (name) => [
    name,
    await readDoc<GeometryProfileDoc>(call, "Geometry Profile", name),
  ] as const)));
  return {
    sales,
    items: new Map(itemRows),
    policies: fullPolicies,
    geometry_profiles: geometryProfiles,
    standards,
    boms,
    source_warehouse: sourceWarehouse,
    target_warehouse: targetWarehouse,
  };
}

export async function calculateSalesProductionLine(
  call: ProductionPlatformCall,
  args: Json,
): Promise<Response> {
  try {
    const itemCode = text(args.item_code);
    if (!itemCode) throw new Error("Cần chọn mặt hàng cửa.");
    const item = await readDoc<ItemDoc>(call, "Item", itemCode);
    const isAreaFinished = isAreaFinishedProduct(item);
    if (!isAreaFinished) {
      throw new Error(`${itemCode} không phải thành phẩm tính theo m2.`);
    }
    const doorType = inferDoorType(item.door_type, item.item_group);
    if (!doorType) throw new Error(`${itemCode} chưa khai Loại cửa.`);
    const customerGroup = text(args.customer_group) as CustomerGroup;
    if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
      throw new Error("Cần Nhóm giá Đại lý/Lẻ để chọn đúng công thức.");
    }
    const salesMode = (text(args.sales_mode) || "Trọn bộ") as SalesMode;
    if (salesMode !== "Trọn bộ" && salesMode !== "Tách món") throw new Error("Cách bán không hợp lệ.");
    const [policies, standards] = await Promise.all([
      listDocs<RawPolicy>(call, "Cutting Policy", [
        "name", "policy_name", "door_type", "item_group",
        "dealer_width_basis", "retail_width_basis", "dealer_cut_deduction_m", "retail_cut_deduction_m",
        "butterfly_cut_deduction_m", "dealer_split_sales_basis", "dealer_full_sales_basis", "retail_sales_basis",
        "manual_pull_sales_basis", "purchase_formula", "purchase_height_basis", "purchase_width_basis",
        // Keep this projection limited to fields present on the tenant's
        // Cutting Policy DocType. Leaf-specific values are optional and are
        // read when the tenant has the extended fields; requesting unknown
        // columns makes the whole list call fail with HTTP 417 and leaves the
        // sales quantity blank.
        "priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",
        "leaf_divisor_source", "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold",
      ]).catch(() => listDocs<RawPolicy>(call, "Cutting Policy", [
        "name", "policy_name", "door_type", "item_group",
        "dealer_width_basis", "retail_width_basis", "dealer_cut_deduction_m", "retail_cut_deduction_m",
        "butterfly_cut_deduction_m", "dealer_split_sales_basis", "dealer_full_sales_basis", "retail_sales_basis",
        "manual_pull_sales_basis", "purchase_formula", "purchase_height_basis", "purchase_width_basis",
        // `ray_type` cũng nằm trong bản rút gọn: nó là trường NỀN của Cutting Policy, không
        // phải trường mở rộng như nhóm leaf_*. Bỏ nó ở đây thì đường dự phòng trả về chính
        // sách không mang loại ray, và mọi dòng có khai ray sẽ không khớp được chính sách nào.
        "priority", "disabled", "note", "ray_type",
      ])),
      listDocs<ProductionStandard>(call, "Production Standard", [
        "name", "department", "door_type", "operation", "minutes_per_set", "minutes_per_unit", "capacity_basis", "batch_capacity",
        "persons", "shift_hours", "efficiency", "workstation", "default_overtime_hours", "standard_time",
        "effective_from", "effective_to", "disabled",
      ]).catch(() => []),
    ]);
    const chosenSummary = choosePolicy(policies, doorType, text(item.item_group), text(args.ray_type));
    const chosenRaw = text(chosenSummary.raw.name)
      ? { ...chosenSummary.raw, ...await readDoc<RawPolicy>(call, "Cutting Policy", text(chosenSummary.raw.name)) }
      : chosenSummary.raw;
    const chosen = { parsed: parseDoorPolicy(chosenRaw), raw: chosenRaw };
    const geometryProfileName = text(chosen.raw.geometry_profile);
    if (doorType === "Cửa tấm liền Úc" && !geometryProfileName) {
      throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Profile.`);
    }
    const geometryProfile = doorType === "Cửa tấm liền Úc"
      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", geometryProfileName)
      : undefined;
    const sets = positiveInteger(args.set_count ?? 1, "Số bộ");
    const requestedPurpose = text(args.purpose).toLocaleLowerCase("vi");
    const formulaPurpose = requestedPurpose === "bán hàng" || requestedPurpose === "sales"
      ? "sales"
      : chosen.parsed.purchase_formula === "Barem kg/m2" ? "all" : "sales";
    const formula = calculateDoorFormula(chosen.parsed, {
      door_type: doorType,
      item_group: text(item.item_group),
      customer_group: customerGroup,
      sales_mode: salesMode,
      has_butterfly_bracket: checked(args.has_butterfly_bracket),
      is_manual_pull: checked(args.is_manual_pull) || isManualPullGroup(item.item_group),
      measured_width_m: finitePositive(args.width_m, "Rộng"),
      cover_height_m: finitePositive(args.height_m, "Cao"),
      ...(args.mesh_height_m == null || args.mesh_height_m === "" ? {} : { mesh_height_m: Number(args.mesh_height_m) }),
      set_count: sets,
      min_area_sqm: Number(item.min_area_sqm ?? 0) || 0,
      ...(Number(item.purchase_kg_per_m2 ?? 0) > 0 ? { kg_per_m2: Number(item.purchase_kg_per_m2) } : {}),
      // Màn bán chỉ cần trục m². Không được bắt Cao lưới/barem mua vào trước khi người bán
      // có thể báo giá; luồng tạo sản xuất vẫn để `all` và kiểm đủ đầu vào vật tư.
      purpose: formulaPurpose,
    });
    const geometry = raySpecificGeometry(
      doorType,
      chosen,
      geometryProfile,
      args,
      customerGroup,
      finitePositive(args.width_m, "Rộng"),
      finitePositive(args.height_m, "Cao"),
    );
    const liveCutWidth = geometry?.cut_width_m ?? finitePositive(formula.cut_width_m, "Rộng cắt lá");
    let leaf: LeafPlan | null = null;
    let leafError: string | null = null;
    try {
      leaf = calculateLeafPlan(chosen.raw, {
        ...args,
        leaf_divisor_m: args.leaf_divisor_m ?? item.leaf_divisor_m,
      });
    } catch (error) {
      leafError = error instanceof Error ? error.message : "Không tính được số lá.";
    }
    const department = productionDepartment(doorType);
    const standard = findStandard(standards, doorType, department, new Date().toISOString().slice(0, 10), {
      area_sqm: Number(formula.billable_area_sqm ?? 0) / sets,
      sets: 1,
    });
    return answer({
      ...formula,
      cut_width_m: roundTo(liveCutWidth),
      item_code: itemCode,
      item_group: text(item.item_group),
      door_type: doorType,
      department,
      leaf_formula: leaf?.leaf_formula ?? text(chosen.raw.leaf_formula),
      leaf_variant: leaf?.leaf_variant ?? (text(args.leaf_variant) || null),
      leaf_height_deduction_m: leaf?.height_deduction_m ?? chosen.raw.leaf_height_deduction_m ?? null,
      leaf_divisor_m: leaf?.divisor_m ?? args.leaf_divisor_m ?? item.leaf_divisor_m ?? chosen.raw.leaf_divisor_const ?? null,
      leaf_rounding: text(chosen.raw.leaf_rounding),
      ray_type: geometry?.ray_type ?? null,
      geometry_applied_rules: geometry?.applied_rules ?? [],
      leaf_count: leaf?.leaf_count ?? null,
      single_layer_leaf_count: leaf?.single_layer_leaf_count ?? null,
      double_layer_leaf_count: leaf?.double_layer_leaf_count ?? null,
      leaf_error: leafError,
      estimated_weight_kg: formula.purchase_kg == null ? null : roundTo(Number(formula.purchase_kg), 3),
      estimated_minutes: roundTo(standard.minutes * sets, 2),
      schedule_warning: standard.warning ?? null,
      // UI chỉ hiện chọn "Có bản bướm" khi chính sách đang áp có số trừ riêng.
      // Không bật checkbox chung cho các loại cửa/ray mà thao tác này không có tác dụng.
      supports_butterfly_bracket: chosen.parsed.butterfly_cut_deduction_m != null,
      formula_version: policyVersion(chosen.raw),
      formula_explanation: `${formula.explanation}${geometry ? ` Hình học: ${geometry.applied_rules.join(", ")}.` : ""}${leaf ? ` ${leaf.explanation}` : ""}`.trim(),
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không tính được chi tiết sản xuất.");
  }
}

async function resolveMissingLineBoms(
  call: ProductionPlatformCall,
  input: BuildInputs,
  lines: SalesProductionLine[],
  materialize: boolean,
): Promise<SalesProductionLine[]> {
  const company = text(input.sales.company);
  if (!company) throw new Error(`Đơn hàng ${input.sales.name} thiếu Công ty để sinh BOM.`);
  const output: SalesProductionLine[] = [];
  for (const line of lines) {
    if (text(line.bom_no)) {
      output.push(line);
      continue;
    }
    if (materialize) {
      const resolved = await resolveProductionLineBom(call, { line, company, materialize: true });
      if (!resolved.bom_no) throw new Error(`${line.item_code}: resolver không trả về BOM đã ghi sổ.`);
      output.push({
        ...line,
        bom_no: resolved.bom_no,
        bom_template: resolved.bom_template,
        bom_template_code: resolved.bom_template_code,
        bom_fingerprint: resolved.bom_fingerprint,
        bom_materialization_required: 0,
      });
      continue;
    }
    const preview = await previewProductionLineBom(call, { line, company });
    output.push({
      ...line,
      bom_no: preview.bom_no,
      bom_template: preview.bom_template,
      bom_template_code: preview.bom_template_code,
      bom_fingerprint: preview.bom_fingerprint,
      bom_materialization_required: preview.bom_no ? 0 : 1,
      bom_actual_requirements: preview.actual_requirements,
      missing_actual_component_keys: preview.missing_actual_component_keys,
      bom_actual_complete: preview.actual_complete ? 1 : 0,
    });
  }
  return output;
}

export async function previewDraftSalesBomRequirements(call: ProductionPlatformCall, args: Json): Promise<Response> {
  try {
    const itemCode = text(args.item_code);
    if (!itemCode) throw new Error("Cần chọn mặt hàng cửa.");
    const item = await readDoc<ItemDoc>(call, "Item", itemCode);
    if (!salesLineHasComposition(itemCode, args)) {
      return answer({
        item_code: itemCode,
        bom_applicable: false,
        bom_no: "",
        bom_template: "",
        bom_template_code: "",
        components: [],
        actual_requirements: [],
        missing_actual_component_keys: [],
        actual_complete: true,
        pending_fields: [],
        static_bom: false,
        reason: "Dòng bán chưa chọn Cách giao và mã hàng cũng không nói TRỌN BỘ / TÁCH MÓN, nên không có danh sách cấu thành để xổ.",
      });
    }
    const staticBoms = await listDocs<BomDoc>(call, "Bill of Materials", [
      "name", "item", "color", "docstatus", "is_active", "bom_status",
      "effective_from", "effective_to", "revision", "generated_by_configurator",
    ]).catch(() => []);
    const on = dateOnly(args.delivery_date) || new Date().toISOString().slice(0, 10);
    const staticBom = selectPreviewBom(staticBoms, itemCode, text(args.color), on);
    if (staticBom) {
      const staticBomDoc: Json = await readDoc<Json>(call, "Bill of Materials", staticBom).catch((): Json => ({}));
      const staticItems = Array.isArray(staticBomDoc.items)
        ? staticBomDoc.items.filter((row: unknown): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
        : [];
      const components = await enrichSalesBomComponents(call, staticItems.map((row: Json, index: number) => ({
        component_key: text(row.item_code) || `static-${index + 1}`,
        item_code: text(row.item_code),
        ...(text(row.color) ? { color: text(row.color) } : {}),
        ...(Number(row.width_pb_ray_m) > 0 ? { width_pb_ray_m: Number(row.width_pb_ray_m) } : {}),
        ...(Number(row.width_pb_nhua_m) > 0 ? { width_pb_nhua_m: Number(row.width_pb_nhua_m) } : {}),
        ...(Number(row.width_m) > 0 ? { width_m: Number(row.width_m) } : {}),
        ...(Number(row.height_m) > 0 ? { height_m: Number(row.height_m) } : {}),
        ...(Number(row.mesh_height_m) > 0 ? { mesh_height_m: Number(row.mesh_height_m) } : {}),
        ...(Number(row.cut_width_m) > 0 ? { cut_width_m: Number(row.cut_width_m) } : {}),
        ...(Number(row.length_m) > 0 ? { length_m: Number(row.length_m) } : {}),
        stock_uom: text(row.stock_uom) || text(row.uom),
        qty: Number(row.qty) || 0,
        note: text(row.note) || text(row.source_note),
        source_rule: "BOM tĩnh",
      })), args);
      return answer({
        item_code: itemCode,
        bom_applicable: true,
        bom_no: staticBom,
        bom_template: "",
        bom_template_code: "",
        components,
        actual_requirements: [],
        missing_actual_component_keys: [],
        actual_complete: true,
        static_bom: true,
      });
    }
    const stockUom = text(item.stock_uom) || "Bộ";
    const inspection = await inspectSalesLineBomComposition(call, {
      item_code: itemCode,
      output_qty: 1,
      source_warehouse: "",
      item_group: text(item.item_group),
      door_type: text(item.door_type),
      sales_mode: text(args.sales_mode) || "Trọn bộ",
      ...(Number(args.width_m) > 0 ? { width_m: Number(args.width_m) } : {}),
      ...(Number(args.height_m) > 0 ? { height_m: Number(args.height_m) } : {}),
      ...(args.mesh_height_m == null || args.mesh_height_m === "" ? {} : { mesh_height_m: Number(args.mesh_height_m) }),
      ...(Number(args.cut_width_m) > 0 ? { cut_width_m: Number(args.cut_width_m) } : {}),
      ...(Number(args.billable_area_sqm) > 0 ? { billable_area_sqm: Number(args.billable_area_sqm) } : {}),
      ...(Number(args.leaf_count) > 0 ? { leaf_count: Number(args.leaf_count) } : {}),
      ...(Number(args.single_layer_leaf_count) > 0 ? { single_layer_leaf_count: Number(args.single_layer_leaf_count) } : {}),
      ...(Number(args.double_layer_leaf_count) > 0 ? { double_layer_leaf_count: Number(args.double_layer_leaf_count) } : {}),
      ...(Number(args.estimated_weight_kg) > 0 ? { estimated_weight_kg: Number(args.estimated_weight_kg) } : {}),
      ...(text(args.color) ? { color: text(args.color) } : {}),
      ...(text(args.motor_model) ? { motor_model: text(args.motor_model) } : {}),
      paint_required: checked(args.paint_required) ? 1 : 0,
      ...(args.bom_actual_components === undefined ? {} : { bom_actual_components: normalizeBomActualComponents(args.bom_actual_components) }),
    });
    const components = await enrichSalesBomComponents(call, inspection.components as unknown as Json[], args);
    return answer({
      item_code: itemCode,
      bom_applicable: true,
      stock_uom: stockUom,
      output_qty: 1,
      static_bom: false,
      ...inspection,
      components,
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không xem trước được yêu cầu BOM của dòng bán.");
  }
}

export async function previewSalesProduction(call: ProductionPlatformCall, args: Json): Promise<Response> {
  try {
    const input = await loadBuildInputs(call, args);
    const draftItems = buildSalesProductionLines(input, { allow_missing_bom: true });
    const items = await resolveMissingLineBoms(call, input, draftItems, false);
    const warnings = [...new Set([
      ...items.map((line) => line.schedule_warning).filter((value): value is string => Boolean(value)),
      ...items.filter((line) => line.bom_actual_complete === 0).map((line) =>
        `${line.item_code} · bộ ${line.set_no}: thiếu vật tư BOM thực tế ${line.missing_actual_component_keys?.join(", ") || "chưa xác định"}.`),
    ])];
    return answer({
      sales_order: input.sales.name,
      customer: input.sales.customer,
      source_warehouse: input.source_warehouse,
      target_warehouse: input.target_warehouse,
      lines: items.length,
      work_orders: items.length,
      estimated_minutes: roundTo(items.reduce((sum, line) => sum + line.estimated_minutes, 0), 2),
      estimated_weight_kg: roundTo(items.reduce((sum, line) => sum + Number(line.estimated_weight_kg ?? 0), 0), 3),
      warnings,
      items,
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không lập được kế hoạch sản xuất.");
  }
}

async function findExistingRequest(call: ProductionPlatformCall, order: string): Promise<string> {
  const rows = await listDocs<{ name?: string }>(
    call,
    "Production Request",
    ["name", "sales_order", "request_state"],
    [["sales_order", "=", order]],
    10,
  ).catch(() => []);
  return text(rows.find((row) => row.name)?.name);
}

async function existingWorkOrder(call: ProductionPlatformCall, request: string, lineKey: string): Promise<string> {
  const rows = await listDocs<{ name?: string }>(
    call,
    "Work Order",
    ["name", "production_request", "production_request_line_key", "docstatus"],
    [["production_request", "=", request], ["production_request_line_key", "=", lineKey]],
    3,
  ).catch(() => []);
  return text(rows[0]?.name);
}

export async function createSalesProduction(call: ProductionPlatformCall, args: Json): Promise<Response> {
  try {
    const input = await loadBuildInputs(call, args);
    const draftLines = buildSalesProductionLines(input, { allow_missing_bom: true });
    const lines = await resolveMissingLineBoms(call, input, draftLines, true);
    const order = input.sales.name;
    let requestName = await findExistingRequest(call, order);
    let request: Json & { name?: string; modified?: string };
    if (requestName) {
      request = await readDoc<Json>(call, "Production Request", requestName);
    } else {
      request = await createDoc(call, "Production Request", {
        sales_order: order,
        customer: input.sales.customer,
        requested_on: new Date().toISOString(),
        delivery_date: input.sales.delivery_date,
        source_warehouse: input.source_warehouse,
        target_warehouse: input.target_warehouse,
        request_state: "Đang tạo lệnh",
        items: lines,
        note: text(args.note) || `Sinh từ đơn hàng ${order}.`,
      });
      requestName = text(request.name);
    }

    const created: string[] = [];
    const existing: string[] = [];
    for (const line of lines) {
      const prior = await existingWorkOrder(call, requestName, line.request_line_key);
      if (prior) {
        existing.push(prior);
        continue;
      }
      const workOrder = await createDoc(call, "Work Order", {
        production_item: line.item_code,
        bom_no: line.bom_no,
        company: input.sales.company,
        qty: line.output_qty,
        width_m: line.width_m,
        height_m: line.height_m,
        set_count: 1,
        leaf_count: line.leaf_count,
        color: line.color,
        motor_model: line.motor_model,
        source_warehouse: line.source_warehouse,
        target_warehouse: line.target_warehouse,
        against_sales_order: order,
        production_request: requestName,
        production_request_line_key: line.request_line_key,
        sales_order_row_id: line.sales_order_row_id,
        set_no: line.set_no,
        door_type: line.door_type,
        ...(line.ray_type ? { ray_type: line.ray_type } : {}),
        cut_width_m: line.cut_width_m,
        estimated_weight_kg: line.estimated_weight_kg,
        estimated_minutes: line.estimated_minutes,
        formula_policy: line.formula_policy,
        formula_version: line.formula_version,
        formula_snapshot: line.formula_snapshot,
        paint_required: line.paint_required,
        planned_start_date: text(args.planned_start_date) || new Date().toISOString(),
        planned_end_date: text(args.planned_end_date) || input.sales.delivery_date,
        install_address: input.sales.install_address,
        note: [line.accessories, line.install_note, line.note].filter(Boolean).join(" · "),
      });
      created.push(workOrder.name);
    }

    await updateDoc(call, "Production Request", requestName, {
      request_state: "Đã tạo lệnh",
      work_order_count: created.length + existing.length,
      modified: request.modified,
    }).catch(() => undefined);

    return answer({
      production_request: requestName,
      sales_order: order,
      work_orders: [...existing, ...created],
      created,
      existing,
      lines: lines.length,
      idempotent: created.length === 0,
      draft: true,
      message: `Đã lập ${lines.length} bộ sản xuất từ ${order}; tạo mới ${created.length}, đã có ${existing.length}.`,
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không tạo được yêu cầu sản xuất.");
  }
}

export async function validateProductionRequest(
  call: ProductionPlatformCall,
  subject: { action?: string; name?: string; payload?: Json },
): Promise<Response> {
  try {
    const current = subject.action === "save" && subject.name
      ? await readDoc<Json>(call, "Production Request", subject.name)
      : {};
    const doc = { ...current, ...(subject.payload ?? {}) };
    const rows = Array.isArray(doc.items) ? doc.items.filter((row): row is Json => Boolean(row) && typeof row === "object") : [];
    if (!text(doc.sales_order)) return refuse("Yêu cầu sản xuất phải liên kết Đơn hàng.");
    if (!rows.length) return refuse("Yêu cầu sản xuất phải có ít nhất một bộ.");
    const keys = rows.map((row) => text(row.request_line_key));
    if (keys.some((key) => !key)) return refuse("Mọi dòng sản xuất phải có khóa truy vết.");
    if (new Set(keys).size !== keys.length) return refuse("Khóa truy vết bộ sản xuất bị trùng.");
    for (const [index, row] of rows.entries()) {
      finitePositive(row.width_m, `Dòng ${index + 1}: rộng`);
      finitePositive(row.height_m, `Dòng ${index + 1}: cao`);
      finitePositive(row.leaf_count, `Dòng ${index + 1}: số lá`);
      if (!text(row.bom_no)) return refuse(`Dòng ${index + 1}: thiếu BOM đã ghi sổ.`);
      if (!text(row.formula_policy) || !text(row.formula_version) || !text(row.formula_snapshot)) {
        return refuse(`Dòng ${index + 1}: thiếu snapshot công thức.`);
      }
    }
    return answer({ ok: true });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Yêu cầu sản xuất không hợp lệ.");
  }
}

interface PaintSyncResult {
  cut_order: string;
  created: string[];
  existing: string[];
  cancelled: string[];
}

export async function syncPaintJobsFromCut(
  call: ProductionPlatformCall,
  cutOrderName: string,
  direction: 1 | -1,
): Promise<PaintSyncResult> {
  const cutOrder = text(cutOrderName);
  if (!cutOrder) throw new Error("Thiếu số phiếu cắt để đồng bộ sơn.");
  const cut = await readDoc<Json>(call, "Cut Order", cutOrder);
  const workOrder = text(cut.work_order);
  const existingRows = await listDocs<{ name?: string; modified?: string; state?: string }>(
    call,
    "Paint Job",
    ["name", "cut_order", "work_order", "state", "modified"],
    [["cut_order", "=", cutOrder]],
    200,
  ).catch(() => []);
  if (direction === -1) {
    const cancelled: string[] = [];
    for (const row of existingRows) {
      if (!row.name || row.state === "Đã huỷ") continue;
      await updateDoc(call, "Paint Job", row.name, { state: "Đã huỷ", modified: row.modified });
      cancelled.push(row.name);
    }
    return { cut_order: cutOrder, created: [], existing: [], cancelled };
  }
  if (!workOrder) return { cut_order: cutOrder, created: [], existing: [], cancelled: [] };
  const work = await readDoc<Json>(call, "Work Order", workOrder);
  const targetColor = text(cut.target_color ?? work.color);
  if (!targetColor) return { cut_order: cutOrder, created: [], existing: [], cancelled: [] };
  const existing = existingRows.map((row) => text(row.name)).filter(Boolean);
  if (existing.length) return { cut_order: cutOrder, created: [], existing, cancelled: [] };

  const created: string[] = [];
  const rows = Array.isArray(cut.items) ? cut.items.filter((row): row is Json => Boolean(row) && typeof row === "object") : [];
  for (const [index, row] of rows.entries()) {
    const bundleName = text(row.serial_and_batch_bundle);
    if (!bundleName) continue;
    const bundle = await readDoc<Json>(call, "Serial and Batch Bundle", bundleName);
    const entries = Array.isArray(bundle.entries) ? bundle.entries.filter((entry): entry is Json => Boolean(entry) && typeof entry === "object") : [];
    for (const entry of entries) {
      const batchNo = text(entry.batch_no);
      if (!batchNo) continue;
      const batch = await readDoc<Json>(call, "Batch", batchNo);
      if (!["thô", "tho"].includes(normalized(batch.condition))) continue;
      const job = await createDoc(call, "Paint Job", {
        work_order: workOrder,
        production_request: work.production_request,
        production_request_line_key: work.production_request_line_key,
        cut_order: cutOrder,
        batch_no: batchNo,
        item_code: text(row.item_code ?? batch.item_code),
        source_color: text(batch.color),
        target_color: targetColor,
        qty: Number(entry.qty ?? row.sheets_cut ?? 0),
        state: "Chờ sơn",
        planned_on: new Date().toISOString(),
        note: `Tự sinh từ dòng cắt ${index + 1} của ${cutOrder}; lô ${batchNo} đang ở tình trạng THÔ.`,
      });
      created.push(job.name);
    }
  }
  return { cut_order: cutOrder, created, existing: [], cancelled: [] };
}
