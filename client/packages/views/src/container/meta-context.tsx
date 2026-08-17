/** @jsxImportSource react */
import { createContext, useContext } from "react";
import type { FormGuideMap } from "../form/FormGuide.js";
import { makeLocaleFormat, type BoundFormatters, type BusinessContextSelection, type BusinessContextPolicy, type FormProfileMap } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";

export interface MetaForgeContextValue {
  adapter: FrappeAdapter;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  scopeKey: string;
  /** Explicit app/product identity used only at runtime composition boundaries. */
  appId?: string;
  fmt: BoundFormatters;
  businessContext: BusinessContextSelection;
  contextPolicies?: Record<string, BusinessContextPolicy>;
  formProfiles?: FormProfileMap;
  formGuides?: FormGuideMap;
}

export const MetaForgeContext = createContext<MetaForgeContextValue | null>(null);

export function useMetaForge(): MetaForgeContextValue {
  const value = useContext(MetaForgeContext);
  if (!value) throw new Error("useMetaForge phải nằm trong <MetaForgeProvider>");
  return value;
}

export function useMetaForgeOptional(): MetaForgeContextValue | null {
  return useContext(MetaForgeContext);
}

const FALLBACK_FMT = makeLocaleFormat({});

export function useLocaleFormat(): BoundFormatters {
  return useMetaForgeOptional()?.fmt ?? FALLBACK_FMT;
}
