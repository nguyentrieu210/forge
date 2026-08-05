import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");
const OPERATIONAL_REPORT_PREFIX = "OperationalReport:";

const SALES_KEYS = [
  "alumdoor-operations:workbench",
  "Sales Order",
  "Delivery Note",
  "action:giao-hang-dispatch",
  "action:bao-cao-ban-hang",
];
const SALES_LABELS = ["Bán hàng", "Đơn hàng", "Phiếu xuất kho", "Giao hàng", "Báo cáo"];

test("Alumdoor sales exposes composer, canonical order/output, dispatch and in-tab dashboard in 2.3.0", async () => {
  const brief = await readBriefSource(briefPath);

  assert.equal(brief.version, "2.3.0");
  assert.deepEqual(brief.dimensions, ["company", "warehouse"]);
  assert.deepEqual(brief.navigation.items.slice(0, SALES_KEYS.length), SALES_KEYS);

  const experience = brief.experiences.find((entry) => entry.key === "alumdoor-operations:workbench");
  assert.equal(experience?.label, "Bán hàng");
  assert.equal(experience?.group, "Bán hàng");
  assert.equal(experience?.permission, "Sales Order");

  const salesOrder = brief.doctypes.find((entry) => entry.name === "Sales Order");
  const deliveryNote = brief.doctypes.find((entry) => entry.name === "Delivery Note");
  assert.equal(salesOrder?.label, "Đơn hàng");
  assert.equal(salesOrder?.menu, true);
  assert.equal(salesOrder?.group, "Bán hàng");
  assert.equal(deliveryNote?.label, "Phiếu xuất kho");
  assert.equal(deliveryNote?.menu, true);
  assert.equal(deliveryNote?.group, "Bán hàng");

  const legacyDelivery = brief.actions.find((entry) => entry.name === "giao-hang-theo-ngay");
  const dispatch = brief.actions.find((entry) => entry.name === "giao-hang-dispatch");
  const dashboard = brief.actions.find((entry) => entry.name === "bao-cao-ban-hang");
  const calculator = brief.actions.find((entry) => entry.name === "tinh-cong-thuc-cua");
  assert.equal(legacyDelivery?.menu, false);
  assert.equal(dispatch?.label, "Giao hàng");
  assert.equal(dispatch?.menu, true);
  assert.equal(dispatch?.group, "Bán hàng");
  assert.match(dispatch?.preview ?? "", /^alumdoor\.delivery_batch\.preview\s*\|/);
  assert.match(dispatch?.commit ?? "", /^alumdoor\.delivery_batch\.create\s*\|/);
  assert.ok(dispatch?.fields.some((field) => typeof field === "string" && field.includes("SelectionBatch:")));

  assert.equal(dashboard?.label, "Báo cáo");
  assert.equal(dashboard?.menu, true);
  assert.equal(dashboard?.group, "Bán hàng");
  assert.equal(dashboard?.permissionAction, "read");
  const dashboardField = dashboard?.fields.find((field) => typeof field === "string" && field.startsWith("report_config:Text(OperationalReport:"));
  assert.ok(dashboardField);
  assert.match(dashboardField, /\"sourceDoctype\":\"Sales Order\"/);
  assert.match(dashboardField, /\"keyField\":\"customer\"/);
  assert.match(dashboardField, /\"progressField\":\"per_delivered\"/);
  assert.match(dashboardField, /\"companyField\":\"company\"/);
  assert.equal(calculator?.menu, false);

  const legacyReport = brief.reports.find((entry) => entry.name === "Đơn hàng theo khách");
  assert.equal(legacyReport?.menu, false);

  const pkg = compileBrief(brief);
  assert.equal(pkg.version, "2.3.0");
  assert.deepEqual(pkg.client?.dimensions, ["company", "warehouse"]);
  const sales = pkg.nav.filter((entry) => entry.group === "Bán hàng");
  assert.deepEqual(sales.map((entry) => entry.key), SALES_KEYS);
  assert.deepEqual(sales.map((entry) => entry.label), SALES_LABELS);

  const compiledDashboard = pkg.actions.find((entry) => entry.name === "bao-cao-ban-hang");
  assert.equal(compiledDashboard?.permission_action, "read");
  const configField = compiledDashboard?.fields.find((field) => field.fieldname === "report_config");
  assert.ok(configField?.options?.startsWith(OPERATIONAL_REPORT_PREFIX));
  const config = JSON.parse(configField.options.slice(OPERATIONAL_REPORT_PREFIX.length));
  assert.equal(config.sourceDoctype, "Sales Order");
  assert.equal(config.submittedOnly, true);
  assert.equal(config.keyField, "customer");
  assert.equal(config.valueField, "grand_total");
  assert.equal(config.progressField, "per_delivered");
  assert.equal(config.dueDateField, "delivery_date");
  assert.equal(config.companyField, "company");
  assert.equal(config.openDoctype, "Sales Order");

  const navByKey = new Map(pkg.nav.map((entry) => [entry.key, entry]));
  assert.equal(navByKey.has("action:tinh-cong-thuc-cua"), false);
  assert.equal(navByKey.has("action:giao-hang-theo-ngay"), false);
  assert.equal(navByKey.has("report:Đơn hàng theo khách"), false);
  assert.equal(navByKey.get("action:giao-hang-dispatch")?.kind, "experience");
  assert.equal(navByKey.get("action:bao-cao-ban-hang")?.kind, "experience");
  assert.equal(navByKey.get("alumdoor-operations:workbench")?.kind, "experience");

  assert.ok(pkg.actions.some((entry) => entry.name === "giao-hang-theo-ngay"));
  assert.ok(pkg.actions.some((entry) => entry.name === "giao-hang-dispatch"));
  assert.ok(pkg.actions.some((entry) => entry.name === "bao-cao-ban-hang"));
  assert.ok(pkg.actions.some((entry) => entry.name === "tinh-cong-thuc-cua"));
  assert.ok(pkg.reports.some((entry) => entry.name === "Đơn hàng theo khách"), "legacy report stays installed/callable");
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Sales Order"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Delivery Note"));
});
