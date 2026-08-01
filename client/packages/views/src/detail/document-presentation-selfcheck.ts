import { strict as assert } from "node:assert";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import { resolveDocumentExperienceProfile } from "./document-experience-profile.js";
import {
  formatPresentationValue,
  inferDocumentArchetype,
  presentationStatusTone,
  resolveDocumentPresentation,
  type DocumentArchetype,
} from "./document-presentation.js";

function meta(name: string, fields: DocTypeMeta["fields"], extra: Record<string, unknown> = {}): DocTypeMeta {
  return {
    name,
    label: name,
    fields,
    permissions: [],
    ...extra,
  } as DocTypeMeta;
}

console.log("document presentation selfcheck:");

assert.equal(inferDocumentArchetype("Sales Order"), "transaction");
assert.equal(inferDocumentArchetype("Stock Entry"), "inventory");
assert.equal(inferDocumentArchetype("Work Order"), "production");
assert.equal(inferDocumentArchetype("Payment Entry"), "ledger");
assert.equal(inferDocumentArchetype("Customer"), "master");

const archetypes: DocumentArchetype[] = ["master", "transaction", "inventory", "production", "approval", "ledger", "analysis", "generic"];
const profiles = archetypes.map(resolveDocumentExperienceProfile);
assert.equal(new Set(profiles.map((profile) => profile.railTitle)).size, archetypes.length, "mỗi archetype phải có ngữ cảnh đọc riêng");
assert.equal(new Set(profiles.map((profile) => profile.accentClass)).size, archetypes.length, "mỗi archetype phải có visual accent riêng");

const salesMeta = meta("Sales Order", [
  { fieldname: "customer", fieldtype: "Link", label: "Khách hàng", options: "Customer" },
  { fieldname: "transaction_date", fieldtype: "Date", label: "Ngày đặt" },
  { fieldname: "grand_total", fieldtype: "Currency", label: "Tổng tiền" },
  { fieldname: "outstanding_amount", fieldtype: "Currency", label: "Còn nợ" },
  { fieldname: "workflow_state", fieldtype: "Data", label: "Trạng thái" },
], { title_field: "customer" });
const salesDoc: Doc = {
  doctype: "Sales Order",
  name: "SO-2026-0001",
  customer: "Công ty Minh Phát",
  transaction_date: "2026-08-02",
  grand_total: 128500000,
  outstanding_amount: 78500000,
  workflow_state: "Đang sản xuất",
};
const sales = resolveDocumentPresentation(salesMeta, salesDoc);
assert.ok(sales);
assert.equal(sales?.archetype, "transaction");
assert.equal(sales?.title, "Công ty Minh Phát");
assert.equal(sales?.status, "Đang sản xuất");
assert.equal(sales?.statusTone, "info");
assert.deepEqual(sales?.metrics.map((metric) => metric.field), ["grand_total", "outstanding_amount"]);
assert.ok(sales?.contextItems.some((item) => item.field === "transaction_date"));

const purchase = resolveDocumentPresentation(meta("Purchase Order", [
  { fieldname: "supplier", fieldtype: "Link", label: "Nhà cung cấp", options: "Supplier" },
  { fieldname: "transaction_date", fieldtype: "Date", label: "Ngày đặt" },
  { fieldname: "grand_total", fieldtype: "Currency", label: "Tổng đặt" },
  { fieldname: "advance_paid", fieldtype: "Currency", label: "Đã trả" },
  { fieldname: "status", fieldtype: "Data", label: "Trạng thái" },
], { title_field: "supplier" }), {
  doctype: "Purchase Order",
  name: "PO-2026-0001",
  supplier: "Tiến Đạt",
  transaction_date: "2026-08-02",
  grand_total: 56016000,
  advance_paid: 20000000,
  status: "To Receive and Bill",
});
assert.equal(purchase?.archetype, "transaction");
assert.deepEqual(purchase?.metrics.map((metric) => metric.field), ["grand_total", "advance_paid"]);

const stock = resolveDocumentPresentation(meta("Stock Entry", [
  { fieldname: "purpose", fieldtype: "Select", label: "Mục đích" },
  { fieldname: "posting_date", fieldtype: "Date", label: "Ngày ghi nhận" },
  { fieldname: "from_warehouse", fieldtype: "Link", label: "Kho đi", options: "Warehouse" },
  { fieldname: "to_warehouse", fieldtype: "Link", label: "Kho đến", options: "Warehouse" },
  { fieldname: "total_qty", fieldtype: "Float", label: "Tổng số lượng" },
  { fieldname: "difference_amount", fieldtype: "Currency", label: "Chênh lệch" },
]), {
  doctype: "Stock Entry",
  name: "STE-0001",
  purpose: "Material Transfer",
  posting_date: "2026-08-02",
  from_warehouse: "Kho A",
  to_warehouse: "Kho B",
  total_qty: 120,
  difference_amount: 0,
});
assert.equal(stock?.archetype, "inventory");
assert.deepEqual(stock?.metrics.map((metric) => metric.field), ["total_qty", "difference_amount"]);
assert.ok(stock?.contextItems.some((item) => item.field === "from_warehouse"));
assert.ok(stock?.contextItems.some((item) => item.field === "to_warehouse"));

const explicitMeta = meta("Work Order", [
  { fieldname: "production_item", fieldtype: "Link", label: "Sản phẩm", options: "Item" },
  { fieldname: "workflow_state", fieldtype: "Data", label: "Trạng thái" },
  { fieldname: "qty", fieldtype: "Float", label: "Kế hoạch" },
], {
  title_field: "production_item",
  presentation: {
    archetype: "production",
    eyebrow: "Lệnh sản xuất",
    statusField: "workflow_state",
    metrics: [{ field: "qty", label: "Số lượng kế hoạch" }],
    progress: {
      field: "workflow_state",
      steps: ["Chờ", "Đang sản xuất", "Hoàn tất"],
    },
  },
});
const production = resolveDocumentPresentation(explicitMeta, {
  doctype: "Work Order",
  name: "WO-0001",
  production_item: "AL71",
  workflow_state: "Đang sản xuất",
  qty: 200,
});
assert.equal(production?.archetype, "production");
assert.equal(production?.eyebrow, "Lệnh sản xuất");
assert.deepEqual(production?.progress.map((step) => step.state), ["done", "active", "todo"]);

const customer = resolveDocumentPresentation(meta("Customer", [
  { fieldname: "customer_name", fieldtype: "Data", label: "Tên khách hàng" },
  { fieldname: "customer_group", fieldtype: "Link", label: "Nhóm", options: "Customer Group" },
  { fieldname: "credit_limit", fieldtype: "Currency", label: "Hạn mức" },
  { fieldname: "outstanding_amount", fieldtype: "Currency", label: "Công nợ" },
], { title_field: "customer_name" }), {
  doctype: "Customer",
  name: "CUS-0001",
  customer_name: "Minh Phát",
  customer_group: "Doanh nghiệp",
  credit_limit: 500000000,
  outstanding_amount: 180000000,
});
assert.equal(customer?.archetype, "master");
assert.deepEqual(customer?.metrics.map((metric) => metric.field), ["outstanding_amount", "credit_limit"]);

const payment = resolveDocumentPresentation(meta("Payment Entry", [
  { fieldname: "party", fieldtype: "Dynamic Link", label: "Đối tượng" },
  { fieldname: "posting_date", fieldtype: "Date", label: "Ngày" },
  { fieldname: "paid_amount", fieldtype: "Currency", label: "Số tiền chi" },
  { fieldname: "received_amount", fieldtype: "Currency", label: "Số tiền thu" },
  { fieldname: "mode_of_payment", fieldtype: "Link", label: "Phương thức", options: "Mode of Payment" },
], { title_field: "party" }), {
  doctype: "Payment Entry",
  name: "PAY-0001",
  party: "Minh Phát",
  posting_date: "2026-08-02",
  paid_amount: 0,
  received_amount: 50000000,
  mode_of_payment: "Tiền mặt",
});
assert.equal(payment?.archetype, "ledger");
assert.deepEqual(payment?.metrics.map((metric) => metric.field), ["paid_amount", "received_amount"]);
assert.ok(payment?.contextItems.some((item) => item.field === "mode_of_payment"));

const internalSafeMeta = meta("Sales Order", [
  { fieldname: "customer", fieldtype: "Data", label: "Khách hàng" },
], {
  presentation: {
    titleField: "server_secret",
    metrics: [{ field: "server_secret", label: "Không được lộ" }],
  },
});
const internalSafe = resolveDocumentPresentation(internalSafeMeta, {
  doctype: "Sales Order",
  name: "SO-2",
  customer: "Khách A",
  server_secret: "SECRET",
});
assert.equal(internalSafe?.title, "Khách A");
assert.equal(internalSafe?.metrics.length, 0);

const disabledMeta = meta("Customer", [
  { fieldname: "customer_name", fieldtype: "Data", label: "Tên" },
], { presentation: { enabled: false } });
assert.equal(resolveDocumentPresentation(disabledMeta, { doctype: "Customer", name: "CUS-1", customer_name: "A" }), null);

assert.equal(presentationStatusTone("Đã duyệt"), "success");
assert.equal(presentationStatusTone("Chờ duyệt"), "warning");
assert.equal(presentationStatusTone("Quá hạn"), "danger");
assert.equal(formatPresentationValue(128500000, "currency"), "128.500.000");
assert.equal(formatPresentationValue("2026-08-02", "date"), "02/08/2026");

console.log("  ✓ archetype profiles, six reference screens, field boundary, status tone, formatting");
