/** @jsxImportSource react */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Gift,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import type { DocField, DocTypeMeta } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import {
  Badge,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";
import {
  AlumdoorBomActualEditor,
  type BomActualComponentRow,
} from "../AlumdoorBomActualEditor.js";
import { AlumdoorMotorSuggestPanel } from "../AlumdoorMotorSuggestPanel.js";
import { AlumdoorSalesOrderField, fallbackField, selectField } from "./AlumdoorSalesOrderField.js";
import {
  fieldLabel,
  fieldReadonly,
  fieldRequired,
  fieldHidden,
  fieldVisible,
  isAreaDoor,
  isDirectOrdinaryQuantityLine,
  isFullSetSalesItem,
  laCuaKeoTay,
  mayHaveBom,
  lineAdjustmentAmount,
  lineAdjustmentSplit,
  lineAvailabilityStatus,
  lineButterflyToggle,
  lineDiscountTotal,
  priceVariantOptionAmountLabel,
  lineBlockingGaps,
  lineCatalogWarnings,
  lineCommercialNeedsApproval,
  lineConversionFactor,
  lineDeliveredQty,
  lineDiscountAmount,
  lineDiscountNeedsApproval,
  lineGiftRailArea,
  lineGiftRailToggle,
  lineItemImage,
  lineIsCatchWeight,
  lineMissingUomConversion,
  lineNeedsUomConversion,
  lineNetAmount,
  linePolicyDiscountPercentage,
  linePolicyDiscountRule,
  linePriceExplanation,
  linePriceVariant,
  linePriceVariantOptions,
  linePriceVariantRequired,
  linePricedQuantity,
  lineRayPaintToggle,
  priceVariantLabel,
  priceVariantOptionLabel,
  priceVariantOptionLabels,
  PRICE_VARIANT_GIFT_RAIL,
  PRICE_VARIANT_LEAF_ONLY,
  lineSalesUom,
  lineStockQty,
  lineStockUom,
  lineUomGap,
  money,
  normalized,
  numberValue,
  pricingRuleLabel,
  primaryQuantityField,
  quantity,
  salesWidthInputField,
  text,
  type SalesLine,
} from "./model.js";
import {
  DYNAMIC_FALLBACK_LABELS,
  DYNAMIC_HEADER_UNITS,
  dynamicDisplayValue,
  dynamicFieldVisible,
  resolveDynamicColumns,
  type DynamicFieldName,
} from "./print-columns.js";

// Bộ cột thông số + luật chọn cột nay nằm ở `print-columns.ts` — dùng chung với bản in.


type ColumnId =
  | "select"
  | "index"
  | "item_code"
  | "item_name"
  | "color"
  | "price_variant"
  | DynamicFieldName
  | "quantity"
  | "uom"
  | "stock_conversion"
  | "priced_qty"
  | "rate"
  | "gross_amount"
  | "actions";



const DYNAMIC_FALLBACK_TYPES: Record<DynamicFieldName, DocField["fieldtype"]> = {
  width_pb_ray_m: "Float",
  width_pb_nhua_m: "Float",
  width_m: "Float",
  height_m: "Float",
  mesh_height_m: "Float",
  cut_width_m: "Float",
  leaf_variant: "Select",
  ray_type: "Select",
  has_butterfly_bracket: "Check",
  motor_model: "Link",
  length_m: "Float",
  qty_bar: "Float",
  leaf_count: "Float",
  single_layer_leaf_count: "Float",
  double_layer_leaf_count: "Float",
  estimated_weight_kg: "Float",
};


/**
 * Ô LUÔN LUÔN là số máy tính ra, không đời nào người bán gõ.
 *
 * `cut_width_m` ĐÃ RỜI danh sách này: với dòng bán theo Rộng cắt lá (Tách món của Lưới/Đài Loan,
 * và mọi dòng Đại lý của Siêu Trường) thì chính nó là Ô NHẬP — khách đặt bề rộng cắt, hệ suy
 * ngược ra phủ bì. Ép cứng ở đây là client cãi server: server gửi `read_only: 0` mà ô vẫn khoá,
 * kết quả là không ô rộng nào gõ được và dòng không bao giờ ra SL.
 *
 * Giờ để `field_overrides.read_only` của server quyết — nó gửi `read_only: 1` cho dòng Trọn bộ
 * (và ẩn luôn), `read_only: 0` cho dòng bán theo rộng cắt lá.
 */
const FORCE_READ_ONLY = new Set<DynamicFieldName>([
  "leaf_count",
  "double_layer_leaf_count",
  "estimated_weight_kg",
]);

// Sales grid ưu tiên nhìn được nhiều cột cùng lúc. Các số đo chỉ cần 2–4 chữ số + phần thập phân,
// nên không dành 110–120px/cột như form thông thường. Mã/tên hàng vẫn được giữ đủ rộng để đọc.
const DEFAULT_WIDTHS: Record<ColumnId, number> = {
  select: 38,
  index: 52,
  item_code: 150,
  item_name: 180,
  color: 102,
  price_variant: 140,
  width_pb_ray_m: 92,
  width_pb_nhua_m: 98,
  width_m: 88,
  height_m: 88,
  mesh_height_m: 84,
  cut_width_m: 90,
  leaf_variant: 110,
  ray_type: 104,
  has_butterfly_bracket: 88,
  motor_model: 128,
  length_m: 86,
  qty_bar: 78,
  leaf_count: 74,
  single_layer_leaf_count: 82,
  double_layer_leaf_count: 82,
  estimated_weight_kg: 92,
  quantity: 70,
  uom: 84,
  stock_conversion: 108,
  priced_qty: 86,
  rate: 112,
  gross_amount: 118,
  actions: 68,
};

const MIN_WIDTHS: Partial<Record<ColumnId, number>> = {
  select: 36,
  index: 46,
  item_code: 120,
  item_name: 135,
  color: 82,
  price_variant: 110,
  width_pb_ray_m: 76,
  width_pb_nhua_m: 80,
  width_m: 72,
  height_m: 72,
  mesh_height_m: 72,
  cut_width_m: 76,
  leaf_variant: 92,
  ray_type: 88,
  has_butterfly_bracket: 74,
  motor_model: 105,
  length_m: 72,
  qty_bar: 68,
  leaf_count: 64,
  single_layer_leaf_count: 72,
  double_layer_leaf_count: 72,
  estimated_weight_kg: 78,
  quantity: 62,
  uom: 78,
  stock_conversion: 92,
  priced_qty: 76,
  rate: 94,
  gross_amount: 100,
  actions: 64,
};

// Tăng version khi thay cấu trúc cột để localStorage cũ không làm lệch vùng tiền.
// v8: thêm "Quy ra tồn" + "Tồn khả dụng" (ĐVT bán ≠ ĐVT tồn của nhóm ray/trục).
// v9: thêm "Mã giá" — cột chỉ hiện khi mặt hàng thật sự có nhiều hơn một dòng giá.
const COLUMN_WIDTH_STORAGE_KEY = "alumdoor:sales-order:grid-widths:v9";
const FROZEN_COLUMNS: ColumnId[] = ["select", "index", "item_code", "item_name"];

function loadStoredWidths(): Record<ColumnId, number> {
  const defaults = { ...DEFAULT_WIDTHS };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const id of Object.keys(defaults) as ColumnId[]) {
      const value = Number(parsed[id]);
      if (Number.isFinite(value)) defaults[id] = Math.max(MIN_WIDTHS[id] ?? 64, Math.min(520, value));
    }
  } catch {
    // Local preference is optional; a corrupt/private localStorage must never break order entry.
  }
  return defaults;
}

function fieldFromMeta(meta: DocTypeMeta | null, fieldname: string, fallbackLabel: string, fallbackType: DocField["fieldtype"] = "Float") {
  return meta?.fields.find((field) => field.fieldname === fieldname)
    ?? fallbackField(fieldname, fallbackLabel, fallbackType);
}

function moveGridFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.getAttribute("role") === "option" || target.closest('[role="listbox"]')) return;
  const current = target.closest<HTMLElement>("[data-sales-grid-field]");
  if (!current) return;
  const fields = [...document.querySelectorAll<HTMLElement>("[data-sales-grid-field]")]
    .filter((element) => !element.hasAttribute("data-sales-grid-disabled"));
  const index = fields.indexOf(current);
  const next = fields[index + 1];
  if (!next) return;
  event.preventDefault();
  window.setTimeout(() => {
    const focusable = next.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }, 0);
}

function GridField(props: {
  rowKey?: string;
  columnId?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-sales-grid-field
      data-sales-row-key={props.rowKey}
      data-sales-column-id={props.columnId}
      data-sales-grid-disabled={props.disabled ? "true" : undefined}
      onKeyDownCapture={moveGridFocus}
      className="min-w-0 max-w-full overflow-hidden text-center"
    >
      {props.children}
    </div>
  );
}

function normalizeFieldValue(field: DocField, value: unknown): unknown {
  if (field.fieldtype === "Float" || field.fieldtype === "Int" || field.fieldtype === "Currency" || field.fieldtype === "Percent") {
    return value == null || value === "" ? undefined : Number(value);
  }
  if (field.fieldtype === "Check") return value ? 1 : 0;
  return text(value) || undefined;
}


/**
 * KHUYẾN MẠI & PHỤ THU CỦA MỘT DÒNG, DIỄN ĐẠT BẰNG CHỮ.
 *
 * Trên màn, những thứ này là ô tick + thẻ badge + ô chọn màu. Bản in không dùng lại lớp giao
 * diện đó (in ra thành mớ hộp rỗng), nhưng PHẢI nói đúng cùng nội dung — nên nội dung nằm ở
 * đây, một chỗ, và cả hai bên cùng gọi.
 *
 * "Ray thô (không sơn)" khi KHÔNG tick là có chủ ý: đó là thứ khách cần biết mình đang mua,
 * không phải chi tiết nội bộ.
 */
export function moTaKhuyenMai(line: SalesLine): string[] {
  const benefits = Array.isArray(line._commercial?.benefit_items) ? line._commercial!.benefit_items! : [];
  const railToggle = lineGiftRailToggle(line);
  const butterflyToggle = lineButterflyToggle(line);
  const rayToggle = lineRayPaintToggle(line);
  const raySurcharge = line._raySurcharge;
  const giftRailBenefit = railToggle
    ? benefits.find((benefit) => /GIFT[-_]?RAIL/i.test(text(benefit.source_rule)))
    : undefined;
  const shownBenefits = giftRailBenefit ? benefits.filter((benefit) => benefit !== giftRailBenefit) : benefits;
  return [
    ...promoChips(line),
    ...appliedRuleNames(line),
    ...shownBenefits.map((benefit) => `${text(benefit.label) || "Tặng kèm"} ${quantity(benefit.qty)} ${text(benefit.uom)}`.trim()),
    ...(railToggle?.checked
      ? [giftRailBenefit ? `Tặng ray ${quantity(giftRailBenefit.qty)} ${text(giftRailBenefit.uom)}`.trim() : "Tặng ray"]
      : []),
    ...(butterflyToggle?.checked ? ["Có bắn bướm"] : []),
    ...(rayToggle
      ? rayToggle.checked
        ? [`Sơn ray${rayToggle.color ? ` ${text(rayToggle.color)}` : ""}${raySurcharge?.surcharge_minor ? ` · phụ thu ${money(raySurcharge.surcharge_minor)} ₫` : ""}`]
        : ["Ray thô (không sơn)"]
      : []),
  ].filter((phan) => phan.length > 0);
}

function appliedRuleNames(line: SalesLine): string[] {
  const snapshots = Array.isArray(line._commercial?.pricing_rule_snapshots)
    ? line._commercial!.pricing_rule_snapshots!
    : [];
  return [...new Set(snapshots
    .filter((snapshot) => !["ADJUSTMENT", "DISCOUNT_PERCENT", "DISCOUNT_AMOUNT"].includes(text(snapshot.effect_type).toUpperCase()))
    .map((snapshot) => pricingRuleLabel(snapshot.rule_name))
    .filter(Boolean))];
}

export function surchargeRuleNames(line: SalesLine): string[] {
  const snapshots = Array.isArray(line._commercial?.pricing_rule_snapshots)
    ? line._commercial!.pricing_rule_snapshots!
    : [];
  return [...new Set(snapshots
    /*
     * Chiết khấu đại lý 15% cũng khai `effect_type: "ADJUSTMENT"` (đi đường LUẬT SỐ TIỀN, số
     * âm — xem `lineDiscountNeedsApproval`), nên lọc theo mỗi `effect_type` là gộp nhầm chiết
     * khấu vào ô "Phụ thu". Chỉ ADJUSTMENT mang số tiền DƯƠNG mới thật sự là phụ thu.
     */
    .filter((snapshot) => text(snapshot.effect_type).toUpperCase() === "ADJUSTMENT" && Number(snapshot.amount_minor ?? 0) > 0)
    .map((snapshot) => pricingRuleLabel(snapshot.rule_name))
    .filter(Boolean))];
}

export interface ProductDescriptionGroup {
  key: string;
  label: string;
  items: string[];
}

/**
 * "Mô tả sản phẩm" — cùng lượng thông tin như trước, nhưng chia NHÓM thay vì dồn một chuỗi.
 *
 * Bản cũ nối tất cả bằng dấu chấm giữa ("ĐỨC AL501N · Màu ĐEN XINGFA · Rộng PB nhựa 3 × …"),
 * nên người bán phải đọc hết cả câu mới tìm được con số mình cần, và câu đó lại bị `truncate`
 * cắt cụt đúng chỗ quan trọng nhất. Ở đây mỗi nhóm có nhãn riêng, và phần khuyến mại — chỗ
 * khách hỏi nhiều nhất — được tách hẳn ra một khối nổi (xem `promoChips` phía dưới) chứ không
 * lẫn vào cùng một dòng với kích thước.
 *
 * KHÔNG có thông tin nào bị bỏ: mọi mảnh của bản cũ đều còn, chỉ đổi chỗ.
 */
export function doorProductGroups(line: SalesLine, customerGroup: string): ProductDescriptionGroup[] {
  if (!isAreaDoor(line)) return [];
  const widthField = salesWidthInputField(line, customerGroup);
  const width = numberValue(widthField ? line[widthField] : undefined)
    ?? numberValue(line.width_m);
  const height = numberValue(line.height_m);
  const groups: ProductDescriptionGroup[] = [];
  const push = (key: string, label: string, items: Array<string | undefined>) => {
    const kept = items.map((item) => text(item)).filter(Boolean);
    if (kept.length) groups.push({ key, label, items: kept });
  };

  push("item", "Mặt hàng", [text(line._itemName) || text(line.item_code)]);
  push("finish", "Màu", [text(line.color)]);

  const sets = numberValue(line.set_count);
  const area = numberValue(line.billable_area_sqm)
    ?? (width !== undefined && height !== undefined && sets !== undefined ? width * height * sets : undefined);
  push("size", "Kích thước", [
    width !== undefined && height !== undefined
      ? `${widthField === "width_pb_nhua_m" ? "Rộng PB nhựa" : "Rộng PB ray"} ${quantity(width)} × Cao PB ${quantity(height)} m`
      : undefined,
    numberValue(line.mesh_height_m) !== undefined ? `Cao lưới ${quantity(line.mesh_height_m)} m` : undefined,
    area !== undefined ? `${quantity(area)} m²` : undefined,
    sets !== undefined ? `${quantity(sets)} bộ` : undefined,
  ]);

  push("config", "Cấu hình", [
    /* "Có bắn bướm" KHÔNG in ở đây nữa: nó đã là một Ô TICK có nhãn ngay dưới khối này. In cả
       hai chỗ là đúng cái lỗi "Tặng ray · Tặng ray" mà chủ xưởng chụp lại, chỉ khác tên. */
    text(line.leaf_variant),
    text(line.ray_type) ? `Ray ${text(line.ray_type)}` : undefined,
  ]);

  return groups;
}

/** Bản một dòng của mô tả — dùng cho `title` (tooltip) và cho việc quyết định tự mở dòng. */
function doorProductDescription(line: SalesLine, customerGroup: string): string {
  return doorProductGroups(line, customerGroup)
    .map((group) => group.items.join(" · "))
    .join(" · ");
}

/**
 * Khuyến mại & chiết khấu của dòng, gom về một chỗ.
 *
 * Trước đây chiết khấu và quà tặng nằm lẫn trong chuỗi mô tả dài, còn tên chính sách lại nằm ở
 * một cụm badge khác bên phải — hai nửa của cùng một câu chuyện ở hai đầu màn hình.
 */
export function promoChips(line: SalesLine): string[] {
  const chips: string[] = [];
  const discountPercentage = numberValue(line.discount_percentage ?? line._commercial?.discount_percentage)
    ?? linePolicyDiscountPercentage(line);
  if (discountPercentage > 0) {
    const policyDiscount = linePolicyDiscountPercentage(line);
    const policyLabel = linePolicyDiscountRule(line);
    chips.push(policyLabel && Math.abs(discountPercentage - policyDiscount) < 0.000001
      ? policyLabel
      : `Chiết khấu ${quantity(discountPercentage)}%`);
  }
  return chips;
}

/**
 * Ảnh mặt hàng.
 *
 * Ảnh HỎNG hoặc THIẾU không được làm vỡ lưới: cả hai trường hợp đều rơi về đúng một ô vuông
 * cùng kích thước với một biểu tượng mờ, nên chiều cao dòng không đổi dù server trả về gì.
 */
function ItemImage(props: { src: string; alt: string; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style: CSSProperties = { width: props.size, height: props.size };
  const frame = `shrink-0 overflow-hidden rounded border border-border/70 bg-muted/40 ${props.className ?? ""}`;
  if (!props.src || failed) {
    return (
      <div style={style} className={`${frame} grid place-items-center`} title={props.src ? "Không tải được ảnh mặt hàng" : "Chưa có ảnh mặt hàng"} aria-hidden>
        <ImageIcon className="size-3 text-muted-foreground/60" />
      </div>
    );
  }
  return (
    <img
      src={props.src}
      alt={props.alt}
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${frame} object-cover`}
    />
  );
}

function BomBlock(props: {
  line: SalesLine;
  lineNumber: number;
  expanded: boolean;
  readOnly: boolean;
  colSpan: number;
  dynamicColumns: DynamicFieldName[];
  showPriceVariant: boolean;
  showStockConversion: boolean;
  widths: Record<ColumnId, number>;
  stickyStyle: (id: ColumnId) => CSSProperties;
  onToggle: () => void;
  onBomActualChange: (key: string, rows: BomActualComponentRow[]) => void;
}) {
  const preview = props.line._bomPreview;
  const components = Array.isArray(preview?.components) ? preview!.components! : [];
  const requirements = Array.isArray(preview?.actual_requirements) ? preview!.actual_requirements! : [];
  const pendingFields = Array.isArray(preview?.pending_fields) ? preview!.pending_fields!.map(text).filter(Boolean) : [];
  const previewReason = text(preview?.reason);
  const missingSalesUomCount = components.filter((component) => !text(component.uom)).length;
  const bomEligible = mayHaveBom(props.line);
  if (!bomEligible && !text(preview?.bom_no) && !components.length && !requirements.length && !props.line._bomError) return null;
  const status = props.line._bomError
    ? "BOM chưa resolve"
    : props.line._loading
      ? "Đang tính BOM…"
    : missingSalesUomCount
      ? `BOM · ${components.length} phần con · ${missingSalesUomCount} chưa có ĐVT bán`
    : preview?.actual_complete === false
        ? `BOM · ${components.length} phần con · còn thiếu`
      : components.length
        ? `BOM · ${components.length} phần con`
        : pendingFields.length
          ? `BOM còn thiếu ${pendingFields.join(", ")}`
        : previewReason
          ? previewReason
        : text(preview?.bom_no)
          ? `BOM · ${text(preview?.bom_no)}`
          : "Chưa nhận được danh sách cấu thành BOM";
  const infoRow = (content: ReactNode, tone = "text-muted-foreground") => (
    <TableRow className="border-b bg-muted/10 hover:bg-muted/10 print:hidden" data-section="sales-v2-bom-message">
      <TableCell colSpan={props.colSpan} className={`border-l-2 border-primary/30 px-3 py-2 text-left text-xs ${tone}`}>{content}</TableCell>
    </TableRow>
  );
  return <Fragment>
    {props.expanded && !components.length ? <TableRow className="border-b bg-background hover:bg-background print:hidden" data-section="sales-v2-bom-block">
      <TableCell colSpan={props.colSpan} className="p-0">
        <button type="button" className="flex w-full items-center justify-between gap-3 border-l-2 border-primary/30 px-3 py-1.5 text-left hover:bg-muted/20" onClick={props.onToggle}>
          <span className="flex items-center gap-2 text-xs font-semibold">
            {props.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            BOM / vật tư
            {text(preview?.bom_template_code) ? <Badge variant="outline" className="font-mono text-[10px]">{text(preview?.bom_template_code)}</Badge> : null}
          </span>
          <span className={props.line._bomError ? "text-[10px] text-destructive" : "text-[10px] text-muted-foreground"}>{status}</span>
        </button>
      </TableCell>
    </TableRow> : null}
    {props.expanded && props.line._bomError ? infoRow(<span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{props.line._bomError}</span>, "text-foreground") : null}
    {props.expanded && text(preview?.bom_self_reference_warning) ? infoRow(<span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{text(preview?.bom_self_reference_warning)}</span>, "text-destructive") : null}
    {props.expanded && props.line._loading && !components.length ? infoRow(<span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />Đang tính và xổ vật tư BOM…</span>) : null}
    {props.expanded && !props.line._loading && !props.line._bomError && !components.length && !requirements.length && !text(preview?.bom_no)
      ? pendingFields.length
        ? infoRow(<>BOM còn thiếu cấu hình: <strong>{pendingFields.join(", ")}</strong>.</>, "text-destructive")
        : previewReason
          ? infoRow(previewReason, "text-destructive")
          : infoRow(<>Chưa nhận được danh sách cấu thành BOM. Kiểm tra mã trọn bộ và cấu hình BOM của mặt hàng.</>, "text-destructive")
      : null}
    {props.expanded && !components.length && text(preview?.bom_no) ? infoRow(<>BOM áp dụng: <strong className="text-foreground">{text(preview?.bom_no)}</strong></>) : null}
    {props.expanded ? components.map((component, index) => {
      const itemCode = text(component.item_code);
      const itemName = text(props.line._bomComponentNames?.[itemCode]) || itemCode;
      /*
       * Bỏ hẳn `component.note` khỏi màn hình — nó là ghi chú NỘI BỘ (công thức, mã Quy tắc
       * BOM, và cả nguyên văn lỗi kỹ thuật khi công thức chưa tính được) chứ không phải thứ
       * người bán cần đọc. "cắt X m/cây" ở dòng trên đã nói đủ quy cách.
       * `sales_uom_message` thì giữ — đó là cảnh báo THIẾU CẤU HÌNH thật (ĐVT bán chưa khai
       * trên Item), việc người bán phải biết để báo lại, không phải chi tiết công thức.
       */
      const detail = text(component.sales_uom_message);
      const componentKey = text(component.component_key) || itemCode || `component-${index + 1}`;
      /*
       * SỐ CẤU KIỆN, không phải tiêu hao kho.
       *
       * `component_count` là số cây/lá/cái thợ thật sự phải cắt. KHÔNG còn lùi về `set_count`
       * (bỏ 24/08/2026): server gán `set_count = qty_per_set` — số cho MỘT bộ, chưa nhân số bộ —
       * nên nó là con số SAI đội lốt số đúng, và dòng nào cũng có nó nên dấu "?" gần như không bao
       * giờ xuất hiện. Thà để trống rồi hiện "?" đỏ kèm lý do bằng chữ, còn hơn in một số mà thợ
       * cắt theo. `component_count: null` (server đã thử tính, chưa ra) cũng đi cùng đường đó:
       * một dòng lá ghi "1" là nói dối thợ.
       */
      const countError = text(component.component_count_error);
      const componentCount = component.component_count === null
        ? undefined
        : numberValue(component.component_count);
      /*
       * ĐVT ĐẾM trước, ĐVT BÁN sau. `bom_count_uom` là ĐVT giữ nguyên từ dòng định mức
       * (`sales-production-core.ts:1356`) — server CÓ gửi mà client chưa đọc bao giờ. Không có nó
       * thì dòng chưa map Quy tắc BOM rơi thẳng xuống `uom`, vốn đã bị ĐVT BÁN của Item ghi đè
       * thành "Mét"/"m2", nên hai cây ray hiện thành "2 Mét".
       */
      const componentUom = text(component.component_count_uom)
        || text(component.bom_count_uom)
        || text(component.uom);
      /*
       * Lý do phải NÓI RA BẰNG CHỮ, không giấu trong `title`.
       *
       * `bom_rule_warning` ("Chưa map Quy tắc BOM cho X" — `bom-rule-sales-preview.ts:459`) trước
       * đây bị chặn nhầm cùng `note`: quyết định bỏ `note` là đúng với `note`, nhưng đây là cảnh
       * báo THIẾU CẤU HÌNH, cùng loại với `sales_uom_message` chứ không phải chi tiết công thức.
       * Rê chuột mới thấy nghĩa là không ai thấy.
       */
      const canhBao = [
        countError,
        text(component.bom_rule_warning),
        /* Bỏ `set_count` xong thì số dòng hiện "?" tăng lên — mỗi dấu "?" phải kèm một câu đọc được. */
        componentCount === undefined && !countError && !text(component.bom_rule_warning)
          ? "Chưa có số cấu kiện"
          : "",
      ].filter(Boolean).join(" · ");
      const cutEach = numberValue(component.cut_length_each_m);
      const quyCachCat = cutEach === undefined
        ? ""
        : `${quantity(cutEach)} m/${(componentUom || "cái").toLocaleLowerCase("vi")}`;
      const tone = "bg-background";
      const frozen = `${tone} bg-clip-padding`;
      return <TableRow key={`${itemCode}-${componentKey}-${index}`} className={`${tone} border-b hover:bg-muted/10 print:hidden`} data-section="sales-v2-bom-item-row">
        {index === 0 ? <TableCell rowSpan={components.length} style={{ width: props.widths.select, ...props.stickyStyle("select") }} className={`${frozen} border-l-2 border-l-primary/30 px-1 py-1.5 text-center align-middle`}><span className="font-semibold text-muted-foreground">BOM</span></TableCell> : null}
        <TableCell style={{ width: props.widths.index, ...props.stickyStyle("index") }} className={`${frozen} px-1 py-1.5 text-center align-middle font-mono tabular-nums`}>{props.lineNumber}.{index + 1}</TableCell>
        <TableCell style={{ width: props.widths.item_code, ...props.stickyStyle("item_code") }} className={`${frozen} truncate px-1.5 py-1.5 text-center font-mono text-[10px]`} title={itemCode}>{itemCode || "—"}</TableCell>
        <TableCell style={{ width: props.widths.item_name, ...props.stickyStyle("item_name") }} className={`${frozen} px-1.5 py-1.5 text-center`}><div className="truncate font-medium" title={itemName}>{itemName || "—"}</div>{quyCachCat ? <div className="truncate text-[10px] font-medium text-foreground" title={`Quy cách cắt: ${quyCachCat}`}>cắt {quyCachCat}</div> : null}{canhBao ? <div className="text-[10px] font-medium leading-tight text-destructive" title={canhBao}>{canhBao}</div> : null}{detail ? <div className="truncate text-[9px] text-muted-foreground" title={detail}>{detail}</div> : null}</TableCell>
        <TableCell style={{ width: props.widths.color }} className={`${tone} px-1.5 py-1.5 text-center`}>{text(component.color) || "—"}</TableCell>
        {/* Cấu phần BOM không tự bán nên không có cách bán riêng — vẫn phải chiếm một ô, nếu
            không thì mọi cột sau nó lệch một nhịp so với dòng cha. */}
        {props.showPriceVariant ? <TableCell style={{ width: props.widths.price_variant }} className={`${tone} px-1.5 py-1.5 text-center text-muted-foreground`}>—</TableCell> : null}
        {/*
          * Dòng cấu kiện KHÔNG hiện ô số đo nào — các cột đó là số đo của CỬA CHA.
          *
          * Trước đây ô này vừa đổ `component[fieldname]` (số đo cửa cha rò xuống payload cấu kiện),
          * vừa đổ chiều dài cắt vào đúng cột `cut_axis`. Hai thứ khác hẳn nhau nằm chung một cột:
          * dòng cấu kiện rác hiện nguyên "3 · 3 · 3 · 2,97" của cửa cha như thể đó là quy cách của nó,
          * còn lá yếm thì hiện "2,97" ở cột Rộng phủ bì ray — người đọc không phân biệt được số nào
          * là số đo cửa, số nào là số cắt.
          *
          * Chiều dài cắt đã có chỗ đứng riêng và rõ nghĩa hơn: dòng "cắt 2,97 m/lá" ngay dưới tên
          * hàng. Nên các cột số đo ở đây để trống, chỉ giữ ô cho khỏi lệch cột với dòng cha.
          */}
        {props.dynamicColumns.map((fieldname) => (
          <TableCell key={fieldname} style={{ width: props.widths[fieldname] }} className={`${tone} px-1.5 py-1.5 text-center text-muted-foreground`}>—</TableCell>
        ))}
        <TableCell style={{ width: props.widths.quantity }} className={`${tone} px-1.5 py-1.5 text-center font-semibold tabular-nums`}>
          {componentCount === undefined
            ? <span className="text-destructive" title={canhBao || "Chưa xác định được số cấu kiện"}>?</span>
            : quantity(componentCount)}
        </TableCell>
        <TableCell style={{ width: props.widths.uom }} className={`${tone} px-1.5 py-1.5 text-center`}>{componentUom || "—"}</TableCell>
        {props.showStockConversion ? (
          <TableCell style={{ width: props.widths.stock_conversion }} className={`${tone} px-1.5 py-1.5 text-center tabular-nums text-muted-foreground`}>
            {component.stock_qty == null ? "—" : `${quantity(component.stock_qty)} ${text(component.stock_uom)}`.trim()}
          </TableCell>
        ) : null}
        {/*
          Cột "Khối lượng" của dòng cấu kiện KHÔNG hiện số — thừa với dòng "tiêu hao ..." đã có
          sẵn dưới tên hàng (`componentRuleNote`), và người bán/thợ cắt đọc SL + Quy cách cắt là
          đủ. Tổng tiêu hao vẫn còn trong dữ liệu (`stock_consumption_qty`) cho kho/giá thành
          đọc qua API, chỉ không chiếm thêm một ô nhìn trùng ở đây nữa.
        */}
        <TableCell style={{ width: props.widths.priced_qty }} className={`${tone} px-1.5 py-1.5 text-center text-muted-foreground`}>—</TableCell>
        <TableCell style={{ width: props.widths.rate }} className={`${tone} px-1.5 py-1.5 text-center text-muted-foreground`}>—</TableCell>
        <TableCell style={{ width: props.widths.gross_amount }} className={`${tone} px-1.5 py-1.5 text-center text-muted-foreground`}>—</TableCell>
        <TableCell style={{ width: props.widths.actions }} className={`${tone} px-1 py-1.5`} />
      </TableRow>;
    }) : null}
    {props.expanded && requirements.length ? (
      <TableRow className="border-b bg-muted/10 hover:bg-muted/10 print:hidden" data-section="sales-v2-bom-actual">
        <TableCell colSpan={props.colSpan} className="border-l-2 border-primary/30 p-2.5">
          <details open={preview?.actual_complete === false} className="rounded-md border bg-card">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">Vật tư thực tế cần xác nhận {preview?.actual_complete === false ? "· còn thiếu" : "· đã đủ"}</summary>
            <div className="border-t p-2.5"><AlumdoorBomActualEditor requirements={requirements} value={props.line.bom_actual_components ?? []} disabled={props.readOnly || Boolean(props.line._loading)} onChange={(rows) => props.onBomActualChange(props.line._key, rows)} /></div>
          </details>
        </TableCell>
      </TableRow>
    ) : null}
  </Fragment>;
}

export interface AlumdoorSalesOrderLineTableCompleteProps {
  lines: SalesLine[];
  customerGroup: string;
  childMeta: DocTypeMeta | null;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  readOnly: boolean;
  /**
   * Hai cột chỉ dành cho màn XEM LẠI đơn, mặc định TẮT ở màn tạo đơn (yêu cầu chủ xưởng
   * 21/08/2026: lúc tạo đơn không cần "Quy ra tồn" và "Tổng số lá").
   *
   * Cố ý làm công tắc chứ không xoá code: cùng một component dựng cả màn tạo lẫn màn xem đơn đã
   * ghi sổ, mà "Quy ra tồn" là con số duy nhất trả lời "phiếu này rút bao nhiêu khỏi thẻ kho" —
   * xoá sạch là màn xem mất luôn thông tin đó, không lấy lại được. Bên gọi (Workbench) bật
   * `showStockConversionColumn={docstatus === 1}` khi cần.
   *
   * `leaf_count` (Tổng số lá) VẪN được tính và vẫn đi trong payload lưu — công tắc này chỉ ẩn
   * CỘT, không đụng tới giá trị trên dòng.
   */
  showStockConversionColumn?: boolean;
  showLeafCountColumn?: boolean;
  selectedKeys: Set<string>;
  leafVariants: string[];
  onToggleSelection: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onPatch: (key: string, patch: Partial<SalesLine>) => void;
  onCommit: (key: string, field: string, value: unknown) => void;
  onAdd: () => void;
  onAddFive: () => void;
  onAddSuggestedItem: (sourceKey: string, itemCode: string) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
  onDeleteSelected: () => void;
  onBomActualChange: (key: string, rows: BomActualComponentRow[]) => void;
}

export function AlumdoorSalesOrderLineTableComplete(props: AlumdoorSalesOrderLineTableCompleteProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const autoExpanded = useRef<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<ColumnId, number>>(loadStoredWidths);
  /** Lời từ chối khi người bán cố tick "Tặng ray" cho một dòng chưa đủ diện tích. */
  const [giftRailRefusal, setGiftRailRefusal] = useState<Record<string, string>>({});
  /**
   * Quyết định TỰ ĐỘNG gần nhất đã bắn cho từng dòng.
   *
   * Không có nó, mỗi lượt preview trả về (kèm một `props.lines` mới) lại thấy "cần tick" và lại
   * bắn thêm một lượt commit — vòng lặp preview vô tận. Có nó thì mỗi quyết định chỉ bắn một lần
   * cho tới khi điều kiện thật sự đổi.
   */
  const giftRailAutoApplied = useRef<Map<string, string>>(new Map());
  const pendingDynamicValues = useRef<Map<string, unknown>>(new Map());
  const dimensionCommitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dynamicEditKey = (lineKey: string, fieldname: DynamicFieldName) => `${lineKey}\u001f${fieldname}`;
  const flushDynamicCommit = useCallback((lineKey: string, fieldname: DynamicFieldName) => {
    const key = dynamicEditKey(lineKey, fieldname);
    const timer = dimensionCommitTimers.current.get(key);
    if (timer) clearTimeout(timer);
    dimensionCommitTimers.current.delete(key);
    if (!pendingDynamicValues.current.has(key)) return;
    const value = pendingDynamicValues.current.get(key);
    pendingDynamicValues.current.delete(key);
    props.onCommit(lineKey, fieldname, value);
  }, [props.onCommit]);
  const scheduleDimensionCommit = useCallback((lineKey: string, fieldname: DynamicFieldName) => {
    const key = dynamicEditKey(lineKey, fieldname);
    const current = dimensionCommitTimers.current.get(key);
    if (current) clearTimeout(current);
    dimensionCommitTimers.current.set(key, setTimeout(() => flushDynamicCommit(lineKey, fieldname), 300));
  }, [flushDynamicCommit]);
  useEffect(() => () => {
    for (const timer of dimensionCommitTimers.current.values()) clearTimeout(timer);
    dimensionCommitTimers.current.clear();
  }, []);
  useEffect(() => {
    const detailKeys = props.lines
      .filter((line) => {
        const benefits = Array.isArray(line._commercial?.benefit_items) ? line._commercial!.benefit_items!.length : 0;
        return Boolean(doorProductDescription(line, props.customerGroup))
          || mayHaveBom(line)
          || Boolean(line._bomError || line._bomPreview?.bom_no || (line._bomPreview?.components?.length ?? 0) > 0)
          || lineDiscountAmount(line) !== 0
          || lineAdjustmentAmount(line) !== 0
          || benefits > 0
          // Ô tick "Tặng ray" sống trong khối mô tả, nên dòng nào có ô tick đó phải tự mở —
          // nếu không thì lựa chọn duy nhất làm lệch 75.000 đ/m² lại nằm sau một mũi tên.
          || Boolean(lineGiftRailToggle(line))
          || lineCommercialNeedsApproval(line)
          // Thiếu dữ liệu phải lộ ra NGAY lúc chọn hàng, không đợi tới lúc bấm Lưu mới báo.
          || lineBlockingGaps(line).length > 0
          || Boolean(text(line._error) || text(line._pricingError));
      })
      .map((line) => line._key);
    const freshKeys = detailKeys.filter((key) => !autoExpanded.current.has(key));
    if (!freshKeys.length) return;
    for (const key of freshKeys) autoExpanded.current.add(key);
    setExpanded((current) => {
      const next = new Set(current);
      for (const key of freshKeys) next.add(key);
      return next;
    });
  }, [props.customerGroup, props.lines]);

  /**
   * TỰ ĐỘNG tick "Tặng ray" khi đủ diện tích — nhưng KHÔNG bao giờ đè lên tay người bán.
   *
   * Theo quyết định trực tiếp của chủ xưởng 22/08/2026: trên 8 m² thì tự tick và người bán vẫn
   * có thể bỏ tick. Hai vế đó chỉ sống chung được nếu máy phân biệt được "người bán chưa từng
   * chạm ô này" với "đã chạm":
   *
   *   - CHƯA CHẠM (`_giftRailTouched` vắng mặt) ⇒ máy đặt mặc định theo diện tích, và đặt lại
   *     mỗi lần kích thước đổi. Đây là trạng thái của một dòng vừa nhập xong kích thước.
   *   - ĐÃ CHẠM ⇒ máy im lặng VĨNH VIỄN trên dòng đó. Người bán bỏ tick ở 9 m² rồi sửa thành
   *     12 m² thì ô vẫn để trống: quyết định là của người bán, không phải của diện tích.
   *
   * Cờ `_giftRailTouched` chỉ được bật ở đúng một chỗ — handler của ô tick (`setGiftRail`) — và
   * bị xoá khi dòng đổi mặt hàng (mặt hàng mới là một quyết định mới).
   */
  useEffect(() => {
    if (props.readOnly) return;
    for (const line of props.lines) {
      const toggle = lineGiftRailToggle(line);
      if (!toggle) { giftRailAutoApplied.current.delete(line._key); continue; }
      if (line._giftRailTouched) continue;
      // Chưa nhập đủ kích thước ⇒ chưa biết diện tích ⇒ chưa quyết thay người bán.
      if (toggle.area === undefined) continue;
      const want = toggle.eligible ? PRICE_VARIANT_GIFT_RAIL : PRICE_VARIANT_LEAF_ONLY;
      if (linePriceVariant(line).toUpperCase() === want) {
        giftRailAutoApplied.current.set(line._key, want);
        continue;
      }
      if (giftRailAutoApplied.current.get(line._key) === want) continue;
      giftRailAutoApplied.current.set(line._key, want);
      props.onPatch(line._key, { price_variant: want });
      props.onCommit(line._key, "price_variant", want);
    }
  }, [props.lines, props.onCommit, props.onPatch, props.readOnly]);

  /**
   * Bật/tắt ô tick "Tặng ray".
   *
   * Dưới ngưỡng mà vẫn cố tick ⇒ CHẶN (không ghi gì xuống dòng) và NÓI RÕ vì sao — chốt chủ
   * xưởng: "chặn cảnh báo". Ghi `price_variant` phải đi hai bước `onPatch` → `onCommit`, vì
   * `commitLine` lấy giá trị MỚI NHẤT trên dòng chứ không lấy tham số truyền vào; chỉ gọi
   * `onCommit` thì một dòng đã có `TANG_RAY` sẽ không bao giờ bỏ tick được.
   */
  const setGiftRail = useCallback((line: SalesLine, next: boolean) => {
    const toggle = lineGiftRailToggle(line);
    if (!toggle) return;
    if (next && !toggle.eligible) {
      setGiftRailRefusal((current) => ({
        ...current,
        [line._key]: toggle.area === undefined
          ? `Chưa nhập đủ kích thước nên chưa biết dòng này có ${toggle.operator === "GTE" ? "đạt" : "vượt"} ${quantity(toggle.minArea)} m² hay không — chưa tick tặng ray được.`
          : `Không tick được: cửa ${quantity(toggle.area)} m²/bộ chưa ${toggle.operator === "GTE" ? "đạt" : "vượt"} ${quantity(toggle.minArea)} m². Dòng vẫn giữ đơn giá chỉ lá.`,
      }));
      return;
    }
    setGiftRailRefusal((current) => {
      if (!current[line._key]) return current;
      const nextState = { ...current };
      delete nextState[line._key];
      return nextState;
    });
    const variant = next ? PRICE_VARIANT_GIFT_RAIL : PRICE_VARIANT_LEAF_ONLY;
    props.onPatch(line._key, { price_variant: variant, _giftRailTouched: true });
    props.onCommit(line._key, "price_variant", variant);
  }, [props.onCommit, props.onPatch]);

  /** Ô tick "Có bắn bướm" — cùng đường ghi hai bước như ô tick "Tặng ray". */
  const setButterflyBracket = useCallback((line: SalesLine, next: boolean) => {
    const value = next ? 1 : 0;
    props.onPatch(line._key, { has_butterfly_bracket: value });
    props.onCommit(line._key, "has_butterfly_bracket", value);
  }, [props.onCommit, props.onPatch]);

  /**
   * Ô tick "Sơn ray" — bỏ tick thì ray về THÔ và server dừng gọi phụ thu (xem
   * `previewLine`: điều kiện gọi `alumdoor.sales.ray_paint_surcharge` đòi cả hai
   * `ray_painted` và `ray_color`). Bỏ tick nên xoá luôn màu đã chọn, để không giữ một màu ẩn
   * mà không ai nhìn thấy rồi tính nhầm nếu người bán tick lại sau.
   */
  const setRayPainted = useCallback((line: SalesLine, next: boolean) => {
    const value = next ? 1 : 0;
    const patch = next ? { ray_painted: value } : { ray_painted: value, ray_color: undefined };
    props.onPatch(line._key, patch);
    props.onCommit(line._key, "ray_painted", value);
  }, [props.onCommit, props.onPatch]);

  const setRayColor = useCallback((line: SalesLine, next: string | undefined) => {
    props.onPatch(line._key, { ray_color: next });
    props.onCommit(line._key, "ray_color", next);
  }, [props.onCommit, props.onPatch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(widths)); } catch { /* optional preference */ }
  }, [widths]);

  const childFieldByName = useMemo(() => new Map((props.childMeta?.fields ?? []).map((field) => [field.fieldname, field])), [props.childMeta]);
  const itemField = useMemo<DocField>(() => ({
    ...(childFieldByName.get("item_code") ?? fallbackField("item_code", "Mã hàng", "Link", "Item")),
    fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Item", allow_create: false,
    link_filters: JSON.stringify({ is_sales_item: 1, disabled: 0 }),
  } as DocField), [childFieldByName]);
  const discountField = fieldFromMeta(props.childMeta, "discount_percentage", "Chiết khấu %", "Percent");

  const activeLines = useMemo(() => props.lines.filter((line) => text(line.item_code)), [props.lines]);
  const dynamicOptions = useMemo(
    () => ({ customerGroup: props.customerGroup, showLeafCountColumn: props.showLeafCountColumn }),
    [props.customerGroup, props.showLeafCountColumn],
  );
  const visibleDynamicField = useCallback(
    (line: SalesLine, fieldname: DynamicFieldName) => dynamicFieldVisible(line, fieldname, dynamicOptions),
    [dynamicOptions],
  );
  const dynamicColumns = useMemo(
    () => resolveDynamicColumns(activeLines, dynamicOptions),
    [activeLines, dynamicOptions],
  );
  /**
   * Hai cột kho chỉ hiện khi có dòng thật sự cần tới.
   *
   * Nhóm ray/trục mua Kg · tồn Cây/Kg · bán Mét: một dòng phải đọc được cả hai con số song song.
   * Nhưng đơn toàn phụ kiện bán đúng ĐVT tồn thì hai cột này chỉ tổ chiếm chỗ, nên chúng đi theo
   * cùng luật với cột thông số động: có dữ liệu mới xuất hiện.
   */
  const showStockConversion = useMemo(
    () => Boolean(props.showStockConversionColumn)
      && activeLines.some((line) => lineNeedsUomConversion(line) || lineStockQty(line) !== undefined),
    [activeLines, props.showStockConversionColumn],
  );
  /**
   * Ảnh mặt hàng chỉ chiếm chỗ khi THẬT SỰ có ảnh.
   *
   * 21/08/2026 chưa có nguồn ảnh nào (xem `lineItemImage`), nên hôm nay khối này im lặng và lưới
   * không đổi. Ngày brief bổ sung trường ảnh cho `Item` thì nó tự sáng lên, không phải sửa lưới.
   */
  const showItemImages = useMemo(
    () => activeLines.some((line) => Boolean(lineItemImage(line))),
    [activeLines],
  );
  /**
   * Cột "Mã giá" đi theo cùng luật với cột thông số động: CÓ DỮ LIỆU MỚI XUẤT HIỆN.
   *
   * 202/224 cặp (mã + ĐVT) chỉ có một cách bán — với chúng không có gì để chọn, và một cột luôn
   * hiện với đúng một lựa chọn là một cột chiếm chỗ mà không trả lời câu hỏi nào. Cột chỉ bật
   * khi trong đơn có ít nhất một dòng thật sự phải quyết.
   */
  const showPriceVariant = useMemo(
    () => activeLines.some((line) => linePriceVariantOptions(line).length > 1),
    [activeLines],
  );
  const columnOrder = useMemo<ColumnId[]>(() => [
    "select", "index", "item_code", "item_name", "color",
    ...(showPriceVariant ? (["price_variant"] as ColumnId[]) : []),
    ...dynamicColumns,
    "quantity", "uom",
    ...(showStockConversion ? (["stock_conversion"] as ColumnId[]) : []),
    "priced_qty", "rate", "gross_amount", "actions",
  ], [dynamicColumns, showPriceVariant, showStockConversion]);
  const columnCount = columnOrder.length;
  const totalWidth = columnOrder.reduce((sum, id) => sum + widths[id], 0);
  const allSelected = props.lines.length > 0 && props.selectedKeys.size === props.lines.length;
  const partlySelected = props.selectedKeys.size > 0 && !allSelected;

  /**
   * Đơn vị đứng riêng một cột (`DYNAMIC_HEADER_UNITS`), nên đơn vị ghim sẵn trong nhãn server
   * gửi lên phải gỡ ra, nếu không tiêu đề lặp đơn vị hai lần.
   *
   * Trước đây chỉ gỡ đúng chữ `(m)` — vì cột mẫu ban đầu chỉ tình cờ mang unit viết tắt đó.
   * Master Geometry Field lưu đơn vị đầy đủ (`"Mét"`, không phải `"m"`), nên MỌI cột hình học
   * đều đang lặp đơn vị (`"Cao phủ bì (Mét)"` rồi lại `"(m)"` ở dòng dưới) — chỉ là không ai để
   * ý cho tới khi một nhãn mới ("Cao (mua vào)") khiến người dùng nhìn kỹ tiêu đề hơn.
   */
  const dynamicHeaderLabel = (fieldname: DynamicFieldName): string => {
    const contextual = activeLines.map((line) => fieldLabel(line, props.childMeta, fieldname, "")).find(Boolean);
    return text(contextual).replace(/\s*\((m|mét|kg|m2|m²)\)\s*$/i, "").replace(/\s+/g, " ") || DYNAMIC_FALLBACK_LABELS[fieldname];
  };

  const stickyLeft = (id: ColumnId) => {
    if (!FROZEN_COLUMNS.includes(id)) return undefined;
    let left = 0;
    for (const column of columnOrder) {
      if (column === id) break;
      left += widths[column];
    }
    return left;
  };
  const stickyStyle = (id: ColumnId, header = false): CSSProperties => {
    const left = stickyLeft(id);
    return left === undefined ? {} : { position: "sticky", left, zIndex: header ? 32 : 12 };
  };

  const beginResize = (id: ColumnId, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[id];
    const min = MIN_WIDTHS[id] ?? 64;
    const onMove = (move: PointerEvent) => {
      const next = Math.max(min, Math.min(520, startWidth + move.clientX - startX));
      setWidths((current) => current[id] === next ? current : { ...current, [id]: next });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const head = (id: ColumnId, label: ReactNode, unit?: string) => (
    <TableHead
      key={id}
      style={{ width: widths[id], minWidth: widths[id], maxWidth: widths[id], ...stickyStyle(id, true) }}
      className="relative bg-primary px-1.5 text-center font-semibold leading-tight text-primary-foreground whitespace-normal"
    >
      <div className="relative flex h-full min-h-10 items-center justify-center py-1">
        <span className="flex min-w-0 flex-1 flex-col items-center justify-center whitespace-normal break-words text-center leading-tight">
          <span>{label}</span>
          {unit ? <span className="mt-0.5 text-[9px] font-medium normal-case opacity-90">({unit})</span> : null}
        </span>
        {!(["select", "actions"] as ColumnId[]).includes(id) ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Đổi độ rộng cột ${typeof label === "string" ? label : id}`}
            onPointerDown={(event) => beginResize(id, event)}
            className="absolute -right-2 top-0 z-40 h-full w-4 cursor-col-resize touch-none select-none"
          />
        ) : null}
      </div>
    </TableHead>
  );

  const dynamicField = (line: SalesLine, fieldname: DynamicFieldName): DocField => {
    const fallbackLabel = DYNAMIC_FALLBACK_LABELS[fieldname];
    const label = fieldLabel(line, props.childMeta, fieldname, fallbackLabel);
    const metaField = childFieldByName.get(fieldname);
    let field = fieldFromMeta(props.childMeta, fieldname, fallbackLabel, DYNAMIC_FALLBACK_TYPES[fieldname]);
    if (fieldname === "leaf_variant") field = selectField(metaField, fieldname, label, props.leafVariants);
    else field = { ...field, label } as DocField;
    if (fieldname === "motor_model" && !field.options) field = { ...field, fieldtype: "Link", options: "Item" } as DocField;
    return field;
  };

  const renderDynamicCell = (line: SalesLine, fieldname: DynamicFieldName, rowTone: string) => {
    const visible = visibleDynamicField(line, fieldname);
    const field = dynamicField(line, fieldname);
    const readOnly = props.readOnly || FORCE_READ_ONLY.has(fieldname) || fieldReadonly(line, fieldname);
    const required = fieldRequired(line, fieldname);
    const value = line[fieldname];
    return (
      <TableCell
        key={fieldname}
        style={{ width: widths[fieldname], minWidth: widths[fieldname], maxWidth: widths[fieldname] }}
        className={`${rowTone} overflow-hidden px-1.5 py-1.5 text-center align-middle`}
      >
        {!visible ? <span aria-label="Không áp dụng" className="text-muted-foreground">—</span> : readOnly ? (
          <div className="flex h-8 items-center justify-center truncate text-center tabular-nums" title={dynamicDisplayValue(fieldname, value)}>{dynamicDisplayValue(fieldname, value) || "—"}</div>
        ) : (
          <GridField rowKey={line._key} columnId={fieldname} disabled={readOnly}>
            <AlumdoorSalesOrderField
              id={`sales-v2-complete-${line._key}-${fieldname}`}
              field={field}
              value={value}
              onChange={(nextValue) => {
                const normalizedValue = normalizeFieldValue(field, nextValue);
                props.onPatch(line._key, { [fieldname]: normalizedValue });
                const key = dynamicEditKey(line._key, fieldname);
                if (["Select", "Link", "Check"].includes(field.fieldtype)) {
                  pendingDynamicValues.current.delete(key);
                  props.onCommit(line._key, fieldname, normalizedValue);
                } else {
                  pendingDynamicValues.current.set(key, normalizedValue);
                  if (["width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "mesh_height_m"].includes(fieldname) && numberValue(normalizedValue) !== undefined) scheduleDimensionCommit(line._key, fieldname);
                }
              }}
              onCommit={() => flushDynamicCommit(line._key, fieldname)}
              registry={props.registry}
              services={props.services}
              parentDoctype="Sales Order Item"
              docValues={line}
              roles={props.roles}
              required={required}
              readOnly={readOnly}
              compact
              hideLabel
              className={field.fieldtype === "Check"
                ? "w-full max-w-full [&_.mf-control]:!size-4 [&_button]:!size-4"
                : "w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!text-center [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center"}
            />
          </GridField>
        )}
      </TableCell>
    );
  };

  /**
   * "Mã giá" — chọn DÒNG GIÁ nào, không phải giảm bao nhiêu.
   *
   * Ô này chỉ hiện lựa chọn mà mặt hàng THẬT SỰ có, kèm đúng đơn giá của từng cách. Đơn giá đi
   * kèm là phần quan trọng nhất: không có nó thì người bán phải tự dịch `TANG_RAY` và `CHI_LA`
   * sang tiếng Việt trong đầu rồi đoán cái nào đắt hơn — hai mã đó lệch 75.000 đ/m², tức 675.000 đ
   * trên một bộ 9 m².
   *
   * Chưa chọn thì nói thẳng "chưa chọn cách bán" và KHÔNG ra tiền. Đây là chỗ duy nhất trong
   * dòng mà im lặng sẽ ra một con số sai chứ không phải ra số 0.
   */
  const renderPriceVariantCell = (line: SalesLine, rowTone: string) => {
    const options = linePriceVariantOptions(line);
    const chosen = linePriceVariant(line);
    const required = linePriceVariantRequired(line);
    // GIÁ TRỊ vẫn là mã thô (server tra giá theo đúng mã đó); chỉ NHÃN được Việt hoá.
    const field = {
      ...selectField(
        childFieldByName.get("price_variant"),
        "price_variant",
        "Mã giá",
        options.map((option) => text(option.price_variant)).filter(Boolean),
      ),
      optionLabels: priceVariantOptionLabels(options),
    } as DocField;
    const hint = options.map(priceVariantOptionLabel).join(" · ");
    const railToggle = lineGiftRailToggle(line);
    return (
      <TableCell
        key="price_variant"
        style={{ width: widths.price_variant, minWidth: widths.price_variant, maxWidth: widths.price_variant }}
        className={`${rowTone} overflow-hidden px-1.5 py-1.5 text-center align-middle`}
      >
        {options.length <= 1 ? (
          /* Một cách bán (hoặc chưa đọc được danh sách) ⇒ không có gì để quyết. Vẫn in ra cách
             bán đang dùng để dòng tự giải thích được, nhưng không dựng ô chọn giả. */
          <div className="flex h-8 items-center justify-center truncate text-muted-foreground" title={hint || chosen}>{priceVariantLabel(chosen) || "—"}</div>
        ) : railToggle ? (
          /* Đúng hai dòng giá TANG_RAY/CHI_LA ⇒ ô quyết định là Ô TICK ở khối mô tả bên dưới
             (yêu cầu chủ xưởng 21/08/2026). Ở đây chỉ ĐỌC lại kết quả — hai chỗ cùng một ô chọn
             thì người bán không biết chỗ nào mới là chỗ thật. */
          <div className="flex flex-col items-center justify-center leading-tight" title={hint}>
            {railToggle.undecided ? (
              <span className="text-[10px] font-medium text-destructive">chưa chọn cách bán</span>
            ) : (
              <span className="truncate font-medium">{priceVariantLabel(chosen)}</span>
            )}
            <span className="text-[9px] text-muted-foreground">tick "Tặng ray" ở dòng mô tả</span>
          </div>
        ) : (
          <div className="flex flex-col items-stretch gap-0.5">
            <GridField rowKey={line._key} columnId="price_variant" disabled={props.readOnly}>
              <AlumdoorSalesOrderField
                id={`sales-v2-complete-price-variant-${line._key}`}
                field={field}
                value={chosen}
                onChange={(value) => props.onCommit(line._key, "price_variant", text(value) || undefined)}
                registry={props.registry}
                services={props.services}
                parentDoctype="Sales Order Item"
                docValues={line}
                roles={props.roles}
                required
                readOnly={props.readOnly}
                compact
                hideLabel
                className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!text-center [&_button]:!h-8 [&_button]:!w-full [&_button]:!justify-center [&_button]:!px-1"
              />
            </GridField>
            {required ? (
              <span className="truncate text-[9px] font-medium text-destructive" title={hint}>chưa chọn cách bán</span>
            ) : (
              <span className="truncate text-[9px] text-muted-foreground" title={hint}>{
                priceVariantOptionLabel(options.find((option) => text(option.price_variant) === chosen) ?? options[0]!)
              }</span>
            )}
          </div>
        )}
      </TableCell>
    );
  };

  /**
   * "Quy ra tồn" — số SẼ vào thẻ kho. Server tính (`qty × conversion_factor`); ở đây chỉ in ra.
   *
   * Thiếu hệ số quy đổi thì nói THIẾU, không nhân bừa với 1. Hệ số Mét→Cây của nhóm ray/trục
   * đang cố ý để trống theo quyết định danh mục 19/08, nên đây là trạng thái bình thường phải
   * đọc được, không phải sự cố.
   */
  const renderStockConversionCell = (line: SalesLine, rowTone: string) => {
    const stockUom = lineStockUom(line);
    const stockQty = lineStockQty(line);
    const factor = lineConversionFactor(line);
    const delivered = lineDeliveredQty(line);
    const uomGap = lineUomGap(line);
    const catchWeight = lineIsCatchWeight(line);
    // Server nói trước; suy đoán ở client chỉ đỡ cho payload chưa có `uom_gap`.
    const missing = lineMissingUomConversion(line);
    const missingReason = text(uomGap?.message)
      || `Chưa khai hệ số quy đổi ${lineSalesUom(line)} → ${stockUom}.`;
    const missingFix = text(uomGap?.fix_where) || "Danh mục → Hàng hoá/Vật tư → Quy đổi đơn vị";
    // "Chờ chủ xưởng chốt" và "lỗi cấu hình" phải TRÔNG khác nhau: một cái là ô đang đợi người
    // điền, cái kia là thứ hỏng cần báo. Cùng một màu đỏ thì người bán không phân biệt được.
    const intentional = uomGap?.intentional === true;
    return (
      <TableCell
        key="stock_conversion"
        style={{ width: widths.stock_conversion, minWidth: widths.stock_conversion, maxWidth: widths.stock_conversion }}
        className={`${rowTone} overflow-hidden px-1.5 py-1.5 text-center align-middle`}
      >
        {!text(line.item_code) ? <span className="text-muted-foreground">—</span> : catchWeight && stockQty === undefined ? (
          /* Cân thực tế: KHÔNG có hệ số cố định, và đó là đúng luật — xem `lineIsCatchWeight`. */
          <div className="flex flex-col items-center justify-center leading-tight text-muted-foreground" title="Hàng cân thực tế: tiền theo Kg, tồn theo cây. Không có hệ số quy đổi cố định — cân từng chuyến mới ra số.">
            <span className="text-[10px] font-medium">cân thực tế</span>
            <span className="text-[9px]">không có hệ số cố định</span>
          </div>
        ) : missing ? (
          <div
            className={`flex flex-col items-center justify-center leading-tight ${intentional ? "text-amber-600" : "text-destructive"}`}
            title={`${missingReason} Khai ở ${missingFix}.`}
          >
            <AlertTriangle className="size-3.5" />
            <span className="text-[9px] font-medium">{intentional ? "chờ khai hệ số" : "chưa khai hệ số"}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center leading-tight">
            <span className="font-medium tabular-nums">{stockQty === undefined ? "—" : `${quantity(stockQty)} ${stockUom}`.trim()}</span>
            {factor !== undefined && lineNeedsUomConversion(line)
              ? <span className="text-[9px] text-muted-foreground">1 {lineSalesUom(line)} = {quantity(factor)} {stockUom}</span>
              : null}
            {delivered !== undefined && delivered > 0
              ? <span className="text-[9px] text-muted-foreground">đã giao {quantity(delivered)}</span>
              : null}
          </div>
        )}
      </TableCell>
    );
  };

  return <section className="overflow-hidden rounded-lg border-2 border-border bg-card" data-section="sales-v2-lines-complete">
    <div className="overflow-x-auto">
      <Table
        unwrapped
        className="table-fixed text-center text-[11px] [&_td]:border-r-[1.5px] [&_td]:border-border/90 [&_td:last-child]:border-r-0 [&_th]:border-r-[1.5px] [&_th]:border-border/90 [&_th:last-child]:border-r-0"
        style={{ width: `max(100%, ${totalWidth}px)` }}
      >
        <colgroup>{columnOrder.map((id) => <col key={id} style={{ width: widths[id] }} />)}</colgroup>
        <TableHeader className="sticky top-0 z-30 border-b-[3px] border-primary/70 bg-primary">
          <TableRow className="border-b-[3px] border-primary/70 bg-primary hover:bg-primary">
            {head("select", <Checkbox className="border-primary-foreground/80 bg-background data-[state=checked]:border-primary-foreground" checked={allSelected ? true : partlySelected ? "indeterminate" : false} onCheckedChange={(value) => props.onToggleAll(value === true)} aria-label="Chọn tất cả dòng hàng" />)}
            {head("index", "STT")}
            {head("item_code", "Mã hàng")}
            {head("item_name", "Tên hàng")}
            {head("color", "Màu")}
            {showPriceVariant ? head("price_variant", "Mã giá") : null}
            {dynamicColumns.map((fieldname) => head(fieldname, dynamicHeaderLabel(fieldname), DYNAMIC_HEADER_UNITS[fieldname]))}
            {head("quantity", "SL")}
            {head("uom", "ĐVT")}
            {showStockConversion ? head("stock_conversion", "Quy ra tồn") : null}
            {head("priced_qty", "Khối lượng")}
            {head("rate", "Đơn giá", "VNĐ")}
            {head("gross_amount", "Thành tiền", "VNĐ")}
            {head("actions", "")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.lines.map((line, rowIndex) => {
            const quantityField = primaryQuantityField(line);
            const pricedQty = linePricedQuantity(line);
            const directOrdinaryQuantity = isDirectOrdinaryQuantityLine(line);
            const allowedColors = line._allowedColors ?? [];
            const allowedUoms = Array.isArray(line._context?.allowed_uoms) ? line._context!.allowed_uoms! : [];
            const colorField = selectField(childFieldByName.get("color"), "color", "Màu", allowedColors, line._colorLabels);
            const uomField = selectField(childFieldByName.get("uom"), "uom", "ĐVT", allowedUoms);
            const quantityDocField = fieldFromMeta(props.childMeta, quantityField, quantityField === "set_count" ? "Số bộ" : "Số lượng", quantityField === "set_count" ? "Int" : "Float");
            const rowError = text(line._error) || text(line._pricingError);
            const benefits = Array.isArray(line._commercial?.benefit_items) ? line._commercial!.benefit_items! : [];
            const parentRowTone = text(line.item_code) ? "bg-primary/[0.035]" : (rowIndex % 2 === 0 ? "bg-card" : "bg-muted/20");
            const commercialRowTone = rowIndex % 2 === 0 ? "bg-card" : "bg-muted/20";
            const needsApproval = lineCommercialNeedsApproval(line);
            const discountNeedsApproval = lineDiscountNeedsApproval(line);
            const policyDiscount = linePolicyDiscountPercentage(line);
            const enteredDiscount = numberValue(line.discount_percentage ?? line._commercial?.discount_percentage) ?? policyDiscount;
            const discountAmount = lineDiscountAmount(line);
            const adjustmentSplit = lineAdjustmentSplit(line);
            const discountTotal = lineDiscountTotal(line);
            const sellingRate = numberValue(line._commercial?.selling_rate) ?? numberValue(line.rate);
            const grossAmount = numberValue(line._commercial?.gross_amount)
              ?? (pricedQty !== undefined && sellingRate !== undefined ? pricedQty * sellingRate : numberValue(line.amount));
            const payable = lineNetAmount(line);
            const ruleNames = appliedRuleNames(line);
            const surchargeNames = surchargeRuleNames(line);
            const descriptionGroups = doorProductGroups(line, props.customerGroup);
            const productDescription = doorProductDescription(line, props.customerGroup);
            const promoLabels = promoChips(line);
            const railToggle = lineGiftRailToggle(line);
            const butterflyToggle = lineButterflyToggle(line);
            const rayToggle = lineRayPaintToggle(line);
            const raySurcharge = line._raySurcharge;
            /*
             * Màu ray KHÔNG dùng lại `allowedColors` của chính cửa: đó là phạm vi Bề mặt của
             * mặt hàng cửa, còn ray thuộc nhóm "Ray và trục" — phạm vi khác. Chưa có đường lấy
             * đúng phạm vi ray cho một dòng Trọn bộ (ray là cấu kiện ẩn trong BOM, không phải
             * mặt hàng độc lập), nên để Link mở toàn danh mục Màu thay vì Select rỗng.
             */
            const rayColorField: DocField = {
              ...(childFieldByName.get("ray_color") ?? fallbackField("ray_color", "Màu ray", "Link", "Item Color")),
              fieldname: "ray_color", label: "Màu ray", fieldtype: "Link", options: "Item Color",
            } as DocField;
            /* Quà "tặng ray" chỉ được kể MỘT LẦN. Server trả nó về trong `benefit_items`, còn ô
               tick ngay cạnh đã mang đúng chữ "Tặng ray" — in cả hai ra đúng cái lỗi chủ xưởng
               chụp lại. Giữ ô tick (vì nó còn BẤM được), và mượn số lượng của quà đặt cạnh nó. */
            const giftRailBenefit = railToggle
              ? benefits.find((benefit) => /GIFT[-_]?RAIL/i.test(text(benefit.source_rule)))
              : undefined;
            const shownBenefits = giftRailBenefit ? benefits.filter((benefit) => benefit !== giftRailBenefit) : benefits;
            const itemImage = lineItemImage(line);
            const itemImageAlt = `Ảnh mặt hàng ${text(line._itemName) || text(line.item_code) || ""}`.trim();
            const hasAuxiliaryRow = Boolean(text(line.item_code));
            const auxiliaryDescription = productDescription || text(line._itemName) || text(line.item_code);
            // Giải trình giá và danh sách thiếu đều đọc thẳng ảnh chụp server; không tính lại gì.
            const explanation = linePriceExplanation(line);
            const gaps = lineBlockingGaps(line);
            const warnings = lineCatalogWarnings(line);
            const availabilityStatus = lineAvailabilityStatus(line);
            const frozenClass = `${parentRowTone} bg-clip-padding`;
            const commercialLeadSpan = Math.max(1, columnCount - 4);

            const inKhuyenMai = moTaKhuyenMai(line);

            return <Fragment key={line._key}>
              <TableRow className={`${parentRowTone} [&>td]:border-b-0`} data-sales-row={line._key}>
                <TableCell style={{ width: widths.select, ...stickyStyle("select") }} className={`${frozenClass} px-1 py-1.5 text-center`}><Checkbox checked={props.selectedKeys.has(line._key)} onCheckedChange={(value) => props.onToggleSelection(line._key, value === true)} aria-label={`Chọn dòng ${rowIndex + 1}`} /></TableCell>
                <TableCell style={{ width: widths.index, ...stickyStyle("index") }} className={`${frozenClass} px-1 py-1.5 text-center tabular-nums`}>
                  <div className="flex items-center justify-center gap-1">
                    {/* Mũi tên bung dòng và biểu tượng trạng thái là thao tác/tín hiệu nội bộ —
                        bản in chỉ cần con số thứ tự. */}
                    {hasAuxiliaryRow ? <button type="button" className="grid size-5 place-items-center rounded hover:bg-muted print:hidden" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(line._key)) next.delete(line._key); else next.add(line._key); return next; })} aria-label={`${expanded.has(line._key) ? "Thu gọn" : "Mở"} chi tiết dòng ${rowIndex + 1}`}>{expanded.has(line._key) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</button> : null}
                    <span>{rowIndex + 1}</span>
                    <span className="inline-flex print:hidden">{line._loading ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : rowError ? <AlertTriangle className="size-3 text-destructive" /> : needsApproval ? <AlertTriangle className="size-3" /> : text(line.item_code) ? <CheckCircle2 className="size-3 text-muted-foreground" /> : null}</span>
                  </div>
                </TableCell>
                <TableCell style={{ width: widths.item_code, ...stickyStyle("item_code") }} className={`${frozenClass} px-1.5 py-1.5 text-center align-middle`}>
                  <GridField rowKey={line._key} columnId="item_code" disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-item-${line._key}`} field={itemField} value={line.item_code} onChange={(value) => props.onCommit(line._key, "item_code", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!text-center [&_button]:!h-8 [&_button]:!justify-center" /></GridField>
                </TableCell>
                <TableCell style={{ width: widths.item_name, ...stickyStyle("item_name") }} className={`${frozenClass} px-1.5 py-1.5 text-center align-middle`}>
                  {/* Ảnh chỉ chen vào khi đơn thật sự có ảnh — xem `showItemImages`. Nó nằm
                      TRONG ô tên hàng chứ không mở thêm cột, để không đẩy lệch vùng tiền. */}
                  <div className={showItemImages ? "flex min-w-0 items-center gap-1.5 text-left" : "min-w-0"}>
                    {showItemImages ? <ItemImage src={itemImage} alt={itemImageAlt} size={22} /> : null}
                    <div className={`min-w-0 flex-1 truncate font-medium leading-4 ${showItemImages ? "text-left" : "text-center"}`} title={text(line._itemName) || text(line.item_code)}>{text(line._itemName) || text(line.item_code) || "—"}</div>
                  </div>
                  {/* "Còn N Mét · Giá Mét: 55.000 VND" — server đã dựng sẵn chuỗi này từ đợt đầu
                      nhưng bản Complete đánh rơi nó. Đây là câu duy nhất trả lời tại chỗ hai câu
                      hỏi trước khi hứa với khách: còn hàng không, và có giá chưa. */}
                  {/* `print:hidden` — dòng này là tồn kho + đơn giá nội bộ. Hữu ích cho người bán,
                      nhưng bản in có ô ký của khách, không đưa số tồn và giá mét ra ngoài. */}
                  {availabilityStatus ? <div className="mt-0.5 line-clamp-2 text-[9px] leading-3 text-muted-foreground print:hidden" title={availabilityStatus}>{availabilityStatus}</div> : null}

                  {/* MÔ TẢ SẢN PHẨM — khi IN thì nằm NGAY TRONG ô Tên hàng (mẫu chủ xưởng duyệt),
                      không chiếm một dòng riêng như trên màn. Cùng nguồn `descriptionGroups` mà
                      màn đang dùng, nên không thể lệch. */}
                  <div data-print-desc className="hidden font-normal leading-[1.25] print:block">
                    {[
                      ...(descriptionGroups.length
                        ? descriptionGroups.map((group) => `${group.label}: ${group.items.join(" · ")}`)
                        : [auxiliaryDescription]),
                      // Khuyến mại/ray thô đi CÙNG mô tả mặt hàng, không đẩy xuống dòng chiết
                      // khấu: dòng nào không có chiết khấu thì dòng đó biến mất hẳn.
                      ...inKhuyenMai,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
                <TableCell style={{ width: widths.color }} className={`${parentRowTone} px-1.5 py-1.5 text-center align-middle`}>{allowedColors.length && !fieldHidden(line, "color") ? <GridField rowKey={line._key} columnId="color" disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-color-${line._key}`} field={colorField} value={line.color} onChange={(value) => props.onCommit(line._key, "color", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!text-center [&_button]:!h-8 [&_button]:!justify-center" /></GridField> : <div className="flex h-8 items-center justify-center truncate text-center text-muted-foreground">{text(line.color)}</div>}</TableCell>
                {showPriceVariant ? renderPriceVariantCell(line, parentRowTone) : null}
                {dynamicColumns.map((fieldname) => renderDynamicCell(line, fieldname, parentRowTone))}
                <TableCell style={{ width: widths.quantity }} className={`${parentRowTone} px-1.5 py-1.5 text-center align-middle`}><GridField rowKey={line._key} columnId="quantity" disabled={props.readOnly || fieldReadonly(line, quantityField)}><AlumdoorSalesOrderField id={`sales-v2-complete-qty-${line._key}`} field={quantityDocField} value={line[quantityField]} onChange={(value) => {
                  const nextQuantity = value == null || value === "" ? undefined : Number(value);
                  props.onPatch(line._key, directOrdinaryQuantity
                    ? { [quantityField]: nextQuantity, qty: nextQuantity }
                    : { [quantityField]: nextQuantity });
                  // SL là đầu vào tính tiền/BOM nên phải chạy lifecycle ngay khi đổi,
                  // không chờ người dùng blur khỏi ô rồi mới nhân đơn giá.
                  props.onCommit(line._key, quantityField, nextQuantity);
                }} onCommit={() => props.onCommit(line._key, quantityField, line[quantityField])} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required={fieldRequired(line, quantityField) || isAreaDoor(line)} readOnly={props.readOnly || fieldReadonly(line, quantityField)} compact hideLabel className="mx-auto [&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_input]:!text-center" /></GridField></TableCell>
                <TableCell style={{ width: widths.uom }} className={`${parentRowTone} overflow-hidden px-1 py-1.5 text-center align-middle`}>{allowedUoms.length > 1 ? <GridField rowKey={line._key} columnId="uom" disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-uom-${line._key}`} field={uomField} value={line.uom} onChange={(value) => props.onCommit(line._key, "uom", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!text-center [&_button]:!h-8 [&_button]:!w-full [&_button]:!justify-center [&_button]:!px-1" /></GridField> : <span className="inline-flex h-8 items-center justify-center">{text(line.uom) || text(line._context?.selected_uom) || "—"}</span>}</TableCell>
                {showStockConversion ? renderStockConversionCell(line, parentRowTone) : null}
                <TableCell style={{ width: widths.priced_qty }} className={`${parentRowTone} px-1.5 py-1.5 text-center align-middle tabular-nums`}><div className="font-semibold text-primary">{pricedQty === undefined ? "—" : quantity(pricedQty)}</div></TableCell>
                <TableCell style={{ width: widths.rate }} className={`${parentRowTone} px-1.5 py-1.5 text-center align-middle`}><div className="flex h-8 items-center justify-center font-medium tabular-nums" title="Đơn giá tự động theo bảng giá">{numberValue(line.rate) === undefined ? "—" : money(line.rate)}</div></TableCell>
                <TableCell style={{ width: widths.gross_amount }} className={`${parentRowTone} px-1.5 py-1.5 text-center align-middle tabular-nums`}><strong>{grossAmount === undefined ? "—" : `${money(grossAmount)} ₫`}</strong></TableCell>
                <TableCell style={{ width: widths.actions }} className={`${parentRowTone} px-1 py-1.5 text-center align-middle`}><div className="flex items-center justify-center"><Button type="button" variant="ghost" size="icon-sm" disabled={props.readOnly || !text(line.item_code)} onClick={() => props.onDuplicate(line._key)} title="Nhân bản" aria-label={`Nhân bản dòng ${rowIndex + 1}`}><Copy className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={props.readOnly || props.lines.length <= 1} onClick={() => props.onDelete(line._key)} title="Xóa" aria-label={`Xóa dòng ${rowIndex + 1}`}><Trash2 className="size-3.5" /></Button></div></TableCell>
              </TableRow>

              <BomBlock line={line} lineNumber={rowIndex + 1} expanded={expanded.has(line._key)} readOnly={props.readOnly} colSpan={columnCount} dynamicColumns={dynamicColumns} showPriceVariant={showPriceVariant} showStockConversion={showStockConversion} widths={widths} stickyStyle={stickyStyle} onToggle={() => setExpanded((current) => { const next = new Set(current); if (next.has(line._key)) next.delete(line._key); else next.add(line._key); return next; })} onBomActualChange={props.onBomActualChange} />

              {text(line.item_code) && hasAuxiliaryRow && expanded.has(line._key) ? (
                <TableRow className={`${commercialRowTone} border-b-2 border-border print:hidden`} data-section="sales-v2-commercial-row">
                  <TableCell colSpan={commercialLeadSpan} className="overflow-hidden px-2 py-1.5 text-left align-top">
                    {/* Mô tả sản phẩm — nhãn/giá trị theo nhóm, không còn một chuỗi dài bị cắt cụt.
                        Khối khuyến mại tách riêng, có nền + viền, vì đó là chỗ khách hỏi nhiều nhất. */}
                    <div className="flex min-w-0 items-start gap-2">
                      {showItemImages ? <ItemImage src={itemImage} alt={itemImageAlt} size={44} className="mt-0.5" /> : null}
                      <div className="min-w-0 flex-1">
                        {descriptionGroups.length ? (
                          <dl className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5">
                            {descriptionGroups.map((group) => (
                              <div key={group.key} className="flex min-w-0 items-baseline gap-1">
                                <dt className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</dt>
                                <dd className="min-w-0 text-[11px] font-semibold text-primary" title={group.items.join(" · ")}>{group.items.join(" · ")}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <div className="min-w-0 truncate text-[11px] font-semibold text-primary" title={auxiliaryDescription}>{auxiliaryDescription}</div>
                        )}

                        {ruleNames.length || promoLabels.length || benefits.length || railToggle || butterflyToggle || rayToggle ? (
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-primary/25 bg-primary/5 px-2 py-1">
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Khuyến mại &amp; phụ thu</span>
                            {promoLabels.map((label) => <Badge key={label} variant="secondary" className="max-w-[220px] truncate text-[9px]" title={label}>{label}</Badge>)}
                            {ruleNames.slice(0, 3).map((rule) => <Badge key={rule} variant="outline" className="max-w-[220px] truncate text-[9px]" title={rule}>{rule}</Badge>)}
                            {ruleNames.length > 3 ? <Badge variant="outline" className="text-[9px]">+{ruleNames.length - 3}</Badge> : null}
                            {shownBenefits.map((benefit, benefitIndex) => <span key={`${line._key}-benefit-${benefitIndex}`} className="inline-flex min-w-0 items-center gap-1 text-[10px] font-medium" title={`${text(benefit.label) || "Tặng kèm"} · ${quantity(benefit.qty)} ${text(benefit.uom)}`}><Gift className="size-3 shrink-0" />{text(benefit.label) || "Tặng kèm"} · {quantity(benefit.qty)} {text(benefit.uom)}</span>)}
                            {/* Ô TICK "Tặng ray" — chỉ có ở mặt hàng thật sự khai cả hai dòng giá
                                TANG_RAY và CHI_LA. Trên ngưỡng thì máy tick sẵn; người bán vẫn bỏ
                                tick được. Dưới ngưỡng mà cố tick thì CHẶN + nói rõ vì sao.
                                Nhãn ô tick đã là chữ "Tặng ray", nên dòng chú thích bên cạnh CHỈ
                                in con số — in cả tên nữa ra đúng lỗi "Tặng ray · Tặng ray". */}
                            {railToggle ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Checkbox
                                  id={`sales-v2-complete-gift-rail-${line._key}`}
                                  checked={railToggle.checked}
                                  disabled={props.readOnly}
                                  onCheckedChange={(value) => setGiftRail(line, value === true)}
                                  aria-label={`Tặng ray cho dòng ${rowIndex + 1}`}
                                />
                                <label htmlFor={`sales-v2-complete-gift-rail-${line._key}`} className="cursor-pointer text-[10px] font-semibold" title={`Tick = ${priceVariantOptionLabel(railToggle.giftOption)} · Bỏ tick = ${priceVariantOptionLabel(railToggle.leafOption)} · Ngưỡng ${railToggle.operator === "GTE" ? "≥" : ">"} ${quantity(railToggle.minArea)} m²`}>
                                  Tặng ray
                                </label>
                                <span className="text-[9px] text-muted-foreground">
                                  {railToggle.undecided
                                    ? "chưa chọn — chưa ra tiền"
                                    : priceVariantOptionAmountLabel(railToggle.checked ? railToggle.giftOption : railToggle.leafOption)}
                                </span>
                                {giftRailBenefit ? <span className="inline-flex items-center gap-1 text-[9px] font-medium"><Gift className="size-3 shrink-0" />tặng {quantity(giftRailBenefit.qty)} {text(giftRailBenefit.uom)}</span> : null}
                              </span>
                            ) : null}
                            {/* Ô TICK "Có bắn bướm" — giao diện y hệt ô tick Tặng ray (chốt chủ
                                xưởng 21/08/2026). Chỉ hiện ở loại cửa mà chính sách cắt khai
                                `butterfly_cut_deduction_m` (Lưới / Đài Loan / Siêu Trường); Đức và
                                Úc không có số trừ đó nên server chiếu xuống `hidden` và ô biến mất.
                                Tick gọi lại preview ⇒ Rộng cắt lá đổi ngay (0,03 → 0,035). */}
                            {butterflyToggle ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Checkbox
                                  id={`sales-v2-complete-butterfly-${line._key}`}
                                  checked={butterflyToggle.checked}
                                  disabled={props.readOnly || fieldReadonly(line, "has_butterfly_bracket")}
                                  onCheckedChange={(value) => setButterflyBracket(line, value === true)}
                                  aria-label={`Có bắn bướm cho dòng ${rowIndex + 1}`}
                                />
                                <label htmlFor={`sales-v2-complete-butterfly-${line._key}`} className="cursor-pointer text-[10px] font-semibold" title="Bắn bướm dùng số trừ riêng của chính sách cắt, nên Rộng cắt lá đổi ngay khi tick.">
                                  Có bắn bướm
                                </label>
                                {numberValue(line.cut_width_m) === undefined
                                  ? null
                                  : <span className="text-[9px] text-muted-foreground">Rộng cắt lá {quantity(line.cut_width_m)} m</span>}
                              </span>
                            ) : null}
                            {/* Ô TICK "Sơn ray" — chỉ ở dòng Trọn bộ diện tích. Không tick = ray
                                THÔ, không phụ thu. Tick mở ô chọn màu ray ngay cạnh; chọn màu gọi
                                `alumdoor.sales.ray_paint_surcharge` thật (Pricing Scope + Pricing
                                Rule + mét ray thật của chính đơn), không phải số ước lượng tĩnh. */}
                            {rayToggle ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Checkbox
                                  id={`sales-v2-complete-ray-painted-${line._key}`}
                                  checked={rayToggle.checked}
                                  disabled={props.readOnly}
                                  onCheckedChange={(value) => setRayPainted(line, value === true)}
                                  aria-label={`Sơn ray cho dòng ${rowIndex + 1}`}
                                />
                                <label htmlFor={`sales-v2-complete-ray-painted-${line._key}`} className="cursor-pointer text-[10px] font-semibold" title="Không tick = ray để mộc (THÔ), không tính phụ thu sơn.">
                                  Sơn ray
                                </label>
                                {rayToggle.checked ? (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-44"><GridField rowKey={line._key} columnId="ray_color" disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-ray-color-${line._key}`} field={rayColorField} value={line.ray_color} onChange={(value) => setRayColor(line, text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-6 [&_.mf-control]:!w-full [&_input]:!h-6 [&_input]:!text-[10px] [&_button]:!h-6 [&_button]:!w-full [&_button]:!justify-start" /></GridField></span>
                                    {!rayToggle.color ? (
                                      <span className="text-[9px] text-muted-foreground">chưa chọn màu — chưa tính phụ thu</span>
                                    ) : raySurcharge === undefined ? (
                                      <span className="text-[9px] text-muted-foreground">đang tính…</span>
                                    ) : raySurcharge.surcharge_minor ? (
                                      <span className="text-[9px] font-medium">phụ thu {money(raySurcharge.surcharge_minor)} ₫ · {quantity(raySurcharge.total_length_m)} m × {money(raySurcharge.rate_per_meter)} ₫/m</span>
                                    ) : (
                                      <span className="text-[9px] text-muted-foreground" title={text(raySurcharge.reason)}>không phụ thu</span>
                                    )}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Lời từ chối chỉ sống chừng nào lý do còn đúng: dòng vừa đủ diện tích
                            thì nó biến mất ngay, không cần người bán bấm gì. */}
                        {giftRailRefusal[line._key] && railToggle && !railToggle.eligible ? (
                          <div className="mt-1 flex min-w-0 items-start gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[10px] text-destructive">
                            <AlertTriangle className="mt-px size-3 shrink-0" />
                            <span>{giftRailRefusal[line._key]}</span>
                          </div>
                        ) : null}

                        {/*
                          Gợi ý Motor/Bình lưu điện chỉ có ý nghĩa cho một BỘ CỬA hoàn chỉnh có
                          thể lắp mô-tơ — không phải cho:
                          · dòng lá/ray bán rời (Tách món) — `isAreaDoor` đã tự loại vì inventory_mode
                            của Nan/lá cửa không phải "Thành phẩm theo m2";
                          · Cửa Úc kéo tay (`leaf_variant === "kéo tay"`) — vận hành tay, không có
                            mô-tơ nên cũng không cần bình lưu điện cho mô-tơ.
                        */}
                        {isAreaDoor(line) && !laCuaKeoTay(line) ? (
                          <div className="mt-2 print:hidden">
                            <AlumdoorMotorSuggestPanel
                              areaSqm={lineGiftRailArea(line)}
                              currentMotorItemCode={text(line.motor_model)}
                              disabled={props.readOnly}
                              onAccept={(_kind, suggestion) => props.onAddSuggestedItem(line._key, suggestion.item_code)}
                            />
                          </div>
                        ) : null}

                        {discountNeedsApproval || (!discountNeedsApproval && needsApproval) || rowError ? (
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                            {discountNeedsApproval ? <span className="inline-flex min-w-0 items-center gap-1 text-[10px] text-destructive" title={`CK ${quantity(enteredDiscount)}% khác chuẩn ${quantity(policyDiscount)}% — cần duyệt`}><AlertTriangle className="size-3 shrink-0" />CK {quantity(enteredDiscount)}% khác chuẩn {quantity(policyDiscount)}% — cần duyệt</span> : null}
                            {!discountNeedsApproval && needsApproval ? <span className="inline-flex min-w-0 items-center gap-1 text-[10px]" title="Đơn giá khác chính sách — cần duyệt"><AlertTriangle className="size-3 shrink-0" />Đơn giá khác chính sách — cần duyệt</span> : null}
                            {rowError ? <span className="inline-flex min-w-0 items-center gap-1 text-[10px] text-destructive" title={rowError}><AlertTriangle className="size-3 shrink-0" />{rowError}</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell style={{ width: widths.priced_qty }} className="overflow-hidden bg-background/70 px-1 py-1 text-center align-middle">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">Chiết khấu</div>
                    <div className="mx-auto mt-0.5 w-[64px] max-w-full"><GridField rowKey={line._key} columnId="discount_percentage" disabled={props.readOnly || fieldReadonly(line, "discount_percentage")}><AlumdoorSalesOrderField id={`sales-v2-complete-discount-${line._key}`} field={discountField} value={line.discount_percentage ?? policyDiscount} onChange={(value) => props.onPatch(line._key, { discount_percentage: value == null || value === "" ? 0 : Number(value) })} /*
                      Rời ô mà KHÔNG gõ gì thì không ghi gì — trước đây chỗ này ghi luôn
                      `policyDiscount` vào dòng. Nay ô hiện sẵn 15% của chính sách, nên hành vi
                      cũ sẽ biến con số chỉ-để-xem thành chiết khấu NHẬP TAY, và kernel chặn ghi
                      sổ: "chiết khấu bị trừ hai lần cho cùng một chính sách". Chỉ ghi đúng cái
                      người bán tự gõ.
                    */
                    onCommit={() => props.onCommit(line._key, "discount_percentage", line.discount_percentage)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly || fieldReadonly(line, "discount_percentage")} compact hideLabel className="w-full max-w-full [&_.mf-control]:!min-h-7 [&_.mf-control]:!w-full [&_input]:!h-7 [&_input]:!w-full [&_input]:!text-center [&_input]:text-[10px] [&_input]:tabular-nums" /></GridField></div>
                    {/* Sau bản vá P0, chiết khấu đại lý 15% KHÔNG còn nằm ở `discount_amount` mà
                        nằm trong `adjustment_amount` mang dấu ÂM. Ô này phải gom cả hai đường,
                        nếu không khách nhìn thấy "Chiết khấu 0 ₫" trong khi tiền đã giảm đúng.
                        Tên khoản lấy từ `pricing_rule_snapshots[].rule_name` (đã Việt hoá). */}
                    <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-destructive" title={adjustmentSplit.reduction
                      ? `Chiết khấu trên dòng ${money(discountAmount)} ₫ + giảm trừ theo quy tắc giá ${money(adjustmentSplit.reduction)} ₫${adjustmentSplit.reductionRules.length ? ` (${adjustmentSplit.reductionRules.join(" · ")})` : ""}`
                      : "Chiết khấu theo % trên dòng"}>−{money(discountTotal)} ₫</div>
                    {adjustmentSplit.reductionRules.length
                      ? <div className="mt-0.5 truncate text-[9px] text-muted-foreground" title={adjustmentSplit.reductionRules.join(" · ")}>{adjustmentSplit.reductionRules.join(" · ")}</div>
                      : null}
                  </TableCell>
                  <TableCell style={{ width: widths.rate }} className="overflow-hidden bg-background/70 px-1 py-1 text-center align-middle">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">Phụ thu</div>
                    {/* Chỉ phần LÀM TĂNG tiền. Trước đây ô này in thẳng `adjustment_amount`, nên
                        một dòng có khoản giảm lớn hơn phụ thu in ra "−…" ngay dưới nhãn "Phụ thu"
                        — cùng một khoản tiền vừa bị gọi là phụ thu vừa mang dấu trừ. */}
                    <div className="mt-1 whitespace-nowrap text-[11px] font-medium tabular-nums">+{money(adjustmentSplit.surcharge)} ₫</div>
                    <div className="mt-0.5 whitespace-normal break-words text-[9px] leading-tight text-muted-foreground">{surchargeNames.length ? surchargeNames.join(" · ") : adjustmentSplit.surcharge ? "Phụ thu khác" : "Không có phụ thu"}</div>
                  </TableCell>
                  <TableCell style={{ width: widths.gross_amount }} className="overflow-hidden bg-primary/5 px-1 py-1 text-center align-middle">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">Tiền phải thu</div>
                    <div className="mt-1 whitespace-nowrap text-sm font-bold tabular-nums text-primary">{money(payable)} ₫</div>
                  </TableCell>
                  <TableCell style={{ width: widths.actions }} className="bg-background/70 px-1 py-1" />
                </TableRow>
              ) : null}

              {/*
                DÒNG PHỤ CỦA BẢN IN — vẽ lại theo mẫu chủ xưởng duyệt 24/08/2026.
                Dòng phụ của MÀN là một ô `colSpan` chứa cả cụm ô tick, thẻ badge và ô nhập; in
                nguyên ra thành mớ hộp rỗng kèm "0%", "−0 đ", "Không có phụ thu". Ở đây in một
                dòng mảnh: nhãn dồn phải, số rơi đúng cột Đơn giá và Thành tiền — và CHỈ mọc khi
                thật sự có số. Vẫn đọc chính biến của màn nên không thể lệch.
                Ba ô cuối là `rate` · `gross_amount` · `actions`, nên nhãn trải `columnCount - 3`.
              */}
              {hasAuxiliaryRow && discountTotal ? (
                <TableRow className="hidden print:table-row" data-section="sales-v2-print-discount-row">
                  <TableCell colSpan={Math.max(1, columnCount - 3)} className="px-2 py-0.5 text-center align-middle italic">
                    Chiết khấu{adjustmentSplit.reductionRules.length ? ` — ${adjustmentSplit.reductionRules.join(" · ")}` : ""}
                  </TableCell>
                  <TableCell className="px-1 py-0.5 text-center align-middle tabular-nums">{enteredDiscount ? `${quantity(enteredDiscount)}%` : ""}</TableCell>
                  <TableCell className="px-1 py-0.5 text-right align-middle tabular-nums">{discountTotal ? `−${money(discountTotal)}` : ""}</TableCell>
                  <TableCell className="px-1 py-0.5" />
                </TableRow>
              ) : null}

              {hasAuxiliaryRow && adjustmentSplit.surcharge ? (
                <TableRow className="hidden print:table-row" data-section="sales-v2-print-surcharge-row">
                  <TableCell colSpan={Math.max(1, columnCount - 3)} className="px-2 py-0.5 text-center align-middle italic">
                    Phụ thu{surchargeNames.length ? ` — ${surchargeNames.join(" · ")}` : ""}
                  </TableCell>
                  <TableCell className="px-1 py-0.5" />
                  <TableCell className="px-1 py-0.5 text-right align-middle tabular-nums">+{money(adjustmentSplit.surcharge)}</TableCell>
                  <TableCell className="px-1 py-0.5" />
                </TableRow>
              ) : null}

              {expanded.has(line._key) && (explanation.length > 0 || gaps.length > 0 || warnings.length > 0) ? (
                <TableRow className={`${commercialRowTone} border-b-2 border-border hover:bg-transparent print:hidden`} data-section="sales-v2-explain-row">
                  <TableCell colSpan={columnCount} className="px-3 py-2 text-left align-top">
                    {gaps.length ? (
                      <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                          <AlertTriangle className="size-3" /> Còn thiếu để chốt được dòng này
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {gaps.map((gap) => (
                            <li key={gap.key} className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                              <span className="font-medium text-foreground">{gap.what}</span>
                              {/* Ô CHỜ ĐIỀN khác hẳn lỗi phần mềm: 33 mã ray/trục đang cố ý
                                  trống hệ số quy đổi. Gọi nhầm tên là người bán đi báo lỗi
                                  kỹ thuật, còn ô thì mãi không ai điền. */}
                              {gap.intentional ? <Badge variant="outline" className="h-4 px-1 text-[9px]">chờ chủ xưởng chốt</Badge> : null}
                              <span className="text-[10px] text-muted-foreground">— sửa ở: {gap.where}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {warnings.length ? (
                      <ul className="mb-2 space-y-0.5">
                        {warnings.map((warning) => (
                          <li key={warning.key} className="flex flex-wrap items-baseline gap-x-1.5 text-[10px] text-muted-foreground">
                            <AlertTriangle className="size-2.5 shrink-0" />
                            <span className="font-medium text-foreground">{warning.what}</span>
                            <span>— {warning.where}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {explanation.length ? (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vì sao ra con số này</div>
                        <dl className="mt-1 grid gap-x-4 gap-y-0.5 md:grid-cols-2 xl:grid-cols-3">
                          {explanation.map((row) => (
                            <div key={row.key} className="flex min-w-0 items-baseline gap-1.5 text-[11px]">
                              <dt className="shrink-0 text-muted-foreground">{row.label}:</dt>
                              <dd
                                className={`min-w-0 flex-1 truncate font-medium ${row.tone === "warn" ? "text-destructive" : "text-foreground"}`}
                                title={row.value}
                              >
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : null}

            </Fragment>;
          })}
        </TableBody>
      </Table>
    </div>
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t-2 border-border bg-muted/20 px-3 py-1.5 print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={props.onAdd} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm dòng</Button>
        <Button type="button" variant="outline" size="sm" onClick={props.onAddFive} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm 5</Button>
        {props.selectedKeys.size ? <Button type="button" variant="destructive" size="sm" onClick={props.onDeleteSelected} disabled={props.readOnly}><Trash2 className="size-3.5" /> Xóa {props.selectedKeys.size}</Button> : null}
      </div>
      <div className="text-[10px] text-muted-foreground">{props.lines.length} dòng · độ rộng cột được nhớ trên trình duyệt</div>
    </div>
  </section>;
}
