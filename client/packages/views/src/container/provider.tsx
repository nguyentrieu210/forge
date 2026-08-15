/** @jsxImportSource react */
/**
 * MetaForgeProvider — cung cấp adapter + registry + services + roles cho container.
 * Bọc sẵn QueryClientProvider (cache §G). Bootstrap: gọi getBoot lấy roles.
 */
import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FormGuideMap } from "../form/FormGuide.js";
import { makeLocaleFormat, type LocaleConfig, type BoundFormatters, type BusinessContextSelection, type BusinessContextPolicy, type FormProfileMap } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { ControlRegistry, type FieldServices } from "@metaforge/controls";
import { chromeFill, chromeText, cn, Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { adapterServices } from "./services.js";
import { useMeta } from "./hooks.js";
import { V3_FULL_CREATE_DIALOG_CLASS } from "../data-surface/v3.js";

const LazyNewFormContainer = lazy(async () => {
  const module = await import("./NewFormContainer.js");
  return { default: module.NewFormContainer };
});

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
          <QuickCreateDialog
            key={entry.id}
            doctype={entry.doctype}
            onDone={(name) => closeQuickCreate(entry.id, name)}
          />
        ))}
      </Ctx.Provider>
    </QueryClientProvider>
  );
}

/**
 * Một tầng trong chồng "＋ Tạo mới".
 *
 * Xếp chồng chứ không thay thế: form cha — kể cả khi đang chiếm trọn màn hình — vẫn nằm nguyên
 * bên dưới với mọi thứ đã gõ dở. Người nhập thiếu một Khách hàng giữa chừng thì tạo tại chỗ rồi
 * quay lại đúng ô đang đứng, không phải thoát ra, mất đơn đang nhập, rồi vào lại từ đầu.
 *
 * Kích cỡ theo đúng luật của màn tạo mới: chứng từ có bảng con thì chiếm trọn màn hình, không thì
 * hộp thoại gọn. Tra `useMeta` ở đây thay vì để nơi gọi truyền vào, vì nơi gọi là một ô Link chỉ
 * biết TÊN doctype đích chứ không biết nó có bảng con hay không.
 */
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
      {/* Bấm ra ngoài/Esc đóng được. Radix tự đóng ở đây là chấp nhận được vì form quick-create
          ngắn; mất vài ô vừa gõ đỡ khó chịu hơn là bị kẹt trong modal không thoát được. */}
      <DialogContent
        className={hasChildTable ? V3_FULL_CREATE_DIALOG_CLASS : "flex h-[min(85vh,760px)] w-[min(80vw,860px)] max-w-none flex-col overflow-hidden p-0"}
        data-surface={hasChildTable ? "full-create" : "quick-entry"}
        data-quick-create-depth="nested"
      >
        {/* Cùng `chromeFill`/`chromeText` với header của form tạo mới ở tầng ngoài — hộp tạo lồng
            (vd tạo Khách hàng ngay trong đơn) mang đúng mảng navy/đỏ/than chì đặc như hộp tạo cha. */}
        <DialogHeader className={cn("shrink-0 border-b px-5 py-3", chromeFill, chromeText)}>
          <DialogTitle>{t("form.create_title_prefix")} {title.toLocaleLowerCase("vi")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>}>
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
