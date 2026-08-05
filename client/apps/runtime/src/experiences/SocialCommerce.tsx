import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, Facebook, Inbox, Loader2, PackageCheck, RefreshCw,
  ShoppingCart, Truck, Unplug,
} from "lucide-react";
import {
  Badge, Button, Separator, Skeleton, StatusBadge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger, toast,
} from "@metaforge/ui";

type Tab = "overview" | "orders" | "settlements" | "inbox" | "carts";
interface Summary { active_pages: number; events_today: number; open_carts: number; active_orders: number; cod_pending_minor: number }
interface Page { page_id: string; page_name: string; status: string }
interface Event { event_id: string; event_kind: string; message_text?: string; external_actor_id?: string; received_at: string }
interface Cart { cart_id: string; external_actor_id: string; status: string; customer_name?: string; item_quantity: number; modified_at: string }
interface MarketplaceOrder {
  order_id: string;
  source_key: string;
  provider: string;
  sales_order_name: string | null;
  status: string;
  amount_minor: number;
  currency: string;
  created_at: string;
  modified_at: string;
}
interface MarketplaceSettlement {
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
}

export interface SocialCommerceProps {
  canManageConnections: boolean;
  onAuthenticationRequired: () => void;
}

export function SocialCommerce({ canManageConnections, onAuthenticationRequired }: SocialCommerceProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<Summary>();
  const [pages, setPages] = useState<Page[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [settlements, setSettlements] = useState<MarketplaceSettlement[]>([]);
  const [settlementRestricted, setSettlementRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  const handleError = useCallback((caught: unknown, fallback: string) => {
    if (caught instanceof SocialApiError && caught.status === 401) {
      onAuthenticationRequired();
      return;
    }
    setError(caught instanceof Error ? caught.message : fallback);
  }, [onAuthenticationRequired]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextSummary, nextPages, nextEvents, nextCarts, nextOrders] = await Promise.all([
        api<Summary>("/api/v1/social/summary"),
        api<{ pages: Page[] }>("/api/v1/social/pages"),
        api<{ events: Event[] }>("/api/v1/social/events"),
        api<{ carts: Cart[] }>("/api/v1/social/carts"),
        api<{ orders: MarketplaceOrder[] }>("/api/v1/social/marketplace/orders?limit=200"),
      ]);
      setSummary(nextSummary);
      setPages(nextPages.pages);
      setEvents(nextEvents.events);
      setCarts(nextCarts.carts);
      setOrders(nextOrders.orders);
      try {
        const nextSettlements = await api<{ settlements: MarketplaceSettlement[] }>("/api/v1/social/marketplace/settlements?limit=200");
        setSettlements(nextSettlements.settlements);
        setSettlementRestricted(false);
      } catch (caught) {
        if (caught instanceof SocialApiError && caught.status === 403) {
          setSettlements([]);
          setSettlementRestricted(true);
        } else {
          throw caught;
        }
      }
    } catch (caught) {
      handleError(caught, "Không tải được dữ liệu bán hàng đa kênh");
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("facebook");
    if (!result) return;
    if (result === "connected") toast.success("Đã kết nối Facebook Page");
    else if (result === "no_pages") toast.warning("Tài khoản Facebook chưa có Page phù hợp để kết nối");
    else toast.error("Kết nối Facebook chưa hoàn tất");
    url.searchParams.delete("facebook");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function connectFacebook() {
    if (!canManageConnections || connecting) return;
    setConnecting(true);
    setError(undefined);
    try {
      const result = await api<{ authorization_url: string }>("/api/v1/social/facebook/oauth/start", { method: "POST" });
      window.location.assign(result.authorization_url);
    } catch (caught) {
      handleError(caught, "Không bắt đầu được kết nối Facebook");
      setConnecting(false);
    }
  }

  const providerCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const order of orders) result[order.provider] = (result[order.provider] ?? 0) + 1;
    return result;
  }, [orders]);
  const activePages = summary?.active_pages ?? pages.filter((page) => page.status === "active").length;

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-3 md:p-4 lg:p-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Trung tâm bán hàng đa kênh</h1>
            {loading ? <Skeleton className="h-5 w-28" /> : <StatusBadge tone="success">ERP canonical</StatusBadge>}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Shopee, Lazada, TikTok Shop và Facebook dùng chung Sales Order, tồn kho, giao hàng và đối soát của Forge.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => window.location.assign("/app/Commerce%20Channel%20Profile")}>Gian hàng TMĐT</Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Làm mới">
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Làm mới
          </Button>
          {canManageConnections ? (
            <Button size="sm" onClick={() => void connectFacebook()} disabled={connecting}>
              {connecting ? <Loader2 className="size-4 animate-spin" /> : <Facebook className="size-4" />}
              {activePages ? "Thêm Page" : "Kết nối Facebook"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList aria-label="Khu vực bán hàng đa kênh" className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview"><PackageCheck className="size-4" /> Tổng quan</TabsTrigger>
          <TabsTrigger value="orders">Đơn sàn {orders.length ? <Badge variant="secondary">{orders.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="settlements">Đối soát {settlements.length ? <Badge variant="secondary">{settlements.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="inbox"><Inbox className="size-4" /> Inbox {events.length ? <Badge variant="secondary">{events.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="carts"><ShoppingCart className="size-4" /> Giỏ Facebook {carts.length ? <Badge variant="secondary">{carts.length}</Badge> : null}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {loading ? <OverviewSkeleton /> : <Overview summary={summary} pages={pages} providerCounts={providerCounts} orders={orders} settlements={settlements} canManageConnections={canManageConnections} onConnect={() => void connectFacebook()} />}
        </TabsContent>
        <TabsContent value="orders">{loading ? <ListSkeleton /> : <MarketplaceOrderList orders={orders} />}</TabsContent>
        <TabsContent value="settlements">{loading ? <ListSkeleton /> : <SettlementList settlements={settlements} restricted={settlementRestricted} />}</TabsContent>
        <TabsContent value="inbox">{loading ? <ListSkeleton /> : <InboxList events={events} />}</TabsContent>
        <TabsContent value="carts">{loading ? <ListSkeleton /> : <CartList carts={carts} />}</TabsContent>
      </Tabs>
    </div>
  );
}

function Overview({ summary, pages, providerCounts, orders, settlements, canManageConnections, onConnect }: {
  summary?: Summary;
  pages: Page[];
  providerCounts: Record<string, number>;
  orders: MarketplaceOrder[];
  settlements: MarketplaceSettlement[];
  canManageConnections: boolean;
  onConnect: () => void;
}) {
  const varianceCount = settlements.filter((row) => row.status === "variance").length;
  const cards = [
    { label: "Đơn sàn đã đồng bộ", value: orders.length, icon: <PackageCheck />, tone: "info" },
    { label: "Đơn đang xử lý", value: summary?.active_orders ?? 0, icon: <Truck />, tone: "success" },
    { label: "COD chờ đối soát", value: money(summary?.cod_pending_minor ?? 0, "VND"), icon: <Truck />, tone: "warning" },
    { label: "Settlement lệch", value: varianceCount, icon: <AlertTriangle />, tone: varianceCount ? "warning" : "neutral" },
  ] as const;
  return (
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số bán hàng">
        {cards.map((card) => <MetricCard key={card.label} {...card} />)}
      </section>
      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 md:p-4">
          <div><h2 className="text-sm font-semibold">Kênh đang vận hành</h2><p className="text-xs text-muted-foreground">Một ERP authority, nhiều nguồn đơn.</p></div>
          <Button variant="outline" size="sm" onClick={() => window.location.assign("/app/Marketplace%20SKU%20Mapping")}>Ánh xạ SKU</Button>
        </div>
        <Separator />
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4 md:p-4">
          <ChannelCard label="Shopee" count={providerCounts.shopee ?? 0} />
          <ChannelCard label="Lazada" count={providerCounts.lazada ?? 0} />
          <ChannelCard label="TikTok Shop" count={providerCounts.tiktok_shop ?? 0} />
          <ChannelCard label="Facebook" count={pages.filter((page) => page.status === "active").length} />
        </div>
      </section>
      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-3 md:p-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-info/10 text-info-text"><Facebook className="size-4.5" /></div>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Facebook Pages</h2><p className="text-xs text-muted-foreground">{pages.length} Page đang được quản lý</p></div>
          {canManageConnections && pages.length ? <Button variant="outline" size="sm" onClick={onConnect}>Thêm Page</Button> : null}
        </div>
        <Separator />
        {pages.length ? <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 md:p-4">{pages.map((page) => (
          <div key={page.page_id} className="flex items-center gap-3 rounded-lg border bg-background p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600 text-white"><Facebook className="size-4" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{page.page_name}</p><StatusBadge tone={page.status === "active" ? "success" : "warning"}>{page.status === "active" ? "Đang kết nối" : page.status}</StatusBadge></div>
          </div>
        ))}</div> : <EmptyState icon={<Unplug />} title="Chưa kết nối Facebook Page" detail="TMĐT vẫn hoạt động độc lập; kết nối Facebook khi cần bán social commerce." action={canManageConnections ? <Button onClick={onConnect}><Facebook className="size-4" /> Kết nối ngay</Button> : undefined} />}
      </section>
    </div>
  );
}

function MarketplaceOrderList({ orders }: { orders: MarketplaceOrder[] }) {
  if (!orders.length) return <section className="rounded-lg border bg-card"><EmptyState icon={<PackageCheck />} title="Chưa có đơn từ sàn" detail="Sau khi connector đồng bộ và SKU được ánh xạ, đơn sẽ xuất hiện ở đây." /></section>;
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="p-3 md:p-4"><h2 className="text-sm font-semibold">Đơn hàng marketplace</h2><p className="text-xs text-muted-foreground">Mỗi dòng liên kết về Sales Order canonical của ERP.</p></div>
      <Separator />
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Kênh</TableHead><TableHead>Mã đơn</TableHead><TableHead>Sales Order</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Giá trị</TableHead><TableHead className="text-right">Cập nhật</TableHead></TableRow></TableHeader><TableBody>
        {orders.map((order) => <TableRow key={order.order_id}>
          <TableCell><ProviderBadge provider={order.provider} /></TableCell>
          <TableCell className="max-w-56 truncate font-medium">{order.order_id}</TableCell>
          <TableCell>{order.sales_order_name ?? "—"}</TableCell>
          <TableCell><StatusBadge tone={orderTone(order.status)}>{orderStatus(order.status)}</StatusBadge></TableCell>
          <TableCell className="text-right tabular-nums">{money(order.amount_minor, order.currency)}</TableCell>
          <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{dateTime(order.modified_at)}</TableCell>
        </TableRow>)}
      </TableBody></Table></div>
    </section>
  );
}

function SettlementList({ settlements, restricted }: { settlements: MarketplaceSettlement[]; restricted: boolean }) {
  if (restricted) return <section className="rounded-lg border bg-card"><EmptyState icon={<AlertTriangle />} title="Không có quyền xem đối soát" detail="Tài khoản cần quyền Kế toán, Sales Manager hoặc Social Commerce Manager." /></section>;
  if (!settlements.length) return <section className="rounded-lg border bg-card"><EmptyState icon={<Truck />} title="Chưa có settlement" detail="Dữ liệu payout/phí/voucher/refund từ sàn sẽ được đối chiếu tại đây; GL vẫn do Finance canonical quản lý." /></section>;
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="p-3 md:p-4"><h2 className="text-sm font-semibold">Đối soát sàn</h2><p className="text-xs text-muted-foreground">Evidence payout không tạo sổ cái riêng; chứng từ Finance canonical vẫn là authority.</p></div>
      <Separator />
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Kênh</TableHead><TableHead>Settlement</TableHead><TableHead>Đơn</TableHead><TableHead className="text-right">Kỳ vọng</TableHead><TableHead className="text-right">Payout</TableHead><TableHead className="text-right">Lệch</TableHead><TableHead>Finance</TableHead></TableRow></TableHeader><TableBody>
        {settlements.map((row) => <TableRow key={row.settlement_id}>
          <TableCell><ProviderBadge provider={row.provider} /></TableCell>
          <TableCell className="max-w-56 truncate font-medium">{row.external_settlement_id}</TableCell>
          <TableCell className="max-w-48 truncate">{row.order_id}</TableCell>
          <TableCell className="text-right tabular-nums">{money(row.expected_payout_minor, row.currency)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(row.payout_minor, row.currency)}</TableCell>
          <TableCell className="text-right tabular-nums"><StatusBadge tone={row.variance_minor === 0 ? "success" : "warning"}>{money(row.variance_minor, row.currency)}</StatusBadge></TableCell>
          <TableCell>{row.cash_evidence_verified ? <StatusBadge tone="success">Đã đối chiếu</StatusBadge> : <StatusBadge tone="warning">Chưa gắn chứng từ</StatusBadge>}</TableCell>
        </TableRow>)}
      </TableBody></Table></div>
    </section>
  );
}

function InboxList({ events }: { events: Event[] }) {
  return <section className="overflow-hidden rounded-lg border bg-card shadow-sm"><div className="p-3 md:p-4"><h2 className="text-sm font-semibold">Inbox hợp nhất</h2><p className="text-xs text-muted-foreground">Bình luận và tin nhắn mới nhất từ Facebook.</p></div><Separator />{events.length ? <Table><TableHeader><TableRow><TableHead>Khách hàng</TableHead><TableHead>Nội dung</TableHead><TableHead className="hidden w-40 md:table-cell">Loại</TableHead><TableHead className="w-44 text-right">Thời gian</TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={event.event_id}><TableCell className="max-w-40 truncate font-medium">{event.external_actor_id ?? "Khách Facebook"}</TableCell><TableCell className="max-w-80 truncate">{event.message_text ?? "Không có nội dung"}</TableCell><TableCell className="hidden md:table-cell"><Badge variant="outline">{eventKind(event.event_kind)}</Badge></TableCell><TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{dateTime(event.received_at)}</TableCell></TableRow>)}</TableBody></Table> : <EmptyState icon={<Inbox />} title="Inbox đang trống" detail="Bình luận mới sẽ xuất hiện tại đây." />}</section>;
}

function CartList({ carts }: { carts: Cart[] }) {
  if (!carts.length) return <section className="rounded-lg border bg-card shadow-sm"><EmptyState icon={<ShoppingCart />} title="Chưa có giỏ hàng Facebook" detail="Rule từ khóa sẽ tự gom sản phẩm vào giỏ của từng khách." /></section>;
  return <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Giỏ hàng đang xử lý">{carts.map((cart) => <article key={cart.cart_id} className="rounded-lg border bg-card p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{cart.customer_name || `Khách ${cart.external_actor_id.slice(-6)}`}</p><p className="mt-0.5 text-xs text-muted-foreground">{cart.item_quantity} sản phẩm</p></div><StatusBadge tone={cart.status === "open" ? "warning" : "info"}>{cartStatus(cart.status)}</StatusBadge></div><Separator className="my-3" /><p className="text-xs text-muted-foreground">Cập nhật {dateTime(cart.modified_at)}</p></article>)}</section>;
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string | number; icon: ReactNode; tone: "info" | "warning" | "success" | "neutral" }) {
  const toneClass = tone === "info" ? "bg-info/10 text-info-text" : tone === "warning" ? "bg-warning/10 text-warning-text" : tone === "success" ? "bg-success/10 text-success-text" : "bg-muted text-muted-foreground";
  return <article className="rounded-lg border bg-card p-3 shadow-sm"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs text-muted-foreground">{label}</p><span className={`grid size-7 shrink-0 place-items-center rounded-md [&>svg]:size-4 ${toneClass}`}>{icon}</span></div><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></article>;
}
function ChannelCard({ label, count }: { label: string; count: number }) { return <article className="rounded-lg border bg-background p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{label}</p><StatusBadge tone={count ? "success" : "muted"}>{count ? "Có dữ liệu" : "Chưa có đơn"}</StatusBadge></div><p className="mt-2 text-2xl font-semibold tabular-nums">{count}</p><p className="text-xs text-muted-foreground">đơn đã đồng bộ</p></article>; }
function ProviderBadge({ provider }: { provider: string }) { return <Badge variant="outline">{provider === "tiktok_shop" ? "TikTok Shop" : provider === "shopee" ? "Shopee" : provider === "lazada" ? "Lazada" : provider}</Badge>; }
function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert"><AlertTriangle className="size-4 shrink-0 text-destructive" /><div className="min-w-0 flex-1"><p className="font-medium text-destructive">Không tải được Trung tâm bán hàng</p><p className="mt-0.5 text-xs text-muted-foreground">{message}</p></div><Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="size-4" /> Thử lại</Button></div>; }
function EmptyState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) { return <div className="grid min-h-52 place-items-center p-6 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground [&>svg]:size-5">{icon}</span><p className="mt-3 text-sm font-medium">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>{action ? <div className="mt-4">{action}</div> : null}</div></div>; }
function OverviewSkeleton() { return <div className="space-y-4" aria-label="Đang tải tổng quan"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-72" /></div>; }
function ListSkeleton() { return <div className="space-y-2 rounded-lg border bg-card p-3"><Skeleton className="h-8 w-56" />{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>; }

class SocialApiError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "SocialApiError"; } }
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: string } };
  if (!response.ok) {
    const code = body.error?.code;
    const message = code === "FACEBOOK_NOT_CONFIGURED" ? "Kết nối Facebook chưa được cấu hình trên máy chủ." : code === "PERMISSION_DENIED" ? "Tài khoản không có quyền thực hiện thao tác này." : body.error?.message ?? code ?? `HTTP ${response.status}`;
    throw new SocialApiError(message, response.status, code);
  }
  return body;
}
function eventKind(value: string) { if (value.includes("message")) return "Tin nhắn"; if (value.includes("comment")) return "Bình luận"; return value; }
function cartStatus(value: string) { if (value === "open") return "Đang mở"; if (value === "confirmed") return "Đã xác nhận"; if (value === "converted") return "Đã tạo đơn"; if (value === "abandoned") return "Đã bỏ"; return value; }
function orderStatus(value: string) { if (value === "confirmed") return "Đã xác nhận"; if (value === "packing") return "Đóng gói"; if (value === "shipped") return "Đang giao"; if (value === "completed") return "Hoàn tất"; if (value === "cancelled") return "Đã hủy"; if (value === "returned") return "Đã trả"; return value; }
function orderTone(value: string): "success" | "warning" | "info" | "muted" { if (value === "completed") return "success"; if (value === "cancelled" || value === "returned") return "warning"; if (value === "shipped" || value === "packing") return "info"; return "muted"; }
function dateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN"); }
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
