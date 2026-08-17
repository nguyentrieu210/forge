#!/usr/bin/env node
/**
 * Reconcile only the known pre-canonical finished-door Item stock UOM mismatch
 * on the LOCAL Forge runtime: legacy `m2` -> canonical `Bộ`.
 *
 * Safety model:
 * - local loopback origin only
 * - validates the complete canonical Item payload first
 * - reads every canonical Item before any mutation
 * - permits only the exact finished-door stock_uom mismatch classified by
 *   alumdoor-item-stock-uom-reconcile.mjs
 * - any other mismatch blocks the whole run before the first PUT
 * - writes authenticated pre-image before mutation
 * - re-reads each target immediately before PUT and sends its fresh `modified`
 *   timestamp so Forge/Frappe optimistic concurrency remains enforced
 * - PUTs only stock_uom + concurrency metadata, never generic-upserts Item
 * - re-reads every changed Item and requires exact canonical managed fields
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { assertCanonicalItemPayload } from "./lib/alumdoor-item-import-policy.mjs";
import {
  classifyFinishedDoorStockUomReconciliation,
  diffManagedItem,
} from "./lib/alumdoor-item-stock-uom-reconcile.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const positional = args.filter((arg) => arg !== "--dry-run");
const [payloadArg, preimageArg] = positional;
if (!payloadArg || (!dryRun && !preimageArg)) {
  console.error("Usage: node reconcile-alumdoor-item-stock-uom-local.mjs <payload.json> <preimage.json> [--dry-run]");
  process.exit(2);
}

const payloadPath = path.resolve(payloadArg);
const payloadFile = JSON.parse(readFileSync(payloadPath, "utf8"));
if (payloadFile?.format !== "alumdoor-item-master-payload/v2" || !Array.isArray(payloadFile.items)) {
  throw new Error("Expected alumdoor-item-master-payload/v2 with items array");
}
const items = payloadFile.items;
for (const item of items) assertCanonicalItemPayload(item);
if (Number(payloadFile.item_count) !== items.length) {
  throw new Error(`Payload item_count mismatch: declared=${payloadFile.item_count} actual=${items.length}`);
}

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";
if (!adminUser || !adminPassword) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");
const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) {
  throw new Error(`refusing: Item reconciliation is local-only, got ${parsedOrigin.hostname}`);
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

const exact = [];
const missing = [];
const reconcilable = [];
const blocked = [];
for (const item of items) {
  const actual = await getItem(item.item_code);
  const classification = classifyFinishedDoorStockUomReconciliation(item, actual);
  if (classification.status === "exact") exact.push(item.item_code);
  else if (classification.status === "missing") missing.push(item.item_code);
  else if (classification.status === "reconcile_stock_uom") {
    reconcilable.push({ item, actual, classification });
  } else {
    blocked.push({ item_code: item.item_code, diffs: classification.diffs });
  }
}

console.log(
  `ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_SCAN exact=${exact.length} missing=${missing.length} reconcile=${reconcilable.length} blocked=${blocked.length}`,
);
if (blocked.length > 0) {
  console.error(JSON.stringify({ blocked_count: blocked.length, blocked }, null, 2));
  throw new Error(`ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_BLOCKED count=${blocked.length}; no Item was updated`);
}
if (dryRun) {
  console.log(`ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_DRY_RUN_PASS reconcile=${reconcilable.length} missing=${missing.length}`);
  process.exit(0);
}

const preimagePath = path.resolve(preimageArg);
mkdirSync(path.dirname(preimagePath), { recursive: true });
writeFileSync(preimagePath, `${JSON.stringify({
  format: "alumdoor-item-stock-uom-reconcile-preimage/v1",
  created_at: new Date().toISOString(),
  origin,
  payload: payloadPath,
  exact_count: exact.length,
  missing_count: missing.length,
  reconcile_count: reconcilable.length,
  records: reconcilable.map(({ item, actual }) => ({
    item_code: item.item_code,
    expected_stock_uom: item.stock_uom,
    before: actual,
  })),
}, null, 2)}\n`, "utf8");
console.log(`ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_PREIMAGE_PASS output=${preimagePath}`);

const updated = [];
const alreadyExact = [];
for (const { item } of reconcilable) {
  // Re-read immediately before mutation. Besides supplying the optimistic-lock
  // timestamp, this prevents an external change between the full preflight and
  // this PUT from being silently overwritten.
  const fresh = await getItem(item.item_code);
  const freshClassification = classifyFinishedDoorStockUomReconciliation(item, fresh);
  if (freshClassification.status === "exact") {
    alreadyExact.push(item.item_code);
    continue;
  }
  if (freshClassification.status !== "reconcile_stock_uom") {
    throw new Error(
      `ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_CONCURRENT_BLOCK item=${item.item_code} status=${freshClassification.status}`,
    );
  }
  const modified = String(fresh?.modified ?? "").trim();
  if (!modified) {
    throw new Error(`ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_MISSING_MODIFIED item=${item.item_code}`);
  }
  await requireOk(`/api/resource/Item/${encodeURIComponent(item.item_code)}`, {
    method: "PUT",
    body: {
      ...freshClassification.update,
      modified,
    },
  });
  updated.push(item.item_code);
}

const verificationFailures = [];
for (const { item } of reconcilable) {
  const actual = await getItem(item.item_code);
  const diffs = diffManagedItem(item, actual);
  if (diffs.length > 0) verificationFailures.push({ item_code: item.item_code, diffs });
}
if (verificationFailures.length > 0) {
  console.error(JSON.stringify({ verification_failures: verificationFailures }, null, 2));
  throw new Error(`ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_VERIFY_FAILED count=${verificationFailures.length}`);
}

console.log(
  `ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_PASS updated=${updated.length} already_exact=${alreadyExact.length} exact_before=${exact.length} missing=${missing.length}`,
);
