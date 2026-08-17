import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

const entry = read("client/packages/views/src/app/vertical/alumdoor/AlumdoorSalesOrderCreate.tsx");
const workbench = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderWorkbenchComplete.tsx");
const grid = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderLineTableComplete.tsx");
const documentPreview = read("server/apps-src/alumdoor-worker/src/ui-document-preview.ts");
const production = read("server/apps-src/alumdoor-worker/src/sales-production-core.ts");

test("Sales Order entry routes to the complete workbench", () => {
  assert.match(entry, /AlumdoorSalesOrderWorkbenchComplete/);
  assert.doesNotMatch(entry, /AlumdoorSalesOrderWorkbench as AlumdoorSalesOrderCreate/);
});

test("draft, reopen/edit, submit and submitted-readonly lifecycle remain explicit", () => {
  assert.match(workbench, /adapter\.createDoc\("Sales Order"/);
  assert.match(workbench, /adapter\.updateDoc\("Sales Order"/);
  assert.match(workbench, /adapter\.submit\(saved\)/);
  assert.match(workbench, /docstatus !== 0/);
  assert.match(workbench, /Lưu nháp/);
  assert.match(workbench, /Ghi sổ đơn/);
  assert.match(workbench, /Đã ghi sổ/);
});

test("production remains downstream of submitted Sales Order", () => {
  assert.match(workbench, /docstatus === 1/);
  assert.match(workbench, /Production Request/);
  assert.match(production, /sales\.docstatus !== 1/);
  assert.match(production, /chưa ghi sổ/);
});

test("commercial row exposes rate and discount inputs while server previews money", () => {
  assert.match(grid, /fieldFromMeta\(props\.childMeta, "rate"/);
  assert.match(grid, /fieldFromMeta\(props\.childMeta, "discount_percentage"/);
  assert.match(grid, /onCommit\(line\._key, "rate"/);
  assert.match(grid, /onCommit\(line\._key, "discount_percentage"/);
  assert.match(workbench, /preview_sales_commercial_line/);
  assert.match(workbench, /rate_requires_approval/);
  assert.match(workbench, /Cần duyệt thương mại/);
});

test("VAT and document totals are server-owned projections", () => {
  for (const field of ["vat_rate", "total_amount", "discount_amount", "surcharge_amount", "vat_amount", "grand_total"]) {
    assert.match(workbench, new RegExp(field));
  }
  assert.match(workbench, /alumdoor\.ui\.preview_document/);
  assert.match(workbench, /Tiền phải thu/);
  assert.match(documentPreview, /vat_base_amount/);
  assert.match(documentPreview, /grand_total/);
});

test("customer and price-list defaults are centralized in server preview", () => {
  assert.doesNotMatch(workbench, /getListView\("Price List"/);
  assert.doesNotMatch(workbench, /getDoc\("Customer"/);
  assert.match(documentPreview, /authoritativeCustomerPriceList/);
  assert.match(documentPreview, /readDoc\(call, "Customer Group"/);
  assert.match(documentPreview, /default_selling_price_list/);
  assert.match(documentPreview, /contact_person/);
  assert.match(documentPreview, /install_address/);
});

test("BOM guidance remains draft-safe and production-owned", () => {
  assert.match(workbench, /preview_bom_requirements/);
  assert.match(workbench, /isAreaDoor\(candidate\)/);
  assert.doesNotMatch(workbench, /isGermanDoor/);
  assert.doesNotMatch(workbench, /\["Đại lý", "Lẻ"\]/);
  assert.match(workbench, /vẫn được lưu nháp/);
  const validateSection = workbench.slice(workbench.indexOf("const validate"), workbench.indexOf("const buildDocument"));
  assert.doesNotMatch(validateSection, /_bomError/);
});

test("dirty close and keyboard-first data entry are explicit", () => {
  assert.match(workbench, /beforeunload/);
  assert.match(workbench, /Bỏ thay đổi chưa lưu/);
  assert.match(workbench, /confirmDiscard/);
  assert.match(grid, /data-sales-grid-field/);
  assert.match(grid, /event\.key !== "Enter"/);
  assert.match(grid, /focusable\?\.focus/);
  assert.match(grid, /aria-label=\{`Nhân bản dòng/);
  assert.match(grid, /aria-label=\{`Xóa dòng/);
});


test("complete grid consumes canonical ray_type without geometry constants", () => {
  assert.match(grid, /ray_type: "Loại ray"/);
  assert.match(grid, /fieldname === "ray_type"/);
  assert.match(workbench, /ray_type: line\.ray_type/);
  assert.match(workbench, /ray_type: undefined/);
  assert.doesNotMatch(grid + workbench, /0\.05|0\.08/);
});
