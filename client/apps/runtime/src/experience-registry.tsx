import type { ReactNode } from "react";
import type { AppManifest } from "@metaforge/core";
import type { MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import type { WorkspaceNavigationPolicy } from "@metaforge/shell";
import type { NavigateFunction } from "react-router-dom";

/**
 * Generic runtime boundary.
 *
 * Forge no longer registers app/vertical-specific React workbenches in the shared runtime.
 * Application UI must be expressed by installed manifest/DocType/screen/action metadata and
 * rendered by generic runtime surfaces. Business formulas and compound writes remain server-owned.
 *
 * The resolver API is kept temporarily so main-base and downstream packages can migrate without
 * a flag day. Every resolver intentionally returns no app-owned override.
 */
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

export interface RuntimeDoctypeExperienceContext {
  manifest: AppManifest;
  boot: MetaForgeBootDTO;
  navigate: NavigateFunction;
  doctype: string;
  name?: string;
}

export interface RuntimeDoctypeExperienceResolution {
  activeKey: string;
  breadcrumbs: Array<{ label: string }>;
  content: ReactNode;
}

export function runtimeExperienceKind(key: string): string {
  const separator = key.indexOf(":");
  return separator < 0 ? key : key.slice(0, separator);
}

/**
 * Only canonical metadata-native experience kinds are supported by main-base directly
 * (`screen:*` and `action:*`). Shared runtime has no bespoke registry anymore.
 */
export function isRegisteredRuntimeExperience(_key: string): boolean {
  return false;
}

export function resolveRuntimeExperience(_context: RuntimeExperienceContext): RuntimeExperienceResolution | null {
  return null;
}

export function resolveRuntimeDoctypeExperience(_context: RuntimeDoctypeExperienceContext): RuntimeDoctypeExperienceResolution | null {
  return null;
}

export interface RuntimeAppChrome {
  mobileAppHref?: string;
  brandLogoOnly?: boolean;
  brandMarkSize?: number;
  workspaceNavigationPolicy?: WorkspaceNavigationPolicy;
}

/**
 * Chrome is manifest/design authority. No app id may change shared runtime chrome in TypeScript.
 */
export function resolveRuntimeAppChrome(_appId: string): RuntimeAppChrome {
  return {};
}
