/** @jsxImportSource react */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, CalendarRange, Check, ChevronsUpDown, Loader2, MapPin, SlidersHorizontal } from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import {
  EMPTY_BUSINESS_CONTEXT,
  contextCacheSuffix,
  normalizeContextSelection,
  type BusinessContextKey,
  type BusinessContextSelection,
  type BusinessContextState,
} from "@metaforge/core";
import {
  Button, Popover, PopoverContent, PopoverTrigger, Command, CommandEmpty, CommandInput,
  CommandItem, CommandList, cn, Badge,
} from "@metaforge/ui";

export interface BusinessContextValue extends BusinessContextState {
  loading: boolean;
  error?: string;
  setDimension: (key: BusinessContextKey, value?: string) => Promise<void>;
  reload: () => Promise<void>;
  cacheSuffix: string;
  ready: boolean;
}

const Ctx = createContext<BusinessContextValue | null>(null);

export function useBusinessContext(): BusinessContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useBusinessContext phải nằm trong BusinessContextProvider");
  return value;
}

export interface BusinessContextProviderProps {
  adapter: FrappeAdapter;
  appId: string;
  dimensions?: BusinessContextKey[];
  /** site|user|app — chỉ lưu lựa chọn gần nhất, server luôn kiểm quyền lại. */
  storageKey?: string;
  children: ReactNode;
}

type CoreDefaults = {
  default_company?: unknown;
  default_currency?: unknown;
  default_warehouse?: unknown;
  default_fiscal_year?: unknown;
  default_cost_center?: unknown;
  default_selling_price_list?: unknown;
  default_buying_price_list?: unknown;
};

const DEFAULT_SELECTION_FIELDS: Array<[keyof CoreDefaults, BusinessContextKey]> = [
  ["default_company", "company"],
  ["default_warehouse", "warehouse"],
  ["default_fiscal_year", "fiscal_year"],
  ["default_cost_center", "cost_center"],
  ["default_selling_price_list", "selling_price_list"],
  ["default_buying_price_list", "buying_price_list"],
];

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function readStored(key?: string): BusinessContextSelection {
  if (!key || typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(`mf-context:${key}`) ?? "{}"); } catch { return {}; }
}
function writeStored(key: string | undefined, value: BusinessContextSelection) {
  if (!key || typeof localStorage === "undefined") return;
  try {
    const { date_from: _dateFrom, date_to: _dateTo, ...selectors } = value;
    localStorage.setItem(`mf-context:${key}`, JSON.stringify(selectors));
  } catch { /* private mode */ }
}

function defaultsSelection(defaults: CoreDefaults): BusinessContextSelection {
  const selection: BusinessContextSelection = {};
  for (const [field, key] of DEFAULT_SELECTION_FIELDS) {
    const value = text(defaults[field]);
    if (value) selection[key] = value;
  }
  return selection;
}

async function readCoreDefaults(adapter: FrappeAdapter): Promise<CoreDefaults> {
  try {
    const result = await adapter.getDoc("Global Defaults", "Global Defaults");
    return result.doc as CoreDefaults;
  } catch {
    // Backward compatible while an older tenant has not received the core Single DocType yet.
    return {};
  }
}

export function BusinessContextProvider(props: BusinessContextProviderProps) {
  const [state, setState] = useState<BusinessContextState>(EMPTY_BUSINESS_CONTEXT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const seq = useRef(0);
  const selectionRef = useRef<BusinessContextSelection>(readStored(props.storageKey));

  const load = useCallback(async (requested?: BusinessContextSelection) => {
    const id = ++seq.current;
    setLoading(true); setError(undefined);
    try {
      const coreDefaults = await readCoreDefaults(props.adapter);
      const remembered = requested ?? selectionRef.current;
      // Site defaults are bootstrap defaults, not a lock. Once the user has any remembered
      // selector we preserve that context instead of re-applying an optional warehouse they
      // deliberately cleared to "Tất cả".
      const hasRememberedSelector = Object.entries(remembered).some(([key, value]) => key !== "date_from" && key !== "date_to" && Boolean(value));
      const bootstrapSelection = requested === undefined && !hasRememberedSelector
        ? { ...defaultsSelection(coreDefaults), ...remembered }
        : remembered;
      const response = await props.adapter.getBusinessContext(props.appId, props.dimensions, bootstrapSelection);
      if (id !== seq.current) return;
      const selection = normalizeContextSelection(response, response.selection);

      // Transaction currency follows the selected Company first. Global Defaults is only a
      // fallback for legacy Company records that predate required default_currency.
      let effectiveCurrency = text(coreDefaults.default_currency);
      if (selection.company) {
        try {
          const company = await props.adapter.getDoc("Company", selection.company);
          effectiveCurrency = text(company.doc.default_currency) || effectiveCurrency;
        } catch {
          // Permission/server validation still runs on every real transaction. Context loading
          // must not blank the whole app because an optional currency enrichment read failed.
        }
      }
      if (effectiveCurrency) selection.currency = effectiveCurrency;

      // Price lists are non-selector defaults unless an app explicitly exposes them as context
      // dimensions. Keeping them in the same selection lets generic create policies consume the
      // site authority without each screen querying Global Defaults again.
      if (!selection.selling_price_list) {
        const value = text(coreDefaults.default_selling_price_list);
        if (value) selection.selling_price_list = value;
      }
      if (!selection.buying_price_list) {
        const value = text(coreDefaults.default_buying_price_list);
        if (value) selection.buying_price_list = value;
      }

      selectionRef.current = selection;
      writeStored(props.storageKey, selection);
      setState({ ...response, selection });
    } catch (e) {
      if (id !== seq.current) return;
      setError(props.adapter.mapError(e).message);
      setState(EMPTY_BUSINESS_CONTEXT);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [props.adapter, props.appId, props.dimensions, props.storageKey]);

  useEffect(() => { void load(); }, [load]);

  const setDimension = useCallback(async (key: BusinessContextKey, value?: string) => {
    const next = { ...selectionRef.current };
    if (value) next[key] = value; else delete next[key];
    // Company đổi: server phải resolve lại dependent dimensions, không giữ kho/chi nhánh cũ.
    if (key === "company") {
      delete next.currency;
      delete next.fiscal_year;
      delete next.date_from;
      delete next.date_to;
      delete next.warehouse;
      delete next.branch;
      delete next.cost_center;
    }
    if (key === "fiscal_year") {
      delete next.date_from;
      delete next.date_to;
    }
    selectionRef.current = next;
    await load(next);
  }, [load]);

  const ready = state.dimensions.every((d) => !d.enabled || !d.required || Boolean(state.selection[d.key]));
  const value = useMemo<BusinessContextValue>(() => ({
    ...state, loading, error, setDimension, reload: () => load(), cacheSuffix: contextCacheSuffix(state.selection), ready,
  }), [state, loading, error, setDimension, load, ready]);

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

const ICONS: Partial<Record<BusinessContextKey, ReactNode>> = {
  company: <Building2 className="size-3.5" />,
  fiscal_year: <CalendarRange className="size-3.5" />,
  warehouse: <MapPin className="size-3.5" />,
  branch: <MapPin className="size-3.5" />,
};

export function BusinessContextBar({ compact = false }: { compact?: boolean }) {
  const ctx = useBusinessContext();
  const visible = ctx.dimensions.filter((d) => d.enabled && !d.hidden);
  if (ctx.loading && !ctx.dimensions.length) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Đang nạp phạm vi…</div>;
  if (!visible.length) return null;
  return (
    <div className="mf-business-context flex min-w-0 items-center gap-1.5" aria-label="Phạm vi dữ liệu toàn hệ thống">
      {compact ? <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" /> : null}
      {visible.map((d) => <DimensionSelect key={d.key} dimension={d} value={ctx.selection[d.key]} onChange={(v) => ctx.setDimension(d.key, v)} compact={compact} />)}
      {!ctx.ready ? <Badge variant="destructive" className="hidden lg:inline-flex">Cần chọn phạm vi</Badge> : null}
    </div>
  );
}

function DimensionSelect({ dimension, value, onChange, compact }: {
  dimension: BusinessContextState["dimensions"][number]; value?: string; onChange: (v?: string) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Phòng thủ trước dữ liệu master cũ từng tồn tại đồng thời ở master_records
  // và documents: một giá trị chỉ được phép xuất hiện một lần trong selector.
  const options = useMemo(
    () => [...new Map(dimension.options.map((option) => [option.value, option])).values()],
    [dimension.options],
  );
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline" size="sm" disabled={dimension.locked}
          className={cn("h-8 max-w-[15rem] justify-between gap-1.5 bg-background px-2.5 font-normal", compact && "max-w-[9rem]")}
          aria-label={`${dimension.label}: ${selected?.label ?? "chưa chọn"}`}
        >
          <span className="shrink-0 text-muted-foreground">{ICONS[dimension.key]}</span>
          <span className="truncate">{selected?.label ?? dimension.label}</span>
          {!dimension.locked ? <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={`Tìm ${dimension.label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>Không có lựa chọn phù hợp</CommandEmpty>
            {!dimension.required ? (
              <CommandItem value={`all-${dimension.key}`} onSelect={() => { onChange(undefined); setOpen(false); }}>
                <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
                <span>Tất cả {dimension.label.toLowerCase()}</span>
              </CommandItem>
            ) : null}
            {options.map((o) => (
              <CommandItem key={o.value} value={`${o.label} ${o.value}`} disabled={o.disabled} onSelect={() => { onChange(o.value); setOpen(false); }}>
                <Check className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1"><span className="block truncate">{o.label}</span>{o.description ? <span className="block truncate text-xs text-muted-foreground">{o.description}</span> : null}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
