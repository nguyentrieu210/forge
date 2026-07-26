#!/usr/bin/env node
/**
 * Demo data for the HRM app, with the SEGREGATION OF DUTIES intact.
 *
 *   node scripts/seed-hrm-demo.mjs --base https://…workers.dev \
 *     --admin admin@kairo.vn --admin-password … --config apps/tenant-worker/wrangler.hrm.jsonc --tenant hrm
 *
 * Leave applications are created and submitted BY AN EMPLOYEE, not by the approver.
 * That detail is the whole point: `allow_self_approval: false` means the person who
 * raised a request may not approve it, so demo data seeded by the administrator leaves
 * an approval queue with nothing the administrator may actually act on. A screen tested
 * against that data looks broken while behaving perfectly.
 *
 * Creating the employee account needs direct database access — the façade deliberately
 * exposes no create-user method — so this needs a wrangler config for the tenant's D1.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fail, serverRoot } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const base = (argOf("base") ?? "").replace(/\/$/, "");
const admin = argOf("admin");
const adminPassword = argOf("admin-password");
const config = argOf("config");
const tenant = argOf("tenant", "hrm");
const employee = argOf("employee", "nhanvien@kairo.vn");

if (!base) fail("--base <https://…> is required");
if (!admin || !adminPassword) fail("--admin and --admin-password are required");
if (!config) fail("--config <wrangler config for the tenant> is required");

/** Creates the employee account and returns the password it was issued. */
function createEmployee() {
  const result = spawnSync(process.execPath, [
    path.join(serverRoot, "scripts", "seed-remote-admin.mjs"),
    "--config", config, "--tenant", tenant, "--user", employee, "--name", "Nhân viên Demo", "--role", "Employee",
  ], { cwd: serverRoot, encoding: "utf8" });
  if (result.status !== 0) fail(`seed-remote-admin exited ${result.status}\n${result.stdout}${result.stderr}`);
  const password = result.stdout.match(/^\s{4}(\S{16,})\s*$/m)?.[1];
  if (!password) fail(`could not read the issued password from seed-remote-admin output:\n${result.stdout}`);
  return password;
}

async function session(usr, pwd) {
  const response = await fetch(`${base}/api/method/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usr, pwd }),
  });
  if (!response.ok) fail(`login failed for ${usr}: ${response.status} ${await response.text()}`);
  return {
    cookie: (response.headers.get("set-cookie") ?? "").split(";")[0],
    "x-frappe-csrf-token": response.headers.get("x-frappe-csrf-token") ?? "",
    "content-type": "application/json",
  };
}

async function post(headers, url, body) {
  const response = await fetch(`${base}${url}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

console.log(`base     ${base}`);
console.log(`tenant   ${tenant}`);
console.log(`employee ${employee}\n`);

const employeePassword = createEmployee();
console.log(`employee account issued`);

const asAdmin = await session(admin, adminPassword);
const asEmployee = await session(employee, employeePassword);

// Employee master records — the approver is a DIFFERENT person from the requester.
const staff = [
  { employee_name: "Nguyễn Văn An", department: "Kỹ thuật", designation: "Nhân viên", date_of_joining: "2024-03-01" },
  { employee_name: "Trần Thị Bình", department: "Nhân sự", designation: "Trưởng phòng", date_of_joining: "2022-01-10" },
];
const created = [];
for (const record of staff) {
  const result = await post(asAdmin, "/api/resource/Employee", record);
  if (result.status === 201) created.push(result.body.data.name);
}
const existing = (await (await fetch(`${base}/api/method/frappe.client.get_list?doctype=Employee&fields=%5B%22name%22%5D`, { headers: asAdmin })).json()).message ?? [];
const names = created.length >= 2 ? created : existing.map((row) => row.name);
if (names.length < 2) fail("need at least two Employee records: one requester, one approver");
const [requester, approver] = names;

// Raised BY THE EMPLOYEE, so the administrator is free to approve them.
const requests = [
  { leave_type: "Phép năm", from_date: "2026-08-03", to_date: "2026-08-05", total_days: 3, reason: "Nghỉ phép năm" },
  { leave_type: "Nghỉ ốm", from_date: "2026-08-10", to_date: "2026-08-11", total_days: 2, reason: "Sốt cao, có giấy bác sĩ" },
  { leave_type: "Phép năm", from_date: "2026-09-01", to_date: "2026-09-05", total_days: 5, reason: "Nghỉ phép năm cùng gia đình" },
];
let pending = 0;
for (const request of requests) {
  const result = await post(asEmployee, "/api/resource/Leave%20Application", { ...request, employee: requester, approver });
  if (result.status !== 201) {
    console.log(`  skipped (${result.status}): ${JSON.stringify(result.body).slice(0, 140)}`);
    continue;
  }
  const doc = result.body.data;
  const moved = await post(asEmployee, "/api/method/frappe.model.workflow.apply_workflow", {
    doc: JSON.stringify({ doctype: "Leave Application", name: doc.name, modified: doc.modified }),
    action: "Gửi duyệt",
  });
  if (moved.status === 200) pending += 1;
  console.log(`  ${doc.name} → ${moved.status === 200 ? "Chờ duyệt" : `KHÔNG gửi được (${moved.status})`}`);
}

console.log(`\n${pending} đơn đang chờ duyệt, do ${employee} gửi.`);
console.log(`Quản lý (${admin}) duyệt được vì KHÔNG phải người tạo đơn.`);
