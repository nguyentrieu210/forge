#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const defaultMappingPath = path.join(repoRoot, "docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json");

export const REQUIRED_PILOT_01_DATASETS = Object.freeze([
  "customers",
  "contacts",
  "suppliers",
  "items",
  "boms",
  "work_centers",
  "warehouses",
  "opening_stock",
  "opening_ar",
  "opening_ap",
  "employees",
  "pilot_users",
]);

const OPENING_TOTAL_KEYS = Object.freeze({
  opening_stock: ["stock_qty_total", "stock_value_total"],
  opening_ar: ["total_amount_vnd"],
  opening_ap: ["total_amount_vnd"],
  opening_cash_bank: ["total_balance_vnd"],
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function present(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function integerMinor(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("must be a safe integer or decimal string");
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  throw new Error("must be an integer minor-unit value");
}

function decimal(value) {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error(`invalid decimal: ${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const raw = BigInt(`${whole}${fraction}` || "0") * (negative ? -1n : 1n);
  return normalizeDecimal({ raw, scale: fraction.length });
}

function normalizeDecimal(input) {
  let { raw, scale } = input;
  while (scale > 0 && raw % 10n === 0n) {
    raw /= 10n;
    scale -= 1;
  }
  return { raw, scale };
}

function decimalAdd(values) {
  if (values.length === 0) return { raw: 0n, scale: 0 };
  const parsed = values.map(decimal);
  const scale = Math.max(...parsed.map((item) => item.scale));
  const raw = parsed.reduce((sum, item) => sum + item.raw * (10n ** BigInt(scale - item.scale)), 0n);
  return normalizeDecimal({ raw, scale });
}

function decimalMul(left, right) {
  const a = decimal(left);
  const b = decimal(right);
  return normalizeDecimal({ raw: a.raw * b.raw, scale: a.scale + b.scale });
}

function decimalToString(value) {
  const { raw, scale } = normalizeDecimal(value);
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(scale + 1, "0");
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
}

function sameDecimal(left, right) {
  return decimalToString(decimal(left)) === decimalToString(decimal(right));
}

function pushError(errors, code, message, detail = undefined) {
  errors.push({ code, message, ...(detail === undefined ? {} : { detail }) });
}

function requireRfc3339(value, field, errors) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    pushError(errors, "MANIFEST_TIMESTAMP_INVALID", `${field} must be an RFC3339 UTC timestamp`, { field, value });
    return null;
  }
  return new Date(value);
}

function safeFile(batchDir, relativeName, errors) {
  if (typeof relativeName !== "string" || !relativeName || path.isAbsolute(relativeName)) {
    pushError(errors, "FILE_PATH_INVALID", "batch file name must be a non-empty relative path", relativeName);
    return null;
  }
  const root = path.resolve(batchDir);
  const resolved = path.resolve(root, relativeName);
  if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    pushError(errors, "FILE_PATH_ESCAPE", "batch file path escapes batch directory", relativeName);
    return null;
  }
  return resolved;
}

function validateRows(dataset, rows, mappingDataset, errors) {
  const sourceKeys = new Map();
  const itemCodes = new Map();
  const accounts = new Map();

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      pushError(errors, "ROW_INVALID", `${dataset}[${index}] must be an object`);
      continue;
    }
    for (const field of mappingDataset.required ?? []) {
      if (!present(row[field])) pushError(errors, "REQUIRED_FIELD_MISSING", `${dataset}[${index}] missing ${field}`);
    }
    if (present(row.source_key)) {
      const key = String(row.source_key);
      if (sourceKeys.has(key)) pushError(errors, "DUPLICATE_SOURCE_KEY", `${dataset} has duplicate source_key ${key}`, { first: sourceKeys.get(key), duplicate: index });
      else sourceKeys.set(key, index);
    }
    if (dataset === "items" && present(row.item_code)) {
      const key = String(row.item_code);
      if (itemCodes.has(key)) pushError(errors, "DUPLICATE_ITEM_CODE", `items has duplicate item_code ${key}`);
      else itemCodes.set(key, index);
    }
    if (dataset === "pilot_users" && present(row.account)) {
      const key = String(row.account).trim().toLowerCase();
      if (accounts.has(key)) pushError(errors, "DUPLICATE_PILOT_ACCOUNT", `pilot_users has duplicate account ${key}`);
      else accounts.set(key, index);
      if (!(mappingDataset.allowed_personas ?? []).includes(row.persona)) pushError(errors, "PILOT_PERSONA_INVALID", `pilot_users[${index}] persona is outside frozen Pilot-00 personas`, row.persona);
      if (!Array.isArray(row.roles) || row.roles.length === 0 || row.roles.some((role) => !present(role))) pushError(errors, "PILOT_ROLES_INVALID", `pilot_users[${index}] roles must be a non-empty array`);
      if (typeof row.active !== "boolean") pushError(errors, "PILOT_ACTIVE_INVALID", `pilot_users[${index}] active must be boolean`);
    }
    if (["opening_ar", "opening_ap"].includes(dataset) && present(row.amount_vnd)) {
      try { integerMinor(row.amount_vnd); } catch (error) { pushError(errors, "MONEY_MINOR_INVALID", `${dataset}[${index}].amount_vnd ${error.message}`); }
    }
    if (dataset === "opening_cash_bank" && present(row.balance_vnd)) {
      try { integerMinor(row.balance_vnd); } catch (error) { pushError(errors, "MONEY_MINOR_INVALID", `${dataset}[${index}].balance_vnd ${error.message}`); }
    }
    if (dataset === "opening_stock") {
      for (const field of ["stock_qty", "valuation_rate"]) {
        if (!present(row[field])) continue;
        try {
          const parsed = decimal(row[field]);
          if (parsed.raw < 0n) pushError(errors, "OPENING_STOCK_NEGATIVE", `opening_stock[${index}].${field} must be non-negative`);
        } catch (error) {
          pushError(errors, "OPENING_STOCK_NUMBER_INVALID", `opening_stock[${index}].${field}: ${error.message}`);
        }
      }
    }
  }
}

function keySet(rows, field) {
  return new Set(rows.filter((row) => present(row?.[field])).map((row) => String(row[field])));
}

function validateReferences(data, errors) {
  const customers = keySet(data.customers ?? [], "source_key");
  const suppliers = keySet(data.suppliers ?? [], "source_key");
  const itemCodes = keySet(data.items ?? [], "item_code");
  const warehouseKeys = keySet(data.warehouses ?? [], "source_key");
  const warehouseNames = keySet(data.warehouses ?? [], "warehouse_name");
  const employees = keySet(data.employees ?? [], "source_key");

  for (const [index, row] of (data.contacts ?? []).entries()) {
    if (present(row.customer_source_key) && !customers.has(String(row.customer_source_key))) pushError(errors, "REFERENCE_UNKNOWN", `contacts[${index}] customer_source_key not found`, row.customer_source_key);
  }
  for (const [index, row] of (data.opening_ar ?? []).entries()) {
    if (present(row.customer_source_key) && !customers.has(String(row.customer_source_key))) pushError(errors, "REFERENCE_UNKNOWN", `opening_ar[${index}] customer_source_key not found`, row.customer_source_key);
  }
  for (const [index, row] of (data.opening_ap ?? []).entries()) {
    if (present(row.supplier_source_key) && !suppliers.has(String(row.supplier_source_key))) pushError(errors, "REFERENCE_UNKNOWN", `opening_ap[${index}] supplier_source_key not found`, row.supplier_source_key);
  }
  for (const [index, row] of (data.opening_stock ?? []).entries()) {
    if (present(row.item_code) && !itemCodes.has(String(row.item_code))) pushError(errors, "REFERENCE_UNKNOWN", `opening_stock[${index}] item_code not found`, row.item_code);
    if (present(row.warehouse) && !warehouseKeys.has(String(row.warehouse)) && !warehouseNames.has(String(row.warehouse))) pushError(errors, "REFERENCE_UNKNOWN", `opening_stock[${index}] warehouse not found`, row.warehouse);
  }
  for (const [index, row] of (data.boms ?? []).entries()) {
    if (present(row.item_code) && !itemCodes.has(String(row.item_code))) pushError(errors, "REFERENCE_UNKNOWN", `boms[${index}] item_code not found`, row.item_code);
    if (Array.isArray(row.components)) {
      for (const [componentIndex, component] of row.components.entries()) {
        const itemCode = component?.item_code;
        if (present(itemCode) && !itemCodes.has(String(itemCode))) pushError(errors, "REFERENCE_UNKNOWN", `boms[${index}].components[${componentIndex}] item_code not found`, itemCode);
      }
    }
  }
  for (const [index, row] of (data.pilot_users ?? []).entries()) {
    if (present(row.employee_source_key) && !employees.has(String(row.employee_source_key))) pushError(errors, "REFERENCE_UNKNOWN", `pilot_users[${index}] employee_source_key not found`, row.employee_source_key);
  }
}

function computedTotals(dataset, rows) {
  if (dataset === "opening_ar" || dataset === "opening_ap") {
    const raw = rows.map((row) => integerMinor(row.amount_vnd ?? 0)).reduce((sum, value) => sum + value, 0n);
    return { total_amount_vnd: raw.toString() };
  }
  if (dataset === "opening_cash_bank") {
    const raw = rows.map((row) => integerMinor(row.balance_vnd ?? 0)).reduce((sum, value) => sum + value, 0n);
    return { total_balance_vnd: raw.toString() };
  }
  if (dataset === "opening_stock") {
    const qty = decimalAdd(rows.map((row) => row.stock_qty ?? 0));
    const values = rows.map((row) => decimalMul(row.stock_qty ?? 0, row.valuation_rate ?? 0));
    const value = decimalAdd(values.map(decimalToString));
    return { stock_qty_total: decimalToString(qty), stock_value_total: decimalToString(value) };
  }
  return {};
}

function validateSourceTotals(dataset, entry, rows, errors) {
  if (!(dataset in OPENING_TOTAL_KEYS)) return computedTotals(dataset, rows);
  const totals = entry.source_totals;
  if (!totals || typeof totals !== "object" || Array.isArray(totals)) {
    pushError(errors, "SOURCE_TOTALS_REQUIRED", `${dataset} requires source_totals for zero-variance reconciliation`);
    return computedTotals(dataset, rows);
  }
  const computed = computedTotals(dataset, rows);
  for (const key of OPENING_TOTAL_KEYS[dataset]) {
    if (!present(totals[key])) {
      pushError(errors, "SOURCE_TOTAL_MISSING", `${dataset}.source_totals missing ${key}`);
      continue;
    }
    try {
      if (!sameDecimal(totals[key], computed[key])) pushError(errors, "RECONCILIATION_VARIANCE", `${dataset} ${key} differs from mapped data`, { source: String(totals[key]), mapped: computed[key] });
    } catch (error) {
      pushError(errors, "SOURCE_TOTAL_INVALID", `${dataset}.${key}: ${error.message}`);
    }
  }
  return computed;
}

export function validatePilotBatch({ batchDir, mappingPath = defaultMappingPath } = {}) {
  if (!batchDir) throw new Error("batchDir is required");
  const errors = [];
  const warnings = [];
  const mapping = readJson(mappingPath);
  const manifestPath = path.join(batchDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return { format: "forge-alumdoor-pilot-preview/v1", status: "PREVIEW_FAIL", errors: [{ code: "MANIFEST_MISSING", message: "manifest.json not found" }], warnings, production_data_mutated: false };
  }
  const manifest = readJson(manifestPath);
  const mappingById = new Map((mapping.datasets ?? []).map((dataset) => [dataset.id, dataset]));

  for (const field of ["pilot_batch_id", "source_system", "cutoff_at", "extract_at", "local_display_timezone", "mapping_version", "extractor_identity", "tenant", "target_release_sha", "files", "scope"]) {
    if (!present(manifest[field])) pushError(errors, "MANIFEST_FIELD_MISSING", `manifest missing ${field}`);
  }
  if (manifest.tenant !== mapping.tenant) pushError(errors, "TENANT_MISMATCH", `manifest tenant must be ${mapping.tenant}`, manifest.tenant);
  if (manifest.target_release_sha !== mapping.target_release_sha) pushError(errors, "RELEASE_MISMATCH", "manifest target_release_sha must match frozen Pilot-00 release", manifest.target_release_sha);
  if (manifest.mapping_version !== mapping.version) pushError(errors, "MAPPING_VERSION_MISMATCH", `manifest mapping_version must be ${mapping.version}`, manifest.mapping_version);
  if (manifest.local_display_timezone !== "Asia/Ho_Chi_Minh") pushError(errors, "TIMEZONE_MISMATCH", "local_display_timezone must be Asia/Ho_Chi_Minh", manifest.local_display_timezone);
  if (manifest.scope && typeof manifest.scope.opening_cash_bank !== "boolean") pushError(errors, "CASH_BANK_SCOPE_REQUIRED", "manifest.scope.opening_cash_bank must be true or false");
  const cutoff = requireRfc3339(manifest.cutoff_at, "cutoff_at", errors);
  const extract = requireRfc3339(manifest.extract_at, "extract_at", errors);
  if (cutoff && extract && extract < cutoff) pushError(errors, "EXTRACT_BEFORE_CUTOFF", "extract_at must be at or after cutoff_at");

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!Array.isArray(manifest.files)) pushError(errors, "FILES_INVALID", "manifest.files must be an array");
  const seenDataset = new Set();
  const seenFile = new Set();
  for (const entry of files) {
    if (!present(entry?.dataset_id) || !present(entry?.name) || !present(entry?.sha256) || !present(entry?.row_count) && entry?.row_count !== 0 || entry?.source_totals === undefined) {
      pushError(errors, "FILE_MANIFEST_INCOMPLETE", "each files[] entry requires dataset_id, name, sha256, row_count and source_totals", entry);
      continue;
    }
    if (seenDataset.has(entry.dataset_id)) pushError(errors, "DUPLICATE_DATASET_FILE", `multiple files declared for dataset ${entry.dataset_id}`);
    seenDataset.add(entry.dataset_id);
    if (seenFile.has(entry.name)) pushError(errors, "DUPLICATE_FILE_NAME", `duplicate file name ${entry.name}`);
    seenFile.add(entry.name);
    if (!mappingById.has(entry.dataset_id)) pushError(errors, "DATASET_UNKNOWN", `dataset ${entry.dataset_id} is not in frozen mapping v1`);
    if (!/^[a-f0-9]{64}$/.test(String(entry.sha256))) pushError(errors, "SHA256_INVALID", `${entry.dataset_id} sha256 must be lowercase hex`);
    if (!Number.isSafeInteger(entry.row_count) || entry.row_count < 0) pushError(errors, "ROW_COUNT_INVALID", `${entry.dataset_id} row_count must be a non-negative safe integer`);
  }

  const requiredDatasets = [...REQUIRED_PILOT_01_DATASETS];
  if (manifest.scope?.opening_cash_bank === true) requiredDatasets.push("opening_cash_bank");
  for (const dataset of requiredDatasets) {
    if (!seenDataset.has(dataset)) pushError(errors, "REQUIRED_DATASET_MISSING", `Pilot-01 batch must include ${dataset}; use an empty JSON array when the approved source has zero rows`);
  }
  if (manifest.scope?.opening_cash_bank === false && seenDataset.has("opening_cash_bank")) pushError(errors, "CASH_BANK_OUT_OF_SCOPE", "opening_cash_bank file is present while manifest scope excludes it");

  const data = {};
  const fileEvidence = [];
  const reconciliation = {};
  for (const entry of files) {
    const mappingDataset = mappingById.get(entry.dataset_id);
    if (!mappingDataset) continue;
    const resolved = safeFile(batchDir, entry.name, errors);
    if (!resolved || !existsSync(resolved)) {
      pushError(errors, "DATA_FILE_MISSING", `${entry.dataset_id} file not found`, entry.name);
      continue;
    }
    const bytes = readFileSync(resolved);
    const digest = sha256(bytes);
    if (digest !== entry.sha256) pushError(errors, "FILE_HASH_MISMATCH", `${entry.dataset_id} sha256 mismatch`, { expected: entry.sha256, observed: digest });
    let rows;
    try { rows = JSON.parse(bytes.toString("utf8")); }
    catch (error) { pushError(errors, "DATA_JSON_INVALID", `${entry.dataset_id} is not valid JSON: ${error.message}`); continue; }
    if (!Array.isArray(rows)) { pushError(errors, "DATA_NOT_ARRAY", `${entry.dataset_id} data file must contain a JSON array`); continue; }
    if (rows.length !== entry.row_count) pushError(errors, "ROW_COUNT_MISMATCH", `${entry.dataset_id} row_count mismatch`, { expected: entry.row_count, observed: rows.length });
    validateRows(entry.dataset_id, rows, mappingDataset, errors);
    data[entry.dataset_id] = rows;
    const totals = validateSourceTotals(entry.dataset_id, entry, rows, errors);
    reconciliation[entry.dataset_id] = { row_count: rows.length, ...totals };
    fileEvidence.push({ dataset_id: entry.dataset_id, name: entry.name, sha256: digest, row_count: rows.length });
  }

  validateReferences(data, errors);
  const activeDirectors = (data.pilot_users ?? []).filter((row) => row.active === true && row.persona === "Giám đốc");
  if (activeDirectors.length !== 1) pushError(errors, "CUTOVER_APPROVER_ACCOUNT_INVALID", "Pilot-01 requires exactly one active named Giám đốc account before Pilot-02/Pilot-04 progression", { observed: activeDirectors.length });

  const status = errors.length === 0 ? "PREVIEW_PASS" : "PREVIEW_FAIL";
  return {
    format: "forge-alumdoor-pilot-preview/v1",
    status,
    pilot_batch_id: manifest.pilot_batch_id ?? null,
    tenant: manifest.tenant ?? null,
    target_release_sha: manifest.target_release_sha ?? null,
    mapping_version: manifest.mapping_version ?? null,
    cutoff_at: manifest.cutoff_at ?? null,
    extract_at: manifest.extract_at ?? null,
    source_system: manifest.source_system ?? null,
    scope: manifest.scope ?? null,
    files: fileEvidence,
    reconciliation,
    counts: { errors: errors.length, warnings: warnings.length, files: fileEvidence.length, rows: Object.values(data).reduce((sum, rows) => sum + rows.length, 0) },
    acceptance: {
      required_datasets_present: requiredDatasets.every((dataset) => seenDataset.has(dataset)),
      references_resolved: !errors.some((error) => error.code === "REFERENCE_UNKNOWN"),
      unexplained_reconciliation_variance: errors.filter((error) => error.code === "RECONCILIATION_VARIANCE").length,
      named_cutover_approver_account: activeDirectors.length === 1,
      production_write_authorized: false,
    },
    errors,
    warnings,
    production_data_mutated: false,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--batch-dir") args.batchDir = argv[++index];
    else if (token === "--mapping") args.mappingPath = argv[++index];
    else if (token === "--output") args.output = argv[++index];
    else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node docs/pilot/alumdoor/tools/validate-pilot-batch.mjs --batch-dir <secure-batch-dir> [--output <preview.json>] [--mapping <mapping.json>]",
    "",
    "Input files are canonical JSON arrays. The validator is preview-only and never connects to production.",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    if (!args.batchDir) throw new Error("--batch-dir is required");
    const result = validatePilotBatch({ batchDir: path.resolve(args.batchDir), mappingPath: args.mappingPath ? path.resolve(args.mappingPath) : defaultMappingPath });
    const body = `${JSON.stringify(result, null, 2)}\n`;
    if (args.output) {
      const output = path.resolve(args.output);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, body);
    }
    process.stdout.write(body);
    process.exit(result.status === "PREVIEW_PASS" ? 0 : 1);
  } catch (error) {
    console.error(error?.stack || error);
    console.error(usage());
    process.exit(2);
  }
}
