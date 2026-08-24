/** @jsxImportSource react */
import { formatMoney } from "@metaforge/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { Button, Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metaforge/ui";
import { AlumdoorSalesOrderField, fallbackField, selectField } from "./sales-order-v2/AlumdoorSalesOrderField.js";

export interface PurchaseFieldOverride {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
  link_filters?: string;
  sequence?: number;
  source?: string;
}

export type PurchaseLine = Doc & {
  _itemName?: string;
  _itemGroup?: string;
  _inventoryMode?: string;
  _materialSpecification?: string;
  _defaultPurchaseUom?: string;
  _lastPurchaseRate?: number;
  _overrides?: Record<string, PurchaseFieldOverride>;
  _loading?: boolean;
  _error?: string;
};

type DynamicFieldName =
  | "material_specification"
  | "color"
  | "condition"
  | "length_m"
  | "width_m"
  | "theoretical_kg_per_m"
  | "qty_bundle"
  | "qty_bar"
  | "theoretical_kg"
  | "is_stamped"
  | "so_no"
  | "qty";

const DYNAMIC_FIELD_ORDER: DynamicFieldName[] = [
  // "material_specification" (Quy cách) đã ẩn theo chốt chủ xưởng 24/08/2026 — quy cách vẫn
  // lưu trên dòng và vẫn là nguồn của Dài cây / Kg barem, chỉ không chiếm một cột nữa.
  "color", "condition", "length_m", "width_m",
  "qty_bar", "qty_bundle", "theoretical_kg_per_m", "theoretical_kg", "is_stamped", "so_no", "qty",
];
const DYNAMIC_FALLBACK_LABELS: Record<DynamicFieldName, string> = {
  material_specification: "Quy cách", color: "Màu", condition: "Tình trạng", length_m: "Dài cây",
  width_m: "Rộng", theoretical_kg_per_m: "Kg barem", qty_bundle: "Số bó", qty_bar: "Số cây/lá/tấm",
  theoretical_kg: "Kg đặt", is_stamped: "Dập", so_no: "Số SO NCC", qty: "SL",
};
const DYNAMIC_TYPES: Record<DynamicFieldName, DocField["fieldtype"]> = {
  material_specification: "Link", color: "Link", condition: "Select", length_m: "Float", width_m: "Float",
  theoretical_kg_per_m: "Float", qty_bundle: "Int", qty_bar: "Int", theoretical_kg: "Float",
  is_stamped: "Select", so_no: "Data", qty: "Float",
};
const DYNAMIC_OPTIONS: Partial<Record<DynamicFieldName, string>> = { material_specification: "Material Specification", color: "Item Color" };
const DYNAMIC_WIDTHS: Record<DynamicFieldName, string> = {
  material_specification: "w-32", color: "w-24", condition: "w-24", length_m: "w-20", width_m: "w-20",
  theoretical_kg_per_m: "w-20", qty_bundle: "w-16", qty_bar: "w-20", theoretical_kg: "w-24",
  // "Dập" nay là ô tick nên chỉ cần đủ chỗ cho cái ô vuông.
  is_stamped: "w-14", so_no: "w-24", qty: "w-20",
};

export interface AlumdoorPurchaseOrderItemsGridProps {
  lines: PurchaseLine[];
  childMeta: DocTypeMeta;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  readOnly: boolean;
  priceLocked: boolean;
  priceHistoryByItem?: Map<string, number | null>;
  onPatch: (key: string, patch: Partial<PurchaseLine>) => void;
  onCommit: (key: string, fieldname: string, value: unknown) => void;
  onAdd: () => void;
  onAddFive: () => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
}

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function numeric(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined;
}
function quantity(value: unknown, digits = 3): string {
  const parsed = numeric(value); return parsed === undefined ? "—" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(parsed);
}
function money(value: unknown): string { return formatMoney(numeric(value), { style: "plain" }); }
export function purchaseLineKey(line: PurchaseLine, index = 0): string { return text(line.name) || `purchase-row-${index + 1}`; }
export function purchaseFieldOverride(line: PurchaseLine, fieldname: string): PurchaseFieldOverride | undefined { return line._overrides?.[fieldname]; }

/** Legacy name kept for existing callers; semantically this now means server-declared catch-weight. */
export function isAluminumPurchaseLine(line: PurchaseLine): boolean {
  const qty = purchaseFieldOverride(line, "qty");
  const qtyHidden = qty?.hidden === true || qty?.hidden === 1;
  const qtyReadonly = qty?.read_only === true || qty?.read_only === 1;
  return Boolean(qtyHidden && qtyReadonly);
}

/** Structural visibility comes only from the server runtime; values are data, never schema. */
export function purchaseFieldVisible(line: PurchaseLine, fieldname: string): boolean {
  const override = purchaseFieldOverride(line, fieldname);
  if (override) return !(override.hidden === true || override.hidden === 1);
  return fieldname === "qty";
}
export function purchaseFieldRequired(line: PurchaseLine, fieldname: string): boolean {
  const override = purchaseFieldOverride(line, fieldname);
  if (override?.reqd !== undefined) return override.reqd === true || override.reqd === 1;
  return fieldname === "qty";
}
function purchaseFieldReadonly(line: PurchaseLine, fieldname: string): boolean {
  const override = purchaseFieldOverride(line, fieldname);
  if (override?.read_only !== undefined) return override.read_only === true || override.read_only === 1;
  return ["material_specification", "theoretical_kg_per_m", "theoretical_kg"].includes(fieldname);
}
function purchaseFieldLabel(line: PurchaseLine, meta: DocTypeMeta, fieldname: DynamicFieldName): string {
  return text(purchaseFieldOverride(line, fieldname)?.label) || text(meta.fields.find((field) => field.fieldname === fieldname)?.label) || DYNAMIC_FALLBACK_LABELS[fieldname];
}
function fieldFromMeta(meta: DocTypeMeta, fieldname: string, label: string, type: DocField["fieldtype"] = "Data", options?: string): DocField {
  return meta.fields.find((field) => field.fieldname === fieldname) ?? fallbackField(fieldname, label, type, options);
}
function fieldForLine(meta: DocTypeMeta, line: PurchaseLine, fieldname: DynamicFieldName): DocField {
  const override = purchaseFieldOverride(line, fieldname);
  const base = fieldFromMeta(meta, fieldname, DYNAMIC_FALLBACK_LABELS[fieldname], DYNAMIC_TYPES[fieldname], DYNAMIC_OPTIONS[fieldname]);
  const next: DocField = { ...base, label: text(override?.label) || base.label, reqd: override?.reqd ?? base.reqd, read_only: override?.read_only ?? base.read_only } as DocField;
  if (override?.link_filters) next.link_filters = override.link_filters;
  return next;
}
function normalizeFieldValue(field: DocField, value: unknown): unknown {
  if (["Float", "Int", "Currency", "Percent"].includes(field.fieldtype)) {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value); return Number.isFinite(parsed) ? parsed : value;
  }
  if (field.fieldtype === "Check") return value ? 1 : 0;
  return value;
}
function ReadOnlyCell(props: { children: ReactNode; strong?: boolean; title?: string }) {
  return <div className={`flex min-h-8 min-w-0 items-center justify-center px-1.5 text-center text-[11px] ${props.strong ? "font-semibold text-foreground" : "text-muted-foreground"}`} title={props.title}>{props.children}</div>;
}

export function AlumdoorPurchaseOrderItemsGrid(props: AlumdoorPurchaseOrderItemsGridProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const pendingEditValues = useRef<Map<string, unknown>>(new Map());
  const commitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const editKey = useCallback((lineKey: string, fieldname: string) => `${lineKey}\u001f${fieldname}`, []);
  const flushCommit = useCallback((lineKey: string, fieldname: string) => {
    const key = editKey(lineKey, fieldname); const timer = commitTimers.current.get(key); if (timer) clearTimeout(timer);
    commitTimers.current.delete(key); if (!pendingEditValues.current.has(key)) return;
    const value = pendingEditValues.current.get(key); pendingEditValues.current.delete(key); props.onCommit(lineKey, fieldname, value);
  }, [editKey, props.onCommit]);
  const scheduleCommit = useCallback((lineKey: string, fieldname: string) => {
    const key = editKey(lineKey, fieldname); const current = commitTimers.current.get(key); if (current) clearTimeout(current);
    commitTimers.current.set(key, setTimeout(() => flushCommit(lineKey, fieldname), 300));
  }, [editKey, flushCommit]);
  const patchAndBuffer = useCallback((lineKey: string, fieldname: string, field: DocField, rawValue: unknown) => {
    const value = normalizeFieldValue(field, rawValue); props.onPatch(lineKey, { [fieldname]: value } as Partial<PurchaseLine>);
    const key = editKey(lineKey, fieldname);
    if (["Select", "Link", "Dynamic Link", "Check"].includes(field.fieldtype)) {
      const timer = commitTimers.current.get(key); if (timer) clearTimeout(timer); commitTimers.current.delete(key); pendingEditValues.current.delete(key); props.onCommit(lineKey, fieldname, value); return;
    }
    pendingEditValues.current.set(key, value); scheduleCommit(lineKey, fieldname);
  }, [editKey, props.onCommit, props.onPatch, scheduleCommit]);
  useEffect(() => () => { for (const timer of commitTimers.current.values()) clearTimeout(timer); commitTimers.current.clear(); pendingEditValues.current.clear(); }, []);

  const activeLines = useMemo(() => props.lines.filter((line) => text(line.item_code)), [props.lines]);
  const dynamicColumns = useMemo<DynamicFieldName[]>(() => {
    if (!activeLines.length) return ["qty"];
    const sequence = (fieldname: DynamicFieldName) => {
      const values = activeLines.map((line) => Number(purchaseFieldOverride(line, fieldname)?.sequence)).filter(Number.isFinite);
      return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
    };
    return DYNAMIC_FIELD_ORDER
      .filter((fieldname) => activeLines.some((line) => purchaseFieldVisible(line, fieldname)))
      .sort((left, right) => sequence(left) - sequence(right) || DYNAMIC_FIELD_ORDER.indexOf(left) - DYNAMIC_FIELD_ORDER.indexOf(right));
  }, [activeLines]);
  const allKeys = useMemo(() => props.lines.map((line, index) => purchaseLineKey(line, index)), [props.lines]);
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selected.has(key));

  const itemField = useMemo<DocField>(() => ({ ...fieldFromMeta(props.childMeta, "item_code", "Mã hàng", "Link", "Item"), fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Item", allow_create: false, link_filters: JSON.stringify({ is_purchase_item: 1, disabled: 0 }) } as DocField), [props.childMeta]);
  const head = (className: string, label: ReactNode, key?: string) => <TableHead key={key} className={`bg-primary px-1.5 text-center font-semibold leading-tight text-primary-foreground whitespace-normal ${className}`}><div className="flex min-h-10 items-center justify-center py-1">{label}</div></TableHead>;
  /**
   * Vài nhãn do CLIENT chốt, không lấy theo server.
   *
   * `theoretical_kg_per_m` server đặt "Kg/m" — đọc trên giấy thì không phân biệt được với Kg
   * cân thực tế. Chủ xưởng chốt 24/08/2026 gọi là "Kg barem" (số suy từ định mức), nên nhãn
   * này phải thắng nhãn server chứ không chỉ làm giá trị lui.
   */
  const NHAN_CHOT: Partial<Record<DynamicFieldName, string>> = { theoretical_kg_per_m: "Kg barem" };
  const dynamicHeaderLabel = (fieldname: DynamicFieldName): string => {
    const chot = NHAN_CHOT[fieldname];
    if (chot) return chot;
    const contextual = activeLines.filter((line) => purchaseFieldVisible(line, fieldname)).map((line) => purchaseFieldLabel(line, props.childMeta, fieldname)).find(Boolean);
    return text(contextual).replace(/\s*\([^)]*\)\s*$/i, "").replace(/\s+/g, " ") || DYNAMIC_FALLBACK_LABELS[fieldname];
  };
  const editor = (line: PurchaseLine, key: string, fieldname: DynamicFieldName) => {
    let field = fieldForLine(props.childMeta, line, fieldname);
    if (["is_stamped", "condition"].includes(fieldname) && field.fieldtype === "Select") field = selectField(props.childMeta.fields.find((candidate) => candidate.fieldname === fieldname), fieldname, text(field.label) || DYNAMIC_FALLBACK_LABELS[fieldname], text(field.options).split("\n").map((v) => v.trim()).filter(Boolean));
    const readOnly = props.readOnly || purchaseFieldReadonly(line, fieldname) || Boolean(field.read_only);
    return <AlumdoorSalesOrderField id={`purchase-grid-${key}-${fieldname}`} field={field} value={line[fieldname]} onChange={(value) => patchAndBuffer(key, fieldname, field, value)} onCommit={() => flushCommit(key, fieldname)} registry={props.registry} services={props.services} parentDoctype={props.childMeta.name} docValues={line} roles={props.roles} required={purchaseFieldRequired(line, fieldname)} readOnly={readOnly} compact hideLabel className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!px-2 [&_input]:!text-center [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center [&_button]:!px-2" />;
  };
  const renderDynamicCell = (line: PurchaseLine, key: string, fieldname: DynamicFieldName, rowTone: string) => {
    if (!purchaseFieldVisible(line, fieldname)) return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell>—</ReadOnlyCell></TableCell>;
    if (fieldname === "material_specification") { const value = text(line._materialSpecification ?? line.material_specification); return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong title={value}>{value || "—"}</ReadOnlyCell></TableCell>; }
    /*
     * "Dập" là câu hỏi CÓ/KHÔNG, nên vẽ bằng ô tick chứ không phải hộp chọn — chốt chủ xưởng
     * 24/08/2026. Trường vẫn là `Select("Có
Không")` nên GIÁ TRỊ LƯU không đổi (`"Có"` /
     * `"Không"`): không đụng lược đồ, không phải chuyển dữ liệu cũ, và mọi chỗ đọc sau vẫn thấy
     * đúng chuỗi nó vẫn luôn thấy.
     */
    if (fieldname === "is_stamped") {
      const daDap = text(line.is_stamped) === "Có";
      const khoa = props.readOnly || purchaseFieldReadonly(line, "is_stamped");
      return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}>
        <div className="flex h-8 items-center justify-center">
          <Checkbox
            checked={daDap}
            disabled={khoa}
            onCheckedChange={(checked) => props.onCommit(key, "is_stamped", checked === true ? "Có" : "Không")}
            aria-label="Dập"
          />
        </div>
      </TableCell>;
    }
    if (fieldname === "theoretical_kg_per_m") return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell>{quantity(line.theoretical_kg_per_m)}</ReadOnlyCell></TableCell>;
    if (fieldname === "theoretical_kg") return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{quantity(line.theoretical_kg)}</ReadOnlyCell></TableCell>;
    return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}>{editor(line, key, fieldname)}</TableCell>;
  };
  const columnCount = 4 + dynamicColumns.length + 4;
  const deleteSelected = () => { for (const key of selected) props.onDelete(key); setSelected(new Set()); };

  return <section className="overflow-hidden rounded-lg border-2 border-border bg-card" data-section="purchase-order-dedicated-grid">
    <div className="overflow-x-auto"><Table unwrapped className="min-w-[920px] table-fixed text-center text-[11px] [&_td]:border-r-[1.5px] [&_td]:border-border/90 [&_td:last-child]:border-r-0 [&_th]:border-r-[1.5px] [&_th]:border-border/90 [&_th:last-child]:border-r-0">
      <TableHeader className="sticky top-0 z-30 border-b-[3px] border-primary/70 bg-primary"><TableRow className="border-b-[3px] border-primary/70 bg-primary hover:bg-primary">
        {head("w-10", <Checkbox className="border-primary-foreground/80 bg-background data-[state=checked]:border-primary-foreground" checked={allSelected} disabled={props.readOnly} onCheckedChange={(checked) => setSelected(checked ? new Set(allKeys) : new Set())} aria-label="Chọn tất cả dòng mua" />)}
        {head("w-10", "STT")}{head("w-32", "Mã hàng")}{head("w-40", "Tên hàng")}
        {dynamicColumns.map((fieldname) => head(DYNAMIC_WIDTHS[fieldname], ["length_m", "width_m"].includes(fieldname) ? <span>{dynamicHeaderLabel(fieldname)}<br/><span className="text-[9px] font-medium opacity-90">(m)</span></span> : dynamicHeaderLabel(fieldname), fieldname))}
        {head("w-16", "ĐVT")}{head("w-24", <span>Đơn giá<br/><span className="text-[9px] font-medium opacity-90">(VNĐ)</span></span>)}{head("w-28", <span>Thành tiền<br/><span className="text-[9px] font-medium opacity-90">(VNĐ)</span></span>)}{head("w-16", "")}
      </TableRow></TableHeader>
      <TableBody>{props.lines.map((line, index) => {
        const key = purchaseLineKey(line, index); const itemName = text(line._itemName ?? line.item_name); const itemGroup = text(line._itemGroup ?? line.item_group); const rowTone = text(line.item_code) ? "bg-primary/[0.035]" : (index % 2 === 0 ? "bg-card" : "bg-muted/20"); const rateField = fieldFromMeta(props.childMeta, "rate", "Đơn giá", "Currency");
        return [<TableRow key={key} className={`${rowTone} border-b hover:bg-muted/20`} data-purchase-row-key={key}>
          <TableCell className={`${rowTone} px-1 text-center`}><Checkbox checked={selected.has(key)} disabled={props.readOnly} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(key); else next.delete(key); return next; })} aria-label={`Chọn dòng ${index + 1}`} /></TableCell>
          <TableCell className={`${rowTone} px-1 text-center font-mono tabular-nums`}>{index + 1}</TableCell>
          <TableCell className={`${rowTone} px-1.5 py-1`}><AlumdoorSalesOrderField id={`purchase-grid-${key}-item_code`} field={itemField} value={line.item_code} onChange={(value) => props.onCommit(key, "item_code", normalizeFieldValue(itemField, value))} registry={props.registry} services={props.services} parentDoctype={props.childMeta.name} docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!px-2 [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center [&_button]:!px-2" /></TableCell>
          <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong title={itemName}>{line._loading ? <Loader2 className="size-3.5 animate-spin" /> : itemName || "—"}</ReadOnlyCell></TableCell>
          {dynamicColumns.map((fieldname) => renderDynamicCell(line, key, fieldname, rowTone))}
          <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{text(line.uom) || "—"}</ReadOnlyCell></TableCell>
          <TableCell className={`${rowTone} px-1.5 py-1`}>{(() => { const changeBps = props.priceHistoryByItem?.get(text(line.item_code)); const changePct = typeof changeBps === "number" ? changeBps / 100 : undefined; return <>{line._lastPurchaseRate !== undefined || changePct !== undefined ? <div className="mb-0.5 truncate text-center text-[9px] leading-tight text-muted-foreground" title="Giá tham khảo lần mua gần nhất — máy không tự lấy làm giá.">{line._lastPurchaseRate !== undefined ? <>Giá gần nhất: {money(line._lastPurchaseRate)}</> : null}{changePct !== undefined ? <span className={changePct > 0 ? "text-destructive" : changePct < 0 ? "text-emerald-600" : ""}> ({changePct > 0 ? "+" : ""}{changePct.toFixed(1)}%)</span> : null}</div> : null}<AlumdoorSalesOrderField id={`purchase-grid-${key}-rate`} field={rateField} value={line.rate} onChange={(value) => patchAndBuffer(key, "rate", rateField, value)} onCommit={() => flushCommit(key, "rate")} registry={props.registry} services={props.services} parentDoctype={props.childMeta.name} docValues={line} roles={props.roles} readOnly={props.readOnly || props.priceLocked} compact hideLabel className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!text-center" /></>; })()}</TableCell>
          <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{money(line.amount ?? ((numeric(line.qty) ?? 0) * (numeric(line.rate) ?? 0)))}</ReadOnlyCell></TableCell>
          <TableCell className={`${rowTone} px-1 py-1 text-center`}><div className="flex items-center justify-center gap-0.5"><Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={props.readOnly || !text(line.item_code)} onClick={() => props.onDuplicate(key)} title="Nhân dòng"><Copy className="size-3.5" /></Button><Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={props.readOnly} onClick={() => props.onDelete(key)} title="Xóa dòng"><Trash2 className="size-3.5" /></Button></div></TableCell>
        </TableRow>, line._error ? <TableRow key={`${key}-error`} className="border-b bg-destructive/5 hover:bg-destructive/5"><TableCell colSpan={columnCount} className="px-3 py-1.5 text-left text-xs text-destructive">{text(line._error)}</TableCell></TableRow> : null];
      })}</TableBody>
    </Table></div>
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t-2 border-border bg-muted/20 px-3 py-1.5"><div className="flex flex-wrap items-center gap-1.5"><Button type="button" variant="outline" size="sm" onClick={props.onAdd} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm dòng</Button><Button type="button" variant="outline" size="sm" onClick={props.onAddFive} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm 5</Button>{selected.size ? <Button type="button" variant="destructive" size="sm" onClick={deleteSelected} disabled={props.readOnly}><Trash2 className="size-3.5" /> Xóa {selected.size}</Button> : null}</div><div className="text-[10px] text-muted-foreground">Cột theo Purchase Runtime · field trống vẫn hiện nếu schema yêu cầu</div></div>
  </section>;
}
