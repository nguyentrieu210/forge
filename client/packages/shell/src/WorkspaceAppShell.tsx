import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Workflow } from "lucide-react";
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

function ProcessPanel({ module, reports, masters, onNavigate }: { module: WorkspaceModule; reports: NavItem[]; masters: NavItem[]; onNavigate: (key: string) => void }) {
  const items = workspaceItemsForTabs(module).filter((item) => !item.disabledReason);
  const flowItems = items.slice(0, 8);
  const desktopPositions = [
    "sm:col-start-1 sm:row-start-1", "sm:col-start-1 sm:row-start-2",
    "sm:col-start-2 sm:row-start-1", "sm:col-start-2 sm:row-start-2",
    "sm:col-start-3 sm:row-start-1", "sm:col-start-3 sm:row-start-2",
    "sm:col-start-4 sm:row-start-1", "sm:col-start-4 sm:row-start-2",
  ];
  return (
    <div className="h-full overflow-auto bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] p-2 sm:p-4 lg:p-6">
      <section className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="overflow-hidden rounded-md border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-center">
            <h1 className="text-base font-bold uppercase">Nghiệp vụ {module.label}</h1>
          </div>
          {flowItems.length ? (
            <div className="relative grid min-h-[23rem] grid-cols-2 gap-x-4 gap-y-10 px-4 py-7 sm:grid-cols-4 sm:px-8">
              <div className="absolute left-[10%] right-[10%] top-1/2 hidden h-0.5 -translate-y-1/2 bg-primary/30 sm:block" />
              {flowItems.map((item, index) => {
                const top = index % 2 === 0;
                return (
                  <div key={item.key} className={cn("relative z-10 flex min-w-0 justify-center", desktopPositions[index], top ? "sm:items-end sm:pb-8" : "sm:items-start sm:pt-8")}>
                    <span className={cn("absolute left-1/2 hidden w-0.5 -translate-x-1/2 bg-primary/30 sm:block", top ? "bottom-0 h-8" : "top-0 h-8")} />
                    <Button type="button" variant="ghost" className="group h-auto min-h-24 w-full min-w-0 flex-col justify-center whitespace-normal rounded-md px-2 py-2 text-center hover:bg-primary/5" onClick={() => onNavigate(item.key)}>
                      <span className="grid size-12 place-items-center rounded-sm bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-translate-y-0.5 [&_svg]:size-7">{item.icon ?? index + 1}</span>
                      <span className="mt-2 block max-w-full text-sm font-medium leading-5">{item.label}</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : <div className="m-5 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Tài khoản hiện tại chưa có nghiệp vụ khả dụng trong phân hệ này.</div>}
          <div className="grid border-t sm:grid-cols-5">
            {masters.slice(0, 5).map((item) => (
              <Button key={item.key} variant="ghost" className="h-20 min-w-0 flex-col gap-2 rounded-none border-b whitespace-normal text-xs sm:border-b-0 sm:border-r" onClick={() => onNavigate(item.key)}>
                <span className="text-primary [&_svg]:size-5">{item.icon ?? <CheckCircle2 />}</span>
                <span className="line-clamp-2">{item.label}</span>
              </Button>
            ))}
          </div>
        </div>
        <aside className="overflow-hidden rounded-md border bg-card shadow-sm">
          <h2 className="border-b px-4 py-3 text-center text-base font-bold uppercase">Báo cáo</h2>
          <div className="divide-y px-4">
            {reports.slice(0, 6).map((item) => (
              <Button key={item.key} variant="ghost" className="h-auto min-h-14 w-full justify-start gap-3 rounded-none px-0 py-3 text-left text-sm font-normal" onClick={() => onNavigate(item.key)}>
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                <span className="min-w-0 whitespace-normal">{item.label}</span>
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="h-12 w-full rounded-none border-t text-primary" onClick={() => onNavigate("__reports")}>Tất cả báo cáo</Button>
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
    const reportItems = props.nav.filter((item) => normalizedGroup(item.group) === "bao cao" && item.key !== "__reports" && !item.disabledReason);
    const masterItems = props.nav.filter((item) => normalizedGroup(item.group) === "danh muc" && item.key !== "__master-data" && !item.disabledReason);

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
              ? <ProcessPanel module={selectedModule} reports={reportItems} masters={masterItems} onNavigate={navigate} />
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
