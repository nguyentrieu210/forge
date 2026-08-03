#!/usr/bin/env node
/**
 * Alumdoor Employee Lite — canonical HRM permission upgrade + tenant-scoped presentation overlay.
 *
 * Goal: Employee on tenant `alu` is an attendance identity, not a miniature HR/accounting setup.
 * Keep only the fields the workshop actually authors:
 *   - employee_name
 *   - mobile
 *   - bank_account_no
 *   - bank_name
 *   - user_id
 *
 * The sensitive fields remain at permlevel=1. Their write grants belong in the VERSIONED HRM
 * package, not in Permission Manager: Forge deliberately refuses runtime DocPerm mutation because
 * an app reinstall would silently erase it. This script therefore installs/upgrades the checked-in
 * HRM package first, then applies Alumdoor-only Property Setter overlays for visibility/requiredness.
 *
 * Dry-run is the default. Production write requires BOTH `--execute` and `--confirm ALU_EMPLOYEE_LITE`.
 * Credentials come from environment variables and are never accepted as CLI arguments.
 */

import { fileURLToPath } from "node:url";
import { readAppSource } from "./lib/read-app-source.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const execute = args.includes("--execute");
const confirm = argOf("confirm", "");
const origin = (argOf("origin", process.env.FORGE_ORIGIN ?? "https://alu.kairo.vn") ?? "").replace(/\/$/, "");
const user = process.env.FORGE_ADMIN_USER ?? process.env.ALU_META_ADMIN_USER ?? "";
const password = process.env.FORGE_ADMIN_PASSWORD ?? process.env.ALU_META_ADMIN_PASSWORD ?? "";
const hrmSource = fileURLToPath(new URL("../apps-src/hrm/", import.meta.url));
const hrmPackage = await readAppSource(hrmSource);

const KEEP_FIELDS = new Set([
  "employee_name",
  "mobile",
  "bank_account_no",
  "bank_name",
  "user_id",
]);

const REQUIRED_OFF = [
  "company",
  "branch",
  "employee_number",
  "department",
  "designation",
  "employment_type",
  "cost_center",
  "date_of_joining",
];

const ALL_EMPLOYEE_FIELDS = [
  "employee_name",
  "company",
  "branch",
  "employee_number",
  "user_id",
  "department",
  "designation",
  "employment_type",
  "cost_center",
  "employee_status",
  "date_of_joining",
  "work_email",
  "personal_email",
  "mobile",
  "date_of_birth",
  "gender",
  "tax_code",
  "social_insurance_number",
  "bank_account_no",
  "bank_name",
  "emergency_contact_name",
  "emergency_contact_phone",
  "reports_to",
  "holiday_list",
  "has_left",
  "relieving_date",
  "salary_note",
];

const fieldLevelRoles = ["HR User", "HR Manager", "System Manager"];
const sensitiveFields = ["mobile", "bank_account_no", "bank_name"];

const setters = [];
const setter = (field, property, propertyType, value) => setters.push({
  name: `ALU-Employee-${field}-${property}`,
  doc_type: "Employee",
  doctype_or_field: "DocField",
  field_name: field,
  property,
  property_type: propertyType,
  value: String(value),
});

// Turn required off BEFORE hiding those fields. The server validates the effective schema after
// every Property Setter write, so this order keeps every intermediate state usable as well.
for (const field of REQUIRED_OFF) setter(field, "reqd", "Check", "0");
for (const field of ALL_EMPLOYEE_FIELDS) {
  if (!KEEP_FIELDS.has(field)) setter(field, "hidden", "Check", "1");
}

// Preserve useful system defaults without asking the operator to maintain HR structure.
setter("employee_status", "default", "Data", "Đang làm việc");
setter("date_of_joining", "default", "Data", "Today");

// Language of the actual workshop task, not leaked ERP internals.
setter("user_id", "label", "Data", "Tài khoản đăng nhập");
setter("mobile", "label", "Data", "Số điện thoại");
setter("bank_account_no", "label", "Data", "Số tài khoản ngân hàng");
setter("bank_name", "label", "Data", "Ngân hàng");

function flag(value) {
  return value === true || value === 1 || value === "1";
}

function hasLevelOneGrant(meta, role) {
  return (meta.permissions ?? []).some((permission) => (
    permission.role === role
    && Number(permission.permlevel ?? 0) === 1
    && flag(permission.read)
    && flag(permission.write)
    && (flag(permission.create) || flag(permission.write))
  ));
}

function assertPackagePermissionContract(pkg) {
  const employee = (pkg.doctypes ?? []).find((doctype) => doctype.name === "Employee");
  if (!employee) throw new Error("Checked-in HRM package is missing Employee metadata");
  for (const name of sensitiveFields) {
    const entry = (employee.fields ?? []).find((field) => field.fieldname === name);
    if (!entry || Number(entry.permlevel ?? 0) !== 1) {
      throw new Error(`Checked-in HRM package must keep Employee.${name} at permlevel 1`);
    }
  }
  for (const role of fieldLevelRoles) {
    if (!hasLevelOneGrant(employee, role)) {
      throw new Error(`Checked-in HRM package is missing Employee permlevel 1 write grant for ${role}`);
    }
  }
}

assertPackagePermissionContract(hrmPackage);

function summary() {
  return {
    tenant: "alu",
    doctype: "Employee",
    hrm_package: `${hrmPackage.id}@${hrmPackage.version}`,
    visible_fields: [...KEEP_FIELDS],
    hidden_fields: ALL_EMPLOYEE_FIELDS.filter((field) => !KEEP_FIELDS.has(field)),
    required_removed: REQUIRED_OFF,
    sensitive_permlevel_1_roles: fieldLevelRoles,
    property_setters: setters.length,
  };
}

if (!execute) {
  console.log(JSON.stringify({ mode: "dry-run", ...summary() }, null, 2));
  console.log("No production write performed. Re-run with --execute --confirm ALU_EMPLOYEE_LITE after approval.");
  process.exit(0);
}

if (confirm !== "ALU_EMPLOYEE_LITE") {
  throw new Error("Refusing production customization: pass --confirm ALU_EMPLOYEE_LITE");
}
if (!origin) throw new Error("FORGE_ORIGIN or --origin is required");
if (!user || !password) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD (or ALU_META_ADMIN_*) are required");

const jar = new Map();
let csrfToken = "";

function storeCookies(response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}
function cookieHeader() {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...(csrfToken ? { "x-frappe-csrf-token": csrfToken } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  storeCookies(response);
  csrfToken = response.headers.get("x-frappe-csrf-token") ?? csrfToken;
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (!response.ok) {
    const detail = parsed?.message ?? parsed?.exception ?? text.slice(0, 500);
    throw new Error(`${method} ${path} → HTTP ${response.status}: ${detail}`);
  }
  return parsed?.message ?? parsed;
}

async function call(method, body = {}, httpMethod = "POST") {
  if (httpMethod === "GET") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const suffix = params.size ? `?${params.toString()}` : "";
    return request(`/api/method/${method}${suffix}`, { method: "GET" });
  }
  return request(`/api/method/${method}`, { method: httpMethod, body });
}

async function loadEmployeeMeta() {
  const payload = await request("/api/method/frappe.desk.form.load.getdoctype?doctype=Employee&with_parent=1");
  const docs = payload?.docs ?? payload?.message?.docs ?? [];
  const employee = docs.find((doc) => doc?.name === "Employee");
  if (!employee) throw new Error("Employee metadata was not returned by getdoctype");
  return employee;
}

function field(meta, name) {
  const value = (meta.fields ?? []).find((entry) => entry.fieldname === name);
  if (!value) throw new Error(`Employee.${name} is missing from metadata`);
  return value;
}

function alreadyApplied(meta) {
  return REQUIRED_OFF.every((name) => !flag(field(meta, name).reqd ?? field(meta, name).required))
    && ALL_EMPLOYEE_FIELDS.filter((name) => !KEEP_FIELDS.has(name)).every((name) => flag(field(meta, name).hidden))
    && field(meta, "user_id").label === "Tài khoản đăng nhập"
    && field(meta, "mobile").label === "Số điện thoại"
    && field(meta, "bank_account_no").label === "Số tài khoản ngân hàng"
    && field(meta, "bank_name").label === "Ngân hàng"
    && fieldLevelRoles.every((role) => hasLevelOneGrant(meta, role));
}

console.log(`Authenticating ${origin} as ${user}…`);
await call("login", { usr: user, pwd: password });

// Canonical fix for the locked SĐT/bank fields: install the versioned HRM metadata that owns
// Employee DocPerm. Runtime Permission Manager writes are intentionally unsupported on Forge.
const install = await call("forge.apps.install", { app: hrmPackage });
console.log(`HRM ${hrmPackage.version}: ${install.outcome} (${install.doctypes} doctypes)`);

const before = await loadEmployeeMeta();
if (alreadyApplied(before)) {
  console.log(JSON.stringify({ mode: "execute", outcome: "noop", reason: "Employee Lite already applied", ...summary() }, null, 2));
  process.exit(0);
}

for (const record of setters) {
  await request("/api/resource/Property%20Setter", { method: "POST", body: record });
}

const after = await loadEmployeeMeta();
if (!alreadyApplied(after)) throw new Error("Employee Lite verification failed after HRM upgrade + Property Setters");

console.log(JSON.stringify({ mode: "execute", outcome: "applied", effective_revision: after.effective_revision ?? after.revision, ...summary() }, null, 2));
