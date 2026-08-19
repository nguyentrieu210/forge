/** @jsxImportSource react */
import { formatMoney } from "@metaforge/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import {
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";
import { AlumdoorSalesOrderField, fallbackField, selectField } from "./sales-order-v2/AlumdoorSalesOrderField.js";

export interface PurchaseFieldOverride {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
  link_filters?: string;
}

export type PurchaseLine = Doc & {
  _itemName?: string;
  _itemGroup?: string;
  _inventoryMode?: string;
  _materialSpecification?: string;
  _defaultPurchaseUom?: string;
  _overrides?: Record<string, PurchaseFieldOverride>;
  _loading?: boolean;
  _error?: string;
};

type DynamicFieldName =
  | "material_specification"
  | "color"
  | "length_m"
  | "theoretical_kg_per_m"
  | "qty_bundle"
  | "qty_bar"
  | "theoretical_kg"
  | "is_stamped"
  | "qty";

const DYNAMIC_FIELD_ORDER: DynamicFieldName[] = [
  "material_specification",
  "color",
  "length_m",
  "theoretical_kg_per_m",
  "qty_bundle",
  "qty_bar",
  "theoretical_kg",
  "is_stamped",
  "qty",
];

const DYNAMIC_FALLBACK_LABELS: Record<DynamicFieldName, string> = {
  material_specification: "Quy cách",
  color: "Màu",
  length_m: "Dài cây",
  theoretical_kg_per_m: "Kg/m",
  qty_bundle: "Số bó",
  qty_bar: "Số cây/lá",
  theoretical_kg: "Kg đặt",
  is_stamped: "Dập",
  qty: "SL",
};

const DYNAMIC_TYPES: Record<DynamicFieldName, DocField["fieldtype"]> = {
  material_specification: "Link",
  color: "Link",
  length_m: "Float",
  theoretical_kg_per_m: "Float",
  qty_bundle: "Int",
  qty_bar: "Int",
  theoretical_kg: "Float",
  is_stamped: "Select",
  qty: "Float",
};

const DYNAMIC_OPTIONS: Partial<Record<DynamicFieldName, string>> = {
  material_specification: "Material Specification",
  color: "Item Color",
};

const DYNAMIC_WIDTHS: Record<DynamicFieldName, string> = {
  material_specification: "w-36",
  color: "w-28",
  length_m: "w-24",
  theoretical_kg_per_m: "w-24",
  qty_bundle: "w-20",
  qty_bar: "w-24",
  theoretical_kg: "w-28",
  is_stamped: "w-20",
  qty: "w-24",
};

const ALUMINUM_DYNAMIC_FIELDS = new Set<string>([
  "material_specification",
  "length_m",
  "theoretical_kg_per_m",
  "qty_bar",
  "theoretical_kg",
  "is_stamped",
]);

export interface AlumdoorPurchaseOrderItemsGridProps {
  lines: PurchaseLine[];
  childMeta: DocTypeMeta;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  readOnly: boolean;
  priceLocked: boolean;
  onPatch: (key: string, patch: Partial<PurchaseLine>) => void;
  onCommit: (key: string, fieldname: string, value: unknown) => void;
  onAdd: () => void;
  onAddFive: () => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function numeric(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function quantity(value: unknown, digits = 3): string {
  const parsed = numeric(value);
  if (parsed === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(parsed);
}

function money(value: unknown): string {
  return formatMoney(numeric(value), { style: "plain" });
}

export function purchaseLineKey(line: PurchaseLine, index = 0): string {
  return text(line.name) || `purchase-row-${index + 1}`;
}

export function isAluminumPurchaseLine(line: PurchaseLine): boolean {
  return text(line._inventoryMode ?? line.inventory_mode) === "Nhôm cây/lá";
}

function isTubeProfile(line: PurchaseLine): boolean {
  return text(line.measurement_profile).toLocaleLowerCase("vi") === "ống/trục";
}

export function purchaseFieldOverride(line: PurchaseLine, fieldname: string): PurchaseFieldOverride | undefined {
  return line._overrides?.[fieldname];
}

export function purchaseFieldVisible(line: PurchaseLine, fieldname: string): boolean {
  const override = purchaseFieldOverride(line, fieldname);
  if (override?.hidden === true || override?.hidden === 1) return false;
  if (override && (override.hidden === false || override.hidden === 0 || override.reqd !== undefined || override.read_only !== undefined || text(override.label))) return true;

  if (isAluminumPurchaseLine(line)) {
    if (fieldname === "qty") return false;
    if (fieldname === "color") return !isTubeProfile(line);
    if (fieldname === "qty_bundle") return false;
    if (ALUMINUM_DYNAMIC_FIELDS.has(fieldname)) return true;
  } else if (fieldname === "qty") {
    return true;
  }

  return line[fieldname] !== undefined && line[fieldname] !== null && line[fieldname] !== "";
}

export function purchaseFieldRequired(line: PurchaseLine, fieldname: string): boolean {
  const override = purchaseFieldOverride(line, fieldname);
  if (override?.reqd === true || override?.reqd === 1) return true;
  if (override?.reqd === false || override?.reqd === 0) return false;
  if (!isAluminumPurchaseLine(line)) return fieldname === "qty";
  if (fieldname === "color") return !isTubeProfile(line);
  return ["length_m", "qty_bar", "is_stamped"].includes(fieldname);
}

function purchaseFieldReadonly(line: PurchaseLine, fieldname: string): boolean {
  const override = purchaseFieldOverride(line, fieldname);
  if (override?.read_only === true || override?.read_only === 1) return true;
  if (override?.read_only === false || override?.read_only === 0) return false;
  return ["material_specification", "theoretical_kg_per_m", "theoretical_kg"].includes(fieldname)
    || (isAluminumPurchaseLine(line) && fieldname === "qty");
}

function purchaseFieldLabel(line: PurchaseLine, meta: DocTypeMeta, fieldname: DynamicFieldName): string {
  return text(purchaseFieldOverride(line, fieldname)?.label)
    || text(meta.fields.find((field) => field.fieldname === fieldname)?.label)
    || DYNAMIC_FALLBACK_LABELS[fieldname];
}

function fieldFromMeta(meta: DocTypeMeta, fieldname: string, label: string, type: DocField["fieldtype"] = "Data", options?: string): DocField {
  return meta.fields.find((field) => field.fieldname === fieldname)
    ?? fallbackField(fieldname, label, type, options);
}

function fieldForLine(meta: DocTypeMeta, line: PurchaseLine, fieldname: DynamicFieldName): DocField {
  const override = purchaseFieldOverride(line, fieldname);
  const base = fieldFromMeta(meta, fieldname, DYNAMIC_FALLBACK_LABELS[fieldname], DYNAMIC_TYPES[fieldname], DYNAMIC_OPTIONS[fieldname]);
  const next: DocField = {
    ...base,
    label: text(override?.label) || base.label,
    reqd: override?.reqd ?? base.reqd,
    read_only: override?.read_only ?? base.read_only,
  } as DocField;
  if (override?.link_filters) next.link_filters = override.link_filters;
  return next;
}

function normalizeFieldValue(field: DocField, value: unknown): unknown {
  if (["Float", "Int", "Currency", "Percent"].includes(field.fieldtype)) {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (field.fieldtype === "Check") return value ? 1 : 0;
  return value;
}

function ReadOnlyCell(props: { children: ReactNode; strong?: boolean; title?: string }) {
  return (
    <div
      className={`flex min-h-8 min-w-0 items-center justify-center px-1.5 text-center text-[11px] ${props.strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}
      title={props.title}
    >
      {props.children}
    </div>
  );
}

export function AlumdoorPurchaseOrderItemsGrid(props: AlumdoorPurchaseOrderItemsGridProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const pendingEditValues = useRef<Map<string, unknown>>(new Map());
  const commitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const editKey = useCallback((lineKey: string, fieldname: string) => `${lineKey}\u001f${fieldname}`, []);
  const flushCommit = useCallback((lineKey: string, fieldname: string) => {
    const key = editKey(lineKey, fieldname);
    const timer = commitTimers.current.get(key);
    if (timer) clearTimeout(timer);
    commitTimers.current.delete(key);
    if (!pendingEditValues.current.has(key)) return;
    const value = pendingEditValues.current.get(key);
    pendingEditValues.current.delete(key);
    props.onCommit(lineKey, fieldname, value);
  }, [editKey, props.onCommit]);
  const scheduleCommit = useCallback((lineKey: string, fieldname: string) => {
    const key = editKey(lineKey, fieldname);
    const current = commitTimers.current.get(key);
    if (current) clearTimeout(current);
    commitTimers.current.set(key, setTimeout(() => flushCommit(lineKey, fieldname), 300));
  }, [editKey, flushCommit]);
  const patchAndBuffer = useCallback((lineKey: string, fieldname: string, field: DocField, rawValue: unknown) => {
    const value = normalizeFieldValue(field, rawValue);
    props.onPatch(lineKey, { [fieldname]: value } as Partial<PurchaseLine>);
    const key = editKey(lineKey, fieldname);
    if (["Select", "Link", "Dynamic Link", "Check"].includes(field.fieldtype)) {
      const timer = commitTimers.current.get(key);
      if (timer) clearTimeout(timer);
      commitTimers.current.delete(key);
      pendingEditValues.current.delete(key);
      props.onCommit(lineKey, fieldname, value);
      return;
    }
    pendingEditValues.current.set(key, value);
    scheduleCommit(lineKey, fieldname);
  }, [editKey, props.onCommit, props.onPatch, scheduleCommit]);

  useEffect(() => () => {
    for (const timer of commitTimers.current.values()) clearTimeout(timer);
    commitTimers.current.clear();
    pendingEditValues.current.clear();
  }, []);

  const activeLines = useMemo(() => props.lines.filter((line) => text(line.item_code)), [props.lines]);
  const dynamicColumns = useMemo<DynamicFieldName[]>(() => {
    if (!activeLines.length) return ["qty"];
    return DYNAMIC_FIELD_ORDER.filter((fieldname) => activeLines.some((line) => purchaseFieldVisible(line, fieldname)));
  }, [activeLines]);
  const allKeys = useMemo(() => props.lines.map((line, index) => purchaseLineKey(line, index)), [props.lines]);
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selected.has(key));

  const itemField = useMemo<DocField>(() => ({
    ...fieldFromMeta(props.childMeta, "item_code", "Mã hàng", "Link", "Item"),
    fieldname: "item_code",
    label: "Mã hàng",
    fieldtype: "Link",
    options: "Item",
    allow_create: false,
    link_filters: JSON.stringify({ is_purchase_item: 1, disabled: 0 }),
  } as DocField), [props.childMeta]);

  const head = (className: string, label: ReactNode) => (
    <TableHead className={`bg-primary px-1.5 text-center font-semibold leading-tight text-primary-foreground whitespace-normal ${className}`}>
      <div className="flex min-h-10 items-center justify-center py-1">{label}</div>
    </TableHead>
  );

  const dynamicHeaderLabel = (fieldname: DynamicFieldName): string => {
    const contextual = activeLines
      .filter((line) => purchaseFieldVisible(line, fieldname))
      .map((line) => purchaseFieldLabel(line, props.childMeta, fieldname))
      .find(Boolean);
    return text(contextual).replace(/\s*\([^)]*\)\s*$/i, "").replace(/\s+/g, " ") || DYNAMIC_FALLBACK_LABELS[fieldname];
  };

  const editor = (line: PurchaseLine, key: string, fieldname: DynamicFieldName, forceReadOnly = false) => {
    let field = fieldForLine(props.childMeta, line, fieldname);
    if (fieldname === "is_stamped") {
      field = selectField(
        props.childMeta.fields.find((candidate) => candidate.fieldname === "is_stamped"),
        "is_stamped",
        text(field.label) || "Dập",
        ["Có", "Không"],
      );
    }
    const readOnly = props.readOnly || forceReadOnly || purchaseFieldReadonly(line, fieldname) || Boolean(field.read_only);
    return (
      <AlumdoorSalesOrderField
        id={`purchase-grid-${key}-${fieldname}`}
        field={field}
        value={line[fieldname]}
        onChange={(value) => patchAndBuffer(key, fieldname, field, value)}
        onCommit={() => flushCommit(key, fieldname)}
        registry={props.registry}
        services={props.services}
        parentDoctype={props.childMeta.name}
        docValues={line}
        roles={props.roles}
        required={purchaseFieldRequired(line, fieldname)}
        readOnly={readOnly}
        compact
        hideLabel
        className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!px-2 [&_input]:!text-center [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center [&_button]:!px-2"
      />
    );
  };

  const renderDynamicCell = (line: PurchaseLine, key: string, fieldname: DynamicFieldName, rowTone: string) => {
    const visible = purchaseFieldVisible(line, fieldname);
    if (!visible) return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell>—</ReadOnlyCell></TableCell>;
    if (fieldname === "material_specification") {
      const value = text(line._materialSpecification ?? line.material_specification);
      return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong title={value}>{value || "—"}</ReadOnlyCell></TableCell>;
    }
    if (fieldname === "theoretical_kg_per_m") {
      return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell>{quantity(line.theoretical_kg_per_m)}</ReadOnlyCell></TableCell>;
    }
    if (fieldname === "theoretical_kg") {
      return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{quantity(line.theoretical_kg ?? line.qty)}</ReadOnlyCell></TableCell>;
    }
    return <TableCell key={fieldname} className={`${rowTone} px-1.5 py-1`}>{editor(line, key, fieldname)}</TableCell>;
  };

  const columnCount = 5 + dynamicColumns.length + 4;

  const deleteSelected = () => {
    for (const key of selected) props.onDelete(key);
    setSelected(new Set());
  };

  return (
    <section className="overflow-hidden rounded-lg border-2 border-border bg-card" data-section="purchase-order-dedicated-grid">
      <div className="overflow-x-auto">
        <Table
          unwrapped
          className="min-w-[1120px] table-fixed text-center text-[11px] [&_td]:border-r-[1.5px] [&_td]:border-border/90 [&_td:last-child]:border-r-0 [&_th]:border-r-[1.5px] [&_th]:border-border/90 [&_th:last-child]:border-r-0"
        >
          <TableHeader className="sticky top-0 z-30 border-b-[3px] border-primary/70 bg-primary">
            <TableRow className="border-b-[3px] border-primary/70 bg-primary hover:bg-primary">
              {head("w-10", <Checkbox
                className="border-primary-foreground/80 bg-background data-[state=checked]:border-primary-foreground"
                checked={allSelected}
                disabled={props.readOnly}
                onCheckedChange={(checked) => setSelected(checked ? new Set(allKeys) : new Set())}
                aria-label="Chọn tất cả dòng mua"
              />)}
              {head("w-12", "STT")}
              {head("w-44", "Mã hàng")}
              {head("w-48", "Tên hàng")}
              {head("w-32", "Loại hàng")}
              {dynamicColumns.map((fieldname) => head(
                DYNAMIC_WIDTHS[fieldname],
                fieldname === "length_m"
                  ? <span>{dynamicHeaderLabel(fieldname)}<br/><span className="text-[9px] font-medium opacity-90">(m)</span></span>
                  : dynamicHeaderLabel(fieldname),
              ))}
              {head("w-20", "ĐVT")}
              {head("w-28", <span>Đơn giá<br/><span className="text-[9px] font-medium opacity-90">(VNĐ)</span></span>)}
              {head("w-32", <span>Thành tiền<br/><span className="text-[9px] font-medium opacity-90">(VNĐ)</span></span>)}
              {head("w-20", "")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.lines.map((line, index) => {
              const key = purchaseLineKey(line, index);
              const itemName = text(line._itemName ?? line.item_name);
              const itemGroup = text(line._itemGroup ?? line.item_group);
              const rowTone = text(line.item_code) ? "bg-primary/[0.035]" : (index % 2 === 0 ? "bg-card" : "bg-muted/20");
              const rateField = fieldFromMeta(props.childMeta, "rate", "Đơn giá", "Currency");
              return [
                <TableRow key={key} className={`${rowTone} border-b hover:bg-muted/20`} data-purchase-row-key={key}>
                  <TableCell className={`${rowTone} px-1 text-center`}>
                    <Checkbox
                      checked={selected.has(key)}
                      disabled={props.readOnly}
                      onCheckedChange={(checked) => setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(key); else next.delete(key);
                        return next;
                      })}
                      aria-label={`Chọn dòng ${index + 1}`}
                    />
                  </TableCell>
                  <TableCell className={`${rowTone} px-1 text-center font-mono tabular-nums`}>{index + 1}</TableCell>
                  <TableCell className={`${rowTone} px-1.5 py-1`}>
                    <AlumdoorSalesOrderField
                      id={`purchase-grid-${key}-item_code`}
                      field={itemField}
                      value={line.item_code}
                      onChange={(value) => props.onCommit(key, "item_code", normalizeFieldValue(itemField, value))}
                      registry={props.registry}
                      services={props.services}
                      parentDoctype={props.childMeta.name}
                      docValues={line}
                      roles={props.roles}
                      readOnly={props.readOnly}
                      compact
                      hideLabel
                      className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!px-2 [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center [&_button]:!px-2"
                    />
                  </TableCell>
                  <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong title={itemName}>{line._loading ? <Loader2 className="size-3.5 animate-spin" /> : itemName || "—"}</ReadOnlyCell></TableCell>
                  <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell title={itemGroup}>{itemGroup || "—"}</ReadOnlyCell></TableCell>
                  {dynamicColumns.map((fieldname) => renderDynamicCell(line, key, fieldname, rowTone))}
                  <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{text(line.uom) || "—"}</ReadOnlyCell></TableCell>
                  <TableCell className={`${rowTone} px-1.5 py-1`}>
                    <AlumdoorSalesOrderField
                      id={`purchase-grid-${key}-rate`}
                      field={rateField}
                      value={line.rate}
                      onChange={(value) => patchAndBuffer(key, "rate", rateField, value)}
                      onCommit={() => flushCommit(key, "rate")}
                      registry={props.registry}
                      services={props.services}
                      parentDoctype={props.childMeta.name}
                      docValues={line}
                      roles={props.roles}
                      readOnly={props.readOnly || props.priceLocked}
                      compact
                      hideLabel
                      className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!text-center [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center"
                    />
                  </TableCell>
                  <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{money(line.amount ?? ((numeric(line.qty) ?? 0) * (numeric(line.rate) ?? 0)))}</ReadOnlyCell></TableCell>
                  <TableCell className={`${rowTone} px-1 py-1 text-center`}>
                    <div className="flex items-center justify-center gap-0.5">
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={props.readOnly || !text(line.item_code)} onClick={() => props.onDuplicate(key)} title="Nhân dòng"><Copy className="size-3.5" /></Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={props.readOnly} onClick={() => props.onDelete(key)} title="Xóa dòng"><Trash2 className="size-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>,
                line._error ? (
                  <TableRow key={`${key}-error`} className="border-b bg-destructive/5 hover:bg-destructive/5">
                    <TableCell colSpan={columnCount} className="px-3 py-1.5 text-xs text-destructive">Dòng {index + 1}: {line._error}</TableCell>
                  </TableRow>
                ) : null,
              ];
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" disabled={props.readOnly} onClick={props.onAdd}><Plus className="size-3.5" /> Thêm dòng</Button>
          <Button type="button" variant="outline" size="sm" disabled={props.readOnly} onClick={props.onAddFive}><Plus className="size-3.5" /> Thêm 5</Button>
          {selected.size ? <Button type="button" variant="ghost" size="sm" disabled={props.readOnly} onClick={deleteSelected}><Trash2 className="size-3.5" /> Xóa {selected.size} dòng</Button> : null}
        </div>
        <span className="text-[11px] text-muted-foreground">{props.lines.length} dòng</span>
      </div>
    </section>
  );
}
