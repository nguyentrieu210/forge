import { previewChildRow as previewBaseChildRow } from "./ui-child-preview-base.js";
import type { SalesPlatformCall } from "./sales-item-context.js";
import type { ProductionPlatformCall } from "./sales-production.js";

type Json = Record<string, unknown>;
type PlatformCall = SalesPlatformCall & ProductionPlatformCall;

const SALES_DOCTYPES = new Set(["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]);
const MONEY_FIELDS = [
  "rate", "standard_rate", "discount_percentage", "discount_amount", "adjustment_amount", "net_amount", "amount",
] as const;
const COMMERCIAL_FIELDS = [
  "sales_option", "sales_option_code", "sales_option_label", "sales_option_version", "sales_mode",
  "price_variant", "discount_basis_variant", "item_price", "sales_package", "sales_package_snapshot",
  "pricing_as_of", "pricing_rule", "pricing_rule_snapshots",
] as const;

interface PreviewResult {
  patch?: Json;
  clear?: string[];
  field_overrides?: Record<string, Json>;
  source?: string;
  message?: string;
}

function answer(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || ["true", "yes", "có", "co"].includes(normalized(value));
}

function numberOrValue(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}

async function readDoc(call: PlatformCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

async function listSalesOptions(call: PlatformCall, itemCode: string, itemGroup: string, facts: Json): Promise<Json[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify([
      "name", "option_code", "option_label", "item_code", "item_group", "conditions", "price_variant",
      "discount_basis_variant", "sales_mode", "sales_package", "is_default", "priority", "disabled",
    ]),
    limit_page_length: "200",
  });
  const response = await call(`resource/Sales%20Option?${query.toString()}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Không đọc được Phương án bán (HTTP ${response.status}).`);
  const rows = ((await response.json()) as { data?: Json[] }).data ?? [];
  return rows
    .filter((row) => !truthy(row.disabled))
    .filter((row) => !text(row.item_code) || text(row.item_code) === itemCode)
    .filter((row) => !text(row.item_group) || normalized(row.item_group) === normalized(itemGroup))
    .filter((row) => conditionsMatch(row.conditions, facts))
    .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0)
      || text(left.option_label ?? left.name).localeCompare(text(right.option_label ?? right.name), "vi"));
}

function conditionsMatch(value: unknown, facts: Json): boolean {
  if (value === undefined || value === null || value === "") return true;
  let rows: unknown = value;
  if (typeof rows === "string") {
    try { rows = JSON.parse(rows); } catch { return false; }
  }
  if (!Array.isArray(rows)) return false;
  return rows.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as Json;
    const field = text(row.field ?? row.fieldname);
    const op = text(row.operator ?? row.op) || "eq";
    if (!field) return false;
    const actual = facts[field];
    if (actual === undefined || actual === null || actual === "") return false;
    if (op === "in" || op === "not_in") {
      const values = Array.isArray(row.values) ? row.values : [];
      const matched = values.some((candidate) => normalized(candidate) === normalized(actual));
      return op === "in" ? matched : !matched;
    }
    if (op === "eq") return normalized(actual) === normalized(row.value);
    if (op === "neq") return normalized(actual) !== normalized(row.value);
    const left = Number(actual);
    const right = Number(row.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (op === "lt") return left < right;
    if (op === "lte") return left <= right;
    if (op === "gt") return left > right;
    if (op === "gte") return left >= right;
    return false;
  });
}

function applyBaseResult(row: Json, result: PreviewResult): Json {
  const next = { ...row };
  for (const field of result.clear ?? []) next[field] = undefined;
  Object.assign(next, result.patch ?? {});
  return next;
}

function setPatch(patch: Json, fields: Set<string>, field: string, value: unknown): void {
  if (fields.has(field) && value !== undefined) patch[field] = value;
}

function setOverride(overrides: Record<string, Json>, fields: Set<string>, field: string, value: Json): void {
  if (fields.has(field)) overrides[field] = { ...(overrides[field] ?? {}), ...value };
}

function chooseDefaultOption(options: Json[], current: string): Json | undefined {
  if (current) return options.find((row) => text(row.name) === current || text(row.option_code) === current);
  const defaults = options.filter((row) => truthy(row.is_default));
  if (defaults.length === 1) return defaults[0];
  if (options.length === 1) return options[0];
  return undefined;
}

async function canonicalCommercialPreview(call: PlatformCall, parent: Json, line: Json): Promise<Json> {
  const response = await call("method/metaforge.api.preview_sales_commercial_line", {
    method: "POST",
    body: JSON.stringify({
      line,
      price_list: parent.selling_price_list,
      currency: parent.currency || "VND",
      posting_date: parent.transaction_date,
      customer: parent.customer,
      customer_group: parent.customer_group,
    }),
  });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const nested = payload.message && typeof payload.message === "object" ? payload.message as Json : undefined;
    throw new Error(text(nested?.message ?? payload.message ?? payload.exception ?? "Không tính được giá bán theo chính sách."));
  }
  return payload.message && typeof payload.message === "object" && !Array.isArray(payload.message)
    ? payload.message as Json
    : payload;
}

async function orchestrateSales(
  call: PlatformCall,
  args: Json,
  row: Json,
  parent: Json,
  fields: Set<string>,
  base: PreviewResult,
): Promise<Response> {
  const patch: Json = { ...(base.patch ?? {}) };
  const clear = new Set(base.clear ?? []);
  const overrides: Record<string, Json> = { ...(base.field_overrides ?? {}) };
  let effective = applyBaseResult(row, base);
  const itemCode = text(effective.item_code);
  if (!itemCode) return answer({ ...base, patch, clear: [...clear], field_overrides: overrides });

  const item = await readDoc(call, "Item", itemCode);
  if (!item) return answer({ message: `Mặt hàng ${itemCode} không tồn tại.`, patch, clear: [...clear], field_overrides: overrides }, 422);
  const itemGroup = text(item.item_group);
  const options = await listSalesOptions(call, itemCode, itemGroup, effective);
  const selected = chooseDefaultOption(options, text(effective.sales_option));

  if (fields.has("sales_option")) {
    if (!options.length) {
      clear.add("sales_option");
      setOverride(overrides, fields, "sales_option", { hidden: 1, reqd: 0, read_only: 1 });
    } else {
      setOverride(overrides, fields, "sales_option", {
        hidden: 0,
        reqd: 1,
        read_only: 0,
        label: "Phương án bán",
        link_filters: JSON.stringify([["Sales Option", "name", "in", options.map((option) => text(option.name))]]),
      });
      if (selected && !text(effective.sales_option)) {
        patch.sales_option = text(selected.name);
        effective = { ...effective, sales_option: patch.sales_option };
      } else if (text(effective.sales_option) && !selected) {
        clear.add("sales_option");
        effective = { ...effective, sales_option: undefined };
      }
    }
  }

  // Money is always projected from the exact canonical resolver. The Worker owns geometry/UI
  // orchestration only; it never re-implements discount or surcharge formulas.
  const qty = Number(effective.qty);
  const hasPriceContext = text(parent.selling_price_list) && text(parent.currency || "VND");
  const optionReady = options.length === 0 || Boolean(selected || patch.sales_option);
  if (Number.isFinite(qty) && qty > 0 && hasPriceContext && optionReady) {
    const priced = await canonicalCommercialPreview(call, parent, { ...effective, ...patch });
    for (const field of COMMERCIAL_FIELDS) setPatch(patch, fields, field, priced[field]);
    setPatch(patch, fields, "rate", numberOrValue(priced.rate ?? priced.selling_rate));
    setPatch(patch, fields, "standard_rate", numberOrValue(priced.base_rate));
    setPatch(patch, fields, "discount_percentage", numberOrValue(priced.discount_percentage));
    setPatch(patch, fields, "discount_amount", numberOrValue(priced.discount_amount));
    setPatch(patch, fields, "adjustment_amount", numberOrValue(priced.adjustment_amount));
    setPatch(patch, fields, "net_amount", numberOrValue(priced.net_amount ?? priced.net_before_tax));
    setPatch(patch, fields, "amount", numberOrValue(priced.amount ?? priced.net_before_tax));
  } else {
    // Never leave a stale policy result after changing product/option/geometry.
    if (["item_code", "sales_option", "width_m", "height_m", "set_count", "uom", "color", "colour"].includes(text(args.changed_field))) {
      for (const field of ["discount_amount", "adjustment_amount", "net_amount"]) if (fields.has(field)) clear.add(field);
    }
  }

  setOverride(overrides, fields, "rate", { label: "Đơn giá\n(VNĐ)" });
  setOverride(overrides, fields, "discount_percentage", { hidden: 1, read_only: 1 });
  setOverride(overrides, fields, "discount_amount", { hidden: 0, read_only: 1, label: "Tiền CK\n(VNĐ)" });
  setOverride(overrides, fields, "adjustment_amount", { hidden: 0, read_only: 1, label: "Phụ thu\n(VNĐ)" });
  setOverride(overrides, fields, "net_amount", { hidden: 0, read_only: 1, label: "Thành tiền\n(VNĐ)" });
  setOverride(overrides, fields, "amount", { read_only: 1, label: "Thành tiền\n(VNĐ)" });

  return answer({
    patch,
    clear: [...clear].filter((field) => patch[field] === undefined),
    field_overrides: overrides,
    source: "alumdoor.ui.preview_child_row+canonical-commercial",
  });
}

/**
 * Sales Order UX orchestrator.
 *
 * Base preview remains responsible for dimensions/UOM/stock visibility. Sales lines are then
 * repriced through `metaforge.api.preview_sales_commercial_line`, which is the same resolver used
 * by Quotation/Sales Order persistence. This removes the former split where the grid calculated a
 * 15% discount locally while the canonical controller calculated Pricing Rule adjustments later.
 */
export async function previewChildRow(call: PlatformCall, args: Json): Promise<Response> {
  const childDoctype = text(args.child_doctype);
  const row = args.row && typeof args.row === "object" && !Array.isArray(args.row) ? args.row as Json : {};
  const parent = args.parent && typeof args.parent === "object" && !Array.isArray(args.parent) ? args.parent as Json : {};
  const fields = new Set(Array.isArray(args.child_fields) ? args.child_fields.map(text).filter(Boolean) : []);
  const baseResponse = await previewBaseChildRow(call, args);
  if (!baseResponse.ok || !SALES_DOCTYPES.has(childDoctype)) return baseResponse;
  const base = await baseResponse.json() as PreviewResult;
  try {
    return await orchestrateSales(call, args, row, parent, fields, base);
  } catch (error) {
    return answer({
      message: error instanceof Error ? error.message : "Không tính được dòng bán hàng.",
      patch: base.patch ?? {},
      clear: base.clear ?? [],
      field_overrides: base.field_overrides ?? {},
      source: "alumdoor.ui.preview_child_row+canonical-commercial",
    }, 422);
  }
}
