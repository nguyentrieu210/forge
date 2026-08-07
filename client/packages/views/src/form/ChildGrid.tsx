/** @jsxImportSource react */
/**
 * ChildGrid — generic Excel-style child-table renderer for every DocType.
 * Operational presentation comes entirely from `viewPolicy.operational.grid`; no business DocType
 * names live here. Named projections may enrich a row, while authoritative calculation/validation
 * remains behind the server capability named by metadata.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Columns3, Copy, Maximize2, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import {
  buildMetadataDefaults,
  collectFetchFrom,
  evalDependsOn,
  operationalViewPolicy,
  readProjectionBinding,
  readProjectionOutput,
  resolveField,
  shouldApplyAutomaticValue,
  smartGridCellRole,
  type Doc,
  type DocField,
  type DocTypeMeta,
  type FieldValueProvenance,
  type SmartGridCellRole,
  type SmartGridColumnGroup,
  type SmartGridProjectionPolicy,
} from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, cn,
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

interface GroupRun {
  key: string;
  label: string;
  tone: SmartGridColumnGroup["tone"];
  count: number;
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

export function defaultChildGridHiddenColumns(meta: DocTypeMeta, columns: DocField[], expanded: boolean): string[] {
  if (expanded) return [];
  const quick = meta.viewPolicy?.quickEntry?.fields ?? [];
  if (!quick.length) return [];
  const identity = identityColumn(columns);
  const keep = new Set([...quick, ...(identity ? [identity] : [])]);
  return columns.filter((field) => !keep.has(field.fieldname)).map((field) => field.fieldname);
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

function roleClass(role: SmartGridCellRole | undefined): string {
  if (role === "operator_input") return "bg-rose-500/[0.07] dark:bg-rose-400/[0.09]";
  if (role === "optional_input") return "bg-background/70";
  if (role === "auto") return "bg-sky-500/[0.07] dark:bg-sky-400/[0.08]";
  if (role === "formula") return "bg-violet-500/[0.07] dark:bg-violet-400/[0.09]";
  if (role === "readonly") return "bg-muted/35";
  if (role === "warning") return "bg-amber-500/[0.10]";
  if (role === "result") return "bg-emerald-500/[0.08] dark:bg-emerald-400/[0.09]";
  if (role === "money") return "bg-orange-500/[0.06] dark:bg-orange-400/[0.08]";
  return "";
}

function groupToneClass(tone: SmartGridColumnGroup["tone"]): string {
  if (tone === "input") return "bg-rose-600 text-white";
  if (tone === "commercial") return "bg-amber-600 text-white";
  if (tone === "result") return "bg-emerald-700 text-white";
  if (tone === "brand") return "bg-orange-600 text-white";
  return "bg-orange-500 text-white";
}

function buildGroupRuns(columns: DocField[], groups: SmartGridColumnGroup[]): GroupRun[] {
  if (!groups.length) return [];
  const byField = new Map<string, SmartGridColumnGroup>();
  for (const group of groups) for (const field of group.fields) byField.set(field, group);
  const runs: GroupRun[] = [];
  columns.forEach((field, index) => {
    const group = byField.get(field.fieldname);
    const key = group?.key ?? `__ungrouped_${index}`;
    const previous = runs[runs.length - 1];
    if (previous && previous.key === key) previous.count += 1;
    else runs.push({ key, label: group?.label ?? "", tone: group?.tone, count: 1 });
  });
  return runs;
}

type RowProvenance = Record<string, FieldValueProvenance>;

export function ChildGrid(props: ChildGridProps) {
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles, rowDefaults } = props;
  const operational = useMemo(() => operationalViewPolicy(childMeta), [childMeta]);
  const gridPolicy = operational?.grid;
  const isOperational = Boolean(gridPolicy);
  const compact = gridPolicy?.density === "compact";
  const brandHeader = gridPolicy?.headerTone === "brand";
  const projections = gridPolicy?.projections ?? [];
  const secondaryPolicy = gridPolicy?.secondaryRow;
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const [picked, setPicked] = useState({ row: 0, column: 0 });
  const [effectErrors, setEffectErrors] = useState<Record<number, string>>({});
  const latestRows = useRef(rows);
  const fetchVersion = useRef(new Map<string, number>());
  const projectionVersion = useRef(new Map<string, number>());
  const projectionTimers = useRef(new Map<string, number>());
  const provenance = useRef(new Map<string, RowProvenance>());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { latestRows.current = rows; }, [rows]);
  useEffect(() => () => {
    for (const timer of projectionTimers.current.values()) window.clearTimeout(timer);
    projectionTimers.current.clear();
  }, []);

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
  const groupRuns = useMemo(() => buildGroupRuns(columns, gridPolicy?.columnGroups ?? []), [columns, gridPolicy?.columnGroups]);
  const groupedFields = useMemo(() => {
    const set = new Set<string>();
    for (const group of gridPolicy?.columnGroups ?? []) for (const field of group.fields) set.add(field);
    return set;
  }, [gridPolicy?.columnGroups]);
  const groupEndFields = useMemo(() => {
    const ends = new Set<string>();
    let previousKey = "";
    columns.forEach((field, index) => {
      const key = (gridPolicy?.columnGroups ?? []).find((group) => group.fields.includes(field.fieldname))?.key ?? `__${field.fieldname}`;
      if (index > 0 && key !== previousKey) ends.add(columns[index - 1]!.fieldname);
      previousKey = key;
    });
    if (columns.length) ends.add(columns[columns.length - 1]!.fieldname);
    return ends;
  }, [columns, gridPolicy?.columnGroups]);
  const identityIndex = columns.findIndex((field) => field.fieldname === identity);
  const freezeCount = Math.max(gridPolicy?.frozenColumns ?? 0, identityIndex >= 0 ? identityIndex + 1 : 0);

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

  const projectionsForChanges = (changed: string[]): SmartGridProjectionPolicy[] => {
    if (!changed.length) return projections;
    return projections.filter((projection) => projection.watch.some((watch) => {
      if (watch.startsWith("parent.")) return changed.includes(watch);
      return changed.includes(watch);
    }));
  };

  const runProjectionEffects = async (rowIndex: number, changed: string[]) => {
    if (!services?.callPost || !projections.length) return;
    const current = latestRows.current[rowIndex];
    if (!current) return;
    const applicable = projectionsForChanges(changed);
    if (!applicable.length) return;
    const key = rowKey(current, rowIndex);
    const version = (projectionVersion.current.get(key) ?? 0) + 1;
    projectionVersion.current.set(key, version);
    try {
      for (const projection of applicable.slice(0, 8)) {
        const liveBefore = latestRows.current[rowIndex];
        if (!liveBefore || rowKey(liveBefore, rowIndex) !== key || projectionVersion.current.get(key) !== version) return;
        const args: Record<string, unknown> = { ...(projection.constants ?? {}) };
        for (const [argument, binding] of Object.entries(projection.inputs)) {
          args[argument] = readProjectionBinding(binding, liveBefore, parentDoc);
        }
        const result = await services.callPost<Record<string, unknown>>(projection.method, args);
        if (projectionVersion.current.get(key) !== version) return;
        const live = latestRows.current[rowIndex];
        if (!live || rowKey(live, rowIndex) !== key) return;
        const patch: Record<string, unknown> = {};
        const prov = rowProvenance(key);
        for (const [sourcePath, target] of Object.entries(projection.outputs)) {
          const targetField = metaByName.get(target);
          if (!targetField) continue;
          const nextValue = readProjectionOutput(result, sourcePath);
          if (nextValue === undefined) continue;
          if (!shouldApplyAutomaticValue(targetField, live[target], prov[target])) continue;
          patch[target] = nextValue;
          prov[target] = "auto";
        }
        if (Object.keys(patch).length) {
          const all = latestRows.current;
          emitRows(all.map((row, index) => index === rowIndex ? { ...row, ...patch } as Doc : row));
        }
      }
      setEffectErrors((currentErrors) => { const next = { ...currentErrors }; delete next[rowIndex]; return next; });
    } catch (error) {
      setEffectErrors((currentErrors) => ({ ...currentErrors, [rowIndex]: error instanceof Error ? error.message : "Không chạy được projection của dòng." }));
    }
  };

  const scheduleProjectionEffects = (rowIndex: number, changed: string[]) => {
    if (!services?.callPost || !projections.length) return;
    const row = latestRows.current[rowIndex];
    if (!row) return;
    const applicable = projectionsForChanges(changed);
    if (!applicable.length) return;
    const key = `${rowKey(row, rowIndex)}:${applicable.map((projection) => projection.key ?? projection.method).join("|")}`;
    const old = projectionTimers.current.get(key);
    if (old != null) window.clearTimeout(old);
    const delay = Math.max(0, ...applicable.map((projection) => projection.debounceMs ?? 120));
    const timer = window.setTimeout(() => {
      projectionTimers.current.delete(key);
      void runProjectionEffects(rowIndex, changed);
    }, delay);
    projectionTimers.current.set(key, timer);
  };

  const runFetchEffects = async (rowIndex: number, initialSources: string[]) => {
    if (!services?.fetchDocument && !services?.fetchValue) {
      scheduleProjectionEffects(rowIndex, initialSources);
      return;
    }
    const current = latestRows.current[rowIndex];
    if (!current) return;
    const key = rowKey(current, rowIndex);
    const version = (fetchVersion.current.get(key) ?? 0) + 1;
    fetchVersion.current.set(key, version);
    const queue = [...new Set(initialSources)];
    const visited = new Set<string>();
    const working = { ...current } as Doc;
    const patch: Record<string, unknown> = {};
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
            patch[rule.target] = "";
            prov[rule.target] = "auto";
            queue.push(rule.target);
          }
          continue;
        }
        const sourceDoctype = rules.find((rule) => rule.sourceDoctype)?.sourceDoctype;
        if (!sourceDoctype) continue;
        const sourceDoc = services.fetchDocument ? await services.fetchDocument(sourceDoctype, sourceName) : undefined;
        if (fetchVersion.current.get(key) !== version) return;
        for (const rule of rules) {
          const target = metaByName.get(rule.target);
          if (!target || !shouldApplyAutomaticValue(target, working[rule.target], prov[rule.target])) continue;
          const value = sourceDoc
            ? sourceDoc[rule.sourceField]
            : await services.fetchValue?.(sourceDoctype, sourceName, rule.sourceField);
          if (fetchVersion.current.get(key) !== version) return;
          working[rule.target] = value ?? "";
          patch[rule.target] = value ?? "";
          prov[rule.target] = "auto";
          queue.push(rule.target);
        }
      }
      const live = latestRows.current;
      if (fetchVersion.current.get(key) !== version || !live[rowIndex] || rowKey(live[rowIndex]!, rowIndex) !== key) return;
      if (Object.keys(patch).length) emitRows(live.map((row, index) => index === rowIndex ? { ...row, ...patch } as Doc : row));
      setEffectErrors((currentErrors) => { const next = { ...currentErrors }; delete next[rowIndex]; return next; });
      scheduleProjectionEffects(rowIndex, initialSources);
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
    fetchVersion.current.set(key, (fetchVersion.current.get(key) ?? 0) + 1);
    projectionVersion.current.set(key, (projectionVersion.current.get(key) ?? 0) + 1);
    emitRows(currentRows.map((entry, index) => index === rowIndex ? { ...entry, [fieldname]: value } as Doc : entry));
    void runFetchEffects(rowIndex, [fieldname]);
  };

  const addRows = (count: number) => {
    const start = latestRows.current.length;
    const added = Array.from({ length: count }, (_, index) => blankRow(`new-${Date.now()}-${start + index}`));
    emitRows([...latestRows.current, ...added]);
    const sources = [...new Set(fetchRules.map((rule) => rule.linkField))];
    added.forEach((_, index) => {
      const rowIndex = start + index;
      if (sources.length) void runFetchEffects(rowIndex, sources);
      else scheduleProjectionEffects(rowIndex, []);
    });
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

  const stickyLeft = (columnIndex: number): CSSProperties["left"] => {
    const base = readOnly ? 44 : 84;
    const prior = columns.slice(0, columnIndex).reduce((sum, field) => sum + (layout.w[field.fieldname] ?? columnWidth(field)), 0);
    return prior ? `calc(${base}px + ${prior}rem)` : base;
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

  const resolvedCell = (row: Doc, field: DocField) => resolveField(
    field.list_only ? { ...field, list_only: 0 } : field,
    childMeta,
    { doc: row, parent: parentDoc, roles, assumeWritable: true },
  );

  const cellRole = (row: Doc, field: DocField): SmartGridCellRole | undefined => {
    const explicit = smartGridCellRole(field);
    if (explicit) return explicit;
    const resolved = resolvedCell(row, field);
    if (resolved.readOnly || readOnly) {
      if (field.valueSource === "formula") return "formula";
      if (["link", "default", "system"].includes(field.valueSource ?? "")) return "auto";
      return "readonly";
    }
    return resolved.required ? "operator_input" : "optional_input";
  };

  const fieldControl = (row: Doc, rowIndex: number, field: DocField, compactControl = true) => {
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
        compact={compactControl}
      />
    );
  };

  const rowStripeClass = (rowIndex: number) => gridPolicy?.stripe === "alternating"
    ? (rowIndex % 2 === 0 ? "bg-background" : "bg-muted/25")
    : "bg-background";

  const secondaryVisible = (row: Doc) => Boolean(secondaryPolicy && evalDependsOn(secondaryPolicy.when, row, parentDoc));

  const gridSurface = (full: boolean) => (
    <div
      ref={gridRef}
      className={cn(
        full ? "min-h-0 flex-1 overflow-auto border" : "overflow-x-auto rounded-md border",
        isOperational && "rounded-lg shadow-sm",
      )}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
    >
      <Table unwrapped className={cn("w-max min-w-full", compact ? "text-[11px]" : "text-xs")}>
        <TableHeader className={cn("sticky top-0 z-30 backdrop-blur", brandHeader ? "bg-orange-500 text-white" : "bg-muted/90")}>
          {groupRuns.length ? (
            <TableRow className="h-7 hover:bg-transparent">
              {!readOnly ? <TableHead rowSpan={2} className={cn("sticky left-0 z-50 w-10 min-w-10 p-1 text-center", brandHeader ? "bg-orange-600 text-white" : "bg-card")}><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={() => setSelected(selected.length === rows.length ? [] : rows.map(rowKey))} /></TableHead> : null}
              <TableHead rowSpan={2} className={cn("sticky z-50 w-11 min-w-11 px-1 text-right", brandHeader ? "bg-orange-600 text-white" : "bg-card", readOnly ? "left-0" : "left-10")}>#</TableHead>
              {groupRuns.map((run, index) => (
                <TableHead key={`${run.key}-${index}`} colSpan={run.count} className={cn("h-7 border-b border-r border-white/20 px-2 text-center text-[10px] font-extrabold uppercase tracking-[0.08em]", groupToneClass(run.tone))}>{run.label}</TableHead>
              ))}
              {!readOnly ? <TableHead rowSpan={2} className={cn("w-20 min-w-20", brandHeader ? "bg-orange-600" : "bg-muted/90")} /> : null}
            </TableRow>
          ) : null}
          <TableRow className={cn("hover:bg-transparent", compact ? "h-8" : "h-9")}>
            {!groupRuns.length && !readOnly ? <TableHead className={cn("sticky left-0 z-40 w-10 min-w-10 p-1 text-center", brandHeader ? "bg-orange-600 text-white" : "bg-card")}><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={() => setSelected(selected.length === rows.length ? [] : rows.map(rowKey))} /></TableHead> : null}
            {!groupRuns.length ? <TableHead className={cn("sticky z-40 w-11 min-w-11 px-1 text-right", brandHeader ? "bg-orange-600 text-white" : "bg-card", readOnly ? "left-0" : "left-10")}>#</TableHead> : null}
            {columns.map((field, columnIndex) => {
              const custom = layout.w[field.fieldname];
              const width = custom ?? columnWidth(field);
              const sticky = columnIndex < freezeCount;
              return <TableHead key={field.fieldname} className={cn(
                "whitespace-nowrap px-2 text-[11px] font-bold",
                brandHeader && "bg-orange-500 text-white",
                sticky && "sticky z-40 shadow-[inset_-1px_0_0_rgba(255,255,255,.24)]",
                gridPolicy?.autoBorders && groupEndFields.has(field.fieldname) && "border-r-2 border-r-orange-700/30",
              )} style={{ width: `${width}rem`, minWidth: `${width}rem`, ...(sticky ? { left: stickyLeft(columnIndex) } : {}) }}>{layout.labels[field.fieldname] || field.label || field.fieldname}{field.reqd ? <span className={brandHeader ? "text-white" : "text-destructive"}>*</span> : null}</TableHead>;
            })}
            {!groupRuns.length && !readOnly ? <TableHead className={cn("w-20 min-w-20", brandHeader && "bg-orange-600")} /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? rows.map((row, rowIndex) => {
            const secondary = secondaryVisible(row);
            const secondaryFields = new Set(secondary ? secondaryPolicy?.fields ?? [] : []);
            const selectedRow = selectedSet.has(rowKey(row, rowIndex));
            const stripe = rowStripeClass(rowIndex);
            return (
              <Fragment key={rowKey(row, rowIndex)}>
                <TableRow className={cn(stripe, selectedRow && "bg-primary/[0.06]")} data-record-index={rowIndex}>
                  {!readOnly ? <TableCell className={cn("sticky left-0 z-20 w-10 min-w-10 p-1 text-center", stripe, selectedRow && "bg-primary/[0.06]")}><Checkbox checked={selectedRow} onCheckedChange={() => setSelected((current) => current.includes(rowKey(row, rowIndex)) ? current.filter((value) => value !== rowKey(row, rowIndex)) : [...current, rowKey(row, rowIndex)])} /></TableCell> : null}
                  <TableCell className={cn("sticky z-20 w-11 min-w-11 px-1 text-right text-[11px] text-muted-foreground", stripe, selectedRow && "bg-primary/[0.06]", readOnly ? "left-0" : "left-10")}>{rowIndex + 1}</TableCell>
                  {columns.map((field, columnIndex) => {
                    const custom = layout.w[field.fieldname];
                    const width = custom ?? columnWidth(field);
                    const sticky = columnIndex < freezeCount;
                    const role = cellRole(row, field);
                    const movedToSecondary = secondaryFields.has(field.fieldname);
                    return <TableCell key={field.fieldname} data-cell={`${rowIndex}:${columnIndex}`} data-cell-role={role} className={cn(
                      compact ? "h-8 p-0.5" : "h-9 p-1",
                      "align-middle transition-colors",
                      roleClass(role),
                      sticky && "sticky z-10 shadow-[inset_-1px_0_0_var(--border)]",
                      gridPolicy?.autoBorders && "border-r border-border/50",
                      gridPolicy?.autoBorders && groupEndFields.has(field.fieldname) && "border-r-2 border-r-orange-500/30",
                      selectedRow && "ring-1 ring-inset ring-primary/10",
                    )} style={{ width: `${width}rem`, minWidth: `${width}rem`, ...(sticky ? { left: stickyLeft(columnIndex) } : {}) } as CSSProperties} onFocusCapture={() => setPicked({ row: rowIndex, column: columnIndex })} onClick={() => setPicked({ row: rowIndex, column: columnIndex })}>{movedToSecondary ? null : fieldControl(row, rowIndex, field, true)}</TableCell>;
                  })}
                  {!readOnly ? <TableCell className={cn("w-20 min-w-20 p-1", stripe, selectedRow && "bg-primary/[0.06]")}><div className="flex justify-end"><Button type="button" variant="ghost" size="icon-sm" onClick={() => setDetailRow(rowIndex)} aria-label="Chi tiết dòng"><Maximize2 /></Button><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteRows([rowIndex])} aria-label="Xóa dòng"><Trash2 /></Button></div></TableCell> : null}
                </TableRow>
                {secondary ? (
                  <TableRow className={cn(stripe, "border-b-2 border-b-border", selectedRow && "bg-primary/[0.06]")} data-record-index={rowIndex} data-record-secondary="true">
                    {!readOnly ? <TableCell className={cn("sticky left-0 z-20 w-10 min-w-10 p-1", stripe, selectedRow && "bg-primary/[0.06]")} /> : null}
                    <TableCell className={cn("sticky z-20 w-11 min-w-11 px-1 text-right text-[10px] text-muted-foreground", stripe, selectedRow && "bg-primary/[0.06]", readOnly ? "left-0" : "left-10")}>↳</TableCell>
                    {columns.map((field, columnIndex) => {
                      const custom = layout.w[field.fieldname];
                      const width = custom ?? columnWidth(field);
                      const sticky = columnIndex < freezeCount;
                      const isLabel = secondaryPolicy?.labelColumn === field.fieldname;
                      const showField = secondaryFields.has(field.fieldname);
                      const role = cellRole(row, field);
                      return <TableCell key={`secondary-${field.fieldname}`} data-cell={`${rowIndex}:${columnIndex}`} className={cn(
                        "h-7 p-1 align-middle text-[11px]",
                        showField && roleClass(role),
                        sticky && "sticky z-10 shadow-[inset_-1px_0_0_var(--border)]",
                        gridPolicy?.autoBorders && "border-r border-border/50",
                        gridPolicy?.autoBorders && groupEndFields.has(field.fieldname) && "border-r-2 border-r-orange-500/30",
                      )} style={{ width: `${width}rem`, minWidth: `${width}rem`, ...(sticky ? { left: stickyLeft(columnIndex) } : {}) } as CSSProperties}>{isLabel ? <span className="font-semibold text-muted-foreground">{secondaryPolicy?.label ?? "Chi tiết"}</span> : showField ? fieldControl(row, rowIndex, field, true) : null}</TableCell>;
                    })}
                    {!readOnly ? <TableCell className={cn("w-20 min-w-20", stripe)} /> : null}
                  </TableRow>
                ) : null}
              </Fragment>
            );
          }) : <TableRow><TableCell colSpan={columns.length + (readOnly ? 1 : 3)} className="h-24 text-center text-sm text-muted-foreground">Chưa có dòng dữ liệu.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );

  const effectMessages = Object.entries(effectErrors).filter(([index]) => Number(index) < rows.length);

  const gridToolbar = (allowExpand: boolean) => (
    <div className={cn("flex flex-wrap items-center gap-2", isOperational && "rounded-md border bg-card px-2 py-1.5 shadow-sm")}>
      {!readOnly ? <Button type="button" variant="outline" size="sm" onClick={() => addRows(1)}><Plus /> Thêm dòng</Button> : null}
      {!readOnly ? <Button type="button" variant="outline" size="sm" onClick={() => addRows(10)}>+10 dòng</Button> : null}
      {!readOnly && selected.length ? <Button type="button" variant="outline" size="sm" onClick={duplicateSelected}><Copy /> Nhân bản {selected.length}</Button> : null}
      {!readOnly && selected.length ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selected.length}</Button> : null}
      {!readOnly && lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
      <Button type="button" variant="ghost" size="sm" onClick={() => setColumnSettingsOpen(true)}><Columns3 /> Cột</Button>
      {allowExpand && !isOperational ? <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}><Maximize2 /> Bảng lớn</Button> : null}
      <span className="ml-auto text-xs text-muted-foreground">{rows.length} dòng · {columns.length}/{canonicalColumns.length} cột</span>
    </div>
  );

  const parentProjectionFingerprint = useMemo(() => {
    const watched = projections.flatMap((projection) => projection.watch.filter((watch) => watch.startsWith("parent.")));
    return JSON.stringify([...new Set(watched)].map((watch) => [watch, parentDoc?.[watch.slice("parent.".length)]]));
  }, [parentDoc, projections]);
  const previousParentFingerprint = useRef(parentProjectionFingerprint);
  useEffect(() => {
    if (previousParentFingerprint.current === parentProjectionFingerprint) return;
    previousParentFingerprint.current = parentProjectionFingerprint;
    const changed = projections.flatMap((projection) => projection.watch.filter((watch) => watch.startsWith("parent.")));
    latestRows.current.forEach((_, rowIndex) => scheduleProjectionEffects(rowIndex, changed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentProjectionFingerprint]);

  return (
    <div className={cn("min-w-0 space-y-2", isOperational && "mf-smart-grid")} data-child-grid={childMeta.name} data-columns={columns.map((field) => field.fieldname).join(",")} data-operational-grid={isOperational ? "true" : undefined}>
      {gridToolbar(true)}

      <div className="space-y-2 md:hidden">
        {rows.length ? rows.map((row, rowIndex) => (
          <section key={rowKey(row, rowIndex)} className={cn("rounded-lg border p-3 shadow-sm", rowStripeClass(rowIndex))}>
            <div className="mb-3 flex items-center justify-between gap-2 border-b pb-2"><strong className="text-xs">Dòng {rowIndex + 1}</strong><div className="flex">{!readOnly ? <Button type="button" variant="ghost" size="icon-sm" onClick={() => deleteRows([rowIndex])}><Trash2 /></Button> : null}</div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {columns.map((field) => <div key={field.fieldname} className={cn("min-w-0 space-y-1 rounded-md p-1", detailSpan(field), roleClass(cellRole(row, field)))}><div className="text-[11px] font-medium text-muted-foreground">{layout.labels[field.fieldname] || field.label || field.fieldname}</div>{fieldControl(row, rowIndex, field, false)}</div>)}
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
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>{childMeta.label ?? childMeta.name}</DialogTitle>
            <DialogDescription>{rows.length} dòng · bảng đầy đủ theo metadata</DialogDescription>
          </DialogHeader>
          <div className="shrink-0 border-y py-2">{gridToolbar(false)}</div>
          <div className="min-h-0 flex-1">{gridSurface(true)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailRow != null} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[90vh] w-[min(94vw,920px)] max-w-none overflow-auto">
          <DialogHeader><DialogTitle>Chi tiết dòng {detailRow == null ? "" : detailRow + 1}</DialogTitle><DialogDescription>Toàn bộ field dữ liệu của child DocType, vẫn dùng cùng metadata và cùng mảng dòng.</DialogDescription></DialogHeader>
          {detailRow != null && rows[detailRow] ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(childMeta.fields ?? []).filter((field) => !isLayout(field.fieldtype)).map((field) => {
            const resolved = resolveField(field.list_only ? { ...field, list_only: 0 } : field, childMeta, { doc: rows[detailRow]!, parent: parentDoc, roles, assumeWritable: true });
            if (!resolved.visible) return null;
            return <div key={field.fieldname} className={cn("min-w-0 space-y-1 rounded-md p-1", detailSpan(field), roleClass(cellRole(rows[detailRow]!, field)))}><div className="text-xs font-medium text-muted-foreground">{field.label || field.fieldname}{resolved.required ? <span className="text-destructive">*</span> : null}</div>{fieldControl(rows[detailRow]!, detailRow, field, false)}</div>;
          })}</div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
