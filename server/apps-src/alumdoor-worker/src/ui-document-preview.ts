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

async function listPriceLists(call: DocumentPreviewCall): Promise<Json[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "price_group", "effective_date", "disabled"]),
    limit_page_length: "100",
  });
  const response = await call(`resource/Price%20List?${query}`);
  if (!response.ok) return [];
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
  const surcharge = Math.max(0, roundMoney(number(doc.surcharge_amount)));
  const vatRate = Math.min(100, Math.max(0, number(doc.vat_rate)));
  // Same commercial order as the authoritative Sales Order controller:
  // gross - line discount + non-discountable surcharge = VAT base; VAT is applied to that base.
  const vatBase = roundMoney(subtotal - discount + surcharge);
  const vatAmount = roundMoney(vatBase * vatRate / 100);
  const grandTotal = roundMoney(vatBase + vatAmount);
  const approval = number(doc.additional_discount_percentage) !== 0
    || rows.some((row) => row.rate_requires_approval === true);
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

async function customerDefaults(call: DocumentPreviewCall, doc: Json, changedField: string): Promise<{ patch: Json; clear: string[] }> {
  const customer = text(doc.customer);
  if (!customer) {
    return changedField === "customer"
      ? { patch: {}, clear: ["customer_group", "responsible_person", "install_address", "selling_price_list"] }
      : { patch: {}, clear: [] };
  }
  if (changedField && changedField !== "customer" && changedField !== "transaction_date") return { patch: {}, clear: [] };
  const customerDoc = await readDoc(call, "Customer", customer);
  if (!customerDoc) return { patch: {}, clear: [] };
  const patch: Json = {};
  const group = text(customerDoc.price_group);
  const manager = text(customerDoc.account_manager);
  const address = text(customerDoc.address);
  const preferred = text(customerDoc.default_price_list);
  if (group) patch.customer_group = group;
  if (manager) patch.responsible_person = manager;
  if (address) patch.install_address = address;
  if (preferred) {
    patch.selling_price_list = preferred;
    return { patch, clear: [] };
  }
  if (!group) return { patch, clear: [] };
  const date = text(doc.transaction_date);
  const candidates = (await listPriceLists(call)).filter((priceList) =>
    text(priceList.price_group) === group
    && !Boolean(priceList.disabled)
    && (!date || !text(priceList.effective_date) || text(priceList.effective_date) <= date));
  candidates.sort((left, right) => text(right.effective_date).localeCompare(text(left.effective_date)));
  if (candidates[0]?.name) patch.selling_price_list = text(candidates[0].name);
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
