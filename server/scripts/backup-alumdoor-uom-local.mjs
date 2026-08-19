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

/**
 * Chốt LUẬT của E07, không chốt ảnh chụp.
 *
 * Bản cũ khoá cứng `length === 19` và đòi phải CÓ `Thùng` — tức đóng băng đúng thứ mà
 * `docs/brd-v2/brd-entities/danh-muc-nho.md` §E07 bảo đừng tạo. Một chốt chặn đếm số sẽ đỏ
 * mỗi lần danh mục thay đổi hợp lệ, và người sửa chỉ việc nâng con số lên — nó không bảo vệ
 * được gì. Ba luật dưới đây thì có: chúng nêu đúng cái sai mà E07 đã trả giá để phát hiện.
 */
{
  const names = ALUMDOOR_UOM_CATALOG.map(({ name }) => name);
  const problems = [];

  // E07: "LÁ là đơn vị tự nhiên của lá cửa — thiếu nó là thiếu đơn vị của mặt hàng chính".
  for (const required of ["Lá", "Thân"]) {
    if (!names.includes(required)) problems.push(`thiếu đơn vị bắt buộc "${required}"`);
  }

  // E07: "mỗi thứ dùng đúng 1 lần — nhiều khả năng là quy cách đóng gói của một lần mua lẻ".
  for (const forbidden of ["Thùng", "Băng", "Bảng", "Vỉ"]) {
    if (names.some((name) => name.toLocaleUpperCase("vi") === forbidden.toLocaleUpperCase("vi"))) {
      problems.push(`đơn vị "${forbidden}" đã bị E07 loại, không được seed lại`);
    }
  }

  // E07: "tạo CUỐN bên cạnh Cuộn là chẻ tồn kho làm hai vì một lần gõ nhầm".
  const synonyms = [["m2", "m²"], ["Cái", "Chiếc"], ["Mét", "M"], ["Cuộn", "Cuốn"], ["Tấm", "Tâm"]];
  for (const pair of synonyms) {
    const present = pair.filter((candidate) => names.some(
      (name) => name.toLocaleUpperCase("vi") === candidate.toLocaleUpperCase("vi"),
    ));
    if (present.length > 1) problems.push(`hai tên cho cùng một đơn vị: ${present.join(" / ")}`);
  }

  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length) problems.push(`trùng tên: ${[...new Set(duplicates)].join(", ")}`);

  if (problems.length) {
    throw new Error(`Danh mục đơn vị tính vi phạm E07:\n  - ${problems.join("\n  - ")}`);
  }
  console.log(`ALUMDOOR_UOM_CATALOG_PASS count=${names.length}`);
}

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
