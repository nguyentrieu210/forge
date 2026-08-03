/** @jsxImportSource react */
import type { ReactNode } from "react";
import type { ThemeMode } from "./theme.js";
import type { BrandMode } from "./brand.js";
import { ShellV3Chrome } from "./ShellV3Chrome.js";
import { useWorkspaceTabState } from "./workspace-tab-state.js";

export interface NavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  group?: string;
  badge?: number | string;
  disabledReason?: string;
  keywords?: string[];
}

export interface Breadcrumb {
  label: string;
  onClick?: () => void;
}

export interface NotificationItem {
  name: string;
  subject?: string;
  type?: string;
  document_type?: string;
  document_name?: string;
  read?: 0 | 1;
  creation?: string;
}

export type ShellLayoutMode = "mixed" | "sidebar" | "header";
export type ShellDensity = "compact" | "standard" | "comfortable";

/**
 * Presentation-only workspace entry. The shell owns tab chrome only; document/query
 * authority stays in the route/runtime/view layer that supplies these entries.
 */
export interface WorkspaceTab {
  key: string;
  label: string;
  icon?: ReactNode;
  pinned?: boolean;
  dirty?: boolean;
  closeable?: boolean;
}

export interface AppShellProps {
  brand?: string;
  /** Palette do manifest app kiểm soát. Có giá trị thì preference local không được ghi đè. */
  brandMode?: BrandMode;
  /** Logo app (ReactNode). Không có ⇒ rơi về chữ cái đầu của `brand`. */
  brandMark?: ReactNode;
  /** Hiển thị riêng logo ngang, không ghép thêm tên app ở cạnh. */
  brandLogoOnly?: boolean;

  /** Context navigation supplied by the existing manifest/runtime. */
  nav: NavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;

  /** Optional explicit App Rail. If omitted, V3 derives `workspace-module:*` entries from nav. */
  railNav?: NavItem[];
  activeRailKey?: string;
  onRailNavigate?: (key: string) => void;

  breadcrumbs?: Breadcrumb[];
  fullName?: string;
  userSubtitle?: string;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  /** Khóa bảng màu ở cấp app khi thương hiệu do quản trị nền tảng quyết định. */
  allowBrandChange?: boolean;

  /** Existing app-owned search remains authoritative when supplied; shell provides a nav fallback otherwise. */
  onOpenPalette?: () => void;
  onOpenAI?: () => void;
  aiConfigured?: boolean;
  /** Lối vào app mobile/PWA do runtime app cấp; shell chỉ quyết định vị trí hiển thị. */
  mobileAppHref?: string;

  notificationCount?: number;
  notifications?: NotificationItem[];
  notificationsLoading?: boolean;
  notificationsError?: string | null;
  onRetryNotifications?: () => void;
  onViewAllNotifications?: () => void;
  onNotificationClick?: (notification: NotificationItem) => void;
  onMarkAllRead?: () => void;

  onLogout?: () => void;
  /** menu tài khoản: "Đổi mật khẩu" — ẩn nếu app không cấp. */
  onChangePassword?: () => void;
  /** menu tài khoản: "Đăng xuất khỏi thiết bị khác" — ẩn nếu app không cấp. */
  onLogoutOtherSessions?: () => void;

  businessContext?: ReactNode;

  /**
   * Optional first-class workspace chrome. Supplying apps own routing, dirty truth and
   * restoration; shell only renders commands and emits presentation intents.
   */
  workspaceTabs?: WorkspaceTab[];
  workspaceActiveKey?: string;
  onWorkspaceTabNavigate?: (key: string) => void;
  onWorkspaceTabClose?: (key: string) => void;
  onWorkspaceTabPin?: (key: string, pinned: boolean) => void;
  onWorkspaceTabCloseOthers?: (key: string) => void;
  onWorkspaceTabCloseRight?: (key: string) => void;
  onWorkspaceTabRefresh?: (key: string) => void;
  onWorkspaceTabReorder?: (key: string, direction: "left" | "right") => void;
  onWorkspaceTabDuplicate?: (key: string) => void;

  children: ReactNode;
}

/**
 * V3 shell entry point. Route-level tabs are local presentation history by default.
 * Apps with richer record/dirty state can replace the whole tab contract without the shell
 * becoming a second router or document authority.
 */
export function AppShell(props: AppShellProps) {
  const autoTabs = useWorkspaceTabState(props.nav, props.activeKey, props.onNavigate);
  if (props.workspaceTabs !== undefined) return <ShellV3Chrome {...props} />;

  return (
    <ShellV3Chrome
      {...props}
      workspaceTabs={autoTabs.tabs}
      workspaceActiveKey={props.activeKey}
      onWorkspaceTabNavigate={autoTabs.navigate}
      onWorkspaceTabClose={autoTabs.close}
      onWorkspaceTabPin={autoTabs.pin}
      onWorkspaceTabCloseOthers={autoTabs.closeOthers}
      onWorkspaceTabCloseRight={autoTabs.closeRight}
      onWorkspaceTabRefresh={autoTabs.refresh}
      onWorkspaceTabReorder={autoTabs.reorder}
    />
  );
}
