import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");
const composerPath = path.resolve(here, "../../client/apps/runtime/src/experiences/AlumdoorSalesComposer.tsx");
const orderQueuePath = path.resolve(here, "../../client/apps/runtime/src/experiences/AlumdoorSalesOrderQueue.tsx");
const selectionBatchPath = path.resolve(here, "../../client/packages/views/src/action/SelectionBatchActionScreen.tsx");
const operationalReportPath = path.resolve(here, "../../client/packages/views/src/action/OperationalReportActionScreen.tsx");
const documentHistoryPath = path.resolve(here, "../../client/packages/views/src/action/DocumentHistoryActionScreen.tsx");
const OPERATIONAL_REPORT_PREFIX = "OperationalReport:";
const DOCUMENT_HISTORY_PREFIX = "DocumentHistory:";

const SALES_KEYS = [
  "alumdoor-operations:workbench",
  "Sales Order",
  "Delivery Note",
  "action:giao-hang-dispatch",
  "action:bao-cao-ban-hang",
  "action:lich-su-ban-hang",
];
const SALES_LABELS = ["Tạo đơn", "Danh sách đơn hàng", "Phiếu xuất kho", "Giao hàng", "Báo cáo", "Lịch sử bán hàng"];

test("Alumdoor sales exposes composer, order/output, dispatch, dashboard and canonical history in 2.3.2", async () => {
  const brief = await readBriefSource(briefPath);

  assert.equal(brief.version, "2.3.2");
  assert.deepEqual(brief.dimensions, ["company", "warehouse"]);
  assert.deepEqual(brief.navigation.items.slice(0, SALES_KEYS.length), SALES_KEYS);

  const experience = brief.experiences.find((entry) => entry.key === "alumdoor-operations:workbench");
  assert.equal(experience?.label, "Tạo đơn");
  assert.equal(experience?.group, "Bán hàng");
  assert.equal(experience?.permission, "Sales Order");

  const salesOrder = brief.doctypes.find((entry) => entry.name === "Sales Order");
  const deliveryNote = brief.doctypes.find((entry) => entry.name === "Delivery Note");
  assert.equal(salesOrder?.label, "Danh sách đơn hàng");
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
  assert.equal(dashboard?.menu, true);
  assert.equal(dashboard?.group, "Bán hàng");
  assert.equal(dashboard?.permissionAction, "read");
  const dashboardField = dashboard?.fields.find((field) => typeof field === "string" && field.startsWith("report_config:Text(OperationalReport:"));
  assert.ok(dashboardField);
  assert.match(dashboardField, /\"sourceDoctype\":\"Sales Order\"/);
  assert.match(dashboardField, /\"keyField\":\"customer\"/);
  assert.match(dashboardField, /\"progressField\":\"per_delivered\"/);
  assert.match(dashboardField, /\"companyField\":\"company\"/);

  assert.equal(history?.label, "Lịch sử bán hàng");
  assert.equal(history?.menu, true);
  assert.equal(history?.group, "Bán hàng");
  assert.equal(history?.permissionAction, "read");
  const historyField = history?.fields.find((field) => typeof field === "string" && field.startsWith("history_config:Text(DocumentHistory:"));
  assert.ok(historyField);
  assert.match(historyField, /\"doctype\":\"Sales Order\"/);
  assert.match(historyField, /\"doctype\":\"Delivery Note\"/);
  assert.match(historyField, /\"doctype\":\"Sales Invoice\"/);
  assert.equal(calculator?.menu, false);

  const legacyReport = brief.reports.find((entry) => entry.name === "Đơn hàng theo khách");
  assert.equal(legacyReport?.label, "Đơn hàng theo khách");
  assert.equal(legacyReport?.group, "Báo cáo", "legacy tabular report stays available outside the daily Sales strip");

  const pkg = compileBrief(brief);
  assert.equal(pkg.version, "2.3.2");
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

  const compiledHistory = pkg.actions.find((entry) => entry.name === "lich-su-ban-hang");
  assert.equal(compiledHistory?.permission_action, "read");
  const compiledHistoryField = compiledHistory?.fields.find((field) => field.fieldname === "history_config");
  assert.ok(compiledHistoryField?.options?.startsWith(DOCUMENT_HISTORY_PREFIX));
  const historyConfig = JSON.parse(compiledHistoryField.options.slice(DOCUMENT_HISTORY_PREFIX.length));
  assert.deepEqual(historyConfig.sources.map((source) => source.doctype), ["Sales Order", "Delivery Note", "Sales Invoice"]);
  assert.ok(historyConfig.sources.every((source) => source.companyField === "company"));

  const navByKey = new Map(pkg.nav.map((entry) => [entry.key, entry]));
  assert.equal(navByKey.has("action:tinh-cong-thuc-cua"), false);
  assert.equal(navByKey.has("action:giao-hang-theo-ngay"), false);
  assert.equal(navByKey.get("report:Đơn hàng theo khách")?.group, "Báo cáo");
  assert.equal(navByKey.get("action:giao-hang-dispatch")?.kind, "experience");
  assert.equal(navByKey.get("action:bao-cao-ban-hang")?.kind, "experience");
  assert.equal(navByKey.get("action:lich-su-ban-hang")?.kind, "experience");
  assert.equal(navByKey.get("alumdoor-operations:workbench")?.kind, "experience");

  assert.ok(pkg.actions.some((entry) => entry.name === "giao-hang-theo-ngay"));
  assert.ok(pkg.actions.some((entry) => entry.name === "giao-hang-dispatch"));
  assert.ok(pkg.actions.some((entry) => entry.name === "bao-cao-ban-hang"));
  assert.ok(pkg.actions.some((entry) => entry.name === "lich-su-ban-hang"));
  assert.ok(pkg.actions.some((entry) => entry.name === "tinh-cong-thuc-cua"));
  assert.ok(pkg.reports.some((entry) => entry.name === "Đơn hàng theo khách"), "legacy report stays installed/callable");
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Sales Order"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Delivery Note"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Sales Invoice"));
});

test("Sales composer takes technical choices from Cutting Policy, keeps one working draft, reserves stock safely and blocks duplicate confirmation", async () => {
  const source = await readFile(composerPath, "utf8");

  assert.match(source, /adapter\.getList\("Cutting Policy"/);
  assert.match(source, /adapter\.getDoc\("Cutting Policy", formula\.policy_name\)/);
  assert.doesNotMatch(source, /<Input value=\{line\.rayType\}/, "ray must not regress to free text");
  assert.doesNotMatch(source, /<Input value=\{line\.leafVariant\}/, "leaf variant must not regress to free text");
  assert.match(source, /<select[^>]+value=\{line\.rayType\}/);
  assert.match(source, /<select[^>]+value=\{line\.leafVariant\}/);

  const reserveAt = source.indexOf('adapter.callPost<ReservationResult>("alumdoor.reserve.create"');
  const submitAt = source.indexOf("adapter.submit(created)");
  const releaseAt = source.indexOf('adapter.callPost("alumdoor.reserve.release"');
  assert.ok(reserveAt >= 0, "confirm must create canonical Stock Reservation");
  assert.ok(submitAt > reserveAt, "reservations must be established before Sales Order submit");
  assert.ok(releaseAt > submitAt, "failure path must release reservations after a failed submit/reservation sequence");
  assert.match(source, /source_doctype:\s*"Sales Order"/);
  assert.match(source, /source_name:\s*created\.name/);
  assert.match(source, /min_length_m:\s*Number\(formula\.cut_width_m\)/);
  assert.match(source, /qty_reserved:\s*Number\(formula\.total_leaf_count\)/);

  assert.match(source, /const \[createdOrderFingerprint, setCreatedOrderFingerprint\] = useState\(""\)/);
  assert.match(source, /const existingDraft = createdOrder && Number\(createdOrder\.docstatus \?\? 0\) === 0 \? createdOrder : null/);
  assert.match(source, /adapter\.updateDoc\("Sales Order", String\(existingDraft\.name\), orderDraft, String\(existingDraft\.modified \?\? ""\)\)/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{ setCreatedOrder\(null\); \}, \[inputFingerprint\]\)/, "input edits must not discard the working draft identity");
  const updateLineStart = source.indexOf("const updateLine =");
  const updateLineEnd = source.indexOf("const rayOptionsFor", updateLineStart);
  assert.ok(updateLineStart >= 0 && updateLineEnd > updateLineStart);
  assert.doesNotMatch(source.slice(updateLineStart, updateLineEnd), /setCreatedOrder\(null\)/, "editing a line must keep the draft for updateDoc");

  assert.match(source, /const submittedOrder = Boolean\(createdOrder && Number\(createdOrder\.docstatus/);
  assert.match(source, /createdOrderFingerprint === inputFingerprint/);
  assert.match(source, /if \(submittedOrder\)/);
  assert.match(source, /reservationRecovery\.length/);
  assert.match(source, /setReservationRecovery\(failedReleases\)/);
  assert.match(source, /Không thử xác nhận lại trước khi xử lý các giữ chỗ này/);
  assert.match(source, /Cập nhật nháp/);
  assert.match(source, /Xác nhận & giữ chỗ/);
});

test("SelectionBatch requires explicit choice, respects confirmation and has no Sales-specific open hardcode", async () => {
  const source = await readFile(selectionBatchPath, "utf8");
  const previewStart = source.indexOf("const runPreview = async () =>");
  const previewEnd = source.indexOf("useEffect(() =>", previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  const previewSource = source.slice(previewStart, previewEnd);
  assert.match(previewSource, /setSelected\(\[\]\)/);
  assert.doesNotMatch(previewSource, /setSelected\(available\.filter/, "preview must not auto-select every eligible Sales Order");
  assert.match(source, /action\.commit\.confirm/);
  assert.match(source, /window\.confirm\(action\.commit\.confirm\)/);
  assert.match(source, /config\.openDoctype \|\| inferredDoctype\(config\.rowKey\)/);
  assert.doesNotMatch(source, /onOpen\("Sales Order"/, "generic batch renderer must not hardcode Sales Order");
});

test("Operational sales views fail closed without Company and work queue does not silently truncate", async () => {
  const [queue, report, history] = await Promise.all([
    readFile(orderQueuePath, "utf8"),
    readFile(operationalReportPath, "utf8"),
    readFile(documentHistoryPath, "utf8"),
  ]);

  assert.match(queue, /const MAX_ORDERS = 10_000/);
  assert.match(queue, /for \(let start = 0; start < MAX_ORDERS; start \+= PAGE_SIZE\)/);
  assert.match(queue, /limitStart: start/);
  assert.match(queue, /\["company", "=", company\]/);
  assert.match(queue, /if \(!company\) \{/);
  assert.match(queue, /Cần chọn Công ty trên thanh ngữ cảnh trước khi xem Đơn hàng/);
  assert.doesNotMatch(queue, /pageLength:\s*100/);

  assert.match(report, /if \(config\.companyField && !company\) \{/);
  assert.match(report, /Cần chọn Công ty trên thanh ngữ cảnh trước khi xem báo cáo/);

  assert.match(history, /config\.sources\.some\(\(source\) => source\.companyField\) && !company/);
  assert.match(history, /Cần chọn Công ty trên thanh ngữ cảnh trước khi xem lịch sử/);
  assert.match(history, /Promise\.allSettled/, "history must keep partial-permission behavior after Company is resolved");
});
