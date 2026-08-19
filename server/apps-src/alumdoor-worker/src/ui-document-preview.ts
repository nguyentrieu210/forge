type Json = Record<string, unknown>;
export type DocumentPreviewCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

const ALUMDOOR_SELLING_PRICE_LIST = "ALUMDOOR-SELLING";
const STANDARD_PRICE_VARIANT = "STANDARD";

const answer = (value: Json, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});
const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundMoney = (value: number) => Math.round(Number.isFinite(value) ? value : 0);
const disabled = (value: unknown) => value === true || value === 1 || value === "1"
  || ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));

async function readDoc(call: DocumentPreviewCall, doctype: string, name: string): Promise<Json | null> {
  if (!name) return null;
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

async function listDocs(
  call: DocumentPreviewCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 500,
): Promise<Json[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json[] }).data ?? [];
}

function totals(doc: Json): Json {
  const rows = Array.isArray(doc.items) ? doc.items.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
  const subtotal = roundMoney(rows.reduce((sum, row) => {
    const amount = Number(row.amount);
    if (Number.isFinite(amount)) return sum + amount;
    return sum + number(row.qty) * number(row.rate);
  }, 0));
  const discount = roundMoney(rows.reduce((sum, row) => sum + Math.max(0, number(row.discount_amount)), 0));
  // Commercial preview owns line-level policy adjustments. Rebuild the document
  // surcharge from those canonical results; `doc.surcharge_amount` is only a
  // compatibility fallback for older documents that do not carry the line field.
  const hasLineAdjustments = rows.some((row) => row.adjustment_amount !== undefined && row.adjustment_amount !== null && row.adjustment_amount !== "");
  const surcharge = roundMoney(hasLineAdjustments
    ? rows.reduce((sum, row) => sum + number(row.adjustment_amount), 0)
    : Math.max(0, number(doc.surcharge_amount)));
  const vatRate = Math.min(100, Math.max(0, number(doc.vat_rate)));
  const vatBase = roundMoney(subtotal - discount + surcharge);
  const vatAmount = roundMoney(vatBase * vatRate / 100);
  const grandTotal = roundMoney(vatBase + vatAmount);
  const depositAmount = roundMoney(Math.max(0, number(doc.deposit_amount)));
  const outstandingAmount = roundMoney(Math.max(0, grandTotal - depositAmount));
  const approval = number(doc.additional_discount_percentage) !== 0
    || rows.some((row) => row.rate_requires_approval === true || row.rate_requires_approval === 1 || row.rate_requires_approval === "1");
  return {
    total_amount: subtotal,
    discount_amount: discount,
    surcharge_amount: surcharge,
    vat_rate: vatRate,
    vat_base_amount: vatBase,
    vat_amount: vatAmount,
    grand_total: grandTotal,
    deposit_amount: depositAmount,
    outstanding_amount: outstandingAmount,
    discount_requires_approval: approval,
  };
}

/**
 * Những field này được nạp mặc định từ hồ sơ đối tác và phải thay sạch khi đổi khách.
 * Nhóm giá vẫn được phép chọn lại trên đơn sau khi đã nạp mặc định. Bảng giá KHÔNG nằm
 * ở đây: mọi Sales Order Alumdoor dùng duy nhất ALUMDOOR-SELLING; danh mục giá mua
 * không bao giờ được customer default kéo vào màn bán.
 */
const CUSTOMER_DERIVED_FIELDS = [
  "customer_group",
  "contact_person",
  "phone",
  "install_province",
  "install_ward",
  "install_address",
  "payment_terms",
] as const;

async function customerDefaults(call: DocumentPreviewCall, doc: Json, changedField: string): Promise<{ patch: Json; clear: string[] }> {
  const customer = text(doc.customer);
  if (!customer) {
    return changedField === "customer"
      ? { patch: {}, clear: [...CUSTOMER_DERIVED_FIELDS] }
      : { patch: {}, clear: [] };
  }
  // Chỉ đổi khách mới được nạp lại Nhóm giá. Đổi ngày hoặc field khác phải giữ lựa
  // chọn tay hiện tại, nếu không preview muộn sẽ âm thầm kéo đơn về nhóm trên master.
  if (changedField && changedField !== "customer") return { patch: {}, clear: [] };
  const customerDoc = await readDoc(call, "Customer", customer);
  if (!customerDoc) return { patch: {}, clear: changedField === "customer" ? [...CUSTOMER_DERIVED_FIELDS] : [] };

  const patch: Json = {};
  const group = text(customerDoc.price_group) || text(customerDoc.customer_group);
  const contact = text(customerDoc.contact_person);
  const phone = text(customerDoc.phone) || text(customerDoc.mobile_no) || text(customerDoc.mobile) || text(customerDoc.phone_no);
  const province = text(customerDoc.install_province);
  const ward = text(customerDoc.install_ward);
  const address = text(customerDoc.install_address_line1) || text(customerDoc.address);
  const paymentTerms = text(customerDoc.payment_terms);

  if (group) patch.customer_group = group;
  if (contact) patch.contact_person = contact;
  if (phone) patch.phone = phone;
  if (province) patch.install_province = province;
  if (ward) patch.install_ward = ward;
  if (address) patch.install_address = address;
  if (paymentTerms) patch.payment_terms = paymentTerms;

  const clear = changedField === "customer"
    ? CUSTOMER_DERIVED_FIELDS.filter((field) => !(field in patch))
    : [];
  return { patch, clear: [...clear] };
}

function priceVariant(value: unknown): string {
  return text(value).toUpperCase() || STANDARD_PRICE_VARIANT;
}

function itemPriceMatches(row: Json, priceList: string, itemCode: string, uom: string, variant: string): boolean {
  return text(row.price_list) === priceList
    && text(row.item_code) === itemCode
    && priceVariant(row.price_variant) === variant
    && text(row.uom) === uom;
}

function purchaseRuleScore(rule: Json): number {
  return (Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0) * 100
    + (text(rule.party) ? 20 : 0)
    + (text(rule.item_code) ? 10 : 0)
    + (text(rule.supplier_group) ? 5 : 0);
}

function purchaseRuleMatches(rule: Json, doc: Json, row: Json): boolean {
  if (disabled(rule.disabled)) return false;
  const priceList = text(doc.buying_price_list);
  const itemCode = text(row.item_code);
  const supplier = text(doc.supplier);
  const supplierGroup = text(doc.supplier_group);
  const postingDate = text(doc.transaction_date).slice(0, 10);
  if (text(rule.price_list) && text(rule.price_list) !== priceList) return false;
  if (text(rule.item_code) && text(rule.item_code) !== itemCode) return false;
  if (text(rule.party_type) && text(rule.party_type) !== "Supplier") return false;
  if (text(rule.party) && text(rule.party) !== supplier) return false;
  if (text(rule.customer_group)) return false;
  if (text(rule.supplier_group) && text(rule.supplier_group) !== supplierGroup) return false;
  if (text(rule.valid_from) && postingDate < text(rule.valid_from).slice(0, 10)) return false;
  if (text(rule.valid_upto) && postingDate > text(rule.valid_upto).slice(0, 10)) return false;
  const qty = number(row.qty);
  const min = rule.min_qty === undefined || rule.min_qty === null || rule.min_qty === "" ? 0 : number(rule.min_qty);
  const max = rule.max_qty === undefined || rule.max_qty === null || rule.max_qty === "" ? Number.MAX_SAFE_INTEGER : number(rule.max_qty);
  return qty >= min && qty <= max;
}

async function currencyScale(call: DocumentPreviewCall, currency: string): Promise<number> {
  const master = await readDoc(call, "Currency", currency).catch(() => null);
  const scale = Number(master?.currency_scale);
  return Number.isSafeInteger(scale) && scale >= 0 && scale <= 6 ? scale : 2;
}

function roundScale(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

async function resolvePurchasePrice(
  call: DocumentPreviewCall,
  doc: Json,
  row: Json,
  rules: Json[],
  scale: number,
): Promise<Json> {
  const priceList = text(doc.buying_price_list);
  const itemCode = text(row.item_code);
  const uom = text(row.uom);
  if (!itemCode) return row;
  if (!priceList) {
    const rate = Number(row.rate);
    const qty = Number(row.qty);
    return Number.isFinite(rate) && rate >= 0 && Number.isFinite(qty) && qty > 0
      ? { ...row, amount: roundScale(qty * rate, scale) }
      : row;
  }
  if (!uom) throw new Error(`${itemCode}: thiếu ĐVT mua để tra bảng giá ${priceList}.`);

  const variant = priceVariant(row.price_variant);
  const fields = ["name", "price_list", "item_code", "uom", "price_variant", "currency", "rate", "disabled"];
  const listed = await listDocs(call, "Item Price", fields, [
    ["price_list", "=", priceList],
    ["item_code", "=", itemCode],
  ], 100);
  const active = listed.filter((candidate) => !disabled(candidate.disabled));
  const exact = active.filter((candidate) => itemPriceMatches(candidate, priceList, itemCode, uom, variant));
  if (exact.length > 1) {
    throw new Error(`Có nhiều Item Price cùng khớp ${priceList} / ${itemCode} / ${uom} / ${variant}: ${exact.map((entry) => text(entry.name)).filter(Boolean).join(", ")}.`);
  }

  let itemPrice = exact[0];
  if (!itemPrice) {
    const preferredName = variant === STANDARD_PRICE_VARIANT
      ? `${priceList}:${itemCode}:${uom}`
      : `${priceList}:${itemCode}:${uom}:${variant}`;
    const legacyName = `${priceList}:${itemCode}`;
    for (const name of [preferredName, legacyName]) {
      const candidate = await readDoc(call, "Item Price", name).catch(() => null);
      if (!candidate || disabled(candidate.disabled)) continue;
      const compatible = text(candidate.price_list) === priceList
        && text(candidate.item_code) === itemCode
        && priceVariant(candidate.price_variant) === variant
        && (!text(candidate.uom) || text(candidate.uom) === uom);
      if (compatible) {
        itemPrice = { ...candidate, name };
        break;
      }
    }
  }
  if (!itemPrice) throw new Error(`Không có Item Price cho ${priceList} / ${itemCode} / ${uom}.`);

  const documentCurrency = text(doc.currency);
  const priceCurrency = text(itemPrice.currency);
  if (!priceCurrency) throw new Error(`Item Price ${text(itemPrice.name) || itemCode} chưa có tiền tệ.`);
  if (documentCurrency && priceCurrency !== documentCurrency) {
    throw new Error(`Item Price ${text(itemPrice.name) || itemCode} dùng ${priceCurrency}, không khớp ${documentCurrency}.`);
  }
  let rate = Number(itemPrice.rate);
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`Item Price ${text(itemPrice.name) || itemCode} có đơn giá không hợp lệ.`);

  const matches = rules
    .filter((rule) => purchaseRuleMatches(rule, doc, row))
    .sort((left, right) => purchaseRuleScore(right) - purchaseRuleScore(left) || text(left.name).localeCompare(text(right.name), "vi"));
  if (matches.length > 1) {
    const topScore = purchaseRuleScore(matches[0]!);
    const tied = matches.filter((rule) => purchaseRuleScore(rule) === topScore);
    if (tied.length > 1) throw new Error(`Pricing Rule mua hàng bị trùng ưu tiên: ${tied.map((rule) => text(rule.name)).filter(Boolean).join(", ")}.`);
  }
  const selected = matches[0];
  let discountPercentage: number | undefined;
  if (selected) {
    if (selected.rate !== undefined && selected.rate !== null && selected.rate !== "") {
      const ruleRate = Number(selected.rate);
      if (!Number.isFinite(ruleRate) || ruleRate < 0) throw new Error(`Pricing Rule ${text(selected.name)} có đơn giá không hợp lệ.`);
      rate = ruleRate;
    } else if (selected.discount_percentage !== undefined && selected.discount_percentage !== null && selected.discount_percentage !== "") {
      const percent = Number(selected.discount_percentage);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error(`Pricing Rule ${text(selected.name)} có % chiết khấu không hợp lệ.`);
      discountPercentage = percent;
      rate = rate * (1 - percent / 100);
    }
  }

  rate = roundScale(rate, scale);
  const qty = Number(row.qty);
  const amount = Number.isFinite(qty) && qty > 0 ? roundScale(qty * rate, scale) : undefined;
  return {
    ...row,
    rate,
    ...(amount !== undefined ? { amount } : {}),
    item_price: text(itemPrice.name),
    ...(selected ? { pricing_rule: text(selected.name) } : {}),
    ...(discountPercentage !== undefined ? { discount_percentage: discountPercentage } : {}),
    price_preview_source: "purchase-price-list",
  };
}

async function purchasePreview(call: DocumentPreviewCall, doc: Json): Promise<Json> {
  const rows = Array.isArray(doc.items)
    ? doc.items.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  if (!rows.length) return { items: [], net_total: 0, grand_total: 0, rounded_total: 0 };
  const currency = text(doc.currency) || "VND";
  const scale = await currencyScale(call, currency);
  const rules = text(doc.buying_price_list)
    ? await listDocs(call, "Pricing Rule", [
      "name", "disabled", "priority", "price_list", "item_code", "party_type", "party",
      "customer_group", "supplier_group", "valid_from", "valid_upto", "min_qty", "max_qty",
      "rate", "discount_percentage",
    ], [], 500)
    : [];
  const items = await Promise.all(rows.map((row) => resolvePurchasePrice(call, doc, row, rules, scale)));
  const total = roundScale(items.reduce((sum, row) => sum + (Number.isFinite(Number(row.amount)) ? Number(row.amount) : number(row.qty) * number(row.rate)), 0), scale);
  return {
    items,
    net_total: total,
    grand_total: total,
    rounded_total: total,
    total_amount: total,
    purchase_pricing_preview: text(doc.buying_price_list) ? "price-list-authority" : "manual-rate",
  };
}

/** Read-only UX preview. Save/submit vẫn normalize lại ở canonical controller. */
export async function previewDocument(call: DocumentPreviewCall, args: Json): Promise<Response> {
  try {
    const doctype = text(args.doctype);
    const doc = args.doc && typeof args.doc === "object" && !Array.isArray(args.doc) ? args.doc as Json : {};
    const changedField = text(args.changed_field);
    if (doctype === "Purchase Order") {
      return answer({ patch: await purchasePreview(call, doc), clear: [], source: "alumdoor.ui.preview_document" });
    }
    if (doctype !== "Sales Order") return answer({ patch: {}, clear: [], source: "alumdoor.ui.preview_document" });
    const defaults = await customerDefaults(call, doc, changedField);
    const effectiveDoc = { ...doc, ...defaults.patch, selling_price_list: ALUMDOOR_SELLING_PRICE_LIST };
    const patch: Json = {
      ...defaults.patch,
      selling_price_list: ALUMDOOR_SELLING_PRICE_LIST,
      ...totals(effectiveDoc),
    };
    if (!text(doc.payment_method)) patch.payment_method = "Ghi công nợ";
    return answer({ patch, clear: defaults.clear, source: "alumdoor.ui.preview_document" });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không preview được chứng từ." }, 422);
  }
}
