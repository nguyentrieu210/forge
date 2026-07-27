/**
 * Cấu hình cột của một ListView.
 *
 * Trước đây cột ẩn, thứ tự và bề rộng nằm ở ba localStorage key khác nhau, chỉ khóa theo
 * DocType. Khi đổi tenant/user trên cùng trình duyệt, các tài khoản có thể đè sở thích của nhau;
 * khi DocType đổi mà component không remount, state cũ còn có thể lóe/sang luôn màn mới.
 *
 * Một snapshot có version giải quyết cả hai vấn đề: cập nhật nguyên tử, lọc lại theo metadata
 * hiện hành mỗi lần đọc, và scope bằng site + user (`scopeKey` của MetaForgeProvider).
 */

export const MIN_COL_WIDTH = 72;
export const MAX_COL_WIDTH = 720;
const STORAGE_VERSION = 2;
const KEY_PREFIX = "metaforge:list-columns:v2:";

export type ListDensity = "comfortable" | "compact";
export type ColumnWidths = Record<string, number>;

export interface ColumnPreferenceSpec {
  fieldname: string;
  isTitle?: boolean;
  minWidth?: number;
  groupable?: boolean;
}

export interface ListColumnPreferences {
  version: typeof STORAGE_VERSION;
  hidden: string[];
  order: string[];
  widths: ColumnWidths;
  density: ListDensity;
  groupBy: string;
}

/**
 * Query cache cần cả lang/version để không giữ response cũ, còn sở thích cột chỉ nên đổi khi
 * site hoặc user đổi. Đổi ngôn ngữ/nâng Frappe không được làm người dùng "mất" bố cục đã lưu.
 */
export function stableColumnPreferenceScope(cacheScopeKey: string): string {
  const parts = cacheScopeKey.split("|");
  return parts.length >= 2 && parts[0] && parts[1]
    ? `${parts[0]}|${parts[1]}`
    : cacheScopeKey;
}

export function columnPreferenceKey(scopeKey: string, doctype: string): string {
  const scope = scopeKey.trim() || "local";
  return `${KEY_PREFIX}${encodeURIComponent(scope)}:${encodeURIComponent(doctype)}`;
}

export function defaultColumnPreferences(columns: ColumnPreferenceSpec[]): ListColumnPreferences {
  return {
    version: STORAGE_VERSION,
    hidden: [],
    order: uniqueFieldnames(columns),
    widths: {},
    density: "comfortable",
    groupBy: "",
  };
}

/**
 * Mọi dữ liệu localStorage đều không đáng tin: loại field cũ/không tồn tại, duplicate, title bị
 * ẩn, width NaN/âm/quá lớn và groupBy không còn hợp lệ trước khi state chạm vào renderer.
 */
export function normalizeColumnPreferences(
  input: unknown,
  columns: ColumnPreferenceSpec[],
): ListColumnPreferences {
  const defaults = defaultColumnPreferences(columns);
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaults;

  const raw = input as Partial<ListColumnPreferences>;
  const specs = new Map(columns.map((column) => [column.fieldname, column]));
  const valid = new Set(specs.keys());
  const mandatory = new Set(columns.filter((column) => column.isTitle).map((column) => column.fieldname));

  const hidden = uniqueStrings(raw.hidden).filter((field) => valid.has(field) && !mandatory.has(field));
  const requestedOrder = uniqueStrings(raw.order).filter((field) => valid.has(field));
  const seen = new Set(requestedOrder);
  const order = [...requestedOrder, ...defaults.order.filter((field) => !seen.has(field))];

  const widths: ColumnWidths = {};
  if (raw.widths && typeof raw.widths === "object" && !Array.isArray(raw.widths)) {
    for (const [field, value] of Object.entries(raw.widths)) {
      const spec = specs.get(field);
      if (!spec || typeof value !== "number" || !Number.isFinite(value)) continue;
      widths[field] = clampWidth(value, spec.minWidth);
    }
  }

  const groupBy =
    typeof raw.groupBy === "string" && specs.get(raw.groupBy)?.groupable
      ? raw.groupBy
      : "";

  return {
    version: STORAGE_VERSION,
    hidden,
    order,
    widths,
    density: raw.density === "compact" ? "compact" : "comfortable",
    groupBy,
  };
}

export function loadColumnPreferences(
  scopeKey: string,
  doctype: string,
  columns: ColumnPreferenceSpec[],
): ListColumnPreferences {
  try {
    const raw = localStorage.getItem(columnPreferenceKey(scopeKey, doctype));
    return raw ? normalizeColumnPreferences(JSON.parse(raw), columns) : defaultColumnPreferences(columns);
  } catch {
    return defaultColumnPreferences(columns);
  }
}

export function saveColumnPreferences(
  scopeKey: string,
  doctype: string,
  preferences: ListColumnPreferences,
  columns: ColumnPreferenceSpec[],
): ListColumnPreferences {
  const normalized = normalizeColumnPreferences(preferences, columns);
  try {
    localStorage.setItem(columnPreferenceKey(scopeKey, doctype), JSON.stringify(normalized));
  } catch {
    // Private mode/quota: state trong phiên vẫn chạy, chỉ không ghi nhớ lần sau.
  }
  return normalized;
}

export function clearColumnPreferences(scopeKey: string, doctype: string): void {
  try {
    localStorage.removeItem(columnPreferenceKey(scopeKey, doctype));
  } catch {
    // Private mode.
  }
}

export function hasCustomColumnPreferences(
  preferences: ListColumnPreferences,
  columns: ColumnPreferenceSpec[],
): boolean {
  const defaults = defaultColumnPreferences(columns);
  return (
    preferences.hidden.length > 0 ||
    Object.keys(preferences.widths).length > 0 ||
    preferences.density !== defaults.density ||
    preferences.groupBy !== "" ||
    preferences.order.some((field, index) => field !== defaults.order[index])
  );
}

export function applyColumnOrder<T extends { fieldname: string }>(columns: T[], order: string[]): T[] {
  if (order.length === 0) return columns;
  const rank = new Map(order.map((field, index) => [field, index] as const));
  return [...columns].sort((left, right) => {
    const leftRank = rank.get(left.fieldname);
    const rightRank = rank.get(right.fieldname);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}

/**
 * Chuyển cột theo hướng của đích.
 *
 * `toIdx` phải được dùng trực tiếp sau khi gỡ `from`: đi sang phải thì cột nằm SAU đích, đi sang
 * trái thì nằm TRƯỚC đích. Công thức cũ trừ 1 khi đi phải nên hai cột kề nhau không hề đổi chỗ.
 */
export function moveColumn(order: string[], from: string, to: string): string[] {
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;
  const next = [...order];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}

export function clampWidth(px: number, columnMin = MIN_COL_WIDTH): number {
  const min = Math.max(MIN_COL_WIDTH, Math.round(columnMin));
  return Math.min(MAX_COL_WIDTH, Math.max(min, Math.round(px)));
}

function uniqueFieldnames(columns: ColumnPreferenceSpec[]): string[] {
  return [...new Set(columns.map((column) => column.fieldname).filter(Boolean))];
}

function uniqueStrings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((value): value is string => typeof value === "string" && value.length > 0))];
}
