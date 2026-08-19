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
const childPreview = read("server/apps-src/alumdoor-worker/src/ui-child-preview.ts");
const production = read("server/apps-src/alumdoor-worker/src/sales-production-core.ts");
const salesValidator = read("server/apps-src/alumdoor-worker/src/index.ts");
const commercialSalesOrder = read("server/packages/clouderp-selling/src/commercial-sales-order-controller.ts");
const salesBrief = read("server/briefs/alumdoor-v2.json");
const pbWidthMigration = read("server/migrations/tenant/0134_alumdoor_distinct_pb_widths.sql");
const depositMigration = read("server/migrations/tenant/0135_alumdoor_sales_order_deposit.sql");

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
  assert.match(workbench, /hydrateSavedLines\(savedItems, linesRef\.current\)/);
  assert.match(workbench, /_bomPreview: prior\._bomPreview/);
  assert.match(workbench, /_overrides: prior\._overrides/);
});

test("production remains downstream of submitted Sales Order", () => {
  assert.match(workbench, /docstatus === 1/);
  assert.match(workbench, /Production Request/);
  assert.match(production, /sales\.docstatus !== 1/);
  assert.match(production, /chưa ghi sổ/);
});

test("commercial row keeps rate fixed while discount and server money remain explicit", () => {
  assert.match(grid, /fieldFromMeta\(props\.childMeta, "discount_percentage"/);
  assert.doesNotMatch(grid, /onCommit\(line\._key, "rate"/);
  assert.match(grid, /Đơn giá tự động theo bảng giá/);
  assert.match(grid, /onCommit\(line\._key, "discount_percentage"/);
  assert.match(grid, /Tiền phải trả/);
  assert.match(grid, /Phụ thu/);
  assert.match(grid, /surchargeRuleNames/);
  assert.match(grid, /effect_type\)\.toUpperCase\(\) === "ADJUSTMENT"/);
  assert.match(grid, /surchargeNames\.join\(" · "\)/);
  assert.match(workbench, /preview_sales_commercial_line/);
  assert.match(salesBrief, /"fieldname": "rate"[\s\S]{0,180}"read_only": true/);
  assert.match(model, /lineDiscountNeedsApproval/);
  assert.match(grid, /khác chính sách .* cần duyệt/);
});

test("policy discount baseline comes from server snapshots, not the sale override", () => {
  assert.match(model, /effect_type\).*DISCOUNT_PERCENT/);
  assert.match(model, /selected\?\.discount_percentage/);
  assert.match(model, /linePolicyDiscountPercentage/);
  assert.match(grid, /khác chuẩn \{quantity\(policyDiscount\)\}%/);
  assert.match(grid, /benefit_items/);
  assert.match(grid, /text\(benefit\.label\) \|\| "Tặng kèm"/);
  assert.match(model, /DUC-GIFT-RAIL-8M2/);
  assert.match(model, /Tặng ray cửa Đức từ 8 m²/);
});

test("VAT and document totals are server-owned projections", () => {
  for (const field of ["vat_rate", "total_amount", "discount_amount", "surcharge_amount", "vat_amount", "grand_total", "deposit_amount", "outstanding_amount"]) {
    assert.match(workbench, new RegExp(field));
  }
  assert.match(workbench, /alumdoor\.ui\.preview_document/);
  assert.match(workbench, /Còn phải thu/);
  assert.match(documentPreview, /vat_base_amount/);
  assert.match(documentPreview, /grand_total/);
  assert.match(documentPreview, /outstanding_amount/);
  assert.match(depositMigration, /deposit_amount/);
  assert.match(depositMigration, /outstanding_amount/);
});

test("delivery address renders canonical province, ward and house-address links", () => {
  assert.match(workbench, /headerControl\("install_province", "Tỉnh\/TP", "Link"/);
  assert.match(workbench, /headerControl\("install_ward", "Xã\/Phường", "Link"/);
  assert.match(workbench, /headerControl\("install_address", "Số nhà \/ đường", "Small Text"/);
  assert.match(workbench, /fieldname === "install_province" \? \{ install_ward: undefined \}/);
  assert.match(workbench, /headerControl\("shipping_note", "Ghi chú vận chuyển", "Small Text"/);
  assert.match(workbench, /xl:grid-cols-\[minmax\(125px,0\.58fr\)_minmax\(155px,0\.72fr\)_minmax\(210px,1fr\)_minmax\(245px,1\.15fr\)_minmax\(245px,1\.15fr\)\]/);
});

test("summary is below the full-width grid and technical projection copy is removed", () => {
  const gridIndex = workbench.indexOf("<AlumdoorSalesOrderLineTableComplete");
  const summaryIndex = workbench.indexOf('data-section="sales-v2-summary-complete"');
  assert.ok(gridIndex >= 0 && summaryIndex > gridIndex);
  assert.doesNotMatch(workbench, /xl:grid-cols-\[minmax\(0,1fr\)_300px\]/);
  assert.doesNotMatch(workbench, /Projection từ `alumdoor\.ui\.preview_document`/);
  assert.doesNotMatch(workbench, /<h1[^>]*>Đơn bán hàng<\/h1>/);
  assert.doesNotMatch(grid, /Chi tiết bán hàng/);
  assert.doesNotMatch(grid, /Enter → ô tiếp theo/);
});

test("customer defaults are centralized in server preview and stale customer data is cleared", () => {
  assert.doesNotMatch(workbench, /getListView\("Price List"/);
  assert.doesNotMatch(workbench, /getDoc\("Customer"/);
  assert.match(documentPreview, /ALUMDOOR_SELLING_PRICE_LIST/);
  assert.match(documentPreview, /customerDoc\.price_group/);
  assert.doesNotMatch(documentPreview, /readDoc\(call, "Customer Group"/);
  assert.doesNotMatch(documentPreview, /default_selling_price_list/);
  assert.match(documentPreview, /contact_person/);
  assert.match(documentPreview, /install_address/);
  assert.match(documentPreview, /CUSTOMER_DERIVED_FIELDS/);
  assert.match(workbench, /CUSTOMER_CONTEXT_FIELDS/);
  assert.match(workbench, /customerHydrating/);
});

test("price group is selectable, server-validated and reprices every active line", () => {
  assert.match(workbench, /headerControl\("customer_group", "Nhóm giá", metaField\("customer_group"\)!\.fieldtype, metaField\("customer_group"\)!\.options, false, true\)/);
  assert.match(workbench, /markActiveLinesForReprice[\s\S]{0,700}_commercial: undefined/);
  assert.match(workbench, /markActiveLinesForReprice[\s\S]{0,900}_bomPreview: undefined/);
  assert.match(workbench, /active\.map\(\(line\) => previewLine\(line, "parent_context", \{\}, false\)\)/);
  assert.match(documentPreview, /changedField && changedField !== "customer"/);
  assert.doesNotMatch(documentPreview, /changedField !== "transaction_date"/);
  assert.match(commercialSalesOrder, /ALUMDOOR_PRICE_GROUPS = new Set\(\["Đại lý", "Lẻ"\]\)/);
  assert.match(commercialSalesOrder, /const group = selected \|\| existingSnapshot \|\| customerDefault/);
  assert.doesNotMatch(commercialSalesOrder, /cannot be changed on the document/);
  assert.doesNotMatch(salesValidator, /không được chọn tay/);
  assert.match(salesBrief, /Nạp mặc định từ hồ sơ khách nhưng được phép chọn lại trên từng đơn/);
});

test("responsible person maps current login to active Employee and customer cannot overwrite it", () => {
  assert.match(workbench, /getList\("Employee"/);
  assert.match(workbench, /\["user_id", "=", boot\.user\]/);
  assert.match(workbench, /\["employee_status", "=", "Đang làm việc"\]/);
  assert.match(workbench, /defaults\.responsible_person = currentEmployee/);
  assert.match(workbench, /initialHeader\.responsible_person = currentEmployee/);
  assert.match(workbench, /headerControl\("responsible_person", "Người phụ trách", "Link", "Employee", true\)/);
  const customerFields = documentPreview.slice(documentPreview.indexOf("CUSTOMER_DERIVED_FIELDS"), documentPreview.indexOf("async function customerDefaults"));
  assert.doesNotMatch(customerFields, /responsible_person/);
  assert.doesNotMatch(documentPreview, /customerDoc\.account_manager/);
});

test("BOM composition loads immediately for a full-set Item and stays draft-safe", () => {
  assert.match(workbench, /preview_bom_requirements/);
  assert.match(workbench, /const bomEligible = isFullSetSalesItem\(candidate\)/);
  assert.match(workbench, /if \(bomEligible\)/);
  assert.doesNotMatch(workbench, /bomEligible && customerGroup && dimensionsReady/);
  assert.doesNotMatch(grid, /Nhập <strong>Rộng PB<\/strong> và <strong>Cao PB<\/strong> để hệ thống tính và xổ vật tư BOM/);
  assert.match(workbench, /next\._bomError = ""/);
  assert.doesNotMatch(workbench, /isGermanDoor/);
  const validateSection = workbench.slice(workbench.indexOf("const validate"), workbench.indexOf("const buildDocument"));
  assert.doesNotMatch(validateSection, /_bomError/);
});

test("grid uses dynamic real specification columns instead of a nested spec editor", () => {
  for (const field of ["width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "mesh_height_m", "cut_width_m", "ray_type", "has_butterfly_bracket", "leaf_variant", "motor_model", "length_m", "qty_bar"]) {
    assert.match(grid, new RegExp(field));
  }
  assert.match(grid, /DYNAMIC_FIELD_ORDER\.filter/);
  assert.match(grid, /fieldVisible\(line, fieldname\)/);
  assert.match(grid, /Rộng PB ray/);
  assert.match(grid, /Rộng PB nhựa/);
  assert.match(grid, /Cao PB/);
  assert.doesNotMatch(grid, /SpecEditor/);
  assert.doesNotMatch(grid, />Diện tích</);
  assert.match(grid, /"Khối lượng"/);
});

test("PB ray and PB plastic are separate persisted fields", () => {
  assert.match(workbench, /customerGroup=\{text\(header\.customer_group\)\}/);
  assert.match(grid, /salesWidthInputField\(line, props\.customerGroup\) === fieldname/);
  assert.match(model, /alwaysUsesPbRay/);
  assert.match(model, /"cua dai loan"/);
  assert.doesNotMatch(grid, /fieldname === "width_m"\)[\s\S]{0,100}return "Rộng PB nhựa"/);
  assert.match(grid, /dynamicHeaderLabel\(fieldname\)/);
  assert.match(workbench, /width_pb_ray_m: line\.width_pb_ray_m/);
  assert.match(workbench, /width_pb_nhua_m: line\.width_pb_nhua_m/);
  assert.match(childPreview, /salesWidthField\(effectiveDoorType, item\.item_group, parent\.customer_group\)/);
  assert.match(childPreview, /patch\.width_m = selectedWidth/);
  assert.match(salesBrief, /"fieldname": "width_pb_ray_m"/);
  assert.match(salesBrief, /"fieldname": "width_pb_nhua_m"/);
  assert.match(pbWidthMigration, /0134/);
});

test("sales grid hides production cut width and exposes row-specific PB and mesh fields", () => {
  assert.match(grid, /fieldname === "cut_width_m"\) return false/);
  assert.match(grid, /aria-label="Không áp dụng"[^>]*>—<\/span>/);
  assert.match(childPreview, /usesMeshHeight\(effectiveDoorType, item\.item_group\)/);
  assert.match(childPreview, /label: "Cao lưới\\n\(m\)"/);
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

test("compact grid wraps headers, clips controls and centers check fields", () => {
  assert.match(grid, /whitespace-normal break-words text-center leading-tight/);
  assert.match(grid, /border-r-\[1\.5px\]/);
  assert.match(grid, /border-b-\[3px\]/);
  assert.match(grid, /flex min-w-0 shrink items-center justify-end/);
  assert.match(grid, /max-w-full overflow-hidden text-center/);
  assert.match(grid, /bg-primary px-1\.5 text-center font-semibold/);
  const field = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderField.tsx");
  assert.match(field, /props\.hideLabel \? "justify-center" : "gap-2"/);
});

test("door description includes the effective discount only when it is positive", () => {
  assert.match(grid, /discountPercentage > 0/);
  assert.match(grid, /linePolicyDiscountRule\(line\)/);
  assert.match(grid, /`Chiết khấu \$\{quantity\(discountPercentage\)\}%`/);
});

test("plain items use current quantity immediately and every selected item can open its detail row", () => {
  assert.match(model, /return isAreaDoor\(line\)[\s\S]{0,180}: numberValue\(line\.qty\)/);
  assert.match(workbench, /_commercial: undefined/);
  assert.match(grid, /directOrdinaryQuantity[\s\S]{0,900}qty: nextQuantity/);
  assert.match(model, /line\._context\?\.inventory_mode \|\| line\.inventory_mode \|\| "Hàng thường"/);
  assert.match(workbench, /previewLine\(line, "quantity_lifecycle", \{\}, false\)/);
  assert.match(grid, /props\.onCommit\(line\._key, quantityField, nextQuantity\)/);
  assert.match(grid, /pricedQty \* sellingRate/);
  assert.match(grid, /const hasAuxiliaryRow = Boolean\(text\(line\.item_code\)\)/);
  assert.match(grid, /const auxiliaryDescription = productDescription \|\| text\(line\._itemName\) \|\| text\(line\.item_code\)/);
  assert.match(grid, /text\(line\.item_code\) && hasAuxiliaryRow && expanded\.has\(line\._key\)/);
  assert.match(grid, /Mở"\} chi tiết dòng/);
});

test("described and policy-bearing items auto-expand while ordinary items stay user-controlled", () => {
  assert.match(grid, /Boolean\(doorProductDescription\(line, props\.customerGroup\)\)/);
  assert.match(grid, /lineDiscountAmount\(line\) !== 0/);
  assert.match(grid, /lineAdjustmentAmount\(line\) !== 0/);
  assert.match(grid, /const freshKeys = detailKeys\.filter/);
});

test("dimension and money header units render on a dedicated second line", () => {
  assert.match(grid, /DYNAMIC_HEADER_UNITS/);
  assert.match(grid, /height_m: "m"/);
  assert.match(grid, /head\("rate", "Đơn giá", "VNĐ"\)/);
  assert.match(grid, /head\("gross_amount", "Thành tiền", "VNĐ"\)/);
  assert.match(grid, /\(\{unit\}\)/);
});

test("item-code selector and administrative links hide duplicate display identifiers", () => {
  assert.match(workbench, /return \{ value: option\.value, label: option\.value/);
  assert.match(workbench, /description: itemName/);
  assert.match(workbench, /doctype === "Item"[\s\S]{0,80}\{ label: name \}/);
  const field = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderField.tsx");
  assert.match(field, /isAdministrativeLink/);
  assert.match(field, /\["install_province", "install_ward"\]/);
});

test("bank account link bypasses the incompatible legacy disabled filter", () => {
  assert.match(workbench, /doctype === "Tài khoản ngân hàng"/);
  assert.match(workbench, /filters: undefined/);
  assert.match(workbench, /fieldname === "bank_account" \? salesServices : services/);
  const field = read("client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderField.tsx");
  assert.match(field, /isCompositeBankLink/);
  assert.match(field, /isAdministrativeLink \|\| isCompositeBankLink/);
});

test("BOM expands into normal item-shaped rows above discount and surcharge", () => {
  assert.match(grid, /const \[expanded, setExpanded\] = useState<Set<string>>\(\(\) => new Set\(\)\)/);
  const commercialIndex = grid.indexOf('data-section="sales-v2-commercial-row"');
  const bomIndex = grid.lastIndexOf("<BomBlock");
  assert.ok(bomIndex >= 0 && commercialIndex > bomIndex);
  assert.match(grid, /data-section="sales-v2-bom-item-row"/);
  assert.match(grid, /props\.lineNumber\}\.\{index \+ 1\}/);
  assert.match(grid, /rowSpan=\{components\.length\}/);
  assert.match(grid, />BOM<\/span>/);
  assert.doesNotMatch(grid, /Chọn BOM/);
  assert.match(grid, /props\.widths\.quantity/);
  assert.match(grid, /props\.widths\.rate/);
  assert.match(grid, /props\.widths\.gross_amount/);
  assert.doesNotMatch(grid, /ĐVT sản xuất/);
  assert.doesNotMatch(grid, /BOM ✓/);
  assert.match(grid, /isFullSetSalesItem\(line\)/);
});

test("BOM rows use component-specific color and dimensions and never sales price", () => {
  assert.match(grid, /const tone = "bg-background"/);
  assert.doesNotMatch(grid, /BOM_INHERITED_DIMENSIONS/);
  assert.match(grid, /dynamicDisplayValue\(fieldname, component\[fieldname\]\)/);
  assert.match(grid, /text\(component\.color\) \|\| "—"/);
  assert.doesNotMatch(grid, /dynamicDisplayValue\(fieldname, props\.line\[fieldname\]\)/);
  assert.match(grid, /const parentRowTone = text\(line\.item_code\) \? "bg-primary\/\[0\.035\]"/);
  assert.doesNotMatch(grid, /component\.gross_amount \?\? component\.net_amount/);
  assert.doesNotMatch(grid, /component\.pricing_error/);
  assert.doesNotMatch(workbench, /priceBomComponents/);
});

test("deferred BOM quantities stay visible as an em dash instead of becoming zero", () => {
  assert.match(model, /qty\?: number \| null/);
  assert.match(model, /quantity_error\?: string/);
  assert.match(grid, /component\.qty == null \? undefined/);
  assert.match(grid, /measuredQuantity === undefined \? "—"/);
});

test("BOM rows show selling UOM while production UOM stays internal", () => {
  assert.match(grid, /text\(line\.uom\) \|\| text\(line\._context\?\.selected_uom\)/);
  assert.match(grid, /text\(component\.uom\) \|\| "—"/);
  assert.doesNotMatch(grid, /text\(component\.stock_uom\) \|\| "—"/);
  assert.doesNotMatch(grid, /component\.stock_uom[\s\S]{0,120}onCommit/);
  assert.match(grid, /numberValue\(component\.set_count\) \?\? numberValue\(props\.line\.set_count\)/);
  assert.match(grid, /component\.qty == null \? undefined/);
});

test("width and height changes auto-commit BOM preview without requiring a second blur", () => {
  assert.match(grid, /dimensionCommitTimers/);
  assert.match(grid, /scheduleDimensionCommit/);
  assert.match(grid, /"width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "mesh_height_m"/);
  assert.match(grid, /setTimeout\(\(\) => flushDynamicCommit\(lineKey, fieldname\), 300\)/);
  assert.match(grid, /Đang tính và xổ vật tư BOM/);
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
