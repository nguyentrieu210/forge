/** @jsxImportSource react */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button, Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from "@metaforge/ui";
import { useMetaForge } from "../../../container/provider.js";

interface AlumdoorSalesOrderCreateProps {
  /** Có name = mở/sửa đơn hiện có; không có name = tạo đơn mới. */
  name?: string;
  closeRequest?: number;
  onCreated: (name: string) => void;
  onSaved?: (name: string) => void;
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
  is_sales_package_component?: boolean;
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
  _splitChildren?: SalesLine[];
  _splitPackageChecksum?: string;
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
  sales_package_group_key?: string;
  sales_package_parent_key?: string;
  sales_package_component_key?: string;
}

const LAYOUT_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "Heading", "HTML", "Button"]);
const STANDARD_SALES_OPTION = "__standard__";

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

function salesLineErrorInVietnamese(message: unknown, line: SalesLine): string {
  const raw = text(message);
  const notApplicable = raw.match(/^Sales Option (.+?) is not applicable to Item (.+)$/i);
  if (notApplicable) {
    const optionName = notApplicable[1] ?? text(line.sales_option);
    const option = (line._salesOptions ?? []).find((row) => text(row.name) === optionName);
    const optionLabel = text(option?.option_label) || optionName;
    const itemCode = notApplicable[2] || text(line.item_code);
    return `Cách bán “${optionLabel}” không áp dụng cho mặt hàng ${itemCode} theo thông số hiện tại.`;
  }
  const forbiddenField = raw.match(/^Field is not allowed:\s*(.+)$/i);
  if (forbiddenField) return `Trường ${forbiddenField[1]} không được phép sử dụng trong yêu cầu này.`;
  if (/qty must be greater than zero/i.test(raw)) return "Số lượng tính giá phải lớn hơn 0.";
  if (/price list is required/i.test(raw)) return "Cần chọn bảng giá trước khi tính giá dòng hàng.";
  if (/item_code is required/i.test(raw)) return "Cần chọn mặt hàng trước khi tính giá.";
  const missingPackageFact = raw.match(/^Sales Package (.+?) requires (HEIGHT|WIDTH|CUT_WIDTH|AREA|SET_COUNT|LEAF_COUNT) measurement fact$/i);
  if (missingPackageFact) {
    const labels: Record<string, string> = {
      HEIGHT: "chiều cao",
      WIDTH: "chiều rộng",
      CUT_WIDTH: "chiều rộng cắt",
      AREA: "diện tích",
      SET_COUNT: "số bộ",
      LEAF_COUNT: "số lá",
    };
    return `Gói bán “${missingPackageFact[1]}” cần nhập ${labels[missingPackageFact[2]!.toUpperCase()] ?? missingPackageFact[2]} để tính số lượng giao.`;
  }
  const missingPrice = raw.match(/^Item Price (.+?) does not exist for variant (.+)$/i);
  if (missingPrice) return `Mặt hàng chưa có đơn giá cho cách bán ${missingPrice[2]} trong bảng giá đang chọn (mã giá dự kiến: ${missingPrice[1]}).`;
  const packageProblem = raw.match(/^Sales Package (.+?) (does not exist|is disabled|has no components|does not apply to .+)$/i);
  if (packageProblem) return `Gói bán “${packageProblem[1]}” chưa hợp lệ: ${packageProblem[2]}.`;
  if (/[À-ỹ]/u.test(raw)) return raw;
  return raw
    ? `Không thể tính lại dòng hàng: ${raw}`
    : "Không thể tính lại dòng hàng vì máy chủ không trả về nguyên nhân.";
}

function today(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isActivePriceList(row: Doc, asOfDate: string): boolean {
  const disabled = row.disabled === true || row.disabled === 1 || text(row.disabled).toLowerCase() === "true" || text(row.disabled) === "1";
  const effectiveDate = text(row.effective_date);
  // Legacy Price List rows may not have effective_date. They remain selectable;
  // this is especially important when there is exactly one enabled price list.
  return !disabled && (!effectiveDate || effectiveDate <= asOfDate);
}

function newestActivePriceList(rows: Doc[], asOfDate: string, customerGroup = ""): Doc | undefined {
  return rows
    .filter((row) => isActivePriceList(row, asOfDate))
    .filter((row) => !customerGroup || text(row.customer_group) === customerGroup)
    .sort((left, right) =>
      text(right.effective_date).localeCompare(text(left.effective_date))
      || text(right.name).localeCompare(text(left.name), "vi"),
    )[0];
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

function salesGroupKey(): string {
  return `SALE-GROUP-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newLine(index: number): SalesLine {
  return {
    _key: `sales-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    sales_package_group_key: salesGroupKey(),
    qty: 1,
    set_count: 1,
  };
}

function hydrateSalesLines(rows: Json[]): SalesLine[] {
  const parents: SalesLine[] = [];
  const parentByGroup = new Map<string, SalesLine>();
  const children: SalesLine[] = [];
  for (const [index, row] of rows.entries()) {
    const line = {
      ...row,
      _key: `sales-existing-${text(row.name) || index}-${Math.random().toString(36).slice(2, 7)}`,
      _loading: false,
      _error: "",
      _pricingError: "",
    } as SalesLine;
    if (text(line.sales_package_parent_key)) {
      children.push(line);
      continue;
    }
    if (!text(line.sales_package_group_key)) line.sales_package_group_key = salesGroupKey();
    line._splitChildren = [];
    parents.push(line);
    parentByGroup.set(text(line.sales_package_group_key), line);
  }
  for (const child of children) {
    const parent = parentByGroup.get(text(child.sales_package_parent_key));
    if (parent) parent._splitChildren = [...(parent._splitChildren ?? []), child];
    else {
      child._error = `Không tìm thấy dòng bộ cha ${text(child.sales_package_parent_key)} của món ${text(child.item_code)}.`;
      parents.push(child);
    }
  }
  return parents.length ? parents : [newLine(0)];
}

function splitChildFromComponent(parent: SalesLine, component: Json): SalesLine {
  const groupKey = text(parent.sales_package_group_key) || salesGroupKey();
  const inheritColor = component.inherit_color === true || component.inherit_color === 1;
  const inheritDimensions = component.inherit_dimensions === true || component.inherit_dimensions === 1;
  const inheritSetCount = component.inherit_set_count === true || component.inherit_set_count === 1;
  return {
    _key: `sales-child-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    item_code: text(component.item_code),
    uom: text(component.uom),
    qty: numberValue(component.qty) ?? 1,
    ...(text(component.sales_option) ? { sales_option: text(component.sales_option) } : {}),
    sales_package_parent_key: groupKey,
    sales_package_component_key: text(component.component_key),
    ...(inheritColor ? { color: parent.color } : {}),
    ...(inheritDimensions ? {
      width_m: parent.width_m,
      height_m: parent.height_m,
      billable_area_sqm: parent.billable_area_sqm,
      length_m: parent.length_m,
    } : {}),
    ...(inheritSetCount ? { set_count: parent.set_count } : {}),
    _loading: true,
    _error: "",
    _pricingError: "",
  };
}

function splitSnapshot(line: SalesLine): Json | undefined {
  const value = line.sales_package_snapshot ?? line._commercial?.sales_package_snapshot;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined;
}

function splitComponents(line: SalesLine): Json[] {
  const snapshot = splitSnapshot(line);
  if (text(snapshot?.selection_mode).toUpperCase() !== "SELECTABLE") return [];
  return Array.isArray(snapshot?.components)
    ? snapshot.components.filter((component): component is Json => Boolean(component) && typeof component === "object" && !Array.isArray(component))
    : [];
}

type SplitLifecycleDescriptor = {
  identity: string;
  packageName: string;
};

function splitLifecycleDescriptor(line: SalesLine | undefined): SplitLifecycleDescriptor | undefined {
  if (!line) return undefined;
  const optionName = text(line.sales_option);
  const option = (line._salesOptions ?? []).find((candidate) => text(candidate.name) === optionName);
  const mode = text(option?.sales_mode) || text(option?.option_label) || text(line.sales_mode);
  if (normalized(mode) !== "tach mon") return undefined;
  const itemCode = text(line.item_code);
  const packageName = text(option?.sales_package) || text(line.sales_package) || `PKG-SPLIT:${itemCode}`;
  if (!itemCode || !optionName || !packageName) return undefined;
  return {
    identity: JSON.stringify([line._key, itemCode, optionName, packageName]),
    packageName,
  };
}

function splitParentProjection(line: SalesLine): { rate?: number; gross?: number; discount?: number; net?: number } {
  const commercial = line._commercial ?? {};
  if (!line._commercial) {
    return {
      rate: numberValue(line.rate),
      gross: numberValue(line.amount),
      discount: numberValue(line.discount_amount),
      net: numberValue(line.net_amount),
    };
  }
  const gross = numberValue(commercial.gross_amount);
  const pricedQty = numberValue(commercial.priced_qty) ?? numberValue(line.qty);
  if (gross === undefined || !pricedQty || pricedQty <= 0) return {};
  const components = new Map(splitComponents(line).map((component) => [text(component.component_key), component]));
  let grossDeduction = 0;
  let basisDeduction = 0;
  for (const child of line._splitChildren ?? []) {
    const component = components.get(text(child.sales_package_component_key));
    const childGross = numberValue(child._commercial?.gross_amount) ?? numberValue(child.amount) ?? 0;
    if (component?.deduct_from_parent !== false && component?.deduct_from_parent !== 0) grossDeduction += childGross;
    if (component?.deduct_from_discount_basis === true || component?.deduct_from_discount_basis === 1) basisDeduction += childGross;
  }
  const residualGross = Math.max(0, gross - grossDeduction);
  const basis = Math.max(0, (numberValue(commercial.discount_basis_amount) ?? gross) - basisDeduction);
  const discountPercentage = numberValue(commercial.discount_percentage) ?? 0;
  const originalDiscount = numberValue(commercial.discount_amount) ?? 0;
  const discount = discountPercentage > 0
    ? Math.round(basis * discountPercentage / 100)
    : Math.min(originalDiscount, residualGross);
  const adjustment = numberValue(commercial.adjustment_amount) ?? 0;
  return {
    rate: residualGross / pricedQty,
    gross: residualGross,
    discount,
    net: Math.max(0, residualGross - discount + adjustment),
  };
}

function lineTotal(line: SalesLine): number {
  const split = splitParentProjection(line);
  if (split.net !== undefined) return split.net;
  const net = Number(line.net_amount);
  if (Number.isFinite(net)) return net;
  const gross = Number(line.amount);
  if (!Number.isFinite(gross)) return 0;
  return gross - Math.max(0, Number(line.discount_amount) || 0) + (Number(line.adjustment_amount) || 0);
}

function lineClusterTotal(line: SalesLine): number {
  return lineTotal(line) + (line._splitChildren ?? []).reduce((sum, child) => sum + lineTotal(child), 0);
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

function areaQuantity(line: SalesLine): number | undefined {
  const width = numberValue(line.width_m);
  const height = numberValue(line.height_m);
  const sets = numberValue(line.set_count) ?? 1;
  if (!width || width <= 0 || !height || height <= 0 || sets <= 0) return undefined;
  return Math.round(width * height * sets * 1_000_000) / 1_000_000;
}

function itemSearchScore(option: { value: string; description?: string }, query: string): number {
  const needle = normalized(query);
  if (!needle) return 0;
  const code = normalized(option.value);
  const label = normalized(option.description);
  const haystack = `${label} ${code}`;
  const tokens = needle.split(/\s+/).filter(Boolean);
  let score = 0;
  if (code === needle) score += 1_000;
  if (label === needle) score += 900;
  if (code.startsWith(needle)) score += 500;
  if (label.startsWith(needle)) score += 450;
  if (haystack.includes(needle)) score += 300;
  for (const token of tokens) {
    if (code.includes(token)) score += 80;
    if (label.includes(token)) score += 60;
  }
  return score;
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
  const uom = commercialNormalized(line.uom).replace(/\s+/g, "");
  const pricedArea = ["m2", "m²", "sqm"].includes(uom) ? numberValue(line.qty) : undefined;
  const effectiveArea = pricedArea ?? numberValue(line.billable_area_sqm);
  const facts: Json = {
    ...line,
    item_code: line.item_code,
    item_group: line._context?.item_group,
    door_type: line._context?.door_type,
    inventory_mode: line._context?.inventory_mode,
    ...(effectiveArea === undefined ? {} : {
      billable_area_sqm: effectiveArea,
      area_sqm: effectiveArea,
      sqm2: effectiveArea,
    }),
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

function salesOptionsWithAvailablePrices(options: Doc[], prices: Doc[]): Doc[] {
  if (prices.length === 0) return options;
  const availableVariants = new Set(prices.map((price) => priceVariant(price.price_variant)));
  return options.filter((option) => availableVariants.has(priceVariant(option.price_variant)));
}

function salesOptionTargetRules(value: unknown): Json[] {
  let rules = value;
  if (typeof rules === "string" && rules.trim()) {
    try { rules = JSON.parse(rules); } catch { return []; }
  }
  return Array.isArray(rules)
    ? rules.filter((rule): rule is Json => Boolean(rule) && typeof rule === "object" && !Array.isArray(rule))
    : [];
}

function salesOptionTargetItem(option: Doc, line: SalesLine): string {
  const direct = text(option.target_item_code);
  if (direct) return direct;
  const rules = salesOptionTargetRules(option.target_item_rules);
  if (!rules.length) return "";
  const uom = commercialNormalized(line.uom).replace(/\s+/g, "");
  const area = (["m2", "m²", "sqm"].includes(uom) ? numberValue(line.qty) : undefined)
    ?? numberValue(line.billable_area_sqm);
  if (area === undefined || area <= 0) return "";
  const matched = rules.find((rule) => {
    const minRaw = rule.min_exclusive_area_sqm;
    const maxRaw = rule.max_inclusive_area_sqm;
    const min = minRaw === undefined || minRaw === null || minRaw === "" ? undefined : Number(minRaw);
    const max = maxRaw === undefined || maxRaw === null || maxRaw === "" ? undefined : Number(maxRaw);
    return (min === undefined || area > min) && (max === undefined || area <= max);
  });
  return text(matched?.item_code);
}

const SALES_OPTION_LEAF_VARIANTS = ["Kéo tay", "Motor ngoài", "Motor trong"] as const;

function salesOptionLeafVariant(option: Doc | undefined): string {
  if (!option) return "";
  const configured = text(option.option_label || option.sales_mode);
  const normalizedConfigured = commercialNormalized(configured);
  return SALES_OPTION_LEAF_VARIANTS.find(
    (variant) => commercialNormalized(variant) === normalizedConfigured,
  ) ?? "";
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
  const [customerPaymentTerms, setCustomerPaymentTerms] = useState("");
  const [headerOpen, setHeaderOpen] = useState(true);
  const [lines, setLines] = useState<SalesLine[]>([newLine(0)]);
  const linesRef = useRef<SalesLine[]>(lines);
  const [selectedLineKey, setSelectedLineKey] = useState("");
  const [selectedLineKeys, setSelectedLineKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [sourceModified, setSourceModified] = useState("");
  const [docstatus, setDocstatus] = useState(0);
  const [fatal, setFatal] = useState("");
  const closeSeen = useRef(props.closeRequest ?? 0);
  const skipCustomerAutofillOnce = useRef(false);
  const lineSeq = useRef(new Map<string, number>());
  const splitLifecycleSeq = useRef(0);
  const splitLifecycleState = useRef(new Map<string, { identity: string; token: number }>());
  const headerSeq = useRef(0);
  const documentName = text(props.name);
  const isExisting = Boolean(documentName);
  const formReadOnly = isExisting && (!canWrite || docstatus !== 0);
  const canSave = isExisting ? !formReadOnly : canCreate;

  const salesServices = useMemo<FieldServices>(() => ({
    ...services,
    searchLink: async (doctype, query, options) => {
      if (doctype !== "Item" || !services.searchLink) {
        return services.searchLink?.(doctype, query, options) ?? [];
      }
      const raw = text(query);
      const words = raw.split(/\s+/).map((word) => word.trim()).filter((word) => word.length >= 2);
      const searches = [...new Set([raw, normalized(raw), ...words, ...words.map(normalized)].filter(Boolean))].slice(0, 8);
      const batches = await Promise.all(searches.map((searchText) => services.searchLink!(doctype, searchText, {
        ...options,
        pageLength: 100,
      }).catch(() => [])));
      const merged = new Map<string, { value: string; description?: string }>();
      for (const option of batches.flat()) {
        if (!merged.has(option.value)) merged.set(option.value, option);
      }
      return [...merged.values()]
        .sort((left, right) => itemSearchScore(right, raw) - itemSearchScore(left, raw)
          || left.value.localeCompare(right.value, "vi"))
        .slice(0, 100);
    },
  }), [services]);

  const childFields = useMemo(
    () => childMeta?.fields.map((field) => field.fieldname).filter(Boolean) ?? [],
    [childMeta],
  );
  const childFieldSet = useMemo(() => new Set(childFields), [childFields]);
  const splitLifecycleFingerprint = useMemo(() => lines
    .map((line) => splitLifecycleDescriptor(line)?.identity ?? `${line._key}:not-split`)
    .join("\u001e"), [lines]);
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
        const [itemMeta, boot, caps, existingResult] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Sales Order", documentName || undefined),
          documentName ? adapter.getDoc("Sales Order", documentName) : Promise.resolve(null),
        ]);
        let sellingPriceLists: Doc[] = [];
        try {
          const priceListSnapshot = await adapter.getListView("Price List", {
            fields: ["name"],
            pageLength: 100,
          });
          const priceLists = await Promise.all(priceListSnapshot.rows.map(async (row) => {
            const name = text(row.name);
            if (!name) return row;
            const { doc } = await adapter.getDoc("Price List", name);
            return { ...row, ...doc } as Doc;
          }));
          sellingPriceLists = priceLists.filter((row) => isActivePriceList(row, today()));
        } catch {
          sellingPriceLists = [];
        }
        if (!active) return;
        const defaults: Json = {
          ...blankFromMeta(salesMeta),
          ...applyContextPolicy("Sales Order", businessContext, contextPolicies).defaults,
        };
        if (!defaults.transaction_date) defaults.transaction_date = today();
        if (!defaults.delivery_date) defaults.delivery_date = today();
        if (!defaults.currency) defaults.currency = boot.sysdefaults.currency || "VND";
        const latestPriceList = newestActivePriceList(sellingPriceLists, text(defaults.transaction_date) || today());
        const latestSellingPriceList = text(latestPriceList?.name)
          || text(latestPriceList?.price_list_name);
        if (latestSellingPriceList) defaults.selling_price_list = latestSellingPriceList;
        const existingDoc = existingResult?.doc as Json | undefined;
        const existingItems = Array.isArray(existingDoc?.items) ? existingDoc.items as Json[] : [];
        const initialHeader = existingDoc
          ? { ...defaults, ...existingDoc, items: undefined }
          : defaults;
        const initialLines = existingDoc ? hydrateSalesLines(existingItems) : [newLine(0)];
        setMeta(salesMeta);
        setChildMeta(itemMeta);
        setCanCreate(Boolean(caps.create));
        setCanWrite(Boolean(caps.write));
        setSourceModified(text(existingDoc?.modified));
        setDocstatus(Number(existingDoc?.docstatus) || 0);
        if (existingDoc && text(existingDoc.customer)) skipCustomerAutofillOnce.current = true;
        setHeader(initialHeader);
        setLines(initialLines);
        setSelectedLineKey(initialLines[0]?._key ?? "");
      } catch (error) {
        if (active) setFatal(mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adapter, businessContext, contextPolicies, documentName]);

  useEffect(() => {
    const customerName = text(header.customer);
    if (!customerName) {
      setCustomerPaymentTerms("");
      headerSeq.current += 1;
      setHeader((current) => ({
        ...current,
        customer_group: undefined,
        contact_person: undefined,
        phone: undefined,
        install_province: undefined,
        install_ward: undefined,
        install_address: undefined,
        shipping_note: undefined,
        responsible_person: undefined,
      }));
      return;
    }
    // Khi mở một đơn đã có, dữ liệu địa chỉ/người phụ trách trên chứng từ là ảnh chụp
    // tại thời điểm lập đơn. Không được lấy Customer hiện tại ghi đè lên chúng chỉ vì
    // form vừa được hydrate. Vẫn đọc điều khoản thanh toán để hiển thị phần tóm tắt.
    if (skipCustomerAutofillOnce.current) {
      skipCustomerAutofillOnce.current = false;
      let active = true;
      void adapter.getDoc("Customer", customerName)
        .then((result) => {
          if (active) setCustomerPaymentTerms(text((result.doc as Json).payment_terms));
        })
        .catch(() => {
          if (active) setCustomerPaymentTerms("");
        });
      return () => {
        active = false;
      };
    }
    setCustomerPaymentTerms("");
    headerSeq.current += 1;
    setHeader((current) => ({
      ...current,
      customer_group: undefined,
      contact_person: undefined,
      phone: undefined,
      install_province: undefined,
      install_ward: undefined,
      install_address: undefined,
      shipping_note: undefined,
      responsible_person: undefined,
    }));
    let active = true;
    void adapter.getDoc("Customer", customerName)
      .then(async (result) => {
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
        setCustomerPaymentTerms(text(customer.payment_terms));
        let applicablePriceList = "";
        const priceGroup = text(customer.price_group) || text(customer.customer_group);
        try {
          const priceListSnapshot = await adapter.getListView("Price List", {
            fields: ["name"],
            pageLength: 100,
          });
          const priceLists = await Promise.all(priceListSnapshot.rows.map(async (row) => {
            const name = text(row.name);
            if (!name) return row;
            const { doc } = await adapter.getDoc("Price List", name);
            return { ...row, ...doc } as Doc;
          }));
          const asOfDate = text(header.transaction_date) || today();
          const latestForGroup = priceGroup ? newestActivePriceList(priceLists, asOfDate, priceGroup) : undefined;
          const latestGeneral = newestActivePriceList(
            priceLists.filter((row) => !text(row.customer_group)),
            asOfDate,
          );
          const selectedPriceList = latestForGroup ?? latestGeneral ?? newestActivePriceList(priceLists, asOfDate);
          applicablePriceList = text(selectedPriceList?.name) || text(selectedPriceList?.price_list_name);
        } catch {
          applicablePriceList = "";
        }
        if (!active) return;
        headerSeq.current += 1;
        setHeader((current) => ({
          ...current,
          customer_group: priceGroup || undefined,
          selling_price_list: applicablePriceList || current.selling_price_list,
          contact_person: text(customer.contact_person) || undefined,
          phone: phone || undefined,
          install_province: text(customer.install_province) || undefined,
          install_ward: text(customer.install_ward) || undefined,
          install_address: text(customer.install_address_line1) || text(customer.address) || undefined,
          shipping_note: text(customer.shipping_note) || undefined,
          responsible_person: text(customer.account_manager) || undefined,
        }));
      })
      .catch(() => {
        if (active) {
          setCustomerPaymentTerms("");
          setHeader((current) => ({
            ...current,
            customer_group: undefined,
            contact_person: undefined,
            phone: undefined,
            install_province: undefined,
            install_ward: undefined,
            install_address: undefined,
            shipping_note: undefined,
            responsible_person: undefined,
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [adapter, header.customer]);

  const cleanLine = useCallback((line: SalesLine): Json => {
    const result: Json = {};
    for (const [key, value] of Object.entries(line)) {
      // Giữ name/doctype của child row khi sửa để Frappe cập nhật đúng dòng cũ,
      // thay vì xóa rồi sinh lại toàn bộ Sales Order Item.
      const existingChildIdentity = isExisting && (key === "name" || key === "doctype");
      if (!key.startsWith("_") && (childFieldSet.has(key) || existingChildIdentity) && value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }, [childFieldSet, isExisting]);

  const flattenLines = useCallback((source: SalesLine[]): SalesLine[] => source.flatMap((line) => [
    line,
    ...(line._splitChildren ?? []),
  ]), []);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const patchLine = useCallback((key: string, patch: Partial<SalesLine>) => {
    const next = linesRef.current.map((line) => (
      line._key === key ? { ...line, ...patch } : line
    ));
    linesRef.current = next;
    setLines(next);
  }, []);

  const previewDocument = useCallback(async (
    next: Json,
    changedField: string,
    currentLines = lines,
  ): Promise<Json> => {
    const result = await adapter.callPost<Json>("alumdoor.ui.preview_document", {
      doctype: "Sales Order",
      doc: { ...next, items: flattenLines(currentLines).map(cleanLine) },
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
  }, [adapter, cleanLine, flattenLines, lines]);

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
    const rows: Doc[] = [];
    const pageLength = 100;
    for (let limitStart = 0; ; limitStart += pageLength) {
      // The server caps generic list responses at 100 rows even when a larger
      // limit is requested. Sales Option now exceeds that cap, so every page
      // must be read before scoping the choices to the current Item.
      const page = await adapter.getList("Sales Option", {
        // Navigation-only fields such as target_item_rules are intentionally
        // loaded from getDoc below because older metadata caches may reject
        // them in list projections.
        fields: [
          "name",
          "option_label",
          "item_group",
          "item_code",
          "disabled",
          "price_variant",
          "sales_package",
        ],
        pageLength,
        limitStart,
      });
      rows.push(...page);
      if (page.length < pageLength) break;
    }
    const scopedRows = rows.filter((row) => {
      if (row.disabled === true || row.disabled === 1 || text(row.disabled) === "1") return false;
      const scopedItem = text(row.item_code);
      if (scopedItem && scopedItem !== itemCode) return false;
      const scopedGroup = text(row.item_group);
      if (scopedGroup && commercialNormalized(scopedGroup) !== commercialNormalized(itemGroup)) return false;
      return true;
    });
    const detailedRows = await Promise.all(scopedRows.map(async (row) => {
      const name = text(row.name);
      if (!name) return row;
      const { doc } = await adapter.getDoc("Sales Option", name);
      return { ...row, ...doc } as Doc;
    }));
    return detailedRows
      .sort((left, right) => (Number(right.priority) || 0) - (Number(left.priority) || 0) || text(left.option_label).localeCompare(text(right.option_label), "vi"));
  }, [adapter]);


  const loadItemPrices = useCallback(async (itemCode: string): Promise<Doc[]> => {
    const priceList = text(header.selling_price_list);
    if (!itemCode || !priceList) return [];
    try {
      const rows = await adapter.getList("Item Price", {
        fields: ["name", "price_list", "item_code", "uom", "price_variant", "currency", "rate", "disabled"],
        // Item Price.disabled is readable but is not an allowed server filter in the
        // current DocType metadata. Filtering it here made the endpoint return 417 and
        // silently emptied every price choice on this screen.
        filters: { item_code: itemCode, price_list: priceList },
        pageLength: 200,
      });
      const currency = text(header.currency);
      return rows
        .filter((row) => !(row.disabled === true || row.disabled === 1 || text(row.disabled) === "1" || text(row.disabled).toLowerCase() === "true"))
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

  const previewSplitChild = useCallback(async (source: SalesLine): Promise<SalesLine> => {
    const child = { ...source, _loading: true, _pricingError: "", _error: "" } as SalesLine;
    try {
      const [commercial, itemResult] = await Promise.all([
        adapter.callPost<Json>("metaforge.api.preview_sales_commercial_line", {
          line: cleanLine(child),
          price_list: text(header.selling_price_list),
          currency: text(header.currency) || "VND",
          posting_date: text(header.transaction_date) || today(),
          customer: text(header.customer),
          customer_group: text(header.customer_group),
        }),
        adapter.getDoc("Item", text(child.item_code)).catch(() => null),
      ]);
      const sellingRate = numberValue(commercial.selling_rate ?? commercial.rate);
      const grossAmount = numberValue(commercial.gross_amount);
      const discountPercentage = numberValue(commercial.discount_percentage);
      const discountAmount = numberValue(commercial.discount_amount);
      const adjustmentAmount = numberValue(commercial.adjustment_amount);
      const netAmount = numberValue(commercial.net_before_tax ?? commercial.net_amount ?? commercial.amount);
      return {
        ...child,
        ...(sellingRate === undefined ? {} : { rate: sellingRate }),
        ...(grossAmount === undefined ? {} : { amount: grossAmount }),
        ...(discountPercentage === undefined ? {} : { discount_percentage: discountPercentage }),
        ...(discountAmount === undefined ? {} : { discount_amount: discountAmount }),
        ...(adjustmentAmount === undefined ? {} : { adjustment_amount: adjustmentAmount }),
        ...(netAmount === undefined ? {} : { net_amount: netAmount }),
        ...(text(commercial.sales_option) ? { sales_option: text(commercial.sales_option) } : {}),
        ...(text(commercial.sales_mode) ? { sales_mode: text(commercial.sales_mode) } : {}),
        _commercial: commercial,
        _itemLabel: text((itemResult?.doc as Json | undefined)?.item_name) || text(child.item_code),
        _loading: false,
        _pricingError: "",
      };
    } catch (error) {
      return { ...child, _loading: false, _pricingError: mapError(error).message };
    }
  }, [adapter, cleanLine, header]);

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

      if (changedField === "item_code" && context.is_sales_package_component) {
        patchLine(row._key, {
          ...patch,
          _context: context,
          _allowedColors: [],
          _overrides: {},
          _salesOptions: [],
          _itemPrices: [],
          _commercial: undefined,
          _loading: false,
          _error: "Đây là món tách của gói bán. Hãy chọn mặt hàng cửa trọn bộ làm dòng chính, rồi chọn cách bán Tách món.",
          _pricingError: "",
        });
        return;
      }

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

      // Keep the Sales Order responsive while the customer/price context is still
      // resolving. The detailed row already captures the billable width, height and
      // number of sets, so an area-based item must not fall back to an empty quantity.
      // A later authoritative preview can still replace this provisional value with
      // the policy result (minimum area, deductions, etc.).
      const provisionalLine = { ...row, ...next, _context: context } as SalesLine;
      const provisionalAreaQty = isAreaDoor(provisionalLine) ? areaQuantity(provisionalLine) : undefined;
      if (numberValue(next.qty) === undefined && provisionalAreaQty !== undefined) {
        next.qty = provisionalAreaQty;
        next.billable_area_sqm = provisionalAreaQty;
      }
      if (changedField === "item_code") {
        const defaultDiscount = family({ ...row, ...next, _context: context } as SalesLine) === "german" ? 15 : 0;
        next.discount_percentage = defaultDiscount;
        // Show the policy default as soon as the Item group is known; option and
        // price loading can continue while the authoritative resolver verifies it.
        patchLine(row._key, { discount_percentage: defaultDiscount });
      }

      let options = source._salesOptions ?? [];
      if (changedField === "item_code" || changedField === "parent_context" || options.length === 0) {
        options = await loadSalesOptions(text(row.item_code), text(context.item_group));
        if (lineSeq.current.get(row._key) !== seq) return;
      }
      let itemPrices = source._itemPrices ?? [];
      if (changedField === "item_code" || changedField === "parent_context" || itemPrices.length === 0) {
        itemPrices = await loadItemPrices(text(row.item_code));
        if (lineSeq.current.get(row._key) !== seq) return;
      }
      next._itemPrices = itemPrices;
      options = salesOptionsWithAvailablePrices(options, itemPrices);
      next._salesOptions = options;

      // item_context already resolves the Item master default sales UOM. Feed that
      // projection into the shared commercial resolver; do not calculate money here.
      const selectedUom = text(context.selected_uom);
      if (!text(row.uom) && !text(next.uom) && selectedUom) next.uom = selectedUom;

      let candidate = { ...row, ...next, _context: context } as SalesLine;
      const applicableOptions = options.filter((option) => salesOptionApplicable(option, candidate));
      const selected = text(candidate.sales_option);
      if (selected && !options.some((option) => String(option.name) === selected)) {
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
      const activeOption = options.find((option) => text(option.name) === text(candidate.sales_option));
      const syncedLeafVariant = salesOptionLeafVariant(activeOption);
      if (syncedLeafVariant && text(candidate.leaf_variant) !== syncedLeafVariant) {
        next.leaf_variant = syncedLeafVariant;
        candidate = { ...candidate, leaf_variant: syncedLeafVariant } as SalesLine;
      }

      const pricedQty = numberValue(candidate.qty);
      const priceList = text(header.selling_price_list);
      if (pricedQty && pricedQty > 0 && priceList && text(candidate.uom)) {
        try {
const commercialLine = cleanLine(candidate);
const billableArea = numberValue(candidate.billable_area_sqm)
  ?? (isAreaDoor(candidate) ? pricedQty : undefined);
if (billableArea !== undefined) {
  commercialLine.billable_area_sqm = billableArea;
  next.billable_area_sqm = billableArea;
}
const commercial = await adapter.callPost<Json>("metaforge.api.preview_sales_commercial_line", {
  line: commercialLine,
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
if (text(commercial.sales_mode)) next.sales_mode = text(commercial.sales_mode);
next._commercial = commercial;
next._selectedItemPrice = text(commercial.item_price) || next._selectedItemPrice;
next._pricingError = "";

const snapshot = commercial.sales_package_snapshot;
const snapshotData = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as Json : undefined;
const components = Array.isArray(snapshotData?.components)
  ? snapshotData.components.filter((entry): entry is Json => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
  : [];
const selectable = normalized(commercial.sales_mode) === "tach mon"
  && text(snapshotData?.selection_mode).toUpperCase() === "SELECTABLE";
if (selectable) {
  const componentByKey = new Map(components.map((component) => [text(component.component_key), component]));
  const packageChanged = text(source._splitPackageChecksum) !== text(snapshotData?.sales_package_checksum);
  const existingChildren = (source._splitChildren ?? []).filter((child) => componentByKey.has(text(child.sales_package_component_key)));
  const selectedKeys = new Set(existingChildren.map((child) => text(child.sales_package_component_key)));
  if (packageChanged) {
    for (const component of components) {
      const shouldSelect = component.required === true || component.required === 1
        || component.default_selected === true || component.default_selected === 1;
      const componentKey = text(component.component_key);
      if (!shouldSelect || !componentKey || selectedKeys.has(componentKey)) continue;
      existingChildren.push(splitChildFromComponent(candidate, component));
      selectedKeys.add(componentKey);
    }
  }
  const synchronized = existingChildren.map((child) => {
    const component = componentByKey.get(text(child.sales_package_component_key))!;
    const inheritColor = component.inherit_color === true || component.inherit_color === 1;
    const inheritDimensions = component.inherit_dimensions === true || component.inherit_dimensions === 1;
    const inheritSetCount = component.inherit_set_count === true || component.inherit_set_count === 1;
    return {
      ...child,
      item_code: text(component.item_code),
      uom: text(component.uom),
      qty: numberValue(component.qty) ?? child.qty,
      ...(inheritColor ? { color: candidate.color } : {}),
      ...(inheritDimensions ? {
        width_m: candidate.width_m,
        height_m: candidate.height_m,
        billable_area_sqm: candidate.billable_area_sqm,
        length_m: candidate.length_m,
      } : {}),
      ...(inheritSetCount ? { set_count: candidate.set_count } : {}),
      ...(text(component.sales_option) ? { sales_option: text(component.sales_option) } : {}),
    } as SalesLine;
  });
  next._splitChildren = await Promise.all(synchronized.map((child) => previewSplitChild(child)));
  next._splitPackageChecksum = text(snapshotData?.sales_package_checksum);
} else if ((source._splitChildren?.length ?? 0) === 0) {
  next._splitChildren = [];
  next._splitPackageChecksum = undefined;
}
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
  }, [adapter, childFieldSet, childFields, childMeta, cleanLine, header, loadItemPrices, loadSalesOptions, patchLine, previewSplitChild]);

  useEffect(() => {
    const liveKeys = new Set(linesRef.current.map((line) => line._key));
    for (const key of splitLifecycleState.current.keys()) {
      if (!liveKeys.has(key)) splitLifecycleState.current.delete(key);
    }

    for (const line of linesRef.current) {
      const descriptor = splitLifecycleDescriptor(line);
      if (!descriptor) {
        splitLifecycleState.current.delete(line._key);
        continue;
      }
      const previous = splitLifecycleState.current.get(line._key);
      if (previous?.identity === descriptor.identity) continue;

      const token = ++splitLifecycleSeq.current;
      splitLifecycleState.current.set(line._key, { identity: descriptor.identity, token });
      const isCurrent = () => {
        const lifecycle = splitLifecycleState.current.get(line._key);
        const current = linesRef.current.find((candidate) => candidate._key === line._key);
        return lifecycle?.token === token
          && lifecycle.identity === descriptor.identity
          && splitLifecycleDescriptor(current)?.identity === descriptor.identity;
      };

      void (async () => {
        try {
          const currentSnapshot = splitSnapshot(line);
          const snapshotPackage = text(currentSnapshot?.sales_package);
          const snapshotComponents = Array.isArray(currentSnapshot?.components) ? currentSnapshot.components : [];
          const hasCurrentSnapshot = snapshotPackage === descriptor.packageName
            && text(currentSnapshot?.selection_mode).toUpperCase() === "SELECTABLE"
            && snapshotComponents.length > 0;

          if (!hasCurrentSnapshot) {
            const { doc } = await adapter.getDoc("Sales Package", descriptor.packageName);
            if (!isCurrent()) return;
            const packageDoc = doc as Json;
            const rows = Array.isArray(packageDoc.items) ? packageDoc.items : packageDoc.components;
            const components = Array.isArray(rows)
              ? rows.filter((entry): entry is Json => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
              : [];
            if (text(packageDoc.selection_mode).toUpperCase() !== "SELECTABLE" || components.length === 0) {
              throw new Error(`Gói bán ${descriptor.packageName} chưa có danh sách món tách hợp lệ.`);
            }
            patchLine(line._key, {
              sales_package: descriptor.packageName,
              sales_package_snapshot: {
                sales_package: descriptor.packageName,
                selection_mode: "SELECTABLE",
                components,
              },
              _error: "",
            });
          }

          if (!isCurrent()) return;
          const current = linesRef.current.find((candidate) => candidate._key === line._key);
          if (current) await previewLine(current, "sales_option");
        } catch (error) {
          if (!isCurrent()) return;
          patchLine(line._key, {
            _loading: false,
            _error: `Không tải được món tách: ${mapError(error).message}`,
          });
        }
      })();
    }
  }, [adapter, patchLine, previewLine, splitLifecycleFingerprint]);

  const commitLine = useCallback((key: string, field: string, value: unknown) => {
    const current = linesRef.current.find((line) => line._key === key);
    if (!current) return;
    patchLine(key, { [field]: value });
    void previewLine(current, field, { [field]: value });
  }, [patchLine, previewLine]);

  const commitCurrentLineField = useCallback((key: string, field: string, fallback?: unknown) => {
    const current = linesRef.current.find((line) => line._key === key);
    commitLine(key, field, current?.[field] ?? fallback);
  }, [commitLine]);

  const toggleSplitComponent = useCallback((parentKey: string, component: Json, checked: boolean) => {
    const parent = lines.find((line) => line._key === parentKey);
    if (!parent) return;
    const componentKey = text(component.component_key);
    const currentChildren = parent._splitChildren ?? [];
    if (!checked) {
      patchLine(parentKey, {
        _splitChildren: currentChildren.filter((child) => text(child.sales_package_component_key) !== componentKey),
      });
      return;
    }
    if (currentChildren.some((child) => text(child.sales_package_component_key) === componentKey)) return;
    const groupKey = text(parent.sales_package_group_key) || salesGroupKey();
    const child = splitChildFromComponent({ ...parent, sales_package_group_key: groupKey }, component);
    patchLine(parentKey, {
      sales_package_group_key: groupKey,
      _splitChildren: [...currentChildren, child],
    });
    void previewSplitChild(child).then((priced) => {
      setLines((current) => current.map((line) => line._key !== parentKey ? line : {
        ...line,
        _splitChildren: (line._splitChildren ?? []).map((candidate) => candidate._key === child._key ? priced : candidate),
      }));
    });
  }, [lines, patchLine, previewSplitChild]);

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

    const optionMode = text(option?.sales_mode) || text(option?.option_label);
    const splitMode = normalized(optionMode) === "tach mon";
    const packageName = splitMode
      ? text(option?.sales_package) || `PKG-SPLIT:${text(current.item_code)}`
      : undefined;
    const patch: Partial<SalesLine> = {
      _selectedItemPrice: priceName,
      ...(text(price.uom) ? { uom: text(price.uom) } : {}),
      ...(option?.name ? { sales_option: text(option.name) } : {}),
      ...(option?.name ? { sales_mode: optionMode || undefined } : {}),
      ...(salesOptionLeafVariant(option) ? { leaf_variant: salesOptionLeafVariant(option) } : {}),
      sales_package: packageName,
      sales_package_snapshot: undefined,
      _splitChildren: [],
      _splitPackageChecksum: undefined,
    };
    if (splitMode) {
      lineSeq.current.set(key, (lineSeq.current.get(key) ?? 0) + 1);
      patchLine(key, { ...patch, _commercial: undefined, _pricingError: "", _error: "" });
      return;
    }
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
      if ((current._splitChildren?.length ?? 0) > 0
        && !window.confirm("Đổi mặt hàng sẽ bỏ các món tách đang chọn của dòng này. Tiếp tục?")) return;
      lineSeq.current.set(key, (lineSeq.current.get(key) ?? 0) + 1);
      const itemCode = text(value);
      const reset: Partial<SalesLine> = {
        item_code: itemCode || undefined,
        // ĐVT thuộc về Item vừa chọn. Không giữ lại ĐVT của dòng cũ (ví dụ "Cái"),
        // nếu không preview sẽ gửi UOM cũ lên server trước khi kịp tự điền UOM mới.
        uom: undefined,
        _itemLabel: undefined,
        sales_option: undefined,
        leaf_variant: undefined,
        _context: undefined,
        _salesOptions: [],
        _itemPrices: [],
        _selectedItemPrice: undefined,
        _allowedColors: [],
        _overrides: {},
        _commercial: undefined,
        sales_package: undefined,
        sales_package_snapshot: undefined,
        _splitChildren: [],
        _splitPackageChecksum: undefined,
        discount_percentage: undefined,
        discount_amount: undefined,
        adjustment_amount: undefined,
        net_amount: undefined,
        _pricingError: "",
        _error: "",
      };
      patchLine(key, reset);
      if (itemCode) void previewLine({ ...current, ...reset } as SalesLine, "item_code", reset);
      return;
    }
    if (field === "sales_option") {
      const optionName = text(value);
      const option = (current._salesOptions ?? []).find((candidate) => text(candidate.name) === optionName);
      const syncedLeafVariant = salesOptionLeafVariant(option);
      const optionMode = text(option?.sales_mode) || text(option?.option_label);
      const splitMode = normalized(optionMode) === "tach mon";
      if (!splitMode && (current._splitChildren?.length ?? 0) > 0
        && !window.confirm("Đổi cách bán sẽ bỏ các món tách đang chọn của dòng này. Tiếp tục?")) return;
      if (splitMode) {
        const configuredPackage = text(option?.sales_package);
        const packageName = configuredPackage || `PKG-SPLIT:${text(current.item_code)}`;
        lineSeq.current.set(key, (lineSeq.current.get(key) ?? 0) + 1);
        const selectionPatch: Partial<SalesLine> = {
          sales_option: optionName || undefined,
          sales_mode: optionMode || "Tách món",
          sales_package: packageName,
          ...(syncedLeafVariant ? { leaf_variant: syncedLeafVariant } : {}),
          _commercial: undefined,
          sales_package_snapshot: undefined,
          _splitChildren: [],
          _splitPackageChecksum: undefined,
          _pricingError: "",
          _error: "",
        };
        // The split-package lifecycle reacts to this state transition and performs
        // package hydration followed by commercial preview in a deterministic order.
        patchLine(key, selectionPatch);
        return;
      }
      const targetItem = option ? salesOptionTargetItem(option, current) : "";
      const hasTargetRules = option ? salesOptionTargetRules(option.target_item_rules).length > 0 : false;
      if (hasTargetRules && !targetItem) {
        patchLine(key, {
          _error: "Cần nhập đủ kích thước để xác định đúng bậc giá của cách bán này.",
        });
        return;
      }
      if (targetItem && targetItem !== text(current.item_code)) {
        lineSeq.current.set(key, (lineSeq.current.get(key) ?? 0) + 1);
        const reset: Partial<SalesLine> = {
          item_code: targetItem,
          uom: undefined,
          _itemLabel: undefined,
          sales_option: undefined,
          ...(syncedLeafVariant ? { leaf_variant: syncedLeafVariant } : {}),
          _context: undefined,
          _salesOptions: [],
          _itemPrices: [],
          _selectedItemPrice: undefined,
          _allowedColors: [],
          _overrides: {},
          _commercial: undefined,
          sales_package: undefined,
          sales_package_snapshot: undefined,
          _splitChildren: [],
          _splitPackageChecksum: undefined,
          discount_percentage: undefined,
          discount_amount: undefined,
          adjustment_amount: undefined,
          net_amount: undefined,
          _pricingError: "",
          _error: "",
        };
        patchLine(key, reset);
        void previewLine({ ...current, ...reset } as SalesLine, "item_code", reset);
        return;
      }
      if (syncedLeafVariant) {
        const patch: Partial<SalesLine> = {
          sales_option: optionName || undefined,
          sales_mode: optionMode || undefined,
          leaf_variant: syncedLeafVariant,
          sales_package: undefined,
          sales_package_snapshot: undefined,
          _splitChildren: [],
          _splitPackageChecksum: undefined,
        };
        patchLine(key, patch);
        void previewLine({ ...current, ...patch } as SalesLine, "sales_option", patch);
        return;
      }
      const patch: Partial<SalesLine> = {
        sales_option: optionName || undefined,
        sales_mode: optionMode || undefined,
        sales_package: undefined,
        sales_package_snapshot: undefined,
        _splitChildren: [],
        _splitPackageChecksum: undefined,
      };
      patchLine(key, patch);
      void previewLine({ ...current, ...patch } as SalesLine, "sales_option", patch);
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

  const addMultipleSalesLines = useCallback(() => {
    const fresh = Array.from({ length: 5 }, (_, offset) => newLine(lines.length + offset));
    setLines((current) => [...current, ...fresh]);
    setSelectedLineKey(fresh[0]?._key ?? "");
  }, [lines.length]);

  const toggleSalesLineSelection = useCallback((key: string, checked: boolean) => {
    setSelectedLineKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const toggleAllSalesLines = useCallback((checked: boolean) => {
    setSelectedLineKeys(checked ? new Set(lines.map((line) => line._key)) : new Set());
  }, [lines]);

  const deleteSelectedSalesLines = useCallback(() => {
    if (!selectedLineKeys.size) return;
    const selectedCount = selectedLineKeys.size;
    const remaining = lines.filter((line) => !selectedLineKeys.has(line._key));
    const next = remaining.length ? remaining : [newLine(0)];
    setLines(next);
    setSelectedLineKeys(new Set());
    setSelectedLineKey(next[0]?._key ?? "");
    toast.success(`Đã xóa ${selectedCount} dòng`);
  }, [lines, selectedLineKeys]);

  const duplicateSalesLine = useCallback((key: string) => {
    const source = lines.find((line) => line._key === key);
    if (!source) return;
    const groupKey = salesGroupKey();
    const clone: SalesLine = {
      ...source,
      _key: newLine(lines.length)._key,
      sales_package_group_key: groupKey,
      _splitChildren: (source._splitChildren ?? []).map((child) => ({
        ...child,
        name: undefined,
        _key: `sales-child-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sales_package_parent_key: groupKey,
      })),
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
    const existingKeys = new Set(lines.map((line) => line._key));
    setSelectedLineKeys((current) => {
      const next = new Set([...current].filter((key) => existingKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [lines]);

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
      const components = splitComponents(line);
      if (components.length && (line._splitChildren?.length ?? 0) === 0) {
        return `Dòng ${index + 1}: hãy tích chọn ít nhất một món tách.`;
      }
      for (const child of line._splitChildren ?? []) {
        if (child._loading) return `Dòng ${index + 1}: món ${text(child.item_code)} đang tính giá.`;
        if (child._error || child._pricingError) {
          return `Dòng ${index + 1} · ${text(child.item_code)}: ${salesLineErrorInVietnamese(child._error || child._pricingError, child)}`;
        }
      }
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
      document.items = flattenLines(lines).map(cleanLine);
      const finalPreview = await previewDocument(document, "items", lines);
      const payload = serializeCreateDocument(meta, finalPreview) as Partial<Doc>;
      const saved = isExisting
        ? await adapter.updateDoc("Sales Order", documentName, payload, sourceModified)
        : await adapter.createDoc("Sales Order", payload);
      const savedName = text(saved.name) || documentName;
      setSourceModified(text(saved.modified));
      setDocstatus(Number(saved.docstatus) || 0);
      queryClient.setQueryData(
        [scopeKey, "doc", "Sales Order", savedName],
        (current: { doc: Doc; docinfo: unknown } | undefined) => current
          ? { ...current, doc: saved }
          : current,
      );
      const savedItems = Array.isArray(saved.items) ? saved.items as Json[] : [];
      if (savedItems.length) setLines(hydrateSalesLines(savedItems));
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
      toast.success(isExisting ? `Đã lưu đơn ${savedName}` : `Đã tạo đơn ${savedName}`);
      if (previewAfterSave) props.onPreviewCreated(savedName);
      else if (isExisting) props.onSaved?.(savedName);
      else props.onCreated(savedName);
    } catch (cause) {
      toast.error(mapError(cause).message);
    } finally {
      setSaving(false);
    }
  }, [adapter, cleanLine, documentName, flattenLines, header, isExisting, lines, meta, previewDocument, props, queryClient, scopeKey, sourceModified, validate]);

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
  const paymentMethodOptions = optionList(meta, "payment_method", ["Tiền mặt", "Chuyển khoản", "Ghi công nợ"]);
  const paymentMethod = text(header.payment_method) || "Ghi công nợ";
  const salesRequiredClass = "[&_.mf-control]:bg-primary/[0.07]";

  const displayedTotal = lines.reduce((sum, line) => sum + lineClusterTotal(line), 0);

  const gridRows = lines.map((line) => {
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
    const displayedQuantity = quantityField === "set_count"
      ? numberValue(line.set_count)
      : quantityField === "qty"
        ? numberValue(line.qty)
        : numberValue(commercial.priced_qty) ?? numberValue(line.qty);
    const splitProjection = splitParentProjection(line);
    const sellingRate = splitProjection.rate ?? numberValue(commercial.selling_rate) ?? numberValue(line.rate);
    const discountAmount = splitProjection.discount ?? numberValue(commercial.discount_amount) ?? numberValue(line.discount_amount) ?? 0;
    const discountPercentage = numberValue(commercial.discount_percentage) ?? numberValue(line.discount_percentage) ?? 0;
    const adjustmentAmount = numberValue(commercial.adjustment_amount) ?? numberValue(line.adjustment_amount) ?? 0;
    const netAmount = splitProjection.net ?? numberValue(commercial.net_before_tax) ?? lineTotal(line);
    const allOptions = line._salesOptions ?? [];
    const applicableOptions = allOptions.filter((option) => salesOptionApplicable(option, line));
    const optionChoices = allOptions.length > 0
      ? allOptions.map((option) => ({
        value: text(option.name),
        label: text(option.option_label) || text(option.name),
      }))
      : [{ value: STANDARD_SALES_OPTION, label: "Tiêu chuẩn" }];
    const selectedOption = allOptions.find((option) => text(option.name) === text(line.sales_option));
    const salesOptionLabel = text(commercial.sales_option_label)
      || text(selectedOption?.option_label)
      || text(line.sales_option);

    const allowedVariants = new Set(allOptions.map((option) => priceVariant(option.price_variant)));
    const rawPrices = line._itemPrices ?? [];
    const selectablePrices = rawPrices.filter((price) => {
      if (applicableOptions.length === 0) return priceVariant(price.price_variant) === "STANDARD";
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
      quantity: displayedQuantity,
      quantityField,
      quantityEditable: Boolean(quantityField && !fieldReadonly(line, quantityField)),
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
  const lineNotices = gridRows.flatMap((row, index) => {
    const message = row.error || row.pricingError;
    const parentNotice = message
      ? [{ key: row.key, message: `Dòng ${index + 1}: ${salesLineErrorInVietnamese(message, lines[index]!)}` }]
      : [];
    const childNotices = (lines[index]?._splitChildren ?? []).flatMap((child) => {
      const childMessage = child._error || child._pricingError;
      return childMessage
        ? [{ key: `${row.key}-${child._key}`, message: `Dòng ${index + 1} · ${text(child._itemLabel) || text(child.item_code)}: ${salesLineErrorInVietnamese(childMessage, child)}` }]
        : [];
    });
    return [...parentNotice, ...childNotices];
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-sales-order-form">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1760px] space-y-3 px-4 py-3">
          {formReadOnly ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground" role="status">
              Đơn {documentName} đang ở trạng thái chỉ xem nên không thể sửa dòng hàng.
            </div>
          ) : null}
          <fieldset disabled={formReadOnly} className="contents">
          <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex h-9 items-center border-b border-primary-foreground/25 bg-primary px-3">
            <h2 className="text-sm font-semibold text-primary-foreground">Thông tin đơn hàng</h2>
          </div>
          <div className="grid bg-accent md:grid-cols-3" data-section="sales-customer-meta-titles">
            <h3 className="flex h-9 items-center border-b border-input px-3 text-sm font-semibold text-accent-foreground md:border-b-0 md:border-r">Thông tin khách hàng</h3>
            <h3 className="flex h-9 items-center border-b border-input px-3 text-sm font-semibold text-accent-foreground md:border-b-0 md:border-r">Thông tin đơn hàng</h3>
            <h3 className="flex h-9 items-center px-3 text-sm font-semibold text-accent-foreground">Giá & thanh toán</h3>
          </div>
          {headerOpen ? <div className="relative border-t py-2" data-section="sales-customer-meta-header">
            <div className="pointer-events-none absolute inset-y-0 left-2/3 hidden border-l md:block" />
            <div className="grid items-start md:grid-cols-3">
              <div className="min-w-0 space-y-2 px-3 pb-1 md:border-r">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
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
                    required
                    className={salesRequiredClass}
                  />
                  <StandardField
                    id="sales-customer-group"
                    field={headerField("customer_group", "Nh\u00f3m gi\u00e1", "Select", "\u0110\u1ea1i l\u00fd\nL\u1ebb")}
                    value={header.customer_group}
                    onChange={() => undefined}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order"
                    docValues={header}
                    roles={roles}
                    label="Nhóm giá"
                    readOnly
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <StandardField
                    id="sales-contact-person"
                    field={headerField("contact_person", "Ng\u01b0\u1eddi li\u00ean h\u1ec7")}
                    value={header.contact_person}
                    onChange={(value) => setHeaderField("contact_person", text(value) || undefined)}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order"
                    docValues={header}
                    roles={roles}
                    required
                    className={salesRequiredClass}
                  />
                  <StandardField
                    id="sales-phone"
                    field={headerField("phone", "S\u0110T")}
                    value={header.phone}
                    onChange={(value) => setHeaderField("phone", text(value) || undefined)}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order"
                    docValues={header}
                    roles={roles}
                    required
                    className={salesRequiredClass}
                  />
                </div>
                <div className="border-t pt-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <StandardField
                      id="sales-province"
                      field={headerField("install_province", "Tỉnh/TP", "Link", "Tỉnh Thành")}
                      value={header.install_province}
                      onChange={(value) => setHeader((current) => ({
                        ...current,
                        install_province: text(value) || undefined,
                        install_ward: undefined,
                      }))}
                      registry={registry}
                      services={services}
                      parentDoctype="Sales Order"
                      docValues={header}
                      roles={roles}
                      required
                      className={salesRequiredClass}
                    />
                    <StandardField
                      id="sales-ward"
                      field={headerField("install_ward", "Xã/Phường", "Link", "Phường Xã")}
                      value={header.install_ward}
                      onChange={(value) => setHeaderField("install_ward", text(value) || undefined)}
                      registry={registry}
                      services={services}
                      parentDoctype="Sales Order"
                      docValues={header}
                      roles={roles}
                      required
                      className={salesRequiredClass}
                    />
                  </div>
                  <StandardField
                    id="sales-address"
                    field={{ ...headerField("install_address", "Số nhà, tên đường", "Data"), fieldtype: "Data" } as DocField}
                    value={header.install_address}
                    onChange={(value) => setHeaderField("install_address", text(value) || undefined)}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order"
                    docValues={header}
                    roles={roles}
                    required
                    className={`mt-2 ${salesRequiredClass}`}
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-2 px-3 pb-1">
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
                  required
                  label="Nhân viên bán hàng"
                  className={salesRequiredClass}
                />
                <div className="grid gap-2 sm:grid-cols-2">
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
                    required
                    label="Ngày đặt hàng"
                    className={`w-[150px] ${salesRequiredClass}`}
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
                    required
                    label="Ngày giao"
                    className={`w-[150px] ${salesRequiredClass}`}
                  />
                </div>
                <StandardField
                  id="sales-shipping-note"
                  field={{ ...headerField("shipping_note", "Ghi chú giao hàng", "Data"), fieldtype: "Data" } as DocField}
                  value={header.shipping_note}
                  onChange={(value) => setHeaderField("shipping_note", text(value) || undefined)}
                  registry={registry}
                  services={services}
                  parentDoctype="Sales Order"
                  docValues={header}
                  roles={roles}
                />
                <StandardField
                  id="sales-production-note"
                  field={{ ...headerField("manual_note", "Ghi chú vận hành", "Data"), fieldtype: "Data" } as DocField}
                  value={header.manual_note}
                  onChange={(value) => setHeaderField("manual_note", text(value) || undefined)}
                  registry={registry}
                  services={services}
                  parentDoctype="Sales Order"
                  docValues={header}
                  roles={roles}
                />
              </div>

              <div className="min-w-0 space-y-2 px-3 md:row-span-2">
                <StandardField
                  id="sales-price-list"
                  field={headerField("selling_price_list", "Bảng giá", "Link", "Price List")}
                  value={header.selling_price_list}
                  onChange={(value) => setHeaderField("selling_price_list", text(value) || undefined, true)}
                  registry={registry}
                  services={services}
                  parentDoctype="Sales Order"
                  docValues={header}
                  roles={roles}
                  required
                  label="Bảng giá"
                  className={salesRequiredClass}
                />
                <div className="min-w-0">
                  <div className="mb-1 text-[13px] font-medium leading-tight text-foreground">Hình thức thanh toán<span className="ml-0.5 text-destructive">*</span></div>
                  <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Hình thức thanh toán">
                    {paymentMethodOptions.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        size="sm"
                        variant={paymentMethod === option ? "default" : "outline"}
                        className="h-8 min-w-0 px-1 text-xs"
                        aria-pressed={paymentMethod === option}
                        onClick={() => setHeaderField("payment_method", option)}
                      >
                        <span className="truncate">{option}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                {paymentMethod === "Ghi công nợ" ? (
                  <StandardField
                    id="sales-payment-terms"
                    field={fallbackField("__customer_payment_terms", "Th\u1eddi h\u1ea1n c\u00f4ng n\u1ee3")}
                    value={customerPaymentTerms || "Trả ngay"}
                    onChange={() => undefined}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order"
                    docValues={header}
                    roles={roles}
                    readOnly
                  />
                ) : null}
                {paymentMethod === "Chuyển khoản" ? (
                  <StandardField
                    id="sales-bank-account"
                    field={headerField("bank_account", "Tài khoản ngân hàng", "Link", "Tài khoản ngân hàng")}
                    value={header.bank_account}
                    onChange={(value) => setHeaderField("bank_account", text(value) || undefined)}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order"
                    docValues={header}
                    roles={roles}
                  />
                ) : null}
              </div>
            </div>
          </div> : <div className="grid border-t bg-card text-sm md:grid-cols-3" data-section="sales-customer-meta-summary">
            <div className="min-w-0 border-b px-3 py-2 md:border-b-0 md:border-r">
              <div className={`truncate font-medium ${!text(header.customer) ? "text-destructive" : "text-foreground"}`}>{text(header.customer) || "Chưa chọn khách hàng"}</div>
              <div className="truncate text-xs text-foreground">
                {[text(header.contact_person), text(header.phone), text(header.install_address)].filter(Boolean).join(" · ") || "Chưa có liên hệ hoặc địa chỉ"}
              </div>
            </div>
            <div className="min-w-0 border-b px-3 py-2 md:border-b-0 md:border-r">
              <div className={`truncate font-medium ${!text(header.responsible_person) ? "text-destructive" : "text-foreground"}`}>{text(header.responsible_person) || "Chưa chọn nhân viên"}</div>
              <div className="truncate text-xs text-foreground">
                {[text(header.transaction_date) && `Đặt: ${text(header.transaction_date)}`, text(header.delivery_date) && `Giao: ${text(header.delivery_date)}`].filter(Boolean).join(" · ") || "Chưa có ngày giao"}
              </div>
            </div>
            <div className="min-w-0 px-3 py-2">
              <div className={`truncate font-medium ${!text(header.selling_price_list) ? "text-destructive" : "text-foreground"}`}>{text(header.selling_price_list) || "Chưa chọn bảng giá"}</div>
              <div className="truncate text-xs text-foreground">
                {[paymentMethod, paymentMethod === "Ghi công nợ" ? (customerPaymentTerms || "Trả ngay") : ""].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>}
          <div className="flex h-9 w-full items-center justify-center border-t border-input bg-accent px-3 text-center">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setHeaderOpen((open) => !open)}
              aria-expanded={headerOpen}
            >
              {headerOpen ? "Thu gọn" : "Mở thông tin"}
            </Button>
          </div>
          </section>

<section className="space-y-2" data-section="hardcoded-sales-lines">
  <div className="overflow-hidden rounded-lg border bg-card">
    <div className="flex h-9 items-center border-b border-primary-foreground/25 bg-primary px-3">
      <h2 className="text-sm font-semibold text-primary-foreground">Chi tiết bán hàng</h2>
    </div>
    {lineNotices.length ? (
      <div className="space-y-0.5 border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-bold text-destructive" role="alert">
        {lineNotices.map((notice) => <div key={notice.key}>{notice.message}</div>)}
      </div>
    ) : null}
    <div className="overflow-x-auto">
      <Table
      unwrapped
      className="mf-child-grid-table min-w-[1040px] table-fixed text-[13px] [&_button]:!justify-center [&_input]:!text-center [&_select]:!text-center [&_td]:border-b [&_td]:border-r [&_td]:text-center [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:text-center [&_th:last-child]:border-r-0"
    >
      <TableHeader className="[&_th]:bg-accent [&_th]:text-accent-foreground">
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 px-1 py-2 text-center">
            <Checkbox
              checked={selectedLineKeys.size === lines.length ? true : selectedLineKeys.size ? "indeterminate" : false}
              onCheckedChange={(checked) => toggleAllSalesLines(checked === true)}
              aria-label="Chọn tất cả dòng bán hàng"
            />
          </TableHead>
          <TableHead className="w-20 whitespace-nowrap px-1 py-2 text-center">STT</TableHead>
          <TableHead className="w-[23%] px-2 py-2 text-center">Mặt hàng</TableHead>
          <TableHead className="w-[16%] px-2 py-2 text-center">Cách bán</TableHead>
          <TableHead className="w-[14%] px-2 py-2 text-center">Đơn giá</TableHead>
          <TableHead className="w-[8%] px-2 py-2 text-center">ĐVT</TableHead>
          <TableHead className="w-[11%] px-2 py-2 text-center">Số lượng</TableHead>
          <TableHead className="w-[9%] px-2 py-2 text-center">Chiết khấu</TableHead>
          <TableHead className="w-[9%] px-2 py-2 text-center">Phụ thu</TableHead>
          <TableHead className="w-[12%] px-2 py-2 text-center">Thành tiền</TableHead>
          <TableHead className="w-20 px-1 py-2" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {gridRows.map((row, rowIndex) => {
          const line = lines[rowIndex];
          if (!line) return null;
          const selected = row.key === selectedLineKey;
          const detailKind = family(line);
          const detailArea = isAreaDoor(line);
          const detailColors = line._allowedColors ?? [];
          const detailShowWidth = detailArea || fieldVisible(line, "width_m");
          const detailShowHeight = detailArea || fieldVisible(line, "height_m");
          const detailShowSets = detailArea || fieldVisible(line, "set_count");
          const detailShowLength = fieldVisible(line, "length_m") && (fieldRequired(line, "length_m") || line.length_m != null);
          const detailShowBars = fieldVisible(line, "qty_bar") && (fieldRequired(line, "qty_bar") || line.qty_bar != null);
          const detailShowLeafVariant = fieldVisible(line, "leaf_variant", detailKind === "australian");
          const detailShowMeshHeight = detailKind === "mesh" && fieldVisible(line, "mesh_height_m", true);
          const detailShowButterfly = fieldVisible(line, "has_butterfly_bracket");
          const hasInlineDetail = Boolean(text(line.item_code) && (
            detailColors.length > 0
            || detailShowWidth
            || detailShowHeight
            || (detailShowSets && row.quantityField !== "set_count")
            || detailShowLeafVariant
            || detailShowMeshHeight
            || detailShowButterfly
            || detailShowLength
            || detailShowBars
          ));
          const packageSnapshot = line._commercial?.sales_package_snapshot ?? line.sales_package_snapshot;
          const packageComponents = packageSnapshot
            && typeof packageSnapshot === "object"
            && !Array.isArray(packageSnapshot)
            && Array.isArray((packageSnapshot as Json).components)
            ? (packageSnapshot as Json).components as unknown[]
            : [];
          const giftComponents = packageComponents.filter((component): component is Json => {
            if (!component || typeof component !== "object" || Array.isArray(component)) return false;
            const data = component as Json;
            return normalized(data.role).includes("tang")
              || normalized(data.component_key).includes("gift")
              || normalized(data.item_code).includes("tangray");
          });
          const selectableComponents = splitComponents(line);
          const selectedSplitChildren = new Map((line._splitChildren ?? []).map((child) => [
            text(child.sales_package_component_key),
            child,
          ]));
          const hasLinkedRows = hasInlineDetail || giftComponents.length > 0 || selectableComponents.length > 0;
          const recordTone = rowIndex % 2 === 0 ? "!bg-card" : "!bg-secondary";
          // Item is a read-only catalog source for fast order entry. Selecting an
          // entry copies its code into this Sales Order Item; this screen must not
          // create or mutate Item master records.
          const itemField: DocField = {
            ...lineBaseField("item_code", "Mặt hàng", "Link", "Item"),
            allow_create: false,
            link_filters: JSON.stringify({
              is_sales_item: 1,
              disabled: 0,
              is_sales_package_component: 0,
            }),
          };
          const salesOptionChoices = row.salesOptionChoices;
          const selectedSalesOption = (line._salesOptions ?? []).find(
            (option) => text(option.name) === text(line.sales_option),
          );
          const syncedLeafVariant = salesOptionLeafVariant(selectedSalesOption);
          const salesOptionField = selectField(
            childField("sales_option"),
            "sales_option",
            "Cách bán",
            salesOptionChoices.map((choice) => choice.value),
            Object.fromEntries(salesOptionChoices.map((choice) => [choice.value, choice.label])),
          );
          const uomField = selectField(
            childField("uom"),
            "uom",
            "ĐVT",
            row.uomChoices.map((choice) => choice.value),
            Object.fromEntries(row.uomChoices.map((choice) => [choice.value, choice.label])),
          );
          const quantityField = row.quantityField
            ? lineBaseField(
                row.quantityField,
                "Số lượng",
                row.quantityField === "set_count" ? "Int" : "Float",
              )
            : undefined;

          return (
            <Fragment key={row.key}>
            <TableRow
              className={`${recordTone} [&>td]:!bg-inherit ${hasLinkedRows ? "[&>td]:!border-b-0" : ""} ${selected ? "ring-1 ring-inset ring-primary/25" : ""}`}
              onClick={() => setSelectedLineKey(row.key)}
              onFocusCapture={() => setSelectedLineKey(row.key)}
            >
              <TableCell className="px-1 py-1.5 text-center align-middle">
                <Checkbox
                  checked={selectedLineKeys.has(row.key)}
                  onCheckedChange={(checked) => toggleSalesLineSelection(row.key, checked === true)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Chọn dòng ${rowIndex + 1}`}
                />
              </TableCell>
              <TableCell className="px-1 py-1.5 text-center align-middle tabular-nums text-muted-foreground">
                {rowIndex + 1}
              </TableCell>
              <TableCell className="align-top px-2 py-1.5">
                <StandardField
                  id={`sales-line-${rowIndex}-item`}
                  field={itemField}
                  value={line.item_code}
                  onChange={(value) => handleGridChange(row.key, "item_code", value)}
                  registry={registry}
                  services={salesServices}
                  parentDoctype="Sales Order Item"
                  docValues={line}
                  roles={roles}
                  required
                  compact
                  hideLabel
                  className="[&_.mf-control]:!min-h-8 [&_button]:!h-8"
                />
              </TableCell>
              <TableCell className="align-top px-2 py-1.5">
                {row.itemCode ? (
                  <StandardField
                    id={`sales-line-${rowIndex}-sales-option`}
                    field={salesOptionField}
                    value={line.sales_option || STANDARD_SALES_OPTION}
                    onChange={(value) => handleGridChange(
                      row.key,
                      "sales_option",
                      value === STANDARD_SALES_OPTION ? undefined : value,
                    )}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order Item"
                    docValues={line}
                    roles={roles}
                    compact
                    hideLabel
                    className="[&_.mf-control]:!min-h-8 [&_button]:!h-8"
                  />
                ) : (
                  <div className="flex min-h-8 items-center justify-center px-2 text-center text-sm text-muted-foreground">
                    {row.salesOptionLabel || "Tiêu chuẩn"}
                  </div>
                )}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-center align-middle tabular-nums">
                <span className={row.pricingError ? "text-destructive" : undefined}>
                  {row.loading ? "Đang tính…" : row.priceLabel || "—"}
                </span>
              </TableCell>
              <TableCell className="px-2 py-1.5 text-center align-middle">
                {row.uomChoices.length > 1 ? (
                  <StandardField
                    id={`sales-line-${rowIndex}-uom`}
                    field={uomField}
                    value={line.uom}
                    onChange={(value) => handleGridChange(row.key, "uom", value)}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order Item"
                    docValues={line}
                    roles={roles}
                    compact
                    hideLabel
                    className="mx-auto w-full max-w-[120px] [&_.mf-control]:!min-h-8 [&_button]:!relative [&_button]:!h-8 [&_button]:!w-full [&_button]:!justify-center [&_button]:!rounded-md [&_button]:!border [&_button]:!border-input [&_button]:!bg-card [&_button_svg]:!absolute [&_button_svg]:!right-2"
                  />
                ) : (
                  <span className="mx-auto inline-flex h-8 w-full max-w-[120px] items-center justify-center rounded-md border border-input bg-card px-2 text-sm">
                    {row.uom || "—"}
                  </span>
                )}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-center align-middle">
                {quantityField && row.quantityEditable ? (
                  <StandardField
                    id={`sales-line-${rowIndex}-quantity`}
                    field={quantityField}
                    value={row.quantity}
                    onChange={(value) => handleGridChange(row.key, row.quantityField!, value)}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order Item"
                    docValues={line}
                    roles={roles}
                    compact
                    hideLabel
                    className="mx-auto w-full max-w-[140px] [&_.mf-control]:!min-h-8 [&_.mf-control]:!rounded-md [&_.mf-control]:!border [&_.mf-control]:!border-input [&_.mf-control]:!bg-card [&_input]:!h-8 [&_input]:!appearance-none [&_input]:!text-center [&_input::-webkit-inner-spin-button]:!m-0 [&_input::-webkit-inner-spin-button]:!appearance-none [&_input::-webkit-outer-spin-button]:!m-0 [&_input::-webkit-outer-spin-button]:!appearance-none"
                  />
                ) : (
                  <span className="mx-auto inline-flex h-8 w-full max-w-[140px] items-center justify-center rounded-md border border-input bg-muted px-2 tabular-nums">
                    {row.quantity == null ? "—" : row.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 6 })}
                  </span>
                )}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-center align-middle tabular-nums text-muted-foreground">
                {row.discountLabel || "—"}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-center align-middle tabular-nums text-muted-foreground">
                {row.adjustmentLabel || "—"}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-center align-middle font-medium tabular-nums">
                {row.amountLabel || "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap px-1 py-1.5 text-center align-middle">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={(event) => { event.stopPropagation(); duplicateSalesLine(row.key); }}
                  aria-label={`Nhân bản dòng ${rowIndex + 1}`}
                  title="Nhân bản dòng"
                >
                  <Copy />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={lines.length <= 1}
                  onClick={(event) => { event.stopPropagation(); deleteSalesLine(row.key); }}
                  aria-label={`Xóa dòng ${rowIndex + 1}`}
                  title="Xóa dòng"
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
            {hasInlineDetail ? (
              <TableRow className={`${recordTone} ${giftComponents.length || selectableComponents.length ? "[&>td]:!border-b-0" : "border-b-2"} [&>td]:!bg-inherit`} data-section="sales-line-detail-row">
                <TableCell className="px-1 py-2" />
                <TableCell className="w-20 whitespace-nowrap px-2 py-2 text-center align-middle font-semibold text-foreground">
                  Chi tiết
                </TableCell>
                <TableCell colSpan={9} className="max-w-0 px-0 py-2 text-left align-middle">
                  <div className="w-full overflow-x-auto px-3">
                  <div className="flex min-w-max flex-nowrap items-center gap-4 whitespace-nowrap">
                    {detailColors.length ? (
                      <div className="flex min-w-[210px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">Màu:</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-color-inline`}
                          field={selectField(childField("color"), "color", "Màu", detailColors)}
                          value={line.color}
                          onChange={(value) => commitLine(line._key, "color", text(value) || undefined)}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          compact hideLabel className="min-w-36 flex-1"
                        />
                      </div>
                    ) : null}
                    {detailShowWidth ? (
                      <div className="flex min-w-[190px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">{fieldLabel(line, "width_m", "Rộng (m)")}:{(detailArea || fieldRequired(line, "width_m")) ? <span className="text-destructive"> *</span> : null}</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-width-inline`}
                          field={lineBaseField("width_m", fieldLabel(line, "width_m", "Rộng (m)"), "Float")}
                          value={line.width_m}
                          onChange={(value) => patchLine(line._key, { width_m: value == null || value === "" ? undefined : Number(value) })}
                          onCommit={() => commitCurrentLineField(line._key, "width_m")}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          required={detailArea || fieldRequired(line, "width_m")} readOnly={fieldReadonly(line, "width_m")} compact hideLabel className="min-w-20 flex-1"
                        />
                      </div>
                    ) : null}
                    {detailShowHeight ? (
                      <div className="flex min-w-[180px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">{fieldLabel(line, "height_m", "Cao (m)")}:{(detailArea || fieldRequired(line, "height_m")) ? <span className="text-destructive"> *</span> : null}</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-height-inline`}
                          field={lineBaseField("height_m", fieldLabel(line, "height_m", "Cao (m)"), "Float")}
                          value={line.height_m}
                          onChange={(value) => patchLine(line._key, { height_m: value == null || value === "" ? undefined : Number(value) })}
                          onCommit={() => commitCurrentLineField(line._key, "height_m")}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          required={detailArea || fieldRequired(line, "height_m")} readOnly={fieldReadonly(line, "height_m")} compact hideLabel className="min-w-20 flex-1"
                        />
                      </div>
                    ) : null}
                    {detailShowSets && row.quantityField !== "set_count" ? (
                      <div className="flex min-w-[190px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">{fieldLabel(line, "set_count", detailArea ? "Số bộ" : "Số lượng")}:{(detailArea || fieldRequired(line, "set_count")) ? <span className="text-destructive"> *</span> : null}</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-sets-inline`}
                          field={lineBaseField("set_count", fieldLabel(line, "set_count", detailArea ? "Số bộ" : "Số lượng"), "Int")}
                          value={line.set_count}
                          onChange={(value) => patchLine(line._key, { set_count: value == null || value === "" ? undefined : Number(value) })}
                          onCommit={() => commitCurrentLineField(line._key, "set_count")}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          required={detailArea || fieldRequired(line, "set_count")} readOnly={fieldReadonly(line, "set_count")} compact hideLabel className="min-w-16 flex-1"
                        />
                      </div>
                    ) : null}
                    {detailShowLeafVariant ? (
                      <div className="flex min-w-[230px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">Kiểu lá / motor:{fieldRequired(line, "leaf_variant") ? <span className="text-destructive"> *</span> : null}</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-leaf-variant-inline`}
                          field={selectField(childField("leaf_variant"), "leaf_variant", "Kiểu lá / motor", leafVariants)}
                          value={syncedLeafVariant || line.leaf_variant}
                          onChange={(value) => commitLine(line._key, "leaf_variant", text(value) || undefined)}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          required={fieldRequired(line, "leaf_variant")}
                          readOnly={Boolean(syncedLeafVariant) || fieldReadonly(line, "leaf_variant")}
                          compact hideLabel className="min-w-36 flex-1"
                        />
                      </div>
                    ) : null}
                    {detailShowMeshHeight ? (
                      <div className="flex min-w-[210px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">{fieldLabel(line, "mesh_height_m", "Cao lưới (m)")}:{fieldRequired(line, "mesh_height_m") ? <span className="text-destructive"> *</span> : null}</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-mesh-height-inline`}
                          field={lineBaseField("mesh_height_m", fieldLabel(line, "mesh_height_m", "Cao lưới (m)"), "Float")}
                          value={line.mesh_height_m}
                          onChange={(value) => patchLine(line._key, { mesh_height_m: value == null || value === "" ? undefined : Number(value) })}
                          onCommit={() => commitCurrentLineField(line._key, "mesh_height_m")}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          required={fieldRequired(line, "mesh_height_m")} readOnly={fieldReadonly(line, "mesh_height_m")} compact hideLabel className="min-w-20 flex-1"
                        />
                      </div>
                    ) : null}
                    {detailShowButterfly ? (
                      <div className="flex min-w-[170px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">{fieldLabel(line, "has_butterfly_bracket", "Có bản bướm")}:</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-butterfly-inline`}
                          field={lineBaseField("has_butterfly_bracket", fieldLabel(line, "has_butterfly_bracket", "Có bản bướm"), "Check")}
                          value={line.has_butterfly_bracket}
                          onChange={(value) => commitLine(line._key, "has_butterfly_bracket", value ? 1 : 0)}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          compact hideLabel
                        />
                      </div>
                    ) : null}
                    {detailShowLength ? (
                      <div className="flex min-w-[210px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">{fieldLabel(line, "length_m", "Dài / cây (m)")}:{fieldRequired(line, "length_m") ? <span className="text-destructive"> *</span> : null}</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-length-inline`}
                          field={lineBaseField("length_m", fieldLabel(line, "length_m", "Dài / cây (m)"), "Float")}
                          value={line.length_m}
                          onChange={(value) => patchLine(line._key, { length_m: value == null || value === "" ? undefined : Number(value) })}
                          onCommit={() => commitCurrentLineField(line._key, "length_m")}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          required={fieldRequired(line, "length_m")} readOnly={fieldReadonly(line, "length_m")} compact hideLabel className="min-w-20 flex-1"
                        />
                      </div>
                    ) : null}
                    {detailShowBars ? (
                      <div className="flex min-w-[180px] items-center gap-2">
                        <span className="shrink-0 text-xs font-medium">{fieldLabel(line, "qty_bar", "Số cây")}:{fieldRequired(line, "qty_bar") ? <span className="text-destructive"> *</span> : null}</span>
                        <StandardField
                          id={`sales-line-${rowIndex}-bars-inline`}
                          field={lineBaseField("qty_bar", fieldLabel(line, "qty_bar", "Số cây"), "Int")}
                          value={line.qty_bar}
                          onChange={(value) => patchLine(line._key, { qty_bar: value == null || value === "" ? undefined : Number(value) })}
                          onCommit={() => commitCurrentLineField(line._key, "qty_bar")}
                          registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                          required={fieldRequired(line, "qty_bar")} readOnly={fieldReadonly(line, "qty_bar")} compact hideLabel className="min-w-16 flex-1"
                        />
                      </div>
                    ) : null}
                    <div className="flex min-w-[210px] items-center gap-2">
                      <span className="shrink-0 text-xs font-medium">Chiết khấu (%):</span>
                      <StandardField
                        id={`sales-line-${rowIndex}-discount-inline`}
                        field={lineBaseField("discount_percentage", "Chiết khấu (%)", "Percent")}
                        value={line.discount_percentage ?? 0}
                        onChange={(value) => patchLine(line._key, { discount_percentage: value == null || value === "" ? 0 : Number(value) })}
                        onCommit={() => commitCurrentLineField(line._key, "discount_percentage", 0)}
                        registry={registry} services={services} parentDoctype="Sales Order Item" docValues={line} roles={roles}
                        compact hideLabel className="min-w-16 flex-1"
                      />
                    </div>
                  </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
            {selectableComponents.map((component, componentIndex) => {
              const componentKey = text(component.component_key);
              const child = selectedSplitChildren.get(componentKey);
              const required = component.required === true || component.required === 1;
              const childCommercial = child?._commercial ?? {};
              const childRate = numberValue(childCommercial.selling_rate) ?? numberValue(child?.rate);
              const childQty = numberValue(component.qty) ?? numberValue(child?.qty);
              const childDiscount = numberValue(childCommercial.discount_amount) ?? numberValue(child?.discount_amount) ?? 0;
              const childDiscountPct = numberValue(childCommercial.discount_percentage) ?? numberValue(child?.discount_percentage) ?? 0;
              const childAdjustment = numberValue(childCommercial.adjustment_amount) ?? numberValue(child?.adjustment_amount) ?? 0;
              const childNet = child ? lineTotal(child) : undefined;
              const isLast = componentIndex === selectableComponents.length - 1 && giftComponents.length === 0;
              return (
                <TableRow
                  key={`${row.key}-split-${componentKey || componentIndex}`}
                  className={`${recordTone} ${isLast ? "border-b-2" : "[&>td]:!border-b-0"} [&>td]:!bg-inherit`}
                  data-section="sales-line-split-child-row"
                >
                  <TableCell className="px-1 py-1.5 text-center align-middle" />
                  <TableCell className="w-20 whitespace-nowrap px-2 py-1.5 text-center align-middle font-semibold text-foreground">
                    Món tách
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-left align-middle">
                    <label className="flex min-h-8 items-center gap-2 rounded-md border border-input bg-card px-2">
                      <Checkbox
                        checked={Boolean(child)}
                        disabled={required && Boolean(child)}
                        onCheckedChange={(checked) => toggleSplitComponent(row.key, component, checked === true)}
                        aria-label={`Chọn món ${text(component.display_label) || text(component.item_code)}`}
                      />
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {text(component.display_label) || text(child?._itemLabel) || text(component.item_code)}
                      </span>
                    </label>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle text-xs">
                    {text(component.role) || "Theo gói"}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle tabular-nums">
                    {child?._loading ? "Đang tính…" : childRate === undefined ? "—" : `${money(childRate)} ₫ / ${text(component.uom)}`}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle">{text(component.uom) || "—"}</TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle font-medium tabular-nums">
                    {childQty === undefined ? "—" : childQty.toLocaleString("vi-VN", { maximumFractionDigits: 6 })}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle tabular-nums text-muted-foreground">
                    {!child || childDiscount <= 0 ? "—" : `-${money(childDiscount)} ₫${childDiscountPct > 0 ? ` · ${childDiscountPct}%` : ""}`}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle tabular-nums text-muted-foreground">
                    {!child || childAdjustment === 0 ? "—" : `${money(childAdjustment)} ₫`}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle font-semibold tabular-nums text-foreground">
                    {childNet === undefined ? "—" : `${money(childNet)} ₫`}
                  </TableCell>
                  <TableCell className="px-1 py-1.5 text-center align-middle text-xs text-muted-foreground">{componentKey}</TableCell>
                </TableRow>
              );
            })}
            {giftComponents.map((component, giftIndex) => {
              const giftQty = numberValue(component.qty) ?? 0;
              const giftUom = text(component.uom);
              const giftRole = text(component.role) || text(component.component_key);
              return (
                <TableRow
                  key={`${row.key}-gift-${text(component.component_key) || giftIndex}`}
                  className={`${recordTone} border-b-2 text-muted-foreground [&>td]:!bg-inherit`}
                  data-section="sales-line-gift-row"
                >
                  <TableCell className="px-1 py-1.5" />
                  <TableCell className="w-20 whitespace-nowrap px-2 py-1.5 text-center align-middle font-semibold text-foreground">
                    Tặng kèm
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle">
                    <span className="inline-flex min-h-8 w-full items-center justify-center rounded-md border border-input bg-muted/60 px-2 font-medium text-foreground">
                      {text(component.item_code)}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle font-medium">{giftRole}</TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle tabular-nums">0 đ / {giftUom}</TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle">{giftUom}</TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle font-medium tabular-nums">
                    {giftQty.toLocaleString("vi-VN", { maximumFractionDigits: 6 })}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle">—</TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle">—</TableCell>
                  <TableCell className="px-2 py-1.5 text-center align-middle font-semibold tabular-nums text-foreground">0 đ</TableCell>
                  <TableCell className="px-1 py-1.5 text-center align-middle text-xs">{text(component.component_key)}</TableCell>
                </TableRow>
              );
            })}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
    </div>
    <div className="flex h-9 items-center gap-2 border-t border-input bg-accent px-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addSalesLine}>
          <Plus className="mr-1 size-3.5" /> Thêm dòng
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addMultipleSalesLines}>
          <Plus className="mr-1 size-3.5" /> Thêm 5 dòng
        </Button>
        {selectedLineKeys.size ? (
          <>
          <span className="text-xs font-medium text-accent-foreground">Đã chọn {selectedLineKeys.size}</span>
          <Button type="button" variant="destructive" size="sm" onClick={deleteSelectedSalesLines}>
            <Trash2 className="mr-1 size-3.5" /> Xóa đã chọn
          </Button>
          </>
        ) : null}
      </div>
    </div>
  </div>

</section>
          </fieldset>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-4 py-2 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="mx-auto flex w-full max-w-[1760px] flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-muted-foreground">Tạm tính dòng</span>
            <strong className="text-xl font-bold tabular-nums">{money(displayedTotal)} ₫</strong>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>{isExisting ? "Đóng" : "Huỷ"}</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || formReadOnly}
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
              disabled={saving || !canSave}
              onClick={() => void save(true)}
            >
              <Eye className="mr-1 size-3.5" /> Lưu & xem
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !canSave}
              onClick={() => void save(false)}
            >
              {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
              {isExisting ? "Lưu thay đổi" : "Lưu đơn hàng"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
