import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowRight, LayoutDashboard, Workflow } from "lucide-react";
import { Button, cn } from "@metaforge/ui";
import {
  AppShell as BaseAppShell,
  type AppShellProps,
  type NavItem,
} from "./AppShell.js";
import {
  buildWorkspaceModules,
  findWorkspaceModule,
  workspaceItemsForTabs,
  type WorkspaceModule,
} from "./workspace-navigation.js";

export type { AppShellProps, NavItem, Breadcrumb, NotificationItem } from "./AppShell.js";

const STORAGE_KEY = "mf-workspace-module";

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
  overviewItem,
  onProcess,
  onNavigate,
}: {
  module: WorkspaceModule;
  activeKey: string;
  processActive: boolean;
  overviewItem?: NavItem;
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
          <Workflow className="mr-1.5 size-3.5" /> Quy trình nghiệp vụ
        </Button>
        {overviewItem ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-kind="overview"
            className={cn(
              "relative h-10 shrink-0 rounded-none border-x-0 border-t-0 border-b-2 border-transparent px-4 text-xs font-medium",
              !processActive && activeKey === overviewItem.key
                ? "border-b-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
            aria-current={!processActive && activeKey === overviewItem.key ? "page" : undefined}
            onClick={() => onNavigate(overviewItem.key)}
          >
            <LayoutDashboard className="mr-1.5 size-3.5" /> Báo cáo tổng quan
          </Button>
        ) : null}
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
    <div className="h-full overflow-auto bg-muted/20 p-4 md:p-6">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{module.label}</div>
          <h1 className="mt-2 text-xl font-semibold md:text-2xl">Quy trình nghiệp vụ</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Chọn nghiệp vụ để mở danh sách, chứng từ hoặc màn thao tác tương ứng. Các mục hiển thị ở đây lấy trực tiếp từ quyền và manifest của ứng dụng đang chạy.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <Button
              key={item.key}
              type="button"
              variant="outline"
              className="group h-auto min-h-24 justify-start gap-3 rounded-xl bg-card p-4 text-left shadow-sm"
              onClick={() => onNavigate(item.key)}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-foreground">{item.label}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">Mở nghiệp vụ trong phân hệ {module.label}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Button>
          ))}
          {!items.length ? (
            <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
              Tài khoản hiện tại chưa có nghiệp vụ khả dụng trong phân hệ này.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/**
 * Lớp điều hướng hai tầng dùng chung cho product runtime:
 * sidebar chỉ hiển thị phân hệ; vùng nội dung có tab Quy trình, Tổng quan và nghiệp vụ.
 * Khi menu không khai `group`, component rơi về AppShell cũ để không phá app đơn giản.
 */
export function AppShell(props: AppShellProps) {
  const modules = useMemo(() => buildWorkspaceModules(props.nav), [props.nav]);
  const activeModule = useMemo(() => findWorkspaceModule(modules, props.activeKey), [modules, props.activeKey]);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(() => loadStoredModule());
  const [processActive, setProcessActive] = useState(false);

  const selectedModule = useMemo(() => {
    return modules.find((module) => module.label === selectedLabel)
      ?? activeModule
      ?? modules[0];
  }, [activeModule, modules, selectedLabel]);

  useEffect(() => {
    if (!activeModule || props.activeKey === "__overview") return;
    setSelectedLabel(activeModule.label);
    storeModule(activeModule.label);
    setProcessActive(false);
  }, [activeModule, props.activeKey]);

  if (!modules.length || !selectedModule) return <BaseAppShell {...props} />;

  const moduleNav: NavItem[] = modules.map((module) => ({
    key: module.key,
    label: module.label,
    icon: module.items.find((item) => item.icon)?.icon,
    keywords: module.items.flatMap((item) => [item.label, ...(item.keywords ?? [])]),
    disabledReason: module.items.some((item) => !item.disabledReason) ? undefined : "Chưa có màn hình khả dụng",
  }));
  const overviewItem = props.nav.find((item) => item.key === "__overview");

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

  return (
    <BaseAppShell
      {...props}
      nav={moduleNav}
      activeKey={selectedModule.key}
      onNavigate={selectModule}
    >
      <div className="flex h-full min-h-0 flex-col">
        <WorkspaceTabs
          module={selectedModule}
          activeKey={props.activeKey}
          processActive={processActive}
          overviewItem={overviewItem}
          onProcess={() => setProcessActive(true)}
          onNavigate={navigate}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          {processActive
            ? <ProcessPanel module={selectedModule} onNavigate={navigate} />
            : props.children as ReactNode}
        </div>
      </div>
    </BaseAppShell>
  );
}
