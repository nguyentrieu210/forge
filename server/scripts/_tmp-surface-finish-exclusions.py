from pathlib import Path
from copy import deepcopy
import json


def rep(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


# --- Brief schema -----------------------------------------------------------
brief_path = Path("server/briefs/alumdoor.json")
brief = json.loads(brief_path.read_text(encoding="utf-8"))
surface = next(d for d in brief["doctypes"] if d["name"] == "Surface Finish")


def fieldname(field):
    return field.split(":", 1)[0].strip() if isinstance(field, str) else field.get("fieldname", "")


fields = [fieldname(f) for f in surface["fields"]]
if "excluded_groups" not in fields:
    at = fields.index("applies_to_all_groups") + 1
    surface["fields"][at:at] = [
        {
            "fieldname": "excluded_groups",
            "fieldtype": "Table",
            "options": "Surface Finish Excluded Group",
            "label": "Nhóm SP loại trừ",
            "description": "Loại cả nhóm và mọi nhóm con, dù nhóm cha đang nằm trong phạm vi áp dụng.",
        },
        {
            "fieldname": "excluded_items",
            "fieldtype": "Table",
            "options": "Surface Finish Excluded Item",
            "label": "Mặt hàng loại trừ",
            "description": "Loại từng Item cụ thể, dù Item thuộc Nhóm SP đang được áp dụng.",
        },
    ]

by_name = {d["name"]: d for d in brief["doctypes"]}
scope_dt = by_name["Surface Finish Scope"]
if "Surface Finish Excluded Group" not in by_name:
    d = deepcopy(scope_dt)
    d["name"] = "Surface Finish Excluded Group"
    d["label"] = "Nhóm SP loại trừ (Bề mặt)"
    brief["doctypes"].append(d)
if "Surface Finish Excluded Item" not in by_name:
    d = deepcopy(scope_dt)
    d["name"] = "Surface Finish Excluded Item"
    d["label"] = "Mặt hàng loại trừ (Bề mặt)"
    d["title"] = "item_code"
    d["fields"] = ["item_code:Link(Item)! Mặt hàng"]
    brief["doctypes"].append(d)

if str(brief.get("version")) == "1.27.4":
    brief["version"] = "1.27.5"
brief_path.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# --- Canonical payload ------------------------------------------------------
p = Path("server/scripts/lib/alumdoor-color-catalog.mjs")
s = p.read_text(encoding="utf-8")
s = rep(
    s,
    '''    applies_to_groups: (finish.groups ?? []).map((itemGroup, index) => ({
      row_id: `SCOPE-${String(index + 1).padStart(2, "0")}`,
      item_group: itemGroup,
    })),
    applies_to_all_groups: Boolean(finish.appliesToAllGroups),''',
    '''    applies_to_groups: (finish.groups ?? []).map((itemGroup, index) => ({
      row_id: `SCOPE-${String(index + 1).padStart(2, "0")}`,
      item_group: itemGroup,
    })),
    excluded_groups: (finish.excludedGroups ?? []).map((itemGroup, index) => ({
      row_id: `EX-GROUP-${String(index + 1).padStart(2, "0")}`,
      item_group: itemGroup,
    })),
    excluded_items: (finish.excludedItems ?? []).map((itemCode, index) => ({
      row_id: `EX-ITEM-${String(index + 1).padStart(2, "0")}`,
      item_code: itemCode,
    })),
    applies_to_all_groups: Boolean(finish.appliesToAllGroups),''',
    "catalog payload",
)
p.write_text(s, encoding="utf-8")


# --- Runtime resolver -------------------------------------------------------
p = Path("server/apps-src/alumdoor-worker/src/color-scopes.ts")
s = p.read_text(encoding="utf-8")
s = rep(
    s,
    '''function scopeGroups(entity: Json): string[] {
  if (!Array.isArray(entity.applies_to_groups)) return [];
  return entity.applies_to_groups
    .filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => text(row.item_group))
    .filter(Boolean);
}''',
    '''function tableRows(value: unknown): Json[] {
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
}''',
    "resolver table helpers",
)
s = rep(
    s,
    '''/** Fail-closed: rỗng + không applies_to_all_groups = KHÔNG áp dụng cho nhóm nào. */
function finishAppliesToGroups(finish: Json, groupsInLineage: Set<string>): boolean {
  if (checked(finish.applies_to_all_groups)) return true;
  const scopes = scopeGroups(finish);
  if (!scopes.length) return false;
  return scopes.some((scope) => groupsInLineage.has(scope));
}''',
    '''/** Include fail-closed; exclusion luôn thắng include. */
function finishAppliesToContext(finish: Json, groupsInLineage: Set<string>, itemCode = ""): boolean {
  const scopes = scopeGroups(finish);
  const included = checked(finish.applies_to_all_groups)
    || (scopes.length > 0 && scopes.some((scope) => groupsInLineage.has(scope)));
  if (!included) return false;
  if (groupTable(finish, "excluded_groups").some((group) => groupsInLineage.has(group))) return false;
  const code = text(itemCode);
  if (code && itemTable(finish, "excluded_items").some((excluded) => excluded === code)) return false;
  return true;
}''',
    "resolver exclusion precedence",
)
s = rep(
    s,
    '''export async function allowedFinishesForGroup(
  call: ColorScopePlatformCall,
  itemGroup: string,
  usage: ColorUsage = "internal",
): Promise<Array<{ code: string; name: string; requires_color: boolean }>> {''',
    '''export async function allowedFinishesForGroup(
  call: ColorScopePlatformCall,
  itemGroup: string,
  usage: ColorUsage = "internal",
  itemCode = "",
): Promise<Array<{ code: string; name: string; requires_color: boolean }>> {''',
    "allowed finishes signature",
)
s = rep(s, ".filter((finish) => finishAppliesToGroups(finish, groups))", ".filter((finish) => finishAppliesToContext(finish, groups, itemCode))", "finish filter")
s = rep(
    s,
    '''export async function allowedColorNamesForGroup(
  call: ColorScopePlatformCall,
  itemGroup: string,
  usage: ColorUsage = "internal",
): Promise<string[]> {
  const finishes = await allowedFinishesForGroup(call, itemGroup, usage);''',
    '''export async function allowedColorNamesForGroup(
  call: ColorScopePlatformCall,
  itemGroup: string,
  usage: ColorUsage = "internal",
  itemCode = "",
): Promise<string[]> {
  const finishes = await allowedFinishesForGroup(call, itemGroup, usage, itemCode);''',
    "allowed colors signature",
)
s = rep(s, "allowed_colors: await allowedColorNamesForGroup(call, itemGroup, usage),", "allowed_colors: await allowedColorNamesForGroup(call, itemGroup, usage, code),", "item color scope")
s = rep(s, "const allowedFinishes = await allowedFinishesForGroup(call, itemGroup, usage);", "const allowedFinishes = await allowedFinishesForGroup(call, itemGroup, usage, code);", "item finish context")
s = s.replace("`finishAppliesToGroups` đã pass", "`finishAppliesToContext` đã pass")
p.write_text(s, encoding="utf-8")


# --- Resolver tests ---------------------------------------------------------
p = Path("server/tests/alumdoor-color-scopes.test.mjs")
s = p.read_text(encoding="utf-8")
s = rep(s, '  "Cửa CN Đức": { parent_item_group: "Cửa thành phẩm" },\n', '  "Cửa CN Đức": { parent_item_group: "Cửa thành phẩm" },\n  "Cửa CN Đức thử nghiệm": { parent_item_group: "Cửa CN Đức" },\n', "test child group")
s = rep(
    s,
    '  { name: "SON_VAN_GO", finish_code: "SON_VAN_GO", finish_name: "SƠN VÂN GỖ", requires_color: true, applies_to_all_groups: false, applies_to_groups: scope(["Cửa CN Đức"]), usage_scope: "Mua & bán", disabled: false },',
    '  { name: "SON_VAN_GO", finish_code: "SON_VAN_GO", finish_name: "SƠN VÂN GỖ", requires_color: true, applies_to_all_groups: false, applies_to_groups: scope(["Cửa CN Đức"]), excluded_groups: scope(["Cửa CN Đức thử nghiệm"]), excluded_items: [{ row_id: "EX-I1", item_code: "AL595-BLOCKED" }], usage_scope: "Mua & bán", disabled: false },',
    "test finish fixture",
)
s = rep(s, '  AL548: { item_group: "Cửa CN Đức" },\n', '  AL548: { item_group: "Cửa CN Đức" },\n  "AL595-BLOCKED": { item_group: "Cửa CN Đức" },\n  "GERMAN-TEST-01": { item_group: "Cửa CN Đức thử nghiệm" },\n', "test item fixture")
marker = '''test("SƠN VÂN GỖ hiện không có màu nào ngoài VÂN GỖ", async () => {
  const colors = await allowedColorNamesForGroupAndFinish(fakeCall(), "Cửa CN Đức", "SON_VAN_GO", "internal");
  assert.deepEqual(colors, ["VÂN GỖ"]);
});
'''
extra = marker + '''

test("excluded_items thắng group include", async () => {
  const result = await finishColorContextForItem(fakeCall(), "AL595-BLOCKED", undefined, "internal");
  assert.ok(!result.allowed_finishes.some((finish) => finish.code === "SON_VAN_GO"));
  assert.ok(!result.allowed_colors.includes("VÂN GỖ"));
});

test("excluded_groups thắng group cha include và loại toàn nhánh con", async () => {
  const finishes = await allowedFinishesForGroup(fakeCall(), "Cửa CN Đức thử nghiệm", "internal");
  assert.ok(!finishes.some((finish) => finish.code === "SON_VAN_GO"));
  const item = await finishColorContextForItem(fakeCall(), "GERMAN-TEST-01", undefined, "internal");
  assert.ok(!item.allowed_finishes.some((finish) => finish.code === "SON_VAN_GO"));
});

test("exclusion không ảnh hưởng Item khác cùng nhóm", async () => {
  const result = await finishColorContextForItem(fakeCall(), "AL548", undefined, "internal");
  assert.ok(result.allowed_finishes.some((finish) => finish.code === "SON_VAN_GO"));
  assert.ok(result.allowed_colors.includes("VÂN GỖ"));
});
'''
s = rep(s, marker, extra, "resolver exclusion tests")
p.write_text(s, encoding="utf-8")


# --- Catalog tests ----------------------------------------------------------
p = Path("server/tests/alumdoor-color-catalog.test.mjs")
s = p.read_text(encoding="utf-8")
marker = '''test("SƠN TĨNH ĐIỆN / MẠ MÀU / SƠN VÂN GỖ: requires_color=true", () => {
  for (const code of ["SON_TINH_DIEN", "MA_MAU", "SON_VAN_GO"]) {
    const payload = alumdoorSurfaceFinishPayload(ALUMDOOR_SURFACE_FINISH_CATALOG.find((f) => f.code === code));
    assert.equal(payload.requires_color, true, code);
    assert.equal(payload.applies_to_all_groups, false, code);
  }
});
'''
extra = marker + '''

test("Surface Finish payload hỗ trợ loại trừ theo Nhóm hàng và Item", () => {
  const payload = alumdoorSurfaceFinishPayload({ code: "TEST", name: "TEST", groups: ["Cửa CN Đức"], excludedGroups: ["Cửa CN Đức thử nghiệm"], excludedItems: ["AL595-BLOCKED"], requiresColor: true });
  assert.deepEqual(payload.excluded_groups.map((row) => row.item_group), ["Cửa CN Đức thử nghiệm"]);
  assert.deepEqual(payload.excluded_items.map((row) => row.item_code), ["AL595-BLOCKED"]);
});
'''
s = rep(s, marker, extra, "catalog exclusion test")
p.write_text(s, encoding="utf-8")


# --- Schema authority test --------------------------------------------------
p = Path("server/tests/alumdoor-color-seed-authority.test.mjs")
s = p.read_text(encoding="utf-8")
if 'Surface Finish schema exposes group and item exclusions' not in s:
    s += '''\n\ntest("Surface Finish schema exposes group and item exclusions in base and V2 briefs", () => {\n  for (const relative of ["server/briefs/alumdoor.json", "server/briefs/alumdoor-v2.json"]) {\n    const brief = JSON.parse(readFileSync(join(repoRoot, relative), "utf8"));\n    const surface = brief.doctypes.find((row) => row.name === "Surface Finish");\n    assert.ok(surface, `${relative}: missing Surface Finish`);\n    const names = surface.fields.map((field) => typeof field === "string" ? field.split(":")[0].trim() : field.fieldname);\n    assert.ok(names.includes("excluded_groups"), `${relative}: missing excluded_groups`);\n    assert.ok(names.includes("excluded_items"), `${relative}: missing excluded_items`);\n    assert.ok(brief.doctypes.some((row) => row.name === "Surface Finish Excluded Group"));\n    assert.ok(brief.doctypes.some((row) => row.name === "Surface Finish Excluded Item"));\n  }\n});\n'''
p.write_text(s, encoding="utf-8")

print("PATCH_OK")
