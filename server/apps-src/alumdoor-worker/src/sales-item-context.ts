/**
 * Read-only sales item context for the metadata-driven sales grids.
 *
 * Every read goes back through the platform callback with the caller identity. This method
 * does not reserve stock and does not replace the Delivery Note posting guard; it only lets
 * sales staff see the current answer before they promise it to a customer.
 */
export type SalesPlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

type Json = Record<string, unknown>;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

function truthy(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(String(value ?? "").trim().toLocaleLowerCase("vi"));
}

function positive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function readResource(call: SalesPlatformCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

async function listResources(
  call: SalesPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[],
  limit = 20,
): Promise<Json[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query.toString()}`);
  if (!response.ok) throw new Error(`Không tra được ${doctype} theo trường dữ liệu (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json[] }).data ?? [];
}

interface ItemPriceLookup {
  price: Json | null;
  name: string;
}

/**
 * Tên bản ghi là tối ưu, không phải nguồn sự thật duy nhất.
 *
 * Metadata cũ tạo Item Price theo `<bảng giá>:<mã hàng>`, metadata mới dùng thêm ĐVT. Dữ liệu
 * nhập tay hoặc đã migrate cũng có thể mang một tên khác. Chỉ dựa vào tên khiến một bản ghi có
 * đủ `price_list + item_code + uom` vẫn bị coi là không tồn tại, và child grid chỉ để trống giá.
 * Vì vậy giữ hai fast-path theo tên, rồi fallback bằng chính ba field nghiệp vụ.
 */
async function resolveItemPriceRecord(
  call: SalesPlatformCall,
  priceList: string,
  itemCode: string,
  selectedUom: string,
): Promise<ItemPriceLookup> {
  const exactName = `${priceList}:${itemCode}:${selectedUom}`;
  const legacyName = `${priceList}:${itemCode}`;
  const exact = await readResource(call, "Item Price", exactName);
  const legacy = await readResource(call, "Item Price", legacyName);
  const compatibleLegacy = legacy && String(legacy.uom ?? "").trim() === selectedUom ? legacy : null;

  if (exact && !truthy(exact.disabled)) return { price: exact, name: exactName };
  if (compatibleLegacy && !truthy(compatibleLegacy.disabled)) return { price: compatibleLegacy, name: legacyName };

  const rows = await listResources(
    call,
    "Item Price",
    ["name", "price_list", "item_code", "uom", "rate", "currency", "disabled"],
    [
      ["Item Price", "price_list", "=", priceList],
      ["Item Price", "item_code", "=", itemCode],
      ["Item Price", "uom", "=", selectedUom],
    ],
  );
  const matching = rows.filter((row) =>
    String(row.price_list ?? "").trim() === priceList
    && String(row.item_code ?? "").trim() === itemCode
    && String(row.uom ?? "").trim() === selectedUom);
  const active = matching.filter((row) => !truthy(row.disabled));
  if (active.length > 1) {
    throw new Error(`Có nhiều đơn giá đang hoạt động cho ${itemCode} · ${selectedUom} trong bảng giá ${priceList}.`);
  }
  if (active.length === 1) {
    const selected = active[0]!;
    return { price: selected, name: String(selected.name ?? exactName) };
  }

  const disabled = exact ?? compatibleLegacy ?? matching[0] ?? null;
  return {
    price: disabled,
    name: disabled
      ? String(disabled.name ?? (disabled === compatibleLegacy ? legacyName : exactName))
      : exactName,
  };
}

async function reportRows(call: SalesPlatformCall, reportName: string, filters: Json): Promise<Json[]> {
  const response = await call("method/frappe.desk.query_report.run", {
    method: "POST",
    body: JSON.stringify({ report_name: reportName, ignore_prepared_report: 1, filters }),
  });
  if (!response.ok) throw new Error(`Không đọc được báo cáo ${reportName} (HTTP ${response.status}).`);
  const payload = await response.json() as {
    message?: { result?: Json[] } | Json[];
    result?: Json[];
  };
  if (Array.isArray(payload.message)) return payload.message;
  return payload.message?.result ?? payload.result ?? [];
}

function quantityFromRow(row: Json): number {
  for (const key of ["actual_qty", "balance_qty", "closing_qty", "stock_qty", "qty"]) {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function cleanNumber(value: number): string {
  return Number(value.toFixed(6)).toLocaleString("vi-VN", { maximumFractionDigits: 6 });
}

export async function salesItemContext(call: SalesPlatformCall, args: Json): Promise<Response> {
  const itemCode = String(args.item_code ?? "").trim();
  if (!itemCode) return json({ message: "Cần chọn mặt hàng bán." }, 422);

  const item = await readResource(call, "Item", itemCode);
  if (!item || truthy(item.disabled) || item.is_sales_item === 0 || item.is_sales_item === false) {
    return json({ message: `Mặt hàng ${itemCode} không tồn tại, đã ngừng dùng hoặc không được phép bán.` }, 422);
  }

  const stockUom = String(item.stock_uom ?? "").trim();
  const defaultSalesUom = String(item.default_sales_uom ?? "").trim() || stockUom;
  const conversions = Array.isArray(item.uom_conversions)
    ? item.uom_conversions.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  const factorByUom = new Map<string, number>();
  if (stockUom) factorByUom.set(stockUom, 1);
  for (const row of conversions) {
    const uom = String(row.uom ?? "").trim();
    const factor = positive(row.conversion_factor);
    if (uom && factor) factorByUom.set(uom, factor);
  }
  if (defaultSalesUom && !factorByUom.has(defaultSalesUom) && defaultSalesUom === stockUom) {
    factorByUom.set(defaultSalesUom, 1);
  }
  const allowedUoms = [...factorByUom.keys()];
  const selectedUom = String(args.uom ?? "").trim() || defaultSalesUom || stockUom;
  if (!selectedUom || !factorByUom.has(selectedUom)) {
    return json({
      message: `ĐVT "${selectedUom || "(trống)"}" chưa được khai trên mặt hàng ${itemCode}.`,
      allowed_uoms: allowedUoms,
    }, 422);
  }
  const conversionFactor = factorByUom.get(selectedUom) ?? 1;

  const priceList = String(args.price_list ?? "").trim();
  const documentCurrency = String(args.currency ?? item.currency ?? "VND").trim() || "VND";
  let rate: number | null = null;
  let currency = documentCurrency;
  let itemPrice: string | null = null;
  let priceMissing = false;
  let priceError: string | null = null;
  if (priceList) {
    const expectedName = `${priceList}:${itemCode}:${selectedUom}`;
    try {
      const lookup = await resolveItemPriceRecord(call, priceList, itemCode, selectedUom);
      const price = lookup.price;
      itemPrice = lookup.name;
      if (price && !truthy(price.disabled)) {
        const priceCurrency = String(price.currency ?? "").trim();
        const parsed = Number(price.rate);
        currency = priceCurrency || documentCurrency;
        if (!priceCurrency) {
          priceMissing = true;
          priceError = `Đơn giá ${selectedUom} chưa khai tiền tệ.`;
        } else if (priceCurrency !== documentCurrency) {
          priceMissing = true;
          priceError = `Giá ${selectedUom} dùng ${priceCurrency}, chứng từ dùng ${documentCurrency}.`;
        } else if (!Number.isFinite(parsed) || parsed < 0) {
          priceMissing = true;
          priceError = `Đơn giá ${selectedUom} không hợp lệ.`;
        } else {
          rate = parsed;
        }
      } else {
        priceMissing = true;
        if (price && truthy(price.disabled)) priceError = `Giá ${selectedUom} đã ngừng áp dụng.`;
        itemPrice = itemPrice || expectedName;
      }
    } catch (error) {
      priceMissing = true;
      priceError = error instanceof Error ? error.message : `Không tra được đơn giá ${selectedUom}.`;
      itemPrice = expectedName;
    }
  } else {
    const standard = Number(item.standard_rate);
    if (Number.isFinite(standard) && standard >= 0) rate = standard;
  }

  const managedStock = !(item.is_stock_item === 0 || item.is_stock_item === false || String(item.item_nature ?? "") === "Dịch vụ");
  const warehouse = String(args.warehouse ?? item.default_warehouse ?? "").trim();
  let availableStockQty: number | null = null;
  let availableQty: number | null = null;
  let stockStatus = "Không quản lý tồn";
  let stockReadError: string | null = null;
  if (managedStock) {
    if (!warehouse) {
      stockStatus = "Chưa chọn kho";
    } else {
      try {
        const rows = await reportRows(call, "Stock Balance", { item_code: itemCode, warehouse });
        availableStockQty = rows
          .filter((row) => (!row.item_code || String(row.item_code) === itemCode)
            && (!row.warehouse || String(row.warehouse) === warehouse))
          .reduce((sum, row) => sum + quantityFromRow(row), 0);
        availableQty = availableStockQty / conversionFactor;
        stockStatus = availableStockQty > 0
          ? `Còn ${cleanNumber(availableQty)} ${selectedUom}`
          : "Hết hàng";
      } catch (error) {
        stockReadError = error instanceof Error ? error.message : "Không đọc được tồn kho.";
        stockStatus = "Không đọc được tồn";
      }
    }
  }

  const priceStatus = priceList
    ? (priceError ?? (priceMissing ? `Chưa khai giá ${selectedUom}` : `Giá ${selectedUom}: ${cleanNumber(rate ?? 0)} ${currency}`))
    : "Giá nhập tay";

  return json({
    item_code: itemCode,
    selected_uom: selectedUom,
    allowed_uoms: allowedUoms,
    uom_options: allowedUoms.map((uom) => ({ uom, conversion_factor: factorByUom.get(uom) })),
    conversion_factor: conversionFactor,
    stock_uom: stockUom,
    warehouse: warehouse || null,
    managed_stock: managedStock,
    available_stock_qty: availableStockQty,
    available_qty: availableQty,
    availability_status: [stockStatus, priceStatus].filter(Boolean).join(" · "),
    rate,
    currency,
    item_price: itemPrice,
    price_missing: priceMissing,
    price_error: priceError,
    stock_read_error: stockReadError,
  });
}
