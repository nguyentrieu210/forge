/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Undo2 } from "lucide-react";
import {
  bindActionTableColumns,
  buildActionTableRow,
  buildLinkFilters,
  collectFetchFrom,
  resolveField,
  shouldApplyAutomaticValue,
  type AppActionInputTable,
  type Doc,
  type DocField,
  type DocTypeMeta,
  type FieldValueProvenance,
} from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";

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

function text(value: unknown): string { return String(value ?? "").trim(); }
function rowKey(row: Doc, index: number): string { return String(row.name ?? `row-${index}`); }

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

/** Presentation sizing derives from field semantics/label, never from business field names. */
function columnWidth(field: DocField): number {
  const label = (field.label ?? field.fieldname).length;
  if (field.fieldtype === "Link" || field.fieldtype === "Dynamic Link") return Math.max(150, Math.min(240, 110 + label * 5));
  if (field.fieldtype === "Currency") return Math.max(125, Math.min(170, 90 + label * 4));
  if (field.fieldtype === "Select") return Math.max(120, Math.min(190, 90 + label * 5));
  if (NUMERIC_TYPES.has(field.fieldtype)) return Math.max(100, Math.min(150, 80 + label * 4));
  if (field.fieldtype === "Check") return 84;
  if (["Small Text", "Text", "Long Text"].includes(field.fieldtype)) return Math.max(180, Math.min(280, 140 + label * 5));
  return Math.max(135, Math.min(210, 105 + label * 5));
}

function dynamicLinkTarget(field: DocField, row: Doc): string | undefined {
  if (field.fieldtype === "Link") return field.options;
  if (field.fieldtype !== "Dynamic Link" || !field.options) return undefined;
  const target = row[field.options];
  return typeof target === "string" && target.trim() ? target.trim() : undefined;
}

type ProvenanceMap = Record<string, FieldValueProvenance>;

export function ActionChildGrid(props: ActionChildGridProps) {
  const { table, childMeta, rows, onChange, registry, services, roles, parentDoc, readOnly } = props;
  const latestRows = useRef(rows);
  useEffect(() => { latestRows.current = rows; }, [rows]);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [picked, setPicked] = useState({ row: 0, column: 0 });
  const [effectErrors, setEffectErrors] = useState<Record<number, string>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const effectVersion = useRef(new Map<string, number>());
  const provenance = useRef(new Map<string, ProvenanceMap>());

  const columns = useMemo(() => bindActionTableColumns(table, childMeta), [table, childMeta]);
  const fetchRules = useMemo(() => collectFetchFrom(childMeta), [childMeta]);
  const metaByName = useMemo(() => new Map((childMeta.fields ?? []).map((field) => [field.fieldname, field])), [childMeta]);
  const identity = columns.find((field) => ["Link", "Dynamic Link"].includes(field.fieldtype))?.fieldname ?? columns[0]?.fieldname;
  const selectedSet = new Set(selected);
  const saveRows = (next: Doc[]) => { latestRows.current = next; onChange(next); };

  const rowProvenance = (key: string): ProvenanceMap => {
    let current = provenance.current.get(key);
    if (!current) { current = {}; provenance.current.set(key, current); }
    return current;
  };

  /**
   * Execute only canonical `fetch_from` effects for a row. Chained Link copies are supported:
   * a fetched target that is itself a source field is queued once more. Stale async responses are
   * discarded per row; dirtyGuard prevents automatic values from overwriting operator edits.
   */
  const runFetchEffects = async (rowIndex: number, initialFields: string[]) => {
    if (!services?.fetchDocument && !services?.fetchValue) return;
    const currentRows = latestRows.current;
    const currentRow = currentRows[rowIndex];
    if (!currentRow) return;
    const key = rowKey(currentRow, rowIndex);
    const version = (effectVersion.current.get(key) ?? 0) + 1;
    effectVersion.current.set(key, version);
    const queue = [...new Set(initialFields)];
    const visited = new Set<string>();
    let working = { ...currentRow } as Doc;
    const prov = rowProvenance(key);

    try {
      while (queue.length) {
        const sourceField = queue.shift()!;
        if (visited.has(sourceField)) continue;
        visited.add(sourceField);
        const rules = fetchRules.filter((rule) => rule.linkField === sourceField);
        if (!rules.length) continue;
        const sourceName = text(working[sourceField]);
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
        let sourceDoc: Record<string, unknown> | undefined;
        if (services.fetchDocument) sourceDoc = await services.fetchDocument(sourceDoctype, sourceName);
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
      saveRows(live.map((row, index) => index === rowIndex ? { ...row, ...working } : row));
      setEffectErrors((current) => { const next = { ...current }; delete next[rowIndex]; return next; });
    } catch (error) {
      setEffectErrors((current) => ({ ...current, [rowIndex]: error instanceof Error ? error.message : "Không tự điền được metadata của dòng." }));
    }
  };

  const setCell = (rowIndex: number, fieldname: string, value: unknown) => {
    const current = latestRows.current;
    const row = current[rowIndex];
    if (!row) return;
    const key = rowKey(row, rowIndex);
    rowProvenance(key)[fieldname] = "user";
    effectVersion.current.set(key, (effectVersion.current.get(key) ?? 0) + 1);
    const next = current.map((entry, index) => index === rowIndex ? { ...entry, [fieldname]: value } as Doc : entry);
    saveRows(next);
    void runFetchEffects(rowIndex, [fieldname]);
  };

  const addRows = (count: number) => {
    const actual = Math.min(count, Math.max(0, table.max_rows - rows.length));
    if (!actual) return;
    const next = [...rows, ...Array.from({ length: actual }, (_, index) => buildActionTableRow(childMeta, table, `new-${Date.now()}-${rows.length + index}`))];
    saveRows(next);
  };
  const deleteRows = (indexes: number[]) => {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < rows.length).sort((a, b) => a - b);
    if (!unique.length) return;
    setLastDeleted(unique.map((index) => ({ row: rows[index]!, index })));
    const removing = new Set(unique);
    const next = rows.filter((_, index) => !removing.has(index));
    while (next.length < table.min_rows) next.push(buildActionTableRow(childMeta, table, `new-${Date.now()}-${next.length}`));
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
    const changedByRow = new Map<number, string[]>();
    matrix.forEach((cells, rowOffset) => {
      const rowIndex = picked.row + rowOffset;
      if (rowIndex >= table.max_rows) return;
      if (!next[rowIndex]) next[rowIndex] = buildActionTableRow(childMeta, table, `new-${Date.now()}-${rowIndex}`);
      const row = { ...next[rowIndex]! } as Doc;
      const key = rowKey(row, rowIndex);
      const prov = rowProvenance(key);
      const changed: string[] = [];
      cells.forEach((raw, columnOffset) => {
        const field = columns[picked.column + columnOffset];
        if (!field) return;
        const parsed = parsePasted(field, raw);
        if (parsed === undefined) return;
        row[field.fieldname] = parsed;
        prov[field.fieldname] = "user";
        changed.push(field.fieldname);
      });
      next[rowIndex] = row;
      if (changed.length) changedByRow.set(rowIndex, changed);
    });
    saveRows(next);
    for (const [rowIndex, changed] of changedByRow) void runFetchEffects(rowIndex, changed);
  };

  const errors = Object.entries(effectErrors).filter(([index]) => Number(index) < rows.length);

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
            return <TableHead key={field.fieldname} className={`${sticky ? "sticky z-30 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""} whitespace-nowrap px-2 text-[11px] font-bold`} style={{ width: columnWidth(field), minWidth: columnWidth(field), ...(sticky ? { left: readOnly ? 44 : 84 } : {}) }}>{field.label ?? field.fieldname}{field.reqd ? <span className="text-destructive">*</span> : null}</TableHead>;
          })}
          {!readOnly ? <TableHead className="w-12 min-w-12" /> : null}
        </TableRow></TableHeader>
        <TableBody>{rows.map((row, rowIndex) => <TableRow key={rowKey(row, rowIndex)} className={selectedSet.has(rowKey(row, rowIndex)) ? "bg-primary/[0.04]" : ""}>
          {!readOnly ? <TableCell className="sticky left-0 z-20 w-10 min-w-10 bg-card p-1 text-center"><Checkbox checked={selectedSet.has(rowKey(row, rowIndex))} onCheckedChange={() => setSelected((current) => current.includes(rowKey(row, rowIndex)) ? current.filter((value) => value !== rowKey(row, rowIndex)) : [...current, rowKey(row, rowIndex)])} /></TableCell> : null}
          <TableCell className={`sticky z-20 w-11 min-w-11 bg-card px-1 text-right text-[11px] text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>{rowIndex + 1}</TableCell>
          {columns.map((field, columnIndex) => {
            const resolved = resolveField(field, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
            const cellReadOnly = Boolean(readOnly || resolved.readOnly);
            const Control = registry.resolve(field.fieldtype) ?? FallbackControl;
            const sticky = field.fieldname === identity;
            const linkField = field.fieldtype === "Link" || field.fieldtype === "Dynamic Link"
              ? { ...field, link_filters: typeof field.link_filters === "string" ? field.link_filters : undefined }
              : field;
            // Resolve once here so malformed metadata fails safe in the control layer, not by a
            // business-specific picker branch inside ActionChildGrid.
            if (linkField.fieldtype === "Link" || linkField.fieldtype === "Dynamic Link") buildLinkFilters(linkField, row);
            return <TableCell key={field.fieldname} data-cell={`${rowIndex}:${columnIndex}`} className={`${cellReadOnly ? "bg-muted/35 text-muted-foreground" : "bg-background focus-within:bg-primary/[0.04]"} h-9 p-0 ${sticky ? "sticky z-10 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""}`} style={{ width: columnWidth(field), minWidth: columnWidth(field), ...(sticky ? { left: readOnly ? 44 : 84 } : {}) }} onFocusCapture={() => setPicked({ row: rowIndex, column: columnIndex })} onClick={() => setPicked({ row: rowIndex, column: columnIndex })}>
              {!resolved.visible ? <div className="px-2 text-center">—</div>
                : NUMERIC_TYPES.has(field.fieldtype) ? <Input className="h-8 min-w-0 border-0 bg-transparent px-2 text-right tabular-nums shadow-none focus-visible:ring-1" value={row[field.fieldname] == null ? "" : String(row[field.fieldname])} inputMode={field.fieldtype === "Int" ? "numeric" : "decimal"} readOnly={cellReadOnly} onChange={(event) => setCell(rowIndex, field.fieldname, event.target.value)} />
                : <Control field={linkField} value={row[field.fieldname]} onChange={(value: unknown) => setCell(rowIndex, field.fieldname, value)} readOnly={cellReadOnly} masked={resolved.masked} services={services} docname={String(row.name ?? "")} linkTarget={dynamicLinkTarget(field, row)} parentDoctype={childMeta.name} docValues={row} roles={roles} compact />}
            </TableCell>;
          })}
          {!readOnly ? <TableCell className="w-12 min-w-12 p-1"><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteRows([rowIndex])}><Trash2 /></Button></TableCell> : null}
        </TableRow>)}</TableBody>
      </Table>
    </div>

    {errors.length ? <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{errors.slice(0, 4).map(([index, message]) => <div key={index}>Dòng {Number(index) + 1}: {message}</div>)}</div> : null}
  </div>;
}
