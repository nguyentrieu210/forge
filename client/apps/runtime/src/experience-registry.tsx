import { lazy, type ReactNode } from "react";
import type { AppManifest } from "@metaforge/core";
import type { MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { Button } from "@metaforge/ui";
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

const appChrome = new Map<string, { mobileAppHref?: string }>([
  ["alumdoor", { mobileAppHref: "/mobile/warehouse/?tab=account" }],
]);

export function resolveRuntimeAppChrome(appId: string): { mobileAppHref?: string } {
  return appChrome.get(appId) ?? {};
}
