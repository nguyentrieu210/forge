/** @jsxImportSource react */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Columns3,
  Copy,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { type Doc, type DocField, type DocTypeMeta, type DocTypeView } from "@metaforge/core";
import { FallbackControl } from "@metaforge/controls";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";
import {
  ChildGrid as LegacyChildGrid,
  type ChildGridProps,
} from "./ChildGridWithExtensions.js";
import {
  hasMetadataChildGridPresentation,
  metadataChildGridColumns,
} from "./child-grid-presentation.js";
import {
  EMPTY_SMART_GRID_LAYOUT,
  applicableSmartGridColumns,
  loadSmartGridLayout,
  moveSmartGridRows,
  orderedSmartGridColumns,
  parseSmartGridPastedValue,
  planSmartGridPaste,
  reorderSmartGridField,
  resolveSmartGridCell,
  restoreSmartGridRows,
  saveSmartGridLayout,
  smartGridField,
  smartGridLayoutKey,
  smartGridRowKey,
  type SmartGridCellEdit,
  type SmartGridDeletedRow,
  type SmartGridLayout,
} from "./metadata-child-grid-smart.js";

interface ChildRowPreviewResult {
  patch?: Record<string, unknown>;
  clear?: string[];
  field_overrides?: Record<string, Partial<DocField>>;
  source?: string;
  message?: string;
}

function dynamicLinkTarget(field: DocField, row: Doc): string | undefined {
  if (field.fieldtype === "Link") return field.options;
  if (field.fieldtype !== "Dynamic Link" || !field.options) return undefined;
  const target = row[field.options];
  return typeof target === "string" && target.trim() ? target.trim() : undefined;
}

function newRowName(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function newRow(meta: DocTypeMeta, rowDefaults?: Record<string, unknown>): Doc {
  const row: Doc = { name: newRowName(), doctype: meta.name } as Doc;
  for (const field of meta.fields ?? []) {
    if (field.default !== undefined && field.default !== null && field.default !== "") row[field.fieldname] = field.default;
  }
  if (rowDefaults) {
    const fieldNames = new Set((meta.fields ?? []).map((field) => field.fieldname));
    for (const [key, value] of Object.entries(rowDefaults)) {
      if (fieldNames.has(key) && isBlank(row[key])) row[key] = value;
    }
  }
  return row;
}

function label(field: DocField): string {
  return field.label || field.fieldname;
}

function viewPreviewMethod(view: DocTypeView | undefined): string {
  return typeof view?.previewMethod === "string" ? view.previewMethod.trim() : "";
}

function viewPreviewParentFields(view: DocTypeView | undefined): string[] {
  return Array.isArray(view?.previewParentFields)
    ? view.previewParentFields.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
}

function defaultColumnWidth(field: DocField, identity: boolean): number {
  if (identity) return 14;
  if (field.fieldtype === "Check") return 5;
  if (["Int", "Float", "Percent", "Currency", "Duration", "Rating"].includes(field.fieldtype)) return 8;
  if (["Date", "Time", "Datetime"].includes(field.fieldtype)) return 10;
  if (["Small Text", "Text", "Long Text", "Text Editor", "Markdown Editor"].includes(field.fieldtype)) return 16;
  return 11;
}

function cloneLayout(layout: SmartGridLayout): SmartGridLayout {
  return {
    widths: { ...layout.widths },
    order: [...layout.order],
    hidden: [...layout.hidden],
    pinned: [...layout.pinned],
    labels: { ...layout.labels },
  };
}

/** Route only explicitly metadata-owned child tables into the smart runtime. */
export function MetadataChildGrid(props: ChildGridProps) {
  return hasMetadataChildGridPresentation(props.childMeta)
    ? <SmartMetadataChildGrid {...props} />
    : <LegacyChildGrid {...props} />;
}

/** Generic interaction shell; business values stay metadata/server owned. */
function SmartMetadataChildGrid(props: ChildGridProps) {
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles, rowDefaults } = props;
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<SmartGridDeletedRow[] | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [addManyOpen, setAddManyOpen] = useState(false);
  const [addManyCount, setAddManyCount] = useState(5);
  const [pickedCell, setPickedCell] = useState<{ rowIndex: number; columnIndex: number } | null>(null);
  const [previewErrorByRow, setPreviewErrorByRow] = useState<Record<string, string>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [fieldOverridesByRow, setFieldOverridesByRow] = useState<Record<string, Record<string, Partial<DocField>>>>({});
  const [layout, setLayout] = useState<SmartGridLayout>(() => cloneLayout(EMPTY_SMART_GRID_LAYOUT));
  const latestRows = useRef(rows);
  const previewVersion = useRef(new Map<string, number>());
  const previousPreviewParentKey = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    latestRows.current = rows;
  }, [rows]);

  const compact = useMemo(() => metadataChildGridColumns(childMeta, false) ?? [], [childMeta]);
  const full = useMemo(() => metadataChildGridColumns(childMeta, true) ?? compact, [childMeta, compact]);
  const activeView = expanded ? childMeta.viewPolicy?.form : childMeta.viewPolicy?.quickEntry ?? childMeta.viewPolicy?.form;
  const previewMethod = viewPreviewMethod(activeView);
  const previewParentFields = viewPreviewParentFields(activeView);
  const previewParentKey = useMemo(
    () => JSON.stringify(previewParentFields.map((fieldname) => [fieldname, parentDoc?.[fieldname]])),
    [parentDoc, previewParentFields.join("\u0000")],
  );
  const childFields = useMemo(() => (childMeta.fields ?? []).map((field) => field.fieldname), [childMeta.fields]);

  const emitRows = (next: Doc[]) => {
    latestRows.current = next;
    onChange(next);
  };

  const cellErrorKey = (row: Doc, rowIndex: number, fieldname: string) => `${smartGridRowKey(row, rowIndex)}:${fieldname}`;
  const clearCellError = (row: Doc, rowIndex: number, fieldname: string) => {
    const key = cellErrorKey(row, rowIndex, fieldname);
    setCellErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const runPreview = async (rowIndex: number, row: Doc, changedField: string, applyValues = true) => {
    if (!previewMethod || !services?.callPost) return;
    const key = smartGridRowKey(row, rowIndex);
    const version = (previewVersion.current.get(key) ?? 0) + 1;
    previewVersion.current.set(key, version);
    try {
      const result = await services.callPost<ChildRowPreviewResult>(previewMethod, {
        parent_doctype: String(parentDoc?.doctype ?? ""),
        child_doctype: childMeta.name,
        parent: parentDoc ?? {},
        row,
        changed_field: changedField,
        child_fields: childFields,
      });
      if (previewVersion.current.get(key) !== version) return;
      const current = latestRows.current;
      const currentIndex = current.findIndex((entry, index) => smartGridRowKey(entry, index) === key);
      if (currentIndex < 0) return;
      if (applyValues) {
        const currentRow = current[currentIndex];
        if (!currentRow) return;
        const nextRow: Doc = { ...currentRow } as Doc;
        for (const fieldname of result.clear ?? []) {
          if (childFields.includes(fieldname)) nextRow[fieldname] = undefined;
        }
        for (const [fieldname, value] of Object.entries(result.patch ?? {})) {
          if (childFields.includes(fieldname)) nextRow[fieldname] = value;
        }
        emitRows(current.map((entry, index) => index === currentIndex ? nextRow : entry));
      }
      setFieldOverridesByRow((currentOverrides) => ({ ...currentOverrides, [key]: result.field_overrides ?? {} }));
      setPreviewErrorByRow((currentErrors) => {
        if (!currentErrors[key]) return currentErrors;
        const nextErrors = { ...currentErrors };
        delete nextErrors[key];
        return nextErrors;
      });
      if (childFields.includes(changedField)) clearCellError(row, rowIndex, changedField);
    } catch (error) {
      if (previewVersion.current.get(key) !== version) return;
      const message = error instanceof Error ? error.message : "Không preview được dòng chứng từ.";
      setPreviewErrorByRow((current) => ({ ...current, [key]: message }));
      if (childFields.includes(changedField)) {
        setCellErrors((current) => ({ ...current, [cellErrorKey(row, rowIndex, changedField)]: message }));
      }
    }
  };

  /** Hydrate presentation overrides without mutating persisted row values on first open. */
  useEffect(() => {
    if (!previewMethod || !services?.callPost || !previewParentFields.length) return;
    const previous = previousPreviewParentKey.current;
    const firstHydration = previous === null;
    const parentChanged = previous !== null && previous !== previewParentKey;
    previousPreviewParentKey.current = previewParentKey;
    if (!firstHydration && !parentChanged) return;
    latestRows.current.forEach((row, index) => {
      const hasBusinessValue = Object.keys(row).some((fieldname) => !["name", "doctype", "idx"].includes(fieldname) && !isBlank(row[fieldname]));
      if (hasBusinessValue) void runPreview(index, row, firstHydration ? "__hydrate__" : "__parent__", !firstHydration);
    });
    // Parent dependency is declarative; direct row edits call preview through commitEdits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMethod, previewParentKey]);

  const presentationColumns = expanded ? full : compact;
  const applicableColumns = useMemo(() => applicableSmartGridColumns(
    presentationColumns,
    childMeta,
    rows,
    parentDoc,
    roles,
    fieldOverridesByRow,
  ), [presentationColumns, childMeta, rows, parentDoc, roles, fieldOverridesByRow]);
  const identityFieldname = applicableColumns[0]?.fieldname ?? presentationColumns[0]?.fieldname;
  const layoutKey = useMemo(
    () => smartGridLayoutKey(childMeta, expanded ? "full" : "compact", presentationColumns),
    [childMeta, expanded, presentationColumns],
  );

  useEffect(() => {
    setLayout(loadSmartGridLayout(layoutKey));
  }, [layoutKey]);

  const updateLayout = (mutate: (current: SmartGridLayout) => SmartGridLayout) => {
    setLayout((current) => {
      const next = mutate(cloneLayout(current));
      saveSmartGridLayout(layoutKey, next);
      return next;
    });
  };

  const columns = orderedSmartGridColumns(applicableColumns, layout, identityFieldname);
  const canExpand = full.some((field) => !compact.some((compactField) => compactField.fieldname === field.fieldname));
  const selectedSet = new Set(selectedRows);
  const allSelected = rows.length > 0 && rows.every((row, index) => selectedSet.has(smartGridRowKey(row, index)));
  const previewErrors = Object.values(previewErrorByRow).filter(Boolean);
  const columnWidth = (field: DocField) => layout.widths[field.fieldname]
    ?? defaultColumnWidth(field, field.fieldname === identityFieldname);
  const pinnedOffsets = new Map<string, number>();
  let pinnedLeft = 5.5;
  for (const field of columns) {
    if (field.fieldname !== identityFieldname && !layout.pinned.includes(field.fieldname)) continue;
    pinnedOffsets.set(field.fieldname, pinnedLeft);
    pinnedLeft += columnWidth(field);
  }
  const pinnedCell = (fieldname: string, header = false) => {
    const left = pinnedOffsets.get(fieldname);
    return {
      className: left === undefined ? "" : `sticky ${header ? "z-30" : "z-10"} bg-card shadow-[inset_-1px_0_0_var(--border)]`,
      style: left === undefined ? undefined : { left: `${left}rem` },
    };
  };

  /** Manual edit, paste and fill-down converge on one permission + preview path. */
  const commitEdits = (edits: readonly SmartGridCellEdit[]) => {
    if (readOnly || !edits.length) return;
    const current = latestRows.current;
    const next = current.map((row) => ({ ...row } as Doc));
    const previewTargets = new Map<number, string>();
    for (const edit of edits) {
      const row = next[edit.rowIndex];
      const field = (childMeta.fields ?? []).find((candidate) => candidate.fieldname === edit.fieldname);
      if (!row || !field) continue;
      const resolved = resolveSmartGridCell(field, childMeta, row, edit.rowIndex, parentDoc, roles, fieldOverridesByRow);
      if (!resolved.visible || resolved.readOnly || resolved.masked) continue;
      row[edit.fieldname] = edit.value;
      clearCellError(row, edit.rowIndex, edit.fieldname);
      previewTargets.set(edit.rowIndex, edit.fieldname);
    }
    if (!previewTargets.size) return;
    emitRows(next);
    previewTargets.forEach((changedField, rowIndex) => {
      const row = next[rowIndex];
      if (row) void runPreview(rowIndex, row, changedField);
    });
  };

  const setCell = (rowIndex: number, fieldname: string, value: unknown) => commitEdits([{ rowIndex, fieldname, value }]);
  const addRow = () => emitRows([...latestRows.current, newRow(childMeta, rowDefaults)]);
  const addMany = () => {
    const count = Math.max(1, Math.min(50, Math.trunc(Number(addManyCount) || 1)));
    emitRows([...latestRows.current, ...Array.from({ length: count }, () => newRow(childMeta, rowDefaults))]);
    setAddManyOpen(false);
  };

  const deleteKeys = (keys: ReadonlySet<string>) => {
    if (readOnly || !keys.size) return;
    const deleted: SmartGridDeletedRow[] = [];
    const next = latestRows.current.filter((row, index) => {
      if (!keys.has(smartGridRowKey(row, index))) return true;
      deleted.push({ row, index });
      return false;
    });
    if (!deleted.length) return;
    setLastDeleted(deleted);
    setSelectedRows([]);
    emitRows(next);
  };

  const removeRow = (rowIndex: number) => {
    const row = latestRows.current[rowIndex];
    if (row) deleteKeys(new Set([smartGridRowKey(row, rowIndex)]));
  };

  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    emitRows(restoreSmartGridRows(latestRows.current, lastDeleted));
    setLastDeleted(null);
  };

  const cloneEditableRow = (source: Doc, sourceIndex: number): Doc => {
    const copy = newRow(childMeta, rowDefaults);
    for (const field of childMeta.fields ?? []) {
      const resolved = resolveSmartGridCell(field, childMeta, source, sourceIndex, parentDoc, roles, fieldOverridesByRow);
      if (!resolved.visible || resolved.readOnly || resolved.masked || field.surface === "internal" || field.editMode === "hidden") continue;
      if (!isBlank(source[field.fieldname])) copy[field.fieldname] = source[field.fieldname];
    }
    return copy;
  };

  const duplicateSelection = (fallbackIndex?: number) => {
    if (readOnly) return;
    const current = latestRows.current;
    const sourceEntries: Array<{ row: Doc; index: number }> = [];
    if (fallbackIndex !== undefined) {
      const row = current[fallbackIndex];
      if (row) sourceEntries.push({ row, index: fallbackIndex });
    } else {
      current.forEach((row, index) => {
        if (selectedSet.has(smartGridRowKey(row, index))) sourceEntries.push({ row, index });
      });
    }
    if (!sourceEntries.length) return;
    const copies = sourceEntries.map(({ row, index }) => cloneEditableRow(row, index));
    const firstCopyIndex = current.length;
    emitRows([...current, ...copies]);
    copies.forEach((copy, offset) => {
      const changedField = (childMeta.fields ?? []).find((field) => !isBlank(copy[field.fieldname]))?.fieldname ?? "__duplicate__";
      void runPreview(firstCopyIndex + offset, copy, changedField);
    });
  };

  const moveSelection = (direction: -1 | 1) => {
    if (readOnly || !selectedSet.size) return;
    emitRows(moveSmartGridRows(latestRows.current, selectedSet, direction));
  };

  const toggleSelection = (row: Doc, rowIndex: number, checked: boolean) => {
    const key = smartGridRowKey(row, rowIndex);
    setSelectedRows((current) => checked ? [...new Set([...current, key])] : current.filter((value) => value !== key));
  };

  const displayLabel = (field: DocField, row?: Doc, rowIndex = 0) => {
    if (layout.labels[field.fieldname]) return layout.labels[field.fieldname];
    return label(row ? smartGridField(field, row, rowIndex, fieldOverridesByRow) : field);
  };

  const renderControl = (row: Doc, rowIndex: number, field: DocField) => {
    const resolved = resolveSmartGridCell(field, childMeta, row, rowIndex, parentDoc, roles, fieldOverridesByRow);
    if (!resolved.visible) return <span className="text-xs text-muted-foreground">—</span>;
    const Control = registry.resolve(resolved.field.fieldtype) ?? FallbackControl;
    return (
      <Control
        field={resolved.field}
        value={row[resolved.field.fieldname]}
        onChange={(value: unknown) => setCell(rowIndex, resolved.field.fieldname, value)}
        readOnly={Boolean(readOnly || resolved.readOnly || resolved.masked)}
        masked={resolved.masked}
        services={services}
        docname={String(row.name ?? "")}
        linkTarget={dynamicLinkTarget(resolved.field, row)}
        parentDoctype={childMeta.name}
        docValues={row}
        roles={roles}
        compact
      />
    );
  };

  const renderCellControl = (row: Doc, rowIndex: number, field: DocField) => {
    const resolved = resolveSmartGridCell(field, childMeta, row, rowIndex, parentDoc, roles, fieldOverridesByRow);
    const errorKey = cellErrorKey(row, rowIndex, field.fieldname);
    const error = cellErrors[errorKey];
    const invalid = Boolean(error) || (resolved.visible && resolved.field.reqd === 1 && isBlank(row[resolved.field.fieldname]));
    return (
      <div className="space-y-1">
        <div className={invalid ? "rounded-md ring-1 ring-destructive/70" : ""} aria-invalid={invalid || undefined}>
          {renderControl(row, rowIndex, field)}
        </div>
        {error ? <div className="text-[11px] leading-tight text-destructive">{error}</div> : null}
      </div>
    );
  };

  const pasteIntoGrid = (event: ReactClipboardEvent<HTMLElement>, rowIndex: number, columnIndex: number) => {
    if (readOnly) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n") && !text.includes("\r")) return;
    const plan = planSmartGridPaste(text, columns, columnIndex);
    if (!plan.matrix.length) return;
    event.preventDefault();

    const needed = rowIndex + plan.matrix.length;
    if (latestRows.current.length < needed) {
      emitRows([...latestRows.current, ...Array.from({ length: needed - latestRows.current.length }, () => newRow(childMeta, rowDefaults))]);
    }

    const edits: SmartGridCellEdit[] = [];
    const parseErrors: Record<string, string> = {};
    plan.matrix.forEach((values, rowOffset) => {
      values.forEach((raw, valueIndex) => {
        const targetColumn = plan.columnIndexes[valueIndex];
        const field = targetColumn === undefined ? undefined : columns[targetColumn];
        const targetRowIndex = rowIndex + rowOffset;
        const targetRow = latestRows.current[targetRowIndex];
        if (!field || !targetRow) return;
        const resolved = resolveSmartGridCell(field, childMeta, targetRow, targetRowIndex, parentDoc, roles, fieldOverridesByRow);
        if (!resolved.visible || resolved.readOnly || resolved.masked) return;
        const value = parseSmartGridPastedValue(field, raw);
        if (raw.trim() && value === undefined) {
          parseErrors[cellErrorKey(targetRow, targetRowIndex, field.fieldname)] = `Giá trị dán không hợp lệ cho ${label(field)}.`;
          return;
        }
        if (value !== undefined) edits.push({ rowIndex: targetRowIndex, fieldname: field.fieldname, value });
      });
    });
    if (Object.keys(parseErrors).length) setCellErrors((current) => ({ ...current, ...parseErrors }));
    commitEdits(edits);
  };

  /** Fill only blank editable cells in selected rows; never overwrite operator data. */
  const fillDown = () => {
    if (readOnly || !pickedCell || !selectedSet.size) return;
    const source = latestRows.current[pickedCell.rowIndex];
    const field = columns[pickedCell.columnIndex];
    if (!source || !field) return;
    const edits: SmartGridCellEdit[] = [];
    latestRows.current.forEach((row, rowIndex) => {
      if (!selectedSet.has(smartGridRowKey(row, rowIndex)) || rowIndex === pickedCell.rowIndex) return;
      if (!isBlank(row[field.fieldname])) return;
      edits.push({ rowIndex, fieldname: field.fieldname, value: source[field.fieldname] });
    });
    commitEdits(edits);
  };

  const focusRenderedCell = (rowIndex: number, columnIndex: number) => {
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-smart-grid-cell="${rowIndex}:${columnIndex}"]`);
    const focusable = cell?.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]:not([tabindex='-1'])") ?? cell;
    focusable?.focus();
    if (cell) setPickedCell({ rowIndex, columnIndex });
  };

  const focusCell = (rowIndex: number, columnIndex: number) => {
    if (!rows.length || !columns.length) return;
    let nextRow = rowIndex;
    let nextColumn = columnIndex;
    if (nextColumn >= columns.length) {
      nextColumn = 0;
      nextRow += 1;
    }
    if (nextColumn < 0) {
      nextColumn = columns.length - 1;
      nextRow -= 1;
    }
    nextRow = Math.max(0, Math.min(rows.length - 1, nextRow));
    focusRenderedCell(nextRow, nextColumn);
  };

  const appendAndFocus = (columnIndex: number) => {
    if (readOnly) return;
    const targetRowIndex = latestRows.current.length;
    emitRows([...latestRows.current, newRow(childMeta, rowDefaults)]);
    requestAnimationFrame(() => requestAnimationFrame(() => focusRenderedCell(targetRowIndex, Math.max(0, Math.min(columns.length - 1, columnIndex)))));
  };

  const handleCellKey = (event: ReactKeyboardEvent<HTMLElement>, rowIndex: number, columnIndex: number) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target.tagName !== "TEXTAREA" && !target.isContentEditable) {
      event.preventDefault();
      if (!event.shiftKey && rowIndex === rows.length - 1) appendAndFocus(columnIndex);
      else focusCell(rowIndex + (event.shiftKey ? -1 : 1), columnIndex);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (!event.shiftKey && rowIndex === rows.length - 1 && columnIndex === columns.length - 1) appendAndFocus(0);
      else focusCell(rowIndex, columnIndex + (event.shiftKey ? -1 : 1));
    }
  };

  const resizeColumn = (field: DocField, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidth(field);
    const move = (next: MouseEvent) => {
      const width = Math.max(5, Math.min(48, startWidth + (next.clientX - startX) / 16));
      updateLayout((current) => ({ ...current, widths: { ...current.widths, [field.fieldname]: Number(width.toFixed(2)) } }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const settingsProbes: readonly Doc[] = rows.length ? rows : [{ name: "__settings_probe__", doctype: childMeta.name } as Doc];
  const settingsCandidates = presentationColumns.filter((field) => {
    if (field.surface === "internal" || field.editMode === "hidden") return false;
    return settingsProbes.some((row, rowIndex) => {
      const resolved = resolveSmartGridCell(field, childMeta, row, rowIndex, parentDoc, roles, fieldOverridesByRow);
      return resolved.visible && !resolved.masked;
    });
  });
  const settingsOrder = layout.order.length
    ? [
        ...layout.order.filter((name) => settingsCandidates.some((field) => field.fieldname === name)),
        ...settingsCandidates.map((field) => field.fieldname).filter((name) => !layout.order.includes(name)),
      ]
    : settingsCandidates.map((field) => field.fieldname);
  const moveColumnSetting = (fieldname: string, direction: -1 | 1) => {
    updateLayout((current) => ({ ...current, order: reorderSmartGridField(settingsOrder, fieldname, direction) }));
  };

  const detailDoc = detailRow === null ? undefined : rows[detailRow];
  const shellClass = fullscreen
    ? "fixed inset-3 z-50 flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
    : "overflow-hidden rounded-md border";
  const desktopTableClass = fullscreen ? "hidden min-h-0 flex-1 overflow-auto md:block" : "hidden overflow-x-auto md:block";

  return (
    <div ref={gridRef} className={shellClass} data-metadata-child-grid={childMeta.name} data-smart-child-grid="true">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-2 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{rows.length} dòng</span>
          {selectedRows.length ? <span>• Đã chọn {selectedRows.length}</span> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {selectedRows.length && !readOnly ? (
            <>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Đưa dòng đã chọn lên" onClick={() => moveSelection(-1)}><ArrowUp className="size-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Đưa dòng đã chọn xuống" onClick={() => moveSelection(1)}><ArrowDown className="size-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Nhân bản dòng đã chọn" onClick={() => duplicateSelection()}><Copy className="size-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Xóa dòng đã chọn" onClick={() => deleteKeys(selectedSet)}><Trash2 className="size-3.5" /></Button>
            </>
          ) : null}
          {pickedCell && selectedRows.length > 1 && !readOnly ? <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Điền xuống dòng đã chọn" onClick={fillDown}><ArrowDownToLine className="size-3.5" /></Button> : null}
          {lastDeleted?.length && !readOnly ? <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Hoàn tác xóa dòng" onClick={undoDelete}><Undo2 className="size-3.5" /></Button> : null}
          <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Tùy chỉnh cột" onClick={() => setColumnSettingsOpen(true)}><Columns3 className="size-3.5" /></Button>
          {canExpand ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setExpanded((value) => !value)}>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}{expanded ? "Thu gọn" : "Mở rộng"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={fullscreen ? "Thoát toàn màn hình" : "Mở toàn màn hình"} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</Button>
          {!readOnly ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setAddManyOpen(true)}><Plus className="size-3.5" /> Thêm nhiều</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={addRow}><Plus className="size-3.5" /> Thêm dòng</Button>
            </>
          ) : null}
        </div>
      </div>

      {previewErrors.length ? <div className="border-b bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{previewErrors[0]}</div> : null}

      <div className={fullscreen ? "min-h-0 flex-1 space-y-3 overflow-auto p-3 md:hidden" : "space-y-3 p-3 md:hidden"}>
        {rows.map((row, rowIndex) => {
          const key = smartGridRowKey(row, rowIndex);
          const mobileColumns = columns.filter((field) => resolveSmartGridCell(field, childMeta, row, rowIndex, parentDoc, roles, fieldOverridesByRow).visible);
          return (
            <section key={key} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2"><Checkbox checked={selectedSet.has(key)} onCheckedChange={(value) => toggleSelection(row, rowIndex, value === true)} aria-label={`Chọn dòng ${rowIndex + 1}`} /><span className="text-xs font-semibold text-muted-foreground">#{rowIndex + 1}</span></div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDetailRow(rowIndex)}>Chi tiết</Button>
                  {!readOnly ? <><Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Nhân bản dòng ${rowIndex + 1}`} onClick={() => duplicateSelection(rowIndex)}><Copy className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Xóa dòng ${rowIndex + 1}`} onClick={() => removeRow(rowIndex)}><Trash2 className="size-3.5" /></Button></> : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {mobileColumns.map((field) => {
                  const effective = smartGridField(field, row, rowIndex, fieldOverridesByRow);
                  return <div key={field.fieldname} className="min-w-0 space-y-1.5"><div className="text-xs font-medium text-muted-foreground">{displayLabel(effective, row, rowIndex)}{effective.reqd ? <span className="ml-0.5 text-destructive">*</span> : null}</div>{renderCellControl(row, rowIndex, field)}</div>;
                })}
              </div>
            </section>
          );
        })}
        {!rows.length ? <div className="py-4 text-center text-sm text-muted-foreground">Chưa có dòng nào</div> : null}
      </div>

      <div className={desktopTableClass}>
        <Table className="min-w-max text-sm">
          <TableHeader><TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableHead className="sticky left-0 z-40 w-10 min-w-10 bg-card px-2 text-center"><Checkbox checked={allSelected} onCheckedChange={(value) => setSelectedRows(value === true ? rows.map(smartGridRowKey) : [])} aria-label="Chọn tất cả dòng" /></TableHead>
            <TableHead className="sticky left-10 z-40 w-12 min-w-12 bg-card text-right">#</TableHead>
            {columns.map((field) => {
              const sticky = pinnedCell(field.fieldname, true);
              const width = columnWidth(field);
              return <TableHead key={field.fieldname} className={`relative whitespace-nowrap ${sticky.className}`} style={{ ...sticky.style, width: `${width}rem`, minWidth: `${width}rem`, maxWidth: `${width}rem` }}><div className="flex items-center gap-1"><span className="truncate">{displayLabel(field)}</span>{field.fieldname === identityFieldname || layout.pinned.includes(field.fieldname) ? <Pin className="size-3 text-muted-foreground" /> : null}</div><span role="separator" aria-label={`Đổi độ rộng ${displayLabel(field)}`} className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-border" onMouseDown={(event) => resizeColumn(field, event)} /></TableHead>;
            })}
            <TableHead className="w-24 min-w-24 text-right">Thao tác</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((row, rowIndex) => {
            const key = smartGridRowKey(row, rowIndex);
            return <TableRow key={key} data-state={selectedSet.has(key) ? "selected" : undefined}>
              <TableCell className="sticky left-0 z-20 w-10 min-w-10 bg-card px-2 text-center"><Checkbox checked={selectedSet.has(key)} onCheckedChange={(value) => toggleSelection(row, rowIndex, value === true)} aria-label={`Chọn dòng ${rowIndex + 1}`} /></TableCell>
              <TableCell className="sticky left-10 z-20 w-12 min-w-12 bg-card text-right text-xs text-muted-foreground">{rowIndex + 1}</TableCell>
              {columns.map((field, columnIndex) => {
                const sticky = pinnedCell(field.fieldname);
                const width = columnWidth(field);
                return <TableCell key={field.fieldname} data-smart-grid-cell={`${rowIndex}:${columnIndex}`} className={`align-top ${sticky.className}`} style={{ ...sticky.style, width: `${width}rem`, minWidth: `${width}rem`, maxWidth: `${width}rem` }} onFocusCapture={() => setPickedCell({ rowIndex, columnIndex })} onClick={() => setPickedCell({ rowIndex, columnIndex })} onKeyDown={(event) => handleCellKey(event, rowIndex, columnIndex)} onPaste={(event) => pasteIntoGrid(event, rowIndex, columnIndex)}>{renderCellControl(row, rowIndex, field)}</TableCell>;
              })}
              <TableCell className="text-right align-top"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDetailRow(rowIndex)}>Chi tiết</Button>{!readOnly ? <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Xóa dòng ${rowIndex + 1}`} onClick={() => removeRow(rowIndex)}><Trash2 className="size-3.5" /></Button> : null}</div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
        {!rows.length ? <div className="py-6 text-center text-sm text-muted-foreground">Chưa có dòng nào</div> : null}
      </div>

      <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Tùy chỉnh cột</DialogTitle><DialogDescription>Ẩn/hiện, xếp thứ tự, ghim, đổi nhãn và độ rộng cho chế độ hiện tại.</DialogDescription></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto py-2">{settingsOrder.map((fieldname, index) => {
            const field = settingsCandidates.find((candidate) => candidate.fieldname === fieldname);
            if (!field) return null;
            const identity = field.fieldname === identityFieldname;
            const visible = identity || !layout.hidden.includes(field.fieldname);
            const pinned = identity || layout.pinned.includes(field.fieldname);
            return <div key={field.fieldname} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 rounded-md border p-2">
              <Checkbox checked={visible} disabled={identity} onCheckedChange={(value) => updateLayout((current) => ({ ...current, hidden: value === true ? current.hidden.filter((name) => name !== field.fieldname) : [...new Set([...current.hidden, field.fieldname])] }))} aria-label={`Hiện ${label(field)}`} />
              <div className="grid gap-1 sm:grid-cols-2">
                <Input className="h-8" value={layout.labels[field.fieldname] ?? ""} placeholder={label(field)} onChange={(event) => updateLayout((current) => { const labels = { ...current.labels }; const value = event.target.value.trimStart(); if (value) labels[field.fieldname] = value; else delete labels[field.fieldname]; return { ...current, labels }; })} aria-label={`Nhãn ${label(field)}`} />
                <Input className="h-8" type="number" min={5} max={48} step={1} value={layout.widths[field.fieldname] ?? defaultColumnWidth(field, identity)} onChange={(event) => updateLayout((current) => ({ ...current, widths: { ...current.widths, [field.fieldname]: Math.max(5, Math.min(48, Number(event.target.value) || defaultColumnWidth(field, identity))) } }))} aria-label={`Độ rộng ${label(field)}`} />
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === 0} aria-label={`Đưa ${label(field)} sang trái`} onClick={() => moveColumnSetting(field.fieldname, -1)}><ArrowUp className="size-3.5 -rotate-90" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === settingsOrder.length - 1} aria-label={`Đưa ${label(field)} sang phải`} onClick={() => moveColumnSetting(field.fieldname, 1)}><ArrowDown className="size-3.5 -rotate-90" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={identity} aria-label={pinned ? `Bỏ ghim ${label(field)}` : `Ghim ${label(field)}`} onClick={() => updateLayout((current) => ({ ...current, pinned: pinned ? current.pinned.filter((name) => name !== field.fieldname) : [...new Set([...current.pinned, field.fieldname])] }))}>{pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}</Button>
            </div>;
          })}</div>
          <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => { const reset = cloneLayout(EMPTY_SMART_GRID_LAYOUT); setLayout(reset); saveSmartGridLayout(layoutKey, reset); }}><RotateCcw className="size-4" /> Đặt lại</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={addManyOpen} onOpenChange={setAddManyOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Thêm nhiều dòng</DialogTitle><DialogDescription>Chọn số dòng trống cần thêm, tối đa 50 dòng mỗi lần.</DialogDescription></DialogHeader><Input type="number" min={1} max={50} value={addManyCount} onChange={(event) => setAddManyCount(Number(event.target.value))} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAddManyOpen(false)}>Hủy</Button><Button type="button" onClick={addMany}>Thêm {Math.max(1, Math.min(50, Math.trunc(Number(addManyCount) || 1)))} dòng</Button></div></DialogContent>
      </Dialog>

      <Dialog open={detailDoc !== undefined} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Chi tiết dòng {detailRow === null ? "" : detailRow + 1}</DialogTitle><DialogDescription>Các trường nghiệp vụ đầy đủ theo metadata và quyền hiện tại.</DialogDescription></DialogHeader>
          {detailDoc && detailRow !== null ? <div className="grid max-h-[70vh] gap-4 overflow-auto py-2 sm:grid-cols-2 lg:grid-cols-3">{full.filter((field) => resolveSmartGridCell(field, childMeta, detailDoc, detailRow, parentDoc, roles, fieldOverridesByRow).visible).map((field) => {
            const effective = smartGridField(field, detailDoc, detailRow, fieldOverridesByRow);
            return <div key={field.fieldname} className="min-w-0 space-y-1.5"><div className="text-xs font-medium text-muted-foreground">{displayLabel(effective, detailDoc, detailRow)}{effective.reqd ? <span className="ml-0.5 text-destructive">*</span> : null}</div>{renderCellControl(detailDoc, detailRow, field)}</div>;
          })}</div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
