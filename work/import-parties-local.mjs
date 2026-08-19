import { existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const expectIdempotent = args.includes("--expect-idempotent");
const auditPath = path.resolve(args.find((arg) => !arg.startsWith("--")) || "work/customer-only.audit.json");
const reportPath = path.resolve("work/customer-supplier-import-report.json");
const origin = (process.env.FORGE_ORIGIN || "http://127.0.0.1:8799").replace(/\/$/, "");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const customers = (audit.customer_preview || []).map((row, index) => ({
  row_number: index + 1,
  values: { customer_name: row.name, price_group: row.price_group },
}));
const suppliers = (audit.supplier_preview || []).map((row) => ({
  supplier_name: row.name,
  supplier_group: row.supplier_group || "Khác",
  ...(row.phone ? { phone: row.phone } : {}),
  ...(row.address ? { address: row.address } : {}),
  ...(row.note ? { note: row.note } : {}),
  disabled: false,
}));
if (!customers.length || !suppliers.length) throw new Error("party source audit is empty");
const host = new URL(origin).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`remote mutation refused: ${host}`);

const cookies = new Map();
let csrf = "";
const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
async function request(url, method = "GET", body) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookieHeader()) headers.set("cookie", cookieHeader());
  if (csrf && method !== "GET") headers.set("x-frappe-csrf-token", csrf);
  const response = await fetch(`${origin}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(";", 1)[0]; const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  csrf = response.headers.get("x-frappe-csrf-token") || csrf;
  const text = await response.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!response.ok) throw new Error(`${method} ${url} failed ${response.status}: ${text.slice(0, 500)}`);
  return parsed?.message ?? parsed;
}
const listAll = async (doctype) => {
  const rows = [];
  for (let start = 0; start < 10000; start += 100) {
    const page = (await request(`/api/resource/${encodeURIComponent(doctype)}?limit_start=${start}&limit_page_length=100`))?.data || [];
    rows.push(...page);
    if (page.length < 100) return rows;
  }
  throw new Error(`${doctype} exceeded safe pagination limit`);
};
const dryRunCustomers = async () => request("/api/method/alumdoor.customer_import.dry_run", "POST", { rows: customers });
const statusCounts = (rows) => rows.reduce((out, row) => { out[row.status] = (out[row.status] || 0) + 1; return out; }, {});
const login = async () => {
  await request("/api/method/login", "POST", { usr: process.env.FORGE_ADMIN_USER || "dev@example.com", pwd: process.env.FORGE_ADMIN_PASSWORD || "local-dev-password-1" });
  await request("/api/method/metaforge.api.get_boot");
};

await login();
const customerDry = await dryRunCustomers();
const customerRows = customerDry.rows || [];
const existingCustomers = await listAll("Customer");
const existingCustomerNames = new Set(existingCustomers.map((row) => String(row.name || row.customer_name || "")));
const customerPlan = customers.map((row) => ({ name: row.values.customer_name, status: existingCustomerNames.has(row.values.customer_name) ? "DUPLICATE_EXACT" : "READY_CREATE" }));
const customerStatuses = statusCounts(customerPlan);
const customerBlockers = customerRows.filter((row) => !["READY_CREATE", "DUPLICATE_EXACT"].includes(row.status));
const existingSuppliers = await listAll("Supplier");
const existingSupplierNames = new Set(existingSuppliers.map((row) => String(row.name || row.supplier_name || "")));
const supplierPlan = suppliers.map((row) => ({
  name: row.supplier_name,
  status: existingSupplierNames.has(row.supplier_name) ? "DUPLICATE_EXACT" : "READY_CREATE",
}));
const supplierStatuses = statusCounts(supplierPlan);
const blockers = customerBlockers.map((row) => ({ type: "customer", row_number: row.row_number, status: row.status }));
if (blockers.length) throw new Error(`party preflight blocked=${blockers.length}`);
if (expectIdempotent && (customerStatuses.READY_CREATE || supplierStatuses.READY_CREATE)) {
  throw new Error(`party idempotency blocked customer_ready=${customerStatuses.READY_CREATE || 0} supplier_ready=${supplierStatuses.READY_CREATE || 0}`);
}
const result = {
  format: "alumdoor-customer-supplier-local-import/v1",
  captured_at: new Date().toISOString(),
  source_audit: auditPath,
  source_counts: { customers: customers.length, suppliers: suppliers.length },
  customer_preflight: { statuses: customerStatuses, service_statuses: statusCounts(customerRows), dry_run_token: customerDry.dry_run_token },
  supplier_preflight: { statuses: supplierStatuses },
  blockers,
  writes: { customer_imported: 0, supplier_created: 0, supplier_exact: 0 },
};
if (!apply) {
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`ALUMDOOR_PARTY_DRY_RUN_PASS customers=${customers.length} suppliers=${suppliers.length} customer_ready=${customerStatuses.READY_CREATE || 0} supplier_ready=${supplierStatuses.READY_CREATE || 0}`);
  process.exit(0);
}

const lockPath = path.resolve("local-locks/local-d1-mutation.lock");
const runId = `party-import-${Date.now()}`;
if (existsSync(lockPath)) throw new Error(`active local D1 lock exists: ${lockPath}`);
mkdirSync(path.dirname(lockPath), { recursive: true });
const fd = openSync(lockPath, "wx");
writeFileSync(fd, `${JSON.stringify({ format: "forge-local-d1-lock/v2", run_id: runId, adapter: "party-import", pid: process.pid, hostname: os.hostname(), started_at: new Date().toISOString() }, null, 2)}\n`, "utf8");
closeSync(fd);
try {
  result.commit = { imported: 0, failed: 0, skipped: 0, failed_rows: [] };
  // The runtime's specialised commit endpoint reports success without persisting
  // the rows. Use the same official REST DocType create path that the Desk uses,
  // while retaining the specialised dry-run as the source-of-truth preflight.
  for (let offset = 0; offset < customers.length; offset += 80) {
    await login();
    const chunk = customers.slice(offset, offset + 80);
    for (const row of chunk) {
      if (existingCustomerNames.has(row.values.customer_name)) { result.commit.skipped += 1; continue; }
      try {
        await request("/api/resource/Customer", "POST", { ...row.values, disabled: false });
        existingCustomerNames.add(row.values.customer_name);
        result.commit.imported += 1;
      } catch (error) {
        result.commit.failed += 1;
        result.commit.failed_rows.push({ row_number: row.row_number, message: error.message });
      }
    }
    if (result.commit.failed !== 0) {
      writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      throw new Error(`customer REST commit failed offset=${offset} failed=${result.commit.failed}`);
    }
  }
  result.writes.customer_imported = result.commit.imported;
  for (const row of suppliers) {
    if (existingSupplierNames.has(row.supplier_name)) { result.writes.supplier_exact += 1; continue; }
    await request("/api/resource/Supplier", "POST", row);
    result.writes.supplier_created += 1;
  }
  const customerVerifyNames = new Set((await listAll("Customer")).map((row) => String(row.name || row.customer_name || "")));
  const missingCustomers = customers.map((row) => row.values.customer_name).filter((name) => !customerVerifyNames.has(name));
  if (missingCustomers.length) throw new Error(`customer verify missing=${missingCustomers.slice(0, 20).join(", ")}`);
  const verifyStatuses = { DUPLICATE_EXACT: customers.length, READY_CREATE: 0 };
  const supplierVerifyNames = new Set((await listAll("Supplier")).map((row) => String(row.name || row.supplier_name || "")));
  const missingSuppliers = suppliers.map((row) => row.supplier_name).filter((name) => !supplierVerifyNames.has(name));
  if (missingSuppliers.length) throw new Error(`supplier verify missing=${missingSuppliers.join(", ")}`);
  result.verify = { customer_statuses: verifyStatuses, suppliers: suppliers.length, missing_customers: missingCustomers, missing_suppliers: missingSuppliers };
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  if (expectIdempotent && result.writes.customer_imported !== 0) throw new Error(`customer idempotency failed imported=${result.writes.customer_imported}`);
  console.log(`ALUMDOOR_PARTY_IMPORT_PASS customers=${customers.length} customer_imported=${result.writes.customer_imported} suppliers=${suppliers.length} supplier_created=${result.writes.supplier_created} supplier_exact=${result.writes.supplier_exact}`);
  if (expectIdempotent) console.log("ALUMDOOR_PARTY_IDEMPOTENCY_PASS customer_imported=0 supplier_created=0");
} finally {
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.run_id === runId) unlinkSync(lockPath);
  }
}
