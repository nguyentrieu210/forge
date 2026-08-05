import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Gauge, RefreshCw, TrendingUp } from "lucide-react";
import {
  Badge, Button, Separator, Skeleton, StatusBadge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";

type RangeValue = "7" | "30" | "90" | "all";

interface ProviderSummary {
  provider: string;
  currency: string;
  orders: number;
  canonical_revenue_minor: number;
  settlement_covered_orders: number;
  inventory_cost_covered_orders: number;
  contribution_covered_orders: number;
  contribution_revenue_minor: number;
  provider_deductions_minor: number;
  provider_credits_minor: number;
  inventory_cogs_minor: number;
  contribution_minor: number;
  contribution_margin_bps: number | null;
  payout_minor: number;
  settlement_variance_minor: number;
  settlement_gross_mismatch_orders: number;
  fx_unresolved_orders: number;
  inventory_cost_anomaly_orders: number;
}

interface CurrencySummary {
  currency: string;
  orders: number;
  canonical_revenue_minor: number;
  settlement_covered_orders: number;
  inventory_cost_covered_orders: number;
  contribution_covered_orders: number;
  contribution_revenue_minor: number;
  provider_deductions_minor: number;
  provider_credits_minor: number;
  inventory_cogs_minor: number;
  contribution_minor: number;
  contribution_margin_bps: number | null;
  payout_minor: number;
  settlement_variance_minor: number;
  providers: ProviderSummary[];
}

interface SlaSummary {
  provider: string;
  orders: number;
  policy_covered_orders: number;
  completed_met: number;
  completed_breached: number;
  open_on_track: number;
  open_at_risk: number;
  open_breached: number;
  not_applicable: number;
  policy_invalid: number;
  compliance_bps: number | null;
}

interface DailyPoint {
  date: string;
  currency: string;
  orders: number;
  canonical_revenue_minor: number;
  contribution_covered_orders: number;
  contribution_minor: number;
  sla_breaches: number;
}

interface BiReport {
  observed_at: string;
  period: { days: number | null; from: string | null; to: string };
  currencies: CurrencySummary[];
  sla_by_provider: SlaSummary[];
  daily: DailyPoint[];
  quality: {
    orders: number;
    canonical_submitted_orders: number;
    missing_canonical_orders: number;
    settlement_covered_orders: number;
    inventory_cost_covered_orders: number;
    contribution_covered_orders: number;
    fx_unresolved_orders: number;
    settlement_gross_mismatch_orders: number;
    inventory_cost_anomaly_orders: number;
    sla_policy_covered_orders: number;
  };
}

export function MarketplaceInsightsPanel({ onAuthenticationRequired }: { onAuthenticationRequired: () => void }) {
  const [range, setRange] = useState<RangeValue>("30");
  const [report, setReport] = useState<BiReport>();
  const [loading, setLoading] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/social/marketplace/bi?days=${encodeURIComponent(range)}`, { credentials: "include" });
      const body = await response.json().catch(() => ({})) as BiReport & { error?: { message?: string; code?: string } };
      if (response.status === 401) {
        onAuthenticationRequired();
        return;
      }
      if (response.status === 403) {
        setRestricted(true);
        setReport(undefined);
        return;
      }
      if (!response.ok) throw new Error(body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`);
      setRestricted(false);
      setReport(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được báo cáo marketplace");
    } finally {
      setLoading(false);
    }
  }, [onAuthenticationRequired, range]);

  useEffect(() => { void load(); }, [load]);

  if (restricted) {
    return (
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 size-5 text-muted-foreground" />
          <div><h2 className="text-sm font-semibold">BI tài chính bị giới hạn quyền</h2><p className="mt-1 text-sm text-muted-foreground">Báo cáo contribution đọc settlement và Stock Ledger canonical nên chỉ vai trò quản lý bán hàng/kế toán được xem.</p></div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 p-3 md:p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2"><BarChart3 className="size-4" /><h2 className="text-sm font-semibold">Profitability + SLA</h2><Badge variant="outline">Read-only BI</Badge></div>
            <p className="mt-1 max-w-4xl text-xs text-muted-foreground">Doanh thu lấy từ Sales Order canonical; COGS từ Stock Ledger của Delivery Note/Stock Return; phí sàn từ settlement evidence; SLA dùng đúng Marketplace SLA Policy. Thiếu evidence thì coverage giảm, hệ thống không tự coi chi phí bằng 0.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border bg-background p-0.5" aria-label="Khoảng thời gian báo cáo">
              {(["7", "30", "90", "all"] as RangeValue[]).map((value) => <Button key={value} size="sm" variant={range === value ? "secondary" : "ghost"} onClick={() => setRange(value)}>{rangeLabel(value)}</Button>)}
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Làm mới</Button>
          </div>
        </div>
        {error ? <><Separator /><div className="flex items-center gap-2 p-3 text-sm text-destructive"><AlertTriangle className="size-4" />{error}</div></> : null}
      </section>

      {loading && !report ? <InsightsSkeleton /> : report ? <ReportBody report={report} /> : null}
    </div>
  );
}

function ReportBody({ report }: { report: BiReport }) {
  const coverage = report.quality.orders > 0 ? Math.round(report.quality.contribution_covered_orders * 10_000 / report.quality.orders) : 0;
  return (
    <>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chất lượng dữ liệu BI">
        <InsightCard label="Đơn trong kỳ" value={report.quality.orders.toLocaleString("vi-VN")} detail={`${report.quality.canonical_submitted_orders} có Sales Order submitted`} />
        <InsightCard label="Coverage contribution" value={percentBps(coverage)} detail={`${report.quality.contribution_covered_orders}/${report.quality.orders} đơn đủ settlement + COGS + FX`} />
        <InsightCard label="Coverage settlement" value={fraction(report.quality.settlement_covered_orders, report.quality.orders)} detail="Có payout/phí/refund evidence" />
        <InsightCard label="Coverage SLA" value={fraction(report.quality.sla_policy_covered_orders, report.quality.orders)} detail="Có SLA policy hợp lệ hoặc policy-invalid evidence" />
      </section>

      {report.currencies.length ? report.currencies.map((currency) => <CurrencySection key={currency.currency} summary={currency} daily={report.daily.filter((point) => point.currency === currency.currency)} />) : (
        <section className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Chưa có đơn marketplace trong khoảng thời gian đã chọn.</section>
      )}

      <SlaSection summaries={report.sla_by_provider} />
      <QualitySection report={report} />
    </>
  );
}

function CurrencySection({ summary, daily }: { summary: CurrencySummary; daily: DailyPoint[] }) {
  const maxRevenue = Math.max(...summary.providers.map((provider) => Math.abs(provider.canonical_revenue_minor)), 1);
  const completeCoverageBps = summary.orders > 0 ? Math.round(summary.contribution_covered_orders * 10_000 / summary.orders) : 0;
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 md:p-4">
        <div><div className="flex items-center gap-2"><TrendingUp className="size-4" /><h3 className="text-sm font-semibold">Hiệu quả bán hàng · {summary.currency}</h3></div><p className="mt-1 text-xs text-muted-foreground">Contribution chỉ cộng các đơn đủ evidence; doanh thu canonical vẫn hiển thị toàn bộ đơn hợp lệ.</p></div>
        <StatusBadge tone={completeCoverageBps >= 9000 ? "success" : completeCoverageBps >= 6000 ? "warning" : "muted"}>Coverage {percentBps(completeCoverageBps)}</StatusBadge>
      </div>
      <Separator />
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-5 md:p-4">
        <MoneyMetric label="Doanh thu canonical" value={summary.canonical_revenue_minor} currency={summary.currency} />
        <MoneyMetric label="Phí / khấu trừ sàn" value={summary.provider_deductions_minor} currency={summary.currency} />
        <MoneyMetric label="COGS có evidence" value={summary.inventory_cogs_minor} currency={summary.currency} />
        <MoneyMetric label="Contribution" value={summary.contribution_minor} currency={summary.currency} detail={`${summary.contribution_covered_orders} đơn đủ evidence`} />
        <InsightCard label="Contribution margin" value={summary.contribution_margin_bps === null ? "—" : percentBps(summary.contribution_margin_bps)} detail={`Trên ${money(summary.contribution_revenue_minor, summary.currency)} revenue được cover`} />
      </div>
      <Separator />
      <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)] md:p-4">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Kênh</TableHead><TableHead className="text-right">Đơn</TableHead><TableHead className="text-right">Doanh thu</TableHead><TableHead className="text-right">Phí sàn</TableHead><TableHead className="text-right">COGS</TableHead><TableHead className="text-right">Contribution</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader><TableBody>
            {summary.providers.map((provider) => <TableRow key={provider.provider}>
              <TableCell><div className="min-w-40"><div className="flex items-center gap-2"><Badge variant="outline">{providerLabel(provider.provider)}</Badge><span className="text-xs text-muted-foreground">{provider.orders} đơn</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, Math.round(Math.abs(provider.canonical_revenue_minor) * 100 / maxRevenue))}%` }} /></div></div></TableCell>
              <TableCell className="text-right tabular-nums">{provider.orders}</TableCell>
              <TableCell className="text-right tabular-nums">{money(provider.canonical_revenue_minor, provider.currency)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(provider.provider_deductions_minor, provider.currency)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(provider.inventory_cogs_minor, provider.currency)}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{money(provider.contribution_minor, provider.currency)}{provider.contribution_margin_bps !== null ? <div className="text-xs text-muted-foreground">{percentBps(provider.contribution_margin_bps)}</div> : null}</TableCell>
              <TableCell className="text-right">{fraction(provider.contribution_covered_orders, provider.orders)}</TableCell>
            </TableRow>)}
          </TableBody></Table>
        </div>
        <DailyActivity points={daily} currency={summary.currency} />
      </div>
    </section>
  );
}

function DailyActivity({ points, currency }: { points: DailyPoint[]; currency: string }) {
  const recent = points.slice(-14);
  const max = Math.max(...recent.map((point) => Math.abs(point.canonical_revenue_minor)), 1);
  if (!recent.length) return <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">Chưa có dữ liệu daily.</div>;
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Nhịp doanh thu gần nhất</p><Badge variant="outline">{currency}</Badge></div>
      <div className="mt-3 space-y-2">{recent.map((point) => <div key={point.date} className="grid grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-2 text-xs"><span className="text-muted-foreground">{shortDate(point.date)}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, Math.round(Math.abs(point.canonical_revenue_minor) * 100 / max))}%` }} /></div><span className="tabular-nums">{money(point.canonical_revenue_minor, currency)}</span></div>)}</div>
    </div>
  );
}

function SlaSection({ summaries }: { summaries: SlaSummary[] }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="p-3 md:p-4"><div className="flex items-center gap-2"><Gauge className="size-4" /><h3 className="text-sm font-semibold">SLA theo kênh</h3></div><p className="mt-1 text-xs text-muted-foreground">Compliance chỉ tính đơn đã fulfillment: met / (met + breached). Đơn đang mở được tách riêng thành on-track, at-risk và overdue.</p></div>
      <Separator />
      {summaries.length ? <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3 md:p-4">{summaries.map((summary) => {
        const policyCoverage = summary.orders > 0 ? Math.round(summary.policy_covered_orders * 10_000 / summary.orders) : 0;
        return <article key={summary.provider} className="rounded-lg border bg-background p-3"><div className="flex items-center justify-between gap-2"><Badge variant="outline">{providerLabel(summary.provider)}</Badge><StatusBadge tone={summary.compliance_bps === null ? "muted" : summary.compliance_bps >= 9500 ? "success" : summary.compliance_bps >= 8000 ? "warning" : "warning"}>{summary.compliance_bps === null ? "Chưa đủ mẫu" : `Compliance ${percentBps(summary.compliance_bps)}`}</StatusBadge></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><MiniStat label="Đạt" value={summary.completed_met} /><MiniStat label="Trễ" value={summary.completed_breached} /><MiniStat label="At risk" value={summary.open_at_risk} /></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.min(100, Math.round(policyCoverage / 100))}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">Policy coverage {percentBps(policyCoverage)} · overdue mở {summary.open_breached} · invalid policy {summary.policy_invalid}</p></article>;
      })}</div> : <div className="p-5 text-sm text-muted-foreground">Chưa có SLA evidence trong kỳ.</div>}
    </section>
  );
}

function QualitySection({ report }: { report: BiReport }) {
  const issues = [
    ["Thiếu Sales Order submitted", report.quality.missing_canonical_orders],
    ["FX chưa resolve cho contribution", report.quality.fx_unresolved_orders],
    ["Settlement gross lệch revenue canonical", report.quality.settlement_gross_mismatch_orders],
    ["Inventory cost bất thường", report.quality.inventory_cost_anomaly_orders],
  ] as const;
  const totalIssues = issues.reduce((sum, [, value]) => sum + value, 0);
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 md:p-4"><div><h3 className="text-sm font-semibold">Data quality / authority coverage</h3><p className="mt-1 text-xs text-muted-foreground">Các cảnh báo này làm giảm coverage thay vì tự suy đoán số liệu.</p></div><StatusBadge tone={totalIssues ? "warning" : "success"}>{totalIssues ? `${totalIssues} cảnh báo` : "Không có cảnh báo"}</StatusBadge></div>
      <Separator />
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4 md:p-4">{issues.map(([label, value]) => <div key={label} className="rounded-md border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}</div>
    </section>
  );
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-lg border bg-card p-3 shadow-sm"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}
function MoneyMetric({ label, value, currency, detail }: { label: string; value: number; currency: string; detail?: string }) { return <InsightCard label={label} value={money(value, currency)} detail={detail ?? currency} />; }
function MiniStat({ label, value }: { label: string; value: number }) { return <div className="rounded-md bg-muted/40 p-2"><p className="text-lg font-semibold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>; }
function InsightsSkeleton() { return <div className="space-y-3"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-96" /><Skeleton className="h-72" /></div>; }
function rangeLabel(value: RangeValue) { if (value === "all") return "Tất cả"; return `${value} ngày`; }
function providerLabel(value: string) { if (value === "tiktok_shop") return "TikTok Shop"; if (value === "shopee") return "Shopee"; if (value === "lazada") return "Lazada"; return value || "Marketplace"; }
function fraction(numerator: number, denominator: number) { return denominator > 0 ? `${numerator}/${denominator} · ${percentBps(Math.round(numerator * 10_000 / denominator))}` : "0/0"; }
function percentBps(value: number) { return `${(value / 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`; }
function shortDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }); }
function money(minor: number, currency: string) {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "VND";
  try {
    const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: code });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
    return formatter.format(minor / (10 ** digits));
  } catch {
    return `${minor.toLocaleString("vi-VN")} ${code}`;
  }
}
