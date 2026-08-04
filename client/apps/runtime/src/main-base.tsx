import { StrictMode, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams, type NavigateFunction } from "react-router-dom";
import { mergeLocale, resolveHomeRoute, validateManifest, type ApplicationCatalog, type AppManifest } from "@metaforge/core";
import { FrappeAdapterImpl, createScopeKey, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { MetaForgeProvider } from "@metaforge/views/provider";
import { createFullRegistry } from "@metaforge/views/registry";
import { AssistantBubble, buildPrintPath, loadRecentDocs, PrintContainer, setAssistantContext } from "@metaforge/views";
import type { UrlStateBridge } from "@metaforge/views/url-state";
import {
  AppShell, AuthBoundary, BusinessContextBar, BusinessContextProvider, I18nProvider,
  CommandPalette, LoginForm, applyBrand, applyDesign, resolveIcon, useBusinessContext, useTheme,
  type AwesomeRecord, type NavItem,
} from "@metaforge/shell";
import { Button, Toaster } from "@metaforge/ui";
import { SocialCommerceLanding, type PublicSocialPage } from "./landing/SocialCommerceLanding.js";
import { Storefront, type StorefrontPage } from "./storefront/Storefront.js";
import "./styles.css";

const ApplicationCatalogContainer = lazy(() => import("@metaforge/views/catalog").then((module) => ({ default: module.ApplicationCatalogContainer })));
const DoctypeWorkspace = lazy(() => import("@metaforge/views/doctype-workspace").then((module) => ({ default: module.DoctypeWorkspace })));
const OverviewContainer = lazy(() => import("@metaforge/views/overview").then((module) => ({ default: module.OverviewContainer })));
const PermissionCenter = lazy(() => import("@metaforge/views/permissions").then((module) => ({ default: module.PermissionCenter })));
const ProcessContainer = lazy(() => import("@metaforge/views/process").then((module) => ({ default: module.ProcessContainer })));
const ReportContainer = lazy(() => import("@metaforge/views/report").then((module) => ({ default: module.ReportContainer })));
const WorkspaceContainer = lazy(() => import("@metaforge/views/workspace").then((module) => ({ default: module.WorkspaceContainer })));
const CalendarContainer = lazy(() => import("@metaforge/views/calendar").then((module) => ({ default: module.CalendarContainer })));
const ImportContent = lazy(() => import("@metaforge/views/import").then((module) => ({ default: module.ImportContent })));
const ActionScreen = lazy(() => import("@metaforge/views/action").then((module) => ({ default: module.ActionScreen })));
const ScreenView = lazy(() => import("@metaforge/views/screen").then((module) => ({ default: module.ScreenView })));
const ApprovalInbox = lazy(() => import("./experiences/ApprovalInbox.js").then((module) => ({ default: module.ApprovalInbox })));
const SocialCommerce = lazy(() => import("./experiences/SocialCommerce.js").then((module) => ({ default: module.SocialCommerce })));
const DailyDetailedLedger = lazy(() => import("./experiences/DailyDetailedLedger.js").then((module) => ({ default: module.DailyDetailedLedger })));
const AlumdoorOperationsCenter = lazy(() => import("./experiences/AlumdoorOperationsCenter.js").then((module) => ({ default: module.AlumdoorOperationsCenter })));

/**
 * The GENERIC runtime — one bundle that serves every app on the platform.
 *
 * What changed, and why it matters: every app used to ship a `src/app-manifest.ts`
 * compiled into a build of its own. The brand, the landing screen, the nav and the
 * context dimensions were TypeScript, so "create an app" meant creating a second
 * artifact — build it, host it somewhere, keep its version in step with the metadata
 * that was already installed server-side. Installing an app only did half the job, and
 * the two halves could disagree.
 *
 * Here the manifest arrives from the server (`metaforge.api.get_app_manifest`), assembled
 * from what is actually installed on THIS tenant. So this bundle is deployed once, and
 * every app that follows is a data write. That is the whole difference between a kit and
 * a factory.
 *
 * Same-origin by construction: the adapter is given no base URL, so it calls the host it
 * was served from. The session cookie is `Secure`+`SameSite=Lax` and would not be sent
 * cross-origin, which is exactly why this must be served BY the gateway rather than from
 * a static host pointed at it.
 */
const adapter = new FrappeAdapterImpl({});
const registry = createFullRegistry();

/** The app to render, when a tenant has several installed. */
const REQUESTED_APP = new URLSearchParams(window.location.search).get("app") ?? undefined;

/**
 * Manifest được gọi NGAY khi bundle chạy, song song với boot — không chờ boot xong.
 *
 * Trước đây mỗi lớp chỉ bắt đầu gọi sau khi lớp trước trả về: boot → manifest →
 * phạm vi dữ liệu → catalog. Không lớp nào cần dữ liệu của lớp trước để GỌI, chúng chỉ
 * cần nó để RENDER. Đo trên tenant thật: 1616 ms mới thấy dòng đầu tiên, trong đó gần
 * một giây là bốn lần chờ nối đuôi nhau, mỗi lời gọi chỉ ~150 ms.
 *
 * Best-effort: chưa đăng nhập thì lời gọi này hỏng, và `ManifestBoundary` gọi lại sau
 * khi có phiên. Một lời gọi thừa lúc chưa đăng nhập rẻ hơn nhiều so với một lần chờ
 * xếp hàng ở mọi lần mở app.
 */
const manifestPrefetch = adapter.getAppManifest(REQUESTED_APP).catch(() => null);

interface RuntimeNav extends NavItem { route: string; doctype?: string }

function isRenderableExperience(item: AppManifest["nav"][number], manifest: AppManifest): boolean {
  if ((item.kind ?? "doctype") !== "experience") return true;
  const separator = item.key.indexOf(":");
  if (separator < 1 || separator === item.key.length - 1) return false;
  const kind = item.key.slice(0, separator);
  const argument = item.key.slice(separator + 1);
  if (kind === "approval" || kind === "calendar" || kind === "social-commerce") return true;
  if (kind === "action") return (manifest.actions ?? []).some((action) => action.name === argument);
  if (kind === "screen") return (manifest.screens ?? []).some((screen) => screen.name === argument);
  return false;
}

/**
 * Experiences — App-mode screens, resolved by PREFIX rather than by exact key.
 *
 * A hand-written screen cannot come from data, so a purely generic runtime would have
 * none at all and every app would be reduced to Desk CRUD. Prefixing lets the parameter
 * live in the nav key: an app declares `{"kind":"experience","key":"approval:Leave
 * Application"}` and gets a working operational screen with no code anywhere.
 */
function renderExperience(key: string, manifest: AppManifest, navigate: NavigateFunction): ReactNode {
  const separator = key.indexOf(":");
  const kind = separator < 0 ? key : key.slice(0, separator);
  const argument = separator < 0 ? "" : key.slice(separator + 1);
  if (kind === "approval" && argument) {
    // The label the app declared, not the raw DocType name. A screen titled "Asset
    // Request" in an otherwise Vietnamese app reads as a leaked internal identifier.
    const title = manifest.nav.find((item) => item.key === key)?.label ?? argument;
    // Back leaves App-mode for the Desk list of the same DocType, so the two are one
    // app seen two ways rather than two apps.
    return <ApprovalInbox doctype={argument} title={title} onExit={() => navigate(`/app/${encodeURIComponent(argument)}`)} />;
  }
  if (kind === "calendar" && argument) {
    /**
     * `calendar:<DocType>` — lịch tuần/tháng cho bất kỳ doctype nào có field ngày.
     *
     * Field ngày và field giờ do CalendarContainer suy từ metadata (field Date/Time đầu
     * tiên), nên app chỉ cần khai một dòng nav. Mở ở chế độ TUẦN: lịch dạy được đọc theo
     * tuần, còn lưới tháng cắt mất buổi khi một ngày có nhiều ca.
     */
    const label = manifest.nav.find((item) => item.key === key)?.label ?? argument;
    return (
      <div className="min-h-[100dvh] bg-background p-3 md:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/app/${encodeURIComponent(argument)}`)}>← Danh sách</Button>
          <h1 className="font-semibold">{label}</h1>
        </div>
        <CalendarContainer
          doctype={argument}
          initialMode="week"
          onEventClick={(row) => navigate(`/app/${encodeURIComponent(argument)}/${encodeURIComponent(String(row.name))}`)}
        />
      </div>
    );
  }
  // Manifest cũ có thể còn giữ Experience viết tay không tồn tại trong generic runtime.
  // Không đưa người dùng vào màn chết; menu mới đã lọc mục này và URL cũ quay về Tổng quan.
  return <Navigate to={`/overview/${encodeURIComponent(manifest.domain ?? manifest.id)}`} replace />;
}

function useBridge(): UrlStateBridge {
  const [params, setParams] = useSearchParams();
  return useMemo(() => ({
    get: (key: string) => params.get(key),
    set: (next: Record<string, string | null | undefined>) => setParams((previous) => {
      const result = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(next)) value == null ? result.delete(key) : result.set(key, value);
      return result;
    }, { replace: true }),
  }), [params, setParams]);
}

function manifestRoute(item: AppManifest["nav"][number]): string | null {
  const kind = item.kind ?? "doctype";
  if (kind === "doctype") return `/app/${encodeURIComponent(item.key)}`;
  if (kind === "overview") return item.route ?? `/overview/${encodeURIComponent(item.key)}`;
  if (kind === "process") return item.route ?? `/process/${encodeURIComponent(item.key)}`;
  if (kind === "workspace") return item.route ?? "/catalog";
  if (kind === "experience") return `/x/${encodeURIComponent(item.key)}`;
  if (kind === "route" || kind === "system") return item.route ?? null;
  return null;
}

function buildNavigation(manifest: AppManifest, catalog: ApplicationCatalog | undefined, roles: string[]): RuntimeNav[] {
  /**
   * Only entries whose screen can actually work.
   *
   * "Tổng quan" and "Quy trình" were once added unconditionally, while the server answered
   * BOTH of their methods with `404 Method is not implemented on this platform`. The menu
   * advertised two screens that could only ever show an error — a missing feature the user
   * cannot see is a gap, but a menu entry leading nowhere is a defect, because it costs a
   * click to discover the same thing.
   *
   * `get_overview` now exists, so Tổng quan is back. `get_processes` still does not, so
   * Quy trình stays out until it does.
   */
  const items: RuntimeNav[] = [
    { key: "__overview", label: "Tổng quan", group: "Điều hành", icon: resolveIcon("layout-dashboard"), route: `/overview/${manifest.domain ?? manifest.id}` },
  ];
  const normalizeGroup = (value?: string) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
  if (manifest.nav.some((item) => normalizeGroup(item.group) === "bao cao")) {
    items.push({ key: "__reports", label: "Báo cáo", group: "Báo cáo", icon: resolveIcon("chart-no-axes-combined"), route: "/reports" });
  }
  if (manifest.nav.some((item) => normalizeGroup(item.group) === "danh muc")) {
    items.push({ key: "__master-data", label: "Danh mục", group: "Danh mục", icon: resolveIcon("library"), route: "/master-data" });
  }
  /**
   * "Danh mục ứng dụng" chỉ có nghĩa khi có NHIỀU hơn một app.
   *
   * Tenant một app — phần lớn khách — thì đó là một trang liệt kê đúng cái app người ta
   * đang mở. Một mục menu dẫn tới chính chỗ mình đang đứng không phải tính năng, nó là
   * một dòng phải đọc rồi bỏ qua, mỗi ngày.
   */
  if ((catalog?.apps?.length ?? 0) > 1) {
    items.push({ key: "__catalog", label: "Danh mục ứng dụng", group: "Điều hành", icon: resolveIcon("grid-3x3"), route: "/catalog" });
  }
  if (roles.includes("System Manager") || roles.includes("Administrator")) {
    items.push({ key: "__permissions", label: "Trung tâm phân quyền", group: "Hệ thống", icon: resolveIcon("shield-check"), route: "/permissions" });
    // Nhập dữ liệu ghi vào BẤT KỲ doctype nào người dùng chọn, nên nó đi cùng quyền quản
    // trị chứ không mở cho mọi vai trò. Server vẫn kiểm quyền trên từng lệnh ghi; đây chỉ
    // là chuyện không mời người không dùng được vào một màn sẽ từ chối họ.
    items.push({ key: "__import", label: "Nhập dữ liệu", group: "Hệ thống", icon: resolveIcon("upload"), route: "/import" });
  }
  const routes = new Set(items.map((item) => item.route));
  for (const app of catalog?.apps ?? []) {
    /**
     * Workspace của CHÍNH app đang mở là bản sao của menu ngay bên dưới.
     *
     * Catalog sinh workspace cho mọi app đã cài, kể cả app này. Kết quả là sidebar mở đầu
     * bằng nguyên một nhóm "Ứng dụng · <tên app>" trỏ vào đúng những doctype đã có nhóm
     * riêng ở dưới — người dùng thấy hai đường tới cùng một chỗ và phải đoán đường nào
     * mới đúng. Workspace của app KHÁC thì vẫn giữ: đó mới là thứ họ chưa thấy.
     */
    if (app.key === manifest.id) continue;
    for (const workspace of app.workspaces) {
      const route = `/workspace/${encodeURIComponent(workspace.key)}`;
      if (routes.has(route)) continue;
      routes.add(route);
      items.push({ key: `workspace:${workspace.key}`, label: workspace.label, group: `Ứng dụng · ${app.label}`, icon: resolveIcon(workspace.icon ?? app.icon ?? "layout-grid"), route, keywords: [workspace.module ?? "", app.module ?? ""] });
    }
  }
  for (const nav of manifest.nav) {
    if (!isRenderableExperience(nav, manifest)) continue;
    const route = manifestRoute(nav);
    if (!route || routes.has(route) || ["overview", "process"].includes(nav.kind ?? "")) continue;
    routes.add(route);
    items.push({ key: nav.key, label: nav.label, group: nav.group ?? "Ứng dụng", icon: resolveIcon(nav.icon), route, doctype: (nav.kind ?? "doctype") === "doctype" ? nav.key : undefined });
  }
  return items;
}

/**
 * The shop, for every tenant whose installed app declares a storefront.
 *
 * Checked BEFORE the auth boundary, and deliberately not gated on a hostname the way the
 * social-commerce marketing pages are: a customer's shop lives on the customer's own
 * domain, and whether it exists is decided by what is installed, not by which host the
 * bundle happens to be served from. If no storefront is installed the API answers 404 and
 * the page says so — which is the honest answer, and one that needs no configuration.
 */
function resolveStorefrontPage(): StorefrontPage | undefined {
  const path = (window.location.pathname.replace(/\/+$/, "") || "/");
  if (path === "/shop") return "/shop";
  if (path === "/shop/cart") return "/shop/cart";
  if (path === "/shop/track") return "/shop/track";
  return path.startsWith("/shop/") ? "/shop/product" : undefined;
}

function RootApp() {
  const shopPage = resolveStorefrontPage();
  if (shopPage) return <I18nProvider><Storefront page={shopPage} adapter={adapter} /></I18nProvider>;

  const publicPage = resolvePublicSocialPage();
  if (publicPage) return <I18nProvider><SocialCommerceLanding page={publicPage} adapter={adapter} /></I18nProvider>;
  return <I18nProvider>
    <AuthBoundary
      adapter={adapter}
      renderLoading={() => <Splash>Đang kết nối…</Splash>}
      renderError={(message) => <div className="grid h-screen place-items-center text-destructive">Lỗi kết nối: {message}</div>}
      renderGuest={(retry) => <RuntimeGuestLogin retry={retry} />}
    >{(boot, auth) => <ManifestBoundary boot={boot} logout={auth.logout} />}</AuthBoundary>
    <Toaster />
  </I18nProvider>;
}

function RuntimeGuestLogin({ retry }: { retry: () => void }) {
  const onSuccess = () => {
    // Không phục hồi route in sau khi phiên đã hết. Route này cần tài liệu và quyền của
    // phiên cũ; giữ nguyên nó khiến đăng nhập xong bị đưa trở lại màn in lỗi.
    if (window.location.pathname.startsWith("/print/")) {
      window.history.replaceState(null, "", "/");
    }
    retry();
  };
  return <LoginForm adapter={adapter} onSuccess={onSuccess} title="Đăng nhập" />;
}

/**
 * Marketing is public only on the Social Commerce hostname. Other Forge tenants keep
 * their existing root redirect, while `?landing=1` gives local visual QA a deterministic
 * entry point without pretending every tenant is this product.
 */
function resolvePublicSocialPage(): PublicSocialPage | undefined {
  const path = (window.location.pathname.replace(/\/+$/, "") || "/") as PublicSocialPage;
  const allowed = new Set<PublicSocialPage>(["/", "/login", "/signup", "/features", "/pricing", "/faq", "/privacy", "/terms", "/facebook/data-deletion", "/security"]);
  const isSocialHost = window.location.hostname.toLowerCase() === "chotdon.kairo.vn";
  const host = window.location.hostname.toLowerCase();
  const isLocalPreview = ["localhost", "127.0.0.1"].includes(host) && new URLSearchParams(window.location.search).get("landing") === "1";
  return allowed.has(path) && (isSocialHost || isLocalPreview) ? path : undefined;
}

function Splash({ children }: { children: ReactNode }) {
  return <div className="grid h-screen place-items-center text-muted-foreground">{children}</div>;
}

/**
 * Fetches the manifest before anything that depends on it renders.
 *
 * The dimensions in particular cannot be defaulted: `BusinessContextProvider` blocks the
 * whole app until every required dimension is chosen, so mounting it with a guessed set
 * would wedge an app on a selector it never uses — which is precisely what happened to
 * an HR app that inherited `warehouse` from a stock template.
 */
function ManifestBoundary({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const [manifest, setManifest] = useState<AppManifest>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    // Dùng lại lời gọi đã phát đi lúc bundle chạy; chỉ gọi mới khi nó hỏng (chưa có phiên).
    manifestPrefetch
      .then((prefetched) => prefetched ?? adapter.getAppManifest(REQUESTED_APP))
      .then((value) => {
        if (!alive) return;
        // Validated even though the server built it: a manifest that fails here would
        // otherwise fail as a redirect loop or a blank sidebar, which reads as a broken
        // platform rather than as a bad app package.
        const check = validateManifest(value);
        if (!check.ok) {
          setError(check.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
          return;
        }
        setManifest(value);
      })
      .catch((caught) => { if (alive) setError(adapter.mapError(caught).message); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!manifest) return;
    applyBrand(manifest.brand ?? "blue");
    applyDesign(manifest.design);
  }, [manifest]);

  if (error) {
    return (
      <div className="grid h-screen place-items-center p-8">
        <div className="max-w-lg rounded-xl border bg-card p-6 text-center">
          <h1 className="font-semibold">Không dựng được giao diện</h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{error}</p>
          <p className="mt-3 text-sm text-muted-foreground">Tenant này có thể chưa cài app nào.</p>
        </div>
      </div>
    );
  }
  if (!manifest) return <Splash>Đang tải cấu hình ứng dụng…</Splash>;

  return (
    <BusinessContextProvider
      adapter={adapter}
      appId={manifest.id}
      dimensions={manifest.businessContext?.dimensions}
      storageKey={`${boot.site_name}|${boot.user}|${manifest.id}`}
    >
      <Runtime manifest={manifest} boot={boot} logout={logout} />
    </BusinessContextProvider>
  );
}

function Runtime({ manifest, boot, logout }: { manifest: AppManifest; boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const context = useBusinessContext();
  const [catalog, setCatalog] = useState<ApplicationCatalog>();
  const [catalogError, setCatalogError] = useState<string>();
  useEffect(() => {
    let alive = true;
    adapter.getApplicationCatalog(manifest.catalogMode === "manifest" ? manifest.id : undefined)
      .then((value) => { if (alive) setCatalog(value); })
      .catch((error) => { if (alive) setCatalogError(adapter.mapError(error).message); });
    return () => { alive = false; };
    // `context.cacheSuffix` CỐ Ý không nằm trong danh sách phụ thuộc: danh mục ứng dụng
    // là những app đã cài, không đổi theo phạm vi dữ liệu người dùng chọn. Để nó ở đây
    // khiến catalog bị gọi lần thứ hai ngay sau khi phạm vi được xác định — đo được trên
    // tenant thật, hai lời gọi giống hệt nhau cách nhau 326 ms.
  }, [manifest.id, manifest.catalogMode]);

  const nav = useMemo(() => buildNavigation(manifest, catalog, boot.roles), [manifest, catalog, boot.roles]);
  const scopeKey = `${createScopeKey(boot)}|${context.cacheSuffix || "global"}`;
  if (context.loading && !context.dimensions.length) return <Splash>Đang xác định phạm vi dữ liệu…</Splash>;

  return <MetaForgeProvider adapter={adapter} registry={registry} roles={boot.roles} scopeKey={scopeKey} locale={mergeLocale(boot.sysdefaults, manifest.locale)} businessContext={context.selection} contextPolicies={context.policies}>
    {!context.ready
      ? <Shell manifest={manifest} boot={boot} logout={logout} nav={nav} active="__overview">
          <div className="grid h-full place-items-center p-8"><div className="rounded-xl border bg-card p-6 text-center">
            <h1 className="font-semibold">Cần chọn phạm vi dữ liệu</h1>
            <p className="mt-2 text-sm text-muted-foreground">Chọn phạm vi ở thanh trên để tiếp tục.</p>
            <div className="mt-4"><BusinessContextBar /></div>
          </div></div>
        </Shell>
      : <RuntimeRoutes manifest={manifest} boot={boot} logout={logout} nav={nav} catalogError={catalogError} />}
  </MetaForgeProvider>;
}

interface ScreenProps { manifest: AppManifest; boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[] }

function Shell({ manifest, boot, logout, nav, active, breadcrumbs = [], children }: ScreenProps & { active: string; breadcrumbs?: Array<{ label: string; onClick?: () => void }>; children: ReactNode }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Tiêu đề tab lấy theo app đã cài, không đóng cứng trong index.html.
   *
   * Một bundle phục vụ mọi tenant, nên cái tên trong index.html là tên của tenant ĐẦU TIÊN
   * từng dùng bundle này — Alumdoor mở ra thấy "Kairo Social Commerce". Thanh bên đã lấy
   * đúng `manifest.name` từ lâu; chỉ mỗi thẻ <title> bị bỏ quên.
   */
  const crumb = breadcrumbs.at(-1)?.label;
  useEffect(() => {
    document.title = crumb ? `${crumb} — ${manifest.name}` : manifest.name;
  }, [crumb, manifest.name]);

  const palette = useMemo(() => ({
    actions: nav.map((item) => ({
      id: `go-${item.key}`,
      label: item.label,
      run: () => navigate(item.route),
    })),
    doctypes: nav
      .filter((item) => item.doctype)
      .map((item) => ({ name: item.doctype!, label: item.label })),
    recent: paletteOpen
      ? loadRecentDocs().map((entry) => ({ doctype: entry.doctype, name: entry.name, title: entry.title }))
      : [],
    searchRecords: async (query: string, signal: AbortSignal): Promise<AwesomeRecord[]> => {
      const result = await adapter.globalSearch(query, { limit: 20 }).catch(() => []);
      if (signal.aborted) return [];
      return result.map((item) => ({
        doctype: item.doctype,
        name: item.name,
        title: item.title ?? item.name,
      }));
    },
  }), [nav, navigate, paletteOpen]);

  return (
    <>
      <AppShell
        brand={manifest.name}
        brandMode={manifest.brand}
        allowBrandChange
        nav={nav}
        activeKey={active}
        onNavigate={(key) => {
          const item = nav.find((candidate) => candidate.key === key);
          if (item) navigate(item.route);
        }}
        breadcrumbs={breadcrumbs}
        fullName={boot.full_name}
        userSubtitle={boot.user}
        theme={theme}
        onThemeChange={setTheme}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenAI={() => setAssistantOpen(true)}
        aiConfigured
        mobileAppHref={manifest.id === "alumdoor" ? "/mobile/warehouse/?tab=account" : undefined}
        onLogout={logout}
        businessContext={<BusinessContextBar compact />}
      >
        {children}
      </AppShell>
      <AssistantBubble
        appName={`Trợ lý ${manifest.name}`}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        hideTrigger
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={palette.actions}
        doctypes={palette.doctypes}
        recent={palette.recent}
        searchRecords={palette.searchRecords}
        onSelectDoctype={(doctype) => navigate(`/app/${encodeURIComponent(doctype)}`)}
        onSelectRecord={(record) => navigate(`/app/${encodeURIComponent(record.doctype)}/${encodeURIComponent(record.name)}`)}
      />
    </>
  );
}

function RuntimeRoutes({ manifest, boot, logout, nav, catalogError }: ScreenProps & { catalogError?: string }) {
  const home = resolveHomeRoute(manifest);
  const screen = { manifest, boot, logout, nav };
  return <Suspense fallback={<Splash>Đang tải màn hình…</Splash>}>
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/overview/:domain" element={<OverviewScreen {...screen} />} />
      <Route path="/process/:domain" element={<ProcessScreen {...screen} />} />
      <Route path="/reports" element={<MetaIndexScreen {...screen} kind="reports" />} />
      <Route path="/master-data" element={<MetaIndexScreen {...screen} kind="masters" />} />
      <Route path="/catalog" element={<CatalogScreen {...screen} error={catalogError} />} />
      <Route path="/permissions" element={<PermissionScreen {...screen} />} />
      <Route path="/security/roles" element={<PermissionScreen {...screen} />} />
      <Route path="/security/approvals-audit" element={<PermissionScreen {...screen} />} />
      <Route path="/organization" element={<OrganizationScreen {...screen} />} />
      <Route path="/companies/:name" element={<OrganizationEntityScreen {...screen} doctype="Company" />} />
      <Route path="/branches/:name" element={<OrganizationEntityScreen {...screen} doctype="Branch" />} />
      <Route path="/departments/:name" element={<OrganizationEntityScreen {...screen} doctype="Department" />} />
      <Route path="/workspace/:workspace" element={<WorkspaceScreen {...screen} />} />
      {/* Touch-first experiences may still own the viewport. Social Commerce is a
          desktop operations center, so ExperienceScreen mounts that one inside the
          shared Forge shell instead of growing a second navigation system. */}
      <Route path="/x/:key" element={<ExperienceScreen {...screen} />} />
      <Route path="/app/:doctype" element={<DoctypeScreen {...screen} />} />
      <Route path="/app/:doctype/:name" element={<DoctypeScreen {...screen} />} />
      <Route path="/print/:doctype/:name" element={<PrintScreen {...screen} />} />
      <Route path="/report/:report" element={<ReportScreen {...screen} />} />
      <Route path="/import" element={<ImportScreen {...screen} />} />
      <Route path="/page/:page" element={<DeskFallback {...screen} kind="Page" />} />
      <Route path="/dashboard/:page" element={<DeskFallback {...screen} kind="Dashboard" />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </Suspense>;
}

function ExperienceScreen({ manifest, boot, logout, nav }: ScreenProps) {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const experienceKey = decodeURIComponent(key);
  const kind = experienceKey.split(":", 1)[0];
  /**
   * `screen:<tên>` — màn nghiệp vụ do app ghép từ các block an toàn trong manifest.
   *
   * Khác Experience React viết tay, thêm màn này là một lần cài metadata. Runtime chung
   * dựng KPI, danh sách và action ngay lập tức, nên không có frontend riêng để lệch phiên
   * bản với schema phía server.
   */
  if (kind === "screen") {
    const name = experienceKey.slice("screen:".length);
    const screen = (manifest.screens ?? []).find((candidate) => candidate.name === name);
    return (
      <Shell
        manifest={manifest}
        boot={boot}
        logout={logout}
        nav={nav}
        active={experienceKey}
        breadcrumbs={[{ label: screen?.label ?? name }]}
      >
        {screen
          ? <ScreenView screen={screen} actions={manifest.actions} onNavigate={navigate} />
          : <div className="grid h-full place-items-center p-6 text-center">
              <div className="max-w-md rounded-xl border bg-card p-6">
                <h1 className="font-semibold">Không mở được màn “{name}”</h1>
                <p className="mt-2 text-sm text-muted-foreground">Tài khoản này không có quyền xem, hoặc app chưa khai màn đó.</p>
              </div>
            </div>}
      </Shell>
    );
  }
  /**
   * `action:<tên>` — màn thao tác do APP KHAI, dựng từ manifest chứ không phải từ code.
   *
   * Mở trong shell chung, không chiếm cả màn: đây là một việc trong ngày làm việc (cắt
   * nhôm, hoàn cắt), người dùng vẫn cần sidebar để đi tiếp sang đơn hàng hay kho.
   */
  if (kind === "action") {
    const name = experienceKey.slice("action:".length);
    const action = (manifest.actions ?? []).find((candidate) => candidate.name === name);
    return (
      <Shell manifest={manifest} boot={boot} logout={logout} nav={nav} active={experienceKey} breadcrumbs={[{ label: action?.label ?? name }]}>
        <div className="h-full overflow-auto p-4">
          {action
            ? <ActionScreen action={action} onOpen={(doctype, docname) => navigate(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(docname)}`)} />
            /**
             * Manifest đã lọc action theo QUYỀN trước khi gửi xuống, nên "không tìm thấy"
             * ở đây gần như luôn là không đủ quyền, không phải app khai thiếu. Nói đúng
             * điều đó thay vì "không tìm thấy màn" — người dùng cần biết phải hỏi ai.
             */
            : <div className="grid h-full place-items-center"><div className="max-w-md rounded-xl border bg-card p-6 text-center">
                <h1 className="font-semibold">Không mở được thao tác "{name}"</h1>
                <p className="mt-2 text-sm text-muted-foreground">Tài khoản này không có quyền chạy, hoặc app chưa khai thao tác đó.</p>
              </div></div>}
        </div>
      </Shell>
    );
  }
  if (kind === "social-commerce") {
    const active = manifest.nav.find((item) => item.key.startsWith("social-commerce:"))?.key ?? experienceKey;
    const canManageConnections = boot.user === "Administrator"
      || boot.roles.includes("Administrator")
      || boot.roles.includes("System Manager");
    return (
      <Shell
        manifest={manifest}
        boot={boot}
        logout={logout}
        nav={nav}
        active={active}
        breadcrumbs={[{ label: "Trung tâm bán hàng" }]}
      >
        <SocialCommerce
          canManageConnections={canManageConnections}
          onAuthenticationRequired={redirectToLogin}
        />
      </Shell>
    );
  }
  if (kind === "daily-ledger") {
    return (
      <Shell manifest={manifest} boot={boot} logout={logout} nav={nav} active={experienceKey} breadcrumbs={[{ label: "Sổ chi tiết hằng ngày" }]}>
        <DailyDetailedLedger />
      </Shell>
    );
  }
  if (kind === "alumdoor-operations") {
    return (
      <Shell manifest={manifest} boot={boot} logout={logout} nav={nav} active={experienceKey} breadcrumbs={[{ label: "Trung tâm vận hành" }]}>
        <AlumdoorOperationsCenter />
      </Shell>
    );
  }
  return <>{renderExperience(experienceKey, manifest, navigate)}</>;
}

function redirectToLogin() {
  window.location.assign("/login");
}

function DoctypeScreen({ manifest, boot, logout, nav }: ScreenProps) {
  const navigate = useNavigate();
  const bridge = useBridge();
  const { doctype = manifest.home.doctype ?? "ToDo", name } = useParams();
  const active = nav.find((item) => item.doctype === doctype)?.key ?? doctype;
  /**
   * Breadcrumb lấy nhãn từ MENU, không phải tên doctype.
   *
   * Menu đã hiện "Đơn hàng" trong khi breadcrumb ngay bên cạnh hiện "Sales Order" — cùng
   * một màn, hai cái tên. Nhãn menu là thứ người dùng vừa bấm vào để tới đây, nên nó cũng
   * là cái tên họ mong đọc lại ở đầu trang.
   */
  const title = nav.find((item) => item.doctype === doctype)?.label ?? doctype;
  /**
   * Mở một dòng rồi đóng lại phải QUAY VỀ ĐÚNG DANH SÁCH VỪA TÌM.
   *
   * Trạng thái danh sách — từ khoá, bộ lọc, trang, cách sắp xếp — sống ở query-string. Nhưng
   * điều hướng trong màn này gọi bằng ĐƯỜNG DẪN TRẦN (`/app/Item/AL548`), nên query bị vứt:
   * tìm "nhom" ra ba dòng, mở một dòng xem, đóng lại thì danh sách nạp lại từ đầu với 294 mặt
   * hàng và người dùng phải gõ lại từ khoá. Với người soát hàng chục dòng thì đó là gõ lại
   * hàng chục lần.
   *
   * Chỉ giữ query khi vẫn ở TRONG cùng một doctype — sang doctype khác thì bộ lọc của doctype
   * cũ không còn nghĩa gì, mang theo là lọc nhầm.
   */
  const listPath = `/app/${encodeURIComponent(doctype)}`;
  const navigateKeepingListState = useCallback((path: string) => {
    const withinList = path === listPath || path.startsWith(`${listPath}/`);
    const search = window.location.search;
    navigate(withinList && search && !path.includes("?") ? `${path}${search}` : path);
  }, [navigate, listPath]);
  /**
   * Khai cho trợ lý biết người dùng ĐANG XEM cái gì.
   *
   * Chỉ tên màn hình và bản ghi đang mở — không kèm nội dung. Trợ lý trả lời được "đang ở
   * đâu, mở cái gì" mà không biến câu hỏi thành một đường đọc dữ liệu vòng qua phân quyền.
   */
  useEffect(() => {
    setAssistantContext({ man_hinh: title, doctype, ban_ghi: name ?? null });
  }, [title, doctype, name]);
  return <Shell manifest={manifest} boot={boot} logout={logout} nav={nav} active={active} breadcrumbs={[{ label: title }]}><div className="h-full p-3 md:p-4"><DoctypeWorkspace doctype={doctype} name={name} bridge={bridge} onNavigate={navigateKeepingListState} /></div></Shell>;
}
function PrintScreen(props: ScreenProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { doctype = "", name = "" } = useParams();
  const decodedDoctype = decodeURIComponent(doctype);
  const decodedName = decodeURIComponent(name);
  const format = searchParams.get("format") ?? undefined;
  const title = props.nav.find((item) => item.doctype === decodedDoctype)?.label ?? decodedDoctype;
  return (
    <Shell {...props} active={decodedDoctype} breadcrumbs={[{ label: title }, { label: decodedName }, { label: "Bản in" }]}>
      <div className="h-full overflow-hidden p-3 md:p-4">
        <PrintContainer
          doctype={decodedDoctype}
          name={decodedName}
          format={format}
          onFormatChange={(nextFormat) => navigate(buildPrintPath(decodedDoctype, decodedName, nextFormat), { replace: true })}
          onBack={() => navigate(`/app/${encodeURIComponent(decodedDoctype)}/${encodeURIComponent(decodedName)}`)}
        />
      </div>
    </Shell>
  );
}
function OverviewScreen(props: ScreenProps) { const navigate = useNavigate(); const { domain = props.manifest.domain ?? "stock" } = useParams(); return <Shell {...props} active="__overview" breadcrumbs={[{ label: "Tổng quan" }]}><div className="h-full overflow-auto bg-[color-mix(in_srgb,var(--primary)_10%,var(--background))] p-3 md:p-4"><OverviewContainer domain={domain} onNavigate={navigate} /></div></Shell>; }
function ProcessScreen(props: ScreenProps) { const navigate = useNavigate(); const { domain = props.manifest.domain ?? "stock" } = useParams(); return <Shell {...props} active="__process" breadcrumbs={[{ label: "Quy trình" }]}><div className="h-full overflow-auto p-4"><ProcessContainer domain={domain} onNavigate={navigate} /></div></Shell>; }
function CatalogScreen({ error, ...props }: ScreenProps & { error?: string }) { const navigate = useNavigate(); return <Shell {...props} active="__catalog" breadcrumbs={[{ label: "Danh mục ứng dụng" }]}><div className="h-full p-4">{error ? <div className="mb-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div> : null}<ApplicationCatalogContainer onNavigate={navigate} /></div></Shell>; }
function PermissionScreen(props: ScreenProps) {
  const location = useLocation();
  const [params] = useSearchParams();
  const initialTab = location.pathname === "/security/roles" ? "roles"
    : location.pathname === "/security/approvals-audit" ? "approvals"
    : params.get("tab") === "audit" ? "audit"
    : params.get("tab") === "approvals" ? "approvals"
    : params.get("tab") === "roles" ? "roles" : "users";
  const active = location.pathname === "/security/roles" ? "security-center"
    : location.pathname === "/security/approvals-audit" ? "security-approvals-audit" : "__permissions";
  const title = initialTab === "approvals" ? "Hộp duyệt & kiểm toán" : initialTab === "roles" ? "Vai trò & kiểm soát" : "Trung tâm phân quyền";
  return <Shell {...props} active={active} breadcrumbs={[{ label: title }]}><div className="h-full overflow-auto p-3 md:p-4"><PermissionCenter initialTab={initialTab} /></div></Shell>;
}
function OrganizationScreen(props: ScreenProps) {
  const navigate = useNavigate();
  const bridge = useBridge();
  const navigateOrganization = useCallback((path: string) => {
    const prefix = "/app/Department";
    if (path === prefix) { navigate("/organization"); return; }
    if (path.startsWith(`${prefix}/`)) { navigate(`/departments/${path.slice(prefix.length + 1)}`); return; }
    navigate(path);
  }, [navigate]);
  return <Shell {...props} active="organization-center" breadcrumbs={[{ label: "Cơ cấu tổ chức" }]}><div className="h-full p-3 md:p-4"><DoctypeWorkspace doctype="Department" title="Cơ cấu phòng ban" bridge={bridge} onNavigate={navigateOrganization} /></div></Shell>;
}
function OrganizationEntityScreen(props: ScreenProps & { doctype: "Company" | "Branch" | "Department" }) {
  const navigate = useNavigate();
  const bridge = useBridge();
  const { name = "" } = useParams();
  const decodedName = decodeURIComponent(name);
  const routeSegment = props.doctype === "Company" ? "companies" : props.doctype === "Branch" ? "branches" : "departments";
  const navigateEntity = useCallback((path: string) => {
    const prefix = `/app/${props.doctype}`;
    if (path === prefix) { navigate("/organization"); return; }
    if (path.startsWith(`${prefix}/`)) { navigate(`/${routeSegment}/${path.slice(prefix.length + 1)}`); return; }
    navigate(path);
  }, [navigate, props.doctype, routeSegment]);
  const entityTitle = props.doctype === "Company" ? "Công ty" : props.doctype === "Branch" ? "Chi nhánh" : "Phòng ban";
  return <Shell {...props} active="organization-center" breadcrumbs={[{ label: "Cơ cấu tổ chức", onClick: () => navigate("/organization") }, { label: decodedName }]}><div className="h-full p-3 md:p-4"><DoctypeWorkspace doctype={props.doctype} title={entityTitle} name={decodedName} bridge={bridge} onNavigate={navigateEntity} /></div></Shell>;
}
function WorkspaceScreen(props: ScreenProps) { const navigate = useNavigate(); const { workspace = "" } = useParams(); const value = decodeURIComponent(workspace); return <Shell {...props} active={`workspace:${value}`} breadcrumbs={[{ label: "Ứng dụng", onClick: () => navigate("/catalog") }, { label: value }]}><WorkspaceContainer defaultWorkspace={value} onOpenLink={(link) => openWorkspace(navigate, link)} /></Shell>; }
function openWorkspace(navigate: NavigateFunction, link: { type?: string; link_to?: string }) { if (!link.link_to) return; const type = (link.type ?? "DocType").toLowerCase(); if (type.includes("report")) navigate(`/report/${encodeURIComponent(link.link_to)}`); else if (type.includes("page")) navigate(`/page/${encodeURIComponent(link.link_to)}`); else if (type.includes("dashboard")) navigate(`/dashboard/${encodeURIComponent(link.link_to)}`); else navigate(`/app/${encodeURIComponent(link.link_to)}`); }
function ReportScreen(props: ScreenProps) { const { report = "" } = useParams(); const value = decodeURIComponent(report); return <Shell {...props} active="__reports" breadcrumbs={[{ label: "Báo cáo", onClick: () => window.history.back() }, { label: value }]}><div className="h-full overflow-auto p-4"><ReportContainer report={value} /></div></Shell>; }

function indexCategory(item: RuntimeNav, kind: "reports" | "masters"): string {
  const value = `${item.label} ${item.key}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi");
  const has = (...words: string[]) => words.some((word) => value.includes(word));
  if (kind === "reports") {
    if (has("san xuat", "lenh san xuat", "cat nhom", "son", "tien do")) return "Sản xuất";
    if (has("kho", "nhap", "xuat", "ton", "mua hang", "nha cung cap")) return "Kho và mua hàng";
    if (has("cong no", "so cai", "can doi", "ket qua", "doanh thu", "chi phi", "phai thu", "phai tra")) return "Tài chính";
    if (has("don hang", "bao gia", "khach", "lap dat", "giao hang")) return "Bán hàng";
    return "Báo cáo điều hành";
  }
  if (has("khach hang", "nha cung cap", "nhan vien", "doi tuong")) return "Đối tượng";
  if (has("kho", "vi tri", "lo nhom")) return "Kho";
  if (has("bang gia", "don gia", "chinh sach gia", "gia ban")) return "Giá bán";
  if (has("cong thuc", "quy cach", "mau vat tu", "mac vat lieu", "thuoc tinh", "nhom hang", "don vi tinh", "hang hoa", "vat tu", "thuong hieu", "nha san xuat")) return "Vật tư hàng hóa";
  if (has("san xuat", "cong doan", "may", "ca lam")) return "Sản xuất";
  if (has("tai khoan", "ngan hang", "thue", "chi phi", "dieu khoan")) return "Tài chính và hệ thống";
  return "Khác";
}

function groupedIndexItems(items: RuntimeNav[], kind: "reports" | "masters") {
  const groups = new Map<string, RuntimeNav[]>();
  for (const item of items) {
    const category = indexCategory(item, kind);
    const current = groups.get(category) ?? [];
    current.push(item);
    groups.set(category, current);
  }
  const priority = kind === "masters"
    ? ["Vật tư hàng hóa", "Đối tượng", "Kho", "Giá bán", "Sản xuất", "Tài chính và hệ thống", "Khác"]
    : ["Báo cáo điều hành", "Bán hàng", "Kho và mua hàng", "Sản xuất", "Tài chính"];
  return [...groups.entries()]
    .sort(([left], [right]) => priority.indexOf(left) - priority.indexOf(right))
    .map(([label, entries], index) => ({ id: `index-group-${index}`, label, entries }));
}

function MetaIndexScreen(props: ScreenProps & { kind: "reports" | "masters" }) {
  const navigate = useNavigate();
  const [selectedReportGroup, setSelectedReportGroup] = useState<string | null>(null);
  const target = props.kind === "reports" ? "bao cao" : "danh muc";
  const active = props.kind === "reports" ? "__reports" : "__master-data";
  const title = props.kind === "reports" ? "Báo cáo" : "Danh mục";
  const description = props.kind === "reports"
    ? "Tra cứu báo cáo theo dữ liệu và quyền hiện có trong Meta."
    : "Dữ liệu nền dùng chung cho bán hàng, kho, mua hàng và sản xuất.";
  const normalize = (value?: string) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
  const items = props.nav.filter((item) => normalize(item.group) === target && !item.disabledReason);
  const groups = groupedIndexItems(items, props.kind);
  const activeReportGroup = groups.find((group) => group.id === selectedReportGroup) ?? groups[0];
  return (
    <Shell {...props} active={active} breadcrumbs={[{ label: title }]}>
      <div className="h-full overflow-auto bg-muted/20 p-3 md:p-4">
        <section className="w-full overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {props.kind === "reports" ? (
            <div className="grid min-h-[32rem] lg:grid-cols-[14rem_minmax(0,1fr)]">
              <aside className="border-b bg-muted/25 p-3 lg:border-b-0 lg:border-r">
                <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nhóm báo cáo</div>
                <nav className="flex gap-1 overflow-x-auto lg:block" aria-label="Nhóm báo cáo">
                  {groups.map((group) => (
                    <Button
                      key={group.id}
                      type="button"
                      variant="ghost"
                      className={`h-auto w-full shrink-0 justify-start rounded px-3 py-2 text-sm font-normal lg:flex ${activeReportGroup?.id === group.id ? "bg-primary/10 font-semibold text-primary" : ""}`}
                      onClick={() => setSelectedReportGroup(group.id)}
                    >
                      {group.label}
                    </Button>
                  ))}
                </nav>
              </aside>
              <div className="min-w-0 p-4 md:p-5">
                {activeReportGroup ? (
                  <section key={activeReportGroup.id} className="mb-6">
                    <h2 className="mb-1 border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{activeReportGroup.label}</h2>
                    <div className="grid md:grid-cols-2 md:gap-x-8">
                      {activeReportGroup.entries.map((item) => (
                        <Button key={item.key} variant="ghost" className="h-auto min-w-0 justify-start gap-2 rounded-none border-b px-2 py-3 text-left font-normal text-primary" onClick={() => navigate(item.route)}>
                          <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                          <span className="min-w-0 whitespace-normal">{item.label}</span>
                        </Button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-x-12 gap-y-8 p-5 md:grid-cols-2 xl:grid-cols-3 xl:p-7">
              {groups.map((group) => (
                <section key={group.id}>
                  <h2 className="mb-2 border-b pb-2 text-sm font-bold">{group.label}</h2>
                  <div>
                    {group.entries.map((item) => (
                      <Button key={item.key} variant="link" className="h-auto w-full justify-start whitespace-normal px-0 py-1.5 text-left font-normal" onClick={() => navigate(item.route)}>
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {!items.length ? <div className="m-5 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Chưa có mục khả dụng theo quyền hiện tại.</div> : null}
        </section>
      </div>
    </Shell>
  );
}
/**
 * Nhập dữ liệu từ CSV/Excel — cùng trình thuật sĩ mà app demo vẫn dùng.
 *
 * Không gắn với doctype nào: người dùng chọn doctype ngay trong màn, nên MỘT mục menu
 * phục vụ mọi bảng của mọi app. Đặt trong nhóm "Hệ thống" cạnh phân quyền vì đây là
 * thao tác quản trị, không phải nghiệp vụ hằng ngày.
 */
function ImportScreen(props: ScreenProps) {
  return <Shell {...props} active="__import" breadcrumbs={[{ label: "Nhập dữ liệu" }]}><div className="h-full overflow-auto p-4"><ImportContent /></div></Shell>;
}

function DeskFallback({ kind, ...props }: ScreenProps & { kind: string }) { const { page = "" } = useParams(); const value = decodeURIComponent(page); return <Shell {...props} active={`${kind}:${value}`} breadcrumbs={[{ label: kind }, { label: value }]}><div className="grid h-full place-items-center p-8"><div className="max-w-lg rounded-xl border bg-card p-6 text-center"><h1 className="font-semibold">{value}</h1><p className="mt-2 text-sm text-muted-foreground">Renderer chuyên biệt chưa có cho loại màn này.</p><Button className="mt-4" onClick={() => window.history.back()}>Quay lại</Button></div></div></Shell>; }

createRoot(document.getElementById("root")!).render(<StrictMode><BrowserRouter><RootApp /></BrowserRouter></StrictMode>);
