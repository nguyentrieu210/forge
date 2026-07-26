import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { api, newId } from "../lib/api";
import { useDocLifecycle } from "../lib/useDocLifecycle";
import type { Seed } from "../lib/handoff";
import { BannerView, DocStatusBadge, Field } from "./parts";

interface Reference { row_id: string; reference_name: string; allocated_amount: string }
interface Form {
  name: string;
  company: string;
  currency: string;
  posting_date: string;
  party: string;
  paid_from: string;
  paid_to: string;
  paid_amount: string;
  received_amount: string;
  exchange_gain_loss_account: string;
  references: Reference[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function freshForm(): Form {
  return {
    name: newId("PE"),
    company: "Demo",
    currency: "USD",
    posting_date: today(),
    party: "CUST-1",
    paid_from: "Debtors",
    paid_to: "Bank",
    paid_amount: "0",
    received_amount: "0",
    exchange_gain_loss_account: "Exchange Gain Loss",
    references: [{ row_id: "REF-1", reference_name: "", allocated_amount: "0" }],
  };
}

export function PaymentEntryScreen({ seed }: { seed: Seed | null; onHandoff: (seed: Seed) => void }) {
  const [form, setForm] = useState<Form>(freshForm);
  const doc = useDocLifecycle();
  const consumed = useRef<number>(0);

  const allocated = form.references.reduce((sum, r) => sum + (Number(r.allocated_amount) || 0), 0);
  const unallocated = (Number(form.paid_amount) || 0) - allocated;

  function buildDocument(): Record<string, unknown> {
    return {
      company: form.company,
      currency: form.currency,
      currency_scale: 2,
      posting_at: `${form.posting_date}T00:00:00.000Z`,
      payment_type: "Receive",
      party_type: "Customer",
      party: form.party,
      paid_from: form.paid_from,
      paid_to: form.paid_to,
      exchange_gain_loss_account: form.exchange_gain_loss_account,
      paid_amount: form.paid_amount,
      received_amount: form.received_amount,
      references: form.references.map((r) => ({
        row_id: r.row_id,
        reference_doctype: "Sales Invoice",
        reference_name: r.reference_name,
        allocated_amount: r.allocated_amount,
      })),
    };
  }

  const act = (action: "create" | "save" | "submit" | "cancel") =>
    doc.act(action, {
      doctype: "Payment Entry",
      name: form.name,
      buildDocument,
      summary: { customer: form.party, amount: (Number(form.paid_amount) || 0).toFixed(2) },
    });

  async function loadDoc(name: string) {
    await doc.load(async () => {
      const fetched = await api.getDocument<Record<string, unknown>>("Payment Entry", name);
      const data = fetched.data;
      const refs = Array.isArray(data.references) ? (data.references as Record<string, unknown>[]) : [];
      setForm({
        name: fetched.name,
        company: String(data.company ?? ""),
        currency: String(data.currency ?? "USD"),
        posting_date: String(data.posting_at ?? today()).slice(0, 10),
        party: String(data.party ?? ""),
        paid_from: String(data.paid_from ?? ""),
        paid_to: String(data.paid_to ?? ""),
        paid_amount: String(data.paid_amount ?? "0"),
        received_amount: String(data.received_amount ?? data.paid_amount ?? "0"),
        exchange_gain_loss_account: String(data.exchange_gain_loss_account ?? "Exchange Gain Loss"),
        references: refs.length
          ? refs.map((r, i) => ({
              row_id: String(r.row_id ?? `REF-${i + 1}`),
              reference_name: String(r.reference_name ?? ""),
              allocated_amount: String(r.allocated_amount ?? "0"),
            }))
          : [{ row_id: "REF-1", reference_name: "", allocated_amount: "0" }],
      });
      return {
        doctype: "Payment Entry",
        name: fetched.name,
        version: fetched.version,
        docstatus: fetched.docstatus,
        summary: { customer: String(data.party ?? ""), amount: String(data.paid_amount ?? "") },
      };
    });
  }

  useEffect(() => {
    if (!seed || seed.token === consumed.current) return;
    if (seed.kind === "new-payment") {
      consumed.current = seed.token;
      doc.reset();
      setForm((f) => ({
        name: newId("PE"),
        company: seed.prefill.company,
        currency: seed.prefill.currency,
        posting_date: today(),
        party: seed.prefill.party,
        paid_from: seed.prefill.paid_from,
        paid_to: f.paid_to, // keep last-used bank account
        paid_amount: seed.prefill.amount,
        received_amount: seed.prefill.amount,
        exchange_gain_loss_account: f.exchange_gain_loss_account,
        references: seed.prefill.references.map((r, i) => ({
          row_id: `REF-${i + 1}`,
          reference_name: r.reference_name,
          allocated_amount: r.allocated_amount,
        })),
      }));
    } else if (seed.kind === "open" && seed.doctype === "Payment Entry") {
      consumed.current = seed.token;
      void loadDoc(seed.name);
    }
  }, [seed]);

  function startNew() { setForm(freshForm()); doc.reset(); }
  function patch(p: Partial<Form>) { setForm((f) => ({ ...f, ...p })); }
  function patchRef(i: number, p: Partial<Reference>) {
    setForm((f) => ({ ...f, references: f.references.map((r, idx) => (idx === i ? { ...r, ...p } : r)) }));
  }
  function addRef() { setForm((f) => ({ ...f, references: [...f.references, { row_id: `REF-${f.references.length + 1}`, reference_name: "", allocated_amount: "0" }] })); }
  function removeRef(i: number) { setForm((f) => ({ ...f, references: f.references.filter((_, idx) => idx !== i) })); }

  const editable = doc.isDraft || !doc.created;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Payment Entry</h2>
        <DocStatusBadge docstatus={doc.docstatus} />
        {doc.version !== null && <span className="text-sm text-muted-foreground">version {doc.version}</span>}
        <Button size="sm" variant="outline" className="ml-auto" onClick={startNew}>New</Button>
      </div>

      <BannerView banner={doc.banner} pending={doc.pending} onRetry={doc.retry} />

      <p className="text-xs text-muted-foreground">Gate 3 O2C slice: <span className="font-medium">Receive</span> payments from a <span className="font-medium">Customer</span> against submitted Sales Invoices only.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name (client-generated)"><Input value={form.name} disabled /></Field>
        <Field label="Customer (party)"><Input value={form.party} disabled={!editable} onChange={(e) => patch({ party: e.target.value })} /></Field>
        <Field label="Company"><Input value={form.company} disabled={doc.created} onChange={(e) => patch({ company: e.target.value })} /></Field>
        <Field label="Currency"><Input value={form.currency} disabled={doc.created} onChange={(e) => patch({ currency: e.target.value })} /></Field>
        <Field label="Receivable account (paid from)"><Input value={form.paid_from} disabled={!editable} onChange={(e) => patch({ paid_from: e.target.value })} /></Field>
        <Field label="Bank/cash account (paid to)"><Input value={form.paid_to} disabled={!editable} onChange={(e) => patch({ paid_to: e.target.value })} /></Field>
        <Field label="Paid amount" hint="Transaction / invoice currency"><Input value={form.paid_amount} disabled={!editable} onChange={(e) => patch({ paid_amount: e.target.value })} /></Field>
        <Field label="Received amount" hint="Company / bank currency; may differ for FX"><Input value={form.received_amount} disabled={!editable} onChange={(e) => patch({ received_amount: e.target.value })} /></Field>
        <Field label="Exchange gain/loss account"><Input value={form.exchange_gain_loss_account} disabled={!editable} onChange={(e) => patch({ exchange_gain_loss_account: e.target.value })} /></Field>
        <Field label="Posting date"><Input type="date" value={form.posting_date} disabled={!editable} onChange={(e) => patch({ posting_date: e.target.value })} /></Field>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label>Allocate to Sales Invoices</Label>
          {editable && <Button size="sm" variant="ghost" onClick={addRef}>+ Row</Button>}
        </div>
        <Table className="border border-border rounded-md">
          <TableHeader>
            <TableRow><TableHead>Sales Invoice</TableHead><TableHead>Allocated</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {form.references.map((r, i) => (
              <TableRow key={r.row_id}>
                <TableCell><Input value={r.reference_name} disabled={!editable} onChange={(e) => patchRef(i, { reference_name: e.target.value })} placeholder="SI-…" /></TableCell>
                <TableCell><Input value={r.allocated_amount} disabled={!editable} onChange={(e) => patchRef(i, { allocated_amount: e.target.value })} /></TableCell>
                <TableCell>{editable && form.references.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeRef(i)}>✕</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-1 space-y-0.5 text-right text-sm text-muted-foreground">
          <p>Allocated <span className="tabular-nums text-foreground">{allocated.toFixed(2)}</span></p>
          <p className={unallocated < 0 ? "text-destructive" : ""}>
            Unallocated <span className="tabular-nums font-medium text-foreground">{unallocated.toFixed(2)}</span>
          </p>
        </div>
        {unallocated < 0 && <p className="mt-1 text-right text-xs text-destructive">Allocated exceeds paid amount — the server will reject this.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {!doc.created && <Button disabled={doc.busy} onClick={() => act("create")}>Create</Button>}
        {doc.created && doc.isDraft && <Button disabled={doc.busy} variant="secondary" onClick={() => act("save")}>Save draft</Button>}
        {doc.created && doc.isDraft && <Button disabled={doc.busy} onClick={() => act("submit")}>Submit</Button>}
        {doc.created && doc.isSubmitted && <Button disabled={doc.busy} variant="destructive" onClick={() => act("cancel")}>Cancel</Button>}
        {doc.created && <Button disabled={doc.busy} variant="outline" onClick={() => loadDoc(form.name)}>Reload</Button>}
      </div>
    </div>
  );
}
