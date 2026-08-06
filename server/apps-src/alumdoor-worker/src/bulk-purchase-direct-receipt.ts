type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

export interface PurchaseDirectReceiptEnv {
  PLATFORM?: Fetcher;
}

interface ItemDoc extends Json {
  item_code?: string;
  item_name?: string;
  inventory_mode?: string;
  measurement_profile?: string;
  material_specification?: string;
  stock_uom?: string;
  default_purchase_uom?: string;
  purchase_uom?: string;
  min_area_sqm?: number;
  disabled?: boolean | number | string;
  is_purchase_item?: boolean | number | string;
  allowed_colors?: Array<{ color?: unknown }>;
  uom_conversions?: Array<{ uom?: string; conversion_factor?: unknown }>;
}

interface CompanyDoc extends Json {
  name?: string;
  default_currency?: string;
}

interface ReceiptDoc extends Json {
  name: string;
  supplier?: string;
  supplier_invoice_no?: string;
  docstatus?: number;
  note?: string;
}

const MAX_LINES = 100;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function number(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${label} không hợp lệ.`);
  return result;
}

function positive(value: unknown, label: string): number {
  const result = number(value, label);
  if (result <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  return result;
}

function nonNegative(value: unknown, label: string): number {
  const result = number(value, label);
  if (result < 0) throw new Error(`${label} không được âm.`);
  return result;
}

function booleanFlag(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "y", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

function normalizedUom(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function normalizePostingAt(value: unknown): string {
  const raw = text(value);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("Ngày/giờ nhận hàng không hợp lệ.");
  return parsed.toISOString();
}

function platformCaller(request: Request, env: PurchaseDirectReceiptEnv): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("Nền tảng không cấp địa chỉ gọi ngược.");
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

function assertPurchaseItem(item: ItemDoc, itemCode: string, line: string): void {
  if (booleanFlag(item.disabled)) throw new Error(`${line}: ${itemCode} đã bị khóa.`);
  if (item.is_purchase_item !== undefined && !booleanFlag(item.is_purchase_item)) throw new Error(`${line}: ${itemCode} không phải mặt hàng mua.`);
}

function allowedItemColors(item: ItemDoc): string[] | undefined {
  if (!Array.isArray(item.allowed_colors)) return undefined;
  return item.allowed_colors.map((entry) => text(entry?.color)).filter(Boolean);
}

function standardConversion(item: ItemDoc, uom: string, qty: number, line: string): { conversion_factor: number; stock_qty: number } {
  const stockUom = text(item.stock_uom);
  if (!stockUom) throw new Error(`${line}: Item chưa có ĐVT tồn.`);
  if (uom === stockUom) return { conversion_factor: 1, stock_qty: qty };
  const conversion = (item.uom_conversions ?? []).find((entry) => text(entry?.uom) === uom);
  const factor = Number(conversion?.conversion_factor);
  if (!Number.isFinite(factor) || factor <= 0) throw new Error(`${line}: ${uom} khác ĐVT tồn ${stockUom} nhưng Item chưa có hệ số quy đổi.`);
  return { conversion_factor: factor, stock_qty: qty * factor };
}

async function normalizeLine(call: PlatformCall, raw: unknown, index: number, warehouse: string): Promise<Json> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Dòng ${index + 1} không hợp lệ.`);
  const input = raw as Json;
  const itemCode = text(input.item_code);
  const line = `Dòng ${index + 1}${itemCode ? ` (${itemCode})` : ""}`;
  if (!itemCode) throw new Error(`${line}: cần Mã sản phẩm.`);

  const item = await readDoc<ItemDoc>(call, "Item", itemCode);
  assertPurchaseItem(item, itemCode, line);
  const mode = text(item.inventory_mode) || "Hàng thường";
  const stockUom = text(item.stock_uom);
  const rate = nonNegative(input.rate ?? 0, `${line}: Đơn giá`);
  const color = text(input.color);
  const configuredColors = allowedItemColors(item);
  if (color && configuredColors && !configuredColors.includes(color)) throw new Error(`${line}: màu ${color} không thuộc danh sách màu của ${itemCode}.`);

  const base: Json = {
    row_id: `DIRECT-${index + 1}`,
    item_code: itemCode,
    ...(text(item.item_name) ? { item_name: text(item.item_name) } : {}),
    inventory_mode: mode,
    ...(text(item.measurement_profile) ? { measurement_profile: text(item.measurement_profile) } : {}),
    ...(stockUom ? { stock_uom: stockUom } : {}),
    ...(Number.isFinite(Number(item.min_area_sqm)) ? { min_area_sqm: Number(item.min_area_sqm) } : {}),
    warehouse,
    rate,
    ...(color ? { color } : {}),
    ...(text(input.condition) ? { condition: text(input.condition) } : {}),
    ...(text(input.so_no) ? { so_no: text(input.so_no) } : {}),
    ...(text(input.note) ? { note: text(input.note) } : {}),
  };

  for (const field of ["width_m", "height_m", "set_count", "qty_bundle"] as const) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== "") base[field] = number(input[field], `${line}: ${field}`);
  }

  if (mode === "Nhôm cây/lá") {
    if (!color) throw new Error(`${line}: cần Màu.`);
    const length = positive(input.length_m, `${line}: Chiều dài`);
    const bars = positive(input.qty_bar, `${line}: Số cây/lá`);
    const actualWeight = positive(input.actual_weight_kg, `${line}: Kg thực cân`);
    const stamped = text(input.is_stamped) || "Không";
    if (stamped !== "Có" && stamped !== "Không") throw new Error(`${line}: Dập chỉ nhận Có hoặc Không.`);
    const specificationName = text(item.material_specification);
    if (!specificationName) throw new Error(`${line}: Item chưa có Quy cách định mức.`);
    const specification = await readDoc<Json>(call, "Material Specification", specificationName);
    const kgPerM = positive(specification.theoretical_kg_per_m, `${line}: Trọng lượng định mức kg/m`);
    const theoreticalKg = length * kgPerM * bars;
    const totalLength = length * bars;
    const conversion = standardConversion(item, "Kg", actualWeight, line);
    return {
      ...base,
      color,
      length_m: length,
      qty_bar: bars,
      material_specification: specificationName,
      theoretical_kg_per_m: kgPerM,
      theoretical_kg: theoreticalKg,
      total_length_m: totalLength,
      actual_weight_kg: actualWeight,
      actual_kg_per_m: actualWeight / totalLength,
      is_stamped: stamped,
      uom: "Kg",
      qty: actualWeight,
      amount: actualWeight * rate,
      conversion_factor: conversion.conversion_factor,
      stock_qty: conversion.stock_qty,
    };
  }

  const uom = text(input.uom) || text(item.default_purchase_uom) || text(item.purchase_uom) || stockUom;
  if (!uom) throw new Error(`${line}: Item chưa có ĐVT mua hoặc ĐVT tồn.`);
  const selected = normalizedUom(uom);
  const stockSelected = normalizedUom(stockUom);
  const areaMode = mode === "Thành phẩm theo m2" && ["m2", "m²", "sqm"].includes(selected);
  let qty: number;
  let conversion: { conversion_factor: number; stock_qty: number };
  if (areaMode) {
    const width = positive(input.width_m, `${line}: Rộng`);
    const height = positive(input.height_m, `${line}: Cao`);
    const sets = positive(input.set_count ?? 1, `${line}: Số bộ`);
    qty = Math.max(width * height, Number(item.min_area_sqm ?? 0) || 0) * sets;
    base.width_m = width;
    base.height_m = height;
    base.set_count = sets;
    conversion = ["bộ", "bo", "set"].includes(stockSelected)
      ? { conversion_factor: sets / qty, stock_qty: sets }
      : standardConversion(item, uom, qty, line);
  } else {
    qty = positive(input.qty, `${line}: Số lượng`);
    conversion = standardConversion(item, uom, qty, line);
  }

  const actualWeightRaw = input.actual_weight_kg;
  if (actualWeightRaw !== undefined && actualWeightRaw !== null && actualWeightRaw !== "") {
    const actualWeight = positive(actualWeightRaw, `${line}: Kg thực`);
    base.actual_weight_kg = actualWeight;
    if (areaMode && qty > 0) base.actual_kg_per_sqm = actualWeight / qty;
  }

  return { ...base, uom, qty, amount: qty * rate, conversion_factor: conversion.conversion_factor, stock_qty: conversion.stock_qty };
}

async function resolveCompanyAndCurrency(call: PlatformCall, args: Json): Promise<{ company: string; currency: string }> {
  const company = text(args.company);
  if (!company) throw new Error("Cần chọn Công ty trong ngữ cảnh làm việc trước khi nhập hàng.");
  const companyDoc = await readDoc<CompanyDoc>(call, "Company", company);
  const currency = text(args.currency) || text(companyDoc.default_currency);
  if (!currency) throw new Error(`Công ty ${company} chưa có tiền tệ mặc định.`);
  return { company, currency };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function listReceiptDocs(call: PlatformCall, supplier: string, supplierInvoiceNo: string, docstatus: 0 | 1): Promise<ReceiptDoc[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["supplier", "=", supplier], ["supplier_invoice_no", "=", supplierInvoiceNo], ["docstatus", "=", docstatus]]),
    limit_page_length: "100",
  });
  const response = await call(`resource/Purchase%20Receipt?${query}`);
  if (!response.ok) throw new Error("Không kiểm tra được phiếu nhập trùng.");
  const names = (((await response.json()) as { data?: Array<{ name?: string }> }).data ?? []).map((row) => text(row.name)).filter(Boolean);
  return Promise.all(names.map((name) => readDoc<ReceiptDoc>(call, "Purchase Receipt", name)));
}

async function findExistingReceipt(call: PlatformCall, supplier: string, supplierInvoiceNo: string, marker: string): Promise<{ exact?: ReceiptDoc; conflict?: ReceiptDoc }> {
  const candidates = [...await listReceiptDocs(call, supplier, supplierInvoiceNo, 0), ...await listReceiptDocs(call, supplier, supplierInvoiceNo, 1)];
  const exact = candidates.find((doc) => text(doc.note).includes(marker));
  return exact ? { exact } : candidates[0] ? { conflict: candidates[0] } : {};
}

export async function handleBulkPurchaseDirectReceipt(request: Request, env: PurchaseDirectReceiptEnv, create: boolean): Promise<Response> {
  const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return answer({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const args = body.args ?? {};
    const supplier = text(args.supplier);
    const warehouse = text(args.warehouse);
    const supplierInvoiceNo = text(args.supplier_invoice_no);
    const driver = text(args.driver);
    const postingAt = normalizePostingAt(args.posting_at);
    if (!supplier) throw new Error("Cần chọn Nhà cung cấp.");
    if (!warehouse) throw new Error("Cần chọn Kho nhập.");
    if (!supplierInvoiceNo) throw new Error("Cần Số phiếu giao NCC để chống tạo trùng.");
    if (!Array.isArray(args.lines) || !args.lines.length) throw new Error("Cần ít nhất một dòng hàng.");
    if (args.lines.length > MAX_LINES) throw new Error(`Mỗi phiếu nhập tối đa ${MAX_LINES} dòng.`);

    const call = platformCaller(request, env);
    const { company, currency } = await resolveCompanyAndCurrency(call, args);
    const items = await Promise.all(args.lines.map((row, index) => normalizeLine(call, row, index, warehouse)));
    const totalAmount = items.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const totalActualWeight = items.reduce((sum, row) => sum + Number(row.actual_weight_kg ?? 0), 0);
    const fingerprint = await sha256(JSON.stringify({ supplier, company, currency, warehouse, supplier_invoice_no: supplierInvoiceNo, driver, posting_at: postingAt, items }));
    const marker = `[direct-receipt:${fingerprint}]`;
    const result = {
      supplier, company, currency, warehouse, posting_at: postingAt, supplier_invoice_no: supplierInvoiceNo,
      line_count: items.length, total_amount: totalAmount, total_actual_weight_kg: totalActualWeight, items,
      message: `${items.length} dòng sẽ tạo một Purchase Receipt nháp trực tiếp; không cần Đơn NCC và chưa tăng tồn kho cho tới khi phiếu được kiểm rồi submit.`,
    };
    if (!create) return answer(result);

    const existing = await findExistingReceipt(call, supplier, supplierInvoiceNo, marker);
    if (existing.exact) return answer({ ...result, doctype: "Purchase Receipt", name: existing.exact.name, purchase_receipt: existing.exact.name, draft: Number(existing.exact.docstatus ?? 0) === 0, replayed: true });
    if (existing.conflict) throw new Error(`Số phiếu giao NCC ${supplierInvoiceNo} đã gắn với ${existing.conflict.name}; dữ liệu lần này khác nên hệ thống không tạo trùng.`);

    const created = await call("resource/Purchase%20Receipt", {
      method: "POST",
      body: JSON.stringify({
        supplier, company, currency, posting_at: postingAt, supplier_invoice_no: supplierInvoiceNo,
        ...(driver ? { driver } : {}), items,
        note: `${marker} Nhập hàng trực tiếp từ NCC; không theo Purchase Order.`,
      }),
    });
    if (!created.ok) throw new Error(`Không tạo được phiếu nhập: ${(await created.text()).slice(0, 300)}`);
    const receipt = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
    if (!receipt) throw new Error("Nền tảng tạo phiếu nhập nhưng không trả mã chứng từ.");
    return answer({ ...result, doctype: "Purchase Receipt", name: receipt, purchase_receipt: receipt, draft: true, replayed: false });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không xử lý được nhập hàng trực tiếp." }, 422);
  }
}
