import {
  calculateDoorFormula,
  inferDoorType,
  isManualPullGroup,
  parseDoorPolicy,
  selectDoorPolicy,
  type CustomerGroup,
  type SalesMode,
} from "./door-formulas.js";
import { calculateLeafPlan, type ProductionPlatformCall } from "./sales-production-core.js";

type Json = Record<string, unknown>;
type LeafRounding = "Ngưỡng trừ-một-lá" | "Nấc 0-0.3-0.7-1" | "Làm tròn xuống";

type ItemDoc = Json & {
  item_group?: string;
  door_type?: string;
  inventory_mode?: string;
  min_area_sqm?: number;
  purchase_kg_per_m2?: number;
  leaf_divisor_m?: number;
};

type RawPolicy = Json & {
  name?: string;
  policy_name?: string;
  door_type?: string;
  item_group?: string;
  ray_type?: string;
  height_pb_offset_m?: unknown;
  leaf_height_deduction_m?: unknown;
  leaf_divisor_const?: unknown;
  leaf_divisor_source?: string;
  leaf_rounding?: LeafRounding;
  leaf_round_threshold?: unknown;
  leaf_formula?: string;
  leaf_variants?: Array<{ variant_label?: string; addend?: unknown }>;
};

type BomSummary = Json & {
  name?: string;
  item?: string;
  color?: string;
  docstatus?: number;
  is_active?: unknown;
  bom_status?: string;
  effective_from?: string;
  effective_to?: string;
  revision?: number;
};

type BomRow = Json & {
  item_code?: string;
  qty_basis?: string;
};

type BomDoc = BomSummary & {
  items?: BomRow[];
};

type StockProfileResolution = {
  bom_no: string | null;
  stock_profile_item: string | null;
  stock_profile_error: string | null;
};

const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

function positive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  return number;
}

function nonNegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} không được âm.`);
  return number;
}

function integer(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} phải là số nguyên dương.`);
  return number;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function dateOnly(value: unknown): string {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function activeOn(row: { effective_from?: string; effective_to?: string }, on: string): boolean {
  const from = dateOnly(row.effective_from);
  const to = dateOnly(row.effective_to);
  return (!from || from <= on) && (!to || to >= on);
}

async function readDoc<T extends Json>(call: ProductionPlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

async function listDocs<T extends Json>(
  call: ProductionPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 500,
): Promise<T[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T[] }).data ?? []);
}

async function listPolicies(call: ProductionPlatformCall): Promise<RawPolicy[]> {
  const fields = [
    "name", "policy_name", "door_type", "item_group", "ray_type", "height_pb_offset_m",
    "dealer_width_basis", "retail_width_basis", "dealer_cut_deduction_m", "retail_cut_deduction_m",
    "butterfly_cut_deduction_m", "dealer_split_sales_basis", "dealer_full_sales_basis", "retail_sales_basis",
    "manual_pull_sales_basis", "purchase_formula", "purchase_height_basis", "purchase_width_basis",
    "priority", "disabled", "note", "leaf_formula", "leaf_height_deduction_m", "leaf_divisor_source",
    "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold", "leaf_variants",
  ];
  return listDocs<RawPolicy>(call, "Cutting Policy", fields, [], 500);
}

function policyVersion(policy: RawPolicy): string {
  const payload = [
    text(policy.policy_name ?? policy.name), text(policy.door_type), text(policy.item_group), text(policy.ray_type),
    text(policy.height_pb_offset_m), text(policy.leaf_formula), text(policy.leaf_height_deduction_m),
    text(policy.leaf_divisor_source), text(policy.leaf_divisor_const), text(policy.leaf_rounding),
    text(policy.leaf_round_threshold), JSON.stringify(policy.leaf_variants ?? []),
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Resolve the physical aluminium profile from the exact BOM that would be used for the
 * finished door. The strongest signal is a BOM row with qty_basis="Theo số lá"; old BOMs
 * without qty_basis fall back only when exactly one row is an Item managed as Nhôm cây/lá.
 * Ambiguity is returned as an explicit error and the wizard must not claim ATP.
 */
async function resolveStockProfile(
  call: ProductionPlatformCall,
  itemCode: string,
  color: string,
  on: string,
): Promise<StockProfileResolution> {
  try {
    const boms = await listDocs<BomSummary>(call, "Bill of Materials", [
      "name", "item", "color", "docstatus", "is_active", "bom_status", "effective_from", "effective_to", "revision",
    ], [["item", "=", itemCode]], 100);
    const candidates = boms
      .filter((row) => row.item === itemCode && Number(row.docstatus ?? 0) === 1)
      .filter((row) => !text(row.color) || !color || text(row.color) === color)
      .filter((row) => row.bom_status ? text(row.bom_status) === "Active" : checked(row.is_active))
      .filter((row) => activeOn(row, on))
      .sort((left, right) => Number(right.revision ?? 0) - Number(left.revision ?? 0));
    if (!candidates.length) {
      return { bom_no: null, stock_profile_item: null, stock_profile_error: `${itemCode}: chưa có BOM đang hiệu lực${color ? ` cho màu ${color}` : ""}.` };
    }
    if (candidates.length > 1 && Number(candidates[0]!.revision ?? 0) === Number(candidates[1]!.revision ?? 0)) {
      return { bom_no: null, stock_profile_item: null, stock_profile_error: `${itemCode}: có nhiều BOM cùng revision đang hiệu lực.` };
    }
    const bomNo = text(candidates[0]!.name);
    if (!bomNo) return { bom_no: null, stock_profile_item: null, stock_profile_error: `${itemCode}: BOM hiệu lực không có định danh.` };
    const bom = await readDoc<BomDoc>(call, "Bill of Materials", bomNo);
    const rows = (bom.items ?? []).filter((row) => text(row.item_code));
    if (!rows.length) return { bom_no: bomNo, stock_profile_item: null, stock_profile_error: `${bomNo}: BOM chưa có dòng nguyên vật liệu.` };

    const byLeaf = rows.filter((row) => text(row.qty_basis) === "Theo số lá");
    if (byLeaf.length > 1) {
      return { bom_no: bomNo, stock_profile_item: null, stock_profile_error: `${bomNo}: có nhiều dòng vật tư "Theo số lá"; chưa thể xác định mã nhôm lá duy nhất.` };
    }
    if (byLeaf.length === 1) {
      const code = text(byLeaf[0]!.item_code);
      const material = await readDoc<ItemDoc>(call, "Item", code);
      if (text(material.inventory_mode) !== "Nhôm cây/lá") {
        return { bom_no: bomNo, stock_profile_item: null, stock_profile_error: `${bomNo}: dòng "Theo số lá" ${code} không phải Item Nhôm cây/lá.` };
      }
      return { bom_no: bomNo, stock_profile_item: code, stock_profile_error: null };
    }

    const rawProfiles: string[] = [];
    for (const row of rows) {
      const code = text(row.item_code);
      const material = await readDoc<ItemDoc>(call, "Item", code);
      if (text(material.inventory_mode) === "Nhôm cây/lá") rawProfiles.push(code);
    }
    const unique = [...new Set(rawProfiles)];
    if (unique.length === 1) return { bom_no: bomNo, stock_profile_item: unique[0]!, stock_profile_error: null };
    if (!unique.length) {
      return { bom_no: bomNo, stock_profile_item: null, stock_profile_error: `${bomNo}: không có vật tư Nhôm cây/lá để kiểm tra lô.` };
    }
    return {
      bom_no: bomNo,
      stock_profile_item: null,
      stock_profile_error: `${bomNo}: có nhiều vật tư Nhôm cây/lá (${unique.join(", ")}); cần khai đúng một dòng "Theo số lá".`,
    };
  } catch (error) {
    return {
      bom_no: null,
      stock_profile_item: null,
      stock_profile_error: error instanceof Error ? error.message : "Không xác định được mã nhôm nguyên liệu từ BOM.",
    };
  }
}

/**
 * Read-only configurator context used by the one-page sales wizard.
 *
 * Client sends the measurement vocabulary the customer actually used. Conversion to the
 * policy measurement basis stays here, next to Cutting Policy, so React never owns U75/U100
 * deductions or CLL -> CPB offsets. The same response also resolves the effective BOM and
 * physical aluminium profile for ATP; it never guesses a raw SKU from the finished Item name.
 */
export async function calculateSalesWizardLineContext(
  call: ProductionPlatformCall,
  args: Json,
): Promise<Response> {
  try {
    const itemCode = text(args.item_code);
    if (!itemCode) throw new Error("Cần chọn mặt hàng cửa.");
    const item = await readDoc<ItemDoc>(call, "Item", itemCode);
    if (text(item.inventory_mode) !== "Thành phẩm theo m2") throw new Error(`${itemCode} không phải thành phẩm tính theo m2.`);
    const doorType = inferDoorType(item.door_type, item.item_group);
    if (!doorType) throw new Error(`${itemCode} chưa khai Loại cửa.`);
    const customerGroup = text(args.customer_group) as CustomerGroup;
    if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") throw new Error("Cần Nhóm giá Đại lý/Lẻ để chọn đúng công thức.");
    const salesMode = (text(args.sales_mode) || "Trọn bộ") as SalesMode;
    if (salesMode !== "Trọn bộ" && salesMode !== "Tách món") throw new Error("Cách bán không hợp lệ.");

    const requestedRay = text(args.ray_type);
    const policies = await listPolicies(call);
    const exactRay = requestedRay ? policies.filter((row) => text(row.ray_type) === requestedRay) : policies;
    if (requestedRay && !exactRay.length) throw new Error(`Chưa có Chính sách công thức cho ray ${requestedRay}.`);
    const parsed = exactRay.map((row) => ({ raw: row, parsed: parseDoorPolicy(row) }));
    const selected = selectDoorPolicy(parsed.map((entry) => entry.parsed), doorType, text(item.item_group));
    const pair = parsed.find((entry) => entry.parsed.policy_name === selected.policy_name);
    if (!pair) throw new Error(`Không đọc được chính sách ${selected.policy_name}.`);

    const inputWidth = positive(args.width_m, "Rộng");
    const inputHeight = positive(args.height_m, "Cao");
    const widthInputBasis = text(args.width_input_basis) || "Rộng phủ bì";
    const heightInputBasis = text(args.height_input_basis) || "Cao phủ bì";
    const setCount = integer(args.set_count ?? 1, "Số bộ");

    const deduction = checked(args.has_butterfly_bracket) && pair.parsed.butterfly_cut_deduction_m != null
      ? pair.parsed.butterfly_cut_deduction_m
      : customerGroup === "Đại lý" ? pair.parsed.dealer_cut_deduction_m : pair.parsed.retail_cut_deduction_m;
    const measuredWidth = widthInputBasis === "Rộng lọt lòng" ? inputWidth + deduction : inputWidth;

    let coverHeight = inputHeight;
    if (heightInputBasis === "Cao lọt lòng") {
      if (pair.raw.height_pb_offset_m == null || pair.raw.height_pb_offset_m === "") {
        throw new Error(`${selected.policy_name}: chưa khai phần cộng Cao lọt lòng -> Cao phủ bì.`);
      }
      coverHeight += nonNegative(pair.raw.height_pb_offset_m, "Phần cộng cao phủ bì");
    }

    const formula = calculateDoorFormula(pair.parsed, {
      door_type: doorType,
      item_group: text(item.item_group),
      customer_group: customerGroup,
      sales_mode: salesMode,
      has_butterfly_bracket: checked(args.has_butterfly_bracket),
      is_manual_pull: checked(args.is_manual_pull) || isManualPullGroup(item.item_group),
      measured_width_m: measuredWidth,
      cover_height_m: coverHeight,
      ...(args.mesh_height_m == null || args.mesh_height_m === "" ? {} : { mesh_height_m: Number(args.mesh_height_m) }),
      set_count: setCount,
      min_area_sqm: Number(item.min_area_sqm ?? 0) || 0,
      ...(Number(item.purchase_kg_per_m2 ?? 0) > 0 ? { kg_per_m2: Number(item.purchase_kg_per_m2) } : {}),
      purpose: pair.parsed.purchase_formula === "Barem kg/m2" ? "all" : "sales",
    });

    let leaf = null;
    let leafError: string | null = null;
    try {
      leaf = calculateLeafPlan(pair.raw, {
        ...args,
        height_m: coverHeight,
        leaf_divisor_m: args.leaf_divisor_m ?? item.leaf_divisor_m,
      });
    } catch (error) {
      leafError = error instanceof Error ? error.message : "Không tính được số lá.";
    }

    const on = dateOnly(args.delivery_date) || new Date().toISOString().slice(0, 10);
    const stockProfile = await resolveStockProfile(call, itemCode, text(args.color), on);

    return answer({
      ...formula,
      item_code: itemCode,
      item_group: text(item.item_group),
      door_type: doorType,
      policy_name: selected.policy_name,
      formula_version: policyVersion(pair.raw),
      ray_type: requestedRay || text(pair.raw.ray_type) || null,
      input_width_basis: widthInputBasis,
      input_width_m: round(inputWidth),
      cover_width_m: round(measuredWidth),
      input_height_basis: heightInputBasis,
      input_height_m: round(inputHeight),
      cover_height_m: round(coverHeight),
      leaf_formula: leaf?.leaf_formula ?? text(pair.raw.leaf_formula),
      leaf_variant: leaf?.leaf_variant ?? (text(args.leaf_variant) || null),
      leaf_height_deduction_m: leaf?.height_deduction_m ?? pair.raw.leaf_height_deduction_m ?? null,
      leaf_divisor_m: leaf?.divisor_m ?? args.leaf_divisor_m ?? item.leaf_divisor_m ?? pair.raw.leaf_divisor_const ?? null,
      leaf_rounding: text(pair.raw.leaf_rounding),
      leaf_count: leaf?.leaf_count ?? null,
      total_leaf_count: leaf ? round(leaf.leaf_count * setCount) : null,
      single_layer_leaf_count: leaf?.single_layer_leaf_count ?? null,
      double_layer_leaf_count: leaf?.double_layer_leaf_count ?? null,
      leaf_error: leafError,
      estimated_weight_kg: formula.purchase_kg == null ? null : round(Number(formula.purchase_kg), 3),
      formula_explanation: `${formula.explanation}${leaf ? ` ${leaf.explanation}` : ""}`.trim(),
      ...stockProfile,
    });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không tính được cấu hình bán hàng." }, 422);
  }
}
