type Json = Record<string, unknown>;
export type DocumentPreviewCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

const ALUMDOOR_SELLING_PRICE_LIST = "ALUMDOOR-SELLING";

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

async function readDoc(call: DocumentPreviewCall, doctype: string, name: string): Promise<Json | null> {
  if (!name) return null;
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
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

/** Read-only UX preview. Save/submit vẫn normalize lại ở canonical controller. */
export async function previewDocument(call: DocumentPreviewCall, args: Json): Promise<Response> {
  try {
    const doctype = text(args.doctype);
    const doc = args.doc && typeof args.doc === "object" && !Array.isArray(args.doc) ? args.doc as Json : {};
    const changedField = text(args.changed_field);
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
