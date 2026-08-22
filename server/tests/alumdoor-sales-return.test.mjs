/**
 * Trả hàng bán — hai nửa, và cái bẫy nằm ở chỗ nối.
 *
 * Nền tảng đã có sẵn cả hai: `Stock Return` với `return_type = "Sales"` ghi tồn TĂNG theo
 * Phiếu xuất, và `Credit Note` giảm công nợ phải thu theo Hoá đơn bán. Alumdoor trước đây chỉ
 * khai chiều mua, nên khách trả hàng không có chứng từ nào để ghi.
 *
 * Mở chiều bán bắt buộc dùng Dynamic Link, mà Dynamic Link phải đọc tên doctype từ một field
 * khác — nên chiều trả hàng bị viết ở BA chỗ. Đó đúng là kiểu lỗi "luật viết hai lần rồi trôi
 * dạt": đặt `return_type = Sales` mà quên đổi `party_doctype` thì nhân ghi tồn TĂNG trong khi
 * ô đối tác vẫn trỏ nhà cung cấp, chứng từ lưu thành công và tồn kho sai lặng lẽ.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stockReturnDirectionError } from "../dist/apps-src/alumdoor-worker/src/index.js";
import { buildAlumdoorUiRec02Sidebar } from "../scripts/build-alumdoor-ui-rec-02-sidebar.mjs";

const brief = JSON.parse(readFileSync(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
const doctype = (name) => brief.doctypes.find((row) => row?.name === name);
const field = (name, fieldname) => doctype(name).fields.find(
  (row) => (typeof row === "object" ? row.fieldname : String(row).split(":")[0].trim()) === fieldname,
);

test("chiều mua giữ nguyên cặp NCC ↔ phiếu nhập", () => {
  assert.equal(stockReturnDirectionError({
    return_type: "Purchase", party_doctype: "Supplier", return_against_doctype: "Purchase Receipt",
  }), null);
});

test("chiều bán chốt cặp khách ↔ phiếu xuất", () => {
  assert.equal(stockReturnDirectionError({
    return_type: "Sales", party_doctype: "Customer", return_against_doctype: "Delivery Note",
  }), null);
});

test("đặt Sales mà quên đổi đối tác bị chặn — đây là ca ghi sai tồn kho lặng lẽ", () => {
  const problem = stockReturnDirectionError({
    return_type: "Sales", party_doctype: "Supplier", return_against_doctype: "Delivery Note",
  });
  assert.match(problem ?? "", /Khách hàng/);
});

test("đặt Sales mà vẫn trỏ phiếu nhập bị chặn", () => {
  const problem = stockReturnDirectionError({
    return_type: "Sales", party_doctype: "Customer", return_against_doctype: "Purchase Receipt",
  });
  assert.match(problem ?? "", /Phiếu xuất kho/);
});

test("chiều mua mà trỏ phiếu xuất bị chặn", () => {
  assert.ok(stockReturnDirectionError({
    return_type: "Purchase", party_doctype: "Supplier", return_against_doctype: "Delivery Note",
  }));
});

test("loại trả lạ bị chặn chứ không đoán bừa", () => {
  for (const value of ["", "sales", "Return", undefined]) {
    assert.ok(stockReturnDirectionError({ return_type: value }), `"${value}" phải bị từ chối`);
  }
});

test("Stock Return khai Dynamic Link cho cả đối tác lẫn chứng từ gốc", () => {
  const party = field("Stock Return", "party");
  assert.equal(party.fieldtype, "Dynamic Link");
  assert.equal(party.options, "party_doctype", "Dynamic Link phải đọc doctype từ field có thật");

  const source = field("Stock Return", "return_against");
  assert.equal(source.fieldtype, "Dynamic Link");
  assert.equal(source.options, "return_against_doctype");

  // Mặc định giữ chiều mua để chứng từ trả NCC đã có không đổi hành vi.
  assert.equal(field("Stock Return", "party_doctype").default, "Supplier");
  assert.equal(field("Stock Return", "return_against_doctype").default, "Purchase Receipt");
  for (const name of ["party_doctype", "return_against_doctype"]) {
    assert.equal(field("Stock Return", name).read_only, true, `${name} là bản dịch của return_type, không cho gõ tay`);
  }
});

test("Stock Return có validator của app để cặp ba field không trôi dạt", () => {
  const validator = brief.validators.find((row) => row?.doctype === "Stock Return");
  assert.ok(validator, "thiếu validator thì lệch chiều chỉ lộ ra ở kỳ kiểm kê");
  assert.deepEqual(validator.actions, ["create", "save", "submit"]);
});

test("Giấy báo Có đối xứng với Giấy báo Nợ và trỏ đúng nhánh bán", () => {
  const credit = doctype("Credit Note");
  assert.ok(credit, "thiếu Giấy báo Có thì khách trả hàng không giảm được công nợ");
  assert.equal(credit.group, "Công nợ");
  assert.equal(credit.submittable, true);
  assert.notEqual(credit.menu, false, "ẩn khỏi thanh bên là không ai lập được");

  const names = credit.fields.map((row) => (typeof row === "object" ? row.fieldname : String(row).split(":")[0].trim()));
  for (const required of ["customer", "return_against", "debit_to", "default_income_account", "items"]) {
    assert.ok(names.includes(required), `Giấy báo Có thiếu ${required}`);
  }
  assert.match(
    credit.fields.find((row) => String(row).startsWith("return_against")),
    /Link\(Sales Invoice\)!/,
    "phải giảm trừ theo HOÁ ĐƠN BÁN — nhân đọc số còn nợ của chính hoá đơn đó",
  );
  assert.equal(doctype("Credit Note Item").child, true);
});

test("Giấy báo Có đứng cạnh hoá đơn bán trên thanh bên", async () => {
  const items = (await buildAlumdoorUiRec02Sidebar()).nav.map((entry) => entry.key);
  assert.ok(items.indexOf("Sales Invoice") < items.indexOf("Credit Note"));
  assert.ok(items.indexOf("Credit Note") < items.indexOf("Payment Entry"));
});
