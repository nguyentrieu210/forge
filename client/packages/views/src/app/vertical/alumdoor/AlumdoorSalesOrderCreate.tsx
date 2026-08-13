/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  applyContextPolicy,
  mapError,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { Button, toast } from "@metaforge/ui";
import { useMetaForge } from "../../../container/provider.js";
import { AlumdoorSalesLinesGrid, type SalesGridRow } from "./AlumdoorSalesLinesGrid.js";

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
  selected_uom?: string;
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
  _pricingError?: string;
  _commercial?: Json;
  _itemPrices?: Doc[];
  _selectedItemPrice?: string;
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

function commercialNormalized(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
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

function money(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
    : "—";
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

function fallbackField(
  fieldname: string,
  label: string,
  fieldtype: DocField["fieldtype"] = "Data",
  options?: string,
): DocField {
  return { fieldname, label, fieldtype, ...(options ? { options } : {}) } as DocField;
}

function selectField(
  base: DocField | undefined,
  fieldname: string,
  label: string,
  options: string[],
  optionLabels?: Record<string, string>,
): DocField {
  const unique = [...new Set(options.map(text).filter(Boolean))];
  return {
    ...(base ?? fallbackField(fieldname, label)),
    fieldname,
    label,
    fieldtype: "Select",
    options: ["", ...unique].join("\n"),
    ...(optionLabels ? { optionLabels } : {}),
  } as DocField;
}


function priceVariant(value: unknown): string {
  return text(value).toUpperCase() || "STANDARD";
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionConditions(value: unknown): Json[] {
  let rows = value;
  if (typeof rows === "string" && rows.trim()) {
    try { rows = JSON.parse(rows); } catch { return []; }
  }
  return Array.isArray(rows)
    ? rows.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function optionComparable(value: unknown): string | number | boolean | null {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return commercialNormalized(value);
  return value == null ? null : commercialNormalized(value);
}

function salesOptionApplicable(option: Doc, line: SalesLine): boolean {
  const itemCode = text(option.item_code);
  if (itemCode && itemCode !== text(line.item_code)) return false;
  const itemGroup = text(option.item_group);
  if (itemGroup && commercialNormalized(itemGroup) !== commercialNormalized(line._context?.item_group)) return false;
  const facts: Json = {
    ...line,
    item_code: line.item_code,
    item_group: line._context?.item_group,
    door_type: line._context?.door_type,
    inventory_mode: line._context?.inventory_mode,
  };
  return optionConditions(option.conditions).every((condition) => {
    const field = text(condition.field ?? condition.fieldname);
    const op = text(condition.operator ?? condition.op) || "eq";
    if (!field) return false;
    const actual = optionComparable(facts[field]);
    if (op === "in" || op === "not_in") {
      const values = Array.isArray(condition.values) ? condition.values.map(optionComparable) : [];
      const matched = values.some((value) => value === actual);
      return op === "in" ? matched : !matched;
    }
    const expected = optionComparable(condition.value);
    if (op === "eq") return actual === expected;
    if (op === "neq") return actual !== expected;
    const left = Number(actual);
    const right = Number(expected);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (op === "lt") return left < right;
    if (op === "lte") return left <= right;
    if (op === "gt") return left > right;
    if (op === "gte") return left >= right;
    return false;
  });
}

function StandardField(props: {
  id: string;
  field: DocField;
  value: unknown;
  onChange: (value: unknown) => void;
  registry: ControlRegistry;
  services: FieldServices;
  parentDoctype: string;
  docValues: Json;
  roles: string[];
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  className?: string;
  onCommit?: () => void;
  hideLabel?: boolean;
  hideLabelOnDesktop?: boolean;
}) {
  const Control = props.registry.resolve(props.field.fieldtype);
  const displayLabel = props.label || text(props.field.label) || props.field.fieldname;
  if (!Control) {
    return <div className={props.className}><div className="text-xs text-destructive">Missing control for {props.field.fieldtype}</div></div>;
  }
  const control = (
    <Control
      field={props.field}
      id={props.id}
      value={props.value}
      onChange={props.onChange}
      readOnly={props.readOnly}
      required={props.required}
      label={displayLabel}
      services={props.services}
      parentDoctype={props.parentDoctype}
      docValues={props.docValues}
      roles={props.roles}
      compact={props.compact}
    />
  );
  if (props.field.fieldtype === "Check") {
    return (
      <div className={"min-w-0 " + (props.className ?? "")}>
        <div className="flex h-9 items-center gap-2">
          {control}
          <label htmlFor={props.id} className="cursor-pointer text-[13px] font-medium text-foreground">
            {displayLabel}{props.required ? <span className="ml-0.5 text-destructive">*</span> : null}
          </label>
        </div>
      </div>
    );
  }
  return (
    <div
      className={"min-w-0 " + (props.className ?? "")}
      onBlurCapture={() => props.onCommit?.()}
      onKeyDownCapture={(event) => { if (event.key === "Enter") props.onCommit?.(); }}
    >
      {!props.hideLabel ? (
        <label htmlFor={props.id} className={`${props.hideLabelOnDesktop ? "xl:hidden " : ""}mb-1 block text-[13px] font-medium leading-tight text-foreground`}>
          {displayLabel}{props.required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </label>
      ) : null}
      {control}
    </div>
  );
}

export function AlumdoorSalesOrderCreate(props: AlumdoorSalesOrderCreateProps) {
  const { adapter, scopeKey, businessContext, contextPolicies, registry, services, roles } = useMetaForge();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const [customerPhone, setCustomerPhone] = useState("");
  const [lines, setLines] = useState<SalesLine[]>([newLine(0)]);
  const [selectedLineKey, setSelectedLineKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [fatal, setFatal] = useState("");
  const closeSeen = useRef(props.closeRequest ?? 0);
  const lineSeq = useRef(new Map<string, number>());
  const headerSeq = useRef(0);

  const childFields = useMemo(
    () => childMeta?.fields.map((field) => field.fieldname).filter(Boolean) ?? [],
    [childMeta],
  );
  const childFieldSet = useMemo(() => new Set(childFields), [childFields]);
  const salesPhoneField = useMemo(() => {
    const candidates = ["customer_phone", "contact_phone", "contact_mobile", "mobile_no", "phone_no", "phone"];
    return candidates.find((name) => meta?.fields.some((field) => field.fieldname === name));
  }, [meta]);
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
    const seq = ++headerSeq.current;
    const next = { ...header, [field]: value };
    setHeader(next);
    if (!preview) return;
    void previewDocument(next, field)
      .then((resolved) => {
        if (headerSeq.current === seq) setHeader(resolved);
      })
      .catch((error) => {
        if (headerSeq.current === seq) toast.error(mapError(error).message);
      });
  }, [header, previewDocument]);

  const loadSalesOptions = useCallback(async (itemCode: string, itemGroup: string): Promise<Doc[]> => {
    if (!itemCode) return [];
    try {
      const rows = await adapter.getList("Sales Option", {
        fields: [
          "name",
          "option_label",
          "item_group",
          "item_code",
          "is_default",
          "disabled",
          "option_code",
          "conditions",
          "priority",
          "sales_mode",
          "price_variant",
          "discount_basis_variant",
          "sales_package",
        ],
        filters: { disabled: 0 },
        pageLength: 1000,
      });
      return rows
        .filter((row) => {
          const scopedItem = text(row.item_code);
          if (scopedItem && scopedItem !== itemCode) return false;
          const scopedGroup = text(row.item_group);
          if (scopedGroup && commercialNormalized(scopedGroup) !== commercialNormalized(itemGroup)) return false;
          return true;
        })
        .sort((left, right) => (Number(right.priority) || 0) - (Number(left.priority) || 0) || text(left.option_label).localeCompare(text(right.option_label), "vi"));
    } catch {
      return [];
    }
  }, [adapter]);


  const loadItemPrices = useCallback(async (itemCode: string): Promise<Doc[]> => {
    const priceList = text(header.selling_price_list);
    if (!itemCode || !priceList) return [];
    try {
      const rows = await adapter.getList("Item Price", {
        fields: ["name", "price_list", "item_code", "uom", "price_variant", "currency", "rate", "disabled"],
        filters: { item_code: itemCode, price_list: priceList, disabled: 0 },
        pageLength: 200,
      });
      const currency = text(header.currency);
      return rows
        .filter((row) => !currency || !text(row.currency) || text(row.currency) === currency)
        .sort((left, right) =>
          priceVariant(left.price_variant).localeCompare(priceVariant(right.price_variant))
          || text(left.uom).localeCompare(text(right.uom), "vi")
          || (Number(left.rate) || 0) - (Number(right.rate) || 0)
          || text(left.name).localeCompare(text(right.name), "vi"),
        );
    } catch {
      return [];
    }
  }, [adapter, header.currency, header.selling_price_list]);

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
    patchLine(row._key, { ...patch, _loading: true, _error: "", _pricingError: "" });
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
        _pricingError: "",
        _commercial: undefined,
      };
      for (const field of Array.isArray(preview.clear) ? preview.clear.map(text) : []) {
        if (childFieldSet.has(field)) next[field] = undefined;
      }

      let options = source._salesOptions ?? [];
      if (changedField === "item_code" || options.length === 0) {
        options = await loadSalesOptions(text(row.item_code), text(context.item_group));
        if (lineSeq.current.get(row._key) !== seq) return;
      }
      next._salesOptions = options;

      let itemPrices = source._itemPrices ?? [];
      if (changedField === "item_code" || changedField === "parent_context" || itemPrices.length === 0) {
        itemPrices = await loadItemPrices(text(row.item_code));
        if (lineSeq.current.get(row._key) !== seq) return;
      }
      next._itemPrices = itemPrices;

      // item_context already resolves the Item master default sales UOM. Feed that
      // projection into the shared commercial resolver; do not calculate money here.
      const selectedUom = text(context.selected_uom);
      if (!text(row.uom) && !text(next.uom) && selectedUom) next.uom = selectedUom;

      let candidate = { ...row, ...next, _context: context } as SalesLine;
      const applicableOptions = options.filter((option) => salesOptionApplicable(option, candidate));
      const selected = text(candidate.sales_option);
      if (selected && !applicableOptions.some((option) => String(option.name) === selected)) {
        next.sales_option = undefined;
        candidate = { ...candidate, sales_option: undefined } as SalesLine;
      }
      if (!text(candidate.sales_option)) {
        const defaultOption = applicableOptions.find(
(option) => option.is_default === true || option.is_default === 1,
        );
        if (defaultOption?.name) {
next.sales_option = String(defaultOption.name);
candidate = { ...candidate, sales_option: String(defaultOption.name) } as SalesLine;
        }
      }

      const pricedQty = numberValue(candidate.qty);
      const priceList = text(header.selling_price_list);
      if (pricedQty && pricedQty > 0 && priceList && text(candidate.uom)) {
        try {
const commercial = await adapter.callPost<Json>("metaforge.api.preview_sales_commercial_line", {
  line: cleanLine(candidate),
  price_list: priceList,
  currency: text(header.currency) || "VND",
  posting_date: text(header.transaction_date) || today(),
  customer: text(header.customer),
  customer_group: text(header.customer_group),
});
if (lineSeq.current.get(row._key) !== seq) return;
const sellingRate = numberValue(commercial.selling_rate ?? commercial.rate);
const grossAmount = numberValue(commercial.gross_amount);
const discountPercentage = numberValue(commercial.discount_percentage);
const discountAmount = numberValue(commercial.discount_amount);
const adjustmentAmount = numberValue(commercial.adjustment_amount);
const netAmount = numberValue(commercial.net_before_tax ?? commercial.net_amount ?? commercial.amount);
if (sellingRate !== undefined) next.rate = sellingRate;
if (grossAmount !== undefined) next.amount = grossAmount;
if (discountPercentage !== undefined) next.discount_percentage = discountPercentage;
if (discountAmount !== undefined) next.discount_amount = discountAmount;
if (adjustmentAmount !== undefined) next.adjustment_amount = adjustmentAmount;
if (netAmount !== undefined) next.net_amount = netAmount;
if (text(commercial.sales_option)) next.sales_option = text(commercial.sales_option);
next._commercial = commercial;
next._selectedItemPrice = text(commercial.item_price) || next._selectedItemPrice;
next._pricingError = "";
        } catch (error) {
next._pricingError = mapError(error).message;
        }
      }

      patchLine(row._key, next);
    } catch (error) {
      if (lineSeq.current.get(row._key) === seq) {
        patchLine(row._key, {
...patch,
_loading: false,
_error: mapError(error).message,
        });
      }
    }
  }, [adapter, childFieldSet, childFields, childMeta, cleanLine, header, loadItemPrices, loadSalesOptions, patchLine]);

  const commitLine = useCallback((key: string, field: string, value: unknown) => {
    const current = lines.find((line) => line._key === key);
    if (!current) return;
    patchLine(key, { [field]: value });
    void previewLine(current, field, { [field]: value });
  }, [lines, patchLine, previewLine]);

  const chooseItemPrice = useCallback((key: string, priceName: string) => {
    const current = lines.find((line) => line._key === key);
    if (!current) return;
    const price = (current._itemPrices ?? []).find((row) => text(row.name) === priceName);
    if (!price) return;

    const variant = priceVariant(price.price_variant);
    const applicableOptions = (current._salesOptions ?? []).filter((option) => salesOptionApplicable(option, current));
    const matchingOptions = applicableOptions.filter((option) => priceVariant(option.price_variant) === variant);
    const currentOption = matchingOptions.find((option) => text(option.name) === text(current.sales_option));
    const option = currentOption
      ?? matchingOptions.find((row) => row.is_default === true || row.is_default === 1)
      ?? matchingOptions[0];

    if ((current._salesOptions?.length ?? 0) > 0 && !option) {
      toast.error(`Đơn giá ${priceName} thuộc biến thể ${variant} nhưng không có Cách bán hợp lệ cho mặt hàng này.`);
      return;
    }

    const patch: Partial<SalesLine> = {
      _selectedItemPrice: priceName,
      ...(text(price.uom) ? { uom: text(price.uom) } : {}),
      ...(option?.name ? { sales_option: text(option.name) } : {}),
    };
    patchLine(key, patch);
    void previewLine(current, option?.name ? "sales_option" : "uom", patch);
  }, [lines, patchLine, previewLine]);

  const handleGridChange = useCallback((
    key: string,
    field: "item_code" | "sales_option" | "item_price" | "uom" | "qty" | "set_count",
    value: unknown,
  ) => {
    const current = lines.find((line) => line._key === key);
    if (!current) return;
    if (field === "item_price") {
      chooseItemPrice(key, text(value));
      return;
    }
    if (field === "item_code") {
      lineSeq.current.set(key, (lineSeq.current.get(key) ?? 0) + 1);
      const itemCode = text(value);
      const reset: Partial<SalesLine> = {
        item_code: itemCode || undefined,
        _itemLabel: undefined,
        sales_option: undefined,
        _context: undefined,
        _salesOptions: [],
        _itemPrices: [],
        _selectedItemPrice: undefined,
        _allowedColors: [],
        _overrides: {},
        _commercial: undefined,
        _pricingError: "",
        _error: "",
      };
      patchLine(key, reset);
      if (itemCode) void previewLine({ ...current, ...reset } as SalesLine, "item_code", reset);
      return;
    }
    const next = field === "qty" || field === "set_count"
      ? (value == null || value === "" ? undefined : Number(value))
      : (text(value) || undefined);
    commitLine(key, field, next);
  }, [chooseItemPrice, commitLine, lines, patchLine, previewLine]);

  const addSalesLine = useCallback(() => {
    const fresh = newLine(lines.length);
    setLines((current) => [...current, fresh]);
    setSelectedLineKey(fresh._key);
  }, [lines.length]);

  const duplicateSalesLine = useCallback((key: string) => {
    const source = lines.find((line) => line._key === key);
    if (!source) return;
    const clone: SalesLine = {
      ...source,
      _key: newLine(lines.length)._key,
      _loading: false,
      _error: "",
      _pricingError: "",
    };
    setLines((current) => [...current, clone]);
    setSelectedLineKey(clone._key);
  }, [lines]);

  const deleteSalesLine = useCallback((key: string) => {
    if (lines.length <= 1) return;
    const index = lines.findIndex((line) => line._key === key);
    const next = lines.filter((line) => line._key !== key);
    setLines(next);
    setSelectedLineKey(next[Math.min(Math.max(index, 0), next.length - 1)]?._key ?? "");
  }, [lines]);

  useEffect(() => {
    if (!lines.length) return;
    if (!selectedLineKey || !lines.some((line) => line._key === selectedLineKey)) {
      setSelectedLineKey(lines[0]?._key ?? "");
    }
  }, [lines, selectedLineKey]);

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
  }, [header.customer, header.customer_group, header.selling_price_list, header.currency, header.transaction_date]);

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
      if (line._pricingError) return `Dòng ${index + 1}: ${line._pricingError}`;
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
  const childField = (fieldname: string) => childMeta.fields.find((field) => field.fieldname === fieldname);
  const headerField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) =>
    metaField(fieldname) ?? fallbackField(fieldname, label, fieldtype, options);
  const lineBaseField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) =>
    childField(fieldname) ?? fallbackField(fieldname, label, fieldtype, options);
  const metaRequired = (fieldname: string) => Boolean(metaField(fieldname)?.reqd);
  const phoneValue = salesPhoneField ? text(header[salesPhoneField]) || customerPhone : customerPhone;

  const displayedTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const gridRows: SalesGridRow[] = lines.map((line) => {
    const kind = family(line);
    const area = isAreaDoor(line);
    const showWidth = area || fieldVisible(line, "width_m");
    const showHeight = area || fieldVisible(line, "height_m");
    const showSets = area || fieldVisible(line, "set_count");
    const showLength = fieldVisible(line, "length_m") && (fieldRequired(line, "length_m") || line.length_m != null);
    const showBars = fieldVisible(line, "qty_bar") && (fieldRequired(line, "qty_bar") || line.qty_bar != null);
    const simpleCountPrimary = showSets && !area && !showWidth && !showHeight && !showLength && !showBars;
    const directQtyPrimary = !simpleCountPrimary && !fieldReadonly(line, "qty") && !showWidth && !showHeight && !showSets && !showLength && !showBars;
    const quantityField = simpleCountPrimary ? "set_count" as const : directQtyPrimary ? "qty" as const : undefined;
    const commercial = line._commercial ?? {};
    const pricedQty = quantityField === "set_count"
      ? numberValue(line.set_count)
      : quantityField === "qty"
        ? numberValue(line.qty)
        : numberValue(commercial.priced_qty) ?? numberValue(line.qty);
    const sellingRate = numberValue(commercial.selling_rate) ?? numberValue(line.rate);
    const discountAmount = numberValue(commercial.discount_amount) ?? numberValue(line.discount_amount) ?? 0;
    const discountPercentage = numberValue(commercial.discount_percentage) ?? numberValue(line.discount_percentage) ?? 0;
    const adjustmentAmount = numberValue(commercial.adjustment_amount) ?? numberValue(line.adjustment_amount) ?? 0;
    const netAmount = numberValue(commercial.net_before_tax) ?? lineTotal(line);
    const allOptions = line._salesOptions ?? [];
    const applicableOptions = allOptions.filter((option) => salesOptionApplicable(option, line));
    const optionChoices = applicableOptions.map((option) => ({
      value: text(option.name),
      label: text(option.option_label) || text(option.name),
    }));
    const selectedOption = allOptions.find((option) => text(option.name) === text(line.sales_option));
    const salesOptionLabel = text(commercial.sales_option_label)
      || text(selectedOption?.option_label)
      || text(line.sales_option);

    const allowedVariants = new Set(applicableOptions.map((option) => priceVariant(option.price_variant)));
    const rawPrices = line._itemPrices ?? [];
    const selectablePrices = rawPrices.filter((price) => {
      if (allOptions.length === 0) return priceVariant(price.price_variant) === "STANDARD";
      return allowedVariants.has(priceVariant(price.price_variant));
    });
    const priceChoices = selectablePrices.map((price) => {
      const variant = priceVariant(price.price_variant);
      const labels = applicableOptions
        .filter((option) => priceVariant(option.price_variant) === variant)
        .map((option) => text(option.option_label) || text(option.name))
        .filter(Boolean);
      return {
        value: text(price.name),
        label: `${money(price.rate)} ₫${text(price.uom) ? ` / ${text(price.uom)}` : ""}${labels.length ? ` · ${labels.join(" / ")}` : variant !== "STANDARD" ? ` · ${variant}` : ""}`,
      };
    });
    const resolvedPrice = text(commercial.item_price) || text(line._selectedItemPrice);
    const priceLabel = sellingRate === undefined
      ? ""
      : `${money(sellingRate)} ₫${text(line.uom) ? ` / ${text(line.uom)}` : ""}`;
    const uoms = Array.isArray(line._context?.allowed_uoms) ? line._context.allowed_uoms.map(text).filter(Boolean) : [];

    return {
      key: line._key,
      itemCode: text(line.item_code),
      itemLabel: text(line._itemLabel) || text(line.item_code),
      availability: text(line._context?.availability_status),
      salesOption: text(line.sales_option),
      salesOptionLabel,
      salesOptionChoices: optionChoices,
      priceId: resolvedPrice,
      priceLabel,
      priceChoices,
      uom: text(line.uom),
      uomChoices: uoms.map((uom) => ({ value: uom, label: uom })),
      quantity: pricedQty,
      quantityField,
      quantityEditable: Boolean(quantityField),
      discountLabel: discountAmount > 0
        ? `-${money(discountAmount)} ₫${discountPercentage > 0 ? ` · ${discountPercentage.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}%` : ""}`
        : "—",
      adjustmentLabel: adjustmentAmount !== 0 ? `${money(adjustmentAmount)} ₫` : "—",
      amountLabel: `${money(netAmount)} ₫`,
      loading: line._loading,
      error: line._error,
      pricingError: line._pricingError,
      docValues: line,
    };
  });

  const activeLineIndex = Math.max(0, lines.findIndex((line) => line._key === selectedLineKey));
  const activeLine = lines[activeLineIndex];
  const activeKind = activeLine ? family(activeLine) : "ordinary";
  const activeArea = activeLine ? isAreaDoor(activeLine) : false;
  const activeColors = activeLine?._allowedColors ?? [];
  const activeShowWidth = Boolean(activeLine && (activeArea || fieldVisible(activeLine, "width_m")));
  const activeShowHeight = Boolean(activeLine && (activeArea || fieldVisible(activeLine, "height_m")));
  const activeShowSets = Boolean(activeLine && (activeArea || fieldVisible(activeLine, "set_count")));
  const activeShowLength = Boolean(activeLine && fieldVisible(activeLine, "length_m") && (fieldRequired(activeLine, "length_m") || activeLine.length_m != null));
  const activeShowBars = Boolean(activeLine && fieldVisible(activeLine, "qty_bar") && (fieldRequired(activeLine, "qty_bar") || activeLine.qty_bar != null));
  const activeShowLeafVariant = Boolean(activeLine && fieldVisible(activeLine, "leaf_variant", activeKind === "australian"));
  const activeSimpleCount = Boolean(activeLine && activeShowSets && !activeArea && !activeShowWidth && !activeShowHeight && !activeShowLength && !activeShowBars);
  const activeDirectQty = Boolean(activeLine && !activeSimpleCount && !fieldReadonly(activeLine, "qty") && !activeShowWidth && !activeShowHeight && !activeShowSets && !activeShowLength && !activeShowBars);
  const activeQuantityField = activeSimpleCount ? "set_count" : activeDirectQty ? "qty" : undefined;
  const activeDetailNeeded = Boolean(activeLine && (
    activeColors.length > 0 || activeShowWidth || activeShowHeight || (activeShowSets && activeQuantityField !== "set_count")
    || activeShowLeafVariant || activeKind === "mesh" || fieldVisible(activeLine, "has_butterfly_bracket")
    || activeShowLength || activeShowBars
  ));
  const activeCommercial = activeLine?._commercial ?? {};

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-sales-order-create">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1760px] space-y-3 px-4 py-3">
          <section className="rounded-lg border bg-card p-3" data-section="sales-customer-meta-header">
  <div className="mb-2 flex items-center justify-between gap-3">
    <h2 className="text-sm font-semibold">{"Th\u00f4ng tin kh\u00e1ch h\u00e0ng"}</h2>
  </div>

  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,2.2fr)_minmax(220px,1.25fr)_minmax(150px,.8fr)_minmax(240px,1.5fr)_150px_150px]">
    <StandardField
      id="sales-customer"
      field={headerField("customer", "Kh\u00e1ch h\u00e0ng", "Link", "Customer")}
      value={header.customer}
      onChange={(value) => setHeaderField("customer", text(value) || undefined, true)}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={metaRequired("customer")}
      className="xl:order-1"
    />

    <StandardField
      id="sales-price-list"
      field={headerField("selling_price_list", "B\u1ea3ng gi\u00e1", "Link", "Price List")}
      value={header.selling_price_list}
      onChange={(value) => setHeaderField("selling_price_list", text(value) || undefined, true)}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={metaRequired("selling_price_list")}
      label="B\u1ea3ng gi\u00e1"
      className="xl:order-2"
    />

    <StandardField
      id="sales-phone"
      field={salesPhoneField ? headerField(salesPhoneField, "S\u0110T") : fallbackField("__customer_phone", "S\u0110T")}
      value={phoneValue}
      onChange={(value) => {
        const phone = text(value);
        setCustomerPhone(phone);
        if (salesPhoneField) setHeaderField(salesPhoneField, phone || undefined);
      }}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      readOnly={!salesPhoneField}
      className="xl:order-3"
    />

    <StandardField
      id="sales-address"
      field={{ ...headerField("install_address", "\u0110\u1ecba ch\u1ec9 giao / l\u1eafp \u0111\u1eb7t"), fieldtype: "Data" } as DocField}
      value={header.install_address}
      onChange={(value) => setHeaderField("install_address", text(value) || undefined)}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={metaRequired("install_address")}
      label="Địa chỉ giao / lắp đặt"
      className="md:col-span-2 xl:order-7 xl:col-span-6"
    />

    <StandardField
      id="sales-order-date"
      field={headerField("transaction_date", "Ng\u00e0y \u0111\u1eb7t h\u00e0ng", "Date")}
      value={header.transaction_date}
      onChange={(value) => setHeaderField("transaction_date", text(value), true)}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={metaRequired("transaction_date")}
      label="Ngày đặt hàng"
      className="xl:order-5"
    />

    <StandardField
      id="sales-delivery-date"
      field={headerField("delivery_date", "Ng\u00e0y giao", "Date")}
      value={header.delivery_date}
      onChange={(value) => setHeaderField("delivery_date", text(value))}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={metaRequired("delivery_date")}
      label="Ngày giao"
      className="xl:order-6"
    />

    <StandardField
      id="sales-responsible-person"
      field={headerField("responsible_person", "Nh\u00e2n vi\u00ean b\u00e1n h\u00e0ng", "Link", "Employee")}
      value={header.responsible_person}
      onChange={(value) => setHeaderField("responsible_person", text(value) || undefined)}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={metaRequired("responsible_person")}
      label="Nhân viên bán hàng"
      className="md:col-span-2 xl:order-4 xl:col-span-1"
    />
  </div>
</section>

<section className="space-y-2" data-section="hardcoded-sales-lines">
  <div className="flex min-h-8 items-center justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold">Chi tiết bán hàng</h2>
      <div className="truncate text-[11px] text-muted-foreground">
        {text(header.customer_group) ? `Nhóm giá: ${text(header.customer_group)}` : "Chọn khách hàng để xác định nhóm giá"}
        {text(header.selling_price_list) ? ` · Bảng giá: ${text(header.selling_price_list)}` : ""}
      </div>
    </div>
  </div>

  <AlumdoorSalesLinesGrid
    rows={gridRows}
    selectedKey={selectedLineKey}
    onSelectedKeyChange={setSelectedLineKey}
    onChange={handleGridChange}
    onAdd={addSalesLine}
    onDuplicate={duplicateSalesLine}
    onDelete={deleteSalesLine}
    registry={registry}
    services={services}
    roles={roles}
    parentDocValues={header}
    childDoctype={childMeta.name}
    itemField={childField("item_code")}
    salesOptionField={childField("sales_option")}
  />

  {activeLine && text(activeLine.item_code) && activeDetailNeeded ? (
    <div className="rounded-lg border bg-card px-3 py-2" data-section="active-sales-line-detail">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold">Thông số dòng {activeLineIndex + 1} · {text(activeLine.item_code)}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {text(activeLine._context?.availability_status) || "Thông số làm thay đổi số lượng tính giá / chính sách bán"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          {numberValue(activeLine.billable_area_sqm) !== undefined ? (
            <span>Diện tích tính giá <strong className="text-foreground">{numberValue(activeLine.billable_area_sqm)?.toLocaleString("vi-VN", { maximumFractionDigits: 6 })} m²</strong></span>
          ) : null}
          {text(activeCommercial.price_variant) ? <span>Biến thể <strong className="text-foreground">{text(activeCommercial.price_variant)}</strong></span> : null}
          {text(activeCommercial.item_price) ? <span>Item Price <strong className="text-foreground">{text(activeCommercial.item_price)}</strong></span> : null}
        </div>
      </div>

      <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {activeColors.length ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-color`}
            field={selectField(childField("color"), "color", "Màu", activeColors)}
            value={activeLine.color}
            onChange={(value) => commitLine(activeLine._key, "color", text(value) || undefined)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            label="Màu"
          />
        ) : null}

        {activeShowWidth ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-width`}
            field={lineBaseField("width_m", fieldLabel(activeLine, "width_m", "Rộng (m)"), "Float")}
            value={activeLine.width_m}
            onChange={(value) => patchLine(activeLine._key, { width_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "width_m", activeLine.width_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={activeArea || fieldRequired(activeLine, "width_m")} readOnly={fieldReadonly(activeLine, "width_m")}
            label={fieldLabel(activeLine, "width_m", "Rộng (m)")}
          />
        ) : null}

        {activeShowHeight ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-height`}
            field={lineBaseField("height_m", fieldLabel(activeLine, "height_m", "Cao (m)"), "Float")}
            value={activeLine.height_m}
            onChange={(value) => patchLine(activeLine._key, { height_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "height_m", activeLine.height_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={activeArea || fieldRequired(activeLine, "height_m")} readOnly={fieldReadonly(activeLine, "height_m")}
            label={fieldLabel(activeLine, "height_m", "Cao (m)")}
          />
        ) : null}

        {activeShowSets && activeQuantityField !== "set_count" ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-sets`}
            field={lineBaseField("set_count", fieldLabel(activeLine, "set_count", activeArea ? "Số bộ" : "Số lượng"), "Int")}
            value={activeLine.set_count}
            onChange={(value) => patchLine(activeLine._key, { set_count: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "set_count", activeLine.set_count)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={activeArea || fieldRequired(activeLine, "set_count")} readOnly={fieldReadonly(activeLine, "set_count")}
            label={fieldLabel(activeLine, "set_count", activeArea ? "Số bộ" : "Số lượng")}
          />
        ) : null}

        {activeShowLeafVariant ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-leaf-variant`}
            field={selectField(childField("leaf_variant"), "leaf_variant", "Kiểu lá / motor", leafVariants)}
            value={activeLine.leaf_variant}
            onChange={(value) => commitLine(activeLine._key, "leaf_variant", text(value) || undefined)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "leaf_variant")}
            label="Kiểu lá / motor"
          />
        ) : null}

        {activeKind === "mesh" && fieldVisible(activeLine, "mesh_height_m", true) ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-mesh-height`}
            field={lineBaseField("mesh_height_m", fieldLabel(activeLine, "mesh_height_m", "Cao lưới (m)"), "Float")}
            value={activeLine.mesh_height_m}
            onChange={(value) => patchLine(activeLine._key, { mesh_height_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "mesh_height_m", activeLine.mesh_height_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "mesh_height_m")} readOnly={fieldReadonly(activeLine, "mesh_height_m")}
            label={fieldLabel(activeLine, "mesh_height_m", "Cao lưới (m)")}
          />
        ) : null}

        {fieldVisible(activeLine, "has_butterfly_bracket") ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-butterfly`}
            field={lineBaseField("has_butterfly_bracket", fieldLabel(activeLine, "has_butterfly_bracket", "Có bản bướm"), "Check")}
            value={activeLine.has_butterfly_bracket}
            onChange={(value) => commitLine(activeLine._key, "has_butterfly_bracket", value ? 1 : 0)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            label={fieldLabel(activeLine, "has_butterfly_bracket", "Có bản bướm")}
          />
        ) : null}

        {activeShowLength ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-length`}
            field={lineBaseField("length_m", fieldLabel(activeLine, "length_m", "Dài / cây (m)"), "Float")}
            value={activeLine.length_m}
            onChange={(value) => patchLine(activeLine._key, { length_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "length_m", activeLine.length_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "length_m")} readOnly={fieldReadonly(activeLine, "length_m")}
            label={fieldLabel(activeLine, "length_m", "Dài / cây (m)")}
          />
        ) : null}

        {activeShowBars ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-bars`}
            field={lineBaseField("qty_bar", fieldLabel(activeLine, "qty_bar", "Số cây"), "Int")}
            value={activeLine.qty_bar}
            onChange={(value) => patchLine(activeLine._key, { qty_bar: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "qty_bar", activeLine.qty_bar)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "qty_bar")} readOnly={fieldReadonly(activeLine, "qty_bar")}
            label={fieldLabel(activeLine, "qty_bar", "Số cây")}
          />
        ) : null}
      </div>

      {activeLine._error || activeLine._pricingError ? (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          {activeLine._error || activeLine._pricingError}
        </div>
      ) : null}
    </div>
  ) : null}
</section>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-4 py-2 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="mx-auto flex w-full max-w-[1760px] flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-muted-foreground">Tạm tính dòng</span>
            <strong className="text-xl font-bold tabular-nums">{money(displayedTotal)} ₫</strong>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>Huỷ</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                for (const line of lines) {
                  if (text(line.item_code)) void previewLine(line, "manual_refresh");
                }
              }}
            >
              <RefreshCw className="mr-1 size-3.5" /> Tính lại
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !canCreate}
              onClick={() => void save(true)}
            >
              <Eye className="mr-1 size-3.5" /> Lưu & xem
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !canCreate}
              onClick={() => void save(false)}
            >
              {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
              Lưu đơn hàng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
