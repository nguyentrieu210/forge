import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

interface WebsiteSiteData {
  site: {
    title: string;
    description?: string;
    home_page: string;
    template_preset: string;
    theme_preset: string;
    logo?: string | null;
    favicon?: string | null;
    contact_phone?: string;
    contact_email?: string;
    address?: string;
    footer_text?: string;
  };
  theme: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    heading_font: "system" | "serif" | "rounded";
    body_font: "system" | "serif" | "rounded";
    radius: "square" | "soft" | "round";
    density: "compact" | "comfortable" | "touch";
  };
  navigation: Array<{ slug: string; label: string }>;
  page: {
    slug: string;
    title: string;
    meta_title: string;
    meta_description?: string;
    blocks: WebsiteBlock[];
  };
}

interface WebsiteBlock {
  id: string;
  type: "hero" | "text" | "features" | "image-gallery" | "project-gallery" | "product-grid" | "cta" | "contact";
  eyebrow?: string;
  heading?: string;
  body?: string;
  image?: string;
  button_label?: string;
  button_url?: string;
  tone?: "neutral" | "primary" | "muted" | "dark";
  align?: "left" | "center";
  columns?: number;
  source?: "none" | "storefront-catalog";
  limit?: number;
}

interface StorefrontProduct {
  name: string;
  item_code?: string;
  item_name?: string;
  retail_price?: number | string | null;
  image?: string | null;
  short_description?: string | null;
  slug?: string | null;
}

interface MethodEnvelope<T> { message?: T; exception?: string }

export function mountWebsite(data: WebsiteSiteData): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("Website root element is missing");
  createRoot(root).render(<WebsiteSite data={data} />);
}

function WebsiteSite({ data }: { data: WebsiteSiteData }) {
  const style = {
    "--site-primary": data.theme.primary,
    "--site-secondary": data.theme.secondary,
    "--site-background": data.theme.background,
    "--site-surface": data.theme.surface,
    "--site-text": data.theme.text,
    "--site-muted": data.theme.muted,
    "--site-radius": radius(data.theme.radius),
    "--site-heading-font": fontFamily(data.theme.heading_font),
    "--site-body-font": fontFamily(data.theme.body_font),
  } as CSSProperties;
  const sectionPadding = data.theme.density === "compact" ? "py-10" : data.theme.density === "touch" ? "py-20" : "py-14";

  useEffect(() => {
    document.title = data.page.meta_title || data.page.title || data.site.title;
    setMetaDescription(data.page.meta_description || data.site.description || "");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", data.theme.primary);
    if (data.site.favicon) document.getElementById("app-icon")?.setAttribute("href", data.site.favicon);
  }, [data]);

  return (
    <div style={style} className="min-h-screen bg-[var(--site-background)] font-[var(--site-body-font)] text-[var(--site-text)]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[color-mix(in_srgb,var(--site-background)_92%,transparent)] backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3 font-[var(--site-heading-font)] font-semibold">
            {data.site.logo ? <img src={data.site.logo} alt="" className="h-9 w-auto max-w-40 object-contain" /> : null}
            <span className="truncate">{data.site.title}</span>
          </a>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Điều hướng website">
            {data.navigation.map((item) => (
              <a key={item.slug} href={pageHref(item.slug, data.site.home_page)} className="rounded-lg px-3 py-2 text-sm hover:bg-black/5">
                {item.label}
              </a>
            ))}
          </nav>
          <a href="/login" className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">Đăng nhập</a>
        </div>
      </header>

      <main>
        {data.page.blocks.map((block) => (
          <WebsiteBlockView key={block.id} block={block} site={data.site} sectionPadding={sectionPadding} />
        ))}
        {!data.page.blocks.length ? (
          <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
            <h1 className="font-[var(--site-heading-font)] text-3xl font-semibold">{data.page.title}</h1>
            <p className="mt-3 text-[var(--site-muted)]">Trang này chưa có nội dung công khai.</p>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-black/10 bg-[var(--site-surface)]">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 text-sm sm:px-6 md:grid-cols-2 lg:px-8">
          <div>
            <div className="font-[var(--site-heading-font)] text-base font-semibold">{data.site.title}</div>
            {data.site.footer_text ? <p className="mt-2 max-w-xl text-[var(--site-muted)]">{data.site.footer_text}</p> : null}
          </div>
          <div className="space-y-1 md:text-right text-[var(--site-muted)]">
            {data.site.contact_phone ? <div>{data.site.contact_phone}</div> : null}
            {data.site.contact_email ? <div>{data.site.contact_email}</div> : null}
            {data.site.address ? <div>{data.site.address}</div> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}

function WebsiteBlockView({ block, site, sectionPadding }: { block: WebsiteBlock; site: WebsiteSiteData["site"]; sectionPadding: string }) {
  const align = block.align === "center" ? "text-center items-center" : "text-left items-start";
  const tone = block.tone ?? "neutral";
  const toneClass = tone === "primary"
    ? "bg-[var(--site-primary)] text-white"
    : tone === "dark"
      ? "bg-slate-950 text-white"
      : tone === "muted"
        ? "bg-[var(--site-surface)] text-[var(--site-text)]"
        : "bg-[var(--site-background)] text-[var(--site-text)]";

  if (block.type === "hero") {
    return (
      <section className={`${toneClass} ${sectionPadding}`}>
        <div className={`mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8 ${align}`}>
          {block.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">{block.eyebrow}</p> : null}
          <h1 className="max-w-4xl font-[var(--site-heading-font)] text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{block.heading}</h1>
          {block.body ? <p className="max-w-3xl text-base leading-7 opacity-85 sm:text-lg">{block.body}</p> : null}
          {block.button_label && block.button_url ? <PrimaryLink href={block.button_url} tone={tone}>{block.button_label}</PrimaryLink> : null}
          {block.image ? <img src={block.image} alt="" className="mt-2 max-h-[34rem] w-full rounded-[var(--site-radius)] object-cover" /> : null}
        </div>
      </section>
    );
  }

  if (block.type === "product-grid") {
    return <ProductGrid block={block} sectionPadding={sectionPadding} />;
  }

  if (block.type === "features") {
    const items = (block.body ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const columns = Math.min(Math.max(block.columns ?? 3, 1), 4);
    return (
      <section className={`${toneClass} ${sectionPadding}`}>
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading block={block} />
          <div className="mt-8 grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {items.map((item) => <div key={item} className="rounded-[var(--site-radius)] border border-black/10 bg-[var(--site-surface)] p-5 font-medium text-[var(--site-text)]">{item}</div>)}
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "contact") {
    return (
      <section className={`${toneClass} ${sectionPadding}`}>
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          <div><SectionHeading block={block} /></div>
          <div className="rounded-[var(--site-radius)] border border-black/10 bg-[var(--site-background)] p-6 text-[var(--site-text)]">
            {site.contact_phone ? <ContactLine label="Điện thoại" value={site.contact_phone} href={`tel:${site.contact_phone}`} /> : null}
            {site.contact_email ? <ContactLine label="Email" value={site.contact_email} href={`mailto:${site.contact_email}`} /> : null}
            {site.address ? <ContactLine label="Địa chỉ" value={site.address} /> : null}
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "cta") {
    return (
      <section className={`${toneClass} ${sectionPadding}`}>
        <div className={`mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 sm:px-6 lg:px-8 ${align}`}>
          <SectionHeading block={block} />
          {block.button_label && block.button_url ? <PrimaryLink href={block.button_url} tone={tone}>{block.button_label}</PrimaryLink> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={`${toneClass} ${sectionPadding}`}>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading block={block} />
        {block.image ? <img src={block.image} alt="" className="mt-8 max-h-[36rem] w-full rounded-[var(--site-radius)] object-cover" /> : null}
      </div>
    </section>
  );
}

function SectionHeading({ block }: { block: WebsiteBlock }) {
  return (
    <div className={block.align === "center" ? "text-center" : "text-left"}>
      {block.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{block.eyebrow}</p> : null}
      {block.heading ? <h2 className="mt-2 font-[var(--site-heading-font)] text-2xl font-semibold tracking-tight sm:text-3xl">{block.heading}</h2> : null}
      {block.body ? <p className="mt-3 max-w-3xl whitespace-pre-line leading-7 opacity-80">{block.body}</p> : null}
    </div>
  );
}

function PrimaryLink({ href, tone, children }: { href: string; tone: WebsiteBlock["tone"]; children: ReactNode }) {
  const inverted = tone === "primary" || tone === "dark";
  return <a href={href} className={`inline-flex rounded-[var(--site-radius)] px-5 py-3 text-sm font-semibold transition hover:opacity-90 ${inverted ? "bg-white text-slate-950" : "bg-[var(--site-primary)] text-white"}`}>{children}</a>;
}

function ContactLine({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="border-b border-black/10 py-3 last:border-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--site-muted)]">{label}</div>
      {href ? <a className="mt-1 block font-medium hover:underline" href={href}>{value}</a> : <div className="mt-1 font-medium">{value}</div>}
    </div>
  );
}

function ProductGrid({ block, sectionPadding }: { block: WebsiteBlock; sectionPadding: string }) {
  const [items, setItems] = useState<StorefrontProduct[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let alive = true;
    callMethod<{ items: StorefrontProduct[] }>("forge.storefront.catalog", { limit: Math.min(Math.max(block.limit ?? 6, 1), 24) })
      .then((result) => { if (alive) { setItems(result.items ?? []); setStatus("ready"); } })
      .catch(() => { if (alive) setStatus("unavailable"); });
    return () => { alive = false; };
  }, [block.limit]);

  const columns = Math.min(Math.max(block.columns ?? 3, 1), 4);
  return (
    <section className={`${sectionPadding} bg-[var(--site-background)] text-[var(--site-text)]`}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <SectionHeading block={block} />
          <a href="/shop" className="shrink-0 text-sm font-semibold text-[var(--site-primary)] hover:underline">Mở cửa hàng</a>
        </div>
        {status === "loading" ? <p className="mt-8 text-sm text-[var(--site-muted)]">Đang tải sản phẩm…</p> : null}
        {status === "unavailable" ? <p className="mt-8 rounded-[var(--site-radius)] border border-dashed p-5 text-sm text-[var(--site-muted)]">Danh mục bán hàng chưa được bật cho tenant này.</p> : null}
        {status === "ready" ? (
          <div className="mt-8 grid gap-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {items.map((item) => {
              const code = item.item_code ?? item.name;
              const title = item.item_name ?? item.name;
              const href = item.slug ? `/shop/${encodeURIComponent(item.slug)}` : "/shop";
              return (
                <a key={code} href={href} className="overflow-hidden rounded-[var(--site-radius)] border border-black/10 bg-[var(--site-surface)] transition hover:-translate-y-0.5 hover:shadow-lg">
                  {item.image ? <img src={item.image} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3] bg-black/5" />}
                  <div className="p-4">
                    <h3 className="font-[var(--site-heading-font)] font-semibold">{title}</h3>
                    {item.short_description ? <p className="mt-1 line-clamp-2 text-sm text-[var(--site-muted)]">{item.short_description}</p> : null}
                    {item.retail_price !== undefined && item.retail_price !== null ? <p className="mt-3 font-semibold text-[var(--site-primary)]">{money(item.retail_price)}</p> : null}
                  </div>
                </a>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

async function callMethod<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const response = await fetch(`/api/method/${method}?${query}`, { credentials: "same-origin", headers: { accept: "application/json" } });
  const parsed = await response.json().catch(() => null) as MethodEnvelope<T> | null;
  if (!response.ok || !parsed?.message) throw new Error(parsed?.exception ?? `HTTP ${response.status}`);
  return parsed.message;
}

function pageHref(slug: string, homePage: string): string {
  return slug === homePage ? "/" : `/${encodeURIComponent(slug)}`;
}

function money(value: number | string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("vi-VN")}₫` : String(value);
}

function fontFamily(value: WebsiteSiteData["theme"]["heading_font"]): string {
  if (value === "serif") return "ui-serif, Georgia, Cambria, Times New Roman, serif";
  if (value === "rounded") return "ui-rounded, system-ui, sans-serif";
  return "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
}

function radius(value: WebsiteSiteData["theme"]["radius"]): string {
  if (value === "square") return "0.25rem";
  if (value === "round") return "1.5rem";
  return "0.75rem";
}

function setMetaDescription(value: string): void {
  let node = document.querySelector('meta[name="description"]');
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("name", "description");
    document.head.appendChild(node);
  }
  node.setAttribute("content", value);
}
