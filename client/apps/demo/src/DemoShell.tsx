import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AppShell, CommandPalette, AIPanel, useTheme,
  createOpenAICompatProvider, createEchoProvider,
  type NavItem, type Breadcrumb, type AwesomeAction, type AwesomeDoctype, type AwesomeRecord,
  type AIProvider, type AIAction, type AIContext, type NotificationItem,
} from "@metaforge/shell";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Toaster, cn } from "@metaforge/ui";
import { loadAIConfig } from "./system/ai-config.js";

/**
 * Đọc cấu hình AI (baseUrl/model ở localStorage, apiKey ở sessionStorage — Gate 5) → tạo provider:
 *  - có baseUrl + apiKey → provider OpenAI-compatible THẬT (cần user cấp ở Thiết lập → AI).
 *  - đã lưu baseUrl nhưng thiếu key (vd sang phiên mới, sessionStorage mất) → echo provider (offline).
 *  - chưa cấu hình gì → null → AIPanel hiện "Chưa cấu hình".
 */
function loadAIProvider(): AIProvider | null {
  const cfg = loadAIConfig();
  if (!cfg.baseUrl && !cfg.apiKey && !cfg.model) return null;
  if (cfg.baseUrl && cfg.apiKey) {
    return createOpenAICompatProvider({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model || "gpt-4o-mini" });
  }
  return createEchoProvider();
}

export interface DemoShellProps {
  nav: NavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  breadcrumbs?: Breadcrumb[];
  fullName?: string;
  userSubtitle?: string;
  businessContext?: ReactNode;
  onLogout?: () => void;
  onChangePassword?: () => void;
  onLogoutOtherSessions?: () => void;
  awesomebar: {
    actions?: AwesomeAction[];
    doctypes?: AwesomeDoctype[];
    recent?: AwesomeRecord[];
    searchRecords?: (q: string, signal: AbortSignal) => Promise<AwesomeRecord[]>;
    onSelectDoctype?: (dt: string) => void;
    onSelectRecord?: (r: AwesomeRecord) => void;
  };
  ai?: { provider?: AIProvider | null; actions?: AIAction[]; context?: AIContext };
  notifications?: {
    items?: NotificationItem[];
    count?: number;
    onClick?: (n: NotificationItem) => void;
    onMarkAllRead?: () => void;
  };
  children: ReactNode;
}

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

/**
 * MISA-style two-level navigation:
 * - the hanging tabs select a business/DocType section;
 * - the sidebar contains only entries belonging to that section.
 *
 * Existing callers already describe sections through NavItem.group, so this remains
 * backward compatible and avoids a second navigation manifest that would drift later.
 */
function WorkspaceTabs({ nav, activeKey, onNavigate }: Pick<DemoShellProps, "nav" | "activeKey" | "onNavigate">) {
  const groups = useMemo(() => {
    const result = new Map<string, NavItem[]>();
    for (const item of nav) {
      const group = item.group?.trim();
      if (!group) continue;
      const entries = result.get(group) ?? [];
      entries.push(item);
      result.set(group, entries);
    }
    return [...result.entries()];
  }, [nav]);

  if (groups.length < 2) return null;
  const activeGroup = nav.find((item) => item.key === activeKey)?.group;

  return (
    <nav className="flex max-w-[min(52vw,44rem)] items-end gap-1 overflow-x-auto px-1" aria-label="Phân hệ nghiệp vụ">
      {groups.map(([group, items]) => {
        const active = group === activeGroup;
        return (
          <Button
            key={group}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "relative h-9 shrink-0 rounded-b-none border border-transparent px-3 text-xs font-medium",
              active
                ? "border-border border-b-background bg-background text-primary shadow-sm after:absolute after:-bottom-px after:inset-x-0 after:h-px after:bg-background"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              const target = items.find((item) => !item.disabledReason);
              if (target) onNavigate(target.key);
            }}
          >
            {group}
          </Button>
        );
      })}
    </nav>
  );
}

export function DemoShell(props: DemoShellProps) {
  const [theme, setTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider | null>(() => props.ai?.provider ?? loadAIProvider());

  const activeGroup = props.nav.find((item) => item.key === props.activeKey)?.group;
  const visibleNav = useMemo(
    () => activeGroup ? props.nav.filter((item) => item.group === activeGroup) : props.nav,
    [activeGroup, props.nav],
  );

  function openAI() {
    // Đọc lại config mỗi lần mở để cập nhật nếu vừa lưu ở Thiết lập.
    setAiProvider(props.ai?.provider ?? loadAIProvider());
    setAiOpen(true);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "/" && !isEditable(document.activeElement) && !paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  const workspaceTabs = <WorkspaceTabs nav={props.nav} activeKey={props.activeKey} onNavigate={props.onNavigate} />;
  const shellContext = workspaceTabs || props.businessContext ? (
    <div className="flex min-w-0 items-end gap-2">
      {workspaceTabs}
      {props.businessContext ? <div className="min-w-0 shrink-0">{props.businessContext}</div> : null}
    </div>
  ) : undefined;

  return (
    <>
      <AppShell
        brand="MetaForge"
        nav={visibleNav}
        activeKey={props.activeKey}
        onNavigate={props.onNavigate}
        breadcrumbs={props.breadcrumbs}
        fullName={props.fullName}
        userSubtitle={props.userSubtitle}
        businessContext={shellContext}
        onLogout={props.onLogout}
        onChangePassword={props.onChangePassword}
        onLogoutOtherSessions={props.onLogoutOtherSessions}
        theme={theme}
        onThemeChange={setTheme}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenAI={openAI}
        aiConfigured={Boolean(aiProvider)}
        notifications={props.notifications?.items}
        notificationCount={props.notifications?.count}
        onNotificationClick={props.notifications?.onClick}
        onMarkAllRead={props.notifications?.onMarkAllRead}
      >
        {props.children}
      </AppShell>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={props.awesomebar.actions}
        doctypes={props.awesomebar.doctypes}
        recent={props.awesomebar.recent}
        searchRecords={props.awesomebar.searchRecords}
        onSelectDoctype={props.awesomebar.onSelectDoctype}
        onSelectRecord={props.awesomebar.onSelectRecord}
      />

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-[380px] p-0 flex flex-col">
          <SheetHeader className="sr-only"><SheetTitle>Trợ lý AI</SheetTitle></SheetHeader>
          <AIPanel provider={aiProvider} actions={props.ai?.actions} context={props.ai?.context} scope="global" />
        </SheetContent>
      </Sheet>

      <Toaster />
    </>
  );
}
