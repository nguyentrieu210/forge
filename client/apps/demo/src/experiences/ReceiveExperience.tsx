import { useCallback, useEffect, useState } from "react";
import { RefreshCw, PackageCheck, Send, Loader2, ArrowRight, CheckCircle2, AlertTriangle, CloudOff, Warehouse } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views";
import { MobileShell, TouchCard, BigButton, QtyStepper, useOfflineQueue } from "@metaforge/shell";
import { Badge, Button, toast, cn } from "@metaforge/ui";

/** Trạng thái phiếu → nhãn + màu badge. */
const STATUS: Record<string, { label: string; cls: string }> = {
  "Draft": { label: "Nháp", cls: "bg-muted text-muted-foreground" },
  "In Transit": { label: "Đang chuyển", cls: "bg-warning/15 text-warning" },
  "Received": { label: "Đã nhận", cls: "bg-success/15 text-success" },
  "Received with Discrepancy": { label: "Nhận lệch", cls: "bg-warning/15 text-warning" },
  "Cancelled": { label: "Huỷ", cls: "bg-destructive/15 text-destructive" },
};
function StatusBadge({ s }: { s: string }) {
  const m = STATUS[s] ?? { label: s, cls: "bg-muted text-muted-foreground" };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>;
}

interface TransferItem { name: string; item_code: string; item_name?: string; qty_issued: number; qty_received?: number; uom?: string; batch_no?: string; }
/** Descriptor SERVER-AUTHORITATIVE (aphvh.api.wms.get_transfer_actions) — KHÔNG suy nút chỉ từ
 * `status` như trước (review 453d322): quyền thao tác thật còn phụ thuộc company scope, lô Hold,
 * và người-nhận≠người-giao — những điều kiện CHỈ server biết chắc. */
interface TransferActions { can_issue: boolean; can_receive: boolean; issue_reason?: string | null; receive_reason?: string | null; }

/**
 * ReceiveExperience — App-mode "Kho: Nhận / Giao hàng" (touch-first, mobile/tablet).
 * Dùng chung adapter MetaForge + gọi API nghiệp vụ aphvh (transfer_issue/transfer_receive).
 * Khác Desk-mode: thẻ to, nút GIAO/NHẬN đáy màn, bước nhận sửa SL từng dòng.
 */
export function ReceiveExperience({ onExit }: { onExit?: () => void }) {
  const { adapter } = useMetaForge();
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Cùng key với TransferDetail — chỉ để ĐẾM số thao tác đang chờ gửi lại (mất mạng), hiện badge ở
  // đây cho thấy ngay từ danh sách, không cần mở lại từng phiếu mới biết còn thao tác dang dở.
  const issueQueue = useOfflineQueue<{ transfer: string }>("transfer-issue", (p) => adapter.callPost("aphvh.api.wms.transfer_issue", { transfer: p.transfer }));
  const receiveQueue = useOfflineQueue<{ transfer: string; received: string }>("transfer-receive", (p) => adapter.callPost("aphvh.api.wms.transfer_receive", { transfer: p.transfer, received: p.received }));
  const pendingCount = issueQueue.pending.length + receiveQueue.pending.length;

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await adapter.getList("Warehouse Transfer", {
        fields: ["name", "company", "source_warehouse", "target_warehouse", "status", "modified"],
        filters: { status: ["in", ["Draft", "In Transit", "Received", "Received with Discrepancy"]] },
        orderBy: "modified desc",
        pageLength: 50,
      });
      setRows(r);
    } catch (e) {
      setErr(adapter.mapError(e).message);
    }
  }, [adapter]);

  useEffect(() => { void load(); }, [load]);

  if (selected) {
    return <TransferDetail name={selected} onBack={() => setSelected(null)} onDone={() => { setSelected(null); void load(); }} />;
  }

  const actionable = (rows ?? []).filter((r) => r.status === "Draft" || r.status === "In Transit");
  return (
    <MobileShell
      title="Kho — Nhận / Giao hàng"
      subtitle={rows ? `${actionable.length} phiếu cần xử lý` : "Đang tải…"}
      onBack={onExit}
      right={
        <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => void load()} aria-label="Làm mới"><RefreshCw /></Button>
      }
    >
      {pendingCount > 0 ? (
        <div className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
          <CloudOff className="size-4 shrink-0" /> {pendingCount} thao tác đang chờ mạng để gửi lại
        </div>
      ) : null}
      {err ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{err}</div> : null}
      {!rows ? (
        <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
          <Warehouse className="size-10 opacity-40" /><div>Chưa có phiếu chuyển kho</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <TouchCard key={String(r.name)} onClick={() => setSelected(String(r.name))}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{String(r.name)}</span>
                <StatusBadge s={String(r.status)} />
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="truncate">{shortWh(r.source_warehouse)}</span>
                <ArrowRight className="size-3.5 shrink-0" />
                <span className="truncate">{shortWh(r.target_warehouse)}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{String(r.company)}</div>
            </TouchCard>
          ))}
        </div>
      )}
    </MobileShell>
  );
}

function TransferDetail({ name, onBack, onDone }: { name: string; onBack: () => void; onDone: () => void }) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [items, setItems] = useState<TransferItem[]>([]);
  const [recv, setRecv] = useState<Record<string, number>>({});
  const [actions, setActions] = useState<TransferActions | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Hàng đợi mất mạng — hiện trường kho mạng hay chập chờn, trước đây GIAO/NHẬN lỡ mất mạng là mất
  // thao tác, phải nhớ tự làm lại. Giờ tự lưu, tự gửi lại khi có mạng (packages/shell/app-mode).
  const issueQueue = useOfflineQueue<{ transfer: string }>(
    "transfer-issue",
    (p) => adapter.callPost("aphvh.api.wms.transfer_issue", { transfer: p.transfer }),
  );
  const receiveQueue = useOfflineQueue<{ transfer: string; received: string }>(
    "transfer-receive",
    (p) => adapter.callPost("aphvh.api.wms.transfer_receive", { transfer: p.transfer, received: p.received }),
  );

  const load = useCallback(async () => {
    setErr(null);
    setActions(null);
    try {
      const { doc: d } = await adapter.getDoc("Warehouse Transfer", name);
      setDoc(d);
      const its = (d.items as TransferItem[] | undefined) ?? [];
      setItems(its);
      // SL nhận mặc định = SL giao (nhận đủ). KHÔNG dùng qty_received (mặc định 0 → ?? không bắt).
      setRecv(Object.fromEntries(its.map((it) => [it.name, it.qty_issued || 0])));
      // Fail-closed: descriptor lỗi/chưa về → coi như KHÔNG được phép (không phỏng đoán theo status).
      try {
        const a = await adapter.callGet<TransferActions>("aphvh.api.wms.get_transfer_actions", { transfer: name });
        setActions(a);
      } catch {
        setActions({ can_issue: false, can_receive: false });
      }
    } catch (e) {
      setErr(adapter.mapError(e).message);
    }
  }, [adapter, name]);
  useEffect(() => { void load(); }, [load]);

  const status = doc ? String(doc.status) : "";
  const isDraft = status === "Draft";
  const isTransit = status === "In Transit";
  const canIssue = actions?.can_issue === true;
  const canReceive = actions?.can_receive === true;

  async function issue() {
    if (!canIssue) return; // guard 2 lớp (nút đã disabled) — server vẫn là chốt chặn thật
    setBusy(true);
    try {
      const outcome = await issueQueue.enqueue({ transfer: name });
      toast.success(outcome === "sent" ? "Đã GIAO — hàng đang ở kho trung chuyển" : "Mất mạng — đã lưu, sẽ tự gửi khi có mạng lại");
      onDone();
    } catch (e) { toast.error(adapter.mapError(e).message); setBusy(false); }
  }
  async function receive() {
    if (!canReceive) return; // guard 2 lớp (nút đã disabled) — server vẫn là chốt chặn thật
    setBusy(true);
    try {
      const rmap = Object.fromEntries(items.map((it) => [it.name, recv[it.name] ?? it.qty_issued]));
      const outcome = await receiveQueue.enqueue({ transfer: name, received: JSON.stringify(rmap) });
      toast.success(outcome === "sent" ? "Đã NHẬN hàng" : "Mất mạng — đã lưu, sẽ tự gửi khi có mạng lại");
      onDone();
    } catch (e) { toast.error(adapter.mapError(e).message); setBusy(false); }
  }

  return (
    <MobileShell
      title={name}
      subtitle={doc ? String(doc.company) : "Đang tải…"}
      onBack={onBack}
      right={doc ? <div className="pr-1"><StatusBadge s={status} /></div> : undefined}
      bottomBar={
        isDraft ? (
          <BigButton variant="success" onClick={issue} disabled={busy || !actions || !canIssue}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} GIAO HÀNG
          </BigButton>
        ) : isTransit ? (
          <BigButton variant="success" onClick={receive} disabled={busy || !actions || !canReceive}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <PackageCheck className="size-5" />} NHẬN HÀNG
          </BigButton>
        ) : (
          <BigButton variant="outline" onClick={onBack}><CheckCircle2 className="size-5" /> Xong</BigButton>
        )
      }
    >
      {err ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{err}</div> : null}
      {/* Lý do bị chặn — CHỈ server biết chắc (company scope/lô Hold/người-nhận≠người-giao), không suy đoán ở client. */}
      {isDraft && actions && !canIssue && actions.issue_reason ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" /> {actions.issue_reason}
        </div>
      ) : null}
      {isTransit && actions && !canReceive && actions.receive_reason ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" /> {actions.receive_reason}
        </div>
      ) : null}
      {doc ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="truncate font-medium">{shortWh(doc.source_warehouse)}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">{shortWh(doc.transit_warehouse)}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{shortWh(doc.target_warehouse)}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 px-1 text-sm font-medium text-muted-foreground">Dòng hàng ({items.length})</div>
            <div className="space-y-2.5">
              {items.map((it) => (
                <div key={it.name} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{it.item_code}</div>
                      {it.item_name ? <div className="truncate text-xs text-muted-foreground">{it.item_name}</div> : null}
                    </div>
                    <Badge variant="secondary" className="shrink-0 font-normal">Giao {it.qty_issued} {it.uom ?? ""}</Badge>
                  </div>
                  {isTransit ? (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">SL nhận</span>
                      <QtyStepper value={recv[it.name] ?? it.qty_issued} max={it.qty_issued} onChange={(v) => setRecv((m) => ({ ...m, [it.name]: v }))} />
                    </div>
                  ) : null}
                  {isTransit && (recv[it.name] ?? it.qty_issued) < it.qty_issued ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" /> Thiếu {it.qty_issued - (recv[it.name] ?? it.qty_issued)} → sẽ tạo phiếu chênh lệch</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>
      )}
    </MobileShell>
  );
}

/** "Nhận hàng APH - APH" → "Nhận hàng APH" (bỏ hậu tố abbr). */
function shortWh(v: unknown): string {
  const s = String(v ?? "");
  return s.replace(/\s*-\s*[^-]+$/, "") || s;
}
