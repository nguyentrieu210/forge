/** @jsxImportSource react */
import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Gift, Loader2, Plus, Trash2 } from "lucide-react";
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
  SPEC_FIELD_ORDER,
  fieldLabel,
  fieldReadonly,
  fieldRequired,
  fieldVisible,
  isAreaDoor,
  lineBillableArea,
  lineNetAmount,
  linePricedQuantity,
  money,
  numberValue,
  primaryQuantityField,
  quantity,
  text,
  type SalesLine,
  type SpecFieldName,
} from "./model.js";

const SPEC_FALLBACK_LABELS: Record<SpecFieldName, string> = {
  width_m: "Rộng PB / ray",
  height_m: "Cao PB",
  mesh_height_m: "Cao lưới",
  leaf_variant: "Kiểu lá / motor",
  ray_type: "Loại ray",
  has_butterfly_bracket: "Bản bướm",
  motor_model: "Mô tơ",
  length_m: "Dài / cây",
  qty_bar: "Số cây",
};

function fieldFromMeta(meta: DocTypeMeta | null, fieldname: string, fallbackLabel: string, fallbackType: DocField["fieldtype"] = "Float") {
  return meta?.fields.find((field) => field.fieldname === fieldname)
    ?? fallbackField(fieldname, fallbackLabel, fallbackType);
}

function specificationFields(line: SalesLine): SpecFieldName[] {
  return SPEC_FIELD_ORDER.filter((field) => fieldVisible(line, field));
}

function derivedFacts(line: SalesLine): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];
  const cutWidth = numberValue(line.cut_width_m);
  const leafCount = numberValue(line.leaf_count);
  const weight = numberValue(line.estimated_weight_kg);
  if (cutWidth !== undefined) facts.push({ label: "Rộng cắt", value: `${quantity(cutWidth)} m` });
  if (leafCount !== undefined) facts.push({ label: "Số lá", value: quantity(leafCount) });
  if (weight !== undefined) facts.push({ label: "KL dự kiến", value: `${quantity(weight)} kg` });
  return facts;
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

function GridField({ disabled = false, children }: { disabled?: boolean; children: React.ReactNode }) {
  return <div data-sales-grid-field data-sales-grid-disabled={disabled ? "true" : undefined} onKeyDownCapture={moveGridFocus}>{children}</div>;
}

function SpecEditor(props: {
  line: SalesLine;
  childMeta: DocTypeMeta | null;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  leafVariants: string[];
  readOnly: boolean;
  onPatch: (key: string, patch: Partial<SalesLine>) => void;
  onCommit: (key: string, field: string, value: unknown) => void;
}) {
  const fields = specificationFields(props.line);
  const facts = derivedFacts(props.line);
  if (!fields.length && !facts.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="min-w-[260px] space-y-1.5">
      {fields.length ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          {fields.map((fieldname) => {
            const fallbackLabel = SPEC_FALLBACK_LABELS[fieldname];
            const label = fieldLabel(props.line, props.childMeta, fieldname, fallbackLabel);
            const metaField = props.childMeta?.fields.find((field) => field.fieldname === fieldname);
            let field = fieldFromMeta(props.childMeta, fieldname, fallbackLabel, fieldname === "has_butterfly_bracket" ? "Check" : (fieldname === "leaf_variant" || fieldname === "ray_type") ? "Select" : fieldname === "motor_model" ? "Link" : "Float");
            if (fieldname === "leaf_variant") field = selectField(metaField, fieldname, label, props.leafVariants);
            if (fieldname === "motor_model" && !field.options) field = { ...field, fieldtype: "Link", options: "Item" } as DocField;
            const readOnly = props.readOnly || fieldReadonly(props.line, fieldname);
            const required = fieldRequired(props.line, fieldname);
            return (
              <GridField key={fieldname} disabled={readOnly}>
                <AlumdoorSalesOrderField
                  id={`sales-v2-complete-${props.line._key}-${fieldname}`}
                  field={field}
                  value={props.line[fieldname]}
                  onChange={(nextValue) => {
                    const normalizedValue = field.fieldtype === "Float" || field.fieldtype === "Int"
                      ? (nextValue == null || nextValue === "" ? undefined : Number(nextValue))
                      : field.fieldtype === "Check"
                        ? (nextValue ? 1 : 0)
                        : (text(nextValue) || undefined);
                    props.onPatch(props.line._key, { [fieldname]: normalizedValue });
                    if (["Select", "Link", "Check"].includes(field.fieldtype)) props.onCommit(props.line._key, fieldname, normalizedValue);
                  }}
                  onCommit={() => props.onCommit(props.line._key, fieldname, props.line[fieldname])}
                  registry={props.registry}
                  services={props.services}
                  parentDoctype="Sales Order Item"
                  docValues={props.line}
                  roles={props.roles}
                  required={required}
                  readOnly={readOnly}
                  compact
                  className="[&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_button]:!h-7"
                />
              </GridField>
            );
          })}
        </div>
      ) : null}
      {facts.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-dashed pt-1 text-[10px] text-muted-foreground">
          {facts.map((fact) => <span key={fact.label}><span className="font-medium text-foreground/75">{fact.label}:</span> {fact.value}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function BomBlock(props: {
  line: SalesLine;
  expanded: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onBomActualChange: (key: string, rows: BomActualComponentRow[]) => void;
}) {
  const preview = props.line._bomPreview;
  const components = Array.isArray(preview?.components) ? preview!.components! : [];
  const requirements = Array.isArray(preview?.actual_requirements) ? preview!.actual_requirements! : [];
  if (!components.length && !requirements.length && !props.line._bomError) return null;
  return (
    <TableRow className="border-b-2 bg-muted/20 hover:bg-muted/20" data-section="sales-v2-bom-block">
      <TableCell colSpan={14} className="p-0">
        <div className="ml-[72px] border-l-2 border-primary/20 bg-background/70">
          <button type="button" className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left hover:bg-muted/40" onClick={props.onToggle}>
            <span className="flex items-center gap-2 text-xs font-semibold">
              {props.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              BOM / vật tư trọn bộ
              {text(preview?.bom_template_code) ? <Badge variant="outline" className="font-mono text-[10px]">{text(preview?.bom_template_code)}</Badge> : null}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {components.length ? `${components.length} vật tư` : "Chưa resolve"}
              {preview?.actual_complete === false ? " · còn thiếu vật tư thực tế" : ""}
            </span>
          </button>
          {props.expanded ? (
            <div className="space-y-2 px-3 py-2.5">
              {props.line._bomError ? (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{props.line._bomError}</span>
                </div>
              ) : null}
              {components.length ? (
                <div className="overflow-hidden rounded-md border">
                  <div className="grid grid-cols-[42px_150px_minmax(180px,1.3fr)_minmax(180px,1fr)_92px_80px] bg-muted/60 text-[10px] font-semibold text-muted-foreground">
                    <div className="px-2 py-1.5 text-center">#</div><div className="px-2 py-1.5">Mã vật tư</div><div className="px-2 py-1.5">Tên vật tư</div><div className="px-2 py-1.5">Quy cách / nguồn</div><div className="px-2 py-1.5 text-right">SL</div><div className="px-2 py-1.5 text-center">ĐVT</div>
                  </div>
                  {components.map((component, index) => {
                    const itemCode = text(component.item_code);
                    const itemName = text(props.line._bomComponentNames?.[itemCode]) || itemCode;
                    const detail = text(component.note) || text(component.component_key) || text(component.source_rule);
                    return <div key={`${itemCode}-${text(component.component_key)}-${index}`} className="grid grid-cols-[42px_150px_minmax(180px,1.3fr)_minmax(180px,1fr)_92px_80px] border-t text-[11px] first:border-t-0">
                      <div className="px-2 py-1.5 text-center text-muted-foreground">{index + 1}</div><div className="truncate px-2 py-1.5 font-mono text-[10px]">{itemCode || "—"}</div><div className="truncate px-2 py-1.5">{itemName || "—"}</div><div className="truncate px-2 py-1.5 text-muted-foreground">{detail || "—"}</div><div className="px-2 py-1.5 text-right tabular-nums">{quantity(component.qty)}</div><div className="px-2 py-1.5 text-center">{text(component.stock_uom) || "—"}</div>
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
  useEffect(() => {
    const withBom = props.lines.filter((line) => (line._bomPreview?.components?.length ?? 0) > 0 || (line._bomPreview?.actual_requirements?.length ?? 0) > 0).map((line) => line._key);
    if (!withBom.length) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const key of withBom) next.add(key);
      return next;
    });
  }, [props.lines]);

  const childFieldByName = useMemo(() => new Map((props.childMeta?.fields ?? []).map((field) => [field.fieldname, field])), [props.childMeta]);
  const itemField = useMemo<DocField>(() => ({
    ...(childFieldByName.get("item_code") ?? fallbackField("item_code", "Mã hàng", "Link", "Item")),
    fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Item", allow_create: false,
    link_filters: JSON.stringify({ is_sales_item: 1, disabled: 0 }),
  } as DocField), [childFieldByName]);
  const rateField = fieldFromMeta(props.childMeta, "rate", "Đơn giá", "Currency");
  const discountField = fieldFromMeta(props.childMeta, "discount_percentage", "CK %", "Percent");
  const allSelected = props.lines.length > 0 && props.selectedKeys.size === props.lines.length;
  const partlySelected = props.selectedKeys.size > 0 && !allSelected;

  return <section className="overflow-hidden rounded-lg border bg-card" data-section="sales-v2-lines-complete">
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
      <div><h2 className="text-sm font-semibold">Chi tiết bán hàng</h2><p className="text-[10px] text-muted-foreground">Giá/chiết khấu là input nghiệp vụ; server vẫn là authority và quyết định approval khi ghi sổ.</p></div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={props.onAdd} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm dòng</Button>
        <Button type="button" variant="outline" size="sm" onClick={props.onAddFive} disabled={props.readOnly}><Plus className="size-3.5" /> Thêm 5</Button>
        {props.selectedKeys.size ? <Button type="button" variant="destructive" size="sm" onClick={props.onDeleteSelected} disabled={props.readOnly}><Trash2 className="size-3.5" /> Xóa {props.selectedKeys.size}</Button> : null}
      </div>
    </div>
    <div className="overflow-x-auto">
      <Table unwrapped className="min-w-[1640px] table-fixed text-[11px] [&_td]:border-r [&_td:last-child]:border-r-0 [&_th]:border-r [&_th:last-child]:border-r-0">
        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><TableRow className="hover:bg-transparent">
          <TableHead className="w-10 px-1 text-center"><Checkbox checked={allSelected ? true : partlySelected ? "indeterminate" : false} onCheckedChange={(checked) => props.onToggleAll(checked === true)} aria-label="Chọn tất cả dòng hàng" /></TableHead>
          <TableHead className="w-14 px-1 text-center">STT</TableHead><TableHead className="w-[150px] px-2">Mã hàng</TableHead><TableHead className="w-[180px] px-2">Tên hàng</TableHead><TableHead className="w-[115px] px-2">Màu</TableHead><TableHead className="w-[320px] px-2">Quy cách / Thông số</TableHead><TableHead className="w-[88px] px-2 text-center">SL</TableHead><TableHead className="w-[72px] px-2 text-center">ĐVT</TableHead><TableHead className="w-[92px] px-2 text-right">Diện tích</TableHead><TableHead className="w-[102px] px-2 text-right">SL tính giá</TableHead><TableHead className="w-[122px] px-2 text-right">Đơn giá</TableHead><TableHead className="w-[88px] px-2 text-right">CK %</TableHead><TableHead className="w-[132px] px-2 text-right">Thành tiền</TableHead><TableHead className="w-[72px] px-1" />
        </TableRow></TableHeader>
        <TableBody>
          {props.lines.map((line, rowIndex) => {
            const quantityField = primaryQuantityField(line);
            const area = lineBillableArea(line);
            const pricedQty = linePricedQuantity(line);
            const net = lineNetAmount(line);
            const allowedColors = line._allowedColors ?? [];
            const allowedUoms = Array.isArray(line._context?.allowed_uoms) ? line._context!.allowed_uoms! : [];
            const colorField = selectField(childFieldByName.get("color"), "color", "Màu", allowedColors);
            const uomField = selectField(childFieldByName.get("uom"), "uom", "ĐVT", allowedUoms);
            const quantityDocField = fieldFromMeta(props.childMeta, quantityField, quantityField === "set_count" ? "Số bộ" : "Số lượng", quantityField === "set_count" ? "Int" : "Float");
            const hasBom = Boolean(line._bomError || (line._bomPreview?.components?.length ?? 0) || (line._bomPreview?.actual_requirements?.length ?? 0));
            const rowError = text(line._error) || text(line._pricingError);
            const benefits = Array.isArray(line._commercial?.benefit_items) ? line._commercial!.benefit_items! : [];
            const rowTone = rowIndex % 2 === 0 ? "bg-card" : "bg-muted/15";
            const approval = line.rate_requires_approval === true || line.rate_requires_approval === 1 || text(line.rate_requires_approval) === "1";
            return <Fragment key={line._key}>
              <TableRow className={`${rowTone} ${hasBom || rowError || benefits.length ? "[&>td]:border-b-0" : "border-b"}`}>
                <TableCell className="px-1 py-1.5 text-center"><Checkbox checked={props.selectedKeys.has(line._key)} onCheckedChange={(checked) => props.onToggleSelection(line._key, checked === true)} aria-label={`Chọn dòng ${rowIndex + 1}`} /></TableCell>
                <TableCell className="px-1 py-1.5 text-center tabular-nums"><div className="flex items-center justify-center gap-1">{hasBom ? <button type="button" className="grid size-5 place-items-center rounded hover:bg-muted" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(line._key)) next.delete(line._key); else next.add(line._key); return next; })} aria-label={`${expanded.has(line._key) ? "Thu gọn" : "Mở"} BOM dòng ${rowIndex + 1}`}>{expanded.has(line._key) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</button> : null}<span>{rowIndex + 1}</span></div></TableCell>
                <TableCell className="px-2 py-1.5 align-top"><GridField disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-item-${line._key}`} field={itemField} value={line.item_code} onChange={(value) => props.onCommit(line._key, "item_code", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_button]:!h-8" /></GridField>{line._loading ? <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Đang resolve…</div> : null}</TableCell>
                <TableCell className="px-2 py-2 align-top"><div className="font-medium leading-4">{text(line._itemName) || text(line.item_code) || "—"}</div>{text(line._context?.availability_status) ? <div className="mt-1 line-clamp-2 text-[10px] leading-3.5 text-muted-foreground">{text(line._context?.availability_status)}</div> : null}</TableCell>
                <TableCell className="px-2 py-1.5 align-top">{allowedColors.length ? <GridField disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-color-${line._key}`} field={colorField} value={line.color} onChange={(value) => props.onCommit(line._key, "color", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_button]:!h-8" /></GridField> : <span className="text-muted-foreground">{text(line.color) || "—"}</span>}</TableCell>
                <TableCell className="px-2 py-1.5 align-top"><SpecEditor line={line} childMeta={props.childMeta} registry={props.registry} services={props.services} roles={props.roles} leafVariants={props.leafVariants} readOnly={props.readOnly} onPatch={props.onPatch} onCommit={props.onCommit} /></TableCell>
                <TableCell className="px-2 py-1.5 text-center align-top"><GridField disabled={props.readOnly || fieldReadonly(line, quantityField)}><AlumdoorSalesOrderField id={`sales-v2-complete-qty-${line._key}`} field={quantityDocField} value={line[quantityField]} onChange={(value) => props.onPatch(line._key, { [quantityField]: value == null || value === "" ? undefined : Number(value) })} onCommit={() => props.onCommit(line._key, quantityField, line[quantityField])} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required={fieldRequired(line, quantityField) || isAreaDoor(line)} readOnly={props.readOnly || fieldReadonly(line, quantityField)} compact hideLabel className="mx-auto max-w-[78px] [&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_input]:!text-center" /></GridField></TableCell>
                <TableCell className="px-2 py-1.5 text-center align-top">{allowedUoms.length > 1 ? <GridField disabled={props.readOnly}><AlumdoorSalesOrderField id={`sales-v2-complete-uom-${line._key}`} field={uomField} value={line.uom} onChange={(value) => props.onCommit(line._key, "uom", text(value) || undefined)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_button]:!h-8" /></GridField> : <span className="inline-flex h-8 items-center">{text(line.uom) || text(line._context?.selected_uom) || "—"}</span>}</TableCell>
                <TableCell className="px-2 py-2 text-right align-top tabular-nums">{area === undefined ? <span className="text-muted-foreground">—</span> : <span>{quantity(area)} m²</span>}</TableCell>
                <TableCell className="px-2 py-2 text-right align-top tabular-nums"><div className="font-semibold text-primary">{pricedQty === undefined ? "—" : quantity(pricedQty)}</div><div className="text-[10px] text-muted-foreground">server</div></TableCell>
                <TableCell className="px-2 py-1.5 align-top"><GridField disabled={props.readOnly || fieldReadonly(line, "rate")}><AlumdoorSalesOrderField id={`sales-v2-complete-rate-${line._key}`} field={rateField} value={line.rate} onChange={(value) => props.onPatch(line._key, { rate: value == null || value === "" ? undefined : Number(value) })} onCommit={() => props.onCommit(line._key, "rate", line.rate)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} required={fieldRequired(line, "rate") || Boolean(rateField.reqd)} readOnly={props.readOnly || fieldReadonly(line, "rate")} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_input]:!text-right [&_input]:tabular-nums" /></GridField>{text(line._commercial?.item_price) ? <div className="mt-1 truncate text-[9px] text-muted-foreground" title={text(line._commercial?.item_price)}>{text(line._commercial?.item_price)}</div> : null}{approval ? <Badge variant="outline" className="mt-1 text-[9px]">Cần duyệt giá</Badge> : null}</TableCell>
                <TableCell className="px-2 py-1.5 align-top"><GridField disabled={props.readOnly || fieldReadonly(line, "discount_percentage")}><AlumdoorSalesOrderField id={`sales-v2-complete-discount-${line._key}`} field={discountField} value={line.discount_percentage ?? 0} onChange={(value) => props.onPatch(line._key, { discount_percentage: value == null || value === "" ? 0 : Number(value) })} onCommit={() => props.onCommit(line._key, "discount_percentage", line.discount_percentage ?? 0)} registry={props.registry} services={props.services} parentDoctype="Sales Order Item" docValues={line} roles={props.roles} readOnly={props.readOnly || fieldReadonly(line, "discount_percentage")} compact hideLabel className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_input]:!text-right [&_input]:tabular-nums" /></GridField>{numberValue(line._commercial?.discount_amount) ? <div className="mt-1 text-right text-[9px] text-muted-foreground">−{money(line._commercial?.discount_amount)} ₫</div> : null}</TableCell>
                <TableCell className="px-2 py-2 text-right align-top tabular-nums"><div className="font-semibold">{money(net)} ₫</div>{numberValue(line._commercial?.adjustment_amount) ? <div className="text-[10px] text-muted-foreground">Điều chỉnh {money(line._commercial?.adjustment_amount)} ₫</div> : null}</TableCell>
                <TableCell className="px-1 py-1.5 text-center align-top"><div className="flex items-center justify-center"><Button type="button" variant="ghost" size="icon-sm" disabled={props.readOnly || !text(line.item_code)} onClick={() => props.onDuplicate(line._key)} title="Nhân bản" aria-label={`Nhân bản dòng ${rowIndex + 1}`}><Copy className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={props.readOnly || props.lines.length <= 1} onClick={() => props.onDelete(line._key)} title="Xóa" aria-label={`Xóa dòng ${rowIndex + 1}`}><Trash2 className="size-3.5" /></Button></div></TableCell>
              </TableRow>
              {rowError ? <TableRow className={`${rowTone} [&>td]:border-b-0`}><TableCell colSpan={14} className="px-3 py-1.5"><div className="ml-[72px] flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{rowError}</span></div></TableCell></TableRow> : null}
              {benefits.map((benefit, benefitIndex) => <TableRow key={`${line._key}-benefit-${benefitIndex}`} className="bg-primary/5 text-foreground [&>td]:border-b-0" data-section="sales-v2-benefit-row"><TableCell colSpan={14} className="px-3 py-1.5"><div className="ml-[72px] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-success/25 bg-success/5 px-3 py-2 text-xs"><Gift className="size-4 text-primary" /><strong>{text(benefit.label) || "Tặng kèm theo chính sách giá"}</strong><span className="font-mono text-[10px]">{text(benefit.item_code)}</span><span>{quantity(benefit.qty)} {text(benefit.uom)}</span>{text(benefit.source_rule) ? <span className="text-muted-foreground">· {text(benefit.source_rule)}</span> : null}</div></TableCell></TableRow>)}
              <BomBlock line={line} expanded={expanded.has(line._key)} readOnly={props.readOnly} onToggle={() => setExpanded((current) => { const next = new Set(current); if (next.has(line._key)) next.delete(line._key); else next.add(line._key); return next; })} onBomActualChange={props.onBomActualChange} />
            </Fragment>;
          })}
        </TableBody>
      </Table>
    </div>
    <div className="flex min-h-9 items-center justify-between gap-3 border-t bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground"><span>{props.lines.length} dòng bán hàng</span><span>Enter chuyển sang ô nghiệp vụ tiếp theo; Tab vẫn theo thứ tự tự nhiên.</span></div>
  </section>;
}
