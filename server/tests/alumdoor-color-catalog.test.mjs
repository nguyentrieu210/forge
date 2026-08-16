import test from "node:test";
import assert from "node:assert/strict";
import {
  ALUMDOOR_COLOR_CATALOG,
  ALUMDOOR_SURFACE_FINISH_CATALOG,
  ALUMDOOR_LEGACY_FINISH_MAP,
  alumdoorColorPayload,
  alumdoorSurfaceFinishPayload,
  canonicalAlumdoorColor,
  canonicalAlumdoorFinish,
} from "../scripts/lib/alumdoor-color-catalog.mjs";
import { ALUMDOOR_ITEM_GROUP_CATALOG } from "../scripts/lib/alumdoor-item-group-catalog.mjs";

test("Alumdoor surface finish catalogue has exactly 4 canonical entries", () => {
  assert.equal(ALUMDOOR_SURFACE_FINISH_CATALOG.length, 4);
  assert.deepEqual(ALUMDOOR_SURFACE_FINISH_CATALOG.map((f) => f.code), ["THO", "SON_TINH_DIEN", "MA_MAU", "SON_VAN_GO"]);
});

test("THÔ: requires_color=false, applies_to_all_groups=true (khai tường minh, không suy ngầm từ rỗng)", () => {
  const payload = alumdoorSurfaceFinishPayload(ALUMDOOR_SURFACE_FINISH_CATALOG.find((f) => f.code === "THO"));
  assert.equal(payload.requires_color, false);
  assert.equal(payload.applies_to_all_groups, true);
  assert.deepEqual(payload.applies_to_groups, []);
  assert.equal(payload.usage_scope, "Mua hàng");
});

test("SƠN TĨNH ĐIỆN / MẠ MÀU / SƠN VÂN GỖ: requires_color=true", () => {
  for (const code of ["SON_TINH_DIEN", "MA_MAU", "SON_VAN_GO"]) {
    const payload = alumdoorSurfaceFinishPayload(ALUMDOOR_SURFACE_FINISH_CATALOG.find((f) => f.code === code));
    assert.equal(payload.requires_color, true, code);
    assert.equal(payload.applies_to_all_groups, false, code);
  }
});

test("SƠN TĨNH ĐIỆN áp đủ 6 nhóm; SƠN VÂN GỖ áp Đức + Úc + Siêu Trường + Đài Loan", () => {
  const std = alumdoorSurfaceFinishPayload(ALUMDOOR_SURFACE_FINISH_CATALOG.find((f) => f.code === "SON_TINH_DIEN"));
  assert.deepEqual(
    std.applies_to_groups.map((r) => r.item_group),
    [
      "Cửa CN Đức",
      "Cửa tấm liền Úc",
      "Cửa Siêu Trường",
      "Cửa Đài Loan",
      "Cửa Lưới",
      "Phụ kiện cần sơn tĩnh điện",
    ],
  );
  const vanGo = alumdoorSurfaceFinishPayload(ALUMDOOR_SURFACE_FINISH_CATALOG.find((f) => f.code === "SON_VAN_GO"));
  assert.deepEqual(
    vanGo.applies_to_groups.map((r) => r.item_group),
    ["Cửa CN Đức", "Cửa tấm liền Úc", "Cửa Siêu Trường", "Cửa Đài Loan"],
  );
  assert.equal(vanGo.applies_to_groups.some((r) => r.item_group === "Cửa Lưới"), false);
});

test("mọi Surface Finish scope đều trỏ tới Item Group canonical hiện có", () => {
  const itemGroups = new Set(ALUMDOOR_ITEM_GROUP_CATALOG.map((row) => row.name));
  for (const finish of ALUMDOOR_SURFACE_FINISH_CATALOG) {
    for (const group of finish.groups ?? []) {
      assert.ok(itemGroups.has(group), `${finish.code} trỏ Item Group không canonical: ${group}`);
    }
  }
});

test("Alumdoor color catalogue has exactly 25 canonical colors (24 màu + VÂN GỖ)", () => {
  assert.equal(ALUMDOOR_COLOR_CATALOG.length, 25);
  assert.equal(new Set(ALUMDOOR_COLOR_CATALOG.map((color) => color.code)).size, 25);
  assert.equal(ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "THO").length, 1);
  assert.equal(ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "SON_TINH_DIEN").length, 18);
  assert.equal(ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "MA_MAU").length, 5);
  assert.equal(ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "SON_VAN_GO").length, 1);
  const finishCodes = new Set(ALUMDOOR_SURFACE_FINISH_CATALOG.map((f) => f.code));
  for (const color of ALUMDOOR_COLOR_CATALOG) assert.ok(finishCodes.has(color.finish), `${color.code} trỏ finish lạ ${color.finish}`);
});

test("VÂN GỖ là màu duy nhất của SƠN VÂN GỖ, không invent Óc chó/Sồi/Căm xe", () => {
  const vanGoColors = ALUMDOOR_COLOR_CATALOG.filter((c) => c.finish === "SON_VAN_GO");
  assert.deepEqual(vanGoColors.map((c) => c.code), ["VAN_GO"]);
  assert.equal(vanGoColors[0].name, "VÂN GỖ");
});

test("legacy lot color codes normalize to the names confirmed in the V2 spec", () => {
  assert.deepEqual(
    ["GS", "VK", "CF", "XF", "4004", "9512 ( TRẮNG )"].map(canonicalAlumdoorColor),
    ["GHI SẦN", "VÀNG KEM", "CAFÉ", "XÁM XINGFA", "ĐỎ ĐÔ", "TRẮNG"],
  );
  assert.equal(canonicalAlumdoorColor("THÔ"), "THÔ");
});

test("legacy finish text quy đổi đúng 4 giá trị đã chốt; Anode/Khác KHÔNG map ngầm", () => {
  assert.equal(canonicalAlumdoorFinish("Thô"), "THO");
  assert.equal(canonicalAlumdoorFinish("Sơn tĩnh điện"), "SON_TINH_DIEN");
  assert.equal(canonicalAlumdoorFinish("Mạ"), "MA_MAU");
  assert.equal(canonicalAlumdoorFinish("Vân gỗ"), "SON_VAN_GO");
  assert.equal(canonicalAlumdoorFinish("Anode"), undefined);
  assert.equal(canonicalAlumdoorFinish("Khác"), undefined);
  assert.equal(ALUMDOOR_LEGACY_FINISH_MAP.size, 4);
});

test("canonical colors preserve supplier codes; STĐ Item Color rỗng = kế thừa phạm vi Bề mặt", () => {
  const white = alumdoorColorPayload(ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "TRẮNG"));
  const burgundy = alumdoorColorPayload(ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "ĐỎ ĐÔ"));
  const plated = alumdoorColorPayload(ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "XANH NGỌC - VÀNG KEM"));
  const raw = alumdoorColorPayload(ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "THÔ"));
  assert.equal(white.supplier_color_code, "9512");
  assert.equal(burgundy.supplier_color_code, "4004");
  assert.deepEqual(white.applies_to_groups, []);
  assert.equal(white.surface_finish, "SON_TINH_DIEN");
  assert.deepEqual(plated.applies_to_groups.map((row) => row.item_group), ["Cửa tấm liền Úc", "Cửa Đài Loan"]);
  assert.equal(raw.usage_scope, "Mua hàng");
  assert.equal(white.usage_scope, "Mua & bán");
});
