#!/usr/bin/env node
/**
 * Read-only Golden Order verifier for an existing Alumdoor Sales Order.
 *
 * It authenticates through the same cookie path as the browser, then only performs:
 * - GET /api/resource/... reads;
 * - POST /api/method/frappe.desk.query_report.run for read-only ledger reports.
 *
 * It never creates, updates, submits, cancels or deletes a document.
 *
 * Example:
 *   FORGE_ADMIN_PASSWORD=... node scripts/verify-alumdoor-golden-order-readonly.mjs \
 *     --origin https://alu.kairo.vn --sales-order SO-0001 --require-warranty
 */
import process from "node:process";
import { evaluateGoldenOrderEvidence } from "./lib/alumdoor-golden-order-readonly.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const ORIGIN = String(argOf("origin", process.env.FORGE_ORIGIN) ?? "").replace(/\/$/, "");
const SALES_ORDER = String(argOf("sales-order", "") ?? "").trim();
const USER = String(argOf("admin", process.env.FORGE_ADMIN_USER ?? "admin"));
const PASSWORD = process.env.FORGE_ADMIN_PASSWORD;
const REQUIRE_WARRANTY = hasFlag("require-warranty");
const PAGE_SIZE = 200;
const MAX_ROWS = 5_000;

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

if (!ORIGIN) fail("--origin is required");
if (!SALES_ORDER) fail("--sales-order is required");
if (!PASSWORD) fail("FORGE_ADMIN_PASSWORD is required");

let cookie = "";
let csrf = "";
async function raw(method, path, payload) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-frappe-csrf-token": csrf } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const jar = new Map(cookie
    ? cookie.split("; ").map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)])
    : []);
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
  return response;
}

async function call(method, path, payload) {
  const response = await raw(method, path, payload);
  const bodyText = await response.text();
  let body;
  try { body = JSON.parse(bodyText); }
  catch { body = { _text: bodyText.slice(0, 300) }; }
  if (!response.ok) throw new Error(body?.message ?? `HTTP ${response.status} ${path}`);
  if (Object.hasOwn(body ?? {}, "message")) return body.message;
  if (Object.hasOwn(body ?? {}, "data")) return body.data;
  return body;
}

async function readDoc(doctype, name) {
  return call("GET", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
}

async function listDocs(doctype, fields, filters = []) {
  const output = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE_SIZE) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_start: String(start),
      limit_page_length: String(PAGE_SIZE),
      order_by: "name asc",
    });
    const page = await call("GET", `/api/resource/${encodeURIComponent(doctype)}?${query}`);
    const rows = Array.isArray(page) ? page : [];
    output.push(...rows);
    if (rows.length < PAGE_SIZE) return output;
  }
  throw new Error(`${doctype} vượt ${MAX_ROWS} dòng; từ chối kết luận từ dữ liệu bị cắt cụt.`);
}

async function fullDocs(doctype, stubs) {
  const output = [];
  for (let index = 0; index < stubs.length; index += 24) {
    const batch = stubs.slice(index, index + 24);
    output.push(...await Promise.all(batch.map((row) => readDoc(doctype, row.name))));
  }
  return output;
}

async function report(reportName, filters) {
  const result = await call("POST", "/api/method/frappe.desk.query_report.run", {
    report_name: reportName,
    ignore_prepared_report: 1,
    filters,
  });
  return Array.isArray(result?.result) ? result.result : [];
}

const login = await raw("POST", "/api/method/login", { usr: USER, pwd: PASSWORD });
if (!login.ok) fail(`login failed (${login.status})`);

try {
  const salesOrder = await readDoc("Sales Order", SALES_ORDER);
  const customer = String(salesOrder.customer ?? "").trim();
  const company = String(salesOrder.company ?? "").trim();
  if (!customer) throw new Error(`Sales Order ${SALES_ORDER} thiếu customer.`);

  const productionRequestStubs = await listDocs(
    "Production Request",
    ["name", "sales_order", "request_state", "docstatus"],
    [["sales_order", "=", SALES_ORDER]],
  );
  const productionRequests = await fullDocs("Production Request", productionRequestStubs);

  const workOrders = [];
  for (const request of productionRequests) {
    workOrders.push(...await listDocs(
      "Work Order",
      [
        "name",
        "production_request",
        "production_request_line_key",
        "sales_order_row_id",
        "against_sales_order",
        "docstatus",
        "status",
      ],
      [["production_request", "=", request.name]],
    ));
  }

  const deliveryStubs = await listDocs(
    "Delivery Note",
    ["name", "against_sales_order", "customer", "docstatus", "posting_at"],
    [["customer", "=", customer], ["docstatus", "=", 1]],
  );
  const deliveryNotes = await fullDocs("Delivery Note", deliveryStubs);

  const invoiceStubs = await listDocs(
    "Sales Invoice",
    ["name", "against_sales_order", "customer", "docstatus", "posting_at", "grand_total"],
    [["customer", "=", customer], ["docstatus", "=", 1]],
  );
  const invoices = await fullDocs("Sales Invoice", invoiceStubs);

  const paymentStubs = await listDocs(
    "Payment Entry",
    ["name", "party_type", "party", "docstatus", "posting_at"],
    [["party_type", "=", "Customer"], ["party", "=", customer], ["docstatus", "=", 1]],
  );
  const paymentEntries = await fullDocs("Payment Entry", paymentStubs);

  const warrantyStubs = await listDocs(
    "Warranty Claim",
    ["name", "sales_order", "delivery_note", "warranty_status", "docstatus"],
    [["sales_order", "=", SALES_ORDER]],
  );
  const warrantyClaims = await fullDocs("Warranty Claim", warrantyStubs);

  const itemCodes = new Set();
  for (const note of deliveryNotes) {
    for (const item of Array.isArray(note.items) ? note.items : []) {
      if (item?.item_code) itemCodes.add(String(item.item_code));
    }
  }
  if (!itemCodes.size) throw new Error(`Không lấy được item_code từ Delivery Note của khách ${customer}.`);

  const stockLedgerRows = [];
  for (const itemCode of itemCodes) {
    stockLedgerRows.push(...await report("Stock Ledger", {
      item_code: itemCode,
      ...(company ? { company } : {}),
    }));
  }

  const receivableRows = await report("Accounts Receivable", {
    party: customer,
    ...(company ? { company } : {}),
  });

  const evidence = evaluateGoldenOrderEvidence({
    salesOrder,
    productionRequests,
    workOrders,
    deliveryNotes,
    stockLedgerRows,
    invoices,
    paymentEntries,
    receivableRows,
    warrantyClaims,
    requireWarranty: REQUIRE_WARRANTY,
  });

  console.log("PASS  Alumdoor Golden Order read-only authority chain");
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
