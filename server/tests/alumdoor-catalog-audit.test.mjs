import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { planAlumdoorCatalogAudit } from "../scripts/alumdoor-catalog-audit-planner.mjs";

function validRecords() {
  return [
    { doctype: "UOM", name: "Kg", data: { uom_name: "Kg" } },
    { doctype: "UOM", name: "Cái", data: { uom_name: "Cái" } },
    { doctype: "Item Group", name: "Nguyên vật liệu", data: { item_group_name: "Nguyên vật liệu" } },
    { doctype: "Item Group", name: "Thành phẩm", data: { item_group_name: "Thành phẩm" } },
    { doctype: "Measurement Profile", name: "Hàng thường", data: { profile_name: "Hàng thường", inventory_mode: "Hàng thường", stock_uom: "Cái" } },
    { doctype: "Warehouse", name: "NVL", data: { warehouse_name: "NVL", warehouse_role: "RAW_MATERIAL" } },
    { doctype: "Warehouse", name: "TP", data: { warehouse_name: "TP", warehouse_role: "FINISHED_GOODS" } },
    { doctype: "Item", name: "RAW", data: {
      item_code: "RAW", item_group: "Nguyên vật liệu", item_nature: "Hàng tồn kho", material_stage: "Nguyên vật liệu",
      supply_type: "Mua ngoài", is_stock_item: 1, is_purchase_item: 1, is_sales_item: 0,
      include_item_in_manufacturing: 1, inventory_mode: "Hàng thường", stock_uom: "Kg", default_purchase_uom: "Kg", default_warehouse: "NVL",
    } },
    { doctype: "Item", name: "FG", data: {
      item_code: "FG", item_group: "Thành phẩm", item_nature: "Hàng tồn kho", material_stage: "Thành phẩm",
      supply_type: "Tự sản xuất", is_stock_item: 1, is_purchase_item: 0, is_sales_item: 1,
      include_item_in_manufacturing: 1, inventory_mode: "Hàng thường", stock_uom: "Cái", default_sales_uom: "Cái", default_warehouse: "TP",
    } },
    { doctype: "Bill of Materials", name: "BOM-FG-R1", data: {
      item: "FG", quantity: 1, revision: 1, status: "Active",
      items: [{ row_id: "1", item_code: "RAW", qty: 2, uom: "Kg", qty_basis: "Cố định" }],
    } },
  ];
}

function cliScript() {
  return fileURLToPath(new URL("../scripts/audit-alumdoor-catalog.mjs", import.meta.url));
}

function runCli(args) {
  return spawnSync(process.execPath, [cliScript(), ...args], { encoding: "utf8" });
}

test("valid catalog produces no Critical/High finding", () => {
  const report = planAlumdoorCatalogAudit({ metadataVersion: "2.0.34", records: validRecords() });
  assert.equal(report.counts.critical, 0);
  assert.equal(report.counts.high, 0);
  assert.equal(report.counts.active_items, 2);
  assert.equal(report.counts.active_boms, 1);
  assert.match(report.checksum, /^[a-f0-9]{64}$/);
});

test("disabled Items remain counted without creating active-readiness defects", () => {
  const records = validRecords();
  records.push({
    doctype: "Item",
    name: "DISABLED-BROKEN",
    data: { item_code: "DISABLED-BROKEN", disabled: 1 },
  });
  const report = planAlumdoorCatalogAudit({ metadataVersion: "2.0.34", records });
  assert.equal(report.counts.active_items, 2);
  assert.equal(report.counts.disabled_items, 1);
  assert.ok(report.findings.every((finding) => finding.name !== "DISABLED-BROKEN"));
});

test("audit reports service, conversion, manufactured-item and BOM defects", () => {
  const records = validRecords();
  records.push(
    { doctype: "Item", name: "SERVICE", data: { item_code: "SERVICE", item_group: "Thành phẩm", item_nature: "Dịch vụ", is_stock_item: 1, stock_uom: "Cái", include_item_in_manufacturing: 1 } },
    { doctype: "Item", name: "BAD-UOM", data: {
      item_code: "BAD-UOM", item_group: "Nguyên vật liệu", item_nature: "Hàng tồn kho", material_stage: "Nguyên vật liệu",
      supply_type: "Mua ngoài", is_stock_item: 1, is_purchase_item: 1, include_item_in_manufacturing: 1,
      inventory_mode: "Hàng thường", stock_uom: "Kg", default_purchase_uom: "Cái", uom_conversions: [],
    } },
    { doctype: "Item", name: "NO-BOM", data: {
      item_code: "NO-BOM", item_group: "Thành phẩm", item_nature: "Hàng tồn kho", material_stage: "Thành phẩm",
      supply_type: "Tự sản xuất", is_stock_item: 1, include_item_in_manufacturing: 1, inventory_mode: "Hàng thường", stock_uom: "Cái",
    } },
  );
  const report = planAlumdoorCatalogAudit({ metadataVersion: "2.0.34", records });
  const codes = new Set(report.findings.map((finding) => finding.code));
  assert.ok(codes.has("ITEM_SERVICE_STOCK_ENABLED"));
  assert.ok(codes.has("ITEM_SERVICE_MANUFACTURING_ENABLED"));
  assert.ok(codes.has("ITEM_UOM_CONVERSION_MISSING"));
  assert.ok(codes.has("ITEM_ACTIVE_BOM_MISSING"));
  assert.ok(report.counts.high >= 4);
});

test("duplicate and circular active BOMs are rejected", () => {
  const records = validRecords();
  records.push(
    { doctype: "Bill of Materials", name: "BOM-FG-R2", data: { item: "FG", quantity: 1, revision: 2, status: "Active", items: [{ item_code: "RAW", qty: 1, uom: "Kg", qty_basis: "Cố định" }] } },
    { doctype: "Item", name: "SUB", data: {
      item_code: "SUB", item_group: "Thành phẩm", item_nature: "Hàng tồn kho", material_stage: "Bán thành phẩm",
      supply_type: "Tự sản xuất", is_stock_item: 1, include_item_in_manufacturing: 1, inventory_mode: "Hàng thường", stock_uom: "Cái",
    } },
    { doctype: "Bill of Materials", name: "BOM-SUB", data: { item: "SUB", quantity: 1, revision: 1, status: "Active", items: [{ item_code: "FG", qty: 1, uom: "Cái", qty_basis: "Cố định" }] } },
  );
  records.find((record) => record.name === "BOM-FG-R1").data.items.push({ item_code: "SUB", qty: 1, uom: "Cái", qty_basis: "Cố định" });
  const report = planAlumdoorCatalogAudit({ metadataVersion: "2.0.34", records });
  const codes = new Set(report.findings.map((finding) => finding.code));
  assert.ok(codes.has("BOM_DUPLICATE_ACTIVE"));
  assert.ok(codes.has("BOM_CIRCULAR_DEPENDENCY"));
});

test("checksum is stable across record and object-key order", () => {
  const a = validRecords();
  const b = [...a].reverse().map((record) => ({
    name: record.name,
    data: Object.fromEntries(Object.entries(record.data).reverse()),
    doctype: record.doctype,
  }));
  const first = planAlumdoorCatalogAudit({ metadataVersion: "2.0.34", records: a, redacted: true });
  const second = planAlumdoorCatalogAudit({ metadataVersion: "2.0.34", records: b, redacted: true });
  assert.equal(first.checksum, second.checksum);
  assert.deepEqual(first.findings, second.findings);
});

test("redacted report does not expose record or referenced names", () => {
  const records = validRecords();
  records.push({ doctype: "Item", name: "SECRET-ITEM", data: {
    item_code: "SECRET-ITEM", item_group: "SECRET-GROUP", item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu", supply_type: "Mua ngoài", is_stock_item: 1,
    is_purchase_item: 1, include_item_in_manufacturing: 1, stock_uom: "SECRET-UOM",
    default_warehouse: "SECRET-WAREHOUSE",
  } });
  const report = planAlumdoorCatalogAudit({ metadataVersion: "wrong", records, redacted: true });
  assert.ok(report.findings.length > 0);
  assert.ok(report.findings.every((finding) => !Object.hasOwn(finding, "name") && typeof finding.row_hash === "string"));
  assert.doesNotMatch(JSON.stringify(report.findings), /BOM-FG|RAW|FG|SECRET/);
});

test("CLI remains read-only and writes a deterministic fixture report", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-catalog-audit-"));
  const fixture = path.join(dir, "fixture.json");
  const output = path.join(dir, "report.json");
  writeFileSync(fixture, JSON.stringify({ metadata_version: "2.0.34", records: validRecords() }));
  const run = runCli(["--input", fixture, "--output", output, "--redacted"]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(report.schema_version, 1);
  assert.equal(report.counts.high, 0);
  const denied = runCli(["--input", fixture, "--execute"]);
  assert.notEqual(denied.status, 0);
  assert.match(`${denied.stderr}${denied.stdout}`, /read-only/);
});

test("CLI defaults generated reports outside the repository", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-catalog-default-output-"));
  const fixture = path.join(dir, "fixture.json");
  writeFileSync(fixture, JSON.stringify({ metadata_version: "2.0.34", records: validRecords() }));
  const run = runCli(["--input", fixture, "--redacted"]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const summary = JSON.parse(run.stdout);
  assert.equal(path.relative(tmpdir(), summary.output).startsWith(".."), false);
  assert.equal(existsSync(summary.output), true);
});

test("CLI refuses generated audit output inside the repository", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-catalog-repo-output-"));
  const fixture = path.join(dir, "fixture.json");
  const forbiddenOutput = fileURLToPath(new URL("../alumdoor-catalog-audit-should-not-exist.json", import.meta.url));
  writeFileSync(fixture, JSON.stringify({ metadata_version: "2.0.34", records: validRecords() }));
  const run = runCli(["--input", fixture, "--output", forbiddenOutput, "--redacted"]);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}${run.stdout}`, /outside the repository/i);
  assert.equal(existsSync(forbiddenOutput), false);
});

test("remote audit query preserves disabled master state", () => {
  const source = readFileSync(cliScript(), "utf8");
  assert.doesNotMatch(source, /disabled\s*=\s*0/);
  assert.match(source, /disabled AS disabled_state/);
  assert.match(source, /'\$\.disabled'/);
});

test("CLI audits the authoritative alumdoor-v2 brief fixtures directly", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-catalog-brief-"));
  const output = path.join(dir, "brief-report.json");
  const brief = fileURLToPath(new URL("../briefs/alumdoor-v2.json", import.meta.url));
  const run = runCli(["--brief", brief, "--output", output, "--redacted"]);
  assert.ok(run.status === 0 || run.status === 2, run.stderr || run.stdout);
  const report = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(report.source.kind, "brief");
  assert.equal(report.source.file, "alumdoor-v2.json");
  assert.equal(report.metadata_version, "2.0.34");
  assert.equal(report.expected_metadata_version, "2.0.34");
  assert.ok(report.counts.records > 0);
  assert.ok((report.counts.by_doctype.UOM ?? 0) > 0);
  assert.ok((report.counts.by_doctype["Item Group"] ?? 0) > 0);
  assert.ok((report.counts.by_doctype["Measurement Profile"] ?? 0) > 0);
  assert.ok((report.counts.by_doctype.Warehouse ?? 0) > 0);
  assert.ok(report.findings.every((finding) => finding.code !== "METADATA_VERSION_UNEXPECTED"));
});
