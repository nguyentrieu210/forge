import assert from "node:assert/strict";
import test from "node:test";
import { actionFieldLabel, actionRequestValues, doorSalesSummary, isActionFieldVisible } from "../dist/action/door-width-label.js";

const action = { name: "tinh-cong-thuc-cua" };
const field = {
  fieldname: "width_m",
  label: "Rộng PB ray (khách lẻ) / PB nhựa (đại lý) (m)",
};

test("Cửa Đức giữ PB ray và PB nhựa thành hai field riêng", () => {
  assert.equal(actionFieldLabel(action, { fieldname: "width_pb_ray_m", label: "Rộng ray" }, { customer_group: "Lẻ" }), "Rộng PB ray (m)");
  assert.equal(actionFieldLabel(action, { fieldname: "width_pb_nhua_m", label: "Rộng nhựa" }, { customer_group: "Đại lý" }), "Rộng PB nhựa (m)");
  assert.equal(actionFieldLabel(action, field, { customer_group: "Đại lý" }), field.label);
});

test("các action và trường khác giữ nguyên nhãn", () => {
  assert.equal(actionFieldLabel({ name: "khac" }, field, { customer_group: "Lẻ" }), field.label);
  assert.equal(actionFieldLabel(action, { fieldname: "height_m", label: "Cao phủ bì (m)" }, { customer_group: "Lẻ" }), "Cao phủ bì (m)");
});

test("diện tích đã tính vẫn dùng được để tính tiền khi nhập đơn giá sau", () => {
  assert.deepEqual(
    doorSalesSummary("tinh-cong-thuc-cua", { billable_area_sqm: 12.18 }, "1250000"),
    { area: 12.18, rate: 1_250_000, amount: 15_225_000 },
  );
  assert.deepEqual(
    doorSalesSummary("tinh-cong-thuc-cua", { billable_area_sqm: 12.18 }, ""),
    { area: 12.18 },
  );
});

test("chỉ hiện đúng cột rộng theo nhóm khách và gửi về width_m", () => {
  const ray = { fieldname: "width_pb_ray_m" };
  const plastic = { fieldname: "width_pb_nhua_m" };
  assert.equal(isActionFieldVisible(action, ray, { customer_group: "Lẻ" }), true);
  assert.equal(isActionFieldVisible(action, plastic, { customer_group: "Lẻ" }), false);
  assert.equal(isActionFieldVisible(action, field, { customer_group: "Lẻ" }), false);
  assert.equal(isActionFieldVisible(action, ray, { customer_group: "Đại lý" }), false);
  assert.equal(isActionFieldVisible(action, plastic, { customer_group: "Đại lý" }), true);
  assert.equal(isActionFieldVisible(action, field, { customer_group: "Đại lý" }), false);
  assert.equal(actionRequestValues(action, { customer_group: "Lẻ", width_pb_ray_m: 4.06 }).width_m, 4.06);
  assert.equal(actionRequestValues(action, { customer_group: "Đại lý", width_pb_nhua_m: 4 }).width_m, 4);
});
