import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Boxes, Facebook, Inbox, Loader2, PackageCheck, RefreshCw, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@metaforge/ui";

type Tab = "overview" | "inbox" | "carts";
interface Summary { active_pages: number; events_today: number; open_carts: number; active_orders: number; cod_pending_minor: number }
interface Page { page_id: string; page_name: string; status: string }
interface Event { event_id: string; event_kind: string; message_text?: string; external_actor_id?: string; received_at: string }
interface Cart { cart_id: string; external_actor_id: string; status: string; customer_name?: string; item_quantity: number; modified_at: string }

export function SocialCommerce() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<Summary>(); const [pages, setPages] = useState<Page[]>([]);
  const [events, setEvents] = useState<Event[]>([]); const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const [nextSummary, nextPages, nextEvents, nextCarts] = await Promise.all([
        api<Summary>("/api/v1/social/summary"), api<{ pages: Page[] }>("/api/v1/social/pages"),
        api<{ events: Event[] }>("/api/v1/social/events"), api<{ carts: Cart[] }>("/api/v1/social/carts"),
      ]);
      setSummary(nextSummary); setPages(nextPages.pages); setEvents(nextEvents.events); setCarts(nextCarts.carts);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không tải được dữ liệu"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function connectFacebook() {
    try { const result = await api<{ authorization_url: string }>("/api/v1/social/facebook/oauth/start", { method: "POST" }); window.location.assign(result.authorization_url); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Không bắt đầu được Facebook OAuth"); }
  }
  return <div className="min-h-dvh bg-background pb-20 text-foreground md:pb-6">
    <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div><p className="text-xs font-medium text-muted-foreground">Kairo Social Commerce</p><h1 className="text-xl font-semibold">Bán hàng Facebook</h1></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="size-4" /> Làm mới</Button><Button size="sm" onClick={() => void connectFacebook()}><Facebook className="size-4" /> Kết nối Page</Button></div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      {error ? <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-7 animate-spin text-muted-foreground" /></div> : <>
        <nav className="mb-5 hidden gap-2 md:flex">{(["overview", "inbox", "carts"] as Tab[]).map((value) => <Button key={value} variant={tab === value ? "default" : "outline"} onClick={() => setTab(value)}>{label(value)}</Button>)}</nav>
        {tab === "overview" ? <Overview summary={summary} pages={pages} onConnect={() => void connectFacebook()} /> : null}
        {tab === "inbox" ? <InboxList events={events} /> : null}
        {tab === "carts" ? <CartList carts={carts} /> : null}
      </>}
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-background p-2 md:hidden">
      <MobileTab active={tab === "overview"} icon={<Boxes />} label="Tổng quan" onClick={() => setTab("overview")} />
      <MobileTab active={tab === "inbox"} icon={<Inbox />} label="Inbox" onClick={() => setTab("inbox")} />
      <MobileTab active={tab === "carts"} icon={<ShoppingCart />} label="Giỏ hàng" onClick={() => setTab("carts")} />
    </nav>
  </div>;
}

function Overview({ summary, pages, onConnect }: { summary?: Summary; pages: Page[]; onConnect: () => void }) {
  const cards = [{ label: "Sự kiện hôm nay", value: summary?.events_today ?? 0, icon: <Inbox /> }, { label: "Giỏ đang mở", value: summary?.open_carts ?? 0, icon: <ShoppingCart /> },
    { label: "Đơn đang xử lý", value: summary?.active_orders ?? 0, icon: <PackageCheck /> }, { label: "COD chờ đối soát", value: money(summary?.cod_pending_minor ?? 0), icon: <Truck /> }];
  return <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <article key={card.label} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="mb-4 text-primary [&>svg]:size-5">{card.icon}</div><p className="text-2xl font-semibold">{card.value}</p><p className="text-sm text-muted-foreground">{card.label}</p></article>)}</section>
    <section className="rounded-2xl border bg-card p-4"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Facebook Pages</h2><p className="text-sm text-muted-foreground">{pages.length} Page đang được quản lý</p></div><Button variant="outline" size="sm" onClick={onConnect}>Thêm Page</Button></div>
      {pages.length ? <div className="grid gap-2 sm:grid-cols-2">{pages.map((page) => <div key={page.page_id} className="flex items-center gap-3 rounded-xl border p-3"><span className="grid size-9 place-items-center rounded-full bg-blue-600 text-white"><Facebook className="size-4" /></span><div><p className="font-medium">{page.page_name}</p><p className="text-xs text-emerald-600">Đang kết nối</p></div></div>)}</div> : <Empty title="Chưa kết nối Facebook Page" detail="Kết nối bằng OAuth chính thức để bắt đầu nhận bình luận." action={<Button onClick={onConnect}>Kết nối ngay</Button>} />}
    </section></div>;
}
function InboxList({ events }: { events: Event[] }) { return <section className="rounded-2xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Inbox hợp nhất</h2><p className="text-sm text-muted-foreground">Bình luận và tin nhắn mới nhất</p></div>{events.length ? <div className="divide-y">{events.map((event) => <div key={event.event_id} className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr_auto]"><p className="text-sm font-medium">{event.external_actor_id ?? "Khách Facebook"}</p><p className="text-sm">{event.message_text ?? `[${event.event_kind}]`}</p><time className="text-xs text-muted-foreground">{new Date(event.received_at).toLocaleString("vi-VN")}</time></div>)}</div> : <Empty title="Inbox đang trống" detail="Bình luận mới sẽ xuất hiện tại đây." />}</section>; }
function CartList({ carts }: { carts: Cart[] }) { return <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{carts.length ? carts.map((cart) => <article key={cart.cart_id} className="rounded-2xl border bg-card p-4"><div className="flex items-start justify-between"><div><p className="font-medium">{cart.customer_name || `Khách ${cart.external_actor_id.slice(-6)}`}</p><p className="text-sm text-muted-foreground">{cart.item_quantity} sản phẩm</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{cart.status}</span></div><p className="mt-5 text-xs text-muted-foreground">Cập nhật {new Date(cart.modified_at).toLocaleString("vi-VN")}</p></article>) : <div className="md:col-span-2 xl:col-span-3"><Empty title="Chưa có giỏ hàng" detail="Rule từ khóa sẽ tự gom sản phẩm vào giỏ của từng khách." /></div>}</section>; }
function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="grid min-h-48 place-items-center p-6 text-center"><div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p>{action ? <div className="mt-4">{action}</div> : null}</div></div>; }
function MobileTab({ active, icon, label: text, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button className={`flex flex-col items-center gap-1 rounded-lg py-1 text-xs ${active ? "text-primary" : "text-muted-foreground"}`} onClick={onClick}><span className="[&>svg]:size-5">{icon}</span>{text}</button>; }
function label(tab: Tab) { return tab === "overview" ? "Tổng quan" : tab === "inbox" ? "Inbox" : "Giỏ hàng"; }
function money(minor: number) { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(minor); }
async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { credentials: "include", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } }); const body = await response.json() as T & { error?: { message?: string; code?: string } }; if (!response.ok) throw new Error(body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`); return body; }
