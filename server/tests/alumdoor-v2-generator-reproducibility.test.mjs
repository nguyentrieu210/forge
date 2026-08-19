import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE = resolve(ROOT, "server/briefs/alumdoor.json");
const GENERATED = resolve(ROOT, "server/briefs/alumdoor-v2.json");
const GENERATOR = resolve(ROOT, "server/scripts/build-alumdoor-v2-brief.mjs");
const nameOf = (field) => typeof field === "string" ? field.split(":", 1)[0].trim() : field.fieldname;
const doc = (brief, name) => brief.doctypes.find((entry) => entry.name === name);
const field = (brief, doctype, fieldname) => doc(brief, doctype)?.fields?.find((entry) => nameOf(entry) === fieldname);

test("alumdoor-v2 generator is idempotent and preserves runtime contracts", () => {
  const before = readFileSync(GENERATED, "utf8");
  execFileSync(process.execPath, [GENERATOR], { cwd: ROOT, stdio: "pipe" });
  const after = readFileSync(GENERATED, "utf8");
  assert.equal(after, before, "official generator must be a zero-diff second pass");
  const generated = JSON.parse(after);
  for (const required of ["Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng", "Credit Note", "Credit Note Item"])
    assert.ok(doc(generated, required), `missing regenerated ${required}`);
  for (const required of [
    ["Customer", "install_province"], ["Customer", "install_ward"], ["Customer", "install_address_line1"],
    ["Price List", "customer_group"], ["Sales Order Item", "discount_percentage"],
    ["Sales Order", "bank_account"], ["Sales Order", "contact_person"], ["Sales Order", "phone"],
    ["Sales Order", "install_province"], ["Sales Order", "install_ward"], ["Sales Order", "shipping_note"],
    ["Cutting Policy", "geometry_profile"], ["Cutting Policy", "geometry_rules"], ["Cut Order Item", "source_batch_no"],
  ]) assert.ok(field(generated, ...required), `missing regenerated ${required.join(".")}`);
  for (const dt of generated.doctypes) {
    /**
     * `sales_option` vẫn bị cấm; `sales_mode` thì KHÔNG — hai thứ khác nhau.
     *
     * Commit 46cff213 khai tử DANH MỤC "Cách bán" (`Sales Option`/`Sales Package`) cùng package
     * resolver và split-pricing. Nó không nói gì về `sales_mode`, và `SALES-BOM-SOURCE-MAP §5`
     * nói ngược lại: "trọn bộ / chỉ lá / tách món quyết định PHẠM VI CẤU PHẦN được giao/sinh
     * ra, không được mặc định đồng nhất với một danh mục cách bán".
     *
     * Bản cũ của test này gộp cả hai. Hệ quả đo được: cách giao không có chỗ trên dòng bán nên
     * nó bò vào MÃ HÀNG — 94 mặt hàng mang `TRONBO`/`TACHMON` ngay trong mã, mỗi biến thể một
     * BOM Template riêng. Đó chính là `Sales Package` quay lại ở tầng khó gỡ nhất.
     *
     * Từ 2026-08-19 `sales_mode` là Select hai giá trị trên dòng bán, mặc định "Trọn bộ", KHÔNG
     * Link tới doctype nào. Doctype khai tử vẫn phải vắng mặt — dòng dưới giữ nguyên.
     */
    assert.ok(!["Sales Option", "Sales Package"].includes(dt.name), `deprecated doctype ${dt.name}`);
    for (const f of dt.fields ?? []) assert.ok(nameOf(f) !== "sales_option", `deprecated ${dt.name}.${nameOf(f)}`);
    for (const f of dt.list ?? []) assert.ok(f !== "sales_option", `deprecated ${dt.name}.list:${f}`);
    for (const f of dt.search ?? []) assert.ok(f !== "sales_option", `deprecated ${dt.name}.search:${f}`);
  }
  const stockReturn = doc(generated, "Stock Return");
  for (const required of ["party_doctype", "party", "return_against_doctype", "return_against"])
    assert.ok(stockReturn.fields.some((entry) => nameOf(entry) === required), `Stock Return missing ${required}`);
  assert.ok(generated.actions.some((entry) => entry.name === "don-ban-thanh-hoa-don"));
  assert.ok(generated.validators.some((entry) => entry.doctype === "Stock Return"));
});

test("alumdoor source owns tấm liền Úc and canonical Item Color keys", () => {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const policy = source.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === "Cửa tấm liền Úc — công thức chuẩn");
  assert.ok(policy);
  assert.equal(policy.data.leaf_formula, "Kiểu tấm liền Úc");
  assert.equal(policy.data.leaf_divisor_const, 0.068);
  for (const color of source.fixtures.filter((entry) => entry.type === "Item Color")) {
    assert.ok(!Object.hasOwn(color.data, "finish"), `${color.name} still uses legacy finish key`);
    assert.ok(Object.hasOwn(color.data, "surface_finish"), `${color.name} missing surface_finish`);
  }
});
