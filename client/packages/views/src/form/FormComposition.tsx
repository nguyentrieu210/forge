/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, BarChart3, LoaderCircle, Sparkles } from "lucide-react";
import { evalDependsOn, type DocField, type DocTypeMeta, type ResolvedField } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { cn } from "@metaforge/ui";

export type CompositionTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";
export type CompositionFormat = "text" | "number" | "currency" | "percent" | "date" | "datetime";

export interface FormCompositionStatItem {
  field: string;
  label?: string;
  format?: CompositionFormat;
  emphasis?: "normal" | "strong" | "grand";
}

export interface FormCompositionProjectionItem {
  path: string;
  label: string;
  format?: CompositionFormat;
  tone?: CompositionTone;
}

export interface FormCompositionProjection {
  method: string;
  watch: string[];
  inputs: Record<string, string>;
  constants?: Record<string, unknown>;
  items: FormCompositionProjectionItem[];
  debounceMs?: number;
}

interface FormCompositionBlockBase {
  key: string;
  span: number;
  title?: string;
  description?: string;
  tone?: CompositionTone;
  when?: string;
}

export interface FormCompositionFieldsBlock extends FormCompositionBlockBase {
  type: "fields";
  fields: string[];
  fieldSpans?: Record<string, number>;
}

export interface FormCompositionStatsBlock extends FormCompositionBlockBase {
  type: "stats";
  items: FormCompositionStatItem[];
}

export interface FormCompositionAlertBlock extends FormCompositionBlockBase {
  type: "alert";
  field: string;
  label?: string;
}

export interface FormCompositionProjectionBlock extends FormCompositionBlockBase {
  type: "projection";
  projection: FormCompositionProjection;
}

export type FormCompositionBlock =
  | FormCompositionFieldsBlock
  | FormCompositionStatsBlock
  | FormCompositionAlertBlock
  | FormCompositionProjectionBlock;

export interface FormCompositionPolicy {
  columns: 12;
  blocks: FormCompositionBlock[];
}

const BLOCK_TYPES = new Set(["fields", "stats", "alert", "projection"]);
const TONES = new Set<CompositionTone>(["neutral", "brand", "info", "success", "warning", "danger"]);
const FORMATS = new Set<CompositionFormat>(["text", "number", "currency", "percent", "date", "datetime"]);
const SPAN_CLASS: Record<number, string> = {
  1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4",
  5: "lg:col-span-5", 6: "lg:col-span-6", 7: "lg:col-span-7", 8: "lg:col-span-8",
  9: "lg:col-span-9", 10: "lg:col-span-10", 11: "lg:col-span-11", 12: "lg:col-span-12",
};
const FIELD_SPAN_CLASS: Record<number, string> = {
  1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4",
  5: "md:col-span-5", 6: "md:col-span-6", 7: "md:col-span-7", 8: "md:col-span-8",
  9: "md:col-span-9", 10: "md:col-span-10", 11: "md:col-span-11", 12: "md:col-span-12",
};

function obj(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}
function span(value: unknown, fallback = 12): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : fallback;
}
function tone(value: unknown): CompositionTone | undefined {
  return typeof value === "string" && TONES.has(value as CompositionTone) ? value as CompositionTone : undefined;
}
function format(value: unknown): CompositionFormat | undefined {
  return typeof value === "string" && FORMATS.has(value as CompositionFormat) ? value as CompositionFormat : undefined;
}

/** Client guard only. Canonical authoring validation lives on the server parser. */
export function resolveFormComposition(raw: unknown, meta: DocTypeMeta): FormCompositionPolicy | undefined {
  const source = obj(raw);
  if (!source || !Array.isArray(source.blocks) || !source.blocks.length) return undefined;
  const known = new Set((meta.fields ?? []).map((field) => field.fieldname));
  const seen = new Set<string>();
  const blocks: FormCompositionBlock[] = [];
  for (const entry of source.blocks) {
    const block = obj(entry);
    if (!block || typeof block.key !== "string" || !block.key.trim() || seen.has(block.key)) continue;
    if (typeof block.type !== "string" || !BLOCK_TYPES.has(block.type)) continue;
    const base = {
      key: block.key.trim(),
      span: span(block.span),
      ...(typeof block.title === "string" && block.title.trim() ? { title: block.title.trim() } : {}),
      ...(typeof block.description === "string" && block.description.trim() ? { description: block.description.trim() } : {}),
      ...(tone(block.tone) ? { tone: tone(block.tone) } : {}),
      ...(typeof block.when === "string" && block.when.trim() ? { when: block.when.trim() } : {}),
    };
    if (block.type === "fields") {
      const fields = stringArray(block.fields).filter((field) => known.has(field));
      if (!fields.length) continue;
      const spansRaw = obj(block.fieldSpans);
      const fieldSpans: Record<string, number> = {};
      for (const field of fields) if (spansRaw?.[field] !== undefined) fieldSpans[field] = span(spansRaw[field]);
      blocks.push({ ...base, type: "fields", fields, ...(Object.keys(fieldSpans).length ? { fieldSpans } : {}) });
    } else if (block.type === "stats") {
      if (!Array.isArray(block.items)) continue;
      const items = block.items.flatMap((rawItem) => {
        const item = obj(rawItem);
        if (!item || typeof item.field !== "string" || !known.has(item.field)) return [];
        return [{
          field: item.field,
          ...(typeof item.label === "string" ? { label: item.label } : {}),
          ...(format(item.format) ? { format: format(item.format) } : {}),
          ...(item.emphasis === "strong" || item.emphasis === "grand" ? { emphasis: item.emphasis } : {}),
        } satisfies FormCompositionStatItem];
      });
      if (items.length) blocks.push({ ...base, type: "stats", items });
    } else if (block.type === "alert") {
      if (typeof block.field === "string" && known.has(block.field)) blocks.push({ ...base, type: "alert", field: block.field, ...(typeof block.label === "string" ? { label: block.label } : {}) });
    } else {
      const projection = obj(block.projection);
      if (!projection || typeof projection.method !== "string" || !projection.method.trim()) continue;
      const inputsRaw = obj(projection.inputs) ?? {};
      const inputs: Record<string, string> = {};
      for (const [key, binding] of Object.entries(inputsRaw)) if (typeof binding === "string" && binding.startsWith("parent.")) inputs[key] = binding;
      const items = Array.isArray(projection.items) ? projection.items.flatMap((rawItem) => {
        const item = obj(rawItem);
        if (!item || typeof item.path !== "string" || !item.path.trim() || typeof item.label !== "string" || !item.label.trim()) return [];
        return [{ path: item.path.trim(), label: item.label.trim(), ...(format(item.format) ? { format: format(item.format) } : {}), ...(tone(item.tone) ? { tone: tone(item.tone) } : {}) } satisfies FormCompositionProjectionItem];
      }) : [];
      if (!items.length) continue;
      blocks.push({ ...base, type: "projection", projection: {
        method: projection.method.trim(),
        watch: stringArray(projection.watch),
        inputs,
        ...(obj(projection.constants) ? { constants: obj(projection.constants) } : {}),
        items,
        ...(typeof projection.debounceMs === "number" ? { debounceMs: Math.max(0, Math.min(5000, Math.round(projection.debounceMs))) } : {}),
      } });
    }
    seen.add(block.key);
  }
  return blocks.length ? { columns: 12, blocks } : undefined;
}

function readPath(source: unknown, path: string): unknown {
  let current = source;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatValue(field: DocField | undefined, value: unknown, explicit?: CompositionFormat): string {
  if (value == null || value === "") return "—";
  const kind = explicit ?? (field?.fieldtype === "Currency" ? "currency" : field?.fieldtype === "Percent" ? "percent" : ["Float", "Int"].includes(field?.fieldtype ?? "") ? "number" : field?.fieldtype === "Date" ? "date" : field?.fieldtype === "Datetime" ? "datetime" : "text");
  if (kind === "currency" || kind === "number" || kind === "percent") {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    const result = number.toLocaleString("vi-VN", { maximumFractionDigits: kind === "currency" ? 2 : 3 });
    return kind === "percent" ? `${result}%` : result;
  }
  if (kind === "date" || kind === "datetime") {
    const date = new Date(String(value).replace(" ", "T"));
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("vi-VN", kind === "date" ? { day: "2-digit", month: "2-digit", year: "numeric" } : { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return String(value);
}

function toneClass(value: CompositionTone | undefined): string {
  if (value === "brand") return "border-primary/20 bg-primary/[0.045]";
  if (value === "info") return "border-blue-500/20 bg-blue-500/[0.055]";
  if (value === "success") return "border-emerald-500/20 bg-emerald-500/[0.055]";
  if (value === "warning") return "border-amber-500/25 bg-amber-500/[0.07]";
  if (value === "danger") return "border-destructive/25 bg-destructive/[0.055]";
  return "border-border/75 bg-card";
}

function ProjectionBlock({ block, values, services }: { block: FormCompositionProjectionBlock; values: Record<string, unknown>; services?: FieldServices }) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const watchKey = block.projection.watch.map((field) => String(values[field] ?? "")).join("\u0001");
  useEffect(() => {
    if (!services?.callPost) return;
    const args: Record<string, unknown> = { ...(block.projection.constants ?? {}) };
    for (const [key, binding] of Object.entries(block.projection.inputs)) {
      const field = binding.slice("parent.".length);
      args[key] = values[field];
    }
    const current = ++version.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void services.callPost!(block.projection.method, args).then((result) => {
        if (version.current === current) setData(result);
      }).catch((reason) => {
        if (version.current === current) setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu");
      }).finally(() => {
        if (version.current === current) setLoading(false);
      });
    }, block.projection.debounceMs ?? 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey, services, block.projection.method]);

  return <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
    {block.projection.items.map((item) => (
      <div key={item.path} className={cn("rounded-lg border px-3 py-2.5", toneClass(item.tone))}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{item.label}</div>
        <div className="mt-1 min-h-6 text-lg font-semibold tabular-nums">{loading && data == null ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : formatValue(undefined, readPath(data, item.path), item.format)}</div>
      </div>
    ))}
    {error ? <div className="col-span-full flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"><AlertCircle className="size-3.5" />{error}</div> : null}
  </div>;
}

export interface FormCompositionProps {
  policy: FormCompositionPolicy;
  resolved: ResolvedField[];
  values: Record<string, unknown>;
  services?: FieldServices;
  renderField: (field: ResolvedField, span: number) => ReactNode;
}

export function FormComposition({ policy, resolved, values, services, renderField }: FormCompositionProps) {
  const byName = useMemo(() => new Map(resolved.map((entry) => [entry.field.fieldname, entry])), [resolved]);
  const placed = new Set(policy.blocks.flatMap((block) => block.type === "fields" ? block.fields : []));
  const unplaced = resolved.filter((entry) => entry.visible && !entry.layout && !placed.has(entry.field.fieldname));
  const visibleBlocks = policy.blocks.filter((block) => evalDependsOn(block.when, values));
  return <div className="mf-form-composition grid grid-cols-1 gap-3 lg:grid-cols-12" data-composition-columns="12">
    {visibleBlocks.map((block) => (
      <section key={block.key} className={cn("min-w-0 rounded-xl border p-3 shadow-sm", SPAN_CLASS[block.span] ?? SPAN_CLASS[12], toneClass(block.tone))} data-composition-block={block.type}>
        {(block.title || block.description) ? <div className="mb-3 flex items-start gap-2">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border bg-background/80 text-muted-foreground">{block.type === "stats" ? <BarChart3 className="size-3.5" /> : block.type === "projection" ? <Sparkles className="size-3.5" /> : <span className="size-1.5 rounded-full bg-primary" />}</span>
          <div className="min-w-0"><h3 className="text-[13px] font-semibold">{block.title}</h3>{block.description ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{block.description}</p> : null}</div>
        </div> : null}
        {block.type === "fields" ? <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-12">{block.fields.map((name) => {
          const field = byName.get(name);
          if (!field?.visible) return null;
          const fieldSpan = block.fieldSpans?.[name] ?? (field.field.fieldtype === "Table" || field.field.fieldtype === "Table MultiSelect" ? 12 : 6);
          return <div key={name} className={FIELD_SPAN_CLASS[fieldSpan] ?? FIELD_SPAN_CLASS[6]}>{renderField(field, fieldSpan)}</div>;
        })}</div> : null}
        {block.type === "stats" ? <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{block.items.map((item) => {
          const field = byName.get(item.field)?.field;
          const grand = item.emphasis === "grand";
          return <div key={item.field} className={cn("rounded-lg border bg-background/75 px-3 py-2.5", grand && "border-primary/25 bg-primary/[0.06]")}><div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{item.label ?? field?.label ?? item.field}</div><div className={cn("mt-1 font-semibold tabular-nums", grand ? "text-xl" : "text-lg")}>{formatValue(field, values[item.field], item.format)}</div></div>;
        })}</div> : null}
        {block.type === "alert" ? <div className="flex items-start gap-2 rounded-lg border border-current/10 bg-background/55 px-3 py-2.5 text-sm"><AlertCircle className="mt-0.5 size-4 shrink-0" /><div><div className="font-medium">{block.label ?? byName.get(block.field)?.field.label ?? block.title ?? "Lưu ý"}</div><div className="mt-0.5 text-xs text-muted-foreground">{formatValue(byName.get(block.field)?.field, values[block.field])}</div></div></div> : null}
        {block.type === "projection" ? <ProjectionBlock block={block} values={values} services={services} /> : null}
      </section>
    ))}
    {unplaced.length ? <section className="min-w-0 rounded-xl border border-dashed bg-muted/15 p-3 lg:col-span-12" data-composition-fallback><div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Thông tin khác</div><div className="grid grid-cols-1 items-start gap-3 md:grid-cols-12">{unplaced.map((field) => <div key={field.field.fieldname} className={FIELD_SPAN_CLASS[field.field.fieldtype === "Table" || field.field.fieldtype === "Table MultiSelect" ? 12 : 6]}>{renderField(field, field.field.fieldtype === "Table" || field.field.fieldtype === "Table MultiSelect" ? 12 : 6)}</div>)}</div></section> : null}
  </div>;
}
