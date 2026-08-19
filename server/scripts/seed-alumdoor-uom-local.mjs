#!/usr/bin/env node
/** Seed the canonical Alumdoor UOM catalog on a local Forge tenant. */
import process from "node:process";
import { ALUMDOOR_UOM_CATALOG } from "./lib/alumdoor-uom-catalog.mjs";
import { assertLocalMutationChildContext } from "../../scripts/local-runner/assert-local-mutation-child-context.mjs";

assertLocalMutationChildContext(["uom", "layer0"]);

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";

if (!adminUser || !adminPassword) {
  console.error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");
  process.exit(2);
}

const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) {
  console.error(`refusing: UOM seed is local-only, got ${parsedOrigin.hostname}`);
  process.exit(2);
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

async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);
  if (csrfToken && options.method && options.method !== "GET") headers.set("x-frappe-csrf-token", csrfToken);
  if (options.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${origin}${path}`, {
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

async function requireOk(path, options = {}) {
  const result = await request(path, options);
  if (!result.response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed (${result.response.status}): ${result.text}`);
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

async function ensureUom(name, mustBeWholeNumber) {
  const encodedName = encodeURIComponent(name);
  const existing = await request(`/api/resource/UOM/${encodedName}`);
  if (existing.response.ok) return false;
  if (existing.response.status !== 404) {
    throw new Error(`GET UOM ${name} failed (${existing.response.status}): ${existing.text}`);
  }
  await requireOk("/api/resource/UOM", {
    method: "POST",
    body: {
      doctype: "UOM",
      uom_name: name,
      must_be_whole_number: mustBeWholeNumber ? 1 : 0,
      disabled: 0,
    },
  });
  return true;
}

await login();
const created = [];
const existing = [];
for (const { name, mustBeWholeNumber } of ALUMDOOR_UOM_CATALOG) {
  (await ensureUom(name, mustBeWholeNumber) ? created : existing).push(name);
}

/**
 * Đơn vị ngoài danh mục chuẩn: NGỪNG DÙNG, không xoá.
 *
 * Seed cho tới nay chỉ tạo cái còn thiếu, chưa bao giờ đụng cái thừa — nên `m²` vẫn nằm cạnh
 * `m2`, `Chiếc` cạnh `Cái`. Đó đúng là thứ E07 gọi tên: "tạo CUỐN bên cạnh Cuộn là chẻ tồn
 * kho làm hai vì một lần gõ nhầm". Đo trên D1 local 2026-08-19: `m2` dùng 533 lần và `m²`
 * dùng 0; `Cái` 708 lần và `Chiếc` 0.
 *
 * `disabled` chứ không DELETE, theo BRD §2 "không xoá khi còn tham chiếu — chỉ disabled":
 * `Thùng` đang được đúng một dòng trỏ tới, xoá là để lại tham chiếu treo. Ngừng dùng thì ô
 * chọn không mời nữa mà dòng cũ vẫn đọc được.
 */
const canonicalNames = new Set(ALUMDOOR_UOM_CATALOG.map(({ name }) => name));
const listed = await request("/api/resource/UOM?limit_page_length=500");
const allNames = (listed.body?.data ?? []).map((row) => row?.name).filter(Boolean);
const retired = [];
for (const name of allNames) {
  if (canonicalNames.has(name)) continue;
  const current = await request(`/api/resource/UOM/${encodeURIComponent(name)}`);
  if (!current.response.ok) continue;
  const doc = current.body?.data ?? {};
  if (doc.disabled === 1 || doc.disabled === true) continue;
  await requireOk(`/api/resource/UOM/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: { ...doc, disabled: 1 },
  });
  retired.push(name);
}

console.log(`ALUMDOOR_UOM_SEED_PASS created=${created.length} existing=${existing.length} total=${ALUMDOOR_UOM_CATALOG.length}`);
console.log(`ALUMDOOR_UOM_RETIRED_PASS retired=${retired.length}${retired.length ? ` names=${retired.join(", ")}` : ""}`);
console.log(`UOM=${ALUMDOOR_UOM_CATALOG.map(({ name }) => name).join(", ")}`);
