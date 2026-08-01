import {
  calculateDoorFormula,
  inferDoorType,
  isManualPullGroup,
  parseDoorPolicy,
  selectDoorPolicy,
  type CustomerGroup,
  type DoorFormulaPolicy,
  type DoorType,
  type SalesMode,
} from "./door-formulas.js";

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
  item_group?: string;
  door_type?: string;
  inventory_mode?: string;
  stock_uom?: string;
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

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
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
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T[] }).data ?? []);
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

function choosePolicy(rawPolicies: RawPolicy[], doorType: DoorType, itemGroup: string): { parsed: DoorFormulaPolicy; raw: RawPolicy } {
  const pairs = parsedPolicies(rawPolicies);
  const parsed = selectDoorPolicy(pairs.map((entry) => entry.parsed), doorType, itemGroup);
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
  const divisor = finitePositive(policy.leaf_divisor_const ?? line.leaf_divisor_m, "Ước số chia lá");
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
    const variant = (policy.leaf_variants ?? []).find((entry) => text(entry.variant_label) === leafVariant);
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
    height_basis_m: round(height),
    height_deduction_m: round(deduction),
    divisor_m: round(divisor),
    raw_leaf_count: round(raw),
    leaf_count: round(count),
    explanation: `${formula}: (${round(height)} − ${round(deduction)}) ÷ ${round(divisor)}`
      + (leafVariant ? ` + ${round(addend)} (${leafVariant})` : "")
      + ` = ${round(raw)} → ${round(count)} lá (${rounding}).`,
  };

  if (formula === "Kiểu tấm liền Úc") {
    const single = finiteNonNegative(line.single_layer_leaf_count ?? 0, "Số lá một lớp");
    if (single > count) throw new Error(`Số lá một lớp ${single} không được lớn hơn tổng ${count}.`);
    result.single_layer_leaf_count = round(single);
    result.double_layer_leaf_count = round(count - single);
    result.explanation += ` AL70: ${round(single)} lá một lớp, ${round(count - single)} lá hai lớp.`;
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
  return { minutes: round(selected.minutes * factor, 2), basis };
}

function productionDepartment(doorType: DoorType): string {
  return doorType === "Cửa tấm liền Úc" ? "Cửa Úc" : doorType;
}

function selectBom(boms: BomDoc[], itemCode: string, color: string, on: string): string {
  const candidates = boms
    .filter((row) => row.item === itemCode && row.docstatus === 1)
    .filter((row) => !row.color || !color || row.color === color)
    .filter((row) => (row.bom_status ? row.bom_status === "Active" : checked(row.is_active)))
    .filter((row) => activeOn(row, on))
    .sort((left, right) => Number(right.revision ?? 0) - Number(left.revision ?? 0));
  if (!candidates.length) throw new Error(`${itemCode}: chưa có BOM đang hiệu lực${color ? ` cho màu ${color}` : ""}.`);
  if (candidates.length > 1 && Number(candidates[0]!.revision ?? 0) === Number(candidates[1]!.revision ?? 0)) {
    throw new Error(`${itemCode}: có nhiều BOM cùng revision đang hiệu lực.`);
  }
  return text(candidates[0]!.name);
}

export function buildSalesProductionLines(input: BuildInputs): SalesProductionLine[] {
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
    if (text(item.inventory_mode) !== "Thành phẩm theo m2") continue;
    const doorType = inferDoorType(item.door_type, item.item_group);
    if (!doorType) continue;
    const itemGroup = text(item.item_group);
    const sourceRow = text(row.row_id ?? row.name) || `R${index + 1}`;
    const width = finitePositive(row.width_m, `Dòng ${index + 1}: Rộng`);
    const height = finitePositive(row.height_m, `Dòng ${index + 1}: Cao`);
    const sets = positiveInteger(row.set_count ?? 1, `Dòng ${index + 1}: Số bộ`);
    const salesMode = (text(row.sales_mode) || "Trọn bộ") as SalesMode;
    if (salesMode !== "Trọn bộ" && salesMode !== "Tách món") throw new Error(`Dòng ${index + 1}: Cách bán không hợp lệ.`);
    const chosen = choosePolicy(input.policies, doorType, itemGroup);
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
    const leaf = calculateLeafPlan(chosen.raw, row);
    const department = productionDepartment(doorType);
    const billablePerSet = round(finitePositive(formula.billable_area_sqm, "Diện tích tính tiền") / sets);
    const standard = findStandard(input.standards, doorType, department, on, { area_sqm: billablePerSet, sets: 1 });
    const estimatedWeightPerSet = formula.purchase_kg == null ? undefined : round(Number(formula.purchase_kg) / sets);
    const color = text(row.color);
    const bomNo = selectBom(input.boms, itemCode, color, on);
    const stockUom = text(item.stock_uom) || "Bộ";
    const outputQty = ["m2", "m²", "sqm"].includes(normalized(stockUom)) ? billablePerSet : 1;
    const formulaVersion = policyVersion(chosen.raw);
    const paintRequired = checked(row.paint_required) ? 1 : 0;

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
        width_m: round(width),
        height_m: round(height),
        mesh_height_m: row.mesh_height_m == null || row.mesh_height_m === "" ? null : round(Number(row.mesh_height_m)),
        set_no: setNo,
        formula_policy: chosen.parsed.policy_name,
        formula_version: formulaVersion,
        width_basis: formula.width_basis,
        cut_width_m: formula.cut_width_m,
        billable_area_sqm: billablePerSet,
        leaf,
        estimated_weight_kg: estimatedWeightPerSet ?? null,
        estimated_minutes: standard.minutes,
        ray_type: text(chosen.raw.ray_type) || null,
      };
      lines.push({
        request_line_key: lineKey,
        sales_order_row_id: sourceRow,
        item_code: itemCode,
        item_group: itemGroup,
        door_type: doorType,
        department,
        set_no: setNo,
        set_count: 1,
        width_m: round(width),
        height_m: round(height),
        ...(row.mesh_height_m == null || row.mesh_height_m === "" ? {} : { mesh_height_m: round(Number(row.mesh_height_m)) }),
        ...(color ? { color } : {}),
        ...(text(row.motor_model) ? { motor_model: text(row.motor_model) } : {}),
        sales_mode: salesMode,
        formula_policy: chosen.parsed.policy_name,
        formula_version: formulaVersion,
        width_basis: formula.width_basis,
        cut_width_m: round(Number(formula.cut_width_m)),
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
        output_qty: round(outputQty),
        stock_uom: stockUom,
        paint_required: paintRequired as 0 | 1,
        formula_snapshot: JSON.stringify(snapshot),
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
      "name", "item", "color", "docstatus", "is_active", "bom_status", "effective_from", "effective_to", "revision",
    ]),
  ]);
  return {
    sales,
    items: new Map(itemRows),
    policies,
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
    if (text(item.inventory_mode) !== "Thành phẩm theo m2") {
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
        "priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",
        "leaf_divisor_source", "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold", "leaf_variants",
      ]),
      listDocs<ProductionStandard>(call, "Production Standard", [
        "name", "department", "door_type", "operation", "minutes_per_set", "minutes_per_unit", "capacity_basis", "batch_capacity",
        "persons", "shift_hours", "efficiency", "workstation", "default_overtime_hours", "standard_time",
        "effective_from", "effective_to", "disabled",
      ]).catch(() => []),
    ]);
    const chosen = choosePolicy(policies, doorType, text(item.item_group));
    const sets = positiveInteger(args.set_count ?? 1, "Số bộ");
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
      purpose: chosen.parsed.purchase_formula === "Barem kg/m2" ? "all" : "sales",
    });
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
      item_code: itemCode,
      item_group: text(item.item_group),
      door_type: doorType,
      department,
      leaf_formula: leaf?.leaf_formula ?? text(chosen.raw.leaf_formula),
      leaf_variant: leaf?.leaf_variant ?? (text(args.leaf_variant) || null),
      leaf_height_deduction_m: leaf?.height_deduction_m ?? chosen.raw.leaf_height_deduction_m ?? null,
      leaf_divisor_m: leaf?.divisor_m ?? args.leaf_divisor_m ?? item.leaf_divisor_m ?? chosen.raw.leaf_divisor_const ?? null,
      leaf_rounding: text(chosen.raw.leaf_rounding),
      leaf_count: leaf?.leaf_count ?? null,
      single_layer_leaf_count: leaf?.single_layer_leaf_count ?? null,
      double_layer_leaf_count: leaf?.double_layer_leaf_count ?? null,
      leaf_error: leafError,
      estimated_weight_kg: formula.purchase_kg == null ? null : round(Number(formula.purchase_kg), 3),
      estimated_minutes: round(standard.minutes * sets, 2),
      schedule_warning: standard.warning ?? null,
      formula_version: policyVersion(chosen.raw),
      formula_explanation: `${formula.explanation}${leaf ? ` ${leaf.explanation}` : ""}`.trim(),
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không tính được chi tiết sản xuất.");
  }
}

export async function previewSalesProduction(call: ProductionPlatformCall, args: Json): Promise<Response> {
  try {
    const input = await loadBuildInputs(call, args);
    const items = buildSalesProductionLines(input);
    const warnings = [...new Set(items.map((line) => line.schedule_warning).filter((value): value is string => Boolean(value)))];
    return answer({
      sales_order: input.sales.name,
      customer: input.sales.customer,
      source_warehouse: input.source_warehouse,
      target_warehouse: input.target_warehouse,
      lines: items.length,
      work_orders: items.length,
      estimated_minutes: round(items.reduce((sum, line) => sum + line.estimated_minutes, 0), 2),
      estimated_weight_kg: round(items.reduce((sum, line) => sum + Number(line.estimated_weight_kg ?? 0), 0), 3),
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
    const lines = buildSalesProductionLines(input);
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
