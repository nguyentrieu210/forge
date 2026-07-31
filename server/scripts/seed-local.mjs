#!/usr/bin/env node
/**
 * Seeds the LOCAL D1 database for `wrangler dev`, so the HTTP smoke test has
 * something to log into and something to write.
 *
 *   npm run dev:seed -- [--user dev@example.com] [--password local-dev-password-1]
 *   node scripts/seed-local.mjs --auth-only --user qa@example.test --password ...
 *
 * `--auth-only` creates only the System Manager account. It exists for CI flows
 * that must log in before installing an authoritative app; pre-seeding demo
 * DocTypes or master records would make the app installer correctly reject those
 * names as unowned metadata.
 *
 * Emits SQL and applies it with `wrangler d1 execute --local`. It refuses to run
 * against a remote database: seeding a fixed password into a real tenant would hand
 * anyone who read this file a working account.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { hashPassword } from "../dist/packages/frappe-api/src/index.js";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const remote = args.includes("--remote");
const withUser = !args.includes("--no-user");
const authOnly = args.includes("--auth-only");
if (remote && withUser) {
  console.error("refusing: this seed carries a known password, so --remote needs --no-user");
  console.error("  metadata only:  node scripts/seed-local.mjs --remote --no-user");
  console.error("  the account:    node scripts/seed-remote-admin.mjs --config apps/tenant-worker/wrangler.jsonc");
  process.exit(2);
}
if (authOnly && !withUser) {
  console.error("refusing: --auth-only and --no-user would produce an empty seed");
  process.exit(2);
}
if (authOnly && remote) {
  console.error("refusing: --auth-only is local-only; use seed-remote-admin.mjs for remote accounts");
  process.exit(2);
}

const user = argOf("user", "dev@example.com");
const password = argOf("password", "local-dev-password-1");
const tenant = argOf("tenant", "demo");
const now = new Date().toISOString();

const quote = (value) => String(value).replace(/'/g, "''");
const hash = await hashPassword(password);

const visitMeta = {
  name: "Field Visit",
  module: "Custom",
  is_submittable: true,
  autoname: "FV-.YYYY.-####",
  title_field: "subject",
  search_fields: ["subject"],
  track_seen: true,
  fields: [
    { fieldname: "subject", label: "Subject", fieldtype: "Data", required: true, in_list_view: true },
    { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", in_list_view: true },
    { fieldname: "is_billable", label: "Billable", fieldtype: "Check" },
    { fieldname: "billing_note", label: "Billing Note", fieldtype: "Data", mandatory_depends_on: "eval:doc.is_billable == 1" },
  ],
  permissions: [{
    role: "System Manager",
    read: true, write: true, create: true, submit: true, cancel: true,
    amend: true, share: true, report: true, export: true, print: true,
  }],
  revision: 1,
};

const masters = [
  ["Company", "Demo", { default_currency: "USD" }],
  ["Currency", "USD", { currency_scale: 2 }],
  ["Customer", "CUST-1", { customer_name: "Acme Corporation" }],
  ["Customer", "CUST-2", { customer_name: "Beta Industries" }],
  ["Warehouse", "Stores", {}],
  ["System Settings", "System Settings", { currency: "USD", date_format: "dd-mm-yyyy", time_zone: "Asia/Ho_Chi_Minh" }],
];

const accountStatements = [
  `INSERT INTO roles(tenant_id,role,modified_at) VALUES('${quote(tenant)}','System Manager','${now}') ON CONFLICT(tenant_id,role) DO NOTHING;`,
  `INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,language,time_zone,created_at,modified_at)
   VALUES('${quote(tenant)}','${quote(user)}','Dev User','${quote(user)}','${quote(hash)}','vi','Asia/Ho_Chi_Minh','${now}','${now}')
   ON CONFLICT(tenant_id,user_id) DO UPDATE SET password_hash=excluded.password_hash, modified_at=excluded.modified_at;`,
  `INSERT INTO user_roles(tenant_id,user_id,role) VALUES('${quote(tenant)}','${quote(user)}','System Manager') ON CONFLICT DO NOTHING;`,
];

const metadataStatements = [
  ...masters.map(([type, name, data]) =>
    `INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
     VALUES('${quote(tenant)}','${quote(type)}','${quote(name)}','${quote(JSON.stringify(data))}','${now}')
     ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json, disabled=0;`),
  `INSERT INTO doctype_definitions(tenant_id,doctype,module,is_submittable,revision,metadata_json,modified_by,modified_at)
   VALUES('${quote(tenant)}','Field Visit','Custom',1,1,'${quote(JSON.stringify(visitMeta))}','Administrator','${now}')
   ON CONFLICT(tenant_id,doctype) DO UPDATE SET metadata_json=excluded.metadata_json;`,
  `INSERT INTO translations(tenant_id,language,source_text,translated_text,context,modified_at)
   VALUES('${quote(tenant)}','vi','Subject','Chủ đề','','${now}')
   ON CONFLICT(tenant_id,language,context,source_text) DO UPDATE SET translated_text=excluded.translated_text;`,
];

const statements = [
  ...(withUser ? accountStatements : []),
  ...(authOnly ? [] : metadataStatements),
];

const sqlFile = path.join(process.cwd(), "seed-local.sql");
writeFileSync(sqlFile, statements.join("\n"), "utf8");

const wranglerEntry = path.join(
  path.dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin",
  "wrangler.js",
);
const result = spawnSync(
  process.execPath,
  [wranglerEntry, "d1", "execute", "cloudforge-demo", remote ? "--remote" : "--local", "--config", "apps/tenant-worker/wrangler.jsonc", "--file", "seed-local.sql"],
  { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
);

try { unlinkSync(sqlFile); } catch { /* already gone */ }

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  console.error(remote
    ? "SEED_FAILED — has `node scripts/d1-migrate-remote.mjs --config apps/tenant-worker/wrangler.jsonc` been run?"
    : "SEED_FAILED — has `wrangler d1 migrations apply cloudforge-demo --local` been run?");
  process.exit(1);
}

const target = remote ? "REMOTE" : "local";
const mode = authOnly ? "auth-only" : "demo-metadata";
console.log(`SEED_PASS target=${target} mode=${mode} tenant=${tenant}${authOnly ? "" : ' doctype="Field Visit"'}${withUser ? ` user=${user} password=${password}` : " (metadata only, no account)"}`);
if (!remote) {
  console.log("next: npx wrangler dev --config apps/tenant-worker/wrangler.jsonc --port 8799 --local");
  console.log("then: npm run smoke:http");
}
