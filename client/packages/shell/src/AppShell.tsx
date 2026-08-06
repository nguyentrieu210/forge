/** @jsxImportSource react */
import type { ReactNode } from "react";
import type { ThemeMode } from "./theme.js";
import type { BrandMode } from "./brand.js";
import { AppShell as V2AppShell } from "./AppShellV2.js";

export interface NavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  group?: string;
  badge?: number | string;
  disabledReason?: string;
  keywords?: string[];
}

/**
 * Pure presentation policy for the shared two-level workspace shell.
 *
 * Business apps may curate dependency navigation without teaching the shared shell any
 * vertical names. This is deliberately data-only: no render callbacks, no permission
 * authority and no business computation. The server still owns permission and the nav
 * entries themselves; this policy only projects which already-authorized entries belong
 * in the daily workspace and which reports/masters sit beside each module.
 */
export interface WorkspaceNavigationPolicy {
  /** After optional group projection, keep only these sidebar groups. Omit for all groups. */
  allowedGroups?: string[];
  /** Hide specific already-authorized nav keys from the product workspace. */
  hiddenKeys?: string[];
  /** Presentation-only regrouping for dependency-owned nav entries. */
  groupByKey?: Record<string, string>;
  /** Report nav key -> workspace labels where the report is contextual. */
  reportAffinities?: Record<string, string[]>;
  /** Master-data nav key -> workspace labels where the master is contextual. */
  masterAffinities?: Record<string, string[]>;
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

/** Compatibility-only V3 type. V2 runtime does not render V3 workspace-tab chrome. */
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
  brandMode?: BrandMode;
  brandMark?: ReactNode;
  brandMarkSize?: number;
  brandLogoOnly?: boolean;
  nav: NavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  workspaceNavigationPolicy?: WorkspaceNavigationPolicy;

  /** Retained only for source compatibility with V3-era callers. V2 ignores App Rail. */
  railNav?: NavItem[];
  activeRailKey?: string;
  onRailNavigate?: (key: string) => void;

  breadcrumbs?: Breadcrumb[];
  fullName?: string;
  userSubtitle?: string;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  allowBrandChange?: boolean;
  onOpenPalette?: () => void;
  onOpenAI?: () => void;
  aiConfigured?: boolean;
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
  onChangePassword?: () => void;
  onLogoutOtherSessions?: () => void;
  businessContext?: ReactNode;

  /** Retained only so V3-era source continues to typecheck; V2 does not render these. */
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
 * Runtime authority is V2 again. The V3-only props above remain as a compatibility seam so
 * newer source files can compile without making V3 chrome reachable in production.
 */
export function AppShell(props: AppShellProps) {
  return <V2AppShell {...props} />;
}
