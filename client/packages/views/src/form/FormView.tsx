/** @jsxImportSource react */
/**
 * FormView — trung tâm runtime. Data-driven 100% từ meta:
 *   resolveMeta(theo VALUES watch → depends_on phản ứng) → groupLayout → render control.
 * State layer = **React Hook Form**; validate required = **Zod** (schema dựng từ ResolvedField).
 * Tôn trọng 6 trạng thái field (hidden/masked/locked/editable). 417 conflict → banner (KHÔNG ghi đè).
 * UI qua @metaforge/ui (header/tabs sticky, card sections). Logic KHÔNG đổi so với bản gốc.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch, Controller, type FieldValues } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, X } from "lucide-react";
import { resolveMeta, collectFetchFrom, type DocTypeMeta, type Doc, type ResolvedField } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import type { WorkflowTransition } from "@metaforge/adapter-frappe";
import { Button, Badge, toast, cn, useT } from "@metaforge/ui";
import { FormGuide } from "./FormGuide.js";
import { useMetaForgeOptional } from "../container/provider.js";
import { groupLayout, resolveFormFieldWidth, type FormFieldWidth, type FormTab } from "./layout.js";
import { WorkflowActionBar, FormActionBar } from "../detail/WorkflowActionBar.js";
import { DIRTY_GUARD_REASON, type FormActionKind, type FormPerms, type FormActionCtx } from "../detail/formActions.js";

export interface FormViewProps {
  meta: DocTypeMeta;
  doc: Doc;
  registry: ControlRegistry;
  services?: FieldServices;
  roles?: string[];
  maskedFields?: string[];
  forceReadOnly?: boolean;
  conflict?: boolean;
  onReload?: () => void;
  onSave?: (changed: Record<string, unknown>, all: Record<string, unknown>) => void;
  saving?: boolean;
  /** lỗi field-level từ server (mapError.fieldErrors) → gắn vào đúng control. */
  fieldErrors?: Record<string, string>;
  /** slot header phải bổ sung. */
  headerActions?: ReactNode;
  /**
   * Đóng form, quay về danh sách.
   *
   * Nút đặt TRONG header của form chứ không thả nổi tuyệt đối bên ngoài: header này `sticky z-20`
   * kèm nền mờ, nên mọi nút thả nổi ở góc phải trên đều bị nó ĐÈ LÊN — nút vẫn tồn tại trong DOM
   * nhưng không ai bấm được, và cũng không ai nhìn thấy để biết là có.
   */
  onClose?: () => void;
  /** Ẩn action mặc định khi shell cha cung cấp footer riêng (vd modal tạo mới). */
  hideDefaultActions?: boolean;
  /** Footer sticky nằm trong thẻ form; dùng cho Create modal ngang. */
  footerActions?: ReactNode;
  /** bản ghi mới (chưa lưu) → ẩn Submit/Delete… */
  isNew?: boolean;
  /** ẩn header tiêu đề/tab của FormView — dùng khi shell cha (vd modal Create) đã tự hiện tiêu đề riêng. */
  hideHeader?: boolean;
  /** báo cho cha biết form có đang dirty không (vd để quyết định có cần hỏi xác nhận trước khi đóng). */
  onDirtyChange?: (dirty: boolean) => void;
  /** quyền hiệu lực (docinfo.permissions ở Live). Mặc định mock = full. */
  perms?: FormPerms;
  /** transitions từ server get_transitions (nguồn sự thật nút workflow). */
  transitions?: WorkflowTransition[];
  /** ép có workflow (ẩn Submit/Cancel thủ công) kể cả khi transitions rỗng lúc load. */
  hasWorkflow?: boolean;
  onAction?: (kind: FormActionKind) => void;
  onWorkflowAction?: (action: string) => void;
}

/**
 * BỀ RỘNG CỦA MỘT Ô THUỘC VỀ CHÍNH FIELD ĐÓ — và chỉ được quyết ở đây.
 *
 * Bản trước có BA tầng cùng quyết một bề rộng: lưới cấp một khe tối thiểu 15rem, vỏ field
 * chặn `max-w` lần hai, rồi bản thân control chặn lần thứ ba bằng một con số khác. Kết quả
 * là ô 11rem nằm giữa khe 15rem, hở đều hai bên, và form trông vừa rộng vừa rời rạc —
 * không phải vì một con số nào sai, mà vì ba con số đúng-riêng-lẻ cãi nhau.
 *
 * Giờ dùng flex-wrap: mỗi field là một mục có `basis` theo KIỂU của nó, tự chảy và tự
 * xuống dòng. Không còn khe rỗng, vì không còn khe — chỉ có ô và khoảng cách giữa chúng.
 * Bốn ô đầu phiếu mua (NCC 17rem + ba ô ngắn 10rem) cộng lại vừa một hàng ở khung 1120px.
 */
/** Zod schema từ field required đang hiển thị (dynamic theo depends_on). */
function buildSchema(resolved: ResolvedField[], t: (k: string, f?: string) => string): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const rf of resolved) {
    if (rf.layout || !rf.visible) continue;
    if (rf.required) {
      shape[rf.field.fieldname] = z
        .any()
        .refine((v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0), { message: t("form.required") });
    }
  }
  return z.object(shape).passthrough();
}

export function FormView(props: FormViewProps) {
  const t = useT();
  const { meta, doc, registry, services, roles, maskedFields, forceReadOnly } = props;
  const form = useForm<FieldValues>({ defaultValues: { ...doc } });
  const formId = useId().replace(/:/g, "");
  const [activeTab, setActiveTab] = useState(0);
  const fetchRules = useMemo(() => collectFetchFrom(meta), [meta]);
  const prevLinks = useRef<Record<string, unknown>>({}); // giá trị link lần trước → phát hiện user đổi
  const fetchDocKey = useRef<string>(""); // doc đang đồng bộ → bỏ vòng fetch của lần (re)load (L1)

  // reset khi đổi document (name) hoặc tải lại (modified) — RHF tự lo dirty/back-to-initial.
  useEffect(() => {
    form.reset({ ...doc });
    // seed link đã-load ⇒ fetch_from KHÔNG kích hoạt lúc tải (chỉ user đổi link mới fetch).
    const seed: Record<string, unknown> = {};
    for (const r of fetchRules) seed[r.linkField] = doc[r.linkField];
    prevLinks.current = seed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.name, doc.modified]);

  // Lỗi field-level từ server (post-valid, sau khi client-zod đã qua) → gắn đúng control.
  useEffect(() => {
    if (!props.fieldErrors) return;
    for (const [fieldname, message] of Object.entries(props.fieldErrors)) {
      form.setError(fieldname, { type: "server", message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fieldErrors]);

  const isDirty = form.formState.isDirty;
  // Chống mất dữ liệu: cảnh báo khi rời trang (đóng tab/refresh/điều hướng ngoài) lúc form dirty.
  useEffect(() => {
    if (!isDirty || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const onDirtyChangeRef = useRef(props.onDirtyChange);
  onDirtyChangeRef.current = props.onDirtyChange;
  useEffect(() => { onDirtyChangeRef.current?.(isDirty); }, [isDirty]);

  /**
   * Chỉ đăng ký render lại FormView cho các field thật sự điều khiển metadata/link.
   *
   * Controller của từng ô đã tự theo dõi giá trị của chính nó. `form.watch()` không đối số ở
   * đây trước kia khiến GÕ MỘT KÝ TỰ dựng lại toàn bộ form và mọi ChildGrid. Với chứng từ
   * nhiều dòng, đây là nguyên nhân chính của độ trễ mà ERPNext/Frappe tránh bằng refresh cục bộ.
   */
  const reactiveFields = useMemo(() => {
    const names = new Set<string>(fetchRules.map((rule) => rule.linkField));
    const addExpression = (expression?: string) => {
      if (!expression) return;
      if (expression.startsWith("eval:")) {
        for (const match of expression.matchAll(/\bdoc\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) names.add(match[1]!);
      } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expression.trim())) {
        names.add(expression.trim());
      }
    };
    for (const field of meta.fields ?? []) {
      addExpression(field.depends_on);
      addExpression(field.mandatory_depends_on);
      addExpression(field.read_only_depends_on);
      if (field.fieldtype === "Dynamic Link" && field.options) names.add(field.options);
      if (typeof field.link_filters === "string") {
        for (const match of field.link_filters.matchAll(/\bdoc\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) names.add(match[1]!);
      }
    }
    return [...names];
  }, [meta, fetchRules]);
  const reactiveValues = useWatch({ control: form.control, name: reactiveFields });
  const values = useMemo(() => {
    const current = { ...form.getValues() };
    reactiveFields.forEach((fieldname, index) => {
      current[fieldname] = (reactiveValues as unknown[])[index];
    });
    return current;
  }, [form, reactiveFields, reactiveValues]);

  // Ctrl/Cmd+S = Lưu (chặn hộp thoại lưu trang mặc định của trình duyệt). Đọc isDirty/onValid MỚI
  // NHẤT qua ref — đăng ký listener 1 lần, không tái đăng ký mỗi phím gõ.
  const onValidRef = useRef<(vals: FieldValues) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (form.formState.isDirty) form.handleSubmit(onValidRef.current)();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form]);

  // P1-09 fetch_from: khi user đổi Link nguồn → nạp source_field của doc đích, điền field đích.
  // Link xoá → xoá field đích. Seed ở reset ⇒ KHÔNG chạy lúc tải. Bỏ kết quả nếu link đổi tiếp.
  useEffect(() => {
    if (!fetchRules.length) return;
    // L1: doc vừa (re)load → prevLinks đã seed ở reset effect; bỏ vòng này để KHÔNG fetch giả +
    // KHÔNG đánh dirty form vừa reset (values còn là bản cũ ở render đổi-doc).
    const docKey = `${doc.name ?? ""}|${doc.modified ?? ""}`;
    if (fetchDocKey.current !== docKey) { fetchDocKey.current = docKey; return; }
    const linkFields = new Set(fetchRules.map((r) => r.linkField));
    for (const lf of linkFields) {
      const cur = values[lf];
      if (prevLinks.current[lf] === cur) continue;
      prevLinks.current[lf] = cur;
      const rules = fetchRules.filter((r) => r.linkField === lf);
      if (cur == null || cur === "") {
        for (const r of rules) form.setValue(r.target, "", { shouldDirty: true });
        continue;
      }
      const sourceDoctype = rules.find((r) => r.sourceDoctype)?.sourceDoctype;
      if (!sourceDoctype) continue;
      // Một Link thường điền 3–5 ô đầu phiếu. Đọc trọn document MỘT lần thay vì gọi
      // get_value cho từng ô: nhanh hơn rõ rệt trên đường app → gateway → tenant.
      if (services?.fetchDocument) {
        void services.fetchDocument(sourceDoctype, String(cur))
          .then((source) => {
            if (prevLinks.current[lf] !== cur) return;
            for (const r of rules) form.setValue(r.target, (source[r.sourceField] ?? "") as never, { shouldDirty: true });
          })
          .catch(() => { /* fetch lỗi → giữ nguyên (không phá form) */ });
        continue;
      }
      if (!services?.fetchValue) continue;
      void Promise.all(rules.map(async (r) => ({ r, value: await services.fetchValue!(sourceDoctype, String(cur), r.sourceField) })))
        .then((resolvedRules) => {
          if (prevLinks.current[lf] !== cur) return;
          for (const { r, value } of resolvedRules) form.setValue(r.target, (value ?? "") as never, { shouldDirty: true });
        })
        .catch(() => { /* fetch lỗi → giữ nguyên (không phá form) */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, fetchRules, services, doc.name, doc.modified]);

  /**
   * Tổng chứng từ cộng lại NGAY khi gõ, không đợi lưu.
   *
   * ChildGrid đã tính `amount` từng dòng từ lâu, nhưng tổng ở đầu phiếu thì chỉ server mới
   * điền — nghĩa là suốt lúc nhập, ô "Tổng tiền hàng" đứng im ở con số của lần lưu trước
   * (hoặc trống với phiếu mới). Người nhập không có cách nào đối chiếu với phiếu giấy của
   * nhà cung cấp cho tới khi bấm lưu, mà lúc đó sai thì đã ghi sổ.
   *
   * Chỉ cộng, không diễn giải: thuế, chiết khấu, phí vẫn để server quyết. Đây là con số để
   * NHÌN; `calculateSalesTotals` phía server vẫn là con số để TIN.
   */
  const totalFields = useMemo(() => {
    const has = (name: string) => meta.fields.some((f) => f.fieldname === name);
    const table = meta.fields.find((f) => f.fieldtype === "Table" && f.fieldname === "items");
    if (!table) return null;
    return { table: table.fieldname, sumAmount: has("grand_total"), sumQty: has("total_qty") };
  }, [meta]);
  useEffect(() => {
    if (!totalFields) return;
    const updateTotals = (current: FieldValues) => {
      const rows = current[totalFields.table];
      if (!Array.isArray(rows)) return;
      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      if (totalFields.sumAmount) {
        const sum = round(rows.reduce((s, r) => s + (Number((r as Doc)?.amount) || 0), 0));
        if (Number(current.grand_total ?? 0) !== sum) form.setValue("grand_total", sum as never, { shouldDirty: false });
      }
      if (totalFields.sumQty) {
        const sum = round(rows.reduce((s, r) => s + (Number((r as Doc)?.qty) || 0), 0));
        if (Number(current.total_qty ?? 0) !== sum) form.setValue("total_qty", sum as never, { shouldDirty: false });
      }
    };
    updateTotals(form.getValues());
    const subscription = form.watch((next, info) => {
      if (!info.name || info.name === totalFields.table || info.name.startsWith(`${totalFields.table}.`)) {
        updateTotals(next as FieldValues);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, totalFields]);

  const resolved: ResolvedField[] = useMemo(
    () => resolveMeta(meta, { doc: values, roles, maskedFields, forceReadOnly }),
    [meta, values, roles, maskedFields, forceReadOnly],
  );
  const tabs: FormTab[] = useMemo(() => groupLayout(resolved), [resolved]);
  const activeIdx = Math.min(activeTab, tabs.length - 1);
  const tab = tabs[activeIdx] ?? tabs[0];
  const fieldDomId = (fieldname: string) => `mf-${formId}-${fieldname}`;
  const tabForField = (fieldname: string) => tabs.findIndex((candidate) => candidate.sections.some((section) => section.columns.some((column) => column.fields.some((item) => item.field.fieldname === fieldname))));
  const focusField = (fieldname: string) => {
    const nextTab = tabForField(fieldname);
    if (nextTab >= 0) setActiveTab(nextTab);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById(fieldDomId(fieldname))?.focus()));
  };
  const errorEntries = Object.entries(form.formState.errors).flatMap(([fieldname, error]) => {
    const message = typeof error?.message === "string" ? error.message : undefined;
    if (!message) return [];
    const field = resolved.find((item) => item.field.fieldname === fieldname)?.field;
    return [{ fieldname, label: field?.label ?? fieldname, message }];
  });
  const tabErrorCount = (candidate: FormTab) => candidate.sections.reduce((count, section) => count + section.columns.reduce((columnCount, column) => columnCount + column.fields.filter((item) => Boolean(form.formState.errors[item.field.fieldname])).length, 0), 0);
  useEffect(() => {
    const first = Object.keys(props.fieldErrors ?? {})[0];
    if (first) focusField(first);
    // Chỉ phản ứng khi server trả một bộ lỗi mới; focusField phụ thuộc layout hiện tại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fieldErrors]);
  // Hướng dẫn nhập do APP cấp qua provider (giống formProfiles) — engine không tự bịa nội dung
  // nghiệp vụ, vì cùng một DocType ở ngành khác lại cần lời dặn khác.
  // Không có provider (test / nhúng lẻ view) ⇒ chỉ là không có hướng dẫn, form vẫn dựng bình thường.
  const formGuides = useMetaForgeOptional()?.formGuides;

  const title = String((meta.title_field && doc[meta.title_field]) || doc.name || t("form.new"));

  const actionCtx: FormActionCtx = {
    docstatus: ((doc.docstatus ?? 0) as 0 | 1 | 2),
    isSubmittable: meta.is_submittable === 1,
    isNew: props.isNew ?? (!doc.name || doc.name === "new"),
    dirty: form.formState.isDirty,
    hasWorkflow: (props.transitions?.length ?? 0) > 0 || props.hasWorkflow === true,
    saving: props.saving,
    allowRename: meta.allow_rename === 1,
    perms: props.perms ?? { create: true, write: true, submit: true, cancel: true, delete: true, amend: true },
  };

  // P0-04: chốt chặn thứ 2 (ngoài disable UI) — thao tác đổi trạng thái KHÔNG chạy khi form dirty.
  const guardedAction = (k: FormActionKind) => {
    // In/nhân bản/xoá đều làm việc trên bản đã lưu ở server, không đổi trạng thái
    // của dữ liệu đang gõ dở. Chỉ các thao tác nghiệp vụ mới phải bị chặn.
    const allowedWhileDirty = k === "save" || k === "delete" || k === "print" || k === "duplicate";
    if (!allowedWhileDirty && form.formState.isDirty) { toast.error(t("form.dirty_guard", DIRTY_GUARD_REASON)); return; }
    props.onAction?.(k);
  };
  const guardedWorkflow = (a: string) => {
    if (form.formState.isDirty) { toast.error(t("form.dirty_guard", DIRTY_GUARD_REASON)); return; }
    props.onWorkflowAction?.(a);
  };

  const onValid = (vals: FieldValues) => {
    if (props.conflict) return; // conflict → chặn ghi
    const result = buildSchema(resolved, t).safeParse(vals);
    if (!result.success) {
      let firstField = "";
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key) {
          if (!firstField) firstField = key;
          form.setError(key, { message: issue.message });
        }
      }
      if (firstField) focusField(firstField);
      return;
    }
    const dirty = form.formState.dirtyFields;
    const changed: Record<string, unknown> = {};
    for (const k of Object.keys(dirty)) changed[k] = vals[k];
    props.onSave?.(changed, { ...vals, name: doc.name, modified: doc.modified });
  };
  onValidRef.current = onValid;

  return (
    <form className={cn("mf-form-view flex h-full flex-col overflow-hidden bg-card", props.isNew && "mf-form-create")} onSubmit={form.handleSubmit(onValid)}>
      {/* HEADER + TABS sticky — bỏ qua khi shell cha (vd modal Create) đã tự hiện tiêu đề riêng. */}
      {!props.hideHeader ? (
        <div className="mf-form-header sticky top-0 z-20 shrink-0 border-b bg-card/95 backdrop-blur">
          <div className="flex min-h-14 flex-wrap items-center gap-3 px-5 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-semibold">{title}</span>
                {actionCtx.dirty ? (
                  <span className="mf-dirty inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400" title={t("form.dirty_guard", DIRTY_GUARD_REASON)}>
                    <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />{t("form.unsaved")}
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">{meta.label ?? meta.name}</div>
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 max-sm:w-full">
              {props.headerActions}
              {!props.hideDefaultActions && props.transitions?.length ? (
                <WorkflowActionBar transitions={props.transitions} saving={props.saving} dirty={actionCtx.dirty} onAction={guardedWorkflow} />
              ) : null}
              {!props.hideDefaultActions ? <FormActionBar ctx={actionCtx} onAction={guardedAction} /> : null}
              {props.onClose ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={props.onClose}
                  aria-label={t("split.list")}
                  title={t("split.list")}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {tabs.length > 1 ? (
            <div role="tablist" aria-label={t("form.sections", "Các phần của biểu mẫu")} className="flex h-10 w-full justify-start overflow-x-auto rounded-none border-t bg-transparent px-3">
                {tabs.map((tb, i) => (
                  <Button
                    type="button"
                    key={i}
                    variant="ghost"
                    role="tab"
                    aria-selected={activeIdx === i}
                    onClick={() => setActiveTab(i)}
                    className={cn("h-10 shrink-0 rounded-none border-b-2 border-transparent px-3 text-sm", activeIdx === i && "border-primary text-foreground")}
                  >
                    <span>{tb.label || t("form.tab_general")}</span>
                    {tabErrorCount(tb) ? <Badge variant="destructive" className="ml-1 h-4 min-w-4 justify-center px-1 text-[10px]">{tabErrorCount(tb)}</Badge> : null}
                  </Button>
                ))}
            </div>
          ) : null}
        </div>
      ) : tabs.length > 1 ? (
        <div className="mf-form-header sticky top-0 z-20 shrink-0 border-b bg-card/95 backdrop-blur">
          <div role="tablist" aria-label={t("form.sections", "Các phần của biểu mẫu")} className="flex h-10 w-full justify-start overflow-x-auto rounded-none bg-transparent px-3">
              {tabs.map((tb, i) => (
                <Button
                  type="button"
                  key={i}
                  variant="ghost"
                  role="tab"
                  aria-selected={activeIdx === i}
                  onClick={() => setActiveTab(i)}
                  className={cn("h-10 shrink-0 rounded-none border-b-2 border-transparent px-3 text-sm", activeIdx === i && "border-primary text-foreground")}
                >
                  <span>{tb.label || t("form.tab_general")}</span>
                  {tabErrorCount(tb) ? <Badge variant="destructive" className="ml-1 h-4 min-w-4 justify-center px-1 text-[10px]">{tabErrorCount(tb)}</Badge> : null}
                </Button>
              ))}
          </div>
        </div>
      ) : null}

      {/* BODY scroll */}
      <div className="mf-form-body min-h-0 flex-1 overflow-auto">
        {errorEntries.length ? (
          <div className="m-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert" aria-label={t("form.validation_summary", "Các mục cần kiểm tra")}>
            <div className="font-semibold text-destructive">{t("form.validation_summary", "Các mục cần kiểm tra")} ({errorEntries.length})</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {errorEntries.map((entry) => <li key={entry.fieldname}><Button type="button" variant="link" className="h-auto p-0 text-left text-destructive underline" onClick={() => focusField(entry.fieldname)}>{entry.label}: {entry.message}</Button></li>)}
            </ul>
          </div>
        ) : null}
        {props.conflict ? (
          <div className="mf-conflict m-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              {t("form.conflict_message")}{" "}
              <Button variant="link" className="h-auto p-0 text-destructive underline" onClick={props.onReload} type="button">{t("form.conflict_reload")}</Button>{" "}
              {t("form.conflict_hint")}
            </div>
          </div>
        ) : null}

        {/* Form LẤP ĐẦY khung chứa — bề ngang do khung quyết định (modal 920px, cột giữa của split
            view ~580px), KHÔNG tự chặn thêm rồi canh giữa: làm vậy sinh hai dải trống hai bên trong
            modal. max-w chỉ còn là chặn an toàn cho màn siêu rộng (>1152px), bình thường không chạm. */}
        {/* 96rem chứ không phải 72rem: khung chứa đã rộng 1400px cho vừa bảng dòng hàng, mà
            trần cũ 1152px thì form dừng lại giữa chừng và chừa một mảng trắng bên phải —
            trần an toàn cho màn siêu rộng biến thành trần cho màn làm việc bình thường. */}
        <div className="mx-auto w-full max-w-[72rem] px-4 pb-6">
          {/* Hướng dẫn nhập cho chứng từ này — chỉ hiện ở TAB ĐẦU để không lặp lại ở mọi tab. */}
          {activeIdx === 0 ? <FormGuide doctype={meta.name} guide={formGuides?.[meta.name]} className="mb-1" /> : null}
          {tab?.sections.map((section, si) => {
            if (section.hidden) return null;
            const sectionFields = section.columns.flatMap((col) => col.fields);
            return (
              <section key={si} className="mf-form-section py-3">
                <div className="mf-section-heading mb-3 flex items-center gap-3">
                  <h3 className="shrink-0 text-[13px] font-semibold text-foreground">
                    {section.label || t("form.section_general", "Thông tin chung")}
                  </h3>
                  <span className="h-px min-w-8 flex-1 bg-border" aria-hidden="true" />
                </div>
                {/* gap-y-2.5 thay vì 4, gap-x-5 thay vì 6 — mật độ dày kiểu ERP, đọc được cả form
                    trong 1 màn thay vì phải cuộn. */}
                {/* MỘT lưới duy nhất cho cả section (không phải 2 khối dọc lồng nhau) — nhờ vậy
                    field bảng con/ô soạn thảo mới span được cả 2 cột, và hai cột tự canh hàng ngang
                    với nhau thay vì trôi lệch. */}
                {/* Flex-wrap, KHÔNG phải lưới: field tự chảy theo bề rộng của chính nó và tự
                    xuống dòng khi hết chỗ. Lưới cấp khe đều nhau nên ô ngắn nằm giữa khe rộng,
                    hở hai bên — đó là gốc của cảm giác "form quá rộng, kích cỡ không hợp lý". */}
                <div className="mf-form-grid grid items-start gap-x-3 gap-y-3">
                  {groupCheckFields(sectionFields).map((entry, groupIndex) =>
                    Array.isArray(entry) ? (
                      <div key={`checks-${groupIndex}`} className="mf-check-group">
                        {entry.map((rf) => (
                          <Field
                            key={rf.field.fieldname}
                            id={fieldDomId(rf.field.fieldname)}
                            rf={rf}
                            width="third"
                            form={form}
                            registry={registry}
                            services={services}
                            docName={String(doc.name)}
                            parentDoctype={meta.name}
                            roles={roles}
                            values={values}
                          />
                        ))}
                      </div>
                    ) : (
                      <Field
                        key={entry.field.fieldname}
                        id={fieldDomId(entry.field.fieldname)}
                        rf={entry}
                        width={resolveFormFieldWidth(entry.field, meta.title_field)}
                        form={form}
                        registry={registry}
                        services={services}
                        docName={String(doc.name)}
                        parentDoctype={meta.name}
                        roles={roles}
                        values={values}
                      />
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {props.footerActions ? <div className="mf-form-footer sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur">{props.footerActions}</div> : null}
    </form>
  );
}

/** Gom các checkbox LIỀN NHAU vào một hàng riêng để chúng không chen vào phần trống của hàng input. */
function groupCheckFields(fields: ResolvedField[]): Array<ResolvedField | ResolvedField[]> {
  const grouped: Array<ResolvedField | ResolvedField[]> = [];
  let checks: ResolvedField[] = [];
  const flush = () => {
    if (!checks.length) return;
    grouped.push(checks);
    checks = [];
  };
  for (const field of fields) {
    if (field.field.fieldtype === "Check") checks.push(field);
    else {
      flush();
      grouped.push(field);
    }
  }
  flush();
  return grouped;
}

interface FieldProps {
  id: string;
  rf: ResolvedField;
  width: FormFieldWidth;
  form: ReturnType<typeof useForm<FieldValues>>;
  registry: ControlRegistry;
  services?: FieldServices;
  docName: string;
  parentDoctype: string;
  roles?: string[];
  values: FieldValues;
}

function Field({ id, rf, width, form, registry, services, docName, parentDoctype, roles, values }: FieldProps) {
  const { field } = rf;
  // Bảng con có thể dùng `parent.foo` ở metadata của CHÍNH DocType con, điều mà FormView cha
  // không biết để đưa vào danh sách watch chọn lọc. Chỉ Field Table theo dõi toàn doc; các field
  // thường vẫn render cục bộ qua Controller nên không kéo cả form render lại mỗi phím gõ.
  const tableValues = useWatch({
    control: form.control,
    disabled: field.fieldtype !== "Table" && field.fieldtype !== "Table MultiSelect",
  }) as FieldValues;
  const controlValues = field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect"
    ? tableValues
    : values;
  if (rf.layout) {
    if (field.fieldtype === "Heading") return <h4 className="pt-1 text-sm font-semibold text-foreground">{field.label}</h4>;
    return null;
  }
  const Control = registry.resolve(field.fieldtype) ?? FallbackControl;
  const linkTarget = field.fieldtype === "Dynamic Link" ? (controlValues[field.options ?? ""] as string | undefined) : field.options;

  return (
    <Controller
      name={field.fieldname}
      control={form.control}
      render={({ field: f, fieldState }) => {
        // Check = ô tick: nhãn phải nằm NGAY BÊN PHẢI ô tick trên cùng một dòng (như ERPNext Desk).
        // Bố cục dọc dùng chung cho mọi field khiến ô tick 16px rơi xuống dưới nhãn + mô tả, trông
        // như một field bị lỗi và chiếm gấp 3 chiều cao cần thiết.
        const isCheck = field.fieldtype === "Check";
        const control = (
          <Control
            field={field}
            id={id}
            value={f.value}
            onChange={(v) => { f.onChange(v); if (fieldState.error) form.clearErrors(field.fieldname); }}
            readOnly={rf.readOnly}
            masked={rf.masked}
            error={fieldState.error?.message}
            describedBy={[descriptionId(field, id), fieldState.error ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined}
            required={rf.required}
            label={field.label ?? field.fieldname}
            services={services}
            docname={docName}
            linkTarget={linkTarget}
            parentDoctype={parentDoctype}
            docValues={controlValues}
            roles={roles}
          />
        );
        const label = (
          <>
            {field.label ?? field.fieldname}
            {rf.required ? <span className="mf-required ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
          </>
        );
        {/* field.description (Frappe help text) — ERPNext Desk luôn hiện dòng chú thích này. */}
        const description = typeof field.description === "string" && field.description
          ? <p id={`${id}-desc`} className="text-[11px] leading-snug text-muted-foreground">{field.description}</p>
          : null;
        const wrapper = cn(
          "mf-field",
          /**
           * `min-w-0` để ô co lại được trên màn hẹp — KHÔNG `grow`.
           *
           * `grow` cạnh `basis` là tự huỷ: basis thành sàn chứ không còn là bề rộng, mọi ô
           * giãn ra lấp đầy hàng, và ô "Mức độ" chứa hai chữ "Cần gấp" kéo dài bằng ô nhà
           * cung cấp. Đó đúng là "kích cỡ không hợp lý" và "dư khoảng trắng".
           */
          "min-w-0",
          isCheck && "mf-field-check",
          `mf-field-width-${width}`,
          rf.state && `mf-state-${rf.state}`,
          rf.readOnly && "mf-field-readonly",
          fieldState.error && "mf-field-error",
        );

        if (isCheck) {
          return (
            <div className={wrapper}>
              <div className="flex min-h-8 items-center gap-2">
                <div className="flex shrink-0 items-center">{control}</div>
                <div className="min-w-0 flex-1">
                  <label htmlFor={id} className="block cursor-pointer text-[13px] font-medium leading-5 text-foreground">{label}</label>
                  {description}
                </div>
              </div>
              {fieldState.error ? <span id={`${id}-error`} className="mt-1 block text-xs text-destructive" role="alert">{fieldState.error.message}</span> : null}
            </div>
          );
        }

        return (
          <div className={cn(wrapper, "flex flex-col gap-1")}>
            <label htmlFor={id} className="text-xs font-medium leading-tight text-muted-foreground">{label}</label>
            {description ? <div className="-mt-0.5">{description}</div> : null}
            {control}
            {fieldState.error ? <span id={`${id}-error`} className="text-xs text-destructive" role="alert">{fieldState.error.message}</span> : null}
          </div>
        );
      }}
    />
  );
}

function descriptionId(field: ResolvedField["field"], id: string): string | undefined {
  return typeof field.description === "string" && field.description ? `${id}-desc` : undefined;
}
