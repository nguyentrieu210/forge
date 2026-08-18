#!/usr/bin/env node
/**
 * Codespace-only Alumdoor baseline seed.
 *
 * Creates useful tenant masters and role-specific test users in the Codespace local D1.
 * This script is intentionally local-only: it has no --remote mode and always invokes
 * Wrangler with --local. Passwords are generated into an ignored workspace file and
 * are never printed to stdout (Actions logs for this public repository are public).
 */
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { hashPassword } from "../dist/packages/frappe-api/src/index.js";

if (process.argv.some((arg) => arg === "--remote" || arg.includes("--remote"))) {
  throw new Error("CODESPACE_BASELINE_REMOTE_FORBIDDEN");
}

const serverRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");
const tenant = "demo";
const now = new Date().toISOString();
const credentialsPath = path.join(repoRoot, ".codespace-role-credentials");
const quote = (value) => String(value).replaceAll("'", "''");

const accounts = [
  { user: "owner@forge.local", name: "Chủ xưởng", roles: ["Chủ xưởng", "Director", "Giám đốc"] },
  { user: "sales@forge.local", name: "Kinh doanh", roles: ["Kinh doanh", "Sales User"] },
  { user: "warehouse@forge.local", name: "Thủ kho", roles: ["Thủ kho", "Stock User"] },
  { user: "accounting@forge.local", name: "Kế toán", roles: ["Kế toán", "General Accountant", "Kế toán tổng hợp", "Accounts User"] },
  { user: "chief-accounting@forge.local", name: "Kế toán trưởng", roles: ["Chief Accountant", "Kế toán trưởng", "Accounts Manager"] },
  { user: "production@forge.local", name: "Sản xuất", roles: ["Sản xuất", "Manufacturing User"] },
  { user: "hr@forge.local", name: "Nhân sự", roles: ["HR Manager", "HR User", "Payroll Manager", "Payroll User"] },
  { user: "attendance@forge.local", name: "Chấm công", roles: ["Employee", "HR User"] },
];

let password = "";
if (existsSync(credentialsPath)) {
  password = readFileSync(credentialsPath, "utf8").match(/^password=(.+)$/m)?.[1]?.trim() ?? "";
}
if (!password) {
  password = `${crypto.randomBytes(18).toString("base64url")}!A7`;
  const body = [
    "# Codespace-only role accounts. This file must stay untracked.",
    `password=${password}`,
    ...accounts.map((row) => `${row.name}=${row.user}`),
    "",
  ].join("\n");
  writeFileSync(credentialsPath, body, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(credentialsPath, 0o600); } catch { /* best effort */ }
}

const passwordHash = await hashPassword(password);
const roles = [...new Set(accounts.flatMap((row) => row.roles))].sort((a, b) => a.localeCompare(b, "vi"));
const masters = [
  ["Company", "ALUMDOOR", { company_name: "ALUMDOOR", default_currency: "VND", country: "Vietnam" }],
  ["Currency", "VND", { currency_name: "Vietnamese Dong", symbol: "₫", currency_scale: 0 }],
  ["Fiscal Year", "2026", { year: "2026", year_start_date: "2026-01-01", year_end_date: "2026-12-31" }],
  ["Branch", "Xưởng 1", { branch: "Xưởng 1", company: "ALUMDOOR" }],
  ["Branch", "Xưởng 2", { branch: "Xưởng 2", company: "ALUMDOOR" }],
  ["Warehouse", "K36", { warehouse_name: "K36", company: "ALUMDOOR", branch: "Xưởng 2" }],
  ["Warehouse", "Xưởng 1", { warehouse_name: "Xưởng 1", company: "ALUMDOOR", branch: "Xưởng 1" }],
  ["Warehouse", "Xưởng 2", { warehouse_name: "Xưởng 2", company: "ALUMDOOR", branch: "Xưởng 2" }],
  ["System Settings", "System Settings", { currency: "VND", date_format: "dd/mm/yyyy", time_zone: "Asia/Ho_Chi_Minh" }],
];

const statements = [];
for (const role of roles) {
  statements.push(`INSERT INTO roles(tenant_id,role,desk_access,is_standard,disabled,modified_at)
VALUES('${tenant}','${quote(role)}',1,0,0,'${now}')
ON CONFLICT(tenant_id,role) DO UPDATE SET disabled=0,modified_at=excluded.modified_at;`);
}
for (const [type, name, data] of masters) {
  statements.push(`INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
VALUES('${tenant}','${quote(type)}','${quote(name)}','${quote(JSON.stringify(data))}','${now}')
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json,disabled=0,modified_at=excluded.modified_at;`);
}
for (const account of accounts) {
  statements.push(`INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,enabled,user_type,language,time_zone,created_at,modified_at)
VALUES('${tenant}','${quote(account.user)}','${quote(account.name)}','${quote(account.user)}','${quote(passwordHash)}',1,'System User','vi','Asia/Ho_Chi_Minh','${now}','${now}')
ON CONFLICT(tenant_id,user_id) DO UPDATE SET full_name=excluded.full_name,email=excluded.email,password_hash=excluded.password_hash,enabled=1,user_type='System User',language='vi',time_zone='Asia/Ho_Chi_Minh',modified_at=excluded.modified_at;`);
  statements.push(`DELETE FROM user_roles WHERE tenant_id='${tenant}' AND user_id='${quote(account.user)}';`);
  for (const role of account.roles) {
    statements.push(`INSERT INTO user_roles(tenant_id,user_id,role) VALUES('${tenant}','${quote(account.user)}','${quote(role)}') ON CONFLICT DO NOTHING;`);
  }
}

const sqlPath = path.join(serverRoot, ".codespace-baseline-seed.sql");
writeFileSync(sqlPath, `${statements.join("\n")}\n`, "utf8");
const wranglerEntry = path.join(path.dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin", "wrangler.js");
const result = spawnSync(process.execPath, [
  wranglerEntry,
  "d1", "execute", "cloudforge-demo",
  "--local",
  "--config", "apps/tenant-worker/wrangler.jsonc",
  "--file", path.basename(sqlPath),
], { cwd: serverRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try { writeFileSync(sqlPath, "", "utf8"); } catch { /* ignored */ }
try { await import("node:fs/promises").then(({ unlink }) => unlink(sqlPath)); } catch { /* ignored */ }
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "Codespace baseline D1 seed failed");
  process.exit(1);
}

console.log(`CODESPACE_ALUMDOOR_BASELINE_PASS tenant=${tenant} users=${accounts.length} roles=${roles.length} masters=${masters.length}`);
console.log(`CODESPACE_ROLE_CREDENTIALS_STORED path=${credentialsPath} password=[hidden]`);
for (const account of accounts) console.log(`CODESPACE_ROLE_USER user=${account.user} roles=${account.roles.join(",")}`);
