/** @jsxImportSource react */
import { useMemo, type ClipboardEvent } from "react";
import { Check, ClipboardPaste, RotateCcw, Save, Rows3 } from "lucide-react";
import type { Doc, DocField, BulkRenderPolicy } from "@metaforge/core";
import {
  Badge, Button, Checkbox, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";

export interface BulkGridViewProps {
  title: string;
  rows: Doc[];
  policy: BulkRenderPolicy;
  selected: Set<string>;
  dirty: Record<string, Record<string, unknown>>;
  errors?: Record<string, string>;
  saving?: boolean;
  writable?: boolean;
  onSelect: (name: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onCellChange: (name: string, fieldname: string, value: unknown) => void;
  onPasteMatrix: (rowIndex: number, columnIndex: number, matrix: string[][]) => void;
  onFillDown: (fieldname: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const EMPTY_SELECT = "__mf_bulk_empty__";
const NUMERIC_TYPES = new Set(["Int", "Float", "Currency", "Percent", "Duration", "Rating"]);

function optionValues(field: DocField): string[] {
  return String(field.options ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
}
function displayValue(row: Doc, patch: Record<string, unknown> | undefined, fieldname: string): unknown {
  return patch && Object.prototype.hasOwnProperty.call(patch, fieldname) ? patch[fieldname] : row[fieldname];
}
function inputValue(value: unknown): string { return value === null || value === undefined ? "" : String(value); }
function parseValue(field: DocField, value: string): unknown {
  if (NUMERIC_TYPES.has(field.fieldtype)) {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function BulkGridView(props: BulkGridViewViewProps) {
  const { rows, policy } = props;
  const allSelected = rows.length > 0 && rows.every((row) => props.selected.has(String(row.name)));
  const dirtyCount = Object.keys(props.dirty).length;
  const selectedCount = props.selected.size;
  const editableNames = useMemo(() => [...policy.editable], [policy.editable]);

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!policy.allowPaste || !props.writable) return;
    const target = event.target as HTMLElement;
    const row = Number(target.dataset.bulkRow);
    const column = Number(target.dataset.bulkColumn);
    if (!Number.isInteger(row) || !Number.isInteger(column)) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").split("\n").filter((line, index, values) => line !== "" || index < values.length - 1).map((line) => line.split("\t"));
    props.onPasteMatrix(row, column, matrix);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card" onPaste={paste}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Rows3 className="size-4 text-muted-foreground" /><h2 className="truncate text-sm font-semibold">{props.title}</h2><Badge variant="outline">Nhập hàng loạt</Badge></div>
          <p className="mt-0.5 text-xs text-muted-foreground">Sửa nhiều bản ghi rồi lưu theo optimistic concurrency. Ô do server sở hữu luôn chỉ đọc.</p>
        </div>
        {selectedCount > 0 && policy.allowFillDown && editableNames.length ? (
          <Select onValueChange={(fieldname) => props.onFillDown(fieldname)} disabled={!props.writable}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder={`Điền xuống (${selectedCount})`} /></SelectTrigger>
            <SelectContent>{editableNames.map((fieldname) => { const field = policy.columns.find((candidate) => candidate.fieldname === fieldname); return <SelectItem key={fieldname} value={fieldname}>{field?.label ?? fieldname}</SelectItem>; })}</SelectContent>
          </Select>
        ) : null}
        <Button variant="outline" size="sm" className="h-8" onClick={props.onDiscard} disabled={!dirtyCount || props.saving}><RotateCcw /> Bỏ thay đổi</Button>
        <Button size="sm" className="h-8" onClick={props.onSave} disabled={!props.writable || !dirtyCount || props.saving}>{props.saving ? <Save className="animate-pulse" /> : <Check />} Lưu {dirtyCount ? `(${dirtyCount})` : ""}</Button>
      </div>
      {policy.allowPaste ? <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"><ClipboardPaste className="size-3.5" /> Có thể dán vùng ô từ Excel/Google Sheets; chỉ các cột metadata cho phép mới nhận giá trị.</div> : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="min-w-max">
          <TableHeader className="sticky top-0 z-10 bg-card"><TableRow>
            <TableHead className="w-11 min-w-11 sticky left-0 z-20 bg-card"><Checkbox checked={allSelected} onCheckedChange={(value) => props.onSelectAll(value === true)} aria-label="Chọn tất cả" /></TableHead>
            <TableHead className="w-14 min-w-14">STT</TableHead>
            {policy.columns.map((field) => <TableHead key={field.fieldname} className="min-w-36 whitespace-nowrap">{field.label ?? field.fieldname}{policy.editable.has(field.fieldname) ? <span className="ml-1 text-primary">•</span> : null}</TableHead>)}
            <TableHead className="min-w-52">Trạng thái</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((row, rowIndex) => {
            const name = String(row.name); const patch = props.dirty[name];
            return <TableRow key={name} data-state={props.selected.has(name) ? "selected" : undefined}>
              <TableCell className="sticky left-0 z-10 bg-inherit"><Checkbox checked={props.selected.has(name)} onCheckedChange={(value) => props.onSelect(name, value === true)} aria-label={`Chọn ${name}`} /></TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{rowIndex + 1}</TableCell>
              {policy.columns.map((field, columnIndex) => {
                const value = displayValue(row, patch, field.fieldname); const editable = Boolean(props.writable && policy.editable.has(field.fieldname));
                return <TableCell key={field.fieldname} className="p-1.5">{editable ? <BulkCell field={field} value={value} rowIndex={rowIndex} columnIndex={columnIndex} onChange={(next) => props.onCellChange(name, field.fieldname, next)} /> : <span className="block max-w-72 truncate px-2 text-sm" title={inputValue(value)}>{inputValue(value) || "—"}</span>}</TableCell>;
              })}
              <TableCell>{props.errors?.[name] ? <span className="text-xs text-destructive">{props.errors[name]}</span> : patch ? <Badge variant="secondary">Chưa lưu</Badge> : <span className="text-xs text-muted-foreground">Đã đồng bộ</span>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div>
    </div>
  );
}

function BulkCell(props: { field: DocField; value: unknown; rowIndex: number; columnIndex: number; onChange: (value: unknown) => void }) {
  const marker = { "data-bulk-row": props.rowIndex, "data-bulk-column": props.columnIndex } as const;
  if (props.field.fieldtype === "Check") return <div className="flex h-8 items-center px-2" {...marker} tabIndex={0}><Checkbox checked={Boolean(props.value)} onCheckedChange={(value) => props.onChange(value === true ? 1 : 0)} /></div>;
  if (props.field.fieldtype === "Select" && optionValues(props.field).length) {
    const value = inputValue(props.value);
    return <Select value={value || EMPTY_SELECT} onValueChange={(next) => props.onChange(next === EMPTY_SELECT ? "" : next)}><SelectTrigger className="h-8 min-w-36" {...marker}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={EMPTY_SELECT}>—</SelectItem>{optionValues(props.field).map((option) => <SelectItem key={option} value={option}>{props.field.optionLabels?.[option] ?? option}</SelectItem>)}</SelectContent></Select>;
  }
  const type = NUMERIC_TYPES.has(props.field.fieldtype) ? "number" : props.field.fieldtype === "Date" ? "date" : props.field.fieldtype === "Datetime" ? "datetime-local" : "text";
  return <Input className="h-8 min-w-36" type={type} value={inputValue(props.value)} onChange={(event) => props.onChange(parseValue(props.field, event.target.value))} {...marker} />;
}
