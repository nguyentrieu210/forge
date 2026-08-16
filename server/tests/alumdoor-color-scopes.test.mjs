import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedColorNamesForGroup,
  allowedColorNamesForGroupAndFinish,
  allowedFinishesForGroup,
  colorScopeForItem,
  finishColorContextForItem,
} from "../dist/apps-src/alumdoor-worker/src/color-scopes.js";

/**
 * Fixture mô phỏng đúng cây thật: Item Group (Cửa thành phẩm > Cửa CN Đức/Cửa tấm liền
 * Úc/Cửa Đài Loan; Motor & điện > Mô tơ; Phụ kiện chung; Phụ kiện sơn tĩnh điện — nhóm riêng
 * dùng để whitelist STĐ cho một phụ kiện cụ thể), Surface Finish (THO/SON_TINH_DIEN/MA_MAU/
 * SON_VAN_GO đúng kiến trúc hội tụ 2026-08-16: Bề mặt tự khai applies_to_groups/
 * applies_to_all_groups), Item Color theo đúng catalog thật.
 */
const ITEM_GROUPS = {
  "Cửa thành phẩm": { parent_item_group: "" },
  "Cửa CN Đức": { parent_item_group: "Cửa thành phẩm" },
  "Cửa CN Đức thử nghiệm": { parent_item_group: "Cửa CN Đức" },
  "Cửa tấm liền Úc": { parent_item_group: "Cửa thành phẩm" },
  "Cửa Đài Loan": { parent_item_group: "Cửa thành phẩm" },
  "Motor & điện": { parent_item_group: "" },
  "Mô tơ": { parent_item_group: "Motor & điện" },
  "Phụ kiện chung": { parent_item_group: "" },
  "Phụ kiện sơn tĩnh điện": { parent_item_group: "" },
};

const scope = (groups) => groups.map((item_group, i) => ({ row_id: `S${i}`, item_group }));

const FINISHES = [
  { name: "THO", finish_code: "THO", finish_name: "THÔ", requires_color: false, applies_to_all_groups: true, applies_to_groups: [], usage_scope: "Mua hàng", disabled: false },
  { name: "SON_TINH_DIEN", finish_code: "SON_TINH_DIEN", finish_name: "SƠN TĨNH ĐIỆN", requires_color: true, applies_to_all_groups: false, applies_to_groups: scope(["Cửa CN Đức", "Phụ kiện sơn tĩnh điện"]), usage_scope: "Mua & bán", disabled: false },
  { name: "MA_MAU", finish_code: "MA_MAU", finish_name: "MẠ MÀU", requires_color: true, applies_to_all_groups: false, applies_to_groups: scope(["Cửa tấm liền Úc", "Cửa Đài Loan"]), usage_scope: "Mua & bán", disabled: false },
  { name: "SON_VAN_GO", finish_code: "SON_VAN_GO", finish_name: "SƠN VÂN GỖ", requires_color: true, applies_to_all_groups: false, applies_to_groups: scope(["Cửa CN Đức"]), excluded_groups: scope(["Cửa CN Đức thử nghiệm"]), excluded_items: [{ row_id: "EX-I1", item_code: "AL595-BLOCKED" }], usage_scope: "Mua & bán", disabled: false },
  { name: "TAT", finish_code: "TAT", finish_name: "BỀ MẶT TẮT", requires_color: true, applies_to_all_groups: true, applies_to_groups: [], usage_scope: "Mua & bán", disabled: true },
];

const COLORS = [
  { name: "THÔ", color_code: "THÔ", color_name: "THÔ", surface_finish: "THO", usage_scope: "Mua hàng", applies_to_groups: [], disabled: false },
  { name: "GHI SẦN", color_code: "GHI SẦN", color_name: "GHI SẦN", surface_finish: "SON_TINH_DIEN", usage_scope: "Mua & bán", applies_to_groups: [], disabled: false },
  { name: "CAFÉ", color_code: "CAFÉ", color_name: "CAFÉ", surface_finish: "SON_TINH_DIEN", usage_scope: "Mua & bán", applies_to_groups: [], disabled: false },
  { name: "MÀU TẮT", color_code: "MÀU TẮT", color_name: "MÀU TẮT", surface_finish: "SON_TINH_DIEN", usage_scope: "Mua & bán", applies_to_groups: [], disabled: true },
  { name: "GHI ÚC - KEM ÚC", color_code: "GHI ÚC - KEM ÚC", color_name: "GHI ÚC - KEM ÚC", surface_finish: "MA_MAU", usage_scope: "Mua & bán", applies_to_groups: scope(["Cửa tấm liền Úc"]), disabled: false },
  { name: "XÁM - XANH NGỌC", color_code: "XÁM - XANH NGỌC", color_name: "XÁM - XANH NGỌC", surface_finish: "MA_MAU", usage_scope: "Mua & bán", applies_to_groups: scope(["Cửa Đài Loan"]), disabled: false },
  { name: "VÂN GỖ", color_code: "VÂN GỖ", color_name: "VÂN GỖ", surface_finish: "SON_VAN_GO", usage_scope: "Mua & bán", applies_to_groups: [], disabled: false },
];

const ITEMS = {
  AL548: { item_group: "Cửa CN Đức" },
  "AL595-BLOCKED": { item_group: "Cửa CN Đức" },
  "GERMAN-TEST-01": { item_group: "Cửa CN Đức thử nghiệm" },
  "CUA-UC-01": { item_group: "Cửa tấm liền Úc" },
  "CUA-TL-01": { item_group: "Cửa Đài Loan" },
  "MOTOR-01": { item_group: "Mô tơ" },
  "VIT-M6": { item_group: "Phụ kiện chung" },
  "OC-STD-01": { item_group: "Phụ kiện sơn tĩnh điện" },
};

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function fakeCall() {
  return Object.assign(async (path) => {
    const [routePart] = path.split("?");
    const decoded = decodeURIComponent(routePart);
    if (decoded === "resource/Item Color") return response({ data: COLORS });
    if (decoded === "resource/Surface Finish") return response({ data: FINISHES });
    const itemColorMatch = decoded.match(/^resource\/Item Color\/(.+)$/);
    if (itemColorMatch) {
      const found = COLORS.find((c) => c.name === itemColorMatch[1]);
      return found ? response({ data: found }) : response({}, 404);
    }
    const finishMatch = decoded.match(/^resource\/Surface Finish\/(.+)$/);
    if (finishMatch) {
      const found = FINISHES.find((f) => f.name === finishMatch[1]);
      return found ? response({ data: found }) : response({}, 404);
    }
    const itemGroupMatch = decoded.match(/^resource\/Item Group\/(.+)$/);
    if (itemGroupMatch) {
      const found = ITEM_GROUPS[itemGroupMatch[1]];
      return found ? response({ data: { name: itemGroupMatch[1], ...found } }) : response({}, 404);
    }
    const itemMatch = decoded.match(/^resource\/Item\/(.+)$/);
    if (itemMatch) {
      const found = ITEMS[itemMatch[1]];
      return found ? response({ data: { name: itemMatch[1], ...found } }) : response({}, 404);
    }
    return response({}, 404);
  }, { via: "test" });
}

// ---- Master seed idempotency (mục 15.1-2, tối giản: catalog thuần deterministic) ----
test("Seed đúng 4 Surface Finish, requires_color đúng cho từng loại", async () => {
  const finishes = await allowedFinishesForGroup(fakeCall(), "Cửa CN Đức", "internal");
  const byCode = Object.fromEntries(finishes.map((f) => [f.code, f]));
  assert.equal(byCode.THO.requires_color, false);
  assert.equal(byCode.SON_TINH_DIEN.requires_color, true);
  assert.equal(byCode.SON_VAN_GO.requires_color, true);
});

test("VÂN GỖ Link đúng SƠN VÂN GỖ", async () => {
  const colors = await allowedColorNamesForGroupAndFinish(fakeCall(), "Cửa CN Đức", "SON_VAN_GO", "internal");
  assert.deepEqual(colors, ["VÂN GỖ"]);
});

// ---- Resolver ----
test("Disabled finish (TAT) không bao giờ được trả, dù applies_to_all_groups=true", async () => {
  const finishes = await allowedFinishesForGroup(fakeCall(), "Mô tơ", "internal");
  assert.ok(!finishes.some((f) => f.code === "TAT"));
});

test("Disabled color (MÀU TẮT) không được trả", async () => {
  const colors = await allowedColorNamesForGroupAndFinish(fakeCall(), "Cửa CN Đức", "SON_TINH_DIEN", "internal");
  assert.ok(!colors.includes("MÀU TẮT"));
});

test("Màu phải thuộc đúng Bề mặt được truyền — GHI ÚC KHÔNG lộ dưới SON_TINH_DIEN", async () => {
  const colors = await allowedColorNamesForGroupAndFinish(fakeCall(), "Cửa tấm liền Úc", "SON_TINH_DIEN", "internal");
  assert.ok(!colors.includes("GHI ÚC - KEM ÚC"));
});

test("Bề mặt không áp Item Group → màu thuộc Bề mặt đó không trả (Motor không có SƠN TĨNH ĐIỆN)", async () => {
  const finishes = await allowedFinishesForGroup(fakeCall(), "Mô tơ", "internal");
  assert.ok(!finishes.some((f) => f.code === "SON_TINH_DIEN"));
  const colors = await allowedColorNamesForGroup(fakeCall(), "Mô tơ", "internal");
  assert.deepEqual(colors.filter((c) => c !== "THÔ"), []);
});

test("Color scope hẹp hơn Bề mặt scope → intersection đúng (Úc thấy GHI ÚC, Đài Loan thấy XÁM-XANH NGỌC, không lẫn nhau)", async () => {
  const ucColors = await allowedColorNamesForGroupAndFinish(fakeCall(), "Cửa tấm liền Úc", "MA_MAU", "internal");
  assert.deepEqual(ucColors, ["GHI ÚC - KEM ÚC"]);
  const dlColors = await allowedColorNamesForGroupAndFinish(fakeCall(), "Cửa Đài Loan", "MA_MAU", "internal");
  assert.deepEqual(dlColors, ["XÁM - XANH NGỌC"]);
});

test("usage_scope purchase/sales/internal hoạt động — THÔ chỉ purchase/internal", async () => {
  assert.ok((await allowedColorNamesForGroup(fakeCall(), "Cửa CN Đức", "purchase")).includes("THÔ"));
  assert.ok((await allowedColorNamesForGroup(fakeCall(), "Cửa CN Đức", "internal")).includes("THÔ"));
  assert.ok(!(await allowedColorNamesForGroup(fakeCall(), "Cửa CN Đức", "sales")).includes("THÔ"));
});

test("Empty scope KHÔNG tự biến thành global — Bề mặt/Màu chưa cấu hình scope thì không dùng được cho nhóm nào (trừ THÔ khai tường minh)", async () => {
  // SON_TINH_DIEN chỉ scope Cửa CN Đức + Phụ kiện sơn tĩnh điện — Phụ kiện chung KHÔNG có.
  const finishes = await allowedFinishesForGroup(fakeCall(), "Phụ kiện chung", "internal");
  assert.deepEqual(finishes.map((f) => f.code), ["THO"]); // chỉ THÔ (applies_to_all_groups=true)
});

test("Motor & Bình điện (Mô tơ) không tự nhận STĐ", async () => {
  const colors = await allowedColorNamesForGroup(fakeCall(), "Mô tơ", "internal");
  assert.deepEqual(colors, ["THÔ"]);
});

test("Item không có cấu hình màu (Phụ kiện chung) không tự nhận toàn catalog, chỉ có THÔ", async () => {
  const scoped = await colorScopeForItem(fakeCall(), "VIT-M6", "internal");
  assert.deepEqual(scoped.allowed_colors, ["THÔ"]);
});

test("Bán hàng không hiện THÔ", async () => {
  const scoped = await colorScopeForItem(fakeCall(), "AL548", "sales");
  assert.ok(!scoped.allowed_colors.includes("THÔ"));
});

test("Phụ kiện được whitelist STĐ qua nhóm riêng → có màu STĐ", async () => {
  const scoped = await colorScopeForItem(fakeCall(), "OC-STD-01", "internal");
  assert.ok(scoped.allowed_colors.includes("GHI SẦN"));
});

test("SƠN VÂN GỖ hiện không có màu nào ngoài VÂN GỖ", async () => {
  const colors = await allowedColorNamesForGroupAndFinish(fakeCall(), "Cửa CN Đức", "SON_VAN_GO", "internal");
  assert.deepEqual(colors, ["VÂN GỖ"]);
});


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

// ---- finishColorContextForItem: luồng Item → Bề mặt → Màu, colors_by_finish ----
test("AL548: allowed_finishes = THÔ + SƠN TĨNH ĐIỆN (không có MẠ MÀU/SƠN VÂN GỖ scope cho Cửa CN Đức trong fixture MẠ, có SƠN VÂN GỖ)", async () => {
  const result = await finishColorContextForItem(fakeCall(), "AL548", undefined, "internal");
  const codes = result.allowed_finishes.map((f) => f.code).sort();
  assert.deepEqual(codes, ["SON_TINH_DIEN", "SON_VAN_GO", "THO"]);
  assert.deepEqual(result.colors_by_finish.SON_TINH_DIEN, ["CAFÉ", "GHI SẦN"]);
  assert.deepEqual(result.colors_by_finish.SON_VAN_GO, ["VÂN GỖ"]);
});

test("AL548 + chọn SƠN TĨNH ĐIỆN → chỉ xổ CAFÉ, GHI SẦN", async () => {
  const result = await finishColorContextForItem(fakeCall(), "AL548", "SON_TINH_DIEN", "internal");
  assert.deepEqual(result.allowed_colors, ["CAFÉ", "GHI SẦN"]);
  assert.deepEqual(Object.keys(result.colors_by_finish), ["SON_TINH_DIEN"]);
});

test("Fail closed: truyền Bề mặt không thuộc tập hợp lệ của Item → allowed_colors rỗng, không rơi về toàn catalog", async () => {
  const result = await finishColorContextForItem(fakeCall(), "AL548", "MA_MAU", "internal");
  assert.deepEqual(result.allowed_colors, []);
  assert.deepEqual(result.colors_by_finish, {});
});

test("Cửa Úc: MẠ MÀU chỉ xổ đúng màu được whitelist cho Úc, không lộ màu của Đài Loan", async () => {
  const result = await finishColorContextForItem(fakeCall(), "CUA-UC-01", "MA_MAU", "internal");
  assert.deepEqual(result.allowed_colors, ["GHI ÚC - KEM ÚC"]);
});

// ---- Không còn phụ thuộc Item.allowed_colors ----
test("Resolver không đọc bất kỳ endpoint Item Allowed Color nào", async () => {
  let sawItemAllowedColor = false;
  const call = Object.assign(async (path) => {
    if (decodeURIComponent(path).includes("Item Allowed Color")) sawItemAllowedColor = true;
    return fakeCall()(path);
  }, { via: "test" });
  await finishColorContextForItem(call, "AL548", "SON_TINH_DIEN", "internal");
  await colorScopeForItem(call, "CUA-UC-01", "internal");
  assert.equal(sawItemAllowedColor, false);
});
