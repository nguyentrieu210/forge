/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import type { DocField, Fieldtype, MatrixActionInputField, MatrixActionInputTable, MatrixActionRef } from "@metaforge/core";
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";

type Values = Record<string, unknown>;

export interface ActionInputDialogProps {
  open: boolean;
  action?: MatrixActionRef;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Values) => void | Promise<void>;
}

export function ActionInputDialog(props: ActionInputDialogProps) {
  const { registry, services } = useMetaForge();
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!props.open || !props.action) return;
    setValues(initialValues(props.action));
    setError(undefined);
  }, [props.action, props.open]);

  const missing = useMemo(() => props.action ? missingInputs(props.action, values) : [], [props.action, values]);
  if (!props.action) return null;

  const change = (fieldname: string, value: unknown) => {
    setValues((current) => ({ ...current, [fieldname]: value }));
    setError(undefined);
  };

  const submit = async () => {
    if (missing.length) {
      setError(`Còn thiếu: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ` và ${missing.length - 8} ô khác` : ""}.`);
      return;
    }
    if (props.action?.confirm && !window.confirm(props.action.confirm)) return;
    await props.onSubmit(values);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(94vw,760px)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{props.action.label ?? "Thêm thành phần"}</DialogTitle>
        </DialogHeader>
        {props.action.description ? <p className="text-sm text-muted-foreground">{props.action.description}</p> : null}

        {(props.action.fields ?? []).length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(props.action.fields ?? []).map((field) => {
              const docField = toDocField(field);
              const Control = registry.resolve(docField.fieldtype);
              const id = `matrix-action-${props.action!.action}-${field.fieldname}`;
              return (
                <div key={field.fieldname} className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={id}>
                    {field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
                  </Label>
                  {Control ? (
                    <Control
                      field={docField}
                      value={values[field.fieldname] ?? ""}
                      onChange={(next: unknown) => change(field.fieldname, next)}
                      id={id}
                      required={field.required}
                      services={services}
                      {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})}
                      docValues={values}
                    />
                  ) : (
                    <Input id={id} value={String(values[field.fieldname] ?? "")} onChange={(event) => change(field.fieldname, event.target.value)} />
                  )}
                  {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {(props.action.inputTables ?? []).map((table) => (
          <InputTable
            key={table.fieldname}
            actionName={props.action!.action}
            spec={table}
            rows={Array.isArray(values[table.fieldname]) ? values[table.fieldname] as Values[] : []}
            onChange={(rows) => change(table.fieldname, rows)}
          />
        ))}

        {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div> : null}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" disabled={props.busy} onClick={() => props.onOpenChange(false)}>Hủy</Button>
          <Button disabled={props.busy} onClick={() => void submit()}>
            {props.busy ? "Đang thực hiện…" : (props.action.label ?? "Thực hiện")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InputTable({ actionName, spec, rows, onChange }: {
  actionName: string;
  spec: MatrixActionInputTable;
  rows: Values[];
  onChange: (rows: Values[]) => void;
}) {
  const { registry, services } = useMetaForge();
  const effectiveRows = rows.length ? rows : Array.from({ length: spec.minRows }, () => blankRow(spec));
  const changeCell = (rowIndex: number, fieldname: string, value: unknown) => {
    onChange(effectiveRows.map((row, index) => index === rowIndex ? { ...row, [fieldname]: value } : row));
  };
  const addRow = () => {
    if (effectiveRows.length < spec.maxRows) onChange([...effectiveRows, blankRow(spec)]);
  };
  const removeRow = (rowIndex: number) => {
    if (effectiveRows.length <= spec.minRows) {
      onChange(effectiveRows.map((row, index) => index === rowIndex ? blankRow(spec) : row));
    } else {
      onChange(effectiveRows.filter((_, index) => index !== rowIndex));
    }
  };
  const paste = (event: ClipboardEvent<HTMLElement>, rowIndex: number, columnIndex: number) => {
    if (!spec.allowPaste) return;
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").split("\n").filter((line) => line.length).map((line) => line.split("\t"));
    const needed = Math.min(spec.maxRows, Math.max(effectiveRows.length, rowIndex + matrix.length));
    const next = Array.from({ length: needed }, (_, index) => ({ ...(effectiveRows[index] ?? blankRow(spec)) }));
    matrix.forEach((cells, rowOffset) => {
      const targetRow = rowIndex + rowOffset;
      if (targetRow >= spec.maxRows) return;
      cells.forEach((raw, columnOffset) => {
        const column = spec.columns[columnIndex + columnOffset];
        if (column) next[targetRow]![column.fieldname] = coerce(raw, column);
      });
    });
    onChange(next);
  };

  return (
    <div className="border-t pt-4" data-matrix-action-input-table={spec.fieldname}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{spec.label}</div>
          {spec.description ? <p className="mt-1 text-xs text-muted-foreground">{spec.description}</p> : null}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={effectiveRows.length >= spec.maxRows} onClick={addRow}>Thêm dòng</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table unwrapped className="w-full min-w-max text-sm">
          <TableHeader className="border-b bg-muted/40">
            <TableRow>
              <TableHead className="w-12 px-2 py-2 text-center">#</TableHead>
              {spec.columns.map((column) => <TableHead key={column.fieldname} className="min-w-36 px-2 py-2">{column.label}{column.required ? " *" : ""}</TableHead>)}
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {effectiveRows.map((row, rowIndex) => (
              <TableRow key={`${actionName}-${spec.fieldname}-${rowIndex}`}>
                <TableCell className="text-center text-xs text-muted-foreground">{rowIndex + 1}</TableCell>
                {spec.columns.map((column, columnIndex) => {
                  const field = toDocField(column);
                  const Control = registry.resolve(field.fieldtype);
                  const id = `matrix-action-${actionName}-${spec.fieldname}-${rowIndex}-${column.fieldname}`;
                  return (
                    <TableCell key={column.fieldname} className="p-1.5" onPaste={(event) => paste(event, rowIndex, columnIndex)}>
                      {Control ? (
                        <Control
                          field={field}
                          value={row[column.fieldname] ?? ""}
                          onChange={(next: unknown) => changeCell(rowIndex, column.fieldname, next)}
                          id={id}
                          required={column.required}
                          services={services}
                          {...(column.fieldtype === "Link" && column.options ? { linkTarget: column.options } : {})}
                          docValues={row}
                        />
                      ) : (
                        <Input id={id} value={String(row[column.fieldname] ?? "")} onChange={(event) => changeCell(rowIndex, column.fieldname, event.target.value)} />
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="p-1.5 text-right"><Button type="button" variant="ghost" size="sm" onClick={() => removeRow(rowIndex)}>Xóa</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function initialValues(action: MatrixActionRef): Values {
  const values: Values = {};
  for (const field of action.fields ?? []) if (field.default != null) values[field.fieldname] = field.default;
  for (const table of action.inputTables ?? []) values[table.fieldname] = Array.from({ length: table.minRows }, () => blankRow(table));
  return values;
}

function blankRow(table: MatrixActionInputTable): Values {
  return Object.fromEntries(table.columns.flatMap((column) => column.default == null ? [] : [[column.fieldname, column.default]]));
}

function missingInputs(action: MatrixActionRef, values: Values): string[] {
  const missing: string[] = [];
  for (const field of action.fields ?? []) if (field.required && empty(values[field.fieldname])) missing.push(field.label);
  for (const table of action.inputTables ?? []) {
    const rows = Array.isArray(values[table.fieldname]) ? values[table.fieldname] as Values[] : [];
    if (rows.length < table.minRows) missing.push(`${table.label}: cần ít nhất ${table.minRows} dòng`);
    rows.forEach((row, rowIndex) => table.columns.forEach((column) => {
      if (column.required && empty(row[column.fieldname])) missing.push(`${table.label} dòng ${rowIndex + 1} · ${column.label}`);
    }));
  }
  return missing;
}

function toDocField(field: MatrixActionInputField): DocField {
  return {
    fieldname: field.fieldname,
    label: field.label,
    fieldtype: field.fieldtype as Fieldtype,
    ...(field.options ? { options: field.options } : {}),
    ...(field.required ? { reqd: 1 as const } : {}),
    ...(field.default == null ? {} : { default: field.default }),
  };
}

function empty(value: unknown): boolean { return value == null || (typeof value === "string" && !value.trim()); }
function coerce(raw: string, field: MatrixActionInputField): unknown {
  const value = raw.trim();
  if (["Int", "Float", "Currency", "Percent"].includes(field.fieldtype)) {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (field.fieldtype === "Check") return /^(1|true|yes|có|co|x)$/i.test(value) ? 1 : 0;
  return value;
}
