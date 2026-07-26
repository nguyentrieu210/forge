/**
 * templates — nội dung app MỎNG do create-metaforge-app sinh ra (Gate 7.3). THUẦN: renderTemplates
 * trả map path→nội dung (dễ test, không đụng fs). App sinh ra TIÊU THỤ @metaforge/* qua dist (workspace:*
 * trong monorepo) — KHÔNG copy engine source. Chỉ gồm: manifest (data) + mount runtime + shell mỏng.
 */
/** 6 package @metaforge/* app sinh ra tiêu thụ trực tiếp (KHÔNG gồm builder/create-metaforge-app —
 * app mỏng không cần Builder/CLI chính nó). */
export const MF_PACKAGES = ["adapter-frappe", "controls", "core", "shell", "ui", "views"] as const;

export interface ScaffoldOptions {
  /** id kebab (thư mục + manifest.id). */
  id: string;
  /** tên hiển thị. */
  name: string;
  /** doctype trang chủ. */
  homeDoctype: string;
  /** domain overview/process: stock|selling|buying|accounts|manufacturing|hr|crm|projects|assets|support|quality. */
  domain?: string;
  /** specifier cho TỪNG @metaforge/* package (key = tên ngắn, vd "core") — KHÁC NHAU khi
   * --source local (mỗi package 1 file: path riêng), GIỐNG NHAU (workspace:* hoặc semver) khi
   * workspace/external. Thiếu package nào → mặc định "workspace:*". */
  metaforgeDeps?: Partial<Record<(typeof MF_PACKAGES)[number], string>>;
}

function sub(tpl: string, o: ScaffoldOptions): string {
  const depsBlock = MF_PACKAGES.map((p) => `    "@metaforge/${p}": "${o.metaforgeDeps?.[p] ?? "workspace:*"}"`).join(",\n");
  return tpl
    .replace(/\{\{ID\}\}/g, o.id)
    .replace(/\{\{NAME\}\}/g, o.name)
    .replace(/\{\{HOME\}\}/g, o.homeDoctype)
    .replace(/\{\{DOMAIN\}\}/g, o.domain ?? "stock")
    .replace(/\{\{MFDEPS\}\}/g, depsBlock);
}

const PKG = `{
  "name": "{{ID}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc -b",
    "build": "tsc -b && vite build"
  },
  "dependencies": {
{{MFDEPS}},
    "lucide-react": "^0.460.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "5.6.3",
    "vite": "5.4.11"
  },
  "pnpm": {
    "overrides": {
{{MFDEPS}}
    }
  }
}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`;

const VITE = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;

const INDEX_HTML = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{NAME}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

// Tailwind v4: scan src + dist các package @metaforge (component dùng utility class ⇒ phải quét dist).
const STYLES = `@import "tailwindcss";
@import "@metaforge/ui/styles.css";
@source "./";
@source "../node_modules/@metaforge/ui/dist";
@source "../node_modules/@metaforge/views/dist";
@source "../node_modules/@metaforge/shell/dist";
@source "../node_modules/@metaforge/controls/dist";
@source "../node_modules/@metaforge/builder/dist";
`;

const MANIFEST = `import type { AppManifest } from "@metaforge/core";

/** App mỏng: runtime tự sinh topnav context, catalog Workspace, Tổng quan và Quy trình theo role. */
export const APP_MANIFEST: AppManifest = {
  id: "{{ID}}",
  name: "{{NAME}}",
  version: "1.0.0",
  brand: "blue",
  domain: "{{DOMAIN}}",
  catalogMode: "hybrid",
  home: { route: "/overview/{{DOMAIN}}", doctype: "{{HOME}}" },
  businessContext: {
    mode: "server-resolved",
    dimensions: ["company", "fiscal_year", "warehouse"],
  },
  nav: [
    { key: "{{DOMAIN}}", label: "Tổng quan", kind: "overview", group: "Điều hành", icon: "layout-dashboard" },
    { key: "{{DOMAIN}}-process", label: "Quy trình", kind: "process", route: "/process/{{DOMAIN}}", group: "Điều hành", icon: "workflow" },
    { key: "catalog", label: "Danh mục ứng dụng", kind: "route", route: "/catalog", group: "Điều hành", icon: "grid-3x3" },
    { key: "{{HOME}}", label: "{{HOME}}", kind: "doctype", group: "Ứng dụng tùy chỉnh" },
  ],
};
`;

const MAIN = `import { StrictMode, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams, type NavigateFunction } from "react-router-dom";
import { mergeLocale, validateManifest, type ApplicationCatalog, type AppManifest } from "@metaforge/core";
import { FrappeAdapterImpl, createScopeKey, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import {
  ApplicationCatalogContainer, createFullRegistry, MetaForgeProvider, DoctypeWorkspace,
  OverviewContainer, ProcessContainer, PermissionCenter, ReportContainer, WorkspaceContainer,
  type UrlStateBridge,
} from "@metaforge/views";
import {
  AppShell, AuthBoundary, BusinessContextBar, BusinessContextProvider, I18nProvider,
  LoginForm, applyBrand, resolveIcon, useBusinessContext, useTheme, type NavItem,
} from "@metaforge/shell";
import { Button } from "@metaforge/ui";
import { APP_MANIFEST } from "./app-manifest.js";
import "./styles.css";

const manifestCheck = validateManifest(APP_MANIFEST);
if (!manifestCheck.ok) {
  const msg = manifestCheck.issues.filter((issue) => issue.severity === "error").map((issue) => \`\${issue.code}: \${issue.message}\`).join("\\n");
  throw new Error("APP_MANIFEST không hợp lệ:\\n" + msg);
}
const adapter = new FrappeAdapterImpl({ url: import.meta.env.BASE_URL.replace(/\\/$/, "") });
const registry = createFullRegistry();
const DOMAIN = APP_MANIFEST.domain ?? "stock";

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

interface RuntimeNav extends NavItem { route: string; doctype?: string; }
function manifestRoute(item: AppManifest["nav"][number]): string | null {
  const kind = item.kind ?? "doctype";
  if (kind === "doctype") return \`/app/\${encodeURIComponent(item.key)}\`;
  if (kind === "overview") return item.route ?? \`/overview/\${encodeURIComponent(item.key)}\`;
  if (kind === "process") return item.route ?? \`/process/\${encodeURIComponent(item.key)}\`;
  if (kind === "workspace") return item.route ?? "/catalog";
  if (kind === "experience") return \`/x/\${encodeURIComponent(item.key)}\`;
  if (kind === "route" || kind === "system") return item.route ?? null;
  return null;
}
function buildNavigation(catalog: ApplicationCatalog | undefined, roles: string[] = []): RuntimeNav[] {
  const items: RuntimeNav[] = [
    { key: "__overview", label: "Tổng quan", group: "Điều hành", icon: resolveIcon("layout-dashboard"), route: \`/overview/\${DOMAIN}\` },
    { key: "__process", label: "Quy trình", group: "Điều hành", icon: resolveIcon("workflow"), route: \`/process/\${DOMAIN}\` },
    { key: "__catalog", label: "Danh mục ứng dụng", group: "Điều hành", icon: resolveIcon("grid-3x3"), route: "/catalog" },
  ];
  if (roles.includes("System Manager") || roles.includes("Administrator")) {
    items.push({ key: "__permissions", label: "Trung tâm phân quyền", group: "Hệ thống", icon: resolveIcon("shield-check"), route: "/permissions" });
  }
  const routes = new Set(items.map((item) => item.route));
  for (const app of catalog?.apps ?? []) for (const workspace of app.workspaces) {
    const route = \`/workspace/\${encodeURIComponent(workspace.key)}\`;
    if (routes.has(route)) continue;
    routes.add(route);
    items.push({ key: \`workspace:\${workspace.key}\`, label: workspace.label, group: \`Ứng dụng · \${app.label}\`, icon: resolveIcon(workspace.icon ?? app.icon ?? "layout-grid"), route, keywords: [workspace.module ?? "", app.module ?? ""] });
  }
  for (const nav of APP_MANIFEST.nav) {
    const route = manifestRoute(nav);
    if (!route || routes.has(route) || ["overview", "process"].includes(nav.kind ?? "")) continue;
    routes.add(route);
    items.push({ key: nav.key, label: nav.label, group: nav.group ?? "Ứng dụng tùy chỉnh", icon: resolveIcon(nav.icon), route, doctype: (nav.kind ?? "doctype") === "doctype" ? nav.key : undefined });
  }
  return items;
}

function RootApp() {
  useEffect(() => { applyBrand(APP_MANIFEST.brand ?? "blue"); }, []);
  return <I18nProvider><AuthBoundary
    adapter={adapter}
    renderLoading={() => <div className="grid h-screen place-items-center text-muted-foreground">Đang kết nối Frappe…</div>}
    renderError={(message) => <div className="grid h-screen place-items-center text-destructive">Lỗi kết nối: {message}</div>}
    renderGuest={(retry) => <LoginForm adapter={adapter} onSuccess={retry} title={APP_MANIFEST.name} />}
  >{(boot, auth) => <BusinessContextProvider adapter={adapter} appId={APP_MANIFEST.id} dimensions={APP_MANIFEST.businessContext?.dimensions} storageKey={\`\${boot.site_name}|\${boot.user}|\${APP_MANIFEST.id}\`}><Runtime boot={boot} logout={auth.logout} /></BusinessContextProvider>}</AuthBoundary></I18nProvider>;
}

function Runtime({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const context = useBusinessContext();
  const [catalog, setCatalog] = useState<ApplicationCatalog>();
  const [catalogError, setCatalogError] = useState<string>();
  useEffect(() => { let alive = true; adapter.getApplicationCatalog(APP_MANIFEST.catalogMode === "manifest" ? APP_MANIFEST.id : undefined).then((value) => { if (alive) setCatalog(value); }).catch((error) => { if (alive) setCatalogError(adapter.mapError(error).message); }); return () => { alive = false; }; }, [context.cacheSuffix]);
  const nav = useMemo(() => buildNavigation(catalog, boot.roles), [catalog, boot.roles]);
  const scopeKey = \`\${createScopeKey(boot)}|\${context.cacheSuffix || "global"}\`;
  if (context.loading && !context.dimensions.length) return <div className="grid h-screen place-items-center text-muted-foreground">Đang xác định phạm vi dữ liệu…</div>;
  return <MetaForgeProvider adapter={adapter} registry={registry} roles={boot.roles} scopeKey={scopeKey} locale={mergeLocale(boot.sysdefaults, APP_MANIFEST.locale)} businessContext={context.selection} contextPolicies={context.policies}>
    {!context.ready ? <Shell boot={boot} logout={logout} nav={nav} active="__overview"><div className="grid h-full place-items-center p-8"><div className="rounded-xl border bg-card p-6 text-center"><h1 className="font-semibold">Cần chọn phạm vi dữ liệu</h1><p className="mt-2 text-sm text-muted-foreground">Chọn Công ty, Năm tài chính hoặc Kho ở topnav.</p><div className="mt-4"><BusinessContextBar /></div></div></div></Shell> : <RuntimeRoutes boot={boot} logout={logout} nav={nav} catalogError={catalogError} />}
  </MetaForgeProvider>;
}

function Shell({ boot, logout, nav, active, breadcrumbs = [], children }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[]; active: string; breadcrumbs?: Array<{ label: string; onClick?: () => void }>; children: ReactNode }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  return <AppShell brand={APP_MANIFEST.name} nav={nav} activeKey={active} onNavigate={(key) => { const item = nav.find((candidate) => candidate.key === key); if (item) navigate(item.route); }} breadcrumbs={breadcrumbs} fullName={boot.full_name} userSubtitle={boot.user} theme={theme} onThemeChange={setTheme} onLogout={logout} businessContext={<BusinessContextBar compact />}>{children}</AppShell>;
}

function RuntimeRoutes({ boot, logout, nav, catalogError }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[]; catalogError?: string }) {
  return <Routes>
    <Route path="/" element={<Navigate to={\`/overview/\${DOMAIN}\`} replace />} />
    <Route path="/overview/:domain" element={<OverviewScreen boot={boot} logout={logout} nav={nav} />} />
    <Route path="/process/:domain" element={<ProcessScreen boot={boot} logout={logout} nav={nav} />} />
    <Route path="/catalog" element={<CatalogScreen boot={boot} logout={logout} nav={nav} error={catalogError} />} />
    <Route path="/permissions" element={<PermissionScreen boot={boot} logout={logout} nav={nav} />} />
    <Route path="/workspace/:workspace" element={<WorkspaceScreen boot={boot} logout={logout} nav={nav} />} />
    <Route path="/app/:doctype" element={<DoctypeScreen boot={boot} logout={logout} nav={nav} />} />
    <Route path="/app/:doctype/:name" element={<DoctypeScreen boot={boot} logout={logout} nav={nav} />} />
    <Route path="/report/:report" element={<ReportScreen boot={boot} logout={logout} nav={nav} />} />
    <Route path="/page/:page" element={<DeskFallback boot={boot} logout={logout} nav={nav} kind="Page" />} />
    <Route path="/dashboard/:page" element={<DeskFallback boot={boot} logout={logout} nav={nav} kind="Dashboard" />} />
    <Route path="*" element={<Navigate to={\`/overview/\${DOMAIN}\`} replace />} />
  </Routes>;
}
function DoctypeScreen({ boot, logout, nav }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[] }) {
  const navigate = useNavigate(); const bridge = useBridge(); const { doctype = APP_MANIFEST.home.doctype ?? "ToDo", name } = useParams();
  const active = nav.find((item) => item.doctype === doctype)?.key ?? doctype;
  return <Shell boot={boot} logout={logout} nav={nav} active={active} breadcrumbs={[{ label: doctype }]}><div className="h-full p-3 md:p-4"><DoctypeWorkspace doctype={doctype} name={name} bridge={bridge} onNavigate={navigate} /></div></Shell>;
}
function OverviewScreen({ boot, logout, nav }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[] }) { const navigate = useNavigate(); const { domain = DOMAIN } = useParams(); return <Shell boot={boot} logout={logout} nav={nav} active="__overview" breadcrumbs={[{ label: "Tổng quan" }]}><div className="h-full overflow-auto p-4"><OverviewContainer domain={domain} onNavigate={navigate} /></div></Shell>; }
function ProcessScreen({ boot, logout, nav }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[] }) { const navigate = useNavigate(); const { domain = DOMAIN } = useParams(); return <Shell boot={boot} logout={logout} nav={nav} active="__process" breadcrumbs={[{ label: "Quy trình" }]}><div className="h-full overflow-auto p-4"><ProcessContainer domain={domain} onNavigate={navigate} /></div></Shell>; }
function CatalogScreen({ boot, logout, nav, error }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[]; error?: string }) { const navigate = useNavigate(); return <Shell boot={boot} logout={logout} nav={nav} active="__catalog" breadcrumbs={[{ label: "Danh mục ứng dụng" }]}><div className="h-full p-4">{error ? <div className="mb-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div> : null}<ApplicationCatalogContainer onNavigate={navigate} /></div></Shell>; }
function PermissionScreen({ boot, logout, nav }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[] }) { return <Shell boot={boot} logout={logout} nav={nav} active="__permissions" breadcrumbs={[{ label: "Trung tâm phân quyền" }]}><div className="h-full overflow-auto p-4"><PermissionCenter /></div></Shell>; }
function WorkspaceScreen({ boot, logout, nav }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[] }) { const navigate = useNavigate(); const { workspace = "" } = useParams(); const value = decodeURIComponent(workspace); return <Shell boot={boot} logout={logout} nav={nav} active={\`workspace:\${value}\`} breadcrumbs={[{ label: "Ứng dụng", onClick: () => navigate("/catalog") }, { label: value }]}><WorkspaceContainer defaultWorkspace={value} onOpenLink={(link) => openWorkspace(navigate, link)} /></Shell>; }
function openWorkspace(navigate: NavigateFunction, link: { type?: string; link_to?: string }) { if (!link.link_to) return; const type = (link.type ?? "DocType").toLowerCase(); if (type.includes("report")) navigate(\`/report/\${encodeURIComponent(link.link_to)}\`); else if (type.includes("page")) navigate(\`/page/\${encodeURIComponent(link.link_to)}\`); else if (type.includes("dashboard")) navigate(\`/dashboard/\${encodeURIComponent(link.link_to)}\`); else navigate(\`/app/\${encodeURIComponent(link.link_to)}\`); }
function ReportScreen({ boot, logout, nav }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[] }) { const { report = "" } = useParams(); const value = decodeURIComponent(report); return <Shell boot={boot} logout={logout} nav={nav} active={\`report:\${report}\`} breadcrumbs={[{ label: "Báo cáo" }, { label: value }]}><div className="h-full overflow-auto p-4"><ReportContainer report={value} /></div></Shell>; }
function DeskFallback({ boot, logout, nav, kind }: { boot: MetaForgeBootDTO; logout: () => Promise<void>; nav: RuntimeNav[]; kind: string }) { const { page = "" } = useParams(); const value = decodeURIComponent(page); return <Shell boot={boot} logout={logout} nav={nav} active={\`\${kind}:\${value}\`} breadcrumbs={[{ label: kind }, { label: value }]}><div className="grid h-full place-items-center p-8"><div className="max-w-lg rounded-xl border bg-card p-6 text-center"><h1 className="font-semibold">{value}</h1><p className="mt-2 text-sm text-muted-foreground">Renderer chuyên biệt chưa có; mở trong Frappe Desk để giữ đầy đủ hành vi.</p><Button className="mt-4" onClick={() => window.location.assign(adapter.deskFallbackUrl(value))}>Mở Frappe Desk</Button></div></div></Shell>; }

createRoot(document.getElementById("root")!).render(<StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><RootApp /></BrowserRouter></StrictMode>);
`;

const GITIGNORE = `node_modules
dist
*.log
`;

const README = `# {{NAME}}

App MetaForge mỏng sinh bởi create-metaforge-app. Runtime có sẵn:

- Global Business Context theo role/User Permission (Company · Fiscal Year · Warehouse).
- Tổng quan KPI và Quy trình nghiệp vụ.
- Danh mục đầy đủ từ Workspace Frappe, lọc theo quyền hiệu lực.
- Form/List/Link/Child Table, modal tạo mới và display-title resolver.

## Chạy
\`\`\`bash
pnpm install
pnpm dev
pnpm build
\`\`\`

Sửa \`src/app-manifest.ts\` để đổi domain, brand, home và mục tùy chỉnh. Engine không bị copy vào app.
`;

/** renderTemplates — map path→nội dung của app sinh ra (thuần, test được). */
export function renderTemplates(o: ScaffoldOptions): Record<string, string> {
  return {
    "package.json": sub(PKG, o),
    "tsconfig.json": sub(TSCONFIG, o),
    "vite.config.ts": sub(VITE, o),
    "index.html": sub(INDEX_HTML, o),
    "src/styles.css": sub(STYLES, o),
    "src/app-manifest.ts": sub(MANIFEST, o),
    "src/main.tsx": sub(MAIN, o),
    ".gitignore": sub(GITIGNORE, o),
    "README.md": sub(README, o),
  };
}
