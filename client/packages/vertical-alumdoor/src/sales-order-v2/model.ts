import { formatMoney } from "@metaforge/core";
import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import type { BomActualComponentRow, BomActualRequirement } from "../AlumdoorBomActualEditor.js";

export type Json = Record<string, unknown>;

export interface FieldOverride {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hợp đồng payload làn A — `docs/audits/ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md`
 *
 * Ba luật của hợp đồng, chép lại ở đây vì mọi hàm dưới đây phải tuân:
 *   1. Mọi trường đều OPTIONAL và THÊM MỚI. Không trường cũ nào đổi nghĩa.
 *   2. `null` ≠ vắng mặt ≠ `0`. Vắng mặt = chưa đo được ⇒ ẩn. `null` = CHƯA KHAI trong danh
 *      mục ⇒ hiện chữ "chưa khai" kèm chỉ đường sửa. `0` là số thật.
 *   3. Không được thay `null` bằng `0`/`1`. 33 mã ray/trục đang CỐ Ý trống hệ số quy đổi;
 *      vẽ `null` thành `1` là ghi sai tồn của cả nhóm.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Một chỗ danh mục còn thiếu, kèm địa chỉ sửa. Mã `code` ổn định để làm khoá icon/i18n. */
export interface CatalogGap extends Json {
  code?: string;
  label?: string;
  where?: string;
}

export interface UomLadderEntry extends Json {
  uom?: string;
  roles?: string[];
  /** `null` = CHƯA KHAI. Không bao giờ được coi là 1. */
  conversion_factor?: number | null;
  declared?: boolean;
  factor_source?: string | null;
}

export interface UomMissingFactor extends Json {
  uom?: string;
  roles?: string[];
  reason?: string;
  fix_where?: string;
}

/** Thang ĐVT thật của mã: mua · tồn · bán, cộng cờ cân thực tế (`catch_weight`). */
export interface UomLadder extends Json {
  purchase_uom?: string | null;
  stock_uom?: string;
  sales_uom?: string | null;
  selected_uom?: string;
  catch_weight?: boolean;
  weight_uom?: string | null;
  entries?: UomLadderEntry[];
  missing_factors?: UomMissingFactor[];
}

export interface UomGap extends Json {
  uom?: string;
  kind?: string;
  message?: string;
  fix_where?: string;
  /** `true` = danh mục CỐ Ý để trống, chờ chủ xưởng. Đừng vẽ như lỗi hệ thống. */
  intentional?: boolean;
}

/** Tồn theo ĐVT tồn VÀ theo cân — hai trục song song, không được cộng hay quy đổi lẫn nhau. */
export interface StockSnapshot extends Json {
  warehouse?: string | null;
  stock_uom?: string;
  stock_qty?: number | null;
  selected_uom?: string;
  selected_qty?: number | null;
  selected_qty_blocked_reason?: string | null;
  weight_uom?: string | null;
  weight_qty?: number | null;
  batch_tracked?: boolean;
  batch_count?: number;
  source?: string | null;
  read_error?: string | null;
}

export interface ShortageInfo extends Json {
  requested_qty?: number;
  requested_uom?: string;
  available_qty?: number | null;
  available_uom?: string;
  short_by?: number | null;
  /** `"unknown"` = KHÔNG so được — vẽ màu cảnh báo, tuyệt đối không vẽ màu "đủ". */
  severity?: string;
  message?: string;
}

export interface PriceExplain extends Json {
  price_list?: string;
  item_price?: string;
  /** `base_uom_fallback` = con số trên màn KHÁC con số người khai giá đã gõ. Phải hiện rõ. */
  resolution?: string;
  price_uom?: string;
  line_uom?: string;
  price_rate?: string | number;
  converted_from_uom?: string | null;
  conversion_applied?: number | null;
  rate?: string | number | null;
  base_rate?: string | number;
  selling_rate?: string | number;
  rate_changed_by_rule?: boolean;
  currency?: string;
  area_tier?: string | null;
  /** Diện tích MỘT BỘ dùng để tra bậc — không phải diện tích cả dòng. */
  area_tier_basis_sqm?: number | null;
  area_tier_bounds?: { min_area_sqm?: number | null; max_area_sqm?: number | null } | null;
  price_variant?: string;
  posting_date?: string;
  note?: string;
}

export interface ItemReadiness extends Json {
  ready?: boolean;
  blocking?: CatalogGap[];
  warnings?: CatalogGap[];
}

export interface SpecContext extends Json {
  measurement_profile?: Json | null;
  geometry_profile?: Json | null;
  material_specification?: Json | null;
  door_spec?: Json | null;
  leaf_divisor_m?: number | null;
  leaf_divisor_source?: string | null;
  coverage_gaps?: CatalogGap[];
  read_error?: string | null;
}

export interface ColorScope extends Json {
  item_group?: string;
  requires_color?: boolean;
  allowed_finishes?: Array<{ code?: string; name?: string; requires_color?: boolean }>;
  allowed_colors?: string[];
  colors_by_finish?: Record<string, string[]>;
}

export interface LineCatalogContext extends Json {
  item_group?: string;
  door_type?: string | null;
  inventory_mode?: string;
  measurement_profile?: string | null;
  material_specification?: string | null;
  min_area_sqm?: number | null;
  /** `true` = diện tích tính tiền ĐÃ bị nâng lên mức tối thiểu. `null` = không suy được. */
  min_area_applied?: boolean | null;
}

/**
 * Ngữ cảnh mặt hàng do `alumdoor.sales.item_context` trả về.
 *
 * Interface MỞ có chủ đích: server (Làn A) còn đang nới payload, nên mọi trường ở đây đều
 * optional và mọi nơi đọc phải theo luật "có thì hiện, không có thì ẩn". Không được để một
 * trường vắng mặt biến thành ô rỗng vô nghĩa hay một con số 0 trông như dữ liệu thật.
 */
export interface SalesItemContext extends Json {
  item_code?: string;
  item_group?: string;
  door_type?: string | null;
  inventory_mode?: string;
  measurement_profile?: string | null;
  selected_uom?: string;
  allowed_uoms?: string[];
  uom_options?: Array<{ uom?: string; conversion_factor?: number }>;
  availability_status?: string;
  price_missing?: boolean;
  price_error?: string | null;
  default_color?: string | null;
  /** ĐVT tồn kho của mặt hàng. Khác ĐVT bán thì dòng phải đọc được cả hai con số. */
  stock_uom?: string;
  /** `null` là CÓ Ý: cửa bán m² tồn Bộ có hệ số theo từng kích thước dòng, không phải hằng số. */
  conversion_factor?: number | null;
  managed_stock?: boolean;
  warehouse?: string | null;
  available_qty?: number | null;
  available_stock_qty?: number | null;
  stock_read_error?: string | null;
  /** Diện tích tối thiểu tính tiền cho MỘT bộ. Bộ nhỏ hơn vẫn thu tiền bằng mức này. */
  min_area_sqm?: number;
  /** Barem mua kg/m². Thiếu thì Worker cố ý từ chối dự toán mua, không lấy số gần đúng. */
  purchase_kg_per_m2?: number | null;
  leaf_divisor_m?: number | null;
  rate?: number | null;
  currency?: string;
  item_price?: string | null;
  /* Hợp đồng làn A 2026-08-21 — tất cả optional, vắng mặt thì UI ẩn hẳn phần liên quan. */
  uom_ladder?: UomLadder;
  uom_gap?: UomGap | null;
  stock_snapshot?: StockSnapshot;
  shortage?: ShortageInfo;
  spec_context?: SpecContext | null;
  color_scope?: ColorScope | null;
  color_scope_error?: string | null;
  price_explain?: PriceExplain;
  readiness?: ItemReadiness;
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

export interface AppliedAdjustment extends Json {
  rule_name?: string;
  basis?: string;
  basis_qty?: string | number;
  rate_minor?: number;
  amount_minor?: number;
  taxable?: boolean;
}

export interface CommercialPreview extends Json {
  item_price?: string;
  /** Giá tra thẳng từ bảng giá, TRƯỚC khi Pricing Rule đè giá cố định. */
  base_rate?: string | number;
  price_variant?: string;
  selling_rate?: string | number;
  priced_qty?: string | number;
  gross_amount?: string | number;
  discount_percentage?: string | number;
  discount_amount?: string | number;
  discount_basis_item_price?: string;
  discount_basis_rate?: string | number;
  adjustment_amount?: string | number;
  net_before_tax?: string | number;
  pricing_as_of?: string;
  pricing_rule_snapshots?: PricingRuleSnapshot[];
  applied_adjustments?: AppliedAdjustment[];
  benefit_items?: BenefitItem[];
  /* Hợp đồng làn A 2026-08-21 §B — optional; vắng mặt KHÔNG làm hỏng phần tiền cũ. */
  price_explain?: PriceExplain;
  /** `{ tên luật: tên phạm vi }` — chỉ chứa luật đã áp mà có khai `pricing_scope`. */
  pricing_scope_by_rule?: Record<string, string>;
  catalog_context?: LineCatalogContext;
  catalog_warnings?: CatalogGap[];
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
  /*
   * Dưới đây là ảnh chụp do SERVER chiếu xuống dòng qua `alumdoor.ui.preview_child_row`
   * (`setIfField` chỉ ghi khi `Sales Order Item` thật sự có field đó). Client CHỈ ĐỌC:
   * không cái nào được tính lại ở đây, và vắng mặt nghĩa là "chưa có", không phải bằng 0.
   */
  stock_uom?: string;
  conversion_factor?: number;
  stock_qty?: number;
  available_qty?: number;
  available_stock_qty?: number;
  available_stock_uom?: string;
  availability_status?: string;
  delivered_qty?: number;
  min_area_sqm?: number;
  purchase_kg_per_m2?: number;
  /** "Rộng PB ray" hay "Rộng PB nhựa" — hai cơ sở lệch nhau ~1,5% tiền trên cùng bộ cửa. */
  width_basis?: string;
  formula_policy?: string;
  formula_version?: string;
  /** Câu giải thích bằng lời do server dựng sẵn cho người bán đọc tại chỗ. */
  formula_explanation?: string;
  leaf_rounding?: string;
  leaf_height_deduction_m?: number;
  leaf_divisor_m?: number;
  estimated_minutes?: number;
  standard_rate?: number;
  rate_requires_approval?: boolean | number | string;
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
  return formatMoney(value, { style: "plain" });
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

/* ────────────────────────────────────────────────────────────────────────────
 * Đọc lại những gì danh mục ĐÃ biết
 *
 * Mọi hàm dưới đây CHỈ ĐỌC ảnh chụp server đã chiếu xuống dòng. Không hàm nào nhân, chia hay
 * suy ra một con số tiền/kho mới — trừ đúng một phép so sánh diện tích hình học với diện tích
 * tối thiểu, và phép đó chỉ dùng để GIẢI THÍCH, không bao giờ thay số của server.
 *
 * Luật chung: thiếu dữ liệu thì nói là thiếu và chỉ chỗ khai. Không fallback thầm.
 * ──────────────────────────────────────────────────────────────────────────── */

/** ĐVT tồn kho của dòng. Server chiếu xuống; client không suy từ tên mặt hàng. */
export function lineStockUom(line: SalesLine): string {
  return text(line.available_stock_uom) || text(line.stock_uom) || text(line._context?.stock_uom);
}

export function lineSalesUom(line: SalesLine): string {
  return text(line.uom) || text(line._context?.selected_uom);
}

/** Hệ số 1 ĐVT bán = ? ĐVT tồn. Không có thì trả `undefined`, KHÔNG mặc định 1. */
export function lineConversionFactor(line: SalesLine): number | undefined {
  return positiveNumber(line.conversion_factor) ?? positiveNumber(line._context?.conversion_factor);
}

/** Số sẽ vào thẻ kho, do server tính (`qty × conversion_factor`). Client chỉ hiển thị. */
export function lineStockQty(line: SalesLine): number | undefined {
  return positiveNumber(line.stock_qty);
}

/** Dòng có phải nói chuyện quy đổi không: ĐVT bán khác ĐVT tồn. */
export function lineNeedsUomConversion(line: SalesLine): boolean {
  const sales = normalized(lineSalesUom(line));
  const stock = normalized(lineStockUom(line));
  return Boolean(sales && stock && sales !== stock);
}

/**
 * Hàng CÂN THỰC TẾ: vắng hệ số là ĐÚNG LUẬT, không phải thiếu sót.
 *
 * `factor_source: "catch_weight"` nghĩa là cân từng chuyến mới ra số — tiền đi theo Kg, tồn đi
 * theo cây, và không tồn tại một hệ số cố định nào để khai. Vẽ nó thành "chưa khai hệ số" là
 * đẩy chủ xưởng đi điền một ô đáng lẽ phải trống mãi mãi.
 */
export function lineIsCatchWeight(line: SalesLine): boolean {
  const ladder = lineUomLadder(line);
  if (!ladder) return false;
  if (ladder.catch_weight === true) return true;
  const selected = normalized(lineSalesUom(line));
  return (ladder.entries ?? []).some((entry) =>
    normalized(entry.uom) === selected && text(entry.factor_source) === "catch_weight");
}

/**
 * Thiếu hệ số quy đổi — cảnh báo CHỈ khi đúng là thiếu khai báo.
 *
 * Hai trường hợp bị loại trừ có chủ đích, vì ở đó "chưa có hệ số" KHÔNG phải lỗi danh mục:
 *  · cửa bán m² tồn Bộ — hệ số đến từ kích thước từng dòng, server chụp `set_count / qty` sau
 *    khi đã có rộng · cao · số bộ;
 *  · hàng cân thực tế — xem `lineIsCatchWeight`.
 *
 * Server nói trước: có `uom_gap` thì đó mới là câu trả lời. Suy đoán dưới đây chỉ đỡ cho payload
 * chưa mang trường mới.
 */
export function lineMissingUomConversion(line: SalesLine): boolean {
  if (isAreaDoor(line) || lineIsCatchWeight(line)) return false;
  if (lineUomGap(line)) return true;
  return lineNeedsUomConversion(line) && lineConversionFactor(line) === undefined;
}

export function lineAvailableStockQty(line: SalesLine): number | undefined {
  return numberValue(line.available_stock_qty) ?? numberValue(line._context?.available_stock_qty);
}

export function lineAvailableQty(line: SalesLine): number | undefined {
  return numberValue(line.available_qty) ?? numberValue(line._context?.available_qty);
}

export function lineAvailabilityStatus(line: SalesLine): string {
  return text(line.availability_status) || text(line._context?.availability_status);
}

export function lineDeliveredQty(line: SalesLine): number | undefined {
  return numberValue(line.delivered_qty);
}

export function lineStockSnapshot(line: SalesLine): StockSnapshot | undefined {
  const snapshot = line._context?.stock_snapshot;
  return snapshot && typeof snapshot === "object" ? snapshot : undefined;
}

export function lineShortage(line: SalesLine): ShortageInfo | undefined {
  const shortage = line._context?.shortage;
  return shortage && typeof shortage === "object" ? shortage : undefined;
}

export function lineUomGap(line: SalesLine): UomGap | undefined {
  const gap = line._context?.uom_gap;
  return gap && typeof gap === "object" ? gap : undefined;
}

export function lineUomLadder(line: SalesLine): UomLadder | undefined {
  const ladder = line._context?.uom_ladder;
  return ladder && typeof ladder === "object" ? ladder : undefined;
}

export function linePriceExplain(line: SalesLine): PriceExplain | undefined {
  const fromCommercial = line._commercial?.price_explain;
  if (fromCommercial && typeof fromCommercial === "object") return fromCommercial;
  const fromContext = line._context?.price_explain;
  return fromContext && typeof fromContext === "object" ? fromContext : undefined;
}

/**
 * Diện tích tối thiểu có đang NÂNG tiền của dòng này không.
 *
 * `Item.min_area_sqm` là một trong ít chỗ danh mục lặng lẽ đổi số tiền: khai 4 m² thì bộ
 * 3,2 m² vẫn thu tiền 4 m².
 *
 * Server là trọng tài: `catalog_context.min_area_applied` do engine giá chốt. Chỉ khi server
 * CHƯA nói (payload cũ, hoặc chưa suy được diện tích một bộ) thì mới so hình học với ngưỡng ở
 * đây — và phép so đó chỉ để GIẢI THÍCH, không bao giờ thay số của server.
 */
export function lineMinAreaNotice(line: SalesLine): { minimum: number; geometric?: number } | undefined {
  if (!isAreaDoor(line)) return undefined;
  const catalog = line._commercial?.catalog_context;
  const minimum = positiveNumber(catalog?.min_area_sqm)
    ?? positiveNumber(line.min_area_sqm)
    ?? positiveNumber(line._context?.min_area_sqm);
  if (minimum === undefined) return undefined;
  const width = positiveNumber(line.width_m);
  const height = positiveNumber(line.height_m);
  const geometric = width !== undefined && height !== undefined ? width * height : undefined;
  if (catalog?.min_area_applied === true) return geometric === undefined ? { minimum } : { minimum, geometric };
  if (catalog?.min_area_applied === false) return undefined;
  if (geometric === undefined) return undefined;
  return geometric < minimum - 1e-9 ? { minimum, geometric } : undefined;
}

const ADJUSTMENT_BASIS_LABELS: Record<string, string> = {
  FIXED: "cố định",
  AREA_SQM: "trên m²",
  LENGTH_M: "trên mét",
  SET_COUNT: "trên bộ",
  PRICED_QTY: "trên SL tính tiền",
};

export function adjustmentBasisLabel(value: unknown): string {
  const key = text(value).toUpperCase();
  return ADJUSTMENT_BASIS_LABELS[key] ?? (key ? key.toLocaleLowerCase("vi").replace(/_/g, " ") : "");
}

export function lineAppliedAdjustments(line: SalesLine): AppliedAdjustment[] {
  return Array.isArray(line._commercial?.applied_adjustments) ? line._commercial!.applied_adjustments! : [];
}

export interface PriceExplanationRow {
  key: string;
  label: string;
  value: string;
  /** `warn` = con số đang bị một luật kéo đi khỏi giá niêm yết; người bán phải thấy trước khách. */
  tone?: "warn";
}

/**
 * "Vì sao ra con số này" — dựng từ đúng những gì server đã trả, không thêm phép tính nào.
 *
 * Người bán phải trả lời được khách ngay tại màn hình: giá lấy ở dòng giá nào, chính sách nào
 * đè lên, phụ thu tính trên cơ sở gì, và công thức cửa diễn giải ra sao.
 */
export function linePriceExplanation(line: SalesLine): PriceExplanationRow[] {
  const rows: PriceExplanationRow[] = [];
  const push = (key: string, label: string, value: string, tone?: PriceExplanationRow["tone"]) => {
    if (text(value)) rows.push({ key, label, value, ...(tone ? { tone } : {}) });
  };
  const explain = linePriceExplain(line);

  push("item_price", "Dòng giá",
    text(explain?.item_price) || text(line._commercial?.item_price) || text(line._context?.item_price));

  /**
   * `base_uom_fallback` = KHÔNG có giá cho ĐVT của dòng; engine lấy giá ĐVT gốc rồi nhân chéo.
   * Đây đúng lúc con số trên màn khác con số người khai giá đã gõ, nên nó phải kêu lên.
   */
  const convertedFrom = text(explain?.converted_from_uom);
  if (convertedFrom || text(explain?.resolution) === "base_uom_fallback") {
    push("price_converted", "Giá quy đổi",
      `Chưa khai giá cho ${text(explain?.line_uom) || lineSalesUom(line)}; quy từ giá ${convertedFrom || "ĐVT gốc"}`
        + (numberValue(explain?.price_rate) === undefined ? "" : ` (${money(explain?.price_rate)} ₫/${text(explain?.price_uom) || convertedFrom})`),
      "warn");
  }

  const tier = text(explain?.area_tier);
  if (tier) {
    const basis = numberValue(explain?.area_tier_basis_sqm);
    const bounds = explain?.area_tier_bounds;
    const range = bounds
      ? [numberValue(bounds.min_area_sqm), numberValue(bounds.max_area_sqm)]
        .map((value) => value === undefined ? "" : quantity(value)).filter(Boolean).join("–")
      : "";
    push("area_tier", "Bậc diện tích",
      `${tier}${range ? ` (${range} m²)` : ""}${basis === undefined ? "" : ` · tra theo ${quantity(basis)} m²/bộ`}`);
  }

  const baseRate = numberValue(explain?.base_rate) ?? numberValue(line._commercial?.base_rate);
  const sellingRate = lineSellingRate(line);
  if (baseRate !== undefined && sellingRate !== undefined && Math.abs(baseRate - sellingRate) > 0.000001) {
    push("rate_override", "Giá bảng giá → giá áp", `${money(baseRate)} → ${money(sellingRate)} ₫`);
  }

  const pricedQty = linePricedQuantity(line);
  if (pricedQty !== undefined && sellingRate !== undefined) {
    push("basis", "Cách nhân", `${quantity(pricedQty)} ${lineSalesUom(line)} × ${money(sellingRate)} ₫`.replace(/\s+/g, " ").trim());
  }

  const minArea = lineMinAreaNotice(line);
  if (minArea) {
    push("min_area", "Diện tích tối thiểu",
      minArea.geometric === undefined
        ? `Tiền tính theo mức tối thiểu ${quantity(minArea.minimum)} m²/bộ`
        : `Áp ${quantity(minArea.minimum)} m²/bộ thay cho hình học ${quantity(minArea.geometric)} m²`,
      "warn");
  }

  push("width_basis", "Cơ sở rộng", text(line.width_basis));
  const cutWidth = positiveNumber(line.cut_width_m);
  if (cutWidth !== undefined) push("cut_width", "Rộng cắt lá", `${quantity(cutWidth)} m`);

  /**
   * Bản lá quyết định SỐ LÁ, số lá quyết định chiều cao tính tiền. Nói cả nguồn của nó vì cùng
   * một mã có thể lấy ước số từ `Item.leaf_divisor_m` hoặc từ danh mục `Quy cách cửa`, và hai
   * nơi đó có thể lệch nhau.
   */
  const spec = line._context?.spec_context;
  const divisor = positiveNumber(spec?.leaf_divisor_m) ?? positiveNumber(line.leaf_divisor_m);
  if (divisor !== undefined) {
    const source = text(spec?.leaf_divisor_source);
    push("leaf_divisor", "Bản lá / ước số chia", `${quantity(divisor)} m${source ? ` · nguồn ${source}` : ""}`);
  }

  const shortage = lineShortage(line);
  const severity = text(shortage?.severity);
  if (severity === "over" || severity === "unknown") {
    push("shortage", severity === "over" ? "Thiếu hàng" : "Chưa so được tồn",
      text(shortage?.message) || (severity === "over" ? "Số bán vượt tồn khả dụng" : "Không so được tồn với số bán"),
      "warn");
  }

  const scopeByRule = line._commercial?.pricing_scope_by_rule;
  lineAppliedAdjustments(line).forEach((adjustment, index) => {
    const ruleName = text(adjustment.rule_name);
    const basis = adjustmentBasisLabel(adjustment.basis);
    const basisQty = numberValue(adjustment.basis_qty);
    const scope = scopeByRule ? text(scopeByRule[ruleName]) : "";
    const detail = [basis, basisQty === undefined ? "" : quantity(basisQty), scope ? `phạm vi ${scope}` : ""]
      .filter(Boolean).join(" · ");
    push(`adjustment-${index}`, `Phụ thu · ${pricingRuleLabel(ruleName) || "không tên"}`, detail);
  });

  const policy = text(line.formula_policy);
  const version = text(line.formula_version);
  push("formula_policy", "Công thức cửa", policy ? `${policy}${version ? ` · ${version}` : ""}` : "");
  push("formula_explanation", "Diễn giải", text(line.formula_explanation));
  push("price_note", "Ghi chú giá", text(explain?.note));
  push("pricing_as_of", "Giá tính theo ngày",
    text(explain?.posting_date) || text(line._commercial?.pricing_as_of));
  return rows;
}

export interface LineGap {
  key: string;
  what: string;
  where: string;
  /** `true` = danh mục CỐ Ý để trống, chờ chủ xưởng chốt. Không phải sự cố hệ thống. */
  intentional?: boolean;
}

const DOOR_TYPES_NEEDING_BAREM = ["cua uc", "cua tam lien uc", "cua luoi", "cua dai loan", "cua sieu truong"];

function catalogGapsToLineGaps(gaps: CatalogGap[] | undefined, prefix: string, intentionalCodes?: Set<string>): LineGap[] {
  if (!Array.isArray(gaps)) return [];
  const mapped: LineGap[] = [];
  gaps.forEach((gap, index) => {
    const label = text(gap.label);
    if (!label) return;
    const code = text(gap.code);
    mapped.push({
      key: `${prefix}-${code || index}`,
      what: label,
      where: text(gap.where) || "Danh mục",
      ...(intentionalCodes?.has(code) ? { intentional: true } : {}),
    });
  });
  return mapped;
}

/**
 * Ba chỗ danh mục CỐ Ý để trống theo quyết định 19/08, chờ chủ xưởng chốt.
 *
 * Chúng vẫn phải chặn — nhưng phải được vẽ như "ô chờ điền", không như lỗi phần mềm. Nhầm hai
 * thứ này là người bán đi báo lỗi kỹ thuật, còn ô thì mãi không ai điền.
 */
const INTENTIONALLY_BLANK_CODES = new Set([
  "UOM_FACTOR_MISSING",
  "SPEC_MISSING_STANDARD_LENGTH",
  "SPEC_MISSING_KG_PER_M",
]);

/**
 * Cổng chặn do SERVER tuyên bố — `readiness.ready === false`.
 *
 * Hợp đồng làn A ghi thẳng: đây là cổng chặn thật, không phải trang trí. Chỉ trả về khi server
 * đã nói; payload chưa có `readiness` thì hàm im lặng và mọi thứ chạy như cũ.
 */
export function lineReadinessBlock(line: SalesLine): LineGap | undefined {
  const readiness = line._context?.readiness;
  if (!readiness || readiness.ready !== false) return undefined;
  const gaps = catalogGapsToLineGaps(readiness.blocking, "readiness", INTENTIONALLY_BLANK_CODES);
  return gaps[0] ?? { key: "readiness", what: "Danh mục chưa đủ dữ liệu để bán mã này", where: "Danh mục" };
}

/** Cảnh báo danh mục — không chặn nhưng phải hiện. Gộp từ cả hai đầu payload, khử trùng. */
export function lineCatalogWarnings(line: SalesLine): LineGap[] {
  const context = line._context;
  const readinessWarnings = catalogGapsToLineGaps(context?.readiness?.warnings, "readiness-warn", INTENTIONALLY_BLANK_CODES);
  const merged = [
    ...readinessWarnings,
    ...catalogGapsToLineGaps(line._commercial?.catalog_warnings, "commercial-warn", INTENTIONALLY_BLANK_CODES),
    // Payload chưa mang `readiness` thì vẫn còn `spec_context.coverage_gaps` để nói ra chỗ thiếu.
    ...(readinessWarnings.length ? [] : catalogGapsToLineGaps(context?.spec_context?.coverage_gaps, "spec-gap", INTENTIONALLY_BLANK_CODES)),
  ];
  const scopeError = text(context?.color_scope_error);
  if (scopeError && !merged.some((gap) => gap.what === scopeError)) {
    merged.push({ key: "color_scope_error", what: scopeError, where: "Danh mục → Bề mặt / Màu vật tư" });
  }
  const unique = new Map<string, LineGap>();
  for (const gap of merged) if (!unique.has(gap.what)) unique.set(gap.what, gap);
  return [...unique.values()];
}

/**
 * Còn thiếu gì thì chưa chốt được dòng này — kèm SỬA Ở ĐÂU.
 *
 * Thà từ chối và chỉ đúng chỗ khai còn hơn để người bán bấm Lưu rồi mới biết. Mỗi mục chỉ xuất
 * hiện khi đọc được bằng chứng thật từ server; không suy diễn từ việc một trường vắng mặt.
 */
export function lineBlockingGaps(line: SalesLine): LineGap[] {
  const gaps: LineGap[] = [];
  if (!text(line.item_code) || line._loading) return gaps;

  const context = line._context;
  const salesUom = lineSalesUom(line);
  /**
   * Server là trọng tài khi nó đã nói.
   *
   * `readiness.blocking` do worker chốt sau khi đọc thẳng danh mục; suy đoán ở client chỉ là
   * đường dự phòng cho payload chưa có trường này. Chạy cả hai là đếm hai lần cùng một thiếu sót.
   */
  const serverBlocking = Array.isArray(context?.readiness?.blocking) ? context!.readiness!.blocking! : undefined;
  if (serverBlocking) {
    gaps.push(...catalogGapsToLineGaps(serverBlocking, "readiness", INTENTIONALLY_BLANK_CODES));
  } else {
    const priceError = text(context?.price_error) || text(line._pricingError);
    if (priceError) {
      gaps.push({ key: "price_error", what: priceError, where: "Danh mục → Đơn giá (Item Price)" });
    } else if (context?.price_missing === true || (context !== undefined && numberValue(line.rate) === undefined)) {
      gaps.push({
        key: "price_missing",
        what: `Chưa có đơn giá cho ĐVT ${salesUom || "(chưa chọn)"}`,
        where: "Danh mục → Đơn giá (Item Price)",
      });
    }

    const uomGap = lineUomGap(line);
    if (uomGap) {
      gaps.push({
        key: "uom_gap",
        what: text(uomGap.message) || `Chưa dùng được ĐVT ${text(uomGap.uom) || salesUom}`,
        where: text(uomGap.fix_where) || "Danh mục → Hàng hoá/Vật tư → Quy đổi đơn vị",
        ...(uomGap.intentional === true ? { intentional: true } : {}),
      });
    } else if (lineMissingUomConversion(line)) {
      gaps.push({
        key: "conversion",
        what: `Chưa khai hệ số quy đổi ${salesUom} → ${lineStockUom(line)}`,
        where: "Danh mục → Hàng hoá/Vật tư → Quy đổi đơn vị",
        intentional: true,
      });
    }

    const doorType = normalized(context?.door_type ?? line.door_type);
    const barem = positiveNumber(line.purchase_kg_per_m2) ?? positiveNumber(context?.purchase_kg_per_m2);
    if (isAreaDoor(line) && DOOR_TYPES_NEEDING_BAREM.includes(doorType) && barem === undefined) {
      gaps.push({
        key: "barem",
        what: "Chưa khai barem mua (kg/m²) — dự toán mua chưa tính được",
        where: "Danh mục → Hàng hoá/Vật tư → Barem mua (kg/m2)",
      });
    }

    const stockError = text(context?.stock_read_error) || text(lineStockSnapshot(line)?.read_error);
    if (stockError) gaps.push({ key: "stock_read", what: stockError, where: "Kho / báo cáo tồn" });
  }

  /**
   * Màu bắt buộc là luật của BỘ THEO DÕI, không phải của form.
   *
   * `Measurement Profile.require_color` chảy xuống `color_scope.requires_color`. Không nơi nào
   * trong `field_overrides` đặt `reqd` cho ô màu, nên nếu không đọc cờ này thì một dòng thiếu
   * màu vẫn lưu trót lọt rồi vỡ ở khâu xuất kho — lúc đó hàng đã hứa với khách.
   */
  if (context?.color_scope?.requires_color === true && !text(line.color)) {
    gaps.push({ key: "color_required", what: "Chưa chọn màu — bộ theo dõi của mã này bắt buộc có màu", where: "Chọn ngay trên dòng này" });
  }

  for (const [fieldname, rule] of Object.entries(line._overrides ?? {}) as Array<[string, FieldOverride]>) {
    if (!(rule.reqd === true || rule.reqd === 1) || rule.hidden === true || rule.hidden === 1) continue;
    const value = line[fieldname];
    if (value !== null && value !== undefined && value !== "") continue;
    gaps.push({
      key: `reqd-${fieldname}`,
      what: `Thiếu ${text(rule.label).replace(/\s+/g, " ") || fieldname}`,
      where: "Nhập ngay trên dòng này",
    });
  }

  for (const pending of Array.isArray(line._bomPreview?.pending_fields) ? line._bomPreview!.pending_fields! : []) {
    const label = text(pending);
    if (label) gaps.push({ key: `bom-${label}`, what: `BOM còn thiếu ${label}`, where: "Danh mục → Quy tắc BOM" });
  }

  return gaps;
}
