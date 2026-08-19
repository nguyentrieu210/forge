import {
  errors, permissionAllows,
  type Actor, type DocTypeMeta, type JsonObject, type JsonValue, type ListFilter,
} from "./router-platform.js";
import { toKernelField } from "./filters.js";
import type { FrappeRouterContext } from "./router.js";

// Mấy mẩu dùng lại khắp router: nạp metadata bắt buộc, ép chuỗi, gỡ tiền tố `tabDocType.`,
// khử trùng lặp, và chặn kích thước trang. Chúng nhỏ nhưng được 45 chỗ dùng, nên nằm trong
// router.ts đồng nghĩa mọi module tách ra sau này đều phải kéo cả router về.

export async function requireMeta(doctype: string, context: FrappeRouterContext): Promise<DocTypeMeta> {
  const meta = await context.metadata.getDocType(context.tenantId, doctype);
  if (!meta) throw errors.notFound(`DocType does not exist: ${doctype}`);
  return meta;
}

export function stringOr(value: JsonValue | undefined, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/** Frappe qualifies list fields as `` `tabDocType`.field ``. */
export function stripFieldQualifier(field: string): string {
  return field.replace(/`/g, "").split(".").pop() ?? field;
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Frappe clients ask for pages far larger than the kernel serves. Clamping
 * rather than rejecting keeps a list usable; the caller learns the real size
 * from the row count.
 */
export function clampPageLength(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return 20;
  return Math.min(value, 100);
}

/**
 * Frappe field names in a projection → kernel columns.
 *
 * Filters and sort already went through `toKernelField`; the projection did not, so a
 * client asking for the framework timestamps got "Field is not allowed: modified" —
 * the kernel column is `modified_at`. The Desk asks for `modified` on EVERY list, so
 * this made the list view fail outright for every doctype.
 *
 * `modified` also needs a companion: it is not a stored column but a token packed
 * from `modified_at` AND `version` (see `toFrappeModified`), so both must be pulled
 * or `toFrappeListRow` cannot emit it. Silently omitting it is worse than an error —
 * the Desk's inline editing would then send an empty token and the server would
 * refuse every save as a stale write.
 */
export function toKernelProjection(requested: string[]): string[] {
  const fields = new Set<string>();
  for (const raw of requested) {
    const field = toKernelField(stripFieldQualifier(raw));
    fields.add(field);
    if (field === "modified_at") fields.add("version");
  }
  return [...fields];
}

/**
 * The dimensions a Desk-wide context selector offers (company, fiscal year, …).
 *
 * Each dimension's options come from master data, narrowed by the actor's User
 * Permissions — so the selector cannot offer a company the user is not permitted
 * to see, which would produce an empty screen after selecting it.
 */
// Nhãn tiếng Việt: đây là chữ hiện trên thanh chọn phạm vi ở đầu mọi màn hình, và nó là
// một trong số ít chuỗi do SERVER quyết định — client không có chỗ nào dịch nó.
export const CONTEXT_DIMENSIONS: Array<{ key: string; label: string; recordType: string; required: boolean; dependsOn?: string }> = [
  { key: "company", label: "Công ty", recordType: "Company", required: true },
  { key: "fiscal_year", label: "Năm tài chính", recordType: "Fiscal Year", required: false },
  { key: "warehouse", label: "Kho", recordType: "Warehouse", required: false, dependsOn: "company" },
  { key: "branch", label: "Chi nhánh", recordType: "Branch", required: false, dependsOn: "company" },
  { key: "cost_center", label: "Trung tâm chi phí", recordType: "Cost Center", required: false, dependsOn: "company" },
  { key: "project", label: "Dự án", recordType: "Project", required: false },
  { key: "territory", label: "Khu vực", recordType: "Territory", required: false },
  { key: "selling_price_list", label: "Bảng giá bán", recordType: "Price List", required: false },
  { key: "buying_price_list", label: "Bảng giá mua", recordType: "Price List", required: false },
];

/**
 * Translates a context selection into list filters.
 *
 * Only dimensions the target doctype actually has a field for are applied. Applying
 * one it lacks would either error or filter on nothing; skipping it silently is
 * correct here because the selection is a global preference, not a request-specific
 * filter the user typed.
 */
export async function contextFilters(doctype: string, selection: JsonObject, context: FrappeRouterContext): Promise<ListFilter[]> {
  const meta = await requireMeta(doctype, context);
  const fieldNames = new Set(meta.fields.map((field) => field.fieldname));
  const filters: ListFilter[] = [];
  for (const dimension of CONTEXT_DIMENSIONS) {
    const value = selection[dimension.key];
    if (typeof value !== "string" || !value) continue;
    if (!fieldNames.has(dimension.key)) continue;
    filters.push({ field: dimension.key, operator: "eq", value });
  }
  return filters;
}

/**
 * The overview dashboard combines bounded operational counts with EXPLICIT charts.
 *
 * Every other approach here needs a definition per domain — a file someone writes for
 * "stock", another for "hr", another for "center" — and an app generated from a brief has
 * nobody to write it. So this reads the same metadata the rest of the platform already
 * holds: how many documents each doctype has, and for doctypes with a workflow, how many
 * sit in each state.
 *
 * That yields a real dashboard for an app that declared nothing beyond its doctypes, which
 * is the only version of this feature compatible with apps being data.
 *
 * Cost is bounded deliberately. One count per doctype plus one per workflow state is a lot
 * of round trips on a tenant with many apps, and a dashboard that times out is worse than a
 * thin one — so doctypes are capped and only the ones with a workflow pay for state counts.
 */
export const OVERVIEW_MAX_DOCTYPES = 12;

/** Nav entries whose target this actor may actually open. */
export async function permittedNav<T extends { key: string; kind?: string; permission_doctype?: string; required_roles?: string[] }>(nav: T[], context: FrappeRouterContext): Promise<T[]> {
  const visible = await Promise.all(nav.map(async (item) => {
    if (!hasRequiredNavRole(context.actor, item.required_roles)) return false;
    // Data-backed experiences (approval inboxes today, richer workspaces later)
    // must be hidden by the same read gate as their underlying DocType.
    const permissionDoctype = item.permission_doctype
      ?? (item.kind === "doctype" ? item.key : undefined)
      ?? (item.kind === "experience" && item.key.startsWith("approval:")
        ? item.key.slice("approval:".length)
        : undefined);
    if (!permissionDoctype) return true;
    try {
      await context.permissions.getReadScope(context.actor, context.tenantId, permissionDoctype);
      return true;
    } catch {
      // Omitted rather than shown-and-broken.
      return false;
    }
  }));
  return nav.filter((_, index) => visible[index]);
}

export function hasRequiredNavRole(actor: Actor, requiredRoles?: readonly string[]): boolean {
  if (!requiredRoles?.length) return true;
  if (actor.user_id === "Administrator" || actor.roles.includes("Administrator")) return true;
  return requiredRoles.some((role) => actor.roles.includes(role));
}
