import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";

export interface SubmitPreviewColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface SubmitPreview {
  kind: string;
  title: string;
  description?: string;
  confirmation_label?: string;
  warnings?: string[];
  columns?: SubmitPreviewColumn[];
  rows?: Array<Record<string, unknown>>;
  summary?: Array<{ label: string; value: string }>;
}

export interface SubmitPreviewDialogProps {
  preview: SubmitPreview | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function previewCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function SubmitPreviewDialog(props: SubmitPreviewDialogProps) {
  const { preview, saving, onCancel, onConfirm } = props;
  return (
    <Dialog
      open={Boolean(preview)}
      onOpenChange={(open) => { if (!open && !saving) onCancel(); }}
    >
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,980px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>{preview?.title ?? "Xác nhận gửi chứng từ"}</DialogTitle>
          {preview?.description ? (
            <p className="text-sm text-muted-foreground">{preview.description}</p>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {(preview?.warnings ?? []).map((warning) => (
            <div key={warning} className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              {warning}
            </div>
          ))}
          <div className="overflow-x-auto rounded-lg border">
            <Table unwrapped className="w-full min-w-[720px] text-sm">
              <TableHeader className="bg-muted/60 text-muted-foreground">
                <TableRow>
                  {(preview?.columns ?? []).map((column) => (
                    <TableHead
                      key={column.key}
                      className={column.align === "right" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 text-left font-medium"}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(preview?.rows ?? []).map((row, rowIndex) => (
                  <TableRow key={`${rowIndex}-${String(row.receipt_row ?? "row")}`}>
                    {(preview?.columns ?? []).map((column) => (
                      <TableCell
                        key={column.key}
                        className={column.align === "right" ? "px-3 py-2 text-right tabular-nums" : "px-3 py-2"}
                      >
                        {previewCell(row[column.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(preview?.summary ?? []).map((entry) => (
              <div key={entry.label} className="rounded-lg border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{entry.label}</dt>
                <dd className="mt-1 font-semibold tabular-nums">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Hủy
          </Button>
          <Button type="button" disabled={saving} onClick={onConfirm}>
            {saving ? "Đang xử lý…" : (preview?.confirmation_label ?? "Gửi chứng từ")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
