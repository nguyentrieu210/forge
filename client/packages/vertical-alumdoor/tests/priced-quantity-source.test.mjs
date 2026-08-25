import assert from "node:assert/strict";
import test from "node:test";
import { linePricedQuantity } from "../dist/sales-order-v2/model.js";

const areaLine = (requiredField, values = {}) => ({
	item_code: "TEST-DOOR",
  _context: { inventory_mode: "Thành phẩm theo m2" },
  _overrides: {
    width_pb_nhua_m: { hidden: requiredField !== "width_pb_nhua_m" ? 1 : 0, reqd: requiredField === "width_pb_nhua_m" ? 1 : 0 },
    width_pb_ray_m: { hidden: requiredField !== "width_pb_ray_m" ? 1 : 0, reqd: requiredField === "width_pb_ray_m" ? 1 : 0 },
    cut_width_m: { hidden: requiredField !== "cut_width_m" ? 1 : 0, reqd: requiredField === "cut_width_m" ? 1 : 0 },
  },
  set_count: 1,
  ...values,
});

test("Đức đại lý chỉ dùng PB nhựa dù PB ray cũng có số", () => {
  assert.equal(linePricedQuantity(areaLine("width_pb_nhua_m", {
    width_pb_nhua_m: 3.5, width_pb_ray_m: 10, height_m: 2,
  })), 7);
});

test("thiếu đúng PB nhựa không được lấy PB ray làm fallback", () => {
  assert.equal(linePricedQuantity(areaLine("width_pb_nhua_m", {
    width_pb_ray_m: 10, height_m: 2,
  })), undefined);
});

test("loại cửa yêu cầu PB ray chỉ dùng PB ray", () => {
  assert.equal(linePricedQuantity(areaLine("width_pb_ray_m", {
    width_pb_nhua_m: 3.5, width_pb_ray_m: 4, height_m: 2, set_count: 2,
  })), 16);
});

test("tách món dùng rộng cắt lá", () => {
  assert.equal(linePricedQuantity(areaLine("cut_width_m", {
    cut_width_m: 3.2, width_pb_nhua_m: 8, width_pb_ray_m: 9, height_m: 2,
  })), 6.4);
});

test("hàng bán theo mét và theo cái dùng đúng cơ sở", () => {
	assert.equal(linePricedQuantity({
		item_code: "TEST-METER",
    _context: { inventory_mode: "Hàng thường" },
    _overrides: { length_m: { hidden: 0, reqd: 1 } },
    length_m: 6, set_count: 2,
  }), 12);
	assert.equal(linePricedQuantity({
		item_code: "TEST-EACH",
    _context: { inventory_mode: "Hàng thường" },
    _overrides: {}, set_count: 3,
	}), 3);
});

test("dòng chưa chọn mã không được lấy Số lượng làm Khối lượng", () => {
	assert.equal(linePricedQuantity({
		_context: { inventory_mode: "Hàng thường" }, _overrides: {}, set_count: 1,
	}), undefined);
});
