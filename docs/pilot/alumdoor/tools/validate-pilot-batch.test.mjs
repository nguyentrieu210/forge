import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validatePilotBatch } from "./validate-pilot-batch.mjs";

function hash(body) {
  return createHash("sha256").update(body).digest("hex");
}

function totalsFor(dataset) {
  if (dataset === "opening_stock") return { stock_qty_total: "10.5", stock_value_total: "2100000" };
  if (dataset === "opening_ar") return { total_amount_vnd: "1000000" };
  if (dataset === "opening_ap") return { total_amount_vnd: "500000" };
  return {};
}

function baseData() {
  return {
    customers: [{ source_key: "C1", customer_name: "Khách 1" }],
    contacts: [{ source_key: "CT1", customer_source_key: "C1", full_name: "Nguyễn Khách" }],
    suppliers: [{ source_key: "S1", supplier_name: "NCC 1" }],
    items: [{ source_key: "I1", item_code: "AL70", item_name: "Nhôm AL70", stock_uom: "cây" }],
    boms: [],
    work_centers: [],
    warehouses: [{ source_key: "W1", warehouse_name: "Kho 1" }],
    opening_stock: [{ source_key: "OS1", item_code: "AL70", warehouse: "W1", stock_qty: "10.5", stock_uom: "cây", valuation_rate: "200000" }],
    opening_ar: [{ source_key: "AR1", customer_source_key: "C1", reference: "AR-1", posting_date: "2026-08-01", due_date: "2026-08-31", amount_vnd: "1000000" }],
    opening_ap: [{ source_key: "AP1", supplier_source_key: "S1", reference: "AP-1", posting_date: "2026-08-01", due_date: "2026-08-31", amount_vnd: "500000" }],
    employees: [{ source_key: "E1", employee_name: "Nguyễn A" }],
    pilot_users: [{ source_key: "U1", account: "director@example.invalid", persona: "Giám đốc", roles: ["Giám đốc"], active: true, employee_source_key: "E1" }],
  };
}

function writeBatch(mutator) {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-pilot-01-"));
  const data = baseData();
  const manifest = {
    format: "forge-alumdoor-pilot-batch/v1",
    pilot_batch_id: "ALU-PILOT-TEST-001",
    tenant: "alu",
    target_release_sha: "49315112a21182d2ce077b08a1fb9e26db07fd36",
    source_system: "fixture",
    cutoff_at: "2026-08-05T00:00:00Z",
    extract_at: "2026-08-05T00:01:00Z",
    local_display_timezone: "Asia/Ho_Chi_Minh",
    mapping_version: 1,
    extractor_identity: "node-test-fixture",
    scope: { opening_cash_bank: false },
    files: [],
  };
  mutator?.({ data, manifest });
  for (const [dataset, rows] of Object.entries(data)) {
    const name = `${dataset}.json`;
    const body = `${JSON.stringify(rows, null, 2)}\n`;
    writeFileSync(path.join(dir, name), body);
    manifest.files.push({ dataset_id: dataset, name, sha256: hash(body), row_count: rows.length, source_totals: totalsFor(dataset) });
  }
  mutator?.({ data, manifest, afterFiles: true, dir });
  writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir, manifest };
}

function rewriteDataset(dir, manifest, dataset, rows) {
  const entry = manifest.files.find((item) => item.dataset_id === dataset);
  const body = `${JSON.stringify(rows, null, 2)}\n`;
  writeFileSync(path.join(dir, entry.name), body);
  entry.sha256 = hash(body);
  entry.row_count = rows.length;
  writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function errorCodes(result) {
  return new Set(result.errors.map((error) => error.code));
}

test("Pilot-01 preview passes a complete zero-variance batch and never authorizes production write", () => {
  const { dir } = writeBatch();
  try {
    const result = validatePilotBatch({ batchDir: dir });
    assert.equal(result.status, "PREVIEW_PASS");
    assert.equal(result.counts.errors, 0);
    assert.equal(result.acceptance.required_datasets_present, true);
    assert.equal(result.acceptance.references_resolved, true);
    assert.equal(result.acceptance.unexplained_reconciliation_variance, 0);
    assert.equal(result.acceptance.named_cutover_approver_account, true);
    assert.equal(result.acceptance.production_write_authorized, false);
    assert.equal(result.production_data_mutated, false);
    assert.equal(result.reconciliation.opening_stock.stock_value_total, "2100000");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Pilot-01 fails closed on duplicate source keys", () => {
  const { dir, manifest } = writeBatch();
  try {
    rewriteDataset(dir, manifest, "customers", [
      { source_key: "C1", customer_name: "Khách 1" },
      { source_key: "C1", customer_name: "Khách trùng" },
    ]);
    const result = validatePilotBatch({ batchDir: dir });
    assert.equal(result.status, "PREVIEW_FAIL");
    assert.ok(errorCodes(result).has("DUPLICATE_SOURCE_KEY"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Pilot-01 fails closed on unresolved source references", () => {
  const { dir, manifest } = writeBatch();
  try {
    rewriteDataset(dir, manifest, "contacts", [{ source_key: "CT1", customer_source_key: "C404", full_name: "Không map" }]);
    const result = validatePilotBatch({ batchDir: dir });
    assert.equal(result.status, "PREVIEW_FAIL");
    assert.ok(errorCodes(result).has("REFERENCE_UNKNOWN"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Pilot-01 fails closed on non-zero opening reconciliation variance", () => {
  const { dir, manifest } = writeBatch();
  try {
    manifest.files.find((item) => item.dataset_id === "opening_ar").source_totals.total_amount_vnd = "999999";
    writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = validatePilotBatch({ batchDir: dir });
    assert.equal(result.status, "PREVIEW_FAIL");
    assert.ok(errorCodes(result).has("RECONCILIATION_VARIANCE"));
    assert.equal(result.acceptance.unexplained_reconciliation_variance, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Pilot-01 fails closed when the named cutover approver persona is missing", () => {
  const { dir, manifest } = writeBatch();
  try {
    rewriteDataset(dir, manifest, "pilot_users", [{ source_key: "U1", account: "sales@example.invalid", persona: "Kinh doanh", roles: ["Kinh doanh"], active: true }]);
    const result = validatePilotBatch({ batchDir: dir });
    assert.equal(result.status, "PREVIEW_FAIL");
    assert.ok(errorCodes(result).has("CUTOVER_APPROVER_ACCOUNT_INVALID"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Pilot-01 detects file tampering by immutable SHA-256", () => {
  const { dir } = writeBatch();
  try {
    const file = path.join(dir, "customers.json");
    writeFileSync(file, `${readFileSync(file, "utf8")} `);
    const result = validatePilotBatch({ batchDir: dir });
    assert.equal(result.status, "PREVIEW_FAIL");
    assert.ok(errorCodes(result).has("FILE_HASH_MISMATCH"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
