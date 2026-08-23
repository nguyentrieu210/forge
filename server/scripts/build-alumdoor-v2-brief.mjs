/**
 * Dẫn xuất brief V2 từ brief hiện hành thay vì gõ lại 62 doctype.
 *
 * Vì sao dẫn xuất chứ không viết mới: bản cũ có nhiều thứ ĐÚNG mà V2 giữ nguyên
 * (`purchase_order` trên dòng, `link_filters` ô chọn mặt hàng, 4 trường read-only ghi lại
 * công thức đã áp, `orderOf()`...). Gõ lại là cơ hội đánh rơi chúng — đúng lỗi đã sinh ra
 * quyển sổ thứ hai: brief cũ khai đè `Stock Entry Detail` rồi làm mất `serial_and_batch_bundle`.
 *
 * Đợt này CHỈ làm nhánh NHẬP theo ưu tiên chủ xưởng ("cho cái nhập là được").
 * Nguồn: docs/brd-v2/TECHNICAL_DESIGN.md §4 (Item), §5.1 (Measurement Profile), §6 (Purchase Receipt).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { applyAlumdoorChildPresentation } from "./lib/alumdoor-child-presentation.mjs";
import { parseField } from "./lib/compile-brief.mjs";
import { applyFieldDescriptions } from "./lib/alumdoor-field-descriptions.mjs";
import { GEOMETRY_FIELDS, GEOMETRY_PROFILES } from "./lib/alumdoor-geometry-catalog.mjs";
import { CUTTING_POLICIES, cuttingPolicyFixtureData } from "./lib/alumdoor-cutting-policy-catalog.mjs";
import { bomSourceFixtureRows } from "./lib/alumdoor-bom-template-source-catalog.mjs";
import { MEASUREMENT_PROFILES, measurementProfilePayload } from "./lib/alumdoor-measurement-profile-catalog.mjs";
import { ALUMDOOR_COLOR_CATALOG } from "./lib/alumdoor-color-catalog.mjs";
import { ALUMDOOR_SLAT_CATALOG, slatCatalogFixtureData } from "./lib/alumdoor-slat-catalog.mjs";
import { ALUMDOOR_ITEM_GROUP_CATALOG } from "./lib/alumdoor-item-group-catalog.mjs";
import { ALUMDOOR_BOM_RULE_FIXTURES } from "./lib/alumdoor-bom-rule-fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// `--src` / `--out` để chạy được mà KHÔNG ghi đè brief trong cây làm việc.
// Test tái lập trước đây chạy thẳng vào `briefs/alumdoor-v2.json`: lần chạy đầu ghi đè
// (xoá mất phần sửa tay chưa có trong bộ sinh), lần chạy sau so chính bản vừa ghi nên XANH.
const argv = process.argv.slice(2);
const pathArg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value ? resolve(process.cwd(), value) : fallback;
};
const SRC = pathArg("src", resolve(here, "../briefs/alumdoor.json"));
const OUT = pathArg("out", resolve(here, "../briefs/alumdoor-v2.json"));
const ORDER_LOGO = `data:image/png;base64,${readFileSync(resolve(here, "../../client/apps/runtime/public/alumdoor-order-logo.png")).toString("base64")}`;

const sourceBrief = JSON.parse(readFileSync(SRC, "utf8"));
const brief = structuredClone(sourceBrief);
const log = [];
const note = (m) => log.push(m);

/** Tên field của một mục trong mảng `fields` — mục có thể là chuỗi rút gọn hoặc object. */
const nameOf = (f) => (typeof f === "string" ? f.split(":")[0].trim() : f.fieldname);
const doctype = (n) => {
  const d = brief.doctypes.find?.((x) => x.name === n) ?? brief.doctypes[n];
  if (!d) throw new Error(`Không thấy doctype ${n} trong brief nguồn`);
  return d;
};
const dropFields = (dt, names) => {
  const before = dt.fields.length;
  dt.fields = dt.fields.filter((f) => !names.includes(nameOf(f)));
  note(`${dt.name}: bỏ ${before - dt.fields.length} trường (${names.join(", ")})`);
};
const addAfter = (dt, anchor, ...items) => {
  const i = dt.fields.findIndex((f) => nameOf(f) === anchor);
  if (i < 0) throw new Error(`${dt.name}: không thấy neo "${anchor}"`);
  dt.fields.splice(i + 1, 0, ...items);
  note(`${dt.name}: thêm ${items.length} trường sau "${anchor}"`);
};
const replaceField = (dt, name, next) => {
  const i = dt.fields.findIndex((f) => nameOf(f) === name);
  if (i < 0) throw new Error(`${dt.name}: không thấy trường "${name}"`);
  dt.fields[i] = next;
  note(`${dt.name}: thay "${name}"`);
};
const patchField = (dt, name, patch) => {
  const i = dt.fields.findIndex((f) => nameOf(f) === name);
  if (i < 0) throw new Error(`${dt.name}: không thấy trường "${name}"`);
  const current = typeof dt.fields[i] === "string"
    ? parseField(dt.fields[i], i, `doctype ${dt.name}`)
    : dt.fields[i];
  dt.fields[i] = { ...current, ...patch };
  note(`${dt.name}: cập nhật "${name}"`);
};
const moveFieldsAfter = (dt, names, anchor) => {
  const moving = names.map((name) => {
    const field = dt.fields.find((entry) => nameOf(entry) === name);
    if (!field) throw new Error(`${dt.name}: không thấy trường "${name}" để chuyển`);
    return field;
  });
  dt.fields = dt.fields.filter((entry) => !names.includes(nameOf(entry)));
  const anchorIndex = dt.fields.findIndex((entry) => nameOf(entry) === anchor);
  if (anchorIndex < 0) throw new Error(`${dt.name}: không thấy neo "${anchor}"`);
  dt.fields.splice(anchorIndex + 1, 0, ...moving);
  note(`${dt.name}: chuyển ${names.join(", ")} sau "${anchor}"`);
};

// ─────────────────────────── HEADER ───────────────────────────
/**
 * 2.5.0 — đợt hội tụ danh mục 2026-08-19.
 *
 * Bump MINOR chứ không patch: gói này thêm tám DocType (`Pricing Scope` + child, `BOM Rule` +
 * child, `Quy cách cửa`, `Nguyên nhân cửa lỗi`, `Bậc diện tích`, `Ngưỡng chọn Motor`) và ba
 * trường mới trên đường tính tiền (`Item Price.area_tier`, `BOM Template.sales_mode`,
 * `<dòng bán>.sales_mode`). Đó là năng lực mới, không phải sửa lỗi.
 *
 * Version cũng là thứ QUYẾT ĐỊNH bản cài có được ghi lại hay không: installer coi gói là
 * `unchanged` khi manifest byte-identical, nên giữ nguyên số cũ là mọi sửa đổi metadata nằm im
 * trong file mà không bao giờ vào tenant.
 */
brief.version = "2.37.0";
brief.locale.dateFormat = "dd/mm/yyyy"; // Q11 — chủ xưởng chốt gạch chéo
for (const role of ["General Accountant", "Chief Accountant", "Director", "Kế toán tổng hợp", "Kế toán trưởng", "Giám đốc"]) {
  if (!brief.roles.includes(role)) brief.roles.push(role);
}
brief.doctypes.push({
  name: "Daily Ledger Access",
  label: "Quyền sổ chi tiết hằng ngày",
  menu: false,
  fields: [{ fieldname: "note", fieldtype: "Small Text", label: "Ghi chú", read_only: true }],
  permissions: {
    "General Accountant": "r", "Chief Accountant": "r", Director: "r",
    "Kế toán tổng hợp": "r", "Kế toán trưởng": "r", "Giám đốc": "r",
  },
});
// Màn "Báo cáo công nợ" ôm CẢ phải thu lẫn phải trả, nên không gác được bằng `Sales Invoice`
// (người mua hàng/thủ kho sẽ bị chặn khỏi nửa phải trả). Dựng DocType gác cổng riêng theo đúng
// tiền lệ `Daily Ledger Access` ngay trên.
brief.doctypes.push({
  name: "Debt Report Access",
  label: "Quyền báo cáo công nợ",
  menu: false,
  fields: [{ fieldname: "note", fieldtype: "Small Text", label: "Ghi chú", read_only: true }],
  permissions: {
    "Kế toán": "r", "Chủ xưởng": "r", "Kinh doanh": "r",
    "General Accountant": "r", "Chief Accountant": "r",
    "Kế toán tổng hợp": "r", "Kế toán trưởng": "r", "Giám đốc": "r",
  },
});
brief.experiences = [...(brief.experiences ?? []), {
  key: "daily-ledger:workbench",
  label: "Sổ chi tiết hằng ngày",
  permission: "Daily Ledger Access",
  roles: ["General Accountant", "Chief Accountant", "Director", "Kế toán tổng hợp", "Kế toán trưởng", "Giám đốc"],
  icon: "notebook-tabs",
  group: "Báo cáo",
}, {
  key: "alumdoor-operations:workbench",
  label: "Trung tâm vận hành",
  permission: "Sales Order",
  roles: ["Chủ xưởng", "Kinh doanh", "Thủ kho", "Kế toán", "Sản xuất", "General Accountant", "Chief Accountant", "Kế toán tổng hợp", "Kế toán trưởng"],
  icon: "panels-top-left",
  group: "Bán hàng",
}, {
  key: "alumdoor-debt:workbench",
  label: "Báo cáo công nợ",
  permission: "Debt Report Access",
  roles: ["Kế toán", "Chủ xưởng", "Kinh doanh", "General Accountant", "Chief Accountant", "Kế toán tổng hợp", "Kế toán trưởng", "Giám đốc"],
  icon: "wallet",
  group: "Công nợ",
}];

const warrantyClaim = doctype("Warranty Claim");
warrantyClaim.permissions = {
  ...warrantyClaim.permissions,
  "General Accountant": "rwc", "Chief Accountant": "rwc", "Kế toán tổng hợp": "rwc", "Kế toán trưởng": "rwc",
};
addAfter(warrantyClaim, "legacy_voucher",
  "sales_order:Link(Sales Order)! Đơn bán",
  "delivery_note:Link(Delivery Note)! Phiếu giao thực tế",
  "delivery_date:Date~ Ngày giao thực tế",
  "item_code:Link(Item)! Mặt hàng lỗi",
  "purchase_document:Link(Purchase Invoice) Chứng từ mua liên quan",
);
replaceField(warrantyClaim, "issue_cause", {
  fieldname: "issue_cause", fieldtype: "Select",
  options: "Sản xuất\nNhà cung cấp\nKhách hàng sử dụng\nVận chuyển/lắp đặt",
  label: "Nguyên nhân", required: true,
});
addAfter(warrantyClaim, "issue_cause",
  "responsible_person:Data Người chịu trách nhiệm",
  "production_conclusion:Small Text Kết luận sản xuất",
  "warranty_expires_on:Date~ Hết hạn bảo hành",
  "warranty_eligible:Check~ Còn bảo hành",
  "customer_costs:Table(Warranty Cost Item) Chi phí do khách chịu",
  "customer_cost_total:Currency~ Tổng chi phí khách chịu",
  "supplier_offset_amount:Currency Số tiền bù trừ NCC",
  "debit_note:Link(Debit Note)~ Giấy báo Nợ bù trừ",
  "accounting_confirmed_by:Data~ Kế toán xác nhận",
  "accounting_confirmed_on:Datetime~ Lúc xác nhận",
);
replaceField(warrantyClaim, "warranty_status", "warranty_status:Select(Mới,Đang xử lý,Đã đổi cho khách,Chờ NCC đổi,Đang gửi NCC,Đã nhận từ NCC,Đã xác nhận bù trừ,Đã đóng)=(Mới) Trạng thái");
brief.doctypes.push({
  name: "Warranty Cost Item", child: true, label: "Chi phí xử lý lỗi", group: "Bảo hành", naming: "autoincrement",
  fields: ["operation:Data*! Công việc", "quantity:Float!=(1) Số lượng", "rate:Currency! Đơn giá", "amount:Currency~ Thành tiền", "note:Data Ghi chú"],
  permissions: { "Chủ xưởng": "rwc", "Kinh doanh": "rwc", "Kế toán": "rwc", "Thủ kho": "rwc" },
});

const productionStandard = doctype("Production Standard");
addAfter(productionStandard, "minutes_per_set",
  { fieldname: "capacity_basis", fieldtype: "Select", options: "m2\nset\noperation\nbatch", label: "Cơ sở định mức", description: "Để trống: Cửa Úc/Lưới dùng m2, sơn dùng batch, các loại còn lại dùng set." },
  "minutes_per_unit:Float Phút / đơn vị",
  "batch_capacity:Float Sức chứa một mẻ",
  "persons:Float=(1) Số người tiêu chuẩn",
  "shift_hours:Float=(8) Giờ / ca",
  "efficiency:Percent=(100) Hiệu suất",
  "workstation:Data Trạm / máy",
  "default_overtime_hours:Float=(0) Giờ tăng ca mặc định",
);

const operationalSalesOrder = doctype("Sales Order");
addAfter(operationalSalesOrder, "delivery_date",
  {
    fieldname: "responsible_person",
    fieldtype: "Link",
    options: "Employee",
    label: "Người phụ trách",
    fetch_from: "customer.account_manager",
    link_filters: JSON.stringify({ employee_status: "Đang làm việc" }),
  },
  "manual_note:Small Text Ghi chú vận hành",
  "operational_change_reason:Small Text- Lý do đổi vận hành",
);

// Sales totals remain server-authoritative. Metadata only projects the canonical preview/save
// fields back into a dedicated summary section; no pricing/tax formula lives in FormView.
const existingGrandTotalIndex = operationalSalesOrder.fields.findIndex((field) => nameOf(field) === "grand_total");
if (existingGrandTotalIndex < 0) throw new Error("Sales Order: không thấy grand_total để dựng Tổng kết");
const [grandTotalSource] = operationalSalesOrder.fields.splice(existingGrandTotalIndex, 1);
const grandTotalField = parseField(grandTotalSource, existingGrandTotalIndex);
operationalSalesOrder.fields.push(
  { fieldname: "sales_summary_section", fieldtype: "Section Break", label: "Tổng kết", form_section_style: "summary" },
  { fieldname: "total_amount", fieldtype: "Currency", label: "Tổng cộng tiền hàng", read_only: true },
  { fieldname: "discount_amount", fieldtype: "Currency", label: "Tiền chiết khấu", read_only: true },
  { fieldname: "surcharge_amount", fieldtype: "Currency", label: "Phụ thu", read_only: true },
  { fieldname: "vat_rate", fieldtype: "Percent", label: "% VAT", default: 0 },
  { fieldname: "vat_amount", fieldtype: "Currency", label: "Số tiền VAT", read_only: true },
  { ...grandTotalField, fieldname: "grand_total", label: "Tiền phải thu", fieldtype: "Currency", read_only: true },
);

const salesFormHidden = new Set(["product_group", "against_quotation", "note"]);
operationalSalesOrder.fields = operationalSalesOrder.fields.map((raw, index) => {
  const field = parseField(raw, index);
  if (!["Section Break", "Column Break", "Tab Break"].includes(field.fieldtype)) field.form_region = "full";
  if (["transaction_date", "delivery_date", "payment_method"].includes(field.fieldname)) field.form_region = "aside";
  if (["customer", "responsible_person", "manual_note", "operational_change_reason", "selling_price_list", "customer_group", "install_address"].includes(field.fieldname)) field.form_region = "main";
  if (field.fieldname === "install_address") field.form_width = "full";
  if (field.fieldname === "customer_group") {
    field.label = "Nhóm giá";
    field.read_only = true;
    field.fetch_from = "customer.price_group";
  }
  if (field.fieldname === "payment_method") { field.default = "Ghi công nợ"; field.form_control_style = "choice_list"; }
  const summaryLabels = { total_amount: "Tổng cộng tiền hàng", discount_amount: "Tiền chiết khấu", surcharge_amount: "Phụ thu", vat_rate: "% VAT", vat_amount: "Số tiền VAT", grand_total: "Tiền phải thu" };
  if (field.fieldname in summaryLabels) { field.label = summaryLabels[field.fieldname]; field.form_width = "full"; }
  return field;
});
const salesSummaryIndex = operationalSalesOrder.fields.findIndex((field) => nameOf(field) === "total_amount");
if (salesSummaryIndex >= 0 && !operationalSalesOrder.fields.some((field) => nameOf(field) === "sales_summary_section")) {
  operationalSalesOrder.fields.splice(salesSummaryIndex, 0, { fieldname: "sales_summary_section", fieldtype: "Section Break", label: "Tổng kết", form_section_style: "summary" });
}
operationalSalesOrder.form = {
  fields: operationalSalesOrder.fields.map(nameOf).filter((name) => name !== "sales_summary_section" && !salesFormHidden.has(name)),
  previewMethod: "alumdoor.ui.preview_document",
  previewParentFields: ["customer", "transaction_date", "items", "vat_rate", "surcharge_amount", "additional_discount_percentage"],
};
const warrantyDebitNote = doctype("Debit Note");
warrantyDebitNote.permissions = {
  ...warrantyDebitNote.permissions,
  "General Accountant": "rwcsxa", "Chief Accountant": "rwcsxa", "Kế toán tổng hợp": "rwcsxa", "Kế toán trưởng": "rwcsxa",
};
addAfter(warrantyDebitNote, "return_against", "warranty_claim:Link(Warranty Claim)- Hồ sơ bảo hành");
// Nỗi đau #1 của BRD: người mở app phải thấy ngay tồn KHẢ DỤNG theo khổ, không phải tự lấy tồn tổng
// rồi trừ các phiếu giữ bằng tay. Báo cáo này nằm ở query engine nền tảng vì nó đọc cùng sổ kho.
brief.links.unshift({
  report: "Tồn nhôm theo khổ",
  label: "Tồn nhôm theo khổ",
  permission: "Item",
  icon: "ruler",
  group: "Kho",
});
brief.navigation.items.unshift("report:Tồn nhôm theo khổ");
brief.home = "report:Tồn nhôm theo khổ";
note(`header: version 2.0.1 · dateFormat dd/mm/yyyy · home = Tồn nhôm theo khổ`);

const purchaseOrderItem = doctype("Purchase Order Item");
replaceField(purchaseOrderItem, "qty", {
  fieldname: "qty",
  fieldtype: "Float",
  label: "Số lượng",
  precision: 2,
  required: true,
  read_only_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  description: "Số lượng tính tiền theo ĐVT mua. Riêng nhôm cây/lá tự tính bằng chiều dài × định mức kg/m × số cây/lá.",
});
replaceField(purchaseOrderItem, "theoretical_kg", {
  fieldname: "theoretical_kg",
  fieldtype: "Float",
  label: "Số kg barem",
  precision: 2,
  read_only: true,
  depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  description: "Kích thước × trọng lượng định mức × số cây/lá.",
});

// Các chứng từ V2 có controller sổ kho chuyên biệt, nhưng app hook vẫn cần khai để lớp validator
// ngành kiểm các Link/màu/quy cách trước khi lệnh đi vào kernel.
brief.validators.push(
  { doctype: "Cut Order", actions: ["create", "save", "submit", "cancel"] },
  { doctype: "Stock Reservation", actions: ["create", "save"] },
  { doctype: "Stock Reconciliation", actions: ["create", "save", "submit"] },
  { doctype: "Warranty Claim", actions: ["create", "save"] },
);

// ─────────────────────────── ITEM ───────────────────────────
const item = doctype("Item");

// Hai giá trị hệ thống cố định của Alumdoor vẫn nằm trong metadata để filter,
// validator và dữ liệu cũ dùng, nhưng người nhập không phải nhìn hoặc sửa chúng.
patchField(item, "item_nature", { hidden: true });
patchField(item, "is_stock_item", { hidden: true });

// QĐ-3 — khai tử biến thể. Để im là chờ người sau dùng cho màu:
// 1 mã × 24 màu × n khổ là mớ 477 mã quay lại.
dropFields(item, ["variant_of", "variant_attributes"]);

// "Luật viết hai lần rồi trôi dạt": inventory_mode khai ở CẢ Item lẫn Measurement Profile
// thì có thể mâu thuẫn (Item ghi "Nhôm cây/lá", profile ghi "Hàng thường") và không nhân nào xử được.
//
// NHƯNG xoá thẳng là gãy: ~5 trường khác (`purchase_kg_per_m2`, `min_area_sqm`, `door_type`,
// các trường quy cách trên dòng chứng từ) đều có `depends_on: doc.inventory_mode`, và `list`
// của Item cũng liệt nó. Compiler bắt đúng chỗ này.
//
// Cách đúng: giữ trường nhưng biến thành GƯƠNG — read_only + fetch_from. Một nguồn sự thật
// (Measurement Profile), một bản sao chỉ-đọc để depends_on và bộ lọc dùng. Không phải hai nguồn.
replaceField(item, "inventory_mode", {
  "//": "GƯƠNG của Measurement Profile.inventory_mode — KHÔNG sửa tay được. Nguồn sự thật là bộ theo dõi vật tư.",
  fieldname: "inventory_mode",
  fieldtype: "Data",
  label: "Kiểu quản lý tồn",
  read_only: true,
  hidden: true,
  fetch_from: "measurement_profile.inventory_mode",
  in_standard_filter: true,
});
replaceField(item, "measurement_profile", {
  "//": "NGUỒN DUY NHẤT của inventory_mode sau V2. Hàng thường vẫn phải trỏ vào profile 'Hàng thường'.",
  fieldname: "measurement_profile",
  fieldtype: "Link",
  options: "Measurement Profile",
  label: "Bộ theo dõi vật tư",
  required: true,
});

// QĐ-2 catch weight: nhôm ĐẾM bằng Cây/Lá, TÍNH TIỀN bằng Kg. Hai đơn vị ngang hàng.
addAfter(item, "stock_uom",
  {
    "//": "Bật = mọi dòng sổ mang HAI con số: actual_qty_micros và actual_weight_micros.",
    fieldname: "has_catch_weight",
    fieldtype: "Check",
    label: "Cân theo kiện (catch weight)",
  },
  {
    fieldname: "weight_uom",
    fieldtype: "Link",
    options: "UOM",
    label: "Đơn vị khối lượng",
    default: "Kg",
    depends_on: "eval:doc.has_catch_weight",
    mandatory_depends_on: "eval:doc.has_catch_weight",
  },
);

// Hệ số quy đổi TĨNH không diễn tả được nhôm: 1 cây = khổ × kg/m, mà khổ đổi từng lô
// (đo thật 6,57 → 8,61 m/cây). Hệ số thật bắt tại dòng phiếu nhập.
replaceField(item, "uom_conversions", {
  fieldname: "uom_conversions",
  fieldtype: "Table",
  options: "UOM Conversion",
  label: "Đơn vị quy đổi khác",
  depends_on: "eval:doc.default_purchase_uom != doc.stock_uom || doc.default_sales_uom != doc.stock_uom",
  description: "Chỉ khai khi đơn vị mua/bán khác đơn vị tồn.",
});

// Nhóm SP thứ 6 — có trong tờ đối chiếu (CỬA ĐỨC KÉO TAY AL70, CỬA ÚC KT/MTN)
// và 25.7 QUY TRÌNH.docx cho nó công thức RIÊNG.
replaceField(item, "door_type", {
  fieldname: "door_type",
  fieldtype: "Select",
  options: "Cửa Đức\nCửa Úc\nCửa Lưới\nCửa Đài Loan\nCửa Siêu Trường\nCửa tấm liền Úc",
  label: "Loại cửa áp công thức",
  depends_on: "eval:doc.measurement_profile",
  description: "Chọn cho thành phẩm cửa. Quyết định công thức số lá và hằng số trừ khi cắt.",
});

// Nhân hỗ trợ 2 phương pháp (valuation.ts:6) nhưng brief cũ chỉ cho chọn 1.
// Và normalizeValuationMethod:18 biến mọi giá trị lạ thành FIFO trong im lặng — M4 sẽ vá.
replaceField(item, "valuation_method", {
  fieldname: "valuation_method",
  fieldtype: "Select",
  options: "FIFO\nBình quân di động",
  label: "Phương pháp giá vốn",
  default: "FIFO",
  description: "TT99/2025 cho phép mỗi nhóm hàng một phương pháp. Đổi giữa chừng phải ghi audit — thông tư đòi nhất quán giữa các kỳ.",
});

// Alumdoor không vận hành kế toán và tính giá thành trên hồ sơ mặt hàng. Kho được
// chọn trên chứng từ thực tế; đơn vị và cách theo dõi vật tư vẫn phải nằm trên Item.
// Bỏ cả Tab Break để form không sinh tab rỗng.
dropFields(item, [
  "tab_item_accounts",
  "section_accounts",
  "reorder_levels",
  "default_warehouse",
  "inventory_account",
  "cogs_account",
  "income_account",
  "expense_account",
  "standard_rate",
  "valuation_method",
]);
replaceField(item, "section_inventory", {
  fieldname: "section_inventory",
  fieldtype: "Section Break",
  label: "Đơn vị và theo dõi",
});

// Hồ sơ vật tư chỉ còn hai lớp thông tin người dùng thực sự phải nhập. Các cờ kỹ
// thuật như lô/serial và dữ liệu nhận diện hãng vẫn có thể tồn tại trên bản ghi cũ,
// nhưng không còn là ô nhập trên form Alumdoor.
dropFields(item, [
  "brand",
  "manufacturer",
  "manufacturer_part_no",
  "default_color",
  "allowed_colors",
  "barcodes",
  "tab_item_identity",
  "tab_item_tracking",
  "section_tracking",
  "has_batch_no",
  "has_serial_no",
  "allow_negative_stock",
  "shelf_life_in_days",
  "has_catch_weight",
  "weight_uom",
]);
replaceField(item, "section_identity", {
  fieldname: "section_identity",
  fieldtype: "Section Break",
  label: "Chi tiết vật tư",
});
moveFieldsAfter(item, ["door_type", "purchase_kg_per_m2", "leaf_divisor_m"], "material_specification");

// ────────────────── MEASUREMENT PROFILE ──────────────────
const profile = doctype("Measurement Profile");
profile.label = "Bộ theo dõi vật tư";
profile["//"] = "Bộ theo dõi chỉ quyết định kho cần ghi nhận gì; thông số cố định nằm ở Quy cách kỹ thuật vật tư.";
dropFields(profile, ["theoretical_kg_per_m", "effective_width_m", "scrap_threshold_m", "kerf_mm", "require_bundle_qty"]);
if (!profile.fields.some((field) => nameOf(field) === "track_bundle_qty")) {
  addAfter(profile, "require_piece_qty", "track_bundle_qty:Check Theo dõi số bó");
}
if (!profile.fields.some((field) => nameOf(field) === "weight_tolerance_pct")) {
  addAfter(profile, "track_bundle_qty", {
    fieldname: "weight_tolerance_pct",
    fieldtype: "Float",
    label: "Ngưỡng cảnh báo lệch cân (%)",
    default: 13,
    description: "Vượt ngưỡng thì cảnh báo lúc nhập, KHÔNG chặn ghi sổ.",
  });
}

const materialSpecification = doctype("Material Specification");
if (!materialSpecification.fields.some((field) => nameOf(field) === "item_group")) {
  addAfter(materialSpecification, "spec_name", "item_group:Link(Item Group)! Nhóm sản phẩm áp dụng");
}
if (!materialSpecification.fields.some((field) => nameOf(field) === "spec_type")) {
  addAfter(materialSpecification, "item_group", "spec_type:Select(Nhôm cây/lá,Ống/trục,Tấm/Kính,Cuộn,Vật tư tuyến tính,Khác)! Loại quy cách");
}
if (!materialSpecification.fields.some((field) => nameOf(field) === "effective_width_m")) {
  addAfter(materialSpecification, "width_m", "effective_width_m:Float Bản rộng hữu dụng (m)");
}
replaceField(materialSpecification, "profile_system", {
  fieldname: "profile_system", fieldtype: "Data", label: "Hệ / dòng profile",
  depends_on: "eval:doc.spec_type == 'Nhôm cây/lá' || doc.spec_type == 'Ống/trục'",
});
replaceField(materialSpecification, "section_code", {
  fieldname: "section_code", fieldtype: "Data", label: "Phi / mã tiết diện",
  depends_on: "eval:doc.spec_type == 'Nhôm cây/lá' || doc.spec_type == 'Ống/trục'",
});
replaceField(materialSpecification, "theoretical_kg_per_m", {
  fieldname: "theoretical_kg_per_m", fieldtype: "Float", label: "Kg/m lý thuyết",
  depends_on: "eval:doc.spec_type == 'Nhôm cây/lá' || doc.spec_type == 'Ống/trục' || doc.spec_type == 'Vật tư tuyến tính'",
});
replaceField(materialSpecification, "standard_length_m", {
  fieldname: "standard_length_m", fieldtype: "Float", label: "Chiều dài chuẩn (m)",
  depends_on: "eval:doc.spec_type == 'Nhôm cây/lá' || doc.spec_type == 'Ống/trục' || doc.spec_type == 'Tấm/Kính'",
});
replaceField(materialSpecification, "width_m", {
  fieldname: "width_m", fieldtype: "Float", label: "Khổ rộng (m)",
  depends_on: "eval:doc.spec_type == 'Tấm/Kính' || doc.spec_type == 'Cuộn'",
});
replaceField(materialSpecification, "effective_width_m", {
  fieldname: "effective_width_m", fieldtype: "Float", label: "Bản rộng hữu dụng (m)",
  depends_on: "eval:doc.spec_type == 'Tấm/Kính' || doc.spec_type == 'Cuộn'",
});
replaceField(materialSpecification, "thickness_mm", {
  fieldname: "thickness_mm", fieldtype: "Float", label: "Độ dày (mm)",
  depends_on: "eval:doc.spec_type == 'Nhôm cây/lá' || doc.spec_type == 'Ống/trục' || doc.spec_type == 'Tấm/Kính' || doc.spec_type == 'Cuộn'",
});
replaceField(materialSpecification, "scrap_threshold_m", {
  fieldname: "scrap_threshold_m", fieldtype: "Float", label: "Ngưỡng phế liệu (m)",
  depends_on: "eval:doc.spec_type == 'Nhôm cây/lá' || doc.spec_type == 'Ống/trục' || doc.spec_type == 'Cuộn' || doc.spec_type == 'Vật tư tuyến tính'",
});
materialSpecification.list = ["spec_code", "spec_name", "item_group", "spec_type", "theoretical_kg_per_m", "standard_length_m"];
materialSpecification.search = ["spec_code", "spec_name", "item_group", "profile_system"];

// ────────────────── PURCHASE RECEIPT ──────────────────
const pr = doctype("Purchase Receipt");
addAfter(pr, "note",
  {
    "//": "media-capture: nhập kho là điểm chụp BẮT BUỘC. Ảnh gắn chứng từ đã chốt là bất biến.",
    fieldname: "goods_photo",
    fieldtype: "Attach Image",
    label: "Ảnh hàng nhận",
    required: true,
  },
  { fieldname: "supplier_note_photo", fieldtype: "Attach Image", label: "Ảnh phiếu giao của NCC" },
);

const pri = doctype("Purchase Receipt Item");
replaceField(pri, "color", {
  fieldname: "color",
  fieldtype: "Link",
  options: "Item Color",
  label: "Màu",
  depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' || doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' || doc.inventory_mode == 'Thành phẩm theo m2'",
});
replaceField(pri, "set_count", {
  fieldname: "set_count",
  fieldtype: "Int",
  label: "Số cái/bộ",
  default: 1,
  depends_on: "eval:doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  mandatory_depends_on: "eval:doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  non_negative: true,
  description: "Số tấm hoặc số bộ cửa thực nhận. Dùng cùng Cao × Rộng để tính tổng diện tích thực.",
});
replaceField(pri, "actual_weight_kg", {
  "//": "QĐ-2: với hàng catch weight đây là số lượng tồn thứ hai; với cửa/tấm đây là số cân để đối chiếu TL kg/m².",
  fieldname: "actual_weight_kg",
  fieldtype: "Float",
  label: "Tổng kg thực cân",
  depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' || doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  non_negative: true,
  description: "Nhôm cây/lá: số kg thực nhận đi vào sổ kho. Cửa/tấm: số kg cân để đối chiếu TL thực theo m²; không bắt buộc nếu NCC không cân.",
});
replaceField(pri, "actual_kg_per_m", {
  fieldname: "actual_kg_per_m",
  fieldtype: "Float",
  label: "TL thực (kg/m)",
  read_only: true,
  depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  description: "Nhôm cây/lá: Tổng kg ÷ (chiều dài một cây × số cây/lá). Chỉ để đối chiếu, không nhập tay.",
});
addAfter(pri, "actual_kg_per_m", {
  "//": "TL theo diện tích thật, tách riêng khỏi kg/m của nhôm để không trộn hai đơn vị.",
  fieldname: "actual_kg_per_sqm",
  fieldtype: "Float",
  label: "TL thực (kg/m²)",
  read_only: true,
  depends_on: "eval:(doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2') && doc.actual_weight_kg > 0",
  description: "Tự tính = Tổng kg thực cân ÷ (Cao × Rộng × Số cái/bộ). Cao và Rộng nhập theo mét; kết quả chỉ để đối chiếu.",
});
pri.list = [
  "item_code", "color",
  "height_m", "width_m", "set_count",
  "length_m", "uom", "qty", "qty_bundle", "qty_bar",
  "actual_weight_kg", "actual_kg_per_m", "actual_kg_per_sqm",
  "rate", "amount", "so_no", "note",
];
addAfter(pri, "warehouse",
  {
    "//": [
      "TÊN TRƯỜNG COPY ĐÚNG CỦA NỀN TẢNG (`Stock Entry Detail.serial_and_batch_bundle`).",
      "buildTrackedStockLines đọc đúng tên này (tracking.ts:29); đặt tên khác là app tự cắt",
      "đường nối tới cơ chế lô của nền tảng — chính là gốc của quyển sổ thứ hai ở bản cũ.",
    ],
    fieldname: "serial_and_batch_bundle",
    fieldtype: "Link",
    options: "Serial and Batch Bundle",
    label: "Lô nhận (Serial/Batch Bundle)",
  },
  {
    fieldname: "condition",
    fieldtype: "Select",
    options: "Thô\nĐã sơn\nLỗi",
    label: "Tình trạng",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  },
  {
    "//": "Sơn và dập là HAI chiều độc lập — 'đã sơn + chưa dập' là tổ hợp có thật trong bảng giá NCC.",
    fieldname: "is_stamped",
    fieldtype: "Select",
    options: "Có\nKhông",
    label: "Dập",
    required: true,
    default: "Không",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
    description: "Bắt buộc chọn rõ Có hoặc Không; lưu cùng lô nhận để đối chiếu giá nhà cung cấp.",
  },
  {
    fieldname: "theoretical_kg",
    fieldtype: "Float",
    label: "Kg lý thuyết (barem)",
    read_only: true,
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
    description: "khổ × kg/m của quy cách kỹ thuật × số cây. Dùng để đối chiếu cân, không vào sổ.",
  },
  {
    fieldname: "weight_variance_pct",
    fieldtype: "Float",
    label: "Lệch cân (%)",
    read_only: true,
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
    description: "Vượt ngưỡng của bộ theo dõi thì cảnh báo, KHÔNG chặn ghi sổ.",
  },
);

// ────────────────── SALES CHILD GRID ──────────────────
// GRID-03 · current Selling authority projection.
// Pricing Rule + Sales Option + Sales Package are server authorities. This generator only
// materialises the operator-visible fields that the AlumDoor metadata-owned grid must expose;
// no commercial formula or percentage policy is evaluated here.
const ensureSalesLineField = (line, anchor, field) => {
  const existingIndex = line.fields.findIndex((candidate) => nameOf(candidate) === field.fieldname);
  if (existingIndex >= 0) {
    const current = parseField(line.fields[existingIndex], existingIndex, line.name);
    line.fields[existingIndex] = { ...current, ...field };
    return;
  }
  addAfter(line, anchor, field);
};

const tamLienUcPolicy = CUTTING_POLICIES.find((entry) => entry.code === "CP-CUA-TAM-LIEN-UC");
if (!tamLienUcPolicy) throw new Error("Catalog thiếu CP-CUA-TAM-LIEN-UC");
const tamLienRayTypes = [...new Set(
  tamLienUcPolicy.rules.map((entry) => entry.conditions.ray_type).filter(Boolean),
)];
if (tamLienRayTypes.length < 2) throw new Error("CP-CUA-TAM-LIEN-UC chưa khai đủ lựa chọn ray theo dòng");
const tamLienRayOptions = `\n${tamLienRayTypes.join("\n")}`;

// `sales_option` KHÔNG được tạo ở đây nữa.
//
// Khối cũ dựng một Link tới `Sales Option` cho ba dòng bán, rồi khối hội tụ ở cuối file xoá
// đúng trường đó đi — code chết, và tệ hơn là code chết TRỎ TỚI một doctype đã khai tử. Ai
// đọc lướt sẽ tưởng Alumdoor còn dùng Sales Option.
//
// Cách giao (Tách món / Trọn bộ) là thứ dòng bán thật sự cần, và nó được khai ở khối hội tụ
// dưới dạng `sales_mode` — một Select hai giá trị, không Link tới doctype nào.

// 0120 makes these monetary projections server-owned on Quotation/Sales Order. They are display
// outputs only; discount_percentage remains an audit/compatibility field and is never editable.
for (const childName of ["Quotation Item", "Sales Order Item"]) {
  const line = doctype(childName);
  ensureSalesLineField(line, "rate", {
    fieldname: "discount_amount",
    fieldtype: "Currency",
    label: "Tiền CK",
    read_only: true,
    in_list_view: true,
    description: "Server-authoritative monetary discount for this line.",
  });
  ensureSalesLineField(line, "discount_amount", {
    fieldname: "adjustment_amount",
    fieldtype: "Currency",
    label: "Phụ thu",
    read_only: true,
    in_list_view: true,
    description: "Server-authoritative Pricing Rule adjustments for this line.",
  });
  ensureSalesLineField(line, "adjustment_amount", {
    fieldname: "net_amount",
    fieldtype: "Currency",
    label: "Thành tiền",
    read_only: true,
    in_list_view: true,
    description: "Gross minus policy discount plus adjustments.",
  });

  const discountIndex = line.fields.findIndex((field) => nameOf(field) === "discount_percentage");
  if (discountIndex >= 0) {
    const discount = parseField(line.fields[discountIndex], discountIndex, line.name);
    line.fields[discountIndex] = {
      ...discount,
      hidden: true,
      read_only: true,
      in_list_view: false,
      surface: "internal",
    };
  }

  replaceField(line, "length_m", {
    fieldname: "length_m",
    fieldtype: "Float",
    label: "Dài một cây/đoạn (m)",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre')",
    mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre')",
    description: "Chiều dài của một cây/đoạn, không phải tổng số mét.",
  });
  replaceField(line, "qty_bar", {
    fieldname: "qty_bar",
    fieldtype: "Float",
    label: "Số cây/đoạn",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre' || doc.uom == 'Cây' || doc.uom == 'cay' || doc.uom == 'Lá' || doc.uom == 'la' || doc.uom == 'Đoạn' || doc.uom == 'doan')",
    mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre' || doc.uom == 'Cây' || doc.uom == 'cay' || doc.uom == 'Lá' || doc.uom == 'la' || doc.uom == 'Đoạn' || doc.uom == 'doan')",
    description: "Bán theo Mét: hệ thống lấy chiều dài × số cây. Bán theo Cây/Lá: hệ thống lấy chính số này.",
  });
  replaceField(line, "qty", {
    fieldname: "qty",
    fieldtype: "Float",
    label: "SL tính tiền",
    required: true,
    read_only_depends_on: "eval:(doc.inventory_mode == 'Thành phẩm theo m2' && (doc.uom == 'm2' || doc.uom == 'M2' || doc.uom == 'm²' || doc.uom == 'Bộ')) || (doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'Cây' || doc.uom == 'Lá'))",
    description: "Ô máy tính theo quy cách của dòng: cửa = m² đã chốt × số bộ; ray/trục = dài × số cây; phụ kiện = số lượng theo ĐVT bán.",
  });
  line.list = [
    "item_code", "sales_mode", "color", "width_m", "height_m", "set_count", "has_butterfly_bracket",
    "length_m", "qty_bar", "uom", "qty", "rate", "discount_amount", "adjustment_amount", "net_amount",
  ];
}

brief.doctypes.push({
  name: "BOM Actual Component", child: true, label: "Vật tư BOM thực tế", group: "Sản xuất", naming: "autoincrement",
  fields: [
    "component_key:Data*! Slot BOM",
    "item_code:Link(Item)! Vật tư thực tế",
    "qty:Float! Số lượng / một bộ",
    "source_row:Int Dòng ĐM",
    "note:Small Text Ghi chú",
  ],
  permissions: { "Chủ xưởng": "rwc", "Sản xuất": "rwc", "Kinh doanh": "rwc" },
});
ensureSalesLineField(doctype("Sales Order Item"), "has_butterfly_bracket", {
  fieldname: "ray_type",
  fieldtype: "Select",
  options: tamLienRayOptions,
  label: "Loại ray",
  depends_on: "eval:doc.door_type == 'Cửa tấm liền Úc'",
  mandatory_depends_on: "eval:doc.door_type == 'Cửa tấm liền Úc'",
  description: "Chọn theo từng dòng đơn. Server dùng Cutting Policy/Geometry Profile đang áp để tính rộng cắt; không dùng số trừ hardcode trên UI.",
  surface: "expanded",
});
ensureSalesLineField(doctype("Sales Order Item"), "set_count", {
  fieldname: "bom_actual_components", fieldtype: "Table", options: "BOM Actual Component", label: "Vật tư BOM thực tế",
  description: "Nhập số lượng THỰC TẾ CHO MỘT BỘ. Production tách từng bộ thành một line; thiếu slot mà BOM Template yêu cầu thì chặn sinh BOM.",
});
note("Sales Order Item: +ray_type theo dòng + BOM Actual Component theo một bộ");

// ────────────────── BATCH (doctype NỀN TẢNG) ──────────────────
// KHÔNG dựng doctype lô riêng: nền tảng đã có `Batch` (module Stock, autoname field:batch_id).
// Bản cũ đẻ `Aluminium Lot` song song — chính là quyển sổ thứ hai. V2 phủ Custom Field lên `Batch`.
//
// Ba thứ CẤM đặt ở đây, ghi lại để người sau không thêm "cho tiện":
//   remaining_qty / sheet_count / remaining_kg  → số lượng LUÔN cộng từ sổ (QĐ-1)
//   warehouse (vị trí hiện tại)                 → lô nằm hai kho cùng lúc được; đọc từ sổ
//   bất kỳ trường giá vốn nào                   → Forge không có quyền theo TRƯỜNG; đặt lên đây
//                                                 là Sản xuất đọc được ⇒ thủng phân quyền im lặng
brief.customFields = {
  Batch: [
    "color:Link(Item Color) Màu",
    "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng",
    "is_stamped:Check Đã dập",
    "length_m:Float Khổ (m)",
    "intake_kg:Float Kg thực cân lúc nhập",
    "received_warehouse:Link(Warehouse) Kho nhập ban đầu",
    "is_offcut:Check Là đầu thừa",
    "parent_batch:Link(Batch) Cắt ra từ lô",
    "cut_generation:Int Đời cắt",
    "intake_note:Small Text Nhập / ghi chú",
  ],
};
note(`customFields: Batch +${brief.customFields.Batch.length} trường (không dựng doctype lô riêng)`);

// ────────────────── WAREHOUSE ──────────────────
const wh = doctype("Warehouse");
// Dạng rút gọn của brief: `field:Select(a,b,c)=(mặc định) Nhãn` — khỏi escape xuống dòng.
// Chỉ 'Kho chính' vào tồn khả dụng; đầu thừa/phế/gia công bị LOẠI (chuẩn ngành cắt thanh).
addAfter(wh, "is_group",
  "stock_role:Select(Kho chính,Kho đầu thừa,Kho phế,Kho gửi gia công)=(Kho chính) Vai trò kho");
// `keeper` là Data tự do ⇒ không scope quyền hay gửi thông báo cho ai được.
replaceField(wh, "keeper", "keeper:Link(User) Thủ kho phụ trách");

// ────────────────── SUPPLIER ──────────────────
addAfter(doctype("Supplier"), "payment_terms",
  {
    "//": "Dung sai giao hàng ±5% theo sổ yêu cầu 30/07. Khai theo NCC vì mỗi bên một thói quen.",
    fieldname: "receipt_tolerance_pct",
    fieldtype: "Float",
    label: "Dung sai nhận hàng (%)",
    default: 5,
  },
);

// ────────────────── ITEM GROUP ──────────────────
addAfter(doctype("Item Group"), "default_expense_account",
  // TT99/2025 cho phép mỗi nhóm hàng một phương pháp giá. Không có trường này thì câu
  // "Item kế thừa phương pháp từ nhóm" trong ledger là nói suông.
  "default_valuation_method:Select(FIFO,Bình quân di động) Phương pháp giá vốn mặc định",
  "default_measurement_profile:Link(Measurement Profile) Bộ theo dõi mặc định",
);

// ────────────────── CUTTING POLICY ──────────────────
// Bản cũ ĐÃ ĐÚNG 14 trường (2 *_width_basis, 2 *_cut_deduction_m, butterfly, 3 *_sales_basis,
// manual_pull, purchase_formula + 2 basis, priority, disabled) — GIỮ NGUYÊN HẾT.
// Thiếu đúng hai chiều: LOẠI RAY và CHIA LÁ.
const cp = doctype("Cutting Policy");
if (!cp.fields.some((field) => nameOf(field) === "kerf_mm")) {
  addAfter(cp, "butterfly_cut_deduction_m", {
    "//": "Bề rộng đường cắt thuộc công thức cắt, không thuộc cách theo dõi tồn.",
    fieldname: "kerf_mm",
    fieldtype: "Float",
    label: "Bề rộng lưỡi cắt (mm)",
    default: 3,
    description: "Trừ bề rộng lưỡi cắt × số nhát khỏi chiều dài dùng được.",
  });
}

// Sheet GHI CHÚ cho hai bộ hằng số theo ray: Đức U75 `RCL=RPBR−0,08` vs U100 `−0,09`;
// ĐL+Lưới `RLL+0,11` vs `+0,17`. Một `retail_cut_deduction_m` không diễn tả được cả hai.
// `item_group` không thay được vì loại ray là lựa chọn của TỪNG ĐƠN, không phải thuộc tính nhóm hàng.
replaceField(cp, "door_type",
  "door_type:Select(Cửa Đức,Cửa Úc,Cửa Lưới,Cửa Đài Loan,Cửa Siêu Trường,Cửa tấm liền Úc)! Loại cửa");
addAfter(cp, "door_type",
  "ray_type:Select(U75,U100,Ray hộp/đơn U76,Ray sắt U70,Không dùng ray)!=(U75) Loại ray");
addAfter(cp, "ray_type",
  "geometry_profile:Link(Geometry Profile)! Bộ quy cách hình học",
  "geometry_rules:Table(Cutting Policy Rule) Quy tắc hình học");

// Phần CHIA LÁ — bản cũ không có ở đâu cả (xác nhận trong tài liệu phiên trước).
addAfter(cp, "butterfly_cut_deduction_m",
  "height_pb_offset_m:Float=(0.5) Cao phủ bì = cao lọt lòng cộng (m)",
  "leaf_formula:Select(Kiểu Đức,Kiểu Úc,Kiểu tấm liền Úc,Kiểu Đài Loan Lưới)! Dạng công thức chia lá",
  {
    "//": [
      "0,13 CHỈ cho Cửa Đức. Các dòng khác ĐỂ TRỐNG — chủ xưởng chốt 30/07: 'nhiều cái không trừ'.",
      "Đặt 0 cũng là ĐOÁN, không hơn gì đoán 0,13. Trống thì chặn chia lá dòng đó kèm câu hỏi.",
    ],
    fieldname: "leaf_height_deduction_m",
    fieldtype: "Float",
    label: "Trừ chiều cao trước khi chia (m)",
  },
  "leaf_divisor_source:Select(Bản lá của bộ quy cách,Hằng số của chính sách)!=(Bản lá của bộ quy cách) Ước số chia lấy từ",
  "leaf_divisor_const:Float Ước số chia (hằng số) — Úc 0,465 · tấm liền Úc 0,068",
  "leaf_rounding:Select(Ngưỡng trừ-một-lá,Nấc 0-0.3-0.7-1,Làm tròn xuống)!=(Ngưỡng trừ-một-lá) Cách làm tròn số lá",
  {
    "//": [
      "Chủ xưởng chốt 30/07: TRỪ MỘT LÁ TRƯỚC, LÀM TRÒN SAU, ngưỡng 0,6 trên phần thập phân.",
      "  raw = (CPB − leaf_height_deduction_m) ÷ divisor",
      "  after = raw − 1",
      "  số lá = frac(after) >= 0,6 ? ceil(after) : floor(after)",
      "Chính thứ tự 'trừ rồi mới tròn' giải thích vì sao 52,6 ra 52 chứ không ra 53.",
      "LƯU Ý: ghi chú 'ngưỡng 20,5' trong sheet GHI CHÚ là ngưỡng TUYỆT ĐỐI trên giá trị —",
      "luật 0,6 này thắng theo lời chủ xưởng. Đừng sửa ngược khi đọc lại sheet.",
    ],
    fieldname: "leaf_round_threshold",
    fieldtype: "Float",
    label: "Ngưỡng làm tròn (phần thập phân)",
    default: 0.6,
  },
  "leaf_variants:Table(Leaf Variant) Biến thể theo loại motor (cửa Úc)",
);

// Child doctype cho 3 biến thể motor của cửa Úc: (CPB ÷ 0,465) + k, k = 2 / 1,5 / 1,3.
brief.doctypes.push({
  "//": "Cửa Úc: số lá = (CPB ÷ ước số) + addend, addend đổi theo loại motor. Làm tròn về nấc 0/0.3/0.7/1.",
  name: "Leaf Variant",
  child: true,
  label: "Biến thể chia lá",
  group: "Danh mục",
  naming: "autoincrement",
  title: "variant_label",
  list: ["variant_label", "addend"],
  fields: [
    "variant_label:Data*! Biến thể",
    "addend:Float! Cộng thêm",
    "note:Data Ghi chú",
  ],
  permissions: { "Chủ xưởng": "rwc", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
});
note("Cutting Policy: +9 trường (ray_type, chia lá) · +doctype con Leaf Variant");

brief.doctypes.push({
  name: "Cutting Policy Rule", child: true, label: "Quy tắc hình học", group: "Sản xuất", naming: "autoincrement",
  fields: [
    "rule_code:Data*! Mã quy tắc",
    "target_field:Link(Geometry Field)! Trường kết quả",
    "source_field:Link(Geometry Field)! Trường nguồn",
    "operator:Select(COPY,SUBTRACT,ADD)!=(SUBTRACT) Phép tính",
    "operand_m:Float=(0) Giá trị cộng/trừ (m)",
    { fieldname: "customer_group", fieldtype: "Select", options: "\nĐại lý\nLẻ", label: "Nhóm khách" },
    { fieldname: "ray_type", fieldtype: "Select", options: "\nU75\nU100\nRay hộp/đơn U76\nRay sắt U70\nKhông dùng ray", label: "Loại ray" },
    "has_butterfly_bracket:Check Có bắn bướm",
    "priority:Int=(0) Ưu tiên",
    "sequence:Int=(10) Thứ tự",
    "note:Small Text Ghi chú nguồn",
  ],
  permissions: { "Chủ xưởng": "rwc", "Kinh doanh": "r", "Sản xuất": "r" },
});
for (const policy of CUTTING_POLICIES) {
  const fixture = brief.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === policy.name);
  if (!fixture) throw new Error(`Cutting Policy fixture missing: ${policy.name}`);
  Object.assign(fixture.data, cuttingPolicyFixtureData(policy));
}
for (const legacyName of ["Cửa Đức — khách lẻ", "Cửa Đức — đại lý"]) {
  const fixture = brief.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === legacyName);
  if (!fixture) throw new Error(`Cutting Policy legacy fixture missing: ${legacyName}`);
  fixture.data.geometry_profile = "GP-CUA-DUC";
  fixture.data.geometry_rules = [];
}
note(`Cutting Policy: gắn Geometry Profile + ${CUTTING_POLICIES.reduce((sum, policy) => sum + policy.rules.length, 0)} geometry rules canonical`);

// ────────────────── BOM TEMPLATE — CẤU HÌNH → BOM INSTANCE ──────────────────
brief.doctypes.push({
  "name": "BOM Component Rule",
  "child": true,
  "label": "Quy tắc thành phần BOM",
  "group": "Sản xuất",
  "naming": "autoincrement",
  "fields": [
    "rule_code:Data*! Mã quy tắc",
    "component_key:Data Khóa thành phần",
    "item_code:Link(Item)! Vật tư",
    "stock_uom:Link(UOM) Đơn vị tồn",
    "conditions_json:Code Điều kiện JSON",
    "priority:Int=(0) Ưu tiên",
    "sequence:Int=(0) Thứ tự",
    "quantity_formula_json:Code! Công thức số lượng JSON",
    "source_row:Int Dòng nguồn",
    "source_uom:Data ĐVT nguồn",
    "source_formula:Small Text Công thức nguồn",
    "note:Small Text Ghi chú"
  ],
  "permissions": {
    "Chủ xưởng": "rwc",
    "Sản xuất": "rwc",
    "Kinh doanh": "r"
  }
});
brief.doctypes.push({
  "name": "BOM Template",
  "label": "Mẫu BOM",
  "group": "Sản xuất",
  "naming": "autoincrement",
  "fields": [
    "template_code:Data*! Mã mẫu BOM",
    "item_code:Link(Item)! Thành phẩm",
    "conditions_json:Code Điều kiện áp dụng JSON",
    "priority:Int=(0) Ưu tiên",
    "disabled:Check=(0) Ngừng dùng",
    // `COMPOSITION` = danh sách cấu thành dùng trên ĐƠN BÁN, không phải định mức sản xuất.
    //
    // `scripts/lib/alumdoor-sales-bom-composition.mjs` ghi giá trị này từ trước, nhưng options
    // chỉ có ba giá trị kia, và `generic-controller.ts:170` TỪ CHỐI giá trị Select ngoài
    // options (kể cả Administrator — `normalizeValue` không có cửa admin). Hệ quả đo được:
    // `import-alumdoor-sales-bom-composition-local.mjs` ném ở POST đầu tiên, 0 template cấu
    // thành nào tồn tại trong D1, và `alumdoor.sales.preview_bom_requirements` không xổ được
    // cấu thành cho BẤT KỲ mặt hàng nào. Bộ kiểm không thấy vì nó chỉ so chuỗi trong bộ nhớ.
    //
    // Phải là giá trị RIÊNG chứ không dùng lại `DEFERRED`: bộ nhập template sản xuất chỉ cho
    // nghỉ hưu bản `source_status === 'DEFERRED'`, gộp hai loại là nó tắt nhầm template bán.
    "source_status:Select(READY,READY_WITH_ACTUALS,DEFERRED,COMPOSITION)!=(DEFERRED) Trạng thái chuẩn hóa nguồn",
    "source_ref:Data Tham chiếu nguồn",
    "deferred_components_json:Code Thành phần chờ chuẩn hóa JSON",
    "required_context_fields_json:Code Ngữ cảnh bắt buộc JSON",
    "required_component_keys_json:Code Thành phần bắt buộc JSON",
    "required_actual_component_keys_json:Code Slot vật tư thực tế bắt buộc JSON",
    "actual_component_allowed_items_json:Code Allowlist vật tư actual theo slot JSON",
    "component_rules:Table(BOM Component Rule)! Quy tắc thành phần",
    "note:Small Text Ghi chú"
  ],
  "permissions": {
    "Chủ xưởng": "rwc",
    "Sản xuất": "rwc",
    "Kinh doanh": "r"
  }
});
const bomDoctype = doctype("Bill of Materials");
for (const spec of [
  "bom_template:Link(BOM Template) Mẫu BOM nguồn",
  "bom_template_code:Data Mã mẫu BOM",
  "bom_fingerprint:Data Dấu vân tay cấu hình",
  "generated_by_configurator:Check=(0) BOM sinh từ cấu hình",
  "configuration_snapshot:Code Snapshot cấu hình"
]) {
  if (!bomDoctype.fields.some((entry) => nameOf(entry) === nameOf(spec))) bomDoctype.fields.push(spec);
}
note("BOM Template: +doctype mẫu/quy tắc + metadata materialization trên Bill of Materials");
for (const fixture of bomSourceFixtureRows()) {
  const existing = brief.fixtures.find((row) => row.type === fixture.type && row.name === fixture.name);
  if (existing) existing.data = fixture.data;
  else brief.fixtures.push(fixture);
}
note(`BOM Template nguồn: ${bomSourceFixtureRows().length} fixture catalog`);

// ────────────────── D1: rate_uom — CHỐNG ĐƠN VỊ NGẦM ──────────────────
// value = qty × rate ở controllers.ts:221. qty của nhôm là số CÂY, còn NCC báo giá đ/KG.
// Nhập 200 cây / 1.200 kg / 100.000 đ/kg => ghi 20tr thay vì 120tr. Sai 6 lần, sổ vẫn cân.
// Khai rate_uom để không còn đơn vị ngầm; nhân đọc nó mà quyết nhân với qty hay với khối lượng.
addAfter(pri, "rate",
  "rate_uom:Link(UOM) ĐVT của đơn giá — mặc định theo ĐVT khối lượng nếu hàng cân theo kiện");

// ────────────────── D6: 3 danh mục FK còn thiếu ──────────────────
brief.doctypes.push(
  {
    "//": "Chip lý do khi huỷ/đảo chứng từ. screen-catalog: bước LÙI bắt buộc chọn, không cho bỏ trống.",
    name: "Lý do huỷ",
    label: "Lý do huỷ",
    icon: "circle-slash",
    group: "Danh mục",
    naming: "field:reason_code",
    title: "reason_name",
    list: ["reason_code", "reason_name", "applies_to_doctype", "disabled"],
    search: ["reason_code", "reason_name"],
    fields: [
      "reason_code:Data*! Mã lý do",
      "reason_name:Data! Tên lý do",
      "applies_to_doctype:Select(Tất cả,Phiếu nhập,Phiếu xuất,Phiếu kho,Phiếu cắt,Kiểm kê)!=(Tất cả) Áp cho chứng từ",
      "sort_order:Int=(0) Thứ tự",
      "disabled:Check Ngừng dùng",
    ],
    permissions: { "Chủ xưởng": "rwc", "Thủ kho": "r", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
  },
  {
    "//": "TT99/2025 đòi phân loại nguyên nhân RỒI MỚI hạch toán — nên đây là danh mục, không phải ô ghi chú.",
    name: "Nguyên nhân chênh lệch",
    label: "Nguyên nhân chênh lệch",
    icon: "scale",
    group: "Danh mục",
    naming: "field:reason_code",
    title: "reason_name",
    list: ["reason_code", "reason_name", "variance_kind", "disabled"],
    search: ["reason_code", "reason_name"],
    fields: [
      "reason_code:Data*! Mã nguyên nhân",
      "reason_name:Data! Tên nguyên nhân",
      "variance_kind:Select(Thừa,Thiếu,Cả hai)!=(Cả hai) Áp cho chênh lệch",
      "sort_order:Int=(0) Thứ tự",
      "disabled:Check Ngừng dùng",
    ],
    permissions: { "Chủ xưởng": "rwc", "Thủ kho": "r", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
  },
);

// Bề mặt/Màu vật tư (Surface Finish, Surface Finish Scope, Item Color Scope, Item Color với
// field `surface_finish`) giờ khai THẲNG trong base alumdoor.json — 2026-08-16 hội tụ kiến
// trúc Bề mặt+Màu, base và v2 dùng chung một schema, build script không còn cần mutate field
// `finish`/`applies_to` ở đây nữa (base không còn hai field đó).
note("D6: +2 danh mục (Lý do huỷ, Nguyên nhân chênh lệch)");

// ══════════════ 3 CHỨNG TỪ MỚI ══════════════
const perm = { "Chủ xưởng": "rwcsxa", "Thủ kho": "rwcsxa", "Sản xuất": "rwcsxa", "Kế toán": "r" };

brief.doctypes.push(
  {
    "//": [
      "Thay `Aluminium Cut`. Ban cũ thiếu 6 thứ: không ghi sổ kho, không kg tiêu hao, không kerf,",
      "không sinh đầu thừa, một phiếu chỉ một lô, voucher_no là Data tự do.",
      "HAI bundle ngược chiều — copy khuôn `Stock Entry` mục đích Manufacture (bundle trên DÒNG",
      "cho vật tư tiêu hao + bundle trên ĐẦU PHIẾU cho thành phẩm nhập kho).",
    ],
    name: "Cut Order",
    label: "Phiếu cắt nhôm",
    icon: "scissors",
    group: "Sản xuất",
    naming: "CN-.YYYY.-#####",
    // `name` la ten ban ghi tu sinh, KHONG phai field khai — compiler tu choi. Dung field that.
    title: "so_reference",
    submittable: true,
    list: ["cut_on", "cutting_policy", "customer", "cut_state"],
    search: ["so_reference", "customer"],
    fields: [
      "cut_on:Datetime!=(Now) Thời điểm cắt",
      "cutting_policy:Link(Cutting Policy)! Công thức cửa",
      "customer:Link(Customer) Khách hàng",
      "so_reference:Data Số chứng từ đơn hàng",
      "items:Table(Cut Order Item)! Dòng cắt",
      "cut_state:Select(Đã cắt,Đã hoàn cắt,Đã trả hàng)!=(Đã cắt) Trạng thái",
      "cancel_reason:Link(Lý do huỷ) Lý do hoàn/trả",
      "note:Small Text Ghi chú",
    ],
    permissions: perm,
  },
  {
    name: "Cut Order Item",
    child: true,
    label: "Dòng phiếu cắt",
    group: "Sản xuất",
    naming: "autoincrement",
    title: "item_code",
    list: ["item_code", "cut_width_m", "sheets_cut", "offcut_length_m"],
    fields: [
      "serial_and_batch_bundle:Link(Serial and Batch Bundle)! Lô đem cắt (bundle Outward)",
      {
        "//": "Mỗi dòng có lô mẹ và kho đầu thừa riêng; đặt trên đầu phiếu làm mất quan hệ khi cắt nhiều mã/kho.",
        fieldname: "offcut_bundle",
        fieldtype: "Link",
        options: "Serial and Batch Bundle",
        label: "Bundle nhập đầu thừa",
        read_only: true,
      },
      "item_code:Link(Item)! Mã nhôm",
      { fieldname: "source_warehouse", fieldtype: "Link", options: "Warehouse", label: "Kho lô mẹ", read_only: true },
      "source_length_m:Float! Khổ cây (m)",
      "cut_width_m:Float! Rộng cắt lá (m)",
      "sheets_cut:Float! Số lá cắt",
      "cuts_count:Int Số nhát cắt",
      "kerf_total_m:Float~- Tổng kerf (m)",
      "kg_consumed:Float Kg tiêu hao",
      "kg_weighed:Float Kg cân thật lúc xuất",
      "offcut_length_m:Float~- Đầu thừa (m)",
      "scrap_m:Float Phế bỏ hẳn (m)",
      { fieldname: "stock_value_consumed_minor", fieldtype: "Int", label: "Giá trị lô đã trừ (minor)", hidden: true, read_only: true },
      { fieldname: "offcut_stock_value_minor", fieldtype: "Int", label: "Giá trị đầu thừa (minor)", hidden: true, read_only: true },
      { fieldname: "cut_product_value_minor", fieldtype: "Int", label: "Giá trị phần đã cắt (minor)", hidden: true, read_only: true },
      { fieldname: "kg_consumed_micros", fieldtype: "Int", label: "Kg tiêu hao (micros)", hidden: true, read_only: true },
      { fieldname: "offcut_weight_micros", fieldtype: "Int", label: "Kg đầu thừa (micros)", hidden: true, read_only: true },
      { fieldname: "cut_product_weight_micros", fieldtype: "Int", label: "Kg phần đã cắt (micros)", hidden: true, read_only: true },
      "note:Data Ghi chú",
    ],
    permissions: perm,
  },
  {
    "//": "Giữ chỗ theo (mã · màu · tình trạng · KHỔ TỐI THIỂU) — KHÔNG khoá lô cụ thể, vì khoá lô là phá cơ chế chọn lô tối ưu lúc cắt.",
    name: "Stock Reservation",
    label: "Giữ chỗ tồn",
    icon: "lock",
    group: "Kho",
    naming: "GC-.YYYY.-#####",
    title: "item_code",
    list: ["item_code", "color", "min_length_m", "qty_reserved", "state"],
    search: ["item_code", "source_name"],
    fields: [
      "item_code:Link(Item)! Mã nhôm",
      "color:Link(Item Color) Màu (trống = mọi màu)",
      "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng (trống = mọi tình trạng)",
      "min_length_m:Float! Khổ tối thiểu (m)",
      "warehouse:Link(Warehouse) Kho (trống = mọi kho chính)",
      "qty_reserved:Float! Số lá giữ",
      "source_doctype:Select(Work Order,Sales Order,Cut Order)! Giữ cho",
      "source_name:Data! Số chứng từ nguồn",
      "reserved_at:Datetime!=(Now) Giữ lúc",
      "expires_at:Datetime Hết hạn",
      "state:Select(Đang giữ,Đã dùng,Đã nhả,Hết hạn)!=(Đang giữ) Trạng thái",
      "released_reason:Link(Lý do huỷ) Lý do nhả",
    ],
    permissions: { "Chủ xưởng": "rwcsxa", "Kế toán": "rwc", "Thủ kho": "r", "Sản xuất": "r", "Kinh doanh": "r" },
  },
  {
    "//": "CHỤP số sổ tại snapshot_at rồi mới đếm — nếu so với sổ lúc bấm ghi thì mọi giao dịch phát sinh giữa chừng thành chênh lệch giả.",
    name: "Stock Reconciliation",
    label: "Kiểm kê kho",
    icon: "clipboard-check",
    group: "Kho",
    naming: "KK-.YYYY.-####",
    title: "warehouse",
    submittable: true,
    list: ["warehouse", "snapshot_at", "counted_by", "recon_state"],
    search: ["warehouse"],
    fields: [
      "warehouse:Link(Warehouse)! Kho kiểm kê",
      "scope:Select(Toàn kho,Theo nhóm hàng,Theo mã hàng)!=(Toàn kho) Phạm vi",
      "item_group:Link(Item Group) Nhóm hàng",
      "item_code:Link(Item) Mã hàng",
      "snapshot_at:Datetime!=(Now) Thời điểm chốt số sổ",
      "counted_by:Link(User)! Người đếm",
      "witnessed_by:Link(User) Người chứng kiến",
      "items:Table(Stock Reconciliation Item)! Dòng đếm",
      // `status` la TEN BI CHIEM — kernel tu quan (documents.status). Ban cu dung `cut_state`
      // chinh vi ly do nay; dat ten rieng theo cung quy uoc.
      "recon_state:Select(Nháp,Đang đếm,Chờ duyệt,Đã ghi sổ,Đã huỷ)!=(Nháp) Trạng thái",
      "cancel_reason:Link(Lý do huỷ) Lý do huỷ",
      "note:Small Text Ghi chú",
    ],
    permissions: { "Chủ xưởng": "rwcsxa", "Thủ kho": "rwc", "Kế toán": "rwcs", "Sản xuất": "r", "Kinh doanh": "r" },
  },
  {
    name: "Stock Reconciliation Item",
    child: true,
    label: "Dòng kiểm kê",
    group: "Kho",
    naming: "autoincrement",
    title: "item_code",
    list: ["item_code", "book_qty", "counted_qty", "variance_qty", "variance_reason"],
    fields: [
      "item_code:Link(Item)! Mã hàng",
      { fieldname: "batch_no", fieldtype: "Link", options: "Batch", label: "Lô chụp sổ", read_only: true },
      "serial_and_batch_bundle:Link(Serial and Batch Bundle) Lô đếm được",
      "book_qty:Float~- Số sổ (chụp lúc chốt)",
      "book_weight_kg:Float~- Kg theo sổ",
      "counted_qty:Float! Số đếm thực tế",
      "counted_weight_kg:Float Kg cân thực tế",
      "variance_qty:Float~- Chênh lệch",
      "variance_weight_kg:Float~- Chênh kg",
      { fieldname: "book_qty_micros", fieldtype: "Int", label: "Số sổ (micros)", hidden: true, read_only: true },
      { fieldname: "book_weight_micros", fieldtype: "Int", label: "Kg sổ (micros)", hidden: true, read_only: true },
      { fieldname: "book_stock_value_minor", fieldtype: "Int", label: "Giá trị sổ (minor)", hidden: true, read_only: true },
      { fieldname: "variance_qty_micros", fieldtype: "Int", label: "Chênh SL (micros)", hidden: true, read_only: true },
      { fieldname: "variance_weight_micros", fieldtype: "Int", label: "Chênh kg (micros)", hidden: true, read_only: true },
      "valuation_rate:Currency Đơn giá điều chỉnh (khi lô chưa có giá)",
      "variance_reason:Link(Nguyên nhân chênh lệch) Nguyên nhân",
      "variance_note:Data Diễn giải",
      "photo:Attach Image Ảnh hiện trạng",
    ],
    permissions: { "Chủ xưởng": "rwcsxa", "Thủ kho": "rwc", "Kế toán": "rwcs", "Sản xuất": "r", "Kinh doanh": "r" },
  },
);
note("+3 chứng từ (Cut Order, Stock Reservation, Stock Reconciliation) + 2 child");

// ────────────────── NAVIGATION V2 ──────────────────
// Bỏ Aluminium Lot / Aluminium Cut cũ, thêm 3 chứng từ mới + 3 danh mục của D6.
brief.navigation.items = brief.navigation.items
  .filter((k) => !["Aluminium Lot", "Aluminium Cut"].includes(k))
  .concat(["Cut Order", "Stock Reservation", "Stock Reconciliation",
           "Lý do huỷ", "Nguyên nhân chênh lệch"]);
note(`navigation: ${brief.navigation.items.length} mục`);

// ══════════ DELIVERY NOTE — Q8: xuất kho KHÔNG cần đơn bán ══════════
const dn = doctype("Delivery Note");
addAfter(dn, "against_sales_order", "delivery_batch_key:Data- Khóa tạo phiếu theo ngày");
// Xưởng còn xuất mẫu, xuất đổi bảo hành, xuất nội bộ — không đơn bán nào cả.
replaceField(dn, "against_sales_order", "against_sales_order:Link(Sales Order) Theo đơn hàng (nếu có)");
// `install_address` fetch_from đơn bán ⇒ bỏ bắt buộc đơn mà giữ bắt buộc địa chỉ là chặn ở cửa sau.
replaceField(dn, "install_address", {
  fieldname: "install_address",
  fieldtype: "Small Text",
  label: "Địa chỉ lắp đặt",
  fetch_from: "against_sales_order.install_address",
});
replaceField(dn, "customer", {
  fieldname: "customer",
  fieldtype: "Link",
  options: "Customer",
  label: "Khách hàng",
  fetch_from: "against_sales_order.customer",
  mandatory_depends_on: "eval:doc.issue_purpose == 'Bán hàng'",
});
addAfter(dn, "customer",
  {
    "//": "Bỏ ràng buộc đơn bán rồi thì PHẢI biết xuất để làm gì — nếu không, phiếu không đơn thành lỗ hổng không ai giải thích được.",
    fieldname: "issue_purpose",
    fieldtype: "Select",
    options: "Bán hàng\nXuất mẫu\nĐổi bảo hành\nXuất nội bộ\nXuất gia công",
    label: "Mục đích xuất",
    required: true,
    default: "Bán hàng",
    in_standard_filter: true,
  },
);
const dni = doctype("Delivery Note Item");
addAfter(dni, "warehouse",
  "serial_and_batch_bundle:Link(Serial and Batch Bundle) Lô xuất (bundle Outward)",
  "weight_kg:Float Khối lượng xuất (kg)");

// ══════════ STOCK ENTRY — bundle + điều chỉnh tồn có lý do ══════════
const se = doctype("Stock Entry");
// screen-catalog Inventory: "Không sửa trực tiếp số tồn nếu đã có lịch sử; dùng phiếu điều chỉnh".
replaceField(se, "purpose",
  "purpose:Select(Material Receipt,Material Issue,Material Transfer,Manufacture,Điều chỉnh tồn)!=(Material Receipt) Loại phiếu");
addAfter(se, "purpose",
  {
    fieldname: "adjust_reason",
    fieldtype: "Link",
    options: "Nguyên nhân chênh lệch",
    label: "Nguyên nhân điều chỉnh",
    depends_on: "eval:doc.purpose == 'Điều chỉnh tồn'",
    mandatory_depends_on: "eval:doc.purpose == 'Điều chỉnh tồn'",
  },
);
const sei = doctype("Stock Entry Item");
// TÊN COPY ĐÚNG `Stock Entry Detail` của nền tảng. Brief cũ khai đè bằng `Stock Entry Item`
// rồi ĐÁNH RƠI chính trường này — đó là gốc của quyển sổ thứ hai.
addAfter(sei, "target_warehouse",
  "serial_and_batch_bundle:Link(Serial and Batch Bundle) Lô (bundle)",
  "weight_kg:Float Khối lượng (kg)");
note("Delivery Note + Stock Entry: bundle + weight_kg + issue_purpose + adjust_reason");

// ══════════ XOÁ THẬT quyển sổ thứ hai ══════════
// Trước đây em mới bỏ `Aluminium Lot` / `Aluminium Cut` khỏi NAVIGATION rồi tưởng xong.
// Bỏ khỏi menu ≠ bỏ khỏi hệ thống: doctype vẫn khai ⇒ bảng vẫn tạo, validator vẫn chạy,
// API vẫn nhận ghi. Quyển sổ thứ hai vẫn sống, chỉ là không có cửa vào.
const dropDoctypes = (...names) => {
  const gone = new Set(names);
  const before = brief.doctypes.length;
  brief.doctypes = brief.doctypes.filter((d) => !gone.has(d.name));
  brief.validators = (brief.validators ?? []).filter((v) => !gone.has(v.doctype));
  note(`XOÁ doctype: ${names.join(", ")} (${before} → ${brief.doctypes.length}) + validator kèm theo`);
};
dropDoctypes("Aluminium Lot", "Aluminium Cut");

// ══════════ ACTION V2 ══════════
// Compiler bắt buộc `permission` trỏ doctype CÓ KHAI, nên xoá 2 doctype trên là ba action cắt
// gãy ngay lúc compile — đúng cái ta muốn: không thể quên đổi.
const action = (n) => {
  const a = brief.actions.find((x) => x.name === n);
  if (!a) throw new Error(`không thấy action ${n}`);
  return a;
};
const cut = action("cat-nhom");
cut.permission = "Cut Order";
// Bản cũ: `voucher_no:Data!` — số chứng từ gõ tay, không trỏ đâu cả. Giờ action nhận PHIẾU thật.
cut.fields = [
  "cut_order:Link(Cut Order)! Phiếu cắt (nháp)",
];
delete cut.preview;
delete cut.resultTable;
cut.description =
  "Ghi sổ phiếu cắt nháp đã được đề xuất trước đó: trừ đúng lô mẹ, nhập lô đầu thừa và dùng các phiếu giữ chỗ gắn với lệnh. Cắt xong không nối lại được.";
for (const name of ["hoan-cat", "tra-hang"]) {
  const a = action(name);
  a.permission = "Cut Order";
  a.fields = [
    "cut_order:Link(Cut Order)! Phiếu cắt",
    "reason:Link(Lý do huỷ)! Lý do",
    "note:Small Text Diễn giải",
  ];
}
action("hoan-cat").description =
  "Chỉ dùng khi ghi nhầm: đảo nguyên trạng bút toán cắt và đầu thừa, không tính lại theo giá bình quân và không tạo phiếu cắt ngược.";
action("tra-hang").description =
  "Hàng đã cắt không thể nối lại thành lô mẹ. Tạo lô mới đúng chiều dài đã cắt và nhập bằng Phiếu kho, giữ nguyên dấu vết lô cha.";
const doc = action("doc-anh-chung-tu");
doc.permission = "Purchase Receipt"; // V2 nhận hàng là nhánh MVP, không phải đơn mua
doc.description = "AI đọc ảnh chứng từ và chỉ dựng bản NHÁP. Không bao giờ tự ghi sổ — người vẫn phải bấm duyệt.";
brief.actions.push(
  {
    "//": "Xem trước rồi mới ra phiếu — máy KHÔNG tự ghi sổ. Ra bản nháp, người bấm Cắt sau.",
    name: "de-xuat-lo-cat",
    label: "Đề xuất lô cắt",
    icon: "list-checks",
    group: "Kho",
    permission: "Cut Order",
    description: "Tìm lô đủ dài mà phế ít nhất theo mã · màu · tình trạng · khổ tối thiểu. Bỏ qua lô đang bị giữ chỗ.",
    fields: [
      "item_code:Link(Item)! Mã nhôm",
      "color:Link(Item Color) Màu (bỏ trống = mọi màu)",
      "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng",
      "warehouse:Link(Warehouse)! Kho",
      "cutting_policy:Link(Cutting Policy)! Công thức cửa",
      "cut_width_m:Float! Rộng cắt lá (m)",
      "sheets:Float! Số lá cần",
      "include_offcut:Check!=(1) Xét cả kho đầu thừa",
    ],
    preview: "alumdoor.cut.propose | Xem đề xuất",
    commit: "alumdoor.cut.draft | Tạo phiếu cắt nháp",
    resultTable: "picks",
  },
  {
    "//": "Giữ chỗ theo QUY CÁCH, không khoá lô cụ thể — khoá lô là phá cơ chế chọn lô tối ưu lúc cắt.",
    name: "giu-cho",
    label: "Giữ chỗ nhôm",
    icon: "bookmark",
    group: "Kho",
    permission: "Stock Reservation",
    description: "Trừ vào tồn KHẢ DỤNG, không đụng tồn thực và không sinh bút toán. Hết hạn thì tự nhả.",
    fields: [
      "item_code:Link(Item)! Mã nhôm",
      "color:Link(Item Color) Màu",
      "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng",
      "warehouse:Link(Warehouse)! Kho",
      "min_length_m:Float! Khổ tối thiểu (m)",
      "qty_reserved:Float! Số cây giữ",
      "source_doctype:Select(Sales Order,Work Order,Cut Order) Giữ cho chứng từ",
      "source_name:Data Số chứng từ",
      "expires_at:Datetime! Hết hạn giữ",
    ],
    commit: "alumdoor.reserve.create | Giữ chỗ",
  },
  {
    name: "nha-giu-cho",
    label: "Nhả giữ chỗ",
    icon: "bookmark-x",
    group: "Kho",
    permission: "Stock Reservation",
    description: "Trả lại tồn khả dụng. Nhả nhầm thì giữ lại được, nên không cần cảnh báo nặng.",
    fields: ["reservation:Link(Stock Reservation)! Phiếu giữ chỗ", "released_reason:Small Text! Lý do nhả"],
    commit: "alumdoor.reserve.release | Nhả",
  },
  {
    "//": "Chụp sổ TRƯỚC khi đếm. Chốt xong mà còn nhập/xuất thì phần đó là chênh lệch GIẢ — nên snapshot_at là mốc so, không phải lúc bấm duyệt.",
    name: "chot-so-so-kiem-ke",
    label: "Chốt số sổ để kiểm kê",
    icon: "camera",
    group: "Kho",
    permission: "Stock Reconciliation",
    description: "Chụp tồn sổ tại thời điểm bấm và điền vào phiếu. KHÔNG ghi bút toán nào.",
    fields: [
      "warehouse:Link(Warehouse)! Kho",
      "scope:Select(Toàn kho,Theo nhóm hàng,Một mặt hàng)!=(Toàn kho) Phạm vi",
      "item_group:Link(Item Group) Nhóm hàng",
      "item_code:Link(Item) Mặt hàng",
      // Người đếm lấy từ danh tính đã ký của chính người bấm; không nhận tên do client gửi.
    ],
    commit: "alumdoor.recon.snapshot | Chốt số sổ",
    resultTable: "lines",
  },
  {
    "//": "Chỉ Chủ xưởng. Bút toán điều chỉnh ghi tại `snapshot_at`, không phải lúc bấm — nếu không thì mọi phát sinh giữa hai mốc bị tính nhầm thành lệch.",
    name: "duyet-kiem-ke",
    label: "Duyệt kiểm kê",
    icon: "check-check",
    group: "Kho",
    permission: "Stock Reconciliation",
    description: "Ghi bút toán điều chỉnh cho phần chênh lệch. Mỗi dòng lệch phải có nguyên nhân mới duyệt được.",
    fields: ["reconciliation:Link(Stock Reconciliation)! Phiếu kiểm kê"],
    commit:
      "alumdoor.recon.post | Ghi sổ điều chỉnh | Bút toán điều chỉnh ghi vào ngày chốt số sổ và không sửa được — tiếp tục?",
  },
  {
    "//": "Chỉ đọc dữ liệu người gọi đã được phép mở. Nền tảng ghi ai_logs cho mọi câu trả lời thành công.",
    name: "hoi-ai",
    label: "Hỏi trợ lý",
    icon: "sparkles",
    group: "Báo cáo",
    permission: "Item",
    permissionAction: "read",
    description: "Trợ lý chỉ trả lời từ bối cảnh được cung cấp, không tự ghi chứng từ và không đoán số còn thiếu.",
    fields: [
      "question:Small Text! Câu hỏi",
      "context_doctype:Data Loại chứng từ làm bối cảnh",
      "context_name:Data Số chứng từ làm bối cảnh",
    ],
    commit: "alumdoor.ai.ask | Hỏi",
  },
  {
    name: "khoa-ky",
    label: "Khoá kỳ",
    icon: "lock-keyhole",
    group: "Cài đặt",
    permission: "Cutting Policy",
    description: "Chỉ Chủ xưởng. Chặn mọi bút toán kho có ngày nhỏ hơn hoặc bằng ngày khoá; mỗi lần đổi đều có nhật ký.",
    fields: [
      "company:Data! Công ty",
      "lock_date:Date! Khoá đến hết ngày",
      "reason:Small Text! Lý do",
    ],
    commit: "alumdoor.period.lock | Khoá kỳ | Sau khi khoá, chứng từ trong kỳ chỉ có thể ghi khi mở lại — tiếp tục?",
  },
  {
    name: "mo-ky",
    label: "Mở kỳ",
    icon: "lock-keyhole-open",
    group: "Cài đặt",
    permission: "Cutting Policy",
    description: "Chỉ Chủ xưởng. Mở lại kỳ đã khoá; bắt buộc ghi lý do và lưu nhật ký người thực hiện.",
    fields: [
      "company:Data! Công ty",
      "reason:Small Text! Lý do mở kỳ",
    ],
    commit: "alumdoor.period.unlock | Mở kỳ | Chứng từ quá khứ sẽ có thể ghi lại — tiếp tục?",
  },
);
for (const [anchor, entries] of [
  ["Production Standard", ["action:lap-tai-san-xuat"]],
  ["Warranty Claim", ["action:mo-ho-so-bao-hanh", "action:xac-nhan-bu-tru-bao-hanh"]],
]) {
  const index = brief.navigation.items.indexOf(anchor);
  if (index >= 0) brief.navigation.items.splice(index + 1, 0, ...entries);
}
note(`actions: ${brief.actions.length} (3 action cắt trỏ lại Cut Order, +8 mới)`);

brief.actions.push(
  {
    name: "mo-ho-so-bao-hanh", label: "Mở hồ sơ bảo hành/lỗi", icon: "shield-plus", group: "Bảo hành",
    permission: "Warranty Claim", description: "Truy phiếu giao thực tế, tính hạn bảo hành 12 tháng và phân nhánh theo nguyên nhân lỗi.",
    fields: [
      "sales_order:Link(Sales Order)! Đơn bán", "delivery_note:Link(Delivery Note)! Phiếu giao đã ghi sổ",
      "item_code:Link(Item)! Mặt hàng lỗi", "received_fault_on:Date! Ngày nhận lỗi",
      "issue_cause:Select(Sản xuất,Nhà cung cấp,Khách hàng sử dụng,Vận chuyển/lắp đặt)! Nguyên nhân",
      "responsible_person:Data Người chịu trách nhiệm", "supplier:Link(Supplier) Nhà cung cấp",
      "purchase_document:Link(Purchase Invoice) Hoá đơn mua", "supplier_offset_amount:Currency Số tiền bù trừ",
      "customer_costs_json:Text Chi phí theo công việc (JSON)", "item_description:Small Text Nội dung lỗi",
    ],
    commit: "alumdoor.warranty.open | Mở hồ sơ", resultTable: "results",
  },
  {
    name: "xac-nhan-bu-tru-bao-hanh", label: "Kế toán xác nhận xử lý lỗi", icon: "badge-check", group: "Bảo hành",
    permission: "Debit Note", description: "Chỉ Kế toán tổng hợp/Kế toán trưởng; lỗi sản xuất được chốt sau kết luận, lỗi NCC tạo Giấy báo Nợ nháp chống trùng.",
    fields: ["warranty_claim:Link(Warranty Claim)! Hồ sơ lỗi NCC", "default_expense_account:Data Tài khoản ghi giảm"],
    commit: "alumdoor.warranty.confirm_resolution | Xác nhận xử lý | Xác nhận kết luận lỗi và bù trừ nếu thuộc nhà cung cấp?",
  },
  {
    name: "lap-tai-san-xuat", label: "Tính năng lực và tăng ca", icon: "gauge", group: "Sản xuất",
    permission: "Production Standard", description: "Tính tải theo m²/bộ/công đoạn/mẻ, ca 8 giờ, hiệu suất, workstation và tăng ca.",
    fields: ["demands_json:Text! Nhu cầu sản xuất (JSON)", "resource_json:Text! Tổ/ca/trạm/tăng ca (JSON)"],
    commit: "alumdoor.capacity.preview | Tính tải",
  },
);

// Khoá/mở kỳ đi qua method nền tảng và bảng `accounting_period_locks`; không dựng doctype bóng.

// ══════════ BÁO CÁO V2 ══════════
// `reports` của brief chỉ đọc doctype do app sở hữu. Báo cáo "Tồn nhôm theo khổ" đọc Batch + sổ kho
// nên đã được dựng thành platform report/view ở migration 0025 và đưa vào app bằng `links` phía trên.
// Không khai lại Batch hay sổ kho thành bảng của app.
brief.reports.push(
  {
    name: "Nhập kho theo nhà cung cấp",
    doctype: "Purchase Receipt",
    columns: ["supplier:Link(Supplier) Nhà cung cấp", "count(name):Int Số phiếu", "sum(total_qty):Float Tổng cây"],
    groupBy: "supplier",
    orderBy: "sum(total_qty) desc",
    filters: ["supplier", "posting_at"],
    icon: "truck",
    group: "Báo cáo",
  },
  {
    "//": "Nỗi đau #1 đo được: cân thực lệch cân lý thuyết bao nhiêu, theo từng mã. Không có bảng này thì 'nhôm thiếu ký' mãi là cảm giác.",
    name: "Lệch cân khi nhập",
    doctype: "Purchase Receipt Item",
    columns: [
      "item_code:Link(Item) Mã nhôm",
      "count(name):Int Số dòng",
      "sum(theoretical_kg):Float Kg lý thuyết",
      "sum(actual_weight_kg):Float Kg thực cân",
      "avg(weight_variance_pct):Float Lệch bình quân (%)",
    ],
    groupBy: "item_code",
    orderBy: "avg(weight_variance_pct) asc",
    filters: ["item_code", "warehouse"],
    icon: "scale",
    group: "Báo cáo",
  },
  {
    name: "Hao hụt khi cắt",
    doctype: "Cut Order Item",
    columns: [
      "item_code:Link(Item) Mã nhôm",
      "count(name):Int Số lần cắt",
      "sum(kg_consumed):Float Kg tiêu hao",
      "sum(kerf_total_m):Float Mạch cưa (m)",
      "sum(scrap_m):Float Phế (m)",
      "sum(offcut_length_m):Float Đầu thừa thu lại (m)",
    ],
    groupBy: "item_code",
    orderBy: "sum(scrap_m) desc",
    filters: ["item_code"],
    icon: "scissors",
    group: "Báo cáo",
  },
  {
    "//": "Giữ chỗ quên nhả làm tồn khả dụng tụt dần KHÔNG LÝ DO — hỏng im lặng, cùng họ với nỗi đau #2 nhưng ngược chiều.",
    name: "Giữ chỗ đang treo",
    doctype: "Stock Reservation",
    columns: [
      // `warehouse` chỉ là BỘ LỌC, không phải cột: gộp theo item_code thì cột không gộp là
      // câu SQL sai — compiler chặn đúng.
      "item_code:Link(Item) Mã nhôm",
      "count(name):Int Số phiếu giữ",
      "sum(qty_reserved):Float Cây đang giữ",
    ],
    groupBy: "item_code",
    orderBy: "sum(qty_reserved) desc",
    filters: ["item_code", "warehouse", "state", "expires_at"],
    icon: "bookmark",
    group: "Báo cáo",
  },
  {
    name: "Chênh lệch kiểm kê",
    doctype: "Stock Reconciliation Item",
    columns: [
      // Gộp theo NGUYÊN NHÂN, không theo mã: câu hỏi đáng tiền là "mất vì cái gì", không phải
      // "mất ở mã nào". Mã vẫn lọc được.
      "variance_reason:Link(Nguyên nhân chênh lệch) Nguyên nhân",
      "count(name):Int Số dòng lệch",
      "sum(variance_qty):Float Lệch cây",
      "sum(variance_weight_kg):Float Lệch kg",
    ],
    groupBy: "variance_reason",
    orderBy: "sum(variance_weight_kg) asc",
    filters: ["item_code", "variance_reason"],
    icon: "clipboard-check",
    group: "Báo cáo",
  },
);
note(`reports: ${brief.reports.length} (+5 báo cáo kho)`);

// Giữ tên mẫu cũ để bản nâng cấp vô hiệu hoá đúng record đã cài, tránh hai mẫu cùng mặc định.
for (const entry of brief.prints.filter((candidate) => candidate.doctype === "Purchase Order")) {
  entry.default = false;
}
brief.prints.push({
  "//": "Đơn đặt hàng A4 dọc theo mẫu Excel/PDF ALUMDOOR; đầu trang giữ lề gốc, bảng dùng vùng in rộng để không ép nhỏ chữ.",
  name: "Đơn nhập hàng ALUMDOOR",
  doctype: "Purchase Order",
  default: true,
  css: [
    "@page{size:A4 portrait;margin:12mm 8mm 8mm}",
    "@page :first{margin-top:23.7mm}",
    "*{box-sizing:border-box}html,body{margin:0}body{font-family:Arial,'Liberation Sans',sans-serif;font-size:9px;color:#111;font-kerning:none;letter-spacing:0;word-spacing:0}",
    "@media screen{html{width:210mm}body{width:210mm;min-height:297mm;padding:23.7mm 8mm 8mm}}",
    ".letterhead{position:relative;width:194mm;height:17mm;margin-left:0;overflow:hidden}",
    ".brand-logo{position:absolute;left:0;top:1.35mm;width:74mm;height:auto}",
    ".company-header-img{position:absolute;right:-13.5mm;top:0;width:114.3mm;height:auto;display:block}",
    ".title{width:194mm;font-family:Arial,'Liberation Sans',sans-serif;font-size:18px;line-height:1.2;font-weight:700;color:#f15a24;text-transform:uppercase;text-align:center;margin:5mm 0 6mm}",
    ".meta{width:194mm;margin-left:0;font-size:8px;font-weight:400;line-height:1.45;margin-bottom:4.5mm}.meta-row{display:grid;grid-template-columns:30mm 1fr;min-height:2.8mm}.meta-label{font-weight:700}.meta-value{font-weight:400;white-space:pre-wrap}",
    "table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #777;padding:4pt 1.5pt;vertical-align:middle;text-align:center;line-height:1.25}",
    "th{background:#f3f3f3;font-size:7.5pt;text-transform:uppercase;white-space:normal}",
    "td{font-size:8pt;white-space:normal;overflow-wrap:anywhere}.n{text-align:center;font-variant-numeric:tabular-nums}.c{text-align:center}.code{font-weight:700}.item-cell,.note-cell{white-space:normal;overflow-wrap:anywhere}",
    ".index-col,.nowrap{white-space:nowrap}.note-col,.note-cell{white-space:normal}",
    "tfoot td{font-family:Arial,'Liberation Sans',sans-serif;font-size:8.5pt;font-weight:700;line-height:1.2;background:#fff;padding-top:3pt;padding-bottom:3pt}.total-label{text-align:right;padding-right:5pt}.total-value{text-align:center;color:#c55a11;white-space:nowrap;font-size:8pt;padding-left:1pt;padding-right:1pt}",
    ".sign{display:flex;width:100%;justify-content:space-between;text-align:center;margin-top:18px}.sign div{width:30%}.sign b{display:block;margin-bottom:35px;font-size:8px}",
  ],
  html: [
    `<div class="letterhead"><img class="brand-logo" src="${ORDER_LOGO}" alt="ALUMDOOR">`,
    "<img class=\"company-header-img\" src=\"/alumdoor-company-header.png\" alt=\"Thông tin công ty ALUMDOOR\"></div>",
    "<div class=\"title\">ĐƠN ĐẶT HÀNG</div>",
    "<div class=\"meta\"><div class=\"meta-row\"><span class=\"meta-label\">Tên nhà cung cấp:</span><span class=\"meta-value\">{{ supplier }}</span></div><div class=\"meta-row\"><span class=\"meta-label\">Ngày đặt hàng:</span><span class=\"meta-value\">{{ transaction_date | date }}</span></div><div class=\"meta-row\"><span class=\"meta-label\">Ngày giao hàng:</span><span class=\"meta-value\">{{ schedule_date | date }}</span></div></div>",
    "<table><colgroup><col style=\"width:3%\"><col style=\"width:7%\"><col style=\"width:10%\"><col style=\"width:8%\"><col style=\"width:7%\"><col style=\"width:7%\"><col style=\"width:7%\"><col style=\"width:8%\"><col style=\"width:4%\"><col style=\"width:9%\"><col style=\"width:12%\"><col style=\"width:7%\"><col style=\"width:11%\"></colgroup><thead><tr>",
    "<th class=\"index-col\">STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Màu sắc</th><th>Kích thước</th><th>Trọng lượng</th><th>SỐ<br><span class=\"nowrap\">CÂY&#47;LÁ</span></th><th>Số lượng</th><th>ĐVT</th><th>Đơn giá</th><th>Thành tiền</th><th>Dập</th><th class=\"note-col\">Ghi chú</th>",
    "</tr></thead><tbody>",
    "{{#each items}}<tr><td class=\"c index-col\">{{ _index }}</td><td class=\"code\">{{ item_code }}</td><td class=\"item-cell\">{{ item_name }}</td><td class=\"c\">{{ color }}</td><td class=\"n\">{{ length_m | number }}</td><td class=\"n\">{{ theoretical_kg_per_m | number }}</td><td class=\"n\">{{ qty_bar | number }}</td><td class=\"n\">{{ qty | number2 }}</td><td class=\"c\">{{ uom }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td><td class=\"c\">{{ is_stamped }}</td><td class=\"note-cell\">{{ note }}</td></tr>{{/each}}",
    "</tbody><tfoot><tr><td class=\"total-label\" colspan=\"10\">Tổng tiền</td><td class=\"total-value\">{{ grand_total | money }} {{ currency }}</td><td colspan=\"2\"></td></tr></tfoot></table>",
    "<div class=\"sign\"><div><b>Người lập đơn</b>(ký, ghi rõ họ tên)</div><div><b>Người duyệt</b>(ký, ghi rõ họ tên)</div><div><b>Nhà cung cấp xác nhận</b>(ký, ghi rõ họ tên)</div></div>",
  ],
});
note("prints: + Đơn nhập hàng A4 dọc, đầu trang đúng lề mẫu và bảng 13 cột dùng font theo pt");

brief.prints.push({
  "//": "Biên bản kiểm kê A4: số chứng từ, QR, mọi dòng chênh lệch và ba khu ký.",
  name: "Biên bản kiểm kê kho ALUMDOOR",
  doctype: "Stock Reconciliation",
  default: true,
  css: [
    "*{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:22px}",
    ".head{display:flex;justify-content:space-between;border-bottom:2px solid #9b1c1c;padding-bottom:10px;margin-bottom:14px}",
    ".brand{font-size:21px;font-weight:800;color:#9b1c1c}.title{font-size:17px;font-weight:800;text-transform:uppercase;text-align:right}",
    ".meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 24px;margin:12px 0}.meta b{display:inline-block;min-width:120px;color:#555}",
    "table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px 6px}th{background:#f2f2f2;font-size:10px;text-transform:uppercase}",
    ".n{text-align:right;font-variant-numeric:tabular-nums}.qr{width:74px;height:74px;margin-left:14px}",
    ".sign{display:flex;justify-content:space-between;text-align:center;margin-top:34px}.sign div{width:31%}.sign b{display:block;margin-bottom:55px}",
    ".note{margin-top:12px;white-space:pre-wrap;color:#444}",
  ],
  html: [
    "<div class=\"head\"><div><div class=\"brand\">ALUMDOOR</div><div>Biên bản kiểm kê tài sản tồn kho</div></div>",
    "<div style=\"display:flex\"><div><div class=\"title\">Biên bản kiểm kê kho</div><div>Số: {{ name }}</div></div><img class=\"qr\" alt=\"QR {{ name }}\" src=\"{{ name | qrcode }}\"></div></div>",
    "<div class=\"meta\"><div><b>Kho kiểm kê</b>{{ warehouse }}</div><div><b>Thời điểm chốt</b>{{ snapshot_at | date }}</div>",
    "<div><b>Người đếm</b>{{ counted_by }}</div><div><b>Người chứng kiến</b>{{ witnessed_by }}</div></div>",
    "<table><thead><tr><th>#</th><th>Mã hàng / lô</th><th class=\"n\">Sổ</th><th class=\"n\">Đếm</th><th class=\"n\">Chênh</th><th class=\"n\">Kg chênh</th><th>Nguyên nhân / diễn giải</th></tr></thead><tbody>",
    "{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br>{{ batch_no }}</td><td class=\"n\">{{ book_qty | number }}</td><td class=\"n\">{{ counted_qty | number }}</td><td class=\"n\">{{ variance_qty | number }}</td><td class=\"n\">{{ variance_weight_kg | number }}</td><td>{{ variance_reason }}<br>{{ variance_note }}</td></tr>{{/each}}",
    "</tbody></table><div class=\"note\">Ghi chú: {{ note }}</div>",
    "<div class=\"sign\"><div><b>Người đếm</b>(ký, ghi rõ họ tên)</div><div><b>Người chứng kiến</b>(ký, ghi rõ họ tên)</div><div><b>Thủ trưởng đơn vị</b>(ký, đóng dấu)</div></div>",
  ],
});
note("prints: + Biên bản kiểm kê A4 có QR và ba khu chữ ký");

// ══════════ CỔNG 4 — FIXTURE PHẢI THEO KỊP FIELD ══════════
// Dry-run KHÔNG bắt được nhóm này: nó biên dịch cấu trúc, không chạy validator dữ liệu.
// Ba lỗ dưới đây chỉ lộ lúc cài thật vào tenant.
const fixture = (type, name) => {
  const f = brief.fixtures.find((x) => x.type === type && x.name === name);
  if (!f) throw new Error(`không thấy fixture ${type}/${name}`);
  return f;
};

// ── G1. Contract canonical 11/08: nhôm mua/định giá theo Kg, tồn vật lý theo Cây/Lá ──
// Kg là catch weight và priced quantity; số cây/lá là stock quantity. Hai trục cùng nằm trên
// Stock Ledger/Batch, tuyệt đối không dùng hệ số Kg↔Cây tĩnh và không tạo shadow balance.
fixture("Measurement Profile", "Nhôm cây/lá").data.stock_uom = "Cây";
note('G1 · Measurement Profile "Nhôm cây/lá": tồn Cây/Lá; Kg là catch weight và đơn vị mua/định giá');

// ── G2. `leaf_formula` BẮT BUỘC mà không fixture nào khai ──
// Thêm 9 trường chia lá vào Cutting Policy nhưng để nguyên 7 fixture bản cũ.
const LEAF = {
  "Cửa Đức — công thức chuẩn": { leaf_formula: "Kiểu Đức", leaf_height_deduction_m: 0.13, ray_type: "U75" },
  "Cửa Đức — đại lý": { leaf_formula: "Kiểu Đức", leaf_height_deduction_m: 0.13, ray_type: "U75" },
  "Cửa Đức — khách lẻ": { leaf_formula: "Kiểu Đức", leaf_height_deduction_m: 0.13, ray_type: "U75" },
  // Chủ xưởng chốt 30/07: 0,13 CHỈ cho cửa Đức, "nhiều cái không trừ" ⇒ các dòng khác ĐỂ TRỐNG.
  "Cửa Úc — công thức chuẩn": {
    leaf_formula: "Kiểu Úc",
    leaf_divisor_source: "Hằng số của chính sách",
    leaf_divisor_const: 0.465,
  },
  "Cửa Lưới — công thức chuẩn": { leaf_formula: "Kiểu Đài Loan Lưới" },
  "Cửa Đài Loan — công thức chuẩn": { leaf_formula: "Kiểu Đài Loan Lưới" },
  // Chủ xưởng 30/07: "cứ lấy giống cửa Đức, sửa được sau" — TẠM, không phải số đo.
  "Cửa Siêu Trường — công thức chuẩn": { leaf_formula: "Kiểu Đức" },
};
for (const [name, patch] of Object.entries(LEAF)) Object.assign(fixture("Cutting Policy", name).data, patch);
note(`G2 · Cutting Policy: seed leaf_formula cho ${Object.keys(LEAF).length}/7 chính sách (trường BẮT BUỘC, trước đó trống)`);

// ── G3. Không có kho đầu thừa thì nhánh cắt không có chỗ nhập lại ──
// Mỗi kho chính có đúng một kho đầu thừa con để việc chọn kho không mơ hồ khi có nhiều địa điểm.
fixture("Warehouse", "K36").data.stock_role = "Kho chính";
fixture("Warehouse", "K12").data.stock_role = "Kho chính";
brief.fixtures.push(
  {
    "//": "Đầu thừa của K36. Tách kho để tồn khả dụng kho chính không bị đầu thừa làm nhiễu.",
    type: "Warehouse",
    name: "K36-DT",
    data: {
      warehouse_name: "K36-DT",
      parent_warehouse: "K36",
      is_group: false,
      address: "Kho đầu thừa K36",
      stock_role: "Kho đầu thừa",
      disabled: false,
    },
  },
  {
    "//": "Đầu thừa của K12; cùng quy tắc nhưng không trộn vị trí vật lý với K36.",
    type: "Warehouse",
    name: "K12-DT",
    data: {
      warehouse_name: "K12-DT",
      parent_warehouse: "K12",
      is_group: false,
      address: "Kho đầu thừa K12",
      stock_role: "Kho đầu thừa",
      disabled: false,
    },
  },
  {
    "//": "Ngắn hơn ngưỡng, hoặc lá lỗi — bán theo kg, không quay lại sản xuất.",
    type: "Warehouse",
    name: "K0",
    data: {
      warehouse_name: "K0",
      parent_warehouse: "Kho Alumdoor",
      is_group: false,
      address: "Kho phế",
      stock_role: "Kho phế",
      disabled: false,
    },
  },
);
note("G3 · Warehouse: K36/K12 khai stock_role + mỗi kho có một kho đầu thừa con · K0 (phế)");

// ── MEASUREMENT + GEOMETRY MASTER AUTHORITY ──
{
  const geometryOwned = new Set(["Geometry Field", "Geometry Profile Scope", "Geometry Profile Field", "Geometry Profile"]);
  brief.doctypes = brief.doctypes.filter((dt) => !geometryOwned.has(dt.name));
  brief.doctypes.push(...function geometryDoctypes() {
  const permissions = { "Chủ xưởng": "rwc", "Kinh doanh": "r", "Sản xuất": "r", "Kế toán": "r" };
  return [
    {
      name: "Geometry Field",
      label: "Trường hình học",
      group: "Danh mục",
      naming: "field:field_code",
      title: "field_name",
      list: ["field_code", "field_name", "uom", "axis", "disabled"],
      search: ["field_code", "field_name"],
      fields: [
        { fieldname: "field_code", fieldtype: "Data", label: "Mã trường", required: true },
        { fieldname: "field_name", fieldtype: "Data", label: "Tên trường", required: true },
        { fieldname: "uom", fieldtype: "Link", options: "UOM", label: "Đơn vị", required: true },
        { fieldname: "axis", fieldtype: "Select", options: "WIDTH\nHEIGHT\nLENGTH\nOTHER", optionLabels: { WIDTH: "Chiều rộng", HEIGHT: "Chiều cao", LENGTH: "Chiều dài", OTHER: "Khác" }, label: "Trục đo", required: true },
        { fieldname: "note", fieldtype: "Small Text", label: "Ghi chú" },
        { fieldname: "disabled", fieldtype: "Check", label: "Ngừng dùng", default: false },
      ],
      permissions,
    },
    {
      name: "Geometry Profile Scope",
      child: true,
      label: "Nhóm hàng của bộ quy cách hình học",
      group: "Danh mục",
      naming: "autoincrement",
      fields: [
        { fieldname: "item_group", fieldtype: "Link", options: "Item Group", label: "Nhóm hàng", required: true },
      ],
      permissions,
    },
    {
      name: "Geometry Profile Field",
      child: true,
      label: "Trường của bộ quy cách hình học",
      group: "Danh mục",
      naming: "autoincrement",
      fields: [
        { fieldname: "geometry_field", fieldtype: "Link", options: "Geometry Field", label: "Trường", required: true },
        { fieldname: "role", fieldtype: "Select", options: "INPUT\nCALCULATED\nINFO", optionLabels: { INPUT: "Nhập liệu", CALCULATED: "Tự tính", INFO: "Thông tin" }, label: "Vai trò", required: true },
        { fieldname: "required", fieldtype: "Check", label: "Bắt buộc", default: false },
        { fieldname: "visible", fieldtype: "Check", label: "Hiện trên form", default: true },
        { fieldname: "editable", fieldtype: "Check", label: "Cho nhập", default: false },
        { fieldname: "sequence", fieldtype: "Int", label: "Thứ tự", default: 0 },
      ],
      permissions,
    },
    {
      name: "Geometry Profile",
      label: "Bộ quy cách hình học",
      group: "Danh mục",
      naming: "field:profile_code",
      title: "profile_name",
      list: ["profile_code", "profile_name", "disabled"],
      search: ["profile_code", "profile_name"],
      fields: [
        { fieldname: "profile_code", fieldtype: "Data", label: "Mã bộ quy cách", required: true },
        { fieldname: "profile_name", fieldtype: "Data", label: "Tên bộ quy cách", required: true },
        { fieldname: "item_groups", fieldtype: "Table", options: "Geometry Profile Scope", label: "Nhóm hàng áp dụng" },
        { fieldname: "fields", fieldtype: "Table", options: "Geometry Profile Field", label: "Trường hiển thị", required: true },
        {
          "//": "Có xổ định mức vật tư ra màn bán hàng cho loại cửa này không.",
          "//do": [
            "Cửa Đức hiện chưa khai Quy tắc BOM nào: mở khối ra chỉ được một bảng toàn dấu '?' kèm",
            "hàng chục dòng 'Chưa map Quy tắc BOM cho …' — không nói cho thợ biết thêm gì, chỉ tổ",
            "làm người bán tưởng đơn hỏng. Chủ xưởng chốt 24/08/2026: ẩn hẳn cho Cửa Đức.",
            "Để đây (mỗi loại cửa một bộ quy cách) thay vì gõ cứng tên loại cửa vào code, để ngày",
            "khai xong định mức thì tự bật lại bằng một ô tick, không phải sửa code."
          ],
          fieldname: "show_bom_on_sales", fieldtype: "Check", label: "Xổ định mức trên màn bán", default: true,
        },
        { fieldname: "note", fieldtype: "Small Text", label: "Ghi chú" },
        { fieldname: "disabled", fieldtype: "Check", label: "Ngừng dùng", default: false },
      ],
      permissions,
    },
  ];
}());
  const measurement = doctype("Measurement Profile");
  const movedOut = new Set(["theoretical_kg_per_m", "effective_width_m", "kerf_mm", "scrap_threshold_m"]);
  measurement.fields = measurement.fields.filter((field) => !movedOut.has(nameOf(field)));
  const itemMaster = doctype("Item");
  if (!itemMaster.fields.some((field) => nameOf(field) === "geometry_profile")) {
    const i = itemMaster.fields.findIndex((field) => nameOf(field) === "measurement_profile");
    const field = { fieldname: "geometry_profile", fieldtype: "Link", options: "Geometry Profile", label: "Bộ quy cách hình học" };
    if (i >= 0) itemMaster.fields.splice(i + 1, 0, field); else itemMaster.fields.push(field);
  }
  const replaceTypes = new Set(["Measurement Profile", "Geometry Field", "Geometry Profile"]);
  brief.fixtures = brief.fixtures.filter((fixture) => !replaceTypes.has(fixture.type));
  brief.fixtures.push(
    ...MEASUREMENT_PROFILES.map((profile) => ({ type: "Measurement Profile", name: profile.name, data: measurementProfilePayload(profile) })),
    ...GEOMETRY_FIELDS.map((field) => ({ type: "Geometry Field", name: field.code, data: { field_code: field.code, field_name: field.name, uom: field.uom, axis: field.axis, disabled: false, _migration_source: "alumdoor-geometry-master-2026-08-16" } })),
    ...GEOMETRY_PROFILES.map((profile) => ({ type: "Geometry Profile", name: profile.code, data: { profile_code: profile.code, profile_name: profile.name, item_groups: profile.itemGroups.map((item_group, index) => ({ row_id: `GROUP-${index + 1}`, item_group })), fields: profile.fields.map((field, index) => ({ row_id: `FIELD-${index + 1}`, geometry_field: field.geometryField, role: field.role, required: field.required, visible: field.visible, editable: field.editable, sequence: field.sequence })), disabled: false, _migration_source: "alumdoor-geometry-master-2026-08-16" } })),
  );
  for (const name of ["Geometry Field", "Geometry Profile"]) if (!brief.navigation.items.includes(name)) brief.navigation.items.push(name);
}
note("MASTER · Measurement Profile chỉ đo/tồn; Geometry Field/Profile sở hữu trường hình học");

// ══════════ HỘI TỤ DANH MỤC 2026-08-19 ══════════
// Đợt này đóng bốn lỗ mà audit danh mục 19/08 đo được trên D1 local:
//
//   1. `Pricing Scope` KHÔNG được khai ở đâu cả — không brief, không doctype_definitions —
//      trong khi engine giá đọc nó theo TÊN mỗi lần tính đơn
//      (clouderp-pricing/commercial-policy.ts, clouderp-selling/order-commercial-policy.ts).
//      Bốn phạm vi thật đang chi phối phụ thu sơn mà chủ xưởng không sửa được qua giao diện.
//   2. `BOM Rule` chỉ tồn tại do importer ghi thẳng vào doctype_definitions ⇒ dựng lại
//      tenant là mất 110 quy tắc. Client phải mang fallbackRoute riêng chỉ vì lý do này.
//   3. Fixture `Item Color` mang ĐỦ CẢ HAI dạng tên: 22 slug ASCII (TRANG, CAFE, XANH_NGOC)
//      cạnh 25 tên đúng (TRẮNG, CAFÉ, XANH NGỌC). Ô chọn Link đọc hợp documents ∪
//      master_records nên người dùng chọn được hai bản ghi cho CÙNG một màu — đúng cái
//      E07 cảnh báo: "tạo CUỐN bên cạnh Cuộn là chẻ tồn kho làm hai vì một lần gõ nhầm".
//   4. Bốn doctype rỗng (Material Grade, Item Attribute, Brand, Manufacturer) chiếm chỗ
//      trong nhóm Danh mục mà không tài liệu Alumdoor nào đòi, và cả bốn đều 0 bản ghi.
{
  const perm = doctype("Pricing Rule").permissions;
  const permMfg = doctype("Cutting Policy").permissions;
  const hasDoctype = (n) => brief.doctypes.some((d) => d.name === n);

  // ── 1. Phạm vi áp dụng chính sách giá ──
  // Nguồn: docs/ALUMDOOR_PRICING_SCOPE.md. Luật "phải có ít nhất một dòng thành phần trước
  // khi dùng" chỉ ép được khi nó là DocType thật — chuỗi tự do thì không có chỗ nào để ép.
  if (!hasDoctype("Pricing Scope")) {
    brief.doctypes.push(
      {
        "//": "Gom nhiều mặt hàng/nhóm hàng vào một phạm vi để một chính sách giá chỉ khai một lần.",
        name: "Pricing Scope",
        label: "Phạm vi áp dụng chính sách",
        icon: "tags",
        group: "Danh mục",
        naming: "field:scope_name",
        title: "scope_name",
        list: ["scope_name", "disabled"],
        search: ["scope_name"],
        fields: [
          "scope_name:Data*! Tên phạm vi",
          {
            "//": "Phạm vi rỗng thành phần thì KHÔNG làm chính sách giá chạy — fail-closed, không im lặng bỏ qua.",
            fieldname: "members",
            fieldtype: "Table",
            options: "Pricing Scope Member",
            label: "Mặt hàng / nhóm hàng áp dụng",
          },
          "note:Small Text Ghi chú",
          "disabled:Check Ngừng dùng",
        ],
        permissions: perm,
      },
      {
        name: "Pricing Scope Member",
        child: true,
        label: "Thành phần phạm vi",
        group: "Danh mục",
        naming: "autoincrement",
        fields: [
          "member_type:Select(Item,Item Group)*! Áp dụng theo",
          {
            fieldname: "item_code", label: "Mặt hàng", fieldtype: "Link", options: "Item",
            depends_on: "eval:doc.member_type == 'Item'", surface: "quick",
          },
          {
            fieldname: "item_group", label: "Nhóm hàng", fieldtype: "Link", options: "Item Group",
            link_filters: '{"is_group":0,"disabled":0}',
            depends_on: "eval:doc.member_type == 'Item Group'", surface: "quick",
          },
          "note:Data Ghi chú",
        ],
        permissions: perm,
        form: { fields: ["member_type", "item_code", "item_group", "note"] },
        quickEntry: { fields: ["member_type", "item_code", "item_group"] },
      },
    );
    // Từ Data sang Link: phạm vi là danh mục thật, không còn là chuỗi khớp theo tên.
    replaceField(doctype("Pricing Rule"), "pricing_scope", {
      fieldname: "pricing_scope",
      label: "Phạm vi áp dụng",
      fieldtype: "Link",
      options: "Pricing Scope",
      link_filters: '{"disabled":0}',
    });
    note("DANH MỤC · +Pricing Scope (+child) — pricing_scope đổi Data → Link");
  }

  // Pricing Rule đặt tên bằng `format:{title}`, mà `title` là `ALUMDOOR-PR:{mã hàng}:{biến thể}`.
  // Tức tên của nó NHÚNG mã hàng, y như Item Price. Đổi mã mà không đổi được tên chính sách giá
  // thì tên còn ôm mã đã chết và lần chạy sau của importer giá sẽ tạo bản mới thay vì cập nhật.
  {
    const rule = doctype("Pricing Rule");
    if (rule.allow_rename !== true) {
      rule.allow_rename = true;
      note("SALES · Pricing Rule cho phép đổi tên — tên nó nhúng mã hàng qua {title}");
    }
  }

  // ── 2. Quy tắc BOM ──
  // authority_type=SOURCE là trạng thái NHÁP CÓ CHỦ ĐÍCH theo audit 2026-08-16. Khai vào
  // brief KHÔNG có nghĩa là duyệt: mặc định vẫn SOURCE, chủ xưởng mới đổi được.
  if (!hasDoctype("BOM Rule")) {
    brief.doctypes.push(
      {
        "//": "Trước 19/08 doctype này chỉ sống trong doctype_definitions do importer ghi — dựng lại tenant là mất.",
        name: "BOM Rule",
        label: "Quy tắc BOM",
        icon: "function-square",
        group: "Danh mục",
        naming: "field:rule_code",
        title: "rule_name",
        list: ["rule_code", "rule_name", "result_kind", "result_uom", "authority_type", "disabled"],
        search: ["rule_code", "rule_name", "formula_display"],
        fields: [
          "rule_code:Data*! Mã quy tắc",
          "rule_name:Data*! Tên quy tắc",
          "description:Small Text Mô tả",
          "result_kind:Select(LENGTH,AREA,COUNT,WEIGHT,CONSTANT)*! Loại kết quả",
          "result_uom:Link(UOM)*! ĐVT kết quả / tiêu hao",
          "source_field:Link(Geometry Field) Trường nguồn 1 từ hàng cha",
          "source_field_offset:Float Cộng/trừ vào nguồn 1 (m)",
          "source_field_2:Link(Geometry Field) Trường nguồn 2 từ hàng cha",
          "source_field_2_offset:Float Cộng/trừ vào nguồn 2 (m)",
          "operator:Select(COPY,ADD,SUBTRACT,MULTIPLY,DIVIDE,PRODUCT,QUOTIENT,CONSTANT)*! Phép tính",
          "operand:Float Giá trị phép tính",
          "multiply:Float Hệ số nhân cuối",
          "divide:Float Hệ số chia cuối",
          "final_add:Float Cộng/trừ cuối",
          "qty_per_set:Float*! Số lượng mỗi bộ",
          // Đã có trong brief từ trước nhưng thiếu ở bộ sinh — sinh lại là MẤT trường. Khai lại cho khớp.
          "component_count_source:Select(Cố định,Số lá) Số cấu kiện lấy từ",
          {
            "//": "Luật ĐẾM (result_kind COUNT) chỉ ra SỐ cấu kiện, công thức của nó không chứa chiều dài.",
            "//do": [
              "Thợ cần CẢ HAI trục: '47 cây lưới' vô dụng nếu không kèm 'cắt mỗi cây dài bao nhiêu'.",
              "Trường này cho luật khai THẲNG trục hình học mang chiều dài cắt (VD CAT_LA_RONG cho lá",
              "cửa — mỗi lá chạy hết bề rộng cắt). Để trống = nguồn không nói, hệ im lặng thay vì bịa số.",
            ],
            fieldname: "cut_length_field", label: "Trục chiều dài cắt", fieldtype: "Link",
            options: "Geometry Field",
          },
          "rounding:Select(NONE,ROUND,CEIL,FLOOR) Làm tròn",
          "precision:Int Số chữ số",
          "formula_json:Long Text Công thức canonical JSON",
          "formula_display:Data Công thức hiển thị",
          "rule_version:Int*! Phiên bản",
          "applicability:Table(BOM Rule Applicability) Áp dụng cho",
          {
            "//": "SOURCE = trích từ bảng tính nguồn, chưa ai duyệt. Không tự đổi sang OWNER_CONFIRMED.",
            fieldname: "authority_type", label: "Nguồn thẩm quyền", fieldtype: "Select",
            options: "SOURCE\nOWNER_CONFIRMED\nENGINEERING_INFERENCE",
            required: true, default: "SOURCE",
          },
          "source_sheet:Data Sheet nguồn",
          "source_row:Int Dòng nguồn",
          "source_formula_text:Small Text Công thức nguồn gốc",
          "source_formula_code:Data Mã công thức nguồn",
          "source_note:Small Text Ghi chú nguồn / xác nhận",
          "confirmed_by:Data Người xác nhận",
          "confirmed_at:Datetime Thời điểm xác nhận",
          "disabled:Check Ngưng dùng",
        ],
        permissions: permMfg,
      },
      {
        name: "BOM Rule Applicability",
        child: true,
        label: "Áp dụng cho",
        group: "Danh mục",
        naming: "autoincrement",
        fields: [
          "scope_type:Select(BOM,ITEM,ITEM_GROUP,DOOR_TYPE,GENERIC)*! Phạm vi",
          {
            fieldname: "parent_item", label: "Mặt hàng cha", fieldtype: "Link", options: "Item",
            depends_on: "eval:doc.scope_type == 'ITEM'", surface: "quick",
          },
          {
            fieldname: "parent_item_group", label: "Nhóm hàng cha", fieldtype: "Link", options: "Item Group",
            link_filters: '{"is_group":0,"disabled":0}',
            depends_on: "eval:doc.scope_type == 'ITEM_GROUP'", surface: "quick",
          },
          {
            fieldname: "door_type", label: "Loại cửa", fieldtype: "Select",
            options: "\nCửa Đức\nCửa Úc\nCửa Lưới\nCửa Đài Loan\nCửa Siêu Trường\nCửa tấm liền Úc",
            depends_on: "eval:doc.scope_type == 'DOOR_TYPE'", surface: "quick",
          },
          "component_item:Link(Item)*! Thành phần con",
          {
            fieldname: "price_variant", label: "Mã giá", fieldtype: "Data",
            description: "Để trống = mọi mã giá; có giá trị = chỉ áp đúng biến thể này.", surface: "expanded",
          },
          {
            fieldname: "min_area_sqm", label: "Diện tích từ (m²)", fieldtype: "Float",
            description: "Cận dưới; cách tính tại trường Toán tử cận dưới.", surface: "expanded",
          },
          {
            fieldname: "min_area_operator", label: "Toán tử cận dưới", fieldtype: "Select",
            options: "GTE\nGT", default: "GTE",
            description: "GTE = lớn hơn hoặc bằng; GT = lớn hơn nghiêm ngặt.", surface: "expanded",
          },
          {
            fieldname: "max_area_sqm", label: "Diện tích đến (m²)", fieldtype: "Float",
            description: "Cận trên bao gồm; để trống = không giới hạn.", surface: "expanded",
          },
          "bom:Link(Bill of Materials) BOM",
          "priority:Int=(0) Ưu tiên",
          "effective_from:Date Hiệu lực từ",
          "effective_to:Date Hiệu lực đến",
          "note:Data Ghi chú",
          "disabled:Check Ngưng dùng",
        ],
        permissions: permMfg,
        form: { fields: ["scope_type", "parent_item", "parent_item_group", "door_type", "component_item", "price_variant", "min_area_sqm", "min_area_operator", "max_area_sqm", "bom", "priority", "effective_from", "effective_to", "note", "disabled"] },
        quickEntry: { fields: ["scope_type", "component_item"] },
      },
    );
    note("DANH MỤC · +BOM Rule (+child Applicability) — hết sống ngoài brief");
  }

  // ── 3. Một bảng màu, không hai ──
  // ALUMDOOR_COLOR_CATALOG là nguồn luật (25 màu: 18 STĐ + 5 mạ + THÔ + VÂN GỖ). Fixture của
  // brief nguồn còn giữ thêm 22 slug ASCII của CHÍNH các màu đó. Giữ cả hai không phải là
  // "an toàn hơn": nó tạo hai vị trí tồn cho một màu, và không có gì báo khi ai đó chọn nhầm.
  {
    /**
     * NGỪNG DÙNG, không XOÁ khỏi khai báo.
     *
     * Bản đầu của khối này lọc thẳng 22 slug ra khỏi `fixtures`. Nền tảng từ chối đúng chỗ đó:
     *
     *   alumdoor upgrade removes materialized app objects: Fixture Item Color:CAFE, …
     *   An explicit reverse migration or uninstall contract is required.
     *
     * Guard ấy đúng: bỏ một khai báo mà bản ghi vẫn sống trong tenant thì tạo ra vật thể mồ côi
     * không gói nào sở hữu, và uninstall/rollback sau này không suy luận được về nó. Uninstall
     * cũng không phải đường ra — nó từ chối khi doctype còn document.
     *
     * `disabled: true` đạt đúng mục tiêu mà không bỏ khai báo: ô chọn Link đọc
     * `master_records … WHERE disabled=0` nên 22 slug thôi được mời, còn app vẫn sở hữu chúng.
     * Đây cũng đúng BRD §2 — "không xoá khi còn tham chiếu, chỉ disabled".
     */
    const canonical = new Set(ALUMDOOR_COLOR_CATALOG.map((c) => c.code));
    let retired = 0;
    for (const fixture of brief.fixtures) {
      if (fixture.type !== "Item Color" || canonical.has(fixture.name)) continue;
      fixture.data = { ...fixture.data, disabled: true };
      retired += 1;
    }
    note(`DANH MỤC · Item Color: ngừng dùng ${retired} bản sao slug ASCII (giữ khai báo, bỏ khỏi ô chọn)`);
  }

  /**
   * Cùng luật cho NHÓM HÀNG: ngừng dùng, không xoá khai báo.
   *
   * `seed-alumdoor-item-groups-local.sql` xoá 11 nhóm fixture ERP tổng quát (Cửa cuốn, Cửa nhôm
   * kính, Thành phẩm, Nguyên vật liệu, Dịch vụ…) khỏi `master_records`. Nhưng mỗi lần CÀI LẠI
   * APP chúng sống dậy, vì khai báo vẫn còn trong fixtures — dọn ở tầng dữ liệu không thắng
   * được nguồn ở tầng khai báo.
   *
   * Chúng không thuộc phân loại thật của Alumdoor và không chính sách giá hay công thức nào bám
   * vào, nhưng ô chọn Link vẫn mời chúng khi tạo mặt hàng — gán vào "Cửa cuốn" là gán vào hư không.
   */
  {
    const canonicalGroups = new Set(ALUMDOOR_ITEM_GROUP_CATALOG.map((g) => (typeof g === "string" ? g : g.name)));
    let retiredGroups = 0;
    for (const fixture of brief.fixtures) {
      if (fixture.type !== "Item Group" || canonicalGroups.has(fixture.name)) continue;
      fixture.data = { ...fixture.data, disabled: true };
      retiredGroups += 1;
    }
    note(`DANH MỤC · Item Group: ngừng dùng ${retiredGroups} nhóm ERP tổng quát ngoài cây chuẩn`);

    /**
     * Cho một nhóm ngừng dùng thì phải nhặt lại NHỮNG ĐỨA CON của nó.
     *
     * Đợt trước bỏ sót đúng chỗ này: 4 nhóm ĐANG DÙNG — Nan/lá cửa, Phụ kiện CN Đức, Phụ kiện
     * chung, Ray và trục — vẫn lấy `Vật tư & phụ kiện` làm cha, mà nhóm cha đó vừa bị cho ngừng
     * dùng. Cây danh mục gãy một nhánh và không có gì báo, vì link nằm trong JSON.
     *
     * Nhóm chuẩn thay thế là `Phụ kiện & vật tư` — cùng chữ, đảo thứ tự, nên đây là hai tên cho
     * một khái niệm chứ không phải hai khái niệm.
     *
     * Khai tường minh và NÉM khi gặp mồ côi ngoài danh sách: đoán cha là đoán phân loại hàng, mà
     * đoán sai thì mọi chính sách giá bám theo nhóm sẽ ăn nhầm mặt hàng.
     */
    const PARENT_REPLACEMENT = new Map([["Vật tư & phụ kiện", "Phụ kiện & vật tư"]]);
    // Tập "đang dùng" phải là HỢP của hai nguồn: nhóm chuẩn trong catalog (chúng vào D1 qua
    // `documents`) và fixture chưa bị cho ngừng dùng. Chỉ soi fixture thì `Phụ kiện & vật tư` —
    // nhóm cha chuẩn — trông như đã chết, và bản vá này tự chặn chính nó.
    const activeGroups = new Set([
      ...canonicalGroups,
      ...brief.fixtures.filter((f) => f.type === "Item Group" && f.data?.disabled !== true).map((f) => f.name),
    ]);
    let reparented = 0;
    const orphans = [];
    for (const fixture of brief.fixtures) {
      if (fixture.type !== "Item Group" || fixture.data?.disabled === true) continue;
      const parent = fixture.data?.parent_item_group;
      if (!parent || activeGroups.has(parent)) continue;
      const replacement = PARENT_REPLACEMENT.get(parent);
      if (!replacement) { orphans.push(`${fixture.name} → ${parent}`); continue; }
      if (!activeGroups.has(replacement)) throw new Error(`Nhóm thay thế ${replacement} cũng không còn dùng`);
      fixture.data = { ...fixture.data, parent_item_group: replacement };
      reparented += 1;
    }
    if (orphans.length > 0) {
      throw new Error(`Item Group mồ côi cha, chưa khai nhóm thay thế: ${orphans.join(", ")}`);
    }
    if (reparented > 0) note(`DANH MỤC · Item Group: nhặt lại ${reparented} nhóm con mất cha sau khi cho cha ngừng dùng`);
  }

  /**
   * `Stores` — kho mặc định của ERP lọt vào từ lúc dựng máy.
   *
   * Nằm trong `master_records`, KHÔNG có tên kho (trường bắt buộc), không vai trò, không chứng
   * từ nào nhắc tới. Nhưng brief không khai nên installer không quản, mà picker lại đọc hợp hai
   * kho — nên nó vẫn hiện ra cho người dùng chọn.
   *
   * Gỡ đúng cách là KHAI rồi cho ngừng dùng: có khai thì installer mới nắm, và `disabled` giữ
   * lại dấu vết thay vì xoá trắng. Cùng lối đã dùng cho 22 màu và 11 nhóm hàng.
   */
  if (!brief.fixtures.some((row) => row.type === "Warehouse" && row.name === "Stores")) {
    brief.fixtures.push({
      type: "Warehouse",
      name: "Stores",
      data: { warehouse_name: "Stores", is_group: false, disabled: true },
    });
    note("DANH MỤC · Warehouse: khai rồi cho ngừng dùng kho mặc định ERP `Stores`");
  }

  /**
   * `CUST-1` / `CUST-2` — "Acme Corporation" và "Beta Industries".
   *
   * Khách hàng mẫu lọt vào lúc dựng máy, y như kho `Stores`. Không nơi nào tham chiếu (đã đo:
   * 0 chứng từ, 0 dòng con) và thiếu cả `price_group` — trường quyết định giá. Nhưng chúng nằm
   * trong `master_records` mà brief không khai, nên installer không quản, còn ô chọn khách thì
   * vẫn mời chúng ra giữa 440 khách thật.
   *
   * Khai rồi cho ngừng dùng, không xoá — giữ dấu vết và để installer nắm được.
   */
  for (const [code, label] of [["CUST-1", "Acme Corporation"], ["CUST-2", "Beta Industries"]]) {
    if (brief.fixtures.some((row) => row.type === "Customer" && row.name === code)) continue;
    brief.fixtures.push({
      type: "Customer",
      name: code,
      data: { customer_name: label, price_group: "Đại lý", disabled: true },
    });
  }
  note("DANH MỤC · Customer: khai rồi cho ngừng dùng 2 khách mẫu lọt vào lúc dựng máy");

  // ── 4. Bốn doctype rỗng rời khỏi menu, KHÔNG bị xoá ──
  // `menu: false` chứ không xoá doctype: xoá thì bản ghi cũ thành mồ côi — vẫn nằm trong kho
  // dữ liệu nhưng không còn schema nào mô tả chúng. Cả bốn đang 0 bản ghi nên không mất gì,
  // nhưng luật vẫn là luật.
  {
    const offMenu = ["Material Grade", "Item Attribute", "Brand", "Manufacturer"];
    for (const name of offMenu) {
      const d = brief.doctypes.find((x) => x.name === name);
      if (d) d.menu = false;
    }
    const dropped = new Set(offMenu);
    brief.navigation.items = brief.navigation.items.filter((k) => !dropped.has(k));
    note(`DANH MỤC · menu:false cho ${offMenu.length} doctype rỗng (không tài liệu nào đòi)`);
  }

  // ── 5. Nav: mục mới phải có chỗ đứng ──
  for (const name of ["Pricing Scope", "BOM Rule"]) {
    if (!brief.navigation.items.includes(name)) brief.navigation.items.push(name);
  }

  // ── 6. Bản lá ra khỏi code, thành danh mục ──
  // BRD §4.1 gọi đây là "bảng quyết định sinh tử" và khai nó là danh mục có PK `ma`. Nó đang
  // là hằng SLAT_PROFILES trong slats.ts ⇒ chủ xưởng không thêm mã lá mới được, và hai
  // trường BRD đòi (`rong_toi_da_mm`, `trong_luong_kg_m2`) không có chỗ nào để tồn tại.
  if (!hasDoctype("Quy cách cửa")) {
    brief.doctypes.push({
      "//": [
        "buoc_la_m và be_rong_nan_mm là HAI đại lượng, không được gộp. Bảng giá gọi AL70 là",
        "'bản lá 70' (bề rộng nan) nhưng chia lá phải dùng 0,068 — lấy nhầm là lệch 2 lá mỗi bộ.",
      ],
      name: "Quy cách cửa",
      label: "Bản lá theo mã nhôm",
      icon: "ruler",
      group: "Danh mục",
      naming: "field:ma",
      title: "ma",
      list: ["ma", "dong_cua", "doi", "buoc_la_m", "be_rong_nan_mm", "rong_toi_da_mm", "disabled"],
      search: ["ma", "ghi_chu"],
      fields: [
        "ma:Data*! Mã nhôm",
        "dong_cua:Select(Cửa Đức,Cửa Úc,Cửa Lưới,Cửa Đài Loan,Cửa Siêu Trường,Cửa tấm liền Úc)! Dòng cửa",
        {
          "//": "Đời sản phẩm (AL548N vs AL548 CŨ), KHÔNG phải nhôm mới hay đã dùng. Hai đời chênh bản lá tới 10%.",
          fieldname: "doi", label: "Đời sản phẩm", fieldtype: "Select", options: "\nMỚI\nCŨ\nTĐ",
        },
        {
          "//": "Ước số CHIA khi gài chồng. Đây là con số quyết định số lá — không phải bề rộng nan.",
          fieldname: "buoc_la_m", label: "Bản lá / ước số chia (m)", fieldtype: "Float", required: true,
        },
        {
          "//": "CHỈ để nhận diện mã và tra giá. Không bao giờ dùng để chia lá.",
          fieldname: "be_rong_nan_mm", label: "Bề rộng nan (mm)", fieldtype: "Int",
        },
        {
          "//": [
            "Chặn bán cửa rộng hơn số này. BRD nêu dải 4.000 → 7.600 cho cả bảng nhưng KHÔNG",
            "cho con số theo từng mã, nên fixture để trống. Trống = chưa chặn, không phải",
            "'không giới hạn' — điền một con số đại diện ở đây là bịa ra một luật chặn bán.",
          ],
          fieldname: "rong_toi_da_mm", label: "Rộng tối đa (mm)", fieldtype: "Int",
        },
        {
          "//": "Lá đầu chiếm chỗ đúng một lá ruột. AL70 và AL71 không trừ vì đếm TỔNG số lá.",
          fieldname: "tru_mot_la", label: "Trừ một lá", fieldtype: "Check", default: 1,
        },
        "trong_luong_kg_m2:Float Trọng lượng (kg/m2) — dùng cho công thức mua vào",
        "nguon:Data*! Nguồn số liệu",
        "ghi_chu:Small Text Ghi chú",
        "disabled:Check Ngừng dùng",
      ],
      permissions: { "Chủ xưởng": "rwc", "Thủ kho": "r", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
    });
    brief.fixtures.push(
      ...ALUMDOOR_SLAT_CATALOG.map((row) => ({
        type: "Quy cách cửa",
        name: row.ma,
        data: slatCatalogFixtureData(row),
      })),
    );
    if (!brief.navigation.items.includes("Quy cách cửa")) brief.navigation.items.push("Quy cách cửa");
    note(`DANH MỤC · +Quy cách cửa (${ALUMDOOR_SLAT_CATALOG.length} mã bản lá ra khỏi slats.ts)`);
  }

  // ── 7. Nguyên nhân cửa lỗi ──
  // BRD §4.15. Trường quyết định là `ben_chiu_trach_nhiem`: không có nó thì câu hỏi
  // "tháng này mất bao nhiêu tiền vì cắt sai" — nỗi đau #1 của xưởng — không có dữ liệu
  // để trả lời. Khác hẳn `Lý do huỷ` (huỷ chứng từ) và `Nguyên nhân chênh lệch` (kiểm kê).
  if (!hasDoctype("Nguyên nhân cửa lỗi")) {
    brief.doctypes.push({
      name: "Nguyên nhân cửa lỗi",
      label: "Nguyên nhân cửa lỗi",
      icon: "triangle-alert",
      group: "Danh mục",
      naming: "field:reason_code",
      title: "reason_name",
      list: ["reason_code", "reason_name", "nhom_nguyen_nhan", "ben_chiu_trach_nhiem", "disabled"],
      search: ["reason_code", "reason_name"],
      fields: [
        "reason_code:Data*! Mã nguyên nhân",
        "reason_name:Data*! Tên nguyên nhân",
        "nhom_nguyen_nhan:Select(Sản xuất,Vật tư,Bán hàng,Khách)*! Nhóm nguyên nhân",
        {
          "//": "Bên chịu là thứ biến danh mục này thành câu trả lời được bằng tiền, không chỉ là nhãn phân loại.",
          fieldname: "ben_chiu_trach_nhiem", label: "Bên chịu trách nhiệm", fieldtype: "Select",
          options: "Xưởng\nNhà cung cấp\nSale\nKhách hàng", required: true,
        },
        "chi_phi_uoc_tinh:Currency Chi phí ước tính mặc định",
        "sort_order:Int=(0) Thứ tự",
        "disabled:Check Ngừng dùng",
      ],
      permissions: { "Chủ xưởng": "rwc", "Thủ kho": "r", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
    });
    // Seed đúng 12 dòng của BRD §4.15, không thêm bớt.
    const DEFECTS = [
      ["SX-CAT-SO-LA", "Cắt sai số lá", "Sản xuất", "Xưởng"],
      ["SX-CAT-KICH-THUOC", "Cắt sai kích thước", "Sản xuất", "Xưởng"],
      ["SX-SON-LOI", "Sơn lỗi", "Sản xuất", "Xưởng"],
      ["SX-LAP-SAI-PK", "Lắp sai phụ kiện", "Sản xuất", "Xưởng"],
      ["VT-NHOM-LOI", "Nhôm lỗi từ nhà cung cấp", "Vật tư", "Nhà cung cấp"],
      ["VT-PK-LOI", "Phụ kiện lỗi", "Vật tư", "Nhà cung cấp"],
      ["VT-SON-SAI-MAU", "Sơn không đạt màu", "Vật tư", "Nhà cung cấp"],
      ["BH-DO-SAI", "Nhận đo sai", "Bán hàng", "Sale"],
      ["BH-NHAP-SAI-QUY-CACH", "Nhập nhầm quy cách", "Bán hàng", "Sale"],
      ["KH-DOI-Y", "Khách đổi ý sau khi đã cắt", "Khách", "Khách hàng"],
      ["KH-DO-SAI-O-CHO", "Khách đo sai ô chờ", "Khách", "Khách hàng"],
    ];
    brief.fixtures.push(...DEFECTS.map(([code, name, group, owner], index) => ({
      type: "Nguyên nhân cửa lỗi",
      name: code,
      data: {
        reason_code: code, reason_name: name, nhom_nguyen_nhan: group,
        ben_chiu_trach_nhiem: owner, sort_order: (index + 1) * 10, disabled: false,
      },
    })));
    if (!brief.navigation.items.includes("Nguyên nhân cửa lỗi")) brief.navigation.items.push("Nguyên nhân cửa lỗi");
    note(`DANH MỤC · +Nguyên nhân cửa lỗi (${DEFECTS.length} nguyên nhân, có bên chịu trách nhiệm)`);
  }

  // ── 8. Chốt chặn: danh mục bản lá KHÔNG được trôi dạt khỏi bảng đang thi hành ──
  // Đây chính là kiểu lỗi đã sinh ra quyển sổ thứ hai: một luật viết ở hai nơi rồi hai nơi
  // đi lệch nhau. Danh mục và SLAT_PROFILES phải khớp từng con số, kiểm ngay lúc sinh brief.
  {
    const fixtures = brief.fixtures.filter((f) => f.type === "Quy cách cửa");
    const lệch = [];
    for (const row of ALUMDOOR_SLAT_CATALOG) {
      const fx = fixtures.find((f) => f.name === row.ma);
      if (!fx) { lệch.push(`${row.ma}: thiếu fixture`); continue; }
      if (fx.data.buoc_la_m !== row.buoc_la_m) lệch.push(`${row.ma}: bản lá ${fx.data.buoc_la_m} ≠ ${row.buoc_la_m}`);
      if (Boolean(fx.data.tru_mot_la) !== Boolean(row.tru_mot_la)) lệch.push(`${row.ma}: trừ-một-lá lệch`);
    }
    if (lệch.length) throw new Error(`Danh mục bản lá lệch bảng thi hành:\n  ${lệch.join("\n  ")}`);
    note(`chốt chặn: ${fixtures.length} mã bản lá khớp bảng đang thi hành`);
  }
}


// ══════════ BA TRỤC RỜI KHỎI MÃ HÀNG ══════════
//
// Đo trên D1 2026-08-19: 221/587 mặt hàng mang ít nhất một trong ba chiều màu / kiểu bán /
// bậc diện tích ngay TRONG MÃ. Các họ lớn nhất là tích Descartes đầy đủ:
//
//   TP-CUADL6D  →  2 màu × 1 kiểu bán × 8 bậc = 16 mã, không thiếu ô nào
//
// Một tích đầy đủ nhồi vào khoá bản ghi là dấu hiệu kinh điển của chiều bị đặt sai chỗ. Nhưng
// KHÔNG được gỡ nếu chưa có nhà cho chúng — cả ba đều CHỊU LỰC THẬT:
//
//   · bậc diện tích đổi ĐƠN GIÁ — 7/7 họ có thang giá riêng (CUADL1LY: 590k→520k/m²)
//   · kiểu bán đổi CẤU PHẦN — LUOI-SN13x26 trọn bộ 5 cấu phần, tách món 1
//   · màu KHÔNG đổi gì — 0/50 họ có giá khác theo màu ⇒ chỉ màu mới gỡ được ngay
//
// Khối này dựng nhà cho hai chiều còn lại. `Sales Package` từng giữ chúng; khi nó bị khai tử
// ở `46cff213` hai fact này không còn chỗ nên bò vào mã hàng — đây là đường về đúng.
{
  const hasDoctype = (n) => brief.doctypes.some((d) => d.name === n);

  // ── Bậc diện tích ──
  // BRD §4.11: "cận trên ĐÓNG, cận dưới MỞ" ⇒ `3 < S ≤ 4`. Cửa đúng 5,0 m² ăn bậc 4-5.
  // Ghi thành hai cột số để so sánh chạy được, không phải đọc chuỗi "4-5m²".
  if (!hasDoctype("Bậc diện tích")) {
    brief.doctypes.push({
      "//": [
        "Chiều TRA GIÁ, không phải một mặt hàng khác. Trước 2026-08-19 nó nằm trong mã hàng",
        "(`TP-CUADL1LY XN-VK_TRONBO_4-5m²`) nên 8 bậc thành 8 mã, và bảng giá biến thành danh mục.",
      ],
      name: "Bậc diện tích",
      label: "Bậc diện tích",
      icon: "ruler-dimension-line",
      group: "Danh mục",
      naming: "field:tier_code",
      title: "tier_name",
      list: ["tier_code", "tier_name", "min_area_sqm", "max_area_sqm", "sort_order", "disabled"],
      search: ["tier_code", "tier_name"],
      fields: [
        "tier_code:Data*! Mã bậc",
        "tier_name:Data*! Tên bậc",
        {
          "//": "Cận dưới MỞ: diện tích phải LỚN HƠN số này. Bậc đầu tiên để trống = không có cận dưới.",
          fieldname: "min_area_sqm", label: "Trên (m²)", fieldtype: "Float",
        },
        {
          "//": "Cận trên ĐÓNG: diện tích nhỏ hơn hoặc BẰNG số này. Bậc cuối để trống = không có trần.",
          fieldname: "max_area_sqm", label: "Đến và bằng (m²)", fieldtype: "Float",
        },
        "sort_order:Int=(0) Thứ tự",
        "note:Small Text Ghi chú",
        "disabled:Check Ngừng dùng",
      ],
      permissions: { "Chủ xưởng": "rwc", "Kế toán": "rwc", "Kinh doanh": "r", "Thủ kho": "r", "Sản xuất": "r" },
    });

    // Tám bậc đọc thẳng từ mã hàng thật đang chạy, không bịa.
    const TIERS = [
      ["BAC-3-4", "3m² - 4m²", 3, 4],
      ["BAC-4-5", "4m² - 5m²", 4, 5],
      ["BAC-5-6", "5m² - 6m²", 5, 6],
      ["BAC-6-7", "6m² - 7m²", 6, 7],
      ["BAC-7-8", "7m² - 8m²", 7, 8],
      ["BAC-8-9", "8m² - 9m²", 8, 9],
      ["BAC-9-10", "9m² - 10m²", 9, 10],
      ["BAC-TREN-10", "Trên 10m²", 10, null],
    ];
    brief.fixtures.push(...TIERS.map(([code, name, min, max], index) => ({
      type: "Bậc diện tích",
      name: code,
      data: {
        tier_code: code, tier_name: name,
        min_area_sqm: min,
        ...(max === null ? {} : { max_area_sqm: max }),
        sort_order: (index + 1) * 10,
        note: "Nguồn: bậc trong mã hàng Đài Loan trọn bộ đang chạy + BRD §4.11 (cận trên đóng, cận dưới mở).",
        disabled: false,
      },
    })));
    if (!brief.navigation.items.includes("Bậc diện tích")) brief.navigation.items.push("Bậc diện tích");
    note(`DANH MỤC · +Bậc diện tích (${TIERS.length} bậc — chiều tra giá rời khỏi mã hàng)`);
  }


  // ── Ngưỡng chọn Motor / UPS ──
  //
  // `BANG-GIA-CHINH-THUC-31-07-2026 §6` là một BẢNG TRA, và nguồn nói thẳng vì sao nó phải nằm
  // trong app: "chọn lò xo thế nào thì để thợ tự chọn — motor thì CÓ LUẬT RÕ RÀNG nên app tra được".
  //
  // Trước 2026-08-19 luật đó không ở đâu cả. 25 motor đã có trong `Item`, nhưng ngưỡng diện tích
  // (`<15m²` … `<55m²`) thì chỉ nằm trong đầu người bán. Chọn dư một cấp là khách trả thừa vài
  // triệu; chọn thiếu một cấp là motor kéo quá tải rồi hỏng trong hạn bảo hành.
  //
  // Hai luật KHÁC NHAU nên tách hai trường, không gộp làm một:
  //   · motor chọn theo DIỆN TÍCH CỬA
  //   · UPS chọn theo TẢI MOTOR, không theo diện tích
  if (!hasDoctype("Ngưỡng chọn Motor")) {
    brief.doctypes.push({
      "//": [
        "Bảng tra, không phải bảng giá — giá vẫn ở Item Price. Ở đây chỉ trả lời:",
        "cửa chừng này m² thì lắp được motor nào.",
      ],
      name: "Ngưỡng chọn Motor",
      label: "Ngưỡng chọn Motor / UPS",
      icon: "cog",
      group: "Danh mục",
      naming: "field:rule_code",
      title: "item_code",
      list: ["rule_code", "item_code", "selection_basis", "max_area_sqm", "max_motor_kg", "disabled"],
      search: ["rule_code", "item_code"],
      fields: [
        "rule_code:Data*! Mã luật",
        "item_code:Link(Item)*! Motor / UPS",
        {
          "//": "Motor tra theo diện tích cửa; UPS tra theo tải motor. Hai luật khác nhau, không gộp.",
          fieldname: "selection_basis", label: "Tra theo", fieldtype: "Select",
          options: "Diện tích cửa\nTải motor", required: true, default: "Diện tích cửa",
        },
        {
          "//": "Nguồn ghi `<15m²` ⇒ cận trên MỞ: diện tích phải NHỎ HƠN số này, không bằng.",
          fieldname: "max_area_sqm", label: "Dùng cho cửa dưới (m²)", fieldtype: "Float",
          depends_on: "eval:doc.selection_basis == 'Diện tích cửa'",
        },
        {
          "//": "Nguồn ghi `motor <600KG` ⇒ cũng là cận trên MỞ.",
          fieldname: "max_motor_kg", label: "Dùng cho motor dưới (kg)", fieldtype: "Float",
          depends_on: "eval:doc.selection_basis == 'Tải motor'",
        },
        "includes:Small Text Bộ đi kèm",
        "sort_order:Int=(0) Thứ tự",
        "nguon:Data*! Nguồn số liệu",
        "disabled:Check Ngừng dùng",
      ],
      permissions: { "Chủ xưởng": "rwc", "Kinh doanh": "r", "Kế toán": "r", "Thủ kho": "r", "Sản xuất": "r" },
    });

    // Chép nguyên bảng §6, không thêm bớt.
    //
    // Mã hàng cập nhật theo canonical Item đang chạy. Trước đó cả 17 dòng trỏ mã cũ và treo hết:
    // cascade đổi tên chỉ theo `documents`/`document_children`, KHÔNG theo `master_records` —
    // mà danh mục này nằm ở đấy. Vá ở D1 là vá vào chỗ sẽ bị đè khi cài lại app, nên sửa nguồn.
    //
    // Mapping này đối chiếu theo tên sản phẩm nguồn với Item canonical; không suy từ chuỗi mã.
    // UPS chọn mã BLD_UPS_* vì đây là mặt hàng bán, còn LKMT_UPS_* là linh kiện cấu phần.
    const MOTORS = [
      ["MOTO-TANKER-400", "MT_TANKER400KG", 15, "Motor + Lắc 32 + Bộ ĐK"],
      ["MOTO-TANKER-600", "MT_TANKER600KG", 18, "Motor + Lắc 32 + Bộ ĐK"],
      ["MOTO-TANKER-800", "MT_TANKE800KG", 27, "Motor + Lắc 38 + Bộ ĐK"],
      ["MOTO-ALUMAX-400", "MT_ALUMAX400KG", 15, "Motor + Lắc 32 + Bộ ĐK"],
      ["MOTO-ALUMAX-600", "MT_ALUMAX600KG", 25, "Motor + Lắc 32 + Bộ ĐK"],
      ["MOTO-JG-300", "MT_JG300KG", 18, "Motor + Lắc 33 + Bộ ĐK"],
      ["MOTO-JG-400", "MT_JG400KG", 28, "Motor + Lắc 33 + Bộ ĐK"],
      ["MOTO-JG-600", "MT_JG600KG", 36, "Motor + Lắc 36 + Bộ ĐK"],
      ["MOTO-JG-800", "MT_JG800KG", 42, "Motor + Lắc 38 + Bộ ĐK"],
      ["MOTO-JG-1000", "MT_JG1000KG", 48, "Motor + Lắc 40 + Bộ ĐK"],
      ["MOTO-JG-1500", "MT_JG1500KG", 55, "Motor + Lắc 40 + Bộ ĐK"],
      ["MOTO-YHLD-300", "MT_YHLD300KG", 15, "Motor + Lắc 36 + Bộ ĐK"],
      ["MOTO-YHLD-500", "MT_YHLD500KG", 15, "Motor + Lắc 36 + Bộ ĐK"],
      ["MOTO-YHLD-800", "MT_YHLD800KG", 25, "Motor + Lắc 40 + Bộ ĐK"],
      ["MOTO-YHLD-1000", "MT_YHLD1000KG", 35, "Motor + Lắc 40 + Bộ ĐK"],
    ];
    const UPS = [
      ["PIN-E800", "BLD_UPS_E800I", 600, "9 AH"],
      ["PIN-E1000", "BLD_UPS_E1000I", 1000, "12 AH"],
    ];
    const SOURCE = "BANG-GIA-CHINH-THUC-31-07-2026 §6 (bảng có mộc, hiệu lực 31/07/2026)";
    brief.fixtures.push(
      ...MOTORS.map(([code, item, area, includes], index) => ({
        type: "Ngưỡng chọn Motor",
        name: code,
        data: {
          rule_code: code, item_code: item, selection_basis: "Diện tích cửa",
          max_area_sqm: area, includes, sort_order: (index + 1) * 10, nguon: SOURCE, disabled: false,
        },
      })),
      ...UPS.map(([code, item, kg, includes], index) => ({
        type: "Ngưỡng chọn Motor",
        name: code,
        data: {
          rule_code: code, item_code: item, selection_basis: "Tải motor",
          max_motor_kg: kg, includes, sort_order: (MOTORS.length + index + 1) * 10, nguon: SOURCE, disabled: false,
        },
      })),
    );
    if (!brief.navigation.items.includes("Ngưỡng chọn Motor")) brief.navigation.items.push("Ngưỡng chọn Motor");
    note(`DANH MỤC · +Ngưỡng chọn Motor (${MOTORS.length} motor theo diện tích + ${UPS.length} UPS theo tải)`);
  }

  // ── Item Price nhận bậc ──
  // Một mặt hàng, tám giá. Trước đây là tám mặt hàng, mỗi cái một giá.
  {
    /**
     * Bậc "mọi diện tích" — phải khớp `ALL_AREA_TIER` trong `packages/clouderp-pricing/src/index.ts`
     * và trong `scripts/build-alumdoor-pricing-payload.mjs`.
     *
     * Đây là SENTINEL trong khoá đặt tên, không phải một bậc thật: nó cố tình KHÔNG có cận trên
     * lẫn cận dưới, và đường tra giá nhận ra nó bằng MÃ chứ không bằng cận (`priceTierMatches`
     * chặn trước `areaWithinTier`). Vì thế đừng gán cận cho nó — gán cũng không ai đọc.
     */
    const ALL_AREA_TIER = "MOI-DIEN-TICH";
    const price = doctype("Item Price");
    if (!price.fields.some((entry) => nameOf(entry) === "area_tier")) {
      addAfter(price, "uom", {
        "//": [
          "MOI-DIEN-TICH = đơn giá áp cho MỌI diện tích (đa số mặt hàng). Bậc thật = chỉ áp cho bậc đó.",
          "Nhờ vậy một mặt hàng giữ được thang giá 8 bậc mà không cần 8 mã hàng.",
          "BẮT BUỘC có giá trị, không được để trống: nó là một khoá trong `naming` bên dưới, mà",
          "`resolveAutoname` (frappe-model/src/autoname.ts ~124) NÉM LỖI khi khoá trong format rỗng.",
          "Đo trên D1: 558/558 dòng giá hiện không có bậc ⇒ để trống là 558/558 dòng không tạo được.",
          "`default` chỉ cứu được lượt tạo không khai bậc SAU KHI router lấy tài liệu đã áp default",
          "để đặt tên (frappe-api/src/router.ts → namingSource). Trước bản vá đó, createDocument áp",
          "default vào `payload` nhưng gọi resolveNewName bằng `submitted` (thân yêu cầu thô), nên",
          "mọi POST /api/resource/Item Price không tự khai area_tier vẫn bị TỪ CHỐI — đường importer",
          "không dính vì payload luôn phát area_tier (558/558), lỗi chỉ lộ ở màn hình Danh mục.",
        ],
        fieldname: "area_tier",
        label: "Bậc diện tích",
        fieldtype: "Link",
        options: "Bậc diện tích",
        required: true,
        default: ALL_AREA_TIER,
        link_filters: '{"disabled":0}',
      });
      // Khoá đặt tên phải mang bậc, không thì tám dòng giá của cùng một mặt hàng đè lên nhau.
      price.naming = "format:{price_list}:{item_code}:{uom}:{price_variant}:{area_tier}";
      note("SALES · Item Price nhận area_tier — một mặt hàng giữ được thang giá 8 bậc");
    }
    /**
     * Bản ghi sentinel phải TỒN TẠI, không chỉ là quy ước chuỗi.
     *
     * `area_tier` là `Link` tới `Bậc diện tích`, và `generic-controller.ts` ~249 kiểm mọi giá trị
     * Link có bản ghi thật, nếu không thì ném "Bậc diện tích reference is invalid or unavailable".
     * Thiếu bản ghi này thì mọi dòng `Item Price` đều bị từ chối — nặng hơn hẳn cái nó đi chữa.
     *
     * Để trống cả `min_area_sqm` lẫn `max_area_sqm` là CÓ CHỦ Ý: nó không phải một khoảng, và
     * `areaWithinTier` (fail-closed với bậc không cận) không bao giờ được gọi cho nó.
     */
    if (!brief.fixtures.some((entry) => entry.type === "Bậc diện tích" && entry.name === ALL_AREA_TIER)) {
      brief.fixtures.push({
        type: "Bậc diện tích",
        name: ALL_AREA_TIER,
        data: {
          tier_code: ALL_AREA_TIER,
          tier_name: "Mọi diện tích",
          sort_order: 0,
          note: "Sentinel của khoá đặt tên Item Price, KHÔNG phải bậc thật. Đừng gán cận trên/dưới, đừng ngừng dùng: ngừng dùng nó là chặn tạo mọi dòng giá không theo bậc (558/558 dòng đang chạy).",
          disabled: false,
        },
      });
      note("DANH MỤC · +Bậc diện tích MOI-DIEN-TICH — sentinel giữ khoá đặt tên Item Price đủ 5 đoạn");
    }
    // Khoá đặt tên của Item Price NHÚNG mã hàng — 558/558 dòng trên D1 đều vậy. Đổi mã hàng mà
    // không đổi được tên dòng giá thì tên còn ôm mã đã chết, và lần chạy sau của importer giá sẽ
    // tính ra một tên khác rồi TẠO MỚI thay vì cập nhật: 558 dòng giá trùng, và pricing ném
    // "Multiple active Item Price records match" đúng lúc đang bán hàng.
    //
    // Đây là kiểu lỗi chỉ lộ ở lần chạy THỨ HAI, nên bật quyền đổi tên trước khi cần đến.
    if (price.allow_rename !== true) {
      price.allow_rename = true;
      note("SALES · Item Price cho phép đổi tên — khoá đặt tên của nó nhúng mã hàng");
    }
  }

  // ── BOM Template nhận cách giao ──
  // Một mặt hàng, hai định mức: trọn bộ và tách món. Trước đây là hai mặt hàng.
  {
    const template = doctype("BOM Template");
    if (!template.fields.some((entry) => nameOf(entry) === "sales_mode")) {
      addAfter(template, "item_code", {
        "//": [
          "Trống = định mức áp cho mọi cách giao. Có giá trị = chỉ áp khi dòng bán chọn đúng cách đó.",
          "Đo trên D1: LUOI-SN13x26 trọn bộ có 5 cấu phần, tách món có 1 — hai bộ khác nhau thật.",
        ],
        fieldname: "sales_mode",
        label: "Chỉ áp cho cách giao",
        fieldtype: "Select",
        options: "\nTrọn bộ\nTách món",
      });
      note("SẢN XUẤT · BOM Template nhận sales_mode — một mặt hàng giữ được hai định mức");
    }
  }
}

// ══════════ CHỐT CHẶN — không để G2 xảy ra lần nữa ══════════
// G2 lọt được vì thêm trường bắt buộc mà quên fixture, và dry-run KHÔNG bắt (nó biên dịch cấu
// trúc, không chạy validator dữ liệu). Sửa tay một lần thì lần sau vẫn lọt ⇒ viết thành luật
// chạy được, ngay trong máy sinh brief.
{
  const byName = new Map(brief.doctypes.map((d) => [d.name, d]));
  // Cắt phần KIỂU khỏi phần NHÃN. Không được `split(" ")[0]`: options của Select có dấu cách
  // ("Select(Kiểu Đức,Kiểu Úc,…)!") nên cắt theo dấu cách đầu tiên sẽ nuốt mất dấu `!` và
  // trường bắt buộc bị đọc thành không bắt buộc. Lần viết đầu em sai đúng chỗ này — chốt chặn
  // báo "không thiếu cái nào" trong khi cố tình bỏ `leaf_formula` của Cửa Úc. Chốt chặn hỏng
  // còn tệ hơn không có: nó phát tín hiệu xanh.
  const typeSpec = (s) => {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      else if (s[i] === " " && depth === 0) return s.slice(0, i);
    }
    return s;
  };
  const spec = (f) => {
    if (typeof f !== "string") return { name: f.fieldname, required: !!f.required, hasDefault: "default" in f };
    const colon = f.indexOf(":");
    const name = (colon < 0 ? f : f.slice(0, colon)).trim();
    const type = colon < 0 ? "" : typeSpec(f.slice(colon + 1));
    return { name, required: type.includes("!"), hasDefault: /=\(/.test(type) };
  };
  const holes = [];
  for (const fx of brief.fixtures) {
    const dt = byName.get(fx.type);
    if (!dt) continue; // doctype nền tảng — không tự kiểm được, đừng giả vờ là có
    for (const f of dt.fields ?? []) {
      const s = spec(f);
      if (s.required && !s.hasDefault && !(s.name in fx.data)) holes.push(`${fx.type}/${fx.name} thiếu "${s.name}"`);
    }
  }
  if (holes.length) {
    console.error(`\nFIXTURE THIẾU TRƯỜNG BẮT BUỘC (${holes.length}) — dry-run sẽ vẫn PASS, cài thật mới hỏng:`);
    for (const h of holes) console.error("  " + h);
    process.exit(1);
  }
  note(`chốt chặn: ${brief.fixtures.length} fixture, không cái nào thiếu trường bắt buộc`);
}

// ── ALUMINUM INVENTORY AUTHORITY CONVERGENCE ──
// Effective package must be born canonical: purchase/price in Kg, physical stock in Cây/Lá,
// Batch identity + catch weight, and qty_bar as exact purchase stock/allocation quantity.
const technicalItemFields = [
  { fieldname: "purchase_stock_qty_field", fieldtype: "Data", label: "Trường SL tồn mua", hidden: true, read_only: true },
  { fieldname: "purchase_allocation_qty_field", fieldtype: "Data", label: "Trường SL phân bổ mua", hidden: true, read_only: true },
  { fieldname: "purchase_allocation_uom", fieldtype: "Link", options: "UOM", label: "ĐVT phân bổ mua", hidden: true, read_only: true },
];
for (const field of technicalItemFields) {
  if (!item.fields.some((existing) => typeof existing === "object" && existing?.fieldname === field.fieldname)) item.fields.push(field);
}
const canonicalAluminumProfile = { ...fixture("Measurement Profile", "Nhôm cây/lá").data };
canonicalAluminumProfile.stock_uom = "Cây";
canonicalAluminumProfile.track_dimension_lot = true;
canonicalAluminumProfile.require_piece_qty = true;
canonicalAluminumProfile.track_bundle_qty = true;
canonicalAluminumProfile._desc = "Tồn nhôm theo số cây/lá có Batch và chiều dài; số bó chỉ để theo dõi; Kg là catch weight/đơn vị mua-định giá.";
if (!brief.fixtures.some((entry) => entry.type === "Measurement Profile" && entry.name === "Ống/trục")) {
  brief.fixtures.push({
    type: "Measurement Profile",
    name: "Ống/trục",
    data: {
      profile_name: "Ống/trục",
      inventory_mode: "Nhôm cây/lá",
      stock_uom: "Kg",
      track_dimension_lot: true,
      require_color: false,
      require_condition: true,
      require_length: true,
      require_width: false,
      require_piece_qty: true,
      track_bundle_qty: true,
      weight_tolerance_pct: 13,
      note: "Mua và tồn theo Kg; bán theo Mét; số cây và số bó chỉ dùng để theo dõi giao nhận.",
    },
  });
}
for (const f of brief.fixtures) {
  if (f?.type !== "Item" || f?.data?.inventory_mode !== "Nhôm cây/lá") continue;
  if (f.data.measurement_profile === "Ống/trục") continue;
  f.data.stock_uom = "Cây";
  f.data.default_purchase_uom = "Kg";
  f.data.has_batch_no = 1;
  f.data.has_catch_weight = 1;
  f.data.weight_uom = "Kg";
  f.data.purchase_stock_qty_field = "qty_bar";
  f.data.purchase_allocation_qty_field = "qty_bar";
  f.data.purchase_allocation_uom = "Cây";
  f.data.allow_negative_stock = 0;
  f.data.uom_conversions = [];
}
note('AL-INV · package canonical: Kg priced/catch-weight + Cây/Lá stock + Batch + qty_bar descriptors');

// Ô Link nghiệp vụ chỉ được chọn nút lá. Kho/nhóm cha dùng để phân cấp, không phải
// đối tượng có thể nhập-xuất-tồn hoặc gắn trực tiếp vào mặt hàng/chính sách.
// Hai field quản trị cây `parent_warehouse` và `parent_item_group` là ngoại lệ duy nhất.
const leafLinkFilters = JSON.stringify({ is_group: 0, disabled: 0 });
const parentTreeFields = new Set(["parent_warehouse", "parent_item_group"]);
let leafLinkFilterCount = 0;
const applyLeafLinkFilters = (fields, context) => fields.map((input, index) => {
  const field = parseField(input, index, context);
  if (
    field.fieldtype === "Link"
    && ["Warehouse", "Item Group"].includes(field.options)
    && !parentTreeFields.has(field.fieldname)
  ) {
    leafLinkFilterCount += 1;
    return { ...field, link_filters: leafLinkFilters };
  }
  return input;
});
for (const dt of brief.doctypes) {
  dt.fields = applyLeafLinkFilters(dt.fields ?? [], `doctype ${dt.name}`);
}
for (const action of brief.actions ?? []) {
  action.fields = applyLeafLinkFilters(action.fields ?? [], `action ${action.name}`);
}
for (const [dt, entries] of Object.entries(brief.customFields ?? {})) {
  brief.customFields[dt] = entries.map((entry, index) => {
    const wrapped = entry && typeof entry === "object" && !Array.isArray(entry);
    const rawField = wrapped ? entry.field : entry;
    const [filteredField] = applyLeafLinkFilters([rawField], `customFields ${dt}[${index}]`);
    if (filteredField === rawField) return entry;
    return wrapped ? { ...entry, field: filteredField } : { field: filteredField };
  });
}
note(`UI Link · ${leafLinkFilterCount} ô Warehouse/Item Group chỉ chọn nút lá; field cha vẫn chọn nhóm`);


// ── SOURCE → GENERATED REPRODUCIBILITY CONVERGENCE ──
// Historical O2C/master changes had landed directly in alumdoor-v2.json. They now live in
// alumdoor.json; this final boundary keeps later V2 transforms from dropping them again.
// Commit 46cff213 retired Sales Option / Sales Package; regenerated metadata must never
// resurrect sales_option or sales_mode.
{
  const sourceDoctype = (name) => {
    const value = sourceBrief.doctypes.find((entry) => entry.name === name);
    if (!value) throw new Error(`Nguồn thiếu doctype ${name}`);
    return value;
  };
  const replaceFromSource = (name) => {
    const index = brief.doctypes.findIndex((entry) => entry.name === name);
    const value = structuredClone(sourceDoctype(name));
    if (index >= 0) brief.doctypes[index] = value; else brief.doctypes.push(value);
  };
  const sourceField = (doctypeName, fieldname) => {
    const value = sourceDoctype(doctypeName).fields.find((entry) => nameOf(entry) === fieldname);
    if (!value) throw new Error(`Nguồn thiếu ${doctypeName}.${fieldname}`);
    return structuredClone(value);
  };
  const upsertSourceField = (doctypeName, fieldname) => {
    const target = doctype(doctypeName);
    const value = sourceField(doctypeName, fieldname);
    const index = target.fields.findIndex((entry) => nameOf(entry) === fieldname);
    if (index >= 0) target.fields[index] = value; else target.fields.push(value);
  };

  for (const name of [
    "Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng",
    "Credit Note", "Credit Note Item", "Stock Return", "Item Color Scope",
  ]) replaceFromSource(name);

  for (const fieldname of ["install_province", "install_ward", "install_address_line1", "shipping_note"])
    upsertSourceField("Customer", fieldname);
  dropFields(doctype("Customer"), ["address"]);
  upsertSourceField("Price List", "customer_group");
  for (const fieldname of ["bank_account", "contact_person", "phone", "install_province", "install_ward", "shipping_note"])
    upsertSourceField("Sales Order", fieldname);
  upsertSourceField("Sales Order Item", "discount_percentage");
  for (const fieldname of ["theoretical_kg_per_m", "scrap_threshold_m"])
    upsertSourceField("Material Specification", fieldname);
  {
    // Cut Order Item is a V2-derived doctype created by this generator (cbc1dae).
    // d6427f4 added the FIFO source-batch lineage directly to generated V2; keep
    // that field in the generator rather than pretending the legacy source owns the child.
    const target = doctype("Cut Order Item");
    const value = {
      fieldname: "source_batch_no",
      label: "Lô nguồn FIFO",
      fieldtype: "Link",
      options: "Batch",
      required: true,
      read_only: true,
      surface: "expanded",
    };
    const existing = target.fields.findIndex((entry) => nameOf(entry) === "source_batch_no");
    if (existing >= 0) target.fields[existing] = value;
    else {
      const anchor = target.fields.findIndex((entry) => nameOf(entry) === "source_warehouse");
      target.fields.splice(anchor >= 0 ? anchor + 1 : target.fields.length, 0, value);
    }
  }
  doctype("Item").permissions["Chủ xưởng"] = sourceDoctype("Item").permissions["Chủ xưởng"];

  const sourceAction = sourceBrief.actions.find((entry) => entry.name === "don-ban-thanh-hoa-don");
  if (!sourceAction) throw new Error("Nguồn thiếu action don-ban-thanh-hoa-don");
  brief.actions = brief.actions.filter((entry) => entry.name !== "don-ban-thanh-hoa-don");
  brief.actions.push(structuredClone(sourceAction));
  for (const actionName of ["bao-gia-thanh-don", "don-ban-thanh-phieu-xuat"]) {
    const action = brief.actions.find((entry) => entry.name === actionName);
    if (action) delete action.menu;
  }
  const sourceStockReturnValidator = sourceBrief.validators.find((entry) => entry.doctype === "Stock Return");
  if (!sourceStockReturnValidator) throw new Error("Nguồn thiếu validator Stock Return");
  brief.validators = brief.validators.filter((entry) => entry.doctype !== "Stock Return");
  brief.validators.push(structuredClone(sourceStockReturnValidator));

  const quotation = doctype("Quotation");
  quotation.inbox = false;
  delete quotation.menu;
  delete doctype("Sales Invoice").menu;

  /**
   * Chỉ `sales_option` bị xoá. `sales_mode` KHÔNG — nó không phải cùng một thứ.
   *
   * Trước 2026-08-19 chỗ này lọc cả hai với lý do "commit 46cff213 retired Sales Option /
   * Sales Package". Nhưng thứ bị khai tử là DANH MỤC "Cách bán", còn `sales_mode`
   * (Tách món / Trọn bộ) là một FACT CỦA DÒNG BÁN. `SALES-BOM-SOURCE-MAP §5` nói rõ:
   *
   *   "trọn bộ / chỉ lá / tách món trong nguồn đang quyết định PHẠM VI CẤU PHẦN được
   *    giao/sinh ra, không được mặc định đồng nhất với một danh mục 'cách bán' hay với
   *    chính sách giá khách hàng."
   *
   * Xoá lây làm fact đó không còn chỗ nào để tồn tại, và hậu quả đo được bằng tiền: worker
   * vẫn đọc `row.sales_mode` rồi mặc định "Trọn bộ" khi trống, nên MỌI đơn tính như trọn bộ.
   * Đơn đại lý 4m × 3m mua tách món:
   *
   *   Cửa Lưới / Cửa Đài Loan · trọn bộ = Phủ bì ray 12,00 m²
   *                            · tách món = Rộng cắt lá 11,91 m²   ⇒ thu dư 0,09 m²/bộ
   *
   * `Cutting Policy.dealer_split_sales_basis` có sẵn để tính đúng, nhưng không gì truyền cách
   * bán vào nên nhánh đó KHÔNG BAO GIỜ chạy. Và fact bị lấy khỏi dòng bán thì nó bò sang khoá
   * bản ghi — đúng là dựng lại Sales Option qua cửa sau, ở tầng khó gỡ nhất.
   *
   * ĐO LẠI trên NGUỒN GỐC `ms-lien/ĐM.md` bằng `scripts/lib/alumdoor-source-markdown.mjs`
   * (2026-08-19). Cả bản "96 mã nhồi TRONBO" lẫn bản sửa lần trước ("86/355, 5 họ, 12→7") đều
   * SAI; đây là số đếm lại được:
   *
   *  102 / 363   khối định mức có TÊN thành phẩm mang cách giao (698 lần "TRỌN BỘ", 33 "TÁCH MÓN")
   *  100 / 363   khối có MÃ CHA nhồi cách giao
   *  100 / 358   MÃ CHA phân biệt nhồi cách giao: 94 `TRONBO` + 2 `TACHMON` + 4 hậu tố ` - TM`
   *    0 / 235   mã CẤU PHẦN nhồi cách giao — không có. 100 là mã cha, không phải "kể cả cấu phần".
   *    6         họ mã có ĐỦ CẢ HAI biến thể — chỉ 6 họ này gộp mã là mất hẳn một bộ cấu phần
   *
   * Sáu họ đó là toàn bộ phần `sales_mode` mở khoá được, và `buildCodeMapping` tự đếm chúng
   * (`unsafe_merges_unlocked_by_sales_mode`): chạy trên 358 mã cha thật cho 13 họ bị chặn →
   * còn 7 khi mở trục cách giao; 7 họ còn lại bị chặn vì BẬC DIỆN TÍCH, không phải cách giao.
   * Sáu họ: LUOI-MV, LUOI-SN, LUOI-SN13X26, LUOI-SN13X26-INOX, LUOI-SNPHI19-INOX,
   * LUOI-LUOIMV-INOX. Bản trước liệt kê 5 và bỏ sót LUOI-SNPHI19-INOX — ai đọc danh sách đó rồi
   * gộp `TP-LUOI-SNPHI19-INOX - TRONBO` (6 cấu phần) với `- TM` (1 cấu phần) là mất hẳn một bộ.
   *
   * Ba cách viết cho một fact (`TRONBO` / `TACHMON` / ` - TM`) cũng là lý do không được dò cách
   * giao bằng cách bới chuỗi trong mã.
   *
   * `sales_mode` trả về là một Select hai giá trị, KHÔNG Link tới doctype nào, nên nó không
   * hồi sinh `Sales Option`/`Sales Package`. Chốt chặn cuối file vẫn ném lỗi nếu ai dựng lại
   * hai doctype đó.
   */
  for (const target of brief.doctypes) {
    target.fields = (target.fields ?? []).filter((entry) => nameOf(entry) !== "sales_option");
    if (Array.isArray(target.list)) target.list = target.list.filter((entry) => entry !== "sales_option");
    if (Array.isArray(target.search)) target.search = target.search.filter((entry) => entry !== "sales_option");
  }

  // Trả `sales_mode` về đúng ba dòng bán mà công thức đọc tới.
  for (const childName of ["Quotation Item", "Sales Order Item", "Sales Invoice Item"]) {
    const line = doctype(childName);
    if (line.fields.some((entry) => nameOf(entry) === "sales_mode")) continue;
    ensureSalesLineField(line, "set_count", {
      "//": "Fact của dòng, không phải danh mục. Quyết phạm vi cấu phần giao và cơ sở rộng tính tiền.",
      fieldname: "sales_mode",
      fieldtype: "Select",
      options: "Trọn bộ\nTách món",
      default: "Trọn bộ",
      label: "Cách giao",
      in_list_view: true,
      surface: "quick",
    });
  }
  note("SALES · trả sales_mode về dòng bán (Tách món/Trọn bộ) — KHÔNG phải Sales Option");
  const ensureRayTrace = (doctypeName, anchor) => {
    const target = doctype(doctypeName);
    const field = {
      fieldname: "ray_type",
      fieldtype: "Data",
      label: "Loại ray",
      read_only: true,
      depends_on: "eval:doc.door_type == 'Cửa tấm liền Úc'",
      surface: "expanded",
    };
    const index = target.fields.findIndex((entry) => nameOf(entry) === "ray_type");
    if (index >= 0) target.fields[index] = field;
    else {
      const anchorIndex = target.fields.findIndex((entry) => nameOf(entry) === anchor);
      target.fields.splice(anchorIndex >= 0 ? anchorIndex + 1 : target.fields.length, 0, field);
    }
  };
  ensureRayTrace("Production Request Item", "door_type");
  ensureRayTrace("Work Order", "door_type");

  const itemPrice = doctype("Item Price");
  const priceVariantIndex = itemPrice.fields.findIndex((entry) => nameOf(entry) === "price_variant");
  if (priceVariantIndex >= 0 && typeof itemPrice.fields[priceVariantIndex] === "object") {
    const value = { ...itemPrice.fields[priceVariantIndex] };
    if (String(value.fetch_from ?? "").startsWith("sales_option.")) {
      delete value.fetch_from;
      // read_only was only defensible while Sales Option auto-filled this field. With the
      // fetch source gone, a required + read_only field that also appears in the naming
      // format ({price_list}:{item_code}:{uom}:{price_variant}) is unreachable: every write
      // is rejected with "Field is read-only: price_variant", so no non-STANDARD price
      // variant can be created at all. depends_on:eval:false still keeps it out of the UI.
      delete value.read_only;
    }
    itemPrice.fields[priceVariantIndex] = value;
  }
  const salesOrder = doctype("Sales Order");
  const installAddressIndex = salesOrder.fields.findIndex((entry) => nameOf(entry) === "install_address");
  if (installAddressIndex >= 0 && typeof salesOrder.fields[installAddressIndex] === "object") {
    const value = { ...salesOrder.fields[installAddressIndex] };
    if (value.fetch_from === "customer.address") delete value.fetch_from;
    salesOrder.fields[installAddressIndex] = value;
  }
  if (brief.doctypes.some((entry) => ["Sales Option", "Sales Package"].includes(entry.name)))
    throw new Error("Generator resurrected deprecated Sales Option/Sales Package DocType");
  note("REPRO · source-authoritative O2C/master contracts restored; deprecated sales option fields forbidden");
}

// ── Nguyên nhân cửa lỗi: nối dây ──
//
// Danh mục có 11 nguyên nhân thật của xưởng kèm bên chịu trách nhiệm, nhưng tới 19/08 KHÔNG ai
// đọc — audit nền tảng bắt được đúng chỗ đó. Trong khi `Warranty Claim.issue_cause` lại là một
// Select 4 nhóm thô khai riêng: hai bảng phân loại song song cho cùng một câu hỏi.
//
// GHI RÕ CHỖ HỤT, không tự lấp: Select cũ có nhóm "Vận chuyển/lắp đặt" mà danh mục KHÔNG có
// nguyên nhân nào tương ứng, còn danh mục có bên chịu trách nhiệm "Sale" mà Select không có.
// Đây là dữ liệu chủ xưởng phải bổ sung, không phải chỗ để tôi bịa thêm nguyên nhân.
//
// An toàn để đổi ngay: hiện có 0 bản ghi Warranty Claim, nên không có dữ liệu nào phải chuyển.
{
  const claim = brief.doctypes.find((entry) => entry.name === "Warranty Claim");
  const at = (claim?.fields ?? []).findIndex((field) => nameOf(field) === "issue_cause");
  if (claim && at >= 0 && (typeof claim.fields[at] === "string" || claim.fields[at].fieldtype !== "Link")) {
    claim.fields[at] = {
      fieldname: "issue_cause",
      label: "Nguyên nhân",
      fieldtype: "Link",
      options: "Nguyên nhân cửa lỗi",
      required: true,
      link_filters: '{"disabled":0}',
      description: "Chọn nguyên nhân cụ thể từ danh mục. Bên chịu trách nhiệm đi theo nguyên nhân, không khai lại ở đây.",
    };
    note("BẢO HÀNH · issue_cause đổi Select → Link(Nguyên nhân cửa lỗi) — thôi hai bảng phân loại song song");
  }
}

// Ô hiện ra con số mà không nói con số từ đâu thì người dùng không kiểm được. Audit 19/08 đếm
// 118 ô như vậy trên 57 tên trường; mô tả khai theo TÊN TRƯỜNG nên sửa một chỗ là cả 118 ô nhận.
const described = applyFieldDescriptions(brief.doctypes, parseField);
note(`UI · mô tả tiếng Việt cho trường tính toán: ${described} ô`);

// Supplier Item là đường đối chiếu mã hàng/giá mua theo NCC. Giữ trên menu ngay cả khi chưa có
// dữ liệu để người vận hành nhìn thấy trạng thái thiếu và có chỗ bổ sung; ẩn nó chỉ che mất gap.
{
  const supplierItem = brief.doctypes.find((entry) => entry.name === "Supplier Item");
  if (supplierItem) {
    supplierItem.menu = true;
    const items = brief.navigation?.items;
    if (Array.isArray(items) && !items.includes("Supplier Item")) items.push("Supplier Item");
    note("UI · Supplier Item giữ trên menu để hiện đúng gap mã/giá theo NCC");
  }
}

const childPresentation = applyAlumdoorChildPresentation(brief);
// ────────────────── SHIPPED · phần đã sửa thẳng trong brief đang chạy ──────────────────
//
// Những thay đổi dưới đây từng được sửa tay vào `briefs/alumdoor-v2.json` mà không dạy lại
// bộ sinh. Hậu quả: chạy bộ sinh là xoá mất chúng, nên không ai dám chạy, nên mọi cải tiến
// của bộ sinh cũng kẹt luôn — một thế bí hai chiều. Khai lại ở đây để bộ sinh tái lập được
// đúng bản đang chạy, và từ đó chạy nó trở lại an toàn.
{
  // Rộng phủ bì đo theo ray (khách Lẻ) và theo nhựa (khách Đại lý) là HAI trường riêng:
  // dùng chung một ô là gộp hai cách đo khác nhau vào một con số.
  const pbWidthFields = [
    {
      label: "Rộng PB ray (m)",
      fieldname: "width_pb_ray_m",
      fieldtype: "Float",
      depends_on: "eval:doc.inventory_mode == 'Thành phẩm theo m2'",
      description: "Rộng phủ bì đo theo ray cho khách Lẻ; là field riêng, không dùng chung với rộng PB nhựa.",
      surface: "quick",
    },
    {
      label: "Rộng PB nhựa (m)",
      fieldname: "width_pb_nhua_m",
      fieldtype: "Float",
      depends_on: "eval:doc.inventory_mode == 'Thành phẩm theo m2'",
      description: "Rộng phủ bì đo theo nhựa cho khách Đại lý; là field riêng, không dùng chung với rộng PB ray.",
      surface: "quick",
    },
  ];
  const insertBefore = (list, anchor, ...values) => {
    if (!Array.isArray(list)) return;
    const missing = values.filter((value) => !list.includes(value));
    if (!missing.length) return;
    const index = list.indexOf(anchor);
    list.splice(index < 0 ? list.length : index, 0, ...missing);
  };
  for (const lineDoctype of [doctype("Quotation Item"), doctype("Sales Order Item")]) {
    if (!lineDoctype.fields.some((entry) => nameOf(entry) === "width_pb_ray_m")) {
      addAfter(lineDoctype, "color", ...pbWidthFields);
    }
    // Đơn giá do server chốt từ bảng giá/ĐVT/biến thể — người nhập không sửa tay được.
    patchField(lineDoctype, "rate", {
      read_only: true,
      valueSource: "formula",
      editMode: "readonly",
      serverEnforced: true,
      description: "Đơn giá do server lấy từ bảng giá, Item, ĐVT bán và biến thể; người nhập không được sửa tay.",
    });
    insertBefore(lineDoctype.list, "width_m", "width_pb_ray_m", "width_pb_nhua_m");
    insertBefore(lineDoctype.form?.fields, "width_m", "width_pb_ray_m", "width_pb_nhua_m");
    insertBefore(lineDoctype.quickEntry?.fields, "width_m", "width_pb_ray_m", "width_pb_nhua_m");
  }
  note("SHIPPED · Quotation/Sales Order Item: rộng PB ray/nhựa + đơn giá server-enforced");

  const item = doctype("Item");
  if (!item.fields.some((entry) => nameOf(entry) === "gift_rail_min_area_sqm")) {
    addAfter(item, "min_area_sqm",
      {
        fieldname: "gift_rail_min_area_sqm",
        fieldtype: "Float",
        label: "Ngưỡng tặng ray (m²/bộ)",
        default: 8,
        depends_on: "eval:doc.door_type == 'Cửa Đức'",
        description: "Nguồn QUY CÁCH (3).xlsx/ĐƠN GIÁ TRỌN BỘ: chỉ tặng ray khi diện tích một bộ vượt ngưỡng này.",
      },
      {
        fieldname: "gift_rail_area_operator",
        fieldtype: "Select",
        label: "Toán tử ngưỡng tặng ray",
        options: "GT\nGTE",
        default: "GT",
        depends_on: "eval:doc.door_type == 'Cửa Đức'",
        description: "GT = lớn hơn nghiêm ngặt; GTE = lớn hơn hoặc bằng. Quyết định chủ xưởng 22/08/2026 dùng GT (>8 m²).",
      },
    );
  }

  const salesOrder = doctype("Sales Order");
  // Người phụ trách lấy theo nhân viên gắn với user đang đăng nhập, không lấy theo khách.
  patchField(salesOrder, "responsible_person", {
    read_only: true,
    valueSource: "system",
    editMode: "readonly",
    serverEnforced: true,
    description: "Tự lấy Nhân viên đang làm việc gắn với user đăng nhập.",
    fetch_from: undefined,
  });
  const responsibleIndex = salesOrder.fields.findIndex((entry) => nameOf(entry) === "responsible_person");
  if (responsibleIndex >= 0 && typeof salesOrder.fields[responsibleIndex] === "object") {
    const value = { ...salesOrder.fields[responsibleIndex] };
    delete value.fetch_from;
    salesOrder.fields[responsibleIndex] = value;
  }
  if (salesOrder.form?.fields) {
    for (const field of ["deposit_amount", "outstanding_amount"]) {
      if (!salesOrder.form.fields.includes(field)) salesOrder.form.fields.push(field);
    }
  }
  if (salesOrder.form?.previewParentFields) {
    insertBefore(salesOrder.form.previewParentFields, "additional_discount_percentage", "deposit_amount");
  }
  note("SHIPPED · Sales Order: người phụ trách theo user + tiền cọc/còn lại trên form");

  const bomTemplate = doctype("BOM Template");
  bomTemplate.list ??= ["template_code", "item_code", "source_status", "priority", "disabled"];
  bomTemplate.search ??= ["template_code", "item_code", "source_ref"];
  if (!brief.navigation.items.includes("BOM Template")) {
    const anchor = brief.navigation.items.indexOf("Bill of Materials");
    brief.navigation.items.splice(anchor < 0 ? brief.navigation.items.length : anchor + 1, 0, "BOM Template");
  }
  note("SHIPPED · BOM Template: cột danh sách/ô tìm + mục điều hướng");

  // Màn gộp nhiều đơn bán thành một phiếu giao theo lớp FIFO.
  if (!brief.actions.some((entry) => entry.name === "giao-nhieu-don-fifo")) {
    const anchor = brief.actions.findIndex((entry) => entry.name === "don-ban-thanh-phieu-xuat");
    brief.actions.splice(anchor < 0 ? brief.actions.length : anchor + 1, 0, {
      "//": "NHIỀU ĐƠN BÁN → MỘT PHIẾU GIAO. Mỗi dòng giữ exact source row; giá vốn xem theo lớp FIFO và được tính lại lúc submit.",
      name: "giao-nhieu-don-fifo",
      label: "Kho giao hàng nhiều đơn",
      menu: true,
      icon: "truck",
      group: "Bán hàng",
      description: "Chọn nhiều Đơn bán cùng khách/công ty/tiền tệ, xem phần còn phải giao và lớp FIFO rồi tạo đúng một Phiếu giao nháp.",
      permission: "Delivery Note",
      fields: [
        "customer:Link(Customer)! Khách hàng",
        {
          fieldname: "warehouse",
          label: "Kho xuất (trống = theo từng dòng đơn)",
          fieldtype: "Link",
          options: "Warehouse",
          link_filters: "{\"is_group\":0,\"disabled\":0}",
        },
        "posting_at:Datetime!=(Now) Thời điểm giao",
        "install_address:Small Text Địa chỉ giao / lắp đặt",
      ],
      preview: "alumdoor.sales.preview_bulk_delivery | Tải đơn còn phải giao / xem FIFO",
      commit: "alumdoor.sales.bulk_delivery | Tạo một Phiếu giao nháp | Tạo một Phiếu giao nháp cho các Đơn bán đã chọn?",
      resultTable: "source_lines",
    });
    note("SHIPPED · action giao-nhieu-don-fifo (Kho giao hàng nhiều đơn)");
  }

  // Link chỉ được chọn nhóm lá còn hoạt động; Pricing Scope rỗng phải fail-closed ngay trên form.
  replaceField(doctype("Pricing Rule"), "item_group", {
    fieldname: "item_group", label: "Chỉ áp cho nhóm hàng", fieldtype: "Link", options: "Item Group",
    link_filters: '{"is_group":0,"disabled":0}',
  });
  patchField(doctype("Pricing Scope"), "members", {
    required: true,
    description: "Danh sách mặt hàng/nhóm hàng mà phạm vi này áp dụng. Để trống thì phạm vi không match được mặt hàng nào — mọi chính sách giá tham chiếu tới nó sẽ không bao giờ chạy. Phải khai ít nhất một dòng.",
  });

  // Nhóm giá quyết định cả tiền lẫn cơ sở rộng. Không được mặc định âm thầm cho khách chưa phân loại.
  const customer = doctype("Customer");
  const priceGroupIndex = customer.fields.findIndex((entry) => nameOf(entry) === "price_group");
  if (priceGroupIndex >= 0 && typeof customer.fields[priceGroupIndex] === "object") {
    customer.fields[priceGroupIndex] = { ...customer.fields[priceGroupIndex], required: true };
  }

  patchField(doctype("Supplier Item"), "last_purchase_rate", { hidden: undefined, read_only: true });
  {
    const supplierRate = doctype("Supplier Item").fields.find((entry) => nameOf(entry) === "last_purchase_rate");
    if (supplierRate && typeof supplierRate === "object") delete supplierRate.hidden;
  }
  patchField(item, "measurement_profile", {
    description: "Quyết định cách theo dõi tồn kho của TOÀN BỘ mặt hàng này (theo cây, mét, kg, lô...). Chọn sai bộ theo dõi thì mọi phiếu nhập/xuất sau này tính tồn sai theo đúng kiểu đã chọn. Mặt hàng không cần theo dõi đặc biệt thì chọn \"Hàng thường\".",
  });
  patchField(doctype("Item Price"), "area_tier", {
    description: "Bậc diện tích mà dòng giá này áp dụng. Mặc định \"Mọi diện tích\" (một giá dùng chung cho mọi kích thước) — chỉ đổi sang một bậc cụ thể khi mặt hàng có bảng giá phân theo diện tích khác nhau. Không được để trống: hệ thống dùng giá trị này để đặt tên bản ghi.",
  });

  // Tiền cọc và phần còn phải thu là hai trường thật trên đơn, không chỉ là ô trên form.
  if (!salesOrder.fields.some((entry) => nameOf(entry) === "deposit_amount")) {
    addAfter(salesOrder, "grand_total",
      {
        label: "Tiền cọc",
        fieldname: "deposit_amount",
        fieldtype: "Currency",
        default: 0,
        form_region: "full",
        form_width: "full",
        description: "Số tiền khách đặt cọc khi tạo đơn. Không được lớn hơn Tiền phải thu.",
      },
      {
        label: "Còn phải thu",
        fieldname: "outstanding_amount",
        fieldtype: "Currency",
        read_only: true,
        form_region: "full",
        form_width: "full",
      },
    );
  }
  patchField(salesOrder, "grand_total", { label: "Tiền phải thu" });

  // Đơn mua phải nhìn được nguồn yêu cầu, phần đã nhận và phần đã xuất hoá đơn.
  const purchaseOrder = doctype("Purchase Order");
  if (!purchaseOrder.fields.some((entry) => nameOf(entry) === "material_request")) {
    addAfter(purchaseOrder, "supplier_quotation", "material_request:Link(Material Request)- Theo yêu cầu vật tư");
  }
  patchField(purchaseOrder, "received_percentage", { hidden: undefined });
  {
    const received = purchaseOrder.fields.find((entry) => nameOf(entry) === "received_percentage");
    if (received && typeof received === "object") delete received.hidden;
  }
  if (!purchaseOrder.fields.some((entry) => nameOf(entry) === "billed_percentage")) {
    addAfter(purchaseOrder, "received_percentage", {
      fieldname: "billed_percentage", label: "Đã xuất HĐ (%)", fieldtype: "Percent", read_only: true,
      description: "Phần trăm đã xuất hoá đơn mua của đơn này, tính theo số lượng.",
    });
  }
  if (!purchaseOrder.list.includes("billed_percentage")) purchaseOrder.list.push("billed_percentage");

  // Sơn thuê ngoài là một nhánh nghiệp vụ thật của Paint Job, không được mất khi tái sinh brief.
  const paintJob = doctype("Paint Job");
  const paintOutsourceFields = [
    "is_outsourced:Check Sơn thuê ngoài",
    "outsource_supplier:Link(Supplier) NCC sơn thuê ngoài",
    "outsource_formula:Select(Cửa Đức: RCL×Số lá×Số lớp,Cửa Úc: Cao×RCL×2 mặt,Khác - nhập tay) Công thức tính giá thuê sơn",
    "outsource_width_m:Float RCL - Rộng cắt lá (m)",
    "outsource_leaf_count:Int Số lá",
    "outsource_layer_count:Int Số lớp",
    "outsource_height_m:Float Cao (m)",
    "outsource_rate:Currency Đơn giá thuê sơn",
    "outsource_amount:Currency Thành tiền thuê sơn",
  ];
  if (!paintJob.fields.some((entry) => nameOf(entry) === "is_outsourced")) {
    addAfter(paintJob, "note", ...paintOutsourceFields);
  }
  for (const fieldname of ["is_outsourced", "outsource_supplier"]) {
    if (!paintJob.list.includes(fieldname)) paintJob.list.push(fieldname);
  }
  if (!paintJob.search.includes("outsource_supplier")) paintJob.search.push("outsource_supplier");

  // Năm quy tắc BOM trích nguồn: ba quy tắc đủ bằng chứng được bật, hai quy tắc thiếu số cây
  // vẫn giữ disabled để không biến chỗ mơ hồ thành tiêu hao thật.
  for (const fixture of ALUMDOOR_BOM_RULE_FIXTURES) {
    const index = brief.fixtures.findIndex((entry) => entry.type === fixture.type && entry.name === fixture.name);
    const value = structuredClone(fixture);
    if (index >= 0) brief.fixtures[index] = value; else brief.fixtures.push(value);
  }
  note("SHIPPED · catalog authority + purchase progress + outsourced paint preserved by generator");
}

/*
 * ── Master từng CHỈ sống ở tầng `documents` của D1 ──
 *
 * Mười bản ghi dưới đây có thật trong tenant đang chạy nhưng chưa bao giờ được khai ở brief, nên
 * cài lên tenant MỚI là chúng không tồn tại — im lặng, không báo gì. Hậu quả cụ thể lúc phát hiện
 * (2026-08-23): 33 mã ray/trục và 14 mã nan/lá mất bộ đo; 69 mã hàng mất nhóm; và `Kho xưởng` —
 * kho đang giữ TOÀN BỘ bút toán kho — không được tạo, tức tenant mới không có kho làm việc.
 *
 * `Ống/trục` (tồn Cây) vẫn giữ trong brief nhưng KHÔNG mã nào dùng: nó là ý cũ, đã bị `Ray và
 * trục` (tồn Kg) thay thế — xem ghi chú trong chính fixture đó.
 */
brief.fixtures.push(
  {
    "//": "33 mã RT_. MUA Kg · TỒN Kg · BÁN Mét — thay cho ý cũ 'tồn theo cây' của bộ Ống/trục.",
    type: "Measurement Profile",
    name: "Ray và trục",
    data: {
      profile_name: "Ray và trục", inventory_mode: "Cuộn", stock_uom: "Kg",
      track_dimension_lot: true, require_color: false, require_condition: true,
      require_length: true, require_width: false, require_piece_qty: true,
      track_bundle_qty: false, weight_tolerance_pct: 13,
      note: "Ray và trục: MUA Kg · TỒN Kg · BÁN Mét. Hệ số Mét→Kg chính là Kg/m lý thuyết của quy cách. Chiều dài và số cây vẫn ghi trên lô để đối chiếu giao nhận, nhưng TỒN là Kg nên tầng cắt theo cây không áp dụng cho nhóm này.",
      disabled: false,
    },
  },
  {
    "//": "14 mã. Hàng xưởng cán ra từ tôn hoặc nhôm.",
    type: "Measurement Profile",
    name: "Nan/lá cửa",
    data: {
      profile_name: "Nan/lá cửa", inventory_mode: "Tấm/Kính", stock_uom: "m2",
      track_dimension_lot: true, require_color: true, require_condition: false,
      require_length: true, require_width: true, require_piece_qty: false,
      track_bundle_qty: false, weight_tolerance_pct: 13,
      note: "Nan/lá cửa: hàng xưởng CÁN RA từ tôn hoặc nhôm, tồn và bán theo m2. Lá cố định bản (lá đầu, ba lá đáy) thì dùng Mét chứ không dùng bộ này.",
      disabled: false,
    },
  },
  {
    "//": "Nút cha của 'Tôn & nhôm cây' và 'Phụ kiện cần sơn tĩnh điện'. Không mã nào trực thuộc.",
    type: "Item Group",
    name: "Phụ kiện & vật tư",
    data: { item_group_name: "Phụ kiện & vật tư", parent_item_group: "Tất cả mặt hàng", is_group: true },
  },
  {
    "//": "32 mã hàng.",
    type: "Item Group",
    name: "Motor",
    data: { item_group_name: "Motor", parent_item_group: "Motor & điện", is_group: false, disabled: false },
  },
  {
    "//": "4 mã hàng.",
    type: "Item Group",
    name: "Bình lưu điện",
    data: { item_group_name: "Bình lưu điện", parent_item_group: "Motor & điện", is_group: false, disabled: false },
  },
  {
    "//": "28 mã hàng.",
    type: "Item Group",
    name: "Tôn & nhôm cây",
    data: { item_group_name: "Tôn & nhôm cây", parent_item_group: "Phụ kiện & vật tư", is_group: false, disabled: false },
  },
  {
    "//": "5 mã hàng.",
    type: "Item Group",
    name: "Phụ kiện cần sơn tĩnh điện",
    data: { item_group_name: "Phụ kiện cần sơn tĩnh điện", parent_item_group: "Phụ kiện & vật tư", is_group: false, disabled: false },
  },
  {
    "//": "Kho ĐANG GIỮ TOÀN BỘ bút toán kho. Thiếu nó thì tenant mới không có kho làm việc.",
    type: "Warehouse",
    name: "Kho xưởng",
    data: { warehouse_name: "Kho xưởng", is_group: false, stock_role: "Kho chính", disabled: false },
  },
  {
    "//": "Đầu thừa của Kho xưởng.",
    type: "Warehouse",
    name: "Kho đầu thừa",
    data: { warehouse_name: "Kho đầu thừa", parent_warehouse: "Kho xưởng", is_group: false, stock_role: "Kho đầu thừa", disabled: false },
  },
  {
    "//": "Đơn vị tính cước vận chuyển.",
    type: "UOM",
    name: "Chuyến",
    data: { uom_name: "Chuyến", must_be_whole_number: true },
  },
);
/*
 * ── Hoá đơn bán giữ được VAT của đơn hàng (23/08/2026) ──
 *
 * Đơn khai VAT bằng MỘT tỷ lệ ở đầu đơn, còn bộ máy tính tiền và ghi sổ chỉ hiểu bảng `taxes`.
 * Không có bảng đó thì hoá đơn lập từ đơn ra `grand_total` bằng đúng tiền hàng: đo được
 * DH-2026-0001 VAT 8% = 188.800 đ mà hoá đơn của chính nó chỉ ghi 2.360.000 đ, tức công nợ phải
 * thu hụt đúng phần thuế và không màn nào báo.
 */
brief.doctypes.push({
  "//": "Dòng thuế của hoá đơn. Đơn hàng khai VAT bằng MỘT tỷ lệ ở đầu đơn (`vat_rate`), nhưng bộ máy tính tiền và ghi sổ của nền tảng chỉ hiểu bảng `taxes` — nên lúc lập hoá đơn từ đơn, tỷ lệ đó được dịch thành một dòng ở đây. Không có bảng này thì `calculateSalesTotals` nhận mảng rỗng, `grand_total` bằng đúng tiền hàng, và VAT biến mất khỏi sổ: đo ngày 23/08/2026, DH-2026-0001 có VAT 8% = 188.800 đ mà HD-2026-0010 lập từ chính đơn đó chỉ ghi 2.360.000 đ. Công nợ phải thu hụt đúng phần thuế.",
  "name": "Sales Invoice Tax",
  "child": true,
  "label": "Dòng thuế hoá đơn",
  "group": "Công nợ",
  "naming": "autoincrement",
  "title": "account",
  "list": [
    "account",
    "rate",
    "tax_amount"
  ],
  "fields": [
    {
      "label": "Tài khoản thuế",
      "fieldname": "account",
      "fieldtype": "Link",
      "options": "Account",
      "required": true,
      "surface": "quick"
    },
    {
      "label": "Cách tính",
      "fieldname": "charge_type",
      "fieldtype": "Select",
      "options": "On Net Total",
      "default": "On Net Total",
      "required": true,
      "surface": "quick"
    },
    {
      "label": "Thuế suất %",
      "fieldname": "rate",
      "fieldtype": "Percent",
      "required": true,
      "surface": "quick"
    },
    {
      "label": "Tiền thuế",
      "fieldname": "tax_amount",
      "fieldtype": "Currency",
      "read_only": true,
      "serverEnforced": true,
      "surface": "quick"
    }
  ],
  "permissions": {
    "Chủ xưởng": "rwc",
    "Kế toán": "rwc",
    "Kinh doanh": "r"
  },
  "form": {
    "fields": [
      "account",
      "charge_type",
      "rate",
      "tax_amount"
    ]
  },
  "quickEntry": {
    "fields": [
      "account",
      "charge_type",
      "rate",
      "tax_amount"
    ]
  }
});
{
  const hoaDon = brief.doctypes.find((entry) => entry.name === "Sales Invoice");
  const ten = (field) => (typeof field === "string" ? field.split(":")[0].trim() : field.fieldname);
  if (!hoaDon.fields.some((field) => ten(field) === "taxes")) {
    hoaDon.fields.splice(hoaDon.fields.findIndex((field) => ten(field) === "items") + 1, 0, "taxes:Table(Sales Invoice Tax) Thuế");
  }
  if (!hoaDon.fields.some((field) => ten(field) === "total_amount")) {
    hoaDon.fields.splice(hoaDon.fields.findIndex((field) => ten(field) === "grand_total"), 0, "total_amount:Currency~ Tổng cộng tiền hàng");
  }
  if (!hoaDon.list.includes("total_amount")) hoaDon.list.splice(hoaDon.list.indexOf("grand_total"), 0, "total_amount");
}
brief.fixtures.push({
  "//": "TT200 tài khoản 3331 — thuế GTGT đầu ra phải nộp. Thiếu tài khoản này thì VAT trên hoá đơn không có chỗ ghi có, nên bảng `taxes` dựng ra cũng không hạch toán được.",
  "type": "Account",
  "name": "Thuế GTGT phải nộp",
  "data": {
    "account_type": "Liability"
  }
});
/*
 * ── Ba ô kỹ thuật của nhôm cây trên Item: KHAI nhưng ẨN (23/08/2026) ──
 *
 * Chủ xưởng không cần thấy chúng, nên `hidden`. Nhưng gỡ hẳn khỏi doctype thì bản ghi đọc về bị
 * lược mất, mà MƯỜI chỗ trong mã nguồn đọc `item.has_batch_no` / `item.has_catch_weight` để
 * quyết định theo lô, cân thực tế và cung–cầu nhôm. Gỡ hẳn là tắt cả mười chỗ đó lặng lẽ: mọi
 * đơn mua nhôm cây chết với "phải bật has_batch_no…" trong khi D1 có đủ dữ liệu.
 */
{
  const vatTu = brief.doctypes.find((entry) => entry.name === "Item");
  const ten = (field) => (typeof field === "string" ? field.split(":")[0].trim() : field.fieldname);
  const moc = vatTu.fields.findIndex((field) => ten(field) === "purchase_stock_qty_field");
  const them = [
  {
    "fieldname": "has_batch_no",
    "fieldtype": "Check",
    "label": "Quản lý theo lô",
    "hidden": true,
    "//": "Nhôm cây bắt buộc có ba ô này — `aluminumItemContract` từ chối mã thiếu chúng. Trước 23/08/2026 chúng KHÔNG được khai trên doctype nên bản ghi đọc về bị lược mất, và mọi đơn mua nhôm cây chết với \"phải bật has_batch_no; phải bật has_catch_weight; weight_uom phải là Kg\" — dù D1 có đủ dữ liệu. Luồng chính của phân hệ mua đứng hẳn vì ba ô không khai."
  },
  {
    "fieldname": "has_catch_weight",
    "fieldtype": "Check",
    "label": "Cân thực tế",
    "hidden": true,
    "//": "Mua theo Kg cân thực, tồn theo cây đếm thực — hai con số độc lập, không suy ra nhau."
  },
  {
    "fieldname": "weight_uom",
    "fieldtype": "Link",
    "options": "UOM",
    "label": "ĐVT khối lượng",
    "hidden": true
  }
];
  for (const [offset, field] of them.entries()) {
    if (!vatTu.fields.some((entry) => ten(entry) === field.fieldname)) vatTu.fields.splice(moc + offset, 0, field);
  }
}
/*
 * ── Báo giá: ô "có hiệu lực đến" là BẮT BUỘC (23/08/2026) ──
 *
 * `quotation-controller.ts` vốn đã đòi ô này (`requiredText`), nhưng doctype khai không bắt
 * buộc và để nó ở tab phụ — nên người bán điền xong hết mới ăn lỗi, ở một ô họ không nhìn thấy,
 * bằng tiếng Anh. Khai đúng bản chất để form đánh dấu sao và chặn ngay tại chỗ.
 */
{
  const baoGia = brief.doctypes.find((entry) => entry.name === "Quotation");
  const ten = (field) => (typeof field === "string" ? field.split(":")[0].trim() : field.fieldname);
  const viTri = baoGia.fields.findIndex((field) => ten(field) === "valid_till");
  if (viTri >= 0) baoGia.fields[viTri] = {
  "//": "Server BẮT BUỘC ô này (quotation-controller.ts: requiredText). Doctype trước nay khai không bắt buộc và để ở tab phụ, nên người bán điền xong hết mới ăn lỗi \"Valid till is required\" bằng tiếng Anh, ở một ô họ không nhìn thấy. Khai đúng bản chất: bắt buộc, và có mặc định 30 ngày.",
  "fieldname": "valid_till",
  "fieldtype": "Date",
  "label": "Báo giá có hiệu lực đến",
  "required": true,
  "description": "Quá ngày này thì báo giá hết hiệu lực. Bỏ trống là không lưu được."
};
}
note("Báo giá: valid_till thành bắt buộc");

/*
 * ── Báo cáo chỉ đếm chứng từ ĐÃ GHI SỔ, và kho K36 ngừng dùng (23/08/2026) ──
 *
 * Chứng từ nháp không phải là nợ, cũng không phải là cam kết mua. Không lọc `docstatus` thì báo
 * cáo công nợ ghi một khách nợ 2.360.000 từ một hoá đơn NHÁP — nợ không có thật, và không ai kêu
 * vì con số trông hợp lý.
 *
 * K36: chủ xưởng chốt chỉ dùng "Kho xưởng"; K36 chưa từng phát sinh bút toán kho nào.
 */
{
  const dieuKien = {
  "Đơn hàng theo khách": {
    "base_filters": [
      {
        "field": "docstatus",
        "operator": "=",
        "value": 1
      }
    ],
    "//": "Chỉ tính đơn đã ghi sổ."
  },
  "Công nợ theo khách hàng": {
    "base_filters": [
      {
        "field": "docstatus",
        "operator": "=",
        "value": 1
      }
    ],
    "//": "Hoá đơn NHÁP không phải là nợ, hoá đơn ĐÃ HUỶ càng không. Không lọc thì báo cáo ghi khách nợ tiền của một chứng từ chưa ai duyệt — đo 23/08/2026: một hoá đơn nháp 2.360.000 hiện thành nợ thật."
  },
  "Mua hàng theo nhà cung cấp": {
    "base_filters": [
      {
        "field": "docstatus",
        "operator": "=",
        "value": 1
      }
    ],
    "//": "Chỉ tính đơn đã ghi sổ."
  },
  "Đơn mua chưa nhận đủ": {
    "base_filters": [
      {
        "field": "docstatus",
        "operator": "=",
        "value": 1
      }
    ],
    "//": "Đơn mua nháp chưa phải là cam kết với nhà cung cấp. Không có cột mã đơn thì 7 dòng giống hệt nhau (cùng NCC, cùng ngày, cùng tiền) — không biết dòng nào là đơn nào để đi giục.",
    "columns": [
      "name:Data Mã đơn",
      "supplier:Link(Supplier) Nhà cung cấp",
      "transaction_date:Date Ngày đặt",
      "schedule_date:Date Hẹn giao",
      "grand_total:Currency Giá trị đơn",
      "received_percentage:Percent Đã nhận (%)",
      "billed_percentage:Percent Đã có HĐ (%)"
    ]
  },
  "Nhập kho theo nhà cung cấp": {
    "base_filters": [
      {
        "field": "docstatus",
        "operator": "=",
        "value": 1
      }
    ],
    "//": "Chỉ tính phiếu nhập đã ghi sổ."
  }
};
  for (const report of brief.reports ?? []) {
    const khai = dieuKien[report.name];
    if (khai) Object.assign(report, khai);
  }
  const k36 = brief.fixtures.find((entry) => entry.type === "Warehouse" && entry.name === "K36");
  if (k36) Object.assign(k36, {
  "//": "2026-08-23: chủ xưởng chốt CHỈ dùng \"Kho xưởng\". K36 chưa từng phát sinh bút toán kho nào — 9/9 nằm ở Kho xưởng — nên tắt là an toàn. Chuẩn kho ở docs/ALUMDOOR-QUY-TRINH.md mục 0.1 đã cập nhật theo: một địa điểm thì một kho chính là đủ, và đơn bán tự điền được kho xuất mà không phải hỏi ai.",
  "data": {
    "warehouse_name": "K36",
    "is_group": false,
    "stock_role": "Kho chính",
    "disabled": true
  }
});
}
note("Báo cáo: +điều kiện docstatus=1 · K36 ngừng dùng");

note("Item: +3 ô kỹ thuật nhôm cây (ẩn) — has_batch_no, has_catch_weight, weight_uom");

note("Hoá đơn bán: +bảng thuế + tài khoản VAT đầu ra");

note("Master từng chỉ sống ở D1: +10 fixture (2 bộ đo, 5 nhóm hàng, 2 kho, 1 ĐVT)");

note(`UI ?? child-grid presentation metadata: ${childPresentation.migrated} child DocType`);

/*
 * CHẶN GHI ĐÈ BRIEF SOẠN TAY.
 *
 * `briefs/alumdoor-v2.json` không còn là thứ bộ sinh này đẻ ra nữa. Nó đã được sửa tay qua
 * nhiều đợt và bộ sinh tụt lại đúng số mục ghi trong `alumdoor-v2.generator-drift.json`. Chạy
 * `node scripts/build-alumdoor-v2-brief.mjs` không kèm `--out` là ghi đè và mất sạch từng ấy
 * quyết định — im lặng, không báo gì.
 *
 * Nên: mặc định TỪ CHỐI. Muốn ghi đè thật thì phải nói ra bằng cờ, và phải dọn kiểm kê trước.
 */
const KIEM_KE_LECH = resolve(here, "../briefs/alumdoor-v2.generator-drift.json");
if (resolve(OUT) === resolve(here, "../briefs/alumdoor-v2.json") && !process.argv.includes("--ghi-de-brief-da-soan")) {
  let soMuc = 0;
  try {
    const kk = JSON.parse(readFileSync(KIEM_KE_LECH, "utf8"));
    soMuc = ["fixtures_brief_co_generator_khong_sinh", "fixtures_generator_sinh_brief_khong_co",
      "fixtures_hai_ben_khac_noi_dung", "doctypes_khac", "khoa_cap_mot_khac"]
      .reduce((tong, k) => tong + (kk[k]?.length ?? 0), 0);
  } catch { soMuc = -1; }
  throw new Error(
    `TỪ CHỐI ghi đè briefs/alumdoor-v2.json.\n\n`
    + `Brief đó nay là bản SOẠN TAY, không phải sản phẩm của bộ sinh này. Bộ sinh đang tụt lại `
    + `${soMuc < 0 ? "(không đọc được kiểm kê)" : soMuc} mục — xem briefs/alumdoor-v2.generator-drift.json.\n`
    + `Ghi đè bây giờ là mất đúng từng ấy quyết định mà không báo gì.\n\n`
    + `  • Muốn xem bộ sinh đẻ ra gì:  --out <đường-dẫn-khác>\n`
    + `  • Thật sự muốn ghi đè:        --ghi-de-brief-da-soan  (chuyển hết mục trong kiểm kê vào bộ sinh trước đã)`,
  );
}

writeFileSync(OUT, JSON.stringify(brief, null, 2) + "\n", "utf8");
console.log(log.map((l) => "  " + l).join("\n"));
console.log(`\nĐã ghi ${OUT}`);
console.log(`doctypes=${brief.doctypes.length} version=${brief.version}`);
