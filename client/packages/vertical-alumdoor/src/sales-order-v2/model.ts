import { formatMoney } from "@metaforge/core";
import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import type { BomActualComponentRow, BomActualRequirement } from "../AlumdoorBomActualEditor.js";

export type Json = Record<string, unknown>;

export interface FieldOverride {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
  /** Server-owned presentation order; geometry profiles populate this from `sequence`. */
  sequence?: number;
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
  /* Cách bán · hợp đồng làn A 2026-08-21 — optional, vắng mặt thì UI ẩn hẳn ô chọn. */
  price_variant_source?: "requested" | "only_option" | "standard_default" | null;
  /** `true` = có nhiều cách bán mà dòng chưa chọn ⇒ CHƯA ra tiền, và đó không phải lỗi danh mục. */
  price_variant_required?: boolean;
  /** `true` = cách bán này khai giá theo bậc diện tích; con số cuối theo kích thước dòng. */
  price_tiered_by_area?: boolean;
  /**
   * VẮNG MẶT = server không liệt kê được (trúng bằng tên, hoặc không có quyền/endpoint tra
   * theo trường). Mảng RỖNG = quét được mà mã này chưa khai đơn giá nào. Hai nghĩa khác nhau:
   * cái đầu phải giữ nguyên ô đang có, cái sau mới được nói "chưa khai giá".
   */
  price_variant_options?: PriceVariantOption[];
  posting_date?: string;
  note?: string;
}

/**
 * Một CÁCH BÁN mà mã hàng này thật sự có đơn giá.
 *
 * Đơn giá đi kèm là phần quan trọng nhất: nó là thứ giúp người bán chọn đúng mà không cần ai
 * dịch `TANG_RAY` sang tiếng Việt. `rate` là `null` khi cách bán đó khai theo bậc diện tích —
 * lúc chọn chưa có kích thước nên chưa có một con số duy nhất, chỉ có khoảng `rate_min`–`rate_max`.
 */
export interface PriceVariantOption extends Json {
  price_variant?: string;
  item_price?: string;
  uom?: string;
  rate?: number | null;
  rate_min?: number | null;
  rate_max?: number | null;
  currency?: string | null;
  area_tier?: string | null;
  tier_count?: number;
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
  /** Mã màu → tên đọc được. Giá trị lưu vẫn là mã. */
  color_labels?: Record<string, string>;
  colors_by_finish?: Record<string, string[]>;
}

export interface LineCatalogContext extends Json {
  item_group?: string;
  door_type?: string | null;
  inventory_mode?: string;
  measurement_profile?: string | null;
  material_specification?: string | null;
  min_area_sqm?: number | null;
  gift_rail_min_area_sqm?: number | null;
  gift_rail_area_operator?: "GT" | "GTE";
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
  /**
   * Phần trăm chiết khấu theo CHÍNH SÁCH (ví dụ cửa Đức 15%) — chỉ để hiển thị.
   *
   * KHÔNG được đổ vào ô `discount_percentage` của dòng: khoản đó đã được luật giá trừ rồi,
   * điền thêm là trừ hai lần và kernel chặn không cho ghi sổ.
   */
  policy_discount_percentage?: number;
  discount_amount?: string | number;
  discount_basis_item_price?: string;
  discount_basis_rate?: string | number;
  adjustment_amount?: string | number;
  net_before_tax?: string | number;
  pricing_as_of?: string;
  pricing_rule_snapshots?: PricingRuleSnapshot[];
  applied_adjustments?: AppliedAdjustment[];
  benefit_items?: BenefitItem[];
  gift_rail_threshold_sqm?: number;
  gift_rail_area_operator?: "GT" | "GTE";
  gift_rail_area_sqm?: number;
  gift_rail_eligible?: boolean;
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
  /**
   * LỚP CẤU KIỆN VẬT LÝ — "mấy cây, mấy lá, mỗi cái cắt bao nhiêu".
   *
   * Đây là authority của cột SL/ĐVT trên bảng BOM. `set_count`/`qty`/`uom` bên dưới là
   * projection tương thích ngược mang nghĩa TIÊU HAO KHO; đọc chúng vào cột SL chính là
   * chỗ hỏng cũ khiến cây ray hiện "2 / Mét / 5,8" và tấm tôn hiện "1 / m2 / 8,91".
   */
  component_count?: number | null;
  component_count_uom?: string;
  /*
   * ĐVT ĐẾM giữ nguyên từ dòng định mức (Cây · Lá · Cái), server gửi từ
   * `sales-production-core.ts:1356` và `:374`. Client chưa đọc nó bao giờ, nên khi Quy tắc BOM
   * không khớp thì `component_count_uom` trống và cột ĐVT rơi thẳng xuống `uom` — vốn đã bị ĐVT BÁN
   * của Item ghi đè thành "Mét"/"m2". Đó là chỗ hai cây ray hiện thành "2 Mét".
   */
  bom_count_uom?: string;
  cut_length_each_m?: number;
  /** Tên cột số đo đang giữ kích thước cắt (`height_m`, `width_pb_ray_m`…). Server quyết định. */
  cut_axis?: string;
  leaf_count?: number;
  component_count_error?: string;
  /** LỚP TIÊU HAO KHO — mét/m²/kg cho xuất kho, dự trù và giá thành. */
  stock_consumption_qty?: number;
  stock_consumption_uom?: string;
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
  /** Dòng chưa map được Quy tắc BOM (`bom-rule-sales-preview.ts:458`) — số dưới là snapshot BOM cũ. */
  bom_rule_missing?: boolean;
  /**
   * Cảnh báo THIẾU CẤU HÌNH quy tắc ("Chưa map Quy tắc BOM cho X" —
   * `bom-rule-sales-preview.ts:459`). Khác hẳn `note`: `note` là ghi chú kỹ thuật nội bộ (công thức,
   * mã quy tắc) cố ý không hiện, còn cái này là việc người bán phải biết để báo lại.
   */
  bom_rule_warning?: string;
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
  /** Định mức khai chính mặt hàng cha làm cấu phần — server đã loại, đây là lời giải thích. */
  bom_self_reference_warning?: string;
}

export interface RayPaintSurchargeResult extends Json {
  applicable?: boolean;
  total_length_m?: number;
  rate_per_meter?: number;
  surcharge_minor?: number;
  matched_rule?: string | null;
  ray_components?: Array<{ item_code: string; length_m: number }>;
  reason?: string;
}

export interface SalesLine extends Json {
  _key: string;
  /** Kết quả gần nhất của `alumdoor.sales.ray_paint_surcharge` — ước tính hiển thị. */
  _raySurcharge?: RayPaintSurchargeResult;
  /**
   * CÁCH BÁN của dòng — chọn dòng giá nào, không phải giảm bao nhiêu.
   *
   * Đây là Ý ĐỊNH của người bán, nên nó phải nằm trên dòng và phải đi cùng cả lượt xem trước
   * lẫn lượt lưu. Trước 21/08/2026 dòng bán không có ô này: đường lưu mặc định `STANDARD`, nên
   * 22 cặp (mã + ĐVT) chỉ khai biến thể khác STANDARD đều bị từ chối lúc lưu.
   */
  price_variant?: string;
  /**
   * "Người bán ĐÃ TỰ TAY chạm vào ô tick Tặng ray của dòng này chưa?"
   *
   * Theo quyết định trực tiếp của chủ xưởng 22/08/2026: trên 8 m² thì ô tick TỰ ĐỘNG được
   * tick, nhưng người bán vẫn bỏ tick được. Nếu không nhớ "đã chạm", mỗi lần sửa kích thước
   * là một lần máy tick lại — lựa
   * chọn thủ công của người bán bị nuốt mất mà không ai thấy. Cờ này CHỈ sống trên client
   * (tiền tố `_`, không đi xuống server) và chỉ được bật ở đúng một chỗ: handler của ô tick.
   */
  _giftRailTouched?: boolean;
  _itemName?: string;
  _context?: SalesItemContext;
  _allowedColors?: string[];
  /** Mã màu → tên đọc được (`VAN_GO` → `VÂN GỖ`). Giá trị lưu vẫn là mã. */
  _colorLabels?: Record<string, string>;
  _overrides?: Record<string, FieldOverride>;
  _commercial?: CommercialPreview;
  /**
   * Loại cửa này có xổ định mức trên màn bán không — cờ `show_bom_on_sales` của Bộ quy cách hình
   * học, server trả kèm trong `geometry_runtime` của lượt xem trước dòng.
   *
   * Giữ Ở DÒNG để `mayHaveBom` biết TRƯỚC khi gọi. Không có nó thì client vẫn gọi định mức rồi
   * mới nhận `bom_applicable: false` — đủ lâu để dòng "Đang tính và xổ vật tư BOM…" kịp hiện ra
   * cho một loại cửa vốn không xổ định mức.
   */
  _showBomOnSales?: boolean;
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

const CHU_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/** Chữ của một chữ số. Bọc lại vì `noUncheckedIndexedAccess` coi mọi phép index là có thể rỗng. */
function chuSo(n: number): string {
  return CHU_SO[n] ?? "";
}

/** Đọc một nhóm ba chữ số. `dayDu` = false cho nhóm đầu tiên (không đọc "không trăm"). */
function docNhomBa(nhom: number, dayDu: boolean): string {
  const tram = Math.floor(nhom / 100);
  const chuc = Math.floor((nhom % 100) / 10);
  const donVi = nhom % 10;
  const phan: string[] = [];
  if (tram > 0 || dayDu) phan.push(`${chuSo(tram)} trăm`);
  if (chuc === 0) {
    if (donVi > 0 && (tram > 0 || dayDu)) phan.push("lẻ", chuSo(donVi));
    else if (donVi > 0) phan.push(chuSo(donVi));
  } else if (chuc === 1) {
    phan.push("mười");
    // 11 → "mười một"; 15 → "mười lăm" (không phải "mười năm").
    if (donVi === 5) phan.push("lăm");
    else if (donVi > 0) phan.push(chuSo(donVi));
  } else {
    phan.push(`${chuSo(chuc)} mươi`);
    // 21 → "hai mươi mốt"; 25 → "hai mươi lăm".
    if (donVi === 1) phan.push("mốt");
    else if (donVi === 4) phan.push("tư");
    else if (donVi === 5) phan.push("lăm");
    else if (donVi > 0) phan.push(chuSo(donVi));
  }
  return phan.join(" ");
}

const HANG = ["", " nghìn", " triệu", " tỷ"];

/**
 * Đọc số tiền thành chữ để in dòng "Bằng chữ" trên đơn bán hàng.
 *
 * Làm tròn về đồng — hoá đơn giấy không có phần lẻ. Vượt 999 tỷ thì trả lại chuỗi số
 * để không đọc sai: mốc "nghìn tỷ" đọc theo nhóm bốn hàng, viết cho đủ không đáng
 * so với việc đơn bán cửa cuốn không bao giờ chạm ngưỡng đó.
 */
export function docSoTienBangChu(value: unknown): string {
  const so = Math.round(Math.abs(numberValue(value) ?? 0));
  if (so === 0) return "Không đồng.";
  if (so >= 1e12) return `${so.toLocaleString("vi-VN")} đồng.`;

  const nhom: number[] = [];
  for (let con = so; con > 0; con = Math.floor(con / 1000)) nhom.push(con % 1000);

  const phan: string[] = [];
  for (let i = nhom.length - 1; i >= 0; i -= 1) {
    const giaTri = nhom[i] ?? 0;
    if (giaTri === 0) continue;
    // Nhóm đầu đọc gọn ("bảy triệu"), các nhóm sau đọc đủ ("không trăm hai mươi").
    phan.push(docNhomBa(giaTri, phan.length > 0) + (HANG[i] ?? ""));
  }

  const chu = phan.join(" ");
  const am = (numberValue(value) ?? 0) < 0 ? "Âm " : "";
  return `${am}${chu.charAt(0).toLocaleUpperCase("vi")}${chu.slice(1)} đồng.`;
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

/**
 * Compatibility helper for existing Sales TSX callers.
 *
 * The client no longer knows which customer/door uses which width. `ui-child-preview` resolves
 * that from Cutting Policy + Geometry Profile and marks exactly one measured-width field as
 * visible/required/editable. This helper only reads that server decision.
 */
export function salesWidthInputField(line: SalesLine, _customerGroup = ""): SalesWidthInputField | undefined {
  for (const fieldname of ["width_pb_ray_m", "width_pb_nhua_m"] as const) {
    const override = fieldOverride(line, fieldname);
    if (!override) continue;
    const hidden = override.hidden === true || override.hidden === 1;
    const required = override.reqd === true || override.reqd === 1;
    const readonly = override.read_only === true || override.read_only === 1;
    if (!hidden && required && !readonly) return fieldname;
  }
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

/**
 * Dòng này có nên đi hỏi định mức không.
 *
 * `isFullSetSalesItem` dò chữ "TRỌN BỘ" TRONG MÃ HÀNG — đó là đường lui cho khoảng 100 mã cũ
 * còn nhồi cách bán vào mã. Mã mới thì cách bán nằm ở ô `sales_mode` của chính dòng bán, nên
 * lấy tên mã làm chốt chặn là bỏ sót mọi mã đặt tên đúng chuẩn: `CDL_DLM_1LY` có định mức đầy
 * đủ (2 cây ray, 1 cây trục, tôn theo số lá) nhưng không bao giờ được xổ.
 *
 * Backend đã tự trả `bom_applicable: false` kèm lý do đọc được cho dòng không có cấu thành,
 * nên hỏi rộng ra không sai — chỉ tốn một lượt đọc mặt hàng, và nó dừng trước khi liệt kê BOM.
 */
export function mayHaveBom(line: Pick<SalesLine, "item_code"> & { sales_mode?: unknown; item_name?: unknown; _itemName?: unknown; _showBomOnSales?: boolean }): boolean {
  if (!text(line.item_code)) return false;
  // Bộ quy cách của loại cửa này đã tắt xổ định mức — không hỏi, để khỏi loé dòng "Đang tính…".
  if (line._showBomOnSales === false) return false;
  if (text(line.sales_mode)) return true;
  if (isFullSetSalesItem(line)) return true;
  /*
   * Dò cả TÊN HÀNG: đợt gộp mã đã bỏ token cách giao khỏi MÃ nhưng giữ trong TÊN.
   * `CDL_DLM_1LY` có tên "CỬA ĐL1LY TRỌN BỘ" — dò mã thì trượt, và màn này không có ô
   * Cách bán để người bán bù vào, nên dòng đó không đường nào xổ được định mức.
   */
  const ten = text(line.item_name) || text(line._itemName);
  return Boolean(ten) && isFullSetSalesItem({ item_code: ten });
}

export function primaryQuantityField(line: SalesLine): "set_count" | "qty" {
  if (isAreaDoor(line) || fieldVisible(line, "set_count")) return "set_count";
  return "qty";
}

export function fieldOverride(line: SalesLine, fieldname: string): FieldOverride | undefined {
  return line._overrides?.[fieldname];
}

/**
 * Ô/cột này có hiện không — SERVER LÀ TRỌNG TÀI.
 *
 * Thứ tự thẩm quyền, cố tình chỉ có ba nấc:
 *
 *  1. Server nói `hidden` (0 hay 1) → theo đúng, không bàn. Đo ngày 24/08: server phát `hidden`
 *     tường minh cho MỌI trường số đo ở mọi mặt hàng, nên gần như luôn dừng ở nấc này.
 *  2. Server có gửi override nhưng KHÔNG nói `hidden` (chỉ nhãn, chỉ `link_filters`…) → đó là
 *     "không có ý kiến về việc hiện/ẩn", KHÔNG phải "hãy hiện". Bản trước coi mọi override là
 *     lệnh hiện, nên một override chỉ để đổi nhãn cũng đủ kéo nguyên một cột lên bảng.
 *  3. Không ai nói gì → cửa bán theo m² luôn cần Rộng/Cao/Số bộ; ngoài ra chỉ hiện khi dòng
 *     THẬT SỰ có số. Số 0 không tính: nó là giá trị khởi tạo, không phải người bán đã nhập.
 */
export function fieldVisible(line: SalesLine, fieldname: string): boolean {
  const override = fieldOverride(line, fieldname);
  if (override?.hidden === true || override?.hidden === 1) return false;
  if (override?.hidden === false || override?.hidden === 0) return true;
  if (fieldname === "width_m" || fieldname === "height_m" || fieldname === "set_count") {
    if (isAreaDoor(line)) return true;
  }
  const value = line[fieldname];
  if (value === undefined || value === null || value === "") return false;
  return typeof value === "number" ? value !== 0 : true;
}

/**
 * Server có CẤM ô này không — khác hẳn `fieldVisible` là "server có CHO PHÉP không".
 *
 * Có những ô server chỉ gửi kèm cấu hình chứ không phát biểu gì về hiện/ẩn: ô Màu chẳng hạn,
 * server gửi `link_filters` (danh sách màu được phép) mà không có `hidden`. Hỏi nó bằng
 * `fieldVisible` là hiểu sai câu trả lời — "không nói gì" bị đọc thành "đừng hiện", và ô Màu
 * biến mất khỏi mọi mặt hàng chưa kịp chọn màu.
 *
 * Những ô như thế mặc định là CÓ, chỉ tắt khi server nói thẳng `hidden` (ví dụ Trục: không có
 * khái niệm màu nên server ẩn hẳn).
 */
export function fieldHidden(line: SalesLine, fieldname: string): boolean {
  const override = fieldOverride(line, fieldname);
  return override?.hidden === true || override?.hidden === 1;
}

/**
 * Cửa này kéo tay — nên KHÔNG gợi ý motor và bình lưu điện.
 *
 * Cố ý là vị từ TRÌNH BÀY, không đụng `is_manual_pull`: ô đó nuôi `manual_pull_sales_basis` của
 * Chính sách cắt, tức là nó ra TIỀN. Bật nó chỉ để giấu một panel gợi ý là đổi cả cơ sở tính tiền
 * — cái giá quá đắt cho một việc thuần hiển thị.
 *
 * Dò theo TOKEN `_KT_` chứ không dò chuỗi con. Đo trên 404 mã ngày 24/08: token khớp đúng 6 mã
 * cửa (2 Đức KT + 4 Úc KT); dò lỏng sẽ trúng oan `PKC_BANGKT_5P` (băng keo) và `PKC_VDAY_TDU_KTD`
 * (thanh đáy Úc).
 */
export function laCuaKeoTay(line: Pick<SalesLine, "item_code" | "leaf_variant"> & { _itemName?: string }): boolean {
  if (normalized(line.leaf_variant) === "keo tay") return true;
  // `normalized` trả chữ THƯỜNG — mẫu phải viết thường, nếu không nó không bao giờ khớp.
  const code = normalized(line.item_code).replace(/[^a-z0-9]/g, "_");
  if (/(^|_)kt(_|$)/.test(code)) return true;
  return normalized(line._itemName).includes("keo tay");
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
  "DUC-GIFT-RAIL-GT8M2": "Tặng ray cửa Đức trên 8 m²",
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
/**
 * Phần trăm chiết khấu THEO CHÍNH SÁCH của dòng.
 *
 * Hỏi server trước (`policy_discount_percentage` — cùng hàm mà khâu ghi sổ dùng), rồi mới lùi về
 * đọc snapshot luật `DISCOUNT_PERCENT`. Phải theo thứ tự đó: chiết khấu 15% cửa Đức khai bằng
 * SỐ TIỀN trên m² chứ không bằng phần trăm (15% tính trên đơn giá chỉ lá kể cả khi bán bản tặng
 * ray), nên tìm trong snapshot sẽ không thấy gì và ô chiết khấu đứng yên ở 0 trong khi tiền đã
 * giảm đủ — người bán tưởng khách chưa được giảm.
 */
export function linePolicyDiscountPercentage(line: SalesLine): number {
  const theoChinhSach = numberValue(line._commercial?.policy_discount_percentage);
  if (theoChinhSach !== undefined) return theoChinhSach;
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

/**
 * Một dòng chính sách được coi là "đã có khoản giảm" nếu nó giảm phần trăm, giảm số tuyệt đối,
 * hoặc là ADJUSTMENT mang số tiền ÂM — bản sao ở client của
 * `commercial-selling/src/controllers.ts:hasAlumdoorDiscountEffect`. Chiết khấu 15% cửa Đức đi
 * qua đường LUẬT SỐ TIỀN (ADJUSTMENT âm trên đơn giá), không phải luật phần trăm, nên
 * `discount_percentage` của dòng THẬT SỰ là 0 dù tiền đã giảm đúng — hai nơi phải cùng một câu
 * trả lời, nếu không server coi là "đã đủ chính sách" còn client vẫn tô đỏ "cần duyệt".
 */
function hasAlumdoorDiscountEffect(snapshot: PricingRuleSnapshot): boolean {
  const effect = text(snapshot.effect_type).toUpperCase();
  if (effect === "DISCOUNT_PERCENT" || effect === "DISCOUNT_AMOUNT") return true;
  return effect === "ADJUSTMENT" && Number(snapshot.amount_minor ?? 0) < 0;
}

/** Sale được nhập override; khác policy thì vẫn preview nhưng phải hiện cảnh báo/cần duyệt. */
export function lineDiscountNeedsApproval(line: SalesLine): boolean {
  if (!text(line.item_code) || !line._commercial) return false;
  const allowed = linePolicyDiscountPercentage(line);
  const snapshots = Array.isArray(line._commercial.pricing_rule_snapshots) ? line._commercial.pricing_rule_snapshots! : [];
  const policySatisfiedByMoney = allowed > 0 && snapshots.some(hasAlumdoorDiscountEffect);
  /*
   * Người bán CHƯA tự gõ gì vào ô % (rỗng/undefined — server chỉ ghi vào `discount_percentage`
   * khi nó thật sự khác 0, xem `AlumdoorSalesOrderWorkbenchComplete.tsx`), và chính sách đã áp
   * đủ qua đường số tiền ⇒ không có gì để duyệt. Người bán CÓ gõ (kể cả gõ đúng 0 để cố tình bỏ
   * chiết khấu) thì vẫn so như cũ, vì đó là ý định thật của họ.
   */
  const enteredRaw = line.discount_percentage;
  if (enteredRaw === undefined && policySatisfiedByMoney) return false;
  const entered = numberValue(enteredRaw ?? line._commercial.discount_percentage) ?? 0;
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

// ── CÁCH BÁN (biến thể giá) ───────────────────────────────────────────────────────────────────
// Ba hàm dưới đây đọc THẲNG ảnh chụp của `alumdoor.sales.item_context`, không đọc bản giải trình
// gộp (`linePriceExplain`): bản gộp ưu tiên `_commercial`, mà đường thương mại chỉ trả về biến
// thể ĐÃ dùng chứ không liệt kê được các lựa chọn còn lại. Lấy nhầm nguồn là ô chọn biến mất
// ngay sau khi dòng ra giá lần đầu.

/** Các cách bán mà mã hàng đang có giá. Rỗng ⇒ không có gì để chọn ⇒ ẩn hẳn ô. */
export function linePriceVariantOptions(line: SalesLine): PriceVariantOption[] {
  const options = line._context?.price_explain?.price_variant_options;
  return Array.isArray(options) ? options.filter((option) => text(option?.price_variant)) : [];
}

/** `true` = có nhiều cách bán mà dòng chưa chọn ⇒ chưa ra tiền. Không phải lỗi danh mục. */
export function linePriceVariantRequired(line: SalesLine): boolean {
  return line._context?.price_explain?.price_variant_required === true;
}

/** Cách bán ĐANG dùng: ưu tiên giá trị trên dòng, rồi tới thứ server đã chốt. */
export function linePriceVariant(line: SalesLine): string {
  return text(line.price_variant)
    || text(line._context?.price_explain?.price_variant)
    || text(line._commercial?.price_explain?.price_variant)
    || text(line._commercial?.price_variant);
}

/**
 * Mã giá → tiếng Việt.
 *
 * Server tra giá theo ĐÚNG mã thô (`clouderp-pricing` lọc theo `price_variant`), nên bảng này
 * chỉ đổi CHỮ HIỆN RA, không bao giờ đổi giá trị ghi xuống. Tập mã lấy từ dữ liệu thật đang có
 * trong `nhap/` + `nhap/du-lieu/` (đếm 21/08/2026: STANDARD 628, TRON_BO 113, CHI_LA 35,
 * TANG_RAY 30, TACH_MON 16, KEO_TAY 12, MOTOR_NGOAI 8) và mô tả trong brief
 * `alumdoor-v2.json` (Sales Order Item → price_variant).
 *
 * Mã lạ (danh mục thêm mã mới mà bảng này chưa biết) phải hiện lại CHÍNH MÃ THÔ: người bán đọc
 * được mã còn hơn nhìn một ô rỗng và tưởng dòng chưa có giá.
 */
const PRICE_VARIANT_LABELS: Record<string, string> = {
  STANDARD: "Tiêu chuẩn",
  TANG_RAY: "Tặng ray",
  CHI_LA: "Chỉ lá (không tặng ray)",
  TRON_BO: "Trọn bộ",
  TACH_MON: "Tách món",
  KEO_TAY: "Kéo tay",
  MOTOR_NGOAI: "Mô tơ ngoài",
};

/** Mã giá "TANG_RAY"/"CHI_LA" — cặp duy nhất người bán thật sự phải bật/tắt trên màn. */
export const PRICE_VARIANT_GIFT_RAIL = "TANG_RAY";
export const PRICE_VARIANT_LEAF_ONLY = "CHI_LA";

/** Nhãn tiếng Việt của một mã giá. Không biết mã ⇒ trả lại nguyên mã thô, không bao giờ rỗng. */
export function priceVariantLabel(value: unknown): string {
  const code = text(value);
  if (!code) return "";
  return PRICE_VARIANT_LABELS[code.toUpperCase()] ?? code;
}

/** Bảng `mã → nhãn` cho ô chọn (DocField.optionLabels): GIÁ TRỊ giữ mã thô, chỉ nhãn được dịch. */
export function priceVariantOptionLabels(options: PriceVariantOption[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const option of options) {
    const code = text(option.price_variant);
    if (code) labels[code] = priceVariantOptionLabel(option);
  }
  return labels;
}

/**
 * Ô tick "Tặng ray" chỉ có nghĩa khi mặt hàng có ĐÚNG hai dòng giá TANG_RAY và CHI_LA.
 *
 * 202/224 cặp (mã + ĐVT) chỉ có một cách bán — bật một ô tick ở đó là hứa với người bán một
 * lựa chọn không tồn tại. Mã có từ ba cách trở lên thì một ô tick không diễn đạt đủ, phải giữ
 * ô chọn. `undefined` = không đủ điều kiện ⇒ dùng ô chọn như cũ.
 */
export function lineGiftRailToggle(line: SalesLine): {
  checked: boolean;
  giftOption: PriceVariantOption;
  leafOption: PriceVariantOption;
  /** `true` = dòng chưa chọn cách bán nào ⇒ chưa ra tiền, phải nói thẳng chứ không tick sẵn. */
  undecided: boolean;
  /** Ngưỡng diện tích đang áp (m²) — của server nếu server có nói, nếu không thì hằng số dưới. */
  minArea: number;
  /** Toán tử biên đang áp: `GT` = lớn hơn; `GTE` = lớn hơn hoặc bằng. */
  operator: "GT" | "GTE";
  /** Diện tích một BỘ đang dùng để so với ngưỡng; `undefined` = chưa nhập đủ kích thước. */
  area?: number;
  /** `true` = đủ diện tích để được tặng ray ⇒ được phép tick (và được tick sẵn). */
  eligible: boolean;
} | undefined {
  const options = linePriceVariantOptions(line);
  if (options.length !== 2) return undefined;
  const giftOption = options.find((option) => text(option.price_variant).toUpperCase() === PRICE_VARIANT_GIFT_RAIL);
  const leafOption = options.find((option) => text(option.price_variant).toUpperCase() === PRICE_VARIANT_LEAF_ONLY);
  if (!giftOption || !leafOption) return undefined;
  const chosen = linePriceVariant(line).toUpperCase();
  const minArea = lineGiftRailMinArea(line);
  const area = lineGiftRailArea(line);
  const operator = lineGiftRailAreaOperator(line);
  return {
    checked: chosen === PRICE_VARIANT_GIFT_RAIL,
    giftOption,
    leafOption,
    undecided: chosen !== PRICE_VARIANT_GIFT_RAIL && chosen !== PRICE_VARIANT_LEAF_ONLY,
    minArea,
    operator,
    area,
    eligible: area !== undefined && (operator === "GTE" ? area >= minArea - 1e-9 : area > minArea + 1e-9),
  };
}

/**
 * Ngưỡng diện tích được tặng ray.
 *
 * Quyết định trực tiếp của chủ xưởng ngày 22/08/2026 là **trên 8 m²**, thay mốc 10 m² trong
 * workbook cũ. Đây là số dự phòng; payload server có khai chính sách cụ thể vẫn là trọng tài.
 */
export const GIFT_RAIL_MIN_AREA_SQM = 8;

const GIFT_RAIL_MIN_AREA_KEYS = [
  "gift_rail_min_area_sqm",
  "gift_rail_threshold_sqm",
  "benefit_min_area_sqm",
] as const;

/** Ngưỡng của server nếu có; không có ⇒ quyết định chủ xưởng 8 m². */
export function lineGiftRailMinArea(line: SalesLine): number {
  const commercial = line._commercial as Record<string, unknown> | undefined;
  const catalog = line._commercial?.catalog_context as Record<string, unknown> | undefined;
  const context = line._context as Record<string, unknown> | undefined;
  for (const key of GIFT_RAIL_MIN_AREA_KEYS) {
    const value = positiveNumber(commercial?.[key])
      ?? positiveNumber(catalog?.[key])
      ?? positiveNumber(context?.[key]);
    if (value !== undefined) return value;
  }
  return GIFT_RAIL_MIN_AREA_SQM;
}

/** Toán tử biên của chính sách: `GT` = lớn hơn; `GTE` = lớn hơn hoặc bằng. */
export function lineGiftRailAreaOperator(line: SalesLine): "GT" | "GTE" {
  const commercial = line._commercial as Record<string, unknown> | undefined;
  const catalog = line._commercial?.catalog_context as Record<string, unknown> | undefined;
  const context = line._context as Record<string, unknown> | undefined;
  const value = text(commercial?.gift_rail_area_operator)
    || text(catalog?.gift_rail_area_operator)
    || text(context?.gift_rail_area_operator);
  return value.toUpperCase() === "GTE" ? "GTE" : "GT";
}

/**
 * Diện tích MỘT BỘ để so với ngưỡng.
 *
 * Quyền lợi tặng ray đi theo từng bộ cửa, không theo tổng đơn: hai bộ 4 m² không thành một bộ
 * đạt ngưỡng. `billable_area_sqm` của server là diện tích ĐÃ nhân số bộ, nên phải chia lại cho số bộ.
 */
export function lineGiftRailArea(line: SalesLine): number | undefined {
  /*
   * KÍCH THƯỚC THẬT đi trước `billable_area_sqm`: diện tích tính tiền đã có thể bị `min_area_sqm`
   * NÂNG lên (bộ 3,2 m² thu tiền 4 m²). Lấy con số đã nâng đó đi so ngưỡng tặng ray là tặng ray
   * cho một bộ cửa chưa bao giờ đủ lớn — quà tặng ra tiền thật, không được suy ra từ số đã bị nâng.
   */
  const width = positiveNumber(line.width_pb_ray_m) ?? positiveNumber(line.width_pb_nhua_m) ?? positiveNumber(line.width_m);
  const height = positiveNumber(line.height_m);
  if (width !== undefined && height !== undefined) return width * height;
  const sets = positiveNumber(line.set_count) ?? 1;
  const billable = positiveNumber(line.billable_area_sqm);
  return billable === undefined ? undefined : billable / sets;
}

/**
 * Dòng đang chọn "Tặng ray" trong khi diện tích CHƯA tới ngưỡng ⇒ phải chặn, không chỉ cảnh báo.
 *
 * Chốt chủ xưởng: ngưỡng 8 m², toán tử GT, vừa chặn vừa cảnh báo. Trả về câu giải thích bằng tiếng
 * Việt để cả ô tick lẫn thanh tổng nói đúng một câu, hoặc chuỗi rỗng khi dòng hợp lệ.
 */
export function lineGiftRailViolation(line: SalesLine): string {
  const toggle = lineGiftRailToggle(line);
  if (!toggle || !toggle.checked || toggle.eligible) return "";
  const area = toggle.area;
  const boundary = lineGiftRailAreaOperator(line) === "GTE" ? "đạt" : "vượt";
  return area === undefined
    ? `Chưa nhập đủ kích thước nên chưa biết dòng này có ${boundary} ${quantity(toggle.minArea)} m² để được tặng ray hay không.`
    : `Cửa ${quantity(area)} m²/bộ chưa ${boundary} ${quantity(toggle.minArea)} m² — không được tặng ray. Bỏ tick "Tặng ray" để bán theo đơn giá chỉ lá.`;
}

/**
 * Ảnh mặt hàng, nếu payload có.
 *
 * 21/08/2026: DocType `Item` trong `server/briefs/alumdoor-v2.json` CHƯA có trường ảnh nào
 * (`Attach Image` chỉ xuất hiện ở phiếu nhập kho và biên bản chênh lệch), và trong repo cũng
 * chưa có kho ảnh sản phẩm. Hàm này đọc theo những tên trường chuẩn để phần UI tự sáng lên
 * đúng ngày brief bổ sung trường ảnh, không phải sửa lại lưới lần nữa. Chưa có ⇒ chuỗi rỗng,
 * và UI ẩn hẳn phần ảnh chứ không dựng một ô trống cho mọi dòng.
 */
const ITEM_IMAGE_KEYS = ["item_image", "image", "image_url", "thumbnail", "item_thumbnail"] as const;
export function lineItemImage(line: SalesLine): string {
  const context = line._context as Record<string, unknown> | undefined;
  const row = line as unknown as Record<string, unknown>;
  for (const key of ITEM_IMAGE_KEYS) {
    const value = text(row[key]) || text(context?.[key]);
    if (value) return value;
  }
  return "";
}

/** Nhãn cho một cách bán: chữ tiếng Việt kèm đúng con số của nó — số mới là thứ giúp chọn đúng. */
export function priceVariantOptionLabel(option: PriceVariantOption): string {
  const code = priceVariantLabel(option.price_variant);
  const unit = text(option.uom) ? `/${text(option.uom)}` : "";
  const rate = numberValue(option.rate);
  if (rate !== undefined) return `${code} · ${money(rate)} ₫${unit}`;
  const min = numberValue(option.rate_min);
  const max = numberValue(option.rate_max);
  if (min === undefined || max === undefined) return code;
  const tiers = Number(option.tier_count) > 1 ? ` (${option.tier_count} bậc)` : "";
  if (min === max) return `${code} · ${money(min)} ₫${unit}${tiers}`;
  return `${code} · ${money(min)}–${money(max)} ₫${unit}${tiers}`;
}

/**
 * Nhãn CHỈ CÓ SỐ TIỀN của một cách bán — không lặp lại tên cách bán.
 *
 * Lỗi chủ xưởng chụp 21/08/2026: "… · Tặng ray · Tặng ray · 1.760.000 ₫/m2". Chữ "Tặng ray" thứ
 * nhất là nhãn ô tick, chữ thứ hai đến từ `priceVariantOptionLabel` in kèm ngay bên cạnh. Cạnh
 * một ô tick đã có nhãn, chỉ CON SỐ mới là thông tin mới.
 */
export function priceVariantOptionAmountLabel(option: PriceVariantOption): string {
  const unit = text(option.uom) ? `/${text(option.uom)}` : "";
  const rate = numberValue(option.rate);
  if (rate !== undefined) return `${money(rate)} ₫${unit}`;
  const min = numberValue(option.rate_min);
  const max = numberValue(option.rate_max);
  if (min === undefined || max === undefined) return "";
  const tiers = Number(option.tier_count) > 1 ? ` (${option.tier_count} bậc)` : "";
  if (min === max) return `${money(min)} ₫${unit}${tiers}`;
  return `${money(min)}–${money(max)} ₫${unit}${tiers}`;
}

/**
 * Ô tick "Có bắn bướm" — chỉ có ở loại cửa mà chính sách cắt khai số trừ riêng.
 *
 * Server đã quyết sẵn: `sales-production-core.ts:1193` tính `supports_butterfly_bracket` từ
 * `Cutting Policy.butterfly_cut_deduction_m`, rồi `ui-child-preview.ts:509` chiếu xuống dòng
 * thành `field_overrides.has_butterfly_bracket.hidden`. Client KHÔNG tự đoán theo tên loại cửa:
 * chỉ đọc lại quyết định đó. Không có override ⇒ server chưa nói ⇒ ẩn (Đức, Úc rơi vào đây).
 *
 * Chữ hiện ra thống nhất là "Có bắn bướm" — đúng chữ chủ xưởng dùng.
 */
export function lineButterflyToggle(line: SalesLine): { checked: boolean } | undefined {
  const override = fieldOverride(line, "has_butterfly_bracket");
  if (!override || override.hidden === true || override.hidden === 1) return undefined;
  return { checked: numberValue(line.has_butterfly_bracket) === 1 };
}

/**
 * Ô tick "Sơn ray" — chỉ có ở dòng Trọn bộ diện tích. Tách món đã có ô Màu riêng cho chính
 * mặt hàng ray, nên ô này không lặp lại ở đó.
 *
 * Không tick = ray để mộc (THÔ), không phụ thu — server không cần nói gì thêm vì đây là quy
 * ước tĩnh, không phải quyết định nghiệp vụ như "bắn bướm" (schema tự khai qua `depends_on`
 * `sales_mode == 'Trọn bộ'`, đọc lại nguyên văn ở đây thay vì đợi field_overrides).
 */
export function lineRayPaintToggle(line: SalesLine): { checked: boolean; color: string } | undefined {
  if (!isAreaDoor(line)) return undefined;
  const salesMode = text(line.sales_mode) || "Trọn bộ";
  if (salesMode !== "Trọn bộ") return undefined;
  return { checked: numberValue(line.ray_painted) === 1, color: text(line.ray_color) };
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

export interface LineAdjustmentSplit {
  /** Tổng các khoản ADJUSTMENT LÀM TĂNG tiền — đây mới đúng nghĩa "Phụ thu". */
  surcharge: number;
  /** Tổng các khoản ADJUSTMENT LÀM GIẢM tiền (trị tuyệt đối) — thuộc nhóm "Chiết khấu". */
  reduction: number;
  /** Tên (đã Việt hoá) của các luật đang kéo tiền xuống, để giải thích ô "Chiết khấu". */
  reductionRules: string[];
}

/**
 * Tách `adjustment_amount` của MỘT dòng theo DẤU của từng luật đã áp.
 *
 * Sau bản vá P0 chiết khấu ở server, dòng cửa Đức đại lý trả về `discount_percentage: 0` /
 * `discount_amount: 0` còn khoản 15% nằm trong `adjustment_amount` mang dấu ÂM. Ô "Chiết khấu"
 * mà vẫn chỉ đọc `discount_amount` thì khách nhìn thấy "Chiết khấu 0 ₫" trong khi tiền đã giảm
 * đúng — đúng tiền, sai cách trình bày.
 *
 * `amount_minor` là đơn vị minor của tiền tệ; quy đổi bằng đúng tỉ lệ tổng của chính dòng đó
 * (`adjustment_amount / Σ amount_minor`) nên đúng với mọi currency scale, không phải đoán.
 */
export function lineAdjustmentSplit(line: SalesLine): LineAdjustmentSplit {
  const total = lineAdjustmentAmount(line);
  const applied = lineAppliedAdjustments(line);
  const minorTotal = applied.reduce((sum, row) => sum + (numberValue(row.amount_minor) ?? 0), 0);
  const reductionRules: string[] = [];
  const addRule = (value: unknown) => {
    const label = pricingRuleLabel(value);
    if (label && !reductionRules.includes(label)) reductionRules.push(label);
  };
  if (applied.length && minorTotal !== 0 && total !== 0) {
    const factor = total / minorTotal;
    let surcharge = 0;
    let reduction = 0;
    for (const row of applied) {
      const amount = (numberValue(row.amount_minor) ?? 0) * factor;
      if (amount >= 0) surcharge += amount;
      else { reduction += -amount; addRule(row.rule_name); }
    }
    return { surcharge, reduction, reductionRules };
  }
  if (!total) return { surcharge: 0, reduction: 0, reductionRules };
  if (total >= 0) return { surcharge: total, reduction: 0, reductionRules };
  for (const row of applied) addRule(row.rule_name);
  return { surcharge: 0, reduction: -total, reductionRules };
}

/**
 * "Chiết khấu" mà người bán phải thấy trên dòng = chiết khấu % + mọi khoản ADJUSTMENT ÂM.
 * Sau bản vá P0, phần lớn tiền chiết khấu đi đường thứ hai chứ không còn ở `discount_amount`.
 */
export function lineDiscountTotal(line: SalesLine): number {
  return lineDiscountAmount(line) + lineAdjustmentSplit(line).reduction;
}

/**
 * Dấu hiệu TRÙNG CHIẾT KHẤU, khai đúng như chốt chặn của server
 * (`commercial-line-resolver.ts:194`): có chiết khấu, và tổng khoản ADJUSTMENT ÂM có trị tuyệt
 * đối TRÙNG KHÍT với khoản chiết khấu đó (sai số ≤ 1 đơn vị tiền do làm tròn).
 *
 * Điều kiện cũ ("có chiết khấu % VÀ có một luật âm mà tên nghe như chiết khấu") nay không bao
 * giờ đúng nữa — sau bản vá P0, dòng đi đường Pricing Rule có `discount_percentage = 0`. Giữ
 * nguyên nó thì badge thành code chết, và UI với server nói hai thứ tiếng khác nhau.
 */
export function lineDuplicateDiscount(line: SalesLine): boolean {
  const discount = lineDiscountAmount(line);
  if (discount <= 0) return false;
  const reduction = lineAdjustmentSplit(line).reduction;
  return reduction > 0 && Math.abs(reduction - discount) <= 1;
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

  /**
   * Cách bán chỉ được nêu khi nó THẬT SỰ là một lựa chọn.
   *
   * Mã chỉ có một cách bán thì nói "cách bán STANDARD" là nhiễu — người bán không có gì để
   * quyết. Nhưng mã có từ hai cách trở lên thì đây là dòng giải trình quan trọng nhất: nó là
   * thứ duy nhất phân biệt 1.221.000 với 1.146.000 trên cùng một mã, cùng một m².
   */
  const variantOptions = linePriceVariantOptions(line);
  if (variantOptions.length > 1) {
    const chosen = linePriceVariant(line);
    const option = variantOptions.find((entry) => text(entry.price_variant) === chosen);
    push("price_variant", "Mã giá",
      chosen
        ? (option ? priceVariantOptionLabel(option) : priceVariantLabel(chosen))
        : `Chưa chọn — ${variantOptions.map(priceVariantOptionLabel).join(" · ")}`,
      chosen ? undefined : "warn");
  }

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

  /* Tặng ray dưới ngưỡng: CHẶN, không chỉ nhắc. Đây là quà tặng ra tiền thật. */
  const giftRailViolation = lineGiftRailViolation(line);
  if (giftRailViolation) {
    gaps.push({ key: "gift_rail_below_threshold", what: giftRailViolation, where: "Bỏ tick \"Tặng ray\" ngay trên dòng này" });
  }

  for (const pending of Array.isArray(line._bomPreview?.pending_fields) ? line._bomPreview!.pending_fields! : []) {
    const label = text(pending);
    if (label) gaps.push({ key: `bom-${label}`, what: `BOM còn thiếu ${label}`, where: "Danh mục → Quy tắc BOM" });
  }

  return gaps;
}
