import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptFrappeRows,
  adaptMisaInventoryGrid,
  advanceMigrationCheckpoint,
  assertImplementationStatusTransition,
  buildMigrationPlan,
  buildMigrationRetryPlan,
  buildMigrationTemplate,
  decideMigrationDuplicateAction,
  evaluateImplementationReadiness,
  parseMigrationDecimal,
  renderMigrationCsvTemplate,
  snapshotImplementationReadiness,
  suggestMigrationMapping,
} from "../dist/packages/migration/src/public.js";

const readiness = evaluateImplementationReadiness;

test("ERPNext/Frappe adapter keeps stable name and strips framework-owned fields", () => {
  const source = adaptFrappeRows({
    source_id: "erpnext-items-2026-08-03",
    rows: [
      { name: "ITEM-001", doctype: "Item", owner: "Administrator", creation: "2026-01-01", item_name: "Nhôm A", stock_uom: "Mét" },
      { name: "ITEM-002", modified: "2026-01-02", docstatus: 0, item_name: "Nhôm B", stock_uom: "Mét" },
    ],
  });
  assert.equal(source.source_kind, "erpnext");
  assert.equal(source.key_field, "name");
  assert.deepEqual(source.headers, ["name", "item_name", "stock_uom"]);
  assert.equal(source.rows[0].owner, undefined);
  assert.equal(source.rows[0].item_name, "Nhôm A");
});

test("MISA adapter detects Vietnamese headers and groups item rows by voucher", () => {
  const grid = [
    ["Mẫu nhập kho MISA AMIS"],
    ["Hướng dẫn"],
    ["Ngày hạch toán", "Số chứng từ", "Mã đối tượng", "Mã hàng", "Số lượng", "Đơn giá", "Nhập tại kho"],
    ["03/08/2026", "NK0001", "NCC01", "AL71", "1.234,5", "180.000,00", "Kho chính"],
    ["", "", "", "AL72", "2", "90,5", "Kho chính"],
  ];
  const result = adaptMisaInventoryGrid({ kind: "nhap", rows: grid, company: "Công ty A" });
  assert.equal(result.header_row, 3);
  assert.equal(result.target_doctype, "Purchase Receipt");
  assert.deepEqual(result.missing_required_columns, []);
  assert.equal(result.documents.length, 1);
  const draft = result.documents[0];
  assert.equal(draft.source_key, "NK0001");
  assert.equal(draft.document.posting_date, "2026-08-03");
  assert.equal(draft.document.supplier, "NCC01");
  assert.equal(draft.document.company, "Công ty A");
  assert.equal(draft.errors.length, 0);
  assert.equal(draft.document.items.length, 2);
  assert.equal(draft.document.items[0].qty, "1234.5");
  assert.equal(draft.document.items[0].rate, "180000");
  assert.equal(draft.document.items[1].rate, "90.5");
});

test("migration decimal parser canonicalizes common VN and EN formats without rounding", () => {
  assert.equal(parseMigrationDecimal("1.234,500"), "1234.5");
  assert.equal(parseMigrationDecimal("1,234.500"), "1234.5");
  assert.equal(parseMigrationDecimal("-00012,3400"), "-12.34");
  assert.equal(parseMigrationDecimal("not-a-number"), "");
});

test("retry plan retries confirmed failures but quarantines missing outcomes", async () => {
  const plan = await buildMigrationPlan({
    source_id: "items-1",
    source_kind: "csv",
    target_doctype: "Item",
    headers: ["name", "item_name"],
    rows: [
      { name: "A", item_name: "Alpha" },
      { name: "B", item_name: "Beta" },
      { name: "C", item_name: "Gamma" },
    ],
    target_fields: ["item_name"],
    key_field: "name",
  });
  const retry = buildMigrationRetryPlan(plan, [
    { row_key: "A", fingerprint: plan.rows[0].fingerprint, status: "imported", target_name: "A" },
    { row_key: "B", fingerprint: plan.rows[1].fingerprint, status: "failed", error: "reference missing" },
  ]);
  assert.deepEqual(retry.retryable_rows.map((row) => row.row_key), ["B"]);
  assert.deepEqual(retry.unresolved_rows.map((row) => row.row_key), ["C"]);
  assert.equal(retry.completed_rows, 1);
});

test("duplicate policy is explicit and never silently overwrites", () => {
  assert.equal(decideMigrationDuplicateAction("error", false), "create");
  assert.equal(decideMigrationDuplicateAction("error", true), "error");
  assert.equal(decideMigrationDuplicateAction("skip", true), "skip");
  assert.equal(decideMigrationDuplicateAction("update", true), "update");
});

test("incremental checkpoint is gapless and source-bound", () => {
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  const first = advanceMigrationCheckpoint(null, {
    source_id: "erpnext-prod",
    adapter: "erpnext-rest-v1",
    sequence: 1,
    cursor: "modified>2026-08-01T00:00:00Z",
    batch_fingerprint: hashA,
  });
  const second = advanceMigrationCheckpoint(first, {
    source_id: "erpnext-prod",
    adapter: "erpnext-rest-v1",
    sequence: 2,
    cursor: "modified>2026-08-02T00:00:00Z",
    batch_fingerprint: hashB,
    high_watermark: "2026-08-02T00:00:00Z",
  });
  assert.equal(second.sequence, 2);
  assert.throws(() => advanceMigrationCheckpoint(second, { ...second, sequence: 4, cursor: "next", batch_fingerprint: hashA }));
  assert.throws(() => advanceMigrationCheckpoint(second, { ...second, sequence: 3, source_id: "other", cursor: "next", batch_fingerprint: hashA }));
});

test("template contract marks required fields and suggests accent-insensitive mapping", () => {
  const template = buildMigrationTemplate("Item", [
    { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data", required: true },
    { fieldname: "item_name", label: "Tên hàng", fieldtype: "Data", required: true },
    { fieldname: "description_html", label: "HTML", fieldtype: "HTML" },
  ]);
  assert.deepEqual(template.columns.map((column) => column.fieldname), ["name", "item_code", "item_name"]);
  assert.equal(template.columns.find((column) => column.fieldname === "item_code").required, true);
  const suggestions = suggestMigrationMapping(["Mã hàng", "Ten hang", "Cột lạ"], [
    { fieldname: "item_code", label: "Mã hàng" },
    { fieldname: "item_name", label: "Tên hàng" },
  ]);
  assert.equal(suggestions[0].target_field, "item_code");
  assert.equal(suggestions[1].target_field, "item_name");
  assert.equal(suggestions[2].target_field, null);
  const csv = renderMigrationCsvTemplate(template, { name: "ITEM,01", item_code: "AL71", item_name: "Nhôm \"đẹp\"" });
  assert.match(csv, /"ITEM,01"/);
  assert.match(csv, /"Nhôm ""đẹp"""/);
});

test("go-live readiness follows required evidence dependencies and snapshots deterministically", async () => {
  const items = [
    { key: "company", label: "Company configured", stage: "setup", required: true, status: "done", evidence: ["Company:ACME"] },
    { key: "master", label: "Master data loaded", stage: "master_data", required: true, status: "done", depends_on: ["company"], evidence: ["migration:master-1"] },
    { key: "opening", label: "Opening data loaded", stage: "opening_data", required: true, status: "done", depends_on: ["master"], evidence: ["migration:opening-1"] },
    { key: "reconcile", label: "Opening reconciled", stage: "reconciliation", required: true, status: "blocked", depends_on: ["opening"], blocker: "finance metrics pending" },
    { key: "training", label: "Key users trained", stage: "training", required: true, status: "done", evidence: ["training:session-1"] },
    { key: "go-live", label: "Go-live approval", stage: "go_live", required: true, status: "pending", depends_on: ["reconcile", "training"] },
  ];
  const blocked = readiness(items);
  assert.equal(blocked.ready_for_go_live, false);
  assert.deepEqual(blocked.required_open, ["reconcile", "go-live"]);
  assert.deepEqual(blocked.dependency_blocked, ["go-live"]);

  const complete = items.map((item) => item.key === "reconcile"
    ? { ...item, status: "done", blocker: undefined, evidence: ["reconcile:tb=ok"] }
    : item.key === "go-live" ? { ...item, status: "done", evidence: ["approval:CAB-1"] } : item);
  const ready = readiness(complete);
  assert.equal(ready.ready_for_go_live, true);
  const a = await snapshotImplementationReadiness(complete);
  const b = await snapshotImplementationReadiness(complete);
  assert.equal(a.snapshot_id, b.snapshot_id);
  assert.equal(a.checklist_fingerprint, b.checklist_fingerprint);
  assert.throws(() => assertImplementationStatusTransition("pending", "cancelled"));
});
