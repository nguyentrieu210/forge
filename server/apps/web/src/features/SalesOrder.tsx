import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { api, newId } from "../lib/api";
import { useDocLifecycle } from "../lib/useDocLifecycle";
import { seedToken, type Seed } from "../lib/handoff";
import { BannerView, DocStatusBadge, Field, money } from "./parts";

interface Item { row_id: string; item_code: string; qty: string; rate: string }
interface Form {
  name: string;
  company: string;
  customer: string;
  currency: string;
  transaction_date: string;
  items: Item[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function freshForm(): Form {
  return {
    name: newId("SO"),
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    transaction_date: today(),
    items: [{ row_id: "ROW-1", item_code: "ITEM-1", qty: "5", rate: "10" }],
  };
}

export function SalesOrderScreen({ seed, onHandoff }: { seed: Seed | null; onHandoff: (seed: Seed) => void }) {
  const [form, setForm] = useState<Form>(freshForm);
  const doc = useDocLifecycle();
  const consumed = useRef<number>(0);

  const total = form.items.reduce((sum, it) => sum + money(it.qty, it.rate), 0);

  function buildDocument(): Record<string, unknown> {
    return {
      customer: form.customer,
      company: form.company,
      currency: form.currency,
      currency_scale: 2,
      transaction_date: form.transaction_date,
      items: form.items.map((it) => ({ row_id: it.row_id, item_code: it.item_code, qty: it.qty, rate: it.rate })),
      taxes: [],
    };
  }

  const act = (action: "create" | "save" | "submit" | "cancel") =>
    doc.act(action, {
      doctype: "Sales Order",
      name: form.name,
      buildDocument,
      summary: { customer: form.customer, amount: total.toFixed(2) },
    });

  async function loadDoc(name: string) {
    await doc.load(async () => {
      const fetched = await api.getDocument<Record<string, unknown>>("Sales Order", name);
      const data = fetched.data;
      const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
      setForm({
        name: fetched.name,
        company: String(data.company ?? ""),
        customer: String(data.customer ?? ""),
        currency: String(data.currency ?? "USD"),
        transaction_date: String(data.transaction_date ?? today()),
        items: items.map((it, i) => ({
          row_id: String(it.row_id ?? `ROW-${i + 1}`),
          item_code: String(it.item_code ?? ""),
          qty: String(it.qty ?? ""),
          rate: String(it.rate ?? ""),
        })),
      });
      return {
        doctype: "Sales Order",
        name: fetched.name,
        version: fetched.version,
        docstatus: fetched.docstatus,
        summary: { customer: String(data.customer ?? "") },
      };
    });
  }

  // Consume an "open this Sales Order" handoff from the recent-docs list.
  useEffect(() => {
    if (!seed || seed.token === consumed.current) return;
    if (seed.kind === "open" && seed.doctype === "Sales Order") {
      consumed.current = seed.token;
      void loadDoc(seed.name);
    }
  }, [seed]);

  function startNew() {
    setForm(freshForm());
    doc.reset();
  }
  function patch(p: Partial<Form>) { setForm((f) => ({ ...f, ...p })); }
  function patchItem(i: number, p: Partial<Item>) {
    setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, ...p } : it)) }));
  }
  function addItem() { setForm((f) => ({ ...f, items: [...f.items, { row_id: `ROW-${f.items.length + 1}`, item_code: "", qty: "1", rate: "0" }] })); }
  function removeItem(i: number) { setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) })); }

  function toDelivery() {
    onHandoff({
      kind: "new-delivery",
      token: seedToken(),
      prefill: {
        company: form.company,
        customer: form.customer,
        currency: form.currency,
        against_sales_order: form.name,
        items: form.items.map((it) => ({ item_code: it.item_code, qty: it.qty, rate: it.rate, warehouse: "" })),
      },
    });
  }
  function toInvoice() {
    onHandoff({
      kind: "new-invoice",
      token: seedToken(),
      prefill: {
        company: form.company,
        customer: form.customer,
        currency: form.currency,
        against_sales_order: form.name,
        items: form.items.map((it) => ({ item_code: it.item_code, qty: it.qty, rate: it.rate })),
      },
    });
  }

  const editable = doc.isDraft || !doc.created;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Sales Order</h2>
        <DocStatusBadge docstatus={doc.docstatus} />
        {doc.version !== null && <span className="text-sm text-muted-foreground">version {doc.version}</span>}
        <Button size="sm" variant="outline" className="ml-auto" onClick={startNew}>New</Button>
      </div>

      <BannerView banner={doc.banner} pending={doc.pending} onRetry={doc.retry} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name (client-generated)"><Input value={form.name} disabled /></Field>
        <Field label="Company"><Input value={form.company} disabled={doc.created} onChange={(e) => patch({ company: e.target.value })} /></Field>
        <Field label="Customer"><Input value={form.customer} disabled={!editable} onChange={(e) => patch({ customer: e.target.value })} /></Field>
        <Field label="Currency"><Input value={form.currency} disabled={doc.created} onChange={(e) => patch({ currency: e.target.value })} /></Field>
        <Field label="Transaction date"><Input type="date" value={form.transaction_date} disabled={!editable} onChange={(e) => patch({ transaction_date: e.target.value })} /></Field>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label>Items</Label>
          {editable && <Button size="sm" variant="ghost" onClick={addItem}>+ Row</Button>}
        </div>
        <Table className="border border-border rounded-md">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Rate</TableHead><TableHead>Amount</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {form.items.map((it, i) => (
              <TableRow key={it.row_id}>
                <TableCell><Input value={it.item_code} disabled={!editable} onChange={(e) => patchItem(i, { item_code: e.target.value })} /></TableCell>
                <TableCell><Input value={it.qty} disabled={!editable} onChange={(e) => patchItem(i, { qty: e.target.value })} /></TableCell>
                <TableCell><Input value={it.rate} disabled={!editable} onChange={(e) => patchItem(i, { rate: e.target.value })} /></TableCell>
                <TableCell className="tabular-nums">{money(it.qty, it.rate).toFixed(2)}</TableCell>
                <TableCell>{editable && form.items.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeItem(i)}>✕</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-1 text-right text-sm text-muted-foreground">Total (preview) <span className="tabular-nums font-medium text-foreground">{total.toFixed(2)}</span></p>
      </div>

      <div className="flex flex-wrap gap-2">
        {!doc.created && <Button disabled={doc.busy} onClick={() => act("create")}>Create</Button>}
        {doc.created && doc.isDraft && <Button disabled={doc.busy} variant="secondary" onClick={() => act("save")}>Save draft</Button>}
        {doc.created && doc.isDraft && <Button disabled={doc.busy} onClick={() => act("submit")}>Submit</Button>}
        {doc.created && doc.isSubmitted && <Button disabled={doc.busy} variant="destructive" onClick={() => act("cancel")}>Cancel</Button>}
        {doc.created && <Button disabled={doc.busy} variant="outline" onClick={() => loadDoc(form.name)}>Reload</Button>}
      </div>

      {doc.isSubmitted && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">Continue the O2C flow</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={toDelivery}>Create Delivery Note →</Button>
            <Button size="sm" variant="outline" onClick={toInvoice}>Create Sales Invoice →</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Prefills a new draft against this order ({form.name}). You still set warehouses / accounts on the next screen.
          </p>
        </div>
      )}
    </div>
  );
}
