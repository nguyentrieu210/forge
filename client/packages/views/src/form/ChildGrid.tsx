/** @jsxImportSource react */
/**
 * ChildGrid — one generic child-table renderer for every DocType.
 *
 * Authority and presentation rules come from canonical metadata:
 *   viewPolicy.list.columns → in_list_view → safe field fallback
 *   resolveField() → visibility/read-only/required/permission mirror
 *   buildMetadataDefaults() → new-row defaults
 *   collectFetchFrom() → generic link-derived effects
 *
 * There are deliberately no Sales/Purchase/industry DocType branches here. Domain workflows that
 * need multi-source pricing/ATP/formulas belong to their app Worker/Experience, not this renderer.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Columns3, Copy, Maximize2, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import {
  buildMetadataDefaults,
  collectFetchFrom,
  resolveField,
  shouldApplyAutomaticValue,
  type Doc,
  type DocField,
  type DocTypeMeta,
  type FieldValueProvenance,
} from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, useT,
} from "@metaforge/ui";

export interface ChildGridProps {
  childMeta: DocTypeMeta;
  rows: Doc[];
  onChange: (rows: Doc[]) => void;
  registry: ControlRegistry;
  services?: FieldServices;
  readOnly?: boolean;
  parentDoc?: Record<string, unknown>;
  roles?: string[];
  /** Context defaults already resolved through BusinessContextPolicy by the parent table control. */
  rowDefaults?: Record<string, unknown>;
}

interface GridLayout {
  w: Record<string, number>;
  order: string[];
  hidden: string[];
  labels: Record<string, string>;
}

const EMPTY_LAYOUT: GridLayout = { w: {}, order: [], hidden: [], labels: {} };
const NUMERIC_TYPES = new Set(["Int", "Float", "Currency", "Percent"]);
const LAYOUT_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"]);

function isLayout(fieldtype: string): boolean {
  return LAYOUT_TYPES.has(fieldtype);
}

function declaredColumns(meta: DocTypeMeta): DocField[] {
  const names = meta.viewPolicy?.list?.columns ?? [];
  if (names.length) {
    const byName = new Map((meta.fields ?? []).map((field) => [field.fieldname, field]));
    const fields = names.map((name) => byName.get(name)).filter((field): field is DocField => Boolean(field && !isLayout(field.fieldtype)));
    if (fields.length) return fields;
  }
  const inList = (meta.fields ?? []).filter((field) => field.in_list_view === 1 && !isLayout(field.fieldtype));
  if (inList.length) return inList;
  return (meta.fields ?? []).filter((field) => !isLayout(field.fieldtype)).slice(0, 6);
}

function visibleColumns(
  columns: DocField[],
  meta: DocTypeMeta,
  rows: Doc[],
  parentDoc?: Record<string, unknown>,
  roles?: string[],
): DocField[] {
  // With no rows there is no row state to evaluate. Keep declared columns so a depends_on field
  // does not disappear before the operator creates the first row.
  if (!rows.length) return columns;
  const visible = columns.filter((column) => rows.some((row) => resolveField(
    column.list_only ? { ...column, list_only: 0 } : column,
    meta,
    { doc: row, parent: parentDoc, roles, assumeWritable: true },
  ).visible));
  return visible.length ? visible : columns;
}

/** Canonical columns used by compact and expanded surfaces. No DocType-name branches. */
export function resolveChildGridColumns(
  meta: DocTypeMeta,
  rows: Doc[],
  parentDoc?: Record<string, unknown>,
  roles?: string[],
): DocField[] {
  return visibleColumns(declaredColumns(meta), meta, rows, parentDoc, roles);
}

/**
 * Compact hiding is explicit only. Automatic `surface=quick` inference is intentionally not used
 * as a hiding rule because compiler defaults often mark only required fields quick; silently
 * hiding totals/status fields would be a presentation regression. Apps that want a compact child
 * surface declare `viewPolicy.quickEntry.fields`.
 */
export function defaultChildGridHiddenColumns(meta: DocTypeMeta, columns: DocField[], expanded: boolean): string[] {
  if (expanded) return [];
  const quick = meta.viewPolicy?.quickEntry?.fields ?? [];
  if (!quick.length) return [];
  const identity = identityColumn(columns);
  const keep = new Set([...quick, ...(identity ? [identity] : [])]);
  return columns.filter((field) => !keep.has(field.fieldname)).map((field) => field.fieldname);
}

export interface AverageWeightResult {
  totalLengthM?: number;
  totalAreaSqm?: number;
  averageWeight?: number;
  basis?: "kg/m" | "kg/m²" | "kg/cây" | "kg/ĐVT";
}

/** Compatibility algebra only. Generic ChildGrid never invokes this business formula. */
export function derivePurchaseOrderBarem(row: Doc): number | undefined {
  const length = Number(row.length_m);
  const bars = Number(row.qty_bar);
  const kgPerM = Number(row.theoretical_kg_per_m);
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(bars) || bars <= 0 || !Number.isFinite(kgPerM) || kgPerM <= 0) return undefined;
  return length * bars * kgPerM;
}

/** Compatibility algebra only. Generic ChildGrid never invokes this business formula. */
export function deriveAverageWeight(row: Doc): AverageWeightResult {
  const positive = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const uom = String(row.uom ?? "").trim().toLocaleLowerCase("vi");
  const isKg = ["kg", "kilogram", "ki-lô-gam"].includes(uom);
  const totalKg = isKg ? positive(row.qty) : positive(row.actual_weight_kg);
  const bars = positive(row.qty_bar);
  const length = positive(row.length_m);
  const quantity = positive(row.qty);
  const width = positive(row.width_m);
  const height = positive(row.height_m);
  const pieces = positive(row.set_count);
  const inventoryMode = String(row.inventory_mode ?? "").trim();
  const isAreaItem = inventoryMode === "Tấm/Kính" || inventoryMode === "Thành phẩm theo m2";
  const totalAreaSqm = isAreaItem && width > 0 && height > 0 && pieces > 0 ? width * height * pieces : undefined;
  const totalLengthM = bars > 0 && length > 0 ? bars * length : length || undefined;
  let divisor = 0;
  let basis: AverageWeightResult["basis"];
  if (totalAreaSqm) { divisor = totalAreaSqm; basis = "kg/m²"; }
  else if (totalLengthM) { divisor = totalLengthM; basis = "kg/m"; }
  else if (bars > 0) { divisor = bars; basis = "kg/cây"; }
  else if (!isKg && quantity > 0) { divisor = quantity; basis = "kg/ĐVT"; }
  return {
    ...(totalAreaSqm ? { totalAreaSqm } : {}),
    ...(totalLengthM ? { totalLengthM } : {}),
    ...(totalKg > 0 && divisor > 0 ? { averageWeight: totalKg / divisor, basis } : {}),
  };
}

function rowKey(row: Doc, index: number): string {
  return String(row.name ?? `row-${index}`);
}

function dynamicLinkTarget(field: DocField, row: Doc): string | undefined {
  if (field.fieldtype === "Link") return field.options;
  if (field.fieldtype !== "Dynamic Link" || !field.options) return undefined;
  const target = row[field.options];
  return typeof target === "string" && target.trim() ? target.trim() : undefined;
}

function identityColumn(columns: DocField[]): string | undefined {
  return columns.find((field) => field.fieldtype === "Link" || field.fieldtype === "Dynamic Link")?.fieldname ?? columns[0]?.fieldname;
}

function columnWidth(field: DocField): number {
  const labelLength = (field.label ?? field.fieldname).length;
  if (field.fieldtype === "Check") return 5;
  if (field.fieldtype === "Currency") return Math.max(8, Math.min(12, 6 + labelLength * 0.35));
  if (NUMERIC_TYPES.has(field.fieldtype)) return Math.max(6, Math.min(10, 5 + labelLength * 0.3));
  if (field.fieldtype === "Date") return 9;
  if (field.fieldtype === "Datetime") return 12;
  if (field.fieldtype === "Time") return 7;
  if (field.fieldtype === "Select") {
    const longest = String(field.options ?? "").split("\n").reduce((max, option) => Math.max(max, option.trim().length), 0);
    return Math.max(7, Math.min(14, 5 + Math.max(labelLength, longest) * 0.45));
  }
  if (field.fieldtype === "Link" || field.fieldtype === "Dynamic Link") return Math.max(10, Math.min(16, 8 + labelLength * 0.45));
  if (["Small Text", "Text", "Long Text", "Text Editor", "Markdown Editor", "Code"].includes(field.fieldtype)) return 14;
  return Math.max(8, Math.min(14, 7 + labelLength * 0.4));
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

function readLayout(key: string, fallbackHidden: string[]): GridLayout {
  if (typeof localStorage === "undefined") return { ...EMPTY_LAYOUT, hidden: [...fallbackHidden] };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...EMPTY_LAYOUT, hidden: [...fallbackHidden] };
    const parsed = JSON.parse(raw) as Partial<GridLayout>;
    return {
      w: parsed.w ?? {},
      order: parsed.order ?? [],
      hidden: parsed.hidden ?? [...fallbackHidden],
      labels: parsed.labels ?? {},
    };
  } catch {
    return { ...EMPTY_LAYOUT, hidden: [...fallbackHidden] };
  }
}

function detailSpan(field: DocField): string {
  return ["Small Text", "Text", "Long Text", "Text Editor", "Code", "Markdown Editor"].includes(field.fieldtype)
    ? "sm:col-span-2 xl:col-span-3"
    : "";
}

type RowProvenance = Record<string, FieldValueProvenance>;

export function ChildGrid(props: ChildGridProps) {
  const t = useT();
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles, rowDefaults } = props;
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const [picked, setPicked] = useState({ row: 0, column: 0 });
  const [effectErrors, setEffectErrors] = useState<Record<number, string>>({});
  const latestRows = useRef(rows);
  const effectVersion = useRef(new Map<string, number>());
  const provenance = useRef(new Map<string, RowProvenance>());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { latestRows.current = rows; }, [rows]);

  const canonicalColumns = useMemo(
    () => resolveChildGridColumns(childMeta, rows, parentDoc, roles),
    [childMeta, rows, parentDoc, roles],
  );
  const defaultHidden = useMemo(
    () => defaultChildGridHiddenColumns(childMeta, canonicalColumns, expanded),
    [childMeta, canonicalColumns, expanded],
  );
  const layoutKey = `mf-grid-layout:${childMeta.name}:${expanded ? "expanded-meta-v1" : "compact-meta-v1"}`;
  const [layout, setLayout] = useState<GridLayout>(() => readLayout(layoutKey, defaultHidden));
  useEffect(() => { setLayout(readLayout(layoutKey, defaultHidden)); }, [layoutKey, defaultHidden.join("|")]);

  const saveLayout = (next: GridLayout) => {
    setLayout(next);
    try { localStorage.setItem(layoutKey, JSON.stringify(next)); } catch { /* presentation preference only */ }
  };
  const resetLayout = () => saveLayout({ ...EMPTY_LAYOUT, hidden: [...defaultHidden] });

  const orderedColumns = useMemo(() => {
    if (!layout.order.length) return canonicalColumns;
    const byName = new Map(canonicalColumns.map((field) => [field.fieldname, field]));
    const ordered = layout.order.map((name) => byName.get(name)).filter((field): field is DocField => Boolean(field));
    const known = new Set(ordered.map((field) => field.fieldname));
    return [...ordered, ...canonicalColumns.filter((field) => !known.has(field.fieldname))];
  }, [canonicalColumns, layout.order]);
  const identity = identityColumn(orderedColumns);
  const columns = orderedColumns.filter((field) => field.fieldname === identity || !layout.hidden.includes(field.fieldname));
  const selectedSet = new Set(selected);
  const fetchRules = useMemo(() => collectFetchFrom(childMeta), [childMeta]);
  const metaByName = useMemo(() => new Map((childMeta.fields ?? []).map((field) => [field.fieldname, field])), [childMeta]);

  const emitRows = (next: Doc[]) => {
    latestRows.current = next;
    onChange(next);
  };

  const rowProvenance = (key: string): RowProvenance => {
    let current = provenance.current.get(key);
    if (!current) { current = {}; provenance.current.set(key, current); }
    return current;
  };

  const blankRow = (name: string): Doc => {
    const row = { name, doctype: childMeta.name, ...buildMetadataDefaults(childMeta) } as Doc;
    for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
      if (!metaByName.has(fieldname)) continue;
      if (row[fieldname] == null || row[fieldname] === "") row[fieldname] = value;
    }
    return row;
  };

  const runFetchEffects = async (rowIndex: number, initialSources: string[]) => {
    if (!services?.fetchDocument && !services?.fetchValue) return;
    const current = latestRows.current[rowIndex];
    if (!current) return;
    const key = rowKey(current, rowIndex);
    const version = (effectVersion.current.get(key) ?? 0) + 1;
    effectVersion.current.set(key, version);
    const queue = [...new Set(initialSources)];
    const visited = new Set<string>();
    const working = { ...current } as Doc;
    const prov = rowProvenance(key);
    try {
      while (queue.length) {
        const sourceField = queue.shift()!;
        if (visited.has(sourceField)) continue;
        visited.add(sourceField);
        const rules = fetchRules.filter((rule) => rule.linkField === sourceField);
        if (!rules.length) continue;
        const sourceName = String(working[sourceField] ?? "").trim();
        if (!sourceName) {
          for (const rule of rules) {
            const target = metaByName.get(rule.target);
            if (!target || !shouldApplyAutomaticValue(target, working[rule.target], prov[rule.target])) continue;
            working[rule.target] = "";
            prov[rule.target] = "auto";
            queue.push(rule.target);
          }
          continue;
        }
        const sourceDoctype = rules.find((rule) => rule.sourceDoctype)?.sourceDoctype;
        if (!sourceDoctype) continue;
        const sourceDoc = services.fetchDocument ? await services.fetchDocument(sourceDoctype, sourceName) : undefined;
        if (effectVersion.current.get(key) !== version) return;
        for (const rule of rules) {
          const target = metaByName.get(rule.target);
          if (!target || !shouldApplyAutomaticValue(target, working[rule.target], prov[rule.target])) continue;
          const value = sourceDoc
            ? sourceDoc[rule.sourceField]
            : await services.fetchValue?.(sourceDoctype, sourceName, rule.sourceField);
          if (effectVersion.current.get(key) !== version) return;
          working[rule.target] = value ?? "";
          prov[rule.target] = "auto";
          queue.push(rule.target);
        }
      }
      const live = latestRows.current;
      if (effectVersion.current.get(key) !== version || !live[rowIndex] || rowKey(live[rowIndex]!, rowIndex) !== key) return;
      emitRows(live.map((row, index) => index === rowIndex ? { ...row, ...working } : row));
      setEffectErrors((currentErrors) => { const next = { ...currentErrors }; delete next[rowIndex]; return next; });
    } catch (error) {
      setEffectErrors((currentErrors) => ({ ...currentErrors, [rowIndex]: error instanceof Error ? error.message : "Không tự điền được metadata của dòng." }));
    }
  };

  const setCell = (rowIndex: number, fieldname: string, value: unknown) => {
    const currentRows = latestRows.current;
    const row = currentRows[rowIndex];
    if (!row) return;
    const key = rowKey(row, rowIndex);
    rowProvenance(key)[fieldname] = "user";
    effectVersion.current.set(key, (effectVersion.current.get(key) ?? 0) + 1);
    emitRows(currentRows.map((entry, index) => index === rowIndex ? { ...entry, [fieldname]: value } as Doc : entry));
    void runFetchEffects(rowIndex, [fieldname]);
  };

  const addRows = (count: number) => {
    const start = latestRows.current.length;
    const added = Array.from({ length: count }, (_, index) => blankRow(`new-${Date.now()}-${start + index}`));
    emitRows([...latestRows.current, ...added]);
    const sources = [...new Set(fetchRules.map((rule) => rule.linkField))];
    if (sources.length) added.forEach((_, index) => void runFetchEffects(start + index, sources));
  };

  const deleteRows = (indexes: number[]) => {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < latestRows.current.length).sort((a, b) => a - b);
    if (!unique.length) return;
    setLastDeleted(unique.map((index) => ({ row: latestRows.current[index]!, index })));
    const removing = new Set(unique);
    emitRows(latestRows.current.filter((_, index) => !removing.has(index)));
    setSelected([]);
    setDetailRow(null);
  };

  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    const next = [...latestRows.current];
    for (const entry of [...lastDeleted].sort((a, b) => a.index - b.index)) next.splice(Math.min(entry.index, next.length), 0, entry.row);
    emitRows(next);
    setLastDeleted(null);
  };

  const duplicateSelected = () => {
    if (!selected.length) return;
    const copies = latestRows.current
      .map((row, index) => selectedSet.has(rowKey(row, index)) ? { ...row, name: `new-${Date.now()}-${index}` } as Doc : undefined)
      .filter((row): row is Doc => Boolean(row));
    emitRows([...latestRows.current, ...copies]);
    setSelected([]);
  };

  const moveColumn = (fieldname: string, direction: -1 | 1) => {
    const order = orderedColumns.map((field) => field.fieldname);
    const index = order.indexOf(fieldname);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    saveLayout({ ...layout, order });
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
      const nextRow = Math.max(0, Math.min(latestRows.current.length - 1, row + dr));
      const nextColumn = Math.max(0, Math.min(columns.length - 1, column + dc));
      if (nextRow === row && nextColumn === column) return;
      event.preventDefault();
      focusCell(nextRow, nextColumn);
    };
    if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) go(1, 0);
    else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) go(-1, 0);
    else if (event.key === "Tab" && !event.shiftKey && column < columns.length - 1) go(0, 1);
    else if (event.key === "Tab" && event.shiftKey && column > 0) go(0, -1);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const raw = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(raw)) return;
    event.preventDefault();
    const matrix = raw.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const next = [...latestRows.current];
    const changed = new Map<number, string[]>();
    matrix.forEach((cells, rowOffset) => {
      const rowIndex = picked.row + rowOffset;
      if (!next[rowIndex]) next[rowIndex] = blankRow(`new-${Date.now()}-${rowIndex}`);
      const row = { ...next[rowIndex]! } as Doc;
      const key = rowKey(row, rowIndex);
      const prov = rowProvenance(key);
      const fields: string[] = [];
      cells.forEach((cell, columnOffset) => {
        const field = columns[picked.column + columnOffset];
        if (!field) return;
        const parsed = parsePasted(field, cell);
        if (parsed === undefined) return;
        row[field.fieldname] = parsed;
        prov[field.fieldname] = "user";
        fields.push(field.fieldname);
      });
      next[rowIndex] = row;
      if (fields.length) changed.set(rowIndex, fields);
    });
    emitRows(next);
    for (const [rowIndex, fields] of changed) void runFetchEffects(rowIndex, fields);
  };

  const fieldControl = (row: Doc, rowIndex: number, field: DocField, compact = true) => {
    const editableField = field.list_only ? { ...field, list_only: 0 as const } : field;
    const resolved = resolveField(editableField, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
    if (!resolved.visible) return <span className="text-xs text-muted-foreground">—</span>;
    const Control = registry.resolve(field.fieldtype) ?? FallbackControl;
    return (
      <Control
        field={editableField}
        value={row[field.fieldname]}
        onChange={(value: unknown) => setCell(rowIndex, field.fieldname, value)}
        readOnly={Boolean(readOnly || resolved.readOnly)}
        masked={resolved.masked}
        required={resolved.required}
        services={services}
        docname={String(row.name ?? "")}
        linkTarget={dynamicLinkTarget(field, row)}
        parentDoctype={childMeta.name}
        docValues={row}
        roles={roles}
        compact={compact}
      />
    );
  };

  const gridSurface = (full: boolean) => (
    <div ref={gridRef} className={full ? "min-h-0 flex-1 overflow-auto border" : "overflow-x-auto rounded-md border"} onPaste={onPaste} onKeyDown={onKeyDown}>
      <Table unwrapped className="w-max min-w-full text-xs">
        <TableHeader className="sticky top-0 z-30 bg-muted/80 backdrop-blur">
          <TableRow className="h-9 hover:bg-transparent">
            {!readOnly ? <TableHead className="sticky left-0 z-40 w-10 min-w-10 bg-card p-1 text-center"><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={() => setSelected(selected.length === rows.length ? [] : rows.map(rowKey))} /></TableHead> : null}
            <TableHead className={`sticky z-40 w-11 min-w-11 bg-card px-1 text-right ${readOnly ? "left-0" : "left-10"}`}>#</TableHead>
            {columns.map((field) => {
              const custom = layout.w[field.fieldname];
              const width = custom ?? columnWidth(field);
              const sticky = field.fieldname === identity;
              return <TableHead key={field.fieldname} className={`${sticky ? "sticky z-30 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""} whitespace-nowrap px-2 text-[11px] font-bold`} style={{ width: `${width}rem`, minWidth: `${width}rem`, ...(sticky ? { left: readOnly ? 44 : 84 } : {}) }}>{layout.labels[field.fieldname] || field.label || field.fieldname}{field.reqd ? <span className="text-destructive">*</span> : null}</TableHead>;
            })}
            {!readOnly ? <TableHead className="w-20 min-w-20" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? rows.map((row, rowIndex) => (
            <TableRow key={rowKey(row, rowIndex)} className={selectedSet.has(rowKey(row, rowIndex)) ? "bg-primary/[0.04]" : ""}>
              {!readOnly ? <TableCell className="sticky left-0 z-20 w-10 min-w-10 bg-card p-1 text-center"><Checkbox checked={selectedSet.has(rowKey(row, rowIndex))} onCheckedChange={() => setSelected((current) => current.includes(rowKey(row, rowIndex)) ? current.filter((value) => value !== rowKey(row, rowIndex)) : [...current, rowKey(row, rowIndex)])} /></TableCell> : null}
              <TableCell className={`sticky z-20 w-11 min-w-11 bg-card px-1 text-right text-[11px] text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>{rowIndex + 1}</TableCell>
              {columns.map((field, columnIndex) => {
                const custom = layout.w[field.fieldname];
                const width = custom ?? columnWidth(field);
                const sticky = field.fieldname === identity;
                return <TableCell key={field.fieldname} data-cell={`${rowIndex}:${columnIndex}`} className={`${sticky ? "sticky z-10 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""} h-9 p-1 align-middle`} style={{ width: `${width}rem`, minWidth: `${width}rem`, ...(sticky ? { left: readOnly ? 44 : 84 } : {}) } as CSSProperties} onFocusCapture={() => setPicked({ row: rowIndex, column: columnIndex })} onClick={() => setPicked({ row: rowIndex, column: columnIndex })}>{fieldControl(row, rowIndex, field, true)}</TableCell>;
              })}
              {!readOnly ? <TableCell className="w-20 min-w-20 p-1"><div className="flex justify-end"><Button type="button" variant="ghost" size="icon-sm" onClick={() => setDetailRow(rowIndex)} aria-label="Chi tiết dòng"><Maximize2 /></Button><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteRows([rowIndex])} aria-label="Xóa dòng"><Trash2 /></Button></div></TableCell> : null}
            </TableRow>
          )) : <TableRow><TableCell colSpan={columns.length + (readOnly ? 1 : 3)} className="h-24 text-center text-sm text-muted-foreground">Chưa có dòng dữ liệu.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );

  const effectMessages = Object.entries(effectErrors).filter(([index]) => Number(index) < rows.length);

  return (
    <div className="min-w-0 space-y-2" data-child-grid={childMeta.name} data-columns={columns.map((field) => field.fieldname).join(",")}>
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly ? <Button type="button" variant="outline" size="sm" onClick={() => addRows(1)}><Plus /> Dòng</Button> : null}
        {!readOnly ? <Button type="button" variant="outline" size="sm" onClick={() => addRows(10)}>+10 dòng</Button> : null}
        {!readOnly && selected.length ? <Button type="button" variant="outline" size="sm" onClick={duplicateSelected}><Copy /> Nhân bản {selected.length}</Button> : null}
        {!readOnly && selected.length ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selected.length}</Button> : null}
        {!readOnly && lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setColumnSettingsOpen(true)}><Columns3 /> Cột</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}><Maximize2 /> Bảng lớn</Button>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} dòng · {columns.length}/{canonicalColumns.length} cột</span>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.length ? rows.map((row, rowIndex) => (
          <section key={rowKey(row, rowIndex)} className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2 border-b pb-2"><strong className="text-xs">Dòng {rowIndex + 1}</strong><div className="flex">{!readOnly ? <Button type="button" variant="ghost" size="icon-sm" onClick={() => deleteRows([rowIndex])}><Trash2 /></Button> : null}</div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {columns.map((field) => <div key={field.fieldname} className={`min-w-0 space-y-1 ${detailSpan(field)}`}><div className="text-[11px] font-medium text-muted-foreground">{layout.labels[field.fieldname] || field.label || field.fieldname}</div>{fieldControl(row, rowIndex, field, false)}</div>)}
            </div>
          </section>
        )) : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có dòng dữ liệu.</div>}
      </div>
      <div className="hidden md:block">{gridSurface(false)}</div>

      {effectMessages.length ? <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{effectMessages.slice(0, 5).map(([index, message]) => <div key={index}>Dòng {Number(index) + 1}: {message}</div>)}</div> : null}

      <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
        <DialogContent className="max-h-[80vh] w-[min(92vw,760px)] max-w-none overflow-auto">
          <DialogHeader><DialogTitle>Cột · {childMeta.label ?? childMeta.name}</DialogTitle><DialogDescription>Chỉ là tùy chỉnh trình bày trên thiết bị này; không đổi metadata hay dữ liệu.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {orderedColumns.map((field, index) => {
              const hidden = layout.hidden.includes(field.fieldname) && field.fieldname !== identity;
              return <div key={field.fieldname} className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_7rem]">
                <Checkbox checked={!hidden} disabled={field.fieldname === identity} onCheckedChange={(checked) => saveLayout({ ...layout, hidden: checked ? layout.hidden.filter((name) => name !== field.fieldname) : [...new Set([...layout.hidden, field.fieldname])] })} />
                <Input value={layout.labels[field.fieldname] ?? field.label ?? field.fieldname} onChange={(event) => saveLayout({ ...layout, labels: { ...layout.labels, [field.fieldname]: event.target.value } })} />
                <Input type="number" min="4" max="30" step="0.5" value={layout.w[field.fieldname] ?? columnWidth(field)} onChange={(event) => saveLayout({ ...layout, w: { ...layout.w, [field.fieldname]: Math.max(4, Math.min(30, Number(event.target.value) || columnWidth(field))) } })} />
                <div className="flex justify-end"><Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveColumn(field.fieldname, -1)}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={index === orderedColumns.length - 1} onClick={() => moveColumn(field.fieldname, 1)}><ArrowDown /></Button></div>
              </div>;
            })}
          </div>
          <div className="flex justify-end"><Button type="button" variant="outline" onClick={resetLayout}><RotateCcw /> Mặc định metadata</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[94vh] w-[96vw] max-w-none flex-col overflow-hidden p-3">
          <DialogHeader className="shrink-0"><div className="flex items-center gap-3"><div><DialogTitle>{childMeta.label ?? childMeta.name}</DialogTitle><DialogDescription>{rows.length} dòng · bảng đầy đủ theo metadata</DialogDescription></div><Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setExpanded(false)} aria-label={t("common.close")}><X /></Button></div></DialogHeader>
          <div className="min-h-0 flex-1">{gridSurface(true)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailRow != null} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[90vh] w-[min(94vw,920px)] max-w-none overflow-auto">
          <DialogHeader><DialogTitle>Chi tiết dòng {detailRow == null ? "" : detailRow + 1}</DialogTitle><DialogDescription>Toàn bộ field dữ liệu của child DocType, vẫn dùng cùng metadata và cùng mảng dòng.</DialogDescription></DialogHeader>
          {detailRow != null && rows[detailRow] ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(childMeta.fields ?? []).filter((field) => !isLayout(field.fieldtype)).map((field) => {
            const resolved = resolveField(field.list_only ? { ...field, list_only: 0 } : field, childMeta, { doc: rows[detailRow]!, parent: parentDoc, roles, assumeWritable: true });
            if (!resolved.visible) return null;
            return <div key={field.fieldname} className={`min-w-0 space-y-1 ${detailSpan(field)}`}><div className="text-xs font-medium text-muted-foreground">{field.label || field.fieldname}{resolved.required ? <span className="text-destructive">*</span> : null}</div>{fieldControl(rows[detailRow]!, detailRow, field, false)}</div>;
          })}</div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
