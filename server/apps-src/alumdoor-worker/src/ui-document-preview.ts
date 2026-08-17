type Json = Record<string, unknown>;
export type DocumentPreviewCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

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
  const surcharge = Math.max(0, roundMoney(number(doc.surcharge_amount)));
  const vatRate = Math.min(100, Math.max(0, number(doc.vat_rate)));
  // Same commercial order as the authoritative Sales Order controller:
  // gross - line discount + non-discountable surcharge = VAT base; VAT is applied to that base.
  const vatBase = roundMoney(subtotal - discount + surcharge);
  const vatAmount = roundMoney(vatBase * vatRate / 100);
  const grandTotal = roundMoney(vatBase + vatAmount);
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
    discount_requires_approval: approval,
  };
}

async function authoritativeCustomerPriceList(
  call: DocumentPreviewCall,
  customerDoc: Json,
  customerGroup: string,
): Promise<string> {
  const direct = text(customerDoc.default_selling_price_list)
    || text(customerDoc.selling_price_list)
    || text(customerDoc.default_price_list);
  if (direct) return direct;
  if (!customerGroup) return "";
  const group = await readDoc(call, "Customer Group", customerGroup);
  return text(group?.default_selling_price_list) || text(group?.selling_price_list);
}

async function customerDefaults(call: DocumentPreviewCall, doc: Json, changedField: string): Promise<{ patch: Json; clear: string[] }> {
  const customer = text(doc.customer);
  if (!customer) {
    return changedField === "customer"
      ? {
          patch: {},
          clear: [
            "customer_group",
            "responsible_person",
            "contact_person",
            "phone",
            "install_province",
            "install_ward",
            "install_address",
            "payment_terms",
            "selling_price_list",
          ],
        }
      : { patch: {}, clear: [] };
  }
  if (changedField && changedField !== "customer" && changedField !== "transaction_date") return { patch: {}, clear: [] };
  const customerDoc = await readDoc(call, "Customer", customer);
  if (!customerDoc) return { patch: {}, clear: [] };

  const patch: Json = {};
  const group = text(customerDoc.price_group) || text(customerDoc.customer_group);
  const manager = text(customerDoc.account_manager);
  const contact = text(customerDoc.contact_person);
  const phone = text(customerDoc.phone) || text(customerDoc.mobile_no) || text(customerDoc.mobile) || text(customerDoc.phone_no);
  const province = text(customerDoc.install_province);
  const ward = text(customerDoc.install_ward);
  const address = text(customerDoc.install_address_line1) || text(customerDoc.address);
  const paymentTerms = text(customerDoc.payment_terms);
  const priceList = await authoritativeCustomerPriceList(call, customerDoc, group);

  if (group) patch.customer_group = group;
  if (manager) patch.responsible_person = manager;
  if (contact) patch.contact_person = contact;
  if (phone) patch.phone = phone;
  if (province) patch.install_province = province;
  if (ward) patch.install_ward = ward;
  if (address) patch.install_address = address;
  if (paymentTerms) patch.payment_terms = paymentTerms;
  if (priceList) patch.selling_price_list = priceList;
  return { patch, clear: [] };
}

/**
 * Server-owned document UX preview.
 *
 * This method never persists anything. Save/submit still passes through the canonical controller,
 * which recalculates price, discount, tax and approval invariants independently.
 */
export async function previewDocument(call: DocumentPreviewCall, args: Json): Promise<Response> {
  try {
    const doctype = text(args.doctype);
    const doc = args.doc && typeof args.doc === "object" && !Array.isArray(args.doc) ? args.doc as Json : {};
    const changedField = text(args.changed_field);
    if (doctype !== "Sales Order") return answer({ patch: {}, clear: [], source: "alumdoor.ui.preview_document" });
    const defaults = await customerDefaults(call, doc, changedField);
    const patch: Json = { ...defaults.patch, ...totals({ ...doc, ...defaults.patch }) };
    if (!text(doc.payment_method)) patch.payment_method = "Ghi công nợ";
    return answer({ patch, clear: defaults.clear, source: "alumdoor.ui.preview_document" });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không preview được chứng từ." }, 422);
  }
}
