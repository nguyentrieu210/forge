/** Global business context — company/fiscal year/warehouse/branch/... resolved by server. */
export type BusinessContextKey =
  | "company"
  | "currency"
  | "fiscal_year"
  | "warehouse"
  | "branch"
  | "cost_center"
  | "project"
  | "territory"
  | "selling_price_list"
  | "buying_price_list";

export interface BusinessContextOption {
  value: string;
  label: string;
  description?: string;
  company?: string;
  parent?: string;
  fromDate?: string;
  toDate?: string;
  disabled?: boolean;
  meta?: Record<string, unknown>;
}

export interface BusinessContextDimension {
  key: BusinessContextKey;
  label: string;
  enabled: boolean;
  required: boolean;
  locked: boolean;
  hidden?: boolean;
  dependsOn?: BusinessContextKey;
  defaultValue?: string;
  options: BusinessContextOption[];
}

export type BusinessContextSelection = Partial<Record<BusinessContextKey, string>> & {
  date_from?: string;
  date_to?: string;
};

export interface BusinessContextPolicy {
  supported: BusinessContextKey[];
  listFilters?: Partial<Record<BusinessContextKey, string>>;
  createDefaults?: Partial<Record<BusinessContextKey, string>>;
  dateField?: string;
  linkFilters?: Record<string, Partial<Record<BusinessContextKey, string>>>;
}

export interface BusinessContextState {
  dimensions: BusinessContextDimension[];
  selection: BusinessContextSelection;
  policies?: Record<string, BusinessContextPolicy>;
  revision?: string;
}

export interface BusinessContextRequirement {
  mode?: "server-resolved";
  dimensions?: BusinessContextKey[];
  policies?: Record<string, BusinessContextPolicy>;
}

export const EMPTY_BUSINESS_CONTEXT: BusinessContextState = {
  dimensions: [],
  selection: {},
};

export function normalizeContextSelection(
  state: Pick<BusinessContextState, "dimensions" | "selection">,
  requested: BusinessContextSelection,
): BusinessContextSelection {
  const next: BusinessContextSelection = {};
  const merged = { ...state.selection, ...requested };
  for (const d of state.dimensions) {
    if (!d.enabled) continue;
    const allowed = new Set(d.options.filter((o) => !o.disabled).map((o) => o.value));
    let value = merged[d.key];
    if (value && !allowed.has(value)) value = undefined;
    if (!value && d.defaultValue && allowed.has(d.defaultValue)) value = d.defaultValue;
    if (!value && d.options.length === 1 && !d.options[0]!.disabled) value = d.options[0]!.value;
    if (value) next[d.key] = value;
  }
  // Currency is an effective site/transaction default supplied by boot/System Settings,
  // not a selector dimension. Preserve it alongside the server-resolved selectors so
  // generic forms and custom experiences consume one context instead of re-reading setup.
  if (merged.currency) next.currency = merged.currency;
  if (state.selection.date_from) next.date_from = state.selection.date_from;
  if (state.selection.date_to) next.date_to = state.selection.date_to;
  return next;
}

export function contextCacheSuffix(selection: BusinessContextSelection): string {
  return Object.entries(selection)
    .filter(([, v]) => Boolean(v))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export function applyContextPolicy(
  doctype: string,
  selection: BusinessContextSelection,
  policies?: Record<string, BusinessContextPolicy>,
): { filters: Array<[string, "=" | ">=" | "<=", string]>; defaults: Record<string, string> } {
  const filters: Array<[string, "=" | ">=" | "<=", string]> = [];
  const defaults: Record<string, string> = {};

  // Company and currency are universal CREATE defaults. `blankDoc` only applies keys
  // that actually exist in the target schema, so this does not invent fields or turn
  // global context into a list filter. A doctype-specific policy may still override the
  // target field name below (for example a non-standard company field).
  if (selection.company) defaults.company = selection.company;
  if (selection.currency) defaults.currency = selection.currency;

  const policy = policies?.[doctype];
  if (!policy) return { filters, defaults };
  for (const key of policy.supported) {
    const value = selection[key];
    if (!value) continue;
    const listField = policy.listFilters?.[key];
    if (listField) filters.push([listField, "=", value]);
    const defaultField = policy.createDefaults?.[key];
    if (defaultField) defaults[defaultField] = value;
  }
  if (policy.dateField && selection.date_from) filters.push([policy.dateField, ">=", selection.date_from]);
  if (policy.dateField && selection.date_to) filters.push([policy.dateField, "<=", selection.date_to]);
  return { filters, defaults };
}

/**
 * Link-target capability filters derived from canonical context dimensions and the target schema.
 *
 * This replaces renderer/service branches on ordinary business DocType names. Price-list context is
 * a platform dimension; if the target schema exposes the corresponding capability flag (`selling`
 * or `buying`) the filter can be derived without knowing that the target happens to be `Price List`.
 * When a parent supports both modes we deliberately do not narrow either one, matching the previous
 * behaviour. Server permissions still decide which rows are actually readable.
 */
export function deriveContextLinkCapabilityFilters(
  policy: BusinessContextPolicy | undefined,
  targetMeta: { fields?: Array<{ fieldname?: string }> } | undefined,
): Record<string, unknown> {
  if (!policy || !targetMeta?.fields) return {};
  const targetFields = new Set(targetMeta.fields.map((field) => field.fieldname).filter((value): value is string => Boolean(value)));
  const selling = policy.supported.includes("selling_price_list");
  const buying = policy.supported.includes("buying_price_list");
  if (selling && !buying && targetFields.has("selling")) return { selling: 1 };
  if (buying && !selling && targetFields.has("buying")) return { buying: 1 };
  return {};
}

export function contextToReportFilters(selection: BusinessContextSelection): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (selection.company) filters.company = selection.company;
  if (selection.warehouse) filters.warehouse = selection.warehouse;
  if (selection.branch) filters.branch = selection.branch;
  if (selection.cost_center) filters.cost_center = selection.cost_center;
  if (selection.project) filters.project = selection.project;
  if (selection.fiscal_year) filters.fiscal_year = selection.fiscal_year;
  if (selection.date_from) filters.from_date = selection.date_from;
  if (selection.date_to) filters.to_date = selection.date_to;
  return filters;
}
