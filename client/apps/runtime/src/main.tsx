import { StrictMode, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams, type NavigateFunction } from "react-router-dom";
import { mergeLocale, resolveHomeRoute, validateManifest, type ApplicationCatalog, type AppManifest } from "@metaforge/core";
import { FrappeAdapterImpl, createScopeKey, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { MetaForgeProvider } from "@metaforge/views/provider";
import { createFullRegistry } from "@metaforge/views/registry";
import type { UrlStateBridge } from "@metaforge/views/url-state";
import {
  AppShell, AuthBoundary, BusinessContextBar, BusinessContextProvider, I18nProvider,
  LoginForm, applyBrand, resolveIcon, useBusinessContext, useTheme, type NavItem,
} from "@metaforge/shell";
import { Button } from "@metaforge/ui";
import { SocialCommerceLanding, type PublicSocialPage } from "./landing/SocialCommerceLanding.js";
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
const ApprovalInbox = lazy(() => import("./experiences/ApprovalInbox.js").then((module) => ({ default: module.ApprovalInbox })));
const SocialCommerce = lazy(() => import("./experiences/SocialCommerce.js").then((module) => ({ default: module.SocialCommerce })));

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
  if (kind === "social-commerce") return <SocialCommerce />;
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
          Manifest có khai Experience này, nhưng runtime chưa có màn tương ứng. Các loại đang hỗ trợ: <code>approval:&lt;DocType&gt;</code>, <code>calendar:&lt;DocType&gt;</code>.
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
    { key: "__catalog", label: "Danh mục ứng dụng", group: "Điều hành", icon: resolveIcon("grid-3x3"), route: "/catalog" },
  ];
  if (roles.includes("System Manager") || roles.includes("Administrator")) {
    items.push({ key: "__permissions", label: "Trung tâm phân quyền", group: "Hệ thống", icon: resolveIcon("shield-check"), route: "/permissions" });
    // Nhập dữ liệu ghi vào BẤT KỲ doctype nào người dùng chọn, nên nó đi cùng quyền quản
    // trị chứ không mở cho mọi vai trò. Server vẫn kiểm quyền trên từng lệnh ghi; đây chỉ
    // là chuyện không mời người không dùng được vào một màn sẽ từ chối họ.
    items.push({ key: "__import", label: "Nhập dữ liệu", group: "Hệ thống", icon: resolveIcon("upload"), route: "/import" });
  }
  const routes = new Set(items.map((item) => item.route));
  for (const app of catalog?.apps ?? []) for (const workspace of app.workspaces) {
    const route = `/workspace/${encodeURIComponent(workspace.key)}`;
    if (routes.has(route)) continue;
    routes.add(route);
    items.push({ key: `workspace:${workspace.key}`, label: workspace.label, group: `Ứng dụng · ${app.label}`, icon: resolveIcon(workspace.icon ?? app.icon ?? "layout-grid"), route, keywords: [workspace.module ?? "", app.module ?? ""] });
  }
  for (const nav of manifest.nav) {
    const route = manifestRoute(nav);
    if (!route || routes.has(route) || ["overview", "process"].includes(nav.kind ?? "")) continue;
    routes.add(route);
    items.push({ key: nav.key, label: nav.label, group: nav.group ?? "Ứng dụng", icon: resolveIcon(nav.icon), route, doctype: (nav.kind ?? "doctype") === "doctype" ? nav.key : undefined });
  }
  return items;
}

function RootApp() {
  const publicPage = resolvePublicSocialPage();
  if (publicPage) return <I18nProvider><SocialCommerceLanding page={publicPage} adapter={adapter} /></I18nProvider>;
  return <I18nProvider><AuthBoundary
    adapter={adapter}
    renderLoading={() => <Splash>Đang kết nối…</Splash>}
    renderError={(message) => <div className="grid h-screen place-items-center text-destructive">Lỗi kết nối: {message}</div>}
    renderGuest={(retry) => <LoginForm adapter={adapter} onSuccess={retry} title="Đăng nhập" />}
  >{(boot, auth) => <ManifestBoundary boot={boot} logout={auth.logout} />}</AuthBoundary></I18nProvider>;
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
    adapter.getAppManifest(REQUESTED_APP)
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

  useEffect(() => { if (manifest) applyBrand(manifest.brand ?? "blue"); }, [manifest]);

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
  }, [context.cacheSuffix, manifest.id, manifest.catalogMode]);

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
  return <AppShell brand={manifest.name} nav={nav} activeKey={active} onNavigate={(key) => { const item = nav.find((candidate) => candidate.key === key); if (item) navigate(item.route); }} breadcrumbs={breadcrumbs} fullName={boot.full_name} userSubtitle={boot.user} theme={theme} onThemeChange={setTheme} onLogout={logout} businessContext={<BusinessContextBar compact />}>{children}</AppShell>;
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
      {/* App-mode. Rendered WITHOUT the Desk shell: an operational screen owns the whole
          viewport, because a sidebar on a phone is a sidebar the user has to dismiss. */}
      <Route path="/x/:key" element={<ExperienceScreen manifest={manifest} />} />
      <Route path="/app/:doctype" element={<DoctypeScreen {...screen} />} />
      <Route path="/app/:doctype/:name" element={<DoctypeScreen {...screen} />} />
      <Route path="/report/:report" element={<ReportScreen {...screen} />} />
      <Route path="/import" element={<ImportScreen {...screen} />} />
      <Route path="/page/:page" element={<DeskFallback {...screen} kind="Page" />} />
      <Route path="/dashboard/:page" element={<DeskFallback {...screen} kind="Dashboard" />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </Suspense>;
}

function ExperienceScreen({ manifest }: { manifest: AppManifest }) {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  return <>{renderExperience(decodeURIComponent(key), manifest, navigate)}</>;
}

function DoctypeScreen({ manifest, boot, logout, nav }: ScreenProps) {
  const navigate = useNavigate();
  const bridge = useBridge();
  const { doctype = manifest.home.doctype ?? "ToDo", name } = useParams();
  const active = nav.find((item) => item.doctype === doctype)?.key ?? doctype;
  return <Shell manifest={manifest} boot={boot} logout={logout} nav={nav} active={active} breadcrumbs={[{ label: doctype }]}><div className="h-full p-3 md:p-4"><DoctypeWorkspace doctype={doctype} name={name} bridge={bridge} onNavigate={navigate} /></div></Shell>;
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
