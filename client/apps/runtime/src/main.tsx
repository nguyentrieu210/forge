import { StrictMode, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams, type NavigateFunction } from "react-router-dom";
import { mergeLocale, resolveHomeRoute, validateManifest, type ApplicationCatalog, type AppManifest } from "@metaforge/core";
import { FrappeAdapterImpl, createScopeKey, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { MetaForgeProvider } from "@metaforge/views/provider";
import { createFullRegistry } from "@metaforge/views/registry";
import { AssistantBubble, loadRecentDocs, PrintContainer, setAssistantContext } from "@metaforge/views";
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
  return (
    <div className="grid min-h-[100dvh] place-items-center p-8 text-center">
      <div className="rounded-xl border bg-card p-6">
        <h1 className="font-semibold">Màn "{key}" chưa được triển khai</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manifest có khai Experience này, nhưng runtime chưa có màn tương ứng. Các loại đang hỗ trợ: <code>approval:&lt;DocType&gt;</code>, <code>calendar:&lt;DocType&gt;</code>, <code>action:&lt;tên&gt;</code>, <code>screen:&lt;tên&gt;</code>.
        </p>
      </div>
    </div>
  );
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
      renderGuest={(retry) => <LoginForm adapter={adapter} onSuccess={retry} title="Đăng nhập" />}
    >{(boot, auth) => <ManifestBoundary boot={boot} logout={auth.logout} />}</AuthBoundary>
    <Toaster />
  </I18nProvider>;
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
        allowBrandChange={!manifest.brand}
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
        onLogout={logout}
        businessContext={<BusinessContextBar compact />}
      >
        {children}
      </AppShell>
      <AssistantBubble appName={`Trợ lý ${manifest.name}`} />
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
      <Route path="/catalog" element={<CatalogScreen {...screen} error={catalogError} />} />
      <Route path="/permissions" element={<PermissionScreen {...screen} />} />
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
  const { doctype = "", name = "" } = useParams();
  const decodedDoctype = decodeURIComponent(doctype);
  const decodedName = decodeURIComponent(name);
  const title = props.nav.find((item) => item.doctype === decodedDoctype)?.label ?? decodedDoctype;
  return (
    <Shell {...props} active={decodedDoctype} breadcrumbs={[{ label: title }, { label: decodedName }, { label: "Bản in" }]}>
      <div className="h-full overflow-hidden p-3 md:p-4">
        <PrintContainer
          doctype={decodedDoctype}
          name={decodedName}
          onBack={() => navigate(`/app/${encodeURIComponent(decodedDoctype)}/${encodeURIComponent(decodedName)}`)}
        />
      </div>
    </Shell>
  );
}
function OverviewScreen(props: ScreenProps) { const navigate = useNavigate(); const { domain = props.manifest.domain ?? "stock" } = useParams(); return <Shell {...props} active="__overview" breadcrumbs={[{ label: "Tổng quan" }]}><div className="h-full overflow-auto p-4"><OverviewContainer domain={domain} onNavigate={navigate} /></div></Shell>; }
function ProcessScreen(props: ScreenProps) { const navigate = useNavigate(); const { domain = props.manifest.domain ?? "stock" } = useParams(); return <Shell {...props} active="__process" breadcrumbs={[{ label: "Quy trình" }]}><div className="h-full overflow-auto p-4"><ProcessContainer domain={domain} onNavigate={navigate} /></div></Shell>; }
function CatalogScreen({ error, ...props }: ScreenProps & { error?: string }) { const navigate = useNavigate(); return <Shell {...props} active="__catalog" breadcrumbs={[{ label: "Danh mục ứng dụng" }]}><div className="h-full p-4">{error ? <div className="mb-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div> : null}<ApplicationCatalogContainer onNavigate={navigate} /></div></Shell>; }
function PermissionScreen(props: ScreenProps) { return <Shell {...props} active="__permissions" breadcrumbs={[{ label: "Trung tâm phân quyền" }]}><div className="h-full overflow-auto p-4"><PermissionCenter /></div></Shell>; }
function WorkspaceScreen(props: ScreenProps) { const navigate = useNavigate(); const { workspace = "" } = useParams(); const value = decodeURIComponent(workspace); return <Shell {...props} active={`workspace:${value}`} breadcrumbs={[{ label: "Ứng dụng", onClick: () => navigate("/catalog") }, { label: value }]}><WorkspaceContainer defaultWorkspace={value} onOpenLink={(link) => openWorkspace(navigate, link)} /></Shell>; }
function openWorkspace(navigate: NavigateFunction, link: { type?: string; link_to?: string }) { if (!link.link_to) return; const type = (link.type ?? "DocType").toLowerCase(); if (type.includes("report")) navigate(`/report/${encodeURIComponent(link.link_to)}`); else if (type.includes("page")) navigate(`/page/${encodeURIComponent(link.link_to)}`); else if (type.includes("dashboard")) navigate(`/dashboard/${encodeURIComponent(link.link_to)}`); else navigate(`/app/${encodeURIComponent(link.link_to)}`); }
function ReportScreen(props: ScreenProps) { const { report = "" } = useParams(); const value = decodeURIComponent(report); return <Shell {...props} active={`report:${report}`} breadcrumbs={[{ label: "Báo cáo" }, { label: value }]}><div className="h-full overflow-auto p-4"><ReportContainer report={value} /></div></Shell>; }
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
