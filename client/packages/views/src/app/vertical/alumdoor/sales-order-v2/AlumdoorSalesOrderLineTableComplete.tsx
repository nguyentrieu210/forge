/** @jsxImportSource react */
import {
  Fragment,
  useEffect,
  useMemo,
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
import { AlumdoorSalesOrderField, fallbackField, selectField } from "./AlumdoorSalesOrderField.js";
import {
  fieldLabel,
  fieldReadonly,
  fieldRequired,
  fieldVisible,
  isAreaDoor,
  lineAdjustmentAmount,
  lineCommercialNeedsApproval,
  lineDiscountAmount,
  lineDiscountNeedsApproval,
  lineNetAmount,
  linePolicyDiscountPercentage,
  linePolicyDiscountRule,
  linePricedQuantity,
  money,
  numberValue,
  pricingRuleLabel,
  primaryQuantityField,
  quantity,
  text,
  type SalesLine,
} from "./model.js";

type DynamicFieldName =
  | "width_m"
  | "height_m"
  | "mesh_height_m"
  | "cut_width_m"
  | "leaf_variant"
  | "ray_type"
  | "has_butterfly_bracket"
  | "motor_model"
  | "length_m"
  | "qty_bar"
  | "leaf_count"
  | "single_layer_leaf_count"
  | "double_layer_leaf_count"
  | "estimated_weight_kg";

type ColumnId =
  | "select"
  | "index"
  | "item_code"
  | "item_name"
  | "color"
  | DynamicFieldName
  | "quantity"
  | "uom"
  | "priced_qty"
  | "rate"
  | "gross_amount"
  | "actions";

const DYNAMIC_FIELD_ORDER: DynamicFieldName[] = [
  "width_m",
  "height_m",
  "mesh_height_m",
  "cut_width_m",
  "ray_type",
  "has_butterfly_bracket",
  "leaf_variant",
  "motor_model",
  "length_m",
  "qty_bar",
  "leaf_count",
  "single_layer_leaf_count",
  "double_layer_leaf_count",
  "estimated_weight_kg",
];

const DYNAMIC_FALLBACK_LABELS: Record<DynamicFieldName, string> = {
  width_m: "Rộng phủ bì",
  height_m: "Cao phủ bì",
  mesh_height_m: "Cao lưới",
  cut_width_m: "Rộng cắt lá",
  leaf_variant: "Kiểu lá",
  ray_type: "Loại ray",
  has_butterfly_bracket: "Bản bướm",
  motor_model: "Mô tơ",
  length_m: "Dài / cây",
  qty_bar: "Số cây/lá",
  leaf_count: "Số lá",
  single_layer_leaf_count: "Lá một lớp",
  double_layer_leaf_count: "Lá hai lớp",
  estimated_weight_kg: "KL dự kiến",
};

const DYNAMIC_FALLBACK_TYPES: Record<DynamicFieldName, DocField["fieldtype"]> = {
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

const FORCE_READ_ONLY = new Set<DynamicFieldName>([
  "cut_width_m",
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
  uom: 68,
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
  uom: 60,
  priced_qty: 76,
  rate: 94,
  gross_amount: 100,
  actions: 64,
};

// Tăng version khi thay cấu trúc cột để localStorage cũ không làm lệch vùng tiền.
const COLUMN_WIDTH_STORAGE_KEY = "alumdoor:sales-order:grid-widths:v5";
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
      className="min-w-0 text-center"
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

function dynamicDisplayValue(fieldname: DynamicFieldName, value: unknown): string {
  if (value == null || value === "") return "";
  if (fieldname === "has_butterfly_bracket") return Number(value) ? "Có" : "Không";
  if ([
    "width_m", "height_m", "mesh_height_m", "cut_width_m", "length_m", "qty_bar",
    "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count", "estimated_weight_kg",
  ].includes(fieldname)) return quantity(value);
  return text(value);
}

function appliedRuleNames(line: SalesLine): string[] {
  const snapshots = Array.isArray(line._commercial?.pricing_rule_snapshots)
    ? line._commercial!.pricing_rule_snapshots!
    : [];
  return [...new Set(snapshots.map((snapshot) => pricingRuleLabel(snapshot.rule_name)).filter(Boolean))];
}

function BomBlock(props: {
  line: SalesLine;
  expanded: boolean;
  readOnly: boolean;
  colSpan: number;
  onToggle: () => void;
  onBomActualChange: (key: string, rows: BomActualComponentRow[]) => void;
}) {
  const preview = props.line._bomPreview;
  const components = Array.isArray(preview?.components) ? preview!.components! : [];
  const requirements = Array.isArray(preview?.actual_requirements) ? preview!.actual_requirements! : [];
  if (!text(preview?.bom_no) && !components.length && !requirements.length && !props.line._bomError) return null;
  const status = props.line._bomError
    ? "BOM chưa resolve"
    : preview?.actual_complete === false
      ? `BOM · ${components.length} vật tư · còn thiếu`
      : components.length
        ? `BOM ✓ ${components.length} vật tư`
        : text(preview?.bom_no) ? `BOM ✓ ${text(preview?.bom_no)}` : "BOM đã xác định";
  return (
    <TableRow className="border-b-2 bg-muted/20 hover:bg-muted/20" data-section="sales-v2-bom-block">
      <TableCell colSpan={props.colSpan} className="p-0">
        <div className="border-l-2 border-primary/30 bg-background/70">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left hover:bg-muted/40"
            onClick={props.onToggle}
          >
            <span className="flex items-center gap-2 text-xs font-semibold">
              {props.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              BOM / vật tư
              {text(preview?.bom_template_code) ? <Badge variant="outline" className="font-mono text-[10px]">{text(preview?.bom_template_code)}</Badge> : null}
            </span>
            <span className={props.line._bomError ? "text-[10px] text-destructive" : "text-[10px] text-muted-foreground"}>{status}</span>
          </button>
          {props.expanded ? (
            <div className="space-y-2 px-3 py-2.5">
              {props.line._bomError ? (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{props.line._bomError}</span>
                </div>
              ) : null}
              {!components.length && text(preview?.bom_no) ? (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs">BOM áp dụng: <strong>{text(preview?.bom_no)}</strong></div>
              ) : null}
              {components.length ? (
                <div className="overflow-x-auto rounded-md border-2 border-border">
                  <div className="grid min-w-[700px] grid-cols-[38px_140px_minmax(160px,1.2fr)_minmax(150px,1fr)_78px_70px] bg-muted text-center text-[10px] font-semibold text-foreground">
                    <div className="px-2 py-1.5">#</div><div className="px-2 py-1.5">Mã vật tư</div><div className="px-2 py-1.5">Tên vật tư</div><div className="px-2 py-1.5">Quy cách / nguồn</div><div className="px-2 py-1.5">SL</div><div className="px-2 py-1.5">ĐVT</div>
                  </div>
                  {components.map((component, index) => {
                    const itemCode = text(component.item_code);
                    const itemName = text(props.line._bomComponentNames?.[itemCode]) || itemCode;
                    const detail = text(component.note) || text(component.component_key) || text(component.source_rule);
                    return <div key={`${itemCode}-${text(component.component_key)}-${index}`} className="grid min-w-[700px] grid-cols-[38px_140px_minmax(160px,1.2fr)_minmax(150px,1fr)_78px_70px] border-t text-center text-[11px] first:border-t-0">
                      <div className="px-2 py-1.5 text-muted-foreground">{index + 1}</div><div className="truncate px-2 py-1.5 font-mono text-[10px]">{itemCode || "—"}</div><div className="truncate px-2 py-1.5">{itemName || "—"}</div><div className="truncate px-2 py-1.5 text-muted-foreground">{detail || "—"}</div><div className="px-2 py-1.5 tabular-nums">{quantity(component.qty)}</div><div className="px-2 py-1.5">{text(component.stock_uom) || "—"}</div>
                    </div>;
                  })}
                </div>
              ) : null}
              {requirements.length ? (
                <details open={preview?.actual_complete === false} className="rounded-md border bg-card">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">Vật tư thực tế cần xác nhận {preview?.actual_complete === false ? "· còn thiếu" : "· đã đủ"}</summary>
                  <div className="border-t p-2.5">
                    <AlumdoorBomActualEditor requirements={requirements} value={props.line.bom_actual_components ?? []} disabled={props.readOnly || Boolean(props.line._loading)} onChange={(rows) => props.onBomActualChange(props.line._key, rows)} />
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export interface AlumdoorSalesOrderLineTableCompleteProps {
  lines: SalesLine[];
  childMeta: DocTypeMeta | null;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  readOnly: boolean;
  selectedKeys: Set<string>;
  leafVariants: string[];
  onToggleSelection: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onPatch: (key: string, patch: Partial<SalesLine>) => void;
  onCommit: (key: string, field: string, value: unknown) => void;
  onAdd: () => void;
  onAddFive: () => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
  onDeleteSelected: () => void;
  onBomActualChange: (key: string, rows: BomActualComponentRow[]) => void;
}

export function AlumdoorSalesOrderLineTableComplete(props: AlumdoorSalesOrderLineTableCompleteProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [widths, setWidths] = useState<Record<ColumnId, number>>(loadStoredWidths);
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
  const rateField = fieldFromMeta(props.childMeta, "rate", "Đơn giá", "Currency");
  const discountField = fieldFromMeta(props.childMeta, "discount_percentage", "Chiết khấu %", "Percent");

  const activeLines = useMemo(() => props.lines.filter((line) => text(line.item_code)), [props.lines]);
  const dynamicColumns = useMemo(
    () => DYNAMIC_FIELD_ORDER.filter((fieldname) => activeLines.some((line) => fieldVisible(line, fieldname))),
    [activeLines],
  );
  const columnOrder = useMemo<ColumnId[]>(() => [
    "select", "index", "item_code", "item_name", "color",
    ...dynamicColumns,
    "quantity", "uom", "priced_qty", "rate", "gross_amount", "actions",
  ], [dynamicColumns]);
  const columnCount = columnOrder.length;
  const totalWidth = columnOrder.reduce((sum, id) => sum + widths[id], 0);
  const allSelected = props.lines.length > 0 && props.selectedKeys.size === props.lines.length;
  const partlySelected = props.selectedKeys.size > 0 && !allSelected;

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

  const head = (id: ColumnId, label: ReactNode) => (
    <TableHead
      key={id}
      style={{ width: widths[id], minWidth: widths[id], maxWidth: widths[id], ...stickyStyle(id, true) }}
      className="relative bg-muted px-1.5 text-center font-semibold text-foreground"
    >
      <div className="relative flex h-full min-h-9 items-center justify-center">
        <span className="min-w-0 flex-1 truncate text-center">{label}</span>
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
    const visible = fieldVisible(line, fieldname);
    const field = dynamicField(line, fieldname);
    const readOnly = props.readOnly || FORCE_READ_ONLY.has(fieldname) || fieldReadonly(line, fieldname);
    const required = fieldRequired(line, fieldname);
    const value = line[fieldname];
    return (
      <TableCell
        key={fieldname}
        style={{ width: widths[fieldname], minWidth: widths[fieldname], maxWidth: widths[fieldname] }}
        className={`${rowTone} px-1.5 py-1.5 text-center align-middle`}
      >
        {!visible ? <span aria-label="Không áp dụng" /> : readOnly ? (
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
                if (["Select", "Link", "Check"].includes(field.fieldtype)) props.onCommit(line._key, fieldname, normalizedValue);
              }}
              onCommit={() => props.onCommit(line._key, fieldname, line[fieldname])}
              registry={props.registry}
              services={props.services}
              parentDoctype="Sales Order Item"
              docValues={line}
              roles={props.roles}
              required={required}
              readOnly={readOnly}
              compact
              hideLabel
              className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_input]:!text-center [&_button]:!h-8 [&_button]:!justify-center"
            />
          </GridField>
        )}
      </TableCell>
    );
  };

  return <section className="overflow-hidden rounded-lg border-2 border-border bg-card" data-section="sales-v2-lines-complete">
    <div className="flex min-h-9 items-center justify-between gap-2 border-b-2 border-border bg-muted/30 px-3 py-1.5">
      <div className="min-w-0"><h2 className="text-sm font-semibold">Chi tiết bán hàng</h2><p className="truncate text-[10px] text-muted-foreground">Cột quy cách tự hiện theo mặt hàng; kéo mép tiêu đề để đổi độ rộng cột.</p></div>
      <div className="text-[10px] text-muted-foreground">Enter → ô tiếp theo</div>
    </div>
    <div className="overflow-x-auto">
      <Table
        unwrapped
        className="table-fixed text-center text-[11px] [&_td]:border-r [&_td]:border-border [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-border [&_th:last-child]:border-r-0"
        style={{ width: `max(100%, ${totalWidth}px)` }}
      >
        <colgroup>{columnOrder.map((id) => <col key={id} style={{ width: widths[id] }} />)}</colgroup>
        <TableHeader className="sticky top-0 z-30 border-b-2 border-border bg-muted backdrop-blur">
          <TableRow className="border-b-2 border-border hover:bg-transparent">
            {head("select", <Checkbox checked={allSelected ? true : partlySelected ? "indeterminate" : false} onCheckedChange={(value) => props.onToggleAll(value === true)} aria-label="Chọn tất cả dòng hàng" />)}
            {head("index", "STT")}
            {head("item_code", "Mã hàng")}
            {head("item_name", "Tên hàng")}
            {head("color", "Màu")}
            {dynamicColumns.map((fieldname) => head(fieldname, DYNAMIC_FALLBACK_LABELS[fieldname]))}
            {head("quantity", "SL")}
            {head("uom", "ĐVT")}
            {head("priced_qty", "Khối lượng")}
            {head("rate", "Đơn giá")}
            {head("gross_amount", "Thành tiền")}
            {head("actions", "")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.lines.map((line, rowIndex) => {
            const quantityField = primaryQuantityField(line);
            const pricedQty = linePricedQuantity(line);
            const allowedColors = line._allowedColors ?? [];
            const allowedUoms = Array.isArray(line._context?.allowed_uoms) ? line._context!.allowed_uoms! : [];
            const colorField = selectField(childFieldByName.get("color"), "color", "Màu", allowedColors);
            const uomField = selectField(childFieldByName.get("uom"), "uom", "ĐVT", allowedUoms);
            const quantityDocField = fieldFromMeta(props.childMeta, quantityField, quantityField === "set_count" ? "Số bộ" : "Số lượng", quantityField === "set_count" ? "Int" : "Float");
            const hasBom = Boolean(line._bomError || line._bomPreview?.bom_no || (line._bomPreview?.components?.length ?? 0) || (line._bomPreview?.actual_requirements?.length ?? 0));
            const rowError = text(line._error) || text(line._pricingError);
            const benefits = Array.isArray(line._commercial?.benefit_items) ? line._commercial!.benefit_items! : [];
            const rowTone = rowIndex % 2 === 0 ? "bg-card" : "bg-muted/20";
            const needsApproval = lineCommercialNeedsApproval(line);
            const discountNeedsApproval = lineDiscountNeedsApproval(line);
            const policyDiscount = linePolicyDiscountPercentage(line);
            const policyRule = linePolicyDiscountRule(line);
            const enteredDiscount = numberValue(line.discount_percentage ?? line._commercial?.discount_percentage) ?? policyDiscount;
            const discountAmount = lineDiscountAmount(line);
            const adjustmentAmount = lineAdjustmentAmount(line);
            const grossAmount = numberValue(line._commercial?.gross_amount) ?? numberValue(line.amount);
            const payable = lineNetAmount(line);
            const ruleNames = appliedRuleNames(line);
            const frozenClass = `${rowTone} bg-clip-padding`;
            const commercialLeadSpan = Math.max(1, columnCount - 4);

            return <Fragment key={line._key}>
              <TableRow className={`${rowTone} [&>td]:border-b-0`} data-sales-row={line._key}>
                <TableCell style={{ width: widths.select, ...stickyStyle("select") }} className={`${frozenClass} px-1 py-1.5 text-center`}><Checkbox checked={props.selectedKeys.has(line._key)} onCheckedChange={(value) => props.onToggleSelection(line._key, value === true)} aria-label={`Chọn dòng ${rowIndex + 1}`} /></TableCell>
                <TableCell style={{ width: widths.index, ...stickyStyle("index") }} className={`${frozenClass} px-1 py-1.5 text-center tabular-nums`}>
                  <div className="flex items-center justify-center gap-1">
                    {hasBom ? <button type="button" className="grid size-5 place-items-center rounded hover:bg-muted" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(line._key)) next.delete(line._key); else next.add(line._key); return next; })} aria-label={`${expanded.has(line._key) ? "Thu gọn" : "Mở"} BOM dòng ${rowIndex + 1}`}>{expanded.has(line._key) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</button> : null}
                    <span>{rowIndex + 1}</span>
                    {line._loading ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : rowError ? <AlertTriangle className="size-3 text-destructive" /> : needsApproval ? <AlertTriangle className="size-3" /> : text(line.item_code) ? <CheckCircle2 className="size-3 text-muted-foreground" /> : null}
                  </div>
                </TableCell>
                <TableCell style={{ width: widths.item_code, ...stickyStyle("item_code") }} className={`${frozenClass} px-1.5 py-1.5 text-center align-middle`}>
                  <GridField rowKey={line._key} columnId="item_code" disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-item-${line._key}`} field={itemField} value={line.item_code} onChange={(value) => props.onCommit(line._key, "item_code", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!text-center [&_button]:!h-8 [&_button]:!justify-center" /></GridField>
                </TableCell>
                <TableCell style={{ width: widths.item_name, ...stickyStyle("item_name") }} className={`${frozenClass} px-1.5 py-1.5 text-center align-middle`}><div className="truncate text-center font-medium leading-4" title={text(line._itemName) || text(line.item_code)}>{text(line._itemName) || text(line.item_code) || "—"}</div>{text(line._context?.availability_status) ? <div className="truncate text-center text-[9px] text-muted-foreground" title={text(line._context?.availability_status)}>{text(line._context?.availability_status)}</div> : null}</TableCell>
                <TableCell style={{ width: widths.color }} className={`${rowTone} px-1.5 py-1.5 text-center align-middle`}>{allowedColors.length ? <GridField rowKey={line._key} columnId="color" disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-color-${line._key}`} field={colorField} value={line.color} onChange={(value) => props.onCommit(line._key, "color", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!text-center [&_button]:!h-8 [&_button]:!justify-center" /></GridField> : <div className="flex h-8 items-center justify-center truncate text-center text-muted-foreground">{text(line.color)}</div>}</TableCell>
                {dynamicColumns.map((fieldname) => renderDynamicCell(line, fieldname, rowTone))}
                <TableCell style={{ width: widths.quantity }} className={`${rowTone} px-1.5 py-1.5 text-center align-middle`}><GridField rowKey={line._key} columnId="quantity" disabled={props.readOnly || fieldReadonly(line, quantityField)}><AlumdoorSalesOrderField id={`sales-v2-complete-qty-${line._key}`} field={quantityDocField} value={line[quantityField]} onChange={(value) => props.onPatch(line._key, { [quantityField]: value == null || value === "" ? undefined : Number(value) })} onCommit={() => props.onCommit(line._key, quantityField, line[quantityField])} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required={fieldRequired(line, quantityField) || isAreaDoor(line)} readOnly={props.readOnly || fieldReadonly(line, quantityField)} compact hideLabel className="mx-auto [&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_input]:!text-center" /></GridField></TableCell>
                <TableCell style={{ width: widths.uom }} className={`${rowTone} px-1.5 py-1.5 text-center align-middle`}>{allowedUoms.length > 1 ? <GridField rowKey={line._key} columnId="uom" disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-uom-${line._key}`} field={uomField} value={line.uom} onChange={(value) => props.onCommit(line._key, "uom", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!text-center [&_button]:!h-8 [&_button]:!justify-center" /></GridField> : <span className="inline-flex h-8 items-center justify-center">{text(line.uom) || text(line._context?.selected_uom) || "—"}</span>}</TableCell>
                <TableCell style={{ width: widths.priced_qty }} className={`${rowTone} px-1.5 py-1.5 text-center align-middle tabular-nums`}><div className="font-semibold text-primary">{pricedQty === undefined ? "—" : quantity(pricedQty)}</div></TableCell>
                <TableCell style={{ width: widths.rate }} className={`${rowTone} px-1.5 py-1.5 text-center align-middle`}><GridField rowKey={line._key} columnId="rate" disabled={props.readOnly || fieldReadonly(line, "rate")}><AlumdoorSalesOrderField id={`sales-v2-complete-rate-${line._key}`} field={rateField} value={line.rate} onChange={(value) => props.onPatch(line._key, { rate: value == null || value === "" ? undefined : Number(value) })} onCommit={() => props.onCommit(line._key, "rate", line.rate)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required={fieldRequired(line, "rate") || Boolean(rateField.reqd)} readOnly={props.readOnly || fieldReadonly(line, "rate")} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_input]:!text-center [&_input]:tabular-nums" /></GridField></TableCell>
                <TableCell style={{ width: widths.gross_amount }} className={`${rowTone} px-1.5 py-1.5 text-center align-middle tabular-nums`}><strong>{grossAmount === undefined ? "—" : `${money(grossAmount)} ₫`}</strong></TableCell>
                <TableCell style={{ width: widths.actions }} className={`${rowTone} px-1 py-1.5 text-center align-middle`}><div className="flex items-center justify-center"><Button type="button" variant="ghost" size="icon-sm" disabled={props.readOnly || !text(line.item_code)} onClick={() => props.onDuplicate(line._key)} title="Nhân bản" aria-label={`Nhân bản dòng ${rowIndex + 1}`}><Copy className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={props.readOnly || props.lines.length <= 1} onClick={() => props.onDelete(line._key)} title="Xóa" aria-label={`Xóa dòng ${rowIndex + 1}`}><Trash2 className="size-3.5" /></Button></div></TableCell>
              </TableRow>

              {text(line.item_code) ? (
                <TableRow className={`${rowTone} border-b-2 border-border`} data-section="sales-v2-commercial-row">
                  <TableCell colSpan={commercialLeadSpan} className="px-2 py-1.5 text-left align-middle">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {ruleNames.length ? <div className="flex flex-wrap items-center gap-1">{ruleNames.slice(0, 4).map((rule) => <Badge key={rule} variant="outline" className="max-w-[220px] truncate text-[9px]">{rule}</Badge>)}{ruleNames.length > 4 ? <Badge variant="outline" className="text-[9px]">+{ruleNames.length - 4}</Badge> : null}</div> : <span className="text-[10px] text-muted-foreground">Chính sách chuẩn</span>}
                      {benefits.map((benefit, benefitIndex) => <span key={`${line._key}-benefit-${benefitIndex}`} className="inline-flex items-center gap-1 text-[10px]"><Gift className="size-3" />{text(benefit.label) || "Tặng kèm"} · {quantity(benefit.qty)} {text(benefit.uom)}</span>)}
                      {discountNeedsApproval ? <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="size-3" />CK {quantity(enteredDiscount)}% khác chuẩn {quantity(policyDiscount)}% — cần duyệt</span> : null}
                      {!discountNeedsApproval && needsApproval ? <span className="inline-flex items-center gap-1 text-[10px]"><AlertTriangle className="size-3" />Đơn giá khác chính sách — cần duyệt</span> : null}
                      {rowError ? <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="size-3" />{rowError}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell style={{ width: widths.priced_qty }} className="bg-background/70 px-1 py-1.5 text-center align-middle">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">Chiết khấu</div>
                    <div className="mx-auto mt-1 w-[64px]"><GridField rowKey={line._key} columnId="discount_percentage" disabled={props.readOnly || fieldReadonly(line, "discount_percentage")}><AlumdoorSalesOrderField id={`sales-v2-complete-discount-${line._key}`} field={discountField} value={line.discount_percentage ?? policyDiscount} onChange={(value) => props.onPatch(line._key, { discount_percentage: value == null || value === "" ? 0 : Number(value) })} onCommit={() => props.onCommit(line._key, "discount_percentage", line.discount_percentage ?? policyDiscount)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly || fieldReadonly(line, "discount_percentage")} compact hideLabel className="[&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_input]:!text-center [&_input]:text-[10px] [&_input]:tabular-nums" /></GridField></div>
                    <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-destructive">−{money(discountAmount)} ₫</div>
                  </TableCell>
                  <TableCell style={{ width: widths.rate }} className="bg-background/70 px-1 py-1.5 text-center align-middle">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">Phụ thu</div>
                    <div className="mt-2 whitespace-nowrap text-[11px] font-medium tabular-nums">{adjustmentAmount >= 0 ? "+" : "−"}{money(Math.abs(adjustmentAmount))} ₫</div>
                    <div className="mt-0.5 truncate text-[9px] text-muted-foreground" title={policyRule ? pricingRuleLabel(policyRule) : ""}>{policyRule ? pricingRuleLabel(policyRule) : "Theo chính sách"}</div>
                  </TableCell>
                  <TableCell style={{ width: widths.gross_amount }} className="bg-primary/5 px-1 py-1.5 text-center align-middle">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">Tiền phải trả</div>
                    <div className="mt-2 whitespace-nowrap text-sm font-bold tabular-nums text-primary">{money(payable)} ₫</div>
                  </TableCell>
                  <TableCell style={{ width: widths.actions }} className="bg-background/70 px-1 py-1.5" />
                </TableRow>
              ) : null}

              <BomBlock line={line} expanded={expanded.has(line._key)} readOnly={props.readOnly} colSpan={columnCount} onToggle={() => setExpanded((current) => { const next = new Set(current); if (next.has(line._key)) next.delete(line._key); else next.add(line._key); return next; })} onBomActualChange={props.onBomActualChange} />
            </Fragment>;
          })}
        </TableBody>
      </Table>
    </div>
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t-2 border-border bg-muted/20 px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={props.onAdd} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm dòng</Button>
        <Button type="button" variant="outline" size="sm" onClick={props.onAddFive} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm 5</Button>
        {props.selectedKeys.size ? <Button type="button" variant="destructive" size="sm" onClick={props.onDeleteSelected} disabled={props.readOnly}><Trash2 className="size-3.5" /> Xóa {props.selectedKeys.size}</Button> : null}
      </div>
      <div className="text-[10px] text-muted-foreground">{props.lines.length} dòng · độ rộng cột được nhớ trên trình duyệt</div>
    </div>
  </section>;
}
