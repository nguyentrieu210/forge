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
    <div className="mf-workspace-tabs shrink-0 overflow-x-auto border-b bg-card/90 px-2 py-1.5 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 sm:px-3">
      <nav className="inline-flex min-w-max items-center gap-1 rounded-xl border bg-muted/40 p-1 shadow-sm" aria-label={`Nghiệp vụ ${module.label}`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-kind="process"
          className={cn(
            "h-8 shrink-0 rounded-lg border border-transparent px-3 text-xs font-semibold transition-all",
            processActive
              ? "border-border bg-card text-primary shadow-sm"
              : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
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
                "h-8 shrink-0 rounded-lg border border-transparent px-3 text-xs font-semibold transition-all",
                active
                  ? "border-border bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
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
    <div className="h-full overflow-auto bg-muted/25 p-3 sm:p-4 lg:p-5">
      <section className="mx-auto w-full max-w-[88rem] space-y-3">
        <header className="hidden">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/[0.15]">
              <Workflow className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Không gian nghiệp vụ</p>
              <h1 className="truncate text-lg font-semibold tracking-tight">Quy trình {module.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-muted/40 px-2.5 py-1">{flowItems.length} nghiệp vụ chính</span>
            {reports.length ? <span className="rounded-full border bg-muted/40 px-2.5 py-1">{reports.length} báo cáo</span> : null}
          </div>
        </header>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="order-2 border-b bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-3 py-3 sm:px-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Luồng xử lý chính</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Chọn một bước để mở thẳng màn nghiệp vụ tương ứng.</p>
                </div>
                <span className="hidden rounded-full border bg-card/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">Theo thứ tự thao tác</span>
              </div>
            </div>
            {flowItems.length ? (
              <div className="order-2 relative grid min-h-0 grid-cols-2 gap-x-2 gap-y-3 px-3 py-3 sm:grid-cols-4 sm:gap-x-3 sm:px-4 sm:py-4">
                <div className="absolute left-[9%] right-[9%] top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-primary/[0.45] to-transparent sm:block" />
                {flowItems.map((item, index) => {
                  const top = index % 2 === 0;
                  return (
                    <div key={item.key} className={cn("relative z-10 flex min-w-0 justify-center", desktopPositions[index], top ? "sm:items-end sm:pb-8" : "sm:items-start sm:pt-8")}>
                      <span className={cn("absolute left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-primary/10 via-primary/[0.45] to-primary/10 sm:block", top ? "bottom-0 h-8" : "top-0 h-8")} />
                      <Button
                        type="button"
                        variant="ghost"
                        className="group h-auto min-h-24 w-full min-w-0 flex-col justify-center whitespace-normal rounded-xl border border-transparent px-2 py-2 text-center transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary/[0.045] hover:shadow-sm"
                        onClick={() => onNavigate(item.key)}
                      >
                        <span className="relative grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/10 transition-transform group-hover:scale-[1.03] [&_svg]:size-5">
                          {item.icon ?? index + 1}
                          <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border-2 border-card bg-card text-[9px] font-bold text-primary shadow-sm">{index + 1}</span>
                        </span>
                        <span className="mt-1.5 block max-w-full text-xs font-semibold leading-4 sm:text-sm">{item.label}</span>
                        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">Mở nghiệp vụ</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : <div className="m-5 rounded-xl border border-dashed bg-muted/20 p-7 text-center text-sm text-muted-foreground">Tài khoản hiện tại chưa có nghiệp vụ khả dụng trong phân hệ này.</div>}

            {masters.length ? (
              <div className="order-3 border-t bg-muted/20 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Danh mục nhanh</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Dữ liệu nền dùng thường xuyên trong phân hệ.</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" onClick={() => onNavigate("__master-data")}>Tất cả danh mục</Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {masters.slice(0, 5).map((item) => (
                    <Button
                      key={item.key}
                      variant="ghost"
                      className="h-auto min-h-16 min-w-0 flex-row justify-start gap-2 rounded-lg border bg-card px-2.5 py-2 whitespace-normal text-left text-xs shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-md sm:flex-col sm:justify-center sm:gap-1.5 sm:px-2 sm:text-center"
                      onClick={() => onNavigate(item.key)}
                    >
                      <span className="grid size-8 place-items-center rounded-lg bg-primary/[0.08] text-primary [&_svg]:size-4">{item.icon ?? <CheckCircle2 />}</span>
                      <span className="line-clamp-2 font-medium leading-4">{item.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {masters.length ? (
              <div className="hidden">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Danh mục nhanh</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Dữ liệu nền dùng thường xuyên trong phân hệ.</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs text-primary" onClick={() => onNavigate("__master-data")}>Tất cả danh mục</Button>
                </div>
                <div className="space-y-1.5">
                  {masters.slice(0, 5).map((item) => (
                    <Button
                      key={item.key}
                      variant="ghost"
                      className="h-auto min-h-11 w-full justify-start gap-2.5 rounded-lg border border-transparent bg-card px-2.5 py-2 text-left text-xs shadow-sm transition-all hover:border-primary/25 hover:bg-card hover:shadow-sm"
                      onClick={() => onNavigate(item.key)}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/[0.08] text-primary [&_svg]:size-3.5">{item.icon ?? <CheckCircle2 />}</span>
                      <span className="line-clamp-2 min-w-0 font-medium leading-4">{item.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="border-b bg-gradient-to-br from-primary/[0.09] via-transparent to-transparent px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Phân tích</p>
              <h2 className="mt-0.5 text-base font-semibold tracking-tight">Báo cáo</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Các báo cáo liên quan trực tiếp đến phân hệ {module.label}.</p>
            </div>
            <div className="space-y-1.5 p-2.5">
              {reports.slice(0, 6).map((item, index) => (
                <Button
                  key={item.key}
                  variant="ghost"
                  className="group h-auto min-h-14 w-full justify-start gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left text-sm font-normal transition-all hover:border-border hover:bg-muted/[0.45]"
                  onClick={() => onNavigate(item.key)}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/[0.08] text-[10px] font-bold text-primary ring-1 ring-primary/10">{index + 1}</span>
                  <span className="min-w-0 flex-1 whitespace-normal font-medium leading-5">{item.label}</span>
                  <span className="size-1.5 shrink-0 rounded-full bg-primary/[0.35] transition-colors group-hover:bg-primary" />
                </Button>
              ))}
              {!reports.length ? <div className="rounded-xl border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">Chưa có báo cáo khả dụng.</div> : null}
            </div>
            <div className="border-t p-2.5">
              <Button variant="outline" className="h-9 w-full rounded-lg text-primary" onClick={() => onNavigate("__reports")}>Xem tất cả báo cáo</Button>
            </div>
          </aside>
        </div>
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
    brandMark: props.brandMark ?? <ForgeBrandLogo size={isAlumdoorSurface() ? 40 : 28} />,
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
