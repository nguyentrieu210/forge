import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");

const PROCUREMENT_KEYS = [
  "action:tao-don-mua",
  "action:nhap-nhom-hang-loat",
  "action:bao-cao-giao-hang-ncc",
  "Purchase Order",
];
const PROCUREMENT_LABELS = ["Mua hàng", "Nhập hàng", "Báo cáo", "Lịch sử mua hàng"];
const MASTER_DETAIL_PREFIX = "MasterDetailList:";

test("Alumdoor procurement exposes four operational tabs bound to shared context in 2.3.0", async () => {
  const brief = await readBriefSource(briefPath);

  assert.equal(brief.version, "2.3.0");
  assert.deepEqual(brief.dimensions, ["company", "warehouse"]);
  const procurementStart = brief.navigation.items.indexOf(PROCUREMENT_KEYS[0]);
  assert.notEqual(procurementStart, -1);
  assert.deepEqual(brief.navigation.items.slice(procurementStart, procurementStart + PROCUREMENT_KEYS.length), PROCUREMENT_KEYS);

  const purchaseOrder = brief.doctypes.find((entry) => entry.name === "Purchase Order");
  const purchaseReceipt = brief.doctypes.find((entry) => entry.name === "Purchase Receipt");
  assert.equal(purchaseOrder?.label, "Lịch sử mua hàng");
  assert.equal(purchaseOrder?.menu, true);
  assert.equal(purchaseOrder?.group, "Mua hàng");
  assert.equal(purchaseReceipt?.menu, false);

  const createOrder = brief.actions.find((entry) => entry.name === "tao-don-mua");
  const fifo = brief.actions.find((entry) => entry.name === "nhap-nhom-fifo");
  const bulk = brief.actions.find((entry) => entry.name === "nhap-nhom-hang-loat");
  const reportAction = brief.actions.find((entry) => entry.name === "bao-cao-giao-hang-ncc");
  const settlement = brief.actions.find((entry) => entry.name === "doi-soat-giao-hang-ncc");

  assert.equal(createOrder?.label, "Mua hàng");
  assert.equal(createOrder?.menu, true);
  assert.equal(createOrder?.group, "Mua hàng");
  assert.match(createOrder?.commit ?? "", /^alumdoor\.purchase\.create_order\s*\|/);
  assert.equal(createOrder?.fields.some((field) => typeof field === "string" && field.startsWith("company:")), false, "Company comes from Business Context, not duplicate form input");
  const createGrid = createOrder?.fields.find((field) => typeof field === "string" && field.startsWith("items:Text(BulkTransaction:"));
  assert.ok(createGrid);
  assert.match(createGrid, /\"fit_viewport\":false/);
  assert.equal(/\"fieldname\":\"uom\"/.test(createGrid), false, "UOM is derived from Item/server, not a primary operator column");
  assert.equal(/\"fieldname\":\"theoretical_kg_per_m\"/.test(createGrid), false, "kg/m is derived from Material Specification");
  assert.equal(/\"fieldname\":\"amount\"/.test(createGrid), false, "amount is server derived");

  assert.equal(fifo?.menu, false);

  assert.equal(bulk?.label, "Nhập hàng");
  assert.equal(bulk?.menu, true);
  assert.equal(bulk?.group, "Mua hàng");
  assert.match(bulk?.preview ?? "", /^alumdoor\.purchase\.preview_bulk_direct_receipt\s*\|/);
  assert.match(bulk?.commit ?? "", /^alumdoor\.purchase\.bulk_direct_receipt\s*\|/);
  assert.equal(bulk?.fields.some((field) => typeof field === "string" && field.startsWith("company:")), false);
  assert.equal(bulk?.fields.some((field) => typeof field === "string" && field.startsWith("warehouse:")), false, "Warehouse comes from Business Context");
  const receivingGrid = bulk?.fields.find((field) => typeof field === "string" && field.startsWith("lines:Text(BulkTransaction:"));
  assert.ok(receivingGrid);
  assert.match(receivingGrid, /\"fit_viewport\":false/);
  assert.equal(/purchase_order|Đơn NCC/.test(receivingGrid), false);
  assert.equal(/\"fieldname\":\"uom\"/.test(receivingGrid), false);
  assert.equal(/\"fieldname\":\"theoretical_kg_per_m\"/.test(receivingGrid), false);
  assert.equal(/\"fieldname\":\"theoretical_kg\"/.test(receivingGrid), false);

  assert.equal(reportAction?.label, "Báo cáo");
  assert.equal(reportAction?.menu, true);
  assert.equal(reportAction?.group, "Mua hàng");
  assert.equal(reportAction?.permissionAction, "read");
  assert.match(reportAction?.commit ?? "", /^alumdoor\.purchase\.supplier_delivery_dashboard\s*\|/);
  assert.ok(reportAction?.fields.some((field) => typeof field === "string" && field.startsWith("view_config:Text(MasterDetailList:")));
  assert.equal(settlement?.menu, false);

  const purchaseReport = brief.reports.find((entry) => entry.name === "Mua hàng theo nhà cung cấp");
  assert.equal(purchaseReport?.label, "Mua theo nhà cung cấp");
  assert.equal(purchaseReport?.group, "Báo cáo");

  const pkg = compileBrief(brief);
  assert.equal(pkg.version, "2.3.0");
  assert.deepEqual(pkg.client?.dimensions, ["company", "warehouse"]);
  const procurement = pkg.nav.filter((entry) => entry.group === "Mua hàng");
  assert.deepEqual(procurement.map((entry) => entry.key), PROCUREMENT_KEYS);
  assert.deepEqual(procurement.map((entry) => entry.label), PROCUREMENT_LABELS);

  const report = pkg.actions.find((entry) => entry.name === "bao-cao-giao-hang-ncc");
  assert.equal(report?.permission_action, "read");
  assert.equal(report?.commit.method, "alumdoor.purchase.supplier_delivery_dashboard");
  const configField = report?.fields.find((field) => field.fieldname === "view_config");
  assert.ok(configField?.options?.startsWith(MASTER_DETAIL_PREFIX));
  const config = JSON.parse(configField.options.slice(MASTER_DETAIL_PREFIX.length));
  assert.equal(config.sourceDoctype, "Purchase Order");
  assert.equal(config.submittedOnly, true);
  assert.deepEqual(config.exceptionPredicate, { field: "received_percentage", operator: "<", value: 100 });
  assert.equal(config.detailCollection, "purchase_order_lines");
  assert.equal(config.detailRemainingField, "remaining_bars");
  assert.equal(config.openDoctype, "Purchase Order");
  assert.equal(config.chartTop, 8);
  assert.equal(config.valueFormat, "currency");

  const navByKey = new Map(pkg.nav.map((entry) => [entry.key, entry]));
  assert.equal(navByKey.has("Purchase Receipt"), false);
  assert.equal(navByKey.has("action:nhap-nhom-fifo"), false);
  assert.equal(navByKey.has("action:doi-soat-giao-hang-ncc"), false);
  assert.equal(navByKey.get("report:Mua hàng theo nhà cung cấp")?.group, "Báo cáo");

  assert.ok(pkg.doctypes.some((entry) => entry.name === "Purchase Order"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Purchase Receipt"));
  assert.ok(pkg.actions.some((entry) => entry.name === "tao-don-mua"));
  assert.ok(pkg.actions.some((entry) => entry.name === "nhap-nhom-fifo"));
  assert.ok(pkg.actions.some((entry) => entry.name === "nhap-nhom-hang-loat"));
  assert.ok(pkg.actions.some((entry) => entry.name === "bao-cao-giao-hang-ncc"));
  assert.ok(pkg.actions.some((entry) => entry.name === "doi-soat-giao-hang-ncc"));
});
