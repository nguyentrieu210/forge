/** @jsxImportSource react */
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  KeyRound,
  Keyboard,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Monitor,
  MonitorSmartphone,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@metaforge/ui";
import { BRANDS, useBrand } from "./brand.js";
import { useT } from "./i18n/index.js";
import type {
  AppShellProps,
  Breadcrumb,
  NavItem,
  ShellDensity,
  ShellLayoutMode,
  WorkspaceTab,
} from "./AppShell.js";

interface ShellPreferences {
  layout: ShellLayoutMode;
  density: ShellDensity;
  breadcrumbs: boolean;
  workspaceTabs: boolean;
  reducedMotion: boolean;
}

const DEFAULT_PREFERENCES: ShellPreferences = {
  layout: "mixed",
  density: "standard",
  breadcrumbs: true,
  workspaceTabs: true,
  reducedMotion: false,
};

const PREFS_KEY = "mf-shell-v3-preferences";

function loadPreferences(): ShellPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const value = JSON.parse(raw) as Partial<ShellPreferences>;
    return {
      layout: value.layout === "sidebar" || value.layout === "header" || value.layout === "mixed" ? value.layout : "mixed",
      density: value.density === "compact" || value.density === "comfortable" || value.density === "standard" ? value.density : "standard",
      breadcrumbs: value.breadcrumbs ?? true,
      workspaceTabs: value.workspaceTabs ?? true,
      reducedMotion: value.reducedMotion ?? false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function storePreferences(value: ShellPreferences) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* private mode */ }
}

function initials(name?: string): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "?";
}

function BreadcrumbCrumb({ crumb, last }: { crumb: Breadcrumb; last: boolean }) {
  return crumb.onClick && !last
    ? <Button variant="ghost" size="sm" className="h-auto truncate px-1 py-0.5 font-normal text-muted-foreground hover:text-foreground" onClick={crumb.onClick}>{crumb.label}</Button>
    : <span className={cn("truncate", last ? "font-medium text-foreground" : "text-muted-foreground")}>{crumb.label}</span>;
}

function BreadcrumbTrail({ items }: { items: Breadcrumb[] }) {
  const max = 4;
  if (items.length <= max) {
    return <>{items.map((crumb, index) => (
      <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
        {index > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        <BreadcrumbCrumb crumb={crumb} last={index === items.length - 1} />
      </span>
    ))}</>;
  }
  const head = items[0]!;
  const tail = items.slice(-2);
  const hidden = items.slice(1, -2);
  return (
    <>
      <BreadcrumbCrumb crumb={head} last={false} />
      <span className="flex shrink-0 items-center gap-1">
        <ChevronRight className="size-3.5 text-muted-foreground" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-auto px-1 py-0.5 text-muted-foreground" aria-label="Xem đường dẫn đầy đủ"><MoreHorizontal className="size-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {hidden.map((crumb, index) => <DropdownMenuItem key={`${crumb.label}-${index}`} disabled={!crumb.onClick} onClick={crumb.onClick}>{crumb.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      {tail.map((crumb, index) => (
        <span key={`${crumb.label}-tail-${index}`} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <BreadcrumbCrumb crumb={crumb} last={index === tail.length - 1} />
        </span>
      ))}
    </>
  );
}

function groupNav(nav: NavItem[], query: string): Array<{ name: string; items: NavItem[] }> {
  const normalized = query.trim().toLocaleLowerCase("vi");
  const groups = new Map<string, NavItem[]>();
  for (const item of nav) {
    const haystack = `${item.label} ${item.key} ${(item.keywords ?? []).join(" ")}`.toLocaleLowerCase("vi");
    if (normalized && !haystack.includes(normalized)) continue;
    const group = item.group ?? "";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

function ContextNavigation({
  nav,
  activeKey,
  collapsed,
  query,
  onQueryChange,
  onNavigate,
  onToggleCollapsed,
}: {
  nav: NavItem[];
  activeKey: string;
  collapsed: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onNavigate: (item: NavItem) => void;
  onToggleCollapsed: () => void;
}) {
  const t = useT();
  const activeGroup = nav.find((item) => item.key === activeKey)?.group ?? "";
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mf-sidebar-groups") ?? "[]") as string[]); } catch { return new Set(); }
  });
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mf-sidebar-groups-closed") ?? "[]") as string[]); } catch { return new Set(); }
  });
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mf-pinned-nav") ?? "[]") as string[]); } catch { return new Set(); }
  });

  useEffect(() => { try { localStorage.setItem("mf-sidebar-groups", JSON.stringify([...openGroups])); } catch { /* noop */ } }, [openGroups]);
  useEffect(() => { try { localStorage.setItem("mf-sidebar-groups-closed", JSON.stringify([...closedGroups])); } catch { /* noop */ } }, [closedGroups]);
  useEffect(() => { try { localStorage.setItem("mf-pinned-nav", JSON.stringify([...pinnedKeys])); } catch { /* noop */ } }, [pinnedKeys]);
  useEffect(() => {
    if (activeGroup) setOpenGroups((previous) => previous.has(activeGroup) ? previous : new Set([...previous, activeGroup]));
  }, [activeGroup]);

  const groups = useMemo(() => groupNav(nav, query), [nav, query]);
  const pinnedItems = useMemo(() => nav.filter((item) => pinnedKeys.has(item.key)), [nav, pinnedKeys]);
  const visibleGroups = useMemo(
    () => pinnedItems.length && !query ? [{ name: t("shell.pinned"), items: pinnedItems }, ...groups] : groups,
    [groups, pinnedItems, query, t],
  );

  const toggleGroup = (name: string) => {
    const isOpen = openGroups.has(name) || (activeGroup === name && !closedGroups.has(name));
    setOpenGroups((previous) => {
      const next = new Set(previous);
      next.delete(name);
      if (!isOpen) next.add(name);
      return next;
    });
    setClosedGroups((previous) => {
      const next = new Set(previous);
      next.delete(name);
      if (isOpen) next.add(name);
      return next;
    });
  };

  const togglePin = (key: string) => setPinnedKeys((previous) => {
    const next = new Set(previous);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!collapsed ? (
        <div className="border-b px-3 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Context</div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => onQueryChange(event.target.value)} className="h-8 bg-background pl-8 pr-8 text-xs" placeholder="Tìm trong phân hệ…" aria-label="Tìm menu" />
            {query ? <Button variant="ghost" size="icon-sm" className="absolute right-0.5 top-0.5 size-7" onClick={() => onQueryChange("")} aria-label="Xóa tìm kiếm"><X className="size-3.5" /></Button> : null}
          </div>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1 px-2 py-2 [&_[data-radix-scroll-area-viewport]>div]:!block">
        {visibleGroups.map((group) => {
          const containsActive = group.items.some((item) => item.key === activeKey);
          const expanded = collapsed || Boolean(query) || !group.name || (!closedGroups.has(group.name) && (containsActive || openGroups.has(group.name)));
          return (
            <div key={group.name || "__root"} className="mb-2">
              {!collapsed && group.name ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => toggleGroup(group.name)} className={cn("h-auto w-full justify-start gap-2 rounded-md px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", containsActive && "text-primary")} aria-expanded={expanded}>
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  <ChevronDown className={cn("size-3.5 transition-transform", expanded ? "rotate-0" : "-rotate-90")} />
                </Button>
              ) : null}
              {expanded ? group.items.map((item) => {
                const active = item.key === activeKey;
                const pinned = pinnedKeys.has(item.key);
                const button = (
                  <Button
                    variant="ghost"
                    disabled={Boolean(item.disabledReason)}
                    title={item.disabledReason}
                    className={cn(
                      "group relative mb-0.5 w-full justify-start gap-2 overflow-hidden border border-transparent font-normal",
                      collapsed ? "justify-center px-0" : "pr-7",
                      active && "border-primary/20 bg-primary/[0.09] font-semibold text-primary shadow-sm before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-r-full before:bg-primary",
                      item.disabledReason && "opacity-50",
                    )}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onNavigate(item)}
                  >
                    <span className={cn("shrink-0 text-muted-foreground [&_svg]:size-4", active && "text-primary")}>{item.icon}</span>
                    {!collapsed ? <span className="min-w-0 flex-1 truncate text-left">{item.label}</span> : null}
                    {!collapsed && item.badge != null ? <Badge variant={active ? "default" : "secondary"} className="ml-auto max-w-14 truncate">{item.badge}</Badge> : null}
                  </Button>
                );
                if (collapsed) {
                  return <Tooltip key={item.key}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip>;
                }
                return (
                  <div key={item.key} className="group/navitem relative">
                    {button}
                    <Button type="button" variant="ghost" size="icon-sm" className={cn("absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 group-hover/navitem:opacity-100", pinned && "text-primary opacity-100")} onClick={(event) => { event.stopPropagation(); togglePin(item.key); }} aria-label={`${pinned ? t("shell.unpin") : t("shell.pin")}: ${item.label}`}>
                      <Pin className={cn("size-3.5", pinned && "fill-current")} />
                    </Button>
                  </div>
                );
              }) : null}
            </div>
          );
        })}
        {!visibleGroups.length ? <div className="px-2 py-6 text-center text-xs text-muted-foreground">Không tìm thấy menu</div> : null}
      </ScrollArea>
      <div className="border-t p-2">
        <Button variant="ghost" size={collapsed ? "icon" : "sm"} className={cn("w-full", !collapsed && "justify-start gap-2")} onClick={onToggleCollapsed}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed ? <span className="text-muted-foreground">{t("shell.collapse", "Thu gọn")}</span> : null}
        </Button>
      </div>
    </div>
  );
}

function AppRail({
  brand,
  brandMark,
  items,
  activeKey,
  onNavigate,
  onPreferences,
}: {
  brand?: string;
  brandMark?: ReactNode;
  items: NavItem[];
  activeKey?: string;
  onNavigate: (item: NavItem) => void;
  onPreferences: () => void;
}) {
  return (
    <aside className="mf-shell-sidebar mf-shell-app-rail hidden w-[3.75rem] shrink-0 flex-col items-center border-r bg-sidebar text-sidebar-foreground md:flex" aria-label="Phân hệ ứng dụng">
      <div className="mf-shell-brand flex h-14 w-full items-center justify-center px-2">
        {brandMark ? <div className="grid size-9 place-items-center overflow-hidden rounded-lg [&_img]:max-h-8 [&_img]:max-w-8 [&_svg]:max-h-8 [&_svg]:max-w-8">{brandMark}</div> : <div className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">{(brand ?? "F").trim().charAt(0).toUpperCase()}</div>}
      </div>
      <Separator className="opacity-20" />
      <ScrollArea className="min-h-0 w-full flex-1 py-2 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="flex flex-col items-center gap-1 px-2">
          {items.map((item) => {
            const active = item.key === activeKey;
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={Boolean(item.disabledReason)} aria-current={active ? "page" : undefined} className={cn("mf-shell-nav-item relative size-10 justify-center rounded-lg border border-transparent p-0", active && "border-primary/30 bg-primary text-primary-foreground shadow-sm hover:bg-primary") } onClick={() => onNavigate(item)}>
                    <span className="[&_svg]:size-4">{item.icon ?? item.label.slice(0, 1).toUpperCase()}</span>
                    {item.badge != null ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-sidebar bg-primary" /> : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}{item.disabledReason ? ` — ${item.disabledReason}` : ""}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </ScrollArea>
      <div className="w-full border-t border-white/10 p-2">
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon" className="mx-auto flex size-10 text-sidebar-foreground" onClick={onPreferences} aria-label="Tùy chọn giao diện"><Settings2 className="size-4" /></Button></TooltipTrigger>
          <TooltipContent side="right">Tùy chọn giao diện</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

function WorkspaceTabsBar({
  tabs,
  activeKey,
  onNavigate,
  onClose,
  onPin,
  onCloseOthers,
  onCloseRight,
  onRefresh,
  onReorder,
  onDuplicate,
  maximized,
  onToggleMaximized,
}: {
  tabs: WorkspaceTab[];
  activeKey: string;
  onNavigate?: (key: string) => void;
  onClose?: (key: string) => void;
  onPin?: (key: string, pinned: boolean) => void;
  onCloseOthers?: (key: string) => void;
  onCloseRight?: (key: string) => void;
  onRefresh?: (key: string) => void;
  onReorder?: (key: string, direction: "left" | "right") => void;
  onDuplicate?: (key: string) => void;
  maximized: boolean;
  onToggleMaximized: () => void;
}) {
  return (
    <div className="mf-workspace-tabs flex h-10 shrink-0 items-center border-b bg-card/95 px-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <ScrollArea className="min-w-0 flex-1 whitespace-nowrap">
        <div className="flex h-9 min-w-max items-center gap-0.5 pr-2">
          {tabs.map((tab, index) => {
            const active = tab.key === activeKey;
            return (
              <div key={tab.key} className={cn("group/tab flex h-8 items-center rounded-md border border-transparent", active ? "border-border bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                <Button variant="ghost" size="sm" className="h-7 max-w-56 gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-transparent" onClick={() => onNavigate?.(tab.key)} aria-current={active ? "page" : undefined}>
                  {tab.pinned ? <Pin className="size-3 fill-current text-primary" /> : tab.icon ? <span className="[&_svg]:size-3.5">{tab.icon}</span> : null}
                  <span className="truncate">{tab.label}</span>
                  {tab.dirty ? <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Có thay đổi chưa lưu" /> : null}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="mr-0.5 size-6 opacity-60 hover:opacity-100" aria-label={`Tùy chọn tab ${tab.label}`}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {onRefresh ? <DropdownMenuItem onClick={() => onRefresh(tab.key)}><RefreshCw className="size-4" /> Làm mới</DropdownMenuItem> : null}
                    {onPin ? <DropdownMenuItem onClick={() => onPin(tab.key, !tab.pinned)}><Pin className="size-4" /> {tab.pinned ? "Bỏ ghim" : "Ghim tab"}</DropdownMenuItem> : null}
                    {onDuplicate ? <DropdownMenuItem onClick={() => onDuplicate(tab.key)}><Copy className="size-4" /> Nhân bản</DropdownMenuItem> : null}
                    {onReorder ? <><DropdownMenuSeparator /><DropdownMenuItem disabled={index === 0} onClick={() => onReorder(tab.key, "left")}><ArrowLeft className="size-4" /> Chuyển sang trái</DropdownMenuItem><DropdownMenuItem disabled={index === tabs.length - 1} onClick={() => onReorder(tab.key, "right")}><ArrowRight className="size-4" /> Chuyển sang phải</DropdownMenuItem></> : null}
                    {(onClose || onCloseOthers || onCloseRight) ? <DropdownMenuSeparator /> : null}
                    {onCloseOthers ? <DropdownMenuItem onClick={() => onCloseOthers(tab.key)}>Đóng tab khác</DropdownMenuItem> : null}
                    {onCloseRight ? <DropdownMenuItem onClick={() => onCloseRight(tab.key)}>Đóng bên phải</DropdownMenuItem> : null}
                    {onClose && tab.closeable !== false && !tab.pinned ? <DropdownMenuItem onClick={() => onClose(tab.key)}><X className="size-4" /> Đóng tab</DropdownMenuItem> : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" className="ml-1 size-7 shrink-0" onClick={onToggleMaximized} aria-label={maximized ? "Khôi phục không gian làm việc" : "Mở rộng không gian làm việc"}>{maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</Button></TooltipTrigger>
        <TooltipContent>{maximized ? "Khôi phục workspace" : "Tối đa workspace"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function PreferenceChoice<T extends string>({ value, current, label, onSelect }: { value: T; current: T; label: string; onSelect: (value: T) => void }) {
  const active = value === current;
  return <Button type="button" variant={active ? "default" : "outline"} size="sm" className="h-8 flex-1" onClick={() => onSelect(value)} aria-pressed={active}>{label}</Button>;
}

function PreferencesDialog({
  open,
  onOpenChange,
  preferences,
  onPreferencesChange,
  theme,
  onThemeChange,
  brand,
  onBrandChange,
  allowBrandChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: ShellPreferences;
  onPreferencesChange: (value: ShellPreferences) => void;
  theme: AppShellProps["theme"];
  onThemeChange: AppShellProps["onThemeChange"];
  brand: ReturnType<typeof useBrand>[0];
  onBrandChange: ReturnType<typeof useBrand>[1];
  allowBrandChange: boolean;
}) {
  const update = (patch: Partial<ShellPreferences>) => onPreferencesChange({ ...preferences, ...patch });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="size-4" /> Tùy chọn giao diện</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <section className="space-y-2"><div><h3 className="text-sm font-semibold">Giao diện</h3><p className="text-xs text-muted-foreground">Một trục sáng/tối/hệ thống, không tạo thêm theme zoo.</p></div><div className="flex gap-2"><PreferenceChoice value="light" current={theme} label="Sáng" onSelect={onThemeChange} /><PreferenceChoice value="dark" current={theme} label="Tối" onSelect={onThemeChange} /><PreferenceChoice value="system" current={theme} label="Hệ thống" onSelect={onThemeChange} /></div></section>
          <Separator />
          <section className="space-y-2"><div><h3 className="text-sm font-semibold">Bố cục</h3><p className="text-xs text-muted-foreground">Dùng cùng một manifest điều hướng, chỉ thay cách trình bày.</p></div><div className="flex gap-2"><PreferenceChoice value="mixed" current={preferences.layout} label="Mixed" onSelect={(layout) => update({ layout })} /><PreferenceChoice value="sidebar" current={preferences.layout} label="Sidebar" onSelect={(layout) => update({ layout })} /><PreferenceChoice value="header" current={preferences.layout} label="Header" onSelect={(layout) => update({ layout })} /></div></section>
          <section className="space-y-2"><div><h3 className="text-sm font-semibold">Mật độ</h3><p className="text-xs text-muted-foreground">Ba preset cố định cho ERP, không cho mỗi component tự bày trò.</p></div><div className="flex gap-2"><PreferenceChoice value="compact" current={preferences.density} label="Gọn" onSelect={(density) => update({ density })} /><PreferenceChoice value="standard" current={preferences.density} label="Chuẩn" onSelect={(density) => update({ density })} /><PreferenceChoice value="comfortable" current={preferences.density} label="Thoáng" onSelect={(density) => update({ density })} /></div></section>
          <Separator />
          <section className="space-y-2"><h3 className="text-sm font-semibold">Workspace</h3><div className="grid gap-2 sm:grid-cols-2"><Button variant={preferences.workspaceTabs ? "secondary" : "outline"} className="justify-between" onClick={() => update({ workspaceTabs: !preferences.workspaceTabs })}><span>Workspace tabs</span>{preferences.workspaceTabs ? <Check className="size-4 text-primary" /> : null}</Button><Button variant={preferences.breadcrumbs ? "secondary" : "outline"} className="justify-between" onClick={() => update({ breadcrumbs: !preferences.breadcrumbs })}><span>Breadcrumb</span>{preferences.breadcrumbs ? <Check className="size-4 text-primary" /> : null}</Button></div></section>
          <section className="space-y-2"><h3 className="text-sm font-semibold">Trợ năng</h3><Button variant={preferences.reducedMotion ? "secondary" : "outline"} className="w-full justify-between" onClick={() => update({ reducedMotion: !preferences.reducedMotion })}><span>Giảm chuyển động</span>{preferences.reducedMotion ? <Check className="size-4 text-primary" /> : null}</Button></section>
          {allowBrandChange ? <><Separator /><section className="space-y-2"><div><h3 className="text-sm font-semibold">Thương hiệu khách hàng</h3><p className="text-xs text-muted-foreground">Chỉ là override nhận diện do app cho phép, không tạo authority UI riêng.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{BRANDS.map((entry) => <Button key={entry.id} variant={brand === entry.id ? "secondary" : "outline"} size="sm" className="justify-start gap-2" onClick={() => onBrandChange(entry.id)}><span className="size-3 rounded-full border [background:var(--mf-brand-swatch)]" style={{ "--mf-brand-swatch": entry.swatch } as CSSProperties} />{entry.label}{brand === entry.id ? <Check className="ml-auto size-3.5 text-primary" /> : null}</Button>)}</div></section></> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NotificationMenu(props: AppShellProps) {
  const count = props.notificationCount ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label={count ? `Thông báo, ${count} chưa đọc` : "Thông báo"}><Bell className="size-4" />{count ? <Badge variant="destructive" className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px]">{count > 9 ? "9+" : count}</Badge> : null}</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2"><span className="text-sm font-semibold">Thông báo</span>{count ? <Badge variant="secondary">{count}</Badge> : null}{props.onMarkAllRead && (props.notifications ?? []).some((item) => !item.read) ? <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={props.onMarkAllRead}>Đánh dấu đã đọc</Button> : null}</div>
        <ScrollArea className="max-h-80">
          {props.notificationsLoading ? <div className="space-y-2 p-3" aria-busy="true"><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /><span className="sr-only">Đang tải thông báo</span></div>
            : props.notificationsError ? <div className="px-3 py-6 text-center text-sm"><div className="text-destructive">{props.notificationsError}</div>{props.onRetryNotifications ? <Button size="sm" variant="outline" className="mt-2" onClick={props.onRetryNotifications}>Thử lại</Button> : null}</div>
              : (props.notifications ?? []).length ? <div className="divide-y">{props.notifications!.map((item) => <Button key={item.name} variant="ghost" onClick={() => props.onNotificationClick?.(item)} className={cn("flex h-auto w-full items-start justify-start gap-2 rounded-none px-3 py-2.5 text-left font-normal hover:bg-accent", !item.read && "bg-primary/[0.04]")}><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", !item.read && "bg-primary")} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{item.subject || item.type || "Thông báo"}</span><span className="block truncate text-xs text-muted-foreground">{item.document_type ? `${item.document_type} · ` : ""}{relativeTime(item.creation)}</span></span></Button>)}</div>
                : <div className="px-3 py-8 text-center text-sm text-muted-foreground">Không có thông báo</div>}
        </ScrollArea>
        {props.onViewAllNotifications ? <div className="border-t p-1.5"><Button variant="ghost" size="sm" className="w-full" onClick={props.onViewAllNotifications}>Xem tất cả thông báo</Button></div> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function relativeTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value.includes("T") ? value : value.replace(" ", "T")).getTime();
  if (!Number.isFinite(time)) return value;
  const seconds = Math.round((time - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  return new Date(time).toLocaleDateString("vi-VN");
}

function LocalCommandPalette({
  open,
  onOpenChange,
  rail,
  nav,
  onRailNavigate,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rail: NavItem[];
  nav: NavItem[];
  onRailNavigate: (item: NavItem) => void;
  onNavigate: (item: NavItem) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Tìm phân hệ, màn hình hoặc lệnh…" />
      <CommandList>
        <CommandEmpty>Không tìm thấy lệnh phù hợp.</CommandEmpty>
        {rail.length ? <CommandGroup heading="Phân hệ">{rail.filter((item) => !item.disabledReason).map((item) => <CommandItem key={`rail:${item.key}`} value={`${item.label} ${item.key} ${(item.keywords ?? []).join(" ")}`} onSelect={() => { onRailNavigate(item); onOpenChange(false); }}>{item.icon}<span>{item.label}</span></CommandItem>)}</CommandGroup> : null}
        <CommandGroup heading="Điều hướng">{nav.filter((item) => !item.disabledReason).map((item) => <CommandItem key={`nav:${item.key}`} value={`${item.label} ${item.key} ${(item.keywords ?? []).join(" ")}`} onSelect={() => { onNavigate(item); onOpenChange(false); }}>{item.icon}<span>{item.label}</span></CommandItem>)}</CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function MobileNavigation({
  open,
  onOpenChange,
  rail,
  activeRailKey,
  nav,
  activeKey,
  onRailNavigate,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rail: NavItem[];
  activeRailKey?: string;
  nav: NavItem[];
  activeKey: string;
  onRailNavigate: (item: NavItem) => void;
  onNavigate: (item: NavItem) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("vi");
    if (!value) return nav;
    return nav.filter((item) => `${item.label} ${item.key} ${(item.keywords ?? []).join(" ")}`.toLocaleLowerCase("vi").includes(value));
  }, [nav, query]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(21rem,92vw)] p-0 sm:max-w-sm">
        <SheetHeader className="border-b px-4 py-3"><SheetTitle>Điều hướng</SheetTitle></SheetHeader>
        {rail.length ? <div className="flex gap-1 overflow-x-auto border-b p-2">{rail.map((item) => <Button key={item.key} variant={item.key === activeRailKey ? "secondary" : "ghost"} size="sm" className="shrink-0 gap-1.5" onClick={() => { onRailNavigate(item); onOpenChange(false); }}>{item.icon}<span>{item.label}</span></Button>)}</div> : null}
        <div className="p-3"><div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" placeholder="Tìm màn hình…" /></div></div>
        <ScrollArea className="h-[calc(100dvh-9rem)] px-2 pb-4">{groupNav(filtered, "").map((group) => <div key={group.name || "__root"} className="mb-3">{group.name ? <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.name}</div> : null}{group.items.map((item) => <Button key={item.key} variant={item.key === activeKey ? "secondary" : "ghost"} disabled={Boolean(item.disabledReason)} className="mb-0.5 w-full justify-start gap-2" onClick={() => { onNavigate(item); onOpenChange(false); }}>{item.icon}<span className="truncate">{item.label}</span></Button>)}</div>)}</ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export function ShellV3Chrome(props: AppShellProps) {
  const t = useT();
  const [brand, setBrand] = useBrand(props.allowBrandChange === false ? props.brandMode : undefined, props.brandMode);
  const [preferences, setPreferences] = useState<ShellPreferences>(loadPreferences);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("mf-sidebar-collapsed") === "1"; } catch { return false; } });
  const [navQuery, setNavQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmLogoutOthers, setConfirmLogoutOthers] = useState(false);
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [fullscreen, setFullscreen] = useState(() => typeof document === "undefined" ? false : Boolean(document.fullscreenElement));

  const derivedRail = useMemo(() => props.nav.filter((item) => item.key.startsWith("workspace-module:")), [props.nav]);
  const rail = props.railNav ?? derivedRail;
  const railKeys = useMemo(() => new Set(rail.map((item) => item.key)), [rail]);
  const contextNav = useMemo(() => props.railNav ? props.nav : props.nav.filter((item) => !railKeys.has(item.key)), [props.nav, props.railNav, railKeys]);
  const activeRailKey = props.activeRailKey ?? (railKeys.has(props.activeKey) ? props.activeKey : undefined);
  const showRail = rail.length > 0 && preferences.layout === "mixed" && !workspaceMaximized;
  const showContext = preferences.layout !== "header" && !workspaceMaximized;

  useEffect(() => { storePreferences(preferences); }, [preferences]);
  useEffect(() => { try { localStorage.setItem("mf-sidebar-collapsed", collapsed ? "1" : "0"); } catch { /* noop */ } }, [collapsed]);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        if (typing) return;
        event.preventDefault();
        if (props.onOpenPalette) props.onOpenPalette();
        else setPaletteOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "/") {
        if (typing) return;
        event.preventDefault();
        setShortcutsOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onOpenPalette]);

  const changePreferences = (value: ShellPreferences) => setPreferences(value);
  const go = (item: NavItem) => {
    if (item.disabledReason) return;
    props.onNavigate(item.key);
    setMobileOpen(false);
  };
  const goRail = (item: NavItem) => {
    if (item.disabledReason) return;
    (props.onRailNavigate ?? props.onNavigate)(item.key);
    setMobileOpen(false);
  };
  const openSearch = () => props.onOpenPalette ? props.onOpenPalette() : setPaletteOpen(true);
  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const densityPadding = preferences.density === "compact" ? "px-2" : preferences.density === "comfortable" ? "px-4" : "px-3";
  const contextWidth = collapsed || preferences.layout === "sidebar" && preferences.density === "compact" ? "w-14" : "w-[15.5rem]";
  const motionClass = preferences.reducedMotion ? "[&_*]:!duration-0 [&_*]:!transition-none" : "";

  return (
    <TooltipProvider delayDuration={220}>
      <a className="mf-skip-link" href="#mf-main-content">Bỏ qua menu, tới nội dung chính</a>
      <div className={cn("mf-shell flex h-dvh w-full overflow-hidden bg-background text-foreground", motionClass)} data-density={preferences.density} data-layout={preferences.layout} data-workspace-maximized={workspaceMaximized ? "true" : "false"}>
        {showRail ? <AppRail brand={props.brand} brandMark={props.brandMark} items={rail} activeKey={activeRailKey} onNavigate={goRail} onPreferences={() => setPreferencesOpen(true)} /> : null}

        {showContext ? (
          <aside id="mf-primary-navigation" role="navigation" aria-label="Điều hướng ngữ cảnh" className={cn(
            rail.length ? "mf-shell-context-nav" : "mf-shell-sidebar",
            "hidden shrink-0 border-r bg-card/95 text-foreground backdrop-blur supports-[backdrop-filter]:bg-card/90 md:block",
            contextWidth,
          )} data-collapsed={collapsed ? "true" : "false"}>
            {!rail.length ? <div className="mf-shell-brand flex h-14 items-center gap-2 border-b px-3">{props.brandMark ? <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md">{props.brandMark}</div> : <div className="mf-brand-mark">{(props.brand ?? "MetaForge").trim().charAt(0).toUpperCase()}</div>}{!collapsed && !props.brandLogoOnly ? <span className="truncate font-semibold">{props.brand ?? "MetaForge"}</span> : null}</div> : null}
            <ContextNavigation nav={contextNav} activeKey={props.activeKey} collapsed={collapsed} query={navQuery} onQueryChange={setNavQuery} onNavigate={go} onToggleCollapsed={() => setCollapsed((value) => !value)} />
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {!workspaceMaximized ? <header className={cn("mf-shell-topbar flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85", densityPadding)}>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Mở điều hướng"><Menu className="size-4" /></Button>
            {props.businessContext ? <div className="hidden min-w-0 shrink-0 items-center lg:flex">{props.businessContext}</div> : null}
            {preferences.breadcrumbs ? <nav className="ml-1 flex min-w-0 items-center gap-1 text-sm"><BreadcrumbTrail items={props.breadcrumbs ?? []} /></nav> : null}
            {preferences.layout === "header" && rail.length ? <nav className="hidden min-w-0 items-center gap-1 lg:flex" aria-label="Phân hệ trên header">{rail.slice(0, 7).map((item) => <Button key={item.key} variant={item.key === activeRailKey ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => goRail(item)}>{item.icon}<span className="max-w-28 truncate">{item.label}</span></Button>)}</nav> : null}
            <div className="flex-1" />
            <Button variant="outline" onClick={openSearch} className="mf-shell-search hidden h-8 w-60 shrink-0 justify-start gap-2 px-2.5 font-normal text-muted-foreground hover:bg-muted md:flex"><Search className="size-3.5" /><span className="flex-1 text-left">{t("shell.search", "Tìm nhanh…")}</span><kbd className="rounded border bg-background px-1.5 text-[10px]">Ctrl K</kbd></Button>
            <div className="flex-1" />
            {props.onOpenAI ? <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2" onClick={props.onOpenAI} aria-label="Hỏi AI"><Sparkles className={cn("size-4", props.aiConfigured === false ? "text-muted-foreground" : "text-primary")} /><span className="hidden xl:inline">AI</span></Button></TooltipTrigger><TooltipContent>Hỏi AI về màn hình đang xem</TooltipContent></Tooltip> : null}
            {props.mobileAppHref ? <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => window.location.assign(props.mobileAppHref!)} aria-label="Mở App mobile"><MonitorSmartphone className="size-4" /></Button></TooltipTrigger><TooltipContent>Mở App mobile</TooltipContent></Tooltip> : null}
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={toggleFullscreen} aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}>{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button></TooltipTrigger><TooltipContent>{fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}</TooltipContent></Tooltip>
            <NotificationMenu {...props} />
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setPreferencesOpen(true)} aria-label="Tùy chọn giao diện"><Settings2 className="size-4" /></Button></TooltipTrigger><TooltipContent>Tùy chọn giao diện</TooltipContent></Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full" aria-label="Tài khoản"><Avatar className="size-7"><AvatarFallback>{initials(props.fullName)}</AvatarFallback></Avatar></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel><div className="truncate">{props.fullName ?? "Khách"}</div>{props.userSubtitle ? <div className="truncate text-xs font-normal text-muted-foreground">{props.userSubtitle}</div> : null}</DropdownMenuLabel><DropdownMenuSeparator />{props.onChangePassword ? <DropdownMenuItem onClick={props.onChangePassword}><KeyRound className="size-4" /> {t("account.change_password")}</DropdownMenuItem> : null}{props.onLogoutOtherSessions ? <DropdownMenuItem onClick={() => setConfirmLogoutOthers(true)}><MonitorSmartphone className="size-4" /> {t("account.logout_other_sessions_menu")}</DropdownMenuItem> : null}{props.onLogout ? <DropdownMenuItem onClick={props.onLogout}><LogOut className="size-4" /> Đăng xuất</DropdownMenuItem> : null}</DropdownMenuContent>
            </DropdownMenu>
          </header> : null}

          {!online ? <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-700 dark:text-amber-400" role="status">Đang ngoại tuyến. Dữ liệu chưa tải và thao tác lưu cần kết nối mạng.</div> : null}
          {props.businessContext && !workspaceMaximized ? <div className="shrink-0 overflow-x-auto border-b bg-muted/20 px-3 py-1.5 lg:hidden">{props.businessContext}</div> : null}

          {preferences.workspaceTabs && props.workspaceTabs?.length ? <WorkspaceTabsBar tabs={props.workspaceTabs} activeKey={props.workspaceActiveKey ?? props.activeKey} onNavigate={props.onWorkspaceTabNavigate} onClose={props.onWorkspaceTabClose} onPin={props.onWorkspaceTabPin} onCloseOthers={props.onWorkspaceTabCloseOthers} onCloseRight={props.onWorkspaceTabCloseRight} onRefresh={props.onWorkspaceTabRefresh} onReorder={props.onWorkspaceTabReorder} onDuplicate={props.onWorkspaceTabDuplicate} maximized={workspaceMaximized} onToggleMaximized={() => setWorkspaceMaximized((value) => !value)} /> : workspaceMaximized ? <div className="flex h-10 shrink-0 items-center justify-end border-b bg-card px-2"><Button variant="ghost" size="icon-sm" onClick={() => setWorkspaceMaximized(false)} aria-label="Khôi phục workspace"><Minimize2 className="size-4" /></Button></div> : null}

          <main id="mf-main-content" tabIndex={0} className="mf-shell-content min-h-0 flex-1 overflow-auto outline-none">{props.children}</main>
        </div>
      </div>

      <MobileNavigation open={mobileOpen} onOpenChange={setMobileOpen} rail={rail} activeRailKey={activeRailKey} nav={contextNav} activeKey={props.activeKey} onRailNavigate={goRail} onNavigate={go} />
      <LocalCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} rail={rail} nav={contextNav} onRailNavigate={goRail} onNavigate={go} />
      <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} preferences={preferences} onPreferencesChange={changePreferences} theme={props.theme} onThemeChange={props.onThemeChange} brand={brand} onBrandChange={setBrand} allowBrandChange={props.allowBrandChange !== false} />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle className="flex items-center gap-2"><Keyboard className="size-4" /> {t("shell.keyboard_shortcuts")}</DialogTitle></DialogHeader><dl className="space-y-2 text-sm">{[["Ctrl K", "Tìm nhanh"], ["Ctrl S", "Lưu (trong Form)"], ["Ctrl Enter", "Gửi bình luận"], ["Esc", "Đóng panel/hộp thoại"], ["Ctrl /", t("shell.keyboard_shortcuts")]].map(([key, label]) => <div key={String(label)} className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{key}</kbd></div>)}</dl></DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmLogoutOthers} onOpenChange={setConfirmLogoutOthers} title={t("account.logout_other_sessions_confirm_title")} description={t("account.logout_other_sessions_confirm_desc")} confirmLabel={t("account.logout_other_sessions_menu")} cancelLabel={t("common.cancel")} destructive onConfirm={() => props.onLogoutOtherSessions?.()} />
    </TooltipProvider>
  );
}
