import test from "node:test";
import assert from "node:assert/strict";
import {
  alumdoorCommercialBenefits,
  defaultAlumdoorDiscountPercent,
  withAlumdoorDefaultDiscountSnapshot,
} from "../dist/packages/clouderp-selling/src/controllers.js";

test("only German finished doors default to 15 percent", () => {
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "TP-AL752N", item_group: "Cửa CN Đức", inventory_mode: "Thành phẩm theo m2" }), 15);
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "TP-AL752N", item_group: "Cửa CN Đức", measurement_profile: "Thành phẩm theo m2" }), 15);
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "TEST-CUA-DUC", door_type: "Cửa Đức" }), 15);
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "TP-UC", item_group: "Cửa tấm liền Úc", measurement_profile: "Thành phẩm theo m2" }), 0);
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "TP-DL", item_group: "Cửa Đài Loan", measurement_profile: "Thành phẩm theo m2" }), 0);
});

test("P0-2: khách Lẻ không được hưởng chiết khấu đại lý", () => {
  const duc = { item_code: "CDUC_TD_AL501N", door_type: "Cửa Đức", measurement_profile: "Thành phẩm theo m2" };
  assert.equal(defaultAlumdoorDiscountPercent(duc, "Đại lý"), 15);
  assert.equal(defaultAlumdoorDiscountPercent(duc, "Lẻ"), 0);
  assert.equal(defaultAlumdoorDiscountPercent(duc, "lẻ "), 0);
  // Nhóm để trống giữ nguyên hành vi cũ; tầng trên đã bắt buộc phải có nhóm giá.
  assert.equal(defaultAlumdoorDiscountPercent(duc), 15);
});

test("ray and trục stay at zero even when their group is a door group", () => {
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "TP-RAYNHOMUC", item_name: "HH RAY NHÔM ÚC", item_group: "Cửa tấm liền Úc", inventory_mode: "Hàng thường" }), 0);
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "NVL-TRUC34", item_name: "TRỤC PHI 34", item_group: "Cửa tấm liền Úc", inventory_mode: "Hàng thường" }), 0);
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "TRỤC 114_1.8LY", item_group: "Cửa tấm liền Úc", inventory_mode: "Hàng thường" }), 0);
  assert.equal(defaultAlumdoorDiscountPercent({ item_code: "RNHUA/LONG-CR", item_name: "RON NHỰA CẠNH RAY", item_group: "Phụ kiện", inventory_mode: "Hàng thường" }), 0);
});

test("German-door fallback keeps an auditable 15 percent policy snapshot", () => {
  const item = { item_group: "Cửa CN Đức", measurement_profile: "Thành phẩm theo m2" };
  const snapshots = withAlumdoorDefaultDiscountSnapshot([], item);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].rule_name, "ALUMDOOR-PR:DUC-DISCOUNT-15");
  assert.equal(snapshots[0].discount_percentage, "15");
  assert.equal(withAlumdoorDefaultDiscountSnapshot(snapshots, item).length, 1);
});

test("P0-1: đã có luật ADJUSTMENT âm thì KHÔNG dán thêm snapshot 15% thứ hai", () => {
  const item = { item_group: "Cửa CN Đức", measurement_profile: "Thành phẩm theo m2" };
  const catalogue = [{
    rule_name: "Chiết khấu đại lý 15% — AL501N",
    effect_type: "ADJUSTMENT",
    priority: 100,
    amount_minor: -1850850,
  }];
  assert.deepEqual(withAlumdoorDefaultDiscountSnapshot(catalogue, item, "Đại lý"), catalogue);
  // Khoản ADJUSTMENT DƯƠNG (phụ thu) không phải chiết khấu ⇒ vẫn dán snapshot chính sách.
  const surcharge = [{ rule_name: "Phụ vận chuyển", effect_type: "ADJUSTMENT", priority: 100, amount_minor: 300000 }];
  assert.equal(withAlumdoorDefaultDiscountSnapshot(surcharge, item, "Đại lý").length, 2);
});

test("P0-3: chỉ biến thể TANG_RAY mới được tặng ray", () => {
  const item = { door_type: "Cửa Đức", measurement_profile: "Thành phẩm theo m2" };
  assert.deepEqual(alumdoorCommercialBenefits(item, 8, "TANG_RAY"), []);
  assert.deepEqual(alumdoorCommercialBenefits(item, 8.001, "TANG_RAY"), [{
    label: "Tặng ray cửa Đức trên 8 m²",
    qty: 1,
    uom: "Bộ",
    source_rule: "ALUMDOOR-PR:DUC-GIFT-RAIL-GT8M2",
    rate: "0",
    amount: "0",
    is_free: true,
  }]);
  // Bán theo giá CHỈ LÁ (rẻ hơn 75.000 đ/m²) thì KHÔNG kèm ray.
  assert.deepEqual(alumdoorCommercialBenefits(item, 11, "CHI_LA"), []);
  // Không khai biến thể ⇒ fail-closed, không cho không bộ ray.
  assert.deepEqual(alumdoorCommercialBenefits(item, 11), []);
  assert.deepEqual(alumdoorCommercialBenefits({ ...item, door_type: "Cửa Úc" }, 11, "TANG_RAY"), []);
});
