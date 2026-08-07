/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Copy, Plus, Trash2, Undo2 } from "lucide-react";
import {
  bindActionTableColumns,
  buildActionTableRow,
  buildLinkFilters,
  collectFetchFrom,
  fetchRuleAllowsCurrentValue,
  resolveFetchSourceDoctype,
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
import {
  parseSpreadsheetCell,
  parseSpreadsheetClipboard,
  planSpreadsheetColumns,
  spreadsheetCellEmpty,
  spreadsheetIssueMessage,
} from "../form/spreadsheet.js";

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
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const effectVersion = useRef(new Map<string, number>());
  const provenance = useRef(new Map<string, ProvenanceMap>());
  const initializedRows = useRef(new Set<string>());

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
   * Execute only canonical `fetch_from` effects for a row. Chained Link copies are supported.
   * Dynamic-Link doctype changes are treated as source changes; stale responses are discarded.
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
    for (const rule of fetchRules) {
      if (rule.sourceDoctypeField && initialFields.includes(rule.sourceDoctypeField)) queue.push(rule.linkField);
    }
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
            if (rule.fetchIfEmpty) continue;
            const target = metaByName.get(rule.target);
            if (!target || !shouldApplyAutomaticValue(target, working[rule.target], prov[rule.target])) continue;
            working[rule.target] = "";
            prov[rule.target] = "auto";
            queue.push(rule.target);
          }
          continue;
        }
        for (const rule of rules) {
          const target = metaByName.get(rule.target);
          if (!target) continue;
          if (!fetchRuleAllowsCurrentValue(rule, working[rule.target])) continue;
          if (!shouldApplyAutomaticValue(target, working[rule.target], prov[rule.target])) continue;
          const sourceDoctype = resolveFetchSourceDoctype(rule, working);
          if (!sourceDoctype) continue;
          if (!rule.fetchIfEmpty) {
            working[rule.target] = "";
            prov[rule.target] = "auto";
          }
          const sourceDoc = services.fetchDocument ? await services.fetchDocument(sourceDoctype, sourceName) : undefined;
          if (effectVersion.current.get(key) !== version) return;
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

  // AppAction rows are draft/operator rows, so defaults should become live immediately instead of
  // waiting for the operator to re-select the same Link manually.
  useEffect(() => {
    if (!fetchRules.length) return;
    const sources = [...new Set(fetchRules.map((rule) => rule.linkField))];
    latestRows.current.forEach((row, rowIndex) => {
      const key = rowKey(row, rowIndex);
      if (initializedRows.current.has(key)) return;
      initializedRows.current.add(key);
      if (sources.some((source) => text(row[source]))) void runFetchEffects(rowIndex, sources);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fetchRules]);

  const setCell = (rowIndex: number, fieldname: string, value: unknown) => {
    const current = latestRows.current;
    const row = current[rowIndex];
    if (!row) return;
    const key = rowKey(row, rowIndex);
    rowProvenance(key)[fieldname] = "user";
    effectVersion.current.set(key, (effectVersion.current.get(key) ?? 0) + 1);
    setCellErrors((currentErrors) => { const next = { ...currentErrors }; delete next[`${rowIndex}:${fieldname}`]; return next; });
    const next = current.map((entry, index) => index === rowIndex ? { ...entry, [fieldname]: value } as Doc : entry);
    saveRows(next);
    void runFetchEffects(rowIndex, [fieldname]);
  };

  const focusCell = (row: number, column: number) => {
    const holder = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`);
    const target = holder?.querySelector<HTMLElement>("input,button,textarea,select,[tabindex]") ?? holder;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  };

  const addRows = (count: number, focusFirst = false) => {
    const current = latestRows.current;
    const actual = Math.min(count, Math.max(0, table.max_rows - current.length));
    if (!actual) return;
    const start = current.length;
    const added = Array.from({ length: actual }, (_, index) => buildActionTableRow(childMeta, table, `new-${Date.now()}-${start + index}`));
    saveRows([...current, ...added]);
    const sources = [...new Set(fetchRules.map((rule) => rule.linkField))];
    added.forEach((row, index) => {
      const rowIndex = start + index;
      initializedRows.current.add(rowKey(row, rowIndex));
      if (sources.some((source) => text(row[source]))) void runFetchEffects(rowIndex, sources);
    });
    if (focusFirst) window.requestAnimationFrame(() => focusCell(start, 0));
  };

  const deleteRows = (indexes: number[]) => {
    const current = latestRows.current;
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < current.length).sort((a, b) => a - b);
    if (!unique.length) return;
    setLastDeleted(unique.map((index) => ({ row: current[index]!, index })));
    const removing = new Set(unique);
    const next = current.filter((_, index) => !removing.has(index));
    while (next.length < table.min_rows) next.push(buildActionTableRow(childMeta, table, `new-${Date.now()}-${next.length}`));
    saveRows(next);
    setSelected([]);
    setCellErrors({});
  };

  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    const next = [...latestRows.current];
    for (const entry of [...lastDeleted].sort((a, b) => a.index - b.index)) next.splice(Math.min(entry.index, next.length), 0, entry.row);
    saveRows(next.slice(0, table.max_rows));
    setLastDeleted(null);
  };

  const duplicateSelected = () => {
    if (!selected.length) return;
    const current = latestRows.current;
    const room = Math.max(0, table.max_rows - current.length);
    if (!room) return;
    const copies = current
      .map((row, index) => selectedSet.has(rowKey(row, index)) ? { ...row, name: `new-${Date.now()}-${index}` } as Doc : undefined)
      .filter((row): row is Doc => Boolean(row))
      .slice(0, room);
    if (!copies.length) return;
    saveRows([...current, ...copies]);
    setSelected([]);
  };

  const fillDownSelected = () => {
    if (selected.length < 2) return;
    const field = columns[picked.column];
    if (!field) return;
    const current = latestRows.current;
    const indexes = current.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0).sort((a, b) => a - b);
    const sourceIndex = indexes[0];
    if (sourceIndex == null) return;
    const sourceValue = current[sourceIndex]?.[field.fieldname];
    if (spreadsheetCellEmpty(sourceValue)) return;
    const next = [...current];
    const changed: number[] = [];
    for (const rowIndex of indexes.slice(1)) {
      const row = next[rowIndex];
      if (!row || !spreadsheetCellEmpty(row[field.fieldname])) continue;
      const resolved = resolveField(field, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
      if (!resolved.visible || resolved.readOnly || resolved.masked) continue;
      const copy = { ...row, [field.fieldname]: sourceValue } as Doc;
      next[rowIndex] = copy;
      rowProvenance(rowKey(copy, rowIndex))[field.fieldname] = "user";
      changed.push(rowIndex);
    }
    if (!changed.length) return;
    saveRows(next);
    changed.forEach((rowIndex) => void runFetchEffects(rowIndex, [field.fieldname]));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const targetElement = event.target as HTMLElement;
    const holder = targetElement.closest<HTMLElement>("[data-cell]");
    if (!holder || holder.querySelector('[aria-expanded="true"]')) return;
    if (targetElement.tagName === "TEXTAREA" && ["Enter", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const [row, column] = holder.dataset.cell!.split(":").map(Number) as [number, number];
    const lastRow = latestRows.current.length - 1;
    const lastColumn = columns.length - 1;
    const focus = (nextRow: number, nextColumn: number) => { event.preventDefault(); window.requestAnimationFrame(() => focusCell(nextRow, nextColumn)); };
    if (event.key === "Enter" && !event.shiftKey && row === lastRow && column === lastColumn && latestRows.current.length < table.max_rows) {
      event.preventDefault(); const nextRow = latestRows.current.length; addRows(1); window.requestAnimationFrame(() => focusCell(nextRow, 0));
    } else if (event.key === "Enter" && !event.shiftKey) focus(Math.min(lastRow, row + 1), column);
    else if (event.key === "Enter" && event.shiftKey) focus(Math.max(0, row - 1), column);
    else if (event.key === "ArrowDown") focus(Math.min(lastRow, row + 1), column);
    else if (event.key === "ArrowUp") focus(Math.max(0, row - 1), column);
    else if (event.key === "Tab" && !event.shiftKey) {
      if (column < lastColumn) focus(row, column + 1);
      else if (row < lastRow) focus(row + 1, 0);
      else if (latestRows.current.length < table.max_rows) { event.preventDefault(); const nextRow = latestRows.current.length; addRows(1); window.requestAnimationFrame(() => focusCell(nextRow, 0)); }
    } else if (event.key === "Tab" && event.shiftKey) {
      if (column > 0) focus(row, column - 1);
      else if (row > 0) focus(row - 1, lastColumn);
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly || !table.allow_paste) return;
    const clipboard = event.clipboardData.getData("text/plain");
    if (!/[\t\n\r]/.test(clipboard)) return;
    event.preventDefault();
    const matrix = parseSpreadsheetClipboard(clipboard);
    const plan = planSpreadsheetColumns(columns, matrix[0], picked.column);
    const data = matrix.slice(plan.dataStart);
    const next = [...latestRows.current];
    const changedByRow = new Map<number, string[]>();
    const errors: Record<string, string> = {};
    const numberFormat = services?.fmt?.config.numberFormat;
    data.forEach((cells, rowOffset) => {
      const requested = picked.row + rowOffset;
      if (requested >= table.max_rows) return;
      const rowIndex = Math.min(requested, next.length);
      if (rowIndex >= table.max_rows) return;
      const existing = next[rowIndex];
      const row = { ...(existing ?? buildActionTableRow(childMeta, table, `new-${Date.now()}-${rowIndex}`)) } as Doc;
      const key = rowKey(row, rowIndex);
      const prov = rowProvenance(key);
      const changed: string[] = [];
      cells.forEach((raw, columnOffset) => {
        const field = plan.fields[columnOffset];
        if (!field) return;
        const errorKey = `${rowIndex}:${field.fieldname}`;
        const resolved = resolveField(field, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
        if (!resolved.visible || resolved.readOnly || resolved.masked) { errors[errorKey] = "Ô này không cho phép nhập"; return; }
        if (!spreadsheetCellEmpty(row[field.fieldname])) return;
        const parsed = parseSpreadsheetCell(field, raw, numberFormat);
        if (parsed.empty) return;
        if (!parsed.ok) { errors[errorKey] = spreadsheetIssueMessage(parsed); return; }
        row[field.fieldname] = parsed.value;
        prov[field.fieldname] = "user";
        changed.push(field.fieldname);
      });
      if (changed.length) {
        if (rowIndex === next.length) next.push(row); else next[rowIndex] = row;
        changedByRow.set(rowIndex, changed);
      }
    });
    setCellErrors(errors);
    if (!changedByRow.size) return;
    saveRows(next);
    for (const [rowIndex, changed] of changedByRow) void runFetchEffects(rowIndex, changed);
  };

  const errors = Object.entries(effectErrors).filter(([index]) => Number(index) < rows.length);
  const pasteErrorCount = Object.keys(cellErrors).length;

  return <div className="min-w-0 space-y-2" data-action-child-grid={table.fieldname} data-primary-columns={columns.map((field) => field.fieldname).join(",")}>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(1, true)}><Plus /> Dòng</Button>
      <Button type="button" variant="outline" size="sm" disabled={readOnly || rows.length >= table.max_rows} onClick={() => addRows(10)}>+10 dòng</Button>
      {selected.length >= 2 ? <Button type="button" variant="outline" size="sm" onClick={fillDownSelected}><ArrowDown /> Điền xuống</Button> : null}
      {selected.length ? <Button type="button" variant="outline" size="sm" disabled={rows.length >= table.max_rows} onClick={duplicateSelected}><Copy /> Nhân bản {selected.length}</Button> : null}
      {selected.length ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selected.length}</Button> : null}
      {lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
      {pasteErrorCount ? <span className="text-xs font-medium text-destructive">{pasteErrorCount} ô paste cần kiểm tra</span> : null}
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
            const pasteError = cellErrors[`${rowIndex}:${field.fieldname}`];
            const linkField = field.fieldtype === "Link" || field.fieldtype === "Dynamic Link"
              ? { ...field, link_filters: typeof field.link_filters === "string" ? field.link_filters : undefined }
              : field;
            // Resolve once here so malformed metadata fails safe in the control layer, not by a
            // business-specific picker branch inside ActionChildGrid.
            if (linkField.fieldtype === "Link" || linkField.fieldtype === "Dynamic Link") buildLinkFilters(linkField, row);
            return <TableCell key={field.fieldname} data-cell={`${rowIndex}:${columnIndex}`} title={pasteError} className={`${cellReadOnly ? "bg-muted/35 text-muted-foreground" : "bg-background focus-within:bg-primary/[0.04]"} ${pasteError ? "ring-2 ring-inset ring-destructive/70" : ""} h-9 p-0 ${sticky ? "sticky z-10 bg-card shadow-[inset_-1px_0_0_var(--border)]" : ""}`} style={{ width: columnWidth(field), minWidth: columnWidth(field), ...(sticky ? { left: readOnly ? 44 : 84 } : {}) }} onFocusCapture={() => setPicked({ row: rowIndex, column: columnIndex })} onClick={() => setPicked({ row: rowIndex, column: columnIndex })}>
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
