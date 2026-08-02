import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  auditCatalog,
  catalogChecksum,
  redactCatalogReport,
} from "../scripts/lib/alumdoor-catalog-audit.mjs";

const cli = fileURLToPath(new URL("../scripts/audit-alumdoor-catalog.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/alumdoor-catalog-audit-valid.json", import.meta.url));

function loadFixture() {
  return JSON.parse(readFileSync(fixture, "utf8"));
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("valid catalog produces no Critical/High finding", () => {
  const report = auditCatalog(loadFixture());
  assert.equal(report.findings.some((finding) => ["Critical", "High"].includes(finding.severity)), false);
});

test("disabled Items remain counted without creating active-readiness defects", () => {
  const payload = loadFixture();
  payload.records.push({ doctype: "Item", name: "ITEM-DISABLED", disabled: 1, item_group: "Raw", stock_uom: "Nos", is_stock_item: 1 });
  const report = auditCatalog(payload);
  assert.ok((report.counts.by_doctype.Item ?? 0) >= 2);
  assert.equal(report.findings.some((finding) => String(finding.message ?? "").includes("ITEM-DISABLED")), false);
});

test("audit reports service, conversion, manufactured-item and BOM defects", () => {
  const payload = loadFixture();
  payload.records.push(
    { doctype: "Item", name: "SERVICE-BAD", disabled: 0, item_group: "Services", stock_uom: "Nos", is_stock_item: 1, is_service_item: 1 },
    { doctype: "Item", name: "ITEM-BAD-UOM", disabled: 0, item_group: "Raw", stock_uom: "Nos", is_stock_item: 1, default_purchase_uom: "Box", uom_conversions: [] },
    { doctype: "Item", name: "FG-NO-BOM", disabled: 0, item_group: "Finished", stock_uom: "Nos", is_stock_item: 1, is_manufactured_item: 1 },
  );
  const report = auditCatalog(payload);
  const codes = new Set(report.findings.map((finding) => finding.code));
  assert.ok(codes.has("SERVICE_STOCK_CONFLICT"));
  assert.ok(codes.has("MISSING_UOM_CONVERSION"));
  assert.ok(codes.has("MANUFACTURED_ITEM_WITHOUT_BOM"));
});

test("duplicate and circular active BOMs are rejected", () => {
  const payload = loadFixture();
  payload.records.push(
    { doctype: "Item", name: "FG-A", disabled: 0, item_group: "Finished", stock_uom: "Nos", is_stock_item: 1, is_manufactured_item: 1 },
    { doctype: "Item", name: "FG-B", disabled: 0, item_group: "Finished", stock_uom: "Nos", is_stock_item: 1, is_manufactured_item: 1 },
    { doctype: "BOM", name: "BOM-A-1", item: "FG-A", is_active: 1, items: [{ item_code: "FG-B", qty: 1, uom: "Nos" }] },
    { doctype: "BOM", name: "BOM-A-2", item: "FG-A", is_active: 1, items: [{ item_code: "FG-B", qty: 1, uom: "Nos" }] },
    { doctype: "BOM", name: "BOM-B-1", item: "FG-B", is_active: 1, items: [{ item_code: "FG-A", qty: 1, uom: "Nos" }] },
  );
  const report = auditCatalog(payload);
  const codes = new Set(report.findings.map((finding) => finding.code));
  assert.ok(codes.has("MULTIPLE_ACTIVE_BOM"));
  assert.ok(codes.has("BOM_CYCLE"));
});

test("checksum is stable across record and object-key order", () => {
  const payload = loadFixture();
  const reordered = {
    records: [...payload.records].reverse().map((record) => Object.fromEntries(Object.entries(record).reverse())),
    metadata_version: payload.metadata_version,
    source: payload.source,
  };
  assert.equal(catalogChecksum(payload), catalogChecksum(reordered));
});

test("redacted report does not expose record or referenced names", () => {
  const payload = loadFixture();
  const report = auditCatalog(payload);
  const redacted = redactCatalogReport(report);
  const serialized = JSON.stringify(redacted);
  for (const record of payload.records) {
    if (record.name) assert.doesNotMatch(serialized, new RegExp(String(record.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("CLI remains read-only and writes a deterministic fixture report", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-catalog-audit-"));
  const output = path.join(dir, "report.json");
  try {
    const first = runCli(["--fixture", fixture, "--output", output, "--redacted"]);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const before = readFileSync(output, "utf8");
    const second = runCli(["--fixture", fixture, "--output", output, "--redacted"]);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.equal(readFileSync(output, "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI defaults generated reports outside the repository", () => {
  const run = runCli(["--fixture", fixture, "--redacted"]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /catalog-audit/i);
  assert.doesNotMatch(run.stdout, /server\/work|server\\work/);
});

test("CLI refuses generated audit output inside the repository", () => {
  const output = fileURLToPath(new URL("../work/catalog-audit.json", import.meta.url));
  const run = runCli(["--fixture", fixture, "--output", output]);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}\n${run.stderr}`, /outside the repository|refus/i);
});

test("remote audit query preserves disabled master state", () => {
  const source = readFileSync(fileURLToPath(new URL("../scripts/lib/alumdoor-catalog-remote.mjs", import.meta.url)), "utf8");
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
  assert.equal(report.metadata_version, "2.2.1");
  assert.equal(report.expected_metadata_version, "2.2.1");
  assert.ok(report.counts.records > 0);
  assert.ok((report.counts.by_doctype.UOM ?? 0) > 0);
  assert.ok((report.counts.by_doctype["Item Group"] ?? 0) > 0);
  assert.ok((report.counts.by_doctype["Measurement Profile"] ?? 0) > 0);
  assert.ok((report.counts.by_doctype.Warehouse ?? 0) > 0);
});
