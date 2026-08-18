import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

const entry = read("client/packages/views/src/app/vertical/alumdoor/AlumdoorSalesOrderCreate.tsx");
const workbench = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderWorkbenchComplete.tsx");
const grid = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderLineTableComplete.tsx");
const model = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/model.ts");
const coordinator = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/preview-coordinator.ts");
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

test("commercial row exposes editable rate and discount while server previews money", () => {
  assert.match(grid, /fieldFromMeta\(props\.childMeta, "rate"/);
  assert.match(grid, /fieldFromMeta\(props\.childMeta, "discount_percentage"/);
  assert.match(grid, /onCommit\(line\._key, "rate"/);
  assert.match(grid, /onCommit\(line\._key, "discount_percentage"/);
  assert.match(grid, /Tiền phải trả/);
  assert.match(grid, /Phụ thu/);
  assert.match(workbench, /preview_sales_commercial_line/);
  assert.match(model, /lineDiscountNeedsApproval/);
  assert.match(grid, /khác chính sách .* cần duyệt/);
});

test("policy discount baseline comes from server snapshots, not the sale override", () => {
  assert.match(model, /effect_type\).*DISCOUNT_PERCENT/);
  assert.match(model, /selected\?\.discount_percentage/);
  assert.match(model, /linePolicyDiscountPercentage/);
  assert.match(grid, /Chuẩn \{quantity\(policyDiscount\)\}%/);
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

test("summary is below the full-width grid and technical projection copy is removed", () => {
  const gridIndex = workbench.indexOf("<AlumdoorSalesOrderLineTableComplete");
  const summaryIndex = workbench.indexOf('data-section="sales-v2-summary-complete"');
  assert.ok(gridIndex >= 0 && summaryIndex > gridIndex);
  assert.doesNotMatch(workbench, /xl:grid-cols-\[minmax\(0,1fr\)_300px\]/);
  assert.doesNotMatch(workbench, /Projection từ `alumdoor\.ui\.preview_document`/);
  assert.doesNotMatch(workbench, /<h1[^>]*>Đơn bán hàng<\/h1>/);
});

test("customer defaults are centralized in server preview and stale customer data is cleared", () => {
  assert.doesNotMatch(workbench, /getListView\("Price List"/);
  assert.doesNotMatch(workbench, /getDoc\("Customer"/);
  assert.match(documentPreview, /authoritativeCustomerPriceList/);
  assert.match(documentPreview, /readDoc\(call, "Customer Group"/);
  assert.match(documentPreview, /default_selling_price_list/);
  assert.match(documentPreview, /contact_person/);
  assert.match(documentPreview, /install_address/);
  assert.match(documentPreview, /CUSTOMER_DERIVED_FIELDS/);
  assert.match(workbench, /CUSTOMER_CONTEXT_FIELDS/);
  assert.match(workbench, /customerHydrating/);
});

test("responsible person maps current login to active Employee and customer cannot overwrite it", () => {
  assert.match(workbench, /getList\("Employee"/);
  assert.match(workbench, /\["user_id", "=", boot\.user\]/);
  assert.match(workbench, /\["employee_status", "=", "Đang làm việc"\]/);
  assert.match(workbench, /defaults\.responsible_person = employeeName/);
  const customerFields = documentPreview.slice(documentPreview.indexOf("CUSTOMER_DERIVED_FIELDS"), documentPreview.indexOf("async function customerDefaults"));
  assert.doesNotMatch(customerFields, /responsible_person/);
  assert.doesNotMatch(documentPreview, /customerDoc\.account_manager/);
});

test("BOM guidance waits for hydrated customer context and stays draft-safe", () => {
  assert.match(workbench, /preview_bom_requirements/);
  assert.match(workbench, /isAreaDoor\(candidate\)/);
  assert.match(workbench, /&& customerGroup/);
  assert.match(workbench, /next\._bomError = ""/);
  assert.doesNotMatch(workbench, /isGermanDoor/);
  const validateSection = workbench.slice(workbench.indexOf("const validate"), workbench.indexOf("const buildDocument"));
  assert.doesNotMatch(validateSection, /_bomError/);
});

test("grid uses dynamic real specification columns instead of a nested spec editor", () => {
  for (const field of ["width_m", "height_m", "mesh_height_m", "cut_width_m", "ray_type", "has_butterfly_bracket", "leaf_variant", "motor_model", "length_m", "qty_bar"]) {
    assert.match(grid, new RegExp(field));
  }
  assert.match(grid, /DYNAMIC_FIELD_ORDER\.filter/);
  assert.match(grid, /fieldVisible\(line, fieldname\)/);
  assert.match(grid, /Rộng phủ bì/);
  assert.match(grid, /Cao phủ bì/);
  assert.doesNotMatch(grid, /SpecEditor/);
  assert.doesNotMatch(grid, />Diện tích</);
  assert.match(grid, /"Khối lượng"/);
});

test("grid is resizable, remembers widths and keeps row actions below the table", () => {
  assert.match(grid, /cursor-col-resize/);
  assert.match(grid, /pointermove/);
  assert.match(grid, /localStorage\.setItem\(COLUMN_WIDTH_STORAGE_KEY/);
  assert.match(grid, /FROZEN_COLUMNS/);
  const tableEnd = grid.indexOf("</Table>");
  const addLine = grid.lastIndexOf("Thêm dòng");
  assert.ok(tableEnd >= 0 && addLine > tableEnd);
});

test("BOM is collapsed by default and rendered below the commercial row", () => {
  assert.match(grid, /const \[expanded, setExpanded\] = useState<Set<string>>\(\(\) => new Set\(\)\)/);
  const commercialIndex = grid.indexOf('data-section="sales-v2-commercial-row"');
  const bomIndex = grid.lastIndexOf("<BomBlock");
  assert.ok(commercialIndex >= 0 && bomIndex > commercialIndex);
  assert.match(grid, /BOM ✓/);
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
  assert.match(grid, /"ray_type"/);
  assert.match(workbench, /ray_type: line\.ray_type/);
  assert.match(workbench, /ray_type: undefined/);
  assert.doesNotMatch(grid + workbench, /0\.05|0\.08/);
});

test("all document previews share one revision clock and stale responses cannot apply", () => {
  assert.match(workbench, /createSalesOrderPreviewClock/);
  assert.match(workbench, /markSalesOrderDocumentChanged/);
  assert.match(workbench, /canApplySalesOrderDocumentPreview/);
  assert.match(coordinator, /clock\.revision === revision/);
  assert.doesNotMatch(workbench, /headerSeq/);
  assert.doesNotMatch(workbench, /documentSeq/);
  assert.match(workbench, /applySalesOrderDocumentPreview\(current, result\)/);
});

test("line previews wait for complete customer commercial context", () => {
  assert.match(workbench, /const documentRevision = previewClock\.current\.revision/);
  assert.match(workbench, /canApplySalesOrderDocumentPreview\(previewClock\.current, documentRevision\)/);
  assert.match(workbench, /markActiveLinesForReprice/);
  assert.match(workbench, /if \(loading \|\| !childMeta \|\| customerHydrating\) return/);
});

test("save and submit fail closed while document, customer or line previews are unresolved", () => {
  const validateSection = workbench.slice(workbench.indexOf("const validate"), workbench.indexOf("const buildDocument"));
  assert.match(validateSection, /previewClock\.current\.pending > 0 \|\| customerHydrating/);
  assert.match(validateSection, /headerErrorRef\.current/);
  assert.match(workbench, /isSalesOrderPersistenceBlocked/);
  assert.match(workbench, /disabled=\{persistenceBlocked \|\| !canSave\}/);
  assert.match(workbench, /disabled=\{persistenceBlocked\}/);
  assert.match(workbench, /fieldset disabled=\{formReadOnly \|\| busy\}/);
});

test("structural line mutations and clearing an item refresh server totals", () => {
  assert.match(workbench, /replaceLinesAndRefreshTotals/);
  const duplicateSection = workbench.slice(workbench.indexOf("const duplicateLine"), workbench.indexOf("const validate"));
  assert.match(duplicateSection, /replaceLinesAndRefreshTotals/);
  const itemSection = workbench.slice(workbench.indexOf('if (fieldname === "item_code")'), workbench.indexOf("const commitBomActualComponents"));
  assert.match(itemSection, /refreshDocumentPreview\("items", nextLines\)/);
});

test("production and print actions remain available without the removed top header", () => {
  assert.match(workbench, /getCapabilities\("Production Request"\)/);
  assert.match(workbench, /productionCaps\.read/);
  assert.match(workbench, /docstatus === 1 && documentName && productionCaps\.read/);
  assert.match(workbench, /Sản xuất/);
  assert.match(workbench, /In \/ xem/);
});
