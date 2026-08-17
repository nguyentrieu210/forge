#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  APPROVED_PURCHASE_SUPPLIERS,
  extractRealPurchaseRows,
  PURCHASE_SOURCE,
} from "./lib/alumdoor-real-purchase-source.mjs";

const clean = (value) => String(value ?? "").normalize("NFC").trim();
const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";
if (!adminUser || !adminPassword) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");
const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) throw new Error(`refusing non-local origin: ${parsedOrigin.hostname}`);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const outputPath = resolve(process.argv[2] || resolve(repoRoot, "local-imports", "alumdoor-real-purchase-local-audit.json"));
const rows = extractRealPurchaseRows(await readFile(resolve(repoRoot, PURCHASE_SOURCE), "utf8"));

const cookies = new Map();
let csrfToken = "";
function rememberCookies(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return;
  for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}
function cookieHeader() { return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; "); }
async function request(urlPath, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (cookieHeader()) headers.set("cookie", cookieHeader());
  if (csrfToken && options.method && options.method !== "GET") headers.set("x-frappe-csrf-token", csrfToken);
  if (options.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${origin}${urlPath}`, {
    ...options,
    headers,
    body: options.body === undefined || typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    redirect: "manual",
  });
  rememberCookies(response);
  csrfToken = response.headers.get("x-frappe-csrf-token") ?? csrfToken;
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}
async function requireOk(urlPath, options = {}) {
  const result = await request(urlPath, options);
  if (!result.response.ok) throw new Error(`${options.method ?? "GET"} ${urlPath} failed (${result.response.status}): ${result.text}`);
  return result.body;
}
async function login() {
  await requireOk("/api/method/login", { method: "POST", body: { usr: adminUser, pwd: adminPassword } });
  const boot = await requireOk("/api/method/metaforge.api.get_boot");
  const message = boot && typeof boot === "object" && "message" in boot ? boot.message : boot;
  csrfToken = message?.csrf_token ?? csrfToken;
}
async function listNames(doctype, limit = 500) {
  const query = new URLSearchParams({ fields: JSON.stringify(["name"]), limit_page_length: String(limit) });
  const body = await requireOk(`/api/resource/${encodeURIComponent(doctype)}?${query}`);
  return (body?.data ?? body?.message ?? []).map((row) => clean(row.name)).filter(Boolean);
}
async function getDoc(doctype, name) {
  const result = await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) throw new Error(`GET ${doctype} ${name} failed (${result.response.status}): ${result.text}`);
  return result.body?.data ?? result.body?.message ?? result.body;
}

await login();
const companies = [];
for (const name of await listNames("Company", 50)) {
  const doc = await getDoc("Company", name);
  if (doc) companies.push({ name: clean(doc.name), default_currency: clean(doc.default_currency), disabled: doc.disabled });
}
const warehouses = [];
for (const name of await listNames("Warehouse", 200)) {
  const doc = await getDoc("Warehouse", name);
  if (doc) warehouses.push({ name: clean(doc.name), company: clean(doc.company), is_group: doc.is_group, disabled: doc.disabled });
}

const allSuppliers = [];
for (const name of await listNames("Supplier", 500)) {
  const doc = await getDoc("Supplier", name);
  if (doc) allSuppliers.push({ name: clean(doc.name), supplier_name: clean(doc.supplier_name), disabled: doc.disabled });
}
const suppliers = Object.keys(APPROVED_PURCHASE_SUPPLIERS).map((sourceSupplier) => ({
  source_supplier: sourceSupplier,
  matches: allSuppliers.filter((doc) => doc.supplier_name === sourceSupplier || doc.name === sourceSupplier),
}));

const sourceCodes = [...new Set(rows.filter((row) => !row.excluded).map((row) => clean(row.canonical_item_code)).filter(Boolean))];
const items = [];
for (const itemCode of sourceCodes) {
  const doc = await getDoc("Item", itemCode);
  items.push({ item_code: itemCode, exists: Boolean(doc), doc: doc ? {
    name: clean(doc.name),
    item_code: clean(doc.item_code),
    item_name: clean(doc.item_name),
    stock_uom: clean(doc.stock_uom),
    default_purchase_uom: clean(doc.default_purchase_uom),
    purchase_uom: clean(doc.purchase_uom),
    inventory_mode: clean(doc.inventory_mode),
    disabled: doc.disabled,
    is_purchase_item: doc.is_purchase_item,
    uom_conversions: Array.isArray(doc.uom_conversions) ? doc.uom_conversions.map((entry) => ({ uom: clean(entry?.uom), conversion_factor: Number(entry?.conversion_factor) })) : [],
  } : null });
}

const report = { format: "alumdoor-real-purchase-local-audit/v2", origin, purchase_rows: rows.length, companies, warehouses, suppliers, items };
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`ALUMDOOR_REAL_PURCHASE_LOCAL_AUDIT ${JSON.stringify({
  companies,
  warehouses,
  suppliers: suppliers.map((row) => ({ source_supplier: row.source_supplier, match_count: row.matches.length, matches: row.matches })),
  items: items.map((row) => ({ item_code: row.item_code, exists: row.exists, stock_uom: row.doc?.stock_uom, purchase_uom: row.doc?.default_purchase_uom || row.doc?.purchase_uom, inventory_mode: row.doc?.inventory_mode, is_purchase_item: row.doc?.is_purchase_item, disabled: row.doc?.disabled, conversions: row.doc?.uom_conversions })),
  output: outputPath,
})}`);
console.log("ALUMDOOR_REAL_PURCHASE_LOCAL_AUDIT_PASS");
