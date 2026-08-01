import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, FileLock2, Loader2, RefreshCw, Scale, ShieldAlert } from "lucide-react";
import { useMetaForge } from "@metaforge/views/provider";
import { useBusinessContext } from "@metaforge/shell";
import {
  Badge, Button, Input, Label, Skeleton, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, Textarea, toast,
} from "@metaforge/ui";

interface SnapshotResult {
  snapshot_id: string;
  source_fingerprint: string;
  line_count: number;
  existing: boolean;
  frozen: boolean;
}

interface LedgerRow {
  snapshot_id: string;
  line_key: string;
  domain: string;
  source_type: string;
  source_ref: string;
  metric: string;
  adjusted_quantity_micros: number;
  adjusted_amount_minor: number;
  currency: string;
  adjustment_count: number;
  frozen_at?: string | null;
}

interface Reconciliation {
  ok: boolean;
  mismatches: Array<{ kind: string; domain: string; line_key: string }>;
  truncated: boolean;
}

const DOMAIN_LABEL: Record<string, string> = {
  Sales: "Bán hàng",
  Purchase: "Mua hàng",
  Inventory: "Kho",
  Manufacturing: "Sản xuất",
  Warranty: "Bảo hành / lỗi",
  Finance: "Tài chính",
};

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: currency || "VND", maximumFractionDigits: 0 }).format(value);
}

function quantity(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value / 1_000_000);
}

export function DailyDetailedLedger() {
  const { adapter } = useMetaForge();
  const business = useBusinessContext();
  const selectedCompany = typeof business.selection.company === "string" ? business.selection.company : "";
  const [ledgerDate, setLedgerDate] = useState(today);
  const [company, setCompany] = useState(selectedCompany);
  const [warehouse, setWarehouse] = useState("");
  const [customer, setCustomer] = useState("");
  const [salesOrder, setSalesOrder] = useState("");
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState("");
  const [deltaQty, setDeltaQty] = useState("");
  const [deltaAmount, setDeltaAmount] = useState("");

  const context = useMemo(() => ({
    ledger_date: ledgerDate,
    company,
    warehouse,
    customer,
    sales_order: salesOrder,
  }), [company, customer, ledgerDate, salesOrder, warehouse]);

  const loadRows = useCallback(async (snapshotId: string) => {
    const result = await adapter.callPost<LedgerRow[]>("metaforge.accounts.daily_detailed_ledger", { snapshot_id: snapshotId });
    setRows(result);
    if (!selectedLine && result[0]) setSelectedLine(result[0].line_key);
  }, [adapter, selectedLine]);

  const run = useCallback(async (operation: string, task: () => Promise<void>) => {
    setBusy(operation);
    setError(null);
    try {
      await task();
    } catch (caught) {
      const message = adapter.mapError(caught).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }, [adapter]);

  const generate = () => void run("generate", async () => {
    if (!company.trim()) throw new Error("Vui lòng chọn công ty trước khi cập nhật sổ.");
    const result = await adapter.callPost<SnapshotResult>("metaforge.accounts.daily_ledger_generate", context);
    setSnapshot(result);
    setReconciliation(null);
    await loadRows(result.snapshot_id);
    toast.success(result.existing ? "Đã mở ảnh chụp dữ liệu hiện có." : `Đã cập nhật ${result.line_count} dòng vào sổ.`);
  });

  const reconcile = () => void run("reconcile", async () => {
    const result = await adapter.callPost<Reconciliation>("metaforge.accounts.daily_ledger_reconcile", context);
    setReconciliation(result);
    if (result.ok) toast.success("Sổ khớp với dữ liệu nguồn.");
    else toast.warning(`Phát hiện ${result.mismatches.length} chênh lệch.`);
  });

  const freeze = () => void run("freeze", async () => {
    if (!snapshot) return;
    await adapter.callPost("metaforge.accounts.daily_ledger_freeze", { snapshot_id: snapshot.snapshot_id, reason: freezeReason });
    setSnapshot({ ...snapshot, frozen: true });
    await loadRows(snapshot.snapshot_id);
    toast.success("Đã khóa sổ. Các thay đổi sau đây chỉ được ghi bằng bút toán điều chỉnh.");
  });

  const adjust = () => void run("adjust", async () => {
    if (!snapshot || !selectedLine) return;
    if (!adjustReason.trim()) throw new Error("Điều chỉnh bắt buộc phải có lý do.");
    const qty = Math.round(Number(deltaQty || 0) * 1_000_000);
    const amount = Math.round(Number(deltaAmount || 0));
    if (!Number.isSafeInteger(qty) || !Number.isSafeInteger(amount) || (qty === 0 && amount === 0)) {
      throw new Error("Nhập số lượng hoặc số tiền điều chỉnh hợp lệ.");
    }
    await adapter.callPost("metaforge.accounts.daily_ledger_adjust", {
      adjustment_id: crypto.randomUUID(),
      snapshot_id: snapshot.snapshot_id,
      line_key: selectedLine,
      reason: adjustReason,
      delta_quantity_micros: qty,
      delta_amount_minor: amount,
    });
    setAdjustReason(""); setDeltaQty(""); setDeltaAmount("");
    await loadRows(snapshot.snapshot_id);
    toast.success("Đã ghi điều chỉnh vào lịch sử bất biến.");
  });

  return (
    <div className="h-full overflow-auto bg-background p-3 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1440px] space-y-4">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><FileLock2 className="size-5 text-primary" /><h1 className="text-xl font-semibold">Sổ chi tiết hằng ngày</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">Ảnh chụp bất biến từ bán hàng, mua hàng, kho, sản xuất, bảo hành và tài chính.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} disabled={Boolean(busy)}>{busy === "generate" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Cập nhật sổ</Button>
            <Button variant="outline" onClick={reconcile} disabled={Boolean(busy) || !snapshot}><Scale className="mr-2 size-4" />Đối chiếu</Button>
          </div>
        </header>

        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Ngày sổ"><Input type="date" value={ledgerDate} onChange={(event) => setLedgerDate(event.target.value)} /></Field>
          <Field label="Công ty"><Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Bắt buộc" /></Field>
          <Field label="Kho"><Input value={warehouse} onChange={(event) => setWarehouse(event.target.value)} placeholder="Tất cả" /></Field>
          <Field label="Khách hàng"><Input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Tất cả" /></Field>
          <Field label="Đơn bán"><Input value={salesOrder} onChange={(event) => setSalesOrder(event.target.value)} placeholder="Tất cả" /></Field>
        </section>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><ShieldAlert className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
        {reconciliation ? <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${reconciliation.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}><CheckCircle2 className="size-4" />{reconciliation.ok ? "Dữ liệu nguồn và ảnh chụp đang khớp." : `${reconciliation.mismatches.length} dòng chênh lệch; hãy cập nhật ảnh chụp mới trước khi khóa.`}</div> : null}

        {busy === "generate" && rows === null ? <div className="space-y-2 rounded-xl border p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div> : rows === null ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center"><FileLock2 className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 font-medium">Chưa có ảnh chụp cho ngày này</h2><p className="mt-1 text-sm text-muted-foreground">Chọn phạm vi rồi bấm “Cập nhật sổ”.</p></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">Không có phát sinh phù hợp với phạm vi đã chọn.</div>
        ) : <LedgerRows rows={rows} selectedLine={selectedLine} onSelect={setSelectedLine} />}

        {snapshot ? <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Khóa ảnh chụp</h2><Badge variant={snapshot.frozen ? "secondary" : "outline"}>{snapshot.frozen ? "Đã khóa" : "Chưa khóa"}</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">Mã: {snapshot.snapshot_id}</p>
            <Textarea className="mt-3" value={freezeReason} onChange={(event) => setFreezeReason(event.target.value)} placeholder="Lý do khóa (khuyến nghị)" disabled={snapshot.frozen} />
            <Button className="mt-3" variant="outline" onClick={freeze} disabled={Boolean(busy) || snapshot.frozen}><FileLock2 className="mr-2 size-4" />Khóa sổ</Button>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Điều chỉnh sau khóa</h2>
            <p className="mt-1 text-xs text-muted-foreground">Chọn một dòng trong bảng; bản gốc không bị sửa.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Chênh lệch số lượng"><Input type="number" step="0.001" value={deltaQty} onChange={(event) => setDeltaQty(event.target.value)} /></Field><Field label="Chênh lệch tiền"><Input type="number" step="1" value={deltaAmount} onChange={(event) => setDeltaAmount(event.target.value)} /></Field></div>
            <Textarea className="mt-3" value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Lý do điều chỉnh (bắt buộc)" />
            <Button className="mt-3" onClick={adjust} disabled={Boolean(busy) || !snapshot.frozen || !selectedLine}>Ghi điều chỉnh</Button>
          </div>
        </section> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function LedgerRows({ rows, selectedLine, onSelect }: { rows: LedgerRow[]; selectedLine: string; onSelect: (line: string) => void }) {
  return <section className="rounded-xl border bg-card">
    <div className="hidden overflow-auto md:block"><Table>
      <TableHeader><TableRow><TableHead className="w-14 text-right">STT</TableHead><TableHead>Nhóm</TableHead><TableHead>Chứng từ</TableHead><TableHead>Chỉ tiêu</TableHead><TableHead className="text-right">Số lượng</TableHead><TableHead className="text-right">Số tiền</TableHead><TableHead className="text-center">ĐC</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={row.line_key} className={`cursor-pointer ${selectedLine === row.line_key ? "bg-accent/60" : ""}`} onClick={() => onSelect(row.line_key)}><TableCell className="text-right text-muted-foreground">{index + 1}</TableCell><TableCell><Badge variant="outline">{DOMAIN_LABEL[row.domain] ?? row.domain}</Badge></TableCell><TableCell><div className="font-medium">{row.source_ref}</div><div className="text-xs text-muted-foreground">{row.source_type}</div></TableCell><TableCell>{row.metric}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.adjusted_quantity_micros)}</TableCell><TableCell className="text-right tabular-nums">{money(row.adjusted_amount_minor, row.currency)}</TableCell><TableCell className="text-center">{row.adjustment_count || "—"}</TableCell></TableRow>)}</TableBody>
    </Table></div>
    <div className="divide-y md:hidden">{rows.map((row, index) => <Button variant="ghost" key={row.line_key} onClick={() => onSelect(row.line_key)} className={`h-auto w-full justify-start rounded-none p-4 text-left ${selectedLine === row.line_key ? "bg-accent/60" : ""}`}><span className="w-full space-y-2"><span className="flex items-center justify-between gap-2"><span className="font-medium">{index + 1}. {row.source_ref}</span><Badge variant="outline">{DOMAIN_LABEL[row.domain] ?? row.domain}</Badge></span><span className="block text-xs text-muted-foreground">{row.source_type} · {row.metric}</span><span className="flex justify-between text-sm"><span>{quantity(row.adjusted_quantity_micros)}</span><span className="font-medium tabular-nums">{money(row.adjusted_amount_minor, row.currency)}</span></span></span></Button>)}</div>
  </section>;
}
