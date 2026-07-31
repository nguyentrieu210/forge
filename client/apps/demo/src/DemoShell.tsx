import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AppShell, CommandPalette, AIPanel, useTheme,
  createOpenAICompatProvider, createEchoProvider,
  type NavItem, type Breadcrumb, type AwesomeAction, type AwesomeDoctype, type AwesomeRecord,
  type AIProvider, type AIAction, type AIContext, type NotificationItem,
} from "@metaforge/shell";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Toaster } from "@metaforge/ui";
import { loadAIConfig } from "./system/ai-config.js";

function loadAIProvider(): AIProvider | null {
  const cfg = loadAIConfig();
  if (!cfg.baseUrl && !cfg.apiKey && !cfg.model) return null;
  if (cfg.baseUrl && cfg.apiKey) {
    return createOpenAICompatProvider({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model || "gpt-4o-mini" });
  }
  return createEchoProvider();
}

export interface WorkspaceTabMeta {
  key: string;
  label: string;
  targetKey: string;
  activeKeys?: string[];
  doctype?: string;
}

export interface WorkspaceModuleMeta {
  key: string;
  label: string;
  icon?: ReactNode;
  tabs: WorkspaceTabMeta[];
  hideTabs?: boolean;
}

export interface WorkspaceMeta {
  modules: WorkspaceModuleMeta[];
}

export interface DemoShellProps {
  nav: NavItem[];
  workspace?: WorkspaceMeta;
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

export function matchesWorkspaceTab(tab: WorkspaceTabMeta, activeKey: string): boolean {
  return tab.targetKey === activeKey || Boolean(tab.activeKeys?.includes(activeKey));
}

function WorkspaceTabs({ module, activeKey, onNavigate }: {
  module: WorkspaceModuleMeta;
  activeKey: string;
  onNavigate: (key: string) => void;
}) {
  if (module.hideTabs || module.tabs.length <= 1) return null;

  return (
    <div className="mf-workspace-tabs sticky top-0 z-20 border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <nav className="flex w-full items-stretch" aria-label={`Nghiệp vụ ${module.label}`}>
        {module.tabs.map((tab) => {
          const active = matchesWorkspaceTab(tab, activeKey);
          return (
            <Button
              key={tab.key}
              type="button"
              variant="ghost"
              size="sm"
              title={tab.label}
              className={`relative h-9 min-w-0 flex-1 rounded-none border-x-0 border-t-0 border-b-2 px-1.5 text-[11px] font-medium sm:px-2 sm:text-xs ${
                active
                  ? "border-b-primary bg-primary/10 text-primary hover:bg-primary/12"
                  : "border-b-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(tab.targetKey)}
            >
              <span className="block w-full truncate">{tab.label}</span>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}

export function DemoShell(props: DemoShellProps) {
  const [theme, setTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider | null>(() => props.ai?.provider ?? loadAIProvider());

  const activeModule = useMemo(
    () => props.workspace?.modules.find((module) => module.tabs.some((tab) => matchesWorkspaceTab(tab, props.activeKey))),
    [props.activeKey, props.workspace],
  );

  const sidebarNav = useMemo<NavItem[]>(
    () => props.workspace
      ? props.workspace.modules.map((module) => ({
          key: module.key,
          label: module.label,
          icon: module.icon,
        }))
      : props.nav,
    [props.nav, props.workspace],
  );

  const sidebarActiveKey = activeModule?.key ?? props.activeKey;

  const navigateFromSidebar = (moduleKey: string) => {
    if (!props.workspace) {
      props.onNavigate(moduleKey);
      return;
    }
    const module = props.workspace.modules.find((entry) => entry.key === moduleKey);
    const target = module?.tabs[0];
    if (target) props.onNavigate(target.targetKey);
  };

  function openAI() {
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

  return (
    <>
      <AppShell
        brand="MetaForge"
        nav={sidebarNav}
        activeKey={sidebarActiveKey}
        onNavigate={navigateFromSidebar}
        breadcrumbs={props.breadcrumbs}
        fullName={props.fullName}
        userSubtitle={props.userSubtitle}
        businessContext={props.businessContext}
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
        {activeModule ? <WorkspaceTabs module={activeModule} activeKey={props.activeKey} onNavigate={props.onNavigate} /> : null}
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
