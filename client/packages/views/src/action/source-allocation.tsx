/** @jsxImportSource react */
import type { ReactNode } from "react";
import { Button, Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metaforge/ui";

export interface SourceDocumentOption {
  id: string;
  label: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
}

export function SourceDocumentSelector(props: {
  documents: SourceDocumentOption[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
  empty?: ReactNode;
}) {
  const selectable = props.documents.filter((document) => !document.disabled).map((document) => document.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => props.selected.has(id));
  if (!props.documents.length) return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{props.empty ?? "Không có chứng từ nguồn phù hợp."}</div>;
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-source-document-selector>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Chứng từ nguồn</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Chỉ các chứng từ cùng đối tác, công ty và tiền tệ mới được chọn chung.</p>
        </div>
        {props.onSelectAll ? <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectAll?.(allSelected ? [] : selectable)}>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</Button> : null}
      </div>
      <Table unwrapped className="w-full text-sm">
        <TableHeader className="bg-muted/40">
          <TableRow><TableHead className="w-12 px-3 py-2" /><TableHead className="px-3 py-2">Chứng từ</TableHead><TableHead className="px-3 py-2">Thông tin</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {props.documents.map((document) => (
            <TableRow key={document.id} className={document.disabled ? "opacity-50" : "cursor-pointer"} onClick={() => { if (!document.disabled) props.onToggle(document.id); }}>
              <TableCell className="px-3 py-2" onClick={(event) => event.stopPropagation()}><Checkbox aria-label={`Chọn ${document.id}`} checked={props.selected.has(document.id)} disabled={document.disabled} onCheckedChange={() => props.onToggle(document.id)} /></TableCell>
              <TableCell className="px-3 py-2"><div className="font-semibold">{document.label}</div>{document.secondary ? <div className="text-xs text-muted-foreground">{document.secondary}</div> : null}</TableCell>
              <TableCell className="px-3 py-2 text-xs text-muted-foreground">{document.meta ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export interface AllocationColumn<Row> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
}

export function SourceLineAllocator<Row>(props: {
  rows: Row[];
  columns: Array<AllocationColumn<Row>>;
  rowKey: (row: Row, index: number) => string;
  title?: string;
  description?: string;
  empty?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-source-line-allocator>
      <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{props.title ?? "Phân bổ dòng nguồn"}</h2>{props.description ? <p className="mt-0.5 text-xs text-muted-foreground">{props.description}</p> : null}</div>
      {props.rows.length ? <div className="overflow-x-auto"><Table unwrapped className="w-full min-w-[900px] text-sm"><TableHeader className="bg-muted/40"><TableRow>{props.columns.map((column) => <TableHead key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right" : "text-left"}`}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{props.rows.map((row, index) => <TableRow key={props.rowKey(row, index)}>{props.columns.map((column) => <TableCell key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right tabular-nums" : ""}`}>{column.render(row)}</TableCell>)}</TableRow>)}</TableBody></Table></div> : <div className="px-4 py-8 text-center text-sm text-muted-foreground">{props.empty ?? "Chưa có dòng nguồn được chọn."}</div>}
    </section>
  );
}

export interface InventoryAllocationRow {
  key: string;
  source: ReactNode;
  item: ReactNode;
  layer: ReactNode;
  quantity: ReactNode;
  cost?: ReactNode;
}

export function InventoryAllocationPreview(props: { rows: InventoryAllocationRow[]; title?: string; description?: string }) {
  return <SourceLineAllocator
    rows={props.rows}
    rowKey={(row) => row.key}
    title={props.title ?? "Xem trước phân bổ tồn kho"}
    description={props.description ?? "Thứ tự lớp chỉ là bản xem trước; máy chủ tính lại và chốt trong giao dịch submit."}
    empty="Chưa có lớp tồn được phân bổ."
    columns={[
      { key: "source", label: "Nguồn nghiệp vụ", render: (row) => row.source },
      { key: "item", label: "Mặt hàng", render: (row) => row.item },
      { key: "layer", label: "Lớp tồn / lô", render: (row) => row.layer },
      { key: "quantity", label: "Số lượng", align: "right", render: (row) => row.quantity },
      { key: "cost", label: "Giá vốn", align: "right", render: (row) => row.cost ?? "—" },
    ]}
  />;
}
