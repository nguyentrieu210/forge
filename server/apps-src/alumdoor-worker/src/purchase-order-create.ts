type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

export interface PurchaseOrderCreateEnv {
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

function percentage(value: unknown, label: string): number {
  if (value === undefined || value === null || value === "") return 0;
  const result = number(value, label);
  if (result < 0 || result > 100) throw new Error(`${label} phải từ 0 đến 100.`);
  return result;
}

function booleanFlag(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = text(value).toLocaleLowerCase("vi");
  return ["1", "true", "yes", "y", "có", "co"].includes(normalized);
}

function normalizedUom(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function platformCaller(request: Request, env: PurchaseOrderCreateEnv): PlatformCall {
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
      headers: {
        "content-type": "application/json",
        ...forwarded,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

async function readList<T extends Json>(
  call: PlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 3,
): Promise<T[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query.toString()}`);
  if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
  const body = await response.json() as { data?: T[] };
  return Array.isArray(body.data) ? body.data : [];
}

function standardConversion(item: ItemDoc, uom: string, qty: number, line: string): { conversion_factor: number; stock_qty: number } {
  const stockUom = text(item.stock_uom);
  if (!stockUom) throw new Error(`${line}: Item chưa có ĐVT tồn.`);
  if (uom === stockUom) return { conversion_factor: 1, stock_qty: qty };
  const conversion = (item.uom_conversions ?? []).find((entry) => text(entry?.uom) === uom);
  const factor = Number(conversion?.conversion_factor);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`${line}: ${uom} khác ĐVT tồn ${stockUom} nhưng Item chưa có hệ số quy đổi.`);
  }
  return { conversion_factor: factor, stock_qty: qty * factor };
}

function assertPurchaseItem(item: ItemDoc, itemCode: string, line: string): void {
  if (booleanFlag(item.disabled)) throw new Error(`${line}: ${itemCode} đã bị khóa và không được dùng trong giao dịch.`);
  if (item.is_purchase_item !== undefined && !booleanFlag(item.is_purchase_item)) {
    throw new Error(`${line}: ${itemCode} không được đánh dấu là mặt hàng mua.`);
  }
}

function allowedItemColors(item: ItemDoc): string[] | undefined {
  if (!Array.isArray(item.allowed_colors)) return undefined;
  return item.allowed_colors.map((entry) => text(entry?.color)).filter(Boolean);
}

async function normalizeLine(call: PlatformCall, raw: unknown, index: number): Promise<Json> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Dòng ${index + 1} không hợp lệ.`);
  const input = raw as Json;
  const itemCode = text(input.item_code);
  const line = `Dòng ${index + 1}${itemCode ? ` (${itemCode})` : ""}`;
  if (!itemCode) throw new Error(`${line}: cần Mã sản phẩm.`);

  const item = await readDoc<ItemDoc>(call, "Item", itemCode);
  assertPurchaseItem(item, itemCode, line);
  const mode = text(item.inventory_mode) || "Hàng thường";
  const stockUom = text(item.stock_uom);
  const rate = nonNegative(input.rate, `${line}: Đơn giá`);
  const color = text(input.color);
  const configuredColors = allowedItemColors(item);
  if (color && configuredColors && !configuredColors.includes(color)) {
    throw new Error(`${line}: màu ${color} không thuộc danh sách màu được phép của ${itemCode}.`);
  }

  const base: Json = {
    item_code: itemCode,
    ...(text(item.item_name) ? { item_name: text(item.item_name) } : {}),
    inventory_mode: mode,
    ...(text(item.measurement_profile) ? { measurement_profile: text(item.measurement_profile) } : {}),
    ...(stockUom ? { stock_uom: stockUom } : {}),
    ...(Number.isFinite(Number(item.min_area_sqm)) ? { min_area_sqm: Number(item.min_area_sqm) } : {}),
    rate,
    ...(color ? { color } : {}),
    ...(text(input.so_no) ? { so_no: text(input.so_no) } : {}),
    ...(text(input.warehouse) ? { warehouse: text(input.warehouse) } : {}),
    ...(text(input.note) ? { note: text(input.note) } : {}),
  };

  for (const field of ["width_m", "height_m", "set_count", "qty_bundle"] as const) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== "") base[field] = number(input[field], `${line}: ${field}`);
  }

  if (mode === "Nhôm cây/lá") {
    if (!color) throw new Error(`${line}: cần Màu.`);
    if (configuredColors && configuredColors.length === 0) throw new Error(`${line}: Item chưa khai màu được phép.`);
    const length = positive(input.length_m, `${line}: Kích thước/chiều dài`);
    const bars = positive(input.qty_bar, `${line}: Số cây/lá`);
    const stamped = text(input.is_stamped) || "Không";
    if (stamped !== "Có" && stamped !== "Không") throw new Error(`${line}: Dập chỉ nhận Có hoặc Không.`);

    const specificationName = text(item.material_specification);
    if (!specificationName) throw new Error(`${line}: Item chưa có Quy cách định mức.`);
    const specification = await readDoc<Json>(call, "Material Specification", specificationName);
    const kgPerM = positive(specification.theoretical_kg_per_m, `${line}: Trọng lượng định mức kg/m`);
    const qty = length * kgPerM * bars;
    const totalLength = length * bars;
    const amount = qty * rate;
    const stockIsKg = normalizedUom(stockUom) === "kg";

    return {
      ...base,
      color,
      length_m: length,
      qty_bar: bars,
      material_specification: specificationName,
      theoretical_kg_per_m: kgPerM,
      theoretical_kg: qty,
      total_length_m: totalLength,
      is_stamped: stamped,
      uom: "Kg",
      qty,
      amount,
      conversion_factor: stockIsKg ? 1 : bars / qty,
      stock_qty: stockIsKg ? qty : bars,
    };
  }

  const uom = text(input.uom) || text(item.default_purchase_uom) || text(item.purchase_uom) || stockUom;
  if (!uom) throw new Error(`${line}: Item chưa có ĐVT mua hoặc ĐVT tồn.`);
  let qty: number;
  let conversion: { conversion_factor: number; stock_qty: number };

  const selected = normalizedUom(uom);
  const stockSelected = normalizedUom(stockUom);
  const squareMetreToSet = mode === "Thành phẩm theo m2"
    && ["m2", "m²", "sqm"].includes(selected)
    && ["bộ", "bo", "set"].includes(stockSelected);

  if (mode === "Thành phẩm theo m2" && ["m2", "m²", "sqm"].includes(selected)) {
    const width = positive(input.width_m, `${line}: Rộng`);
    const height = positive(input.height_m, `${line}: Cao`);
    const sets = positive(input.set_count ?? 1, `${line}: Số bộ`);
    qty = Math.max(width * height, Number(item.min_area_sqm ?? 0) || 0) * sets;
    base.width_m = width;
    base.height_m = height;
    base.set_count = sets;
    conversion = squareMetreToSet
      ? { conversion_factor: sets / qty, stock_qty: sets }
      : standardConversion(item, uom, qty, line);
  } else {
    qty = positive(input.qty, `${line}: Số lượng`);
    conversion = standardConversion(item, uom, qty, line);
  }

  return {
    ...base,
    uom,
    qty,
    amount: qty * rate,
    conversion_factor: conversion.conversion_factor,
    stock_qty: conversion.stock_qty,
  };
}

async function resolveCompanyAndCurrency(call: PlatformCall, args: Json): Promise<{ company: string; currency: string }> {
  const company = text(args.company);
  if (!company) {
    throw new Error("Cần chọn Công ty trong ngữ cảnh làm việc trước khi tạo đơn mua.");
  }
  const companyDoc = await readDoc<CompanyDoc>(call, "Company", company);
  const currency = text(args.currency) || text(companyDoc.default_currency);
  if (!currency) throw new Error(`Công ty ${company} chưa có tiền tệ mặc định.`);
  return { company, currency };
}

async function resolveVatAccount(call: PlatformCall, args: Json, company: string): Promise<string> {
  const explicit = text(args.vat_account);
  if (explicit) return explicit;
  const accounts = await readList<Json>(call, "Account", ["name"], [
    ["Account", "company", "=", company],
    ["Account", "account_type", "=", "Tax"],
    ["Account", "root_type", "=", "Asset"],
    ["Account", "is_group", "=", 0],
  ], 3);
  const names = accounts.map((row) => text(row.name)).filter(Boolean);
  if (names.length !== 1) {
    throw new Error(`VAT cần đúng một tài khoản thuế mua kiểu Tax/Asset cho ${company}; hiện tìm thấy ${names.length}. Hãy cấu hình tài khoản VAT mua trong metadata/ngữ cảnh.`);
  }
  return names[0]!;
}

export async function handlePurchaseOrderCreate(request: Request, env: PurchaseOrderCreateEnv): Promise<Response> {
  const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

  try {
    if (!request.headers.get("x-cloudforge-tenant")) return answer({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const args = body.args ?? {};
    const supplier = text(args.supplier);
    if (!supplier) throw new Error("Cần chọn Nhà cung cấp.");
    if (!Array.isArray(args.items) || !args.items.length) throw new Error("Cần ít nhất một dòng hàng.");
    if (args.items.length > MAX_LINES) throw new Error(`Mỗi đơn mua chỉ nhập tối đa ${MAX_LINES} dòng.`);

    const discountPercentage = percentage(args.additional_discount_percentage, "Chiết khấu (%)");
    const vatPercentage = percentage(args.vat_percentage, "VAT (%)");
    const call = platformCaller(request, env);
    const { company, currency } = await resolveCompanyAndCurrency(call, args);
    const items = await Promise.all(args.items.map((row, index) => normalizeLine(call, row, index)));
    const transactionDate = text(args.transaction_date) || new Date().toISOString().slice(0, 10);
    const subtotal = items.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const discountAmount = subtotal * discountPercentage / 100;
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const vatAmount = afterDiscount * vatPercentage / 100;
    const estimatedGrandTotal = afterDiscount + vatAmount;
    const taxes = vatPercentage > 0
      ? [{
          row_id: "VAT",
          account: await resolveVatAccount(call, args, company),
          rate: vatPercentage,
          charge_type: "On Net Total",
          add_deduct_tax: "Add",
        }]
      : [];

    const document: Json = {
      supplier,
      company,
      currency,
      transaction_date: transactionDate,
      items,
      apply_discount_on: "Net Total",
      additional_discount_percentage: discountPercentage,
      ...(taxes.length ? { taxes } : {}),
      ...(text(args.schedule_date) ? { schedule_date: text(args.schedule_date) } : {}),
    };

    const created = await call("resource/Purchase%20Order", {
      method: "POST",
      body: JSON.stringify(document),
    });
    if (!created.ok) throw new Error(`Không tạo được đơn mua: ${(await created.text()).slice(0, 240)}`);
    const data = ((await created.json()) as { data?: { name?: string; grand_total?: number | string; discount_amount?: number | string; total_taxes_and_charges?: number | string } }).data ?? {};
    const name = text(data.name);
    return answer({
      doctype: "Purchase Order",
      name,
      draft: true,
      line_count: items.length,
      subtotal,
      additional_discount_percentage: discountPercentage,
      discount_amount: Number(data.discount_amount ?? discountAmount),
      vat_percentage: vatPercentage,
      total_taxes_and_charges: Number(data.total_taxes_and_charges ?? vatAmount),
      grand_total: Number(data.grand_total ?? estimatedGrandTotal),
      message: name ? `Đã tạo đơn mua nháp ${name}.` : "Đã tạo đơn mua nháp.",
    });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không tạo được đơn mua." }, 422);
  }
}
