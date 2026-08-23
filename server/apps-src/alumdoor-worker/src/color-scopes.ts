export type ColorScopePlatformCall = ((path: string, init?: RequestInit) => Promise<Response>)
  & { via?: string; tenantKey?: string };
export type ColorUsage = "purchase" | "sales" | "internal";

type Json = Record<string, unknown>;

/**
 * Pipeline hội tụ 2026-08-16: Surface Finish (Bề mặt) là authority của "áp dụng nhóm nào" ở
 * tầng RỘNG; Item Color chỉ thu hẹp thêm nếu cần. Không còn suy Bề mặt hợp lệ ngược từ tập
 * màu — Surface Finish tự khai applies_to_groups/applies_to_all_groups của chính nó.
 *
 *   resolve Item → resolve Item Group lineage
 *     → resolve Surface Finish hợp lệ (scope + usage + disabled)
 *     → resolve Item Color thuộc từng Surface Finish hợp lệ đó
 *     → thu hẹp thêm theo Item Color.applies_to_groups (rỗng = kế thừa, không phải wildcard)
 *     → lọc usage_scope + disabled
 *     → kết quả xác định (sort ổn định)
 *
 * Fail-closed: một Surface Finish/Item Color không applies_to_all_groups và
 * applies_to_groups rỗng thì KHÔNG áp dụng cho bất kỳ nhóm nào — không phải "áp dụng mọi nơi".
 * Duy nhất Item Color được phép coi rỗng là "không thu hẹp thêm" (kế thừa nguyên phạm vi của
 * chính Surface Finish nó thuộc về, phạm vi đó đã qua fail-closed check ở bước Bề mặt rồi).
 */

const colorListCache = new WeakMap<object, Promise<Json[]>>();
const finishListCache = new WeakMap<object, Promise<Json[]>>();

/**
 * NHỚ ĐỆM DANH MỤC GIỮA CÁC LƯỢT GỌI, có hạn dùng.
 *
 * Hai `WeakMap` ở trên chỉ sống trong MỘT lượt request (khoá là chính hàm `call`), nên mỗi lần
 * người bán chọn một mặt hàng là đọc lại từ đầu: danh sách màu và bề mặt đều bị nền tảng từ chối
 * trả bảng con, nên phải đọc thêm từng tài liệu lẻ. Đo thực tế: ~24 màu + 4 bề mặt ≈ 30 lượt đọc,
 * mỗi lượt ~43 ms và KHÔNG chạy song song thật — cộng lại ~1,3 s chỉ để dựng một danh sách màu
 * gần như không bao giờ đổi.
 *
 * Hạn dùng ngắn là điểm cân bằng: sửa một màu trong danh mục thì chậm nhất 30 giây là màn bán
 * thấy, còn thao tác chọn mặt hàng — vốn lặp liên tục — thì đi thẳng vào ô nhớ.
 *
 * Khoá gồm tenant nên hai tenant không thấy dữ liệu của nhau. Thiếu `tenantKey` thì KHÔNG nhớ
 * đệm: thà chậm còn hơn trộn danh mục giữa các tenant.
 */
const CATALOG_TTL_MS = 30_000;
const catalogCache = new Map<string, { at: number; value: Promise<Json[]> }>();

async function cachedCatalog(
  call: ColorScopePlatformCall,
  kind: string,
  load: () => Promise<Json[]>,
): Promise<Json[]> {
  const tenant = text(call.tenantKey);
  if (!tenant) return load();
  const key = `${tenant}${kind}`;
  const hit = catalogCache.get(key);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.value;
  const pending = load();
  catalogCache.set(key, { at: Date.now(), value: pending });
  void pending.catch(() => catalogCache.delete(key));
  return pending;
}
const groupLineageCache = new WeakMap<object, Map<string, Promise<string[]>>>();

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

async function readResource(call: ColorScopePlatformCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

async function listColors(call: ColorScopePlatformCall): Promise<Json[]> {
  const hit = colorListCache.get(call);
  if (hit) return hit;
  const pending = cachedCatalog(call, "|color", async () => {
    const query = new URLSearchParams({
      fields: JSON.stringify(["name", "color_code", "disabled", "usage_scope"]),
      limit_page_length: "500",
    });
    const response = await call(`resource/Item%20Color?${query.toString()}`);
    if (!response.ok) throw new Error(`Không đọc được danh mục Màu vật tư (HTTP ${response.status}).`);
    const summaries = ((await response.json()) as { data?: Json[] }).data ?? [];
    // Frappe-compatible list endpoints deliberately reject Table fields. Read each of the
    // small colour masters in parallel so `applies_to_groups`/`surface_finish` come from the
    // full document.
    return await Promise.all(summaries.map(async (summary) => {
      const name = text(summary.name || summary.color_code);
      const document = name ? await readResource(call, "Item Color", name) : null;
      return { ...summary, ...(document ?? {}) };
    }));
  });
  colorListCache.set(call, pending);
  void pending.catch(() => colorListCache.delete(call));
  return pending;
}

async function listFinishes(call: ColorScopePlatformCall): Promise<Json[]> {
  const hit = finishListCache.get(call);
  if (hit) return hit;
  const pending = cachedCatalog(call, "|finish", async () => {
    const query = new URLSearchParams({
      fields: JSON.stringify(["name", "finish_code", "finish_name", "requires_color", "applies_to_all_groups", "disabled", "usage_scope"]),
      limit_page_length: "100",
    });
    const response = await call(`resource/Surface%20Finish?${query.toString()}`);
    if (!response.ok) throw new Error(`Không đọc được danh mục Bề mặt (HTTP ${response.status}).`);
    const summaries = ((await response.json()) as { data?: Json[] }).data ?? [];
    // Table field applies_to_groups cũng bị list endpoint bỏ qua — đọc full document.
    return await Promise.all(summaries.map(async (summary) => {
      const name = text(summary.name || summary.finish_code);
      const document = name ? await readResource(call, "Surface Finish", name) : null;
      return { ...summary, ...(document ?? {}) };
    }));
  });
  finishListCache.set(call, pending);
  void pending.catch(() => finishListCache.delete(call));
  return pending;
}

function tableRows(value: unknown): Json[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function groupTable(entity: Json, field: "applies_to_groups" | "excluded_groups"): string[] {
  return tableRows(entity[field]).map((row) => text(row.item_group)).filter(Boolean);
}

function itemTable(entity: Json, field: "excluded_items"): string[] {
  return tableRows(entity[field]).map((row) => text(row.item_code)).filter(Boolean);
}

function scopeGroups(entity: Json): string[] {
  return groupTable(entity, "applies_to_groups");
}

export function normalizeColorUsage(value: unknown): ColorUsage {
  const usage = text(value).toLocaleLowerCase("vi");
  if (["purchase", "mua", "mua hàng"].includes(usage)) return "purchase";
  if (["sales", "sale", "bán", "bán hàng"].includes(usage)) return "sales";
  return "internal";
}

export function colorUsageForDoctype(doctype: unknown): ColorUsage {
  const name = text(doctype);
  if ([
    "Material Request", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice",
    "Material Request Item", "Supplier Quotation Item", "Purchase Order Item", "Purchase Receipt Item", "Purchase Invoice Item",
  ].includes(name)) return "purchase";
  if ([
    "Quotation", "Sales Order", "Delivery Note", "Sales Invoice",
    "Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item",
  ].includes(name)) return "sales";
  return "internal";
}

function allowedForUsage(entity: Json, usage: ColorUsage): boolean {
  if (usage === "internal") return true;
  const scope = text(entity.usage_scope) || "Mua & bán";
  if (usage === "purchase") return scope !== "Bán hàng";
  return scope !== "Mua hàng";
}

/** Include fail-closed; exclusion luôn thắng include. */
function finishAppliesToContext(finish: Json, groupsInLineage: Set<string>, itemCode = ""): boolean {
  const scopes = scopeGroups(finish);
  const included = checked(finish.applies_to_all_groups)
    || (scopes.length > 0 && scopes.some((scope) => groupsInLineage.has(scope)));
  if (!included) return false;
  if (groupTable(finish, "excluded_groups").some((group) => groupsInLineage.has(group))) return false;
  const code = text(itemCode);
  if (code && itemTable(finish, "excluded_items").some((excluded) => excluded === code)) return false;
  return true;
}

/**
 * Item Color rỗng KHÔNG fail-closed — nó nghĩa là "không thu hẹp thêm", kế thừa nguyên phạm
 * vi của chính Surface Finish nó thuộc về (phạm vi đó đã qua `finishAppliesToGroups` rồi).
 * Có khai thì phải khớp lineage như finish.
 */
function colorAppliesToGroups(color: Json, groupsInLineage: Set<string>): boolean {
  const scopes = scopeGroups(color);
  if (!scopes.length) return true;
  return scopes.some((scope) => groupsInLineage.has(scope));
}

async function groupLineage(call: ColorScopePlatformCall, itemGroup: string): Promise<string[]> {
  let cache = groupLineageCache.get(call);
  if (!cache) {
    cache = new Map();
    groupLineageCache.set(call, cache);
  }
  const normalized = text(itemGroup);
  const hit = cache.get(normalized);
  if (hit) return hit;
  const pending = (async () => {
    const lineage: string[] = [];
    const visited = new Set<string>();
    let current = normalized;
    while (current && lineage.length < 32) {
      if (visited.has(current)) throw new Error(`Cây Nhóm hàng bị lặp tại ${current}.`);
      visited.add(current);
      lineage.push(current);
      const group = await readResource(call, "Item Group", current);
      if (!group) throw new Error(`Nhóm hàng ${current} không tồn tại hoặc không còn được truy cập.`);
      current = text(group.parent_item_group);
    }
    return lineage;
  })();
  cache.set(normalized, pending);
  void pending.catch(() => cache?.delete(normalized));
  return pending;
}

/** Bề mặt hợp lệ cho một Nhóm hàng: Surface Finish tự khai scope, không suy từ màu. */
export async function allowedFinishesForGroup(
  call: ColorScopePlatformCall,
  itemGroup: string,
  usage: ColorUsage = "internal",
  itemCode = "",
): Promise<Array<{ code: string; name: string; requires_color: boolean }>> {
  const group = text(itemGroup);
  if (!group) return [];
  const [finishes, lineage] = await Promise.all([listFinishes(call), groupLineage(call, group)]);
  const groups = new Set(lineage);
  return finishes
    .filter((finish) => !checked(finish.disabled))
    .filter((finish) => allowedForUsage(finish, usage))
    .filter((finish) => finishAppliesToContext(finish, groups, itemCode))
    .map((finish) => ({
      code: text(finish.name || finish.finish_code),
      name: text(finish.finish_name || finish.name),
      requires_color: checked(finish.requires_color),
    }))
    .filter((finish) => Boolean(finish.code))
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));
}

/**
 * Màu hợp lệ cho một Nhóm hàng, theo đúng MỘT Bề mặt đã xác định hợp lệ cho nhóm đó
 * (`finishAppliesToContext` đã pass) — không tự resolve lại Bề mặt, gọi nơi dùng phải tự đảm
 * bảo `finishCode` nằm trong `allowedFinishesForGroup`.
 */
async function scopedColorsForGroupAndFinish(
  call: ColorScopePlatformCall,
  itemGroup: string,
  finishCode: string,
  usage: ColorUsage,
): Promise<Json[]> {
  const group = text(itemGroup);
  const finish = text(finishCode);
  if (!group || !finish) return [];
  const [colors, lineage] = await Promise.all([listColors(call), groupLineage(call, group)]);
  const groups = new Set(lineage);
  return colors.filter((color) => {
    if (text(color.surface_finish) !== finish) return false;
    if (checked(color.disabled)) return false;
    if (!allowedForUsage(color, usage)) return false;
    return colorAppliesToGroups(color, groups);
  });
}

export async function allowedColorNamesForGroupAndFinish(
  call: ColorScopePlatformCall,
  itemGroup: string,
  finish: string,
  usage: ColorUsage = "internal",
): Promise<string[]> {
  const colors = await scopedColorsForGroupAndFinish(call, itemGroup, finish, usage);
  return colors
    .map((color) => text(color.name || color.color_code))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "vi"));
}

/**
 * Màu hợp lệ cho một Nhóm hàng, hợp trên MỌI Bề mặt hợp lệ của nhóm đó — dùng cho các caller
 * cũ (server validator, `alumdoor.catalog.allowed_colors`) chưa cần tách theo Bề mặt.
 */
export async function allowedColorNamesForGroup(
  call: ColorScopePlatformCall,
  itemGroup: string,
  usage: ColorUsage = "internal",
  itemCode = "",
): Promise<string[]> {
  const finishes = await allowedFinishesForGroup(call, itemGroup, usage, itemCode);
  const perFinish = await Promise.all(
    finishes.map((finish) => scopedColorsForGroupAndFinish(call, itemGroup, finish.code, usage)),
  );
  const names = new Set<string>();
  for (const colors of perFinish) {
    for (const color of colors) {
      const name = text(color.name || color.color_code);
      if (name) names.add(name);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right, "vi"));
}

/**
 * Tên đọc được của từng mã màu, để ô chọn thôi hiện mã thô.
 *
 * Giá trị lưu vẫn là MÃ (`VAN_GO`) vì đó là khoá của Item Color và là thứ mọi chốt chặn đối
 * chiếu. Chỉ phần hiện lên màn đổi sang `color_name` ("VÂN GỖ") — người bán đọc tên, hệ thống
 * vẫn ghi mã. Mã nào chưa đặt tên thì giữ nguyên mã, không bịa.
 */
export async function colorLabels(
  call: ColorScopePlatformCall,
  codes: string[],
): Promise<Record<string, string>> {
  const nhan: Record<string, string> = {};
  await Promise.all([...new Set(codes.filter(Boolean))].map(async (code) => {
    const doc = await readResource(call, "Item Color", code).catch(() => null);
    const ten = text(doc?.color_name);
    if (ten && ten !== code) nhan[code] = ten;
  }));
  return nhan;
}

export async function colorScopeForItem(
  call: ColorScopePlatformCall,
  itemCode: string,
  usage: ColorUsage = "internal",
): Promise<{ item_group: string; allowed_colors: string[]; color_labels: Record<string, string> }> {
  const code = text(itemCode);
  if (!code) throw new Error("Cần chọn mặt hàng để lấy danh sách màu.");
  const item = await readResource(call, "Item", code);
  if (!item) throw new Error(`Mặt hàng ${code} không tồn tại hoặc không còn được truy cập.`);
  const itemGroup = text(item.item_group);
  if (!itemGroup) throw new Error(`Mặt hàng ${code} chưa có Nhóm hàng.`);
  const allowed = await allowedColorNamesForGroup(call, itemGroup, usage, code);
  return {
    item_group: itemGroup,
    allowed_colors: allowed,
    color_labels: await colorLabels(call, allowed),
  };
}

/**
 * Toàn bộ luồng Item → Bề mặt hợp lệ → Màu hợp lệ theo từng Bề mặt, cho một Item cụ thể.
 * Trả `colors_by_finish` để client không phải tự join `allowed_finishes` với `allowed_colors`
 * — server vẫn là authority duy nhất, client chỉ render.
 *
 * `finish` optional: bỏ trống thì `allowed_colors`/`colors_by_finish` phủ TẤT CẢ Bề mặt hợp lệ
 * (dùng để dựng combobox Bề mặt trước khi người dùng chọn); truyền vào để thu hẹp về đúng một
 * Bề mặt (bước 2 sau khi người dùng đã chọn). Fail closed: Bề mặt không nằm trong tập hợp lệ
 * của chính Item này thì `allowed_colors` rỗng, không phải lỗi im lặng trả toàn bộ catalog.
 */
export async function finishColorContextForItem(
  call: ColorScopePlatformCall,
  itemCode: string,
  finish?: string,
  usage: ColorUsage = "internal",
): Promise<{
  item_group: string;
  allowed_finishes: Array<{ code: string; name: string; requires_color: boolean }>;
  allowed_colors: string[];
  color_labels: Record<string, string>;
  colors_by_finish: Record<string, string[]>;
}> {
  const code = text(itemCode);
  if (!code) throw new Error("Cần chọn mặt hàng để lấy danh sách Bề mặt/màu.");
  const item = await readResource(call, "Item", code);
  if (!item) throw new Error(`Mặt hàng ${code} không tồn tại hoặc không còn được truy cập.`);
  const itemGroup = text(item.item_group);
  if (!itemGroup) throw new Error(`Mặt hàng ${code} chưa có Nhóm hàng.`);

  const allowedFinishes = await allowedFinishesForGroup(call, itemGroup, usage, code);
  const finishCode = text(finish);
  const targetFinishes = finishCode
    ? allowedFinishes.filter((entry) => entry.code === finishCode) // fail closed nếu không khớp
    : allowedFinishes;

  const colorsByFinish: Record<string, string[]> = {};
  await Promise.all(targetFinishes.map(async (entry) => {
    colorsByFinish[entry.code] = await allowedColorNamesForGroupAndFinish(call, itemGroup, entry.code, usage);
  }));

  const allColors = new Set<string>();
  for (const names of Object.values(colorsByFinish)) for (const name of names) allColors.add(name);

  const sortedColors = [...allColors].sort((left, right) => left.localeCompare(right, "vi"));
  return {
    item_group: itemGroup,
    allowed_finishes: allowedFinishes,
    allowed_colors: sortedColors,
    color_labels: await colorLabels(call, sortedColors),
    colors_by_finish: colorsByFinish,
  };
}
