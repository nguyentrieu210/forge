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

test("German door receives one non-monetary gift-rail entitlement from 8 m2", () => {
  const item = { door_type: "Cửa Đức", measurement_profile: "Thành phẩm theo m2" };
  assert.deepEqual(alumdoorCommercialBenefits(item, 7.999), []);
  assert.deepEqual(alumdoorCommercialBenefits(item, 8), [{
    label: "Tặng ray cửa Đức từ 8 m²",
    qty: 1,
    uom: "Bộ",
    source_rule: "ALUMDOOR-PR:DUC-GIFT-RAIL-8M2",
  }]);
  assert.deepEqual(alumdoorCommercialBenefits({ ...item, door_type: "Cửa Úc" }, 8), []);
});
