import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { resolveHomeRoute, resolveNavPath, mergeLocale, validateManifest, type AppNavItem } from "@metaforge/core";
import { FrappeAdapterImpl, createScopeKey, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { createFullRegistry, MetaForgeProvider, DoctypeWorkspace, WorkspaceContainer, PrintContainer, type UrlStateBridge } from "@metaforge/views";
import { AppShell, AuthBoundary, LoginForm, ChangePasswordDialog, applyBrand, useTheme, resolveIcon, type NavItem } from "@metaforge/shell";
import { toast } from "@metaforge/ui";
import { APP_MANIFEST } from "./app-manifest.js";
import "./styles.css";

// Validate NGAY khi app load — manifest sai cấu trúc thì báo lỗi rõ, không chạy tiếp với dữ liệu hỏng.
const manifestCheck = validateManifest(APP_MANIFEST);
if (!manifestCheck.ok) {
  const msg = manifestCheck.issues.filter((i) => i.severity === "error").map((i) => `${i.code}: ${i.message}`).join("\n");
  throw new Error("APP_MANIFEST không hợp lệ (sửa src/app-manifest.ts):\n" + msg);
}

// same-origin theo BASE_URL (build --base=/path/ → SDK gọi /path/api/…). Cookie-session (KHÔNG
// token) — production PHẢI đăng nhập qua LoginForm để có session cookie + CSRF, không có bí mật
// API nào ở phía trình duyệt.
const adapter = new FrappeAdapterImpl({ url: import.meta.env.BASE_URL.replace(/\/$/, "") });
const registry = createFullRegistry();

// resolveIcon (@metaforge/shell) tra ĐỘNG toàn bộ bộ icon lucide-react theo tên kebab-case trong
// manifest — không map tay danh sách cố định (icon nào app chọn cũng có, không mất âm thầm).
const NAV: NavItem[] = APP_MANIFEST.nav.map((n) => ({ key: n.key, label: n.label, icon: resolveIcon(n.icon), group: n.group }));
const HOME = resolveHomeRoute(APP_MANIFEST);
const HOME_DOCTYPE = APP_MANIFEST.home.doctype ?? APP_MANIFEST.nav[0]!.key;
// resolveNavPath map ĐÚNG theo kind (doctype/route/workspace/system) — KHÔNG gửi mọi nav item tới
// /app/<key> bất kể kind thật.
const NAV_PATH: Record<string, string | null> = Object.fromEntries(APP_MANIFEST.nav.map((n) => [n.key, resolveNavPath(n)]));
function goNav(navigate: (p: string) => void, key: string) {
  const path = NAV_PATH[key];
  if (!path) { console.error(`[MetaForge] nav "${key}": kind không nhận ra hoặc route thiếu — không điều hướng.`); return; }
  navigate(path);
}

/** Hành động menu tài khoản AppShell (Đổi mật khẩu, Đăng xuất thiết bị khác) — dùng chung cho cả 3
 * screen (Screen/WorkspaceScreen/NotImplementedScreen) mỗi cái tự AppShell riêng, giống cách theme
 * cũng đang tự cục bộ mỗi screen. */
function useAccountActions() {
  const [open, setOpen] = useState(false);
  return {
    onChangePassword: () => setOpen(true),
    onLogoutOtherSessions: () => {
      void adapter.logoutOtherSessions()
        .then(() => toast.success("Đã đăng xuất khỏi thiết bị khác"))
        .catch((e) => toast.error(adapter.mapError(e).message));
    },
    dialog: <ChangePasswordDialog adapter={adapter} open={open} onOpenChange={setOpen} />,
  };
}

/** cầu URL ↔ list-state (giữ @metaforge/views router-agnostic). */
function useBridge(): UrlStateBridge {
  const [sp, setSp] = useSearchParams();
  return {
    get: (k) => sp.get(k),
    set: (next) => setSp((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) v == null ? p.delete(k) : p.set(k, v);
      return p;
    }, { replace: true }),
  };
}

function Screen({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  const navigate = useNavigate();
  const { doctype = HOME_DOCTYPE, name } = useParams();
  const [theme, setTheme] = useTheme();
  const bridge = useBridge();
  const { onChangePassword, onLogoutOtherSessions, dialog } = useAccountActions();
  return (
    <AppShell nav={NAV} activeKey={doctype} onNavigate={(k) => goNav(navigate, k)} theme={theme} onThemeChange={setTheme} fullName={boot.full_name} breadcrumbs={[{ label: doctype }]} onLogout={onLogout} onChangePassword={onChangePassword} onLogoutOtherSessions={onLogoutOtherSessions}>
      <div className="h-full p-4">
        <DoctypeWorkspace doctype={doctype} name={name} onNavigate={(p) => navigate(p)} bridge={bridge} />
      </div>
      {dialog}
    </AppShell>
  );
}

/** kind="workspace" — WorkspaceContainer THẬT (@metaforge/views), không phải placeholder. */
function WorkspaceScreen({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const { onChangePassword, onLogoutOtherSessions, dialog } = useAccountActions();
  return (
    <AppShell nav={NAV} activeKey="__workspace" onNavigate={(k) => goNav(navigate, k)} theme={theme} onThemeChange={setTheme} fullName={boot.full_name} breadcrumbs={[{ label: "Workspace" }]} onLogout={onLogout} onChangePassword={onChangePassword} onLogoutOtherSessions={onLogoutOtherSessions}>
      <div className="h-full overflow-auto p-4">
        <WorkspaceContainer onOpenLink={(l) => { if (l.link_to && (!l.type || l.type === "DocType")) navigate("/app/" + l.link_to); }} />
      </div>
      {dialog}
    </AppShell>
  );
}

/** kind="route"/"system" KHÔNG có component riêng — placeholder THẬT (route tồn tại, không redirect
 * loop) thay vì im lặng coi là DocType. Thay bằng component thật khi cần: thêm <Route path=".."> của
 * bạn TRƯỚC route "*" bên dưới. */
function NotImplementedScreen({ boot, onLogout, navKey, title }: { boot: MetaForgeBootDTO; onLogout: () => void; navKey: string; title: string }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const { onChangePassword, onLogoutOtherSessions, dialog } = useAccountActions();
  return (
    <AppShell nav={NAV} activeKey={navKey} onNavigate={(k) => goNav(navigate, k)} theme={theme} onThemeChange={setTheme} fullName={boot.full_name} breadcrumbs={[{ label: title }]} onLogout={onLogout} onChangePassword={onChangePassword} onLogoutOtherSessions={onLogoutOtherSessions}>
      <div className="p-8 text-muted-foreground">
        Màn "{title}" chưa có component riêng — thêm vào <code>src/main.tsx</code> (route đã được đăng ký sẵn, không bị mất/loop điều hướng).
      </div>
      {dialog}
    </AppShell>
  );
}

/** Trang in ấn — full-page riêng (không AppShell/split-view). */
function PrintScreen() {
  const navigate = useNavigate();
  const { doctype = "", name = "" } = useParams();
  return <PrintContainer doctype={doctype} name={decodeURIComponent(name)} onBack={() => navigate(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)} />;
}

function App() {
  useEffect(() => { applyBrand(APP_MANIFEST.brand ?? "blue"); }, []);
  return (
    <AuthBoundary
      adapter={adapter}
      renderLoading={() => <div className="grid h-screen place-items-center text-muted-foreground">Đang tải…</div>}
      renderError={(message) => <div className="grid h-screen place-items-center text-destructive">Lỗi kết nối: {message}</div>}
      renderGuest={(retry) => <LoginForm adapter={adapter} onSuccess={retry} title={APP_MANIFEST.name} />}
    >
      {(boot, { logout }) => (
        <MetaForgeProvider
          adapter={adapter}
          registry={registry}
          roles={boot.roles}
          scopeKey={createScopeKey(boot)}
          locale={mergeLocale(boot.sysdefaults, APP_MANIFEST.locale)}
        >
          <Routes>
            <Route path="/" element={<Navigate to={HOME} replace />} />
            <Route path="/app/:doctype" element={<Screen boot={boot} onLogout={logout} />} />
            <Route path="/app/:doctype/:name" element={<Screen boot={boot} onLogout={logout} />} />
            <Route path="/print/:doctype/:name" element={<PrintScreen />} />
            {APP_MANIFEST.nav.some((n) => n.kind === "workspace") ? (
              <Route path="/workspace" element={<WorkspaceScreen boot={boot} onLogout={logout} />} />
            ) : null}
            {APP_MANIFEST.nav
              .filter((n): n is AppNavItem & { kind: "route" | "system" } => n.kind === "route" || n.kind === "system")
              .map((n) => {
                const path = resolveNavPath(n);
                return path ? <Route key={n.key} path={path} element={<NotImplementedScreen boot={boot} onLogout={logout} navKey={n.key} title={n.label} />} /> : null;
              })}
            <Route path="*" element={<Navigate to={HOME} replace />} />
          </Routes>
        </MetaForgeProvider>
      )}
    </AuthBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
