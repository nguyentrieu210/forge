export type ColorScopePlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };
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
  const pending = (async () => {
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
  })();
  colorListCache.set(call, pending);
  void pending.catch(() => colorListCache.delete(call));
  return pending;
}

async function listFinishes(call: ColorScopePlatformCall): Promise<Json[]> {
  const hit = finishListCache.get(call);
  if (hit) return hit;
  const pending = (async () => {
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
  })();
  finishListCache.set(call, pending);
  void pending.catch(() => finishListCache.delete(call));
  return pending;
}

function scopeGroups(entity: Json): string[] {
  if (!Array.isArray(entity.applies_to_groups)) return [];
  return entity.applies_to_groups
    .filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => text(row.item_group))
    .filter(Boolean);
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

/** Fail-closed: rỗng + không applies_to_all_groups = KHÔNG áp dụng cho nhóm nào. */
function finishAppliesToGroups(finish: Json, groupsInLineage: Set<string>): boolean {
  if (checked(finish.applies_to_all_groups)) return true;
  const scopes = scopeGroups(finish);
  if (!scopes.length) return false;
  return scopes.some((scope) => groupsInLineage.has(scope));
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
): Promise<Array<{ code: string; name: string; requires_color: boolean }>> {
  const group = text(itemGroup);
  if (!group) return [];
  const [finishes, lineage] = await Promise.all([listFinishes(call), groupLineage(call, group)]);
  const groups = new Set(lineage);
  return finishes
    .filter((finish) => !checked(finish.disabled))
    .filter((finish) => allowedForUsage(finish, usage))
    .filter((finish) => finishAppliesToGroups(finish, groups))
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
 * (`finishAppliesToGroups` đã pass) — không tự resolve lại Bề mặt, gọi nơi dùng phải tự đảm
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
): Promise<string[]> {
  const finishes = await allowedFinishesForGroup(call, itemGroup, usage);
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

export async function colorScopeForItem(
  call: ColorScopePlatformCall,
  itemCode: string,
  usage: ColorUsage = "internal",
): Promise<{ item_group: string; allowed_colors: string[] }> {
  const code = text(itemCode);
  if (!code) throw new Error("Cần chọn mặt hàng để lấy danh sách màu.");
  const item = await readResource(call, "Item", code);
  if (!item) throw new Error(`Mặt hàng ${code} không tồn tại hoặc không còn được truy cập.`);
  const itemGroup = text(item.item_group);
  if (!itemGroup) throw new Error(`Mặt hàng ${code} chưa có Nhóm hàng.`);
  return {
    item_group: itemGroup,
    allowed_colors: await allowedColorNamesForGroup(call, itemGroup, usage),
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
  colors_by_finish: Record<string, string[]>;
}> {
  const code = text(itemCode);
  if (!code) throw new Error("Cần chọn mặt hàng để lấy danh sách Bề mặt/màu.");
  const item = await readResource(call, "Item", code);
  if (!item) throw new Error(`Mặt hàng ${code} không tồn tại hoặc không còn được truy cập.`);
  const itemGroup = text(item.item_group);
  if (!itemGroup) throw new Error(`Mặt hàng ${code} chưa có Nhóm hàng.`);

  const allowedFinishes = await allowedFinishesForGroup(call, itemGroup, usage);
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

  return {
    item_group: itemGroup,
    allowed_finishes: allowedFinishes,
    allowed_colors: [...allColors].sort((left, right) => left.localeCompare(right, "vi")),
    colors_by_finish: colorsByFinish,
  };
}
