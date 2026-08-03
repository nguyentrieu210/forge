import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Workflow } from "lucide-react";
import { FrappeAdapterImpl } from "@metaforge/adapter-frappe";
import { Button, toast } from "@metaforge/ui";
import { AppShell as BaseAppShell, type AppShellProps, type NavItem } from "./AppShell.js";
import { ChangePasswordDialog } from "./auth/ChangePasswordDialog.js";
import { ForgeBrandLogo, isAlumdoorSurface } from "./BrandLogo.js";
import { ThemeWelcomeDialog } from "./ThemeWelcomeDialog.js";
import {
  buildWorkspaceModules,
  findWorkspaceModule,
  workspaceItemsForTabs,
  type WorkspaceModule,
} from "./workspace-navigation.js";

export type { AppShellProps, NavItem, Breadcrumb, NotificationItem, WorkspaceTab } from "./AppShell.js";

const MODULE_KEY = "mf-workspace-module";
const accountAdapter = new FrappeAdapterImpl({});

function normalized(label: string | undefined): string {
  return (label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .trim();
}

const ALUMDOOR_GROUPS = new Set([
  "dieu hanh", "ban hang", "kho", "mua hang", "san xuat", "cong no", "bao hanh",
  "bao cao", "danh muc", "he thong", "quy kho",
]);
const ALUMDOOR_HR_GROUPS = new Set(["nhan su", "vong doi nhan su", "cham cong & ca"]);
const ALUMDOOR_HR_KEYS = new Set(["Employee", "Attendance"]);

function isVisibleNavigation(item: NavItem): boolean {
  const group = normalized(item.group);
  if (item.key === "__catalog" || group.startsWith("ung dung · ")) return false;
  if (!isAlumdoorSurface()) return true;
  if (item.key === "catalog") return false;
  if (ALUMDOOR_HR_GROUPS.has(group)) return ALUMDOOR_HR_KEYS.has(item.key);
  return ALUMDOOR_GROUPS.has(group);
}

function loadModule(): string | undefined {
  try { return localStorage.getItem(MODULE_KEY) ?? undefined; } catch { return undefined; }
}

function storeModule(label: string) {
  try { localStorage.setItem(MODULE_KEY, label); } catch { /* private mode */ }
}

function ProcessWorkspace({ module, onNavigate }: { module: WorkspaceModule; onNavigate: (key: string) => void }) {
  const items = workspaceItemsForTabs(module).filter((item) => !item.disabledReason).slice(0, 12);
  return (
    <div className="h-full overflow-auto bg-muted/25 p-3 sm:p-4 lg:p-5">
      <section className="mx-auto w-full max-w-[92rem] space-y-4">
        <header className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/10">
            <Workflow className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace</p>
            <h1 className="truncate text-lg font-semibold tracking-tight">{module.label}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Chọn nghiệp vụ để mở route hiện tại; shell không giữ document state riêng.</p>
          </div>
        </header>

        {items.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((item, index) => (
              <Button
                key={item.key}
                variant="ghost"
                className="h-auto min-h-20 justify-start gap-3 rounded-xl border bg-card px-3 py-3 text-left shadow-sm hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/[0.035] hover:shadow-md"
                onClick={() => onNavigate(item.key)}
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground [&_svg]:size-5">
                  {item.icon ?? index + 1}
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border-2 border-card bg-card text-[9px] font-bold text-primary">{index + 1}</span>
                </span>
                <span className="min-w-0 whitespace-normal font-semibold leading-5">{item.label}</span>
              </Button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Chưa có nghiệp vụ khả dụng trong phân hệ này.</div>
        )}
      </section>
    </div>
  );
}

/** Manifest groups remain authoritative; V3 only re-presents them as rail/context/workspace chrome. */
export function AppShell(props: AppShellProps) {
  const visibleNav = useMemo(() => props.nav.filter(isVisibleNavigation), [props.nav]);
  const modules = useMemo(() => buildWorkspaceModules(visibleNav), [visibleNav]);
  const activeModule = useMemo(() => findWorkspaceModule(modules, props.activeKey), [modules, props.activeKey]);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(() => loadModule());
  const [processActive, setProcessActive] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const selectedModule = useMemo(
    () => modules.find((module) => module.label === selectedLabel) ?? activeModule ?? modules[0],
    [activeModule, modules, selectedLabel],
  );

  useEffect(() => {
    if (!activeModule) {
      setProcessActive(false);
      return;
    }
    setSelectedLabel(activeModule.label);
    storeModule(activeModule.label);
    setProcessActive(false);
  }, [activeModule, props.activeKey]);

  const logoutOtherSessions = props.onLogoutOtherSessions ?? (() => {
    void accountAdapter.logoutOtherSessions()
      .then(() => toast.success("Đã đăng xuất khỏi các thiết bị khác"))
      .catch((error) => toast.error(accountAdapter.mapError(error).message));
  });

  const shellProps: AppShellProps = {
    ...props,
    nav: visibleNav,
    brandMark: props.brandMark ?? <ForgeBrandLogo size={isAlumdoorSurface() ? 44 : 28} />,
    brandLogoOnly: props.brandLogoOnly ?? isAlumdoorSurface(),
    onChangePassword: props.onChangePassword ?? (() => setPasswordOpen(true)),
    onLogoutOtherSessions: logoutOtherSessions,
  };

  let shell: ReactNode;
  if (!modules.length || !selectedModule) {
    shell = <BaseAppShell {...shellProps} />;
  } else {
    const moduleNav: NavItem[] = modules.map((module) => ({
      key: module.key,
      label: module.label,
      icon: module.items.find((item) => item.icon)?.icon,
      keywords: module.items.flatMap((item) => [item.label, ...(item.keywords ?? [])]),
      disabledReason: module.items.some((item) => !item.disabledReason) ? undefined : "Chưa có màn hình khả dụng",
    }));
    const moduleKeys = new Set(modules.flatMap((module) => module.items.map((item) => item.key)));
    const globalNav = visibleNav.filter((item) => {
      if (moduleKeys.has(item.key)) return false;
      const group = normalized(item.group);
      if (group === "bao cao") return item.key === "__reports";
      if (group === "danh muc") return item.key === "__master-data";
      return true;
    });
    const contextNav = [...workspaceItemsForTabs(selectedModule), ...globalNav];

    const selectModule = (key: string) => {
      const module = modules.find((entry) => entry.key === key);
      if (!module) return;
      setSelectedLabel(module.label);
      storeModule(module.label);
      setProcessActive(true);
    };
    const navigate = (key: string) => {
      setProcessActive(false);
      props.onNavigate(key);
    };
    const activeKey = processActive ? selectedModule.key : props.activeKey;
    const showWorkspace = processActive || Boolean(activeModule);

    shell = (
      <BaseAppShell
        {...shellProps}
        nav={contextNav}
        railNav={moduleNav}
        activeRailKey={showWorkspace ? selectedModule.key : undefined}
        activeKey={activeKey}
        onRailNavigate={selectModule}
        onNavigate={navigate}
      >
        {showWorkspace && processActive
          ? <ProcessWorkspace module={selectedModule} onNavigate={navigate} />
          : props.children as ReactNode}
      </BaseAppShell>
    );
  }

  return (
    <>
      {shell}
      <ThemeWelcomeDialog
        userKey={props.userSubtitle}
        theme={props.theme}
        onThemeChange={props.onThemeChange}
        brandMode={props.brandMode}
        allowBrandChange={props.allowBrandChange}
      />
      <ChangePasswordDialog adapter={accountAdapter} open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
