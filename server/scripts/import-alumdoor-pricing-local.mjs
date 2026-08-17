#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { assertLocalMutationChildContext } from "../../scripts/local-runner/assert-local-mutation-child-context.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const expectIdempotent = args.includes("--expect-idempotent");
const positional = args.filter((arg) => arg !== "--apply" && arg !== "--expect-idempotent");
const [payloadArg, preimageArg] = positional;
if (!payloadArg || !preimageArg) {
  console.error("Usage: node import-alumdoor-pricing-local.mjs <payload.json> <preimage.json> [--apply] [--expect-idempotent]");
  process.exit(2);
}

const payloadPath = path.resolve(payloadArg);
const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
if (payload?.format !== "alumdoor-pricing-payload/v1") throw new Error("Expected alumdoor-pricing-payload/v1");
if (!payload.price_list || !Array.isArray(payload.item_prices) || !Array.isArray(payload.pricing_rules)) {
  throw new Error("Pricing payload must contain price_list, item_prices and pricing_rules");
}

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) {
  throw new Error(`refusing: Alumdoor pricing import is local-only, got ${parsedOrigin.hostname}`);
}
if (!["http:", "https:"].includes(parsedOrigin.protocol)) throw new Error(`refusing unsupported origin protocol ${parsedOrigin.protocol}`);

const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";
if (!adminUser || !adminPassword) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");

const NUMERIC_FIELDS = new Set([
  "selling", "buying", "disabled", "rate", "priority", "adjustment_rate", "taxable", "discountable",
]);
const MANAGED_FIELDS = Object.freeze({
  "Price List": ["price_list_name", "currency", "selling", "buying", "disabled"],
  "Item Price": ["price_list", "item_code", "uom", "price_variant", "rate", "currency", "disabled"],
  "Pricing Rule": [
    "disabled", "price_list", "currency", "rule_level", "apply_on", "item_code", "effect_type",
    "adjustment_basis", "adjustment_rate", "priority", "exclusive_group", "conditions", "taxable", "discountable",
  ],
});

const clean = (value) => String(value ?? "").normalize("NFC").trim();
const truthy = (value) => value === true || value === 1 || value === "1";
const isDisabled = (value) => truthy(value) || ["true", "yes", "có", "co"].includes(clean(value).toLocaleLowerCase("vi"));

function normalizedField(field, value) {
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : value;
  }
  if (field === "conditions") {
    if (Array.isArray(value)) return JSON.stringify(value);
    const text = clean(value);
    if (!text) return "";
    try { return JSON.stringify(JSON.parse(text)); } catch { return text; }
  }
  return clean(value);
}
function snapshot(doctype, doc) {
  const out = {};
  for (const field of MANAGED_FIELDS[doctype]) out[field] = normalizedField(field, doc?.[field]);
  return out;
}
function diffs(doctype, expected, actual) {
  const left = snapshot(doctype, expected);
  const right = snapshot(doctype, actual);
  return MANAGED_FIELDS[doctype]
    .filter((field) => left[field] !== right[field])
    .map((field) => ({ field, expected: left[field], actual: right[field] }));
}
function apiDocument(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("_") && key !== "doctype"));
}
function expectedName(row) {
  const name = clean(row?.name);
  if (!name) throw new Error("Managed pricing document has blank name");
  return name;
}
function assertUnique(rows, label) {
  const names = rows.map(expectedName);
  if (new Set(names).size !== names.length) throw new Error(`Duplicate ${label} names in payload`);
}

assertUnique(payload.item_prices, "Item Price");
assertUnique(payload.pricing_rules, "Pricing Rule");
if (clean(payload.price_list.name) !== clean(payload.managed_price_list)) {
  throw new Error("managed_price_list must equal price_list.name");
}
for (const row of payload.item_prices) {
  if (!(Number(row.rate) > 0)) throw new Error(`Item Price ${row.name} must have positive rate`);
  if (clean(row.price_list) !== clean(payload.managed_price_list)) throw new Error(`Item Price ${row.name} has wrong price_list`);
}
for (const row of payload.pricing_rules) {
  if (clean(row.price_list) !== clean(payload.managed_price_list)) throw new Error(`Pricing Rule ${row.name} has wrong price_list`);
  if (clean(row.effect_type) !== "ADJUSTMENT") throw new Error(`Pricing Rule ${row.name} must be ADJUSTMENT`);
  if (!Number.isFinite(Number(row.adjustment_rate)) || Number(row.adjustment_rate) === 0) {
    throw new Error(`Pricing Rule ${row.name} must have non-zero adjustment_rate`);
  }
}

const cookies = new Map();
let csrfToken = "";
function rememberCookies(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return;
  for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}
function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}
async function request(urlPath, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);
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
  if (!csrfToken) throw new Error("login succeeded but boot returned no CSRF token");
}
async function getDoc(doctype, name) {
  const result = await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) throw new Error(`GET ${doctype} ${name} failed (${result.response.status}): ${result.text}`);
  return result.body?.data ?? result.body?.message ?? result.body;
}
async function listAll(doctype) {
  const out = [];
  const pageLength = 100;
  for (let start = 0; ; start += pageLength) {
    const query = new URLSearchParams({
      fields: JSON.stringify(["*"]),
      limit_start: String(start),
      limit_page_length: String(pageLength),
    });
    const body = await requireOk(`/api/resource/${encodeURIComponent(doctype)}?${query}`);
    const rows = body?.data ?? body?.message ?? body ?? [];
    if (!Array.isArray(rows)) throw new Error(`Unexpected ${doctype} list response`);
    if (rows.length === 0) break;
    out.push(...rows);
  }
  return out;
}
async function upsert(doctype, expected, existing) {
  const name = expectedName(expected);
  const document = apiDocument(expected);
  if (!existing) {
    await requireOk(`/api/resource/${encodeURIComponent(doctype)}`, { method: "POST", body: { ...document, name } });
    return "created";
  }
  const delta = diffs(doctype, expected, existing);
  if (delta.length === 0) return "exact";
  await requireOk(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: "PUT", body: document });
  return "updated";
}

await login();

const blockers = [];
const preimage = { price_list: null, item_prices: [], pricing_rules: [], items: [] };
const priceListExisting = await getDoc("Price List", payload.price_list.name);
preimage.price_list = priceListExisting;

const itemCache = new Map();
for (const row of payload.item_prices) {
  const code = clean(row.item_code);
  let item = itemCache.get(code);
  if (item === undefined) {
    item = await getDoc("Item", code);
    itemCache.set(code, item);
    preimage.items.push({ item_code: code, doc: item });
  }
  if (!item) {
    blockers.push({ type: "missing_item", item_code: code, item_price: row.name });
    continue;
  }
  if (!truthy(item.is_sales_item) || isDisabled(item.disabled)) {
    blockers.push({ type: "item_not_sellable", item_code: code, item_price: row.name });
    continue;
  }
  const allowed = new Set([clean(item.stock_uom), clean(item.default_sales_uom)]);
  for (const conversion of Array.isArray(item.uom_conversions) ? item.uom_conversions : []) allowed.add(clean(conversion?.uom));
  if (!allowed.has(clean(row.uom))) blockers.push({ type: "item_price_uom_not_on_item", item_code: code, uom: row.uom, item_price: row.name });
}

const existingItemPrices = await listAll("Item Price");
const existingRules = await listAll("Pricing Rule");
const managedList = clean(payload.managed_price_list);
const expectedPriceNames = new Set(payload.item_prices.map(expectedName));
const expectedRuleNames = new Set(payload.pricing_rules.map(expectedName));
const managedExistingPrices = existingItemPrices.filter((row) => clean(row.price_list) === managedList);
const managedExistingRules = existingRules.filter((row) => clean(row.price_list) === managedList && clean(row.name).startsWith("ALUMDOOR-PR:"));
for (const row of managedExistingPrices) {
  if (!expectedPriceNames.has(clean(row.name))) blockers.push({ type: "extra_managed_item_price", name: row.name });
}
for (const row of managedExistingRules) {
  if (!expectedRuleNames.has(clean(row.name))) blockers.push({ type: "extra_managed_pricing_rule", name: row.name });
}
for (const row of payload.item_prices) preimage.item_prices.push({ name: row.name, doc: await getDoc("Item Price", row.name) });
for (const row of payload.pricing_rules) preimage.pricing_rules.push({ name: row.name, doc: await getDoc("Pricing Rule", row.name) });

const preimagePath = path.resolve(preimageArg);
mkdirSync(path.dirname(preimagePath), { recursive: true });
writeFileSync(preimagePath, `${JSON.stringify({
  format: "alumdoor-pricing-local-preimage/v1",
  captured_at: new Date().toISOString(),
  origin,
  payload: payloadPath,
  managed_price_list: managedList,
  records: preimage,
  blockers,
}, null, 2)}\n`, "utf8");
console.log(`ALUMDOOR_PRICING_PREFLIGHT blocked=${blockers.length} item_prices=${payload.item_prices.length} rules=${payload.pricing_rules.length}`);
console.log(`ALUMDOOR_PRICING_PREIMAGE ${preimagePath}`);
if (blockers.length > 0) {
  console.error(JSON.stringify({ blockers }, null, 2));
  throw new Error(`ALUMDOOR_PRICING_PREFLIGHT_BLOCKED count=${blockers.length}; zero writes performed`);
}
if (!apply) {
  console.log("ALUMDOOR_PRICING_DRY_RUN_PASS writes=0");
  process.exit(0);
}

assertLocalMutationChildContext(["pricing"]);

const result = { created: 0, updated: 0, exact: 0 };
async function applyOne(doctype, expected) {
  const existing = await getDoc(doctype, expectedName(expected));
  const status = await upsert(doctype, expected, existing);
  result[status] += 1;
}
await applyOne("Price List", payload.price_list);
for (const row of payload.item_prices) await applyOne("Item Price", row);
for (const row of payload.pricing_rules) await applyOne("Pricing Rule", row);

const verifyFailures = [];
for (const [doctype, rows] of [
  ["Price List", [payload.price_list]],
  ["Item Price", payload.item_prices],
  ["Pricing Rule", payload.pricing_rules],
]) {
  for (const expected of rows) {
    const actual = await getDoc(doctype, expectedName(expected));
    if (!actual) {
      verifyFailures.push({ doctype, name: expected.name, reason: "missing_after_apply" });
      continue;
    }
    const delta = diffs(doctype, expected, actual);
    if (delta.length > 0) verifyFailures.push({ doctype, name: expected.name, diffs: delta });
  }
}
const finalManagedPrices = (await listAll("Item Price")).filter((row) => clean(row.price_list) === managedList);
const finalManagedRules = (await listAll("Pricing Rule")).filter((row) => clean(row.price_list) === managedList && clean(row.name).startsWith("ALUMDOOR-PR:"));
for (const row of finalManagedPrices) if (!expectedPriceNames.has(clean(row.name))) verifyFailures.push({ doctype: "Item Price", name: row.name, reason: "extra_managed" });
for (const row of finalManagedRules) if (!expectedRuleNames.has(clean(row.name))) verifyFailures.push({ doctype: "Pricing Rule", name: row.name, reason: "extra_managed" });
if (verifyFailures.length > 0) {
  console.error(JSON.stringify({ verify_failures: verifyFailures }, null, 2));
  throw new Error(`ALUMDOOR_PRICING_POST_VERIFY_FAILED count=${verifyFailures.length}`);
}

const mutations = result.created + result.updated;
console.log(`ALUMDOOR_PRICING_IMPORT_PASS created=${result.created} updated=${result.updated} exact=${result.exact} deleted=0 mismatches=0`);
if (expectIdempotent && mutations !== 0) {
  throw new Error(`ALUMDOOR_PRICING_IDEMPOTENCY_FAILED created=${result.created} updated=${result.updated}`);
}
if (expectIdempotent) console.log("ALUMDOOR_PRICING_IDEMPOTENCY_PASS created=0 updated=0 deleted=0 mutation=0 mismatches=0");
