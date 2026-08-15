/** @jsxImportSource react */
import { Settings2 } from "lucide-react";
import { AppShell as WorkspaceAppShell } from "./WorkspaceAppShell.js";
import type { AppShellProps, NavItem } from "./AppShell.js";

/**
 * Reserved platform navigation that is independent from any installed app manifest.
 *
 * App manifests own business navigation. The setup center is different: it exists so a
 * freshly installed app is not stranded on a tenant with no Company/UOM/Warehouse/Account.
 * Keeping this single system entry at the shell boundary makes it available to current and
 * future apps without copying one nav row into every package.
 *
 * Presence of the permission-center pseudo item is the runtime's existing permission-aware
 * signal for Administrator/System Manager. The server still enforces create permission on
 * every canonical DocType written by the setup center.
 */
const PLATFORM_SETUP_KEY = "__erp_setup";

export function AppShell(props: AppShellProps) {
  const canAdminister = props.nav.some((item) => item.key === "__permissions");
  const alreadyPresent = props.nav.some((item) => item.key === PLATFORM_SETUP_KEY);
  const setupItem: NavItem = {
    key: PLATFORM_SETUP_KEY,
    label: "Thiết lập doanh nghiệp",
    group: "Hệ thống",
    icon: <Settings2 className="size-4" />,
    keywords: ["setup", "company", "công ty", "đơn vị tính", "kho", "tài khoản"],
  };
  const nav = canAdminister && !alreadyPresent ? [...props.nav, setupItem] : props.nav;
  return <WorkspaceAppShell
    {...props}
    nav={nav}
    activeKey={window.location.pathname === "/erp/setup" ? PLATFORM_SETUP_KEY : props.activeKey}
    onNavigate={(key) => {
      if (key === PLATFORM_SETUP_KEY) {
        window.location.assign("/erp/setup");
        return;
      }
      props.onNavigate(key);
    }}
  />;
}

export type { AppShellProps, NavItem };
