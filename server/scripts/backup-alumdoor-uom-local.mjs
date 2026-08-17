#!/usr/bin/env node
/** Save an authenticated local-only pre-image of the canonical Alumdoor UOM records. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { ALUMDOOR_UOM_CATALOG } from "./lib/alumdoor-uom-catalog.mjs";

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";
const output = process.argv[2] || "";

if (ALUMDOOR_UOM_CATALOG.length !== 19 || !ALUMDOOR_UOM_CATALOG.some(({ name }) => name === "Thùng")) {
  throw new Error(`Canonical Alumdoor UOM catalog mismatch: count=${ALUMDOOR_UOM_CATALOG.length}`);
}
console.log("ALUMDOOR_UOM_CATALOG_19_PASS");

if (!adminUser || !adminPassword) {
  console.error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");
  process.exit(2);
}
if (!output) {
  console.error("Usage: node backup-alumdoor-uom-local.mjs <output.json>");
  process.exit(2);
}
const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) {
  console.error(`refusing: UOM backup is local-only, got ${parsedOrigin.hostname}`);
  process.exit(2);
}

const cookies = new Map();
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
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}

const login = await request("/api/method/login", {
  method: "POST",
  body: { usr: adminUser, pwd: adminPassword },
});
if (!login.response.ok) {
  throw new Error(`local login failed (${login.response.status}): ${login.text}`);
}

const records = [];
for (const { name } of ALUMDOOR_UOM_CATALOG) {
  const result = await request(`/api/resource/UOM/${encodeURIComponent(name)}`);
  if (result.response.status === 404) {
    records.push({ name, existed: false, doc: null });
    continue;
  }
  if (!result.response.ok) {
    throw new Error(`GET UOM ${name} failed (${result.response.status}): ${result.text}`);
  }
  const doc = result.body?.data ?? result.body?.message ?? result.body;
  records.push({ name, existed: true, doc });
}

mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
const payload = {
  format: "alumdoor-uom-local-preimage/v1",
  created_at: new Date().toISOString(),
  origin,
  canonical_count: ALUMDOOR_UOM_CATALOG.length,
  existing_count: records.filter((row) => row.existed).length,
  records,
};
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`ALUMDOOR_UOM_PREIMAGE_PASS existing=${payload.existing_count} canonical=${payload.canonical_count} output=${path.resolve(output)}`);
