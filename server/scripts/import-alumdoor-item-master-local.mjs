#!/usr/bin/env node
/**
 * Import a validated Alumdoor Item master payload through the LOCAL Forge API only.
 *
 * Safety model:
 * - local loopback origins only
 * - validates every payload before login/mutation
 * - reads every existing Item first
 * - any same-code master mismatch blocks the whole run before the first POST
 * - exact matches are skipped, missing Items are created
 * - authenticated pre-image is written before mutation
 * - every Item is re-read and compared after mutation
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { assertCanonicalItemPayload } from "./lib/alumdoor-item-import-policy.mjs";
import { assertLocalMutationChildContext } from "../../scripts/local-runner/assert-local-mutation-child-context.mjs";

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate-only");
const positional = args.filter((arg) => arg !== "--validate-only");
const [payloadArg, preimageArg] = positional;
if (!payloadArg || (!validateOnly && !preimageArg)) {
  console.error("Usage: node import-alumdoor-item-master-local.mjs <payload.json> <preimage.json> [--validate-only]");
  process.exit(2);
}

const payloadPath = path.resolve(payloadArg);
const payloadFile = JSON.parse(readFileSync(payloadPath, "utf8"));
if (payloadFile?.format !== "alumdoor-item-master-payload/v2" || !Array.isArray(payloadFile.items)) {
  throw new Error("Expected alumdoor-item-master-payload/v2 with items array");
}

const CHECK_FIELDS = new Set([
  "is_stock_item",
  "is_purchase_item",
  "is_sales_item",
  "is_fixed_asset",
  "include_item_in_manufacturing",
  "is_sub_contracted_item",
  "disabled",
]);
const MANAGED_SCALARS = [
  "item_code",
  "item_name",
  "item_group",
  "item_nature",
  "material_stage",
  "supply_type",
  "is_stock_item",
  "is_purchase_item",
  "is_sales_item",
  "is_fixed_asset",
  "include_item_in_manufacturing",
  "is_sub_contracted_item",
  "stock_uom",
  "default_purchase_uom",
  "default_sales_uom",
  "measurement_profile",
  "disabled",
];

// Historical canonical payloads retain two retired flags and one current hidden
// server-owned flag. Do not send those through /api/resource: the first two are
// not in the installed schema and is_stock_item is deliberately server-controlled
// by the current metadata contract. All canonical source rows in this importer are
// inventory Items, so the server default (true) is the intended value and is still
// checked again during post-import verification.
const API_OMIT_FIELDS = new Set(["is_fixed_asset", "is_sub_contracted_item", "is_stock_item"]);
function apiItem(item) {
  return Object.fromEntries(Object.entries(item)
    .filter(([field]) => !API_OMIT_FIELDS.has(field))
    .map(([field, value]) => [field, CHECK_FIELDS.has(field) ? Boolean(Number(value) || value === true) : value]));
}

function normalizeScalar(field, value) {
  if (CHECK_FIELDS.has(field)) return Number(Boolean(Number(value) || value === true));
  return String(value ?? "").trim();
}
function normalizeConversions(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      uom: String(row?.uom ?? "").trim(),
      conversion_factor: Number(row?.conversion_factor),
    }))
    .filter((row) => row.uom && Number.isFinite(row.conversion_factor) && row.conversion_factor > 0)
    .sort((a, b) => a.uom.localeCompare(b.uom, "vi"));
}
function managedSnapshot(doc) {
  const out = {};
  for (const field of MANAGED_SCALARS) out[field] = normalizeScalar(field, doc?.[field]);
  out.uom_conversions = normalizeConversions(doc?.uom_conversions);
  return out;
}
function diffManaged(expectedDoc, actualDoc) {
  const expected = managedSnapshot(expectedDoc);
  const actual = managedSnapshot(actualDoc);
  const diffs = [];
  for (const field of MANAGED_SCALARS) {
    if (expected[field] !== actual[field]) {
      diffs.push({ field, expected: expected[field], actual: actual[field] });
    }
  }
  if (JSON.stringify(expected.uom_conversions) !== JSON.stringify(actual.uom_conversions)) {
    diffs.push({
      field: "uom_conversions",
      expected: expected.uom_conversions,
      actual: actual.uom_conversions,
    });
  }
  return diffs;
}

const items = payloadFile.items;
const codes = [];
for (const item of items) {
  assertCanonicalItemPayload(item);
  const code = String(item.item_code ?? "").trim();
  if (!code) throw new Error("Canonical Item payload contains blank item_code");
  codes.push(code);
}
if (new Set(codes).size !== codes.length) {
  throw new Error(`Duplicate item_code in payload: count=${codes.length} unique=${new Set(codes).size}`);
}
if (Number(payloadFile.item_count) !== items.length) {
  throw new Error(`Payload item_count mismatch: declared=${payloadFile.item_count} actual=${items.length}`);
}
console.log(`ALUMDOOR_ITEM_LOCAL_IMPORT_PAYLOAD_VALID items=${items.length}`);
if (validateOnly) {
  console.log("ALUMDOOR_ITEM_LOCAL_IMPORT_VALIDATE_ONLY_PASS");
  process.exit(0);
}

assertLocalMutationChildContext(["item-master", "real-purchase"]);

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";
if (!adminUser || !adminPassword) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");
const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) {
  throw new Error(`refusing: Item import is local-only, got ${parsedOrigin.hostname}`);
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
    body: options.body === undefined || typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body),
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
  if (!result.response.ok) {
    throw new Error(`${options.method ?? "GET"} ${urlPath} failed (${result.response.status}): ${result.text}`);
  }
  return result.body;
}
async function login() {
  await requireOk("/api/method/login", {
    method: "POST",
    body: { usr: adminUser, pwd: adminPassword },
  });
  const boot = await requireOk("/api/method/metaforge.api.get_boot");
  const message = boot && typeof boot === "object" && "message" in boot ? boot.message : boot;
  csrfToken = message?.csrf_token ?? csrfToken;
  if (!csrfToken) throw new Error("login succeeded but boot returned no CSRF token");
}
async function getItem(code) {
  const result = await request(`/api/resource/Item/${encodeURIComponent(code)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) {
    throw new Error(`GET Item ${code} failed (${result.response.status}): ${result.text}`);
  }
  return result.body?.data ?? result.body?.message ?? result.body;
}

await login();

// Phase 1: inspect every code and detect conflicts before any mutation.
const preimageRecords = [];
const missing = [];
const exactExisting = [];
const conflicts = [];
for (const item of items) {
  const existing = await getItem(item.item_code);
  preimageRecords.push({
    item_code: item.item_code,
    existed: Boolean(existing),
    doc: existing,
  });
  if (!existing) {
    missing.push(item);
    continue;
  }
  const diffs = diffManaged(item, existing);
  if (diffs.length > 0) conflicts.push({ item_code: item.item_code, diffs });
  else exactExisting.push(item.item_code);
}
if (conflicts.length > 0) {
  console.error(JSON.stringify({ conflict_count: conflicts.length, conflicts }, null, 2));
  throw new Error(`ALUMDOOR_ITEM_LOCAL_IMPORT_CONFLICT conflicts=${conflicts.length}; no Item was created`);
}

const preimagePath = path.resolve(preimageArg);
mkdirSync(path.dirname(preimagePath), { recursive: true });
writeFileSync(preimagePath, `${JSON.stringify({
  format: "alumdoor-item-local-preimage/v1",
  created_at: new Date().toISOString(),
  origin,
  payload: payloadPath,
  item_count: items.length,
  existing_count: exactExisting.length,
  missing_count: missing.length,
  records: preimageRecords,
}, null, 2)}\n`, "utf8");
console.log(`ALUMDOOR_ITEM_LOCAL_PREIMAGE_PASS existing=${exactExisting.length} missing=${missing.length} output=${preimagePath}`);

// Phase 2: create only the missing exact-code Items.
const created = [];
for (const item of missing) {
  await requireOk("/api/resource/Item", { method: "POST", body: apiItem(item) });
  created.push(item.item_code);
}

// Phase 3: verify every managed field and conversion after the mutation.
const verificationFailures = [];
for (const item of items) {
  const actual = await getItem(item.item_code);
  if (!actual) {
    verificationFailures.push({ item_code: item.item_code, reason: "missing_after_import" });
    continue;
  }
  const diffs = diffManaged(item, actual);
  if (diffs.length > 0) verificationFailures.push({ item_code: item.item_code, diffs });
}
if (verificationFailures.length > 0) {
  console.error(JSON.stringify({ verification_failures: verificationFailures }, null, 2));
  throw new Error(`ALUMDOOR_ITEM_LOCAL_IMPORT_VERIFY_FAILED count=${verificationFailures.length}`);
}

console.log(
  `ALUMDOOR_ITEM_LOCAL_IMPORT_PASS created=${created.length} existing=${exactExisting.length} total=${items.length}`,
);
