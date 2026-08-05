/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppAction, AppActionField, DocField, Fieldtype } from "@metaforge/core";
import { ForgeBarChart, ForgeLineChart } from "@metaforge/charts";
import { Button, Input, Label } from "@metaforge/ui";
import { ActionScreen as BaseActionScreen, type ActionScreenProps } from "../action/ActionScreen.js";
import { NewFormContainer } from "../container/NewFormContainer.js";
import { useMetaForge } from "../container/provider.js";

type Values = Record<string, unknown>;
type WorkspaceTab = "process" | "purchase" | "receive" | "payment" | "history" | "reports";
type ResultRecord = Record<string, unknown>;

export interface ProcurementWorkspaceConfig {
  contextMethod: string;
  purchaseOrderDoctype?: string;
  paymentDoctype?: string;
  title?: string;
  description?: string;
}

export interface ProcurementOperatingWorkspaceProps extends ActionScreenProps {
  config: ProcurementWorkspaceConfig;
}

interface PurchaseSummary {
  purchase_order_count?: number;
  open_purchase_order_count?: number;
  overdue_purchase_order_count?: number;
  material_count?: number;
  completed_material_count?: number;
  unsettled_material_count?: number;
  ordered_bars?: number;
  received_bars?: number;
  remaining_bars?: number;
  unapplied_bars?: number;
  purchase_value?: number;
  receipt_count?: number;
}

interface PurchaseOrderRow extends ResultRecord {
  purchase_order: string;
  transaction_date?: string;
  schedule_date?: string;
  status?: string;
  ordered_bars?: number;
  received_bars?: number;
  remaining_bars?: number;
  received_percentage?: number;
  billed_percentage?: number;
  overdue_days?: number;
  purchase_value?: number;
}

interface ReceiptRow extends ResultRecord {
  purchase_receipt: string;
  posting_at?: string;
  supplier_invoice_no?: string;
  driver?: string;
  purchase_orders?: string[];
  line_count?: number;
  qty_bar?: number;
  barem_weight_kg?: number;
  actual_weight_kg?: number;
  weight_variance_kg?: number;
  weight_variance_pct?: number | null;
  value?: number;
}

interface PriceHistoryRow extends ResultRecord {
  purchase_order: string;
  transaction_date?: string;
  item_code?: string;
  material?: string;
  rate?: number;
  previous_rate?: number | null;
  change_pct?: number | null;
  qty_bar?: number;
  theoretical_kg?: number;
  amount?: number;
}

interface BillingSummary extends ResultRecord {
  invoice_count?: number;
  invoice_total?: number;
  received_value?: number;
  received_not_invoiced_hint?: number;
  invoice_outstanding_hint?: number;
  authoritative?: boolean;
  source?: string;
  total_outstanding?: number;
  due_amount?: number | null;
  overdue_amount?: number | null;
  advance_balance?: number | null;
  net_exposure?: number;
  oldest_due_date?: string | null;
  rows?: ResultRecord[];
  note?: string;
}

interface ProcurementContext extends ResultRecord {
  supplier: string;
  generated_at?: string;
  source?: string;
  summary?: PurchaseSummary;
  purchase_orders?: PurchaseOrderRow[];
  receipts?: ReceiptRow[];
  price_history?: PriceHistoryRow[];
  billing?: BillingSummary;
  vat?: {
    input_vat?: number;
    exception_count?: number;
    source?: string;
  };
}

interface HistoryEvent {
  key: string;
  date: string;
  type: "purchase" | "receipt";
  doctype: string;
  name: string;
  title: string;
  subtitle: string;
  value: number;
  status: string;
  detail: ResultRecord;
}

const TAB_ITEMS: Array<{ key: WorkspaceTab; label: string; hint: string }> = [
  { key: "process", label: "Quy trình", hint: "KPI · cảnh báo · tiến độ" },
  { key: "purchase", label: "Mua hàng", hint: "Tạo mua · đơn đang mở" },
  { key: "receive", label: "Nhập hàng", hint: "Nhận hàng · FIFO tự động" },
  { key: "payment", label: "Thanh toán", hint: "Công nợ · trả NCC" },
  { key: "history", label: "Lịch sử", hint: "List · inspector · timeline" },
  { key: "reports", label: "Báo cáo", hint: "Biểu đồ · giá · công nợ" },
];

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numeric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function formatDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "—";
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString("vi-VN");
}

function toDocField(field: AppActionField): DocField {
  return {
    fieldname: field.fieldname,
    label: field.label,
    fieldtype: field.fieldtype as Fieldtype,
    ...(field.options ? { options: field.options } : {}),
    ...(field.required ? { reqd: 1 as const } : {}),
    ...(field.default == null ? {} : { default: field.default }),
  };
}

function WorkspaceField({ field, value, onChange }: {
  field: AppActionField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { registry, services } = useMetaForge();
  const docField = toDocField(field);
  const Control = registry.resolve(docField.fieldtype);
  const id = `procurement-workspace-${field.fieldname}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">{field.label}</Label>
      {Control
        ? <Control
            field={docField}
            value={value ?? ""}
            onChange={onChange}
            id={id}
            required={field.required}
            services={services}
            {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})}
            docValues={{ [field.fieldname]: value }}
          />
        : <Input id={id} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />}
    </div>
  );
}

function Kpi({ label, value, hint, attention = false }: {
  label: string;
  value: ReactNode;
  hint?: string;
  attention?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-3 ${attention ? "border-warning/50 bg-warning/5" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Section({ title, description, children, action }: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function OrdersTable({ rows, onOpen }: { rows: PurchaseOrderRow[]; onOpen?: ActionScreenProps["onOpen"] }) {
  const { fmt } = useMetaForge();
  if (!rows.length) return <Empty>Chưa có đơn mua đã ghi sổ.</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Đơn mua</th>
            <th className="px-3 py-2 font-medium">Ngày</th>
            <th className="px-3 py-2 font-medium">Hẹn giao</th>
            <th className="px-3 py-2 text-right font-medium">Giá trị</th>
            <th className="px-3 py-2 text-right font-medium">Đã nhận</th>
            <th className="px-3 py-2 text-right font-medium">Còn</th>
            <th className="px-3 py-2 text-right font-medium">% HĐ</th>
            <th className="px-3 py-2 font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.purchase_order} className="border-t">
              <td className="px-3 py-2.5">
                {onOpen
                  ? <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => onOpen("Purchase Order", row.purchase_order)}>{row.purchase_order}</Button>
                  : <span className="font-semibold">{row.purchase_order}</span>}
              </td>
              <td className="px-3 py-2.5">{formatDate(row.transaction_date)}</td>
              <td className="px-3 py-2.5">{formatDate(row.schedule_date)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.currency ? fmt.currency(numeric(row.purchase_value)) : fmt.number(numeric(row.purchase_value))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(numeric(row.received_percentage))}%</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(numeric(row.remaining_bars))} cây</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(numeric(row.billed_percentage))}%</td>
              <td className={`px-3 py-2.5 font-medium ${numeric(row.overdue_days) > 0 ? "text-destructive" : ""}`}>{text(row.status) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Alerts({ context }: { context: ProcurementContext }) {
  const summary = context.summary ?? {};
  const billing = context.billing ?? {};
  const alerts: Array<{ label: string; detail: string }> = [];
  if (numeric(summary.overdue_purchase_order_count) > 0) alerts.push({
    label: `${numeric(summary.overdue_purchase_order_count)} đơn giao trễ`,
    detail: "Mở Lịch sử để lọc các đơn đang quá hạn.",
  });
  if (numeric(billing.received_not_invoiced_hint) > 0) alerts.push({
    label: "Có hàng đã nhận nhưng chưa đủ hóa đơn",
    detail: "Đối chiếu giá trị nhận hàng với Purchase Invoice trước khi thanh toán.",
  });
  if (numeric(billing.overdue_amount) > 0) alerts.push({
    label: "Có công nợ quá hạn",
    detail: "Ưu tiên hóa đơn quá hạn trong tab Thanh toán.",
  });
  const latestIncrease = (context.price_history ?? []).find((row) => numeric(row.change_pct) >= 5);
  if (latestIncrease) alerts.push({
    label: `${text(latestIncrease.item_code) || "Mặt hàng"} tăng giá ${numeric(latestIncrease.change_pct).toLocaleString("vi-VN")}%`,
    detail: "Xem biểu đồ giá trong Báo cáo trước khi đặt tiếp.",
  });
  if (!alerts.length) return <Empty>Không có cảnh báo vận hành nổi bật cho nhà cung cấp này.</Empty>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {alerts.map((alert) => (
        <div key={alert.label} className="rounded-lg border border-warning/35 bg-warning/5 px-3 py-2.5">
          <div className="text-sm font-semibold">{alert.label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</div>
        </div>
      ))}
    </div>
  );
}

function ProcessTab({ context, onOpen }: { context: ProcurementContext; onOpen?: ActionScreenProps["onOpen"] }) {
  const { fmt } = useMetaForge();
  const summary = context.summary ?? {};
  const billing = context.billing ?? {};
  const recentOrders = [...(context.purchase_orders ?? [])].slice(-12);
  const currency = (value: unknown) => fmt.currency ? fmt.currency(numeric(value)) : fmt.number(numeric(value));
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Đơn đang mở" value={fmt.number(numeric(summary.open_purchase_order_count))} />
        <Kpi label="Đơn quá hạn" value={fmt.number(numeric(summary.overdue_purchase_order_count))} attention={numeric(summary.overdue_purchase_order_count) > 0} />
        <Kpi label="Còn phải nhận" value={`${fmt.number(numeric(summary.remaining_bars))} cây`} />
        <Kpi label="Công nợ NCC" value={currency(billing.total_outstanding ?? billing.invoice_outstanding_hint)} hint={billing.authoritative ? "Payment Ledger" : "Fallback hóa đơn"} />
        <Kpi label="Nợ quá hạn" value={billing.overdue_amount == null ? "—" : currency(billing.overdue_amount)} attention={numeric(billing.overdue_amount) > 0} />
        <Kpi label="VAT đầu vào" value={context.vat?.input_vat == null ? "—" : currency(context.vat.input_vat)} hint={context.vat?.input_vat == null ? "Chờ canonical VAT read-model" : context.vat.source} />
      </div>

      <Section title="Cần xử lý" description="Chỉ hiển thị ngoại lệ cần hành động; không biến dashboard thành danh sách trang trí.">
        <Alerts context={context} />
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Đặt hàng và đã nhận" description="12 đơn gần nhất; click vào điểm dữ liệu để drill-down về chứng từ gốc.">
          <ForgeBarChart
            title="Đặt vs nhận"
            height={300}
            labels={recentOrders.map((row) => row.purchase_order)}
            series={[
              { name: "Đã đặt", values: recentOrders.map((row) => numeric(row.ordered_bars)) },
              { name: "Đã nhận", values: recentOrders.map((row) => numeric(row.received_bars)) },
            ]}
            animation
            onActivate={(event) => {
              const row = recentOrders[event.index];
              if (row && onOpen) onOpen("Purchase Order", row.purchase_order);
            }}
          />
        </Section>
        <Section title="Công nợ phải trả" description={billing.note || "Nguồn công nợ do backend authoritative quyết định."}>
          <ForgeBarChart
            title="Tổng · đến hạn · quá hạn"
            height={300}
            labels={["Tổng nợ", "Đến hạn", "Quá hạn"]}
            series={[{ name: "VND", values: [numeric(billing.total_outstanding), numeric(billing.due_amount), numeric(billing.overdue_amount)] }]}
            valueFormatter={(value) => currency(value)}
            animation
          />
        </Section>
      </div>

      <Section title="Đơn mua đang chạy" description="Tạo mới ở tab Mua hàng; bảng này chỉ giữ các đơn chưa hoàn tất.">
        <OrdersTable rows={(context.purchase_orders ?? []).filter((row) => !/Đã giao đủ|Đã đối soát/i.test(text(row.status)))} onOpen={onOpen} />
      </Section>
    </div>
  );
}

function PurchaseTab({ context, supplier, onOpen, onRefresh, doctype }: {
  context: ProcurementContext;
  supplier: string;
  onOpen?: ActionScreenProps["onOpen"];
  onRefresh: () => void;
  doctype: string;
}) {
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(28rem,.7fr)]">
      <Section title="Mua hàng" description={supplier ? `Đang điều hành nhà cung cấp: ${supplier}. Biểu mẫu chuẩn được nhúng ngay trong workspace, không đổi route.` : "Tạo đơn mua ngay tại trang này, không mở modal hoặc tab form riêng."}>
        <NewFormContainer
          doctype={doctype}
          presentation="page"
          onCreated={(name) => {
            onRefresh();
            onOpen?.(doctype, name);
          }}
        />
      </Section>
      <Section title="Đơn đang mở" description="Đơn chưa giao đủ hoặc chưa đối soát.">
        <OrdersTable rows={(context.purchase_orders ?? []).filter((row) => !/Đã giao đủ|Đã đối soát/i.test(text(row.status)))} onOpen={onOpen} />
      </Section>
    </div>
  );
}

function ReceiveTab({ action, supplier, onOpen }: {
  action: AppAction;
  supplier: string;
  onOpen?: ActionScreenProps["onOpen"];
}) {
  const effectiveAction = useMemo<AppAction>(() => ({
    ...action,
    fields: action.fields.map((field) => field.fieldname === "supplier" && supplier ? { ...field, default: supplier } : field),
  }), [action, supplier]);
  return (
    <Section
      title="Nhập hàng"
      description="Nhập trực tiếp tại trang. Backend vẫn giữ validation, idempotency và phân bổ FIFO; UI không tạo sổ kho riêng."
    >
      <BaseActionScreen key={supplier || "no-supplier"} action={effectiveAction} onOpen={onOpen} />
    </Section>
  );
}

function PaymentTab({ context, supplier, onOpen, onRefresh, doctype }: {
  context: ProcurementContext;
  supplier: string;
  onOpen?: ActionScreenProps["onOpen"];
  onRefresh: () => void;
  doctype: string;
}) {
  const { fmt } = useMetaForge();
  const billing = context.billing ?? {};
  const currency = (value: unknown) => fmt.currency ? fmt.currency(numeric(value)) : fmt.number(numeric(value));
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tổng phải trả" value={currency(billing.total_outstanding ?? billing.invoice_outstanding_hint)} hint={billing.authoritative ? "Payment Ledger" : "Fallback hóa đơn"} />
        <Kpi label="Đến hạn" value={billing.due_amount == null ? "—" : currency(billing.due_amount)} />
        <Kpi label="Quá hạn" value={billing.overdue_amount == null ? "—" : currency(billing.overdue_amount)} attention={numeric(billing.overdue_amount) > 0} />
        <Kpi label="Ứng trước" value={billing.advance_balance == null ? "—" : currency(billing.advance_balance)} />
      </div>
      <Section title="Thanh toán nhà cung cấp" description={supplier ? `Nhà cung cấp đang xem: ${supplier}. Payment Entry chuẩn được nhúng tại chỗ; Payment Ledger vẫn là authority.` : "Chọn nhà cung cấp phía trên trước khi thanh toán."}>
        <NewFormContainer
          doctype={doctype}
          presentation="page"
          onCreated={(name) => {
            onRefresh();
            onOpen?.(doctype, name);
          }}
        />
      </Section>
      <div className="rounded-xl border bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
        Workspace không tự tạo công nợ hoặc tự phân bổ tiền. Số phải trả lấy từ backend; chứng từ thanh toán vẫn đi qua controller/Payment Ledger chuẩn.
      </div>
    </div>
  );
}

function buildHistory(context: ProcurementContext): HistoryEvent[] {
  const orders: HistoryEvent[] = (context.purchase_orders ?? []).map((row) => ({
    key: `po:${row.purchase_order}`,
    date: text(row.transaction_date),
    type: "purchase" as const,
    doctype: "Purchase Order",
    name: row.purchase_order,
    title: row.purchase_order,
    subtitle: `Đơn mua · ${text(row.status) || "—"}`,
    value: numeric(row.purchase_value),
    status: text(row.status),
    detail: row,
  }));
  const receipts: HistoryEvent[] = (context.receipts ?? []).map((row) => ({
    key: `pr:${row.purchase_receipt}`,
    date: text(row.posting_at),
    type: "receipt" as const,
    doctype: "Purchase Receipt",
    name: row.purchase_receipt,
    title: row.purchase_receipt,
    subtitle: `Nhập hàng · ${text(row.supplier_invoice_no) || "không số phiếu giao"}`,
    value: numeric(row.value),
    status: "Đã nhận",
    detail: row,
  }));
  return [...orders, ...receipts].sort((left, right) => right.date.localeCompare(left.date) || right.key.localeCompare(left.key));
}

function Inspector({ event, onOpen }: { event?: HistoryEvent; onOpen?: ActionScreenProps["onOpen"] }) {
  const { fmt } = useMetaForge();
  if (!event) return <Empty>Chọn một dòng lịch sử để xem chi tiết ngay tại đây.</Empty>;
  const pairs = Object.entries(event.detail).filter(([, value]) => !Array.isArray(value) && (typeof value !== "object" || value == null)).slice(0, 18);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">{event.type === "purchase" ? "Mua hàng" : "Nhập hàng"}</div>
        <h3 className="mt-1 text-lg font-semibold">{event.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{event.subtitle}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Ngày" value={formatDate(event.date)} />
        <Kpi label="Giá trị" value={fmt.currency ? fmt.currency(event.value) : fmt.number(event.value)} />
      </div>
      <dl className="divide-y rounded-lg border text-sm">
        {pairs.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[minmax(8rem,.7fr)_minmax(0,1.3fr)] gap-3 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{key.replaceAll("_", " ")}</dt>
            <dd className="break-words text-right text-xs font-medium">{value == null || value === "" ? "—" : String(value)}</dd>
          </div>
        ))}
      </dl>
      {onOpen ? <Button className="w-full" onClick={() => onOpen(event.doctype, event.name)}>Mở chứng từ gốc</Button> : null}
    </div>
  );
}

function HistoryTab({ context, onOpen }: { context: ProcurementContext; onOpen?: ActionScreenProps["onOpen"] }) {
  const { fmt } = useMetaForge();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | HistoryEvent["type"]>("all");
  const events = useMemo(() => buildHistory(context), [context]);
  const normalized = query.trim().toLocaleLowerCase("vi");
  const filtered = events.filter((event) => {
    if (kind !== "all" && event.type !== kind) return false;
    if (!normalized) return true;
    return `${event.title} ${event.subtitle} ${event.status}`.toLocaleLowerCase("vi").includes(normalized);
  });
  const [selectedKey, setSelectedKey] = useState<string>();
  const selected = filtered.find((event) => event.key === selectedKey) ?? filtered[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <Section
        title="Lịch sử mua hàng"
        description="Một list vận hành hợp nhất; click dòng để xem inspector, chỉ mở form khi chủ động chọn chứng từ gốc."
        action={<div className="flex gap-1"><Button size="sm" variant={kind === "all" ? "default" : "outline"} onClick={() => setKind("all")}>Tất cả</Button><Button size="sm" variant={kind === "purchase" ? "default" : "outline"} onClick={() => setKind("purchase")}>Mua</Button><Button size="sm" variant={kind === "receipt" ? "default" : "outline"} onClick={() => setKind("receipt")}>Nhập</Button></div>}
      >
        <div className="mb-3"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã mua, phiếu nhập, trạng thái…" aria-label="Tìm lịch sử mua hàng" /></div>
        {!filtered.length ? <Empty>Không có lịch sử phù hợp bộ lọc.</Empty> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Ngày</th><th className="px-3 py-2 font-medium">Chứng từ</th><th className="px-3 py-2 font-medium">Loại</th><th className="px-3 py-2 text-right font-medium">Giá trị</th><th className="px-3 py-2 font-medium">Trạng thái</th></tr>
              </thead>
              <tbody>
                {filtered.map((event) => (
                  <tr key={event.key} className={`cursor-pointer border-t transition-colors hover:bg-muted/40 ${selected?.key === event.key ? "bg-primary/5" : ""}`} onClick={() => setSelectedKey(event.key)}>
                    <td className="px-3 py-2.5">{formatDate(event.date)}</td>
                    <td className="px-3 py-2.5 font-semibold">{event.title}<div className="mt-0.5 text-[11px] font-normal text-muted-foreground">{event.subtitle}</div></td>
                    <td className="px-3 py-2.5">{event.type === "purchase" ? "Mua hàng" : "Nhập hàng"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt.currency ? fmt.currency(event.value) : fmt.number(event.value)}</td>
                    <td className="px-3 py-2.5">{event.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Chi tiết" description="Inspector tại chỗ, không đổi route."><Inspector event={selected} onOpen={onOpen} /></Section>
    </div>
  );
}

function PriceTable({ rows, onOpen }: { rows: PriceHistoryRow[]; onOpen?: ActionScreenProps["onOpen"] }) {
  const { fmt } = useMetaForge();
  if (!rows.length) return <Empty>Chưa có lịch sử giá mua.</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Ngày</th><th className="px-3 py-2 font-medium">Mặt hàng</th><th className="px-3 py-2 font-medium">PO</th><th className="px-3 py-2 text-right font-medium">Giá</th><th className="px-3 py-2 text-right font-medium">Biến động</th><th className="px-3 py-2 text-right font-medium">Kg barem</th></tr></thead>
        <tbody>{rows.slice(0, 100).map((row, index) => <tr key={`${row.purchase_order}:${row.item_code}:${index}`} className="border-t"><td className="px-3 py-2.5">{formatDate(row.transaction_date)}</td><td className="px-3 py-2.5 font-medium">{text(row.material) || text(row.item_code)}</td><td className="px-3 py-2.5">{onOpen ? <Button variant="link" className="h-auto p-0" onClick={() => onOpen("Purchase Order", row.purchase_order)}>{row.purchase_order}</Button> : row.purchase_order}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt.currency ? fmt.currency(numeric(row.rate)) : fmt.number(numeric(row.rate))}</td><td className={`px-3 py-2.5 text-right font-medium tabular-nums ${numeric(row.change_pct) > 0 ? "text-destructive" : numeric(row.change_pct) < 0 ? "text-success-text" : ""}`}>{row.change_pct == null ? "—" : `${numeric(row.change_pct) > 0 ? "+" : ""}${fmt.number(numeric(row.change_pct))}%`}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(numeric(row.theoretical_kg))}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ReportsTab({ context, onOpen }: { context: ProcurementContext; onOpen?: ActionScreenProps["onOpen"] }) {
  const { fmt } = useMetaForge();
  const prices = [...(context.price_history ?? [])].reverse().slice(-40);
  const orders = [...(context.purchase_orders ?? [])].slice(-16);
  const billing = context.billing ?? {};
  const currency = (value: number) => fmt.currency ? fmt.currency(value) : fmt.number(value);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tổng giá trị mua" value={currency(numeric(context.summary?.purchase_value))} />
        <Kpi label="Tổng hóa đơn" value={currency(numeric(billing.invoice_total))} />
        <Kpi label="Công nợ" value={currency(numeric(billing.total_outstanding ?? billing.invoice_outstanding_hint))} />
        <Kpi label="VAT đầu vào" value={context.vat?.input_vat == null ? "—" : currency(numeric(context.vat.input_vat))} hint={context.vat?.input_vat == null ? "Chưa có VAT trong read-model hiện tại" : context.vat.source} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Biến động giá mua" description="Lịch sử đơn giá; click điểm để mở PO nguồn.">
          <ForgeLineChart
            title="Giá mua"
            height={320}
            labels={prices.map((row) => formatDate(row.transaction_date))}
            series={[{ name: "Đơn giá", values: prices.map((row) => numeric(row.rate)) }]}
            smooth
            animation
            valueFormatter={(value) => currency(value)}
            onActivate={(event) => {
              const row = prices[event.index];
              if (row && onOpen) onOpen("Purchase Order", row.purchase_order);
            }}
          />
        </Section>
        <Section title="Đặt hàng vs đã nhận" description="So sánh theo đơn mua gần nhất.">
          <ForgeBarChart
            title="Tiến độ nhận"
            height={320}
            labels={orders.map((row) => row.purchase_order)}
            series={[
              { name: "Đặt", values: orders.map((row) => numeric(row.ordered_bars)) },
              { name: "Nhận", values: orders.map((row) => numeric(row.received_bars)) },
            ]}
            animation
            onActivate={(event) => {
              const row = orders[event.index];
              if (row && onOpen) onOpen("Purchase Order", row.purchase_order);
            }}
          />
        </Section>
      </div>
      <Section title="Lịch sử giá" description="Bảng phục vụ kiểm tra chính xác sau khi nhìn xu hướng trên biểu đồ.">
        <PriceTable rows={context.price_history ?? []} onOpen={onOpen} />
      </Section>
      <div className="rounded-xl border bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
        VAT không được suy từ số hiển thị ở frontend. Khi canonical VN Accounting VAT read-model được nối vào procurement context, block VAT sẽ tự hiện số thật; hiện tại giữ “—” thay vì giả định.
      </div>
    </div>
  );
}

export function ProcurementOperatingWorkspace({ action, config, onOpen }: ProcurementOperatingWorkspaceProps) {
  const { adapter } = useMetaForge();
  const supplierField = action.fields.find((field) => field.fieldname === "supplier");
  const [supplier, setSupplier] = useState(() => text(supplierField?.default));
  const [tab, setTab] = useState<WorkspaceTab>("process");
  const [context, setContext] = useState<ProcurementContext>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!supplier) {
      setContext(undefined);
      setError(undefined);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError(undefined);
      adapter.callPost<ProcurementContext>(config.contextMethod, { supplier })
        .then((value) => { if (active) setContext(value); })
        .catch((caught) => { if (active) { setContext(undefined); setError(adapter.mapError(caught).message); } })
        .finally(() => { if (active) setBusy(false); });
    }, 160);
    return () => { active = false; window.clearTimeout(timer); };
  }, [adapter, config.contextMethod, refreshToken, supplier]);

  const purchaseOrderDoctype = config.purchaseOrderDoctype ?? "Purchase Order";
  const paymentDoctype = config.paymentDoctype ?? "Payment Entry";
  const value = context ?? { supplier, summary: {}, purchase_orders: [], receipts: [], price_history: [], billing: {} };

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-3" data-procurement-operating-workspace>
      <header className="rounded-xl border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Mua hàng</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{config.title ?? "Điều hành mua hàng"}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{config.description ?? "Đặt mua → nhận hàng → hóa đơn/VAT → thanh toán → lịch sử → báo cáo trên một workspace, hạn chế mở form riêng."}</p>
          </div>
          {supplierField ? <div className="w-full sm:w-[360px]"><WorkspaceField field={supplierField} value={supplier} onChange={(next) => setSupplier(text(next))} /></div> : null}
        </div>
      </header>

      <nav className="grid gap-1 rounded-xl border bg-card p-1 sm:grid-cols-3 xl:grid-cols-6" aria-label="Điều hành mua hàng">
        {TAB_ITEMS.map((item) => (
          <button key={item.key} type="button" className={`rounded-lg px-3 py-2 text-left transition-colors ${tab === item.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setTab(item.key)}>
            <div className="text-sm font-semibold">{item.label}</div>
            <div className={`mt-0.5 text-[10px] ${tab === item.key ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{item.hint}</div>
          </button>
        ))}
      </nav>

      {!supplier ? <Empty>Chọn Nhà cung cấp phía trên. Mọi tab vẫn ở nguyên trang, không mở form phụ.</Empty> : null}
      {supplier && busy ? <Empty>Đang tổng hợp đơn mua, hàng nhận, công nợ và lịch sử…</Empty> : null}
      {supplier && error ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</div> : null}

      {supplier && !busy && !error && tab === "process" ? <ProcessTab context={value} onOpen={onOpen} /> : null}
      {supplier && !busy && !error && tab === "purchase" ? <PurchaseTab context={value} supplier={supplier} onOpen={onOpen} onRefresh={() => setRefreshToken((current) => current + 1)} doctype={purchaseOrderDoctype} /> : null}
      {supplier && !busy && !error && tab === "receive" ? <ReceiveTab action={action} supplier={supplier} onOpen={onOpen} /> : null}
      {supplier && !busy && !error && tab === "payment" ? <PaymentTab context={value} supplier={supplier} onOpen={onOpen} onRefresh={() => setRefreshToken((current) => current + 1)} doctype={paymentDoctype} /> : null}
      {supplier && !busy && !error && tab === "history" ? <HistoryTab context={value} onOpen={onOpen} /> : null}
      {supplier && !busy && !error && tab === "reports" ? <ReportsTab context={value} onOpen={onOpen} /> : null}
    </div>
  );
}
