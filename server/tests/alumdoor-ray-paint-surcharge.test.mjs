/**
 * Phụ thu sơn ray cho cửa TRỌN BỘ — tính động từ mét ray thật trong BOM, đọc đơn giá/điều
 * kiện màu thẳng từ 2 `Pricing Rule` thật, không hard-code 55.000/15.000 ở nơi nào khác.
 *
 * Test nhắm vào `combineRayPaintSurcharge` — phần THUẦN (cộng mét, chọn luật màu) — thay vì
 * giả lập cả chuỗi đọc Item/Cutting Policy/BOM Rule mà `computeRayPaintSurcharge` gọi tới.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { combineRayPaintSurcharge } from "../dist/apps-src/alumdoor-worker/src/ray-paint-surcharge.js";

const RULE_VAN_GO = {
  name: "Sơn vân gỗ — ray",
  adjustment_rate: "55000",
  conditions: JSON.stringify([{ field: "color", operator: "eq", value: "VAN_GO" }]),
  disabled: false,
};
const RULE_KHAC = {
  name: "Sơn ray màu khác",
  adjustment_rate: "15000",
  conditions: JSON.stringify([{ field: "color", operator: "not_in", values: ["GHI SẦN", "VAN_GO", "THÔ"] }]),
  disabled: false,
};
const RULES = [RULE_VAN_GO, RULE_KHAC];

test("cộng mét ray đúng — 2 cây × 2,9 m = 5,8 m, vân gỗ 55.000/m", () => {
  const result = combineRayPaintSurcharge(
    [{ item_code: "RT_RAYHOP", length_m: 5.8 }],
    "VAN_GO",
    RULES,
  );
  assert.equal(result.applicable, true);
  assert.equal(result.total_length_m, 5.8);
  assert.equal(result.rate_per_meter, 55000);
  assert.equal(result.surcharge_minor, 319000, "55.000 × 5,8 m");
  assert.equal(result.matched_rule, "Sơn vân gỗ — ray");
});

test("màu khác (không vân gỗ, không nằm trong danh sách miễn) dùng luật 15.000/m", () => {
  const result = combineRayPaintSurcharge([{ item_code: "RT_RAYHOP", length_m: 5.8 }], "CAM", RULES);
  assert.equal(result.rate_per_meter, 15000);
  assert.equal(result.surcharge_minor, 87000, "15.000 × 5,8 m");
  assert.equal(result.matched_rule, "Sơn ray màu khác");
});

test("màu được miễn (Ghi sần) thì không phụ thu, không lỗi", () => {
  const result = combineRayPaintSurcharge([{ item_code: "RT_RAYHOP", length_m: 5.8 }], "GHI SẦN", RULES);
  assert.equal(result.surcharge_minor, 0);
  assert.equal(result.matched_rule, null);
  assert.match(result.reason, /được miễn/);
});

test("chưa chọn màu ray thì không tính, không ném lỗi", () => {
  const result = combineRayPaintSurcharge([{ item_code: "RT_RAYHOP", length_m: 5.8 }], "", RULES);
  assert.equal(result.applicable, false);
  assert.equal(result.surcharge_minor, 0);
});

test("nhiều cấu kiện ray cộng dồn đúng, không phải chỉ lấy dòng đầu", () => {
  const result = combineRayPaintSurcharge(
    [{ item_code: "RT_RAYHOP", length_m: 2.9 }, { item_code: "RT_TD87A1", length_m: 2.95 }],
    "VAN_GO",
    RULES,
  );
  assert.equal(result.total_length_m, 5.85);
  assert.equal(result.surcharge_minor, 321750, "55.000 × 5,85 m");
});

test("luật vân gỗ ưu tiên luật màu khác khi cả hai lý thuyết đều có thể liên quan", () => {
  // Thứ tự truyền vào cố ý đảo ngược (luật "màu khác" trước) — kết quả phải vẫn chọn đúng
  // luật vân gỗ vì nó khớp `eq` đích danh, không phải vì đứng trước trong mảng.
  const result = combineRayPaintSurcharge([{ item_code: "RT_RAYHOP", length_m: 5.8 }], "VAN_GO", [RULE_KHAC, RULE_VAN_GO]);
  assert.equal(result.matched_rule, "Sơn vân gỗ — ray");
  assert.equal(result.rate_per_meter, 55000);
});
