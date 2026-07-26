/** Global business context — company/fiscal year/warehouse/branch/... resolved by server. */
export type BusinessContextKey =
  | "company"
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
  /** Khoảng ngày suy ra từ Fiscal Year; không phải selector độc lập. */
  date_from?: string;
  date_to?: string;
};

export interface BusinessContextPolicy {
  /** Dimension được phép tác động lên DocType/màn nào. */
  supported: BusinessContextKey[];
  /** Field list/filter tương ứng. */
  listFilters?: Partial<Record<BusinessContextKey, string>>;
  /** Field được seed khi tạo mới. */
  createDefaults?: Partial<Record<BusinessContextKey, string>>;
  /** Field ngày để áp khoảng ngày suy ra từ Fiscal Year. */
  dateField?: string;
  /** Link field cần nhận context filter. */
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
  /** App có thể khai báo chính sách bổ sung; server vẫn là nguồn quyền cuối. */
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
  // Derived values chỉ tin response server hiện tại; localStorage/request không thể tự cấp scope.
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
  const policy = policies?.[doctype];
  if (!policy) return { filters: [], defaults: {} };
  const filters: Array<[string, "=" | ">=" | "<=", string]> = [];
  const defaults: Record<string, string> = {};
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

/** Common ERPNext report filters derived from the server-resolved business context.
 * Extra filters are safe for query/script reports and are ignored when a report does not use them. */
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
