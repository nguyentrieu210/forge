#!/usr/bin/env node
/**
 * Creates the minimum Purchase master data used by authenticated browser QA.
 *
 * This script deliberately talks to the local tenant through the public Frappe
 * cookie/CSRF surface instead of writing D1 directly. That keeps the QA fixture
 * behind the same metadata, permission and validation gates as a human-created
 * Supplier or Item.
 *
 * It refuses non-loopback origins so deterministic QA records cannot be seeded into
 * a real tenant by reusing a CI command.
 */
import process from "node:process";

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8801").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";

if (!adminUser || !adminPassword) {
  console.error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD (or FORGE_AUTH_USER/FORGE_AUTH_PASSWORD) are required");
  process.exit(2);
}

const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) {
  console.error(`refusing: Purchase QA seed is local-only, got ${parsedOrigin.hostname}`);
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
  if (csrfToken && options.method && options.method !== "GET") {
    headers.set("x-frappe-csrf-token", csrfToken);
  }
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

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

async function ensureResource(doctype, name, document) {
  const encodedType = encodeURIComponent(doctype);
  const encodedName = encodeURIComponent(name);
  const existing = await request(`/api/resource/${encodedType}/${encodedName}`);
  if (existing.response.ok) return existing.body;
  if (existing.response.status !== 404) {
    throw new Error(`GET ${doctype} ${name} failed (${existing.response.status}): ${existing.text}`);
  }
  return requireOk(`/api/resource/${encodedType}`, {
    method: "POST",
    body: { doctype, ...document },
  });
}

await login();

await ensureResource("Supplier", "QA-SUPPLIER", {
  supplier_name: "QA-SUPPLIER",
  supplier_group: "Khác",
  payment_terms: "Trả ngay",
  receipt_tolerance_pct: 0,
  disabled: 0,
  note: "Local authenticated Purchase lifecycle QA only",
});

await ensureResource("Supplier", "TIEN-DAT", {
  supplier_name: "Tiến Đạt",
  supplier_group: "Khác",
  payment_terms: "Trả ngay",
  disabled: 0,
  note: "Local authenticated Tiến Đạt FIFO QA only",
});

// App fixtures are immutable catalogue records and are not exposed as mutable
// `/api/resource` documents in the local topology. Create deterministic QA leaf
// groups through the authenticated resource API so Item link validation exercises
// the same path as a human-created group.
const regularItemGroup = "QA Purchase Items";
const aluminiumItemGroup = "QA Aluminium";

await ensureResource("Item Group", regularItemGroup, {
  item_group_name: regularItemGroup,
  is_group: 0,
});
await ensureResource("Item Group", aluminiumItemGroup, {
  item_group_name: aluminiumItemGroup,
  is_group: 0,
});

await ensureResource("Item", "QA-PURCHASE-ITEM", {
  item_code: "QA-PURCHASE-ITEM",
  item_name: "QA Purchase Item",
  item_group: regularItemGroup,
  item_nature: "Hàng tồn kho",
  material_stage: "Hàng hoá",
  supply_type: "Mua ngoài",
  is_stock_item: 1,
  is_purchase_item: 1,
  is_sales_item: 0,
  include_item_in_manufacturing: 0,
  measurement_profile: "Hàng thường",
  inventory_mode: "Hàng thường",
  stock_uom: "Cái",
  default_purchase_uom: "Cái",
  default_sales_uom: "Cái",
  default_warehouse: "K36",
  inventory_account: "Hàng tồn kho",
  expense_account: "Hàng tồn kho",
  valuation_method: "FIFO",
  has_catch_weight: 0,
  allow_negative_stock: 0,
  disabled: 0,
  description: "Deterministic local fixture for authenticated Purchase QA",
});

await ensureResource("Item", "AL71-QA", {
  item_code: "AL71-QA",
  item_name: "Nhôm AL71 QA",
  item_group: aluminiumItemGroup,
  item_nature: "Nguyên vật liệu",
  material_stage: "Nguyên vật liệu",
  supply_type: "Mua ngoài",
  is_stock_item: 1,
  is_purchase_item: 1,
  is_sales_item: 0,
  include_item_in_manufacturing: 1,
  measurement_profile: "Nhôm cây/lá",
  inventory_mode: "Nhôm cây/lá",
  stock_uom: "Kg",
  default_purchase_uom: "Kg",
  default_sales_uom: "Kg",
  default_warehouse: "K36",
  inventory_account: "Hàng tồn kho",
  expense_account: "Hàng tồn kho",
  valuation_method: "FIFO",
  has_catch_weight: 1,
  allow_negative_stock: 0,
  disabled: 0,
  description: "Deterministic local fixture for Tiến Đạt FIFO QA",
});

console.log(`PURCHASE_QA_SEED_PASS suppliers=QA-SUPPLIER,TIEN-DAT items=QA-PURCHASE-ITEM,AL71-QA regular_item_group=${JSON.stringify(regularItemGroup)} aluminium_item_group=${JSON.stringify(aluminiumItemGroup)} origin=loopback`);
