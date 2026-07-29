#!/usr/bin/env node
/**
 * Builds the idempotent SQL migration for Alumdoor's remaining legacy workbooks.
 *
 * Historical orders, intake rows and warranty rows deliberately go to archive/reference
 * doctypes. Replaying already-completed 2026 transactions through Sales Order, Purchase
 * Receipt or Purchase Invoice would duplicate stock, revenue and payables.
 *
 * Usage:
 *   node scripts/build-alumdoor-remaining-import.mjs \
 *     --orders "C:/Users/Admin/Downloads/2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx" \
 *     --stock "C:/Users/Admin/Downloads/TỒN NHÔM 2026 NEW.xlsx" \
 *     --ledger "C:/Users/Admin/Downloads/CTY SÁU HỒNG.xlsx" \
 *     --warehouse K36 \
 *     [--lot-columns-only] \
 *     --sql imports/alumdoor-remaining-2026-07-29.sql \
 *     --audit imports/alumdoor-remaining-2026-07-29.audit.json
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const ORDERS_FILE = argOf("orders");
const STOCK_FILE = argOf("stock");
const LEDGER_FILE = argOf("ledger");
const SQL_FILE = argOf("sql");
const AUDIT_FILE = argOf("audit");
const MAX_PART_BYTES = Number(argOf("max-part-bytes", "80000"));
const LOT_COLUMNS_ONLY = args.includes("--lot-columns-only");
const WAREHOUSE = argOf("warehouse", "K36");
const TENANT = argOf("tenant", "alu");
const IMPORTED_AT = "2026-07-29T00:00:00.000Z";
if (!ORDERS_FILE || !STOCK_FILE || !LEDGER_FILE || !SQL_FILE || !AUDIT_FILE) {
  throw new Error("--orders, --stock, --ledger, --sql and --audit are required");
}
if (!Number.isInteger(MAX_PART_BYTES) || MAX_PART_BYTES < 10_000) {
  throw new Error("--max-part-bytes must be an integer of at least 10000");
}
for (const file of [ORDERS_FILE, STOCK_FILE, LEDGER_FILE]) {
  if (!existsSync(file)) throw new Error(`Source workbook does not exist: ${file}`);
}
if (!/^[a-z][a-z0-9-]*$/.test(TENANT)) throw new Error(`Invalid tenant id: ${TENANT}`);

const xlsxStore = path.resolve(import.meta.dirname, "../../client/node_modules/.pnpm");
const xlsxFile = readdirSync(xlsxStore)
  .filter((name) => name.startsWith("xlsx@"))
  .sort()
  .reverse()
  .map((name) => path.join(xlsxStore, name, "node_modules", "xlsx", "xlsx.mjs"))
  .find(existsSync);
if (!xlsxFile) throw new Error("Cannot find xlsx in client/node_modules; run pnpm install first");
const XLSX = await import(pathToFileURL(xlsxFile).href);

const loadWorkbook = (file) => XLSX.read(readFileSync(file), {
  type: "buffer",
  cellFormula: false,
  cellHTML: false,
  cellStyles: false,
  cellText: false,
});
const ordersBook = loadWorkbook(ORDERS_FILE);
const stockBook = loadWorkbook(STOCK_FILE);
const ledgerBook = loadWorkbook(LEDGER_FILE);
const rowsOf = (book, sheetName) => XLSX.utils.sheet_to_json(book.Sheets[sheetName], {
  header: 1,
  blankrows: false,
  defval: "",
  raw: true,
});

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const upper = (value) => clean(value).normalize("NFC").toLocaleUpperCase("vi");
const normalizedName = (value) => upper(value)
  .replace(/\s*[-–—]\s*(?:\+?84|0)[\d\s().-]{7,}$/u, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();
const slug = (value) => upper(value)
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/Đ/g, "D")
  .replace(/[^A-Z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 48) || "ROW";
const unique = (values) => [...new Set(values.filter(Boolean))];
const first = (...values) => values.map(clean).find(Boolean) ?? "";
const firstDate = (...values) => values.map(excelDate).find(Boolean) ?? "";

function excelDate(value) {
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString().slice(0, 10);
  const raw = clean(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 20000 && numeric <= 60000) {
    return new Date(Date.UTC(1899, 11, 30) + numeric * 86400000).toISOString().slice(0, 10);
  }
  const match = raw.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})\b/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function numberOf(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/[₫đĐ]/g, "")
    .replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "");
  const numeric = Number(normalized.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function phoneIn(value) {
  const match = clean(value).match(/(?:\+?84|0)[\d\s().-]{7,}\d/u);
  return match ? clean(match[0]) : "";
}

function normalizeUom(value) {
  const key = upper(value).replace(/\s+/g, "");
  const map = new Map([
    ["M", "Mét"],
    ["MÉT", "Mét"],
    ["M2", "m2"],
    ["M²", "m2"],
    ["KG", "Kg"],
    ["KILOGAM", "Kg"],
    ["CÁI", "Cái"],
    ["BỘ", "Bộ"],
    ["CẶP", "Cặp"],
    ["CÂY", "Cây"],
    ["LÁ", "Lá"],
    ["TẤM", "Tấm"],
    ["TÂM", "Tấm"],
    ["TÚI", "Túi"],
    ["SỢI", "Sợi"],
    ["BÌNH", "Bình"],
    ["CUỘN", "Cuộn"],
    ["HỘP", "Hộp"],
  ]);
  return map.get(key) ?? "";
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function supplierGroup(name) {
  const value = upper(name);
  if (/MOTOR|MÔ TƠ|YHLD|TANKER|QUANG HÀ NỘI/.test(value)) return "Mô tơ";
  if (/SƠN|BỘT|HÓA CHẤT/.test(value)) return "Sơn";
  if (/NHÔM|TIẾN ĐẠT|NAM PHÁT/.test(value)) return "Nhôm";
  if (/XE|VẬN CHUYỂN|CHÀNH/.test(value)) return "Vận chuyển";
  if (/NHỰA|BẠC ĐẠN|PHỤ KIỆN|ỐC|VÍT/.test(value)) return "Phụ kiện";
  return "Khác";
}

const customers = new Map();
const suppliers = new Map();
const mergeParty = (map, input) => {
  const key = normalizedName(input.name);
  if (!key) return null;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...input, name: clean(input.name), sources: unique(input.sources ?? []) });
    return map.get(key);
  }
  for (const field of ["phone", "address", "note", "account_manager", "customer_type"]) {
    if (!existing[field] && input[field]) existing[field] = clean(input[field]);
  }
  existing.sources = unique([...(existing.sources ?? []), ...(input.sources ?? [])]);
  return existing;
};
const addCustomer = (name, details = {}) => mergeParty(customers, {
  name,
  customer_type: details.customer_type ?? "Khác",
  account_manager: details.account_manager ?? "",
  phone: details.phone ?? phoneIn(name),
  address: details.address ?? "",
  note: details.note ?? "",
  sources: details.sources ?? [],
});
const addSupplier = (name, details = {}) => mergeParty(suppliers, {
  name,
  supplier_group: details.supplier_group ?? supplierGroup(name),
  account_manager: details.account_manager ?? "",
  phone: details.phone ?? phoneIn(name),
  address: details.address ?? "",
  note: details.note ?? "",
  sources: details.sources ?? [],
});

// ── 1. Party master ──────────────────────────────────────────────────────────
const partyRows = rowsOf(ordersBook, "DS KH-NCC").slice(2);
let blankPartyTypes = 0;
for (let index = 0; index < partyRows.length; index += 1) {
  const row = partyRows[index];
  const name = clean(row[0]);
  if (!name) continue;
  const type = upper(row[2]);
  const details = {
    account_manager: clean(row[1]),
    phone: clean(row[3]) || phoneIn(name),
    address: clean(row[4]),
    note: clean(row[5]),
    sources: [`DS KH-NCC:${index + 3}`],
  };
  if (type.includes("NCC")) addSupplier(name, details);
  else {
    if (!type) blankPartyTypes += 1;
    addCustomer(name, {
      ...details,
      customer_type: type.includes("KH LẺ") ? "Khách lẻ" : type === "KH" ? "Đại lý" : "Khác",
    });
  }
}

const goodsMasterRows = rowsOf(ordersBook, "DS HH NHẬP").slice(1);
for (let index = 0; index < goodsMasterRows.length; index += 1) {
  const supplier = clean(goodsMasterRows[index][1]);
  if (supplier) addSupplier(supplier, { sources: [`DS HH NHẬP:${index + 2}`] });
}

// ── 2. Legacy monthly order register ─────────────────────────────────────────
const monthlySheets = ordersBook.SheetNames.filter((name) => /^T[2-7]\.2026$/.test(name));
const voucherSheets = new Map();
const orderLineStats = new Map();

function headerIndex(headers, labels) {
  const normalized = headers.map(upper);
  for (const label of labels) {
    const exact = normalized.findIndex((value) => value === upper(label));
    if (exact >= 0) return exact;
  }
  for (const label of labels) {
    const partial = normalized.findIndex((value) => value.includes(upper(label)));
    if (partial >= 0) return partial;
  }
  return -1;
}

for (const sheetName of monthlySheets) {
  const rows = rowsOf(ordersBook, sheetName);
  const header = rows[0] ?? [];
  const cDate = headerIndex(header, ["NGÀY ĐẶT HÀNG", "Năm"]);
  const cVoucher = headerIndex(header, ["Số chứng từ"]);
  const cCustomer = headerIndex(header, ["ĐẠI LÝ"]);
  const cProduct = headerIndex(header, ["TÊN SP", "MẪ HÀNG", "MÃ HÀNG", "LOẠI HÀNG"]);
  const cError = headerIndex(header, ["LỖI SP", "LỖI"]);
  const cOrder = headerIndex(header, ["ĐƠN HÀNG"]);
  const cDeliveryText = headerIndex(header, ["PHIẾU XUẤT KHO"]);
  const cOwner = headerIndex(header, ["NGƯỜI PHỤ TRÁCH"]);
  const cNote = headerIndex(header, ["GHI CHÚ"]);
  const cDeliveryDate = headerIndex(header, ["NGÀY GIAO HÀNG"]);
  const cStatus = headerIndex(header, ["TRẠNG THÁI"]);
  const byVoucher = new Map();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const voucher = cVoucher >= 0 ? clean(row[cVoucher]) : "";
    const customerRaw = cCustomer >= 0 ? clean(row[cCustomer]) : "";
    const description = cOrder >= 0 ? clean(row[cOrder]) : "";
    const product = cProduct >= 0 ? clean(row[cProduct]) : "";
    if (!voucher || !customerRaw || (!description && !product)) continue;
    const customer = addCustomer(customerRaw, {
      customer_type: /KHÁCH LẺ/.test(upper(customerRaw)) ? "Khách lẻ" : "Đại lý",
      sources: [`${sheetName}:${index + 1}`],
    });
    const entry = byVoucher.get(voucher) ?? {
      voucher,
      sheetName,
      customer: customer.name,
      orderDate: "",
      deliveryDate: "",
      owner: "",
      status: "",
      note: "",
      items: [],
    };
    entry.orderDate ||= cDate >= 0 ? excelDate(row[cDate]) : "";
    entry.deliveryDate ||= cDeliveryDate >= 0 ? excelDate(row[cDeliveryDate]) : "";
    entry.owner ||= cOwner >= 0 ? clean(row[cOwner]) : "";
    entry.status ||= cStatus >= 0 ? clean(row[cStatus]) : "";
    entry.note ||= cNote >= 0 ? clean(row[cNote]) : "";
    entry.items.push({
      row_id: `ROW-${String(entry.items.length + 1).padStart(4, "0")}`,
      product: product || description.slice(0, 140),
      order_description: description,
      delivery_description: cDeliveryText >= 0 ? clean(row[cDeliveryText]) : "",
      error: cError >= 0 ? clean(row[cError]) : "",
      note: cNote >= 0 ? clean(row[cNote]) : "",
      source_row: index + 1,
    });
    byVoucher.set(voucher, entry);
  }
  orderLineStats.set(sheetName, [...byVoucher.values()].reduce((sum, order) => sum + order.items.length, 0));
  for (const [voucher, entry] of byVoucher) {
    const copies = voucherSheets.get(voucher) ?? [];
    copies.push(entry);
    voucherSheets.set(voucher, copies);
  }
}

const legacyOrders = [];
let duplicatedMonthlyVouchers = 0;
for (const [voucher, copies] of voucherSheets) {
  if (copies.length > 1) duplicatedMonthlyVouchers += 1;
  const chosen = [...copies].sort((a, b) => {
    const monthA = Number(a.sheetName.match(/^T(\d+)/)?.[1] ?? 0);
    const monthB = Number(b.sheetName.match(/^T(\d+)/)?.[1] ?? 0);
    return monthB - monthA || b.items.length - a.items.length;
  })[0];
  const dedupedItems = [];
  const seenLines = new Set();
  for (const item of chosen.items) {
    const key = [upper(item.product), upper(item.order_description), upper(item.delivery_description)].join("|");
    if (seenLines.has(key)) continue;
    seenLines.add(key);
    dedupedItems.push({ ...item, row_id: `ROW-${String(dedupedItems.length + 1).padStart(4, "0")}` });
  }
  legacyOrders.push({
    name: `DHCU-${slug(voucher)}`,
    payload: {
      legacy_voucher: voucher,
      record_type: "Đơn hàng",
      ...(chosen.orderDate ? { order_date: chosen.orderDate } : {}),
      customer: chosen.customer,
      ...(chosen.deliveryDate ? { delivery_date: chosen.deliveryDate } : {}),
      legacy_status: chosen.status || (dedupedItems.some((item) => item.error) ? "Có lỗi" : "Đã ghi nhận"),
      salesperson: chosen.owner,
      items: dedupedItems,
      note: chosen.note,
      source_workbook: path.basename(ORDERS_FILE),
      source_sheet: chosen.sheetName,
      _migration_source: "alumdoor-legacy-2026",
    },
  });
}

// The HOÀNG LAI sheet is a project/batch order outside the monthly voucher register.
if (ordersBook.Sheets["HOÀNG LAI"]) {
  const rows = rowsOf(ordersBook, "HOÀNG LAI");
  const customer = addCustomer("HOÀNG LAI", { customer_type: "Đại lý", sources: ["HOÀNG LAI"] });
  const items = [];
  for (let index = 2; index < rows.length; index += 1) {
    const product = clean(rows[index][0]);
    const description = clean(rows[index][2]);
    if (!product && !description) continue;
    items.push({
      row_id: `ROW-${String(items.length + 1).padStart(4, "0")}`,
      product: product || description.slice(0, 140),
      order_description: description,
      qty: numberOf(rows[index][3]) ?? undefined,
      note: clean(rows[index][1]),
      source_row: index + 1,
    });
  }
  legacyOrders.push({
    name: "DHCU-DU-AN-HOANG-LAI-2026",
    payload: {
      legacy_voucher: "DỰ-ÁN-HOÀNG-LAI-2026",
      record_type: "Đơn dự án",
      customer: customer.name,
      legacy_status: "Theo dõi giao nhiều đợt",
      items,
      source_workbook: path.basename(ORDERS_FILE),
      source_sheet: "HOÀNG LAI",
      _migration_source: "alumdoor-legacy-2026",
    },
  });
}

// ── 3. Separate quotation/account ledger workbook ────────────────────────────
let ledgerLineCount = 0;
for (let sheetIndex = 0; sheetIndex < ledgerBook.SheetNames.length; sheetIndex += 1) {
  const sheetName = ledgerBook.SheetNames[sheetIndex];
  const rows = rowsOf(ledgerBook, sheetName);
  const customerHeader = rows.find((row) => upper(row[1]).startsWith("TÊN KHÁCH HÀNG"));
  const customerRaw = clean(customerHeader?.[2]);
  if (!customerRaw) continue;
  const customer = addCustomer(customerRaw, {
    customer_type: "Đại lý",
    sources: [`${path.basename(LEDGER_FILE)}:${sheetName}`],
  });
  const headerAt = rows.findIndex((row) => row.some((cell) => upper(cell).includes("SẢN PHẨM & QUY CÁCH")));
  if (headerAt < 0) continue;
  const items = [];
  for (let index = headerAt + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (upper(row[1]).includes("NGÂN HÀNG")) break;
    const product = clean(row[2]);
    const amount = numberOf(row[9]);
    if (!product && amount === null) continue;
    if (upper(row[1]).includes("TỔNG ĐƠN HÀNG")) break;
    items.push({
      row_id: `ROW-${String(items.length + 1).padStart(4, "0")}`,
      product: product || clean(row[1]) || "Bút toán nguồn",
      order_description: product || clean(row[1]),
      qty: numberOf(row[5]) ?? undefined,
      ...(normalizeUom(row[8]) ? { uom: normalizeUom(row[8]) } : {}),
      rate: numberOf(row[7]) ?? undefined,
      amount: amount ?? undefined,
      note: [clean(row[3]) && `Cao ${clean(row[3])} m`, clean(row[4]) && `Rộng ${clean(row[4])} m`].filter(Boolean).join(" | "),
      source_row: index + 1,
    });
  }
  ledgerLineCount += items.length;
  const headerText = clean(rows[5]?.[6]);
  const orderDate = firstDate(headerText, ...items.map((item) => item.source_row ? rows[item.source_row - 1]?.[1] : ""));
  legacyOrders.push({
    name: `DHCU-BTT-${String(sheetIndex + 1).padStart(2, "0")}-${slug(sheetName)}`,
    payload: {
      legacy_voucher: `BTT-${String(sheetIndex + 1).padStart(2, "0")}-${slug(sheetName)}`,
      record_type: "Bảng tính tiền",
      ...(orderDate ? { order_date: orderDate } : {}),
      customer: customer.name,
      legacy_status: "Dữ liệu tham chiếu",
      salesperson: clean(rows[7]?.[6]).replace(/^Phụ trách bán hàng:\s*/i, ""),
      items,
      source_workbook: path.basename(LEDGER_FILE),
      source_sheet: sheetName,
      _migration_source: "alumdoor-legacy-ledger",
    },
  });
}

// ── 4. Goods intake/purchase/return archive ──────────────────────────────────
const intakeRows = rowsOf(ordersBook, "NHẬP").slice(2);
const legacyIntakes = [];
const intakeCounts = { "Mua vào": 0, "Khách hoàn trả": 0, "Nhập khác": 0 };
for (let index = 0; index < intakeRows.length; index += 1) {
  const row = intakeRows[index];
  const party = clean(row[2]);
  const item = clean(row[3]);
  if (!party && !item && numberOf(row[6]) === null) continue;
  const note = unique([clean(row[9]), clean(row[12])]).join(" | ");
  const classification = upper([note, row[13]].join(" "));
  const isReturn = /(HOÀN|TRẢ|GỬI DƯ|KHÔNG LẤY|ĐỔI LỖI)/.test(classification);
  const isPurchase = !isReturn && (
    /(MUA VÀO|MUA SẢN XUẤT|THANH TOÁN|TIỀN MẶT|CHUYỂN KHOẢN)/.test(classification)
    || clean(row[10])
    || numberOf(row[11]) !== null
  );
  const transactionType = isReturn ? "Khách hoàn trả" : isPurchase ? "Mua vào" : "Nhập khác";
  intakeCounts[transactionType] += 1;
  let linkedSupplier = "";
  let linkedCustomer = "";
  if (isPurchase) linkedSupplier = addSupplier(party, { sources: [`NHẬP:${index + 3}`] })?.name ?? "";
  else if (isReturn) linkedCustomer = addCustomer(party, { sources: [`NHẬP:${index + 3}`] })?.name ?? "";
  else {
    const knownSupplier = suppliers.get(normalizedName(party));
    const knownCustomer = customers.get(normalizedName(party));
    linkedSupplier = knownSupplier?.name ?? "";
    linkedCustomer = knownSupplier ? "" : knownCustomer?.name ?? "";
  }
  const legacyKey = `NHAP-2026-${String(index + 3).padStart(4, "0")}`;
  legacyIntakes.push({
    name: legacyKey,
    payload: {
      legacy_key: legacyKey,
      ...(excelDate(row[0]) ? { intake_date: excelDate(row[0]) } : {}),
      transaction_type: transactionType,
      source_party: party || "(Không ghi)",
      ...(linkedSupplier ? { supplier: linkedSupplier } : {}),
      ...(linkedCustomer ? { customer: linkedCustomer } : {}),
      item_description: item || "(Không ghi nội dung)",
      color_text: clean(row[4]),
      dimension_text: clean(row[5]),
      ...(numberOf(row[6]) !== null ? { qty: numberOf(row[6]) } : {}),
      ...(normalizeUom(row[7]) ? { uom: normalizeUom(row[7]) } : {}),
      responsible: clean(row[8]),
      payment_method: clean(row[10]),
      ...(numberOf(row[11]) !== null ? { amount: numberOf(row[11]) } : {}),
      source_status: clean(row[13]),
      note,
      source_sheet: "NHẬP",
      source_row: index + 3,
      _migration_source: "alumdoor-legacy-2026",
    },
  });
}

// ── 5. Warranty and quality issue archive ────────────────────────────────────
const warrantyClaims = [];
const warrantyRows = rowsOf(ordersBook, "DS BẢO HÀNH").slice(3);
for (let index = 0; index < warrantyRows.length; index += 1) {
  const row = warrantyRows[index];
  const supplierRaw = clean(row[10]);
  const customerRaw = clean(row[11]);
  const item = clean(row[12]);
  if (!supplierRaw && !customerRaw && !item && !firstDate(row[0], row[1], row[3], row[5], row[7])) continue;
  const supplier = supplierRaw ? addSupplier(supplierRaw, { sources: [`DS BẢO HÀNH:${index + 4}`] }) : null;
  const customer = customerRaw ? addCustomer(customerRaw, { sources: [`DS BẢO HÀNH:${index + 4}`] }) : null;
  const sourceState = upper(row[14]);
  const status = sourceState.includes("ĐÃ NHẬP")
    ? "Đã nhận từ NCC"
    : excelDate(row[5])
      ? "Đang gửi NCC"
      : excelDate(row[3])
        ? "Đã đổi cho khách"
        : "Mới";
  const legacyKey = `BH-DSBH-${String(index + 4).padStart(4, "0")}`;
  warrantyClaims.push({
    name: legacyKey,
    payload: {
      legacy_key: legacyKey,
      legacy_voucher: clean(row[9]),
      ...(excelDate(row[0]) ? { order_date: excelDate(row[0]) } : {}),
      ...(excelDate(row[1]) ? { received_fault_on: excelDate(row[1]) } : {}),
      ...(numberOf(row[2]) !== null ? { received_fault_qty: numberOf(row[2]) } : {}),
      ...(excelDate(row[3]) ? { replacement_sent_on: excelDate(row[3]) } : {}),
      ...(numberOf(row[4]) !== null ? { replacement_qty: numberOf(row[4]) } : {}),
      ...(excelDate(row[5]) ? { warranty_sent_on: excelDate(row[5]) } : {}),
      ...(numberOf(row[6]) !== null ? { warranty_sent_qty: numberOf(row[6]) } : {}),
      ...(excelDate(row[7]) ? { warranty_received_on: excelDate(row[7]) } : {}),
      ...(numberOf(row[8]) !== null ? { warranty_received_qty: numberOf(row[8]) } : {}),
      ...(supplier ? { supplier: supplier.name } : {}),
      ...(customer ? { customer: customer.name } : {}),
      item_description: item || "(Không ghi nội dung)",
      supplier_resolution: clean(row[14]),
      ...(excelDate(row[15]) ? { debt_offset_on: excelDate(row[15]) } : {}),
      warranty_status: status,
      note: unique([clean(row[13]), clean(row[16])]).join(" | "),
      source_sheet: "DS BẢO HÀNH",
      source_row: index + 4,
      _migration_source: "alumdoor-legacy-2026",
    },
  });
}

const issueRows = rowsOf(ordersBook, "DANH SÁCH LỖI").slice(2);
for (let index = 0; index < issueRows.length; index += 1) {
  const row = issueRows[index];
  const supplierRaw = clean(row[5]);
  const customerRaw = clean(row[4]);
  const item = clean(row[6]);
  if (!supplierRaw && !customerRaw && !item && !firstDate(row[0], row[1])) continue;
  const supplier = supplierRaw ? addSupplier(supplierRaw, { sources: [`DANH SÁCH LỖI:${index + 3}`] }) : null;
  const customer = customerRaw ? addCustomer(customerRaw, { sources: [`DANH SÁCH LỖI:${index + 3}`] }) : null;
  const customerResolution = clean(row[9]);
  const supplierResolution = clean(row[10]);
  const resolution = upper(`${customerResolution} ${supplierResolution}`);
  const status = resolution.includes("ĐÃ NHẬP")
    ? "Đã nhận từ NCC"
    : resolution.includes("ĐÃ ĐỔI")
      ? "Đã đổi cho khách"
      : supplierRaw
        ? "Đang gửi NCC"
        : "Mới";
  const legacyKey = `BH-LOI-${String(index + 3).padStart(4, "0")}`;
  warrantyClaims.push({
    name: legacyKey,
    payload: {
      legacy_key: legacyKey,
      legacy_voucher: clean(row[3]),
      ...(excelDate(row[0]) ? { order_date: excelDate(row[0]) } : {}),
      ...(excelDate(row[1]) ? { received_fault_on: excelDate(row[1]) } : {}),
      ...(supplier ? { supplier: supplier.name } : {}),
      ...(customer ? { customer: customer.name } : {}),
      item_description: item || "(Không ghi nội dung)",
      issue_cause: clean(row[8]),
      customer_resolution: customerResolution,
      supplier_resolution: supplierResolution,
      warranty_status: status,
      note: unique([clean(row[7]) && `Phụ trách: ${clean(row[7])}`, clean(row[11])]).join(" | "),
      source_sheet: "DANH SÁCH LỖI",
      source_row: index + 3,
      _migration_source: "alumdoor-legacy-2026",
    },
  });
}

// ── 6. Production standards ──────────────────────────────────────────────────
const productionStandards = [];
if (ordersBook.Sheets["LỊCH SẢN XUẤT"]) {
  const rows = rowsOf(ordersBook, "LỊCH SẢN XUẤT").slice(1);
  for (const row of rows) {
    const department = clean(row[9]);
    const standardTime = clean(row[11]);
    if (!department || !standardTime) continue;
    productionStandards.push({
      name: department,
      payload: {
        department,
        standard_time: standardTime,
        disabled: false,
        _migration_source: "alumdoor-legacy-2026",
      },
    });
  }
}

// ── 7. Current aluminium lots ────────────────────────────────────────────────
const notAProfile = new Set(["MẪU", "LICH_SU", "LỊCH SỬ", "RAY"]);
const generationMap = new Map([
  ["MỚI", "MỚI"],
  ["MOI", "MỚI"],
  ["CŨ", "CŨ"],
  ["CU", "CŨ"],
  ["TĐ", "TĐ"],
  ["TD", "TĐ"],
]);
const lots = [];
const profiles = new Set();
const colours = new Set();
let skippedEmptyLots = 0;
let scrapLots = 0;
let unknownGenerations = 0;
let selectedForCutLots = 0;
let lotsWithRemainingKg = 0;
let lotsWithIntakeNote = 0;
const lotStockStates = new Map();

for (const sheetName of stockBook.SheetNames) {
  const profile = clean(sheetName);
  if (notAProfile.has(profile)) continue;
  const rows = rowsOf(stockBook, sheetName);
  const headerAt = rows.findIndex((row) => row.some((cell) => upper(cell).startsWith("THEO DÕI TỒN")));
  if (headerAt < 0) continue;
  const headers = rows[headerAt].map(upper);
  const at = (label) => headers.findIndex((value) => value.startsWith(upper(label)));
  const cDate = at("NGÀY NHẬP NHÔM");
  const cColour = at("MÀU");
  const cGeneration = at("TÌNH TRẠNG");
  const cWidth = at("KHỔ");
  const cCount = at("SỐ LÁ");
  const cReturned = at("NGÀY NHẬP LẠI");
  const cStockState = at("THEO DÕI TỒN");
  const cSelectedForCut = at("CHỌN CẮT");
  const cScrap = at("LM/PHẾ");
  const cRemainingKg = at("SỐ KG");
  const cIntakeNoteExact = at("NHẬP/GHI CHÚ");
  const cIntakeNote = cIntakeNoteExact >= 0 ? cIntakeNoteExact : at("NHẬP");
  const cNote = at("GHI CHÚ");
  for (let index = headerAt + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const width = numberOf(row[cWidth]);
    const count = numberOf(row[cCount]);
    if (width === null || width <= 0) continue;
    if (count === null || count <= 0) {
      skippedEmptyLots += 1;
      continue;
    }
    const colour = clean(row[cColour]) || "KHÔNG RÕ";
    const rawGeneration = upper(row[cGeneration]);
    const generation = generationMap.get(rawGeneration) ?? "MỚI";
    if (rawGeneration && !generationMap.has(rawGeneration)) unknownGenerations += 1;
    const rawStockState = upper(row[cStockState]);
    const stockState = ["TỒN", "SẮP HẾT", "HẾT"].includes(rawStockState) ? rawStockState : "TỒN";
    const selectedForCut = row[cSelectedForCut] === true
      || ["1", "TRUE", "CÓ", "X"].includes(upper(row[cSelectedForCut]));
    const remainingKg = numberOf(row[cRemainingKg]);
    const intakeNote = clean(row[cIntakeNote]);
    const isScrap = width < 0.25;
    if (isScrap) scrapLots += 1;
    if (selectedForCut) selectedForCutLots += 1;
    if (remainingKg !== null) lotsWithRemainingKg += 1;
    if (intakeNote) lotsWithIntakeNote += 1;
    lotStockStates.set(stockState, (lotStockStates.get(stockState) ?? 0) + 1);
    profiles.add(profile);
    colours.add(colour);
    const number = lots.length + 1;
    const name = `LN-MIG-${String(number).padStart(6, "0")}`;
    const sourceKey = `${path.basename(STOCK_FILE)}:${sheetName}:${index + 1}`;
    lots.push({
      name,
      payload: {
        profile,
        colour,
        generation,
        width_m: width,
        sheet_count: count,
        warehouse: WAREHOUSE,
        ...(excelDate(row[cDate]) ? { received_on: excelDate(row[cDate]) } : {}),
        ...(excelDate(row[cReturned]) ? { returned_on: excelDate(row[cReturned]) } : {}),
        quality_status: isScrap ? "Phế" : "Khả dụng",
        stock_state: stockState,
        selected_for_cut: selectedForCut,
        scrap_note: clean(row[cScrap]) || (isScrap ? `Khổ dưới 0,25 m: ${width} m` : ""),
        ...(remainingKg !== null ? { remaining_kg: remainingKg } : {}),
        intake_note: intakeNote,
        note: clean(row[cNote]),
        legacy_source_key: sourceKey,
        source_sheet: sheetName,
        source_row: index + 1,
        _migration_source: "alumdoor-current-lots-2026",
      },
    });
  }
}

const profileItems = [...profiles].sort((a, b) => a.localeCompare(b, "vi")).map((name) => ({
  name,
  payload: {
    item_code: name,
    item_name: name,
    item_group: "Nan/lá cửa",
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: true,
    is_purchase_item: true,
    is_sales_item: false,
    include_item_in_manufacturing: true,
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    stock_uom: "Kg",
    default_purchase_uom: "Kg",
    valuation_method: "FIFO",
    has_batch_no: false,
    has_serial_no: false,
    allow_negative_stock: false,
    description: `Mã nhôm nguyên liệu từ sheet tồn ${name}; tồn chi tiết quản lý bằng Lô nhôm tồn.`,
    disabled: false,
    _migration_source: "alumdoor-current-lots-2026",
  },
}));
const colourRecords = [...colours].sort((a, b) => a.localeCompare(b, "vi")).map((name) => ({
  name,
  payload: {
    color_code: name,
    color_name: name === "THÔ" ? "Thô" : name,
    finish: name === "THÔ" ? "Thô" : "Khác",
    note: "Mã màu có trong tồn nhôm 2026.",
    disabled: false,
    _migration_source: "alumdoor-current-lots-2026",
  },
}));

// ── 8. Build document records and SQL ────────────────────────────────────────
const customerRecords = [...customers.values()]
  .sort((a, b) => a.name.localeCompare(b.name, "vi"))
  .map((party) => ({
    name: party.name,
    payload: {
      customer_name: party.name,
      customer_type: party.customer_type || "Khác",
      account_manager: party.account_manager || "",
      phone: party.phone || "",
      address: party.address || "",
      credit_limit: 0,
      payment_terms: "Trả ngay",
      note: unique([party.note, `Nguồn: ${(party.sources ?? []).slice(0, 4).join(", ")}`]).join(" | "),
      disabled: false,
      _migration_source: "alumdoor-legacy-2026",
    },
  }));
const supplierRecords = [...suppliers.values()]
  .sort((a, b) => a.name.localeCompare(b.name, "vi"))
  .map((party) => ({
    name: party.name,
    payload: {
      supplier_name: party.name,
      supplier_group: party.supplier_group || supplierGroup(party.name),
      account_manager: party.account_manager || "",
      phone: party.phone || "",
      address: party.address || "",
      payment_terms: "Trả ngay",
      note: unique([party.note, `Nguồn: ${(party.sources ?? []).slice(0, 4).join(", ")}`]).join(" | "),
      disabled: false,
      _migration_source: "alumdoor-legacy-2026",
    },
  }));

for (const [label, records] of [
  ["customers", customerRecords],
  ["suppliers", supplierRecords],
  ["legacy orders", legacyOrders],
  ["legacy intakes", legacyIntakes],
  ["warranty claims", warrantyClaims],
  ["production standards", productionStandards],
  ["lots", lots],
]) {
  const names = records.map((record) => record.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length) throw new Error(`Duplicate ${label}: ${unique(duplicates).slice(0, 10).join(", ")}`);
}
if (customerRecords.length < 300) throw new Error(`Customer extraction unexpectedly small: ${customerRecords.length}`);
if (supplierRecords.length < 10) throw new Error(`Supplier extraction unexpectedly small: ${supplierRecords.length}`);
if (legacyOrders.length < 1000) throw new Error(`Legacy order extraction unexpectedly small: ${legacyOrders.length}`);
if (lots.length < 1000) throw new Error(`Aluminium lot extraction unexpectedly small: ${lots.length}`);

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const chunks = (values, size = 20) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};
const sql = [
  `-- Alumdoor remaining data import generated ${IMPORTED_AT}.`,
  "-- Historical documents are reference-only and do not post stock or accounting ledgers.",
  `-- Current aluminium lots are assigned to physical warehouse ${WAREHOUSE} because the workbook has no warehouse column.`,
  "",
];

function appendDocumentUpserts(doctype, records, { overwrite = true, chunkSize = 20 } = {}) {
  for (const chunk of chunks(records, chunkSize)) {
    const values = chunk.map(({ name, payload }) =>
      `(${sqlText(TENANT)},${sqlText(`${doctype}:${name}`)},${sqlText(doctype)},${sqlText(name)},'admin',0,'Imported',1,${sqlText(IMPORTED_AT)},${sqlText(IMPORTED_AT)},'admin',${sqlText(JSON.stringify(payload))})`);
    sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ${values.join(",\n  ")}
ON CONFLICT(tenant_id,doc_key) DO ${overwrite
    ? "UPDATE SET payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,version=documents.version+1"
    : "NOTHING"};`);
  }
}

function appendSearchUpserts(doctype, records, titleOf, contentOf, chunkSize = 30) {
  for (const chunk of chunks(records, chunkSize)) {
    const values = chunk.map((record) =>
      `(${sqlText(TENANT)},${sqlText(doctype)},${sqlText(record.name)},${sqlText(titleOf(record))},${sqlText(contentOf(record))},${sqlText(IMPORTED_AT)})`);
    sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ${values.join(",\n  ")}
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;`);
  }
}

if (LOT_COLUMNS_ONLY) {
  for (const record of lots) {
    const patch = {
      stock_state: record.payload.stock_state,
      selected_for_cut: record.payload.selected_for_cut,
      intake_note: record.payload.intake_note,
      ...(record.payload.remaining_kg === undefined ? {} : { remaining_kg: record.payload.remaining_kg }),
    };
    sql.push(`UPDATE documents
SET payload_json=json_patch(payload_json,json(${sqlText(JSON.stringify(patch))})),
    modified_at=${sqlText(IMPORTED_AT)},modified_by='admin',version=version+1
WHERE tenant_id=${sqlText(TENANT)} AND doc_key=${sqlText(`Aluminium Lot:${record.name}`)}
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json(${sqlText(JSON.stringify(patch))}))<>payload_json;`);
  }
} else {
  appendDocumentUpserts("Item", profileItems, { overwrite: false });
  appendSearchUpserts("Item", profileItems, (record) => record.payload.item_name, (record) =>
    [record.payload.item_code, record.payload.item_name, record.payload.item_group, record.payload.description].join(" "));
  appendDocumentUpserts("Item Color", colourRecords, { overwrite: false });
  appendSearchUpserts("Item Color", colourRecords, (record) => record.payload.color_name, (record) =>
    [record.payload.color_code, record.payload.color_name, record.payload.finish].join(" "));
  appendDocumentUpserts("Customer", customerRecords);
  appendSearchUpserts("Customer", customerRecords, (record) => record.payload.customer_name, (record) =>
    [record.payload.customer_name, record.payload.phone, record.payload.address, record.payload.account_manager].join(" "));
  appendDocumentUpserts("Supplier", supplierRecords);
  appendSearchUpserts("Supplier", supplierRecords, (record) => record.payload.supplier_name, (record) =>
    [record.payload.supplier_name, record.payload.phone, record.payload.address, record.payload.supplier_group].join(" "));
  appendDocumentUpserts("Aluminium Lot", lots, { chunkSize: 12 });
  appendSearchUpserts("Aluminium Lot", lots, (record) => `${record.payload.profile} · ${record.payload.colour} · ${record.payload.width_m} m`, (record) =>
    [record.payload.profile, record.payload.colour, record.payload.generation, record.payload.width_m, record.payload.warehouse, record.payload.quality_status].join(" "));
  appendDocumentUpserts("Legacy Sales Order", legacyOrders, { chunkSize: 5 });
  appendSearchUpserts("Legacy Sales Order", legacyOrders, (record) => `${record.payload.legacy_voucher} · ${record.payload.customer}`, (record) =>
    [record.payload.legacy_voucher, record.payload.customer, record.payload.salesperson,
      ...record.payload.items.flatMap((item) => [item.product, item.order_description])].join(" "), 8);
  appendDocumentUpserts("Legacy Goods Intake", legacyIntakes, { chunkSize: 12 });
  appendSearchUpserts("Legacy Goods Intake", legacyIntakes, (record) => `${record.payload.source_party} · ${record.payload.item_description}`, (record) =>
    [record.payload.source_party, record.payload.item_description, record.payload.note, record.payload.source_status].join(" "));
  appendDocumentUpserts("Warranty Claim", warrantyClaims, { chunkSize: 12 });
  appendSearchUpserts("Warranty Claim", warrantyClaims, (record) => `${record.payload.customer ?? "Không rõ KH"} · ${record.payload.item_description}`, (record) =>
    [record.payload.legacy_voucher, record.payload.customer, record.payload.supplier, record.payload.item_description, record.payload.note].join(" "));
  appendDocumentUpserts("Production Standard", productionStandards);
  appendSearchUpserts("Production Standard", productionStandards, (record) => record.payload.department, (record) =>
    [record.payload.department, record.payload.standard_time].join(" "));
}

const audit = {
  format: "cloudforge-alumdoor-remaining-import/v1",
  generated_at: IMPORTED_AT,
  tenant: TENANT,
  warehouse_assumption: WAREHOUSE,
  sources: [
    { file: path.basename(ORDERS_FILE), sha256: sha256(ORDERS_FILE) },
    { file: path.basename(STOCK_FILE), sha256: sha256(STOCK_FILE) },
    { file: path.basename(LEDGER_FILE), sha256: sha256(LEDGER_FILE) },
  ],
  counts: {
    customers: customerRecords.length,
    suppliers: supplierRecords.length,
    aluminium_profiles: profileItems.length,
    aluminium_colours: colourRecords.length,
    aluminium_lots: lots.length,
    aluminium_sheets: lots.reduce((sum, lot) => sum + Number(lot.payload.sheet_count ?? 0), 0),
    aluminium_scrap_lots: scrapLots,
    aluminium_selected_for_cut_lots: selectedForCutLots,
    aluminium_lots_with_remaining_kg: lotsWithRemainingKg,
    aluminium_lots_with_intake_note: lotsWithIntakeNote,
    aluminium_lots_by_stock_state: Object.fromEntries([...lotStockStates].sort(([a], [b]) => a.localeCompare(b, "vi"))),
    aluminium_empty_rows_skipped: skippedEmptyLots,
    legacy_orders: legacyOrders.length,
    legacy_order_lines: legacyOrders.reduce((sum, order) => sum + order.payload.items.length, 0),
    legacy_ledger_lines: ledgerLineCount,
    duplicated_monthly_vouchers_collapsed: duplicatedMonthlyVouchers,
    legacy_intakes: legacyIntakes.length,
    legacy_intakes_by_type: intakeCounts,
    warranty_claims: warrantyClaims.length,
    production_standards: productionStandards.length,
  },
  source_quality: {
    blank_party_types_treated_as_customer_other: blankPartyTypes,
    unknown_aluminium_generations_defaulted_to_new: unknownGenerations,
  },
  safeguards: [
    ...(LOT_COLUMNS_ONLY ? ["Lot-column mode patches only imported Aluminium Lot rows and leaves customer, supplier, history and operational ledgers untouched."] : []),
    "Historical orders, intake and warranty records are reference doctypes and do not post stock/accounting ledgers.",
    "Repeated monthly vouchers keep only the newest sheet copy.",
    "Aluminium lots use deterministic LN-MIG names and idempotent upsert.",
    "Rows with zero aluminium sheets are history only and are not imported as current stock.",
    "Aluminium widths below 0.25 m are retained but marked quality_status=Phế.",
  ],
};

const partStem = path.basename(SQL_FILE, path.extname(SQL_FILE));
const partDirectory = path.dirname(SQL_FILE);
const partPrefix = `${partStem}.part-`;
const statements = sql.slice(4);
const partBodies = [];
const partHeaderReserve = 256;
let currentPart = [];
for (const statement of statements) {
  const candidate = [...currentPart, statement].join("\n\n");
  if (Buffer.byteLength(`${candidate}\n`, "utf8") + partHeaderReserve > MAX_PART_BYTES && currentPart.length) {
    partBodies.push(currentPart);
    currentPart = [statement];
  } else {
    currentPart.push(statement);
  }
  const singleStatementSize = Buffer.byteLength(`${currentPart.join("\n\n")}\n`, "utf8") + partHeaderReserve;
  if (singleStatementSize > MAX_PART_BYTES) {
    throw new Error(`A generated SQL statement exceeds --max-part-bytes (${singleStatementSize} > ${MAX_PART_BYTES})`);
  }
}
if (currentPart.length) partBodies.push(currentPart);

for (const file of readdirSync(partDirectory)) {
  if (file.startsWith(partPrefix) && file.endsWith(".sql")) {
    await unlink(path.join(partDirectory, file));
  }
}
const partFiles = [];
for (let index = 0; index < partBodies.length; index += 1) {
  const partFile = path.join(
    partDirectory,
    `${partPrefix}${String(index + 1).padStart(3, "0")}.sql`,
  );
  const partHeader = [
    `-- Alumdoor remaining data import part ${index + 1}/${partBodies.length}.`,
    "-- Generated at statement boundaries for Cloudflare D1 remote execution.",
    "",
  ].join("\n");
  await writeFile(partFile, `${partHeader}${partBodies[index].join("\n\n")}\n`, "utf8");
  partFiles.push(partFile);
}
audit.sql_parts = partFiles.map((file) => ({
  file: path.basename(file),
  bytes: Buffer.byteLength(readFileSync(file)),
}));

await writeFile(SQL_FILE, `${sql.join("\n\n")}\n`, "utf8");
await writeFile(AUDIT_FILE, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sql: path.resolve(SQL_FILE),
  sql_parts: partFiles.length,
  largest_part_bytes: Math.max(...audit.sql_parts.map((part) => part.bytes)),
  audit: path.resolve(AUDIT_FILE),
  ...audit.counts,
}, null, 2));
