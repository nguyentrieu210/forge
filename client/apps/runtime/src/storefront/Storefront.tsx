/**
 * The public shop: catalogue, product, cart, checkout, order tracking.
 *
 * Rendered by the SAME bundle as the Desk and served from the SAME origin, which is what
 * makes an image URL like `/files/…` and an API call like `forge.storefront.catalog`
 * work without a second deployment, a proxy, or a CORS policy.
 *
 * THE CART LIVES IN THE BROWSER. There is no cart table, and adding one would be the
 * single largest source of junk rows in the database: a row per anonymous visitor who
 * ever clicked "add", none of which becomes an order. What the server sees is one write,
 * at checkout, of the whole basket.
 *
 * PRICES SHOWN HERE ARE NOT THE PRICES CHARGED. The server re-reads every rate from the
 * published product when the order is placed. This component displays a total so the
 * buyer knows what they are agreeing to; it is not the arithmetic of record.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Minus, PackageSearch, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import {
  Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn,
} from "@metaforge/ui";

export type StorefrontPage = "/shop" | "/shop/product" | "/shop/cart" | "/shop/track";

/** Exactly the fields the fertiliser brief publishes. Anything absent renders as absent. */
export interface StorefrontProduct {
  name: string;
  item_code: string;
  item_name: string;
  item_group?: string | null;
  stock_uom?: string | null;
  pack_size?: string | null;
  retail_price?: number | string | null;
  npk_ratio?: string | null;
  rice_variety?: string | null;
  alcohol_abv?: number | null;
  origin?: string | null;
  image?: string | null;
  short_description?: string | null;
  slug?: string | null;
}

interface CartLine {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  image?: string | null;
  stock_uom?: string | null;
}

const CART_KEY = "forge.storefront.cart";
/** Groups needing an age check before checkout, per the alcohol advertising rules. */
const AGE_RESTRICTED = new Set(["Rượu"]);

function money(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString("vi-VN")}₫`;
}

function readCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) as CartLine[] : [];
    return Array.isArray(parsed) ? parsed.filter((line) => line?.item_code && line.qty > 0) : [];
  } catch {
    // A corrupted cart is not worth an error screen; it is worth an empty cart.
    return [];
  }
}

function writeCart(lines: CartLine[]): void {
  try { window.localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch { /* private mode */ }
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(() => (typeof window === "undefined" ? [] : readCart()));

  const persist = useCallback((next: CartLine[]) => {
    setLines(next);
    writeCart(next);
  }, []);

  const add = useCallback((product: StorefrontProduct, qty = 1) => {
    const next = readCart();
    const existing = next.find((line) => line.item_code === product.item_code);
    if (existing) existing.qty += qty;
    else {
      next.push({
        item_code: product.item_code,
        item_name: product.item_name,
        qty,
        rate: Number(product.retail_price ?? 0),
        image: product.image ?? null,
        stock_uom: product.stock_uom ?? null,
      });
    }
    persist(next);
  }, [persist]);

  const setQty = useCallback((code: string, qty: number) => {
    persist(readCart().map((line) => (line.item_code === code ? { ...line, qty } : line)).filter((line) => line.qty > 0));
  }, [persist]);

  const remove = useCallback((code: string) => {
    persist(readCart().filter((line) => line.item_code !== code));
  }, [persist]);

  const clear = useCallback(() => persist([]), [persist]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.rate * line.qty, 0), [lines]);
  const count = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);

  return { lines, add, setQty, remove, clear, total, count };
}

export function Storefront({ page, adapter }: { page: StorefrontPage; adapter: FrappeAdapter }) {
  const cart = useCart();

  useEffect(() => {
    document.documentElement.dataset.brand = "warm";
    document.title = "Cửa hàng";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShopHeader cartCount={cart.count} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {page === "/shop" ? <CatalogPage adapter={adapter} cart={cart} /> : null}
        {page === "/shop/product" ? <ProductPage adapter={adapter} cart={cart} /> : null}
        {page === "/shop/cart" ? <CartPage adapter={adapter} cart={cart} /> : null}
        {page === "/shop/track" ? <TrackPage adapter={adapter} /> : null}
      </main>
      <footer className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
        <p>Giá niêm yết đã gồm thuế. Đơn hàng được xác nhận qua điện thoại trước khi giao.</p>
        <p className="mt-2">Sản phẩm có cồn: không bán cho người dưới 18 tuổi.</p>
      </footer>
    </div>
  );
}

function ShopHeader({ cartCount }: { cartCount: number }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <a href="/shop" className="text-base font-semibold tracking-tight">Cửa hàng</a>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <a href="/shop" className="rounded-md px-3 py-2 hover:bg-muted">Sản phẩm</a>
          <a href="/shop/track" className="rounded-md px-3 py-2 hover:bg-muted">Tra cứu đơn</a>
          <a href="/shop/cart" className="relative inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
            <ShoppingCart className="size-4" />
            <span className="hidden sm:inline">Giỏ hàng</span>
            {cartCount > 0 ? (
              <span className="grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {cartCount}
              </span>
            ) : null}
          </a>
        </nav>
      </div>
    </header>
  );
}

type Cart = ReturnType<typeof useCart>;

function CatalogPage({ adapter, cart }: { adapter: FrappeAdapter; cart: Cart }) {
  const [items, setItems] = useState<StorefrontProduct[]>([]);
  const [facets, setFacets] = useState<string[]>([]);
  const [facet, setFacet] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setState("loading");
    adapter.callGet<{ items: StorefrontProduct[]; facets: string[] }>("forge.storefront.catalog", {
      ...(search ? { search } : {}),
      ...(facet ? { facet } : {}),
      limit: 60,
    })
      .then((result) => {
        if (!alive) return;
        setItems(result.items ?? []);
        // Facets come back filtered by the same query, so keep the first full set: a
        // filter list that shrinks as you use it is a filter list you cannot get out of.
        setFacets((previous) => (previous.length && (search || facet) ? previous : result.facets ?? []));
        setState("ready");
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setState("error");
      });
    return () => { alive = false; };
  }, [adapter, search, facet]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-muted/30 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Phân bón, gạo và rượu</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Đặt hàng trực tuyến hoặc để lại số điện thoại, nhân viên gọi xác nhận trước khi giao.
          Đại lý và hợp tác xã liên hệ để nhận báo giá theo sản lượng.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm sản phẩm…"
            defaultValue={search}
            onKeyDown={(event) => { if (event.key === "Enter") setSearch((event.target as HTMLInputElement).value.trim()); }}
            aria-label="Tìm sản phẩm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FacetChip label="Tất cả" active={facet === ""} onClick={() => setFacet("")} />
          {facets.map((value) => (
            <FacetChip key={value} label={value} active={facet === value} onClick={() => setFacet(value)} />
          ))}
        </div>
      </div>

      {state === "loading" ? <Centered><Loader2 className="size-5 animate-spin" /> Đang tải sản phẩm…</Centered> : null}
      {state === "error" ? <Centered tone="error">Không tải được danh mục: {error}</Centered> : null}
      {state === "ready" && items.length === 0 ? (
        <Centered><PackageSearch className="size-5" /> Không có sản phẩm nào khớp.</Centered>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((product) => <ProductCard key={product.item_code} product={product} onAdd={() => cart.add(product)} />)}
      </div>
    </div>
  );
}

function FacetChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-auto rounded-full px-3 py-1.5 text-sm transition",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >{label}</Button>
  );
}

function ProductCard({ product, onAdd }: { product: StorefrontProduct; onAdd: () => void }) {
  const href = product.slug ? `/shop/${encodeURIComponent(product.slug)}` : undefined;
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <a href={href} className="block aspect-[4/3] overflow-hidden bg-muted">
        {product.image
          ? <img src={product.image} alt={product.item_name} loading="lazy" className="size-full object-cover" />
          : <span className="grid size-full place-items-center text-sm text-muted-foreground">Chưa có ảnh</span>}
      </a>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <a href={href} className="font-medium leading-snug hover:underline">{product.item_name}</a>
          {product.item_group ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{product.item_group}</span> : null}
        </div>
        {product.pack_size ? <p className="text-sm text-muted-foreground">{product.pack_size}</p> : null}
        {product.npk_ratio ? <p className="text-sm text-muted-foreground">NPK {product.npk_ratio}</p> : null}
        {product.alcohol_abv ? <p className="text-sm text-muted-foreground">{product.alcohol_abv}% vol</p> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-lg font-semibold">{money(product.retail_price)}</span>
          <Button type="button" size="sm" onClick={onAdd}>Thêm vào giỏ</Button>
        </div>
      </div>
    </article>
  );
}

function ProductPage({ adapter, cart }: { adapter: FrappeAdapter; cart: Cart }) {
  const slug = decodeURIComponent(window.location.pathname.replace(/^\/shop\//, "").replace(/\/+$/, ""));
  const [product, setProduct] = useState<StorefrontProduct>();
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    adapter.callGet<StorefrontProduct>("forge.storefront.product", { slug })
      .then((value) => { if (alive) setProduct(value); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; };
  }, [adapter, slug]);

  if (error) return <Centered tone="error">Không tìm thấy sản phẩm này.</Centered>;
  if (!product) return <Centered><Loader2 className="size-5 animate-spin" /> Đang tải…</Centered>;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="overflow-hidden rounded-xl border bg-muted">
        {product.image
          ? <img src={product.image} alt={product.item_name} className="size-full object-cover" />
          : <div className="grid aspect-[4/3] place-items-center text-muted-foreground">Chưa có ảnh</div>}
      </div>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.item_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mã hàng: {product.item_code}</p>
        </div>
        <p className="text-3xl font-semibold">{money(product.retail_price)}</p>
        {product.short_description ? <p className="text-muted-foreground">{product.short_description}</p> : null}
        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm">
          <Spec label="Quy cách" value={product.pack_size} />
          <Spec label="Đơn vị" value={product.stock_uom} />
          <Spec label="Tỷ lệ NPK" value={product.npk_ratio} />
          <Spec label="Giống / loại" value={product.rice_variety} />
          <Spec label="Nồng độ cồn" value={product.alcohol_abv ? `${product.alcohol_abv}% vol` : null} />
          <Spec label="Xuất xứ" value={product.origin} />
        </dl>
        <div className="flex gap-3">
          <Button type="button" onClick={() => cart.add(product)}>Thêm vào giỏ</Button>
          <a href="/shop/cart" className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted">Đi tới giỏ hàng</a>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function CartPage({ adapter, cart }: { adapter: FrappeAdapter; cart: Cart }) {
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ code: string } | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    buyer_name: "", phone: "", email: "", ship_address: "", province: "",
    payment_method: "COD", note: "", age_confirmed: false,
  });

  // Alcohol is the only line type that needs the age box; asking every buyer to tick it
  // trains them to tick without reading, which is worse than not asking.
  const needsAgeCheck = useMemo(
    () => cart.lines.some((line) => AGE_RESTRICTED.has(String(line.item_name).includes("Rượu") ? "Rượu" : "")),
    [cart.lines],
  );

  async function submit(): Promise<void> {
    setError("");
    if (!form.buyer_name.trim() || !form.phone.trim() || !form.ship_address.trim()) {
      setError("Vui lòng điền họ tên, số điện thoại và địa chỉ giao hàng.");
      return;
    }
    if (needsAgeCheck && !form.age_confirmed) {
      setError("Đơn có sản phẩm chứa cồn: vui lòng xác nhận bạn đủ 18 tuổi.");
      return;
    }
    setPlacing(true);
    try {
      const result = await adapter.callPost<{ code: string }>("forge.storefront.place_order", {
        order: {
          ...form,
          age_confirmed: form.age_confirmed ? 1 : 0,
          // Only the code and the quantity matter; the server prices every line itself.
          items: cart.lines.map((line) => ({ item_code: line.item_code, qty: line.qty })),
        },
      });
      cart.clear();
      setPlaced(result);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPlacing(false);
    }
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border p-6 text-center">
        <h1 className="text-xl font-semibold">Đã nhận đơn hàng</h1>
        <p className="text-muted-foreground">Mã đơn của bạn là</p>
        <p className="text-2xl font-semibold tracking-tight">{placed.code}</p>
        <p className="text-sm text-muted-foreground">
          Nhân viên sẽ gọi xác nhận trước khi giao. Lưu mã đơn này để tra cứu — cần đúng
          số điện thoại đã đặt.
        </p>
        <a href="/shop/track" className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted">Tra cứu đơn</a>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return <Centered><ShoppingCart className="size-5" /> Giỏ hàng đang trống. <a className="ml-1 underline" href="/shop">Xem sản phẩm</a></Centered>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Giỏ hàng</h1>
        {cart.lines.map((line) => (
          <div key={line.item_code} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
              {line.image ? <img src={line.image} alt="" className="size-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{line.item_name}</p>
              <p className="text-sm text-muted-foreground">{money(line.rate)} / {line.stock_uom ?? "đơn vị"}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon-sm" aria-label="Giảm" onClick={() => cart.setQty(line.item_code, line.qty - 1)}><Minus className="size-4" /></Button>
              <span className="w-10 text-center tabular-nums">{line.qty}</span>
              <Button type="button" variant="outline" size="icon-sm" aria-label="Tăng" onClick={() => cart.setQty(line.item_code, line.qty + 1)}><Plus className="size-4" /></Button>
            </div>
            <p className="w-28 text-right font-medium tabular-nums">{money(line.rate * line.qty)}</p>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Xoá" onClick={() => cart.remove(line.item_code)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
          <span className="font-medium">Tạm tính</span>
          <span className="text-xl font-semibold tabular-nums">{money(cart.total)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Số tiền cuối cùng do nhân viên xác nhận theo bảng giá hiện hành và phí giao hàng.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">Thông tin nhận hàng</h2>
        <Field label="Họ và tên" required value={form.buyer_name} onChange={(value) => setForm({ ...form, buyer_name: value })} />
        <Field label="Số điện thoại" required value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <Field label="Địa chỉ giao hàng" required value={form.ship_address} onChange={(value) => setForm({ ...form, ship_address: value })} />
        <Field label="Tỉnh/Thành" value={form.province} onChange={(value) => setForm({ ...form, province: value })} />
        <div className="space-y-1.5">
          <Label htmlFor="payment">Hình thức thanh toán</Label>
          <Select value={form.payment_method} onValueChange={(value) => setForm({ ...form, payment_method: value })}>
            <SelectTrigger id="payment"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COD">Thanh toán khi nhận hàng (COD)</SelectItem>
              <SelectItem value="Chuyển khoản">Chuyển khoản</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="Ghi chú" value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
        {needsAgeCheck ? (
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={form.age_confirmed}
              onCheckedChange={(checked) => setForm({ ...form, age_confirmed: Boolean(checked) })}
            />
            <span>Tôi xác nhận đã đủ 18 tuổi. Đơn hàng có sản phẩm chứa cồn.</span>
          </label>
        ) : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="button" className="w-full" disabled={placing} onClick={() => void submit()}>
          {placing ? <><Loader2 className="mr-2 size-4 animate-spin" /> Đang gửi…</> : "Đặt hàng"}
        </Button>
      </section>
    </div>
  );
}

function TrackPage({ adapter }: { adapter: FrappeAdapter }) {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ code: string; status: string; total: number | string; placed_at: string; items: Array<{ item_name: string; qty: number; amount: number | string }> }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup(): Promise<void> {
    setError("");
    setResult(undefined);
    setBusy(true);
    try {
      setResult(await adapter.callGet("forge.storefront.track_order", { code: code.trim(), phone: phone.trim() }));
    } catch {
      // The server answers the same way for a wrong code and a wrong phone number, and so
      // does this: saying which one was wrong is how an order code becomes enumerable.
      setError("Không tìm thấy đơn hàng khớp mã và số điện thoại này.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Tra cứu đơn hàng</h1>
      <p className="text-sm text-muted-foreground">
        Nhập mã đơn và số điện thoại đã dùng khi đặt. Cần đủ cả hai để bảo vệ thông tin người mua.
      </p>
      <Field label="Mã đơn" required value={code} onChange={setCode} placeholder="DW-2026-00001" />
      <Field label="Số điện thoại đã đặt" required value={phone} onChange={setPhone} placeholder="09xxxxxxxx" />
      <Button type="button" disabled={busy} onClick={() => void lookup()}>
        {busy ? <><Loader2 className="mr-2 size-4 animate-spin" /> Đang tìm…</> : "Tra cứu"}
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {result ? (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">{result.code}</span>
            <span className="rounded-full bg-muted px-3 py-1 text-sm">{result.status || "Mới"}</span>
          </div>
          <ul className="space-y-1 text-sm">
            {result.items.map((line, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>{line.item_name} × {line.qty}</span>
                <span className="tabular-nums">{money(line.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>Tổng cộng</span>
            <span className="tabular-nums">{money(result.total)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange, required, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string;
}) {
  const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-sm",
      tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </div>
  );
}
