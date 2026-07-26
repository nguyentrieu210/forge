import { StrictMode, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { resolveHomeRoute, resolveNavPath, mergeLocale, validateManifest } from "@metaforge/core";
import { FrappeAdapterImpl, createScopeKey, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { createFullRegistry, MetaForgeProvider, DoctypeWorkspace, ReportContainer, OverviewContainer, TreeContainer, PermissionCenter, PrintContainer, type UrlStateBridge } from "@metaforge/views";
import {
  AppShell, AuthBoundary, LoginForm, ChangePasswordDialog, applyBrand, useTheme, resolveIcon,
  BusinessContextProvider, BusinessContextBar, useBusinessContext,
  createExperienceRegistry, ExperienceRoute,
  CommandPalette, type AwesomeRecord,
  type NavItem,
} from "@metaforge/shell";
import { Button, toast } from "@metaforge/ui";
import { APP_MANIFEST, NAV_ROLES, REPORTS } from "./app-manifest.js";
import { FORM_PROFILES } from "./form-profiles.js";
import { FORM_GUIDES } from "./form-guides.js";
import { TonKhoScreen } from "./TonKhoScreen.js";
import { NhapNhanhScreen } from "./NhapNhanhScreen.js";
import { InTemScreen } from "./InTemScreen.js";
import { SetupWizard, useNeedsSetup } from "./SetupWizard.js";
import { NhapExcelScreen } from "./NhapExcelScreen.js";
// Bộ biểu kho theo mẫu VN — dùng chung, không còn nằm riêng trong app này.
import { XuatNhapTonScreen, SoChiTietScreen, TongHopDoiTuongScreen } from "@metaforge/stock-vn";
import { KhoLogo } from "./logo.js";
import { TraTonExperience, ChuyenKhoNhanhExperience } from "./experiences.js";
import "./styles.css";

// Manifest sai cấu trúc thì dừng ngay với thông báo rõ, thay vì lỗi mơ hồ lúc điều hướng.
const manifestCheck = validateManifest(APP_MANIFEST);
if (!manifestCheck.ok) {
  const msg = manifestCheck.issues.filter((i) => i.severity === "error").map((i) => `${i.code}: ${i.message}`).join("\n");
  throw new Error("APP_MANIFEST không hợp lệ (sửa src/app-manifest.ts):\n" + msg);
}

// same-origin theo BASE_URL. Phiên bằng cookie + CSRF (KHÔNG token) — trình duyệt không giữ bí mật.
const adapter = new FrappeAdapterImpl({ url: import.meta.env.BASE_URL.replace(/\/$/, "") });
const registry = createFullRegistry();
const HOME = resolveHomeRoute(APP_MANIFEST);
const NAV_PATH: Record<string, string | null> = Object.fromEntries(APP_MANIFEST.nav.map((n) => [n.key, resolveNavPath(n)]));

/**
 * Lọc menu theo role.
 * ⚠️ CHỈ LÀ GIAO DIỆN — dọn menu cho gọn. Ranh giới quyền THẬT ở server: Frappe kiểm DocPerm +
 * User Permission trên mọi request, kể cả gõ thẳng URL. Route vẫn được đăng ký đầy đủ (không chặn
 * ở client) để deep-link không gãy; nếu không có quyền, server trả lỗi và màn hiện đúng lỗi đó.
 */
function visibleNav(roles: string[]): NavItem[] {
  const has = new Set(roles);
  return APP_MANIFEST.nav
    .filter((n) => {
      const need = NAV_ROLES[n.key];
      if (!need) return true;
      return need.some((r) => has.has(r));
    })
    .map((n) => ({ key: n.key, label: n.label, icon: resolveIcon(n.icon), group: n.group }));
}

function goNav(navigate: (p: string) => void, key: string) {
  const path = NAV_PATH[key];
  if (!path) { console.error(`[Kho] nav "${key}": kind không nhận ra — không điều hướng.`); return; }
  navigate(path);
}

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

/** cầu URL ↔ list-state (giữ @metaforge/views độc lập với router). */
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

/** Khung chung: sidebar + topbar + thanh chọn Công ty/Kho (§9 ORG). */
function Shell({
  boot, onLogout, activeKey, title, children,
}: {
  boot: MetaForgeBootDTO; onLogout: () => void; activeKey: string; title: string; children: ReactNode;
}) {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const { onChangePassword, onLogoutOtherSessions, dialog } = useAccountActions();
  const nav = useMemo(() => visibleNav(boot.roles ?? []), [boot.roles]);

  // Ctrl/Cmd+K — tìm nhanh doctype/bản ghi. AppShell chỉ hiện nút "Tìm nhanh" khi có
  // `onOpenPalette`, nên không nối thì cả nút lẫn phím tắt đều không tồn tại.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Chỉ gợi ý các doctype CÓ trong nav và user được thấy — không lộ toàn bộ doctype của site.
  const paletteDoctypes = useMemo(
    () => nav.filter((n) => APP_MANIFEST.nav.find((x) => x.key === n.key)?.kind === "doctype")
            .map((n) => ({ name: n.key, label: n.label })),
    [nav],
  );

  return (
    <AppShell
      nav={nav}
      activeKey={activeKey}
      onNavigate={(k) => goNav(navigate, k)}
      brand={APP_MANIFEST.name}
      brandMark={<KhoLogo className="size-7" />}
      // Công ty/Kho nằm TRÊN TOPBAR (không phải dải riêng bên dưới) — chúng quyết định toàn bộ
      // dữ liệu đang xem nên phải luôn thấy, và tiết kiệm một hàng chiều cao.
      businessContext={<div className="mf-business-context flex items-center gap-1.5"><BusinessContextBar /></div>}
      onOpenPalette={() => setPaletteOpen(true)}
      theme={theme}
      onThemeChange={setTheme}
      fullName={boot.full_name}
      breadcrumbs={[{ label: title }]}
      onLogout={onLogout}
      onChangePassword={onChangePassword}
      onLogoutOtherSessions={onLogoutOtherSessions}
    >
      {children}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        doctypes={paletteDoctypes}
        searchRecords={async (query, signal): Promise<AwesomeRecord[]> => {
          const r = await adapter.globalSearch(query, { limit: 20 }).catch(() => []);
          if (signal.aborted) return [];
          return r.map((i) => ({ doctype: i.doctype, name: i.name, title: i.title ?? i.name }));
        }}
        onSelectDoctype={(dt) => { setPaletteOpen(false); navigate(`/app/${encodeURIComponent(dt)}`); }}
        onSelectRecord={(r) => { setPaletteOpen(false); navigate(`/app/${encodeURIComponent(r.doctype)}/${encodeURIComponent(r.name)}`); }}
      />
      {dialog}
    </AppShell>
  );
}

/** List/Form generic cho các DocType trong nav — field hiển thị do FORM_PROFILES quyết định. */
function DoctypeScreen({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  const navigate = useNavigate();
  const { doctype = "", name } = useParams();
  const bridge = useBridge();
  const label = APP_MANIFEST.nav.find((n) => n.key === doctype)?.label ?? doctype;
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey={doctype} title={label}>
      <div className="h-full p-4">
        <DoctypeWorkspace doctype={doctype} name={name} onNavigate={(p) => navigate(p)} bridge={bridge} />
      </div>
    </Shell>
  );
}

/** Tổng quan (§19) — chỉ số/biểu đồ/việc cần xử lý do server tính theo Công ty & Kho đang chọn. */
function TongQuanScreen({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  const navigate = useNavigate();
  const { key = "stock" } = useParams();
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey={key} title="Tổng quan">
      <div className="h-full overflow-auto p-4">
        <OverviewContainer domain={key} onNavigate={(route) => navigate(route)} />
      </div>
    </Shell>
  );
}

/** Cây kho — Warehouse là nested set (is_group/parent_warehouse), bảng phẳng làm mất quan hệ
 * cha–con. Bấm 1 nút lá mở đúng form của kho đó. */
function CayKhoScreen({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  const navigate = useNavigate();
  const ctx = useBusinessContext();
  const ctxCompany = ctx.selection?.company ? String(ctx.selection.company) : "";
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="cay-kho" title="Kho hàng">
      <div className="flex h-full flex-col overflow-hidden p-4">
        <TreeContainer
          doctype="Warehouse"
          editable
          // Kho mới luôn thuộc công ty đang chọn ở thanh trên — không bắt khai lại.
          createDefaults={ctxCompany ? { company: ctxCompany } : undefined}
          onSelect={(name) => navigate(`/app/Warehouse/${encodeURIComponent(name)}`)}
        />
      </div>
    </Shell>
  );
}

function TonKho({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="ton-kho" title="Tồn kho">
      <div className="h-full p-4"><TonKhoScreen /></div>
    </Shell>
  );
}

/**
 * Thiết lập — MODAL bật đè lên màn đang xem, không phải một trang riêng.
 *
 * Route /thiet-lap chỉ là đường vào từ menu: nó đưa về trang chính rồi mở hộp thoại. Làm thành
 * trang riêng thì bấm "Thiết lập" ở một bước sẽ rời trang và mất luôn ngữ cảnh onboarding.
 */
function ThietLap({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const { blocking } = useNeedsSetup();
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="thiet-lap" title="Thiết lập">
      <div className="h-full" />
      <SetupWizard
        open={open}
        blocking={blocking}
        onOpenChange={(v) => { setOpen(v); if (!v) navigate(HOME); }}
        onNavigate={(path) => navigate(path)}
      />
    </Shell>
  );
}

/**
 * Chặn ở cửa: site chưa có dữ liệu nền thì đưa thẳng vào wizard.
 * Không chặn thì người dùng mở app thấy MỌI màn đều trống và mọi form đều lỗi, mà không có gì
 * chỉ cho họ biết phải bắt đầu từ đâu.
 */
/**
 * Mở onboarding khi vào app — bằng MODAL đè lên màn hiện tại, KHÔNG điều hướng đi đâu cả.
 *
 * Bản trước đá người dùng sang route /thiet-lap. Hai vấn đề: mất màn họ đang định vào, và mỗi
 * lần bấm "Thiết lập" ở một bước lại phải rời trang rồi tìm đường quay lại. Modal giữ nguyên
 * ngữ cảnh: đóng cái là ở đúng chỗ cũ.
 */
function SetupGate({ children }: { children: ReactNode }) {
  const { needed, loading, blocking } = useNeedsSetup();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    // Chỉ tự mở MỘT LẦN mỗi phiên — không bật lại mỗi khi điều hướng.
    if (!loading && needed && !seen && location.pathname !== "/thiet-lap") {
      setOpen(true);
      setSeen(true);
    }
  }, [needed, loading, seen, location.pathname]);

  return (
    <>
      {children}
      {location.pathname !== "/thiet-lap" ? (
        <SetupWizard
          open={open}
          blocking={blocking}
          onOpenChange={setOpen}
          onNavigate={(path) => navigate(path)}
        />
      ) : null}
    </>
  );
}

/** Nhập chứng từ hàng loạt từ file mẫu MISA AMIS. */
function NhapExcel({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="nhap-excel" title="Nhập từ Excel">
      <div className="h-full"><NhapExcelScreen /></div>
    </Shell>
  );
}

/** In tem mã QR + mã vạch cho mặt hàng — không có tem thì không quét được gì. */
function InTem({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="in-tem" title="In tem mã vạch">
      <div className="h-full"><InTemScreen /></div>
    </Shell>
  );
}

/** Nhập hàng nhanh — màn quét-là-xong, thay cho form Purchase Receipt đầy trường thừa. */
function NhapNhanh({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="nhap-nhanh" title="Nhập hàng nhanh">
      <div className="h-full"><NhapNhanhScreen /></div>
    </Shell>
  );
}

/** Nhập xuất tồn — biểu kế toán kho theo mẫu VN, dựng riêng thay vì bảng thô của Query Report. */
function XuatNhapTon({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="bc-xnt" title="Báo cáo nhập xuất tồn">
      <div className="h-full p-4"><XuatNhapTonScreen /></div>
    </Shell>
  );
}

/** Sổ chi tiết vật tư (S10-DN) / Thẻ kho (S12-DN) — cùng nguồn, khác cột. */
function SoChiTiet({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="bc-so-chi-tiet" title="Sổ chi tiết vật tư / Thẻ kho">
      <div className="h-full p-4"><SoChiTietScreen /></div>
    </Shell>
  );
}

/** Tổng hợp nhập theo nhà cung cấp / xuất theo khách hàng. */
function TongHopDoiTuong({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="bc-doi-tuong" title="Nhập/xuất theo đối tác">
      <div className="h-full p-4"><TongHopDoiTuongScreen /></div>
    </Shell>
  );
}

/** Báo cáo (§19) — Query Report chuẩn ERPNext, lọc theo Công ty/Kho đang chọn. */
function BaoCaoScreen({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  const { slug = "" } = useParams();
  const entry = REPORTS[slug];
  const navKey = APP_MANIFEST.nav.find((n) => n.route === `/bao-cao/${slug}`)?.key ?? "";
  if (!entry) {
    return (
      <Shell boot={boot} onLogout={onLogout} activeKey={navKey} title="Báo cáo">
        <div className="p-8 text-muted-foreground">Không có báo cáo "{slug}".</div>
      </Shell>
    );
  }
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey={navKey} title={entry.title}>
      <div className="h-full overflow-auto p-4">
        <ReportContainer report={entry.report} />
      </div>
    </Shell>
  );
}

/** Màn công nhân — MobileShell riêng, KHÔNG bọc AppShell (toàn màn hình, thao tác 1 tay). */
const EXPERIENCES = createExperienceRegistry([
  { key: "tra-ton", title: "Quét tra tồn", render: () => <TraTonBridge /> },
  { key: "chuyen-nhanh", title: "Chuyển kho nhanh", render: () => <ChuyenKhoBridge /> },
]);

function TraTonBridge() {
  const navigate = useNavigate();
  return <TraTonExperience onBack={() => navigate(HOME)} />;
}
function ChuyenKhoBridge() {
  const navigate = useNavigate();
  return <ChuyenKhoNhanhExperience onBack={() => navigate(HOME)} />;
}

function ExperienceScreen() {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  return (
    <ExperienceRoute
      registry={EXPERIENCES}
      activeKey={key}
      renderNotFound={(k) => (
        <div className="grid min-h-[100dvh] place-items-center gap-3 p-8 text-center text-muted-foreground">
          <div>Màn "{k}" chưa được đăng ký.</div>
          <Button variant="outline" onClick={() => navigate(HOME)}>Về trang chính</Button>
        </div>
      )}
    />
  );
}

/** Trung tâm phân quyền (§9 ORG-008) — Role, phạm vi dữ liệu, phân tích quyền hiệu lực. */
function PhanQuyenScreen({ boot, onLogout }: { boot: MetaForgeBootDTO; onLogout: () => void }) {
  return (
    <Shell boot={boot} onLogout={onLogout} activeKey="phan-quyen" title="Phân quyền">
      <div className="h-full overflow-auto p-4"><PermissionCenter /></div>
    </Shell>
  );
}

/** Trang in — full-page riêng, không sidebar. */
function PrintScreen() {
  const navigate = useNavigate();
  const { doctype = "", name = "" } = useParams();
  return (
    <PrintContainer
      doctype={doctype}
      name={decodeURIComponent(name)}
      onBack={() => navigate(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)}
    />
  );
}

/** Cầu nối: lấy selection/policies từ BusinessContextProvider đưa vào MetaForgeProvider. */
function DataProviders({ boot, children }: { boot: MetaForgeBootDTO; children: ReactNode }) {
  const ctx = useBusinessContext();
  return (
    <MetaForgeProvider
      adapter={adapter}
      registry={registry}
      roles={boot.roles}
      scopeKey={createScopeKey(boot)}
      locale={mergeLocale(boot.sysdefaults, APP_MANIFEST.locale)}
      businessContext={ctx.selection}
      contextPolicies={APP_MANIFEST.businessContext?.policies}
      formProfiles={FORM_PROFILES}
      formGuides={FORM_GUIDES}
    >
      {children}
    </MetaForgeProvider>
  );
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
        <BusinessContextProvider
          adapter={adapter}
          appId={APP_MANIFEST.id}
          dimensions={APP_MANIFEST.businessContext?.dimensions}
          storageKey={createScopeKey(boot)}
        >
          <DataProviders boot={boot}>
            <SetupGate>
            <Routes>
              <Route path="/" element={<Navigate to={HOME} replace />} />
              <Route path="/overview/:key" element={<TongQuanScreen boot={boot} onLogout={logout} />} />
              <Route path="/cay-kho" element={<CayKhoScreen boot={boot} onLogout={logout} />} />
              <Route path="/phan-quyen" element={<PhanQuyenScreen boot={boot} onLogout={logout} />} />
              <Route path="/ton-kho" element={<TonKho boot={boot} onLogout={logout} />} />
              <Route path="/nhap-nhanh" element={<NhapNhanh boot={boot} onLogout={logout} />} />
              <Route path="/in-tem" element={<InTem boot={boot} onLogout={logout} />} />
              <Route path="/nhap-excel" element={<NhapExcel boot={boot} onLogout={logout} />} />
              <Route path="/thiet-lap" element={<ThietLap boot={boot} onLogout={logout} />} />
              {/* Đặt TRƯỚC route động /bao-cao/:slug — cùng tiền tố, đây là bản dựng riêng. */}
              <Route path="/bao-cao/xuat-nhap-ton" element={<XuatNhapTon boot={boot} onLogout={logout} />} />
              <Route path="/bao-cao/so-chi-tiet" element={<SoChiTiet boot={boot} onLogout={logout} />} />
              <Route path="/bao-cao/tong-hop-doi-tuong" element={<TongHopDoiTuong boot={boot} onLogout={logout} />} />
              <Route path="/bao-cao/:slug" element={<BaoCaoScreen boot={boot} onLogout={logout} />} />
              <Route path="/x/:key" element={<ExperienceScreen />} />
              <Route path="/app/:doctype" element={<DoctypeScreen boot={boot} onLogout={logout} />} />
              <Route path="/app/:doctype/:name" element={<DoctypeScreen boot={boot} onLogout={logout} />} />
              <Route path="/print/:doctype/:name" element={<PrintScreen />} />
              <Route path="*" element={<Navigate to={HOME} replace />} />
            </Routes>
            </SetupGate>
          </DataProviders>
        </BusinessContextProvider>
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
