import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");
const selectionBatchPath = path.resolve(here, "../../client/packages/views/src/action/SelectionBatchActionScreen.tsx");
const operationalReportPath = path.resolve(here, "../../client/packages/views/src/action/OperationalReportActionScreen.tsx");
const documentHistoryPath = path.resolve(here, "../../client/packages/views/src/action/DocumentHistoryActionScreen.tsx");
const registryPath = path.resolve(here, "../../client/apps/runtime/src/experience-registry.tsx");
const OPERATIONAL_REPORT_PREFIX = "OperationalReport:";
const DOCUMENT_HISTORY_PREFIX = "DocumentHistory:";

const SALES_KEYS = [
  "Sales Order",
  "Delivery Note",
  "action:giao-hang-dispatch",
  "action:bao-cao-ban-hang",
  "action:lich-su-ban-hang",
];

test("Alumdoor sales navigation is declaration-driven with no bespoke workbench", async () => {
  const brief = await readBriefSource(briefPath);

  assert.equal(brief.version, "2.3.2");
  assert.deepEqual(brief.dimensions, ["company", "warehouse"]);
  assert.deepEqual(brief.navigation.items.slice(0, SALES_KEYS.length), SALES_KEYS);
  assert.equal(brief.navigation.items.some((key) => key.includes("alumdoor-operations:")), false);

  const bespoke = (brief.experiences ?? []).filter((entry) =>
    entry.key === "alumdoor-operations:workbench" || entry.key === "daily-ledger:workbench");
  assert.deepEqual(bespoke, []);

  const salesOrder = brief.doctypes.find((entry) => entry.name === "Sales Order");
  const deliveryNote = brief.doctypes.find((entry) => entry.name === "Delivery Note");
  assert.equal(salesOrder?.label, "Đơn bán hàng");
  assert.equal(salesOrder?.menu, true);
  assert.equal(salesOrder?.group, "Bán hàng");
  assert.equal(deliveryNote?.label, "Phiếu xuất kho");
  assert.equal(deliveryNote?.menu, true);
  assert.equal(deliveryNote?.group, "Bán hàng");

  const legacyDelivery = brief.actions.find((entry) => entry.name === "giao-hang-theo-ngay");
  const dispatch = brief.actions.find((entry) => entry.name === "giao-hang-dispatch");
  const dashboard = brief.actions.find((entry) => entry.name === "bao-cao-ban-hang");
  const history = brief.actions.find((entry) => entry.name === "lich-su-ban-hang");
  const calculator = brief.actions.find((entry) => entry.name === "tinh-cong-thuc-cua");

  assert.equal(legacyDelivery?.menu, false);
  assert.equal(dispatch?.label, "Giao hàng");
  assert.equal(dispatch?.menu, true);
  assert.equal(dispatch?.group, "Bán hàng");
  assert.match(dispatch?.preview ?? "", /^alumdoor\.delivery_batch\.preview\s*\|/);
  assert.match(dispatch?.commit ?? "", /^alumdoor\.delivery_batch\.create\s*\|/);
  assert.ok(dispatch?.fields.some((field) => typeof field === "string" && field.includes("SelectionBatch:")));

  assert.equal(dashboard?.label, "Báo cáo");
  assert.equal(dashboard?.permissionAction, "read");
  const dashboardField = dashboard?.fields.find((field) => typeof field === "string" && field.startsWith("report_config:Text(OperationalReport:"));
  assert.ok(dashboardField);
  assert.match(dashboardField, /\"sourceDoctype\":\"Sales Order\"/);

  assert.equal(history?.label, "Lịch sử bán hàng");
  assert.equal(history?.permissionAction, "read");
  const historyField = history?.fields.find((field) => typeof field === "string" && field.startsWith("history_config:Text(DocumentHistory:"));
  assert.ok(historyField);
  assert.match(historyField, /\"doctype\":\"Sales Order\"/);
  assert.match(historyField, /\"doctype\":\"Delivery Note\"/);
  assert.match(historyField, /\"doctype\":\"Sales Invoice\"/);
  assert.equal(calculator?.menu, false);

  const pkg = compileBrief(brief);
  assert.equal(pkg.version, "2.3.2");
  assert.deepEqual(pkg.client?.dimensions, ["company", "warehouse"]);
  const sales = pkg.nav.filter((entry) => entry.group === "Bán hàng");
  assert.deepEqual(sales.map((entry) => entry.key), SALES_KEYS);
  assert.equal(sales.some((entry) => entry.key.includes("alumdoor-operations:")), false);

  const compiledDashboard = pkg.actions.find((entry) => entry.name === "bao-cao-ban-hang");
  const configField = compiledDashboard?.fields.find((field) => field.fieldname === "report_config");
  assert.ok(configField?.options?.startsWith(OPERATIONAL_REPORT_PREFIX));
  const config = JSON.parse(configField.options.slice(OPERATIONAL_REPORT_PREFIX.length));
  assert.equal(config.sourceDoctype, "Sales Order");
  assert.equal(config.companyField, "company");
  assert.equal(config.openDoctype, "Sales Order");

  const compiledHistory = pkg.actions.find((entry) => entry.name === "lich-su-ban-hang");
  const compiledHistoryField = compiledHistory?.fields.find((field) => field.fieldname === "history_config");
  assert.ok(compiledHistoryField?.options?.startsWith(DOCUMENT_HISTORY_PREFIX));
  const historyConfig = JSON.parse(compiledHistoryField.options.slice(DOCUMENT_HISTORY_PREFIX.length));
  assert.deepEqual(historyConfig.sources.map((source) => source.doctype), ["Sales Order", "Delivery Note", "Sales Invoice"]);

  assert.ok(pkg.doctypes.some((entry) => entry.name === "Sales Order"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Delivery Note"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Sales Invoice"));
});

test("shared runtime registry contains no Alumdoor workbench dispatch", async () => {
  const registry = await readFile(registryPath, "utf8");
  assert.doesNotMatch(registry, /AlumdoorSales/);
  assert.doesNotMatch(registry, /AlumdoorOperations/);
  assert.doesNotMatch(registry, /daily-ledger:workbench/);
  assert.doesNotMatch(registry, /alumdoor-operations:workbench/);
});

test("SelectionBatch remains generic and requires explicit selection", async () => {
  const source = await readFile(selectionBatchPath, "utf8");
  const previewStart = source.indexOf("const runPreview = async () =>");
  const previewEnd = source.indexOf("useEffect(() =>", previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  const previewSource = source.slice(previewStart, previewEnd);
  assert.match(previewSource, /setSelected\(\[\]\)/);
  assert.doesNotMatch(previewSource, /setSelected\(available\.filter/);
  assert.match(source, /action\.commit\.confirm/);
  assert.match(source, /config\.openDoctype \|\| inferredDoctype\(config\.rowKey\)/);
  assert.doesNotMatch(source, /onOpen\("Sales Order"/);
});

test("generic operational report and history enforce Company context", async () => {
  const [report, history] = await Promise.all([
    readFile(operationalReportPath, "utf8"),
    readFile(documentHistoryPath, "utf8"),
  ]);

  assert.match(report, /if \(config\.companyField && !company\) \{/);
  assert.match(report, /Cần chọn Công ty trên thanh ngữ cảnh trước khi xem báo cáo/);
  assert.match(history, /config\.sources\.some\(\(source\) => source\.companyField\) && !company/);
  assert.match(history, /Cần chọn Công ty trên thanh ngữ cảnh trước khi xem lịch sử/);
  assert.match(history, /Promise\.allSettled/);
});
