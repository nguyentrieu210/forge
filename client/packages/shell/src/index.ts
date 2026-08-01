/**
 * @metaforge/shell — AppShell/sidebar/topbar/BottomNav/CommandPalette/Theme/PWA.
 * Scaffold: khai báo shell region + theme mode. Component thật ở PHA 5.
 */
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import type { MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import type { ThemeMode } from "./theme.js";

export type ShellRegion = "sidebar" | "topbar" | "content" | "bottom-nav" | "command-palette";

export interface AppShellConfig {
  adapter: FrappeAdapter;
  boot: MetaForgeBootDTO;
  theme: ThemeMode;
}

export { AppShell, type AppShellProps, type NavItem, type Breadcrumb, type NotificationItem } from "./WorkspaceAppShell.js";
export { I18nProvider, useI18n, useT, useLocale, type Locale } from "./i18n/index.js";
export {
  CommandPalette, type CommandPaletteProps, type AwesomeAction, type AwesomeDoctype, type AwesomeRecord,
} from "./CommandPalette.js";
export {
  AIPanel, AIActionRegistry, type AIPanelProps, type AIProvider, type AIAction, type AIContext,
} from "./ai/AIPanel.js";
export {
  createOpenAICompatProvider, createEchoProvider, type AIConfig,
} from "./ai/provider.js";
export { useTheme, applyTheme, resolveTheme, type ThemeMode } from "./theme.js";
export {
  AuthBoundary, type AuthBoundaryProps, type AuthState, type AuthedContext,
} from "./auth/AuthBoundary.js";
export { LoginForm, type LoginFormProps } from "./auth/LoginForm.js";
export { ChangePasswordDialog, type ChangePasswordDialogProps } from "./auth/ChangePasswordDialog.js";
export { useBrand, applyBrand, isBrandMode, BRANDS, BRAND_COLOR_COUNT, type BrandMode } from "./brand.js";
export { applyDesign } from "./design.js";
export { resolveIcon } from "./icon.js";
export {
  BusinessContextProvider, BusinessContextBar, useBusinessContext,
  type BusinessContextProviderProps, type BusinessContextValue,
} from "./BusinessContext.js";
export {
  MobileShell, type MobileShellProps,
  TouchCard, BigButton, QtyStepper, ScanField,
  createExperienceRegistry, ExperienceRoute, type Experience, type ExperienceRegistry, type ExperienceRouteProps,
  useOfflineQueue, type OfflineQueueEntry, type UseOfflineQueueResult,
  usePinLock, PinPadScreen, type UsePinLockResult, type PinPadScreenProps,
} from "./app-mode/index.js";

export const SHELL_VERSION = "0.1.0";
