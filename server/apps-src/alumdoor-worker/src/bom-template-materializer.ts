import {
  resolveBomTemplate,
  resolveBomTemplateComposition,
  resolveBomTemplatePreview,
  type BomComponentRule,
  type BomConditions,
  type PreviewResolvedBomComponent,
  type ResolvedBomCompositionComponent,
  type StoredBomQuantityFormula,
  type BomTemplateDefinition,
  type ResolvedBomTemplate,
} from "./bom-template-core.js";
import {
  inspectBomActualComponents,
  mergeBomActualComponents,
  type BomActualComponentInput,
  type BomActualRequirement,
} from "./bom-actual-components.js";

export type BomMaterializerCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

type Json = Record<string, unknown>;

interface RawBomTemplate extends Json {
  name?: unknown;
  modified?: unknown;
  modified_at?: unknown;
  template_code?: unknown;
  item_code?: unknown;
  conditions_json?: unknown;
  /** Cột Select trên màn hình; được gộp vào `conditions` khi phân giải. */
  sales_mode?: unknown;
  priority?: unknown;
  disabled?: unknown;
  required_context_fields_json?: unknown;
  required_component_keys_json?: unknown;
  required_actual_component_keys_json?: unknown;
  actual_component_allowed_items_json?: unknown;
  component_rules?: unknown;
}

interface RawBomComponentRule extends Json {
  rule_code?: unknown;
  component_key?: unknown;
  item_code?: unknown;
  stock_uom?: unknown;
  conditions_json?: unknown;
  priority?: unknown;
  sequence?: unknown;
  quantity_formula_json?: unknown;
  note?: unknown;
}

interface ExistingBom extends Json {
  name?: unknown;
  item?: unknown;
  docstatus?: unknown;
  revision?: unknown;
  bom_fingerprint?: unknown;
  generated_by_configurator?: unknown;
}

export interface BomProductionLineInput extends Json {
  item_code: string;
  output_qty: number;
  source_warehouse: string;
  bom_actual_components?: BomActualComponentInput[];
  formula_snapshot?: string;
  width_m?: number;
  height_m?: number;
  mesh_height_m?: number;
  cut_width_m?: number;
  billable_area_sqm?: number;
  leaf_count?: number;
  single_layer_leaf_count?: number;
  double_layer_leaf_count?: number;
  estimated_weight_kg?: number;
  color?: string;
  motor_model?: string;
  item_group?: string;
  door_type?: string;
  sales_mode?: string;
  paint_required?: number;
}

export interface BomMaterializationResult {
  bom_no: string;
  bom_template: string;
  bom_template_code: string;
  bom_fingerprint: string;
  materialized: boolean;
  components: ResolvedBomTemplate["components"];
}

export interface BomPreviewResult extends BomMaterializationResult {
  actual_requirements: BomActualRequirement[];
  missing_actual_component_keys: string[];
  actual_complete: boolean;
}

export interface BomRequirementInspectionResult {
  bom_template: string;
  bom_template_code: string;
  components: PreviewResolvedBomComponent[];
  actual_requirements: BomActualRequirement[];
  missing_actual_component_keys: string[];
  actual_complete: boolean;
}

export interface SalesBomCompositionInspectionResult {
  bom_template: string;
  bom_template_code: string;
  components: ResolvedBomCompositionComponent[];
  actual_requirements: BomActualRequirement[];
  missing_actual_component_keys: string[];
  actual_complete: boolean;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

function finiteNumber(value: unknown, label: string, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} phải là số hữu hạn.`);
  return number;
}

function parseJson<T>(value: unknown, fallback: T, label: string): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(text(value)) as T;
  } catch {
    throw new Error(`${label}: JSON không hợp lệ; hệ thống không tự bỏ qua.`);
  }
}

function stringArray(value: unknown, label: string): string[] {
  const parsed = parseJson<unknown>(value, [], label);
  if (!Array.isArray(parsed)) throw new Error(`${label}: phải là mảng JSON.`);
  return parsed.map((entry) => text(entry)).filter(Boolean);
}

function stringArrayMap(value: unknown, label: string): Record<string, string[]> {
  const parsed = parseJson<unknown>(value, {}, label);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`${label}: phải là object JSON.`);
  const output: Record<string, string[]> = {};
  for (const [rawKey, rawItems] of Object.entries(parsed as Record<string, unknown>)) {
    const key = text(rawKey);
    if (!key) throw new Error(`${label}: component key không được rỗng.`);
    if (!Array.isArray(rawItems)) throw new Error(`${label}.${key}: phải là mảng item code.`);
    const items = rawItems.map((entry) => text(entry)).filter(Boolean);
    if (!items.length) throw new Error(`${label}.${key}: allowlist không được rỗng.`);
    output[key] = [...new Set(items)];
  }
  return output;
}

function conditions(value: unknown, label: string): BomConditions {
  const parsed = parseJson<unknown>(value, {}, label);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`${label}: phải là object JSON.`);
  const output: BomConditions = {};
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (!["string", "number", "boolean"].includes(typeof raw)) {
      throw new Error(`${label}.${key}: điều kiện chỉ nhận string/number/boolean.`);
    }
    output[key] = raw as string | number | boolean;
  }
  return output;
}

function quantityFormula(value: unknown, label: string): StoredBomQuantityFormula {
  const parsed = parseJson<unknown>(value, null, label);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`${label}: phải là object JSON.`);
  return parsed as StoredBomQuantityFormula;
}

function parseComponentRule(raw: RawBomComponentRule, templateCode: string, index: number): BomComponentRule {
  const ruleCode = text(raw.rule_code);
  const itemCode = text(raw.item_code);
  if (!ruleCode) throw new Error(`${templateCode}: dòng BOM ${index + 1} thiếu rule_code.`);
  if (!itemCode) throw new Error(`${templateCode}/${ruleCode}: thiếu item_code.`);
  return {
    rule_code: ruleCode,
    ...(text(raw.component_key) ? { component_key: text(raw.component_key) } : {}),
    item_code: itemCode,
    ...(text(raw.stock_uom) ? { stock_uom: text(raw.stock_uom) } : {}),
    conditions: conditions(raw.conditions_json, `${templateCode}/${ruleCode}.conditions_json`),
    priority: finiteNumber(raw.priority, `${templateCode}/${ruleCode}.priority`),
    sequence: finiteNumber(raw.sequence, `${templateCode}/${ruleCode}.sequence`),
    quantity: quantityFormula(raw.quantity_formula_json, `${templateCode}/${ruleCode}.quantity_formula_json`),
    ...(text(raw.note) ? { note: text(raw.note) } : {}),
  };
}

/**
 * Điều kiện áp dụng của một BOM Template — gộp cột `sales_mode` vào cùng cơ chế `conditions`.
 *
 * `sales_mode` là cột Select riêng để chủ xưởng chọn được trên màn hình thay vì phải gõ JSON.
 * Nhưng phân giải thì chỉ được có MỘT cơ chế: nếu cột sống song song với `conditions_json` thì
 * hai chỗ khai cùng một luật và sớm muộn cũng lệch nhau — đúng kiểu lỗi đã trả giá nhiều lần
 * trong repo này.
 *
 * Trống = áp cho mọi cách giao (giữ nguyên hành vi cũ). Có giá trị = thêm một bậc `specificity`,
 * nên bản khai rõ cách giao thắng bản chung, đúng luật chọn template sẵn có.
 *
 * Vì sao cần: khi `Sales Package` bị khai tử, fact "phạm vi cấu phần được giao" không còn chỗ
 * nên nó bò vào MÃ HÀNG — `TP-LUOI-SN13x26-STD - TRONBO` (5 cấu phần) và `- TACHMON` (1 cấu
 * phần) thành hai mặt hàng khác nhau. Đây là đường để một mặt hàng giữ được hai định mức.
 */
function templateConditions(raw: RawBomTemplate, templateCode: string): BomConditions {
  const declared = conditions(raw.conditions_json, `${templateCode}.conditions_json`);
  const salesMode = text(raw.sales_mode);
  if (!salesMode) return declared;
  const existing = declared.sales_mode;
  if (existing !== undefined && text(existing) !== salesMode) {
    throw new Error(
      `${templateCode}: cách giao khai hai nơi lệch nhau — cột sales_mode là "${salesMode}", conditions_json là "${text(existing)}". Sửa một chỗ; hệ thống không đoán.`,
    );
  }
  return { ...declared, sales_mode: salesMode };
}

export function parseBomTemplateRecord(raw: RawBomTemplate): BomTemplateDefinition & { source_name: string; required_actual_component_keys: string[]; actual_component_allowed_items: Record<string, string[]> } {
  const sourceName = text(raw.name);
  const templateCode = text(raw.template_code) || sourceName;
  const itemCode = text(raw.item_code);
  if (!sourceName) throw new Error("BOM Template thiếu name.");
  if (!templateCode) throw new Error(`${sourceName}: thiếu template_code.`);
  if (!itemCode) throw new Error(`${templateCode}: thiếu item_code thành phẩm.`);
  const rows = Array.isArray(raw.component_rules)
    ? raw.component_rules.filter((entry): entry is RawBomComponentRule => Boolean(entry) && typeof entry === "object")
    : [];
  const componentRules = rows.map((row, index) => parseComponentRule(row, templateCode, index));
  return {
    source_name: sourceName,
    ...(text(raw.modified ?? raw.modified_at) ? { modified: text(raw.modified ?? raw.modified_at) } : {}),
    template_code: templateCode,
    item_code: itemCode,
    conditions: templateConditions(raw, templateCode),
    priority: finiteNumber(raw.priority, `${templateCode}.priority`),
    disabled: checked(raw.disabled),
    required_context_fields: stringArray(raw.required_context_fields_json, `${templateCode}.required_context_fields_json`),
    required_component_keys: stringArray(raw.required_component_keys_json, `${templateCode}.required_component_keys_json`),
    required_actual_component_keys: stringArray(raw.required_actual_component_keys_json, `${templateCode}.required_actual_component_keys_json`),
    actual_component_allowed_items: stringArrayMap(raw.actual_component_allowed_items_json, `${templateCode}.actual_component_allowed_items_json`),
    component_rules: componentRules,
  };
}

async function readDoc<T extends Json>(call: BomMaterializerCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((((await response.json()) as { data?: T }).data ?? {}) as T);
}

async function listDocs<T extends Json>(
  call: BomMaterializerCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 500,
): Promise<T[]> {
  const output: T[] = [];
  while (output.length < limit) {
    const pageLength = Math.min(100, limit - output.length);
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_start: String(output.length),
      limit_page_length: String(pageLength),
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
    if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
    const page = (((await response.json()) as { data?: T[] }).data ?? []);
    output.push(...page);
    if (page.length < pageLength) break;
  }
  return output.slice(0, limit);
}

async function createDoc<T extends Json>(call: BomMaterializerCall, doctype: string, document: T): Promise<T & { name: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(document),
  });
  if (!response.ok) throw new Error(`Không tạo được ${doctype}: ${(await response.text()).slice(0, 220)}`);
  const data = ((await response.json()) as { data?: T & { name?: string } }).data;
  if (!data?.name) throw new Error(`${doctype} đã tạo nhưng không trả về số chứng từ.`);
  return { ...data, name: data.name };
}

async function submitDoc(call: BomMaterializerCall, doctype: string, name: string): Promise<void> {
  const response = await call("method/frappe.client.submit", {
    method: "POST",
    body: JSON.stringify({ doctype, name }),
  });
  if (!response.ok) throw new Error(`Không ghi sổ được ${doctype} ${name}: ${(await response.text()).slice(0, 220)}`);
}

async function loadTemplates(call: BomMaterializerCall, itemCode: string): Promise<Array<BomTemplateDefinition & { source_name: string; required_actual_component_keys: string[]; actual_component_allowed_items: Record<string, string[]> }>> {
  // The tenant list endpoint caps each response at 100 rows. Filter by the
  // finished item before reading template documents so an older exact template
  // cannot disappear behind unrelated catalog rows.
  const names = await listDocs<{ name?: string }>(
    call,
    "BOM Template",
    ["name"],
    itemCode ? [["item_code", "=", itemCode]] : [],
    500,
  ).catch(() => []);
  if (!names.length) return [];
  const docs = await Promise.all(names.map(async (row) => {
    const name = text(row.name);
    if (!name) throw new Error("BOM Template list trả về dòng thiếu name.");
    return readDoc<RawBomTemplate>(call, "BOM Template", name);
  }));
  return docs.map(parseBomTemplateRecord);
}

function parseSnapshot(line: BomProductionLineInput): Json {
  return parseJson<Json>(line.formula_snapshot, {}, `${line.item_code}.formula_snapshot`);
}

export function bomContextFromProductionLine(line: BomProductionLineInput): { context: Json; values: Json } {
  const snapshot = parseSnapshot(line);
  const context: Json = {
    ...snapshot,
    item_code: line.item_code,
    item_group: line.item_group ?? snapshot.item_group,
    door_type: line.door_type ?? snapshot.door_type,
    sales_mode: line.sales_mode ?? snapshot.sales_mode,
    color: line.color ?? snapshot.color,
    motor_model: line.motor_model ?? snapshot.motor_model,
    paint_required: line.paint_required ?? snapshot.paint_required,
    ray_type: snapshot.ray_type,
  };
  for (const key of Object.keys(context)) {
    if (context[key] === undefined || context[key] === null || context[key] === "") delete context[key];
  }
  const values: Json = {
    ...context,
    width_m: line.width_m,
    height_m: line.height_m,
    mesh_height_m: line.mesh_height_m,
    cut_width_m: line.cut_width_m,
    billable_area_sqm: line.billable_area_sqm,
    leaf_count: line.leaf_count,
    single_layer_leaf_count: line.single_layer_leaf_count,
    double_layer_leaf_count: line.double_layer_leaf_count,
    estimated_weight_kg: line.estimated_weight_kg,
    output_qty: line.output_qty,
    PB_RONG: line.width_m,
    PB_CAO: line.height_m,
    CAT_LA_RONG: line.cut_width_m,
  };
  for (const key of Object.keys(values)) {
    if (values[key] === undefined || values[key] === null || values[key] === "") delete values[key];
  }
  return { context, values };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function bomFingerprint(input: {
  company: string;
  source_warehouse: string;
  output_qty: number;
  resolved: ResolvedBomTemplate;
}): string {
  return `bom-v1-${fnv1a(stable({
    company: text(input.company),
    source_warehouse: text(input.source_warehouse),
    output_qty: input.output_qty,
    template_code: input.resolved.template_code,
    item_code: input.resolved.item_code,
    components: input.resolved.components.map((row) => ({
      component_key: row.component_key ?? "",
      item_code: row.item_code,
      stock_uom: row.stock_uom ?? "",
      qty: row.qty,
      source_rule: row.source_rule,
    })),
  }))}`;
}

async function existingGeneratedBom(call: BomMaterializerCall, fingerprint: string): Promise<string> {
  const rows = await listDocs<ExistingBom>(
    call,
    "Bill of Materials",
    ["name", "docstatus", "bom_fingerprint", "generated_by_configurator"],
    [["bom_fingerprint", "=", fingerprint], ["docstatus", "=", 1]],
    10,
  ).catch(() => []);
  const matches = rows.filter((row) => text(row.bom_fingerprint) === fingerprint && checked(row.generated_by_configurator));
  if (matches.length > 1) throw new Error(`Có ${matches.length} BOM sinh động trùng fingerprint ${fingerprint}; hệ thống không đoán.`);
  return text(matches[0]?.name);
}

async function nextRevision(call: BomMaterializerCall, itemCode: string): Promise<number> {
  const rows = await listDocs<ExistingBom>(
    call,
    "Bill of Materials",
    ["name", "item", "revision"],
    [["item", "=", itemCode]],
    500,
  ).catch(() => []);
  return rows.reduce((max, row) => Math.max(max, Math.trunc(Number(row.revision ?? 0)) || 0), 0) + 1;
}

/**
 * Sales-only composition lookup. This path selects the same active template
 * and conditional component rules as production, but deliberately does not
 * evaluate production quantities. Sales dimensions and quantities are added
 * later from the parent Sales Order Item and each child Item master.
 */
export async function inspectSalesLineBomComposition(
  call: BomMaterializerCall,
  line: BomProductionLineInput,
): Promise<SalesBomCompositionInspectionResult> {
  const templates = await loadTemplates(call, line.item_code);
  if (!templates.length) {
    throw new Error(`${line.item_code}: chưa cấu hình danh sách cấu thành BOM bán hàng.`);
  }
  const { context } = bomContextFromProductionLine(line);
  const resolved = resolveBomTemplateComposition({ templates, context });
  if (resolved.item_code !== line.item_code) {
    throw new Error(`${resolved.template_code}: thành phẩm ${resolved.item_code} không khớp dòng bán ${line.item_code}.`);
  }
  const source = templates.find((template) => template.source_name === resolved.source_name)
    ?? templates.find((template) => template.template_code === resolved.template_code);
  if (!source) throw new Error(`${resolved.template_code}: không xác định được BOM Template nguồn.`);
  const inspection = inspectBomActualComponents({
    template_code: resolved.template_code,
    ...(line.bom_actual_components === undefined ? {} : { actual_components: line.bom_actual_components }),
    required_actual_component_keys: source.required_actual_component_keys,
    allowed_item_codes_by_key: source.actual_component_allowed_items,
  });
  return {
    bom_template: source.source_name,
    bom_template_code: resolved.template_code,
    components: resolved.components,
    actual_requirements: inspection.requirements,
    missing_actual_component_keys: inspection.missing_component_keys,
    actual_complete: inspection.complete,
  };
}

export async function inspectProductionLineBomRequirements(
  call: BomMaterializerCall,
  line: BomProductionLineInput,
): Promise<BomRequirementInspectionResult> {
  const templates = await loadTemplates(call, line.item_code);
  if (!templates.length) {
    throw new Error(`${line.item_code}: chưa có BOM tĩnh và chưa cấu hình BOM Template.`);
  }
  const { context, values } = bomContextFromProductionLine(line);
  const resolved = resolveBomTemplatePreview({ templates, context, values });
  if (resolved.item_code !== line.item_code) {
    throw new Error(`${resolved.template_code}: thành phẩm ${resolved.item_code} không khớp dòng bán ${line.item_code}.`);
  }
  const source = templates.find((template) => template.source_name === resolved.source_name)
    ?? templates.find((template) => template.template_code === resolved.template_code);
  if (!source) throw new Error(`${resolved.template_code}: không xác định được BOM Template nguồn.`);
  const inspection = inspectBomActualComponents({
    template_code: resolved.template_code,
    ...(line.bom_actual_components === undefined ? {} : { actual_components: line.bom_actual_components }),
    required_actual_component_keys: source.required_actual_component_keys,
    allowed_item_codes_by_key: source.actual_component_allowed_items,
  });
  return {
    bom_template: source.source_name,
    bom_template_code: resolved.template_code,
    components: resolved.components,
    actual_requirements: inspection.requirements,
    missing_actual_component_keys: inspection.missing_component_keys,
    actual_complete: inspection.complete,
  };
}

export async function previewProductionLineBom(
  call: BomMaterializerCall,
  input: { line: BomProductionLineInput; company: string },
): Promise<BomPreviewResult> {
  const templates = await loadTemplates(call, input.line.item_code);
  if (!templates.length) {
    throw new Error(`${input.line.item_code}: chưa có BOM tĩnh và chưa cấu hình BOM Template.`);
  }
  const { context, values } = bomContextFromProductionLine(input.line);
  const resolved = resolveBomTemplate({ templates, context, values });
  if (resolved.item_code !== input.line.item_code) {
    throw new Error(`${resolved.template_code}: thành phẩm ${resolved.item_code} không khớp dòng bán ${input.line.item_code}.`);
  }
  const source = templates.find((template) => template.source_name === resolved.source_name)
    ?? templates.find((template) => template.template_code === resolved.template_code);
  if (!source) throw new Error(`${resolved.template_code}: không xác định được BOM Template nguồn.`);
  const inspection = inspectBomActualComponents({
    template_code: resolved.template_code,
    ...(input.line.bom_actual_components === undefined ? {} : { actual_components: input.line.bom_actual_components }),
    required_actual_component_keys: source.required_actual_component_keys,
    allowed_item_codes_by_key: source.actual_component_allowed_items,
  });
  if (!inspection.complete) {
    return {
      bom_no: "",
      bom_template: source.source_name,
      bom_template_code: resolved.template_code,
      bom_fingerprint: "",
      materialized: false,
      components: resolved.components,
      actual_requirements: inspection.requirements,
      missing_actual_component_keys: inspection.missing_component_keys,
      actual_complete: false,
    };
  }
  const resolvedWithActuals = mergeBomActualComponents({
    resolved,
    actual_components: inspection.actual_components,
    required_actual_component_keys: source.required_actual_component_keys,
    allowed_item_codes_by_key: source.actual_component_allowed_items,
  });
  const fingerprint = bomFingerprint({
    company: input.company,
    source_warehouse: input.line.source_warehouse,
    output_qty: input.line.output_qty,
    resolved: resolvedWithActuals,
  });
  const prior = await existingGeneratedBom(call, fingerprint);
  return {
    bom_no: prior,
    bom_template: source.source_name,
    bom_template_code: resolved.template_code,
    bom_fingerprint: fingerprint,
    materialized: false,
    components: resolvedWithActuals.components,
    actual_requirements: inspection.requirements,
    missing_actual_component_keys: [],
    actual_complete: true,
  };
}

export async function resolveProductionLineBom(
  call: BomMaterializerCall,
  input: {
    line: BomProductionLineInput;
    company: string;
    materialize: boolean;
  },
): Promise<BomMaterializationResult> {
  const templates = await loadTemplates(call, input.line.item_code);
  if (!templates.length) {
    throw new Error(`${input.line.item_code}: chưa có BOM tĩnh và chưa cấu hình BOM Template.`);
  }
  const { context, values } = bomContextFromProductionLine(input.line);
  const resolved = resolveBomTemplate({ templates, context, values });
  if (resolved.item_code !== input.line.item_code) {
    throw new Error(`${resolved.template_code}: thành phẩm ${resolved.item_code} không khớp dòng bán ${input.line.item_code}.`);
  }
  const source = templates.find((template) => template.source_name === resolved.source_name)
    ?? templates.find((template) => template.template_code === resolved.template_code);
  if (!source) throw new Error(`${resolved.template_code}: không xác định được BOM Template nguồn.`);
  const resolvedWithActuals = mergeBomActualComponents({
    resolved,
    actual_components: input.line.bom_actual_components,
    required_actual_component_keys: source.required_actual_component_keys,
    allowed_item_codes_by_key: source.actual_component_allowed_items,
  });
  const fingerprint = bomFingerprint({
    company: input.company,
    source_warehouse: input.line.source_warehouse,
    output_qty: input.line.output_qty,
    resolved: resolvedWithActuals,
  });
  const prior = await existingGeneratedBom(call, fingerprint);
  if (prior) {
    return {
      bom_no: prior,
      bom_template: source.source_name,
      bom_template_code: resolved.template_code,
      bom_fingerprint: fingerprint,
      materialized: false,
      components: resolvedWithActuals.components,
    };
  }
  if (!input.materialize) {
    return {
      bom_no: "",
      bom_template: source.source_name,
      bom_template_code: resolved.template_code,
      bom_fingerprint: fingerprint,
      materialized: false,
      components: resolvedWithActuals.components,
    };
  }
  const revision = await nextRevision(call, input.line.item_code);
  const created = await createDoc(call, "Bill of Materials", {
    company: text(input.company),
    item: input.line.item_code,
    quantity: input.line.output_qty,
    revision,
    is_active: 1,
    bom_status: "Active",
    bom_template: source.source_name,
    bom_template_code: resolved.template_code,
    bom_fingerprint: fingerprint,
    generated_by_configurator: 1,
    configuration_snapshot: input.line.formula_snapshot ?? "{}",
    items: resolvedWithActuals.components.map((row, index) => ({
      row_id: `ROW-${index + 1}`,
      item_code: row.item_code,
      qty: row.qty,
      source_warehouse: input.line.source_warehouse,
    })),
  });
  await submitDoc(call, "Bill of Materials", created.name);
  return {
    bom_no: created.name,
    bom_template: source.source_name,
    bom_template_code: resolved.template_code,
    bom_fingerprint: fingerprint,
    materialized: true,
    components: resolvedWithActuals.components,
  };
}
