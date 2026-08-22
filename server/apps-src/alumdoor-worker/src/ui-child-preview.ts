import { roundTo } from "./numeric.js";
import { salesItemContext, type SalesPlatformCall } from "./sales-item-context.js";
import { calculateSalesProductionLine, type ProductionPlatformCall } from "./sales-production.js";
import { allowedColorNamesForGroup } from "./color-scopes.js";

type Json = Record<string, unknown>;
type PlatformCall = SalesPlatformCall & ProductionPlatformCall;
type LinearSalesBasis = "RAY" | "TRUC";

const SALES_DOCTYPES = new Set(["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]);
const PURCHASE_DOCTYPES = new Set(["Supplier Quotation Item", "Purchase Order Item", "Purchase Receipt Item", "Purchase Invoice Item"]);
const AREA_UOMS = new Set(["m2", "m²", "sqm"]);
const METRE_UOMS = new Set(["m", "mét", "met", "meter", "metre"]);
const SET_UOMS = new Set(["bộ", "bo", "set"]);
const PIECE_UOMS = new Set(["cây", "cay", "lá", "la", "đoạn", "doan"]);
const ITEM_DERIVED_FIELDS = [
  "conversion_factor", "uom", "stock_uom", "stock_qty", "inventory_mode", "measurement_profile", "min_area_sqm",
  "item_name", "description", "color", "colour", "rate", "standard_rate", "rate_requires_approval", "amount",
  "discount_percentage", "discount_amount", "standard_amount", "formula_policy", "formula_version", "formula_explanation",
  "width_basis", "cut_width_m", "billable_area_sqm", "door_type", "leaf_variant", "leaf_height_deduction_m",
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

function customerWidthField(customerGroup: unknown): "width_pb_ray_m" | "width_pb_nhua_m" | null {
  const group = text(customerGroup);
  if (group === "Lẻ") return "width_pb_ray_m";
  if (group === "Đại lý") return "width_pb_nhua_m";
  return null;
}

function salesWidthField(
  doorType: unknown,
  itemGroup: unknown,
  customerGroup: unknown,
): "width_pb_ray_m" | "width_pb_nhua_m" | null {
  const type = normalized(doorType);
  const group = normalized(itemGroup);
  const alwaysUsesPbRay = [
    "cửa úc",
    "cửa tấm liền úc",
    "cửa lưới",
    "cửa đài loan",
    "cửa siêu trường",
  ].includes(type)
    || [
      "cửa tấm liền úc",
      "cửa lưới",
      "cửa đài loan",
      "cửa đài loan inox",
      "cửa kéo đài loan",
      "cửa siêu trường",
    ].includes(group);
  return alwaysUsesPbRay ? "width_pb_ray_m" : customerWidthField(customerGroup);
}

function usesMeshHeight(doorType: unknown, itemGroup: unknown): boolean {
  const type = normalized(doorType);
  const group = normalized(itemGroup);
  return ["cửa lưới", "cửa đài loan", "cửa siêu trường"].includes(type)
    || ["cửa lưới", "cửa đài loan", "cửa đài loan inox", "cửa kéo đài loan", "cửa siêu trường"].includes(group);
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
  const isArea = ["Tấm/Kính", "Thành phẩm theo m2"].includes(text(row.inventory_mode));
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
  let customerGroup = text(parent.customer_group);
  // The Sales Order header normally receives this from Customer.price_group. During fast
  // entry that fetch can finish after the line preview, while the selected Price List already
  // carries the same authoritative Đại lý/Lẻ scope. Use that scope instead of silently
  // clearing qty and leaving an apparently complete dimension row at "—".
  if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
    const priceListName = text(parent.selling_price_list);
    const priceList = priceListName ? await readDoc(call, "Price List", priceListName) : null;
    customerGroup = text(priceList?.customer_group);
  }
  if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") return null;
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

  const configuredUom = resolveConfiguredSalesUom(item, row.uom);
  const contextResponse = await salesItemContext(call, {
    item_code: itemCode,
    uom: configuredUom,
    warehouse: row.warehouse,
    price_list: parent.selling_price_list,
    currency: parent.currency,
    qty: row.qty,
  });
  const context = contextResponse.ok ? await contextResponse.json() as Json : {};

  const masterPlan: Array<[string, unknown]> = [
    ["stock_uom", item.stock_uom], ["inventory_mode", effectiveInventoryMode(item)],
    ["measurement_profile", item.measurement_profile], ["item_name", item.item_name], ["description", item.description],
    ["min_area_sqm", item.min_area_sqm], ["door_type", context.door_type ?? item.door_type],
    ["purchase_kg_per_m2", context.purchase_kg_per_m2 ?? item.purchase_kg_per_m2],
    ["leaf_divisor_m", context.leaf_divisor_m ?? item.leaf_divisor_m],
  ];
  for (const [name, value] of masterPlan) setIfField(patch, fields, name, value);
  const effectiveDoorType = text(context.door_type ?? item.door_type);
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

  // PB ray và PB nhựa là hai số đo nghiệp vụ độc lập. `width_m` chỉ là trường
  // chuẩn hoá mà công thức/BOM cũ đang đọc; không dùng nó làm ô nhập rồi đổi nhãn.
  const areaFinishedProduct = isAreaFinishedProduct(item);
  const selectedWidthField = areaFinishedProduct
    ? salesWidthField(effectiveDoorType, item.item_group, parent.customer_group)
    : null;
  if (selectedWidthField) {
    const selectedWidth = positive(patch[selectedWidthField] ?? row[selectedWidthField]);
    const hasSeparateWidth = positive(row.width_pb_ray_m) || positive(row.width_pb_nhua_m);
    // Nếu người bán nhập ô Rộng PB chung trước khi chọn khách, lúc nhóm giá xuất hiện phải
    // chuyển đúng một lần sang PB ray/nhựa. Chỉ chuyển khi chưa có bất kỳ số đo chuyên biệt nào;
    // đổi từ Lẻ sang Đại lý sau đó không được đoán hai loại phủ bì bằng nhau.
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

  const effectiveRow = { ...row, ...patch };
  const formula = await formulaPreview(call, effectiveRow, parent, item);
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
  }

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
    fieldOverride(overrides, fields, "width_pb_ray_m", {
      hidden: selectedWidthField === "width_pb_ray_m" ? 0 : 1,
      reqd: selectedWidthField === "width_pb_ray_m" ? 1 : 0,
      read_only: selectedWidthField === "width_pb_ray_m" ? 0 : 1,
      label: "Rộng PB ray\n(m)",
      depends_on: null,
      mandatory_depends_on: null,
    });
    fieldOverride(overrides, fields, "width_pb_nhua_m", {
      hidden: selectedWidthField === "width_pb_nhua_m" ? 0 : 1,
      reqd: selectedWidthField === "width_pb_nhua_m" ? 1 : 0,
      read_only: selectedWidthField === "width_pb_nhua_m" ? 0 : 1,
      label: "Rộng PB nhựa\n(m)",
      depends_on: null,
      mandatory_depends_on: null,
    });
    fieldOverride(overrides, fields, "width_m", { hidden: selectedWidthField ? 1 : 0, reqd: selectedWidthField ? 0 : 1, label: widthBasis.includes("nhựa") ? "Rộng PB nhựa\n(m)" : widthBasis.includes("ray") ? "Rộng PB ray\n(m)" : "Rộng PB\n(m)" });
    fieldOverride(overrides, fields, "height_m", { label: "Cao PB\n(m)" });
    const meshHeightApplicable = usesMeshHeight(effectiveDoorType, item.item_group);
    fieldOverride(overrides, fields, "mesh_height_m", {
      hidden: meshHeightApplicable ? 0 : 1,
      reqd: 0,
      read_only: meshHeightApplicable ? 0 : 1,
      label: "Cao lưới\n(m)",
      depends_on: null,
      mandatory_depends_on: null,
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
  if (isOrdinaryQuantitySalesItem(item)) fieldOverride(overrides, fields, "qty", { read_only: 1, label: "SL tính giá", read_only_depends_on: null });
  if (quantity.policy === "LENGTH_X_PIECES" || (text(item.inventory_mode) === "Nhôm cây/lá" && quantity.policy === "PIECES")) {
    fieldOverride(overrides, fields, "length_m", { reqd: quantity.policy === "LENGTH_X_PIECES" ? 1 : 0, label: "Dài một cây/đoạn (m)" });
    fieldOverride(overrides, fields, "qty_bar", { reqd: 1, label: "Số cây/đoạn" });
  }

  return answer({ patch, clear: [...clear], field_overrides: overrides, source: "alumdoor.ui.preview_child_row" });
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
      clear.add("theoretical_kg");
      clearIfField(clear, fields, "qty");
    }
  }
  if (!aluminum) {
    for (const name of ["length_m", "qty_bundle", "qty_bar", "so_no", "total_length_m", "actual_kg_per_m", "material_specification", "theoretical_kg_per_m", "theoretical_kg", "is_stamped"]) clearIfField(clear, fields, name);
  }
  if (!["Tấm/Kính", "Thành phẩm theo m2"].includes(inventoryMode)) clearIfField(clear, fields, "actual_kg_per_sqm");

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
