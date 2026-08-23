import { roundTo } from "./numeric.js";
import { allowedColorNamesForGroup } from "./color-scopes.js";
import {
  readPurchaseItemRuntime,
  type PurchaseItemRuntimeContract,
  type PurchaseRuntimeCall,
  type PurchaseRuntimeSurface,
} from "./purchase-item-runtime.js";

type Json = Record<string, unknown>;
type PlatformCall = PurchaseRuntimeCall;

const PURCHASE_DERIVED_FIELDS = [
  "conversion_factor", "stock_uom", "stock_qty", "inventory_mode", "measurement_profile",
  "item_name", "description", "color", "colour", "uom", "material_specification",
  "theoretical_kg_per_m", "theoretical_kg", "actual_kg_per_m", "actual_kg_per_sqm",
  "total_length_m", "amount",
];
const HIDDEN_RUNTIME_PERSISTED_FIELDS = new Set(["qty"]);

function answer(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function normalized(value: unknown): string { return text(value).toLocaleLowerCase("vi"); }
function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(normalized(value));
}
function positive(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
async function readDoc(call: PlatformCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}
function fieldSet(args: Json): Set<string> {
  return new Set(Array.isArray(args.child_fields) ? args.child_fields.map(text).filter(Boolean) : []);
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
function surfaceFor(childDoctype: string): PurchaseRuntimeSurface {
  return childDoctype === "Purchase Receipt Item" ? "receipt" : "order";
}
function runtimeField(runtime: PurchaseItemRuntimeContract, fieldname: string) {
  return runtime.fields.find((entry) => entry.fieldname === fieldname);
}
function applyRuntimeOverrides(overrides: Record<string, Json>, fields: Set<string>, runtime: PurchaseItemRuntimeContract): void {
  for (const entry of runtime.fields) {
    fieldOverride(overrides, fields, entry.fieldname, {
      hidden: entry.visible ? 0 : 1,
      reqd: entry.required ? 1 : 0,
      read_only: entry.read_only ? 1 : 0,
      label: entry.label,
      sequence: entry.sequence,
      source: entry.source,
      depends_on: null,
      mandatory_depends_on: null,
      read_only_depends_on: null,
    });
  }
}
function quantityLabel(value: unknown): string {
  const uom = normalized(value).replace(/\s+/g, "");
  if (["kg", "kilogram"].includes(uom)) return "Khối lượng";
  if (["cây", "cay", "lá", "la", "tấm", "tam"].includes(uom)) return "Số cây/lá/tấm";
  if (["m", "mét", "met", "meter", "metre"].includes(uom)) return "Số mét";
  return "Số lượng";
}

/**
 * Purchase-specific implementation behind `alumdoor.ui.preview_child_row`.
 * Sales remains byte-for-byte in ui-child-preview-legacy.ts; this module owns only purchase rows.
 */
export async function previewPurchaseChildRow(call: PlatformCall, args: Json): Promise<Response> {
  try {
    const childDoctype = text(args.child_doctype);
    const fields = fieldSet(args);
    const row = args.row && typeof args.row === "object" && !Array.isArray(args.row) ? args.row as Json : {};
    const itemCode = text(row.item_code);
    if (!childDoctype || !fields.size) return answer({ message: "Thiếu child_doctype hoặc child_fields cho preview." }, 422);
    if (!itemCode) return answer({ patch: {}, clear: [], field_overrides: {}, source: "alumdoor.ui.preview_child_row.purchase_runtime" });

    const item = await readDoc(call, "Item", itemCode);
    if (!item || (item.is_purchase_item !== undefined && !checked(item.is_purchase_item)) || checked(item.disabled)) {
      return answer({ message: `Mặt hàng ${itemCode} không tồn tại, đã ngừng dùng hoặc không được phép mua.` }, 422);
    }
    item.item_code = itemCode;
    const surface = surfaceFor(childDoctype);
    const runtime = await readPurchaseItemRuntime(call, itemCode, surface, item);
    if (!runtime) return answer({ message: `Không dựng được Purchase Runtime cho ${itemCode}.` }, 422);

    // Metadata hiện chưa có cờ semantic riêng cho "Dập". Giữ đúng hành vi cũ nhưng đánh dấu
    // source=legacy trong contract: dòng theo lô kích thước + đếm cây/lá phải xác nhận Dập.
    const stamped = runtimeField(runtime, "is_stamped");
    if (stamped?.visible) stamped.required = true;

    const changed = text(args.changed_field);
    const patch: Json = {};
    const clear = new Set<string>();
    const overrides: Record<string, Json> = {};
    if (changed === "item_code") {
      for (const name of PURCHASE_DERIVED_FIELDS) clearIfField(clear, fields, name);
    }
    // Catalog đổi sau khi chứng từ đã có dữ liệu: field bị tắt phải chết cả GIÁ TRỊ, không chỉ
    // biến mất khỏi bảng. `qty` là ngoại lệ có chủ đích: catch-weight dùng một qty ẩn do server
    // sở hữu để tính tiền, nên hidden không đồng nghĩa với stale.
    for (const entry of runtime.fields) {
      if (!entry.visible && !HIDDEN_RUNTIME_PERSISTED_FIELDS.has(entry.fieldname)) {
        clearIfField(clear, fields, entry.fieldname);
      }
    }
    applyRuntimeOverrides(overrides, fields, runtime);

    const measurement = runtime.measurement_profile;
    const material = runtime.material_specification;
    const plan: Array<[string, unknown]> = [
      ["stock_uom", runtime.stock_uom],
      ["inventory_mode", measurement?.inventory_mode ?? null],
      ["measurement_profile", measurement?.name ?? item.measurement_profile],
      ["material_specification", material?.name ?? item.material_specification],
      ["item_name", item.item_name],
      ["description", item.description],
    ];
    for (const [name, value] of plan) setIfField(patch, fields, name, value);

    // `standard_length_m` là fact kỹ thuật từ Material Specification. Chỉ dùng làm GỢI Ý lúc
    // đổi Item và chỉ khi Measurement Profile yêu cầu chiều dài; người dùng vẫn sửa theo lô thật.
    if (
      changed === "item_code"
      && runtimeField(runtime, "length_m")?.visible
      && !positive(row.length_m)
      && material?.standard_length_m
    ) {
      setIfField(patch, fields, "length_m", material.standard_length_m);
    }

    const colorRule = runtimeField(runtime, "color");
    if (colorRule?.visible) {
      const allowedColors = await allowedColorNamesForGroup(call, text(item.item_group), "purchase");
      const currentColor = text(row.color ?? row.colour);
      if (currentColor && allowedColors.length && !allowedColors.includes(currentColor)) {
        clearIfField(clear, fields, "color");
        clearIfField(clear, fields, "colour");
      } else if (changed === "item_code" && !currentColor && text(item.default_color)) {
        setIfField(patch, fields, "color", item.default_color);
        setIfField(patch, fields, "colour", item.default_color);
      }
      for (const name of ["color", "colour"]) {
        fieldOverride(overrides, fields, name, {
          link_filters: JSON.stringify([["Item Color", "name", "in", allowedColors.length ? allowedColors : ["__NO_ALLOWED_COLOR_CONFIG__"]]]),
        });
      }
    } else {
      clearIfField(clear, fields, "color");
      clearIfField(clear, fields, "colour");
    }

    const stockUom = text(runtime.stock_uom);
    const preferredUom = text(runtime.purchase_uom) || stockUom;
    const transactionUom = text(row.uom) || preferredUom;
    setIfField(patch, fields, "uom", transactionUom);

    // Catch-weight purchase axis is intentionally dynamic. A stale/static Item conversion for
    // the purchase weight UOM must NEVER win before the line has both counted pieces and kg.
    const dynamicPurchaseAxis = runtime.tracking.catch_weight
      && transactionUom === preferredUom
      && transactionUom !== stockUom;
    let factor: number | null = transactionUom && transactionUom === stockUom ? 1 : null;
    if (!dynamicPurchaseAxis && !factor && Array.isArray(item.uom_conversions)) {
      const match = item.uom_conversions.find((entry) => text((entry as Json)?.uom) === transactionUom) as Json | undefined;
      factor = positive(match?.conversion_factor);
    }

    const effectiveBeforeCalc = { ...row, ...patch };
    const length = positive(effectiveBeforeCalc.length_m);
    const pieces = positive(effectiveBeforeCalc.qty_bar);
    const kgPerM = material?.theoretical_kg_per_m ?? positive(effectiveBeforeCalc.theoretical_kg_per_m);
    const theoreticalKg = length && pieces && kgPerM ? roundTo(length * pieces * kgPerM) : null;
    if (runtimeField(runtime, "theoretical_kg_per_m")?.visible && kgPerM) setIfField(patch, fields, "theoretical_kg_per_m", kgPerM);
    if (runtimeField(runtime, "theoretical_kg")?.visible) {
      if (theoreticalKg) setIfField(patch, fields, "theoretical_kg", theoreticalKg);
      else clearIfField(clear, fields, "theoretical_kg");
    }

    const actualKg = positive(effectiveBeforeCalc.actual_weight_kg);
    if (runtime.tracking.catch_weight) {
      const pricedKg = surface === "receipt" ? actualKg : theoreticalKg;
      if (pricedKg && fields.has("qty")) patch.qty = pricedKg;
      if (pieces && pricedKg && transactionUom !== stockUom) factor = pieces / pricedKg;
    }
    if (factor) setIfField(patch, fields, "conversion_factor", factor);
    else if (dynamicPurchaseAxis) clearIfField(clear, fields, "conversion_factor");

    if (fields.has("rate") && (changed === "item_code" || row.rate == null || row.rate === "")) {
      const standardRate = Number(item.standard_rate);
      if (Number.isFinite(standardRate) && standardRate >= 0) patch.rate = standardRate;
    }

    const effective = { ...row, ...patch };
    const qty = positive(effective.qty);
    const rate = Number(effective.rate);
    const conversion = positive(effective.conversion_factor);
    if (fields.has("stock_qty")) {
      if (runtime.tracking.catch_weight && pieces) patch.stock_qty = roundTo(pieces);
      else if (qty && conversion) patch.stock_qty = roundTo(qty * conversion);
      else clearIfField(clear, fields, "stock_qty");
    }
    if (fields.has("amount")) {
      if (qty && Number.isFinite(rate) && rate >= 0) patch.amount = Math.round(qty * rate);
      else clearIfField(clear, fields, "amount");
    }

    if (surface === "receipt") {
      const totalLength = length && pieces ? roundTo(length * pieces) : null;
      if (runtimeField(runtime, "total_length_m")?.visible) {
        if (totalLength) setIfField(patch, fields, "total_length_m", totalLength);
        else clearIfField(clear, fields, "total_length_m");
      }
      if (runtimeField(runtime, "actual_kg_per_m")?.visible) {
        if (actualKg && totalLength) setIfField(patch, fields, "actual_kg_per_m", roundTo(actualKg / totalLength));
        else clearIfField(clear, fields, "actual_kg_per_m");
      }
      if (runtimeField(runtime, "actual_kg_per_sqm")?.visible) {
        const width = positive(effective.width_m);
        const area = length && width && pieces ? length * width * pieces : null;
        if (actualKg && area) setIfField(patch, fields, "actual_kg_per_sqm", roundTo(actualKg / area));
        else clearIfField(clear, fields, "actual_kg_per_sqm");
      }
    }

    fieldOverride(overrides, fields, "qty", {
      label: runtime.tracking.catch_weight
        ? (surface === "receipt" ? "SL tính giá (Kg thực)" : "SL tính giá (Kg)")
        : quantityLabel(transactionUom),
    });

    return answer({
      patch,
      clear: [...clear],
      field_overrides: overrides,
      purchase_runtime: runtime,
      source: "alumdoor.ui.preview_child_row.purchase_runtime",
    });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không preview được dòng mua hàng." }, 422);
  }
}
