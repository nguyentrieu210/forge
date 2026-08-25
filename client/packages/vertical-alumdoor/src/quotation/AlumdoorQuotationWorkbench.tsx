/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ChevronDown, ChevronRight, Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import { LinkControl, type FieldServices } from "@metaforge/controls";
import { Button, ConfirmDialog, Skeleton, Switch, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorSalesOrderLineTableComplete } from "../sales-order-v2/AlumdoorSalesOrderLineTableComplete.js";
import type { FieldOverride, SalesLine } from "../sales-order-v2/model.js";

type Json = Record<string, unknown>;
type Item = Doc & { item_name?: string; item_group?: string; stock_uom?: string; is_sales_item?: number | boolean; disabled?: number | boolean };
type CustomerContext = Json & { customer_group?: string; customer_group_name?: string; price_list?: string; phone?: string; contact_person?: string; assigned_employee?: string };
type SalesOption = { price_variant: string; label: string; target_item: string; rate?: number; minimum_area_sqm?: number; item_name?: string };
type ItemSalesContext = Json & {
  allowed_colors?: string[]; color_labels?: Record<string, string>; ray_colors?: string[]; ray_color_labels?: Record<string, string>; visible_fields?: string[]; required_fields?: string[]; read_only_fields?: string[];
  field_labels?: Record<string, string>; sales_options?: SalesOption[]; selected_price_variant?: string; default_discount_percentage?: number; item_name?: string; item_group?: string; uom?: string;
};
type ResolvedComponent = {
  component_role?: string; item?: string; item_name?: string; qty?: number; uom?: string;
  measure_qty?: number | null; measure_uom?: string; rate?: number; amount?: number; source_rule?: string; sequence?: number;
};
type QuoteDoc = Json & {
  name?: string; modified?: string; customer?: string; customer_group?: string; price_list?: string; order_date?: string; delivery_date?: string;
  contact_person?: string; phone?: string; assigned_employee?: string; payment_method?: string; money_account?: string; vat_percent?: number;
  install_address?: string; shipping_note?: string; notes?: string; status?: string; approval_status?: string; deposit_amount?: number; is_stock_locked?: boolean | number; revision_reason?: string; items?: Json[];
  subtotal?: number; discount_amount?: number; line_adjustment_amount?: number; order_adjustment_amount?: number; vat_amount?: number; grand_total?: number; paid_amount?: number; outstanding_amount?: number;
};
type CalculatedOrder = Json & { items?: Json[]; price_list?: string; subtotal?: number; discount_amount?: number; line_adjustment_amount?: number; order_adjustment_amount?: number; vat_percent?: number; vat_amount?: number; grand_total?: number; deposit_amount?: number; paid_amount?: number; outstanding_amount?: number };
type Line = {
  key: string; item: string; item_name: string; item_group: string; color: string; allowedColors: string[]; colorLabels: Record<string, string>;
  rayColors: string[]; rayColorLabels: Record<string, string>;
  visibleFields: string[]; requiredFields: string[]; readOnlyFields: string[]; fieldLabels: Record<string, string>; salesOptions: SalesOption[];
  price_variant: string; width_pb_ray_m: string; width_pb_nhua_m: string; height_m: string; mesh_height_m: string; cut_width_m: string;
  has_butterfly_bracket: boolean; ray_painted: boolean; ray_color: string; length_m: string; qty_bar: string; set_count: string; qty: string;
  uom: string; priced_qty: number; price_basis: string; rate: number; amount: number; discount_percentage: string; discount_amount: number;
  policy_discount_percentage: number;
  adjustment_amount: string; net_amount: number; description: string; pricing_snapshot_json?: string; expanded: boolean; calculating?: boolean; calculated?: boolean;
  sales_package: string; components: ResolvedComponent[]; componentError: string; component_snapshot_json?: string;
};

export interface AlumdoorQuotationWorkbenchProps { name?: string; closeRequest?: number; onSaved?: (name: string) => void; onCancel: () => void; }

const fieldClass = "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const tableField = "h-8 w-full rounded border bg-background px-1.5 text-center text-sm outline-none focus:border-primary disabled:opacity-60";
const compactNumberField = "h-8 w-[68px] rounded border bg-background px-1 text-center text-sm tabular-nums outline-none focus:border-primary disabled:opacity-60";
const customerField = { fieldname: "customer", label: "Khách hàng", fieldtype: "Link", options: "Alumdoor Partner", allow_create: false, link_filters: JSON.stringify([["Alumdoor Partner", "enabled", "=", 1], ["Alumdoor Partner", "partner_kind", "in", ["Customer", "Both"]]]) } as DocField;
const salesItemField = { fieldname: "item", label: "Mã mặt hàng", fieldtype: "Link", options: "Alumdoor Item", allow_create: false, link_filters: JSON.stringify({ is_sales_item: 1, disabled: 0 }) } as DocField;
const quotationItemMeta = {
  name: "Alumdoor Sales Order Item",
  fields: [
    { fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Alumdoor Item" },
    { fieldname: "color", label: "Màu", fieldtype: "Select" },
    { fieldname: "price_variant", label: "Cách bán", fieldtype: "Select" },
    { fieldname: "width_pb_ray_m", label: "Rộng PB ray", fieldtype: "Float" },
    { fieldname: "width_pb_nhua_m", label: "Rộng PB nhựa", fieldtype: "Float" },
    { fieldname: "width_m", label: "Rộng", fieldtype: "Float" },
    { fieldname: "height_m", label: "Cao PB", fieldtype: "Float" },
    { fieldname: "mesh_height_m", label: "Cao lưới", fieldtype: "Float" },
    { fieldname: "cut_width_m", label: "Rộng cắt lá", fieldtype: "Float" },
    { fieldname: "leaf_variant", label: "Kiểu lá", fieldtype: "Select" },
    { fieldname: "ray_type", label: "Loại ray", fieldtype: "Select" },
    { fieldname: "has_butterfly_bracket", label: "Có bắn bướm", fieldtype: "Check" },
    { fieldname: "motor_model", label: "Mô tơ", fieldtype: "Link", options: "Alumdoor Item" },
    { fieldname: "length_m", label: "Dài / cây", fieldtype: "Float" },
    { fieldname: "qty_bar", label: "Số cây/lá", fieldtype: "Float" },
    { fieldname: "set_count", label: "Số lượng", fieldtype: "Float" },
    { fieldname: "qty", label: "Số lượng", fieldtype: "Float" },
    { fieldname: "uom", label: "ĐVT", fieldtype: "Link", options: "Alumdoor UOM" },
    { fieldname: "ray_color", label: "Màu ray", fieldtype: "Link", options: "Alumdoor Color" },
    { fieldname: "discount_percentage", label: "Chiết khấu %", fieldtype: "Percent" },
  ],
} as unknown as DocTypeMeta;
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const moneyInput = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const parseMoneyInput = (value: string) => Number(value.replace(/\D/g, "") || 0);
const checked = (value: unknown) => value === true || value === 1 || value === "1";
const priceBasisLabel = (value: string) => ({
  "Per Area": "Theo m²", "Per Meter": "Theo mét", "Per Set": "Theo bộ", "Per Qty": "Theo số lượng",
}[value] ?? value);
const parseComponents = (value: unknown): ResolvedComponent[] => {
  if (Array.isArray(value)) return value as ResolvedComponent[];
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value)) as { components?: ResolvedComponent[] };
    return Array.isArray(parsed.components) ? parsed.components : [];
  } catch { return []; }
};
const measureText = (value: unknown) => number(value) ? text(value) : "";
const today = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const requestKey = () => crypto.randomUUID();
const rowKey = () => `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankLine = (): Line => ({
  key: rowKey(), item: "", item_name: "", item_group: "", color: "", allowedColors: [], colorLabels: {}, rayColors: [], rayColorLabels: {}, visibleFields: ["item", "qty"], requiredFields: ["item", "qty"], readOnlyFields: [], fieldLabels: {}, salesOptions: [], price_variant: "STANDARD",
  width_pb_ray_m: "", width_pb_nhua_m: "", height_m: "", mesh_height_m: "", cut_width_m: "", has_butterfly_bracket: false,
  ray_painted: false, ray_color: "", length_m: "", qty_bar: "", set_count: "1", qty: "1", uom: "", priced_qty: 0,
  price_basis: "", rate: 0, amount: 0, discount_percentage: "0", discount_amount: 0, policy_discount_percentage: 0, adjustment_amount: "0", net_amount: 0,
  description: "", expanded: false, calculated: false,
  sales_package: "", components: [], componentError: "", component_snapshot_json: "",
});
const previewFingerprint = (line: Line, doc: QuoteDoc) => JSON.stringify([
  doc.price_list, doc.customer_group, doc.order_date, line.item, line.color, line.price_variant,
  line.width_pb_ray_m, line.width_pb_nhua_m, line.height_m, line.mesh_height_m, line.cut_width_m,
  line.has_butterfly_bracket, line.ray_painted, line.ray_color, line.length_m,
  line.qty, line.discount_percentage, line.adjustment_amount,
]);
const readyForPreview = (line: Line, priceList: string) => {
  if (!line.item || !priceList || !line.salesOptions.length) return false;
  return line.requiredFields.every((field) => {
    if (field === "item") return Boolean(line.item);
    if (field === "color") return !line.allowedColors.length || Boolean(line.color);
    if (field === "has_butterfly_bracket" || field === "ray_painted") return true;
    return number(line[field as keyof Line]) > 0;
  });
};
const contextPatch = (context: ItemSalesContext): Partial<Line> => ({
  item_name: text(context.item_name), item_group: text(context.item_group), uom: text(context.uom),
  allowedColors: context.allowed_colors ?? [], colorLabels: context.color_labels ?? {}, rayColors: context.ray_colors ?? [], rayColorLabels: context.ray_color_labels ?? {}, visibleFields: context.visible_fields ?? ["item", "qty"],
  requiredFields: context.required_fields ?? ["item", "qty"], readOnlyFields: context.read_only_fields ?? [], fieldLabels: context.field_labels ?? {}, salesOptions: context.sales_options ?? [],
  policy_discount_percentage: number(context.default_discount_percentage),
});
const hasField = (line: Line, field: string) => line.visibleFields.includes(field);
const fieldLabel = (line: Line, field: string, fallback: string) => `${line.fieldLabels[field] || fallback}${line.requiredFields.includes(field) ? " *" : ""}`;
function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={className}><span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>{children}</label>;
}
function lineFromDoc(row: Json, item?: Item): Line {
  return {
    ...blankLine(), item: text(row.item), item_name: text(row.item_name) || text(item?.item_name), item_group: text(item?.item_group), color: text(row.color),
    price_variant: text(row.price_variant) || "STANDARD", width_pb_ray_m: measureText(row.width_pb_ray_m), width_pb_nhua_m: measureText(row.width_pb_nhua_m),
    height_m: measureText(row.height_m), mesh_height_m: measureText(row.mesh_height_m), cut_width_m: measureText(row.cut_width_m), has_butterfly_bracket: checked(row.has_butterfly_bracket),
    ray_painted: checked(row.ray_painted), ray_color: text(row.ray_color), length_m: measureText(row.length_m), qty_bar: measureText(row.qty_bar),
    set_count: text(row.qty || row.set_count || 1), qty: text(row.qty || row.set_count || row.qty_bar || 1), uom: text(row.uom), priced_qty: number(row.priced_qty), price_basis: text(row.price_basis),
    rate: number(row.rate), amount: number(row.amount), discount_percentage: text(row.discount_percentage || 0), discount_amount: number(row.discount_amount),
    adjustment_amount: text(row.adjustment_amount || 0), net_amount: number(row.net_amount), description: text(row.description),
    pricing_snapshot_json: text(row.pricing_snapshot_json), sales_package: text(row.sales_package),
    components: parseComponents(row.components ?? row.component_snapshot_json), componentError: text(row.component_error),
    component_snapshot_json: text(row.component_snapshot_json), calculated: true,
  };
}

const legacyDynamicFields = [
  "width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "mesh_height_m", "cut_width_m",
  "leaf_variant", "ray_type", "has_butterfly_bracket", "motor_model", "length_m", "qty_bar",
  "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count", "estimated_weight_kg",
] as const;

/**
 * Cầu nối duy nhất giữa lớp dữ liệu Frappe thuần và màn tạo đơn cũ.
 * Không tính lại nghiệp vụ ở client: mọi tiền, khối lượng và cấu kiện đều lấy từ preview server.
 */
function asLegacyLine(line: Line): SalesLine {
  const areaDoor = ["m2", "m²"].includes(text(line.uom).toLocaleLowerCase("vi"))
    && (text(line.item_group).toLocaleUpperCase("vi").startsWith("CUA-") || line.price_basis === "Per Area");
  const overrides: Record<string, FieldOverride> = {};
  for (const fieldname of legacyDynamicFields) {
    const visible = line.visibleFields.includes(fieldname);
    overrides[fieldname] = {
      hidden: visible ? 0 : 1,
      reqd: line.requiredFields.includes(fieldname) ? 1 : 0,
      read_only: line.readOnlyFields.includes(fieldname) ? 1 : 0,
      label: line.fieldLabels[fieldname],
    };
  }
  overrides.color = { hidden: line.visibleFields.includes("color") ? 0 : 1 };
  overrides.price_variant = { hidden: line.salesOptions.length > 1 ? 0 : 1 };
  overrides.set_count = { hidden: 0, reqd: 1, label: "Số lượng" };
  overrides.qty = { hidden: 0, reqd: 1, label: "Số lượng" };
  overrides.discount_percentage = { hidden: 0, read_only: line.readOnlyFields.includes("discount_percentage") ? 1 : 0 };

  const priceOptions = line.salesOptions.map((option) => ({
    price_variant: option.price_variant,
    item_price: option.target_item,
    uom: line.uom,
    rate: option.rate ?? null,
    currency: "VND",
  }));
  const componentNames: Record<string, string> = {};
  const bomComponents = line.components.map((component, index) => {
    const code = text(component.item) || `component-${index + 1}`;
    componentNames[code] = text(component.item_name) || code;
    return {
      component_key: `${text(component.component_role) || "COMPONENT"}-${index + 1}`,
      item_code: code,
      component_count: number(component.qty),
      component_count_uom: text(component.uom) || "Cái",
      bom_count_uom: text(component.uom) || "Cái",
      stock_consumption_qty: component.measure_qty == null ? undefined : number(component.measure_qty),
      stock_consumption_uom: text(component.measure_uom),
      qty: component.measure_qty == null ? number(component.qty) : number(component.measure_qty),
      uom: text(component.measure_uom) || text(component.uom),
      source_rule: text(component.source_rule),
      gross_amount: number(component.amount),
      net_amount: number(component.amount),
    };
  });
  // Chỉ sequence >= 1000 / vai trò phụ thu-chiết khấu mới đi vào adjustment_amount.
  // Lá, ray, ron có amount để giải trình cấu kiện nhưng không được cộng lại lần hai vào phụ thu.
  const adjustmentComponents = line.components.filter((component) => number(component.amount) !== 0 && (
    number(component.sequence) >= 1000 || /^(SURCHARGE|DISCOUNT)_/i.test(text(component.component_role))
  ));
  const appliedAdjustments = adjustmentComponents.map((component) => ({
    rule_name: text(component.source_rule) || text(component.item_name) || text(component.component_role),
    basis: text(component.uom),
    basis_qty: component.qty,
    rate_minor: component.rate,
    amount_minor: component.amount,
  }));
  const minimumArea = line.salesOptions.reduce((result, option) => Math.max(result, number(option.minimum_area_sqm)), 0);
  const rayAdjustments = adjustmentComponents.filter((component) => /RAY|SON[_ -]?RAY/i.test(`${text(component.component_role)} ${text(component.source_rule)} ${text(component.item_name)}`));
  const raySurcharge = rayAdjustments.reduce((sum, component) => sum + Math.max(number(component.amount), 0), 0);
  const salesMode = line.visibleFields.includes("ray_painted") ? "Trọn bộ"
    : line.price_variant === "TACH_MON" ? "Tách món"
      : line.price_variant === "KEO_TAY" ? "Kéo tay"
        : line.price_variant === "MOTOR_NGOAI" ? "Mô tơ ngoài"
          : line.price_variant === "TANG_RAY" ? "Tặng ray"
            : line.price_variant === "CHI_LA" ? "Chỉ lá" : "Tiêu chuẩn";

  return {
    _key: line.key,
    _itemName: line.item_name || line.item,
    _allowedColors: line.allowedColors,
    _colorLabels: line.colorLabels,
    _overrides: overrides,
    _loading: line.calculating,
    _error: "",
    _pricingError: "",
    _showBomOnSales: Boolean(line.sales_package || line.components.length),
    _bomError: line.componentError,
    _bomComponentNames: componentNames,
    _bomPreview: {
      bom_applicable: Boolean(line.components.length),
      bom_no: line.sales_package,
      reason: line.componentError || (!line.components.length && line.calculated ? "Mặt hàng bán trực tiếp" : ""),
      components: bomComponents,
    },
    _raySurcharge: line.ray_painted && line.ray_color ? {
      applicable: raySurcharge > 0,
      surcharge_minor: raySurcharge,
      reason: raySurcharge > 0 ? "Phụ thu sơn ray từ gói bán" : "Không có phụ thu sơn ray",
    } : undefined,
    _context: {
      item_code: line.item,
      item_group: line.item_group,
      inventory_mode: areaDoor ? "Thành phẩm theo m2" : "Hàng thường",
      selected_uom: line.uom,
      allowed_uoms: line.uom ? [line.uom] : [],
      price_explain: {
        price_variant: line.price_variant,
        price_variant_required: priceOptions.length > 1 && !line.price_variant,
        price_variant_options: priceOptions,
      },
      min_area_sqm: minimumArea || undefined,
    },
    _commercial: {
      price_variant: line.price_variant,
      selling_rate: line.rate,
      priced_qty: line.priced_qty,
      gross_amount: line.amount,
      discount_percentage: number(line.discount_percentage),
      policy_discount_percentage: line.policy_discount_percentage,
      discount_amount: line.discount_amount,
      adjustment_amount: number(line.adjustment_amount),
      net_before_tax: line.net_amount,
      applied_adjustments: appliedAdjustments,
      pricing_rule_snapshots: appliedAdjustments.map((row) => ({ ...row, effect_type: "ADJUSTMENT" })),
      gift_rail_threshold_sqm: minimumArea || undefined,
      gift_rail_area_operator: "GTE",
      catalog_context: { item_group: line.item_group, inventory_mode: areaDoor ? "Thành phẩm theo m2" : "Hàng thường", min_area_sqm: minimumArea || undefined },
      price_explain: { price_variant: line.price_variant, price_variant_options: priceOptions },
    },
    item_code: line.item,
    item_name: line.item_name,
    item_group: line.item_group,
    sales_mode: salesMode,
    color: line.color,
    price_variant: line.price_variant,
    width_pb_ray_m: number(line.width_pb_ray_m) || undefined,
    width_pb_nhua_m: number(line.width_pb_nhua_m) || undefined,
    height_m: number(line.height_m) || undefined,
    mesh_height_m: number(line.mesh_height_m) || undefined,
    cut_width_m: number(line.cut_width_m) || undefined,
    has_butterfly_bracket: line.has_butterfly_bracket ? 1 : 0,
    ray_painted: line.ray_painted ? 1 : 0,
    ray_color: line.ray_color || undefined,
    length_m: number(line.length_m) || undefined,
    qty_bar: number(line.qty_bar) || undefined,
    set_count: number(line.qty) || 1,
    qty: number(line.qty) || 1,
    uom: line.uom,
    rate: line.rate || undefined,
    amount: line.amount || undefined,
    discount_percentage: number(line.discount_percentage),
    discount_amount: line.discount_amount,
    adjustment_amount: number(line.adjustment_amount),
    net_amount: line.net_amount,
    billable_area_sqm: areaDoor ? line.priced_qty : undefined,
    description: line.description,
  } as SalesLine;
}

export function AlumdoorQuotationWorkbench({ name, closeRequest = 0, onSaved, onCancel }: AlumdoorQuotationWorkbenchProps) {
  const { adapter, registry, services, roles } = useMetaForge();
  const [doc, setDoc] = useState<QuoteDoc>({ order_date: today(), status: "Draft", payment_method: "Công nợ", vat_percent: 8, deposit_amount: 0 });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  // Callback debounce ở bảng con có thể chạy bằng closure của một render cũ. Giữ con trỏ tới
  // dòng mới nhất để một commit trễ không tưởng giá trị cũ là thay đổi mới rồi hủy preview.
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Doc[]>([]);
  const [accounts, setAccounts] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const closeSeen = useRef(closeRequest);
  const customerRequest = useRef(0);
  const lineRequest = useRef(new Map<string, number>());
  const orderCalculateRequest = useRef(0);
  const autoPreviewSignature = useRef("");
  const editableStatuses = ["Draft", "Approved", "Production Requested", "In Production", "Ready to Deliver"];
  const editable = !name || (editableStatuses.includes(text(doc.status)) && !checked(doc.is_stock_locked));
  const legacyLines = useMemo(() => lines.map(asLegacyLine), [lines]);

  const patchDoc = (next: Partial<QuoteDoc>) => { orderCalculateRequest.current += 1; setDirty(true); setFormError(""); setDoc((current) => ({ ...current, ...next })); };
  const patchLine = (key: string, next: Partial<Line>, invalidate = false) => { orderCalculateRequest.current += 1; setDirty(true); setFormError(""); setLines((current) => current.map((line) => line.key === key ? { ...line, ...next, ...(invalidate ? { calculated: false, priced_qty: 0, rate: 0, amount: 0, discount_amount: 0, net_amount: 0, sales_package: "", components: [], componentError: "", component_snapshot_json: "" } : {}) } : line)); };
  const requestClose = () => { if (dirty) setConfirmClose(true); else onCancel(); };

  const loadItemContext = async (itemCode: string, customerGroup = text(doc.customer_group)): Promise<ItemSalesContext> => {
    if (!itemCode) return { allowed_colors: [], color_labels: {}, visible_fields: ["item", "qty"], required_fields: ["item", "qty"] };
    return adapter.callPost<ItemSalesContext>("alumdoor.sales_configuration.api_v1.get_item_sales_context", { item_code: itemCode, customer_group: customerGroup });
  };

  useEffect(() => {
    let active = true;
    void Promise.all([
      adapter.getList("Alumdoor Item", { fields: ["name", "item_name", "item_group", "stock_uom", "is_sales_item", "disabled"], orderBy: "item_name asc", pageLength: 2000 }),
      adapter.getList("Alumdoor Employee", { fields: ["name", "employee_name", "enabled"], orderBy: "employee_name asc", pageLength: 500 }),
      adapter.getList("Alumdoor Money Account", { fields: ["name", "account_name", "enabled"], orderBy: "account_name asc", pageLength: 100 }),
      name ? adapter.getDoc("Alumdoor Sales Order", name) : Promise.resolve(null),
    ]).then(async ([itemRows, employeeRows, accountRows, quoteResult]) => {
      if (!active) return;
      const saleItems = (itemRows as Item[]).filter((item) => checked(item.is_sales_item) && !checked(item.disabled));
      setItems(saleItems);
      setEmployees(employeeRows.filter((row) => checked(row.enabled)));
      setAccounts(accountRows.filter((row) => checked(row.enabled)));
      if (quoteResult) {
        const quote = quoteResult.doc as QuoteDoc;
        setDoc(quote);
        const loaded = await Promise.all((quote.items ?? []).map(async (row) => {
          const item = saleItems.find((entry) => text(entry.name) === text(row.item));
          const line = lineFromDoc(row, item);
          const context = await loadItemContext(line.item, text(quote.customer_group)).catch((): ItemSalesContext => ({}));
          return { ...line, ...contextPatch(context) };
        }));
        setLines(loaded.length ? loaded : [blankLine()]);
      }
      setDirty(false);
    }).catch((error) => { if (active) toast.error(adapter.mapError(error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, name]);

  useEffect(() => {
    if (closeRequest === closeSeen.current) return;
    closeSeen.current = closeRequest;
    requestClose();
  }, [closeRequest, dirty]);

  const chooseCustomer = async (customer: string) => {
    const request = customerRequest.current + 1;
    customerRequest.current = request;
    patchDoc({ customer, customer_group: "", price_list: "" });
    if (!customer) return;
    try {
      const context = await adapter.callPost<CustomerContext>("alumdoor.sales_configuration.api_v1.get_customer_context", { customer });
      if (customerRequest.current !== request) return;
      const customerGroup = text(context.customer_group_name || context.customer_group);
      const refreshed = await Promise.all(lines.filter((line) => line.item).map(async (line) => [line.key, await loadItemContext(line.item, customerGroup)] as const));
      if (customerRequest.current !== request) return;
      const contexts = new Map(refreshed);
      patchDoc({ customer_group: customerGroup, price_list: context.price_list, phone: context.phone || doc.phone, contact_person: context.contact_person || doc.contact_person, assigned_employee: context.assigned_employee || doc.assigned_employee });
      setLines((current) => current.map((line) => {
        const itemContext = contexts.get(line.key);
        if (!itemContext) return { ...line, calculated: false };
        const visible = itemContext.visible_fields ?? [];
        return { ...line, ...contextPatch(itemContext), width_pb_ray_m: visible.includes("width_pb_ray_m") ? line.width_pb_ray_m : "", width_pb_nhua_m: visible.includes("width_pb_nhua_m") ? line.width_pb_nhua_m : "", calculated: false };
      }));
    } catch (error) { if (customerRequest.current === request) { const message = adapter.mapError(error).message; setFormError(message); toast.error(message); } }
  };

  const chooseItem = async (line: Line, itemCode: string, preferredVariant?: string, preserveMeasurements = false) => {
    const request = (lineRequest.current.get(line.key) ?? 0) + 1;
    lineRequest.current.set(line.key, request);
    const item = items.find((entry) => text(entry.name) === itemCode);
    patchLine(line.key, { item: itemCode, item_name: text(item?.item_name), item_group: text(item?.item_group), uom: text(item?.stock_uom), color: "", allowedColors: [], colorLabels: {}, rayColors: [], rayColorLabels: {}, visibleFields: ["item", "qty"], requiredFields: ["item", "qty"], readOnlyFields: [], fieldLabels: {}, salesOptions: [], price_variant: preferredVariant || "STANDARD", priced_qty: 0, price_basis: "", rate: 0, amount: 0, discount_amount: 0, net_amount: 0,
      ...(!preserveMeasurements ? { width_pb_ray_m: "", width_pb_nhua_m: "", height_m: "", mesh_height_m: "", cut_width_m: "", length_m: "", qty_bar: "", ray_painted: false, ray_color: "", has_butterfly_bracket: false } : {}),
    }, true);
    if (!itemCode) return;
    try {
      const context = await loadItemContext(itemCode);
      if (lineRequest.current.get(line.key) !== request) return;
      const allowed = context.allowed_colors ?? [];
      const options = context.sales_options ?? [];
      const giftPair = options.some((option) => option.price_variant === "TANG_RAY") && options.some((option) => option.price_variant === "CHI_LA");
      const selectedVariant = preferredVariant || (giftPair ? "STANDARD" : text(context.selected_price_variant) || "STANDARD");
      const visible = context.visible_fields ?? [];
      patchLine(line.key, { ...contextPatch(context), price_variant: selectedVariant, color: allowed.includes(line.color) && preserveMeasurements ? line.color : allowed.length === 1 ? allowed[0] : "",
        discount_percentage: preserveMeasurements ? line.discount_percentage : text(context.default_discount_percentage ?? 0),
        width_pb_ray_m: visible.includes("width_pb_ray_m") ? line.width_pb_ray_m : "", width_pb_nhua_m: visible.includes("width_pb_nhua_m") ? line.width_pb_nhua_m : "",
      }, true);
    } catch (error) { if (lineRequest.current.get(line.key) === request) { const message = adapter.mapError(error).message; setFormError(message); toast.error(message); } }
  };

  const chooseSalesOption = async (line: Line, variant: string) => {
    const option = line.salesOptions.find((entry) => entry.price_variant === variant);
    if (!option) return;
    if (option.target_item !== line.item) await chooseItem(line, option.target_item, variant, true);
    else patchLine(line.key, { price_variant: variant }, true);
  };

  const payloadForLine = (line: Line): Json => ({
    line_key: line.key,
    item: line.item, color: line.color, price_variant: line.price_variant, width_pb_ray_m: number(line.width_pb_ray_m), width_pb_nhua_m: number(line.width_pb_nhua_m),
    height_m: number(line.height_m), mesh_height_m: number(line.mesh_height_m), cut_width_m: number(line.cut_width_m), has_butterfly_bracket: line.has_butterfly_bracket ? 1 : 0,
    ray_painted: line.ray_painted ? 1 : 0, ray_color: line.ray_color, length_m: number(line.length_m), qty_bar: number(line.qty), set_count: number(line.qty),
    qty: number(line.qty), discount_percentage: number(line.discount_percentage), adjustment_amount: number(line.adjustment_amount), description: line.description,
    sales_package: line.sales_package, component_snapshot_json: line.component_snapshot_json,
  });
  const calculateOrder = async (quiet = false): Promise<boolean> => {
    const activeLines = lines.filter((line) => line.item);
    if (!activeLines.length) { const message = "Cần chọn ít nhất một mã mặt hàng."; setFormError(message); if (!quiet) toast.error(message); return false; }
    if (!text(doc.customer) || !text(doc.price_list)) { const message = "Chọn khách hàng để hệ thống xác định bảng giá."; setFormError(message); if (!quiet) toast.error(message); return false; }
    const request = orderCalculateRequest.current + 1;
    orderCalculateRequest.current = request;
    setLines((current) => current.map((entry) => entry.item ? { ...entry, calculating: true } : entry));
    try {
      const result = await adapter.callPost<CalculatedOrder>("alumdoor.sales_configuration.api_v1.calculate_order", { data: JSON.stringify({ ...doc, items: activeLines.map(payloadForLine) }) });
      if (orderCalculateRequest.current !== request) return false;
      const calculatedByKey = new Map((result.items ?? []).map((row) => [text(row.line_key), row]));
      setLines((current) => current.map((line) => {
        if (!line.item) return line;
        const calculated = calculatedByKey.get(line.key);
        if (!calculated) return { ...line, calculating: false };
        const salesContext = (calculated.sales_context as ItemSalesContext | undefined) ?? {};
        return { ...line, ...lineFromDoc(calculated, items.find((entry) => text(entry.name) === line.item)), ...contextPatch(salesContext), key: line.key, expanded: line.expanded, allowedColors: (calculated.allowed_colors as string[] | undefined) ?? line.allowedColors, colorLabels: (calculated.color_labels as Record<string, string> | undefined) ?? line.colorLabels, calculating: false, calculated: true };
      }));
      setDoc((current) => ({ ...current,
        price_list: text(result.price_list) || current.price_list,
        subtotal: number(result.subtotal), discount_amount: number(result.discount_amount),
        line_adjustment_amount: number(result.line_adjustment_amount), order_adjustment_amount: number(result.order_adjustment_amount),
        vat_percent: number(result.vat_percent), vat_amount: number(result.vat_amount), grand_total: number(result.grand_total),
        deposit_amount: number(result.deposit_amount), paid_amount: number(result.paid_amount), outstanding_amount: number(result.outstanding_amount),
      }));
      setFormError("");
      return true;
    } catch (error) { if (orderCalculateRequest.current === request) { setLines((current) => current.map((entry) => entry.item ? { ...entry, calculating: false } : entry)); const message = adapter.mapError(error).message; setFormError(message); if (!quiet) toast.error(message); } return false; }
  };

  useEffect(() => {
    if (loading || !editable) return;
    const activeLines = lines.filter((line) => line.item);
    if (!activeLines.length || !activeLines.every((line) => readyForPreview(line, text(doc.price_list)))) return;
    const signature = JSON.stringify([doc.customer, doc.customer_group, doc.price_list, doc.order_date, doc.vat_percent, doc.deposit_amount, activeLines.map((line) => previewFingerprint(line, doc))]);
    if (autoPreviewSignature.current === signature) return;
    const timer = window.setTimeout(() => {
      autoPreviewSignature.current = signature;
      void calculateOrder(true);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [doc.customer, doc.customer_group, doc.price_list, doc.order_date, doc.vat_percent, doc.deposit_amount, editable, lines, loading]);

  const calculateAll = async () => {
    const calculated = await calculateOrder(true);
    if (!calculated) { toast.error("Không tính được đơn hàng."); return false; }
    toast.success("Đã tính lại toàn bộ đơn hàng."); return true;
  };

  const totals = useMemo(() => ({
    subtotal: number(doc.subtotal), discount: number(doc.discount_amount),
    surcharge: number(doc.line_adjustment_amount) + number(doc.order_adjustment_amount), area: 0,
    vat: number(doc.vat_amount), grand: number(doc.grand_total), outstanding: number(doc.outstanding_amount),
  }), [doc.subtotal, doc.discount_amount, doc.line_adjustment_amount, doc.order_adjustment_amount, doc.vat_amount, doc.grand_total, doc.outstanding_amount]);
  const save = async () => {
    if (!text(doc.customer)) { const message = "Cần chọn khách hàng."; setFormError(message); toast.error(message); return; }
    if (!lines.length || lines.some((line) => !line.item)) { const message = "Đơn hàng phải có ít nhất một dòng hàng hợp lệ."; setFormError(message); toast.error(message); return; }
    if (lines.some((line) => !line.calculated) && !(await calculateAll())) return;
    setSaving(true);
    try {
      const result = await adapter.callPost<{ name: string; doc: QuoteDoc }>("alumdoor.sales_configuration.api_v1.save_order", {
        name: name ?? "", modified: text(doc.modified), idempotency_key: requestKey(), data: JSON.stringify({ ...doc, items: lines.map(payloadForLine) }),
      });
      setDoc(result.doc); setDirty(false); setFormError(""); toast.success(name ? "Đã cập nhật đơn hàng." : "Đã lưu đơn hàng."); onSaved?.(result.name);
    } catch (error) { const message = adapter.mapError(error).message; setFormError(message); toast.error(message); } finally { setSaving(false); }
  };

  const submitOrder = async () => {
    if (!name || dirty) { toast.error("Hãy lưu đơn trước khi gửi duyệt / sản xuất."); return; }
    setSaving(true);
    try {
      const result = await adapter.callPost<{ status: string; doc: QuoteDoc }>("alumdoor.sales_configuration.api_v1.submit_order", { name, expected_modified: text(doc.modified), idempotency_key: requestKey() });
      setDoc(result.doc); toast.success(result.status === "Pending Owner Approval" ? "Đã gửi Chủ xưởng duyệt." : "Đã xác nhận và chuyển sang sản xuất.");
    } catch (error) { const message = adapter.mapError(error).message; setFormError(message); toast.error(message); } finally { setSaving(false); }
  };

  const decideOrder = async (decision: "approve" | "reject") => {
    if (!name) return;
    const note = window.prompt(decision === "approve" ? "Ghi chú duyệt (có thể bỏ trống):" : "Lý do từ chối:", "");
    if (note === null || (decision === "reject" && !note.trim())) return;
    setSaving(true);
    try {
      const method = decision === "approve" ? "approve_order" : "reject_order";
      const common = { name, expected_modified: text(doc.modified), idempotency_key: requestKey() };
      const args = decision === "approve" ? { ...common, note } : { ...common, reason: note };
      const result = await adapter.callPost<{ status: string; doc?: QuoteDoc }>(`alumdoor.sales_configuration.api_v1.${method}`, args);
      if (result.doc) setDoc(result.doc); else setDoc((current) => ({ ...current, status: result.status }));
      toast.success(decision === "approve" ? "Đã duyệt và chuyển đơn sang vận hành." : "Đã từ chối đơn.");
    } catch (error) { const message = adapter.mapError(error).message; setFormError(message); toast.error(message); } finally { setSaving(false); }
  };

  const patchFromLegacy = (key: string, source: Partial<SalesLine>, invalidate = true) => {
    const currentLine = linesRef.current.find((entry) => entry.key === key);
    if (!currentLine) return;
    const next: Partial<Line> = {};
    for (const [field, value] of Object.entries(source)) {
      if (field.startsWith("_")) continue;
      if (field === "item_code") next.item = text(value);
      else if (field === "set_count" || field === "qty") {
        next.qty = text(value);
        next.set_count = text(value);
      } else if (field === "has_butterfly_bracket") next.has_butterfly_bracket = checked(value);
      else if (field === "ray_painted") next.ray_painted = checked(value);
      else if (["width_pb_ray_m", "width_pb_nhua_m", "height_m", "mesh_height_m", "cut_width_m", "length_m", "qty_bar", "discount_percentage", "adjustment_amount"].includes(field)) {
        (next as Record<string, unknown>)[field] = value == null ? "" : text(value);
      } else if (["color", "price_variant", "ray_color", "uom", "description"].includes(field)) {
        (next as Record<string, unknown>)[field] = text(value);
      }
    }
    // Bộ điều khiển số phát `onChange` rồi phát thêm `onCommit` khi blur/debounce.
    // Commit thứ hai thường mang đúng giá trị vừa ghi. Nếu vẫn coi nó là một thay đổi mới,
    // nó sẽ tăng revision và làm kết quả calculate_order đang bay về bị coi là stale; màn
    // cứ hiện "Đang tính" dù server đã trả 200. Chỉ phát mutation khi dữ liệu thật sự đổi.
    const changed = Object.entries(next).some(([field, value]) => {
      const current = currentLine[field as keyof Line];
      if (typeof value === "boolean") return checked(current) !== value;
      return text(current) !== text(value);
    });
    if (changed) patchLine(key, next, invalidate);
  };

  const commitLegacyField = (key: string, field: string, value: unknown) => {
    const line = lines.find((entry) => entry.key === key);
    if (!line) return;
    if (field === "item_code") {
      void chooseItem(line, text(value));
      return;
    }
    if (field === "price_variant") {
      void chooseSalesOption(line, text(value));
      return;
    }
    patchFromLegacy(key, { [field]: value } as Partial<SalesLine>);
  };

  const addLines = (count: number) => {
    setDirty(true);
    setLines((current) => [...current, ...Array.from({ length: count }, () => blankLine())]);
  };
  const deleteLine = (key: string) => {
    setDirty(true);
    setLines((current) => {
      const remaining = current.filter((line) => line.key !== key);
      return remaining.length ? remaining : [blankLine()];
    });
    setSelectedKeys((current) => { const next = new Set(current); next.delete(key); return next; });
  };
  const duplicateLine = (key: string) => {
    const source = lines.find((line) => line.key === key);
    if (!source) return;
    const copy = { ...source, key: rowKey(), calculating: false, expanded: false };
    setDirty(true);
    setLines((current) => {
      const index = current.findIndex((line) => line.key === key);
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };
  const addSuggestedItem = (itemCode: string) => {
    const line = blankLine();
    setDirty(true);
    setLines((current) => [...current, line]);
    window.setTimeout(() => void chooseItem(line, itemCode), 0);
  };

  if (loading) return <div className="space-y-3 p-4" aria-label="Đang tải đơn hàng"><Skeleton className="h-24 w-full" /><Skeleton className="h-56 w-full" /><Skeleton className="h-24 w-full" /></div>;
  return <><div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-sales-order-workbench">
    <main className="min-h-0 flex-1 overflow-auto">
      {formError ? <div role="alert" className="mx-3 mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{formError}</span></div> : null}
      {name && editable && text(doc.status) !== "Draft" ? <div className="mx-3 mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2"><Field label="Lý do sửa đơn (bắt buộc)"><input className={fieldClass} value={text(doc.revision_reason)} onChange={(event) => patchDoc({ revision_reason: event.target.value })} placeholder="Nêu rõ nội dung và lý do thay đổi" /></Field></div> : null}
      <section className="border-b bg-card p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border p-2 xl:col-span-1"><Field label="Khách hàng"><LinkControl id="alumdoor-order-customer" field={customerField} value={text(doc.customer)} onChange={(value) => void chooseCustomer(text(value))} services={services} parentDoctype="Alumdoor Sales Order" docValues={doc} roles={roles} readOnly={!editable} required compact /></Field><div className="mt-2 grid grid-cols-2 gap-2"><Field label="Người liên hệ"><input disabled={!editable} className={fieldClass} value={text(doc.contact_person)} onChange={(e) => patchDoc({ contact_person: e.target.value })} /></Field><Field label="SĐT"><input disabled={!editable} className={fieldClass} value={text(doc.phone)} onChange={(e) => patchDoc({ phone: e.target.value })} /></Field></div></div>
          <div className="grid gap-2 rounded-lg border p-2"><Field label="Ngày đặt"><input disabled={!editable} className={fieldClass} type="date" value={text(doc.order_date)} onChange={(e) => patchDoc({ order_date: e.target.value })} /></Field><Field label="Ngày giao"><input disabled={!editable} className={fieldClass} type="date" value={text(doc.delivery_date)} onChange={(e) => patchDoc({ delivery_date: e.target.value })} /></Field></div>
          <div className="grid gap-2 rounded-lg border p-2"><Field label="Loại khách"><input className={fieldClass} readOnly value={text(doc.customer_group)} placeholder="Theo khách hàng" /></Field><Field label="Người phụ trách"><select disabled={!editable} className={fieldClass} value={text(doc.assigned_employee)} onChange={(e) => patchDoc({ assigned_employee: e.target.value })}><option value="">— chưa chọn —</option>{employees.map((row) => <option key={text(row.name)} value={text(row.name)}>{text(row.employee_name) || text(row.name)}</option>)}</select></Field></div>
          <div className="grid content-start gap-2 rounded-lg border p-2"><Field label="Bảng giá"><input className={fieldClass} readOnly value={text(doc.price_list)} placeholder="Theo loại khách" /></Field></div>
          <div className="grid content-start gap-2 rounded-lg border p-2"><Field label="Thanh toán"><select disabled={!editable} className={fieldClass} value={text(doc.payment_method)} onChange={(e) => patchDoc({ payment_method: e.target.value, ...(e.target.value === "Chuyển khoản" ? {} : { money_account: "" }) })}>{["Tiền mặt", "Chuyển khoản", "COD", "Công nợ"].map((value) => <option key={value}>{value}</option>)}</select></Field>{doc.payment_method === "Chuyển khoản" ? <Field label="Tài khoản ngân hàng"><select disabled={!editable} className={fieldClass} value={text(doc.money_account)} onChange={(e) => patchDoc({ money_account: e.target.value })}><option value="">— chọn tài khoản —</option>{accounts.map((row) => <option key={text(row.name)} value={text(row.name)}>{text(row.account_name) || text(row.name)}</option>)}</select></Field> : null}</div>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-3"><Field label="Địa chỉ giao / lắp"><input disabled={!editable} className={fieldClass} value={text(doc.install_address)} onChange={(e) => patchDoc({ install_address: e.target.value })} /></Field><Field label="Ghi chú vận chuyển"><input disabled={!editable} className={fieldClass} value={text(doc.shipping_note)} onChange={(e) => patchDoc({ shipping_note: e.target.value })} /></Field><Field label="Ghi chú vận hành"><input disabled={!editable} className={fieldClass} value={text(doc.notes)} onChange={(e) => patchDoc({ notes: e.target.value })} /></Field></div>
      </section>
      <section className="p-3">
        <AlumdoorSalesOrderLineTableComplete
          lines={legacyLines}
          customerGroup={text(doc.customer_group)}
          childMeta={quotationItemMeta}
          itemDoctype="Alumdoor Item"
          rayColorDoctype="Alumdoor Color"
          parentDoctype="Alumdoor Sales Order Item"
          registry={registry}
          services={services}
          roles={roles}
          readOnly={!editable}
          showStockConversionColumn={false}
          showLeafCountColumn={false}
          showMotorSuggestions={false}
          selectedKeys={selectedKeys}
          leafVariants={[]}
          onToggleSelection={(key, checkedValue) => setSelectedKeys((current) => { const next = new Set(current); if (checkedValue) next.add(key); else next.delete(key); return next; })}
          onToggleAll={(checkedValue) => setSelectedKeys(checkedValue ? new Set(lines.map((line) => line.key)) : new Set())}
          onPatch={(key, next) => patchFromLegacy(key, next)}
          onCommit={commitLegacyField}
          onAdd={() => addLines(1)}
          onAddFive={() => addLines(5)}
          onAddSuggestedItem={(_sourceKey, itemCode) => addSuggestedItem(itemCode)}
          onDuplicate={duplicateLine}
          onDelete={deleteLine}
          onDeleteSelected={() => { const selected = new Set(selectedKeys); setDirty(true); setLines((current) => { const remaining = current.filter((line) => !selected.has(line.key)); return remaining.length ? remaining : [blankLine()]; }); setSelectedKeys(new Set()); }}
          onBomActualChange={() => undefined}
        />
      </section>
    </main>
    <footer className="max-h-[42vh] shrink-0 overflow-auto border-t bg-card p-3">
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
        {[["Tiền hàng", money.format(totals.subtotal)], ["Chiết khấu", money.format(totals.discount)], ["Phụ thu", money.format(totals.surcharge)]].map(([label, value]) => <div key={label} className="rounded border px-2 py-1.5"><div className="text-muted-foreground">{label}</div><div className="mt-0.5 font-semibold">{value}</div></div>)}
        <label className="rounded border px-2 py-1.5"><span className="block text-muted-foreground">VAT (%)</span><input aria-label="Phần trăm VAT" disabled={!editable} className="mt-0.5 h-5 w-full bg-transparent font-semibold tabular-nums outline-none" type="number" min="0" max="100" step="0.1" value={number(doc.vat_percent)} onChange={(event) => patchDoc({ vat_percent: number(event.target.value) })} /></label>
        {[["Tiền VAT", money.format(totals.vat)], ["Tổng thanh toán", money.format(totals.grand)]].map(([label, value]) => <div key={label} className="rounded border px-2 py-1.5"><div className="text-muted-foreground">{label}</div><div className="mt-0.5 font-semibold">{value}</div></div>)}
        <label className="rounded border px-2 py-1.5"><span className="block text-muted-foreground">Tiền cọc</span><input aria-label="Tiền cọc" disabled={!editable} className="mt-0.5 h-5 w-full bg-transparent font-semibold tabular-nums outline-none" type="text" inputMode="numeric" value={moneyInput.format(number(doc.deposit_amount))} onChange={(event) => patchDoc({ deposit_amount: parseMoneyInput(event.target.value) })} /></label>
        <div className="rounded border px-2 py-1.5"><div className="text-muted-foreground">Còn phải thu</div><div className="mt-0.5 font-semibold">{money.format(totals.outstanding)}</div></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-xs text-muted-foreground">{text(doc.status) !== "Draft" ? <>Trạng thái: {text(doc.status)}</> : lines.some((line) => line.calculating) ? <><Loader2 className="size-3.5 animate-spin" /> Đang tính</> : lines.some((line) => !line.calculated) ? <><AlertTriangle className="size-3.5" /> Có dòng chưa tính</> : <><CheckCircle2 className="size-3.5" /> Dữ liệu đã sẵn sàng</>}</div><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={requestClose}>{name ? "Đóng" : "Hủy"}</Button><Button variant="outline" disabled={!editable} onClick={() => void calculateAll()}><Calculator className="size-4" /> Tính lại</Button><Button disabled={!editable || saving} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button>{name && text(doc.status) === "Draft" ? <Button disabled={dirty || saving} onClick={() => void submitOrder()}>Gửi đơn</Button> : null}{name && text(doc.status) === "Pending Owner Approval" ? <><Button variant="outline" disabled={saving} onClick={() => void decideOrder("reject")}>Từ chối</Button><Button disabled={saving} onClick={() => void decideOrder("approve")}>Chủ xưởng duyệt</Button></> : null}</div></div>
    </footer>
  </div><ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title="Bỏ thay đổi trên đơn hàng?" description="Các thông tin và dòng hàng chưa lưu sẽ mất." confirmLabel="Bỏ thay đổi" cancelLabel="Tiếp tục chỉnh" destructive onConfirm={onCancel} /></>;
}

type ChooseItem = (line: Line, item: string, preferredVariant?: string, preserveMeasurements?: boolean) => Promise<void>;
type ChooseSalesOption = (line: Line, variant: string) => Promise<void>;

function SalesModeControl({ line, editable, compact = false, onChoose }: { line: Line; editable: boolean; compact?: boolean; onChoose: ChooseSalesOption }) {
  const giftPair = line.salesOptions.some((option) => option.price_variant === "TANG_RAY") && line.salesOptions.some((option) => option.price_variant === "CHI_LA") && line.salesOptions.every((option) => option.target_item === line.item);
  if (giftPair) return <label className={`flex items-center gap-1.5 ${compact ? "w-[132px] justify-center text-[11px]" : "min-h-9 text-sm"}`}><Switch disabled={!editable} checked={line.price_variant === "TANG_RAY"} onCheckedChange={(checkedValue) => void onChoose(line, checkedValue ? "TANG_RAY" : "CHI_LA")} /><span className="truncate">{line.price_variant === "STANDARD" ? "Tự động" : line.price_variant === "TANG_RAY" ? "Tặng ray" : "Chỉ lá"}</span></label>;
  if (line.salesOptions.length <= 1) return <div className={compact ? "text-center text-xs" : "flex min-h-9 items-center text-sm"}>{line.salesOptions[0]?.label || "Tiêu chuẩn"}</div>;
  return <select disabled={!editable} className={compact ? `${tableField} w-[132px]` : fieldClass} value={line.price_variant} onChange={(event) => void onChoose(line, event.target.value)}>{line.salesOptions.map((option) => <option key={`${option.price_variant}-${option.target_item}`} value={option.price_variant}>{option.label}</option>)}</select>;
}

function ComponentTable({ line }: { line: Line }) {
  if (line.componentError) return <div role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">Không tính được cấu kiện: {line.componentError}</div>;
  if (!line.components.length) return <div className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Mặt hàng bán trực tiếp hoặc chưa có gói cấu kiện phù hợp.</div>;
  return <div className="mt-3 overflow-x-auto rounded-md border">
    <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-xs"><strong>Cấu kiện sản xuất</strong><span className="text-muted-foreground">Gói {line.sales_package || "đã tính"}</span></div>
    <table className="w-full min-w-[620px] text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="px-2 py-1.5">Vai trò</th><th className="px-2 py-1.5">Cấu kiện</th><th className="px-2 py-1.5 text-right">Số lượng</th><th className="px-2 py-1.5">ĐVT</th><th className="px-2 py-1.5 text-right">Quy cách / tiêu hao</th></tr></thead><tbody>
      {line.components.map((component, index) => <tr key={`${component.component_role}-${component.item}-${index}`} className="border-b last:border-0"><td className="px-2 py-1.5 font-medium">{component.component_role || "—"}</td><td className="px-2 py-1.5"><div>{component.item_name || component.item || "—"}</div>{component.item_name && component.item ? <div className="text-[10px] text-muted-foreground">{component.item}</div> : null}</td><td className="px-2 py-1.5 text-right font-semibold tabular-nums">{number(component.qty).toLocaleString("vi-VN", { maximumFractionDigits: 3 })}</td><td className="px-2 py-1.5">{component.uom || "—"}</td><td className="px-2 py-1.5 text-right tabular-nums">{component.measure_qty == null ? "—" : `${number(component.measure_qty).toLocaleString("vi-VN", { maximumFractionDigits: 3 })} ${component.measure_uom || ""}`}</td></tr>)}
    </tbody></table>
  </div>;
}

function LineMoneyBreakdown({ line, discountInput }: { line: Line; discountInput: ReactNode }) {
  const adjustment = number(line.adjustment_amount);
  const surchargeNames = line.components
    .filter((component) => number(component.amount) > 0 && (text(component.component_role).startsWith("SURCHARGE_") || number(component.amount) > 0 && number(component.amount) === Math.abs(adjustment)))
    .map((component) => text(component.item_name) || text(component.item))
    .filter(Boolean);
  return <div className="mt-2 grid overflow-hidden rounded-md border text-center text-xs sm:grid-cols-3">
    <div className="bg-background/70 px-2 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Chiết khấu</div>
      <div className="mx-auto mt-1 w-[72px]">{discountInput}</div>
      <div className="mt-1 font-semibold tabular-nums text-destructive">−{money.format(line.discount_amount)}</div>
    </div>
    <div className="border-t bg-background/70 px-2 py-2 sm:border-l sm:border-t-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Phụ thu</div>
      <div className="mt-2 font-semibold tabular-nums">+{money.format(Math.max(adjustment, 0))}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{surchargeNames.join(" · ") || "Không có phụ thu"}</div>
    </div>
    <div className="border-t bg-primary/5 px-2 py-2 sm:border-l sm:border-t-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tiền phải thu</div>
      <div className="mt-2 text-sm font-bold tabular-nums text-primary">{money.format(line.net_amount)}</div>
    </div>
  </div>;
}

function LineRows({ line, index, visibleColumns, services, roles, editable, onChooseItem, onChooseSalesOption, onPatch, onDelete }: { line: Line; index: number; visibleColumns: Set<string>; services: FieldServices; roles: string[]; editable: boolean; onChooseItem: ChooseItem; onChooseSalesOption: ChooseSalesOption; onPatch: (key: string, next: Partial<Line>, invalidate?: boolean) => void; onDelete: () => void }) {
  const input = (field: keyof Line, type = "number") => <input disabled={!editable || line.readOnlyFields.includes(String(field))} className={type === "number" ? compactNumberField : tableField} type={type} min={type === "number" ? "0" : undefined} step="0.001" value={text(line[field])} onChange={(e) => onPatch(line.key, { [field]: e.target.value } as Partial<Line>, true)} />;
  const cell = (field: keyof Line, type = "number") => <td className="w-[72px] p-1 text-center">{hasField(line, String(field)) ? input(field, type) : <span className="block text-center text-muted-foreground">—</span>}</td>;
  const checkCell = (field: "has_butterfly_bracket" | "ray_painted") => <td className="p-1 text-center">{hasField(line, field) ? <input disabled={!editable} type="checkbox" checked={line[field]} onChange={(event) => onPatch(line.key, { [field]: event.target.checked, ...(field === "ray_painted" && !event.target.checked ? { ray_color: "" } : {}) }, true)} /> : <span className="text-muted-foreground">—</span>}</td>;
  return <>
    <tr className="border-t"><td className="p-1 text-center"><button type="button" aria-label={line.expanded ? `Thu gọn dòng ${index + 1}` : `Mở chi tiết dòng ${index + 1}`} onClick={() => onPatch(line.key, { expanded: !line.expanded })}>{line.expanded ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}</button></td>
      <td className="w-[220px] p-1"><LinkControl id={`alumdoor-order-item-${line.key}`} field={salesItemField} value={line.item} onChange={(value) => void onChooseItem(line, text(value))} services={services} parentDoctype="Alumdoor Sales Order Item" docValues={line as unknown as Json} roles={roles} readOnly={!editable} required compact /></td>
      {visibleColumns.has("price_variant") ? <td className="p-1">{hasField(line, "price_variant") ? <SalesModeControl line={line} editable={editable} compact onChoose={onChooseSalesOption} /> : <span className="block text-center text-muted-foreground">—</span>}</td> : null}
      {visibleColumns.has("color") ? <td className="w-[136px] p-1">{hasField(line, "color") ? <select disabled={!editable || !line.allowedColors.length} className={`${tableField} w-[136px]`} value={line.color} onChange={(e) => onPatch(line.key, { color: e.target.value }, true)}><option value="">{line.allowedColors.length ? "— chọn màu —" : "— không áp dụng —"}</option>{line.allowedColors.map((color) => <option key={color} value={color}>{line.colorLabels[color] || color}</option>)}</select> : <span className="block text-center text-muted-foreground">—</span>}</td> : null}
      {visibleColumns.has("width_pb_ray_m") ? cell("width_pb_ray_m") : null}{visibleColumns.has("width_pb_nhua_m") ? cell("width_pb_nhua_m") : null}{visibleColumns.has("height_m") ? cell("height_m") : null}{visibleColumns.has("mesh_height_m") ? cell("mesh_height_m") : null}{visibleColumns.has("cut_width_m") ? cell("cut_width_m") : null}{visibleColumns.has("length_m") ? cell("length_m") : null}
      {visibleColumns.has("has_butterfly_bracket") ? checkCell("has_butterfly_bracket") : null}{visibleColumns.has("ray_painted") ? checkCell("ray_painted") : null}{visibleColumns.has("ray_color") ? <td className="w-[126px] p-1">{hasField(line, "ray_color") ? <select disabled={!editable || !line.ray_painted} className={`${tableField} w-[126px]`} value={line.ray_color} onChange={(event) => onPatch(line.key, { ray_color: event.target.value }, true)}><option value="">— màu ray —</option>{line.rayColors.map((color) => <option key={color} value={color}>{line.rayColorLabels[color] || color}</option>)}</select> : <span className="block text-center text-muted-foreground">—</span>}</td> : null}<td className="w-[70px] p-1 text-center">{input("qty")}</td>
      <td className="p-1 text-center text-xs">{line.uom || "—"}</td><td className="p-1 text-center">{line.priced_qty ? line.priced_qty.toLocaleString("vi-VN", { maximumFractionDigits: 3 }) : "—"}</td><td className="p-1 text-right">{line.rate ? money.format(line.rate) : "—"}</td><td className="p-1 text-right font-medium">{line.calculated ? money.format(line.net_amount) : <span className="text-amber-600">Chưa tính</span>}</td>
      <td className="w-[42px] p-1"><Button aria-label={`Xóa dòng ${index + 1}`} variant="ghost" size="sm" disabled={!editable} onClick={onDelete}><Trash2 className="size-4" aria-hidden="true" /></Button></td></tr>
    {line.expanded ? <tr className="border-t bg-muted/20"><td /><td colSpan={30} className="p-3"><div className="grid gap-2 md:grid-cols-5"><Field label="Cơ sở giá"><input className={fieldClass} readOnly value={priceBasisLabel(line.price_basis)} /></Field><Field label="Diễn giải" className="md:col-span-4"><input disabled={!editable} className={fieldClass} value={line.description} onChange={(e) => onPatch(line.key, { description: e.target.value })} /></Field></div><LineMoneyBreakdown line={line} discountInput={input("discount_percentage")} /><ComponentTable line={line} /></td></tr> : null}
  </>;
}

function MobileLineCard({ line, index, services, roles, editable, onChooseItem, onChooseSalesOption, onPatch, onDelete }: { line: Line; index: number; services: FieldServices; roles: string[]; editable: boolean; onChooseItem: ChooseItem; onChooseSalesOption: ChooseSalesOption; onPatch: (key: string, next: Partial<Line>, invalidate?: boolean) => void; onDelete: () => void }) {
  const input = (field: keyof Line, type = "number") => <input disabled={!editable} className={fieldClass} type={type} min={type === "number" ? "0" : undefined} step="0.001" value={text(line[field])} onChange={(event) => onPatch(line.key, { [field]: event.target.value } as Partial<Line>, true)} />;
  return <article className="rounded-lg border bg-card p-3" aria-label={`Dòng hàng ${index + 1}`}>
    <div className="mb-3 flex items-center justify-between gap-2"><strong className="flex items-center gap-1.5 text-sm">Dòng {index + 1}{line.calculating ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Đang tính" /> : null}</strong><Button aria-label={`Xóa dòng ${index + 1}`} variant="ghost" size="sm" disabled={!editable} onClick={onDelete}><Trash2 className="size-4" aria-hidden="true" /></Button></div>
    <div className="grid gap-2">
      <Field label="Mã mặt hàng"><LinkControl id={`alumdoor-order-mobile-item-${line.key}`} field={salesItemField} value={line.item} onChange={(value) => void onChooseItem(line, text(value))} services={services} parentDoctype="Alumdoor Sales Order Item" docValues={line as unknown as Json} roles={roles} readOnly={!editable} required compact /></Field>
      {hasField(line, "price_variant") ? <Field label="Cách bán"><SalesModeControl line={line} editable={editable} onChoose={onChooseSalesOption} /></Field> : null}
      {hasField(line, "color") ? <Field label="Màu cho phép"><select disabled={!editable || !line.allowedColors.length} className={fieldClass} value={line.color} onChange={(event) => onPatch(line.key, { color: event.target.value }, true)}><option value="">{line.allowedColors.length ? "— chọn màu —" : "— không áp dụng —"}</option>{line.allowedColors.map((color) => <option key={color} value={color}>{line.colorLabels[color] || color}</option>)}</select></Field> : null}
      <div className="grid grid-cols-2 gap-2">
        {hasField(line, "width_pb_ray_m") ? <Field label={fieldLabel(line, "width_pb_ray_m", "Rộng PB ray")}>{input("width_pb_ray_m")}</Field> : null}
        {hasField(line, "width_pb_nhua_m") ? <Field label={fieldLabel(line, "width_pb_nhua_m", "Rộng PB nhựa")}>{input("width_pb_nhua_m")}</Field> : null}
        {hasField(line, "height_m") ? <Field label={fieldLabel(line, "height_m", "Cao PB")}>{input("height_m")}</Field> : null}
        {hasField(line, "mesh_height_m") ? <Field label={fieldLabel(line, "mesh_height_m", "Cao lưới")}>{input("mesh_height_m")}</Field> : null}
        {hasField(line, "cut_width_m") ? <Field label={fieldLabel(line, "cut_width_m", "Rộng cắt lá")}>{input("cut_width_m")}</Field> : null}
        {hasField(line, "length_m") ? <Field label={fieldLabel(line, "length_m", "Chiều dài")}>{input("length_m")}</Field> : null}
        {hasField(line, "has_butterfly_bracket") ? <label className="flex min-h-9 items-center gap-2 text-sm"><input disabled={!editable} type="checkbox" checked={line.has_butterfly_bracket} onChange={(event) => onPatch(line.key, { has_butterfly_bracket: event.target.checked }, true)} /> Có bắn bướm</label> : null}
        {hasField(line, "ray_painted") ? <label className="flex min-h-9 items-center gap-2 text-sm"><input disabled={!editable} type="checkbox" checked={line.ray_painted} onChange={(event) => onPatch(line.key, { ray_painted: event.target.checked, ...(!event.target.checked ? { ray_color: "" } : {}) }, true)} /> Sơn ray</label> : null}
        {hasField(line, "ray_color") && line.ray_painted ? <Field label="Màu sơn ray"><select disabled={!editable} className={fieldClass} value={line.ray_color} onChange={(event) => onPatch(line.key, { ray_color: event.target.value }, true)}><option value="">— màu ray —</option>{line.rayColors.map((color) => <option key={color} value={color}>{line.rayColorLabels[color] || color}</option>)}</select></Field> : null}
        <Field label="Số lượng">{input("qty")}</Field>
        <Field label="ĐVT"><input className={fieldClass} readOnly value={line.uom} placeholder="—" /></Field>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2 text-xs"><div><span className="text-muted-foreground">Khối lượng</span><div className="font-semibold">{line.priced_qty ? line.priced_qty.toLocaleString("vi-VN", { maximumFractionDigits: 3 }) : "—"}</div></div><div className="text-right"><span className="text-muted-foreground">Thành tiền</span><div className="font-semibold">{line.calculated ? money.format(line.net_amount) : <span className="text-amber-600">Chưa tính</span>}</div></div></div>
    <button type="button" className="mt-2 flex min-h-9 w-full items-center justify-center gap-1 text-xs font-medium text-primary" aria-expanded={line.expanded} onClick={() => onPatch(line.key, { expanded: !line.expanded })}>{line.expanded ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}{line.expanded ? "Ẩn tùy chọn" : "Chiết khấu, phụ thu và tùy chọn"}</button>
      {line.expanded ? <div className="mt-2 border-t pt-3"><div className="grid gap-2 sm:grid-cols-2"><Field label="Cơ sở giá"><input className={fieldClass} readOnly value={priceBasisLabel(line.price_basis)} /></Field><Field label="Diễn giải"><input disabled={!editable} className={fieldClass} value={line.description} onChange={(event) => onPatch(line.key, { description: event.target.value })} /></Field></div><LineMoneyBreakdown line={line} discountInput={input("discount_percentage")} /><ComponentTable line={line} /></div> : null}
  </article>;
}
