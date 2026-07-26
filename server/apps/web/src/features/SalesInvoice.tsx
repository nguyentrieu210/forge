import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { api, newId } from "../lib/api";
import { useDocLifecycle } from "../lib/useDocLifecycle";
import { seedToken, type Seed } from "../lib/handoff";
import { BannerView, DocStatusBadge, Field, money } from "./parts";

interface Item { row_id: string; item_code: string; qty: string; rate: string }
type ChargeType = "On Net Total" | "On Previous Row Total" | "Actual" | "On Item Quantity";
interface Tax {
  row_id: string;
  account: string;
  rate: string;
  charge_type: ChargeType;
  add_deduct_tax: "Add" | "Deduct";
  included_in_print_rate: boolean;
  actual_tax_amount: string;
}
interface Form {
  name: string;
  company: string;
  customer: string;
  currency: string;
  posting_date: string;
  debit_to: string;
  default_income_account: string;
  round_off_account: string;
  against_sales_order: string;
  apply_discount_on: "Net Total" | "Grand Total";
  discount_mode: "Percentage" | "Amount";
  additional_discount_percentage: string;
  discount_amount: string;
  items: Item[];
  taxes: Tax[];
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function newTax(index: number): Tax {
  return { row_id: `TAX-${index}`, account: "Output Tax", rate: "0", charge_type: "On Net Total", add_deduct_tax: "Add", included_in_print_rate: false, actual_tax_amount: "0" };
}
function freshForm(): Form {
  return {
    name: newId("SI"), company: "Demo", customer: "CUST-1", currency: "USD", posting_date: today(),
    debit_to: "Debtors", default_income_account: "Sales", round_off_account: "Round Off", against_sales_order: "",
    apply_discount_on: "Net Total", discount_mode: "Percentage", additional_discount_percentage: "0", discount_amount: "0",
    items: [{ row_id: "ROW-1", item_code: "ITEM-1", qty: "1", rate: "10" }], taxes: [newTax(1)],
  };
}

function preview(form: Form): { net: number; tax: number; grand: number; adjustment: number } {
  const gross = form.items.reduce((sum, item) => sum + money(item.qty, item.rate), 0);
  const includedRate = form.taxes
    .filter((tax) => tax.included_in_print_rate && tax.charge_type === "On Net Total" && tax.add_deduct_tax === "Add")
    .reduce((sum, tax) => sum + (Number(tax.rate) || 0), 0);
  let net = includedRate > 0 ? gross / (1 + includedRate / 100) : gross;
  const percentage = form.discount_mode === "Percentage" ? Math.min(100, Math.max(0, Number(form.additional_discount_percentage) || 0)) : 0;
  const fixedDiscount = form.discount_mode === "Amount" ? Math.max(0, Number(form.discount_amount) || 0) : 0;
  let targetGrand: number | null = null;
  if (percentage > 0) net *= 1 - percentage / 100;
  else if (fixedDiscount > 0 && form.apply_discount_on === "Net Total") net = Math.max(0, net - fixedDiscount);

  const calculateTaxes = (baseNet: number) => {
    let running = baseNet;
    let taxTotal = 0;
    let nonIncluded = 0;
    const totalQty = form.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    for (const tax of form.taxes) {
      const rate = Number(tax.rate) || 0;
      const raw = tax.charge_type === "Actual" ? (Number(tax.actual_tax_amount) || 0)
        : tax.charge_type === "On Item Quantity" ? totalQty * rate
        : tax.charge_type === "On Previous Row Total" ? running * rate / 100
        : baseNet * rate / 100;
      const amount = tax.add_deduct_tax === "Deduct" ? -raw : raw;
      taxTotal += amount;
      running += amount;
      if (!tax.included_in_print_rate) nonIncluded += amount;
    }
    return { taxTotal, nonIncluded };
  };

  if (fixedDiscount > 0 && form.apply_discount_on === "Grand Total") {
    const provisionalTax = calculateTaxes(net).nonIncluded;
    const provisionalGrand = net + provisionalTax;
    targetGrand = Math.max(0, provisionalGrand - fixedDiscount);
    net = provisionalGrand === 0 ? 0 : net * targetGrand / provisionalGrand;
  }
  const taxResult = calculateTaxes(net);
  const computed = net + taxResult.taxTotal;
  const grand = includedRate > 0 ? gross + taxResult.nonIncluded : (targetGrand ?? computed);
  return { net, tax: taxResult.taxTotal, grand, adjustment: grand - computed };
}

export function SalesInvoiceScreen({ seed, onHandoff }: { seed: Seed | null; onHandoff: (seed: Seed) => void }) {
  const [form, setForm] = useState<Form>(freshForm);
  const [serverTotals, setServerTotals] = useState<{ net?: string; tax?: string; grand?: string; baseGrand?: string } | null>(null);
  const doc = useDocLifecycle();
  const consumed = useRef<number>(0);
  const estimate = preview(form);

  function buildDocument(): Record<string, unknown> {
    return {
      customer: form.customer, company: form.company, currency: form.currency, currency_scale: 2,
      posting_at: `${form.posting_date}T00:00:00.000Z`, debit_to: form.debit_to,
      default_income_account: form.default_income_account, round_off_account: form.round_off_account,
      against_sales_order: form.against_sales_order, apply_discount_on: form.apply_discount_on,
      ...(form.discount_mode === "Percentage"
        ? { additional_discount_percentage: form.additional_discount_percentage }
        : { discount_amount: form.discount_amount }),
      items: form.items.map((item) => ({ row_id: item.row_id, item_code: item.item_code, qty: item.qty, rate: item.rate })),
      taxes: form.taxes.filter((tax) => tax.account).map((tax) => ({
        row_id: tax.row_id, account: tax.account, rate: tax.rate, charge_type: tax.charge_type,
        add_deduct_tax: tax.add_deduct_tax,
        included_in_print_rate: tax.included_in_print_rate,
        ...(tax.charge_type === "Actual" ? { actual_tax_amount: tax.actual_tax_amount } : {}),
      })),
    };
  }

  const act = (action: "create" | "save" | "submit" | "cancel") => {
    setServerTotals(null);
    return doc.act(action, {
      doctype: "Sales Invoice", name: form.name, buildDocument,
      summary: { customer: form.customer, amount: estimate.grand.toFixed(2) },
    });
  };

  async function loadDoc(name: string) {
    await doc.load(async () => {
      const fetched = await api.getDocument<Record<string, unknown>>("Sales Invoice", name);
      const data = fetched.data;
      const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
      const taxes = Array.isArray(data.taxes) ? data.taxes as Record<string, unknown>[] : [];
      setForm({
        name: fetched.name, company: String(data.company ?? ""), customer: String(data.customer ?? ""),
        currency: String(data.currency ?? "USD"), posting_date: String(data.posting_at ?? today()).slice(0, 10),
        debit_to: String(data.debit_to ?? ""), default_income_account: String(data.default_income_account ?? ""),
        round_off_account: String(data.round_off_account ?? "Round Off"), against_sales_order: String(data.against_sales_order ?? ""),
        apply_discount_on: data.apply_discount_on === "Grand Total" ? "Grand Total" : "Net Total",
        discount_mode: Number(data.additional_discount_percentage ?? 0) > 0 ? "Percentage" : "Amount",
        additional_discount_percentage: String(data.additional_discount_percentage ?? "0"),
        discount_amount: String(data.discount_amount ?? "0"),
        items: items.map((item, index) => ({
          row_id: String(item.row_id ?? `ROW-${index + 1}`), item_code: String(item.item_code ?? ""),
          qty: String(item.qty ?? ""), rate: String(item.rate ?? ""),
        })),
        taxes: taxes.length ? taxes.map((tax, index) => ({
          row_id: String(tax.row_id ?? `TAX-${index + 1}`), account: String(tax.account ?? ""), rate: String(tax.rate ?? "0"),
          charge_type: (["On Net Total", "On Previous Row Total", "Actual", "On Item Quantity"].includes(String(tax.charge_type))
            ? String(tax.charge_type) : "On Net Total") as ChargeType,
          add_deduct_tax: tax.add_deduct_tax === "Deduct" ? "Deduct" : "Add",
          included_in_print_rate: tax.included_in_print_rate === true,
          actual_tax_amount: String(tax.actual_tax_amount ?? Math.abs(Number(tax.tax_amount ?? 0))),
        })) : [newTax(1)],
      });
      setServerTotals({
        net: String(data.net_total ?? ""), tax: String(data.total_taxes_and_charges ?? ""),
        grand: String(data.grand_total ?? ""), baseGrand: String(data.base_grand_total ?? ""),
      });
      return { doctype: "Sales Invoice", name: fetched.name, version: fetched.version, docstatus: fetched.docstatus,
        summary: { customer: String(data.customer ?? ""), amount: String(data.grand_total ?? "") } };
    });
  }

  useEffect(() => {
    if (!seed || seed.token === consumed.current) return;
    if (seed.kind === "new-invoice") {
      consumed.current = seed.token;
      doc.reset(); setServerTotals(null);
      setForm((previous) => ({ ...freshForm(), name: newId("SI"), company: seed.prefill.company, customer: seed.prefill.customer,
        currency: seed.prefill.currency, against_sales_order: seed.prefill.against_sales_order,
        debit_to: previous.debit_to, default_income_account: previous.default_income_account,
        round_off_account: previous.round_off_account, taxes: previous.taxes,
        items: seed.prefill.items.map((item, index) => ({ row_id: `ROW-${index + 1}`, item_code: item.item_code, qty: item.qty, rate: item.rate })) }));
    } else if (seed.kind === "open" && seed.doctype === "Sales Invoice") {
      consumed.current = seed.token; void loadDoc(seed.name);
    }
  }, [seed]);

  function startNew() { setForm(freshForm()); setServerTotals(null); doc.reset(); }
  function patch(value: Partial<Form>) { setForm((current) => ({ ...current, ...value })); }
  function patchItem(index: number, value: Partial<Item>) { setForm((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...value } : item) })); }
  function patchTax(index: number, value: Partial<Tax>) { setForm((current) => ({ ...current, taxes: current.taxes.map((tax, i) => i === index ? { ...tax, ...value } : tax) })); }
  function addItem() { setForm((current) => ({ ...current, items: [...current.items, { row_id: `ROW-${current.items.length + 1}`, item_code: "", qty: "1", rate: "0" }] })); }
  function addTax() { setForm((current) => ({ ...current, taxes: [...current.taxes, newTax(current.taxes.length + 1)] })); }
  function removeItem(index: number) { setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) })); }
  function removeTax(index: number) { setForm((current) => ({ ...current, taxes: current.taxes.filter((_, i) => i !== index) })); }
  function toPayment() {
    const amount = serverTotals?.grand || estimate.grand.toFixed(2);
    onHandoff({ kind: "new-payment", token: seedToken(), prefill: { company: form.company, currency: form.currency,
      party: form.customer, paid_from: form.debit_to, amount,
      references: [{ reference_name: form.name, allocated_amount: amount }] } });
  }

  const editable = doc.isDraft || !doc.created;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">Sales Invoice</h2>
      <DocStatusBadge docstatus={doc.docstatus} />{doc.version !== null && <span className="text-sm text-muted-foreground">version {doc.version}</span>}
      <Button size="sm" variant="outline" className="ml-auto" onClick={startNew}>New</Button></div>
    <BannerView banner={doc.banner} pending={doc.pending} onRetry={doc.retry} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Name (client-generated)"><Input value={form.name} disabled /></Field>
      <Field label="Against Sales Order"><Input value={form.against_sales_order} disabled={!editable} onChange={(e) => patch({ against_sales_order: e.target.value })} /></Field>
      <Field label="Company"><Input value={form.company} disabled={doc.created} onChange={(e) => patch({ company: e.target.value })} /></Field>
      <Field label="Customer"><Input value={form.customer} disabled={!editable} onChange={(e) => patch({ customer: e.target.value })} /></Field>
      <Field label="Currency"><Input value={form.currency} disabled={doc.created} onChange={(e) => patch({ currency: e.target.value })} /></Field>
      <Field label="Posting date"><Input type="date" value={form.posting_date} disabled={!editable} onChange={(e) => patch({ posting_date: e.target.value })} /></Field>
      <Field label="Receivable account"><Input value={form.debit_to} disabled={!editable} onChange={(e) => patch({ debit_to: e.target.value })} /></Field>
      <Field label="Income account"><Input value={form.default_income_account} disabled={!editable} onChange={(e) => patch({ default_income_account: e.target.value })} /></Field>
      <Field label="Round-off account"><Input value={form.round_off_account} disabled={!editable} onChange={(e) => patch({ round_off_account: e.target.value })} /></Field>
      <Field label="Discount basis"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.apply_discount_on} disabled={!editable} onChange={(e) => patch({ apply_discount_on: e.target.value as Form["apply_discount_on"] })}><option>Net Total</option><option>Grand Total</option></select></Field>
      <Field label="Discount mode"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.discount_mode} disabled={!editable} onChange={(e) => patch({ discount_mode: e.target.value as Form["discount_mode"] })}><option>Percentage</option><option>Amount</option></select></Field>
      {form.discount_mode === "Percentage"
        ? <Field label="Additional discount %"><Input value={form.additional_discount_percentage} disabled={!editable} onChange={(e) => patch({ additional_discount_percentage: e.target.value })} /></Field>
        : <Field label="Discount amount"><Input value={form.discount_amount} disabled={!editable} onChange={(e) => patch({ discount_amount: e.target.value })} /></Field>}
    </div>

    <div><div className="mb-1 flex items-center justify-between"><Label>Items</Label>{editable && <Button size="sm" variant="ghost" onClick={addItem}>+ Row</Button>}</div>
      <Table className="rounded-md border border-border"><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Rate</TableHead><TableHead>Amount</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{form.items.map((item, index) => <TableRow key={item.row_id}><TableCell><Input value={item.item_code} disabled={!editable} onChange={(e) => patchItem(index, { item_code: e.target.value })} /></TableCell><TableCell><Input value={item.qty} disabled={!editable} onChange={(e) => patchItem(index, { qty: e.target.value })} /></TableCell><TableCell><Input value={item.rate} disabled={!editable} onChange={(e) => patchItem(index, { rate: e.target.value })} /></TableCell><TableCell>{money(item.qty, item.rate).toFixed(2)}</TableCell><TableCell>{editable && form.items.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeItem(index)}>✕</Button>}</TableCell></TableRow>)}</TableBody></Table></div>

    <div><div className="mb-1 flex items-center justify-between"><Label>Taxes and charges</Label>{editable && <Button size="sm" variant="ghost" onClick={addTax}>+ Tax</Button>}</div>
      <Table className="rounded-md border border-border"><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Charge type</TableHead><TableHead>Add/Deduct</TableHead><TableHead>Rate / amount</TableHead><TableHead>Included</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{form.taxes.map((tax, index) => <TableRow key={tax.row_id}><TableCell><Input value={tax.account} disabled={!editable} onChange={(e) => patchTax(index, { account: e.target.value })} /></TableCell><TableCell><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tax.charge_type} disabled={!editable} onChange={(e) => patchTax(index, { charge_type: e.target.value as ChargeType, included_in_print_rate: false })}><option>On Net Total</option><option>On Previous Row Total</option><option>Actual</option><option>On Item Quantity</option></select></TableCell><TableCell><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tax.add_deduct_tax} disabled={!editable} onChange={(e) => patchTax(index, { add_deduct_tax: e.target.value as Tax["add_deduct_tax"], included_in_print_rate: false })}><option>Add</option><option>Deduct</option></select></TableCell><TableCell><Input value={tax.charge_type === "Actual" ? tax.actual_tax_amount : tax.rate} disabled={!editable} onChange={(e) => patchTax(index, tax.charge_type === "Actual" ? { actual_tax_amount: e.target.value } : { rate: e.target.value })} /></TableCell><TableCell className="text-center"><input type="checkbox" checked={tax.included_in_print_rate} disabled={!editable || tax.charge_type !== "On Net Total" || tax.add_deduct_tax !== "Add"} onChange={(e) => patchTax(index, { included_in_print_rate: e.target.checked })} /></TableCell><TableCell>{editable && <Button size="sm" variant="ghost" onClick={() => removeTax(index)}>✕</Button>}</TableCell></TableRow>)}</TableBody></Table>
      <div className="mt-2 space-y-0.5 text-right text-sm"><p>Preview net <b>{estimate.net.toFixed(2)}</b></p><p>Preview tax <b>{estimate.tax.toFixed(2)}</b></p><p>Preview adjustment <b>{estimate.adjustment.toFixed(2)}</b></p><p>Preview grand <b>{estimate.grand.toFixed(2)}</b></p>{serverTotals && <p className="text-muted-foreground">Server: net {serverTotals.net} · tax {serverTotals.tax} · grand {serverTotals.grand}{form.currency !== "USD" && serverTotals.baseGrand ? ` · base ${serverTotals.baseGrand}` : ""}</p>}</div>
    </div>

    <div className="flex flex-wrap gap-2">{!doc.created && <Button disabled={doc.busy} onClick={() => act("create")}>Create</Button>}{doc.created && doc.isDraft && <Button disabled={doc.busy} variant="secondary" onClick={() => act("save")}>Save draft</Button>}{doc.created && doc.isDraft && <Button disabled={doc.busy} onClick={() => act("submit")}>Submit</Button>}{doc.created && doc.isSubmitted && <Button disabled={doc.busy} variant="destructive" onClick={() => act("cancel")}>Cancel</Button>}{doc.created && <Button disabled={doc.busy} variant="outline" onClick={() => loadDoc(form.name)}>Reload</Button>}</div>
    {doc.isSubmitted && <div className="rounded-md border border-border bg-muted/30 p-3"><Button size="sm" variant="outline" onClick={toPayment}>Create Payment Entry →</Button><p className="mt-2 text-xs text-muted-foreground">Reload first to hand off the canonical server-computed total after advanced tax/discount.</p></div>}
  </div>;
}
