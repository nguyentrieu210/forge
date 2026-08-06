/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { resolveField, type AppActionInputTable, type Doc, type DocField, type DocTypeMeta, type Fieldtype } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";
import { resolveChildGridColumns } from "../form/ChildGrid.js";

const NUMERIC_TYPES = new Set(["Int", "Float", "Currency", "Percent"]);
const AUTO_FIELDS = new Set([
  "stock_uom", "inventory_mode", "measurement_profile", "material_specification", "theoretical_kg_per_m",
  "theoretical_kg", "actual_kg_per_m", "actual_kg_per_sqm", "amount", "item_name", "description",
]);

export interface ActionChildGridProps {
  actionName: string;
  table: AppActionInputTable;
  childMeta: DocTypeMeta;
  rows: Doc[];
  onChange: (rows: Doc[]) => void;
  registry: ControlRegistry;
  services?: FieldServices;
  roles?: string[];
  parentDoc?: Record<string, unknown>;
  readOnly?: boolean;
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number | undefined {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}
function rowKey(row: Doc, index: number): string { return String(row.name ?? `row-${index}`); }
function isLayout(fieldtype: string): boolean {
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(fieldtype);
}
function blankRow(meta: DocTypeMeta, table: AppActionInputTable, index: number): Doc {
  const row: Doc = { name: `new-${Date.now()}-${index}`, doctype: meta.name } as Doc;
  for (const column of table.columns) if (column.default != null) row[column.fieldname] = column.default;
  return row;
}
function parsePasted(field: DocField, raw: string): unknown {
  const value = raw.trim();
  if (!value) return undefined;
  if (field.fieldtype === "Check") {
    const normalized = value.toLocaleLowerCase("vi");
    if (["1", "true", "yes", "y", "x", "có", "co"].includes(normalized)) return 1;
    if (["0", "false", "no", "n", "không", "khong"].includes(normalized)) return 0;
    return undefined;
  }
  if (NUMERIC_TYPES.has(field.fieldtype)) {
    const normalized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return value;
}
function columnWidth(field: DocField): number {
  if (field.fieldname === "item_code") return 210;
  if (["note", "description"].includes(field.fieldname)) return 220;
  if (["warehouse", "supplier", "customer"].includes(field.fieldname)) return 180;
  if (field.fieldtype === "Link" || field.fieldtype === "Dynamic Link") return 155;
  if (field.fieldtype === "Currency" || ["rate", "amount"].includes(field.fieldname)) return 135;
  if (field.fieldtype === "Select") return 125;
  if (NUMERIC_TYPES.has(field.fieldtype)) return 105;
  if (field.fieldtype === "Check") return 82;
  return 140;
}
function shortLabel(field: DocField): string {
  const labels: Record<string, string> = {
    item_code: "Mã SP", length_m: "Dài", width_m: "Rộng", height_m: "Cao", set_count: "Bộ/Cái",
    qty_bar: "Cây/Lá", actual_weight_kg: "Kg cân", qty: "SL", rate: "Đơn giá", color: "Màu", colour: "Màu",
    condition: "Tình trạng", is_stamped: "Dập", so_no: "SO NCC", warehouse: "Kho", note: "Ghi chú",
  };
  return labels[field.fieldname] ?? field.label ?? field.fieldname;
}
function computed(row: Doc, meta: DocTypeMeta): Doc {
  const next = { ...row } as Doc;
  const has = (name: string) => (meta.fields ?? []).some((field) => field.fieldname === name);
  if (String(next.inventory_mode ?? "") === "Nhôm cây/lá") {
    const length = number(next.length_m), bars = number(next.qty_bar), kgPerM = number(next.theoretical_kg_per_m);
    if (length && bars && kgPerM) {
      const kg = length * bars * kgPerM;
      if (has("theoretical_kg")) next.theoretical_kg = kg;
      if (has("qty") && (next.qty == null || next.qty === "")) next.qty = kg;
    }
  }
  const qty = number(next.qty), rate = number(next.rate);
  if (has("amount") && qty !== undefined && rate !== undefined) next.amount = qty * rate;
  return next;
}

/**
 * Action metadata is the authority for the PRIMARY operational columns. Canonical child
 * metadata contributes field semantics/permissions only; it must not re-expand the action
 * into every technical field that belongs on the full document form.
 */
function resolveDeclaredColumns(table: AppActionInputTable, meta: DocTypeMeta, rows: Doc[], parent: Record<string, unknown> | undefined, roles: string[] | undefined): DocField[] {
  const canonical = resolveChildGridColumns(meta, rows, parent, roles);
  const canonicalByName = new Map(canonical.map((field) => [field.fieldname, field]));
  const metaByName = new Map((meta.fields ?? []).filter((field) => !isLayout(field.fieldtype)).map((field) => [field.fieldname, field]));
  return table.columns.map((declared) => {
    const source = canonicalByName.get(declared.fieldname) ?? metaByName.get(declared.fieldname);
    const base: DocField = source ?? ({
      fieldname: declared.fieldname,
      label: declared.label,
      fieldtype: declared.fieldtype as Fieldtype,
      ...(declared.options ? { options: declared.options } : {}),
    } as DocField);
    return {
      ...base,
      label: declared.label || base.label,
      ...(declared.options ? { options: declared.options } : {}),
      ...(declared.link_filters ? { link_filters: declared.link_filters } : {}),
      ...(declared.required ? { reqd: 1 as const } : {}),
      ...(declared.default == null ? {} : { default: declared.default }),
      in_list_view: 1 as const,
    } as DocField;
  });
}

export function ActionChildGrid(props: ActionChildGridProps) {
  const { table, childMeta, rows, onChange, registry, services, roles, parentDoc, readOnly } = props;
  const latestRows = useRef(rows);
  useEffect(() => { latestRows.current = rows; }, [rows]);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [picked, setPicked] = useState({ row: 0, column: 0 });
  const [allowedColors, setAllowedColors] = useState<Record<string, string[]>>({});
  const [enrichmentErrors, setEnrichmentErrors] = useState<Record<number, string>>({});
  const gridRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => resolveDeclaredColumns(table, childMeta, rows, parentDoc, roles),
    [table, childMeta, rows, parentDoc, roles],
  );
  const identity = columns.find((field) => field.fieldname === "item_code")?.fieldname
    ?? columns.find((field) => ["Link", "Dynamic Link"].includes(field.fieldtype))?.fieldname
    ?? columns[0]?.fieldname;
  const selectedSet = new Set(selected);
  const saveRows = (next: Doc[]) => { latestRows.current = next; onChange(next); };

  const dynamicField = (field: DocField, row: Doc): DocField => {
    const item = text(row.item_code);
    if ((field.fieldname === "color" || field.fieldname === "colour") && item && Object.hasOwn(allowedColors, item)) {
      const values = allowedColors[item] ?? [];
      return { ...field, link_filters: JSON.stringify([["Item Color", "name", "in", values.length ? values : ["__NO_ALLOWED_COLOR__"]]]) };
    }
    return field;
  };

  const enrichItem = async (rowIndex: number, itemCode: string) => {
    if (!services?.fetchDocument && !services?.fetchValue) return;
    setEnrichmentErrors((current) => { const next = { ...current }; delete next[rowIndex]; return next; });
    try {
      const item = services.fetchDocument ? await services.fetchDocument("Item", itemCode) : undefined;
      const readItem = async (fieldname: string): Promise<unknown> => {
        const direct = item?.[fieldname];
        if (direct !== undefined && direct !== null && direct !== "") return direct;
        return services.fetchValue ? services.fetchValue("Item", itemCode, fieldname) : undefined;
      };
      const live = latestRows.current;
      if (!live[rowIndex] || text(live[rowIndex]!.item_code) !== itemCode) return;
      const next = { ...live[rowIndex]! } as Doc;

      const copyIfEmpty = async (source: string, target: string) => {
        if (next[target] != null && next[target] !== "") return;
        const value = await readItem(source);
        if (value != null && value !== "") next[target] = value;
      };
      await Promise.all([
        copyIfEmpty("stock_uom", "stock_uom"), copyIfEmpty("inventory_mode", "inventory_mode"),
        copyIfEmpty("measurement_profile", "measurement_profile"), copyIfEmpty("material_specification", "material_specification"),
        copyIfEmpty("item_name", "item_name"), copyIfEmpty("description", "description"), copyIfEmpty("min_area_sqm", "min_area_sqm"),
        copyIfEmpty("default_color", "color"), copyIfEmpty("default_warehouse", "warehouse"),
      ]);

      const uom = text(await readItem("default_purchase_uom")) || text(await readItem("purchase_uom")) || text(await readItem("stock_uom"));
      if (!next.uom && uom) next.uom = uom;

      const rawColors = await readItem("allowed_colors");
      const colors = Array.isArray(rawColors)
        ? rawColors.map((entry) => entry && typeof entry === "object" ? text((entry as Record<string, unknown>).color) : "").filter(Boolean)
        : [];
      setAllowedColors((current) => ({ ...current, [itemCode]: colors }));
      if (next.color && colors.length && !colors.includes(text(next.color))) next.color = undefined;
      if (next.colour && colors.length && !colors.includes(text(next.colour))) next.colour = undefined;

      const specificationName = text(next.material_specification || await readItem("material_specification"));
      if (specificationName) {
        const specification = services.fetchDocument ? await services.fetchDocument("Material Specification", specificationName) : undefined;
        const readSpec = async (fieldname: string): Promise<unknown> => {
          const direct = specification?.[fieldname];
          if (direct !== undefined && direct !== null && direct !== "") return direct;
          return services.fetchValue ? services.fetchValue("Material Specification", specificationName, fieldname) : undefined;
        };
        const kgPerM = number(await readSpec("theoretical_kg_per_m"));
        if (kgPerM && kgPerM > 0) next.theoretical_kg_per_m = kgPerM;
        const standardLength = number(await readSpec("standard_length_m"));
        if (!next.length_m && standardLength && standardLength > 0) next.length_m = standardLength;
      }

      const current = latestRows.current;
      if (!current[rowIndex] || text(current[rowIndex]!.item_code) !== itemCode) return;
      saveRows(current.map((row, index) => index === rowIndex ? computed({ ...row, ...next }, childMeta) : row));
    } catch (error) {
      setEnrichmentErrors((current) => ({ ...current, [rowIndex]: error instanceof Error ? error.message : "Không tự điền được dữ liệu mặt hàng." }));
    }
  };

  const setCell = (rowIndex: number, fieldname: string, value: unknown) => {
    const current = latestRows.current;
    const next = current.map((row, index) => {
      if (index !== rowIndex) return row;
      const changingItem = fieldname === "item_code" && text(value) !== text(row.item_code);
      const cleared = changingItem ? {
        color: undefined, colour: undefined, uom: undefined, stock_uom: undefined, inventory_mode: undefined,
        measurement_profile: undefined, material_specification: undefined, theoretical_kg_per_m: undefined,
        theoretical_kg: undefined, amount: undefined,
      } : {};
      return computed({ ...row, ...cleared, [fieldname]: value } as Doc, childMeta);
    });
    saveRows(next);
    if (fieldname === "item_code" && text(value)) void enrichItem(rowIndex, text(value));
  };

  const addRows = (count: number) => {
    const actual = Math.min(count, Math.max(0, table.max_rows - rows.length));
    if (!actual) return;
    saveRows([...rows, ...Array.from({ length: actual }, (_, index) => blankRow(childMeta, table, rows.length + index))]);
  };
  const deleteRows = (indexes: number[]) => {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < rows.length).sort((a, b) => a - b);
    if (!unique.length) return;
    setLastDeleted(unique.map((index) => ({ row: rows[index]!, index })));
    const removing = new Set(unique);
    const next = rows.filter((_, index) => !removing.has(index));
    while (next.length < table.min_rows) next.push(blankRow(childMeta, table, next.length));
    saveRows(next);
    setSelected([]);
  };
  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    const next = [...rows];
    for (const entry of [...lastDeleted].sort((a, b) => a.index - b.index)) next.splice(Math.min(entry.index, next.length), 0, entry.row);
    saveRows(next.slice(0, table.max_rows));
    setLastDeleted(null);
  };

  const focusCell = (row: number, column: number) => {
    const holder = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`);
    const target = holder?.querySelector<HTMLElement>("input,button,textarea,select,[tabindex]") ?? holder;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const holder = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!holder || holder.querySelector('[aria-expanded="true"]')) return;
    const [row, column] = holder.dataset.cell!.split(":").map(Number) as [number, number];
    const go = (dr: number, dc: number) => {
      const nextRow = Math.max(0, Math.min(rows.length - 1, row + dr));
      const nextColumn = Math.max(0, Math.min(columns.length - 1, column + dc));
      if (nextRow === row && nextColumn === column) return;
      event.preventDefault(); focusCell(nextRow, nextColumn);
    };
    if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) go(1, 0);
    else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) go(-1, 0);
    else if (event.key === "Tab" && !event.shiftKey && column < columns.length - 1) go(0, 1);
    else if (event.key === "Tab" && event.shiftKey && column > 0) go(0, -1);
  };
  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly || !table.allow_paste) return;
    const clipboard = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(clipboard)) return;
    event.preventDefault();
    const matrix = clipboard.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const next = [...rows];
    const enrich: Array<{ index: number; item: string }> = [];
    matrix.forEach((cells, rowOffset) => {
      const rowIndex = picked.row + rowOffset;
      if (rowIndex >= table.max_rows) return;
      if (!next[rowIndex]) next[rowIndex] = blankRow(childMeta, table, rowIndex);
      const row = { ...next[rowIndex]! } as Doc;
      const previousItem = text(row.item_code);
      cells.forEach((raw, columnOffset) => {
        const field = columns[picked.column + columnOffset];
        if (!field) return;
        const parsed = parsePasted(field, raw);
        if (parsed !== undefined) row[field.fieldname] = parsed;
      });
      next[rowIndex] = computed(row, childMeta);
      const item = text(row.item_code);
      if (item && item !== previousItem) enrich.push({ index: rowIndex, item });
    });
    saveRows(next);
    enrich.forEach(({ index, item }) => void enrichItem(index, item));
  };

  const errors = Object.entries(enrichmentErrors).filter(([index]) => Number(index) < rows.length);

  return <div className="min-w-0 space-y-2" data-action-child-grid={table.fieldname} data-primary-columns={columns.map((field) => field.fieldname).join(",")}>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(1)}><Plus /> Dòng</Button>
      <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(10)}>+10 dòng</Button>
      {selected.length ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selected.length}</Button> : null}
      {lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
      <span className="ml-auto text-xs text-muted-foreground">{rows.length}/{table.max_rows} dòng{table.allow_paste ? " · dán Excel được" : ""}</span>
    </div>

    <div ref={gridRef} className="max-w-full overflow-x-auto rounded-md border" onPaste={onPaste} onKeyDown={onKeyDown}>
      <Table unwrapped className="w-max min-w-full text-[12px]">
        <TableHeader className="bg-muted/50"><TableRow className="h-9 hover:bg-transparent">
          {!readOnly ? <TableHead className="sticky left-0 z-40 w-10 min-w-10 bg-card p-1 text-center"><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={() => setSelected(selected.length === rows.length ? [] : rows.map(rowKey))} /></TableHead> : null}
          <TableHead className={`sticky z-40 w-11 min-w-11 bg-card px-1 text-right ${readOnly ? "left-0" : "left-10"}`}>#</TableHead>
          {columns.map((field) => {
            const sticky = field.fieldname === identity;
            return <TableHead key={field.fieldname} className={`${sticky ? "sticky z-30 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""} whitespace-nowrap px-2 text-[11px] font-bold`} style={{ width: columnWidth(field), minWidth: columnWidth(field), ...(sticky ? { left: readOnly ? 44 : 84 } : {}) }}>{shortLabel(field)}{field.reqd ? <span className="text-destructive">*</span> : null}</TableHead>;
          })}
          {!readOnly ? <TableHead className="w-12 min-w-12" /> : null}
        </TableRow></TableHeader>
        <TableBody>{rows.map((row, rowIndex) => <TableRow key={rowKey(row, rowIndex)} className={selectedSet.has(rowKey(row, rowIndex)) ? "bg-primary/[0.04]" : ""}>
          {!readOnly ? <TableCell className="sticky left-0 z-20 w-10 min-w-10 bg-card p-1 text-center"><Checkbox checked={selectedSet.has(rowKey(row, rowIndex))} onCheckedChange={() => setSelected((current) => current.includes(rowKey(row, rowIndex)) ? current.filter((value) => value !== rowKey(row, rowIndex)) : [...current, rowKey(row, rowIndex)])} /></TableCell> : null}
          <TableCell className={`sticky z-20 w-11 min-w-11 bg-card px-1 text-right text-[11px] text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>{rowIndex + 1}</TableCell>
          {columns.map((field, columnIndex) => {
            const effective = dynamicField(field, row);
            const resolved = resolveField(effective, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
            const cellReadOnly = Boolean(readOnly || resolved.readOnly || AUTO_FIELDS.has(field.fieldname));
            const Control = registry.resolve(effective.fieldtype) ?? FallbackControl;
            const sticky = field.fieldname === identity;
            return <TableCell key={field.fieldname} data-cell={`${rowIndex}:${columnIndex}`} className={`${cellReadOnly ? "bg-muted/35 text-muted-foreground" : "bg-background focus-within:bg-primary/[0.04]"} h-9 p-0 ${sticky ? "sticky z-10 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""}`} style={{ width: columnWidth(field), minWidth: columnWidth(field), ...(sticky ? { left: readOnly ? 44 : 84 } : {}) }} onFocusCapture={() => setPicked({ row: rowIndex, column: columnIndex })} onClick={() => setPicked({ row: rowIndex, column: columnIndex })}>
              {!resolved.visible ? <div className="px-2 text-center">—</div>
                : NUMERIC_TYPES.has(effective.fieldtype) ? <Input className="h-8 min-w-0 border-0 bg-transparent px-2 text-right tabular-nums shadow-none focus-visible:ring-1" value={row[field.fieldname] == null ? "" : String(row[field.fieldname])} inputMode={effective.fieldtype === "Int" ? "numeric" : "decimal"} readOnly={cellReadOnly} onChange={(event) => setCell(rowIndex, field.fieldname, event.target.value)} />
                : <Control field={effective} value={row[field.fieldname]} onChange={(value: unknown) => setCell(rowIndex, field.fieldname, value)} readOnly={cellReadOnly} masked={resolved.masked} services={services} docname={String(row.name ?? "")} linkTarget={effective.fieldtype === "Link" ? effective.options : undefined} parentDoctype={childMeta.name} docValues={row} roles={roles} compact />}
            </TableCell>;
          })}
          {!readOnly ? <TableCell className="w-12 min-w-12 p-1"><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteRows([rowIndex])}><Trash2 /></Button></TableCell> : null}
        </TableRow>)}</TableBody>
      </Table>
    </div>

    {errors.length ? <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{errors.slice(0, 4).map(([index, message]) => <div key={index}>Dòng {Number(index) + 1}: {message}</div>)}</div> : null}
  </div>;
}
