/** @jsxImportSource react */
/**
 * MetaForgeProvider — cung cấp adapter + registry + services + roles cho container.
 * Bọc sẵn QueryClientProvider (cache §G). Bootstrap: gọi getBoot lấy roles.
 */
import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FormGuideMap } from "../form/FormGuide.js";
import { makeLocaleFormat, type LocaleConfig, type BusinessContextSelection, type BusinessContextPolicy, type FormProfileMap } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { ControlRegistry } from "@metaforge/controls";
import { chromeFill, chromeText, cn, Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { adapterServices } from "./services.js";
import { withDocumentValidation } from "./document-validation.js";
import { MetaForgeContext, type MetaForgeContextValue } from "./meta-context.js";
export { useMetaForge, useMetaForgeOptional, useLocaleFormat } from "./meta-context.js";
export type { MetaForgeContextValue } from "./meta-context.js";
import { useMeta } from "./hooks.js";
import { V3_FULL_CREATE_DIALOG_CLASS } from "../data-surface/v3.js";
import { RuntimeLoadingState } from "../runtime/AsyncState.js";

const LazyNewFormContainer = lazy(async () => {
  const module = await import("./NewFormContainer.js");
  return { default: module.NewFormContainer };
});

export interface MetaForgeProviderProps {
  adapter: FrappeAdapter;
  registry: ControlRegistry;
  roles?: string[];
  /** site|user|lang|version — nếu bỏ, dùng "mock" (app demo mock KHÔNG cần tách cache). */
  scopeKey?: string;
  /** cấu hình locale từ boot sysdefaults (number_format/currency/date_format/precision). */
  locale?: LocaleConfig;
  businessContext?: BusinessContextSelection;
  contextPolicies?: Record<string, BusinessContextPolicy>;
  /** Field nào hiện trên Form của từng doctype (ẩn bớt field thừa của DocType chuẩn). */
  formProfiles?: FormProfileMap;
  formGuides?: FormGuideMap;
  queryClient?: QueryClient;
  children: ReactNode;
}

export function MetaForgeProvider(props: MetaForgeProviderProps) {
  const t = useT();
  const qc = useMemo(
    () => props.queryClient ?? new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 2 * 60_000,
          gcTime: 30 * 60_000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    }),
    [props.queryClient],
  );
  // One adapter boundary for every mutation. The decorator is a no-op unless metadata explicitly
  // declares a validationMethod, so existing DocTypes retain their current server validation path.
  const runtimeAdapter = useMemo(() => withDocumentValidation(props.adapter), [props.adapter]);
  const localeKey = JSON.stringify(props.locale ?? null);

  // Quick-create (Link combobox "+ Tạo mới …", giống ERPNext) — 1 điểm duy nhất cho TOÀN app, tái
  // dùng NewFormContainer thật (validate/permission/default đầy đủ, KHÔNG tự bịa field). Dùng STACK
  // để nested quick-create không làm treo Promise của form cha.
  const quickCreateSeq = useRef(0);
  const [quickCreateStack, setQuickCreateStack] = useState<Array<{ id: number; doctype: string; resolve: (name?: string) => void }>>([]);
  const quickCreate = useCallback(
    (doctype: string) => new Promise<string | undefined>((resolve) => {
      const id = ++quickCreateSeq.current;
      setQuickCreateStack((s) => [...s, { id, doctype, resolve }]);
    }),
    [],
  );
  const closeQuickCreate = useCallback((id: number, name?: string) => {
    setQuickCreateStack((s) => {
      s.find((e) => e.id === id)?.resolve(name);
      return s.filter((e) => e.id !== id);
    });
  }, []);

  const value = useMemo<MetaForgeContextValue>(
    () => ({
      adapter: runtimeAdapter,
      registry: props.registry,
      services: { ...adapterServices(runtimeAdapter, props.businessContext, props.contextPolicies), quickCreate, fmt: makeLocaleFormat(props.locale ?? {}) },
      roles: props.roles ?? [],
      scopeKey: props.scopeKey ?? "mock",
      fmt: makeLocaleFormat(props.locale ?? {}),
      businessContext: props.businessContext ?? {},
      contextPolicies: props.contextPolicies,
      formProfiles: props.formProfiles,
      formGuides: props.formGuides,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtimeAdapter, props.registry, props.roles, props.scopeKey, localeKey, JSON.stringify(props.businessContext ?? {}), props.contextPolicies, props.formProfiles, props.formGuides, quickCreate],
  );
  return (
    <QueryClientProvider client={qc}>
      <MetaForgeContext.Provider value={value}>
        {props.children}
        {quickCreateStack.map((entry) => (
          <QuickCreateDialog
            key={entry.id}
            doctype={entry.doctype}
            onDone={(name) => closeQuickCreate(entry.id, name)}
          />
        ))}
      </MetaForgeContext.Provider>
    </QueryClientProvider>
  );
}

/** One level in the nested quick-create stack. */
function QuickCreateDialog({ doctype, onDone }: { doctype: string; onDone: (name?: string) => void }) {
  const t = useT();
  const meta = useMeta(doctype);
  const hasChildTable = useMemo(
    () => (meta.data?.fields ?? []).some((field) => field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect"),
    [meta.data],
  );
  const title = meta.data?.label ?? doctype;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDone(undefined); }}>
      <DialogContent
        className={hasChildTable ? V3_FULL_CREATE_DIALOG_CLASS : "flex h-[min(85vh,760px)] w-[min(80vw,860px)] max-w-none flex-col overflow-hidden p-0"}
        data-surface={hasChildTable ? "full-create" : "quick-entry"}
        data-quick-create-depth="nested"
      >
        <DialogHeader className={cn("shrink-0 border-b px-5 py-3", chromeFill, chromeText)}>
          <DialogTitle>{t("form.create_title_prefix")} {title.toLocaleLowerCase("vi")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <Suspense fallback={<RuntimeLoadingState className="h-full" label={t("common.loading")} />}>
            <LazyNewFormContainer
              doctype={doctype}
              fullWidth={hasChildTable}
              presentation={hasChildTable ? "page" : "dialog"}
              onCreated={(name) => onDone(name)}
              onCancel={() => onDone(undefined)}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
