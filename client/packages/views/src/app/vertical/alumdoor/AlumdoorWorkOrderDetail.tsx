/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Boxes, ExternalLink, Factory, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import type { Doc } from "@metaforge/core";
import {
  Badge,
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
import { useMetaForge } from "../../../container/provider.js";

type Json = Record<string, unknown>;
interface MaterialRow extends Json { bom_row_id: string; item_code: string; source_warehouse: string; required_qty: string; issued_qty: string; consumed_qty: string; remaining_to_issue: string; remaining_to_consume: string; }
interface WorkOrderLifecycle extends Json {
  schema_version: 1; work_order: string; docstatus: 0 | 1 | 2; canonical_status: string; stage: string; release_authority: string;
  production_item: string; target_qty: string; target_qty_micros: number; produced_qty: string; produced_qty_micros: number; remaining_qty: string; remaining_qty_micros: number;
  material_rows: MaterialRow[]; actions: { can_issue_materials?: boolean; can_manufacture?: boolean; can_cancel_work_order?: boolean }; warnings: string[];
  production_request?: string; production_request_line_key?: string; production_plan?: string; production_plan_row_id?: string; sales_order?: string; sales_order_row_id?: string;
}
interface WorkOrderCaps { read: boolean; write: boolean; create: boolean; delete: boolean; submit: boolean; cancel: boolean; amend: boolean; }
export interface AlumdoorWorkOrderDetailProps { name: string; onNavigate: (path: string) => void; }
const stageLabel: Record<string, string> = { DRAFT: "Nháp", RELEASED: "Đã phát hành", MATERIAL_ISSUED: "Đã cấp vật tư", MANUFACTURING: "Đang sản xuất", PARTIAL_FINISHED_GOODS: "Nhập thành phẩm một phần", FINISHED_GOODS_COMPLETE: "Hoàn thành", CANCELLED: "Đã huỷ" };
const NO_CAPS: WorkOrderCaps = { read: false, write: false, create: false, delete: false, submit: false, cancel: false, amend: false };

export function AlumdoorWorkOrderDetail({ name, onNavigate }: AlumdoorWorkOrderDetailProps) {
  const { adapter } = useMetaForge();
  const [document, setDocument] = useState<Doc | null>(null);
  const [lifecycle, setLifecycle] = useState<WorkOrderLifecycle | null>(null);
  const [caps, setCaps] = useState<WorkOrderCaps>(NO_CAPS);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [docResult, lifecycleResult, capabilities] = await Promise.all([
        adapter.getDoc("Work Order", name),
        adapter.callPost<WorkOrderLifecycle>("metaforge.manufacturing.get_work_order_lifecycle", { work_order: name }),
        adapter.getCapabilities("Work Order", name),
      ]);
      setDocument(docResult.doc);
      setLifecycle(lifecycleResult);
      setCaps(capabilities);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setBusy(false); }
  }, [adapter, name]);

  useEffect(() => { void load(); }, [load]);

  const submitWorkOrder = async () => {
    if (!document || Number(document.docstatus ?? 0) !== 0 || !caps.submit) return;
    setActionBusy(true);
    try {
      await adapter.submit(document);
      toast.success("Đã ghi sổ phiếu sản xuất.");
      await load();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const cancelWorkOrder = async () => {
    if (!lifecycle?.actions.can_cancel_work_order || !caps.cancel) return;
    setActionBusy(true);
    try {
      await adapter.cancel("Work Order", name);
      setConfirmCancel(false);
      toast.success("Đã huỷ phiếu sản xuất.");
      await load();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setActionBusy(false);
    }
  };

  if (!lifecycle && busy) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Đang đọc lệnh sản xuất…</div>;
  const progress = lifecycle && lifecycle.target_qty_micros > 0 ? Math.max(0, Math.min(100, Math.round(lifecycle.produced_qty_micros * 100 / lifecycle.target_qty_micros))) : 0;
  const canSubmit = Boolean(document && Number(document.docstatus ?? 0) === 0 && caps.submit);
  const canCancel = Boolean(lifecycle?.actions.can_cancel_work_order && caps.cancel);

  return <>
    <div className="h-full overflow-auto bg-background p-4 sm:p-5" data-surface="alumdoor-work-order-detail">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Phiếu sản xuất {name}</h2>{lifecycle && <Badge variant="outline">{stageLabel[lifecycle.stage] ?? lifecycle.stage}</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{lifecycle?.production_item || text(document?.production_item) || "—"} · authority {lifecycle?.release_authority || "—"}</p></div>
        <div className="flex flex-wrap gap-2">
          {canSubmit && <Button size="sm" onClick={() => void submitWorkOrder()} disabled={actionBusy}><Send className="size-4" /> Ghi sổ</Button>}
          {canCancel && <Button variant="destructive" size="sm" onClick={() => setConfirmCancel(true)} disabled={actionBusy}><XCircle className="size-4" /> Huỷ</Button>}
          {lifecycle?.production_request && <Button variant="outline" size="sm" onClick={() => onNavigate(`/app/${encodeURIComponent("Production Request")}/${encodeURIComponent(lifecycle.production_request!)}`)}>Yêu cầu SX <ExternalLink className="size-3.5" /></Button>}
          {lifecycle?.production_plan && <Button variant="outline" size="sm" onClick={() => onNavigate(`/app/${encodeURIComponent("Production Plan")}/${encodeURIComponent(lifecycle.production_plan!)}`)}>Kế hoạch SX <ExternalLink className="size-3.5" /></Button>}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy || actionBusy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Làm mới</Button>
        </div>
      </div>

      {lifecycle && <div className="mb-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs text-muted-foreground">Tiến độ thành phẩm</div><div className="mt-1 text-lg font-semibold tabular-nums">{qty(lifecycle.produced_qty)} / {qty(lifecycle.target_qty)}</div></div><Factory className="size-5 text-muted-foreground" /></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{progress}%</span><span>Còn {qty(lifecycle.remaining_qty)}</span></div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Nguồn phát hành</div><div className="mt-1 font-medium">{lineageLabel(lifecycle)}</div><div className="mt-3 text-xs text-muted-foreground">Trạng thái canonical</div><div className="mt-1 font-medium">{lifecycle.canonical_status}</div></div>
      </div>}

      {lifecycle?.warnings?.length ? <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3"><div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4" /> Cảnh báo evidence</div><div className="mt-2 flex flex-wrap gap-2">{lifecycle.warnings.map((warning) => <Badge key={warning} variant="outline" className="font-mono text-[11px]">{warning}</Badge>)}</div></div> : null}

      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border bg-card p-3">
        <Button variant="outline" disabled={!lifecycle?.actions.can_issue_materials || actionBusy} onClick={() => onNavigate(stockEntryList(name, "Material Transfer"))}><Boxes className="size-4" /> Cấp vật tư</Button>
        <Button variant="outline" disabled={!lifecycle?.actions.can_manufacture || actionBusy} onClick={() => onNavigate(stockEntryList(name, "Manufacture"))}><Factory className="size-4" /> Nhập thành phẩm</Button>
        <div className="ml-auto self-center text-xs text-muted-foreground">Nút chỉ mở khi lifecycle server cho phép; ghi sổ vẫn do Stock Entry authority.</div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-4 py-3"><h3 className="font-medium">Vật tư theo BOM snapshot</h3><p className="text-xs text-muted-foreground">Required / issued / consumed lấy từ Work Order + Stock Entry đã ghi sổ; React không tự cộng sổ kho.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Dòng BOM</TableHead><TableHead>Vật tư</TableHead><TableHead>Kho nguồn</TableHead><TableHead className="text-right">Cần</TableHead><TableHead className="text-right">Đã cấp</TableHead><TableHead className="text-right">Đã dùng</TableHead><TableHead className="text-right">Còn cấp</TableHead><TableHead className="text-right">Còn tiêu hao</TableHead></TableRow></TableHeader><TableBody>
        {(lifecycle?.material_rows ?? []).map((row) => <TableRow key={row.bom_row_id}><TableCell className="font-mono text-xs">{row.bom_row_id}</TableCell><TableCell className="font-medium">{row.item_code}</TableCell><TableCell>{row.source_warehouse || "—"}</TableCell><TableCell className="text-right tabular-nums">{qty(row.required_qty)}</TableCell><TableCell className="text-right tabular-nums">{qty(row.issued_qty)}</TableCell><TableCell className="text-right tabular-nums">{qty(row.consumed_qty)}</TableCell><TableCell className="text-right tabular-nums">{qty(row.remaining_to_issue)}</TableCell><TableCell className="text-right tabular-nums">{qty(row.remaining_to_consume)}</TableCell></TableRow>)}
        {!lifecycle?.material_rows?.length && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">Chưa có snapshot vật tư hoặc lệnh chưa ở trạng thái cần cấp vật tư.</TableCell></TableRow>}
      </TableBody></Table></div></div>
    </div>

    <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
      <DialogContent>
        <DialogHeader><DialogTitle>Huỷ phiếu sản xuất {name}?</DialogTitle></DialogHeader>
        <div className="space-y-4 p-1 text-sm">
          <p className="text-muted-foreground">Server sẽ chỉ cho huỷ khi lifecycle hiện tại còn cho phép. Không xoá lineage; chứng từ chuyển sang trạng thái huỷ để giữ audit.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={actionBusy}>Không huỷ</Button><Button variant="destructive" onClick={() => void cancelWorkOrder()} disabled={actionBusy}>{actionBusy ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} Xác nhận huỷ</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
function lineageLabel(lifecycle: WorkOrderLifecycle): string { if (lifecycle.production_request) return `${lifecycle.production_request}${lifecycle.production_request_line_key ? ` · ${lifecycle.production_request_line_key}` : ""}`; if (lifecycle.production_plan) return `${lifecycle.production_plan}${lifecycle.production_plan_row_id ? ` · ${lifecycle.production_plan_row_id}` : ""}`; if (lifecycle.sales_order) return `${lifecycle.sales_order}${lifecycle.sales_order_row_id ? ` · ${lifecycle.sales_order_row_id}` : ""}`; return "Standalone"; }
function stockEntryList(workOrder: string, purpose: string): string { return `/app/${encodeURIComponent("Stock Entry")}?f_work_order=${encodeURIComponent(workOrder)}&f_purpose=${encodeURIComponent(purpose)}`; }
function qty(value: unknown): string { const number = Number(value); return Number.isFinite(number) ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(number) : text(value) || "0"; }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
