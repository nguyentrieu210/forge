/**
 * Read-only sales item context for the spreadsheet sales surface.
 *
 * This endpoint resolves the commercial facts that React must not guess: sales UOM, price list,
 * item price, pricing rule, measurement requirements, calculation mode and the preview amount.
 * Physical door geometry still belongs to sales-production / Cutting Policy; the client passes
 * the worker-computed billable area back here only so all money follows one server-owned path.
 */
export type SalesPlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

type Json = Record<string, unknown>;
type CalculationMode = "QUANTITY" | "HEIGHT" | "WIDTH" | "AREA";

const ALUMDOOR_BASE_PRICE_LIST = "Giá niêm yết";

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

function normalizedText(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalizedKey(value: unknown): string {
  return normalizedText(value).toLocaleLowerCase("vi");
}

function sameText(left: unknown, right: unknown): boolean {
  return normalizedText(left) === normalizedText(right);
}

function canonicalCustomerGroup(value: unknown): string {
  const raw = normalizedText(value);
  const key = normalizedKey(raw);
  if (!key) return "";
  if (key.includes("đại lý") || key.includes("dai ly") || key.includes("dealer")) return "Đại lý";
  if (key === "lẻ" || key.includes("khách lẻ") || key.includes("khach le")
    || key.includes("bán lẻ") || key.includes("ban le") || key.includes("retail")
    || key.includes("công trình") || key.includes("cong trinh")
    || key.includes("nhà thầu") || key.includes("nha thau")) return "Lẻ";
  return raw;
}

function isSquareMetre(value: string): boolean {
  return ["m2", "m²", "sqm"].includes(normalizedKey(value));
}

function isSetUom(value: string): boolean {
  return ["bộ", "bo", "set"].includes(normalizedKey(value));
}

function isGermanDoor(doorType: unknown, itemGroup: unknown): boolean {
  return normalizedKey(doorType).includes("đức") || normalizedKey(itemGroup).includes("đức");
}

function calculationMode(item: Json): { mode: CalculationMode; error: string | null } {
  const code = normalizedText(item.item_code ?? item.name).toLocaleUpperCase("vi");
  const group = normalizedKey(item.item_group);
  const inventory = normalizedText(item.inventory_mode);
  if (inventory === "Thành phẩm theo m2" || normalizedText(item.door_type)) return { mode: "AREA", error: null };
  // Prefix is the canonical discriminator for ray / shaft. Check TRUC first so the legacy
  // combined group "Ray và trục" can never turn a shaft into a HEIGHT line.
  if (code.startsWith("TRUC-")) return { mode: "WIDTH", error: null };
  if (code.startsWith("RAY-")) return { mode: "HEIGHT", error: null };
  const hasRay = group.includes("ray");
  const hasShaft = group.includes("trục") || group.includes("truc");
  if (hasShaft && !hasRay) return { mode: "WIDTH", error: null };
  if (hasRay && !hasShaft) return { mode: "HEIGHT", error: null };
  if (hasRay && hasShaft) {
    return {
      mode: "QUANTITY",
      error: `${code || "Mặt hàng"}: nhóm hàng chứa cả Ray và Trục nhưng mã chưa theo chuẩn RAY-/TRUC-; không thể tự đoán công thức.`,
    };
  }
  return { mode: "QUANTITY", error: null };
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
  // Older callback mocks / old deployments exposed only single-record reads. Exact record
  // resolution stays usable there; list fallback simply becomes unavailable.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Không tra được ${doctype} theo trường dữ liệu (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json[] }).data ?? [];
}

interface ItemPriceLookup {
  price: Json | null;
  name: string;
}

async function resolveItemPriceRecord(
  call: SalesPlatformCall,
  priceList: string,
  itemCode: string,
  selectedUom: string,
): Promise<ItemPriceLookup> {
  const exactName = `${priceList}:${itemCode}:${selectedUom}`;
  const legacyName = `${priceList}:${itemCode}`;

  const legacy = await readResource(call, "Item Price", legacyName);
  const compatibleLegacy = legacy && sameText(legacy.uom, selectedUom) ? legacy : null;
  if (compatibleLegacy && !truthy(compatibleLegacy.disabled)) return { price: compatibleLegacy, name: legacyName };

  let exact: Json | null = null;
  let exactReadError: Error | null = null;
  try {
    exact = await readResource(call, "Item Price", exactName);
  } catch (error) {
    exactReadError = error instanceof Error ? error : new Error(String(error));
  }
  if (exact && !truthy(exact.disabled)) return { price: exact, name: exactName };

  let rows: Json[];
  try {
    rows = await listResources(
      call,
      "Item Price",
      ["name", "price_list", "item_code", "uom", "rate", "currency", "disabled"],
      [
        ["Item Price", "price_list", "=", priceList],
        ["Item Price", "item_code", "=", itemCode],
      ],
      100,
    );
  } catch (error) {
    throw exactReadError ?? error;
  }
  const matching = rows.filter((row) => sameText(row.price_list, priceList)
    && sameText(row.item_code, itemCode) && sameText(row.uom, selectedUom));
  const active = matching.filter((row) => !truthy(row.disabled));
  if (active.length > 1) throw new Error(`Có nhiều đơn giá đang hoạt động cho ${itemCode} · ${selectedUom} trong bảng giá ${priceList}.`);
  if (active.length === 1) {
    const selected = active[0]!;
    return { price: selected, name: normalizedText(selected.name) || exactName };
  }

  const disabled = compatibleLegacy ?? exact ?? matching[0] ?? null;
  if (!disabled && exactReadError) throw exactReadError;
  return {
    price: disabled,
    name: disabled ? normalizedText(disabled.name) || (disabled === compatibleLegacy ? legacyName : exactName) : exactName,
  };
}

async function discoverSinglePriceList(call: SalesPlatformCall, itemCode: string, selectedUom: string): Promise<string> {
  const rows = await listResources(
    call,
    "Item Price",
    ["name", "price_list", "item_code", "uom", "disabled"],
    [["Item Price", "item_code", "=", itemCode]],
    200,
  );
  const names = [...new Set(rows
    .filter((row) => !truthy(row.disabled) && sameText(row.item_code, itemCode) && sameText(row.uom, selectedUom))
    .map((row) => normalizedText(row.price_list)).filter(Boolean))];
  return names.length === 1 ? names[0]! : "";
}

function ruleMatches(rule: Json, input: {
  priceList: string; itemCode: string; customer: string; customerGroup: string; postingDate: string; qty: number;
}): boolean {
  if (truthy(rule.disabled)) return false;
  if (normalizedText(rule.price_list) && !sameText(rule.price_list, input.priceList)) return false;
  if (normalizedText(rule.item_code) && !sameText(rule.item_code, input.itemCode)) return false;
  if (normalizedText(rule.party_type) && normalizedText(rule.party_type) !== "Customer") return false;
  if (normalizedText(rule.party) && !sameText(rule.party, input.customer)) return false;
  if (normalizedText(rule.customer_group) && !sameText(canonicalCustomerGroup(rule.customer_group), input.customerGroup)) return false;
  const date = input.postingDate.slice(0, 10);
  if (normalizedText(rule.valid_from) && date < normalizedText(rule.valid_from).slice(0, 10)) return false;
  if (normalizedText(rule.valid_upto) && date > normalizedText(rule.valid_upto).slice(0, 10)) return false;
  const min = rule.min_qty == null || rule.min_qty === "" ? 0 : Number(rule.min_qty);
  const max = rule.max_qty == null || rule.max_qty === "" ? Number.POSITIVE_INFINITY : Number(rule.max_qty);
  return Number.isFinite(min) && Number.isFinite(max) && input.qty >= min && input.qty <= max;
}

function ruleScore(rule: Json): number {
  return (Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0) * 100
    + (normalizedText(rule.party) ? 20 : 0)
    + (normalizedText(rule.item_code) ? 10 : 0)
    + (normalizedText(rule.customer_group) ? 5 : 0);
}

async function resolvePreviewRule(call: SalesPlatformCall, input: {
  priceList: string; itemCode: string; customer: string; customerGroup: string; postingDate: string; qty: number;
}): Promise<Json | null> {
  const rows = await listResources(call, "Pricing Rule", [
    "name", "price_list", "item_code", "party_type", "party", "customer_group", "min_qty", "max_qty",
    "valid_from", "valid_upto", "rate", "discount_percentage", "priority", "disabled",
  ], [], 500);
  return rows.filter((row) => ruleMatches(row, input))
    .sort((left, right) => ruleScore(right) - ruleScore(left) || normalizedText(left.name).localeCompare(normalizedText(right.name)))[0] ?? null;
}

async function reportRows(call: SalesPlatformCall, reportName: string, filters: Json): Promise<Json[]> {
  const response = await call("method/frappe.desk.query_report.run", {
    method: "POST",
    body: JSON.stringify({ report_name: reportName, ignore_prepared_report: 1, filters }),
  });
  if (!response.ok) throw new Error(`Không đọc được báo cáo ${reportName} (HTTP ${response.status}).`);
  const payload = await response.json() as { message?: { result?: Json[] } | Json[]; result?: Json[] };
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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function salesItemContext(call: SalesPlatformCall, args: Json): Promise<Response> {
  try {
    const itemCode = normalizedText(args.item_code);
    if (!itemCode) return json({ message: "Cần chọn mặt hàng bán." }, 422);

    const item = await readResource(call, "Item", itemCode);
    if (!item) return json({ message: `Không tìm thấy mặt hàng ${itemCode}.` }, 422);
    if (truthy(item.disabled) || item.is_sales_item === 0 || item.is_sales_item === false) {
      return json({ message: `Mặt hàng ${itemCode} đã ngừng dùng hoặc không được phép bán.` }, 422);
    }

    const inventoryMode = normalizedText(item.inventory_mode);
    const itemMode = calculationMode({ ...item, item_code: itemCode });
    const stockUom = normalizedText(item.stock_uom);
    const defaultSalesUom = normalizedText(item.default_sales_uom) || stockUom;
    const conversions = Array.isArray(item.uom_conversions)
      ? item.uom_conversions.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
      : [];
    const factorByUom = new Map<string, number>();
    if (stockUom) factorByUom.set(stockUom, 1);
    for (const row of conversions) {
      const uom = normalizedText(row.uom);
      const factor = positive(row.conversion_factor);
      if (uom && factor) factorByUom.set(uom, factor);
    }
    const selectedUom = normalizedText(args.uom) || defaultSalesUom || stockUom;
    const dynamicSquareMetreToSet = inventoryMode === "Thành phẩm theo m2" && isSquareMetre(selectedUom) && isSetUom(stockUom);
    if (defaultSalesUom && !factorByUom.has(defaultSalesUom) && defaultSalesUom === stockUom) factorByUom.set(defaultSalesUom, 1);
    const allowedUoms = [...factorByUom.keys()];
    if (dynamicSquareMetreToSet && selectedUom && !allowedUoms.includes(selectedUom)) allowedUoms.push(selectedUom);
    if (!selectedUom || (!factorByUom.has(selectedUom) && !dynamicSquareMetreToSet)) {
      return json({
        message: `ĐVT "${selectedUom || "(trống)"}" chưa được khai trên mặt hàng ${itemCode}.`,
        allowed_uoms: allowedUoms,
      }, 422);
    }
    const conversionFactor = dynamicSquareMetreToSet ? null : factorByUom.get(selectedUom) ?? 1;

    const customerName = normalizedText(args.customer);
    const customer = customerName ? await readResource(call, "Customer", customerName) : null;
    if (customerName && !customer) return json({ message: `Không tìm thấy khách hàng ${customerName}.` }, 422);
    const customerGroup = canonicalCustomerGroup(args.customer_group ?? customer?.price_group ?? customer?.customer_group);

    const companyName = normalizedText(args.company);
    const company = companyName ? await readResource(call, "Company", companyName) : null;
    if (companyName && !company) return json({ message: `Không tìm thấy công ty ${companyName}.` }, 422);
    const documentCurrency = normalizedText(args.currency ?? company?.default_currency ?? item.currency ?? "VND") || "VND";

    const preferredPriceList = normalizedText(args.price_list
      ?? customer?.default_price_list ?? customer?.selling_price_list ?? customer?.price_list);
    let priceList = preferredPriceList || ALUMDOOR_BASE_PRICE_LIST;
    let lookup = await resolveItemPriceRecord(call, priceList, itemCode, selectedUom);
    if (!preferredPriceList && !lookup.price) {
      const discovered = await discoverSinglePriceList(call, itemCode, selectedUom).catch(() => "");
      if (discovered) {
        priceList = discovered;
        lookup = await resolveItemPriceRecord(call, priceList, itemCode, selectedUom);
      }
    }

    let rate: number | null = null;
    let currency = documentCurrency;
    let itemPrice: string | null = lookup.name || null;
    let priceMissing = false;
    let priceError: string | null = null;
    const price = lookup.price;
    if (price && !truthy(price.disabled)) {
      const priceCurrency = normalizedText(price.currency);
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
      priceError = price && truthy(price.disabled)
        ? `Giá ${selectedUom} trong ${priceList} đã ngừng áp dụng.`
        : `Chưa khai Item Price cho ${itemCode} · ${selectedUom} trong bảng giá ${priceList}.`;
    }

    const quantity = positive(args.quantity ?? args.qty ?? args.set_count) ?? null;
    const height = positive(args.height_m);
    const width = positive(args.width_m);
    const billableArea = positive(args.billable_area_sqm);
    let billableQty: number | null = null;
    if (quantity) {
      if (itemMode.mode === "AREA") billableQty = billableArea;
      else if (itemMode.mode === "HEIGHT") billableQty = height ? height * quantity : null;
      else if (itemMode.mode === "WIDTH") billableQty = width ? width * quantity : null;
      else billableQty = quantity;
    }

    const postingDate = normalizedText(args.transaction_date) || new Date().toISOString().slice(0, 10);
    let pricingRule: Json | null = null;
    if (rate != null) {
      pricingRule = await resolvePreviewRule(call, {
        priceList, itemCode, customer: customerName, customerGroup, postingDate, qty: billableQty ?? quantity ?? 0,
      }).catch(() => null);
      if (pricingRule?.rate != null && pricingRule.rate !== "") {
        const ruled = Number(pricingRule.rate);
        if (Number.isFinite(ruled) && ruled >= 0) rate = ruled;
      }
    }

    const ruleDiscount = pricingRule?.discount_percentage == null || pricingRule.discount_percentage === ""
      ? null : Number(pricingRule.discount_percentage);
    const requestedDiscount = args.discount_percentage == null || args.discount_percentage === ""
      ? null : Number(args.discount_percentage);
    const defaultDiscount = isGermanDoor(item.door_type, item.item_group) ? 15 : null;
    let discountPercentage = pricingRule
      ? (Number.isFinite(ruleDiscount) && ruleDiscount! >= 0 && ruleDiscount! <= 100 ? ruleDiscount : null)
      : (Number.isFinite(requestedDiscount) && requestedDiscount! >= 0 && requestedDiscount! <= 100
        ? requestedDiscount : defaultDiscount);
    if (discountPercentage != null && (!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100)) {
      discountPercentage = null;
    }

    const grossAmount = rate != null && billableQty != null ? roundMoney(rate * billableQty) : null;
    const discountAmount = grossAmount != null && discountPercentage != null
      ? roundMoney(grossAmount * discountPercentage / 100) : 0;
    const netAmount = grossAmount == null ? null : roundMoney(grossAmount - discountAmount);

    const profileName = normalizedText(item.measurement_profile);
    const specificationName = normalizedText(item.material_specification);
    const [profile, specification] = await Promise.all([
      profileName ? readResource(call, "Measurement Profile", profileName).catch(() => null) : Promise.resolve(null),
      specificationName ? readResource(call, "Material Specification", specificationName).catch(() => null) : Promise.resolve(null),
    ]);
    const thickness = positive(specification?.thickness_mm);

    const managedStock = !(item.is_stock_item === 0 || item.is_stock_item === false || normalizedText(item.item_nature) === "Dịch vụ");
    const warehouse = normalizedText(args.warehouse ?? item.default_warehouse);
    let availableStockQty: number | null = null;
    let availableQty: number | null = null;
    let stockStatus = "Không quản lý tồn";
    let stockReadError: string | null = null;
    if (managedStock) {
      if (dynamicSquareMetreToSet) {
        stockStatus = "Tồn cửa kiểm theo cấu hình/BOM";
      } else if (!warehouse) {
        stockStatus = "Chưa chọn kho";
      } else {
        try {
          const rows = await reportRows(call, "Stock Balance", { item_code: itemCode, warehouse });
          availableStockQty = rows
            .filter((row) => (!row.item_code || sameText(row.item_code, itemCode))
              && (!row.warehouse || sameText(row.warehouse, warehouse)))
            .reduce((sum, row) => sum + quantityFromRow(row), 0);
          availableQty = availableStockQty / (conversionFactor ?? 1);
          stockStatus = availableStockQty > 0 ? `Còn ${cleanNumber(availableQty)} ${selectedUom}` : "Hết hàng";
        } catch (error) {
          stockReadError = error instanceof Error ? error.message : "Không đọc được tồn kho.";
          stockStatus = "Không đọc được tồn";
        }
      }
    }

    const priceStatus = priceError ?? (priceMissing ? `Chưa khai giá ${selectedUom}` : `Giá ${selectedUom}: ${cleanNumber(rate ?? 0)} ${currency}`);
    return json({
      item_code: itemCode,
      item_name: normalizedText(item.item_name) || itemCode,
      item_group: normalizedText(item.item_group),
      door_type: normalizedText(item.door_type) || null,
      inventory_mode: inventoryMode,
      calculation_mode: itemMode.mode,
      calculation_error: itemMode.error,
      measurement_profile: profileName || null,
      require_color: truthy(profile?.require_color),
      default_color: normalizedText(item.default_color) || null,
      thickness_mm: thickness,
      fixed_thickness: thickness != null,
      min_area_sqm: Number(item.min_area_sqm ?? 0) || 0,
      purchase_kg_per_m2: positive(item.purchase_kg_per_m2),
      leaf_divisor_m: positive(item.leaf_divisor_m),
      customer_group: customerGroup || null,
      price_list: priceList || null,
      selected_uom: selectedUom,
      allowed_uoms: allowedUoms,
      uom_options: allowedUoms.map((uom) => ({ uom, conversion_factor: dynamicSquareMetreToSet && uom === selectedUom ? null : factorByUom.get(uom) })),
      conversion_factor: conversionFactor,
      dynamic_uom: dynamicSquareMetreToSet,
      stock_uom: stockUom,
      warehouse: warehouse || null,
      managed_stock: managedStock,
      available_stock_qty: availableStockQty,
      available_qty: availableQty,
      availability_status: [stockStatus, priceStatus].filter(Boolean).join(" · "),
      rate,
      effective_rate: rate == null ? null : roundMoney(rate * (1 - Number(discountPercentage ?? 0) / 100)),
      currency,
      item_price: itemPrice,
      pricing_rule: normalizedText(pricingRule?.name) || null,
      discount_percentage: discountPercentage,
      default_discount_percentage: defaultDiscount,
      billable_qty: billableQty,
      gross_amount: grossAmount,
      discount_amount: discountPercentage == null ? null : discountAmount,
      net_amount: netAmount,
      price_missing: priceMissing,
      price_error: priceError,
      stock_read_error: stockReadError,
    });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "Không đọc được ngữ cảnh bán hàng." }, 422);
  }
}
