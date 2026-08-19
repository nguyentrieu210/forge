/** @jsxImportSource react */
import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { buildLinkFilters, linkDisplay } from "@metaforge/core";
import {
  ControlRegistry,
  PricingRuleConditionsControl,
  SalesOptionConditionsControl,
  TextAreaControl as LegacyTextAreaControl,
  type FieldControlProps,
} from "@metaforge/controls";
import {
  Button, Command, CommandEmpty, CommandItem, CommandList, Input, Popover, PopoverContent,
  PopoverTrigger, Textarea, cn, useT,
} from "@metaforge/ui";

const INITIAL_LINK_PAGE = 20;
const LINK_PAGE_STEP = 20;
const MAX_LINK_PAGE = 100;

function controlId(props: FieldControlProps, suffix = ""): string {
  return props.id ?? `mf-${props.field.fieldname}${suffix}`;
}

function MaskedControl() {
  const t = useT();
  return <span className="inline-flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground" aria-label={t("control.masked_label")}>••••••</span>;
}

/**
 * Real Autocomplete: arbitrary text remains valid, while metadata options are offered as suggestions.
 * Unlike Select this never coerces the value to a predefined option.
 */
export function RuntimeAutocompleteControl(props: FieldControlProps) {
  if (props.masked) return <MaskedControl />;
  const options = useMemo(() => (props.field.options ?? "").split("\n").map((value) => value.trim()).filter(Boolean), [props.field.options]);
  const [open, setOpen] = useState(false);
  const value = String(props.value ?? "");
  const matches = useMemo(() => {
    const needle = value.trim().toLocaleLowerCase("vi");
    const filtered = needle ? options.filter((option) => option.toLocaleLowerCase("vi").includes(needle)) : options;
    return filtered.slice(0, 30);
  }, [options, value]);

  return (
    <Popover open={open && matches.length > 0 && !props.readOnly} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          id={controlId(props)}
          className="mf-control"
          value={value}
          readOnly={props.readOnly}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.describedBy}
          aria-required={props.required || undefined}
          aria-label={props.label}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { props.onChange(event.target.value); setOpen(true); }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div role="listbox" aria-label={props.label} className="max-h-64 overflow-y-auto">
          {matches.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              className="h-8 w-full justify-start px-2 font-normal"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { props.onChange(option); setOpen(false); }}
            >
              {option}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Business editors are selected at the views extension layer rather than inside the generic
 * TextArea primitive. Generic fields therefore keep a plain textarea while the two existing
 * metadata authoring screens preserve their structured editors.
 */
export function RuntimeTextAreaControl(props: FieldControlProps) {
  if (props.parentDoctype === "Sales Option" && props.field.fieldname === "conditions") return <SalesOptionConditionsControl {...props} />;
  if (props.parentDoctype === "Pricing Rule" && props.field.fieldname === "conditions") return <PricingRuleConditionsControl {...props} />;
  if (props.masked) return <MaskedControl />;
  return (
    <Textarea
      id={controlId(props)}
      className="mf-control"
      value={String(props.value ?? "")}
      readOnly={props.readOnly}
      rows={props.field.fieldtype === "Long Text" || props.field.fieldtype === "Code" ? 6 : 3}
      aria-invalid={props.error ? true : undefined}
      aria-describedby={props.describedBy}
      aria-required={props.required || undefined}
      aria-label={props.label}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value)}
    />
  );
}

/** Keep a named legacy escape hatch for consumers that intentionally want the old control. */
export const LegacyRuntimeTextAreaControl = LegacyTextAreaControl;

export function RuntimeLinkControl(props: FieldControlProps) {
  const t = useT();
  if (props.masked) return <MaskedControl />;
  const target = props.linkTarget || props.field.options;
  const search = props.services?.searchLink;
  const value = String(props.value ?? "");
  const id = controlId(props);
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const [pageLength, setPageLength] = useState(INITIAL_LINK_PAGE);
  const [options, setOptions] = useState<Array<{ value: string; label?: string; description?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pickedDesc, setPickedDesc] = useState<string>();
  const [targetLabel, setTargetLabel] = useState<string>();
  const sequence = useRef(0);
  const filters = useMemo(() => buildLinkFilters(props.field, props.docValues), [props.field, props.docValues]);
  const filtersKey = JSON.stringify(filters ?? null);

  useEffect(() => { setPageLength(INITIAL_LINK_PAGE); }, [txt, target, filtersKey, props.parentDoctype]);

  useEffect(() => {
    if (!value || !target || !props.services?.resolveDisplay) { if (!value) setPickedDesc(undefined); return; }
    let alive = true;
    void props.services.resolveDisplay(target, value).then((result) => { if (alive) setPickedDesc(result.label); }).catch(() => undefined);
    return () => { alive = false; };
  }, [props.services, target, value]);

  const allowCreate = Boolean(target && props.field.allow_create !== false && props.field.allow_create !== 0 && props.services?.quickCreate && !props.readOnly && !props.compact);
  useEffect(() => {
    if (!open || !allowCreate || !target || !props.services?.getMeta) return;
    let alive = true;
    void props.services.getMeta(target).then((meta) => { if (alive) setTargetLabel(meta.label); }).catch(() => undefined);
    return () => { alive = false; };
  }, [allowCreate, open, props.services, target]);

  useEffect(() => {
    if (!open || !target || !search) return;
    const current = ++sequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void search(target, txt, {
        filters,
        referenceDoctype: props.parentDoctype,
        pageLength,
        signal: controller.signal,
      }).then((result) => {
        if (current !== sequence.current) return;
        setOptions(result);
      }).catch(() => {
        if (current !== sequence.current || controller.signal.aborted) return;
        setFailed(true);
        setOptions([]);
      }).finally(() => { if (current === sequence.current) setLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filtersKey, open, pageLength, props.parentDoctype, search, target, txt]);

  if (!target) {
    return <div id={id} className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-text">Link "{props.field.fieldname}" chưa có DocType đích.</div>;
  }
  if (!search) {
    return <div id={id} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{t("control.link_missing_service")}</div>;
  }

  const hasMore = options.length >= pageLength && pageLength < MAX_LINK_PAGE;
  const create = async () => {
    if (!allowCreate || !props.services?.quickCreate || creating) return;
    setCreating(true);
    try {
      const name = await props.services.quickCreate(target);
      if (name) { props.onChange(name); setOpen(false); }
    } finally { setCreating(false); }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={props.readOnly}
            className={cn("mf-control mf-link min-w-0 flex-1 justify-between font-normal", !value && "text-muted-foreground", props.error && "border-destructive")}
            aria-invalid={props.error ? true : undefined}
            aria-describedby={props.describedBy}
            aria-required={props.required || undefined}
            aria-label={props.label}
          >
            <span className="min-w-0 truncate text-left">
              {value ? (pickedDesc || value) : t("control.link_placeholder")}
              {value && pickedDesc && pickedDesc !== value && !props.compact ? <span className="ml-1.5 text-xs text-muted-foreground">· {value}</span> : null}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] overflow-hidden p-0" align="start" collisionPadding={12}>
          <Command shouldFilter={false}>
            <div className="border-b p-2">
              <Input value={txt} onChange={(event) => setTxt(event.target.value)} placeholder={t("control.link_search_placeholder")} autoFocus />
            </div>
            <CommandList className="max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-3.25rem))] overflow-y-auto">
              {loading && !options.length ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("control.link_searching")}</div> : null}
              {failed ? <div className="px-3 py-3 text-sm text-destructive" role="alert">{t("control.link_load_failed")}</div> : null}
              {!loading && !failed && options.length === 0 ? <CommandEmpty>{t("control.link_no_results")}</CommandEmpty> : null}
              {options.map((option) => {
                const display = props.compact && option.label === option.value && option.description && option.description !== option.value
                  ? { primary: option.value, secondary: option.description }
                  : props.compact
                    ? { primary: option.label || option.description || option.value }
                    : linkDisplay(option);
                const picked = props.compact ? (option.label || option.description || option.value) : option.description;
                return (
                <CommandItem key={option.value} value={option.value} onSelect={() => { props.onChange(option.value); setPickedDesc(picked); setOpen(false); }}>
                  <Check className={cn("mr-2 size-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{display.primary}</span>
                    {display.secondary ? <span className="truncate text-xs text-muted-foreground">{display.secondary}</span> : null}
                  </span>
                </CommandItem>
                );
              })}
              {hasMore ? (
                <div className="border-t p-2">
                  <Button type="button" variant="ghost" size="sm" className="w-full" disabled={loading} onClick={() => setPageLength((current) => Math.min(MAX_LINK_PAGE, current + LINK_PAGE_STEP))}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : null} Xem thêm
                  </Button>
                </div>
              ) : null}
              {allowCreate ? (
                <div className="border-t p-1">
                  <CommandItem value={`__create__${txt}`} disabled={creating} onSelect={() => { void create(); }}>
                    {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                    {t("control.link_create_new")} {txt.trim() ? `"${txt.trim()}"` : (targetLabel ?? target)}
                  </CommandItem>
                </div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {allowCreate ? (
        <Button type="button" variant="outline" size="icon" className="!size-[34px] shrink-0" aria-label={`${t("control.link_create_new")} ${props.label ?? target}`} disabled={creating} onClick={() => { void create(); }}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      ) : null}
    </div>
  );
}

/** Install runtime overrides without changing the stable controls package contract. */
export function registerRuntimeControls(registry: ControlRegistry): ControlRegistry {
  registry.register("Autocomplete", RuntimeAutocompleteControl);
  registry.register("Link", RuntimeLinkControl);
  registry.register("Dynamic Link", RuntimeLinkControl);
  for (const fieldtype of ["Small Text", "Text", "Long Text", "Code", "JSON", "Markdown Editor", "HTML Editor", "Text Editor"] as const) {
    registry.register(fieldtype, RuntimeTextAreaControl);
  }
  return registry;
}
