import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@metaforge/ui";

export interface AllocationTimelineColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface AllocationTimelineWindow {
  window_id: string;
  sequence: number;
  status: "Open" | "Settled" | "Reversed";
  tolerance: string;
  nominal_qty: string;
  received_qty: string;
  remaining_qty: string;
  minimum_qty: string | null;
  maximum_qty: string | null;
  shortage_variance: string | null;
  overage_variance: string | null;
  reason: string | null;
}

export interface AllocationTimeline {
  kind: "purchase_allocation_timeline";
  doctype: "Purchase Order" | "Purchase Receipt";
  name: string;
  title: string;
  description: string;
  columns: AllocationTimelineColumn[];
  rows: Array<Record<string, unknown>>;
  summary: Array<{ label: string; value: string }>;
  windows: AllocationTimelineWindow[];
}

export interface AllocationTimelineDialogProps {
  open: boolean;
  timeline: AllocationTimeline | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export function AllocationTimelineDialog(props: AllocationTimelineDialogProps) {
  const { open, timeline, loading, error, onClose } = props;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !loading) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[min(97vw,1180px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>{timeline?.title ?? "Dòng thời gian phân bổ"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {timeline?.description ?? "Đọc trực tiếp từ allocation ledger của máy chủ."}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {loading ? (
            <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">Đang tải dòng thời gian…</div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : !timeline ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              FIFO chưa được kích hoạt hoặc chứng từ chưa có dữ liệu phân bổ.
            </div>
          ) : (
            <>
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                {timeline.summary.map((entry) => (
                  <div key={entry.label} className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{entry.label}</dt>
                    <dd className="mt-1 font-semibold tabular-nums">{entry.value}</dd>
                  </div>
                ))}
              </dl>

              {timeline.windows.length ? (
                <section aria-label="Cửa sổ tất toán">
                  <h3 className="mb-2 text-sm font-semibold">Cửa sổ tất toán</h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {timeline.windows.map((window) => (
                      <article key={window.window_id} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold">Cửa sổ #{window.sequence}</div>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{statusLabel(window.status)}</span>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                          <Metric label="Dung sai" value={window.tolerance} />
                          <Metric label="Danh nghĩa" value={window.nominal_qty} />
                          <Metric label="Đã nhận" value={window.received_qty} />
                          <Metric label="Còn lại" value={window.remaining_qty} />
                          <Metric label="Cận dưới" value={window.minimum_qty} />
                          <Metric label="Cận trên" value={window.maximum_qty} />
                          <Metric label="Thiếu" value={window.shortage_variance} />
                          <Metric label="Vượt" value={window.overage_variance} />
                        </dl>
                        {window.reason ? <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">{window.reason}</p> : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section aria-label="Sự kiện phân bổ">
                <h3 className="mb-2 text-sm font-semibold">Sự kiện ledger</h3>
                {timeline.rows.length ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[1120px] text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          {timeline.columns.map((column) => (
                            <th
                              key={column.key}
                              className={column.align === "right" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 text-left font-medium"}
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timeline.rows.map((row, rowIndex) => (
                          <tr key={String(row.row_id ?? rowIndex)} className="border-t align-top">
                            {timeline.columns.map((column) => (
                              <td
                                key={column.key}
                                className={column.align === "right" ? "whitespace-nowrap px-3 py-2 text-right tabular-nums" : "px-3 py-2"}
                              >
                                {timelineCell(column.key, row[column.key])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    Chưa có sự kiện ledger cho chứng từ này.
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t px-5 py-3">
          <Button type="button" variant="outline" disabled={loading} onClick={onClose}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric(props: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{props.value ?? "—"}</dd>
    </div>
  );
}

function timelineCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "event_at") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return date.toLocaleString("vi-VN");
  }
  return String(value);
}

function statusLabel(status: AllocationTimelineWindow["status"]): string {
  if (status === "Open") return "Đang mở";
  if (status === "Settled") return "Đã tất toán";
  return "Đã đảo tất toán";
}
