/** @jsxImportSource react */
/**
 * MetaForgeProvider — cung cấp adapter + registry + services + roles cho container.
 * Bọc sẵn QueryClientProvider (cache §G). Bootstrap: gọi getBoot lấy roles.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FormGuideMap } from "../form/FormGuide.js";
import { makeLocaleFormat, type LocaleConfig, type BoundFormatters, type BusinessContextSelection, type BusinessContextPolicy, type FormProfileMap } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { ControlRegistry, type FieldServices } from "@metaforge/controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { adapterServices } from "./services.js";
import { NewFormContainer } from "./NewFormContainer.js";

export interface MetaForgeContextValue {
  adapter: FrappeAdapter;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  /** Khoá phạm vi cache (site|user|lang|version) — mọi queryKey prefix bằng key này để
   * KHÔNG rò meta/perm/translation giữa user/site/ngôn ngữ (P1-03). Đổi ⇒ cache tự tách. */
  scopeKey: string;
  /** Bộ formatter locale DUY NHẤT (từ boot sysdefaults) — Form/List/child/report/Builder dùng chung. */
  fmt: BoundFormatters;
  /** Context nghiệp vụ toàn cục áp trước mọi query/create/link. */
  businessContext: BusinessContextSelection;
  contextPolicies?: Record<string, BusinessContextPolicy>;
  /** Lọc field hiển thị trên Form theo từng doctype — DocType chuẩn ERPNext quá rộng cho app
   * chuyên biệt. Xem `applyFormProfile` (@metaforge/core) để biết các quy tắc an toàn. */
  formProfiles?: FormProfileMap;
  formGuides?: FormGuideMap;
}

const Ctx = createContext<MetaForgeContextValue | null>(null);

export function useMetaForge(): MetaForgeContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMetaForge phải nằm trong <MetaForgeProvider>");
  return v;
}

/**
 * Bản KHÔNG ném lỗi — cho những thứ TÔ ĐIỂM, có thì tốt, không có vẫn dùng được (vd hướng dẫn
 * nhập trong form).
 *
 * `useMetaForge` cố tình ném lỗi vì thiếu adapter/registry là hỏng thật, phải phát hiện ngay.
 * Nhưng dùng nó chỉ để lấy một thứ tuỳ chọn thì biến provider thành BẮT BUỘC cho cả màn hình:
 * FormView vốn dựng được độc lập (test, Storybook, app nhúng chỉ mượn một view) đã sập vì lý do
 * đó. Thứ tuỳ chọn phải hỏng theo kiểu tuỳ chọn.
 */
export function useMetaForgeOptional(): MetaForgeContextValue | null {
  return useContext(Ctx);
}

/** Bộ formatter locale dùng chung (number/currency/date/duration) — 1 nguồn từ boot sysdefaults. */
/**
 * Không có provider ⇒ định dạng theo mặc định của core thay vì sập màn hình.
 *
 * Cùng lý do với [[useMetaForgeOptional]]: định dạng số/ngày là chuyện TRÌNH BÀY. Bắt cả ReportView
 * phải nằm trong provider chỉ để lấy bộ định dạng là ràng buộc thừa — và đó chính là lỗi đã làm
 * selfcheck đỏ khi thêm định dạng số cho báo cáo.
 */
const FALLBACK_FMT = makeLocaleFormat({});

export function useLocaleFormat(): BoundFormatters {
  return useMetaForgeOptional()?.fmt ?? FALLBACK_FMT;
}

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
  const qc = useMemo(() => props.queryClient ?? new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }), [props.queryClient]);
  // locale key ổn định để memo fmt — đổi user/site/lang ⇒ locale prop đổi ⇒ fmt dựng lại (không stale).
  const localeKey = JSON.stringify(props.locale ?? null);

  // Quick-create (Link combobox "+ Tạo mới …", giống ERPNext) — 1 điểm duy nhất cho TOÀN app, tái
  // dùng NewFormContainer thật (validate/permission/default đầy đủ, KHÔNG tự bịa field). Dùng STACK
  // (không phải 1 slot) — form quick-create có thể tự chứa Link khác cũng cần "+ Tạo mới" (vd tạo
  // Warehouse Transfer thiếu Company → tạo Company ngay trong đó); 1 slot duy nhất sẽ bị GHI ĐÈ, làm
  // Promise của lần gọi trước bị treo vĩnh viễn (Link field gốc chờ mãi không bao giờ resolve).
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
      adapter: props.adapter,
      registry: props.registry,
      services: { ...adapterServices(props.adapter, props.businessContext, props.contextPolicies), quickCreate, fmt: makeLocaleFormat(props.locale ?? {}) },
      roles: props.roles ?? [],
      scopeKey: props.scopeKey ?? "mock",
      fmt: makeLocaleFormat(props.locale ?? {}),
      businessContext: props.businessContext ?? {},
      contextPolicies: props.contextPolicies,
      formProfiles: props.formProfiles,
      formGuides: props.formGuides,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.adapter, props.registry, props.roles, props.scopeKey, localeKey, JSON.stringify(props.businessContext ?? {}), props.contextPolicies, props.formProfiles, props.formGuides, quickCreate],
  );
  return (
    <QueryClientProvider client={qc}>
      <Ctx.Provider value={value}>
        {props.children}
        {/* Mỗi entry trong stack = 1 Dialog riêng, portal xếp chồng theo thứ tự mount (Radix hỗ trợ
            dialog lồng nhau natively) — đóng entry NÀO chỉ resolve/gỡ đúng entry đó, không đụng
            entry khác đang mở bên dưới. */}
        {quickCreateStack.map((entry) => (
          <Dialog key={entry.id} open onOpenChange={(open) => { if (!open) closeQuickCreate(entry.id, undefined); }}>
            {/* Bấm ra ngoài/Esc đóng được. Radix tự đóng ở đây là chấp nhận được vì form quick-create
                ngắn; mất vài ô vừa gõ đỡ khó chịu hơn là bị kẹt trong modal không thoát được. */}
            <DialogContent className="flex h-[min(85vh,760px)] w-[min(80vw,860px)] max-w-none flex-col overflow-hidden p-0">
              <DialogHeader className="shrink-0 border-b px-5 py-3">
                <DialogTitle>{t("form.create_title_prefix")} {entry.doctype}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <NewFormContainer
                  doctype={entry.doctype}
                  onCreated={(name) => closeQuickCreate(entry.id, name)}
                  onCancel={() => closeQuickCreate(entry.id, undefined)}
                />
              </div>
            </DialogContent>
          </Dialog>
        ))}
      </Ctx.Provider>
    </QueryClientProvider>
  );
}
