import test from "node:test";
import assert from "node:assert/strict";
import { parseBomTemplateRecord } from "../dist/apps-src/alumdoor-worker/src/bom-template-materializer.js";

/**
 * Một mặt hàng, hai định mức: trọn bộ và tách món.
 *
 * Đo trên D1 2026-08-19: `TP-LUOI-SN13x26-STD - TRONBO` có BOM Template **5 cấu phần** còn
 * `- TACHMON` chỉ có **1**. Hai bộ cấu phần khác nhau thật — nhưng chúng là HAI MẶT HÀNG, vì
 * khi `Sales Package` bị khai tử ở `46cff213` thì fact "phạm vi cấu phần được giao" không còn
 * chỗ nào trên dòng bán nên nó bò vào mã hàng.
 *
 * Cột `BOM Template.sales_mode` là đường về: một mặt hàng giữ được hai định mức, và luật chọn
 * template sẵn có (specificity → priority → modified) tự phân giải.
 */

const template = (over = {}) => ({
  name: "BT-1",
  template_code: "BT-1",
  item_code: "LUOI-SN13X26",
  component_rules: [],
  ...over,
});

test("cột sales_mode trở thành một điều kiện, không phải cơ chế thứ hai", () => {
  const parsed = parseBomTemplateRecord(template({ sales_mode: "Trọn bộ" }));
  assert.deepEqual(parsed.conditions, { sales_mode: "Trọn bộ" });
});

test("bỏ trống thì áp cho mọi cách giao — giữ nguyên hành vi cũ", () => {
  assert.deepEqual(parseBomTemplateRecord(template()).conditions, {});
  assert.deepEqual(parseBomTemplateRecord(template({ sales_mode: "" })).conditions, {});
});

test("bản khai rõ cách giao có specificity cao hơn bản chung", () => {
  // Luật chọn template xếp theo số điều kiện; nhờ vậy bản trọn bộ thắng bản chung mà không
  // cần thêm luật riêng nào.
  const specific = parseBomTemplateRecord(template({ sales_mode: "Tách món" }));
  const generic = parseBomTemplateRecord(template());
  assert.ok(Object.keys(specific.conditions).length > Object.keys(generic.conditions).length);
});

test("cột và conditions_json khai lệch nhau thì TỪ CHỐI, không đoán", () => {
  // Hai chỗ khai cùng một luật là mầm trôi dạt; ở đây nó bị bắt ngay lúc đọc.
  assert.throws(
    () => parseBomTemplateRecord(template({
      sales_mode: "Trọn bộ",
      conditions_json: JSON.stringify({ sales_mode: "Tách món" }),
    })),
    /cách giao khai hai nơi lệch nhau/,
  );
});

test("cột và conditions_json khai TRÙNG nhau thì chấp nhận", () => {
  const parsed = parseBomTemplateRecord(template({
    sales_mode: "Trọn bộ",
    conditions_json: JSON.stringify({ sales_mode: "Trọn bộ", door_type: "Cửa Lưới" }),
  }));
  assert.deepEqual(parsed.conditions, { sales_mode: "Trọn bộ", door_type: "Cửa Lưới" });
});
