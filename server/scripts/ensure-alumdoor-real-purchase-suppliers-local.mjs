#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { extractRealPurchaseRows, PURCHASE_SOURCE } from "./lib/alumdoor-real-purchase-source.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clean = (v) => String(v ?? "").normalize("NFC").trim();
const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const user = process.env.FORGE_ADMIN_USER ?? "";
const password = process.env.FORGE_ADMIN_PASSWORD ?? "";
if (!user || !password) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");
const parsed = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) throw new Error(`refusing non-local origin: ${parsed.hostname}`);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const rows = extractRealPurchaseRows(await readFile(resolve(repoRoot, PURCHASE_SOURCE), "utf8"));
const suppliers = [...new Set(rows.filter((row) => !row.excluded).map((row) => clean(row.supplier)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
const audit = JSON.parse(await readFile(resolve(process.argv[2]), "utf8"));
const fields = audit?.schema?.Supplier?.fields ?? [];

const cookies = new Map();
let csrf = "";
function remember(response) {
  const value = response.headers.get("set-cookie");
  if (!value) return;
  for (const part of value.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(";", 1)[0];
    const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
function cookieHeader() { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (cookieHeader()) headers.set("cookie", cookieHeader());
  if (csrf && options.method && options.method !== "GET") headers.set("x-frappe-csrf-token", csrf);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${origin}${path}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), redirect: "manual" });
  remember(response);
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
  const text = await response.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}
async function ok(path, options = {}) {
  const result = await request(path, options);
  if (!result.response.ok) throw new Error(`${options.method ?? "GET"} ${path} failed (${result.response.status}): ${result.text}`);
  return result.body;
}
async function getSupplier(name) {
  const result = await request(`/api/resource/Supplier/${encodeURIComponent(name)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) throw new Error(`GET Supplier ${name} failed (${result.response.status}): ${result.text}`);
  return result.body?.data ?? result.body?.message ?? result.body;
}
function payload(name) {
  const out = { supplier_name: name, disabled: false };
  for (const field of fields) {
    if (!field?.fieldname || out[field.fieldname] !== undefined) continue;
    if (field.default !== null && field.default !== undefined && clean(field.default)) out[field.fieldname] = field.default;
  }
  return out;
}

await ok("/api/method/login", { method: "POST", body: { usr: user, pwd: password } });
const boot = await ok("/api/method/metaforge.api.get_boot");
const message = boot && typeof boot === "object" && "message" in boot ? boot.message : boot;
csrf = message?.csrf_token ?? csrf;

let created = 0;
let replayed = 0;
for (const name of suppliers) {
  const existing = await getSupplier(name);
  if (existing) {
    if (clean(existing.supplier_name) !== name && clean(existing.name) !== name) throw new Error(`SUPPLIER_CONFLICT ${name}`);
    replayed += 1;
    continue;
  }
  await ok("/api/resource/Supplier", { method: "POST", body: payload(name) });
  const after = await getSupplier(name);
  if (!after || (clean(after.supplier_name) !== name && clean(after.name) !== name)) throw new Error(`SUPPLIER_POSTVERIFY_FAILED ${name}`);
  created += 1;
}
console.log(`ALUMDOOR_REAL_PURCHASE_SUPPLIER_API_PASS total=${suppliers.length} created=${created} replayed=${replayed}`);