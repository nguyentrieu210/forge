/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  applyContextPolicy,
  linkDisplay,
  mapError,
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

type Json = Record<string, unknown>;
type FieldOverride = {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
};
type ItemContext = Json & {
  item_group?: string;
  door_type?: string | null;
  inventory_mode?: string;
  allowed_uoms?: string[];
  price_missing?: boolean;
  price_error?: string | null;
  availability_status?: string;
};

interface SalesLine extends Json {
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
}

const LAYOUT_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "Heading", "HTML", "Button"]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi");
}

function today(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultValue(field: DocField): unknown {
  if (field.default == null || field.default === "") return undefined;
  if (field.default === "Today" && field.fieldtype === "Date") return today();
  if (field.default === "Now" && field.fieldtype === "Datetime") {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  return field.default;
}

function blankFromMeta(meta: DocTypeMeta): Json {
  const values: Json = {};
  for (const field of meta.fields ?? []) {
    const value = defaultValue(field);
    if (value !== undefined) values[field.fieldname] = value;
  }
  return values;
}

function optionList(meta: DocTypeMeta | null, fieldname: string, fallback: string[]): string[] {
  const values = text(meta?.fields.find((field) => field.fieldname === fieldname)?.options)
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : fallback;
}

function numeric(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function money(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
    : "—";
}

function openLinkedCreate(doctype: string) {
  const route = `/list/${encodeURIComponent(doctype)}/new`;
  window.open(route, "_blank", "noopener,noreferrer");
}

function newLine(index: number): SalesLine {
  return {
    _key: `sales-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    qty: 1,
    set_count: 1,
  };
}

function lineTotal(line: SalesLine): number {
  const net = Number(line.net_amount);
  if (Number.isFinite(net)) return net;
  const gross = Number(line.amount);
  if (!Number.isFinite(gross)) return 0;
  return gross - Math.max(0, Number(line.discount_amount) || 0) + (Number(line.adjustment_amount) || 0);
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

function fieldVisible(line: SalesLine, fieldname: string, fallback = false): boolean {
  const hidden = line._overrides?.[fieldname]?.hidden;
  return hidden == null ? fallback : !(hidden === 1 || hidden === true);
}

function fieldRequired(line: SalesLine, fieldname: string): boolean {
  const value = line._overrides?.[fieldname]?.reqd;
  return value === 1 || value === true;
}

function fieldReadonly(line: SalesLine, fieldname: string): boolean {
  const value = line._overrides?.[fieldname]?.read_only;
  return value === 1 || value === true;
}

function fieldLabel(line: SalesLine, fieldname: string, fallback: string): string {
  return text(line._overrides?.[fieldname]?.label).replace("\n", " ") || fallback;
}

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <div className="mb-1 text-xs font-medium text-muted-foreground">
      {children}
      {required ? <span className="ml-1 text-destructive">*</span> : null}
    </div>
  );
}

function LinkPicker(props: {
  doctype: string;
  value?: string;
  label?: string;
  placeholder?: string;
  filters?: Record<string, unknown>;
  referenceDoctype?: string;
  onChange: (value: string, label: string) => void;
}) {
  const { adapter } = useMetaForge();
  const [query, setQuery] = useState(props.label || props.value || "");
  const [rows, setRows] = useState<LinkResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => setQuery(props.label || props.value || ""), [props.label, props.value]);

  const search = useCallback(async (value: string) => {
    const current = ++seq.current;
    setLoading(true);
    try {
      const result = await adapter.searchLink(props.doctype, value, {
        filters: props.filters,
        referenceDoctype: props.referenceDoctype,
        pageLength: 20,
      });
      if (seq.current === current) setRows(result);
    } catch {
      if (seq.current === current) setRows([]);
    } finally {
      if (seq.current === current) setLoading(false);
    }
  }, [adapter, props.doctype, props.filters, props.referenceDoctype]);

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={props.placeholder}
        onFocus={() => {
          setOpen(true);
          void search(query);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (props.value) props.onChange("", next);
          setOpen(true);
          void search(next);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-xl">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Đang tìm…
            </div>
          ) : null}
          {!loading && !rows.length ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Không có kết quả</div>
          ) : null}
          {rows.map((row) => {
            const display = linkDisplay(row);
            return (
              <button
                key={row.value}
                type="button"
                className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(display.primary);
                  props.onChange(row.value, display.primary);
                  setOpen(false);
                }}
              >
                <span className="text-sm font-medium">{display.primary}</span>
                {display.secondary ? (
                  <span className="text-[11px] text-muted-foreground">{display.secondary}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SelectBox(props: {
  value?: unknown;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={text(props.value)}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">— Chọn —</option>
      {props.options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function NumberBox(props: {
  value?: unknown;
  disabled?: boolean;
  step?: number;
  min?: number;
  onChange: (value?: number) => void;
  onCommit?: () => void;
}) {
  return (
    <Input
      type="number"
      value={props.value == null ? "" : String(props.value)}
      disabled={props.disabled}
      step={props.step ?? 0.001}
      min={props.min ?? 0}
      onChange={(event) => props.onChange(numeric(event.target.value))}
      onBlur={() => props.onCommit?.()}
      onKeyDown={(event) => {
        if (event.key === "Enter") props.onCommit?.();
      }}
    />
  );
}

export function AlumdoorSalesOrderCreate(props: AlumdoorSalesOrderCreateProps) {
  const { adapter, scopeKey, businessContext, contextPolicies } = useMetaForge();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const [customerLabel, setCustomerLabel] = useState("");
  const [employeeLabel, setEmployeeLabel] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lines, setLines] = useState<SalesLine[]>([newLine(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [fatal, setFatal] = useState("");
  const closeSeen = useRef(props.closeRequest ?? 0);
  const lineSeq = useRef(new Map<string, number>());

  const childFields = useMemo(
    () => childMeta?.fields.map((field) => field.fieldname).filter(Boolean) ?? [],
    [childMeta],
  );
  const childFieldSet = useMemo(() => new Set(childFields), [childFields]);
  const salesPhoneField = useMemo(() => {
    const candidates = ["customer_phone", "contact_phone", "contact_mobile", "mobile_no", "phone_no", "phone"];
    return candidates.find((name) => meta?.fields.some((field) => field.fieldname === name));
  }, [meta]);
  const salesModes = useMemo(
    () => optionList(childMeta, "sales_mode", ["Tách món", "Trọn bộ"]),
    [childMeta],
  );
  const leafVariants = useMemo(
    () => optionList(childMeta, "leaf_variant", ["Kéo tay", "Motor ngoài", "Motor trong"]),
    [childMeta],
  );

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    props.onCancel();
  }, [props.closeRequest, props.onCancel]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const salesMeta = await adapter.getMeta("Sales Order");
        const table = salesMeta.fields.find(
          (field) => field.fieldname === "items" && field.fieldtype === "Table",
        );
        const childDoctype = text(table?.options) || "Sales Order Item";
        const [itemMeta, boot, caps] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Sales Order"),
        ]);
        if (!active) return;
        const defaults: Json = {
          ...blankFromMeta(salesMeta),
          ...applyContextPolicy("Sales Order", businessContext, contextPolicies).defaults,
        };
        if (!defaults.transaction_date) defaults.transaction_date = today();
        if (!defaults.delivery_date) defaults.delivery_date = today();
        if (!defaults.currency) defaults.currency = boot.sysdefaults.currency || "VND";
        setMeta(salesMeta);
        setChildMeta(itemMeta);
        setCanCreate(Boolean(caps.create));
        setHeader(defaults);
        setEmployeeLabel(text(defaults.responsible_person));
      } catch (error) {
        if (active) setFatal(mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adapter, businessContext, contextPolicies]);

  useEffect(() => {
    const customerName = text(header.customer);
    if (!customerName) {
      setCustomerPhone("");
      return;
    }
    let active = true;
    void adapter.getDoc("Customer", customerName)
      .then((result) => {
        if (!active) return;
        const customer = result.doc as Json;
        const phone = [
          customer.phone,
          customer.mobile_no,
          customer.mobile,
          customer.phone_no,
          customer.contact_phone,
          customer.contact_mobile,
        ].map(text).find(Boolean) ?? "";
        setCustomerPhone(phone);
        if (salesPhoneField && phone) {
          setHeader((current) => ({ ...current, [salesPhoneField]: phone }));
        }
      })
      .catch(() => {
        if (active) setCustomerPhone("");
      });
    return () => {
      active = false;
    };
  }, [adapter, header.customer, salesPhoneField]);

  const cleanLine = useCallback((line: SalesLine): Json => {
    const result: Json = {};
    for (const [key, value] of Object.entries(line)) {
      if (!key.startsWith("_") && childFieldSet.has(key) && value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }, [childFieldSet]);

  const patchLine = useCallback((key: string, patch: Partial<SalesLine>) => {
    setLines((current) => current.map((line) => (
      line._key === key ? { ...line, ...patch } : line
    )));
  }, []);

  const previewDocument = useCallback(async (
    next: Json,
    changedField: string,
    currentLines = lines,
  ): Promise<Json> => {
    const result = await adapter.callPost<Json>("alumdoor.ui.preview_document", {
      doctype: "Sales Order",
      doc: { ...next, items: currentLines.map(cleanLine) },
      changed_field: changedField,
    });
    const patch = result.patch && typeof result.patch === "object" && !Array.isArray(result.patch)
      ? result.patch as Json
      : {};
    const merged = { ...next, ...patch };
    for (const field of Array.isArray(result.clear) ? result.clear.map(text) : []) {
      delete merged[field];
    }
    return merged;
  }, [adapter, cleanLine, lines]);

  const setHeaderField = useCallback((field: string, value: unknown, preview = false) => {
    const next = { ...header, [field]: value };
    setHeader(next);
    if (!preview) return;
    void previewDocument(next, field)
      .then((resolved) => {
        setHeader(resolved);
        if (field === "customer") {
          setEmployeeLabel(text(resolved.responsible_person));
        }
      })
      .catch((error) => toast.error(mapError(error).message));
  }, [header, previewDocument]);

  const loadSalesOptions = useCallback(async (itemCode: string, itemGroup: string): Promise<Doc[]> => {
    if (!itemGroup) return [];
    try {
      const rows = await adapter.getList("Sales Option", {
        fields: [
          "name",
          "option_label",
          "item_group",
          "item_code",
          "is_default",
          "disabled",
          "sales_mode",
          "price_variant",
          "sales_package",
        ],
        filters: { item_group: itemGroup, disabled: 0 },
        pageLength: 100,
      });
      return rows.filter((row) => !text(row.item_code) || text(row.item_code) === itemCode);
    } catch {
      return [];
    }
  }, [adapter]);

  const previewLine = useCallback(async (
    source: SalesLine,
    changedField: string,
    patch: Partial<SalesLine> = {},
  ) => {
    if (!childMeta) return;
    const row = { ...source, ...patch } as SalesLine;
    if (!text(row.item_code)) return;
    const seq = (lineSeq.current.get(row._key) ?? 0) + 1;
    lineSeq.current.set(row._key, seq);
    patchLine(row._key, { ...patch, _loading: true, _error: "" });
    try {
      const parent = { ...header, items: undefined };
      const colorsPromise: Promise<Json> = adapter
        .callPost<Json>("alumdoor.catalog.allowed_colors", {
          item_code: row.item_code,
          usage_scope: "sales",
        })
        .catch((): Json => ({}));
      const [context, preview, colors] = await Promise.all([
        adapter.callPost<ItemContext>("alumdoor.sales.item_context", {
          item_code: row.item_code,
          uom: row.uom,
          warehouse: row.warehouse,
          price_list: header.selling_price_list,
          currency: header.currency || "VND",
          qty: row.qty,
          sales_option: row.sales_option,
        }),
        adapter.callPost<Json>("alumdoor.ui.preview_child_row", {
          child_doctype: childMeta.name,
          child_fields: childFields,
          row,
          parent,
          changed_field: changedField,
        }),
        colorsPromise,
      ]);
      if (lineSeq.current.get(row._key) !== seq) return;
      const serverPatch = preview.patch && typeof preview.patch === "object" && !Array.isArray(preview.patch)
        ? preview.patch as Json
        : {};
      const overrides = preview.field_overrides
        && typeof preview.field_overrides === "object"
        && !Array.isArray(preview.field_overrides)
        ? preview.field_overrides as Record<string, FieldOverride>
        : {};
      const allowedColors = Array.isArray(colors.allowed_colors)
        ? colors.allowed_colors.map(text).filter(Boolean)
        : [];
      const next: Partial<SalesLine> = {
        ...patch,
        ...serverPatch,
        _context: context,
        _allowedColors: allowedColors,
        _overrides: overrides,
        _loading: false,
        _error: "",
      };
      for (const field of Array.isArray(preview.clear) ? preview.clear.map(text) : []) {
        if (childFieldSet.has(field)) next[field] = undefined;
      }
      if (changedField === "item_code") {
        const options = await loadSalesOptions(text(row.item_code), text(context.item_group));
        if (lineSeq.current.get(row._key) !== seq) return;
        next._salesOptions = options;
        if (!text(row.sales_option)) {
          const defaultOption = options.find(
            (candidate) => candidate.is_default === true || candidate.is_default === 1,
          );
          if (defaultOption?.name) next.sales_option = String(defaultOption.name);
        }
      }
      patchLine(row._key, next);
      if (
        changedField === "item_code"
        && text(next.sales_option)
        && text(next.sales_option) !== text(row.sales_option)
      ) {
        void previewLine(
          { ...row, ...next } as SalesLine,
          "sales_option",
          { sales_option: next.sales_option },
        );
      }
    } catch (error) {
      if (lineSeq.current.get(row._key) === seq) {
        patchLine(row._key, {
          ...patch,
          _loading: false,
          _error: mapError(error).message,
        });
      }
    }
  }, [adapter, childFieldSet, childFields, childMeta, header, loadSalesOptions, patchLine]);

  const commitLine = useCallback((key: string, field: string, value: unknown) => {
    const current = lines.find((line) => line._key === key);
    if (!current) return;
    patchLine(key, { [field]: value });
    void previewLine(current, field, { [field]: value });
  }, [lines, patchLine, previewLine]);

  useEffect(() => {
    if (!childMeta) return;
    const timer = window.setTimeout(() => {
      for (const line of lines) {
        if (text(line.item_code)) void previewLine(line, "parent_context");
      }
    }, 120);
    return () => window.clearTimeout(timer);
    // Re-preview only when commercial parent context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.customer_group, header.selling_price_list, header.currency]);

  const validate = useCallback((): string | null => {
    if (!meta || !childMeta) return "Chưa tải xong cấu trúc Sales Order.";
    for (const field of meta.fields) {
      if (!field.reqd || LAYOUT_TYPES.has(field.fieldtype) || field.fieldtype === "Table") continue;
      if (header[field.fieldname] == null || header[field.fieldname] === "") {
        return `Thiếu ${field.label || field.fieldname}.`;
      }
    }
    if (!text(header.customer)) return "Cần chọn khách hàng.";
    if (!lines.length) return "Đơn hàng phải có ít nhất một dòng.";
    for (const [index, line] of lines.entries()) {
      if (!text(line.item_code)) return `Dòng ${index + 1}: cần chọn mặt hàng.`;
      if (line._loading) return `Dòng ${index + 1}: đang tính lại.`;
      if (line._error) return `Dòng ${index + 1}: ${line._error}`;
      for (const [field, rule] of Object.entries(line._overrides ?? {})) {
        if (!(rule.reqd === 1 || rule.reqd === true)) continue;
        if (rule.hidden === 1 || rule.hidden === true) continue;
        if (line[field] == null || line[field] === "") {
          return `Dòng ${index + 1}: thiếu ${text(rule.label).replace("\n", " ") || field}.`;
        }
      }
      if (isAreaDoor(line) && !["Đại lý", "Lẻ"].includes(text(header.customer_group))) {
        return `Dòng ${index + 1}: khách hàng chưa có nhóm giá Đại lý/Lẻ hợp lệ.`;
      }
    }
    return null;
  }, [childMeta, header, lines, meta]);

  const save = useCallback(async (previewAfterSave: boolean) => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    if (!meta) return;
    setSaving(true);
    try {
      const parentFields = new Set(meta.fields.map((field) => field.fieldname));
      const document: Json = {};
      for (const [field, value] of Object.entries(header)) {
        if (parentFields.has(field) && value !== undefined) document[field] = value;
      }
      document.items = lines.map(cleanLine);
      const finalPreview = await previewDocument(document, "items", lines);
      const created = await adapter.createDoc(
        "Sales Order",
        serializeCreateDocument(meta, finalPreview) as Partial<Doc>,
      );
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "list-view", "Sales Order"],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "list", "Sales Order"],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "count", "Sales Order"],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: [scopeKey, "overview"],
          refetchType: "none",
        }),
      ]).catch(() => undefined);
      toast.success(`Đã tạo đơn ${created.name}`);
      if (previewAfterSave) props.onPreviewCreated(String(created.name));
      else props.onCreated(String(created.name));
    } catch (cause) {
      toast.error(mapError(cause).message);
    } finally {
      setSaving(false);
    }
  }, [adapter, cleanLine, header, lines, meta, previewDocument, props, queryClient, scopeKey, validate]);

  if (loading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Đang mở màn bán hàng AlumDoor…
        </span>
      </div>
    );
  }
  if (fatal) return <div className="p-6 text-sm text-destructive">{fatal}</div>;
  if (!meta || !childMeta) {
    return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc đơn hàng.</div>;
  }

  const metaField = (fieldname: string) => meta.fields.find((field) => field.fieldname === fieldname);
  const metaLabel = (fieldname: string, fallback: string) => text(metaField(fieldname)?.label) || fallback;
  const metaRequired = (fieldname: string) => Boolean(metaField(fieldname)?.reqd);
  const phoneValue = salesPhoneField ? text(header[salesPhoneField]) || customerPhone : customerPhone;

  const parentTotal = Number(header.grand_total);
  const displayedTotal = Number.isFinite(parentTotal) && parentTotal > 0
    ? parentTotal
    : lines.reduce((sum, line) => sum + lineTotal(line), 0);

  return (
    <div className="flex h-full min-h-0 flex-col" data-surface="alumdoor-sales-order-create">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1560px] space-y-4 p-4 lg:p-5">
          <section className="rounded-xl border bg-card px-4 py-3 shadow-sm" data-section="sales-customer-meta-header">
            <div className="mb-3">
              <h2 className="text-base font-semibold">Thông tin khách hàng</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
              <div className="xl:col-span-4">
                <Label required={metaRequired("customer")}>{metaLabel("customer", "Khách hàng")}</Label>
                <div className="flex gap-1.5">
                  <div className="min-w-0 flex-1">
                    <LinkPicker
                      doctype={text(metaField("customer")?.options) || "Customer"}
                      value={text(header.customer)}
                      label={customerLabel}
                      referenceDoctype="Sales Order"
                      placeholder="Tìm tên, mã hoặc SĐT khách hàng…"
                      onChange={(value, shown) => {
                        setCustomerLabel(shown);
                        setHeaderField("customer", value || undefined, true);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    title="Thêm khách hàng"
                    onClick={() => openLinkedCreate("Customer")}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="xl:col-span-2">
                <Label>SĐT</Label>
                <Input
                  value={phoneValue}
                  placeholder="Số điện thoại"
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomerPhone(value);
                    if (salesPhoneField) setHeaderField(salesPhoneField, value || undefined);
                  }}
                  readOnly={!salesPhoneField}
                  className={!salesPhoneField ? "bg-muted/20" : undefined}
                />
              </div>

              <div className="md:col-span-2 xl:col-span-6">
                <Label required={metaRequired("install_address")}>{metaLabel("install_address", "Địa chỉ")}</Label>
                <Input
                  value={text(header.install_address)}
                  placeholder="Địa chỉ giao / lắp đặt"
                  onChange={(event) => setHeaderField("install_address", event.target.value || undefined)}
                />
              </div>

              <div className="xl:col-span-2">
                <Label required={metaRequired("transaction_date")}>Ngày đặt hàng</Label>
                <Input
                  type="date"
                  value={text(header.transaction_date)}
                  onChange={(event) => setHeaderField("transaction_date", event.target.value, true)}
                />
              </div>

              <div className="xl:col-span-2">
                <Label required={metaRequired("delivery_date")}>{metaLabel("delivery_date", "Ngày giao hàng")}</Label>
                <Input
                  type="date"
                  value={text(header.delivery_date)}
                  onChange={(event) => setHeaderField("delivery_date", event.target.value)}
                />
              </div>

              <div className="md:col-span-2 xl:col-span-4">
                <Label required={metaRequired("responsible_person")}>Nhân viên bán hàng phụ trách</Label>
                <div className="flex gap-1.5">
                  <div className="min-w-0 flex-1">
                    <LinkPicker
                      doctype={text(metaField("responsible_person")?.options) || "Employee"}
                      value={text(header.responsible_person)}
                      label={employeeLabel || text(header.responsible_person)}
                      referenceDoctype="Sales Order"
                      placeholder="Chọn nhân viên bán hàng…"
                      onChange={(value, shown) => {
                        setEmployeeLabel(shown);
                        setHeaderField("responsible_person", value || undefined);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    title="Thêm nhân viên"
                    onClick={() => openLinkedCreate("Employee")}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-2" data-section="hardcoded-sales-lines">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Chi tiết bán hàng</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((current) => [...current, newLine(current.length)])}
              >
                <Plus className="mr-1 size-4" /> Thêm sản phẩm
              </Button>
            </div>

            {lines.map((line, index) => {
              const kind = family(line);
              const area = isAreaDoor(line);
              const uoms = Array.isArray(line._context?.allowed_uoms)
                ? line._context.allowed_uoms.map(text).filter(Boolean)
                : [];
              const colors = line._allowedColors ?? [];
              const salesOptions = line._salesOptions ?? [];
              const showSalesMode = area && fieldVisible(
                line,
                "sales_mode",
                ["australian", "mesh", "taiwan", "super"].includes(kind),
              );
              const showLeafVariant = fieldVisible(line, "leaf_variant", kind === "australian");
              const showWidth = area || fieldVisible(line, "width_m");
              const showHeight = area || fieldVisible(line, "height_m");
              const showSets = area || fieldVisible(line, "set_count");
              const showLength = fieldVisible(line, "length_m")
                && (fieldRequired(line, "length_m") || line.length_m != null);
              const showBars = fieldVisible(line, "qty_bar")
                && (fieldRequired(line, "qty_bar") || line.qty_bar != null);

              return (
                <article key={line._key} className="overflow-hidden rounded-lg border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/15 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {line._itemLabel || text(line.item_code) || "Chọn mặt hàng"}
                        </div>
                        {text(line._context?.availability_status) ? (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {text(line._context?.availability_status)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {line._loading ? <Loader2 className="mr-1 size-4 animate-spin text-muted-foreground" /> : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Nhân dòng"
                        onClick={() => setLines((current) => [
                          ...current,
                          { ...line, _key: newLine(current.length)._key, _loading: false, _error: "" },
                        ])}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Xoá dòng"
                        disabled={lines.length === 1}
                        onClick={() => setLines((current) => current.filter((entry) => entry._key !== line._key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2.5 p-3">
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
                          onChange={(value, shown) => {
                            const reset: Partial<SalesLine> = {
                              item_code: value || undefined,
                              _itemLabel: shown,
                              sales_option: undefined,
                              _context: undefined,
                              _salesOptions: [],
                              _allowedColors: [],
                              _overrides: {},
                              _error: "",
                            };
                            patchLine(line._key, reset);
                            if (value) {
                              void previewLine(
                                { ...line, ...reset } as SalesLine,
                                "item_code",
                                reset,
                              );
                            }
                          }}
                        />
                      </div>

                      {salesOptions.length ? (
                        <div className="xl:col-span-2">
                          <Label>Phương án bán</Label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={text(line.sales_option)}
                            onChange={(event) => commitLine(
                              line._key,
                              "sales_option",
                              event.target.value || undefined,
                            )}
                          >
                            <option value="">— Giá / cách bán chuẩn —</option>
                            {salesOptions.map((option) => (
                              <option key={String(option.name)} value={String(option.name)}>
                                {text(option.option_label) || String(option.name)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {colors.length ? (
                        <div>
                          <Label>Màu</Label>
                          <SelectBox
                            value={line.color}
                            options={colors}
                            onChange={(value) => patchLine(line._key, { color: value || undefined })}
                          />
                        </div>
                      ) : null}

                      {uoms.length > 1 ? (
                        <div>
                          <Label>ĐVT</Label>
                          <SelectBox
                            value={line.uom}
                            options={uoms}
                            onChange={(value) => commitLine(line._key, "uom", value || undefined)}
                          />
                        </div>
                      ) : text(line.uom) ? (
                        <div>
                          <Label>ĐVT</Label>
                          <Input value={text(line.uom)} readOnly className="bg-muted/30" />
                        </div>
                      ) : null}
                    </div>

                    {text(line.item_code) ? (
                      <div className="grid gap-2.5 rounded-md bg-muted/10 p-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                        {showSalesMode ? (
                          <div>
                            <Label>Cách bán</Label>
                            <SelectBox
                              value={line.sales_mode || "Trọn bộ"}
                              options={salesModes}
                              onChange={(value) => commitLine(line._key, "sales_mode", value || undefined)}
                            />
                          </div>
                        ) : null}

                        {showLeafVariant ? (
                          <div>
                            <Label>Kiểu kéo / motor</Label>
                            <SelectBox
                              value={line.leaf_variant}
                              options={leafVariants}
                              onChange={(value) => commitLine(line._key, "leaf_variant", value || undefined)}
                            />
                          </div>
                        ) : null}

                        {showWidth ? (
                          <div>
                            <Label required={area || fieldRequired(line, "width_m")}>
                              {fieldLabel(line, "width_m", "Rộng (m)")}
                            </Label>
                            <NumberBox
                              value={line.width_m}
                              onChange={(value) => patchLine(line._key, { width_m: value })}
                              onCommit={() => commitLine(line._key, "width_m", line.width_m)}
                            />
                          </div>
                        ) : null}

                        {showHeight ? (
                          <div>
                            <Label required={area || fieldRequired(line, "height_m")}>
                              {fieldLabel(line, "height_m", "Cao (m)")}
                            </Label>
                            <NumberBox
                              value={line.height_m}
                              onChange={(value) => patchLine(line._key, { height_m: value })}
                              onCommit={() => commitLine(line._key, "height_m", line.height_m)}
                            />
                          </div>
                        ) : null}

                        {kind === "mesh" ? (
                          <div>
                            <Label>Cao lưới (m)</Label>
                            <NumberBox
                              value={line.mesh_height_m}
                              onChange={(value) => patchLine(line._key, { mesh_height_m: value })}
                              onCommit={() => commitLine(line._key, "mesh_height_m", line.mesh_height_m)}
                            />
                          </div>
                        ) : null}

                        {showSets ? (
                          <div>
                            <Label required={area || fieldRequired(line, "set_count")}>
                              {fieldLabel(line, "set_count", area ? "Số bộ" : "Số lượng")}
                            </Label>
                            <NumberBox
                              value={line.set_count}
                              min={1}
                              step={1}
                              onChange={(value) => patchLine(line._key, { set_count: value })}
                              onCommit={() => commitLine(line._key, "set_count", line.set_count)}
                            />
                          </div>
                        ) : null}

                        {fieldVisible(line, "has_butterfly_bracket") ? (
                          <label className="flex min-h-14 items-center gap-2 self-end rounded-md border bg-background px-3 text-sm">
                            <input
                              type="checkbox"
                              checked={Boolean(line.has_butterfly_bracket)}
                              onChange={(event) => commitLine(
                                line._key,
                                "has_butterfly_bracket",
                                event.target.checked ? 1 : 0,
                              )}
                            />
                            Có bản bướm
                          </label>
                        ) : null}

                        {showLength ? (
                          <div>
                            <Label required={fieldRequired(line, "length_m")}>
                              {fieldLabel(line, "length_m", "Dài một cây/đoạn (m)")}
                            </Label>
                            <NumberBox
                              value={line.length_m}
                              onChange={(value) => patchLine(line._key, { length_m: value })}
                              onCommit={() => commitLine(line._key, "length_m", line.length_m)}
                            />
                          </div>
                        ) : null}

                        {showBars ? (
                          <div>
                            <Label required={fieldRequired(line, "qty_bar")}>
                              {fieldLabel(line, "qty_bar", "Số cây/đoạn")}
                            </Label>
                            <NumberBox
                              value={line.qty_bar}
                              min={1}
                              step={1}
                              onChange={(value) => patchLine(line._key, { qty_bar: value })}
                              onCommit={() => commitLine(line._key, "qty_bar", line.qty_bar)}
                            />
                          </div>
                        ) : null}

                        {!area && !showSets && !showBars ? (
                          <div>
                            <Label required>Khối lượng</Label>
                            <NumberBox
                              value={line.qty}
                              disabled={fieldReadonly(line, "qty")}
                              onChange={(value) => patchLine(line._key, { qty: value })}
                              onCommit={() => commitLine(line._key, "qty", line.qty)}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {line._error ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {line._error}
                      </div>
                    ) : null}
                    {line._context?.price_missing ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        {text(line._context.price_error) || "Chưa khai đơn giá phù hợp."}
                      </div>
                    ) : null}

                    {text(line.item_code) ? (
                      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t pt-2 text-xs tabular-nums">
                        <span className="text-muted-foreground">
                          {Number.isFinite(Number(line.qty)) ? Number(line.qty).toLocaleString("vi-VN", { maximumFractionDigits: 6 }) : "—"} {text(line.uom)}
                        </span>
                        <span>ĐG <strong>{money(line.rate)} ₫</strong></span>
                        {Number(line.discount_amount) > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400">CK -{money(line.discount_amount)} ₫</span>
                        ) : null}
                        {Number(line.adjustment_amount) !== 0 ? (
                          <span>Phụ thu +{money(line.adjustment_amount)} ₫</span>
                        ) : null}
                        <span className="text-sm font-semibold">Thành tiền <strong className="text-base">{money(lineTotal(line))} ₫</strong></span>
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
          <div>
            <div className="text-[11px] text-muted-foreground">Tạm tính theo backend preview</div>
            <div className="text-xl font-bold tabular-nums">{money(displayedTotal)} ₫</div>
            <div className="text-xs text-muted-foreground">
              Khi lưu, Sales controller vẫn tính lại giá, chiết khấu, phụ thu, UOM và công thức cửa.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={props.onCancel}>Huỷ</Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                for (const line of lines) {
                  if (text(line.item_code)) void previewLine(line, "manual_refresh");
                }
              }}
            >
              <RefreshCw className="mr-1 size-4" /> Tính lại
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving || !canCreate}
              onClick={() => void save(true)}
            >
              <Eye className="mr-1 size-4" /> Lưu & xem thử
            </Button>
            <Button
              type="button"
              disabled={saving || !canCreate}
              onClick={() => void save(false)}
            >
              {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
              Lưu đơn hàng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
