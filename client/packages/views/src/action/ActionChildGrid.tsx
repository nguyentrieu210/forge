/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { resolveField, type AppActionInputTable, type Doc, type DocField, type DocTypeMeta } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";
import { resolveChildGridColumns } from "../form/ChildGrid.js";

interface GridLayout {
  hidden: string[];
  order: string[];
}

const EMPTY_LAYOUT: GridLayout = { hidden: [], order: [] };
const NUMERIC_TYPES = new Set(["Int", "Float", "Currency", "Percent"]);

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

function layoutField(field: DocField | string): boolean {
  const fieldtype = typeof field === "string" ? field : field.fieldtype;
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(fieldtype);
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numeric(value: unknown): number | undefined {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rowKey(row: Doc, index: number): string {
  return String(row.name ?? `row-${index}`);
}

function seedRow(meta: DocTypeMeta, table: AppActionInputTable, index: number): Doc {
  const row: Doc = { name: `new-${Date.now()}-${index}`, doctype: meta.name } as Doc;
  for (const field of meta.fields ?? []) {
    if (!layoutField(field.fieldtype) && field.default != null && field.default !== "") row[field.fieldname] = field.default;
  }
  for (const column of table.columns) {
    if (column.default != null && (row[column.fieldname] == null || row[column.fieldname] === "")) row[column.fieldname] = column.default;
  }
  return row;
}

function parsePasted(field: DocField, raw: string): unknown {
  const valueText = raw.trim();
  if (!valueText) return undefined;
  if (field.fieldtype === "Check") {
    const value = valueText.toLocaleLowerCase("vi");
    if (["1", "true", "yes", "y", "x", "có", "co"].includes(value)) return 1;
    if (["0", "false", "no", "n", "không", "khong"].includes(value)) return 0;
    return undefined;
  }
  if (NUMERIC_TYPES.has(field.fieldtype)) {
    const normalized = valueText.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }
  return valueText;
}

function optimisticComputed(row: Doc, meta: DocTypeMeta): Doc {
  const next = { ...row } as Doc;
  const has = (fieldname: string) => (meta.fields ?? []).some((field) => field.fieldname === fieldname);
  if (String(next.inventory_mode ?? "") === "Nhôm cây/lá" && has("theoretical_kg")) {
    const length = numeric(next.length_m);
    const bars = numeric(next.qty_bar);
    const kgPerM = numeric(next.theoretical_kg_per_m);
    if (length && length > 0 && bars && bars > 0 && kgPerM && kgPerM > 0) {
      const kg = length * bars * kgPerM;
      next.theoretical_kg = kg;
      if (has("qty") && (next.qty == null || next.qty === "")) next.qty = kg;
    }
  }
  const qty = numeric(next.qty);
  const rate = numeric(next.rate);
  if (has("amount") && qty !== undefined && rate !== undefined) next.amount = qty * rate;
  return next;
}

function shortLabel(field: DocField): string {
  const labels: Record<string, string> = {
    item_code: "Mã SP", length_m: "Dài", theoretical_kg_per_m: "Kg/m", qty_bundle: "Bó",
    qty_bar: "Cây/Lá", theoretical_kg: "Kg BR", actual_weight_kg: "Kg cân", qty: "SL", uom: "ĐVT",
    rate: "Đơn giá", amount: "Thành tiền", color: "Màu", colour: "Màu", is_stamped: "Dập",
    so_no: "SO NCC", warehouse: "Kho", note: "Ghi chú", width_m: "Rộng", height_m: "Cao", set_count: "Bộ/Cái",
  };
  return labels[field.fieldname] ?? field.label ?? field.fieldname;
}

function columnWidth(field: DocField): number {
  if (field.fieldname === "item_code") return 210;
  if (["warehouse", "supplier", "customer"].includes(field.fieldname)) return 180;
  if (["note", "description"].includes(field.fieldname)) return 220;
  if (["color", "colour", "so_no"].includes(field.fieldname)) return 135;
  if (["rate", "amount"].includes(field.fieldname) || field.fieldtype === "Currency") return 135;
  if (field.fieldtype === "Link" || field.fieldtype === "Dynamic Link") return 155;
  if (field.fieldtype === "Select") return 125;
  if (NUMERIC_TYPES.has(field.fieldtype)) return 105;
  if (field.fieldtype === "Check") return 82;
  return 145;
}

function isAutoField(fieldname: string): boolean {
  return [
    "stock_uom", "inventory_mode", "measurement_profile", "material_specification", "theoretical_kg_per_m",
    "theoretical_kg", "actual_kg_per_m", "actual_kg_per_sqm", "amount", "item_name", "description",
  ].includes(fieldname);
}

export function ActionChildGrid(props: ActionChildGridProps) {
  const { actionName, table, childMeta, rows, onChange, registry, services, roles, parentDoc, readOnly } = props;
  const latestRows = useRef(rows);
  useEffect(() => { latestRows.current = rows; }, [rows]);
  const [pickedRow, setPickedRow] = useState<number | null>(rows.length ? 0 : null);
  const [pickedColumn, setPickedColumn] = useState(0);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const [allowedColors, setAllowedColors] = useState<Record<string, string[]>>({});
  const [allowedUoms, setAllowedUoms] = useState<Record<string, string[]>>({});
  const [enrichmentErrors, setEnrichmentErrors] = useState<Record<number, string>>({});

  const declaredByName = useMemo(() => new Map(table.columns.map((column) => [column.fieldname, column])), [table.columns]);
  const canonicalCols = resolveChildGridColumns(childMeta, rows, parentDoc, roles);
  const baseCols = useMemo(() => canonicalCols.map((metaField) => {
    const declared = declaredByName.get(metaField.fieldname);
    return {
      ...metaField,
      ...(declared?.link_filters ? { link_filters: declared.link_filters } : {}),
      ...(declared?.required ? { reqd: 1 as const } : {}),
      ...(declared?.default != null ? { default: declared.default } : {}),
      in_list_view: 1 as const,
    } as DocField;
  }), [canonicalCols, declaredByName]);

  const storageKey = `mf-action-grid-layout:${actionName}:${table.fieldname}:${table.presentation?.row_doctype ?? childMeta.name}:v3`;
  const [layout, setLayout] = useState<GridLayout>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...EMPTY_LAYOUT, ...(JSON.parse(raw) as Partial<GridLayout>) } : { ...EMPTY_LAYOUT };
    } catch { return { ...EMPTY_LAYOUT }; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch { /* presentation preference only */ }
  }, [layout, storageKey]);

  const ordered = layout.order.length
    ? [
        ...layout.order.map((name) => baseCols.find((field) => field.fieldname === name)).filter((field): field is DocField => Boolean(field)),
        ...baseCols.filter((field) => !layout.order.includes(field.fieldname)),
      ]
    : baseCols;
  const identity = baseCols.find((field) => field.fieldname === "item_code")?.fieldname
    ?? baseCols.find((field) => ["Link", "Dynamic Link"].includes(field.fieldtype))?.fieldname
    ?? baseCols[0]?.fieldname;
  const cols = ordered.filter((field) => field.fieldname === identity || !layout.hidden.includes(field.fieldname));
  const selectedSet = new Set(selectedRows);
  const saveRows = (next: Doc[]) => { latestRows.current = next; onChange(next); };

  const dynamicField = (field: DocField, row: Doc): DocField => {
    const item = text(row.item_code);
    if ((field.fieldname === "color" || field.fieldname === "colour") && item && Object.hasOwn(allowedColors, item)) {
      const values = allowedColors[item] ?? [];
      return { ...field, link_filters: JSON.stringify([["Item Color", "name", "in", values.length ? values : ["__NO_ALLOWED_COLOR__"]]]) };
    }
    if (field.fieldname === "uom" && item && Object.hasOwn(allowedUoms, item)) {
      const values = allowedUoms[item] ?? [];
      return { ...field, link_filters: JSON.stringify([["UOM", "name", "in", values.length ? values : ["__NO_ALLOWED_UOM__"]]]) };
    }
    return field;
  };

  const enrichItem = async (rowIndex: number, itemCode: string) => {
    if (!services?.fetchDocument && !services?.fetchValue) return;
    setEnrichmentErrors((current) => { const next = { ...current }; delete next[rowIndex]; return next; });
    try {
      const item = services.fetchDocument ? await services.fetchDocument("Item", itemCode) : undefined;
      const readItemValue = async (fieldname: string): Promise<unknown> => {
        const direct = item?.[fieldname];
        if (direct !== undefined && direct !== null && direct !== "") return direct;
        return services?.fetchValue ? services.fetchValue("Item", itemCode, fieldname) : undefined;
      };
      const current = latestRows.current;
      const target = current[rowIndex];
      if (!target || text(target.item_code) !== itemCode) return;
      const next = { ...target } as Doc;
      const has = (name: string) => (childMeta.fields ?? []).some((field) => field.fieldname === name);

      const plan: Array<[string, string]> = [
        ["stock_uom", "stock_uom"], ["inventory_mode", "inventory_mode"], ["measurement_profile", "measurement_profile"],
        ["material_specification", "material_specification"], ["item_name", "item_name"], ["description", "description"],
        ["min_area_sqm", "min_area_sqm"], ["default_color", "color"], ["default_warehouse", "warehouse"],
      ];
      await Promise.all(plan.map(async ([source, destination]) => {
        if (!has(destination) || (next[destination] != null && next[destination] !== "")) return;
        const value = await readItemValue(source);
        if (value != null && value !== "") next[destination] = value;
      }));

      const purchaseUom = text(await readItemValue("default_purchase_uom"))
        || text(await readItemValue("purchase_uom"))
        || text(await readItemValue("stock_uom"));
      if (has("uom") && !next.uom && purchaseUom) next.uom = purchaseUom;

      const rawConversions = await readItemValue("uom_conversions");
      const rawUoms = Array.isArray(item?.uoms) ? item.uoms : [];
      const conversions = Array.isArray(rawConversions) ? rawConversions : [];
      const conversionUoms = [...conversions, ...rawUoms]
        .map((entry) => entry && typeof entry === "object" ? text((entry as Record<string, unknown>).uom) : "")
        .filter(Boolean);
      setAllowedUoms((currentMap) => ({ ...currentMap, [itemCode]: [...new Set([purchaseUom, text(awaitable(item?.stock_uom)), ...conversionUoms].filter(Boolean))] }));

      const rawColors = await readItemValue("allowed_colors");
      const colors = Array.isArray(rawColors)
        ? rawColors.map((entry) => entry && typeof entry === "object" ? text((entry as Record<string, unknown>).color) : "").filter(Boolean)
        : [];
      setAllowedColors((currentMap) => ({ ...currentMap, [itemCode]: colors }));
      if (next.color && colors.length && !colors.includes(text(next.color))) next.color = undefined;
      if (next.colour && colors.length && !colors.includes(text(next.colour))) next.colour = undefined;

      const specificationName = text(next.material_specification || await readItemValue("material_specification"));
      if (specificationName) {
        const specification = services.fetchDocument ? await services.fetchDocument("Material Specification", specificationName) : undefined;
        const readSpec = async (fieldname: string): Promise<unknown> => {
          const direct = specification?.[fieldname];
          if (direct !== undefined && direct !== null && direct !== "") return direct;
          return services?.fetchValue ? services.fetchValue("Material Specification", specificationName, fieldname) : undefined;
        };
        const kgPerM = numeric(await readSpec("theoretical_kg_per_m"));
        if (has("theoretical_kg_per_m") && kgPerM && kgPerM > 0) next.theoretical_kg_per_m = kgPerM;
        const standardLength = numeric(await readSpec("standard_length_m"));
        if (has("length_m") && !next.length_m && standardLength && standardLength > 0) next.length_m = standardLength;
      }

      const live = latestRows.current;
      if (!live[rowIndex] || text(live[rowIndex]!.item_code) !== itemCode) return;
      saveRows(live.map((row, index) => index === rowIndex ? optimisticComputed({ ...row, ...next }, childMeta) : row));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tự điền được dữ liệu mặt hàng.";
      setEnrichmentErrors((current) => ({ ...current, [rowIndex]: message }));
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
      return optimisticComputed({ ...row, ...cleared, [fieldname]: value } as Doc, childMeta);
    });
    saveRows(next);
    if (fieldname === "item_code" && text(value)) void enrichItem(rowIndex, text(value));
  };

  const addRows = (count: number) => {
    const room = Math.max(0, table.max_rows - rows.length);
    const actual = Math.min(count, room);
    if (!actual) return;
    saveRows([...rows, ...Array.from({ length: actual }, (_, index) => seedRow(childMeta, table, rows.length + index))]);
  };

  const deleteRows = (indexes: number[]) => {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < rows.length).sort((a, b) => a - b);
    if (!unique.length) return;
    setLastDeleted(unique.map((index) => ({ row: rows[index]!, index })));
    const removing = new Set(unique);
    const next = rows.filter((_, index) => !removing.has(index));
    while (next.length < table.min_rows) next.push(seedRow(childMeta, table, next.length));
    saveRows(next);
    setSelectedRows([]);
    setPickedRow(next.length ? Math.min(unique[0]!, next.length - 1) : null);
  };

  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    const next = [...rows];
    for (const entry of [...lastDeleted].sort((a, b) => a.index - b.index)) next.splice(Math.min(entry.index, next.length), 0, entry.row);
    saveRows(next.slice(0, table.max_rows));
    setLastDeleted(null);
  };

  const gridRef = useRef<HTMLDivElement>(null);
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
    const [r, c] = holder.dataset.cell!.split(":").map(Number) as [number, number];
    const go = (dr: number, dc: number) => {
      const nr = Math.max(0, Math.min(rows.length - 1, r + dr));
      const nc = Math.max(0, Math.min(cols.length - 1, c + dc));
      if (nr === r && nc === c) return;
      event.preventDefault();
      focusCell(nr, nc);
    };
    if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) go(1, 0);
    else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) go(-1, 0);
    else if (event.key === "Tab" && !event.shiftKey && c < cols.length - 1) go(0, 1);
    else if (event.key === "Tab" && event.shiftKey && c > 0) go(0, -1);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly || !table.allow_paste) return;
    const clipboard = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(clipboard)) return;
    event.preventDefault();
    const matrix = clipboard.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const startRow = pickedRow ?? 0;
    const startColumn = Math.min(pickedColumn, Math.max(0, cols.length - 1));
    const next = [...rows];
    const enrich: Array<{ index: number; item: string }> = [];
    matrix.forEach((cells, rowOffset) => {
      const rowIndex = startRow + rowOffset;
      if (rowIndex >= table.max_rows) return;
      if (!next[rowIndex]) next[rowIndex] = seedRow(childMeta, table, rowIndex);
      const row = { ...next[rowIndex]! } as Doc;
      const before = text(row.item_code);
      cells.forEach((raw, columnOffset) => {
        const field = cols[startColumn + columnOffset];
        if (!field) return;
        const value = parsePasted(field, raw);
        if (value !== undefined) row[field.fieldname] = value;
      });
      next[rowIndex] = optimisticComputed(row, childMeta);
      const item = text(row.item_code);
      if (item && item !== before) enrich.push({ index: rowIndex, item });
    });
    saveRows(next);
    enrich.forEach(({ index, item }) => void enrichItem(index, item));
  };

  const numericControl = (field: DocField, value: unknown, rowIndex: number, cellReadOnly: boolean) => (
    <Input
      className="h-8 min-w-0 border-0 bg-transparent px-2 text-right tabular-nums shadow-none focus-visible:ring-1"
      value={value == null ? "" : String(value)}
      inputMode={field.fieldtype === "Int" ? "numeric" : "decimal"}
      readOnly={cellReadOnly}
      onChange={(event) => setCell(rowIndex, field.fieldname, event.target.value)}
    />
  );

  const errorRows = Object.entries(enrichmentErrors).filter(([index]) => Number(index) < rows.length);

  return (
    <div className="min-w-0 space-y-2" data-action-child-grid={table.fieldname}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(1)}><Plus /> Dòng</Button>
        <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(10)}>+10 dòng</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setColumnSettingsOpen(true)}><Columns3 /> Cột</Button>
        {selectedRows.length ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selectedRows.length}</Button> : null}
        {lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
        <span className="ml-auto text-xs text-muted-foreground">{rows.length}/{table.max_rows} dòng{table.allow_paste ? " · dán trực tiếp từ Excel" : ""}</span>
      </div>

      <div ref={gridRef} className="max-w-full overflow-x-auto rounded-md border" onPaste={onPaste} onKeyDown={onKeyDown}>
        <Table unwrapped className="w-max min-w-full text-[12px]">
          <TableHeader className="bg-muted/50">
            <TableRow className="h-9 hover:bg-transparent">
              {!readOnly ? <TableHead className="sticky left-0 z-40 w-10 min-w-10 bg-card p-1 text-center"><Checkbox checked={rows.length > 0 && selectedRows.length === rows.length} onCheckedChange={() => setSelectedRows(selectedRows.length === rows.length ? [] : rows.map(rowKey))} /></TableHead> : null}
              <TableHead className={`sticky z-40 w-11 min-w-11 bg-card px-1 text-right ${readOnly ? "left-0" : "left-10"}`}>#</TableHead>
              {cols.map((field) => {
                const isIdentity = field.fieldname === identity;
                const stickyLeft = readOnly ? 44 : 84;
                return <TableHead
                  key={field.fieldname}
                  className={`${isIdentity ? "sticky z-30 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""} whitespace-nowrap px-2 text-[11px] font-bold`}
                  style={{ width: columnWidth(field), minWidth: columnWidth(field), ...(isIdentity ? { left: stickyLeft } : {}) }}
                >
                  {shortLabel(field)}{field.reqd ? <span className="text-destructive">*</span> : null}
                </TableHead>;
              })}
              {!readOnly ? <TableHead className="w-20 min-w-20" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => <TableRow key={rowKey(row, rowIndex)} className={pickedRow === rowIndex || selectedSet.has(rowKey(row, rowIndex)) ? "bg-primary/[0.04]" : ""} onClick={() => setPickedRow(rowIndex)}>
              {!readOnly ? <TableCell className="sticky left-0 z-20 w-10 min-w-10 bg-card p-1 text-center"><Checkbox checked={selectedSet.has(rowKey(row, rowIndex))} onCheckedChange={() => setSelectedRows((current) => current.includes(rowKey(row, rowIndex)) ? current.filter((value) => value !== rowKey(row, rowIndex)) : [...current, rowKey(row, rowIndex)])} /></TableCell> : null}
              <TableCell className={`sticky z-20 w-11 min-w-11 bg-card px-1 text-right text-[11px] text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>{rowIndex + 1}</TableCell>
              {cols.map((field, columnIndex) => {
                const effective = dynamicField(field, row);
                const resolved = resolveField(effective, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                const cellReadOnly = Boolean(readOnly || resolved.readOnly || isAutoField(field.fieldname));
                const Control = registry.resolve(effective.fieldtype) ?? FallbackControl;
                const isIdentity = field.fieldname === identity;
                const stickyLeft = readOnly ? 44 : 84;
                return <TableCell
                  key={field.fieldname}
                  data-cell={`${rowIndex}:${columnIndex}`}
                  data-editable={cellReadOnly ? "false" : "true"}
                  className={`${cellReadOnly ? "bg-muted/45 text-muted-foreground" : "bg-background focus-within:bg-primary/[0.04]"} h-9 p-0 ${isIdentity ? "sticky z-10 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""}`}
                  style={{ width: columnWidth(field), minWidth: columnWidth(field), ...(isIdentity ? { left: stickyLeft } : {}) }}
                  onFocusCapture={() => { setPickedRow(rowIndex); setPickedColumn(columnIndex); }}
                  onClick={() => { setPickedRow(rowIndex); setPickedColumn(columnIndex); }}
                >
                  {!resolved.visible ? <div className="px-2 text-center">—</div>
                    : NUMERIC_TYPES.has(effective.fieldtype) ? numericControl(effective, row[field.fieldname], rowIndex, cellReadOnly)
                    : <Control field={effective} value={row[field.fieldname]} onChange={(value: unknown) => setCell(rowIndex, field.fieldname, value)} readOnly={cellReadOnly} masked={resolved.masked} services={services} docname={String(row.name ?? "")} linkTarget={effective.fieldtype === "Link" ? effective.options : undefined} parentDoctype={childMeta.name} docValues={row} roles={roles} compact />}
                </TableCell>;
              })}
              {!readOnly ? <TableCell className="w-20 min-w-20 whitespace-nowrap px-1 py-0.5"><Button type="button" variant="ghost" size="icon-sm" onClick={() => setDetailRow(rowIndex)} title="Chi tiết dòng">⋯</Button><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteRows([rowIndex])}><X /></Button></TableCell> : null}
            </TableRow>)}
          </TableBody>
        </Table>
      </div>

      {errorRows.length ? <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        {errorRows.slice(0, 3).map(([index, message]) => <div key={index}>Dòng {Number(index) + 1}: {message}</div>)}
        {errorRows.length > 3 ? <div>… và {errorRows.length - 3} dòng khác.</div> : null}
      </div> : null}

      <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
        <DialogContent className="max-h-[82vh] w-[min(94vw,620px)] max-w-none overflow-y-auto">
          <DialogHeader><DialogTitle>Cột hiển thị</DialogTitle><DialogDescription>Ẩn field ít dùng khỏi màn nhập chính. Dữ liệu kỹ thuật vẫn còn trong chi tiết và document canonical.</DialogDescription></DialogHeader>
          <div className="space-y-1">
            {baseCols.map((field) => {
              const hidden = layout.hidden.includes(field.fieldname);
              const isIdentity = field.fieldname === identity;
              return <label key={field.fieldname} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <Checkbox checked={!hidden} disabled={isIdentity} onCheckedChange={() => setLayout((value) => ({ ...value, hidden: hidden ? value.hidden.filter((name) => name !== field.fieldname) : [...value.hidden, field.fieldname] }))} />
                <span className="min-w-0 flex-1"><span className="font-medium">{shortLabel(field)}</span><span className="ml-2 text-xs text-muted-foreground">{field.fieldname}</span></span>
              </label>;
            })}
          </div>
          <Button type="button" variant="outline" onClick={() => setLayout({ ...EMPTY_LAYOUT })}><RotateCcw /> Cột về mặc định</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={detailRow != null} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[88vh] w-[min(96vw,960px)] max-w-none overflow-y-auto">
          <DialogHeader><DialogTitle>{childMeta.label ?? childMeta.name} · dòng {detailRow == null ? "" : detailRow + 1}</DialogTitle></DialogHeader>
          {detailRow != null && rows[detailRow] ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(childMeta.fields ?? []).filter((field) => !layoutField(field.fieldtype)).map((field) => {
            const row = rows[detailRow]!;
            const effective = dynamicField(field, row);
            const resolved = resolveField(effective, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
            if (!resolved.visible) return null;
            const Control = registry.resolve(effective.fieldtype) ?? FallbackControl;
            const cellReadOnly = Boolean(readOnly || resolved.readOnly || isAutoField(field.fieldname));
            return <label key={field.fieldname} className="grid min-w-0 gap-1 text-sm font-medium"><span>{field.label ?? field.fieldname}{field.reqd ? <span className="text-destructive">*</span> : null}</span>{NUMERIC_TYPES.has(effective.fieldtype) ? numericControl(effective, row[field.fieldname], detailRow, cellReadOnly) : <Control field={effective} value={row[field.fieldname]} onChange={(value: unknown) => setCell(detailRow, field.fieldname, value)} readOnly={cellReadOnly} masked={resolved.masked} services={services} docname={String(row.name ?? "")} linkTarget={effective.fieldtype === "Link" ? effective.options : undefined} parentDoctype={childMeta.name} docValues={row} roles={roles} />}</label>;
          })}</div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Helper keeps setAllowedUoms construction synchronous without re-reading the Item. */
function awaitable(value: unknown): unknown {
  return value;
}
