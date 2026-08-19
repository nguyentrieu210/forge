/** @jsxImportSource react */
import { useMemo, useState, type ReactNode } from "react";
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

export type PurchaseLine = Doc & {
  _itemName?: string;
  _itemGroup?: string;
  _inventoryMode?: string;
  _materialSpecification?: string;
  _defaultPurchaseUom?: string;
  _loading?: boolean;
  _error?: string;
};

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
  const parsed = numeric(value);
  if (parsed === undefined) return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(parsed)} đ`;
}

export function purchaseLineKey(line: PurchaseLine, index = 0): string {
  return text(line.name) || `purchase-row-${index + 1}`;
}

export function isAluminumPurchaseLine(line: PurchaseLine): boolean {
  return text(line._inventoryMode ?? line.inventory_mode) === "Nhôm cây/lá";
}

function fieldFromMeta(meta: DocTypeMeta, fieldname: string, label: string, type: DocField["fieldtype"] = "Data", options?: string): DocField {
  return meta.fields.find((field) => field.fieldname === fieldname)
    ?? fallbackField(fieldname, label, type, options);
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
  const activeLines = useMemo(() => props.lines.filter((line) => text(line.item_code)), [props.lines]);
  const hasAluminum = useMemo(() => activeLines.some(isAluminumPurchaseLine), [activeLines]);
  const hasOrdinary = useMemo(() => activeLines.length === 0 || activeLines.some((line) => !isAluminumPurchaseLine(line)), [activeLines]);
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
  const colorField = useMemo(() => ({
    ...fieldFromMeta(props.childMeta, "color", "Màu", "Link", "Item Color"),
    fieldname: "color",
    label: "Màu",
    fieldtype: "Link" as const,
    options: "Item Color",
    allow_create: false,
  }), [props.childMeta]);
  const stampedField = useMemo(() => selectField(
    props.childMeta.fields.find((field) => field.fieldname === "is_stamped"),
    "is_stamped",
    "Dập",
    ["Có", "Không"],
  ), [props.childMeta]);

  const editor = (
    line: PurchaseLine,
    key: string,
    fieldname: string,
    label: string,
    type: DocField["fieldtype"],
    options?: string,
    readOnly = false,
  ) => {
    const field = fieldFromMeta(props.childMeta, fieldname, label, type, options);
    return (
      <AlumdoorSalesOrderField
        id={`purchase-grid-${key}-${fieldname}`}
        field={field}
        value={line[fieldname]}
        onChange={(value) => props.onPatch(key, { [fieldname]: normalizeFieldValue(field, value) } as Partial<PurchaseLine>)}
        onCommit={() => props.onCommit(key, fieldname, line[fieldname])}
        registry={props.registry}
        services={props.services}
        parentDoctype="Purchase Order"
        docValues={line}
        roles={props.roles}
        readOnly={props.readOnly || readOnly || Boolean(field.read_only)}
        compact
        hideLabel
        className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_input]:!px-2 [&_input]:!text-center [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center [&_button]:!px-2"
      />
    );
  };

  const head = (className: string, label: ReactNode) => (
    <TableHead className={`bg-primary px-1.5 text-center font-semibold leading-tight text-primary-foreground whitespace-normal ${className}`}>
      <div className="flex min-h-10 items-center justify-center py-1">{label}</div>
    </TableHead>
  );

  const columnCount = 5 + (hasAluminum ? 7 : 0) + (hasOrdinary ? 1 : 0) + 4;

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
              {hasAluminum ? <>
                {head("w-36", "Quy cách")}
                {head("w-28", "Màu")}
                {head("w-24", <span>Dài cây<br/><span className="text-[9px] font-medium opacity-90">(m)</span></span>)}
                {head("w-24", "Kg/m")}
                {head("w-24", "Số cây/lá")}
                {head("w-28", "Kg đặt")}
                {head("w-20", "Dập")}
              </> : null}
              {hasOrdinary ? head("w-24", "SL") : null}
              {head("w-20", "ĐVT")}
              {head("w-28", <span>Đơn giá<br/><span className="text-[9px] font-medium opacity-90">(VNĐ)</span></span>)}
              {head("w-32", <span>Thành tiền<br/><span className="text-[9px] font-medium opacity-90">(VNĐ)</span></span>)}
              {head("w-20", "")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.lines.map((line, index) => {
              const key = purchaseLineKey(line, index);
              const aluminum = isAluminumPurchaseLine(line);
              const itemName = text(line._itemName ?? line.item_name);
              const itemGroup = text(line._itemGroup ?? line.item_group);
              const materialSpec = text(line._materialSpecification ?? line.material_specification);
              const rowTone = text(line.item_code) ? "bg-primary/[0.035]" : (index % 2 === 0 ? "bg-card" : "bg-muted/20");
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
                      parentDoctype="Purchase Order"
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
                  {hasAluminum ? <>
                    <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell title={materialSpec}>{aluminum ? materialSpec || "—" : "—"}</ReadOnlyCell></TableCell>
                    <TableCell className={`${rowTone} px-1.5 py-1`}>{aluminum ? (
                      <AlumdoorSalesOrderField
                        id={`purchase-grid-${key}-color`}
                        field={colorField}
                        value={line.color}
                        onChange={(value) => {
                          props.onPatch(key, { color: value } as Partial<PurchaseLine>);
                          props.onCommit(key, "color", value);
                        }}
                        registry={props.registry}
                        services={props.services}
                        parentDoctype="Purchase Order"
                        docValues={line}
                        roles={props.roles}
                        readOnly={props.readOnly}
                        compact
                        hideLabel
                        className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_input]:!h-8 [&_input]:!w-full [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center"
                      />
                    ) : <ReadOnlyCell>—</ReadOnlyCell>}</TableCell>
                    <TableCell className={`${rowTone} px-1.5 py-1`}>{aluminum ? editor(line, key, "length_m", "Dài cây", "Float") : <ReadOnlyCell>—</ReadOnlyCell>}</TableCell>
                    <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell>{aluminum ? quantity(line.theoretical_kg_per_m) : "—"}</ReadOnlyCell></TableCell>
                    <TableCell className={`${rowTone} px-1.5 py-1`}>{aluminum ? editor(line, key, "qty_bar", "Số cây/lá", "Int") : <ReadOnlyCell>—</ReadOnlyCell>}</TableCell>
                    <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{aluminum ? quantity(line.theoretical_kg ?? line.qty) : "—"}</ReadOnlyCell></TableCell>
                    <TableCell className={`${rowTone} px-1.5 py-1`}>{aluminum ? (
                      <AlumdoorSalesOrderField
                        id={`purchase-grid-${key}-is_stamped`}
                        field={stampedField}
                        value={line.is_stamped}
                        onChange={(value) => {
                          props.onPatch(key, { is_stamped: value } as Partial<PurchaseLine>);
                          props.onCommit(key, "is_stamped", value);
                        }}
                        registry={props.registry}
                        services={props.services}
                        parentDoctype="Purchase Order"
                        docValues={line}
                        roles={props.roles}
                        readOnly={props.readOnly}
                        compact
                        hideLabel
                        className="w-full max-w-full [&_.mf-control]:!min-h-8 [&_.mf-control]:!w-full [&_button]:!h-8 [&_button]:!max-w-full [&_button]:!justify-center"
                      />
                    ) : <ReadOnlyCell>—</ReadOnlyCell>}</TableCell>
                  </> : null}
                  {hasOrdinary ? <TableCell className={`${rowTone} px-1.5 py-1`}>{aluminum ? <ReadOnlyCell>—</ReadOnlyCell> : editor(line, key, "qty", "SL", "Float")}</TableCell> : null}
                  <TableCell className={`${rowTone} px-1.5 py-1`}><ReadOnlyCell strong>{text(line.uom) || "—"}</ReadOnlyCell></TableCell>
                  <TableCell className={`${rowTone} px-1.5 py-1`}>{editor(line, key, "rate", "Đơn giá", "Currency", undefined, props.priceLocked)}</TableCell>
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
