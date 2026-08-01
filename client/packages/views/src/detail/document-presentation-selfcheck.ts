import { strict as assert } from "node:assert";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import {
  formatPresentationValue,
  inferDocumentArchetype,
  presentationStatusTone,
  resolveDocumentPresentation,
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
assert.equal(production?.eyebrow, "Lệnh sản xuất");
assert.deepEqual(production?.progress.map((step) => step.state), ["done", "active", "todo"]);

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

console.log("  ✓ archetype, explicit contract, field boundary, status tone, formatting");
