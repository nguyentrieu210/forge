/** @jsxImportSource react */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Check, ChevronDown, ChevronRight, KeyRound, Keyboard, Menu, Monitor, MonitorSmartphone, Moon, MoreHorizontal,
  PanelLeftClose, PanelLeftOpen, Pin, Search, Sparkles, Sun, LogOut, X,
} from "lucide-react";
import {
  cn, Button, Badge, Avatar, AvatarFallback, ScrollArea, Separator, TooltipProvider, Tooltip,
  TooltipTrigger, TooltipContent, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, ConfirmDialog,
} from "@metaforge/ui";
import type { ThemeMode } from "./theme.js";
import { BRANDS, useBrand, type BrandMode } from "./brand.js";
import { useT } from "./i18n/index.js";

export interface NavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  group?: string;
  badge?: number | string;
  disabledReason?: string;
  keywords?: string[];
}
export interface Breadcrumb { label: string; onClick?: () => void; }
export interface NotificationItem {
  name: string; subject?: string; type?: string; document_type?: string; document_name?: string;
  read?: 0 | 1; creation?: string;
}
export interface AppShellProps {
  brand?: string;
  /** Palette do manifest app kiểm soát. Có giá trị thì preference local không được ghi đè. */
  brandMode?: BrandMode;
  /** Logo app (ReactNode). Không có ⇒ rơi về chữ cái đầu của `brand`. */
  brandMark?: ReactNode;
  /** Hiển thị riêng logo ngang, không ghép thêm tên app ở cạnh. */
  brandLogoOnly?: boolean;
  nav: NavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  breadcrumbs?: Breadcrumb[];
  fullName?: string;
  userSubtitle?: string;
  theme: ThemeMode;
  onThemeChange: (m: ThemeMode) => void;
  /** Khóa bảng màu ở cấp app khi thương hiệu do quản trị nền tảng quyết định. */
  allowBrandChange?: boolean;
  onOpenPalette?: () => void;
  onOpenAI?: () => void;
  aiConfigured?: boolean;
  notificationCount?: number;
  notifications?: NotificationItem[];
  notificationsLoading?: boolean;
  notificationsError?: string | null;
  onRetryNotifications?: () => void;
  onViewAllNotifications?: () => void;
  onNotificationClick?: (n: NotificationItem) => void;
  onMarkAllRead?: () => void;
  onLogout?: () => void;
  /** menu tài khoản: "Đổi mật khẩu" — ẩn nếu app không cấp (vd chưa wiring adapter). */
  onChangePassword?: () => void;
  /** menu tài khoản: "Đăng xuất khỏi thiết bị khác" (giữ phiên hiện tại) — ẩn nếu app không cấp. */
  onLogoutOtherSessions?: () => void;
  businessContext?: ReactNode;
  children: ReactNode;
}

function initials(name?: string): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}
/** Chấm màu xem trước cho từng brand — lấy đúng màu primary của brand đó (xem styles.css). */
const THEME_ICON: Record<ThemeMode, ReactNode> = { light: <Sun className="size-4" />, dark: <Moon className="size-4" />, system: <Monitor className="size-4" /> };

function BreadcrumbCrumb({ b, isLast }: { b: Breadcrumb; isLast: boolean }) {
  return b.onClick && !isLast
    ? <Button variant="ghost" size="sm" className="h-auto truncate px-1 py-0.5 font-normal text-muted-foreground hover:text-foreground" onClick={b.onClick}>{b.label}</Button>
    : <span className={cn("truncate", isLast ? "font-medium" : "text-muted-foreground")}>{b.label}</span>;
}

/** Đường dẫn dài (workspace > module > doctype > record…) trước đây liệt kê hết, tự co từng chữ
 * tới mức khó đọc. Vượt quá 4 mắt xích → gom mắt giữa vào "…" (giữ đầu + 2 cuối), bấm "…" xem đủ. */
function BreadcrumbTrail({ items }: { items: Breadcrumb[] }) {
  const MAX = 4;
  if (items.length <= MAX) {
    return <>{items.map((b, i) => (
      <span key={`${b.label}-${i}`} className="flex min-w-0 items-center gap-1">
        {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        <BreadcrumbCrumb b={b} isLast={i === items.length - 1} />
      </span>
    ))}</>;
  }
  const head = items[0]!;
  const tail = items.slice(-2);
  const hidden = items.slice(1, -2);
  return (
    <>
      <BreadcrumbCrumb b={head} isLast={false} />
      <span className="flex shrink-0 items-center gap-1">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-auto px-1 py-0.5 font-normal text-muted-foreground hover:text-foreground" aria-label="Xem đường dẫn đầy đủ"><MoreHorizontal className="size-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {hidden.map((b, i) => <DropdownMenuItem key={`${b.label}-${i}`} disabled={!b.onClick} onClick={b.onClick}>{b.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      {tail.map((b, i) => (
        <span key={`${b.label}-tail-${i}`} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <BreadcrumbCrumb b={b} isLast={i === tail.length - 1} />
        </span>
      ))}
    </>
  );
}

export function AppShell(props: AppShellProps) {
  const t = useT();
  // Màu thương hiệu nằm CHUNG menu với sáng/tối — cùng là "giao diện", không tách ra màn Cài đặt.
  const [brand, setBrand] = useBrand(
    props.allowBrandChange === false ? props.brandMode : undefined,
    props.brandMode,
  );
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("mf-sidebar-collapsed") === "1"; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const activeGroup = props.nav.find((item) => item.key === props.activeKey)?.group ?? "";
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mf-sidebar-groups") ?? "[]") as string[]); } catch { return new Set(); }
  });
  const groups = useMemo(() => groupNav(props.nav, navQuery), [props.nav, navQuery]);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  // Ghim nav item lên đầu sidebar (client-only) — vẫn giữ nguyên ở nhóm gốc, chỉ thêm 1 nhóm tổng
  // hợp phía trên để truy cập nhanh, giống pattern browser bookmark bar.
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mf-pinned-nav") ?? "[]") as string[]); } catch { return new Set(); }
  });
  const togglePin = (key: string) => setPinnedKeys((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    try { localStorage.setItem("mf-pinned-nav", JSON.stringify([...next])); } catch { /* private mode */ }
    return next;
  });
  const pinnedItems = useMemo(() => props.nav.filter((item) => pinnedKeys.has(item.key)), [props.nav, pinnedKeys]);
  const displayGroups = useMemo(
    () => (pinnedItems.length && !navQuery ? [{ name: t("shell.pinned"), items: pinnedItems }, ...groups] : groups),
    [groups, pinnedItems, navQuery, t],
  );

  useEffect(() => { try { localStorage.setItem("mf-sidebar-collapsed", collapsed ? "1" : "0"); } catch { /* noop */ } }, [collapsed]);
  useEffect(() => { try { localStorage.setItem("mf-sidebar-groups", JSON.stringify([...openGroups])); } catch { /* noop */ } }, [openGroups]);
  useEffect(() => {
    if (activeGroup) setOpenGroups((prev) => prev.has(activeGroup) ? prev : new Set([...prev, activeGroup]));
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [props.activeKey, activeGroup]);

  // Ctrl/Cmd+/ = bảng phím tắt (giống ERPNext Desk) — không bắt khi đang gõ trong input/textarea.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmLogoutOthers, setConfirmLogoutOthers] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "/") return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      setShortcutsOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  const go = (item: NavItem) => {
    if (item.disabledReason) return;
    props.onNavigate(item.key);
    setMobileOpen(false);
    window.requestAnimationFrame(() => mainRef.current?.focus());
  };
  /**
   * Nhóm người dùng ĐÓNG TAY, giữ riêng khỏi `openGroups`.
   *
   * Trước đây một nhóm được mở khi `containsActive || openGroups.has(name)`. Nhóm chứa
   * trang đang xem vì thế **luôn** mở và bấm mũi tên không có tác dụng gì — đúng nhóm mà
   * người dùng hay muốn thu lại nhất, vì nó là nhóm dài nhất đang chiếm chỗ. Không có lỗi
   * nào hiện ra; cái mũi tên chỉ đơn giản là không làm gì.
   *
   * Ghi nhận ý định đóng thành một tập RIÊNG để nó thắng được `containsActive`, thay vì
   * bỏ `containsActive` đi — mở sẵn nhóm đang hoạt động khi mới vào vẫn là hành vi đúng.
   */
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mf-sidebar-groups-closed") ?? "[]") as string[]); } catch { return new Set(); }
  });
  useEffect(() => { try { localStorage.setItem("mf-sidebar-groups-closed", JSON.stringify([...closedGroups])); } catch { /* noop */ } }, [closedGroups]);

  const toggleGroup = (name: string) => {
    const isOpen = openGroups.has(name) || (activeGroup === name && !closedGroups.has(name));
    setOpenGroups((prev) => { const next = new Set(prev); next.delete(name); if (!isOpen) next.add(name); return next; });
    setClosedGroups((prev) => { const next = new Set(prev); next.delete(name); if (isOpen) next.add(name); return next; });
  };

  return (
    <TooltipProvider delayDuration={250}>
      <a className="mf-skip-link" href="#mf-main-content">Bỏ qua menu, tới nội dung chính</a>
      <div className="mf-shell flex h-screen w-full overflow-hidden bg-background text-foreground">
        {mobileOpen ? <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}
        <aside className={cn(
          "mf-shell-sidebar flex shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200",
          // 17rem, not 15.5. Vietnamese menu labels ("Trung tâm phân quyền", "Danh mục
          // ứng dụng") plus an icon, a chevron and the pin button's reserved `pr-7` do not
          // fit in 15.5rem, so they truncated to something the user has to guess at.
          collapsed ? "w-14" : "w-[17rem]",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[min(19rem,88vw)] max-md:shadow-xl",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )} data-collapsed={collapsed ? "true" : "false"}>
          <div className={cn("mf-shell-brand flex items-center gap-2 px-3", props.brandLogoOnly ? "h-16" : "h-12")}>
            {/* Logo do APP cấp. Không có thì mới rơi về chữ cái đầu — chữ cái đầu là phương án
                dự phòng cho app chưa có logo, không phải mặc định nên dùng: nó không khớp favicon
                và làm cùng một phần mềm trông như hai thứ khác nhau giữa tab và thanh bên. */}
            {props.brandMark
              ? <div className={cn(
                  "grid shrink-0 place-items-center overflow-hidden rounded-md",
                  props.brandLogoOnly && !collapsed ? "h-12 w-full bg-white px-0" : "mf-brand-mark size-7",
                )}>{props.brandMark}</div>
              : <div className="mf-brand-mark">{(props.brand ?? "MetaForge").trim().charAt(0).toUpperCase()}</div>}
            {!collapsed && !props.brandLogoOnly ? <span className="truncate font-semibold">{props.brand ?? "MetaForge"}</span> : null}
            <Button variant="ghost" size="icon-sm" className="ml-auto md:hidden" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><X className="size-4" /></Button>
          </div>
          <Separator />

          {!collapsed ? (
            <div className="px-2 pt-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={navQuery} onChange={(e) => setNavQuery(e.target.value)} className="h-8 bg-background pl-8 pr-8 text-xs" placeholder="Tìm trong danh mục…" aria-label="Tìm menu" />
                {navQuery ? <Button variant="ghost" size="icon-sm" className="absolute right-0.5 top-0.5 size-7" onClick={() => setNavQuery("")} aria-label="Xóa tìm kiếm"><X className="size-3.5" /></Button> : null}
              </div>
            </div>
          ) : null}

          {/* `[&_…viewport]>div]:!block` — Radix renders the viewport's child as
              `display:table`, which sizes to CONTENT rather than to the box. In a nav that
              produced a 14px horizontal overflow (231 vs 245 measured), so a horizontal
              scrollbar appeared across the bottom of the menu and ate the last row.
              Fixed HERE and not in the shared ScrollArea: wide tables and charts genuinely
              need horizontal scrolling, and taking it away globally to tidy one sidebar
              would break them. A vertical menu is the case that never wants it. */}
          <ScrollArea className="min-h-0 flex-1 px-2 py-2 [&_[data-radix-scroll-area-viewport]>div]:!block">
            {displayGroups.map((group) => {
              const containsActive = group.items.some((item) => item.key === props.activeKey);
              // Đóng tay thắng `containsActive`; tìm kiếm và sidebar thu gọn vẫn thắng tất cả
              // vì lúc đó việc của người dùng là NHÌN THẤY mọi mục.
              const expanded = collapsed || Boolean(navQuery) || !group.name
                || (!closedGroups.has(group.name) && (containsActive || openGroups.has(group.name)));
              return (
                <div key={group.name || "__root"} className="mb-2">
                  {!collapsed && group.name ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => toggleGroup(group.name)} className={cn("mf-shell-nav-group-label h-auto w-full justify-start gap-2 rounded px-2 py-1 text-left", containsActive && "text-primary")} aria-expanded={expanded}>
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <ChevronDown className={cn("size-3.5 transition-transform", expanded ? "rotate-0" : "-rotate-90")} />
                    </Button>
                  ) : null}
                  {expanded ? group.items.map((item) => {
                    const active = item.key === props.activeKey;
                    const pinned = pinnedKeys.has(item.key);
                    const button = (
                      <Button
                        ref={active ? activeRef : undefined}
                        variant="ghost"
                        disabled={Boolean(item.disabledReason)}
                        title={item.disabledReason}
                        className={cn(
                          "mf-shell-nav-item relative mb-0.5 w-full justify-start gap-2 overflow-hidden border border-transparent font-normal transition-all",
                          collapsed && "justify-center px-0 max-md:justify-start max-md:px-3",
                          !collapsed && "pr-7",
                          active && "border-primary/20 bg-primary/12 font-bold text-primary shadow-sm hover:bg-primary/16 before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full before:bg-primary",
                          item.disabledReason && "opacity-50",
                        )}
                        data-active={active ? "true" : "false"}
                        aria-current={active ? "page" : undefined}
                        onClick={() => go(item)}
                      >
                        <span className={cn("shrink-0 text-muted-foreground [&_svg]:size-4", active && "text-primary")}>{item.icon}</span>
                        {!collapsed ? <span className="min-w-0 flex-1 truncate text-left">{item.label}</span> : null}
                        {!collapsed && item.badge != null ? <Badge variant={active ? "default" : "secondary"} className="ml-auto max-w-14 truncate">{item.badge}</Badge> : null}
                      </Button>
                    );
                    if (collapsed) {
                      return <Tooltip key={item.key}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right">{item.label}{item.disabledReason ? ` — ${item.disabledReason}` : ""}</TooltipContent></Tooltip>;
                    }
                    return (
                      <div key={item.key} className="group/navitem relative">
                        {button}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={cn("absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 transition-opacity group-hover/navitem:opacity-100", pinned && "text-primary opacity-100")}
                          onClick={(e) => { e.stopPropagation(); togglePin(item.key); }}
                          aria-label={`${pinned ? t("shell.unpin") : t("shell.pin")}: ${item.label}`}
                          title={`${pinned ? t("shell.unpin") : t("shell.pin")}: ${item.label}`}
                        >
                          <Pin className={cn("size-3.5", pinned && "fill-current")} />
                        </Button>
                      </div>
                    );
                  }) : null}
                </div>
              );
            })}
            {!displayGroups.length ? <div className="px-2 py-6 text-center text-xs text-muted-foreground">Không tìm thấy menu</div> : null}
          </ScrollArea>

          <Separator />
          <div className="p-2">
            {!collapsed ? (
              <div className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5">
                <Avatar className="size-7"><AvatarFallback>{initials(props.fullName)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{props.fullName ?? "Khách"}</div>{props.userSubtitle ? <div className="truncate text-[11px] text-muted-foreground">{props.userSubtitle}</div> : null}</div>
              </div>
            ) : null}
            <Button variant="ghost" size={collapsed ? "icon" : "sm"} className={cn("w-full", !collapsed && "justify-start gap-2")} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!collapsed ? <span className="text-muted-foreground">{t("shell.collapse", "Thu gọn")}</span> : null}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="mf-shell-topbar flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Menu className="size-4" /></Button>
            {/* Thứ tự chủ ý: điều hướng → Công ty/Kho → tìm nhanh. Công ty/Kho quyết định TOÀN BỘ dữ
                liệu đang xem nên phải nằm ngay đầu, trước cả breadcrumb. */}
            {props.businessContext ? <div className="flex min-w-0 shrink-0 items-center">{props.businessContext}</div> : null}
            <nav className="ml-1 flex min-w-0 items-center gap-1 text-sm"><BreadcrumbTrail items={props.breadcrumbs ?? []} /></nav>

            {/* Ô tìm nhanh CĂN GIỮA topbar: hai khoảng đệm co giãn bằng nhau ở hai bên đẩy nó về đúng
                tâm, bất kể cụm trái (Công ty/Kho/breadcrumb) hay cụm phải dài ngắn thế nào. */}
            <div className="flex-1" />
            {/* Chỉ hiện khi app THẬT cấp handler — trước đây hiện cứng dù không wiring gì (vd apps/kho
                không mount CommandPalette/AI), nút "Tìm nhanh… Ctrl K"/AI trông như hoạt động nhưng
                bấm không làm gì, gây cảm giác app lỗi/thiếu tin cậy. */}
            {props.onOpenPalette ? (
              <Button variant="outline" onClick={props.onOpenPalette} className="mf-shell-search hidden h-8 w-64 shrink-0 justify-start gap-2 px-2.5 font-normal text-muted-foreground hover:bg-muted md:flex"><Search className="size-3.5" /><span className="flex-1 text-left">{t("shell.search", "Tìm nhanh…")}</span><kbd className="rounded border bg-background px-1.5 text-[10px]">Ctrl K</kbd></Button>
            ) : null}
            <div className="flex-1" />
            {props.onOpenAI ? (
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2" onClick={props.onOpenAI} aria-label="Hỏi AI"><Sparkles className={cn("size-4", props.aiConfigured === false ? "text-muted-foreground" : "text-primary")} /><span className="hidden sm:inline">Hỏi AI</span></Button></TooltipTrigger><TooltipContent>Hỏi AI về màn hình đang xem</TooltipContent></Tooltip>
            ) : null}
            <NotificationMenu {...props} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Thêm thao tác"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[80vh] w-56 overflow-y-auto">
                {props.onOpenPalette ? <DropdownMenuItem onClick={props.onOpenPalette}><Search className="size-4" /> {t("shell.search", "Tìm nhanh…")}</DropdownMenuItem> : null}
                {props.onOpenPalette ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("shell.theme_mode")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => props.onThemeChange("light")}><Sun className="size-4" /><span className="flex-1">{t("shell.theme_light")}</span>{props.theme === "light" ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onThemeChange("dark")}><Moon className="size-4" /><span className="flex-1">{t("shell.theme_dark")}</span>{props.theme === "dark" ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onThemeChange("system")}><Monitor className="size-4" /><span className="flex-1">{t("shell.theme_system")}</span>{props.theme === "system" ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem>
                {props.allowBrandChange !== false ? <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("shell.theme_brand")}</DropdownMenuLabel>{BRANDS.map((b) => (<DropdownMenuItem key={b.id} onClick={() => setBrand(b.id)}><span className="size-3.5 shrink-0 rounded-full border [background:var(--mf-brand-swatch)]" style={{ "--mf-brand-swatch": b.swatch } as React.CSSProperties} aria-hidden="true" /><span className="flex-1">{b.label}</span>{brand === b.id ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem>))}</> : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="Giao diện">{THEME_ICON[props.theme]}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-[80vh] w-56 overflow-y-auto"><DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("shell.theme_mode")}</DropdownMenuLabel><DropdownMenuItem onClick={() => props.onThemeChange("light")}><Sun className="size-4" /><span className="flex-1">{t("shell.theme_light")}</span>{props.theme === "light" ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem><DropdownMenuItem onClick={() => props.onThemeChange("dark")}><Moon className="size-4" /><span className="flex-1">{t("shell.theme_dark")}</span>{props.theme === "dark" ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem><DropdownMenuItem onClick={() => props.onThemeChange("system")}><Monitor className="size-4" /><span className="flex-1">{t("shell.theme_system")}</span>{props.theme === "system" ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem>{props.allowBrandChange !== false ? <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("shell.theme_brand")}</DropdownMenuLabel>{BRANDS.map((b) => (<DropdownMenuItem key={b.id} onClick={() => setBrand(b.id)}><span className="size-3.5 shrink-0 rounded-full border [background:var(--mf-brand-swatch)]" style={{ "--mf-brand-swatch": b.swatch } as React.CSSProperties} aria-hidden="true" /><span className="flex-1">{b.label}</span>{brand === b.id ? <Check className="size-3.5 text-primary" /> : null}</DropdownMenuItem>))}</> : null}</DropdownMenuContent></DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full" aria-label="Tài khoản"><Avatar className="size-7"><AvatarFallback>{initials(props.fullName)}</AvatarFallback></Avatar></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel><div className="truncate">{props.fullName ?? "Khách"}</div>{props.userSubtitle ? <div className="truncate text-xs font-normal text-muted-foreground">{props.userSubtitle}</div> : null}</DropdownMenuLabel><DropdownMenuSeparator />{props.onChangePassword ? <DropdownMenuItem onClick={props.onChangePassword}><KeyRound className="size-4" /> {t("account.change_password")}</DropdownMenuItem> : null}{props.onLogoutOtherSessions ? <DropdownMenuItem onClick={() => setConfirmLogoutOthers(true)}><MonitorSmartphone className="size-4" /> {t("account.logout_other_sessions_menu")}</DropdownMenuItem> : null}{props.onLogout ? <DropdownMenuItem onClick={props.onLogout}><LogOut className="size-4" /> Đăng xuất</DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu>
          </header>
          {!online ? <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-700 dark:text-amber-400" role="status">Đang ngoại tuyến. Bạn vẫn có thể xem dữ liệu đã tải; các thay đổi sẽ cần gửi lại khi có mạng.</div> : null}
          {props.businessContext ? <div className="shrink-0 overflow-x-auto border-b bg-muted/20 px-3 py-1.5 lg:hidden">{props.businessContext}</div> : null}
          <main ref={mainRef} id="mf-main-content" tabIndex={0} className="mf-shell-content min-h-0 flex-1 overflow-auto outline-none">{props.children}</main>
        </div>
      </div>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Keyboard className="size-4" /> {t("shell.keyboard_shortcuts")}</DialogTitle></DialogHeader>
          <dl className="space-y-2 text-sm">
            {[
              [props.onOpenPalette ? "Ctrl K" : null, "Tìm nhanh"],
              ["Ctrl S", "Lưu (trong Form)"],
              ["Ctrl Enter", "Gửi bình luận"],
              ["Esc", "Đóng panel/hộp thoại"],
              ["Ctrl /", t("shell.keyboard_shortcuts")],
            ].filter(([key]) => key).map(([key, label]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{key}</kbd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmLogoutOthers}
        onOpenChange={setConfirmLogoutOthers}
        title={t("account.logout_other_sessions_confirm_title")}
        description={t("account.logout_other_sessions_confirm_desc")}
        confirmLabel={t("account.logout_other_sessions_menu")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => props.onLogoutOtherSessions?.()}
      />
    </TooltipProvider>
  );
}

function NotificationMenu(props: AppShellProps) {
  const count = props.notificationCount ?? 0;
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label={count ? `Thông báo, ${count} chưa đọc` : "Thông báo"}><Bell className="size-4" />{count ? <Badge variant="destructive" className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px]">{count > 9 ? "9+" : count}</Badge> : null}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1rem))] p-0"><div className="flex items-center gap-2 border-b px-3 py-2"><span className="text-sm font-medium">Thông báo</span>{count ? <Badge variant="secondary">{count}</Badge> : null}{props.onMarkAllRead && (props.notifications ?? []).some((item) => !item.read) ? <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={props.onMarkAllRead}>Đánh dấu đã đọc</Button> : null}</div><ScrollArea className="max-h-80">{props.notificationsLoading ? <div className="space-y-2 p-3" aria-busy="true"><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /><span className="sr-only">Đang tải thông báo</span></div> : props.notificationsError ? <div className="px-3 py-6 text-center text-sm"><div className="text-destructive">{props.notificationsError}</div>{props.onRetryNotifications ? <Button size="sm" variant="outline" className="mt-2" onClick={props.onRetryNotifications}>Thử lại</Button> : null}</div> : (props.notifications ?? []).length ? <div className="divide-y">{props.notifications!.map((item) => <Button key={item.name} variant="ghost" onClick={() => props.onNotificationClick?.(item)} className={cn("flex h-auto w-full items-start justify-start gap-2 rounded-none px-3 py-2.5 text-left font-normal hover:bg-accent", !item.read && "bg-primary/[0.04]")}><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", !item.read && "bg-primary")} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{item.subject || item.type || "Thông báo"}</span><span className="block truncate text-xs text-muted-foreground">{item.document_type ? `${item.document_type} · ` : ""}{relativeTime(item.creation)}</span></span></Button>)}</div> : <div className="px-3 py-8 text-center text-sm text-muted-foreground">Không có thông báo</div>}</ScrollArea>{props.onViewAllNotifications ? <div className="border-t p-1.5"><Button variant="ghost" size="sm" className="w-full" onClick={props.onViewAllNotifications}>Xem tất cả thông báo</Button></div> : null}</DropdownMenuContent></DropdownMenu>;
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

function groupNav(nav: NavItem[], query: string): Array<{ name: string; items: NavItem[] }> {
  const normalized = query.trim().toLocaleLowerCase("vi");
  const map = new Map<string, NavItem[]>();
  for (const item of nav) {
    if (normalized && !`${item.label} ${item.key} ${(item.keywords ?? []).join(" ")}`.toLocaleLowerCase("vi").includes(normalized)) continue;
    const group = item.group ?? "";
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(item);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
}
