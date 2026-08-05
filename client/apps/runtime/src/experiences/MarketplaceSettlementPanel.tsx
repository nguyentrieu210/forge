import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, ReceiptText } from "lucide-react";
import { Badge, Button, Separator, StatusBadge, toast } from "@metaforge/ui";

interface MarketplaceOrderOption {
  order_id: string;
  provider: string;
  currency: string;
}

interface SettlementResult {
  settlement_id: string;
  order_id: string;
  provider: string;
  external_settlement_id: string;
  currency: string;
  expected_payout_minor: number;
  payout_minor: number;
  variance_minor: number;
  status: "reconciled" | "variance";
  cash_evidence_verified: boolean;
  accounting_posted: false;
  accounting_dependency: string;
  idempotent_replay: boolean;
}

interface AmountFields {
  gross: string;
  commission: string;
  serviceFee: string;
  sellerShippingFee: string;
  sellerVoucher: string;
  refund: string;
  otherDeductions: string;
  platformSubsidy: string;
  otherCredits: string;
  payout: string;
}

const ZERO_AMOUNTS: AmountFields = {
  gross: "",
  commission: "0",
  serviceFee: "0",
  sellerShippingFee: "0",
  sellerVoucher: "0",
  refund: "0",
  otherDeductions: "0",
  platformSubsidy: "0",
  otherCredits: "0",
  payout: "",
};

export function MarketplaceSettlementPanel({
  orders,
  onReload,
  onAuthenticationRequired,
}: {
  orders: MarketplaceOrderOption[];
  onReload: () => Promise<void>;
  onAuthenticationRequired: () => void;
}) {
  const [orderId, setOrderId] = useState(orders[0]?.order_id ?? "");
  const [externalId, setExternalId] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue(new Date()));
  const [invoice, setInvoice] = useState("");
  const [payment, setPayment] = useState("");
  const [amounts, setAmounts] = useState<AmountFields>(ZERO_AMOUNTS);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<SettlementResult>();

  const order = useMemo(() => orders.find((candidate) => candidate.order_id === orderId) ?? orders[0], [orderId, orders]);
  const preview = useMemo(() => order ? expectedPreview(amounts, order.currency) : null, [amounts, order]);

  function setAmount(field: keyof AmountFields, value: string) {
    setAmounts((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    if (!order || saving) return;
    if (!externalId.trim()) {
      toast.warning("Cần nhập mã settlement/payout của sàn");
      return;
    }
    if (Boolean(invoice.trim()) !== Boolean(payment.trim())) {
      toast.warning("Sales Invoice và Payment Entry phải được nhập cùng nhau");
      return;
    }
    const parsed = parseAmounts(amounts, order.currency);
    if (!parsed) {
      toast.warning("Các trường số tiền không hợp lệ");
      return;
    }
    const occurred = new Date(occurredAt);
    if (Number.isNaN(occurred.getTime())) {
      toast.warning("Thời điểm settlement không hợp lệ");
      return;
    }

    setSaving(true);
    try {
      const result = await request<SettlementResult>("/api/v1/social/marketplace/settlements/reconcile", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.order_id,
          provider: order.provider,
          external_settlement_id: externalId.trim(),
          currency: order.currency,
          gross_minor: parsed.gross,
          commission_minor: parsed.commission,
          service_fee_minor: parsed.serviceFee,
          seller_shipping_fee_minor: parsed.sellerShippingFee,
          seller_voucher_minor: parsed.sellerVoucher,
          refund_minor: parsed.refund,
          other_deductions_minor: parsed.otherDeductions,
          platform_subsidy_minor: parsed.platformSubsidy,
          other_credits_minor: parsed.otherCredits,
          payout_minor: parsed.payout,
          occurred_at: occurred.toISOString(),
          ...(invoice.trim() && payment.trim() ? {
            sales_invoice_name: invoice.trim(),
            payment_entry_name: payment.trim(),
          } : {}),
        }),
      });
      setLastResult(result);
      if (result.status === "reconciled") toast.success("Settlement khớp payout kỳ vọng");
      else toast.warning(`Settlement lệch ${money(result.variance_minor, result.currency)}; cần xử lý ở Finance/provider evidence`);
      if (invoice.trim() && payment.trim() && !result.cash_evidence_verified) {
        toast.warning("Finance evidence chưa được xác minh");
      }
      await onReload();
    } catch (error) {
      if (error instanceof SettlementApiError && error.status === 401) onAuthenticationRequired();
      else toast.error(error instanceof Error ? error.message : "Không ghi nhận được settlement evidence");
    } finally {
      setSaving(false);
    }
  }

  if (!orders.length) return null;

  return (
    <section className="mb-4 rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-3 md:p-4">
        <div>
          <div className="flex items-center gap-2"><ReceiptText className="size-4" /><h2 className="text-sm font-semibold">Ghi nhận settlement evidence</h2></div>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Payout/phí/voucher/refund được đối chiếu ở đây nhưng không tạo GL riêng. Nếu nhập Sales Invoice + Payment Entry, backend sẽ xác minh chứng từ canonical và allocation bằng đúng payout.</p>
        </div>
        <Badge variant="outline">Finance canonical</Badge>
      </div>
      <Separator />
      <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:p-4">
        <div className="space-y-3">
          <label className="grid gap-1 text-xs font-medium">Đơn marketplace<select className="h-9 rounded-md border bg-background px-3 text-sm" value={order?.order_id ?? ""} onChange={(event) => setOrderId(event.target.value)}>{orders.map((candidate) => <option key={candidate.order_id} value={candidate.order_id}>{providerLabel(candidate.provider)} · {candidate.order_id}</option>)}</select></label>
          <Field label="Mã settlement / payout" value={externalId} onChange={setExternalId} placeholder="Mã giao dịch từ sàn" />
          <label className="grid gap-1 text-xs font-medium">Thời điểm settlement<input className="h-9 rounded-md border bg-background px-3 text-sm" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Sales Invoice (tùy chọn)" value={invoice} onChange={setInvoice} placeholder="SINV-00001" />
            <Field label="Payment Entry (tùy chọn)" value={payment} onChange={setPayment} placeholder="PAY-00001" />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>Order/provider/currency lấy từ đơn canonical đang chọn; browser không tự chọn scope khác.</p>
            <p className="mt-1">Finance evidence chỉ hợp lệ khi invoice bill đúng Sales Order, Payment Entry là customer receipt và allocation bằng payout.</p>
          </div>
        </div>

        <div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <MoneyField label="Gross" value={amounts.gross} onChange={(value) => setAmount("gross", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Commission" value={amounts.commission} onChange={(value) => setAmount("commission", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Service fee" value={amounts.serviceFee} onChange={(value) => setAmount("serviceFee", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Seller shipping fee" value={amounts.sellerShippingFee} onChange={(value) => setAmount("sellerShippingFee", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Seller voucher" value={amounts.sellerVoucher} onChange={(value) => setAmount("sellerVoucher", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Refund" value={amounts.refund} onChange={(value) => setAmount("refund", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Other deductions" value={amounts.otherDeductions} onChange={(value) => setAmount("otherDeductions", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Platform subsidy" value={amounts.platformSubsidy} onChange={(value) => setAmount("platformSubsidy", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Other credits" value={amounts.otherCredits} onChange={(value) => setAmount("otherCredits", value)} currency={order?.currency ?? "VND"} />
            <MoneyField label="Payout thực nhận" value={amounts.payout} onChange={(value) => setAmount("payout", value)} currency={order?.currency ?? "VND"} emphasis />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
            <div className="text-xs"><p className="text-muted-foreground">Preview theo cùng công thức</p><p className="mt-0.5 font-medium">Expected payout: {preview ? money(preview.expected, order?.currency ?? "VND") : "—"}</p>{preview ? <p className={preview.variance === 0 ? "text-success-text" : "text-warning-text"}>Variance: {money(preview.variance, order?.currency ?? "VND")}</p> : null}</div>
            <Button disabled={saving || !order} onClick={() => void submit()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />} Ghi nhận evidence</Button>
          </div>
          {lastResult ? <div className="mt-3 rounded-md border p-3 text-xs"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={lastResult.status === "reconciled" ? "success" : "warning"}>{lastResult.status === "reconciled" ? "Khớp payout" : "Có variance"}</StatusBadge><StatusBadge tone={lastResult.cash_evidence_verified ? "success" : "muted"}>{lastResult.cash_evidence_verified ? "Finance evidence hợp lệ" : "Chưa xác minh cash"}</StatusBadge>{lastResult.idempotent_replay ? <Badge variant="secondary">Idempotent replay</Badge> : null}</div><p className="mt-2 text-muted-foreground">{lastResult.accounting_dependency}</p>{lastResult.accounting_posted === false ? <p className="mt-1 flex items-center gap-1 text-warning-text"><AlertTriangle className="size-3.5" /> Không có GL/Payment Ledger nào được post bởi settlement evidence.</p> : null}</div> : null}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-1 text-xs font-medium">{label}<input className="h-9 rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={240} autoComplete="off" /></label>;
}

function MoneyField({ label, value, onChange, currency, emphasis = false }: { label: string; value: string; onChange: (value: string) => void; currency: string; emphasis?: boolean }) {
  return <label className={`grid gap-1 text-xs font-medium ${emphasis ? "sm:col-span-2 xl:col-span-3" : ""}`}>{label} ({currency})<input className="h-9 rounded-md border bg-background px-3 text-sm tabular-nums" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0" /></label>;
}

function parseAmounts(input: AmountFields, currency: string): Record<keyof AmountFields, number> | null {
  const entries = Object.entries(input) as Array<[keyof AmountFields, string]>;
  const result = {} as Record<keyof AmountFields, number>;
  for (const [key, value] of entries) {
    const parsed = majorTextToMinor(value, currency);
    if (parsed === null) return null;
    result[key] = parsed;
  }
  return result;
}

function expectedPreview(input: AmountFields, currency: string): { expected: number; variance: number } | null {
  const values = parseAmounts(input, currency);
  if (!values) return null;
  const deductions = values.commission + values.serviceFee + values.sellerShippingFee + values.sellerVoucher + values.refund + values.otherDeductions;
  const credits = values.platformSubsidy + values.otherCredits;
  const expected = values.gross + credits - deductions;
  const variance = values.payout - expected;
  return Number.isSafeInteger(expected) && Number.isSafeInteger(variance) ? { expected, variance } : null;
}

function currencyDigits(currency: string): number {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 0; }
  catch { return currency === "VND" ? 0 : 2; }
}

function majorTextToMinor(value: string, currency: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const numeric = Number(normalized);
  const scale = 10 ** currencyDigits(currency);
  const minor = Math.round(numeric * scale);
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

function money(minor: number, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "VND";
  const digits = currencyDigits(code);
  try { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: code }).format(minor / (10 ** digits)); }
  catch { return `${minor} ${code}`; }
}

function providerLabel(value: string): string {
  if (value === "tiktok_shop") return "TikTok Shop";
  if (value === "shopee") return "Shopee";
  if (value === "lazada") return "Lazada";
  return value;
}

function localDateTimeValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

class SettlementApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "SettlementApiError"; }
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } };
  if (!response.ok) throw new SettlementApiError(body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`, response.status);
  return body;
}
