import { type ReactNode, useEffect, useState } from "react";
import {
  AppShell, CommandPalette, AIPanel, useTheme,
  createOpenAICompatProvider, createEchoProvider,
  type NavItem, type Breadcrumb, type AwesomeAction, type AwesomeDoctype, type AwesomeRecord,
  type AIProvider, type AIAction, type AIContext, type AIConfig, type NotificationItem,
} from "@metaforge/shell";
import { Sheet, SheetContent, SheetHeader, SheetTitle, Toaster } from "@metaforge/ui";
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

export function DemoShell(props: DemoShellProps) {
  const [theme, setTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider | null>(() => props.ai?.provider ?? loadAIProvider());

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

  return (
    <>
      <AppShell
        brand="MetaForge"
        nav={props.nav}
        activeKey={props.activeKey}
        onNavigate={props.onNavigate}
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
