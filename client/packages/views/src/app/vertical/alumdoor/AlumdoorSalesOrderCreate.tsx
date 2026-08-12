/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Loader2, PackagePlus, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  applyContextPolicy,
  linkDisplay,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
  type LinkResult,
} from "@metaforge/core";
import { Button, Input, toast } from "@metaforge/ui";
import { useMetaForge } from "../../../container/provider.js";

interface AlumdoorSalesOrderCreateProps {
  closeRequest?: number;
  onCreated: (name: string) => void;
  onPreviewCreated: (name: string) => void;
  onCancel: () => void;
}

type FieldOverride = {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
};

type ItemContext = Record<string, unknown> & {
  item_group?: string;
  door_type?: string | null;
  inventory_mode?: string;
  selected_uom?: string;
  allowed_uoms?: string[];
  rate?: number | null;
  price_missing?: boolean;
  price_error?: string | null;
  availability_status?: string;
};

interface SalesLine extends Record<string, unknown> {
  _key: string;
  _itemLabel?: string;
  _context?: ItemContext;
  _salesOptions?: Doc[];
  _allowedColors?: string[];
  _overrides?: Record<string, FieldOverride>;
  _loading?: boolean;
  _error?: string;
  item_code?: string;
  sales_option?: string;
  color?: string;
  sales_mode?: string;
  leaf_variant?: string;
  uom?: string;
  qty?: number;
  rate?: number;
  amount?: number;
  discount_percentage?: number;
  discount_amount?: number;
  adjustment_amount?: number;
  net_amount?: number;
  width_m?: number;
  height_m?: number;
  mesh_height_m?: number;
  set_count?: number;
  has_butterfly_bracket?: number;
  length_m?: number;
  qty_bar?: number;
  note?: string;
}

const AREA_UOMS = new Set(["m2", "m²", "sqm"]);
const LAYOUT_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "Heading", "HTML", "Button"]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi");
}

function today(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function resolveDefault(field: DocField): unknown {
  if (field.default == null || field.default === "") return undefined;
  if (field.default === "Today" && field.fieldtype === "Date") return today();
  if (field.default === "Now" && field.fieldtype === "Datetime") return new Date().toISOString().slice(0, 19).replace("T", " ");
  return field.default;
}

function blankFromMeta(meta: DocTypeMeta): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of meta.fields ?? []) {
    const value = resolveDefault(field);
    if (value !== undefined) values[field.fieldname] = value;
  }
  return values;
}

function fieldOptions(meta: DocTypeMeta | null, fieldname: string, fallback: string[]): string[] {
  const options = text(meta?.fields?.find((field) => field.fieldname === fieldname)?.options)
    .split("\n").map((value) => value.trim()).filter(Boolean);
  return options.length ? options : fallback;
}

function isAreaDoor(line: SalesLine): boolean {
  return text(line._context?.inventory_mode) === "Thành phẩm theo m2";
}

function family(line: SalesLine): "german" | "australian" | "mesh" | "taiwan" | "super" | "door" | "ordinary" {
  const group = normalized(line._context?.item_group);
  const door = normalized(line._context?.door_type);
  if (group.includes("cua cn duc") || door.includes("cua duc")) return "german";
  if (group.includes("cua tam lien uc") || door.includes("cua uc")) return "australian";
  if (group.includes("cua luoi") || door.includes("cua luoi")) return "mesh";
  if (group.includes("cua dai loan") || door.includes("dai loan")) return "taiwan";
  if (group.includes("sieu truong") || door.includes("sieu truong")) return "super";
  return isAreaDoor(line) ? "door" : "ordinary";
}

function normalizeCustomerGroup(value: unknown): string {
  const key = normalized(value);
  if (key === "dai ly") return "Đại lý";
  if (["le", "khach le", "cong trinh", "nha thau"].includes(key)) return "Lẻ";
  return text(value);
}

function numberValue(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function money(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "—";
}

function lineTotal(line: SalesLine): number {
  const net = Number(line.net_amount);
  if (Number.isFinite(net)) return net;
  const amount = Number(line.amount);
  if (!Number.isFinite(amount)) return 0;
  return amount - Math.max(0, Number(line.discount_amount) || 0) + (Number(line.adjustment_amount) || 0);
}

function newLine(index: number): SalesLine {
  return { _key: `line-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, set_count: 1, qty: 1 };
}

function overrideVisible(line: SalesLine, fieldname: string, fallback = true): boolean {
  const override = line._overrides?.[fieldname];
  if (!override || override.hidden == null) return fallback;
  return !(override.hidden === 1 || override.hidden === true);
}

function overrideRequired(line: SalesLine, fieldname: string): boolean {
  const value = line._overrides?.[fieldname]?.reqd;
  return value === 1 || value === true;
}

function overrideReadonly(line: SalesLine, fieldname: string): boolean {
  const value = line._overrides?.[fieldname]?.read_only;
  return value === 1 || value === true;
}

function overrideLabel(line: SalesLine, fieldname: string, fallback: string): string {
  return text(line._overrides?.[fieldname]?.label).replace("\n", " ") || fallback;
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <div className="mb-1 text-xs font-medium text-muted-foreground">{children}{required ? <span className="ml-1 text-destructive">*</span> : null}</div>;
}

function LinkPicker(props: {
  doctype: string;
  value?: string;
  label?: string;
  placeholder?: string;
  filters?: Record<string, unknown>;
  referenceDoctype?: string;
  disabled?: boolean;
  onChange: (value: string, label: string) => void;
}) {
  const { adapter } = useMetaForge();
  const [query, setQuery] = useState(props.label || props.value || "");
  const [results, setResults] = useState<LinkResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => { setQuery(props.label || props.value || ""); }, [props.label, props.value]);

  const search = useCallback(async (next: string) => {
    const current = ++seq.current;
    setLoading(true);
    try {
      const rows = await adapter.searchLink(props.doctype, next, {
        filters: props.filters,
        referenceDoctype: props.referenceDoctype,
        pageLength: 20,
      });
      if (current === seq.current) setResults(rows);
    } catch {
      if (current === seq.current) setResults([]);
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [adapter, props.doctype, props.referenceDoctype, JSON.stringify(props.filters ?? {})]);

  return (
    <div className="relative">
      <Input
        value={query}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onFocus={() => { setOpen(true); void search(query); }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (props.value) props.onChange("", next);
          setOpen(true);
          void search(next);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
      />
      {open && !props.disabled ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-xl">
          {loading ? <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Đang tìm…</div> : null}
          {!loading && results.length === 0 ? <div className="px-3 py-2 text-xs text-muted-foreground">Không có kết quả</div> : null}
          {results.map((result) => {
            const display = linkDisplay(result);
            return (
              <button
                key={result.value}
                type="button"
                className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(display.primary);
                  props.onChange(result.value, display.primary);
                  setOpen(false);
                }}
              >
                <span className="text-sm font-medium">{display.primary}</span>
                {display.secondary ? <span className="text-[11px] text-muted-foreground">{display.secondary}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SelectInput(props: { value?: unknown; options: string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      value={text(props.value)}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">— Chọn —</option>
      {props.options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function NumericInput(props: {
  value?: unknown;
  min?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
  onCommit?: () => void;
}) {
  return (
    <Input
      type="number"
      min={props.min}
      step={props.step ?? 0.001}
      value={props.value == null ? "" : String(props.value)}
      disabled={props.disabled}
      onChange={(event) => props.onChange(numberValue(event.target.value))}
      onBlur={() => props.onCommit?.()}
      onKeyDown={(event) => { if (event.key === "Enter") props.onCommit?.(); }}
    />
  );
}

export function AlumdoorSalesOrderCreate(props: AlumdoorSalesOrderCreateProps) {
  const { adapter, services, scopeKey, businessContext, contextPolicies } = useMetaForge();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Record<string, unknown>>({});
  const [customerLabel, setCustomerLabel] = useState("");
  const [priceListLabel, setPriceListLabel] = useState("");
  const [customerGroup, setCustomerGroup] = useState("");
  const [lines, setLines] = useState<SalesLine[]>([newLine(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [fatal, setFatal] = useState("");
  const closeSeen = useRef(props.closeRequest ?? 0);
  const previewSeq = useRef(new Map<string, number>());

  const childFields = useMemo(() => childMeta?.fields?.map((field) => field.fieldname).filter(Boolean) ?? [], [childMeta]);
  const childFieldSet = useMemo(() => new Set(childFields), [childFields]);
  const salesModes = useMemo(() => fieldOptions(childMeta, "sales_mode", ["Tách món", "Trọn bộ"]), [childMeta]);
  const leafVariants = useMemo(() => fieldOptions(childMeta, "leaf_variant", ["Kéo tay", "Motor ngoài", "Motor trong"]), [childMeta]);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    props.onCancel();
  }, [props.closeRequest, props.onCancel]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const salesMeta = await adapter.getMeta("Sales Order");
        const itemTable = salesMeta.fields.find((field) => field.fieldname === "items" && field.fieldtype === "Table");
        const itemDoctype = text(itemTable?.options) || "Sales Order Item";
        const [salesItemMeta, boot, caps] = await Promise.all([
          adapter.getMeta(itemDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Sales Order"),
        ]);
        if (!active) return;
        const contextDefaults = applyContextPolicy("Sales Order", businessContext, contextPolicies).defaults;
        const defaults = { ...blankFromMeta(salesMeta), ...contextDefaults } as Record<string, unknown>;
        if (salesMeta.fields.some((field) => field.fieldname === "transaction_date") && !defaults.transaction_date) defaults.transaction_date = today();
        if (salesMeta.fields.some((field) => field.fieldname === "delivery_date") && !defaults.delivery_date) defaults.delivery_date = today();
        if (salesMeta.fields.some((field) => field.fieldname === "currency") && !defaults.currency) defaults.currency = boot.sysdefaults.currency || "VND";
        if (salesMeta.fields.some((field) => field.fieldname === "responsible_person") && !defaults.responsible_person) defaults.responsible_person = boot.full_name || boot.user;
        setMeta(salesMeta);
        setChildMeta(salesItemMeta);
        setCanCreate(Boolean(caps.create));
        setHeader(defaults);
        setPriceListLabel(text(defaults.selling_price_list));
      } catch (error) {
        if (active) setFatal(adapter.mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext, contextPolicies]);

  const patchLine = useCallback((key: string, patch: Partial<SalesLine>) => {
    setLines((current) => current.map((line) => line._key === key ? { ...line, ...patch } : line));
  }, []);

  const loadSalesOptions = useCallback(async (itemCode: string, itemGroup: string): Promise<Doc[]> => {
    if (!itemGroup) return [];
    try {
      const rows = await adapter.getList("Sales Option", {
        fields: ["name", "option_label", "item_group", "item_code", "is_default", "disabled", "sales_mode", "price_variant", "sales_package"],
        filters: { item_group: itemGroup, disabled: 0 },
        pageLength: 100,
      });
      return rows.filter((row) => !text(row.item_code) || text(row.item_code) === itemCode);
    } catch {
      return [];
    }
  }, [adapter]);

  const previewLine = useCallback(async (source: SalesLine, changedField: string, overrides: Partial<SalesLine> = {}) => {
    if (!meta || !childMeta) return;
    const row = { ...source, ...overrides } as SalesLine;
    const itemCode = text(row.item_code);
    if (!itemCode) return;
    const key = row._key;
    const seq = (previewSeq.current.get(key) ?? 0) + 1;
    previewSeq.current.set(key, seq);
    patchLine(key, { ...overrides, _loading: true, _error: "" });
    try {
      const parent = {
        customer: header.customer,
        customer_group: customerGroup,
        selling_price_list: header.selling_price_list,
        currency: header.currency || "VND",
        company: header.company,
      };
      const [context, preview, colors] = await Promise.all([
        services.callPost<ItemContext>("alumdoor.sales.item_context", {
          item_code: itemCode,
          uom: row.uom,
          warehouse: row.warehouse,
          price_list: header.selling_price_list,
          currency: header.currency || "VND",
          qty: row.qty,
          sales_option: row.sales_option,
        }),
        services.callPost<Record<string, unknown>>("alumdoor.ui.preview_child_row", {
          child_doctype: childMeta.name,
          child_fields: childFields,
          row,
          parent,
          changed_field: changedField,
        }),
        services.callPost<Record<string, unknown>>("alumdoor.catalog.allowed_colors", { item_code: itemCode, usage_scope: "sales" }).catch(() => ({})),
      ]);
      if (previewSeq.current.get(key) !== seq) return;
      const patch = preview.patch && typeof preview.patch === "object" && !Array.isArray(preview.patch)
        ? preview.patch as Record<string, unknown> : {};
      const clear = Array.isArray(preview.clear) ? preview.clear.map(text).filter(Boolean) : [];
      const fieldOverrides = preview.field_overrides && typeof preview.field_overrides === "object" && !Array.isArray(preview.field_overrides)
        ? preview.field_overrides as Record<string, FieldOverride> : {};
      const allowedColors = Array.isArray(colors.allowed_colors) ? colors.allowed_colors.map(text).filter(Boolean) : [];
      const next: Partial<SalesLine> = { ...overrides, ...patch, _context: context, _allowedColors: allowedColors, _overrides: fieldOverrides, _loading: false, _error: "" };
      for (const fieldname of clear) if (childFieldSet.has(fieldname)) next[fieldname] = undefined;
      if (changedField === "item_code") {
        const options = await loadSalesOptions(itemCode, text(context.item_group));
        if (previewSeq.current.get(key) !== seq) return;
        next._salesOptions = options;
        const selected = text(row.sales_option);
        if (!selected) {
          const defaultOption = options.find((option) => Boolean(option.is_default));
          if (defaultOption?.name) next.sales_option = String(defaultOption.name);
        }
      }
      patchLine(key, next);
      if (changedField === "item_code" && text(next.sales_option) && text(next.sales_option) !== text(row.sales_option)) {
        const latest = { ...row, ...next } as SalesLine;
        void previewLine(latest, "sales_option", { sales_option: text(next.sales_option) });
      }
    } catch (error) {
      if (previewSeq.current.get(key) !== seq) return;
      patchLine(key, { ...overrides, _loading: false, _error: adapter.mapError(error).message });
    }
  }, [adapter, childFieldSet, childFields, childMeta, customerGroup, header.company, header.currency, header.customer, header.selling_price_list, loadSalesOptions, meta, patchLine, services]);

  const refreshLine = useCallback((key: string, fieldname: string, patch: Partial<SalesLine> = {}) => {
    const current = lines.find((line) => line._key === key);
    if (!current) return;
    void previewLine(current, fieldname, patch);
  }, [lines, previewLine]);

  useEffect(() => {
    if (!meta || !childMeta) return;
    const timer = window.setTimeout(() => {
      for (const line of lines) if (text(line.item_code)) void previewLine(line, "parent_context");
    }, 120);
    return () => window.clearTimeout(timer);
    // parent commercial context only; line edits call preview directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.selling_price_list, header.currency, customerGroup]);

  const selectCustomer = useCallback(async (value: string, label: string) => {
    setHeader((current) => ({ ...current, customer: value }));
    setCustomerLabel(label);
    if (!value) { setCustomerGroup(""); return; }
    try {
      const raw = await adapter.getValue("Customer", { name: value }, "customer_group");
      setCustomerGroup(normalizeCustomerGroup(raw));
    } catch {
      setCustomerGroup("");
    }
  }, [adapter]);

  const selectItem = useCallback((line: SalesLine, value: string, label: string) => {
    const reset: Partial<SalesLine> = {
      item_code: value,
      _itemLabel: label,
      sales_option: undefined,
      color: undefined,
      uom: undefined,
      rate: undefined,
      amount: undefined,
      discount_amount: undefined,
      adjustment_amount: undefined,
      net_amount: undefined,
      _context: undefined,
      _salesOptions: [],
      _allowedColors: [],
      _overrides: {},
      _error: "",
    };
    patchLine(line._key, reset);
    if (value) void previewLine({ ...line, ...reset } as SalesLine, "item_code", reset);
  }, [patchLine, previewLine]);

  const setLineValue = useCallback((key: string, fieldname: string, value: unknown, commit = false) => {
    const patch = { [fieldname]: value } as Partial<SalesLine>;
    patchLine(key, patch);
    if (commit) refreshLine(key, fieldname, patch);
  }, [patchLine, refreshLine]);

  const duplicateLine = useCallback((line: SalesLine) => {
    const clone = { ...line, _key: newLine(lines.length)._key, _loading: false, _error: "" };
    setLines((current) => [...current, clone]);
  }, [lines.length]);

  const validate = useCallback((): string | null => {
    if (!meta || !childMeta) return "Chưa tải xong metadata đơn hàng.";
    const values: Record<string, unknown> = { ...header, items: lines };
    for (const field of meta.fields) {
      if (!field.reqd || LAYOUT_TYPES.has(field.fieldtype) || field.fieldtype === "Table") continue;
      if (values[field.fieldname] == null || values[field.fieldname] === "") return `Thiếu trường bắt buộc: ${field.label || field.fieldname}.`;
    }
    if (!text(header.customer)) return "Cần chọn khách hàng.";
    if (!lines.length || lines.every((line) => !text(line.item_code))) return "Đơn hàng phải có ít nhất một mặt hàng.";
    for (const [index, line] of lines.entries()) {
      if (!text(line.item_code)) return `Dòng ${index + 1}: cần chọn mặt hàng.`;
      if (line._loading) return `Dòng ${index + 1}: hệ thống đang tính lại.`;
      if (line._error) return `Dòng ${index + 1}: ${line._error}`;
      for (const [fieldname, rule] of Object.entries(line._overrides ?? {})) {
        if (!(rule.reqd === 1 || rule.reqd === true) || rule.hidden === 1 || rule.hidden === true) continue;
        if (line[fieldname] == null || line[fieldname] === "") return `Dòng ${index + 1}: thiếu ${text(rule.label).replace("\n", " ") || fieldname}.`;
      }
      if (isAreaDoor(line) && !["Đại lý", "Lẻ"].includes(customerGroup)) return `Dòng ${index + 1}: khách hàng phải được phân loại Đại lý hoặc Lẻ trước khi bán cửa.`;
    }
    return null;
  }, [childMeta, customerGroup, header, lines, meta]);

  const save = useCallback(async (previewAfterSave: boolean) => {
    const error = validate();
    if (error) { toast.error(error); return; }
    if (!meta || !childMeta) return;
    setSaving(true);
    try {
      const parentFields = new Set(meta.fields.map((field) => field.fieldname));
      const document: Record<string, unknown> = {};
      for (const [fieldname, value] of Object.entries(header)) if (parentFields.has(fieldname) && value !== undefined) document[fieldname] = value;
      if (parentFields.has("customer_group") && customerGroup) document.customer_group = customerGroup;
      const itemRows = lines.map((line) => {
        const row: Record<string, unknown> = {};
        for (const [fieldname, value] of Object.entries(line)) {
          if (fieldname.startsWith("_") || !childFieldSet.has(fieldname) || value === undefined) continue;
          row[fieldname] = value;
        }
        return row;
      });
      document.items = itemRows;
      const created = await adapter.createDoc("Sales Order", serializeCreateDocument(meta, document) as Partial<Doc>);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", "Sales Order"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list", "Sales Order"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "count", "Sales Order"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
      ]).catch(() => undefined);
      toast.success(`Đã tạo đơn ${created.name}`);
      if (previewAfterSave) props.onPreviewCreated(String(created.name));
      else props.onCreated(String(created.name));
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  }, [adapter, childFieldSet, childMeta, customerGroup, header, lines, meta, props, queryClient, scopeKey, validate]);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Đang mở màn bán hàng AlumDoor…</div>;
  if (fatal) return <div className="p-6 text-sm text-destructive">{fatal}</div>;
  if (!meta || !childMeta) return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc Sales Order.</div>;

  const grandTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const customerGroupWarning = text(header.customer) && customerGroup && !["Đại lý", "Lẻ"].includes(customerGroup);

  return (
    <div className="flex h-full min-h-0 flex-col" data-surface="alumdoor-sales-order-create">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1560px] space-y-4 p-4 lg:p-5">
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Thông tin đơn hàng</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Chỉ nhập thông tin bán. Giá, quy cách, UOM và công thức cửa được hỏi lại từ backend.</p>
              </div>
              {customerGroup ? <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-medium">Nhóm giá: {customerGroup}</span> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="xl:col-span-2">
                <Label required>Khách hàng</Label>
                <LinkPicker doctype="Customer" value={text(header.customer)} label={customerLabel} referenceDoctype="Sales Order" placeholder="Tìm tên hoặc mã khách hàng…" onChange={selectCustomer} />
              </div>
              <div>
                <Label>Bảng giá</Label>
                <LinkPicker
                  doctype="Price List"
                  value={text(header.selling_price_list)}
                  label={priceListLabel}
                  filters={{ selling: 1, enabled: 1 }}
                  referenceDoctype="Sales Order"
                  placeholder="Bảng giá bán"
                  onChange={(value, label) => { setHeader((current) => ({ ...current, selling_price_list: value })); setPriceListLabel(label); }}
                />
              </div>
              <div>
                <Label>Ngày đơn</Label>
                <Input type="date" value={text(header.transaction_date)} onChange={(event) => setHeader((current) => ({ ...current, transaction_date: event.target.value }))} />
              </div>
              <div>
                <Label>Ngày giao</Label>
                <Input type="date" value={text(header.delivery_date)} onChange={(event) => setHeader((current) => ({ ...current, delivery_date: event.target.value }))} />
              </div>
            </div>
            {customerGroupWarning ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">Khách này đang mang nhóm “{customerGroup}”. Luật cửa chỉ chấp nhận Đại lý hoặc Lẻ; hãy sửa phân loại khách trước khi lập đơn cửa.</div> : null}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">Hàng bán</h2>
                <p className="text-xs text-muted-foreground">Cửa hiện đúng ô cần nhập; hàng thường/ray/trục dùng cùng preview backend hiện có.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine(current.length)])}><Plus className="mr-1 size-4" />Thêm dòng</Button>
            </div>

            {lines.map((line, index) => {
              const kind = family(line);
              const areaDoor = isAreaDoor(line);
              const options = line._salesOptions ?? [];
              const colorOptions = line._allowedColors ?? [];
              const allowedUoms = Array.isArray(line._context?.allowed_uoms) ? line._context!.allowed_uoms!.map(text).filter(Boolean) : [];
              const qtyReadonly = overrideReadonly(line, "qty") || areaDoor;
              const widthVisible = areaDoor || overrideVisible(line, "width_m", false);
              const heightVisible = areaDoor || overrideVisible(line, "height_m", false);
              const setVisible = areaDoor || overrideVisible(line, "set_count", false);
              const lengthVisible = overrideVisible(line, "length_m", false) && (overrideRequired(line, "length_m") || line.length_m != null);
              const barsVisible = overrideVisible(line, "qty_bar", false) && (overrideRequired(line, "qty_bar") || line.qty_bar != null);
              const butterflyVisible = overrideVisible(line, "has_butterfly_bracket", false);
              return (
                <article key={line._key} className="rounded-xl border bg-card shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">{index + 1}</span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{line._itemLabel || text(line.item_code) || "Chọn mặt hàng"}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{text(line._context?.item_group) || "Chưa xác định nhóm"}{text(line._context?.availability_status) ? ` · ${text(line._context?.availability_status)}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {line._loading ? <Loader2 className="mr-2 size-4 animate-spin text-muted-foreground" /> : null}
                      <Button type="button" variant="ghost" size="icon" className="size-8" title="Nhân dòng" onClick={() => duplicateLine(line)}><Copy className="size-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8" title="Xoá dòng" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry._key !== line._key))}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                      <div className="md:col-span-2 xl:col-span-2">
                        <Label required>Mặt hàng</Label>
                        <LinkPicker
                          doctype="Item"
                          value={text(line.item_code)}
                          label={line._itemLabel}
                          filters={{ is_sales_item: 1, disabled: 0 }}
                          referenceDoctype="Sales Order"
                          placeholder="Tìm cửa, ray, trục, phụ kiện…"
                          onChange={(value, label) => selectItem(line, value, label)}
                        />
                      </div>

                      {options.length ? (
                        <div className="xl:col-span-2">
                          <Label>Phương án bán</Label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={text(line.sales_option)}
                            onChange={(event) => setLineValue(line._key, "sales_option", event.target.value || undefined, true)}
                          >
                            <option value="">— Giá / cách bán chuẩn —</option>
                            {options.map((option) => <option key={String(option.name)} value={String(option.name)}>{text(option.option_label) || String(option.name)}</option>)}
                          </select>
                        </div>
                      ) : null}

                      {colorOptions.length ? (
                        <div>
                          <Label>Màu</Label>
                          <SelectInput value={line.color} options={colorOptions} onChange={(value) => setLineValue(line._key, "color", value || undefined)} />
                        </div>
                      ) : null}

                      {allowedUoms.length > 1 ? (
                        <div>
                          <Label>ĐVT</Label>
                          <SelectInput value={line.uom} options={allowedUoms} onChange={(value) => setLineValue(line._key, "uom", value || undefined, true)} />
                        </div>
                      ) : text(line.uom) ? (
                        <div>
                          <Label>ĐVT</Label>
                          <Input value={text(line.uom)} readOnly className="bg-muted/30" />
                        </div>
                      ) : null}
                    </div>

                    {text(line.item_code) ? (
                      <div className="grid gap-3 rounded-lg border bg-muted/10 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                        {areaDoor && ["mesh", "taiwan", "super"].includes(kind) ? (
                          <div>
                            <Label>Cách bán</Label>
                            <SelectInput value={line.sales_mode || "Trọn bộ"} options={salesModes} onChange={(value) => setLineValue(line._key, "sales_mode", value || undefined, true)} />
                          </div>
                        ) : null}
                        {kind === "australian" ? (
                          <div>
                            <Label required>Kiểu kéo / motor</Label>
                            <SelectInput value={line.leaf_variant} options={leafVariants} onChange={(value) => setLineValue(line._key, "leaf_variant", value || undefined, true)} />
                          </div>
                        ) : null}
                        {widthVisible ? (
                          <div>
                            <Label required={areaDoor || overrideRequired(line, "width_m")}>{overrideLabel(line, "width_m", "Rộng (m)")}</Label>
                            <NumericInput min={0} value={line.width_m} onChange={(value) => setLineValue(line._key, "width_m", value)} onCommit={() => refreshLine(line._key, "width_m")} />
                          </div>
                        ) : null}
                        {heightVisible ? (
                          <div>
                            <Label required={areaDoor || overrideRequired(line, "height_m")}>{overrideLabel(line, "height_m", "Cao (m)")}</Label>
                            <NumericInput min={0} value={line.height_m} onChange={(value) => setLineValue(line._key, "height_m", value)} onCommit={() => refreshLine(line._key, "height_m")} />
                          </div>
                        ) : null}
                        {kind === "mesh" ? (
                          <div>
                            <Label>Cao lưới (m)</Label>
                            <NumericInput min={0} value={line.mesh_height_m} onChange={(value) => setLineValue(line._key, "mesh_height_m", value)} onCommit={() => refreshLine(line._key, "mesh_height_m")} />
                          </div>
                        ) : null}
                        {setVisible ? (
                          <div>
                            <Label required={areaDoor || overrideRequired(line, "set_count")}>{overrideLabel(line, "set_count", areaDoor ? "Số bộ" : "Số lượng")}</Label>
                            <NumericInput min={1} step={1} value={line.set_count} onChange={(value) => setLineValue(line._key, "set_count", value)} onCommit={() => refreshLine(line._key, "set_count")} />
                          </div>
                        ) : null}
                        {butterflyVisible ? (
                          <label className="flex min-h-14 items-center gap-2 self-end rounded-md border bg-background px-3 text-sm">
                            <input type="checkbox" checked={Boolean(line.has_butterfly_bracket)} onChange={(event) => setLineValue(line._key, "has_butterfly_bracket", event.target.checked ? 1 : 0, true)} /> Có bản bướm
                          </label>
                        ) : null}
                        {lengthVisible ? (
                          <div>
                            <Label required={overrideRequired(line, "length_m")}>{overrideLabel(line, "length_m", "Dài một cây/đoạn (m)")}</Label>
                            <NumericInput min={0} value={line.length_m} onChange={(value) => setLineValue(line._key, "length_m", value)} onCommit={() => refreshLine(line._key, "length_m")} />
                          </div>
                        ) : null}
                        {barsVisible ? (
                          <div>
                            <Label required={overrideRequired(line, "qty_bar")}>{overrideLabel(line, "qty_bar", "Số cây/đoạn")}</Label>
                            <NumericInput min={1} step={1} value={line.qty_bar} onChange={(value) => setLineValue(line._key, "qty_bar", value)} onCommit={() => refreshLine(line._key, "qty_bar")} />
                          </div>
                        ) : null}
                        {!areaDoor && !setVisible && !barsVisible ? (
                          <div>
                            <Label required>Khối lượng</Label>
                            <NumericInput min={0} value={line.qty} disabled={qtyReadonly} onChange={(value) => setLineValue(line._key, "qty", value)} onCommit={() => refreshLine(line._key, "qty")} />
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {line._error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{line._error}</div> : null}
                    {line._context?.price_missing ? <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{text(line._context.price_error) || "Chưa khai đơn giá phù hợp."}</div> : null}

                    {text(line.item_code) ? (
                      <div className="grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div><div className="text-[11px] text-muted-foreground">SL tính tiền</div><div className="font-semibold">{Number.isFinite(Number(line.qty)) ? Number(line.qty).toLocaleString("vi-VN", { maximumFractionDigits: 6 }) : "—"} {text(line.uom)}</div></div>
                        <div><div className="text-[11px] text-muted-foreground">Đơn giá bảng</div><div className="font-semibold">{money(line.rate)} ₫</div></div>
                        <div><div className="text-[11px] text-muted-foreground">Chiết khấu</div><div className="font-semibold text-emerald-700 dark:text-emerald-400">-{money(line.discount_amount)} ₫{Number(line.discount_percentage) ? ` (${Number(line.discount_percentage)}%)` : ""}</div></div>
                        <div><div className="text-[11px] text-muted-foreground">Phụ thu</div><div className="font-semibold">+{money(line.adjustment_amount)} ₫</div></div>
                        <div><div className="text-[11px] text-muted-foreground">Tạm tính dòng</div><div className="text-base font-bold">{money(lineTotal(line))} ₫</div></div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground">Tạm tính theo preview backend</div>
              <div className="text-xl font-bold tabular-nums">{money(grandTotal)} ₫</div>
            </div>
            <div className="hidden max-w-md text-xs text-muted-foreground md:block">Server vẫn tính lại Pricing Rule, công thức cửa, UOM và tiền khi lưu; client không phải nguồn sự thật.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" onClick={props.onCancel}>Huỷ</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => { for (const line of lines) if (text(line.item_code)) void previewLine(line, "manual_refresh"); }}><RefreshCw className="mr-1 size-4" />Tính lại</Button>
            <Button type="button" variant="outline" disabled={saving || !canCreate} onClick={() => void save(true)}><Eye className="mr-1 size-4" />Lưu & xem thử</Button>
            <Button type="button" disabled={saving || !canCreate} onClick={() => void save(false)}>{saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}Lưu đơn hàng</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
