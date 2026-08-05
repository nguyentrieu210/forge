#!/usr/bin/env node
/**
 * Generic synthetic demo-data seeder.
 *
 * Writes ONLY through the public Frappe facade, so server permissions, validation,
 * naming, OCC/idempotency and the Document Kernel remain authoritative. No D1/SQL
 * business write exists in this script.
 *
 *   FORGE_ADMIN_PASSWORD=… node scripts/seed-demo-data.mjs demo-seeds/marketplace-demo.json \
 *     --origin https://thuy.kairo.vn --admin admin
 *   node scripts/seed-demo-data.mjs demo-seeds/marketplace-demo.json --dry-run
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fail } from "./wrangler-cli.mjs";
import {
  buildSeedLookup,
  resolveDemoSeedValue,
  seedSummary,
  validateDemoSeedManifest,
} from "./lib/demo-seed.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const manifestPath = args.find((value, index) => !value.startsWith("--") && !args[index - 1]?.startsWith("--"));
const origin = (argOf("origin", process.env.FORGE_ORIGIN) ?? "").replace(/\/$/, "");
const admin = argOf("admin", process.env.FORGE_ADMIN_USER);
const password = process.env.FORGE_ADMIN_PASSWORD;
const dryRun = args.includes("--dry-run");

if (!manifestPath) fail("usage: node scripts/seed-demo-data.mjs <seed.json> [--origin https://…] [--admin user] [--dry-run]");

let manifest;
try {
  manifest = validateDemoSeedManifest(JSON.parse(await readFile(path.resolve(manifestPath), "utf8")));
} catch (error) {
  fail(`DEMO_SEED_INVALID ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const summary = seedSummary(manifest);
console.log(`seed     ${summary.app}/${summary.profile}`);
console.log(`records  ${summary.records}`);
for (const [doctype, count] of Object.entries(summary.doctypes)) console.log(`  ${String(count).padStart(3)}  ${doctype}`);

if (dryRun) {
  // Resolve date macros against a fixed anchor so malformed macros/references surface in CI.
  const names = new Map();
  const fixed = new Date("2026-08-05T00:00:00.000Z");
  for (const record of manifest.records) {
    // References only point backwards by validation. A deterministic placeholder proves
    // recursive resolution without pretending to know the server's eventual series name.
    resolveDemoSeedValue(record.data, { names, now: fixed });
    names.set(record.id, `DRY-${record.id}`);
  }
  console.log(`\nDEMO_SEED_DRY_RUN_PASS ${summary.records} records`);
  process.exit(0);
}

if (!/^https:\/\//.test(origin)) fail("--origin <https://…> is required for live seeding");
if (!admin) fail("--admin <user> is required for live seeding");
if (!password) fail("FORGE_ADMIN_PASSWORD is required in the environment");

const jar = new Map();
let csrf = "";
function storeCookies(response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  // Node versions/runtimes without getSetCookie still expose the common one-cookie login.
  const fallback = response.headers.get("set-cookie");
  if (fallback && !jar.size) {
    const pair = fallback.split(";")[0];
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}
const cookieHeader = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...(csrf && init.method && init.method !== "GET" ? { "x-frappe-csrf-token": csrf } : {}),
    },
  });
  storeCookies(response);
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!response.ok) {
    const detail = json?.message ?? json?.exception ?? text.slice(0, 500);
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return json;
}

async function login() {
  await request(`${origin}/api/method/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usr: admin, pwd: password }),
  });
  if (!jar.size || !csrf) throw new Error("login succeeded without a session cookie/CSRF token");
}

async function lookup(record) {
  const input = buildSeedLookup(record);
  const url = new URL(`${origin}/api/method/frappe.client.get_list`);
  for (const [key, value] of Object.entries(input)) {
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const json = await request(url.toString(), { method: "GET" });
  const rows = json?.message ?? [];
  if (!Array.isArray(rows)) throw new Error(`${record.id}: get_list returned a non-array result`);
  if (rows.length > 1) throw new Error(`${record.id}: seed key is not unique (${rows.length} matches)`);
  return rows[0]?.name ? String(rows[0].name) : null;
}

async function create(record, data) {
  const json = await request(`${origin}/api/resource/${encodeURIComponent(record.doctype)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const name = json?.data?.name;
  if (!name) throw new Error(`${record.id}: create returned no document name`);
  return String(name);
}

console.log(`\norigin   ${origin}`);
console.log(`admin    ${admin}`);
process.stdout.write("login    … ");
try { await login(); } catch (error) { console.log("FAILED"); fail(error.message); }
console.log("ok");

const names = new Map();
const anchor = new Date();
let created = 0;
let reused = 0;
for (const record of manifest.records) {
  try {
    const existing = await lookup(record);
    if (existing) {
      names.set(record.id, existing);
      reused += 1;
      console.log(`reuse    ${record.id.padEnd(24)} ${record.doctype} ${existing}`);
      continue;
    }

    const resolved = resolveDemoSeedValue(record.data, { names, now: anchor });
    const data = { ...resolved };
    if (Object.prototype.hasOwnProperty.call(data, record.key.field) && data[record.key.field] !== record.key.value) {
      throw new Error(`${record.id}: data.${record.key.field} disagrees with seed key`);
    }
    data[record.key.field] = record.key.value;
    const name = await create(record, data);
    const verified = await lookup(record);
    if (!verified || verified !== name) throw new Error(`${record.id}: created ${name} but seed-key readback returned ${verified ?? "nothing"}`);
    names.set(record.id, name);
    created += 1;
    console.log(`create   ${record.id.padEnd(24)} ${record.doctype} ${name}`);
  } catch (error) {
    fail(`DEMO_SEED_FAILED ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nDEMO_SEED_PASS created=${created} reused=${reused} total=${manifest.records.length}`);
