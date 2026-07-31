import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { afterEach, expect, test } from "vitest";

const tenantId = "demo";
const invoiceName = "SI-AGING-WORKER-1";
const documentKey = `Sales Invoice:${invoiceName}`;

async function cleanup(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM payment_ledger_entries WHERE tenant_id=?1 AND against_voucher_type='Sales Invoice' AND against_voucher_no=?2",
    ).bind(tenantId, invoiceName),
    env.DB.prepare("DELETE FROM documents WHERE tenant_id=?1 AND doc_key=?2").bind(tenantId, documentKey),
  ]);
}

afterEach(cleanup);

test("AR aging runs through Query Worker and applies the as-of cutoff", async () => {
  await cleanup();

  const payload = JSON.stringify({
    customer: "CUST-WORKER",
    company: "Demo Company",
    currency: "VND",
    currency_scale: 0,
    posting_at: "2026-06-01T08:00:00.000Z",
    due_date: "2026-07-10",
    debit_to: "131-CONG-NO",
    grand_total_minor: 1000,
  });

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO documents
       (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json)
       VALUES(?1,?2,'Sales Invoice',?3,'Administrator',1,'Unpaid',1,?4,?4,?5)`,
    ).bind(tenantId, documentKey, invoiceName, "2026-06-01T08:00:00.000Z", payload),
    env.DB.prepare(
      `INSERT INTO payment_ledger_entries
       (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,
        amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
       VALUES(?1,'Sales Invoice',?2,1,'RECEIVABLE','Receivable','Customer','CUST-WORKER','131-CONG-NO',
        1000,'VND',0,'Sales Invoice',?2,'2026-06-01T08:00:00.000Z',1000)`,
    ).bind(tenantId, invoiceName),
    env.DB.prepare(
      `INSERT INTO payment_ledger_entries
       (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,
        amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
       VALUES(?1,'Payment Entry','PE-AGING-BEFORE',1,'ALLOC-1','Receivable','Customer','CUST-WORKER','131-CONG-NO',
        -300,'VND',0,'Sales Invoice',?2,'2026-07-20T08:00:00.000Z',-300)`,
    ).bind(tenantId, invoiceName),
    env.DB.prepare(
      `INSERT INTO payment_ledger_entries
       (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,
        amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
       VALUES(?1,'Payment Entry','PE-AGING-AFTER',1,'ALLOC-1','Receivable','Customer','CUST-WORKER','131-CONG-NO',
        -700,'VND',0,'Sales Invoice',?2,'2026-08-05T08:00:00.000Z',-700)`,
    ).bind(tenantId, invoiceName),
  ]);

  const response = await SELF.fetch("https://query.test/api/v1/reports/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      report: "Accounts Receivable Aging",
      filters: [
        { field: "as_of_date", operator: "=", value: "2026-07-31" },
        { field: "voucher_no", operator: "=", value: invoiceName },
      ],
    }),
  });

  expect(response.status).toBe(200);
  const body = await response.json() as {
    prepared: boolean;
    columns: Array<{ field: string }>;
    result: Array<Record<string, unknown>>;
    row_count: number;
  };

  expect(body.prepared).toBe(false);
  expect(body.row_count).toBe(1);
  expect(body.columns.some((column) => column.field === "due_date_source")).toBe(true);
  expect(body.result).toEqual([
    expect.objectContaining({
      voucher_no: invoiceName,
      due_date: "2026-07-10",
      due_date_source: "explicit",
      invoice_total: 1000,
      allocated_amount: 300,
      outstanding_amount: 700,
      days_overdue: 21,
      aging_bucket: "1–30 ngày",
    }),
  ]);
});
