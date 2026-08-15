import { readFile, writeFile } from "node:fs/promises";

const dir = "client/packages/views/src";
const providerPath = `${dir}/container/provider.tsx`;
const contextPath = `${dir}/container/meta-context.tsx`;
const hooksPath = `${dir}/container/hooks.ts`;
const newFormPath = `${dir}/container/NewFormContainer.tsx`;
const formViewPath = `${dir}/form/FormView.tsx`;

let provider = await readFile(providerPath, "utf8");
let hooks = await readFile(hooksPath, "utf8");
let newForm = await readFile(newFormPath, "utf8");
let formView = await readFile(formViewPath, "utf8");

const blockStart = provider.indexOf("export interface MetaForgeContextValue {");
const blockEnd = provider.indexOf("export interface MetaForgeProviderProps {");
if (blockStart < 0 || blockEnd < 0 || blockEnd <= blockStart) {
  throw new Error("MetaForge context block not found in provider.tsx");
}

const contextModule = `/** @jsxImportSource react */\nimport { createContext, useContext } from "react";\nimport type { FormGuideMap } from "../form/FormGuide.js";\nimport { makeLocaleFormat, type BoundFormatters, type BusinessContextSelection, type BusinessContextPolicy, type FormProfileMap } from "@metaforge/core";\nimport type { FrappeAdapter } from "@metaforge/adapter-frappe";\nimport type { ControlRegistry, FieldServices } from "@metaforge/controls";\n\nexport interface MetaForgeContextValue {\n  adapter: FrappeAdapter;\n  registry: ControlRegistry;\n  services: FieldServices;\n  roles: string[];\n  scopeKey: string;\n  fmt: BoundFormatters;\n  businessContext: BusinessContextSelection;\n  contextPolicies?: Record<string, BusinessContextPolicy>;\n  formProfiles?: FormProfileMap;\n  formGuides?: FormGuideMap;\n}\n\nexport const MetaForgeContext = createContext<MetaForgeContextValue | null>(null);\n\nexport function useMetaForge(): MetaForgeContextValue {\n  const value = useContext(MetaForgeContext);\n  if (!value) throw new Error("useMetaForge phải nằm trong <MetaForgeProvider>");\n  return value;\n}\n\nexport function useMetaForgeOptional(): MetaForgeContextValue | null {\n  return useContext(MetaForgeContext);\n}\n\nconst FALLBACK_FMT = makeLocaleFormat({});\n\nexport function useLocaleFormat(): BoundFormatters {\n  return useMetaForgeOptional()?.fmt ?? FALLBACK_FMT;\n}\n`;

provider = provider.slice(0, blockStart) + provider.slice(blockEnd);
provider = provider.replace(
  'import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";',
  'import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from "react";',
);
provider = provider.replace(
  'import { makeLocaleFormat, type LocaleConfig, type BoundFormatters, type BusinessContextSelection, type BusinessContextPolicy, type FormProfileMap } from "@metaforge/core";',
  'import { makeLocaleFormat, type LocaleConfig, type BusinessContextSelection, type BusinessContextPolicy, type FormProfileMap } from "@metaforge/core";',
);
provider = provider.replace(
  'import { ControlRegistry, type FieldServices } from "@metaforge/controls";',
  'import { ControlRegistry } from "@metaforge/controls";',
);
const importAnchor = 'import { adapterServices } from "./services.js";';
if (!provider.includes(importAnchor)) throw new Error("provider services import anchor missing");
provider = provider.replace(
  importAnchor,
  `${importAnchor}\nimport { MetaForgeContext, type MetaForgeContextValue } from "./meta-context.js";\nexport { useMetaForge, useMetaForgeOptional, useLocaleFormat } from "./meta-context.js";\nexport type { MetaForgeContextValue } from "./meta-context.js";`,
);
if (!provider.includes("<Ctx.Provider")) throw new Error("provider Ctx.Provider usage missing");
provider = provider.replaceAll("<Ctx.Provider", "<MetaForgeContext.Provider");
provider = provider.replaceAll("</Ctx.Provider>", "</MetaForgeContext.Provider>");

const replacements = [
  [hooksPath, hooks, 'from "./provider.js"', 'from "./meta-context.js"'],
  [newFormPath, newForm, 'from "./provider.js"', 'from "./meta-context.js"'],
  [formViewPath, formView, 'from "../container/provider.js"', 'from "../container/meta-context.js"'],
];

for (const [path, source, before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`expected provider import missing in ${path}`);
  const next = source.replaceAll(before, after);
  await writeFile(path, next, "utf8");
}

await writeFile(contextPath, contextModule, "utf8");
await writeFile(providerPath, provider, "utf8");
