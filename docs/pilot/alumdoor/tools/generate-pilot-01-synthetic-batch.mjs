#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePilotBatch } from "./validate-pilot-batch.mjs";

export const SYNTHETIC_BATCH_ID = "ALU-SYNTHETIC-PILOT-01-V1";
export const TARGET_RELEASE_SHA = "49315112a21182d2ce077b08a1fb9e26db07fd36";
export const MAPPING_VERSION = 1;

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

function jsonBody(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sumIntegerField(rows, field) {
  return rows.reduce((sum, row) => sum + BigInt(String(row[field] ?? 0)), 0n);
}

function stockTotals(rows) {
  let qty = 0n;
  let value = 0n;
  for (const row of rows) {
    const stockQty = BigInt(String(row.stock_qty));
    const valuationRate = BigInt(String(row.valuation_rate));
    qty += stockQty;
    value += stockQty * valuationRate;
  }
  return {
    stock_qty_total: qty.toString(),
    stock_value_total: value.toString(),
  };
}

function sourceTotals(dataset, rows) {
  if (dataset === "opening_stock") return stockTotals(rows);
  if (dataset === "opening_ar" || dataset === "opening_ap") {
    return { total_amount_vnd: sumIntegerField(rows, "amount_vnd").toString() };
  }
  return {};
}

export function syntheticPilotData() {
  return {
    customers: [
      { source_key: "SYN-CUST-001", customer_name: "SYNTHETIC CUSTOMER ALPHA", customer_group: "Test", active: true },
      { source_key: "SYN-CUST-002", customer_name: "SYNTHETIC CUSTOMER BETA", customer_group: "Test", active: true },
      { source_key: "SYN-CUST-003", customer_name: "SYNTHETIC CUSTOMER GAMMA", customer_group: "Test", active: true },
      { source_key: "SYN-CUST-004", customer_name: "SYNTHETIC CUSTOMER DELTA", customer_group: "Test", active: true },
    ],
    contacts: [
      { source_key: "SYN-CONTACT-001", customer_source_key: "SYN-CUST-001", full_name: "Synthetic Contact Alpha", email: "alpha@example.invalid", is_primary: true },
      { source_key: "SYN-CONTACT-002", customer_source_key: "SYN-CUST-002", full_name: "Synthetic Contact Beta", email: "beta@example.invalid", is_primary: true },
      { source_key: "SYN-CONTACT-003", customer_source_key: "SYN-CUST-003", full_name: "Synthetic Contact Gamma", email: "gamma@example.invalid", is_primary: true },
      { source_key: "SYN-CONTACT-004", customer_source_key: "SYN-CUST-004", full_name: "Synthetic Contact Delta", email: "delta@example.invalid", is_primary: true },
    ],
    suppliers: [
      { source_key: "SYN-SUP-001", supplier_name: "SYNTHETIC SUPPLIER ALUMINUM", active: true },
      { source_key: "SYN-SUP-002", supplier_name: "SYNTHETIC SUPPLIER GLASS", active: true },
      { source_key: "SYN-SUP-003", supplier_name: "SYNTHETIC SUPPLIER HARDWARE", active: true },
    ],
    items: [
      { source_key: "SYN-ITEM-001", item_code: "SYN-RM-AL-KG", item_name: "Synthetic aluminum raw", stock_uom: "Kg", item_group: "Synthetic Raw Material", active: true },
      { source_key: "SYN-ITEM-002", item_code: "SYN-RM-GLASS-M2", item_name: "Synthetic glass", stock_uom: "m2", item_group: "Synthetic Raw Material", active: true },
      { source_key: "SYN-ITEM-003", item_code: "SYN-RM-SCREW-CON", item_name: "Synthetic screw", stock_uom: "Con", item_group: "Synthetic Hardware", active: true },
      { source_key: "SYN-ITEM-004", item_code: "SYN-RM-SEAL-M", item_name: "Synthetic seal", stock_uom: "Mét", item_group: "Synthetic Raw Material", active: true },
      { source_key: "SYN-ITEM-005", item_code: "SYN-FG-DOOR-M2", item_name: "Synthetic finished door", stock_uom: "m2", item_group: "Synthetic Finished Goods", active: true },
      { source_key: "SYN-ITEM-006", item_code: "SYN-FG-WINDOW-M2", item_name: "Synthetic finished window", stock_uom: "m2", item_group: "Synthetic Finished Goods", active: true },
    ],
    boms: [
      {
        source_key: "SYN-BOM-DOOR-001",
        item_code: "SYN-FG-DOOR-M2",
        revision: "SYN-R1",
        effective_from: "2026-01-01",
        components: [
          { item_code: "SYN-RM-AL-KG", qty: "8", uom: "Kg" },
          { item_code: "SYN-RM-GLASS-M2", qty: "1", uom: "m2" },
          { item_code: "SYN-RM-SCREW-CON", qty: "12", uom: "Con" },
          { item_code: "SYN-RM-SEAL-M", qty: "5", uom: "Mét" },
        ],
        routing: "SYN-ROUTE-DOOR",
        active: true,
      },
      {
        source_key: "SYN-BOM-WINDOW-001",
        item_code: "SYN-FG-WINDOW-M2",
        revision: "SYN-R1",
        effective_from: "2026-01-01",
        components: [
          { item_code: "SYN-RM-AL-KG", qty: "5", uom: "Kg" },
          { item_code: "SYN-RM-GLASS-M2", qty: "1", uom: "m2" },
          { item_code: "SYN-RM-SCREW-CON", qty: "8", uom: "Con" },
          { item_code: "SYN-RM-SEAL-M", qty: "4", uom: "Mét" },
        ],
        routing: "SYN-ROUTE-WINDOW",
        active: true,
      },
    ],
    work_centers: [
      { source_key: "SYN-WC-001", work_center_name: "SYNTHETIC CUTTING", capacity: 10, active: true },
      { source_key: "SYN-WC-002", work_center_name: "SYNTHETIC ASSEMBLY", capacity: 8, active: true },
    ],
    warehouses: [
      { source_key: "SYN-WH-RAW", warehouse_name: "SYNTHETIC RAW WAREHOUSE", active: true },
      { source_key: "SYN-WH-WIP", warehouse_name: "SYNTHETIC WIP WAREHOUSE", active: true },
      { source_key: "SYN-WH-FG", warehouse_name: "SYNTHETIC FINISHED WAREHOUSE", active: true },
    ],
    opening_stock: [
      { source_key: "SYN-OS-001", item_code: "SYN-RM-AL-KG", warehouse: "SYN-WH-RAW", stock_qty: "120", stock_uom: "Kg", valuation_rate: "85000", source_document: "SYNTHETIC-OPENING" },
      { source_key: "SYN-OS-002", item_code: "SYN-RM-GLASS-M2", warehouse: "SYN-WH-RAW", stock_qty: "80", stock_uom: "m2", valuation_rate: "420000", source_document: "SYNTHETIC-OPENING" },
      { source_key: "SYN-OS-003", item_code: "SYN-RM-SCREW-CON", warehouse: "SYN-WH-RAW", stock_qty: "5000", stock_uom: "Con", valuation_rate: "500", source_document: "SYNTHETIC-OPENING" },
      { source_key: "SYN-OS-004", item_code: "SYN-RM-SEAL-M", warehouse: "SYN-WH-RAW", stock_qty: "250", stock_uom: "Mét", valuation_rate: "12000", source_document: "SYNTHETIC-OPENING" },
      { source_key: "SYN-OS-005", item_code: "SYN-FG-DOOR-M2", warehouse: "SYN-WH-FG", stock_qty: "10", stock_uom: "m2", valuation_rate: "2500000", source_document: "SYNTHETIC-OPENING" },
      { source_key: "SYN-OS-006", item_code: "SYN-FG-WINDOW-M2", warehouse: "SYN-WH-FG", stock_qty: "8", stock_uom: "m2", valuation_rate: "1900000", source_document: "SYNTHETIC-OPENING" },
    ],
    opening_ar: [
      { source_key: "SYN-AR-001", customer_source_key: "SYN-CUST-001", reference: "SYN-AR-REF-001", posting_date: "2026-07-15", due_date: "2026-08-15", amount_vnd: "12000000", currency: "VND" },
      { source_key: "SYN-AR-002", customer_source_key: "SYN-CUST-002", reference: "SYN-AR-REF-002", posting_date: "2026-07-20", due_date: "2026-08-20", amount_vnd: "7500000", currency: "VND" },
      { source_key: "SYN-AR-003", customer_source_key: "SYN-CUST-003", reference: "SYN-AR-REF-003", posting_date: "2026-07-25", due_date: "2026-08-25", amount_vnd: "3250000", currency: "VND" },
    ],
    opening_ap: [
      { source_key: "SYN-AP-001", supplier_source_key: "SYN-SUP-001", reference: "SYN-AP-REF-001", posting_date: "2026-07-18", due_date: "2026-08-18", amount_vnd: "8400000", currency: "VND" },
      { source_key: "SYN-AP-002", supplier_source_key: "SYN-SUP-003", reference: "SYN-AP-REF-002", posting_date: "2026-07-26", due_date: "2026-08-26", amount_vnd: "4600000", currency: "VND" },
    ],
    employees: [
      { source_key: "SYN-EMP-DIRECTOR", employee_name: "SYNTHETIC DIRECTOR", employee_code: "SYN-E001", designation: "Giám đốc", status: "Active" },
      { source_key: "SYN-EMP-WORKSHOP", employee_name: "SYNTHETIC WORKSHOP LEAD", employee_code: "SYN-E002", designation: "Chủ xưởng", status: "Active" },
      { source_key: "SYN-EMP-SALES", employee_name: "SYNTHETIC SALES", employee_code: "SYN-E003", designation: "Kinh doanh", status: "Active" },
      { source_key: "SYN-EMP-WAREHOUSE", employee_name: "SYNTHETIC WAREHOUSE", employee_code: "SYN-E004", designation: "Thủ kho", status: "Active" },
      { source_key: "SYN-EMP-ACCOUNTING", employee_name: "SYNTHETIC ACCOUNTING", employee_code: "SYN-E005", designation: "Kế toán", status: "Active" },
      { source_key: "SYN-EMP-PRODUCTION", employee_name: "SYNTHETIC PRODUCTION", employee_code: "SYN-E006", designation: "Sản xuất", status: "Active" },
    ],
    pilot_users: [
      { source_key: "SYN-USER-DIRECTOR", account: "director.synthetic@example.invalid", persona: "Giám đốc", roles: ["Giám đốc"], active: true, employee_source_key: "SYN-EMP-DIRECTOR" },
      { source_key: "SYN-USER-WORKSHOP", account: "workshop.synthetic@example.invalid", persona: "Chủ xưởng", roles: ["Chủ xưởng"], active: true, employee_source_key: "SYN-EMP-WORKSHOP" },
      { source_key: "SYN-USER-SALES", account: "sales.synthetic@example.invalid", persona: "Kinh doanh", roles: ["Kinh doanh"], active: true, employee_source_key: "SYN-EMP-SALES" },
      { source_key: "SYN-USER-WAREHOUSE", account: "warehouse.synthetic@example.invalid", persona: "Thủ kho", roles: ["Thủ kho"], active: true, employee_source_key: "SYN-EMP-WAREHOUSE" },
      { source_key: "SYN-USER-ACCOUNTING", account: "accounting.synthetic@example.invalid", persona: "Kế toán", roles: ["Kế toán"], active: true, employee_source_key: "SYN-EMP-ACCOUNTING" },
      { source_key: "SYN-USER-PRODUCTION", account: "production.synthetic@example.invalid", persona: "Sản xuất", roles: ["Sản xuất"], active: true, employee_source_key: "SYN-EMP-PRODUCTION" },
    ],
  };
}

export function buildSyntheticPilotBatch(outputDir) {
  if (!outputDir) throw new Error("outputDir is required");
  mkdirSync(outputDir, { recursive: true });
  const data = syntheticPilotData();
  const manifest = {
    format: "forge-alumdoor-pilot-batch/v1",
    status: "SYNTHETIC_TEST_FIXTURE",
    synthetic: true,
    pilot_batch_id: SYNTHETIC_BATCH_ID,
    tenant: "alu",
    target_release_sha: TARGET_RELEASE_SHA,
    source_system: "SYNTHETIC_FIXTURE_NOT_CUSTOMER_DATA",
    cutoff_at: "2026-08-01T00:00:00Z",
    extract_at: "2026-08-01T00:01:00Z",
    local_display_timezone: "Asia/Ho_Chi_Minh",
    mapping_version: MAPPING_VERSION,
    extractor_identity: "forge-synthetic-pilot-generator/v1",
    scope: { opening_cash_bank: false },
    files: [],
    notes: [
      "Synthetic test data only; no row is source-authoritative customer data.",
      "PREVIEW_PASS for this fixture proves validator/tooling behavior only and does not satisfy Pilot-01 real-data readiness.",
      "Production write remains unauthorized.",
    ],
  };

  for (const [dataset, rows] of Object.entries(data)) {
    const name = `${dataset}.json`;
    const body = jsonBody(rows);
    writeFileSync(path.join(outputDir, name), body);
    manifest.files.push({
      dataset_id: dataset,
      name,
      sha256: sha256(body),
      row_count: rows.length,
      source_totals: sourceTotals(dataset, rows),
    });
  }
  writeFileSync(path.join(outputDir, "manifest.json"), jsonBody(manifest));

  const preview = validatePilotBatch({ batchDir: outputDir });
  writeFileSync(path.join(outputDir, "preview.json"), jsonBody(preview));
  if (preview.status !== "PREVIEW_PASS") {
    throw new Error(`synthetic Pilot-01 batch failed validation: ${JSON.stringify(preview.errors)}`);
  }
  return { outputDir, manifest, data, preview };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error("usage: node generate-pilot-01-synthetic-batch.mjs <output-dir>");
    process.exitCode = 2;
  } else {
    const result = buildSyntheticPilotBatch(path.resolve(outputDir));
    console.log(JSON.stringify({
      status: result.preview.status,
      synthetic: true,
      pilot_batch_id: result.manifest.pilot_batch_id,
      datasets: result.manifest.files.length,
      production_write_authorized: result.preview.acceptance.production_write_authorized,
      production_data_mutated: result.preview.production_data_mutated,
      output_dir: result.outputDir,
    }));
  }
}
