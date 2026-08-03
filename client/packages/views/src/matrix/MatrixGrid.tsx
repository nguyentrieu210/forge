/** @jsxImportSource react */
import type { KeyboardEvent, Ref } from "react";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { Trash2 } from "lucide-react";
import {
  Button, Checkbox, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn, useT,
} from "@metaforge/ui";
import { matrixCellKey, nextMatrixCoordinate, type MatrixMoveKey } from "./model.js";
import type { MatrixAuxField, MatrixCell, MatrixCoordinate, MatrixMember, MatrixViewModel } from "./types.js";

const DEFAULT_ROW_HEADER_WIDTH = 176;
const DEFAULT_AUX_WIDTH = 176;
const DEFAULT_COLUMN_WIDTH = 208;

interface MatrixTableProps {
  model: MatrixViewModel;
  rows: MatrixMember[];
  columns: MatrixMember[];
  auxiliaryFields: MatrixAuxField[];
  registry?: ControlRegistry;
  services?: FieldServices;
  roles?: string[];
  locked: boolean;
  scrollRef: Ref<HTMLDivElement>;
  virtualized: boolean;
  virtualRows: Array<{ index: number; start: number; end: number }>;
  padTop: number;
  padBottom: number;
  measureRow?: (element: HTMLTableRowElement | null) => void;
  focusedCell: MatrixCoordinate | null;
  onFocusedCellChange: (coordinate: MatrixCoordinate) => void;
  onCellChange?: ((coordinate: MatrixCoordinate, value: unknown) => void | Promise<void>);
  onCellToggle?: ((coordinate: MatrixCoordinate, enabled: boolean) => void | Promise<void>);
  onAuxFieldChange?: ((rowId: string, fieldId: string, value: unknown) => void | Promise<void>);
  onRemoveRow?: (rowId: string) => void;
  onEnsureRowVisible?: (index: number) => void;
}

export function MatrixTable(props: MatrixTableProps) {
  const t = useT();
  const presentation = props.model.presentation ?? {};
  const rowWidth = presentation.rowHeaderWidth ?? DEFAULT_ROW_HEADER_WIDTH;
  const auxWidth = presentation.auxiliaryWidth ?? DEFAULT_AUX_WIDTH;
  const columnWidth = presentation.columnWidth ?? DEFAULT_COLUMN_WIDTH;
  const stickyHeaders = presentation.stickyHeaders !== false;
  const stickyRowAxis = presentation.stickyRowAxis !== false;
  const stickyOffsets = props.auxiliaryFields.map((_, index) => rowWidth + index * auxWidth);
  const totalColumns = 1 + props.auxiliaryFields.length + props.columns.length + (props.onRemoveRow ? 1 : 0);
  const rowIds = props.rows.map((row) => row.id);
  const columnIds = props.columns.map((column) => column.id);

  const focusCoordinate = (coordinate: MatrixCoordinate) => {
    props.onFocusedCellChange(coordinate);
    requestAnimationFrame(() => {
      document.getElementById(cellDomId(props.model.id, coordinate.rowId, coordinate.columnId))?.focus();
    });
  };

  const moveCell = (event: KeyboardEvent<HTMLTableCellElement>, coordinate: MatrixCoordinate) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key as MatrixMoveKey;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) {
      if (event.key === "Enter" || event.key === "F2") {
        const editor = firstFocusable(event.currentTarget);
        if (editor) { event.preventDefault(); editor.focus(); }
      }
      return;
    }
    event.preventDefault();
    const next = nextMatrixCoordinate(coordinate, rowIds, columnIds, key, event.ctrlKey || event.metaKey);
    if (!next) return;
    const nextIndex = rowIds.indexOf(next.rowId);
    if (props.virtualized && nextIndex >= 0) {
      const rendered = props.virtualRows.some((item) => item.index === nextIndex);
      if (!rendered) {
        props.onFocusedCellChange(next);
        props.onEnsureRowVisible?.(nextIndex);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.getElementById(cellDomId(props.model.id, next.rowId, next.columnId))?.focus();
        }));
        return;
      }
    }
    focusCoordinate(next);
  };

  const renderRow = (row: MatrixMember, absoluteIndex: number) => (
    <TableRow key={row.id} ref={props.measureRow} data-index={absoluteIndex} className="bg-card [&>td]:align-top">
      <TableCell
        className={cn("border-r bg-card px-3 py-2 font-medium", stickyRowAxis && "sticky left-0 z-[4] shadow-[inset_-1px_0_0_var(--border)]")}
        style={{ minWidth: rowWidth, width: rowWidth }}
      >
        <span className="block truncate">{row.label}</span>
        {row.subtitle ? <span className="block truncate text-xs font-normal text-muted-foreground">{row.subtitle}</span> : null}
      </TableCell>
      {props.auxiliaryFields.map((field, index) => (
        <TableCell
          key={field.id}
          className={cn("border-r bg-card p-2", stickyRowAxis && "sticky z-[3] shadow-[inset_-1px_0_0_var(--border)]")}
          style={{ minWidth: auxWidth, width: auxWidth, left: stickyRowAxis ? stickyOffsets[index] : undefined }}
        >
          <AuxFieldEditor
            matrixId={props.model.id}
            row={row}
            field={field}
            registry={props.registry}
            services={props.services}
            roles={props.roles}
            locked={props.locked}
            onChange={props.onAuxFieldChange}
          />
        </TableCell>
      ))}
      {props.columns.map((column) => {
        const coordinate = { rowId: row.id, columnId: column.id };
        const key = matrixCellKey(row.id, column.id);
        const cell = props.model.cells[key];
        const active = props.focusedCell?.rowId === row.id && props.focusedCell?.columnId === column.id;
        return (
          <TableCell
            key={column.id}
            id={cellDomId(props.model.id, row.id, column.id)}
            data-matrix-cell={key}
            tabIndex={active ? 0 : -1}
            onFocus={() => props.onFocusedCellChange(coordinate)}
            onKeyDown={(event) => moveCell(event, coordinate)}
            aria-label={`${row.label}, ${column.label}`}
            aria-invalid={Boolean(cell?.error || cell?.conflict) || undefined}
            className={cn("border-r p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", cell?.conflict && "bg-destructive/5", cell?.error && "bg-destructive/5")}
            style={{ minWidth: columnWidth, width: columnWidth }}
          >
            <CellEditor
              model={props.model}
              row={row}
              column={column}
              cell={cell}
              registry={props.registry}
              services={props.services}
              roles={props.roles}
              locked={props.locked}
              onChange={props.onCellChange}
              onToggle={props.onCellToggle}
              onEscape={() => document.getElementById(cellDomId(props.model.id, row.id, column.id))?.focus()}
            />
          </TableCell>
        );
      })}
      {props.onRemoveRow ? (
        <TableCell className="w-12 p-2 text-center">
          <Button type="button" variant="ghost" size="icon-sm" disabled={row.disabled || props.locked} onClick={() => props.onRemoveRow?.(row.id)} aria-label={`${t("matrix.remove_row", "Xóa dòng")} ${row.label}`}>
            <Trash2 />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );

  return (
    <div ref={props.scrollRef} className="mf-matrix-scroll min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
      <Table unwrapped className="w-max min-w-full border-collapse text-sm" role="grid" aria-label={props.model.ariaLabel ?? props.model.title ?? t("matrix.title", "Ma trận")} aria-rowcount={props.rows.length + 1} aria-colcount={totalColumns}>
        <TableHeader className={cn(stickyHeaders && "sticky top-0 z-20 bg-muted/95 backdrop-blur")}>
          <TableRow>
            <TableHead className={cn("border-r bg-muted px-3 py-2", stickyRowAxis && "sticky left-0 z-30")} style={{ minWidth: rowWidth, width: rowWidth }}>{props.model.rowAxis.label}</TableHead>
            {props.auxiliaryFields.map((field, index) => (
              <TableHead key={field.id} className={cn("border-r bg-muted px-3 py-2", stickyRowAxis && "sticky z-30")} style={{ minWidth: auxWidth, width: auxWidth, left: stickyRowAxis ? stickyOffsets[index] : undefined }}>
                {field.label ?? field.field.label ?? field.id}
              </TableHead>
            ))}
            {props.columns.map((column) => (
              <TableHead key={column.id} className="border-r px-3 py-2 text-left" style={{ minWidth: columnWidth, width: columnWidth }}>
                <span className="block truncate font-medium">{column.label}</span>
                {column.subtitle ? <span className="block truncate text-xs font-normal text-muted-foreground">{column.subtitle}</span> : null}
              </TableHead>
            ))}
            {props.onRemoveRow ? <TableHead className="w-12 text-center">{t("matrix.actions", "Thao tác")}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.virtualized && props.padTop > 0 ? <TableRow aria-hidden><TableCell colSpan={totalColumns} className="p-0" style={{ height: props.padTop }} /></TableRow> : null}
          {props.virtualized
            ? props.virtualRows.map((item) => {
                const row = props.rows[item.index];
                return row ? renderRow(row, item.index) : null;
              })
            : props.rows.map((row, index) => renderRow(row, index))}
          {props.virtualized && props.padBottom > 0 ? <TableRow aria-hidden><TableCell colSpan={totalColumns} className="p-0" style={{ height: props.padBottom }} /></TableRow> : null}
        </TableBody>
      </Table>
    </div>
  );
}

export function MatrixMobileCards(props: {
  model: MatrixViewModel;
  rows: MatrixMember[];
  columns: MatrixMember[];
  auxiliaryFields: MatrixAuxField[];
  registry?: ControlRegistry;
  services?: FieldServices;
  roles?: string[];
  locked: boolean;
  onCellChange?: ((coordinate: MatrixCoordinate, value: unknown) => void | Promise<void>);
  onCellToggle?: ((coordinate: MatrixCoordinate, enabled: boolean) => void | Promise<void>);
  onAuxFieldChange?: ((rowId: string, fieldId: string, value: unknown) => void | Promise<void>);
  onRemoveRow?: (rowId: string) => void;
}) {
  const t = useT();
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto overscroll-contain bg-muted/20 p-3">
      {props.rows.map((row) => (
        <article key={row.id} className="rounded-lg border bg-card shadow-sm">
          <header className="flex items-start gap-2 border-b p-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{row.label}</h3>
              {row.subtitle ? <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p> : null}
            </div>
            {props.onRemoveRow ? (
              <Button type="button" variant="ghost" size="icon-sm" disabled={row.disabled || props.locked} onClick={() => props.onRemoveRow?.(row.id)} aria-label={`${t("matrix.remove_row", "Xóa dòng")} ${row.label}`}>
                <Trash2 />
              </Button>
            ) : null}
          </header>
          {props.auxiliaryFields.length ? (
            <div className="grid gap-3 border-b p-3 sm:grid-cols-2">
              {props.auxiliaryFields.map((field) => (
                <div key={field.id} className="min-w-0 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{field.label ?? field.field.label ?? field.id}</div>
                  <AuxFieldEditor matrixId={props.model.id} row={row} field={field} registry={props.registry} services={props.services} roles={props.roles} locked={props.locked} onChange={props.onAuxFieldChange} />
                </div>
              ))}
            </div>
          ) : null}
          <div className="divide-y">
            {props.columns.map((column) => (
              <div key={column.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(7rem,35%)_1fr] sm:items-start">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{column.label}</div>
                  {column.subtitle ? <div className="truncate text-[11px] text-muted-foreground">{column.subtitle}</div> : null}
                </div>
                <CellEditor
                  model={props.model}
                  row={row}
                  column={column}
                  cell={props.model.cells[matrixCellKey(row.id, column.id)]}
                  registry={props.registry}
                  services={props.services}
                  roles={props.roles}
                  locked={props.locked}
                  onChange={props.onCellChange}
                  onToggle={props.onCellToggle}
                />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function CellEditor(props: {
  model: MatrixViewModel;
  row: MatrixMember;
  column: MatrixMember;
  cell?: MatrixCell;
  registry?: ControlRegistry;
  services?: FieldServices;
  roles?: string[];
  locked: boolean;
  onChange?: ((coordinate: MatrixCoordinate, value: unknown) => void | Promise<void>);
  onToggle?: ((coordinate: MatrixCoordinate, enabled: boolean) => void | Promise<void>);
  onEscape?: () => void;
}) {
  const t = useT();
  const coordinate = { rowId: props.row.id, columnId: props.column.id };
  const defaults = props.model.cellDefaults ?? {};
  const value = props.cell?.value ?? defaults.value ?? null;
  const enabled = props.cell?.enabled ?? defaults.enabled;
  const editable = props.cell?.editable ?? defaults.editable ?? false;
  const readOnly = props.locked || props.cell?.readOnly || defaults.readOnly || !editable || !props.onChange;
  const masked = props.cell?.masked ?? false;
  const Control = props.registry?.resolve(props.model.cellEditor.field.fieldtype);
  const field = props.model.cellEditor.field;
  const controlId = `${cellDomId(props.model.id, props.row.id, props.column.id)}-editor`;
  const message = props.cell?.conflict ?? props.cell?.error;

  return (
    <div className="min-w-0 space-y-1.5" data-matrix-editor-root onKeyDown={(event) => {
      if (event.key === "Escape" && props.onEscape) { event.stopPropagation(); props.onEscape(); }
    }}>
      {enabled !== undefined ? (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={enabled}
            disabled={props.locked || props.cell?.readOnly || !props.onToggle}
            onCheckedChange={(checked) => { void props.onToggle?.(coordinate, checked === true); }}
            aria-label={`${t("matrix.enabled", "Bật")} ${props.row.label} / ${props.column.label}`}
          />
          <span className="text-[11px] text-muted-foreground">{enabled ? t("matrix.enabled_state", "Đang bật") : t("matrix.disabled_state", "Đang tắt")}</span>
        </div>
      ) : null}
      {props.cell?.loading ? <Skeleton className="h-8 w-full" /> : (
        <div data-matrix-value-editor>
          {Control ? (
            <Control
              field={field}
              id={controlId}
              value={value}
              onChange={(next) => { void props.onChange?.(coordinate, next); }}
              compact
              readOnly={readOnly}
              masked={masked}
              error={props.cell?.error}
              describedBy={message ? `${controlId}-message` : undefined}
              label={`${props.row.label} / ${props.column.label}`}
              services={props.services}
              linkTarget={props.model.cellEditor.linkTarget ?? (field.fieldtype === "Link" ? field.options : undefined)}
              parentDoctype={props.model.cellEditor.parentDoctype}
              docValues={props.cell?.metadata ?? props.row.metadata}
              roles={props.roles}
            />
          ) : (
            <span className={cn("block min-h-8 rounded-md border px-2 py-1.5 text-sm", masked && "select-none blur-sm")}>
              {masked ? "••••" : formatFallback(value)}
            </span>
          )}
        </div>
      )}
      {message ? <p id={`${controlId}-message`} className="text-xs text-destructive" role="alert">{message}</p> : null}
    </div>
  );
}

function AuxFieldEditor(props: {
  matrixId: string;
  row: MatrixMember;
  field: MatrixAuxField;
  registry?: ControlRegistry;
  services?: FieldServices;
  roles?: string[];
  locked: boolean;
  onChange?: ((rowId: string, fieldId: string, value: unknown) => void | Promise<void>);
}) {
  const field = props.field.field;
  const Control = props.registry?.resolve(field.fieldtype);
  const readOnly = props.locked || props.field.readOnlyRows?.includes(props.row.id) || !props.onChange;
  const masked = props.field.maskedRows?.includes(props.row.id) ?? false;
  const error = props.field.errors?.[props.row.id];
  const conflict = props.field.conflicts?.[props.row.id];
  const id = `mf-matrix-${domToken(props.matrixId)}-aux-${domToken(props.row.id)}-${domToken(props.field.id)}`;
  const value = props.field.values[props.row.id] ?? null;
  if (!Control) {
    return (
      <div className="space-y-1">
        <span className={cn("block min-h-8 rounded-md border px-2 py-1.5 text-sm", masked && "select-none blur-sm")}>{masked ? "••••" : formatFallback(value)}</span>
        {conflict || error ? <p className="text-xs text-destructive" role="alert">{conflict ?? error}</p> : null}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Control
        field={field}
        id={id}
        value={value}
        onChange={(next) => { void props.onChange?.(props.row.id, props.field.id, next); }}
        compact
        readOnly={Boolean(readOnly)}
        masked={masked}
        error={error}
        describedBy={conflict || error ? `${id}-message` : undefined}
        label={props.field.label ?? field.label ?? props.field.id}
        services={props.services}
        linkTarget={props.field.linkTargets?.[props.row.id] ?? (field.fieldtype === "Link" ? field.options : undefined)}
        parentDoctype={props.field.parentDoctype}
        docValues={props.row.metadata}
        roles={props.roles}
      />
      {conflict || error ? <p id={`${id}-message`} className="text-xs text-destructive" role="alert">{conflict ?? error}</p> : null}
    </div>
  );
}

function cellDomId(matrixId: string, rowId: string, columnId: string): string {
  return `mf-matrix-${domToken(matrixId)}-cell-${domToken(rowId)}-${domToken(columnId)}`;
}

function domToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "value";
}

function firstFocusable(root: HTMLElement): HTMLElement | null {
  const selector = "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [role='combobox']:not([aria-disabled='true']), [tabindex]:not([tabindex='-1'])";
  return root.querySelector<HTMLElement>(`[data-matrix-value-editor] ${selector}`)
    ?? root.querySelector<HTMLElement>(selector);
}

function formatFallback(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}
