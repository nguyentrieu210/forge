/**
 * Chuỗi Order-to-Cash phải ĐẾN ĐƯỢC từ thanh bên, không chỉ tồn tại trong gói cài.
 *
 * Vì sao cần phép thử này: `menu: false` cài chứng từ nhưng gỡ nó khỏi thanh bên, và nền tảng
 * không có nút ngữ cảnh nào trên form để bù lại — `resolveFormActions` chỉ sinh Lưu/Gửi/Huỷ/
 * Sửa đổi/Xoá/Nhân bản/Đổi tên, không nhận action của brief. Nên một chứng từ `menu: false`
 * mà không có màn riêng là chứng từ KHÔNG AI TẠO ĐƯỢC.
 *
 * Đó đúng là chuyện đã xảy ra: Báo giá và Hoá đơn bán bị ẩn trong khi Phiếu thu vẫn hiện, nên
 * xưởng thu được tiền mà không lập được chứng từ sinh ra khoản phải thu. Cơ sở dữ liệu chạy
 * thật chứng minh: 0 báo giá, 0 hoá đơn, 0 phiếu xuất.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const brief = JSON.parse(readFileSync(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));

const doctype = (name) => brief.doctypes.find((row) => row?.name === name);
const action = (name) => (brief.actions ?? []).find((row) => row?.name === name);

test("mọi chứng từ của chuỗi O2C đều lên được thanh bên", () => {
  for (const [name, group] of [
    ["Quotation", "Bán hàng"],
    ["Sales Order", "Bán hàng"],
    ["Delivery Note", "Bán hàng"],
    ["Sales Invoice", "Công nợ"],
    ["Payment Entry", "Công nợ"],
  ]) {
    const current = doctype(name);
    assert.ok(current, `thiếu doctype ${name}`);
    assert.notEqual(current.menu, false, `${name} bị ẩn khỏi thanh bên nên không ai tạo được`);
    assert.equal(current.group, group, `${name} phải nằm ở nhóm ${group}`);
  }
});

test("thao tác chuyển chứng từ của nhánh bán đều bấm được", () => {
  for (const name of ["bao-gia-thanh-don", "don-ban-thanh-phieu-xuat", "don-ban-thanh-hoa-don"]) {
    const current = action(name);
    assert.ok(current, `thiếu thao tác ${name}`);
    assert.notEqual(current.menu, false, `thao tác ${name} bị ẩn nên không có đường bấm`);
  }
});

test("thanh bên xếp đúng thứ tự nghiệp vụ bán hàng", () => {
  const items = brief.navigation.items;
  const rank = (key) => {
    const index = items.indexOf(key);
    assert.ok(index >= 0, `${key} chưa được xếp chỗ trong navigation.items`);
    return index;
  };
  const order = [
    "Quotation",
    "action:bao-gia-thanh-don",
    "Sales Order",
    "action:don-ban-thanh-phieu-xuat",
    "Delivery Note",
  ];
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(rank(order[index - 1]) < rank(order[index]), `${order[index - 1]} phải đứng trước ${order[index]}`);
  }
  assert.ok(rank("action:don-ban-thanh-hoa-don") < rank("Sales Invoice"));
  assert.ok(rank("Sales Invoice") < rank("Payment Entry"), "lập hoá đơn phải đứng trước thu tiền");
});

test("Đơn hàng → Hoá đơn gọi đúng cặp method và chốt quyền theo Sales Invoice", () => {
  const current = action("don-ban-thanh-hoa-don");
  assert.equal(current.permission, "Sales Invoice");
  assert.equal(current.group, "Công nợ");
  assert.match(current.preview, /^alumdoor\.sales\.preview_invoice\b/);
  assert.match(current.commit, /^alumdoor\.sales\.invoice_from_order\b/);

  const fields = current.fields.map((row) => (typeof row === "string" ? row.split(":")[0].trim() : row.fieldname));
  assert.deepEqual(fields, ["sales_order", "due_date"]);
  assert.match(current.fields[0], /^sales_order:Link\(Sales Order\)!/, "đơn hàng là bắt buộc");
});

test("Báo giá không sinh hộp thư duyệt riêng", () => {
  // Workflow của báo giá do kinh doanh bấm ngay trên chứng từ; thêm hộp thư sẽ đẻ ra một
  // nhóm thanh bên mới ("Tác nghiệp") không có trong navigation.groups đã duyệt.
  assert.equal(doctype("Quotation").inbox, false);
});
