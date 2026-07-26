import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams, type NavigateFunction } from "react-router-dom";
import {
  mergeLocale, type AppManifest, type ApplicationCatalog, type CatalogItem, type BusinessContextKey,
} from "@metaforge/core";
import { FrappeAdapterImpl, createScopeKey, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import {
  ApplicationCatalogContainer, createFullRegistry, MetaForgeProvider, WorkspaceContainer, DoctypeWorkspace,
  OverviewContainer, ProcessContainer, ReportContainer, PrintContainer, loadRecentDocs,
} from "@metaforge/views";
import {
  AIPanel, AuthBoundary, I18nProvider, createExperienceRegistry, ExperienceRoute, resolveIcon,
  BusinessContextProvider, BusinessContextBar, useBusinessContext, ChangePasswordDialog,
  type AwesomeRecord, type NavItem, type NotificationItem,
} from "@metaforge/shell";
import { APP_MANIFEST } from "./app-manifest.js";
import { DemoShell } from "./DemoShell.js";
import { useUrlBridge } from "./list-glue.js";
import { PermissionManagerContent } from "./system/PermissionManager.js";
import { SettingsContent } from "./system/Settings.js";
import { ImportContent } from "./system/Import.js";
import { LoginScreen } from "./system/Login.js";
import { ReceiveExperience } from "./experiences/ReceiveExperience.js";
import { Button, Toaster, toast } from "@metaforge/ui";

const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const adapter = new FrappeAdapterImpl({ url: APP_BASE });
const registry = createFullRegistry();
const MANIFEST: AppManifest = APP_MANIFEST;
const DOMAIN = MANIFEST.domain ?? "stock";
const CONTEXT_DIMENSIONS: BusinessContextKey[] | undefined = MANIFEST.businessContext?.dimensions;

const experienceRegistry = createExperienceRegistry([
  { key: "receive", title: "Nhận/Giao", render: () => <ReceiveRoute /> },
]);

interface RuntimeNavItem extends NavItem {
  route: string;
  kind: "overview" | "process" | "catalog" | "workspace" | "doctype" | "report" | "page" | "dashboard" | "experience" | "system" | "route";
  doctype?: string;
}
interface RuntimeNavigationValue {
  items: RuntimeNavItem[];
  catalog?: ApplicationCatalog;
  catalogLoading: boolean;
  catalogError?: string;
  refreshCatalog: () => void;
  navigateKey: (navigate: NavigateFunction, key: string) => void;
  activeForDoctype: (doctype: string) => string;
}
const RuntimeNavigationContext = createContext<RuntimeNavigationValue | null>(null);
function useRuntimeNavigation() {
  const value = useContext(RuntimeNavigationContext);
  if (!value) throw new Error("RuntimeNavigationContext missing");
  return value;
}

function Bootstrap({ children }: { children: (boot: MetaForgeBootDTO, logout: () => Promise<void>) => ReactNode }) {
  return (
    <AuthBoundary
      adapter={adapter}
      renderGuest={() => <Navigate to="/login" replace />}
      renderLoading={() => <div className="grid h-screen place-items-center text-muted-foreground">Đang kết nối Frappe…</div>}
      renderError={(message) => <div className="grid h-screen place-items-center text-destructive">Lỗi kết nối Frappe: {message}</div>}
    >
      {(boot, auth) => children(boot, auth.logout)}
    </AuthBoundary>
  );
}

function useNotifications(navigate: NavigateFunction) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const load = useCallback(() => {
    adapter.notifications.list(20).then((result) => setItems((result.notification_logs ?? []) as NotificationItem[])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  return {
    items,
    count: items.filter((item) => !item.read).length,
    onClick: (item: NotificationItem) => {
      adapter.notifications.markAsRead(item.name).then(load).catch(() => {});
      if (item.document_type && item.document_name) navigate(`/app/${encodeURIComponent(item.document_type)}/${encodeURIComponent(item.document_name)}`);
    },
    onMarkAllRead: () => { adapter.notifications.markAllRead().then(load).catch(() => {}); },
  };
}

function buildRuntimeNavigation(catalog?: ApplicationCatalog): RuntimeNavItem[] {
  const items: RuntimeNavItem[] = [
    { key: "__overview", label: "Tổng quan", icon: resolveIcon("layout-dashboard"), group: "Điều hành", route: `/overview/${DOMAIN}`, kind: "overview" },
    { key: "__process", label: "Quy trình", icon: resolveIcon("workflow"), group: "Điều hành", route: `/process/${DOMAIN}`, kind: "process" },
    { key: "__catalog", label: "Danh mục ứng dụng", icon: resolveIcon("grid-3x3"), group: "Điều hành", route: "/catalog", kind: "catalog" },
  ];

  const seenRoutes = new Set(items.map((item) => item.route));
  for (const app of catalog?.apps ?? []) {
    for (const workspace of app.workspaces) {
      const route = `/workspace/${encodeURIComponent(workspace.key)}`;
      if (seenRoutes.has(route)) continue;
      seenRoutes.add(route);
      items.push({ key: `workspace:${workspace.key}`, label: workspace.label, icon: resolveIcon(workspace.icon ?? app.icon ?? "layout-grid"), group: `Ứng dụng · ${app.label}`, route, kind: "workspace", keywords: [workspace.module ?? "", app.module ?? ""] });
    }
  }

  const catalogDoctypes = new Set<string>();
  for (const app of catalog?.apps ?? []) for (const workspace of app.workspaces) for (const section of workspace.sections) for (const item of section.items) if (item.doctype) catalogDoctypes.add(item.doctype);
  for (const nav of MANIFEST.nav) {
    const kind = nav.kind ?? "doctype";
    if (kind === "doctype" && catalogDoctypes.has(nav.key)) continue;
    const route = manifestRoute(nav);
    if (!route || seenRoutes.has(route)) continue;
    seenRoutes.add(route);
    items.push({
      key: nav.key,
      label: nav.label,
      icon: resolveIcon(nav.icon),
      group: nav.group ?? (kind === "system" ? "Hệ thống" : "Ứng dụng tùy chỉnh"),
      route,
      kind: kind === "doctype" ? "doctype" : kind === "experience" ? "experience" : kind === "workspace" ? "workspace" : kind === "system" ? "system" : kind === "overview" ? "overview" : kind === "process" ? "process" : "route",
      doctype: kind === "doctype" ? nav.key : undefined,
    });
  }
  return items;
}

function manifestRoute(nav: AppManifest["nav"][number]): string | null {
  const kind = nav.kind ?? "doctype";
  if (kind === "doctype") return `/app/${encodeURIComponent(nav.key)}`;
  if (kind === "experience") return `/x/${encodeURIComponent(nav.key)}`;
  if (kind === "workspace") return nav.route ?? "/catalog";
  if (kind === "overview") return nav.route ?? `/overview/${DOMAIN}`;
  if (kind === "process") return nav.route ?? `/process/${DOMAIN}`;
  if (kind === "system" || kind === "route") return nav.route ?? ({ __import: "/import", __permissions: "/permissions", __settings: "/settings" } as Record<string, string>)[nav.key] ?? null;
  return null;
}

function RuntimeNavigationProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<ApplicationCatalog>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setCatalogLoading(true); setCatalogError(undefined);
    adapter.getApplicationCatalog(MANIFEST.catalogMode === "manifest" ? MANIFEST.id : undefined)
      .then((result) => { if (alive) setCatalog(result); })
      .catch((error) => { if (alive) setCatalogError(adapter.mapError(error).message); })
      .finally(() => { if (alive) setCatalogLoading(false); });
    return () => { alive = false; };
  }, [revision]);
  const items = useMemo(() => buildRuntimeNavigation(catalog), [catalog]);
  const value = useMemo<RuntimeNavigationValue>(() => ({
    items, catalog, catalogLoading, catalogError,
    refreshCatalog: () => setRevision((value) => value + 1),
    navigateKey: (navigate, key) => {
      const item = items.find((candidate) => candidate.key === key);
      if (item) navigate(item.route);
    },
    activeForDoctype: (doctype) => items.find((item) => item.doctype === doctype)?.key ?? doctype,
  }), [items, catalog, catalogLoading, catalogError]);
  return <RuntimeNavigationContext.Provider value={value}>{children}</RuntimeNavigationContext.Provider>;
}

function RuntimeShell({ boot, logout, activeKey, breadcrumbs, children }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; activeKey: string; breadcrumbs: Array<{ label: string; onClick?: () => void }>; children: ReactNode }) {
  const navigate = useNavigate();
  const runtime = useRuntimeNavigation();
  const notifications = useNotifications(navigate);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const awesomebar = useMemo(() => ({
    actions: runtime.items.map((item) => ({ id: `go-${item.key}`, label: item.label, run: () => navigate(item.route) })),
    doctypes: runtime.items.filter((item) => item.doctype).map((item) => ({ name: item.doctype!, label: item.label })),
    // CommandPalette đã có sẵn UI "Gần đây" (props.recent) — trước đây không app nào cấp dữ liệu thật.
    recent: loadRecentDocs().map((e) => ({ doctype: e.doctype, name: e.name, title: e.title })),
    searchRecords: async (query: string, signal: AbortSignal): Promise<AwesomeRecord[]> => {
      const result = await adapter.globalSearch(query, { limit: 20 }).catch(() => []);
      if (signal.aborted) return [];
      return result.map((item) => ({ doctype: item.doctype, name: item.name, title: item.title ?? item.name }));
    },
    onSelectDoctype: (doctype: string) => navigate(`/app/${encodeURIComponent(doctype)}`),
    onSelectRecord: (record: AwesomeRecord) => navigate(`/app/${encodeURIComponent(record.doctype)}/${encodeURIComponent(record.name)}`),
  }), [runtime.items, navigate]);
  return (
    <DemoShell
      nav={runtime.items}
      activeKey={activeKey}
      onNavigate={(key) => runtime.navigateKey(navigate, key)}
      breadcrumbs={breadcrumbs}
      fullName={boot.full_name}
      userSubtitle={boot.user}
      awesomebar={awesomebar}
      notifications={notifications}
      businessContext={<BusinessContextBar compact />}
      onLogout={logout}
      onChangePassword={() => setChangePasswordOpen(true)}
      onLogoutOtherSessions={() => {
        void adapter.logoutOtherSessions()
          .then(() => toast.success("Đã đăng xuất khỏi thiết bị khác"))
          .catch((e) => toast.error(adapter.mapError(e).message));
      }}
    >
      {children}
      <ChangePasswordDialog adapter={adapter} open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </DemoShell>
  );
}

export function LiveApp() {
  return <I18nProvider><BrowserRouter basename={import.meta.env.BASE_URL}><Routes><Route path="/login" element={<LoginScreen />} /><Route path="*" element={<AuthedApp />} /></Routes></BrowserRouter></I18nProvider>;
}

function AuthedApp() {
  return <Bootstrap>{(boot, logout) => (
    <BusinessContextProvider adapter={adapter} appId={MANIFEST.id} dimensions={CONTEXT_DIMENSIONS} storageKey={`${boot.site_name}|${boot.user}|${MANIFEST.id}`}>
      <BusinessContextRuntime boot={boot} logout={logout} />
    </BusinessContextProvider>
  )}</Bootstrap>;
}

function BusinessContextRuntime({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const business = useBusinessContext();
  const scopedKey = `${createScopeKey(boot)}|${business.cacheSuffix || "global"}`;
  if (business.loading && !business.dimensions.length) return <div className="grid h-screen place-items-center text-muted-foreground">Đang xác định công ty, năm tài chính và kho theo quyền…</div>;
  return (
    <MetaForgeProvider adapter={adapter} registry={registry} roles={boot.roles} scopeKey={scopedKey} locale={mergeLocale(boot.sysdefaults, MANIFEST.locale)} businessContext={business.selection} contextPolicies={business.policies}>
      <RuntimeNavigationProvider>
        {!business.ready ? <ContextRequiredScreen boot={boot} logout={logout} /> : <RuntimeRoutes boot={boot} logout={logout} />}
      </RuntimeNavigationProvider>
    </MetaForgeProvider>
  );
}

function ContextRequiredScreen({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  return <RuntimeShell boot={boot} logout={logout} activeKey="__overview" breadcrumbs={[{ label: "Chọn phạm vi" }]}><div className="grid h-full place-items-center p-8"><div className="max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm"><h1 className="text-lg font-semibold">Cần chọn phạm vi dữ liệu</h1><p className="mt-2 text-sm text-muted-foreground">Chọn đầy đủ Công ty, Năm tài chính hoặc Kho trên thanh phía trên trước khi tải dữ liệu nghiệp vụ.</p><div className="mt-5 flex justify-center"><BusinessContextBar /></div></div></div></RuntimeShell>;
}

function RuntimeRoutes({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  return <Routes>
    <Route path="/" element={<Navigate to={`/overview/${DOMAIN}`} replace />} />
    <Route path="/overview/:domain" element={<OverviewScreen boot={boot} logout={logout} />} />
    <Route path="/process/:domain" element={<ProcessScreen boot={boot} logout={logout} />} />
    <Route path="/catalog" element={<CatalogScreen boot={boot} logout={logout} />} />
    <Route path="/workspace/:workspace" element={<WorkspaceScreen boot={boot} logout={logout} />} />
    <Route path="/workspace" element={<Navigate to="/catalog" replace />} />
    <Route path="/app/:doctype" element={<LiveScreen boot={boot} logout={logout} />} />
    <Route path="/app/:doctype/:name" element={<LiveScreen boot={boot} logout={logout} />} />
    <Route path="/print/:doctype/:name" element={<PrintScreen />} />
    <Route path="/report/:report" element={<ReportScreen boot={boot} logout={logout} />} />
    <Route path="/page/:page" element={<DeskResourceScreen boot={boot} logout={logout} kind="Page" />} />
    <Route path="/dashboard/:page" element={<DeskResourceScreen boot={boot} logout={logout} kind="Dashboard" />} />
    <Route path="/import" element={<SystemScreen boot={boot} logout={logout} activeKey="__import" title="Nhập dữ liệu"><ImportContent /></SystemScreen>} />
    <Route path="/permissions" element={<SystemScreen boot={boot} logout={logout} activeKey="__permissions" title="Trung tâm phân quyền"><PermissionManagerContent /></SystemScreen>} />
    <Route path="/settings" element={<SystemScreen boot={boot} logout={logout} activeKey="__settings" title="Thiết lập"><SettingsContent boot={boot} /></SystemScreen>} />
    <Route path="/x/:key" element={<ExperienceScreen />} />
    <Route path="*" element={<Navigate to={`/overview/${DOMAIN}`} replace />} />
  </Routes>;
}

function LiveScreen({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const navigate = useNavigate();
  const runtime = useRuntimeNavigation();
  const { doctype = MANIFEST.home.doctype ?? "ToDo", name } = useParams();
  const bridge = useUrlBridge();
  const isNew = name === "new";
  const breadcrumbs = name ? [{ label: doctype, onClick: () => navigate(`/app/${encodeURIComponent(doctype)}`) }, { label: isNew ? "Tạo mới" : decodeURIComponent(name) }] : [{ label: doctype }];
  return <RuntimeShell boot={boot} logout={logout} activeKey={runtime.activeForDoctype(doctype)} breadcrumbs={breadcrumbs}><div className="h-full p-3 md:p-4"><DoctypeWorkspace doctype={doctype} name={name} onNavigate={navigate} bridge={bridge} contextAiSlot={<AIPanel provider={null} scope="form" />} /></div></RuntimeShell>;
}

/** Trang in ấn — full-page riêng (không split-view), PrintContainer tự fetch printview.get_html_and_style. */
function PrintScreen() {
  const navigate = useNavigate();
  const { doctype = "", name = "" } = useParams();
  return <PrintContainer doctype={doctype} name={decodeURIComponent(name)} onBack={() => navigate(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)} />;
}

function OverviewScreen({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const navigate = useNavigate(); const { domain = DOMAIN } = useParams();
  return <RuntimeShell boot={boot} logout={logout} activeKey="__overview" breadcrumbs={[{ label: "Tổng quan" }]}><div className="h-full overflow-auto p-4 md:p-5"><OverviewContainer domain={domain} onNavigate={navigate} /></div></RuntimeShell>;
}
function ProcessScreen({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const navigate = useNavigate(); const { domain = DOMAIN } = useParams();
  return <RuntimeShell boot={boot} logout={logout} activeKey="__process" breadcrumbs={[{ label: "Quy trình" }]}><div className="h-full overflow-auto p-4 md:p-5"><ProcessContainer domain={domain} onNavigate={navigate} /></div></RuntimeShell>;
}
function CatalogScreen({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const navigate = useNavigate();
  return <RuntimeShell boot={boot} logout={logout} activeKey="__catalog" breadcrumbs={[{ label: "Danh mục ứng dụng" }]}><div className="h-full p-4 md:p-5"><ApplicationCatalogContainer onNavigate={navigate} /></div></RuntimeShell>;
}
function WorkspaceScreen({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const navigate = useNavigate(); const { workspace = "" } = useParams();
  const activeKey = `workspace:${decodeURIComponent(workspace)}`;
  return <RuntimeShell boot={boot} logout={logout} activeKey={activeKey} breadcrumbs={[{ label: "Ứng dụng", onClick: () => navigate("/catalog") }, { label: decodeURIComponent(workspace) }]}><WorkspaceContainer defaultWorkspace={decodeURIComponent(workspace)} onOpenLink={(link) => openWorkspaceLink(navigate, link)} /></RuntimeShell>;
}
function openWorkspaceLink(navigate: NavigateFunction, link: { type?: string; link_to?: string }) {
  if (!link.link_to) return;
  const type = (link.type ?? "DocType").toLowerCase();
  if (type.includes("report")) navigate(`/report/${encodeURIComponent(link.link_to)}`);
  else if (type.includes("page")) navigate(`/page/${encodeURIComponent(link.link_to)}`);
  else if (type.includes("dashboard")) navigate(`/dashboard/${encodeURIComponent(link.link_to)}`);
  else if (type === "url") window.open(link.link_to, "_blank", "noopener,noreferrer");
  else navigate(`/app/${encodeURIComponent(link.link_to)}`);
}

function ReportScreen({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const { report = "" } = useParams();
  const value = decodeURIComponent(report);
  return <RuntimeShell boot={boot} logout={logout} activeKey={`report:${report}`} breadcrumbs={[{ label: "Báo cáo" }, { label: value }]}><div className="h-full overflow-auto p-4"><ReportContainer report={value} /></div></RuntimeShell>;
}
function DeskResourceScreen({ boot, logout, kind }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; kind: string }) {
  const params = useParams(); const value = decodeURIComponent(params.page ?? "");
  return <RuntimeShell boot={boot} logout={logout} activeKey={`${kind.toLowerCase()}:${value}`} breadcrumbs={[{ label: kind }, { label: value }]}><div className="grid h-full place-items-center p-8"><div className="max-w-lg rounded-xl border bg-card p-6 text-center"><h1 className="text-lg font-semibold">{value}</h1><p className="mt-2 text-sm text-muted-foreground">Mục {kind} này được phát hiện từ Workspace. Khi chưa có renderer chuyên biệt, mở trong Frappe Desk để giữ đầy đủ hành vi.</p><Button className="mt-4" onClick={() => window.location.assign(adapter.deskFallbackUrl(value))}>Mở trong Frappe Desk</Button></div></div></RuntimeShell>;
}

function SystemScreen({ boot, logout, activeKey, title, children }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; activeKey: string; title: string; children: ReactNode }) {
  return <RuntimeShell boot={boot} logout={logout} activeKey={activeKey} breadcrumbs={[{ label: title }]}><div className="h-full overflow-auto p-4 md:p-5">{children}</div></RuntimeShell>;
}
function ExperienceScreen() { const { key = "" } = useParams(); return <><ExperienceRoute registry={experienceRegistry} activeKey={key} renderNotFound={() => <Navigate to={`/overview/${DOMAIN}`} replace />} /><Toaster /></>; }
function ReceiveRoute() { const navigate = useNavigate(); return <ReceiveExperience onExit={() => navigate(`/overview/${DOMAIN}`)} />; }
