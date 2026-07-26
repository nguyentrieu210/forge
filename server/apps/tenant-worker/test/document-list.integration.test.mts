import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

// The workerd suite runs with the dev Administrator actor, so permission is
// bypassed here (permission denial is covered by the Node service test). These
// tests exercise the REAL D1 SQL: list/count/search/filter/sort/cursor.

interface DocSeed {
  tenant?: string;
  doctype: string;
  name: string;
  docstatus?: number;
  status?: string;
  version?: number;
  modified_at: string;
  payload: Record<string, unknown>;
}

async function insertDoc(seed: DocSeed): Promise<void> {
  const tenant = seed.tenant ?? "demo";
  const key = `${seed.doctype}:${seed.name}`;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO documents
     (tenant_id, doc_key, doctype, name, owner, docstatus, status, version, created_at, modified_at, payload_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
  ).bind(
    tenant, key, seed.doctype, seed.name, "Administrator",
    seed.docstatus ?? 1, seed.status ?? "Submitted", seed.version ?? 2,
    seed.modified_at, seed.modified_at, JSON.stringify(seed.payload),
  ).run();
}

async function list(body: unknown): Promise<Response> {
  return exports.default.fetch(new Request("https://tenant.test/api/v1/documents/list", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}
async function count(body: unknown): Promise<Response> {
  return exports.default.fetch(new Request("https://tenant.test/api/v1/documents/count", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

const AT = "2026-07-20T10:00:00.000Z";

beforeAll(async () => {
  // Four doctypes, one marked row each (customer/party = "DT4") for the per-doctype test.
  await insertDoc({ doctype: "Sales Order", name: "SO-DT4", modified_at: AT, payload: { customer: "DT4", company: "Demo", currency: "USD", grand_total: "100.00", transaction_date: "2026-07-19" } });
  await insertDoc({ doctype: "Delivery Note", name: "DN-DT4", modified_at: AT, payload: { customer: "DT4", company: "Demo", currency: "USD", against_sales_order: "SO-DT4", posting_at: AT } });
  await insertDoc({ doctype: "Sales Invoice", name: "SI-DT4", modified_at: AT, payload: { customer: "DT4", company: "Demo", currency: "USD", against_sales_order: "SO-DT4", grand_total: "100.00", posting_at: AT } });
  await insertDoc({ doctype: "Payment Entry", name: "PE-DT4", modified_at: AT, payload: { party: "DT4", company: "Demo", currency: "USD", payment_type: "Receive", party_type: "Customer", paid_amount: "100.00", posting_at: AT } });

  // A filter/search/sort set of Sales Orders under customer "FLT".
  await insertDoc({ doctype: "Sales Order", name: "SO-FLT-DRAFT", docstatus: 0, status: "Draft", modified_at: "2026-07-21T01:00:00.000Z", payload: { customer: "FLT", company: "Demo", currency: "USD", grand_total: "10.00" } });
  await insertDoc({ doctype: "Sales Order", name: "SO-FLT-SUB-A", docstatus: 1, modified_at: "2026-07-21T02:00:00.000Z", payload: { customer: "FLT", company: "Demo", currency: "USD", grand_total: "20.00" } });
  await insertDoc({ doctype: "Sales Order", name: "SO-FLT-SUB-B", docstatus: 1, modified_at: "2026-07-21T03:00:00.000Z", payload: { customer: "FLTOTHER", company: "Demo", currency: "USD", grand_total: "30.00" } });

  // Five paging rows, all with the SAME modified_at, to prove a stable keyset order.
  for (const suffix of ["a", "b", "c", "d", "e"]) {
    await insertDoc({ doctype: "Sales Order", name: `SO-PAGE-${suffix}`, modified_at: "2026-07-22T00:00:00.000Z", payload: { customer: "PAGE", company: "Demo", currency: "USD", grand_total: "1.00" } });
  }

  // A different tenant's row that must never leak into demo.
  await insertDoc({ tenant: "other", doctype: "Sales Order", name: "SO-OTHER", modified_at: AT, payload: { customer: "PAGE", company: "Demo", currency: "USD", grand_total: "9.00" } });

  // Nullable-sort completeness: two docs WITH transaction_date, two WITHOUT (key absent).
  await insertDoc({ doctype: "Sales Order", name: "NS-1", modified_at: "2026-07-23T01:00:00.000Z", payload: { customer: "NULLSORT", company: "Demo", currency: "USD", grand_total: "1.00", transaction_date: "2026-01-03" } });
  await insertDoc({ doctype: "Sales Order", name: "NS-2", modified_at: "2026-07-23T02:00:00.000Z", payload: { customer: "NULLSORT", company: "Demo", currency: "USD", grand_total: "1.00", transaction_date: "2026-01-01" } });
  await insertDoc({ doctype: "Sales Order", name: "NS-3", modified_at: "2026-07-23T03:00:00.000Z", payload: { customer: "NULLSORT", company: "Demo", currency: "USD", grand_total: "1.00" } });
  await insertDoc({ doctype: "Sales Order", name: "NS-4", modified_at: "2026-07-23T04:00:00.000Z", payload: { customer: "NULLSORT", company: "Demo", currency: "USD", grand_total: "1.00" } });
});

function b64url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("document list/search over real workerd D1", () => {
  it("lists each of the four doctypes with its projected fields", async () => {
    for (const [doctype, key] of [["Sales Order", "customer"], ["Delivery Note", "customer"], ["Sales Invoice", "customer"], ["Payment Entry", "party"]] as const) {
      const response = await list({ doctype, filters: [{ field: key, operator: "eq", value: "DT4" }] });
      expect(response.status).toBe(200);
      const body = await response.json() as { rows: Array<Record<string, unknown>>; has_more: boolean };
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]!.name).toBe(`${doctype.split(" ").map((w) => w[0]).join("")}-DT4`);
      expect(body.rows[0]!.version).toBe(2);
      expect(body.has_more).toBe(false);
    }
  });

  it("count matches the list predicate (filtered and unfiltered)", async () => {
    const allResp = await count({ doctype: "Sales Order", filters: [{ field: "customer", operator: "in", value: ["FLT", "FLTOTHER"] }] });
    expect((await allResp.json() as { count: number }).count).toBe(3);
    const submitted = await count({ doctype: "Sales Order", filters: [{ field: "customer", operator: "in", value: ["FLT", "FLTOTHER"] }, { field: "docstatus", operator: "eq", value: 1 }] });
    expect((await submitted.json() as { count: number }).count).toBe(2);
  });

  it("filters by docstatus", async () => {
    const response = await list({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: "FLT" }, { field: "docstatus", operator: "eq", value: 1 }] });
    const body = await response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows.map((r) => r.name)).toEqual(["SO-FLT-SUB-A"]);
  });

  it("searches only within the searchFields", async () => {
    // "FLTOTHER" matches the customer of SO-FLT-SUB-B only.
    const response = await list({ doctype: "Sales Order", search: "FLTOTHER" });
    const body = await response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows.map((r) => r.name)).toEqual(["SO-FLT-SUB-B"]);
  });

  it("sorts by name ascending when requested", async () => {
    const response = await list({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: "PAGE" }], sort: [{ field: "name", direction: "asc" }], limit: 10 });
    const body = await response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows.map((r) => r.name)).toEqual(["SO-PAGE-a", "SO-PAGE-b", "SO-PAGE-c", "SO-PAGE-d", "SO-PAGE-e"]);
  });

  it("paginates by cursor with no duplicates or skips, stable across equal modified_at", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const response: Response = await list({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: "PAGE" }], limit: 2, cursor });
      const body = await response.json() as { rows: Array<Record<string, unknown>>; next_cursor: string | null; has_more: boolean };
      seen.push(...body.rows.map((r) => String(r.name)));
      if (!body.has_more) break;
      cursor = body.next_cursor;
      expect(cursor).toBeTruthy();
    }
    // all five, each exactly once, default sort = modified_at desc, name desc
    expect(seen).toEqual(["SO-PAGE-e", "SO-PAGE-d", "SO-PAGE-c", "SO-PAGE-b", "SO-PAGE-a"]);
    expect(new Set(seen).size).toBe(5);
  });

  it("never returns another tenant's rows and ignores a client-supplied tenant", async () => {
    const response = await list({ doctype: "Sales Order", tenant_id: "other", filters: [{ field: "customer", operator: "eq", value: "PAGE" }], limit: 50 });
    const body = await response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows.every((r) => String(r.name).startsWith("SO-PAGE-"))).toBe(true);
    expect(body.rows.some((r) => r.name === "SO-OTHER")).toBe(false);
  });

  it("rejects an invalid cursor with 422 and no raw error", async () => {
    const response = await list({ doctype: "Sales Order", cursor: "!!!not-a-cursor!!!" });
    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string }; trace_id: string };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.trace_id).toBeTruthy();
  });

  it("treats a SQL-injection filter value as data only (no rows, table intact)", async () => {
    const evil = "'; DROP TABLE documents;--";
    const response = await list({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: evil }] });
    expect(response.status).toBe(200);
    expect((await response.json() as { rows: unknown[] }).rows).toHaveLength(0);
    // the table still exists and still serves rows
    const after = await count({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: "PAGE" }] });
    expect((await after.json() as { count: number }).count).toBe(5);
  });

  it("rejects a field outside the whitelist with 422", async () => {
    const response = await list({ doctype: "Sales Order", fields: ["name", "payload_json"] });
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("paginating by a NULLABLE sort field returns ALL rows (no silent skip of NULL-valued docs)", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 12; guard += 1) {
      const response: Response = await list({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: "NULLSORT" }], sort: [{ field: "transaction_date", direction: "desc" }], limit: 1, cursor });
      const body = await response.json() as { rows: Array<Record<string, unknown>>; next_cursor: string | null; has_more: boolean };
      seen.push(...body.rows.map((r) => String(r.name)));
      if (!body.has_more) break;
      cursor = body.next_cursor;
    }
    // both dated docs AND both NULL-transaction_date docs must appear, each once
    expect(new Set(seen)).toEqual(new Set(["NS-1", "NS-2", "NS-3", "NS-4"]));
    expect(seen.length).toBe(4);
  });

  it("rejects a forged cursor with non-scalar key values as 422, not a 500", async () => {
    const forged = b64url(JSON.stringify({ v: 1, s: "modified_at:desc,name:desc", k: [{}, {}] }));
    const response = await list({ doctype: "Sales Order", cursor: forged });
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an IN combination that would exceed the D1 bind-parameter cap with 422", async () => {
    const values = Array.from({ length: 50 }, (_, i) => `x${i}`);
    const response = await list({ doctype: "Sales Order", filters: [
      { field: "customer", operator: "in", value: values },
      { field: "company", operator: "in", value: values },
    ] });
    expect(response.status).toBe(422);
  });
});
