import { lazy, type ReactNode } from "react";
import type { AppManifest } from "@metaforge/core";
import type { MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { Button } from "@metaforge/ui";
import type { WorkspaceNavigationPolicy } from "@metaforge/shell";
import type { NavigateFunction } from "react-router-dom";

const CalendarContainer = lazy(() => import("@metaforge/views/calendar").then((module) => ({ default: module.CalendarContainer })));
const ApprovalInbox = lazy(() => import("./experiences/ApprovalInbox.js").then((module) => ({ default: module.ApprovalInbox })));
const SocialCommerce = lazy(() => import("./experiences/SocialCommerce.js").then((module) => ({ default: module.SocialCommerce })));
const DailyDetailedLedger = lazy(() => import("./experiences/DailyDetailedLedger.js").then((module) => ({ default: module.DailyDetailedLedger })));
const AlumdoorOperationsCenter = lazy(() => import("./experiences/AlumdoorOperationsCenter.js").then((module) => ({ default: module.AlumdoorOperationsCenter })));

export interface RuntimeExperienceContext {
  key: string;
  manifest: AppManifest;
  boot: MetaForgeBootDTO;
  navigate: NavigateFunction;
}

export interface RuntimeExperienceResolution {
  activeKey: string;
  breadcrumbs: Array<{ label: string }>;
  content: ReactNode;
}

type RuntimeExperienceFactory = (context: RuntimeExperienceContext, argument: string) => RuntimeExperienceResolution | null;

function declaredLabel(manifest: AppManifest, key: string, fallback: string): string {
  return manifest.nav.find((item) => item.key === key)?.label ?? fallback;
}

const runtimeExperienceFactories = new Map<string, RuntimeExperienceFactory>([
  ["approval", ({ key, manifest, navigate }, argument) => {
    if (!argument) return null;
    const label = declaredLabel(manifest, key, argument);
    return {
      activeKey: key,
      breadcrumbs: [{ label }],
      content: <ApprovalInbox doctype={argument} title={label} onExit={() => navigate(`/app/${encodeURIComponent(argument)}`)} />,
    };
  }],
  ["calendar", ({ key, manifest, navigate }, argument) => {
    if (!argument) return null;
    const label = declaredLabel(manifest, key, argument);
    return {
      activeKey: key,
      breadcrumbs: [{ label }],
      content: (
        <div className="min-h-[100dvh] bg-background p-3 md:p-4">
          <div className="mb-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/app/${encodeURIComponent(argument)}`)}>← Danh sách</Button>
            <h1 className="font-semibold">{label}</h1>
          </div>
          <CalendarContainer
            doctype={argument}
            initialMode="week"
            onEventClick={(row) => navigate(`/app/${encodeURIComponent(argument)}/${encodeURIComponent(String(row.name))}`)}
          />
        </div>
      ),
    };
  }],
  ["social-commerce", ({ key, manifest, boot }) => {
    const activeKey = manifest.nav.find((item) => item.key.startsWith("social-commerce:"))?.key ?? key;
    const label = declaredLabel(manifest, activeKey, "Trung tâm bán hàng");
    const canManageConnections = boot.user === "Administrator"
      || boot.roles.includes("Administrator")
      || boot.roles.includes("System Manager");
    return {
      activeKey,
      breadcrumbs: [{ label }],
      content: <SocialCommerce canManageConnections={canManageConnections} onAuthenticationRequired={() => window.location.assign("/login")} />,
    };
  }],
  ["daily-ledger", ({ key, manifest }) => ({
    activeKey: key,
    breadcrumbs: [{ label: declaredLabel(manifest, key, "Sổ chi tiết hằng ngày") }],
    content: <DailyDetailedLedger />,
  })],
  ["alumdoor-operations", ({ key, manifest }) => ({
    activeKey: key,
    breadcrumbs: [{ label: declaredLabel(manifest, key, "Bán hàng") }],
    content: <AlumdoorOperationsCenter />,
  })],
]);

export function runtimeExperienceKind(key: string): string {
  const separator = key.indexOf(":");
  return separator < 0 ? key : key.slice(0, separator);
}

export function isRegisteredRuntimeExperience(key: string): boolean {
  const separator = key.indexOf(":");
  if (separator < 1 || separator === key.length - 1) return false;
  return runtimeExperienceFactories.has(key.slice(0, separator));
}

export function resolveRuntimeExperience(context: RuntimeExperienceContext): RuntimeExperienceResolution | null {
  const separator = context.key.indexOf(":");
  if (separator < 1 || separator === context.key.length - 1) return null;
  const kind = context.key.slice(0, separator);
  const argument = context.key.slice(separator + 1);
  return runtimeExperienceFactories.get(kind)?.(context, argument) ?? null;
}

const ALUMDOOR_HR_WORKSPACE = "Nhân sự & Tiền lương";
const ALUMDOOR_HR_GROUP_BY_KEY: Record<string, string> = {
  Employee: ALUMDOOR_HR_WORKSPACE,
  "Employment Contract": ALUMDOOR_HR_WORKSPACE,
  "Leave Application": ALUMDOOR_HR_WORKSPACE,
  Attendance: ALUMDOOR_HR_WORKSPACE,
  "Employee Advance": ALUMDOOR_HR_WORKSPACE,
  "Additional Salary": ALUMDOOR_HR_WORKSPACE,
  "payroll-entry": ALUMDOOR_HR_WORKSPACE,
  "salary-slip": ALUMDOOR_HR_WORKSPACE,
  "Salary Bank Batch": ALUMDOOR_HR_WORKSPACE,
};

const ALUMDOOR_REPORT_WORKSPACES: Record<string, string[]> = {
  "report:Đơn hàng theo khách": ["Bán hàng"],
  "report:Báo giá theo khách": ["Bán hàng"],
  "report:Lắp đặt theo đội": ["Bán hàng"],
  "report:Mua hàng theo nhà cung cấp": ["Mua hàng"],
  "report:Đơn mua chưa nhận đủ": ["Mua hàng"],
  "report:Stock Balance": ["Kho"],
  "report:Stock Ledger": ["Kho"],
  "report:Lệnh sản xuất theo mặt hàng": ["Sản xuất"],
  "report:Work Order Progress": ["Sản xuất"],
  "report:Công nợ theo khách hàng": ["Công nợ"],
  "report:Accounts Receivable": ["Công nợ"],
  "report:Accounts Payable": ["Công nợ"],
  "report:hr-headcount-by-department": [ALUMDOOR_HR_WORKSPACE],
  "report:hr-personnel-document-expiry": [ALUMDOOR_HR_WORKSPACE],
  "report:hr-salary-bank-batch-register": [ALUMDOOR_HR_WORKSPACE],
};

const ALUMDOOR_MASTER_WORKSPACES: Record<string, string[]> = {
  Item: ["Bán hàng", "Kho", "Mua hàng", "Sản xuất", "Bảo hành"],
  "Item Group": ["Kho", "Sản xuất"],
  UOM: ["Kho", "Mua hàng", "Sản xuất"],
  Warehouse: ["Kho", "Mua hàng", "Sản xuất"],
  Customer: ["Bán hàng", "Công nợ", "Bảo hành"],
  Supplier: ["Mua hàng", "Công nợ", "Bảo hành"],
  "Price List": ["Bán hàng"],
  "Item Price": ["Bán hàng"],
  "Pricing Rule": ["Bán hàng"],
  "Cutting Policy": ["Sản xuất"],
  "Measurement Profile": ["Kho", "Sản xuất"],
  "Item Color": ["Kho", "Sản xuất"],
  "Material Grade": ["Kho", "Sản xuất"],
  "Material Specification": ["Kho", "Sản xuất"],
  "Item Attribute": ["Kho", "Sản xuất"],
  "Supplier Item": ["Mua hàng"],
  Brand: ["Bán hàng", "Mua hàng"],
  Manufacturer: ["Mua hàng"],
  "Lý do huỷ": ["Kho"],
  "Nguyên nhân chênh lệch": ["Kho"],
};

const alumdoorWorkspaceNavigationPolicy: WorkspaceNavigationPolicy = {
  allowedGroups: [
    "Điều hành", "Bán hàng", "Kho", "Mua hàng", "Sản xuất", "Công nợ", "Bảo hành",
    "Báo cáo", "Danh mục", "Hệ thống", "Quỹ kho", ALUMDOOR_HR_WORKSPACE,
  ],
  hiddenKeys: ["catalog"],
  groupByKey: ALUMDOOR_HR_GROUP_BY_KEY,
  reportAffinities: ALUMDOOR_REPORT_WORKSPACES,
  masterAffinities: ALUMDOOR_MASTER_WORKSPACES,
};

export interface RuntimeAppChrome {
  mobileAppHref?: string;
  brandLogoOnly?: boolean;
  brandMarkSize?: number;
  workspaceNavigationPolicy?: WorkspaceNavigationPolicy;
}

const appChrome = new Map<string, RuntimeAppChrome>([
  ["alumdoor", {
    mobileAppHref: "/mobile/warehouse/?tab=account",
    brandLogoOnly: true,
    brandMarkSize: 44,
    workspaceNavigationPolicy: alumdoorWorkspaceNavigationPolicy,
  }],
]);

export function resolveRuntimeAppChrome(appId: string): RuntimeAppChrome {
  return appChrome.get(appId) ?? {};
}
