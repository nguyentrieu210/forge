#!/usr/bin/env node
/**
 * Local/disposable operator-E2E prerequisites.
 *
 * This script deliberately writes ONLY through the public Frappe facade with a real
 * cookie + CSRF session. It refuses non-loopback targets so a CI/test command cannot
 * silently become a production data loader.
 */
import process from "node:process";

const ORIGIN = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8801").replace(/\/$/, "");
const USER = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER;
const PASSWORD = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD;
if (!USER || !PASSWORD) throw new Error("FORGE_ADMIN_USER/FORGE_AUTH_USER and password are required");
const target = new URL(ORIGIN);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error(`OPERATOR_E2E_LOCAL_ONLY refused target ${target.hostname}`);
}

let cookie = "";
let csrf = "";
function collectCookies(response) {
  const jar = new Map(cookie ? cookie.split("; ").filter(Boolean).map((part) => {
    const at = part.indexOf("=");
    return [part.slice(0, at), part.slice(at + 1)];
  }) : []);
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const pair = line.split(";", 1)[0];
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
}

async function raw(method, path, body) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-frappe-csrf-token": csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  collectCookies(response);
  return response;
}

async function json(method, path, body, accepted = [200, 201]) {
  const response = await raw(method, path, body);
  const text = await response.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!accepted.includes(response.status)) {
    throw new Error(`${method} ${path} -> ${response.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }
  return parsed;
}

const login = await raw("POST", "/api/method/login", { usr: USER, pwd: PASSWORD });
if (!login.ok) throw new Error(`operator E2E login failed: HTTP ${login.status}`);
const boot = await json("GET", "/api/method/metaforge.api.get_boot");
csrf = boot?.message?.csrf_token ?? csrf;
if (!csrf) throw new Error("operator E2E login did not yield CSRF token");

async function getResource(doctype, name) {
  const response = await raw("GET", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${doctype}/${name} -> ${response.status}: ${text}`);
  return JSON.parse(text)?.data ?? null;
}

async function ensureResource(doctype, name, document) {
  const existing = await getResource(doctype, name);
  if (existing) return { state: "existing", doc: existing };
  const created = await json("POST", `/api/resource/${encodeURIComponent(doctype)}`, { doctype, name, ...document });
  return { state: "created", doc: created?.data ?? created?.message ?? created };
}

async function findOne(doctype, filters) {
  const params = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify(filters),
    limit_page_length: "1",
  });
  const result = await json("GET", `/api/resource/${encodeURIComponent(doctype)}?${params}`);
  return result?.data?.[0]?.name ?? null;
}

async function ensureByFilter(doctype, filters, document) {
  const name = await findOne(doctype, filters);
  if (name) return { state: "existing", name };
  const created = await json("POST", `/api/resource/${encodeURIComponent(doctype)}`, { doctype, ...document });
  return { state: "created", name: created?.data?.name ?? created?.message?.name ?? null };
}

const seeded = [];
async function record(label, promise) {
  const result = await promise;
  seeded.push({ label, state: result.state, name: result.doc?.name ?? result.name ?? label });
  return result;
}

await record("UOM:Cái", ensureResource("UOM", "Cái", { uom_name: "Cái", enabled: 1 }));
await record("UOM:Kg", ensureResource("UOM", "Kg", { uom_name: "Kg", enabled: 1 }));
await record("UOM:m2", ensureResource("UOM", "m2", { uom_name: "m2", enabled: 1 }));
await record("Warehouse:K36", ensureResource("Warehouse", "K36", { warehouse_name: "K36", stock_role: "Kho chính", is_group: 0, disabled: 0 }));
await record("Supplier:QA-SUPPLIER", ensureResource("Supplier", "QA-SUPPLIER", { supplier_name: "QA Supplier", supplier_group: "Nhà cung cấp", disabled: 0 }));
await record("Item Group:QA Purchase Items", ensureResource("Item Group", "QA Purchase Items", { item_group_name: "QA Purchase Items", is_group: 0 }));
await record("Item Group:Cửa CN Đức", ensureResource("Item Group", "Cửa CN Đức", { item_group_name: "Cửa CN Đức", is_group: 0 }));
await record("Item Color:TRANG", ensureResource("Item Color", "TRANG", { color_name: "TRANG", raw_color: "#FFFFFF", disabled: 0 }));
await record("Price List:QA-SELLING", ensureResource("Price List", "QA-SELLING", { price_list_name: "QA-SELLING", selling: 1, buying: 0, currency: "VND", enabled: 1 }));
await record("Customer:QA-CUSTOMER", ensureResource("Customer", "QA-CUSTOMER", {
  customer_name: "QA Customer",
  customer_group: "Lẻ",
  price_group: "Lẻ",
  default_price_list: "QA-SELLING",
  phone: "0900000000",
  install_address: "Operator E2E local fixture",
  disabled: 0,
}));
await record("Item:QA-PURCHASE-ITEM", ensureResource("Item", "QA-PURCHASE-ITEM", {
  item_code: "QA-PURCHASE-ITEM", item_name: "QA Purchase Item", item_group: "QA Purchase Items",
  item_nature: "Hàng tồn kho", material_stage: "Hàng hoá", supply_type: "Mua ngoài",
  is_stock_item: 1, is_purchase_item: 1, is_sales_item: 0, stock_uom: "Cái",
  default_purchase_uom: "Cái", default_sales_uom: "Cái", default_warehouse: "K36",
  inventory_mode: "Hàng thường", measurement_profile: "Hàng thường", valuation_method: "FIFO",
  inventory_account: "Hàng tồn kho", expense_account: "Hàng tồn kho", disabled: 0,
}));
await record("Item:CUA-DUC", ensureResource("Item", "CUA-DUC", {
  item_code: "CUA-DUC", item_name: "Cửa Đức Operator E2E", item_group: "Cửa CN Đức",
  door_type: "Cửa Đức", item_nature: "Hàng tồn kho", material_stage: "Thành phẩm", supply_type: "Sản xuất",
  is_stock_item: 1, is_purchase_item: 0, is_sales_item: 1, include_item_in_manufacturing: 1,
  stock_uom: "m2", default_sales_uom: "m2", inventory_mode: "Thành phẩm theo m2",
  default_color: "TRANG", disabled: 0,
}));
await record("Item:AL71N-RAW", ensureResource("Item", "AL71N-RAW", {
  item_code: "AL71N-RAW", item_name: "Nhôm AL71N Operator E2E", item_group: "QA Purchase Items",
  item_nature: "Hàng tồn kho", material_stage: "Nguyên vật liệu", supply_type: "Mua ngoài",
  is_stock_item: 1, is_purchase_item: 1, is_sales_item: 0, include_item_in_manufacturing: 1,
  stock_uom: "Cái", default_purchase_uom: "Cái", default_warehouse: "K36",
  inventory_mode: "Nhôm cây/lá", measurement_profile: "Nhôm cây", valuation_method: "FIFO", disabled: 0,
}));

await record("Item Price:CUA-DUC@QA-SELLING", ensureByFilter("Item Price", [
  ["item_code", "=", "CUA-DUC"], ["price_list", "=", "QA-SELLING"],
], {
  item_code: "CUA-DUC", price_list: "QA-SELLING", price_list_rate: 1500000,
  rate: 1500000, currency: "VND", selling: 1, uom: "m2", enabled: 1,
}));

// Formula/BOM fixtures are attempted through their canonical DocTypes. If the package version
// has evolved and rejects this shape, the browser preflight reports CONFIG/TEST_DATA instead
// of hiding it with a direct database insert.
try {
  await record("Cutting Policy:POL-DUC-U75", ensureResource("Cutting Policy", "POL-DUC-U75", {
    policy_name: "POL-DUC-U75", door_type: "Cửa Đức", item_group: "Cửa CN Đức", ray_type: "U75",
    height_pb_offset_m: 0.5, dealer_width_basis: "Phủ bì nhựa", retail_width_basis: "Phủ bì ray",
    dealer_cut_deduction_m: 0.02, retail_cut_deduction_m: 0.08, butterfly_cut_deduction_m: 0.08,
    dealer_split_sales_basis: "Rộng cắt lá", dealer_full_sales_basis: "Rộng cắt lá", retail_sales_basis: "Phủ bì ray",
    purchase_formula: "Kg thực tế", priority: 10, disabled: 0, leaf_formula: "Kiểu Đức",
    leaf_height_deduction_m: 0.13, leaf_divisor_source: "Hằng số của chính sách", leaf_divisor_const: 0.055,
    leaf_rounding: "Ngưỡng trừ-một-lá", leaf_round_threshold: 0.6,
  }));
} catch (error) {
  seeded.push({ label: "Cutting Policy:POL-DUC-U75", state: "blocked", error: String(error) });
}

console.log(JSON.stringify({ status: "OPERATOR_E2E_SEED_PASS", origin: ORIGIN, seeded }, null, 2));
