/** @jsxImportSource react */
/**
 * FormView — central runtime form renderer. Ordinary forms stay compact; an explicit
 * `viewPolicy.operational.form` upgrades the same renderer into a full operational workspace.
 * Business calculations are still server/app-owned — this file only renders declared semantics.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch, Controller, type FieldValues } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, X } from "lucide-react";
import {
  collectFetchFrom,
  collectMetadataReactiveFields,
  fetchRuleAllowsCurrentValue,
  operationalViewPolicy,
  resolveFetchSourceDoctype,
  resolveMeta,
  shouldApplyAutomaticValue,
  validateFieldValue,
  type Doc,
  type DocField,
  type DocTypeMeta,
  type FetchFromRule,
  type FieldValidationIssue,
  type OperationalFormPolicy,
  type ResolvedField,
} from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import type { WorkflowTransition } from "@metaforge/adapter-frappe";
import { Button, Badge, toast, cn, useT } from "@metaforge/ui";
import { FormGuide } from "./FormGuide.js";
import { FormComposition, resolveFormComposition } from "./FormComposition.js";
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
  onSave?: (changed: Record<string, unknown>, all: Record<string, unknown>) => boolean | void | Promise<boolean | void>;
  saving?: boolean;
  fieldErrors?: Record<string, string>;
  headerActions?: ReactNode;
  onClose?: () => void;
  hideDefaultActions?: boolean;
  footerActions?: ReactNode;
  isNew?: boolean;
  hideHeader?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  perms?: FormPerms;
  transitions?: WorkflowTransition[];
  hasWorkflow?: boolean;
  onAction?: (kind: FormActionKind) => void;
  onWorkflowAction?: (action: string) => void;
}

function validationMessage(issue: FieldValidationIssue, t: (k: string, f?: string) => string): string {
  switch (issue.code) {
    case "required": return t("form.required");
    case "not_nullable": return t("form.not_nullable", "Không được để trống");
    case "too_long": return issue.limit
      ? t("form.max_length", `Tối đa ${issue.limit} ký tự`)
      : t("form.invalid_string", "Phải là chuỗi ký tự");
    case "invalid_select": return t("form.invalid_select", "Giá trị không nằm trong danh sách cho phép");
    case "integer": return t("form.invalid_integer", "Phải là số nguyên");
    case "duration": return t("form.invalid_duration", "Phải là số giây nguyên không âm");
    case "rating": return t("form.invalid_rating", "Phải là số từ 0 đến 1");
    case "phone": return t("form.invalid_phone", "Số điện thoại không hợp lệ");
    case "color": return t("form.invalid_color", "Màu phải có dạng #rrggbb");
    case "geolocation": return t("form.invalid_geolocation", "Vị trí phải là dữ liệu GeoJSON hợp lệ");
    case "numeric": return t("form.invalid_number", "Phải là số");
    case "check": return t("form.invalid_check", "Phải là giá trị Có/Không");
    case "date": return t("form.invalid_date", "Ngày phải có dạng YYYY-MM-DD");
    case "datetime": return t("form.invalid_datetime", "Ngày giờ không hợp lệ");
    case "time": return t("form.invalid_time", "Giờ phải có dạng HH:MM hoặc HH:MM:SS");
    case "json": return t("form.invalid_json", "Phải là dữ liệu JSON hợp lệ");
    case "table": return t("form.invalid_table", "Phải là một bảng dữ liệu");
    case "table_limit": return t("form.table_limit", `Tối đa ${issue.limit ?? 1000} dòng`);
    case "table_row": return t("form.invalid_table_row", `Dòng ${issue.row ?? "?"} không hợp lệ`);
    case "negative": return t("form.non_negative", "Không được là số âm");
    default: return t("form.invalid_value", "Giá trị không hợp lệ");
  }
}

function buildSchema(resolved: ResolvedField[], t: (k: string, f?: string) => string): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const rf of resolved) {
    if (rf.layout || !rf.visible) continue;
    shape[rf.field.fieldname] = z.any().superRefine((value, ctx) => {
      const issue = validateFieldValue(rf.field, value, rf.required);
      if (!issue) return;
      ctx.addIssue({ code: "custom", message: validationMessage(issue, t) });
    });
  }
  return z.object(shape).passthrough();
}

function operationalWatchFields(policy: OperationalFormPolicy | undefined): string[] {
  if (!policy) return [];
  return [...new Set([
    ...(policy.header?.keyFields ?? []),
    ...(policy.header?.statusField ? [policy.header.statusField] : []),
    ...(policy.summary?.items ?? []).map((item) => item.field),
  ])];
}

function formatOperationalValue(field: DocField | undefined, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field?.fieldtype === "Check") return value === true || value === 1 || value === "1" ? "Có" : "Không";
  if (["Currency", "Float", "Int", "Percent"].includes(field?.fieldtype ?? "")) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      const formatted = number.toLocaleString("vi-VN", { maximumFractionDigits: field?.fieldtype === "Currency" ? 0 : 3 });
      return field?.fieldtype === "Percent" ? `${formatted}%` : formatted;
    }
  }
  if (Array.isArray(value)) return `${value.length} dòng`;
  return String(value);
}

function fetchIdentity(rule: FetchFromRule, doc: Record<string, unknown>, value: unknown): string {
  return `${resolveFetchSourceDoctype(rule, doc) ?? ""}\u0000${String(value ?? "")}`;
}

export function FormView(props: FormViewProps) {
  const t = useT();
  const { meta, doc, registry, services, roles, maskedFields, forceReadOnly } = props;
  const form = useForm<FieldValues>({ defaultValues: { ...doc } });
  const formId = useId().replace(/:/g, "");
  const [activeTab, setActiveTab] = useState(0);
  const operational = useMemo(() => operationalViewPolicy(meta), [meta]);
  const formPolicy = operational?.form;
  const composition = useMemo(() => resolveFormComposition(formPolicy?.composition, meta), [formPolicy?.composition, meta]);
  const isWorkspace = formPolicy?.presentation === "workspace";
  const compositionActive = isWorkspace && Boolean(composition);
  const compactWorkspace = isWorkspace && formPolicy?.density === "compact";
  const brandHeader = isWorkspace && formPolicy?.header?.tone === "brand";
  const fetchRules = useMemo(() => collectFetchFrom(meta), [meta]);
  const fieldByName = useMemo(() => new Map((meta.fields ?? []).map((field) => [field.fieldname, field])), [meta]);
  const prevLinks = useRef<Record<string, string>>({});
  const fetchDocKey = useRef<string>("");
  const lastAutoValues = useRef<Record<string, unknown>>({});
  const isNewDocument = props.isNew ?? (!doc.name || doc.name === "new");

  useEffect(() => {
    form.reset({ ...doc });
    const seed: Record<string, string> = {};
    if (!isNewDocument) {
      for (const rule of fetchRules) seed[rule.linkField] = fetchIdentity(rule, doc, doc[rule.linkField]);
    }
    prevLinks.current = seed;
    lastAutoValues.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.name, doc.modified, isNewDocument]);

  useEffect(() => {
    if (!props.fieldErrors) return;
    for (const [fieldname, message] of Object.entries(props.fieldErrors)) {
      form.setError(fieldname, { type: "server", message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fieldErrors]);

  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (!isDirty || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const onDirtyChangeRef = useRef(props.onDirtyChange);
  onDirtyChangeRef.current = props.onDirtyChange;
  useEffect(() => { onDirtyChangeRef.current?.(isDirty); }, [isDirty]);

  const reactiveFields = useMemo(() => [...new Set([
    ...collectMetadataReactiveFields(meta),
    ...operationalWatchFields(formPolicy),
    ...(compositionActive ? (meta.fields ?? []).filter((field) => !["Section Break", "Column Break", "Tab Break", "Heading", "HTML", "Fold", "Button"].includes(field.fieldtype)).map((field) => field.fieldname) : []),
  ])], [meta, formPolicy, compositionActive]);
  const reactiveValues = useWatch({ control: form.control, name: reactiveFields });
  const values = useMemo(() => {
    const current = { ...form.getValues() };
    reactiveFields.forEach((fieldname, index) => {
      current[fieldname] = (reactiveValues as unknown[])[index];
    });
    return current;
  }, [form, reactiveFields, reactiveValues]);

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

  const setAutomaticTarget = (rule: FetchFromRule, value: unknown) => {
    const field = fieldByName.get(rule.target);
    if (!field) return;
    const current = form.getValues(rule.target);
    const ownsAuto = Object.prototype.hasOwnProperty.call(lastAutoValues.current, rule.target);
    const stillMatchesAuto = ownsAuto && Object.is(current, lastAutoValues.current[rule.target]);
    const provenance = stillMatchesAuto
      ? "auto"
      : (ownsAuto || form.getFieldState(rule.target).isDirty ? "user" : "initial");
    if (!fetchRuleAllowsCurrentValue(rule, current) && !stillMatchesAuto) return;
    if (!shouldApplyAutomaticValue(field, current, provenance)) {
      if (provenance === "user") delete lastAutoValues.current[rule.target];
      return;
    }
    form.setValue(rule.target, (value ?? "") as never, { shouldDirty: true });
    lastAutoValues.current[rule.target] = value ?? "";
  };

  useEffect(() => {
    if (!fetchRules.length) return;
    const docKey = `${doc.name ?? ""}|${doc.modified ?? ""}`;
    if (fetchDocKey.current !== docKey) {
      fetchDocKey.current = docKey;
      if (!isNewDocument) return;
    }
    const linkFields = new Set(fetchRules.map((rule) => rule.linkField));
    for (const linkField of linkFields) {
      const currentLink = values[linkField];
      const rules = fetchRules.filter((rule) => rule.linkField === linkField);
      const identity = fetchIdentity(rules[0]!, values, currentLink);
      if (prevLinks.current[linkField] === identity) continue;
      prevLinks.current[linkField] = identity;

      for (const rule of rules) if (!rule.fetchIfEmpty) setAutomaticTarget(rule, "");
      if (currentLink == null || currentLink === "") continue;

      const sourceDoctype = resolveFetchSourceDoctype(rules[0]!, values);
      if (!sourceDoctype) continue;
      if (services?.fetchDocument) {
        void services.fetchDocument(sourceDoctype, String(currentLink))
          .then((source) => {
            if (prevLinks.current[linkField] !== identity) return;
            for (const rule of rules) setAutomaticTarget(rule, source[rule.sourceField] ?? "");
          })
          .catch(() => {});
        continue;
      }
      if (!services?.fetchValue) continue;
      void Promise.all(rules.map(async (rule) => ({ rule, value: await services.fetchValue!(sourceDoctype, String(currentLink), rule.sourceField) })))
        .then((resolvedRules) => {
          if (prevLinks.current[linkField] !== identity) return;
          for (const { rule, value } of resolvedRules) setAutomaticTarget(rule, value ?? "");
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, fetchRules, services, doc.name, doc.modified, fieldByName, isNewDocument]);

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
    if (!compositionActive) {
      const nextTab = tabForField(fieldname);
      if (nextTab >= 0) setActiveTab(nextTab);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fieldErrors]);
  const formGuides = useMetaForgeOptional()?.formGuides;

  const title = String((meta.title_field && values[meta.title_field]) || doc.name || t("form.new"));
  const statusField = formPolicy?.header?.statusField;
  const statusValue = statusField ? values[statusField] : undefined;
  const keyFields = (formPolicy?.header?.keyFields ?? [])
    .map((name) => fieldByName.get(name))
    .filter((field): field is DocField => Boolean(field));
  const summaryItems = formPolicy?.summary?.enabled === false ? [] : (formPolicy?.summary?.items ?? []);

  const actionCtx: FormActionCtx = {
    docstatus: ((doc.docstatus ?? 0) as 0 | 1 | 2),
    isSubmittable: meta.is_submittable === 1,
    isNew: isNewDocument,
    dirty: form.formState.isDirty,
    hasWorkflow: (props.transitions?.length ?? 0) > 0 || props.hasWorkflow === true,
    saving: props.saving,
    allowRename: meta.allow_rename === 1,
    perms: props.perms ?? { create: true, write: true, submit: true, cancel: true, delete: true, amend: true },
  };

  const guardedAction = (k: FormActionKind) => {
    const allowedWhileDirty = k === "save" || k === "delete" || k === "print" || k === "duplicate";
    if (!allowedWhileDirty && form.formState.isDirty) { toast.error(t("form.dirty_guard", DIRTY_GUARD_REASON)); return; }
    props.onAction?.(k);
  };
  const guardedWorkflow = (a: string) => {
    if (form.formState.isDirty) { toast.error(t("form.dirty_guard", DIRTY_GUARD_REASON)); return; }
    props.onWorkflowAction?.(a);
  };

  const onValid = async (vals: FieldValues) => {
    if (props.conflict) return;
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
    if (!props.onSave) return;
    const saved = await props.onSave(changed, { ...vals, name: doc.name, modified: doc.modified });
    if (saved === true) {
      form.reset({ ...vals, name: doc.name, modified: doc.modified });
    }
  };
  onValidRef.current = onValid;

  const headerClass = cn(
    "mf-form-header sticky top-0 z-20 shrink-0 border-b backdrop-blur",
    brandHeader
      ? "border-orange-600/60 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-sm"
      : "bg-card/95",
  );
  const tabButtonClass = (selected: boolean) => cn(
    "h-10 shrink-0 rounded-none border-b-2 border-transparent px-3 text-sm",
    selected && (brandHeader ? "border-white text-white" : "border-primary text-foreground"),
    brandHeader && !selected && "text-white/80 hover:bg-white/10 hover:text-white",
  );

  return (
    <form
      className={cn(
        "mf-form-view flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card",
        props.isNew && "mf-form-create",
        isWorkspace && "mf-form-workspace bg-background",
        compactWorkspace && "mf-form-workspace-compact",
        compositionActive && "mf-form-composed",
      )}
      data-form-presentation={formPolicy?.presentation ?? "default"}
      data-form-composition={compositionActive ? "v1" : undefined}
      onSubmit={form.handleSubmit(onValid)}
    >
      {!props.hideHeader ? (
        <div className={headerClass}>
          <div className={cn("flex flex-wrap items-center gap-3", isWorkspace ? "min-h-16 px-4 py-2.5 md:px-5" : "min-h-14 px-5 py-2")}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("truncate font-semibold", isWorkspace ? "text-xl" : "text-lg")}>{title}</span>
                {statusValue != null && statusValue !== "" ? (
                  <Badge className={cn(brandHeader && "border-white/30 bg-white/15 text-white hover:bg-white/20")}>{String(statusValue)}</Badge>
                ) : null}
                {actionCtx.dirty ? (
                  <span className={cn(
                    "mf-dirty inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    brandHeader ? "bg-white/15 text-white" : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )} title={t("form.dirty_guard", DIRTY_GUARD_REASON)}>
                    <span className={cn("size-1.5 rounded-full", brandHeader ? "bg-white" : "bg-amber-500")} aria-hidden="true" />{t("form.unsaved")}
                  </span>
                ) : null}
              </div>
              <div className={cn("truncate text-xs", brandHeader ? "text-white/75" : "text-muted-foreground")}>{meta.label ?? meta.name}</div>
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 max-sm:w-full">
              {props.headerActions}
              {!props.hideDefaultActions && props.transitions?.length ? (
                <WorkflowActionBar transitions={props.transitions} saving={props.saving} dirty={actionCtx.dirty} onAction={guardedWorkflow} />
              ) : null}
              {!props.hideDefaultActions ? <FormActionBar ctx={actionCtx} onAction={guardedAction} /> : null}
              {props.onClose ? (
                <Button type="button" variant="ghost" size="icon-sm" className={cn(brandHeader && "text-white hover:bg-white/15 hover:text-white")} onClick={props.onClose} aria-label={t("split.list")} title={t("split.list")}>
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {isWorkspace && keyFields.length ? (
            <div className={cn("flex min-h-10 flex-wrap items-center gap-x-5 gap-y-1 border-t px-4 py-2 md:px-5", brandHeader ? "border-white/20 bg-black/5" : "bg-muted/20") }>
              {keyFields.map((field) => (
                <div key={field.fieldname} className="flex min-w-0 items-baseline gap-1.5 text-xs">
                  <span className={cn("font-medium", brandHeader ? "text-white/70" : "text-muted-foreground")}>{field.label ?? field.fieldname}:</span>
                  <span className={cn("max-w-64 truncate font-semibold", brandHeader ? "text-white" : "text-foreground")}>{formatOperationalValue(field, values[field.fieldname])}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!compositionActive && tabs.length > 1 ? (
            <div role="tablist" aria-label={t("form.sections", "Các phần của biểu mẫu")} className={cn("flex h-10 w-full justify-start overflow-x-auto rounded-none border-t bg-transparent px-3", brandHeader && "border-white/20")}>
              {tabs.map((tb, i) => (
                <Button type="button" key={i} variant="ghost" role="tab" aria-selected={activeIdx === i} onClick={() => setActiveTab(i)} className={tabButtonClass(activeIdx === i)}>
                  <span>{tb.label || t("form.tab_general")}</span>
                  {tabErrorCount(tb) ? <Badge variant="destructive" className="ml-1 h-4 min-w-4 justify-center px-1 text-[10px]">{tabErrorCount(tb)}</Badge> : null}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : !compositionActive && tabs.length > 1 ? (
        <div className="mf-form-header sticky top-0 z-20 shrink-0 border-b bg-card/95 backdrop-blur">
          <div role="tablist" aria-label={t("form.sections", "Các phần của biểu mẫu")} className="flex h-10 w-full justify-start overflow-x-auto rounded-none bg-transparent px-3">
            {tabs.map((tb, i) => (
              <Button type="button" key={i} variant="ghost" role="tab" aria-selected={activeIdx === i} onClick={() => setActiveTab(i)} className={tabButtonClass(activeIdx === i)}>
                <span>{tb.label || t("form.tab_general")}</span>
                {tabErrorCount(tb) ? <Badge variant="destructive" className="ml-1 h-4 min-w-4 justify-center px-1 text-[10px]">{tabErrorCount(tb)}</Badge> : null}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

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
              {t("form.conflict_message")} {" "}
              <Button variant="link" className="h-auto p-0 text-destructive underline" onClick={props.onReload} type="button">{t("form.conflict_reload")}</Button>{" "}
              {t("form.conflict_hint")}
            </div>
          </div>
        ) : null}

        <div className={cn(
          "w-full pb-6",
          isWorkspace || formPolicy?.fullWidth ? "max-w-none px-2 md:px-3" : "mx-auto max-w-[72rem] px-4",
        )}>
          {activeIdx === 0 ? <FormGuide doctype={meta.name} guide={formGuides?.[meta.name]} className="mb-1" /> : null}
          {compositionActive && composition ? (
            <FormComposition
              policy={composition}
              resolved={resolved}
              values={values}
              services={services}
              renderField={(entry) => (
                <Field
                  key={entry.field.fieldname}
                  id={fieldDomId(entry.field.fieldname)}
                  rf={entry}
                  width="full"
                  form={form}
                  registry={registry}
                  services={services}
                  docName={String(doc.name)}
                  parentDoctype={meta.name}
                  roles={roles}
                  values={values}
                />
              )}
            />
          ) : tab?.sections.map((section, si) => {
            if (section.hidden) return null;
            const sectionFields = section.columns.flatMap((col) => col.fields);
            return (
              <section key={si} className={cn("mf-form-section", compactWorkspace ? "py-2" : "py-3")}>
                <div className={cn("mf-section-heading flex items-center gap-3", compactWorkspace ? "mb-2" : "mb-3")}>
                  <h3 className="shrink-0 text-[13px] font-semibold text-foreground">{section.label || t("form.section_general", "Thông tin chung")}</h3>
                  <span className="h-px min-w-8 flex-1 bg-border/50" aria-hidden="true" />
                </div>
                <div className={cn("mf-form-grid grid items-start", compactWorkspace ? "gap-x-2 gap-y-2" : "gap-x-3 gap-y-3")}>
                  {groupCheckFields(sectionFields).map((entry, groupIndex) =>
                    Array.isArray(entry) ? (
                      <div key={`checks-${groupIndex}`} className="mf-check-group">
                        {entry.map((rf) => (
                          <Field key={rf.field.fieldname} id={fieldDomId(rf.field.fieldname)} rf={rf} width="third" form={form} registry={registry} services={services} docName={String(doc.name)} parentDoctype={meta.name} roles={roles} values={values} />
                        ))}
                      </div>
                    ) : (
                      <Field key={entry.field.fieldname} id={fieldDomId(entry.field.fieldname)} rf={entry} width={resolveFormFieldWidth(entry.field, meta.title_field)} form={form} registry={registry} services={services} docName={String(doc.name)} parentDoctype={meta.name} roles={roles} values={values} />
                    ),
                  )}
                </div>
              </section>
            );
          })}

          {isWorkspace && summaryItems.length ? (
            <div className="flex justify-end border-t py-3">
              <div className="w-full max-w-md overflow-hidden rounded-lg border bg-card shadow-sm" data-operational-summary>
                {summaryItems.map((item, index) => {
                  const field = fieldByName.get(item.field);
                  const grand = item.emphasis === "grand";
                  return (
                    <div key={`${item.field}-${index}`} className={cn(
                      "flex items-center justify-between gap-4 border-b px-4 py-2 last:border-b-0",
                      item.emphasis === "strong" && "font-semibold",
                      grand && "bg-orange-500/10 py-3 text-base font-bold",
                    )}>
                      <span className={cn("text-sm", grand ? "text-foreground" : "text-muted-foreground")}>{item.label ?? field?.label ?? item.field}</span>
                      <span className="tabular-nums">{formatOperationalValue(field, values[item.field])}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {props.footerActions ? <div className={cn("mf-form-footer sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3 backdrop-blur", isWorkspace ? "bg-background/95 shadow-[0_-8px_24px_-18px_rgba(0,0,0,.45)]" : "bg-card/95")}>{props.footerActions}</div> : null}
    </form>
  );
}

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
        const description = typeof field.description === "string" && field.description
          ? <p id={`${id}-desc`} className="text-[11px] leading-snug text-muted-foreground">{field.description}</p>
          : null;
        const wrapper = cn(
          "mf-field",
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
