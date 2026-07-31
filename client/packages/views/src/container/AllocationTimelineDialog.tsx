import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Doc } from "@metaforge/core";
import { NO_CAPS, type Capabilities } from "@metaforge/adapter-frappe";
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
  toast,
} from "@metaforge/ui";
import { useMetaForge } from "./provider.js";
import {
  PurchaseAllocationActionDialog,
  type PurchaseAllocationActionRow,
  type PurchaseAllocationActionSubmission,
  type PurchaseAllocationActionTarget,
  type PurchaseAllocationActionWindow,
} from "./PurchaseAllocationActionDialog.js";
import {
  PurchaseSupplierDebtReportDialog,
  type PurchaseSupplierDebtReport,
} from "./PurchaseSupplierDebtReportDialog.js";

export interface AllocationTimelineColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface AllocationTimelineWindow extends PurchaseAllocationActionWindow {}

export interface AllocationTimelineRow extends PurchaseAllocationActionRow {
  event_at: string;
  receipt_row: string | null;
  barem_weight_kg: string | null;
  actual_weight_kg: string | null;
  actor: string;
  reason: string | null;
}

export interface AllocationTimeline {
  kind: "purchase_allocation_timeline";
  doctype: "Purchase Order" | "Purchase Receipt";
  name: string;
  title: string;
  description: string;
  columns: AllocationTimelineColumn[];
  rows: AllocationTimelineRow[];
  summary: Array<{ label: string; value: string }>;
  windows: AllocationTimelineWindow[];
  supplier_debt_reports?: PurchaseSupplierDebtReport[];
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
  const { adapter, scopeKey } = useMetaForge();
  const queryClient = useQueryClient();
  const [displayTimeline, setDisplayTimeline] = useState<AllocationTimeline | null>(timeline);
  const [settlementCaps, setSettlementCaps] = useState<Capabilities>(NO_CAPS);
  const [overrideCaps, setOverrideCaps] = useState<Capabilities>(NO_CAPS);
  const [action, setAction] = useState<PurchaseAllocationActionTarget | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    setDisplayTimeline(timeline);
  }, [timeline]);

  useEffect(() => {
    if (!open) {
      setSettlementCaps(NO_CAPS);
      setOverrideCaps(NO_CAPS);
      setAction(null);
      setReportOpen(false);
      return;
    }
    let active = true;
    Promise.allSettled([
      adapter.getCapabilities("Purchase Settlement"),
      adapter.getCapabilities("Purchase Allocation Override"),
    ]).then(([settlement, override]) => {
      if (!active) return;
      setSettlementCaps(settlement.status === "fulfilled" ? settlement.value : NO_CAPS);
      setOverrideCaps(override.status === "fulfilled" ? override.value : NO_CAPS);
    }).catch(() => {
      if (!active) return;
      setSettlementCaps(NO_CAPS);
      setOverrideCaps(NO_CAPS);
    });
    return () => { active = false; };
  }, [adapter, open]);

  const canSettle = settlementCaps.create && settlementCaps.submit;
  const canOverride = overrideCaps.create && overrideCaps.submit;
  const effectiveTimeline = displayTimeline ?? timeline;

  const submitAction = async (submission: PurchaseAllocationActionSubmission) => {
    if (!effectiveTimeline) return;
    setActionSaving(true);
    try {
      const created = await adapter.createDoc(
        submission.doctype,
        submission.document as Partial<Doc>,
      );
      await adapter.submit(created);
      toast.success(submission.successMessage);
      setAction(null);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "doc", effectiveTimeline.doctype, effectiveTimeline.name],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "list-view", submission.doctype],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "list", submission.doctype],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "overview"],
          refetchType: "none",
        }),
      ]);

      const refreshed = await adapter.callGet<AllocationTimeline | null>(
        "metaforge.api.get_purchase_allocation_timeline",
        { doctype: effectiveTimeline.doctype, name: effectiveTimeline.name },
      );
      setDisplayTimeline(refreshed);
    } catch (caught) {
      toast.error(adapter.mapError(caught).message);
    } finally {
      setActionSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !loading && !actionSaving) onClose(); }}>
        <DialogContent className="flex max-h-[92vh] w-[min(97vw,1180px)] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-4">
            <DialogTitle>{effectiveTimeline?.title ?? "Dòng thời gian phân bổ"}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {effectiveTimeline?.description ?? "Đọc trực tiếp từ allocation ledger của máy chủ."}
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
            {loading ? (
              <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">Đang tải dòng thời gian…</div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            ) : !effectiveTimeline ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                FIFO chưa được kích hoạt hoặc chứng từ chưa có dữ liệu phân bổ.
              </div>
            ) : (
              <>
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  {effectiveTimeline.summary.map((entry) => (
                    <div key={entry.label} className="rounded-lg border px-3 py-2">
                      <dt className="text-xs text-muted-foreground">{entry.label}</dt>
                      <dd className="mt-1 font-semibold tabular-nums">{entry.value}</dd>
                    </div>
                  ))}
                </dl>

                {effectiveTimeline.windows.length ? (
                  <section aria-label="Cửa sổ tất toán">
                    <h3 className="mb-2 text-sm font-semibold">Cửa sổ tất toán</h3>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {effectiveTimeline.windows.map((window) => (
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
                          {canSettle && window.status === "Open" ? (
                            <div className="mt-3 flex justify-end border-t pt-3">
                              <Button type="button" size="sm" onClick={() => setAction({ kind: "close", window })}>
                                Đóng cửa sổ
                              </Button>
                            </div>
                          ) : null}
                          {canSettle && window.status === "Settled" ? (
                            <div className="mt-3 flex justify-end border-t pt-3">
                              <Button type="button" size="sm" variant="destructive" onClick={() => setAction({ kind: "reverse", window })}>
                                Đảo tất toán
                              </Button>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section aria-label="Sự kiện phân bổ">
                  <h3 className="mb-2 text-sm font-semibold">Sự kiện ledger</h3>
                  {effectiveTimeline.rows.length ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table unwrapped className="w-full min-w-[1180px] text-sm">
                        <TableHeader className="bg-muted/60 text-muted-foreground">
                          <TableRow>
                            {effectiveTimeline.columns.map((column) => (
                              <TableHead
                                key={column.key}
                                className={column.align === "right" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 text-left font-medium"}
                              >
                                {column.label}
                              </TableHead>
                            ))}
                            {canOverride ? <TableHead className="px-3 py-2 text-right font-medium">Thao tác</TableHead> : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {effectiveTimeline.rows.map((row, rowIndex) => (
                            <TableRow key={String(row.row_id ?? rowIndex)} className="align-top">
                              {effectiveTimeline.columns.map((column) => (
                                <TableCell
                                  key={column.key}
                                  className={column.align === "right" ? "whitespace-nowrap px-3 py-2 text-right tabular-nums" : "px-3 py-2"}
                                >
                                  {timelineCell(column.key, row[column.key as keyof AllocationTimelineRow])}
                                </TableCell>
                              ))}
                              {canOverride ? (
                                <TableCell className="whitespace-nowrap px-3 py-2 text-right">
                                  {isOverrideSource(row) ? (
                                    <Button type="button" size="sm" variant="outline" onClick={() => setAction({ kind: "override", row })}>
                                      Điều chỉnh
                                    </Button>
                                  ) : null}
                                </TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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

          <div className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={loading || !effectiveTimeline}
              onClick={() => setReportOpen(true)}
            >
              Công nợ NCC
            </Button>
            <Button type="button" variant="outline" disabled={loading || actionSaving} onClick={onClose}>Đóng</Button>
          </div>
        </DialogContent>
      </Dialog>

      <PurchaseAllocationActionDialog
        target={action}
        saving={actionSaving}
        onCancel={() => setAction(null)}
        onSubmit={(submission) => { void submitAction(submission); }}
      />
      <PurchaseSupplierDebtReportDialog
        open={reportOpen}
        reports={effectiveTimeline?.supplier_debt_reports ?? []}
        onClose={() => setReportOpen(false)}
      />
    </>
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

function isOverrideSource(row: AllocationTimelineRow): boolean {
  if (!row.purchase_receipt || !row.purchase_order || !row.purchase_order_row) return false;
  if (!row.window.includes("Đang mở")) return false;
  if (!Number.isFinite(Number(row.qty)) || Number(row.qty) <= 0) return false;
  return row.event === "Phân bổ FIFO"
    || row.event === "Phân bổ thủ công"
    || row.event === "Áp phiếu nhập chờ";
}
