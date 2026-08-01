import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Workflow } from "lucide-react";
import { FrappeAdapterImpl } from "@metaforge/adapter-frappe";
import { Button, cn, toast } from "@metaforge/ui";
import {
  AppShell as BaseAppShell,
  type AppShellProps,
  type NavItem,
} from "./AppShell.js";
import { ChangePasswordDialog } from "./auth/ChangePasswordDialog.js";
import { ForgeBrandLogo, isAlumdoorSurface } from "./BrandLogo.js";
import {
  buildWorkspaceModules,
  findWorkspaceModule,
  workspaceItemsForTabs,
  type WorkspaceModule,
} from "./workspace-navigation.js";

export type { AppShellProps, NavItem, Breadcrumb, NotificationItem } from "./AppShell.js";

const STORAGE_KEY = "mf-workspace-module";
const accountAdapter = new FrappeAdapterImpl({});

function normalizedGroup(label: string | undefined): string {
  return (label ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
}

function indexHubKey(item: NavItem | undefined): string | undefined {
  const group = normalizedGroup(item?.group);
  if (group === "bao cao") return "__reports";
  if (group === "danh muc") return "__master-data";
  return undefined;
}

function loadStoredModule(): string | undefined {
  try { return localStorage.getItem(STORAGE_KEY) ?? undefined; } catch { return undefined; }
}

function storeModule(label: string) {
  try { localStorage.setItem(STORAGE_KEY, label); } catch { /* private mode */ }
}

function WorkspaceTabs({
  module,
  activeKey,
  processActive,
  onProcess,
  onNavigate,
}: {
  module: WorkspaceModule;
  activeKey: string;
  processActive: boolean;
  onProcess: () => void;
  onNavigate: (key: string) => void;
}) {
  const items = workspaceItemsForTabs(module);
  return (
    <div className="mf-workspace-tabs shrink-0 overflow-x-auto border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <nav className="flex min-w-max items-stretch" aria-label={`Nghiệp vụ ${module.label}`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-kind="process"
          className={cn(
            "relative h-10 shrink-0 rounded-none border-x-0 border-t-0 border-b-2 border-transparent px-4 text-xs font-medium",
            processActive ? "border-b-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
          aria-current={processActive ? "page" : undefined}
          onClick={onProcess}
        >
          <Workflow className="mr-1.5 size-3.5" /> Quy trình
        </Button>
        {items.map((item) => {
          const active = !processActive && activeKey === item.key;
          return (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              size="sm"
              disabled={Boolean(item.disabledReason)}
              title={item.disabledReason}
              data-kind="doctype"
              className={cn(
                "relative h-10 shrink-0 rounded-none border-x-0 border-t-0 border-b-2 border-transparent px-4 text-xs font-medium",
                active
                  ? "border-b-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </Button>
          );
        })}
      </nav>
    </div>
  );
}

function ProcessPanel({ module, onNavigate }: { module: WorkspaceModule; onNavigate: (key: string) => void }) {
  const items = workspaceItemsForTabs(module).filter((item) => !item.disabledReason);
  return (
    <div className="h-full overflow-auto bg-muted/25 p-3 md:p-5">
      <section className="grid w-full gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{module.label}</div>
            <h1 className="mt-1 text-xl font-semibold">Quy trình {module.label.toLocaleLowerCase("vi")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Các bước được sinh từ nghiệp vụ và quyền hiện có trong Meta.</p>
          </div>
          <div className="grid gap-x-0 gap-y-8 p-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item, index) => (
              <div key={item.key} className="relative flex min-w-0 items-center justify-center px-3">
                <Button type="button" variant="ghost" className="group relative z-10 h-auto min-h-28 w-full min-w-0 flex-col justify-center whitespace-normal rounded-lg px-2 py-3 text-center hover:bg-primary/5" onClick={() => onNavigate(item.key)}>
                  <span className="absolute left-2 top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{index + 1}</span>
                  <span className="grid size-12 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-sm transition-transform group-hover:-translate-y-0.5">{item.icon ?? index + 1}</span>
                  <span className="mt-3 block max-w-full text-sm font-semibold">{item.label}</span>
                </Button>
                {index < items.length - 1 ? <><span className="absolute left-[62%] right-0 top-1/2 hidden h-px bg-primary/35 lg:block" /><ArrowRight className="absolute -right-2 top-1/2 z-20 hidden size-4 -translate-y-1/2 text-primary lg:block" aria-hidden="true" /></> : null}
              </div>
            ))}
            {!items.length ? <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Tài khoản hiện tại chưa có nghiệp vụ khả dụng trong phân hệ này.</div> : null}
          </div>
        </div>
        <aside className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Truy cập nhanh</h2>
          <p className="mt-1 text-xs text-muted-foreground">Mở thẳng màn nghiệp vụ, không cần đi lại quy trình.</p>
          <div className="mt-3 divide-y">
            {items.slice(0, 8).map((item) => (
              <Button key={item.key} variant="ghost" className="h-auto w-full justify-start gap-2 rounded-none px-1 py-3 text-left text-sm" onClick={() => onNavigate(item.key)}>
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

/**
 * Lớp điều hướng hai tầng dùng chung cho product runtime:
 * sidebar hiển thị Tổng quan + phân hệ + Báo cáo/Danh mục; vùng phân hệ chỉ có Quy trình và nghiệp vụ.
 * Khi menu không khai `group`, component rơi về AppShell cũ để không phá app đơn giản.
 */
export function AppShell(props: AppShellProps) {
  const modules = useMemo(() => buildWorkspaceModules(props.nav), [props.nav]);
  const activeModule = useMemo(() => findWorkspaceModule(modules, props.activeKey), [modules, props.activeKey]);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(() => loadStoredModule());
  const [processActive, setProcessActive] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const selectedModule = useMemo(() => {
    return modules.find((module) => module.label === selectedLabel)
      ?? activeModule
      ?? modules[0];
  }, [activeModule, modules, selectedLabel]);

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
    brandMark: props.brandMark ?? <ForgeBrandLogo size={isAlumdoorSurface() ? 32 : 28} />,
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
    const moduleItemKeys = new Set(modules.flatMap((module) => module.items.map((item) => item.key)));
    const globalNav = props.nav.filter((item) => !moduleItemKeys.has(item.key) && !indexHubKey(item));
    const overviewItem = globalNav.find((item) => item.key === "__overview");
    const reportsItem = props.nav.find((item) => item.key === "__reports");
    const masterItem = props.nav.find((item) => item.key === "__master-data");
    const remainingGlobal = globalNav.filter((item) => item.key !== "__overview" && item.key !== "__reports" && item.key !== "__master-data");
    const orderedNav = [
      ...(overviewItem ? [overviewItem] : []),
      ...moduleNav,
      ...(reportsItem ? [reportsItem] : []),
      ...(masterItem ? [masterItem] : []),
      ...remainingGlobal,
    ];

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

    const navigateSidebar = (key: string) => {
      if (key.startsWith("workspace-module:")) selectModule(key);
      else navigate(key);
    };

    const showModule = processActive || Boolean(activeModule);
    const activeSidebarKey = indexHubKey(props.nav.find((item) => item.key === props.activeKey)) ?? props.activeKey;

    shell = (
      <BaseAppShell
        {...shellProps}
        nav={orderedNav}
        activeKey={showModule ? selectedModule.key : activeSidebarKey}
        onNavigate={navigateSidebar}
      >
        {showModule ? <div className="flex h-full min-h-0 flex-col">
          <WorkspaceTabs
            module={selectedModule}
            activeKey={props.activeKey}
            processActive={processActive}
            onProcess={() => setProcessActive(true)}
            onNavigate={navigate}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {processActive
              ? <ProcessPanel module={selectedModule} onNavigate={navigate} />
              : props.children as ReactNode}
          </div>
        </div> : props.children as ReactNode}
      </BaseAppShell>
    );
  }

  return (
    <>
      {shell}
      <ChangePasswordDialog adapter={accountAdapter} open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
