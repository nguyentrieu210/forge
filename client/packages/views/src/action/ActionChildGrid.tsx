/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowDownToLine, ArrowUp, Columns3, Copy, Pin, PinOff, Plus, RotateCcw, Trash2, Undo2, X,
} from "lucide-react";
import { resolveField, type AppActionInputTable, type Doc, type DocField, type DocTypeMeta } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";

interface GridLayout {
  weights: Record<string, number>;
  order: string[];
  hidden: string[];
  pinned: string[];
  labels: Record<string, string>;
}

const EMPTY_LAYOUT: GridLayout = { weights: {}, order: [], hidden: [], pinned: [], labels: {} };
const MIN_WEIGHT = 3;

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

function layoutField(field: DocField): boolean {
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(field.fieldtype);
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

function numeric(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePasted(field: DocField, raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;
  if (field.fieldtype === "Check") {
    const value = text.toLocaleLowerCase("vi");
    if (["1", "true", "yes", "y", "x", "có", "co"].includes(value)) return 1;
    if (["0", "false", "no", "n", "không", "khong"].includes(value)) return 0;
    return undefined;
  }
  if (["Currency", "Float", "Int", "Percent"].includes(field.fieldtype)) {
    const normalized = text.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }
  return text;
}

function computed(row: Doc, meta: DocTypeMeta): Doc {
  const has = (fieldname: string) => (meta.fields ?? []).some((field) => field.fieldname === fieldname);
  const next = { ...row } as Doc;
  if (String(next.inventory_mode ?? "") === "Nhôm cây/lá" && has("theoretical_kg")) {
    const length = numeric(next.length_m);
    const bars = numeric(next.qty_bar);
    const kgPerM = numeric(next.theoretical_kg_per_m);
    if (length && length > 0 && bars && bars > 0 && kgPerM && kgPerM > 0) {
      const kg = length * bars * kgPerM;
      next.theoretical_kg = kg;
      if (has("qty")) next.qty = kg;
    }
  }
  if (String(next.inventory_mode ?? "") === "Thành phẩm theo m2" && has("qty")) {
    const width = numeric(next.width_m);
    const height = numeric(next.height_m);
    const sets = numeric(next.set_count) ?? 1;
    const uom = String(next.uom ?? "").trim().toLocaleLowerCase("vi");
    if (width && width > 0 && height && height > 0 && sets > 0 && ["m2", "m²", "sqm"].includes(uom)) {
      next.qty = Math.max(width * height, numeric(next.min_area_sqm) ?? 0) * sets;
    } else if (sets > 0 && ["bộ", "bo", "set"].includes(uom)) {
      next.qty = sets;
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
    qty_bar: "Cây", theoretical_kg: "Kg BR", qty: "SL", uom: "ĐVT", rate: "Đ.Giá",
    amount: "T.Tiền", color: "Màu", colour: "Màu", is_stamped: "Dập", so_no: "SO NCC",
    warehouse: "Kho", note: "G.Chú", width_m: "Rộng", height_m: "Cao", set_count: "Bộ",
  };
  return labels[field.fieldname] ?? field.label ?? field.fieldname;
}

function defaultWeight(field: DocField): number {
  const fixed: Record<string, number> = {
    item_code: 12, length_m: 4.5, theoretical_kg_per_m: 5, qty_bundle: 4, qty_bar: 4.5,
    theoretical_kg: 5.5, qty: 4.5, uom: 5, rate: 7, amount: 8, color: 6, colour: 6,
    is_stamped: 4.5, so_no: 6, warehouse: 7, note: 8, width_m: 5, height_m: 5, set_count: 4.5,
  };
  return fixed[field.fieldname] ?? (["Currency", "Float", "Int", "Percent"].includes(field.fieldtype) ? 6 : 8);
}

function normalizeWeights(cols: DocField[], weights: Record<string, number>): Record<string, number> {
  const raw = cols.map((field) => Math.max(MIN_WEIGHT, weights[field.fieldname] ?? defaultWeight(field)));
  const sum = raw.reduce((total, value) => total + value, 0) || 1;
  return Object.fromEntries(cols.map((field, index) => [field.fieldname, (raw[index]! / sum) * 100]));
}

export function ActionChildGrid(props: ActionChildGridProps) {
  const { actionName, table, childMeta, rows, onChange, registry, services, roles, parentDoc, readOnly } = props;
  const [pickedRow, setPickedRow] = useState<number | null>(rows.length ? 0 : null);
  const [pickedColumn, setPickedColumn] = useState(0);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const [allowedColors, setAllowedColors] = useState<Record<string, string[]>>({});
  const [allowedUoms, setAllowedUoms] = useState<Record<string, string[]>>({});
  const latestRows = useRef(rows);
  useEffect(() => { latestRows.current = rows; }, [rows]);

  const declared = useMemo(() => table.columns.map((column) => column.fieldname), [table.columns]);
  const baseCols = useMemo(() => declared.map((fieldname) => {
    const metaField = (childMeta.fields ?? []).find((field) => field.fieldname === fieldname);
    const declaredField = table.columns.find((column) => column.fieldname === fieldname)!;
    return metaField
      ? {
          ...metaField,
          label: declaredField.label || metaField.label,
          ...(declaredField.link_filters ? { link_filters: declaredField.link_filters } : {}),
          in_list_view: 1 as const,
        }
      : ({ ...declaredField, reqd: declaredField.required ? 1 : 0, in_list_view: 1 } as DocField);
  }), [childMeta, declared, table.columns]);

  const storageKey = `mf-action-grid-layout:${actionName}:${table.fieldname}:${table.presentation?.row_doctype ?? childMeta.name}:v1`;
  const [layout, setLayout] = useState<GridLayout>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...EMPTY_LAYOUT, ...(JSON.parse(saved) as Partial<GridLayout>) } : { ...EMPTY_LAYOUT };
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
  const weights = normalizeWeights(cols, layout.weights);

  const saveRows = (next: Doc[]) => { latestRows.current = next; onChange(next); };
  const selectedSet = new Set(selectedRows);

  const dynamicField = (field: DocField, row: Doc): DocField => {
    const item = String(row.item_code ?? "").trim();
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

  const enrichItem = async (rowIndex: number, itemCode: string, snapshot: Doc[]) => {
    if (!services?.fetchDocument) return;
    const item = await services.fetchDocument("Item", itemCode).catch(() => undefined);
    if (!item) return;
    const has = (name: string) => (childMeta.fields ?? []).some((field) => field.fieldname === name);
    const target = snapshot[rowIndex];
    if (!target || String(target.item_code ?? "") !== itemCode) return;
    const next = { ...target } as Doc;
    const map: Array<[string, string]> = [
      ["stock_uom", "stock_uom"], ["inventory_mode", "inventory_mode"], ["measurement_profile", "measurement_profile"],
      ["material_specification", "material_specification"], ["item_name", "item_name"], ["description", "description"],
      ["min_area_sqm", "min_area_sqm"], ["default_color", "color"], ["default_warehouse", "warehouse"],
    ];
    for (const [source, destination] of map) {
      if (!has(destination) || (next[destination] != null && next[destination] !== "")) continue;
      const value = item[source];
      if (value != null && value !== "") next[destination] = value;
    }
    const purchaseUom = String(item.default_purchase_uom ?? item.purchase_uom ?? item.stock_uom ?? "").trim();
    if (has("uom") && !next.uom && purchaseUom) next.uom = purchaseUom;
    const uoms = Array.isArray(item.uoms)
      ? item.uoms.map((entry) => entry && typeof entry === "object" ? String((entry as Record<string, unknown>).uom ?? "").trim() : "").filter(Boolean)
      : [];
    const allowedUomValues = [...new Set([purchaseUom, String(item.stock_uom ?? "").trim(), ...uoms].filter(Boolean))];
    setAllowedUoms((current) => ({ ...current, [itemCode]: allowedUomValues }));
    const colors = Array.isArray(item.allowed_colors)
      ? item.allowed_colors.map((entry) => entry && typeof entry === "object" ? String((entry as Record<string, unknown>).color ?? "").trim() : "").filter(Boolean)
      : [];
    setAllowedColors((current) => ({ ...current, [itemCode]: colors }));
    if (next.color && !colors.includes(String(next.color))) next.color = undefined;
    if (next.colour && !colors.includes(String(next.colour))) next.colour = undefined;
    const specification = String(next.material_specification ?? "").trim();
    if (specification && has("theoretical_kg_per_m")) {
      const spec = await services.fetchDocument("Material Specification", specification).catch(() => undefined);
      const kgPerM = numeric(spec?.theoretical_kg_per_m);
      if (kgPerM && kgPerM > 0) next.theoretical_kg_per_m = kgPerM;
    }
    const current = latestRows.current;
    if (!current[rowIndex] || String(current[rowIndex]!.item_code ?? "") !== itemCode) return;
    saveRows(current.map((row, index) => index === rowIndex ? computed({ ...row, ...next }, childMeta) : row));
  };

  const setCell = (rowIndex: number, fieldname: string, value: unknown) => {
    const current = latestRows.current;
    const next = current.map((row, index) => {
      if (index !== rowIndex) return row;
      const changingItem = fieldname === "item_code" && value !== row.item_code;
      const cleared = changingItem ? {
        color: undefined, colour: undefined, uom: undefined, stock_uom: undefined, inventory_mode: undefined,
        measurement_profile: undefined, material_specification: undefined, theoretical_kg_per_m: undefined,
        theoretical_kg: undefined, amount: undefined,
      } : {};
      return computed({ ...row, ...cleared, [fieldname]: value } as Doc, childMeta);
    });
    saveRows(next);
    if (fieldname === "item_code" && value) void enrichItem(rowIndex, String(value), next);
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
    let next = rows.filter((_, index) => !removing.has(index));
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
  const moveRows = (offset: number) => {
    const chosen = selectedRows.length
      ? rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0)
      : pickedRow == null ? [] : [pickedRow];
    if (!chosen.length) return;
    const moving = new Set(chosen);
    const next = [...rows];
    const order = offset < 0 ? chosen : [...chosen].reverse();
    for (const index of order) {
      const target = index + offset;
      if (target < 0 || target >= next.length || moving.has(target)) continue;
      [next[index], next[target]] = [next[target]!, next[index]!];
      moving.delete(index); moving.add(target);
    }
    saveRows(next);
    if (pickedRow != null) setPickedRow(Math.max(0, Math.min(next.length - 1, pickedRow + offset)));
  };
  const clonePicked = () => {
    if (pickedRow == null || rows.length >= table.max_rows) return;
    const source = rows[pickedRow]; if (!source) return;
    const copy = { ...source, name: `new-${Date.now()}` } as Doc;
    saveRows([...rows.slice(0, pickedRow + 1), copy, ...rows.slice(pickedRow + 1)]);
  };
  const fillDown = () => {
    if (pickedRow == null) return;
    const source = rows[pickedRow]; if (!source) return;
    saveRows(rows.map((row, index) => {
      if (index <= pickedRow) return row;
      const next = { ...row } as Doc;
      for (const field of baseCols) {
        if (field.read_only || field.fieldname === "name") continue;
        const value = source[field.fieldname];
        if (value != null && value !== "" && (next[field.fieldname] == null || next[field.fieldname] === "")) next[field.fieldname] = value;
      }
      return computed(next, childMeta);
    }));
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
      event.preventDefault(); focusCell(nr, nc);
    };
    if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) go(1, 0);
    else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) go(-1, 0);
    else if (event.key === "Tab" && !event.shiftKey) c < cols.length - 1 ? go(0, 1) : (r < rows.length - 1 && (event.preventDefault(), focusCell(r + 1, 0)));
    else if (event.key === "Tab" && event.shiftKey) c > 0 ? go(0, -1) : (r > 0 && (event.preventDefault(), focusCell(r - 1, cols.length - 1)));
  };
  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly || !table.allow_paste) return;
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const startRow = pickedRow ?? 0;
    const startColumn = Math.min(pickedColumn, Math.max(0, cols.length - 1));
    const next = [...rows];
    const enrich: Array<{ index: number; item: string }> = [];
    matrix.forEach((cells, rowOffset) => {
      const rowIndex = startRow + rowOffset;
      if (rowIndex >= table.max_rows) return;
      if (!next[rowIndex]) next[rowIndex] = seedRow(childMeta, table, rowIndex);
      const row = { ...next[rowIndex]! } as Doc;
      const before = String(row.item_code ?? "");
      cells.forEach((raw, columnOffset) => {
        const field = cols[startColumn + columnOffset]; if (!field) return;
        const value = parsePasted(field, raw); if (value !== undefined) row[field.fieldname] = value;
      });
      next[rowIndex] = computed(row, childMeta);
      const item = String(row.item_code ?? "");
      if (item && item !== before) enrich.push({ index: rowIndex, item });
    });
    saveRows(next);
    enrich.forEach(({ index, item }) => { void enrichItem(index, item, next); });
  };
  const onCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (window.getSelection()?.toString()) return;
    event.preventDefault();
    const line = (values: unknown[]) => values.map((value) => String(value ?? "")).join("\t");
    event.clipboardData.setData("text/plain", [line(cols.map((field) => layout.labels[field.fieldname] || shortLabel(field))), ...rows.map((row) => line(cols.map((field) => row[field.fieldname])))].join("\n"));
  };

  const dragged = useRef<string | null>(null);
  const dropColumn = (target: string) => {
    const source = dragged.current; dragged.current = null;
    if (!source || source === target) return;
    const current = cols.map((field) => field.fieldname);
    const without = current.filter((name) => name !== source);
    const at = without.indexOf(target);
    if (at < 0) return;
    setLayout((value) => ({ ...value, order: [...without.slice(0, at), source, ...without.slice(at)] }));
  };
  const startResize = (fieldname: string, event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation();
    const index = cols.findIndex((field) => field.fieldname === fieldname);
    const neighbor = cols[index + 1] ?? cols[index - 1];
    if (!neighbor) return;
    const handle = event.currentTarget;
    const container = gridRef.current?.getBoundingClientRect().width ?? 1000;
    const startX = event.clientX;
    const initial = normalizeWeights(cols, layout.weights);
    const own = initial[fieldname] ?? 8;
    const other = initial[neighbor.fieldname] ?? 8;
    handle.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const delta = ((pointer.clientX - startX) / container) * 100;
      const nextOwn = Math.max(MIN_WEIGHT, Math.min(own + other - MIN_WEIGHT, own + delta));
      const nextOther = own + other - nextOwn;
      setLayout((value) => ({ ...value, weights: { ...value.weights, ...initial, [fieldname]: nextOwn, [neighbor.fieldname]: nextOther } }));
    };
    const done = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
  };

  const pinnedOffsets = new Map<string, number>();
  let left = readOnly ? 2.5 : 5;
  for (const field of cols) {
    if (field.fieldname !== identity && !layout.pinned.includes(field.fieldname)) continue;
    pinnedOffsets.set(field.fieldname, left);
    left += 5;
  }
  const sticky = (fieldname: string, header = false) => {
    const offset = pinnedOffsets.get(fieldname);
    return {
      className: offset === undefined ? "" : `sticky ${header ? "z-30" : "z-10"} bg-card shadow-[inset_-1px_0_0_var(--border)]`,
      style: offset === undefined ? undefined : { left: `${offset}rem` },
    };
  };

  const totals = new Map<string, number>();
  for (const field of cols.filter((entry) => ["Currency", "Float", "Int", "Percent"].includes(entry.fieldtype))) {
    const values = rows.map((row) => numeric(row[field.fieldname])).filter((value): value is number => value !== undefined);
    if (values.length) totals.set(field.fieldname, values.reduce((sum, value) => sum + value, 0));
  }
  const strongEditable = table.presentation?.emphasize_editable !== false;

  return (
    <div className="space-y-2" data-action-child-grid={table.fieldname}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(1)}><Plus /> Dòng</Button>
        <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => setColumnSettingsOpen(true)}><Columns3 /> Cột</Button>
        <Button type="button" variant="ghost" size="sm" disabled={readOnly || (pickedRow == null && !selectedRows.length)} onClick={() => moveRows(-1)}><ArrowUp /> Lên</Button>
        <Button type="button" variant="ghost" size="sm" disabled={readOnly || (pickedRow == null && !selectedRows.length)} onClick={() => moveRows(1)}><ArrowDown /> Xuống</Button>
        <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(10)}><Plus /> 10 dòng</Button>
        <Button type="button" variant="outline" size="sm" disabled={readOnly || pickedRow == null || rows.length >= table.max_rows} onClick={clonePicked}><Copy /> Nhân bản</Button>
        <Button type="button" variant="outline" size="sm" disabled={readOnly || pickedRow == null} onClick={fillDown}><ArrowDownToLine /> Điền xuống</Button>
        {selectedRows.length ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selectedRows.length}</Button> : null}
        {lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
        <span className="ml-auto text-xs text-muted-foreground">{rows.length}/{table.max_rows} dòng · Ctrl+V từ Excel</span>
      </div>

      <div ref={gridRef} className="min-w-0 overflow-hidden rounded-md border" onPaste={onPaste} onCopy={onCopy} onKeyDown={onKeyDown}>
        <Table className="w-full table-fixed text-[12px]">
          <colgroup>
            {!readOnly ? <col style={{ width: "2.5rem" }} /> : null}
            <col style={{ width: "2.5rem" }} />
            {cols.map((field) => <col key={field.fieldname} style={{ width: `${weights[field.fieldname] ?? 5}%` }} />)}
            {!readOnly ? <col style={{ width: "4rem" }} /> : null}
          </colgroup>
          <TableHeader className="bg-muted/50">
            <TableRow className="h-8 hover:bg-transparent">
              {!readOnly ? <TableHead className="sticky left-0 z-40 bg-card p-1 text-center"><Checkbox checked={rows.length > 0 && selectedRows.length === rows.length} onCheckedChange={() => setSelectedRows(selectedRows.length === rows.length ? [] : rows.map(rowKey))} /></TableHead> : null}
              <TableHead className={`sticky z-40 bg-card px-1 text-right ${readOnly ? "left-0" : "left-10"}`}>#</TableHead>
              {cols.map((field) => {
                const pin = sticky(field.fieldname, true);
                return <TableHead key={field.fieldname} draggable={!readOnly} onDragStart={() => { dragged.current = field.fieldname; }} onDragOver={(event) => { if (dragged.current) event.preventDefault(); }} onDrop={() => dropColumn(field.fieldname)} className={`group relative truncate whitespace-nowrap px-1.5 text-[11px] font-bold ${pin.className}`} style={pin.style} title="Kéo tiêu đề để đổi chỗ · kéo mép phải để đổi rộng">
                  {layout.labels[field.fieldname] || shortLabel(field)}{field.reqd ? <span className="text-destructive">*</span> : null}
                  {!readOnly ? <span onPointerDown={(event) => startResize(field.fieldname, event)} onDragStart={(event) => event.preventDefault()} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-primary" /> : null}
                </TableHead>;
              })}
              {!readOnly ? <TableHead className="px-1" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => <TableRow key={rowKey(row, rowIndex)} className={pickedRow === rowIndex || selectedSet.has(rowKey(row, rowIndex)) ? "bg-primary/[0.05] hover:bg-primary/[0.05]" : "hover:bg-transparent"} onClick={() => setPickedRow(rowIndex)}>
              {!readOnly ? <TableCell className="sticky left-0 z-20 bg-card p-1 text-center"><Checkbox checked={selectedSet.has(rowKey(row, rowIndex))} onCheckedChange={() => setSelectedRows((current) => current.includes(rowKey(row, rowIndex)) ? current.filter((value) => value !== rowKey(row, rowIndex)) : [...current, rowKey(row, rowIndex)])} /></TableCell> : null}
              <TableCell className={`sticky z-20 bg-card px-1 text-right text-[11px] text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>{rowIndex + 1}</TableCell>
              {cols.map((field, columnIndex) => {
                const pin = sticky(field.fieldname);
                const effective = dynamicField(field, row);
                const resolved = resolveField(effective, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                const cellReadOnly = Boolean(readOnly || resolved.readOnly || !resolved.visible);
                if (!resolved.visible) return <TableCell key={field.fieldname} data-cell={`${rowIndex}:${columnIndex}`} data-editable="false" className={`h-9 !bg-muted/80 px-1 text-center font-semibold text-muted-foreground ${pin.className}`} style={pin.style}>—</TableCell>;
                const Control = registry.resolve(effective.fieldtype) ?? FallbackControl;
                const editableClass = strongEditable
                  ? "!bg-primary/[0.16] font-bold ring-2 ring-inset ring-primary/55 focus-within:!bg-primary/[0.24] focus-within:ring-[3px] focus-within:ring-primary"
                  : "!bg-primary/[0.07] ring-1 ring-inset ring-primary/25 focus-within:ring-2";
                return <TableCell key={field.fieldname} data-cell={`${rowIndex}:${columnIndex}`} data-editable={cellReadOnly ? "false" : "true"} className={`${cellReadOnly ? "!bg-muted/70 text-muted-foreground" : editableClass} h-9 px-1 py-0.5 ${pin.className}`} style={pin.style} onFocusCapture={() => { setPickedRow(rowIndex); setPickedColumn(columnIndex); }} onClick={() => { setPickedRow(rowIndex); setPickedColumn(columnIndex); }}>
                  <Control field={effective} value={row[field.fieldname]} onChange={(value: unknown) => setCell(rowIndex, field.fieldname, value)} readOnly={cellReadOnly} masked={resolved.masked} services={services} docname={String(row.name ?? "")} linkTarget={effective.fieldtype === "Link" ? effective.options : undefined} parentDoctype={childMeta.name} docValues={row} roles={roles} compact />
                </TableCell>;
              })}
              {!readOnly ? <TableCell className="whitespace-nowrap px-1 py-0.5"><Button type="button" variant="ghost" size="icon-sm" onClick={() => setDetailRow(rowIndex)} title="Chi tiết dòng">⋯</Button><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteRows([rowIndex])}><X /></Button></TableCell> : null}
            </TableRow>)}
            {rows.length > 0 && totals.size > 0 ? <TableRow className="h-8 border-t-2 bg-muted/40 font-bold hover:bg-muted/40">
              {!readOnly ? <TableCell className="sticky left-0 z-20 bg-muted/40" /> : null}<TableCell className={`sticky z-20 bg-muted/40 px-1 text-right ${readOnly ? "left-0" : "left-10"}`}>Σ</TableCell>
              {cols.map((field) => <TableCell key={field.fieldname} className="truncate px-1 text-right tabular-nums">{totals.has(field.fieldname) ? (services?.fmt?.number ? services.fmt.number(totals.get(field.fieldname)!) : totals.get(field.fieldname)!.toLocaleString("vi-VN")) : null}</TableCell>)}
              {!readOnly ? <TableCell /> : null}
            </TableRow> : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
        <DialogContent className="max-h-[82vh] w-[min(94vw,680px)] max-w-none overflow-y-auto">
          <DialogHeader><DialogTitle>Tùy chỉnh cột</DialogTitle><DialogDescription>Hiện/ẩn, đổi tên và ghim. Kéo trực tiếp tiêu đề để đổi vị trí hoặc kích thước.</DialogDescription></DialogHeader>
          <div className="space-y-1">
            {baseCols.map((field) => {
              const hidden = layout.hidden.includes(field.fieldname); const isIdentity = field.fieldname === identity; const pinned = isIdentity || layout.pinned.includes(field.fieldname);
              return <div key={field.fieldname} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2">
                <Checkbox checked={!hidden} disabled={isIdentity} onCheckedChange={() => setLayout((value) => ({ ...value, hidden: hidden ? value.hidden.filter((name) => name !== field.fieldname) : [...value.hidden, field.fieldname] }))} />
                <Input className="h-8" value={layout.labels[field.fieldname] ?? shortLabel(field)} onChange={(event) => setLayout((value) => ({ ...value, labels: { ...value.labels, [field.fieldname]: event.target.value } }))} />
                <Button type="button" variant={pinned ? "secondary" : "ghost"} size="icon-sm" disabled={hidden || isIdentity} onClick={() => setLayout((value) => ({ ...value, pinned: pinned ? value.pinned.filter((name) => name !== field.fieldname) : [...value.pinned, field.fieldname] }))}>{pinned ? <PinOff /> : <Pin />}</Button>
              </div>;
            })}
          </div>
          <Button type="button" variant="outline" onClick={() => setLayout({ ...EMPTY_LAYOUT })}><RotateCcw /> Cột về mặc định</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={detailRow != null} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[88vh] w-[min(96vw,900px)] max-w-none overflow-y-auto">
          <DialogHeader><DialogTitle>{childMeta.label ?? childMeta.name} · dòng {detailRow == null ? "" : detailRow + 1}</DialogTitle></DialogHeader>
          {detailRow != null && rows[detailRow] ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(childMeta.fields ?? []).filter((field) => !layoutField(field.fieldtype)).map((field) => {
            const row = rows[detailRow]!; const effective = dynamicField(field, row); const resolved = resolveField(effective, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
            if (!resolved.visible) return null; const Control = registry.resolve(effective.fieldtype) ?? FallbackControl;
            return <label key={field.fieldname} className="grid min-w-0 gap-1 text-sm font-medium"><span>{field.label ?? field.fieldname}{field.reqd ? <span className="text-destructive">*</span> : null}</span><Control field={effective} value={row[field.fieldname]} onChange={(value: unknown) => setCell(detailRow, field.fieldname, value)} readOnly={Boolean(readOnly || resolved.readOnly)} masked={resolved.masked} services={services} docname={String(row.name ?? "")} linkTarget={effective.fieldtype === "Link" ? effective.options : undefined} parentDoctype={childMeta.name} docValues={row} roles={roles} /></label>;
          })}</div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
