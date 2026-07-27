/** @jsxImportSource react */
/**
 * ListToolbar — search (debounce 300ms) + standard filters (Select/Input) + column picker
 * + nút Tạo mới. Filter chuẩn suy từ meta (in_standard_filter). Đổi filter → về trang 1
 * (do useListUrlState xử lý). Chips hiển thị filter đang bật + "Xoá lọc".
 */
import { useEffect, useRef, useState } from "react";
import { Bookmark, CalendarDays, Check, ChevronsUpDown, Group, History, Loader2, Search, SlidersHorizontal, Plus, X, RefreshCw, Rows2, Rows3, Trash2, Undo2 } from "lucide-react";
import {
  Button, Input, Badge, PromptDialog, cn, useT,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
  Checkbox, Popover, PopoverTrigger, PopoverContent,
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
} from "@metaforge/ui";
import type { ListColumn } from "./columns.js";
import type { StandardFilter, ListState } from "./filters.js";
import { loadSavedFilters, saveFilterPreset, deleteFilterPreset, type SavedFilterPreset } from "./saved-filters.js";
import { clearSearchHistory, loadSearchHistory, recordSearch } from "./search-history.js";
import { DATE_RANGE_LABELS, primaryDateField, resolveDateRange, type DateRangeKey } from "./date-range.js";

const ALL = "__all__";

export interface ListToolbarProps {
  /** doctype kỹ thuật (khoá lưu bộ lọc theo đúng doctype, KHÔNG dùng title vì đó là label hiển thị). */
  doctype: string;
  title: string;
  state: ListState;
  onChange: (patch: Partial<ListState>) => void;
  standardFilters: StandardFilter[];
  columns: ListColumn[];
  hidden: string[];
  onToggleColumn: (fieldname: string) => void;
  onCreate?: () => void;
  onRefresh?: () => void;
  searchLink?: (doctype: string, text: string) => Promise<Array<{ value: string; description?: string }>>;
  density?: "comfortable" | "compact";
  onDensityChange?: (d: "comfortable" | "compact") => void;
  /** có ⇒ người dùng đang dùng thứ tự cột tự sắp; hiện nút khôi phục thứ tự gốc theo meta. */
  onResetColumnOrder?: () => void;
  /** fieldname đang gom nhóm ("" = không gom). */
  groupBy?: string;
  /** cột gom được (Select/Link/Check/trạng thái) — rỗng ⇒ ẩn hẳn nút gom nhóm. */
  groupableColumns?: ListColumn[];
  onGroupByChange?: (fieldname: string) => void;
}

export function ListToolbar(props: ListToolbarProps) {
  const t = useT();
  const { state, onChange, standardFilters, columns, hidden, onToggleColumn } = props;
  const activeFilters = Object.entries(state.filters).filter(([, v]) => v);
  const hasActive = activeFilters.length > 0 || state.routeFilters.length > 0 || state.q.trim() !== "" || Boolean(state.dateRange);

  return (
    <div className="mf-list-toolbar flex flex-col gap-2 border-b bg-card px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <SearchBox doctype={props.doctype} value={state.q} onCommit={(q) => onChange({ q })} />

        <DateRangeFilter
          fields={props.columns.map((c) => c.fieldname)}
          value={state.dateRange}
          onChange={(dr) => onChange({ dateRange: dr, page: 1 })}
        />

        {standardFilters.slice(0, 2).map((f) => (
          <FilterControl
            key={f.fieldname}
            filter={f}
            value={state.filters[f.fieldname] ?? ""}
            onChange={(v) => onChange({ filters: { ...state.filters, [f.fieldname]: v } })}
            searchLink={props.searchLink}
          />
        ))}

        {standardFilters.length > 2 ? (
          <MoreFiltersMenu
            filters={standardFilters.slice(2)}
            values={state.filters}
            onChange={(fieldname, value) => onChange({ filters: { ...state.filters, [fieldname]: value }, page: 1 })}
            searchLink={props.searchLink}
          />
        ) : null}

        <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1 max-sm:w-full">
          <SavedFiltersMenu doctype={props.doctype} state={state} onApply={(preset) => onChange({ q: preset.q, filters: preset.filters, routeFilters: preset.routeFilters ?? [], sort: preset.sort, dateRange: preset.dateRange, page: 1 })} />
          {props.onRefresh ? (
            <Button variant="ghost" size="icon" className="size-8" onClick={props.onRefresh} title={t("common.refresh")} aria-label={t("common.refresh")}>
              <RefreshCw />
            </Button>
          ) : null}
          {props.onDensityChange ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => props.onDensityChange!(props.density === "compact" ? "comfortable" : "compact")}
              title={props.density === "compact" ? t("list.comfortable") : t("list.compact")}
              aria-label={props.density === "compact" ? t("list.comfortable") : t("list.compact")}
            >
              {props.density === "compact" ? <Rows3 /> : <Rows2 />}
            </Button>
          ) : null}
          {props.onGroupByChange && props.groupableColumns?.length ? (
            <GroupByMenu columns={props.groupableColumns} value={props.groupBy ?? ""} onChange={props.onGroupByChange} />
          ) : null}
          <ColumnPicker columns={columns} hidden={hidden} onToggle={onToggleColumn} onResetOrder={props.onResetColumnOrder} />
          {props.onCreate ? (
            <Button className="h-8" onClick={props.onCreate}>
              <Plus /> {t("common.create")}
            </Button>
          ) : null}
        </div>
      </div>

      {hasActive ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {state.q.trim() ? (
            <Chip label={`"${state.q}"`} onClear={() => onChange({ q: "" })} />
          ) : null}
          {state.routeFilters.map(([field, operator, value], index) => (
            <Badge key={`${field}:${operator}:${index}`} variant="outline" className="gap-1.5 font-normal" title={t("list.filter_from_kpi")}>
              {field} {operator} {Array.isArray(value) ? value.join(" → ") : String(value)}
            </Badge>
          ))}
          {activeFilters.map(([field, v]) => {
            const f = standardFilters.find((x) => x.fieldname === field);
            return (
              <Chip
                key={field}
                label={`${f?.label ?? field}: ${v}`}
                onClear={() => onChange({ filters: { ...state.filters, [field]: "" } })}
              />
            );
          })}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => onChange({ q: "", filters: {}, routeFilters: [], dateRange: undefined, page: 1 })}>
            {t("list.clear_filters")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MoreFiltersMenu({ filters, values, onChange, searchLink }: {
  filters: StandardFilter[];
  values: Record<string, string>;
  onChange: (fieldname: string, value: string) => void;
  searchLink?: ListToolbarProps["searchLink"];
}) {
  const t = useT();
  const active = filters.filter((f) => Boolean(values[f.fieldname])).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={active ? "secondary" : "outline"} className="h-8 gap-1.5">
          <SlidersHorizontal className="size-3.5" /> {t("list.more_filters", "Thêm bộ lọc")}
          {active ? <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1">{active}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1rem))] space-y-3 p-3">
        <div className="text-sm font-medium">{t("list.more_filters", "Thêm bộ lọc")}</div>
        {filters.map((filter) => (
          <div key={filter.fieldname} className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{filter.label}</label>
            <FilterControl filter={filter} value={values[filter.fieldname] ?? ""} onChange={(value) => onChange(filter.fieldname, value)} searchLink={searchLink} />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function SearchBox({ doctype, value, onCommit }: { doctype: string; value: string; onCommit: (v: string) => void }) {
  const t = useT();
  const [local, setLocal] = useState(value);
  const [history, setHistory] = useState<string[]>(() => loadSearchHistory(doctype));
  const [historyOpen, setHistoryOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // sync khi value ngoài đổi (vd. xoá chip/back)
  useEffect(() => setLocal(value), [value]);
  useEffect(() => { setHistory(loadSearchHistory(doctype)); }, [doctype]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  function change(v: string) {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    // Gõ tới đâu lọc tới đó (debounce) nhưng KHÔNG ghi lịch sử ở đây — mỗi ký tự sẽ thành 1 mục rác.
    // Chỉ ghi khi người dùng chốt bằng Enter hoặc chọn lại từ lịch sử.
    timer.current = setTimeout(() => onCommit(v.trim()), 300);
  }

  function commitNow(v: string) {
    if (timer.current) clearTimeout(timer.current);
    const term = v.trim();
    setLocal(term);
    onCommit(term);
    if (term) setHistory(recordSearch(doctype, term));
    setHistoryOpen(false);
  }

  // Chỉ gợi ý khi ô đang trống — có chữ rồi thì danh sách kết quả thật mới là thứ người dùng cần nhìn.
  const showHistory = historyOpen && !local.trim() && history.length > 0;

  return (
    <div className="relative w-full min-w-[9rem] max-w-[16rem] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => change(e.target.value)}
        onFocus={() => setHistoryOpen(true)}
        // Đóng TRỄ: click vào 1 mục lịch sử làm input blur trước khi onClick kịp chạy.
        onBlur={() => { blurTimer.current = setTimeout(() => setHistoryOpen(false), 150); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitNow(local);
          if (e.key === "Escape") setHistoryOpen(false);
        }}
        placeholder={t("list.search_placeholder")}
        className="pl-8"
        aria-label={t("common.search")}
      />
      {showHistory ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
            <History className="size-3.5" /> {t("list.recent_searches")}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-5 px-1.5 text-[11px] font-normal"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { clearSearchHistory(doctype); setHistory([]); }}
            >
              {t("list.clear_history")}
            </Button>
          </div>
          {history.map((term) => (
            <Button
              key={term}
              variant="ghost"
              className="w-full justify-start rounded-none px-2.5 py-1.5 text-sm font-normal"
              onMouseDown={(e) => e.preventDefault()} // giữ focus để onBlur không đóng trước onClick
              onClick={() => commitNow(term)}
            >
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{term}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterControl({ filter, value, onChange, searchLink }: { filter: StandardFilter; value: string; onChange: (v: string) => void; searchLink?: ListToolbarProps["searchLink"] }) {
  const t = useT();
  if (filter.fieldtype === "Select" && filter.options?.length) {
    return (
      <Select value={value === "" ? ALL : value} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger className="w-auto min-w-[8rem] max-w-[12rem] gap-2" aria-label={filter.label}>
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          <SelectValue placeholder={filter.label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{filter.label}: {t("list.all")}</SelectItem>
          {filter.options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (filter.fieldtype === "Link" && filter.linkDoctype && searchLink) {
    return <LinkFilter label={filter.label} doctype={filter.linkDoctype} value={value} onChange={onChange} search={searchLink} />;
  }
  // Data/khác → input lọc (debounce nhẹ)
  return <FilterInput label={filter.label} value={value} onChange={onChange} />;
}

function LinkFilter({ label, doctype, value, onChange, search }: { label: string; doctype: string; value: string; onChange: (value: string) => void; search: NonNullable<ListToolbarProps["searchLink"]> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Array<{ value: string; label?: string; description?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(value);
  const seq = useRef(0);
  useEffect(() => { if (!value) setSelectedLabel(""); }, [value]);
  useEffect(() => {
    if (!open) return;
    const current = ++seq.current;
    const timer = setTimeout(() => {
      setLoading(true);
      void search(doctype, text).then((result) => {
        if (seq.current === current) setItems(result);
      }).catch(() => { if (seq.current === current) setItems([]); }).finally(() => { if (seq.current === current) setLoading(false); });
    }, 200);
    return () => clearTimeout(timer);
  }, [open, text, doctype, search]);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" className="h-8 min-w-[8rem] max-w-[12rem] justify-between font-normal"><span className="truncate">{value ? (selectedLabel || value) : label}</span><ChevronsUpDown className="ml-2 size-3.5 opacity-50" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-72 p-0"><Command shouldFilter={false}><CommandInput value={text} onValueChange={setText} placeholder={`${t("common.search").replace("…", "")} ${label.toLowerCase()}…`} /><CommandList>
      {loading ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("common.loading")}</div> : <>
        <CommandItem value="__all__" onSelect={() => { onChange(""); setSelectedLabel(""); setOpen(false); }}><Check className={`mr-2 size-4 ${value ? "opacity-0" : "opacity-100"}`} />{t("list.all")}</CommandItem>
        <CommandEmpty>{t("list.no_results")}</CommandEmpty>
        {items.map((item) => <CommandItem key={item.value} value={item.value} onSelect={() => { onChange(item.value); setSelectedLabel(item.label || item.value); setOpen(false); }}><Check className={`mr-2 size-4 ${item.value === value ? "opacity-100" : "opacity-0"}`} />{/* `label` là TÊN, `description` là MÃ. Trước đây dòng chính đọc `description`,
            nên bộ lọc hiện "CT-0001" thay vì "IELTS Foundation". */}
          <span className="min-w-0"><span className="block truncate">{item.label || item.value}</span>{item.label && item.label !== item.value ? <span className="block truncate text-xs text-muted-foreground">{item.value}</span> : null}</span></CommandItem>)}
      </>}
    </CommandList></Command></PopoverContent>
  </Popover>;
}

function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setLocal(value), [value]);
  return (
    <Input
      value={local}
      placeholder={label}
      className="w-32"
      aria-label={label}
      onChange={(e) => {
        setLocal(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(e.target.value.trim()), 350);
      }}
    />
  );
}

/** Bộ lọc đã lưu — lưu tổ hợp tìm/lọc/sắp xếp hiện tại kèm tên, áp lại 1 click sau này. Client-only
 * (localStorage theo doctype) — không dùng doctype "Filter" chuẩn Frappe (schema cần xác nhận LIVE
 * từng site, tránh đoán sai field khi chưa kiểm tra được). */
function SavedFiltersMenu({ doctype, state, onApply }: { doctype: string; state: ListState; onApply: (preset: SavedFilterPreset) => void }) {
  const t = useT();
  const [presets, setPresets] = useState<SavedFilterPreset[]>(() => loadSavedFilters(doctype));
  const [promptOpen, setPromptOpen] = useState(false);
  const hasCurrentFilter = state.q.trim() !== "" || Object.values(state.filters).some(Boolean) || state.routeFilters.length > 0 || Boolean(state.dateRange) || state.sort !== "";

  const refresh = () => setPresets(loadSavedFilters(doctype));
  const save = (name: string) => { saveFilterPreset(doctype, name, state); refresh(); };
  const remove = (name: string) => { deleteFilterPreset(doctype, name); refresh(); };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" title={t("list.saved_filters")} aria-label={t("list.saved_filters")}><Bookmark /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t("list.saved_filters_title")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {presets.length === 0 ? <div className="px-2 py-3 text-center text-xs text-muted-foreground">{t("list.saved_filters_empty")}</div> : null}
          {presets.map((p) => (
            <div key={p.name} className="flex items-center gap-1 rounded-sm px-1 hover:bg-accent">
              <DropdownMenuItem className="flex-1 hover:bg-transparent" onClick={() => onApply(p)}>{p.name}</DropdownMenuItem>
              <Button variant="ghost" size="icon-sm" className="size-6 shrink-0" aria-label={`${t("common.delete")} "${p.name}"`} onClick={(e) => { e.stopPropagation(); remove(p.name); }}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!hasCurrentFilter} onClick={() => setPromptOpen(true)}>
            <Plus /> {t("list.save_current_filter")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title={t("list.save_filter_title")}
        label={t("list.filter_name")}
        confirmLabel={t("common.save")}
        onConfirm={save}
      />
    </>
  );
}

/** Gom nhóm dòng theo 1 cột. Chỉ gom TRANG hiện tại — nói rõ trong menu để không hiểu nhầm là
 * tổng hợp toàn bộ dữ liệu (muốn vậy phải aggregate ở server, việc khác). */
function GroupByMenu({ columns, value, onChange }: { columns: ListColumn[]; value: string; onChange: (f: string) => void }) {
  const t = useT();
  const active = columns.find((c) => c.fieldname === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={active ? "secondary" : "outline"} size="icon" className="size-8" title={active ? `${t("list.group_by")}: ${active.label}` : t("list.group_by")} aria-label={t("list.group_by")}>
          <Group />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("list.group_by")}</DropdownMenuLabel>
        <div className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">{t("list.group_by_page_only")}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange("")}>
          <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} /> {t("list.group_none")}
        </DropdownMenuItem>
        {columns.map((c) => (
          <DropdownMenuItem key={c.fieldname} onClick={() => onChange(c.fieldname)}>
            <Check className={cn("size-4", c.fieldname === value ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{c.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnPicker({ columns, hidden, onToggle, onResetOrder }: { columns: ListColumn[]; hidden: string[]; onToggle: (f: string) => void; onResetOrder?: () => void }) {
  const t = useT();
  const hiddenSet = new Set(hidden);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="size-8" title={t("list.columns")} aria-label={t("list.columns")}>
          <SlidersHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("list.show_columns")}</DropdownMenuLabel>
        <div className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">{t("list.reorder_hint")}</div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {columns.map((c) => (
            <label key={c.fieldname} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox
                checked={!hiddenSet.has(c.fieldname)}
                disabled={c.isTitle}
                onCheckedChange={() => onToggle(c.fieldname)}
              />
              <span className="truncate">{c.label}</span>
            </label>
          ))}
        </div>
        {onResetOrder ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onResetOrder}>
              <Undo2 /> {t("list.reset_column_order")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  const t = useT();
  return (
    <Badge variant="secondary" className="gap-1 pl-2 pr-1 font-normal">
      {label}
      <Button variant="ghost" onClick={onClear} aria-label={t("list.clear_filters")} className="size-4 rounded-sm p-0 hover:bg-background/60 [&_svg]:size-3">
        <X />
      </Button>
    </Badge>
  );
}


/**
 * Lọc nhanh theo khoảng thời gian.
 *
 * Bộ lọc chuẩn chỉ cho chọn TỪNG NGÀY, nên muốn xem "nhập hàng tháng này" phải tự tính ngày đầu
 * và cuối tháng rồi gõ vào hai ô — việc làm vài lần mỗi ngày, và gõ sai một chữ số là ra bộ số
 * liệu khác hẳn mà không ai nhận ra.
 *
 * Doctype không có field ngày nào dùng được thì ẨN HẲN nút, không hiện nút bấm vào không có tác dụng.
 */
function DateRangeFilter({ fields, value, onChange }: {
  fields: string[];
  value?: ListState["dateRange"];
  onChange: (v: ListState["dateRange"]) => void;
}) {
  const t = useT();
  const field = primaryDateField(fields);
  if (!field) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={value ? "default" : "outline"} size="sm" className="h-8 gap-1.5">
          <CalendarDays className="size-3.5" />
          {value ? t(`range.${value.key}`) : t("range.all_time")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>{t("range.title")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onChange(undefined)}>
          {t("range.all_time")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {DATE_RANGE_LABELS.map((r) => (
          <DropdownMenuItem
            key={r.key}
            onClick={() => {
              const { from, to } = resolveDateRange(r.key);
              onChange({ key: r.key, field, from, to });
            }}
          >
            {t(r.labelKey)}
          </DropdownMenuItem>
        ))}
        {/* Nói rõ đang lọc theo field NÀO — cùng một chứng từ có ngày lập và ngày ghi sổ khác nhau,
            không nói thì người dùng không biết con số đang dựa trên cái nào. */}
        <DropdownMenuSeparator />
        <div className="px-2 py-1 text-[11px] text-muted-foreground">
          {t("range.by_field")} <span className="font-mono">{field}</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
