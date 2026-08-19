import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import type { BomActualComponentRow, BomActualRequirement } from "../AlumdoorBomActualEditor.js";

export type Json = Record<string, unknown>;

export interface FieldOverride {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
}

export interface SalesItemContext extends Json {
  item_group?: string;
  door_type?: string | null;
  inventory_mode?: string;
  measurement_profile?: string | null;
  selected_uom?: string;
  allowed_uoms?: string[];
  availability_status?: string;
  price_missing?: boolean;
  price_error?: string | null;
  default_color?: string | null;
}

export interface PricingRuleSnapshot extends Json {
  rule_name?: string;
  effect_type?: string;
  priority?: number;
  discount_percentage?: string | number;
  amount_minor?: number;
  basis?: string;
  basis_qty?: string | number;
}

export interface BenefitItem extends Json {
  item_code?: string;
  item_name?: string;
  qty?: number;
  uom?: string;
  label?: string;
  source_rule?: string;
}

export interface CommercialPreview extends Json {
  item_price?: string;
  selling_rate?: string | number;
  priced_qty?: string | number;
  gross_amount?: string | number;
  discount_percentage?: string | number;
  discount_amount?: string | number;
  adjustment_amount?: string | number;
  net_before_tax?: string | number;
  pricing_rule_snapshots?: PricingRuleSnapshot[];
  applied_adjustments?: Json[];
  benefit_items?: BenefitItem[];
}

export interface BomPreviewComponent extends Json {
  component_key?: string;
  item_code?: string;
  color?: string;
  width_pb_ray_m?: number;
  width_pb_nhua_m?: number;
  width_m?: number;
  height_m?: number;
  mesh_height_m?: number;
  cut_width_m?: number;
  length_m?: number;
  set_count?: number;
  uom?: string;
  stock_uom?: string;
  stock_qty?: number | null;
  production_uom?: string;
  production_qty?: number | null;
  qty?: number | null;
  quantity_fields?: string[];
  quantity_error?: string;
  uom_warning?: string;
  sales_uom_missing?: boolean;
  sales_uom_message?: string;
  note?: string;
  source_rule?: string;
  rate?: number;
  gross_amount?: number;
  net_amount?: number;
  pricing_error?: string;
}

export interface BomPreview extends Json {
  bom_applicable?: boolean;
  reason?: string;
  pending_fields?: string[];
  bom_no?: string;
  bom_template?: string;
  bom_template_code?: string;
  static_bom?: boolean;
  components?: BomPreviewComponent[];
  actual_requirements?: BomActualRequirement[];
  missing_actual_component_keys?: string[];
  actual_complete?: boolean;
}

export interface SalesLine extends Json {
  _key: string;
  _itemName?: string;
  _context?: SalesItemContext;
  _allowedColors?: string[];
  _overrides?: Record<string, FieldOverride>;
  _commercial?: CommercialPreview;
  _bomPreview?: BomPreview;
  _bomComponentNames?: Record<string, string>;
  _bomError?: string;
  _loading?: boolean;
  _error?: string;
  _pricingError?: string;
  item_code?: string;
  color?: string;
  uom?: string;
  qty?: number;
  rate?: number;
  amount?: number;
  discount_percentage?: number;
  discount_amount?: number;
  adjustment_amount?: number;
  net_amount?: number;
  width_m?: number;
  width_pb_ray_m?: number;
  width_pb_nhua_m?: number;
  height_m?: number;
  mesh_height_m?: number;
  set_count?: number;
  leaf_variant?: string;
  ray_type?: string;
  has_butterfly_bracket?: number;
  length_m?: number;
  qty_bar?: number;
  motor_model?: string;
  billable_area_sqm?: number;
  cut_width_m?: number;
  leaf_count?: number;
  single_layer_leaf_count?: number;
  double_layer_leaf_count?: number;
  estimated_weight_kg?: number;
  bom_actual_components?: BomActualComponentRow[];
}

export interface AlumdoorSalesOrderCreateProps {
  name?: string;
  closeRequest?: number;
  onCreated: (name: string) => void;
  onSaved?: (name: string) => void;
  onPreviewCreated: (name: string) => void;
  onCancel: () => void;
}

export const SPEC_FIELD_ORDER = [
  "width_m",
  "height_m",
  "mesh_height_m",
  "leaf_variant",
  "ray_type",
  "has_butterfly_bracket",
  "motor_model",
  "length_m",
  "qty_bar",
] as const;

export type SpecFieldName = typeof SPEC_FIELD_ORDER[number];

export function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

export function normalized(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi");
}

export function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function positiveNumber(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export function money(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
    : "—";
}

export function quantity(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: 6 })
    : "—";
}

export function today(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newLine(index: number): SalesLine {
  return {
    _key: `sales-v2-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    qty: 1,
    set_count: 1,
    bom_actual_components: [],
  };
}

export function hydrateSalesLines(rows: Json[]): SalesLine[] {
  const hydrated = rows.map((row, index) => ({
    ...row,
    _key: text(row.name) || `sales-v2-existing-${index}-${Math.random().toString(36).slice(2, 8)}`,
    _itemName: text(row.item_name) || text(row.item_code),
    _loading: false,
    _error: "",
    _pricingError: "",
    _allowedColors: [],
    _overrides: {},
  } as SalesLine));
  return hydrated.length ? hydrated : [newLine(0)];
}

export function defaultValue(field: DocField): unknown {
  if (field.default == null || field.default === "") return undefined;
  if (field.default === "Today" && field.fieldtype === "Date") return today();
  if (field.default === "Now" && field.fieldtype === "Datetime") {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  return field.default;
}

export function blankFromMeta(meta: DocTypeMeta): Json {
  const values: Json = {};
  for (const field of meta.fields ?? []) {
    const value = defaultValue(field);
    if (value !== undefined) values[field.fieldname] = value;
  }
  return values;
}

export function optionList(meta: DocTypeMeta | null, fieldname: string, fallback: string[]): string[] {
  const values = text(meta?.fields.find((field) => field.fieldname === fieldname)?.options)
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : fallback;
}

export function isAreaDoor(line: SalesLine): boolean {
  return normalized(line._context?.inventory_mode) === normalized("Thành phẩm theo m2");
}

export type SalesWidthInputField = "width_pb_ray_m" | "width_pb_nhua_m";

export function salesWidthInputField(line: SalesLine, customerGroup: string): SalesWidthInputField | undefined {
  const doorType = normalized(line._context?.door_type ?? line.door_type);
  const itemGroup = normalized(line._context?.item_group ?? line.item_group);
  const alwaysUsesPbRay = [
    "cua uc",
    "cua tam lien uc",
    "cua luoi",
    "cua dai loan",
    "cua sieu truong",
  ].includes(doorType)
    || [
      "cua tam lien uc",
      "cua luoi",
      "cua dai loan",
      "cua dai loan inox",
      "cua keo dai loan",
      "cua sieu truong",
    ].includes(itemGroup);
  if (alwaysUsesPbRay) return "width_pb_ray_m";
  if (text(customerGroup) === "Lẻ") return "width_pb_ray_m";
  if (text(customerGroup) === "Đại lý") return "width_pb_nhua_m";
  return undefined;
}

export function isFullSetSalesItem(line: Pick<SalesLine, "item_code">): boolean {
  return text(line.item_code)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[Đđ]/g, "D")
    .toLocaleUpperCase("vi")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .includes("TRONBO");
}

export function primaryQuantityField(line: SalesLine): "set_count" | "qty" {
  if (isAreaDoor(line) || fieldVisible(line, "set_count")) return "set_count";
  return "qty";
}

export function fieldOverride(line: SalesLine, fieldname: string): FieldOverride | undefined {
  return line._overrides?.[fieldname];
}

export function fieldVisible(line: SalesLine, fieldname: string): boolean {
  const override = fieldOverride(line, fieldname);
  if (override?.hidden === true || override?.hidden === 1) return false;
  if (override) return true;
  if (fieldname === "width_m" || fieldname === "height_m" || fieldname === "set_count") {
    if (isAreaDoor(line)) return true;
  }
  return line[fieldname] !== undefined && line[fieldname] !== null && line[fieldname] !== "";
}

export function fieldRequired(line: SalesLine, fieldname: string): boolean {
  const override = fieldOverride(line, fieldname);
  return override?.reqd === true || override?.reqd === 1;
}

export function fieldReadonly(line: SalesLine, fieldname: string): boolean {
  const override = fieldOverride(line, fieldname);
  return override?.read_only === true || override?.read_only === 1;
}

export function isDirectOrdinaryQuantityLine(line: SalesLine): boolean {
  return primaryQuantityField(line) === "set_count"
    && normalized(line._context?.inventory_mode || line.inventory_mode || "Hàng thường") === normalized("Hàng thường")
    && !["width_m", "height_m", "length_m", "qty_bar"].some((fieldname) => fieldRequired(line, fieldname));
}

export function fieldLabel(line: SalesLine, meta: DocTypeMeta | null, fieldname: string, fallback: string): string {
  return text(fieldOverride(line, fieldname)?.label)
    || text(meta?.fields.find((field) => field.fieldname === fieldname)?.label)
    || fallback;
}

export function lineBillableArea(line: SalesLine): number | undefined {
  return numberValue(line.billable_area_sqm)
    ?? (isAreaDoor(line) && ["m2", "m²", "sqm"].includes(normalized(line.uom).replace(/\s+/g, ""))
      ? numberValue(line.qty)
      : undefined);
}

export function linePricedQuantity(line: SalesLine): number | undefined {
  // Hàng thường tính theo SL của ĐVT bán: phản hồi ngay khi gõ, không chờ preview cũ
  // bị thay thế. Cửa theo diện tích vẫn ưu tiên priced_qty đã chuẩn hóa từ server.
  return isAreaDoor(line)
    ? numberValue(line._commercial?.priced_qty) ?? numberValue(line.qty)
    : numberValue(line.qty) ?? numberValue(line._commercial?.priced_qty);
}

export function lineSellingRate(line: SalesLine): number | undefined {
  return numberValue(line._commercial?.selling_rate) ?? numberValue(line.rate);
}

export function lineNetAmount(line: SalesLine): number {
  return numberValue(line._commercial?.net_before_tax)
    ?? numberValue(line.net_amount)
    ?? numberValue(line.amount)
    ?? 0;
}

export function lineDiscountAmount(line: SalesLine): number {
  return numberValue(line._commercial?.discount_amount)
    ?? numberValue(line.discount_amount)
    ?? 0;
}

export function lineAdjustmentAmount(line: SalesLine): number {
  return numberValue(line._commercial?.adjustment_amount)
    ?? numberValue(line.adjustment_amount)
    ?? 0;
}

const PRICING_RULE_LABELS: Record<string, string> = {
  "DAILOAN-UNDER-8M2": "Phụ thu cửa Đài Loan dưới 8 m²",
  "DUC-UNDER-8M2": "Phụ thu cửa Đức dưới 8 m²",
  "DUC-DISCOUNT-15": "Chiết khấu cửa Đức 15%",
  "DUC-GIFT-RAIL-8M2": "Tặng ray cửa Đức từ 8 m²",
  "UC-UNDER-7M2": "Phụ thu cửa Úc dưới 7 m²",
  "CUALUOI-UNDER-8M2": "Phụ thu cửa lưới dưới 8 m²",
  "DUC-WOODGRAIN-SLAT": "Phụ thu lá vân gỗ cửa Đức",
  "DUC-ACCESSORY-UNDER-5M": "Phụ thu phụ kiện cửa Đức dưới 5 triệu",
  "UC-ACCESSORY-UNDER-5M": "Phụ thu phụ kiện cửa Úc dưới 5 triệu",
  "DAILOAN-ACCESSORY-UNDER-3M": "Phụ thu phụ kiện Đài Loan dưới 3 triệu",
  "CUALUOI-UNDER-3M": "Phụ thu cửa lưới dưới 3 triệu",
};

/** Nhãn nghiệp vụ cho Pricing Rule: UI không hiện mã kỹ thuật ALUMDOOR-PR:... */
export function pricingRuleLabel(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const code = raw.replace(/^ALUMDOOR-PR:/i, "");
  const exact = PRICING_RULE_LABELS[code.toUpperCase()];
  if (exact) return exact;
  return code
    .replace(/DAILOAN/gi, "Cửa Đài Loan")
    .replace(/CUALUOI/gi, "Cửa lưới")
    .replace(/DUC/gi, "Cửa Đức")
    .replace(/UC/gi, "Cửa Úc")
    .replace(/UNDER-(\d+)-?M2/gi, "dưới $1 m²")
    .replace(/UNDER-(\d+)-?M/gi, "dưới $1 triệu")
    .replace(/WOODGRAIN/gi, "vân gỗ")
    .replace(/ACCESSORY|PK/gi, "phụ kiện")
    .replace(/SLAT/gi, "lá")
    .replace(/[-_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** % chiết khấu mà policy server thực sự chọn, độc lập với % sale đang override trên dòng. */
export function linePolicyDiscountPercentage(line: SalesLine): number {
  const snapshots = Array.isArray(line._commercial?.pricing_rule_snapshots)
    ? line._commercial!.pricing_rule_snapshots!
    : [];
  const selected = snapshots.find((snapshot) => text(snapshot.effect_type).toUpperCase() === "DISCOUNT_PERCENT");
  return numberValue(selected?.discount_percentage) ?? 0;
}

/** Tên rule chiết khấu để UI giải thích ngắn gọn, không lộ JSON kỹ thuật. */
export function linePolicyDiscountRule(line: SalesLine): string {
  const snapshots = Array.isArray(line._commercial?.pricing_rule_snapshots)
    ? line._commercial!.pricing_rule_snapshots!
    : [];
  return pricingRuleLabel(snapshots.find((snapshot) => text(snapshot.effect_type).toUpperCase() === "DISCOUNT_PERCENT")?.rule_name);
}

/** Sale được nhập override; khác policy thì vẫn preview nhưng phải hiện cảnh báo/cần duyệt. */
export function lineDiscountNeedsApproval(line: SalesLine): boolean {
  if (!text(line.item_code) || !line._commercial) return false;
  const entered = numberValue(line.discount_percentage ?? line._commercial.discount_percentage) ?? 0;
  const allowed = linePolicyDiscountPercentage(line);
  return Math.abs(entered - allowed) > 0.000001;
}

export function lineCommercialNeedsApproval(line: SalesLine): boolean {
  const rateApproval = line.rate_requires_approval === true
    || line.rate_requires_approval === 1
    || text(line.rate_requires_approval) === "1"
    || text(line.rate_requires_approval).toLowerCase() === "true";
  return rateApproval || lineDiscountNeedsApproval(line);
}

export function pricingSnapshots(lines: SalesLine[]): PricingRuleSnapshot[] {
  const unique = new Map<string, PricingRuleSnapshot>();
  for (const line of lines) {
    const snapshots = Array.isArray(line._commercial?.pricing_rule_snapshots)
      ? line._commercial!.pricing_rule_snapshots!
      : [];
    for (const snapshot of snapshots) {
      const name = text(snapshot.rule_name);
      if (!name) continue;
      const key = `${name}:${text(snapshot.effect_type)}:${text(snapshot.basis)}`;
      if (!unique.has(key)) unique.set(key, snapshot);
    }
  }
  return [...unique.values()].sort((left, right) =>
    text(left.rule_name).localeCompare(text(right.rule_name), "vi"));
}

export function newestActivePriceList(rows: Doc[], asOfDate: string, customerGroup = ""): Doc | undefined {
  const active = rows.filter((row) => {
    const disabled = row.disabled === true || row.disabled === 1 || text(row.disabled) === "1" || text(row.disabled).toLowerCase() === "true";
    const effectiveDate = text(row.effective_date);
    if (disabled || (effectiveDate && effectiveDate > asOfDate)) return false;
    return !customerGroup || text(row.customer_group) === customerGroup;
  });
  return active.sort((left, right) =>
    text(right.effective_date).localeCompare(text(left.effective_date))
    || text(right.name).localeCompare(text(left.name), "vi"),
  )[0];
}
