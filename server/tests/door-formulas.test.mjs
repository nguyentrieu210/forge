import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateDoorFormula,
  inferDoorType,
  isManualPullGroup,
  parseDoorPolicy,
  selectDoorPolicy,
} from "../dist/apps-src/alumdoor-worker/src/door-formulas.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
const policies = brief.fixtures
  .filter((entry) => entry.type === "Cutting Policy")
  .map((entry) => parseDoorPolicy({ name: entry.name, ...entry.data }));

function policy(doorType, itemGroup = "") {
  return selectDoorPolicy(policies, doorType, itemGroup);
}

test("danh mục có đúng một công thức hoạt động cho mỗi loại cửa", () => {
  const active = policies.filter((entry) => !entry.disabled);
  assert.deepEqual(active.map((entry) => entry.door_type).sort(), [
    "Cửa Đức", "Cửa Lưới", "Cửa Siêu Trường", "Cửa Úc", "Cửa Đài Loan",
  ].sort());
  for (const entry of active) assert.equal(policy(entry.door_type).policy_name, entry.policy_name);
});

test("dữ liệu Item cũ suy ra loại cửa từ các nhóm hàng thật", () => {
  assert.equal(inferDoorType(undefined, "Cửa CN Đức"), "Cửa Đức");
  assert.equal(inferDoorType(undefined, "Cửa tấm liền Úc"), "Cửa Úc");
  assert.equal(inferDoorType(undefined, "Cửa Lưới"), "Cửa Lưới");
  assert.equal(inferDoorType(undefined, "Cửa Đài Loan Inox"), "Cửa Đài Loan");
  assert.equal(inferDoorType(undefined, "Cửa kéo Đài Loan"), "Cửa Đài Loan");
  assert.equal(inferDoorType(undefined, "Cửa siêu trường"), "Cửa Siêu Trường");
  assert.equal(inferDoorType(undefined, "Phụ kiện"), null);
});

test("Cửa Đức: đại lý PB nhựa -0,02; khách lẻ PB ray -0,08", () => {
  const dealer = calculateDoorFormula(policy("Cửa Đức"), {
    door_type: "Cửa Đức", customer_group: "Đại lý",
    measured_width_m: 4, cover_height_m: 3, set_count: 1,
    actual_purchase_kg: 120, purchase_rate: 50_000, purpose: "all",
  });
  assert.deepEqual(
    { basis: dealer.width_basis, cut: dealer.cut_width_m, area: dealer.billable_area_sqm, kg: dealer.purchase_kg, amount: dealer.purchase_amount },
    { basis: "Phủ bì nhựa", cut: 3.98, area: 12, kg: 120, amount: 6_000_000 },
  );

  const retail = calculateDoorFormula(policy("Cửa Đức"), {
    door_type: "Cửa Đức", customer_group: "Lẻ",
    measured_width_m: 4.06, cover_height_m: 3, purpose: "sales",
  });
  assert.deepEqual(
    { basis: retail.width_basis, cut: retail.cut_width_m, area: retail.billable_area_sqm },
    { basis: "Phủ bì ray", cut: 3.98, area: 12.18 },
  );
});

test("Cửa Úc: cắt -0,03, mua theo barem × Cao PB × Rộng cắt, bán theo PB ray", () => {
  const result = calculateDoorFormula(policy("Cửa Úc"), {
    door_type: "Cửa Úc", customer_group: "Đại lý",
    measured_width_m: 4, cover_height_m: 3, kg_per_m2: 8, purchase_rate: 50_000,
    purpose: "all",
  });
  assert.deepEqual(
    { cut: result.cut_width_m, area: result.billable_area_sqm, kg: result.purchase_kg, amount: result.purchase_amount },
    { cut: 3.97, area: 12, kg: 95.28, amount: 4_764_000 },
  );
});

test("Cửa Lưới: đại lý tách món bán rộng cắt, trọn bộ bán PB ray; mua dùng Cao lưới", () => {
  const split = calculateDoorFormula(policy("Cửa Lưới"), {
    door_type: "Cửa Lưới", customer_group: "Đại lý", sales_mode: "Tách món",
    measured_width_m: 4, cover_height_m: 3, mesh_height_m: 2.8, kg_per_m2: 8,
    purpose: "all",
  });
  assert.deepEqual(
    { basis: split.sales_width_basis, cut: split.cut_width_m, area: split.billable_area_sqm, kg: split.purchase_kg },
    { basis: "Rộng cắt lá", cut: 3.97, area: 11.91, kg: 88.928 },
  );

  const full = calculateDoorFormula(policy("Cửa Lưới"), {
    door_type: "Cửa Lưới", customer_group: "Đại lý", sales_mode: "Trọn bộ",
    measured_width_m: 4, cover_height_m: 3, purpose: "sales",
  });
  assert.equal(full.sales_width_basis, "Phủ bì ray");
  assert.equal(full.billable_area_sqm, 12);

  const butterfly = calculateDoorFormula(policy("Cửa Lưới"), {
    door_type: "Cửa Lưới", customer_group: "Đại lý", sales_mode: "Tách món",
    has_butterfly_bracket: true, measured_width_m: 4, cover_height_m: 3, purpose: "sales",
  });
  assert.equal(butterfly.cut_width_m, 3.965);
  assert.equal(butterfly.billable_area_sqm, 11.895);
});

test("Cửa Đài Loan kéo tay luôn bán theo PB ray dù đại lý chọn tách món", () => {
  assert.equal(isManualPullGroup("Cửa kéo Đài Loan"), true);
  const result = calculateDoorFormula(policy("Cửa Đài Loan"), {
    door_type: "Cửa Đài Loan", item_group: "Cửa kéo Đài Loan",
    customer_group: "Đại lý", sales_mode: "Tách món", is_manual_pull: true,
    measured_width_m: 4, cover_height_m: 3, purpose: "sales",
  });
  assert.equal(result.sales_width_basis, "Phủ bì ray");
  assert.equal(result.billable_area_sqm, 12);
});

test("Cửa Siêu Trường: đại lý bán rộng cắt, khách lẻ bán PB ray", () => {
  const dealer = calculateDoorFormula(policy("Cửa Siêu Trường"), {
    door_type: "Cửa Siêu Trường", customer_group: "Đại lý", sales_mode: "Trọn bộ",
    measured_width_m: 4, cover_height_m: 3, purpose: "sales",
  });
  const retail = calculateDoorFormula(policy("Cửa Siêu Trường"), {
    door_type: "Cửa Siêu Trường", customer_group: "Lẻ", sales_mode: "Trọn bộ",
    measured_width_m: 4, cover_height_m: 3, purpose: "sales",
  });
  assert.deepEqual(
    { dealerBasis: dealer.sales_width_basis, dealerArea: dealer.billable_area_sqm, retailBasis: retail.sales_width_basis, retailArea: retail.billable_area_sqm },
    { dealerBasis: "Rộng cắt lá", dealerArea: 11.91, retailBasis: "Phủ bì ray", retailArea: 12 },
  );
});

test("hai chính sách cùng mức bị từ chối, không âm thầm chọn một", () => {
  const first = policy("Cửa Úc");
  assert.throws(
    () => selectDoorPolicy([first, { ...first, policy_name: "Bản sao sai" }], "Cửa Úc"),
    /nhiều Chính sách công thức cùng khớp/,
  );
});

