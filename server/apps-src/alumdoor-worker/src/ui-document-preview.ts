type Json = Record<string, unknown>;
export type DocumentPreviewCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

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

function normalizePriceVariant(value: unknown): string {
  const variant = text(value).toUpperCase() || STANDARD_PRICE_VARIANT;
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(variant)) {
    throw new Error("Item Price variant phải dùng 1-64 ký tự A-Z, 0-9, _ hoặc -.");
  }
  return variant;
}

function itemPriceVariant(data: Json): string {
  return normalizePriceVariant(data.price_variant);
}

function fieldMatchedPrice(data: Json, priceList: string, itemCode: string, lineUom: string, variant: string): boolean {
  return text(data.price_list) === priceList
    && text(data.item_code) === itemCode
    && itemPriceVariant(data) === variant
    && (lineUom ? text(data.uom) === lineUom : !text(data.uom));
}

function namedPriceCompatible(data: Json, priceList: string, itemCode: string, lineUom: string, variant: string): boolean {
  const dataPriceList = text(data.price_list);
  const dataItemCode = text(data.item_code);
  if (dataPriceList && dataPriceList !== priceList) return false;
  if (dataItemCode && dataItemCode !== itemCode) return false;
  return itemPriceVariant(data) === variant
    && (lineUom ? text(data.uom) === lineUom : !text(data.uom));
}

function preferredPriceRecordName(priceList: string, itemCode: string, uom: string, variant: string): string {
  const base = `${priceList}:${itemCode}`;
  if (variant === STANDARD_PRICE_VARIANT) return uom ? `${base}:${uom}` : base;
  return uom ? `${base}:${uom}:${variant}` : `${base}:${variant}`;
}

async function currencyScale(call: DocumentPreviewCall, currency: string): Promise<number> {
  const master = await readDoc(call, "Currency", currency).catch(() => null);
  const scale = Number(master?.currency_scale);
  return Number.isSafeInteger(scale) && scale >= 0 && scale <= 6 ? scale : 2;
}

function toMinor(value: unknown, scale: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} phải là số.`);
  const result = Math.round(parsed * 10 ** scale);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} vượt giới hạn số an toàn.`);
  return result;
}

function fromMinor(value: number, scale: number): number {
  return value / 10 ** scale;
}

function toMicros(value: unknown, label: string): number {
  return toMinor(value, 6, label);
}

function uomFactorMicros(item: Json, uom: string): number {
  const stockUom = text(item.stock_uom);
  if (uom === stockUom) return 1_000_000;
  const conversions = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
  const match = conversions.find((entry) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    && text((entry as Json).uom) === uom) as Json | undefined;
  if (!match) throw new Error(`ĐVT ${uom} chưa có hệ số quy đổi trên Item ${text(item.name) || text(item.item_code)}.`);
  const factor = toMicros(match.conversion_factor, `Hệ số quy đổi ${uom}`);
  if (factor <= 0) throw new Error(`Hệ số quy đổi ${uom} phải lớn hơn 0.`);
  return factor;
}

function multiplyDivideRounded(value: number, multiplier: number, divisor: number): number {
  if (![value, multiplier, divisor].every(Number.isSafeInteger) || divisor <= 0) throw new Error("Phép tính giá vượt giới hạn số an toàn.");
  const numerator = BigInt(value) * BigInt(multiplier);
  const denominator = BigInt(divisor);
  const rounded = (numerator + denominator / 2n) / denominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error("Phép tính giá vượt giới hạn số an toàn.");
  return result;
}

function matchesPurchaseRule(rule: Json, doc: Json, row: Json): boolean {
  if (rule.disabled === true || rule.disabled === 1) return false;
  const priceList = text(doc.buying_price_list);
  const itemCode = text(row.item_code);
  const supplier = text(doc.supplier);
  const supplierGroup = text(doc.supplier_group);
  const postingDate = text(doc.transaction_date);
  const qtyMicros = toMicros(row.qty, `${itemCode}.qty`);
  if (typeof rule.price_list === "string" && rule.price_list !== priceList) return false;
  if (typeof rule.item_code === "string" && rule.item_code !== itemCode) return false;
  if (typeof rule.party_type === "string" && rule.party_type !== "Supplier") return false;
  if (typeof rule.party === "string" && rule.party !== supplier) return false;
  if (typeof rule.customer_group === "string" && rule.customer_group !== undefined) return false;
  if (typeof rule.supplier_group === "string" && rule.supplier_group !== supplierGroup) return false;
  if (typeof rule.valid_from === "string" && postingDate.slice(0, 10) < rule.valid_from.slice(0, 10)) return false;
  if (typeof rule.valid_upto === "string" && postingDate.slice(0, 10) > rule.valid_upto.slice(0, 10)) return false;
  const min = rule.min_qty === undefined ? 0 : toMicros(rule.min_qty, "Số lượng tối thiểu Pricing Rule");
  const max = rule.max_qty === undefined ? Number.MAX_SAFE_INTEGER : toMicros(rule.max_qty, "Số lượng tối đa Pricing Rule");
  return qtyMicros >= min && qtyMicros <= max;
}

function purchaseRuleScore(rule: Json): number {
  return (typeof rule.priority === "number" ? rule.priority : 0) * 100
    + (rule.party ? 20 : 0)
    + (rule.item_code ? 10 : 0)
    + (rule.customer_group || rule.supplier_group ? 5 : 0);
}

async function resolvePurchasePrice(
  call: DocumentPreviewCall,
  doc: Json,
  row: Json,
  listedPrices: Json[],
  rules: Json[],
  scale: number,
): Promise<Json> {
  const priceList = text(doc.buying_price_list);
  const itemCode = text(row.item_code);
  const lineUom = text(row.uom);
  const documentCurrency = text(doc.currency);
  if (!itemCode) return row;
  if (!priceList) {
    const rate = Number(row.rate);
    const qty = Number(row.qty);
    return Number.isFinite(rate) && rate >= 0 && Number.isFinite(qty) && qty > 0
      ? { ...row, amount: fromMinor(toMinor(qty * rate, scale, `${itemCode}.amount`), scale), price_preview_source: "manual-rate" }
      : row;
  }

  const variant = normalizePriceVariant(row.price_variant);
  const legacyName = `${priceList}:${itemCode}`;
  const preferredName = preferredPriceRecordName(priceList, itemCode, lineUom, variant);
  const [legacy, preferred] = await Promise.all([
    readDoc(call, "Item Price", legacyName).catch(() => null),
    preferredName === legacyName ? readDoc(call, "Item Price", legacyName).catch(() => null) : readDoc(call, "Item Price", preferredName).catch(() => null),
  ]);
  const compatibleLegacy = variant === STANDARD_PRICE_VARIANT && legacy
    && namedPriceCompatible(legacy, priceList, itemCode, lineUom, STANDARD_PRICE_VARIANT)
    ? legacy
    : null;
  const compatiblePreferred = preferred
    && namedPriceCompatible(preferred, priceList, itemCode, lineUom, variant)
    ? preferred
    : null;

  const fieldMatches = listedPrices.filter((candidate) => fieldMatchedPrice(candidate, priceList, itemCode, lineUom, variant));
  const activeFieldMatches = fieldMatches.filter((candidate) => !disabled(candidate.disabled));
  const exactCandidates = new Map<string, Json>();
  if (compatiblePreferred && !disabled(compatiblePreferred.disabled)) exactCandidates.set(preferredName, compatiblePreferred);
  for (const candidate of activeFieldMatches) {
    const candidateName = text(candidate.name);
    if (candidateName === legacyName && preferredName !== legacyName) continue;
    exactCandidates.set(candidateName || `field:${exactCandidates.size + 1}`, candidate);
  }
  if (exactCandidates.size > 1) {
    throw new Error(`Có nhiều Item Price đang hoạt động cùng khớp ${priceList} / ${itemCode} / ${lineUom || "(không ĐVT)"} / ${variant}: ${[...exactCandidates.keys()].sort().join(", ")}.`);
  }

  let itemPrice: Json | null = null;
  let priceName = preferredName;
  let convertedFromUom = "";
  let item: Json | null = null;
  if (exactCandidates.size === 1) {
    const [candidateName, candidateData] = [...exactCandidates.entries()][0]!;
    itemPrice = candidateData;
    priceName = candidateName;
  } else if (compatibleLegacy && !disabled(compatibleLegacy.disabled)) {
    itemPrice = compatibleLegacy;
    priceName = legacyName;
  }

  if (!itemPrice && lineUom) {
    item = await readDoc(call, "Item", itemCode);
    const baseUom = text(item?.default_purchase_uom) || text(item?.stock_uom);
    if (item && baseUom && baseUom !== lineUom) {
      const activeBase = listedPrices
        .filter((candidate) => fieldMatchedPrice(candidate, priceList, itemCode, baseUom, variant))
        .filter((candidate) => !disabled(candidate.disabled));
      if (activeBase.length > 1) {
        throw new Error(`Có nhiều Item Price đang hoạt động cùng khớp ${priceList} / ${itemCode} / ${baseUom} / ${variant}: ${activeBase.map((entry) => text(entry.name)).sort().join(", ")}.`);
      }
      if (activeBase.length === 1) {
        itemPrice = activeBase[0]!;
        priceName = text(activeBase[0]!.name);
        convertedFromUom = baseUom;
      }
    }
  }

  if (!itemPrice) {
    const disabledCandidate = compatiblePreferred ?? compatibleLegacy ?? fieldMatches[0] ?? null;
    if (disabledCandidate) {
      itemPrice = disabledCandidate;
      priceName = text(disabledCandidate.name) || priceName;
    }
  }

  if (!itemPrice) throw new Error(`Không có Item Price ${preferredName} cho variant ${variant}.`);
  if (disabled(itemPrice.disabled)) throw new Error(`Item Price ${priceName} đã ngừng dùng.`);
  const priceCurrency = text(itemPrice.currency);
  if (!priceCurrency) throw new Error(`Item Price ${priceName} chưa có tiền tệ.`);
  if (priceCurrency !== documentCurrency) throw new Error(`Item Price ${priceName} dùng ${priceCurrency}, không khớp ${documentCurrency}.`);
  const priceUom = text(itemPrice.uom);
  if (priceUom && lineUom && priceUom !== lineUom && !convertedFromUom) {
    throw new Error(`Item Price ${priceName} áp dụng cho ${priceUom}, nhưng dòng mua dùng ${lineUom}.`);
  }

  let rateMinor = toMinor(itemPrice.rate, scale, `Đơn giá Item Price ${priceName}`);
  if (rateMinor < 0) throw new Error(`Item Price ${priceName} có đơn giá âm.`);
  if (convertedFromUom) {
    item ??= await readDoc(call, "Item", itemCode);
    if (!item) throw new Error(`Item ${itemCode} không tồn tại.`);
    const sourceFactor = uomFactorMicros(item, convertedFromUom);
    const targetFactor = uomFactorMicros(item, lineUom);
    rateMinor = multiplyDivideRounded(rateMinor, targetFactor, sourceFactor);
  }

  const matches = rules
    .filter((rule) => matchesPurchaseRule(rule, doc, row))
    .sort((left, right) => purchaseRuleScore(right) - purchaseRuleScore(left) || text(left.name).localeCompare(text(right.name), "vi"));
  if (matches.length > 1) {
    const topScore = purchaseRuleScore(matches[0]!);
    const tied = matches.filter((rule) => purchaseRuleScore(rule) === topScore);
    if (tied.length > 1) throw new Error(`Pricing Rule mua hàng bị trùng ưu tiên: ${tied.map((rule) => text(rule.name)).sort().join(", ")}.`);
  }
  const selected = matches[0];
  let discountPercentage: number | undefined;
  if (selected) {
    if (selected.rate !== undefined) {
      rateMinor = toMinor(selected.rate, scale, `Đơn giá Pricing Rule ${text(selected.name)}`);
    } else if (selected.discount_percentage !== undefined) {
      const percentMicros = toMicros(selected.discount_percentage, `Chiết khấu Pricing Rule ${text(selected.name)}`);
      if (percentMicros < 0 || percentMicros > 100_000_000) throw new Error("Chiết khấu Pricing Rule phải từ 0 đến 100%.");
      const discountMinor = Math.round(rateMinor * (percentMicros / 100_000_000));
      rateMinor = Math.max(0, rateMinor - discountMinor);
      discountPercentage = percentMicros / 1_000_000;
    }
  }
  if (rateMinor < 0) throw new Error("Đơn giá sau Pricing Rule không được âm.");

  const rate = fromMinor(rateMinor, scale);
  const qty = Number(row.qty);
  const amount = Number.isFinite(qty) && qty > 0
    ? fromMinor(toMinor(qty * rate, scale, `${itemCode}.amount`), scale)
    : undefined;
  return {
    ...row,
    rate,
    ...(amount !== undefined ? { amount } : {}),
    item_price: priceName,
    price_variant: variant,
    ...(selected ? { pricing_rule: text(selected.name) } : {}),
    ...(discountPercentage !== undefined ? { discount_percentage: discountPercentage } : {}),
    price_preview_source: "canonical-buying-price",
  };
}

async function purchasePreview(call: DocumentPreviewCall, doc: Json): Promise<Json> {
  const rows = Array.isArray(doc.items)
    ? doc.items.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  if (!rows.length) return { items: [], net_total: 0, vat_amount: 0, grand_total: 0, rounded_total: 0, total_amount: 0 };
  const currency = text(doc.currency) || "VND";
  const scale = await currencyScale(call, currency);
  const priceList = text(doc.buying_price_list);
  /*
   * LỌC NGAY Ở SERVER, ĐỪNG KÉO CẢ BẢNG GIÁ VỀ RỒI LỌC TRONG BỘ NHỚ.
   *
   * Trước đây lượt này đọc 2000 dòng Item Price mỗi lần tính lại — tức mỗi lần người mua gõ
   * một kích thước. `fieldMatchedPrice` bên dưới chỉ nhận dòng khớp `price_list` VÀ `item_code`,
   * nên dòng bị loại ở đây vốn không bao giờ trúng: lọc trước là đổi tốc độ, không đổi kết quả.
   *
   * Nền tảng chặn `in` ở 50 giá trị (`document-list.ts` MAX_IN_VALUES). Đơn dài hơn 50 mã thì
   * bỏ vế `item_code` và chỉ lọc theo bảng giá — vẫn đúng, chỉ đọc rộng hơn.
   */
  const maTrenDon = [...new Set(rows.map((row) => text(row.item_code)).filter(Boolean))];
  const locGia: unknown[] = [["Item Price", "price_list", "=", priceList]];
  if (maTrenDon.length && maTrenDon.length <= 50) locGia.push(["Item Price", "item_code", "in", maTrenDon]);
  const [listedPrices, rules] = priceList
    ? await Promise.all([
      listDocs(call, "Item Price", ["name", "price_list", "item_code", "uom", "price_variant", "currency", "rate", "disabled"], locGia, 2000),
      listDocs(call, "Pricing Rule", [
        "name", "disabled", "priority", "price_list", "item_code", "party_type", "party",
        "customer_group", "supplier_group", "valid_from", "valid_upto", "min_qty", "max_qty",
        "rate", "discount_percentage",
      ], [], 1000),
    ])
    : [[], []];
  const items = await Promise.all(rows.map((row) => resolvePurchasePrice(call, doc, row, listedPrices, rules, scale)));
  const totalMinor = items.reduce((sum, row) => {
    const amount = Number(row.amount);
    if (Number.isFinite(amount)) return sum + toMinor(amount, scale, `${text(row.item_code)}.amount`);
    return sum + toMinor(number(row.qty) * number(row.rate), scale, `${text(row.item_code)}.amount`);
  }, 0);
  const total = fromMinor(totalMinor, scale);
  /*
   * VAT CỦA CẢ ĐƠN, không phải theo dòng (chốt chủ xưởng 24/08/2026) — cùng hình dạng với đơn
   * bán: `total_amount` là tiền hàng trước thuế, `grand_total` là số phải trả.
   *
   * Cộng bằng ĐƠN VỊ NHỎ NHẤT rồi mới đổi ngược, y như phép cộng tiền hàng ngay trên: nhân
   * phần trăm trên số thực rồi làm tròn sau sẽ lệch vài đồng so với tổng các dòng, và lệch đó
   * đi thẳng vào công nợ nhà cung cấp.
   */
  const vatRate = Math.min(100, Math.max(0, number(doc.vat_rate)));
  const vatMinor = Math.round(totalMinor * vatRate / 100);
  const vatAmount = fromMinor(vatMinor, scale);
  const grandTotal = fromMinor(totalMinor + vatMinor, scale);
  return {
    items,
    net_total: total,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    grand_total: grandTotal,
    rounded_total: grandTotal,
    total_amount: total,
    purchase_pricing_preview: priceList ? "canonical-buying-price" : "manual-rate",
  };
}

/**
 * Bảng giá bán lấy từ DỮ LIỆU, không từ một chuỗi ghim trong code.
 *
 * Trước 21/08/2026 chỗ này ghim `"ALUMDOOR-SELLING"` rồi ép lên header mọi đơn bán. Khi chủ
 * xưởng đổi tên bảng giá sang `Alumdoor 2026` (`nhap/doi-ten-bang-gia.mjs`, dựng lại 268 dòng
 * giá), tên ghim trỏ vào một bảng giá KHÔNG CÒN TỒN TẠI — và vì nó nằm sau cùng trong spread
 * nên đè luôn cả bảng giá người dùng tự chọn. Hệ quả: mọi dòng bán báo "chưa khai đơn giá"
 * trong khi 288 đơn giá vẫn nằm nguyên trong D1.
 *
 * Ba luật ở đây, theo đúng thứ tự:
 *  1. Người dùng đã chọn thì GIỮ. Preview không có quyền đè lựa chọn của người lập đơn.
 *  2. Chưa chọn thì suy từ danh mục: bảng giá còn dùng, ưu tiên đúng nhóm giá của khách.
 *  3. Vẫn không chắc thì TRẢ RỖNG. Brief `Price List` ghi thẳng: để trống `selling_price_list`
 *     nghĩa là giá gõ tay — đó là mặc định và là cách xưởng đang làm. Đoán một bảng giá là ghi
 *     đè đơn giá bằng một bảng người lập đơn không chọn.
 */
async function resolveSellingPriceList(call: DocumentPreviewCall, doc: Json, customerGroup: string): Promise<string> {
  const chosen = text(doc.selling_price_list);
  if (chosen) return chosen;
  let rows: Json[];
  try {
    rows = await listDocs(call, "Price List", ["name", "price_list_name", "customer_group", "disabled"], [], 50);
  } catch {
    // Không đọc được danh mục bảng giá thì để giá gõ tay, đừng kéo sập cả màn xem trước.
    return "";
  }
  const active = rows.filter((row) => !disabled(row.disabled));
  const nameOf = (row: Json) => text(row.name) || text(row.price_list_name);
  if (active.length === 1) return nameOf(active[0]!);
  const group = text(customerGroup) || text(doc.customer_group);
  if (group) {
    const matched = active.filter((row) => text(row.customer_group).localeCompare(group, "vi", { sensitivity: "base" }) === 0);
    if (matched.length === 1) return nameOf(matched[0]!);
  }
  return "";
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
    const priceList = await resolveSellingPriceList(call, doc, text(defaults.patch.customer_group));
    const effectiveDoc = { ...doc, ...defaults.patch, ...(priceList ? { selling_price_list: priceList } : {}) };
    const patch: Json = {
      ...defaults.patch,
      ...(priceList && priceList !== text(doc.selling_price_list) ? { selling_price_list: priceList } : {}),
      ...totals(effectiveDoc),
    };
    if (!text(doc.payment_method)) patch.payment_method = "Ghi công nợ";
    return answer({ patch, clear: defaults.clear, source: "alumdoor.ui.preview_document" });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không preview được chứng từ." }, 422);
  }
}
