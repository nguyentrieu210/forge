import { roundTo } from "./numeric.js";
import { salesItemContext, type SalesPlatformCall } from "./sales-item-context.js";
import { calculateSalesProductionLine, type ProductionPlatformCall } from "./sales-production.js";
import { resolveSalesMode } from "./sales-production-core.js";
import { allowedColorNamesForGroup } from "./color-scopes.js";
import {
  parseDoorPolicy,
  rayTypeOf,
  selectDoorPolicy,
  type CustomerGroup,
  type DoorType,
} from "./door-formulas.js";
import {
  readGeometryProfileRuntime,
  type GeometryProfileRuntimeContract,
} from "./geometry-profile-runtime.js";

type Json = Record<string, unknown>;
type PlatformCall = SalesPlatformCall & ProductionPlatformCall;
type LinearSalesBasis = "RAY" | "TRUC";

const SALES_DOCTYPES = new Set(["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]);
const PURCHASE_DOCTYPES = new Set(["Supplier Quotation Item", "Purchase Order Item", "Purchase Receipt Item", "Purchase Invoice Item"]);
const AREA_UOMS = new Set(["m2", "m²", "sqm"]);
/*
 * Hai `inventory_mode` cùng cơ chế theo dõi (Dài×Rộng ra diện tích, tồn theo m²) nhưng KHÁC
 * mặt hàng thật: "Tấm/Kính" là tấm/kính, "Nan/lá cửa" là lá cửa cán từ tôn/nhôm. Trước 24/08
 * hai thứ dùng CHUNG chữ "Tấm/Kính" nên lá cửa bị gọi nhầm là kính; đã tách tên nhưng CƠ CHẾ
 * nhập liệu (Rộng cắt lá × Cao cắt lá) vẫn giống hệt nhau, nên các chỗ tính diện tích vẫn nhận
 * cả hai — chỉ nhãn/danh tính dữ liệu là tách riêng.
 */
const SHEET_AREA_MODES = new Set(["Tấm/Kính", "Nan/lá cửa"]);
const METRE_UOMS = new Set(["m", "mét", "met", "meter", "metre"]);
const SET_UOMS = new Set(["bộ", "bo", "set"]);
const PIECE_UOMS = new Set(["cây", "cay", "lá", "la", "đoạn", "doan"]);
const ITEM_DERIVED_FIELDS = [
  "conversion_factor", "uom", "stock_uom", "stock_qty", "inventory_mode", "measurement_profile", "min_area_sqm",
  "item_name", "description", "color", "colour", "rate", "standard_rate", "rate_requires_approval", "amount",
  "discount_percentage", "discount_amount", "standard_amount", "formula_policy", "formula_version", "formula_explanation",
  "width_basis", "cut_width_m", "billable_area_sqm", "door_type", "leaf_variant", "leaf_height_deduction_m",
  /*
   * SỐ ĐO cũng phải xoá khi đổi mã hàng.
   *
   * Mỗi loại cửa đo một kiểu khác nhau: Đức đại lý đo phủ bì NHỰA, Lưới đo phủ bì RAY, Tách món
   * đo RỘNG CẮT LÁ. Giữ lại con số của mã cũ là giữ một số đo đã đổi Ý NGHĨA — và tệ hơn, ô nào
   * server không nhắc tới thì client lấy "có giá trị" làm căn cứ hiện cột, nên số sót lại tự giữ
   * cột "Cao lưới" sống trên một đơn cửa Đức. `set_count` KHÔNG xoá: số bộ là ý định của người
   * bán, không đổi nghĩa theo mặt hàng.
   */
  "width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "mesh_height_m",
  "leaf_divisor_m", "leaf_rounding", "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count",
  "estimated_weight_kg", "estimated_minutes", "paint_required", "length_m", "qty_bundle", "qty_bar", "actual_weight_kg",
  "total_length_m", "material_specification", "theoretical_kg_per_m", "theoretical_kg", "actual_kg_per_m",
  "actual_kg_per_sqm", "so_no", "available_qty", "available_stock_qty", "available_stock_uom", "availability_status",
];

function answer(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function normalizedUom(value: unknown): string {
  return normalized(value);
}

function isAreaFinishedProduct(item: Json): boolean {
  return [item.inventory_mode, item.measurement_profile]
    .some((value) => normalized(value) === normalized("Thành phẩm theo m2"));
}

function effectiveInventoryMode(item: Json): string {
  return isAreaFinishedProduct(item) ? "Thành phẩm theo m2" : text(item.inventory_mode) || "Hàng thường";
}

function quantityLabelForUom(value: unknown): string {
  const uom = normalizedUom(value).replace(/\s+/g, "");
  if (["bộ", "bo", "set"].includes(uom)) return "Số bộ";
  if (["cái", "cai", "chiếc", "chiec", "piece"].includes(uom)) return "Số cái";
  if (["cặp", "cap", "pair"].includes(uom)) return "Số cặp";
  if (["cây", "cay", "thanh", "đoạn", "doan", "lá", "la"].includes(uom)) return "Số cây/đoạn";
  if (["cuộn", "cuon", "roll"].includes(uom)) return "Số cuộn";
  if (["thùng", "thung", "box"].includes(uom)) return "Số thùng";
  if (["kg", "kilogram"].includes(uom)) return "Khối lượng";
  if (["m", "mét", "met", "meter", "metre"].includes(uom)) return "Số mét";
  if (["m2", "m²", "sqm"].includes(uom)) return "Diện tích";
  return "Số lượng";
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(normalized(value));
}

function positive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sameNumber(left: unknown, right: unknown): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a - b) <= Math.max(0.000001, Math.abs(b) * 0.000001);
}

async function readDoc(call: PlatformCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

async function listDocs(
  call: PlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[],
  limit = 50,
): Promise<Json[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query.toString()}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Không tra được ${doctype} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json[] }).data ?? [];
}

/**
 * Chọn lại ĐVT theo master Item trước khi gọi salesItemContext.
 *
 * Một dòng bán có thể còn giữ UOM của mặt hàng trước đó. Nếu gửi thẳng giá trị
 * cũ lên context, context trả 422 và toàn bộ chuỗi autofill bị ngắt. UOM không
 * còn hợp lệ phải rơi về default_sales_uom (hoặc stock_uom), không được giữ lại.
 */
function resolveConfiguredSalesUom(item: Json, requested: unknown): string | undefined {
  const configured = [
    item.default_sales_uom,
    item.stock_uom,
    ...(Array.isArray(item.uom_conversions)
      ? item.uom_conversions.map((entry) => entry && typeof entry === "object" ? (entry as Json).uom : undefined)
      : []),
  ].map(text).filter(Boolean);
  if (!configured.length) return undefined;
  const requestedKey = normalized(requested);
  return configured.find((uom) => requestedKey && normalized(uom) === requestedKey)
    || text(item.default_sales_uom)
    || text(item.stock_uom)
    || configured[0];
}

function deriveLinearSalesBasis(item: Json): LinearSalesBasis | undefined {
  const itemName = normalized(item.item_name);
  const itemCode = normalized(item.item_code);
  if (itemName.startsWith("ray") || itemCode.includes("ray")) return "RAY";
  if (itemName.startsWith("trục") || itemName.startsWith("truc")
    || itemCode.includes("trục") || itemCode.includes("truc")) return "TRUC";
  return undefined;
}

function isWidthQuantitySalesItem(item: Json): boolean {
  const itemName = normalized(item.item_name);
  const itemCode = normalized(item.item_code).replace(/[ _-]+/g, "");
  return itemName.includes("bộ ba lá đáy")
    || itemName === "lá đầu"
    || itemCode.includes("bo3laday")
    || itemCode === "tpa282"
    || itemCode.includes("ladau");
}

function isOrdinaryQuantitySalesItem(item: Json): boolean {
  return effectiveInventoryMode(item) === "Hàng thường"
    && !deriveLinearSalesBasis(item)
    && !isWidthQuantitySalesItem(item);
}

function fieldSet(args: Json): Set<string> {
  return new Set(Array.isArray(args.child_fields)
    ? args.child_fields.map((value) => text(value)).filter(Boolean)
    : []);
}

function setIfField(patch: Json, fields: Set<string>, fieldname: string, value: unknown): void {
  if (fields.has(fieldname) && value !== undefined) patch[fieldname] = value;
}

function clearIfField(clear: Set<string>, fields: Set<string>, fieldname: string): void {
  if (fields.has(fieldname)) clear.add(fieldname);
}

function fieldOverride(overrides: Record<string, Json>, fields: Set<string>, fieldname: string, value: Json): void {
  if (fields.has(fieldname)) overrides[fieldname] = { ...(overrides[fieldname] ?? {}), ...value };
}

/** Geometry Profile owns structural field metadata; calculated/input logic stays server-side. */
function applyGeometryRuntimeOverrides(
  overrides: Record<string, Json>,
  fields: Set<string>,
  runtime: GeometryProfileRuntimeContract | null,
): void {
  if (!runtime) return;
  for (const entry of runtime.fields) {
    const fieldname = text(entry.runtime_fieldname);
    if (!fieldname) continue;
    const sequence = Number(entry.sequence);
    const unit = text(entry.uom);
    const label = text(entry.label);
    fieldOverride(overrides, fields, fieldname, {
      hidden: entry.visible ? 0 : 1,
      reqd: entry.required ? 1 : 0,
      read_only: entry.role === "CALCULATED" || entry.editable === false ? 1 : 0,
      ...(label ? { label: unit ? `${label}\n(${unit})` : label } : {}),
      ...(Number.isFinite(sequence) ? { sequence } : {}),
      depends_on: null,
      mandatory_depends_on: null,
    });
  }
}

async function resolveCustomerGroup(call: PlatformCall, parent: Json): Promise<CustomerGroup | null> {
  let customerGroup = text(parent.customer_group);
  if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
    const priceListName = text(parent.selling_price_list);
    const priceList = priceListName ? await readDoc(call, "Price List", priceListName) : null;
    customerGroup = text(priceList?.customer_group);
  }
  return customerGroup === "Đại lý" || customerGroup === "Lẻ" ? customerGroup : null;
}

/**
 * Cutting Policy decides which measured-width basis applies to the current customer context.
 * Geometry Profile then binds that semantic dimension to the concrete Sales row field.
 * No door-name or Item Group branching belongs in the UI/preview layer.
 */
interface KeHoachRong {
  /** Ô số đo phủ bì mà Geometry Profile buộc dùng cho ngữ cảnh khách hiện tại. */
  field: "width_pb_ray_m" | "width_pb_nhua_m";
  /** Cơ sở TÍNH TIỀN của dòng — "Rộng cắt lá" nghĩa là chính nó là số ra tiền. */
  sales_basis: string;
  /** Số trừ khi cắt lá, đã tính cả trường hợp bắn bướm. */
  deduction_m: number;
}

async function resolveGeometryWidthInputField(
  call: PlatformCall,
  runtime: GeometryProfileRuntimeContract | null,
  item: Json,
  row: Json,
  parent: Json,
  effectiveDoorType: string,
): Promise<KeHoachRong | null> {
  if (!runtime || !effectiveDoorType) return null;
  const customerGroup = await resolveCustomerGroup(call, parent);
  if (!customerGroup) return null;
  const policyRows = await listDocs(
    call,
    "Cutting Policy",
    [
      "name", "policy_name", "door_type", "item_group", "dealer_width_basis", "retail_width_basis",
      "dealer_cut_deduction_m", "retail_cut_deduction_m", "butterfly_cut_deduction_m",
      "dealer_split_sales_basis", "dealer_full_sales_basis", "retail_sales_basis", "manual_pull_sales_basis",
      "purchase_formula", "purchase_height_basis", "purchase_width_basis", "priority", "disabled", "ray_type",
    ],
    [["Cutting Policy", "door_type", "=", effectiveDoorType]],
    50,
  );
  if (!policyRows.length) return null;
  try {
    const policies = policyRows.map(parseDoorPolicy);
    const selected = selectDoorPolicy(
      policies,
      effectiveDoorType as DoorType,
      text(item.item_group),
      rayTypeOf(row.ray_type),
    );
    const basis = customerGroup === "Đại lý" ? selected.dealer_width_basis : selected.retail_width_basis;
    const geometryField = basis === "Phủ bì ray" ? "PB_RAY_RONG" : basis === "Phủ bì nhựa" ? "PB_NHUA_RONG" : "";
    const runtimeField = runtime.fields.find((entry) => entry.geometry_field === geometryField && entry.visible);
    const fieldname = text(runtimeField?.runtime_fieldname);
    if (fieldname !== "width_pb_ray_m" && fieldname !== "width_pb_nhua_m") return null;
    const salesMode = resolveSalesMode(row.sales_mode, item.item_code, item.item_name);
    const salesBasis = customerGroup === "Lẻ"
      ? selected.retail_sales_basis
      : checked(row.is_manual_pull) && selected.manual_pull_sales_basis
        ? selected.manual_pull_sales_basis
        : salesMode === "Tách món"
          ? selected.dealer_split_sales_basis
          : selected.dealer_full_sales_basis;
    const deduction = checked(row.has_butterfly_bracket) && selected.butterfly_cut_deduction_m != null
      ? Number(selected.butterfly_cut_deduction_m)
      : Number(customerGroup === "Đại lý" ? selected.dealer_cut_deduction_m : selected.retail_cut_deduction_m);
    return {
      field: fieldname,
      sales_basis: text(salesBasis),
      deduction_m: Number.isFinite(deduction) ? deduction : 0,
    };
  } catch {
    // Formula preview/submit owns the authoritative policy error. Visibility must not guess.
    return null;
  }
}

function salesQuantity(row: Json, item: Json, formula: Json | null): { derived: boolean; quantity?: number; policy: string } {
  const uom = normalizedUom(row.uom);
  const sets = positive(row.set_count) ?? 1;
  const linear = deriveLinearSalesBasis(item);
  if (isWidthQuantitySalesItem(item) && METRE_UOMS.has(uom)) {
    const width = positive(row.width_m);
    return { derived: true, ...(width ? { quantity: roundTo(width * sets) } : {}), policy: "WIDTH_X_PIECES" };
  }
  if (isOrdinaryQuantitySalesItem(item)) {
    return { derived: true, quantity: roundTo(sets), policy: "PIECES" };
  }
  if (linear && METRE_UOMS.has(uom)) {
    const dimension = positive(linear === "RAY" ? row.height_m : row.width_m);
    return { derived: true, ...(dimension ? { quantity: roundTo(dimension * sets) } : {}), policy: linear };
  }
  if (isAreaFinishedProduct(item)) {
    if (SET_UOMS.has(uom)) return { derived: true, quantity: roundTo(sets), policy: "PER_SET" };
    if (AREA_UOMS.has(uom)) {
      const billable = positive(formula?.billable_area_sqm);
      if (billable) return { derived: true, quantity: roundTo(billable), policy: "AREA_POLICY" };
      const width = positive(row.width_m);
      const height = positive(row.height_m);
      if (width && height && !text(item.door_type)) {
        const minimum = Math.max(0, Number(item.min_area_sqm) || 0);
        return { derived: true, quantity: roundTo(Math.max(width * height, minimum) * sets), policy: "AREA" };
      }
      return { derived: true, policy: "AREA_POLICY" };
    }
  }
  if (text(item.inventory_mode) === "Nhôm cây/lá") {
    const pieces = positive(row.qty_bar);
    if (METRE_UOMS.has(uom)) {
      const length = positive(row.length_m);
      return { derived: true, ...(length && pieces ? { quantity: roundTo(length * pieces) } : {}), policy: "LENGTH_X_PIECES" };
    }
    if (PIECE_UOMS.has(uom)) return { derived: true, ...(pieces ? { quantity: roundTo(pieces) } : {}), policy: "PIECES" };
  }
  /*
   * Tấm/Kính (ví dụ Nan/lá cửa bán Tách món): hàng cán/cắt theo tấm, KHÔNG có Geometry
   * Profile/BOM như cửa — `isAreaFinishedProduct` không nhận diện mode này nên trước đây rơi
   * thẳng xuống DIRECT, buộc người bán tự gõ tay diện tích, không có ô Rộng/Cao cắt lá nào cả.
   * Diện tích = Rộng × Cao cắt lá, đơn giản hơn cửa vì không qua Cutting Policy/BOM.
   */
  if (SHEET_AREA_MODES.has(text(item.inventory_mode)) && AREA_UOMS.has(uom)) {
    const width = positive(row.width_m);
    const height = positive(row.height_m);
    if (width && height) return { derived: true, quantity: roundTo(width * height * sets), policy: "AREA" };
    return { derived: true, policy: "AREA_POLICY" };
  }
  return { derived: false, policy: "DIRECT" };
}

function applyCommonComputed(patch: Json, clear: Set<string>, fields: Set<string>, row: Json): void {
  const qty = positive(row.qty);
  const factor = positive(row.conversion_factor);
  if (fields.has("stock_qty")) {
    if (qty && factor) patch.stock_qty = roundTo(qty * factor);
    else clear.add("stock_qty");
  }
  const rate = Number(row.rate);
  if (fields.has("amount")) {
    if (qty && Number.isFinite(rate) && rate >= 0) {
      const standard = Math.round(qty * rate);
      const percent = Math.min(100, Math.max(0, Number(row.discount_percentage) || 0));
      patch.standard_amount = standard;
      patch.discount_amount = Math.round(standard * percent / 100);
      patch.amount = standard;
    } else {
      clear.add("amount");
    }
  }
}

function applyAverageWeight(patch: Json, clear: Set<string>, fields: Set<string>, row: Json): void {
  if (!["actual_kg_per_m", "actual_kg_per_sqm", "total_length_m"].some((name) => fields.has(name))) return;
  const uom = normalizedUom(row.uom);
  const isKg = ["kg", "kilogram", "ki-lô-gam"].includes(uom);
  const totalKg = isKg ? positive(row.qty) : positive(row.actual_weight_kg);
  const bars = positive(row.qty_bar);
  const length = positive(row.length_m);
  const width = positive(row.width_m);
  const height = positive(row.height_m);
  const sets = positive(row.set_count);
  const isArea = SHEET_AREA_MODES.has(text(row.inventory_mode)) || text(row.inventory_mode) === "Thành phẩm theo m2";
  const totalArea = isArea && width && height && sets ? width * height * sets : null;
  const totalLength = bars && length ? bars * length : length;
  if (fields.has("total_length_m")) {
    if (totalLength) patch.total_length_m = roundTo(totalLength);
    else clear.add("total_length_m");
  }
  if (fields.has("actual_kg_per_sqm")) {
    if (totalKg && totalArea) patch.actual_kg_per_sqm = roundTo(totalKg / totalArea);
    else clear.add("actual_kg_per_sqm");
  }
  if (fields.has("actual_kg_per_m")) {
    const divisor = totalArea ? null : totalLength || bars || (!isKg ? positive(row.qty) : null);
    if (totalKg && divisor) patch.actual_kg_per_m = roundTo(totalKg / divisor);
    else clear.add("actual_kg_per_m");
  }
}

async function formulaPreview(call: PlatformCall, row: Json, parent: Json, item: Json): Promise<Json | null> {
  if (!isAreaFinishedProduct(item)) return null;
  if (!positive(row.width_m) || !positive(row.height_m)) return null;
  const customerGroup = await resolveCustomerGroup(call, parent);
  if (!customerGroup) return null;
  const response = await calculateSalesProductionLine(call, {
    ...row,
    item_code: row.item_code,
    customer_group: customerGroup,
    purpose: "Bán hàng",
  });
  if (!response.ok) return null;
  return await response.json() as Json;
}

async function previewSales(call: PlatformCall, args: Json, row: Json, parent: Json, fields: Set<string>): Promise<Response> {
  const itemCode = text(row.item_code);
  if (!itemCode) return answer({ patch: {}, clear: [], field_overrides: {} });
  const item = await readDoc(call, "Item", itemCode);
  if (!item || (item.is_sales_item !== undefined && !checked(item.is_sales_item)) || checked(item.disabled)) {
    return answer({ message: `Mặt hàng ${itemCode} không tồn tại, đã ngừng dùng hoặc không được phép bán.` }, 422);
  }
  item.item_code = itemCode;
  const changed = text(args.changed_field);
  const patch: Json = {};
  const clear = new Set<string>();
  const overrides: Record<string, Json> = {};
  if (changed === "item_code") for (const name of ITEM_DERIVED_FIELDS) clearIfField(clear, fields, name);

  const geometryRuntimePending = text(item.geometry_profile)
    ? readGeometryProfileRuntime(call, text(item.geometry_profile)).catch(() => null)
    : Promise.resolve(null);
  const configuredUom = resolveConfiguredSalesUom(item, row.uom);
  const contextResponse = await salesItemContext(call, {
    item_code: itemCode,
    uom: configuredUom,
    warehouse: row.warehouse,
    price_list: parent.selling_price_list,
    currency: parent.currency,
    qty: row.qty,
    customer_group: parent.customer_group,
    ray_type: row.ray_type,
  });
  const context = contextResponse.ok ? await contextResponse.json() as Json : {};
  const geometryRuntime = await geometryRuntimePending;

  const masterPlan: Array<[string, unknown]> = [
    ["stock_uom", item.stock_uom], ["inventory_mode", effectiveInventoryMode(item)],
    ["measurement_profile", item.measurement_profile], ["item_name", item.item_name], ["description", item.description],
    ["min_area_sqm", item.min_area_sqm], ["door_type", context.door_type ?? item.door_type],
    ["purchase_kg_per_m2", context.purchase_kg_per_m2 ?? item.purchase_kg_per_m2],
    ["leaf_divisor_m", context.leaf_divisor_m ?? item.leaf_divisor_m],
  ];
  for (const [name, value] of masterPlan) setIfField(patch, fields, name, value);
  const effectiveDoorType = text(context.door_type ?? item.door_type);
  applyGeometryRuntimeOverrides(overrides, fields, geometryRuntime);
  /*
   * Trục hình học mà bộ quy cách của loại cửa này KHÔNG khai thì phải nói thẳng là ẩn.
   *
   * `applyGeometryRuntimeOverrides` chỉ phát cho những trục CÓ trong bộ quy cách; trục không có
   * thì server im lặng, và client coi "im lặng + ô còn giá trị" là lý do hiện cột. Đổi từ cửa
   * Lưới (có Cao lưới) sang cửa Đức (không có) mà im lặng thì cột Cao lưới ở lại.
   */
  if (geometryRuntime) {
    const daKhai = new Set(geometryRuntime.fields.map((entry) => text(entry.runtime_fieldname)).filter(Boolean));
    for (const fieldname of ["width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "mesh_height_m", "cut_width_m"]) {
      if (!daKhai.has(fieldname)) fieldOverride(overrides, fields, fieldname, { hidden: 1, reqd: 0, read_only: 1 });
    }
  }

  if (effectiveDoorType === "Cửa tấm liền Úc") {
    fieldOverride(overrides, fields, "ray_type", {
      hidden: 0,
      reqd: 1,
      read_only: 0,
      label: "Loại ray",
      depends_on: null,
      mandatory_depends_on: null,
    });
  } else {
    clearIfField(clear, fields, "ray_type");
    fieldOverride(overrides, fields, "ray_type", {
      hidden: 1,
      reqd: 0,
      read_only: 1,
      depends_on: null,
      mandatory_depends_on: null,
    });
  }

  const allowedColors = await allowedColorNamesForGroup(call, text(item.item_group), "sales");
  const linear = deriveLinearSalesBasis(item);
  const currentColor = text(row.color ?? row.colour);
  if (linear === "TRUC" || (currentColor && allowedColors.length && !allowedColors.includes(currentColor))) {
    clearIfField(clear, fields, "color");
    clearIfField(clear, fields, "colour");
  } else if (changed === "item_code" && !currentColor && text(item.default_color)) {
    setIfField(patch, fields, "color", item.default_color);
    setIfField(patch, fields, "colour", item.default_color);
  }
  for (const name of ["color", "colour"]) {
    if (linear === "TRUC") {
      fieldOverride(overrides, fields, name, { hidden: 1, reqd: 0, read_only: 1, depends_on: null, mandatory_depends_on: null });
    } else {
      fieldOverride(overrides, fields, name, {
        link_filters: JSON.stringify([["Item Color", "name", "in", allowedColors.length ? allowedColors : ["__NO_ALLOWED_COLOR_CONFIG__"]]]),
      });
    }
  }

  const selectedUom = text(context.selected_uom) || configuredUom || text(item.default_sales_uom) || text(item.stock_uom);
  setIfField(patch, fields, "uom", selectedUom);
  setIfField(patch, fields, "conversion_factor", context.conversion_factor);
  setIfField(patch, fields, "available_qty", context.available_qty);
  setIfField(patch, fields, "available_stock_qty", context.available_stock_qty);
  setIfField(patch, fields, "available_stock_uom", context.stock_uom);
  setIfField(patch, fields, "availability_status", context.availability_status);
  const allowedUoms = Array.isArray(context.allowed_uoms) ? context.allowed_uoms.map(text).filter(Boolean) : [];
  fieldOverride(overrides, fields, "uom", {
    link_filters: JSON.stringify([["UOM", "name", "in", allowedUoms.length ? allowedUoms : ["__NO_CONFIGURED_SALES_UOM__"]]]),
  });

  const baseline = context.price_missing ? null : Number(context.rate);
  if (fields.has("rate") && Number.isFinite(baseline)) {
    const entered = Number(row.rate);
    const priorBaseline = Number(row.standard_rate);
    const manuallyChanged = changed === "rate"
      ? !sameNumber(entered, baseline)
      : Boolean(row.rate_requires_approval) && Number.isFinite(entered) && Number.isFinite(priorBaseline) && !sameNumber(entered, baseline);
    patch.standard_rate = baseline;
    patch.rate_requires_approval = manuallyChanged;
    if (changed === "item_code" || changed === "uom" || changed === "warehouse" || !manuallyChanged) patch.rate = baseline;
  }
  // Changing Item must discard the previous line's percentage. The authoritative
  // Pricing Rule then supplies 15% for Cửa CN Đức and 0% for groups without a rule.
  if (fields.has("discount_percentage") && changed === "item_code") {
    clearIfField(clear, fields, "discount_percentage");
  }

  // Geometry Profile owns which dimensions exist; Cutting Policy owns which measured-width
  // basis is active for the current customer context. width_m remains only the legacy canonical
  // alias consumed by formula/BOM engines and is never itself used to decide the form structure.
  const areaFinishedProduct = isAreaFinishedProduct(item);
  const keHoachRong = areaFinishedProduct
    ? await resolveGeometryWidthInputField(call, geometryRuntime, item, row, parent, effectiveDoorType)
    : null;
  const selectedWidthField = keHoachRong?.field ?? null;
  /*
   * Ô phủ bì KHÔNG dùng phải được XOÁ SỐ, không chỉ ẩn đi.
   *
   * Ẩn mới giải quyết cái người bán nhìn thấy; con số vẫn nằm lại trên dòng và đi thẳng vào bản
   * lưu. Bản in đọc dòng đã lưu và không chạy được luật chọn ô của màn nhập, nên nó thấy CẢ HAI
   * số rồi bung CẢ HAI cột — cùng một cửa hiện ra hai bề rộng. Xoá tại gốc thì mọi nơi đọc sau
   * đều chỉ còn đúng một bề rộng.
   */
  if (selectedWidthField) {
    const oKhongDung = selectedWidthField === "width_pb_ray_m" ? "width_pb_nhua_m" : "width_pb_ray_m";
    patch[oKhongDung] = undefined;
    clearIfField(clear, fields, oKhongDung);
  }
  /*
   * DÒNG BÁN THEO RỘNG CẮT LÁ THÌ NGƯỜI BÁN GÕ THẲNG RỘNG CẮT LÁ.
   *
   * Tách món là bán lá/lưới rời — đơn KHÔNG có bộ ray nào, nên bắt gõ "Rộng phủ bì ray" là hỏi
   * một kích thước không tồn tại. Nguồn cũng viết đúng như vậy: định mức lá yếm của cửa SN tách
   * món (ĐM 1161) ghi thẳng `1 LÁ x RCL`, trong khi bản trọn bộ (ĐM 1172) mới ghi
   * `1 LÁ x (Rpbray − 3cm)`.
   *
   * Máy công thức chỉ nhận số đo phủ bì, nên ở đây suy NGƯỢC: phủ bì = rộng cắt + số trừ. Vòng
   * lặp hội tụ ngay: gõ 2,97 → phủ bì 3,00 → máy trả rộng cắt 3,00 − 0,03 = 2,97. Tick bắn bướm
   * đổi số trừ thành 0,035 thì phủ bì thành 3,005 và rộng cắt VẪN là 2,97 — đúng, vì 2,97 mới là
   * con số khách đặt.
   */
  const banTheoRongCat = keHoachRong?.sales_basis === "Rộng cắt lá";
  if (selectedWidthField && banTheoRongCat) {
    const rongCat = positive(patch.cut_width_m ?? row.cut_width_m);
    if (rongCat) {
      const phuBi = roundTo(rongCat + keHoachRong!.deduction_m);
      setIfField(patch, fields, selectedWidthField, phuBi);
      patch.width_m = phuBi;
    } else {
      patch.width_m = undefined;
      clearIfField(clear, fields, "width_m");
    }
  } else if (selectedWidthField) {
    const selectedWidth = positive(patch[selectedWidthField] ?? row[selectedWidthField]);
    const hasSeparateWidth = positive(row.width_pb_ray_m) || positive(row.width_pb_nhua_m);
    // Compatibility for old drafts that only stored width_m. Never equate PB ray and PB nhựa
    // after either specialized value already exists.
    const legacyWidth = !hasSeparateWidth && ["initial_load", "parent_context"].includes(changed)
      ? positive(row.width_m)
      : null;
    if (selectedWidth) patch.width_m = selectedWidth;
    else if (legacyWidth) {
      setIfField(patch, fields, selectedWidthField, legacyWidth);
      patch.width_m = legacyWidth;
    } else {
      patch.width_m = undefined;
      clearIfField(clear, fields, "width_m");
    }
  }
  /*
   * `sales_mode` bị ẩn toàn cục trên form nên không dòng nào tự khai được — trả lại giá trị đã
   * suy ra để các tầng sau (giá, định mức, cột hiển thị) đọc được cách bán thật của dòng.
   *
   * CHỈ cho cửa bán theo m². Cách bán "Trọn bộ / Tách món" là khái niệm của CỬA; gán nó cho ray,
   * trục hay phụ kiện là gán một thuộc tính vô nghĩa — và tệ hơn: client lấy `sales_mode` làm
   * điều kiện đủ để đi hỏi định mức, nên gán tràn làm mọi dòng phụ kiện cũng mọc khối BOM.
   */
  if (areaFinishedProduct) {
    setIfField(patch, fields, "sales_mode", resolveSalesMode(row.sales_mode, item.item_code, item.item_name));
  }

  const effectiveRow = { ...row, ...patch };
  const formula = await formulaPreview(call, effectiveRow, parent, item);
  /**
   * Bề rộng nào RA TIỀN cho dòng này.
   *
   * Hỏi chính công thức cửa (`sales_width_basis`) — nó đã cân xong Cutting Policy + nhóm giá +
   * cách bán, nên đây là câu trả lời có thẩm quyền, không phải phép dò tên loại cửa. `keHoachRong`
   * ở trên tính lại cùng phép chọn để còn suy ngược được số đo TRƯỚC khi gọi công thức; hai chỗ
   * phải luôn khớp, nên nơi nào có `formula` thì lấy `formula` làm chuẩn.
   */
  const raTien = formula ? text(formula.sales_width_basis) === "Rộng cắt lá" : banTheoRongCat;
  if (formula) {
    const formulaMap: Array<[string, unknown]> = [
      ["formula_policy", formula.policy_name], ["formula_version", formula.formula_version],
      ["formula_explanation", formula.formula_explanation], ["width_basis", formula.width_basis],
      ["cut_width_m", formula.cut_width_m], ["billable_area_sqm", formula.billable_area_sqm],
      ["leaf_variant", formula.leaf_variant], ["leaf_height_deduction_m", formula.leaf_height_deduction_m],
      ["leaf_divisor_m", formula.leaf_divisor_m], ["leaf_rounding", formula.leaf_rounding], ["leaf_count", formula.leaf_count],
      ["single_layer_leaf_count", formula.single_layer_leaf_count], ["double_layer_leaf_count", formula.double_layer_leaf_count],
      ["estimated_weight_kg", formula.estimated_weight_kg], ["estimated_minutes", formula.estimated_minutes],
    ];
    for (const [name, value] of formulaMap) setIfField(patch, fields, name, value);
    /*
     * Cột "Rộng cắt lá" chỉ hiện khi nó LÀ CƠ SỞ TÍNH TIỀN của chính dòng này.
     *
     * Geometry Profile khai `CAT_LA_RONG` là trường CALCULATED luôn visible, nên nếu để nguyên thì
     * mọi loại cửa đều mọc thêm một cột mà phần lớn dòng chỉ dùng nó làm số tham khảo của xưởng.
     * Nhưng cấm ẩn cứng: có những dòng nó thật sự ra tiền — Tách món của Lưới/Đài Loan, và **mọi**
     * dòng Đại lý của Cửa Siêu Trường (docs/ALUMDOOR-LUAT-DO-VA-GIA.md §3).
     *
     * `sales_width_basis` do chính công thức cửa chốt sau khi đã cân Cutting Policy + nhóm giá +
     * cách bán, nên hỏi nó là hỏi đúng nguồn — không phải dò tên loại cửa hay đoán theo `sales_mode`.
     */
  }
  /*
   * Ô "Rộng cắt lá" phải được mở khoá NGOÀI nhánh `if (formula)`.
   *
   * Công thức cửa cần chiều rộng mới chạy được — mà với dòng bán theo rộng cắt lá thì chính ô này
   * LÀ chỗ nhập chiều rộng. Để nó bên trong nhánh công thức là khoá chéo: chưa nhập thì công thức
   * rỗng → ô không được mở → không nhập được → công thức mãi rỗng. Ô phủ bì lúc đó cũng đã bị
   * khoá (thành số suy ra), nên dòng đứng im, SL không bao giờ tính ra.
   */
  fieldOverride(overrides, fields, "cut_width_m", raTien
    // Nó ra tiền thì nó là Ô NHẬP: người bán gõ bề rộng khách đặt, hệ suy ngược ra phủ bì.
    ? { hidden: 0, reqd: 1, read_only: 0, depends_on: null, mandatory_depends_on: null }
    : { hidden: 1, reqd: 0, read_only: 1 });

  const calculatedRow = { ...row, ...patch };
  const quantity = salesQuantity(calculatedRow, item, formula);
  if (quantity.derived) {
    if (quantity.quantity != null) patch.qty = quantity.quantity;
    else clearIfField(clear, fields, "qty");
  }
  const finalRow = { ...row, ...patch };
  if (areaFinishedProduct
    && AREA_UOMS.has(normalizedUom(finalRow.uom)) && SET_UOMS.has(normalizedUom(item.stock_uom))) {
    const qty = positive(finalRow.qty);
    const sets = positive(finalRow.set_count) ?? 1;
    if (qty) {
      setIfField(patch, fields, "conversion_factor", roundTo(sets / qty));
      setIfField(patch, fields, "stock_qty", roundTo(sets));
    }
  } else {
    applyCommonComputed(patch, clear, fields, { ...row, ...patch });
  }
  // `applyCommonComputed` also owns amount/discount; dynamic area branch still needs it after stock snapshot.
  if (fields.has("amount")) {
    const qty = positive(patch.qty ?? row.qty);
    const rate = Number(patch.rate ?? row.rate);
    if (qty && Number.isFinite(rate) && rate >= 0) {
      const standard = Math.round(qty * rate);
      const percent = Math.min(100, Math.max(0, Number(patch.discount_percentage ?? row.discount_percentage) || 0));
      patch.standard_amount = standard;
      patch.discount_amount = Math.round(standard * percent / 100);
      patch.amount = standard;
    }
  }

  const finalForFields = { ...row, ...patch };
  const widthBasis = normalized(finalForFields.width_basis);
  const supportsButterflyBracket = formula?.supports_butterfly_bracket === true;
  if (areaFinishedProduct) {
    // Profile baseline was already applied above. Customer/policy context is more specific and
    // may select exactly one of the two measured-width inputs without teaching the client any
    // customer-group or door-name rules.
    if (selectedWidthField) {
      /*
       * Dòng ra tiền theo RỘNG CẮT LÁ thì ô phủ bì thôi làm ô nhập: nó thành SỐ SUY RA
       * (phủ bì = rộng cắt + số trừ). Vẫn hiện để thợ đối chiếu, nhưng không bắt nhập và không
       * cho sửa — mở cả hai đầu của cùng một phép trừ là mở đường cho hai con số đá nhau.
       */
      for (const f of ["width_pb_ray_m", "width_pb_nhua_m"] as const) {
        const laODangDung = selectedWidthField === f;
        fieldOverride(overrides, fields, f, {
          hidden: laODangDung ? 0 : 1,
          reqd: laODangDung && !raTien ? 1 : 0,
          read_only: laODangDung && !raTien ? 0 : 1,
          depends_on: null,
          mandatory_depends_on: null,
        });
      }
    }
    // width_m is a compatibility alias for formula/BOM, not a second user input when a catalog
    // width binding exists. If the catalog/policy cannot resolve an input yet, keep the old
    // generic width visible rather than inventing a ray/plastic choice.
    fieldOverride(overrides, fields, "width_m", {
      hidden: selectedWidthField ? 1 : 0,
      reqd: selectedWidthField ? 0 : 1,
      label: widthBasis.includes("nhựa") ? "Rộng PB nhựa\n(m)" : widthBasis.includes("ray") ? "Rộng PB ray\n(m)" : "Rộng PB\n(m)",
    });
  }
  fieldOverride(overrides, fields, "has_butterfly_bracket", {
    hidden: supportsButterflyBracket ? 0 : 1,
    reqd: 0,
    // Chủ xưởng dùng chữ "bắn bướm" (phản hồi 21/08/2026) — thống nhất một nhãn duy nhất.
    label: "Có bắn bướm",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "uom", { label: "ĐVT" });
  fieldOverride(overrides, fields, "qty", {
    label: quantity.derived ? "SL tính giá" : quantityLabelForUom(selectedUom),
    read_only: quantity.derived ? 1 : 0,
  });
  fieldOverride(overrides, fields, "rate", { label: "Đơn giá (chiết khấu)\n(VNĐ)" });
  fieldOverride(overrides, fields, "discount_percentage", { label: "Chiết khấu\n(%)" });
  fieldOverride(overrides, fields, "amount", { label: "Thành tiền\n(VNĐ)" });

  const setsRequired = Boolean(linear || isWidthQuantitySalesItem(item) || isOrdinaryQuantitySalesItem(item)
    || areaFinishedProduct);
  if (setsRequired) {
    const setCountLabel = areaFinishedProduct
      ? "Số bộ"
      : linear
        ? "Số cây/đoạn"
        : quantityLabelForUom(item.stock_uom || selectedUom);
    fieldOverride(overrides, fields, "set_count", {
      hidden: 0,
      reqd: 1,
      label: setCountLabel,
      depends_on: null,
      mandatory_depends_on: null,
    });
  }
  if (linear === "RAY") fieldOverride(overrides, fields, "height_m", { hidden: 0, reqd: 1, label: "Cao (m)", depends_on: null, mandatory_depends_on: null });
  if (linear === "TRUC" || isWidthQuantitySalesItem(item)) fieldOverride(overrides, fields, "width_m", { hidden: 0, reqd: 1, label: "Rộng (m)", depends_on: null, mandatory_depends_on: null });
  /*
   * Tấm/Kính, Nan/lá cửa bán theo diện tích: Rộng cắt lá + Cao PB là hai ô nhập trực tiếp
   * (không qua Cutting Policy như cửa), diện tích tự nhân — xem `salesQuantity` nhánh
   * `SHEET_AREA_MODES` ở trên.
   *
   * CHỈ Rộng là "cắt" — đúng công thức chốt `docs/ALUMDOOR-LUAT-DO-VA-GIA.md` §4 (bảng chủ
   * xưởng 29/07/2026): Đài Loan/Lưới/Siêu Trường Tách món bán theo "Cao PB × Rộng cắt", không
   * phải "Cao cắt × Rộng cắt" — Rộng đã trừ khe hở lắp ráp (PB ray − 0,03, có bản bướm − 0,035)
   * vì lá/ray là hàng cắt rời, còn Cao vẫn đo nguyên theo phủ bì của bộ cửa. Gọi cả hai là "cắt
   * lá" (bản trước 24/08) là sai công thức tài liệu.
   */
  if (SHEET_AREA_MODES.has(text(item.inventory_mode)) && AREA_UOMS.has(normalizedUom(finalForFields.uom))) {
    fieldOverride(overrides, fields, "width_m", { hidden: 0, reqd: 1, label: "Rộng cắt lá (m)", depends_on: null, mandatory_depends_on: null });
    fieldOverride(overrides, fields, "height_m", { hidden: 0, reqd: 1, label: "Cao PB (m)", depends_on: null, mandatory_depends_on: null });
  }
  if (isOrdinaryQuantitySalesItem(item)) fieldOverride(overrides, fields, "qty", { read_only: 1, label: "SL tính giá", read_only_depends_on: null });
  if (quantity.policy === "LENGTH_X_PIECES" || (text(item.inventory_mode) === "Nhôm cây/lá" && quantity.policy === "PIECES")) {
    fieldOverride(overrides, fields, "length_m", { reqd: quantity.policy === "LENGTH_X_PIECES" ? 1 : 0, label: "Dài một cây/đoạn (m)" });
    fieldOverride(overrides, fields, "qty_bar", { reqd: 1, label: "Số cây/đoạn" });
  }

  return answer({
    patch,
    clear: [...clear],
    field_overrides: overrides,
    geometry_runtime: geometryRuntime,
    geometry_input_field: selectedWidthField,
    source: "alumdoor.ui.preview_child_row",
  });
}

async function previewPurchase(call: PlatformCall, args: Json, row: Json, fields: Set<string>): Promise<Response> {
  const itemCode = text(row.item_code);
  if (!itemCode) return answer({ patch: {}, clear: [], field_overrides: {} });
  const item = await readDoc(call, "Item", itemCode);
  if (!item || (item.is_purchase_item !== undefined && !checked(item.is_purchase_item)) || checked(item.disabled)) {
    return answer({ message: `Mặt hàng ${itemCode} không tồn tại, đã ngừng dùng hoặc không được phép mua.` }, 422);
  }
  item.item_code = itemCode;
  const changed = text(args.changed_field);
  const patch: Json = {};
  const clear = new Set<string>();
  const overrides: Record<string, Json> = {};
  if (changed === "item_code") for (const name of ITEM_DERIVED_FIELDS) clearIfField(clear, fields, name);

  const inventoryMode = text(item.inventory_mode) || "Hàng thường";
  const measurementProfileName = text(item.measurement_profile);
  const measurementProfile = measurementProfileName
    ? await readDoc(call, "Measurement Profile", measurementProfileName)
    : null;
  const aluminum = inventoryMode === "Nhôm cây/lá";
  const requireColor = measurementProfile ? checked(measurementProfile.require_color) : aluminum;
  const requireLength = measurementProfile ? checked(measurementProfile.require_length) : aluminum;
  const requirePieces = measurementProfile ? checked(measurementProfile.require_piece_qty) : aluminum;
  const trackBundles = measurementProfile ? checked(measurementProfile.track_bundle_qty) : false;
  // `require_condition` — cùng cờ Bộ theo dõi với requireColor/requireLength/requirePieces/
  // trackBundles ở trên, trước đây bị bỏ sót (audit ALUMDOOR-KHO-DANH-MUC-GAP-20260821.md, #4).
  // `Purchase Receipt Item`/`Purchase Order Item` đều có field `condition` sẵn (Select
  // Thô/Đã sơn/Lỗi) — nối field_override cùng khuôn với requireLength ngay dưới.
  const requireCondition = measurementProfile ? checked(measurementProfile.require_condition) : aluminum;

  const plan: Array<[string, unknown]> = [
    ["stock_uom", item.stock_uom], ["inventory_mode", inventoryMode],
    ["measurement_profile", item.measurement_profile], ["material_specification", item.material_specification],
    ["item_name", item.item_name], ["description", item.description], ["min_area_sqm", item.min_area_sqm],
    ["door_type", item.door_type], ["purchase_kg_per_m2", item.purchase_kg_per_m2], ["leaf_divisor_m", item.leaf_divisor_m],
  ];
  for (const [name, value] of plan) setIfField(patch, fields, name, value);

  const allowedColors = await allowedColorNamesForGroup(call, text(item.item_group), "purchase");
  const currentColor = text(row.color ?? row.colour);
  if (!requireColor || (currentColor && !allowedColors.includes(currentColor))) {
    clearIfField(clear, fields, "color");
    clearIfField(clear, fields, "colour");
  }
  for (const name of ["color", "colour"]) {
    fieldOverride(overrides, fields, name, {
      hidden: requireColor ? 0 : 1,
      reqd: requireColor ? 1 : 0,
      read_only: requireColor ? 0 : 1,
      label: "Màu",
      depends_on: null,
      mandatory_depends_on: null,
      link_filters: JSON.stringify([["Item Color", "name", "in", allowedColors.length ? allowedColors : ["__NO_ALLOWED_COLOR_CONFIG__"]]]),
    });
  }
  if (requireColor && changed === "item_code" && !text(row.color ?? row.colour) && text(item.default_color)) {
    setIfField(patch, fields, "color", item.default_color);
    setIfField(patch, fields, "colour", item.default_color);
  }

  const stockUom = text(item.stock_uom);
  const preferredUom = text(item.default_purchase_uom) || stockUom;
  const transactionUom = text(row.uom) || preferredUom;
  setIfField(patch, fields, "uom", transactionUom);
  let factor = transactionUom === stockUom ? 1 : null;
  if (!factor && Array.isArray(item.uom_conversions)) {
    const match = item.uom_conversions.find((entry) => text((entry as Json)?.uom) === transactionUom) as Json | undefined;
    factor = positive(match?.conversion_factor);
  }
  /*
   * Nhôm cây mua theo Kg: hệ số đến từ CHÍNH DÒNG, không từ bảng quy đổi của mặt hàng.
   *
   * Số cây trên một kg đổi theo chiều dài từng chuyến — phiếu Tiến Đạt 22/7 có ba dòng cùng mã
   * A282 dài 8,50 · 7,20 · 6,60 m, ba hệ số khác nhau. `document-validation.ts` đã suy đúng như
   * vậy khi lưu (`lotFactorFromLine`), nhưng xem trước lại trả hệ số của Item, nên màn gửi lên
   * một con số mà chính server vừa bảo là sai. Đo 23/08/2026: bảng quy đổi của `NHOM_AL71` đang
   * để tạm 1 Kg = 1 Cây, nên mọi đơn mua nhôm cây bị từ chối — luồng chính của phân hệ đứng hẳn.
   *
   * Hai bên phải suy CÙNG MỘT CÁCH, nếu không thì sửa bảng quy đổi cũng không cứu được.
   */
  const soCay = positive(row.qty_bar);
  const soKg = positive(row.qty);
  if (aluminum && soCay && soKg && transactionUom !== stockUom) factor = soCay / soKg;
  if (factor) setIfField(patch, fields, "conversion_factor", factor);

  if (fields.has("rate") && (changed === "item_code" || row.rate == null || row.rate === "")) {
    const standardRate = Number(item.standard_rate);
    if (Number.isFinite(standardRate) && standardRate >= 0) patch.rate = standardRate;
  }
  if (fields.has("theoretical_kg_per_m") && text(item.material_specification)) {
    const spec = await readDoc(call, "Material Specification", text(item.material_specification));
    const kgPerM = positive(spec?.theoretical_kg_per_m);
    if (kgPerM) patch.theoretical_kg_per_m = kgPerM;
  }

  const effective = { ...row, ...patch };
  if (aluminum && fields.has("theoretical_kg")) {
    const length = positive(effective.length_m);
    const bars = positive(effective.qty_bar);
    const kgPerM = positive(effective.theoretical_kg_per_m);
    if (length && bars && kgPerM) {
      const kg = roundTo(length * bars * kgPerM);
      patch.theoretical_kg = kg;
      if (fields.has("qty")) patch.qty = kg;
    } else {
      /*
       * Dòng chưa đủ dữ kiện thì THÔI không tính, chứ KHÔNG xoá ô người ta đang gõ.
       *
       * Bản cũ xoá luôn `qty`. Mà dòng nhôm nhập theo thứ tự tự nhiên — chọn mã, gõ số Kg, rồi
       * mới tới chiều dài — nên đúng lúc gõ xong số Kg thì dòng vẫn "chưa đủ" và con số vừa gõ
       * biến mất, không một lời giải thích. Đúng triệu chứng chủ xưởng báo ngày 23/08: "nhập số
       * vào nó tự xoá".
       *
       * Bỏ trống không mất an toàn: khi đủ dữ kiện thì nhánh trên ghi đè `qty` bằng số theo
       * barem, còn lúc lưu thì `document-validation` vẫn buộc Kg khớp số cây × dài × barem
       * trong dung sai. Giữ lại số đang gõ chỉ là không phá việc của người dùng giữa chừng.
       */
      clear.add("theoretical_kg");
    }
  }
  if (!aluminum) {
    for (const name of ["length_m", "qty_bundle", "qty_bar", "so_no", "total_length_m", "actual_kg_per_m", "material_specification", "theoretical_kg_per_m", "theoretical_kg", "is_stamped"]) clearIfField(clear, fields, name);
  }
  if (!SHEET_AREA_MODES.has(inventoryMode) && inventoryMode !== "Thành phẩm theo m2") clearIfField(clear, fields, "actual_kg_per_sqm");

  fieldOverride(overrides, fields, "material_specification", {
    hidden: aluminum ? 0 : 1,
    reqd: 0,
    read_only: 1,
    label: "Quy cách",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "length_m", {
    hidden: requireLength ? 0 : 1,
    reqd: requireLength ? 1 : 0,
    read_only: requireLength ? 0 : 1,
    label: "Dài một cây/đoạn (m)",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "condition", {
    hidden: requireCondition ? 0 : 1,
    reqd: requireCondition ? 1 : 0,
    read_only: requireCondition ? 0 : 1,
    label: "Tình trạng",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "theoretical_kg_per_m", {
    hidden: aluminum ? 0 : 1,
    reqd: 0,
    read_only: 1,
    label: "Kg/m",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "qty_bundle", {
    hidden: trackBundles ? 0 : 1,
    reqd: 0,
    read_only: trackBundles ? 0 : 1,
    label: "Số bó",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "qty_bar", {
    hidden: requirePieces ? 0 : 1,
    reqd: requirePieces ? 1 : 0,
    read_only: requirePieces ? 0 : 1,
    label: "Số cây/lá",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "theoretical_kg", {
    hidden: aluminum ? 0 : 1,
    reqd: 0,
    read_only: 1,
    label: "Kg đặt",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "is_stamped", {
    hidden: aluminum ? 0 : 1,
    reqd: aluminum ? 1 : 0,
    read_only: aluminum ? 0 : 1,
    label: "Dập",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "qty", {
    hidden: aluminum ? 1 : 0,
    reqd: aluminum ? 0 : 1,
    read_only: aluminum ? 1 : 0,
    label: aluminum ? "SL tính giá (Kg)" : quantityLabelForUom(transactionUom),
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "uom", {
    hidden: 0,
    reqd: 1,
    read_only: 1,
    label: "ĐVT",
    depends_on: null,
    mandatory_depends_on: null,
  });
  fieldOverride(overrides, fields, "rate", { hidden: 0, label: "Đơn giá\n(VNĐ)" });
  fieldOverride(overrides, fields, "amount", { hidden: 0, read_only: 1, label: "Thành tiền\n(VNĐ)" });

  applyAverageWeight(patch, clear, fields, { ...row, ...patch });
  applyCommonComputed(patch, clear, fields, { ...row, ...patch });
  return answer({ patch, clear: [...clear], field_overrides: overrides, source: "alumdoor.ui.preview_child_row" });
}

/** Server-owned UX preview. Saving/submitting still recalculates through canonical controllers/validators. */
export async function previewChildRow(call: PlatformCall, args: Json): Promise<Response> {
  try {
    const childDoctype = text(args.child_doctype);
    const row = args.row && typeof args.row === "object" && !Array.isArray(args.row) ? args.row as Json : {};
    const parent = args.parent && typeof args.parent === "object" && !Array.isArray(args.parent) ? args.parent as Json : {};
    const fields = fieldSet(args);
    if (!childDoctype || !fields.size) return answer({ message: "Thiếu child_doctype hoặc child_fields cho preview." }, 422);
    if (SALES_DOCTYPES.has(childDoctype)) return await previewSales(call, args, row, parent, fields);
    if (PURCHASE_DOCTYPES.has(childDoctype)) return await previewPurchase(call, args, row, fields);
    return answer({ patch: {}, clear: [], field_overrides: {}, source: "alumdoor.ui.preview_child_row" });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không preview được dòng chứng từ." }, 422);
  }
}
